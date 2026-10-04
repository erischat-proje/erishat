(() => {
  'use strict';
  const base=(window.ERIS_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';
  async function api(path,options={}) {
    const headers=new Headers(options.headers||{});headers.set('Accept','application/json');
    if(options.body!==undefined)headers.set('Content-Type','application/json');
    if(token())headers.set('Authorization','Bearer '+token());
    const response=await fetch(base+path,{...options,headers}),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||'İşlem başarısız');return data;
  }
  const thresholds=[0,1000,5000,15000,30000,60000,120000,250000,500000,1000000,2000000,5000000,10000000];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=n=>Number(n||0).toLocaleString('tr-TR');
  const material=(kind,level)=>'./vip-assets/'+kind+'-'+level+'.png';
  const kinds={avatar:'Avatar',frame:'Çerçeve',wallpaper:'Duvar kağıdı'};
  const style=document.createElement('style');style.textContent=`
    .eris-vip-content{display:block!important;color:#fff;min-width:0}
    .eris-vip-summary{padding:18px;border:1px solid #ffffff20;border-radius:22px;background:linear-gradient(145deg,#21172d,#100d16);margin-bottom:12px}
    .eris-vip-summary h2{margin:4px 0}.eris-vip-summary small,.eris-vip-note{color:#c8bbd4;font-size:11px;line-height:1.5}
    .eris-vip-progress{height:8px;border-radius:99px;background:#ffffff12;overflow:hidden;margin:10px 0}.eris-vip-progress i{display:block;height:100%;background:linear-gradient(90deg,#844dff,#e6bd62)}
    .eris-vip-row{display:grid;grid-template-columns:60px minmax(0,1fr);gap:10px;padding:13px;border:1px solid #ffffff18;background:#100d16;border-radius:17px;margin:9px 0;font-size:13px}
    .eris-vip-level{width:60px;height:64px;object-fit:contain}.eris-vip-assets{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap}
    .eris-vip-asset{width:60px;text-align:center;font-size:9px;color:#c8bbd4}.eris-vip-asset img{width:60px;height:64px;object-fit:contain;background:#08070b;border-radius:10px;display:block;margin-bottom:4px}
    .eris-vip-buttons{display:flex;gap:7px;flex-wrap:wrap}.eris-vip-buttons button{min-height:38px;border:1px solid #ffffff24;background:#ffffff0b;color:white;border-radius:10px;padding:8px 10px;font-size:11px;font-weight:700}.eris-vip-buttons button:disabled{opacity:.5}
    .eris-vip-overlay{position:fixed;inset:0;z-index:11200;display:grid;place-items:center;padding:14px;background:#05030bbd;backdrop-filter:blur(10px)}
    .eris-vip-dialog{width:min(600px,100%);max-height:90dvh;display:flex;flex-direction:column;border:1px solid #ad82dc55;border-radius:24px;background:#110c1b;box-shadow:0 25px 80px #000b;overflow:hidden;color:white}
    .eris-vip-dialog header{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #ffffff18}.eris-vip-dialog h2{margin:0;font-size:20px}
    .eris-vip-dialog header button{width:40px;height:40px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff0b;color:white;font-size:24px}.eris-vip-dialog .eris-vip-content{overflow:auto;padding:16px;overscroll-behavior:contain}
    body.eris-vip-open{overflow:hidden}.eris-vip-card{width:100px;height:32px;object-fit:contain;flex:none;vertical-align:middle}.eris-vip-card[hidden]{display:none!important}
    .eris-profile-title{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}.eris-profile-title h2{margin:0!important;overflow-wrap:anywhere;min-width:0}
    [data-received-gifts]{display:flex!important;align-items:center;justify-content:center;gap:4px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    [data-received-gifts] img{width:18px;height:18px;object-fit:contain;flex:none}
  `;document.head.append(style);
  const roots=new Set();let pending;
  async function load(root=document.getElementById('vipLiveMount')) {
    if(!root)return;for(const r of roots)if(!r.isConnected)roots.delete(r);roots.add(root);root.classList.add('eris-vip-content');
    const ticket={};root._vipTicket=ticket;root.textContent='VIP ödülleri yükleniyor…';
    try {
      if(!pending)pending=Promise.all([api('/me/vip'),api('/me/vip/rewards')]).finally(()=>{pending=null});
      const [v,rewards]=await pending;if(!root.isConnected||root._vipTicket!==ticket)return;
      const level=Math.max(0,Math.min(12,Number(v.level)||0)),spent=Number(v.total_spent||0),next=level<12?thresholds[level+1]:null,prev=thresholds[level];
      const pct=next?Math.min(100,Math.max(0,(spent-prev)/(next-prev)*100)):100;
      root.innerHTML=`<div class="eris-vip-summary"><small>VIP DURUMUN</small><h2>${level?'VIP '+level:'VIP üyesi ol'}</h2><small>${number(spent)} Lidya harcama puanı</small><div class="eris-vip-progress"><i style="width:${pct}%"></i></div><small>${next?'VIP '+(level+1)+' seviyesine '+number(Math.max(0,next-spent))+' Lidya':'En yüksek seviye'}</small></div><p class="eris-vip-note">Her seviyede avatar, çerçeve ve duvar kağıdı envantere eklenir. Bu görünüm paketleri Lidya veya elmas ödemesi içermez. Özel profil penceresi ve oda giriş animasyonu seviyene göre otomatik etkinleşir. Gizli VIP ve VIP girişini gizle ayarları korunur.</p>`;
      if(level>=10){const extra=document.createElement('div');extra.className='eris-vip-buttons';const badge=document.createElement('button');badge.type='button';badge.textContent=v.knight_badge_claimed?'✓ Şövalye rozeti alındı':'VIP 10 · Şövalye rozetini al';badge.disabled=!!v.knight_badge_claimed;badge.onclick=()=>action(badge,()=>api('/me/vip/claims/knight_badge',{method:'POST'}));extra.append(badge);root.append(extra)}
      for(const item of rewards||[]) {
        const row=document.createElement('article');row.className='eris-vip-row';const complete=!!item.claimed&&!!item.complete;
        row.innerHTML=`<img class="eris-vip-level" src="${material('logo',item.level)}" alt="VIP ${item.level}" loading="lazy"><div><b>VIP ${item.level}</b><p class="eris-vip-note">${number(thresholds[item.level])} Lidya harcama</p><div class="eris-vip-assets">${(item.rewards||[]).map(x=>{const path=x.asset_url?'./'+x.asset_url.split('/').map(encodeURIComponent).join('/'):window.ErisChatCosmetics?.assetUrl?.(x.asset_key)||x.asset_key;return `<div class="eris-vip-asset"><img src="${esc(path)}" alt="VIP ${item.level} ${kinds[x.cosmetic_type]}" loading="lazy">${kinds[x.cosmetic_type]||''}</div>`}).join('')}</div><div class="eris-vip-buttons"><button type="button" data-claim ${!item.unlocked||complete?'disabled':''}>${complete?'✓ Ödüller alındı':!item.unlocked?'Kilitli':item.claimed?'Eksik ödülleri tamamla':'Ödülleri al'}</button></div></div>`;
        const preview=document.createElement('button');preview.type='button';preview.dataset.previewProfile=String(item.level);preview.textContent='Profil penceresini gör';preview.onclick=()=>window.ErisFloatingProfile?.preview?.(item.level);row.querySelector('.eris-vip-buttons').append(preview);
        const theme=window.ErisVIPDesigns?.get(item.level);
        if(theme){
          row.style.setProperty('--vip-accent',theme.color);
          const presentation=document.createElement('div');presentation.className='eris-vip-presentation eris-vip-art-reward';
          const image=document.createElement('img');image.src=theme.frame;image.alt='VIP '+item.level+' profil çerçevesi';image.loading='lazy';
          const details=document.createElement('div'),name=document.createElement('strong'),benefits=document.createElement('span'),status=document.createElement('span');
          name.textContent=theme.name;benefits.textContent='Özel profil penceresi + seviyeye özel oda giriş animasyonu';
          status.textContent=item.unlocked?'✓ Seviye kazanıldı · görünüm ve giriş otomatik etkin':'Bu seviyeye ulaşıldığında otomatik açılır';
          details.append(name,benefits,status);presentation.append(image,details);row.querySelector('.eris-vip-assets').after(presentation);
          const entry=document.createElement('button');entry.type='button';entry.dataset.previewEntry=String(item.level);entry.textContent='Oda girişini izle';entry.onclick=()=>window.ErisRoomEntrance?.preview(item.level);row.querySelector('.eris-vip-buttons').append(entry);
        }
        const claim=row.querySelector('[data-claim]');claim.onclick=()=>action(claim,()=>api('/me/vip/rewards/'+item.level+'/claim',{method:'POST'}));
        if(complete)for(const x of item.rewards||[]){const b=document.createElement('button');b.type='button';b.textContent=(kinds[x.cosmetic_type]||'Görünüm')+' uygula';b.onclick=async()=>{b.disabled=true;try{await api(x.cosmetic_type==='wallpaper'?'/me/wallpaper/apply':'/me/cosmetics/apply',{method:'POST',body:JSON.stringify({cosmetic_type:x.cosmetic_type,asset_key:x.asset_key})});window.toast?.('VIP görünümü uygulandı ✓');window.dispatchEvent(new Event('erischat:cosmetics-updated'))}catch(e){window.toast?.(e.message)}finally{b.disabled=false}};row.querySelector('.eris-vip-buttons').append(b)}
        root.append(row);
      }
    }catch(e){if(root._vipTicket===ticket)root.textContent='VIP ödülleri yüklenemedi: '+e.message}
  }
  async function action(button,fn){button.disabled=true;try{await fn();window.toast?.('VIP ödülleri envantere eklendi ✓');await Promise.all([...roots].filter(r=>r.isConnected).map(r=>load(r)))}catch(e){button.disabled=false;window.toast?.(e.message)}}
  let lastTrigger;
  function close(){document.querySelector('.eris-vip-overlay')?.remove();document.body.classList.remove('eris-vip-open');if(lastTrigger?.isConnected)lastTrigger.focus()}
  function open(){
    if(document.querySelector('.eris-vip-overlay'))return;lastTrigger=document.activeElement;
    const shade=document.createElement('div');shade.className='eris-vip-overlay';shade.innerHTML='<section class="eris-vip-dialog" role="dialog" aria-modal="true" aria-labelledby="erisVIPTitle"><header><h2 id="erisVIPTitle">VIP merkezi</h2><button type="button" aria-label="VIP merkezini kapat">×</button></header><div class="eris-vip-content"></div></section>';
    shade.querySelector('button').onclick=close;shade.onclick=e=>{if(e.target===shade)close()};
    shade.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close()}if(e.key==='Tab'){const buttons=[...shade.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
    document.body.append(shade);document.body.classList.add('eris-vip-open');shade.querySelector('button').focus();load(shade.querySelector('.eris-vip-content'));
  }
  const profileColors=['#b9a8ff','#91bfff','#6ed8d5','#99e0ab','#eacb88','#ffb79e','#d59cff','#98afff','#ed94cb','#ffd68d','#a5eaff','#dbabff'];
  function profileTheme(card,level,enabled=true){
    const n=Math.max(0,Math.min(12,Number(level)||0)),visible=!!n&&enabled;
    card._artTicket=null;card._artObserver?.disconnect();card._artObserver=null;
    for(const key of ['border-image-source','border-image-slice','border-image-width','border-image-repeat','border-width','border-style','border-color','background-image'])card.style.removeProperty(key);
    card.classList.remove('visual-vip-card');card.classList.toggle('eris-mini-vip',visible);card.classList.add('eris-mini-modern');card.dataset.vipLevel=String(visible?n:0);
    card.style.setProperty('--vip-accent',profileColors[Math.max(0,n-1)]);
    const theme=window.ErisVIPDesigns?.get(n);
    if(theme&&visible){card.style.setProperty('--vip-accent',theme.color);card.style.setProperty('--vip-metal',theme.metal);card.style.setProperty('--vip-profile-art','url("'+theme.frame+'")')}
    else{card.style.removeProperty('--vip-profile-art');card.style.removeProperty('--vip-metal')}
    let hero=card.querySelector('.eris-mini-vip-hero');
    if(!hero){hero=document.createElement('div');hero.className='eris-mini-vip-hero';hero.innerHTML='<img alt=""><div><small>LIDYA</small><strong></strong><span>Özel profil görünümü</span></div>';card.querySelector('.eris-mini-topbar')?.after(hero)}
    hero.hidden=!visible;
    if(visible){hero.querySelector('img').src=material('logo',n);hero.querySelector('img').alt='VIP '+n;hero.querySelector('strong').textContent='VIP '+n;hero.querySelector('span').textContent=theme?.name||'Özel profil görünümü';}
  }
  function decorate(root,u){
    const level=Math.max(0,Math.min(12,Number(u.vip_level)||0));
    root.querySelectorAll('[data-vip-card]').forEach(img=>{img.hidden=!level||!!u.vip_badge_hidden;if(!img.hidden){img.src=material('card',level);img.alt='VIP '+level}});
    const mini=root.querySelector('.eris-mini-card');if(mini)profileTheme(mini,level,!u.vip_neon_hidden);

    for(const [selector,value] of Object.entries({'[data-followers]':u.followers_count,'[data-following]':u.following_count}))if(value!=null)root.querySelectorAll(selector).forEach(el=>{el.textContent=number(value)});
    root.querySelectorAll('[data-received-gifts]').forEach(el=>{el.innerHTML='<span>'+number(u.received_gift_lidya)+'</span><img src="./lidya-coin.png" alt="Lidya">'});
    window.ErisRelationship?.decorate?.(root,u.relationship);
  }
  const watchers=new Map();
  function watch(root,id){if(!root||!id)return;const existing=watchers.get(root);if(existing?.id===id)return;const entry={id,busy:false};watchers.set(root,entry);refreshOne(root,entry)}
  async function refreshOne(root,entry){if(!root.isConnected){watchers.delete(root);return}if(entry.busy||!token())return;entry.busy=true;try{const u=await api('/users/'+encodeURIComponent(entry.id)+'/profile-stats');if(root.isConnected&&watchers.get(root)===entry)decorate(root,u)}catch(_){}finally{entry.busy=false}}
  function refreshProfiles(){if(document.hidden)return;for(const [root,entry] of watchers){if(!root.isConnected){watchers.delete(root);continue}if(!root.closest('.view:not(.show)'))refreshOne(root,entry)}}
  window.ErisApiTransport.poll(refreshProfiles,20000);
  for(const name of ['erischat:room-gift','erischat:gift-updated','erischat:cosmetics-updated'])window.addEventListener(name,refreshProfiles);
  window.addEventListener('erischat:event',e=>{if(e.detail?.gift_key||e.detail?.kind==='dm_gift')refreshProfiles()});
  document.addEventListener('visibilitychange',refreshProfiles);
  window.ErisChatVIP={load,open,close,material,decorate,watch,profileTheme};window.openVIPCenter=open;
  window.addEventListener('erischat:auth',e=>{if(e.detail?.state==='ready'){load();refreshProfiles()}else if(['logged_out','login_required'].includes(e.detail?.state)){close();watchers.clear();roots.clear()}});
})();
