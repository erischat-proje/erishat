(() => {
  'use strict';

  function applyPermissions() {
    const p = window.__erisRoomPermissions || {};
    const canManage = !!(p.can_manage || p.is_owner || p.is_moderator);
    const ownerOnly = !!(p.is_owner);

    document.querySelectorAll(
      '[data-room-management],[data-room-settings],[data-room-theme],' +
      '[data-room-seat-control],[data-room-name-edit],[data-room-lock],' +
      '[data-room-password],[data-room-moderator]'
    ).forEach(el => {
      const ownerRequired =
        el.matches('[data-room-name-edit],[data-room-theme],[data-room-lock],' +
                   '[data-room-password],[data-room-moderator]');
      el.hidden = ownerRequired ? !ownerOnly : !canManage;
      if (el.hidden) el.setAttribute('aria-hidden','true');
    });

    document.querySelectorAll('.roomManage,.roomSettings,.roomTheme,' +
      '.roomSeatControls,.roomNameEdit,.roomLock,.roomPassword,.roomModerators')
      .forEach(el => {
        const ownerRequired = /theme|name|password|moderator/i.test(el.className);
        el.hidden = ownerRequired ? !ownerOnly : !canManage;
      });
  }

  window.addEventListener('erischat:room-permissions', applyPermissions);
  window.addEventListener('erischat:room-loaded', applyPermissions);
  document.addEventListener('click', () => setTimeout(applyPermissions,0), true);
  new MutationObserver(applyPermissions).observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('DOMContentLoaded', applyPermissions);
  window.ErisFinalPermissions = { refresh: applyPermissions };
})();
