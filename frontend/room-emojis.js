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
    ['wave','Selam','happy','smile','wave'],['heart','Kalp','happy','smile','heart'],
    ['kiss_left','Sola öpücük','closed','kiss','hearts'],['kiss_right','Sağa öpücük','closed','kiss','hearts'],
    ['toast_left','Sola kadeh','happy','smile','glass'],['toast_right','Sağa kadeh','happy','smile','glass']
  ].map(([id,label,eyes,mouth,extra])=>({id,label,eyes,mouth,extra}));
  const interactions=[['send_heart','Kalp'],['send_bomb','Bomba'],['send_kiss','Öpücük'],['send_rose','Gül'],['send_snow','Kartopu'],['send_toast','Kadeh']].map(([id,label])=>({id,label}));
  const interactionIds=new Set(interactions.map(x=>x.id));
  const flights=new Set(),seen=new Set();let targetUserId=null;
  const seats=()=>[...document.querySelectorAll('#erisLiveSeats > .eris-seat')];
  const findSeat=uid=>seats().find(s=>s.dataset.userId===String(uid));
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
    if(extra==='hands'||extra==='palm'||extra==='wave')return '<g transform="translate(19 70)"><g class="ee-hand ee-hand-left"><path fill="#ffcc9e" stroke="#c58c72" stroke-width="1.5" d="M-8 6V-5q0-5 3-5q3 0 3 5v-9q0-5 3-5q3 0 3 5v7-9q0-5 3-5q3 0 3 5v8-5q0-5 3-4q3 1 3 5v16q-4 12-14 10Z"/></g></g>'+(extra==='hands'?'<g transform="translate(73 70) scale(-1 1)"><g class="ee-hand ee-hand-right"><path fill="#ffcc9e" stroke="#c58c72" stroke-width="1.5" d="M-8 6V-5q0-5 3-5q3 0 3 5v-9q0-5 3-5q3 0 3 5v7-9q0-5 3-5q3 0 3 5v8-5q0-5 3-4q3 1 3 5v16q-4 12-14 10Z"/></g></g>':'');
    if(extra==='yes'||extra==='no')return '<g class="ee-sign"><rect fill="'+(extra==='yes'?'#127d74':'#a83c69')+'" stroke="#ffffff" stroke-width="1.5" x="27" y="74" width="42" height="17" rx="7"/><text x="48" y="86" fill="white" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="800">'+(extra==='yes'?'EVET':'HAYIR')+'</text></g>';
    if(extra==='heart')return '<g transform="translate(44 77) scale(1.1)"><g class="ee-big-heart" fill="#ff659a" stroke="#ffc2d7" stroke-width="1.5">'+heart+'</g></g>';
    if(extra==='glass')return '<g transform="translate(65 49) scale(.4)"><g class="ee-glass">'+projectile('send_toast')+'</g></g>';
    return '';
  }
  function particles(extra,directional=false){
    let shape=star,color='#ffe992';
    if(extra==='hearts'){shape=heart;color='#ff82b2'}
    if(extra==='tears'||extra==='rain'){shape='<path d="M0-8Q-9 3 0 6Q9 3 0-8Z"/>';color='#64e3ff'}
    if(extra==='notes'){shape='<path d="M-2-9v15h3V-5l7-2v9h3v-14ZM-2 3c-8-3-10 8-3 8s7-8 3-8Zm10-5c-8-3-10 8-3 8s7-8 3-8Z"/>';color='#89f0e1'}
    if(extra==='steam'){shape='<path fill="none" stroke="#ffdcda" stroke-width="3" d="M0 5q-8-5 0-10t0-10"/>';color='#ffdcda'}
    if(extra==='sleep'||extra==='question'){shape='<text text-anchor="middle" font-family="system-ui" font-weight="900" font-size="18">'+(extra==='sleep'?'Z':'?')+'</text>';color='#e8f7ff'}
    if(!['stars','spark','hearts','tears','rain','notes','steam','sleep','question','confetti'].includes(extra))return '';
    return '<g class="ee-particles" fill="'+color+'">'+[0,1,2,3].map((i)=>'<g transform="translate('+(directional?80:(i%2?81:15))+' '+(extra==='tears'||extra==='rain'?47:24+i*12)+') scale(.65)"><g class="ee-particle ee-p'+i+'" style="--particle-delay:'+(-i*.3)+'s">'+shape+'</g></g>').join('')+'</g>';
  }
  function artwork(item){
    return '<svg class="ee-art ee-'+item.id+'" width="96" height="100" viewBox="0 0 96 100" aria-hidden="true"><g'+(item.id.endsWith('_left')?' transform="translate(96 0) scale(-1 1)"':'')+'><g class="ee-character"><ellipse fill="#ffd8ad" stroke="#d29b76" stroke-width="1.5" cx="16" cy="48" rx="7" ry="10"/><ellipse fill="#ffd8ad" stroke="#d29b76" stroke-width="1.5" cx="80" cy="48" rx="7" ry="10"/><path fill="#ffdab1" stroke="#d29b76" stroke-width="1.5" d="M48 12C25 12 16 29 19 53C21 76 35 86 48 86S75 76 77 53C80 29 71 12 48 12Z"/><path fill="none" stroke="#fff0d8" stroke-width="3" stroke-linecap="round" d="M27 29q6-9 16-10"/><ellipse fill="#ff8c9c" opacity=".55" cx="26" cy="53" rx="8" ry="4"/><ellipse fill="#ff8c9c" opacity=".55" cx="70" cy="53" rx="8" ry="4"/>'+eyes(item.eyes)+mouth(item.mouth)+accessory(item.extra)+'</g>'+particles(item.extra,item.id.startsWith('kiss_'))+'</g></svg>';
  }

  function projectile(id){
    if(id==='send_heart')return '<g transform="translate(38 44) scale(2)" fill="#ff4e91" stroke="#ffd0e2" stroke-width="1">'+heart+'</g>';
    if(id==='send_bomb')return '<circle cx="45" cy="56" r="27" fill="#292841" stroke="#9191ac" stroke-width="2"/><ellipse cx="35" cy="44" rx="9" ry="5" fill="#77748e" transform="rotate(-35 35 44)"/><path stroke="#b88c61" stroke-width="5" fill="none" d="M58 31q-4-17 12-13"/><g fill="#ffcb5c" transform="translate(73 17) scale(1.5)">'+star+'</g>';
    if(id==='send_snow')return '<circle cx="48" cy="51" r="28" fill="#e7f6ff" stroke="#acd3ed" stroke-width="2"/><path stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" d="M29 46q3-15 19-16"/><circle cx="58" cy="64" r="5" fill="#c5e3f2"/>';
    if(id==='send_rose')return '<path stroke="#5cbe84" stroke-width="5" fill="none" d="M51 51q-13 23-13 38"/><path fill="#6ed393" d="M44 74q20-18 25-7q-10 13-25 7"/><path fill="#ff4a78" stroke="#ffc0d1" stroke-width="1.5" d="M48 15q-19-8-25 9q-15 8-4 23q3 16 22 15q17 5 26-9q15-6 10-21q-1-19-22-14Z"/><path fill="none" stroke="#bb2250" stroke-width="3" d="M31 30q15-12 29 0q-2 17-19 18q-10-8-2-15q10-5 15 1"/>';
    if(id==='send_kiss')return '<path fill="#f84a83" stroke="#ffd0df" stroke-width="1.5" d="M12 49q15-29 36-12q21-17 36 12q-15 31-36 28q-21 3-36-28Z"/><path fill="#a22658" d="M17 49q31-13 62 0q-30 12-62 0Z"/><path fill="none" stroke="#ffb4cf" stroke-width="4" stroke-linecap="round" d="M26 43q8-8 17-4"/>';
    return '<path fill="#edf4ff99" stroke="#f1e4ff" stroke-width="2" d="M27 15h42v27q0 20-21 20T27 42Z"/><path fill="#eab75e" d="M29 34h38v9q0 17-19 17T29 43Z"/><path stroke="#eee5ff" stroke-width="4" d="M48 62v22m-14 0h28"/>';
  }
  function projectileArt(id){return '<svg class="ee-art ee-'+id+'" width="96" height="100" viewBox="0 0 96 100" aria-hidden="true">'+projectile(id)+'</svg>'}
  function fly(d){
    const target=String(d.target_user_id||'');if(!target||window.ErisRoomBlocks?.has?.(target))return;
    const from=findSeat(d.user_id),to=findSeat(target),s=surface();if(!from||!to||!s)return;
    const bounds=s.getBoundingClientRect(),a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
    const x1=a.left+a.width/2-bounds.left,y1=a.top+a.height/2-bounds.top;
    const x2=b.left+b.width/2-bounds.left,y2=b.top+b.height/2-bounds.top;
    const el=document.createElement('div');el.className='ee-flight';el.innerHTML=projectileArt(d.reaction_id);s.appendChild(el);
    if(flights.size>=12){const oldest=flights.values().next().value;oldest.animation?.cancel();oldest.el.remove();flights.delete(oldest)}
    const flight={el,animation:null,sender:String(d.user_id),target};flights.add(flight);const currentRoom=roomId();
    const finish=()=>{
      flights.delete(flight);el.remove();if(roomId()!==currentRoom||!findSeat(target)||window.ErisRoomBlocks?.has?.(target)||window.ErisRoomBlocks?.has?.(d.user_id))return;
      const start=Date.now(),ev={id:String(d.id),reaction_id:d.reaction_id,start,until:start+2500};
      active.set(target,ev);paint();setTimeout(()=>{if(active.get(target)===ev){active.delete(target);paint()}},2500);
    };
    if(!el.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finish();return}
    const frames=Array.from({length:21},(_,i)=>{const t=i/20;return {transform:'translate('+(x1+(x2-x1)*t-24)+'px,'+(y1+(y2-y1)*t-80*t*(1-t)-24)+'px) rotate('+(t*25)+'deg)',opacity:t<.1?t*10:1}});
    flight.animation=el.animate(frames,{duration:850,easing:'ease-in-out',fill:'forwards'});
    flight.animation.finished.then(finish).catch(()=>{flights.delete(flight);el.remove()});
  }

  function close(){if(panel)panel.hidden=true;button?.setAttribute('aria-expanded','false')}
  function open(selectedTarget=null){
    setup();if(!panel)return;
    targetUserId=selectedTarget?String(selectedTarget):null;
    panel.querySelector('header b').textContent=targetUserId?'Mikrofon etkileşimi':'Hareketli emojiler';
    panel.querySelector('header small').textContent=targetUserId?'Seçilen koltuğa gönder • Ücretsiz':'Seç, avatarında canlansın';
    panel.querySelector('.ee-sheet').setAttribute('aria-label',targetUserId?'Mikrofon etkileşimi':'Hareketli emojiler');
    const grid=panel.querySelector('.ee-grid');grid.replaceChildren();
    for(const item of (targetUserId?interactions:catalog)){const b=document.createElement('button');b.type='button';b.title=item.label;b.setAttribute('aria-label',item.label);b.innerHTML=(targetUserId?projectileArt(item.id):artwork(item))+'<span>'+item.label+'</span>';b.onclick=()=>send(item.id);grid.appendChild(b)}
    panel.hidden=false;button?.setAttribute('aria-expanded','true');
    panel.querySelector('[data-close]')?.focus();
  }
  function send(id){
    const ws=window.__erisRoomSocket;
    if(!ws||ws.readyState!==1||String(ws.__erisRoomId)!==roomId())return window.toast?.('Oda bağlantısı henüz hazır değil.');
    if(Date.now()-lastSent<2000)return window.toast?.('Yeni emoji için biraz bekle.');
    const me=String(window.__erisCurrentRoomUserId||window.ErisCurrentUserId||'');
    if(![...document.querySelectorAll('#erisLiveSeats > .eris-seat')].some(s=>s.dataset.userId===me))return window.toast?.('Emoji göndermek için bir koltuğa otur.');
    if(interactionIds.has(id)&&(!targetUserId||targetUserId===me||!findSeat(targetUserId)))return window.toast?.('Bu kullanıcı artık koltukta değil.');
    lastSent=Date.now();ws.send(JSON.stringify({type:'room_reaction',reaction_id:id,...(interactionIds.has(id)?{target_user_id:targetUserId}:{})}));close();
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
      old?.remove();const el=document.createElement('div');el.className='eris-seat-reaction';el.dataset.eventId=event.id;el.dataset.reactionId=event.reaction_id;
      el.style.setProperty('--ee-elapsed',(-Math.max(0,now-event.start))+'ms');el.innerHTML=interactionIds.has(event.reaction_id)?projectileArt(event.reaction_id):artwork(byId.get(event.reaction_id));
      if(interactionIds.has(event.reaction_id))el.classList.add('ee-impact');
      el.setAttribute('role','img');el.setAttribute('aria-label',(byId.get(event.reaction_id)||interactions.find(x=>x.id===event.reaction_id)).label);
      seat.appendChild(el);seat.classList.toggle('eris-reaction-playing',!interactionIds.has(event.reaction_id));
    }
  }
  function receive(d){
    if(String(d.room_id)!==roomId()||(!byId.has(d.reaction_id)&&!interactionIds.has(d.reaction_id))||!d.user_id||!d.id)return;
    if(window.ErisRoomBlocks?.has?.(d.user_id))return;
    if(seen.has(String(d.id)))return;seen.add(String(d.id));if(seen.size>128)seen.delete(seen.values().next().value);
    if(interactionIds.has(d.reaction_id)){fly(d);return}
    const uid=String(d.user_id);if(active.get(uid)?.id===d.id)return;
    const start=Date.now();const duration=Math.max(500,Math.min(4000,Number(d.duration_ms)||4000));
    const ev={id:String(d.id),reaction_id:d.reaction_id,start,until:start+duration};
    active.set(uid,ev);paint();setTimeout(()=>{if(active.get(uid)===ev){active.delete(uid);paint()}},duration);
  }
  function clear(){close();targetUserId=null;for(const f of flights){f.animation?.cancel();f.el.remove()}flights.clear();seen.clear();active.clear();paint();observer?.disconnect();observedStage=null;lastSent=0}
  window.ErisRoomEmojis={receive,error:d=>window.toast?.(d.message||'Emoji gönderilemedi.'),open:()=>open(),openInteraction:uid=>{if(!findSeat(uid))return window.toast?.('Kullanıcı bir koltukta değil.');open(uid)},close};
  window.addEventListener('erischat:room-opened',()=>{clear();setup()});
  window.addEventListener('erischat:room-closed',clear);
  window.addEventListener('erischat:room-blocks-updated',()=>{for(const uid of active.keys())if(window.ErisRoomBlocks?.has?.(uid))active.delete(uid);for(const f of flights)if(window.ErisRoomBlocks?.has?.(f.sender)||window.ErisRoomBlocks?.has?.(f.target)){f.animation?.cancel();f.el.remove();flights.delete(f)}paint()});
  if(surface())setup();
})();
