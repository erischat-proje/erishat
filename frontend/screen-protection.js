/* Browser best-effort capture protection. Device-level capture blocking needs native Android FLAG_SECURE. */
(() => {
  'use strict';
  const active = new Set();
  let overlay = null;
  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'erisCaptureProtection';
    overlay.setAttribute('role', 'status');
    overlay.textContent = 'Gizlilik koruması etkin';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;background:#08060df7;color:#fff;font:600 14px system-ui;text-align:center;padding:24px;';
    document.body.append(overlay);
    return overlay;
  }
  function showIfHidden() {
    if (!active.size) return;
    const node = ensureOverlay();
    node.style.display = document.hidden || !document.hasFocus() ? 'grid' : 'none';
  }
  function set(key, enabled) {
    if (enabled) active.add(String(key)); else active.delete(String(key));
    showIfHidden();
  }
  document.addEventListener('visibilitychange', showIfHidden);
  window.addEventListener('blur', showIfHidden);
  window.addEventListener('focus', showIfHidden);
  document.addEventListener('contextmenu', event => { if (active.size) event.preventDefault(); });
  document.addEventListener('keydown', event => {
    if (!active.size) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'printscreen' || (event.ctrlKey && ['p', 's'].includes(key))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  window.ErisScreenProtection = { set, active: () => [...active] };
})();
