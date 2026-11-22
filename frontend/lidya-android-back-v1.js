(() => {
  'use strict';

  const history = [];

  const currentView = () =>
    document.querySelector('.app > .content > .view.show')?.id ||
    document.querySelector('.view.show')?.id ||
    'home';

  function rememberView(event) {
    const id = event?.detail?.id;
    if (!id) return;

    const last = history[history.length - 1];
    if (last === id) return;

    if (!history.length) history.push('home');
    history.push(id);

    if (history.length > 40) history.splice(1, history.length - 40);
  }

  window.addEventListener('erischat:view-changed', rememberView);

  function visible(selector) {
    const element = document.querySelector(selector);
    return element &&
      getComputedStyle(element).display !== 'none' &&
      getComputedStyle(element).visibility !== 'hidden';
  }

  function handle() {
    // DM: close the topmost supported subwindow first.
    const dmWindows = [
      ['.dm-photo-viewer', '[data-photo-close]'],
      ['.dm-gift-sheet', '[data-close], [data-x]'],
      ['.dm-vault-modal', '[aria-label="Kapat"]'],
      ['#eris-dm-profile-modal', '#erpClose']
    ];

    for (const [selector, closeSelector] of dmWindows) {
      const modal = document.querySelector(selector);
      if (!modal || !modal.isConnected) continue;
      const button = modal.querySelector(closeSelector);
      if (button && !button.disabled) {
        button.click();
        return true;
      }
      // Never exit the app while a modal remains open.
      return true;
    }

    // Floating profile and its report window.
    const report = document.querySelector('.eris-mini-report-shade');
    if (report) {
      const close = report.querySelector(
        '.eris-mini-icon, [data-close], [aria-label="Kapat"]'
      );
      if (close && !close.disabled) {
        close.click();
      }
      return true;
    }

    const floatingProfile = document.querySelector('.eris-mini-profile-shade');
    if (floatingProfile) {
      window.ErisFloatingProfile?.close?.();
      return true;
    }

    // Management center.
    const managementClose = document.querySelector(
      '.lm-command-overlay [data-close]'
    );
    if (managementClose) {
      managementClose.click();
      return true;
    }

    // Game: use its existing close handler.
    const game = document.querySelector('#erisGamesModal');
    if (game && game.isConnected) {
      const close = game.querySelector('[data-close]');
      if (close && !close.disabled) close.click();
      return true;
    }

    const management = document.querySelector(
      '.lm-command-overlay [data-close]'
    );
    if (management) {
      management.click();
      return true;
    }

    if (visible('#createRoomModal.show')) {
      window.closeCreateRoom?.();
      return true;
    }

    if (visible('#erisUserProfileModal')) {
      const close = document.querySelector(
        '#erisUserProfileModal [data-close]'
      );
      if (close) {
        close.click();
        return true;
      }
    }

    if (visible('#chat.show')) {
      window.closeChat?.();
      return true;
    }

    // Do not disconnect a running voice room with Android Back.
    if (visible('#erisRoomSurface.show')) {
      window.toast?.('Odadan ayrılmak için oda çıkış düğmesini kullanın.');
      return true;
    }

    const current = currentView();

    if (current !== 'home' && typeof window.showView === 'function') {
      if (history[history.length - 1] !== current) {
        history.push(current);
      }

      history.pop();
      let previous = history.pop() || 'home';

      if (!document.getElementById(previous)?.classList.contains('view')) {
        previous = 'home';
      }

      window.showView(previous);
      return true;
    }

    return false;
  }

  window.LidyaAndroidBack = {handle};
})();
