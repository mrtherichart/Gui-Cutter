import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedCache,assetListKey,intersectsViewport} from '../app/src/main/assets/editor-performance.mjs';

test('viewport culls remote crops but retains edge-adjacent gizmos',()=>{
  assert.equal(intersectsViewport(500,0,600,100,360,600,32),false);
  assert.equal(intersectsViewport(380,0,430,100,360,600,32),true);
  assert.equal(intersectsViewport(-20,-10,10,10,360,600,0),true);
  assert.equal(intersectsViewport(0,800,100,900,360,600,32),false);
});
test('list content key is stable across selection and changes on edits or layout',()=>{
  const a=[{asset_id:'button',x:10,y:20,w:50,h:30}];
  const initial=assetListKey(a,1,'list');
  assert.equal(initial,assetListKey(a,1,'list'));
  assert.notEqual(initial,assetListKey(a,2,'list'));
  assert.notEqual(initial,assetListKey(a,1,'grid'));
  a[0].w=60;
  assert.notEqual(initial,assetListKey(a,1,'list'));
});
test('bounded cache keeps recently used thumbnails and evicts only oldest',()=>{
  const cache=new BoundedCache(2);
  cache.set('a',1);cache.set('b',2);assert.equal(cache.get('a'),1);
  cache.set('c',3);assert.equal(cache.has('b'),false);
  assert.equal(cache.get('a'),1);assert.equal(cache.get('c'),3);
  assert.equal(cache.size,2);cache.clear();assert.equal(cache.size,0);
  assert.throws(()=>new BoundedCache(0),RangeError);
});
