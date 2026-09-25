(() => {
    'use strict';

    const HORSES = [
        { id: '1', name: '⚡ Şimşek', odds: '2.0x', color: '#38bdf8' },
        { id: '2', name: '🔥 Alev', odds: '3.0x', color: '#f43f5e' },
        { id: '3', name: '🌪️ Fırtına', odds: '4.5x', color: '#eab308' },
        { id: '4', name: '👑 Asil', odds: '6.0x', color: '#a855f7' }
    ];

    const HorseRaceGame = {
        options: HORSES.map(h => [h.id, `${h.name} (${h.odds})`]),

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #18221b 0%, #0a0f0c 100%); border-radius:14px; border:1px solid rgba(52,211,153,0.3); padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                    <div style="text-align:center; font-size:12px; color:#6ee7b7; font-weight:700; text-shadow:0 0 10px rgba(52,211,153,0.4);">
                        🐎 PRO HİPODROM • Favori Atını Seç ve Yarışı Başlat
                    </div>

                    <!-- Yarış Kulvarları -->
                    <div style="display:flex; flex-direction:column; gap:6px; margin:8px 0;" id="raceTrack">
                        ${HORSES.map(h => `
                            <div style="position:relative; background:#0f1712; border:1px solid rgba(52,211,153,0.2); border-radius:8px; height:28px; display:flex; align-items:center; padding:0 8px; overflow:hidden;">
                                <div style="font-size:11px; font-weight:bold; color:${h.color}; width:80px; z-index:2;">${h.name}</div>
                                <div class="horse-runner" data-horse="${h.id}" style="position:absolute; left:80px; transition:left 3.5s cubic-bezier(0.25, 1, 0.5, 1); font-size:16px;">🏇</div>
                            </div>
                        `).join('')}
                    </div>

                    <div id="raceStatusText" style="text-align:center; font-size:11px; color:#a7f3d0; font-weight:600;">Bahsini yap, start verilsin!</div>
                </div>
            `;
        },

        async animate(container, data) {
            const statusText = document.getElementById('raceStatusText');
            const winningHorse = String(data?.winner || data?.winning_horse || Math.floor(Math.random() * 4) + 1);

            if (statusText) statusText.textContent = '🚦 Start verildi! Atlar kıyasıya yarışıyor...';

            return new Promise(resolve => {
                setTimeout(() => {
                    const runners = container.querySelectorAll('.horse-runner');
                    runners.forEach(runner => {
                        const isWinner = runner.dataset.horse === winningHorse;
                        // Kazanan at en öne (örn. %75 mesafe), diğerleri geride kalır
                        const targetLeft = isWinner ? '78%' : (40 + Math.random() * 25) + '%';
                        runner.style.left = targetLeft;
                    });

                    setTimeout(() => {
                        const winnerObj = HORSES.find(h => h.id === winningHorse) || HORSES[0];
                        if (statusText) {
                            statusText.textContent = data?.result === 'win' ? `🎉 Tebrikler! ${winnerObj.name} yarışı kazandı!` : `❌ Yarışı ${winnerObj.name} kazandı, maalesef kaybettin.`;
                        }
                        resolve();
                    }, 3500);
                }, 400);
            });
        }
    };

    window.ErisGameHorseRace = HorseRaceGame;
})();
