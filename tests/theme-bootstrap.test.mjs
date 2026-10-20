import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../app/src/main/assets/boot-theme.js', import.meta.url),'utf8');
function boot(preference,systemDark,native=false){
  const meta={content:'#253e4e'}, root={dataset:{},style:{}};
  const document={documentElement:root,querySelector:()=>meta};
  const localStorage={getItem:()=>preference===null?null:JSON.stringify({theme:preference})};
  const window=native?{NativeAndroid:{initialSystemDark:()=>systemDark}}:{};
  runInNewContext(source,{document,localStorage,window,matchMedia:()=>({matches:native?!systemDark:systemDark})});
  return {theme:root.dataset.theme,mode:root.style.colorScheme,meta:meta.content};
}
test('saved explicit dark mode paints dark before other scripts',()=>{
  assert.deepEqual(boot('dark',false),{theme:'dark',mode:'dark',meta:'#121C2A'});
});
test('saved explicit light mode wins over night system',()=>{
  assert.deepEqual(boot('light',true),{theme:'light',mode:'light',meta:'#EEF3F7'});
});
test('system mode accepts native Android dark state even with misleading WebView media query',()=>{
  assert.equal(boot('system',true,true).theme,'dark');
  assert.equal(boot('system',false,true).theme,'light');
});
