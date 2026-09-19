(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  let audio=null,timer=null,roomId=null;
  const musicApi=async(path,options={})=>{
    if(window.ErisPlatform?.api)return window.ErisPlatform.api(path,options);
    const api=(window.ERIS_API||'/v1').replace(/\/$/,'');
    const token=localStorage.getItem('erischat_access_token')||'';
    const headers=Object.assign({'Content-Type':'application/json'},options.headers||{},token?{Authorization:'Bearer '+token}:{});
    const r=await fetch(api+path,Object.assign({},options,{headers}));
    const data=await r.json().catch(()=>[]); if(!r.ok)throw new Error(data.detail||('HTTP '+r.status)); return data;
  };
  window.ErisRoom=window.ErisRoom||{};
  window.ErisRoom.music=window.ErisRoom.music||((id)=>musicApi('/rooms/'+encodeURIComponent(id)+'/music'));
  window.ErisRoom.musicPlayback=window.ErisRoom.musicPlayback||((id,musicId,action,position)=>musicApi('/rooms/'+encodeURIComponent(id)+'/music/'+encodeURIComponent(musicId)+'/playback',{method:'POST',body:JSON.stringify({action,position_seconds:position})}));
  window.ErisRoom.addMusic=window.ErisRoom.addMusic||((id,title,source_url)=>musicApi('/rooms/'+encodeURIComponent(id)+'/music',{method:'POST',body:JSON.stringify({title,source_url})}));
  window.ErisRoom.deleteMusic=window.ErisRoom.deleteMusic||((id,musicId)=>musicApi('/rooms/'+encodeURIComponent(id)+'/music/'+encodeURIComponent(musicId),{method:'DELETE'}));
  const rid=()=>roomId||window.ErisCurrentRoomId||window.currentRoomId||new URLSearchParams(location.search).get('room_id')||new URLSearchParams(location.search).get('room');
  function ensureAudio(x){
    if(!audio||audio.dataset.musicId!==String(x.id)||audio.src!==x.source_url){
      audio?.pause(); audio?.remove(); audio=new Audio(x.source_url); audio.dataset.musicId=String(x.id); audio.controls=false; audio.style.display='none'; document.body.appendChild(audio);
      audio.preload='auto'; audio.volume=.85;
      audio.addEventListener('ended',async()=>{const id=rid();await window.ErisRoom.musicPlayback(id,x.id,'stop').catch(()=>null);audio?.remove();audio=null;load()});
    }
    return audio;
  }
  function reconcile(x){
    const a=ensureAudio(x),pos=Math.max(0,Number(x.position_seconds||0));
    if(Math.abs((a.currentTime||0)-pos)>2&&!a.seeking)a.currentTime=pos;
    if(x.is_playing&&a.paused)a.play().catch(()=>window.toast?.('Tarayıcı sesi engelledi; Müzik panelinden tekrar oynat.'));
    if(!x.is_playing&&!a.paused)a.pause();
  }
  async function load(){
    const id=rid(); if(!id||!window.ErisRoom?.music)return;
    const r=await window.ErisRoom.music(id).catch(()=>null),rows=Array.isArray(r)?r:(Array.isArray(r?.items)?r.items:Array.isArray(r?.music)?r.music:[]);
    const box=document.getElementById('erisMusicList');if(!box)return;
    box.innerHTML=rows.length?rows.map(x=>'<div style="display:flex;align-items:center;gap:7px;padding:8px;border:1px solid #fff1;border-radius:10px;margin:5px 0"><div style="flex:1"><b>'+esc(x.title)+'</b><small style="display:block;color:#938a9f;font-size:8px">'+(x.is_playing?'▶ oynuyor':'⏸ durdu')+' • '+Math.floor(Number(x.position_seconds||0))+' sn</small></div><button data-play="'+x.id+'">'+(x.is_playing?'⏸':'▶')+'</button><button data-del="'+x.id+'">🗑️</button></div>').join(''):'<small style="color:#938a9f">Kuyruk boş.</small>';
    const active=rows.find(x=>x.is_playing);
    if(active)reconcile(active);else if(audio){audio.pause();audio.remove();audio=null}
    rows.forEach(x=>{
      box.querySelector('[data-play="'+x.id+'"]')?.addEventListener('click',()=>playback(x));
      box.querySelector('[data-del="'+x.id+'"]')?.addEventListener('click',async()=>{await window.ErisRoom.deleteMusic(id,x.id);if(audio?.dataset.musicId===String(x.id)){audio.pause();audio.remove();audio=null}load()});
    });
  }
  async function playback(x){
    const id=rid(),action=x.is_playing?'pause':'play';
    const r=await window.ErisRoom.musicPlayback(id,x.id,action).catch(e=>{window.toast?.(e.message||'Müzik kontrolü reddedildi');return null});if(!r)return;
    if(action==='play'){const a=ensureAudio(x);a.currentTime=Number(x.position_seconds||0);a.play().catch(()=>window.toast?.('Ses oynatılamadı; tekrar bas.'))}
    else if(audio?.dataset.musicId===String(x.id))audio.pause();
    load();
  }
  function open(){roomId=rid();const p=document.getElementById('erisMusicPanel');if(!p)return;p.style.display='flex';load();clearInterval(timer);timer=setInterval(load,4000)}
  function mount(){
    // Müzik sistemi yalnızca oda içindeki gerçek müzik panelinden açılır.
    // Global/floating müzik butonu oluşturma; ana arayüzde görünür bir panel tetikleyicisi kullan.
    if(document.getElementById('erisMusicPanel')) return;
    const p=document.createElement('div');p.id='erisMusicPanel';p.style.cssText='display:none;position:fixed;inset:0;z-index:700;background:#020107e8;align-items:flex-end;justify-content:center';
    p.innerHTML='<div style="width:min(520px,100%);max-height:82vh;overflow:auto;background:#0b0911;border-radius:24px 24px 0 0;padding:15px;color:#fff"><div style="display:flex;justify-content:space-between"><b>🎵 Oda Müziği</b><button id="musicClose">×</button></div><div style="display:flex;gap:5px;margin-top:10px"><input id="musicTitle" placeholder="Parça adı"><input id="musicUrl" placeholder="Audio URL"><button id="musicAdd">＋</button></div><div id="erisMusicList"></div></div>';
    document.body.appendChild(p);p.querySelector('#musicClose').onclick=()=>{p.style.display='none';clearInterval(timer)};
    p.querySelector('#musicAdd').onclick=async()=>{const t=musicTitle.value.trim(),u=musicUrl.value.trim();if(!t||!u)return;const r=await window.ErisRoom.addMusic(rid(),t,u).catch(e=>{window.toast?.(e.message||'Müzik eklenemedi');return null});if(!r)return;musicTitle.value='';musicUrl.value='';load()};
  }
  window.ErisChatMusic={open};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();