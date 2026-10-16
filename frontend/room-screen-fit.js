(() => {
  'use strict';
  let surface=null,watch=null,frame=0;
  const write=(el,key,value)=>{if(el.style.getPropertyValue(key)!==value||el.style.getPropertyPriority(key)!=='important')el.style.setProperty(key,value,'important')};
  function update(){
    frame=0;
    const s=document.getElementById('erisRoomSurface');
    if(!s){document.body.classList.remove('eris-room-screen-active');return}
    if(surface!==s){surface=s;s.classList.add('room-screen-fit');watch?.disconnect();watch=new MutationObserver(schedule);watch.observe(s,{attributes:true,attributeFilter:['class','style'],childList:true});}
    const visible=s.classList.contains('show')&&getComputedStyle(s).display!=='none';
    if(document.body.classList.contains('eris-room-screen-active')!==visible)document.body.classList.toggle('eris-room-screen-active',visible);
    if(!visible)return;
    const m=window.ErisDeviceLayout?.metrics?.(),v=window.visualViewport,zoom=(v?.scale||1)>1.05;
    const height=Math.round(m?.height||(zoom?innerHeight:v?.height)||innerHeight);
    const width=Math.round(m?.width||(zoom?document.documentElement.clientWidth:v?.width)||innerWidth);
    const native=!!window.ErisChatAndroid||/\bwv\b/.test(navigator.userAgent);
    const topInset=Math.max(m?.safe?.top||0,native?28:0);
    const bottomInset=m?.keyboard?0:Math.max(m?.safe?.bottom||0,native?12:0);
    write(s,'top',Math.round(m?.top||v?.offsetTop||0)+'px');
    write(s,'left',Math.round(m?.left||v?.offsetLeft||0)+'px');
    write(s,'right','auto');write(s,'bottom','auto');write(s,'width',width+'px');write(s,'height',height+'px');write(s,'max-height',height+'px');write(s,'min-height','0px');write(s,'transform','none');
    const header=64+topInset,tools=48;
    const chat=Math.round(Math.min(m?.keyboard?170:260,Math.max(m?.keyboard?150:190,height*.30)))+bottomInset;
    write(s,'--fit-top',topInset+'px');write(s,'--fit-bottom',bottomInset+'px');write(s,'--fit-header',header+'px');write(s,'--fit-chat',chat+'px');write(s,'--eris-room-header',header+'px');
    const seats=s.querySelector('#erisLiveSeats'),rows=Math.ceil((seats?.querySelectorAll('.eris-seat').length||24)/4);
    const area=height-header-tools-chat-14;
    write(s,'--fit-seat',Math.floor(Math.max(36,Math.min(64,(width-72)/4,(area-(rows-1)*14-32)/rows-16)))+'px');write(s,'--fit-rows',String(rows));
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update)}
  ['resize','orientationchange','pageshow','focusin','focusout','erischat:viewport-changed','erischat:room-opened','erischat:room-closed','erischat:room-state-updated'].forEach(e=>window.addEventListener(e,schedule));
  window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  new MutationObserver(()=>{if(document.getElementById('erisRoomSurface')!==surface)schedule()}).observe(document.body,{childList:true});
  schedule();
})();
