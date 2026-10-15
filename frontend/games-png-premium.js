(() => {
'use strict';
const base=new URL('./assets/lidya-games-png/',document.currentScript.src);
const theme=()=>document.documentElement.dataset.erisTheme==='dark'?'dark':'light';
const cards={"wheel":["Şans Çarkı","Çarkın liderleri"],"crash":["Crash","Zirveye yükselenler"],"blackjack":["Blackjack","Masanın ustaları"],"slot":["Klasik Slot","Hazinenin sahipleri"],"cups":["Dört Kupa","Doğru seçimin ödülü"],"horse_race":["At Yarışı","Pistin şampiyonları"],"vault":["Kasa","Kasayı açanlar"],"dede":["Dede","Yıldırımın gücü"],"seker":["Şeker Sarayı","Tatlı zaferler"],"balikci":["Balıkçı Hasan","Günün büyük avı"],"prenses":["Prenses","Yıldızların zirvesi"],"dogparty":["Dog Party","Patili zaferler"],"candy":["Candy Ultimate","Renkli kazançlar"],"kovboy":["Kovboy","Kasabanın liderleri"],"bastet":["Bastet’in Hazinesi","Kedilerin hazinesi"],"altin":["Altın Şöleni","Dört hazine, tek şölen"],"kure":["Kaderin Küresi","Kaderin kazananları"],"firavun":["Firavun’un Sırrı","Antik hazinenin izinde"],"aztek":["Aztek Hazinesi","Tapınağın zirvesi"],"ares":["Ares’in Gazabı","Zaferin gücü"]};
const url=key=>new URL(cards[key]?'../lidya-ranking-v2/'+theme()+'/'+key+'.png':theme()+'/scene-'+key+'.png',base).href;
function update(){
 const title=document.querySelector('#games>.title');if(title){title.textContent='Oyunlar';title.style.setProperty('--pg-header','url("'+url('header')+'")');}
 for(const button of document.querySelectorAll('.eg-launcher-card[data-game]')){
  const key=button.dataset.game;if(cards[key]){button.classList.add('lgm-card');button.setAttribute('aria-label',cards[key][0]+' oyununu aç');const title=button.querySelector('.eg-lc-title'),desc=button.querySelector('.eg-lc-desc');if(title&&title.textContent!==cards[key][0])title.textContent=cards[key][0];if(desc&&desc.textContent!==cards[key][1])desc.textContent=cards[key][1];}let picture=button.querySelector(':scope>.pg-cover');if(!picture){picture=document.createElement('img');picture.className='pg-cover';picture.alt='';picture.setAttribute('aria-hidden','true');picture.decoding='async';button.prepend(picture);}const src=url(key);if(picture.src!==src)picture.src=src;if(cards[key]){picture.loading='lazy';picture.decoding='async';}const play=button.querySelector('.eg-lc-play');if(play&&!play.querySelector('span')){const label=document.createElement('span');label.textContent=play.textContent.replace(/[→›]/g,'').trim()||'Oyna';const arrow=document.createElement('span');arrow.textContent='→';arrow.setAttribute('aria-hidden','true');play.replaceChildren(label,arrow);}
  if(cards[key]&&!button.querySelector('.lgm-copy')){const copy=document.createElement('span');copy.className='lgm-copy';for(const child of [...button.children])if(child.matches('.eg-lc-title,.eg-lc-desc,.eg-lc-play'))copy.append(child);button.append(copy);}
 }
 const modal=document.getElementById('erisGamesModal');if(modal){modal.style.setProperty('--pg-header','url("'+url('header')+'")');const key=modal.querySelector('.eg-keys button.active')?.dataset.game;if(key)modal.dataset.pngGame=key;}
}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;update()})}
function start(){update();const games=document.getElementById('games');if(games)new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.classList.contains('pg-cover'))))schedule()}).observe(games,{childList:true,subtree:true});new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='erisGamesModal'||n.closest?.('#erisGamesModal')))))schedule()}).observe(document.body,{childList:true,subtree:true});}
window.addEventListener('erischat:theme',schedule);
new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

