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
