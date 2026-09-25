(() => {
    'use strict';
    
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-race-wrapper">
                <div class="eg-race-track">
                    <div class="eg-race-lane">
                        <span class="eg-race-name">🐎 At 1</span>
                        <div class="eg-race-bar"><div class="eg-race-progress p1"></div></div>
                        <span>🏁</span>
                    </div>
                    <div class="eg-race-lane">
                        <span class="eg-race-name">🐎 At 2</span>
                        <div class="eg-race-bar"><div class="eg-race-progress p2"></div></div>
                        <span>🏁</span>
                    </div>
                    <div class="eg-race-lane">
                        <span class="eg-race-name">🐎 At 3</span>
                        <div class="eg-race-bar"><div class="eg-race-progress p3"></div></div>
                        <span>🏁</span>
                    </div>
                </div>
                <div class="eg-race-status">Yarış başlamak üzere, favorini seç!</div>
            </div>
            <style>
                .eg-race-wrapper {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    position: relative; width: 100%; height: 100%; min-height: 220px;
                }
                .eg-race-track { width: 92%; display: flex; flex-direction: column; gap: 8px; }
                .eg-race-lane {
                    display: flex; align-items: center; justify-content: space-between;
                    background: rgba(255,255,255,0.04); padding: 6px 10px; border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08); font-size: 11px;
                }
                .eg-race-name { width: 45px; font-weight: 700; color: #a77aff; }
                .eg-race-bar { flex-grow: 1; margin: 0 10px; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
                .eg-race-progress { height: 100%; background: linear-gradient(90deg, #7c4ee4, #2ed573); border-radius: 4px; width: 0%; transition: width 0.35s ease; }
                .eg-race-status { margin-top: 14px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center; }
            </style>
        `;
    }

    async function animate(stageEl, data) {
        const status = stageEl.querySelector('.eg-race-status');
        const bars = stageEl.querySelectorAll('.eg-race-progress');
        if (!status) return;

        status.textContent = 'Atlar koşuyor... Heyecan dorukta!';
        const checkpoints = data?.animation?.checkpoints || [
            { horse_1: 30, horse_2: 45, horse_3: 35 },
            { horse_1: 65, horse_2: 60, horse_3: 70 },
            { horse_1: 85, horse_2: 80, horse_3: 90 }
        ];

        for (const cp of checkpoints) {
            bars.forEach((bar, idx) => {
                const val = cp['horse_' + (idx + 1)] || Math.floor(Math.random() * 80) + 10;
                bar.style.width = Math.min(95, val) + '%';
            });
            await new Promise(r => setTimeout(r, 400));
        }

        const winner = data && data.result ? data.result : 'horse_3';
        const winIdx = parseInt(winner.replace('horse_', '')) - 1;
        bars.forEach((bar, idx) => {
            bar.style.width = idx === winIdx ? '98%' : '75%';
        });

        status.textContent = '🏆 Kazanan: ' + (data.result || 'At 3') + '!';
    }

    window.ErisGameHorseRace = { render, animate, options: [['horse_1','1. At'],['horse_2','2. At'],['horse_3','3. At'],['horse_4','4. At'],['horse_5','5. At'],['horse_6','6. At'],['horse_7','7. At']] };
})();
