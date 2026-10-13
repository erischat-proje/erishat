(() => {
 'use strict';
 const map={'Mesajlar':'messages','Keşfet':'explore','Profilim':'profile','Lidya mağazası':'shop','VIP merkezi':'vip','Gizlilik':'privacy','Anonim Sesli Arama':'anon-voice','Anonim Görüntülü Arama':'anon-video','Konuma Göre Sesli':'voice','Konuma Göre Görüntülü':'video','Yönetim Merkezi':'admin','Aile':'family','Güvenlik':'security','Destek taleplerim':'support'};
 function art(parent,key){if(parent.querySelector(':scope > .lm-art'))return;const el=document.createElement('span');el.className='lm-art';el.dataset.lmArt=key;el.setAttribute('aria-hidden','true');parent.prepend(el)}
 function decorate(){for(const b of document.querySelectorAll('#home .homeMenuItem')){const title=b.querySelector('strong')?.textContent.trim();const key=map[title]||(b.classList.contains('eris-admin-menu')?'admin':null);if(key)art(b,key)}const nav=['home','messages','explore','game','profile'];document.querySelectorAll('.app>.nav button').forEach((b,i)=>{const icon=b.querySelector('b');if(icon&&nav[i])art(icon,nav[i])})}
 function logo(){const img=document.querySelector('.top .eris-brand-image');if(!img)return;const theme=document.documentElement.dataset.erisTheme==='dark'?'dark':'light';const src='./assets/lidya-menu/'+theme+'-logo.png';if(img.getAttribute('src')!==src)img.setAttribute('src',src);img.width=2172;img.height=724;img.alt='ErisChat';}
 function start(){decorate();logo();const home=document.getElementById('home');if(home)new MutationObserver(decorate).observe(home,{childList:true,subtree:true});const brand=document.querySelector('.top .eris-brand');if(brand)new MutationObserver(logo).observe(brand,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});const search=document.querySelector('.top .icon');if(search)search.setAttribute('aria-label','Oda veya kullanıcı ara')}
 window.addEventListener('erischat:theme',logo);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
