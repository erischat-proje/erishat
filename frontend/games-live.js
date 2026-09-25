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
                width: min(620px, 100%);
                max-height: 94vh;
                overflow: auto;
                border: 1px solid rgba(166, 140, 255, 0.35);
                border-radius: 26px;
                background: linear-gradient(145deg, #181028, #0a0712);
                padding: 20px;
                box-shadow: 0 35px 110px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.15);
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
                background: linear-gradient(145deg, #221836, #161024);
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
                min-height: 200px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                overflow: hidden;
                border-radius: 20px;
                background: radial-gradient(circle at center, rgba(82, 41, 128, 0.35), #0b0716 75%);
                border: 1px solid rgba(138, 92, 255, 0.25);
                padding: 16px;
                margin: 16px 0;
                box-shadow: inset 0 0 30px rgba(0,0,0,0.6);
            }

            .eg-3d-wheel {
                width: 120px; height: 120px; border-radius: 50%;
                background: conic-gradient(#ff4757 0deg 72deg, #2ed573 72deg 144deg, #ffa502 144deg 216deg, #3742fa 216deg 288deg, #9b59b6 288deg 360deg);
                border: 4px solid #fff; box-shadow: 0 0 25px rgba(255,255,255,0.4);
                position: relative; transition: transform 2.5s cubic-bezier(0.15, 0.85, 0.15, 1);
            }
            .eg-3d-wheel::after {
                content: '▼'; position: absolute; top: -16px; left: 50%; transform: translateX(-50%);
                color: #ff4757; font-size: 16px; text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            }

            .eg-crash-box { text-align: center; }
            .eg-crash-rocket { font-size: 44px; display: inline-block; animation: rocketFloat 1.2s ease-in-out infinite alternate; }
            .eg-crash-mult { font-size: 38px; font-weight: 800; color: #ffb347; text-shadow: 0 0 20px rgba(255,179,71,0.6); }
            @keyframes rocketFloat { 0% { transform: translateY(0) rotate(-10deg); } 100% { transform: translateY(-8px) rotate(5deg); } }

            .eg-bj-table { display: flex; flex-direction: column; gap: 8px; width: 100%; align-items: center; }
            .eg-bj-row { display: flex; gap: 6px; align-items: center; justify-content: center; }
            .eg-card {
                background: linear-gradient(145deg, #ffffff, #e6e6e6); color: #1a1a1a;
                width: 40px; height: 58px; border-radius: 6px; font-weight: 700; font-size: 13px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                box-shadow: 0 6px 12px rgba(0,0,0,0.4);
            }

            .eg-track { width: 100%; display: flex; flex-direction: column; gap: 5px; }
            .eg-horse-lane { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); padding: 3px 6px; border-radius: 6px; font-size: 11px; }
            .eg-horse-bar { flex-grow: 1; margin: 0 8px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
            .eg-horse-progress { height: 100%; background: linear-gradient(90deg, #7c4ee4, #2ed573); border-radius: 3px; width: 0%; transition: width 0.35s ease; }

            .eg-grid-3d { display: flex; gap: 10px; justify-content: center; }
            .eg-box-3d {
                width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(145deg, #2a1b4e, #180f2e);
                border: 2px solid rgba(166, 140, 255, 0.3); display: grid; place-items: center; font-size: 22px;
                box-shadow: 0 8px 16px rgba(0,0,0,0.5); transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .eg-box-3d.active { transform: translateY(-8px) scale(1.1); border-color: #a77aff; background: #6236df; box-shadow: 0 0 20px #a77aff; }
            .eg-box-3d.winner { transform: translateY(-12px) scale(1.15); border-color: #ffd700; background: #f39c12; box-shadow: 0 0 25px #f1c40f; color: #1a1021; }

            #erisGamesModal .eg-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
            #erisGamesModal .eg-form label { font-size: 11px; color: rgba(255,255,255,0.7); }
            #erisGamesModal .eg-form select { max-width: 140px; padding: 8px; }
            #erisGamesModal .eg-result { min-height: 38px; line-height: 1.4; color: #f5dcff; font-size: 12px; margin-top: 6px; text-align: center; font-weight: 600; }
        `;
        document.head.append(s);
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function animate(key, data, stage) {
        stage.replaceChildren();
        if(key === 'wheel') {
            const container = document.createElement('div');
            container.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:10px;';
            const wheel = document.createElement('div');
            wheel.className = 'eg-3d-wheel';
            const text = document.createElement('div');
            text.style.cssText = 'font-weight:700; color:#ffd700; font-size:13px;';
            text.textContent = 'Çark dönüyor...';
            container.append(wheel, text);
            stage.append(container);
            wheel.style.transform = `rotate(${1440 + Math.random() * 360}deg)`;
            await wait(2200);
            text.textContent = 'Kazanan: ' + (data.result || 'Ödül');
            return;
        }
        if(key === 'crash') {
            const box = document.createElement('div');
            box.className = 'eg-crash-box';
            box.innerHTML = '<div class="eg-crash-rocket">🚀</div><div class="eg-crash-mult">1.00×</div>';
            stage.append(box);
            const multEl = box.querySelector('.eg-crash-mult');
            for(const step of data?.animation?.curve || [1.1, 1.4, 2.0, 3.5]) {
                multEl.textContent = Number(step).toFixed(2) + '×';
                await wait(200);
            }
            multEl.textContent = '💥 ' + Number(data.multiplier || data.payout || 2).toFixed(2) + '×';
            return;
        }
        if(key === 'blackjack') {
            const state = data.state || {};
            const pHand = state.player_hand || data.player_hand || ['🂡', '🂊'];
            const dHand = data.dealer_hand || ['🂠', '🂋'];
            const table = document.createElement('div');
            table.className = 'eg-bj-table';
            
            const dRow = document.createElement('div');
            dRow.className = 'eg-bj-row';
            dRow.innerHTML = '<span style="font-size:11px; color:#aaa; width:55px">Krupiye:</span>';
            dHand.forEach(c => { const el = document.createElement('div'); el.className = 'eg-card'; el.textContent = c; dRow.append(el); });

            const pRow = document.createElement('div');
            pRow.className = 'eg-bj-row';
            pRow.innerHTML = '<span style="font-size:11px; color:#a77aff; width:55px">Sen:</span>';
            pHand.forEach(c => { const el = document.createElement('div'); el.className = 'eg-card'; el.textContent = c; pRow.append(el); });

            table.append(dRow, pRow);
            stage.append(table);
            return;
        }
        if(key === 'horse_race') {
            const track = document.createElement('div');
            track.className = 'eg-track';
            stage.append(track);
            const rows = Array.from({length: 7}, (_, i) => {
                const row = document.createElement('div');
                row.className = 'eg-horse-lane';
                row.innerHTML = `<b>🐎 ${i+1}</b><div class="eg-horse-bar"><div class="eg-horse-progress"></div></div><span>🏁</span>`;
                track.append(row);
                return row.querySelector('.eg-horse-progress');
            });
            for(const checkpoint of data?.animation?.checkpoints || []) {
                rows.forEach((bar, i) => { bar.style.width = Math.min(95, checkpoint['horse_' + (i + 1)] || 0) + '%'; });
                await wait(350);
            }
            rows.forEach((bar, i) => { bar.style.width = (data.result === 'horse_' + (i + 1) ? '96%' : '70%'); });
            await wait(400);
            return;
        }
        const map = options[key] || [['item1','💎'],['item2','⭐'],['item3','🔥'],['item4','👑']];
        const grid = document.createElement('div');
        grid.className = 'eg-grid-3d';
        const boxes = map.map(([id]) => {
            const box = document.createElement('div');
            box.className = 'eg-box-3d';
            box.textContent = key === 'cups' ? '🥤' : key === 'vault' ? '🎁' : key === 'roulette' ? '🎯' : '💎';
            grid.append(box);
            return { id, box };
        });
        stage.append(grid);
        for(let i = 0; i < 14; i++) {
            boxes.forEach(x => x.box.classList.remove('active'));
            boxes[i % boxes.length].box.classList.add('active');
            await wait(60 + i * 7);
        }
        boxes.forEach(x => x.box.classList.remove('active'));
        const winIdx = boxes.findIndex(x => x.id === data.result);
        (boxes[Math.max(0, winIdx)] || boxes[0]).box.classList.add('winner');
    }

    function open(scope = 'main', roomId = null, selected = null) {
        style();
        modal?.remove();
        modal = document.createElement('div');
        modal.id = 'erisGamesModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:1100; background:rgba(2, 1, 7, 0.88); display:grid; place-items:center; padding:10px; color:white; backdrop-filter:blur(8px);';
        modal.innerHTML = `
            <div class="eg-panel">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h2 style="margin:0; font-size:17px; font-weight:700;">🎮 Oyun Merkezi</h2>
                    <button data-close aria-label="Kapat" style="background:transparent; border:none; font-size:20px; padding:2px 6px;">×</button>
                </div>
                <p style="font-size:11px; color:rgba(255,255,255,0.6); margin:4px 0 10px 0;">Ücretsiz oyna veya Lidya yatır. Sonuç sunucuda hesaplanır.</p>
                <div data-balance style="font-size:12px; font-weight:600; color:#e6af34; margin-bottom:8px;"></div>
                <div class="eg-keys"></div>
                <h3 data-name style="margin:8px 0 2px 0; font-size:14px; color:#a77aff;"></h3>
                <div class="eg-stage" aria-live="polite">Bir oyun seç ve heyecanı başlat!</div>
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
            result.textContent = 'Oyun başlatılıyor…';
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
                result.textContent = '🎉 Sonuç: ' + data.result + ' • Yatırılan: ' + data.stake + ' • Ödül: ' + data.payout + ' Lidya';
                
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
                                result.textContent = '🎉 Sonuç: ' + next.result + ' • Ödül: ' + (next.payout || 0) + ' Lidya';
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
