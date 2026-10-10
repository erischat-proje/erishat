(() => {
    'use strict';

    const ALL_GAMES = [
        { id: 'wheel', name: 'Şans Çarkı', icon: '🎡', desc: 'Çarkı çevir, büyük ödülü kap!' },
        { id: 'crash', name: 'Crash', icon: '🚀', desc: 'Çarpanlar yükselmeden roketten atla!' },
        { id: 'blackjack', name: 'Blackjack', icon: '🃏', desc: '21 e en yakın eli topla, krupiyeyi alt et.' },
        { id: 'slot', name: 'Slot', icon: '🎰', desc: '3 aynı sembolü yakala, Lidya kazan!' },
        { id: 'cups', name: 'Dört Kupa', icon: '🥤', desc: 'Gizemli kupanın altındaki altını bul.' },
        { id: 'horse_race', name: 'At Yarışı', icon: '🐎', desc: 'Favori atına oyna, pistin kralı ol.' },
        { id: 'vault', name: 'Kasa', icon: '🎁', desc: 'Hazine kasalarını seç, büyük ikramiyeyi kazan.' }
    ];

    const ART={
      wheel:'<circle cx="32" cy="28" r="21"/><circle cx="32" cy="28" r="5"/><path d="M32 7v16m0 10v16M11 28h16m10 0h16M17 13l11 11m8 8 11 11M17 43l11-11m8-8 11-11M26 49l-7 10h26l-7-10"/>',
      crash:'<path d="M24 38C22 21 39 10 53 9c-1 15-12 31-29 29Z M26 36l-9 5-2-10 9-7M29 39l-5 10 10 1 7-15M20 44l-9 9m12-5-5 10"/><circle cx="40" cy="22" r="5"/>',
      blackjack:'<rect x="10" y="12" width="29" height="40" rx="5" transform="rotate(-12 24 32)"/><rect x="25" y="10" width="29" height="42" rx="5" fill="var(--eg-panel)"/><path d="M40 20c-13 12-11 18 0 14 11 4 13-2 0-14Z M40 33v9m-5 0h10"/>',
      slot:'<rect x="6" y="13" width="48" height="40" rx="7"/><path d="M6 23h48M6 43h48M22 23v20M38 23v20M54 29h6V15"/><circle cx="60" cy="12" r="3"/><path d="M11 29h6l-4 8M27 29h6l-4 8M43 29h6l-4 8"/>',
      cups:'<path d="M4 21h12l-2 23H6Z M19 16h12l-2 28h-8Z M34 21h12l-2 23H36Z M49 16h12l-2 28h-8Z M5 21c0-4 10-4 11 0M20 16c0-4 10-4 11 0M35 21c0-4 10-4 11 0M50 16c0-4 10-4 11 0"/><circle cx="32" cy="54" r="4"/>',
      horse_race:'<path d="m20 17 7-10 4 5 8-2 12 10-3 7-10-5-4 11 7 10 9 2-2 8H35l-8-13-9 4-4 12H7l4-20 7-12Z M38 14l-6-2M23 17l-8 6-5-3M8 29l-5 7"/><circle cx="43" cy="19" r="1"/>',
      vault:'<rect x="8" y="10" width="48" height="44" rx="7"/><rect x="14" y="16" width="36" height="32" rx="4"/><circle cx="32" cy="32" r="9"/><path d="M32 23v18M23 32h18M19 22v7M19 36v7M14 54v5M50 54v5"/>'
    };
    const TONES={wheel:'#c7a6f7',crash:'#efa794',blackjack:'#94c9ed',slot:'#e4c27d',cups:'#9ddbcc',horse_race:'#b8b0f0',vault:'#edc78b'};
    window.ErisGamesMenuConfig = {
        games: ALL_GAMES,
        renderLauncher(containerEl) {
            if (!containerEl) return;
            containerEl.innerHTML = `
                <div class="eg-launcher-grid">
                    ${ALL_GAMES.map(g => `
                        <button type="button" class="eg-launcher-card" data-game="${g.id}" style="--eg-tone:${TONES[g.id]};--eg-panel:#201b2b">
                            <div class="eg-lc-icon" aria-hidden="true"><svg viewBox="0 0 64 64">${ART[g.id]}</svg></div>
                            <div class="eg-lc-title">${g.name}</div>
                            <div class="eg-lc-desc">${g.desc}</div><span class="eg-lc-play" aria-hidden="true">Oyna <span>→</span></span>
                        </button>
                    `).join('')}
                </div>
                <style>
                    .eg-launcher-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:4px 0 24px;width:100%;box-sizing:border-box}
                    .eg-launcher-grid .eg-launcher-card{display:flex;flex-direction:column;align-items:flex-start;min-width:0;position:relative;box-sizing:border-box;min-height:220px;border:1px solid #b69dcc2b;border-radius:24px;padding:20px;text-align:left;color:#fff;background:radial-gradient(circle at 90% 5%,#8a689e1c,transparent 65%),linear-gradient(140deg,#211929,#121019);cursor:pointer;overflow:hidden}
                    .eg-launcher-card .eg-lc-icon{display:grid;place-items:center;width:66px;height:66px;border-radius:20px;background:#ffffff06;border:1px solid #ffffff0a;margin-bottom:16px;color:var(--eg-tone)}
                    .eg-lc-icon svg{width:49px;height:49px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
                    .eg-launcher-card .eg-lc-title{font:800 17px/1.4 var(--eris-font,Manrope,system-ui);margin-bottom:6px;overflow-wrap:anywhere}
                    .eg-launcher-card .eg-lc-desc{font:13px/1.6 var(--eris-font,Manrope,system-ui);color:#b4a4c0;margin-bottom:16px;overflow-wrap:anywhere}
                    .eg-lc-play{display:flex;justify-content:space-between;width:100%;gap:8px;margin-top:auto;padding-top:12px;border-top:1px solid #ffffff0c;color:var(--eg-tone);font:700 12px/1.4 system-ui}
                    .eg-launcher-card:last-child:nth-child(odd){grid-column:1/-1}
                    .eg-launcher-card:focus-visible{outline:2px solid var(--eg-tone);outline-offset:3px}.eg-launcher-card:active{border-color:var(--eg-tone);background:#2c2038}
                    @media(max-width:360px){.eg-launcher-grid{gap:10px}.eg-launcher-grid .eg-launcher-card{padding:15px;border-radius:20px;min-height:226px}.eg-launcher-card .eg-lc-title{font-size:15px}.eg-launcher-card .eg-lc-desc{font-size:12px}.eg-launcher-card .eg-lc-icon{width:54px;height:54px;border-radius:16px}.eg-lc-icon svg{width:42px;height:42px}}
                    @media(min-width:800px){.eg-launcher-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.eg-launcher-card:last-child:nth-child(odd){grid-column:auto}}
                    @media(max-width:290px){.eg-launcher-grid{grid-template-columns:1fr}.eg-launcher-card:last-child:nth-child(odd){grid-column:auto}}
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
