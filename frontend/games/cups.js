(() => {
  'use strict';

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const options = [1, 2, 3, 4].map(n => [String(n), `Kupa ${n}`]);

  const style = `
    .eris-cups-board {
      width:100%; box-sizing:border-box; padding:20px 10px;
      border-radius:18px; overflow:hidden;
      background:radial-gradient(ellipse at top,#48315c,#160d22 75%);
      border:1px solid #b98954;
      text-align:center; color:#ffe9bd;
    }
    .eris-cups-title {
      font-size:17px; font-weight:900; letter-spacing:1px;
      margin-bottom:12px;
    }
    .eris-cups-table {
      display:flex; justify-content:center; align-items:end;
      gap:clamp(5px,2vw,14px); padding:30px 5px 18px;
      border-bottom:9px solid #88502c;
      border-radius:0 0 45% 45%;
      background:linear-gradient(transparent 70%,#5d321e55);
    }
    .eris-cup {
      position:relative; flex:0 1 67px; min-width:0;
      height:100px; border:0; background:none;
      padding:0; cursor:default; color:#ffe8a6;
      touch-action:manipulation;
    }
    .eris-cup-body {
      position:absolute; left:9%; right:9%; top:7px; bottom:20px;
      background:linear-gradient(90deg,#51255e,#bd75cf 34%,#672d78 75%,#391747);
      border:2px solid #f4c579;
      border-bottom:6px solid #d6a45b;
      border-radius:10px 10px 17px 17px;
      box-shadow:inset 5px 0 10px #ffffff22,5px 7px 13px #0008;
      transform:perspective(150px) rotateX(-5deg);
      transition:transform .38s ease;
    }
    .eris-cup-body:before {
      content:''; position:absolute; width:44%; height:8px;
      background:#f5d78d; border-radius:50%;
      left:28%; top:-9px;
    }
    .eris-cup-number {
      position:absolute; inset:22px 0 auto;
      text-align:center; font-size:19px; font-weight:900;
      color:#ffdf8e; text-shadow:0 2px 4px #180c20;
    }
    .eris-cup-shadow {
      position:absolute; left:8%; right:8%; bottom:6px;
      height:12px; background:#08040aaa;
      border-radius:50%; filter:blur(4px);
    }
    .eris-cup-coin {
      position:absolute; bottom:16px; left:0; right:0;
      font-size:27px; opacity:0; transition:opacity .2s;
    }
    .eris-cup.pickable { cursor:pointer; }
    .eris-cup.pickable:focus-visible { outline:2px solid #ffdc77; }

 .eris-cup {
   will-change:transform;
 }
 .eris-cup.revealed .eris-cup-body {
   animation:erisCupReveal .65s cubic-bezier(.2,.8,.2,1) forwards;
 }
 .eris-cup.revealed .eris-cup-coin {
   opacity:1;
   animation:erisCupGold 1s ease-in-out infinite alternate;
 }
 .eris-cup.selected {
   filter:drop-shadow(0 0 9px #ffe08499);
 }
 .eris-cups-board.cups-win {
   border-color:#ffe18d;
   box-shadow:0 0 24px #ffd86a44;
 }
 .eris-cups-board.cups-lose {
   border-color:#a06b9c;
 }
 @keyframes erisCupReveal {
   0% {transform:translateY(0) rotate(0)}
   65% {transform:translateY(-48px) rotate(-9deg)}
   100% {transform:translateY(-39px) rotate(-7deg)}
 }
 @keyframes erisCupGold {
   from {filter:drop-shadow(0 0 3px #ffd66a)}
   to {filter:drop-shadow(0 0 15px #fff1a0)}
 }
 @media(prefers-reduced-motion:reduce) {
   .eris-cup.revealed .eris-cup-body,
   .eris-cup.revealed .eris-cup-coin {
     animation:none!important;
   }
 }
 .eris-cup.revealed .eris-cup-body {
      transform:translateY(-35px) rotate(-7deg);
    }
    .eris-cup.revealed .eris-cup-coin { opacity:1; }
    .eris-cup.selected .eris-cup-body { border-color:#fff0a0; }
    .eris-cups-status {
      margin-top:16px; min-height:30px;
      font-size:13px; font-weight:800;
    }
    @media(max-width:360px) {
      .eris-cup { height:86px; }
      .eris-cups-table { padding-top:20px; }
    }
  `;

  function ensureStyle() {
    if (document.getElementById('eris-cups-real-style')) return;
    const el = document.createElement('style');
    el.id = 'eris-cups-real-style';
    el.textContent = style;
    document.head.appendChild(el);
  }

  const CupsGame = {
    options,
    busy:false,

    render(container) {
      this.busy = false;
      ensureStyle();
      container.innerHTML = `
        <section class="eris-cups-board">
          <div class="eris-cups-title">🏆 DÖRT KUPA</div>
          <div class="eris-cups-table">
            ${[1,2,3,4].map(n => `
              <button type="button" class="eris-cup" data-cup="${n}"
                aria-label="Kupa ${n}" disabled>
                <span class="eris-cup-shadow"></span>
                <span class="eris-cup-coin">🪙</span>
                <span class="eris-cup-body">
                  <span class="eris-cup-number">${n}</span>
                </span>
              </button>
            `).join('')}
          </div>
          <div class="eris-cups-status" aria-live="polite">
            Bahsini koy ve kupaları karıştır.
          </div>
        </section>`;
    },

    async shuffle(container, onChoose) {
      if (this.busy) return;
      this.busy = true;
      const table = container.querySelector('.eris-cups-table');
      const status = container.querySelector('.eris-cups-status');
      if (!table || !status) {
        this.busy = false;
        return;
      }

      status.textContent = '🔄 Kupalar karıştırılıyor...';
      const cups = [...table.querySelectorAll('.eris-cup')];
      cups.forEach(c => {
        c.disabled = true;
        c.classList.remove('selected','revealed','pickable');
      });

      try {
        // ERIS_CUPS_PREMIUM_SHUFFLE_V2
        // Her turda dört kupa iki eşzamanlı çift halinde hareket eder.
        const patterns = [
          [[0,3],[1,2]],
          [[0,2],[1,3]],
          [[0,1],[2,3]]
        ];

        const randomIndex = max => {
          if (globalThis.crypto?.getRandomValues) {
            const value = new Uint32Array(1);
            crypto.getRandomValues(value);
            return value[0] % max;
          }
          return Math.floor(Math.random() * max);
        };

        for (let step = 0; step < 9; step++) {
          if (!table.isConnected ||
              container.querySelector('.eris-cups-table') !== table) return;

          const current = [...table.children];
          const next = [...current];
          const pattern = patterns[randomIndex(patterns.length)];
          const moves = [];

          for (const [a,b] of pattern) {
            const x = current[a];
            const y = current[b];
            const rx = x.getBoundingClientRect();
            const ry = y.getBoundingClientRect();
            const dx = ry.left - rx.left;

            moves.push([x, dx, -22], [y, -dx, 22]);
            next[a] = y;
            next[b] = x;
          }

          for (const [cup, dx, arc] of moves) {
            cup.style.zIndex = arc < 0 ? '4' : '2';
            cup.style.transition =
              'transform 340ms cubic-bezier(.35,0,.25,1)';
            cup.style.transform =
              `translate3d(${dx}px,${arc}px,0)`;
          }

          await wait(365);

          for (const [cup] of moves) {
            cup.style.transition = 'none';
            cup.style.transform = '';
            cup.style.zIndex = '';
          }

          table.replaceChildren(...next);
          await wait(35);
        }

        if (!table.isConnected ||
            container.querySelector('.eris-cups-table') !== table) return;
        this.busy = false;
        status.textContent = '👆 Bir kupa seç!';
        [...table.children].forEach((cup, index) => {
          cup.disabled = false;
          cup.classList.add('pickable');
          cup.dataset.position = String(index + 1);
          cup.onclick = () => {
            if (this.busy) return;
            this.busy = true;
            [...table.children].forEach(c => {
              c.disabled = true;
              c.classList.remove('pickable');
            });
            cup.classList.add('selected');
            status.textContent = '⏳ Seçimin kontrol ediliyor...';
            Promise.resolve()
              .then(() => onChoose(String(index + 1)))
              .catch(err => {
                status.textContent = err?.message || 'Seçim yapılamadı.';
                this.busy = false;
                [...table.children].forEach(c => {
                  c.disabled = false;
                  c.classList.add('pickable');
                });
              });
          };
        });
      } finally {
        this.busy = false;
      }
    },

    async reveal(container, data) {
      const status = container.querySelector('.eris-cups-status');
      const winning = String(data.winning_cup || '').replace('cup_','');
      const selected = String(data.choice || '').replace('cup_','');
      const board = container.querySelector('.eris-cups-board');
      board?.classList.remove('cups-win', 'cups-lose');
      board?.classList.add(selected === winning ? 'cups-win' : 'cups-lose');
      const cups = [...container.querySelectorAll('.eris-cup')];
      cups.forEach(c => {
        c.disabled = true;
        c.classList.remove('pickable');
        if (c.dataset.position === winning) {
          c.classList.add('revealed');
        }
        if (c.dataset.position === selected) {
          c.classList.add('selected');
        }
      });
      if (status) {
        status.textContent = selected === winning
          ? '🎉 Doğru kupa! Kazandın!'
          : `🪙 Altın ${winning}. kupadaydı.`;
      }
      await wait(1000);
    }
  };

  window.ErisGameCups = CupsGame;
})();
