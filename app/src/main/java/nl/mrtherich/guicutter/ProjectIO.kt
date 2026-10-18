package nl.mrtherich.guicutter

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.webkit.WebResourceResponse
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.Locale

/** SAF workspace. No broad storage permission and no external server. */
class ProjectIO(private val context: Context, private val storage: StorageAccess) {
    private val resolver get() = context.contentResolver
    private val manifestName = "ui_slices.json"
    private val imageName = "base.png"
    private val filenamePattern = Regex("[^A-Za-z0-9_-]")

    private fun root(): DocumentFile = storage.getUri()?.let { DocumentFile.fromTreeUri(context, it) }
        ?: error("Choose a project folder first")
    private fun folder(name: String): DocumentFile {
        val parent = root()
        return parent.findFile(name) ?: parent.createDirectory(name) ?: error("Cannot create $name")
    }
    private fun file(parent: DocumentFile, name: String, mime: String): DocumentFile {
        return parent.findFile(name) ?: parent.createFile(mime, name) ?: error("Cannot create $name")
    }
    private fun write(uri: Uri, input: InputStream) {
        resolver.openOutputStream(uri, "rwt")?.use { input.copyTo(it) } ?: error("Cannot write $uri")
    }
    fun hasBase(): Boolean = storage.getUri()?.let { DocumentFile.fromTreeUri(context, it)?.findFile(imageName)?.isFile } == true
    fun imageStamp(): String {
        val f = storage.getUri()?.let { DocumentFile.fromTreeUri(context, it)?.findFile(imageName) }
        return if (f == null) "none" else "${f.lastModified()}-${f.length()}"
    }
    fun projectKey(): String {
        val id = (storage.getUri()?.toString() ?: "none") + "/" + imageStamp()
        return MessageDigest.getInstance("SHA-256").digest(id.toByteArray()).take(12)
            .joinToString("") { "%02x".format(it) }
    }
    fun baseResponse(): WebResourceResponse? {
        val f = storage.getUri()?.let { DocumentFile.fromTreeUri(context, it)?.findFile(imageName) } ?: return null
        val stream = resolver.openInputStream(f.uri) ?: return null
        return WebResourceResponse("image/png", null, stream).apply {
            responseHeaders = mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff")
        }
    }
    fun readManifest(): String {
        val f = root().findFile(manifestName) ?: return ""
        return resolver.openInputStream(f.uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            ?: error("Cannot read manifest")
    }
    fun importImage(uri: Uri) {
        val source = resolver.openInputStream(uri) ?: error("Cannot open selected image")
        val bitmap = source.use { BitmapFactory.decodeStream(it) } ?: error("Not a supported image")
        check(bitmap.width in 1..16000 && bitmap.height in 1..16000 && bitmap.width.toLong() * bitmap.height <= 32_000_000L) {
            "Image too large (maximum 32 megapixels)"
        }
        val temp = File.createTempFile("guicutter-image-", ".png", context.cacheDir)
        try {
            temp.outputStream().buffered().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) { "Cannot encode PNG" } }
            val root = root()
            val base = file(root, imageName, "image/png")
            temp.inputStream().use { write(base.uri, it) }
            // Replacing an image starts a new project. Old exports remain until manually cleaned up.
            val empty = JSONObject().put("image_path", imageName).put("assets", JSONArray()).toString(2)
            val manifest = file(root, manifestName, "application/json")
            empty.byteInputStream().use { write(manifest.uri, it) }
            DevLog.write("PROJECT", "Imported base image ${bitmap.width}x${bitmap.height}")
        } finally { bitmap.recycle(); temp.delete() }
    }
    fun inspectFiles(): JSONArray {
        val result = JSONArray()
        val parent = root()
        for (name in listOf(imageName, manifestName)) {
            val f = parent.findFile(name) ?: continue
            result.put(JSONObject().put("name", name).put("size", f.length()).put("openable", name == imageName))
        }
        val exports = parent.findFile("exports")
        exports?.listFiles()?.filter { it.isFile }?.sortedBy { it.name }?.forEach { f ->
            result.put(JSONObject().put("name", "exports/${f.name}").put("size", f.length())
                .put("openable", f.name?.endsWith(".png", ignoreCase = true) == true))
        }
        return result
    }
    fun findOpenable(name: String): Uri {
        if (name == imageName) return root().findFile(imageName)?.uri ?: error("No base image")
        check(name.startsWith("exports/") && !name.drop(8).contains('/') &&
            name.drop(8).matches(Regex("[A-Za-z0-9_-]+\\.png"))) { "Invalid export name" }
        return root().findFile("exports")?.findFile(name.drop(8))?.uri ?: error("Export does not exist")
    }

    private data class Crop(val id: String, val name: String, val x: Int, val y: Int, val w: Int, val h: Int)
    private fun parseAssets(array: JSONArray, iw: Int, ih: Int): List<Crop> {
        check(array.length() <= 2000) { "Too many assets" }
        val ids = mutableSetOf<String>()
        val names = mutableSetOf<String>()
        return (0 until array.length()).map { index ->
            val a = array.getJSONObject(index)
            val id = a.getString("asset_id").trim()
            check(id.isNotEmpty() && id.length <= 120 && ids.add(id)) { "Duplicate or invalid asset name: $id" }
            val name = filenamePattern.replace(id, "_") + ".png"
            check(names.add(name.lowercase(Locale.ROOT))) { "Export names collide: $name" }
            val kind = a.getString("kind")
            check(kind == "normal" || kind == "nine_slice") { "Unknown crop type: $kind" }
            val x = a.getInt("x"); val y = a.getInt("y")
            val w = a.getInt("w"); val h = a.getInt("h")
            check(x >= 0 && y >= 0 && w > 0 && h > 0 && x.toLong()+w <= iw && y.toLong()+h <= ih) {
                "Crop outside image: $id" }
            if (kind == "nine_slice") {
                val l=a.optInt("left"); val r=a.optInt("right")
                val t=a.optInt("top"); val b=a.optInt("bottom")
                check(l >= 0 && r >= 0 && l+r < w && t >= 0 && b >= 0 && t+b < h) {
                    "Invalid nine-slice margins: $id" }
            }
            Crop(id,name,x,y,w,h)
        }
    }
    /** Prepare all PNGs in cache before touching the user folder; write manifest last. */
    fun saveProject(text: String): Int {
        val input = JSONObject(text)
        val array = input.getJSONArray("assets")
        val base = root().findFile(imageName) ?: error("No base.png in the selected folder")
        val source = resolver.openInputStream(base.uri) ?: error("Unable to read base.png")
        val bitmap = source.use { BitmapFactory.decodeStream(it) } ?: error("Could not decode base.png")
        val crops = parseAssets(array, bitmap.width, bitmap.height)
        val previous = try { JSONObject(readManifest()).optJSONArray("assets") } catch (_: Exception) { null }
        val managedBefore = mutableSetOf<String>()
        if (previous != null) for (i in 0 until previous.length()) {
            val id = previous.optJSONObject(i)?.optString("asset_id") ?: continue
            managedBefore.add(filenamePattern.replace(id, "_") + ".png")
        }
        val staging = File(context.cacheDir, "slice-pending")
        staging.deleteRecursively();check(staging.mkdirs()) { "Cannot prepare export directory" }
        try {
            for (a in crops) {
                val crop = Bitmap.createBitmap(bitmap, a.x,a.y,a.w,a.h)
                try { File(staging,a.name).outputStream().buffered().use { out ->
                    check(crop.compress(Bitmap.CompressFormat.PNG,100,out)) { "Failed to encode ${a.id}" }
                } } finally { if (crop !== bitmap) crop.recycle() }
            }
            val export = folder("exports")
            for (a in crops) {
                val target = file(export,a.name,"image/png")
                File(staging,a.name).inputStream().use { write(target.uri,it) }
            }
            // The manifest is the source of truth. Never delete unrelated PNG files.
            val manifest = JSONObject().put("image_path",imageName).put("assets",array).toString(2)
            val target = file(root(),manifestName,"application/json")
            manifest.byteInputStream(Charsets.UTF_8).use { write(target.uri,it) }
            val current = crops.map { it.name }.toSet()
            for (name in managedBefore - current) {
                try { export.findFile(name)?.delete() }
                catch (e: Exception) { DevLog.write("PROJECT", "Cannot remove old export $name: ${e.message}") }
            }
            DevLog.write("PROJECT", "Saved ${crops.size} crops and manifest")
            return crops.size
        } finally { bitmap.recycle();staging.deleteRecursively() }
    }
}