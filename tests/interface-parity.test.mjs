import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const html=read('app/src/main/assets/index.html');
const js=read('app/src/main/assets/app.mjs');
const css=read('app/src/main/assets/app.css');
const boot=read('app/src/main/assets/boot-theme.js');
const kt=read('app/src/main/java/nl/mrtherich/guicutter/MainActivity.kt');
const bridge=read('app/src/main/java/nl/mrtherich/guicutter/NativeBridge.kt');
test('theme is selected by blocking bootstrap before stylesheet and editor',()=>{
  assert.ok(html.indexOf('boot-theme.js')<html.indexOf('app.css'));
  assert.ok(html.indexOf('app.css')<html.indexOf('app.mjs'));
  assert.match(boot,/localStorage\.getItem/);
  assert.match(boot,/initialSystemDark/);
  assert.match(kt,/barThemeMode = themePrefs\.getString/);
  assert.match(kt,/setBackgroundColor\(bootColor\)/);
  assert.match(bridge,/initialSystemDark\(\)/);
});
test('temporary controls gone, keyboard haptic is system controlled for interface',()=>{
  assert.doesNotMatch(html,/haptic-trial|data-haptic-trial/);
  assert.doesNotMatch(js,/trialHaptic|selectTrialHaptic|haptic-preview/);
  assert.doesNotMatch(kt,/previewHaptic|VibrationEffect\.createOneShot/);
  assert.match(kt,/performHapticFeedback\(HapticFeedbackConstants\.KEYBOARD_TAP\)/);
  assert.match(js,/document\.addEventListener\('pointerdown'/);
});
test('magnifier toggle replaces asset launcher, and is only revealed by movement',()=>{
  assert.doesNotMatch(html,/id="assets-btn"/);
  assert.match(html,/id="toggle-magnifier"/);
  assert.match(js,/settings\.magnifier=!settings\.magnifier/);
  assert.match(js,/Math\.hypot\(p\.x-g\.screen\.x,p\.y-g\.screen\.y\)>=1/);
  assert.match(js,/magnifierRevealFrame=requestAnimationFrame/);
  assert.match(css,/\.magnifier\.is-visible\{opacity:1/);
});
test('side and bottom drawer use common gesture handlers; full left edge is actionable',()=>{
  assert.match(html,/id="app-edge-swipe"/);
  assert.match(js,/attachDrawerGestures\(\$\('app-edge-swipe'\),'app'\)/);
  assert.match(js,/drawerDisplacement\(kind,dx,dy\)/);
  assert.match(js,/settleTarget\(p,g\.track,span,\{signedTravel,startProgress:g\.startP\}\)/);
  assert.match(css,/\.app-edge-swipe\{position:fixed;left:0;top:0;bottom:0;/);
});
test('corner and edge handles have matching radii and centered nudge feedback is reusable',()=>{
  assert.match(js,/corner\|\|middle\?2\.45/);
  assert.match(html,/aria-label="Move left"/);
  assert.match(css,/\.selection-strip \.precision-actions button:active:not\(:disabled\)/);
});
