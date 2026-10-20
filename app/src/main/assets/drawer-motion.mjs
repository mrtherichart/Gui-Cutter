// Drawer motion math is independent of the DOM and Android WebView.
// Distances use pixels; p=0 is fully closed and p=1 is fully open.
export const clamp01 = n => Math.max(0,Math.min(1,n));

// The two drawer directions differ only by physical axis and opening sign.
export const drawerAxes=Object.freeze({
  app:Object.freeze({axis:'x',sign:1,tab:'files'}),
  sheet:Object.freeze({axis:'y',sign:-1,tab:'assets'})
});
export function drawerDisplacement(kind,dx,dy){
  const cfg=drawerAxes[kind];
  return cfg.sign*(cfg.axis==='x'?dx:dy);
}


export function lockedAxis(dx,dy,{slop=11,dominance=1.32}={}){
  const x=Math.abs(dx),y=Math.abs(dy);
  if(Math.max(x,y)<slop)return null;
  if(x>y*dominance)return 'x';
  if(y>x*dominance)return 'y';
  return null;
}

export class ReleaseTracker {
  constructor(){this.samples=[];this.low=Infinity;this.high=-Infinity;}
  add(openPixels,timeMs){
    if(!Number.isFinite(openPixels)||!Number.isFinite(timeMs))return;
    const last=this.samples.at(-1);
    if(last&&timeMs<last.t)return;
    if(last&&timeMs===last.t){last.x=openPixels;}
    else this.samples.push({x:openPixels,t:timeMs});
    this.low=Math.min(this.low,openPixels);
    this.high=Math.max(this.high,openPixels);
    // Only recent data is needed for velocity; extrema persist for intent/reversal.
    while(this.samples.length>2&&(this.samples[1].t<timeMs-135||this.samples.length>20))this.samples.shift();
  }
  velocity(){
    if(this.samples.length<2)return {pixelsPerMs:0,travel:0};
    const end=this.samples.at(-1),recent=this.samples.filter(p=>p.t>=end.t-105);
    if(recent.length<2)return {pixelsPerMs:0,travel:0};
    const travel=end.x-recent[0].x,dt=end.t-recent[0].t;
    if(dt<10)return {pixelsPerMs:0,travel:0};
    // Regression across the gesture tail is less vulnerable to one noisy release sample.
    const meanT=recent.reduce((s,p)=>s+p.t,0)/recent.length;
    const meanX=recent.reduce((s,p)=>s+p.x,0)/recent.length;
    let num=0,den=0;
    for(const p of recent){const t=p.t-meanT;num+=t*(p.x-meanX);den+=t*t;}
    return {pixelsPerMs:den?num/den:0,travel};
  }
}

export function settleTarget(progress,tracker,spanPx,{signedTravel=0,startProgress=0}={}){
  const p=clamp01(progress),span=Math.max(1,spanPx),{pixelsPerMs:v,travel}=tracker.velocity();
  const move=Math.abs(signedTravel),direction=Math.sign(signedTravel);
  const original=startProgress>=.5?1:0;
  const fling=Math.abs(v)>=.45 && Math.abs(travel)>=18;
  // A real reversal needs both substantial backtracking and sustained velocity.
  // The small wobble made while lifting a finger must never reverse a long pull.
  const backtrack=direction>0?tracker.high-p*span:p*span-tracker.low;
  const genuineReversal=direction!==0 && Math.sign(v)===-direction &&
    backtrack>=Math.max(32,span*.11) && Math.abs(v)>=.35;
  if(move>=24){
    if(genuineReversal)return direction>0?0:1;
    return direction>0?1:0;
  }
  if(fling)return v>0?1:0;
  // Short, ambiguous gestures should keep their original state, not flip at 50%.
  if(move<12)return original;
  if(p>.65)return 1;
  if(p<.35)return 0;
  return original;
}

// Exact critically damped spring: no oscillation, no overshoot, and frame-rate independent.
export function springAt(from,to,velocityPerSecond,elapsedMs,{frequency=20}={}){
  const t=Math.max(0,elapsedMs)/1000,d=from-to,c2=velocityPerSecond+frequency*d;
  const e=Math.exp(-frequency*t);
  const raw=to+(d+c2*t)*e;
  const p=clamp01(raw);
  return {progress:p,done:elapsedMs>120&&Math.abs(p-to)<.003||elapsedMs>=650};
}

// A clicked button is not a released drag: a short, decisive ease-out provides
// immediate travel and a predictable completion time on 60 Hz devices.
export function tapProgress(from,to,elapsedMs,durationMs){
  const t=clamp01(elapsedMs/Math.max(1,durationMs));
  const eased=1-(1-t)**3;
  return {progress:clamp01(from+(to-from)*eased),done:t>=1};
}
