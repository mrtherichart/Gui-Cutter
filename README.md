# Gui Cutter

A self-contained Android screenshot UI cutter using Kotlin + a packaged JavaScript WebView editor. Supports Android 10 and newer. **The whole image is the workspace:** floating tools and expandable panels cover it only when needed.

## Features

- Normal PNG crops and 9-slice assets (one PNG plus four margins in the JSON manifest)
- Rectangle creation, selection, resizing, moving, renaming, deletion and integer property editing
- Direction-aware weighted edge snapping, visual edge overlay, nearest-neighbour preview
- Two-finger pinch/zoom/pan, one-finger tool modes, a dedicated move grip and screen-size touch handles
- Undo/redo history (128 snapshots), unsaved badge and manual Save Sync
- Local recovery drafts, responsive floating interface, full-screen Clean Canvas mode
- Native Android folder picker, persistent folder access, project file inspection and opening exports
- In-app GitHub Release APK updates, exportable rotating diagnostics, settings and developer panel

## Workflow

1. Install the signed [GitHub Release](https://github.com/mrtherichart/Gui-Cutter/releases/latest).
2. Open **Files** and choose a workspace folder under Documents or another location allowed by Android.
3. Import an image. Gui Cutter stores it as **base.png**.
4. Draw crops using **New**. Use **Edit** for selected outlines/handles and the middle move grip. Use two fingers to pan/zoom at any time.
5. Tap **Save** to write `ui_slices.json` and the PNG crops to `exports/`. These are ordinary files accessible from Android's file manager.

Imported desktop `ui_slices.json` files are supported. The desktop `image_path` field is ignored in favor of the project's local `base.png`. Nine-slice margins remain `left`, `top`, `right`, `bottom` in the manifest.

## Development

Edit HTML/CSS/JS in `app/src/main/assets/` and Kotlin in `app/src/main/java/...`. Browser test the UI by serving `assets/` locally. Run JS tests with `node --test tests/*.test.mjs`. No JS package manager or frontend framework is required.

The `main` branch is the working release source. Its GitHub Actions workflow runs JS and Android tests, builds a **signed** APK and publishes it as the official release when `appVersion` changes. Keep the original signing keystore and the two GitHub secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`) for every update. Do not make a new keystore. See `docs/RELEASE.md`.

The mobile editor is not the original Python Qt code; the model and export format are compatible. Browser-mode Save downloads PNGs individually plus a manifest, while Android uses a native folder and file exporter.