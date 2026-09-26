
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
        roulette: () => window.ErisGameRoulette,
        cups: () => window.ErisGameCups,
        horse_race: () => window.ErisGameHorseRace,
        vault: () => window.ErisGameVault
    };

    const labels = {
        roulette: '🎰 Rulet',
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
            #erisGamesModal .eg-form select { max-width: 150px; }
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
            #erisGamesModal .eg-form select { max-width:none; min-width:110px; background:#181321; border-color:#ffffff1b; border-radius:12px; padding:10px; }
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
                    <label>Lidya <select data-stake><option value="0">Ücretsiz</option><option value="10">10</option><option value="50">50</option><option value="100">100</option><option value="500">500</option></select></label>
                    <button data-play>Oyna</button>
                </div>
                <div class="eg-result" role="status"></div>
                <div data-controls style="display:flex; gap:8px; justify-content:center; margin-top:6px;"></div>
            </div>
        `;
        document.body.append(modal);
        const close = () => modal?.remove();
        modal.querySelector('[data-close]').onclick = close;
        modal.onclick = e => { if (e.target === modal) close(); };
        modal.onkeydown = e => { if (e.key === 'Escape') close(); };
        modal.querySelector('[data-scope]').textContent = scope === 'room' ? 'ODA OYUNLARI' : 'KİŞİSEL OYUNLAR';

        const keys = Object.keys(gameModules);
        const tabs = modal.querySelector('.eg-keys');
        let game = keys.includes(selected) ? selected : keys[0];

        const refreshBalance = () => api('/me').then(me => {
            modal.querySelector('[data-balance]').textContent = '💰 Bakiye: ' + Number(me.lidya || 0).toLocaleString('tr-TR') + ' Lidya';
        }).catch(() => {
            modal.querySelector('[data-balance]').textContent = '💰 Bakiye yüklenemedi.';
        });
        refreshBalance();

        const loadGameModule = key => {
            game = key;
            modal.querySelector('[data-name]').textContent = labels[key];
            tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.game === key));

            const mod = gameModules[key]();
            const stage = modal.querySelector('.eg-stage');
            if (mod && typeof mod.render === 'function') {
                mod.render(stage);
            }

            const choice = modal.querySelector('[data-choice]');
            choice.replaceChildren();
            const opts = mod?.options || [['auto', 'Seçim yap']];
            for (const [val, lbl] of opts) {
                choice.add(new Option(lbl, val));
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

        modal.querySelector('[data-play]').onclick = async () => {
            const button = modal.querySelector('[data-play]'),
                  stage = modal.querySelector('.eg-stage'),
                  result = modal.querySelector('[data-result]') || modal.querySelector('.eg-result'),
                  controls = modal.querySelector('[data-controls]');

            button.disabled = true;
            controls.replaceChildren();
            modal.querySelector('.eg-result').textContent = 'Oyun başlatılıyor…';

            try {
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
                    : game === 'roulette' ? choiceValue
                    : game === 'wheel' ? choiceValue
                    : choiceValue;
                const res = await api('/games/' + game + '/play', {
                    method: 'POST',
                    body: JSON.stringify({
                        room_id: targetRoomId || null,
                        choice,
                        stake: Number(modal.querySelector('[data-stake]').value)
                    })
                });

                const mod = gameModules[game]();
                if (mod && typeof mod.animate === 'function') {
                    await mod.animate(stage, {
                        ...res.data,
                        result: res.payout > 0 ? 'win' : 'lose',
                        result_key: res.result,
                        winning_cup: String(res.result).replace('cup_', ''),
                        winner: String(res.result).replace('horse_', ''),
                        winning_index: ['small','medium','large','special','grand'].indexOf(res.result),
                        multiplier: res.data?.multiplier
                    });
                }
                modal.querySelector('.eg-result').textContent = '🎉 Sonuç: ' + res.result + ' • Yatırılan: ' + res.stake + ' • Ödül: ' + res.payout + ' Lidya';

                if (game === 'blackjack' && res.result === 'pending') {
                    for (const [action, label] of [['hit', 'Kart Çek'], ['stand', 'Dur']]) {
                        const b = document.createElement('button');
                        b.textContent = label;
                        b.onclick = async () => {
                            controls.querySelectorAll('button').forEach(x => x.disabled = true);
                            try {
                                const next = await api('/games/blackjack/' + encodeURIComponent(res.data.round_id) + '/action', {
                                    method: 'POST',
                                    body: JSON.stringify({ action })
                                });
                                if (mod && typeof mod.animate === 'function') {
                                    await mod.animate(stage, { ...next.state, state: next.state, result: next.result, newCard: next.state?.hands?.[0]?.cards?.slice(-1)[0] });
                                }
                                modal.querySelector('.eg-result').textContent = '🎉 Sonuç: ' + next.result + ' • Ödül: ' + (next.payout || 0) + ' Lidya';
                                if (next.status === 'finished') controls.replaceChildren();
                                else controls.querySelectorAll('button').forEach(x => x.disabled = false);
                                refreshBalance();
                            } catch (e) {
                                modal.querySelector('.eg-result').textContent = e.message;
                                controls.querySelectorAll('button').forEach(x => x.disabled = false);
                            }
                        };
                        controls.append(b);
                    }
                }
                refreshBalance();
            } catch (e) {
                modal.querySelector('.eg-result').textContent = e.message || 'Oyun başlatılamadı.';
            } finally {
                button.disabled = false;
            }
        };
    }

    window.ErisChatGames = { open };
})();
