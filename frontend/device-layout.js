/* One viewport authority for browser, WebView, keyboard and safe-area geometry. */
(() => {
  'use strict';
  const root=document.documentElement;
  let frame=0,baseline=0,lastOrientation='',lastSignature='',observer;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  let probe;
  function safeArea(){
    if(!document.body)return {top:0,right:0,bottom:0,left:0};
    if(!probe){probe=document.createElement('div');probe.setAttribute('aria-hidden','true');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.append(probe)}
    const c=getComputedStyle(probe);return {top:parseFloat(c.paddingTop)||0,right:parseFloat(c.paddingRight)||0,bottom:parseFloat(c.paddingBottom)||0,left:parseFloat(c.paddingLeft)||0};
  }
  function measure(){
    const v=window.visualViewport,zoomed=(v?.scale||1)>1.05;
    const width=Math.max(1,zoomed?root.clientWidth:(v?.width||root.clientWidth||innerWidth));
    const height=Math.max(1,zoomed?innerHeight:(v?.height||innerHeight));
    const focused=document.activeElement?.matches?.('input,textarea,[contenteditable="true"]');
    const orientation=screen.orientation?.type?.split('-')[0] || (typeof window.orientation==='number'?(Math.abs(window.orientation)===90?'landscape':'portrait'):(focused&&baseline-height>120?lastOrientation:(innerWidth>innerHeight?'landscape':'portrait')));
    if(orientation!==lastOrientation){baseline=height;lastOrientation=orientation;}
    baseline=Math.max(baseline,height,innerHeight);
    const keyboard=!!focused&&!zoomed&&baseline-height>120;
    const safe=safeArea();if(keyboard)safe.bottom=0;const usable=Math.max(1,height-safe.top-safe.bottom);
    const compact=usable<720,short=usable<460;
    const header=compact?56:68,tools=44;
    const chat=clamp(usable*.33,keyboard?100:160,290);
    const ludoChat=clamp(usable*.20,keyboard?100:128,200);
    return {width,height,top:v?.offsetTop||0,left:v?.offsetLeft||0,safe,usable,keyboard,compact,short,orientation,header,tools,chat,ludoChat};
  }
  function update(){
    frame=0;const m=measure();
    root.classList.add('eris-adaptive');
    root.classList.toggle('eris-keyboard',m.keyboard);
    root.classList.toggle('eris-short',m.short);
    root.classList.toggle('eris-compact',m.compact);
    root.classList.toggle('eris-landscape',m.orientation==='landscape');
    root.classList.toggle('visual-compact',m.short);
    const vars={
      '--app-width':m.width,'--app-height':m.height,'--app-top':m.top,
      '--eris-viewport-left':m.left,'--eris-safe-top':m.safe.top,'--eris-safe-bottom':m.safe.bottom,
      '--eris-safe-left':m.safe.left,'--eris-safe-right':m.safe.right,'--eris-usable-height':m.usable,
      '--eris-room-header':m.header,'--eris-room-tools-height':m.tools,
      '--eris-adaptive-chat':m.chat,'--eris-adaptive-ludo-chat':m.ludoChat,
      '--room-chat-height':m.chat,'--room-stage-height':Math.max(0,m.usable-m.header-m.tools-m.chat-8)
    };
    for(const [key,value] of Object.entries(vars))root.style.setProperty(key,Math.round(value)+'px');
    // Seat sizing uses the actual room width, including tablet/windowed layouts.
    const room=document.getElementById('erisRoomSurface');
    if(room){
      const width=room.clientWidth||m.width,rows=Number(room.querySelector('#erisLiveSeats')?.dataset.seatCount||24)/4;
      const area=m.usable-m.header-m.tools-m.chat-8;
      const size=clamp(Math.min(52,(width-80)/4,(area-36-(rows-1)*18)/rows),36,52);
      room.style.setProperty('--eris-adaptive-seat',Math.floor(size)+'px');
    }
    const sig=JSON.stringify([Math.round(m.width),Math.round(m.height),m.keyboard,m.orientation,m.safe]);
    if(sig!==lastSignature){lastSignature=sig;window.dispatchEvent(new CustomEvent('erischat:viewport-changed',{detail:m}));}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  window.ErisDeviceLayout={refresh:schedule,metrics:measure};
  ['resize','orientationchange','pageshow','focusin','focusout','erischat:room-opened','erischat:room-state-updated'].forEach(e=>window.addEventListener(e,schedule,{passive:true}));
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  function init(){
    // Watch insertion and seat capacity only. Never watch every style mutation.
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-seat-count']});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  schedule();
})();
