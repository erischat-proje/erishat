/* LidyaChat V8: Google Ad Manager web rewarded adapter.
   Disabled until an approved Ad Manager ad unit is supplied.
   Browser callbacks NEVER credit Lidya. */
(() => {
  'use strict';

  const AD_UNIT_PATH = '';
  let busy = false;

  function available() {
    return /^\/\d+\/[A-Za-z0-9_\/-]+$/.test(AD_UNIT_PATH);
  }

  async function show(onStatus) {
    const status = text => {
      if (typeof onStatus === 'function') onStatus(text);
    };

    if (!available()) {
      status('Web ödüllü reklamları Ad Manager onayı bekliyor.');
      return false;
    }

    if (busy) return false;
    busy = true;

    try {
      if (!window.googletag) {
        window.googletag = {cmd: []};
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
          script.async = true;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      await new Promise((resolve, reject) => {
        window.googletag.cmd.push(() => {
          const gt = window.googletag;
          const slot = gt.defineOutOfPageSlot(
            AD_UNIT_PATH,
            gt.enums.OutOfPageFormat.REWARDED
          );

          if (!slot) {
            status('Bu tarayıcı ödüllü reklam biçimini desteklemiyor.');
            resolve();
            return;
          }

          let finished = false;
          let readyTimer;

          const clean = () => {
            if (finished) return;
            finished = true;
            clearTimeout(readyTimer);
            for (const [name, handler] of listeners) {
              gt.pubads().removeEventListener(name, handler);
            }
            gt.destroySlots([slot]);
            resolve();
          };

          const onReady = event => {
            if (event.slot !== slot) return;
            clearTimeout(readyTimer);
            if (window.confirm('Test reklamını açmak istiyor musun? Bu testte Lidya verilmez.')) {
              if (!event.makeRewardedVisible()) {
                status('Reklam gösterimi başlatılamadı.');
                clean();
              } else {
                status('Web reklamı gösteriliyor. Testte Lidya verilmez.');
              }
            } else {
              status('Reklam iptal edildi.');
              clean();
            }
          };

          const onGranted = event => {
            if (event.slot !== slot) return;
            status('Web reklamı tamamlandı. Sunucu doğrulaması olmadan Lidya verilmez.');
          };

          const onClosed = event => {
            if (event.slot !== slot) return;
            status('Reklam penceresi kapatıldı.');
            clean();
          };

          const listeners = [
            ['rewardedSlotReady', onReady],
            ['rewardedSlotGranted', onGranted],
            ['rewardedSlotClosed', onClosed]
          ];

          for (const [name, handler] of listeners) {
            gt.pubads().addEventListener(name, handler);
          }

          slot.addService(gt.pubads());
          gt.enableServices();
          gt.display(slot);

          readyTimer = setTimeout(() => {
            status('Web reklamı bulunamadı veya yüklenemedi.');
            clean();
          }, 30000);
        });
      });

      return true;
    } catch (_) {
      status('Web reklam altyapısına bağlanılamadı.');
      return false;
    } finally {
      busy = false;
    }
  }

  window.LidyaWebRewarded = {available, show};
})();
