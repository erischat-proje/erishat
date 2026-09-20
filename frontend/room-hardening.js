(() => {
  'use strict';
  const api=()=>String(window.ERISCHAT_API_BASE||localStorage.getItem('erischat.apiBase')||'').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
  const headers=()=>token()?{Authorization:'Bearer '+token(),'Content-Type':'application/json'}:{'Content-Type':'application/json'};
  const rid=()=>String(window.ErisCurrentRoomId||window.currentRoomId||'');
  async function req(path,opt={}){const r=await fetch(api()+path,{...opt,headers:{...headers(),...(opt.headers||{})}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.detail||'İşlem başarısız');return b;}

  async function room(){
    const id=rid(); if(!id)return null;
    return req('/v1/rooms/'+encodeURIComponent(id));
  }

  async function joinSeat(seatNumber){
    const id=rid(); if(!id)throw new Error('Oda açık değil');
    await req('/v1/rooms/'+encodeURIComponent(id)+'/seats/'+encodeURIComponent(seatNumber)+'/join',{method:'POST'});
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
    const can=!!(r?.is_owner||r?.is_moderator||r?.can_manage);
    let b=top.querySelector('#erisRoomMoreTop');
    if(!can){b?.remove();return;}
    if(!b){
      b=document.createElement('button');b.id='erisRoomMoreTop';b.className='room-v5-topbtn';b.textContent='⋯';b.title='Oda ayarları';top.appendChild(b);
    }
    b.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();window.ErisRoomCompleteV3?.openMenu?.('settings');};
  }

  function addMusicPanel(r){
    const surface=document.getElementById('erisRoomSurface'); if(!surface)return;
    const open=surface.querySelector('#roomMusicOpen'); if(!open||open.dataset.bound==='1')return;
    open.dataset.bound='1';
    open.onclick=async e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const id=r?.id||rid();
      const title=prompt('Müzik adı:','Müzik');
      if(title===null)return;
      const source=prompt('Müzik URL:','');
      if(source===null||!source.trim()){window.toast?.('Müzik URL gerekli.');return;}
      try{
        const result=await req('/v1/rooms/'+encodeURIComponent(id)+'/music',{method:'POST',body:JSON.stringify({title:title.trim()||'Müzik',source_url:source.trim()})});
        window.toast?.('🎵 Müzik eklendi ✓');
        window.ErisRoomCompleteV3?.openMenu?.('music');
        return result;
      }catch(err){window.toast?.(err.message||'Müzik eklenemedi.');}
    };
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
    s.textContent='#roomModal.show{display:none!important}#erisRoomSurface.show{z-index:9000!important}.room-v5-panel,.room-v3-panel{z-index:9100!important}';
    document.head.appendChild(s);
  }

  css();
  window.addEventListener('erischat:room-opened',()=>setTimeout(bindRoom,20));
  const observer=new MutationObserver(()=>{if(document.getElementById('erisRoomSurface')?.classList.contains('show'))bindRoom();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  setTimeout(bindRoom,500);
})();