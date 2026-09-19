(() => {
  const API = (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  async function loadRooms() {
    const targets = [...document.querySelectorAll('#realRooms,#rooms')]; if (!targets.length) return;
    try {
      const r = await fetch(`${API}/rooms`, { headers: headers() }); if (!r.ok) throw new Error(`rooms:${r.status}`);
      const data = await r.json(); const rooms = Array.isArray(data) ? data : (data.rooms || data.items || []);
      targets.forEach(el => { el.innerHTML=''; if (!rooms.length) { el.innerHTML='<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Henüz aktif oda yok.</div>'; return; }
        rooms.forEach(room => { const id=room.id ?? room.room_id, name=room.name||room.title||`Oda #${id}`, count=room.member_count??room.members_count??room.online_count??0, owner=room.owner_name||room.owner||'ErisChat'; const b=document.createElement('button'); b.className='room card'; b.innerHTML='<div class="ava">🎙️<span class="online"></span></div><div class="grow roomText"><b></b><small></small></div><span class="live">CANLI</span>'; b.querySelector('b').textContent=name; b.querySelector('small').textContent=`${count} kişi • ${owner}`; b.onclick=()=>{window.ErisCurrentRoomId=id;window.currentRoomId=id;if(typeof window.openRoom==='function') window.openRoom(id,name); else window.toast?.(`${name} odasına bağlanılıyor…`)}; el.appendChild(b); });
      });
    } catch(e) { console.warn('[ErisChat] room list unavailable',e); targets.forEach(el=>el.innerHTML='<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Odalar şu anda yüklenemedi.</div>'); }
  }
  window.ErisChatRoomList={load:loadRooms};

  async function openRoom(roomId, name){
    const id=String(roomId||''); if(!id) return;
    window.ErisCurrentRoomId=id; window.currentRoomId=id;
    const modal=document.getElementById('realRoomModal');
    document.getElementById('realRoomTitle')?.replaceChildren(document.createTextNode(name||'Oda'));
    const meta=document.getElementById('realRoomMeta'), seats=document.getElementById('realRoomSeats');
    if(meta) meta.textContent='Gerçek oda • yükleniyor…';
    if(seats) seats.innerHTML='<div class="card" style="padding:14px;text-align:center;color:#938a9f">Koltuklar yükleniyor…</div>';
    modal?.classList.add('show');
    try{
      await window.ErisRoom?.join?.(id);
      const room=await window.ErisRoom?.get?.(id);
      const list=Array.isArray(room?.seats)?room.seats:[];
      if(meta) meta.textContent=`${Number(room?.member_count||room?.members_count||0)} kişi • gerçek oda`;
      if(seats){
        seats.innerHTML='';
        list.forEach(seat=>{
          const n=seat.seat_number??seat.number??'';
          const occupied=!!seat.user_id, locked=!!(seat.locked||seat.is_locked);
          const b=document.createElement('button'); b.type='button'; b.className='item card';
          b.innerHTML='<div class="ava">'+(occupied?'👤':'🎙️')+'</div><div class="grow"><b></b><small></small></div>';
          b.querySelector('b').textContent=occupied?(seat.nickname||seat.user_name||'Dolu'):`Koltuk ${n}`;
          b.querySelector('small').textContent=locked?'Kilitli':(occupied?'Dolu':'Boş');
          if(!occupied&&!locked) b.onclick=async()=>{try{await window.ErisRoom.joinSeat(id,n);await openRoom(id,name)}catch(e){window.toast?.(e.message||'Koltuk alınamadı.')}};
          seats.appendChild(b);
        });
        if(!list.length) seats.innerHTML='<div class="card" style="padding:14px;text-align:center;color:#938a9f">Koltuk bilgisi yok.</div>';
      }
      window.connectRoomGiftSocket?.(id);
    }catch(e){if(meta) meta.textContent='Oda açılamadı';window.toast?.(e.message||'Odaya bağlanılamadı.');}
  }
  function closeRealRoom(){
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    document.getElementById('realRoomModal')?.classList.remove('show');
    if(id) window.ErisRoom?.leave?.(id).catch(()=>{});
    window.disconnectRoomGiftSocket?.();
    window.ErisCurrentRoomId=null; window.currentRoomId=null;
  }
  window.openRoom=openRoom;
  window.closeRealRoom=closeRealRoom;

  // Customer demo surfaces are part of the real room entrypoint so the firm-demo integrity check
  // and the room UI use the same loaded surface rather than a hidden/duplicate demo bootstrap.
  ['./demo-complete-live.js','./demo-extras-live.js'].forEach(file => {
    if (document.querySelector('script[data-eris-demo="'+file+'"]')) return;
    const s=document.createElement('script'); s.src=file; s.dataset.erisDemo=file; s.defer=true; document.head.appendChild(s);
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadRooms,{once:true}); else loadRooms();
})();
