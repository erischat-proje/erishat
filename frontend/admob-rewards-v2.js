/* LidyaChat AdMob V2 shop UI — TEST ads only; client NEVER credits Lidya. */
(() => {
  'use strict';
  const API = () => (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  let busy = false;
  let previewAllowed = false;
  let rewardsEnabled = false;
  let dailyRemaining = 5;
  const toast = message => { if (typeof window.toast === 'function') window.toast(message); };
  const native = () => window.ErisChatAndroid;

  function mount() {
    const root = document.getElementById('lidyaAdmobRewardMount');
    if (!root || root.dataset.ready === '1') return;
    root.dataset.ready = '1';
    const style = document.createElement('style');
    style.textContent = `
      #lidyaAdmobRewardMount {margin:12px 0 16px}
      #lidyaAdmobRewardMount .lidya-ad-card {padding:16px;border:1px solid var(--line,#8e7b55);border-radius:18px;background:var(--p,#201916);color:var(--ui-ink,#fff)}
      #lidyaAdmobRewardMount .lidya-ad-title {font-size:17px;font-weight:800;margin:0 0 6px}
      #lidyaAdmobRewardMount .lidya-ad-copy {font-size:12px;line-height:1.55;color:var(--muted,#a99e92);margin:0 0 12px}
      #lidyaAdmobRewardMount .lidya-ad-actions {display:flex;flex-wrap:wrap;gap:9px}
      #lidyaAdmobRewardMount button {border-radius:11px;padding:11px 13px;font-size:12px;font-weight:750;cursor:pointer;min-height:42px;background:var(--ui-button,#fff);color:var(--ui-button-text,#000);border:1px solid var(--line,#8e7b55)}
      #lidyaAdmobRewardMount button:disabled {opacity:.55;cursor:default}
      #lidyaAdmobRewardMount .lidya-ad-status {font-size:12px;line-height:1.4;min-height:18px;margin:10px 0 0;color:var(--muted,#a99e92)}
    `;
    root.appendChild(style);
    const card = document.createElement('section');
    card.className = 'lidya-ad-card';
    card.setAttribute('aria-label', 'Reklam ile Lidya kazan');
    const heading = document.createElement('h2');
    heading.className = 'lidya-ad-title';
    heading.textContent = '🎬 Reklam İzle · 5 Lidya';
    const copy = document.createElement('p');
    copy.className = 'lidya-ad-copy';
    copy.textContent = 'Günlük en fazla 5 ödül (25 Lidya). Ödül sistemi henüz aktif değil. Test reklamları Lidya kazandırmaz.';
    const actions = document.createElement('div');
    actions.className = 'lidya-ad-actions';
    const earn = document.createElement('button');
    earn.type = 'button';
    earn.textContent = 'Reklam durumu kontrol ediliyor';
    earn.disabled = true;
    const status = document.createElement('p');
    status.className = 'lidya-ad-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Gerçek ödül dağıtımı kapalı.';
    const daily = document.createElement('p');
    daily.className = 'lidya-ad-status';
    daily.textContent = 'Günlük ödül hakkı kontrol ediliyor…';
    actions.append(earn);
    card.append(heading, copy, daily, actions, status);
    root.appendChild(card);

    function setStatus(message) { status.textContent = message; }
    function setBusy(value) {
      busy = value;
      earn.disabled = value ||
        (!previewAllowed && !rewardsEnabled) ||
        (rewardsEnabled && dailyRemaining <= 0);
    }

    async function refreshStatus() {
      const auth = token();
      previewAllowed = false;
      rewardsEnabled = false;
      dailyRemaining = 5;
      daily.textContent = 'Günlük ödül hakkı kontrol ediliyor…';
      earn.disabled = true;

      if (!auth) {
        earn.textContent = 'Giris yapman gerekiyor';
        setStatus('Reklam durumunu gormek icin giris yap.');
        return;
      }

      try {
        const response = await fetch(`${API()}/admob/status`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${auth}`
          },
          cache: 'no-store'
        });

        if (!response.ok) {
          setStatus('Reklam durumu sorgulanamadi.');
          return;
        }

        const data = await response.json();
        previewAllowed = data.mode === 'preview'
          && data.preview_allowed === true;
        rewardsEnabled = data.mode === 'live'
          && data.rewards_enabled === true;

        if (rewardsEnabled) {
          const remaining = Number(data.daily_remaining);
          dailyRemaining = Number.isInteger(remaining)
            ? Math.max(0, Math.min(5, remaining))
            : 0;

          daily.textContent =
            `Günlük ödül: ${5 - dailyRemaining}/5 kullanıldı · ` +
            `${dailyRemaining} hak kaldı`;
        } else if (previewAllowed) {
          daily.textContent =
            'Test modu · Gerçek ödül hakkı tüketilmez';
        } else {
          daily.textContent = 'Günlük ödüller henüz aktif değil';
        }

        copy.textContent = rewardsEnabled
          ? 'Tamamladığın ve Google tarafından doğrulanan her reklam 5 Lidya kazandırır. Günlük en fazla 25 Lidya.'
          : 'Günlük en fazla 5 ödül (25 Lidya). Ödül sistemi henüz aktif değil. Test reklamları Lidya kazandırmaz.';

        if (previewAllowed) {
          earn.textContent = 'Reklam İzle';
          setStatus('Yetkili test hesabi. Testte Lidya verilmez.');
        } else if (rewardsEnabled) {
          earn.textContent = dailyRemaining > 0
            ? 'Reklam İzle' : 'Günlük Limit Doldu';
          setStatus(dailyRemaining > 0
            ? 'Reklam ödülü sunucuda doğrulanır.'
            : 'Bugünkü 5 reklam ödülünü tamamladın.');
        } else {
          earn.textContent = 'Reklamlar Hazırlanıyor';
          setStatus('Reklam odulleri henuz aktif degil.');
        }

        setBusy(false);
      } catch (_) {
        setStatus('Sunucuya baglanilamadi.');
      }
    }
    earn.addEventListener('click', async () => {
      if (busy || (!previewAllowed && !rewardsEnabled) ||
          (rewardsEnabled && dailyRemaining <= 0)) return;
      const auth = token();
      if (!auth) { setStatus('Önce LidyaChat hesabına giriş yap.'); return; }
      if (!native() || typeof native().showLidyaRewardedAdWithClaim !== 'function') {
        setStatus('Web reklamları henüz hazır değil. Ad Manager onayı ve sunucu doğrulaması bekleniyor.'); return;
      }
      setBusy(true);
      setStatus('Ödül sistemi durumu kontrol ediliyor…');
      try {
        const response = await fetch(`${API()}/admob/claim`, {
          method: 'POST',
          headers: {'Accept': 'application/json', 'Authorization': `Bearer ${auth}`},
          cache: 'no-store'
        });
        if (response.status === 503) {
          setStatus('Reklam ödülleri henüz etkin değil. Test reklamı ile deneme yapabilirsin.'); return;
        }
        if (!response.ok) {
          if (response.status === 409) {
            setStatus('Günlük reklam ödülü sınırına ulaştın.');
            await refreshStatus();
          } else {
            setStatus(response.status === 401
              ? 'Oturumun sona ermiş, tekrar giriş yap.'
              : 'Ödül isteği şu anda oluşturulamadı.');
          }
          return;
        }
        const data = await response.json();
        const claim = data && data.custom_data;
        if (typeof claim !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(claim)) {
          setStatus('Sunucudan geçerli ödül kodu alınamadı.'); return;
        }
        // SAFETY: Native V2 still shows Google's official TEST unit. No SSV credit is expected.
        native().showLidyaRewardedAdWithClaim(claim);
        setStatus(previewAllowed
          ? 'Test reklami aciliyor. Lidya bakiyesi degismeyecek.'
          : 'Reklam aciliyor. Odul icin sunucu dogrulamasi bekleniyor.');
      } catch (_) {
        setStatus('Sunucuya bağlanılamadı; ödül isteği oluşturulamadı.');
      } finally { setBusy(false); }
    });
    // Move the existing card into the Lidya loading modal.
    // Restore it when the modal closes; never create duplicate cards.
    const originalParent = root.parentNode;
    const originalMarker = document.createComment('admob-original-position');
    originalParent.insertBefore(originalMarker, root);

    window.LidyaAdmobReward = {
      attachTo(host) {
        if (!host || !host.isConnected) return;
        host.appendChild(root);
        refreshStatus();
      },
      restore() {
        if (originalMarker.parentNode) {
          originalMarker.parentNode.insertBefore(
            root, originalMarker.nextSibling
          );
        }
      }
    };

    refreshStatus();
    window.addEventListener('focus', refreshStatus);
    window.addEventListener('lidyachat:rewarded-ad', event => {
      const value = event && event.detail && event.detail.status;
      if (value === 'loading') setStatus('Test reklamı yükleniyor…');
      else if (value === 'unavailable') setStatus('Test reklamı yüklenemedi. Tekrar deneyebilirsin.');
      else if (value === 'test_completed_no_credit') setStatus('Test reklamı tamamlandı. Lidya bakiyen değiştirilmedi.');
      else if (value === 'reward_pending_ssv') {
        setStatus('Google sunucu dogrulamasi bekleniyor. Bakiye istemciden degistirilmez.');

        // SSV callback is asynchronous. Read only server-confirmed rewards.
        // Never grant Lidya from the client.
        if (rewardsEnabled) {
          [3000, 10000, 25000].forEach(delay => {
            setTimeout(() => {
              if (rewardsEnabled) refreshStatus();
            }, delay);
          });
        }
      }
      else if (value === 'closed') setStatus('Reklam penceresi kapatıldı.');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
