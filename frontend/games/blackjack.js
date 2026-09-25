(() => {
    'use strict';
    
    function render(stageEl) {
        stageEl.innerHTML = `
            <div class="eg-bj-wrapper">
                <div class="eg-bj-table">
                    <div class="eg-bj-section eg-bj-dealer">
                        <div class="eg-bj-label">Krupiye (??)</div>
                        <div class="eg-bj-cards">
                            <div class="eg-bj-card card-back">🂠</div>
                            <div class="eg-bj-card">K♠</div>
                        </div>
                    </div>
                    <div class="eg-bj-divider"></div>
                    <div class="eg-bj-section eg-bj-player">
                        <div class="eg-bj-label">Oyuncu (21)</div>
                        <div class="eg-bj-cards">
                            <div class="eg-bj-card animate-deal">A♥</div>
                            <div class="eg-bj-card animate-deal">K♦</div>
                        </div>
                    </div>
                </div>
                <div class="eg-bj-status">Kartlar dağıtıldı. Kararını ver!</div>
            </div>
            <style>
                .eg-bj-wrapper {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    position: relative; width: 100%; height: 100%; min-height: 220px;
                }
                .eg-bj-table {
                    width: 90%; max-width: 280px; background: radial-gradient(circle, #0f4c3a 0%, #06231a 100%);
                    border-radius: 18px; border: 4px solid #c5a059; padding: 12px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.6), inset 0 0 15px rgba(0,0,0,0.5);
                }
                .eg-bj-section { display: flex; flex-direction: column; align-items: center; margin: 4px 0; }
                .eg-bj-label { font-size: 11px; font-weight: 700; color: #e2c074; margin-bottom: 4px; }
                .eg-bj-cards { display: flex; gap: 8px; }
                .eg-bj-card {
                    width: 36px; height: 50px; background: #fff; color: #111; border-radius: 6px;
                    font-weight: 800; font-size: 13px; display: grid; place-items: center;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.4); border: 1px solid #ddd;
                }
                .eg-bj-card.card-back { background: #b22222; color: #ffd700; font-size: 16px; }
                .eg-bj-divider { width: 100%; height: 1px; background: rgba(197, 160, 89, 0.3); margin: 6px 0; }
                .eg-bj-status { margin-top: 10px; font-weight: 700; color: #ffd700; font-size: 12px; text-align: center; }
                @keyframes cardDeal {
                    0% { transform: translateY(-30px) scale(0.8); opacity: 0; }
                    100% { transform: translateY(0) scale(1); opacity: 1; }
                }
                .animate-deal { animation: cardDeal 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            </style>
        `;
    }

    async function animate(stageEl, data) {
        const status = stageEl.querySelector('.eg-bj-status');
        const playerSec = stageEl.querySelector('.eg-bj-player .eg-bj-cards');
        if (!status) return;

        status.textContent = 'Kartlar çekiliyor...';
        await new Promise(r => setTimeout(r, 800));

        if (data && data.newCard) {
            const cardEl = document.createElement('div');
            cardEl.className = 'eg-bj-card animate-deal';
            cardEl.textContent = data.newCard;
            playerSec.appendChild(cardEl);
        }

        status.textContent = '🏆 ' + (data.result || 'El Tamamlandı!');
    }

    window.ErisGameBlackjack = { render, animate, options: [['hit','Kart Çek (Hit)'],['stand','Pas Geç (Stand)'],['double','İkiye Katla (Double)']] };
})();
