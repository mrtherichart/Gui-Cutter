# Gui Cutter implementation

- **HTML/CSS + Canvas:** complete screen layout, full-canvas rendering, floating toolbars, left application drawer, bottom inspection sheet and previews.
- **app.mjs:** one gesture controller, saved material/motion preferences, two isolated drawer states, UI event wiring, edge visualization and project operations.
- **model.mjs:** normalized asset schema, filename validation, 128-step undo/redo and dirty tracking.
- **geometry.mjs:** inclusive screen transforms and exclusive image crop bounds, resize handles, move, directional snapping, nine-slice preview parts.
- **edge-worker.js:** off-main-thread luminance-gradient edge detection. Image coordinates remain source pixels.
- **MainActivity.kt:** Android system picker, lifecycle, immersive window, system Back dispatch to open UI panels, secure WebView asset loading and event dispatch.
- **ProjectIO.kt:** SAF-backed base image, manifest and export handling; PNG generation happens natively, using integer geometry from the manifest. All cropped PNGs are prepared in app cache before writing. The manifest is written last. SAF document providers do not guarantee atomic replacements, so interrupted writes should be retried with Save.
- **StorageAccess.kt:** persisted Android Documents tree URI.
- **UpdateService.kt:** Github Releases -> verified APK -> Android installer (always subject to Android's checks).
- **DevLog.kt:** local, bounded diagnostic log, exported only by user action. No telemetry.

The original desktop format is `{image_path, assets:[{asset_id, kind, x,y,w,h,left,top,right,bottom}]}` and file names `base.png`, `ui_slices.json`, and `exports/*.png`. All coordinates are integers measured in source image pixels. Nine-slice exports remain a single PNG with margins recorded in JSON; exploded view is preview-only.

Native methods are exposed only to bundled first-party pages. No broad storage permission, third-party backend, JS frontend framework or public app credentials. Android folder access requires an explicit user selection. `devLogs` remains a Gradle property that can be disabled for quieter releases.

## Presentation rules

- The canvas is never resized when either drawer opens. The glass effect applies to controls only, never to the imported image.
- A compact left application drawer contains Workspace, Preferences and Developer. A bottom drawer contains Assets, Inspector and Preview. The bottom drawer has a dedicated drag grip, so vertical scrolling and editing controls never compete with drawer dragging.
- An 8 px spacing rhythm defines panel padding, card spacing and field groups. Floating toolbars are single-piece controls with icon-only actions, not stacked button cards.
- `glassTransparency` (0–65%), `glassBlur` (0–36 CSS px), theme (system/night/daylight), and `smoothMotion` are stored locally in `gui-cutter.preferences.v1`. The old `reduceGlass` preference is migrated on first load.
- Panel transforms use opacity and GPU-friendly transforms; tool gestures and pixel geometry are always immediate, never animated. `prefers-reduced-motion` disables ornamental motion.
- Native Back first asks the page to close any open dialog, drawer, precision nudge overlay or Clean Canvas mode, before exiting the Activity.