(() => {
  'use strict';
  // The live DM engine is the single source of truth for Messages.
  // This guard only refreshes its real conversation list; it never replaces the list UI.
  const refresh = () => {
    try { if (document.querySelector('#messages.show') && window.ErisChatDM?.load) window.ErisChatDM.load(); } catch {}
  };
  window.addEventListener('erischat:auth', e => { if (e?.detail?.state === 'ready') setTimeout(refresh, 300); });
  window.ErisApiTransport.poll(refresh, 18000,()=>!!document.querySelector('#messages.show'));
})();