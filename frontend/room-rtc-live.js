(() => {
  'use strict';
  const peers=new Map(), known=new Set(), sounds=new Map(), pendingIce=new Map(), reconnectTimers=new Map();
  let stream=null, iceServers=[{urls:'stun:stun.l.google.com:19302'}], myId=null;
  let microphoneSeat=null;
  const audioConstraints={echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1};
  const analysers=new Map();
  let audioContext=null,speakingFrame=0;
  function speakingStyle(){
    if(document.getElementById('eris-rtc-speaking-style'))return;
    const x=document.createElement('style');x.id='eris-rtc-speaking-style';
    x.textContent='.eris-seat.rtc-speaking{border-color:#fff!important;box-shadow:0 0 0 4px rgba(139,92,246,.42),0 0 0 9px rgba(255,79,163,.18),0 0 24px rgba(180,100,255,.75)!important;animation:erisRtcSpeak .72s ease-in-out infinite alternate}@keyframes erisRtcSpeak{to{transform:translate(-50%,-50%) scale(1.09);box-shadow:0 0 0 6px rgba(139,92,246,.3),0 0 0 13px rgba(255,79,163,.10),0 0 32px rgba(180,100,255,.9)}}@media(prefers-reduced-motion:reduce){.eris-seat.rtc-speaking{animation:none}}';
    document.head.append(x);
  }
  function markSpeaking(id,on){
    document.querySelectorAll('.eris-seat').forEach(x=>{
      if(String(x.dataset.userId||'')===String(id))x.classList.toggle('rtc-speaking',!!on);
    });
  }
  function watchLevel(id,media){
    try{
      audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
      audioContext.resume?.().catch(()=>{});
      const source=audioContext.createMediaStreamSource(media);
      const analyser=audioContext.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=.72;
      source.connect(analyser);analysers.set(String(id),{source,analyser,hot:0});
      if(!speakingFrame)scanLevels();
    }catch(e){console.warn('[ErisChat] konuşma göstergesi başlatılamadı',e)}
  }
  function scanLevels(){
    speakingFrame=requestAnimationFrame(scanLevels);
    for(const [id,x] of analysers){
      const a=new Uint8Array(x.analyser.fftSize);x.analyser.getByteTimeDomainData(a);
      let sum=0;for(const v of a){const n=(v-128)/128;sum+=n*n}
      const rms=Math.sqrt(sum/a.length);
      if(rms>.045)x.hot=5;else x.hot=Math.max(0,x.hot-1);
      markSpeaking(id,x.hot>0);
    }
  }
  function unwatchLevel(id){
    const x=analysers.get(String(id));if(x){try{x.source.disconnect()}catch{}analysers.delete(String(id))}
    markSpeaking(id,false);
    if(!analysers.size&&speakingFrame){cancelAnimationFrame(speakingFrame);speakingFrame=0}
  }
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

  let outputEnabled=true;
  localStorage.setItem('eris_room_audio_output','true');
  const isBlocked=id=>!!window.ErisRoomBlocks?.has?.(id);
  function syncBlockedAudio(){
    for(const [id,audio] of sounds){
      audio.muted=!outputEnabled||isBlocked(id);
      if(!audio.muted)audio.play().catch(()=>{});
    }
  }

  async function resumeRoomAudio(){
    if(!outputEnabled)return;
    try{await audioContext?.resume?.()}catch{}
    for(const [id,audio] of sounds){
      if(isBlocked(id))continue;
      audio.muted=false;
      try{await audio.play()}catch{}
    }
  }

  function unlockRoomAudio(){
    resumeRoomAudio().catch(()=>{});
  }

  document.addEventListener('pointerdown',unlockRoomAudio,{passive:true});
  document.addEventListener('touchstart',unlockRoomAudio,{passive:true});
  document.addEventListener('keydown',unlockRoomAudio);
  window.addEventListener('erischat:room-blocks-updated',syncBlockedAudio);
  const socket=()=>window.__erisRoomSocket;
  const signal=(type,to_user_id,payload)=>{if(socket()?.readyState===WebSocket.OPEN)socket().send(JSON.stringify({type,to_user_id,payload}))};
  const button=()=>document.getElementById('erisRoomMicInline');
  const outputButton=()=>document.getElementById('erisRoomAudioOutput');
  function show(){const b=button();if(!b)return;b.classList.toggle('on',!!stream);b.textContent='🎙️';b.setAttribute('aria-pressed',String(!!stream));b.title=stream?'Mikrofon açık — kapat':'Mikrofon kapalı — aç'}
  function showOutput(){const b=outputButton();if(!b)return;b.textContent=outputEnabled?'🔊':'🔈';b.classList.toggle('on',outputEnabled);b.setAttribute('aria-pressed',String(outputEnabled));b.title=outputEnabled?'Oda sesini kapat':'Oda sesini aç';b.setAttribute('aria-label',b.title)}
  async function toggleOutput(){
    outputEnabled=!outputEnabled;localStorage.setItem('eris_room_audio_output',String(outputEnabled));
    for(const [id,audio] of sounds){audio.muted=!outputEnabled||isBlocked(id);if(outputEnabled&&!isBlocked(id)){try{await audio.play()}catch(e){window.toast?.('Tarayıcı sesi başlatmadı. Oda ses düğmesine tekrar dokun.')}}}
    showOutput();window.toast?.(outputEnabled?'Oda sesleri açıldı.':'Oda sesleri kapatıldı.');
  }
  function shouldInitiate(id){return Boolean(myId&&id&&myId<id)}
  async function flushIce(id,pc){const queued=pendingIce.get(id)||[];pendingIce.delete(id);for(const candidate of queued){try{await pc.addIceCandidate(new RTCIceCandidate(candidate))}catch(e){console.warn('[ErisChat] ICE aday sinyali uygulanamadı',e)}}}
  function drop(id){unwatchLevel(id);const timer=reconnectTimers.get(id);if(timer)clearTimeout(timer);reconnectTimers.delete(id);pendingIce.delete(id);const pc=peers.get(id);peers.delete(id);if(pc&&pc.signalingState!=='closed')pc.close();const audio=sounds.get(id);if(audio){audio.srcObject=null;audio.remove()}sounds.delete(id)}
  function peer(id){if(peers.has(id))return peers.get(id);const pc=new RTCPeerConnection({iceServers});peers.set(id,pc);
    pc.onicecandidate=e=>{if(e.candidate)signal('rtc_ice',id,e.candidate.toJSON())};
    pc.ontrack=e=>{let audio=sounds.get(id);if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.muted=!outputEnabled||isBlocked(id);audio.volume=1;audio.dataset.rtcUser=id;audio.style.display='none';document.body.append(audio);sounds.set(id,audio)}const media=e.streams[0]||new MediaStream([e.track]);audio.muted=!outputEnabled||isBlocked(id);audio.srcObject=media;unwatchLevel(id);watchLevel(id,media);if(outputEnabled&&!isBlocked(id))audio.play().catch(()=>{window.toast?.('Oda sesi başlatılamadı. Ses düğmesine dokunarak yeniden dene.')})};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected'){const t=reconnectTimers.get(id);if(t)clearTimeout(t);reconnectTimers.delete(id);return}if(['failed','disconnected'].includes(pc.connectionState)&&!reconnectTimers.has(id)){try{pc.restartIce?.()}catch{}const timer=setTimeout(()=>{reconnectTimers.delete(id);if(pc.connectionState==='connected'||pc.connectionState==='closed')return;drop(id);if(shouldInitiate(id))setTimeout(()=>offer(id).catch(()=>{}),350)},5000);reconnectTimers.set(id,timer)}};
    const trx=pc.addTransceiver('audio',{direction:'sendrecv'});
    if(stream){
      const track=stream.getAudioTracks()[0];
      if(track)trx.sender.replaceTrack(track).catch(e=>console.warn('[ErisChat] mikrofon track bağlanamadı',e));
    }
    return pc;
  }
  async function attachMicrophone(id){
    if(!stream)return;
    const pc=peer(id);
    const track=stream.getAudioTracks()[0];
    if(!track)return;

    let trx=pc.getTransceivers().find(t=>
      t.receiver?.track?.kind==='audio' && !t.stopped
    );

    if(!trx){
      trx=pc.addTransceiver('audio',{direction:'sendrecv'});
    }

    if(trx.sender.track!==track){
      await trx.sender.replaceTrack(track);
    }

    if(!trx.stopped && trx.direction!=='sendrecv'){
      try{trx.direction='sendrecv'}catch{}
    }
  }

  async function offer(id){
    if(id===myId||!shouldInitiate(id)||!socket()||socket().readyState!==WebSocket.OPEN)return;

    const pc=peer(id);

    if(stream){
      for(const track of stream.getTracks()){
        if(pc.getSenders().some(sender=>sender.track===track))continue;

        const reusable=pc.getTransceivers().find(t=>
          t.receiver?.track?.kind==='audio' &&
          !t.sender?.track &&
          !t.stopped
        );

        if(reusable){
          await reusable.sender.replaceTrack(track);
          try{reusable.direction='sendrecv'}catch{}
        }else{
          pc.addTrack(track,stream);
        }
      }
    }

    if(pc.signalingState!=='stable')return;

    const desc=await pc.createOffer({
      iceRestart:pc.iceConnectionState==='failed'
    });

    await pc.setLocalDescription(desc);
    signal('rtc_offer',id,pc.localDescription);
  }

  async function message(d){if(d.type==='rtc_ready'){
      myId=String(d.user_id);
      const fresh=new Set((d.peers||[]).map(String).filter(id=>id&&id!==myId));

      for(const id of [...peers.keys()]){
        if(!fresh.has(id))drop(id);
      }

      known.clear();
      for(const id of fresh)known.add(id);

      resumeRoomAudio().catch(()=>{});
      for(const id of known){
        if(shouldInitiate(id))offer(id).catch(()=>{});
      }
      return;
    }
    if(d.type==='rtc_peer_joined'){const id=String(d.user_id||'');if(id&&id!==myId){known.add(id);if(shouldInitiate(id))await offer(id)}return}
    if(d.type==='rtc_peer_left'){
      const id=String(d.user_id||'');
      if(id&&id!==myId){
        known.delete(id);
        drop(id);
        setTimeout(()=>window.ErisRoomUI?.refresh?.().catch?.(()=>{}),150);
      }
      return;
    }
    const id=String(d.from_user_id||'');if(!id||id===myId)return;known.add(id);
    if(d.type==='rtc_leave'){
      drop(id);
      return;
    }
    try{if(d.type==='rtc_offer'){const pc=peer(id);await pc.setRemoteDescription(new RTCSessionDescription(d.payload));await flushIce(id,pc);const desc=await pc.createAnswer();await pc.setLocalDescription(desc);signal('rtc_answer',id,pc.localDescription)}
      else if(d.type==='rtc_answer'){const pc=peers.get(id);if(pc?.signalingState==='have-local-offer'){await pc.setRemoteDescription(new RTCSessionDescription(d.payload));await flushIce(id,pc)}}
      else if(d.type==='rtc_ice'){const pc=peer(id);if(pc.remoteDescription)await pc.addIceCandidate(new RTCIceCandidate(d.payload));else{const queue=pendingIce.get(id)||[];if(queue.length<64)queue.push(d.payload);pendingIce.set(id,queue)}}
    }catch(e){console.warn('[ErisChat] RTC bağlantısı kurulamadı',e);drop(id)}
  }
  async function stop(){
    microphoneSeat=null;

    const oldStream=stream;
    stream=null;

    if(oldStream){
      const oldTracks=oldStream.getTracks();

      for(const [id,pc] of peers){
        let changed=false;

        for(const transceiver of pc.getTransceivers()){
          const sender=transceiver.sender;

          if(sender?.track && oldTracks.includes(sender.track)){
            try{
              await sender.replaceTrack(null);

              if(!transceiver.stopped){
                try{transceiver.direction='sendrecv'}catch{}
              }

              changed=true;
            }catch(e){
              console.warn('[ErisChat] mikrofon gönderimi kapatılamadı',e);
            }
          }
        }

        /*
         * Mikrofon kapanınca peer bağlantısı yaşamaya devam eder.
         * Audio hattını sendrecv tutup yalnızca yerel mikrofon track'ini kaldırıyoruz.
         */
        if(changed && shouldInitiate(id)){
          offer(id).catch(e=>
            console.warn('[ErisChat] dinleyici moduna geçilemedi',e)
          );
        }
      }

      oldTracks.forEach(track=>{
        try{track.stop()}catch{}
      });
    }

    show();
  }

  async function toggle(){if(stream){stop();return}if(!window.__erisRoomPermissions?.current_user_seat)return window.toast?.('Mikrofon için önce boş bir koltuğa otur.');if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)return window.toast?.('Bu tarayıcı sesli sohbeti desteklemiyor.');if(socket()?.readyState!==WebSocket.OPEN)return window.toast?.('Oda bağlantısı henüz hazır değil.');
    try{const id=window.ErisCurrentRoomId||window.currentRoomId;const cfg=await window.ErisPlatform.api('/rooms/'+encodeURIComponent(id)+'/rtc-config');if(Array.isArray(cfg.ice_servers))iceServers=cfg.ice_servers;
      if(cfg.muted)return window.toast?.('Bu koltuğun mikrofonu susturuldu.');
      if(!cfg.seat_number)return window.toast?.('Mikrofon için önce koltuğa otur.');
      microphoneSeat=Number(cfg.seat_number);
      stream=await navigator.mediaDevices.getUserMedia({audio:audioConstraints,video:false});
      await checkMicrophoneSeat();
      if(!stream)return;stream.getAudioTracks()[0]?.addEventListener('ended',stop,{once:true});show();
      for(const peerId of known){
        try{await attachMicrophone(peerId)}
        catch(e){console.warn('[ErisChat] mikrofon peer bağlantısı başarısız',peerId,e)}
      }
      for(const peerId of known){
        if(shouldInitiate(peerId))await offer(peerId);
      }
      window.toast?.('Mikrofon açıldı')}
    catch(e){stop();window.toast?.(e.name==='NotAllowedError'?'Mikrofon izni verilmedi.':e.message||'Mikrofon açılamadı.')}
  }
  function leaveRoom(){
    microphoneSeat=null;

    if(stream){
      stream.getTracks().forEach(track=>{
        try{track.stop()}catch{}
      });
      stream=null;
    }

    for(const id of known){
      signal('rtc_leave',id,null);
    }

    for(const id of [...peers.keys()]){
      drop(id);
    }

    known.clear();
    pendingIce.clear();

    for(const timer of reconnectTimers.values()){
      clearTimeout(timer);
    }
    reconnectTimers.clear();

    myId=null;
    show();
  }

  speakingStyle();window.ErisRoomRTC={toggle,stop,message,toggleOutput,showOutput,leaveRoom};
  window.addEventListener('erischat:room-opened',()=>{
    outputEnabled=true;
    localStorage.setItem('eris_room_audio_output','true');
    show();
    showOutput();
    resumeRoomAudio().catch(()=>{});
  });

  window.addEventListener('erischat:room-closed',leaveRoom);
})();
