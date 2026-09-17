/* ErisChat room-specific ban management bridge. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const toast = message => typeof window.toast === 'function' ? window.toast(message) : console.warn(message);

  function ensurePanel() {
    let panel = document.getElementById('erischatBanPanel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'erischatBanPanel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:180;background:#020107e8;display:none;align-items:flex-end;';
    panel.innerHTML = '<div style="width:min(520px,100%);max-height:82vh;overflow:auto;background:#0b0911;border:1px solid #fff1;border-radius:26px 26px 0 0;padding:16px;color:#fff"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><b style="font-size:16px">🚫 Oda’dan Atılanlar</b><div id="erischatBanStatus" style="font-size:9px;color:#938a9f;margin-top:4px">Oda bazlı engelleme listesi</div></div><button id="erischatBanClose" style="border:0;background:#ffffff09;color:#fff;width:35px;height:35px;border-radius:11px">✕</button></div><div id="erischatBanList" style="display:grid;gap:8px;margin-top:14px"></div></div>';
    document.body.appendChild(panel);
    panel.querySelector('#erischatBanClose').onclick = () => { panel.style.display = 'none'; };
    panel.addEventListener('click', event => { if (event.target === panel) panel.style.display = 'none'; });
    return panel;
  }

  async function openRoomBanManager(roomId) {
    if (!roomId || !window.ErisRoom || typeof window.ErisRoom.bans !== 'function') {
      toast('Oda ban sistemi henüz hazır değil.');
      return;
    }
    const panel = ensurePanel();
    const list = panel.querySelector('#erischatBanList');
    const status = panel.querySelector('#erischatBanStatus');
    panel.style.display = 'flex';
    list.innerHTML = '<div style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Liste yükleniyor…</div>';
    try {
      const data = await window.ErisRoom.bans(roomId);
      const bans = Array.isArray(data) ? data : (data.bans || data.items || []);
      status.textContent = `${bans.length} kullanıcı bu odaya giremiyor`;
      if (!bans.length) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Bu odada atılan kullanıcı yok.</div>';
        return;
      }
      list.innerHTML = '';
      bans.forEach(item => {
        const userId = item.user_id || item.id;
        const displayName = item.display_name || item.nickname || item.public_id || userId;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px;border:1px solid #fff1;background:#ffffff05;border-radius:15px;';
        row.innerHTML = `<div style="width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#ff4fa318">🚫</div><div style="flex:1;min-width:0"><b style="font-size:10px">${esc(displayName)}</b><small style="display:block;color:#938a9f;font-size:8px;margin-top:3px">${esc(userId)}</small></div><button data-user="${esc(userId)}" style="border:1px solid #ff4fa355;background:#ff4fa312;color:#ff78ba;border-radius:10px;padding:8px 10px;font-size:9px">Yasağı kaldır</button>`;
        row.querySelector('button').onclick = async () => {
          const button = row.querySelector('button');
          button.disabled = true;
          try {
            await window.ErisRoom.unban(roomId, userId);
            row.remove();
            status.textContent = `${Math.max(0, Number(status.textContent.match(/\d+/)?.[0] || 1) - 1)} kullanıcı bu odaya giremiyor`;
            toast('Kullanıcının oda yasağı kaldırıldı.');
          } catch (error) {
            button.disabled = false;
            toast(error?.message || 'Yasak kaldırılamadı.');
          }
        };
        list.appendChild(row);
      });
    } catch (error) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:#ff8abb;font-size:10px">Atılanlar listesi alınamadı.</div>';
      status.textContent = 'Liste alınamadı';
      console.warn('[ErisChat] ban list unavailable', error);
    }
  }

  window.openRoomBanManager = openRoomBanManager;
  window.dispatchEvent(new CustomEvent('erischat:room-ban-ui-ready'));
})();
