import test from 'node:test';
import assert from 'node:assert/strict';
import {Project,makeAsset,verifyAssets,normalizeAsset,filenameFor} from '../app/src/main/assets/model.mjs';
import {Viewport,handles,hitHandle,hitBorder,adjust,move,rectangle,snap,nineParts} from '../app/src/main/assets/geometry.mjs';

test('desktop manifest remains compatible',()=>{
 const p=new Project();p.imageWidth=320;p.imageHeight=200;
 p.load({image_path:'/old/desktop/base.png',assets:[{asset_id:'my_button',kind:'nine_slice',x:15,y:20,w:90,h:60,left:9,top:10,right:11,bottom:12}]});
 assert.equal(p.manifest().image_path,'base.png');assert.equal(p.active,null);
 assert.equal(p.assets[0].right,11);
 assert.deepEqual(Object.keys(p.assets[0]),['asset_id','kind','x','y','w','h','left','top','right','bottom']);
});
test('history commits and redo branch',()=>{
 const p=new Project();p.imageWidth=300;p.imageHeight=100;
 p.insert(makeAsset('button','normal',0,0,60,30,300,100));
 p.update(0,{x:4});assert.equal(p.cursor,2);p.undo();assert.equal(p.assets[0].x,0);p.redo();assert.equal(p.assets[0].x,4);
 p.undo();p.update(0,{x:7});assert.equal(p.assets[0].x,7);assert.equal(p.redo(),false);
 p.markSaved();assert.equal(p.dirty,false);p.undo();assert.equal(p.dirty,true);
});
test('filename collision and duplicate id blocked',()=>{
 const first=makeAsset('a:b','normal',0,0,10,10,100,100);
 const second=makeAsset('a?b','normal',20,0,10,10,100,100);
 assert.equal(filenameFor(first.asset_id),filenameFor(second.asset_id));
 assert.throws(()=>verifyAssets([first,second],100,100),/collide/);
 assert.throws(()=>verifyAssets([first,first],100,100),/Duplicate/);
});
test('right and bottom edges use exclusive image bounds',()=>{
 const a=normalizeAsset({asset_id:'edge',kind:'normal',x:99,y:79,w:12,h:6},100,80);
 assert.deepEqual([a.x,a.y,a.w,a.h],[99,79,1,1]);
 assert.deepEqual([rectangle(8,8,100,80,100,80).w,rectangle(8,8,100,80,100,80).h],[92,72]);
});
test('nine-slice remains single crop with 9 preview pieces',()=>{
 const a=makeAsset('panel','nine_slice',10,20,100,60,400,400);
 assert.equal(nineParts(a).length,9);assert.equal(nineParts(a).reduce((n,p)=>n+p.w*p.h,0),6000);
 const changed=adjust(a,'right',a.x+65,40,400,400);assert.equal(changed.right,35);
});
test('viewport zoom anchored at two-finger centroid',()=>{
 const v=new Viewport();v.scale=.8;v.x=50;v.y=17;
 const before=v.toImage(180,90);v.zoomTo(2.4,180,90);
 assert.ok(Math.abs(v.toImage(180,90).x-before.x)<1e-9);
 assert.ok(Math.abs(v.toImage(180,90).y-before.y)<1e-9);
});
test('hit target independent of zoom scale',()=>{
 const a=makeAsset('a','normal',20,20,30,30,100,100),v=new Viewport();v.scale=.5;
 const p=v.toScreen(20,20);assert.equal(hitHandle(a,v,p.x,p.y,24),'tl');
 assert.equal(hitBorder([a],v,25,17,16),0);
});
test('snap has directional weighted position',()=>{
 const edges=new Uint8Array(100*100);edges[22*100+11]=1;
 const a=snap(edges,100,100,12,20,'tl');assert.equal(a.x,11);assert.equal(a.y,22);
 const b=snap(edges,100,100,12,20,'br');assert.equal(b.x,12);assert.equal(b.y,23);
 assert.equal(snap(edges,100,100,12,20,null).found,false);
});
test('moving a crop cannot change its size or leave image',()=>{
 const a=makeAsset('a','normal',10,10,50,30,100,80);
 const b=move(a,100,100,100,80);assert.deepEqual([b.x,b.y,b.w,b.h],[50,50,50,30]);
});