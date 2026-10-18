(() => {
  'use strict';
  let active = '', serial = 0, state = 'normal';
  const api = (path) => window.ErisPlatform?.api(path);
  const style = document.createElement('style');
  style.textContent = `
  #profile .toolbar{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important}
  #profile .toolbar h2{flex:1 1 100%!important;min-width:0!important;font-size:clamp(22px,6vw,34px)!important;line-height:1.2!important;overflow-wrap:normal!important}
  #profile .toolbar .eris-privacy-action{flex:0 1 auto!important;width:auto!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:10px 12px!important;font-size:13px!important;line-height:1.35!important;white-space:normal!important;overflow-wrap:normal!important;word-break:normal!important}
  #profile .toolbar [data-eris-follow-primary]{max-width:100%!important}
  #chat .eris-private-dm-notice{margin:14px auto;padding:18px 16px;max-width:410px;width:calc(100% - 28px);text-align:center;border:1px solid var(--ui-line,#b79a63);border-radius:18px;background:var(--ui-panel,#19231e);color:var(--ui-ink,#fff4dc);line-height:1.6;font-size:14px;box-shadow:0 5px 22px #0002}
  #chat .eris-private-dm-notice strong{display:block;font-size:18px;margin-bottom:8px}
  #chat .eris-private-dm-notice[data-state=pending]{border-color:var(--ui-gold,#d9af65)}
  `;
  document.head.append(style);
  function syncProfile(){
    const root=document.getElementById('profile');if(!root)return;
    const toolbar=root.querySelector('.toolbar');if(!toolbar)return;
    const matches=[...toolbar.querySelectorAll('button,[role=button]')].filter(b=>/takip\s*istekleri/i.test((b.textContent||'').replace(/\s+/g,' ')));
    const primary=matches[0];
    for(const b of matches){if(b!==primary){b.remove();}}
    if(primary){primary.dataset.erisFollowPrimary='1';primary.hidden=false;primary.style.removeProperty('display');}
  }
  const profileObserver=new MutationObserver(()=>{syncProfile()});
  function show(chat){
    if(!chat||!chat.classList.contains('show'))return;
    const body=chat.querySelector('.chatBody');const send=chat.querySelector('.compose .primary');const input=chat.querySelector('.compose #chatInput, .compose input:not([type=range])');
    if(!body)return;
    body.querySelector('.eris-private-dm-notice')?.remove();
    if(send)send.disabled=(state==='pending'||state==='rejected');
    if(input)input.disabled=(state==='pending'||state==='rejected');
    if(state==='normal'||state==='first')return;
    const panel=document.createElement('section');panel.className='eris-private-dm-notice';panel.dataset.state=state;panel.setAttribute('role','status');
    const heading=document.createElement('strong');heading.textContent=state==='pending'?'🔒 Bu profil gizli':'Mesaj isteği reddedildi';
    const msg=document.createElement('span');msg.textContent=state==='pending'?'İlk mesajınız mesaj isteği sayılmıştır. Karşı tarafın mesaj isteğinizi kabul etmesini bekleyiniz. Kabul edilene kadar ikinci mesaj gönderemezsiniz.':'Bu kullanıcı mesaj isteğinizi reddetti.';
    panel.append(heading,msg);body.prepend(panel);
  }
  async function refresh(id){
    const seq=++serial;active=String(id||'');state='normal';
    const chat=document.getElementById('chat');
    if(!id)return;
    try{const result=await api('/conversations/'+encodeURIComponent(id)+'/message-request-status');if(seq!==serial||active!==String(id))return;state=result?.state||'normal';show(chat)}
    catch(err){if(seq===serial)console.warn('[ErisChat] message request status unavailable',err)}
  }
  window.ErisPrivateDM={open:refresh,sent:id=>{if(String(id)===active){state='pending';show(document.getElementById('chat'));refresh(id)}}};
  function start(){setInterval(()=>{if(active&&state==='pending'&&document.getElementById('chat')?.classList.contains('show')){const id=active;api('/conversations/'+encodeURIComponent(id)+'/message-request-status').then(r=>{if(active===id&&r?.state&&r.state!==state){state=r.state;show(document.getElementById('chat'));if(state==='normal')window.toast?.('Mesaj isteğiniz kabul edildi.')}}).catch(()=>{})}},8000);const profile=document.getElementById('profile');if(profile){profileObserver.observe(profile,{subtree:true,childList:true,characterData:true});syncProfile()}window.addEventListener('erischat:auth',()=>{active='';state='normal';serial++});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
