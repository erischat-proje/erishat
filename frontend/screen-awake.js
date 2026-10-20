(() => {
'use strict';
const key='lidyachat.screenAwake.v1';
let enabled=true;try{enabled=localStorage.getItem(key)!=='off'}catch{}
let sentinel=null,pending=null,generation=0,lastAttempt=0;
const native=()=>typeof window.ErisChatAndroid?.setKeepScreenAwake==='function';
const wanted=()=>enabled&&document.visibilityState==='visible';
function state(){return {enabled,supported:native()||!!navigator.wakeLock,active:wanted()&&(native()||!!sentinel&&!sentinel.released)}}
function emit(){window.dispatchEvent(new CustomEvent('lidyachat:screen-awake',{detail:state()}))}
function nativeSync(){try{if(native())window.ErisChatAndroid.setKeepScreenAwake(enabled)}catch{}}
async function release(){generation++;const old=sentinel;sentinel=null;if(old&&!old.released)try{await old.release()}catch{}emit()}
async function sync(force=false){
 nativeSync();
 if(!wanted()){await release();return}
 if(sentinel&&!sentinel.released||pending||!navigator.wakeLock){emit();return}
 if(!force&&Date.now()-lastAttempt<5000)return;
 lastAttempt=Date.now();const ticket=generation;
 pending=(async()=>{try{
  const lock=await navigator.wakeLock.request('screen');
  if(ticket!==generation||!wanted()){await lock.release();return}
  sentinel=lock;lock.addEventListener('release',()=>{if(sentinel===lock)sentinel=null;emit()},{once:true});
 }catch{}finally{pending=null;emit();if(ticket!==generation&&wanted()&&!sentinel)queueMicrotask(()=>sync(true))}})();
 return pending;
}
window.LidyaScreenAwake={state,setEnabled:async value=>{enabled=!!value;generation++;try{localStorage.setItem(key,enabled?'on':'off')}catch{}if(enabled)await sync(true);else{nativeSync();await release()}emit()}};
document.addEventListener('visibilitychange',()=>{if(wanted())sync(true);else release()});
window.addEventListener('pageshow',()=>sync(true));
window.addEventListener('pagehide',release);
window.addEventListener('focus',()=>sync(true));
window.addEventListener('storage',event=>{if(event.key===key){enabled=event.newValue!=='off';generation++;sync(true)}});
for(const name of ['pointerdown','keydown'])document.addEventListener(name,()=>sync(),{passive:true});
sync(true);
})();
