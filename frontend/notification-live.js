(() => {
  'use strict';
  let account='', generation=0, cursor=0, baseline=false, pending=null, timer, enabled=null;
  const api=(path,options)=>window.ErisPlatform.api(path,options);
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const style=document.createElement('style');
  style.textContent=`#eris-notice-stack{position:fixed;z-index:2147483646;top:calc(env(safe-area-inset-top,0px) + 12px);left:12px;right:12px;max-width:440px;margin:auto;pointer-events:none}#eris-notice-stack .en-banner{pointer-events:auto;display:flex;gap:10px;padding:14px;margin-bottom:8px;background:#24182e;border:1px solid #a978cc;border-radius:20px;box-shadow:0 12px 40px #0009;color:#fff}#eris-notice-stack button{min-width:44px;min-height:44px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}#eris-notice-stack .en-open{text-align:left;flex:1;min-width:0}#eris-notice-stack b,#eris-notice-stack span{display:block;overflow-wrap:anywhere}#eris-notice-stack span{font-size:14px;color:#d4c6dd;margin-top:4px}.en-center{min-width:0;color:#f9f5ff}.en-center .en-tools{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.en-center button{width:auto!important;height:auto!important;min-height:44px;padding:10px 16px!important;border:1px solid #594166!important;border-radius:14px;background:#251a31;color:#ead9fa;font:inherit;white-space:normal!important;cursor:pointer}.en-center button[aria-pressed=true]{background:#603778}.en-center .en-card{padding:18px;margin:12px 0;border:1px solid #44324f;border-radius:20px;background:#17121f;overflow-wrap:anywhere}.en-center .en-card.unread{border-left:4px solid #c67bff}.en-center .en-card b{font-size:17px}.en-center p{color:#bcb0c8;line-height:1.6}.en-center time{display:block;color:#998da4;font-size:12px;margin:10px 0}.en-center .en-empty{padding:28px 18px;border:1px dashed #594166;border-radius:20px;text-align:center}`;
  document.head.append(style);
  const stack=document.createElement('div');stack.id='eris-notice-stack';stack.setAttribute('aria-live','polite');
  const mount=()=>{if(!stack.isConnected)document.body.append(stack)};
  function reset(next){account=next;enabled=null;generation++;cursor=0;baseline=false;pending=null;stack.replaceChildren();}
  function banner(row,g){
    if(enabled===false||g!==generation)return;mount();while(stack.children.length>=3)stack.firstElementChild.remove();
    const card=document.createElement('div');card.className='en-banner';
    const open=document.createElement('button');open.className='en-open';open.type='button';
    const title=document.createElement('b');title.textContent=row.title||'Yeni bildirim';
    const text=document.createElement('span');text.textContent=(row.body||'').slice(0,240);open.append(title,text);
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Bildirimi kapat');close.onclick=()=>card.remove();
    open.onclick=()=>{if(g!==generation)return;card.remove();window.showView?.('profile');window.ErisProfileHub?.show('notifications');};
    card.append(open,close);stack.append(card);setTimeout(()=>card.remove(),9000);
  }
  async function refresh(){
    const next=token();if(next!==account)reset(next);if(!next||enabled===false)return [];
    if(pending)return pending;
    const g=generation;
    const job=(async()=>{
      if(enabled===null){const privacy=await api('/me/privacy');if(g!==generation||token()!==account)return [];enabled=!privacy.hide_notifications;}
      if(!enabled)return [];
      const rows=await api('/me/notifications?limit=100');
      if(g!==generation||token()!==account)return [];
      const highest=rows.reduce((n,r)=>Math.max(n,Number(r.id)||0),cursor);
      if(baseline)rows.filter(r=>!r.read&&Number(r.id)>cursor).slice(0,3).reverse().forEach(r=>banner(r,g));
      cursor=highest;baseline=true;
      window.dispatchEvent(new CustomEvent('erischat:notifications',{detail:rows}));return rows;
    })();pending=job;
    try{return await job}finally{if(pending===job)pending=null}
  }
  async function render(root,valid=()=>true){
    let rows=[],filter='all',g=generation;
    root.classList.add('en-center');
    const draw=()=>{
      if(!valid()||!root.isConnected)return;
      root.replaceChildren();
      const intro=document.createElement('p');intro.textContent='Yeni bildirimler uygulama açıkken her ekranda üstte görünür. Son 100 bildirimin burada.';
      const tools=document.createElement('div');tools.className='en-tools';
      for(const [key,label] of [['all','Tümü'],['unread','Okunmamış']]){const b=document.createElement('button');b.textContent=label;b.type='button';b.setAttribute('aria-pressed',String(filter===key));b.onclick=()=>{filter=key;draw()};tools.append(b)}
      const reload=document.createElement('button');reload.type='button';reload.textContent='Yenile';reload.onclick=load;tools.append(reload);root.append(intro,tools);
      const shown=rows.filter(r=>filter==='all'||!r.read);
      if(!shown.length){const empty=document.createElement('p');empty.className='en-empty';empty.textContent=filter==='unread'?'Tüm bildirimler okundu.':'Henüz bildirim yok. Bildirimlerin gizli ise Gizlilik ayarlarından açabilirsin.';root.append(empty)}
      shown.forEach(row=>{const card=document.createElement('article');card.className='en-card'+(!row.read?' unread':'');const title=document.createElement('b');title.textContent=row.title||'Bildirim';const body=document.createElement('p');body.textContent=row.body||'';const time=document.createElement('time');const date=new Date(row.created_at);time.textContent=Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR');card.append(title,body,time);
        if(!row.read){const b=document.createElement('button');b.type='button';b.textContent='Okundu olarak işaretle';b.onclick=async()=>{if(g!==generation||token()!==account){root.textContent='Hesap değişti. Bildirimler menüsünü yeniden aç.';return}b.disabled=true;try{await api('/me/notifications/'+encodeURIComponent(row.id)+'/read',{method:'POST'});if(g!==generation||!valid())return;row.read=true;draw()}catch(e){b.disabled=false;b.textContent='Tekrar dene'}};card.append(b)}else{const status=document.createElement('small');status.textContent='Okundu';card.append(status)}root.append(card)});
    };
    async function load(){root.textContent='Bildirimler yükleniyor…';try{rows=await refresh();g=generation;if(valid())draw()}catch(e){if(!valid())return;root.textContent='Bildirimler yüklenemedi. ';const b=document.createElement('button');b.type='button';b.textContent='Tekrar dene';b.onclick=load;root.append(b)}}
    await load();
  }
  async function tick(){clearTimeout(timer);try{if(!document.hidden)await refresh()}catch(e){}timer=setTimeout(tick,10000)}
  function apply(privacy){const next=!privacy.hide_notifications;if(enabled===next)return;enabled=next;generation++;pending=null;baseline=false;stack.replaceChildren();}
  window.ErisNotifications={refresh,render,apply};
  window.addEventListener('erischat:auth',()=>{reset(token());tick()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick,{once:true});else tick();
})();
