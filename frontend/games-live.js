
    // Profesyonel Web Audio API Ses Sentezleyici
    function playCasinoSound(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const now = ctx.currentTime;
            if (type === "win") {
                osc.type = "triangle";
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554.37, now + 0.1);
                osc.frequency.setValueAtTime(659.25, now + 0.2);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
            } else if (type === "lose") {
                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.setValueAtTime(120, now + 0.2);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
            } else if (type === "click") {
                osc.type = "sine";
                osc.frequency.setValueAtTime(800, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            }
        } catch(e) {}
    }
    
(() => {
    'use strict';

    const gameModules = {
        wheel: () => window.ErisGameWheel,
        crash: () => window.ErisGameCrash,
        blackjack: () => window.ErisGameBlackjack,
        slot: () => window.ErisGameSlot,
        cups: () => window.ErisGameCups,
        horse_race: () => window.ErisGameHorseRace,
        vault: () => window.ErisGameVault
    };

    const labels = {
        slot: '🎰 Slot',
        cups: '🥤 Dört Kupa',
        horse_race: '🐎 At Yarışı',
        blackjack: '🃏 Blackjack',
        crash: '🚀 Crash',
        vault: '🎁 Kasa',
        wheel: '🎡 Şans Çarkı'
    };

    const api = (path, options = {}) => window.ErisPlatform?.api ? window.ErisPlatform.api(path, options) : Promise.reject(new Error('Platform hazır değil'));
    let modal = null;

    function injectStyles() {
        if (document.getElementById('eris-games-modular-style')) return;
        const s = document.createElement('style');
        s.id = 'eris-games-modular-style';
        s.textContent = `
            #erisGamesModal .eg-panel {
                width: min(640px, 100%);
                max-height: 95vh;
                overflow: auto;
                border: 1px solid rgba(166, 140, 255, 0.35);
                border-radius: 24px;
                background: linear-gradient(145deg, #181028, #0a0712);
                padding: 20px;
                box-shadow: 0 35px 110px rgba(0,0,0,0.85);
            }
            #erisGamesModal button, #erisGamesModal select {
                cursor: pointer;
                color: white;
                background: #281d3f;
                border: 1px solid rgba(138, 92, 255, 0.4);
                border-radius: 12px;
                padding: 10px 14px;
                transition: all 0.2s ease;
            }
            #erisGamesModal button:hover {
                background: #3b2a5b;
                border-color: rgba(138, 92, 255, 0.8);
                transform: translateY(-1px);
            }
            #erisGamesModal button:disabled { opacity: .55; cursor: wait; transform: none; }
            #erisGamesModal .eg-keys {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
                gap: 8px;
                margin: 14px 0;
            }
            #erisGamesModal .eg-keys button {
                background: linear-gradient(145deg, #221836, #161024);
                border: 1px solid rgba(138, 92, 255, 0.25);
                border-radius: 14px;
                padding: 12px 8px;
                font-size: 12px;
                font-weight: 600;
                text-align: center;
                transition: all 0.25s ease;
            }
            #erisGamesModal .eg-keys button:hover {
                transform: translateY(-3px);
                box-shadow: 0 8px 20px rgba(138, 92, 255, 0.25);
            }
            #erisGamesModal .eg-keys button.active {
                background: linear-gradient(135deg, #7c4ee4, #5931b3);
                border-color: #a77aff;
                box-shadow: 0 0 20px rgba(124, 78, 228, 0.5);
            }
            #erisGamesModal .eg-stage {
                min-height: 240px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                border-radius: 18px;
                background: radial-gradient(circle at center, rgba(82, 41, 128, 0.35), #0b0716 75%);
                border: 1px solid rgba(138, 92, 255, 0.25);
                padding: 14px;
                margin: 14px 0;
                box-shadow: inset 0 0 30px rgba(0,0,0,0.6);
                position: relative;
                overflow: hidden;
            }
            #erisGamesModal .eg-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
            #erisGamesModal .eg-form label { font-size: 11px; color: rgba(255,255,255,0.7); }
            #erisGamesModal .eg-form select, #erisGamesModal .eg-form input { max-width: 170px; }
            #erisGamesModal .eg-result { min-height: 40px; color: #f5dcff; font-size: 12px; margin-top: 8px; text-align: center; font-weight: 600; }
        `;
        document.head.append(s);

        const polish = document.createElement('style');
        polish.id = 'eris-games-polish-style';
        polish.textContent = `
            #erisGamesModal { overflow:auto; backdrop-filter:blur(16px); }
            #erisGamesModal .eg-panel {
                position:relative; width:min(660px,100%); max-height:min(94dvh,940px);
                padding:clamp(18px,4vw,28px); border-color:#ffffff22; border-radius:28px;
                background:radial-gradient(680px 280px at 100% 0%,#a15aff20,transparent 66%),linear-gradient(155deg,#1a1428f7,#09070ff8 72%);
                box-shadow:0 32px 110px #000c,inset 0 1px #ffffff12;
            }
            #erisGamesModal .eg-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
            #erisGamesModal .eg-head h2 { font-size:clamp(21px,5vw,28px)!important; letter-spacing:-.7px; }
            #erisGamesModal [data-close] { width:40px; height:40px; border-radius:14px!important; background:#ffffff0c!important; font-size:20px; }
            #erisGamesModal .eg-intro { margin:8px 0 13px!important; color:#b5adbf!important; font-size:12px!important; line-height:1.55; }
            #erisGamesModal .eg-wallet { display:flex; justify-content:space-between; align-items:center; gap:10px; margin:12px 0; padding:11px 13px; border:1px solid #e4b85d35; border-radius:15px; background:linear-gradient(100deg,#e4b85d12,#ffffff04); color:#f0cd7d!important; }
            #erisGamesModal .eg-wallet [data-scope] { color:#d2c5eb; font-size:10px; font-weight:800; letter-spacing:.5px; }
            #erisGamesModal .eg-keys { grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; }
            #erisGamesModal .eg-keys button { min-height:45px; border-color:#ffffff16; background:linear-gradient(140deg,#211a2d,#171220); font-weight:800; }
            #erisGamesModal .eg-keys button.active { background:linear-gradient(130deg,#7047d8,#aa4dc2); border-color:#d6b6ff88; box-shadow:0 8px 25px #754cff35; }
            #erisGamesModal [data-name] { margin:14px 0 8px!important; font-size:19px!important; letter-spacing:-.25px; }
            #erisGamesModal .eg-stage { min-height:clamp(200px,34vh,310px); border-color:#ffffff18; border-radius:20px; perspective:1000px; background:radial-gradient(ellipse at 50% 40%,#8f55dc36,#271a3b 48%,#100d19 100%); box-shadow:inset 0 1px #ffffff0c,0 16px 36px #0005; }
            #erisGamesModal .eg-stage canvas { max-width:100%; filter:drop-shadow(0 12px 24px #0007); }
            #erisGamesModal .eg-stage [style*="position:absolute"] { filter:drop-shadow(0 8px 12px #0008); }
            #erisGamesModal .eg-form { padding:13px; border:1px solid #ffffff12; border-radius:17px; background:#ffffff05; }
            #erisGamesModal .eg-form label { display:grid; gap:6px; color:#c1b8cb; font-size:10px; font-weight:750; }
            #erisGamesModal .eg-form select, #erisGamesModal .eg-form input { max-width:none; min-width:110px; background:#181321; border-color:#ffffff1b; border-radius:12px; padding:10px; }
            /* Wheel V2 premium symbol selector */
            #erisGamesModal .eg-wheel-picks{display:none;grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;width:100%;margin:1px 0 5px}
            #erisGamesModal .eg-wheel-picks.show{display:grid}
            #erisGamesModal .eg-wheel-pick{position:relative;min-height:70px;padding:8px 4px;border:1px solid #ffffff12;border-radius:15px;background:linear-gradient(145deg,#201827,#120e17);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;box-shadow:inset 0 1px #ffffff09,0 5px 12px #0003;transition:transform .15s,border-color .15s,background .15s,box-shadow .15s}
            #erisGamesModal .eg-wheel-pick:active{transform:none}
            #erisGamesModal .eg-wheel-pick.active{border-color:#e1b661;background:linear-gradient(145deg,#3a2941,#201527);box-shadow:0 0 0 1px #e1b66140,0 7px 20px #8d58d52e,inset 0 0 22px #d9a95c12}
            #erisGamesModal .eg-wheel-icon{font-size:24px;line-height:1}
            #erisGamesModal .eg-wheel-pick b{font-size:10px;line-height:1.2}
            #erisGamesModal .eg-wheel-pick small{font-size:8px;color:#e5bd70;font-weight:900;letter-spacing:.25px}
            #erisGamesModal .eg-wheel-pick.active:after{content:"✓";position:absolute;right:6px;top:6px;width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#ffe09a,#bd843b);color:#211521;font-size:9px;font-weight:950;box-shadow:0 2px 7px #0007}
            #erisGamesModal.eg-wheel-mode .eg-form>label:first-child{display:none}
            #erisGamesModal.eg-wheel-mode .eg-form{border-color:#d9a85d25;background:linear-gradient(145deg,#ffffff06,#d7a35508)}
            #erisGamesModal.eg-wheel-mode [data-play]{background:linear-gradient(120deg,#7951e8,#b953cf 55%,#c59049);box-shadow:0 9px 27px #9c55df42}

            #erisGamesModal .eg-stake-presets { display:flex; gap:5px; flex-wrap:wrap; align-items:end; }
            #erisGamesModal .eg-stake-presets button { padding:8px 10px; font-size:10px; }
            #erisGamesModal [data-play] { min-height:43px; margin-left:auto; padding-inline:22px; border:0; background:linear-gradient(120deg,#7550e7,#e449a0); box-shadow:0 9px 25px #b34cff30; font-weight:900; }
            #erisGamesModal .eg-result { min-height:44px; margin-top:12px; padding:11px 13px; border:1px solid #ffffff10; border-radius:14px; background:#ffffff05; color:#e9def4; }
            #erisGamesModal [data-controls] button { min-height:42px; background:linear-gradient(125deg,#5d3caf,#9a43af); font-weight:850; }
            @media(max-width:520px) { #erisGamesModal { padding:8px!important; place-items:end center!important; } #erisGamesModal .eg-panel { max-height:95dvh; border-radius:25px 25px 18px 18px; padding:18px; } #erisGamesModal .eg-form { display:grid; grid-template-columns:1fr 1fr; } #erisGamesModal .eg-form label { min-width:0; } #erisGamesModal [data-play] { grid-column:1/-1; margin:2px 0 0; } #erisGamesModal .eg-stage { min-height:190px; } }
            @media(prefers-reduced-motion:reduce) { #erisGamesModal *,#erisGamesModal *:before,#erisGamesModal *:after { scroll-behavior:auto!important; transition:none!important; animation:none!important; } }
        `;
        document.head.append(polish);
    }

    function open(scope = 'main', roomId = null, selected = null) {
        injectStyles();
        modal?.remove();
        modal = document.createElement('div');
        modal.id = 'erisGamesModal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Oyun merkezi');
        modal.style.cssText = 'position:fixed; inset:0; z-index:10100; background:rgba(2, 1, 7, 0.88); display:grid; place-items:center; padding:10px; color:white; backdrop-filter:blur(8px);';
        modal.innerHTML = `
            <div class="eg-panel">
                <div class="eg-head">
                    <h2 style="margin:0; font-size:17px; font-weight:700;">🎮 Oyun Merkezi (Modüler 3D)</h2>
                    <button data-close style="background:transparent; border:none; font-size:20px; padding:2px 6px;">×</button>
                </div>
                <p class="eg-intro">Sunucu kontrollü oyunlar, akıcı animasyonlar ve anlık Lidya bakiyesi.</p>
                <div class="eg-wallet"><span data-balance>💰 Bakiye yükleniyor…</span><span data-scope></span></div>
                <div class="eg-keys"></div>
                <h3 data-name style="margin:8px 0 2px 0; font-size:14px; color:#a77aff;"></h3>
                <div class="eg-stage" aria-live="polite">Oyun yükleniyor...</div>
                <div class="eg-form">
                    <label>Seçim <select data-choice></select></label>
                    <div class="eg-wheel-picks" data-wheel-picks aria-label="Şans Çarkı sembol seçimi"></div>
                    <label>Bahis · 0–10.000 Lidya <input data-stake type="number" inputmode="numeric" min="0" max="10000" step="1" value="100" aria-label="Lidya bahsi"></label>
                    <div class="eg-stake-presets" aria-label="Hazır bahisler"><button type="button" data-stake-value="10">🪙10</button><button type="button" data-stake-value="25">🪙25</button><button type="button" data-stake-value="50">🪙50</button><button type="button" data-stake-value="75">🪙75</button><button type="button" data-stake-value="100">🪙100</button><button type="button" data-stake-value="250">🪙250</button><button type="button" data-stake-value="500">🪙500</button><button type="button" data-stake-value="1000">🪙1000</button></div>
                    <button data-play>Oyna</button>
                </div>
                <div data-wheel-feed style="display:none;position:relative;height:38px;overflow:hidden;margin:5px 0"></div><div data-wheel-clock style="display:none;text-align:center;font-weight:900;color:#ffd477;margin:8px 0">⏱ --</div><div class="eg-result" role="status"></div><div data-wheel-mine style="display:none;margin-top:8px;padding:10px;border:1px solid #ffffff12;border-radius:12px;font-size:11px"></div>
                <div data-controls style="display:flex; gap:8px; justify-content:center; margin-top:6px;"></div>
            </div>
        `;
        document.body.append(modal);
        if (!document.getElementById('erisCrashProStyle')) {
        const st = document.createElement('style');
        st.id = 'erisCrashProStyle';
        st.textContent = '\n/* ERIS_CRASH_PRO_UI_V1 */\n#erisGamesModal.eg-crash-mode .eg-form>label:first-child{display:none}\n#erisGamesModal.eg-crash-mode .eg-form{display:grid;grid-template-columns:1fr;gap:12px}\n#erisGamesModal.eg-crash-mode .eg-form>label{font-size:12px;font-weight:800;color:#d8c8f4}\n#erisGamesModal.eg-crash-mode [data-stake]{width:100%;box-sizing:border-box}\n#erisGamesModal.eg-crash-mode .eg-stake-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}\n#erisGamesModal.eg-crash-mode .eg-stake-presets button{min-width:0;padding:12px 3px;border-radius:12px}\n#erisGamesModal.eg-crash-mode [data-play]{width:100%;min-height:56px;font-size:17px;border-radius:15px}\n#erisGamesModal.eg-crash-mode [data-controls] button{width:100%;min-height:55px;font-size:17px;border-radius:15px;background:linear-gradient(110deg,#119b71,#25ce91)}\n#erisGamesModal.eg-crash-mode .eg-stage{min-height:260px}\n';
        st.textContent += '\n#erisGamesModal.eg-crash-mode .eg-panel{padding:12px;overflow-y:auto}\n#erisGamesModal.eg-crash-mode .eg-head{margin-bottom:5px}\n#erisGamesModal.eg-crash-mode .eg-stage{min-height:0}\n#erisGamesModal.eg-crash-mode .crash-flight{height:190px!important}\n#erisGamesModal.eg-crash-mode .eg-form{gap:7px;padding:10px}\n#erisGamesModal.eg-crash-mode .eg-stake-presets{gap:6px}\n#erisGamesModal.eg-crash-mode .eg-stake-presets button{padding:9px 2px}\n#erisGamesModal.eg-crash-mode .eg-stake-presets button.crash-selected{border-color:#34e9b5;box-shadow:0 0 0 2px #34e9b544;background:#164b43}\n#erisGamesModal.eg-crash-mode [data-play]{min-height:46px}\n#erisGamesModal.eg-crash-mode .eg-result{min-height:0;margin-top:6px;padding:9px}\n#erisGamesModal.eg-crash-mode .eg-crash-bets{font-size:12px;color:#c7f9e8;padding:9px 11px;border:1px solid #2c8b7055;border-radius:11px;margin-top:6px}\n#erisGamesModal.eg-crash-mode [data-controls] button{min-height:48px;font-size:15px}\n#erisGamesModal.eg-crash-mode [data-crash-history]{padding:7px 0!important}\n';
        st.textContent += '\n#erisGamesModal.eg-crash-mode .eg-crash-stats{padding:9px;border:1px solid #ffffff1c;border-radius:12px;background:#ffffff07;margin-bottom:7px}\n#erisGamesModal.eg-crash-mode .eg-crash-stats-title{font-size:10px;font-weight:900;letter-spacing:.7px;color:#b4c8d6;margin-bottom:7px}\n#erisGamesModal.eg-crash-mode .eg-crash-stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}\n#erisGamesModal.eg-crash-mode .eg-crash-stats-grid>div{min-width:0;text-align:center;padding:7px 2px;border-radius:8px;background:#101d30}\n#erisGamesModal.eg-crash-mode .eg-crash-stats-grid small{display:block;font-size:9px;color:#9fb0c2}\n#erisGamesModal.eg-crash-mode .eg-crash-stats-grid strong{display:block;font-size:12px;color:#56f0b5;margin-top:4px}\n';
        st.textContent += '\n/* ERIS_CRASH_COMPACT_V2 */\n\n#erisGamesModal.eg-crash-mode .eg-panel{padding:8px!important}\n#erisGamesModal.eg-crash-mode .eg-head{display:flex;align-items:center;gap:7px;margin:0 0 6px!important}\n#erisGamesModal.eg-crash-mode .eg-head h2{font-size:15px!important;white-space:nowrap}\n#erisGamesModal.eg-crash-mode .eg-head [data-close]{flex:0 0 36px;width:36px;height:36px}\n#erisGamesModal.eg-crash-mode .eg-wallet{order:0;display:flex!important;flex:1;min-width:0;margin:0!important;padding:5px 7px!important;border:0!important;background:transparent!important;justify-content:flex-end}\n#erisGamesModal.eg-crash-mode .eg-wallet [data-balance]{font-size:clamp(10px,2.7vw,13px)!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n#erisGamesModal.eg-crash-mode .eg-wallet [data-scope]{display:none!important}\n#erisGamesModal.eg-crash-mode [data-name]{display:none!important}\n#erisGamesModal.eg-crash-mode .eg-form>label{display:none!important}\n#erisGamesModal.eg-crash-mode .eg-form{padding:6px!important;gap:5px!important}\n#erisGamesModal.eg-crash-mode .eg-stake-presets{display:grid!important;grid-template-columns:repeat(8,minmax(0,1fr))!important;gap:3px!important;width:100%;min-width:0}\n#erisGamesModal.eg-crash-mode .eg-stake-presets button{min-width:0!important;width:100%!important;padding:9px 0!important;font-size:clamp(7px,1.9vw,10px)!important;border-radius:8px!important;white-space:nowrap;letter-spacing:-.5px}\n#erisGamesModal.eg-crash-mode .eg-stage{margin-top:4px!important}\n#erisGamesModal.eg-crash-mode .crash-flight{height:170px!important}\n#erisGamesModal.eg-crash-mode [data-play]{min-height:42px!important}\n#erisGamesModal.eg-crash-mode .eg-crash-stats{padding:6px!important;margin-bottom:4px!important}\n#erisGamesModal.eg-crash-mode .eg-result{margin-top:4px!important}\n';
        document.head.appendChild(st);
    }
    const close = () => modal?.remove();
        modal.querySelector('[data-close]').onclick = close;
        modal.onclick = e => { if (e.target === modal) close(); };
        modal.onkeydown = e => { if (e.key === 'Escape') close(); };
        modal.querySelector('[data-scope]').textContent = scope === 'room' ? 'ODA OYUNLARI' : 'KİŞİSEL OYUNLAR';
        if(selected){
            modal.classList.add('eg-single-game');
            modal.style.padding='0';
            const panel=modal.querySelector('.eg-panel');
            if(panel){panel.style.width='100%';panel.style.maxWidth='none';panel.style.height='100dvh';panel.style.maxHeight='none';panel.style.borderRadius='0';}
            modal.querySelector('.eg-keys').style.display='none';
            modal.querySelector('.eg-intro').style.display='none';
            modal.querySelector('.eg-head h2').textContent=labels[selected]||'Oyun';
        }


        const keys = Object.keys(gameModules);
        const tabs = modal.querySelector('.eg-keys');
        let game = keys.includes(selected) ? selected : keys[0];

        const refreshBalance = () => api('/me').then(me => {
            modal.querySelector('[data-balance]').textContent = '💰 Bakiye: ' + Number(me.lidya || 0).toLocaleString('tr-TR') + ' Lidya';
        }).catch(() => {
            modal.querySelector('[data-balance]').textContent = '💰 Bakiye yüklenemedi.';
        });
        refreshBalance();

        let crashState = null;


        // ERIS_BLACKJACK_HISTORY_V1
        const refreshBlackjackHistory = async () => {
            if (game !== 'blackjack' || !modal?.isConnected) return;
            let panel = modal.querySelector('[data-bj-history]');
            if (!panel) {
                panel = document.createElement('section');
                panel.dataset.bjHistory = '';
                panel.className = 'eg-bj-history';
                const form = modal.querySelector('.eg-form');
                form?.insertAdjacentElement('beforebegin', panel);
            }
            if (!panel) return;
            panel.textContent = 'Son 53 tur yükleniyor…';
            try {
                const data = await api('/games/blackjack/history');
                if (game !== 'blackjack' || !panel.isConnected) return;
                const rounds = Array.isArray(data.rounds) ? data.rounds : [];
                const labels = {
                    blackjack: 'BJ', win: 'K', loss: 'M', push: 'B'
                };
                const header = document.createElement('div');
                header.className = 'eg-bj-history-head';
                header.textContent = '🃏 SON 53 TUR · ' + rounds.length + ' EL';

                const summary = document.createElement('div');
                summary.className = 'eg-bj-history-summary';
                const wins = Number(data.wins || 0);
                const losses = Number(data.losses || 0);
                const pushes = Number(data.pushes || 0);
                const rate = rounds.length
                    ? Math.round(wins / rounds.length * 100)
                    : 0;
                summary.textContent =
                    '🏆 ' + wins + ' Kazanç  ·  ❌ ' + losses +
                    ' Kayıp  ·  🤝 ' + pushes +
                    ' Berabere  ·  %' + rate + ' Kazanma';

                const strip = document.createElement('div');
                strip.className = 'eg-bj-history-strip';
                for (const round of rounds) {
                    const cell = document.createElement('span');
                    const result = String(round.result || '');
                    cell.className = 'eg-bj-history-cell bj-' + (
                        ['win','blackjack','loss','push'].includes(result)
                            ? result : 'unknown'
                    );
                    cell.textContent = labels[result] || '?';
                    cell.title = result + ' · ' + String(round.started_at || '');
                    strip.append(cell);
                }
                if (!rounds.length) {
                    strip.textContent = 'Henüz tamamlanmış Blackjack turun yok.';
                }
                panel.replaceChildren(header, summary, strip);
            } catch (error) {
                if (game === 'blackjack' && panel.isConnected) {
                    panel.textContent = 'Tur geçmişi şu anda yüklenemiyor.';
                }
            }
        };

        if (!document.getElementById('erisBlackjackHistoryStyle')) {
            const style = document.createElement('style');
            style.id = 'erisBlackjackHistoryStyle';
            style.textContent = `
                #erisGamesModal .eg-bj-history {
                    padding:12px;
                    margin:9px 0;
                    border:1px solid #b995504f;
                    border-radius:15px;
                    background:linear-gradient(145deg,#181e25,#10141c);
                    box-shadow:inset 0 1px 0 #ffffff10;
                    color:#e9dfc9;
                }
                #erisGamesModal .eg-bj-history-head {
                    font-size:12px;
                    font-weight:900;
                    letter-spacing:.8px;
                    color:#f5cb79;
                    margin-bottom:9px;
                }
                #erisGamesModal .eg-bj-history-summary {
                    font-size:11px;
                    line-height:1.6;
                    margin-bottom:10px;
                    color:#d3dce7;
                }
                #erisGamesModal .eg-bj-history-strip {
                    display:flex;
                    flex-wrap:wrap;
                    gap:5px;
                    max-height:112px;
                    overflow:auto;
                }
                #erisGamesModal .eg-bj-history-cell {
                    width:27px;
                    height:27px;
                    display:grid;
                    place-items:center;
                    border-radius:7px;
                    font-size:11px;
                    font-weight:900;
                    background:#394150;
                    color:white;
                }
                #erisGamesModal .bj-win,
                #erisGamesModal .bj-blackjack {
                    background:#176e51;
                    color:#c7ffe6;
                }
                #erisGamesModal .bj-blackjack {
                    outline:1px solid #f0c46a;
                }
                #erisGamesModal .bj-loss {
                    background:#842f42;
                    color:#ffe0e5;
                }
                #erisGamesModal .bj-push {
                    background:#69552b;
                    color:#ffe7a9;
                }
            `;
            document.head.append(style);
        }


        // ERIS_BLACKJACK_PREMIUM_V1
        if (!document.getElementById('erisBlackjackPremiumStyle')) {
            const st = document.createElement('style');
            st.id = 'erisBlackjackPremiumStyle';
            st.textContent = `
                #erisGamesModal.eg-blackjack-mode .eg-panel{
                    background:linear-gradient(155deg,#15241e,#0c1217);
                    border:1px solid #d4ae6955;
                }
                #erisGamesModal.eg-blackjack-mode .eg-form{
                    display:grid;
                    grid-template-columns:1fr;
                    gap:9px;
                    padding:12px;
                    border-radius:15px;
                    border:1px solid #c6a35c55;
                    background:linear-gradient(140deg,#17372b,#10221e);
                }
                #erisGamesModal.eg-blackjack-mode .eg-form>label:first-child{
                    display:none;
                }
                #erisGamesModal.eg-blackjack-mode .eg-form>label{
                    color:#f6d990;
                    font-weight:800;
                    font-size:12px;
                }
                #erisGamesModal.eg-blackjack-mode [data-stake]{
                    display:block;
                    width:100%;
                    box-sizing:border-box;
                    margin-top:6px;
                    min-height:44px;
                    background:#091913;
                    color:#ffe6a1;
                    border:1px solid #d5b56d;
                    border-radius:10px;
                    font-size:18px;
                    font-weight:900;
                    text-align:center;
                }
                #erisGamesModal.eg-blackjack-mode .eg-stake-presets{
                    display:grid;
                    grid-template-columns:repeat(4,minmax(0,1fr));
                    gap:6px;
                }
                #erisGamesModal.eg-blackjack-mode .eg-stake-presets button{
                    min-width:0;
                    padding:10px 2px;
                    border-radius:10px;
                    border:1px solid #bda66c66;
                    background:linear-gradient(140deg,#28483b,#142b24);
                    color:#f9e5b3;
                    font-weight:900;
                    font-size:11px;
                }
                #erisGamesModal.eg-blackjack-mode [data-play]{
                    width:100%;
                    min-height:50px;
                    border-radius:12px;
                    background:linear-gradient(100deg,#bd9140,#f5d78c,#bb8b38);
                    color:#1c241a;
                    font-size:16px;
                    font-weight:900;
                }
                #erisGamesModal.eg-blackjack-mode [data-controls]{
                    display:grid!important;
                    grid-template-columns:repeat(2,minmax(0,1fr));
                    gap:8px!important;
                }
                #erisGamesModal.eg-blackjack-mode [data-controls] button{
                    min-height:47px;
                    border-radius:11px;
                    background:linear-gradient(120deg,#177253,#32ad7c);
                    color:white;
                    font-weight:900;
                }
                #erisGamesModal.eg-blackjack-mode [data-controls] button:last-child{
                    background:linear-gradient(120deg,#793d39,#ad604c);
                }
            `;
            document.head.appendChild(st);
        }

        // ERIS_BJ_RESTORE_RACE_FIX_V1
        // ERIS_BJ_RESTORE_FAILURE_LOCK_V1
        let blackjackRestoreBusy = false;
        let blackjackRestoreFailed = false;
        let activeBlackjackRoundId = null;
        const loadGameModule = key => {
            /* ERIS_BJ_SWITCH_GUARD_V2 */ if ((activeBlackjackRoundId || blackjackRestoreBusy) && game === 'blackjack' && key !== 'blackjack') {
                modal.querySelector('.eg-result').textContent =
                    'Önce aktif Blackjack elini tamamla.';
                return;
            }
            if (key === 'slot') {
                scope = 'main';
                roomId = null;
            }
            game = key;
            queueMicrotask(() => updateBlackjackStakeUI());
            modal.querySelector('[data-bj-history]')?.remove();
            if (key === 'blackjack') {
                queueMicrotask(() => refreshBlackjackHistory());
                queueMicrotask(() => restoreBlackjackRound());
            }
        modal.classList.toggle('eg-crash-mode', key === 'crash');
        modal.classList.toggle('eg-blackjack-mode', key === 'blackjack');


        // ERIS_CUPS_BET_CONTROLS_V2
        if (key === 'cups') {
            const form = modal.querySelector('.eg-form');
            const stake = form?.querySelector('[data-stake]');
            const presets = form?.querySelector('.eg-stake-presets');
            if (form && stake && presets) {
                let controls = form.querySelector('[data-cups-bet-controls]');
                if (!controls) {
                    controls = document.createElement('div');
                    controls.dataset.cupsBetControls = '1';
                    controls.className = 'eg-cups-bet-controls';
                    controls.innerHTML = `
                        <button type="button" data-cups-minus aria-label="Bahsi azalt">−</button>
                        <div class="eg-cups-bet-summary">
                            <small>OLASI KAZANÇ · 3,6×</small>
                            <strong data-cups-potential>360 Lidya</strong>
                        </div>
                        <button type="button" data-cups-plus aria-label="Bahsi artır">+</button>
                    `;
                    presets.insertAdjacentElement('beforebegin', controls);
                }
                const refresh = () => {
                    const value = Math.max(0, Math.min(10000, Math.trunc(Number(stake.value) || 0)));
                    const potential = controls.querySelector('[data-cups-potential]');
                    if (potential) potential.textContent =
                        Math.round(value * 3.6).toLocaleString('tr-TR') + ' Lidya';
                    presets.querySelectorAll('[data-stake-value]').forEach(b => {
                        b.classList.toggle('cups-selected', Number(b.dataset.stakeValue) === value);
                    });
                };
                controls.querySelector('[data-cups-minus]').onclick = () => {
                    stake.value = String(Math.max(0, (Number(stake.value) || 0) - 25));
                    stake.dispatchEvent(new Event('input', {bubbles:true}));
                    refresh();
                };
                controls.querySelector('[data-cups-plus]').onclick = () => {
                    stake.value = String(Math.min(10000, (Number(stake.value) || 0) + 25));
                    stake.dispatchEvent(new Event('input', {bubbles:true}));
                    refresh();
                };
                stake.addEventListener('input', refresh);
                presets.addEventListener('click', () => queueMicrotask(refresh));
                refresh();
            }
        } else {
            modal.querySelector('[data-cups-bet-controls]')?.remove();
        }

        // ERIS_CUPS_PREMIUM_BET_V2
        modal.classList.toggle('eg-cups-mode', key === 'cups');
        if (!document.getElementById('erisCupsPremiumBetStyle')) {
            const css = document.createElement('style');
            css.id = 'erisCupsPremiumBetStyle';
            css.textContent = `

              #erisGamesModal.eg-cups-mode .eg-cups-bet-controls {
                display:grid;
                grid-template-columns:48px minmax(0,1fr) 48px;
                align-items:center;
                gap:9px;
              }
              #erisGamesModal.eg-cups-mode .eg-cups-bet-controls>button {
                min-height:48px;
                border:1px solid #b58a55;
                border-radius:13px;
                background:#352343;
                color:#ffe3a0;
                font-size:26px;
                font-weight:900;
              }
              #erisGamesModal.eg-cups-mode .eg-cups-bet-summary {
                text-align:center;
                padding:6px 2px;
                border-radius:12px;
                background:#1b142b;
              }
              #erisGamesModal.eg-cups-mode .eg-cups-bet-summary small {
                display:block;
                color:#bea9ce;
                font-size:10px;
                font-weight:800;
              }
              #erisGamesModal.eg-cups-mode .eg-cups-bet-summary strong {
                display:block;
                margin-top:3px;
                color:#ffdb83;
                font-size:17px;
              }
              #erisGamesModal.eg-cups-mode .eg-form {
                display:grid!important;
                grid-template-columns:1fr!important;
                gap:12px!important;
                padding:16px!important;
                border:1px solid #a87a43!important;
                border-radius:20px!important;
                background:linear-gradient(150deg,#30203e,#130e20)!important;
                box-shadow:inset 0 1px #ffffff14,0 12px 30px #0005;
              }
              #erisGamesModal.eg-cups-mode .eg-form>label:first-child {
                display:none!important;
              }
              #erisGamesModal.eg-cups-mode .eg-form>label {
                display:block!important;
                font-size:12px;
                font-weight:900;
                color:#e9d4ad;
              }
              #erisGamesModal.eg-cups-mode [data-stake] {
                display:block;
                width:100%;
                box-sizing:border-box;
                margin-top:9px;
                padding:12px;
                min-height:54px;
                border:1px solid #b58a55;
                border-radius:14px;
                background:#160f24;
                color:#ffdf91;
                font-size:23px;
                font-weight:900;
                text-align:center;
              }
              #erisGamesModal.eg-cups-mode .eg-stake-presets {
                display:grid!important;
                grid-template-columns:repeat(4,minmax(0,1fr))!important;
                gap:8px!important;
              }
              #erisGamesModal.eg-cups-mode [data-stake-value] {
                min-width:0;
                padding:12px 2px;
                border:1px solid #6f538a;
                border-radius:12px;
                background:linear-gradient(150deg,#38244d,#241832);
                color:#f8dfac;
                font-weight:900;
                font-size:12px;
              }
              #erisGamesModal.eg-cups-mode [data-stake-value].cups-selected {
                border-color:#ffdc80!important;
                background:linear-gradient(135deg,#f9d67e,#b57b31)!important;
                color:#24162e!important;
                box-shadow:0 0 14px #e8b85a55;
              }
              #erisGamesModal.eg-cups-mode [data-play] {
                width:100%;
                min-height:58px;
                border:1px solid #f1cb86;
                border-radius:15px;
                background:linear-gradient(110deg,#e5b85b,#ffdf91,#b87d35)!important;
                color:#25142f!important;
                font-size:19px;
                font-weight:1000;
                box-shadow:0 8px 20px #0006;
              }
            `;
            document.head.appendChild(css);
        }
        if (key === 'cups') {
            modal.querySelector('[data-play]').textContent = '🏆 KUPALARI KARIŞTIR';
        }

        // SLOT_INDIVIDUAL_UI_V1
        modal.classList.toggle('eg-slot-mode', key === 'slot');
        queueMicrotask(() => {
            if (modal?.isConnected) {
                const selected = modal.querySelector('[data-stake]')?.value;
                modal.querySelectorAll('[data-stake-value]').forEach(b => {
                    b.classList.toggle('slot-selected',
                        key === 'slot' && b.dataset.stakeValue === selected);
                });
            }
        });


        if (!document.getElementById('erisSlotBetStyle')) {
            const el = document.createElement('style');
            el.id = 'erisSlotBetStyle';
            el.textContent = `
              #erisGamesModal.eg-slot-mode .eg-form{
                display:grid!important;grid-template-columns:1fr!important;
                gap:12px!important;padding:16px!important;
                border:2px solid #bb854b;border-radius:18px;
                background:linear-gradient(145deg,#351c40,#180e28)!important;
              }
              #erisGamesModal.eg-slot-mode .eg-form>label:first-child{
                display:none!important;
              }
              #erisGamesModal.eg-slot-mode .eg-form>label{
                color:#ffe3a1;font-weight:900;
              }
              #erisGamesModal.eg-slot-mode [data-stake]{
                width:100%;box-sizing:border-box;margin-top:8px;
                min-height:48px;font-size:20px;font-weight:900;
                border:2px solid #d5a64e;border-radius:12px;
                background:#1c142b;color:#fff;padding:8px 12px;
              }
              #erisGamesModal.eg-slot-mode .eg-stake-presets{
                display:grid!important;
                grid-template-columns:repeat(4,minmax(0,1fr))!important;
                gap:7px!important;
              }
              #erisGamesModal.eg-slot-mode [data-stake-value]{
                min-width:0;padding:12px 2px;border-radius:12px;
                border:1px solid #ad865f;background:#3a2646;
                color:#ffe2a6;font-weight:900;
              }

              #erisGamesModal.eg-slot-mode .slot-selected{
                background:linear-gradient(135deg,#ffdf83,#c17b27)!important;
                color:#281324!important;
                border-color:#ffeaa1!important;
                box-shadow:0 0 15px #ffc64b88!important;
              }
              #erisGamesModal.eg-slot-mode [data-play]{
                width:100%;min-height:60px;border-radius:15px;
                background:linear-gradient(135deg,#ffdb6e,#d77d20)!important;
                color:#2b1327;font-size:21px;font-weight:1000;
                box-shadow:0 7px 20px #edaa4255;
              }
            `;
            document.head.appendChild(el);
        }

        const slotChoiceLabel = modal.querySelector('[data-choice]')?.closest('label');
        if (slotChoiceLabel && key === 'slot') {
            slotChoiceLabel.style.display = 'none';
        }
        const slotPlayButton = modal.querySelector('[data-play]');
        if (slotPlayButton && key === 'slot') {
            slotPlayButton.textContent = '🎰 ÇEVİR';
        } else if (slotPlayButton && key !== 'blackjack' && key !== 'cups') {
            slotPlayButton.textContent = 'Oyna';
        }

        // ERIS_BJ_INDIVIDUAL_UI_FIX_V1
        modal.querySelector('[data-choice]')?.closest('label')?.style.setProperty('display', (key === 'blackjack' || key === 'slot' || key === 'cups') ? 'none' : '');

        // Crash elemanlari diger oyunlara tasinmasin.
        if (key !== 'crash') {
            modal.querySelectorAll(
                '[data-crash-history], [data-crash-stats], [data-crash-bets], .eg-crash-bets'
            ).forEach(el => el.remove());
        }

        const crashHead = modal.querySelector('.eg-head');
        const crashWallet = modal.querySelector('.eg-wallet');
        const crashClose = modal.querySelector('[data-close]');

        if (key !== 'crash' && key !== 'wheel' &&
            crashWallet?.parentElement === crashHead) {
            crashHead.insertAdjacentElement('afterend', crashWallet);
        }
        if (key === 'crash' && crashHead && crashWallet && crashClose) {
            crashHead.insertBefore(crashWallet, crashClose);
        }

        const crashStakeInput = modal.querySelector('[data-stake]');
        const crashStakeLabel = crashStakeInput?.closest('label');
        if (crashStakeLabel) crashStakeLabel.style.display = key === 'crash' ? 'none' : '';
        if (key === 'crash' && crashStakeInput) {
            crashStakeInput.value = crashStakeInput.value || '100';
        }
        modal.querySelectorAll('[data-stake-value]').forEach(b => {
            b.classList.toggle('crash-selected',
                key === 'crash' && b.dataset.stakeValue === crashStakeInput?.value);
        });

            modal.querySelector('[data-name]').textContent = labels[key];
            tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.game === key));

            const mod = gameModules[key]();
            const stage = modal.querySelector('.eg-stage');
            const wheelFeed=modal.querySelector('[data-wheel-feed]');
            if(key==='wheel' && wheelFeed){
                const head=modal.querySelector('.eg-head');
                if(head?.parentNode) head.insertAdjacentElement('afterend',wheelFeed);
            }

            if (mod && typeof mod.render === 'function') {
                mod.render(stage);
                if (key === 'cups') {
                    queueMicrotask(() => {
                        if (game === 'cups' && modal?.isConnected) {
                            restoreCupsRound().catch(console.warn);
                        }
                    });
                }
                if (key === 'crash') {
                    queueMicrotask(() => {
                        if (game === 'crash' && modal?.isConnected) {
                            refreshCrashLive().catch(console.warn);
                        }
                    });
                }

            }

            if (key !== 'crash') {
                modal.querySelector('[data-controls]').replaceChildren();
                crashState = null;
            }

            const choice = modal.querySelector('[data-choice]');
            const wheelPicks = modal.querySelector('[data-wheel-picks]');

            choice.replaceChildren();
            wheelPicks.replaceChildren();
            wheelPicks.classList.remove('show');
            modal.classList.toggle('eg-wheel-mode', key === 'wheel');
        // Wheel: bakiyeyi baslik satirina tasi; diger oyunlarda geri koy.
        const wheelHead = modal.querySelector('.eg-head');
        const wheelWallet = modal.querySelector('.eg-wallet');
        const wheelClose = modal.querySelector('[data-close]');
        if (wheelHead && wheelWallet && wheelClose) {
            if (key === 'wheel') {
                wheelHead.insertBefore(wheelWallet, wheelClose);
            } else if (wheelWallet.parentElement === wheelHead) {
                wheelHead.insertAdjacentElement('afterend', wheelWallet);
            }
        }


            const opts = mod?.options || [['auto', 'Seçim yap']];
            for (const [val, lbl] of opts) {
                choice.add(new Option(lbl, val));
            }

            if(key==='wheel'){
                const input=modal.querySelector('[data-stake]')?.closest('label');
                const play=modal.querySelector('[data-play]');
                if(input) input.style.display='none';
                if(play) play.style.display='none';
            }else{
                const input=modal.querySelector('[data-stake]')?.closest('label');
                const play=modal.querySelector('[data-play]');
                if(input) input.style.display='';
                if(play) play.style.display='';
            }

            if (key === 'wheel') {
                const symbols = mod?.symbols || [];
                symbols.forEach((symbol, index) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'eg-wheel-pick';
                    button.dataset.value = symbol.key;

                    const icon = document.createElement('span');
                    icon.className = 'eg-wheel-icon';
                    icon.textContent = symbol.icon;

                    const name = document.createElement('b');
                    name.textContent = symbol.name;

                    const payout = document.createElement('small');
                    payout.textContent = ({rose:'1.5×',heart:'2×',star:'2.5×',diamond:'3×',crown:'3.5×',gift:'4×',fire:'4.5×',gem:'5×',jackpot:'6×'})[symbol.key]+' ÖDEME';

                    const total=document.createElement('small');
                    total.dataset.wheelTotal=symbol.key;
                    total.style.cssText='display:block;color:#ffd477;margin-top:4px;font-weight:900';
                total.textContent='🪙 0 Lidya';
                    button.append(icon,name,payout,total);

                    button.onclick = async () => {
                        const amount=wheelStake;
                        if(![10,25,50,75,100,250,500,1000].includes(amount)) return;
                        try{
                            await api('/games/wheel/live/bet',{method:'POST',body:JSON.stringify({choice:symbol.key,amount})});
                            refreshBalance();
                            refreshWheelLive().catch(()=>{});
                        }catch(e){ modal.querySelector('.eg-result').textContent=e.message; }
                    };

                    wheelPicks.appendChild(button);
                });

                if (symbols[0]) choice.value = symbols[0].key;
                wheelPicks.classList.add('show');
            }
        };

        for (const key of keys) {
            const b = document.createElement('button');
            b.dataset.game = key;
            b.textContent = labels[key];
            b.onclick = () => loadGameModule(key);
            tabs.append(b);
        }
        loadGameModule(game);


        const refreshSlotBet = () => {
            const selected = modal.querySelector('[data-stake]')?.value;
            modal.querySelectorAll('[data-stake-value]').forEach(b => {
                b.classList.toggle(
                    'slot-selected',
                    game === 'slot' && b.dataset.stakeValue === selected
                );
            });
        };
        modal.querySelector('[data-stake]')?.addEventListener('input', refreshSlotBet);
        modal.querySelectorAll('[data-stake-value]').forEach(preset => preset.onclick = () => {
            modal.querySelector('[data-stake]').value = preset.dataset.stakeValue;
            refreshSlotBet();
            modal.querySelectorAll('[data-stake-value]').forEach(b => {
                b.classList.toggle('crash-selected',
                    game === 'crash' && b === preset);
            });
            if(game==='wheel'){
                wheelStake=Number(preset.dataset.stakeValue);
                modal.querySelectorAll('[data-stake-value]').forEach(b=>b.classList.toggle('wheel-stake-active',b===preset));
            }
        });
        let wheelShownRound=null,wheelAnimating=false,wheelSeenBets=new Set();
        const refreshWheelLive = async () => {
            if(game !== 'wheel' || wheelAnimating) return;
            const x=await api('/games/wheel/live');
            const feed=modal.querySelector('[data-wheel-feed]');
            const icons={rose:'🌹',heart:'♥',star:'★',diamond:'◆',crown:'♛',gift:'🎁',fire:'🔥',gem:'💠',jackpot:'🏆'};
            (x.recent_bets||[]).forEach(b=>{
                if(wheelSeenBets.has(b.id)) return;
                wheelSeenBets.add(b.id);
                if(!feed) return;
                feed.style.display='block';
                const n=document.createElement('span');
                n.textContent='🪙 '+Number(b.amount).toLocaleString('tr-TR')+' '+(icons[b.choice]||'');
                n.style.cssText='position:absolute;left:-180px;top:50%;transform:translateY(-50%);font-weight:900;font-size:11px;white-space:nowrap;transition:transform 3.2s linear;color:#ffd477';
                feed.appendChild(n);
                requestAnimationFrame(()=>requestAnimationFrame(()=>n.style.transform='translateX(calc(100vw + 220px)) translateY(-50%)'));
                setTimeout(()=>{
                    n.remove();
                    if(feed && !feed.children.length) feed.style.display='none';
                },3400);
            });
            const clock=modal.querySelector('[data-wheel-clock]');
            if(clock){clock.style.display='block';clock.textContent=(x.betting_open?'⏱ ':'🔒 ')+x.remaining_seconds+' sn';}
            modal.querySelectorAll('.eg-wheel-pick').forEach(b=>b.disabled=!x.betting_open);
            modal.querySelectorAll('[data-wheel-total]').forEach(el=>{
                const v=x.totals?.[el.dataset.wheelTotal];
                const mine=Number(x.my_bets?.[el.dataset.wheelTotal]||0);
                el.style.display='block';
                el.textContent='🪙 '+mine.toLocaleString('tr-TR')+' Lidya';
            });
            if(x.result && wheelShownRound!==x.round_id){
                wheelShownRound=x.round_id;
                wheelAnimating=true;
                const i=['rose','heart','star','diamond','crown','gift','fire','gem','jackpot'].indexOf(x.result);
                await gameModules.wheel()?.animate?.(modal.querySelector('.eg-stage'),{result_key:x.result,winning_index:i});
                const resultNames={rose:'Gül',heart:'Kalp',star:'Yıldız',diamond:'Elmas',crown:'Taç',gift:'Hediye',fire:'Alev',gem:'Kristal',jackpot:'Jackpot'};
                const resultIcons={rose:'🌹',heart:'♥',star:'★',diamond:'◆',crown:'♛',gift:'🎁',fire:'🔥',gem:'💠',jackpot:'🏆'};
                const mult={rose:1.5,heart:2,star:2.5,diamond:3,crown:3.5,gift:4,fire:4.5,gem:5,jackpot:6};
                const winningBet=Number(x.my_bets?.[x.result]||0);
                const payout=Math.floor(winningBet*(mult[x.result]||0));
                let pop=modal.querySelector('.eg-wheel-result-pop');
                if(!pop){
                    pop=document.createElement('div');
                    pop.className='eg-wheel-result-pop';
                    modal.appendChild(pop);
                }
                pop.innerHTML='<div class="wr-icon">'+(resultIcons[x.result]||'🎡')+'</div><div class="wr-name">'+(resultNames[x.result]||'Sonuç')+'</div><div class="wr-state">'+(winningBet>0?'KAZANDIN':'KAYBETTİN')+'</div><div class="wr-pay">'+(winningBet>0?'+ '+payout.toLocaleString('tr-TR')+' Lidya':'Bu tur kazanç yok')+'</div>';
                requestAnimationFrame(()=>pop.classList.add('show'));
                setTimeout(()=>pop.classList.remove('show'),3000);
                wheelAnimating=false;
            }
            const box=modal.querySelector('[data-wheel-mine]');
            if(!box) return;
            const names={rose:'🌹 Gül',heart:'♥ Kalp',star:'★ Yıldız',diamond:'◆ Elmas',crown:'♛ Taç',gift:'🎁 Hediye',fire:'🔥 Alev',gem:'💠 Kristal',jackpot:'🏆 Jackpot'};
            const rows=Object.entries(x.my_bets||{}).filter(([,v])=>Number(v)>0);
            box.style.display='none';
            box.innerHTML='<b>BU TURDAKİ BAHİSLERİM</b><br>'+(rows.length?rows.map(([k,v])=>names[k]+' · '+Number(v).toLocaleString('tr-TR')+' Lidya').join(' • '):'Henüz bahis yapmadın.');
        };
        refreshWheelLive(); setInterval(()=>{if(game==="wheel" && modal?.isConnected) refreshWheelLive().catch(()=>{});},1000);


        let crashBusy = false;
        let crashFetching = false;
        let crashNoticeUntil = 0;
        let crashNotice = '';

        function showCrashNotice(message) {
            crashNotice = message;
            crashNoticeUntil = Date.now() + 5000;
            const el = modal?.querySelector('.eg-result');
            if (el) el.textContent = message;
        }


        async function refreshCrashLive() {
            if (game !== 'crash' || !modal?.isConnected) return;

            if (crashFetching) return;
            crashFetching = true;
            const currentModal = modal;
            let state;
            try {
                state = await api('/games/crash/live');
            } finally {
                crashFetching = false;
            }

            if (game !== 'crash' || modal !== currentModal ||
                !currentModal.isConnected) return;

            crashState = state;

            const stage = modal.querySelector('.eg-stage');
            const mod = window.ErisGameCrash;
            mod?.updateLive?.(stage, state);
            /* ERIS_CRASH_HISTORY_V1 */
            let history = modal.querySelector('[data-crash-history]');
            if (!history) {
                history = document.createElement('div');
                history.dataset.crashHistory = '';
                history.style.cssText = 'display:flex;gap:7px;overflow-x:auto;padding:12px 2px;scrollbar-width:none';
                stage.insertAdjacentElement('afterend', history);
            }

            const rounds = Array.isArray(state.recent_rounds)
                ? state.recent_rounds.slice(0, 12) : [];

            history.replaceChildren();

            for (const round of rounds) {
                const value = Number(round.multiplier);
                if (!Number.isFinite(value) || value < 1) continue;

                const chip = document.createElement('span');
                chip.textContent = value.toFixed(2) + 'x';
                chip.style.cssText =
                    'flex:0 0 auto;padding:8px 11px;border-radius:11px;font-size:12px;font-weight:900;' +
                    'border:1px solid #ffffff20;background:#ffffff0b;color:' +
                    (value >= 10 ? '#facc15' : value >= 2 ? '#45f6ad' : '#fb7185');

                history.appendChild(chip);
            }

            if (!history.childElementCount) {
                const empty = document.createElement('span');
                empty.textContent = 'Henüz tamamlanmış tur bulunmuyor';
                empty.style.cssText = 'color:#94a3b8;font-size:11px;padding:7px';
                history.appendChild(empty);
            }



            /* ERIS_CRASH_STATS_V1 */
            let statsPanel = modal.querySelector('[data-crash-stats]');
            if (!statsPanel) {
                statsPanel = document.createElement('div');
                statsPanel.dataset.crashStats = '';
                statsPanel.className = 'eg-crash-stats';
                history.insertAdjacentElement('afterend', statsPanel);
            }
            const stats = state.crash_stats || {};
            const sample = Number(stats.sample_size || 0);
            const percentage = value =>
                sample ? (100 * Number(value || 0) / sample).toFixed(1) + '%' : '—';
            const numberText = value =>
                value == null ? '—' : Number(value).toFixed(2) + 'x';

            statsPanel.replaceChildren();
            const statsTitle = document.createElement('div');
            statsTitle.className = 'eg-crash-stats-title';
            statsTitle.textContent = '📊 SON ' + sample + ' TUR İSTATİSTİĞİ';
            statsPanel.appendChild(statsTitle);

            const statsGrid = document.createElement('div');
            statsGrid.className = 'eg-crash-stats-grid';
            for (const [label, value] of [
                ['2x ve üzeri', percentage(stats.above_2x)],
                ['5x ve üzeri', percentage(stats.above_5x)],
                ['Ortalama', numberText(stats.average)],
                ['En yüksek', numberText(stats.highest)]
            ]) {
                const item = document.createElement('div');
                const name = document.createElement('small');
                const val = document.createElement('strong');
                name.textContent = label;
                val.textContent = value;
                item.append(name, val);
                statsGrid.appendChild(item);
            }
            statsPanel.appendChild(statsGrid);

            const play = modal.querySelector('[data-play]');
            const result = modal.querySelector('.eg-result');
            const controls = modal.querySelector('[data-controls]');

            const activeBets = (state.my_bets || [])
                .filter(b => !b.cashed_out);

            play.textContent = '🚀 Bahis Yap';
            play.disabled = crashBusy || !state.betting_open;

            if (!crashBusy && Date.now() >= crashNoticeUntil) {
                if (state.status === 'open') {
                    result.textContent =
                        '⏳ Bahis süresi: ' +
                        state.betting_remaining + ' saniye';
                } else if (state.status === 'running') {
                    result.textContent =
                        '🚀 Çarpan: ' +
                        Number(state.multiplier).toFixed(2) + 'x';
                } else {
                    result.textContent =
                        '💥 Crash: ' +
                        Number(state.crash_at || state.multiplier).toFixed(2) + 'x';
                }
            }

            controls.replaceChildren();

            let betSummary = modal.querySelector('[data-crash-bets]');
            if (!betSummary) {
                betSummary = document.createElement('div');
                betSummary.dataset.crashBets = '';
                betSummary.className = 'eg-crash-bets';
                result.insertAdjacentElement('afterend', betSummary);
            }

            const totalStake = activeBets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
            const estimate = Math.floor(totalStake * Number(state.multiplier || 1));
            betSummary.textContent = activeBets.length
                ? '🎯 Aktif bahis: ' + activeBets.length +
                  '  •  Yatırılan: ' + totalStake.toLocaleString('tr-TR') +
                  ' Lidya' + (state.status === 'running'
                    ? '  •  Tahmini kazanç: ' + estimate.toLocaleString('tr-TR') + ' Lidya'
                    : '')
                : 'Bu turda aktif bahsin bulunmuyor.';

            if (state.status === 'running' && activeBets.length) {
                const cashout = document.createElement('button');
                cashout.type = 'button';
                cashout.textContent = '💰 Toplam ' + estimate.toLocaleString('tr-TR') + ' Lidya Çek';
                cashout.disabled = crashBusy;
                cashout.onclick = async () => {
                    if (crashBusy) return;
                    crashBusy = true;
                    cashout.disabled = true;
                    try {
                        const res = await api('/games/crash/live/cashout-all', {
                            method: 'POST'
                        });
                        showCrashNotice(
                            '🎉 ' + res.bet_count + ' bahis çekildi: ' +
                            Number(res.payout).toLocaleString('tr-TR') + ' Lidya'
                        );
                        refreshBalance();
                    } catch (e) {
                        showCrashNotice(e.message || 'Kazanç çekilemedi');
                    } finally {
                        crashBusy = false;
                        refreshCrashLive().catch(console.warn);
                    }
                };
                controls.append(cashout);
            }
            /* ERIS_CRASH_COMPACT_V2 */
        }

        setInterval(() => {
            if (game === 'crash' && modal?.isConnected) {
                refreshCrashLive().catch(console.warn);
            }
        }, 500);

        let wheelStake=100;



        // ERIS_BJ_FINAL_COMPACT_V1
        const bjStakeInput = modal.querySelector('[data-stake]');
        const bjStakePresets = modal.querySelector('.eg-stake-presets');
        const bjForm = modal.querySelector('.eg-form');

        const bjStakeBar = document.createElement('div');
        bjStakeBar.className = 'eg-bj-stake-bar';
        bjStakeBar.innerHTML = `
            <button type="button" data-bj-minus aria-label="Bahsi azalt">−</button>
            <div class="eg-bj-stake-display">
                <small>SEÇİLEN BAHİS</small>
                <strong data-bj-amount>100 Lidya</strong>
            </div>
            <button type="button" data-bj-plus aria-label="Bahsi artır">+</button>
        `;
        bjStakePresets?.parentElement?.insertBefore(bjStakeBar, bjStakePresets);

        const bjRefreshAmount = () => {
            const amount = Math.max(0, Math.min(10000,
                Math.trunc(Number(bjStakeInput?.value) || 0)));
            const display = modal.querySelector('[data-bj-amount]');
            if (display) display.textContent =
                amount.toLocaleString('tr-TR') + ' Lidya';
            bjStakeBar.querySelectorAll('button').forEach(b => {
                b.disabled = game === 'blackjack' &&
                    (!!activeBlackjackRoundId || blackjackRestoreBusy);
            });
        };

        for (const [selector, delta] of [
            ['[data-bj-minus]', -10],
            ['[data-bj-plus]', 10]
        ]) {
            bjStakeBar.querySelector(selector).onclick = () => {
                if (game !== 'blackjack' ||
                    activeBlackjackRoundId || blackjackRestoreBusy) return;
                const current = Number(bjStakeInput.value) || 0;
                bjStakeInput.value = String(Math.max(0,
                    Math.min(10000, current + delta)));
                bjStakeInput.dispatchEvent(new Event('input', {bubbles:true}));
                bjRefreshAmount();
            };
        }

        bjStakeInput?.addEventListener('input', bjRefreshAmount);
        bjStakeInput?.addEventListener('change', bjRefreshAmount);
        bjStakePresets?.addEventListener('click', () =>
            queueMicrotask(bjRefreshAmount));

        const bjLayout = () => {
            const enabled = game === 'blackjack';
            const head = modal.querySelector('.eg-head');
            const wallet = modal.querySelector('.eg-wallet');
            const close = modal.querySelector('[data-close]');
            if (enabled && head && wallet && close) {
                head.insertBefore(wallet, close);
            }
            bjRefreshAmount();
        };

        const bjStyle = document.createElement('style');
        bjStyle.id = 'erisBjFinalCompactStyle';
        bjStyle.textContent = `
            #erisGamesModal.eg-blackjack-mode {
                overflow:hidden!important;
                padding:0!important;
                place-items:center!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-panel {
                display:flex!important;
                flex-direction:column!important;
                width:100%!important;
                max-width:520px!important;
                height:100dvh!important;
                max-height:100dvh!important;
                box-sizing:border-box!important;
                overflow:hidden!important;
                padding:8px 10px!important;
                border-radius:0!important;
                gap:3px!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-head {
                display:flex!important;
                align-items:center!important;
                gap:7px!important;
                flex-shrink:0;
                margin:0!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-head h2 {
                font-size:13px!important;
                min-width:0;
                flex:1;
            }
            #erisGamesModal.eg-blackjack-mode .eg-wallet {
                display:flex!important;
                align-items:center!important;
                flex:0 1 auto!important;
                min-width:0;
                margin:0!important;
                padding:3px!important;
                background:transparent!important;
                border:0!important;
            }
            #erisGamesModal.eg-blackjack-mode [data-balance] {
                font-size:11px!important;
                white-space:nowrap;
            }
            #erisGamesModal.eg-blackjack-mode [data-scope],
            #erisGamesModal.eg-blackjack-mode .eg-intro,
            #erisGamesModal.eg-blackjack-mode [data-name] {
                display:none!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-stage {
                flex:1 1 auto!important;
                min-height:0!important;
                overflow:hidden!important;
                margin:2px 0!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-form {
                flex-shrink:0;
                gap:5px!important;
                padding:7px!important;
                margin:0!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-form>label {
                display:none!important;
            }
            #erisGamesModal .eg-bj-stake-bar {
                display:none;
            }
            #erisGamesModal.eg-blackjack-mode .eg-bj-stake-bar {
                display:grid!important;
                grid-template-columns:48px 1fr 48px;
                align-items:center;
                gap:7px;
            }
            #erisGamesModal.eg-blackjack-mode .eg-bj-stake-bar button {
                min-height:43px;
                border-radius:10px;
                border:1px solid #d8ba77;
                background:#284b3b;
                color:#ffe7a9;
                font-size:26px;
                font-weight:900;
            }
            #erisGamesModal.eg-blackjack-mode .eg-bj-stake-display {
                text-align:center;
                color:#ffe7a9;
            }
            #erisGamesModal.eg-blackjack-mode .eg-bj-stake-display small {
                display:block;
                font-size:9px;
                letter-spacing:1px;
            }
            #erisGamesModal.eg-blackjack-mode .eg-bj-stake-display strong {
                display:block;
                font-size:20px;
                font-weight:900;
            }
            #erisGamesModal.eg-blackjack-mode .eg-stake-presets {
                grid-template-columns:repeat(8,minmax(0,1fr))!important;
                gap:3px!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-stake-presets button {
                padding:8px 0!important;
                font-size:9px!important;
                min-width:0!important;
            }
            #erisGamesModal.eg-blackjack-mode [data-play] {
                min-height:44px!important;
            }
            #erisGamesModal.eg-blackjack-mode .eg-result {
                flex-shrink:0;
                min-height:0!important;
                margin:2px 0!important;
                padding:6px!important;
                font-size:11px!important;
            }
            #erisGamesModal.eg-blackjack-mode [data-controls] {
                flex-shrink:0;
                margin:2px 0!important;
            }
            #erisGamesModal.eg-blackjack-mode [data-bj-history] {
                flex-shrink:0;
                max-height:65px;
                overflow:hidden;
            }
        `;
        document.head.appendChild(bjStyle);

        const bjLayoutObserver = new MutationObserver(() => {
            if (!modal.isConnected) {
                bjLayoutObserver.disconnect();
                return;
            }
            bjLayout();
        });
        bjLayoutObserver.observe(modal, {
            attributes:true,
            attributeFilter:['class']
        });
        queueMicrotask(bjLayout);


        // ERIS_BJ_FINAL_FLOW_V2
        let bjStep = 10;
        let bjResetTimer = null;
        const bjPlay = modal.querySelector('[data-play]');
        if (bjPlay) bjPlay.textContent = 'ELE BAŞLA';

        const bjFlowStyle = document.createElement('style');
        bjFlowStyle.id = 'erisBjFinalFlowV2';
        bjFlowStyle.textContent = `
          #erisGamesModal.eg-blackjack-mode.bj-hand-active .eg-form {
            display:none!important;
          }
          #erisGamesModal.eg-blackjack-mode:not(.bj-hand-active)
          [data-controls] {
            display:none!important;
          }
          #erisGamesModal.eg-blackjack-mode.bj-hand-active
          [data-controls] {
            display:grid!important;
            grid-template-columns:1fr 1fr!important;
          }
          #erisGamesModal.eg-blackjack-mode .eg-bj-stake-bar button:disabled {
            opacity:.4;
          }
          #erisGamesModal.eg-blackjack-mode .eg-stake-presets .bj-selected {
            background:#876223!important;
            border-color:#ffe09b!important;
            color:#fff!important;
            box-shadow:inset 0 0 0 1px #ffe09b!important;
          }
        `;
        document.head.appendChild(bjFlowStyle);

        const bjSetActive = active => {
            if (!modal?.isConnected) return;
            modal.classList.toggle('bj-hand-active',
                game === 'blackjack' && active);
            const play = modal.querySelector('[data-play]');
            if (play && game === 'blackjack') {
                play.textContent = 'ELE BAŞLA';
                play.disabled = active || blackjackRestoreBusy ||
                    blackjackRestoreFailed;
            }
        };

        const bjResetTable = () => {
            if (game !== 'blackjack' || !modal?.isConnected ||
                activeBlackjackRoundId) return;
            gameModules.blackjack()?.render?.(
                modal.querySelector('.eg-stage'));
            modal.querySelector('[data-controls]')?.replaceChildren();
            bjSetActive(false);
            updateBlackjackStakeUI();
        };

        modal.querySelectorAll('[data-stake-value]').forEach(b => {
            b.addEventListener('click', () => {
                if (game !== 'blackjack' || activeBlackjackRoundId) return;
                bjStep = Number(b.dataset.stakeValue) || 10;
                queueMicrotask(bjRefreshAmount);
            });
        });

        for (const [selector, direction] of [
            ['[data-bj-minus]', -1],
            ['[data-bj-plus]', 1]
        ]) {
            const button = bjStakeBar.querySelector(selector);
            if (!button) continue;
            button.onclick = () => {
                if (game !== 'blackjack' || activeBlackjackRoundId ||
                    blackjackRestoreBusy || blackjackRestoreFailed) return;
                const current = Number(bjStakeInput.value) || 0;
                const amount = Math.max(0, Math.min(10000,
                    current + direction * bjStep));
                bjStakeInput.value = String(amount);
                bjStakeInput.dispatchEvent(
                    new Event('input', {bubbles:true}));
                bjRefreshAmount();
            };
        }

        // ERIS_BJ_STAKE_LOCK_V1
        const updateBlackjackStakeUI = () => {
            const active = game === 'blackjack';
            const locked = active && !!activeBlackjackRoundId;
            const input = modal.querySelector('[data-stake]');
            if (input) input.disabled = locked;
            if (typeof bjSetActive === 'function') {
                bjSetActive(locked);
            }
            bjRefreshAmount();

            modal.querySelectorAll('[data-stake-value]').forEach(b => {
                b.disabled = locked;
                b.classList.toggle(
                    'bj-selected',
                    active && b.dataset.stakeValue === input?.value
                );
            });
        };

        modal.querySelector('[data-stake]')?.addEventListener(
            'input', updateBlackjackStakeUI
        );
        modal.querySelector('[data-stake]')?.addEventListener(
            'change', updateBlackjackStakeUI
        );
        updateBlackjackStakeUI();
        modal.querySelectorAll('[data-stake-value]').forEach(b => {
            b.addEventListener('click', () => {
                queueMicrotask(updateBlackjackStakeUI);
            });
        });




        // ERIS_BJ_RESTORE_V1
        const bindBlackjackRound = roundId => {
            if (bjResetTimer) clearTimeout(bjResetTimer);
            activeBlackjackRoundId = roundId;
            bjSetActive(true);
            updateBlackjackStakeUI();
            const controls = modal.querySelector('[data-controls]');
            const stage = modal.querySelector('.eg-stage');
            const playButton = modal.querySelector('[data-play]');
            const bjMod = gameModules.blackjack();
            controls.replaceChildren();
            playButton.disabled = true;
                    for (const [action, label] of [['hit', 'Kart Çek'], ['stand', 'Dur']]) {
                        const b = document.createElement('button');
                        b.textContent = label;
                        b.onclick = async () => {
                            controls.querySelectorAll('button').forEach(x => x.disabled = true);
                            try {
                                const next = await api('/games/blackjack/' + encodeURIComponent(roundId) + '/action', {
                                    method: 'POST',
                                    body: JSON.stringify({ action })
                                });
                                if (game !== 'blackjack' || !modal.isConnected ||
                                    !stage.querySelector('.eris-bj-table')) return;
                                if (bjMod && typeof bjMod.animate === 'function') {
                                    await bjMod.animate(stage, { ...next.state, state: next.state, result: next.result, newCard: next.state?.hands?.[0]?.cards?.slice(-1)[0] });
                                }
                                const names = {blackjack:'🎉 BLACKJACK!',win:'🎉 KAZANDIN!',loss:'KRUPİYE KAZANDI',push:'🤝 BERABERE',pending:'Hamleni seç: Kart Çek veya Dur'};
                                                            modal.querySelector('.eg-result').textContent =
                                                                (names[next.result] || 'EL TAMAMLANDI') +
                                                                (next.status === 'finished' ? ' • Ödül: ' + (next.payout || 0) + ' Lidya' : '');
                                if (next.status === 'finished') {
                                    refreshBlackjackHistory();
                                    controls.replaceChildren();
                                    activeBlackjackRoundId = null;
                                    updateBlackjackStakeUI();
                                    // Sonucu kısa süre göster, ardından kapalı masaya dön.
                                    bjResetTimer = setTimeout(() => {
                                        if (game === 'blackjack' &&
                                            !activeBlackjackRoundId) {
                                            bjResetTable();
                                        }
                                    }, 1800);
                                }
                                else controls.querySelectorAll('button').forEach(x => x.disabled = false);
                                refreshBalance();
                            } catch (e) {
                                modal.querySelector('.eg-result').textContent = e.message;
                                controls.querySelectorAll('button').forEach(x => x.disabled = false);
                            }
                        };
                        controls.append(b);
                    }
        };

        const restoreBlackjackRound = async () => {
            if (game !== 'blackjack' || blackjackRestoreBusy ||
                activeBlackjackRoundId) return;
            blackjackRestoreBusy = true;
            blackjackRestoreFailed = false;
            const currentModal = modal;
            const playButton = currentModal.querySelector('[data-play]');
            if (playButton) playButton.disabled = true;
            try {
                const data = await api('/games/blackjack/active');
                if (!data.active || !data.round_id ||
                    modal !== currentModal || !currentModal.isConnected ||
                    game !== 'blackjack') return;
                const stage = currentModal.querySelector('.eg-stage');
                const bjMod = gameModules.blackjack();
                bjMod?.render?.(stage);
                await bjMod?.animate?.(stage, {
                    state: data.state,
                    result: 'pending'
                });
                if (modal !== currentModal || game !== 'blackjack') return;
                bindBlackjackRound(data.round_id);
                currentModal.querySelector('.eg-result').textContent =
                    'Devam eden Blackjack elin geri yüklendi. Kart Çek veya Dur.';
            } catch (e) {
                console.warn('[ErisChat] Blackjack geri yükleme:', e);
                blackjackRestoreFailed = true;
                if (game === 'blackjack' && currentModal.isConnected) {
                    // ERIS_BJ_RETRY_BUTTON_V1
                    const resultBox = currentModal.querySelector('.eg-result');
                    if (resultBox) {
                        resultBox.textContent = 'Blackjack bağlantısı kontrol edilemedi. ';
                        const retry = document.createElement('button');
                        retry.type = 'button';
                        retry.textContent = '🔄 Yeniden Dene';
                        retry.onclick = () => {
                            retry.disabled = true;
                            restoreBlackjackRound();
                        };
                        resultBox.append(retry);
                    }
                }
            } finally {
                blackjackRestoreBusy = false;
                if (playButton && currentModal.isConnected &&
                    !activeBlackjackRoundId && !blackjackRestoreFailed) {
                    playButton.disabled = false;
                }
            }
        };


        // ERIS_CUPS_REAL_FLOW_V2
        let cupsBusy = false;
        let cupsRoundId = null;


        async function chooseCupsRound(choice, stage) {
            if (cupsBusy || !cupsRoundId) return;
            cupsBusy = true;

            const roundId = cupsRoundId;
            const status = modal.querySelector('.eg-result');
            const button = modal.querySelector('[data-play]');

            async function showResult(res) {
                cupsRoundId = null;

                if (game === 'cups' && stage.isConnected) {
                    await window.ErisGameCups.reveal(stage, {
                        winning_cup: res.winning_cup || res.result,
                        choice: res.choice || 'cup_' + choice
                    });

                    status.textContent =
                        (Number(res.payout) > 0
                            ? '🎉 KAZANDIN!'
                            : 'Bu tur kazanamadın.') +
                        ' • Bahis: ' + res.stake +
                        ' • Ödül: ' + res.payout + ' Lidya';

                    button.disabled = false;
                }

                await refreshBalance();
            }

            try {
                const res = await api(
                    '/games/cups/round/' +
                    encodeURIComponent(roundId) + '/choose',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            choice: 'cup_' + choice
                        })
                    }
                );

                await showResult(res);
            } catch (error) {
                try {
                    const state = await api(
                        '/games/cups/round/' +
                        encodeURIComponent(roundId) + '/status'
                    );

                    if (state.status === 'finished') {
                        await showResult(state);
                        return;
                    }

                    if (state.status === 'open') {
                        if (game === 'cups') {
                            status.textContent =
                                'Bağlantı kesildi. Aynı turdan devam edebilirsin.';
                        }
                        throw new Error('Tur hâlâ açık. Kupayı tekrar seç.');
                    }

                    throw error;
                } catch (recoveryError) {
                    if (game === 'cups') {
                        status.textContent =
                            recoveryError.message ||
                            'Sonuç kontrol edilemedi. Oyunu yeniden aç.';
                    }
                    throw recoveryError;
                }
            } finally {
                cupsBusy = false;
            }
        }

        async function restoreCupsRound() {
            if (game !== 'cups' || cupsBusy) return;
            cupsRoundId = 'pending-recovery';
            const stage = modal.querySelector('.eg-stage');
            const button = modal.querySelector('[data-play]');
            const status = modal.querySelector('.eg-result');
            if (!stage || !button) return;

            cupsBusy = true;
            button.disabled = true;

            try {
                const state = await api('/games/cups/round/active');

                if (game !== 'cups' || !stage.isConnected) return;

                if (!state.active) {
                    cupsRoundId = null;
                    button.disabled = false;
                    return;
                }

                cupsRoundId = state.round_id;
                status.textContent =
                    'Açık Dört Kupa turun geri yüklendi.';

                window.ErisGameCups.render(stage);

                await window.ErisGameCups.shuffle(
                    stage,
                    choice => chooseCupsRound(choice, stage)
                );
            } catch (e) {
                if (game === 'cups') {
                    status.textContent =
                        'Tur durumu doğrulanamadı. Oyunu yeniden aç.';
                    cupsRoundId = 'pending-recovery';
                }
            } finally {
                cupsBusy = false;
                if (game === 'cups' && stage.isConnected) {
                    button.disabled = !!cupsRoundId;
                    updateCupsRecoveryButton();
                }
            }
        }

        async function startCupsRound() {
            if (cupsBusy || cupsRoundId) return;
            cupsBusy = true;

            const stage = modal.querySelector('.eg-stage');
            const button = modal.querySelector('[data-play]');
            const status = modal.querySelector('.eg-result');
            button.disabled = true;

            try {
                const stake = Number(
                    modal.querySelector('[data-stake]').value
                );

                if (!Number.isSafeInteger(stake) ||
                    stake < 0 || stake > 10000) {
                    throw new Error(
                        'Bahis 0 ile 10.000 Lidya arasında olmalı.'
                    );
                }

                const activeRoom = document.getElementById(
                    'erisRoomSurface'
                )?.classList.contains('show');

                const room = scope === 'room' && activeRoom
                    ? (roomId || window.ErisCurrentRoomId ||
                       window.currentRoomId || null)
                    : null;

                if (scope === 'room' && !room) {
                    throw new Error('Oda bağlantısı bulunamadı.');
                }

                const res = await api('/games/cups/round/start', {
                    method: 'POST',
                    body: JSON.stringify({
                        stake,
                        room_id: room
                    })
                });

                cupsRoundId = res.round_id;
                status.textContent =
                    'Bahis alındı. Kupalar karıştırılıyor...';

                window.ErisGameCups.render(stage);
                refreshBalance().catch(console.warn);

                await window.ErisGameCups.shuffle(
                    stage,
                    choice => chooseCupsRound(choice, stage)
                );
            } catch (e) {
                status.textContent =
                    e.message || 'Tur başlatılamadı.';

                // Sunucu bahsi kabul etmiş ancak cevap kaybolmuş olabilir.
                // Yeni bahis açmadan önce açık turu sorgula.
                try {
                    const active = await api('/games/cups/round/active');
                    if (active.active) {
                        cupsRoundId = active.round_id;
                        if (game === 'cups' && stage.isConnected) {
                            status.textContent =
                                'Bahsin kurtarıldı. Kupalar karıştırılıyor...';
                            window.ErisGameCups.render(stage);
                            await window.ErisGameCups.shuffle(
                                stage,
                                choice => chooseCupsRound(choice, stage)
                            );
                        }
                    } else {
                        cupsRoundId = null;
                    }
                } catch (recoveryError) {
                    status.textContent =
                        'Bahis durumu doğrulanamadı. Oyunu yeniden aç.';
                    // Belirsiz durumda ikinci bahis açılmasını engelle.
                    cupsRoundId = cupsRoundId || 'pending-recovery';
                }

                button.disabled = !!cupsRoundId;
            } finally {
                cupsBusy = false;
                updateCupsRecoveryButton();
            }
        }


        // ERIS_CUPS_RECOVERY_BUTTON_V2
        function updateCupsRecoveryButton() {
            if (!modal || game !== 'cups') return;

            const play = modal.querySelector('[data-play]');
            const result = modal.querySelector('.eg-result');
            if (!play || !result) return;

            let retry = modal.querySelector('[data-cups-retry]');

            if (cupsRoundId !== 'pending-recovery') {
                retry?.remove();
                return;
            }

            play.disabled = true;

            if (!retry) {
                retry = document.createElement('button');
                retry.type = 'button';
                retry.dataset.cupsRetry = '1';
                retry.textContent = '🔄 Turu Kontrol Et';
                retry.style.cssText =
                    'display:block;margin:12px auto;padding:10px 18px;' +
                    'border-radius:12px;background:#6d45bf;color:white;' +
                    'border:1px solid #a78bfa;font-weight:700;cursor:pointer';
                result.insertAdjacentElement('afterend', retry);
            }

            retry.onclick = async () => {
                if (cupsBusy) return;
                retry.disabled = true;
                try {
                    await restoreCupsRound();
                } finally {
                    retry.disabled = false;
                    updateCupsRecoveryButton();
                }
            };
        }

        // ERIS_BJ_FINAL_GUARDS_V1
        queueMicrotask(() => restoreBlackjackRound());
        modal.querySelector('[data-play]').onclick = async () => {
            if (game === 'cups') {
                if (cupsRoundId === 'pending-recovery') {
                    await restoreCupsRound();
                } else {
                    await startCupsRound();
                }
                return;
            }
            if (game === 'slot' &&
                modal.dataset.slotRequest === '1') return;
            if (game === 'slot') {
                modal.dataset.slotBusy = '1';
                modal.dataset.slotRequest = '1';
            }

            if (game === 'blackjack' &&
                (activeBlackjackRoundId || blackjackRestoreBusy ||
                 blackjackRestoreFailed)) {
                modal.querySelector('.eg-result').textContent =
                    'Blackjack elin kontrol ediliyor veya devam ediyor.';
                return;
            }
            const button = modal.querySelector('[data-play]'),
                  stage = modal.querySelector('.eg-stage'),
                  result = modal.querySelector('[data-result]') || modal.querySelector('.eg-result'),
                  controls = modal.querySelector('[data-controls]');

            // CRASH_LIVE_BET_HANDLER_V1
            if (game === 'crash') {
                if (crashBusy) return;
                crashBusy = true;
                button.disabled = true;

                try {
                    const amount = Number(
                        modal.querySelector('[data-stake]').value
                    );

                    if (![10,25,50,75,100,250,500,1000].includes(amount)) {
                        throw new Error('Geçersiz bahis miktarı');
                    }

                    if (!crashState?.betting_open) {
                        throw new Error('Bahis süresi kapalı');
                    }

                    const res = await api('/games/crash/live/bet', {
                        method: 'POST',
                        body: JSON.stringify({
                            choice: 'cashout',
                            amount
                        })
                    });

                    modal.querySelector('.eg-result').textContent =
                        '✅ ' + amount + ' Lidya bahis yatırıldı';

                    await refreshBalance();
                } catch (e) {
                    modal.querySelector('.eg-result').textContent =
                        e.message || 'Bahis yapılamadı';
                } finally {
                    crashBusy = false;
                    refreshCrashLive().catch(() => {});
                }
                return;
            }

            button.disabled = true;
            controls.replaceChildren();
            modal.querySelector('.eg-result').textContent = 'Oyun başlatılıyor…';

            try {
                const startedGame = game;
                const startedStage = stage;
                const stake = Number(modal.querySelector('[data-stake]').value);
                if (!Number.isSafeInteger(stake) || stake < 0 || stake > 10000) throw new Error('Bahis 0 ile 10.000 Lidya arasında tam sayı olmalı.');
                gameModules[game]()?.render?.(stage);
                // Oda modu yalnızca gerçekten açık olan odayı kullanır.
                const activeRoom = document.getElementById('erisRoomSurface')?.classList.contains('show');
                const targetRoomId = scope === 'room' && activeRoom
                    ? (roomId || window.ErisCurrentRoomId || window.currentRoomId || null)
                    : null;
                if (scope === 'room' && !targetRoomId) {
                    throw new Error('Oda bağlantısı bulunamadı. Odayı yeniden açıp tekrar dene.');
                }
                const choiceValue = modal.querySelector('[data-choice]').value;
                const choice = game === 'cups' ? 'cup_' + choiceValue
                    : game === 'horse_race' ? 'horse_' + choiceValue
                    : game === 'slot' ? null
                    : game === 'wheel' ? choiceValue
                    : choiceValue;
                const res = await api('/games/' + game + '/play', {
                    method: 'POST',
                    body: JSON.stringify({
                        room_id: targetRoomId || null,
                        choice,
                        stake
                    })
                });

                if (startedGame === 'blackjack' &&
                    (game !== startedGame || !modal.isConnected ||
                     modal.querySelector('.eg-stage') !== startedStage ||
                     !startedStage.querySelector('.eris-bj-table'))) return;
                const mod = gameModules[game]();
                if (mod && typeof mod.animate === 'function') {
                    await mod.animate(stage, {
                        ...res.data,
                        result: game === 'blackjack' ? res.result : (res.payout > 0 ? 'win' : 'lose'),
                        result_key: res.result,
                        winning_cup: String(res.result).replace('cup_', ''),
                        winner: String(res.result).replace('horse_', ''),
                        winning_index: ['rose','heart','star','diamond','crown','gift','fire','gem','jackpot'].indexOf(res.result),
                        ...(game === 'crash' ? {multiplier: res.data?.multiplier} : {})
                    });
                }
                modal.querySelector('.eg-result').textContent = game === 'blackjack' && res.result === 'pending'
                    ? 'İlk el dağıtıldı. Kartlarını ve krupiyenin açık kartını inceleyip hamleni seç.'
                    : 'Sonuç: ' + res.result + ' • Yatırılan: ' + res.stake + ' • Ödül: ' + res.payout + ' Lidya';

                if (game === 'blackjack' && res.result !== 'pending') {
                    bjSetActive(true);
                    if (bjResetTimer) clearTimeout(bjResetTimer);
                    bjResetTimer = setTimeout(() => {
                        if (game === 'blackjack' &&
                            !activeBlackjackRoundId) bjResetTable();
                    }, 1800);
                    refreshBlackjackHistory();
                    activeBlackjackRoundId = null;
                    updateBlackjackStakeUI();
                    const names = {blackjack:'🎉 BLACKJACK!',win:'🎉 KAZANDIN!',loss:'KRUPİYE KAZANDI',push:'🤝 BERABERE'};
                    modal.querySelector('.eg-result').textContent =
                        (names[res.result] || 'EL TAMAMLANDI') +
                        ' • Ödül: ' + (res.payout || 0) + ' Lidya';
                }
                if (game === 'blackjack' && res.result === 'pending') {
                    bindBlackjackRound(res.data?.round_id || res.round_id);
                }
                refreshBalance();
            } catch (e) {
                modal.querySelector('.eg-result').textContent = e.message || 'Oyun başlatılamadı.';
            } finally {
                if (modal.dataset.slotRequest === '1') {
                    delete modal.dataset.slotRequest;
                    delete modal.dataset.slotBusy;
                    const slotLever = modal.querySelector('.eris-slot-lever');
                    if (slotLever) {
                        slotLever.disabled = false;
                        slotLever.classList.remove('pulling');
                    }
                }
                button.disabled = game === 'blackjack' && !!activeBlackjackRoundId;
            }
        };
    }

    window.ErisChatGames = { open };
})();


/* WHEEL SINGLE MOBILE LAYOUT — ONLY SOURCE OF OVERRIDES */
const erisWheelLayout=document.createElement('style');
erisWheelLayout.textContent=`
/* WHEEL CRASH STATS ISOLATION */
#erisGamesModal.eg-wheel-mode [data-crash-history],
#erisGamesModal.eg-wheel-mode [data-crash-stats],
#erisGamesModal.eg-wheel-mode [data-crash-bets],
#erisGamesModal.eg-wheel-mode .eg-crash-stats,
#erisGamesModal.eg-wheel-mode .eg-crash-stats-title,
#erisGamesModal.eg-wheel-mode .eg-crash-stats-grid {
    display:none!important;
}

#erisGamesModal.eg-single-game.eg-wheel-mode{
 padding:0!important;
 overflow:hidden!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-panel{
 width:100%!important;
 height:100dvh!important;
 max-width:none!important;
 max-height:100dvh!important;
 padding:10px 14px 14px!important;
 border-radius:0!important;
 overflow:hidden!important;
 display:flex!important;
 flex-direction:column!important;
 box-sizing:border-box!important;
}

/* BAŞLIK */
#erisGamesModal.eg-wheel-mode .eg-head{
 position:relative!important;
 flex:0 0 48px!important;
 min-height:48px!important;
 margin:0!important;
 display:flex!important;
 align-items:center!important;
}
#erisGamesModal.eg-wheel-mode .eg-head h2{
 margin:0!important;
 font-size:18px!important;
}
#erisGamesModal.eg-wheel-mode .eg-intro,
#erisGamesModal.eg-wheel-mode .eg-keys,
#erisGamesModal.eg-wheel-mode [data-name],
#erisGamesModal.eg-wheel-mode [data-wheel-mine],
#erisGamesModal.eg-wheel-mode .eris-wheel-caption,
#erisGamesModal.eg-wheel-mode .eris-wheel-note{
 display:none!important;
}

/* BAKİYE + X */
#erisGamesModal.eg-wheel-mode .eg-wallet{
 position:absolute!important;
 top:22px!important;
 right:66px!important;
 width:auto!important;
 margin:0!important;
 padding:6px 9px!important;
 border-radius:10px!important;
 font-size:10px!important;
 z-index:20!important;
}
#erisGamesModal.eg-wheel-mode .eg-wallet [data-scope]{
 display:none!important;
}
#erisGamesModal.eg-wheel-mode .eg-head [data-close]{
 position:absolute!important;
 top:9px!important;
 right:10px!important;
 width:40px!important;
 height:36px!important;
 z-index:21!important;
}

/* CANLI BAHİSLER — BAŞLIK ALTINDA, HİÇBİR ŞEYİN ÜSTÜNE BİNMEZ */
#erisGamesModal.eg-wheel-mode [data-wheel-feed]{
 position:relative!important;
 order:initial!important;
 width:100%!important;
 box-sizing:border-box!important;
 overflow:hidden!important;
}
#erisGamesModal.eg-wheel-mode [data-wheel-feed]:empty{
 display:block!important;
 flex:0 0 32px!important;
 height:32px!important;
 min-height:32px!important;
 margin:3px 0 6px!important;
 border:1px solid #ffffff18!important;
 border-radius:10px!important;
 background:#0b0813!important;
}
#erisGamesModal.eg-wheel-mode [data-wheel-feed]:not(:empty){
 display:block!important;
 flex:0 0 32px!important;
 height:32px!important;
 min-height:32px!important;
 margin:3px 0 6px!important;
 border:1px solid #ffffff18!important;
 border-radius:10px!important;
 background:#0b0813!important;
}

/* ÇARK — KUTUNUN İÇİNDE */
#erisGamesModal.eg-wheel-mode .eg-stage{
 position:relative!important;
 flex:0 0 318px!important;
 width:100%!important;
 height:318px!important;
 min-height:318px!important;
 max-height:318px!important;
 margin:4px 0 8px!important;
 padding:18px 8px 8px!important;
 box-sizing:border-box!important;
 overflow:hidden!important;
 display:flex!important;
 align-items:center!important;
 justify-content:center!important;
}
#erisGamesModal.eg-wheel-mode .eris-wheel-v2{
 width:100%!important;
 padding:0!important;
 margin:0!important;
 display:flex!important;
 align-items:center!important;
 justify-content:center!important;
}
#erisGamesModal.eg-wheel-mode .eris-wheel-wrap{
 width:min(276px,76vw)!important;
 max-width:276px!important;
 margin:0 auto!important;
 flex:none!important;
}
#erisGamesModal.eg-wheel-mode .eris-wheel-wrap:before{
 inset:-5px!important;
}

/* 9 NESNE + BAHİS MİKTARLARI */
#erisGamesModal.eg-wheel-mode .eg-form{
 flex:0 0 auto!important;
 width:100%!important;
 margin:0!important;
 padding:8px!important;
 box-sizing:border-box!important;
 border-radius:15px!important;
 gap:6px!important;
}
#erisGamesModal.eg-wheel-mode .eg-form>label{
 display:none!important;
}
#erisGamesModal.eg-wheel-mode .eg-wheel-picks{
 display:grid!important;
 grid-template-columns:repeat(3,minmax(0,1fr))!important;
 width:100%!important;
 gap:5px!important;
 margin:0!important;
}
#erisGamesModal.eg-wheel-mode .eg-wheel-pick{
 min-height:58px!important;
 padding:4px 2px!important;
 border-radius:11px!important;
 gap:1px!important;
}
#erisGamesModal.eg-wheel-mode .eg-wheel-pick.active:after{
 display:none!important;
}

/* 8 BÜYÜK BUTON — TAM GENİŞLİK */
#erisGamesModal.eg-wheel-mode .eg-stake-presets{
 display:grid!important;
 grid-template-columns:repeat(8,minmax(0,1fr))!important;
 grid-column:1/-1!important;
 width:100%!important;
 gap:4px!important;
 margin:7px 0 0!important;
 padding:0!important;
}
#erisGamesModal.eg-wheel-mode .eg-stake-presets button{
 min-width:0!important;
 width:100%!important;
 height:40px!important;
 margin:0!important;
 padding:0!important;
 border-radius:10px!important;
 font-size:0!important;
 white-space:nowrap!important;
 overflow:hidden!important;
 display:flex!important;
 align-items:center!important;
 justify-content:center!important;
}
#erisGamesModal.eg-wheel-mode .eg-stake-presets button:before{
 content:"🪙"!important;
 font-size:8px!important;
 margin-right:1px!important;
}
#erisGamesModal.eg-wheel-mode .eg-stake-presets button:after{
 content:attr(data-stake-value)!important;
 font-size:9px!important;
 letter-spacing:-.5px!important;
}
#erisGamesModal.eg-wheel-mode .eg-stake-presets button.wheel-stake-active{
 border-color:#ffd477!important;
 box-shadow:0 0 0 1px #ffd47766!important;
}

/* SAYAÇ */
#erisGamesModal.eg-wheel-mode [data-wheel-clock]{
 flex:0 0 24px!important;
 height:24px!important;
 line-height:24px!important;
 margin:5px 0 0!important;
 font-size:12px!important;
}

/* BOŞ SONUÇ ALANI YER YEMESİN */
#erisGamesModal.eg-wheel-mode .eg-result:empty{
 display:none!important;
 margin:0!important;
 padding:0!important;
 height:0!important;
 min-height:0!important;
 border:0!important;
}
`;
document.head.appendChild(erisWheelLayout);

/* WHEEL SAFE RESPONSIVE — short mobile viewports only */
const erisWheelResponsive=document.createElement('style');
erisWheelResponsive.textContent=`
@media (max-height:740px){
 #erisGamesModal.eg-wheel-mode .eg-stage{
  flex-basis:278px!important;
  height:278px!important;
  min-height:278px!important;
  max-height:278px!important;
  padding-top:17px!important;
 }
 #erisGamesModal.eg-wheel-mode .eris-wheel-wrap{
  width:min(242px,72vw)!important;
  max-width:242px!important;
 }
 #erisGamesModal.eg-wheel-mode .eg-wheel-pick{
  min-height:51px!important;
  padding:3px 2px!important;
 }
 #erisGamesModal.eg-wheel-mode .eg-stake-presets button{
  height:36px!important;
 }
 #erisGamesModal.eg-wheel-mode [data-wheel-clock]{
  height:21px!important;
  line-height:21px!important;
  margin-top:3px!important;
 }
}

@media (max-height:660px){
 #erisGamesModal.eg-wheel-mode .eg-stage{
  flex-basis:244px!important;
  height:244px!important;
  min-height:244px!important;
  max-height:244px!important;
  margin-bottom:5px!important;
 }
 #erisGamesModal.eg-wheel-mode .eris-wheel-wrap{
  width:min(210px,68vw)!important;
  max-width:210px!important;
 }
 #erisGamesModal.eg-wheel-mode .eg-wheel-pick{
  min-height:46px!important;
 }
 #erisGamesModal.eg-wheel-mode .eg-stake-presets button{
  height:32px!important;
 }
}

@supports (height:100dvh){
 #erisGamesModal.eg-single-game.eg-wheel-mode .eg-panel{
  height:100dvh!important;
  max-height:100dvh!important;
 }
}
`;
document.head.appendChild(erisWheelResponsive);
const erisWheelHeaderFix=document.createElement('style');
erisWheelHeaderFix.textContent='\n/* WHEEL HEADER FIX - only wheel */\n#erisGamesModal.eg-wheel-mode .eg-head{\n    position:relative!important;\n    display:flex!important;\n    align-items:center!important;\n    justify-content:flex-start!important;\n    gap:4px!important;\n}\n#erisGamesModal.eg-wheel-mode .eg-head h2{\n    flex:0 1 auto!important;\n    min-width:0!important;\n    white-space:nowrap!important;\n}\n#erisGamesModal.eg-wheel-mode .eg-head .eg-wallet{\n    position:static!important;\n    flex:0 1 auto!important;\n    min-width:0!important;\n    max-width:55%!important;\n    padding:6px 8px!important;\n    white-space:nowrap!important;\n    overflow:hidden!important;\n}\n#erisGamesModal.eg-wheel-mode .eg-head .eg-wallet [data-balance]{\n    display:block!important;\n    overflow:hidden!important;\n    text-overflow:ellipsis!important;\n    font-size:clamp(9px,2.5vw,12px)!important;\n}\n#erisGamesModal.eg-wheel-mode .eg-head [data-close]{\n    margin-left:0!important;\n    position:static!important;\n    flex:0 0 40px!important;\n    margin:0!important;\n}\n';
document.head.appendChild(erisWheelHeaderFix);
