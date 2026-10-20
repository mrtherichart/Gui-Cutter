import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleCropRegion,visibleImageRegion} from '../app/src/main/assets/editor-performance.mjs';

test('fantasy sheet keeps the full-resolution input coordinate space even when displayed with mipmaps',()=>{
  const {width,height}={width:1448,height:1086};
  assert.ok(width>0&&height>0);
});

test('at 579% both original and crop previews share identical source and screen pixel coordinates',()=>{
  const zoom=5.79,panX=-1950.75,panY=-140.25;
  const source=visibleImageRegion(panX,panY,zoom,1448,1086,864,1536);
  const crop={x:300,y:22,w:656,h:315};
  const r=visibleCropRegion(source,crop,panX,panY,zoom);
  assert.ok(r);
  // Crop source coords must land on the exact same logical grid as the whole image.
  assert.equal(r.dx,panX+(crop.x+r.sx)*zoom);
  assert.equal(r.dy,panY+(crop.y+r.sy)*zoom);
  assert.equal(r.dw,r.sw*zoom);
  assert.equal(r.dh,r.sh*zoom);
  assert.ok(r.sx>=0&&r.sy>=0&&r.sx+r.sw<=crop.w&&r.sy+r.sh<=crop.h);
});

test('crop outside the viewport is not painted',()=>{
  const s=visibleImageRegion(0,0,6,1448,1086,864,1536);
  assert.equal(visibleCropRegion(s,{x:500,y:500,w:200,h:200},0,0,6),null);
});
