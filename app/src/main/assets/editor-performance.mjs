// Pure viewport and list helpers, plus a bounded thumbnail cache.
// Kept independent of the DOM so that low-end-device behavior is testable in Node.
export function intersectsViewport(left,top,right,bottom,width,height,margin=0){
  return right>=-margin && bottom>=-margin && left<=width+margin && top<=height+margin;
}

export function assetListKey(revision,imageSequence,viewMode){
  // Project revision changes on every committed edit/reset/undo/redo.
  // Selection and live pointer movement do not rebuild the library.
  return `${imageSequence}:${revision}:${viewMode}`;
}

/** Returns the checkerboard's visible source-tile range, or null below useful detail.
 * Cell size is measured in source pixels; the screen-pixel threshold prevents
 * hundreds of thousands of imperceptible draw calls at minimum zoom.
 */
export function visibleCheckerboard(imageX,imageY,scale,imageWidth,imageHeight,
                                    screenWidth,screenHeight,cellSize=14,minCellPixels=3.5){
  const tile=cellSize*scale;
  if(!Number.isFinite(tile)||tile<minCellPixels||!imageWidth||!imageHeight)return null;
  const columns=Math.ceil(imageWidth/cellSize),rows=Math.ceil(imageHeight/cellSize);
  const x0=Math.max(0,Math.floor(-imageX/tile));
  const y0=Math.max(0,Math.floor(-imageY/tile));
  const x1=Math.min(columns,Math.ceil((screenWidth-imageX)/tile));
  const y1=Math.min(rows,Math.ceil((screenHeight-imageY)/tile));
  if(x1<=x0||y1<=y0)return null;
  return {x0,y0,x1,y1,tile};
}

/** Pixel-aligned source rectangle needed to paint the visible canvas.
 * The one-pixel apron prevents seams at fractional zoom and pan offsets.
 */
export function visibleImageRegion(imageX,imageY,scale,imageWidth,imageHeight,screenWidth,screenHeight){
  if(!Number.isFinite(scale)||scale<=0||imageWidth<=0||imageHeight<=0)return null;
  const sx=Math.max(0,Math.floor(-imageX/scale)-1);
  const sy=Math.max(0,Math.floor(-imageY/scale)-1);
  const ex=Math.min(imageWidth,Math.ceil((screenWidth-imageX)/scale)+1);
  const ey=Math.min(imageHeight,Math.ceil((screenHeight-imageY)/scale)+1);
  if(ex<=sx||ey<=sy)return null;
  return {sx,sy,sw:ex-sx,sh:ey-sy,dx:imageX+sx*scale,dy:imageY+sy*scale,dw:(ex-sx)*scale,dh:(ey-sy)*scale};
}

export class BoundedCache {
  constructor(capacity){
    if(!Number.isInteger(capacity)||capacity<1)throw new RangeError('Capacity must be positive.');
    this.capacity=capacity;
    this.entries=new Map();
  }
  get size(){return this.entries.size;}
  has(key){return this.entries.has(key);}
  get(key){
    if(!this.entries.has(key))return undefined;
    const value=this.entries.get(key);
    this.entries.delete(key);this.entries.set(key,value);
    return value;
  }
  set(key,value){
    this.entries.delete(key);
    this.entries.set(key,value);
    if(this.entries.size>this.capacity)this.entries.delete(this.entries.keys().next().value);
    return value;
  }
  clear(){this.entries.clear();}
}

/** The preview is either source-exact or absent, never resampled. */
export function exactPreviewSize(width,height,maxPixels=4_000_000){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>maxPixels)return null;
  return {width,height};
}

/** Region of an asset that intersects the already computed visible source.
 * Source coordinates are local to the asset; destination coordinates share
 * the unchanged global image origin used by visibleImageRegion(). */
export function visibleCropRegion(source,asset,imageX,imageY,scale){
  if(!source||!asset||!Number.isFinite(scale)||scale<=0)return null;
  const x=Math.max(source.sx,asset.x),y=Math.max(source.sy,asset.y);
  const right=Math.min(source.sx+source.sw,asset.x+asset.w);
  const bottom=Math.min(source.sy+source.sh,asset.y+asset.h);
  if(right<=x||bottom<=y)return null;
  const sw=right-x,sh=bottom-y;
  return {sx:x-asset.x,sy:y-asset.y,sw,sh,
    dx:imageX+x*scale,dy:imageY+y*scale,dw:sw*scale,dh:sh*scale};
}
