(() => {
  'use strict';
  const api=(path,options)=>window.ErisPlatform.api(path,options);
  const list=value=>Array.isArray(value)?value:(value?.users||value?.rooms||value?.items||value?.data||[]);
  const note=(root,message)=>{root.replaceChildren();const div=document.createElement('div');div.className='card';div.style.cssText='padding:16px;color:#a9a0b3';div.textContent=message;root.append(div)};
  window.openCreateRoom=()=>{
    const modal=document.getElementById('createRoomModal');
    modal?.classList.add('show');
    document.getElementById('newRoomName')?.focus();
  };
  window.closeCreateRoom=()=>document.getElementById('createRoomModal')?.classList.remove('show');
  window.createRoom=async()=>{
    const input=document.getElementById('newRoomName'),status=document.getElementById('createRoomStatus');
    const name=input?.value.trim();
    if(!name||name.length>16){if(status)status.textContent='Oda adı 1–16 karakter olmalı.';return}
    if(status)status.textContent='Oda oluşturuluyor…';
    try{
      const room=await api('/rooms',{method:'POST',body:JSON.stringify({name})});
      window.closeCreateRoom();input.value='';
      window.ErisChatRoomList?.load?.();
      await window.openRoom?.(room.id,room.name);
    }catch(error){if(status)status.textContent=error.message||'Oda oluşturulamadı.'}
  };
  async function people(){
    const root=document.getElementById('people');if(!root)return;
    note(root,'Kullanıcılar yükleniyor…');
    try{
      const rows=list(await api('/discover/nearby?limit=50'));
      if(!rows.length){note(root,'Görünür kullanıcı yok. Konum ve keşif tercihlerine göre sonuçlar değişir.');return}
      root.replaceChildren();
      rows.forEach(user=>{
        const id=user.user_id||user.id;if(!id)return;
        const button=document.createElement('button');button.type='button';button.className='item card';button.dataset.userId=id;
        const avatar=document.createElement('div');avatar.className='ava round';avatar.textContent='👤';
        const info=document.createElement('div');info.className='grow';
        const name=document.createElement('b');name.textContent=user.nickname||'Kullanıcı';
        const subtitle=document.createElement('small');subtitle.textContent=user.city||'Profili görüntüle';
        info.append(name,subtitle);button.append(avatar,info);
        button.onclick=()=>window.openUserProfile?.(id);
        root.append(button);
      });
      if(!root.children.length)note(root,'Görünür kullanıcı yok.');
    }catch(e){note(root,e.message||'Kullanıcılar yüklenemedi.')}
  }
  const priorTab=window.tab;
  window.tab=(id,button)=>{priorTab?.(id,button);if(id==='people')people()};
  window.ErisSearch={run:async()=>{
    const input=document.getElementById('searchInput');const q=input?.value.trim().toLocaleLowerCase('tr-TR');
    if(!q){window.toast?.('Arama terimi yaz.');input?.focus();return}
    let out=document.getElementById('searchResults');
    if(!out){out=document.createElement('div');out.id='searchResults';out.className='list';out.style.marginTop='12px';document.getElementById('search')?.append(out)}
    note(out,'Aranıyor…');
    try{
      const [roomResponse,userResponse]=await Promise.all([api('/discover/rooms?limit=50'),api('/discover/nearby?limit=50')]);
      const entries=[...list(roomResponse).filter(x=>String(x.name||'').toLocaleLowerCase('tr-TR').includes(q)).map(x=>({name:x.name,detail:'Oda',open:()=>window.openRoom?.(x.room_id||x.id,x.name)})),...list(userResponse).filter(x=>String(x.nickname||'').toLocaleLowerCase('tr-TR').includes(q)).map(x=>({name:x.nickname,detail:'Kullanıcı',open:()=>window.ErisChatDM?.create?.(x.user_id||x.id,x.nickname)}))];
      out.replaceChildren();
      if(!entries.length){note(out,'Eşleşme bulunamadı.');return}
      entries.forEach(entry=>{const button=document.createElement('button');button.type='button';button.className='item card';const name=document.createElement('b');name.textContent=entry.name;const detail=document.createElement('small');detail.textContent=entry.detail;button.append(name,detail);button.onclick=entry.open;out.append(button)})
    }catch(e){note(out,e.message||'Arama kullanılamıyor.')}
  }};
  document.getElementById('searchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')window.ErisSearch.run()});
  window.ErisRoomAnnouncements={open:async()=>{
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    if(!id){window.toast?.('Önce bir odaya gir.');return}
    const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:1200;background:#020107e8;display:grid;place-items:center;padding:15px;color:#fff';
    overlay.innerHTML='<div style="width:min(430px,100%);max-height:80vh;overflow:auto;background:#100d16;border-radius:18px;padding:16px"><button type="button" data-close style="float:right">×</button><h2 style="font-size:18px">Oda duyuruları</h2><div data-list>Yükleniyor…</div><form data-form style="display:none;margin-top:12px"><label for="eris-announcement-text">Yeni duyuru</label><textarea id="eris-announcement-text" maxlength="500" style="display:block;width:100%;min-height:75px"></textarea><button type="submit">Yayınla</button></form></div>';
    document.body.append(overlay);overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
    const root=overlay.querySelector('[data-list]');const form=overlay.querySelector('[data-form]');
    async function load(){
      try{
        const [rows,room]=await Promise.all([api(`/rooms/${encodeURIComponent(id)}/announcements`),api(`/rooms/${encodeURIComponent(id)}`)]);
        const canManage=Boolean(room.is_owner||room.is_moderator||room.can_manage);form.style.display=canManage?'block':'none';root.replaceChildren();
        if(!list(rows).length)note(root,'Henüz duyuru yok.');
        list(rows).forEach(row=>{const item=document.createElement('div');item.className='card';item.style.cssText='padding:11px;margin:7px 0';const text=document.createElement('span');text.textContent=(row.pinned?'📌 ':'')+row.message;item.append(text);if(canManage){const remove=document.createElement('button');remove.type='button';remove.textContent='Sil';remove.style.marginLeft='8px';remove.onclick=async()=>{try{await api(`/rooms/${encodeURIComponent(id)}/announcements/${encodeURIComponent(row.id)}`,{method:'DELETE'});await load()}catch(e){window.toast?.(e.message)}};item.append(remove)}root.append(item)})
      }catch(e){note(root,e.message||'Duyurular yüklenemedi.')}
    }
    form.onsubmit=async e=>{e.preventDefault();const message=form.querySelector('textarea').value.trim();if(!message)return;try{await api(`/rooms/${encodeURIComponent(id)}/announcements`,{method:'POST',body:JSON.stringify({message})});form.reset();await load()}catch(err){window.toast?.(err.message||'Duyuru kaydedilemedi.')}};
    load();
  }};
})();
