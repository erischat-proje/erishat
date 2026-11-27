(()=>{
'use strict';

let active=null;

function close(){
 if(!active)return;

 const state=active;
 active=null;

 clearTimeout(state.timer);
 document.removeEventListener('keydown',state.key,true);

 state.video.onerror=null;
 state.video.onended=null;
 state.video.ontimeupdate=null;
 state.video.pause();
 state.video.removeAttribute('src');
 state.video.load();
 state.overlay.remove();
 if(typeof state.onDone==='function'){
  state.onDone();
 }
}

function play(rank,nickname,onDone,options={}){
 const knight=rank===1;
 const count=rank===2;
 const timed=knight||count;
 const live=timed&&options.live===true;

 if(timed&&document.hidden)return false;
 const assets=window.LidyaNobilityAssets;
 const src=assets?.resolve(rank,'entrance_video');

 if(!src)return false;

 close();

 const overlay=document.createElement('section');
 overlay.className='ln-entrance-overlay';

 if(knight){
  overlay.className+=' lidya-knight-timed-entrance';
 }
 if(count){
  overlay.className+=' lidya-count-timed-entrance';
 }
 if(live){
  overlay.className+=knight
   ? ' lidya-knight-live-entrance'
   : ' lidya-count-live-entrance';
  overlay.setAttribute('role','region');
  overlay.setAttribute('aria-label',knight?'Şövalye oda girişi':'Kont oda girişi');
 }else{
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
 }

 const stage=document.createElement('div');
 stage.className='ln-entrance-stage';

 const video=document.createElement('video');
 video.className='ln-entrance-video';
 video.muted=!timed;
 video.defaultMuted=!timed;

 if(timed)video.volume=1;
 video.playsInline=true;
 video.preload='metadata';
 video.poster=assets.resolve(rank,'entrance');
 video.src=src;

 const name=document.createElement('div');
 name.className='ln-entrance-name';
 name.textContent=String(
  nickname||'LidyaChat'
 ).slice(0,32);

 if(timed){
  name.hidden=true;

  function fitName(){
   if(!name.style||!name.clientWidth)return;

   name.style.fontSize='';

   let size=parseFloat(
    window.getComputedStyle(name).fontSize
   )||24;

   while(name.scrollWidth>name.clientWidth&&size>8){
    size--;
    name.style.fontSize=size+'px';
   }
  }

  video.ontimeupdate=()=>{
   const visible=knight
    ? video.currentTime>=8
    : video.currentTime>=7 &&
      video.currentTime<9.8;

   if(name.hidden===visible){
    name.hidden=!visible;
    if(visible)fitName();
   }
  };
 }

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
  knight,timed,live,userId:String(options.userId||''),
  key:e=>{
   if(live)return;

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

  if(timed){
   video.hidden=true;
   video.ontimeupdate=null;
   name.hidden=false;

   const poster=document.createElement('img');
   poster.className='lidya-knight-entrance-poster';
   poster.src=assets.resolve(rank,'entrance')||'';
   poster.alt='';
   poster.draggable=false;
   poster.onerror=()=>poster.remove();

   stage.append(poster);
  }

  clearTimeout(state.timer);
  state.timer=setTimeout(finish,3000);
 }

 video.onended=finish;
 video.onerror=fallback;

 document.body.append(overlay);
 document.addEventListener('keydown',state.key,true);

 state.timer=setTimeout(
  finish,timed?12000:15000
 );

 if(timed&&window.matchMedia?.(
  '(prefers-reduced-motion: reduce)'
 )?.matches){
  fallback();
 }else{
  try{
   Promise.resolve(video.play()).catch(fallback);
  }catch{
   fallback();
  }
 }

 return true;
}

function show(rank,nickname,options={}){
 return new Promise(resolve=>{
  try{
   if(!play(rank,nickname,resolve,options))resolve();
  }catch(error){
   close();
   resolve();
  }
 });
}

window.addEventListener('erischat:room-closed',()=>{
 if(active?.live)close();
});

window.addEventListener('erischat:auth',()=>{
 if(active?.timed)close();
});

window.addEventListener('erischat:user-block-changed',event=>{
 if(
  active?.live &&
  event.detail?.blocked &&
  active.userId &&
  String(event.detail.userId)===active.userId
 )close();
});

document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&active?.timed)close();
});

window.LidyaNobilityEntrance=Object.freeze({
 play,close,show
});
})();
