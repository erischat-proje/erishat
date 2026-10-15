(() => {
'use strict';
const base=new URL('./assets/lidya-games-png/',document.currentScript.src);
const theme=()=>document.documentElement.dataset.erisTheme==='dark'?'dark':'light';
const custom={aztek:new URL('../lidya-aztek/menu-cover.png',base).href,ares:new URL('../lidya-ares/menu-cover.png',base).href,kure:new URL('../lidya-kure/menu-cover.png',base).href,altin:new URL('../lidya-altin/menu-cover.png',base).href,bastet:new URL('../lidya-bastet/menu-cover.png',base).href,firavun:new URL('../lidya-firavun/menu-cover.png',base).href,kovboy:new URL('../lidya-kovboy/menu-cover.png',base).href,candy:new URL('../lidya-candy/menu-cover.png',base).href,prenses:new URL('../lidya-prenses/menu-cover-wide.png',base).href,dogparty:new URL('../lidya-dogparty/menu-cover-wide.png',base).href,seker:new URL('../lidya-seker/menu-cover-v2.png',base).href,balikci:new URL('../lidya-balikci/menu-cover.png',base).href};
const url=key=>key==='dede'?new URL('../lidya-dede-png/'+theme()+'/scene.png',base).href:custom[key]||new URL(theme()+'/scene-'+key+'.png',base).href;
function update(){
 const title=document.querySelector('#games>.title');if(title){title.textContent='Oyunlar';title.style.setProperty('--pg-header','url("'+url('header')+'")');}
 for(const button of document.querySelectorAll('.eg-launcher-card[data-game]')){
  const key=button.dataset.game;let picture=button.querySelector(':scope>.pg-cover');if(!picture){picture=document.createElement('img');picture.className='pg-cover';picture.alt='';picture.setAttribute('aria-hidden','true');picture.decoding='async';button.prepend(picture);}const src=url(key);if(picture.src!==src)picture.src=src;const play=button.querySelector('.eg-lc-play');if(play&&!play.querySelector('span')){const label=document.createElement('span');label.textContent=play.textContent.replace(/[→›]/g,'').trim()||'Oyna';const arrow=document.createElement('span');arrow.textContent='→';arrow.setAttribute('aria-hidden','true');play.replaceChildren(label,arrow);}
 }
 const modal=document.getElementById('erisGamesModal');if(modal){modal.style.setProperty('--pg-header','url("'+url('header')+'")');const key=modal.querySelector('.eg-keys button.active')?.dataset.game;if(key)modal.dataset.pngGame=key;}
}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;update()})}
function start(){update();const games=document.getElementById('games');if(games)new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.classList.contains('pg-cover'))))schedule()}).observe(games,{childList:true,subtree:true});new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='erisGamesModal'||n.closest?.('#erisGamesModal')))))schedule()}).observe(document.body,{childList:true,subtree:true});}
window.addEventListener('erischat:theme',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

