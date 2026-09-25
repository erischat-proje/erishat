(() => {
    'use strict';
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-crash-wrapper">
                <div class="eg-crash-sky">
                    <div class="eg-crash-rocket-box">
                        <div class="eg-crash-rocket">🚀</div>
                        <div class="eg-crash-fire"></div>
                    </div>
                </div>
                <div class="eg-crash-multiplier">1.00×</div>
                <div class="eg-crash-status">Roket fırlatmaya hazır! Çarpanlar yükseliyor...</div>
            </div>
            <style>
                .eg-crash-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; min-height: 240px; overflow: hidden; }
                .eg-crash-sky { height: 120px; width: 100%; display: grid; place-items: center; position: relative; background: radial-gradient(circle, rgba(138,92,255,0.15) 0%, transparent 70%); }
                .eg-crash-rocket-box { display: flex; flex-direction: column; align-items: center; animation: rocketHover 1s ease-in-out infinite alternate; }
                .eg-crash-rocket { font-size: 50px; filter: drop-shadow(0 0 20px rgba(255, 71, 87, 0.9)); transform: rotate(-45deg); }
                .eg-crash-fire { width: 14px; height: 24px; background: linear-gradient(to bottom, #ff4757, #ffa502, transparent); border-radius: 50%; filter: blur(3px); margin-top: -8px; animation: fireFlicker 0.12s ease-in-out infinite alternate; }
                @keyframes rocketHover { 0% { transform: translateY(0) scale(1) rotate(-45deg); } 100% { transform: translateY(-14px) scale(1.08) rotate(-40deg); } }
                @keyframes fireFlicker { 0% { transform: scaleY(0.8); opacity: 0.7; } 100% { transform: scaleY(1.4); opacity: 1; } }
                .eg-crash-multiplier { font-size: 42px; font-weight: 900; color: #ffb347; text-shadow: 0 0 30px rgba(255,179,71,0.8); margin-top: 6px; }
                .eg-crash-status { margin-top: 6px; font-weight: 600; color: rgba(255,255,255,0.75); font-size: 12px; text-align: center; }
            </style>
        `;
    }
    async function animate(stageEl, data) {
        const multEl = stageEl.querySelector('.eg-crash-multiplier');
        const statusEl = stageEl.querySelector('.eg-crash-status');
        const rocketBox = stageEl.querySelector('.eg-crash-rocket-box');
        if (!multEl) return;
        statusEl.textContent = '🚀 Roket hızla yükseliyor!';
        const curve = data?.animation?.curve || [1.2, 1.6, 2.1, 3.0, 4.5, 6.8];
        for (const step of curve) {
            multEl.textContent = Number(step).toFixed(2) + '×';
            if (rocketBox) rocketBox.style.transform = `translateY(-${(step - 1) * 14}px) scale(${1 + (step - 1) * 0.06})`;
            await new Promise(r => setTimeout(r, 180));
        }
        multEl.textContent = '💥 ' + Number(data.multiplier || data.payout || 2).toFixed(2) + '×';
        statusEl.textContent = '⚡ Çarpan noktası kilitlendi!';
    }
    window.ErisGameCrash = { render, animate, options: [['1.5','1.5× Hedef'],['2.0','2.0× Hedef'],['3.0','3.0× Hedef'],['5.0','5.0× Hedef'],['10.0','10.0× Jackpot']] };
})();
