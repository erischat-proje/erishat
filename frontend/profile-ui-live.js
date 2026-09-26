(() => {
  'use strict';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const boot = () => {
    const profile = document.querySelector('.profile');
    if (!profile || profile.querySelector('[data-erischat-profile-controls]')) return;
    const name = profile.querySelector('.name h2');
    const balance = profile.querySelector('.balance, .profile .balance');
    const controls = document.createElement('div');
    controls.setAttribute('data-erischat-profile-controls', '');
    controls.style.cssText = 'margin-top:18px;padding:14px;border:1px solid #ffffff14;border-radius:18px;background:#ffffff05;display:grid;gap:9px';
    controls.innerHTML = `
      <div style="font-size:11px;font-weight:800">Profil ayarları</div>
      <div style="display:flex;gap:8px">
        <input data-profile-nickname maxlength="32" placeholder="Takma ad" autocomplete="nickname" style="flex:1;min-width:0;background:#ffffff07;border:1px solid #ffffff14;color:#fff;border-radius:12px;padding:10px;outline:none">
        <button data-profile-save type="button" style="border:0;border-radius:12px;background:linear-gradient(135deg,#7b4cff,#ff4fa3);color:#fff;padding:0 13px;font-weight:800">Kaydet</button>
      </div>
      <button data-profile-notifications type="button" style="display:flex;align-items:center;justify-content:space-between;border:1px solid #ffffff14;background:#ffffff05;color:#fff;border-radius:12px;padding:10px;text-align:left">
        <span><b style="display:block;font-size:10px">Bildirimler</b><small data-profile-notification-label style="color:#938a9f;font-size:8px">Yükleniyor…</small></span>
        <span data-profile-switch class="switch"></span>
      </button>
      <button data-profile-logout type="button" style="border:1px solid #ff4f6d44;background:#ff4f6d0d;color:#ff9aaa;border-radius:12px;padding:10px;font-size:10px;font-weight:800">Oturumu kapat</button>
      <div data-profile-status style="font-size:8px;color:#938a9f;min-height:11px"></div>
    `;
    profile.appendChild(controls);
    const roomsBtn=document.createElement('button');roomsBtn.type='button';roomsBtn.textContent='🏠 Odalar';roomsBtn.style.cssText='border:1px solid #ffffff14;background:#ffffff05;color:#fff;border-radius:12px;padding:11px;font-size:10px;font-weight:800';controls.appendChild(roomsBtn);
    const openMyRooms=async()=>{const modal=document.createElement('div');modal.style.cssText='position:fixed;inset:0;z-index:500;background:rgba(2,1,7,.78);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px';modal.innerHTML='<div style="width:min(440px,100%);max-height:82vh;overflow:auto;background:#0b0911;border:1px solid #ffffff14;border-radius:24px;padding:18px;color:#fff"><div style="display:flex;justify-content:space-between;align-items:center"><b>🏠 Odalarım</b><button class="close" data-close>×</button></div><div data-myrooms style="margin-top:12px">Yükleniyor…</div></div>';document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();try{const raw=await window.ErisPlatform.api('/rooms/me/rooms');const rows=Array.isArray(raw)?raw:(raw?.rooms||raw?.items||raw?.data||[]);const box=modal.querySelector('[data-myrooms]');box.innerHTML=rows.length?rows.map(r=>'<button data-room="'+escapeHtml(r.id)+'" data-name="'+escapeHtml(r.name||'Oda')+'" style="width:100%;text-align:left;margin-bottom:8px;border:1px solid #ffffff12;background:#ffffff06;color:#fff;border-radius:16px;padding:12px"><b>🏠 '+escapeHtml(r.name||'Oda')+'</b><small style="display:block;color:#938a9f;margin-top:4px">'+(r.role==='owner'?'👑 Oda sahibi':'🛡️ Moderatör')+' • ID '+escapeHtml(r.public_id||r.id)+' • Seviye '+Number(r.level||1)+'</small></button>').join(''):'<div style="color:#938a9f;font-size:9px">Sahibi veya moderatörü olduğun oda yok.</div>';box.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>{modal.remove();window.openRoom?.(b.dataset.room,b.dataset.name)});}catch(e){modal.querySelector('[data-myrooms]').textContent=e.message||'Odalar alınamadı.'}};roomsBtn.onclick=openMyRooms;
    const vipPanel = document.createElement('div');
    vipPanel.setAttribute('data-erischat-vip-panel', '');
    vipPanel.style.cssText = 'margin-top:10px;padding:14px;border:1px solid #ffffff14;border-radius:18px;background:linear-gradient(135deg,#ffffff07,#8a5cff0d);display:grid;gap:8px';
    vipPanel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;font-weight:900">VIP DURUMU</span><span data-vip-badge style="font-size:18px"></span></div><div data-vip-title style="font-size:10px;color:#fff">VIP değil</div><div data-vip-progress style="font-size:8px;color:#938a9f">Seviye bilgisi yükleniyor…</div><div style="height:6px;background:#ffffff0b;border-radius:99px;overflow:hidden"><div data-vip-bar style="height:100%;width:0%;background:linear-gradient(90deg,#7b4cff,#ff4fa3);border-radius:99px;transition:width .25s"></div></div><div data-vip-perks style="font-size:8px;color:#938a9f;line-height:1.45"></div>';
    profile.appendChild(vipPanel);
    const nicknameInput = controls.querySelector('[data-profile-nickname]');
    const saveButton = controls.querySelector('[data-profile-save]');
    const notificationButton = controls.querySelector('[data-profile-notifications]');
    const logoutButton = controls.querySelector('[data-profile-logout]');
    const switchEl = controls.querySelector('[data-profile-switch]');
    const label = controls.querySelector('[data-profile-notification-label]');
    const status = controls.querySelector('[data-profile-status]');
    const toastSafe = message => typeof window.toast === 'function' ? window.toast(message) : (status.textContent = message);
    const setNotificationState = enabled => { switchEl.classList.toggle('on', !!enabled); label.textContent = enabled ? 'Açık' : 'Kapalı'; };
    const render = user => {
      if (!user) return;
      if (nicknameInput && user.nickname) nicknameInput.value = user.nickname;
      setNotificationState(user.notifications_enabled !== false);
      if (balance && user.lidya != null) balance.textContent = `💎 ${Number(user.lidya).toLocaleString('tr-TR')}`;
      if (name && user.nickname) name.textContent = user.nickname;
      const face = profile.querySelector('.face');
      const frame = profile.querySelector('.frameImg');
      const assetValue = value => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        return value.url || value.src || value.asset_url || value.path || value.asset_key || '';
      };
      const assetUrl = value => {
        const raw = assetValue(value);
        return raw && window.ErisChatCosmetics?.assetUrl ? window.ErisChatCosmetics.assetUrl(raw) : raw;
      };
      const avatarUrl = assetUrl(user.avatar_asset);
      const frameUrl = assetUrl(user.frame_asset);
      if (face) {
        if (avatarUrl) {
          face.style.backgroundImage = `url("${avatarUrl.replace(/"/g,'%22')}")`;
          face.style.backgroundSize = 'cover';
          face.style.backgroundPosition = 'center';
          face.textContent = '';
        } else {
          face.style.backgroundImage = '';
        }
      }
      if (frame) {
        frame.src = frameUrl || '';
        frame.style.display = frameUrl ? '' : 'none';
      }
      if (window.ErisChatCosmetics?.applyAppearance) window.ErisChatCosmetics.applyAppearance();
      const vipPanel = controls.parentElement?.querySelector('[data-erischat-vip-panel]');
      if (vipPanel) {
        const badge = vipPanel.querySelector('[data-vip-badge]');
        const title = vipPanel.querySelector('[data-vip-title]');
        const progress = vipPanel.querySelector('[data-vip-progress]');
        const bar = vipPanel.querySelector('[data-vip-bar]');
        const perks = vipPanel.querySelector('[data-vip-perks]');
        Promise.resolve().then(async () => {
          const apiBase = (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
          const token = localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
          const response = await fetch(apiBase + '/me/vip', {headers:{Accept:'application/json', Authorization:'Bearer '+token}});
          if (!response.ok) throw new Error('VIP verisi alınamadı');
          return response.json();
        }).then(vip => {
          const level = Number(vip.level || 0); const spent = Number(vip.total_spent || 0); const next = vip.next_level_spent == null ? null : Number(vip.next_level_spent);
          badge.textContent = vip.badge || '';
          title.textContent = level ? (vip.title || ('VIP '+level)) + ' • Seviye ' + level : 'VIP değil';
          if (!level) { progress.textContent = 'VIP seviyesi henüz açılmadı.'; bar.style.width = '0%'; }
          else if (!next) { progress.textContent = spent.toLocaleString('tr-TR') + ' toplam harcama • Maksimum VIP seviyesi'; bar.style.width = '100%'; }
          else { const thresholds=[0,1000,5000,15000,30000,60000,120000,250000,500000,1000000,2000000,5000000,10000000]; const base=thresholds[Math.min(level,12)]||0; const localSpent=vip.current_level_spent==null?Math.max(0,spent-base):Math.max(0,Number(vip.current_level_spent||0)); const needed=Math.max(1,next-base); const pct=Math.max(0,Math.min(100,(localSpent/needed)*100)); progress.textContent = spent.toLocaleString('tr-TR') + ' / ' + next.toLocaleString('tr-TR') + ' • Sonraki seviye VIP ' + (level+1); bar.style.width = pct + '%'; }
          const perkList = Array.isArray(vip.perks) ? vip.perks.slice(-4) : []; perks.textContent = perkList.length ? 'Açılan özellikler: ' + perkList.join(' • ') : 'Açılan özellik bulunmuyor.';
        }).catch(() => { progress.textContent = 'VIP verisi alınamadı.'; });
      }
    };
    const refresh = async () => {
      try {
        if (!window.ErisAuth?.getMe) return;
        const user = await window.ErisAuth.getMe();
        render(user);
        status.textContent = 'Profil gerçek hesap verisiyle senkronize.';
      } catch (_) { status.textContent = 'Profil verisi alınamadı.'; }
    };
    saveButton.addEventListener('click', async () => {
      const nickname = (nicknameInput.value || '').trim();
      if (!nickname) return toastSafe('Takma ad boş olamaz.');
      saveButton.disabled = true;
      try {
        const user = await window.ErisAuth.updateMe({ nickname });
        render(user);
        window.dispatchEvent(new CustomEvent('erischat:profile', { detail: user }));
        toastSafe('Profil güncellendi ✓');
      } catch (error) { toastSafe(error.message || 'Profil güncellenemedi.'); }
      finally { saveButton.disabled = false; }
    });
    notificationButton.addEventListener('click', async () => {
      const enabled = !switchEl.classList.contains('on');
      notificationButton.disabled = true;
      try {
        const user = await window.ErisAuth.updateMe({ notifications_enabled: enabled });
        render(user);
        toastSafe(enabled ? 'Bildirimler açıldı 🔔' : 'Bildirimler kapatıldı');
      } catch (error) { toastSafe(error.message || 'Bildirim ayarı güncellenemedi.'); }
      finally { notificationButton.disabled = false; }
    });
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        await window.ErisAuth.logout();
        status.textContent = 'Oturum kapatıldı.';
      } catch (error) { toastSafe(error.message || 'Oturum kapatılamadı.'); }
      finally { logoutButton.disabled = false; }
    });
    window.addEventListener('erischat:auth', event => { if (event.detail?.user) render(event.detail.user); else if (event.detail?.state === 'logged_out') status.textContent = 'Oturum kapatıldı.'; else refresh(); });
    window.addEventListener('erischat:profile', event => render(event.detail));
    window.addEventListener('erischat:cosmetics-updated', () => render(window.ErisAuth?.user));
    refresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
