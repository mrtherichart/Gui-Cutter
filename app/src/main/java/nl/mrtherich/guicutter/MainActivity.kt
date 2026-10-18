package nl.mrtherich.guicutter

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private companion object {
        const val HOME_URL = "https://appassets.androidplatform.net/assets/index.html"
    }

    lateinit var updates: UpdateService
        private set
    private lateinit var storage: StorageAccess
    private lateinit var webView: WebView

    private val folderPicker = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            try {
                contentResolver.takePersistableUriPermission(uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                storage.saveUri(uri)
                sendEvent("workspace", JSONObject().put("message", "Folder selected: ${storage.folderName()}"))
            } catch (e: Exception) {
                DevLog.write("STORAGE", e.stackTraceToString())
                sendEvent("workspace", JSONObject().put("message", "Folder selection failed: ${e.message}"))
            }
        } else {
            sendEvent("workspace", JSONObject().put("message", "Folder selection cancelled"))
        }
        sendEvent("status", statusPayload())
    }

    private val logExporter = registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) {
            try {
                contentResolver.openOutputStream(uri, "wt")?.use {
                    it.write(DevLog.snapshot().toByteArray(Charsets.UTF_8))
                } ?: error("Could not write log")
                sendEvent("log", JSONObject().put("message", "Development log exported"))
            } catch (e: Exception) {
                DevLog.write("LOG", e.stackTraceToString())
                sendEvent("log", JSONObject().put("message", "Log export failed: ${e.message}"))
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DevLog.initialize(applicationContext)
        DevLog.write("APP", "Starting ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        if (BuildConfig.DEV_LOGS_ENABLED) {
            val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread, error ->
                DevLog.write("CRASH", "${thread.name}: ${error.stackTraceToString()}")
                previousHandler?.uncaughtException(thread, error)
            }
        }
        storage = StorageAccess(this)
        updates = UpdateService(this)

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            overScrollMode = WebView.OVER_SCROLL_NEVER
            addJavascriptInterface(NativeBridge(this@MainActivity), "NativeAndroid")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                    request?.let { assets.shouldInterceptRequest(it.url) }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return request?.url?.toString() != HOME_URL
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    if (url == HOME_URL) sendEvent("status", statusPayload())
                }

                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame == true)
                        DevLog.write("WEBVIEW", "${error?.errorCode}: ${error?.description}")
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR ||
                        message.messageLevel() == ConsoleMessage.MessageLevel.WARNING) {
                        DevLog.write("CONSOLE", "${message.sourceId()}:${message.lineNumber()} ${message.message()}")
                    }
                    return true
                }
            }
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(webView)
        webView.loadUrl(HOME_URL)
    }

    fun statusPayload() = JSONObject()
        .put("version", BuildConfig.VERSION_NAME)
        .put("versionCode", BuildConfig.VERSION_CODE)
        .put("folder", storage.folderName())
        .put("logsEnabled", BuildConfig.DEV_LOGS_ENABLED)
        .put("platform", "android")

    fun sendEvent(type: String, payload: JSONObject) {
        runOnUiThread {
            if (!::webView.isInitialized) return@runOnUiThread
            val script = "window.GuiCutterReceive && window.GuiCutterReceive(${JSONObject.quote(type)}, ${payload});"
            webView.evaluateJavascript(script, null)
        }
    }

    fun chooseFolder() {
        folderPicker.launch(null)
    }

    fun testFolder() {
        // A tiny write can still block a slow cloud DocumentsProvider; use a worker.
        Thread {
            val result = try { storage.testFolder() } catch (e: Exception) {
                DevLog.write("STORAGE", e.stackTraceToString())
                "Folder test failed: ${e.message}"
            }
            sendEvent("workspace", JSONObject().put("message", result))
        }.start()
    }

    fun exportLog() = logExporter.launch("Gui-Cutter-devlog.txt")

    override fun onDestroy() {
        updates.close()
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("NativeAndroid")
            webView.destroy()
        }
        super.onDestroy()
    }
}
