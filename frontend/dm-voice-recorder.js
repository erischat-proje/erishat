/* Voice drafts live only in the active conversation; sending always needs a preview action. */
(() => {
  'use strict';
  const MAX_MS=120000, MAX_BYTES=12*1024*1024;
  const time=ms=>{const s=Math.floor(Math.min(ms,MAX_MS)/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
  function create({host,valid,send,changed=()=>{},notice=()=>{}}){
    let current=null;
    const active=job=>current===job&&!job.cancelled;
    const elapsed=job=>job.elapsed+(job.mode==='recording'?performance.now()-job.started:0);
    function stopTracks(job){for(const track of job.stream?.getTracks?.()||[]){track.onended=null;try{track.stop()}catch{}}}
    function dispose(job){
      if(!job||!active(job))return;current=null;job.cancelled=true;clearInterval(job.timer);
      document.removeEventListener('visibilitychange',job.visibility);window.removeEventListener('pagehide',job.pagehide);
      if(job.recorder){job.recorder.onstop=job.recorder.ondataavailable=job.recorder.onerror=null;try{if(job.recorder.state!=='inactive')job.recorder.stop()}catch{}}
      stopTracks(job);if(job.audio){job.audio.pause();job.audio.removeAttribute('src');job.audio.load()}
      if(job.url)URL.revokeObjectURL(job.url);job.chunks=[];job.file=null;job.panel.remove();changed(false);
    }
    function ensure(job){if(!active(job))return false;if(!valid()||!host.isConnected){dispose(job);return false}return true}
    function controls(job){
      const mode=job.mode;job.panel.dataset.state=mode;
      job.panel.querySelector('[data-voice-pause]').hidden=!['recording','paused'].includes(mode)||!job.recorder?.pause||!job.recorder?.resume;
      job.panel.querySelector('[data-voice-pause]').textContent=mode==='paused'?'Devam et':'Duraklat';
      job.panel.querySelector('[data-voice-stop]').hidden=!['recording','paused'].includes(mode);
      job.panel.querySelector('[data-voice-send]').hidden=!['preview','sending'].includes(mode);
      job.panel.querySelectorAll('button').forEach(b=>b.disabled=mode==='sending'||mode==='finishing');
      job.panel.querySelector('[data-voice-time]').textContent=time(elapsed(job))+' / 02:00';
    }
    function pause(job){
      if(!ensure(job)||!['recording','paused'].includes(job.mode))return;
      try{if(job.mode==='recording'){job.recorder.pause();job.elapsed=elapsed(job);job.mode='paused';job.status.textContent='Kayıt duraklatıldı.'}
        else{job.recorder.resume();job.started=performance.now();job.mode='recording';job.status.textContent='Kaydediliyor…'}controls(job);
      }catch{stop(job,'Kayıt durduruldu. Göndermeden önce dinleyebilirsin.')}
    }
    function stop(job,note=''){
      if(!ensure(job)||!['recording','paused'].includes(job.mode))return;
      job.elapsed=elapsed(job);job.mode='finishing';job.note=note;clearInterval(job.timer);job.status.textContent='Kayıt hazırlanıyor…';controls(job);
      try{if(job.recorder.state!=='inactive')job.recorder.stop()}catch{notice('Ses kaydı tamamlanamadı. Yeniden kaydedin.');dispose(job)}
    }
    async function submit(job){
      if(!ensure(job)||job.mode!=='preview'||!job.file)return;
      job.mode='sending';job.status.textContent='Sesli mesaj gönderiliyor…';job.audio?.pause();controls(job);
      try{await send(job.file);if(active(job))dispose(job)}
      catch(e){if(ensure(job)){job.mode='preview';job.status.textContent=e.message||'Gönderilemedi. Kaydın burada; yeniden deneyebilirsin.';controls(job)}}
    }
    async function start(){
      if(current){current.panel.querySelector('button:not(:disabled)')?.focus();return}
      if(!valid())return;
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){notice('Bu cihazda ses kaydı desteklenmiyor.');return}
      const panel=document.createElement('section');panel.className='dm-voice-composer';panel.dataset.voiceComposer='';panel.setAttribute('aria-label','Sesli mesaj kaydı');
      panel.innerHTML='<header><b>Sesli mesaj</b><span data-voice-time aria-label="Kayıt süresi">00:00 / 02:00</span></header><p data-voice-status role="status" aria-live="polite">Mikrofon izni bekleniyor…</p><div data-voice-preview></div><footer><button type="button" data-voice-pause hidden>Duraklat</button><button type="button" data-voice-stop hidden>Bitir ve dinle</button><button type="button" data-voice-delete>Sil</button><button type="button" data-voice-send hidden>Sesli mesajı gönder</button></footer>';
      host.querySelector('.compose').before(panel);
      const job={panel,status:panel.querySelector('[data-voice-status]'),mode:'permission',elapsed:0,started:0,chunks:[],bytes:0,cancelled:false};current=job;changed(true);
      panel.querySelector('[data-voice-delete]').onclick=()=>{dispose(job);host.querySelector('[data-dm-voice]')?.focus()};
      panel.querySelector('[data-voice-pause]').onclick=()=>pause(job);panel.querySelector('[data-voice-stop]').onclick=()=>stop(job);panel.querySelector('[data-voice-send]').onclick=()=>submit(job);
      panel.onkeydown=e=>{if(e.key==='Escape'&&job.mode!=='sending'){e.preventDefault();dispose(job)}};
      job.visibility=()=>{if(document.visibilityState!=='hidden'||!active(job))return;if(job.mode==='permission'){dispose(job);return}job.audio?.pause();if(job.mode==='recording'){if(job.recorder.pause&&job.recorder.resume)pause(job);else stop(job,'Uygulama arka plana geçti. Kaydı dinleyip gönderebilirsin.')}};
      job.pagehide=()=>dispose(job);document.addEventListener('visibilitychange',job.visibility);window.addEventListener('pagehide',job.pagehide);
      controls(job);panel.querySelector('[data-voice-delete]').focus();
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});job.stream=stream;
        if(!ensure(job)){stopTracks(job);return}
        const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].find(x=>window.MediaRecorder.isTypeSupported?.(x));
        const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);job.recorder=recorder;
        recorder.ondataavailable=e=>{if(!active(job)||!e.data?.size)return;job.bytes+=e.data.size;
          if(job.bytes>MAX_BYTES){notice('Ses kaydı en fazla 12 MB olabilir. Daha kısa bir kayıt yapın.');dispose(job);return}job.chunks.push(e.data)};
        recorder.onerror=()=>{if(active(job)){notice('Ses kaydı kesildi. Yeniden kaydedin.');dispose(job)}};
        recorder.onstop=()=>{
          stopTracks(job);clearInterval(job.timer);if(!ensure(job))return;
          if(job.mode==='recording')job.elapsed=elapsed(job);
          const type=(recorder.mimeType||job.chunks[0]?.type||mime||'audio/webm').split(';',1)[0];
          const blob=new Blob(job.chunks,{type});job.chunks=[];
          if(!blob.size){notice('Ses kaydı boş. Yeniden kaydedin.');dispose(job);return}
          const ext=type==='audio/mp4'?'m4a':type==='audio/ogg'?'ogg':'webm';job.file=new File([blob],'voice-'+Date.now()+'.'+ext,{type});
          job.url=URL.createObjectURL(blob);const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=job.url;audio.setAttribute('aria-label','Göndermeden önce ses kaydını dinle');job.audio=audio;
          panel.querySelector('[data-voice-preview]').append(audio);job.mode='preview';job.status.textContent=job.note||'Kaydı dinleyebilir, silebilir veya gönderebilirsin. Sohbetten çıkınca kayıt silinir.';
          audio.onerror=()=>{if(active(job))job.status.textContent='Bu cihaz kaydı oynatamadı. Yeniden kaydetmek için Sil seçeneğini kullanabilirsin.'};
          controls(job);panel.querySelector('[data-voice-send]').focus();
        };
        for(const track of stream.getTracks())track.onended=()=>stop(job,'Mikrofon bağlantısı kesildi. Kaydı kontrol edip gönderebilirsin.');
        recorder.start(1000);job.mode='recording';job.started=performance.now();job.status.textContent='Kaydediliyor… Sohbetten çıkarsan kayıt silinir.';controls(job);
        job.timer=setInterval(()=>{if(!ensure(job))return;controls(job);if(elapsed(job)>=MAX_MS)stop(job,'2 dakikalık kayıt sınırına ulaşıldı. Kaydı dinleyip gönderebilirsin.')},250);
        panel.querySelector('[data-voice-stop]').focus();
      }catch(e){if(active(job)){notice(e.name==='NotAllowedError'?'Ses kaydı için mikrofon izni gerekli.':e.name==='NotFoundError'?'Mikrofon bulunamadı.':'Ses kaydı başlatılamadı.');dispose(job)}}
    }
    return {start,cancel:()=>dispose(current),isActive:()=>!!current,focus:()=>current?.panel.querySelector('button:not(:disabled)')?.focus()};
  }
  window.ErisVoiceRecorder={create};
})();
