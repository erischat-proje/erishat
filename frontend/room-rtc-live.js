(() => {
  'use strict';
  const peers=new Map(), known=new Set(), sounds=new Map(), pendingIce=new Map(), reconnectTimers=new Map();
  let stream=null, iceServers=[{urls:'stun:stun.l.google.com:19302'}], myId=null;
  let microphoneSeat=null;
  let roomGeneration=0, configRoom=null, configPromise=null, seatCheckBusy=false, micBusy=false;
  let messageQueue=Promise.resolve(), configRetryTimer=null;
  const peerQueues=new Map(), signalCounts=new Map(), recoveryAttempts=new Map();
  let autoSeat=null, autoRoom=null, manualMicOff=false, autoAttempted=false;
  let micRequest=0, outputResumeBusy=false, lastAudioNotice=0, configFetchedAt=0;
  const diagnostics={configErrors:0,signalErrors:0,audioBlocked:0,recoveries:0};
  async function rtcConfigRequest(room){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{return await window.ErisPlatform.api('/rooms/'+encodeURIComponent(room)+'/rtc-config',{signal:controller.signal})}
    finally{clearTimeout(timer)}
  }
  function enqueuePeer(id,operation){
    const generation=roomGeneration, count=signalCounts.get(id)||0;
    if(count>=128){diagnostics.signalErrors++;return Promise.resolve()}
    signalCounts.set(id,count+1);
    const job=(peerQueues.get(id)||Promise.resolve()).then(()=>{
      if(generation===roomGeneration&&known.has(id))return operation();
    }).catch(e=>{diagnostics.signalErrors++;console.warn('[ErisChat] ses bağlantı işlemi',e);const pc=peers.get(id);if(pc)scheduleRecovery(id,pc,1500)})
      .finally(()=>{if(generation!==roomGeneration)return;signalCounts.set(id,Math.max(0,(signalCounts.get(id)||1)-1));if(peerQueues.get(id)===job){peerQueues.delete(id);signalCounts.delete(id)}});
    peerQueues.set(id,job);return job;
  }
  const offerJobs=new Map();
  const currentRoom=()=>String(window.ErisCurrentRoomId||window.currentRoomId||'');
  async function loadConfig(){
    const room=currentRoom(), generation=roomGeneration;
    if(!room)throw new Error('Oda açık değil.');
    if(configRoom===room && configPromise&&(configFetchedAt===0||Date.now()-configFetchedAt<300000))return configPromise;
    configRoom=room;configFetchedAt=0;
    const job=rtcConfigRequest(room).then(cfg=>{
      if(generation!==roomGeneration||currentRoom()!==room)throw new Error('Oda değişti.');
      if(!Array.isArray(cfg.ice_servers)||!cfg.ice_servers.length)throw new Error('Ses bağlantı ayarları alınamadı.');
      iceServers=cfg.ice_servers;
      configFetchedAt=Date.now();
      for(const pc of peers.values()){try{pc.setConfiguration({iceServers})}catch{}}
      return cfg;
    });
    configPromise=job;
    try{return await job}catch(error){if(configPromise===job){configPromise=null;configRoom=null}diagnostics.configErrors++;throw error}
  }
  const audioConstraints={echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1};
  const analysers=new Map();
  let audioContext=null,speakingFrame=0;
  function speakingStyle(){
    if(document.getElementById('eris-rtc-speaking-style'))return;
    const x=document.createElement('style');x.id='eris-rtc-speaking-style';
    x.textContent=`
      #erisRoomSurface .eris-seat.rtc-speaking{animation:none!important}
      #erisRoomSurface .eris-seat .eris-voice-ring{
        position:absolute;inset:-3%;border:2px solid #c6afff;
        border-radius:50%;pointer-events:none;z-index:4;
        opacity:var(--eris-voice-opacity,0);
        transform:scale(var(--eris-voice-scale,1));
        transition:opacity .12s linear,transform .07s linear;
        box-shadow:0 0 10px #a57cff44;
      }

      @media(prefers-reduced-motion:reduce){
        #erisRoomSurface .eris-seat .eris-voice-ring{
          transform:none;transition:opacity .12s linear
        }
      }
    `;
    document.head.append(x);
  }
  function markSpeaking(id,on,level=0){
    document.querySelectorAll('#erisRoomSurface .eris-seat').forEach(seat=>{
      if(String(seat.dataset.userId||'')!==String(id))return;
      seat.classList.remove('rtc-speaking');
      let ring=seat.querySelector('.eris-voice-ring');
      if(!ring&&on){
        ring=document.createElement('span');
        ring.className='eris-voice-ring';
        ring.setAttribute('aria-hidden','true');
        seat.append(ring);
      }
      if(!ring)return;
      ring.style.setProperty('--eris-voice-opacity',on?String(.4+level*.5):'0');
      ring.style.setProperty('--eris-voice-scale',String(1+level*.07));
    });
  }
  function watchLevel(id,media){
    try{
      unwatchLevel(id);
      audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
      audioContext.resume?.().catch(()=>{});
      const source=audioContext.createMediaStreamSource(media);
      const analyser=audioContext.createAnalyser();
      analyser.fftSize=512;
      source.connect(analyser);
      analysers.set(String(id),{
        source,analyser,media,
        data:new Uint8Array(analyser.fftSize),
        level:0,lastVoice:0
      });
      if(!speakingFrame)scanLevels();
    }catch(e){console.warn('[ErisChat] konuşma göstergesi başlatılamadı',e)}
  }
  function scanLevels(){
    speakingFrame=requestAnimationFrame(scanLevels);
    const now=performance.now();
    for(const [id,x] of analysers){
      x.analyser.getByteTimeDomainData(x.data);
      let sum=0;
      for(const v of x.data){const n=(v-128)/128;sum+=n*n}
      const audible=audioContext.state==='running'&&
        x.media.getAudioTracks().some(t=>t.enabled&&!t.muted&&t.readyState==='live');
      const rms=audible?Math.sqrt(sum/x.data.length):0;
      const threshold=(x.lastVoice&&now-x.lastVoice<160) ? .012 : .018;
      if(rms>threshold)x.lastVoice=now;
      const on=audible&&x.lastVoice>0&&now-x.lastVoice<160;
      const target=on?Math.min(1,Math.max(0,(rms-.012)/.16)):0;
      x.level+=(target-x.level)*(target>x.level ? .6 : .22);
      markSpeaking(id,on,x.level);
    }
  }
  function unwatchLevel(id){
    const x=analysers.get(String(id));
    if(x){
      try{x.source.disconnect();x.analyser.disconnect()}catch{}
      analysers.delete(String(id));
    }
    markSpeaking(id,false);
    if(!analysers.size&&speakingFrame){
      cancelAnimationFrame(speakingFrame);speakingFrame=0;
    }
  }
  async function checkMicrophoneSeat(){
    if(!stream){syncSeatMicrophone();return}if(seatCheckBusy)return;
    const checkedStream=stream, room=currentRoom(), generation=roomGeneration;
    if(!room)return;
    seatCheckBusy=true;
    try{
      const cfg=await rtcConfigRequest(room);
      if(generation!==roomGeneration||stream!==checkedStream||currentRoom()!==room)return;
      if(cfg.muted||!cfg.seat_number||Number(cfg.seat_number)!==Number(microphoneSeat)){
        await stop();
        window.toast?.(cfg.muted?'Koltuk mikrofonun yetkili tarafından susturuldu.':'Koltuktan ayrıldığın için mikrofon kapandı.');
      }
    }catch(e){
      if(generation===roomGeneration&&stream===checkedStream&&[401,403,404].includes(e.status)){
        await stop();window.toast?.('Oda erişimi sona erdi; mikrofon kapatıldı.');
      }
    }finally{seatCheckBusy=false}
  }
  window.setInterval(checkMicrophoneSeat,2500);

  let outputEnabled=true;
  localStorage.setItem('eris_room_audio_output','true');
  const isBlocked=id=>!!window.ErisRoomBlocks?.has?.(String(id));
  function syncBlockedAudio(){
    for(const [id,audio] of sounds){
      audio.muted=!outputEnabled||isBlocked(id);
      if(!audio.muted)audio.play().catch(()=>{});
    }
  }

  async function resumeRoomAudio(){
    if(!outputEnabled||outputResumeBusy)return;
    outputResumeBusy=true;
    try{
      try{await audioContext?.resume?.()}catch{}
      await Promise.allSettled([...sounds].map(async([id,audio])=>{
        audio.muted=!outputEnabled||isBlocked(id);
        if(!audio.muted)await playAudio(audio);
      }));
    }finally{outputResumeBusy=false}
  }
  async function playAudio(audio){
    try{await audio.play()}catch(e){
      if(e.name==='AbortError')return;
      diagnostics.audioBlocked++;
      if(Date.now()-lastAudioNotice>15000){lastAudioNotice=Date.now();window.toast?.('Oda sesini başlatmak için ses düğmesine dokun.')}
    }
  }
  function unlockRoomAudio(){
    try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();audioContext.resume?.().catch(()=>{})}catch{}
    resumeRoomAudio().catch(()=>{});
  }

  document.addEventListener('pointerdown',unlockRoomAudio,{passive:true});
  document.addEventListener('touchstart',unlockRoomAudio,{passive:true});
  document.addEventListener('keydown',unlockRoomAudio);
  window.addEventListener('erischat:room-blocks-updated',syncBlockedAudio);
  const socket=()=>window.__erisRoomSocket;
  const signal=(type,to_user_id,payload)=>{const ws=socket();if(ws?.readyState!==WebSocket.OPEN)return false;try{ws.send(JSON.stringify({type,to_user_id,payload}));return true}catch{return false}};
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
  async function flushIce(id,pc){const queued=pendingIce.get(id)||[];pendingIce.delete(id);for(const candidate of queued){if(candidate._eris_offer&&pc._erisOffer&&candidate._eris_offer!==pc._erisOffer)continue;try{await pc.addIceCandidate(new RTCIceCandidate(candidate))}catch(e){console.warn('[ErisChat] ICE aday sinyali uygulanamadı',e)}}}
  function drop(id){
    unwatchLevel(id);clearTimeout(reconnectTimers.get(id));reconnectTimers.delete(id);pendingIce.delete(id);
    const pc=peers.get(id);peers.delete(id);
    if(pc){pc.onicecandidate=null;pc.ontrack=null;pc.onnegotiationneeded=null;pc.onconnectionstatechange=null;pc.oniceconnectionstatechange=null;try{pc.close()}catch{}}
    const audio=sounds.get(id);if(audio){audio.pause?.();audio.srcObject=null;audio.remove()}sounds.delete(id);
  }
  function peer(id){
    const previous=peers.get(id);if(previous&&previous.signalingState!=='closed')return previous;
    if(previous)drop(id);
    const pc=new RTCPeerConnection({iceServers});peers.set(id,pc);
    pc.onicecandidate=e=>{if(peers.get(id)===pc&&e.candidate)signal('rtc_ice',id,{...e.candidate.toJSON(),_eris_offer:pc._erisOffer})};
    pc.ontrack=e=>{
      if(peers.get(id)!==pc||e.track.kind!=='audio')return;pc._erisTrackEnded=false;
      let audio=sounds.get(id);
      if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.setAttribute('playsinline','');audio.volume=1;audio.dataset.rtcUser=id;audio.style.display='none';document.body.append(audio);sounds.set(id,audio)}
      const media=e.streams?.[0]||new MediaStream([e.track]);
      audio.muted=!outputEnabled||isBlocked(id);audio.srcObject=media;
      unwatchLevel(id);watchLevel(id,media);
      e.track.addEventListener('unmute',()=>{if(peers.get(id)===pc&&outputEnabled&&!isBlocked(id))playAudio(audio)});
      e.track.addEventListener('ended',()=>{if(peers.get(id)===pc){pc._erisTrackEnded=true;scheduleRecovery(id,pc,1000)}},{once:true});
      if(outputEnabled&&!isBlocked(id))playAudio(audio);
    };
    pc.onnegotiationneeded=()=>{if(shouldInitiate(id))offer(id)};
    const connectionChanged=()=>{
      if(peers.get(id)!==pc)return;
      if(pc.connectionState==='connected'&&pc.iceConnectionState!=='failed'&&!pc._erisTrackEnded){
        clearTimeout(reconnectTimers.get(id));reconnectTimers.delete(id);recoveryAttempts.delete(id);resumeRoomAudio();return;
      }
      if(pc.connectionState==='failed'||pc.iceConnectionState==='failed'){clearTimeout(reconnectTimers.get(id));reconnectTimers.delete(id);scheduleRecovery(id,pc,1000)}
      else if(pc.connectionState==='disconnected'||pc.iceConnectionState==='disconnected'){clearTimeout(reconnectTimers.get(id));reconnectTimers.delete(id);scheduleRecovery(id,pc,5000)}
    };
    pc.onconnectionstatechange=connectionChanged;pc.oniceconnectionstatechange=connectionChanged;
    // The incoming offer supplies the receiving transceiver. Creating another
    // before SRD can leave the microphone attached to an unused audio m-line.
    if(shouldInitiate(id))pc.addTransceiver('audio',{direction:'sendrecv'});
    scheduleRecovery(id,pc,20000);
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

  function scheduleRecovery(id,pc,delay){
    if(reconnectTimers.has(id))return;
    const generation=roomGeneration;
    reconnectTimers.set(id,setTimeout(()=>{
      reconnectTimers.delete(id);
      if(generation!==roomGeneration||peers.get(id)!==pc||!known.has(id))return;
      if(pc.connectionState==='connected'&&pc.iceConnectionState!=='failed'&&!pc._erisTrackEnded)return;
      enqueuePeer(id,async()=>{
        if(peers.get(id)!==pc)return;
        const attempts=(recoveryAttempts.get(id)||0)+1;recoveryAttempts.set(id,attempts);diagnostics.recoveries++;
        if(attempts%3===0||pc._erisTrackEnded){drop(id);if(shouldInitiate(id))await makeOffer(id,true);else signal('rtc_reconnect',id,{reset:true});return}
        if(shouldInitiate(id)){
          if(pc.signalingState==='have-local-offer')await pc.setLocalDescription({type:'rollback'});
          try{pc.restartIce?.()}catch{}
          await makeOffer(id,true);
        }else signal('rtc_reconnect',id,{reset:false});
        const active=peers.get(id);if(active)scheduleRecovery(id,active,Math.min(30000,5000*attempts));
      });
    },delay));
  }
  function offer(id,restart=false){
    if(offerJobs.has(id))return offerJobs.get(id);
    const job=enqueuePeer(id,()=>makeOffer(id,restart)).finally(()=>{if(offerJobs.get(id)===job)offerJobs.delete(id)});
    offerJobs.set(id,job);return job;
  }
  async function makeOffer(id,restart=false){
    if(id===myId||!shouldInitiate(id)||!socket()||socket().readyState!==WebSocket.OPEN)return;

    const generation=roomGeneration, signalingSocket=socket();
    await loadConfig();
    if(generation!==roomGeneration||socket()!==signalingSocket)return;
    if(!known.has(id)||socket()?.readyState!==WebSocket.OPEN)return;
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

    pc._erisOffer=String(roomGeneration)+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const desc=await pc.createOffer({
      iceRestart:restart||pc.iceConnectionState==='failed'
    });

    if(generation!==roomGeneration||peers.get(id)!==pc||socket()!==signalingSocket)return;
    await pc.setLocalDescription(desc);
    if(generation!==roomGeneration||peers.get(id)!==pc||socket()!==signalingSocket)return;
    signal('rtc_offer',id,{type:pc.localDescription.type,sdp:pc.localDescription.sdp,_eris_offer:pc._erisOffer});
  }

  function message(d){
    if(!d||typeof d.type!=='string')return Promise.resolve();
    if(d.type==='rtc_ready'){roomGeneration++;peerQueues.clear();signalCounts.clear()}
    const generation=roomGeneration;
    if(d.type==='rtc_ready'){
      messageQueue=messageQueue.then(()=>{if(generation===roomGeneration)return handleMessage(d)}).catch(e=>console.warn('[ErisChat] ses başlangıcı',e));
      return messageQueue;
    }
    if(d.type==='room_seat_muted')return handleMessage(d);
    const id=String(d.from_user_id||d.user_id||'');
    return messageQueue.then(()=>{
      if(generation!==roomGeneration)return;
      if(d.type==='rtc_peer_joined'||d.type==='rtc_peer_left'||d.type==='rtc_roster')return handleMessage(d);
      if(!id||id===myId||!known.has(id))return;
      return enqueuePeer(id,()=>handleMessage(d));
    });
  }
  async function handleMessage(d){if(d.type==='rtc_ready'){
      myId=String(d.user_id);autoAttempted=false;configPromise=null;configRoom=null;offerJobs.clear();
      const fresh=new Set((d.peers||[]).map(String).filter(id=>id&&id!==myId));

      for(const id of [...peers.keys()]){
        if(!fresh.has(id))drop(id);
      }

      known.clear();
      for(const id of fresh)known.add(id);

      // A new signaling session cannot reuse an unanswered offer from the old socket.
      for(const id of [...peers.keys()])drop(id);
      try{await loadConfig()}catch(e){
        const generation=roomGeneration;clearTimeout(configRetryTimer);
        configRetryTimer=setTimeout(()=>{
          configRetryTimer=null;
          if(generation===roomGeneration&&socket()?.readyState===WebSocket.OPEN)message(d);
        },3000);
        throw e;
      }
      clearTimeout(configRetryTimer);configRetryTimer=null;
      resumeRoomAudio().catch(()=>{});
      syncSeatMicrophone();
      for(const id of known){
        peer(id);if(shouldInitiate(id))offer(id).catch(()=>{});
      }
      return;
    }
    if(d.type==='rtc_peer_joined'){const id=String(d.user_id||'');if(id&&id!==myId){known.add(id);drop(id);recoveryAttempts.delete(id);peer(id);offer(id)}return}
    if(d.type==='rtc_roster'){
      const fresh=new Set((d.peers||[]).map(String).filter(id=>id&&id!==myId));
      for(const id of known)if(!fresh.has(id)){known.delete(id);drop(id);recoveryAttempts.delete(id)}
      for(const id of fresh){known.add(id);if(!peers.has(id)){peer(id);if(shouldInitiate(id))offer(id)}}
      return;
    }
    if(d.type==='rtc_peer_left'){
      const id=String(d.user_id||'');
      if(id&&id!==myId){
        known.delete(id);
        drop(id);
        setTimeout(()=>window.ErisRoomUI?.refresh?.().catch?.(()=>{}),150);
      }
      return;
    }
    if(d.type==='room_seat_muted'){
  if(d.user_id&&String(d.user_id)!==myId)return;
  if(d.muted&&(!d.user_id||String(d.user_id)===myId)){
    await stop();
    window.toast?.('Oda yönetimi mikrofonunuzu kapattı.');
  }else{
    window.toast?.('Mikrofon susturmanız kaldırıldı. Mikrofonu tekrar açabilirsiniz.');
  }
  window.ErisRoomUI?.refresh?.().catch?.(()=>{});
  return;
}
const id=String(d.from_user_id||'');if(!id||id===myId||!known.has(id))return;
    if(d.type==='rtc_leave'){
      drop(id);
      return;
    }
    if(d.type==='rtc_reconnect'){
      if(!shouldInitiate(id))return;
      if(d.payload?.reset)drop(id);
      const pc=peers.get(id);
      if(pc?.signalingState==='have-local-offer')await pc.setLocalDescription({type:'rollback'});
      await makeOffer(id,true);return;
    }
    const generation=roomGeneration, ws=socket();
    try{
      await loadConfig();
      if(generation!==roomGeneration||ws!==socket()||!known.has(id))return;
      if(d.type==='rtc_offer'){
        const pc=peer(id);
        if(pc.signalingState==='have-local-offer'){
          if(shouldInitiate(id))return;
          await pc.setLocalDescription({type:'rollback'});
        }
        pc._erisOffer=d.payload?._eris_offer||null;
        await pc.setRemoteDescription(new RTCSessionDescription(d.payload));
        await attachMicrophone(id);
        await flushIce(id,pc);
        const desc=await pc.createAnswer();
        if(generation!==roomGeneration||peers.get(id)!==pc||ws!==socket())return;
        await pc.setLocalDescription(desc);
        signal('rtc_answer',id,{type:pc.localDescription.type,sdp:pc.localDescription.sdp,_eris_offer:pc._erisOffer});
      }else if(d.type==='rtc_answer'){
        const pc=peers.get(id);
        if(pc?.signalingState==='have-local-offer'&&(!d.payload?._eris_offer||d.payload._eris_offer===pc._erisOffer)){
          await pc.setRemoteDescription(new RTCSessionDescription(d.payload));await flushIce(id,pc);
        }
      }else if(d.type==='rtc_ice'){
        const pc=peers.get(id);
        if(pc?.remoteDescription){
          if(d.payload?._eris_offer&&pc._erisOffer&&d.payload._eris_offer!==pc._erisOffer)return;
          try{await pc.addIceCandidate(new RTCIceCandidate(d.payload))}catch(e){diagnostics.signalErrors++;console.warn('[ErisChat] eski/geçersiz ICE adayı',e)}
        }else{
          const queue=pendingIce.get(id)||[];if(queue.length<64)queue.push(d.payload);pendingIce.set(id,queue);
        }
      }
    }catch(e){diagnostics.signalErrors++;console.warn('[ErisChat] RTC bağlantısı kurulamadı',e);const pc=peers.get(id);if(pc)scheduleRecovery(id,pc,1500)}
  }
  async function stop(){
    micRequest++;microphoneSeat=null;
    if(myId)unwatchLevel(myId);
    const oldStream=stream;stream=null;show();
    if(!oldStream)return;
    const oldTracks=oldStream.getTracks();
    oldTracks.forEach(track=>{try{track.stop()}catch{}});
    await Promise.allSettled([...peers].map(([id,pc])=>enqueuePeer(id,async()=>{
      if(peers.get(id)!==pc)return;
      for(const transceiver of pc.getTransceivers()){
        if(oldTracks.includes(transceiver.sender?.track)){
          await transceiver.sender.replaceTrack(null);
          if(!transceiver.stopped)transceiver.direction='sendrecv';
        }
      }
    })));
  }

  async function toggle(){manualMicOff=!!stream||micBusy;autoAttempted=false;return startMicrophone()}
  async function startMicrophone(){if(stream){await stop();return}if(micBusy){micRequest++;window.toast?.('Mikrofon açma işlemi iptal edildi.');return}if(!window.__erisRoomPermissions?.current_user_seat)return window.toast?.('Mikrofon için önce boş bir koltuğa otur.');if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)return window.toast?.('Bu tarayıcı sesli sohbeti desteklemiyor.');if(socket()?.readyState!==WebSocket.OPEN)return window.toast?.('Oda bağlantısı henüz hazır değil.');
    micBusy=true;const request=++micRequest,generation=roomGeneration;const room=currentRoom();
    try{const cfg=await rtcConfigRequest(room);
      if(request!==micRequest||generation!==roomGeneration||currentRoom()!==room)return;
      if(Array.isArray(cfg.ice_servers)){iceServers=cfg.ice_servers;for(const pc of peers.values()){try{pc.setConfiguration({iceServers})}catch{}}}
      if(cfg.muted)return window.toast?.('Bu koltuğun mikrofonu susturuldu.');
      if(!cfg.seat_number)return window.toast?.('Mikrofon için önce koltuğa otur.');
      microphoneSeat=Number(cfg.seat_number);
      let captured;
      try{captured=await navigator.mediaDevices.getUserMedia({audio:audioConstraints,video:false})}
      catch(e){if(e.name!=='OverconstrainedError')throw e;captured=await navigator.mediaDevices.getUserMedia({audio:true,video:false})}
      if(request!==micRequest||generation!==roomGeneration||currentRoom()!==room||socket()?.readyState!==WebSocket.OPEN){captured.getTracks().forEach(t=>t.stop());return}
      stream=captured;
      await checkMicrophoneSeat();
      if(!stream)return;const activeStream=stream;watchLevel(myId,stream);stream.getAudioTracks()[0]?.addEventListener('ended',()=>{if(stream===activeStream)stop()},{once:true});show();
      for(const peerId of known){
        if(request!==micRequest||stream!==activeStream)return;
        try{await enqueuePeer(peerId,()=>attachMicrophone(peerId))}
        catch(e){console.warn('[ErisChat] mikrofon peer bağlantısı başarısız',peerId,e)}
      }
      for(const peerId of known){
        if(shouldInitiate(peerId))await offer(peerId);
      }
      if(request===micRequest&&stream===activeStream)window.toast?.('Mikrofon açıldı')}
    catch(e){if(request===micRequest&&generation===roomGeneration){stop();const notices={NotAllowedError:window.ErisChatAndroid ? 'Mikrofon izni verilmedi. Android Ayarlar → Uygulamalar → ErisChat → İzinler bölümünden mikrofonu açıp yeniden dene.' : 'Mikrofon izni verilmedi.',NotFoundError:'Mikrofon bulunamadı.',NotReadableError:'Mikrofon başka bir uygulamada kullanılıyor veya erişilemiyor.'};window.toast?.(notices[e.name]||e.message||'Mikrofon açılamadı.')}}finally{micBusy=false;if(currentRoom()===room&&(generation!==roomGeneration||(request!==micRequest&&!manualMicOff&&!autoAttempted)))syncSeatMicrophone()}
  }
  function leaveRoom(){
    autoSeat=null;autoRoom=null;manualMicOff=false;autoAttempted=false;
    clearTimeout(configRetryTimer);configRetryTimer=null;
    roomGeneration++;configRoom=null;configPromise=null;offerJobs.clear();peerQueues.clear();signalCounts.clear();recoveryAttempts.clear();messageQueue=Promise.resolve();micRequest++;
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

    if(myId)unwatchLevel(myId);myId=null;
    for(const id of [...analysers.keys()])unwatchLevel(id);
    try{audioContext?.close?.().catch(()=>{})}catch{}audioContext=null;
    show();
  }

  function recoverNetwork(){
    if(!currentRoom())return;
    resumeRoomAudio();
    for(const [id,pc]of peers){if(shouldInitiate(id))offer(id,true);else if(pc.connectionState!=='connected')signal('rtc_reconnect',id,{reset:false})}
    checkMicrophoneSeat();
  }
  window.addEventListener('online',recoverNetwork);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')recoverNetwork()});
  navigator.mediaDevices?.addEventListener?.('devicechange',()=>{resumeRoomAudio();checkMicrophoneSeat()});
  function syncSeatMicrophone(room){
    const id=currentRoom();if(!id)return;
    if(room&&String(room.id)!==id)return;
    const seat=Number(room?.current_user_seat??window.__erisRoomPermissions?.current_user_seat)||null;
    const own=(room?.seats||[]).find(s=>String(s.user_id)===String(myId||window.ErisCurrentUserId));
    if(autoRoom!==id||autoSeat!==seat){
      autoRoom=id;autoSeat=seat;manualMicOff=false;autoAttempted=false;
      if(stream&&Number(microphoneSeat)!==seat)stop();
    }
    if(!seat||own?.muted){if(stream||micBusy)stop();return;}
    if(stream||micBusy||manualMicOff||autoAttempted||!myId||socket()?.readyState!==WebSocket.OPEN)return;
    autoAttempted=true;
    startMicrophone().catch(()=>{});
  }
  window.addEventListener('erischat:room-state-updated',event=>{
    syncSeatMicrophone(event.detail?.room);
    resumeRoomAudio().catch(()=>{});
  });
  speakingStyle();window.ErisRoomRTC={toggle,stop,message,toggleOutput,showOutput,leaveRoom,syncSeatMicrophone,unlockAudio:unlockRoomAudio,
    diagnostics:()=>({...diagnostics,peers:[...peers].map(([id,pc])=>({id,connection:pc.connectionState,ice:pc.iceConnectionState,signaling:pc.signalingState})),microphone:!!stream,output:outputEnabled})};
  window.addEventListener('erischat:room-opened',event=>{
    outputEnabled=true;
    localStorage.setItem('eris_room_audio_output','true');
    show();
    showOutput();
    syncSeatMicrophone(event.detail?.room);
    resumeRoomAudio().catch(()=>{});
  });

  window.addEventListener('erischat:room-closed',leaveRoom);
})();
