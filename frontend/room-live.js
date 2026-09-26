(() => {
  const API = (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  async function loadRooms() {
    const targets = [...document.querySelectorAll('#realRooms,#rooms')]; if (!targets.length) return;
    if (!token()) { targets.forEach(el=>{el.textContent='Odaları görmek için giriş yap.'}); return; }
    try {
      const r = await fetch(`${API}/rooms`, { headers: headers() }); if (!r.ok) throw new Error(`rooms:${r.status}`);
      const data = await r.json(); const rooms = Array.isArray(data) ? data : (data.rooms || data.items || data.data || []);
      targets.forEach(el => { el.innerHTML=''; const shown=el.id==='rooms'?rooms.filter(room=>Number(room.member_count||0)>1):rooms; if (!shown.length) { el.innerHTML='<div class="card" style="padding:16px;color:#938a9f">Şu anda aktif oda yok.</div>'; return; }
        shown.forEach(room => { const id=room.id ?? room.room_id, name=room.name||room.title||'Oda', publicId=/^\d{12}$/.test(String(room.public_id||''))?String(room.public_id):'Oda ID yüklenemedi', count=room.member_count??room.members_count??room.online_count??0, owner=room.owner_name||room.owner||'ErisChat'; const b=document.createElement('button'); b.className='room card'; b.innerHTML='<div class="ava">🎙️<span class="online"></span></div><div class="grow roomText"><b></b><small class="room-meta"></small><small class="room-id"></small></div><span class="live">CANLI</span>'; b.querySelector('b').textContent=name; b.querySelector('.room-meta').textContent=`${count} kişi • ${owner}`; b.querySelector('.room-id').textContent=`ID: ${publicId}`; b.onclick=()=>{window.ErisCurrentRoomId=id;window.currentRoomId=id;window.__erisCurrentRoomUserId=localStorage.getItem('eris_user_id')||'';if(typeof window.openRoom==='function') window.openRoom(id,name); else window.toast?.(`${name} odasına bağlanılıyor…`)}; el.appendChild(b); });
      });
    } catch(e) { console.warn('[ErisChat] room list unavailable',e); targets.forEach(el=>{el.textContent=e.message||'Odalar yüklenemedi.'}); }
  }
  window.ErisChatRoomList={load:loadRooms};



  function ensureRoomSurface(){
    if(document.getElementById('erisRoomSurface')) return document.getElementById('erisRoomSurface');
    const style=document.createElement('style'); style.id='erisRoomSurfaceStyle';
    style.textContent=`
      #erisRoomSurface{position:fixed;inset:0;z-index:900;background:#05040a;color:#fff;display:none;overflow:hidden;font-family:Inter,system-ui,sans-serif}
      #erisRoomSurface.show{display:block}
      .eris-room-wall{position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,rgba(255,80,170,.16),transparent 30%),linear-gradient(145deg,#100a1c,#090813 48%,#150b19);background-position:center;background-size:cover;overflow:hidden}
      .eris-room-wall.has-wallpaper{background-image:var(--eris-room-wallpaper),linear-gradient(180deg,rgba(5,4,12,.18),rgba(5,4,12,.58))}
      .eris-room-wall:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,3,10,.12),rgba(4,3,10,.18) 45%,rgba(4,3,10,.72) 100%);pointer-events:none}
      .eris-room-top{position:absolute;left:0;right:0;top:0;min-height:72px;display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(180deg,rgba(4,3,10,.48),rgba(4,3,10,0));backdrop-filter:blur(10px);z-index:4}
      .eris-room-top:after{content:"";position:absolute;left:14px;right:14px;bottom:0;height:1px;background:linear-gradient(90deg,transparent,#ffffff18,transparent)}
      .eris-room-top .room-action{position:relative;z-index:1}
      .eris-room-top .room-action.back{font-size:25px;line-height:1}
      .eris-room-top button{border:1px solid #ffffff18;background:rgba(8,7,11,.55);color:#fff;border-radius:14px;width:42px;height:42px;box-shadow:0 8px 22px #0004}.eris-room-top button:active{transform:scale(.96)}
      .eris-room-title{flex:1;min-width:0}.eris-room-title b{display:block;font-size:15px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.eris-room-title small{display:block;color:#c0b7c7;font-size:9px;margin-top:4px}.eris-room-title .room-id{color:#8f879a}
      .eris-room-stage{position:absolute;inset:72px 0 205px;min-height:330px;overflow:hidden}.eris-room-stage:before{content:"";position:absolute;left:50%;top:48%;width:min(310px,58vw);aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(255,79,163,.10),rgba(117,76,255,.06) 42%,transparent 70%);filter:blur(2px);pointer-events:none}.eris-room-core{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:96px;height:96px;border-radius:50%;display:grid;place-items:center;text-align:center;border:1px solid #ffffff16;background:rgba(10,7,18,.18);box-shadow:0 0 60px rgba(117,76,255,.18),inset 0 0 30px rgba(255,255,255,.035);backdrop-filter:blur(5px);z-index:1}.eris-room-core b{font-size:10px}.eris-room-core small{display:block;color:#aaa0b0;font-size:7px;margin-top:3px}
      .eris-seat{position:absolute;transform:translate(-50%,-50%);width:82px;height:82px;border-radius:50%;border:1px solid #ffffff2c;background:rgba(22,16,34,.30);box-shadow:0 12px 32px #0008,inset 0 0 20px #ffffff09;color:#fff;display:grid;place-items:center;text-align:center;padding:5px;z-index:3;backdrop-filter:blur(7px);transition:transform .18s,border-color .18s,box-shadow .18s}.eris-seat:hover{transform:translate(-50%,-50%) scale(1.05);border-color:#ffffff55}.eris-seat.occupied{background:rgba(25,18,39,.34)}
      .eris-seat.empty{border-style:dashed;background:radial-gradient(circle,#8a5cff22,#0d0a12 70%);color:#c9bfd2}.eris-seat.me{border-color:#ff5bad;box-shadow:0 0 0 4px #ff4fa31a,0 12px 35px #0008}.eris-seat.locked{opacity:.42;cursor:not-allowed}
      [data-seat-count="12"] .eris-seat,[data-seat-count="16"] .eris-seat{width:72px;height:72px}
      [data-seat-count="16"] .eris-seat{width:58px;height:58px}
      [data-seat-count="12"] .eris-seat .seat-ava{width:30px;height:30px;font-size:14px}
      [data-seat-count="16"] .eris-seat .seat-ava{width:24px;height:24px;font-size:11px}
      .eris-seat .seat-ava{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#8a5cff,#ff4fa3);font-size:16px;margin:auto;overflow:hidden;border:1px solid #ffffff28}.eris-seat .seat-ava.avatar{background-size:cover;background-position:center}.eris-seat.empty .seat-ava{background:rgba(255,255,255,.055);color:#aaa0ad}
      .eris-seat b{display:block;font-size:9px;max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.eris-seat small{display:block;color:#a69cad;font-size:7px;margin-top:2px}
      .eris-room-chat{position:absolute;left:0;right:0;bottom:0;height:224px;background:linear-gradient(180deg,rgba(5,4,10,0) 0%,rgba(5,4,10,.52) 18%,rgba(5,4,10,.86) 100%);backdrop-filter:blur(9px);z-index:5;display:flex;flex-direction:column}.eris-room-chat:before{content:"";position:absolute;left:14px;right:14px;top:0;height:1px;background:linear-gradient(90deg,transparent,#ffffff18,transparent)}
      .eris-chat-list{flex:1;overflow:auto;padding:30px 14px 7px;display:flex;flex-direction:column;gap:6px}
      .eris-chat-msg{max-width:82%;padding:8px 11px;border-radius:13px;background:rgba(23,18,30,.62);border:1px solid #ffffff0b;font-size:10px;backdrop-filter:blur(6px)}.eris-chat-msg.me{align-self:flex-end;background:linear-gradient(135deg,#754cffcc,#ff4fa3cc)}.eris-chat-msg b{font-size:8px;color:#d5cbdc}.eris-chat-msg span{display:block;margin-top:2px}
      .eris-room-compose{display:flex;gap:7px;padding:9px 12px 13px}.eris-room-compose input{flex:1;min-width:0;border:1px solid #ffffff14;background:rgba(12,10,18,.68);color:#fff;border-radius:15px;padding:12px 13px;outline:none;backdrop-filter:blur(8px)}.eris-room-compose input::placeholder{color:#8e8795}.eris-room-compose button{border:0;border-radius:15px;padding:0 16px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:900;box-shadow:0 8px 24px #754cff30}
      .eris-room-tools{position:absolute;right:12px;bottom:242px;z-index:8;display:flex;gap:7px}.eris-room-tools button{border:1px solid #ffffff18;background:rgba(8,7,11,.46);color:#fff;border-radius:50%;width:44px;height:44px;font-size:15px;backdrop-filter:blur(8px);box-shadow:0 8px 22px #0005}.eris-room-tools #erisRoomMic{font-size:0}.eris-room-tools #erisRoomMic:after{content:"🎙️";font-size:17px}
      @media(max-width:520px){.eris-seat{width:70px;height:70px}.eris-room-core{width:82px;height:82px}.eris-room-stage{inset:72px 0 224px}.eris-room-tools{bottom:240px}.eris-room-chat{height:224px}}
      @media(min-width:760px){.eris-room-stage{left:50%;right:auto;width:min(900px,100%);transform:translateX(-50%)}.eris-room-chat{left:50%;right:auto;width:min(900px,100%);transform:translateX(-50%)}.eris-room-tools{right:max(12px,calc((100% - 900px)/2 + 12px))}}
    `;
    document.head.appendChild(style);
    const s=document.createElement('section');s.id='erisRoomSurface';
    s.innerHTML='<div class="eris-room-wall"></div><div class="eris-room-top"><button class="room-action back" id="erisRoomBack" aria-label="Geri">‹</button><div class="eris-room-title"><b id="erisLiveTitle">Oda</b><small id="erisLiveMeta">Bağlanıyor…</small></div><button class="room-action" id="erisRoomGift" aria-label="Hediyeler">🎁</button><button class="room-action" id="erisRoomMusic" aria-label="Müzik">🎵</button></div><div class="eris-room-stage" id="erisLiveSeats"><div class="eris-room-core"><div><b>CANLI ODA</b><small>sohbete katıl</small></div></div><div style="padding:30px;text-align:center;color:#aaa">Koltuklar hazırlanıyor…</div></div><div class="eris-room-tools"><button id="erisRoomMic">🎙️ Mikrofon</button><button id="erisRoomMore">•••</button></div><div class="eris-room-chat"><div class="eris-chat-list" id="erisLiveChat"><div style="color:#938a9f;font-size:9px">Oda sohbetine bağlanılıyor…</div></div><div class="eris-room-compose"><input id="erisLiveInput" maxlength="500" placeholder="Odaya mesaj yaz…"><button id="erisLiveSend">Gönder</button></div></div>';
    document.body.appendChild(s);
    s.querySelector('#erisRoomBack').onclick=window.closeRealRoom;
    s.querySelector('#erisRoomMusic').onclick=()=>window.ErisChatMusic?.open?.();
    s.querySelector('#erisRoomGift').onclick=()=>window.openRoomGift?.(window.ErisCurrentRoomId||window.currentRoomId);
    s.querySelector('#erisRoomMore').onclick=()=>{const p=window.__erisRoomPermissions||{};if(p.is_owner||p.is_moderator||p.can_manage) window.ErisRoomCompleteV3?.openMenu?.('settings');};
    s.querySelector('#erisRoomMic').onclick=()=>window.toast?.('Mikrofon: gerçek oda RTC bağlantısı için koltuğa oturun.');
    return s;
  }

  function roomPasswordModal(message=''){
    return new Promise(resolve=>{
      document.getElementById('eris-room-password-modal')?.remove();
      const wrap=document.createElement('div');wrap.id='eris-room-password-modal';
      const errText=message?'Şifre yanlış. Tekrar dene.':'';
      wrap.innerHTML='<div class="erp-backdrop"></div><div class="erp-box"><button class="erp-x" aria-label="Kapat">×</button><div class="erp-title">🔒 Oda şifresi</div><div class="erp-sub">4 haneli şifreyi gir</div><div class="erp-cells"><input maxlength="1" inputmode="numeric" class="erp-cell"><input maxlength="1" inputmode="numeric" class="erp-cell"><input maxlength="1" inputmode="numeric" class="erp-cell"><input maxlength="1" inputmode="numeric" class="erp-cell"></div><div class="erp-error">'+errText+'</div><button class="erp-ok">Tamam</button></div>';
      const st=document.createElement('style');st.textContent='#eris-room-password-modal{position:fixed;inset:0;z-index:6000;display:grid;place-items:center}.erp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.58);backdrop-filter:blur(8px)}.erp-box{position:relative;width:min(330px,calc(100% - 40px));padding:20px;border-radius:18px;background:rgba(72,72,78,.95);border:1px solid rgba(255,255,255,.18);box-shadow:0 24px 80px #000b;text-align:center}.erp-x{position:absolute;right:9px;top:8px;width:30px;height:30px;border:0;border-radius:9px;background:rgba(255,255,255,.08);color:#fff;font-size:20px}.erp-title{font-size:14px;font-weight:900}.erp-sub{margin-top:6px;font-size:9px;color:#d5d1d8}.erp-cells{display:flex;justify-content:center;gap:8px;margin:18px 0}.erp-cell{width:48px;height:52px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;text-align:center;font-size:24px;outline:none}.erp-cell:focus{border-color:#ff5bad}.erp-error{min-height:18px;color:#ff9dbd;font-size:9px}.erp-ok{width:100%;height:42px;border:0;border-radius:12px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:900}';wrap.appendChild(st);document.body.appendChild(wrap);
      const cells=[...wrap.querySelectorAll('.erp-cell')],err=wrap.querySelector('.erp-error');let done=false;const finish=v=>{if(done)return;done=true;wrap.remove();resolve(v)};
      wrap.querySelector('.erp-x').onclick=()=>finish(null);wrap.querySelector('.erp-backdrop').onclick=()=>finish(null);
      cells.forEach((c,i)=>{c.oninput=()=>{c.value=c.value.replace(/\D/g,'').slice(0,1);if(c.value&&cells[i+1])cells[i+1].focus()};c.onkeydown=e=>{if(e.key==='Backspace'&&!c.value&&cells[i-1])cells[i-1].focus();if(e.key==='Enter')wrap.querySelector('.erp-ok').click()}});
      wrap.querySelector('.erp-ok').onclick=()=>{const v=cells.map(x=>x.value).join('');if(!/^\d{4}$/.test(v)){err.textContent='Tam 4 hane gir.';return}finish(v)};cells[0].focus();
    });
  }
  window.ErisRoomPasswordModal=roomPasswordModal;
  function seatLayout(count,index){
    const centerY=count<=8?46:49, radiusX=count<=8?36:(count===12?41:44), radiusY=count<=8?34:(count===12?37:40);
    const angle=(-90+(360/count)*index)*Math.PI/180;
    return {left:(50+Math.cos(angle)*radiusX).toFixed(2)+'%',top:(centerY+Math.sin(angle)*radiusY).toFixed(2)+'%'};
  }
  function seatCountForRoom(room,list){
    const fromList=Array.isArray(list)?list.length:0;
    if(fromList>=16)return 16;
    if(fromList>=12)return 12;
    if(fromList>=8)return 8;
    const level=Number(room?.level||1);
    return level>=7?16:(level>=5?12:8);
  }
  function applyRoomWallpaper(){
    const wall=document.querySelector('#erisRoomSurface .eris-room-wall');if(!wall)return;
    const key=window.ErisChatCosmetics?.state?.user?.wallpaper_asset;
    const raw=typeof key==='string'?key:(key?.url||key?.src||key?.asset_url||key?.path||key?.asset_key||'');
    const url=raw&&window.ErisChatCosmetics?.assetUrl?window.ErisChatCosmetics.assetUrl(raw):raw;
    if(url){wall.style.setProperty('--eris-room-wallpaper','url("'+url.replace(/"/g,'%22')+'")');wall.classList.add('has-wallpaper');}
    else{wall.style.removeProperty('--eris-room-wallpaper');wall.classList.remove('has-wallpaper');}
  }
  window.addEventListener('erischat:cosmetics-updated',()=>{
    if(document.getElementById('erisRoomSurface')?.classList.contains('show')) applyRoomWallpaper();
  });
  function renderRoomSeats(roomId,name,list,forcedCount){
    const box=document.getElementById('erisLiveSeats');if(!box)return;
    const count=Math.min(16,Math.max(8,Number(forcedCount)||seatCountForRoom(null,list)));
    const seats=(Array.isArray(list)?list:[]).slice(0,count);
    while(seats.length<count)seats.push({seat_number:seats.length+1,user_id:null,locked:false});
    box.innerHTML='';box.dataset.seatCount=String(count);
    seats.forEach((seat,i)=>{
      const num=seat.seat_number??i+1;
      const occupied=!!seat.user_id;
      const locked=!!seat.locked;
      const currentId=window.ErisCurrentUserId||localStorage.getItem('eris_user_id')||String(window.__erisCurrentRoomUserId||'');
      const isMe=occupied&&String(seat.user_id)===String(currentId);
      const user=seat.user||seat.profile||{};
      const avatarRaw=seat.avatar_url||seat.avatar_asset||seat.avatar||seat.profile_image||seat.photo_url||seat.user_avatar||user.avatar_url||user.avatar_asset||user.avatar||user.profile_image||(isMe?window.ErisChatCosmetics?.state?.user?.avatar_asset:'')||'';
      const frameRaw=seat.frame_url||seat.frame_asset||seat.frame||seat.profile_frame||seat.user_frame||user.frame_url||user.frame_asset||user.frame||(isMe?window.ErisChatCosmetics?.state?.user?.frame_asset:'')||'';
      const avatarUrl=avatarRaw&&window.ErisChatCosmetics?.assetUrl?window.ErisChatCosmetics.assetUrl(avatarRaw):avatarRaw;
      const frameUrl=frameRaw&&window.ErisChatCosmetics?.assetUrl?window.ErisChatCosmetics.assetUrl(frameRaw):frameRaw;
      const b=document.createElement('button');b.type='button';
      const pos=seatLayout(count,i);
      b.style.left=pos.left;b.style.top=pos.top;
      b.dataset.seatNumber=String(num);b.dataset.userId=String(seat.user_id||'');
      b.className='eris-seat'+(occupied?' occupied':' empty')+(locked?' locked':'')+(isMe?' me':'');
      b.setAttribute('aria-label',occupied?(seat.nickname||seat.user_name||'Konuşmacı'):'Koltuk '+num);
      b.innerHTML='<div class="seat-pod"><div class="seat-ava">'+(occupied?'👤':locked?'🔒':'＋')+'</div><div class="seat-frame"></div><span class="seat-mic">🎙</span><b></b><small></small></div>';
      if(avatarUrl){
        const ava=b.querySelector('.seat-ava');
        ava.textContent='';
        ava.classList.add('avatar');
        ava.style.backgroundImage='url("'+String(avatarUrl).replace(/"/g,'%22')+'")';
      }
      if(frameUrl){
        const frame=b.querySelector('.seat-frame');
        frame.style.backgroundImage='url("'+String(frameUrl).replace(/"/g,'%22')+'")';
        frame.classList.add('has-frame');
      }
      b.querySelector('b').textContent=occupied?(seat.nickname||seat.user_name||(isMe?'Sen':'Kullanıcı')):'Koltuk '+num;
      b.querySelector('small').textContent=locked?'Kilitli':occupied?(isMe?'Sen':'Konuşmacı'):'Boş • otur';
      if(occupied && seat.user_id){b.onclick=()=>window.openUserProfile?.(seat.user_id);b.title='Profili aç';}else if(!occupied&&!locked)b.onclick=async()=>{
        try{await window.ErisRoom.joinSeat(roomId,num);await openRoom(roomId,name)}
        catch(e){window.toast?.(e.message||'Koltuk alınamadı.')}
      };
      box.appendChild(b);
    });
  }
  function attachRoomChat(roomId){
    const list=document.getElementById('erisLiveChat'),state=document.getElementById('erisLiveMeta'),input=document.getElementById('erisLiveInput'),send=document.getElementById('erisLiveSend');
    if(!list||!window.ErisPlatform?.getRealtimeUrl)return;
    const token=window.ErisPlatform.getAccessToken?.(); if(!token){list.innerHTML='<div style="color:#ff9bc9;font-size:9px">Giriş yapınca canlı oda sohbeti burada çalışır.</div>';return;}
    window.__erisRoomSocket?.close?.();
    const socket=new WebSocket(window.ErisPlatform.getRealtimeUrl('/ws/rooms/'+encodeURIComponent(roomId)),['erischat','token.'+token]);window.__erisRoomSocket=socket;
    const add=d=>{const e=document.createElement('div');e.className='eris-chat-msg'+(String(d.user_id||'')===String(localStorage.getItem('eris_user_id')||'')?' me':'');e.innerHTML='<b></b><span></span>';e.querySelector('b').textContent=String(d.user_id||'')===String(localStorage.getItem('eris_user_id')||'')?'Sen':(d.nickname||d.user_id||'Kullanıcı');e.querySelector('span').textContent=d.text||'';list.appendChild(e);list.scrollTop=list.scrollHeight;};
    socket.onopen=()=>{state.textContent='Canlı oda • sohbet bağlı';list.innerHTML='';};
    socket.onclose=()=>{if(window.__erisRoomSocket===socket){window.ErisRoomRTC?.stop?.();if(document.getElementById('erisRoomSurface')?.classList.contains('show'))state.textContent='Oda • sohbet bağlantısı kapandı';}};
    socket.onerror=()=>{state.textContent='Oda • sohbet bağlantı hatası';};
    socket.onmessage=ev=>{try{const d=JSON.parse(ev.data||'{}');if(d.type==='room_history')d.messages?.forEach(add);else if(d.type==='room_chat')add(d);else if(d.type==='room_chat_error')state.textContent='Oda • '+(d.message||'sohbet kapalı');else if(d.type.startsWith('rtc_'))window.ErisRoomRTC?.message?.(d);}catch{}};
    const doSend=()=>{const t=input.value.trim();if(!t||socket.readyState!==1)return;if(t.length>500)return;socket.send(JSON.stringify({type:'room_chat',text:t}));input.value='';};
    send.onclick=doSend;input.onkeydown=e=>{if(e.key==='Enter')doSend();};
  }

  async function openRoom(roomId,name){
    const id=String(roomId||'');if(!id)return;
    window.ErisCurrentRoomId=id;window.currentRoomId=id;
    const surface=ensureRoomSurface();surface.classList.add('show');applyRoomWallpaper();
    document.getElementById('erisLiveTitle').textContent=name||'Oda';
    document.getElementById('erisLiveMeta').textContent='Gerçek oda • bağlanıyor…';
    document.getElementById('erisLiveSeats').innerHTML='<div style="padding:30px;text-align:center;color:#aaa">Koltuklar hazırlanıyor…</div>';

    // Live API calls get a hard client-side timeout so the room surface can never remain
    // in an endless "bağlanıyor" state when Railway/network/auth is unavailable.
    const withTimeout=(promise,ms=8000)=>Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Oda sunucusuna bağlantı zaman aşımına uğradı.')),ms))
    ]);
    try{
      try{
        let joined=false,attemptMessage='';
        for(let attempt=0;attempt<3&&!joined;attempt++){
          try{await withTimeout(window.ErisRoom?.join?.(id),8000);joined=true;}
          catch(joinError){
            if(!/şifre|kilitli|password/i.test(String(joinError.message||''))) throw joinError;
            const pass=await window.ErisRoomPasswordModal?.(attemptMessage); if(pass===null) throw joinError;
            try{await withTimeout(window.ErisRoom?.join?.(id,String(pass).trim()),8000);joined=true;}
            catch(e){if(!/şifre|kilitli|password/i.test(String(e.message||''))) throw e;attemptMessage='wrong';}
          }
        }
        if(!joined) throw new Error('Oda şifresi 3 kez yanlış girildi.');
      }catch(joinError){throw joinError;}
      const room=await withTimeout(window.ErisRoom?.get?.(id),8000);
      if(!room)throw new Error('Oda bilgisi alınamadı');
      document.getElementById('erisLiveTitle').textContent=room.name||name||'Oda';
      const seatCount=Math.min(16,Math.max(8,Number(room.seat_count)||seatCountForRoom(room,room.seats)));applyRoomWallpaper();
      const liveRoomId=String(room.id||id);
      if(room.current_user_id) { window.ErisCurrentUserId=String(room.current_user_id); window.__erisCurrentRoomUserId=String(room.current_user_id); } window.__erisRoomPermissions={is_owner:!!room.is_owner,is_moderator:!!room.is_moderator,can_manage:!!room.can_manage,current_user_seat:room.current_user_seat};
      const publicRoomId=/^\d{12}$/.test(String(room.public_id||''))?String(room.public_id):'Oda ID yüklenemedi';
      document.getElementById('erisLiveMeta').textContent='ID: '+publicRoomId;
      document.getElementById('erisLiveMeta').dataset.roomNameMeta='ID: '+publicRoomId;
      const levelButton=document.getElementById('erisRoomLevel');
      if(levelButton)levelButton.innerHTML='<b>Seviye '+Number(room.level||1)+'</b><small>'+seatCount+' koltuk</small>';
      renderRoomSeats(liveRoomId,room.name||name,room.seats,seatCount);attachRoomChat(liveRoomId);window.connectRoomGiftSocket?.(liveRoomId); const giftButton=document.getElementById('erisRoomGift'); if(giftButton) giftButton.onclick=()=>window.openRoomGift?.(liveRoomId); const moreButton=document.getElementById('erisRoomMore'); if(moreButton) moreButton.onclick=()=>{const p=window.__erisRoomPermissions||{}; if(p.is_owner||p.is_moderator||p.can_manage) window.ErisRoomCompleteV3?.openMenu?.('settings'); else window.toast?.('Bu odada yönetim yetkiniz yok.');};
      window.dispatchEvent(new CustomEvent('erischat:room-opened',{detail:{room}}));
    }catch(e){
      surface.classList.remove('show');window.toast?.(e.message||'Odaya bağlanılamadı.');
    }
  }

  function closeRealRoom(){
    window.ErisRoomRTC?.stop?.();
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    document.getElementById('erisRoomSurface')?.classList.remove('show');
    window.__erisRoomSocket?.close?.(); window.__erisRoomSocket=null;
    if(id) window.ErisRoom?.leave?.(id).catch(()=>{});
    window.disconnectRoomGiftSocket?.();
    window.ErisCurrentRoomId=null; window.currentRoomId=null;
  }
  window.openLiveRoomChat=()=>{
    const surface=document.getElementById('erisRoomSurface');
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    if(!id||!surface?.classList.contains('show')){window.toast?.('Önce bir oda aç.');return}
    const chatTab=surface.querySelector('.erc-chat-tabs [data-chat="chat"]');
    chatTab?.click();
    surface.querySelector('.eris-room-chat')?.scrollIntoView?.({block:'nearest'});
  };
  window.addEventListener('erischat:cosmetics-updated',applyRoomWallpaper);
  window.openRoom=openRoom;
  window.closeRealRoom=closeRealRoom;

  window.addEventListener('erischat:auth',event=>{
    if(event.detail?.state==='ready'||event.detail?.state==='logged_out')loadRooms();
  });

  window.addEventListener('pagehide',()=>{
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    if(id&&document.getElementById('erisRoomSurface')?.classList.contains('show')){
      fetch(`${API}/rooms/${encodeURIComponent(id)}/leave`,{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});
    }
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadRooms,{once:true}); else loadRooms();
})();
