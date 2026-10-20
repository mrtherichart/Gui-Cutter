import test from 'node:test';
import assert from 'node:assert/strict';
import {ReleaseTracker,lockedAxis,settleTarget,springAt,tapProgress} from '../app/src/main/assets/drawer-motion.mjs';

function track(points){const t=new ReleaseTracker();for(const [x,ms] of points)t.add(x,ms);return t;}
test('finger axis locking ignores diagonals and small accidental movements',()=>{
 assert.equal(lockedAxis(5,3),null);
 assert.equal(lockedAxis(45,8),'x');
 assert.equal(lockedAxis(7,-38),'y');
 assert.equal(lockedAxis(17,16),null);
});
test('last closing momentum wins even after drawer is 85% open',()=>{
 const tr=track([[0,0],[48,75],[180,150],[165,190],[144,230],[125,255]]);
 assert.equal(settleTarget(.85,tr,350),0);
});
test('fast opening flick wins even at 18% open',()=>{
 const tr=track([[0,0],[10,70],[40,130],[65,160]]);
 assert.equal(settleTarget(.18,tr,350),1);
});
test('very small incidental reversal does not close an otherwise opened drawer',()=>{
 const tr=track([[0,0],[250,300],[252,420],[247,490]]);
 assert.equal(settleTarget(.79,tr,320),1);
});
test('short deliberate touch settles by position',()=>{
 assert.equal(settleTarget(.23,track([[0,0],[3,100]]),360),0);
 assert.equal(settleTarget(.77,track([[0,0],[3,100]]),360),1);
});
test('zero travel is inert and the tracker never invents velocity',()=>{
 const tr=track([[0,0]]);assert.deepEqual(tr.velocity(),{pixelsPerMs:0,travel:0});
});
test('critical spring settles smoothly with no bounce or overshoot',()=>{
 for(const [from,to,v] of [[0,1,0],[1,0,0],[.65,0,-.5],[.25,1,.6]]){
   let last=from;
   for(let ms=0;ms<=650;ms+=10){
      const value=springAt(from,to,v,ms).progress;
      assert.ok(value>=0&&value<=1);
      // For a velocity pointed at the target, every sample must progress toward it.
      if(to>from)assert.ok(value>=last-1e-5);
      else assert.ok(value<=last+1e-5);
      last=value;
   }
   assert.ok(Math.abs(last-to)<.003);
 }
});

test('recent reversal matters more than total swipe travel',()=>{
 const t=track([[0,0],[220,220],[253,260],[250,280],[231,300],[203,325]]);
 assert.equal(settleTarget(.92,t,320),0);
});
test('terminal closing direction ignores the old opening flick',()=>{
 const t=track([[0,0],[100,80],[300,160],[295,180],[278,210],[265,235]]);
 assert.ok(t.velocity().pixelsPerMs<0);
 assert.equal(settleTarget(.8,t,340),0);
});

test('tap animation responds immediately and settles within short durations',()=>{
  for(const [from,to,duration] of [[0,1,210],[1,0,165],[.55,1,95]]){
    assert.equal(tapProgress(from,to,0,duration).progress,from);
    assert.equal(tapProgress(from,to,duration,duration).progress,to);
    assert.equal(tapProgress(from,to,duration,duration).done,true);
    assert.equal(tapProgress(from,to,16,duration).done,false);
    const moved=tapProgress(from,to,16,duration).progress;
    assert.ok(to>from?moved>from:moved<from);
  }
});


test('symmetric deliberate opening and closing at partial progress',()=>{
  for(const span of [300,480]){
    const opening=track([[0,0],[48,180]]);
    const closing=track([[span,0],[span-48,180]]);
    assert.equal(settleTarget(.24,opening,span,{signedTravel:44,startProgress:0}),1);
    assert.equal(settleTarget(.76,closing,span,{signedTravel:-44,startProgress:1}),0);
  }
});
test('small edge grazes retain original position',()=>{
  const t=track([[0,0],[3,100]]);
  assert.equal(settleTarget(.02,t,330,{signedTravel:6,startProgress:0}),0);
  assert.equal(settleTarget(.98,t,330,{signedTravel:-6,startProgress:1}),1);
});
