(() => {
'use strict';
// V8 single coordinator: foreground screen-awake policy for all LidyaChat pages.
// Never fake taps, override a physical power button, or repeatedly reopen rooms.
const key='lidyachat.screenAwake.v1';
let enabled=true;
try{enabled=localStorage.getItem(key)!=='off'}catch{}
let sentinel=null, pending=null, epoch=0, retryTimer=null, lastAttempt=0, lastError='', nativeActive=false;
const visible=()=>document.visibilityState==='visible';
const nativeAvailable=()=>typeof window.ErisChatAndroid?.setKeepScreenAwake==='function';
const wanted=()=>enabled&&visible();
function state(){return {enabled,visible:visible(),supported:nativeAvailable()||!!navigator.wakeLock,active:wanted()&&(nativeActive||!!sentinel&&!sentinel.released),webLock:!!sentinel&&!sentinel.released,nativeLock:nativeActive,lastError};}
function emit(){window.dispatchEvent(new CustomEvent('lidyachat:screen-awake',{detail:state()}));}
function syncNative(){
  nativeActive=false;
  if(nativeAvailable())try{window.ErisChatAndroid.setKeepScreenAwake(enabled);nativeActive=wanted();}catch(e){lastError='native:'+String(e?.name||'unavailable');}
}
function cancelRetry(){if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}}
function scheduleRetry(delay=15000){if(retryTimer!==null||!wanted()||sentinel&&!sentinel.released)return;retryTimer=setTimeout(()=>{retryTimer=null;sync();},delay);}
async function releaseWeb(){epoch++;const old=sentinel;sentinel=null;if(old&&!old.released)try{await old.release()}catch{}emit();}
async function sync(force=false){
 syncNative();
 if(!wanted()){cancelRetry();await releaseWeb();return;}
 if(sentinel&&!sentinel.released||pending){emit();return;}
 if(!navigator.wakeLock?.request){lastError='unsupported';emit();return;}
 if(!force&&Date.now()-lastAttempt<5000){scheduleRetry(5000);return;}
 cancelRetry();lastAttempt=Date.now();const ticket=epoch;
 pending=(async()=>{
  try{
   const lock=await navigator.wakeLock.request('screen');
   if(ticket!==epoch||!wanted()){await lock.release();return;}
   sentinel=lock;lastError='';
   lock.addEventListener('release',()=>{
     if(sentinel===lock){sentinel=null;emit();scheduleRetry(1000);}
   },{once:true});
  }catch(e){lastError=e?.name||'not-granted';scheduleRetry(15000);}
  finally{pending=null;emit();if(ticket!==epoch&&wanted())scheduleRetry(1000);}
 })();
 return pending;
}
window.LidyaScreenAwake={
 state,
 refresh:()=>sync(true),
 setEnabled:async value=>{
  enabled=!!value;epoch++;try{localStorage.setItem(key,enabled?'on':'off')}catch{}
  syncNative();if(enabled)await sync(true);else{cancelRetry();await releaseWeb();}emit();
 }
};
document.addEventListener('visibilitychange',()=>{epoch++;sync(true)});
window.addEventListener('pageshow',()=>sync(true));
window.addEventListener('focus',()=>sync(true));
window.addEventListener('pagehide',()=>{epoch++;cancelRetry();releaseWeb()});
window.addEventListener('storage',event=>{if(event.key===key){enabled=event.newValue!=='off';epoch++;sync(true)}});
// Recheck only while visible; never manufacture user interaction.
setInterval(()=>{if(wanted()&&(!sentinel||sentinel.released))sync();},20000);
sync(true);
})();
