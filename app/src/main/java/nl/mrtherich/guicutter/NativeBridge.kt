package nl.mrtherich.guicutter

import android.webkit.JavascriptInterface

/** Minimal native capabilities, exposed only to packaged WebView content. */
class NativeBridge(private val activity: MainActivity) {
    @JavascriptInterface fun appStatus(): String = activity.statusPayload().toString()
    @JavascriptInterface fun setUiTheme(mode: String) = activity.runOnUiThread { activity.applyBars(mode) }
    @JavascriptInterface fun chooseFolder() = activity.runOnUiThread { activity.chooseFolder() }
    @JavascriptInterface fun createProject(name:String) = activity.createProject(name)
    @JavascriptInterface fun openProject(id:String) = activity.openProject(id)
    @JavascriptInterface fun listProjects() = activity.listProjects()
    @JavascriptInterface fun newFromImage() = activity.runOnUiThread { activity.newFromImage() }
    @JavascriptInterface fun exportProjectZip() = activity.runOnUiThread { activity.exportProjectZip() }
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