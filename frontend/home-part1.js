(() => {
  'use strict';
  let revision=0,initialized=false;
  const notifications={enabled:true,apply(p){if(!p||p.hide_notifications===undefined)return;const enabled=!p.hide_notifications,changed=enabled!==this.enabled;this.enabled=enabled;document.documentElement.classList.toggle('notifications-hidden',!enabled);document.querySelectorAll('[data-privacy-key="hide_notifications"] .switch').forEach(el=>el.classList.toggle('on',!enabled));if(changed){window.dispatchEvent(new CustomEvent('erischat:notification-settings',{detail:{enabled}}));if(enabled)window.ErisAnnouncements?.load?.();}},async load(){const index=++revision;try{const p=await window.ErisPlatform?.api('/me/privacy');if(index===revision)this.apply(p);}catch{}}};
  window.ErisNotifications=notifications;
  window.addEventListener('erischat:auth',e=>{if(e.detail?.state==='ready')notifications.load();else if(e.detail?.state==='logged_out'){revision++;notifications.apply({hide_notifications:false})}});
  window.addEventListener('erischat:profile',e=>{if(e.detail?.notifications_enabled!==undefined)notifications.apply({hide_notifications:!e.detail.notifications_enabled})});
  const setup=()=>{if(initialized)return;initialized=true;const balance=document.getElementById('demoBalance');if(balance){balance.setAttribute('role','button');balance.tabIndex=0;balance.setAttribute('aria-label','Lidya yükle');const topup=()=>window.ErisPurchases?.open?.();balance.onclick=topup;balance.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();topup()}};}notifications.load();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
