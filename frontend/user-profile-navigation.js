(() => {
  'use strict';
  const api = () => window.ErisPlatform;
  const profileStyle=document.createElement('style');
  profileStyle.textContent=`#erisUserProfileModal{font-family:var(--eris-font,Manrope,system-ui,sans-serif)!important}#erisUserProfileModal>div{max-width:620px;margin:auto;padding:20px 18px 34px!important;background:radial-gradient(circle at 15% 0,#512b6933,transparent 46%),#0b0811!important}#erisUserProfileModal [data-profile-photo]{width:106px!important;height:106px!important;overflow:visible;background:transparent!important}#erisUserProfileModal [data-profile-photo]>.eris-profile-avatar{width:70%!important;height:70%!important;margin:auto;border-radius:50%;object-fit:cover}#erisUserProfileModal [data-profile-photo]>.eris-profile-frame{inset:-10px!important;width:126px!important;height:126px!important}#erisUserProfileModal h2{font-size:clamp(22px,5vw,28px);letter-spacing:-.6px}#erisUserProfileModal [data-follow],#erisUserProfileModal [data-block],#erisUserProfileModal [data-gift],#erisUserProfileModal [data-message]{min-height:40px!important;margin:0!important;padding:8px 10px!important;border-radius:12px!important;font-size:12px!important;line-height:1.25!important;box-shadow:none!important}#erisUserProfileModal .eris-profile-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px!important}#erisUserProfileModal .eris-profile-actions>button{width:100%!important}#erisUserProfileModal [data-block]{display:block;margin:9px 0 0!important;width:100%;background:transparent!important;color:#d9c3e6!important}#erisUserProfileModal.eris-own-profile .eris-profile-actions,#erisUserProfileModal.eris-own-profile [data-block]{display:none!important}#erisUserProfileModal [data-report],#erisUserProfileModal [data-close]{width:36px!important;height:36px!important;border-radius:11px!important}#erisUserProfileModal [data-fans]{width:36px!important;height:36px!important}`;
  profileStyle.textContent+='#erisUserProfileModal.eris-banned-profile [data-fans],#erisUserProfileModal.eris-banned-profile .eris-profile-actions,#erisUserProfileModal.eris-banned-profile [data-block],#erisUserProfileModal.eris-banned-profile [data-profile-posts],#erisUserProfileModal.eris-banned-profile [data-report]{display:none!important}#erisUserProfileModal .eris-ban-notice{padding:14px;margin:15px 0;border:1px solid #b996dc55;border-radius:14px;background:#241832;color:#f6e7ff;font-size:13px;line-height:1.5}';
  document.head.append(profileStyle);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function getUser(id){
    if(!id || !api()?.api) throw new Error('Profil servisi hazır değil.');
    return api().api('/users/'+encodeURIComponent(id));
  }
  async function openUserProfile(userId){
    const id=String(userId||'').trim(); if(!id)return;
    try{
      const [u,blockedRows]=await Promise.all([getUser(id),api().api('/me/blocks').catch(()=>[])]);
      let blocked=(Array.isArray(blockedRows)?blockedRows:[]).some(row=>String(row.user_id)===String(u.id));
      const blockedByThem=Boolean(u.blocked_by_them);
      document.getElementById('erisUserProfileModal')?.remove();
      const m=document.createElement('div');m.id='erisUserProfileModal';
      m.style.cssText='position:fixed;inset:0;z-index:10000;background:#09070d;overflow:auto;padding:0';
      if(u.is_self)m.classList.add('eris-own-profile');
      const publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';
      m.innerHTML=`<div style="width:100%;min-height:100%;max-height:100dvh;overflow:auto;background:#0b0811;border:0;border-radius:0;padding:20px 20px calc(24px + env(safe-area-inset-bottom));color:#fff"><div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px"><button type="button" data-fans title="Hayran listesi" aria-label="Hayran listesi" style="flex:none;width:40px;height:40px;border:0;background:transparent;color:#fff;font-size:22px">✦</button><button type="button" data-report title="Şikâyet et" aria-label="Şikâyet et" style="flex:none;width:40px;height:40px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff10;color:#fff;font-size:20px">!</button><button type="button" data-close aria-label="Kapat" style="flex:none;width:40px;height:40px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff10;color:#fff;font-size:20px">×</button></div><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div data-profile-photo style="position:relative;width:82px;height:82px;flex:none;display:grid;place-items:center;border-radius:50%;background:#49336d;color:#fff;font-size:27px">${esc(u.avatar||'👤')}</div><div style="min-width:0;flex:1"><div class="eris-profile-title" style="justify-content:flex-start"><h2 style="margin:0 0 5px;overflow-wrap:anywhere">${esc(u.nickname||'Kullanıcı')}</h2><img class="eris-vip-card" data-vip-card hidden alt=""></div><small style="color:#918699">Kullanıcı ID: ${esc(publicId)}</small></div></div><div style="padding:12px;border:1px solid #ffffff12;border-radius:15px;background:#ffffff05;font-size:12px;line-height:1.6;color:#c9bfd3">${esc(u.bio||'Henüz hakkında bilgisi eklenmemiş.')}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px"><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b data-followers>${Number(u.followers_count||0)}</b><small style="display:block;color:#918699;font-size:9px">Takipçi</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b data-following>${Number(u.following_count||0)}</b><small style="display:block;color:#918699;font-size:9px">Takip</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b data-received-gifts>—</b><small style="display:block;color:#918699;font-size:9px">Alınan hediye</small></div></div><div class="eris-profile-actions" style="display:flex;gap:8px;margin-top:14px"><button data-follow style="flex:1;border:0;background:linear-gradient(135deg,#754cff,#ff4da3);color:#fff;border-radius:12px;padding:11px;font-weight:800">${u.is_following?'Takip ediliyor':'Takip et'}</button><button data-gift style="width:100%;margin-top:8px;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">🎁 Hediye gönder</button><button data-message style="width:100%;margin-top:8px;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">💬 Mesaj gönder</button></div><button data-block style="width:100%;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">${blocked?'Engeli kaldır':'Engelle'}</button></div>`;
      document.body.appendChild(m);window.ErisRoleBadges?.bind(m.querySelector('.eris-profile-title h2'),u);
      window.ErisChatVIP?.decorate?.(m,u);
      window.ErisChatVIP?.watch?.(m,u.id);
      const photo=m.querySelector('[data-profile-photo]');
      const asset=path=>path?(window.ErisChatCosmetics?.assetUrl?.(path)||path):'';
      const avatarUrl=asset(u.avatar_asset);
      if(avatarUrl){
        const img=document.createElement('img');img.className='eris-profile-avatar';img.src=avatarUrl;img.alt='';
        img.style.cssText='display:block;width:100%;height:100%;border-radius:50%;object-fit:cover';
        img.onerror=()=>{img.remove();photo.textContent=u.avatar||'👤'};
        photo.replaceChildren(img);
      }
      const frameUrl=asset(u.frame_asset);
      if(frameUrl){
        const frame=document.createElement('img');frame.className='eris-profile-frame';frame.src=frameUrl;frame.alt='';
        frame.style.cssText='position:absolute;inset:-8px;width:98px;height:98px;object-fit:contain;pointer-events:none';
        frame.onerror=()=>frame.remove();photo.append(frame);
      }
      const level=Math.max(0,Math.min(40,Number(u.fan_level)||0));
      if(u.banned){
        m.classList.add('eris-banned-profile');
        const notice=document.createElement('div');notice.className='eris-ban-notice';notice.textContent=u.ban_notice||'Bu kullanıcı yasaklanmıştır.';
        m.querySelector('[data-profile-photo]').parentElement.after(notice);
      }
      const fanButton=m.querySelector('[data-fans]');
      fanButton.title='Hayran seviyesi '+level+' · listeyi aç';fanButton.setAttribute('aria-label',fanButton.title);
      if(level){const badge=document.createElement('img');badge.src='./fan-levels/LEVEL'+level+'.png';badge.alt='Hayran seviyesi '+level;badge.style.cssText='width:34px;height:34px;object-fit:contain';fanButton.replaceChildren(badge)}
      fanButton.onclick=()=>window.ErisPersonalFanRanking?.(u.id);
      m.querySelector('[data-report]').onclick=()=>window.ErisFloatingProfile?.report?.(u);
      const messageButton=m.querySelector('[data-message]');
      const giftButton=m.querySelector('[data-gift]');
      giftButton.disabled=!!u.is_self||blocked||blockedByThem;
      giftButton.onclick=async()=>{if(giftButton.disabled)return;try{if(!window.ErisChatDM?.openFloating)throw new Error('Hediye paneli hazır değil.');m.remove();await window.ErisChatDM.openFloating(u.id,u.nickname||'Kullanıcı',true)}catch(e){window.toast?.(e.message||'Hediye paneli açılamadı.')}};
      const syncBlockNotice=()=>{
        let notice=m.querySelector('[data-profile-block-notice]');
        if(!blocked && !blockedByThem){notice?.remove();return}
        if(!notice){
          notice=document.createElement('div');
          notice.dataset.profileBlockNotice='';
          notice.style.cssText='margin-top:14px;padding:13px;border:1px solid #ff5b7c55;border-radius:14px;background:#ff5b7c12;color:#ffc0ce;line-height:1.5';
          m.querySelector('.eris-profile-actions')?.before(notice);
        }
        notice.textContent=blockedByThem?'Bu kullanıcı tarafından engellendiniz. Mesaj gönderemezsiniz.':'Bu kullanıcıyı engellediniz. Mesaj göndermek için engeli kaldırın.';
      };
      syncBlockNotice();
      const postsSection=document.createElement('section');
      postsSection.style.cssText='margin-top:22px';
      postsSection.innerHTML='<h3 style="margin:0 0 10px;font-size:17px">Gönderiler</h3><div data-profile-posts></div>';
      m.firstElementChild.append(postsSection);
      if(!u.banned&&window.ErisSocialFeed?.loadProfile){
        window.ErisSocialFeed.loadProfile(postsSection.querySelector('[data-profile-posts]'),u.id,Boolean(u.is_self));
      }
      if(blocked || blockedByThem){
        messageButton.disabled=true;giftButton.disabled=true;
        messageButton.textContent=blockedByThem?'Engellendiniz':'Engeli kaldırın';
        messageButton.style.opacity='.6';
      }
      m.querySelector('[data-close]').onclick=()=>m.remove();
      m.onclick=e=>{if(e.target===m)m.remove();};
      const followButton=m.querySelector('[data-follow]');
      if(u.is_self){followButton.disabled=true;followButton.textContent='Bu senin profilin';}
      followButton.onclick=async()=>{followButton.disabled=true;try{const following=followButton.textContent==='Takip ediliyor';await api().api('/users/'+encodeURIComponent(u.id)+'/follow',{method:following?'DELETE':'POST'});followButton.textContent=following?'Takip et':'Takip ediliyor';window.ErisProfile?.refresh?.()}catch(error){window.toast?.(error.message||'Takip işlemi başarısız.')}finally{followButton.disabled=false}};
      const blockButton=m.querySelector('[data-block]');
      blockButton.onclick=async()=>{blockButton.disabled=true;try{const isBlocked=blocked;await api().api('/users/'+encodeURIComponent(u.id)+'/block',{method:isBlocked?'DELETE':'POST'});blocked=!isBlocked;syncBlockNotice();blockButton.textContent=blocked?'Engeli kaldır':'Engelle';messageButton.disabled=blocked||blockedByThem;giftButton.disabled=messageButton.disabled||!!u.is_self;messageButton.textContent=blocked?(blockedByThem?'Engellendiniz':'Engeli kaldırın'):(blockedByThem?'Engellendiniz':'💬 Mesaj gönder');messageButton.style.opacity=messageButton.disabled?'.6':'1';window.dispatchEvent(new CustomEvent('erischat:user-block-changed',{detail:{userId:u.id,blocked}}));window.toast?.(isBlocked?'Engel kaldırıldı.':'Kullanıcı engellendi.')}catch(error){window.toast?.(error.message||'Engelleme işlemi başarısız.')}finally{blockButton.disabled=false}};
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
    const chatHeader=e.target.closest?.('#chat .chatHead .ava,#chat .chatHead b');
    if(chatHeader&&window.__erisActiveDmUserId){
      e.preventDefault();e.stopImmediatePropagation();
      if(window.ErisFloatingProfile?.open)window.ErisFloatingProfile.open(window.__erisActiveDmUserId);
      else openUserProfile(window.__erisActiveDmUserId);
      return;
    }
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
