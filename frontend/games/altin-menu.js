(()=>{'use strict';
const base=new URL('../assets/lidya-altin/',document.currentScript.src);
const scene=()=>new URL('menu-cover.png',base).href;
function install(){
 const launcher=document.querySelector('#games .eg-launcher-grid');
 if(launcher&&!launcher.querySelector('.as-launcher-card')){const b=document.createElement('button');b.type='button';b.className='eg-launcher-card as-launcher-card';b.dataset.game='altin';b.innerHTML='<img class="pg-cover" alt="" aria-hidden="true"><span class="eg-lc-title">Altın Şöleni</span><span class="eg-lc-desc">25 çizgi · Dört hazine ve makara kopyalama</span><span class="eg-lc-play"><span>Oyna</span><span aria-hidden="true">→</span></span>';b.onclick=()=>window.ErisGameAltin.open();launcher.append(b);}
 const image=launcher?.querySelector('.as-launcher-card .pg-cover');if(image&&image.src!==scene())image.src=scene();
 const m=document.getElementById('erisGamesModal'),grid=m?.querySelector('.eg-keys');if(!grid||grid.style.display==='none'||m.querySelector('[data-scope]')?.textContent!=='KİŞİSEL OYUNLAR'||grid.querySelector('[data-game="altin"]'))return;
 const b=document.createElement('button');b.type='button';b.dataset.game='altin';b.textContent='Altın Şöleni';b.onclick=()=>window.ErisGameAltin.open();grid.append(b);
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install();});};new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});install();
})();
