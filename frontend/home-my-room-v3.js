/* LidyaChat Home V3: owner-only My Room shortcut. */
(() => {
  'use strict';
  const button=document.getElementById('lidyaHomeMyRoom');
  if(!button)return;
  let owned=null,loading=false,lastCheck=0;
  const rowsOf=data=>Array.isArray(data)?data:(data?.rooms||data?.items||data?.data||[]);
  async function refresh(force=false){
    if(loading||(!force&&Date.now()-lastCheck<15000))return;
    if(!window.ErisPlatform?.api)return;
    loading=true;
    try{
      const data=await window.ErisPlatform.api('/rooms/me/rooms');
      owned=rowsOf(data).find(room=>room.role==='owner'||room.is_owner===true)||null;
      button.hidden=!owned;
      lastCheck=Date.now();
    }catch(err){owned=null;button.hidden=true;console.warn('[LidyaChat] Odam yuklenemedi',err)}
    finally{loading=false}
  }
  button.addEventListener('click',async()=>{
    await refresh(true);
    if(!owned){window.toast?.('Sahibi olduğun oda bulunamadı.');return}
    if(typeof window.openRoom!=='function'){window.toast?.('Oda henüz hazır değil.');return}
    const id=owned.id||owned.room_id;
    if(!id){window.toast?.('Oda kimliği bulunamadı.');return}
    window.ErisCurrentRoomId=id;
    window.currentRoomId=id;
    window.openRoom(id,owned.name||owned.title||'Odam');
  });
  window.LidyaHomeMyRoom={refresh:()=>refresh(true)};
  window.addEventListener('erischat:view-changed',event=>{if(event.detail?.id==='home')refresh()});
  window.addEventListener('erischat:room-closed',()=>refresh(true));
  window.addEventListener('erischat:room-opened',()=>refresh(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
  refresh(true);
})();
