(() => {
    'use strict';
    
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-roulette-wrapper">
                <div class="eg-roulette-wheel">
                    <div class="eg-roulette-ball">⚪</div>
                    <div class="eg-roulette-center">🎯</div>
                </div>
                <div class="eg-roulette-status">Bahisler yapıldı, çark dönüyor...</div>
            </div>
            <style>
                .eg-roulette-wrapper {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    position: relative; width: 100%; height: 100%; min-height: 220px;
                }
                .eg-roulette-wheel {
                    width: 150px; height: 150px; border-radius: 50%; position: relative;
                    background: conic-gradient(
                        #e74c3c 0deg 19.47deg, #2c3e50 19.47deg 38.94deg, 
                        #e74c3c 38.94deg 58.41deg, #2c3e50 58.41deg 77.88deg,
                        #e74c3c 77.88deg 97.35deg, #2c3e50 97.35deg 116.82deg,
                        #e74c3c 116.82deg 136.29deg, #2c3e50 136.29deg 155.76deg,
                        #27ae60 155.76deg 160deg, #e74c3c 160deg 179.47deg,
                        #2c3e50 179.47deg 198.94deg, #e74c3c 198.94deg 218.41deg,
                        #2c3e50 218.41deg 237.88deg, #e74c3c 237.88deg 257.35deg,
                        #2c3e50 257.35deg 276.82deg, #e74c3c 276.82deg 296.29deg,
                        #2c3e50 296.29deg 315.76deg, #e74c3c 315.76deg 335.23deg,
                        #2c3e50 335.23deg 354.7deg, #27ae60 354.7deg 360deg
                    );
                    border: 6px solid #d4af37; box-shadow: 0 0 30px rgba(212, 175, 55, 0.4), inset 0 0 15px rgba(0,0,0,0.6);
                    transition: transform 3.5s cubic-bezier(0.15, 0.85, 0.15, 1); display: grid; place-items: center;
                }
                .eg-roulette-ball {
                    position: absolute; top: 10px; font-size: 10px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
                    animation: ballOrbit 1.2s linear infinite;
                }
                @keyframes ballOrbit {
                    0% { transform: rotate(0deg) translateY(55px) rotate(0deg); }
                    100% { transform: rotate(360deg) translateY(55px) rotate(-360deg); }
                }
                .eg-roulette-center {
                    width: 38px; height: 38px; background: #1a1a2e; border-radius: 50%;
                    display: grid; place-items: center; font-size: 16px; border: 2px solid #d4af37;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 5;
                }
                .eg-roulette-status {
                    margin-top: 14px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center;
                }
            </style>
        `;
    }

    async function animate(stageEl, data) {
        const wheel = stageEl.querySelector('.eg-roulette-wheel');
        const status = stageEl.querySelector('.eg-roulette-status');
        const ball = stageEl.querySelector('.eg-roulette-ball');
        if (!wheel) return;

        status.textContent = 'Top dönüyor...';
        const rotations = 2160 + Math.random() * 360;
        wheel.style.transform = `rotate(${rotations}deg)`;
        
        await new Promise(r => setTimeout(r, 3500));
        if (ball) ball.style.animation = 'none';
        status.textContent = '🎯 Sonuç: ' + (data.result || 'Kırmızı 18');
    }

    window.ErisGameRoulette = { render, animate, options: [['red','Kırmızı'],['black','Siyah'],['green','Yeşil (0)'],['even','Çift'],['odd','Tek']] };
})();
