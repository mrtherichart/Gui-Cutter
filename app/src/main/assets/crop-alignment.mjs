/** Geometry for crop alignment, measured in screen pixels. */
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function placeTemplate(t,px,py,iw,ih){
  if(!t||t.w>iw||t.h>ih)return null;
  return {x:clamp(Math.round(px-t.w/2),0,iw-t.w),y:clamp(Math.round(py-t.h/2),0,ih-t.h),w:t.w,h:t.h};
}
const anchors=(r,axis)=>axis==='x'
  ?[{kind:'start',point:r.x},{kind:'center',point:r.x+r.w/2},{kind:'end',point:r.x+r.w}]
  :[{kind:'start',point:r.y},{kind:'center',point:r.y+r.h/2},{kind:'end',point:r.y+r.h}];
function movingKinds(mode,handle,axis){
  if(mode==='move')return ['start','center','end'];
  if(mode==='resize'){
    const h=String(handle||''),near=axis==='x'?['tl','bl','edge_left']:['tl','tr','edge_top'],far=axis==='x'?['tr','br','edge_right']:['bl','br','edge_bottom'];
    if(near.includes(h))return ['start'];
    if(far.includes(h))return ['end'];
  }
  return [];
}
export function alignRect(rect,others,{scale=1,tolerancePx=9,exclude=-1,mode='move',handle=null,iw=Infinity,ih=Infinity}={}){
  const out={...rect},guides=[],threshold=tolerancePx/Math.max(scale,.001);
  for(const axis of ['x','y']){
    const kinds=movingKinds(mode,handle,axis);if(!kinds.length)continue;let best=null;
    for(const own of anchors(rect,axis).filter(a=>kinds.includes(a.kind))){
      for(let index=0;index<others.length;index++){
        if(index===exclude)continue;
        const ref=others[index];if(!ref||ref.w<=0||ref.h<=0)continue;
        for(const remote of anchors(ref,axis)){
          const delta=remote.point-own.point,distance=Math.abs(delta)*scale;
          if(distance>tolerancePx)continue;
          const score=distance+(own.kind===remote.kind?0:.2);
          if(!best||score<best.score)best={score,delta,ref,at:remote.point,kind:own.kind};
        }
      }
    }
    if(!best||Math.abs(best.delta)>threshold)continue;
    const pos=axis==='x'?'x':'y',extent=axis==='x'?'w':'h',bound=axis==='x'?iw:ih;
    let shift=best.delta;
    if(mode==='move'){shift=clamp(out[pos]+shift,0,bound-out[extent])-out[pos];out[pos]=Math.round(out[pos]+shift);}
    else if(best.kind==='start'){
      const far=out[pos]+out[extent],near=clamp(out[pos]+shift,0,far-1);
      shift=near-out[pos];out[pos]=Math.round(near);out[extent]=Math.max(1,Math.round(far-near));
    }else{
      const far=clamp(out[pos]+out[extent]+shift,out[pos]+1,bound);
      shift=far-(out[pos]+out[extent]);out[extent]=Math.max(1,Math.round(far-out[pos]));
    }
    if(Math.abs(shift-best.delta)>.6)continue;
    const other=axis==='x'?'y':'x',otherExtent=axis==='x'?'h':'w';
    guides.push({axis,at:best.at,start:Math.min(out[other],best.ref[other]),end:Math.max(out[other]+out[otherExtent],best.ref[other]+best.ref[otherExtent])});
  }
  return {rect:out,guides,found:guides.length>0};
}
export function focusTarget(view,crop,{width,height,visibleBottom=height,rightReserve=52,center=false}={}){
  if(!crop||!width||!height)return null;
  const vw=Math.max(75,width-rightReserve),vh=Math.max(75,Math.min(height,visibleBottom)),pad=22;
  let scale=view.scale;
  const x0=crop.x*scale+view.x,y0=crop.y*scale+view.y;
  const visible=crop.w*scale<vw-2*pad&&crop.h*scale<vh-2*pad&&x0>=pad&&y0>=pad&&x0+crop.w*scale<=vw-pad&&y0+crop.h*scale<=vh-pad;
  if(visible&&!center)return {x:view.x,y:view.y,scale:view.scale,changed:false};
  const fit=Math.min((vw-2*pad)/crop.w,(vh-2*pad)/crop.h);
  if(scale>fit)scale=Math.max(.125,Math.min(scale,fit));
  else if(!center&&Math.max(crop.w*scale,crop.h*scale)<42)scale=Math.min(32,fit,scale*1.7);
  const x=vw/2-(crop.x+crop.w/2)*scale,y=vh/2-(crop.y+crop.h/2)*scale;
  const changed=Math.abs(view.x-x)>.01||Math.abs(view.y-y)>.01||Math.abs(view.scale-scale)>.00001;
  return {x,y,scale,changed};
}