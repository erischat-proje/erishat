(() => {
  'use strict';
  const api=()=>window.ErisPlatform?.api?null:(window.ERIS_API||window.ERISCHAT_API||'https://erischat-production.up.railway.app/v1').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
  const headers=()=>token()?{Authorization:'Bearer '+token(),'Content-Type':'application/json'}:{'Content-Type':'application/json'};
  const rid=()=>String(window.ErisCurrentRoomId||window.currentRoomId||'');
  async function req(path,opt={}){if(window.ErisPlatform?.api)return window.ErisPlatform.api(path,opt);const r=await fetch(api()+path,{...opt,headers:{...headers(),...(opt.headers||{})}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.detail||'İşlem başarısız');return b;}

  async function room(){
    const id=rid(); if(!id)return null;
    return req('/v1/rooms/'+encodeURIComponent(id));
  }

  async function joinSeat(seatNumber){
    const id=rid(); if(!id)throw new Error('Oda açık değil');
    await req('/v1/rooms/'+encodeURIComponent(id)+'/join',{method:'POST',body:JSON.stringify({})}); await req('/v1/rooms/'+encodeURIComponent(id)+'/seats/'+encodeURIComponent(seatNumber)+'/join',{method:'POST'});
    await window.openRoom?.(id,document.getElementById('erisLiveTitle')?.textContent||'Oda');
  }

  function hideLegacyRoom(){
    const legacy=document.getElementById('roomModal');
    if(legacy) legacy.classList.remove('show');
  }

  function installSeatFix(){
    const box=document.getElementById('erisLiveSeats'); if(!box||box.dataset.erisSeatFix==='1')return;
    box.dataset.erisSeatFix='1';
    box.addEventListener('click',async e=>{
      const seat=e.target.closest('.eris-seat');
      if(!seat)return;
      if(seat.dataset.longPressed==='1'){seat.dataset.longPressed='0';return;}
      if(seat.classList.contains('locked')||seat.classList.contains('occupied'))return;
      e.preventDefault();e.stopImmediatePropagation();
      try{await joinSeat(Number(seat.dataset.seatNumber));window.toast?.('Koltuk alındı 🎙️');}
      catch(err){window.toast?.(err.message||'Koltuk alınamadı.');}
    },true);
  }

  function addOwnerSettingsButton(r){
    const surface=document.getElementById('erisRoomSurface'),top=surface?.querySelector('.eris-room-top');
    if(!top)return;
    const can=!!(r?.is_owner||r?.is_moderator);
    const b=top.querySelector('#erisRoomMoreTop');
    if(!b)return;
    if(!can){b.style.display='none';b.setAttribute('aria-hidden','true');return;}
    b.style.display='';b.setAttribute('aria-hidden','false');
    // Keep the existing room button/order; only replace its action with the real permission-aware menu.
    b.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();window.ErisRoomCompleteV3?.openMenu?.('settings');};
  }

  function openOwnerSettings(r){
    const s=document.getElementById('erisRoomSurface'); if(!s)return;
    let p=s.querySelector('#erisDirectRoomSettings');
    if(!p){p=document.createElement('div');p.id='erisDirectRoomSettings';p.className='room-v5-panel show';p.innerHTML='<div class="v5-title">⚙️ Oda ayarları <button class="v5-btn" data-close>Kapat</button></div><div id="erisDirectRoomSettingsBody"></div>';s.appendChild(p);p.querySelector('[data-close]').onclick=()=>p.classList.remove('show');}
    const body=p.querySelector('#erisDirectRoomSettingsBody'),owner=!!r.is_owner,staff=!!(r.is_owner||r.is_moderator);
    body.innerHTML='<div class="v5-card"><b>'+ (owner?'👑 Oda sahibi':'🛡️ Moderatör') +'</b><div class="v5-note">Yetkin olan ayarlar burada görünür.</div></div>'+
      (owner?'<div class="v5-card"><b>Oda adı</b><input id="erisDirectRoomName" class="v5-btn" style="width:100%;margin-top:7px;text-align:left" maxlength="16" value="'+String(r.name||'').replace(/"/g,'&quot;')+'"><button class="v5-btn primary" id="erisDirectRename" style="width:100%;margin-top:7px">Kaydet</button></div>':'')+
      (staff?'<div class="v5-card"><div class="v5-grid"><button class="v5-btn" id="erisDirectLock">'+(r.locked?'🔓 Kilidi aç':'🔒 Odayı kilitle')+'</button><button class="v5-btn" id="erisDirectChat">'+(r.chat_enabled===false?'💬 Sohbeti aç':'💬 Sohbeti kapat')+'</button></div>'+
      (owner?'<input id="erisDirectPass" class="v5-btn" inputmode="numeric" maxlength="4" placeholder="4 haneli şifre"><button class="v5-btn" id="erisDirectPassSet" style="width:100%;margin-top:7px">🔐 Şifreyi kaydet</button>':'')+'</div>':'');
    p.classList.add('show');
    body.querySelector('#erisDirectRename')?.addEventListener('click',async()=>{try{const name=body.querySelector('#erisDirectRoomName').value.trim();await req('/v1/rooms/'+encodeURIComponent(r.id)+'/name',{method:'PATCH',body:JSON.stringify({name})});document.getElementById('erisLiveTitle').textContent=name;window.toast?.('Oda adı güncellendi ✓');}catch(e){window.toast?.(e.message)}}); 
    body.querySelector('#erisDirectLock')?.addEventListener('click',async()=>{try{if(r.locked)await req('/v1/rooms/'+encodeURIComponent(r.id)+'/lock',{method:'DELETE'});else await req('/v1/rooms/'+encodeURIComponent(r.id)+'/lock',{method:'POST'});window.toast?.('Oda kilidi güncellendi ✓');const nr=await room();openOwnerSettings(nr);}catch(e){window.toast?.(e.message)}}); 
    body.querySelector('#erisDirectChat')?.addEventListener('click',async()=>{try{await req('/v1/rooms/'+encodeURIComponent(r.id)+'/chat',{method:'PATCH',body:JSON.stringify({enabled:r.chat_enabled===false})});window.toast?.('Sohbet ayarı güncellendi ✓');const nr=await room();openOwnerSettings(nr);}catch(e){window.toast?.(e.message)}}); 
    body.querySelector('#erisDirectPassSet')?.addEventListener('click',async()=>{try{const pass=body.querySelector('#erisDirectPass').value.trim();if(!/^\\d{4}$/.test(pass))throw new Error('4 haneli şifre gir.');await req('/v1/rooms/'+encodeURIComponent(r.id)+'/password',{method:'PUT',body:JSON.stringify({password:pass})});window.toast?.('Oda şifresi kaydedildi ✓');const nr=await room();openOwnerSettings(nr);}catch(e){window.toast?.(e.message)}}); 
  }

  function addMusicPanel(r){
    const surface=document.getElementById('erisRoomSurface'); if(!surface)return;
    const music=surface.querySelector('#erisRoomMusic');
    if(music && music.dataset.bound!=='1'){
      music.dataset.bound='1';
      music.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();window.ErisChatMusic?.open?.();};
    }
    const old=surface.querySelector('#roomMusicOpen');
    if(old && old.dataset.bound!=='1'){
      old.dataset.bound='1';
      old.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();window.ErisChatMusic?.open?.();};
    }
    const gift=surface.querySelector('#erisRoomGift');
    if(gift && gift.dataset.bound!=='1'){
      gift.dataset.bound='1';
      gift.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();window.openRoomGift?.(r?.id||rid());};
    }
  }

  async function bindRoom(){
    const surface=document.getElementById('erisRoomSurface');
    if(!surface?.classList.contains('show'))return;
    hideLegacyRoom();
    installSeatFix();
    try{
      const r=await room();
      if(!r)return;
      window.__erisRoomPermissions={is_owner:!!r.is_owner,is_moderator:!!r.is_moderator,can_manage:!!r.can_manage,current_user_seat:r.current_user_seat};
      addOwnerSettingsButton(r);
      addMusicPanel(r);
      document.getElementById('erisLiveTitle')?.setAttribute('data-room-owner',r.is_owner?'1':'0');
    }catch{}
  }

  function css(){
    if(document.getElementById('eris-room-hardening-css'))return;
    const s=document.createElement('style');s.id='eris-room-hardening-css';
    s.textContent='#roomModal.show{display:none!important}#erisRoomSurface.show{z-index:9000!important}.room-v5-panel,.room-v3-panel{z-index:9100!important}#erisMusicPanel,#erischatGiftPanel,#erisUserProfileModal,#eris-dm-profile-modal{z-index:10050!important}';
    document.head.appendChild(s);
  }

  css();
  window.addEventListener('erischat:room-opened',()=>setTimeout(bindRoom,20));
  const observer=new MutationObserver(()=>{if(document.getElementById('erisRoomSurface')?.classList.contains('show'))bindRoom();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  setTimeout(bindRoom,500);
})();