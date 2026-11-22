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
    // Kritik DM onaylari diger pencerelerden once iptal edilir.
    const dmConfirmModal = document.querySelector('.dm-vault-modal');

    if (dmConfirmModal && dmConfirmModal.isConnected) {
      const close =
        dmConfirmModal.querySelector('[aria-label="Kapat"]') ||
        dmConfirmModal.querySelector('[data-no]') ||
        dmConfirmModal.querySelector('[data-cancel]');

      if (close && !close.disabled) close.click();

      // Onay dugmesini asla tetikleme.
      return true;
    }

    // Odeme pencereleri: en son acilan once kapanir.
    const paymentWindows = document.querySelectorAll('.pa-overlay');
    if (paymentWindows.length) {
      const top = paymentWindows[paymentWindows.length - 1];
      const close = top.querySelector('.pa-close');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Dekont onizlemesi ana odeme penceresinden once kapanir.
    const evidence = document.querySelector('.lp-evidence');
    if (evidence && evidence.isConnected) {
      const close = evidence.querySelector('button');
      if (close && !close.disabled) close.click();
      return true;
    }

    const purchase = document.querySelector('.lp-overlay');
    if (purchase && purchase.isConnected) {
      const close = purchase.querySelector('.lp-close');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Magazada satin alma veya kiralama onayi.
    const shopConfirm = document.querySelector('.shop-buy-confirm');
    if (shopConfirm && shopConfirm.isConnected) {
      const close = shopConfirm.querySelector(
        '[data-cancel], [data-close]'
      );
      if (close && !close.disabled) close.click();
      return true;
    }

    // Magaza tasarim onizlemesi.
    const shopPreview = document.querySelector('#shop800preview');
    if (shopPreview && shopPreview.isConnected) {
      const close = shopPreview.querySelector(
        'header button[aria-label="Kapat"]'
      );
      if (close && !close.disabled) close.click();
      return true;
    }

    // Oda hediye secimi: gonderme islemini tetikleme.
    const giftPanel = document.querySelector(
      '#erischatGiftPanel.show'
    );
    if (giftPanel) {
      const close = giftPanel.querySelector('.egp-close');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Oyun ve hayran siralamalari.
    const ranking = document.querySelector('dialog.lgr-dialog[open]');
    if (ranking) {
      const close = ranking.querySelector('.lgr-close');
      if (close && !close.disabled) close.click();
      return true;
    }

    const fanRanking = document.querySelector(
      '.personal-fan-overlay'
    );
    if (fanRanking && fanRanking.isConnected) {
      const close = fanRanking.querySelector('.personal-fan-close');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Tam ekran hediye animasyonu.
    const giftCinema = document.querySelector('.eris-gift-cinema');
    if (giftCinema && giftCinema.isConnected) {
      const skip = giftCinema.querySelector('[data-skip]');
      if (skip && !skip.disabled) skip.click();
      return true;
    }

    // DM paylasilan foto, video ve belge arsivi.
    const sharedMedia = document.querySelector('.dm-shared-panel');
    if (sharedMedia && sharedMedia.isConnected) {
      const close = sharedMedia.querySelector('[data-close]');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Oda Ludo ayarlari: oyundan veya odadan cikma.
    const ludoDialog = document.querySelector('.ludo-modal');
    if (ludoDialog && ludoDialog.isConnected) {
      const close = ludoDialog.querySelector('[data-close]');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Muzik paneli: sadece gorunurken kapat.
    const musicPanel = document.querySelector('#erisMusicPanel');
    if (
      musicPanel &&
      musicPanel.isConnected &&
      getComputedStyle(musicPanel).display !== 'none'
    ) {
      const close = musicPanel.querySelector('[data-close]');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Once en ustteki bayi alt pencerelerini kapat.
    const dealerSubwindows = [
      ['.lbh10-mask', '.lbh10-close'],
      ['.lbv9-mask', '.lbv9-close']
    ];

    for (const [selector, closeSelector] of dealerSubwindows) {
      const modal = document.querySelector(selector);
      if (!modal || !modal.isConnected) continue;

      const close = modal.querySelector(closeSelector);
      if (close && !close.disabled) close.click();

      return true;
    }

    // Bayi ve temsilci yonetim penceresi.
    const dealerModal = document.querySelector('.lb-mask');
    if (dealerModal && dealerModal.isConnected) {
      const close = dealerModal.querySelector(
        '.lb-panel > header button[aria-label="Kapat"]'
      );
      if (close && !close.disabled) {
        close.click();
      }
      return true;
    }

    // VIP penceresi: mevcut Kapat dugmesini kullan.
    const vip = document.querySelector('.vp-overlay');
    if (vip && vip.isConnected) {
      const close = vip.querySelector(
        '.vp-modal > header button'
      );
      if (close && !close.disabled) close.click();
      return true;
    }

    // Profil alt bolumleri: ayarlar, bildirim, gizlilik vb.
    const profileHub = document.querySelector('.eph-overlay');
    if (profileHub && !profileHub.hidden) {
      const close = profileHub.querySelector('.eph-close');
      if (close && !close.disabled) close.click();
      return true;
    }

    // Oda ici menuler: sesli oda baglantisini kesme.
    const roomMenus = [
      ['.room-v5-panel.show', '.room-v5-dialog [data-close]'],
      ['.room-v3-panel.show', '.room-v3-close']
    ];

    for (const [selector, closeSelector] of roomMenus) {
      const modal = document.querySelector(selector);
      if (!modal || !modal.isConnected) continue;
      const close = modal.querySelector(closeSelector);
      if (close && !close.disabled) close.click();
      return true;
    }

    // DM grup, arama ve mesaj islem pencereleri.
    // Her zaman mevcut Kapat dugmesini kullan.
    const dmExtraWindows = [
      ['.dm-search-panel', '[data-close]'],
      ['.dm-action-panel', '[data-close]'],
      ['.lidya-group-modal', '[data-close]']
    ];

    for (const [selector, closeSelector] of dmExtraWindows) {
      const modal = document.querySelector(selector);
      if (!modal || !modal.isConnected) continue;

      const close = modal.querySelector(closeSelector);
      if (close && !close.disabled) close.click();
      return true;
    }

    // Okey 101 alt pencereleri.
    // Oyunu ve sesli oda baglantisini kapatma.
    const okeySubwindows = [
      ['.o101-rule-overlay', '[data-action="close-rules"]'],
      ['.o101-editor', '[data-action="cancel-editor"]'],
      ['.o101-processing', '[data-action="cancel-processing"]']
    ];

    for (const [selector, closeSelector] of okeySubwindows) {
      const modal = document.querySelector(selector);
      if (!modal || !modal.isConnected) continue;

      const close = modal.querySelector(closeSelector);
      if (close && !close.disabled) close.click();
      return true;
    }

    // UNO: once oyun ici alt pencereleri kapat.
    // Asla masayi kapatma veya bahis islemi baslatma.
    const unoRoot = document.querySelector('.uno-root');

    if (unoRoot && unoRoot.isConnected) {
      const unoCancel = unoRoot.querySelector(
        '.uno-confirm [data-uno-action="cancel-close"]'
      );

      if (unoCancel) {
        if (!unoCancel.disabled) unoCancel.click();
        return true;
      }

      const unoInfo = unoRoot.querySelector(
        '.uno-info-overlay [data-uno-action="rules"], ' +
        '.uno-info-overlay [data-uno-action="reveal"]'
      );

      if (unoInfo) {
        if (!unoInfo.disabled) unoInfo.click();
        return true;
      }

      const unoCardCancel = unoRoot.querySelector(
        '.uno-color-picker [data-uno-action="cancel-card"]'
      );

      if (unoCardCancel) {
        if (!unoCardCancel.disabled) unoCardCancel.click();
        return true;
      }
    }

    // DM: close the topmost supported subwindow first.
    const dmWindows = [
      ['.dm-photo-viewer', '[data-photo-close]'],
      ['.dm-gift-sheet', '[data-close], [data-x]'],
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
