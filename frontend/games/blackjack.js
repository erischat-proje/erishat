(() => {
    'use strict';

    const BLACKJACK_OPTIONS = [
        ['standard', 'Klasik Blackjack'],
        ['aggressive', 'Yüksek Bahis (High Roller)']
    ];

    const BlackjackGame = {
        options: BLACKJACK_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #0f291e 0%, #06120c 100%); border-radius:14px; border:1px solid rgba(34,197,94,0.3); padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                    <!-- Krupiye Alanı -->
                    <div style="text-align:center;">
                        <div style="font-size:10px; color:#86efac; font-weight:600; margin-bottom:4px;">KRUPİYE</div>
                        <div id="bjDealerCards" style="display:flex; justify-content:center; gap:6px; min-height:45px; align-items:center;">
                            <div style="background:#134e2f; border:1px solid #22c55e; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:bold; color:#fff;">🂠</div>
                            <div style="background:#134e2f; border:1px solid #22c55e; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:bold; color:#fff;">🂠</div>
                        </div>
                    </div>

                    <!-- Masa Ortası / Bilgi -->
                    <div style="text-align:center; font-size:12px; color:#facc15; font-weight:700; text-shadow:0 0 10px rgba(250,204,21,0.4);">
                        BLACKJACK 21 • Krupiyeyi Alt Et
                    </div>

                    <!-- Oyuncu Alanı -->
                    <div style="text-align:center;">
                        <div id="bjPlayerCards" style="display:flex; justify-content:center; gap:6px; min-height:45px; align-items:center;">
                            <div style="background:#134e2f; border:1px solid #22c55e; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:bold; color:#fff;">🂠</div>
                            <div style="background:#134e2f; border:1px solid #22c55e; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:bold; color:#fff;">🂠</div>
                        </div>
                        <div style="font-size:10px; color:#86efac; font-weight:600; margin-top:4px;">OYUNCU</div>
                    </div>
                </div>
            `;
        },

        async animate(container, data) {
            const playerBox = document.getElementById('bjPlayerCards');
            const dealerBox = document.getElementById('bjDealerCards');
            if (!playerBox || !dealerBox) return;

            const state = data?.state || data;
            const playerHand = state?.player_hand || ['A', '10'];
            const dealerHand = state?.dealer_hand || ['10', '?'];

            // Kartları profesyonelce ekrana yansıtma animasyonu
            playerBox.innerHTML = playerHand.map(c => `
                <div style="background:#134e2f; border:1px solid #22c55e; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:bold; color:#fff; transform:scale(0.8); animation: popIn 0.3s forwards;">${c}</div>
            `).join('');

            dealerBox.innerHTML = dealerHand.map(c => `
                <div style="background:#134e2f; border:1px solid #22c55e; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:bold; color:#fff; transform:scale(0.8); animation: popIn 0.3s forwards;">${c}</div>
            `).join('');

            return new Promise(resolve => setTimeout(resolve, 600));
        }
    };

    window.ErisGameBlackjack = BlackjackGame;
})();
