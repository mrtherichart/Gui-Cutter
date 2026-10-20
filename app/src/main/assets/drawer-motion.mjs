// Drawer motion math is independent of the DOM and Android WebView.
// Distances use pixels; p=0 is fully closed and p=1 is fully open.
export const clamp01 = n => Math.max(0,Math.min(1,n));

export function lockedAxis(dx,dy,{slop=11,dominance=1.32}={}){
  const x=Math.abs(dx),y=Math.abs(dy);
  if(Math.max(x,y)<slop)return null;
  if(x>y*dominance)return 'x';
  if(y>x*dominance)return 'y';
  return null;
}

export class ReleaseTracker {
  constructor(){this.samples=[];}
  add(openPixels,timeMs){
    if(!Number.isFinite(openPixels)||!Number.isFinite(timeMs))return;
    const last=this.samples.at(-1);
    if(last&&timeMs<last.t)return;
    if(last&&timeMs===last.t){last.x=openPixels;return;}
    this.samples.push({x:openPixels,t:timeMs});
    while(this.samples.length>2&&(this.samples[1].t<timeMs-105||this.samples.length>16))this.samples.shift();
  }
  velocity(){
    if(this.samples.length<2)return {pixelsPerMs:0,travel:0};
    const end=this.samples.at(-1);
    // Recent direction has priority over a long drag in the opposite direction.
    const cutoff=end.t-80;
    let first=this.samples.at(-2);
    for(let i=this.samples.length-2;i>=0;i--){
      if(this.samples[i].t<cutoff)break;
      first=this.samples[i];
    }
    const dt=end.t-first.t;
    if(dt<8)return {pixelsPerMs:0,travel:0};
    return {pixelsPerMs:(end.x-first.x)/dt,travel:end.x-first.x};
  }
}

export function settleTarget(progress,tracker,spanPx,{signedTravel=0,startProgress=0}={}){
  const p=clamp01(progress),{pixelsPerMs:v,travel}=tracker.velocity();
  // Recent reversal beats a long initial pull in the opposite direction.
  if(Math.abs(v)>=.14&&Math.abs(travel)>=5)return v>0?1:0;
  // A deliberate pull should complete in its chosen direction even at 20-40% open.
  // This is symmetric for both edges and for opening/closing.
  if(Math.abs(signedTravel)>=24)return signedTravel>0?1:0;
  // Small accidental movements retain the starting state.
  if(Math.abs(signedTravel)<12 && startProgress!==0)return p>=.5?1:0;
  const projected=p+(v*125)/Math.max(1,spanPx);
  return projected>.5?1:0;
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
