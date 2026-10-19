import test from 'node:test';
import assert from 'node:assert/strict';
import {Viewport} from '../app/src/main/assets/geometry.mjs';
import {beginPinch,calculatePinch,panDelta} from '../app/src/main/assets/pointer-navigation.mjs';

const view=()=>{const v=new Viewport();v.x=25;v.y=90;v.scale=.5;return v;};
test('pinch preserves source anchor at moving midpoint',()=>{
  const v=view(),start=[{x:100,y:100},{x:200,y:100}];
  const g=beginPinch(v,start);
  const next=[{x:70,y:120},{x:250,y:120}],p=calculatePinch(g,next);
  const midpoint={x:160,y:120};
  assert.equal(p.scale,.9);
  assert.ok(Math.abs((midpoint.x-p.x)/p.scale-g.anchor.x)<1e-8);
  assert.ok(Math.abs((midpoint.y-p.y)/p.scale-g.anchor.y)<1e-8);
});
test('pinch rebases when first pointer lifts with two remaining',()=>{
  const v=view(),g=beginPinch(v,[{x:110,y:100},{x:200,y:100}]);
  Object.assign(v,calculatePinch(g,[{x:110,y:100},{x:205,y:100}]));
  const other=[{x:205,y:100},{x:290,y:100}];
  const newG=beginPinch(v,other);
  const unchanged=calculatePinch(newG,other);
  assert.deepEqual(unchanged,{x:v.x,y:v.y,scale:v.scale});
});
test('pinch supports extreme zoom limits and pan without jump',()=>{
  const v=view(),g=beginPinch(v,[{x:0,y:0},{x:100,y:0}]);
  assert.equal(calculatePinch(g,[{x:0,y:0},{x:10000,y:0}]).scale,32);
  assert.equal(calculatePinch(g,[{x:0,y:0},{x:.01,y:0}]).scale,.125);
  assert.deepEqual(panDelta({x:150,y:80},{x:160,y:60}),{dx:10,dy:-20});
  assert.throws(()=>beginPinch(v,[{x:0,y:0}]),/two pointers/);
});
