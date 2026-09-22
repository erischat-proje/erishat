/* ErisChat customer demo extras: visualize remaining product surfaces without pretending unavailable backend is live. */
(() => {
  'use strict';
  if (window.__ERIS_DEMO_EXTRAS__) return;
  window.__ERIS_DEMO_EXTRAS__ = true;

  const api = (path, options = {}) => window.ErisPlatform?.api ? window.ErisPlatform.api(path, options) : Promise.reject(new Error('Platform hazır değil'));
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const asset = key => window.ErisChatCosmetics?.assetUrl ? window.ErisChatCosmetics.assetUrl(key) : `Gereken_icerikler/${String(key || '').replace(/^\//,'')}`;
  const card = html => `<div style="background:#12101a;border:1px solid #ffffff12;border-radius:15px;padding:11px">${html}</div>`;
  const button = (text, fn) => { const b=document.createElement('button'); b.textContent=text; b.style.cssText='border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;padding:9px 10px;font-size:9px;font-weight:800'; b.onclick=fn; return b; };
  const modal = (title, body) => { const el=document.createElement('div'); el.style.cssText='position:fixed;inset:0;z-index:520;background:#020107ed;display:flex;align-items:flex-end;justify-content:center'; el.innerHTML=`<div style="width:min(620px,100%);max-height:94vh;overflow:auto;background:#0a0810;color:#fff;border:1px solid #ffffff18;border-radius:26px 26px 0 0;padding:16px;font-family:inherit"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:8px;letter-spacing:1.3px;color:#938a9f">ERISCHAT • CUSTOMER DEMO+</div><h2 style="margin:4px 0 12px;font-size:20px">${esc(title)}</h2></div><button data-close style="border:0;border-radius:11px;background:#ffffff0b;color:#fff;width:36px;height:36px">×</button></div><div id="demoExtraBody">${body}</div></div>`; document.body.append(el); el.querySelector('[data-close]').onclick=()=>el.remove(); return el; };

  async function seatsDemo(){
    let roomId='', seats=[], socket=null, stream=null, peers=new Map(), pendingIce=new Map(), me='', rtcConfig={iceServers:[]};
    try { const rooms=await api('/rooms'); const arr=Array.isArray(rooms)?rooms:(rooms?.rooms||[]); roomId=arr[0]?.id||arr[0]?.room_id||''; const meData=await api('/me'); me=meData?.id||''; if(roomId){ seats=await api('/rooms/'+encodeURIComponent(roomId)+'/seats'); rtcConfig=await api('/rooms/'+encodeURIComponent(roomId)+'/rtc-config'); } else loadError='Kullanılabilir oda bulunamadı.'; } catch(e){loadError=e?.message||'Oda/RTC servisine erişilemedi.';}
    const m=modal('🎙️ Oda koltukları + gerçek ses',`<div style="padding:11px;border-radius:14px;background:#8a5cff10;border:1px solid #ffffff10;margin-bottom:9px"><b>12 koltuk</b><small id="rtcStatus" style="display:block;color:#938a9f;margin-top:4px">${esc(loadError|| (roomId?'Oda bağlı':'Oda bulunamadı'))} • Mikrofon kapalı</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px" id="rtcControls"></div><div id="seatGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:7px"></div><div id="remoteAudio"></div>`);
    const grid=m.querySelector('#seatGrid'), status=m.querySelector('#rtcStatus'), controls=m.querySelector('#rtcControls');
    const say=s=>{status.textContent=s};
    const render=()=>{grid.innerHTML=seats.map(s=>card('<div style="display:flex;justify-content:space-between"><b>🎙️ '+s.seat_number+'. '+esc(s.user_id||'Boş')+'</b><span>'+ (s.user_id?'DOLU':'BOŞ')+'</span></div><small style="display:block;color:#938a9f;margin-top:4px">'+(s.muted?'🔇 Susturuldu':'🎤 Mikrofon açık')+(s.locked?' • 🔒 Kilitli':'')+'</small>')).join('')};
    render();
    controls.append(button('🎤 Mikrofonu aç',async()=>{try{stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false}); const mine=seats.find(s=>s.user_id===me); if(mine?.muted) stream.getAudioTracks().forEach(t=>t.enabled=false); peers.forEach(pc=>stream.getTracks().forEach(t=>{if(!pc.getSenders().some(s=>s.track?.kind===t.kind))pc.addTrack(t,stream)})); say(mine?.muted?'🔇 Moderatör susturması aktif':'🎤 Mikrofon açık • signaling hazır');}catch(e){say('❌ Mikrofon izni alınamadı');}}));
    controls.append(button('⏹ Mikrofonu kapat',()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;peers.forEach(pc=>pc.getSenders().filter(s=>s.track?.kind==='audio').forEach(s=>pc.removeTrack(s)));say('🎤 Mikrofon kapalı')}));
    controls.append(button('🔄 Koltukları yenile',async()=>{if(roomId){try{seats=await api('/rooms/'+encodeURIComponent(roomId)+'/seats');const mine=seats.find(s=>s.user_id===me);if(mine?.muted&&stream)stream.getAudioTracks().forEach(t=>t.enabled=false);render();}catch(e){}}}));
    const connect=()=>{ if(!roomId||socket||!window.ErisPlatform?.getAccessToken)return; const token=window.ErisPlatform.getAccessToken(); if(!token){say('🔐 Oturum tokenı yok');return;} socket=new WebSocket(window.ErisPlatform.getRealtimeUrl('/ws/rooms/'+encodeURIComponent(roomId)+'?token='+encodeURIComponent(token))); socket.onopen=()=>say('🟢 Oda signaling bağlantısı açık'); socket.onclose=()=>{socket=null;say('⚪ Signaling bağlantısı kapandı')}; socket.onerror=()=>say('❌ Signaling bağlantı hatası'); socket.onmessage=async ev=>{const d=JSON.parse(ev.data||'{}'); if(!d.type?.startsWith('rtc_')||d.to_user_id!==me)return; if(d.type==='rtc_leave'){const pc=peers.get(d.from_user_id);if(pc){pc.close();peers.delete(d.from_user_id);}const a=m.querySelector('[data-audio="'+d.from_user_id+'"]');a?.remove();say('⚪ Konuşmacı bağlantıyı kapattı');return;} if(d.type==='rtc_offer'){const pc=makePeer(d.from_user_id); await pc.setRemoteDescription(d.payload); const queued=pendingIce.get(d.from_user_id)||[]; for(const candidate of queued){try{await pc.addIceCandidate(candidate)}catch(e){}} pendingIce.delete(d.from_user_id); const ans=await pc.createAnswer(); await pc.setLocalDescription(ans); socket.send(JSON.stringify({type:'rtc_answer',to_user_id:d.from_user_id,payload:pc.localDescription}));} else if(d.type==='rtc_answer'){const pc=peers.get(d.from_user_id); if(pc) await pc.setRemoteDescription(d.payload);} else if(d.type==='rtc_ice'){const pc=peers.get(d.from_user_id); if(pc&&d.payload){if(pc.remoteDescription)try{await pc.addIceCandidate(d.payload)}catch(e){}else{const q=pendingIce.get(d.from_user_id)||[];q.push(d.payload);pendingIce.set(d.from_user_id,q);}}} };
    };
    const makePeer=uid=>{let pc=peers.get(uid); if(pc)return pc; pc=new RTCPeerConnection(rtcConfig); if(stream)stream.getTracks().forEach(t=>pc.addTrack(t,stream)); pc.onicecandidate=e=>{if(e.candidate&&socket)socket.send(JSON.stringify({type:'rtc_ice',to_user_id:uid,payload:e.candidate}))}; pc.ontrack=e=>{let a=document.querySelector('[data-audio="'+uid+'"]');if(!a){a=document.createElement('audio');a.autoplay=true;a.dataset.audio=uid;m.querySelector('#remoteAudio').append(a)}a.srcObject=e.streams[0]}; pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){pc.close();peers.delete(uid)}}; peers.set(uid,pc); return pc};
    const call=async uid=>{if(!stream){say('Önce mikrofonu aç');return;} connect(); if(!socket||socket.readyState!==WebSocket.OPEN){say('🟡 Signaling bağlantısı hazırlanıyor');return;} const pc=makePeer(uid); const offer=await pc.createOffer(); await pc.setLocalDescription(offer); socket.send(JSON.stringify({type:'rtc_offer',to_user_id:uid,payload:pc.localDescription}));};
    controls.append(button('📞 İlk konuşmacıya bağlan',()=>{const target=seats.find(s=>s.user_id&&s.user_id!==me); if(target)call(target.user_id); else say('Bağlanılacak başka konuşmacı yok')}));
    connect();
    m.querySelector('[data-close]').addEventListener('click',()=>{try{peers.forEach((pc,uid)=>{try{socket?.send(JSON.stringify({type:'rtc_leave',to_user_id:uid}) )}catch(e){}});}catch(e){} stream?.getTracks().forEach(t=>t.stop()); peers.forEach(pc=>pc.close()); peers.clear(); pendingIce.clear(); if(socket){socket.close();socket=null;}});
  }

  async function roomChatDemo(){
    let roomId='',socket=null,me='',loadError='';
    try{
      const preferred=String(window.ERIS_DEMO_ROOM_ID||'').trim();
      const rooms=await api('/rooms'); const arr=Array.isArray(rooms)?rooms:(rooms?.rooms||[]);
      roomId=preferred || arr[0]?.id || arr[0]?.room_id || ''; const md=await api('/me'); me=md?.id||'';
      if(!roomId)loadError='Kullanılabilir oda bulunamadı.';
    }catch(e){loadError=e?.message||'Oda servisine erişilemedi.';}
    const m=modal('💬 Oda sohbeti + gerçek zamanlı',`<div style="display:flex;gap:7px;margin-bottom:8px;flex-wrap:wrap"><span style="padding:8px 10px;border-radius:10px;background:#8a5cff18">${esc(roomId?'Oda bağlı':'Oda bulunamadı')}</span><span id="chatState" style="padding:8px 10px;border-radius:10px;background:#ffffff08">${esc(loadError||'Bağlanıyor…')}</span><button id="chatRetry" style="border:1px solid #ffffff12;background:#ffffff08;color:#fff;border-radius:9px;padding:7px 9px">↻ Yenile</button></div><div id="chatList" style="height:300px;overflow:auto;background:#08070c;border:1px solid #ffffff12;border-radius:12px;padding:8px"></div><div style="display:flex;gap:6px;margin-top:8px"><input id="chatInput" maxlength="500" placeholder="Mesaj yaz…" style="flex:1;padding:10px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"><button id="chatSend" style="border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;padding:9px 12px;font-weight:800">Gönder</button></div>`);
    const list=m.querySelector('#chatList'),state=m.querySelector('#chatState'),input=m.querySelector('#chatInput');
    const add=d=>{const el=document.createElement('div');el.style.cssText='padding:7px 8px;border-bottom:1px solid #ffffff0a;font-size:10px';el.innerHTML='<b>'+esc(d.user_id===me?'Sen':d.user_id||'Kullanıcı')+'</b><small style="display:block;color:#938a9f;margin-top:2px">'+esc(d.text||'')+'</small>';list.append(el);list.scrollTop=list.scrollHeight;};
    const connect=()=>{if(!roomId){state.textContent='⚪ Oda yok';return}if(socket||!window.ErisPlatform?.getAccessToken)return;const token=window.ErisPlatform.getAccessToken();if(!token){state.textContent='🔐 Token yok';return;}socket=new WebSocket(window.ErisPlatform.getRealtimeUrl('/ws/rooms/'+encodeURIComponent(roomId)+'?token='+encodeURIComponent(token)));socket.onopen=()=>state.textContent='🟢 Canlı';socket.onclose=()=>{socket=null;state.textContent='⚪ Kapalı'};socket.onerror=()=>state.textContent='❌ Bağlantı hatası';socket.onmessage=ev=>{try{const d=JSON.parse(ev.data||'{}');if(d.type==='room_history')d.messages?.forEach(add);else if(d.type==='room_chat')add(d);else if(d.type==='room_chat_error')state.textContent='🔇 '+(d.message||'Sohbet engellendi')}catch(e){}};};
    m.querySelector('#chatRetry').onclick=()=>{window.ErisDemoExtras?.roomChat?.();m.remove();};
    m.querySelector('#chatSend').onclick=()=>{const text=input.value.trim();if(!text||!socket||socket.readyState!==1){state.textContent=socket?'⚪ Sohbet bağlantısı hazır değil':'⚪ Önce canlı bağlantı kurulmalı';return;}if(text.length>500)return;socket.send(JSON.stringify({type:'room_chat',text}));input.value='';};
    input.addEventListener('keydown',e=>{if(e.key==='Enter')m.querySelector('#chatSend').click()});
    m.querySelector('[data-close]').addEventListener('click',()=>{socket?.close();socket=null});
    connect();
  }

  async function musicDemo(){
    let roomId='', queue=[], loadError='';
    try { const rooms=await api('/rooms'); const arr=Array.isArray(rooms)?rooms:(rooms?.rooms||[]); roomId=arr[0]?.id||arr[0]?.room_id||''; if(roomId){ const r=await api('/rooms/'+encodeURIComponent(roomId)+'/music'); queue=Array.isArray(r)?r:(r?.music||r?.items||[]); } else loadError='Kullanılabilir oda bulunamadı.'; } catch(e){loadError=e?.message||'Müzik servisine erişilemedi.';}
    const state={current:null,audio:null,socket:null};
    const render=()=>queue.map((x,i)=>card('<div style="display:flex;justify-content:space-between;gap:8px"><div><b>🎵 '+esc(x.title)+'</b><small style="display:block;color:#938a9f;margin-top:3px">'+esc(x.source_url)+'</small></div><button data-play-item="'+x.id+'" style="border:0;border-radius:9px;background:#ffffff0b;color:#fff;padding:6px 8px">'+(x.is_playing?'⏸':'▶')+'</button></div>')).join('<div style="height:6px"></div>') || card('<small style="color:#938a9f">Bu odada kayıtlı müzik yok.</small>');
    const body='<div style="display:flex;gap:7px;margin-bottom:9px;flex-wrap:wrap"><span style="padding:8px 10px;border-radius:10px;background:#8a5cff18">🎵 Gerçek kuyruk</span><span id="musicRoom" style="padding:8px 10px;border-radius:10px;background:#ffffff08">'+esc(loadError|| (roomId?'Oda bağlı':'Oda bulunamadı'))+'</span></div><div id="musicQueue">'+render()+'</div><div id="musicControls" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px"></div><div style="display:flex;gap:6px;margin-top:9px"><input id="musicTitle" placeholder="Parça adı" style="flex:1;padding:9px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"><input id="musicUrl" placeholder="Audio URL" style="flex:1;padding:9px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"></div><small style="display:block;color:#938a9f;margin-top:8px">Gerçek backend kuyruğu kullanılır. Tarayıcı, verilen audio URL\'sini oynatmayı dener; CORS/format kısıtları kaynak sunucusuna bağlıdır.</small>';
    const m=modal('🎵 Oda müzik merkezi',body);
    const token=localStorage.getItem('erischat_access_token');
    if(roomId&&token&&window.ErisPlatform?.getRealtimeUrl){ try { state.socket=new WebSocket(window.ErisPlatform.getRealtimeUrl('/ws/rooms/'+encodeURIComponent(roomId)+'?token='+encodeURIComponent(token))); state.socket.onmessage=ev=>{try{const d=JSON.parse(ev.data||'{}');if(d.type==='music_sync'&&d.from_user_id!==localStorage.getItem('eris_user_id')) applyRemote(d);}catch(e){}};}catch(e){} } const q=m.querySelector('#musicQueue'); const controls=m.querySelector('#musicControls');
    const refresh=()=>{q.innerHTML=render();q.querySelectorAll('[data-play-item]').forEach(btn=>btn.onclick=()=>play(Number(btn.dataset.playItem)));};
    const sync=payload=>{if(state.socket?.readyState===1)state.socket.send(JSON.stringify({type:'music_sync',...payload}));};
    const applyRemote=d=>{const row=queue.find(x=>x.id===d.music_id);if(!row)return;row.is_playing=d.is_playing;row.position_seconds=d.position_seconds;if(state.current!==d.music_id){if(state.audio)state.audio.pause();const a=new Audio(row.source_url);state.audio=a;state.current=d.music_id;a.autoplay=d.action==='play';a.currentTime=d.position_seconds||0;controls.innerHTML='';controls.append(a);a.onended=()=>stop(d.music_id,false);}else if(state.audio){state.audio.currentTime=d.position_seconds||0;if(d.action==='play')state.audio.play().catch(()=>{});else state.audio.pause();}refresh();};
    const play=async id=>{const row=queue.find(x=>x.id===id); if(!row)return; try {const data=await api('/rooms/'+encodeURIComponent(roomId)+'/music/'+id+'/playback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'play'})}); queue=queue.map(x=>x.id===id?data:{...x,is_playing:false}); if(state.audio) state.audio.pause(); const audio=new Audio(data.source_url); audio.controls=true; audio.autoplay=true; audio.currentTime=data.position_seconds||0; audio.onended=()=>stop(id,true); audio.onpause=()=>{if(state.current===id&&!audio.ended)sync({music_id:id,action:'pause',position_seconds:Math.floor(audio.currentTime)})}; audio.onplay=()=>{if(state.current===id)sync({music_id:id,action:'play',position_seconds:Math.floor(audio.currentTime)})}; audio.onseeked=()=>{if(state.current===id)sync({music_id:id,action:'seek',position_seconds:Math.floor(audio.currentTime)})}; state.audio=audio; state.current=id; controls.innerHTML=''; controls.append(audio); refresh(); } catch(e){window.toast?.('Müzik oynatılamadı: '+e.message);}};
    const stop=async(id,broadcast=true)=>{try{await api('/rooms/'+encodeURIComponent(roomId)+'/music/'+id+'/playback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop'})});}catch(e){} if(broadcast)sync({music_id:id,action:'stop',position_seconds:0}); if(state.audio){state.audio.onpause=null;state.audio.pause();state.audio=null;} state.current=null; refresh();};
    const add=async()=>{const title=m.querySelector('#musicTitle').value.trim(),source_url=m.querySelector('#musicUrl').value.trim(); if(!roomId||!title||!source_url)return window.toast?.('Oda, parça adı ve audio URL gerekli'); const data=await api('/rooms/'+encodeURIComponent(roomId)+'/music',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,source_url})}); if(data?.detail)return window.toast?.('Müzik eklenemedi: '+data.detail); queue.push(data); refresh();};
    const addBtn=button('➕ Kuyruğa ekle',add); controls.append(addBtn,button('🔄 Yenile',async()=>{if(roomId){const r=await api('/rooms/'+encodeURIComponent(roomId)+'/music');queue=Array.isArray(r)?r:(r?.music||r?.items||[]);refresh();}}));
    q.querySelectorAll('[data-play-item]').forEach(btn=>btn.onclick=()=>play(Number(btn.dataset.playItem)));
  }

  async function announcementDemo(){
    let roomId='',loadError=''; try { const rooms=await api('/rooms'); const arr=Array.isArray(rooms)?rooms:(rooms?.rooms||[]); roomId=arr[0]?.id||arr[0]?.room_id||''; if(!roomId)loadError='Kullanılabilir oda bulunamadı.'; } catch(e){loadError=e?.message||'Duyuru servisine erişilemedi.';}
    const m=modal('📢 Duyuru yönetimi',`<div style="display:grid;gap:8px"><div id="annState">${card('<small style="color:#938a9f">'+esc(loadError|| (roomId?'Oda bağlı':'Oda bulunamadı'))+'</small>')}</div><input id="annText" placeholder="Oda duyurusu..." style="padding:10px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:10px"><div id="annOut"></div><div id="annBtns" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>`);
    const out=m.querySelector('#annOut'),bs=m.querySelector('#annBtns'),input=m.querySelector('#annText'); let selected=null;
    const render=async()=>{
      if(!roomId){out.innerHTML=card('<b>Oda bulunamadı</b>');return;}
      let data=null; try{data=await api('/rooms/'+encodeURIComponent(roomId)+'/announcements');}catch(e){out.innerHTML=card('<b>Duyurular yüklenemedi</b><small style="display:block;color:#938a9f;margin-top:4px">'+esc(e.message||'Servis hatası')+'</small>');return;}
      const rows=Array.isArray(data)?data:(data?.announcements||[]);
      out.innerHTML=rows.length?rows.map(x=>`<div data-id="${esc(x.id)}" style="padding:8px;margin-top:5px;border:1px solid #ffffff12;border-radius:9px"><b>${esc(x.message)}</b><small style="display:block;color:#938a9f">#${esc(x.id)} • ${x.pinned?'📌 sabit':'aktif'}</small></div>`).join(''):card('<small>Henüz duyuru yok.</small>');
      out.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{selected=el.dataset.id;input.value=rows.find(x=>String(x.id)===String(selected))?.message||'';});
    };
    const send=async(path,method,body)=>{if(!roomId){out.innerHTML=card('<b>Oda yok</b><small>Önce kullanılabilir bir odaya bağlanılmalı.</small>');return false;}const d=await api(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).catch(e=>({detail:e.message,error:true})); if(d?.detail&&d?.error){out.innerHTML=card('<b>İşlem başarısız</b><small style="display:block;color:#938a9f;margin-top:4px">'+esc(d.detail||'Yetki veya oda hatası')+'</small>');return false;} await render(); return true;};
    bs.append(button('➕ Yayınla',()=>send('/rooms/'+encodeURIComponent(roomId)+'/announcements','POST',{message:input.value.trim()})));
    bs.append(button('✏️ Düzenle',()=>selected?send('/rooms/'+encodeURIComponent(roomId)+'/announcements/'+encodeURIComponent(selected),'PATCH',{message:input.value.trim()}):null));
    bs.append(button('📌 Sabitle',()=>selected?send('/rooms/'+encodeURIComponent(roomId)+'/announcements/'+encodeURIComponent(selected),'PATCH',{pinned:true}):null));
    bs.append(button('🟢/⚪ Aç-Kapat',async()=>{if(!selected)return; const row=await api('/rooms/'+encodeURIComponent(roomId)+'/announcements'); const rows=Array.isArray(row)?row:(row?.announcements||[]); const current=rows.find(x=>String(x.id)===String(selected)); if(current) await send('/rooms/'+encodeURIComponent(roomId)+'/announcements/'+encodeURIComponent(selected),'PATCH',{enabled:!current.enabled});}));
    bs.append(button('🗑 Sil',()=>selected?send('/rooms/'+encodeURIComponent(roomId)+'/announcements/'+encodeURIComponent(selected),'DELETE',{}):null));
    await render();
  }

  async function familyDemo(){
    let data=null,members=[],familyLoadError='',membersLoadError='';
    try{const families=await api('/families');const rows=Array.isArray(families)?families:(families?.families||[]);data=rows[0]||null;if(data){try{members=await api('/families/'+encodeURIComponent(data.id)+'/members');}catch(e){membersLoadError=e?.message||'Üye servisine erişilemedi.';}}}
    catch(e){familyLoadError=e?.message||'Aile servisine erişilemedi.';}
    const m=modal('👑 Aile yönetimi + aile sohbeti',`<div id="familyHead"></div><div id="familyMembers" style="margin-top:9px"></div><div id="familyActions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px"></div><div id="familyChat" style="margin-top:9px"></div>`);
    const head=m.querySelector('#familyHead'),list=m.querySelector('#familyMembers'),actions=m.querySelector('#familyActions'),chat=m.querySelector('#familyChat');
    const render=()=>{head.innerHTML=card('<b>👑 '+esc(data?.name||'Aile bulunamadı')+'</b><small style="display:block;color:#938a9f;margin-top:4px">'+(data?('Seviye '+Number(data.level||1)+' • '+Number(data.member_count||0)+' / '+Number(data.capacity||0)+' üye • '+Number(data.balance||0).toLocaleString('tr-TR')+' bakiye'):(familyLoadError?'Aile servisine erişilemedi: '+esc(familyLoadError):'Hesabında bağlı aile bulunamadı'))+'</small>');list.innerHTML=members.length?members.map(x=>card('<div style="display:flex;justify-content:space-between"><b>'+esc(x.nickname||x.user_id)+'</b><span>'+esc(x.role||'member')+'</span></div><small style="display:block;color:#938a9f;margin-top:4px">'+esc(x.user_id)+'</small>')).join('<div style="height:6px"></div>'):card('<small style="color:#938a9f">'+esc(membersLoadError||'Üye listesi boş.')+'</small>');};
    render();
    if(!data){if(familyLoadError){actions.append(button('🔄 Tekrar dene',()=>{m.remove();familyDemo();}));}else{actions.append(button('➕ Aile oluştur',async()=>{const name=prompt('Aile adı','ErisChat Ailesi')?.trim();if(!name)return;const d=await api('/families',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}).catch(e=>({detail:e.message}));if(d?.detail){window.toast?.(d.detail);return}m.remove();familyDemo();}));}return;}
    const fid=encodeURIComponent(data.id);
    actions.append(button('🔄 Yenile',async()=>{membersLoadError='';try{members=await api('/families/'+fid+'/members');}catch(e){members=[];membersLoadError=e?.message||'Üye servisine erişilemedi.';}render();}));
    actions.append(button('📨 Davetler',async()=>{
      const invites=await api('/families/invitations').catch(()=>[]);
      const pending=(Array.isArray(invites)?invites:[]).filter(x=>x.status==='pending');
      const body=pending.length?pending.map(x=>'<div style="padding:8px;border:1px solid #ffffff12;border-radius:9px;margin-top:6px"><b>'+esc(x.family_name||x.family_id)+'</b><small style="display:block;color:#938a9f;margin-top:3px">Davet #'+esc(x.id)+'</small><div style="display:flex;gap:6px;margin-top:6px"><button data-fam-accept="'+esc(x.id)+'">Kabul et</button><button data-fam-reject="'+esc(x.id)+'">Reddet</button></div></div>').join(''):card('<small>Bekleyen aile daveti yok.</small>');
      const box=modal('📨 Aile davetleri',body);
      box.querySelectorAll('[data-fam-accept]').forEach(btn=>btn.onclick=async()=>{const d=await api('/families/invitations/'+encodeURIComponent(btn.dataset.famAccept)+'/accept',{method:'POST'}).catch(e=>({detail:e.message}));if(d?.detail){window.toast?.(d.detail);return}window.toast?.('Aile daveti kabul edildi');box.remove();familyDemo();});
      box.querySelectorAll('[data-fam-reject]').forEach(btn=>btn.onclick=async()=>{const d=await api('/families/invitations/'+encodeURIComponent(btn.dataset.famReject)+'/reject',{method:'POST'}).catch(e=>({detail:e.message}));if(d?.detail){window.toast?.(d.detail);return}window.toast?.('Aile daveti reddedildi');box.remove();});
    }));

    actions.append(button('💎 Bağış yap',async()=>{const amount=Number(prompt('Bağış miktarı','100'));if(!Number.isInteger(amount)||amount<1)return;const d=await api('/families/'+fid+'/donate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})}).catch(e=>({detail:e.message}));if(d?.detail){window.toast?.(d.detail);return}data=d;render();window.toast?.('Bağış tamamlandı');}));
    actions.append(button('👑 Sahipliği devret',async()=>{const user_id=prompt('Yeni sahip kullanıcı ID');if(!user_id)return;const d=await api('/families/'+fid+'/transfer-ownership',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id})}).catch(e=>({detail:e.message}));if(d?.detail){window.toast?.(d.detail);return}window.toast?.('Aile sahipliği devredildi');m.remove();familyDemo();}));
    actions.append(button('➕ Davet gönder',async()=>{const user_id=prompt('Kullanıcı ID');if(!user_id)return;const d=await api('/families/'+fid+'/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id,role:'member'})}).catch(e=>({detail:e.message}));if(d?.detail){window.toast?.(d.detail);return}window.toast?.('Aile daveti gönderildi');}));
    actions.append(button('🚪 Aileden ayrıl',async()=>{if(!confirm('Aileden ayrılmak istediğine emin misin?'))return;const d=await api('/families/'+fid+'/leave',{method:'DELETE'}).catch(e=>({detail:e.message}));if(d?.detail){window.toast?.(d.detail);return}window.toast?.('Aileden ayrıldın');m.remove();familyDemo();}));
    const loadChat=async()=>{let d=null,chatError='';try{d=await api('/families/'+fid+'/chat');}catch(e){chatError=e?.message||'Aile sohbeti yüklenemedi.';}const msgs=d?.messages||[];chat.innerHTML=card('<b>💬 Aile sohbeti</b><div id="famMsgs" style="max-height:180px;overflow:auto;margin-top:7px">'+(msgs.length?msgs.map(x=>'<div style="padding:5px 0;border-bottom:1px solid #ffffff0a"><b>'+esc(x.sender_id||'Kullanıcı')+'</b><small style="display:block;color:#938a9f">'+esc(x.text||'')+'</small></div>').join(''):(chatError?'<small style="color:#ff9f9f">Sohbet servisi kullanılamıyor: '+esc(chatError)+'</small>':'<small style="color:#938a9f">Henüz mesaj yok.</small>'))+'</div><div style="display:flex;gap:5px;margin-top:7px"><input id="famInput" maxlength="2000" placeholder="Aileye mesaj..." style="flex:1;padding:8px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:8px"><button id="famSend" style="border:0;border-radius:8px;background:#754cff;color:#fff;padding:8px">Gönder</button></div>');const inp=chat.querySelector('#famInput');chat.querySelector('#famSend').onclick=async()=>{const text=inp.value.trim();if(!text)return;const x=await api('/families/'+fid+'/chat/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}).catch(e=>({detail:e.message}));if(x?.detail){window.toast?.(x.detail);return}inp.value='';loadChat();};};
    await loadChat();
  }

  async function storeDemo(){
    let items=[]; try{const x=await api('/cosmetics');items=Array.isArray(x)?x:(x.items||x.cosmetics||x.data||[]);}catch(e){const cached=window.ErisChatCosmetics?.state?.catalog;items=Array.isArray(cached)?cached:[];}
    const m=modal('🛍️ 139 kozmetik • tam vitrin',`<div class="card" style="padding:10px;margin-bottom:8px"><b>Canlı mağaza</b><small style="display:block;color:#938a9f;margin-top:4px">Satın alma, sahiplik ve uygulama işlemleri için gerçek mağaza yüzünü açabilirsin.</small><button id="openLiveShop" style="margin-top:7px;padding:9px;border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:800">🛍️ Canlı mağazayı aç</button></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><input id="cosSearch" placeholder="Ara: avatar, çerçeve, VIP..." style="flex:1;min-width:160px;padding:9px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"><select id="cosFilter" style="padding:9px;background:#17131f;color:#fff;border:1px solid #ffffff14;border-radius:9px"><option value="all">Tümü</option><option value="avatar">Avatar</option><option value="frame">Çerçeve</option><option value="vip">VIP</option><option value="standard">Standart</option></select></div><div id="cosCount" style="font-size:8px;color:#938a9f;margin-bottom:7px">Katalog yükleniyor...</div><div id="cosGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px"></div>`);
    const search=m.querySelector('#cosSearch'),filter=m.querySelector('#cosFilter'),grid=m.querySelector('#cosGrid'),count=m.querySelector('#cosCount'); m.querySelector('#openLiveShop')?.addEventListener('click',()=>{m.remove();window.showView?.('shop');});
    if(!items.length){count.textContent='Kozmetik kataloğu şu anda alınamadı.'; grid.innerHTML=card('<b>🛍️ Mağaza hazır</b><small style="display:block;color:#938a9f;margin-top:4px">Backend kataloğu çevrimdışı olduğu için ürün kartları uydurulmuyor. API tekrar erişilebilir olduğunda 139 ürün burada listelenecek.</small>'); return;}
    const draw=()=>{const q=search.value.toLowerCase().trim(),f=filter.value;const rows=items.filter(x=>{const key=String(x.key||x.id||x.name||'').toLowerCase(),type=String(x.type||x.category||key).toLowerCase(),vip=key.includes('vip')||type.includes('vip');return (!q||key.includes(q))&&(f==='all'||(f==='avatar'&&type.includes('avatar'))||(f==='frame'&&(type.includes('cerceve')||type.includes('frame')))||(f==='vip'&&vip)||(f==='standard'&&!vip));});count.textContent=`${rows.length} sonuç • hedef katalog 139`;grid.innerHTML=rows.map(x=>{const key=String(x.key||x.id||x.name||'');const src=asset(key);return `<div style="background:#12101a;border:1px solid #ffffff12;border-radius:12px;padding:6px;overflow:hidden"><div style="height:76px;background:#09070d;border-radius:9px;display:grid;place-items:center"><img src="${esc(src)}" loading="lazy" style="max-width:100%;max-height:72px;object-fit:contain"></div><small style="display:block;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.name||key)}</small><span style="font-size:7px;color:#938a9f">${esc(x.type||x.category||'kozmetik')}</span></div>`}).join('');}; search.oninput=draw;filter.onchange=draw;draw();
  }

  async function profileDemo(){
    let me={},wallet={lidya:0,lidya_gem:0},profileError='',walletError='';const [meResult,walletResult]=await Promise.allSettled([api('/me'),api('/me/wallet')]);if(meResult.status==='fulfilled')me=meResult.value||{};else profileError=meResult.reason?.message||'Profil servisi kullanılamıyor';if(walletResult.status==='fulfilled')wallet=walletResult.value||{};else walletError=walletResult.reason?.message||'Cüzdan servisi kullanılamıyor';
    const avatar=me.avatar_asset||me.avatar||'erkekavatar/avatar_01_ULTRA_HD_CLEAN.jpg', frame=me.frame_asset||'standartcerceve/cerceve_01.png';
    const m=modal('👤 Profil + Lidya / Lidya Gem',`${profileError?'<div class="card" style="padding:10px;border:1px solid #ff6b6b33"><b>⚠️ Profil servisi</b><small style="display:block;color:#ff9a9a;margin-top:4px">'+esc(profileError)+'</small></div>':''}${walletError?'<div class="card" style="padding:10px;border:1px solid #ff6b6b33;margin-top:7px"><b>⚠️ Cüzdan servisi</b><small style="display:block;color:#ff9a9a;margin-top:4px">'+esc(walletError)+'</small></div>':''}<div style="display:grid;grid-template-columns:130px 1fr;gap:12px;align-items:center"><div style="height:150px;border-radius:18px;background:#0a0810;border:1px solid #ffffff12;display:grid;place-items:center;position:relative;overflow:hidden"><img src="${esc(asset(avatar))}" style="width:100px;height:100px;object-fit:contain"><img src="${esc(asset(frame))}" style="position:absolute;width:128px;height:128px;object-fit:contain"></div><div>${card(`<b>${esc(me.nickname||'ErisChat kullanıcısı')}</b><small style="display:block;color:#938a9f;margin-top:4px">${esc(me.gender||'Belirtilmemiş')} • VIP profil • Fan seviyesi • Profil hediyeleri</small>`)}<div style="margin-top:8px">${card(`<div style="display:flex;justify-content:space-between"><b>💰 Lidya</b><b id="walletLidya">${Number(wallet.lidya||0).toLocaleString('tr-TR')}</b></div><div style="display:flex;justify-content:space-between;margin-top:5px"><b>💎 Lidya Gem</b><b id="walletGem">${Number(wallet.lidya_gem||0).toLocaleString('tr-TR')}</b></div><small style="display:block;color:#938a9f;margin-top:6px">1 Lidya = 1 Lidya Gem • 1 Lidya Gem = 1 Lidya</small><div id="walletBtns" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div>`)}</div><div id="profileBtns" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div></div></div>`);
    const walletBtns=m.querySelector('#walletBtns'), out=()=>{m.querySelector('#walletLidya').textContent=Number(wallet.lidya||0).toLocaleString('tr-TR');m.querySelector('#walletGem').textContent=Number(wallet.lidya_gem||0).toLocaleString('tr-TR')};
    const exchange=async direction=>{const raw=window.prompt(direction==='lidya_to_gem'?'Kaç Lidya → Gem?':'Kaç Gem → Lidya?','1');if(raw===null)return;const amount=Number(raw);if(!Number.isInteger(amount)||amount<1){window.toast?.('1 veya daha büyük tam sayı girin');return}const d=await api('/me/wallet/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction,amount,idempotency_key:(crypto?.randomUUID?.()||('wallet-'+Date.now()+'-'+Math.random().toString(16).slice(2)))})}).catch(e=>({error:e.message}));if(d?.error||d?.detail){window.toast?.(d.detail||d.error||'Takas başarısız');return}wallet=d;out();window.toast?.('1:1 takas tamamlandı')};
    walletBtns.append(button('💰 → 💎 Lidya Gem Al',()=>exchange('lidya_to_gem')),button('💎 → 💰 Lidya Al',()=>exchange('gem_to_lidya')));
    let followed=false,favorite=false,avatarApplied=false,frameApplied=false;
    const pb=m.querySelector('#profileBtns');
    const addAction=(label,fn)=>pb.append(button(label,fn));
    addAction('✨ Avatarı uygula',()=>{avatarApplied=!avatarApplied;window.toast?.(avatarApplied?'Avatar demo profiline uygulandı ✓':'Avatar uygulaması kaldırıldı ✓');});
    addAction('🖼 Çerçeveyi uygula',()=>{frameApplied=!frameApplied;window.toast?.(frameApplied?'Çerçeve demo profiline uygulandı ✓':'Çerçeve uygulaması kaldırıldı ✓');});
    addAction('⭐ Favoriye ekle',()=>{favorite=!favorite;window.toast?.(favorite?'Profil favorilere eklendi ✓':'Profil favorilerden çıkarıldı ✓');});
    addAction('🎁 Hediye vitrini',()=>window.ErisDemoExtras?.roomGift?.());
    addAction('➕ Takip et',()=>{followed=!followed;window.toast?.(followed?'Takip edildi ✓':'Takip bırakıldı ✓');});
  }

  function roomGiftDemo(){
    const gifts=[['🌹 Gül','1.000'],['💎 Elmas','5.000'],['👑 Taç','25.000'],['🚀 Roket','100.000'],['🌌 Galaksi','500.000']];
    const m=modal('🎁 Oda hediyeleri — müşteri demosu','<div class="card" style="padding:12px"><b>Demo hediye vitrini</b><small style="display:block;color:#938a9f;margin-top:4px">Bu panel gerçek ödeme yapmaz. Hediye animasyonu ve alıcı seçimi arayüzünü test eder.</small></div><div style="display:flex;gap:7px;overflow:auto;margin:9px 0" id="giftRecipients"><button data-rec="Oda sahibi">👑 Oda sahibi</button><button data-rec="Koltuk 2">👤 Koltuk 2</button><button data-rec="Koltuk 3">👤 Koltuk 3</button></div><div id="giftGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:7px"></div><div id="giftStatus" class="card" style="padding:10px;margin-top:9px;color:#938a9f">Önce bir alıcı ve hediye seç.</div>');
    let recipient='',gift=null; const grid=m.querySelector('#giftGrid'),status=m.querySelector('#giftStatus');
    grid.innerHTML=gifts.map(g=>'<button data-gift="'+esc(g[0])+'" style="padding:12px;border:1px solid #ffffff14;border-radius:13px;background:#ffffff06;color:#fff;text-align:left"><b>'+g[0]+'</b><small style="display:block;color:#e4b85d;margin-top:4px">💎 '+g[1]+'</small></button>').join('');
    m.querySelectorAll('[data-rec]').forEach(b=>b.onclick=()=>{recipient=b.dataset.rec;m.querySelectorAll('[data-rec]').forEach(x=>x.style.outline='');b.style.outline='2px solid #ff4fa3';status.textContent=gift?recipient+' → '+gift+' hazır.':'Alıcı seçildi. Şimdi bir hediye seç.';});
    grid.querySelectorAll('[data-gift]').forEach(b=>b.onclick=()=>{gift=b.dataset.gift;grid.querySelectorAll('[data-gift]').forEach(x=>x.style.outline='');b.style.outline='2px solid #8a5cff';status.innerHTML=recipient?'<b>✓ '+esc(recipient)+' → '+esc(gift)+'</b><small style="display:block;color:#938a9f;margin-top:4px">Demo gönderim hazır.</small><button id="demoGiftSend" style="margin-top:7px;padding:9px;border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:800">🎁 Gönder</button>':'Bir alıcı seçtikten sonra demo gönderim hazır olacak.';m.querySelector('#demoGiftSend')?.addEventListener('click',()=>{status.innerHTML='<b>✨ Hediye gönderildi</b><small style="display:block;color:#61e6af;margin-top:4px">'+esc(recipient)+' için '+esc(gift)+' demo animasyonu tetiklendi.</small>';window.toast?.('🎁 Demo hediyesi gönderildi ✓');});});
  }

  function safetyDemo(){
    const state={notifications:3,blocked:false,vipHidden:false,report:'Bekliyor'};
    const html=[
      '<div style="display:grid;gap:8px">',
      '<div id="safeNotice">'+card('<b>🔔 Bildirim merkezi</b><small style="display:block;color:#938a9f;margin-top:4px">Okunmamış bildirimleri ve okundu durumunu test et.</small><button id="safeRead" style="margin-top:7px">✓ Tümünü okundu yap</button>')+'</div>',
      '<div id="safeBlock">'+card('<b>🚫 Engelleme</b><small style="display:block;color:#938a9f;margin-top:4px">Demo kullanıcı engelleme durumunu değiştir.</small><button id="safeBlockBtn" style="margin-top:7px">🚫 Engelle</button>')+'</div>',
      '<div id="safePrivacy">'+card('<b>🔒 Gizlilik</b><small style="display:block;color:#938a9f;margin-top:4px">VIP görünürlüğünü demo olarak aç/kapat.</small><button id="safeVipBtn" style="margin-top:7px">👁 VIP görünürlüğünü değiştir</button>')+'</div>',
      '<div id="safeAdmin">'+card('<b>🧰 Moderasyon</b><small style="display:block;color:#938a9f;margin-top:4px">Örnek raporun durum akışını incele.</small><button id="safeReportBtn" style="margin-top:7px">🛡 Raporu incele</button>')+'</div>',
      '<div id="safeStatus">'+card('<small style="color:#938a9f">Demo işlemleri gerçek kullanıcıyı/hesabı değiştirmez.</small>')+'</div>',
      '</div>'
    ].join('');
    const m=modal('🛡️ Bildirim • Güvenlik • Moderasyon',html);
    const render=()=>{
      m.querySelector('#safeNotice small').textContent=state.notifications?'Okunmamış bildirim: '+state.notifications:'Tüm demo bildirimleri okundu.';
      m.querySelector('#safeBlock small').textContent=state.blocked?'Demo kullanıcı engellendi.':'Kullanıcı engelli değil.';
      m.querySelector('#safeBlockBtn').textContent=state.blocked?'↩ Engeli kaldır':'🚫 Engelle';
      m.querySelector('#safePrivacy small').textContent=state.vipHidden?'VIP görünürlüğü gizli (demo).':'VIP görünürlüğü açık (demo).';
      m.querySelector('#safeAdmin small').textContent='Rapor #DEMO-001 • '+state.report;
    };
    m.querySelector('#safeRead').onclick=()=>{state.notifications=0;render();};
    m.querySelector('#safeBlockBtn').onclick=()=>{state.blocked=!state.blocked;render();};
    m.querySelector('#safeVipBtn').onclick=()=>{state.vipHidden=!state.vipHidden;render();};
    m.querySelector('#safeReportBtn').onclick=()=>{state.report=state.report==='Bekliyor'?'İncelendi • işlem bekliyor':'Bekliyor';render();};
    render();
  }
  function onboardingDemo(){
    const steps=[['👋 Hoş geldin','Anonim giriş / oturum'],['✏️ Takma ad','Kullanıcı adı seç'],['♂♀ Cinsiyet','Profil tercihi'],['🖼 Avatar','Başlangıç görünümü'],['🎯 İlgi alanları','Keşif kişiselleştirme'],['🔒 Gizlilik','Görünürlük tercihleri'],['🚀 Başla','Odalar + keşif + DM']];
    let index=0;
    const state={nickname:'Eris Kullanıcısı',gender:'Belirtmek istemiyorum',avatar:'varsayılan',interests:['Müzik'],privacy:true};
    const m=modal('🚀 İlk kullanım / onboarding','<div id="onboard"></div><div style="display:flex;gap:6px;margin-top:9px" id="onboardBtns"></div>');
    const draw=()=>{
      const controls=[
        '<div style="margin-top:10px"><input id="obNick" maxlength="32" value="'+esc(state.nickname)+'" placeholder="Takma ad" style="width:100%;box-sizing:border-box;padding:9px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"></div>',
        '<div style="margin-top:10px"><select id="obGender" style="width:100%;padding:9px;background:#17131f;color:#fff;border:1px solid #ffffff14;border-radius:9px"><option>Belirtmek istemiyorum</option><option>Erkek</option><option>Kadın</option></select></div>',
        '<div style="display:flex;gap:7px;margin-top:10px"><button data-ob-avatar="avatar1">Avatar 1</button><button data-ob-avatar="avatar2">Avatar 2</button><button data-ob-avatar="avatar3">Avatar 3</button></div>',
        '<div style="margin-top:10px"><input id="obInterests" value="'+esc(state.interests.join(', '))+'" placeholder="Müzik, sohbet, oyun..." style="width:100%;box-sizing:border-box;padding:9px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"></div>',
        '<label style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><b>Profil görünürlüğü</b><input id="obPrivacy" type="checkbox" '+(state.privacy?'checked':'')+'></label>'
      ];
      const extra=index===1?controls[0]:index===2?controls[1]:index===3?controls[2]:index===4?controls[3]:index===5?controls[4]:'';
      m.querySelector('#onboard').innerHTML=card('<div style="display:flex;align-items:center;gap:10px"><b style="font-size:20px">'+(index+1)+'</b><div><b>'+esc(steps[index][0])+'</b><small style="display:block;color:#938a9f;margin-top:4px">'+esc(steps[index][1])+'</small></div></div><div style="height:5px;background:#ffffff0a;border-radius:5px;margin-top:10px"><div style="height:5px;width:'+(((index+1)/steps.length)*100)+'%;border-radius:5px;background:linear-gradient(90deg,#754cff,#ff4fa3)"></div></div><small style="display:block;color:#938a9f;margin-top:7px">'+(index+1)+' / '+steps.length+'</small>'+extra);
      if(index===2)m.querySelector('#obGender').value=state.gender;
      if(index===3)m.querySelectorAll('[data-ob-avatar]').forEach(b=>b.onclick=()=>{state.avatar=b.dataset.obAvatar;window.toast?.('Avatar seçildi: '+state.avatar);});
      const save=()=>{if(index===1)state.nickname=m.querySelector('#obNick')?.value.trim()||state.nickname;if(index===2)state.gender=m.querySelector('#obGender')?.value||state.gender;if(index===4){const v=m.querySelector('#obInterests')?.value||'';state.interests=v.split(',').map(x=>x.trim()).filter(Boolean).slice(0,8);}if(index===5)state.privacy=!!m.querySelector('#obPrivacy')?.checked;};
      m.querySelector('#onboardBtns').innerHTML='';
      const bs=m.querySelector('#onboardBtns');
      bs.append(button('← Geri',()=>{save();index=Math.max(0,index-1);draw();}),button(index<steps.length-1?'İleri →':'Tamamla ✓',()=>{save();if(index<steps.length-1){index++;draw();}else{m.remove();window.toast?.('Onboarding demo tamamlandı ✓');}}));
    };
    draw();
  }

  function roomSettingsDemo(){
    const settings=[['🔒 Odayı kilitle',true],['💬 Sohbet',true],['🎁 Hediyeler',true],['🎵 Müzik',true],['📢 Duyuru',true]];
    const m=modal('⚙️ Oda sahibi ayarları','<div id="roomSettings"></div><div style="margin-top:9px">'+card('<small style="color:#938a9f">Değişiklikler bu müşteri demo oturumunda gösterilir; backend oda ayarını değiştirdiği iddia edilmez.</small>')+'</div>');
    const draw=()=>{m.querySelector('#roomSettings').innerHTML=settings.map((s,i)=>card('<label style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>'+s[0]+'</b><input type="checkbox" '+(s[1]?'checked':'')+' data-setting="'+i+'"></label>')).join('<div style="height:6px"></div>');m.querySelectorAll('[data-setting]').forEach(x=>x.onchange=()=>{settings[Number(x.dataset.setting)][1]=x.checked;window.toast?.('Demo ayarı güncellendi ✓');});};
    draw();
  }

  // Eski floating demo araç çubuğu kaldırıldı.
  // Sistemler artık tek bir merkezi arayüzden açılacak.
  window.ErisDemoExtras = Object.freeze({
    seats: seatsDemo,
    roomChat: roomChatDemo,
    music: musicDemo,
    announcement: announcementDemo,
    family: familyDemo,
    store: storeDemo,
    profile: profileDemo,
    safety: safetyDemo,
    onboarding: onboardingDemo,
    roomSettings: roomSettingsDemo,
    roomGift: roomGiftDemo
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{}, {once:true});
})();
