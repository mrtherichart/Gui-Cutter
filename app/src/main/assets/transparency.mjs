// Shared colour-key semantics with Transparency.kt. The source and the JSON
// retain RGB keys, never sampled pixel positions or destructive pixel masks.
export const DEFAULT_TRANSPARENCY = Object.freeze({colors:[],tolerance:20,all:false});
export function normalizeTransparency(value) {
  if (!value) return {colors:[],tolerance:20,all:false};
  const colors=[...new Set((Array.isArray(value.colors)?value.colors:[])
    .filter(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))
    .map(v=>v.toUpperCase()))].slice(0,24);
  const edgeCleanup=Math.max(0,Math.min(100,Math.round(Number(value.edgeCleanup)||0)));
  return {colors,tolerance:Math.max(0,Math.min(100,Math.round(Number.isFinite(Number(value.tolerance)) ? Number(value.tolerance) : 20))),all:value.all===true,...(edgeCleanup?{edgeCleanup}:{})};
}
export const hasTransparency = v=>!!v?.colors?.length;
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const difference=(r,g,b,c)=>Math.sqrt(.299*(r-c[0])**2+.587*(g-c[1])**2+.114*(b-c[2])**2);
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));

export function applyTransparency(imageData,raw) {
  const config=normalizeTransparency(raw),data=imageData.data,{width:w,height:h}=imageData;
  if(!config.colors.length||!w||!h)return imageData;
  const palette=config.colors.map(rgb),n=w*h,tolerance=config.tolerance;
  const threshold=2+1.25*tolerance;
  // A shadow can be a darkened key colour; matching a chromatic ray rather
  // than RGB distance alone removes gentle shading without widening the
  // foreground match tolerance. Only connected, low-contrast regions qualify.
  const darkest=Math.max(.55,1-tolerance*.012);
  const shadowResidual=5+tolerance*.25;
  const jumpLimit=Math.min(55,Math.max(16,16+tolerance*.35));
  const matches=new Uint8Array(n),core=new Uint8Array(n),erased=new Uint8Array(n),nearest=new Uint8Array(n),queue=new Int32Array(n);
  for(let i=0;i<n;i++){
    const p=i*4;if(!data[p+3])continue;
    let best=Infinity,key=0,strict=Infinity;
    for(let j=0;j<palette.length;j++){
      const bg=palette[j],d=difference(data[p],data[p+1],data[p+2],bg);
      if(d<best){best=d;key=j;}
      if(d<strict)strict=d;
      if(d<=threshold)continue;
      const norm=bg[0]*bg[0]+bg[1]*bg[1]+bg[2]*bg[2];
      if(norm<2000)continue;
      const shade=(data[p]*bg[0]+data[p+1]*bg[1]+data[p+2]*bg[2])/norm;
      if(shade<darkest||shade>1)continue;
      const dr=data[p]-bg[0]*shade,dg=data[p+1]-bg[1]*shade,db=data[p+2]-bg[2]*shade;
      const residual=Math.sqrt(.299*dr*dr+.587*dg*dg+.114*db*db);
      if(residual<=shadowResidual){const score=threshold*.5+Math.max(0,1-shade)*50;
        if(score<best){best=score;key=j;}}
    }
    nearest[i]=key;
    if(best<=threshold)matches[i]=1;
    if(strict<=Math.max(4,threshold*.4))core[i]=1;
  }
  if(config.all){erased.set(matches);}else{
    // Four-connected, perimeter-seeded region growing. Crossing a sharp local
    // contrast boundary is forbidden even if the following pixel has a key
    // colour. This protects pale highlights adjacent to white backgrounds.
    let head=0,tail=0;
    const add=(i,from=-1)=>{
      if(!matches[i]||erased[i])return;
      if(from>=0){const p=i*4,q=from*4;
        const dr=data[p]-data[q],dg=data[p+1]-data[q+1],db=data[p+2]-data[q+2];
        // A deliberate second key may form a hard checkerboard boundary.
        if(.299*dr*dr+.587*dg*dg+.114*db*db>jumpLimit*jumpLimit &&
          !(core[i]&&core[from]&&nearest[i]!==nearest[from]))return;
      }
      erased[i]=1;queue[tail++]=i;
    };
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
    for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;
      if(x>0)add(i-1,i);
      if(x+1<w)add(i+1,i);
      if(y>0)add(i-w,i);
      if(y+1<h)add(i+w,i);
    }
  }
  // Edge-only foreground recovery. Use an inward sample as a foreground
  // estimate and remove the key's contribution from antialiased pixels.
  const corrected=new Map();
  for(let i=0;i<n;i++){
    if(erased[i]||!data[i*4+3])continue;
    const x=i%w,y=(i/w)|0,p=i*4;
    let best=null;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const bx=x+dx,by=y+dy,fx=x-dx*2,fy=y-dy*2;
      if(bx<0||bx>=w||by<0||by>=h||fx<0||fx>=w||fy<0||fy>=h)continue;
      if(!erased[by*w+bx]||erased[fy*w+fx])continue;
      const q=(fy*w+fx)*4;if(!data[q+3])continue;
      const bg=palette[nearest[by*w+bx]],diff=[data[q]-bg[0],data[q+1]-bg[1],data[q+2]-bg[2]];
      const den=diff.reduce((s,v)=>s+v*v,0);
      if(den<400)continue;
      const alpha=diff.reduce((s,v,k)=>s+v*(data[p+k]-bg[k]),0)/den;
      if(alpha<=.06||alpha>=.97)continue;
      const residual=Math.sqrt(diff.reduce((s,v,k)=>s+(data[p+k]-bg[k]-alpha*v)**2,0));
      if(residual>14)continue;
      if(!best||residual<best.residual)best={alpha,bg,residual};
    }
    if(best){const a=best.alpha,bg=best.bg;
      corrected.set(i,{alpha:a,rgb:[0,1,2].map(k=>clamp((data[p+k]-(1-a)*bg[k])/a))});
    }
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
