(() => {
  'use strict';
  const mounted=new Map();
  window.addEventListener('erischat:auth',()=>{for(const [root,entry] of mounted){if(!root.isConnected||!entry.valid()){mounted.delete(root);continue}if(entry.account!==token()){root.textContent='Hesap değişti. Bu menüyü yeniden aç.';mounted.delete(root)}}});
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const api=(p,o)=>window.ErisPlatform.api(p,o);
  const style=document.createElement('style');style.textContent=`.epl{min-width:0;color:#f6eefb}.epl .epl-intro{color:#b8a8c4;font-size:14px;line-height:1.6;margin:0 0 20px}.epl .epl-tools{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.epl button.epl-button{width:auto!important;height:auto!important;min-height:44px;max-width:100%;padding:10px 15px!important;border:1px solid #8965a844!important;border-radius:13px!important;background:#281a36;color:#e7cff6;font:inherit;font-size:13px!important;white-space:normal!important;overflow-wrap:anywhere;cursor:pointer}.epl button[aria-pressed=true]{background:#70458a!important}.epl button:disabled{opacity:.55;cursor:wait}.epl button:focus-visible,.epl input:focus-visible{outline:2px solid #d5a5ff;outline-offset:3px}.epl input.epl-search{box-sizing:border-box;width:100%;min-height:48px;border:1px solid #86609e44;border-radius:15px;background:#19111f;color:white;padding:12px 15px;font:inherit;font-size:14px}.epl .epl-card{display:flex;gap:14px;align-items:center;padding:16px;border:1px solid #9070a72b;border-radius:20px;background:linear-gradient(140deg,#25162d,#15111c);margin:12px 0;min-width:0}.epl .epl-copy{min-width:0;flex:1}.epl .epl-name{display:block;overflow-wrap:anywhere;line-height:1.5;font-size:16px}.epl .epl-meta{color:#b2a1c0;font-size:12px;line-height:1.7;margin-top:5px;overflow-wrap:anywhere}.epl .epl-avatar{position:relative;flex:none;width:48px;height:48px;border-radius:50%;background:#493058;display:grid;place-items:center;color:#e2c5f7}.epl .epl-avatar>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}.epl .epl-avatar.framed>img:not(.epl-frame){inset:15%;width:70%;height:70%}.epl .epl-avatar>img.epl-frame{object-fit:contain;border-radius:0;pointer-events:none}.epl .epl-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.epl .epl-room-icon{width:46px;height:46px;flex:none;display:grid;place-items:center;border:1px solid #bd86e346;border-radius:16px;background:#a16ada15;font-size:22px}.epl .epl-status{font-size:13px;color:#c6a8dc;min-height:24px;line-height:1.6}.epl .epl-empty{padding:30px 18px;border:1px dashed #ac80c33d;border-radius:18px;text-align:center;color:#bbaaC6;font-size:14px;line-height:1.7}.epl .epl-summary{font-size:13px;color:#cba9e2}@media(max-width:360px){.epl .epl-card{padding:13px;gap:10px}.epl .epl-name{font-size:14px}.epl .epl-actions{gap:6px}}`;
  document.head.append(style);
  function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
  function button(text,action){const b=node('button','epl-button',text);b.type='button';b.onclick=action;return b}
  function asset(key){return key&&(window.ErisChatCosmetics?.assetUrl?.(key)||key)}
  async function render(root,type,valid=()=>true){
    const account=token();let rows=[],filter='all',query='',version=0,loading=false,mutating=false;
    const active=()=>root.isConnected&&valid()&&account===token();
    for(const [r,e] of mounted)if(!r.isConnected||!e.valid())mounted.delete(r);
    mounted.set(root,{account,valid});
    root.classList.add('epl');root.replaceChildren();
    root.append(node('p','epl-intro',type==='blocked'?'Güvenli alanını yönet. Engeli kaldırmak için ilgili kişinin kartındaki düğmeyi kullan.':'Sahibi veya moderatörü olduğun odalar burada. Bir odaya girerek yönetim araçlarına ulaşabilirsin.'));
    const summary=node('p','epl-summary'),tools=node('div','epl-tools'),status=node('p','epl-status'),list=node('div');status.setAttribute('role','status');list.setAttribute('aria-live','polite');
    const search=node('input','epl-search');search.type='search';search.placeholder=type==='blocked'?'Kullanıcı ara':'Oda adı veya ID ara';search.setAttribute('aria-label',search.placeholder);search.oninput=()=>{query=search.value.toLocaleLowerCase('tr-TR').trim();draw()};
    if(type==='rooms')for(const [key,label] of [['all','Tümü'],['owner','Sahibi olduklarım'],['moderator','Moderatörlük']]){const b=button(label,()=>{filter=key;tools.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.filter===filter)));draw()});b.dataset.filter=key;b.setAttribute('aria-pressed',String(key===filter));tools.append(b)}
    const refresh=button('Yenile',()=>load());tools.append(refresh);root.append(summary,search,tools,status,list);
    function draw(){
      if(!active())return;list.replaceChildren();summary.textContent=rows.length+(type==='blocked'?' engellenen kullanıcı':' oda');
      const shown=rows.filter(r=>(filter==='all'||r.role===filter)&&[r.nickname,r.name,r.public_id].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(query));
      if(!shown.length){list.append(node('div','epl-empty',query||filter!=='all'?'Bu aramada sonuç yok.':type==='blocked'?'Engellenen kullanıcı yok.':'Henüz sahibi veya moderatörü olduğun bir oda yok.'));return}
      for(const row of shown){const card=node('article','epl-card'),copy=node('div','epl-copy');
        if(type==='blocked'){
          const ava=node('div','epl-avatar',String(row.nickname||'K').slice(0,1).toLocaleUpperCase('tr-TR'));
          if(asset(row.avatar_asset)){const img=node('img');img.src=asset(row.avatar_asset);img.alt='';img.onerror=()=>img.remove();ava.append(img)}
          if(asset(row.frame_asset)){ava.classList.add('framed');const img=node('img','epl-frame');img.src=asset(row.frame_asset);img.alt='';ava.append(img)}
          const name=node('b','epl-name',row.nickname||'Kullanıcı');copy.append(name);const date=new Date(row.created_at);copy.append(node('div','epl-meta','Engellendi'+(Number.isNaN(date.getTime())?'':' · '+date.toLocaleDateString('tr-TR'))));
          const actions=node('div','epl-actions');const remove=button('Engeli kaldır',()=>{
            actions.replaceChildren();const cancel=button('Vazgeç',()=>{actions.replaceChildren(remove)});const confirm=button('Evet, engeli kaldır',async()=>{
              if(!active()||mutating)return;mutating=true;refresh.disabled=true;confirm.disabled=cancel.disabled=true;status.textContent='Engel kaldırılıyor…';
              try{await api('/users/'+encodeURIComponent(row.user_id)+'/block',{method:'DELETE'});if(!active())return;rows=rows.filter(x=>x.user_id!==row.user_id);window.dispatchEvent(new CustomEvent('erischat:user-block-changed',{detail:{userId:row.user_id,blocked:false}}));status.textContent='Engel kaldırıldı.';draw()}
              catch(e){if(active()){status.textContent=e.message||'Engel kaldırılamadı. Tekrar dene.';confirm.disabled=cancel.disabled=false}}finally{mutating=false;refresh.disabled=false}
            });actions.append(confirm,cancel);confirm.focus();
          });actions.append(remove);copy.append(actions);card.append(ava,copy);
        }else{
          const role=row.role==='owner'?'Oda sahibi':'Moderatör';copy.append(node('b','epl-name',row.name||'Oda'),node('div','epl-meta',role+' · '+Number(row.member_count||0).toLocaleString('tr-TR')+' kişi'+(row.locked?' · Kilitli':'')));
          if(row.public_id)copy.append(node('div','epl-meta','ID: '+row.public_id));const actions=node('div','epl-actions');const enter=button('Odaya gir',async()=>{
            if(!active())return;if(typeof window.openRoom!=='function'){status.textContent='Oda sistemi hazır değil. Uygulamayı yeniden aç.';return}
            enter.disabled=true;status.textContent='Oda açılıyor…';try{window.ErisProfileHub?.close?.();await window.openRoom(row.id,row.name||'Oda')}catch(e){if(active())status.textContent=e.message||'Odaya girilemedi.'}finally{enter.disabled=false}
          });actions.append(enter);if(row.public_id)actions.append(button('ID kopyala',async()=>{if(!active())return;try{await navigator.clipboard.writeText(String(row.public_id));if(active())status.textContent='Oda ID’si kopyalandı.'}catch(e){if(active())status.textContent='Oda ID: '+row.public_id}}));copy.append(actions);card.append(node('div','epl-room-icon',row.locked?'🔒':'⌂'),copy);
        }list.append(card);
      }
    }
    async function load(){
      if(loading||mutating||!active())return;loading=true;const current=++version;refresh.disabled=true;status.textContent='Yükleniyor…';list.replaceChildren();
      try{if(!account)throw Error('Bu liste için giriş yapmalısın.');const result=await api(type==='blocked'?'/me/blocks':'/rooms/me/rooms');if(!active()||current!==version)return;rows=Array.isArray(result)?result:(result?.rooms||result?.items||[]);status.textContent='';draw()}
      catch(e){if(active()&&current===version){rows=[];summary.textContent='';list.replaceChildren(node('div','epl-empty',type==='blocked'?'Engellenenler yüklenemedi. Yenile düğmesiyle tekrar dene.':'Odaların yüklenemedi. Yenile düğmesiyle tekrar dene.'));status.textContent=e.message||'Bağlantını kontrol et.'}}
      finally{if(current===version){loading=false;refresh.disabled=false}}
    }
    await load();return {refresh:load};
  }
  window.ErisProfileLists={blocked:(root,valid)=>render(root,'blocked',valid),rooms:(root,valid)=>render(root,'rooms',valid)};
})();
