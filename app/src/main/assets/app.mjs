import {Project, makeAsset, normalizeAsset, verifyAssets, filenameFor, copy} from './model.mjs';
import {Viewport, limit, handles, hitHandle, hitBorder, adjust, move, rectangle, snap, nineParts} from './geometry.mjs';

const $=id=>document.getElementById(id);
const native=window.NativeAndroid??null;
const settingsKey='gui-cutter.preferences.v1';
const defaults={edgeSnap:true,showEdges:false,hideUnselected:false,labels:false,checkerboard:true,magnifier:true,explodeNine:true,newKind:'normal',theme:'system',reduceGlass:false};
let settings={...defaults};
try{settings={...settings,...JSON.parse(localStorage.getItem(settingsKey)||'{}')};}catch{}
const state={project:new Project(),view:new Viewport(),image:null,edges:null,overlay:null,mode:'edit',pointers:new Map(),gesture:null,gestureData:null,previewRect:null,snapPoint:null,busy:false,tab:'assets',projectKey:'browser',nativeInfo:null,toastTimer:0,draftTimer:0,imageSeq:0,nudge:1,canvasDpr:1,lastStatus:'Ready',imageLoaded:false,pendingSave:null,lastNavigationTap:null};
const ctx=$('editor').getContext('2d');
const appCtx=()=>({iw:state.image?.naturalWidth||0,ih:state.image?.naturalHeight||0});

function log(message,detail=''){
  const line=`${new Date().toISOString().slice(11,19)} ${message}${detail?' '+detail:''}`;
  console.info(line);state.lastStatus=line;$('diagnostics').textContent=line+'\n'+$('diagnostics').textContent.slice(0,3500);
}
function toast(message,delay=2800){const el=$('status');el.textContent=String(message);el.hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.hidden=true,delay);}
function errorMessage(err){const message=err?.message||String(err);log('ERROR',message);toast(message,4600);if(native)try{native.jsError(message);}catch{} }
function nativeCall(method,...args){if(!native||typeof native[method]!=='function'){toast('This action needs the Android APK.');return false;}try{native[method](...args);return true;}catch(e){errorMessage(e);return false;}}
function updateButtons(){
  $('undo').disabled=state.project.cursor<=0||state.busy;$('redo').disabled=state.project.cursor>=state.project.history.length-1||state.busy;
  $('save').disabled=!state.image||state.busy||!state.project.dirty;
  $('save').title=state.busy?'Saving project…':state.project.dirty?'Save project changes':'Project saved';
  $('save').setAttribute('aria-label',$('save').title);$('save').classList.toggle('is-busy',state.busy);$('dirty').hidden=!state.project.dirty;
  $('selection-strip').hidden=!state.project.active;
  const a=state.project.active;
  if(a){$('selection-name').textContent=a.asset_id;$('selection-size').textContent=`${a.w} × ${a.h} px${a.kind==='nine_slice'?' · 9-slice':''}`;drawSelectionThumb(a);}
  for(const el of document.querySelectorAll('[data-mode]')){el.classList.toggle('active',el.dataset.mode===state.mode&&(state.mode!=='new'||settings.newKind==='normal'));}
  $('new-kind').classList.toggle('active',state.mode==='new'&&settings.newKind==='nine_slice');
  $('snap').classList.toggle('selected',settings.edgeSnap);$('snap').setAttribute('aria-pressed',String(settings.edgeSnap));
  $('project-title').textContent=state.nativeInfo?.folder|| (state.image?'Browser image':'No project');
  $('project-title').title=state.project.dirty?'Unsaved changes':'Project files';
}
function refreshUI(){updateButtons();renderList();renderProperties();renderPreview();scheduleDraw();}
function resolvedTheme(){return settings.theme==='dark'||(settings.theme==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}
function applyAppearance(){document.documentElement.dataset.theme=resolvedTheme();document.documentElement.dataset.reducedGlass=String(!!settings.reduceGlass);}
function saveSettings(){localStorage.setItem(settingsKey,JSON.stringify(settings));applyAppearance();for(const el of document.querySelectorAll('[data-setting]'))el.checked=!!settings[el.dataset.setting];$('setting-kind').value=settings.newKind;$('setting-theme').value=settings.theme;$('explode-preview').checked=settings.explodeNine;updateButtons();scheduleDraw();}
function drawSelectionThumb(asset){
  const canvas=$('selection-thumb');if(!state.image||!asset)return;
  const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;
  const scale=Math.min(canvas.width/asset.w,canvas.height/asset.h);
  const w=asset.w*scale,h=asset.h*scale;
  c.drawImage(state.image,asset.x,asset.y,asset.w,asset.h,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
}
function scheduleDraft(){clearTimeout(state.draftTimer);state.draftTimer=setTimeout(()=>{
  if(state.project.dirty){const key='gui-cutter.draft.'+state.projectKey;
    try{localStorage.setItem(key,JSON.stringify({iw:state.project.imageWidth,ih:state.project.imageHeight,assets:state.project.assets,date:Date.now()}));}
    catch(e){log('Recovery snapshot unavailable',e.message);}}
  else clearDraft();
},300);}
function clearDraft(){try{localStorage.removeItem('gui-cutter.draft.'+state.projectKey);}catch{}}
function change(){state.project.commit();refreshUI();scheduleDraft();}
function selectIndex(i){state.project.selected=i;refreshUI();}
function chooseMode(mode){if(state.gestureData){cancelSingle();state.pointers.clear();$('magnifier').hidden=true;}state.mode=mode;state.previewRect=null;state.gesture=null;updateButtons();scheduleDraw();}
function openTab(tab){
  if(state.gestureData){cancelSingle();state.pointers.clear();$('magnifier').hidden=true;}
  state.tab=tab;$('drawer').hidden=false;$('shade').hidden=false;
  for(const el of document.querySelectorAll('.tab-pane'))el.hidden=el.id!=='tab-'+tab;
  for(const el of document.querySelectorAll('[data-tab]'))el.classList.toggle('current',el.dataset.tab===tab);
  if(tab==='files')inspectFiles();if(tab==='settings')refreshStatus();refreshUI();
}
function closeTab(){$('drawer').hidden=true;$('shade').hidden=true;}
function cleanCanvas(yes){document.body.classList.toggle('clean',yes);$('clean-restore').hidden=!yes;closeTab();}
function createModal({title,initial='',message='',question=false}){
  return new Promise(resolve=>{
    const dlg=document.createElement('dialog');dlg.className='modal-dialog';
    dlg.innerHTML=`<form method="dialog"><h2></h2><p class="modal-message"></p><input class="modal-input" maxlength="120" autocomplete="off"><menu><button value="cancel">Cancel</button><button class="primary" value="ok">${question?'Continue':'OK'}</button></menu></form>`;
    dlg.querySelector('h2').textContent=title;
    dlg.querySelector('p').textContent=message;
    dlg.querySelector('p').hidden=!message;
    const inp=dlg.querySelector('input');inp.value=initial;inp.hidden=question;
    document.body.appendChild(dlg);dlg.addEventListener('close',()=>{const result=dlg.returnValue==='ok'?(question?true:inp.value.trim()):null;dlg.remove();resolve(result);},{once:true});
    dlg.showModal();if(!question)inp.focus();
  });
}

function redraw(){
  const cvs=$('editor'),w=cvs.clientWidth,h=cvs.clientHeight,dpr=state.canvasDpr;
  if(!w||!h)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.fillStyle=resolvedTheme()==='dark'?'#121c2a':'#8d9ca7';ctx.fillRect(0,0,w,h);
  if(!state.image)return;
  const v=state.view,im=state.image,p=v.toScreen(0,0),iw=im.naturalWidth,ih=im.naturalHeight;
  if(settings.checkerboard){const size=14;ctx.save();ctx.beginPath();ctx.rect(p.x,p.y,iw*v.scale,ih*v.scale);ctx.clip();
    ctx.fillStyle='#f4f4f4';ctx.fillRect(p.x,p.y,iw*v.scale,ih*v.scale);
    ctx.fillStyle='#d8dadd';const sx=Math.floor(Math.max(0,-p.x)/(size*v.scale)),sy=Math.floor(Math.max(0,-p.y)/(size*v.scale));
    const ex=Math.min(Math.ceil(iw/size),sx+Math.ceil(w/(size*v.scale))+2),ey=Math.min(Math.ceil(ih/size),sy+Math.ceil(h/(size*v.scale))+2);
    for(let iy=sy;iy<ey;iy++)for(let ix=sx;ix<ex;ix++)if((ix+iy)%2===0)ctx.fillRect(p.x+ix*size*v.scale,p.y+iy*size*v.scale,size*v.scale,size*v.scale);
    ctx.restore();
  }
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(im,p.x,p.y,iw*v.scale,ih*v.scale);
  if(settings.showEdges&&state.overlay)ctx.drawImage(state.overlay,p.x,p.y,iw*v.scale,ih*v.scale);
  for(let i=0;i<state.project.assets.length;i++){
    if(settings.hideUnselected&&i!==state.project.selected)continue;
    const a=state.project.assets[i],selected=i===state.project.selected;
    const tl=v.toScreen(a.x,a.y),br=v.toScreen(a.x+a.w,a.y+a.h);
    ctx.strokeStyle=selected?'#ff9c3d':'rgba(93,184,232,.85)';ctx.lineWidth=selected?1.8:1.1;ctx.setLineDash([]);ctx.strokeRect(tl.x+.5,tl.y+.5,br.x-tl.x,br.y-tl.y);
    if(settings.labels){ctx.font='12px system-ui';const tx=tl.x+4,ty=tl.y-7;
      const text=a.asset_id,width=ctx.measureText(text).width;
      ctx.fillStyle='#253e4edb';ctx.fillRect(tx-3,ty-13,width+6,16);ctx.fillStyle='#fff';ctx.fillText(text,tx,ty);}
    if(a.kind==='nine_slice'){
      const x1=v.toScreen(a.x+a.left,a.y).x,x2=v.toScreen(a.x+a.w-a.right,a.y).x;
      const y1=v.toScreen(a.x,a.y+a.top).y,y2=v.toScreen(a.x,a.y+a.h-a.bottom).y;
      ctx.strokeStyle=selected?'rgba(250,250,251,.88)':'rgba(248,215,176,.68)';ctx.lineWidth=1.2;ctx.setLineDash([5,4]);ctx.beginPath();
      for(const x of [x1,x2]){ctx.moveTo(x,tl.y);ctx.lineTo(x,br.y);}
      for(const y of [y1,y2]){ctx.moveTo(tl.x,y);ctx.lineTo(br.x,y);}ctx.stroke();ctx.setLineDash([]);
    }
    if(selected){for(const [name,[hx,hy]]of Object.entries(handles(a))){
      const q=v.toScreen(hx,hy),middle=name.startsWith('edge_'),guide=['left','right','top','bottom'].includes(name);
      const radius=name==='move'?6:middle?4.2:guide?4.3:6;
      ctx.fillStyle=name==='move'?'rgba(19,35,52,.82)':'#fffaf3';ctx.strokeStyle='#ff9c3d';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(q.x,q.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(name==='move'){ctx.strokeStyle='#ffffff';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(q.x-3,q.y);ctx.lineTo(q.x+3,q.y);ctx.moveTo(q.x,q.y-3);ctx.lineTo(q.x,q.y+3);ctx.stroke();}
    }}
  }
  if(state.previewRect){const a=state.previewRect,tl=v.toScreen(a.x,a.y),br=v.toScreen(a.x+a.w,a.y+a.h);
    ctx.lineWidth=2;ctx.setLineDash([7,4]);ctx.strokeStyle='#62d58f';ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);ctx.setLineDash([]);}
  if(state.snapPoint){const p=v.toScreen(state.snapPoint.x,state.snapPoint.y);ctx.strokeStyle='#55edff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x-9,p.y);ctx.lineTo(p.x+9,p.y);ctx.moveTo(p.x,p.y-9);ctx.lineTo(p.x,p.y+9);ctx.stroke();}
}
let queued=false;
function scheduleDraw(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;redraw();});}
function fitImage(){if(!state.image)return;state.view.fit(state.image.naturalWidth,state.image.naturalHeight,$('editor').clientWidth,$('editor').clientHeight);setZoomLabel();scheduleDraw();}
function setZoomLabel(){
  $('zoom-label').textContent=`${Math.round(state.view.scale*100)}%`;
  $('zoom-range').value=Math.round(1000*Math.log(state.view.scale/.125)/Math.log(256));
  $('zoom-range').setAttribute('aria-valuetext',`${Math.round(state.view.scale*100)}%`);
}
function zoomFromSlider(value){
  const canvas=$('editor'),scale=.125*Math.pow(256,Number(value)/1000);
  state.view.zoomTo(scale,canvas.clientWidth/2,canvas.clientHeight/2);setZoomLabel();scheduleDraw();
}
let oldCanvasWidth=0,oldCanvasHeight=0;
function sizeCanvas(){const c=$('editor'),dpr=Math.min(3,window.devicePixelRatio||1),w=Math.max(1,Math.round(c.clientWidth*dpr)),h=Math.max(1,Math.round(c.clientHeight*dpr));if(c.width!==w||c.height!==h){if(state.image&&oldCanvasWidth){state.view.pan((c.clientWidth-oldCanvasWidth)/2,(c.clientHeight-oldCanvasHeight)/2);}oldCanvasWidth=c.clientWidth;oldCanvasHeight=c.clientHeight;c.width=w;c.height=h;state.canvasDpr=dpr;scheduleDraw();}}

async function openImageElement(src,loadManifest=true){
  const seq=++state.imageSeq;const image=new Image();
  image.onload=async()=>{
    if(seq!==state.imageSeq)return;
    state.image=image;state.imageLoaded=true;
    state.project.imageWidth=image.naturalWidth;state.project.imageHeight=image.naturalHeight;
    state.edges=null;state.overlay=null;$('empty').hidden=true;
    if(loadManifest&&native){try{const json=native.readManifest();state.project.load(json?JSON.parse(json):{assets:[]});}
      catch(e){state.project.reset([]);errorMessage('Could not load manifest: '+e.message);}}
    else state.project.reset([]);
    fitImage();refreshUI();processEdges(image,seq);await recoverDraft();toast(`Image loaded: ${image.naturalWidth} × ${image.naturalHeight}`);
  };
  image.onerror=()=>{if(seq===state.imageSeq){state.image=null;state.imageLoaded=false;$('empty').hidden=false;errorMessage('Could not open base image.');}};
  image.src=src;
}
async function recoverDraft(){
  try{const entry=localStorage.getItem('gui-cutter.draft.'+state.projectKey);if(!entry)return;
    const draft=JSON.parse(entry),p=state.project;
    if(draft.iw!==p.imageWidth||draft.ih!==p.imageHeight)return;
    if(JSON.stringify({assets:draft.assets})===p.encode()){clearDraft();return;}
    const yes=await createModal({title:'Recover unfinished edits?',message:'A local recovery snapshot contains edits not in the saved project. Restore it?',question:true});
    if(yes){p.assets=verifyAssets(draft.assets,p.imageWidth,p.imageHeight);p.commit();refreshUI();toast('Recovered edits; Save to write project files.');}
    else clearDraft();
  }catch(e){log('Draft recovery failed',e.message);}
}
async function processEdges(image,seq){
  const iw=image.naturalWidth,ih=image.naturalHeight;
  if(iw*ih>13000000){log('Edge detection skipped (image over 13MP)');toast('Large image: automatic edge detection disabled.');return;}
  try{const temp=document.createElement('canvas');temp.width=iw;temp.height=ih;const cx=temp.getContext('2d',{willReadFrequently:true});cx.drawImage(image,0,0);
    const data=cx.getImageData(0,0,iw,ih),worker=new Worker(new URL('./edge-worker.js',import.meta.url));
    worker.onmessage=evt=>{worker.terminate();if(seq!==state.imageSeq)return;
      if(evt.data.error){errorMessage(evt.data.error);return;}
      state.edges=new Uint8Array(evt.data.edges);state.overlay=null;if(settings.showEdges)buildOverlay();scheduleDraw();log('Edge map ready',`${iw}x${ih}`);};
    worker.onerror=e=>{worker.terminate();log('Edge worker failed',e.message);};
    worker.postMessage({rgba:data.data.buffer,width:iw,height:ih},[data.data.buffer]);
  }catch(e){log('Edge detection unavailable',e.message);}
}
function buildOverlay(){if(!state.edges||!state.image)return;const {iw,ih}=appCtx();
  try{const temp=document.createElement('canvas');temp.width=iw;temp.height=ih;const cx=temp.getContext('2d');const id=cx.createImageData(iw,ih);for(let i=0;i<state.edges.length;i++)if(state.edges[i]){const j=i*4;id.data[j]=87;id.data[j+1]=215;id.data[j+2]=255;id.data[j+3]=110;}cx.putImageData(id,0,0);state.overlay=temp;scheduleDraw();}
  catch(e){settings.showEdges=false;saveSettings();errorMessage(e);}
}
function renderList(){const panel=$('asset-list');if($('drawer').hidden||state.tab!=='assets')return;panel.replaceChildren();
  for(let i=0;i<state.project.assets.length;i++){const a=state.project.assets[i],btn=document.createElement('button');btn.className='asset-item'+(state.project.selected===i?' active':'');
    const title=document.createElement('span'),name=document.createElement('strong'),dim=document.createElement('small'),kind=document.createElement('span');name.textContent=a.asset_id;dim.textContent=`${a.w} × ${a.h} · ${a.x},${a.y}`;title.append(name,dim);
    kind.textContent=a.kind==='nine_slice'?'9-slice':'Normal';kind.className='asset-kind';btn.append(title,kind);btn.addEventListener('click',()=>selectIndex(i));panel.append(btn);}
  if(!state.project.assets.length){const el=document.createElement('p');el.textContent='No crops yet. Choose New to draw your first asset.';el.className='minor';panel.append(el);}
}
const labels={x:'X',y:'Y',w:'Width',h:'Height',left:'9-slice left',top:'9-slice top',right:'9-slice right',bottom:'9-slice bottom'};
function createNumericControls(){for(const key of Object.keys(labels)){const outer=document.createElement('div');outer.className='numeric-item';outer.dataset.key=key;
    const label=document.createElement('label');label.textContent=labels[key];const row=document.createElement('div');row.className='step-field';
    const minus=document.createElement('button');minus.textContent='−';minus.type='button';minus.addEventListener('click',()=>nudgeField(key,-1));
    const input=document.createElement('input');input.type='number';input.step='1';input.id='prop-'+key;input.inputMode='numeric';
    const plus=document.createElement('button');plus.textContent='+';plus.type='button';plus.addEventListener('click',()=>nudgeField(key,1));
    row.append(minus,input,plus);outer.append(label,row);$('numeric-grid').append(outer);}}
function renderProperties(){if($('drawer').hidden||state.tab!=='properties')return;const a=state.project.active;$('props-none').hidden=!!a;$('props-fields').hidden=!a;if(!a)return;
  $('prop-name').value=a.asset_id;$('prop-kind').value=a.kind;for(const key of Object.keys(labels)){$('prop-'+key).value=a[key];}
  for(const el of document.querySelectorAll('.numeric-item'))el.hidden=a.kind==='normal'&&['left','right','top','bottom'].includes(el.dataset.key);
}
function nudgeField(key,step){const a=state.project.active;if(!a||state.busy)return;try{const next={...a,[key]:Number(a[key])+step};
    state.project.update(state.project.selected,next);refreshUI();scheduleDraft();}
  catch(e){errorMessage(e);}}
function applyProps(){const a=state.project.active;if(!a||state.busy)return;const changes={asset_id:$('prop-name').value.trim(),kind:$('prop-kind').value};
  for(const key of Object.keys(labels))changes[key]=Number($('prop-'+key).value);
  try{if(changes.kind==='nine_slice'&&a.kind==='normal'&&['left','top','right','bottom'].every(k=>changes[k]===0)){
      changes.left=changes.right=Math.max(1,Math.floor(a.w/4));changes.top=changes.bottom=Math.max(1,Math.floor(a.h/4));}
    state.project.update(state.project.selected,changes);refreshUI();scheduleDraft();toast('Properties updated');}
  catch(e){errorMessage(e);}}
function renderPreview(){if($('drawer').hidden||state.tab!=='preview')return;const canvas=$('preview'),a=state.project.active,container=canvas.parentElement;
  if(!a||!state.image){$('preview-label').textContent='Select a crop first';canvas.width=1;canvas.height=1;return;}
  const exploded=a.kind==='nine_slice'&&settings.explodeNine,gap=exploded?3:0;
  const sw=a.w+2*gap,sh=a.h+2*gap,ratio=Math.min(1,340/sw,Math.max(130,container.clientHeight-25)/sh);
  canvas.width=Math.max(1,Math.round(sw*ratio));canvas.height=Math.max(1,Math.round(sh*ratio));
  const pc=canvas.getContext('2d');pc.imageSmoothingEnabled=false;pc.clearRect(0,0,canvas.width,canvas.height);
  if(exploded){for(const piece of nineParts(a)){if(piece.w<1||piece.h<1)continue;
    const dx=(piece.x+piece.col*gap)*ratio,dy=(piece.y+piece.row*gap)*ratio;
    pc.drawImage(state.image,a.x+piece.x,a.y+piece.y,piece.w,piece.h,dx,dy,piece.w*ratio,piece.h*ratio);}}
  else pc.drawImage(state.image,a.x,a.y,a.w,a.h,0,0,canvas.width,canvas.height);
  $('preview-label').textContent=`${a.asset_id} · ${a.w} × ${a.h}${exploded?' · exploded preview':''}`;
}

function cancelSingle(){const g=state.gestureData;if(g?.before)state.project.restoreSnapshot(g.before);state.previewRect=null;state.snapPoint=null;state.gesture=null;state.gestureData=null;refreshUI();}
function startPinch(){cancelSingle();const pts=[...state.pointers.values()].slice(0,2),a=pts[0],b=pts[1],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  state.gesture='pinch';state.gestureData={distance:Math.hypot(a.x-b.x,a.y-b.y)||1,scale:state.view.scale,anchor:state.view.toImage(mx,my)};
}
function startSingle(p){if(!state.image||state.busy)return;const {iw,ih}=appCtx(),v=state.view,pt=v.toImage(p.x,p.y);
  const base={x:Math.round(limit(pt.x,0,iw)),y:Math.round(limit(pt.y,0,ih))};
  state.gestureData={screen:{x:p.x,y:p.y},anchor:base,before:state.project.snapshot(),start:null,index:state.project.selected};
  if(state.mode==='navigate'){state.gesture='pan';return;}
  if(state.mode==='new'){state.gesture='draw';state.previewRect={x:limit(base.x,0,iw-1),y:limit(base.y,0,ih-1),w:1,h:1};scheduleDraw();return;}
  const active=state.project.active;const handle=hitHandle(active,v,p.x,p.y);
  if(handle){state.gesture=handle==='move'?'move':'handle';state.gestureData.handle=handle;state.gestureData.start={...active};return;}
  const index=hitBorder(state.project.assets,v,p.x,p.y);
  if(index>=0){state.project.selected=index;state.gesture='move';state.gestureData.index=index;state.gestureData.start={...state.project.assets[index]};refreshUI();return;}
  state.project.selected=-1;state.gesture='idle';refreshUI();
}
function screenSnap(x,y,handle){const {iw,ih}=appCtx(),p=state.view.toImage(x,y);
  let target={x:Math.round(limit(p.x,0,iw)),y:Math.round(limit(p.y,0,ih)),found:false};
  if(settings.edgeSnap)target=snap(state.edges,iw,ih,target.x,target.y,handle);
  state.snapPoint=target.found?target:null;return target;
}
function handlePointerDown(e){if(e.button!==0&&e.pointerType==='mouse')return;if(!$('drawer').hidden||state.busy)return;e.preventDefault();
  try{$('editor').setPointerCapture(e.pointerId);}catch{}
  const point={x:e.clientX,y:e.clientY};state.pointers.set(e.pointerId,point);
  if(state.pointers.size===2)startPinch();else if(state.pointers.size===1)startSingle(point);
}
function handlePointerMove(e){if(!state.pointers.has(e.pointerId))return;e.preventDefault();const previous=state.pointers.get(e.pointerId),p={x:e.clientX,y:e.clientY};state.pointers.set(e.pointerId,p);
  if(state.pointers.size>=2){if(state.gesture!=='pinch')startPinch();const [a,b]=[...state.pointers.values()].slice(0,2),m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const g=state.gestureData;state.view.scale=limit(g.scale*(Math.hypot(a.x-b.x,a.y-b.y)||1)/g.distance,.125,32);
    state.view.x=m.x-g.anchor.x*state.view.scale;state.view.y=m.y-g.anchor.y*state.view.scale;setZoomLabel();scheduleDraw();return;}
  if(state.gesture==='pinch'||!state.gestureData)return;
  if(state.gesture==='pan'){state.view.pan(p.x-previous.x,p.y-previous.y);scheduleDraw();return;}
  const g=state.gestureData,{iw,ih}=appCtx();
  if(state.gesture==='draw'){const target=screenSnap(p.x,p.y,null);state.previewRect=rectangle(g.anchor.x,g.anchor.y,target.x,target.y,iw,ih);scheduleDraw();return;}
  if(state.gesture==='handle'){const target=screenSnap(p.x,p.y,g.handle);state.project.assets[g.index]=adjust(g.start,g.handle,target.x,target.y,iw,ih);refreshUI();showMagnifier(p,target);return;}
  if(state.gesture==='move'){
    const pos=state.view.toImage(p.x,p.y);const dx=Math.round(pos.x-g.anchor.x),dy=Math.round(pos.y-g.anchor.y);
    state.project.assets[g.index]=move(g.start,dx,dy,iw,ih);refreshUI();showMagnifier(p,pos);
  }
}
async function finishDraw(r){state.previewRect=null;if(!r||r.w<2||r.h<2)return;
  const id=await createModal({title:'New crop',initial:`asset_${String(state.project.assets.length+1).padStart(2,'0')}`,message:'Give this UI element a unique name.'});
  if(!id)return;try{const {iw,ih}=appCtx();state.project.insert(makeAsset(id,settings.newKind,r.x,r.y,r.w,r.h,iw,ih));refreshUI();scheduleDraft();chooseMode('edit');toast(`Created ${id}`);}catch(e){errorMessage(e);}}
function handlePointerEnd(e){if(!state.pointers.has(e.pointerId))return;e.preventDefault();state.pointers.delete(e.pointerId);
  if(state.gesture==='pinch'){if(!state.pointers.size){state.gesture=null;state.gestureData=null;}state.lastNavigationTap=null;scheduleDraw();return;}
  const action=state.gesture,r=state.previewRect,g=state.gestureData;state.gesture=null;state.gestureData=null;state.previewRect=null;state.snapPoint=null;$('magnifier').hidden=true;
  if(e.type==='pointercancel'){if(g?.before)state.project.restoreSnapshot(g.before);refreshUI();return;}
  if(action==='pan'&&g?.screen){
    const delta=Math.hypot(e.clientX-g.screen.x,e.clientY-g.screen.y),now=Date.now();
    if(delta<12&&state.lastNavigationTap&&now-state.lastNavigationTap.time<330&&Math.hypot(e.clientX-state.lastNavigationTap.x,e.clientY-state.lastNavigationTap.y)<35){fitImage();state.lastNavigationTap=null;}
    else state.lastNavigationTap=delta<12?{x:e.clientX,y:e.clientY,time:now}:null;
  }else state.lastNavigationTap=null;
  if(action==='draw')finishDraw(r);
  if(['move','handle'].includes(action))change();else refreshUI();
}
function showMagnifier(screen,imagePt){if(!settings.magnifier||!state.image)return;
  const box=$('magnifier'),canvas=$('magnify-canvas'),c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,140,140);
  const {iw,ih}=appCtx(),x=limit(Math.round(imagePt.x),0,iw),y=limit(Math.round(imagePt.y),0,ih);
  const sx=Math.max(0,x-14),sy=Math.max(0,y-14),sw=Math.min(28,iw-sx),sh=Math.min(28,ih-sy);
  c.drawImage(state.image,sx,sy,sw,sh,0,0,sw*5,sh*5);c.strokeStyle='#eeaa4e';c.beginPath();c.moveTo(70,0);c.lineTo(70,140);c.moveTo(0,70);c.lineTo(140,70);c.stroke();
  $('magnify-label').textContent=`${x}, ${y} px`;
  const left=screen.x+160<window.innerWidth?screen.x+18:screen.x-166;
  const top=screen.y-180>0?screen.y-180:screen.y+20;
  box.style.left=limit(left,0,window.innerWidth-150)+'px';box.style.top=limit(top,0,window.innerHeight-177)+'px';box.hidden=false;
}

function refreshStatus(){if(!native){$('app-version').textContent='Browser test';$('app-folder').textContent='Browser mode';$('log-state').textContent='Browser console';return;}
  try{const info=JSON.parse(native.appStatus());state.nativeInfo=info;state.projectKey=info.projectKey||'android';
    $('app-version').textContent=`v${info.version} (${info.versionCode})`;$('app-folder').textContent=info.folder;
    $('folder-name').textContent=info.folder;$('log-state').textContent=info.logsEnabled?'Enabled in APK':'Disabled in build';updateButtons();}
  catch(e){errorMessage(e);}}
function inspectFiles(){const box=$('file-list');box.replaceChildren();if(!native){box.textContent='Browser testing: use Open Image, then Save to download PNGs and JSON.';return;}
  try{const data=JSON.parse(native.inspectFiles());if(!data.length){box.textContent='No project files yet.';return;}
    for(const file of data){const btn=document.createElement('button');btn.className='file-entry';const name=document.createElement('span'),size=document.createElement('small');name.textContent=file.name;size.textContent=file.size>=0?`${Math.ceil(file.size/1024)} KB`:'';btn.append(name,size);btn.addEventListener('click',()=>{if(file.openable)nativeCall('openExport',file.name);else toast('Use your Android file manager to inspect this file.');});box.append(btn);}}
  catch(e){errorMessage(e);}}
function reloadProject(){if(state.project.dirty){createModal({title:'Discard unsaved changes?',message:'This replaces the current canvas with the files already saved on disk.',question:true}).then(yes=>{if(yes){clearDraft();loadNativeProject();}});}
  else loadNativeProject();}
function loadNativeProject(){refreshStatus();if(!native){$('browser-manifest').click();return;}
  if(!state.nativeInfo?.hasBase){state.image=null;state.imageLoaded=false;$('empty').hidden=false;state.project.reset([]);refreshUI();return;}
  const stamp=state.nativeInfo.imageStamp||Date.now();openImageElement(`https://appassets.androidplatform.net/project/base.png?v=${encodeURIComponent(stamp)}`);}
function chooseFolder(){if(native)nativeCall('chooseFolder');else toast('Browser preview: choose an image instead.');}
function importImage(){if(native){if(!state.nativeInfo?.hasWorkspace){toast('Choose a project folder first.');openTab('files');return;}
    if(state.project.dirty){createModal({title:'Replace current image?',question:true,message:'Unsaved changes will be discarded. Importing also replaces base.png in the chosen folder.'}).then(yes=>{if(yes){clearDraft();nativeCall('selectImage');}});}
    else nativeCall('selectImage');
  }else $('browser-image').click();}
function browserDownload(name,blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function saveProject(){if(!state.image||state.busy)return;
  try{state.project.assets=verifyAssets(state.project.assets,state.project.imageWidth,state.project.imageHeight);}catch(e){errorMessage(e);return;}
  if(native){state.pendingSave=state.project.encode();state.busy=true;updateButtons();const json=JSON.stringify(state.project.manifest());if(!nativeCall('saveProject',json)){state.busy=false;state.pendingSave=null;updateButtons();}return;}
  // Browser fallback: PNG and JSON downloads, still the same crop geometry as the Android exporter.
  try{for(const asset of state.project.assets){const c=document.createElement('canvas');c.width=asset.w;c.height=asset.h;c.getContext('2d').drawImage(state.image,asset.x,asset.y,asset.w,asset.h,0,0,asset.w,asset.h);
      const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(blob)browserDownload(filenameFor(asset.asset_id),blob);}
    browserDownload('ui_slices.json',new Blob([JSON.stringify(state.project.manifest(),null,2)],{type:'application/json'}));
    state.project.markSaved();clearDraft();refreshUI();toast('Downloaded crops and manifest. Browser test mode.');}
  catch(e){errorMessage(e);}
}
async function renameSelected(){const a=state.project.active;if(!a||state.busy)return;const name=await createModal({title:'Rename asset',initial:a.asset_id});if(!name)return;try{state.project.update(state.project.selected,{asset_id:name});refreshUI();scheduleDraft();}catch(e){errorMessage(e);}}
async function deleteSelected(){const a=state.project.active;if(!a||state.busy)return;const yes=await createModal({title:`Delete ${a.asset_id}?`,message:'The PNG is removed from exports on the next Save Sync.',question:true});if(yes){state.project.deleteSelected();refreshUI();scheduleDraft();}}
function applyNudge(dx,dy){const a=state.project.active;if(!a||state.busy)return;const {iw,ih}=appCtx();state.project.assets[state.project.selected]=move(a,dx*state.nudge,dy*state.nudge,iw,ih);change();}
function refreshUpdate(data){$('update-status').textContent=data.message||'';$('install-update').hidden=!['available','permission'].includes(data.state);if(data.message)toast(data.message);}
window.GuiCutterReceive=(type,data={})=>{
  try{
    if(type==='status'){refreshStatus();return;}
    if(type==='workspace'){if(data.message)toast(data.message);refreshStatus();if(data.selected){clearDraft();loadNativeProject();}return;}
    if(type==='image'){refreshStatus();if(data.ok){clearDraft();loadNativeProject();}else toast(data.message||'Image import cancelled');return;}
    if(type==='save'){state.busy=false;if(data.state==='success'){state.project.saved=state.pendingSave??state.project.saved;if(!state.project.dirty)clearDraft();else scheduleDraft();toast(`Saved ${data.count} crops`);inspectFiles();}else errorMessage(data.message||'Save failed');state.pendingSave=null;refreshUI();return;}
    if(type==='update'){refreshUpdate(data);return;}
    if(data.message)toast(data.message);
  }catch(e){errorMessage(e);}
};

function bind(){
  createNumericControls();saveSettings();sizeCanvas();window.addEventListener('resize',sizeCanvas);
  const themeMedia=window.matchMedia('(prefers-color-scheme:dark)');
  const followSystemTheme=()=>{if(settings.theme==='system'){applyAppearance();scheduleDraw();}};
  if(themeMedia.addEventListener)themeMedia.addEventListener('change',followSystemTheme);else themeMedia.addListener(followSystemTheme);
  const c=$('editor');c.addEventListener('pointerdown',handlePointerDown);c.addEventListener('pointermove',handlePointerMove);c.addEventListener('pointerup',handlePointerEnd);c.addEventListener('pointercancel',handlePointerEnd);
  c.addEventListener('contextmenu',e=>e.preventDefault());
  c.addEventListener('wheel',e=>{if(!state.image)return;e.preventDefault();state.view.zoomTo(state.view.scale*(e.deltaY<0?1.25:.8),e.clientX,e.clientY);setZoomLabel();scheduleDraw();},{passive:false});
  for(const el of document.querySelectorAll('[data-mode]'))el.addEventListener('click',()=>{if(el.dataset.mode==='new'){settings.newKind='normal';saveSettings();}chooseMode(el.dataset.mode);});
  for(const el of document.querySelectorAll('[data-tab]'))el.addEventListener('click',()=>openTab(el.dataset.tab));
  for(const el of document.querySelectorAll('[data-setting]'))el.addEventListener('change',()=>{settings[el.dataset.setting]=el.checked;saveSettings();if(el.dataset.setting==='showEdges'&&settings.showEdges)buildOverlay();});
  $('setting-kind').addEventListener('change',e=>{settings.newKind=e.target.value;saveSettings();});
  $('explode-preview').addEventListener('change',e=>{settings.explodeNine=e.target.checked;saveSettings();renderPreview();});
  $('new-kind').addEventListener('click',()=>{settings.newKind='nine_slice';saveSettings();chooseMode('new');});
  $('setting-theme').addEventListener('change',e=>{settings.theme=e.target.value;saveSettings();});
  $('project-btn').addEventListener('click',()=>openTab('files'));
  $('project-title').addEventListener('click',()=>openTab('files'));
  $('assets-btn').addEventListener('click',()=>openTab('assets'));$('properties-btn').addEventListener('click',()=>openTab('properties'));
  $('selection-info').addEventListener('click',()=>openTab('properties'));

  $('quick-nudge').addEventListener('click',()=>{$('nudge-panel').hidden=!$('nudge-panel').hidden;});
  $('close-nudge').addEventListener('click',()=>{$('nudge-panel').hidden=true;});
  $('nudge-unit').addEventListener('click',()=>{state.nudge=state.nudge===1?10:1;$('nudge-unit').textContent=`${state.nudge} px`;});
  for(const el of document.querySelectorAll('[data-nudge]'))el.addEventListener('click',()=>{const [dx,dy]=el.dataset.nudge.split(',').map(Number);applyNudge(dx,dy);});
  $('close-drawer').addEventListener('click',closeTab);$('shade').addEventListener('click',closeTab);
  $('zoom-range').addEventListener('input',e=>zoomFromSlider(e.target.value));
  $('zoom-label').addEventListener('click',fitImage);$('fit').addEventListener('click',fitImage);
  $('snap').addEventListener('click',()=>{settings.edgeSnap=!settings.edgeSnap;saveSettings();toast(settings.edgeSnap?'Smart snap enabled':'Smart snap disabled');});
  $('undo').addEventListener('click',()=>{if(state.project.undo()){refreshUI();scheduleDraft();}});
  $('redo').addEventListener('click',()=>{if(state.project.redo()){refreshUI();scheduleDraft();}});
  $('save').addEventListener('click',saveProject);
  $('new-from-list').addEventListener('click',()=>{closeTab();chooseMode('new');toast('Drag on the image to define a crop.');});
  $('rename').addEventListener('click',renameSelected);$('delete').addEventListener('click',deleteSelected);
  $('apply-props').addEventListener('click',applyProps);
  $('choose-folder').addEventListener('click',chooseFolder);$('empty-open').addEventListener('click',()=>{openTab('files');if(!native)importImage();});
  $('open-image').addEventListener('click',importImage);$('empty-image').addEventListener('click',importImage);
  $('reload-project').addEventListener('click',reloadProject);$('inspect-files').addEventListener('click',inspectFiles);
  $('check-update').addEventListener('click',()=>nativeCall('checkUpdates'));
  $('install-update').addEventListener('click',()=>nativeCall('installUpdate'));
  $('export-log').addEventListener('click',()=>nativeCall('exportLog'));
  $('test-folder').addEventListener('click',()=>nativeCall('testFolder'));
  $('copy-diagnostics').addEventListener('click',()=>{const text=JSON.stringify({version:state.nativeInfo?.version||'browser',viewport:state.view,image:appCtx(),assets:state.project.assets.length,dirty:state.project.dirty,settings,status:state.lastStatus},null,2);if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Diagnostics copied')).catch(errorMessage);else toast('Clipboard unavailable');});
  $('clear-draft').addEventListener('click',()=>{clearDraft();toast('Local recovery snapshot cleared');});
  $('clean-canvas').addEventListener('click',()=>cleanCanvas(true));$('clean-restore').addEventListener('click',()=>cleanCanvas(false));
  $('browser-image').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;state.projectKey='browser-'+file.name;const url=URL.createObjectURL(file);await openImageElement(url,false);e.target.value='';});
  $('browser-manifest').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{state.project.load(JSON.parse(await file.text()));refreshUI();}catch(err){errorMessage(err);}e.target.value='';});
  document.addEventListener('keydown',e=>{if(e.target.closest('input,select,dialog'))return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='s'){e.preventDefault();saveProject();}
    else if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();if(e.shiftKey)state.project.redo();else state.project.undo();refreshUI();scheduleDraft();}
    else if((e.ctrlKey||e.metaKey)&&key==='y'){e.preventDefault();state.project.redo();refreshUI();scheduleDraft();}
    else if(key==='delete'){e.preventDefault();deleteSelected();}else if(key==='f2'){e.preventDefault();renameSelected();}
    else if(key==='escape'){closeTab();$('nudge-panel').hidden=true;}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.project.dirty)scheduleDraft();});
  window.addEventListener('error',e=>{const msg=`${e.message} at ${e.filename}:${e.lineno}`;log('JS ERROR',msg);if(native)native.jsError(msg);});
  window.addEventListener('unhandledrejection',e=>{const msg=String(e.reason);log('PROMISE ERROR',msg);if(native)native.jsError(msg);});
  refreshStatus();if(native)loadNativeProject();else{toast('Browser test: open an image to begin');}
  refreshUI();
}
bind();