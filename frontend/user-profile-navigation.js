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
      const [u,blockedRows]=await Promise.all([getUser(id),api().api('/me/blocks').catch(()=>[])]);
      const blocked=(Array.isArray(blockedRows)?blockedRows:[]).some(row=>row.user_id===u.id);
      document.getElementById('erisUserProfileModal')?.remove();
      const m=document.createElement('div');m.id='erisUserProfileModal';
      m.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(2,1,7,.78);backdrop-filter:blur(14px);display:grid;place-items:center;padding:18px';
      const publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';
      m.innerHTML=`<div style="width:min(390px,100%);background:#0b0811;border:1px solid #ffffff18;border-radius:24px;padding:20px;color:#fff"><button data-close style="float:right;border:0;background:#ffffff10;color:#fff;border-radius:10px;padding:8px;font-size:18px">×</button><div style="display:flex;gap:13px;align-items:center;padding-top:4px"><div style="width:68px;height:68px;border-radius:20px;background:linear-gradient(135deg,#824dff,#ff4da8);display:grid;place-items:center;font-size:30px">${esc(u.avatar||'👤')}</div><div><h2 style="margin:0">${esc(u.nickname||'Kullanıcı')}</h2><small style="color:#918699">Kullanıcı ID: ${esc(publicId)}</small><div style="font-size:11px;color:#c9bfd3;margin-top:6px">${esc(u.bio||'')}</div></div></div><div style="display:flex;gap:8px;margin-top:16px"><button data-follow style="flex:1;border:0;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;border-radius:12px;padding:11px;font-weight:800">${u.is_following?'Takip ediliyor':'Takip et'}</button><button data-block style="flex:1;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">${blocked?'Engeli kaldır':'Engelle'}</button></div><button data-message style="width:100%;margin-top:8px;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">💬 Mesaj gönder</button></div>`;
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
          window.ErisChatDM?.open?.(c?.id||c?.conversation_id||c?.conversation?.id,u.nickname||'Kullanıcı',u.avatar||'');
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
