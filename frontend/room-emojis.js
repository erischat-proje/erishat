(() => {
  'use strict';
  const catalog = [{"id": "laugh", "label": "Kahkaha", "level": 0, "asset": "./assets/room-emojis-lidya-v1/laugh.png"}, {"id": "cry", "label": "Ağlama", "level": 0, "asset": "./assets/room-emojis-lidya-v1/cry.png"}, {"id": "kiss", "label": "Öpücük", "level": 0, "asset": "./assets/room-emojis-lidya-v1/kiss.png"}, {"id": "love", "label": "Sevgi", "level": 0, "asset": "./assets/room-emojis-lidya-v1/love.png"}, {"id": "clap", "label": "Alkış", "level": 0, "asset": "./assets/room-emojis-lidya-v1/clap.png"}, {"id": "angry", "label": "Sinirli", "level": 0, "asset": "./assets/room-emojis-lidya-v1/angry.png"}, {"id": "surprised", "label": "Şaşkın", "level": 0, "asset": "./assets/room-emojis-lidya-v1/surprised.png"}, {"id": "sleep", "label": "Uykulu", "level": 0, "asset": "./assets/room-emojis-lidya-v1/sleep.png"}, {"id": "dance", "label": "Dans", "level": 0, "asset": "./assets/room-emojis-lidya-v1/dance.png"}, {"id": "cool", "label": "Havalı", "level": 0, "asset": "./assets/room-emojis-lidya-v1/cool.png"}, {"id": "yes", "label": "Evet", "level": 0, "asset": "./assets/room-emojis-lidya-v1/yes.png"}, {"id": "no", "label": "Hayır", "level": 0, "asset": "./assets/room-emojis-lidya-v1/no.png"}, {"id": "thanks", "label": "Teşekkür", "level": 0, "asset": "./assets/room-emojis-lidya-v1/thanks.png"}, {"id": "welcome", "label": "Hoş geldin", "level": 0, "asset": "./assets/room-emojis-lidya-v1/welcome.png"}, {"id": "shy", "label": "Utangaç", "level": 0, "asset": "./assets/room-emojis-lidya-v1/shy.png"}, {"id": "wink", "label": "Göz kırp", "level": 0, "asset": "./assets/room-emojis-lidya-v1/wink.png"}, {"id": "confused", "label": "Kararsız", "level": 0, "asset": "./assets/room-emojis-lidya-v1/confused.png"}, {"id": "party", "label": "Parti", "level": 0, "asset": "./assets/room-emojis-lidya-v1/party.png"}, {"id": "cheer", "label": "Bravo", "level": 0, "asset": "./assets/room-emojis-lidya-v1/cheer.png"}, {"id": "sad", "label": "Üzgün", "level": 0, "asset": "./assets/room-emojis-lidya-v1/sad.png"}, {"id": "wow", "label": "Vay", "level": 0, "asset": "./assets/room-emojis-lidya-v1/wow.png"}, {"id": "facepalm", "label": "Pes", "level": 0, "asset": "./assets/room-emojis-lidya-v1/facepalm.png"}, {"id": "wave", "label": "Selam", "level": 0, "asset": "./assets/room-emojis-lidya-v1/wave.png"}, {"id": "heart", "label": "Kalp", "level": 0, "asset": "./assets/room-emojis-lidya-v1/heart.png"}, {"id": "kiss_left", "label": "Sola öpücük", "level": 0, "asset": "./assets/room-emojis-lidya-v1/kiss_left.png"}, {"id": "kiss_right", "label": "Sağa öpücük", "level": 0, "asset": "./assets/room-emojis-lidya-v1/kiss_right.png"}, {"id": "toast_left", "label": "Sola kadeh", "level": 0, "asset": "./assets/room-emojis-lidya-v1/toast_left.png"}, {"id": "toast_right", "label": "Sağa kadeh", "level": 0, "asset": "./assets/room-emojis-lidya-v1/toast_right.png"}, {"id": "vip_1", "label": "Altın Işıltı", "level": 1, "asset": "./assets/room-emojis-lidya-v1/vip_1.png"}, {"id": "vip_2", "label": "Zümrüt Bakış", "level": 2, "asset": "./assets/room-emojis-lidya-v1/vip_2.png"}, {"id": "vip_3", "label": "Sardes Zaferi", "level": 3, "asset": "./assets/room-emojis-lidya-v1/vip_3.png"}, {"id": "vip_4", "label": "Kraliyet Mührü", "level": 4, "asset": "./assets/room-emojis-lidya-v1/vip_4.png"}, {"id": "vip_5", "label": "Kristal Aura", "level": 5, "asset": "./assets/room-emojis-lidya-v1/vip_5.png"}, {"id": "vip_6", "label": "Kanatlı İhtişam", "level": 6, "asset": "./assets/room-emojis-lidya-v1/vip_6.png"}, {"id": "vip_7", "label": "Saray Alevi", "level": 7, "asset": "./assets/room-emojis-lidya-v1/vip_7.png"}, {"id": "vip_8", "label": "Yıldız Muhafızı", "level": 8, "asset": "./assets/room-emojis-lidya-v1/vip_8.png"}, {"id": "vip_9", "label": "Ejder Mührü", "level": 9, "asset": "./assets/room-emojis-lidya-v1/vip_9.png"}, {"id": "vip_10", "label": "Anka Yükselişi", "level": 10, "asset": "./assets/room-emojis-lidya-v1/vip_10.png"}, {"id": "vip_11", "label": "Kozmik Taç", "level": 11, "asset": "./assets/room-emojis-lidya-v1/vip_11.png"}, {"id": "vip_12", "label": "Lidya Efsanesi", "level": 12, "asset": "./assets/room-emojis-lidya-v1/vip_12.png"}];
  const artRoot=new URL('./assets/room-emojis-lidya-v1/',document.currentScript?.src||location.href).href;
  const apiBase=(window.ERIS_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
  const authToken=()=>localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';
  let vipLevel=0,vipState='idle',vipAccount='',vipRequest=0,tab='standard',levelFilter=0;
  const unlocked=new Set();
  const opener=()=>button;
  async function refreshVip(){
    const account=authToken(),request=++vipRequest;
    vipAccount=account;vipLevel=0;unlocked.clear();vipState='loading';renderGrid();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      if(!account)throw new Error('Oturum gerekli');
      const response=await fetch(apiBase+'/me/room-emojis',{headers:{Accept:'application/json',Authorization:'Bearer '+account},signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('VIP seviyesi alınamadı');
      const data=await response.json();
      if(request!==vipRequest)return;
      if(account!==authToken()){vipState='error';return;}
      if(!Number.isInteger(data.level)||data.level<0||data.level>12||!Array.isArray(data.unlocked_ids))throw new Error('Geçersiz VIP yanıtı');
      vipLevel=data.level;
      for(const id of data.unlocked_ids){const item=byId.get(id);if(item?.level>0&&item.level<=vipLevel)unlocked.add(id)}
      vipState='ready';
    }catch(_){if(request!==vipRequest)return;vipLevel=0;unlocked.clear();vipState='error'}
    finally{clearTimeout(timer);if(request===vipRequest)renderGrid()}
  }
  function canSend(item){return !item.level||(vipState==='ready'&&vipAccount===authToken()&&unlocked.has(item.id))}
  function renderGrid(){
    if(!panel)return;
    const target=!!targetUserId,vip=tab==='vip'&&!target;
    panel.querySelector('.ee-tabs').hidden=target;
    panel.querySelector('.ee-levels').hidden=!vip;
    const status=panel.querySelector('.ee-status');
    status.textContent=target?'Seçilen koltuğa gönder · Ücretsiz':vipState==='loading'?'VIP koleksiyonun kontrol ediliyor…':vipState==='error'?'VIP bilgisi alınamadı. Normal emojiler kullanılabilir.':`VIP ${vipLevel} · ${unlocked.size}/12 özel emoji açık`;
    panel.querySelector('[data-retry]').hidden=target||vipState!=='error';
    panel.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
    panel.querySelectorAll('[data-level]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.level)===levelFilter)));
    const grid=panel.querySelector('.ee-grid');grid.replaceChildren();
    const items=target?interactions:catalog.filter(item=>vip?item.level>0&&(!levelFilter||item.level===levelFilter):!item.level);
    for(const item of items){
      const b=document.createElement('button');b.type='button';b.dataset.emojiId=item.id;
      const locked=!target&&!canSend(item),name=item.label;
      b.className='ee-choice'+(item.level?' ee-premium':'')+(locked?' ee-locked':'');
      b.setAttribute('aria-disabled',String(locked));
      b.setAttribute('aria-label',name+(item.level?` · VIP ${item.level}`:'')+(locked?' · Kilitli':''));
      b.title=b.getAttribute('aria-label');
      b.innerHTML=(target?projectileArt(item.id):artwork(item))+`<span class="ee-label">${name}</span>`+(item.level?`<small class="ee-tier">${locked?'Kilitli · ':''}VIP ${item.level}</small>`:'');
      b.onclick=()=>send(item.id);grid.appendChild(b);
    }
  }
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
  function artwork(item){
    return `<span class="ee-art ee-sticker ee-${item.id}${item.level?' ee-vip-art ee-rank-'+item.level:''}" aria-hidden="true"><img src="${artRoot+item.id+'.png'}" alt="" width="256" height="256" decoding="async" draggable="false"></span>`;
  }
  function projectile(id){
    if(id==='send_heart')return '<g transform="translate(38 44) scale(2)" fill="#10a17c" stroke="#f4dfa2" stroke-width="1">'+heart+'</g>';
    if(id==='send_bomb')return '<circle cx="45" cy="56" r="27" fill="#123b30" stroke="#c7a35f" stroke-width="2"/><ellipse cx="35" cy="44" rx="9" ry="5" fill="#77748e" transform="rotate(-35 35 44)"/><path stroke="#b88c61" stroke-width="5" fill="none" d="M58 31q-4-17 12-13"/><g fill="#ffcb5c" transform="translate(73 17) scale(1.5)">'+star+'</g>';
    if(id==='send_snow')return '<circle cx="48" cy="51" r="28" fill="#e7f6ff" stroke="#acd3ed" stroke-width="2"/><path stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" d="M29 46q3-15 19-16"/><circle cx="58" cy="64" r="5" fill="#c5e3f2"/>';
    if(id==='send_rose')return '<path stroke="#5cbe84" stroke-width="5" fill="none" d="M51 51q-13 23-13 38"/><path fill="#6ed393" d="M44 74q20-18 25-7q-10 13-25 7"/><path fill="#159b72" stroke="#f4dfa2" stroke-width="1.5" d="M48 15q-19-8-25 9q-15 8-4 23q3 16 22 15q17 5 26-9q15-6 10-21q-1-19-22-14Z"/><path fill="none" stroke="#075442" stroke-width="3" d="M31 30q15-12 29 0q-2 17-19 18q-10-8-2-15q10-5 15 1"/>';
    if(id==='send_kiss')return '<path fill="#169c73" stroke="#f4dfa2" stroke-width="1.5" d="M12 49q15-29 36-12q21-17 36 12q-15 31-36 28q-21 3-36-28Z"/><path fill="#064a39" d="M17 49q31-13 62 0q-30 12-62 0Z"/><path fill="none" stroke="#c7efca" stroke-width="4" stroke-linecap="round" d="M26 43q8-8 17-4"/>';
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

  function close(){const inside=panel?.contains(document.activeElement);if(panel)panel.hidden=true;button?.setAttribute('aria-expanded','false');if(inside)opener()?.focus()}
  function open(selectedTarget=null){
    setup();if(!panel)return;
    targetUserId=selectedTarget?String(selectedTarget):null;
    panel.querySelector('header b').textContent=targetUserId?'Mikrofon etkileşimi':'Lidya emojileri';
    panel.querySelector('header small').textContent=targetUserId?'Seçilen koltuğa gönder · Ücretsiz':'Altın ifadeler · Seviye atlayan ihtişam';
    panel.querySelector('.ee-sheet').setAttribute('aria-label',targetUserId?'Mikrofon etkileşimi':'Lidya emojileri');
    tab=targetUserId?'standard':tab;renderGrid();
    if(!targetUserId)refreshVip();
    panel.hidden=false;button?.setAttribute('aria-expanded','true');
    panel.querySelector('[data-close]')?.focus();
  }
  function send(id){
    const item=byId.get(id);
    if(item&&!canSend(item))return window.toast?.(vipState==='ready'?`Bu emoji VIP ${item.level} seviyesinde açılır.`:'Önce VIP seviyeni tekrar kontrol et.');
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
      panel.innerHTML='<button class="ee-shade" type="button" aria-label="Emoji panelini kapat"></button><section class="ee-sheet" role="dialog" aria-modal="true" aria-label="Lidya emojileri"><div class="ee-handle"></div><header><div><b>Lidya emojileri</b><small>Altın ifadeler · Seviye atlayan ihtişam</small></div><button type="button" data-close aria-label="Kapat">×</button></header><nav class="ee-tabs" aria-label="Emoji koleksiyonu"><button type="button" data-tab="standard" aria-pressed="true">Lidya</button><button type="button" data-tab="vip" aria-pressed="false">VIP koleksiyonu</button></nav><div class="ee-levels" aria-label="VIP seviye filtresi" hidden></div><div class="ee-status-row"><small class="ee-status" role="status" aria-live="polite"></small><button type="button" data-retry hidden>Tekrar dene</button></div><div class="ee-grid"></div></section>';
      panel.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderGrid()});
      panel.querySelector('.ee-levels').innerHTML=[0,...Array.from({length:12},(_,i)=>i+1)].map(n=>`<button type="button" data-level="${n}" aria-pressed="${n===0}">${n?'VIP '+n:'Tümü'}</button>`).join('');
      panel.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{levelFilter=Number(b.dataset.level);renderGrid()});
      panel.querySelector('[data-retry]').onclick=()=>refreshVip();
      panel.querySelector('.ee-shade').onclick=close;panel.querySelector('[data-close]').onclick=()=>{close();button?.focus()};
      panel.addEventListener('keydown',e=>{if(e.key==='Escape'){close();button?.focus()}else if(e.key==='Tab'){const focusables=[...panel.querySelectorAll('.ee-sheet button')].filter(b=>!b.disabled&&b.getClientRects().length);const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
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
  function clear(){close();vipRequest++;vipLevel=0;vipState='idle';unlocked.clear();targetUserId=null;for(const f of flights){f.animation?.cancel();f.el.remove()}flights.clear();seen.clear();active.clear();paint();observer?.disconnect();observedStage=null;lastSent=0}
  window.ErisRoomEmojis={receive,error:d=>{window.toast?.(d.message||'Emoji gönderilemedi.');if(!panel?.hidden&&!targetUserId)refreshVip()},open:()=>open(),openInteraction:uid=>{if(!findSeat(uid))return window.toast?.('Kullanıcı bir koltukta değil.');open(uid)},close};
  window.addEventListener('erischat:room-opened',()=>{clear();setup()});
  window.addEventListener('erischat:room-closed',clear);
  window.addEventListener('erischat:room-blocks-updated',()=>{for(const uid of active.keys())if(window.ErisRoomBlocks?.has?.(uid))active.delete(uid);for(const f of flights)if(window.ErisRoomBlocks?.has?.(f.sender)||window.ErisRoomBlocks?.has?.(f.target)){f.animation?.cancel();f.el.remove();flights.delete(f)}paint()});
  window.addEventListener('erischat:vip-updated',()=>{if(panel&&!panel.hidden&&!targetUserId)refreshVip()});
  if(surface())setup();
})();

