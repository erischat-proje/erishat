(() => {
    'use strict';
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-vault-wrapper">
                <div class="eg-vault-grid">
                    <div class="eg-vault-box active" data-id="box1"><div class="eg-vault-icon">🎁</div></div>
                    <div class="eg-vault-box" data-id="box2"><div class="eg-vault-icon">🎁</div></div>
                    <div class="eg-vault-box" data-id="box3"><div class="eg-vault-icon">🎁</div></div>
                </div>
                <div class="eg-vault-status">Gizemli hazine kasası seçildi, açılıyor...</div>
            </div>
            <style>
                .eg-vault-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; min-height: 240px; }
                .eg-vault-grid { display: flex; gap: 18px; align-items: center; justify-content: center; }
                .eg-vault-box { width: 70px; height: 70px; border-radius: 18px; background: linear-gradient(145deg, #2a1b4e, #180f2e); border: 2px solid rgba(166,140,255,0.35); display: grid; place-items: center; font-size: 30px; box-shadow: 0 12px 25px rgba(0,0,0,0.6); transition: all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                .eg-vault-box.active { transform: translateY(-12px) scale(1.12); border-color: #a77aff; background: linear-gradient(145deg, #6236df, #43219e); box-shadow: 0 0 30px #a77aff; }
                .eg-vault-box.winner { transform: translateY(-16px) scale(1.2); border-color: #ffd700; background: linear-gradient(145deg, #f39c12, #d35400); box-shadow: 0 0 40px #f1c40f; }
                .eg-vault-status { margin-top: 16px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center; }
            </style>
        `;
    }
    async function animate(stageEl, data) {
        const status = stageEl.querySelector('.eg-vault-status');
        const boxes = stageEl.querySelectorAll('.eg-vault-box');
        if (!status) return;
        status.textContent = '🎁 Hazine kasaları taranıyor...';
        for (let i = 0; i < 14; i++) {
            boxes.forEach(b => b.classList.remove('active'));
            boxes[i % boxes.length].classList.add('active');
            await new Promise(r => setTimeout(r, 75));
        }
        boxes.forEach(b => b.classList.remove('active'));
        const winId = data && data.result ? data.result : 'box1';
        boxes.forEach(b => {
            if (b.dataset.id === winId || b === boxes[0]) {
                b.classList.add('winner');
                b.querySelector('.eg-vault-icon').textContent = '💎';
            }
        });
        status.textContent = '🎉 ' + (data.result || 'Kasa açıldı, büyük hazine senin!');
    }
    window.ErisGameVault = { render, animate, options: [['box1','1. Hazine Kasası'],['box2','2. Hazine Kasası'],['box3','3. Hazine Kasası']] };
})();
