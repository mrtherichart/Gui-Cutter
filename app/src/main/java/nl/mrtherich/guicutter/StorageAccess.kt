package nl.mrtherich.guicutter

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile

/** Persists access to one user-chosen workspace via Android's document-tree picker. */
class StorageAccess(private val context: Context) {
    private val prefs = context.getSharedPreferences("workspace", Context.MODE_PRIVATE)

    fun getUri(): Uri? = prefs.getString("treeUri", null)?.let(Uri::parse)

    fun saveUri(uri: Uri) {
        prefs.edit().putString("treeUri", uri.toString()).apply()
    }

    fun folderName(): String {
        val uri = getUri() ?: return "No folder chosen"
        return try {
            DocumentFile.fromTreeUri(context, uri)?.name ?: "Folder unavailable"
        } catch (error: Exception) {
            DevLog.write("STORAGE", "Workspace access unavailable: ${error.message}")
            "Folder unavailable"
        }
    }

    /** Tests permissions without leaving junk in the user's workspace. */
    fun testFolder(): String {
        val uri = getUri() ?: error("Choose a folder first")
        val folder = DocumentFile.fromTreeUri(context, uri) ?: error("Folder no longer available")
        check(folder.canWrite()) { "The folder is not writable" }
        val probe = folder.createFile("text/plain", "gui-cutter-write-test.txt")
            ?: error("Could not create test file")
        try {
            context.contentResolver.openOutputStream(probe.uri, "wt")?.use {
                it.write("Gui Cutter workspace test\n".toByteArray(Charsets.UTF_8))
            } ?: error("Could not open test file")
        } finally {
            probe.delete()
        }
        return "Folder access works"
    }
}
