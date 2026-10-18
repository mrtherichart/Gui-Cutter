package nl.mrtherich.guicutter

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Public GitHub Releases only. No app secrets, update website or background polling. */
class UpdateService(private val activity: MainActivity) {
    private val worker = Executors.newSingleThreadExecutor()
    private var offered: Release? = null

    private data class Release(val version: String, val apkUrl: String, val sha256: String?)

    fun check() {
        worker.execute {
            send("checking", "Checking GitHub Releases")
            try {
                val release = fetchRelease()
                if (Versioning.compare(release.version, BuildConfig.VERSION_NAME) > 0) {
                    offered = release
                    send("available", "Version ${release.version} is available", release.version)
                } else {
                    offered = null
                    send("current", "Already on the latest release")
                }
            } catch (e: Exception) {
                DevLog.write("UPDATE", "Check failed: ${e.stackTraceToString()}")
                send("error", "Update check failed: ${e.message ?: "Network error"}")
            }
        }
    }

    fun downloadAndInstall() {
        val release = offered ?: run {
            send("error", "Check for updates first")
            return
        }
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            send("permission", "Allow Gui Cutter to install updates, then tap Install again")
            activity.runOnUiThread {
                val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}"))
                activity.startActivity(intent)
            }
            return
        }
        worker.execute {
            try {
                val file = downloadApk(release)
                val info = activity.packageManager.getPackageArchiveInfo(file.absolutePath, 0)
                    ?: error("Downloaded file is not a valid APK")
                check(info.packageName == activity.packageName) { "APK package does not match this app" }
                @Suppress("DEPRECATION")
                val downloadedCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
                check(downloadedCode > BuildConfig.VERSION_CODE.toLong()) { "APK version is not newer" }
                send("ready", "Android installer is opening")
                activity.runOnUiThread {
                    try {
                        val uri = FileProvider.getUriForFile(activity,
                            "${activity.packageName}.fileprovider", file)
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        activity.startActivity(intent)
                    } catch (e: Exception) {
                        DevLog.write("UPDATE", "Installer failed: ${e.stackTraceToString()}")
                        send("error", "Cannot open installer: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                DevLog.write("UPDATE", "Download failed: ${e.stackTraceToString()}")
                send("error", "Update failed: ${e.message ?: "Download error"}")
            }
        }
    }

    private fun fetchRelease(): Release {
        val request = URL("https://api.github.com/repos/mrtherichart/Gui-Cutter/releases/latest")
            .openConnection() as HttpURLConnection
        request.connectTimeout = 15000
        request.readTimeout = 20000
        request.setRequestProperty("Accept", "application/vnd.github+json")
        request.setRequestProperty("User-Agent", "Gui-Cutter-Android")
        return try {
            check(request.responseCode == 200) { "GitHub responded ${request.responseCode}" }
            val json = JSONObject(request.inputStream.bufferedReader().use { it.readText() })
            val version = json.getString("tag_name")
            check(!json.optBoolean("draft") && !json.optBoolean("prerelease")) { "No stable release" }
            val assets = json.getJSONArray("assets")
            for (i in 0 until assets.length()) {
                val asset = assets.getJSONObject(i)
                if (asset.optString("name") != "Gui-Cutter.apk") continue
                val url = asset.getString("browser_download_url")
                check(url.startsWith("https://github.com/mrtherichart/Gui-Cutter/releases/download/") && url.endsWith("/Gui-Cutter.apk")) {
                    "Unexpected update location"
                }
                val digest = asset.optString("digest").removePrefix("sha256:")
                    .takeIf { it.matches(Regex("[0-9a-fA-F]{64}")) }
                return Release(version, url, digest)
            }
            error("Latest release has no Gui-Cutter.apk asset")
        } finally {
            request.disconnect()
        }
    }

    private fun downloadApk(release: Release): File {
        val folder = File(activity.cacheDir, "updates").apply { mkdirs() }
        val partial = File(folder, "Gui-Cutter.apk.part")
        val completed = File(folder, "Gui-Cutter.apk")
        partial.delete()
        val connection = URL(release.apkUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 20000
        connection.readTimeout = 40000
        connection.setRequestProperty("User-Agent", "Gui-Cutter-Android")
        try {
            check(connection.responseCode == 200) { "APK download returned ${connection.responseCode}" }
            val total = connection.contentLengthLong
            val hash = MessageDigest.getInstance("SHA-256")
            var bytes = 0L
            var lastPercent = -1
            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count == -1) break
                        output.write(buffer, 0, count)
                        hash.update(buffer, 0, count)
                        bytes += count
                        if (total > 0L) {
                            val percent = (bytes * 100L / total).toInt()
                            if (percent / 10 != lastPercent / 10) {
                                lastPercent = percent
                                send("downloading", "Downloading: $percent%")
                            }
                        }
                    }
                }
            }
            check(bytes > 1024) { "The APK download was empty" }
            if (total > 0L) check(bytes == total) { "Incomplete APK download" }
            val actual = hash.digest().joinToString("") { "%02x".format(it) }
            release.sha256?.let { expected ->
                check(actual.equals(expected, ignoreCase = true)) { "APK checksum mismatch" }
            }
            completed.delete()
            check(partial.renameTo(completed)) { "Could not finalize downloaded APK" }
            DevLog.write("UPDATE", "Download verified SHA-256=$actual")
            return completed
        } finally {
            connection.disconnect()
            partial.delete()
        }
    }

    private fun send(state: String, message: String, version: String? = null) {
        val payload = JSONObject().put("state", state).put("message", message)
        if (version != null) payload.put("version", version)
        activity.sendEvent("update", payload)
    }

    fun close() = worker.shutdownNow()
}
