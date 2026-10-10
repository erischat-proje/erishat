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
  const state = {catalog: [], wallpapers: [], owned: [], user: null, prices: {standard: 1000, vip: 5000}};
  const list = value => Array.isArray(value) ? value : value?.items || value?.cosmetics || value?.data || [];
  const emit = () => window.dispatchEvent(new CustomEvent('erischat:cosmetics-updated', {detail: state}));

  // The new avatar and wallpaper collection lives at the repository root.
  // Frames and earlier non-replaced assets live under Gereken_icerikler.
  const premiumAssets = new Set(["shop-expansion/bubble-female-01.svg", "shop-expansion/bubble-female-02.svg", "shop-expansion/bubble-female-03.svg", "shop-expansion/bubble-female-04.svg", "shop-expansion/bubble-female-05.svg", "shop-expansion/bubble-female-08.svg", "shop-expansion/entrance-female-01.svg", "shop-expansion/entrance-female-02.svg", "shop-expansion/entrance-female-03.svg", "shop-expansion/entrance-female-04.svg", "shop-expansion/entrance-female-05.svg", "shop-expansion/entrance-female-08.svg", "shop-expansion/frame-female-01.svg", "shop-expansion/frame-female-02.svg", "shop-expansion/frame-female-03.svg", "shop-expansion/frame-female-04.svg", "shop-expansion/frame-female-07.svg", "shop-expansion/bubble-male-01.svg", "shop-expansion/bubble-male-02.svg", "shop-expansion/bubble-male-03.svg", "shop-expansion/bubble-male-04.svg", "shop-expansion/bubble-male-05.svg", "shop-expansion/bubble-male-08.svg", "shop-expansion/entrance-male-01.svg", "shop-expansion/entrance-male-02.svg", "shop-expansion/entrance-male-03.svg", "shop-expansion/entrance-male-04.svg", "shop-expansion/entrance-male-05.svg", "shop-expansion/entrance-male-07.svg", "shop-expansion/frame-male-02.svg", "shop-expansion/profile-female-01.svg", "shop-expansion/profile-female-02.svg", "shop-expansion/profile-female-03.svg", "shop-expansion/profile-female-04.svg", "shop-expansion/profile-female-05.svg", "shop-expansion/profile-female-08.svg", "shop-expansion/profile-male-01.svg", "shop-expansion/profile-male-02.svg", "shop-expansion/profile-male-03.svg", "shop-expansion/profile-male-04.svg", "shop-expansion/profile-male-08.svg"]);
  const assetUrl = key => {
    if (!key) return '';
    if (/^(https?:|data:|blob:|\/)/.test(key)) return key;
    let clean = String(key).replace(/^\.\//, '');
    clean = window.ErisVIPArt?.resolve(clean) || clean;
    if (premiumAssets.has(clean)) clean = clean.replace('shop-expansion/', 'shop-premium-v2/').replace(/\.svg$/, '.webp');
    if (!/^(shop-premium-v2|Gereken_icerikler|avatarveduvarkağıdı|vip-assets|vip-designs|shop-expansion|relationship-assets|anonymous-assets|fan-levels|hediyesistemi)\//.test(clean)) clean = `Gereken_icerikler/${clean}`;
    const encodedPath = clean.split('/').map(encodeURIComponent).join('/');
    const result = new URL(`./${encodedPath}`, document.baseURI);
    if (/^(?:shop-expansion|shop-premium-v2)\/(?:frame|bubble|entrance|profile|title)-/.test(clean)) result.searchParams.set('v', 'premium720-20261004');
    return result.href;
  };

  async function load() {
    if (!token()) return state;
    try {
      const [catalog, owned, user, wallpapers] = await Promise.all([api('/cosmetics'), api('/me/cosmetics'), api('/me'), api('/wallpapers').catch(() => ({items: []}))]);
      state.catalog = list(catalog);
      state.wallpapers = list(wallpapers);
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
    const wallpaper = assetUrl(state.wallpapers.find(item => item.key === wallpaperKey)?.asset);
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
        el.style.backgroundSize = 'contain';
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
