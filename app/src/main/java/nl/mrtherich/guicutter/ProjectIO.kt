package nl.mrtherich.guicutter

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.DocumentsContract
import android.webkit.WebResourceResponse
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** SAF workspace. No broad storage permission and no external server. */
class ProjectIO(private val context: Context, private val storage: StorageAccess) {
    private val resolver get() = context.contentResolver
    private val manifestName = "ui_slices.json"
    private val imageName = "base.png"
    private val filenamePattern = Regex("[^A-Za-z0-9_-]")

    private fun root(): DocumentFile = storage.activeProject()
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
    fun hasBase(): Boolean = try { root().findFile(imageName)?.isFile == true } catch (_:Exception){ false }
    fun imageStamp(): String {
        val f = try { root().findFile(imageName) } catch (_:Exception) { null }
        return if (f == null) "none" else "${f.lastModified()}-${f.length()}"
    }
    fun projectKey(): String {
        val id = (storage.getUri()?.toString() ?: "none") + "/" + imageStamp()
        return MessageDigest.getInstance("SHA-256").digest(id.toByteArray()).take(12)
            .joinToString("") { "%02x".format(it) }
    }
    fun baseResponse(): WebResourceResponse? {
        val f = try { root().findFile(imageName) } catch (_:Exception) { null } ?: return null
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
    /** Creates a recognizable empty project, allowing image import later. */
    fun initializeProject() {
        val project=root()
        check(project.findFile(manifestName)==null) { "Project already initialized" }
        val empty=JSONObject().put("image_path",imageName).put("assets",JSONArray()).toString(2)
        val target=file(project,manifestName,"application/json")
        empty.byteInputStream(Charsets.UTF_8).use { write(target.uri,it) }
    }

    /** ZIP is built with Android's standard Java ZIP implementation; no external dependency. */
    fun exportZip(destination: Uri): Int {
        val project=root()
        check(project.findFile(manifestName)?.isFile==true) { "Save the project before exporting a ZIP" }
        check(project.findFile(imageName)?.isFile==true) { "This project needs a base image" }
        val out=resolver.openOutputStream(destination,"wt") ?: error("Cannot create ZIP")
        val zipRoot=(project.name?:"Gui-Cutter-project").replace('/', '_') + "/"
        var files=0
        val visited=mutableSetOf<String>()
        ZipOutputStream(out.buffered()).use { zip ->
            fun append(dir:DocumentFile,prefix:String,depth:Int) {
                check(depth<=10) { "Project folder is nested too deeply" }
                for(child in dir.listFiles().sortedBy{it.name}){
                    if(child.uri==destination)continue
                    val name=(child.name?:continue).replace('/', '_').replace(92.toChar(),'_')
                    if(name=="."||name==".."||name.isBlank())continue
                    val entryName=prefix+name+(if(child.isDirectory)"/" else "")
                    check(visited.add(entryName)) { "Duplicate ZIP entry: $entryName" }
                    if(child.isDirectory){
                        zip.putNextEntry(ZipEntry(entryName));zip.closeEntry()
                        append(child,entryName,depth+1)
                    } else if(child.isFile){
                        check(files<10000) { "Too many files to bundle" }
                        zip.putNextEntry(ZipEntry(entryName))
                        resolver.openInputStream(child.uri)?.use { it.copyTo(zip,64*1024) }
                            ?: error("Cannot read $entryName")
                        zip.closeEntry();files++
                    }
                }
            }
            zip.putNextEntry(ZipEntry(zipRoot));zip.closeEntry()
            append(project,zipRoot,0)
        }
        DevLog.write("EXPORT","Bundled $files files into ZIP")
        return files
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
        val exports = parent.findFile("exports") ?: return result
        // One provider query instead of DocumentFile.listFiles() followed by an
        // individual metadata query for each exported asset. Keep the fallback
        // for document providers that cannot serve the child-document query.
        val entries = try {
            val parentId = DocumentsContract.getDocumentId(exports.uri)
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(exports.uri, parentId)
            val projection = arrayOf(
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            )
            val found = mutableListOf<Pair<String, Long>>()
            resolver.query(children, projection, null, null, null)?.use { cursor ->
                val nameColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val sizeColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                val mimeColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                while (cursor.moveToNext()) {
                    val mime = if(mimeColumn>=0 && !cursor.isNull(mimeColumn))cursor.getString(mimeColumn) else null
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) continue
                    val name = cursor.getString(nameColumn) ?: continue
                    val size = if(sizeColumn>=0 && !cursor.isNull(sizeColumn))cursor.getLong(sizeColumn) else -1L
                    found.add(name to size)
                }
            } ?: error("Provider did not return a file cursor")
            found
        } catch (e: Exception) {
            DevLog.write("FILES", "Query fallback: ${e.message}")
            exports.listFiles().filter { it.isFile }.map { it.name.orEmpty() to it.length() }
        }
        entries.sortedBy { it.first }.forEach { (name, size) ->
            result.put(JSONObject().put("name", "exports/$name").put("size", size)
                .put("openable", name.endsWith(".png", ignoreCase = true)))
        }
        return result
    }
    fun findOpenable(name: String): Uri {
        if (name == imageName) return root().findFile(imageName)?.uri ?: error("No base image")
        check(name.startsWith("exports/") && !name.drop(8).contains('/') &&
            name.drop(8).matches(Regex("[A-Za-z0-9_-]+\\.png"))) { "Invalid export name" }
        return root().findFile("exports")?.findFile(name.drop(8))?.uri ?: error("Export does not exist")
    }

    private data class Crop(val id: String, val name: String, val x: Int, val y: Int, val w: Int, val h: Int, val transparency: JSONObject?)
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
            Crop(id,name,x,y,w,h,a.optJSONObject("transparency"))
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
                val config=a.transparency ?: input.optJSONObject("transparency")
                val keyed=Transparency.apply(crop,config)
                val processed=EdgeCleanup.apply(keyed,config?.optInt("edgeCleanup",0) ?: 0)
                try { File(staging,a.name).outputStream().buffered().use { out ->
                    check(processed.compress(Bitmap.CompressFormat.PNG,100,out)) { "Failed to encode ${a.id}" }
                } } finally {
                    if (processed !== keyed) processed.recycle()
                    if (keyed !== crop) keyed.recycle()
                    if (crop !== bitmap) crop.recycle()
                }
            }
            val export = folder("exports")
            for (a in crops) {
                val target = file(export,a.name,"image/png")
                File(staging,a.name).inputStream().use { write(target.uri,it) }
            }
            // The manifest is the source of truth. Never delete unrelated PNG files.
            val manifest = JSONObject().put("image_path",imageName).put("assets",array).apply {
                input.optJSONObject("transparency")?.let { put("transparency",it) }
            }.toString(2)
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