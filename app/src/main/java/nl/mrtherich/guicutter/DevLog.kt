package nl.mrtherich.guicutter

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Optional, bounded logs stored only in the app's private directory. */
object DevLog {
    private const val MAX_BYTES = 512 * 1024L
    private lateinit var logFile: File

    @Synchronized fun initialize(context: Context) {
        val dir = File(context.filesDir, "logs").apply { mkdirs() }
        logFile = File(dir, "gui-cutter.log")
    }

    @Synchronized fun write(source: String, message: String) {
        if (!BuildConfig.DEV_LOGS_ENABLED || !::logFile.isInitialized) return
        val line = "${SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(Date())} [$source] ${message.take(3000)}\n"
        try {
            if (logFile.length() > MAX_BYTES) {
                val previous = File(logFile.parentFile, "gui-cutter.previous.log")
                previous.delete()
                logFile.renameTo(previous)
            }
            logFile.appendText(line)
        } catch (e: Exception) {
            Log.e("GuiCutter", "Could not persist dev log", e)
        }
    }

    @Synchronized fun snapshot(): String {
        if (!BuildConfig.DEV_LOGS_ENABLED) return "Development logging is disabled.\n"
        if (!::logFile.isInitialized) return "Logger not initialized.\n"
        val older = File(logFile.parentFile, "gui-cutter.previous.log")
        return (if (older.exists()) older.readText() else "") +
            (if (logFile.exists()) logFile.readText() else "")
    }
}
