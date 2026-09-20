/* ErisChat cosmetics integration layer. */
(() => {
  'use strict';
  const API = () => window.ERIS_API || 'https://erischat-api-production.up.railway.app/v1';
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const value = token();
    if (value) headers.set('Authorization', `Bearer ${value}`);
    const response = await fetch(`${API()}${path}`, {...options, headers});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  };
  const state = {catalog: [], owned: [], user: null, prices: {standard: 1000, vip: 5000}};
  const list = value => Array.isArray(value) ? value : value?.items || value?.cosmetics || value?.data || [];
  const emit = () => window.dispatchEvent(new CustomEvent('erischat:cosmetics-updated', {detail: state}));

  // Backend asset_key values are relative to Gereken_icerikler. Resolve them
  // from the repository root so GitHub Pages serves /erischat/Gereken_icerikler/...
  // while absolute URLs and already-prefixed paths remain untouched.
  const assetUrl = key => {
    if (!key) return '';
    if (/^(https?:|data:|blob:|\/)/.test(key)) return key;
    let clean = String(key).replace(/^\.\//, '');
    if (!clean.startsWith('Gereken_icerikler/')) clean = `Gereken_icerikler/${clean}`;
    const encodedPath = clean.split('/').map(encodeURIComponent).join('/');
    return new URL(`./${encodedPath}`, document.baseURI).href;
  };

  async function load() {
    try {
      const [catalog, owned, user] = await Promise.all([api('/cosmetics'), api('/me/cosmetics'), api('/me')]);
      state.catalog = list(catalog);
      state.owned = list(owned);
      state.user = user;
      state.prices = {
        standard: Number(catalog?.price) || 1000,
        vip: Number(catalog?.vip_price) || 5000,
      };
      emit();
      applyAppearance();
      return state;
    } catch (error) {
      console.warn('[ErisChat cosmetics] yüklenemedi:', error.message);
      return state;
    }
  }

  async function purchase(cosmeticType, assetKey) {
    const result = await api('/me/cosmetics/purchase', {method:'POST', body:JSON.stringify({cosmetic_type:cosmeticType, asset_key:assetKey})});
    await load();
    return result;
  }

  async function apply(cosmeticType, assetKey) {
    const result = await api('/me/cosmetics/apply', {method:'POST', body:JSON.stringify({cosmetic_type:cosmeticType, asset_key:assetKey})});
    await load();
    return result;
  }

  const assetValue = (value, fallback = '') => {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    return value.url || value.src || value.asset_url || value.path || value.asset_key || fallback;
  };

  function applyAppearance(root = document) {
    const user = state.user;
    if (!user) return;
    const avatarKey = assetValue(user.avatar_asset, '');
    const frameKey = assetValue(user.frame_asset, '');
    const wallpaperKey = assetValue(user.wallpaper_asset, '');
    const avatar = assetUrl(avatarKey);
    const frame = assetUrl(frameKey);
    const wallpaper = assetUrl(wallpaperKey);
    if (wallpaper) { document.documentElement.style.setProperty('--eris-wallpaper', `url("${wallpaper}")`); document.body.style.backgroundImage = `linear-gradient(#05030aa8,#05030ad9), url("${wallpaper}")`; document.body.style.backgroundSize = 'cover'; document.body.style.backgroundAttachment = 'fixed'; } else { document.documentElement.style.removeProperty('--eris-wallpaper'); document.body.style.backgroundImage = ''; }
    root.querySelectorAll('[data-user-avatar], .profile .face, .user-avatar').forEach(el => {
      if (!avatar) return;
      el.style.backgroundImage = `url("${avatar}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
      el.textContent = '';
    });
    root.querySelectorAll('[data-user-frame], .profile .frameImg, .user-frame').forEach(el => {
      if (!frame) return;
      if (el.tagName === 'IMG') el.src = frame;
      else {
        el.style.backgroundImage = `url("${frame}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
      }
      el.style.display = '';
    });
  }

  const get = (type, vip = null) => state.catalog.filter(item => item.type === type && (vip === null || Boolean(item.vip) === vip));
  const owned = (type, key) => state.owned.some(item => item.cosmetic_type === type && item.asset_key === key);

  window.ErisChatCosmetics = {load, purchase, apply, state, get, owned, assetUrl, applyAppearance};
  window.addEventListener('erischat:auth', event => {
    if (event.detail?.state === 'ready') load();
  });
  window.addEventListener('erischat:profile', () => load());
  window.addEventListener('erischat:cosmetics-updated', () => applyAppearance());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true});
  else load();
})();
