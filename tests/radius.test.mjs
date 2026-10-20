import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../app/src/main/assets/app.css',import.meta.url),'utf8');

test('v0.2 uses a single ordinary corner radius with semantic aliases',()=>{
  assert.match(css,/--ui-radius\s*:\s*5px\s*;/);
  assert.match(css,/--ui-round\s*:\s*50%\s*;/);
  for(const alias of ['ui-control-radius','panel-radius','bar-radius']){
    assert.match(css,new RegExp(`--${alias}\\s*:\\s*var\\(--ui-radius\\)\\s*;`));
  }
});

test('all radius declarations use shared tokens or deliberate zero corners',()=>{
  const declarations=[...css.matchAll(/border-radius\s*:\s*([^;}]+)/g)].map(m=>m[1].trim());
  assert.ok(declarations.length>60);
  for(const declaration of declarations){
    const tokens=declaration.replace(/!important/g,'').trim().split(/\s+/);
    for(const token of tokens){
      assert.ok(token==='0'||/^var\(--(?:ui-radius|ui-round|ui-control-radius|bar-radius|panel-radius)\)$/.test(token),
        `Unhandled hard-coded radius: ${declaration}`);
    }
  }
});

test('drawers keep only their screen-edge corners square',()=>{
  assert.match(css,/\.app-drawer\s*\{[^}]*border-radius:0 var\(--ui-radius\) var\(--ui-radius\) 0/s);
  assert.match(css,/\.bottom-drawer\s*\{[^}]*border-radius:var\(--ui-radius\) var\(--ui-radius\) 0 0/s);
  assert.match(css,/\.sheet-tabs button\s*\{[^}]*border-radius:var\(--ui-control-radius\)/s);
});
