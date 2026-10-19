(()=>{'use strict';
const base=new URL('../assets/lidya-aztek/guardian-final/',document.currentScript.src);
window.AztekFinal={create(){let alive=true,pose='idle';const image=document.getElementById('guardian'),flights=new Set(),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function show(next,message){if(!alive)return;pose=document.hidden?'idle':next;const skin=document.documentElement.dataset.erisTheme==='dark'?'dark':'light';image.src=new URL(skin+'/'+pose+'.png',base).href;document.body.dataset.guardian=pose;if(message)document.getElementById('guardianMessage').textContent=message;}
function clear(){for(const item of flights){item.animation.cancel();item.el.remove()}flights.clear()}
function fly(ids){clear();if(!alive||document.hidden||reduced())return;const a=image.getBoundingClientRect(),b=document.getElementById('board').getBoundingClientRect();for(const id of [...new Set(ids)].slice(0,4)){if(!Number.isInteger(id)||id<0||id>=64)continue;const x=b.left+(id%8+.5)*b.width/8,y=b.top+(Math.floor(id/8)+.5)*b.height/8,sx=a.left+a.width*.4,sy=a.top+a.height*.6,el=document.createElement('span');el.className='az-magic-flight';el.dataset.cell=id;el.setAttribute('aria-hidden','true');el.textContent='✦';document.body.append(el);const animation=el.animate([{transform:`translate(${sx}px,${sy}px) scale(.5)`,opacity:0},{transform:`translate(${(sx+x)/2}px,${(sy+y)/2-25}px) scale(1.2)`,opacity:1,offset:.5},{transform:`translate(${x}px,${y}px) scale(.7)`,opacity:0}],{duration:650,easing:'ease-out'}),item={el,animation};flights.add(item);animation.finished.catch(()=>{}).finally(()=>{el.remove();flights.delete(item)})}}
const observer=new MutationObserver(()=>show(pose));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});show('idle');
const ready=Promise.all(['light','dark'].flatMap(skin=>['idle','anticipation','action','celebrate'].map(key=>{const im=new Image();im.src=new URL(skin+'/'+key+'.png',base).href;return im.decode()})));ready.catch(()=>{});
return {ready,pose:show,fly,stop(){clear();show('idle')},close(){if(!alive)return;clear();alive=false;observer.disconnect()}};
}};
})();
