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
        <div style="background:linear-gradient(145deg,#102c24,#07130f);
          padding:12px;border-radius:16px;color:white;
          border:1px solid #32745c">
          <div style="text-align:center;font-weight:900;
            color:#facc15;margin-bottom:10px">
            🏆 ERISCHAT PRO HİPODROM
          </div>
          <div class="horse-track" style="display:grid;gap:5px">
            ${HORSES.map(h => `
              <div style="position:relative;height:43px;
                overflow:hidden;border-radius:7px;
                background:repeating-linear-gradient(
                90deg,#224835 0px,#224835 24px,
                #1b3b2c 24px,#1b3b2c 48px);
                border-bottom:2px dashed #6b987b">
                <span style="position:absolute;left:4px;top:3px;
                  font-size:10px;color:${h[2]};z-index:2;
                  text-shadow:0 1px 3px #000">${h[1]}</span>
                <div style="position:absolute;right:13%;top:0;
                  height:100%;border-left:3px dashed white;
                  opacity:.8"></div>
                <div class="horse-runner" data-horse="${h[0]}"
                  style="position:absolute;left:0;bottom:2px;
                  font-size:25px;will-change:transform;
                  filter:drop-shadow(0 2px 3px #000)">🏇</div>
              </div>`).join('')}
          </div>
          <div id="raceStatusText" style="text-align:center;
            padding:10px;font-weight:700;color:#a7f3d0">
            🏇 Atını seç ve yarışı başlat!
          </div>
        </div>`;
    },

    async animate(container, data) {
      const token = ++this.token;
      const runners = [...container.querySelectorAll('.horse-runner')];
      const status = container.querySelector('#raceStatusText');
      const winner = String(data?.winner || data?.winning_horse ||
                            data?.animation?.finish_order?.[0] || '1');
      const duration = 5200;
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
