(() => {
    'use strict';
    
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-cups-wrapper">
                <div class="eg-cups-container">
                    <div class="eg-cup" data-index="0">
                        <div class="eg-cup-top">🏆</div>
                        <div class="eg-cup-body"></div>
                    </div>
                    <div class="eg-cup" data-index="1">
                        <div class="eg-cup-top"></div>
                        <div class="eg-cup-body"></div>
                    </div>
                    <div class="eg-cup" data-index="2">
                        <div class="eg-cup-top"></div>
                        <div class="eg-cup-body"></div>
                    </div>
                </div>
                <div class="eg-cups-status">Ödüllü kupayı seç veya tahminini yap!</div>
            </div>
            <style>
                .eg-cups-wrapper {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    position: relative; width: 100%; height: 100%; min-height: 220px;
                }
                .eg-cups-container {
                    display: flex; gap: 24px; align-items: center; justify-content: center; height: 110px;
                }
                .eg-cup {
                    display: flex; flex-direction: column; align-items: center; cursor: pointer;
                    transition: transform 0.3s ease; position: relative;
                }
                .eg-cup:hover { transform: translateY(-8px); }
                .eg-cup-top {
                    width: 50px; height: 50px; background: linear-gradient(135deg, #f1c40f, #d4ac0d);
                    border-radius: 50% 50% 10% 10%; box-shadow: 0 6px 15px rgba(241, 196, 15, 0.4);
                    display: grid; place-items: center; font-size: 20px; border: 2px solid #fff;
                    transform: translateY(15px); z-index: 2;
                }
                .eg-cup-body {
                    width: 65px; height: 55px; background: linear-gradient(135deg, #3498db, #2980b9);
                    border-radius: 10px 10% 40% 40%; box-shadow: 0 8px 20px rgba(52, 152, 219, 0.4);
                    border: 2px solid rgba(255,255,255,0.3);
                }
                .eg-cups-status {
                    margin-top: 16px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center;
                }
            </style>
        `;
    }

    async function animate(stageEl, data) {
        const status = stageEl.querySelector('.eg-cups-status');
        const cups = stageEl.querySelectorAll('.eg-cup');
        if (!status) return;

        status.textContent = 'Kupalar karıştırılıyor...';
        
        // Karıştırma efekti
        for (let i = 0; i < 3; i++) {
            cups.forEach(c => c.style.transform = `translateX(${(Math.random() - 0.5) * 30}px) translateY(${Math.random() * -10}px)`);
            await new Promise(r => setTimeout(r, 300));
        }
        cups.forEach(c => c.style.transform = 'none');

        const winningIndex = data && data.winningIndex !== undefined ? data.winningIndex : 0;
        cups.forEach((c, idx) => {
            const top = c.querySelector('.eg-cup-top');
            top.textContent = idx === winningIndex ? '💎' : '❌';
            if (idx === winningIndex) c.style.transform = 'translateY(-15px)';
        });

        status.textContent = '✨ ' + (data.result || 'Doğru kupayı buldun!');
    }

    window.ErisGameCups = { render, animate, options: [['cup1','1. Kupa'],['cup2','2. Kupa'],['cup3','3. Kupa']] };
})();
