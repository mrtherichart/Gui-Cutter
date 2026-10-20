import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTransparency,normalizeTransparency} from '../app/src/main/assets/transparency.mjs';
import {Project} from '../app/src/main/assets/model.mjs';
const picture=(w,h,rgb)=>{
  const data=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)data.set([...rgb,255],i*4);
  return {width:w,height:h,data};
};
const dot=(im,x,y,rgb)=>im.data.set([...rgb,255],(y*im.width+x)*4);
const pixel=(im,x,y)=>[...im.data.slice((y*im.width+x)*4,(y*im.width+x)*4+4)];
test('all disconnected corners are removed by virtual outside selection',()=>{
  const im=picture(8,8,[255,255,255]);
  for(let y=1;y<7;y++)for(let x=1;x<7;x++)dot(im,x,y,[20,80,180]);
  // White island enclosed by blue foreground must survive.
  dot(im,3,3,[255,255,255]);
  applyTransparency(im,{colors:['#ffffff'],tolerance:5});
  for(const [x,y] of [[0,0],[7,0],[0,7],[7,7]])assert.equal(pixel(im,x,y)[3],0);
  assert.equal(pixel(im,3,3)[3],255);
  assert.equal(pixel(im,2,2)[3],255);
});
test('all matching optionally removes enclosed islands',()=>{
  const im=picture(7,7,[255,255,255]);
  for(let y=1;y<6;y++)for(let x=1;x<6;x++)dot(im,x,y,[0,30,70]);
  dot(im,3,3,[255,255,255]);
  applyTransparency(im,{colors:['#FFFFFF'],all:true});
  assert.equal(pixel(im,3,3)[3],0);
});
test('tolerance accepts mild variation while keeping different foreground',()=>{
  const im=picture(5,5,[245,246,245]);dot(im,0,0,[238,239,238]);dot(im,2,2,[40,40,40]);
  applyTransparency(im,{colors:['#F5F6F5'],tolerance:12});
  assert.equal(pixel(im,0,0)[3],0);
  assert.equal(pixel(im,2,2)[3],255);
});
test('semi-transparent edge is decontaminated, with no white halo',()=>{
  const im=picture(9,9,[255,255,255]);
  for(let y=1;y<8;y++)for(let x=2;x<8;x++)dot(im,x,y,[0,0,200]);
  for(let y=1;y<8;y++)dot(im,1,y,[128,128,227]);
  applyTransparency(im,{colors:['#ffffff'],tolerance:15});
  const result=pixel(im,1,4);
  assert.ok(result[3]>100 && result[3]<170,`expected 50% alpha: ${result}`);
  assert.ok(result[0]<10 && result[1]<10,`expected removed white contamination: ${result}`);
});
test('manifest and undo preserve project and asset colours but legacy stays optional',()=>{
  const p=new Project();p.imageWidth=20;p.imageHeight=20;p.load({image_path:'base.png',assets:[{asset_id:'a',kind:'normal',x:2,y:2,w:10,h:10}]});
  assert.equal(p.manifest().transparency,undefined);
  p.setTransparency({colors:['#FFFFFF'],tolerance:13});
  assert.deepEqual(p.manifest().transparency.colors,['#FFFFFF']);
  p.selected=0;p.setTransparency({colors:['#ABCDEF'],tolerance:4,all:true});
  assert.equal(p.effectiveTransparency().colors[0],'#ABCDEF');
  p.update(0,{x:4});assert.equal(p.active.transparency.colors[0],'#ABCDEF');
  assert.equal(p.undo(),true);assert.equal(p.active.x,2);
  assert.equal(p.undo(),true);assert.equal(p.active.transparency,undefined);
  assert.deepEqual(p.effectiveTransparency().colors,['#FFFFFF']);
  assert.equal(p.redo(),true);assert.equal(p.active.transparency.colors[0],'#ABCDEF');
  const other=new Project();other.imageWidth=20;other.imageHeight=20;other.load(p.manifest());
  assert.equal(other.assets[0].transparency.colors[0],'#ABCDEF');
});
test('normalization rejects malformed or repeated keys and bounds tolerance',()=>{
  const t=normalizeTransparency({colors:['#aabbcc','#AABBCC','#short','FFFFFF','#123456'],tolerance:200});
  assert.deepEqual(t.colors,['#AABBCC','#123456']);assert.equal(t.tolerance,100);
});


test('image-wide colours can be edited even while a crop is selected',()=>{
  const p=new Project();p.imageWidth=30;p.imageHeight=30;
  p.load({image_path:'base.png',assets:[{asset_id:'dialog',kind:'normal',x:2,y:3,w:15,h:12}]});
  p.selected=0;
  p.setTransparency({colors:['#FFFFFF'],tolerance:10},'image');
  assert.equal(p.transparency.colors[0],'#FFFFFF');
  assert.equal(p.active.transparency,undefined);
  p.setTransparency({colors:['#00FF00'],tolerance:3},'crop');
  assert.equal(p.transparency.colors[0],'#FFFFFF');
  assert.equal(p.active.transparency.colors[0],'#00FF00');
  p.undo();
  assert.equal(p.active.transparency,undefined);
  assert.equal(p.transparency.colors[0],'#FFFFFF');
});

test('opacity correction leaves fully opaque foreground pixels unchanged',()=>{
  const im=picture(15,15,[255,255,255]);
  for(let y=2;y<13;y++)for(let x=2;x<13;x++)dot(im,x,y,[14,60,120]);
  const original=pixel(im,7,7);
  applyTransparency(im,{colors:['#FFFFFF'],tolerance:20});
  assert.deepEqual(pixel(im,7,7),original);
});

test('soft neutral shadows connected to a white key are removed',()=>{
  const im=picture(13,9,[255,255,255]);
  for(let y=1;y<8;y++)for(let x=1;x<12;x++)dot(im,x,y,[245,245,245]);
  for(let y=2;y<7;y++)for(let x=2;x<11;x++)dot(im,x,y,[228,228,228]);
  for(let y=3;y<6;y++)for(let x=3;x<10;x++)dot(im,x,y,[211,211,211]);
  for(let y=4;y<5;y++)for(let x=4;x<9;x++)dot(im,x,y,[80,42,12]);
  applyTransparency(im,{colors:['#FFFFFF'],tolerance:30});
  assert.equal(pixel(im,2,3)[3],0,'outside diffuse shading should go');
  assert.equal(pixel(im,4,4)[3],255,'warm artwork should stay');
});

test('strong boundaries block similarly coloured foreground even at medium tolerance',()=>{
  const im=picture(13,13,[255,255,255]);
  for(let y=2;y<11;y++)for(let x=2;x<11;x++)dot(im,x,y,[191,191,191]);
  dot(im,6,6,[255,255,255]);
  applyTransparency(im,{colors:['#FFFFFF'],tolerance:55});
  assert.equal(pixel(im,0,0)[3],0);
  assert.equal(pixel(im,6,6)[3],255,'enclosed highlight should remain');
  assert.equal(pixel(im,5,6)[3],255,'strong edge should preserve object');
});

test('selected colour values are still the only persisted background data',()=>{
  const p=new Project();p.imageWidth=20;p.imageHeight=20;p.reset([]);
  p.setTransparency({colors:['#EEEEEE','#FFFFFF'],tolerance:37,all:false},'image');
  assert.deepEqual(Object.keys(p.manifest().transparency),['colors','tolerance','all']);
});

test('two picked background colours can cross hard checkerboard boundaries',()=>{
  const im=picture(16,16,[255,255,255]);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(((x/4)|0)+((y/4)|0)&1)dot(im,x,y,[198,200,202]);
  }
  for(let y=5;y<11;y++)for(let x=5;x<11;x++)dot(im,x,y,[110,60,28]);
  applyTransparency(im,{colors:['#FFFFFF','#C6C8CA'],tolerance:14});
  assert.equal(pixel(im,5,1)[3],0,'inner checker cell removed');
  assert.equal(pixel(im,13,13)[3],0,'all four corners and inner cells removed');
  assert.equal(pixel(im,7,7)[3],255,'foreground still visible');
});

test('clean-edge defaults to disabled and is optional in legacy JSON', async()=>{
  const {cleanAlphaEdge}=await import('../app/src/main/assets/edge-cleanup.mjs');
  const data=picture(5,5,[155,74,28]);
  const orig=[...data.data];
  cleanAlphaEdge(data,0);
  assert.deepEqual([...data.data],orig);
  assert.deepEqual(normalizeTransparency({colors:['#abcdef'],tolerance:23}),{colors:['#ABCDEF'],tolerance:23,all:false});
});

test('edge cleanup only reduces existing alpha, without restoring erased background',async()=>{
  const {cleanAlphaEdge}=await import('../app/src/main/assets/edge-cleanup.mjs');
  const im=picture(9,9,[12,42,86]);
  for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(x<2||x>=7||y<2||y>=7)im.data[(y*9+x)*4+3]=0;
  const oldAlpha=Array.from({length:81},(_,i)=>im.data[i*4+3]);
  cleanAlphaEdge(im,75);
  for(let i=0;i<81;i++)assert.ok(im.data[i*4+3]<=oldAlpha[i],`alpha unexpectedly grew at ${i}`);
  assert.equal(pixel(im,4,4)[3],255,'opaque inner art remains exactly opaque');
  assert.equal(pixel(im,0,0)[3],0,'transparent background remains empty');
  assert.ok(pixel(im,2,4)[3]<255,'outer edge becomes antialiased');
  assert.deepEqual(pixel(im,4,4).slice(0,3),[12,42,86],'interior RGB preserved');
});

test('edge cleanup suppresses stray sharp pixels more strongly at higher values',async()=>{
  const {cleanAlphaEdge}=await import('../app/src/main/assets/edge-cleanup.mjs');
  const make=()=>{const im=picture(9,9,[0,0,0]);im.data.fill(0);
    for(let y=3;y<=5;y++)for(let x=3;x<=5;x++)dot(im,x,y,[40,60,100]);
    dot(im,6,4,[40,60,100]);return im;};
  const low=make(),high=make();cleanAlphaEdge(low,25);cleanAlphaEdge(high,100);
  assert.ok(pixel(high,6,4)[3]<pixel(low,6,4)[3]);
  assert.equal(pixel(high,4,4)[3],255);
});

test('edge cleanup gently decontaminates partially transparent fringe RGB',async()=>{
  const {cleanAlphaEdge}=await import('../app/src/main/assets/edge-cleanup.mjs');
  const im=picture(9,9,[20,32,62]);
  for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(x<3||y<2||y>6)im.data[(y*9+x)*4+3]=0;
  for(let y=2;y<=6;y++)im.data.set([110,120,128,128],(y*9+3)*4);
  cleanAlphaEdge(im,100);
  const repaired=pixel(im,3,4);
  assert.ok(repaired[0]<110&&repaired[1]<120&&repaired[2]<128,`${repaired}`);
  assert.ok(repaired[3]<=128);
  assert.deepEqual(pixel(im,6,4),[20,32,62,255]);
});

test('edge cleanup setting survives project/crop moves, JSON and undo',()=>{
  const p=new Project();p.imageWidth=100;p.imageHeight=100;
  p.load({assets:[{asset_id:'Panel',kind:'normal',x:5,y:6,w:20,h:18}]});
  p.setTransparency({colors:['#6D6D69'],tolerance:20,edgeCleanup:42},'image');
  assert.equal(p.manifest().transparency.edgeCleanup,42);
  p.selected=0;p.setTransparency({colors:['#6D6D69'],tolerance:20,edgeCleanup:77},'crop');
  p.update(0,{x:12});
  assert.equal(p.active.transparency.edgeCleanup,77);
  const saved=p.manifest(),reopened=new Project();reopened.imageWidth=100;reopened.imageHeight=100;reopened.load(saved);
  assert.equal(reopened.assets[0].transparency.edgeCleanup,77);
  assert.equal(reopened.transparency.edgeCleanup,42);
  p.undo();p.undo();assert.equal(p.active.transparency,undefined);
});
