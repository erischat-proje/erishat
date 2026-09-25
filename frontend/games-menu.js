(() => {
    'use strict';
    
    // 7 Oyunun ana sayfa ve menü entegrasyon listesi
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
                    .eg-launcher-card { background: linear-gradient(145deg, #221836, #140e21); border: 1px solid rgba(138,92,255,0.3); border-radius: 16px; padding: 14px 10px; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer; transition: all 0.3s ease; color: white; }
                    .eg-launcher-card:hover { transform: translateY(-4px); border-color: #a77aff; box-shadow: 0 10px 25px rgba(138,92,255,0.35); background: linear-gradient(145deg, #31224f, #1a112c); }
                    .eg-lc-icon { font-size: 28px; margin-bottom: 6px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5)); }
                    .eg-lc-title { font-weight: 700; font-size: 13px; color: #ffd700; margin-bottom: 4px; }
                    .eg-lc-desc { font-size: 10px; color: rgba(255,255,255,0.65); line-height: 1.2; }
                </style>
            `;
            containerEl.querySelectorAll('.eg-launcher-card').forEach(btn => {
                btn.onclick = () => {
                    const gameId = btn.dataset.game;
                    if (window.ErisChatGames && typeof window.ErisChatGames.open === 'function') {
                        window.ErisChatGames.open('main', null, gameId);
                    }
                };
            });
        }
    };
})();
