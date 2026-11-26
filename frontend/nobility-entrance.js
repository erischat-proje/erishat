(()=>{
'use strict';

let active=null;

function close(){
 if(!active)return;

 const state=active;
 active=null;

 clearTimeout(state.timer);
 document.removeEventListener('keydown',state.key,true);

 state.video.pause();
 state.video.removeAttribute('src');
 state.video.load();
 state.overlay.remove();
 if(typeof state.onDone==='function'){
  state.onDone();
 }
}

function play(rank,nickname,onDone){
 const assets=window.LidyaNobilityAssets;
 const src=assets?.resolve(rank,'entrance_video');

 if(!src)return false;

 close();

 const overlay=document.createElement('section');
 overlay.className='ln-entrance-overlay';
 overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');

 const stage=document.createElement('div');
 stage.className='ln-entrance-stage';

 const video=document.createElement('video');
 video.className='ln-entrance-video';
 video.muted=true;
 video.defaultMuted=true;
 video.playsInline=true;
 video.preload='metadata';
 video.poster=assets.resolve(rank,'entrance');
 video.src=src;

 const name=document.createElement('div');
 name.className='ln-entrance-name';
 name.textContent=String(
  nickname||'LidyaChat'
 ).slice(0,32);

 const exit=document.createElement('button');
 exit.type='button';
 exit.className='ln-entrance-close';
 exit.textContent='×';
 exit.setAttribute('aria-label','Videoyu kapat');
 exit.onclick=close;

 stage.append(video,name);
 overlay.append(stage,exit);

 const state={
  overlay,video,timer:null,onDone,
  key:e=>{
   if(e.key==='Escape'){
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
   }
  }
 };

 active=state;

 function finish(){
  if(active===state)close();
 }

 let fallbackUsed=false;

 function fallback(){
  if(active!==state||fallbackUsed)return;
  fallbackUsed=true;
  video.onerror=null;
  video.onended=null;
  video.pause();
  video.removeAttribute('src');
  video.load();
  clearTimeout(state.timer);
  state.timer=setTimeout(finish,3000);
 }

 video.onended=finish;
 video.onerror=fallback;

 document.body.append(overlay);
 document.addEventListener('keydown',state.key,true);

 state.timer=setTimeout(finish,15000);

 video.play().catch(fallback);

 return true;
}

function show(rank,nickname){
 return new Promise(resolve=>{
  try{
   if(!play(rank,nickname,resolve))resolve();
  }catch(error){
   close();
   resolve();
  }
 });
}

window.LidyaNobilityEntrance=Object.freeze({
 play,close,show
});
})();
