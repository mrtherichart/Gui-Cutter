import test from 'node:test';
import assert from 'node:assert/strict';
import {placeTemplate,alignRect,focusTarget} from '../app/src/main/assets/crop-alignment.mjs';
const a={x:10,y:20,w:60,h:30},b={x:12,y:85,w:60,h:30};
const run=(r,others=[a],opts={})=>alignRect(r,others,{scale:1,iw:500,ih:500,...opts});
test('tap placement copies selected dimensions and clamps to image',()=>{
 assert.deepEqual(placeTemplate(a,140,110,300,200),{x:110,y:95,w:60,h:30});
 assert.deepEqual(placeTemplate(a,3,2,300,200),{x:0,y:0,w:60,h:30});
 assert.equal(placeTemplate({w:500,h:80},3,2,300,200),null);
});
test('align both independent axes and exclude current crop',()=>{
 const r=run({x:13,y:117,w:60,h:30},[a,b]);
 assert.equal(r.rect.x,12);assert.equal(r.rect.y,115);
 assert.deepEqual(r.guides.map(g=>g.axis),['x','y']);
 assert.equal(run({x:11,y:20,w:60,h:30},[a],{exclude:0}).found,false);
});
test('snap tolerance is measured in display pixels',()=>{
 assert.equal(run({x:17,y:200,w:60,h:30},[a],{scale:2}).guides.length,0);
 assert.equal(run({x:17,y:200,w:60,h:30},[a],{scale:.5}).guides.length,1);
});
test('resizing only moves the active handle edge',()=>{
 const r=run({x:100,y:200,w:28,h:20},[{x:130,y:70,w:30,h:20}],{mode:'resize',handle:'br'});
 assert.equal(r.rect.x,100);assert.equal(r.rect.w,30);assert.equal(r.rect.y,200);
 assert.equal(run(a,[b],{mode:'resize',handle:'left'}).found,false);
});
test('focus keeps visible targets steady and recenters hidden ones',()=>{
 assert.equal(focusTarget({x:0,y:0,scale:1},{x:35,y:40,w:60,h:40},{width:360,height:700,visibleBottom:350}).changed,false);
 const f=focusTarget({x:0,y:0,scale:1},{x:30,y:600,w:60,h:40},{width:360,height:700,visibleBottom:360});
 assert.equal(f.changed,true);assert.ok(f.y<0);
 assert.ok(focusTarget({x:0,y:0,scale:4},{x:30,y:40,w:200,h:130},{width:360,height:700,visibleBottom:420}).scale<4);
});