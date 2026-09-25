
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
    }

    function open(scope = 'main', roomId = null, selected = null) {
        injectStyles();
        modal?.remove();
        modal = document.createElement('div');
        modal.id = 'erisGamesModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:1100; background:rgba(2, 1, 7, 0.88); display:grid; place-items:center; padding:10px; color:white; backdrop-filter:blur(8px);';
        modal.innerHTML = `
            <div class="eg-panel">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:17px; font-weight:700;">🎮 Oyun Merkezi (Modüler 3D)</h2>
                    <button data-close style="background:transparent; border:none; font-size:20px; padding:2px 6px;">×</button>
                </div>
                <p style="font-size:11px; color:rgba(255,255,255,0.6); margin:4px 0 10px 0;">Profesyonel casino görselleri ve akıcı animasyonlar.</p>
                <div data-balance style="font-size:12px; font-weight:600; color:#e6af34; margin-bottom:6px;"></div>
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
        modal.querySelector('[data-close]').onclick = () => modal.remove();
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

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
                // Aktif oda ID'sini bulalım veya sunucudan açık olan ilk odayı çekelim
                let targetRoomId = roomId || window.ErisCurrentRoomId || window.currentRoomId || localStorage.getItem('eris_my_room_id');
                if (!targetRoomId) {
                    try {
                        const roomsRes = await api('/rooms');
                        const roomsList = Array.isArray(roomsRes) ? roomsRes : (roomsRes?.rooms || roomsRes?.items || []);
                        if (roomsList.length > 0) {
                            targetRoomId = roomsList[0].id || roomsList[0].room_id || roomsList[0]._id;
                        }
                    } catch (err) {
                        console.warn('Oda listesi alınamadı, genel oda deneniyor');
                    }
                }

                const res = await api('/games/' + game + '/play', {
                    method: 'POST',
                    body: JSON.stringify({
                        room_id: targetRoomId || null,
                        choice: modal.querySelector('[data-choice]').value,
                        stake: Number(modal.querySelector('[data-stake]').value)
                    })
                });

                const mod = gameModules[game]();
                if (mod && typeof mod.animate === 'function') {
                    await mod.animate(stage, res.data);
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
                                    await mod.animate(stage, { ...next.state, state: next.state, result: next.result, newCard: next.state?.player_hand?.slice(-1)[0] });
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
