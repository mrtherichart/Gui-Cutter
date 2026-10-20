package nl.mrtherich.guicutter

import android.annotation.SuppressLint
import android.content.res.Configuration
import android.graphics.Color
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.view.HapticFeedbackConstants
import android.os.Bundle
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private companion object { const val HOME_URL="https://appassets.androidplatform.net/assets/index.html" }
    lateinit var updates: UpdateService
        private set
    private lateinit var storage: StorageAccess
    lateinit var projectIO: ProjectIO
        private set
    private lateinit var webView: WebView
    private val io = Executors.newSingleThreadExecutor()
    private var imageCreatesProject = false
    private var barThemeMode = "system"
    private val themePrefs by lazy { getSharedPreferences("gui-cutter-appearance", MODE_PRIVATE) }
    private fun selectedDark(): Boolean = when (barThemeMode) {
        "dark" -> true
        "light" -> false
        else -> systemDark()
    }
    fun initialSystemDark(): Boolean = systemDark()
    private fun systemDark(): Boolean =
        resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

    fun applyBars(mode: String) {
        barThemeMode = if (mode in listOf("system", "light", "dark")) mode else "system"
        themePrefs.edit().putString("theme-mode", barThemeMode).apply()
        val dark = selectedDark()
        val color = Color.parseColor(if (dark) "#121C2A" else "#EEF3F7")
        if(::webView.isInitialized)webView.setBackgroundColor(color)
        window.statusBarColor = color
        window.navigationBarColor = color
        if (android.os.Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        WindowInsetsControllerCompat(window, webView).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (::webView.isInitialized) {
            applyBars(barThemeMode)
            sendEvent("system-theme", JSONObject().put("dark", systemDark()))
        }
    }

    private val folderPicker = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) try {
            contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            storage.saveUri(uri)
            sendEvent("workspace",JSONObject().put("selected",true).put("message","Work folder: ${storage.folderName()}"))
            listProjects()
        } catch (e: Exception) {
            DevLog.write("STORAGE",e.stackTraceToString())
            sendEvent("workspace",JSONObject().put("message","Folder error: ${e.message}"))
        } else sendEvent("workspace",JSONObject().put("message","Folder selection cancelled"))
        sendEvent("status",statusPayload())
    }
    private val imagePicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val createsProject=imageCreatesProject
        imageCreatesProject=false
        if (uri == null) {
            sendEvent("image",JSONObject().put("ok",false).put("message","Image selection cancelled"))
            return@registerForActivityResult
        }
        io.execute {
            try {
                val name=if(createsProject){
                    val filename=try {
                        contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { cursor ->
                            if(cursor.moveToFirst())cursor.getString(0) else null
                        }
                    } catch (_: Exception){null}
                    val suggested=(filename ?: "Untitled").substringBeforeLast('.',filename ?: "Untitled").ifBlank { "Untitled" }
                    val project=storage.createProject(suggested)
                    projectIO.initializeProject()
                    project
                }else storage.projectName()
                projectIO.importImage(uri)
                sendEvent("image",JSONObject().put("ok",true).put("name",name))
                sendEvent("status",statusPayload())
                listProjects()
            } catch (e: Exception) {
                DevLog.write("IMAGE",e.stackTraceToString())
                sendEvent("image",JSONObject().put("ok",false).put("message",e.message))
            }
        }
    }
    private val zipExporter = registerForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if(uri == null) {
            sendEvent("zip",JSONObject().put("message","ZIP export cancelled"))
        } else io.execute {
            try {
                val count=projectIO.exportZip(uri)
                sendEvent("zip",JSONObject().put("ok",true).put("count",count)
                    .put("message","Exported ZIP with $count files"))
            }catch(e:Exception){
                DevLog.write("ZIP",e.stackTraceToString())
                sendEvent("zip",JSONObject().put("ok",false).put("message","ZIP export failed: ${e.message}"))
            }
        }
    }
    private val logExporter = registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) io.execute {
            try {
                contentResolver.openOutputStream(uri,"wt")?.use { it.write(DevLog.snapshot().toByteArray()) } ?: error("Cannot write log")
                sendEvent("log",JSONObject().put("message","Development log exported"))
            } catch (e: Exception) {DevLog.write("LOG",e.stackTraceToString());sendEvent("log",JSONObject().put("message","Log export failed: ${e.message}"))}
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DevLog.initialize(applicationContext)
        DevLog.write("APP","Version ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        if (BuildConfig.DEV_LOGS_ENABLED) {
            val old = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread,error ->
                DevLog.write("CRASH","${thread.name}: ${error.stackTraceToString()}")
                old?.uncaughtException(thread,error)
            }
        }
        storage=StorageAccess(this)
        projectIO=ProjectIO(this,storage)
        updates=UpdateService(this)
        val loader=WebViewAssetLoader.Builder()
            .addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/project/",WebViewAssetLoader.PathHandler { path ->
                if (path == "base.png") try { projectIO.baseResponse() } catch (e: Exception) {
                    DevLog.write("IMAGE","Serving base image failed: ${e.message}");null
                } else null
            }).build()

        // Read the last selected theme BEFORE allocating or painting the WebView.
        barThemeMode = themePrefs.getString("theme-mode", "system")?.takeIf { it in listOf("system", "light", "dark") } ?: "system"
        val bootColor = Color.parseColor(if(selectedDark()) "#121C2A" else "#EEF3F7")
        WindowCompat.setDecorFitsSystemWindows(window,false)
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(bootColor))
        webView=WebView(this).apply {
            setBackgroundColor(bootColor)
            settings.javaScriptEnabled=true
            settings.domStorageEnabled=true
            settings.allowFileAccess=false
            settings.allowContentAccess=false
            settings.javaScriptCanOpenWindowsAutomatically=false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode=android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            overScrollMode=WebView.OVER_SCROLL_NEVER
            addJavascriptInterface(NativeBridge(this@MainActivity),"NativeAndroid")
            webViewClient=object : WebViewClient() {
                override fun shouldInterceptRequest(view:WebView?,request:WebResourceRequest?) =
                    request?.let { loader.shouldInterceptRequest(it.url) }
                override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?):Boolean =
                    request?.url?.let { it.scheme != "https" || it.host != "appassets.androidplatform.net" ||
                        !(it.path?.startsWith("/assets/") == true || it.path == "/project/base.png") } ?: true
                override fun onPageFinished(view:WebView?,url:String?) {
                    if (url == HOME_URL) sendEvent("status",statusPayload())
                }
                override fun onReceivedError(view:WebView?,request:WebResourceRequest?,error:WebResourceError?) {
                    if (request?.isForMainFrame==true)DevLog.write("WEBVIEW","${error?.errorCode}: ${error?.description}")
                }
            }
            webChromeClient=object:WebChromeClient() {
                override fun onConsoleMessage(message:ConsoleMessage):Boolean {
                    if (message.messageLevel()==ConsoleMessage.MessageLevel.ERROR || message.messageLevel()==ConsoleMessage.MessageLevel.WARNING)
                        DevLog.write("CONSOLE","${message.sourceId()}:${message.lineNumber()} ${message.message()}")
                    return true
                }
            }
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(webView)
        applyBars(barThemeMode)
        WindowInsetsControllerCompat(window,webView).apply {
            systemBarsBehavior=WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
        onBackPressedDispatcher.addCallback(this, object:OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!::webView.isInitialized) { finish(); return }
                // The WebView gets first refusal: dismiss editing panels before leaving the app.
                webView.evaluateJavascript("Boolean(window.GuiCutterHandleBack && window.GuiCutterHandleBack())") { handled ->
                    if (handled != "true") finish()
                }
            }
        })
        webView.loadUrl(HOME_URL)
    }
    fun statusPayload() = JSONObject()
        .put("version",BuildConfig.VERSION_NAME)
        .put("versionCode",BuildConfig.VERSION_CODE)
        .put("folder",storage.projectName().ifBlank { "No project" })
        .put("projectName",storage.projectName())
        .put("projectId",storage.activeKey()?:"")
        .put("workFolder",storage.folderName())
        .put("hasProject",storage.getUri()!=null)
        .put("hasWorkspace",storage.hasWorkspace())
        .put("hasBase",projectIO.hasBase())
        .put("imageStamp",projectIO.imageStamp())
        .put("projectKey",projectIO.projectKey())
        .put("logsEnabled",BuildConfig.DEV_LOGS_ENABLED)
        .put("systemDark",systemDark())
        .put("platform","android")
    fun sendEvent(type:String,payload:JSONObject) {
        // Serialize on the calling (usually I/O) thread, not while painting UI.
        val js="window.GuiCutterReceive && window.GuiCutterReceive(${JSONObject.quote(type)},$payload);"
        runOnUiThread {
            if (isDestroyed || isFinishing || !::webView.isInitialized)return@runOnUiThread
            webView.evaluateJavascript(js,null)
        }
    }
    fun requestStatus() {
        io.execute {
            try { sendEvent("status", statusPayload()) }
            catch(e:Exception){DevLog.write("STATUS",e.stackTraceToString())}
        }
    }
    fun inspectFilesAsync(request: Int, expectedProjectKey: String) {
        io.execute {
            val payload=JSONObject().put("request",request).put("projectKey",expectedProjectKey)
            try {
                if(projectIO.projectKey()!=expectedProjectKey) return@execute
                payload.put("items",projectIO.inspectFiles())
            } catch(e:Exception) {
                DevLog.write("FILES",e.stackTraceToString())
                payload.put("error",e.message ?: "Unable to inspect files")
            }
            sendEvent("files",payload)
        }
    }
    fun chooseFolder() = folderPicker.launch(null)
    fun selectImage() { imageCreatesProject=false; imagePicker.launch(arrayOf("image/png","image/jpeg","image/webp","image/bmp")) }
    fun newFromImage() {
        check(storage.hasWorkspace()) { "Choose a work folder in Preferences first" }
        imageCreatesProject=true
        imagePicker.launch(arrayOf("image/png","image/jpeg","image/webp","image/bmp"))
    }
    fun createProject(name:String) {
        io.execute {
            try {
                val actual=storage.createProject(name)
                projectIO.initializeProject()
                sendEvent("project",JSONObject().put("ok",true).put("name",actual).put("created",true))
                sendEvent("status",statusPayload())
                listProjects()
            }catch(e:Exception){
                DevLog.write("PROJECT",e.stackTraceToString())
                sendEvent("project",JSONObject().put("ok",false).put("message",e.message))
            }
        }
    }
    fun renameProject(name:String) {
        io.execute {
            try {
                val renamed=storage.renameProject(name)
                sendEvent("project",JSONObject().put("ok",true).put("name",renamed).put("renamed",true))
                sendEvent("status",statusPayload())
                listProjects()
            }catch(e:Exception){
                DevLog.write("RENAME",e.stackTraceToString())
                sendEvent("project",JSONObject().put("ok",false).put("message",e.message))
            }
        }
    }
    fun openProject(id:String) {
        io.execute {
            try{
                val name=storage.openProject(id)
                sendEvent("project",JSONObject().put("ok",true).put("name",name).put("created",false))
                sendEvent("status",statusPayload())
                listProjects()
            }catch(e:Exception){
                DevLog.write("PROJECT",e.stackTraceToString())
                sendEvent("project",JSONObject().put("ok",false).put("message",e.message))
            }
        }
    }
    fun listProjects() {
        io.execute {
            try { sendEvent("projects",JSONObject().put("items",storage.listProjects())) }
            catch(e:Exception){DevLog.write("PROJECTS",e.stackTraceToString());sendEvent("projects",JSONObject().put("error",e.message))}
        }
    }
    fun exportProjectZip() {
        val name=storage.projectName().ifBlank { "Gui-Cutter-project" }
            .replace(Regex("[^a-zA-Z0-9 _.-]"),"_")
        zipExporter.launch("$name.zip")
    }
    fun saveProject(json:String) {
        io.execute {
            try {val count=projectIO.saveProject(json);sendEvent("save",JSONObject().put("state","success").put("count",count))}
            catch(e:Exception){DevLog.write("SAVE",e.stackTraceToString());sendEvent("save",JSONObject().put("state","error").put("message",e.message ?: "Save failed"))}
        }
    }
    fun openExport(name:String) {
        try {
            val uri=projectIO.findOpenable(name)
            val intent=Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri,"image/png")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent,"Open image"))
        } catch(e:Exception){DevLog.write("FILES",e.stackTraceToString());sendEvent("files",JSONObject().put("message","Cannot open: ${e.message}"))}
    }
    fun testFolder(){io.execute {
        val message=try { storage.testFolder() }catch(e:Exception){DevLog.write("STORAGE",e.stackTraceToString());"Folder test failed: ${e.message}"}
        sendEvent("workspace",JSONObject().put("message",message))
    }}
    // Standard Android keyboard feedback honors the device's own touch setting.
    fun hapticTick() {
        runOnUiThread {
            if (isFinishing || isDestroyed || !::webView.isInitialized) return@runOnUiThread
            try { webView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP) }
            catch (e: Exception) { DevLog.write("HAPTIC", e.message ?: "Unavailable") }
        }
    }
    fun exportLog()=logExporter.launch("Gui-Cutter-devlog.txt")
    override fun onDestroy() {
        updates.close();io.shutdown()
        if(::webView.isInitialized){
            webView.stopLoading()
            webView.removeJavascriptInterface("NativeAndroid")
            (webView.parent as? android.view.ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }
}