/* Load before the application styles to restore the user's choice on first paint. */
(() => {
  'use strict';
  if (window.ErisTheme) return;
  const key = 'erischat.theme.v1';
  const valid = value => value === 'light' || value === 'dark';
  const root = document.documentElement;
  let current = 'light';
  try { const stored = localStorage.getItem(key); if (valid(stored)) current = stored; } catch {}

  function syncControls() {
    const control = document.getElementById('erisThemeControl');
    if (!control) return;
    for (const button of control.querySelectorAll('[data-eris-theme-choice]')) {
      button.setAttribute('aria-pressed', String(button.dataset.erisThemeChoice === current));
    }
    const label = control.querySelector('[data-eris-theme-status]');
    if (label) label.textContent = current === 'dark' ? 'Koyu tema seçili.' : 'Açık tema seçili.';
  }

  function apply(value, persist) {
    if (!valid(value)) return false;
    current = value;
    root.setAttribute('data-eris-theme', value);
    root.style.colorScheme = value;
    root.style.backgroundColor = value === 'dark' ? '#1b211c' : '#eee4ce';
    let saved = true;
    if (persist) { try { localStorage.setItem(key, value); } catch { saved = false; } }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', value === 'dark' ? '#1b211c' : '#eee4ce');
    syncControls();
    if (!saved) {
      const label = document.querySelector('#erisThemeControl [data-eris-theme-status]');
      if (label) label.textContent = 'Tema bu oturum için seçildi.';
    }
    window.dispatchEvent(new CustomEvent('erischat:theme', { detail: { theme: value } }));
    return true;
  }

  window.ErisTheme = Object.freeze({ get: () => current, set: value => apply(value, true) });
  apply(current, false);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#erisThemeControl [data-eris-theme-choice]');
    if (button) apply(button.dataset.erisThemeChoice, true);
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(valid(event.newValue) ? event.newValue : 'light', false);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply(current, false), { once: true });
  else apply(current, false);
})();
