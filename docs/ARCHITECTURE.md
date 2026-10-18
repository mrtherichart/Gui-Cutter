# Gui Cutter architecture

The Android wrapper is Kotlin, and the editor will live in bundled HTML/CSS/JavaScript. Files are accessed through Android's Storage Access Framework; the app remembers the chosen folder. WebViewAssetLoader serves only packaged web assets. MainActivity owns lifecycle and system dialogs. NativeBridge exposes a small set of native methods. StorageAccess is isolated from editor logic. UpdateService checks public GitHub Releases and invokes the Android installer; no GitHub token is stored in the APK. DevLog rotates native and JavaScript diagnostics and permits user-directed export. Versioning has pure unit tests. No actual image slicing is implemented in this starter.

Keep the package ID nl.mrtherich.guicutter and the original signing certificate unchanged after the first release. Keep credentials outside this public repository.
