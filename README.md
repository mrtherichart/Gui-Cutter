# Gui Cutter — Android Starter

Kotlin Android shell + bundled HTML/CSS/JavaScript WebView. This is infrastructure only, **not yet a UI cutter**.

## What works

- Launches an offline, browser-testable WebView interface.
- Choose an Android Documents folder, remember access, and test a short file write.
- Check the **public** `mrtherichart/Gui-Cutter` GitHub Releases for a newer APK, download and open the system installer.
- Keep optional rotating native and JavaScript diagnostics; export a log using Android's file picker.
- Build a debug APK from `main`, and a signed GitHub Release from the explicit **Publish signed release** workflow option, using one Actions workflow.

## Put it on GitHub

Upload the **contents** of this folder (not the ZIP itself) to `mrtherichart/Gui-Cutter` on the `main` branch. Do not upload `.private/`, keys, or passwords. GitHub Actions produces a debug APK under the run's **Artifacts**. For production, launch **Actions → Android APK → Run workflow** and enable **Publish signed release**.

For signed releases, follow [docs/RELEASE.md](docs/RELEASE.md). Set up signing **before installing the first release**, and keep the keystore safe: all later APKs must use the exact same signing certificate and `applicationId`.

## Development

- No web server, npm, backend, or external UI library required.
- To preview the web interface: open `app/src/main/assets/index.html` in a desktop/mobile browser. Native buttons are intentionally inert there.
- Android builds use JDK 17, Gradle 8.11.1 and Android SDK 35 (`gradle :app:assembleDebug`). GitHub Actions provides these automatically.
- JS editing takes place in `app/src/main/assets/`; Kotlin under `app/src/main/java/...` is limited to Android-specific work.
- Set `devLogs=false` in `gradle.properties` when development logs should be quiet in release builds.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the deliberately small module boundaries.
