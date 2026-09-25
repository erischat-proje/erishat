(() => {
    'use strict';
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-bj-wrapper">
                <div class="eg-bj-table">
                    <div class="eg-bj-section">
                        <div class="eg-bj-label">Krupiye Masa</div>
                        <div class="eg-bj-cards">
                            <div class="eg-bj-card card-back">🂠</div>
                            <div class="eg-bj-card">K♠</div>
                        </div>
                    </div>
                    <div class="eg-bj-divider"></div>
                    <div class="eg-bj-section">
                        <div class="eg-bj-label">Senin Elin</div>
                        <div class="eg-bj-cards">
                            <div class="eg-bj-card animate-deal">A♥</div>
                            <div class="eg-bj-card animate-deal">K♦</div>
                        </div>
                    </div>
                </div>
                <div class="eg-bj-status">Masaya oturdun. Kararını ver!</div>
            </div>
            <style>
                .eg-bj-wrapper { display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; min-height: 240px; }
                .eg-bj-table { width: 92%; max-width: 300px; background: radial-gradient(circle, #0b533e 0%, #031b12 100%); border-radius: 20px; border: 4px solid #d4af37; padding: 14px; box-shadow: 0 12px 30px rgba(0,0,0,0.7), inset 0 0 20px rgba(0,0,0,0.6); }
                .eg-bj-section { display: flex; flex-direction: column; align-items: center; margin: 4px 0; }
                .eg-bj-label { font-size: 11px; font-weight: 700; color: #f3e5ab; margin-bottom: 6px; letter-spacing: 0.5px; }
                .eg-bj-cards { display: flex; gap: 10px; }
                .eg-bj-card { width: 38px; height: 54px; background: linear-gradient(135deg, #ffffff, #e0e0e0); color: #1a1a1a; border-radius: 8px; font-weight: 800; font-size: 13px; display: grid; place-items: center; box-shadow: 0 6px 15px rgba(0,0,0,0.5); border: 1px solid #ccc; }
                .eg-bj-card.card-back { background: linear-gradient(135deg, #c0392b, #962d22); color: #f1c40f; font-size: 18px; border-color: #e74c3c; }
                .eg-bj-divider { width: 100%; height: 1px; background: rgba(212, 175, 55, 0.4); margin: 8px 0; }
                .eg-bj-status { margin-top: 12px; font-weight: 700; color: #ffd700; font-size: 13px; text-align: center; }
                @keyframes cardDeal { 0% { transform: translateY(-35px) scale(0.7); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
                .animate-deal { animation: cardDeal 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            </style>
        `;
    }
    async function animate(stageEl, data) {
        const status = stageEl.querySelector('.eg-bj-status');
        const playerSec = stageEl.querySelector('.eg-bj-section:last-child .eg-bj-cards');
        if (!status) return;
        status.textContent = '🃏 Kartlar dağıtılıyor...';
        await new Promise(r => setTimeout(r, 700));
        if (data && data.newCard) {
            const cardEl = document.createElement('div');
            cardEl.className = 'eg-bj-card animate-deal';
            cardEl.textContent = data.newCard;
            playerSec.appendChild(cardEl);
        }
        status.textContent = '🏆 El Sonucu: ' + (data.result || 'Tamamlandı');
    }
    window.ErisGameBlackjack = { render, animate, options: [['hit','Kart Çek (Hit)'],['stand','Pas (Stand)'],['double','İkiye Katla (Double)']] };
})();
