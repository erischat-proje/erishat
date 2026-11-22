(() => {
  'use strict';

  const isRing = value =>
    /^(copper|silver|gold)-(?:[1-9]|1[0-9]|20)$/.test(
      String(value || '')
    );

  const seen = new Set();
  const queue = [];
  let active = false;
  let current = null;

  const videoPath = './LidyaChat_Yuzuk_Teklifi_5sn_2x.mp4';

  function playNext() {
    if (active || !queue.length || document.hidden) return;

    const event = queue.shift();
    active = true;

    const overlay = document.createElement('div');
    overlay.className = 'lidya-ring-cinema';
    overlay.style.visibility = 'hidden';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-label', 'Yüzük hediyesi');

    const video = document.createElement('video');
    video.src = videoPath;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.disablePictureInPicture = true;
    video.setAttribute('disableRemotePlayback', '');
    video.removeAttribute('controls');
    video.style.visibility = 'hidden';
    video.preload = 'auto';
    video.setAttribute('webkit-playsinline', '');

    const fallback = document.createElement('div');
    fallback.className = 'lidya-ring-fallback';
    fallback.hidden = true;

    const heart = document.createElement('div');
    heart.textContent = '💗';

    const ring = document.createElement('img');
    ring.src = '/relationship-assets/' + event.gift_key + '.png';
    ring.alt = 'Yüzük hediyesi';

    fallback.append(heart, ring);

    const caption = document.createElement('div');
    caption.className = 'lidya-ring-caption';
    caption.textContent = event.preview
      ? '💍 Ücretsiz yüzük önizlemesi'
      : '💍 LidyaChat · Özel Yüzük Hediyesi';

    overlay.append(video, fallback, caption);
    document.body.append(overlay);
    current = overlay;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      video.pause();
      overlay.remove();
      if (current === overlay) current = null;
      active = false;
      playNext();
    };

    const timer = setTimeout(finish, 5500);

    video.onplaying = () => {
      if (finished) return;
      video.style.visibility = 'visible';
      fallback.hidden = true;
      overlay.style.visibility = 'visible';
    };

    video.onended = () => {
      clearTimeout(timer);
      finish();
    };

    video.onerror = () => {
      clearTimeout(timer);
      finish();
    };

    video.play().catch(() => {
      clearTimeout(timer);
      finish();
    });
  }

  function receive(event, scope) {
    if (!event || !isRing(event.gift_key)) return;

    // Oda: ortak gönderim kimliği.
    // DM: mesaj kimliği. Aynı hediye ikinci kez oynatılmaz.
    const id = event.ring_delivery_id ||
      event.message_id ||
      event.id;

    const unique = id == null
      ? null
      : scope + ':' + String(id);

    if (unique) {
      if (seen.has(unique)) return;
      seen.add(unique);
      if (seen.size > 500) {
        seen.delete(seen.values().next().value);
      }
    }

    queue.push({...event, _lidyaScope: scope});
    playNext();
  }

  window.LidyaRingGiftStage = {
    preview(gift) {
      if (!isRing(gift?.gift_key)) return;
      receive({
        gift_key: gift.gift_key,
        quantity: 1,
        preview: true
      }, 'preview');
    }
  };

  window.addEventListener('erischat:room-gift', event => {
    receive(event.detail, 'room');
  });

  window.addEventListener('erischat:dm-gift', event => {
    receive(event.detail, 'dm');
  });

  window.addEventListener('erischat:event', event => {
    const detail = event.detail;
    if (detail?.type === 'dm_message') {
      receive(detail, 'dm');
    }
  });

  window.addEventListener('erischat:room-closed', () => {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i]._lidyaScope === 'room') queue.splice(i, 1);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) playNext();
  });

  const style = document.createElement('style');
  style.textContent = `
    .lidya-ring-cinema {
      position:fixed;
      inset:0;
      z-index:2147483000;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      background:rgba(0,0,0,.88);
      pointer-events:none;
    }
    .lidya-ring-cinema video {
      width:100%;
      height:100%;
      object-fit:contain;
      pointer-events:none;
    }
    .lidya-ring-cinema video::-webkit-media-controls,
    .lidya-ring-cinema video::-webkit-media-controls-panel,
    .lidya-ring-cinema video::-webkit-media-controls-play-button,
    .lidya-ring-cinema video::-webkit-media-controls-start-playback-button {
      display:none!important;
      opacity:0!important;
      -webkit-appearance:none!important;
    }
    .lidya-ring-caption {
      position:absolute;
      bottom:6%;
      color:#f9dca0;
      font-size:16px;
      font-weight:800;
      text-align:center;
      text-shadow:0 2px 12px #000;
    }
    .lidya-ring-fallback {
      text-align:center;
      animation:lidya-ring-appear .8s ease-out;
    }
    .lidya-ring-fallback div {
      font-size:76px;
    }
    .lidya-ring-fallback img {
      display:block;
      width:min(55vw,220px);
      height:220px;
      object-fit:contain;
      margin:auto;
    }
    .lidya-ring-fallback[hidden] {
      display:none;
    }
    @keyframes lidya-ring-appear {
      from { opacity:0;transform:scale(.65); }
      to { opacity:1;transform:scale(1); }
    }
  `;
  document.head.append(style);
})();
