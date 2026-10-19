(() => {
  'use strict';
  let surface=null,watch=null,frame=0;
  const write=(el,key,value)=>{if(el.style.getPropertyValue(key)!==value||el.style.getPropertyPriority(key)!=='important')el.style.setProperty(key,value,'important')};
  function update(){
    frame=0;
    const s=document.getElementById('erisRoomSurface');
    if(!s){document.body.classList.remove('eris-room-screen-active');return}
    if(surface!==s){surface=s;s.classList.add('room-screen-fit');watch?.disconnect();watch=new MutationObserver(schedule);watch.observe(s,{attributes:true,attributeFilter:['class','style'],childList:true,subtree:true});}
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
    const seats=s.querySelector('#erisLiveSeats'),rows=Math.ceil((Number(seats?.dataset.seatCount)||12)/4);
    // Compact, fixed row spacing gives the saved height back to live chat.
    // On small/keyboard viewports the seat stage scrolls without covering chat.
    const landscape=height<500&&width>=600;
    const chatMin=(landscape?104:Math.min(224,Math.max(166,height*.34)))+bottomInset;
    const available=height-header-tools-chatMin-14;
    const seat=Math.floor(Math.max(44,Math.min(72,(width-64)/4,(available-30-(rows-1)*8)/rows-22)));
    const idealStage=rows*(seat+22)+(rows-1)*8+30;
    const stage=Math.max(40,Math.min(idealStage,available));
    const chat=Math.max(100,height-header-tools-stage-14);
    write(s,'--fit-top',topInset+'px');write(s,'--fit-bottom',bottomInset+'px');write(s,'--fit-header',header+'px');write(s,'--fit-chat',Math.round(chat)+'px');write(s,'--eris-room-header',header+'px');
    write(s,'--fit-seat',seat+'px');write(s,'--room-seat-size',seat+'px');write(s,'--fit-rows',String(rows));

  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update)}
  ['resize','orientationchange','pageshow','focusin','focusout','erischat:viewport-changed','erischat:room-opened','erischat:room-closed','erischat:room-state-updated'].forEach(e=>window.addEventListener(e,schedule));
  window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  new MutationObserver(()=>{if(document.getElementById('erisRoomSurface')!==surface)schedule()}).observe(document.body,{childList:true});
  schedule();
})();

