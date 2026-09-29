(() => {
  'use strict';
  const base=()=>String(window.ERIS_API||window.ERISCHAT_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';
  const api=(path,opts)=>window.ErisPlatform.api(path,opts);
  const path=id=>'/rooms/'+encodeURIComponent(id)+'/music';
  let roomId=null, audio=null, currentId=null, currentUrl=null, loading=false;
  let tracks=[];
  const volume=()=>Number(localStorage.getItem('eris_room_music_volume')||70)/100;
  async function setPlayback(track,action){
    if(!track)return;
    if(action==='play')await ensureAudio(track);
    await api(path(room())+'/'+track.id+'/playback',{
      method:'POST',
      body:JSON.stringify({
        action,
        position_seconds:Math.floor(currentId===track.id&&audio?audio.currentTime:track.position_seconds||0)
      })
    });
    await load();
  }
  async function skipTrack(step){
    if(!tracks.length)return;
    const index=tracks.findIndex(x=>x.id===currentId||x.is_playing);
    const next=tracks[(Math.max(index,0)+step+tracks.length)%tracks.length];
    if(!next||next.needs_reupload)return window.toast?.('Bu parça yeniden yüklenmeli.');
    const active=tracks.find(x=>x.is_playing);
    if(active&&active.id!==next.id)await setPlayback(active,'stop');
    await setPlayback(next,'play');
  }
  function updatePlayer(){
    const panel=document.getElementById('erisMusicPanel');
    if(!panel)return;
    const track=tracks.find(x=>x.id===currentId)||tracks.find(x=>x.is_playing);
    const name=panel.querySelector('#erisMusicNow');
    if(name)name.textContent=track?.title||'Çalan parça yok';
    const toggle=panel.querySelector('[data-toggle]');
    if(toggle)toggle.textContent=track?.is_playing?'⏸':'▶';
    const progress=panel.querySelector('#erisMusicProgress');
    if(progress&&!progress.matches(':active')&&audio?.duration&&Number.isFinite(audio.duration))
      progress.value=String(Math.round(audio.currentTime/audio.duration*100));
  }

  const room=()=>window.ErisCurrentRoomId||window.currentRoomId||null;
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
    currentId=track.id;audio.volume=volume();audio.style.display='none';document.body.append(audio);
    audio.onended=()=>{api(path(room())+'/'+track.id+'/playback',{method:'POST',body:JSON.stringify({action:'stop',position_seconds:0})}).catch(()=>{});load()};
    return audio;
  }
  async function load(){
    if(!room()){if(audio)clearAudio();return}
    if(loading||!document.getElementById('erisMusicList'))return;
    loading=true;
    try{
      const rows=await api(path(room()));tracks=Array.isArray(rows)?rows:[];const box=document.getElementById('erisMusicList');if(!box)return;
      box.replaceChildren();
      if(!rows.length)box.textContent='Müzik kuyruğu boş.';
      for(const x of rows){const item=document.createElement('div');item.style.cssText='display:flex;gap:8px;align-items:center;padding:9px;border:1px solid #fff2;border-radius:10px;margin:6px 0';item.innerHTML='<span style="flex:1"><b>'+escape(x.title)+'</b><small style="display:block">'+(x.needs_reupload?'⚠ Telefondan yeniden yükle':x.is_playing?'▶ Oynuyor':'⏸ Durdu')+'</small></span>';
        const play=document.createElement('button');play.textContent=x.is_playing?'⏸':'▶';play.disabled=!!x.needs_reupload;play.onclick=async()=>{try{if(!x.is_playing)await ensureAudio(x);await api(path(room())+'/'+x.id+'/playback',{method:'POST',body:JSON.stringify({action:x.is_playing?'pause':'play',position_seconds:Math.floor(audio?.currentTime||x.position_seconds||0)})});await load()}catch(e){window.toast?.(e.message)}};item.append(play);
        const del=document.createElement('button');del.textContent='🗑️';del.setAttribute('aria-label','Müziği sil');del.onclick=async()=>{try{await api(path(room())+'/'+x.id,{method:'DELETE'});if(currentId===x.id)clearAudio();await load()}catch(e){window.toast?.(e.message)}};item.append(del);box.append(item)}
      const active=rows.find(x=>x.is_playing);if(active){try{const player=await ensureAudio(active);const position=Number(active.position_seconds||0)+(active.started_at?Math.max(0,(Date.now()-Date.parse(active.started_at))/1000):0);if(Number.isFinite(position)&&Math.abs(player.currentTime-position)>3)player.currentTime=position;if(player.paused)await player.play()}catch(e){if(e.name!=='NotAllowedError')window.toast?.(e.message)}}else audio?.pause();updatePlayer();
    }catch(e){const box=document.getElementById('erisMusicList');if(box)box.textContent=e.message||'Müzikler yüklenemedi.'}finally{loading=false}
  }
  async function refreshAccess(){
    const panel=document.getElementById('erisMusicPanel');
    if(!panel)return;
    const label=panel.querySelector('[data-pass-state]');
    const upload=panel.querySelector('[data-upload]');
    try{
      const access=await api('/rooms/music-access/status');
      const active=!!access.active;
      label.textContent=active
        ?'✓ Ücretsiz müzik erişimi açık'
        :'Müzik erişimi kullanılamıyor';
      upload.style.filter=active?'none':'blur(3px)';
      upload.style.pointerEvents=active?'auto':'none';
      upload.style.opacity=active?'1':'.55';
    }catch(error){
      label.textContent=error.message||'Müzik erişimi kontrol edilemedi.';
      upload.style.filter='blur(3px)';
      upload.style.pointerEvents='none';
    }
  }
  function mount(){if(document.getElementById('erisMusicPanel'))return;const panel=document.createElement('div');panel.id='erisMusicPanel';panel.style.cssText='display:none;position:fixed;inset:0;z-index:1000;background:#020107e8;align-items:flex-end;justify-content:center;color:#fff';panel.innerHTML='<div style="width:min(520px,100%);max-height:82vh;overflow:auto;background:#0b0911;border-radius:24px 24px 0 0;padding:15px"><div style="display:flex;justify-content:space-between"><b>🎵 Oda Müziği</b><button data-close aria-label="Kapat">×</button></div><p>Telefonundan MP3, M4A, OGG, FLAC veya WAV seç. En fazla 8 MB. Müziği ücretsiz ekleyebilirsin. Oynatmak için koltuğa oturman ve susturulmamış olman gerekir.</p><div data-pass style="padding:13px;border-radius:17px;border:1px solid #ffffff25;background:linear-gradient(130deg,#291b39,#14111e);margin:13px 0"><strong data-pass-state>🎵 Müzik erişimi kontrol ediliyor…</strong></div><div data-upload><input data-title placeholder="Parça adı" maxlength="128" style="width:100%;box-sizing:border-box"><input data-file type="file" accept=".mp3,.m4a,.ogg,.flac,.wav,audio/*" style="width:100%;margin:10px 0"><button data-add type="button">Müziği odaya ekle</button></div>'+"<section id=\"erisMusicPlayer\" style=\"margin:16px 0;padding:15px;border:1px solid #ffffff26;border-radius:20px;background:linear-gradient(145deg,#261936,#11101a)\">\n<b id=\"erisMusicNow\" style=\"display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">Çalan parça yok</b>\n<input id=\"erisMusicProgress\" aria-label=\"Parçada ilerle\" type=\"range\" min=\"0\" max=\"100\" value=\"0\" style=\"width:100%;accent-color:#ae63ef;margin:14px 0\">\n<div style=\"display:flex;gap:10px;align-items:center;justify-content:center\">\n<button type=\"button\" data-prev aria-label=\"Önceki parça\" style=\"min-width:48px;min-height:46px\">⏮</button>\n<button type=\"button\" data-toggle aria-label=\"Oynat veya duraklat\" style=\"min-width:54px;min-height:50px;border-radius:50%;background:linear-gradient(120deg,#8849ed,#e146ad);color:white\">▶</button>\n<button type=\"button\" data-next aria-label=\"Sonraki parça\" style=\"min-width:48px;min-height:46px\">⏭</button>\n</div>\n<label style=\"display:flex;gap:12px;align-items:center;margin-top:14px\">🔊 <input id=\"erisMusicVolume\" aria-label=\"Müzik ses düzeyi\" type=\"range\" min=\"0\" max=\"100\" value=\"70\" style=\"flex:1;accent-color:#ae63ef\"></label>\n</section>"+'<div id="erisMusicList" role="status"></div></div>';document.body.append(panel);
    panel.querySelector('[data-prev]').onclick=()=>skipTrack(-1).catch(e=>window.toast?.(e.message));
    panel.querySelector('[data-next]').onclick=()=>skipTrack(1).catch(e=>window.toast?.(e.message));
    panel.querySelector('[data-toggle]').onclick=()=>{
      const track=tracks.find(x=>x.is_playing)||tracks.find(x=>x.id===currentId)||tracks[0];
      if(track)setPlayback(track,track.is_playing?'pause':'play').catch(e=>window.toast?.(e.message));
    };
    panel.querySelector('#erisMusicVolume').value=String(Math.round(volume()*100));
    panel.querySelector('#erisMusicVolume').oninput=event=>{
      const value=Number(event.target.value)/100;
      localStorage.setItem('eris_room_music_volume',String(Math.round(value*100)));
      if(audio)audio.volume=value;
    };
    panel.querySelector('#erisMusicProgress').onchange=event=>{
      const track=tracks.find(x=>x.id===currentId);
      if(!track||!audio?.duration)return;
      const position=Math.floor(audio.duration*Number(event.target.value)/100);
      audio.currentTime=position;
      api(path(room())+'/'+track.id+'/playback',{
        method:'POST',body:JSON.stringify({action:'seek',position_seconds:position})
      }).then(load).catch(e=>window.toast?.(e.message));
    };
    panel.querySelector('[data-close]').onclick=()=>{panel.style.display='none'};
    panel.querySelector('[data-add]').onclick=async()=>{const file=panel.querySelector('[data-file]').files[0],button=panel.querySelector('[data-add]');if(!file)return window.toast?.('Telefonundan bir müzik seç.');if(file.size>8*1024*1024)return window.toast?.('Müzik en fazla 8 MB olabilir.');const form=new FormData();form.append('file',file);form.append('title',panel.querySelector('[data-title]').value.trim()||file.name);button.disabled=true;try{const res=await fetch(base()+path(room()),{method:'POST',headers:{Authorization:'Bearer '+token()},body:form});const result=await res.json().catch(()=>({}));if(!res.ok)throw new Error(result.detail||'Müzik eklenemedi.');panel.querySelector('[data-file]').value='';panel.querySelector('[data-title]').value='';window.toast?.('Müzik oda kuyruğuna eklendi.');if(loading){setTimeout(load,250)}else await load()}catch(e){window.toast?.(e.message)}finally{button.disabled=false}};
  }
  window.ErisChatMusic={open(){
    const nextRoom=window.ErisCurrentRoomId||window.currentRoomId||roomId;
    if(roomId&&nextRoom&&String(roomId)!==String(nextRoom)){
      clearAudio();
      tracks=[];
    }
    roomId=nextRoom;
    mount();const panel=document.getElementById('erisMusicPanel');panel.style.display='flex';refreshAccess();load()}};
  window.ErisRoom=window.ErisRoom||{};window.ErisRoom.music=id=>api(path(id));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  setInterval(load,4000);
  document.addEventListener('pointerdown',()=>{if(audio?.paused&&tracks.some(x=>x.id===currentId&&x.is_playing))audio.play().catch(()=>{})});
})();

// Room music controls use the same dark theme as the room center.
(() => {
  const style=document.createElement('style');
  style.textContent='#erisMusicPanel button,#erisMusicPanel input:not([type=file]){border:1px solid #ffffff29;border-radius:13px;background:#201827;color:#fff;min-height:42px;padding:8px;font:600 14px system-ui}#erisMusicPanel [data-add],#erisMusicPanel [data-unlock]{background:linear-gradient(115deg,#8149ed,#dd45a3);border:0;color:#fff;font-weight:750}#erisMusicPanel input[type=file]{color:#ddd;background:#1c1525;border:1px solid #ffffff25;border-radius:12px;padding:10px;box-sizing:border-box}';
  document.head.append(style);
})();
