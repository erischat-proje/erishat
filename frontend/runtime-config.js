(() => {
  'use strict';
  // All modules must use the same service, regardless of root / v1 configuration.
  let saved = '';
  try { saved = localStorage.getItem('erischat.apiBase') || ''; } catch {}
  const configured = window.ERIS_API || window.ERISCHAT_API || window.ERISCHAT_API_BASE || saved;
  let base = String(configured || 'https://erischat-api-production.up.railway.app/v1').trim().replace(/\/+$/, '');
  if (!base.endsWith('/v1')) base += '/v1';
  window.ERIS_API = window.ERISCHAT_API = base;
  window.ERISCHAT_API_BASE = base.replace(/\/v1$/, '');
})();
