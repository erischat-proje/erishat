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
                <div class="eg-crash-status">Roket kalkışa hazırlanıyor...</div>
            </div>
            <style>
                .eg-crash-wrapper {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    position: relative; width: 100%; height: 100%; min-height: 220px; overflow: hidden;
                }
                .eg-crash-sky {
                    height: 110px; width: 100%; display: grid; place-items: center; position: relative;
                }
                .eg-crash-rocket-box {
                    display: flex; flex-direction: column; align-items: center;
                    animation: rocketHover 1.2s ease-in-out infinite alternate;
                }
                .eg-crash-rocket {
                    font-size: 46px; filter: drop-shadow(0 0 15px rgba(255, 107, 107, 0.8));
                    transform: rotate(-45deg);
                }
                .eg-crash-fire {
                    width: 12px; height: 20px; background: linear-gradient(to bottom, #ff4757, #ffa502, transparent);
                    border-radius: 50%; filter: blur(2px); margin-top: -6px;
                    animation: fireFlicker 0.15s ease-in-out infinite alternate;
                }
                @keyframes rocketHover {
                    0% { transform: translateY(0px) scale(1); }
                    100% { transform: translateY(-12px) scale(1.05); }
                }
                @keyframes fireFlicker {
                    0% { transform: scaleY(0.9); opacity: 0.8; }
                    100% { transform: scaleY(1.3); opacity: 1; }
                }
                .eg-crash-multiplier {
                    font-size: 40px; font-weight: 900; color: #ffb347;
                    text-shadow: 0 0 25px rgba(255, 179, 71, 0.7); margin-top: 4px;
                }
                .eg-crash-status {
                    margin-top: 6px; font-weight: 600; color: rgba(255,255,255,0.7); font-size: 12px; text-align: center;
                }
            </style>
        `;
    }

    async function animate(stageEl, data) {
        const multEl = stageEl.querySelector('.eg-crash-multiplier');
        const statusEl = stageEl.querySelector('.eg-crash-status');
        const rocketBox = stageEl.querySelector('.eg-crash-rocket-box');
        if (!multEl) return;

        statusEl.textContent = 'Roket yükseliyor...';
        const curve = data?.animation?.curve || [1.1, 1.3, 1.7, 2.2, 3.1, 4.5];
        
        for (const step of curve) {
            multEl.textContent = Number(step).toFixed(2) + '×';
            if (rocketBox) rocketBox.style.transform = `translateY(-${(step - 1) * 12}px) scale(${1 + (step - 1) * 0.05})`;
            await new Promise(r => setTimeout(r, 220));
        }

        const finalMult = Number(data.multiplier || data.payout || 2).toFixed(2);
        multEl.textContent = '💥 ' + finalMult + '×';
        statusEl.textContent = 'Kritik nokta! Çarpan kilitlendi.';
    }

    window.ErisGameCrash = { render, animate, options: [['1.5','1.5× Otomatik'],['2.0','2.0× Otomatik'],['3.0','3.0× Otomatik'],['5.0','5.0× Otomatik']] };
})();
