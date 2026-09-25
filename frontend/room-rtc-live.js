(() => {
  'use strict';
  const peers=new Map(), known=new Set(), sounds=new Map();
  let stream=null, iceServers=[{urls:'stun:stun.l.google.com:19302'}], myId=null;
  const socket=()=>window.__erisRoomSocket;
  const signal=(type,to_user_id,payload)=>{if(socket()?.readyState===WebSocket.OPEN)socket().send(JSON.stringify({type,to_user_id,payload}))};
  const button=()=>document.getElementById('erisRoomMicInline');
  function show(){const b=button();if(!b)return;b.classList.toggle('on',!!stream);b.textContent=stream?'🎙️':'🔇';b.title=stream?'Mikrofon açık — kapat':'Mikrofon kapalı — aç'}
  function drop(id){const pc=peers.get(id);peers.delete(id);if(pc&&pc.signalingState!=='closed')pc.close();const audio=sounds.get(id);if(audio){audio.srcObject=null;audio.remove()}sounds.delete(id)}
  function peer(id){if(peers.has(id))return peers.get(id);const pc=new RTCPeerConnection({iceServers});peers.set(id,pc);
    pc.onicecandidate=e=>{if(e.candidate)signal('rtc_ice',id,e.candidate.toJSON())};
    pc.ontrack=e=>{let audio=sounds.get(id);if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.dataset.rtcUser=id;audio.style.display='none';document.body.append(audio);sounds.set(id,audio)}audio.srcObject=e.streams[0]||new MediaStream([e.track]);audio.play().catch(()=>{})};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'||pc.connectionState==='closed')drop(id)};
    if(stream)stream.getTracks().forEach(track=>pc.addTrack(track,stream));return pc;
  }
  async function offer(id){if(!stream||id===myId||!socket()||socket().readyState!==WebSocket.OPEN)return;const pc=peer(id);for(const track of stream.getTracks())if(!pc.getSenders().some(sender=>sender.track===track))pc.addTrack(track,stream);if(pc.signalingState!=='stable')return;const desc=await pc.createOffer();await pc.setLocalDescription(desc);signal('rtc_offer',id,pc.localDescription)}
  async function message(d){if(d.type==='rtc_ready'){myId=String(d.user_id);known.clear();(d.peers||[]).forEach(id=>known.add(String(id)));return}
    if(d.type==='rtc_peer_joined'){const id=String(d.user_id||'');if(id&&id!==myId){known.add(id);if(stream)await offer(id)}return}
    const id=String(d.from_user_id||'');if(!id||id===myId)return;known.add(id);
    if(d.type==='rtc_leave'){drop(id);return}
    try{if(d.type==='rtc_offer'){const pc=peer(id);await pc.setRemoteDescription(new RTCSessionDescription(d.payload));const desc=await pc.createAnswer();await pc.setLocalDescription(desc);signal('rtc_answer',id,pc.localDescription)}
      else if(d.type==='rtc_answer'){const pc=peers.get(id);if(pc?.signalingState==='have-local-offer')await pc.setRemoteDescription(new RTCSessionDescription(d.payload))}
      else if(d.type==='rtc_ice'){const pc=peer(id);if(pc.remoteDescription)await pc.addIceCandidate(new RTCIceCandidate(d.payload))}
    }catch(e){console.warn('[ErisChat] RTC bağlantısı kurulamadı',e);drop(id)}
  }
  function stop(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;for(const id of known)signal('rtc_leave',id,null)}for(const id of [...peers.keys()])drop(id);show()}
  async function toggle(){if(stream){stop();return}if(!window.__erisRoomPermissions?.current_user_seat)return window.toast?.('Mikrofon için önce boş bir koltuğa otur.');if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)return window.toast?.('Bu tarayıcı sesli sohbeti desteklemiyor.');if(socket()?.readyState!==WebSocket.OPEN)return window.toast?.('Oda bağlantısı henüz hazır değil.');
    try{const id=window.ErisCurrentRoomId||window.currentRoomId;const cfg=await window.ErisPlatform.api('/rooms/'+encodeURIComponent(id)+'/rtc-config');if(Array.isArray(cfg.ice_servers))iceServers=cfg.ice_servers;stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});stream.getAudioTracks()[0]?.addEventListener('ended',stop,{once:true});show();for(const peerId of known)await offer(peerId);window.toast?.('Mikrofon açıldı')}
    catch(e){stop();window.toast?.(e.name==='NotAllowedError'?'Mikrofon izni verilmedi.':e.message||'Mikrofon açılamadı.')}
  }
  window.ErisRoomRTC={toggle,stop,message};
  window.addEventListener('erischat:room-opened',()=>{show()});
})();
