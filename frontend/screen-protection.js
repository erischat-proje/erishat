/* Browsers cannot reliably block operating-system screenshots. */
(() => {
  'use strict';
  const active = new Set();
  function set(key, enabled) {
    if (enabled) active.add(String(key)); else active.delete(String(key));
  }
  document.addEventListener('keydown', event => {
    if (!active.size) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'printscreen' || (event.ctrlKey && ['p', 's'].includes(key))) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.ErisScreenProtection = { set, active: () => [...active] };
})();
