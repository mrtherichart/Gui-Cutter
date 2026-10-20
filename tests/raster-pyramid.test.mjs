import test from 'node:test';
import assert from 'node:assert/strict';
import {mipLevelForZoom,rasterSourceRect,RasterPyramid,RasterBudgetCache} from '../app/src/main/assets/raster-pyramid.mjs';
import {visibleImageRegion,visibleCropRegion} from '../app/src/main/assets/editor-performance.mjs';

const factoryCalls=[];
function canvasFactory(w,h){
  const operations=[];
  factoryCalls.push({w,h,operations});
  return {width:w,height:h,getContext(){return {drawImage(...args){operations.push(args);},set imageSmoothingEnabled(v){this.smooth=v},set imageSmoothingQuality(v){this.quality=v}}}};
}

test('mip level is selected by physical device pixels and returns native at high zoom',()=>{
  assert.equal(mipLevelForZoom(5.79,3),0);
  assert.equal(mipLevelForZoom(1,1),0);
  assert.equal(mipLevelForZoom(.25,1),2);
  assert.equal(mipLevelForZoom(.125,3),1);
  assert.equal(mipLevelForZoom(.125,1),3);
  assert.equal(mipLevelForZoom(.5,2),0);
  assert.equal(mipLevelForZoom(.125,0),0);
});

test('pyramid builds only required levels once, and remains source-native at high zoom',()=>{
  factoryCalls.length=0;
  const image={width:1448,height:1086};
  const raster=new RasterPyramid(image,1448,1086,canvasFactory);
  assert.strictEqual(raster.get(0),image);
  assert.equal(factoryCalls.length,0);
  const l2=raster.get(2);
  assert.deepEqual([l2.width,l2.height],[362,272]);
  assert.equal(factoryCalls.length,2);
  assert.strictEqual(raster.get(2),l2);
  assert.equal(factoryCalls.length,2);
  assert.deepEqual([raster.get(3).width,raster.get(3).height],[181,136]);
  assert.equal(factoryCalls.length,3);
  raster.release();
  assert.equal(l2.width,0);
  assert.strictEqual(raster.get(0),image);
});

test('mipmapped and native visible regions map to the same absolute screen-pixel interval',()=>{
  const panX=-1950.75,panY=-140.25,zoom=5.79;
  const src=visibleImageRegion(panX,panY,zoom,1448,1086,864,1536);
  const full=rasterSourceRect(src,1448,1086,1448,1086);
  assert.deepEqual(full,src);
  const half=rasterSourceRect(src,1448,1086,724,543);
  assert.equal(half.dx,src.dx);
  assert.equal(half.dy,src.dy);
  assert.equal(half.dw,src.dw);
  assert.equal(half.dh,src.dh);
  assert.equal(half.sx*2,src.sx);
  const crop={x:300,y:22,w:656,h:315};
  const clipped=visibleCropRegion(src,crop,panX,panY,zoom);
  assert.ok(clipped);
  const csmall=rasterSourceRect(clipped,crop.w,crop.h,328,158);
  assert.equal(csmall.dx,clipped.dx);
  assert.equal(csmall.dy,clipped.dy);
  assert.equal(csmall.sx*2,clipped.sx);
});

test('cache reuses recent raster and evicts oldest without altering the source image',()=>{
  const cache=new RasterBudgetCache(250);
  const a=new RasterPyramid({width:6,height:5},6,5,canvasFactory);
  const b=new RasterPyramid({width:6,height:5},6,5,canvasFactory);
  cache.set('a',a);
  cache.set('b',b);
  assert.strictEqual(cache.get('a'),a);
  assert.equal(cache.size,2);
  const c=new RasterPyramid({width:6,height:5},6,5,canvasFactory);
  cache.set('c',c);
  assert.equal(cache.get('b'),null);
  assert.strictEqual(cache.get('a'),a);
  cache.clear();assert.equal(cache.size,0);
});

test('one oversized image can be cached instead of being repeatedly recomputed',()=>{
  const cache=new RasterBudgetCache(100);
  const huge=new RasterPyramid({width:800,height:600},800,600,canvasFactory);
  cache.set('large',huge);
  assert.strictEqual(cache.get('large'),huge);
});

test('display mipmaps gracefully fall back to native if canvas allocation fails',()=>{
  let called=0;const fail=()=>{called++;throw new Error('no memory');};
  const source={width:64,height:64};
  const raster=new RasterPyramid(source,64,64,fail);
  assert.strictEqual(raster.get(3),source);
  assert.strictEqual(raster.get(3),source);
  assert.equal(called,1);
});

test('odd dimensions stay anchored to the original extent at every mip resolution',()=>{
  const region={sx:3,sy:2,sw:35,sh:22,dx:13.45,dy:21.75,dw:31.5,dh:19.8};
  const sample=rasterSourceRect(region,101,77,51,39);
  assert.ok(Math.abs(sample.sx/sample.sw-region.sx/region.sw)<1e-12);
  assert.ok(Math.abs(sample.sy/sample.sh-region.sy/region.sh)<1e-12);
  assert.deepEqual([sample.dx,sample.dy,sample.dw,sample.dh],[region.dx,region.dy,region.dw,region.dh]);
});
