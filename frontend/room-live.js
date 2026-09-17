(() => {
  const API = (window.ERISCHAT_API || 'https://erischat-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const headers = () => token() ? { Authorization: `Bearer ${token()}` } : {};

  async function loadRooms() {
    const targets = [...document.querySelectorAll('#realRooms,#rooms')];
    if (!targets.length) return;
    try {
      const r = await fetch(`${API}/rooms`, { headers: headers() });
      if (!r.ok) throw new Error(`rooms:${r.status}`);
      const data = await r.json();
      const rooms = Array.isArray(data) ? data : (data.rooms || data.items || []);
      targets.forEach(el => {
        el.innerHTML = '';
        if (!rooms.length) {
          el.innerHTML = '<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Henüz aktif oda yok.</div>';
          return;
        }
        rooms.forEach(room => {
          const id = room.id ?? room.room_id;
          const name = room.name || room.title || `Oda #${id}`;
          const count = room.member_count ?? room.members_count ?? room.online_count ?? 0;
          const owner = room.owner_name || room.owner || 'ErisChat';
          const b = document.createElement('button');
          b.className = 'room card';
          b.innerHTML = `<div class="ava">🎙️<span class="online"></span></div><div class="grow roomText"><b></b><small></small></div><span class="live">CANLI</span>`;
          b.querySelector('b').textContent = name;
          b.querySelector('small').textContent = `${count} kişi • ${owner}`;
          b.onclick = () => {
            if (typeof window.openRoom === 'function') window.openRoom(id, name);
            else if (typeof window.toast === 'function') window.toast(`${name} odasına bağlanılıyor…`);
          };
          el.appendChild(b);
        });
      });
    } catch (e) {
      console.warn('[ErisChat] room list unavailable', e);
      targets.forEach(el => {
        el.innerHTML = '<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Odalar şu anda yüklenemedi.</div>';
      });
    }
  }

  window.ErisChatRoomList = { load: loadRooms };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadRooms, { once: true });
  else loadRooms();
})();
