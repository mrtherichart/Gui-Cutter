import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {focusTarget} from '../app/src/main/assets/crop-alignment.mjs';
import {drawerAxes,drawerDisplacement} from '../app/src/main/assets/drawer-motion.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('app/src/main/assets/index.html');
const app=read('app/src/main/assets/app.mjs');
const css=read('app/src/main/assets/app.css');

test('explicit focus always targets the same full workspace, regardless of drawer overlay',()=>{
 const view={x:0,y:0,scale:1},crop={x:130,y:110,w:40,h:26};
 const opts={width:390,height:780,center:true,rightReserve:0};
 const a=focusTarget(view,crop,opts),b=focusTarget(view,crop,{...opts,visibleBottom:780});
 assert.deepEqual(a,b);
 assert.equal(a.scale,1);
 assert.equal(a.changed,true);
 assert.equal(a.x+150,195);
 assert.equal(a.y+123,390);
 assert.equal(focusTarget(a,crop,opts).changed,false);
});
test('tap crop name and asset browser both invoke the same centering command',()=>{
 assert.match(app,/function centerSelectedAsset\(\)\{focusAsset\(state\.project\.active\);\}/);
 assert.match(app,/function selectIndex\(i\).*centerSelectedAsset\(\)/);
 assert.match(app,/\$\('selection-info'\)\.addEventListener\('click',centerSelectedAsset\)/);
 assert.match(app,/rightReserve:0,center:true/);
 assert.doesNotMatch(app,/getBoundingClientRect\(\)\.top-canvas\.getBoundingClientRect\(\)\.top/);
});
test('all snapping and magnifier toggles share one state synchronizer and CSS contract',()=>{
 for(const id of ['snap','crop-snap','toggle-magnifier']){
  assert.match(html,new RegExp(`id="${id}" class="[^"]*toggle-button`));
 }
 assert.match(app,/function syncToggleButton\(id,enabled\)/);
 assert.match(css,/\.bottom-bar \.toggle-button:not\(\.selected\)/);
 assert.match(css,/\.bottom-bar \.toggle-button\.selected/);
 assert.match(css,/--ui-control-muted: var\(--text-soft\)/);
});
test('precision tools replace the selection display without a separate panel',()=>{
 assert.match(html,/id="selection-precision"/);
 assert.doesNotMatch(html,/id="nudge-panel"|id="close-nudge"/);
 assert.match(app,/function setNudgeOpen\(open\)/);
 assert.match(css,/\.selection-strip\.precision-active #selection-thumb/);
 assert.match(css,/--ui-control-touch: 39px/);
 assert.equal((html.match(/data-nudge="/g)||[]).length,4);
});
test('fit icon differs from crop and inspector has its own drawing',()=>{
 const symbols=[...html.matchAll(/<symbol id="(i-[^\"]+)"[^>]*>(.*?)<\/symbol>/gs)];
 const map=new Map(symbols.map(m=>[m[1],m[2]]));
 assert.notEqual(map.get('i-fit'),map.get('i-crop'));
 assert.ok(map.get('i-inspector'));
 assert.match(html,/#i-inspector/);
 assert.match(html,/id="selection-info" title="Center selected crop"/);
});
test('drawer direction and cancellation behavior are shared instead of edge-specific copies',()=>{
 assert.deepEqual(Object.keys(drawerAxes),['app','sheet']);
 assert.equal(drawerDisplacement('app',80,0),80);
 assert.equal(drawerDisplacement('sheet',0,-80),80);
 assert.equal(drawerDisplacement('sheet',0,80),-80);
 assert.match(app,/function cancelDrawerGesture\(g\)/);
 assert.match(app,/attachDrawerGestures\(\$\('app-edge-swipe'\),'app'\)/);
 assert.doesNotMatch(app,/startP>.5\?1:0/);
});


test('transparency controls remain in existing drawers without another tool mode',()=>{
 assert.match(html,/<button data-tab="preview">Transparency<\/button>/);
 const inspector=html.split('id="tab-properties"')[1].split('id="tab-preview"')[0];
 assert.doesNotMatch(inspector,/id="transparency-crop"/);
 const workspace=html.split('id="tab-files"')[1].split('id="tab-settings"')[0];
 assert.match(workspace,/id="transparency-image"/);
 const preview=html.split('id="tab-preview"')[1].split('id="magnifier"')[0];
 assert.match(preview,/id="preview"/);
 assert.match(preview,/id="transparency-crop"/);
 assert.match(app,/ctx\.clip\('evenodd'\)/);
 assert.doesNotMatch(app,/ctx\.clearRect\(tl\.x,tl\.y,rw,rh\)/);
});
