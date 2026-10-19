import {Project, makeAsset, normalizeAsset, verifyAssets, filenameFor, copy} from './model.mjs';
import {Viewport, limit, handles, hitHandle, hitBorder, adjust, move, rectangle, snap, nineParts} from './geometry.mjs';
import {alignRect,placeTemplate,focusTarget} from './crop-alignment.mjs';
import {clamp01, lockedAxis, ReleaseTracker, settleTarget, springAt} from './drawer-motion.mjs';
import {BoundedCache, assetListKey, intersectsViewport} from './editor-performance.mjs';

const $=id=>document.getElementById(id);
const native=window.NativeAndroid??null;
const settingsKey='gui-cutter.preferences.v1';
const defaults={edgeSnap:true,cropSnap:false,haptics:true,showEdges:false,hideUnselected:false,labels:false,checkerboard:true,magnifier:true,explodeNine:true,newKind:'normal',theme:'system',glassTransparency:24,glassBlur:20,smoothMotion:true,assetView:'list',gizmoTint:'champagne'};
let settings={...defaults};
try{
  const saved=JSON.parse(localStorage.getItem(settingsKey)||'{}');
  settings={...settings,...saved};
  // Migrate the former binary Reduce Transparency toggle without a visual jump.
  if(!Number.isFinite(Number(saved.glassTransparency)) && saved.reduceGlass){settings.glassTransparency=7;settings.glassBlur=6;}
}catch{}
settings.glassTransparency=Math.round(Math.max(0,Math.min(65,Number(settings.glassTransparency)||0)));
settings.glassBlur=Math.round(Math.max(0,Math.min(36,Number(settings.glassBlur)||0)));
settings.assetView=settings.assetView==='grid'?'grid':'list';
const tintChoices={
  champagne:{halo:'255,177,76',mid:'#ffc678',core:'#fffef5'},
  glacier:{halo:'77,196,241',mid:'#91dcff',core:'#f8fdff'},
  orchid:{halo:'198,137,246',mid:'#e0b5ff',core:'#fffbff'},
  jade:{halo:'94,218,176',mid:'#a4f2d9',core:'#fafffc'}
};
if(!tintChoices[settings.gizmoTint])settings.gizmoTint='champagne';
const state={project:new Project(),view:new Viewport(),image:null,edges:null,overlay:null,mode:'edit',pointers:new Map(),gesture:null,gestureData:null,previewRect:null,snapPoint:null,busy:false,tab:'assets',projectKey:'browser',nativeInfo:null,toastTimer:0,draftTimer:0,imageSeq:0,nudge:1,canvasDpr:1,lastStatus:'Ready',imageLoaded:false,pendingSave:null,lastNavigationTap:null,lastTemplateAsset:null};
state.alignGuides=[];state.snapMemory='';state.lastSnapAt=0;state.focusEpoch=0;
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
  document.body.classList.toggle('has-selection',!!state.project.active);
  const a=state.project.active;
  if(a){$('selection-name').textContent=a.asset_id;$('selection-size').textContent=`${a.w} × ${a.h} px${a.kind==='nine_slice'?' · 9-slice':''}`;drawSelectionThumb(a);}
  for(const el of document.querySelectorAll('[data-mode]')){el.classList.toggle('active',el.dataset.mode===state.mode&&(state.mode!=='new'||settings.newKind==='normal'));}
  $('new-kind').classList.toggle('active',state.mode==='new'&&settings.newKind==='nine_slice');
  $('snap').classList.toggle('selected',settings.edgeSnap);$('snap').setAttribute('aria-pressed',String(settings.edgeSnap));
  $('crop-snap').classList.toggle('selected',settings.cropSnap);$('crop-snap').setAttribute('aria-pressed',String(settings.cropSnap));
  $('project-title').textContent=state.nativeInfo?.projectName || (state.image?'Browser image':'No project');
  $('project-title').title=state.project.dirty?'Unsaved changes':'Project files';
}
function refreshUI(){updateButtons();renderList();renderProperties();renderPreview();scheduleDraw();}
// Live gestures only update the relevant visible controls once per animation frame.
// Never reconstruct the entire asset library while a finger is moving.
let liveChromeQueued=false;
function refreshDuringGesture(){
  scheduleDraw();
  if(liveChromeQueued)return;
  liveChromeQueued=true;
  requestAnimationFrame(()=>{
    liveChromeQueued=false;
    updateButtons();
    if(bottomTabVisible('properties'))renderProperties();
  });
}
function resolvedTheme(){
  if(settings.theme!=='system')return settings.theme;
  return (native&&state.nativeInfo?.systemDark!==undefined
    ? !!state.nativeInfo.systemDark : window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark':'light';
}
function applyAppearance(){
  const root=document.documentElement;
  const theme=resolvedTheme();
  root.dataset.theme=theme;root.dataset.motion=settings.smoothMotion?'on':'off';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#121C2A':'#EEF3F7');
  root.style.setProperty('--glass-alpha',String((100-settings.glassTransparency)/100));
  root.style.setProperty('--glass-blur',settings.glassBlur+'px');
  $('glass-opacity').value=String(settings.glassTransparency);
  $('glass-blur').value=String(settings.glassBlur);
  for(const btn of document.querySelectorAll('[data-gizmo-tint]')){
    const active=btn.dataset.gizmoTint===settings.gizmoTint;
    btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));
  }
  $('glass-opacity-value').textContent=settings.glassTransparency+'%';
  $('glass-blur-value').textContent=settings.glassBlur+' px';
  for(const id of ['glass-opacity','glass-blur']){
    const el=$(id);el.style.setProperty('--fill',(100*(el.valueAsNumber-Number(el.min))/(Number(el.max)-Number(el.min)))+'%');
  }
}
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
function focusAsset(asset){
  if(!asset||!state.image)return;
  const canvas=$('editor'),sheet=$('drawer');
  const open=sheet.classList.contains('is-open');
  const bottom=open?Math.max(140,sheet.getBoundingClientRect().top-canvas.getBoundingClientRect().top):canvas.clientHeight;
  const target=focusTarget(state.view,asset,{width:canvas.clientWidth,height:canvas.clientHeight,visibleBottom:bottom});
  if(!target?.changed)return;
  const from={x:state.view.x,y:state.view.y,scale:state.view.scale},epoch=++state.focusEpoch;
  if(!settings.smoothMotion||matchMedia('(prefers-reduced-motion: reduce)').matches){
    Object.assign(state.view,target);setZoomLabel();scheduleDraw();return;
  }
  const started=performance.now();
  function animate(now){
    if(epoch!==state.focusEpoch)return;
    const t=Math.min(1,(now-started)/230),e=1-Math.pow(1-t,3);
    state.view.x=from.x+(target.x-from.x)*e;
    state.view.y=from.y+(target.y-from.y)*e;
    state.view.scale=from.scale+(target.scale-from.scale)*e;
    setZoomLabel();scheduleDraw();
    if(t<1)requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
function rememberTemplate(){if(state.project.active)state.lastTemplateAsset={...state.project.active};}
function selectIndex(i){state.project.selected=i;rememberTemplate();refreshUI();focusAsset(state.project.active);}
function chooseMode(mode){if(state.gestureData){cancelSingle();state.pointers.clear();hideMagnifier();}state.mode=mode;state.previewRect=null;state.gesture=null;updateButtons();scheduleDraw();}
const applicationTabs=new Set(['files','settings','developer']);
const panelMap={app:$('app-drawer'),sheet:$('drawer')};
const closedReveal={app:16,sheet:20};
const drawerMotion={active:null,animation:null,multi:false};
const dragDistance={app:null,sheet:null};
function isAnyDrawerOpen(){
  return panelMap.app.classList.contains('is-open')||panelMap.sheet.classList.contains('is-open')||!!drawerMotion.active||!!drawerMotion.animation;
}
function bottomTabVisible(tab){
  return state.tab===tab&&(panelMap.sheet.classList.contains('is-open')||panelMap.sheet.classList.contains('is-peeking'));
}
function currentPanel(){
  if(panelMap.app.classList.contains('is-open'))return 'app';
  if(panelMap.sheet.classList.contains('is-open'))return 'sheet';
  return null;
}
function panelSpan(kind){
  return Math.max(1,(kind==='app'?panelMap.app.offsetWidth:panelMap.sheet.offsetHeight)-closedReveal[kind]);
}
function setTabs(tab){
  state.tab=tab;
  for(const el of document.querySelectorAll('.tab-pane'))el.hidden=el.id!=='tab-'+tab;
  for(const el of document.querySelectorAll('[data-tab]'))el.classList.toggle('current',el.dataset.tab===tab);
}
function syncShelfHandles(){
  $('side-grip').setAttribute('aria-expanded',String(panelMap.app.classList.contains('is-open')));
  $('sheet-grip').setAttribute('aria-expanded',String(panelMap.sheet.classList.contains('is-open')));
}
function renderPanelProgress(kind,value){
  const panel=panelMap[kind],p=clamp01(value);
  const remaining=panelSpan(kind)*(1-p);
  panel.classList.toggle('is-peeking',p>.0001&&!panel.classList.contains('is-open'));
  panel.style.transform=kind==='app'?'translate3d('+(-remaining)+'px,0,0)':'translate3d(-50%,'+remaining+'px,0)';
  const shade=$('shade');
  shade.classList.toggle('is-peeking',p>.001);
  shade.style.opacity=String(p);
  shade.style.pointerEvents=p>.98?'auto':'none';
  dragDistance[kind]=p;
}
function clearPanelInline(kind){
  const el=panelMap[kind];el.style.transform='';
  el.classList.remove('is-peeking');
  dragDistance[kind]=null;
}
function finishPanel(kind,target){
  const panel=panelMap[kind];
  panel.classList.toggle('is-open',target===1);
  panel.setAttribute('aria-hidden',String(target===0));
  clearPanelInline(kind);
  // Inactive sheet remains fully hidden; the two little grips alone stay exposed.
  const other=kind==='app'?'sheet':'app';
  if(target===1){
    panelMap[other].classList.remove('is-open');
    panelMap[other].setAttribute('aria-hidden','true');clearPanelInline(other);
  }
  const open=panelMap.app.classList.contains('is-open')||panelMap.sheet.classList.contains('is-open');
  const shade=$('shade');
  shade.classList.toggle('is-open',open);shade.classList.remove('is-peeking');
  shade.style.opacity='';shade.style.pointerEvents='';
  panel.classList.remove('gesture-live');
  document.body.dataset.openDrawer=open?(panelMap.app.classList.contains('is-open')?'app':'sheet'):'none';
  syncShelfHandles();
  if(open)refreshUI();
}
function stopDrawerAnimation(){
  if(!drawerMotion.animation)return;
  cancelAnimationFrame(drawerMotion.animation.raf);
  drawerMotion.animation=null;
}
function moveDrawer(kind,to,start,velocity=0){
  stopDrawerAnimation();
  const panel=panelMap[kind],from=clamp01(start),target=to?1:0;
  panel.classList.add('gesture-live');
  if(!settings.smoothMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    finishPanel(kind,target);return;
  }
  const fromTime=performance.now(),initialVelocity=Math.max(-3.5,Math.min(3.5,velocity*1000/panelSpan(kind)));
  const anim={kind,raf:0};drawerMotion.animation=anim;
  const frame=t=>{
    if(drawerMotion.animation!==anim)return;
    const sample=springAt(from,target,initialVelocity,t-fromTime);
    renderPanelProgress(kind,sample.progress);
    if(sample.done){
      drawerMotion.animation=null;finishPanel(kind,target);
    }else anim.raf=requestAnimationFrame(frame);
  };
  anim.raf=requestAnimationFrame(frame);
}
function showTab(tab){
  const app=applicationTabs.has(tab),kind=app?'app':'sheet';
  if(state.gestureData){cancelSingle();state.pointers.clear();hideMagnifier();}
  setTabs(tab);
  // Populate content before it appears from the edge. Never redraw repeatedly during the pull.
  if(!panelMap[kind].classList.contains('is-open')){
    panelMap[kind].classList.add('is-peeking');
    if(tab==='assets')renderList();
    if(tab==='preview')renderPreview();
  }
  if(tab==='files'){inspectFiles();refreshProjectLibrary();}
  if(tab==='settings'||tab==='developer')refreshStatus();
  if(!app)$('nudge-panel').hidden=true;
  return kind;
}
function openTab(tab){
  if(drawerMotion.multi)return;
  const kind=showTab(tab);
  if(currentPanel()===kind&&!drawerMotion.animation){refreshUI();return;}
  const other=kind==='app'?'sheet':'app';
  if(panelMap[other].classList.contains('is-open')){
    panelMap[other].classList.remove('is-open');panelMap[other].setAttribute('aria-hidden','true');
    clearPanelInline(other);
  }
  const start=drawerMotion.animation?.kind===kind?dragDistance[kind]??0:0;
  moveDrawer(kind,1,start);
  refreshUI();
}
function closeTab(){
  if(drawerMotion.active){drawerMotion.active.cancelled=true;drawerMotion.active=null;}
  const kind=drawerMotion.animation?.kind||currentPanel();
  if(!kind)return;
  moveDrawer(kind,0,dragDistance[kind]??1);
}
function cleanCanvas(yes){if(yes){stopDrawerAnimation();drawerMotion.active=null;closeTab();}document.body.classList.toggle('clean',yes);$('clean-restore').hidden=!yes;}

function forbiddenGestureTarget(el,kind){
  // Let sliders, editable fields, toggles and ordinary action buttons own their touches.
  if(el.closest('input,select,textarea,[contenteditable="true"],[role="slider"],.step-field,.range-setting,.switch'))return true;
  const button=el.closest('button');
  if(!button)return false;
  if(button.closest('.sheet-tabs,.app-nav')||button.classList.contains('asset-item'))return false;
  if(button.id==='side-grip')return false;
  return true;
}
function scrollAncestor(el,panel){
  let node=el;
  while(node&&node!==panel){
    if(node.scrollHeight>node.clientHeight+3&&getComputedStyle(node).overflowY.match(/auto|scroll/))return node;
    node=node.parentElement;
  }
  return null;
}
function beginDrawerTouch(kind,e){
  if(e.touches.length!==1||drawerMotion.multi||drawerMotion.active)return;
  const panel=panelMap[kind],target=e.target;
  const opening=!panel.classList.contains('is-open');
  // A second shelf cannot be dragged while its sibling occupies the workspace.
  if(opening&&currentPanel()&&currentPanel()!==kind)return;
  const grip=kind==='app'?$('side-grip'):$('sheet-grip');
  if(opening&&!grip.contains(target))return;
  if(!opening&&forbiddenGestureTarget(target,kind))return;
  stopDrawerAnimation();
  const touch=e.changedTouches[0],p=dragDistance[kind]??(opening?0:1);
  drawerMotion.active={
    kind,id:touch.identifier,x:touch.clientX,y:touch.clientY,p,
    startP:p,track:new ReleaseTracker(),mode:null,locked:false,
    scroll:opening?null:scrollAncestor(target,panel),fromGrip:grip.contains(target),
    cancelled:false,t0:e.timeStamp
  };
  drawerMotion.active.track.add(p*panelSpan(kind),e.timeStamp);
}
function moveDrawerTouch(kind,e){
  const g=drawerMotion.active;
  if(!g||g.kind!==kind||g.cancelled||drawerMotion.multi)return;
  const finger=[...e.touches].find(t=>t.identifier===g.id);
  if(!finger)return;
  const dx=finger.clientX-g.x,dy=finger.clientY-g.y;
  if(!g.locked){
    const axis=lockedAxis(dx,dy);
    if(!axis)return;
    if(kind==='app'&&axis!=='x'){drawerMotion.active=null;return;}
    if(kind==='sheet'&&axis==='x'){
      if(g.startP<.01){drawerMotion.active=null;return;}
      // Horizontal swipe on the entire sheet changes tabs; vertical scrolling is unchanged.
      g.mode='tabs';g.locked=true;
    }else if(kind==='sheet'&&axis==='y'){
      if(!g.fromGrip&&dy<0){drawerMotion.active=null;return;}
      if(!g.fromGrip&&g.scroll&&g.scroll.scrollTop>1){drawerMotion.active=null;return;}
      g.mode='drawer';g.locked=true;
    }else {g.mode='drawer';g.locked=true;}
    if(g.mode==='drawer'&&g.fromGrip&&g.startP<.01){showTab(kind==='app'?'files':'assets');}
    if(g.mode==='drawer'){$('shade').classList.add('is-peeking');panelMap[kind].classList.add('gesture-live');}
  }
  if(g.mode==='tabs'){e.preventDefault();return;}
  const signed=kind==='app'?dx:-dy;
  const p=clamp01(g.startP+signed/panelSpan(kind));
  renderPanelProgress(kind,p);g.track.add(p*panelSpan(kind),e.timeStamp);
  e.preventDefault();
}
function endDrawerTouch(kind,e){
  const g=drawerMotion.active;
  if(!g||g.kind!==kind||![...e.changedTouches].some(t=>t.identifier===g.id))return;
  drawerMotion.active=null;
  if(g.cancelled||drawerMotion.multi){if(g.mode==='drawer')moveDrawer(kind,g.startP>0.5?1:0,dragDistance[kind]??g.startP);return;}
  const finger=[...e.changedTouches].find(t=>t.identifier===g.id);
  const dx=finger.clientX-g.x,dy=finger.clientY-g.y;
  if(g.mode==='tabs'){
    const span=Math.abs(dx),duration=Math.max(1,e.timeStamp-g.t0),fast=span/duration>.38;
    if(Math.abs(dx)>Math.abs(dy)*1.4&&(span>=63||(span>37&&fast))){
      const tabs=['assets','properties','preview'],index=tabs.indexOf(state.tab),next=index+(dx<0?1:-1);
      if(next>=0&&next<tabs.length)showTab(tabs[next]);
      refreshUI();e.preventDefault();
    }
    return;
  }
  if(g.mode==='drawer'){
    const p=dragDistance[kind]??g.startP;
    // The panel surface requires a deliberate swipe; the small grip is more responsive.
    const gestureTravel=Math.abs(kind==='app'?dx:dy);
    if(!g.fromGrip&&gestureTravel<30){
      moveDrawer(kind,g.startP>=.5?1:0,p);e.preventDefault();return;
    }
    g.track.add(p*panelSpan(kind),e.timeStamp);
    const velocity=g.track.velocity().pixelsPerMs;
    const target=settleTarget(p,g.track,panelSpan(kind));
    moveDrawer(kind,target,p,velocity);
    e.preventDefault();
    return;
  }
  if(g.fromGrip&&!drawerMotion.multi&&Math.hypot(dx,dy)<12){
    const target=panelMap[kind].classList.contains('is-open')?0:1;
    if(target===1)showTab(kind==='app'?'files':'assets');
    moveDrawer(kind,target,g.startP);
    e.preventDefault();
  }
}
function bindNavigationGestures(){
  for(const kind of ['app','sheet']){
    const panel=panelMap[kind];
    panel.addEventListener('touchstart',e=>beginDrawerTouch(kind,e),{passive:true});
    panel.addEventListener('touchmove',e=>moveDrawerTouch(kind,e),{passive:false});
    panel.addEventListener('touchend',e=>endDrawerTouch(kind,e),{passive:false});
    panel.addEventListener('touchcancel',e=>{
      const g=drawerMotion.active;
      if(g?.kind===kind){drawerMotion.active=null;if(g.mode==='drawer')moveDrawer(kind,g.startP>.5?1:0,dragDistance[kind]??g.startP);}
    },{passive:true});
  }
  // Any second touch aborts a drawer drag. It can never steal a two-finger image gesture.
  document.addEventListener('touchstart',e=>{
    if(e.touches.length>1){drawerMotion.multi=true;
      if(drawerMotion.active){const g=drawerMotion.active;drawerMotion.active=null;
        if(g.mode==='drawer')moveDrawer(g.kind,g.startP>.5?1:0,dragDistance[g.kind]??g.startP);}
    }
  },{passive:true,capture:true});
  document.addEventListener('touchend',e=>{if(!e.touches.length)drawerMotion.multi=false;},{passive:true,capture:true});
  document.addEventListener('touchcancel',e=>{if(!e.touches.length)drawerMotion.multi=false;},{passive:true,capture:true});
  $('sheet-grip').addEventListener('keydown',e=>{if(['Escape','Enter',' '].includes(e.key)){e.preventDefault();closeTab();}});
  $('side-grip').addEventListener('keydown',e=>{if(['Escape','Enter',' '].includes(e.key)){e.preventDefault();openTab('files');}});
}

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
    // Skip decoration well outside the display, preserving room for halos and labels.
    if(!intersectsViewport(tl.x,tl.y,br.x,br.y,w,h,32))continue;
    ctx.save();ctx.setLineDash([]);
    if(selected){
      const tint=tintChoices[settings.gizmoTint],rect=[tl.x+.5,tl.y+.5,br.x-tl.x,br.y-tl.y];
      // Light-saber optics: distant colored glow, fine colored rim, near-white core.
      ctx.strokeStyle='rgba('+tint.halo+',.58)';ctx.shadowColor='rgba('+tint.halo+',.67)';
      ctx.shadowBlur=15;ctx.lineWidth=2.8;ctx.strokeRect(...rect);
      ctx.shadowBlur=5;ctx.strokeStyle=tint.mid;ctx.lineWidth=1.75;ctx.strokeRect(...rect);
      ctx.shadowBlur=0;ctx.strokeStyle=tint.core;ctx.lineWidth=1.05;ctx.strokeRect(...rect);
      // Graduations remain delicate, never confused with crop handles.
      const rw=br.x-tl.x,rh=br.y-tl.y;
      ctx.strokeStyle='rgba(255,252,246,.76)';ctx.lineWidth=.8;
      if(rw>=38)for(const u of [.25,.5,.75]){
        const tx=tl.x+rw*u;ctx.beginPath();ctx.moveTo(tx,tl.y-3.5);ctx.lineTo(tx,tl.y+3.5);
        ctx.moveTo(tx,br.y-3.5);ctx.lineTo(tx,br.y+3.5);ctx.stroke();
      }
      if(rh>=38)for(const u of [.25,.5,.75]){
        const ty=tl.y+rh*u;ctx.beginPath();ctx.moveTo(tl.x-3.5,ty);ctx.lineTo(tl.x+3.5,ty);
        ctx.moveTo(br.x-3.5,ty);ctx.lineTo(br.x+3.5,ty);ctx.stroke();
      }
    }else{
      ctx.strokeStyle='rgba(93,184,232,.85)';ctx.lineWidth=1.1;
      ctx.strokeRect(tl.x+.5,tl.y+.5,br.x-tl.x,br.y-tl.y);
    }
    ctx.restore();
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
    if(selected){
      const tint=tintChoices[settings.gizmoTint];
      for(const [name,[hx,hy]] of Object.entries(handles(a))){
        const q=v.toScreen(hx,hy),corner=['tl','tr','bl','br'].includes(name),middle=name.startsWith('edge_'),moving=name==='move';
        const radius=corner?4.7:middle?2.45:moving?3.6:2.9;
        ctx.save();ctx.shadowColor='rgba('+tint.halo+',.82)';ctx.shadowBlur=corner?10:6;
        ctx.fillStyle=tint.core;ctx.strokeStyle=tint.mid;ctx.lineWidth=corner?1.35:1.05;
        ctx.beginPath();ctx.arc(q.x,q.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.restore();
        if(moving){ctx.save();ctx.strokeStyle='rgba(35,55,71,.76)';ctx.lineWidth=.8;
          ctx.beginPath();ctx.moveTo(q.x-2,q.y);ctx.lineTo(q.x+2,q.y);
          ctx.moveTo(q.x,q.y-2);ctx.lineTo(q.x,q.y+2);ctx.stroke();ctx.restore();}
      }
    }
  }
  if(state.previewRect){const a=state.previewRect,tl=v.toScreen(a.x,a.y),br=v.toScreen(a.x+a.w,a.y+a.h);
    ctx.save();ctx.lineWidth=2.2;ctx.setLineDash([7,4]);ctx.shadowColor='rgba(66,239,144,.7)';ctx.shadowBlur=11;ctx.strokeStyle='#60e9a0';ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);ctx.shadowBlur=0;ctx.lineWidth=.95;ctx.strokeStyle='#f6fff7';ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);ctx.restore();}
  paintAlignmentGuides(v);
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

let edgeWorker=null;
function stopEdgeWorker(){if(edgeWorker){edgeWorker.terminate();edgeWorker=null;}}
function releaseImageUrl(src){if(typeof src==='string'&&src.startsWith('blob:'))URL.revokeObjectURL(src);}
async function openImageElement(src,loadManifest=true){
  const seq=++state.imageSeq;stopEdgeWorker();const image=new Image();
  image.onload=async()=>{
    releaseImageUrl(src);
    if(seq!==state.imageSeq)return;
    state.image=image;state.imageLoaded=true;
    state.project.imageWidth=image.naturalWidth;state.project.imageHeight=image.naturalHeight;
    state.edges=null;state.overlay=null;state.lastTemplateAsset=null;assetThumbnails.clear();$('empty').hidden=true;
    if(loadManifest&&native){try{const json=native.readManifest();state.project.load(json?JSON.parse(json):{assets:[]});}
      catch(e){state.project.reset([]);errorMessage('Could not load manifest: '+e.message);}}
    else state.project.reset([]);
    fitImage();refreshUI();processEdges(image,seq);await recoverDraft();toast(`Image loaded: ${image.naturalWidth} × ${image.naturalHeight}`);
  };
  image.onerror=()=>{releaseImageUrl(src);if(seq===state.imageSeq){state.image=null;state.imageLoaded=false;$('empty').hidden=false;errorMessage('Could not open base image.');}};
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
    edgeWorker=worker;
    worker.onmessage=evt=>{if(edgeWorker!==worker)return;stopEdgeWorker();if(seq!==state.imageSeq)return;
      if(evt.data.error){errorMessage(evt.data.error);return;}
      state.edges=new Uint8Array(evt.data.edges);state.overlay=null;if(settings.showEdges)buildOverlay();scheduleDraw();log('Edge map ready',`${iw}x${ih}`);};
    worker.onerror=e=>{if(edgeWorker!==worker)return;stopEdgeWorker();log('Edge worker failed',e.message);};
    worker.postMessage({rgba:data.data.buffer,width:iw,height:ih},[data.data.buffer]);
  }catch(e){log('Edge detection unavailable',e.message);}
}
function buildOverlay(){if(!state.edges||!state.image)return;const {iw,ih}=appCtx();
  try{const temp=document.createElement('canvas');temp.width=iw;temp.height=ih;const cx=temp.getContext('2d');const id=cx.createImageData(iw,ih);for(let i=0;i<state.edges.length;i++)if(state.edges[i]){const j=i*4;id.data[j]=87;id.data[j+1]=215;id.data[j+2]=255;id.data[j+3]=110;}cx.putImageData(id,0,0);state.overlay=temp;scheduleDraw();}
  catch(e){settings.showEdges=false;saveSettings();errorMessage(e);}
}
// Thumbnail cache contains small canvases, never full-size source copies.
const assetThumbnails=new BoundedCache(120);
let lastAssetListKey=null;
let lastAssetSelection=-1;
function cropThumbnail(asset){
  const key=[state.imageSeq,asset.x,asset.y,asset.w,asset.h].join(':');
  if(assetThumbnails.has(key))return assetThumbnails.get(key);
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=72;
  if(state.image){
    const c=canvas.getContext('2d',{alpha:true});c.imageSmoothingEnabled=false;
    const scale=Math.min(96/asset.w,72/asset.h);
    const w=asset.w*scale,h=asset.h*scale;
    c.drawImage(state.image,asset.x,asset.y,asset.w,asset.h,(96-w)/2,(72-h)/2,w,h);
  }
  assetThumbnails.set(key,canvas);
  return canvas;
}
function renderList(){
  if(!bottomTabVisible('assets'))return;
  const panel=$('asset-list');
  const contentKey=assetListKey(state.project.assets,state.imageSeq,settings.assetView);
  if(contentKey===lastAssetListKey){
    // Selecting a crop changes two classes, not the entire list of previews.
    if(lastAssetSelection!==state.project.selected){
      panel.children[lastAssetSelection]?.classList.remove('active');
      panel.children[state.project.selected]?.classList.add('active');
      lastAssetSelection=state.project.selected;
    }
    return;
  }
  const oldScroll=panel.parentElement.scrollTop;
  const grid=settings.assetView==='grid';
  panel.classList.toggle('view-grid',grid);
  panel.classList.toggle('view-list',!grid);
  const toggle=$('toggle-asset-view');
  toggle.title=grid?'Switch to list view':'Switch to grid view';
  toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-pressed',String(grid));
  toggle.querySelector('use').setAttribute('href',grid?'#i-list':'#i-assets');
  const fragment=document.createDocumentFragment();
  for(let i=0;i<state.project.assets.length;i++){
    const a=state.project.assets[i],btn=document.createElement('button');
    btn.className='asset-item'+(state.project.selected===i?' active':'');
    btn.type='button';btn.setAttribute('aria-label',a.asset_id+', '+a.w+' by '+a.h+' pixels');
    const thumb=document.createElement('span');thumb.className='asset-thumb';
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=72;
    canvas.getContext('2d').drawImage(cropThumbnail(a),0,0);
    thumb.append(canvas);
    const title=document.createElement('span');title.className='asset-copy';
    const name=document.createElement('strong'),dim=document.createElement('small'),kind=document.createElement('span');
    name.textContent=a.asset_id;dim.textContent=a.w+' × '+a.h+' · '+a.x+','+a.y;
    title.append(name,dim);kind.textContent=a.kind==='nine_slice'?'9-slice':'Normal';kind.className='asset-kind';
    btn.append(thumb,title,kind);
    btn.addEventListener('click',()=>selectIndex(i));fragment.append(btn);
  }
  if(!state.project.assets.length){const el=document.createElement('p');el.textContent='No crops yet. Choose New to draw your first asset.';el.className='minor';fragment.append(el);}
  panel.replaceChildren(fragment);panel.parentElement.scrollTop=oldScroll;
  lastAssetListKey=contentKey;lastAssetSelection=state.project.selected;
}
const labels={x:'X',y:'Y',w:'Width',h:'Height',left:'9-slice left',top:'9-slice top',right:'9-slice right',bottom:'9-slice bottom'};
function createNumericControls(){for(const key of Object.keys(labels)){const outer=document.createElement('div');outer.className='numeric-item';outer.dataset.key=key;
    const label=document.createElement('label');label.textContent=labels[key];const row=document.createElement('div');row.className='step-field';
    const minus=document.createElement('button');minus.textContent='−';minus.type='button';minus.addEventListener('click',()=>nudgeField(key,-1));
    const input=document.createElement('input');input.type='number';input.step='1';input.id='prop-'+key;input.inputMode='numeric';
    const plus=document.createElement('button');plus.textContent='+';plus.type='button';plus.addEventListener('click',()=>nudgeField(key,1));
    row.append(minus,input,plus);outer.append(label,row);$(['left','top','right','bottom'].includes(key)?'margin-grid':'numeric-grid').append(outer);}}
function renderProperties(){if(!bottomTabVisible('properties'))return;const a=state.project.active;$('props-none').hidden=!!a;$('props-fields').hidden=!a;if(!a)return;
  $('prop-name').value=a.asset_id;$('prop-kind').value=a.kind;$('nine-card').hidden=a.kind!=='nine_slice';for(const key of Object.keys(labels)){$('prop-'+key).value=a[key];}
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
function renderPreview(){if(!bottomTabVisible('preview'))return;const canvas=$('preview'),a=state.project.active,container=canvas.parentElement;
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

function tactile(){
  if(!settings.haptics)return;
  try{if(native&&typeof native.hapticTick==='function')native.hapticTick();else navigator.vibrate?.(5);}catch{}
}
function announceSnap(signature){
  if(!signature){state.snapMemory='';return;}
  if(signature!==state.snapMemory){
    state.snapMemory=signature;
    if(performance.now()-state.lastSnapAt>420){state.lastSnapAt=performance.now();tactile();}
  }
}
function applyCropAlignment(rect,mode,handle=null,exclude=-1){
  if(!settings.cropSnap){state.alignGuides=[];return rect;}
  const {iw,ih}=appCtx();
  const result=alignRect(rect,state.project.assets,{scale:state.view.scale,mode,handle,exclude,iw,ih});
  state.alignGuides=result.guides;
  announceSnap(result.found?'crop:'+result.guides.map(g=>g.axis+':'+g.at).join('|'):'');
  return result.rect;
}
function paintAlignmentGuides(view){
  if(!settings.cropSnap||!state.alignGuides?.length)return;
  ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(153,166,176,.53)';ctx.setLineDash([2,5]);
  for(const g of state.alignGuides){
    ctx.beginPath();
    if(g.axis==='x'){
      const x=view.toScreen(g.at,0).x;
      ctx.moveTo(x,view.toScreen(0,g.start).y);
      ctx.lineTo(x,view.toScreen(0,g.end).y);
    }else{
      const y=view.toScreen(0,g.at).y;
      ctx.moveTo(view.toScreen(g.start,0).x,y);
      ctx.lineTo(view.toScreen(g.end,0).x,y);
    }ctx.stroke();
  }ctx.restore();
}
function cancelSingle(){state.alignGuides=[];state.snapMemory='';const g=state.gestureData;if(g?.before)state.project.restoreSnapshot(g.before);state.previewRect=null;state.snapPoint=null;state.gesture=null;state.gestureData=null;refreshUI();}
function startPinch(){const prior=state.gestureData?.selectedBefore;cancelSingle();if(prior!==undefined)state.project.selected=prior;const pts=[...state.pointers.values()].slice(0,2),a=pts[0],b=pts[1],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  state.gesture='pinch';state.gestureData={distance:Math.hypot(a.x-b.x,a.y-b.y)||1,scale:state.view.scale,anchor:state.view.toImage(mx,my)};
}
function startSingle(p){if(!state.image||state.busy)return;const {iw,ih}=appCtx(),v=state.view,pt=v.toImage(p.x,p.y);
  const base={x:Math.round(limit(pt.x,0,iw)),y:Math.round(limit(pt.y,0,ih))};
  state.gestureData={screen:{x:p.x,y:p.y},anchor:base,before:state.project.snapshot(),selectedBefore:state.project.selected,start:null,index:state.project.selected};
  if(state.mode==='navigate'){state.gesture='pan';return;}
  if(state.mode==='new'){
    state.gesture='draw';
    const g=state.gestureData;g.template=state.project.active?{...state.project.active}:(state.lastTemplateAsset?{...state.lastTemplateAsset}:null);g.dragged=false;
    const r=g.template?placeTemplate(g.template,base.x,base.y,iw,ih):null;
    state.previewRect=r?applyCropAlignment(r,'move'):{x:limit(base.x,0,iw-1),y:limit(base.y,0,ih-1),w:1,h:1};
    scheduleDraw();return;
  }
  const active=state.project.active;const handle=hitHandle(active,v,p.x,p.y);
  if(handle){state.gesture=handle==='move'?'move':'handle';state.gestureData.handle=handle;state.gestureData.start={...active};return;}
  const index=hitBorder(state.project.assets,v,p.x,p.y);
  if(index>=0){state.gesture='pending-select';state.gestureData.index=index;state.gestureData.start={...state.project.assets[index]};return;}
  state.gesture='pending-deselect';
}
function screenSnap(x,y,handle){const {iw,ih}=appCtx(),p=state.view.toImage(x,y);
  let target={x:Math.round(limit(p.x,0,iw)),y:Math.round(limit(p.y,0,ih)),found:false};
  if(settings.edgeSnap)target=snap(state.edges,iw,ih,target.x,target.y,handle);
  state.snapPoint=target.found?target:null;
  if(target.found)announceSnap('image:engaged');else if(!state.alignGuides?.length)announceSnap('');
  return target;
}
function handlePointerDown(e){state.focusEpoch++;if(e.button!==0&&e.pointerType==='mouse')return;if(isAnyDrawerOpen()||state.busy)return;e.preventDefault();
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
  if(state.gesture==='pending-select'){
    if(Math.hypot(p.x-g.screen.x,p.y-g.screen.y)<9)return;
    state.project.selected=g.index;rememberTemplate();state.gesture='move';updateButtons();scheduleDraw();
  }
  if(state.gesture==='pending-deselect')return;
  if(state.gesture==='draw'){
    if(Math.hypot(p.x-g.screen.x,p.y-g.screen.y)>=10)g.dragged=true;
    if(g.dragged){
      const pt=state.view.toImage(p.x,p.y);
      const corner=(pt.y>=g.anchor.y?'b':'t')+(pt.x>=g.anchor.x?'r':'l');
      const target=screenSnap(p.x,p.y,corner);
      state.previewRect=applyCropAlignment(rectangle(g.anchor.x,g.anchor.y,target.x,target.y,iw,ih),'resize',corner);
    }else if(g.template){
      const pt=state.view.toImage(p.x,p.y),r=placeTemplate(g.template,pt.x,pt.y,iw,ih);
      if(r)state.previewRect=applyCropAlignment(r,'move');
    }
    scheduleDraw();return;
  }
  if(state.gesture==='handle'){const target=screenSnap(p.x,p.y,g.handle);state.project.assets[g.index]=normalizeAsset(applyCropAlignment(adjust(g.start,g.handle,target.x,target.y,iw,ih),'resize',g.handle,g.index),iw,ih);refreshDuringGesture();showMagnifier(p,target);return;}
  if(state.gesture==='move'){
    const pos=state.view.toImage(p.x,p.y);const dx=Math.round(pos.x-g.anchor.x),dy=Math.round(pos.y-g.anchor.y);
    state.project.assets[g.index]=applyCropAlignment(move(g.start,dx,dy,iw,ih),'move',null,g.index);refreshDuringGesture();showMagnifier(p,pos);
  }
}
async function finishDraw(r,template=null){state.previewRect=null;if(!r||r.w<2||r.h<2)return;
  const id=await createModal({title:'New crop',initial:`asset_${String(state.project.assets.length+1).padStart(2,'0')}`,message:'Give this UI element a unique name.'});
  if(!id)return;try{const {iw,ih}=appCtx();const asset=makeAsset(id,settings.newKind,r.x,r.y,r.w,r.h,iw,ih);
    if(template?.kind==='nine_slice'&&settings.newKind==='nine_slice')for(const side of ['left','right','top','bottom'])asset[side]=template[side];
    state.project.insert(normalizeAsset(asset,iw,ih));rememberTemplate();tactile();refreshUI();scheduleDraft();chooseMode('edit');toast(`Created ${id}`);}catch(e){errorMessage(e);}}
function handlePointerEnd(e){if(!state.pointers.has(e.pointerId))return;e.preventDefault();state.pointers.delete(e.pointerId);
  if(state.gesture==='pinch'){if(!state.pointers.size){state.gesture=null;state.gestureData=null;}state.lastNavigationTap=null;scheduleDraw();return;}
  const action=state.gesture,r=state.previewRect,g=state.gestureData;state.gesture=null;state.gestureData=null;state.previewRect=null;state.snapPoint=null;state.alignGuides=[];state.snapMemory='';hideMagnifier();
  if(e.type==='pointercancel'){if(g?.before)state.project.restoreSnapshot(g.before);refreshUI();return;}
  if(action==='pan'&&g?.screen){
    const delta=Math.hypot(e.clientX-g.screen.x,e.clientY-g.screen.y),now=Date.now();
    if(delta<12&&state.lastNavigationTap&&now-state.lastNavigationTap.time<330&&Math.hypot(e.clientX-state.lastNavigationTap.x,e.clientY-state.lastNavigationTap.y)<35){fitImage();state.lastNavigationTap=null;}
    else state.lastNavigationTap=delta<12?{x:e.clientX,y:e.clientY,time:now}:null;
  }else state.lastNavigationTap=null;
  if(action==='draw'){
    if(g?.dragged)finishDraw(r);
    else if(g?.template)finishDraw(r,g.template);
    else toast('Drag to draw, or select a crop to tap-place its size.',2400);
  }
  if(action==='pending-select'){state.project.selected=g.index;rememberTemplate();}
  if(action==='pending-deselect')state.project.selected=-1;
  if(['move','handle'].includes(action)){rememberTemplate();change();}else refreshUI();
}
let magnifierFrame=0;
let magnifierRequest=null;
function hideMagnifier(){
  if(magnifierFrame)cancelAnimationFrame(magnifierFrame);
  magnifierFrame=0;magnifierRequest=null;$('magnifier').hidden=true;
}
function showMagnifier(screen,imagePt){
  if(!settings.magnifier||!state.image)return;
  magnifierRequest={screen,imagePt};
  if(magnifierFrame)return;
  magnifierFrame=requestAnimationFrame(()=>{
    magnifierFrame=0;
    const latest=magnifierRequest;magnifierRequest=null;
    if(latest)paintMagnifier(latest.screen,latest.imagePt);
  });
}
function paintMagnifier(screen,imagePt){
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
  try{const info=JSON.parse(native.appStatus());state.nativeInfo=info;state.projectKey=info.projectKey||'android';applyAppearance();
    $('app-version').textContent=`v${info.version} (${info.versionCode})`;$('app-folder').textContent=info.workFolder||'Not configured';
    $('folder-name').textContent=info.projectName||'No project open';
    $('settings-project-name').textContent=info.projectName||'No project open';
    $('rename-project').disabled=!info.hasProject||info.projectId==='@legacy';
    $('work-folder-name').textContent=info.workFolder||'Not configured';
    $('project-location').textContent=info.hasProject?`In ${info.workFolder}`:'Choose New project or From image';
    $('open-image').hidden=!info.hasProject||!!info.hasBase;
    $('open-image').disabled=!info.hasProject||!!info.hasBase;
    $('reload-project').disabled=!info.hasProject;
    $('bundle-project').disabled=!info.hasBase;
    $('log-state').textContent=info.logsEnabled?'Enabled in APK':'Disabled in build';updateButtons();}
  catch(e){errorMessage(e);}}
function inspectFiles(){const box=$('file-list');box.replaceChildren();if(!native){box.textContent='Browser testing: use Open Image, then Save to download PNGs and JSON.';return;}
  if(!state.nativeInfo?.hasProject){box.textContent='Open a project to inspect its files.';return;}
  try{const data=JSON.parse(native.inspectFiles());if(!data.length){box.textContent='No project files yet.';return;}
    for(const file of data){const btn=document.createElement('button');btn.className='file-entry';const name=document.createElement('span'),size=document.createElement('small');name.textContent=file.name;size.textContent=file.size>=0?`${Math.ceil(file.size/1024)} KB`:'';btn.append(name,size);btn.addEventListener('click',()=>{if(file.openable)nativeCall('openExport',file.name);else toast('Use your Android file manager to inspect this file.');});box.append(btn);}}
  catch(e){errorMessage(e);}}
function reloadProject(){if(state.project.dirty){createModal({title:'Discard unsaved changes?',message:'This replaces the current canvas with the files already saved on disk.',question:true}).then(yes=>{if(yes){clearDraft();loadNativeProject();}});}
  else loadNativeProject();}
function loadNativeProject(){refreshStatus();if(!native){$('browser-manifest').click();return;}
  if(!state.nativeInfo?.hasBase){state.image=null;state.imageLoaded=false;state.lastTemplateAsset=null;$('empty').hidden=false;state.project.reset([]);refreshUI();return;}
  const stamp=state.nativeInfo.imageStamp||Date.now();openImageElement(`https://appassets.androidplatform.net/project/base.png?v=${encodeURIComponent(stamp)}`);}
// Native projects share a single persistent Android work folder.
function refreshProjectLibrary(){
  if(!native){
    $('project-list').textContent='Browser preview: projects are stored by Android.';
    return;
  }
  if(!state.nativeInfo?.hasWorkspace){
    $('project-list').innerHTML='<p class="hint">Set the work folder in Preferences to start.</p>';
    return;
  }
  nativeCall('listProjects');
}
function renderProjectLibrary(items){
  const box=$('project-list'),fragment=document.createDocumentFragment();
  for(const entry of items){
    const button=document.createElement('button');button.type='button';
    button.className='project-entry'+(entry.active?' active':'');
    const icon=document.createElement('span');icon.className='project-icon';icon.textContent=entry.hasImage?'▧':'◇';
    const details=document.createElement('span');details.className='project-details';
    const title=document.createElement('strong');title.textContent=entry.name;
    const sub=document.createElement('small');sub.textContent=entry.active?'Current project':entry.hasImage?'Open to continue editing':'Awaiting image';
    details.append(title,sub);
    const chevron=document.createElement('span');chevron.className='project-open-chevron';chevron.textContent='›';
    button.append(icon,details,chevron);
    button.addEventListener('click',()=>switchProject(entry.id));
    fragment.append(button);
  }
  if(!items.length){const p=document.createElement('p');p.className='hint';p.textContent='No projects yet. Create one above.';fragment.append(p);}
  box.replaceChildren(fragment);
}
async function confirmLeave(){
  if(!state.project.dirty)return true;
  return !!await createModal({title:'Leave current project?',question:true,
    message:'You have unsaved crop changes. Continue without saving them?'});
}
async function switchProject(id){
  if(!native)return;
  if(id===state.nativeInfo?.projectId){closeTab();return;}
  if(!await confirmLeave())return;
  clearDraft();
  nativeCall('openProject',id);
}
async function renameCurrentProject(){
  if(!native||!state.nativeInfo?.hasProject)return;
  if(state.nativeInfo?.projectId==='@legacy'){toast('Rename legacy projects using the file manager.');return;}
  if(state.project.dirty){toast('Save your changes before renaming.');return;}
  const name=await createModal({title:'Rename project',initial:state.nativeInfo.projectName||'Project',
    message:'The project folder will be renamed without altering its contents.'});
  if(name&&name.trim()!==state.nativeInfo.projectName)nativeCall('renameProject',name.trim());
}
async function createNewProject(){
  if(native&&!state.nativeInfo?.hasWorkspace){
    toast('First choose a work folder in Preferences.');openTab('settings');return;
  }
  if(!await confirmLeave())return;
  const name=await createModal({title:'New project',initial:'Untitled project',
    message:'Create a named project. Add a source image when you are ready.'});
  if(!name)return;
  if(native){
    state.importAfterCreation=false;
    nativeCall('createProject',name);
  }else{
    state.browserProjectName=name;
    $('browser-image').click();
  }
}
async function newFromImage(){
  if(native&&!state.nativeInfo?.hasWorkspace){
    toast('First choose a work folder in Preferences.');openTab('settings');return;
  }
  if(!await confirmLeave())return;
  if(native)nativeCall('newFromImage');
  else $('browser-image').click();
}
function showProjectLibrary(){
  if(!native){toast('Project list is available in the Android app.');return;}
  refreshProjectLibrary();
  const pane=$('tab-files'),heading=$('project-library-heading');pane.scrollTo({top:heading.offsetTop-pane.offsetTop-12,behavior:'smooth'});
}
async function chooseFolder(){
  if(!await confirmLeave())return;
  if(native)nativeCall('chooseFolder');
  else toast('Work folder is selected by Android. Browser mode uses downloads.');
}
function importImage(){
  if(native){
    if(!state.nativeInfo?.hasProject){newFromImage();return;}
    if(state.nativeInfo.hasBase){toast('Use “New from image” to start another project.');return;}
    nativeCall('selectImage');
  }else $('browser-image').click();
}
async function exportProjectZip(){
  if(!native){toast('ZIP export is available in the Android APK.');return;}
  if(!state.nativeInfo?.hasBase){toast('Import an image first.');return;}
  if(state.busy)return;
  if(state.project.dirty){
    const yes=await createModal({title:'Save before packaging?',question:true,
      message:'Save your latest crops and manifest before creating the ZIP?'});
    if(!yes)return;
    state.zipAfterSave=true;
    saveProject();
  }else nativeCall('exportProjectZip');
}
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
    if(type==='system-theme'){state.nativeInfo=state.nativeInfo||{};state.nativeInfo.systemDark=!!data.dark;if(settings.theme==='system'){applyAppearance();scheduleDraw();}return;}
    if(type==='workspace'){
      if(data.message)toast(data.message);refreshStatus();
      if(data.selected){clearDraft();loadNativeProject();refreshProjectLibrary();}
      return;
    }
    if(type==='projects'){if(data.error)toast(data.error);else renderProjectLibrary(data.items||[]);return;}
    if(type==='project'){
      if(!data.ok){state.importAfterCreation=false;toast(data.message||'Cannot open project');return;}
      refreshStatus();loadNativeProject();refreshProjectLibrary();
      if(data.renamed){toast('Project renamed to '+data.name);refreshStatus();refreshProjectLibrary();}
      else{closeTab();toast((data.created?'Created ':'Opened ')+data.name);}
      return;
    }
    if(type==='image'){
      refreshStatus();
      if(data.ok){clearDraft();loadNativeProject();refreshProjectLibrary();closeTab();}
      else toast(data.message||'Image import cancelled');
      return;
    }
    if(type==='zip'){toast(data.message||'ZIP export finished');return;}
    if(type==='save'){
      state.busy=false;const exportAfter=!!state.zipAfterSave;state.zipAfterSave=false;
      if(data.state==='success'){
        state.project.saved=state.pendingSave??state.project.saved;
        if(!state.project.dirty)clearDraft();else scheduleDraft();
        toast(`Saved ${data.count} crops`);inspectFiles();
        if(exportAfter&&!state.project.dirty)nativeCall('exportProjectZip');
      }else errorMessage(data.message||'Save failed');
      state.pendingSave=null;refreshUI();return;
    }
    if(type==='update'){refreshUpdate(data);return;}
    if(data.message)toast(data.message);
  }catch(e){errorMessage(e);}
};

window.GuiCutterHandleBack=()=>{
  const dlg=document.querySelector('dialog[open]');if(dlg){dlg.close('cancel');return true;}
  if(isAnyDrawerOpen()){closeTab();return true;}
  if(!$('nudge-panel').hidden){$('nudge-panel').hidden=true;return true;}
  if(document.body.classList.contains('clean')){cleanCanvas(false);return true;}
  return false;
};

function bind(){
  for(const b of document.querySelectorAll('#controls .float button[title]'))b.dataset.tip=b.title;
  createNumericControls();saveSettings();bindNavigationGestures();syncShelfHandles();sizeCanvas();window.addEventListener('resize',sizeCanvas);
  const themeMedia=window.matchMedia('(prefers-color-scheme:dark)');
  const followSystemTheme=()=>{if(settings.theme==='system'){applyAppearance();scheduleDraw();}};
  if(themeMedia.addEventListener)themeMedia.addEventListener('change',followSystemTheme);else themeMedia.addListener(followSystemTheme);
  const c=$('editor');c.addEventListener('pointerdown',handlePointerDown);c.addEventListener('pointermove',handlePointerMove);c.addEventListener('pointerup',handlePointerEnd);c.addEventListener('pointercancel',handlePointerEnd);
  c.addEventListener('contextmenu',e=>e.preventDefault());
  c.addEventListener('wheel',e=>{if(!state.image)return;e.preventDefault();state.view.zoomTo(state.view.scale*(e.deltaY<0?1.25:.8),e.clientX,e.clientY);setZoomLabel();scheduleDraw();},{passive:false});
  for(const el of document.querySelectorAll('[data-mode]'))el.addEventListener('click',()=>{if(el.dataset.mode==='new'){settings.newKind='normal';saveSettings();}chooseMode(el.dataset.mode);toast(el.dataset.mode==='navigate'?'Pan · drag to move the image':el.dataset.mode==='edit'?'Edit · select or adjust a crop':state.project.active?'New · tap to copy selected size, drag for custom':'New · drag to set crop size',2100);});
  for(const el of document.querySelectorAll('[data-tab]'))el.addEventListener('click',()=>openTab(el.dataset.tab));
  for(const el of document.querySelectorAll('[data-setting]'))el.addEventListener('change',()=>{settings[el.dataset.setting]=el.checked;saveSettings();if(el.dataset.setting==='showEdges'&&settings.showEdges)buildOverlay();});
  $('setting-kind').addEventListener('change',e=>{settings.newKind=e.target.value;saveSettings();});
  $('explode-preview').addEventListener('change',e=>{settings.explodeNine=e.target.checked;saveSettings();renderPreview();});
  $('new-kind').addEventListener('click',()=>{settings.newKind='nine_slice';saveSettings();chooseMode('new');toast(state.project.active?'Nine-slice · tap to copy selected or drag to draw':'Nine-slice · drag to draw',2100);});
  $('setting-theme').addEventListener('change',e=>{settings.theme=e.target.value;saveSettings();if(native)nativeCall('setUiTheme',settings.theme);});
  for(const btn of document.querySelectorAll('[data-gizmo-tint]'))btn.addEventListener('click',()=>{
    settings.gizmoTint=btn.dataset.gizmoTint;saveSettings();
  });
  for(const [id,key] of [['glass-opacity','glassTransparency'],['glass-blur','glassBlur']]){
    $(id).addEventListener('input',e=>{settings[key]=e.target.valueAsNumber;applyAppearance();});
    $(id).addEventListener('change',()=>saveSettings());
  }
  $('toggle-asset-view').addEventListener('click',()=>{
    settings.assetView=settings.assetView==='grid'?'list':'grid';
    saveSettings();renderList();
  });
  $('project-btn').addEventListener('click',()=>openTab('files'));
  $('project-title').addEventListener('click',()=>openTab('files'));
  $('assets-btn').addEventListener('click',()=>openTab('assets'));$('properties-btn').addEventListener('click',()=>openTab('properties'));
  $('selection-info').addEventListener('click',()=>openTab('properties'));

  $('quick-nudge').addEventListener('click',()=>{$('nudge-panel').hidden=!$('nudge-panel').hidden;toast('Pixel precision',1300);});
  $('close-nudge').addEventListener('click',()=>{$('nudge-panel').hidden=true;});
  $('nudge-unit').addEventListener('click',()=>{state.nudge=state.nudge===1?10:1;$('nudge-unit').textContent=`${state.nudge} px`;});
  for(const el of document.querySelectorAll('[data-nudge]'))el.addEventListener('click',()=>{const [dx,dy]=el.dataset.nudge.split(',').map(Number);applyNudge(dx,dy);});
  $('close-drawer').addEventListener('click',closeTab);$('close-app-drawer').addEventListener('click',closeTab);$('shade').addEventListener('click',closeTab);
  $('zoom-range').addEventListener('input',e=>zoomFromSlider(e.target.value));
  $('zoom-label').addEventListener('click',()=>{fitImage();toast('Image fitted to screen',1700);});$('fit').addEventListener('click',()=>{fitImage();toast('Image fitted to screen',1700);});
  $('snap').addEventListener('click',()=>{settings.edgeSnap=!settings.edgeSnap;saveSettings();toast('Image edge snapping '+(settings.edgeSnap?'enabled':'disabled'));});
  $('crop-snap').addEventListener('click',()=>{settings.cropSnap=!settings.cropSnap;state.alignGuides=[];saveSettings();toast('Crop alignment '+(settings.cropSnap?'enabled':'disabled'));});
  $('undo').addEventListener('click',()=>{if(state.project.undo()){refreshUI();scheduleDraft();toast('Undone',1300);}});
  $('redo').addEventListener('click',()=>{if(state.project.redo()){refreshUI();scheduleDraft();toast('Redone',1300);}});
  $('save').addEventListener('click',saveProject);
  $('new-from-list').addEventListener('click',()=>{closeTab();chooseMode('new');toast('Drag on the image to define a crop.');});
  $('rename').addEventListener('click',renameSelected);$('delete').addEventListener('click',deleteSelected);
  $('apply-props').addEventListener('click',applyProps);
  $('choose-folder').addEventListener('click',chooseFolder);
  $('create-project').addEventListener('click',createNewProject);
  $('rename-project').addEventListener('click',renameCurrentProject);
  $('new-from-image').addEventListener('click',newFromImage);
  $('open-project-list').addEventListener('click',showProjectLibrary);
  $('refresh-project-list').addEventListener('click',refreshProjectLibrary);
  $('bundle-project').addEventListener('click',exportProjectZip);
  $('empty-open').addEventListener('click',createNewProject);
  $('open-image').addEventListener('click',importImage);$('empty-image').addEventListener('click',newFromImage);
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
  refreshStatus();if(native){nativeCall('setUiTheme',settings.theme);loadNativeProject();refreshProjectLibrary();}else{toast('Browser test: open an image to begin');}
  refreshUI();
}
bind();