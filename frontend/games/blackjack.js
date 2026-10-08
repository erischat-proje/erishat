(() => {
'use strict';

const css = `
.eris-bj-table{
 position:relative;width:100%;box-sizing:border-box;
 min-height:330px;padding:17px 10px 20px;
 overflow:hidden;border-radius:24px;
 background:radial-gradient(ellipse at 50% 45%,#176b49 0%,#0a3929 52%,#041d17 100%);
 border:3px solid #c49a45;
 box-shadow:inset 0 0 0 3px #073222,inset 0 0 32px #0008,0 12px 28px #0005;
 color:#fff;text-align:center;
}
.eris-bj-table:before{
 content:"";position:absolute;inset:16px 9px;
 border:1px solid #e8c57c65;border-radius:48%;
 pointer-events:none;
}
.eris-bj-label{position:relative;font:800 11px system-ui;letter-spacing:2px;color:#e8cf91}
.eris-bj-total{position:relative;min-height:20px;margin:5px 0;color:#f5e6b7;font:700 13px system-ui}
.eris-bj-hand{position:relative;display:flex;justify-content:center;align-items:center;gap:5px;min-height:86px;flex-wrap:wrap}
.eris-bj-card{
 position:relative;width:53px;height:76px;box-sizing:border-box;
 display:flex;align-items:center;justify-content:center;flex-direction:column;
 border-radius:8px;border:2px solid #fff;
 background:linear-gradient(145deg,#fff,#e9edf2);
 color:#18212d;box-shadow:0 5px 12px #0008;
 font:900 19px Georgia,serif;
 animation:erisBjDeal .35s cubic-bezier(.2,.8,.2,1) both;
}
.eris-bj-card.red{color:#c51e36}
.eris-bj-card small{font-size:25px;line-height:1}
.eris-bj-card.back{
 border-color:#d8b567;
 background:repeating-linear-gradient(45deg,#17462f 0 5px,#225b3c 5px 10px);
 color:#f8dc9d;font:900 11px system-ui;
 box-shadow:inset 0 0 0 3px #123b2a,0 5px 12px #0008;
}
.eris-bj-brand{position:relative;margin:7px auto 9px;font:900 16px Georgia,serif;letter-spacing:3px;color:#f4d48d;text-shadow:0 2px 5px #000}
.eris-bj-status{position:relative;font:600 10px system-ui;color:#d7e9da;margin-top:7px}

#erisGamesModal:has(.eris-bj-table) [data-controls]{
 display:grid!important;
 grid-template-columns:1fr 1fr;
 gap:10px!important;
 width:100%;
 margin-top:12px;
}
#erisGamesModal:has(.eris-bj-table) [data-controls] button{
 min-height:52px;
 border:1px solid #d6ad61;
 border-radius:13px;
 background:linear-gradient(160deg,#215e42,#103a2a);
 color:#fff4d5;
 font:800 15px system-ui;
 box-shadow:0 5px 12px #0005,inset 0 1px #ffffff30;
 touch-action:manipulation;
}
#erisGamesModal:has(.eris-bj-table) [data-controls] button:first-child{
 background:linear-gradient(160deg,#267a54,#145239);
}
#erisGamesModal:has(.eris-bj-table) [data-controls] button:last-child{
 background:linear-gradient(160deg,#9b7232,#66451e);
}
#erisGamesModal:has(.eris-bj-table) [data-controls] button:disabled{
 opacity:.45;
}
@keyframes erisBjDeal{
 from{opacity:0;transform:translateY(-22px) rotate(-9deg) scale(.85)}
 to{opacity:1;transform:translateY(0) rotate(0) scale(1)}
}
@media(max-width:370px){
 .eris-bj-card{width:46px;height:68px}
 .eris-bj-card small{font-size:22px}
 .eris-bj-table{padding-left:6px;padding-right:6px}
}
`;
if (!document.getElementById('erisBjStyle')) {
 const style = document.createElement('style');
 style.id = 'erisBjStyle';
 style.textContent = css;
 document.head.append(style);
}

function cardElement(card, delay = 0) {
 const raw = String(card || '');
 const suit = raw.slice(-1);
 const rank = raw.slice(0, -1);
 const symbol = {H:'♥',D:'♦',C:'♣',S:'♠'}[suit] || '◆';
 const el = document.createElement('div');
 el.className = 'eris-bj-card' + (suit === 'H' || suit === 'D' ? ' red' : '');
 el.style.animationDelay = delay + 'ms';
 const number = document.createElement('span');
 number.textContent = rank;
 const icon = document.createElement('small');
 icon.textContent = symbol;
 el.append(number, icon);
 return el;
}
function cardBack() {
 const el = document.createElement('div');
 el.className = 'eris-bj-card back';
 el.textContent = 'ERIS';
 return el;
}
function total(cards) {
 let n = 0, aces = 0;
 for (const card of cards) {
  const rank = String(card).slice(0,-1);
  if (rank === 'A') { n += 11; aces++; }
  else if (['J','Q','K'].includes(rank)) n += 10;
  else n += Number(rank) || 0;
 }
 while(n > 21 && aces) { n -= 10; aces--; }
 return n;
}

window.ErisGameBlackjack = {
 options: [['hit','Kart Çek'],['stand','Dur']],
 render(container) {
  container.innerHTML = `
   <div class="eris-bj-table">
    <div class="eris-bj-label">♠ KRUPİYE ♠</div>
    <div id="bjDealerCards" class="eris-bj-hand"></div>
    <div id="bjDealerTotal" class="eris-bj-total"></div>
    <div class="eris-bj-brand">BLACKJACK 21</div>
    <div id="bjPlayerTotal" class="eris-bj-total"></div>
    <div id="bjPlayerCards" class="eris-bj-hand"></div>
    <div class="eris-bj-label">♥ OYUNCU ♥</div>
    <div class="eris-bj-status">21'E EN YAKIN EL KAZANIR</div>
   </div>`;
  container.querySelector('#bjDealerCards').append(cardBack(),cardBack());
  container.querySelector('#bjPlayerCards').append(cardBack(),cardBack());
 },
 async animate(container, data) {
  const state = data?.state || data || {};
  const hands = state.hands || [];
  const player = hands[0]?.cards || state.player_hand || [];
  const finished = state.phase === 'finished' ||
    ['win','loss','push','blackjack'].includes(state.result);
  const dealer = finished
    ? (data?.dealer_hand?.length > state.dealer_hand?.length
        ? data.dealer_hand : state.dealer_hand || [])
    : (state.dealer_hand || []).slice(0, 1);
  const pbox = container.querySelector('#bjPlayerCards');
  const dbox = container.querySelector('#bjDealerCards');
  if (!pbox || !dbox) return;
  pbox.replaceChildren();
  dbox.replaceChildren();
  player.forEach((c,i) => pbox.append(cardElement(c,i*110)));
  dealer.forEach((c,i) => dbox.append(cardElement(c,(i+1)*110)));
  if (!finished && dealer.length) dbox.append(cardBack());
  const pt = container.querySelector('#bjPlayerTotal');
  const dt = container.querySelector('#bjDealerTotal');
  if (pt) pt.textContent = player.length ? 'EL TOPLAMI: ' + (hands[0]?.total ?? state.player_total ?? total(player)) : '';
  if (dt) dt.textContent = finished && dealer.length
   ? 'KRUPİYE: ' + (state.dealer_total ?? total(dealer))
   : dealer.length ? 'KRUPİYE: ?' : '';
  await new Promise(resolve => setTimeout(resolve,450));
 }
};
})();