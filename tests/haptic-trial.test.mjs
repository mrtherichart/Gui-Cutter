import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');
const html=read('app/src/main/assets/index.html');
const js=read('app/src/main/assets/app.mjs');
const kotlin=read('app/src/main/java/nl/mrtherich/guicutter/MainActivity.kt');
const bridge=read('app/src/main/java/nl/mrtherich/guicutter/NativeBridge.kt');

test('trial has three matching unique buttons and a native mapping',()=>{
  const effects=['clock','keyboard','text'];
  const constants=['CLOCK_TICK','KEYBOARD_TAP','TEXT_HANDLE_MOVE'];
  const found=[...html.matchAll(/data-haptic-trial="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(found,effects);
  for(let i=0;i<effects.length;i++){
    assert.match(kotlin,new RegExp('"'+effects[i]+'"\\s*->\\s*HapticFeedbackConstants\\.'+constants[i]));
  }
  assert.match(bridge,/fun previewHaptic\(effect: String\)/);
  assert.match(bridge,/fun hapticTick\(effect: String\)/);
  assert.match(js,/nativeCall\('previewHaptic',effect\)/);
  assert.match(js,/native\?\.hapticTick\?\.\(trialHaptic\)/);
});

test('trial only runs on v0.1.12 and obeys system haptic settings',()=>{
  assert.match(js,/info\.version!=='0\.1\.12'/);
  assert.match(kotlin,/preview && BuildConfig\.VERSION_NAME != "0\.1\.12"/);
  assert.match(kotlin,/webView\.performHapticFeedback\(effect\)/);
  assert.doesNotMatch(kotlin,/VibrationEffect\.createOneShot|FLAG_IGNORE_GLOBAL_SETTING/);
  assert.doesNotMatch(js,/navigator\.vibrate/);
  assert.match(js,/let trialHaptic='clock'/);
  assert.doesNotMatch(js,/localStorage\.setItem\([^\n]*trialHaptic/);
  assert.match(read('gradle.properties'),/appVersion=0\.1\.12/);
});
