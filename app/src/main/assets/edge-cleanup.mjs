// Post-processing ONLY. Reads the finished alpha mask; never revisits the
// background colour keys or changes the selected background region.
export function cleanAlphaEdge(imageData,amount=0){
  const strength=Math.max(0,Math.min(100,Math.round(Number(amount)||0)));
  const {width:w,height:h,data}=imageData;
  if(!strength||w<2||h<2)return imageData;
  const before=new Uint8ClampedArray(data);
  const s=strength/100;
  const offsets=[[-1,-1,1],[0,-1,2],[1,-1,1],[-1,0,2],[1,0,2],[-1,1,1],[0,1,2],[1,1,1]];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=(y*w+x)*4,a=before[p+3];
    if(!a)continue; // Never recreate removed background pixels.
    let sum=a*4,hasBackground=false,support=0;
    for(const [dx,dy,weight] of offsets){
      const xx=x+dx,yy=y+dy;
      // The image boundary is not implicitly transparent.
      const n=xx<0||xx>=w||yy<0||yy>=h ? a : before[(yy*w+xx)*4+3];
      sum+=weight*n;
      if(n<32)hasBackground=true;
      if(n>=128)support++;
    }
    if(!hasBackground)continue;
    const smoothed=Math.round(sum/16);
    let result=Math.round(a+(Math.min(a,smoothed)-a)*s);
    // Isolated edge pixels and one-pixel spikes are much less stable than a
    // continuous outline. Damp them, but only on the already-detected edge.
    if(support<=2)result=Math.round(result*(1-.9*s));
    else if(support===3)result=Math.round(result*(1-.27*s*s));
    data[p+3]=result;
    // Conservative colour defringe. Sample foreground *inside* the retained
    // alpha region; preserve the original colour of solid artwork.
    if(a>=250||result>=245||!result)continue;
    let best=-1,score=-1;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const xx=x+dx,yy=y+dy;
      if(xx<0||xx>=w||yy<0||yy>=h||(!dx&&!dy))continue;
      const q=(yy*w+xx)*4,qa=before[q+3];
      if(qa<240)continue;
      const quality=qa*8-10*(dx*dx+dy*dy);
      if(quality>score){score=quality;best=q;}
    }
    if(best<0)continue;
    const blend=Math.min(.32,s*.40*(1-result/255));
    for(let k=0;k<3;k++)data[p+k]=Math.round(before[p+k]*(1-blend)+before[best+k]*blend);
  }
  return imageData;
}
