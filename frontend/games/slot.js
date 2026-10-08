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
          <div class="eris-slot-top">
      <span class="eris-slot-crown">♛</span>
      <span>ERIS CASINO</span>
      <small>TRIPLE JACKPOT · 3 REELS</small>
    </div>
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

          #erisGamesModal .eris-slot-betbar{display:none}
          #erisGamesModal.eg-slot-mode .eris-slot-betbar{
            display:block;grid-column:1/-1;
            padding:12px;border-radius:18px;
            border:2px solid #bd8741;
            background:linear-gradient(160deg,#241522,#100b18);
            box-shadow:inset 0 2px 15px #0008;
          }
          .eris-slot-bettitle{
            text-align:center;color:#f6d68d;
            font-size:11px;font-weight:900;letter-spacing:2px;
            margin-bottom:9px;
          }
          .eris-slot-betcontrols{
            display:grid;grid-template-columns:55px 1fr 55px;
            gap:9px;align-items:stretch;
          }
          .eris-slot-betcontrols button{
            border:2px solid #e9c477;border-radius:14px;
            background:linear-gradient(145deg,#78502e,#38231d);
            color:#ffedb6;font-size:32px;font-weight:900;
            min-height:58px;touch-action:manipulation;
          }
          .eris-slot-amount{
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;
            border:1px solid #ad8043;border-radius:14px;
            background:#090910;
          }
          .eris-slot-amount strong{
            color:#fff1b5;font-size:25px;
            font-variant-numeric:tabular-nums;
          }
          .eris-slot-amount small{
            color:#c9a969;font-size:10px;
            font-weight:900;letter-spacing:1px;
          }
          .eris-slot-step{
            display:flex;justify-content:center;
            gap:8px;margin-top:8px;
            color:#baa781;font-size:10px;
          }
          .eris-slot-step strong{color:#ffe5a1}
          #erisGamesModal.eg-slot-mode .eg-form>label{
            display:none!important;
          }
          #erisGamesModal.eg-slot-mode .eg-stake-presets{
            grid-template-columns:repeat(4,minmax(0,1fr))!important;
          }
          .eris-slot-machine{
            max-width:350px!important;
            border:9px ridge #d6a85a!important;
            border-bottom-width:18px!important;
            border-radius:40px 40px 24px 24px!important;
            background:
              linear-gradient(90deg,#490c23 0%,#a42d48 12%,
              #4b0d29 26%,#340a22 72%,#a22d46 90%,#450b22 100%)!important;
            box-shadow:
              inset 8px 0 8px #ffffff24,
              inset -10px 0 12px #0008,
              0 22px 35px #000a,
              0 0 0 3px #57351d!important;
          }
          .eris-slot-crown{
            display:block;color:#ffe79b;font-size:29px;
            text-shadow:0 0 15px #ffb82e;
          }
          .eris-slot-top small{
            display:block;margin-top:5px;
            font-size:9px;letter-spacing:2px;
            color:#ffdf9d;
          }
          .eris-slot-cabinet{
            border:9px ridge #d6a45d!important;
            border-radius:20px!important;
            background:linear-gradient(#110b19,#3a1936,#100916)!important;
            box-shadow:inset 0 0 18px #000b,0 6px 10px #0008;
          }
          .eris-slot-reel{
            height:120px!important;
            border:5px solid #c5a06a!important;
            border-radius:7px!important;
            background:
              linear-gradient(180deg,#a7a3a4,#fffdf0 25%,
              #ffffff 49%,#e8e5dc 72%,#aaa6a6)!important;
            box-shadow:
              inset 0 15px 17px #0004,
              inset 0 -15px 17px #0003,
              0 0 0 2px #30201e!important;
          }
          .eris-slot-line{
            margin:6px 0!important;
            padding:3px 0;border-top:2px solid #edb95c;
            border-bottom:2px solid #edb95c;
            color:#ffe8a4!important;
          }
          @media(max-width:380px){
            .eris-slot-reel{
              height:90px!important;font-size:40px!important;
            }
            .eris-slot-betcontrols{
              grid-template-columns:48px 1fr 48px;
            }
          }
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

/* ERIS SLOT PRO V3 — yalnızca Slot */
#erisGamesModal.eg-slot-mode{
 padding:0!important;overflow:hidden!important;
}
#erisGamesModal.eg-slot-mode .eg-panel{
 width:100%!important;max-width:520px!important;
 height:100dvh!important;max-height:100dvh!important;
 overflow:hidden!important;box-sizing:border-box!important;
 display:flex!important;flex-direction:column!important;
 padding:8px 12px 10px!important;gap:5px!important;
 border-radius:0!important;
}
#erisGamesModal.eg-slot-mode .eg-head{
 flex:0 0 42px!important;min-height:42px!important;
 margin:0!important;padding:0!important;
}
#erisGamesModal.eg-slot-mode .eg-head h2{
 font-size:17px!important;margin:0!important;
}
#erisGamesModal.eg-slot-mode .eg-wallet{
 flex:0 0 auto!important;margin:0!important;
 padding:7px 10px!important;font-size:12px!important;
}
#erisGamesModal.eg-slot-mode .eg-intro,
#erisGamesModal.eg-slot-mode [data-name],
#erisGamesModal.eg-slot-mode .eg-keys,
#erisGamesModal.eg-slot-mode [data-scope],
#erisGamesModal.eg-slot-mode [data-choice],
#erisGamesModal.eg-slot-mode [data-play],
#erisGamesModal.eg-slot-mode [data-controls]{
 display:none!important;
}
#erisGamesModal.eg-slot-mode .eg-stage{
 flex:1 1 auto!important;min-height:0!important;
 width:100%!important;margin:0!important;
 padding:2px 5px!important;box-sizing:border-box!important;
 overflow:hidden!important;display:flex!important;
 justify-content:center!important;align-items:stretch!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-machine{
 position:relative!important;box-sizing:border-box!important;
 display:flex!important;flex-direction:column!important;
 justify-content:space-around!important;
 width:min(100%,350px)!important;max-width:350px!important;
 height:100%!important;min-height:0!important;
 margin:0 auto!important;padding:8px 15px 10px!important;
 border:5px solid #aab2ba!important;
 border-left:12px solid #65717e!important;
 border-right:12px solid #596472!important;
 border-bottom:11px solid #4b5360!important;
 border-radius:24px 24px 15px 15px!important;
 background:
 linear-gradient(90deg,#161e2b 0%,#394354 9%,#101621 23%,
 #131b29 76%,#465365 92%,#141b25 100%)!important;
 box-shadow:
 inset 0 0 0 3px #d2a75a,
 inset 0 0 28px #000,
 0 8px 16px #0009!important;
 overflow:visible!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-top{
 flex:0 0 auto!important;margin:0!important;
 font-size:clamp(13px,3.5vw,20px)!important;
 line-height:1.12!important;
 color:#ffe6a2!important;
 text-shadow:0 2px 3px #000,0 0 12px #ffb732!important;
 letter-spacing:2px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-crown{
 font-size:18px!important;margin-bottom:2px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-top small{
 margin-top:3px!important;font-size:8px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-lights{
 flex:0 0 auto!important;margin:2px 0!important;
 font-size:11px!important;letter-spacing:5px!important;
 color:#ffcf61!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-cabinet{
 position:relative!important;flex:1 1 auto!important;
 min-height:85px!important;max-height:175px!important;
 margin:2px 11px 4px 0!important;
 padding:9px 8px!important;
 display:flex!important;flex-direction:column!important;
 justify-content:center!important;
 border:5px solid #c9a15e!important;
 border-radius:14px!important;
 background:linear-gradient(160deg,#07090e,#222d3b,#090c13)!important;
 box-shadow:inset 0 0 0 3px #05070b,
 inset 0 0 22px #000!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-reels{
 width:100%!important;display:grid!important;
 grid-template-columns:repeat(3,minmax(0,1fr))!important;
 gap:4px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-reel{
 box-sizing:border-box!important;
 width:100%!important;
 height:clamp(55px,12dvh,98px)!important;
 border:3px solid #b3bac0!important;
 border-radius:7px!important;
 font-size:clamp(29px,8vw,47px)!important;
 background:linear-gradient(180deg,
 #757e87 0%,#e7e9e6 20%,#fff 47%,
 #e7e9e6 78%,#747d86 100%)!important;
 box-shadow:inset 0 12px 13px #0003,
 inset 0 -12px 13px #0003!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-line{
 margin:3px 0 0!important;padding:0!important;
 font-size:12px!important;line-height:16px!important;
 letter-spacing:18px!important;
 color:#f3b34e!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-status{
 flex:0 0 auto!important;min-height:17px!important;
 margin:2px 0!important;font-size:12px!important;
 color:#f8d58a!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-paytable{
 flex:0 0 auto!important;
 margin:1px 0!important;padding:3px 5px!important;
 font-size:10px!important;line-height:1.45!important;
 border-radius:8px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-lever{
 position:absolute!important;
 right:-34px!important;top:12%!important;
 width:37px!important;height:90px!important;
 border:0!important;padding:0!important;
 background:transparent!important;
 transform:none!important;
 transform-origin:50% 85%!important;
 touch-action:none!important;z-index:20!important;
 transition:transform .18s ease-out!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-lever.pulling{
 transform:translateY(39px) scaleY(.78)!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-arm{
 left:15px!important;top:13px!important;bottom:auto!important;
 height:68px!important;width:9px!important;
 border:1px solid #aeb9c3!important;
 border-radius:7px!important;
 background:linear-gradient(90deg,#343b45,#e9f2f7 48%,#59636c)!important;
 transform:none!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-knob{
 left:4px!important;top:0!important;
 width:31px!important;height:31px!important;
 border:2px solid #7e1721!important;
 background:radial-gradient(circle at 30% 25%,
 #ffb7a5,#e52237 40%,#8c071b 75%,#420710)!important;
 box-shadow:inset -4px -5px 7px #0007,
 0 3px 8px #0008!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-machine:has(.spinning)
 .eris-slot-lever{animation:none!important}
#erisGamesModal.eg-slot-mode .eg-form{
 flex:0 0 auto!important;width:100%!important;
 margin:0!important;padding:6px!important;
 display:flex!important;flex-direction:column!important;
 gap:5px!important;border-radius:12px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-betbar{
 width:100%!important;box-sizing:border-box!important;
 margin:0!important;padding:6px!important;
 border-radius:11px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-bettitle{
 font-size:10px!important;margin:0 0 4px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-betcontrols{
 grid-template-columns:43px 1fr 43px!important;gap:6px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-betcontrols button{
 min-height:40px!important;font-size:25px!important;
 border-radius:9px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-amount strong{
 font-size:18px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-amount small{
 font-size:9px!important;
}
#erisGamesModal.eg-slot-mode .eris-slot-step{
 margin-top:3px!important;font-size:9px!important;
}
#erisGamesModal.eg-slot-mode .eg-stake-presets{
 display:grid!important;
 grid-template-columns:repeat(8,minmax(0,1fr))!important;
 gap:3px!important;width:100%!important;margin:0!important;
}
#erisGamesModal.eg-slot-mode [data-stake-value]{
 min-width:0!important;height:32px!important;
 padding:0!important;border-radius:6px!important;
 font-size:9px!important;
}
#erisGamesModal.eg-slot-mode .eg-result{
 flex:0 0 auto!important;max-height:32px!important;
 overflow:hidden!important;margin:0!important;
 padding:3px!important;font-size:10px!important;
}
@media(max-height:650px){
 #erisGamesModal.eg-slot-mode .eris-slot-top small,
 #erisGamesModal.eg-slot-mode .eris-slot-paytable{
 display:none!important;
 }
 #erisGamesModal.eg-slot-mode .eg-head{
 flex-basis:35px!important;min-height:35px!important;
 }
}

        </style>`;


      const host = container.closest('#erisGamesModal');
      if (host) {
        host.querySelector('.eris-slot-betbar')?.remove();

        const form = host.querySelector('.eg-form');
        const input = host.querySelector('[data-stake]');
        if (form && input && !form.querySelector('.eris-slot-betbar')) {
          const bar = document.createElement('div');
          bar.className = 'eris-slot-betbar';
          bar.innerHTML = `
            <div class="eris-slot-bettitle">BAHİS MİKTARI</div>
            <div class="eris-slot-betcontrols">
              <button type="button" data-slot-minus aria-label="Bahsi azalt">−</button>
              <div class="eris-slot-amount">
                <strong data-slot-amount>100</strong>
                <small>🪙 LİDYA</small>
              </div>
              <button type="button" data-slot-plus aria-label="Bahsi artır">+</button>
            </div>
            <div class="eris-slot-step">
              <span>ARTIŞ MİKTARI</span>
              <strong data-slot-step>100</strong>
            </div>`;
          form.insertBefore(bar, form.querySelector('.eg-stake-presets'));

          let step = 100;
          const amount = bar.querySelector('[data-slot-amount]');
          const stepText = bar.querySelector('[data-slot-step]');
          const update = () => {
            amount.textContent = Number(input.value || 0)
              .toLocaleString('tr-TR');
          };
          update();
          input.addEventListener('input', update);

          host.querySelectorAll('[data-stake-value]').forEach(b => {
            b.addEventListener('click', () => {
              if (!host.classList.contains('eg-slot-mode')) return;
              step = Number(b.dataset.stakeValue) || 100;
              stepText.textContent = step.toLocaleString('tr-TR');
              queueMicrotask(update);
            });
          });

          for (const [selector, direction] of [
            ['[data-slot-minus]', -1],
            ['[data-slot-plus]', 1]
          ]) {
            bar.querySelector(selector).onclick = () => {
              if (!host.classList.contains('eg-slot-mode')) return;
              const play = host.querySelector('[data-play]');
              if (play?.disabled) return;
              const current = Number(input.value) || 0;
              input.value = String(Math.max(10,
                Math.min(10000, current + direction * step)));
              input.dispatchEvent(new Event('input', {bubbles:true}));
            };
          }
        }
      }

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
        if (triggered || modal.dataset.slotBusy === '1' || !container.isConnected ||
            !modal.classList.contains('eg-slot-mode')) return;
        const play = modal.querySelector('[data-play]');
        if (!play || play.disabled) return;
        triggered = true;
        modal.dataset.slotBusy = '1';
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
        const shouldSpin = false;
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
