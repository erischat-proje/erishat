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
      const blocked=(Array.isArray(blockedRows)?blockedRows:[]).some(row=>row.user_id===u.id);
      document.getElementById('erisUserProfileModal')?.remove();
      const m=document.createElement('div');m.id='erisUserProfileModal';
      m.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(2,1,7,.78);backdrop-filter:blur(14px);display:grid;place-items:center;padding:18px';
      const publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';
      const avatarPath=u.avatar_asset||'',framePath=u.frame_asset||'';
      const avatarUrl=avatarPath?(window.ErisChatCosmetics?.assetUrl?.(avatarPath)||avatarPath):'';
      const frameUrl=framePath?(window.ErisChatCosmetics?.assetUrl?.(framePath)||framePath):'';
      m.innerHTML=`<div style="width:min(390px,100%);max-height:86vh;overflow:auto;background:#0b0811;border:1px solid #ffffff18;border-radius:24px;padding:20px;color:#fff"><button data-close style="float:right;border:0;background:#ffffff10;color:#fff;border-radius:10px;padding:8px;font-size:18px">×</button><div style="display:flex;gap:14px;align-items:center;padding:8px 0 14px"><div style="position:relative;width:76px;height:76px;flex:none"><div style="width:64px;height:64px;margin:6px;border-radius:50%;background:${avatarUrl?`url("${esc(avatarUrl)}") center/cover`: 'linear-gradient(135deg,#824dff,#ff4da8)'};display:grid;place-items:center;font-size:26px">${avatarUrl?'':esc(u.avatar||'👤')}</div>${frameUrl?`<div aria-hidden="true" style="position:absolute;inset:0;background:url("${esc(frameUrl)}") center/contain no-repeat;pointer-events:none"></div>`:''}</div><div style="min-width:0"><h2 style="margin:0 0 5px">${esc(u.nickname||'Kullanıcı')}</h2><small style="color:#918699">Kullanıcı ID: ${esc(publicId)}</small></div></div><div style="padding:12px;border:1px solid #ffffff12;border-radius:15px;background:#ffffff05;font-size:12px;line-height:1.6;color:#c9bfd3">${esc(u.bio||'Henüz hakkında bilgisi eklenmemiş.')}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px"><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Number(vip.level||0)}</b><small style="display:block;color:#918699;font-size:9px">VIP</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Number(fans.total||0)}</b><small style="display:block;color:#918699;font-size:9px">Takipçi</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Array.isArray(gifts)?gifts.length:0}</b><small style="display:block;color:#918699;font-size:9px">Hediye</small></div></div><div style="display:flex;gap:8px;margin-top:14px"><button data-follow style="flex:1;border:0;background:linear-gradient(135deg,#754cff,#ff4da3);color:#fff;border-radius:12px;padding:11px;font-weight:800">${u.is_following?'Takip ediliyor':'Takip et'}</button><button data-block style="flex:1;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">${blocked?'Engeli kaldır':'Engelle'}</button></div><button data-message style="width:100%;margin-top:8px;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">💬 Mesaj gönder</button></div>`;
      document.body.appendChild(m);
      m.querySelector('[data-close]').onclick=()=>m.remove();
      m.onclick=e=>{if(e.target===m)m.remove();};
      const followButton=m.querySelector('[data-follow]');
      if(u.is_self){followButton.disabled=true;followButton.textContent='Bu senin profilin';}
      followButton.onclick=async()=>{followButton.disabled=true;try{const following=followButton.textContent==='Takip ediliyor';await api().api('/users/'+encodeURIComponent(u.id)+'/follow',{method:following?'DELETE':'POST'});followButton.textContent=following?'Takip et':'Takip ediliyor';window.ErisProfile?.refresh?.()}catch(error){window.toast?.(error.message||'Takip işlemi başarısız.')}finally{followButton.disabled=false}};
      const blockButton=m.querySelector('[data-block]');
      blockButton.onclick=async()=>{blockButton.disabled=true;try{const isBlocked=blockButton.textContent==='Engeli kaldır';await api().api('/users/'+encodeURIComponent(u.id)+'/block',{method:isBlocked?'DELETE':'POST'});blockButton.textContent=isBlocked?'Engelle':'Engeli kaldır';window.toast?.(isBlocked?'Engel kaldırıldı.':'Kullanıcı engellendi.')}catch(error){window.toast?.(error.message||'Engelleme işlemi başarısız.')}finally{blockButton.disabled=false}};
      m.querySelector('[data-message]').onclick=async()=>{
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
    if(t?.dataset.userId){e.preventDefault();e.stopImmediatePropagation();openUserProfile(t.dataset.userId);return;}
    const header=e.target.closest?.('#chat .chatHead .ava,#chat .chatHead b');
    if(header&&window.__erisActiveDmUserId){e.preventDefault();e.stopImmediatePropagation();openUserProfile(window.__erisActiveDmUserId);}
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
