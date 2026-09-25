(() => {
    'use strict';
    
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-wheel-wrapper">
                <div class="eg-wheel-pointer">▼</div>
                <div class="eg-wheel-disk">
                    <div class="eg-wheel-slice s1"></div>
                    <div class="eg-wheel-slice s2"></div>
                    <div class="eg-wheel-slice s3"></div>
                    <div class="eg-wheel-slice s4"></div>
                    <div class="eg-wheel-slice s5"></div>
                    <div class="eg-wheel-center">🎡</div>
                </div>
                <div class="eg-wheel-status">Çevirmek için oyna butonuna bas!</div>
            </div>
            <style>
                .eg-wheel-wrapper {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    position: relative; padding: 20px; width: 100%; height: 100%; min-height: 220px;
                }
                .eg-wheel-pointer {
                    position: absolute; top: 12px; z-index: 10; font-size: 24px; color: #ff4757;
                    text-shadow: 0 2px 8px rgba(255, 71, 87, 0.6);
                }
                .eg-wheel-disk {
                    width: 150px; height: 150px; border-radius: 50%; position: relative;
                    background: conic-gradient(#ff4757 0deg 72deg, #2ed573 72deg 144deg, #ffa502 144deg 216deg, #3742fa 216deg 288deg, #9b59b6 288deg 360deg);
                    border: 6px solid #fff; box-shadow: 0 0 35px rgba(124, 78, 228, 0.5), inset 0 0 20px rgba(0,0,0,0.6);
                    transition: transform 3s cubic-bezier(0.15, 0.85, 0.15, 1); display: grid; place-items: center;
                }
                .eg-wheel-center {
                    width: 40px; height: 40px; background: #181028; border-radius: 50%;
                    display: grid; place-items: center; font-size: 18px; border: 2px solid #fff;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                }
                .eg-wheel-status {
                    margin-top: 14px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center;
                }
            </style>
        `;
    }

    async function animate(stageEl, data) {
        const disk = stageEl.querySelector('.eg-wheel-disk');
        const status = stageEl.querySelector('.eg-wheel-status');
        if (!disk) return;

        status.textContent = 'Şans çarkı dönüyor...';
        const rotations = 1800 + Math.random() * 360;
        disk.style.transform = `rotate(${rotations}deg)`;
        
        await new Promise(r => setTimeout(r, 3000));
        status.textContent = '🎉 Kazanan Ödül: ' + (data.result || 'Büyük Ödül');
    }

    window.ErisGameWheel = { render, animate, options: [['small','Küçük'],['medium','Orta'],['large','Büyük'],['special','Özel'],['grand','Büyük Ödül']] };
})();
