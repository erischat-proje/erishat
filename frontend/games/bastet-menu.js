(()=>{'use strict';
const base=new URL('../assets/lidya-bastet/',document.currentScript.src);
const scene=()=>new URL('menu-cover.png',base).href;
function install(){
 const launcher=document.querySelector('#games .eg-launcher-grid');
 if(launcher&&!launcher.querySelector('.bt-launcher-card')){const b=document.createElement('button');b.type='button';b.className='eg-launcher-card bt-launcher-card';b.dataset.game='bastet';b.innerHTML='<img class="pg-cover" alt="" aria-hidden="true"><span class="eg-lc-title">Bastet’in Hazinesi</span><span class="eg-lc-desc">40 çizgi · Kedi respin ve yapışkan Wild</span><span class="eg-lc-play"><span>Oyna</span><span aria-hidden="true">→</span></span>';b.onclick=()=>window.ErisGameBastet.open();launcher.append(b);}
 const image=launcher?.querySelector('.bt-launcher-card .pg-cover');if(image&&image.src!==scene())image.src=scene();
 const m=document.getElementById('erisGamesModal'),grid=m?.querySelector('.eg-keys');if(!grid||grid.style.display==='none'||m.querySelector('[data-scope]')?.textContent!=='KİŞİSEL OYUNLAR'||grid.querySelector('[data-game="bastet"]'))return;
 const b=document.createElement('button');b.type='button';b.dataset.game='bastet';b.textContent='Bastet’in Hazinesi';b.onclick=()=>window.ErisGameBastet.open();grid.append(b);
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install();});};new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});install();
})();
