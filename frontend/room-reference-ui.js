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
      '#erisRoomSurface .eris-room-top #erisRoomGift,#erisRoomSurface .eris-room-top #erisRoomMusic{display:none!important}',
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
      '#erisRoomSurface .room-v3-panel{position:absolute;left:50%;top:82px;bottom:204px;transform:translateX(-50%);width:min(420px,calc(100% - 20px));z-index:120;display:none;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:rgba(8,4,18,.94);backdrop-filter:blur(24px);box-shadow:0 22px 70px rgba(0,0,0,.55)}',
      '#erisRoomSurface .room-v3-panel.show{display:flex}#erisRoomSurface .room-v3-head{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)}#erisRoomSurface .room-v3-head strong{font-size:12px;flex:1}#erisRoomSurface .room-v3-close{width:30px;height:30px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff}',
      '#erisRoomSurface .room-v3-body{padding:11px;overflow:auto;flex:1}#erisRoomSurface .room-v3-tabs{display:flex;gap:5px;padding:8px;border-bottom:1px solid rgba(255,255,255,.07);overflow:auto}#erisRoomSurface .room-v3-tab{white-space:nowrap;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#bfb5c8;border-radius:10px;padding:7px 9px;font-size:8px}.room-v3-tab.active{color:#fff;background:linear-gradient(135deg,rgba(117,76,255,.34),rgba(255,79,163,.25))}',
      '#erisRoomSurface .room-v3-card{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.045);border-radius:13px;padding:10px;margin-bottom:7px}.room-v3-card b{font-size:10px}.room-v3-card small{display:block;color:#9f95a8;font-size:8px;margin-top:4px;line-height:1.4}',
      '#erisRoomSurface .room-v3-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.room-v3-btn{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.07);color:#fff;border-radius:10px;padding:8px 9px;font-size:8px}.room-v3-btn.primary{background:linear-gradient(135deg,#754cff,#ff4fa3);border:0}',
      '#erisRoomSurface .room-v3-input{width:100%;box-sizing:border-box;height:44px;padding:0 13px;border-radius:13px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;outline:none}.room-v3-save{margin-top:8px;width:100%;height:42px;border:0;border-radius:13px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:800}',
      '#erisRoomSurface .room-v3-note{font-size:8px;color:#a49aaa;line-height:1.45;margin-top:8px}.room-v3-progress{height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:7px}.room-v3-progress i{display:block;height:100%;background:linear-gradient(90deg,#754cff,#ff4fa3)}',
      '#erisRoomSurface .room-v3-level{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);border-radius:14px;padding:10px;margin-bottom:7px}.room-v3-level.current{border-color:rgba(255,79,163,.42);background:linear-gradient(135deg,rgba(117,76,255,.13),rgba(255,79,163,.08))}.room-v3-levelline{display:flex;align-items:center;gap:8px}.room-v3-levelnum{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.08);font-weight:900;font-size:10px}.room-v3-levelmain{flex:1;min-width:0}.room-v3-levelmain b{display:block;font-size:10px}.room-v3-levelmain small{display:block;color:#a39aa9;font-size:7px;margin-top:3px}',
      '@media(max-width:520px){#erisRoomSurface .eris-room-title{max-width:38%!important}#erisRoomSurface #erisRoomLevel{min-width:84px!important;padding:0 9px!important}#erisRoomSurface .eris-room-chat{height:196px!important}#erisRoomSurface .eris-room-tools{bottom:202px!important}#erisRoomSurface .room-v3-panel{top:80px;bottom:202px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function panel(s){
    let p=s.querySelector('.room-v3-panel');
    if(p) return p;
    p=document.createElement('aside');p.className='room-v3-panel';
    p.innerHTML='<div class="room-v3-head"><strong id="roomV3Title">Oda</strong><button class="room-v3-close">×</button></div><div class="room-v3-tabs"><button class="room-v3-tab active" data-tab="info">Oda</button><button class="room-v3-tab" data-tab="users">Kullanıcılar</button><button class="room-v3-tab" data-tab="gifts">Hediyeler</button><button class="room-v3-tab" data-tab="music">Müzik</button><button class="room-v3-tab" data-tab="settings">Ayarlar</button></div><div class="room-v3-body" id="roomV3Body"></div>';
    s.appendChild(p);
    p.querySelector('.room-v3-close').onclick=()=>p.classList.remove('show');
    p.querySelectorAll('.room-v3-tab').forEach(b=>b.onclick=()=>openMenu(b.dataset.tab));
    return p;
  }

  function top(s){
    const h=s.querySelector('.eris-room-top');if(!h)return;
    if(!h.querySelector('#erisRoomLevel')){const b=document.createElement('button');b.id='erisRoomLevel';b.type='button';b.innerHTML='<b>Seviye 1</b><small>ilerleme</small>';b.onclick=openLevels;h.appendChild(b)}
    if(!h.querySelector('#erisRoomMoreTop')){const b=document.createElement('button');b.id='erisRoomMoreTop';b.type='button';b.className='room-v3-top-btn';b.textContent='•••';b.title='Oda menüsü';b.onclick=()=>openMenu('settings');h.appendChild(b)}
    if(!h.querySelector('#erisRoomLeaveTop')){const b=document.createElement('button');b.id='erisRoomLeaveTop';b.type='button';b.className='room-v3-top-btn';b.textContent='↪';b.title='Odadan çık';b.onclick=()=>window.closeRealRoom?.();h.appendChild(b)}
    h.querySelector('#erisRoomGift')?.style.setProperty('display','none','important');h.querySelector('#erisRoomMusic')?.style.setProperty('display','none','important');
  }

  function gift(s){
    const c=s.querySelector('.eris-room-compose');if(!c||c.querySelector('#erisRoomGiftInline'))return;
    const b=document.createElement('button');b.id='erisRoomGiftInline';b.type='button';b.className='room-v3-gift';b.textContent='🎁';b.title='Hediye gönder';b.onclick=()=>openMenu('gifts');c.insertBefore(b,c.querySelector('#erisLiveSend')||null);
  }

  async function getRoom(){const id=roomId();if(!id)return{};try{return await roomApi().get?.(id)||{}}catch(e){return{}}}
  function isOwner(r){const me=userId();return !!me&&[r?.owner_id,r?.owner?.id,r?.created_by,r?.creator_id].filter(Boolean).some(x=>String(x)===me)}

  async function openName(){
    const r=await getRoom(),id=roomId(),name=document.getElementById('erisLiveTitle')?.textContent||r?.name||'Oda';
    if(!isOwner(r)&&!id.startsWith('demo-room-')){window.toast?.('Oda adını yalnızca oda sahibi değiştirebilir.');return}
    const p=panel(surface());p.classList.add('show');p.querySelectorAll('.room-v3-tab').forEach(x=>x.classList.remove('active'));
    p.querySelector('#roomV3Title').textContent='Oda adı';p.querySelector('#roomV3Body').innerHTML='<input id="roomV3Name" class="room-v3-input" maxlength="40" value="'+esc(name)+'" placeholder="Oda adı"><button class="room-v3-save" id="roomV3NameSave">Kaydet</button><div class="room-v3-note">Oda adı sadece oda sahibi tarafından değiştirilebilir.</div>';
    p.querySelector('#roomV3NameSave').onclick=async()=>{const next=p.querySelector('#roomV3Name').value.trim();if(next.length<2){window.toast?.('Oda adı en az 2 karakter olmalı.');return}let saved=false;try{if(typeof roomApi().rename==='function'){await roomApi().rename(id,next);saved=true}else if(window.ErisPlatform?.api){await window.ErisPlatform.api('/rooms/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({name:next})});saved=true}}catch(e){if(!id.startsWith('demo-room-')){window.toast?.(e.message||'Oda adı kaydedilemedi.');return}}document.getElementById('erisLiveTitle').textContent=next;if(id.startsWith('demo-room-'))localStorage.setItem('eris_demo_room_name_'+id,next);p.classList.remove('show');window.toast?.(saved?'Oda adı güncellendi ✓':'Demo oda adı bu oturum için güncellendi ✓')};
  }

  function levelRows(r,level){const raw=Array.isArray(r?.level_rewards)?r.level_rewards:[];if(raw.length)return raw;return Array.from({length:8},(_,i)=>{const n=i+1,cap=n>=7?16:n>=5?12:8;return{level:n,threshold:Number((r?.level_thresholds||[])[i]||0),reward:LEVEL_REWARDS[n]||('Oda ayrıcalıkları • '+cap+' koltuk')}})}
  async function openLevels(){
    const r=await getRoom(),level=Math.max(1,Number(r?.level||1)),cap=Number(r?.seat_count||r?.capacity||(level>=7?16:level>=5?12:8)),progress=Number(r?.level_progress??r?.progress??0),next=Number(r?.next_level_threshold??r?.next_level_cost??0),pct=next?Math.min(100,Math.max(0,progress/next*100)):100;
    const rows=levelRows(r,level).map(x=>{const n=Number(x.level||1),cur=n===level,done=n<level,need=Number(x.threshold||x.required||0),reward=x.reward||x.rewards||'Oda ayrıcalıkları';return '<div class="room-v3-level '+(cur?'current':'')+'"><div class="room-v3-levelline"><div class="room-v3-levelnum">'+n+'</div><div class="room-v3-levelmain"><b>Seviye '+n+(cur?' • mevcut':'')+'</b><small>'+(need?need.toLocaleString('tr-TR')+' eşik':'Seviye bilgisi')+'</small></div><span>'+(done?'✓':cur?'●':'🔒')+'</span></div><div class="room-v3-note">🎁 '+esc(reward)+'</div>'+(cur?'<div class="room-v3-progress"><i style="width:'+pct+'%"></i></div><div class="room-v3-note">'+(next?progress.toLocaleString('tr-TR')+' / '+next.toLocaleString('tr-TR'):'Mevcut ilerleme backend verisiyle güncellenir')+'</div>':'')+'</div>'}).join('');
    const p=panel(surface());p.classList.add('show');p.querySelectorAll('.room-v3-tab').forEach(x=>x.classList.remove('active'));p.querySelector('#roomV3Title').textContent='Oda seviyeleri';p.querySelector('#roomV3Body').innerHTML='<div class="room-v3-note" style="margin:0 0 8px">Mevcut seviye: <b>Seviye '+level+'</b> • '+cap+' koltuk. İlerlemeyi ve diğer seviyelerde açılacak kazanımları buradan görebilirsin.</div>'+rows;
  }

  async function info(body,r){const level=Number(r?.level||1),cap=Number(r?.seat_count||r?.capacity||(level>=7?16:level>=5?12:8)),members=Number(r?.member_count||r?.members_count||0);body.innerHTML='<div class="room-v3-card"><b>🏠 '+esc(r?.name||document.getElementById('erisLiveTitle')?.textContent||'Oda')+'</b><small>ID: '+esc(r?.id||roomId())+'</small></div><div class="room-v3-card"><b>Seviye '+level+'</b><small>'+members+' kişi • '+cap+' koltuk • '+(r?.locked?'🔒 Kilitli':'🟢 Açık')+'</small></div>'}
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
  window.ErisRoomPasswordModal=passwordModal;
  window.addEventListener('erischat:room-opened',()=>setTimeout(bind,0));
  window.ErisRoomCompleteV3={openMenu,openName,openLevels};
})();
/* Room UI v5 — single in-room controls, working demo capacity/theme controls. */
(() => {
  const root=()=>document.getElementById('erisRoomSurface');
  const q=s=>document.getElementById(s);
  const rid=()=>String(window.ErisCurrentRoomId||window.currentRoomId||'');
  const demo=()=>window.ErisDemoRoomConfig?.[rid()]||null;

  function css(){
    if(q('eris-room-v5-css')) return;
    const x=document.createElement('style'); x.id='eris-room-v5-css';
    x.textContent=[
      '#erisRoomSurface .eris-room-top{height:64px!important;min-height:64px!important;padding:7px 8px!important;gap:5px!important;box-sizing:border-box!important;overflow:hidden!important}',
      '#erisRoomSurface .eris-room-top .room-action.back{display:none!important}',
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
      '#erisRoomSurface .room-v5-panel{display:none;position:absolute;left:50%;top:70px;bottom:204px;transform:translateX(-50%);width:min(430px,calc(100% - 16px));z-index:190;overflow:auto;border:1px solid rgba(255,255,255,.15);border-radius:18px;background:rgba(8,4,18,.97);backdrop-filter:blur(24px);padding:10px;box-sizing:border-box}',
      '#erisRoomSurface .room-v5-panel.show{display:block}',
      '#erisRoomSurface .v5-title{font-size:13px;font-weight:900;margin:2px 2px 10px;display:flex;justify-content:space-between;align-items:center}',
      '#erisRoomSurface .v5-card{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.05);border-radius:13px;padding:10px;margin-bottom:7px}',
      '#erisRoomSurface .v5-row{display:flex;align-items:center;gap:7px;justify-content:space-between}',
      '#erisRoomSurface .v5-row b{font-size:10px}.v5-row small{font-size:7px;color:#aaa0b2}',
      '#erisRoomSurface .v5-btn{height:38px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.07);color:#fff;font-size:9px;padding:0 10px}',
      '#erisRoomSurface .v5-btn.primary{background:linear-gradient(135deg,#754cff,#ff4fa3);border:0}',
      '#erisRoomSurface .v5-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}',
      '#erisRoomSurface .v5-note{font-size:8px;color:#aaa0b2;line-height:1.45}',
      '@media(max-width:520px){#erisRoomSurface .eris-room-top{padding:6px!important}#erisRoomSurface .eris-room-title{max-width:calc(100% - 142px)!important}#erisRoomSurface #erisRoomLevel{flex-basis:70px!important;width:70px!important;min-width:70px!important}.room-v5-topbtn{width:32px!important;min-width:32px!important;flex-basis:32px!important}}'
    ].join('');
    document.head.appendChild(x);
  }

  function panel(){
    const s=root(); if(!s) return null;
    let p=s.querySelector('.room-v5-panel');
    if(!p){p=document.createElement('div');p.className='room-v5-panel';s.appendChild(p);}
    return p;
  }

  function closePanels(){
    root()?.querySelectorAll('.room-v5-panel,.room-v3-panel').forEach(p=>p.classList.remove('show'));
  }

  function top(){
    const s=root(),h=s?.querySelector('.eris-room-top'); if(!h)return;
    h.querySelector('.room-action.back')?.remove();
    h.querySelector('#erisRoomMoreTop')?.remove();
    h.querySelector('#erisRoomLeaveTop')?.remove();
    h.querySelector('#erisRoomLevel')?.remove();
    const lv=document.createElement('button');
    lv.id='erisRoomLevel';lv.className='room-v5-topbtn';
    lv.innerHTML='<b>Seviye</b><small>Oda bilgisi</small>';lv.title='Oda seviyesi';lv.onclick=()=>(demo()&&window.__erisRoomPermissions?.can_manage)?demoSettings():window.ErisRoomCompleteV3?.openLevels?.();h.appendChild(lv);
    const more=document.createElement('button');
    more.id='erisRoomMoreTop';more.className='room-v5-topbtn';more.textContent='⋯';more.title='Oda menüsü';more.onclick=menu;h.appendChild(more);
    const leave=document.createElement('button');
    leave.id='erisRoomLeaveTop';leave.className='room-v5-topbtn';leave.textContent='↪';leave.title='Odadan çık';leave.onclick=()=>window.closeRealRoom?.();h.appendChild(leave);
    h.querySelectorAll('#erisRoomGift,#erisRoomMusic').forEach(x=>x.style.display='none');
    syncHeader();
  }

  async function syncHeader(){
    const lv=q('erisRoomLevel'),d=demo();
    if(!lv)return;
    if(d){
      const level=Number(d.level||10),cap=Math.min(16,Math.max(8,Number(d.seat_count)||16));
      lv.innerHTML='<b>Seviye '+level+'</b><small>'+cap+' koltuk</small>';
      return;
    }
    try{const r=await roomApi().get?.(rid())||{}; lv.innerHTML='<b>Seviye '+Number(r.level||1)+'</b><small>'+Number(r.seat_count||8)+' koltuk</small>'; lv.onclick=()=>window.ErisRoomCompleteV3?.openLevels?.();}catch{};
  }

  async function menu(){
    const p=panel(); if(!p)return;
    const r=demo()?demo():(await roomApi().get?.(rid()).catch(()=>({}))||{});
    const canManage=!!(r.is_owner||r.is_moderator||r.can_manage);
    p.innerHTML='<div class="v5-title">Oda menüsü <button class="v5-btn" data-close>Kapat</button></div>'+
      '<div class="v5-grid">'+
      '<button class="v5-btn" data-v5="info">ℹ️ Oda bilgisi</button>'+
      '<button class="v5-btn" data-v5="users">👥 Kullanıcılar</button>'+
      '<button class="v5-btn" data-v5="gifts">🎁 Hediyeler</button>'+
      '<button class="v5-btn" data-v5="music">🎵 Müzik</button>'+
      (canManage?'<button class="v5-btn" data-v5="settings">⚙️ Oda ayarları</button><button class="v5-btn" data-v5="theme">🎨 Oda teması</button>':'')+
      '</div>'+
      '<div class="v5-card"><b style="font-size:10px">'+(canManage?'👑 Oda yönetimi':'👤 Oda kullanıcısı')+'</b><div class="v5-note" style="margin-top:4px">'+(canManage?'Yönetim yetkileri sadece oda sahibi ve atanmış moderatörde görünür.':'Bu odanın sahibi/moderatörü değilsin; yönetim kontrolleri gizlendi.')+'</div></div>';
    p.classList.add('show');
    p.querySelector('[data-close]').onclick=()=>p.classList.remove('show');
    p.querySelectorAll('[data-v5]').forEach(b=>b.onclick=()=>{
      const t=b.dataset.v5;
      if(t==='theme' && !canManage) return;
      if(t==='settings' && !canManage) return;
      closePanels();
      window.ErisRoomCompleteV3?.openMenu?.(t);
    });
  }

  function theme(){
    const p=panel();if(!p)return;
    p.innerHTML='<div class="v5-title">🎨 Oda teması <button class="v5-btn" data-close>Geri</button></div>'+
      '<div class="v5-card"><div class="v5-row"><b>Gece Neon</b><button class="v5-btn primary" data-theme="neon">Uygula</button></div></div>'+
      '<div class="v5-card"><div class="v5-row"><b>Mor Kozmik</b><button class="v5-btn" data-theme="cosmic">Uygula</button></div></div>'+
      '<div class="v5-card"><div class="v5-row"><b>Altın VIP</b><button class="v5-btn" data-theme="gold">Uygula</button></div></div>'+
      '<div class="v5-card"><div class="v5-row"><b>💎 VIP 12 Royal</b><button class="v5-btn" data-theme="vip12">Uygula</button></div></div>'+
      '<div class="v5-card"><div class="v5-row"><b>🌙 Normal</b><button class="v5-btn" data-theme="normal">Uygula</button></div></div>'+
      '<div class="v5-note">Tema oda yüzeyinin renklerini değiştirir; kullanıcının kişisel duvar kâğıdı varsa o arka plan korunur.</div>';
    p.classList.add('show');
    p.querySelector('[data-close]').onclick=menu;
    p.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>applyTheme(b.dataset.theme));
  }

  function applyTheme(theme){
    const s=root();if(!s)return;
    const wall=s.querySelector('.eris-room-wall');
    const themes={
      neon:{a:'#ff5bad',b:'#754cff',g:'#ffd166'},
      cosmic:{a:'#a78bfa',b:'#4f46e5',g:'#c4b5fd'},
      gold:{a:'#ffd166',b:'#b7791f',g:'#ffe7a3'},vip12:{a:'#f5d06f',b:'#8b5cf6',g:'#fff1a8'},normal:{a:'#8a5cff',b:'#4f46e5',g:'#c4b5fd'}
    };
    const t=themes[theme]||themes.neon;
    s.style.setProperty('--room-accent',t.a);s.style.setProperty('--room-secondary',t.b);s.style.setProperty('--room-gold',t.g);
    if(wall) wall.style.filter=theme==='gold'?'saturate(1.12) sepia(.16)':'none';
    try{localStorage.setItem('eris_room_theme_'+rid(),theme)}catch{}
    window.toast?.('Oda teması uygulandı ✓');
  }

  function demoSettings(){
    const p=panel(),d=demo();if(!p)return;
    const level=Number(d?.level||10),cap=Math.min(16,Math.max(8,Number(d?.seat_count)||16));
    const demoLockedDefault=demo()?.locked===true;
    const savedLock=localStorage.getItem('eris_demo_room_locked_'+rid());
    const locked=savedLock===null?demoLockedDefault:savedLock==='1';
    p.innerHTML='<div class="v5-title">👑 Örnek oda yönetimi <button class="v5-btn" data-close>Kapat</button></div>'+
      '<div class="v5-card"><div class="v5-row"><b>Seviye '+level+'</b><small>VIP 12 • TÜM DENEME ÖZELLİKLERİ</small></div><div class="v5-note" style="margin-top:5px">Deneme hesabı: VIP 12 • Oda özelliklerini burada test edebilirsin.</div></div>'+
      '<div class="v5-card"><div class="v5-row"><b>🪑 Koltuk kapasitesi</b><small>'+cap+' / 16</small></div><div class="v5-grid" style="margin-top:7px"><button class="v5-btn '+(cap===8?'primary':'')+'" data-cap="8">8 koltuk</button><button class="v5-btn '+(cap===12?'primary':'')+'" data-cap="12">12 koltuk</button><button class="v5-btn '+(cap===16?'primary':'')+'" data-cap="16">16 koltuk</button><button class="v5-btn" data-cap="auto">Seviyeye göre</button></div></div>'+
      '<div class="v5-card"><div class="v5-row"><b>🔒 Oda kilidi</b><small>'+(locked?'KİLİTLİ':'AÇIK')+'</small></div><input id="v5RoomPassword" class="v5-btn" inputmode="numeric" maxlength="4" placeholder="4 haneli şifre" value="'+(locked?(localStorage.getItem('eris_demo_room_password_'+rid())||'3456'):'')+'" style="width:100%;margin-top:7px;box-sizing:border-box;text-align:left"><div class="v5-grid" style="margin-top:7px"><button class="v5-btn" data-lock>'+(locked?'Kilidi aç':'Kilitle ve şifre belirle')+'</button><button class="v5-btn" data-test-lock>🔐 Giriş testi</button></div><div class="v5-grid" style="margin-top:7px"><button class="v5-btn" data-test-wrong>❌ Yanlış şifre testi</button><button class="v5-btn" data-test-right>✅ Doğru şifre testi</button></div><div class="v5-note">VIP Lounge demo odası varsayılan olarak 3456 ile kilitlidir. Yanlış şifre girişi reddedilir; doğru şifreyle oda açılır.</div></div>'+
      '<div class="v5-card"><b style="font-size:10px">🧪 Sanal kullanıcı testi</b><div class="v5-note" style="margin-top:5px">Koltuk kullanıcılarına dokunup susturma, kilitleme ve odadan atma akışlarını deneyebilirsin.</div><button class="v5-btn" data-ban-history style="width:100%;margin-top:7px">🚫 Odadan atılanlar geçmişi</button></div>'+
      '<div class="v5-card"><b style="font-size:10px">🏆 VIP 12 deneme</b><div class="v5-note" style="margin-top:5px">VIP rozeti • neon • giriş efekti • özel tema • duvar kâğıdı testleri açık.</div></div>';
    p.classList.add('show');p.querySelector('[data-close]').onclick=()=>p.classList.remove('show');
    p.querySelectorAll('[data-cap]').forEach(b=>b.onclick=()=>setCapacity(b.dataset.cap));
    p.querySelector('[data-lock]').onclick=()=>toggleDemoLock(p);p.querySelector('[data-test-lock]').onclick=()=>testDemoLock();p.querySelector('[data-test-wrong]').onclick=()=>testDemoPassword('0000');p.querySelector('[data-test-right]').onclick=()=>testDemoPassword(localStorage.getItem('eris_demo_room_password_'+rid())||'3456');p.querySelector('[data-ban-history]').onclick=showBanHistory;
  }
  function toggleDemoLock(p){const id=rid(),old=localStorage.getItem('eris_demo_room_locked_'+id)==='1'||(localStorage.getItem('eris_demo_room_locked_'+id)===null&&demo()?.locked===true);if(old){localStorage.removeItem('eris_demo_room_locked_'+id);localStorage.removeItem('eris_demo_room_password_'+id);window.toast?.('Demo oda kilidi açıldı ✓');demoSettings();return;}const pass=String(p.querySelector('#v5RoomPassword')?.value||'').trim();if(!/^\d{4}$/.test(pass)){window.toast?.('Tam 4 haneli sayı gir.');return;}localStorage.setItem('eris_demo_room_locked_'+id,'1');localStorage.setItem('eris_demo_room_password_'+id,pass);window.toast?.('Oda kilitlendi. Şifre kaydedildi ✓');demoSettings();}
  function testDemoLock(){const id=rid(),pass=localStorage.getItem('eris_demo_room_password_'+id)||'3456';if(localStorage.getItem('eris_demo_room_locked_'+id)!=='1' && !(demo()?.locked===true && localStorage.getItem('eris_demo_room_locked_'+id)===null)){window.toast?.('Önce odayı kilitle.');return;}const entered=prompt('Kilitli odaya giriş testi — 4 haneli şifre:','');if(entered===null)return;window.toast?.(entered===pass?'Şifre doğru ✓ Giriş kabul edildi.':'Şifre yanlış ✕ Giriş reddedildi.');}
  function testDemoPassword(testPassword){const id=rid(),pass=localStorage.getItem('eris_demo_room_password_'+id)||demo()?.password||'3456';localStorage.setItem('eris_demo_room_locked_'+id,'1');localStorage.setItem('eris_demo_room_password_'+id,pass);window.toast?.(String(testPassword)===String(pass)?'Doğru şifre testi ✓ Giriş kabul edilir.':'Yanlış şifre testi ✓ Giriş reddedilir.');}
  function showBanHistory(){const id=rid(),rows=JSON.parse(localStorage.getItem('eris_demo_ban_history_'+id)||'[]'),p=panel();p.innerHTML='<div class="v5-title">🚫 Odadan atılanlar <button class="v5-btn" data-back>Geri</button></div>'+(rows.length?rows.map(x=>'<div class="v5-card"><b>🚫 '+esc(x.name)+'</b><small>'+esc(x.reason||'Oda yöneticisi tarafından atıldı')+' • '+esc(x.time||'şimdi')+'</small></div>').join(''):'<div class="v5-note">Henüz atılan yok.</div>');p.classList.add('show');p.querySelector('[data-back]').onclick=demoSettings;}
  function setCapacity(value){const d=demo();if(!d){window.toast?.('Gerçek odada kapasite backend ayarıdır.');return;}const next=value==='auto'?(Number(d.level||10)>=7?16:Number(d.level||10)>=5?12:8):Number(value);d.seat_count=Math.min(16,Math.max(8,next));d.level=Math.max(Number(d.level||1),d.seat_count===16?7:d.seat_count===12?5:1);localStorage.setItem('eris_demo_room_capacity_'+rid(),String(d.seat_count));window.toast?.(d.seat_count+' koltuk seçildi ✓');window.openRoom?.(rid(),q('erisLiveTitle')?.textContent||d.name||'Örnek Oda');}

  function seatActions(){
    const box=q('erisLiveSeats');if(!box||box.dataset.v5SeatsBound==='1')return;
    box.dataset.v5SeatsBound='1';
    if(!document.getElementById('eris-seat-action-css')){const st=document.createElement('style');st.id='eris-seat-action-css';st.textContent='.seat-action-pop{position:fixed;z-index:5000;display:flex;gap:7px;padding:7px;border:1px solid #ffffff20;border-radius:16px;background:rgba(10,6,20,.96);box-shadow:0 18px 55px #0009;backdrop-filter:blur(16px)}.seat-action-pop button{width:44px;height:44px;border:1px solid #ffffff16;border-radius:13px;background:#ffffff0c;color:#fff;font-size:20px}.eris-seat{touch-action:none}';document.head.appendChild(st)}
    let timer=0,longPressed=false;
    const hide=()=>document.querySelector('.seat-action-pop')?.remove();
    const canManage=()=>{const r=window.__erisRoomPermissions||{};return String(window.ErisCurrentRoomId||'').startsWith('demo-room-')||!!(r.is_owner||r.is_moderator)};
    const show=seat=>{if(!canManage())return;hide();const demoMode=String(window.ErisCurrentRoomId||'').startsWith('demo-room-'),occupied=seat.classList.contains('occupied'),muted=seat.classList.contains('seat-muted'),locked=seat.classList.contains('locked');const pop=document.createElement('div');pop.className='seat-action-pop';pop.innerHTML=occupied?'<button data-act="mute" title="Sessize al">'+(muted?'🔊':'🔇')+'</button><button data-act="kick" title="Odadan at">🚪</button>':'<button data-act="lock" title="Koltuğu kilitle">'+(locked?'🔓':'🔒')+'</button><button data-act="mute" title="Mikrofonu sessize al">'+(seat.dataset.muted==='1'?'🔊':'🔇')+'</button>';document.body.appendChild(pop);const rr=seat.getBoundingClientRect(),w=pop.offsetWidth,h=pop.offsetHeight;pop.style.left=Math.max(8,Math.min(innerWidth-w-8,rr.left+rr.width/2-w/2))+'px';pop.style.top=Math.max(70,Math.min(innerHeight-h-210,rr.top-h-8))+'px';pop.querySelectorAll('[data-act]').forEach(btn=>btn.onclick=async()=>{const act=btn.dataset.act,num=Number(seat.dataset.seatNumber||0),id=String(window.ErisCurrentRoomId||'');try{if(act==='mute'){if(!demoMode){if(seat.classList.contains('seat-muted')){await roomApi().unmuteSeat(id,num);seat.classList.remove('seat-muted')}else{await roomApi().muteSeat(id,num);seat.classList.add('seat-muted')}}else{seat.dataset.muted=seat.dataset.muted==='1'?'0':'1';seat.querySelector('.seat-mic').textContent=seat.dataset.muted==='1'?'🔇':'🎙'}window.toast?.('Sessize alma durumu güncellendi ✓')}else if(act==='lock'){if(!demoMode){if(seat.classList.contains('locked')){await roomApi().unlockSeat(id,num);seat.classList.remove('locked')}else{await roomApi().lockSeat(id,num);seat.classList.add('locked')}}else seat.classList.toggle('locked');window.toast?.('Koltuk kilidi güncellendi ✓')}else if(act==='kick'){if(!demoMode)await roomApi().ban(id,seat.dataset.userId||'');const rows=JSON.parse(localStorage.getItem('eris_demo_ban_history_'+id)||'[]');rows.unshift({name:seat.querySelector('b')?.textContent||'Kullanıcı',reason:'Odadan atıldı',time:new Date().toLocaleString('tr-TR')});localStorage.setItem('eris_demo_ban_history_'+id,JSON.stringify(rows.slice(0,50)));seat.classList.remove('occupied');seat.classList.add('empty');seat.querySelector('b').textContent='Koltuk '+num;seat.querySelector('small').textContent='Boş • otur';seat.querySelector('.seat-ava').textContent='＋';window.toast?.('Kullanıcı odadan atıldı ✓')}hide()}catch(e){window.toast?.(e.message||'İşlem reddedildi')}})};
    box.addEventListener('pointerdown',e=>{const seat=e.target.closest('.eris-seat');if(!seat)return;longPressed=false;timer=setTimeout(()=>{longPressed=true;show(seat)},520);seat.setPointerCapture?.(e.pointerId)});
    box.addEventListener('pointerup',e=>{clearTimeout(timer);timer=0;const seat=e.target.closest('.eris-seat');if(seat&&longPressed){seat.dataset.longPressed='1';e.preventDefault()}});
    box.addEventListener('pointercancel',()=>{clearTimeout(timer);timer=0});
    box.addEventListener('click',e=>{const seat=e.target.closest('.eris-seat');if(seat?.dataset.longPressed==='1'){e.preventDefault();e.stopPropagation();seat.dataset.longPressed='0'}});
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('.seat-action-pop')&&!e.target.closest('.eris-seat'))hide()},{passive:true});
  }
  function mic(){
    const s=root(),c=s?.querySelector('.eris-room-compose');if(!s||!c)return;
    if(c.querySelector('#erisRoomMicInline'))return;
    const old=q('erisRoomMic');
    old?.remove();
    const b=document.createElement('button');b.id='erisRoomMicInline';b.type='button';b.textContent='🎙️';b.title='Mikrofonu aç/kapat';b.setAttribute('aria-label','Mikrofonu aç/kapat');
    b.onclick=()=>{
      const on=b.classList.toggle('on');
      b.textContent=on?'🎙️':'🔇';
      b.title=on?'Mikrofon açık — kapat':'Mikrofon kapalı — aç';
      window.toast?.(on?'Mikrofon açıldı':'Mikrofon kapatıldı');
    };
    const send=q('erisLiveSend');
    c.insertBefore(b,send||null);
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
      cells.forEach((c,i)=>{c.oninput=()=>{c.value=c.value.replace(/\\D/g,'').slice(0,1);if(c.value&&cells[i+1])cells[i+1].focus();};c.onkeydown=e=>{if(e.key==='Backspace'&&!c.value&&cells[i-1])cells[i-1].focus();if(e.key==='Enter')wrap.querySelector('.erp-ok').click()}});
      wrap.querySelector('.erp-ok').onclick=()=>{const v=cells.map(x=>x.value).join('');if(!/^\\d{4}$/.test(v)){err.textContent='4 haneli şifreyi tamamla.';return}finish(v)};
      cells[0].focus();
    });
  }
  function demoId(){
    const id=rid(); if(!id.startsWith('demo-room-'))return;
    const meta=q('erisLiveMeta');if(meta)meta.textContent='ID: 482731 • DEMO';
  }

  function bind(){
    if(!root())return;
    css();top();mic();demoId();seatActions();syncHeader();
    const saved=localStorage.getItem('eris_room_theme_'+rid());
    if(saved)applyTheme(saved);
  }
  const boot=()=>bind();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('erischat:room-opened',()=>setTimeout(bind,0));
})();