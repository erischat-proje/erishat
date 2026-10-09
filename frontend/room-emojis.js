(() => {
  'use strict';
  const catalog = [
    ['laugh','Kahkaha','closed','laugh','tears'],['cry','Ağlama','sad','sad','tears'],
    ['kiss','Öpücük','closed','kiss','hearts'],['love','Aşık','hearts','smile','hearts'],
    ['clap','Alkış','happy','smile','hands'],['angry','Sinirli','angry','shout','steam'],
    ['surprised','Şaşkın','wide','oh','stars'],['sleep','Uykulu','closed','small','sleep'],
    ['dance','Dans','happy','laugh','notes'],['cool','Havalı','glasses','smirk','stars'],
    ['yes','Evet','happy','smile','yes'],['no','Hayır','angry','small','no'],
    ['thanks','Teşekkür','happy','smile','hands'],['welcome','Hoş geldin','happy','laugh','wave'],
    ['shy','Utangaç','closed','small','hearts'],['wink','Göz kırp','wink','smirk','stars'],
    ['confused','Kararsız','uneven','small','question'],['party','Parti','happy','laugh','confetti'],
    ['cheer','Bravo','closed','laugh','confetti'],['sad','Üzgün','sad','sad','rain'],
    ['wow','Vay','wide','oh','spark'],['facepalm','Pes','closed','sad','palm'],
    ['wave','Selam','happy','smile','wave'],['heart','Kalp','happy','smile','heart']
  ].map(([id,label,eyes,mouth,extra])=>({id,label,eyes,mouth,extra}));
  const byId=new Map(catalog.map(x=>[x.id,x]));
  const active=new Map();
  let panel=null,button=null,observer=null,observedStage=null,paintQueued=false,lastSent=0;
  const roomId=()=>String(window.ErisCurrentRoomId||window.currentRoomId||'');
  const surface=()=>document.getElementById('erisRoomSurface');
  const heart='<path d="M0 4C-12-6-10-16-3-16C0-16 3-13 3-11C7-19 16-15 16-9C16-3 7 2 3 7Z"/>';
  const star='<path d="m0-8 2 5 6 1-5 4 1 6-4-3-5 3 1-6-4-4 6-1Z"/>';
  function eyes(kind){
    if(kind==='hearts')return '<g fill="#ff5489"><g transform="translate(32 40) scale(.6)">'+heart+'</g><g transform="translate(59 40) scale(.6)">'+heart+'</g></g>';
    if(kind==='glasses')return '<path fill="#17243e" stroke="#9eeeff" stroke-width="2" d="M21 34h23v15H23Zm31 0h23l-2 15H52Z"/><path stroke="#17243e" stroke-width="4" d="M44 38h8M18 35h5M73 35h6"/>';
    if(kind==='closed'||kind==='happy')return '<path class="ee-eyes" fill="none" stroke="#222342" stroke-width="3.5" stroke-linecap="round" d="M25 41q7-9 14 0M57 41q7-9 14 0"/>';
    if(kind==='angry')return '<path stroke="#222342" stroke-width="4" stroke-linecap="round" d="m24 33 15 6m18 0 15-6"/><ellipse fill="#222342" cx="33" cy="44" rx="3" ry="5"/><ellipse fill="#222342" cx="63" cy="44" rx="3" ry="5"/>';
    if(kind==='wink')return '<ellipse fill="#222342" cx="32" cy="40" rx="5" ry="7"/><path stroke="#222342" stroke-width="3.5" stroke-linecap="round" d="m57 39 12 3-12 3"/>';
    const sad=kind==='sad',wide=kind==='wide';
    return '<g class="ee-eyes"><ellipse fill="white" cx="32" cy="40" rx="'+(wide?9:7)+'" ry="'+(wide?11:9)+'"/><ellipse fill="white" cx="64" cy="'+(kind==='uneven'?36:40)+'" rx="7" ry="9"/><ellipse fill="#222342" cx="33" cy="42" rx="4" ry="6"/><ellipse fill="#222342" cx="63" cy="42" rx="4" ry="6"/><circle fill="white" cx="34" cy="40" r="1.5"/><circle fill="white" cx="64" cy="40" r="1.5"/></g>'+(sad?'<path stroke="#554477" stroke-width="2.5" fill="none" stroke-linecap="round" d="m25 28 13 3m20 0 13-3"/>':'');
  }
  function mouth(kind){
    if(kind==='laugh'||kind==='shout')return '<g class="ee-mouth"><path fill="#332247" d="M34 54Q48 61 62 54Q62 76 48 76Q34 76 34 54Z"/><path fill="white" d="M36 55q12 6 24 0l-2 7H38Z"/><ellipse fill="#ff7d9c" cx="48" cy="71" rx="8" ry="4"/></g>';
    if(kind==='oh')return '<ellipse class="ee-mouth" fill="#332247" cx="48" cy="64" rx="8" ry="11"/><ellipse fill="#ff7d9c" cx="48" cy="70" rx="5" ry="3"/>';
    if(kind==='kiss')return '<path class="ee-mouth" fill="none" stroke="#82335b" stroke-width="3" stroke-linecap="round" d="m44 57 8 4-8 4 8 4"/>';
    return '<path class="ee-mouth" fill="none" stroke="#332247" stroke-width="3" stroke-linecap="round" d="'+(kind==='sad'?'M38 65q10-12 20 0':kind==='small'?'M43 62h10':kind==='smirk'?'M38 62q13 10 22-4':'M35 58q13 18 26 0')+'"/>';
  }
  function accessory(extra){
    if(extra==='hands'||extra==='palm'||extra==='wave')return '<g class="ee-hand ee-hand-left" transform="translate(19 70)"><path fill="#ffcc9e" stroke="#c58c72" stroke-width="1.5" d="M-8 6V-5q0-5 3-5q3 0 3 5v-9q0-5 3-5q3 0 3 5v7-9q0-5 3-5q3 0 3 5v8-5q0-5 3-4q3 1 3 5v16q-4 12-14 10Z"/></g>'+(extra==='hands'?'<g class="ee-hand ee-hand-right" transform="translate(73 70) scale(-1 1)"><path fill="#ffcc9e" stroke="#c58c72" stroke-width="1.5" d="M-8 6V-5q0-5 3-5q3 0 3 5v-9q0-5 3-5q3 0 3 5v7-9q0-5 3-5q3 0 3 5v8-5q0-5 3-4q3 1 3 5v16q-4 12-14 10Z"/></g>':'');
    if(extra==='yes'||extra==='no')return '<g class="ee-sign"><rect fill="'+(extra==='yes'?'#127d74':'#a83c69')+'" stroke="#ffffff" stroke-width="1.5" x="27" y="74" width="42" height="17" rx="7"/><text x="48" y="86" fill="white" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="800">'+(extra==='yes'?'EVET':'HAYIR')+'</text></g>';
    if(extra==='heart')return '<g class="ee-big-heart" fill="#ff659a" stroke="#ffc2d7" stroke-width="1.5" transform="translate(44 77) scale(1.1)">'+heart+'</g>';
    return '';
  }
  function particles(extra){
    let shape=star,color='#ffe992';
    if(extra==='hearts'){shape=heart;color='#ff82b2'}
    if(extra==='tears'||extra==='rain'){shape='<path d="M0-8Q-9 3 0 6Q9 3 0-8Z"/>';color='#64e3ff'}
    if(extra==='notes'){shape='<path d="M-2-9v15h3V-5l7-2v9h3v-14ZM-2 3c-8-3-10 8-3 8s7-8 3-8Zm10-5c-8-3-10 8-3 8s7-8 3-8Z"/>';color='#89f0e1'}
    if(extra==='steam'){shape='<path fill="none" stroke="#ffdcda" stroke-width="3" d="M0 5q-8-5 0-10t0-10"/>';color='#ffdcda'}
    if(extra==='sleep'||extra==='question'){shape='<text text-anchor="middle" font-family="system-ui" font-weight="900" font-size="18">'+(extra==='sleep'?'Z':'?')+'</text>';color='#e8f7ff'}
    if(!['stars','spark','hearts','tears','rain','notes','steam','sleep','question','confetti'].includes(extra))return '';
    return '<g class="ee-particles" fill="'+color+'">'+[0,1,2,3].map((i)=>'<g class="ee-particle ee-p'+i+'" style="--particle-delay:'+(-i*.3)+'s" transform="translate('+(i%2?81:15)+' '+(extra==='tears'||extra==='rain'?47:24+i*12)+') scale(.65)">'+shape+'</g>').join('')+'</g>';
  }
  function artwork(item){
    return '<svg class="ee-art ee-'+item.id+'" width="96" height="100" viewBox="0 0 96 100" aria-hidden="true"><g class="ee-character"><path fill="#7067d9" stroke="#c8bdff" stroke-width="1.5" d="M25 97v-8q0-12 23-12t23 12v8Z"/><path fill="#e7a375" d="M40 72h16v14q-8 8-16 0Z"/><ellipse fill="#f4bb8c" stroke="#9d634f" stroke-width="1" cx="17" cy="49" rx="7" ry="10"/><ellipse fill="#f4bb8c" stroke="#9d634f" stroke-width="1" cx="79" cy="49" rx="7" ry="10"/><path fill="#ffcc9e" stroke="#c58c72" stroke-width="1.5" d="M48 17C24 17 17 34 20 57C22 76 36 84 48 84S74 76 76 57C79 34 72 17 48 17Z"/><path fill="#544074" stroke="#2f2549" stroke-width="1.5" d="M18 45C10 11 31 5 48 9C71 1 86 20 78 46l-7-16C58 39 43 36 35 26l-10 8Z"/><path fill="none" stroke="#9374bb" stroke-width="3" stroke-linecap="round" d="M25 22q9-13 23-7m2 6q12-9 22 2"/><ellipse fill="#ff8c9c" opacity=".55" cx="26" cy="53" rx="8" ry="4"/><ellipse fill="#ff8c9c" opacity=".55" cx="70" cy="53" rx="8" ry="4"/>'+eyes(item.eyes)+mouth(item.mouth)+accessory(item.extra)+'</g>'+particles(item.extra)+'</svg>';
  }
  function close(){if(panel)panel.hidden=true;button?.setAttribute('aria-expanded','false')}
  function open(){
    setup();if(!panel)return;
    panel.hidden=false;button?.setAttribute('aria-expanded','true');
    panel.querySelector('[data-close]')?.focus();
  }
  function send(id){
    const ws=window.__erisRoomSocket;
    if(!ws||ws.readyState!==1||String(ws.__erisRoomId)!==roomId())return window.toast?.('Oda bağlantısı henüz hazır değil.');
    if(Date.now()-lastSent<2000)return window.toast?.('Yeni emoji için biraz bekle.');
    const me=String(window.__erisCurrentRoomUserId||window.ErisCurrentUserId||'');
    if(![...document.querySelectorAll('#erisLiveSeats > .eris-seat')].some(s=>s.dataset.userId===me))return window.toast?.('Emoji göndermek için bir koltuğa otur.');
    lastSent=Date.now();ws.send(JSON.stringify({type:'room_reaction',reaction_id:id}));close();
  }
  function setup(){
    const s=surface(),compose=s?.querySelector('.eris-room-compose');if(!compose)return;
    button=s.querySelector('#erisRoomEmojiButton');
    if(!button){
      button=document.createElement('button');button.id='erisRoomEmojiButton';button.type='button';
      button.setAttribute('aria-label','Hareketli emojiler');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','erisRoomEmojiPanel');
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7 14q5 6 10 0"/><circle cx="8.5" cy="9" r=".7" fill="currentColor"/><circle cx="15.5" cy="9" r=".7" fill="currentColor"/></svg>';
      button.onclick=()=>panel?.hidden===false?close():open();
      compose.insertBefore(button,compose.querySelector('#erisRoomMicInline')||compose.querySelector('#erisLiveSend'));
    }
    if(!s.querySelector('#erisRoomEmojiPanel')){
      panel=document.createElement('div');panel.id='erisRoomEmojiPanel';panel.hidden=true;
      panel.innerHTML='<button class="ee-shade" type="button" aria-label="Emoji panelini kapat"></button><section class="ee-sheet" role="dialog" aria-modal="true" aria-label="Hareketli emojiler"><div class="ee-handle"></div><header><div><b>Hareketli emojiler</b><small>Seç, avatarında canlansın</small></div><button type="button" data-close aria-label="Kapat">×</button></header><div class="ee-grid"></div></section>';
      panel.querySelector('.ee-shade').onclick=close;panel.querySelector('[data-close]').onclick=()=>{close();button?.focus()};
      const grid=panel.querySelector('.ee-grid');
      for(const item of catalog){const b=document.createElement('button');b.type='button';b.title=item.label;b.setAttribute('aria-label',item.label);b.innerHTML=artwork(item)+'<span>'+item.label+'</span>';b.onclick=()=>send(item.id);grid.appendChild(b)}
      panel.addEventListener('keydown',e=>{if(e.key==='Escape'){close();button?.focus()}else if(e.key==='Tab'){const focusables=[...panel.querySelectorAll('.ee-sheet button')];const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
      s.appendChild(panel);
    }else panel=s.querySelector('#erisRoomEmojiPanel');
    const stage=document.getElementById('erisLiveSeats');
    if(stage!==observedStage){observer?.disconnect();observedStage=stage;observer=new MutationObserver(()=>{if(paintQueued)return;paintQueued=true;queueMicrotask(()=>{paintQueued=false;paint()})});if(stage)observer.observe(stage,{childList:true})}
  }
  function paint(){
    const s=surface();if(!s)return;
    const now=Date.now();
    for(const [uid,event] of active){if(event.until<=now)active.delete(uid)}
    for(const seat of s.querySelectorAll('#erisLiveSeats > .eris-seat')){
      const event=active.get(seat.dataset.userId);
      const old=seat.querySelector(':scope > .eris-seat-reaction');
      if(!event){old?.remove();seat.classList.remove('eris-reaction-playing');continue}
      if(old?.dataset.eventId===event.id)continue;
      old?.remove();const el=document.createElement('div');el.className='eris-seat-reaction';el.dataset.eventId=event.id;
      el.style.setProperty('--ee-elapsed',(-Math.max(0,now-event.start))+'ms');el.innerHTML=artwork(byId.get(event.reaction_id));
      el.setAttribute('role','img');el.setAttribute('aria-label',byId.get(event.reaction_id).label);
      seat.appendChild(el);seat.classList.add('eris-reaction-playing');
    }
  }
  function receive(d){
    if(String(d.room_id)!==roomId()||!byId.has(d.reaction_id)||!d.user_id||!d.id)return;
    if(window.ErisRoomBlocks?.has?.(d.user_id))return;
    const uid=String(d.user_id);if(active.get(uid)?.id===d.id)return;
    const start=Date.now();const duration=Math.max(500,Math.min(4000,Number(d.duration_ms)||4000));
    const ev={id:String(d.id),reaction_id:d.reaction_id,start,until:start+duration};
    active.set(uid,ev);paint();setTimeout(()=>{if(active.get(uid)===ev){active.delete(uid);paint()}},duration);
  }
  function clear(){close();active.clear();paint();observer?.disconnect();observedStage=null;lastSent=0}
  window.ErisRoomEmojis={receive,error:d=>window.toast?.(d.message||'Emoji gönderilemedi.'),open,close};
  window.addEventListener('erischat:room-opened',()=>{clear();setup()});
  window.addEventListener('erischat:room-closed',clear);
  window.addEventListener('erischat:room-blocks-updated',()=>{for(const uid of active.keys())if(window.ErisRoomBlocks?.has?.(uid))active.delete(uid);paint()});
  if(surface())setup();
})();
