(() => {
  'use strict';
  const api = () => window.ErisPlatform;
  const profileStyle=document.createElement('style');
  profileStyle.textContent=`#erisUserProfileModal{font-family:var(--eris-font,Manrope,system-ui,sans-serif)!important}#erisUserProfileModal>div{max-width:620px;margin:auto;padding:20px 18px 34px!important;background:radial-gradient(circle at 15% 0,color-mix(in srgb, var(--ui-button) 20%, transparent),transparent 46%),var(--ui-panel)!important}#erisUserProfileModal [data-profile-photo]{width:106px!important;height:106px!important;overflow:visible;background:transparent!important}#erisUserProfileModal [data-profile-photo]>.eris-profile-avatar{width:70%!important;height:70%!important;margin:auto;border-radius:50%;object-fit:cover}#erisUserProfileModal [data-profile-photo]>.eris-profile-frame{inset:-10px!important;width:126px!important;height:126px!important}#erisUserProfileModal h2{font-size:clamp(22px,5vw,28px);letter-spacing:-.6px}#erisUserProfileModal [data-follow],#erisUserProfileModal [data-block],#erisUserProfileModal [data-gift],#erisUserProfileModal [data-message]{min-height:40px!important;margin:0!important;padding:8px 10px!important;border-radius:12px!important;font-size:12px!important;line-height:1.25!important;box-shadow:none!important}#erisUserProfileModal .eris-profile-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px!important}#erisUserProfileModal .eris-profile-actions>button{width:100%!important}#erisUserProfileModal [data-block]{display:block;margin:9px 0 0!important;width:100%;background:transparent!important;color:var(--ui-ink)!important}#erisUserProfileModal.eris-own-profile .eris-profile-actions,#erisUserProfileModal.eris-own-profile [data-block]{display:none!important}#erisUserProfileModal [data-report],#erisUserProfileModal [data-close]{width:36px!important;height:36px!important;border-radius:11px!important}#erisUserProfileModal [data-fans]{width:36px!important;height:36px!important}`;
  profileStyle.textContent+="#erisUserProfileModal.eris-banned-profile [data-fans],#erisUserProfileModal.eris-banned-profile .eris-profile-actions,#erisUserProfileModal.eris-banned-profile [data-block],#erisUserProfileModal.eris-banned-profile [data-profile-posts],#erisUserProfileModal.eris-banned-profile [data-report]{display:none!important}#erisUserProfileModal .eris-ban-notice{padding:14px;margin:15px 0;border:1px solid var(--ui-line);border-radius:14px;background:var(--ui-panel);color:var(--ui-ink);font-size:13px;line-height:1.5}";

  profileStyle.textContent += `
/* LIDYA PUBLIC PROFILE PREMIUM V1 */

html body #erisUserProfileModal#erisUserProfileModal {
  position:fixed!important;
  top:calc(var(--app-top,0px) + var(--eris-safe-top,0px))!important;
  left:calc(var(--eris-viewport-left,0px) + var(--eris-safe-left,0px))!important;
  right:auto!important;
  bottom:auto!important;
  width:calc(var(--app-width,100vw) - var(--eris-safe-left,0px) - var(--eris-safe-right,0px))!important;
  height:var(--eris-usable-height,100dvh)!important;
  max-height:var(--eris-usable-height,100dvh)!important;
  background:var(--ui-panel)!important;
  padding:0!important;
  margin:0!important;
  overflow:hidden!important;
  transform:none!important;
  box-sizing:border-box!important;
  overscroll-behavior:contain;
}

/* Preserve the underlying page without showing its navigation. */
html body:has(>#erisUserProfileModal) .app>.top,
html body:has(>#erisUserProfileModal) .app>.nav {
  visibility:hidden!important;
  pointer-events:none!important;
}

html body #erisUserProfileModal>.lidya-public-profile {
  box-sizing:border-box!important;
  width:100%!important;
  max-width:620px!important;
  height:100%!important;
  min-height:0!important;
  max-height:100%!important;
  overflow-y:auto!important;
  overflow-x:hidden!important;
  overscroll-behavior:contain;
  padding:12px 18px 24px!important;
  margin:auto!important;
}

#erisUserProfileModal .lidya-profile-toolbar {
  display:flex!important;
  align-items:center!important;
  justify-content:flex-end!important;
  gap:8px!important;
  position:sticky;
  top:0;
  z-index:10;
  background:var(--ui-panel);
  padding:6px 0 12px;
}

#erisUserProfileModal .lidya-profile-toolbar-title {
  flex:1;
  min-width:0;
  color:var(--ui-ink);
  font-size:14px;
  font-weight:800;
}

html body #erisUserProfileModal .lidya-profile-toolbar button {
  flex:0 0 44px!important;
  width:44px!important;
  height:44px!important;
  border:1px solid var(--ui-line)!important;
  border-radius:13px!important;
  background:var(--ui-raised,var(--ui-panel))!important;
  color:var(--ui-ink)!important;
}

html body #erisUserProfileModal .lidya-profile-toolbar button[hidden] {
  display:none!important;
}

html body #erisUserProfileModal .lidya-profile-hero {
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  text-align:center!important;
  gap:14px!important;
  padding:12px 0 18px!important;
}

html body #erisUserProfileModal .lidya-profile-hero [data-profile-photo] {
  width:116px!important;
  height:116px!important;
  margin:0 auto!important;
}

html body #erisUserProfileModal .lidya-profile-hero [data-profile-photo]>.eris-profile-frame {
  width:136px!important;
  height:136px!important;
  inset:-10px!important;
}

html body #erisUserProfileModal .lidya-profile-identity {
  width:100%;
  min-width:0;
  text-align:center;
}

html body #erisUserProfileModal .eris-profile-title {
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  flex-wrap:wrap!important;
  gap:6px;
}

html body #erisUserProfileModal .eris-profile-title h2 {
  font-size:clamp(19px,5vw,26px)!important;
  line-height:1.3!important;
  margin:0 0 6px!important;
  overflow-wrap:anywhere!important;
}

#erisUserProfileModal .lidya-profile-identity small {
  font-size:12px!important;
  line-height:1.5;
}

#erisUserProfileModal .lidya-profile-bio {
  border:1px solid var(--ui-line)!important;
  border-radius:16px!important;
  padding:14px!important;
  background:var(--ui-raised,var(--ui-panel))!important;
  color:var(--ui-ink)!important;
  overflow-wrap:anywhere;
}

#erisUserProfileModal .lidya-profile-bio-label {
  display:block;
  font-size:11px;
  font-weight:800;
  color:var(--ui-gold);
  margin-bottom:6px;
}

html body #erisUserProfileModal .eris-profile-stats.eris-profile-stats {
  display:grid!important;
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:6px!important;
  margin:14px 0!important;
  border:1px solid var(--ui-line)!important;
  border-radius:16px!important;
  padding:6px!important;
  background:var(--ui-raised,var(--ui-panel))!important;
}

html body #erisUserProfileModal .eris-profile-stats.eris-profile-stats>div {
  grid-column:auto!important;
  min-width:0!important;
  padding:10px 3px!important;
}

html body #erisUserProfileModal .eris-profile-stats.eris-profile-stats>div+div {
  border-left:1px solid var(--ui-line);
}

html body #erisUserProfileModal .eris-profile-stats.eris-profile-stats b {
  font-size:clamp(12px,3.6vw,17px)!important;
  color:var(--ui-ink)!important;
  white-space:normal!important;
  overflow-wrap:anywhere!important;
}

html body #erisUserProfileModal .eris-profile-stats small {
  font-size:11px!important;
  margin-top:5px;
}

html body #erisUserProfileModal:not(.eris-own-profile):not(.eris-banned-profile) .eris-profile-actions.eris-profile-actions {
  display:grid!important;
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:8px!important;
  margin-top:12px!important;
}

html body #erisUserProfileModal .eris-profile-actions.eris-profile-actions>button {
  grid-column:auto!important;
  width:100%!important;
  min-width:0!important;
  min-height:50px!important;
  padding:8px 4px!important;
  margin:0!important;
  font-size:12px!important;
  line-height:1.35!important;
}

html body #erisUserProfileModal .eris-profile-actions.eris-profile-actions>button:nth-child(n+4) {
  grid-column:1/-1!important;
}

html body #erisUserProfileModal [data-block] {
  min-height:38px!important;
  font-size:12px!important;
  border:0!important;
  box-shadow:none!important;
  background:transparent!important;
}

#erisUserProfileModal .lidya-profile-posts {
  margin-top:16px!important;
  padding-top:16px;
  border-top:1px solid var(--ui-line);
}

#erisUserProfileModal .lidya-profile-posts h3 {
  font-size:17px!important;
  font-weight:800;
}

/* The empty-post illustration must never fill the screen. */
html body #erisUserProfileModal [data-profile-posts] .ec-discovery-empty {
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  gap:8px!important;
  min-height:126px!important;
  padding:18px 12px!important;
  border:1px dashed var(--ui-line)!important;
  border-radius:16px!important;
  background:var(--ui-raised,var(--ui-panel))!important;
}

html body #erisUserProfileModal [data-profile-posts] .ec-empty-art {
  display:grid!important;
  place-items:center!important;
  flex:none!important;
  width:48px!important;
  height:48px!important;
  border-radius:15px!important;
  color:var(--ui-gold)!important;
  background:color-mix(in srgb,var(--ui-gold) 9%,transparent);
}

html body #erisUserProfileModal [data-profile-posts] .ec-empty-art svg {
  display:block!important;
  width:26px!important;
  height:26px!important;
  max-width:26px!important;
  max-height:26px!important;
}

#erisUserProfileModal .ec-discovery-empty b {
  font-size:14px!important;
  color:var(--ui-ink)!important;
}

#erisUserProfileModal .ec-discovery-empty p {
  font-size:12px!important;
  margin:0!important;
  line-height:1.5;
}

@media(max-width:360px) {
  html body #erisUserProfileModal>.lidya-public-profile {
    padding-inline:12px!important;
  }
  #erisUserProfileModal .lidya-profile-toolbar {
    gap:5px!important;
  }
}
`;

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
      m.style.cssText="position:fixed;inset:0;z-index:52000!important;background:var(--ui-overlay);overflow:auto;padding:0";
      if(u.is_self)m.classList.add('eris-own-profile');
      const publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';
      m.innerHTML=`<div style="width:100%;min-height:100%;max-height:100dvh;overflow:auto;background:var(--ui-panel);border:0;border-radius:0;padding:20px 20px calc(24px + env(safe-area-inset-bottom));color:var(--ui-ink)"><div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px"><button type="button" data-fans title="Hayran listesi" aria-label="Hayran listesi" style="flex:none;width:40px;height:40px;border:0;background:transparent;color:var(--ui-ink);font-size:22px">✦</button><button type="button" data-report title="Şikâyet et" aria-label="Şikâyet et" style="flex:none;width:40px;height:40px;border:1px solid var(--ui-line);border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 6%, transparent);color:var(--ui-ink);font-size:20px">!</button><button type="button" data-close aria-label="Kapat" style="flex:none;width:40px;height:40px;border:1px solid var(--ui-line);border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 6%, transparent);color:var(--ui-ink);font-size:20px">×</button></div><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div data-profile-photo style="position:relative;width:82px;height:82px;flex:none;display:grid;place-items:center;border-radius:50%;background:var(--ui-button);color:var(--ui-ink);font-size:27px">${esc(u.avatar||'👤')}</div><div style="min-width:0;flex:1"><div class="eris-profile-title" style="justify-content:flex-start"><h2 style="margin:0 0 5px;overflow-wrap:anywhere">${esc(u.nickname||'Kullanıcı')}</h2><img class="eris-vip-card" data-vip-card hidden alt=""></div><small style="color:var(--ui-ink)">Kullanıcı ID: ${esc(publicId)}</small></div></div><div style="padding:12px;border:1px solid var(--ui-line);border-radius:15px;background:color-mix(in srgb, var(--ui-panel) 2%, transparent);font-size:12px;line-height:1.6;color:var(--ui-ink)">${esc(u.bio||'Henüz hakkında bilgisi eklenmemiş.')}</div><div class="eris-profile-stats" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px"><div style="text-align:center;padding:9px;border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 3%, transparent)"><b data-followers>${Number(u.followers_count||0)}</b><small style="display:block;color:var(--ui-ink);font-size:9px">Takipçi</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 3%, transparent)"><b data-following>${Number(u.following_count||0)}</b><small style="display:block;color:var(--ui-ink);font-size:9px">Takip</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 3%, transparent)"><b data-received-gifts>—</b><small style="display:block;color:var(--ui-ink);font-size:9px">Alınan hediye</small></div></div><div class="eris-profile-actions" style="display:flex;gap:8px;margin-top:14px"><button data-follow style="flex:1;border:0;background:linear-gradient(135deg,var(--ui-button),var(--ui-danger-bg));color:var(--ui-ink);border-radius:12px;padding:11px;font-weight:800">${u.is_following?'Takip ediliyor':u.follow_requested?'İstek gönderildi':u.is_private?'Takip İsteği Gönder':'Takip et'}</button><button data-gift style="width:100%;margin-top:8px;border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 5%, transparent);color:var(--ui-ink);border-radius:12px;padding:11px;font-weight:800">🎁 Hediye gönder</button><button data-message style="width:100%;margin-top:8px;border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 5%, transparent);color:var(--ui-ink);border-radius:12px;padding:11px;font-weight:800">💬 Mesaj gönder</button></div><button data-block style="width:100%;border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 5%, transparent);color:var(--ui-ink);border-radius:12px;padding:11px;font-weight:800">${blocked?'Engeli kaldır':'Engelle'}</button></div>`;

      const surface=m.firstElementChild;
      surface.classList.add('lidya-public-profile');
      surface.setAttribute('role','dialog');
      surface.setAttribute('aria-modal','true');
      surface.setAttribute('aria-label','Kullanıcı profili');

      const toolbar=surface.firstElementChild;
      toolbar.classList.add('lidya-profile-toolbar');

      const toolbarTitle=document.createElement('b');
      toolbarTitle.className='lidya-profile-toolbar-title';
      toolbarTitle.textContent='Kullanıcı profili';
      toolbar.prepend(toolbarTitle);

      const hero=m.querySelector('[data-profile-photo]').parentElement;
      hero.classList.add('lidya-profile-hero');

      m.querySelector('.eris-profile-title').parentElement
        .classList.add('lidya-profile-identity');

      const bio=hero.nextElementSibling;
      bio.classList.add('lidya-profile-bio');

      const bioLabel=document.createElement('small');
      bioLabel.className='lidya-profile-bio-label';
      bioLabel.textContent='Hakkımda';
      bio.prepend(bioLabel);

      const age=document.createElement('small');age.dataset.profileAge='';age.style.cssText='display:block;margin-top:6px;color:var(--ui-ink)';age.textContent=Number.isInteger(u.age)?u.age+' yaş':'';age.hidden=!Number.isInteger(u.age);m.querySelector('.eris-profile-title')?.parentElement.append(age);
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
      fanButton.hidden=!!u.fans_hidden;
      fanButton.title='Hayran seviyesi '+level+' · listeyi aç';fanButton.setAttribute('aria-label',fanButton.title);
      if(level){const badge=document.createElement('img');badge.src='./fan-levels/LEVEL'+level+'.png';badge.alt='Hayran seviyesi '+level;badge.style.cssText='width:34px;height:34px;object-fit:contain';fanButton.replaceChildren(badge)}
      fanButton.onclick=()=>window.ErisPersonalFanRanking?.(u.id);
      m.querySelector('[data-report]').onclick=()=>window.ErisFloatingProfile?.report?.(u);
      const messageButton=m.querySelector('[data-message]');
      const giftButton=m.querySelector('[data-gift]');
      if(!u.is_self&&window.ErisCurrentRoomId&&[...document.querySelectorAll('#erisLiveSeats > .eris-seat')].some(s=>s.dataset.userId===String(u.id))){
        const interaction=document.createElement('button');interaction.type='button';interaction.textContent='Mikrofon etkileşimi';interaction.disabled=blocked||blockedByThem;
        interaction.style.cssText="flex:1;min-height:42px;border:1px solid var(--ui-line);border-radius:12px;background:color-mix(in srgb, var(--ui-button) 27%, transparent);color:var(--ui-ink);padding:9px";
        interaction.onclick=()=>{m.remove();window.ErisRoomEmojis?.openInteraction?.(u.id)};m.querySelector('.eris-profile-actions').append(interaction);
      }
      giftButton.disabled=!!u.is_self||blocked||blockedByThem;
      giftButton.onclick=async()=>{if(giftButton.disabled)return;try{if(!window.ErisChatDM?.openFloating)throw new Error('Hediye paneli hazır değil.');m.remove();await window.ErisChatDM.openFloating(u.id,u.nickname||'Kullanıcı',true)}catch(e){window.toast?.(e.message||'Hediye paneli açılamadı.')}};
      const syncBlockNotice=()=>{
        let notice=m.querySelector('[data-profile-block-notice]');
        if(!blocked && !blockedByThem){notice?.remove();return}
        if(!notice){
          notice=document.createElement('div');
          notice.dataset.profileBlockNotice='';
          notice.style.cssText="margin-top:14px;padding:13px;border:1px solid var(--ui-line);border-radius:14px;background:color-mix(in srgb, var(--ui-danger-bg) 7%, transparent);color:var(--ui-ink);line-height:1.5";
          m.querySelector('.eris-profile-actions')?.before(notice);
        }
        notice.textContent=blockedByThem?'Bu kullanıcı tarafından engellendiniz. Mesaj gönderemezsiniz.':'Bu kullanıcıyı engellediniz. Mesaj göndermek için engeli kaldırın.';
      };
      syncBlockNotice();
      const postsSection=document.createElement('section');
      postsSection.className='lidya-profile-posts';
      postsSection.style.cssText='margin-top:22px';
      postsSection.innerHTML='<h3 style="margin:0 0 10px;font-size:17px">Gönderiler</h3><div data-profile-posts></div>';
      const privateLocked=!!u.is_private&&!u.is_self&&!u.can_view_private;
      if(privateLocked){
        const notice=document.createElement('div');notice.className='eris-private-profile-notice';
        notice.setAttribute('role','status');notice.textContent='🔒 Bu profil gizli';
        notice.style.cssText='margin:18px 0;padding:22px 16px;border:1px solid var(--ui-gold,#cba96a);border-radius:16px;text-align:center;font-size:17px;font-weight:800;color:var(--ui-ink);background:var(--ui-raised,var(--ui-panel))';
        m.querySelector('.eris-profile-actions')?.before(notice);
        postsSection.querySelector('[data-profile-posts]').textContent='Gönderileri görmek için takip isteği gönderin.';
      }
      m.firstElementChild.append(postsSection);
      if(!u.banned&&!privateLocked&&window.ErisSocialFeed?.loadProfile){
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
      let isFollowing=!!u.is_following, requested=!!u.follow_requested;
      const updateFollow=()=>{followButton.textContent=isFollowing?'Takip ediliyor':requested?'İstek gönderildi':u.is_private?'Takip İsteği Gönder':'Takip et';followButton.setAttribute('aria-label',followButton.textContent)};
      updateFollow();
      followButton.onclick=async()=>{followButton.disabled=true;try{
        const result=await api().api('/users/'+encodeURIComponent(u.id)+'/follow',{method:isFollowing||requested?'DELETE':'POST'});
        isFollowing=!!result.following;requested=!!result.requested;updateFollow();window.ErisProfile?.refresh?.();
      }catch(error){window.toast?.(error.message||'Takip işlemi başarısız.')}finally{followButton.disabled=false}};
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
  function headerUserId(){
    const chat=document.getElementById('chat');
    if(!chat)return null;
    const cid=chat.dataset.conversationId||window.ErisChatDM?.activeId?.()||'';
    const kind=chat.dataset.conversationType;
    if((kind&&kind!=='dm')||String(cid).startsWith('grp_')||String(cid).startsWith('welcome:'))return null;
    return window.__erisActiveDmUserId||null;
  }
  function mark(){
    const id=headerUserId();
    const chat=document.getElementById('chat');
    if(!chat)return;
    chat.querySelectorAll('.chatHead .ava,.chatHead b').forEach(el=>{
      if(id){el.dataset.userId=id;el.style.cursor='pointer';el.title='Profili aç'}
      else{el.removeAttribute('data-user-id');if(el.title==='Profili aç')el.removeAttribute('title')}
    });
  }
  document.addEventListener('click',e=>{
    const chatHeader=e.target.closest?.('#chat .chatHead .ava,#chat .chatHead b');
    // Group/family/system headers must never fall through to stale data-user-id.
    if(chatHeader){
      const id=headerUserId();
      if(id){
        e.preventDefault();e.stopImmediatePropagation();
        if(window.ErisFloatingProfile?.open)window.ErisFloatingProfile.open(id);
        else openUserProfile(id);
      }
      return;
    }
    const t=e.target.closest?.('[data-user-id]');
    if(t?.dataset.userId){e.preventDefault();e.stopImmediatePropagation();(document.getElementById('chat')?.classList.contains('eris-floating-dm')?window.ErisFloatingProfile?.open(t.dataset.userId):openUserProfile(t.dataset.userId));return;}
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
  const start=()=>{mark();mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-conversation-id','data-conversation-type']});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();


