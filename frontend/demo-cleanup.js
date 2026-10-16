(() => {
  'use strict';
  const clean = () => {
    const messages = document.querySelector('#messages .list');
    if (messages) {
      messages.querySelectorAll('button[onclick^="openChat("]').forEach(node => node.remove());
      if (!messages.children.length) {
        messages.innerHTML = '<div data-real-dm-empty class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Gerçek konuşmalar yükleniyor…</div>';
      }
    }

    ['people', 'events'].forEach(id => {
      const root = document.getElementById(id);
      if (!root) return;
      root.querySelectorAll(':scope > button, :scope > .item, :scope > .card').forEach(node => node.remove());
      if (!root.children.length) {
        root.innerHTML = '<div data-real-section-empty class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Gerçek veriler bağlandığında burada görünecek.</div>';
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', clean, { once: true });
  else clean();
})();
