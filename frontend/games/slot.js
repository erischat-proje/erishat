(() => {
  'use strict';

  const ICONS = {
    cherry: '🍒', lemon: '🍋', bell: '🔔',
    star: '⭐', diamond: '💎', seven: '7️⃣', crown: '👑'
  };
  const KEYS = Object.keys(ICONS);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const SlotGame = {
    options: [['auto', '🎰 Otomatik Çevir']],

    render(container) {
      container.innerHTML = `
        <div class="eris-slot-machine">
          <div class="eris-slot-top">★ ERIS SLOT ★</div>
          <div class="eris-slot-lights">● ● ● ● ● ● ● ●</div>
          <div class="eris-slot-cabinet">
          <button type="button" class="eris-slot-lever" aria-label="Slot kolunu çek" title="Çevirmek için aşağı çek">
            <div class="eris-slot-knob"></div>
            <div class="eris-slot-arm"></div>
          </button>
          <div class="eris-slot-reels">
            <div class="eris-slot-reel">🍒</div>
            <div class="eris-slot-reel">7️⃣</div>
            <div class="eris-slot-reel">💎</div>
          </div>
          <div class="eris-slot-line">◆ ◆ ◆</div></div>
          <div class="eris-slot-status">3 AYNI SEMBOLÜ YAKALA!</div>
          <div class="eris-slot-paytable">
            🍒 ×5 · 🍋 ×7 · 🔔 ×10 · ⭐ ×15<br>
            💎 ×25 · 7️⃣ ×50 · 👑 ×100
          </div>
        </div>
        <style>
          .eris-slot-machine{
            width:min(390px,96%);margin:10px auto;padding:20px 12px;
            border:5px solid #b88634;border-radius:26px;
            background:linear-gradient(155deg,#382052,#170e29 55%,#3b1742);
            box-shadow:0 15px 35px #0009,inset 0 0 25px #f8c65c24;
            text-align:center;color:#fff;
          }

          .eris-slot-machine{
            position:relative;overflow:visible!important;
            border:8px ridge #dca954!important;
            background:linear-gradient(145deg,#922d44,#350e35 50%,#6f1938)!important;
          }
          .eris-slot-lights{
            color:#ffe18a;letter-spacing:7px;font-size:18px;
            text-shadow:0 0 12px #ffcc36;
            animation:erisLights .6s infinite alternate;
          }
          @keyframes erisLights{
            to{color:#ff6889;text-shadow:0 0 15px #ff3860}
          }
          .eris-slot-cabinet{
            position:relative;margin:14px 12px 8px;
            padding:14px 9px 4px;border:7px ridge #d4a04a;
            border-radius:17px;
            background:linear-gradient(#452143,#180e27);
          }
          .eris-slot-lever{
            position:absolute;right:-38px;top:10px;
            width:32px;height:105px;transform-origin:bottom center;
          }

          .eris-slot-lever{
            padding:0;border:0;background:transparent;
            cursor:grab;touch-action:none;
            -webkit-tap-highlight-color:transparent;
            z-index:5;
          }
          .eris-slot-lever:active{cursor:grabbing}
          .eris-slot-lever:focus-visible{
            outline:3px solid #ffe28c;
            outline-offset:5px;
          }
          .eris-slot-lever.pulling{
            transform:rotate(32deg);
            transition:transform .18s ease-out;
          }
          .eris-slot-lever:disabled{
            cursor:wait;opacity:.8;
          }
          .eris-slot-arm{
            position:absolute;bottom:0;left:13px;
            width:8px;height:82px;border-radius:8px;
            background:linear-gradient(90deg,#666,#fff,#777);
            transform:rotate(12deg);transform-origin:bottom;
          }
          .eris-slot-knob{
            position:absolute;z-index:2;top:0;left:3px;
            width:29px;height:29px;border-radius:50%;
            background:radial-gradient(circle at 30% 25%,#ffb0a4,#e22437 50%,#790719);
            box-shadow:0 2px 12px #ff415b88;
          }
          .eris-slot-machine:has(.eris-slot-reel.spinning) .eris-slot-lever{
            animation:erisPull .55s ease-in-out;
          }
          @keyframes erisPull{50%{transform:rotate(32deg)}}
          .eris-slot-reel{
            border:4px solid #c9a25c!important;
            box-shadow:inset 0 10px 15px #0004,0 0 10px #ffca6a33!important;
          }
          @media(max-width:380px){
            .eris-slot-cabinet{margin-right:17px}
            .eris-slot-lever{right:-31px;transform:scale(.8)}
          }
          .eris-slot-top{
            color:#ffe18b;font-weight:1000;font-size:23px;
            letter-spacing:2px;text-shadow:0 0 12px #ffb300;
            margin-bottom:18px;
          }
          .eris-slot-reels{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
          .eris-slot-reel{
            height:104px;display:grid;place-items:center;font-size:51px;
            background:linear-gradient(#fff7e8,#d9d3e6,#fff7e8);
            border:3px solid #e9b95d;border-radius:12px;
            box-shadow:inset 0 7px 13px #0003;color:#21112e;
          }
          .eris-slot-reel.spinning{animation:erisSlotPulse .13s linear infinite}
          @keyframes erisSlotPulse{
            50%{filter:brightness(.75);transform:translateY(2px)}
          }
          .eris-slot-line{color:#ffcc62;font-size:22px;letter-spacing:26px;margin:8px 0}
          .eris-slot-status{font-weight:900;color:#f5d78d;min-height:24px}
          .eris-slot-paytable{
            margin-top:14px;padding:10px;border:1px solid #b88d5155;
            border-radius:12px;color:#f1d8ac;font-size:12px;line-height:1.9;
          }
          @media(max-width:380px){
            .eris-slot-reel{height:78px;font-size:39px}
            .eris-slot-top{font-size:19px}
          }
        </style>`;

      const lever = container.querySelector('.eris-slot-lever');
      const modal = container.closest('#erisGamesModal');
      if (!lever || !modal) return;

      let startY = null;
      let pointerId = null;
      let pulled = false;
      let triggered = false;

      const reset = () => {
        lever.classList.remove('pulling');
        startY = null;
        pointerId = null;
      };

      const spin = () => {
        if (triggered || !container.isConnected ||
            !modal.classList.contains('eg-slot-mode')) return;
        const play = modal.querySelector('[data-play]');
        if (!play || play.disabled) return;
        triggered = true;
        lever.disabled = true;
        lever.classList.add('pulling');
        play.click();
      };

      lever.addEventListener('pointerdown', event => {
        if (lever.disabled) return;
        startY = event.clientY;
        pointerId = event.pointerId;
        pulled = false;
        lever.setPointerCapture?.(event.pointerId);
      });

      lever.addEventListener('pointermove', event => {
        if (startY === null || pointerId !== event.pointerId) return;
        const distance = event.clientY - startY;
        lever.classList.toggle('pulling', distance > 12);
        if (distance >= 45 && !pulled) {
          pulled = true;
          spin();
        }
      });

      lever.addEventListener('pointerup', event => {
        if (pointerId !== event.pointerId) return;
        const shouldSpin = !pulled && startY !== null;
        reset();
        if (shouldSpin) spin();
      });

      lever.addEventListener('pointercancel', reset);

      lever.addEventListener('click', event => {
        if (event.detail === 0) spin();
      });
    },

    async animate(container, data) {
      const reels = [...container.querySelectorAll('.eris-slot-reel')];
      if (reels.length !== 3) return;
      const result = data?.reels;
      if (!Array.isArray(result) || result.length !== 3 ||
          !result.every(symbol => KEYS.includes(symbol))) {
        throw new Error('Geçersiz Slot sonucu');
      }
      const status = container.querySelector('.eris-slot-status');
      if (status) status.textContent = 'MAKARALAR DÖNÜYOR...';

      const intervals = reels.map(reel => {
        reel.classList.add('spinning');
        return setInterval(() => {
          reel.textContent = ICONS[KEYS[Math.floor(Math.random() * KEYS.length)]];
        }, 75);
      });

      try {
        for (let i = 0; i < 3; i++) {
          await sleep(950);
          clearInterval(intervals[i]);
          reels[i].classList.remove('spinning');
          reels[i].textContent = ICONS[result[i]];
        }
      } finally {
        intervals.forEach(clearInterval);
        reels.forEach(reel => reel.classList.remove('spinning'));
      }

      const win = result.every(symbol => symbol === result[0]);
      if (status) status.textContent = win ? '🎉 ÜÇLÜ EŞLEŞME! KAZANDIN!' : 'TEKRAR DENE!';
    }
  };

  window.ErisGameSlot = SlotGame;
})();
