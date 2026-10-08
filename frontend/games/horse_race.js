(() => {
  'use strict';

  const HORSES = [
    ['1','⚡ Şimşek','#38bdf8'],
    ['2','🔥 Alev','#fb7185'],
    ['3','🌪️ Fırtına','#facc15'],
    ['4','👑 Asil','#c084fc'],
    ['5','🌟 Yıldız','#fbbf24'],
    ['6','💎 Safir','#22d3ee'],
    ['7','🍀 Şans','#4ade80']
  ];

  const game = {
    options: HORSES.map(h => [h[0],h[1]]),
    token: 0,

    render(container) {
      this.token++;
      container.innerHTML = `
        <div class="horse-arena" style="
          width:100%;box-sizing:border-box;overflow:hidden;
          background:linear-gradient(160deg,#251c30,#11131e);
          padding:12px 8px;border-radius:18px;
          border:1px solid #c59b5b55;
          box-shadow:inset 0 1px #ffffff12,0 12px 30px #0005">
          <div style="display:flex;justify-content:space-between;
            align-items:center;gap:8px;padding:4px 5px 12px">
            <strong style="color:#f5d493;font-size:15px">
              🏇 CANLI HİPODROM
            </strong>
            <span style="font-size:10px;color:#b9a9c8;
              font-weight:800">7 AT · TEK KAZANAN</span>
          </div>
          <div class="horse-track" style="display:grid;gap:5px">
            ${HORSES.map((h,i) => `
              <div class="horse-lane" style="
                position:relative;height:49px;overflow:hidden;
                border-radius:10px;border:1px solid #ffffff16;
                background:repeating-linear-gradient(
                  90deg,#31273c 0px,#31273c 34px,
                  #292235 34px,#292235 68px);
                box-shadow:inset 0 2px 9px #0005">
                <span style="position:absolute;left:5px;top:4px;
                  z-index:3;display:flex;align-items:center;gap:5px;
                  font-size:10px;font-weight:900;color:${h[2]};
                  text-shadow:0 2px 4px #000">
                  <span style="background:#120e1ecc;border:1px solid #ffffff22;
                    padding:2px 5px;border-radius:5px">${i+1}</span>
                  ${h[1]}
                </span>
                <div style="position:absolute;right:13%;top:0;
                  height:100%;border-left:3px dashed #f8d58e;
                  opacity:.9;box-shadow:0 0 8px #f8d58e44"></div>
                <div class="horse-runner" data-horse="${h[0]}"
                  style="position:absolute;left:0;bottom:2px;
                  font-size:29px;will-change:transform;
                  filter:drop-shadow(0 3px 3px #000)">🏇</div>
              </div>`).join('')}
          </div>
          <div id="raceStatusText" style="
            text-align:center;padding:12px 5px 3px;
            font-size:12px;font-weight:800;color:#f2d9a5">
            ⏳ Canlı yarış için bahisler alınıyor
          </div>
        </div>`;
    },

    async animate(container, data) {
      const token = ++this.token;
      const runners = [...container.querySelectorAll('.horse-runner')];
      const status = container.querySelector('#raceStatusText');
      const winner = String(data?.winner || data?.winning_horse ||
                            data?.animation?.finish_order?.[0] || '1').replace(/^horse_/, '');
      const duration = 7000;
      const start = performance.now();
      const seed = runners.map((_,i) => ({
        phase: i * 1.7,
        pace: .83 + Math.random() * .14
      }));

      runners.forEach(r => {
        r.style.transition = 'none';
        r.style.transform = 'translateX(0px)';
        r.style.filter = '';
      });
      if (status) status.textContent = '🚦 START! Yarış başladı!';

      return new Promise(resolve => {
        const frame = now => {
          if (token !== this.token || !container.isConnected) {
            resolve();
            return;
          }

          const t = Math.min(1,(now-start)/duration);
          const track = runners[0]?.parentElement;
          const width = track ? track.clientWidth : 300;
          const finish = Math.max(0,width*.87-30);

          runners.forEach((r,i) => {
            const win = r.dataset.horse === winner;
            const wave = Math.sin(t*22+seed[i].phase)*.025;
            const progress = win
              ? t + Math.sin(t*14+i)*.012*(1-t)
              : Math.min(.94,t*seed[i].pace+wave*(1-t));
            const x = Math.max(0,Math.min(1,progress))*finish;
            const bounce = Math.sin(t*95+i)*2;
            r.style.transform =
              `translate(${x}px,${bounce}px)`;
          });

          if (t < 1) {
            requestAnimationFrame(frame);
          } else {
            const winningRunner = runners.find(
              r => r.dataset.horse === winner
            );
            if (winningRunner) {
              winningRunner.style.filter =
                'drop-shadow(0 0 9px #facc15)';
            }
            const horse = HORSES.find(h => h[0] === winner);
            if (status) status.textContent =
              `🏆 ${horse?.[1] || 'Kazanan at'} finişi geçti!`;
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });
    }
  };

  window.ErisGameHorseRace = game;
})();
