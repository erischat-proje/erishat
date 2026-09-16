/* ErisChat cosmetics integration layer. Safe no-op when backend/session is unavailable. */
(() => {
  'use strict';
  const API_BASE = (window.ERISCHAT_API_BASE || window.API_BASE || '').replace(/\/$/, '');
  const tokenKeys = ['erischat_token', 'access_token', 'token', 'auth_token'];
  const getToken = () => tokenKeys.map(k => localStorage.getItem(k) || sessionStorage.getItem(k)).find(Boolean) || '';
  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${API_BASE}${path}`, {...options, headers});
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const isVip = item => String(item?.asset_key || item?.key || item?.name || '').toLowerCase().startsWith('vip');
  const state = { catalog: [], owned: [], user: null };
  const emit = () => window.dispatchEvent(new CustomEvent('erischat:cosmetics-updated', {detail: state}));
  async function load() {
    try {
      const [catalog, owned, user] = await Promise.all([
        api('/v1/cosmetics'),
        api('/v1/me/cosmetics'),
        api('/v1/me')
      ]);
      state.catalog = (Array.isArray(catalog) ? catalog : catalog?.items || []).filter(x => !isVip(x));
      state.owned = Array.isArray(owned) ? owned : owned?.items || [];
      state.user = user;
      emit();
      return state;
    } catch (error) {
      console.warn('[ErisChat cosmetics] yüklenemedi:', error.message);
      return state;
    }
  }
  async function purchase(cosmeticType, assetKey) {
    const result = await api('/v1/me/cosmetics/purchase', {method:'POST', body: JSON.stringify({cosmetic_type: cosmeticType, asset_key: assetKey})});
    await load();
    return result;
  }
  async function apply(cosmeticType, assetKey) {
    const result = await api('/v1/me/cosmetics/apply', {method:'POST', body: JSON.stringify({cosmetic_type: cosmeticType, asset_key: assetKey})});
    await load();
    return result;
  }
  function applyAppearance(root = document) {
    const user = state.user;
    if (!user) return;
    root.querySelectorAll('[data-user-avatar], .profile .face, .user-avatar').forEach(el => {
      if (user.avatar_asset) { el.style.backgroundImage = `url(${user.avatar_asset})`; el.style.backgroundSize = 'cover'; el.textContent = ''; }
    });
    root.querySelectorAll('[data-user-frame], .profile .frameImg, .user-frame').forEach(el => {
      if (user.frame_asset) { el.src = user.frame_asset; el.style.display = ''; }
    });
  }
  window.ErisChatCosmetics = {load, purchase, apply, state, applyAppearance};
  window.addEventListener('erischat:cosmetics-updated', () => applyAppearance());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true}); else load();
})();
