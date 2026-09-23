(() => {
  'use strict';
  const api=()=>window.ErisPlatform?.api?null:(window.ERIS_API||window.ERISCHAT_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
  async function load(){
    const profile=document.getElementById('profile'); if(!profile)return;
    let section=document.getElementById('erisProfileRooms');
    if(!section){
      section=document.createElement('div'); section.id='erisProfileRooms'; section.className='list';
      section.innerHTML='<div class="section-title"><h3>Odalar</h3></div><div id="erisProfileRoomsList" class="list"><div class="empty">Odaların yükleniyor…</div></div>';
      const settings=profile.querySelector('.section-title');
      if(settings) settings.insertAdjacentElement('beforebegin',section); else profile.appendChild(section);
    }
    const list=document.getElementById('erisProfileRoomsList');
    try{
      const t=token(); if(!t){list.innerHTML='<div class="empty">Oda sahipliği ve moderatörlük bilgisi için giriş gerekli.</div>';return;}
      let data;
      if(window.ErisPlatform?.api) data=await window.ErisPlatform.api('/rooms/me/rooms');
      else { const r=await fetch(api()+'/rooms/me/rooms',{headers:{Authorization:'Bearer '+t}}); data=await r.json().catch(()=>[]); if(!r.ok)throw new Error(data?.detail||'Odalar alınamadı'); }
      const rooms=Array.isArray(data)?data:(data?.rooms||data?.items||data?.data||[]);
      if(!rooms.length){list.innerHTML='<div class="empty">Sahibi veya moderatörü olduğun oda yok.</div>';return;}
      list.innerHTML='';
      rooms.forEach(room=>{
        const b=document.createElement('button'); b.type='button'; b.className='setting';
        const role=room.role==='owner'?'👑 Sahibi':'🛡️ Moderatör';
        b.innerHTML='<span><b>'+esc(room.name||'Oda')+'</b><small style="display:block;margin-top:4px;color:#8f8498">'+role+' • '+Number(room.member_count||0)+' kişi</small></span><span>›</span>';
        b.onclick=()=>{window.ErisCurrentRoomId=room.id;window.currentRoomId=room.id;if(typeof window.openRoom==='function')window.openRoom(room.id,room.name||'Oda');};
        list.appendChild(b);
      });
    }catch(e){list.innerHTML='<div class="empty">'+esc(e.message||'Odalar yüklenemedi.')+'</div>';}
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  window.addEventListener('erischat:room-created',()=>setTimeout(load,150));
  function install(){
    const old=window.openView;
    if(typeof old==='function'&&!old.__erisProfileRooms){
      const wrapped=function(id){const r=old.apply(this,arguments);if(id==='profile')setTimeout(load,0);return r;};
      wrapped.__erisProfileRooms=true; window.openView=wrapped;
    }
    if(document.getElementById('profile')?.classList.contains('show'))load();
    const profileEl=document.getElementById('profile');
    if(profileEl){const mo=new MutationObserver(()=>{if(profileEl.classList.contains('show'))load();});mo.observe(profileEl,{attributes:true,attributeFilter:['class']});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();