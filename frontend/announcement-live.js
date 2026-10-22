(function(){
  'use strict';
  const api=(window.ERIS_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||localStorage.getItem('token')||'';
  let generation=0;
  const clear=()=>{document.getElementById('erisAnnouncementCard')?.remove();document.getElementById('erisAnnouncementInbox')?.remove()};
  async function load(){
    const request=++generation,session=token();
    if(!session||window.ErisNotifications?.enabled===false){clear();return}
    try{
      const r=await fetch(api+'/announcements',{headers:{Authorization:'Bearer '+token()}});
      if(!r.ok)return;
      const rows=await r.json();if(request!==generation||session!==token())return;if(!Array.isArray(rows))return;if(!rows.length){clear();return;}
      const latest=rows[0],dismissed=localStorage.getItem('eris.announcement.dismissed');
      if(String(latest.id)===dismissed){clear();return;}
      clear();
      const home=document.getElementById('home');if(!home)return;
      const card=document.createElement('article');card.id='erisAnnouncementCard';card.setAttribute('aria-label','LidyaChat Yönetim duyurusu');
      card.style.cssText="margin:0 0 16px;padding:14px 15px;border-radius:18px;border:1px solid var(--ui-line);background:linear-gradient(135deg,var(--ui-panel),var(--ui-panel));box-shadow:0 12px 30px var(--ui-shadow)";
      const top=document.createElement('div');top.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:10px';
      const name=document.createElement('b');name.textContent='📢 LidyaChat Yönetim';name.style.cssText="font-size:12px;color:var(--ui-gold)";
      const close=document.createElement('button');close.type='button';close.textContent='Gördüm';close.setAttribute('aria-label','Duyuruyu kapat');close.style.cssText="border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 4%, transparent);color:var(--ui-ink);border-radius:9px;padding:6px 9px;font-size:10px";
      const dismiss=()=>{localStorage.setItem('eris.announcement.dismissed',String(latest.id));document.getElementById('erisAnnouncementCard')?.remove();document.getElementById('erisAnnouncementInbox')?.remove()};
      close.onclick=dismiss;
      const message=document.createElement('p');message.textContent=latest.message;message.style.cssText='white-space:pre-wrap;line-height:1.55;font-size:12px;margin:10px 0 5px';
      const publisher=document.createElement('small');publisher.dataset.announcementPublisher='';publisher.textContent='Yayınlayan yönetici ID: '+(latest.admin_public_id||'Bilinmiyor');publisher.style.cssText='display:block;overflow-wrap:anywhere;font-size:10px;margin:8px 0;color:var(--ui-ink)';
      const time=document.createElement('small');time.textContent=new Date(latest.created_at).toLocaleString('tr-TR');time.style.cssText="color:var(--ui-gold);font-size:9px";
      top.append(name,close);card.append(top,message,publisher,time);home.prepend(card);
      const inbox=document.querySelector('#messages > .list');if(inbox){const copy=card.cloneNode(true);copy.id='erisAnnouncementInbox';copy.querySelector('button')?.addEventListener('click',dismiss);inbox.prepend(copy)}
    }catch(_){}
  }
  window.addEventListener('lidyachat:announcements-changed',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  setInterval(()=>{if(!document.hidden)load()},15000);
  window.ErisAnnouncements={load,open:()=>{localStorage.removeItem('eris.announcement.dismissed');return load()}};
  window.addEventListener('load',()=>setTimeout(load,900));
  window.addEventListener('erischat:auth',e=>{if(e.detail?.state==='ready')load();else{generation++;clear()}});
})();
