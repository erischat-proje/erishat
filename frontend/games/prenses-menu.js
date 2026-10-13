(()=>{'use strict';
const base=new URL('../assets/lidya-prenses/',document.currentScript.src);
const scene=()=>new URL('menu-cover.png',base).href;
function install(){
 const launcher=document.querySelector('#games .eg-launcher-grid');
 if(launcher&&!launcher.querySelector('.pp-launcher-card')){const b=document.createElement('button');b.type='button';b.className='pp-launcher-card';b.dataset.game='prenses';b.innerHTML='<img class="pp-cover" alt="" aria-hidden="true"><span class="pp-lc-title">Prenses</span><span class="pp-lc-desc">Yıldız sihri · Kanatlı kalpler ve ücretsiz dönüşler</span><span class="pp-lc-play">Oyna →</span>';b.onclick=()=>window.ErisGamePrenses.open();launcher.append(b);}
 const image=launcher?.querySelector('.pp-cover');if(image&&image.src!==scene())image.src=scene();
 const m=document.getElementById('erisGamesModal'),grid=m?.querySelector('.eg-keys');if(!grid||grid.style.display==='none'||m.querySelector('[data-scope]')?.textContent!=='KİŞİSEL OYUNLAR'||grid.querySelector('[data-game="prenses"]'))return;
 const b=document.createElement('button');b.type='button';b.dataset.game='prenses';b.textContent='Prenses';b.onclick=()=>window.ErisGamePrenses.open();grid.append(b);
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install();});};new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});install();
})();
