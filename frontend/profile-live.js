(() => {
  if (!document.getElementById('eris-admin-name-badge-style')) {
    const style = document.createElement('style');
    style.id = 'eris-admin-name-badge-style';
    style.textContent = `
      .profile .name h2{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}
      .eris-admin-name-badge{display:inline-flex;align-items:center;justify-content:center;height:20px;min-width:28px;padding:0 7px;border-radius:7px;font-size:10px;font-weight:950;line-height:1;letter-spacing:.7px;color:#fff;border:1px solid currentColor;box-shadow:0 0 12px currentColor;vertical-align:middle}
      .eris-admin-name-badge-sa{color:#ff5364;background:linear-gradient(135deg,#55121d,#b51f36)}
      .eris-admin-name-badge-ua{color:#ffd15c;background:linear-gradient(135deg,#5b3c08,#b7790b)}
      .eris-admin-name-badge-fa{color:#58b9ff;background:linear-gradient(135deg,#0a3458,#126ca8)}
      .eris-admin-name-badge-da{color:#c78aff;background:linear-gradient(135deg,#351057,#7626ad)}
    `;
    document.head.appendChild(style);
  }
  const auth = () => window.ErisAuth;
  const $ = selector => document.querySelector(selector);

  function render(user) {
    if (!user) return;
    const name = $('.profile .name h2');
    const stats = document.querySelectorAll('.profile .stats .stat b');
    if (stats[0] && user.followers_count != null) stats[0].textContent = Number(user.followers_count).toLocaleString('tr-TR');
    if (stats[1] && user.following_count != null) stats[1].textContent = Number(user.following_count).toLocaleString('tr-TR');
    if (name) {
      name.replaceChildren();
      const role = ['SA','UA','FA','DA'].includes(user.admin_role) ? user.admin_role : null;
      if (role) {
        const badge = document.createElement('span');
        badge.className = 'eris-admin-name-badge eris-admin-name-badge-' + role.toLowerCase();
        badge.textContent = role;
        badge.setAttribute('aria-label', role + ' yönetici rozeti');
        name.append(badge);
      }
      const nickname = document.createElement('span');
      nickname.textContent = user.nickname || 'Anonim';
      name.append(nickname);
    }
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
    if (balance && Number.isFinite(Number(user.lidya))) balance.textContent = `${Number(user.lidya).toLocaleString('tr-TR')}`;
    document.querySelectorAll('[data-erischat-nickname]').forEach(el => { el.textContent = user.nickname || 'Anonim'; });
    if (window.ErisChatCosmetics?.applyAppearance) window.ErisChatCosmetics.applyAppearance();
    const profile = document.querySelector('.profile');
    if (profile && user.id) window.ErisChatVIP?.watch?.(profile, user.id);

  }

  async function refresh() {
    if (!auth()?.getMe || !(localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token'))) return null;
    const user = await auth().getMe();
    auth().user = user;
    if(window.ErisChatCosmetics?.state)window.ErisChatCosmetics.state.user=user;
    render(user);
    return user;
  }

  async function update(payload) {
    if (!auth()?.updateMe) return null;
    const user = await auth().updateMe(payload);
    auth().user = user;
    if(window.ErisChatCosmetics?.state)window.ErisChatCosmetics.state.user=user;
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
