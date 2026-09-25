(() => {
    'use strict';
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-race-wrapper">
                <div class="eg-race-track">
                    <div class="eg-race-lane"><span class="eg-race-name">🐎 At 1</span><div class="eg-race-bar"><div class="eg-race-progress"></div></div><span>🏁</span></div>
                    <div class="eg-race-lane"><span class="eg-race-name">🐎 At 2</span><div class="eg-race-bar"><div class="eg-race-progress"></div></div><span>🏁</span></div>
                    <div class="eg-race-lane"><span class="eg-race-name">🐎 At 3</span><div class="eg-race-bar"><div class="eg-race-progress"></div></div><span>🏁</span></div>
                </div>
                <div class="eg-race-status">Atlar start kapısında yerini aldı!</div>
            </div>
            <style>
                .eg-race-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; min-height: 240px; }
                .eg-race-track { width: 94%; display: flex; flex-direction: column; gap: 10px; }
                .eg-race-lane { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); font-size: 11px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.3); }
                .eg-race-name { width: 50px; font-weight: 700; color: #a77aff; }
                .eg-race-bar { flex-grow: 1; margin: 0 12px; height: 10px; background: rgba(255,255,255,0.12); border-radius: 5px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5); }
                .eg-race-progress { height: 100%; background: linear-gradient(90deg, #7c4ee4, #2ed573); border-radius: 5px; width: 0%; transition: width 0.3s ease; box-shadow: 0 0 10px #2ed573; }
                .eg-race-status { margin-top: 16px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center; }
            </style>
        `;
    }
    async function animate(stageEl, data) {
        const status = stageEl.querySelector('.eg-race-status');
        const bars = stageEl.querySelectorAll('.eg-race-progress');
        if (!status) return;
        status.textContent = '🐎 Atlar tüm hızıyla pistte koşturuyor!';
        const checkpoints = data?.animation?.checkpoints || [
            { horse_1: 35, horse_2: 50, horse_3: 40 },
            { horse_1: 70, horse_2: 65, horse_3: 75 },
            { horse_1: 90, horse_2: 85, horse_3: 92 }
        ];
        for (const cp of checkpoints) {
            bars.forEach((bar, idx) => {
                const val = cp['horse_' + (idx + 1)] || Math.floor(Math.random() * 80) + 15;
                bar.style.width = Math.min(96, val) + '%';
            });
            await new Promise(r => setTimeout(r, 380));
        }
        const winner = data && data.result ? data.result : 'horse_3';
        const winIdx = parseInt(winner.replace('horse_', '')) - 1;
        bars.forEach((bar, idx) => { bar.style.width = idx === winIdx ? '98%' : '78%'; });
        status.textContent = '🏆 Yarışı Kazanan: ' + (data.result || 'At 3') + '!';
    }
    window.ErisGameHorseRace = { render, animate, options: [['horse_1','1. At'],['horse_2','2. At'],['horse_3','3. At'],['horse_4','4. At'],['horse_5','5. At'],['horse_6','6. At'],['horse_7','7. At']] };
})();
