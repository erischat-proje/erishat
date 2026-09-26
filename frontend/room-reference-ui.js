(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const surface = () => document.getElementById('erisRoomSurface');
  const roomId = () => String(window.ErisCurrentRoomId || window.currentRoomId || '');
  const userId = () => String(window.ErisCurrentUserId || localStorage.getItem('eris_user_id') || '');
  const roomApi = () => window.ErisRoom || {};

  const LEVEL_REWARDS = {
    1:'Temel oda • 8 koltuk',
    2:'Yeni oda rozetleri ve görsel ayrıcalıklar',
    3:'Yeni oda görseli / emoji ayrıcalıkları',
    4:'Yeni oda görsel ayrıcalıkları',
    5:'12 koltuk kapasitesi açılır',
    6:'Yeni oda görsel ve sosyal ayrıcalıkları',
    7:'16 koltuk kapasitesi açılır',
    8:'Özel oda görseli ve sahip ayrıcalıkları'
  };

  function css(){
    if(document.getElementById('eris-room-clean-css')) return;
    const s=document.createElement('style');
    s.id='eris-room-clean-css';
    s.textContent=[
      '#erisRoomSurface{--room-accent:var(--pink,#ff4fa3);--room-secondary:var(--violet,#8a5cff);--room-gold:var(--gold,#e4b85d)}',
      '#erisRoomSurface .eris-room-wall{background-position:center!important;background-size:cover!important;filter:saturate(1.05) contrast(1.02)}',
      '#erisRoomSurface .eris-room-top{height:76px!important;min-height:76px!important;padding:9px 10px!important;background:linear-gradient(180deg,rgba(7,4,18,.78),rgba(7,4,18,.08))!important;border:0!important;z-index:80!important}',
      '#erisRoomSurface .eris-room-top .room-action.back{width:38px!important;height:38px!important;font-size:27px!important;background:rgba(255,255,255,.08)!important;flex:none!important}',
      '#erisRoomSurface .eris-room-title{flex:0 1 42%!important;min-width:0!important;padding:2px 3px!important;cursor:pointer!important}',
      '#erisRoomSurface .eris-room-title b{font-size:14px!important;line-height:17px!important;font-weight:900!important}',
      '#erisRoomSurface .eris-room-title small{font-size:8px!important;margin-top:2px!important;color:#bcb3c7!important}',
      '#erisRoomSurface .room-v3-top-btn{width:38px!important;height:38px!important;border-radius:12px!important;border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.09)!important;color:#fff!important;box-shadow:none!important;flex:none!important}',
      '#erisRoomSurface #erisRoomLevel{position:absolute;left:50%;top:10px;transform:translateX(-50%);min-width:92px;height:38px;padding:0 11px;border-radius:13px;background:rgba(20,11,38,.76);border:1px solid rgba(255,255,255,.14);color:#fff;display:grid;place-items:center;line-height:1.05;box-shadow:0 8px 24px rgba(0,0,0,.22)}',
      '#erisRoomSurface #erisRoomLevel b{font-size:10px;display:block}#erisRoomSurface #erisRoomLevel small{font-size:7px;color:#bdb2c7;display:block;margin-top:2px}',
      '#erisRoomSurface #erisRoomMoreTop{margin-left:auto}#erisRoomSurface #erisRoomLeaveTop{background:rgba(255,72,111,.13)!important;border-color:rgba(255,96,125,.25)!important}',
      '#erisRoomSurface .eris-room-rank,#erisRoomSurface .erc-side-rail{display:none!important}',
      '#erisRoomSurface .eris-room-stage{top:82px!important;bottom:196px!important}',
      '#erisRoomSurface .eris-room-chat{height:196px!important;z-index:55!important}',
      '#erisRoomSurface .eris-room-compose{display:flex!important;align-items:center!important;gap:6px!important;padding:7px 10px 11px!important;max-width:760px!important;margin:0 auto!important}',
      '#erisRoomSurface .eris-room-compose input{height:40px!important;padding:0 14px!important;border-radius:20px!important;font-size:10px!important}',
      '#erisRoomSurface .room-v3-gift{width:40px!important;height:40px!important;padding:0!important;flex:none!important;display:grid!important;place-items:center!important;border-radius:50%!important;border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.09)!important;color:#fff!important;font-size:17px!important}',
      '#erisRoomSurface .eris-room-compose #erisLiveSend{min-width:66px!important;height:40px!important;padding:0 14px!important;border-radius:20px!important;font-size:10px!important;background:linear-gradient(135deg,#754cff,#ff4fa3)!important}',
      '#erisRoomSurface .eris-room-tools{right:10px!important;bottom:202px!important;z-index:70!important;display:flex!important;gap:6px!important}',
      '#erisRoomSurface .eris-room-tools button{width:40px!important;height:40px!important;border-radius:50%!important;background:rgba(10,6,22,.66)!important;border:1px solid rgba(255,255,255,.12)!important}',
      '#erisRoomSurface .eris-room-tools #erisRoomMic{font-size:0!important}#erisRoomSurface .eris-room-tools #erisRoomMic:after{content:"🎙️";font-size:16px!important}',
      '#erisRoomSurface .room-v3-panel{position:absolute;inset:0;z-index:140;display:none;place-items:center;padding:max(14px,env(safe-area-inset-top)) 12px max(14px,env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(3,2,8,.68);backdrop-filter:blur(7px)}',
      '#erisRoomSurface .room-v3-panel.show{display:grid}#erisRoomSurface .room-v3-dialog{width:min(560px,100%);height:min(760px,90dvh);max-height:calc(100dvh - 28px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.16);border-radius:24px;background:linear-gradient(155deg,#14111b,#0b0910);box-shadow:0 24px 80px rgba(0,0,0,.58);color:#fff}',
      '#erisRoomSurface .room-v3-head{min-height:60px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid rgba(255,255,255,.09)}#erisRoomSurface .room-v3-head strong{font-size:17px;letter-spacing:-.2px;flex:1}#erisRoomSurface .room-v3-close{width:40px;height:40px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:rgba(255,255,255,.07);color:#fff;font-size:21px}',
      '#erisRoomSurface .room-v3-body{padding:16px;overflow:auto;flex:1;overscroll-behavior:contain}#erisRoomSurface .room-v3-tabs{display:flex;gap:7px;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.08);overflow:auto;scrollbar-width:none}#erisRoomSurface .room-v3-tabs::-webkit-scrollbar{display:none}#erisRoomSurface .room-v3-tab{white-space:nowrap;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);color:#c3bacb;border-radius:12px;padding:10px 14px;font-size:12px}.room-v3-tab.active{color:#fff;background:rgba(117,76,255,.2);border-color:rgba(155,118,255,.65);box-shadow:inset 0 -2px #a77aff}',
      '#erisRoomSurface .room-v3-card{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.04);border-radius:15px;padding:14px;margin-bottom:9px}.room-v3-card b{font-size:14px}.room-v3-card small{display:block;color:#aaa1b2;font-size:12px;margin-top:5px;line-height:1.5}',
      '#erisRoomSurface .room-v3-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.room-v3-btn{min-height:44px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.055);color:#fff;border-radius:12px;padding:9px 12px;font-size:12px;font-weight:600}.room-v3-btn.primary{background:#754cff;border-color:#9b76ff}',
      '#erisRoomSurface .room-v3-input{width:100%;box-sizing:border-box;min-height:46px;padding:0 13px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:#100e15;color:#fff;outline:none;font:inherit;font-size:14px}.room-v3-input:focus{border-color:#9b76ff;box-shadow:0 0 0 3px rgba(138,92,255,.16)}.room-v3-save{margin-top:10px;width:100%;min-height:46px;border:0;border-radius:12px;background:#754cff;color:#fff;font-weight:700;font-size:14px}',
      '#erisRoomSurface .room-v3-note{font-size:12px;color:#aaa1b2;line-height:1.5;margin-top:9px}.room-v3-progress{height:8px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden;margin-top:12px}.room-v3-progress i{display:block;height:100%;background:linear-gradient(90deg,#754cff,#d74bb5);border-radius:99px}',
      '#erisRoomSurface .room-v3-level{border:1px solid rgba(255,255,255,.1);background:#121019;border-radius:15px;padding:14px;margin-bottom:9px}.room-v3-level.current{border-color:rgba(155,118,255,.55);background:linear-gradient(145deg,rgba(117,76,255,.12),rgba(255,255,255,.035))}.room-v3-levelline{display:flex;align-items:center;gap:12px}.room-v3-levelnum{width:38px;height:38px;flex:none;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.08);font-weight:750;font-size:14px}.room-v3-levelmain{flex:1;min-width:0}.room-v3-levelmain b{display:block;font-size:14px}.room-v3-levelmain small{display:block;color:#a39aa9;font-size:11px;margin-top:4px}.room-v3-levelstate{font-size:14px;color:#b9a0ff}.room-v3-summary{padding:16px;border:1px solid #ffffff16;border-radius:16px;background:#17131f;margin-bottom:12px}.room-v3-summary-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.room-v3-summary-title{font-size:15px;font-weight:700}.room-v3-summary-meta{color:#aaa1b2;font-size:12px;margin-top:5px}.room-v3-summary .room-v3-progress{margin-top:14px}',
      '@media(max-width:520px){#erisRoomSurface .eris-room-title{max-width:38%!important}#erisRoomSurface #erisRoomLevel{min-width:84px!important;padding:0 9px!important}#erisRoomSurface .room-v3-dialog{width:100%;height:min(780px,88dvh);max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 20px);border-radius:21px}#erisRoomSurface .room-v3-body{padding:13px}#erisRoomSurface .room-v3-head{min-height:58px;padding:0 14px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function panel(s){
    let p=s.querySelector('.room-v3-panel');
    if(p) return p;
    p=document.createElement('aside');p.className='room-v3-panel';p.setAttribute('role','dialog');p.setAttribute('aria-modal','true');p.setAttribute('aria-label','Oda bilgileri ve araçları');
    p.innerHTML='<div class="room-v3-dialog"><div class="room-v3-head"><strong id="roomV3Title">Oda</strong><button class="room-v3-close" aria-label="Kapat">×</button></div><div class="room-v3-tabs" role="tablist"><button class="room-v3-tab active" data-tab="info">Oda</button><button class="room-v3-tab" data-tab="users">Kullanıcılar</button><button class="room-v3-tab" data-tab="gifts">Hediyeler</button><button class="room-v3-tab" data-tab="music">Müzik</button><button class="room-v3-tab" data-tab="settings" data-management-tab="1">Ayarlar</button></div><div class="room-v3-body" id="roomV3Body"></div></div>';
    s.appendChild(p);
    p.querySelector('.room-v3-close').onclick=()=>p.classList.remove('show');
    p.addEventListener('click',event=>{if(event.target===p)p.classList.remove('show')});
    const settingsTab=p.querySelector('[data-management-tab]'); if(settingsTab){const r=window.__erisRoomPermissions||{}; settingsTab.style.display=(r.is_owner||r.is_moderator||r.can_manage)?'':'none';}
    p.querySelectorAll('.room-v3-tab').forEach(b=>b.onclick=()=>openMenu(b.dataset.tab));
    return p;
  }

  function top(s){
    const h=s.querySelector('.eris-room-top');if(!h)return;
    if(!h.querySelector('#erisRoomLevel')){const b=document.createElement('button');b.id='erisRoomLevel';b.type='button';b.innerHTML='<b>Seviye 1</b><small>ilerleme</small>';b.onclick=openLevels;h.appendChild(b)}
    if(!h.querySelector('#erisRoomMoreTop')){const r=window.__erisRoomPermissions||{};const can=!!(r.is_owner||r.is_moderator||r.can_manage);if(can){const b=document.createElement('button');b.id='erisRoomMoreTop';b.type='button';b.className='room-v3-top-btn';b.textContent='•••';b.title='Oda menüsü';b.onclick=()=>openMenu('settings');h.appendChild(b)}}
    if(!h.querySelector('#erisRoomLeaveTop')){const b=document.createElement('button');b.id='erisRoomLeaveTop';b.type='button';b.className='room-v3-top-btn';b.textContent='↪';b.title='Odadan çık';b.onclick=()=>window.closeRealRoom?.();h.appendChild(b)}
    
  }

  window.addEventListener('erischat:room-opened',()=>setTimeout(syncManagementUI,0));

  function gift(s){
    const c=s.querySelector('.eris-room-compose');if(!c||c.querySelector('#erisRoomGiftInline'))return;
    const b=document.createElement('button');b.id='erisRoomGiftInline';b.type='button';b.className='room-v3-gift';b.textContent='🎁';b.title='Hediye gönder';b.onclick=()=>openMenu('gifts');c.insertBefore(b,c.querySelector('#erisLiveSend')||null);
  }

  function syncManagementUI(){
    const s=surface(); if(!s)return;
    const r=window.__erisRoomPermissions||{}; const can=!!(r.is_owner||r.is_moderator||r.can_manage);
    const p=s.querySelector('.room-v3-panel'); const tab=p?.querySelector('[data-management-tab]'); if(tab)tab.style.display=can?'':'none';
    const h=s.querySelector('.eris-room-top'); if(!h)return;
    let b=h.querySelector('#erisRoomMoreTop');
    if(can && !b){b=document.createElement('button');b.id='erisRoomMoreTop';b.type='button';b.className='room-v3-top-btn';b.textContent='•••';b.title='Oda menüsü';b.onclick=()=>openMenu('settings');h.appendChild(b)}
    if(b){b.style.display=can?'':'none';b.setAttribute('aria-hidden',can?'false':'true');}
  }

  async function getRoom(){const id=roomId();if(!id)return{};try{return await roomApi().get?.(id)||{}}catch(e){return{}}}
  function isOwner(r){if(r?.is_owner===true)return true;const me=userId();return !!me&&[r?.owner_id,r?.owner?.id,r?.created_by,r?.creator_id].filter(Boolean).some(x=>String(x)===me)}

  async function openName(){
    const r=await getRoom(),id=roomId(),name=document.getElementById('erisLiveTitle')?.textContent||r?.name||'Oda';
    if(!isOwner(r)){window.toast?.('Oda adını yalnızca oda sahibi değiştirebilir.');return}
    const p=panel(surface());p.classList.add('show');p.querySelector('.room-v3-tabs').style.display='none';p.querySelectorAll('.room-v3-tab').forEach(x=>x.classList.remove('active'));
    p.querySelector('#roomV3Title').textContent='Oda adı';p.querySelector('#roomV3Body').innerHTML='<input id="roomV3Name" class="room-v3-input" maxlength="40" value="'+esc(name)+'" placeholder="Oda adı"><button class="room-v3-save" id="roomV3NameSave">Kaydet</button><div class="room-v3-note">Oda adı sadece oda sahibi tarafından değiştirilebilir.</div>';
  }

  function levelRows(r,level){const raw=Array.isArray(r?.level_rewards)?r.level_rewards:[];if(raw.length)return raw;return Array.from({length:8},(_,i)=>{const n=i+1,cap=n>=7?16:n>=5?12:8;return{level:n,threshold:Number((r?.level_thresholds||[])[i]||0),reward:LEVEL_REWARDS[n]||('Oda ayrıcalıkları • '+cap+' koltuk')}})}
  async function openLevels(){
    const r=await getRoom(),level=Math.max(1,Number(r?.level||1)),cap=Number(r?.seat_count||r?.capacity||(level>=7?16:level>=5?12:8));
    const progress=Math.max(0,Number(r?.level_progress??r?.progress??0)),next=Math.max(0,Number(r?.next_level_threshold??r?.next_level_cost??0)),pct=next?Math.min(100,Math.max(0,progress/next*100)):0;
    const rows=levelRows(r,level).map(item=>{
      const n=Math.max(1,Number(item.level||1)),cur=n===level,done=n<level,need=Number(item.threshold||item.required||0),reward=String(item.reward||item.rewards||'Oda ayrıcalıkları');
      const state=done?'Tamamlandı':cur?'Mevcut seviye':'Kilitli';
      return '<div class="room-v3-level '+(cur?'current':'')+'"><div class="room-v3-levelline"><div class="room-v3-levelnum">'+n+'</div><div class="room-v3-levelmain"><b>Seviye '+n+'</b><small>'+(need?need.toLocaleString('tr-TR')+' Lidya eşiği':state)+'</small></div><span class="room-v3-levelstate" aria-label="'+state+'">'+(done?'✓':cur?'●':'🔒')+'</span></div><div class="room-v3-note">'+esc(reward)+'</div></div>';
    }).join('');
    const progressBlock=next?'<div class="room-v3-progress"><i style="width:'+pct+'%"></i></div><div class="room-v3-summary-meta">'+progress.toLocaleString('tr-TR')+' / '+next.toLocaleString('tr-TR')+' Lidya • sonraki seviyeye '+Math.max(0,next-progress).toLocaleString('tr-TR')+' kaldı</div>':'<div class="room-v3-summary-meta">Seviye ilerleme bilgisi sunucuda henüz tanımlı değil.</div>';
    const p=panel(surface());p.classList.add('show');p.querySelector('.room-v3-tabs').style.display='none';p.querySelectorAll('.room-v3-tab').forEach(x=>x.classList.remove('active'));p.querySelector('#roomV3Title').textContent='Oda gelişimi';
    p.querySelector('#roomV3Body').innerHTML='<div class="room-v3-summary"><div class="room-v3-summary-top"><div><div class="room-v3-summary-title">Seviye '+level+'</div><div class="room-v3-summary-meta">'+cap+' koltuk • '+Number(r?.member_count||r?.members_count||0)+' katılımcı</div></div><span class="room-v3-levelnum">'+level+'</span></div>'+progressBlock+'</div><div class="room-v3-note" style="margin:0 0 10px">Seviye ödülleri ve açılacak oda özellikleri</div>'+rows;
  }

  async function info(body,r){const level=Number(r?.level||1),cap=Number(r?.seat_count||r?.capacity||(level>=7?16:level>=5?12:8)),members=Number(r?.member_count||r?.members_count||0),publicId=/^\d{12}$/.test(String(r?.public_id||''))?String(r.public_id):'yüklenemedi';body.innerHTML='<div class="room-v3-card"><b>🏠 '+esc(r?.name||document.getElementById('erisLiveTitle')?.textContent||'Oda')+'</b><small>ID: '+publicId+'</small></div><div class="room-v3-card"><b>Seviye '+level+'</b><small>'+members+' kişi • '+cap+' koltuk • '+(r?.locked?'🔒 Kilitli':'🟢 Açık')+'</small></div><div class="room-v3-grid"><button class="room-v3-btn" data-announcements>📢 Duyurular</button><button class="room-v3-btn" data-room-games>🎮 Oda oyunları</button></div>';body.querySelector('[data-announcements]').onclick=()=>window.ErisRoomAnnouncements?.open?.();body.querySelector('[data-room-games]').onclick=()=>window.ErisChatGames?.open?.('room',r.id||roomId())}
  async function users(body,r){const seats=Array.isArray(r?.seats)?r.seats:[],rows=seats.filter(x=>x.user_id),mods=new Set((r?.moderators||[]).map(String)),owner=isOwner(r),staff=!!(owner||r?.is_moderator);body.innerHTML='<div class="room-v3-note">'+rows.length+' kullanıcı koltukta • '+mods.size+'/'+Number(r?.max_moderators||0)+' moderatör.</div>'+ (rows.length?rows.map(x=>{const uid=String(x.user_id),mod=mods.has(uid),nm=esc(x.nickname||x.user_name||uid);return '<div class="room-v3-card" data-user="'+esc(uid)+'"><b>'+nm+'</b><small>Koltuk '+Number(x.seat_number||0)+' • '+(x.muted?'🔇 Susturuldu':'🎙️ Mikrofon açık')+(mod?' • 🛡️ Moderatör':'')+'</small>'+(staff?'<div class="room-v3-grid" style="margin-top:6px">'+(owner?'<button class="room-v3-btn" data-mod="'+uid+'">'+(mod?'Moderatorsüz yap':'Moderatör yap')+'</button>':'')+'<button class="room-v3-btn" data-kick="'+uid+'">Odadan at</button></div>':'')+'</div>'}).join(''):'<div class="room-v3-card"><small>Koltuklarda kullanıcı yok.</small></div>');body.querySelectorAll('[data-mod]').forEach(b=>b.onclick=async()=>{try{const uid=b.dataset.mod;if(mods.has(uid))await roomApi().removeModerator?.(roomId(),uid);else await roomApi().addModerator?.(roomId(),uid);openMenu('users')}catch(e){window.toast?.(e.message||'Moderatör işlemi reddedildi')}});body.querySelectorAll('[data-kick]').forEach(b=>b.onclick=async()=>{try{await roomApi().ban?.(roomId(),b.dataset.kick);openMenu('users')}catch(e){window.toast?.(e.message||'Kullanıcı atılamadı')}})}
  async function gifts(body,r){
    const id=r?.id||roomId(),rows=Array.isArray(r?.seats)?r.seats.filter(x=>x.user_id):[];
    let data=[];try{data=await roomApi().giftCatalog?.(id)||[]}catch(e){}
    const gs=Array.isArray(data)?data:(data?.items||data?.gifts||[]);
    body.innerHTML='<div class="room-v3-card"><b>🎁 Hediye gönder</b><small>200+ oda hediyesi • alıcı seç, hediyeyi seç ve gönder.</small></div><select id="roomGiftRecipient" class="room-v3-input" style="margin-bottom:7px"><option value="">Alıcı seç</option>'+rows.map(x=>'<option value="'+esc(x.user_id)+'">'+esc(x.nickname||x.user_name||x.user_id)+'</option>').join('')+'</select><input id="roomGiftSearch" class="room-v3-input" placeholder="Hediye ara..." style="margin-bottom:7px"><div id="roomV3GiftCount" class="room-v3-note"></div><div class="room-v3-grid" id="roomV3Gifts"></div>';
    const g=body.querySelector('#roomV3Gifts'),search=body.querySelector('#roomGiftSearch'),recipient=body.querySelector('#roomGiftRecipient'),count=body.querySelector('#roomV3GiftCount');
    if(!gs.length){g.innerHTML='<div class="room-v3-card"><small>Hediye kataloğu alınamadı. Gerçek odaya bağlı ve giriş yapmış olmalısın.</small></div>';return}
    const draw=()=>{const q=search.value.trim().toLocaleLowerCase('tr-TR');const list=gs.filter(x=>!q||String(x.name||x.title||x.gift_key||x.key||'').toLocaleLowerCase('tr-TR').includes(q));count.textContent=list.length+' / '+gs.length+' hediye';g.innerHTML='';list.forEach(x=>{const key=x.gift_key||x.key||x.name||x.title,price=Number(x.unit_price??x.price??x.cost??0);const b=document.createElement('button');b.className='room-v3-card';b.innerHTML='<b>'+esc(x.emoji||x.icon||'🎁')+' '+esc(x.name||x.title||key)+'</b><small>'+price.toLocaleString('tr-TR')+' Lidya • animasyon '+(x.animation?'✓':'—')+'</small>';b.onclick=async()=>{const to=recipient.value;if(!to){window.toast?.('Önce alıcı seç.');return}try{const result=await roomApi().sendGift?.(id,to,key,1);if(!result)throw new Error('Hediye gönderilemedi');window.toast?.('🎁 '+(x.name||key)+' gönderildi ✓')}catch(e){window.toast?.(e.message||'Hediye gönderilemedi')}};g.appendChild(b)})};
    search.oninput=draw;draw();
  }
  async function music(body,r){
    const id=r?.id||roomId();let data=[];
    try{data=await roomApi().music?.(id)||[]}catch(e){}
    const rows=Array.isArray(data)?data:(data?.items||data?.music||[]);
    body.innerHTML='<div class="room-v3-card"><b>🎵 Oda müziği</b><small>Telefonundan parça seçebilir, oynatabilir ve listeden kaldırabilirsin. Oda kuyruğuna eklenen URL parçaları yetki/ücret kurallarına tabidir.</small><button class="room-v3-btn primary" id="roomMusicOpen" style="margin-top:7px;width:100%">🎵 Müzik panelini aç</button></div>'+ (rows.length?rows.map(x=>'<div class="room-v3-card"><b>'+esc(x.title||'Müzik')+'</b><small>'+(x.is_playing?'▶ Oynuyor':'⏸ Bekliyor')+'</small></div>').join(''):'<div class="room-v3-card"><small>Sunucu kuyruğu boş. Telefon müziği bu cihazda ayrıca test edilebilir.</small></div>');
    body.querySelector('#roomMusicOpen')?.addEventListener('click',()=>window.ErisChatMusic?.open?.());
  }
  async function settings(body,r){const owner=isOwner(r),staff=!!(owner||r?.is_moderator);body.innerHTML='<div class="room-v3-card"><b>⚙️ Oda ayarları</b><small>'+(r?.locked?'🔒 Oda kilitli':'🟢 Oda açık')+' • '+(r?.chat_enabled===false?'Sohbet kapalı':'Sohbet açık')+'</small></div>'+(staff?'<div class="room-v3-grid"><button class="room-v3-btn" id="roomV3Lock">'+(r?.locked?'Kilidi aç':'Odayı kilitle')+'</button><button class="room-v3-btn" id="roomV3Chat">'+(r?.chat_enabled===false?'Sohbeti aç':'Sohbeti kapat')+'</button></div>':'<div class="room-v3-note">Yönetim işlemleri yalnızca oda sahibi veya atanmış moderatör tarafından kullanılabilir.</div>')+(owner?'<div class="room-v3-card" style="margin-top:7px"><b>👑 Oda sahibi</b><small>Oda adı ve gelişmiş kontroller sana ait.</small><button class="room-v3-btn primary" id="roomV3Rename" style="margin-top:7px">Oda adını değiştir</button></div>':'');
    body.querySelector('#roomV3Rename')?.addEventListener('click',openName);
    body.querySelector('#roomV3Lock')?.addEventListener('click',async()=>{try{if(r?.locked)await roomApi().unlock(r.id);else await roomApi().lock(r.id);window.toast?.('Oda durumu güncellendi ✓');openMenu('settings')}catch(e){window.toast?.(e.message||'İşlem başarısız')}})
    body.querySelector('#roomV3Chat')?.addEventListener('click',async()=>{try{await roomApi().setChat(r.id,r?.chat_enabled===false);window.toast?.('Sohbet ayarı güncellendi ✓');openMenu('settings')}catch(e){window.toast?.(e.message||'İşlem başarısız')}})
  }

  async function openMenu(tab){
    const s=surface();if(!s)return;css();top(s);gift(s);const p=panel(s);p.classList.add('show');
    const r=await getRoom();
    const canManage=!!(r.is_owner||r.is_moderator||r.can_manage);
    const settingsTab=p.querySelector('.room-v3-tab[data-tab="settings"]');
    if(settingsTab) settingsTab.style.display=canManage?'':'none';
    if(tab==='settings'&&!canManage) tab='info';
    p.querySelector('.room-v3-tabs').style.display='';
    p.querySelectorAll('.room-v3-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    p.querySelector('#roomV3Title').textContent={info:'Oda bilgisi',users:'Kullanıcılar',gifts:'Hediyeler',music:'Müzik',settings:'Oda ayarları'}[tab]||'Oda';
    const body=p.querySelector('#roomV3Body');body.innerHTML='<div class="room-v3-note">Yükleniyor…</div>';
    if(tab==='info')await info(body,r);else if(tab==='users')await users(body,r);else if(tab==='gifts')await gifts(body,r);else if(tab==='music')await music(body,r);else await settings(body,r)
  }

  function bind(){
    const s=surface();if(!s)return;css();top(s);gift(s);panel(s);
    const title=s.querySelector('.eris-room-title');if(title&&title.dataset.roomV3!=='1'){title.dataset.roomV3='1';title.onclick=openName}
  }
  const boot=()=>bind();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('erischat:room-opened',()=>setTimeout(bind,0));
  window.ErisRoomCompleteV3={openMenu,openName,openLevels};
})();
/* Room UI v5 — single in-room controls, working demo capacity/theme controls. */
(() => {
  const root=()=>document.getElementById('erisRoomSurface');
  const q=s=>document.getElementById(s);
  const rid=()=>String(window.ErisCurrentRoomId||window.currentRoomId||'');

  function css(){
    if(q('eris-room-v5-css')) return;
    const x=document.createElement('style'); x.id='eris-room-v5-css';
    x.textContent=[
      '#erisRoomSurface .eris-room-top{height:64px!important;min-height:64px!important;padding:7px 8px!important;gap:5px!important;box-sizing:border-box!important;overflow:hidden!important}',
      '#erisRoomSurface .eris-room-title{flex:1 1 auto!important;max-width:calc(100% - 164px)!important;min-width:0!important;overflow:hidden!important}',
      '#erisRoomSurface .eris-room-title b,#erisRoomSurface .eris-room-title small{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
      '#erisRoomSurface .eris-room-title b{font-size:13px!important}',
      '#erisRoomSurface .eris-room-title small{font-size:7px!important}',
      '#erisRoomSurface #erisRoomLevel{position:static!important;transform:none!important;flex:0 0 76px!important;width:76px!important;min-width:76px!important;height:40px!important;padding:2px 4px!important;box-sizing:border-box!important}',
      '#erisRoomSurface .room-v5-topbtn{width:34px!important;height:34px!important;min-width:34px!important;flex:0 0 34px!important;border-radius:10px!important;font-size:13px!important;padding:0!important}',
      '#erisRoomSurface #erisRoomMoreTop{margin-left:auto!important}',
      '#erisRoomSurface .eris-room-tools{display:none!important}',
      '#erisRoomSurface .eris-room-compose{align-items:center!important;gap:6px!important}',
      '#erisRoomSurface #erisRoomMicInline{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;min-width:42px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:13px!important;background:rgba(255,255,255,.07)!important;color:#fff!important;padding:0!important}',
      '#erisRoomSurface #erisRoomMicInline.on{background:linear-gradient(135deg,#754cff,#ff4fa3)!important}',
      '#erisRoomSurface #erisRoomGiftInline{width:42px!important;height:42px!important;min-width:42px!important;padding:0!important}',
      '#erisRoomSurface .room-v3-panel{top:70px!important;bottom:204px!important}',
      '#erisRoomSurface .room-v5-panel{display:none;position:absolute;inset:0;z-index:190;place-items:center;padding:max(14px,env(safe-area-inset-top)) 12px max(14px,env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(3,2,8,.68);backdrop-filter:blur(7px)}',
      '#erisRoomSurface .room-v5-panel.show{display:grid}#erisRoomSurface .room-v5-dialog{width:min(540px,100%);max-height:min(760px,88dvh);overflow:auto;border:1px solid rgba(255,255,255,.16);border-radius:24px;background:linear-gradient(155deg,#14111b,#0b0910);padding:18px;box-sizing:border-box;box-shadow:0 24px 80px rgba(0,0,0,.58)}',
      '#erisRoomSurface .v5-title{font-size:18px;font-weight:750;letter-spacing:-.2px;margin:0 0 5px;display:flex;justify-content:space-between;align-items:center}#erisRoomSurface .v5-subtitle{font-size:12px;color:#a8a0af;margin-bottom:16px;line-height:1.45}',
      '#erisRoomSurface .v5-card{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.04);border-radius:15px;padding:14px;margin-bottom:9px}',
      '#erisRoomSurface .v5-row{display:flex;align-items:center;gap:10px;justify-content:space-between}',
      '#erisRoomSurface .v5-row b{font-size:14px}.v5-row small{font-size:12px;color:#aaa0b2}',
      '#erisRoomSurface .v5-btn{min-height:44px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(255,255,255,.055);color:#fff;font-size:13px;font-weight:600;padding:0 14px}',
      '#erisRoomSurface .v5-btn.primary{background:#754cff;border-color:#9b76ff}',
      '#erisRoomSurface .v5-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
      '#erisRoomSurface .v5-item{min-height:86px;width:100%;display:flex;align-items:center;gap:11px;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:15px;background:rgba(255,255,255,.04);color:#fff;padding:12px;transition:background .15s,border-color .15s}.v5-item:hover{background:rgba(255,255,255,.08);border-color:rgba(155,118,255,.52)}.v5-icon{width:38px;height:38px;flex:none;display:grid;place-items:center;border-radius:12px;background:rgba(138,92,255,.15);font-size:17px}.v5-item-copy{flex:1;min-width:0}.v5-item-copy b{display:block;font-size:13px}.v5-item-copy small{display:block;color:#a9a0b0;font-size:11px;line-height:1.35;margin-top:4px}.v5-chevron{color:#8f8798;font-size:20px}',
      '#erisRoomSurface .v5-note{font-size:12px;color:#aaa0b2;line-height:1.5}',
      '@media(max-width:520px){#erisRoomSurface .eris-room-top{padding:6px!important}#erisRoomSurface .eris-room-title{max-width:calc(100% - 142px)!important}#erisRoomSurface #erisRoomLevel{flex-basis:70px!important;width:70px!important;min-width:70px!important}.room-v5-topbtn{width:32px!important;min-width:32px!important;flex-basis:32px!important}}'
    ].join('');
    document.head.appendChild(x);
  }

  function panel(){
    const s=root(); if(!s) return null;
    let overlay=s.querySelector('.room-v5-panel');
    if(!overlay){overlay=document.createElement('div');overlay.className='room-v5-panel';overlay.innerHTML='<section class="room-v5-dialog" role="dialog" aria-modal="true" aria-label="Oda menüsü"></section>';overlay.addEventListener('click',event=>{if(event.target===overlay)closePanels()});s.appendChild(overlay);}
    return overlay.querySelector('.room-v5-dialog');
  }

  function closePanels(){
    root()?.querySelectorAll('.room-v5-panel,.room-v3-panel').forEach(p=>p.classList.remove('show'));
  }

  function top(){
    const s=root(),h=s?.querySelector('.eris-room-top'); if(!h)return;
    let lv=h.querySelector('#erisRoomLevel');
    if(!lv){lv=document.createElement('button');lv.id='erisRoomLevel';lv.className='room-v5-topbtn';lv.innerHTML='<b>Seviye</b><small>Oda bilgisi</small>';lv.title='Oda seviyesi';h.appendChild(lv);}
    lv.onclick=()=>window.ErisRoomCompleteV3?.openLevels?.();
    let more=h.querySelector('#erisRoomMoreTop');
    if(!more){more=document.createElement('button');more.id='erisRoomMoreTop';more.className='room-v5-topbtn';more.textContent='⋯';more.title='Oda menüsü';h.appendChild(more);}
    more.onclick=menu;
    let leave=h.querySelector('#erisRoomLeaveTop');
    if(!leave){leave=document.createElement('button');leave.id='erisRoomLeaveTop';leave.className='room-v5-topbtn';leave.textContent='↪';leave.title='Odadan çık';h.appendChild(leave);}
    leave.onclick=()=>window.closeRealRoom?.();
    syncHeader();
  }

  function syncManagementHeader(r){
    const can=!!(r?.is_owner||r?.is_moderator||r?.can_manage);
    const b=document.getElementById('erisRoomMoreTop');
    if(b){b.style.display=can?'':'none';b.setAttribute('aria-hidden',can?'false':'true');}
    const tab=root()?.querySelector('.room-v3-tab[data-management-tab]');
    if(tab)tab.style.display=can?'':'none';
  }

  async function syncHeader(){
    const lv=q('erisRoomLevel'); try{const r=await roomApi().get?.(rid())||{}; lv.innerHTML='<b>Seviye '+Number(r.level||1)+'</b><small>'+Number(r.seat_count||8)+' koltuk</small>'; lv.onclick=()=>window.ErisRoomCompleteV3?.openLevels?.();paintTheme(r.theme||'normal');syncManagementHeader(r);}catch{syncManagementHeader(window.__erisRoomPermissions||{});};
  }

  async function menu(){
    closePanels();
    const p=panel(); if(!p)return;
    const r=await roomApi().get?.(rid()).catch(()=>({}))||{};
    const canManage=!!(r.is_owner||r.is_moderator||r.can_manage);
    const items=[['info','⌂','Oda bilgileri','Oda kimliği, duyurular ve oyunlar'],['users','♙','Katılımcılar','Koltukları ve oda üyelerini gör'],['gifts','◇','Hediyeler','Odada hediye gönder'],['music','♫','Oda müziği','Paylaşılan müzik kuyruğunu yönet']];
    if(canManage)items.push(['settings','⚙','Oda yönetimi','Sohbet ve güvenlik ayarları']);
    if(isOwner(r))items.push(['theme','◈','Oda görünümü','Odanın temasını düzenle']);
    p.innerHTML='<div class="v5-title">Oda menüsü <button type="button" class="v5-btn" data-close aria-label="Menüyü kapat">Kapat</button></div><div class="v5-subtitle">Oda araçlarına ve yönetim ayarlarına buradan eriş.</div><div class="v5-grid">'+items.map(([key,icon,title,description])=>'<button type="button" class="v5-item" data-v5="'+key+'"><span class="v5-icon" aria-hidden="true">'+icon+'</span><span class="v5-item-copy"><b>'+title+'</b><small>'+description+'</small></span><span class="v5-chevron" aria-hidden="true">›</span></button>').join('')+'</div>';
    p.closest('.room-v5-panel').classList.add('show');
    p.querySelector('[data-close]').onclick=()=>p.closest('.room-v5-panel').classList.remove('show');
    p.querySelectorAll('[data-v5]').forEach(b=>b.onclick=()=>{
      const t=b.dataset.v5;
      if(t==='theme' && !isOwner(r)) return;
      if(t==='settings' && !canManage) return;
      closePanels();
      window.ErisRoomCompleteV3?.openMenu?.(t);
    });
  }

  async function theme(){
    const p=panel();if(!p)return;
    const r=await getRoom(),active=r.theme==='vip'?'vip':'normal';
    const options=[['normal','Standart','ErisChat gece arayüzünü kullan'],['vip','VIP altın','Odaya altın vurgu rengi uygula']];
    p.innerHTML='<div class="v5-title">Oda görünümü <button type="button" class="v5-btn" data-close>Geri</button></div><div class="v5-subtitle">Oda temasını kaydet. Değişiklik odayı yeniden açan üyelerde de görünür.</div>'+options.map(([key,title,description])=>'<div class="v5-card"><div class="v5-row"><div><b>'+title+(active===key?' • Etkin':'')+'</b><div class="v5-note" style="margin-top:5px">'+description+'</div></div><button type="button" class="v5-btn '+(active===key?'primary':'')+'" data-theme="'+key+'">'+(active===key?'Etkin':'Uygula')+'</button></div></div>').join('');
    p.closest('.room-v5-panel').classList.add('show');
    p.querySelector('[data-close]').onclick=menu;
    p.querySelectorAll('[data-theme]').forEach(b=>b.onclick=async()=>{b.disabled=true;await applyTheme(b.dataset.theme);await theme()});
  }

  function paintTheme(theme){
    const s=root();if(!s)return;
    const wall=s.querySelector('.eris-room-wall');
    const themes={normal:{a:'#8a5cff',b:'#4f46e5',g:'#c4b5fd'},vip:{a:'#ffd166',b:'#b7791f',g:'#ffe7a3'}};
    const t=themes[theme]||themes.normal;
    s.style.setProperty('--room-accent',t.a);s.style.setProperty('--room-secondary',t.b);s.style.setProperty('--room-gold',t.g);
    if(wall)wall.style.filter=theme==='vip'?'saturate(1.12) sepia(.16)':'none';
    try{localStorage.setItem('eris_room_theme_'+rid(),theme)}catch{}
  }
  async function applyTheme(theme){
    if(!['normal','vip'].includes(theme))return;
    try{await roomApi().setTheme?.(rid(),theme);paintTheme(theme);window.toast?.('Oda görünümü kaydedildi ✓')}
    catch(error){window.toast?.(error.message||'Oda görünümü kaydedilemedi')}
  }
  async function setCapacity(value){
    const n=Number(value);
    if(![8,12,16].includes(n)){
      window.toast?.('Koltuk sayısı 8, 12 veya 16 olabilir.');
      return;
    }
    try{
      await roomApi().setCapacity?.(rid(),n);
      window.toast?.(n+' koltuk kapasitesi kaydedildi ✓');
      window.openRoom?.(rid(),q('erisLiveTitle')?.textContent||'Oda');
    }catch(e){
      window.toast?.(e.message||'Kapasite değiştirilemedi');
    }
  }
  function mic(){
    const s=root(),c=s?.querySelector('.eris-room-compose');if(!s||!c)return;
    if(c.querySelector('#erisRoomMicInline'))return;
    const old=q('erisRoomMic');
    old?.remove();
    const b=document.createElement('button');b.id='erisRoomMicInline';b.type='button';b.textContent='🎙️';b.title='Mikrofonu aç/kapat';b.setAttribute('aria-label','Mikrofonu aç/kapat');
    b.onclick=()=>window.ErisRoomRTC?.toggle?.();
    const send=q('erisLiveSend');
    c.insertBefore(b,send||null);
  }

  function seatMenu(seat){
    document.getElementById('eris-seat-actions')?.remove();
    const id=roomId(),number=Number(seat.dataset.seatNumber),target=String(seat.dataset.userId||''),me=target&&target===userId();
    const permissions=window.__erisRoomPermissions||{},canManage=!!(permissions.is_owner||permissions.is_moderator||permissions.can_manage);
    const wrap=document.createElement('div');wrap.id='eris-seat-actions';wrap.setAttribute('role','presentation');
    wrap.innerHTML='<style>#eris-seat-actions{position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-end;justify-content:center;padding:16px 12px calc(16px + env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(3,2,8,.66);backdrop-filter:blur(7px)}#eris-seat-actions .esa-card{width:min(440px,100%);background:linear-gradient(160deg,#1a1424,#0d0a12);border:1px solid #ffffff20;border-radius:22px;padding:18px;box-shadow:0 24px 80px #000b;color:#fff;font:14px system-ui;max-height:75vh;overflow:auto}#eris-seat-actions .esa-head{display:flex;align-items:center;gap:12px;margin-bottom:14px}#eris-seat-actions .esa-logo{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(140deg,#754cff,#ff4fa3);font-size:21px}#eris-seat-actions .esa-title{font-weight:750;font-size:16px}#eris-seat-actions .esa-sub{font-size:12px;color:#aa9fb4;margin-top:3px}#eris-seat-actions .esa-actions{display:grid;gap:8px}#eris-seat-actions button{min-height:46px;border:1px solid #ffffff19;border-radius:14px;background:#ffffff09;color:#fff;text-align:left;padding:0 14px;font:600 14px system-ui}#eris-seat-actions button:active{transform:scale(.99)}#eris-seat-actions button.danger{background:#ed4c7417;border-color:#ed4c7440;color:#ffadc1}#eris-seat-actions button.primary{background:linear-gradient(120deg,#754cff,#d244ac);border:0}#eris-seat-actions button.close{color:#b9afc2;text-align:center;background:transparent;border:0;min-height:40px}</style><section class="esa-card" role="dialog" aria-modal="true" aria-label="Koltuk seçenekleri"><div class="esa-head"><div class="esa-logo">'+(me?'◉':'♙')+'</div><div><div class="esa-title">'+(me?'Koltuk '+number:'Koltuk '+number+' • kullanıcı')+'</div><div class="esa-sub">'+(me?'Bu koltukta oturuyorsun':'Koltuk işlemleri')+'</div></div></div><div class="esa-actions"></div><button class="close" data-close>Kapat</button></section>';
    document.body.append(wrap);
    const actions=wrap.querySelector('.esa-actions');
    const add=(label,kind,run)=>{const button=document.createElement('button');button.type='button';button.className=kind||'';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await run();wrap.remove()}catch(error){window.toast?.(error.message||'İşlem tamamlanamadı');button.disabled=false}};actions.append(button)};
    if(me){
      add('Koltuktan kalk','danger',async()=>{await roomApi().leaveSeat?.(id);await window.openRoom?.(id,document.getElementById('erisLiveTitle')?.textContent||'Oda')});
      add('Mikrofonu aç / kapat','',async()=>{await window.ErisRoomRTC?.toggle?.()});
    }else{
      add('Profili görüntüle','primary',()=>window.openUserProfile?.(target));
      if(canManage)add(seat.dataset.muted==='true'?'Mikrofon sesini aç':'Mikrofonu sustur','',async()=>{if(seat.dataset.muted==='true')await roomApi().unmuteSeat?.(id,number);else await roomApi().muteSeat?.(id,number);await window.openRoom?.(id,document.getElementById('erisLiveTitle')?.textContent||'Oda')});
    }
    wrap.querySelector('[data-close]').onclick=()=>wrap.remove();wrap.addEventListener('click',event=>{if(event.target===wrap)wrap.remove()});
    const escape=event=>{if(event.key==='Escape'){wrap.remove();document.removeEventListener('keydown',escape)}};document.addEventListener('keydown',escape);
    wrap.querySelector('button:not(.close)')?.focus();
  }

  function seatActions(){
    const s=surface();if(!s)return;
    const stage=s.querySelector('#erisLiveSeats');if(!stage||stage.dataset.seatActions==='1')return;
    stage.dataset.seatActions='1';
    let timer=0,longPressed=false;
    stage.addEventListener('pointerdown',event=>{
      const seat=event.target.closest('.eris-seat');if(!seat||!seat.classList.contains('occupied'))return;
      longPressed=false;
      timer=window.setTimeout(()=>{longPressed=true;seatMenu(seat)},420);
    });
    const clear=()=>{window.clearTimeout(timer);timer=0};
    stage.addEventListener('pointerup',clear);stage.addEventListener('pointercancel',clear);stage.addEventListener('pointerleave',clear);
    stage.addEventListener('contextmenu',event=>{if(event.target.closest('.eris-seat.occupied'))event.preventDefault()});
    stage.addEventListener('click',event=>{
      const seat=event.target.closest('.eris-seat');if(!seat)return;
      if(longPressed){event.preventDefault();event.stopImmediatePropagation();longPressed=false;return}
      if(!seat.classList.contains('occupied'))return;
      if(seat.classList.contains('me')){event.preventDefault();event.stopImmediatePropagation();seatMenu(seat)}
    },true);
  }

  function passwordModal(title='Odaya giriş şifresi'){
    return new Promise(resolve=>{
      document.getElementById('eris-room-password-modal')?.remove();
      const wrap=document.createElement('div');wrap.id='eris-room-password-modal';
      wrap.innerHTML='<div class="erp-backdrop"></div><div class="erp-box"><button class="erp-x" aria-label="Kapat">×</button><div class="erp-title">🔒 '+esc(title)+'</div><div class="erp-sub">4 haneli oda şifresini gir</div><div class="erp-cells"><input maxlength="1" inputmode="numeric" autocomplete="one-time-code" class="erp-cell"><input maxlength="1" inputmode="numeric" class="erp-cell"><input maxlength="1" inputmode="numeric" class="erp-cell"><input maxlength="1" inputmode="numeric" class="erp-cell"></div><div class="erp-error"></div><button class="erp-ok">Tamam</button></div>';
      const st=document.createElement('style');st.textContent='#eris-room-password-modal{position:fixed;inset:0;z-index:6000;display:grid;place-items:center}.erp-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.58);backdrop-filter:blur(8px)}.erp-box{position:relative;width:min(330px,calc(100% - 40px));box-sizing:border-box;padding:20px;border-radius:18px;background:rgba(72,72,78,.94);border:1px solid rgba(255,255,255,.18);box-shadow:0 24px 80px #000b;text-align:center}.erp-x{position:absolute;right:9px;top:8px;width:30px;height:30px;border:0;border-radius:9px;background:rgba(255,255,255,.08);color:#fff;font-size:20px}.erp-title{font-size:14px;font-weight:900;color:#fff}.erp-sub{margin-top:6px;font-size:9px;color:#d5d1d8}.erp-cells{display:flex;justify-content:center;gap:8px;margin:18px 0}.erp-cell{width:48px;height:52px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;text-align:center;font-size:24px;outline:none}.erp-cell:focus{border-color:#ff5bad}.erp-error{min-height:18px;color:#ff9dbd;font-size:9px}.erp-ok{width:100%;height:42px;border:0;border-radius:12px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:900}.erp-backdrop{cursor:pointer}';wrap.appendChild(st);document.body.appendChild(wrap);
      const cells=[...wrap.querySelectorAll('.erp-cell')],err=wrap.querySelector('.erp-error');let done=false;
      const finish=v=>{if(done)return;done=true;wrap.remove();resolve(v)};
      wrap.querySelector('.erp-x').onclick=()=>finish(null);wrap.querySelector('.erp-backdrop').onclick=()=>finish(null);
      cells.forEach((c,i)=>{c.oninput=()=>{c.value=c.value.replace(/\D/g,'').slice(0,1);if(c.value&&cells[i+1])cells[i+1].focus();};c.onkeydown=e=>{if(e.key==='Backspace'&&!c.value&&cells[i-1])cells[i-1].focus();if(e.key==='Enter')wrap.querySelector('.erp-ok').click()}});
      wrap.querySelector('.erp-ok').onclick=()=>{const v=cells.map(x=>x.value).join('');if(!/^\d{4}$/.test(v)){err.textContent='4 haneli şifreyi tamamla.';return}finish(v)};
      cells[0].focus();
    });
  }
  window.ErisRoomPasswordModal=passwordModal;

  function bind(){
    if(!root())return;
    css();top();mic();seatActions();syncHeader();
    const saved=localStorage.getItem('eris_room_theme_'+rid());
    if(saved)paintTheme(saved);
  }
  const boot=()=>bind();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('erischat:room-opened',()=>setTimeout(bind,0));
})();
