(() => {
  'use strict';
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
      if (window.ErisChatCosmetics?.applyAppearance) window.ErisChatCosmetics.applyAppearance();
      const vipPanel = controls.parentElement?.querySelector('[data-erischat-vip-panel]');
      if (vipPanel) {
        const badge = vipPanel.querySelector('[data-vip-badge]');
        const title = vipPanel.querySelector('[data-vip-title]');
        const progress = vipPanel.querySelector('[data-vip-progress]');
        const bar = vipPanel.querySelector('[data-vip-bar]');
        const perks = vipPanel.querySelector('[data-vip-perks]');
        Promise.resolve().then(async () => {
          const apiBase = (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-production.up.railway.app/v1').replace(/\\/$/, '');
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
          else { const current = Number(vip.current_level_spent ?? 0); const pct = Math.max(0, Math.min(100, next > current ? ((spent-current)/(next-current))*100 : 0)); progress.textContent = spent.toLocaleString('tr-TR') + ' / ' + next.toLocaleString('tr-TR') + ' • Sonraki seviye VIP ' + (level+1); bar.style.width = pct + '%'; }
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
        nicknameInput.value = '';
        status.textContent = 'Oturum kapatıldı. Yeni anonim oturum hazırlanıyor…';
        const user = await window.ErisAuth.ensureSession();
        window.ErisAuth.user = user;
        render(user);
        window.ErisAuth.connectGeneralWs();
        window.dispatchEvent(new CustomEvent('erischat:auth', { detail: { state: 'ready', user } }));
        toastSafe('Yeni anonim oturum açıldı ✓');
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
