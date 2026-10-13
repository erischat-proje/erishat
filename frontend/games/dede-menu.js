(()=>{'use strict';
const base=new URL('../assets/lidya-dede-png/',document.currentScript.src);
const scene=()=>new URL((document.documentElement.dataset.erisTheme==='dark'?'dark':'light')+'/scene.png',base).href;
function install(){
 const launcher=document.querySelector('#games .eg-launcher-grid');
 if(launcher&&!launcher.querySelector('.dd-launcher-card')){const b=document.createElement('button');b.type='button';b.className='eg-launcher-card dd-launcher-card';b.dataset.game='dede';b.innerHTML='<img class="pg-cover" alt="" aria-hidden="true"><span class="eg-lc-title">Dede</span><span class="eg-lc-desc">Sardis’in yıldırımları · Takla ve ücretsiz dönüşler</span><span class="eg-lc-play"><span>Oyna</span><span aria-hidden="true">→</span></span>';b.onclick=()=>window.ErisGameDede.open();launcher.append(b);}
 const image=launcher?.querySelector('.dd-launcher-card .pg-cover');if(image&&image.src!==scene())image.src=scene();
 const m=document.getElementById('erisGamesModal'),grid=m?.querySelector('.eg-keys');if(!grid||grid.style.display==='none'||m.querySelector('[data-scope]')?.textContent!=='KİŞİSEL OYUNLAR'||grid.querySelector('[data-game="dede"]'))return;
 const b=document.createElement('button');b.type='button';b.dataset.game='dede';b.textContent='Dede';b.onclick=()=>window.ErisGameDede.open();grid.append(b);
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install();});};new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});install();
})();
