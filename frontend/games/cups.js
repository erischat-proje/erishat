(() => {
    'use strict';
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-cups-wrapper">
                <div class="eg-cups-container">
                    <div class="eg-cup" data-index="0"><div class="eg-cup-top">🏆</div><div class="eg-cup-body"></div></div>
                    <div class="eg-cup" data-index="1"><div class="eg-cup-top"></div><div class="eg-cup-body"></div></div>
                    <div class="eg-cup" data-index="2"><div class="eg-cup-top"></div><div class="eg-cup-body"></div></div>
                </div>
                <div class="eg-cups-status">Kupalar karıştırıldı. Doğru kupayı seç!</div>
            </div>
            <style>
                .eg-cups-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; min-height: 240px; }
                .eg-cups-container { display: flex; gap: 28px; align-items: center; justify-content: center; height: 120px; }
                .eg-cup { display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.3s ease; position: relative; }
                .eg-cup:hover { transform: translateY(-10px); }
                .eg-cup-top { width: 54px; height: 54px; background: linear-gradient(135deg, #f1c40f, #d4ac0d); border-radius: 50% 50% 12% 12%; box-shadow: 0 8px 20px rgba(241,196,15,0.5); display: grid; place-items: center; font-size: 22px; border: 2px solid #fff; transform: translateY(16px); z-index: 2; }
                .eg-cup-body { width: 70px; height: 60px; background: linear-gradient(135deg, #3498db, #2980b9); border-radius: 12px 12% 40% 40%; box-shadow: 0 10px 25px rgba(52,152,219,0.5); border: 2px solid rgba(255,255,255,0.35); }
                .eg-cups-status { margin-top: 16px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center; }
            </style>
        `;
    }
    async function animate(stageEl, data) {
        const status = stageEl.querySelector('.eg-cups-status');
        const cups = stageEl.querySelectorAll('.eg-cup');
        if (!status) return;
        status.textContent = '🥤 Kupalar gizemli bir şekilde yer değiştiriyor...';
        for (let i = 0; i < 4; i++) {
            cups.forEach(c => c.style.transform = `translateX(${(Math.random() - 0.5) * 35}px) translateY(${Math.random() * -12}px)`);
            await new Promise(r => setTimeout(r, 250));
        }
        cups.forEach(c => c.style.transform = 'none');
        const winningIndex = data && data.winningIndex !== undefined ? data.winningIndex : 0;
        cups.forEach((c, idx) => {
            const top = c.querySelector('.eg-cup-top');
            top.textContent = idx === winningIndex ? '💎' : '❌';
            if (idx === winningIndex) c.style.transform = 'translateY(-18px) scale(1.05)';
        });
        status.textContent = '🎉 ' + (data.result || 'Doğru kupayı buldun, ödül senin!');
    }
    window.ErisGameCups = { render, animate, options: [['cup1','1. Kupa'],['cup2','2. Kupa'],['cup3','3. Kupa']] };
})();
