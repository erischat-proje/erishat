(() => {
  'use strict';
  const api = () => window.ErisPlatform;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function getUser(id){
    if(!id || !api()?.api) throw new Error('Profil servisi hazır değil.');
    return api().api('/users/'+encodeURIComponent(id));
  }
  async function openUserProfile(userId){
    const id=String(userId||'').trim(); if(!id)return;
    try{
      const [u,blockedRows,vip,fans,gifts]=await Promise.all([getUser(id),api().api('/me/blocks').catch(()=>[]),api().api('/users/'+encodeURIComponent(id)+'/vip').catch(()=>({level:0})),api().api('/users/'+encodeURIComponent(id)+'/fans').catch(()=>({total:0})),api().api('/users/'+encodeURIComponent(id)+'/profile-gifts').catch(()=>[])]);
      let blocked=(Array.isArray(blockedRows)?blockedRows:[]).some(row=>String(row.user_id)===String(u.id));
      const blockedByThem=Boolean(u.blocked_by_them);
      document.getElementById('erisUserProfileModal')?.remove();
      const m=document.createElement('div');m.id='erisUserProfileModal';
      m.style.cssText='position:fixed;inset:0;z-index:10000;background:#09070d;overflow:auto;padding:0';
      const publicId=/^\d{12}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';
      m.innerHTML=`<div style="width:100%;min-height:100%;max-height:100dvh;overflow:auto;background:#0b0811;border:0;border-radius:0;padding:20px 20px calc(24px + env(safe-area-inset-bottom));color:#fff"><div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px"><button type="button" data-fans title="Hayran listesi" aria-label="Hayran listesi" style="flex:none;width:40px;height:40px;border:1px solid #bd93ee77;border-radius:12px;background:#ffffff10;color:#fff;font-size:22px">✦</button><button type="button" data-report title="Şikâyet et" aria-label="Şikâyet et" style="flex:none;width:40px;height:40px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff10;color:#fff;font-size:20px">!</button><button type="button" data-close aria-label="Kapat" style="flex:none;width:40px;height:40px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff10;color:#fff;font-size:20px">×</button></div><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div data-profile-photo style="position:relative;width:82px;height:82px;flex:none;display:grid;place-items:center;border-radius:50%;background:#49336d;color:#fff;font-size:27px">${esc(u.avatar||'👤')}</div><div style="min-width:0;flex:1"><h2 style="margin:0 0 5px;overflow-wrap:anywhere">${esc(u.nickname||'Kullanıcı')}</h2><small style="color:#918699">Kullanıcı ID: ${esc(publicId)}</small></div></div><div style="padding:12px;border:1px solid #ffffff12;border-radius:15px;background:#ffffff05;font-size:12px;line-height:1.6;color:#c9bfd3">${esc(u.bio||'Henüz hakkında bilgisi eklenmemiş.')}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px"><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Number(vip.level||0)}</b><small style="display:block;color:#918699;font-size:9px">VIP</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Number(fans.total||0)}</b><small style="display:block;color:#918699;font-size:9px">Takipçi</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Array.isArray(gifts)?gifts.length:0}</b><small style="display:block;color:#918699;font-size:9px">Hediye</small></div></div><div style="display:flex;gap:8px;margin-top:14px"><button data-follow style="flex:1;border:0;background:linear-gradient(135deg,#754cff,#ff4da3);color:#fff;border-radius:12px;padding:11px;font-weight:800">${u.is_following?'Takip ediliyor':'Takip et'}</button><button data-block style="flex:1;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">${blocked?'Engeli kaldır':'Engelle'}</button></div><button data-message style="width:100%;margin-top:8px;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">💬 Mesaj gönder</button></div>`;
      document.body.appendChild(m);
      const photo=m.querySelector('[data-profile-photo]');
      const asset=path=>path?(window.ErisChatCosmetics?.assetUrl?.(path)||path):'';
      const avatarUrl=asset(u.avatar_asset);
      if(avatarUrl){
        const img=document.createElement('img');img.src=avatarUrl;img.alt='';
        img.style.cssText='display:block;width:100%;height:100%;border-radius:50%;object-fit:cover';
        img.onerror=()=>{img.remove();photo.textContent=u.avatar||'👤'};
        photo.replaceChildren(img);
      }
      const frameUrl=asset(u.frame_asset);
      if(frameUrl){
        const frame=document.createElement('img');frame.src=frameUrl;frame.alt='';
        frame.style.cssText='position:absolute;inset:-8px;width:98px;height:98px;object-fit:contain;pointer-events:none';
        frame.onerror=()=>frame.remove();photo.append(frame);
      }
      const level=Math.max(0,Math.min(40,Number(u.fan_level)||0));
      const fanButton=m.querySelector('[data-fans]');
      fanButton.title='Hayran seviyesi '+level+' · listeyi aç';fanButton.setAttribute('aria-label',fanButton.title);
      if(level){const badge=document.createElement('img');badge.src='./fan-levels/LEVEL'+level+'.png';badge.alt='Hayran seviyesi '+level;badge.style.cssText='width:34px;height:34px;object-fit:contain';fanButton.replaceChildren(badge)}
      fanButton.onclick=()=>window.ErisPersonalFanRanking?.(u.id);
      m.querySelector('[data-report]').onclick=()=>window.ErisFloatingProfile?.report?.(u);
      const messageButton=m.querySelector('[data-message]');
      const syncBlockNotice=()=>{
        let notice=m.querySelector('[data-profile-block-notice]');
        if(!blocked && !blockedByThem){notice?.remove();return}
        if(!notice){
          notice=document.createElement('div');
          notice.dataset.profileBlockNotice='';
          notice.style.cssText='margin-top:14px;padding:13px;border:1px solid #ff5b7c55;border-radius:14px;background:#ff5b7c12;color:#ffc0ce;line-height:1.5';
          m.querySelector('[data-follow]')?.parentElement?.before(notice);
        }
        notice.textContent=blockedByThem?'Bu kullanıcı tarafından engellendiniz. Mesaj gönderemezsiniz.':'Bu kullanıcıyı engellediniz. Mesaj göndermek için engeli kaldırın.';
      };
      syncBlockNotice();
      const postsSection=document.createElement('section');
      postsSection.style.cssText='margin-top:22px';
      postsSection.innerHTML='<h3 style="margin:0 0 10px;font-size:17px">Gönderiler</h3><div data-profile-posts></div>';
      m.firstElementChild.append(postsSection);
      if(window.ErisSocialFeed?.loadProfile){
        window.ErisSocialFeed.loadProfile(postsSection.querySelector('[data-profile-posts]'),u.id,Boolean(u.is_self));
      }
      if(blocked || blockedByThem){
        messageButton.disabled=true;
        messageButton.textContent=blockedByThem?'Engellendiniz':'Engeli kaldırın';
        messageButton.style.opacity='.6';
      }
      m.querySelector('[data-close]').onclick=()=>m.remove();
      m.onclick=e=>{if(e.target===m)m.remove();};
      const followButton=m.querySelector('[data-follow]');
      if(u.is_self){followButton.disabled=true;followButton.textContent='Bu senin profilin';}
      followButton.onclick=async()=>{followButton.disabled=true;try{const following=followButton.textContent==='Takip ediliyor';await api().api('/users/'+encodeURIComponent(u.id)+'/follow',{method:following?'DELETE':'POST'});followButton.textContent=following?'Takip et':'Takip ediliyor';window.ErisProfile?.refresh?.()}catch(error){window.toast?.(error.message||'Takip işlemi başarısız.')}finally{followButton.disabled=false}};
      const blockButton=m.querySelector('[data-block]');
      blockButton.onclick=async()=>{blockButton.disabled=true;try{const isBlocked=blocked;await api().api('/users/'+encodeURIComponent(u.id)+'/block',{method:isBlocked?'DELETE':'POST'});blocked=!isBlocked;syncBlockNotice();blockButton.textContent=blocked?'Engeli kaldır':'Engelle';messageButton.disabled=blocked||blockedByThem;messageButton.textContent=blocked?(blockedByThem?'Engellendiniz':'Engeli kaldırın'):(blockedByThem?'Engellendiniz':'💬 Mesaj gönder');messageButton.style.opacity=messageButton.disabled?'.6':'1';window.dispatchEvent(new CustomEvent('erischat:user-block-changed',{detail:{userId:u.id,blocked}}));window.toast?.(isBlocked?'Engel kaldırıldı.':'Kullanıcı engellendi.')}catch(error){window.toast?.(error.message||'Engelleme işlemi başarısız.')}finally{blockButton.disabled=false}};
      messageButton.onclick=async()=>{
        if(blocked || blockedByThem) return;
        try{
          const c=await api().createConversation(id);
          m.remove();
          window.__erisActiveDmUserId=id;
          window.ErisChatDM?.load?.();
          window.ErisChatDM?.open?.(c?.id||c?.conversation_id||c?.conversation?.id,u.nickname||'Kullanıcı',u.avatar_asset||u.avatar||'',u.id||id);
        }catch(e){window.toast?.(e.message||'Konuşma açılamadı.');}
      };
    }catch(e){window.toast?.(e.message||'Kullanıcı bulunamadı.');}
  }
  window.openUserProfile=openUserProfile;
  function mark(){
    const id=window.__erisActiveDmUserId;
    const chat=document.getElementById('chat');
    if(!id||!chat)return;
    chat.querySelectorAll('.chatHead .ava,.chatHead b').forEach(el=>{
      el.dataset.userId=id;el.style.cursor='pointer';el.title='Profili aç';
    });
  }
  document.addEventListener('click',e=>{
    const t=e.target.closest?.('[data-user-id]');
    if(t?.dataset.userId){e.preventDefault();e.stopImmediatePropagation();(document.getElementById('chat')?.classList.contains('eris-floating-dm')?window.ErisFloatingProfile?.open(t.dataset.userId):openUserProfile(t.dataset.userId));return;}
    const header=e.target.closest?.('#chat .chatHead .ava,#chat .chatHead b');
    if(header&&window.__erisActiveDmUserId){e.preventDefault();e.stopImmediatePropagation();(document.getElementById('chat')?.classList.contains('eris-floating-dm')?window.ErisFloatingProfile?.open(window.__erisActiveDmUserId):openUserProfile(window.__erisActiveDmUserId));}
  },true);
  async function openNamedProfile(name){
    try{
      const data=await api().api('/discover/nearby');
      const rows=Array.isArray(data)?data:(data?.users||data?.items||data?.data||[]);
      const u=rows.find(x=>String(x.nickname||'').toLowerCase()===String(name||'').toLowerCase());
      if(u?.id||u?.user_id) return openUserProfile(u.id||u.user_id);
    }catch{}
  }
  document.addEventListener('click',e=>{
    const people=e.target.closest?.('#people .item');
    if(people && !e.target.closest('button[data-profile-message]')){
      const n=people.querySelector('b')?.textContent?.trim();
      if(n){e.preventDefault();e.stopImmediatePropagation();openNamedProfile(n);}
    }
  },true);
  const mo=new MutationObserver(mark);
  const start=()=>{mark();mo.observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
