(() => {
    'use strict';
    // Ana sayfa ve oyun sekmesindeki statik kartları 7 oyunluk dinamik yapıya dönüştüren yama
    function patchGameSections() {
        const containers = document.querySelectorAll('.eg-launcher-container, [data-games-grid], .games-section-grid');
        containers.forEach(container => {
            if (window.ErisGamesMenuConfig && typeof window.ErisGamesMenuConfig.renderLauncher === 'function') {
                window.ErisGamesMenuConfig.renderLauncher(container);
            }
        });

        // Eski oda kısıtlaması metinlerini temizle
        document.querySelectorAll('*').forEach(el => {
            if (el.textContent && el.textContent.includes('oda içinde bulunur')) {
                el.innerHTML = 'Tüm oyunlar dilediğin an, odaya girmeden oynanabilir!';
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patchGameSections);
    } else {
        patchGameSections();
    }
    setTimeout(patchGameSections, 1000);
})();
