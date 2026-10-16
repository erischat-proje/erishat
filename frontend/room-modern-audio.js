(() => {
  'use strict';
  let surface=null,observer=null;
  function refresh(){
    const s=document.getElementById('erisRoomSurface');
    if(!s){document.body.classList.remove('eris-room-visible');return}
    if(surface!==s){surface=s;s.classList.add('room-modern-audio');if(window.ErisChatAndroid&&!(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--eris-safe-top'))>0))s.style.setProperty('--modern-top','max(env(safe-area-inset-top,0px),28px)');observer?.disconnect();observer=new MutationObserver(refresh);observer.observe(s,{attributes:true,attributeFilter:['class','style'],childList:true,subtree:true});}
    const visible=s.classList.contains('show')&&getComputedStyle(s).display!=='none';
    document.body.classList.toggle('eris-room-visible',visible);
    const seats=s.querySelector('#erisLiveSeats');
    if(seats){const rows=Math.ceil(seats.querySelectorAll('.eris-seat').length/4)||6;const value=String(rows);if(seats.style.getPropertyValue('--modern-rows')!==value)seats.style.setProperty('--modern-rows',value)}
    let resume=s.querySelector('#erisRoomAudioResume');
    if(!resume){resume=document.createElement('button');resume.id='erisRoomAudioResume';resume.type='button';resume.textContent='🔊 Oda sesini başlat';resume.hidden=true;resume.onclick=()=>window.ErisRoomRTC?.unlockAudio?.();s.append(resume)}
    const state=window.ErisRoomRTC?.state?.();
    resume.hidden=!visible||!state?.output||!state?.blocked;
  }
  ['erischat:room-opened','erischat:room-state-updated','erischat:room-closed','erischat:room-audio-state'].forEach(name=>window.addEventListener(name,refresh));
  new MutationObserver(()=>{if(document.getElementById('erisRoomSurface')!==surface)refresh()}).observe(document.body,{childList:true});
  refresh();
})();
