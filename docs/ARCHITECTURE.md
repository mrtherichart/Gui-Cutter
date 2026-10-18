# Gui Cutter implementation

- **HTML/CSS + Canvas:** complete screen layout, floats, drawers and previews.
- **app.mjs:** one gesture controller, application settings, UI event wiring, edge visualization and project operations.
- **model.mjs:** normalized asset schema, filename validation, 128-step undo/redo and dirty tracking.
- **geometry.mjs:** inclusive screen transforms and exclusive image crop bounds, resize handles, move, directional snapping, nine-slice preview parts.
- **edge-worker.js:** off-main-thread luminance-gradient edge detection. Image coordinates remain source pixels.
- **MainActivity.kt:** Android system picker, lifecycle, immersive window, secure WebView asset loading and event dispatch.
- **ProjectIO.kt:** SAF-backed base image, manifest and export handling; PNG generation happens natively, using integer geometry from the manifest. All cropped PNGs are prepared in app cache before writing. The manifest is written last. SAF document providers do not guarantee atomic replacements, so interrupted writes should be retried with Save.
- **StorageAccess.kt:** persisted Android Documents tree URI.
- **UpdateService.kt:** Github Releases -> verified APK -> Android installer (always subject to Android's checks).
- **DevLog.kt:** local, bounded diagnostic log, exported only by user action. No telemetry.

The original desktop format is `{image_path, assets:[{asset_id, kind, x,y,w,h,left,top,right,bottom}]}` and file names `base.png`, `ui_slices.json`, and `exports/*.png`. All coordinates are integers measured in source image pixels. Nine-slice exports remain a single PNG with margins recorded in JSON; exploded view is preview-only.

Native methods are exposed only to bundled first-party pages. No broad storage permission, third-party backend, JS frontend framework or public app credentials. Android folder access requires an explicit user selection. `devLogs` remains a Gradle property that can be disabled for quieter releases.