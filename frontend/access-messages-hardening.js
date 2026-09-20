(() => {
  'use strict';
  const apiBase=()=>String(window.ERISCHAT_API_BASE||localStorage.getItem('erischat.apiBase')||'').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(path,options={}){
    const headers=Object.assign({'Content-Type':'application/json'},options.headers||{});
    const t=token(); if(t)headers.Authorization='Bearer '+t;
    const r=await fetch(apiBase()+path,Object.assign({},options,{headers}));
    let b=null;try{b=await r.json()}catch{}
    if(!r.ok)throw new Error(b?.detail||'İstek başarısız');
    return b;
  }
  function css(){
    if(document.getElementById('eris-message-search-hardening-css'))return;
    const s=document.createElement('style');s.id='eris-message-search-hardening-css';s.textContent=[
      '#messages .eris-dm-search{display:flex;gap:8px;margin:12px 0 14px;padding:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);backdrop-filter:blur(14px);border-radius:17px}',
      '#messages .eris-dm-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;padding:10px 9px;font-size:12px}',
      '#messages .eris-dm-search input::placeholder{color:#8f8498}',
      '#messages .eris-dm-search button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;border-radius:12px;padding:0 14px;font-weight:800}',
      '.eris-user-result{width:100%;box-sizing:border-box;text-align:left;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.045);color:#fff;border-radius:17px;padding:12px;margin-bottom:8px}',
      '.eris-user-result .id{display:block;color:#8f8498;font-size:9px;margin-top:3px}',
      '.eris-user-actions{display:flex;gap:7px;margin-top:9px}.eris-user-actions button{flex:1;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.07);color:#fff;border-radius:11px;padding:9px;font-size:10px;font-weight:800}',
      '#erisUserProfileModal{position:fixed;inset:0;z-index:7000;background:rgba(2,1,7,.72);backdrop-filter:blur(12px);display:grid;place-items:center;padding:18px}',
      '#erisUserProfileModal .box{width:min(380px,100%);background:#0b0811;border:1px solid #ffffff14;border-radius:24px;padding:18px;color:#fff;box-shadow:0 25px 80px #000b}',
      '#erisUserProfileModal .avatar{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#824dff,#ff4da8);font-size:28px;margin-bottom:10px}'
    ].join('');document.head.appendChild(s);
  }
  function profileModal(user){
    document.getElementById('erisUserProfileModal')?.remove();
    const m=document.createElement('div');m.id='erisUserProfileModal';
    m.innerHTML='<div class="box"><button data-close style="float:right;border:0;background:#ffffff10;color:#fff;border-radius:10px;padding:8px;font-size:18px">×</button><div class="avatar">'+esc(user.avatar||'👤')+'</div><h3 style="margin:0 0 4px">'+esc(user.nickname||'Kullanıcı')+'</h3><span style="color:#8f8498;font-size:10px">Kullanıcı ID: '+esc(user.public_id||user.id)+'</span><div style="margin-top:14px;color:#aaa0b1;font-size:10px">ErisChat profili</div><div class="eris-user-actions"><button data-message>💬 Mesaj gönder</button></div></div>';
    document.body.appendChild(m);m.querySelector('[data-close]').onclick=()=>m.remove();
    m.querySelector('[data-message]').onclick=async()=>{try{const c=await window.ErisChatAPI?.createConversation?.(user.id);m.remove();if(typeof window.openView==='function')window.openView('messages');if(typeof window.openChat==='function')window.openChat(user.nickname||'Kullanıcı',String(user.nickname||'K').charAt(0).toUpperCase());await window.ErisChatAPI?.setConversation?.(c.id); }catch(e){window.showToast?.(e.message||'Konuşma açılamadı.')}};
  }
  async function findUser(id){
    const value=String(id||'').trim();if(!value)return;
    const box=document.getElementById('erisDmSearchResults');if(box)box.innerHTML='<div class="empty">Aranıyor…</div>';
    try{
      const user=await request('/v1/users/'+encodeURIComponent(value));
      if(!box)return;
      box.innerHTML='<button class="eris-user-result" type="button"><div style="display:flex;gap:10px;align-items:center"><div class="pic" style="width:42px;height:42px;display:grid;place-items:center">'+esc(user.avatar||'👤')+'</div><div><b>'+esc(user.nickname||'Kullanıcı')+'</b><span class="id">ID '+esc(user.public_id||user.id)+'</span></div></div><div class="eris-user-actions"><button type="button" data-profile>👤 Profili aç</button><button type="button" data-message>💬 Mesaj</button></div></button>';
      const card=box.firstElementChild;card.onclick=e=>{if(e.target.closest('[data-profile]')||e.target.closest('[data-message]'))return;profileModal(user)};
      card.querySelector('[data-profile]').onclick=()=>profileModal(user);
      card.querySelector('[data-message]').onclick=async()=>{try{const c=await window.ErisChatAPI?.createConversation?.(user.id);if(typeof window.openView==='function')window.openView('messages');if(typeof window.openChat==='function')window.openChat(user.nickname||'Kullanıcı',String(user.nickname||'K').charAt(0).toUpperCase());await window.ErisChatAPI?.setConversation?.(c.id)}catch(e){window.showToast?.(e.message||'Konuşma açılamadı.')}};
    }catch(e){if(box)box.innerHTML='<div class="empty">'+esc(e.message||'Kullanıcı bulunamadı.')+'</div>';}
  }
  function install(){
    css();
    const messages=document.getElementById('messages');if(!messages||messages.dataset.searchHardening==='1')return;
    messages.dataset.searchHardening='1';
    messages.querySelectorAll('button').forEach(b=>{if(/yeni konuşma/i.test(b.textContent||''))b.remove()});
    const h2=messages.querySelector('h2');
    const p=document.createElement('div');p.className='eris-dm-search';
    p.innerHTML='<input id="erisDmSearchInput" inputmode="numeric" autocomplete="off" placeholder="Kullanıcı ID ara…"><button type="button" id="erisDmSearchBtn">Ara</button>';
    const results=document.createElement('div');results.id='erisDmSearchResults';
    if(h2)h2.insertAdjacentElement('afterend',p);else messages.prepend(p);p.insertAdjacentElement('afterend',results);
    const input=p.querySelector('input'),btn=p.querySelector('button');btn.onclick=()=>findUser(input.value);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findUser(input.value)}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('erischat:room-opened',()=>{});
})();