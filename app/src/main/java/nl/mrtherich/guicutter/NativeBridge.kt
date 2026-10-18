package nl.mrtherich.guicutter

import android.webkit.JavascriptInterface

/** Minimal native capabilities, exposed only to packaged WebView content. */
class NativeBridge(private val activity: MainActivity) {
    @JavascriptInterface fun appStatus(): String = activity.statusPayload().toString()
    @JavascriptInterface fun chooseFolder() = activity.runOnUiThread { activity.chooseFolder() }
    @JavascriptInterface fun selectImage() = activity.runOnUiThread { activity.selectImage() }
    @JavascriptInterface fun readManifest(): String = activity.projectIO.readManifest()
    @JavascriptInterface fun inspectFiles(): String = activity.projectIO.inspectFiles().toString()
    @JavascriptInterface fun saveProject(json: String) = activity.saveProject(json)
    @JavascriptInterface fun openExport(name: String) = activity.runOnUiThread { activity.openExport(name) }
    @JavascriptInterface fun testFolder() = activity.testFolder()
    @JavascriptInterface fun checkUpdates() = activity.updates.check()
    @JavascriptInterface fun installUpdate() = activity.updates.downloadAndInstall()
    @JavascriptInterface fun exportLog() = activity.runOnUiThread { activity.exportLog() }
    @JavascriptInterface fun jsError(message: String) { DevLog.write("JS", message.take(6000)) }
}