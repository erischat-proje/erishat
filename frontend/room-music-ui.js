(() => {
  'use strict';
  const base=()=>String(window.ERIS_API||window.ERISCHAT_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';
  const api=(path,opts)=>window.ErisPlatform.api(path,opts);
  const path=id=>'/rooms/'+encodeURIComponent(id)+'/music';
  let roomId=null, timer=null, audio=null, currentId=null, currentUrl=null, loading=false;
  const room=()=>roomId||window.ErisCurrentRoomId||window.currentRoomId;
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function clearAudio(){audio?.pause();audio?.remove();audio=null;currentId=null;if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=null}
  async function ensureAudio(track){
    if(currentId===track.id&&audio)return audio;
    clearAudio();
    if(track.audio_url){
      const res=await fetch(base()+track.audio_url,{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
      if(!res.ok)throw new Error('Müzik dosyası açılamadı ('+res.status+').');
      currentUrl=URL.createObjectURL(await res.blob());
      audio=new Audio(currentUrl);
    } else throw new Error('Eski URL kaydı çalınamaz. Bu parçayı telefondan yeniden yükle.');
    currentId=track.id;audio.style.display='none';document.body.append(audio);
    audio.onended=()=>{api(path(room())+'/'+track.id+'/playback',{method:'POST',body:JSON.stringify({action:'stop',position_seconds:0})}).catch(()=>{});load()};
    return audio;
  }
  async function load(){
    if(!room()||loading||!document.getElementById('erisMusicList'))return;
    loading=true;
    try{
      const rows=await api(path(room()));const box=document.getElementById('erisMusicList');if(!box)return;
      box.replaceChildren();
      if(!rows.length)box.textContent='Müzik kuyruğu boş.';
      for(const x of rows){const item=document.createElement('div');item.style.cssText='display:flex;gap:8px;align-items:center;padding:9px;border:1px solid #fff2;border-radius:10px;margin:6px 0';item.innerHTML='<span style="flex:1"><b>'+escape(x.title)+'</b><small style="display:block">'+(x.needs_reupload?'⚠ Telefondan yeniden yükle':x.is_playing?'▶ Oynuyor':'⏸ Durdu')+'</small></span>';
        const play=document.createElement('button');play.textContent=x.is_playing?'⏸':'▶';play.disabled=!!x.needs_reupload;play.onclick=async()=>{try{if(!x.is_playing)await ensureAudio(x);await api(path(room())+'/'+x.id+'/playback',{method:'POST',body:JSON.stringify({action:x.is_playing?'pause':'play',position_seconds:Math.floor(audio?.currentTime||x.position_seconds||0)})});await load()}catch(e){window.toast?.(e.message)}};item.append(play);
        const del=document.createElement('button');del.textContent='🗑️';del.setAttribute('aria-label','Müziği sil');del.onclick=async()=>{try{await api(path(room())+'/'+x.id,{method:'DELETE'});if(currentId===x.id)clearAudio();await load()}catch(e){window.toast?.(e.message)}};item.append(del);box.append(item)}
      const active=rows.find(x=>x.is_playing);if(active){try{const player=await ensureAudio(active);const position=Number(active.position_seconds||0)+(active.started_at?Math.max(0,(Date.now()-Date.parse(active.started_at))/1000):0);if(Number.isFinite(position)&&Math.abs(player.currentTime-position)>3)player.currentTime=position;if(player.paused)await player.play()}catch(e){if(e.name!=='NotAllowedError')window.toast?.(e.message)}}else audio?.pause();
    }catch(e){const box=document.getElementById('erisMusicList');if(box)box.textContent=e.message||'Müzikler yüklenemedi.'}finally{loading=false}
  }
  function mount(){if(document.getElementById('erisMusicPanel'))return;const panel=document.createElement('div');panel.id='erisMusicPanel';panel.style.cssText='display:none;position:fixed;inset:0;z-index:1000;background:#020107e8;align-items:flex-end;justify-content:center;color:#fff';panel.innerHTML='<div style="width:min(520px,100%);max-height:82vh;overflow:auto;background:#0b0911;border-radius:24px 24px 0 0;padding:15px"><div style="display:flex;justify-content:space-between"><b>🎵 Oda Müziği</b><button data-close aria-label="Kapat">×</button></div><p>Telefonundan MP3, M4A, OGG, FLAC veya WAV seç. En fazla 8 MB; parça başına 150 Lidya.</p><input data-title placeholder="Parça adı" maxlength="128" style="width:100%;box-sizing:border-box"><input data-file type="file" accept=".mp3,.m4a,.ogg,.flac,.wav,audio/*" style="width:100%;margin:10px 0"><button data-add type="button">Müziği odaya ekle</button><div id="erisMusicList" role="status"></div></div>';document.body.append(panel);
    panel.querySelector('[data-close]').onclick=()=>{panel.style.display='none';clearInterval(timer)};
    panel.querySelector('[data-add]').onclick=async()=>{const file=panel.querySelector('[data-file]').files[0],button=panel.querySelector('[data-add]');if(!file)return window.toast?.('Telefonundan bir müzik seç.');if(file.size>8*1024*1024)return window.toast?.('Müzik en fazla 8 MB olabilir.');const form=new FormData();form.append('file',file);form.append('title',panel.querySelector('[data-title]').value.trim()||file.name);button.disabled=true;try{const res=await fetch(base()+path(room()),{method:'POST',headers:{Authorization:'Bearer '+token()},body:form});const result=await res.json().catch(()=>({}));if(!res.ok)throw new Error(result.detail||'Müzik eklenemedi.');panel.querySelector('[data-file]').value='';panel.querySelector('[data-title]').value='';window.toast?.('Müzik oda kuyruğuna eklendi.');await load()}catch(e){window.toast?.(e.message)}finally{button.disabled=false}};
  }
  window.ErisChatMusic={open(){roomId=room();mount();const panel=document.getElementById('erisMusicPanel');panel.style.display='flex';load();clearInterval(timer);timer=setInterval(load,4000)}};
  window.ErisRoom=window.ErisRoom||{};window.ErisRoom.music=id=>api(path(id));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
