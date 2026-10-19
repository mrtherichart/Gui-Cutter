import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedCache,assetListKey,intersectsViewport,visibleCheckerboard,visibleImageRegion} from '../app/src/main/assets/editor-performance.mjs';
import {Project,makeAsset} from '../app/src/main/assets/model.mjs';

test('viewport culls remote crops but retains edge-adjacent gizmos',()=>{
  assert.equal(intersectsViewport(500,0,600,100,360,600,32),false);
  assert.equal(intersectsViewport(380,0,430,100,360,600,32),true);
  assert.equal(intersectsViewport(-20,-10,10,10,360,600,0),true);
  assert.equal(intersectsViewport(0,800,100,900,360,600,32),false);
});
test('asset list invalidates for actual model changes but not for selection',()=>{
  const p=new Project();p.imageWidth=500;p.imageHeight=200;
  p.insert(makeAsset('button','normal',10,20,50,30,500,200));
  const original=assetListKey(p.revision,1,'list');
  p.selected=0;
  assert.equal(original,assetListKey(p.revision,1,'list'));
  assert.notEqual(original,assetListKey(p.revision,2,'list'));
  assert.notEqual(original,assetListKey(p.revision,1,'grid'));
  p.update(0,{w:60});
  const edited=assetListKey(p.revision,1,'list');
  assert.notEqual(original,edited);
  p.undo();
  assert.notEqual(edited,assetListKey(p.revision,1,'list'));
  p.redo();
  assert.notEqual(original,assetListKey(p.revision,1,'list'));
  p.reset([]);
  assert.notEqual(original,assetListKey(p.revision,1,'list'));
});
test('reverting an unfinished drag invalidates thumbnails and preserves history',()=>{
  const p=new Project();p.imageWidth=100;p.imageHeight=100;
  p.insert(makeAsset('button','normal',10,20,30,30,100,100));
  const before=p.snapshot(),beforeRev=p.revision,beforeCursor=p.cursor;
  p.assets[0]={...p.assets[0],x:70};
  p.restoreSnapshot(before);
  assert.deepEqual(p.assets[0].x,10);
  assert.ok(p.revision>beforeRev);
  assert.equal(p.cursor,beforeCursor);
});
test('checkerboard only generates visible cells and stops subpixel overdraw',()=>{
  assert.equal(visibleCheckerboard(0,0,.125,4096,4096,412,850),null);
  const grid=visibleCheckerboard(-100,-180,1,4096,4096,412,850);
  assert.deepEqual([grid.x0,grid.y0,grid.x1,grid.y1],[7,12,37,74]);
  assert.ok((grid.x1-grid.x0)*(grid.y1-grid.y0)<2000);
  assert.equal(visibleCheckerboard(1000,1000,1,50,50,412,850),null);
  assert.equal(visibleCheckerboard(-10000,-10000,1,50,50,412,850),null);
});
test('visible image rendering scales with canvas rather than entire zoomed image',()=>{
  const r=visibleImageRegion(-4000,-2200,16,4096,4096,412,850);
  assert.ok(r.sw<32 && r.sh<60);
  assert.equal(r.dx,-4000+r.sx*16);
  assert.equal(r.dy,-2200+r.sy*16);
  const whole=visibleImageRegion(25,40,.25,320,180,412,850);
  assert.deepEqual([whole.sx,whole.sy,whole.sw,whole.sh],[0,0,320,180]);
  assert.equal(visibleImageRegion(1000,1000,1,320,180,412,850),null);
  assert.equal(visibleImageRegion(0,0,0,320,180,412,850),null);
});
test('bounded cache keeps recently used thumbnails and evicts only oldest',()=>{
  const cache=new BoundedCache(2);
  cache.set('a',1);cache.set('b',2);assert.equal(cache.get('a'),1);
  cache.set('c',3);assert.equal(cache.has('b'),false);
  assert.equal(cache.get('a'),1);assert.equal(cache.get('c'),3);
  assert.equal(cache.size,2);cache.clear();assert.equal(cache.size,0);
  assert.throws(()=>new BoundedCache(0),RangeError);
});
