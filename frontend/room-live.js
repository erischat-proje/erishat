(() => {
  const API = (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  async function loadRooms() {
    const targets = [...document.querySelectorAll('#realRooms,#rooms')]; if (!targets.length) return;
    try {
      const r = await fetch(`${API}/rooms`, { headers: headers() }); if (!r.ok) throw new Error(`rooms:${r.status}`);
      const data = await r.json(); const rooms = Array.isArray(data) ? data : (data.rooms || data.items || data.data || []);
      targets.forEach(el => { el.innerHTML=''; if (!rooms.length) { window.dispatchEvent(new CustomEvent('erischat:demo-rooms-fallback')); return; }
        rooms.forEach(room => { const id=room.id ?? room.room_id, name=room.name||room.title||`Oda #${id}`, count=room.member_count??room.members_count??room.online_count??0, owner=room.owner_name||room.owner||'ErisChat'; const b=document.createElement('button'); b.className='room card'; b.innerHTML='<div class="ava">🎙️<span class="online"></span></div><div class="grow roomText"><b></b><small></small></div><span class="live">CANLI</span>'; b.querySelector('b').textContent=name; b.querySelector('small').textContent=`${count} kişi • ${owner}`; b.onclick=()=>{window.ErisCurrentRoomId=id;window.currentRoomId=id;if(typeof window.openRoom==='function') window.openRoom(id,name); else window.toast?.(`${name} odasına bağlanılıyor…`)}; el.appendChild(b); });
      });
    } catch(e) { console.warn('[ErisChat] room list unavailable',e); window.dispatchEvent(new CustomEvent('erischat:demo-rooms-fallback')); }
  }
  window.ErisChatRoomList={load:loadRooms};
  window.addEventListener('erischat:demo-rooms-fallback',()=>{
    const data=[
      ['demo-room-1','Gece Muhabbeti',8,'Rana','🌙'],['demo-room-2','Müzik Köşesi',12,'Eris','🎵'],['demo-room-3','Yeni Tanışmalar',5,'Lavin','💜'],['demo-room-4','Oyun Salonu',9,'Noir','🎮'],['demo-room-5','VIP Lounge',11,'NØXIA','👑'],['demo-room-6','Gece Yayını',7,'Mira','✨']
    ];
    document.querySelectorAll('#realRooms,#rooms').forEach(el=>{el.innerHTML='';data.forEach(r=>{const b=document.createElement('button');b.className='room card';b.innerHTML='<div class="ava">'+r[4]+'<span class="online"></span></div><div class="grow roomText"><b></b><small></small></div><span class="live">DEMO CANLI</span>';b.querySelector('b').textContent=r[1];b.querySelector('small').textContent=r[2]+' kişi • '+r[3];b.onclick=()=>openRoom(r[0],r[1]);el.appendChild(b)});});
  });


  function ensureRoomSurface(){
    if(document.getElementById('erisRoomSurface')) return document.getElementById('erisRoomSurface');
    const style=document.createElement('style'); style.id='erisRoomSurfaceStyle';
    style.textContent=\`
      #erisRoomSurface{position:fixed;inset:0;z-index:900;background:#05040a;color:#fff;display:none;overflow:hidden;font-family:Inter,system-ui,sans-serif}
      #erisRoomSurface.show{display:block}
      .eris-room-wall{position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,rgba(255,80,170,.20),transparent 28%),radial-gradient(circle at 12% 12%,rgba(120,80,255,.28),transparent 30%),radial-gradient(circle at 90% 20%,rgba(40,170,255,.16),transparent 26%),linear-gradient(145deg,#100a1c 0%,#090813 48%,#150b19 100%)}
      .eris-room-wall:before{content:"";position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:42px 42px;opacity:.35}
      .eris-room-top{position:absolute;left:0;right:0;top:0;height:64px;display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(#05040acc,transparent);z-index:4}
      .eris-room-top button{border:1px solid #ffffff18;background:#08070baa;color:#fff;border-radius:12px;width:40px;height:40px}
      .eris-room-title{flex:1;min-width:0}.eris-room-title b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.eris-room-title small{display:block;color:#c0b7c7;font-size:9px;margin-top:3px}
      .eris-room-stage{position:absolute;inset:62px 0 205px;min-height:330px}
      .eris-seat{position:absolute;transform:translate(-50%,-50%);width:82px;height:82px;border-radius:50%;border:1px solid #ffffff2c;background:radial-gradient(circle at 35% 25%,#ffffff22,transparent 28%),linear-gradient(145deg,#241b35,#120e19);box-shadow:0 10px 30px #0008,inset 0 0 18px #ffffff08;color:#fff;display:grid;place-items:center;text-align:center;padding:6px;z-index:2}
      .eris-seat.empty{border-style:dashed;background:radial-gradient(circle,#8a5cff22,#0d0a12 70%);color:#c9bfd2}.eris-seat.me{border-color:#ff5bad;box-shadow:0 0 0 4px #ff4fa31a,0 12px 35px #0008}.eris-seat.locked{opacity:.42;cursor:not-allowed}
      .eris-seat .seat-ava{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#8a5cff,#ff4fa3);font-size:16px;margin:auto}.eris-seat.empty .seat-ava{background:#ffffff0d;color:#aaa0ad}
      .eris-seat b{display:block;font-size:9px;max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.eris-seat small{display:block;color:#a69cad;font-size:7px;margin-top:2px}
      .seat1{left:50%;top:18%}.seat2{left:25%;top:31%}.seat3{left:75%;top:31%}.seat4{left:14%;top:55%}.seat5{left:86%;top:55%}.seat6{left:29%;top:76%}.seat7{left:71%;top:76%}.seat8{left:50%;top:91%}
      .eris-room-chat{position:absolute;left:0;right:0;bottom:0;height:205px;background:linear-gradient(180deg,#05040a00 0%,#05040ae8 20%,#05040af7);z-index:5;display:flex;flex-direction:column}
      .eris-chat-list{flex:1;overflow:auto;padding:30px 14px 7px;display:flex;flex-direction:column;gap:6px}
      .eris-chat-msg{max-width:82%;padding:7px 10px;border-radius:12px;background:#17121eaa;border:1px solid #ffffff0b;font-size:10px}.eris-chat-msg.me{align-self:flex-end;background:linear-gradient(135deg,#754cffcc,#ff4fa3cc)}.eris-chat-msg b{font-size:8px;color:#d5cbdc}.eris-chat-msg span{display:block;margin-top:2px}
      .eris-room-compose{display:flex;gap:6px;padding:8px 10px 12px}.eris-room-compose input{flex:1;min-width:0;border:1px solid #ffffff16;background:#0c0a12e8;color:#fff;border-radius:12px;padding:11px;outline:none}.eris-room-compose button{border:0;border-radius:12px;padding:0 14px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:800}
      .eris-room-tools{position:absolute;right:10px;bottom:222px;z-index:8;display:flex;gap:6px}.eris-room-tools button{border:1px solid #ffffff18;background:#08070bcc;color:#fff;border-radius:12px;padding:9px 10px;font-size:9px}
      @media(max-width:520px){.eris-seat{width:72px;height:72px}.seat1{top:17%}.seat8{top:88%}}
      @media(min-width:760px){.eris-room-stage{left:50%;right:auto;width:min(900px,100%);transform:translateX(-50%)}.eris-room-chat{left:50%;right:auto;width:min(900px,100%);transform:translateX(-50%)}.eris-room-tools{right:max(12px,calc((100% - 900px)/2 + 12px))}}
    \`;
    document.head.appendChild(style);
    const s=document.createElement('section');s.id='erisRoomSurface';
    s.innerHTML='<div class="eris-room-wall"></div><div class="eris-room-top"><button id="erisRoomBack">‹</button><div class="eris-room-title"><b id="erisLiveTitle">Oda</b><small id="erisLiveMeta">Bağlanıyor…</small></div><button id="erisRoomGift">🎁</button><button id="erisRoomMusic">🎵</button></div><div class="eris-room-stage" id="erisLiveSeats"><div style="padding:30px;text-align:center;color:#aaa">8 koltuk hazırlanıyor…</div></div><div class="eris-room-tools"><button id="erisRoomMic">🎙️ Mikrofon</button><button id="erisRoomMore">•••</button></div><div class="eris-room-chat"><div class="eris-chat-list" id="erisLiveChat"><div style="color:#938a9f;font-size:9px">Oda sohbetine bağlanılıyor…</div></div><div class="eris-room-compose"><input id="erisLiveInput" maxlength="500" placeholder="Odaya mesaj yaz…"><button id="erisLiveSend">Gönder</button></div></div>';
    document.body.appendChild(s);
    s.querySelector('#erisRoomBack').onclick=window.closeRealRoom;
    s.querySelector('#erisRoomMusic').onclick=()=>window.ErisChatMusic?.open?.();
    s.querySelector('#erisRoomGift').onclick=()=>window.ErisDemoExtras?.roomGift?.();
    s.querySelector('#erisRoomMore').onclick=()=>window.ErisDemoExtras?.roomSettings?.();
    s.querySelector('#erisRoomMic').onclick=()=>window.toast?.('Mikrofon: gerçek oda RTC bağlantısı için koltuğa oturun.');
    return s;
  }

  function renderRoomSeats(roomId,name,list){
    const box=document.getElementById('erisLiveSeats'); if(!box)return;
    const seats=(Array.isArray(list)?list:[]).slice(0,8); while(seats.length<8)seats.push({seat_number:seats.length+1,user_id:null,locked:false});
    box.innerHTML='';
    seats.forEach((seat,i)=>{const n=seat.seat_number??i+1,occupied=!!seat.user_id,locked=!!seat.locked,isMe=occupied&&String(seat.user_id)===String(window.ErisCurrentUserId||localStorage.getItem('eris_user_id')||'');const b=document.createElement('button');b.type='button';b.className='eris-seat seat'+(i+1)+(occupied?' occupied':' empty')+(locked?' locked':'')+(isMe?' me':'');b.innerHTML='<div><div class="seat-ava">'+(occupied?'👤':locked?'🔒':'＋')+'</div><b></b><small></small></div>';b.querySelector('b').textContent=occupied?(seat.nickname||seat.user_name||(isMe?'Sen':'Kullanıcı')):'Koltuk '+n;b.querySelector('small').textContent=locked?'Kilitli':occupied?(isMe?'Sen':'Konuşmacı'):'Boş • otur';if(!occupied&&!locked)b.onclick=async()=>{try{await window.ErisRoom.joinSeat(roomId,n);await openRoom(roomId,name)}catch(e){window.toast?.(e.message||'Koltuk alınamadı.')}};box.appendChild(b);});
  }

  function attachRoomChat(roomId){
    const list=document.getElementById('erisLiveChat'),state=document.getElementById('erisLiveMeta'),input=document.getElementById('erisLiveInput'),send=document.getElementById('erisLiveSend');
    if(!list||!window.ErisPlatform?.getRealtimeUrl)return;
    const token=window.ErisPlatform.getAccessToken?.(); if(!token){list.innerHTML='<div style="color:#ff9bc9;font-size:9px">Giriş yapınca canlı oda sohbeti burada çalışır.</div>';return;}
    window.__erisRoomSocket?.close?.();
    const socket=new WebSocket(window.ErisPlatform.getRealtimeUrl('/ws/rooms/'+encodeURIComponent(roomId)+'?token='+encodeURIComponent(token)));window.__erisRoomSocket=socket;
    const add=d=>{const e=document.createElement('div');e.className='eris-chat-msg'+(String(d.user_id||'')===String(localStorage.getItem('eris_user_id')||'')?' me':'');e.innerHTML='<b></b><span></span>';e.querySelector('b').textContent=String(d.user_id||'')===String(localStorage.getItem('eris_user_id')||'')?'Sen':(d.nickname||d.user_id||'Kullanıcı');e.querySelector('span').textContent=d.text||'';list.appendChild(e);list.scrollTop=list.scrollHeight;};
    socket.onopen=()=>{state.textContent='Canlı oda • sohbet bağlı';list.innerHTML='';};
    socket.onclose=()=>{if(document.getElementById('erisRoomSurface')?.classList.contains('show'))state.textContent='Oda • sohbet bağlantısı kapandı';};
    socket.onerror=()=>{state.textContent='Oda • sohbet bağlantı hatası';};
    socket.onmessage=ev=>{try{const d=JSON.parse(ev.data||'{}');if(d.type==='room_history')d.messages?.forEach(add);else if(d.type==='room_chat')add(d);else if(d.type==='room_chat_error')state.textContent='Oda • '+(d.message||'sohbet kapalı');}catch{}};
    const doSend=()=>{const t=input.value.trim();if(!t||socket.readyState!==1)return;if(t.length>500)return;socket.send(JSON.stringify({type:'room_chat',text:t}));input.value='';};
    send.onclick=doSend;input.onkeydown=e=>{if(e.key==='Enter')doSend();};
  }

  async function openRoom(roomId,name){
    const id=String(roomId||'');if(!id)return;
    window.ErisCurrentRoomId=id;window.currentRoomId=id;
    const surface=ensureRoomSurface();surface.classList.add('show');
    document.getElementById('erisLiveTitle').textContent=name||'Oda';document.getElementById('erisLiveMeta').textContent='Gerçek oda • bağlanıyor…';
    document.getElementById('erisLiveSeats').innerHTML='<div style="padding:30px;text-align:center;color:#aaa">8 koltuk hazırlanıyor…</div>';
    try{
      await window.ErisRoom?.join?.(id);const room=await window.ErisRoom?.get?.(id);if(!room)throw new Error('Oda bilgisi alınamadı');
      document.getElementById('erisLiveTitle').textContent=room.name||name||'Oda';
      document.getElementById('erisLiveMeta').textContent=Number(room.member_count||0)+' kişi • '+(room.locked?'🔒 Kilitli':'🟢 Açık')+' • 8 koltuk';
      renderRoomSeats(id,room.name||name,room.seats);attachRoomChat(id);window.connectRoomGiftSocket?.(id);
    }catch(e){
      if(id.startsWith('demo-room-')){document.getElementById('erisLiveMeta').textContent='Demo oda • 8 koltuk • sohbet görünümü';renderRoomSeats(id,name,Array.from({length:8},(_,i)=>({seat_number:i+1,user_id:i===0?'demo-owner':null,nickname:i===0?'Oda Sahibi':''})));const list=document.getElementById('erisLiveChat');list.innerHTML='<div class="eris-chat-msg"><b>Oda Sahibi</b><span>Hoş geldiniz 👋</span></div><div class="eris-chat-msg"><b>Rana</b><span>Oda hazır, koltuklardan birine oturabilirsiniz.</span></div>';return;}
      surface.classList.remove('show');window.toast?.(e.message||'Odaya bağlanılamadı.');
    }
  }

  function closeRealRoom(){
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    document.getElementById('realRoomModal')?.classList.remove('show');
    if(id) window.ErisRoom?.leave?.(id).catch(()=>{});
    window.disconnectRoomGiftSocket?.();
    window.ErisCurrentRoomId=null; window.currentRoomId=null;
  }
  window.openLiveRoomChat=()=>{const id=window.ErisCurrentRoomId||window.currentRoomId;if(!id){window.toast?.('Önce bir oda aç.');return}window.ERIS_DEMO_ROOM_ID=String(id);if(window.ErisDemoExtras?.roomChat){window.ErisDemoExtras.roomChat();}else{window.toast?.('Canlı sohbet arayüzü yükleniyor…');setTimeout(()=>window.ErisDemoExtras?.roomChat?.(),250);}};
  window.openRoom=openRoom;
  window.closeRealRoom=closeRealRoom;

  // Customer demo surfaces are part of the real room entrypoint so the firm-demo integrity check
  // and the room UI use the same loaded surface rather than a hidden/duplicate demo bootstrap.
  ['./full-demo-live.js','./demo-complete-live.js','./demo-extras-live.js'].forEach(file => {
    if (document.querySelector('script[data-eris-demo="'+file+'"]')) return;
    const s=document.createElement('script'); s.src=file; s.dataset.erisDemo=file; s.defer=true; document.head.appendChild(s);
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadRooms,{once:true}); else loadRooms();
})();
