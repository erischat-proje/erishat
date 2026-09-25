(() => {
    'use strict';
    const labels = {
        roulette: '🎰 Rulet',
        cups: '🥤 Dört Kupa',
        horse_race: '🐎 At Yarışı',
        blackjack: '🃏 Blackjack',
        crash: '🚀 Crash',
        vault: '🎁 Kasa',
        wheel: '🎡 Şans Çarkı'
    };
    
    const options = {
        cups: [['cup_1','1. kupa'],['cup_2','2. kupa'],['cup_3','3. kupa'],['cup_4','4. kupa']],
        horse_race: Array.from({length:7},(_,i)=>['horse_'+(i+1),(i+1)+'. at']),
        roulette: [['rose','Gül'],['heart','Kalp'],['star','Yıldız'],['diamond','Elmas'],['crown','Taç'],['gift','Hediye'],['fire','Ateş'],['gem','Mücevher'],['jackpot','Jackpot']],
        wheel: [['small','Küçük'],['medium','Orta'],['large','Büyük'],['special','Özel'],['grand','Büyük ödül']]
    };

    const api = (p,o) => window.ErisPlatform.api(p,o);
    let modal = null;

    function style() {
        if(document.getElementById('eris-games-style')) return;
        const s = document.createElement('style');
        s.id = 'eris-games-style';
        s.textContent = `
            #erisGamesModal .eg-panel {
                width: min(600px, 100%);
                max-height: 92vh;
                overflow: auto;
                border: 1px solid rgba(166, 140, 255, 0.3);
                border-radius: 24px;
                background: linear-gradient(155deg, #161026, #07060f);
                padding: 20px;
                box-shadow: 0 30px 100px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1);
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
            #erisGamesModal button:disabled {
                opacity: .55;
                cursor: wait;
                transform: none;
            }
            #erisGamesModal .eg-keys {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
                gap: 10px;
                margin: 16px 0;
            }
            #erisGamesModal .eg-keys button {
                background: linear-gradient(145deg, #231938, #191227);
                border: 1px solid rgba(138, 92, 255, 0.25);
                border-radius: 16px;
                padding: 14px 10px;
                font-size: 13px;
                font-weight: 600;
                text-align: center;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.08);
                transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            #erisGamesModal .eg-keys button:hover {
                transform: translateY(-4px);
                box-shadow: 0 12px 25px rgba(138, 92, 255, 0.25), inset 0 1px 0 rgba(255,255,255,0.2);
            }
            #erisGamesModal .eg-keys button.active {
                background: linear-gradient(135deg, #7c4ee4, #5931b3);
                border-color: #a77aff;
                box-shadow: 0 0 25px rgba(124, 78, 228, 0.5), inset 0 1px 0 rgba(255,255,255,0.3);
                transform: translateY(-2px);
            }
            #erisGamesModal .eg-stage {
                min-height: 160px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 9px;
                overflow: hidden;
                border-radius: 18px;
                background: radial-gradient(circle at center, rgba(92, 49, 139, 0.3), #100b1e 70%);
                border: 1px solid rgba(138, 92, 255, 0.15);
                padding: 14px;
                margin: 16px 0;
            }
            #erisGamesModal .eg-piece {
                padding: 12px 10px;
                min-width: 40px;
                text-align: center;
                font-size: 22px;
                border-radius: 14px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.12);
                transition: transform .28s, background .28s, box-shadow .28s;
            }
            #erisGamesModal .eg-piece.active {
                transform: translateY(-16px) scale(1.15);
                background: #8a5cff;
                box-shadow: 0 0 22px #a77aff;
            }
            #erisGamesModal .eg-piece.winner {
                background: #e6af34;
                color: #1a1021;
                box-shadow: 0 0 30px #ffcf5d;
            }
            #erisGamesModal .eg-track { width: 100%; font-size: 13px; }
            #erisGamesModal .eg-horse { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
            #erisGamesModal .eg-horse span { display: inline-block; transition: width .35s; }
            #erisGamesModal .eg-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; }
            #erisGamesModal .eg-form label { font-size: 12px; color: rgba(255,255,255,0.7); }
            #erisGamesModal .eg-form select { max-width: 160px; }
            #erisGamesModal .eg-result { min-height: 44px; white-space: pre-wrap; line-height: 1.6; color: #f5dcff; font-size: 13px; margin-top: 8px; }
        `;
        document.head.append(s);
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function animate(key, data, stage) {
        const anim = data?.animation || {};
        stage.replaceChildren();
        if(key === 'horse_race') {
            const track = document.createElement('div');
            track.className = 'eg-track';
            stage.append(track);
            const rows = Array.from({length: 7}, (_, i) => {
                const row = document.createElement('div');
                row.className = 'eg-horse';
                row.innerHTML = '<b>🐎 ' + (i + 1) + '</b><span style="width:0">🏁</span>';
                track.append(row);
                return row;
            });
            for(const checkpoint of anim.checkpoints || []) {
                rows.forEach((row, i) => {
                    row.querySelector('span').style.width = Math.min(92, checkpoint['horse_' + (i + 1)] || 0) + '%';
                });
                await wait(450);
            }
            rows.forEach((row, i) => {
                row.querySelector('span').style.width = (data.result === 'horse_' + (i + 1) ? '95%' : '75%');
            });
            await wait(600);
            rows[Number(data.result.slice(-1)) - 1]?.classList.add('winner');
            return;
        }
        if(key === 'crash') {
            const num = document.createElement('strong');
            num.style.fontSize = '52px';
            num.style.color = '#ffb347';
            stage.append(num);
            for(const step of anim.curve || [1, 1.2, 1.5, 2]) {
                num.textContent = Number(step).toFixed(2) + '×';
                await wait(200);
            }
            num.textContent = '💥 ' + Number(data.multiplier || 1).toFixed(2) + '×';
            return;
        }
        if(key === 'blackjack') {
            const state = data.state || {};
            const line = document.createElement('div');
            line.className = 'eg-result';
            line.textContent = 'Sen: ' + (state.player_hand || data.player_hand || []).join('  ') + '\nKrupiye: ' + (data.result === 'pending' ? '🂠  ' : '') + (data.dealer_hand || []).join('  ');
            stage.append(line);
            return;
        }
        const map = options[key] || [['locked','🔒'],['open','🎁']];
        const pieces = map.map(([id, label]) => {
            const el = document.createElement('span');
            el.className = 'eg-piece';
            el.textContent = key === 'cups' ? '🥤' : key === 'vault' ? '🎁' : label;
            stage.append(el);
            return el;
        });
        for(let i = 0; i < 15; i++) {
            pieces.forEach(x => x.classList.remove('active'));
            pieces[i % pieces.length].classList.add('active');
            await wait(75 + i * 9);
        }
        pieces.forEach(x => x.classList.remove('active'));
        const winner = map.findIndex(([id]) => id === data.result);
        (pieces[Math.max(0, winner)] || pieces[0]).classList.add('winner');
    }

    function open(scope = 'main', roomId = null, selected = null) {
        style();
        modal?.remove();
        modal = document.createElement('div');
        modal.id = 'erisGamesModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:1100; background:rgba(2, 1, 7, 0.85); display:grid; place-items:center; padding:12px; color:white; backdrop-filter:blur(6px);';
        modal.innerHTML = `
            <div class="eg-panel">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:18px; font-weight:700;">🎮 Oyun Merkezi</h2>
                    <button data-close aria-label="Kapat" style="background:transparent; border:none; font-size:20px; padding:4px 8px;">×</button>
                </div>
                <p style="font-size:12px; color:rgba(255,255,255,0.6); margin:6px 0 12px 0;">Ücretsiz oyna veya Lidya yatır. Sonuç ve ödül sunucuda hesaplanır.</p>
                <div data-balance style="font-size:13px; font-weight:600; color:#e6af34; margin-bottom:10px;"></div>
                <div class="eg-keys"></div>
                <h3 data-name style="margin:10px 0 4px 0; font-size:15px; color:#a77aff;"></h3>
                <div class="eg-form">
                    <label>Seçim <select data-choice></select></label>
                    <label>Lidya <select data-stake><option value="0">Ücretsiz</option><option value="10">10</option><option value="50">50</option><option value="100">100</option><option value="500">500</option></select></label>
                    <button data-play>Oyna</button>
                </div>
                <div class="eg-stage" aria-live="polite">Bir oyun seç.</div>
                <div class="eg-result" role="status"></div>
                <div data-controls></div>
            </div>
        `;
        document.body.append(modal);
        modal.querySelector('[data-close]').onclick = () => modal.remove();
        modal.onclick = e => { if (e.target === modal) modal.remove(); };

        const id = roomId || window.ErisCurrentRoomId || window.currentRoomId;
        const roomMode = scope === 'room';
        const keys = ['blackjack', 'crash', 'vault', 'roulette', 'cups', 'horse_race', 'wheel'];
        
        const tabs = modal.querySelector('.eg-keys');
        let game = keys.includes(selected) ? selected : keys[0];

        const refresh = () => api('/me').then(me => {
            modal.querySelector('[data-balance]').textContent = '💰 Bakiye: ' + Number(me.lidya || 0).toLocaleString('tr-TR') + ' Lidya';
        }).catch(() => {
            modal.querySelector('[data-balance]').textContent = '💰 Bakiye yüklenemedi.';
        });
        refresh();

        const selectGame = key => {
            game = key;
            modal.querySelector('[data-name]').textContent = labels[key];
            tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.game === key));
            const choice = modal.querySelector('[data-choice]');
            choice.replaceChildren();
            for(const [value, label] of options[key] || [['auto', key === 'crash' ? '2× otomatik çekim' : 'Şansını dene']]) {
                const opt = new Option(label, value);
                choice.add(opt);
            }
        };

        for(const key of keys) {
            const b = document.createElement('button');
            b.dataset.game = key;
            b.textContent = labels[key];
            b.onclick = () => selectGame(key);
            tabs.append(b);
        }
        selectGame(game);

        modal.querySelector('[data-play]').onclick = async () => {
            const button = modal.querySelector('[data-play]'),
                  stage = modal.querySelector('.eg-stage'),
                  result = modal.querySelector('.eg-result'),
                  controls = modal.querySelector('[data-controls]');
            
            if(roomMode && !id) {
                result.textContent = 'Önce odaya gir.';
                return;
            }
            button.disabled = true;
            controls.replaceChildren();
            result.textContent = 'Oyun başlıyor…';
            try {
                const data = await api('/games/' + game + '/play', {
                    method: 'POST',
                    body: JSON.stringify({
                        room_id: roomMode ? id : null,
                        choice: modal.querySelector('[data-choice]').value,
                        stake: Number(modal.querySelector('[data-stake]').value)
                    })
                });
                await animate(game, data.data, stage);
                result.textContent = 'Sonuç: ' + data.result + ' • Yatırılan: ' + data.stake + ' • Ödül: ' + data.payout + ' Lidya';
                
                if(game === 'blackjack' && data.result === 'pending') {
                    for(const [action, label] of [['hit', 'Kart çek'], ['stand', 'Dur']]) {
                        const b = document.createElement('button');
                        b.textContent = label;
                        b.onclick = async () => {
                            controls.querySelectorAll('button').forEach(x => x.disabled = true);
                            try {
                                const next = await api('/games/blackjack/' + encodeURIComponent(data.data.round_id) + '/action', {
                                    method: 'POST',
                                    body: JSON.stringify({ action })
                                });
                                await animate('blackjack', {...next.state, state: next.state, result: next.result}, stage);
                                result.textContent = 'Sonuç: ' + next.result + ' • Ödül: ' + (next.payout || 0) + ' Lidya';
                                if(next.status === 'finished') controls.replaceChildren();
                                else controls.querySelectorAll('button').forEach(x => x.disabled = false);
                                refresh();
                            } catch(e) {
                                result.textContent = e.message;
                                controls.querySelectorAll('button').forEach(x => x.disabled = false);
                            }
                        };
                        controls.append(b);
                    }
                }
                refresh();
            } catch(e) {
                result.textContent = e.message || 'Oyun başlatılamadı.';
            } finally {
                button.disabled = false;
            }
        };
    }

    window.ErisChatGames = { open };
})();
