package nl.mrtherich.guicutter

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

/** One persistent user-chosen work folder with one active project underneath it.
 * Projects from v0.1.5 may still live directly in the previously selected directory.
 */
class StorageAccess(private val context: Context) {
    private val prefs=context.getSharedPreferences("workspace",Context.MODE_PRIVATE)

    fun getWorkspaceUri(): Uri? = prefs.getString("treeUri",null)?.let(Uri::parse)
    fun getUri(): Uri? {
        val active=prefs.getString("activeProjectUri",null)
        if(active!=null)return Uri.parse(active)
        // First launch after upgrading: preserve the previously active single-folder project.
        val old=getWorkspaceUri() ?: return null
        val root=DocumentFile.fromTreeUri(context,old) ?: return null
        return if(root.findFile("base.png")?.isFile==true || root.findFile("ui_slices.json")?.isFile==true)old else null
    }
    fun hasWorkspace()=getWorkspaceUri()!=null

    fun saveUri(uri: Uri) {
        // Switching the work folder never writes to, moves, or deletes old projects.
        prefs.edit().putString("treeUri",uri.toString()).remove("activeProjectUri").remove("activeProjectName").apply()
    }
    fun setActiveProject(folder: DocumentFile) {
        val legacy=(folder.uri==workspace().uri)
        // Retain the original tree URI for old projects, including recovery-draft keys.
        val activeUri=if(legacy)getWorkspaceUri()?:folder.uri else folder.uri
        val editor=prefs.edit().putString("activeProjectUri",activeUri.toString())
        if(legacy)editor.remove("activeProjectName")
        else editor.putString("activeProjectName",folder.name)
        editor.apply()
    }

    private fun workspace(): DocumentFile {
        val uri=getWorkspaceUri() ?: error("Choose a Gui Cutter work folder in Preferences")
        val root=DocumentFile.fromTreeUri(context,uri) ?: error("Work folder is unavailable")
        check(root.isDirectory && root.canRead()) { "Work folder cannot be read" }
        return root
    }
    fun activeProject(): DocumentFile {
        val root=workspace()
        val name=prefs.getString("activeProjectName",null)
        if(name!=null){
            val child=root.findFile(name) ?: error("Project folder no longer exists")
            check(child.isDirectory) { "Project is not a folder" }
            return child
        }
        if(root.findFile("base.png")!=null || root.findFile("ui_slices.json")!=null)return root
        error("Create or open a project first")
    }
    fun folderName(): String = try {
        getWorkspaceUri()?.let { DocumentFile.fromTreeUri(context,it)?.name } ?: "Not configured"
    } catch(e:Exception) {"Folder unavailable"}
    fun projectName(): String = try { activeProject().name ?: "" } catch (_:Exception){ "" }
    fun activeKey(): String? {
        val uri=getUri() ?: return null
        return if(uri==getWorkspaceUri())"@legacy"
        else prefs.getString("activeProjectName",null)
    }
    private fun safeName(raw:String):String {
        val value=raw.trim().replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"),"_")
            .trim('.',' ').take(80).trim()
        check(value.isNotBlank() && value!="." && value!="..") { "Enter a valid project name" }
        return value
    }
    fun createProject(name:String):String {
        val root=workspace()
        val label=safeName(name)
        val existing=root.listFiles().mapNotNull { it.name?.lowercase() }.toSet()
        var candidate=label
        var n=2
        while(candidate.lowercase() in existing){
            candidate="$label ($n)"
            n++
            check(n<10000) { "Too many projects with this name" }
        }
        val dir=root.createDirectory(candidate) ?: error("Cannot create project folder")
        check(dir.isDirectory) { "Project folder creation failed" }
        setActiveProject(dir)
        return candidate
    }
    fun openProject(id:String):String {
        val root=workspace()
        if(id=="@legacy"){
            check(root.findFile("base.png")!=null || root.findFile("ui_slices.json")!=null) { "Legacy project not found" }
            setActiveProject(root)
            return (root.name?:"Legacy project")
        }
        check(id.isNotBlank() && id!="." && id!=".." && '/' !in id && id.none { it.code==92 }) { "Invalid project name" }
        val folder=root.findFile(id) ?: error("Project not found")
        check(folder.isDirectory && (folder.findFile("base.png")!=null || folder.findFile("ui_slices.json")!=null)) { "Not a Gui Cutter project" }
        setActiveProject(folder)
        return folder.name?:id
    }
    fun listProjects():JSONArray {
        val root=workspace()
        val entries=JSONArray()
        val selected=activeKey()
        fun add(folder:DocumentFile,id:String){
            val image=folder.findFile("base.png")
            val manifest=folder.findFile("ui_slices.json")
            if(image==null && manifest==null)return
            entries.put(JSONObject()
                .put("id",id).put("name",folder.name?:id)
                .put("hasImage",image?.isFile==true)
                .put("active",id==selected)
                .put("modified",maxOf(image?.lastModified()?:0L,manifest?.lastModified()?:0L)))
        }
        add(root,"@legacy")
        root.listFiles().filter { it.isDirectory }.sortedByDescending {
            maxOf(it.findFile("base.png")?.lastModified()?:0L,it.findFile("ui_slices.json")?.lastModified()?:0L)
        }.forEach{ add(it,it.name?:"") }
        return entries
    }
    /** No scratch or test file is kept in the work folder. */
    fun testFolder():String {
        val root=workspace()
        check(root.canWrite()) { "The work folder is read-only" }
        val probe=root.createFile("text/plain","gui-cutter-write-test.txt")
            ?: error("Could not create test file")
        try {context.contentResolver.openOutputStream(probe.uri,"wt")?.use {
            it.write("Gui Cutter work folder test\n".toByteArray(Charsets.UTF_8))
        } ?: error("Cannot write test file")}
        finally { probe.delete() }
        return "Work folder access works"
    }
}
