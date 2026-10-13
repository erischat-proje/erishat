(()=>{'use strict';
const base=new URL('../assets/lidya-firavun/',document.currentScript.src);
const scene=()=>new URL('menu-cover.png',base).href;
function install(){
 const launcher=document.querySelector('#games .eg-launcher-grid');
 if(launcher&&!launcher.querySelector('.ft-launcher-card')){const b=document.createElement('button');b.type='button';b.className='eg-launcher-card ft-launcher-card';b.dataset.game='firavun';b.innerHTML='<img class="pg-cover" alt="" aria-hidden="true"><span class="eg-lc-title">Firavun’un Sırrı</span><span class="eg-lc-desc">10 çizgi · Altın Kitap ve genişleyen semboller</span><span class="eg-lc-play"><span>Oyna</span><span aria-hidden="true">→</span></span>';b.onclick=()=>window.ErisGameFiravun.open();launcher.append(b);}
 const image=launcher?.querySelector('.ft-launcher-card .pg-cover');if(image&&image.src!==scene())image.src=scene();
 const m=document.getElementById('erisGamesModal'),grid=m?.querySelector('.eg-keys');if(!grid||grid.style.display==='none'||m.querySelector('[data-scope]')?.textContent!=='KİŞİSEL OYUNLAR'||grid.querySelector('[data-game="firavun"]'))return;
 const b=document.createElement('button');b.type='button';b.dataset.game='firavun';b.textContent='Firavun';b.onclick=()=>window.ErisGameFiravun.open();grid.append(b);
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install();});};new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});install();
})();
