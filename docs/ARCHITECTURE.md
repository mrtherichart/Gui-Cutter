# Gui Cutter implementation

- **HTML/CSS + Canvas:** complete screen layout, full-canvas rendering, floating toolbars, left application drawer, bottom inspection sheet and previews.
- **app.mjs:** one gesture controller, saved material/motion preferences, two isolated drawer states, UI event wiring, edge visualization and project operations.
- **editor-performance.mjs:** bounded thumbnail cache, revision-keyed list invalidation, and pixel-aligned viewport clipping for crops, image and checkerboard; small pure helpers tested in Node.
- **pointer-navigation.mjs:** standalone pan/pinch math. The canvas controller owns touch lifetime, cancellation, and the transition from pinch to single-finger pan.
- **model.mjs:** normalized asset schema, filename validation, 128-step undo/redo, monotonic edit revisions, and constant-time committed dirty checks.
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
- Native Back first asks the page to close any open dialog, drawer, precision mode in the selection strip or Clean Canvas mode, before exiting the Activity.
## Rendering and lifecycle

The asset library preserves its DOM and preview bitmaps when only selection changes. Geometry, image, or view-mode changes invalidate the list. Off-screen crop decoration is skipped, while a small margin preserves visible handles and glow. The magnifier coalesces pointer moves to one paint per animation frame. Image changes terminate obsolete edge workers, and temporary browser object URLs are released after loading. The source-image geometry and native export are unchanged.

## v0.1.10 maintenance

The source image and edge overlay are drawn from a pixel-aligned visible source region instead of issuing full-image draw commands at extreme zoom. Subpixel checkerboard tiles become a flat neutral background, avoiding large numbers of invisible cell draws; high-zoom checkerboard remains unchanged. Crops off-screen are still culled independently.

The asset list uses the project's monotonic committed revision rather than serializing the full asset array on selection. The unsaved indicator compares committed history against the last saved snapshot in constant time; a drag becomes an edit when it is committed on release. Undo, redo, reload, and canceled drags invalidate visible previews appropriately.

Pinch math is isolated and tested. Adding or removing touch points rebases the gesture; the final remaining finger pans without triggering selection or a double-tap. `pointercancel` aborts the interaction. Image-load and recovery dialogs check the image generation and project key before applying old edits. The native WebView is detached on destroy and ignores late events. Project files and signing are unchanged.

Testing: all Node tests and the signed Android build/lint on Actions; manual device interaction and in-place APK upgrade remain separate verification steps.

## Menu responsiveness (v0.1.11)

Tab content switches immediately without entrance opacity or translation. Button-opened drawers use a short ease-out (210 ms opening, 165 ms closing); finger-driven drawers retain the independent critically damped release physics. The drawer is interactive during the last part of a tap-open animation. Reduced-motion and Smooth motion Off still bypass animation.

Opening Workspace requests files asynchronously through the existing Kotlin I/O executor. Results are tagged with the request number and project key, so older results cannot replace a newly opened project's list. Visible lists are constructed in bounded animation-frame batches. Native exports-folder enumeration prefers a single `DocumentsContract` child query, with `DocumentFile` fallback for incompatible providers. Settings/Developer request status asynchronously. Project file data and preview rasterization do not delay the initial tab selection.

Large glass surfaces keep their configured blur, with transform layer preparation limited to active drawer motion; idle closed panels no longer request a persistent promoted layer. Browser timing tests are not a substitute for Android device compositor profiling.

## v0.1.13 startup and interaction parity

The local theme preference is read by the tiny blocking `boot-theme.js` in the document head, before CSS and the editor. Android persists that preference separately for its own startup window and WebView background. A read-only native system-dark query synchronizes initial system mode without waiting for project file I/O.

The side and bottom drawers share gesture start/move/release logic, using direction-sensitive settling and the same small-movement threshold. The left 23 px display edge is an input target even when the app drawer is shut. Native keyboard haptics honor Android touch settings; the previous trial UI has been removed. The magnifier becomes visible only after moving the pointer and uses a two-frame delayed reveal with a brief opacity transition.

Precision controls use one open/close helper and consistent touch affordances. A temporary status line that resized the Developer pane was removed, and dynamic content disables scroll anchoring where updates could otherwise shift nearby controls.

## v0.1.14 interaction boundaries

`drawer-motion.mjs` owns axis mapping, velocity estimation, and terminal-state decisions for both drawers. The gesture controller in `app.mjs` attaches the same touch listeners to both drawer panels and the exposed left edge; cancellation restores the drawer's starting terminal state. Directional intention wins over minor release wobble, while a substantial sustained reversal is respected. The release estimator includes the final `touchend` coordinates.

`focusAsset()` and `centerSelectedAsset()` are the single focus command, used by the asset browser and selection-name button. Centering always uses the entire canvas, never the currently exposed space above the sheet; `focusTarget` is pure and independently tested.

`syncToggleButton()` owns the visual and accessible on/off state for edge snapping, crop snapping, and magnifier. CSS custom properties define the shared minimum touch size, pressed scale, response duration, radius, gaps, and active/inactive colors. The compact precision controls are children of the selection strip; no separate glass popup or redundant show/hide logic exists.

Device tests remain necessary for native touch/release feel and actual WebView frame pacing. Browser layout smoke tests cover small portrait and landscape viewports and verify precision targets stay in the bar.


## v0.2.0 CSS geometry

Ordinary UI shapes have one radius token: `--ui-radius: 5px`. The existing surface/control aliases resolve to it, including the selection strip and precision actions. Circles use `--ui-round: 50%` and structural flat sides are zero. New UI elements must use these variables rather than hard-coded corner sizes; button tap target dimensions stay unchanged.
