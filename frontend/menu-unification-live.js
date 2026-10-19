(() => {
  'use strict';

  if (window.__ERIS_MENU_UNIFIED__) return;
  window.__ERIS_MENU_UNIFIED__ = true;

  /*
   * Bu dosya yeni sahte özellik üretmez.
   * Mevcut çalışan ErisChat sistemlerini doğru yüzeylere bağlar.
   */

  const removeLegacy = () => {

    // "Tüm sistemler" butonları
    document.querySelectorAll(
      'button[aria-label="Tüm sistemler"]'
    ).forEach(el => el.remove());

    // Eski systems ekranı
    document.getElementById('systems')?.remove();

    // Feature Hub'daki generic Araçlar
    document.querySelectorAll(
      '#erisHub [data-tab="tools"], #erisHub #eh-tools'
    ).forEach(el => el.remove());

    // Eski başlık
    document.querySelectorAll('#erisHub .eh-head h2').forEach(el => {
      if (/tüm sistemleri/i.test(el.textContent || '')) {
        el.textContent = 'ErisChat sistemleri';
      }
    });

    // Eski "Tüm sistemler" kartı
    document.querySelectorAll('.quick button').forEach(btn => {
      const text = (btn.textContent || '').trim();
      if (/^🧩?\s*Tüm sistemler/i.test(text)) {
        btn.remove();
      }
    });
  };

  const bindRealGames = () => {
    document.querySelectorAll(
      '[onclick*="openGameDemo"]'
    ).forEach(btn => {
      btn.onclick = () => {
        if (window.ErisChatGames?.open) {
          window.ErisChatGames.open('main');
        } else {
          window.toast?.('Oyun merkezi yükleniyor.');
        }
      };
    });
  };

  const bindRealNavigation = () => {

    // Profil
    document.querySelectorAll(
      '[data-menu="profile"]'
    ).forEach(btn => {
      btn.onclick = () => {
        window.showView?.('profile');
        window.ErisProfile?.refresh?.();
      };
    });

    // Mağaza
    document.querySelectorAll(
      '[data-menu="shop"]'
    ).forEach(btn => {
      btn.onclick = () => window.showView?.('shop');
    });

    // VIP
    document.querySelectorAll(
      '[data-menu="vip"]'
    ).forEach(btn => {
      btn.onclick = () => window.showView?.('vip');
    });

    // Gizlilik
    document.querySelectorAll(
      '[data-menu="privacy"]'
    ).forEach(btn => {
      btn.onclick = () => window.showView?.('anon');
    });

    // Mesajlar
    document.querySelectorAll(
      '[data-menu="messages"]'
    ).forEach(btn => {
      btn.onclick = () => window.showView?.('messages');
    });

    // Keşfet
    document.querySelectorAll(
      '[data-menu="explore"]'
    ).forEach(btn => {
      btn.onclick = () => {
        window.showView?.('explore');
        window.ErisChatRoomList?.load?.();
      };
    });

  };

  const boot = () => {
    removeLegacy();
    bindRealGames();
    bindRealNavigation();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }

  const observer = new MutationObserver(() => {
    removeLegacy();
    bindRealGames();
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  window.ErisChatMenu = {
    boot,
    cleanup: removeLegacy
  };

})();

(() => {
  const clean=()=>{
    document.querySelectorAll(
      '[aria-label="Tüm sistemler"],' +
      '[aria-label="Tüm özellikler"],' +
      '[data-tab="tools"],' +
      '#eh-tools,' +
      '#systems,' +
      '#erisDemoBtn,' +
      '#erisDemo'
    ).forEach(x=>x.remove());

    document.querySelectorAll('button,.item,.card').forEach(el=>{
      const t=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(
        /^Tüm sistemler$/i.test(t) ||
        /^Tüm özellikler$/i.test(t) ||
        /^Tüm sistemleri gör$/i.test(t)
      ) el.remove();
    });
  };

  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",clean,{once:true});
  else clean();

  new MutationObserver(clean).observe(document.body,{childList:true,subtree:true});
})();
