'use strict';
self.onmessage = (event) => {
  const {rgba,width,height,threshold=28}=event.data;
  try {
    const pixels=new Uint8ClampedArray(rgba),gray=new Uint8Array(width*height),edges=new Uint8Array(width*height);
    for(let i=0,j=0;i<gray.length;i++,j+=4){gray[i]=Math.round(.299*pixels[j]+.587*pixels[j+1]+.114*pixels[j+2]);}
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=y*width+x,gx=gray[i+1]-gray[i-1],gy=gray[i+width]-gray[i-width];
      edges[i]=(gx*gx+gy*gy)>(threshold*threshold)?1:0;
    }
    self.postMessage({edges:edges.buffer,width,height},[edges.buffer]);
  }catch(error){self.postMessage({error:String(error)});}
};