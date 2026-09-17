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

  function applyAppearance(root = document) {
    const user = state.user;
    if (!user) return;
    root.querySelectorAll('[data-user-avatar], .profile .face, .user-avatar').forEach(el => {
      if (user.avatar_asset) {
        el.style.backgroundImage = `url(${user.avatar_asset})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      }
    });
    root.querySelectorAll('[data-user-frame], .profile .frameImg, .user-frame').forEach(el => {
      if (user.frame_asset) {
        el.src = user.frame_asset;
        el.style.display = '';
      }
    });
  }

  window.ErisChatCosmetics = {load, purchase, apply, state, applyAppearance};
  window.addEventListener('erischat:auth', event => {
    if (event.detail?.state === 'ready') load();
  });
  window.addEventListener('erischat:cosmetics-updated', () => applyAppearance());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true});
  else load();
})();
