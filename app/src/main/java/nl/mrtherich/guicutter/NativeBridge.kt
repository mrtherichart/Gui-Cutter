package nl.mrtherich.guicutter

import android.webkit.JavascriptInterface

/** Small, explicit JS surface. Only packaged appassets pages may use this bridge. */
class NativeBridge(private val activity: MainActivity) {
    @JavascriptInterface fun appStatus(): String = activity.statusPayload().toString()

    @JavascriptInterface fun chooseFolder() = activity.runOnUiThread { activity.chooseFolder() }

    @JavascriptInterface fun testFolder() = activity.runOnUiThread { activity.testFolder() }

    @JavascriptInterface fun checkUpdates() = activity.updates.check()

    @JavascriptInterface fun installUpdate() = activity.updates.downloadAndInstall()

    @JavascriptInterface fun exportLog() = activity.runOnUiThread { activity.exportLog() }

    @JavascriptInterface fun jsError(message: String) {
        DevLog.write("JS", message)
    }
}
