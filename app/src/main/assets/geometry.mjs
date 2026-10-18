export const limit = (v,min,max) => Math.max(min,Math.min(max,v));
export class Viewport {
  constructor() {this.scale=1; this.x=0; this.y=0;}
  toScreen(x,y) {return {x:x*this.scale+this.x,y:y*this.scale+this.y};}
  toImage(x,y) {return {x:(x-this.x)/this.scale,y:(y-this.y)/this.scale};}
  zoomTo(value,cx,cy) {
    const point=this.toImage(cx,cy);
    this.scale=limit(value,0.125,32);
    this.x=cx-point.x*this.scale;
    this.y=cy-point.y*this.scale;
  }
  pan(dx,dy){this.x+=dx;this.y+=dy;}
  fit(iw,ih,vw,vh){if(!iw||!ih)return;this.scale=Math.min((vw-32)/iw,(vh-32)/ih,1);this.x=(vw-iw*this.scale)/2;this.y=(vh-ih*this.scale)/2;}
}
export function handles(a) {
  const x=a.x,y=a.y,r=x+a.w,b=y+a.h,mx=x+Math.floor(a.w/2),my=y+Math.floor(a.h/2);
  const result={tl:[x,y],tr:[r,y],bl:[x,b],br:[r,b],edge_left:[x,my],edge_right:[r,my],edge_top:[mx,y],edge_bottom:[mx,b],move:[mx,my]};
  if(a.kind==='nine_slice')Object.assign(result,{left:[x+a.left,my],right:[r-a.right,my],top:[mx,y+a.top],bottom:[mx,b-a.bottom]});
  return result;
}
export function hitHandle(a,view,screenX,screenY,radius=24){
  if(!a)return null;
  let closest=null,best=radius*radius;
  for(const [name,[x,y]] of Object.entries(handles(a))){const p=view.toScreen(x,y),d=(p.x-screenX)**2+(p.y-screenY)**2;if(d<=best){best=d;closest=name;}}
  return closest;
}
export function hitBorder(assets,view,px,py,tolerance=16){
  for(let i=assets.length-1;i>=0;i--){const a=assets[i],p=view.toImage(px,py),tol=tolerance/view.scale;
    if(p.x<a.x-tol||p.x>a.x+a.w+tol||p.y<a.y-tol||p.y>a.y+a.h+tol)continue;
    const d=Math.min(Math.abs(p.x-a.x),Math.abs(p.x-(a.x+a.w)),Math.abs(p.y-a.y),Math.abs(p.y-(a.y+a.h)));
    const inside=p.x>=a.x-tol&&p.x<=a.x+a.w+tol&&p.y>=a.y-tol&&p.y<=a.y+a.h+tol;
    if(inside&&d<=tol)return i;
  }
  return -1;
}
export function adjust(a,handle,ix,iy,iw,ih) {
  const x=limit(Math.round(ix),0,iw),y=limit(Math.round(iy),0,ih),out={...a};
  let l=a.x,t=a.y,r=a.x+a.w,b=a.y+a.h;
  if(handle==='tl'||handle==='bl'||handle==='edge_left')l=Math.min(x,r-1);
  if(handle==='tr'||handle==='br'||handle==='edge_right')r=Math.max(x,l+1);
  if(handle==='tl'||handle==='tr'||handle==='edge_top')t=Math.min(y,b-1);
  if(handle==='bl'||handle==='br'||handle==='edge_bottom')b=Math.max(y,t+1);
  if(['tl','tr','bl','br','edge_left','edge_right','edge_top','edge_bottom'].includes(handle)){
    Object.assign(out,{x:l,y:t,w:r-l,h:b-t});
    // Margins must still fit if the outer rectangle shrinks.
    out.left=limit(out.left,0,out.w-1);out.right=limit(out.right,0,out.w-out.left-1);
    out.top=limit(out.top,0,out.h-1);out.bottom=limit(out.bottom,0,out.h-out.top-1);
  }else if(handle==='left')out.left=limit(x-a.x,0,a.w-a.right-1);
  else if(handle==='right')out.right=limit(a.x+a.w-x,0,a.w-a.left-1);
  else if(handle==='top')out.top=limit(y-a.y,0,a.h-a.bottom-1);
  else if(handle==='bottom')out.bottom=limit(a.y+a.h-y,0,a.h-a.top-1);
  return out;
}
export function move(a,dx,dy,iw,ih){return {...a,x:limit(a.x+Math.round(dx),0,iw-a.w),y:limit(a.y+Math.round(dy),0,ih-a.h)};}
export function rectangle(x0,y0,x1,y1,iw,ih) {
  const a=limit(Math.floor(Math.min(x0,x1)),0,iw-1),b=limit(Math.floor(Math.min(y0,y1)),0,ih-1);
  return {x:a,y:b,w:limit(Math.ceil(Math.abs(x1-x0)),1,iw-a),h:limit(Math.ceil(Math.abs(y1-y0)),1,ih-b)};
}
export function snap(edges,iw,ih,x,y,handle,radius=10){
  if(!edges||!handle)return {x,y,found:false};
  let sx=Math.round(x),sy=Math.round(y),found=false;
  const snapX=['left','right','edge_left','edge_right','tl','tr','bl','br'].includes(handle);
  const snapY=['top','bottom','edge_top','edge_bottom','tl','tr','bl','br'].includes(handle);
  let bestX=Infinity,bestY=Infinity;
  for(let py=Math.max(0,sy-radius);py<=Math.min(ih-1,sy+radius);py++){
    for(let px=Math.max(0,sx-radius);px<=Math.min(iw-1,sx+radius);px++){
      if(!edges[py*iw+px])continue;
      const dx=Math.abs(px-sx),dy=Math.abs(py-sy);
      if(snapX){const score=dx+dy*2.75-(radius-dx)*0.35;if(score<bestX){bestX=score;x=px;found=true;}}
      if(snapY){const score=dy+dx*2.75-(radius-dy)*0.35;if(score<bestY){bestY=score;y=py;found=true;}}
    }
  }
  if(snapX&&bestX<Infinity)sx=x;
  if(snapY&&bestY<Infinity)sy=y;
  if(snapX&&['right','edge_right','tr','br'].includes(handle)&&bestX<Infinity)sx++;
  if(snapY&&['bottom','edge_bottom','bl','br'].includes(handle)&&bestY<Infinity)sy++;
  return {x:sx,y:sy,found};
}
export function nineParts(a) {
  const xs=[0,a.left,a.w-a.right,a.w],ys=[0,a.top,a.h-a.bottom,a.h];
  const parts=[];
  for(let r=0;r<3;r++)for(let c=0;c<3;c++)parts.push({x:xs[c],y:ys[r],w:xs[c+1]-xs[c],h:ys[r+1]-ys[r],row:r,col:c});
  return parts;
}