// Shared colour-key semantics with Transparency.kt. Pixels stay source-relative;
// no sampled coordinates or bitmap masks are persisted in projects.
export const DEFAULT_TRANSPARENCY = Object.freeze({colors:[],tolerance:20,all:false});
export function normalizeTransparency(value) {
  if (!value) return {colors:[],tolerance:20,all:false};
  const colors=[...new Set((Array.isArray(value.colors)?value.colors:[])
    .filter(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))
    .map(v=>v.toUpperCase()))].slice(0,24);
  return {colors,tolerance:Math.max(0,Math.min(100,Math.round(Number.isFinite(Number(value.tolerance)) ? Number(value.tolerance) : 20))),all:value.all===true};
}
export const hasTransparency = v=>!!v?.colors?.length;
const rgb=(hex)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const distance=(r,g,b,c)=>Math.sqrt(.299*(r-c[0])**2+.587*(g-c[1])**2+.114*(b-c[2])**2);
export function applyTransparency(imageData,raw) {
  const config=normalizeTransparency(raw),data=imageData.data,{width:w,height:h}=imageData;
  if(!config.colors.length||!w||!h)return imageData;
  const palette=config.colors.map(rgb),threshold=config.tolerance*1.6+.5,n=w*h;
  const erased=new Uint8Array(n),match=new Uint8Array(n),queue=new Int32Array(n);
  const closest=(i)=>{
    const p=i*4;let best=Infinity,index=0;
    for(let j=0;j<palette.length;j++){const d=distance(data[p],data[p+1],data[p+2],palette[j]);if(d<best){best=d;index=j;}}
    return {d:best,index};
  };
  for(let i=0;i<n;i++)if(data[i*4+3]!==0&&closest(i).d<=threshold)match[i]=1;
  if(config.all){erased.set(match);}else{
    let head=0,tail=0;
    const add=i=>{if(match[i]&&!erased[i]){erased[i]=1;queue[tail++]=i;}};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
    for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;
        if(xx>=0&&xx<w&&yy>=0&&yy<h)add(yy*w+xx);
      }
    }
  }
  // Remove background contribution from semi-transparent, one-pixel boundary
  // pixels. Neighbour further inside the shape estimates the foreground colour.
  const corrected=new Map();
  for(let i=0;i<n;i++){
    if(erased[i]||data[i*4+3]===0)continue;
    const x=i%w,y=(i/w)|0,p=i*4;
    let best=null;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const bx=x+dx,by=y+dy,fx=x-dx*2,fy=y-dy*2;
      if(bx<0||bx>=w||by<0||by>=h||fx<0||fx>=w||fy<0||fy>=h)continue;
      if(!erased[by*w+bx]||erased[fy*w+fx])continue;
      const q=(fy*w+fx)*4;if(data[q+3]===0)continue;
      const f=[data[q],data[q+1],data[q+2]],ci=closest(by*w+bx).index,bg=palette[ci];
      const dr=f.map((v,k)=>v-bg[k]),den=dr.reduce((s,v)=>s+v*v,0);
      if(den<400)continue;
      const alpha=(dr[0]*(data[p]-bg[0])+dr[1]*(data[p+1]-bg[1])+dr[2]*(data[p+2]-bg[2]))/den;
      if(alpha<=.06||alpha>=.97)continue;
      const residual=Math.sqrt(dr.reduce((s,v,k)=>s+(data[p+k]-bg[k]-alpha*v)**2,0));
      if(residual>12)continue;
      if(!best||residual<best.residual)best={alpha,bg,residual};
    }
    if(best){const a=best.alpha,bg=best.bg;corrected.set(i,{alpha:a,rgb:[0,1,2].map(k=>Math.max(0,Math.min(255,Math.round((data[p+k]-(1-a)*bg[k])/a))))});}
  }
  for(let i=0;i<n;i++){
    const p=i*4;
    if(erased[i]){data[p]=data[p+1]=data[p+2]=data[p+3]=0;}
    else if(corrected.has(i)){
      const c=corrected.get(i);for(let k=0;k<3;k++)data[p+k]=c.rgb[k];
      data[p+3]=Math.round(data[p+3]*c.alpha);
    }
  }
  return imageData;
}
