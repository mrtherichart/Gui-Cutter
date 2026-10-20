import {normalizeTransparency} from './transparency.mjs';
export const MAX_HISTORY = 128;
export const KINDS = ['normal', 'nine_slice'];
const integer = (v) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
export const filenameFor = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_') + '.png';
export const copy = (data) => JSON.parse(JSON.stringify(data));

export function normalizeAsset(value, iw, ih) {
  const a = {
    asset_id: String(value.asset_id ?? '').trim(),
    kind: KINDS.includes(value.kind) ? value.kind : 'normal',
    x: integer(value.x), y: integer(value.y), w: integer(value.w), h: integer(value.h),
    left: integer(value.left), top: integer(value.top), right: integer(value.right), bottom: integer(value.bottom),
  };
  if (!a.asset_id) throw new Error('An asset needs a name.');
  if (a.asset_id.length > 120) throw new Error('Asset names are limited to 120 characters.');
  if (iw && ih) {
    a.x = Math.max(0, Math.min(iw - 1, a.x));
    a.y = Math.max(0, Math.min(ih - 1, a.y));
    a.w = Math.max(1, Math.min(iw - a.x, a.w));
    a.h = Math.max(1, Math.min(ih - a.y, a.h));
  } else {
    a.x = Math.max(0, a.x); a.y = Math.max(0, a.y);
    a.w = Math.max(1, a.w); a.h = Math.max(1, a.h);
  }
  if (value.transparency) a.transparency=normalizeTransparency(value.transparency);
  if (a.kind === 'normal') a.left = a.top = a.right = a.bottom = 0;
  a.left = Math.max(0, Math.min(a.w - 1, a.left));
  a.right = Math.max(0, Math.min(a.w - a.left - 1, a.right));
  a.top = Math.max(0, Math.min(a.h - 1, a.top));
  a.bottom = Math.max(0, Math.min(a.h - a.top - 1, a.bottom));
  return a;
}
export function verifyAssets(assets, iw, ih) {
  const ids = new Set(), names = new Set();
  const result = assets.map(a => normalizeAsset(a, iw, ih));
  for (const a of result) {
    if (ids.has(a.asset_id)) throw new Error(`Duplicate asset name: ${a.asset_id}`);
    ids.add(a.asset_id);
    const name = filenameFor(a.asset_id).toLowerCase();
    if (names.has(name)) throw new Error(`Export filenames collide: ${a.asset_id}. Rename an asset.`);
    names.add(name);
  }
  return result;
}
export function makeAsset(id, kind, x, y, w, h, iw, ih) {
  return normalizeAsset({asset_id:id, kind, x, y, w, h,
    left:kind === 'nine_slice' ? Math.max(1,Math.floor(w/4)) : 0,
    right:kind === 'nine_slice' ? Math.max(1,Math.floor(w/4)) : 0,
    top:kind === 'nine_slice' ? Math.max(1,Math.floor(h/4)) : 0,
    bottom:kind === 'nine_slice' ? Math.max(1,Math.floor(h/4)) : 0}, iw, ih);
}
export class Project {
  constructor() { this.assets=[]; this.selected=-1; this.imageWidth=0; this.imageHeight=0;
    this.transparency=null;this.history=[]; this.cursor=-1; this.saved=''; this.revision=0; this.reset([]); }
  encode() { return JSON.stringify({assets:this.assets,transparency:this.transparency}); }
  manifest() { const result={image_path:'base.png',assets:copy(this.assets)};
    if(this.transparency)result.transparency=copy(this.transparency);
    return result; }
  get dirty() { return this.history[this.cursor] !== this.saved; }
  get active() { return this.assets[this.selected] ?? null; }
  restoreState(value){const data=JSON.parse(value);this.assets=data.assets;this.transparency=data.transparency??null;}
  reset(assets, saved=true, transparency=null) {
    this.assets=verifyAssets(assets,this.imageWidth,this.imageHeight);
    this.transparency=transparency?normalizeTransparency(transparency):null;
    this.selected=-1; this.history=[this.encode()]; this.cursor=0;
    this.saved=saved ? this.encode() : JSON.stringify({assets:[],transparency:null});
    this.revision++;
  }
  load(data) { if (!data || !Array.isArray(data.assets)) throw new Error('Invalid ui_slices.json'); this.reset(data.assets,true,data.transparency); }
  commit() {
    const value=this.encode();
    if (this.history[this.cursor] === value) return false;
    this.history.splice(this.cursor + 1);
    this.history.push(value);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.cursor=this.history.length-1;
    this.revision++;
    return true;
  }
  undo() { if(this.cursor < 1)return false; this.restoreState(this.history[--this.cursor]); this.selected=Math.min(this.selected,this.assets.length-1); this.revision++; return true; }
  redo() { if(this.cursor >= this.history.length-1)return false; this.restoreState(this.history[++this.cursor]); this.selected=Math.min(this.selected,this.assets.length-1); this.revision++; return true; }
  markSaved() { this.saved=this.encode(); }
  insert(a) { const next=verifyAssets([...this.assets,a],this.imageWidth,this.imageHeight);this.assets=next;this.selected=next.length-1;this.commit(); }
  update(index,changes) { const next=copy(this.assets);next[index]=normalizeAsset({...next[index],...changes},this.imageWidth,this.imageHeight);this.assets=verifyAssets(next,this.imageWidth,this.imageHeight);this.commit(); }
  setTransparency(value) {const t=normalizeTransparency(value);
    if(this.active)this.assets[this.selected].transparency=t;
    else this.transparency=t;
    this.commit();
  }
  effectiveTransparency(asset=this.active) { return asset?.transparency??this.transparency??normalizeTransparency(null); }
  deleteSelected() { if(!this.active)return;this.assets.splice(this.selected,1);this.selected=-1;this.commit(); }
  snapshot() { return this.encode(); }
  restoreSnapshot(s) { this.restoreState(s); this.revision++; }
}
