// Display-only mipmaps: full-resolution image processing happens before the
// pyramid is built. All levels are painted in the original pixel coordinates.
// HTML Canvas 2D downsizing uses premultiplied-alpha compositing internally.
export function mipLevelForZoom(cssScale, deviceScale=1) {
  const pixelsPerSource=Math.max(0,cssScale)*Math.max(0,deviceScale);
  if(!Number.isFinite(pixelsPerSource)||pixelsPerSource<=0||pixelsPerSource>=1)return 0;
  return Math.max(0,Math.floor(Math.log2(1/pixelsPerSource)));
}

export function rasterSourceRect(region, sourceWidth,sourceHeight, levelWidth,levelHeight){
  return {
    sx:region.sx*levelWidth/sourceWidth,
    sy:region.sy*levelHeight/sourceHeight,
    sw:region.sw*levelWidth/sourceWidth,
    sh:region.sh*levelHeight/sourceHeight,
    dx:region.dx,dy:region.dy,dw:region.dw,dh:region.dh
  };
}

export class RasterPyramid {
  constructor(image,width,height,canvasFactory){
    if(!(width>0&&height>0))throw new RangeError('Invalid raster size');
    this.width=width;this.height=height;
    this.levels=[image];
    this.canvasFactory=canvasFactory;
    this.maximumLevel=20;
  }
  get bytes(){return this.levels.reduce((sum,c)=>sum+c.width*c.height*4,0);}
  get(level=0){
    const target=Math.max(0,Math.min(this.maximumLevel,Math.floor(level)||0));
    while(this.levels.length<=target){
      const previous=this.levels[this.levels.length-1];
      if(previous.width===1&&previous.height===1)break;
      let next;
      try{
        next=this.canvasFactory(Math.max(1,Math.ceil(previous.width/2)),Math.max(1,Math.ceil(previous.height/2)));
        const ctx=next.getContext('2d',{alpha:true});
        if(!ctx)throw new Error('Cannot allocate display mipmap');
        ctx.imageSmoothingEnabled=true;
        ctx.imageSmoothingQuality='high';
        ctx.drawImage(previous,0,0,previous.width,previous.height,0,0,next.width,next.height);
        this.levels.push(next);
      }catch{
        if(next){next.width=0;next.height=0;}
        this.maximumLevel=this.levels.length-1;break;
      }
    }
    return this.levels[Math.min(target,this.levels.length-1)];
  }
  release(){
    // Never mutate the original image; discard only generated canvases.
    for(const layer of this.levels.slice(1)){layer.width=0;layer.height=0;}
    this.levels.length=1;
  }
}

export class RasterBudgetCache {
  constructor(maxBytes=192*1024*1024){this.maxBytes=maxBytes;this.entries=new Map();}
  get(key){if(!this.entries.has(key))return null;const v=this.entries.get(key);this.entries.delete(key);this.entries.set(key,v);return v;}
  set(key,raster){const old=this.entries.get(key);if(old&&old!==raster)old.release();this.entries.delete(key);this.entries.set(key,raster);this.trim();return raster;}
  trim(){
    let total=[...this.entries.values()].reduce((n,r)=>n+r.bytes,0);
    while(total>this.maxBytes&&this.entries.size>1){
      const [key,raster]=this.entries.entries().next().value;
      total-=raster.bytes;this.entries.delete(key);raster.release();
    }
  }
  clear(){for(const raster of this.entries.values())raster.release();this.entries.clear();}
  get size(){return this.entries.size;}
}
