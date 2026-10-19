// Pure pinch and pan geometry: one source of truth for touch coordinates.
// Source pixels are stable under the pinch centroid, regardless of zoom.
import {limit} from './geometry.mjs';

export function beginPinch(view,points){
  if(points.length<2)throw new Error('Pinch requires two pointers');
  const [a,b]=points;
  const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return {distance:Math.hypot(a.x-b.x,a.y-b.y)||1,
    scale:view.scale,anchor:view.toImage(center.x,center.y)};
}
export function calculatePinch(gesture,points){
  if(points.length<2)throw new Error('Pinch requires two pointers');
  const [a,b]=points,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const scale=limit(gesture.scale*(Math.hypot(a.x-b.x,a.y-b.y)||1)/gesture.distance,.125,32);
  return {scale,x:center.x-gesture.anchor.x*scale,y:center.y-gesture.anchor.y*scale};
}
export function panDelta(previous,current){
  return {dx:current.x-previous.x,dy:current.y-previous.y};
}
