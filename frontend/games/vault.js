(() => {
    'use strict';

    const OPTIONS = [
        ['rare', '💠 Nadir · 2×'],
        ['epic', '💜 Destansı · 4×'],
        ['legendary', '👑 Efsanevi · 10×'],
        ['mythic', '🌟 Mitik · 20×']
    ];

    const STYLE_ID = 'erisVaultLiveStyle';

    function installStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .ev-scene {
                position:relative;
                width:100%;
                min-height:220px;
                padding:12px;
                box-sizing:border-box;
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                overflow:hidden;
                border-radius:18px;
                border:1px solid #a9894d;
                background:
                    radial-gradient(ellipse at 50% 100%,#9a6b3044,transparent 65%),
                    linear-gradient(155deg,#202532,#090d15);
            }
            .ev-title {
                color:#f8d993;
                font-size:11px;
                font-weight:900;
                letter-spacing:2px;
                margin-bottom:10px;
            }
            .ev-safe {
                width:170px;
                height:125px;
                position:relative;
                perspective:600px;
                filter:drop-shadow(0 15px 13px #0009);
            }
            .ev-body {
                position:absolute;
                inset:0;
                border:4px solid #d5ae61;
                border-radius:15px;
                background:linear-gradient(145deg,#485463,#131c29 60%,#080c13);
                box-shadow:inset 0 0 20px #000b;
            }
            .ev-inside {
                position:absolute;
                inset:13px;
                display:grid;
                place-items:center;
                color:#fbd67b;
                font-size:38px;
                background:radial-gradient(circle,#53401e,#080b12 70%);
                border-radius:8px;
            }
            .ev-door {
                position:absolute;
                inset:4px;
                display:grid;
                place-items:center;
                transform-origin:left center;
                transform-style:preserve-3d;
                border:3px solid #bfc8d0;
                border-radius:11px;
                background:linear-gradient(135deg,#687786,#293543 45%,#141b25 80%,#55616e);
                box-shadow:inset 0 0 18px #0009,4px 4px 12px #0008;
                transition:transform 2.5s cubic-bezier(.2,.65,.25,1);
                backface-visibility:hidden;
                z-index:2;
            }
            .ev-dial {
                width:68px;
                height:68px;
                display:grid;
                place-items:center;
                border:7px double #e4c27d;
                border-radius:50%;
                color:#ffe6a6;
                font-size:26px;
                background:radial-gradient(circle,#576370,#161e29);
                box-shadow:0 0 0 5px #151b23,inset 0 0 10px #000a;
            }
            .ev-scene.ev-opening .ev-dial {
                animation:ev-spin 1.3s linear infinite;
            }
            .ev-scene.ev-open .ev-door {
                transform:rotateY(-112deg);
            }
            .ev-status {
                margin-top:12px;
                color:#e8d5a5;
                font-size:12px;
                font-weight:800;
                text-align:center;
            }
            /* ERIS_VAULT_MOBILE_V1 */
            #erisGamesModal.eg-vault-mode .eg-stage {
                min-height:0!important;
                padding:0!important;
            }
            #erisGamesModal.eg-vault-mode .ev-scene {
                min-height:175px;
                padding:9px;
            }
            #erisGamesModal.eg-vault-mode .ev-safe {
                transform:scale(.84);
                margin:-9px 0;
            }
            #erisGamesModal.eg-vault-mode .ev-title {
                margin-bottom:4px;
            }
            #erisGamesModal.eg-vault-mode .ev-status {
                margin-top:5px;
            }
            #erisGamesModal.eg-vault-mode .eg-form {
                gap:7px!important;
                padding:9px!important;
            }
            #erisGamesModal.eg-vault-mode .ev-prize-picks {
                gap:6px!important;
                margin-bottom:5px!important;
            }
            #erisGamesModal.eg-vault-mode .ev-prize-picks button {
                padding:7px 4px!important;
            }
            #erisGamesModal.eg-vault-mode .eg-stake-presets {
                display:grid!important;
                grid-template-columns:repeat(4,minmax(0,1fr))!important;
                gap:5px!important;
            }
            #erisGamesModal.eg-vault-mode [data-stake-value] {
                min-width:0;
                padding:9px 2px!important;
                font-size:12px!important;
            }
            #erisGamesModal.eg-vault-mode [data-play] {
                width:100%;
                min-height:45px;
                border-radius:12px;
                font-weight:900;
            }
            @media(max-height:740px) {
                #erisGamesModal.eg-vault-mode .ev-scene {
                    min-height:150px;
                }
                #erisGamesModal.eg-vault-mode .ev-safe {
                    transform:scale(.72);
                    margin:-17px 0;
                }
            }
            @keyframes ev-spin {
                to { transform:rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    const VaultGame = {
        options: OPTIONS,

        render(container) {
            installStyle();
            container.innerHTML = `
                <div class="ev-scene" data-vault-scene>
                    <div class="ev-title">ERISCHAT · CANLI KASA</div>
                    <div class="ev-safe">
                        <div class="ev-body"></div>
                        <div class="ev-inside" data-vault-inside>💰</div>
                        <div class="ev-door">
                            <div class="ev-dial">🔒</div>
                        </div>
                    </div>
                    <div class="ev-status" data-vault-status>
                        Ödül kategorini seç ve bahis yap.
                    </div>
                </div>
            `;
        },

        setPhase(container, phase, result) {
            const scene = container?.querySelector('[data-vault-scene]');
            const status = container?.querySelector('[data-vault-status]');
            const inside = container?.querySelector('[data-vault-inside]');
            if (!scene) return;

            scene.classList.toggle('ev-opening', phase === 'opening');
            scene.classList.toggle('ev-open', phase === 'result');

            const symbols = {
                common:'📭',
                rare:'💠',
                epic:'💜',
                legendary:'👑',
                mythic:'🌟'
            };

            if (inside) inside.textContent =
                phase === 'result' ? (symbols[result] || '💰') : '💰';

            if (status) {
                status.textContent =
                    phase === 'opening'
                        ? '⚙️ Şifre çözülüyor... Kasa açılıyor!'
                        : phase === 'result'
                        ? '🔓 Kasa açıldı! Sonuç açıklandı.'
                        : '🔒 Kasa kilitli · Bahisler açık';
            }
        },

        async animate(container, data) {
            this.setPhase(container, 'result', data?.winner || data?.result);
        }
    };

    window.ErisGameVault = VaultGame;
})();
