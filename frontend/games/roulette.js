(() => {
    'use strict';
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-roulette-wrapper">
                <div class="eg-roulette-wheel">
                    <div class="eg-roulette-ball">⚪</div>
                    <div class="eg-roulette-center">🎯</div>
                </div>
                <div class="eg-roulette-status">Rulet çarkı dönüyor, top hızla sekiyor...</div>
            </div>
            <style>
                .eg-roulette-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; min-height: 240px; }
                .eg-roulette-wheel { width: 160px; height: 160px; border-radius: 50%; position: relative; background: conic-gradient(#e74c3c 0deg 19.47deg, #2c3e50 19.47deg 38.94deg, #e74c3c 38.94deg 58.41deg, #2c3e50 58.41deg 77.88deg, #e74c3c 77.88deg 97.35deg, #2c3e50 97.35deg 116.82deg, #e74c3c 116.82deg 136.29deg, #2c3e50 136.29deg 155.76deg, #27ae60 155.76deg 160deg, #e74c3c 160deg 179.47deg, #2c3e50 179.47deg 198.94deg, #e74c3c 198.94deg 218.41deg, #2c3e50 218.41deg 237.88deg, #e74c3c 237.88deg 257.35deg, #2c3e50 257.35deg 276.82deg, #e74c3c 276.82deg 296.29deg, #2c3e50 296.29deg 315.76deg, #e74c3c 315.76deg 335.23deg, #2c3e50 335.23deg 354.7deg, #27ae60 354.7deg 360deg); border: 6px solid #d4af37; box-shadow: 0 0 35px rgba(212,175,55,0.5), inset 0 0 20px rgba(0,0,0,0.7); transition: transform 3.8s cubic-bezier(0.1, 0.8, 0.1, 1); display: grid; place-items: center; }
                .eg-roulette-ball { position: absolute; top: 12px; font-size: 11px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.9)); animation: ballOrbit 1s linear infinite; }
                @keyframes ballOrbit { 0% { transform: rotate(0deg) translateY(60px) rotate(0deg); } 100% { transform: rotate(360deg) translateY(60px) rotate(-360deg); } }
                .eg-roulette-center { width: 42px; height: 42px; background: #1a1a2e; border-radius: 50%; display: grid; place-items: center; font-size: 18px; border: 2px solid #d4af37; box-shadow: 0 4px 12px rgba(0,0,0,0.6); z-index: 5; }
                .eg-roulette-status { margin-top: 16px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center; }
            </style>
        `;
    }
    async function animate(stageEl, data) {
        const wheel = stageEl.querySelector('.eg-roulette-wheel');
        const status = stageEl.querySelector('.eg-roulette-status');
        const ball = stageEl.querySelector('.eg-roulette-ball');
        if (!wheel) return;
        status.textContent = '🎯 Rulet çarkı dönüyor, top duruyor...';
        wheel.style.transform = `rotate(${2520 + Math.random() * 720}deg)`;
        await new Promise(r => setTimeout(r, 3800));
        if (ball) ball.style.animation = 'none';
        status.textContent = '✨ Kazanan Sayı / Renk: ' + (data.result || 'Kırmızı 18');
    }
    window.ErisGameRoulette = { render, animate, options: [['red','Kırmızı (Red)'],['black','Siyah (Black)'],['green','Yeşil (0)'],['even','Çift (Even)'],['odd','Tek (Odd)']] };
})();
