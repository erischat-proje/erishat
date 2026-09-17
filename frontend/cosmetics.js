/* ErisChat cosmetics integration layer. */
(() => {
  'use strict';
  const API = () => window.ERIS_API || 'https://erischat-production.up.railway.app/v1';
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
  const state = {catalog: [], owned: [], user: null};
  const list = value => Array.isArray(value) ? value : value?.items || value?.cosmetics || value?.data || [];
  const emit = () => window.dispatchEvent(new CustomEvent('erischat:cosmetics-updated', {detail: state}));

  async function load() {
    try {
      const [catalog, owned, user] = await Promise.all([api('/cosmetics'), api('/me/cosmetics'), api('/me')]);
      state.catalog = list(catalog);
      state.owned = list(owned);
      state.user = user;
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
    const avatar = assetValue(user.avatar_asset, '');
    const frame = assetValue(user.frame_asset, '');
    root.querySelectorAll('[data-user-avatar], .profile .face, .user-avatar').forEach(el => {
      if (!avatar) return;
      if (/^(https?:|data:|\/|\.\.?\/)/.test(avatar)) {
        el.style.backgroundImage = `url(${avatar})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      }
    });
    root.querySelectorAll('[data-user-frame], .profile .frameImg, .user-frame').forEach(el => {
      if (!frame || !/^(https?:|data:|\/|\.\.?\/)/.test(frame)) return;
      if (el.tagName === 'IMG') el.src = frame;
      else {
        el.style.backgroundImage = `url(${frame})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      }
      el.style.display = '';
    });
  }

  window.ErisChatCosmetics = {load, purchase, apply, state, applyAppearance};
  window.addEventListener('erischat:auth', event => {
    if (event.detail?.state === 'ready') load();
  });
  window.addEventListener('erischat:profile', () => load());
  window.addEventListener('erischat:cosmetics-updated', () => applyAppearance());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true});
  else load();
})();
