# Gui Cutter

A self-contained Android screenshot UI cutter using Kotlin + a packaged JavaScript WebView editor. Supports Android 10 and newer. **The whole image is the workspace:** floating tools and two task-specific drawers cover it only when needed.

## Features

- Normal PNG crops and 9-slice assets (one PNG plus four margins in the JSON manifest)
- Rectangle creation, selection, resizing, moving, renaming, deletion and integer property editing
- Direction-aware weighted edge snapping, visual edge overlay, nearest-neighbour preview
- Two-finger pinch/zoom/pan, one-finger tool modes, a dedicated move grip and screen-size touch handles
- Undo/redo history (128 snapshots), unsaved badge and manual Save Sync
- Local recovery drafts, floating translucent tool surfaces, compact selected-asset thumbnail, full-screen Clean Canvas mode
- Native Android folder picker, persistent folder access, project file inspection and opening exports
- Daylight, night and system appearance, adjustable glass transparency and blur, motion preferences, and native developer diagnostics
- In-app GitHub Release APK updates and exportable rotating logs

## Workflow

1. Install the signed [GitHub Release](https://github.com/mrtherichart/Gui-Cutter/releases/latest).
2. Open the **left application drawer → Workspace** and choose a workspace folder under Documents or another location allowed by Android.
3. Import an image. Gui Cutter stores it as **base.png**.
4. The left rail has **Pan**, **Edit**, **New rectangle**, and **New nine-slice**. Drag the image to create crops, then use handles or the central move grip in Edit mode. Use two fingers to pan/zoom at any time. Double-tap while using Pan to fit the image.
5. The bottom glass bar has **Fit**, the zoom slider, zoom percentage, **Snap**, and **Assets**. Assets opens the bottom details sheet; tap the selected-asset strip to open **Inspector**, which also offers pixel nudging. Tap the Save icon in the top bar to write `ui_slices.json` and PNG crops to `exports/`. These are ordinary files accessible from Android's file manager.

**Navigation:** The top-left menu opens the **left application drawer** (Workspace, Preferences and Developer). The selected asset and Assets button open the **bottom details sheet** (Assets, Inspector and Preview). Pull the sheet down by its grip or tap outside either drawer to close it; Android Back closes an open panel first.

**Appearance:** Open **Menu → Preferences** to choose Follow system, Night or Daylight and set separate live **Transparency (0–65%)** and **Blur intensity (0–36 px)** sliders. Glass sliders affect UI surfaces only; the source image stays pixel-sharp. Smooth motion can be disabled independently and the device’s reduced-motion preference is respected.

Imported desktop `ui_slices.json` files are supported. The desktop `image_path` field is ignored in favor of the project's local `base.png`. Nine-slice margins remain `left`, `top`, `right`, `bottom` in the manifest.

## Development

Edit HTML/CSS/JS in `app/src/main/assets/` and Kotlin in `app/src/main/java/...`. Browser test the UI by serving `assets/` locally. Run JS tests with `node --test tests/*.test.mjs`. No JS package manager or frontend framework is required.

The `main` branch is the working release source. Its GitHub Actions workflow runs JS and Android tests, builds a **signed** APK and publishes it as the official release when `appVersion` changes. Keep the original signing keystore and the two GitHub secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`) for every update. Do not make a new keystore. See `docs/RELEASE.md`.

The mobile editor is not the original Python Qt code; the model and export format are compatible. Browser-mode Save downloads PNGs individually plus a manifest, while Android uses a native folder and file exporter.
## v0.1.3 — touch and theming refinement

System appearance is determined by Android's night-mode configuration and controls both WebView colors and native status/navigation bars. The assets sheet offers list and grid views with cached crop thumbnails. Drag from the left screen edge to open the app drawer, swipe left on its heading or navigation to dismiss; pull down the bottom sheet's grip/heading to close; swipe the sheet tabs horizontally; pull up on the lower controls to open Assets or the selection strip to open Inspector. Edge snapping and rectangular crop geometry are unchanged. The selection gizmo now has a gold rim, subtle halo and circular handles to match the design reference. Large glass panels use a lower-cost blur while small toolbars retain the full blur preference.
