
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
            #erisGamesModal .eg-wheel-pick:active{transform:scale(.96)}
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

        const loadGameModule = key => {
            game = key;
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
            }

            const choice = modal.querySelector('[data-choice]');
            const wheelPicks = modal.querySelector('[data-wheel-picks]');

            choice.replaceChildren();
            wheelPicks.replaceChildren();
            wheelPicks.classList.remove('show');
            modal.classList.toggle('eg-wheel-mode', key === 'wheel');

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
                    total.style.cssText='display:none;color:#ffd477;margin-top:4px;font-weight:900';
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

        modal.querySelectorAll('[data-stake-value]').forEach(preset => preset.onclick = () => {
            modal.querySelector('[data-stake]').value = preset.dataset.stakeValue;
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
                n.textContent='🪙 '+Number(b.amount).toLocaleString('tr-TR')+' Lidya  '+(icons[b.choice]||'');
                n.style.cssText='position:absolute;left:-180px;top:'+(Math.random()*14)+'px;font-weight:900;font-size:11px;white-space:nowrap;transition:transform 3.2s linear;color:#ffd477';
                feed.appendChild(n);
                requestAnimationFrame(()=>requestAnimationFrame(()=>n.style.transform='translateX(calc(100vw + 220px))'));
                setTimeout(()=>n.remove(),3400);
            });
            const clock=modal.querySelector('[data-wheel-clock]');
            if(clock){clock.style.display='block';clock.textContent=(x.betting_open?'⏱ ':'🔒 ')+x.remaining_seconds+' sn';}
            modal.querySelectorAll('.eg-wheel-pick').forEach(b=>b.disabled=!x.betting_open);
            modal.querySelectorAll('[data-wheel-total]').forEach(el=>{
                const v=x.totals?.[el.dataset.wheelTotal];
                el.style.display=x.totals?'block':'none';
                const mine=Number(x.my_bets?.[el.dataset.wheelTotal]||0);
                el.style.display=mine>0||x.totals?'block':'none';
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
                let wheelStake=100;
        let activeBlackjackRoundId = null;

        modal.querySelector('[data-play]').onclick = async () => {
            const button = modal.querySelector('[data-play]'),
                  stage = modal.querySelector('.eg-stage'),
                  result = modal.querySelector('[data-result]') || modal.querySelector('.eg-result'),
                  controls = modal.querySelector('[data-controls]');

            button.disabled = true;
            controls.replaceChildren();
            modal.querySelector('.eg-result').textContent = 'Oyun başlatılıyor…';

            try {
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
                    : game === 'roulette' ? choiceValue
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

                const mod = gameModules[game]();
                if (mod && typeof mod.animate === 'function') {
                    await mod.animate(stage, {
                        ...res.data,
                        result: res.payout > 0 ? 'win' : 'lose',
                        result_key: res.result,
                        winning_cup: String(res.result).replace('cup_', ''),
                        winner: String(res.result).replace('horse_', ''),
                        winning_index: ['rose','heart','star','diamond','crown','gift','fire','gem','jackpot'].indexOf(res.result),
                        multiplier: res.data?.multiplier
                    });
                }
                modal.querySelector('.eg-result').textContent = game === 'blackjack' && res.result === 'pending'
                    ? 'İlk el dağıtıldı. Kartlarını ve krupiyenin açık kartını inceleyip hamleni seç.'
                    : 'Sonuç: ' + res.result + ' • Yatırılan: ' + res.stake + ' • Ödül: ' + res.payout + ' Lidya';

                if (game === 'blackjack' && res.result === 'pending') {
                    activeBlackjackRoundId = res.data.round_id;
                    for (const [action, label] of [['hit', 'Kart Çek'], ['stand', 'Dur']]) {
                        const b = document.createElement('button');
                        b.textContent = label;
                        b.onclick = async () => {
                            controls.querySelectorAll('button').forEach(x => x.disabled = true);
                            try {
                                const next = await api('/games/blackjack/' + encodeURIComponent(activeBlackjackRoundId) + '/action', {
                                    method: 'POST',
                                    body: JSON.stringify({ action })
                                });
                                if (mod && typeof mod.animate === 'function') {
                                    await mod.animate(stage, { ...next.state, state: next.state, result: next.result, newCard: next.state?.hands?.[0]?.cards?.slice(-1)[0] });
                                }
                                modal.querySelector('.eg-result').textContent = '🎉 Sonuç: ' + next.result + ' • Ödül: ' + (next.payout || 0) + ' Lidya';
                                if (next.status === 'finished') { controls.replaceChildren(); activeBlackjackRoundId = null; button.disabled = false; }
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
                button.disabled = !!activeBlackjackRoundId;
            }
        };
    }

    window.ErisChatGames = { open };
})();

/* ERIS WHEEL COMPACT FULLSCREEN */
const __erisWheelCompactStyle=document.createElement('style');
__erisWheelCompactStyle.textContent=`
#erisGamesModal.eg-single-game{
  padding:0!important;
  overflow:hidden!important;
}
#erisGamesModal.eg-single-game .eg-panel{
  height:100dvh!important;
  max-height:100dvh!important;
  overflow:hidden!important;
  border-radius:0!important;
  padding:10px 12px!important;
  display:flex!important;
  flex-direction:column!important;
}
#erisGamesModal.eg-single-game .eg-head{
  min-height:34px!important;
  flex:0 0 auto;
}
#erisGamesModal.eg-single-game .eg-head h2{
  font-size:17px!important;
  margin:0!important;
}
#erisGamesModal.eg-single-game .eg-wallet{
  position:absolute!important;
  top:8px!important;
  right:48px!important;
  width:auto!important;
  margin:0!important;
  padding:5px 8px!important;
  border-radius:10px!important;
  font-size:10px!important;
  z-index:5;
}
#erisGamesModal.eg-single-game .eg-wallet [data-scope]{
  display:none!important;
}
#erisGamesModal.eg-single-game [data-name]{
  display:none!important;
}
#erisGamesModal.eg-single-game .eg-stage{
  min-height:0!important;
  flex:1 1 auto!important;
  margin:2px 0!important;
  overflow:hidden!important;
}
#erisGamesModal.eg-single-game [data-wheel-feed]{
  order:-1;
  height:30px!important;
  min-height:30px!important;
  margin:2px 0!important;
  border:1px solid #ffffff12;
  border-radius:10px;
  background:#09071188;
}
#erisGamesModal.eg-single-game [data-wheel-clock]{
  margin:3px 0!important;
}
#erisGamesModal.eg-single-game .eg-form{
  flex:0 0 auto!important;
  margin:2px 0!important;
  gap:5px!important;
}
#erisGamesModal.eg-single-game .eg-wheel-picks{
  gap:5px!important;
}
#erisGamesModal.eg-single-game .eg-result{
  min-height:0!important;
  margin:0!important;
  padding:0!important;
}
#erisGamesModal.eg-single-game [data-wheel-mine]{
  display:none!important;
}
#erisGamesModal.eg-single-game .eris-wheel-caption{
  display:none!important;
}
`;
document.head.appendChild(__erisWheelCompactStyle);

/* ERIS WHEEL MOBILE FIT */
const __erisWheelFit=document.createElement('style');
__erisWheelFit.textContent=`
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-panel{
  padding:7px 9px!important;
  gap:0!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-stage{
  flex:1 1 0!important;
  min-height:145px!important;
  max-height:34dvh!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode [data-wheel-feed]{
  flex:0 0 28px!important;
  height:28px!important;
  min-height:28px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-form{
  padding:6px!important;
  margin:2px 0!important;
  border-radius:12px!important;
  gap:4px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-wheel-picks{
  gap:4px!important;
  margin:0!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-wheel-pick{
  min-height:49px!important;
  padding:3px 2px!important;
  border-radius:10px!important;
  gap:1px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-wheel-pick b{
  font-size:9px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-wheel-pick small{
  font-size:7px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-stake-presets{
  display:grid!important;
  grid-template-columns:repeat(4,1fr)!important;
  width:100%!important;
  gap:3px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-stake-presets button{
  padding:5px 2px!important;
  min-height:27px!important;
  font-size:9px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode [data-wheel-clock]{
  font-size:11px!important;
  line-height:18px!important;
  height:18px!important;
  margin:1px 0!important;
}
`;
document.head.appendChild(__erisWheelFit);


/* WHEEL STAKE ONE ROW */
const __erisWheelStakeCSS=document.createElement('style');
__erisWheelStakeCSS.textContent=`
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-stake-presets{
 display:grid!important;
 grid-template-columns:repeat(8,minmax(0,1fr))!important;
 gap:3px!important;
 width:100%!important;
 flex-wrap:nowrap!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-stake-presets button{
 min-width:0!important;
 width:100%!important;
 padding:6px 0!important;
 min-height:29px!important;
 font-size:9px!important;
 border-radius:9px!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-stake-presets button.wheel-stake-active{
 border-color:#ffd477!important;
 background:#4a3268!important;
 box-shadow:0 0 0 1px #ffd47755,inset 0 0 12px #ffd47718!important;
 color:#fff1bd!important;
}
`;
document.head.appendChild(__erisWheelStakeCSS);

requestAnimationFrame(()=>{
 const m=document.getElementById('erisGamesModal');
 const b=m?.querySelector('[data-stake-value="100"]');
 if(m?.classList.contains('eg-wheel-mode')&&b)b.classList.add('wheel-stake-active');
});

/* WHEEL REMOVE DUPLICATE PAYOUT CAPTION */
const __erisWheelCaptionCSS=document.createElement('style');
__erisWheelCaptionCSS.textContent=`
#erisGamesModal.eg-wheel-mode .eris-wheel-caption{
 display:none!important;
 margin:0!important;
 height:0!important;
}
`;
document.head.appendChild(__erisWheelCaptionCSS);

/* WHEEL REMOVE EMPTY RESULT SPACE */
const __erisWheelResultCSS=document.createElement('style');
__erisWheelResultCSS.textContent=`
#erisGamesModal.eg-single-game.eg-wheel-mode .eg-result:empty{
 display:none!important;
 height:0!important;
 min-height:0!important;
 margin:0!important;
 padding:0!important;
 border:0!important;
}
#erisGamesModal.eg-single-game.eg-wheel-mode [data-wheel-clock]{
 flex:0 0 auto!important;
 margin:3px 0 1px!important;
}
`;
document.head.appendChild(__erisWheelResultCSS);

/* WHEEL FINAL PRO LAYOUT */
const __erisWheelPro=document.createElement('style');
__erisWheelPro.textContent=`
#erisGamesModal.eg-wheel-mode .eg-wallet{
 top:8px!important;
 right:58px!important;
 padding:5px 9px!important;
 font-size:10px!important;
}
#erisGamesModal.eg-wheel-mode .eg-head [data-close]{
 position:absolute!important;
 top:7px!important;
 right:9px!important;
 width:42px!important;
 height:34px!important;
 z-index:20!important;
}
#erisGamesModal.eg-wheel-mode [data-wheel-feed]{
 margin:4px 0 3px!important;
 width:100%!important;
 flex:0 0 28px!important;
}
#erisGamesModal.eg-wheel-mode .eg-stage{
 position:relative!important;
 margin-top:9px!important;
 overflow:visible!important;
}
#erisGamesModal.eg-wheel-mode .eg-stage:before{
 content:"▼";
 position:absolute;
 z-index:30;
 left:50%;
 top:-15px;
 transform:translateX(-50%);
 color:#ffd477;
 font-size:24px;
 line-height:24px;
 text-shadow:0 2px 4px #000,0 0 10px #ffd47799;
 pointer-events:none;
}
#erisGamesModal.eg-wheel-mode .eg-stake-presets{
 grid-template-columns:repeat(8,minmax(0,1fr))!important;
 width:100%!important;
 gap:4px!important;
}
#erisGamesModal.eg-wheel-mode .eg-stake-presets button{
 width:100%!important;
 min-width:0!important;
 padding:7px 1px!important;
 font-size:9px!important;
 border-radius:10px!important;
}
#erisGamesModal.eg-wheel-mode .eg-wheel-result-pop{
 position:fixed;
 z-index:99999;
 left:50%;
 top:50%;
 transform:translate(-50%,-50%) scale(.92);
 width:min(300px,82vw);
 padding:20px 16px;
 border:1px solid #ffd47766;
 border-radius:22px;
 background:linear-gradient(160deg,#21162f,#0e0a16);
 box-shadow:0 20px 70px #000c,0 0 35px #9b63e944;
 text-align:center;
 opacity:0;
 transition:.2s ease;
 pointer-events:none;
}
#erisGamesModal.eg-wheel-mode .eg-wheel-result-pop.show{
 opacity:1;
 transform:translate(-50%,-50%) scale(1);
}
#erisGamesModal.eg-wheel-mode .eg-wheel-result-pop .wr-icon{font-size:50px}
#erisGamesModal.eg-wheel-mode .eg-wheel-result-pop .wr-name{font-size:18px;font-weight:950;margin:4px}
#erisGamesModal.eg-wheel-mode .eg-wheel-result-pop .wr-state{font-size:24px;font-weight:950;color:#ffd477;margin:8px}
#erisGamesModal.eg-wheel-mode .eg-wheel-result-pop .wr-pay{font-size:14px;font-weight:850}
`;
document.head.appendChild(__erisWheelPro);

/* WHEEL FINAL MOBILE ALIGNMENT */
const __erisWheelFinalAlign=document.createElement('style');
__erisWheelFinalAlign.textContent=`
/* Çark altındaki tekrar oran metni kesinlikle yok */
#erisGamesModal.eg-wheel-mode .eris-wheel-note,
#erisGamesModal.eg-wheel-mode .eris-wheel-caption{
 display:none!important;
}

/* games-live tarafından eklenen ikinci oku kaldır; gerçek Wheel pointer kalsın */
#erisGamesModal.eg-wheel-mode .eg-stage:before{
 display:none!important;
 content:none!important;
}

/* Üst alanı biraz aşağı al */
#erisGamesModal.eg-wheel-mode .eg-head{
 margin-top:7px!important;
}
#erisGamesModal.eg-wheel-mode [data-wheel-feed]{
 margin-top:6px!important;
 margin-bottom:5px!important;
}

/* Çark için temiz, ortalanmış alan */
#erisGamesModal.eg-wheel-mode .eg-stage{
 margin:7px 0 3px!important;
 padding:12px 5px 5px!important;
 display:flex!important;
 align-items:center!important;
 justify-content:center!important;
 overflow:visible!important;
}
#erisGamesModal.eg-wheel-mode .eris-wheel-v2{
 padding:0!important;
 margin:0!important;
}
#erisGamesModal.eg-wheel-mode .eris-wheel-wrap{
 width:min(292px,82vw)!important;
 margin:0 auto!important;
 box-sizing:border-box!important;
}
#erisGamesModal.eg-wheel-mode .eris-wheel-wrap:before{
 inset:-5px!important;
}
#erisGamesModal.eg-wheel-mode #proWheelCanvas{
 width:100%!important;
 height:100%!important;
}

/* 8 bahis miktarı kenardan kenara tek sıra */
#erisGamesModal.eg-wheel-mode .eg-stake-presets{
 display:grid!important;
 grid-template-columns:repeat(8,minmax(0,1fr))!important;
 gap:2px!important;
 width:100%!important;
 padding:0!important;
 margin:3px 0 0!important;
}
#erisGamesModal.eg-wheel-mode .eg-stake-presets button{
 min-width:0!important;
 width:100%!important;
 height:34px!important;
 padding:0!important;
 margin:0!important;
 border-radius:9px!important;
 font-size:8px!important;
 letter-spacing:-.35px!important;
 white-space:nowrap!important;
 display:flex!important;
 align-items:center!important;
 justify-content:center!important;
}
`;
document.head.appendChild(__erisWheelFinalAlign);
