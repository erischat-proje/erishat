/* LidyaChat AdMob V2 shop UI — TEST ads only; client NEVER credits Lidya. */
(() => {
  'use strict';
  const API = () => (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  let busy = false;
  let previewAllowed = false;
  let rewardsEnabled = false;
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
    const demo = document.createElement('button');
    demo.type = 'button';
    demo.textContent = 'Test reklamını izle (ödül yok)';
    const status = document.createElement('p');
    status.className = 'lidya-ad-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Gerçek ödül dağıtımı kapalı.';
    actions.append(earn, demo);
    card.append(heading, copy, actions, status);
    root.appendChild(card);

    function setStatus(message) { status.textContent = message; }
    function setBusy(value) {
      busy = value;
      earn.disabled = value || (!previewAllowed && !rewardsEnabled);
      demo.disabled = value;
    }

    async function refreshStatus() {
      const auth = token();
      previewAllowed = false;
      rewardsEnabled = false;
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

        if (previewAllowed) {
          earn.textContent = 'Test onizlemesini baslat';
          setStatus('Yetkili test hesabi. Testte Lidya verilmez.');
        } else if (rewardsEnabled) {
          earn.textContent = 'Reklam izle';
          setStatus('Reklam odulu sunucuda dogrulanir.');
        } else {
          earn.textContent = 'Oduller henuz kapali';
          setStatus('Reklam odulleri henuz aktif degil.');
        }

        setBusy(false);
      } catch (_) {
        setStatus('Sunucuya baglanilamadi.');
      }
    }
    earn.addEventListener('click', async () => {
      if (busy || (!previewAllowed && !rewardsEnabled)) return;
      const auth = token();
      if (!auth) { setStatus('Önce LidyaChat hesabına giriş yap.'); return; }
      if (!native() || typeof native().showLidyaRewardedAdWithClaim !== 'function') {
        setStatus('Reklam sadece desteklenen Android uygulamasında açılabilir.'); return;
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
          setStatus(response.status === 401 ? 'Oturumun sona ermiş, tekrar giriş yap.' : 'Ödül isteği şu anda oluşturulamadı.'); return;
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
    demo.addEventListener('click', () => {
      if (busy) return;
      if (!native() || typeof native().showLidyaRewardedAd !== 'function') {
        setStatus('Test reklamı Android uygulamasında kullanılabilir.'); return;
      }
      setStatus('Google test reklamı açılıyor. Lidya ödülü verilmez.');
      native().showLidyaRewardedAd();
    });
    refreshStatus();
    window.addEventListener('focus', refreshStatus);
    window.addEventListener('lidyachat:rewarded-ad', event => {
      const value = event && event.detail && event.detail.status;
      if (value === 'loading') setStatus('Test reklamı yükleniyor…');
      else if (value === 'unavailable') setStatus('Test reklamı yüklenemedi. Tekrar deneyebilirsin.');
      else if (value === 'test_completed_no_credit') setStatus('Test reklamı tamamlandı. Lidya bakiyen değiştirilmedi.');
      else if (value === 'reward_pending_ssv')
        setStatus('Google sunucu dogrulamasi bekleniyor. Bakiye istemciden degistirilmez.');
      else if (value === 'closed') setStatus('Reklam penceresi kapatıldı.');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
