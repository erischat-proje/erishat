(() => {
  'use strict';
  const peers=new Map(), known=new Set(), sounds=new Map(), pendingIce=new Map(), reconnectTimers=new Map();
  let stream=null, iceServers=[{urls:'stun:stun.l.google.com:19302'}], myId=null;
  let microphoneSeat=null;
  async function checkMicrophoneSeat(){
    if(!stream)return;
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    if(!id)return;
    try{
      const cfg=await window.ErisPlatform.api('/rooms/'+encodeURIComponent(id)+'/rtc-config');
      if(stream&&(cfg.muted||!cfg.seat_number||Number(cfg.seat_number)!==Number(microphoneSeat))){
        stop();
        window.toast?.(cfg.muted?'Koltuk mikrofonun yetkili tarafından susturuldu.':'Koltuktan ayrıldığın için mikrofon kapandı.');
      }
    }catch(e){
      if(stream){stop();window.toast?.('Oda bağlantısı kesildi; mikrofon kapatıldı.')}
    }
  }
  window.setInterval(checkMicrophoneSeat,2500);

  let outputEnabled=localStorage.getItem('eris_room_audio_output')!=='false';
  const socket=()=>window.__erisRoomSocket;
  const signal=(type,to_user_id,payload)=>{if(socket()?.readyState===WebSocket.OPEN)socket().send(JSON.stringify({type,to_user_id,payload}))};
  const button=()=>document.getElementById('erisRoomMicInline');
  const outputButton=()=>document.getElementById('erisRoomAudioOutput');
  function show(){const b=button();if(!b)return;b.classList.toggle('on',!!stream);b.textContent='🎙️';b.setAttribute('aria-pressed',String(!!stream));b.title=stream?'Mikrofon açık — kapat':'Mikrofon kapalı — aç'}
  function showOutput(){const b=outputButton();if(!b)return;b.textContent=outputEnabled?'🔊':'🔈';b.classList.toggle('on',outputEnabled);b.setAttribute('aria-pressed',String(outputEnabled));b.title=outputEnabled?'Oda sesini kapat':'Oda sesini aç';b.setAttribute('aria-label',b.title)}
  async function toggleOutput(){
    outputEnabled=!outputEnabled;localStorage.setItem('eris_room_audio_output',String(outputEnabled));
    for(const audio of sounds.values()){audio.muted=!outputEnabled;if(outputEnabled){try{await audio.play()}catch(e){window.toast?.('Tarayıcı sesi başlatmadı. Oda ses düğmesine tekrar dokun.')}}}
    showOutput();window.toast?.(outputEnabled?'Oda sesleri açıldı.':'Oda sesleri kapatıldı.');
  }
  function shouldInitiate(id){return Boolean(myId&&id&&myId<id)}
  async function flushIce(id,pc){const queued=pendingIce.get(id)||[];pendingIce.delete(id);for(const candidate of queued){try{await pc.addIceCandidate(new RTCIceCandidate(candidate))}catch(e){console.warn('[ErisChat] ICE aday sinyali uygulanamadı',e)}}}
  function drop(id){const timer=reconnectTimers.get(id);if(timer)clearTimeout(timer);reconnectTimers.delete(id);pendingIce.delete(id);const pc=peers.get(id);peers.delete(id);if(pc&&pc.signalingState!=='closed')pc.close();const audio=sounds.get(id);if(audio){audio.srcObject=null;audio.remove()}sounds.delete(id)}
  function peer(id){if(peers.has(id))return peers.get(id);const pc=new RTCPeerConnection({iceServers});peers.set(id,pc);
    pc.onicecandidate=e=>{if(e.candidate)signal('rtc_ice',id,e.candidate.toJSON())};
    pc.ontrack=e=>{let audio=sounds.get(id);if(!audio){audio=document.createElement('audio');audio.autoplay=outputEnabled;audio.playsInline=true;audio.muted=!outputEnabled;audio.volume=1;audio.dataset.rtcUser=id;audio.style.display='none';document.body.append(audio);sounds.set(id,audio)}audio.srcObject=e.streams[0]||new MediaStream([e.track]);if(outputEnabled)audio.play().catch(()=>{window.toast?.('Oda sesi başlatılamadı. Ses düğmesine dokunarak yeniden dene.')})};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected'){const t=reconnectTimers.get(id);if(t)clearTimeout(t);reconnectTimers.delete(id);return}if(['failed','disconnected','closed'].includes(pc.connectionState)&&!reconnectTimers.has(id)){const timer=setTimeout(()=>{reconnectTimers.delete(id);if(pc.connectionState==='connected'||pc.connectionState==='closed')return;drop(id);if(stream&&shouldInitiate(id))setTimeout(()=>offer(id).catch(()=>{}),350)},3000);reconnectTimers.set(id,timer)}};
    if(stream)stream.getTracks().forEach(track=>pc.addTrack(track,stream));return pc;
  }
  async function offer(id){if(!stream||id===myId||!shouldInitiate(id)||!socket()||socket().readyState!==WebSocket.OPEN)return;const pc=peer(id);for(const track of stream.getTracks())if(!pc.getSenders().some(sender=>sender.track===track))pc.addTrack(track,stream);if(pc.signalingState!=='stable')return;const desc=await pc.createOffer();await pc.setLocalDescription(desc);signal('rtc_offer',id,pc.localDescription)}
  async function message(d){if(d.type==='rtc_ready'){myId=String(d.user_id);known.clear();(d.peers||[]).forEach(id=>known.add(String(id)));return}
    if(d.type==='rtc_peer_joined'){const id=String(d.user_id||'');if(id&&id!==myId){known.add(id);if(stream&&shouldInitiate(id))await offer(id)}return}
    const id=String(d.from_user_id||'');if(!id||id===myId)return;known.add(id);
    if(d.type==='rtc_leave'){drop(id);return}
    try{if(d.type==='rtc_offer'){const pc=peer(id);await pc.setRemoteDescription(new RTCSessionDescription(d.payload));await flushIce(id,pc);const desc=await pc.createAnswer();await pc.setLocalDescription(desc);signal('rtc_answer',id,pc.localDescription)}
      else if(d.type==='rtc_answer'){const pc=peers.get(id);if(pc?.signalingState==='have-local-offer'){await pc.setRemoteDescription(new RTCSessionDescription(d.payload));await flushIce(id,pc)}}
      else if(d.type==='rtc_ice'){const pc=peer(id);if(pc.remoteDescription)await pc.addIceCandidate(new RTCIceCandidate(d.payload));else{const queue=pendingIce.get(id)||[];if(queue.length<64)queue.push(d.payload);pendingIce.set(id,queue)}}
    }catch(e){console.warn('[ErisChat] RTC bağlantısı kurulamadı',e);drop(id)}
  }
  function stop(){microphoneSeat=null;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;for(const id of known)signal('rtc_leave',id,null)}for(const id of [...peers.keys()])drop(id);show()}
  async function toggle(){if(stream){stop();return}if(!window.__erisRoomPermissions?.current_user_seat)return window.toast?.('Mikrofon için önce boş bir koltuğa otur.');if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)return window.toast?.('Bu tarayıcı sesli sohbeti desteklemiyor.');if(socket()?.readyState!==WebSocket.OPEN)return window.toast?.('Oda bağlantısı henüz hazır değil.');
    try{const id=window.ErisCurrentRoomId||window.currentRoomId;const cfg=await window.ErisPlatform.api('/rooms/'+encodeURIComponent(id)+'/rtc-config');if(Array.isArray(cfg.ice_servers))iceServers=cfg.ice_servers;
      if(cfg.muted)return window.toast?.('Bu koltuğun mikrofonu susturuldu.');
      if(!cfg.seat_number)return window.toast?.('Mikrofon için önce koltuğa otur.');
      microphoneSeat=Number(cfg.seat_number);
      stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      await checkMicrophoneSeat();
      if(!stream)return;stream.getAudioTracks()[0]?.addEventListener('ended',stop,{once:true});show();for(const peerId of known)await offer(peerId);window.toast?.('Mikrofon açıldı')}
    catch(e){stop();window.toast?.(e.name==='NotAllowedError'?'Mikrofon izni verilmedi.':e.message||'Mikrofon açılamadı.')}
  }
  window.ErisRoomRTC={toggle,stop,message,toggleOutput,showOutput};
  window.addEventListener('erischat:room-opened',()=>{show();showOutput()});
})();
