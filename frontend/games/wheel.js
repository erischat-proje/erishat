(() => {
    'use strict';
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-wheel-wrapper">
                <div class="eg-wheel-pointer">▼</div>
                <div class="eg-wheel-disk">
                    <div class="eg-wheel-slice s1"></div><div class="eg-wheel-slice s2"></div>
                    <div class="eg-wheel-slice s3"></div><div class="eg-wheel-slice s4"></div>
                    <div class="eg-wheel-slice s5"></div>
                    <div class="eg-wheel-center">🎡</div>
                </div>
                <div class="eg-wheel-status">Şansını dene, büyük ödülü kazan!</div>
            </div>
            <style>
                .eg-wheel-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; min-height: 240px; }
                .eg-wheel-pointer { position: absolute; top: 10px; z-index: 10; font-size: 26px; color: #ff3838; text-shadow: 0 0 12px rgba(255,56,56,0.9); animation: pointerPulse 1s ease-in-out infinite alternate; }
                @keyframes pointerPulse { 0% { transform: translateY(0); } 100% { transform: translateY(-4px); } }
                .eg-wheel-disk { width: 160px; height: 160px; border-radius: 50%; position: relative; background: conic-gradient(#ff4757 0deg 72deg, #2ed573 72deg 144deg, #ffa502 144deg 216deg, #3742fa 216deg 288deg, #9b59b6 288deg 360deg); border: 6px solid #fff; box-shadow: 0 0 40px rgba(138,92,255,0.7), inset 0 0 25px rgba(0,0,0,0.7); transition: transform 3.5s cubic-bezier(0.1, 0.8, 0.1, 1); display: grid; place-items: center; }
                .eg-wheel-center { width: 44px; height: 44px; background: linear-gradient(135deg, #181028, #2a1b4e); border-radius: 50%; display: grid; place-items: center; font-size: 20px; border: 2px solid #ffd700; box-shadow: 0 4px 15px rgba(0,0,0,0.8); }
                .eg-wheel-status { margin-top: 16px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }
            </style>
        `;
    }
    async function animate(stageEl, data) {
        const disk = stageEl.querySelector('.eg-wheel-disk');
        const status = stageEl.querySelector('.eg-wheel-status');
        if (!disk) return;
        status.textContent = '🎡 Çark büyük bir heyecanla dönüyor...';
        disk.style.transform = `rotate(${2160 + Math.random() * 720}deg)`;
        await new Promise(r => setTimeout(r, 3500));
        status.textContent = '🎉 Muhteşem Ödül: ' + (data.result || 'Büyük Ödül');
    }
    window.ErisGameWheel = { render, animate, options: [['small','Küçük Ödül'],['medium','Orta Ödül'],['large','Büyük Ödül'],['special','Özel İkramiye'],['grand','Grand Jackpot']] };
})();
