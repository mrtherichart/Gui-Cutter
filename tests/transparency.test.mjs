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
