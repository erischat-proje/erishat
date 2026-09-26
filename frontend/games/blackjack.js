(() => {
    'use strict';

    const BLACKJACK_OPTIONS = [
        ['hit', 'Kart Çek (Hit)'],
        ['stand', 'Dur (Stand)']
    ];

    const BlackjackGame = {
        options: BLACKJACK_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #0f291e 0%, #06120c 100%); border-radius:14px; border:1px solid rgba(34,197,94,0.3); padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                    <div style="text-align:center;">
                        <div style="font-size:10px; color:#86efac; font-weight:600; margin-bottom:4px;">KRUPİYE</div>
                        <div id="bjDealerCards" style="display:flex;justify-content:center;gap:7px;min-height:66px;align-items:center;perspective:500px">
                            <div style="width:42px;height:58px;border-radius:7px;background:repeating-linear-gradient(45deg,#16482f,#16482f 4px,#1c5b3b 4px,#1c5b3b 8px);border:2px solid #dbbd72;display:grid;place-items:center;color:#f3dc9a;font:800 8px system-ui;box-shadow:0 5px 12px #0008">ERIS</div><div style="width:42px;height:58px;border-radius:7px;background:repeating-linear-gradient(45deg,#16482f,#16482f 4px,#1c5b3b 4px,#1c5b3b 8px);border:2px solid #dbbd72;display:grid;place-items:center;color:#f3dc9a;font:800 8px system-ui;box-shadow:0 5px 12px #0008">ERIS</div>
                        </div>
                        <div id="bjDealerTotal" style="font-size:10px;color:#c8d9cf;min-height:14px;margin-top:4px"></div>
                    </div>
                    <div style="text-align:center; font-size:12px; color:#facc15; font-weight:700;">BLACKJACK 21</div>
                    <div style="text-align:center;">
                        <div id="bjPlayerCards" style="display:flex;justify-content:center;gap:7px;min-height:66px;align-items:center;perspective:500px">
                            <div style="width:42px;height:58px;border-radius:7px;background:repeating-linear-gradient(45deg,#16482f,#16482f 4px,#1c5b3b 4px,#1c5b3b 8px);border:2px solid #dbbd72;display:grid;place-items:center;color:#f3dc9a;font:800 8px system-ui;box-shadow:0 5px 12px #0008">ERIS</div><div style="width:42px;height:58px;border-radius:7px;background:repeating-linear-gradient(45deg,#16482f,#16482f 4px,#1c5b3b 4px,#1c5b3b 8px);border:2px solid #dbbd72;display:grid;place-items:center;color:#f3dc9a;font:800 8px system-ui;box-shadow:0 5px 12px #0008">ERIS</div>
                        </div>
                        <div id="bjPlayerTotal" style="font-size:10px;color:#f6e6a7;min-height:14px;margin-top:4px"></div>
                        <div style="font-size:10px; color:#86efac; font-weight:600; margin-top:4px;">OYUNCU</div>
                    </div>
                </div>
            `;
        },

        async animate(container, data) {
            const playerBox = container.querySelector('#bjPlayerCards');
            const dealerBox = container.querySelector('#bjDealerCards');
            if (!playerBox || !dealerBox) return;

            const state = data?.state || data;
            const playerHand = state?.hands?.[0]?.cards || state?.player_hand || [];
            const dealerHand = state?.dealer_hand || [];
            const face = (card) => {
                const rank = String(card).slice(0, -1), suit = String(card).slice(-1);
                const symbol = ({H:'♥',D:'♦',C:'♣',S:'♠'})[suit] || '•';
                const el = document.createElement('div'); el.className = 'bj-card-face';
                el.style.cssText = `width:42px;height:58px;border-radius:7px;background:linear-gradient(145deg,#fff,#e9edf3);color:${suit==='H'||suit==='D'?'#c5223b':'#18212d'};display:grid;place-content:center;text-align:center;font:800 13px system-ui;box-shadow:0 5px 12px #0008;border:1px solid #ffffff;animation:bj-card-in .32s cubic-bezier(.2,.8,.2,1) both`;
                el.textContent = `${rank}${symbol}`; return el;
            };
            const back = () => { const el=document.createElement('div');el.className='bj-card-back';el.style.cssText='width:42px;height:58px;border-radius:7px;background:repeating-linear-gradient(45deg,#16482f,#16482f 4px,#1c5b3b 4px,#1c5b3b 8px);border:2px solid #dbbd72;display:grid;place-items:center;color:#f3dc9a;font:800 8px system-ui;box-shadow:0 5px 12px #0008';el.textContent='ERIS';return el; };
            playerBox.replaceChildren(); dealerBox.replaceChildren();
            playerHand.forEach((card, i) => { const el=face(card);el.style.animationDelay=`${i*150}ms`;playerBox.append(el); });
            dealerHand.forEach((card, i) => { const el=face(card);el.style.animationDelay=`${(playerHand.length+i)*150}ms`;dealerBox.append(el); });
            if (state?.phase !== 'finished' && dealerHand.length) dealerBox.append(back());
            const playerTotal = state?.hands?.[0]?.total ?? state?.player_total;
            const dealerTotal = state?.dealer_total;
            const pt=container.querySelector('#bjPlayerTotal'),dt=container.querySelector('#bjDealerTotal');
            if(pt)pt.textContent=playerTotal==null?'':`Toplam ${playerTotal}`;
            if(dt)dt.textContent=dealerTotal==null?'':`Toplam ${dealerTotal}`;
            await new Promise(resolve => setTimeout(resolve, Math.max(450, playerHand.length * 160)));
        }
    };

    window.ErisGameBlackjack = BlackjackGame;
})();
