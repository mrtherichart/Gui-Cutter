# Gui Cutter

A self-contained Android screenshot UI cutter using Kotlin + a packaged JavaScript WebView editor. Supports Android 10 and newer. **The whole image is the workspace:** floating tools and two task-specific drawers cover it only when needed.

## Features

- Normal PNG crops and 9-slice assets (one PNG plus four margins in the JSON manifest)
- Rectangle creation, selection, resizing, moving, renaming, deletion and integer property editing
- Direction-aware weighted edge snapping, visual edge overlay, nearest-neighbour preview
- Two-finger pinch/zoom/pan, one-finger tool modes, a dedicated move grip and screen-size touch handles
- Undo/redo history (128 snapshots), unsaved badge and manual Save Sync
- Local recovery drafts, floating translucent tool surfaces, compact selected-asset thumbnail, full-screen Clean Canvas mode
- Native Android folder picker, persistent folder access, asynchronous project file inspection and opening exports
- Daylight, night and system appearance before first content paint, adjustable glass transparency and blur, motion preferences, and native developer diagnostics
- In-app GitHub Release APK updates and exportable rotating logs

## Workflow

1. Install the signed [GitHub Release](https://github.com/mrtherichart/Gui-Cutter/releases/latest).
2. Open the **left application drawer → Workspace** and choose a workspace folder under Documents or another location allowed by Android.
3. Import an image. Gui Cutter stores it as **base.png**.
4. The left rail has **Pan**, **Edit**, **New rectangle**, and **New nine-slice**. Drag the image to create crops, then use handles or the central move grip in Edit mode. Use two fingers to pan/zoom at any time. Double-tap while using Pan to fit the image.
5. The bottom glass bar has **Fit image**, the zoom slider and percentage, two independent snapping toggles, and a magnifier toggle. Pull the attached lower drawer grip to open **Assets**, **Inspector**, and **Preview**. Tapping an asset in the library or its name in the selection strip centers it on the full workspace. The separate Inspector button opens numeric geometry controls. The precision icon turns the selection strip into compact directional pixel buttons with a 1/10 px step switch. Tap the Save icon to write `ui_slices.json` and PNG crops to `exports/`.

**Navigation:** The top-left menu opens the **left application drawer** (Workspace, Preferences and Developer). The attached bottom grip opens the **bottom details sheet** (Assets, Inspector and Preview); the selection strip has a dedicated Inspector button. A partial intentional drawer pull settles in its intended direction, while insignificant release jitter is ignored. Pull a drawer closed by its grip or tap outside it; Android Back closes a dialog or drawer first.

**Appearance:** Open **Menu → Preferences** to choose Follow system, Night or Daylight and set separate live **Transparency (0–65%)** and **Blur intensity (0–36 px)** sliders. Glass sliders affect UI surfaces only; the source image stays pixel-sharp. Smooth motion can be disabled independently and the device’s reduced-motion preference is respected.

Imported desktop `ui_slices.json` files are supported. The desktop `image_path` field is ignored in favor of the project's local `base.png`. Nine-slice margins remain `left`, `top`, `right`, `bottom` in the manifest.

## Development

Edit HTML/CSS/JS in `app/src/main/assets/` and Kotlin in `app/src/main/java/...`. Browser test the UI by serving `assets/` locally. Run JS tests with `node --test tests/*.test.mjs`. No JS package manager or frontend framework is required.

The `main` branch is the working release source. Its GitHub Actions workflow runs JS and Android tests, builds a **signed** APK and publishes it as the official release when `appVersion` changes. Keep the original signing keystore and the two GitHub secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`) for every update. Do not make a new keystore. See `docs/RELEASE.md`.

The mobile editor is not the original Python Qt code; the model and export format are compatible. Browser-mode Save downloads PNGs individually plus a manifest, while Android uses a native folder and file exporter.
## v0.1.3 — touch and theming refinement

System appearance is determined by Android's night-mode configuration and controls both WebView colors and native status/navigation bars. The assets sheet offers list and grid views with cached crop thumbnails. Drag from the left screen edge to open the app drawer, swipe left on its heading or navigation to dismiss; pull down the bottom sheet's grip/heading to close; swipe the sheet tabs horizontally; pull up on the lower controls to open Assets or the selection strip to open Inspector. Edge snapping and rectangular crop geometry are unchanged. The selection gizmo now has a gold rim, subtle halo and circular handles to match the design reference. Large glass panels use a lower-cost blur while small toolbars retain the full blur preference.

## v0.1.4 — precision illumination and pull-out drawers

Four optical gizmo highlights share the same near-white core: Champagne Gold (default), Glacier Blue, Orchid, and Jade. Choose one under Workspace > Preferences. The gizmo handles are smaller and use a halo rather than an opaque solid color. The new-crop dashed rectangle has a restrained green glow.

The tool rail is on the right. When hidden, both drawers show small independent floating handles: drag right from the left-edge grip for Workspace, or up from the bottom grip for Assets/Inspector/Preview. Drawer movement tracks the finger and settles on release. Pull back from the app header, sheet header or sheet grip to close. Multi-touch disarms drawer pulls; the image's two-finger pan/zoom remains independent. Existing crop/export format and Android identity are unchanged.

### Custom icon guidance

Visual family: bespoke thin-stroke tool glyphs designed on a consistent 24×24 viewBox, 1.75 px round strokes, optically centered, no persistent button tile, no color baked into icon paths; interactive accent supplied by CSS. See icon requirements in the corresponding design discussion.

## v0.1.5 — attached grips and momentum-driven drawers

Both drawer grips are literal bars attached to their panels, flush with the left and bottom display edges; the bottom grip sits below the zoom bar. The grips move with the drawer.

A single gesture controller tracks finger distance and release velocity. The last deliberate movement direction can override the current drawer position, and a critically damped spring brings the panel gently to rest without bouncing. The full non-interactive surface of each panel accepts directional swipes; horizontal swipes switch the bottom sheet's three tabs. Vertical scrolling remains native. The bottom panel closes via a downward swipe in scrollable content only when the scroll is already at its top. Buttons, switches, inputs, and sliders keep their own gestures. A second finger cancels an active drawer drag. Tapping the exposed grip opens its shelf.

Physics and direction locking live in `drawer-motion.mjs` with regression tests. The offline project format, Android app identity, signing, and WebView core are unchanged.

## v0.1.6 — named projects and ZIP bundles

Gui Cutter now has a single persistent **work folder**, chosen in Workspace → Preferences. New work is organized into one uniquely named child folder per project. Workspace offers **New project** (enter a name, then import), **From image** (automatic filename-based name), a list of existing projects, **Import image** for an empty project, **Reload**, and **Export ZIP**. A conflict creates a numbered name instead of overwriting another project.

Previously selected single-folder projects remain available as legacy projects without being moved, renamed or deleted. Changing the work folder retains old contents in their original location; the user can choose that folder again to recover them. Open Project enumerates project folders inside the chosen work folder. The original `base.png`, `ui_slices.json`, and `exports/` format is unchanged.

**Export ZIP** uses `java.util.zip.ZipOutputStream` built into Android and `ActivityResultContracts.CreateDocument("application/zip")` to let the user choose the destination. The archive contains the project folder and all its files, including PNG crops. Unsaved edits are saved through the normal Save Sync path first. ZIP export streams contents without loading them all into memory.

Legacy projects are still accessible by pointing the work-folder setting at the old project directory. Browser-only mode remains a lightweight editor and does not expose Android's SAF project management.

## v0.1.7 — phone precision controls

New normal or nine-slice crops: tapping the image stamps a crop using the selected crop's exact size, kind and nine-slice margins; dragging always draws custom dimensions. Without a selected asset, a tap alone cannot create an arbitrary crop.

Two independent icon-only bottom-bar toggles control source-image edge snapping and crop-to-crop alignment. Crop snapping uses screen-pixel tolerance and aligns independent horizontal/vertical edges or centers, showing only faint temporary grey dashed lines when an alignment is active. Snap toggles, tools, Fit, Undo/Redo and precision controls give brief contextual feedback. Desktop hover shows icon hints without permanent labels.

The asset library now pans and selectively zooms to a crop when it is tapped; already visible assets do not cause movement. Optional haptics are provided through the Android vibration service (with browser fallback) when a snap engages or a new crop is completed. Existing project structure, save status dot, project/ZIP management and drawer gestures remain unchanged.

## v0.1.8 corrections

Deferred select-mode taps prevent two-finger gestures from changing selection; last selection is reused for tap placement, while the active crop tool determines type. Workspace flow clarifies name-first versus image-first project creation. Preferences supports a pencil-only project rename and settings explanations. Drawer overflow, project-list scroll, clean canvas, haptics, theme background and glass toast are corrected.

## v0.1.9 — internal cleanup and interaction performance

Selections now update the asset-list highlight without reconstructing all crop thumbnails. Crop decoration outside the visible canvas is skipped, thumbnail caching evicts only the oldest entries, and the magnifier paints at most once per animation frame. Loading another image stops obsolete edge detection work and releases temporary browser image URLs. Removed an unused Android-starter UI script. Geometry, gestures, project files, native export and Android identity retain their existing behavior. Unit tests cover list invalidation, viewport visibility and cache eviction.

## v0.1.10 — focused performance and lifecycle refactor

Canvas painting now limits source-image reads to the visible pixel area at high zoom and skips checkerboard detail too fine to display. Asset-list updates use edit revisions, and the Save indicator no longer serializes the complete project on every pointer move. Touch navigation has isolated, tested pan/pinch math, including smooth transitions when fingers lift in different orders. Late image/recovery operations are guarded against project switches; Android releases its WebView when closing. The UI design, offline project files, ZIP export, app ID and signing key remain unchanged.

## v0.1.11 — immediate menu response

Tab contents now appear on the first frame, and tap-open/tap-close drawers use shorter motion without altering swipe physics. Android Workspace file inspection and Settings status updates no longer synchronously block tab clicks; the file list builds progressively and ignores stale responses. SAF export listing uses a direct provider query when available. Blur settings, assets, project files, gestures and signing remain compatible with previous releases.


## v0.1.12 — temporary haptic comparison

Developer includes three test buttons for Android's `CLOCK_TICK`, `KEYBOARD_TAP`, and `TEXT_HANDLE_MOVE` effects. Tapping a button previews that effect and selects it for crop snapping for the current app session. Initial selection is Clock tick. The experiment is visible only in the v0.1.12 APK and is not stored in project files or Preferences. Both the test and ordinary snaps honor Android's system touch-feedback setting; the app no longer drives the vibration motor with a hard one-shot pulse. Remove the comparison controls after selecting the preferred effect in a later release.

## v0.1.13 interaction corrections

- Keyboard-style system haptics replace the temporary comparison; no custom vibrator amplitude.
- A blocking, tiny theme bootstrap sets the saved day/night choice before CSS and the editor initialize. Kotlin remembers the selected theme for the startup window and WebView.
- Both drawers use the same directional settling rule; the entire left screen edge can open the workspace drawer, matching the bottom drawer's edge gesture.
- Matching corner/edge dot sizes, softer colored strokes, slightly broader glow and a two-frame magnifier reveal only after movement.
- Bottom bar now toggles the precision magnifier in place of the redundant asset-list launcher.
- Pixel adjustment controls use consistent press feedback, geometry and a compact three-way control layout.
- Dynamic diagnostics do not deliberately animate the content position; the temporary haptic status that could change height is gone.

## v0.1.14 — gesture intention and shared editor controls

Drawer intent combines gesture displacement, multi-sample velocity and meaningful reversal distance. A tiny direction change while lifting a finger does not invert a deliberate opening; both drawers share axis configuration, touch lifecycle and cancellation. The asset browser and the selected-crop name use the same full-workspace centering operation, independent of whether the sheet happens to be open.

Pixel adjustment is integrated into the selection strip as four directions and a 1/10 px step toggle; the separate floating popup is removed. The Inspector and Fit icons are distinct from navigation and crop creation, and all three bottom toolbar toggles share active/muted styling. CSS variables define common press feedback, sizes, radius, gaps, and state colors. The file format, Android application ID, and signing identity remain unchanged.


## v0.2.0 — finished interface geometry

The full editor now uses one shared **5px corner radius** for toolbars, drawers, tabs, buttons, fields, dialogs, cards, crop thumbnails, and precision controls. `--ui-radius` is the sole source of ordinary corner curvature; existing semantic aliases (`--panel-radius`, `--bar-radius`, `--ui-control-radius`) point to it. True circular affordances (slider knobs, close buttons, indicators) use `--ui-round`, while straight edges remain square. No canvas crop geometry, saved project data, gestures, Android package name, or signing configuration changed.

## v0.2.1 — transparency prototype

Inspector → **Transparency** edits picked background colours without changing `base.png`. No crop selected means image-wide settings, inherited by all crops; with a crop selected, its first transparency edit creates an independent override. Picking a colour temporarily uses the existing canvas, then returns to Inspector. Tolerance and the optional **All matching colours** mode cover connected outside backgrounds and deliberate whole-colour removal. Antialiasing at colour-key boundaries includes background-colour cleanup. The main canvas, thumbnails, normal/nine-slice previews and exported PNGs reflect transparency; large-image canvas previews are reduced resolution while PNG exports use original source pixels.

`ui_slices.json` remains `{image_path, assets}` with an **optional** root `transparency` object and optional per-asset `transparency` objects containing `{colors:["#RRGGBB"], tolerance:20, all:false}`. Existing projects without these fields retain their previous behaviour. Colour settings are included in undo/redo, draft recovery and native/browser exports. Earlier app versions may drop optional settings when saving a newer manifest.

## v0.2.2 — transparency workflow and consistent canvas pixels

The bottom Preview tab is renamed **Transparency** and now groups the existing asset preview and colour-key controls. Image-wide transparency settings live under Workspace in the left drawer, while crop-specific settings are in the bottom Transparency tab. Both reuse the same processing, controls and project JSON.

The canvas draws its transparency checkerboard once in image coordinates. Image-wide transparency stays visible when an asset is selected, and selected crop overrides replace rather than double-composite their source pixels. This avoids selection-dependent checkerboard shifts and unwanted preview differences. Source images and export formats remain unchanged.

## v0.2.3 — background comparison and improved transparency

The Transparency tab adds ten compact backdrop comparisons: checkerboard, black,
white, grey, red, green, blue, cyan, yellow and magenta. The chosen backdrop
is a local display preference; it never changes source images, PNG exports or
project JSON. The same comparison applies to the main zoomable canvas.

Background removal now follows four-connected regions from every crop border,
checks local contrast before crossing into similarly coloured foreground, and
recognizes gently shaded variations of sampled colours. Explicitly picked
checkerboard colours can connect across hard colour boundaries. The existing
edge-only decontamination and non-destructive per-image/per-crop JSON persist.
This is a conservative improvement, not a general-purpose photo matting tool:
heavily textured shadows and indistinguishable foreground/background pixels
may still need image editing outside GUI Cutter.

## v0.2.4 — separate edge cleanup

Transparency now includes one **Edge cleanup** strength slider (0–100) in both the
image-wide and selected-crop transparency controls. This is a separate, optional
post-processing pass after background removal, not a second background selector.
It subtly smooths the existing alpha boundary, attenuates exposed one-pixel
protrusions, and pulls contaminated semitransparent edge colours slightly toward
retained foreground pixels. It does not restore removed background or alter
opaque interior pixels. Zero retains v0.2.3 output exactly.

The optional `edgeCleanup` integer is stored alongside existing transparency
colours/tolerance in project or per-crop JSON, with normal undo/redo, recovery,
previews and native PNG export. The JS and Kotlin cleanup passes have been
compared pixel-for-pixel on the supplied fantasy UI crop.


## v0.2.5 — pixel-aligned transparency preview

The original image and processed transparency preview now use the same source-resolution pixel grid on the zoomable canvas. Previously, a hidden 1.2-megapixel preview reduction resampled larger UI sheets and made pixels appear to move relative to the original image, particularly at high zoom and around selected crop overrides. Both source and crop views now paint the identical visible source-pixel interval, without a second scaling origin. A source-exact preview is limited to 4 megapixels on-device; for larger images the editor preserves the original pixel view and explains that live processing is unavailable, while full-resolution PNG export remains unaffected.

Background removal, edge cleanup, JSON and crop geometry are unchanged. Regression checks include a 1448 × 1086 sheet and fractional positions at 579% zoom.
