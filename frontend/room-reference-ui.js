(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const surface = () => document.getElementById('erisRoomSurface');
  const roomId = () => String(window.ErisCurrentRoomId || window.currentRoomId || '');
  const userId = () => String(window.ErisCurrentUserId || localStorage.getItem('eris_user_id') || '');
  const roomApi = () => window.ErisRoom || {};

  const LEVEL_REWARDS = {
    1:'Temel oda • 16 koltuk',
    2:'Yeni oda rozetleri ve görsel ayrıcalıklar',
    3:'Yeni oda görseli / emoji ayrıcalıkları',
    4:'Yeni oda görsel ayrıcalıkları',
    5:'20 koltuk kapasitesi açılır',
    6:'Yeni oda görsel ve sosyal ayrıcalıkları',
    7:'24 koltuk kapasitesi açılır',
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
    p.innerHTML='<div class="room-v3-dialog"><div class="room-v3-eyebrow">ERISCHAT • ODA MERKEZİ</div><div class="room-v3-head"><button type="button" class="room-v3-back" aria-label="Oda merkezine dön">‹</button><strong id="roomV3Title">Oda</strong><button class="room-v3-close" aria-label="Kapat">×</button></div><div class="room-v3-tabs" role="tablist"><button class="room-v3-tab active" data-tab="info">Oda</button><button class="room-v3-tab" data-tab="users">Kullanıcılar</button><button class="room-v3-tab" data-tab="gifts">Hediyeler</button><button class="room-v3-tab" data-tab="music">Müzik</button><button class="room-v3-tab" data-tab="staff" data-staff-tab="1">Yetkililer</button><button class="room-v3-tab" data-tab="guests" data-staff-tab="1">Misafirler</button><button class="room-v3-tab" data-tab="bans" data-staff-tab="1">Atılanlar</button><button class="room-v3-tab" data-tab="mutes" data-staff-tab="1">Chatte susturulanlar</button><button class="room-v3-tab" data-tab="moderators" data-owner-tab="1">Moderatörler</button><button class="room-v3-tab" data-tab="promote" data-owner-tab="1">Moderatör yap</button><button class="room-v3-tab" data-tab="settings" data-management-tab="1">Ayarlar</button></div><div class="room-v3-body" id="roomV3Body"></div></div>';
    s.appendChild(p);
    p.querySelector('.room-v3-close').onclick=()=>p.classList.remove('show');
    p.querySelector('.room-v3-back').onclick=()=>window.ErisRoomCenterMenu?.();
    p.addEventListener('click',event=>{if(event.target===p)p.classList.remove('show')});
    const settingsTab=p.querySelector('[data-management-tab]'); if(settingsTab){const r=window.__erisRoomPermissions||{}; settingsTab.style.display=(r.is_owner||r.is_moderator||r.can_manage)?'':'none';}
    p.querySelectorAll('.room-v3-tab').forEach(b=>b.onclick=()=>openMenu(b.dataset.tab));
    return p;
  }

  function top(s){
    const h=s.querySelector('.eris-room-top');if(!h)return;
    if(!h.querySelector('#erisRoomLevel')){const b=document.createElement('button');b.id='erisRoomLevel';b.type='button';b.innerHTML='<b>Seviye 1</b><small>ilerleme</small>';b.onclick=openLevels;h.appendChild(b)}
    if(!h.querySelector('#erisRoomMoreTop')){const r=window.__erisRoomPermissions||{};const can=!!(r.is_owner||r.is_moderator||r.can_manage);if(can){const b=document.createElement('button');b.id='erisRoomMoreTop';b.type='button';b.className='room-v3-top-btn';b.textContent='•••';b.title='Oda menüsü';b.onclick=()=>window.ErisRoomCenterMenu?.();h.appendChild(b)}}
    if(!h.querySelector('#erisRoomLeaveTop')){const b=document.createElement('button');b.id='erisRoomLeaveTop';b.type='button';b.className='room-v3-top-btn';b.textContent='↪';b.title='Odadan çık';b.onclick=()=>window.closeRealRoom?.();h.appendChild(b)}
    
  }

  window.addEventListener('erischat:room-opened',()=>setTimeout(syncManagementUI,0));

  function gift(s){
    const c=s.querySelector('.eris-room-compose');if(!c||c.querySelector('#erisRoomGiftInline'))return;
    const b=document.createElement('button');b.id='erisRoomGiftInline';b.type='button';b.className='room-v3-gift';b.textContent='🎁';b.title='Hediye gönder';b.onclick=()=>window.openRoomGift?.(roomId());c.insertBefore(b,c.querySelector('#erisLiveSend')||null);
  }

  function syncManagementUI(){
    const s=surface(); if(!s)return;
    const r=window.__erisRoomPermissions||{}; const can=!!(r.is_owner||r.is_moderator||r.can_manage);
    const p=s.querySelector('.room-v3-panel'); const tab=p?.querySelector('[data-management-tab]'); if(tab)tab.style.display=can?'':'none';
    const h=s.querySelector('.eris-room-top'); if(!h)return;
    let b=h.querySelector('#erisRoomMoreTop');
    if(can && !b){b=document.createElement('button');b.id='erisRoomMoreTop';b.type='button';b.className='room-v3-top-btn';b.textContent='•••';b.title='Oda menüsü';b.onclick=()=>window.ErisRoomCenterMenu?.();h.appendChild(b)}
    if(b){b.style.display='';b.setAttribute('aria-hidden','false');}
  }

  async function getRoom(){const id=roomId();if(!id)return{};try{return await roomApi().get?.(id)||{}}catch(e){return{}}}
  function isOwner(r){if(r?.is_owner===true)return true;const me=userId();return !!me&&[r?.owner_id,r?.owner?.id,r?.created_by,r?.creator_id].filter(Boolean).some(x=>String(x)===me)}

  async function openName(){
    const r=await getRoom(),id=roomId(),name=document.getElementById('erisLiveTitle')?.textContent||r?.name||'Oda';
    if(!isOwner(r)){window.toast?.('Oda adını yalnızca oda sahibi değiştirebilir.');return}
    const p=panel(surface());p.classList.add('show');p.querySelector('.room-v3-tabs').style.display='none';p.querySelectorAll('.room-v3-tab').forEach(x=>x.classList.remove('active'));
    p.querySelector('#roomV3Title').textContent='Oda adı';p.querySelector('#roomV3Body').innerHTML='<input id="roomV3Name" class="room-v3-input" maxlength="40" value="'+esc(name)+'" placeholder="Oda adı"><button class="room-v3-save" id="roomV3NameSave">Kaydet</button><div class="room-v3-note">Oda adı sadece oda sahibi tarafından değiştirilebilir.</div>';
  }

  const seatsForLevel=level=>Number(level)>=7?24:Number(level)>=5?20:16;
  function levelRows(r,level){const raw=Array.isArray(r?.level_rewards)?r.level_rewards:[];if(raw.length)return raw;return Array.from({length:8},(_,i)=>{const n=i+1;return{level:n,threshold:Number((r?.level_thresholds||[])[i]||0),reward:LEVEL_REWARDS[n]||('Oda ayrıcalıkları • '+seatsForLevel(n)+' koltuk')}})}
  async function openLevels(){
    const r=await getRoom(),level=Math.max(1,Number(r?.level||1)),cap=Number(r?.seat_count||seatsForLevel(level));
    const progress=Math.max(0,Number(r?.level_progress??r?.progress??0)),next=Math.max(0,Number(r?.next_level_threshold??r?.next_level_cost??0)),pct=next?Math.min(100,Math.max(0,progress/next*100)):0;
    const rows=levelRows(r,level).map(item=>{
      const n=Math.max(1,Number(item.level||1)),cur=n===level,done=n<level,need=Number(item.threshold||item.required||0),reward=String(item.reward||item.rewards||'Oda ayrıcalıkları');
      const state=done?'Tamamlandı':cur?'Mevcut seviye':'Kilitli';
      return '<div class="room-v3-level '+(cur?'current':'')+'"><div class="room-v3-levelline"><div class="room-v3-levelnum">'+n+'</div><div class="room-v3-levelmain"><b>Seviye '+n+'</b><small>'+(need?need.toLocaleString('tr-TR')+' Lidya eşiği':state)+'</small></div><span class="room-v3-levelstate" aria-label="'+state+'">'+(done?'✓':cur?'●':'🔒')+'</span></div><div class="room-v3-note">'+esc(reward)+'</div></div>';
    }).join('');
    const progressBlock=next?'<div class="room-v3-progress"><i style="width:'+pct+'%"></i></div><div class="room-v3-summary-meta">'+progress.toLocaleString('tr-TR')+' / '+next.toLocaleString('tr-TR')+' Lidya • sonraki seviyeye '+Math.max(0,next-progress).toLocaleString('tr-TR')+' kaldı</div>':'<div class="room-v3-summary-meta">Seviye ilerleme bilgisi sunucuda henüz tanımlı değil.</div>';
    const p=panel(surface());p.classList.add('show');p.querySelector('.room-v3-tabs').style.display='none';p.querySelectorAll('.room-v3-tab').forEach(x=>x.classList.remove('active'));p.querySelector('#roomV3Title').textContent='Oda gelişimi';
    p.querySelector('#roomV3Body').innerHTML='<div class="room-v3-summary"><div class="room-v3-summary-top"><div><div class="room-v3-summary-title">Seviye '+level+'</div><div class="room-v3-summary-meta">'+cap+' koltuk • '+Number(r?.member_count||r?.members_count||0)+' katılımcı</div></div><span class="room-v3-levelnum">'+level+'</span></div>'+progressBlock+'</div><div class="room-v3-note" style="margin:0 0 10px">Seviye ödülleri ve açılacak oda özellikleri</div>'+rows+ ((r.is_owner||r.is_moderator)?'<div class="room-v3-card"><b>🪑 Koltuk düzeni</b><small>Oda seviyene göre açılan düzeni seç.</small><div class="room-v3-grid" style="margin-top:10px">'+[16,20,24].map(n=>'<button class="room-v3-btn" data-seat-count="'+n+'" '+(n>seatsForLevel(level)?'disabled title="Seviye '+(n===20?5:7)+' gerekli"':'')+'>'+(n>seatsForLevel(level)?'🔒 ':'')+n+' koltuk'+(cap===n?' ✓':'')+'</button>').join('')+'</div></div>':'');
    p.querySelectorAll('[data-seat-count]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await roomApi().setCapacity(r.id,Number(button.dataset.seatCount));await window.openRoom?.(r.id,r.name||'Oda');await openLevels()}catch(e){button.disabled=false;window.toast?.(e.message||'Koltuk düzeni değiştirilemedi')}});
    if(r.is_owner||r.is_moderator){
      const levelBody=p.querySelector('#roomV3Body');
      const permission=document.createElement('button');permission.className='room-v3-btn';permission.textContent='Koltuk İzni';permission.onclick=()=>window.ErisSeatPermissions?.openSettings?.();levelBody.append(permission);
      levelBody.insertAdjacentHTML('beforeend','<div class="room-v3-card"><b>💬 Chat</b><button type="button" class="room-v3-btn" data-level-chat>'+(r.chat_enabled===false?'Chat’i aç':'Chat’i kapat')+'</button></div><div class="room-v3-card"><b>🔐 Oda kilidi</b><div class="room-v3-grid"><button class="room-v3-btn" data-level-lock>'+(r.locked?'Kilidi aç':'Yeni şifreyle kilitle')+'</button><button class="room-v3-btn" data-level-password '+(r.locked?'':'disabled')+'>Şifre Değiştir</button>'+(r.password_set?'<button class="room-v3-btn" data-level-clear>Şifreyi kaldır</button>':'')+'</div></div>');
      levelBody.querySelector('[data-level-chat]').onclick=async()=>{try{await roomApi().setChat(r.id,r.chat_enabled===false);await openLevels()}catch(e){window.toast?.(e.message||'Chat değiştirilemedi')}};
      levelBody.querySelector('[data-level-lock]').onclick=async()=>{try{if(r.locked)await roomApi().clearPassword(r.id);else{const password=await window.ErisRoomPasswordModal?.('Yeni şifre');if(password===null||!/^\d{4}$/.test(password||''))return;await roomApi().setPassword(r.id,password)}await window.ErisRoomUI?.refresh?.();await openLevels()}catch(e){window.toast?.(e.message||'Oda kilidi değiştirilemedi')}};
      levelBody.querySelector('[data-level-password]').onclick=async()=>{const password=await window.ErisRoomPasswordModal?.('Şifre Değiştir');if(password===null)return;if(!/^\d{4}$/.test(password))return window.toast?.('Şifre tam 4 rakam olmalı.');try{await roomApi().setPassword(r.id,password);await openLevels()}catch(e){window.toast?.(e.message||'Şifre kaydedilemedi')}};
      levelBody.querySelector('[data-level-clear]')?.addEventListener('click',async()=>{try{await roomApi().clearPassword(r.id);await openLevels()}catch(e){window.toast?.(e.message||'Şifre kaldırılamadı')}});
    }

  }

  async function info(body,r){const level=Number(r?.level||1),cap=Number(r?.seat_count||seatsForLevel(level)),members=Number(r?.member_count||r?.members_count||0),publicId=/^\d{12}$/.test(String(r?.public_id||''))?String(r.public_id):'yüklenemedi';body.innerHTML='<div class="room-v3-card"><b>🏠 '+esc(r?.name||document.getElementById('erisLiveTitle')?.textContent||'Oda')+'</b><small>ID: '+publicId+'</small></div><div class="room-v3-card"><b>Seviye '+level+'</b><small>'+members+' kişi • '+cap+' koltuk • '+(r?.locked?'🔒 Kilitli':'🟢 Açık')+'</small></div><button type="button" class="room-v3-btn primary" data-call-followers style="width:100%;margin-top:12px">📣 Takipçilerini çağır</button><small>Takipçilerini 6 saatte bir odana davet edebilirsin.</small>';body.querySelector('[data-call-followers]').onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try{
      const result=await roomApi().callFollowers(r.id||roomId());
      window.toast?.(result.sent?result.sent+' takipçine oda daveti gönderildi.':'Davet gönderilebilecek takipçin bulunamadı.');
    }catch(error){
      window.toast?.(error.message||'Takipçiler çağrılamadı.');
    }finally{button.disabled=false}
  }}
  async function reportRoom(body,r){
    body.innerHTML='<form class="room-v3-card" data-room-report>'
      +'<b>⚑ Odayı şikâyet et</b><small>Şikâyetin destek ekibine iletilir. Kanıt isteğe bağlıdır.</small>'
      +'<textarea class="room-v3-input" name="reason" required maxlength="200" placeholder="Şikâyet nedenini yazın (en fazla 200 karakter)" style="min-height:110px;padding:12px;margin-top:12px;resize:vertical"></textarea>'
      +'<label class="room-v3-note" style="display:block;margin-top:12px">En fazla 3 fotoğraf veya 1 video'
      +'<input name="evidence" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple style="display:block;width:100%;margin-top:8px"></label>'
      +'<div data-preview style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0"></div>'
      +'<button class="room-v3-save" type="submit">Desteğe gönder</button>'
      +'<div class="room-v3-note" data-error role="alert"></div></form>';
    const form=body.querySelector('[data-room-report]');
    const fileInput=form.querySelector('[name=evidence]');
    const error=form.querySelector('[data-error]');
    const preview=form.querySelector('[data-preview]');
    let evidence=[];
    const thumbnails=[];
    function drawEvidence(){
      thumbnails.forEach(url=>URL.revokeObjectURL(url));
      thumbnails.length=0;
      preview.replaceChildren();
      if(!evidence.length){
        const empty=document.createElement('small');
        empty.textContent='Kanıt seçilmedi.';
        preview.append(empty);
      }
      evidence.forEach((file,index)=>{
        const item=document.createElement('div');
        item.style.cssText='position:relative;overflow:hidden;border-radius:14px;border:1px solid #ffffff30;background:#1b1426;min-height:100px';
        const url=URL.createObjectURL(file);
        thumbnails.push(url);
        const media=document.createElement(file.type.startsWith('video/')?'video':'img');
        media.src=url;
        media.style.cssText='width:100%;height:100px;object-fit:cover;display:block';
        if(media.tagName==='VIDEO'){
          media.muted=true;media.playsInline=true;media.preload='metadata';
          media.setAttribute('aria-label','Video kanıtı');
        }else media.alt='Fotoğraf kanıtı';
        const remove=document.createElement('button');
        remove.type='button';
        remove.textContent='×';
        remove.setAttribute('aria-label',file.name+' kanıtını kaldır');
        remove.style.cssText='position:absolute;right:5px;top:5px;width:30px;height:30px;border:1px solid #ffffff55;border-radius:50%;background:#100b19ed;color:#fff;font-size:21px;line-height:1';
        remove.onclick=()=>{evidence.splice(index,1);drawEvidence()};
        const name=document.createElement('small');
        name.textContent=file.name;
        name.style.cssText='display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px;color:#ddd';
        item.append(media,remove,name);
        preview.append(item);
      });
    }
    fileInput.onchange=()=>{
      const next=[...fileInput.files];
      fileInput.value='';
      const combined=[...evidence,...next];
      const videos=combined.filter(file=>file.type.startsWith('video/'));
      if(combined.length>3||(videos.length&&(combined.length!==1||videos.length!==1))){
        error.textContent='En fazla 3 fotoğraf veya yalnızca 1 video seç.';
        return;
      }
      evidence=combined;
      error.textContent='';
      drawEvidence();
    };
    drawEvidence();
    form.onsubmit=async event=>{
      event.preventDefault();
      error.textContent='';
      const files=[...evidence];
      const videos=files.filter(file=>file.type.startsWith('video/'));
      if(files.length>3 || (videos.length && (files.length!==1 || videos.length!==1))){
        error.textContent='En fazla 3 fotoğraf veya yalnızca 1 video seç.';
        return;
      }
      for(const file of files){
        const video=file.type.startsWith('video/');
        if(video && file.size>8*1024*1024){
          error.textContent='Video en fazla 8 MB olabilir.';return;
        }
        if(!video && file.size>1_500_000){
          error.textContent='Her fotoğraf en fazla 1,5 MB olabilir.';return;
        }
      }
      const submit=form.querySelector('[type=submit]');
      submit.disabled=true;
      try{
        const attachments=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result));
          reader.onerror=()=>reject(new Error('Kanıt okunamadı.'));
          reader.readAsDataURL(file);
        })));
        const result=await window.ErisPlatform.api(
          '/rooms/'+encodeURIComponent(r.id||roomId())+'/reports',
          {method:'POST',body:JSON.stringify({reason:form.reason.value.trim(),attachments})}
        );
        window.toast?.('Şikâyet desteğe iletildi. Kayıt #'+result.id);
        await openMenu('info');
      }catch(err){
        error.textContent=err.message||'Şikâyet gönderilemedi.';
        submit.disabled=false;
      }
    };
  }

  async function users(body,r){
    const id=r.id||roomId(),staff=!!(r.is_owner||r.is_moderator);
    let rows;
    try{rows=await roomApi().members(id)}
    catch(error){body.textContent=error.message||'Odadaki kullanıcılar yüklenemedi.';return}
    body.replaceChildren();
    const note=document.createElement('p');note.className='room-v3-note';
    note.textContent=rows.length+' oda üyesi';body.append(note);
    if(!rows.length){const empty=document.createElement('div');empty.className='room-v3-card';empty.textContent='Odada kullanıcı yok.';body.append(empty);return}
    for(const member of rows){
      const card=document.createElement('div');card.className='room-v3-card';
      const name=document.createElement('b');name.textContent=member.nickname||'Kullanıcı';
      const meta=document.createElement('small');
      meta.textContent=(member.role==='owner'?'👑 Oda sahibi':member.role==='moderator'?'🛡️ Moderatör':'Kullanıcı')
        +(member.seat_number?' · '+member.seat_number+'. koltuk':' · koltukta değil');
      const buttons=document.createElement('div');buttons.className='room-v3-grid';buttons.style.marginTop='10px';
      const action=(label,run)=>{
        const button=document.createElement('button');
        button.type='button';button.className='room-v3-btn';button.textContent=label;
        button.onclick=async()=>{
          button.disabled=true;
          try{await run();button.disabled=false}
          catch(error){button.disabled=false;window.toast?.(error.message||'İşlem yapılamadı.')}
        };
        buttons.append(button);
      };
      if(String(member.user_id)!==String(r.current_user_id)){
        action('👤 Profil',async()=>window.openUserProfile?.(member.user_id));
        action('＋ Takip et',async()=>{
          await window.ErisPlatform.api('/users/'+encodeURIComponent(member.user_id)+'/follow',{method:'POST'});
          window.toast?.('Kullanıcı takip edildi.');
        });
        action('💬 Mesaj gönder',async()=>{
          const conversation=await window.ErisPlatform.createConversation(member.user_id);
          window.__erisActiveDmUserId=member.user_id;
          window.ErisChatDM?.load?.();
          window.ErisChatDM?.open?.(
            conversation?.id||conversation?.conversation_id||conversation?.conversation?.id,
            member.nickname||'Kullanıcı',member.avatar_asset||member.avatar||'',member.user_id
          );
          surface()?.querySelector('.room-v3-panel')?.classList.remove('show');
        });
        if(staff&&(r.is_owner||member.role==='user')){
          action('Odadan at',async()=>{
            if(!window.confirm((member.nickname||'Kullanıcı')+' odadan atılsın mı?'))return;
            await roomApi().ban(id,member.user_id);
            await openMenu('users');
          });
          action('Chatte sustur',async()=>{
            await roomApi().muteChat(id,member.user_id);
            window.toast?.('Kullanıcı chatte susturuldu.');
          });
        }
      }
      card.append(name,meta,buttons);
      body.append(card);
    }
  }

  async function gifts(body,r){
    const id=r?.id||roomId();
    body.innerHTML='<div class="room-v3-card"><b>🎁 Hediye gönder</b><small>Alıcı, kategori ve adet seçimi</small><button type="button" class="room-v3-input" id="roomOpenUnifiedGifts">Hediye seçicisini aç</button></div>';
    body.querySelector('#roomOpenUnifiedGifts').onclick=()=>{document.querySelector('.room-v3-panel.show')?.classList.remove('show');window.openRoomGift?.(id)};
    body.querySelector('#roomOpenUnifiedGifts').click();
  }

  async function music(body,r){
    body.textContent='Müzik paneli açılıyor…';
    surface()?.querySelector('.room-v3-panel')?.classList.remove('show');
    window.ErisChatMusic?.open?.();
  }

  function managementRow(body,label,subtitle,buttonLabel,action){
    const card=document.createElement('div');card.className='room-v3-card';
    const title=document.createElement('b');title.textContent=label;
    const detail=document.createElement('small');detail.textContent=subtitle;
    card.append(title,detail);
    if(buttonLabel){
      const button=document.createElement('button');
      button.type='button';button.className='room-v3-btn';
      button.style.marginTop='10px';button.textContent=buttonLabel;
      button.onclick=async()=>{
        button.disabled=true;
        try{await action()}
        catch(error){button.disabled=false;window.toast?.(error.message||'İşlem yapılamadı.')}
      };
      card.append(button);
    }
    body.append(card);
  }
  async function staff(body,r){
    const rows=await roomApi().moderators(r.id);
    body.replaceChildren();
    rows.forEach(row=>managementRow(body,row.nickname,row.role==='owner'?'👑 Oda sahibi':'🛡️ Moderatör'));
  }
  async function guests(body,r){
    const rows=(await roomApi().members(r.id)).filter(row=>row.role==='user');
    body.replaceChildren();
    if(!rows.length){body.textContent='Odada yönetilecek misafir yok.';return}
    for(const row of rows){
      const card=document.createElement('div');card.className='room-v3-card';
      const title=document.createElement('b');title.textContent=row.nickname;
      const meta=document.createElement('small');
      meta.textContent=row.seat_number?row.seat_number+'. koltuk':'Koltukta değil';
      const actions=document.createElement('div');actions.className='room-v3-grid';actions.style.marginTop='10px';
      for(const [label,run] of [
        ['👤 Profil',()=>window.openUserProfile?.(row.user_id)],
        ['💬 Mesaj',async()=>{
          const conversation=await window.ErisPlatform.createConversation(row.user_id);
          window.__erisActiveDmUserId=row.user_id;
          window.ErisChatDM?.load?.();
          window.ErisChatDM?.open?.(
            conversation?.id||conversation?.conversation_id||conversation?.conversation?.id,
            row.nickname||'Kullanıcı',row.avatar_asset||row.avatar||'',row.user_id
          );
          surface()?.querySelector('.room-v3-panel')?.classList.remove('show');
        }],
        ['Odadan at',()=>roomApi().ban(r.id,row.user_id)],
        ['Chatte sustur',()=>roomApi().muteChat(r.id,row.user_id)]
      ]){
        const button=document.createElement('button');
        button.type='button';button.className='room-v3-btn';button.textContent=label;
        button.onclick=async()=>{
          button.disabled=true;
          try{await run();await openMenu('guests')}
          catch(error){button.disabled=false;window.toast?.(error.message||'İşlem yapılamadı.')}
        };
        actions.append(button);
      }
      card.append(title,meta,actions);body.append(card);
    }
  }
  async function bans(body,r){
    const rows=await roomApi().bans(r.id);body.replaceChildren();
    if(!rows.length){body.textContent='Odadan atılmış kullanıcı yok.';return}
    rows.forEach(row=>managementRow(body,row.display_name||row.user_id,'Odadan atıldı','× Listeden çıkar',async()=>{
      await roomApi().unban(r.id,row.user_id);await openMenu('bans');
    }));
  }
  async function mutes(body,r){
    const rows=await roomApi().chatMutes(r.id);body.replaceChildren();
    if(!rows.length){body.textContent='Chatte susturulan kullanıcı yok.';return}
    rows.forEach(row=>managementRow(body,row.nickname||row.user_id,'Chatte susturuldu','× Susturmayı kaldır',async()=>{
      await roomApi().unmuteChat(r.id,row.user_id);await openMenu('mutes');
    }));
  }
  async function moderators(body,r){
    const rows=(await roomApi().moderators(r.id)).filter(row=>row.role==='moderator');
    body.replaceChildren();
    if(!rows.length){body.textContent='Henüz moderatör yok.';return}
    rows.forEach(row=>managementRow(body,row.nickname,'🛡️ Moderatör','× Yetkiyi kaldır',async()=>{
      await roomApi().removeModerator(r.id,row.user_id);await openMenu('moderators');
    }));
  }
  async function promote(body,r){
    const rows=(await roomApi().members(r.id)).filter(row=>row.role==='user');
    body.replaceChildren();
    if(!rows.length){body.textContent='Moderatör yapılabilecek kullanıcı yok.';return}
    rows.forEach(row=>managementRow(body,row.nickname,'Oda kullanıcısı','＋ Moderatör yap',async()=>{
      await roomApi().addModerator(r.id,row.user_id);await openMenu('promote');
    }));
  }

  async function settings(body,r){
    const owner=isOwner(r),staff=!!(owner||r?.is_moderator);
    if(!staff){body.textContent='Bu bölüme yalnızca oda yetkilileri erişebilir.';return}
    body.innerHTML='<div class="room-v3-card"><b>⚙️ Oda yönetimi</b><small>Chat, kilit ve koltuk düzeni için oda seviyesine dokun.</small></div>'+(owner?'<div class="room-v3-card"><b>👑 Oda sahibi</b><button class="room-v3-btn" data-rename style="margin-top:10px;width:100%">Oda adını değiştir</button></div>':'');
    body.querySelector('[data-rename]')?.addEventListener('click',openName);
  }

  async function openMenu(tab){
    const s=surface();if(!s)return;css();top(s);gift(s);const p=panel(s);p.classList.add('show');
    const r=await getRoom();
    const canManage=!!(r.is_owner||r.is_moderator||r.can_manage);
    const settingsTab=p.querySelector('.room-v3-tab[data-tab="settings"]');
    if(settingsTab) settingsTab.style.display=canManage?'':'none';
    p.querySelectorAll('[data-staff-tab]').forEach(button=>button.style.display=canManage?'':'none');
    p.querySelectorAll('[data-owner-tab]').forEach(button=>button.style.display=r.is_owner?'':'none');
    if(['settings','staff','guests','bans','mutes'].includes(tab)&&!canManage)tab='info';
    if(['moderators','promote'].includes(tab)&&!r.is_owner)tab='info';
    p.querySelector('.room-v3-tabs').style.display='none';
    p.querySelectorAll('.room-v3-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    p.querySelector('#roomV3Title').textContent={info:'Oda bilgisi',users:'Kullanıcılar',gifts:'Hediyeler',music:'Müzik',report:'Şikâyet',staff:'Yetkililer',guests:'Misafirler',bans:'Odadan atılanlar',mutes:'Chatte susturulanlar',moderators:'Moderatörler',promote:'Moderatör yap',settings:'Oda ayarları'}[tab]||'Oda';
    const body=p.querySelector('#roomV3Body');body.innerHTML='<div class="room-v3-note">Yükleniyor…</div>';
    if(tab==='info')await info(body,r);else if(tab==='report')await reportRoom(body,r);else if(tab==='users')await users(body,r);else if(tab==='gifts')await gifts(body,r);else if(tab==='music')await music(body,r);else if(tab==='staff')await staff(body,r);else if(tab==='guests')await guests(body,r);else if(tab==='bans')await bans(body,r);else if(tab==='mutes')await mutes(body,r);else if(tab==='moderators')await moderators(body,r);else if(tab==='promote')await promote(body,r);else await settings(body,r)
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
  const userId=()=>String(window.ErisCurrentUserId||localStorage.getItem('eris_user_id')||'');
  const roomApi=()=>window.ErisRoom||{};
  const roomId=()=>rid();
  const surface=()=>root();
  const esc=value=>String(value??'').replace(/[&<>"']/g,
    char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isOwner=r=>{
    if(r?.is_owner===true)return true;
    const me=userId();
    return !!me&&[r?.owner_id,r?.owner?.id,r?.created_by,r?.creator_id]
      .filter(Boolean).some(id=>String(id)===me);
  };

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
      '#erisRoomSurface #erisRoomMoreTop{margin-left:auto!important;width:38px!important;height:38px!important;min-width:38px!important;flex:0 0 38px!important;padding:0!important;display:grid!important;place-items:center!important;font-size:25px!important;line-height:1!important;overflow:hidden!important}',
      '#erisRoomSurface .eris-room-tools{display:none!important}',
      '#erisRoomSurface .eris-room-compose{align-items:center!important;gap:6px!important}',
      '#erisRoomSurface #erisRoomMicInline{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;min-width:42px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:13px!important;background:rgba(255,255,255,.07)!important;color:#fff!important;padding:0!important}',
      '#erisRoomSurface #erisRoomMicInline.on{background:linear-gradient(135deg,#754cff,#ff4fa3)!important}',
      '#erisRoomSurface #erisRoomAudioOutput{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;min-width:42px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:13px!important;background:rgba(255,255,255,.07)!important;color:#fff!important;padding:0!important;font-size:16px!important}',
      '#erisRoomSurface #erisRoomAudioOutput.on{background:linear-gradient(135deg,#315b58,#28766c)!important;border-color:#74d9bc55!important}',
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
    x.textContent += `
      #erisRoomSurface .room-v5-panel{background:rgba(4,3,10,.75)!important;backdrop-filter:blur(9px)}
      #erisRoomSurface .room-v5-dialog{width:min(650px,calc(100% - 24px))!important;max-height:min(88dvh,900px)!important;overflow:auto!important;box-sizing:border-box!important;padding:26px!important;border:1px solid #ffffff24!important;border-radius:28px!important;background:radial-gradient(circle at 87% 0%,#302040 0%,transparent 39%),linear-gradient(150deg,#171321,#0c0a12 68%)!important;box-shadow:0 32px 90px #000b!important}
      #erisRoomSurface .room-center-eyebrow{color:#bba3f4;font-size:11px;font-weight:800;letter-spacing:2.5px}
      #erisRoomSurface .room-center-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin:8px 0 22px}
      #erisRoomSurface .room-center-heading h2{margin:0;color:#fff;font-size:28px;letter-spacing:-.7px}
      #erisRoomSurface .room-center-heading p{margin:6px 0 0;color:#a99eaf;font-size:13px;line-height:1.4}
      #erisRoomSurface .room-center-close{flex:none;width:48px;height:48px;border:1px solid #ffffff20;border-radius:15px;background:#ffffff09;color:#fff;font-size:25px}
      #erisRoomSurface .room-center-identity{display:flex;align-items:center;gap:13px;padding:17px;margin-bottom:26px;border:1px solid #ffffff1c;border-radius:20px;background:#ffffff06}
      #erisRoomSurface .room-center-symbol{width:52px;height:52px;flex:none;display:grid;place-items:center;border-radius:15px;background:linear-gradient(135deg,#8052e8,#bf46bc);font-size:24px}
      #erisRoomSurface .room-center-identity-text{flex:1;min-width:0}
      #erisRoomSurface .room-center-identity-text strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px}
      #erisRoomSurface .room-center-identity-text small{display:block;color:#aba1b4;font-size:12px;margin-top:4px}
      #erisRoomSurface .room-center-role{border-radius:30px;padding:7px 11px;background:#7652c02e;color:#d8c5ff;font-size:10px;font-weight:800;white-space:nowrap}
      #erisRoomSurface .room-center-section{margin:20px 0}
      #erisRoomSurface .room-center-section h3{margin:0 0 10px;color:#aaa0b1;font-size:11px;letter-spacing:1.7px}
      #erisRoomSurface .room-center-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #erisRoomSurface .room-center-item{min-height:77px;display:flex;align-items:center;gap:12px;padding:14px;text-align:left;border:1px solid #ffffff19;border-radius:17px;background:linear-gradient(140deg,#ffffff08,#ffffff03);color:#fff;cursor:pointer}
      #erisRoomSurface .room-center-item span{font-size:21px;color:#c8a8ff}
      #erisRoomSurface .room-center-item b{font-size:13px;line-height:1.35}
      #erisRoomSurface .room-center-item:active{transform:scale(.98);border-color:#a677ff}
      @media(max-width:370px){#erisRoomSurface .room-v5-dialog{padding:18px!important}#erisRoomSurface .room-center-item{min-height:67px;padding:10px}#erisRoomSurface .room-center-item b{font-size:11px}}

      #erisRoomSurface .room-v3-panel{inset:0!important;top:0!important;bottom:0!important;z-index:600!important;padding:16px!important;background:rgba(4,3,10,.78)!important;backdrop-filter:blur(9px)}
      #erisRoomSurface .room-v3-panel.show{display:grid!important;place-items:center!important}
      #erisRoomSurface .room-v3-dialog{width:min(650px,100%)!important;height:auto!important;min-height:0!important;max-height:88dvh!important;box-sizing:border-box!important;padding:24px!important;overflow:hidden!important;border:1px solid #ffffff24!important;border-radius:28px!important;background:radial-gradient(circle at 87% 0%,#302040 0%,transparent 39%),linear-gradient(150deg,#171321,#0c0a12 68%)!important;box-shadow:0 32px 90px #000b!important}
      #erisRoomSurface .room-v3-eyebrow{color:#bba3f4;font-size:11px;font-weight:800;letter-spacing:2px;margin-bottom:9px}
      #erisRoomSurface .room-v3-head{padding:0 0 18px!important;min-height:48px!important;border:0!important;gap:12px!important}
      #erisRoomSurface .room-v3-head strong{font-size:26px!important;line-height:1.2}
      #erisRoomSurface .room-v3-back,#erisRoomSurface .room-v3-close{width:44px!important;height:44px!important;flex:none;border:1px solid #ffffff20!important;border-radius:14px!important;background:#ffffff09!important;color:#fff!important;font-size:24px!important}
      #erisRoomSurface .room-v3-tabs{display:none!important}
      #erisRoomSurface .room-v3-body{padding:0!important;min-height:0!important;max-height:calc(88dvh - 116px)!important;overflow-y:auto!important;overscroll-behavior:contain}
      #erisRoomSurface .room-v3-card{padding:18px!important;border-radius:19px!important;background:linear-gradient(140deg,#ffffff08,#ffffff03)!important}
      #erisRoomSurface .room-v3-grid{gap:10px!important}
      #erisRoomSurface .room-v3-btn{min-height:58px!important;border-radius:17px!important;background:linear-gradient(140deg,#ffffff08,#ffffff03)!important}
      @media(max-width:370px){#erisRoomSurface .room-v3-dialog{padding:16px!important}#erisRoomSurface .room-v3-btn{font-size:11px!important}}
    `;
  }

  function panel(){
    const s=root(); if(!s) return null;
    let overlay=s.querySelector('.room-v5-panel[data-room-center="1"]');
    if(!overlay){overlay=document.createElement('div');overlay.className='room-v5-panel';overlay.dataset.roomCenter='1';overlay.innerHTML='<section class="room-v5-dialog" role="dialog" aria-modal="true" aria-label="Oda menüsü"></section>';overlay.addEventListener('click',event=>{if(event.target===overlay)closePanels()});s.appendChild(overlay);}
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
    more.textContent='⋯';
    more.classList.add('room-v5-topbtn');
    more.setAttribute('aria-label','Oda merkezi');
    more.onclick=menu;
    let leave=h.querySelector('#erisRoomLeaveTop');
    if(!leave){leave=document.createElement('button');leave.id='erisRoomLeaveTop';leave.className='room-v5-topbtn';leave.textContent='↪';leave.title='Odadan çık';h.appendChild(leave);}
    leave.onclick=()=>window.closeRealRoom?.();
    syncHeader();
  }

  function syncManagementHeader(r){
    const can=!!(r?.is_owner||r?.is_moderator||r?.can_manage);
    const b=document.getElementById('erisRoomMoreTop');
    if(b){b.style.display='';b.setAttribute('aria-hidden','false');}
    const tab=root()?.querySelector('.room-v3-tab[data-management-tab]');
    if(tab)tab.style.display=can?'':'none';
  }

  async function syncHeader(){
    const lv=q('erisRoomLevel'); try{const r=await roomApi().get?.(rid())||{}; lv.innerHTML='<b>Seviye '+Number(r.level||1)+'</b><small>'+Number(r.seat_count||seatsForLevel(r.level))+' koltuk</small>'; lv.onclick=()=>window.ErisRoomCompleteV3?.openLevels?.();paintTheme(r.theme||'normal');syncManagementHeader(r);}catch{syncManagementHeader(window.__erisRoomPermissions||{});};
  }

  async function menu(){
    closePanels();
    const p=panel();if(!p)return;
    const r=await roomApi().get?.(rid()).catch(()=>({}))||{};
    const owner=isOwner(r),staff=!!(owner||r.is_moderator||r.can_manage);
    const role=owner?'ODA SAHİBİ':staff?'MODERATÖR':'KULLANICI';
    const platformAdmin=await window.ErisPlatform?.api?.('/admin/me').catch(()=>null);
    const canRoomBan=['UA','DA'].includes(platformAdmin?.role);
    const groups=[
      ['ODA',[
        ['info','⌂','Oda bilgileri'],
        ['ludo','🎮','Ludo'+(Number(r.level||1)<4?' 🔒':'')],
        ['report','⚑','Şikâyet'],
        ['users','♙','Kullanıcılar'],
        ['music','♫','Müzik'],
        ['gifts','◇','Hediyeler']
      ]]
    ];
    if(canRoomBan)groups.push(['PLATFORM YÖNETİMİ',[['adminroomban','⊘','Oda Ban']]]);
    if(staff)groups.push(['ODA YÖNETİMİ',[
      ['staff','♛','Yetkililer'],
      ['guests','♙','Misafirler'],
      ['bans','⊘','Odadan atılanlar'],
      ['mutes','♧','Chatte susturulanlar'],
      ['settings','⚙','Oda kilidi ve chat']
    ]]);
    if(owner)groups.push(['ODA SAHİBİ',[
      ['moderators','♛','Moderatörler'],
      ['promote','＋','Moderatör yap'],
      ['theme','◈','Oda görünümü']
    ]]);
    p.innerHTML='<div class="room-center-eyebrow">ERISCHAT • ODA</div>'
      +'<div class="room-center-heading"><div><h2>Oda Merkezi</h2>'
      +'<p>Oda araçları ve yetkine uygun işlemler.</p></div>'
      +'<button type="button" class="room-center-close" data-close aria-label="Menüyü kapat">×</button></div>'
      +'<div class="room-center-identity"><div class="room-center-symbol">⌂</div>'
      +'<div class="room-center-identity-text"><strong></strong><small></small></div>'
      +'<span class="room-center-role"></span></div>'
      +groups.map(([heading,items])=>'<section class="room-center-section">'
        +'<h3>'+heading+'</h3><div class="room-center-grid">'
        +items.map(([key,icon,title])=>'<button type="button" class="room-center-item" data-v5="'+key+'">'
          +'<span aria-hidden="true">'+icon+'</span><b>'+title+'</b></button>').join('')
        +'</div></section>').join('');
    p.querySelector('.room-center-identity-text strong').textContent=r.name||'Oda';
    p.querySelector('.room-center-identity-text small').textContent='ID: '+(r.public_id||'yükleniyor');
    p.querySelector('.room-center-role').textContent=role;
    p.closest('.room-v5-panel').classList.add('show');
    p.querySelector('[data-close]').onclick=closePanels;
    p.querySelector('[data-v5="ludo"]')?.setAttribute('aria-disabled',String(Number(r.level||1)<4));
    if(Number(r.level||1)<4){const ludo=p.querySelector('[data-v5="ludo"]');if(ludo)ludo.style.opacity='.4';}
    p.querySelectorAll('[data-v5]').forEach(button=>button.onclick=()=>{
      const tab=button.dataset.v5;
      if(['staff','guests','bans','mutes','settings'].includes(tab)&&!staff)return;
      if(['moderators','promote','theme'].includes(tab)&&!owner)return;
      closePanels();
      if(tab==='ludo'){if(Number(r.level||1)<4){window.toast?.('Ludo 4. oda seviyesinde açılır.');return;}window.ErisLudo?.open?.();}
      else if(tab==='adminroomban'&&canRoomBan)window.ErisBan?.openRoom?.(r.public_id||r.id);
      else if(tab==='theme')theme();
      else if(tab==='music')window.ErisChatMusic?.open?.();
      else window.ErisRoomCompleteV3?.openMenu?.(tab);
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
    if(![16,20,24].includes(n)){
      window.toast?.('Koltuk sayısı 16, 20 veya 24 olabilir.');
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
    let b=c.querySelector('#erisRoomMicInline');
    if(!b){const old=q('erisRoomMic');old?.remove();b=document.createElement('button');b.id='erisRoomMicInline';b.type='button';b.textContent='🎙️';b.title='Mikrofonu aç/kapat';b.setAttribute('aria-label','Mikrofonu aç/kapat');const send=q('erisLiveSend');c.insertBefore(b,send||null)}
    b.onclick=()=>window.ErisRoomRTC?.toggle?.();
    let output=c.querySelector('#erisRoomAudioOutput');
    if(!output){output=document.createElement('button');output.id='erisRoomAudioOutput';output.type='button';output.textContent='🔊';output.title='Oda sesini kapat';output.setAttribute('aria-label','Oda sesini kapat')}
    output.onclick=()=>window.ErisRoomRTC?.toggleOutput?.();b.after(output);window.ErisRoomRTC?.showOutput?.();
  }

  function seatMenu(seat,anchor=seat){
    document.getElementById('eris-seat-actions')?.remove();
    const id=roomId(),number=Number(seat.dataset.seatNumber);
    const target=String(seat.dataset.userId||'');
    const occupied=seat.classList.contains('occupied');
    const mine=occupied&&target===userId();
    const permissions=window.__erisRoomPermissions||{};
    const staff=!!(permissions.is_owner||permissions.is_moderator||permissions.can_manage);
    if(!occupied && window.__erisRoomPermissions?.seat_permission && staff){window.ErisSeatPermissions?.openSeat?.(number);return}
    const wrap=document.createElement('div');
    wrap.id='eris-seat-actions';
    wrap.innerHTML='<style>#eris-seat-actions{position:fixed;inset:0;z-index:10000}#eris-seat-actions .esa-shade{position:absolute;inset:0;background:transparent}#eris-seat-actions .esa-toolbar{position:fixed;display:flex;gap:5px;align-items:center;justify-content:center;padding:7px;border-radius:17px;border:1px solid #ffffff35;background:#211a2eec;box-shadow:0 12px 38px #000b;backdrop-filter:blur(12px);max-width:calc(100vw - 20px)}#eris-seat-actions button{width:43px;height:43px;flex:none;display:grid;place-items:center;border:1px solid #ffffff27;border-radius:12px;background:#ffffff12;color:white;font-size:21px}#eris-seat-actions button:active{background:#934de0}#eris-seat-actions button.danger{color:#ff8da8}</style><div class="esa-shade"></div><div class="esa-toolbar" role="toolbar" aria-label="Koltuk '+number+' işlemleri"></div>';
    const roomSurface=surface();
    if(!roomSurface||!roomSurface.classList.contains('show'))return;
    roomSurface.append(wrap);
    const toolbar=wrap.querySelector('.esa-toolbar');
    const add=(icon,label,run,danger=false)=>{
      const button=document.createElement('button');
      button.type='button';button.textContent=icon;button.title=label;
      button.setAttribute('aria-label',label);
      if(danger)button.className='danger';
      button.onclick=async()=>{
        button.disabled=true;
        try{await run();wrap.remove()}
        catch(error){button.disabled=false;window.toast?.(error.message||'İşlem yapılamadı.')}
      };
      toolbar.append(button);
    };
    const refresh=()=>window.ErisRoomUI?.refresh?.();
    if(!occupied){
      if(!seat.classList.contains('locked'))
        add('＋','Koltuğa otur',async()=>{
          await roomApi().joinSeat(id,number);
          await refresh();
        });
      add('✉','Davet et',()=>window.ErisSeatPermissions?.invite?.(number));
      add(seat.classList.contains('locked')?'🔓':'🔒',
          seat.classList.contains('locked')?'Koltuğun kilidini aç':'Koltuğu kilitle',
          async()=>{if(seat.classList.contains('locked'))await roomApi().unlockSeat(id,number);
                  else await roomApi().lockSeat(id,number);await refresh()});
    }else if(mine){
      add('🎙️','Mikrofonu aç veya kapat',()=>window.ErisRoomRTC?.toggle?.());
      add('↗','Koltuktan kalk',async()=>{await roomApi().leaveSeat(id);await refresh()});
    }else{
      add('👤','Profili görüntüle',()=>window.openUserProfile?.(target));
      add('💬','Mesaj gönder',async()=>{
        const conversation=await window.ErisPlatform.createConversation(target);
        window.__erisActiveDmUserId=target;
        window.ErisChatDM?.load?.();
        window.ErisChatDM?.open?.(
          conversation?.id||conversation?.conversation_id||conversation?.conversation?.id,
          seat.getAttribute('aria-label')||'Kullanıcı','',target
        );
      });
      if(staff){
        add(seat.dataset.muted==='true'?'🔊':'🔇',
            seat.dataset.muted==='true'?'Koltuk mikrofonunu aç':'Koltuk mikrofonunu sustur',
            async()=>{if(seat.dataset.muted==='true')await roomApi().unmuteSeat(id,number);
                    else await roomApi().muteSeat(id,number);await refresh()});
        add('🚫','Kullanıcıyı odadan at',async()=>{
          if(!window.confirm('Bu kullanıcı odadan çıkarılsın mı?'))return;
          await roomApi().ban(id,target);await refresh();
        },true);
      }
    }
    wrap.querySelector('.esa-shade').onclick=()=>wrap.remove();
    const rect=(anchor||seat).getBoundingClientRect();
    const width=Math.min(toolbar.children.length*48+16,innerWidth-20);
    const left=Math.max(10,Math.min(innerWidth-width-10,rect.left+rect.width/2-width/2));
    toolbar.style.left=left+'px';
    toolbar.style.top=(rect.top>70?Math.max(8,rect.top-62):Math.min(innerHeight-60,rect.bottom+8))+'px';
    toolbar.querySelector('button')?.focus();
  }

  window.ErisRoomSeatMenu=seatMenu;

  function seatActions(){
    const s=surface();if(!s)return;
    const stage=s.querySelector('#erisLiveSeats');
    if(!stage||stage.dataset.seatActions==='1')return;
    stage.dataset.seatActions='1';
    let timer=0,pressed=false,startX=0,startY=0;
    const clear=()=>{window.clearTimeout(timer);timer=0};
    const available=seat=>{
      if(!seat)return false;
      const p=window.__erisRoomPermissions||{};
      const staff=!!(p.is_owner||p.is_moderator||p.can_manage);
      return seat.classList.contains('occupied')||
        !seat.classList.contains('locked')||staff;
    };
    const begin=(seat,x,y)=>{
      clear();pressed=false;
      if(!available(seat))return;
      startX=x;startY=y;
      timer=window.setTimeout(()=>{
        timer=0;pressed=true;seatMenu(seat);
      },450);
    };
    const moved=(x,y)=>{
      if(Math.abs(x-startX)>20||Math.abs(y-startY)>20)clear();
    };
    stage.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch')return;
      if(event.button!==0)return;
      begin(event.target.closest('.eris-seat'),event.clientX,event.clientY);
    });
    stage.addEventListener('pointermove',event=>{
      if(event.pointerType!=='touch')moved(event.clientX,event.clientY);
    });
    stage.addEventListener('pointerup',event=>{
      if(event.pointerType!=='touch')clear();
    });
    stage.addEventListener('pointercancel',event=>{
      if(event.pointerType!=='touch')clear();
    });
    stage.addEventListener('touchstart',event=>{
      const touch=event.touches[0];
      if(touch)begin(event.target.closest('.eris-seat'),touch.clientX,touch.clientY);
    },{passive:true});
    stage.addEventListener('touchmove',event=>{
      const touch=event.touches[0];
      if(touch)moved(touch.clientX,touch.clientY);
    },{passive:true});
    stage.addEventListener('touchend',clear,{passive:true});
    stage.addEventListener('touchcancel',clear,{passive:true});
    stage.addEventListener('contextmenu',event=>{
      const seat=event.target.closest('.eris-seat');
      if(!available(seat))return;
      event.preventDefault();clear();
      if(!pressed){pressed=true;seatMenu(seat)}
    });
    stage.addEventListener('click',event=>{
      const seat=event.target.closest('.eris-seat');
      if(!available(seat))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(pressed){pressed=false;return}
      seatMenu(seat);
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
  window.ErisRoomCenterMenu=menu;
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

/* Followed-user room invitations. */
(() => {
  let busy=false;
  const dismissed=new Set();
  const css=()=>{
    if(document.getElementById('eris-room-invitation-style'))return;
    const style=document.createElement('style');
    style.id='eris-room-invitation-style';
    style.textContent=`
      #eris-room-invitation-modal{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:20px;background:#03020bcc;backdrop-filter:blur(12px);box-sizing:border-box}
      #eris-room-invitation-modal .invite-card{width:min(420px,100%);padding:25px;border:1px solid #ffffff2c;border-radius:26px;background:radial-gradient(circle at 85% 0%,#38234b,transparent 54%),linear-gradient(150deg,#1c1528,#0c0a13);box-shadow:0 30px 90px #000b;color:#fff;font:14px system-ui;box-sizing:border-box}
      #eris-room-invitation-modal .invite-icon{display:grid;place-items:center;width:58px;height:58px;border-radius:18px;background:linear-gradient(135deg,#8146ee,#eb48a0);font-size:29px}
      #eris-room-invitation-modal h2{font-size:23px;margin:19px 0 8px}
      #eris-room-invitation-modal p{color:#c8bece;line-height:1.6;margin:0}
      #eris-room-invitation-modal .invite-room{margin:18px 0;padding:15px;border:1px solid #ffffff1f;border-radius:16px;background:#ffffff09;font-weight:700}
      #eris-room-invitation-modal .invite-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #eris-room-invitation-modal button{min-height:48px;border-radius:14px;border:1px solid #ffffff27;background:#ffffff0c;color:white;font:700 14px system-ui}
      #eris-room-invitation-modal button.accept{background:linear-gradient(115deg,#8249f3,#e846a6);border:0}
      #eris-room-invitation-modal button:disabled{opacity:.5}
    `;
    document.head.append(style);
  };
  function show(invite){
    css();
    const modal=document.createElement('div');
    modal.id='eris-room-invitation-modal';
    modal.innerHTML='<section class="invite-card" role="dialog" aria-modal="true" aria-label="Oda daveti"><div class="invite-icon">✦</div><h2>Oda daveti</h2><p data-message></p><div class="invite-room" data-room></div><div class="invite-actions"><button type="button" data-reject>Reddet</button><button type="button" class="accept" data-accept>Kabul et</button></div></section>';
    modal.querySelector('[data-message]').textContent=
      invite.sender_name+' isimli, takipçisi olduğunuz kullanıcı sizi odasına çağırıyor.';
    modal.querySelector('[data-room]').textContent=invite.room_name;
    document.body.append(modal);
    const buttons=[...modal.querySelectorAll('button')];
    const respond=async accept=>{
      buttons.forEach(button=>button.disabled=true);
      try{
        if(accept){
          const result=await window.ErisRoom.acceptInvite(invite.id);
          modal.remove();
          await window.openRoom?.(result.room_id,invite.room_name);
        }else{
          await window.ErisRoom.rejectInvite(invite.id);
          modal.remove();
        }
      }catch(error){
        buttons.forEach(button=>button.disabled=false);
        window.toast?.(error.message||'Davet yanıtlanamadı.');
      }
    };
    modal.querySelector('[data-accept]').onclick=()=>respond(true);
    modal.querySelector('[data-reject]').onclick=()=>respond(false);
  }
  async function poll(){
    if(busy||document.hidden||document.getElementById('eris-room-invitation-modal')||
       !window.ErisRoom?.pendingInvites||!window.ErisAuth?.user)return;
    busy=true;
    try{
      const invitations=await window.ErisRoom.pendingInvites();
      const next=Array.isArray(invitations)&&invitations.find(invite=>!dismissed.has(invite.id));
      if(next){dismissed.add(next.id);show(next)}
    }catch(_){}
    finally{busy=false}
  }
  window.setInterval(poll,12000);
  window.setTimeout(poll,2500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
  window.addEventListener('erischat:auth',()=>window.setTimeout(poll,500));
})();

(() => {
  const style=document.createElement('style');
  style.textContent='#erisRoomMicInline,#erisRoomAudioOutput{transition:background .2s,box-shadow .2s,opacity .2s!important}#erisRoomMicInline:not(.on),#erisRoomAudioOutput:not(.on){opacity:.63!important;background:#191522!important}#erisRoomMicInline.on{background:linear-gradient(125deg,#744dff,#ef4da8)!important;box-shadow:0 0 0 2px #e65aff54,0 0 22px #dc4bb580!important;opacity:1!important}#erisRoomAudioOutput.on{background:linear-gradient(125deg,#236b65,#42ba9a)!important;box-shadow:0 0 0 2px #52d8b954,0 0 22px #42ba9a80!important;opacity:1!important}';
  document.head.append(style);
})();
