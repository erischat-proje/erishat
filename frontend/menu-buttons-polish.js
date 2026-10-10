(() => {
  'use strict';
  const paths={
    info:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    posts:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    'fan-ranking':'<path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9Z"/>',
    collection:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    tasks:'<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3h6v4H9zM9 13l2 2 4-4"/>',
    vip:'<path d="m3 6 5 4 4-7 4 7 5-4-2 12H5Z M6 21h12"/>',
    topup:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
    calls:'<path d="M8 3H4v4c0 8 5 13 13 13h4v-4l-5-2-2 3c-4-1-6-3-7-7l3-2Z M15 4a5 5 0 0 1 5 5"/>',
    notifications:'<path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4Z M10 20h4"/>',
    privacy:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><rect x="9" y="10" width="6" height="6" rx="1"/><path d="M10 10V8a2 2 0 0 1 4 0v2"/>',
    blocked:'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    rooms:'<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
    suggestion:'<path d="M8 15a7 7 0 1 1 8 0l-1 3H9Z M9 21h6M12 1v2"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
    relationship:'<path d="M20 5c-4-4-8 1-8 1S8 1 4 5s0 10 8 16c8-6 12-12 8-16Z"/>',
    account:'<circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0M3 9V4h5M21 15v5h-5"/>',
    logout:'<path d="M10 3H4v18h6M8 12h13m-4-4 4 4-4 4"/>'
  };
  const labels={'İlişki':'relationship','Hesap değiştir':'account','Çıkış yap':'logout'};
  const tones={info:'#adadff',posts:'#d49cff','fan-ranking':'#ebc878',collection:'#97cbed',tasks:'#93d9c1',vip:'#e7bf70',topup:'#f0cb77',calls:'#92c5ef',notifications:'#dda0eb',privacy:'#adbcff',blocked:'#f0a4b0',rooms:'#96d3c5',suggestion:'#dfc684',settings:'#b7a8ef',relationship:'#eea3c8',account:'#9fc8ea',logout:'#e5a6b4'};
  const style=document.createElement('style');style.textContent=`#erisProfileHub .eph-tabs{gap:12px!important;padding-bottom:24px!important}#erisProfileHub .eph-tabs button[data-modern-menu]{position:relative;display:flex!important;align-items:flex-start!important;justify-content:flex-start!important;flex-direction:column!important;gap:12px!important;box-sizing:border-box;min-height:108px!important;padding:16px!important;border:1px solid #b88dda24!important;border-radius:21px!important;background:linear-gradient(140deg,#22192c,#121019)!important;box-shadow:inset 0 1px #ffffff07;white-space:normal!important;text-align:left;font:700 14px/1.45 var(--eris-font,Manrope,system-ui)!important;overflow:hidden;color:#f0e6f8!important}#erisProfileHub .eph-tabs button[data-modern-menu]:after{content:'↗';position:absolute;right:14px;top:15px;color:#a596b366;font-size:16px}#erisProfileHub .eph-tabs button[data-modern-menu]>span:not(.emp-icon){min-width:0;max-width:100%;overflow-wrap:anywhere}#erisProfileHub .emp-icon{display:grid;place-items:center;width:38px;height:38px;flex:none;background:#ffffff07;border:1px solid #ffffff0d;border-radius:12px;color:var(--emp-tone,#c7a7ed)}#erisProfileHub .emp-icon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}#erisProfileHub .eph-tabs button[data-modern-menu]:focus-visible{outline:2px solid var(--emp-tone);outline-offset:3px}#erisProfileHub .eph-tabs button[data-modern-menu]:active{background:#352342!important}#erisProfileHub .eph-tabs button[data-modern-menu=logout]{border-color:#dca0ae36!important}@media(max-width:360px){#erisProfileHub .eph-tabs{gap:9px!important}#erisProfileHub .eph-tabs button[data-modern-menu]{padding:13px!important;font-size:12px!important;min-height:108px!important}}@media(max-width:290px){#erisProfileHub .eph-tabs{grid-template-columns:1fr!important}}`;
  document.head.append(style);
  function decorate(){const strip=document.querySelector('#erisProfileHub .eph-tabs');if(!strip)return;for(const b of strip.querySelectorAll('button')){if(b.dataset.modernMenu)continue;const declared=b.dataset.tab,matched=Object.keys(labels).find(label=>b.textContent.trim().endsWith(label));const key=paths[declared]?declared:labels[matched];if(!paths[key])continue;b.dataset.modernMenu=key;b.style.setProperty('--emp-tone',tones[key]);const icon=document.createElement('span');icon.className='emp-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24">'+paths[key]+'</svg>';const existing=b.querySelector('.eph-icon,svg,img');if(existing)existing.replaceWith(icon);else b.prepend(icon)}}
  function start(){decorate();const profile=document.getElementById('profile');if(profile)new MutationObserver(decorate).observe(profile,{subtree:true,childList:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
