(() => {
  'use strict';
  const api=(path,options)=>window.ErisPlatform.api('/relationship'+path,options);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const amount=n=>Number(n||0).toLocaleString('tr-TR');
  const ringUrl=value=>window.ErisRingArt?.url(value)||value;
  const asset=key=>ringUrl(key?.startsWith('level-')?'./relationship-assets/rewards/ring-'+key.split('-')[1]+'.png':'./relationship-assets/'+key+'.png');
  const modernArt=name=>'./relationship-assets/modern/'+name+'.png?v=rel-modern-20261010';
  const materialArt=m=>'<img class="rel-material-preview" src="'+modernArt('material-'+m)+'" alt="'+labels[m]+'">';
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
    .rel-house .rel-avatar{width:23.5%;top:29%;box-shadow:none;overflow:visible}.rel-house .rel-male{left:24.9%}.rel-house .rel-female{left:75.1%}
    .rel-name{position:absolute;top:38.8%;width:25%;height:3.6%;border:0;border-radius:8px;background:#100b1eed;color:#ffe4a1;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;font-size:clamp(9px,2.4vw,15px)}.rel-male-name{left:12.5%}.rel-female-name{left:61.5%}
    .rel-ring{position:absolute;left:43%;top:24.5%;width:14%;height:12%;border:0;border-radius:50%;padding:4px;background:#140b1ce8;color:#f8d491;font-size:clamp(8px,2vw,13px);font-weight:800}.rel-ring img{width:100%;height:100%;object-fit:contain}
    .rel-days{position:absolute;left:70.5%;top:13.5%;width:24%;height:2.7%;display:grid;place-items:center;background:#100b1ef2;border-radius:10px;color:#ffd680;font-weight:900;font-size:clamp(8px,2.1vw,14px);line-height:1;overflow:hidden}
    .rel-hotspot{position:absolute;top:76.5%;width:24%;height:19%;border:0;background:transparent;color:#ffdea1;border-radius:15px;padding:0;cursor:pointer}.rel-hotspot[data-material=brick]{left:13%}.rel-hotspot[data-material=wood]{left:38.5%}.rel-hotspot[data-material=paint]{left:64.5%}
    .rel-hotspot b{position:absolute;bottom:0;left:5%;width:90%;height:31%;display:grid;place-items:center;background:#110b1bf5;border-radius:16px;font-size:clamp(16px,4.5vw,30px);font-weight:900}.rel-hotspot:focus-visible{outline:2px solid #ffdb86}
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
    .rel-gift-quantities{display:flex;gap:6px;margin:12px 0;flex-wrap:wrap}.rel-gift-quantities button{flex:1;padding:9px 6px}.rel-gift-quantities button.selected{border-color:#ffe0a0;background:#795735}.rel-gift-card{position:relative;min-width:0;border:1px solid #ffffff16;border-radius:14px;padding:4px}.rel-gift-card.selected{border-color:#ffe0a0;background:#d8ae4b16}.rel-gift-card.unaffordable{opacity:.35}.rel-gift-card .rel-gift-pick{width:100%;border:0;background:transparent;padding:4px;font-size:10px}.rel-gift-card .rel-gift-send{width:100%;background:linear-gradient(135deg,#efcf8b,#9e673b);color:#180e20;font-size:10px;font-weight:800;margin-bottom:4px}.rel-gift-send[hidden]{display:none!important}.rel-gift-balance{font-size:11px;color:#e8cf9f}
    .rel-couple-gifts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.rel-couple-gifts button{display:grid;justify-items:center;min-width:0}.rel-couple-gifts button>img{width:100%;height:75px;object-fit:contain}.rel-title{width:85px;height:28px;object-fit:contain;vertical-align:middle}.rel-public{display:inline-block;vertical-align:middle;width:125px!important;height:36px!important}
  `;document.head.append(style);
  let stack=0,main=null,catalogData=null;
  const openDialogs=new Set();
  function dialog(title,content='',fullPage=false) {
    const trigger=document.activeElement,shade=document.createElement('div');shade.className='rel-overlay';shade.style.zIndex=String(11300+(++stack));
    shade.innerHTML='<section class="rel-dialog" role="dialog" aria-modal="true"><header><h2></h2><button type="button" class="rel-close" aria-label="Kapat">×</button></header><div class="rel-body">'+content+'</div></section>';
    shade.querySelector('h2').textContent=title;shade.querySelector('section').setAttribute('aria-label',title);
    if(fullPage){shade.classList.add('rel-page');const back=shade.querySelector('.rel-close');back.classList.add('rel-back');back.textContent='×';back.setAttribute('aria-label','Kapat')}
    const close=()=>{shade._relLayoutObserver?.disconnect();shade.remove();openDialogs.delete(shade);if(!document.querySelector('.rel-overlay'))document.body.classList.remove('rel-dialog-open');if(trigger?.isConnected)trigger.focus();if(main?.shade===shade)main=null;if(shade.dataset.requestId)popupRequests.delete(shade.dataset.requestId)};
    shade.querySelector('.rel-close').onclick=close;shade.onclick=e=>{if(e.target===shade)close()};
    shade.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close()}else if(e.key==='Tab'){const nodes=[...shade.querySelectorAll('button:not(:disabled),input,textarea,select')].filter(el=>!el.closest('[hidden]')),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
    document.body.append(shade);openDialogs.add(shade);document.body.classList.add('rel-dialog-open');shade.querySelector('.rel-close').focus();
    return {shade,body:shade.querySelector('.rel-body'),close};
  }
  function errorBox(body){let el=body.querySelector('.rel-error');if(!el){el=document.createElement('p');el.className='rel-error';el.setAttribute('role','alert');body.append(el)}return el}
  async function action(button,body,fn){if(button.disabled)return;button.disabled=true;errorBox(body).textContent='';try{await fn()}catch(e){errorBox(body).textContent=typeof e.message==='string'?e.message:'İşlem tamamlanamadı.'}finally{if(button.isConnected)button.disabled=false}}
  function avatar(user,className='',withFrame=true){
    const b=document.createElement('button');b.type='button';b.className='rel-avatar '+className;b.setAttribute('aria-label',(user.nickname||'Kullanıcı')+' profilini aç');
    if(user.avatar_asset){const img=document.createElement('img');img.src=cosmetic(user.avatar_asset);img.alt='';b.append(img)}else b.textContent=user.avatar||'👤';
    if(withFrame&&user.frame_asset){const img=document.createElement('img');img.className='rel-frame';img.src=cosmetic(user.frame_asset);img.alt='';b.append(img)}
    b.onclick=()=>{if(main?.body.contains(b))main.close();window.ErisFloatingProfile?.open?.(user.id)};return b;
  }
  async function refreshMain(){
    if(!main||main.refreshing||!main.shade.isConnected)return;const current=main,scrollTop=current.body.scrollTop;current.refreshing=true;
    try{const state=current.houseId?{active:await api('/houses/'+encodeURIComponent(current.houseId)),requests:[]}:await api('/me');if(main!==current||!current.shade.isConnected)return;renderState(current,state);current.body.scrollTop=scrollTop}catch(e){if(current.shade.isConnected)errorBox(current.body).textContent=e.message||'İlişki bilgileri yüklenemedi.'}finally{current.refreshing=false}
  }
  function open(houseId=null){if(main){if(main.houseId===houseId){main.shade.querySelector('.rel-close').focus();refreshMain();return}main.close()}main={...dialog(houseId?'Aile evi':'İlişki','<p class="rel-note">Yükleniyor…</p>',true),houseId};refreshMain()}
  function renderState(current,state){
    const body=current.body;current.renderTicket={};body.replaceChildren();
    current.shade._relLayoutObserver?.disconnect();
    current.shade.querySelector('.rel-house-menu-toggle')?.remove();current.shade.querySelector('.rel-house-menu')?.remove();
    if(state.active){renderHouse(current,state.active);return}
    const welcome=document.createElement('section');welcome.className='rel-welcome';welcome.innerHTML='<img src="'+modernArt('level-1')+'" alt=""><small>ERISCHAT · BİRLİKTE</small><h3>Bir hikâye burada başlar.</h3>';body.append(welcome);const intro=document.createElement('p');intro.className='rel-note';intro.textContent=state.gender_required?'İlişki listesi için kayıt profilinizde kadın veya erkek cinsiyet bilgisi bulunmalıdır.':'DM üzerinden iletişim kurduğun karşı cinsteki kişiler. İki tarafın oda ve DM hediyeleri ortak 3.000 puanlık barı doldurur.';body.append(intro);
    renderRequests(body,state.requests||[]);
    if(!(state.candidates||[]).length){const empty=document.createElement('p');empty.className='rel-note';empty.textContent='Henüz uygun bir sohbet bulunmuyor.';body.append(empty)}
    for(const u of state.candidates||[]){const row=document.createElement('article');row.className='rel-row';row.append(avatar(u));const copy=document.createElement('div');copy.className='rel-row-copy';copy.innerHTML='<b>'+esc(u.nickname)+'</b><small>'+amount(u.points)+' / 3.000 puan</small><div class="rel-bar" role="progressbar" aria-label="Ortak ilişki puanı" aria-valuemin="0" aria-valuemax="3000" aria-valuenow="'+u.points+'"><i style="width:'+(Math.max(0,Math.min(100,u.points/30)))+'%"></i></div>';window.ErisRoleBadges?.bind(copy.querySelector('b'),u);row.append(copy);if(u.can_confess){const heart=document.createElement('button');heart.type='button';heart.className='rel-primary';heart.textContent='♥';heart.setAttribute('aria-label',u.nickname+' kişisine aşkını itiraf et');heart.onclick=()=>confess(u);row.append(heart)}body.append(row)}
  }
  function renderRequests(body,requests){
    for(const r of requests){const row=document.createElement('div');row.className='rel-row';const copy=document.createElement('div');copy.className='rel-row-copy';copy.innerHTML='<b>'+esc(r.peer.nickname)+'</b><small>'+(r.kind==='marriage'?'Evlilik teklifi':'İlişki itirafı')+' · '+(r.incoming?'Yanıtınız bekleniyor':'Yanıt bekleniyor')+'</small>';window.ErisRoleBadges?.bind(copy.querySelector('b'),r.peer);row.append(copy);if(r.incoming){const b=document.createElement('button');b.textContent='Yanıtla';b.onclick=()=>requestPopup({request_id:r.id,title:r.peer.nickname+(r.kind==='marriage'?' size evlilik teklif etti!':' size aşkını itiraf etti!'),message:r.message,ring:r.ring});row.append(b)}body.append(row)}
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
      if(!house.married){const b=document.createElement('button');b.type='button';b.textContent='♥ Evlilik teklif et';b.disabled=house.level<4;b.title=house.level<4?'Aile evi seviye 4 gerekli':'';b.onclick=()=>{hideMenu();marriage(house)};menu.prepend(b)}
    }
    const level=Math.max(1,Math.min(12,Number(house.level)||1));
    const home=document.createElement('div');home.className='rel-home-dashboard';home.dataset.level=level;
    home.innerHTML='<section class="rel-home-hero"><div class="rel-home-heading"><div><small>BİRLİKTE BÜYÜYEN HİKÂYENİZ</small><h3>'+esc(house.married?'Evlilik evimiz':'Aile evimiz')+'</h3></div><span class="rel-day-chip">'+amount(house.days)+' gün</span></div><div class="rel-partners"></div><div class="rel-home-art"><img src="'+modernArt('house-'+level)+'" alt="Seviye '+level+' aile evi"><div class="rel-level-badge"><img src="'+modernArt('level-'+level)+'" alt=""><span>Seviye '+level+' / 12</span></div></div><div class="rel-home-controls"></div></section><section class="rel-growth"><div class="rel-section-head"><h3>'+(house.max_level?'Zirveye ulaştınız':'Bir sonraki adım')+'</h3><span>'+(house.max_level?'Seviye 12':'Seviye '+(level+1))+'</span></div><p class="rel-note">'+(house.max_level?'Ortak emeğinizle aile evinizin en yüksek seviyesine ulaştınız.':'Eksik malzemeleri tamamlayın; eviniz birlikte gelişsin.')+'</p><div class="rel-material-grid"></div><p class="rel-stock"></p></section><section class="rel-journey"><div class="rel-section-head"><h3>Seviye yolculuğunuz</h3><span>12 aşama</span></div><div class="rel-level-grid"></div></section>';
    for(const person of [house.male,house.female]){const card=document.createElement('div');card.className='rel-partner';card.append(avatar(person));const name=document.createElement('button');name.type='button';name.className='rel-partner-name';name.textContent=person.nickname;name.setAttribute('aria-label',person.nickname+' profilini aç');name.onclick=()=>{current.close();window.ErisFloatingProfile?.open?.(person.id)};window.ErisRoleBadges?.bind(name,person);card.append(name);home.querySelector('.rel-partners').append(card)}
    const controls=home.querySelector('.rel-home-controls');
    const button=(text,handler,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=handler;b.disabled=disabled;controls.append(b);return b};
    button('Çift odası',async e=>{await action(e.currentTarget,body,async()=>{const room=await post('/houses/'+encodeURIComponent(house.id)+'/room');if(typeof window.openRoom!=='function')throw new Error('Oda ekranı yüklenemedi. Sayfayı yenileyin.');current.close();await window.openRoom(room.room_id,room.name)})});
    button('Ödüller',()=>showRewards(house));button('Hediye gönder',()=>coupleGifts(house));
    const ring=button(house.ring?'Yüzüğümüz':'Yüzük seç',()=>rings(house),!own);ring.className='rel-home-ring';if(house.ring){const im=document.createElement('img');im.src=asset(house.ring);im.alt='';ring.prepend(im)}
    for(const m of ['brick','wood','paint']){const remaining=Math.max(0,Number(house.remaining?.[m])||0),need=Math.max(0,Number(house.requirements?.[m])||0),progress=house.max_level?100:need?Math.max(0,Math.min(100,(need-remaining)/need*100)):0;const b=document.createElement('button');b.type='button';b.className='rel-material-card';b.dataset.material=m;b.innerHTML=materialArt(m)+'<b>'+labels[m]+'</b><span>'+amount(remaining)+' eksik</span><div class="rel-bar" role="progressbar" aria-label="'+labels[m]+' ilerlemesi" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(progress)+'"><i style="width:'+progress+'%"></i></div><small>'+(house.max_level?'Tamamlandı':own?'Malzeme al':'Katkıda bulun')+'</small>';b.disabled=!!house.max_level;b.onclick=()=>materials(house,m,!own);home.querySelector('.rel-material-grid').append(b)}
    home.querySelector('.rel-stock').textContent='Ortak depo · '+Object.entries(house.materials||{}).map(([m,n])=>labels[m]+' '+amount(n)).join(' · ');
    if(house.needs_first_copper){const note=document.createElement('p');note.className='rel-note';note.textContent='İlk seviye geçişi için bir bakır yüzük gerekir.';home.querySelector('.rel-growth').append(note)}
    for(let n=1;n<=12;n++){const b=document.createElement('button');b.type='button';b.className='rel-level-tile'+(n===level?' current':'')+(n>level?' locked':'');b.setAttribute('aria-label','Seviye '+n+' · '+(n<=level?'Ulaşıldı':'Kilitli'));b.innerHTML='<img src="'+modernArt('level-'+n)+'" alt=""><b>'+n+'</b><small>'+(n===level?'Şu an':n<level?'Ulaşıldı':'Kilitli')+'</small>';b.onclick=()=>showRewards(house,false,n);home.querySelector('.rel-level-grid').append(b)}body.append(home);
    if(own)api('/me').then(s=>{if(main===current&&body.isConnected&&current.renderTicket===ticket)renderRequests(body,s.requests||[])}).catch(()=>{});
  }
  async function showRewards(house=null,collection=false,selectedLevel=0){
    const modal=dialog(collection?'İlişki koleksiyonum':'İlişki ödülleri','<p class="rel-note">Ödüller yükleniyor…</p>',true);
    modal.shade.classList.add('rel-rewards-page');
    try{
      const data=await api('/rewards');if(!modal.shade.isConnected)return;
      modal.body.innerHTML='<section class="rel-rewards-intro"><small>LİDYA · SEVİYE ÖDÜLLERİ</small><h3>Birlikte kazanılan izler.</h3><p>Her seviyede iki kişisel ödül. Kadın ve erkek için aynı temanın farklı tasarımları.</p><div class="rel-reward-summary"></div></section><div class="rel-reward-controls"><div class="rel-reward-filters"></div><label class="rel-reward-level">Seviye<select aria-label="Ödül seviyesi"><option value="0">Tüm seviyeler</option></select></label></div><div class="rel-reward-grid"></div>';
      const items=(data.items||[]).filter(r=>!collection||r.owned),grid=modal.body.querySelector('.rel-reward-grid'),select=modal.body.querySelector('select');let filter='all',level=Math.max(0,Math.min(12,Number(selectedLevel)||0));
      const own=window.ErisAuth?.user||{};
      const genderLabel=r=>r.gender==='male'?'Erkek tasarımı':r.gender==='female'?'Kadın tasarımı':'Çift ödülü';
      for(let n=1;n<=12;n++){const option=document.createElement('option');option.value=n;option.textContent='Seviye '+n+' · '+items.filter(r=>r.level===n).length+' ödül';select.append(option)}select.value=String(level);
      const preview=r=>{
        const large=dialog(r.name,'<div class="rel-reward-large-wrap"><img class="rel-reward-large" src="'+esc(cosmetic(r.asset))+'" alt="'+esc(r.name)+'"></div><p class="rel-note">Seviye '+r.level+' · '+genderLabel(r)+' · '+(r.owned?'Kazanıldı':'Bu seviyeye ulaştığınızda açılır.')+'</p>');
        if(r.type==='frame'){const wrap=large.body.querySelector('.rel-reward-large-wrap');wrap.classList.add('rel-frame-demo');const portrait=document.createElement('span');portrait.className='rel-frame-demo-avatar';if(own.avatar_asset){const im=document.createElement('img');im.src=cosmetic(own.avatar_asset);im.alt='';portrait.append(im)}else portrait.textContent=own.avatar||'👤';wrap.prepend(portrait)}
        if(r.type==='bubble'){const demo=document.createElement('div');demo.className='rel-chat-bubble rel-reward-bubble-demo';demo.innerHTML='<div class="rel-chat-line"><b>'+esc(own.nickname||'Sen')+'</b><br>Birlikte nice güzel anılara. Bu alan gerçek sohbet metnini gösterir.</div>';large.body.append(demo);if(window.ErisVisualLayout?.bubble)window.ErisVisualLayout.bubble(demo,r.asset_key);else demo.style.backgroundImage='url("'+cosmetic(r.asset)+'")';}
        if(r.type==='entrance'&&window.ErisRelationshipEntrance){const button=document.createElement('button');button.type='button';button.className='rel-primary';button.textContent='Oda girişini dene';button.onclick=()=>window.ErisRelationshipEntrance.show({...own,preview:true,nickname:own.nickname||'Sen',entrance_asset:r.asset_key,ring_asset:house?.ring?asset(house.ring):null});large.body.append(button)}
      };
      const draw=()=>{
        grid.replaceChildren();modal.body.querySelector('.rel-reward-summary').textContent='Seviye '+(data.level||0)+' / 12 · '+items.filter(r=>r.owned).length+' kazanılan ödül';
        for(const r of items.filter(r=>(!level||r.level===level)&&(filter==='all'||filter==='owned'&&r.owned||filter==='locked'&&!r.unlocked))){
          const row=document.createElement('article');row.className='rel-reward-card'+(!r.unlocked?' locked':'')+(r.equipped?' equipped':'');row.dataset.rewardType=r.type;
          row.innerHTML='<div class="rel-reward-top"><img src="'+modernArt('level-'+r.level)+'" alt=""><span>Seviye '+r.level+'</span><small>'+(r.equipped?'Takılı':r.owned?'Kazanıldı':r.unlocked?'Açıldı':'Kilitli')+'</small></div><button type="button" class="rel-reward-preview" aria-label="'+esc(r.name)+' büyük görselini aç"><img src="'+esc(cosmetic(r.asset))+'" alt="'+esc(r.name)+'" loading="lazy"></button><b>'+esc(r.name)+'</b><small class="rel-reward-variant">'+genderLabel(r)+'</small>';
          row.querySelector('.rel-reward-preview').onclick=()=>preview(r);
          if(r.owned&&r.type!=='ring'){const b=document.createElement('button');b.type='button';b.className='rel-primary';b.textContent=r.equipped?'Çıkar':'Uygula';b.onclick=()=>action(b,modal.body,async()=>{await post('/rewards/equip',{kind:r.type,asset_key:r.equipped?null:r.asset_key});modal.close();showRewards(house,collection,level);window.ErisChatCosmetics?.load?.();window.ErisProfile?.refresh?.();window.dispatchEvent(new Event('erischat:cosmetics-updated'));refreshMain()});row.append(b)}
          else{const hint=document.createElement('small');hint.className='rel-reward-hint';hint.textContent=r.type==='ring'&&r.owned?'Yüzük koleksiyonundan takabilirsiniz.':'Seviye '+r.level+' gerekli';row.append(hint)}grid.append(row);
        }
        if(!grid.children.length){const empty=document.createElement('div');empty.className='rel-rewards-empty';empty.textContent='Bu seçimde henüz ödül bulunmuyor.';grid.append(empty)}
        modal.body.querySelectorAll('.rel-reward-filters button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
      };
      for(const [id,name] of [['all','Tümü'],['owned','Kazanılanlar'],['locked','Kilitli']]){const b=document.createElement('button');b.type='button';b.dataset.filter=id;b.textContent=name;b.onclick=()=>{filter=id;draw()};modal.body.querySelector('.rel-reward-filters').append(b)}
      select.onchange=()=>{level=Number(select.value);draw()};draw();
    }catch(e){if(modal.shade.isConnected)errorBox(modal.body).textContent=e.message||'Ödüller yüklenemedi.'}
  }
  async function coupleGifts(house){
    const modal=dialog('Çifte hediye gönder','<p>Hediyeler yükleniyor…</p>');
    try{
      const [data,me]=await Promise.all([window.ErisPlatform.api('/message-gifts'),window.ErisPlatform.api('/me')]);
      if(!modal.shade.isConnected)return;
      let quantity=1,balance=Number(me.lidya||0),selected=null,busy=false,uncertain=false,requestKey=null;
      modal.body.innerHTML='<p class="rel-note">Hediye ortak hesaba sayılır. 30 Lidya üzerindeki hediyede üçte bir kesilir; kalan tutarın rastgele %1–100’ü iki partnere eşit dağıtılır.</p><div class="rel-gift-quantities" aria-label="Hediye adedi">'+[1,3,5,9,49,99].map(n=>'<button type="button" data-quantity="'+n+'">'+n+'</button>').join('')+'</div><p class="rel-gift-balance"></p><div class="rel-couple-gifts"></div>';
      const grid=modal.body.querySelector('.rel-couple-gifts'),cards=[];
      const paint=()=>{
        modal.body.querySelector('.rel-gift-balance').textContent='Bakiye: '+amount(balance)+' Lidya • '+quantity+' adet';
        modal.body.querySelectorAll('[data-quantity]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.quantity)===quantity);b.setAttribute('aria-pressed',String(Number(b.dataset.quantity)===quantity));b.disabled=busy||uncertain;});
        cards.forEach(c=>{const chosen=c===selected,affordable=c.price*quantity<=balance;c.card.classList.toggle('selected',chosen);c.card.classList.toggle('unaffordable',!affordable);c.pick.disabled=busy||!affordable||uncertain;c.pick.setAttribute('aria-pressed',String(chosen));c.send.hidden=!chosen;c.send.disabled=busy||(!affordable&&!uncertain);c.send.textContent=uncertain?'Tekrar dene':busy?'Gönderiliyor…':'Gönder • '+amount(c.price*quantity)+' Lidya';c.priceLabel.innerHTML=coin(c.price*quantity);});
      };
      modal.body.querySelectorAll('[data-quantity]').forEach(b=>b.onclick=()=>{if(busy||uncertain)return;quantity=Number(b.dataset.quantity);requestKey=null;paint();});
      for(const gift of (Array.isArray(data)?data:data.items||[])){
        const name=gift.gift_key||gift.name,price=Number(gift.unit_price??gift.price??0);if(!name||!Number.isFinite(price)||price<0)continue;
        const card=document.createElement('div');card.className='rel-gift-card';card.innerHTML='<button type="button" class="rel-gift-send" hidden>Gönder</button><button type="button" class="rel-gift-pick"><img src="'+esc(gift.image_url)+'" alt="'+esc(name)+'"><span>'+esc(name)+'</span><span data-price></span></button>';
        const c={card,name,price,pick:card.querySelector('.rel-gift-pick'),send:card.querySelector('.rel-gift-send'),priceLabel:card.querySelector('[data-price]')};cards.push(c);const preview=document.createElement('button');preview.type='button';preview.className='gift-preview-button';preview.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';preview.setAttribute('aria-label',name+' önizle');preview.title='Ücretsiz önizle';preview.onclick=()=>window.ErisGiftStage?.preview?.({gift_key:name,quantity});card.classList.add('gift-preview-cell');card.append(preview);grid.append(card);
        c.pick.onclick=()=>{if(busy||uncertain)return;selected=c;requestKey=null;errorBox(modal.body).textContent='';paint();};
        c.send.onclick=async()=>{
          if(busy||selected!==c||(!uncertain&&price*quantity>balance))return;
          busy=true;requestKey=requestKey||key();errorBox(modal.body).textContent='';paint();
          try{
            const result=await post('/houses/'+encodeURIComponent(house.id)+'/gifts',{gift_key:name,quantity,request_key:requestKey});
            window.ErisGiftStage?.play?.({id:result.id||requestKey,gift_key:name,quantity,sender_nickname:me.nickname||'Sen',recipient_nickname:'Çiftimiz'},'couple');
            requestKey=null;uncertain=false;balance=Math.max(0,balance-price*quantity);
            try{const fresh=await window.ErisPlatform.api('/me');balance=Number(fresh.lidya||0);}catch(_){}
            window.toast?.('Çiftin her partnerine '+amount(result.each_amount)+' Lidya aktarıldı.');window.ErisProfile?.refresh?.();
          }catch(e){uncertain=!e.status;errorBox(modal.body).textContent=e.message+(uncertain?' Sonucu aynı işlem anahtarıyla kontrol etmek için Tekrar dene’ye basın.':'');if(!uncertain)requestKey=null;}
          finally{busy=false;if(modal.shade.isConnected)paint();}
        };
      }
      paint();
    }catch(e){errorBox(modal.body).textContent=e.message;}
  }
  async function getCatalog(){if(!catalogData)catalogData=await api('/catalog');return catalogData}
  function rings(house,onSelect=null){
    const modal=dialog(onSelect?'Evlilik yüzüğünü seç':'Yüzük koleksiyonu','<section class="rel-ring-intro"><small>LİDYA · ÇİFT YÜZÜKLERİ</small><h3>Birlikteliğinizin mührü.</h3><p>Antik motiflerle işlenmiş bakır, gümüş ve altın yüzükler. Görsele dokunarak yakından inceleyebilirsiniz.</p></section><div class="rel-ring-tabs" role="tablist" aria-label="Yüzük kategorileri"></div><p class="rel-ring-summary" aria-live="polite">Yüzükler yükleniyor…</p><div class="rel-ring-grid" role="tabpanel"></div>',true);
    modal.shade.classList.add('rel-ring-page');
    getCatalog().then(data=>{
      if(!modal.shade.isConnected)return;
      const categories=onSelect?['gold']:['owned','level','copper','silver','gold'];
      const owned=house.owned_rings||[],tabNames={owned:'Yüzüklerim',level:'Seviye',copper:'Bakır',silver:'Gümüş',gold:'Altın'};
      const title=r=>r.key.startsWith('level-')?'Seviye ödülü '+r.key.split('-')[1]:(labels[r.key.split('-')[0]]||'Çift')+' yüzük '+r.key.split('-')[1];
      const equip=(button,r)=>action(button,modal.body,async()=>{await post('/ring/equip',{ring:r.key});modal.close();refreshMain();window.ErisProfile?.refresh?.();window.dispatchEvent(new Event('erischat:cosmetics-updated'))});
      const draw=metal=>{
        const grid=modal.body.querySelector('.rel-ring-grid');grid.replaceChildren();
        const rows=metal==='owned'||metal==='level'?owned.filter(r=>metal==='level'?r.source==='level':r.source==='purchased'):(data.rings||[]).filter(r=>r.category===metal);
        modal.body.querySelector('.rel-ring-summary').textContent=tabNames[metal]+' · '+rows.length+' yüzük';
        modal.body.querySelectorAll('[data-ring-category]').forEach(b=>{const selected=b.dataset.ringCategory===metal;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1});
        for(const r of rows){
          const has=owned.some(item=>item.key===r.key),active=house.ring===r.key,collection=metal==='owned'||metal==='level';
          const locked=!collection&&!onSelect&&!has&&((house.needs_first_copper&&metal!=='copper')||(metal==='gold'&&house.level<4));
          const card=document.createElement('article');card.className='rel-jewel-card'+(active?' equipped':'');
          const state=active?'Takılı':has?'Koleksiyonunda':locked?'Kilitli':onSelect?'Evlilik yüzüğü':'Çift yüzüğü';
          card.innerHTML='<span class="rel-jewel-state">'+state+'</span><button type="button" class="rel-jewel-preview" aria-label="'+esc(title(r))+' büyük görselini aç"><img src="'+esc(asset(r.key))+'" alt="'+esc(title(r))+'" loading="lazy"></button><h4>'+esc(title(r))+'</h4><div class="rel-jewel-price">'+(has?'Sahipsin':coin(r.price))+'</div><button type="button" class="rel-jewel-action rel-primary"></button>';
          card.querySelector('.rel-jewel-preview').onclick=()=>dialog(title(r),'<img class="rel-jewel-large" src="'+esc(asset(r.key))+'" alt="'+esc(title(r))+'"><p class="rel-jewel-caption">'+esc(title(r))+' · '+(has?'Koleksiyonunda':amount(r.price)+' Lidya')+'</p>');
          const button=card.querySelector('.rel-jewel-action');button.textContent=onSelect?'Seç':active?'Takılı':has?'Tak':locked?'Kilitli':'Satın al';button.disabled=locked||(!onSelect&&active);
          if(locked){const hint=document.createElement('small');hint.className='rel-jewel-hint';hint.textContent=house.needs_first_copper?'Önce bir bakır yüzük seçin.':'Aile evi seviye 4 gerekli.';card.append(hint)}
          button.onclick=()=>{if(button.disabled)return;if(onSelect){modal.close();onSelect({...r,asset:asset(r.key),price:has?0:r.price});return}if(has){equip(button,r);return}confirmRing(house,{...r,asset:asset(r.key)},modal)};
          grid.append(card);
        }
        if(!rows.length){const empty=document.createElement('div');empty.className='rel-ring-empty';empty.innerHTML='<img src="'+asset(metal==='level'?'level-1':'copper-1')+'" alt=""><b>'+ (metal==='level'?'Seviye ödüllerin burada.':'Yüzük koleksiyonun burada.')+'</b><p>'+(metal==='level'?'Aile evinin 6. ve 12. seviyelerinde özel yüzükler kazanırsınız.':'Bakır, gümüş veya altın sekmesinden bir yüzük seçebilirsin.')+'</p>';grid.append(empty)}
      };
      const tabs=modal.body.querySelector('.rel-ring-tabs');
      for(const metal of categories){const b=document.createElement('button');b.type='button';b.dataset.ringCategory=metal;b.setAttribute('role','tab');b.textContent=tabNames[metal];b.onclick=()=>draw(metal);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const list=[...tabs.children],i=list.indexOf(b),next=e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[next].click();list[next].focus();list[next].scrollIntoView({block:'nearest',inline:'nearest'})};tabs.append(b)}
      draw(categories[0]);
      if(!onSelect&&house.needs_first_copper){const p=document.createElement('p');p.className='rel-note';p.textContent='İlk yüzük bakır olmalıdır. Altın yüzükler aile evi seviye 4 olduğunda açılır.';modal.body.append(p)}
    }).catch(e=>{if(modal.shade.isConnected){modal.body.querySelector('.rel-ring-summary').textContent='Yüzükler yüklenemedi.';errorBox(modal.body).textContent=e.message}});
  }
  function confirmRing(house,ring,parent){
    const modal=dialog('Bu yüzüğü satın almak istiyor musunuz?','<img class="rel-ring-preview" src="'+esc(ring.asset)+'" alt="Seçilen yüzük"><p style="text-align:center">'+coin(ring.price)+' ödemelisiniz.</p><button class="rel-primary" type="button">Satın al</button>');
    const request_key=key();modal.body.querySelector('button').onclick=e=>action(e.currentTarget,modal.body,async()=>{await post('/ring',{item:ring.key,request_key});modal.close();parent.close();refreshMain();window.ErisProfile?.refresh?.();window.dispatchEvent(new Event('erischat:cosmetics-updated'))});
  }
  function materials(house,material,donation){
    const price=Number(house.material_price)||750;
    const modal=dialog(labels[material]+(donation?' katkısı':' satın al'),materialArt(material)+'<p class="rel-note">'+labels[material]+' satın almak için adet girin. Adet fiyatı '+coin(price)+'.</p><form><input type="number" name="quantity" min="1" max="1000000" step="1" value="1" required aria-label="Malzeme adedi"><p data-total>'+coin(price)+'</p><button class="rel-primary" type="submit">'+(donation?'Katkıda bulun':'Satın al')+'</button></form>');
    const form=modal.body.querySelector('form'),input=form.querySelector('input'),request_key=key();
    input.oninput=()=>{const n=Number(input.value);form.querySelector('[data-total]').innerHTML=Number.isInteger(n)&&n>0?coin(n*price):'Geçerli bir adet girin.'};
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
    if(window.ErisNotifications?.enabled===false||polling||!token()||!window.ErisPlatform?.api||document.hidden||document.querySelector('.rel-notice'))return;polling=true;const sessionToken=token();
    try{const rows=await api('/events');if(token()!==sessionToken)return;for(const event of rows){if(seenEvents.has(event.id))continue;seenEvents.add(event.id);if(event.kind==='request'){requestPopup(event);await post('/events/'+event.id+'/ack');break}const modal=dialog(event.title,'<p data-message></p>');modal.shade.classList.add('rel-notice');modal.body.querySelector('[data-message]').textContent=event.message||'';if(event.kind==='donation'){const b=document.createElement('button');b.type='button';b.className='rel-primary';b.textContent='Teşekkür et';b.onclick=()=>action(b,modal.body,async()=>{await post('/donations/'+encodeURIComponent(event.operation_id)+'/thank');await post('/events/'+event.id+'/ack');modal.close();window.toast?.('Teşekkürünüz gönderildi.')});modal.body.append(b)}await post('/events/'+event.id+'/ack');if(['welcome','upgrade','result','ended'].includes(event.kind)){refreshMain();window.dispatchEvent(new Event('erischat:cosmetics-updated'))}break}}catch(_){}finally{polling=false}
  }
  function decorate(root,relationship){
    const own=root.matches('.profile'),vip=root.querySelector('[data-vip-card]');let area=root.querySelector(own?'.eris-profile-badges':'.eris-mini-relationship, .eris-profile-badges');
    if(!area){area=document.createElement('div');area.className=own?'eris-profile-badges':root.querySelector('.eris-mini-head')?'eris-mini-relationship':'eris-profile-badges';const head=root.querySelector('.eris-mini-head');if(head)head.after(area);else root.append(area)}
    root.querySelector('.rel-title')?.remove();root.querySelector('.rel-public')?.remove();root.querySelector('.eris-profile-relationship')?.remove();
    if(relationship){
      const slot=document.createElement('div');slot.className='rel-public';slot.dataset.status=relationship.status;
      const statusArt=relationship.status_asset?cosmetic(relationship.status_asset):rewardArt('status/'+relationship.status);
      const button=document.createElement('button');button.type='button';button.className='rel-public-status';button.setAttribute('aria-label',relationship.partner.nickname+' ile aile evini aç');button.onclick=()=>open(relationship.id);
      const artImage=document.createElement('img');artImage.className='rel-status-art';artImage.src=statusArt;artImage.alt='';button.append(artImage);
      const partner=avatar(relationship.partner,'',false);partner.setAttribute('aria-label',relationship.partner.nickname+' ile aile evini aç');partner.onclick=()=>open(relationship.id);slot.append(button,partner);
      if(relationship.ring){const ring=document.createElement('img');ring.className='rel-public-ring';ring.src=cosmetic(relationship.ring_asset||('relationship-assets/'+relationship.ring+'.png'));if(relationship.ring.startsWith('level-'))ring.src=cosmetic('relationship-assets/rewards/ring-'+relationship.ring.split('-')[1]+'.png');ring.alt='Takılı çift yüzüğü';slot.append(ring)}
      area.append(slot);if(relationship.title_asset){const title=document.createElement('img');title.className='rel-title';title.src=cosmetic(relationship.title_asset);title.alt='İlişki ünvanı';area.append(title)}
    }
    if(vip)area.append(vip);root.querySelectorAll('.rel-vip-title-stack').forEach(stack=>{if(!stack.children.length)stack.remove()});
  }
  function boot(){const tabs=document.querySelector('#ephTabs');if(!tabs)return;if(!tabs.querySelector('[data-tab=relationship]')){const b=document.createElement('button');b.type='button';b.dataset.tab='relationship';b.innerHTML='<span class="eph-icon" aria-hidden="true" style="font-size:25px;line-height:24px">♥</span><span>İlişki</span>';b.onclick=()=>open();tabs.append(b)}}
  window.ErisRelationship={open,decorate,showRewards,coupleGifts};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{boot();pollEvents()},{once:true});else{boot();pollEvents()}
  window.addEventListener('erischat:auth',e=>{if(e.detail?.state==='ready'){boot();pollEvents()}else if(['logged_out','login_required'].includes(e.detail?.state)){for(const s of openDialogs){s._relLayoutObserver?.disconnect();s.remove()}openDialogs.clear();document.body.classList.remove('rel-dialog-open');main=null;seenEvents.clear();popupRequests.clear()}});
  window.addEventListener('erischat:event',pollEvents);window.addEventListener('erischat:room-gift',refreshMain);window.addEventListener('erischat:gift-updated',refreshMain);window.addEventListener('erischat:cosmetics-updated',refreshMain);
  document.addEventListener('visibilitychange',()=>{pollEvents();refreshMain()});window.ErisApiTransport.poll(async()=>{await pollEvents();await refreshMain()},12000);
})();
