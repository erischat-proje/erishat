(() => {
  'use strict';
  const api=(path,options)=>window.ErisPlatform.api('/relationship'+path,options);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const amount=n=>Number(n||0).toLocaleString('tr-TR');
  const asset=key=>key?.startsWith('level-')?'./relationship-assets/rewards/ring-'+key.split('-')[1]+'.png':'./relationship-assets/'+key+'.png';
  const rewardArt=name=>'./relationship-assets/rewards/'+name+'.png';
  const cosmetic=key=>key?(window.ErisChatCosmetics?.assetUrl?.(key)||key):'';
  const labels={brick:'Tuğla',wood:'Tahta',paint:'Boya',copper:'Bakır',silver:'Gümüş',gold:'Altın'};
  const coin=n=>'<span class="rel-money">'+amount(n)+'<img src="./lidya-coin.png" alt="Lidya"></span>';
  const post=(path,data)=>api(path,{method:'POST',...(data?{body:JSON.stringify(data)}:{})});
  const key=()=>crypto.randomUUID();
  const token=()=>localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token');
  const style=document.createElement('style');style.textContent=`
    body.rel-dialog-open{overflow:hidden}.rel-overlay{position:fixed;inset:0;z-index:11300;display:grid;place-items:center;padding:12px;background:#05020dbd;backdrop-filter:blur(12px);color:#fff}
    .rel-dialog{width:min(570px,100%);max-height:90dvh;display:flex;flex-direction:column;overflow:hidden;border:1px solid #bb96585e;border-radius:24px;background:radial-gradient(circle at 80% 0,#69338c36,transparent 50%),#100b19;box-shadow:0 25px 90px #000b}
    .rel-dialog header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px;border-bottom:1px solid #ffffff18}.rel-dialog h2{margin:0;font-size:19px;line-height:1.35}.rel-close{flex:none;width:40px;height:40px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff0b;color:white;font-size:24px}
    .rel-body{overflow:auto;padding:16px;overscroll-behavior:contain}.rel-body p{line-height:1.55}.rel-note{font-size:12px;color:#c7b6d6;line-height:1.5}.rel-error{color:#ffabc6;min-height:18px;font-size:12px;margin-top:10px}.rel-error:empty{display:none}
    .rel-body button:not(.rel-avatar):not(.rel-ring):not(.rel-hotspot):not(.rel-name){min-height:40px;border:1px solid #ffffff24;background:#ffffff0a;color:#fff;border-radius:12px;padding:9px 12px;font-weight:700;cursor:pointer}
    .rel-body button:disabled{opacity:.45;cursor:default!important}.rel-body .rel-primary{background:linear-gradient(130deg,#8350aa,#9b6250)!important;border-color:#d4ac6170!important}.rel-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.rel-actions>*{flex:1}
    .rel-body textarea,.rel-body input,.rel-body select{box-sizing:border-box;width:100%;padding:12px;border:1px solid #ffffff26;border-radius:12px;background:#0b0812;color:white;font:inherit;margin:9px 0;outline:none}.rel-body textarea{min-height:100px;resize:vertical}
    .rel-row{display:flex;gap:12px;align-items:center;padding:13px;border:1px solid #ffffff1b;border-radius:17px;margin:9px 0;background:#ffffff05}.rel-row-copy{flex:1;min-width:0}.rel-row-copy b{overflow-wrap:anywhere}.rel-row small{display:block;color:#cab9d7;font-size:11px;margin:5px 0}
    .rel-avatar{position:relative;display:grid;place-items:center;flex:none;width:50px;height:50px;border:0;padding:0;border-radius:50%;background:#352243;color:white;font-size:23px}.rel-avatar img:first-child{width:100%;height:100%;border-radius:50%;object-fit:cover}.rel-avatar .rel-frame{position:absolute;inset:-7%;width:114%!important;height:114%!important;object-fit:contain!important;border-radius:0!important;pointer-events:none}
    .rel-bar{height:7px;border-radius:99px;background:#ffffff12;overflow:hidden}.rel-bar i{display:block;height:100%;background:linear-gradient(90deg,#a568d6,#ee869e)}
    .rel-money{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums;color:#efcc85}.rel-money img{width:18px;height:18px;object-fit:contain}
    .rel-rings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.rel-ring-choice{padding:8px!important;display:grid;justify-items:center;gap:7px;min-width:0;font-size:11px}.rel-ring-choice>img{width:100%;height:90px;object-fit:contain}.rel-ring-preview{display:block;width:140px;height:140px;object-fit:contain;margin:5px auto}
    .rel-house{position:relative;width:100%;isolation:isolate;color:#ffe9ad}.rel-house-art{display:block;width:100%;height:auto;border-radius:17px}.rel-house .rel-avatar{position:absolute;width:20%;height:auto;aspect-ratio:1;transform:translate(-50%,-50%);background:#211434;box-shadow:0 0 20px #0008}
    .rel-house .rel-avatar{width:23.5%;top:29%;box-shadow:none;overflow:hidden}.rel-house .rel-male{left:24.9%}.rel-house .rel-female{left:75.1%}
    .rel-name{position:absolute;top:38.8%;width:25%;height:3.6%;border:0;border-radius:8px;background:#100b1eed;color:#ffe4a1;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;font-size:clamp(9px,2.4vw,15px)}.rel-male-name{left:12.5%}.rel-female-name{left:61.5%}
    .rel-ring{position:absolute;left:43%;top:24.5%;width:14%;height:12%;border:0;border-radius:50%;padding:4px;background:#140b1ce8;color:#f8d491;font-size:clamp(8px,2vw,13px);font-weight:800}.rel-ring img{width:100%;height:100%;object-fit:contain}
    .rel-days{position:absolute;left:70%;top:13.8%;width:24%;height:3.8%;display:grid;place-items:center;background:#100b1ef2;border-radius:10px;color:#ffd680;font-weight:900;font-size:clamp(10px,2.5vw,16px)}
    .rel-hotspot{position:absolute;top:76.5%;width:24%;height:19%;border:0;background:transparent;color:#ffdea1;border-radius:15px;padding:0;cursor:pointer}.rel-hotspot[data-material=brick]{left:13%}.rel-hotspot[data-material=wood]{left:38.5%}.rel-hotspot[data-material=paint]{left:64.5%}
    .rel-hotspot b{position:absolute;bottom:3%;left:10%;width:80%;height:25%;display:grid;place-items:center;background:#110b1bf5;border-radius:16px;font-size:clamp(16px,4.5vw,30px);font-weight:900}.rel-hotspot:focus-visible{outline:2px solid #ffdb86}
    .rel-public{position:relative;width:165px;height:46px;flex:none}.rel-public-status{width:100%;height:100%;border:0;padding:0;background:var(--rel-status) center/contain no-repeat;cursor:pointer}.rel-public .rel-public-ring{position:absolute;left:18%;top:24%;width:24px;height:24px;object-fit:contain;pointer-events:none}.rel-public .rel-avatar{position:absolute;right:9%;top:22%;width:27px;height:27px;font-size:12px}
    .eris-mini-topbar{flex-wrap:wrap}.eris-mini-topbar .rel-public{width:140px;height:40px}.eris-mini-topbar .rel-public .rel-avatar{width:23px;height:23px}.profile .name>.rel-public{margin:8px auto 0}
    @media(max-width:370px){.rel-body{padding:12px}.rel-rings{gap:6px}.rel-ring-choice>img{height:72px}.rel-row{gap:9px;padding:10px}}
    .rel-page{padding:0;background:#100b19;backdrop-filter:none}
    .rel-page>.rel-dialog{width:100%;height:100dvh;max-height:none;border:0;border-radius:0;box-shadow:none}
    .rel-page>.rel-dialog>header{flex:none;justify-content:flex-start;padding:calc(10px + env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));background:#170e23;position:relative;z-index:2}
    .rel-page h2{flex:1;font-size:18px}.rel-page .rel-back,.rel-house-menu-toggle{width:44px;height:44px;flex:none;display:grid;place-items:center;border:1px solid #d4ac6159;border-radius:13px;background:linear-gradient(145deg,#3b214c,#21142f);color:#ffe4a1;font-size:23px;cursor:pointer}
    .rel-page>.rel-dialog>.rel-body{flex:1;min-height:0;width:100%;box-sizing:border-box;padding:16px max(12px,env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
    .rel-page .rel-body>*{max-width:680px;margin-left:auto;margin-right:auto}.rel-page .rel-body>.rel-row{max-width:654px}
    .rel-page .rel-house-art{border-radius:0}.rel-house-menu-toggle[hidden],.rel-house-menu[hidden]{display:none!important}
    .rel-house-menu{position:absolute;left:68px;top:calc(64px + env(safe-area-inset-top));width:min(250px,calc(100vw - 80px));padding:8px;border:1px solid #d4ac6170;border-radius:15px;background:#21132f;box-shadow:0 12px 32px #0008}
    .rel-house-menu button{width:100%;min-height:44px;border:0;border-radius:10px;padding:10px;background:#8d3d553d;color:#ffd6dd;text-align:left;font-weight:700}
    .rel-house .rel-name{top:38.3%;height:2.7%;width:20%;padding:0 2px;background:transparent;border-radius:0;color:#ffe4a1;font-size:clamp(9px,2.7vw,18px);line-height:1.2;text-align:center}
    .rel-house .rel-male-name{left:17%}.rel-house .rel-female-name{left:66.5%}
    .rel-house .rel-art-button{position:absolute!important;padding:0!important;min-height:0!important;border:0!important;border-radius:0!important;background:transparent!important;display:grid;place-items:center;cursor:pointer}
    .rel-art-button img{width:100%;height:100%;object-fit:contain;pointer-events:none}.rel-room-button{left:9%;top:5%;width:20%;height:10%}.rel-rewards-button{left:6.5%;top:67.5%;width:14%;height:8%}.rel-gift-button{right:6.5%;top:67.5%;width:14%;height:8%}
    .rel-couple-gifts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.rel-couple-gifts button{display:grid;justify-items:center;min-width:0}.rel-couple-gifts button>img{width:100%;height:75px;object-fit:contain}.rel-title{width:85px;height:28px;object-fit:contain;vertical-align:middle}.rel-public{display:inline-block;vertical-align:middle;width:125px!important;height:36px!important}
  `;document.head.append(style);
  let stack=0,main=null,catalogData=null;
  const openDialogs=new Set();
  function dialog(title,content='',fullPage=false) {
    const trigger=document.activeElement,shade=document.createElement('div');shade.className='rel-overlay';shade.style.zIndex=String(11300+(++stack));
    shade.innerHTML='<section class="rel-dialog" role="dialog" aria-modal="true"><header><h2></h2><button type="button" class="rel-close" aria-label="Kapat">×</button></header><div class="rel-body">'+content+'</div></section>';
    shade.querySelector('h2').textContent=title;shade.querySelector('section').setAttribute('aria-label',title);
    if(fullPage){shade.classList.add('rel-page');const back=shade.querySelector('.rel-close');back.classList.add('rel-back');back.textContent='←';back.setAttribute('aria-label','Geri');shade.querySelector('header').prepend(back)}
    const close=()=>{shade._relLayoutObserver?.disconnect();shade.remove();openDialogs.delete(shade);if(!document.querySelector('.rel-overlay'))document.body.classList.remove('rel-dialog-open');if(trigger?.isConnected)trigger.focus();if(main?.shade===shade)main=null;if(shade.dataset.requestId)popupRequests.delete(shade.dataset.requestId)};
    shade.querySelector('.rel-close').onclick=close;shade.onclick=e=>{if(e.target===shade)close()};
    shade.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close()}else if(e.key==='Tab'){const nodes=[...shade.querySelectorAll('button:not(:disabled),input,textarea,select')].filter(el=>!el.closest('[hidden]')),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
    document.body.append(shade);openDialogs.add(shade);document.body.classList.add('rel-dialog-open');shade.querySelector('.rel-close').focus();
    return {shade,body:shade.querySelector('.rel-body'),close};
  }
  function errorBox(body){let el=body.querySelector('.rel-error');if(!el){el=document.createElement('p');el.className='rel-error';el.setAttribute('role','alert');body.append(el)}return el}
  async function action(button,body,fn){button.disabled=true;errorBox(body).textContent='';try{await fn()}catch(e){errorBox(body).textContent=typeof e.message==='string'?e.message:'İşlem tamamlanamadı.'}finally{if(button.isConnected)button.disabled=false}}
  function avatar(user,className='',withFrame=true){
    const b=document.createElement('button');b.type='button';b.className='rel-avatar '+className;b.setAttribute('aria-label',(user.nickname||'Kullanıcı')+' profilini aç');
    if(user.avatar_asset){const img=document.createElement('img');img.src=cosmetic(user.avatar_asset);img.alt='';b.append(img)}else b.textContent=user.avatar||'👤';
    if(withFrame&&user.frame_asset){const img=document.createElement('img');img.className='rel-frame';img.src=cosmetic(user.frame_asset);img.alt='';b.append(img)}
    b.onclick=()=>{if(main?.body.contains(b))main.close();window.ErisFloatingProfile?.open?.(user.id)};return b;
  }
  async function refreshMain(){
    if(!main||main.refreshing||!main.shade.isConnected)return;const current=main;current.refreshing=true;
    try{const state=current.houseId?{active:await api('/houses/'+encodeURIComponent(current.houseId)),requests:[]}:await api('/me');if(main!==current||!current.shade.isConnected)return;renderState(current,state)}catch(e){if(current.shade.isConnected)errorBox(current.body).textContent=e.message||'İlişki bilgileri yüklenemedi.'}finally{current.refreshing=false}
  }
  function open(houseId=null){if(main){if(main.houseId===houseId){main.shade.querySelector('.rel-close').focus();refreshMain();return}main.close()}main={...dialog(houseId?'Aile evi':'İlişki','<p class="rel-note">Yükleniyor…</p>',true),houseId};refreshMain()}
  function renderState(current,state){
    const body=current.body;current.renderTicket={};body.replaceChildren();
    current.shade._relLayoutObserver?.disconnect();
    current.shade.querySelector('.rel-house-menu-toggle')?.remove();current.shade.querySelector('.rel-house-menu')?.remove();
    if(state.active){renderHouse(current,state.active);return}
    const intro=document.createElement('p');intro.className='rel-note';intro.textContent=state.gender_required?'İlişki listesi için kayıt profilinizde kadın veya erkek cinsiyet bilgisi bulunmalıdır.':'DM üzerinden iletişim kurduğun karşı cinsteki kişiler. İki tarafın oda ve DM hediyeleri ortak 3.000 puanlık barı doldurur.';body.append(intro);
    renderRequests(body,state.requests||[]);
    if(!(state.candidates||[]).length){const empty=document.createElement('p');empty.className='rel-note';empty.textContent='Henüz uygun bir sohbet bulunmuyor.';body.append(empty)}
    for(const u of state.candidates||[]){const row=document.createElement('article');row.className='rel-row';row.append(avatar(u));const copy=document.createElement('div');copy.className='rel-row-copy';copy.innerHTML='<b>'+esc(u.nickname)+'</b><small>'+amount(u.points)+' / 3.000 puan</small><div class="rel-bar" role="progressbar" aria-label="Ortak ilişki puanı" aria-valuemin="0" aria-valuemax="3000" aria-valuenow="'+u.points+'"><i style="width:'+(u.points/30)+'%"></i></div>';row.append(copy);if(u.can_confess){const heart=document.createElement('button');heart.type='button';heart.className='rel-primary';heart.textContent='♥';heart.setAttribute('aria-label',u.nickname+' kişisine aşkını itiraf et');heart.onclick=()=>confess(u);row.append(heart)}body.append(row)}
  }
  function renderRequests(body,requests){
    for(const r of requests){const row=document.createElement('div');row.className='rel-row';const copy=document.createElement('div');copy.className='rel-row-copy';copy.innerHTML='<b>'+esc(r.peer.nickname)+'</b><small>'+(r.kind==='marriage'?'Evlilik teklifi':'İlişki itirafı')+' · '+(r.incoming?'Yanıtınız bekleniyor':'Yanıt bekleniyor')+'</small>';row.append(copy);if(r.incoming){const b=document.createElement('button');b.textContent='Yanıtla';b.onclick=()=>requestPopup({request_id:r.id,title:r.peer.nickname+(r.kind==='marriage'?' size evlilik teklif etti!':' size aşkını itiraf etti!'),message:r.message,ring:r.ring});row.append(b)}body.append(row)}
  }
  function confess(user){
    const modal=dialog('Karşı tarafa aşkınızı ilan edin','<form><label>Mesajınız<textarea required maxlength="500" placeholder="Duygularınızı yazın…"></textarea></label><button type="submit" class="rel-primary">İlişki İtirafı</button></form>');
    const form=modal.body.querySelector('form');form.onsubmit=e=>{e.preventDefault();const message=form.querySelector('textarea').value.trim();if(!message){errorBox(modal.body).textContent='Mesajınızı yazınız.';return}action(form.querySelector('button'),modal.body,async()=>{await post('/confessions',{target_id:user.id,message});modal.close();window.toast?.('İtirafınız gönderildi.');refreshMain();pollEvents()})};
  }
  function renderHouse(current,house){
    const body=current.body,own=!current.houseId||!!house.is_owner,ticket=current.renderTicket;
    if(own){
      const header=current.shade.querySelector('header'),toggle=document.createElement('button'),menu=document.createElement('div'),end=document.createElement('button');
      toggle.type='button';toggle.className='rel-house-menu-toggle';toggle.textContent='⋯';toggle.setAttribute('aria-label','İlişki seçenekleri');toggle.setAttribute('aria-expanded','false');
      menu.className='rel-house-menu';menu.hidden=true;end.type='button';end.textContent='İlişkiyi sonlandır';menu.append(end);current.shade.querySelector('.rel-back').after(toggle);header.append(menu);
      const hideMenu=()=>{menu.hidden=true;toggle.setAttribute('aria-expanded','false')};toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)end.focus()};
      current.shade.onclick=e=>{if(!menu.contains(e.target)&&e.target!==toggle)hideMenu()};menu.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();hideMenu();toggle.focus()}};
      end.onclick=()=>{hideMenu();const modal=dialog('İlişkiyi sonlandır','<p>İlişki ve ortak aile evi kapanacak. İlişkiyi sonlandırmak istiyor musunuz?</p><div class="rel-actions"><button type="button" class="rel-primary" data-end>Sonlandır</button><button type="button" data-cancel>İptal</button></div>');modal.body.querySelector('[data-cancel]').onclick=modal.close;modal.body.querySelector('[data-end]').onclick=e=>action(e.currentTarget,modal.body,async()=>{await post('/end');modal.close();if(main===current){current.houseId=null;current.shade.querySelector('h2').textContent='İlişki'}refreshMain();window.dispatchEvent(new Event('erischat:cosmetics-updated'))})};
      if(!house.married){const actions=document.createElement('div');actions.className='rel-actions';const b=document.createElement('button');b.textContent='♥ Evlilik teklif et';b.className='rel-primary';b.onclick=()=>marriage(house);actions.append(b);body.append(actions)}
    }
    const art=document.createElement('div');art.className='rel-house';art.innerHTML='<img class="rel-house-art" src="'+asset('house-'+house.level)+'" alt="Seviye '+house.level+' aile evi"><span class="rel-days">'+amount(house.days)+' gün</span>';
    art.append(avatar(house.male,'rel-male',false),avatar(house.female,'rel-female',false));
    for(const [person,cls] of [[house.male,'rel-male-name'],[house.female,'rel-female-name']]){const name=document.createElement('button');name.type='button';name.className='rel-name '+cls;name.textContent=person.nickname;name.title=person.nickname;name.setAttribute('aria-label',person.nickname+' profilini aç');name.onclick=()=>{current.close();window.ErisFloatingProfile?.open?.(person.id)};art.append(name)}
    const fitNames=()=>{if(!art.isConnected)return;for(const name of art.querySelectorAll('.rel-name')){name.style.removeProperty('font-size');if(!name.clientWidth)continue;let size=parseFloat(getComputedStyle(name).fontSize);while(name.scrollWidth>name.clientWidth&&size>7){size-=.5;name.style.fontSize=size+'px'}}};
    art.querySelector('.rel-house-art').addEventListener('load',fitNames);setTimeout(fitNames,0);
    if(typeof ResizeObserver!=='undefined'){current.shade._relLayoutObserver=new ResizeObserver(fitNames);current.shade._relLayoutObserver.observe(art)}
    const ring=document.createElement('button');ring.type='button';ring.className='rel-ring';ring.setAttribute('aria-label',house.ring?'Yüzüğü değiştir':'Yüzük satın al');if(house.ring)ring.innerHTML='<img src="'+asset(house.ring)+'" alt="Çiftin yüzüğü">';else ring.textContent='Yüzük satın al';ring.disabled=!own;ring.onclick=()=>rings(house);art.append(ring);
    for(const m of ['brick','wood','paint']){const b=document.createElement('button');b.type='button';b.className='rel-hotspot';b.dataset.material=m;b.setAttribute('aria-label',labels[m]+' · '+house.remaining[m]+' adet kaldı');b.innerHTML='<b>'+amount(house.remaining[m])+'</b>';b.disabled=own&&house.max_level;b.onclick=()=>materials(house,m,!own);art.append(b)}body.append(art);
    const imageButton=(name,cls,label,handler)=>{const b=document.createElement('button');b.type='button';b.className='rel-art-button '+cls;b.setAttribute('aria-label',label);const img=document.createElement('img');img.src=rewardArt(name);img.alt=label;b.append(img);b.onclick=handler;art.append(b)};
    imageButton('room-button','rel-room-button','Çift odasını aç',async()=>{try{const room=await post('/houses/'+encodeURIComponent(house.id)+'/room');current.close();await window.openRoom?.(room.room_id,room.name)}catch(e){errorBox(body).textContent=e.message}});
    imageButton('rewards-button','rel-rewards-button','İlişki ödülleri',()=>showRewards(house));
    imageButton('gift-button','rel-gift-button','Çifte hediye gönder',()=>coupleGifts(house));
    const note=document.createElement('p');note.className='rel-note';note.textContent=house.max_level?'En yüksek ev seviyesine ulaştınız.':'Seviye '+(house.level+1)+' için görseldeki kalan ihtiyaçları tamamlayın. Malzemelerin her biri 750 Lidya. '+(house.needs_first_copper?'İlk geçiş için 1 adet bakır yüzük gerekir.':'');body.append(note);
    if(!own){const donate=document.createElement('div');donate.className='rel-actions';for(const m of ['brick','wood','paint']){const b=document.createElement('button');b.textContent=labels[m]+' katkısı';b.onclick=()=>materials(house,m,true);donate.append(b)}body.append(donate)}
    const stock=document.createElement('p');stock.className='rel-note';stock.textContent='Ortak depo: '+Object.entries(house.materials).map(([m,n])=>labels[m]+' '+amount(n)).join(' · ');body.append(stock);
    if(own)api('/me').then(s=>{if(main===current&&body.isConnected&&current.renderTicket===ticket)renderRequests(body,s.requests||[])}).catch(()=>{});
  }
  async function showRewards(house=null,collection=false){
    const modal=dialog(collection?'İlişki koleksiyonum':'İlişki ödülleri','<p>Yükleniyor…</p>');
    try{const data=await api('/rewards');if(!modal.shade.isConnected)return;modal.body.replaceChildren();
      for(const r of data.items){if(collection&&!r.owned)continue;const row=document.createElement('article');row.className='rel-row';
        const logo=document.createElement('img');logo.src=cosmetic(r.logo);logo.alt='Seviye '+r.level;logo.style.cssText='width:50px;height:50px;object-fit:contain';
        const image=document.createElement('img');image.src=cosmetic(r.asset);image.alt=r.name;image.style.cssText='width:76px;height:60px;object-fit:contain';
        const copy=document.createElement('div');copy.className='rel-row-copy';copy.innerHTML='<b>'+esc(r.name)+'</b><small>Seviye '+r.level+' · '+(r.unlocked?'Kazanıldı':'Kilitli')+'</small>';
        row.append(logo,image,copy);if(r.owned&&r.type!=='ring'){const b=document.createElement('button');b.type='button';b.textContent=r.equipped?'Çıkar':'Uygula';b.onclick=()=>action(b,modal.body,async()=>{await post('/rewards/equip',{kind:r.type,asset_key:r.equipped?null:r.asset_key});r.equipped=!r.equipped;b.textContent=r.equipped?'Çıkar':'Uygula';modal.close();showRewards(house,collection);window.ErisChatCosmetics?.load?.();window.ErisProfile?.refresh?.();window.dispatchEvent(new Event('erischat:cosmetics-updated'));refreshMain()});row.append(b)}modal.body.append(row)}
      if(!modal.body.children.length)modal.body.textContent='Aktif ilişkinizde henüz ödül yok.';
    }catch(e){errorBox(modal.body).textContent=e.message}
  }
  async function coupleGifts(house){
    const modal=dialog('Çifte hediye gönder','<p>Hediyeler yükleniyor…</p>');
    try{const data=await window.ErisPlatform.api('/message-gifts');if(!modal.shade.isConnected)return;modal.body.innerHTML='<p class="rel-note">Hediye ortak hesaba sayılır. 30 Lidya üzerindeki hediyede üçte bir kesilir; kalan tutarın rastgele %1–100’ü iki partnere eşit dağıtılır.</p><label>Adet<input type="number" min="1" max="1000" step="1" value="1" data-quantity></label><div class="rel-couple-gifts"></div>';
      const grid=modal.body.querySelector('.rel-couple-gifts');for(const gift of (Array.isArray(data)?data:data.items||[])){const b=document.createElement('button');b.type='button';const name=gift.gift_key||gift.name;b.innerHTML='<img src="'+esc(gift.image_url)+'" alt="'+esc(name)+'">'+coin(gift.unit_price||gift.price);let requestKey=null,requestQuantity=null;
        b.onclick=()=>action(b,modal.body,async()=>{const quantity=Number(modal.body.querySelector('[data-quantity]').value);if(!Number.isInteger(quantity)||quantity<1||quantity>1000)throw new Error('1–1000 arası adet giriniz.');if(quantity!==requestQuantity){requestKey=key();requestQuantity=quantity}const r=await post('/houses/'+encodeURIComponent(house.id)+'/gifts',{gift_key:name,quantity,request_key:requestKey});requestKey=null;requestQuantity=null;window.toast?.('Çiftin her partnerine '+amount(r.each_amount)+' Lidya aktarıldı.');window.ErisProfile?.refresh?.()});grid.append(b)}
    }catch(e){errorBox(modal.body).textContent=e.message}
  }
  async function getCatalog(){if(!catalogData)catalogData=await api('/catalog');return catalogData}
  function rings(house,onSelect=null){
    const modal=dialog(onSelect?'Evlilik teklifiniz için yüzük seçiniz':'Yüzük satın al','<div class="rel-actions" data-categories></div><div class="rel-rings"></div>');
    getCatalog().then(data=>{
      if(!modal.shade.isConnected)return;const categories=onSelect?['gold']:['owned','level','copper','silver','gold'];
      const draw=metal=>{const grid=modal.body.querySelector('.rel-rings');grid.replaceChildren();if(metal==='owned'||metal==='level'){for(const r of (house.owned_rings||[]).filter(r=>metal==='level'?r.source==='level':r.source==='purchased')){const b=document.createElement('button');b.type='button';b.className='rel-ring-choice';b.innerHTML='<img src="'+esc(r.asset)+'" alt="Yüzük">'+(house.ring===r.key?'Takılı':'Tak');b.onclick=()=>action(b,modal.body,async()=>{await post('/ring/equip',{ring:r.key});modal.close();refreshMain();window.ErisProfile?.refresh?.();window.dispatchEvent(new Event('erischat:cosmetics-updated'))});grid.append(b)}if(!grid.children.length)grid.textContent='Bu kategoride henüz yüzük yok.';return;}for(const r of data.rings.filter(r=>r.category===metal)){const b=document.createElement('button');b.type='button';b.className='rel-ring-choice';b.innerHTML='<img src="'+esc(r.asset)+'" alt="'+labels[metal]+' yüzük '+r.key.split('-')[1]+'">'+coin(r.price);b.disabled=!onSelect&&house.needs_first_copper&&metal==='silver';b.onclick=()=>{if(onSelect){modal.close();onSelect({...r,price:(house.owned_rings||[]).some(x=>x.key===r.key)?0:r.price});return}confirmRing(house,r,modal)};grid.append(b)}};
      for(const metal of categories){const b=document.createElement('button');b.type='button';b.innerHTML='<img src="'+asset((metal==='owned'||metal==='level'?'copper':metal)+'-1')+'" alt="" style="width:28px;height:28px;object-fit:contain;vertical-align:middle;margin-right:6px">'+({owned:'Satın alınanlar',level:'Seviye bağlı yüzükler'}[metal]||labels[metal]);b.onclick=()=>draw(metal);modal.body.querySelector('[data-categories]').append(b)}draw(categories[0]);
      if(!onSelect&&house.needs_first_copper){const p=document.createElement('p');p.className='rel-note';p.textContent='İlk yüzük bakır olmalıdır; sonrasında gümüş veya farklı bakır yüzük seçebilirsiniz.';modal.body.append(p)}
    }).catch(e=>{errorBox(modal.body).textContent=e.message});
  }
  function confirmRing(house,ring,parent){
    const modal=dialog('Bu yüzüğü satın almak istiyor musunuz?','<img class="rel-ring-preview" src="'+esc(ring.asset)+'" alt="Seçilen yüzük"><p style="text-align:center">'+coin(ring.price)+' ödemelisiniz.</p><button class="rel-primary" type="button">Satın al</button>');
    const request_key=key();modal.body.querySelector('button').onclick=e=>action(e.currentTarget,modal.body,async()=>{await post('/ring',{item:ring.key,request_key});modal.close();parent.close();refreshMain();window.ErisProfile?.refresh?.();window.dispatchEvent(new Event('erischat:cosmetics-updated'))});
  }
  function materials(house,material,donation){
    const modal=dialog(labels[material]+(donation?' katkısı':' satın al'),'<img class="rel-ring-preview" src="'+asset(material)+'" alt="'+labels[material]+'"><p class="rel-note">'+labels[material]+' satın almak için adet girin. Adet fiyatı '+coin(750)+'.</p><form><input type="number" name="quantity" min="1" max="1000000" step="1" value="1" required aria-label="Malzeme adedi"><p data-total>'+coin(750)+'</p><button class="rel-primary" type="submit">'+(donation?'Katkıda bulun':'Satın al')+'</button></form>');
    const form=modal.body.querySelector('form'),input=form.querySelector('input'),request_key=key();
    input.oninput=()=>{const n=Number(input.value);form.querySelector('[data-total]').innerHTML=Number.isInteger(n)&&n>0?coin(n*750):'Geçerli bir adet girin.'};
    form.onsubmit=e=>{e.preventDefault();const quantity=Number(input.value);if(!Number.isInteger(quantity)||quantity<1||quantity>1000000){errorBox(modal.body).textContent='1 ile 1.000.000 arasında tam sayı giriniz.';return}action(form.querySelector('button'),modal.body,async()=>{await post(donation?'/houses/'+encodeURIComponent(house.id)+'/donate':'/materials',{item:material,quantity,request_key});modal.close();refreshMain();window.ErisProfile?.refresh?.();window.toast?.(donation?'Çiftin aile evine katkınız gönderildi.':'Ortak malzemeler güncellendi.');window.dispatchEvent(new Event('erischat:cosmetics-updated'))})};
  }
  function marriage(house){
    const modal=dialog('Evlilik mesajınızı yazınız','<form><textarea maxlength="500" required placeholder="Evlilik mesajınız…" aria-label="Evlilik mesajı"></textarea><button type="button" data-ring>Evlilik teklifiniz için yüzük seçiniz</button><div data-preview></div><button type="submit" class="rel-primary" disabled>Teklifi gönder</button></form>');
    const form=modal.body.querySelector('form');let selected=null;
    form.querySelector('[data-ring]').onclick=()=>rings(house,ring=>{selected=ring;form.querySelector('[data-preview]').innerHTML='<img class="rel-ring-preview" src="'+esc(ring.asset)+'" alt="Evlilik yüzüğü"><p style="text-align:center">'+coin(ring.price)+'</p>';form.querySelector('[type=submit]').disabled=false});
    form.onsubmit=e=>{e.preventDefault();const message=form.querySelector('textarea').value.trim();if(!selected||!message){errorBox(modal.body).textContent='Mesaj yazıp bir yüzük seçiniz.';return}const confirm=dialog('Bu yüzüğü satın almak istiyor musunuz?','<img class="rel-ring-preview" src="'+esc(selected.asset)+'" alt="Seçilen yüzük"><p>'+coin(selected.price)+' ödemelisiniz. Onaylayınca yüzük satın alınır ve evlilik teklifi gönderilir.</p><button type="button" class="rel-primary">Satın al ve teklif et</button>');const request_key=key();confirm.body.querySelector('button').onclick=e=>action(e.currentTarget,confirm.body,async()=>{await post('/marriage',{ring:selected.key,message,request_key});confirm.close();modal.close();refreshMain();window.ErisProfile?.refresh?.();window.toast?.('Evlilik teklifiniz gönderildi.')})};
  }
  const popupRequests=new Set(),seenEvents=new Set();let polling=false;
  function requestPopup(event){
    if(popupRequests.has(event.request_id))return;popupRequests.add(event.request_id);
    const modal=dialog(event.title,(event.ring?'<img class="rel-ring-preview" src="'+asset(event.ring)+'" alt="Evlilik yüzüğü">':'')+'<p data-message></p><div class="rel-actions"><button type="button" class="rel-primary" data-accept>Kabul Et</button><button type="button" data-reject>Reddet</button></div>');modal.body.querySelector('[data-message]').textContent=event.message||'';modal.shade.dataset.requestId=event.request_id;modal.shade.classList.add('rel-notice');
    for(const decision of ['accept','reject'])modal.body.querySelector('[data-'+decision+']').onclick=e=>action(e.currentTarget,modal.body,async()=>{modal.body.querySelectorAll('.rel-actions button').forEach(b=>b.disabled=true);try{await post('/requests/'+encodeURIComponent(event.request_id)+'/respond',{action:decision});if(event.id)await post('/events/'+event.id+'/ack');modal.close();refreshMain();window.dispatchEvent(new Event('erischat:cosmetics-updated'));pollEvents()}finally{modal.body.querySelectorAll('.rel-actions button').forEach(b=>b.disabled=false)}});
  }
  async function pollEvents(){
    if(polling||!token()||!window.ErisPlatform?.api||document.hidden||document.querySelector('.rel-notice'))return;polling=true;const sessionToken=token();
    try{const rows=await api('/events');if(token()!==sessionToken)return;for(const event of rows){if(seenEvents.has(event.id))continue;seenEvents.add(event.id);if(event.kind==='request'){requestPopup(event);await post('/events/'+event.id+'/ack');break}const modal=dialog(event.title,'<p data-message></p>');modal.shade.classList.add('rel-notice');modal.body.querySelector('[data-message]').textContent=event.message||'';if(event.kind==='donation'){const b=document.createElement('button');b.type='button';b.className='rel-primary';b.textContent='Teşekkür et';b.onclick=()=>action(b,modal.body,async()=>{await post('/donations/'+encodeURIComponent(event.operation_id)+'/thank');await post('/events/'+event.id+'/ack');modal.close();window.toast?.('Teşekkürünüz gönderildi.')});modal.body.append(b)}await post('/events/'+event.id+'/ack');if(['welcome','upgrade','result','ended'].includes(event.kind)){refreshMain();window.dispatchEvent(new Event('erischat:cosmetics-updated'))}break}}catch(_){}finally{polling=false}
  }
  function decorate(root,relationship){
    const old=root.querySelector('.rel-public');if(!relationship){old?.remove();root.querySelector('.rel-title')?.remove();return}
    root.querySelector('.rel-title')?.remove();if(relationship.title_asset){const title=document.createElement('img');title.className='rel-title';title.src=cosmetic(relationship.title_asset);title.alt='İlişki ünvanı';(root.querySelector('.name')||root).append(title)}
    const slot=old||document.createElement('div');slot.className='rel-public';slot.style.setProperty('--rel-status',`url("${asset(relationship.status)}")`);slot.replaceChildren();
    const b=document.createElement('button');b.type='button';b.className='rel-public-status';b.setAttribute('aria-label',relationship.partner.nickname+' ile ilişki · aile evini aç');b.onclick=()=>open(relationship.id);if(relationship.ring){const ring=document.createElement('img');ring.className='rel-public-ring';ring.src=asset(relationship.ring);ring.alt='';b.append(ring)}slot.append(b,avatar(relationship.partner));
    if(!old){const fan=root.querySelector('[data-fans]');if(fan)fan.before(slot);else (root.querySelector('.name')||root).append(slot)}const title=root.querySelector('.rel-title');if(title)slot.after(title);
  }
  function boot(){const tabs=document.querySelector('#ephTabs');if(!tabs)return;if(!tabs.querySelector('[data-tab=relationship]')){const b=document.createElement('button');b.type='button';b.dataset.tab='relationship';b.innerHTML='<span class="eph-icon" aria-hidden="true" style="font-size:25px;line-height:24px">♥</span><span>İlişki</span>';b.onclick=()=>open();tabs.append(b)}}
  window.ErisRelationship={open,decorate,showRewards,coupleGifts};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot();pollEvents()},{once:true});else{boot();pollEvents()}
  window.addEventListener('erischat:auth',e=>{if(e.detail?.state==='ready'){boot();pollEvents()}else if(['logged_out','login_required'].includes(e.detail?.state)){for(const s of openDialogs){s._relLayoutObserver?.disconnect();s.remove()}openDialogs.clear();document.body.classList.remove('rel-dialog-open');main=null;seenEvents.clear();popupRequests.clear()}});
  window.addEventListener('erischat:event',pollEvents);window.addEventListener('erischat:room-gift',refreshMain);window.addEventListener('erischat:gift-updated',refreshMain);
  document.addEventListener('visibilitychange',()=>{pollEvents();refreshMain()});setInterval(()=>{pollEvents();refreshMain()},6000);
})();
