(() => {
  'use strict';
  const picked=new WeakMap(), durations=new WeakMap();
  let active=null;
  const paths={camera:'<path d="M4 6h4l2-3h4l2 3h4v14H4z"/><circle cx="12" cy="12" r="4"/>',image:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',video:'<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 6-4v12l-6-4"/>',flip:'<path d="M4 8a8 8 0 0 1 14-3l2 3M20 3v5h-5M20 16a8 8 0 0 1-14 3l-2-3M4 21v-5h5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 5"/>',room:'<path d="M4 21V3h16v18M9 21V11h6v10M8 7h1M15 7h1"/>'};
  const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.camera)+'</svg>';
  function selected(input){return picked.get(input)||input.files?.[0]||null}
  function clear(input){picked.delete(input);input.value=''}
  function cancel(input){if(active?.input===input)active.close()}
  function choose(input,camera){
    if(!camera){picked.delete(input);input.value='';input.accept='image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';input.removeAttribute('capture');input.click();return;}
    if(active)return;
    capture(input).then(file=>{if(!file||!input.isConnected)return;picked.set(input,file);input.dispatchEvent(new Event('change',{bubbles:true}))}).catch(error=>window.toast?.(error.message));
  }
  function capture(input){
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='eris-camera';
      modal.innerHTML='<section role="dialog" aria-modal="true" aria-label="Kamera"><header><button data-close aria-label="Kamerayı kapat">'+icon('close')+'</button><strong>Kamera</strong><button data-flip aria-label="Ön ve arka kamera arasında geç">'+icon('flip')+'</button></header><div class="ec-camera-view"><video autoplay muted playsinline></video><div class="ec-camera-guide"></div><span data-timer hidden>00:00 / 00:30</span></div><p data-status role="status">Kamera açılıyor…</p><div class="ec-camera-modes"><button data-mode="photo" aria-pressed="true">Fotoğraf</button><button data-mode="video" aria-pressed="false">Video · 30 sn</button></div><footer><button data-native>Telefon kamerası</button><button data-shutter class="ec-camera-shutter" aria-label="Fotoğraf çek" disabled><i></i></button><span data-lens>Arka kamera</span></footer></section>';
      document.body.append(modal);
      const video=modal.querySelector('video'),status=modal.querySelector('[data-status]'),shutter=modal.querySelector('[data-shutter]'),flip=modal.querySelector('[data-flip]'),timer=modal.querySelector('[data-timer]');
      let stream=null,mode='photo',facing='environment',closed=false,loading=false,generation=0,recorder=null,clock=null,limit=null,started=0,recording=false,acceptRecording=true;
      const stopTracks=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null};
      const close=file=>{if(closed)return;closed=true;generation++;clearInterval(clock);clearTimeout(limit);acceptRecording=false;if(recorder?.state==='recording')recorder.stop();stopTracks();document.removeEventListener('keydown',escape);document.removeEventListener('visibilitychange',visibility);modal.remove();active=null;resolve(file||null)};
      const escape=e=>{if(e.key==='Escape')close()};
      const visibility=()=>{if(document.hidden)close()};
      active={input,close};document.addEventListener('keydown',escape);document.addEventListener('visibilitychange',visibility);
      function notice(error){const messages={NotAllowedError:'Kamera izni verilmedi. Uygulama izinlerinden kamerayı açıp tekrar dene.',NotFoundError:'Bu cihazda kamera bulunamadı.',NotReadableError:'Kamera başka bir uygulamada kullanılıyor.',OverconstrainedError:'Bu kamera seçeneği kullanılamıyor.'};status.textContent=messages[error.name]||error.message||'Kamera açılamadı.';if(window.ErisChatAndroid&&!window.ErisChatAndroid.cameraVersion)status.textContent='Bu APK kamera önizlemesini desteklemiyor. Güncel APK’yı kur veya Telefon kamerası seçeneğini dene.';}
      async function start(){
        const revision=++generation;loading=true;shutter.disabled=true;flip.disabled=true;stopTracks();
        try{
          if(!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera önizlemesi bu cihazda kullanılamıyor. Telefon kamerasını deneyebilirsin.');
          const constraints={video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:mode==='video'};
          const media=await navigator.mediaDevices.getUserMedia(constraints);
          if(closed||revision!==generation){media.getTracks().forEach(t=>t.stop());return;}
          stream=media;video.srcObject=media;video.style.transform=facing==='user'?'scaleX(-1)':'';await video.play();
          if(closed||revision!==generation)return;
          const settings=media.getVideoTracks()[0]?.getSettings?.();if(settings?.facingMode)facing=settings.facingMode;
          modal.querySelector('[data-lens]').textContent=facing==='user'?'Ön kamera':'Arka kamera';
          status.textContent=mode==='photo'?'Hazırsan çekim düğmesine dokun.':'Sesli video en fazla 30 saniye.';shutter.disabled=false;
        }catch(error){if(!closed&&revision===generation){stopTracks();notice(error)}}finally{if(!closed&&revision===generation){loading=false;flip.disabled=false}}
      }
      function stopRecording(){if(recorder?.state==='recording')recorder.stop()}
      async function shoot(){
        if(loading||!stream)return;
        if(recording){stopRecording();return;}
        if(mode==='photo'){
          if(!video.videoWidth){status.textContent='Kamera görüntüsünü bekle.';return;}
          shutter.disabled=true;const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);
          canvas.toBlob(blob=>{if(closed)return;if(!blob){shutter.disabled=false;status.textContent='Fotoğraf çekilemedi.';return}close(new File([blob],'erischat-'+Date.now()+'.jpg',{type:'image/jpeg'}))},'image/jpeg',.9);return;
        }
        if(!window.MediaRecorder){status.textContent='Video kaydı desteklenmiyor. Telefon kamerasını kullan.';return;}
        try{
          const mime=['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
          if(!mime)throw new Error('Video biçimi desteklenmiyor. Telefon kamerasını kullan.');
          const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000,audioBitsPerSecond:128000});started=performance.now();acceptRecording=true;
          recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
          recorder.onerror=()=>{acceptRecording=false;stopRecording();status.textContent='Video kaydı tamamlanamadı. Tekrar dene.'};
          recorder.onstop=()=>{clearInterval(clock);clearTimeout(limit);recording=false;flip.disabled=false;shutter.classList.remove('recording');timer.hidden=true;modal.querySelectorAll('[data-mode]').forEach(b=>b.disabled=false);if(closed||!acceptRecording)return;const seconds=(performance.now()-started)/1000;const blob=new Blob(chunks,{type:mime.split(';')[0]});if(!blob.size||seconds>31){status.textContent='Video kaydı geçersiz. Yeniden çek.';return}const file=new File([blob],'erischat-'+Date.now()+(mime.startsWith('video/mp4')?'.mp4':'.webm'),{type:blob.type});durations.set(file,Math.min(seconds,30));close(file)};
          recorder.start(250);recording=true;flip.disabled=true;modal.querySelectorAll('[data-mode]').forEach(b=>b.disabled=true);shutter.classList.add('recording');shutter.setAttribute('aria-label','Kaydı durdur');timer.hidden=false;status.textContent='Kaydediliyor… Durdurmak için tekrar dokun.';
          clock=setInterval(()=>{timer.textContent='00:'+String(Math.min(30,Math.floor((performance.now()-started)/1000))).padStart(2,'0')+' / 00:30'},200);limit=setTimeout(stopRecording,29500);
        }catch(error){notice(error)}
      }
      modal.querySelector('[data-close]').onclick=()=>close();flip.onclick=()=>{if(recording||loading)return;facing=facing==='user'?'environment':'user';start()};shutter.onclick=shoot;
      modal.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(recording||loading||b.dataset.mode===mode)return;mode=b.dataset.mode;modal.querySelectorAll('[data-mode]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));shutter.setAttribute('aria-label',mode==='photo'?'Fotoğraf çek':'Video kaydet');start()});
      modal.querySelector('[data-native]').onclick=()=>{const type=mode==='photo'?'image/*':'video/*';close();picked.delete(input);input.value='';input.accept=type;input.setAttribute('capture',facing);input.click()};
      start();
    });
  }
  async function validate(file,videoMB){
    if(!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm))$/.test(file.type))throw new Error('JPG, PNG, WEBP, GIF, MP4 veya WEBM seç.');
    const video=file.type.startsWith('video/');if(file.size>(video?videoMB:10)*1024*1024)throw new Error(video?'Video en fazla '+videoMB+' MB olabilir.':'Fotoğraf en fazla 10 MB olabilir.');if(!video)return;
    if(durations.has(file)){if(durations.get(file)>30)throw new Error('Video en fazla 30 saniye olabilir.');return;}
    await new Promise((resolve,reject)=>{const clip=document.createElement('video'),url=URL.createObjectURL(file);let done=false,seeking=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timeout);clip.onloadedmetadata=null;clip.onseeked=null;clip.ondurationchange=null;clip.onerror=null;clip.removeAttribute('src');clip.load();URL.revokeObjectURL(url);error?reject(error):resolve()};
      const check=()=>{if(Number.isFinite(clip.duration)&&clip.duration>0)finish(clip.duration>30?new Error('Video en fazla 30 saniye olabilir.'):null);else if(!seeking){seeking=true;clip.currentTime=1e10}};
      const timeout=setTimeout(()=>finish(new Error('Video süresi okunamadı. Başka bir video seç.')),15000);clip.preload='metadata';clip.onloadedmetadata=check;clip.ondurationchange=()=>{if(Number.isFinite(clip.duration)&&clip.duration>0)check()};clip.onseeked=()=>{if(Number.isFinite(clip.duration))check();else if(Number.isFinite(clip.currentTime)&&clip.currentTime>0&&clip.currentTime<1e9)finish(clip.currentTime>30?new Error('Video en fazla 30 saniye olabilir.'):null)};clip.onerror=()=>finish(new Error('Video okunamadı.'));clip.src=url;
    });
  }
  function bindDialog(modal,close){
    const previous=document.activeElement,oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const key=e=>{if(active||!modal.isConnected)return;if(e.key==='Escape'){e.preventDefault();close();return}if(e.key!=='Tab')return;const nodes=[...modal.querySelectorAll('button:not(:disabled),textarea,input:not([type=file]),select')].filter(n=>!n.hidden&&n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}};
    document.addEventListener('keydown',key);modal.querySelector('[data-close]')?.focus();
    const observer=new MutationObserver(()=>{if(modal.isConnected)return;document.removeEventListener('keydown',key);observer.disconnect();document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus()});observer.observe(document.body,{childList:true});
  }
  window.ErisSocialMedia={choose,validate,selected,clear,cancel,icon,bindDialog};
})();
