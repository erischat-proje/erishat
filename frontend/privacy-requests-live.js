(() => {
  'use strict';
  const api = (path, options) => window.ErisPlatform.api(path, options);
  const style = document.createElement('style');
  style.textContent = `
    .eris-privacy-action{border:1px solid #cba96a;border-radius:12px;padding:10px 14px;margin:7px;background:linear-gradient(125deg,#382b20,#a17b3d);color:#fff6dd;font-weight:700;cursor:pointer}
    .eris-privacy-modal{position:fixed;inset:0;z-index:91000;background:#000b;display:grid;place-items:center;padding:18px}
    .eris-privacy-panel{width:min(440px,100%);max-height:80dvh;overflow:auto;border:2px solid #c5a267;border-radius:22px;padding:18px;background:var(--ui-panel,#201c24);color:var(--ui-ink,#fff);box-shadow:0 20px 90px #0009}
    .eris-privacy-panel header{display:flex;align-items:center;justify-content:space-between;gap:8px}.eris-privacy-panel header b{font-size:18px}
    .eris-privacy-row{display:flex;align-items:center;gap:9px;padding:12px 0;border-bottom:1px solid #ab8b5b55}.eris-privacy-row span{flex:1;min-width:0;overflow-wrap:anywhere}
    .eris-request-avatar{position:relative;flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:var(--ui-raised,#302b21);border:1px solid #cba96a;font-size:25px}.eris-request-avatar>img:not(.eris-request-frame){width:100%;height:100%;border-radius:50%;object-fit:cover}.eris-request-avatar .eris-request-frame{position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);object-fit:contain;pointer-events:none}.eris-privacy-row .eris-privacy-action{margin:0;padding:8px 11px;min-width:40px;flex:none}.eris-privacy-row span{font-weight:700}
    .eris-request-details{display:flex;flex-direction:column;flex:1;min-width:0;gap:3px}.eris-request-preview{font-size:12px;font-weight:400;opacity:.82;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .eris-privacy-action:focus-visible{outline:3px solid #e7c17c}
  `;
  document.head.append(style);
  const btn = (label, handler) => { const b=document.createElement('button');b.type='button';b.className='eris-privacy-action';b.textContent=label;b.onclick=handler;return b; };
  function modal(title) {
    const shade=document.createElement('div');shade.className='eris-privacy-modal';shade.setAttribute('role','presentation');
    const panel=document.createElement('section');panel.className='eris-privacy-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
    const header=document.createElement('header'), heading=document.createElement('b');heading.textContent=title;
    const close=btn('×',()=>shade.remove());close.setAttribute('aria-label','Kapat');header.append(heading,close);panel.append(header);shade.append(panel);
    shade.addEventListener('click',e=>{if(e.target===shade)shade.remove();});document.body.append(shade);return panel;
  }
  const error = e => window.toast?.(e?.message||'İşlem tamamlanamadı. Tekrar deneyin.');
  async function privacy() {
    try {
      const state=await api('/me/profile-privacy');
      const panel=modal('Profil Gizliliği');
      const p=document.createElement('p');p.textContent=state.is_private?'Profilinizi gizlilikten çıkarmak istiyor musunuz?':'Profilinizi gizlemek istiyor musunuz?';panel.append(p);
      panel.append(btn('Kabul Et',async()=>{try{await api('/me/profile-privacy',{method:'PATCH',body:JSON.stringify({is_private:!state.is_private})});panel.parentElement.remove();window.toast?.('Profil gizliliği güncellendi.');refresh();}catch(e){error(e);}}),btn('Reddet',()=>panel.parentElement.remove()));
    }catch(e){error(e);}
  }
  async function list(type) {
    const isFollow=type==='follow', title=isFollow?'Takip İstekleri':'Mesaj İstekleri';
    try {
      const rows=await api(isFollow?'/me/follow-requests':'/me/message-requests');
      const panel=modal(title);
      if(!rows.length){const p=document.createElement('p');p.textContent='Bekleyen istek yok.';panel.append(p);return;}
      rows.forEach(r=>{
        const line=document.createElement('div');line.className='eris-privacy-row';
        const who=document.createElement('span');who.textContent=r.nickname||'Kullanıcı';
        if(!isFollow){
          const portrait=document.createElement('div');portrait.className='eris-request-avatar';portrait.textContent='👤';
          const avatar=document.createElement('img');avatar.alt='';
          api('/users/'+encodeURIComponent(r.sender_id)).then(u=>{const url=u.avatar_asset?(window.ErisChatCosmetics?.assetUrl?.(u.avatar_asset)||u.avatar_asset):'';if(url){avatar.src=url;portrait.replaceChildren(avatar)}else if(u.avatar)portrait.textContent=u.avatar;const frameUrl=u.frame_asset?(window.ErisChatCosmetics?.assetUrl?.(u.frame_asset)||u.frame_asset):'';if(frameUrl){const frame=document.createElement('img');frame.alt='';frame.className='eris-request-frame';frame.src=frameUrl;portrait.append(frame)}}).catch(()=>{});
          line.append(portrait);
        }
        if(!isFollow && r.preview){const details=document.createElement('div');details.className='eris-request-details';details.append(who);const preview=document.createElement('small');preview.className='eris-request-preview';preview.textContent=r.preview;details.append(preview);line.append(details);}else line.append(who);
        const base=isFollow?'/me/follow-requests/':'/me/message-requests/';
        const decide=(action)=>async()=>{try{const response=await api(base+r.id+'/'+action,{method:'POST'});line.remove();if(!isFollow&&action==='accept'&&response.conversation_id)window.toast?.('Mesaj isteği kabul edildi.');}catch(e){error(e);}};
        const accept=btn('✓',decide('accept'));accept.title='Kabul Et';accept.setAttribute('aria-label','Kabul Et');const reject=btn('✕',decide('reject'));reject.title='Reddet';reject.setAttribute('aria-label','Reddet');line.append(accept,reject);panel.append(line);
      });
    }catch(e){error(e);}
  }
  async function refresh() {
    const profile=document.getElementById('profile');if(!profile)return;
    let toolbar=profile.querySelector('.toolbar')||profile;
    if(!document.getElementById('eris-profile-private-button')){const b=btn('🔒 Profil Gizliliği',privacy);b.id='eris-profile-private-button';toolbar.append(b);}
    let requests=document.getElementById('eris-follow-request-button');
    try{const state=await api('/me/profile-privacy');
      if(state.is_private){
        const rows=await api('/me/follow-requests');
        // Profilin kendi takip isteği düğmesi varsa ikinci bir düğme üretme.
        const existing=[...profile.querySelectorAll('button,[role=button]')].find(el=>el.id!=='eris-follow-request-button'&&/takip istekleri/i.test(el.textContent||''));
        if(existing){requests?.remove();requests=null;existing.textContent='Takip İstekleri ('+rows.length+')';existing.onclick=()=>list('follow');}
        else {if(!requests){requests=btn('',()=>list('follow'));requests.id='eris-follow-request-button';toolbar.append(requests);}requests.textContent='Takip İstekleri ('+rows.length+')';}
      }
      else {requests?.remove();profile.querySelectorAll('button,[role=button]').forEach(el=>{if(/takip istekleri/i.test(el.textContent||''))el.style.display='none';});}
    }catch(e){/* Authentication may not yet be ready. */}
    const messages=document.getElementById('messages');
    if(messages){
      let b=document.getElementById('eris-message-request-button');
      if(!b){b=btn('✉ Mesaj İstekleri',()=>list('message'));b.id='eris-message-request-button';(messages.querySelector('h1')||messages).after(b);}
      try {const state=await api('/me/profile-privacy');b.hidden=!state.is_private;b.style.display=state.is_private?'':'none';}
      catch(_){b.hidden=true;b.style.display='none';}
    }
  }
  window.addEventListener('erischat:auth',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})();
