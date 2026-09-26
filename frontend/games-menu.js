(() => {
    'use strict';

    const ALL_GAMES = [
        { id: 'wheel', name: 'Şans Çarkı', icon: '🎡', desc: 'Çarkı çevir, büyük ödülü kap!' },
        { id: 'crash', name: 'Crash', icon: '🚀', desc: 'Çarpanlar yükselmeden roketten atla!' },
        { id: 'blackjack', name: 'Blackjack', icon: '🃏', desc: '21 e en yakın eli topla, krupiyeyi alt et.' },
        { id: 'roulette', name: 'Rulet', icon: '🎰', desc: 'Şanslı rengi veya sayıyı tahmin et.' },
        { id: 'cups', name: 'Dört Kupa', icon: '🥤', desc: 'Gizemli kupanın altındaki altını bul.' },
        { id: 'horse_race', name: 'At Yarışı', icon: '🐎', desc: 'Favori atına oyna, pistin kralı ol.' },
        { id: 'vault', name: 'Kasa', icon: '🎁', desc: 'Hazine kasalarını seç, büyük ikramiyeyi kazan.' }
    ];

    window.ErisGamesMenuConfig = {
        games: ALL_GAMES,
        renderLauncher(containerEl) {
            if (!containerEl) return;
            containerEl.innerHTML = `
                <div class="eg-launcher-grid">
                    ${ALL_GAMES.map(g => `
                        <button class="eg-launcher-card" data-game="${g.id}">
                            <div class="eg-lc-icon">${g.icon}</div>
                            <div class="eg-lc-title">${g.name}</div>
                            <div class="eg-lc-desc">${g.desc}</div>
                        </button>
                    `).join('')}
                </div>
                <style>
                    .eg-launcher-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; padding: 10px; width: 100%; }
                    .eg-launcher-card { background: #1a1625; border: 1px solid #ffffff14; border-radius: 14px; padding: 14px; text-align: left; color: #fff; cursor: pointer; transition: all 0.2s; }
                    .eg-launcher-card:hover { border-color: #a855f7; transform: translateY(-2px); background: #221c33; }
                    .eg-lc-icon { font-size: 24px; margin-bottom: 8px; }
                    .eg-lc-title { font-weight: bold; font-size: 13px; margin-bottom: 4px; }
                    .eg-lc-desc { font-size: 10px; color: #938a9f; line-height: 1.3; }
                </style>
            `;

            if (!containerEl.dataset.hasClickListener) {
                containerEl.dataset.hasClickListener = "true";
                containerEl.addEventListener("click", (e) => {
                    const card = e.target.closest(".eg-launcher-card");
                    if (!card) return;
                    const gameId = card.dataset.game;
                    if (gameId && typeof window.ErisChatGames === 'object' && typeof window.ErisChatGames.open === 'function') {
                        window.ErisChatGames.open(document.getElementById('erisRoomSurface')?.classList.contains('show') ? 'room' : 'main', window.ErisCurrentRoomId || window.currentRoomId || null, gameId);
                    }
                });
            }
        }
    };
})();
