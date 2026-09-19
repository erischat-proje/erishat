(() => {
  const API = (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};
  async function loadRooms() {
    const targets = [...document.querySelectorAll('#realRooms,#rooms')]; if (!targets.length) return;
    try {
      const r = await fetch(`${API}/rooms`, { headers: headers() }); if (!r.ok) throw new Error(`rooms:${r.status}`);
      const data = await r.json(); const rooms = Array.isArray(data) ? data : (data.rooms || data.items || data.data || []);
      targets.forEach(el => { el.innerHTML=''; if (!rooms.length) { window.dispatchEvent(new CustomEvent('erischat:demo-rooms-fallback')); return; }
        rooms.forEach(room => { const id=room.id ?? room.room_id, name=room.name||room.title||`Oda #${id}`, count=room.member_count??room.members_count??room.online_count??0, owner=room.owner_name||room.owner||'ErisChat'; const b=document.createElement('button'); b.className='room card'; b.innerHTML='<div class="ava">🎙️<span class="online"></span></div><div class="grow roomText"><b></b><small></small></div><span class="live">CANLI</span>'; b.querySelector('b').textContent=name; b.querySelector('small').textContent=`${count} kişi • ${owner}`; b.onclick=()=>{window.ErisCurrentRoomId=id;window.currentRoomId=id;if(typeof window.openRoom==='function') window.openRoom(id,name); else window.toast?.(`${name} odasına bağlanılıyor…`)}; el.appendChild(b); });
      });
    } catch(e) { console.warn('[ErisChat] room list unavailable',e); window.dispatchEvent(new CustomEvent('erischat:demo-rooms-fallback')); }
  }
  window.ErisChatRoomList={load:loadRooms};
  window.addEventListener('erischat:demo-rooms-fallback',()=>{
    const data=[
      ['demo-room-1','Gece Muhabbeti',8,'Rana','🌙'],['demo-room-2','Müzik Köşesi',12,'Eris','🎵'],['demo-room-3','Yeni Tanışmalar',5,'Lavin','💜'],['demo-room-4','Oyun Salonu',9,'Noir','🎮'],['demo-room-5','VIP Lounge',11,'NØXIA','👑'],['demo-room-6','Gece Yayını',7,'Mira','✨']
    ];
    document.querySelectorAll('#realRooms,#rooms').forEach(el=>{el.innerHTML='';data.forEach(r=>{const b=document.createElement('button');b.className='room card';b.innerHTML='<div class="ava">'+r[4]+'<span class="online"></span></div><div class="grow roomText"><b></b><small></small></div><span class="live">DEMO CANLI</span>';b.querySelector('b').textContent=r[1];b.querySelector('small').textContent=r[2]+' kişi • '+r[3];b.onclick=()=>openRoom(r[0],r[1]);el.appendChild(b)});});
  });


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
    }catch(e){
      if(String(id).startsWith('demo-room-')){
        const seatsFallback=[]; for(let n=1;n<=12;n++) seatsFallback.push({seat_number:n,user_id:n===1?'demo-owner':null,nickname:n===1?'Oda Sahibi':''});
        if(meta) meta.textContent='Demo oda • 12 koltuk • sohbet aktif';
        if(seats){seats.innerHTML='';seatsFallback.forEach(s=>{const b=document.createElement('button');b.type='button';b.className='item card';b.innerHTML='<div class="ava">'+(s.user_id?'👤':'🎙️')+'</div><div class="grow"><b></b><small></small></div>';b.querySelector('b').textContent=s.user_id?(s.nickname||'Dolu'):'Koltuk '+s.seat_number;b.querySelector('small').textContent=s.user_id?'Dolu':'Boş';b.onclick=()=>{b.querySelector('b').textContent='Sen';b.querySelector('small').textContent='Dolu';window.toast?.('Koltuk alındı ✓')};seats.appendChild(b)})}
        window.toast?.('Demo oda açıldı ✓'); return;
      }
      if(meta) meta.textContent='Oda açılamadı';window.toast?.(e.message||'Odaya bağlanılamadı.');
    }
  }
  function closeRealRoom(){
    const id=window.ErisCurrentRoomId||window.currentRoomId;
    document.getElementById('realRoomModal')?.classList.remove('show');
    if(id) window.ErisRoom?.leave?.(id).catch(()=>{});
    window.disconnectRoomGiftSocket?.();
    window.ErisCurrentRoomId=null; window.currentRoomId=null;
  }
  window.openLiveRoomChat=()=>{const id=window.ErisCurrentRoomId||window.currentRoomId;if(!id){window.toast?.('Önce bir oda aç.');return}window.ERIS_DEMO_ROOM_ID=String(id);if(window.ErisDemoExtras?.roomChat){window.ErisDemoExtras.roomChat();}else{window.toast?.('Canlı sohbet arayüzü yükleniyor…');setTimeout(()=>window.ErisDemoExtras?.roomChat?.(),250);}};
  window.openRoom=openRoom;
  window.closeRealRoom=closeRealRoom;

  // Customer demo surfaces are part of the real room entrypoint so the firm-demo integrity check
  // and the room UI use the same loaded surface rather than a hidden/duplicate demo bootstrap.
  ['./full-demo-live.js','./demo-complete-live.js','./demo-extras-live.js'].forEach(file => {
    if (document.querySelector('script[data-eris-demo="'+file+'"]')) return;
    const s=document.createElement('script'); s.src=file; s.dataset.erisDemo=file; s.defer=true; document.head.appendChild(s);
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadRooms,{once:true}); else loadRooms();
})();
