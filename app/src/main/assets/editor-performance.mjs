// Pure viewport and list helpers, plus a bounded thumbnail cache.
// Kept independent of the DOM so that low-end-device behavior is testable in Node.
export function intersectsViewport(left,top,right,bottom,width,height,margin=0){
  return right>=-margin && bottom>=-margin && left<=width+margin && top<=height+margin;
}

export function assetListKey(assets,imageSequence,viewMode){
  // Geometric changes and names affect previews; selection does not.
  return JSON.stringify([imageSequence,viewMode,assets]);
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
