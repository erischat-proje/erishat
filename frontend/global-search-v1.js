(() => {
  'use strict';
  const root=document.getElementById('search');if(!root)return;
  const input=root.querySelector('#searchInput'),form=root.querySelector('form'),
    status=root.querySelector('[data-lgs-status]'),list=root.querySelector('#searchResults'),
    more=root.querySelector('[data-lgs-more]'),tabs=[...root.querySelectorAll('[data-lgs-kind]')];
  let kind='people',query='',next=null,generation=0,controller=null;
  const ranks=['','Şövalye','Kont','Dük','Kral'];
  const node=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!=null)el.textContent=value;return el;};
  const session=()=>window.ErisPlatform?.getAccessToken?.()||'';
  function asset(value){
    if(!value)return '';const raw=String(value);
    const resolved=window.ErisChatCosmetics?.assetUrl?.(raw)||raw;
    return /^(https?:\/\/|\/|assets\/|\.\/)/i.test(resolved)&&!resolved.startsWith('//')?resolved:'';
  }
  function portrait(row,room){
    const data=room?{avatar:row.owner_avatar,avatar_asset:row.owner_avatar_asset,frame_asset:row.owner_frame_asset,nobility:row.owner_nobility}:row;
    const el=node('span','lgs-portrait',data.avatar||'👤');
    const royal=window.LidyaNobilityAppearance?.royalPortrait?.(data);
    const av=asset(royal?.avatar||data.avatar_asset);
    const frame=asset(royal?.frame||(!royal?.embedded&&data.frame_asset));
    if(av){const img=node('img','lgs-avatar');img.alt='';img.src=av;img.onerror=()=>{img.remove();el.prepend(document.createTextNode(data.avatar||'👤'));};el.replaceChildren(img);}
    if(frame){const img=node('img','lgs-frame');img.alt='';img.src=frame;img.onerror=()=>img.remove();el.append(img);}
    return el;
  }
  function card(row,mode){
    const room=mode==='rooms',button=node('button','card lgs-card');button.type='button';
    const info=node('span','lgs-info');
    info.append(node('b','',room?row.name:row.nickname),node('small','','ID: '+row.public_id));
    const details=room?['Seviye '+row.level,row.member_count+' kişi',row.locked?'Şifreli':'Açık']:
      [row.online?'● Çevrim içi':'Çevrim dışı',row.vip_level?'VIP '+row.vip_level:'',row.nobility?.privileges?.includes('badge')?ranks[row.nobility.rank]:''];
    info.append(node('small',!room&&row.online?'lgs-online':'',details.filter(Boolean).join(' · ')));
    button.append(portrait(row,room),info,node('span','lgs-arrow','›'));
    button.onclick=()=>{if(room){window.openRoom?.(row.room_id,row.name);}else window.openUserProfile?.(row.user_id);};
    return button;
  }
  function clear(){
    generation++;controller?.abort();controller=null;next=null;query='';list.replaceChildren();more.hidden=true;
    status.textContent=kind==='rooms'?'Oda adı veya ID gir.':'Kullanıcı adı veya ID gir.';
  }
  async function run(append=false){
    const value=input.value.trim();if(!append){clear();query=value;}if(!query)return;
    if(!session()){status.textContent='Arama yapmak için giriş yap.';return;}
    if(!append&&query.length<2){status.textContent='En az 2 karakter gir.';return;}
    if(append&&next===null)return;
    controller?.abort();controller=new AbortController();
    const stamp=++generation,token=session(),mode=kind,offset=append?next:0;
    const params=new URLSearchParams({q:query,kind:mode,limit:'20',offset:String(offset)});
    status.textContent='Aranıyor…';more.hidden=true;
    try{
      const data=await window.ErisPlatform.api('/discover/search?'+params,{signal:controller.signal});
      if(stamp!==generation||token!==session())return;
      if(!Array.isArray(data.items))throw Error('Geçersiz arama yanıtı.');
      data.items.forEach(row=>list.append(card(row,mode)));
      next=data.has_more&&Number.isInteger(data.next_offset)?data.next_offset:null;more.hidden=next===null;
      status.textContent=list.children.length?list.children.length+' sonuç gösteriliyor.':'Eşleşme bulunamadı.';
    }catch(error){
      if(stamp!==generation||token!==session())return;
      status.textContent=error.message||'Arama yapılamadı. Tekrar dene.';more.hidden=!(append&&next!==null);
    }
  }
  form.addEventListener('submit',e=>{e.preventDefault();run();});input.addEventListener('input',clear);
  tabs.forEach(tab=>tab.addEventListener('click',()=>{kind=tab.dataset.lgsKind;tabs.forEach(t=>t.setAttribute('aria-pressed',String(t===tab)));clear();if(input.value.trim())run();}));
  more.addEventListener('click',()=>run(true));root.querySelector('[data-lgs-back]').onclick=()=>window.showView?.('explore');
  window.addEventListener('erischat:view-changed',e=>{if(e.detail?.id!=='search'){clear();input.value='';}});
  for(const event of ['erischat:auth','erischat:auth-state','erischat:auth-state-changed','erischat:auth-ready'])window.addEventListener(event,()=>{clear();input.value='';});
  window.ErisSearch={run:()=>run()};
})();
