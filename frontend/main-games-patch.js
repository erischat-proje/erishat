(() => {
    'use strict';
    
    function patchGameSections() {
        // Tüm oyun kartlarını veya tetikleyicilerini bulup doğrudan ErisChatGames.open bağlayalım
        const cards = document.querySelectorAll('.eg-launcher-card, [data-game], .games-section-grid .game-card, .game-item');
        cards.forEach(card => {
            if (!card.dataset.hasDirectListener) {
                card.dataset.hasDirectListener = "true";
                card.style.cursor = "pointer";
                card.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const gameId = card.dataset.game || card.getAttribute('data-game');
                    if (gameId && typeof window.ErisChatGames === 'object' && typeof window.ErisChatGames.open === 'function') {
                        window.ErisChatGames.open('main', null, gameId);
                    } else if (window.ErisGamesMenuConfig && typeof window.ErisGamesMenuConfig.renderLauncher === 'function') {
                        const containers = document.querySelectorAll('.eg-launcher-container, [data-games-grid], .games-section-grid');
                        containers.forEach(c => window.ErisGamesMenuConfig.renderLauncher(c));
                    }
                });
            }
        });

        // Standart renderLauncher çağrıları
        const containers = document.querySelectorAll('.eg-launcher-container, [data-games-grid], .games-section-grid');
        containers.forEach(container => {
            if (window.ErisGamesMenuConfig && typeof window.ErisGamesMenuConfig.renderLauncher === 'function') {
                window.ErisGamesMenuConfig.renderLauncher(container);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patchGameSections);
    } else {
        patchGameSections();
    }
    setTimeout(patchGameSections, 1000);
    setInterval(patchGameSections, 2000);
})();
