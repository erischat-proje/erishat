(() => {
'use strict';
const base=new URL('./assets/lidya-profile-png/',document.currentScript.src);
const theme=()=>document.documentElement.dataset.erisTheme==='dark'?'dark':'light';
const labels={'İlişki':'relationship','Hesap değiştir':'account','Çıkış yap':'logout'};
function update(){const profile=document.getElementById('profile');if(!profile)return;for(const button of profile.querySelectorAll('#erisProfileHub .eph-tabs button')){const key=button.dataset.tab||button.dataset.modernMenu||Object.keys(labels).find(label=>button.textContent.trim().endsWith(label))&&labels[Object.keys(labels).find(label=>button.textContent.trim().endsWith(label))];if(!key)continue;const known=['info','posts','fan-ranking','collection','tasks','vip','topup','calls','notifications','privacy','blocked','rooms','suggestion','settings','relationship','account','logout'];if(!known.includes(key))continue;let picture=button.querySelector('img.pp-icon');if(!picture){picture=document.createElement('img');picture.className='pp-icon';picture.alt='';picture.setAttribute('aria-hidden','true');picture.decoding='async';const old=button.querySelector('.emp-icon,.eph-icon');if(old)old.replaceWith(picture);else button.prepend(picture)}const src=new URL(theme()+'/'+key+'.png',base).href;if(picture.src!==src)picture.src=src;button.dataset.pngProfile=key}}
let pending=false;function schedule(){if(pending)return;pending=true;queueMicrotask(()=>{pending=false;update()})}
function start(){update();const profile=document.getElementById('profile');if(profile)new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&!n.classList.contains('pp-icon'))))schedule()}).observe(profile,{childList:true,subtree:true})}
window.addEventListener('erischat:theme',schedule);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
