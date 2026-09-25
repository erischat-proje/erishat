(() => {
    'use strict';

    const HORSES = [
        { id: '1', name: '⚡ Şimşek', color: '#38bdf8' },
        { id: '2', name: '🔥 Alev', color: '#f43f5e' },
        { id: '3', name: '🌪️ Fırtına', color: '#eab308' },
        { id: '4', name: '👑 Asil', color: '#a855f7' }
    ];

    const HorseRaceGame = {
        options: HORSES.map(h => [h.id, h.name]),

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #18221b 0%, #0a0f0c 100%); border-radius:14px; border:1px solid rgba(52,211,153,0.3); padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                    <div style="text-align:center; font-size:12px; color:#6ee7b7; font-weight:700;">🐎 PRO HİPODROM</div>
                    <div style="display:flex; flex-direction:column; gap:6px; margin:8px 0;" id="raceTrack">
                        ${HORSES.map(h => `
                            <div style="position:relative; background:#0f1712; border:1px solid rgba(52,211,153,0.2); border-radius:8px; height:28px; display:flex; align-items:center; padding:0 8px; overflow:hidden;">
                                <div style="font-size:11px; font-weight:bold; color:${h.color}; width:80px; z-index:2;">${h.name}</div>
                                <div class="horse-runner" data-horse="${h.id}" style="position:absolute; left:80px; transition:left 3.5s cubic-bezier(0.25, 1, 0.5, 1); font-size:16px;">🏇</div>
                            </div>
                        `).join('')}
                    </div>
                    <div id="raceStatusText" style="text-align:center; font-size:11px; color:#a7f3d0; font-weight:600;">Atını seç ve yarışı başlat!</div>
                </div>
            `;
        },

        async animate(container, data) {
            const statusText = document.getElementById('raceStatusText');
            const winningHorse = String(data?.winner || data?.winning_horse || '1');

            if (statusText) statusText.textContent = '🚦 Start verildi! Atlar koşuyor...';

            return new Promise(resolve => {
                setTimeout(() => {
                    const runners = container.querySelectorAll('.horse-runner');
                    runners.forEach(runner => {
                        const isWinner = runner.dataset.horse === winningHorse;
                        runner.style.left = isWinner ? '78%' : (40 + Math.random() * 25) + '%';
                    });

                    setTimeout(() => {
                        const winnerObj = HORSES.find(h => h.id === winningHorse) || HORSES[0];
                        if (statusText) {
                            statusText.textContent = data?.result === 'win' ? `🎉 ${winnerObj.name} kazandı!` : `❌ ${winnerObj.name} kazandı!`;
                        }
                        resolve();
                    }, 3500);
                }, 400);
            });
        }
    };

    window.ErisGameHorseRace = HorseRaceGame;
})();
