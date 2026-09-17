(() => {
  const auth = () => window.ErisAuth;
  const $ = selector => document.querySelector(selector);

  function render(user) {
    if (!user) return;
    const name = $('.profile .name h2');
    if (name) name.textContent = user.nickname || 'Anonim';
    const face = $('.profile .face');
    if (face) {
      const hasCosmeticAvatar = Boolean(user.avatar_asset || user.avatar?.url || user.avatar?.src || user.avatar?.asset_url || user.avatar?.path || user.avatar?.asset_key);
      if (!hasCosmeticAvatar) {
        face.textContent = user.avatar || '👤';
        face.style.display = 'grid';
        face.style.placeItems = 'center';
        face.style.fontSize = '54px';
      }
    }
    const balance = $('.balance');
    if (balance && Number.isFinite(Number(user.lidya))) balance.textContent = `💎 ${Number(user.lidya).toLocaleString('tr-TR')}`;
    document.querySelectorAll('[data-erischat-nickname]').forEach(el => { el.textContent = user.nickname || 'Anonim'; });
    if (window.ErisChatCosmetics?.applyAppearance) window.ErisChatCosmetics.applyAppearance();
  }

  async function refresh() {
    if (!auth()?.getMe) return null;
    const user = await auth().getMe();
    auth().user = user;
    render(user);
    return user;
  }

  async function update(payload) {
    if (!auth()?.updateMe) return null;
    const user = await auth().updateMe(payload);
    auth().user = user;
    render(user);
    window.dispatchEvent(new CustomEvent('erischat:profile', { detail: user }));
    return user;
  }

  async function setNotifications(enabled) {
    return update({ notifications_enabled: Boolean(enabled) });
  }

  window.ErisProfile = { refresh, update, setNotifications, render };

  window.addEventListener('erischat:auth', event => {
    if (event.detail?.state === 'ready') render(event.detail.user);
  });

  const boot = () => refresh().catch(error => console.warn('[ErisChat] profile refresh unavailable', error));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
