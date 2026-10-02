(() => {
  'use strict';
  const api = (path, options) => window.ErisPlatform.api(path, options);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const panel = () => document.getElementById('erisProfileHub');
  function mount() {
    const view = document.getElementById('profile');
    if (!view || panel()) return;
    const hub = document.createElement('section');
    hub.id = 'erisProfileHub';
    hub.innerHTML = `<style>
      #erisProfileHub{margin:16px 0 24px;color:#fff;min-width:0}
      #erisProfileHub .eph-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:5px 0 12px;max-width:100%}
      #erisProfileHub button{min-width:0;width:100%;border:1px solid #ffffff20;background:#15121b;color:#d7d0dc;border-radius:12px;padding:10px 8px;font-size:12px;white-space:normal;min-height:42px;transition:background .16s,border-color .16s,color .16s}
      #erisProfileHub button[aria-selected=true]{background:linear-gradient(135deg,#754cff32,#ef4eac18);border-color:#9c78ff;color:#fff;box-shadow:inset 3px 0 #a77aff}
      #erisProfileHub .eph-body{background:linear-gradient(145deg,#15121c,#0c0a10);border:1px solid #ffffff18;border-radius:19px;padding:17px;min-height:82px;font-size:13px;box-shadow:0 12px 30px #0003}
      #erisProfileHub .eph-body h3{margin:0 0 14px;font-size:16px;letter-spacing:-.2px}
      #erisProfileHub .eph-row{padding:9px 0;border-bottom:1px solid #ffffff12;display:flex;align-items:center;justify-content:space-between;gap:9px}
      #erisProfileHub .eph-body input,#erisProfileHub .eph-body textarea{display:block;width:100%;box-sizing:border-box;padding:12px;background:#100e15;border:1px solid #ffffff20;color:#fff;border-radius:12px;margin:6px 0 14px;font:inherit;outline:none}
      #erisProfileHub .eph-body input:focus,#erisProfileHub .eph-body textarea:focus{border-color:#9b76ff;box-shadow:0 0 0 3px #8a5cff22}
      @media(max-width:520px){#erisProfileHub .eph-tabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#erisProfileHub .eph-tabs button{font-size:11px;padding:9px 7px;min-height:44px}#erisProfileHub .eph-body{padding:15px;border-radius:17px}}
      #erisProfileHub .eph-body label{font-size:11px;color:#c4b5d2}
      #erisProfileHub .eph-muted{color:#aea0bc;font-size:11px;line-height:1.5}
      #erisProfileHub{margin-top:18px}
      #erisProfileHub .eph-tabs{gap:9px;padding-bottom:14px}
      #erisProfileHub .eph-tabs button{display:flex;align-items:center;gap:11px;text-align:left;min-height:64px;padding:12px 15px;border-radius:18px;border-color:#ffffff1b;background:linear-gradient(145deg,#17131e,#100e17);color:#eee8f3;font-size:13px;font-weight:700}
      #erisProfileHub .eph-tabs button[aria-selected=true]{border-color:#b18ade82;background:linear-gradient(145deg,#302139,#191321);box-shadow:none}
      #erisProfileHub .eph-icon{flex:none;width:24px;height:24px;color:#bb99e9;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      #erisProfileHub .eph-body{padding:clamp(18px,4vw,26px);border-color:#a986ce31;border-radius:23px;background:linear-gradient(145deg,#191420,#100e17);box-shadow:none}
      #erisProfileHub .eph-body h3{font-size:19px;letter-spacing:-.35px}
      #erisProfileHub .eph-row{padding:13px 0}
      @media(max-width:390px){#erisProfileHub .eph-tabs button{min-height:70px;padding:10px;gap:8px;font-size:11px}#erisProfileHub .eph-icon{width:20px;height:20px}}
      #erisProfileHub .eph-tabs[hidden],#erisProfileHub .eph-body[hidden]{display:none!important}
      #erisProfileHub .eph-tabs{margin-top:10px;padding:0;max-height:none;overflow:visible;border:0;background:none}
      #erisProfileHub .eph-section-label{display:block;margin:0 2px 12px;color:#b69ace;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}
      #erisProfileHub .eph-tabs button{min-height:52px}
      #erisProfileHub .eph-body{margin-top:12px}
      body.eph-dialog-open{overflow:hidden}
      .eph-overlay[hidden],.eph-overlay [hidden]{display:none!important}
      .eph-overlay{position:fixed;inset:0;z-index:9500;display:grid;place-items:center;padding:16px;background:#030208d9;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
      .eph-dialog{width:min(640px,100%);max-height:min(88dvh,820px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #b996dc39;border-radius:28px;background:radial-gradient(circle at 100% 0,#9b4fbe2b,transparent 55%),linear-gradient(145deg,#1f1829,#0f0d16 78%);box-shadow:0 28px 85px #000b;color:#fff}
      .eph-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px 20px 16px;border-bottom:1px solid #ffffff16}
      .eph-dialog-head small{display:block;color:#bfa8df;font-size:10px;font-weight:800;letter-spacing:1.8px}
      .eph-dialog-head h2{margin:7px 0 0;font-size:clamp(22px,5vw,30px);line-height:1.2}
      .eph-overlay .eph-close{flex:none;width:44px;height:44px;border:1px solid #ffffff21;border-radius:15px;background:#ffffff09;color:#fff;font-size:27px;line-height:1}
      .eph-dialog-content{overflow-y:auto;overscroll-behavior:contain;padding:18px 20px 22px}
      .eph-overlay .eph-body{padding:0;border:0;background:none;box-shadow:none;font-size:13px;color:#eee8f3}
      .eph-overlay .eph-body h3{margin:0 0 16px;font-size:19px}
      .eph-overlay .eph-body label{display:block;color:#c4b5d2;font-size:12px}
      .eph-overlay .eph-body input,.eph-overlay .eph-body textarea{display:block;width:100%;box-sizing:border-box;padding:12px;background:#100e15;border:1px solid #ffffff20;color:#fff;border-radius:12px;margin:6px 0 14px;font:inherit}
      .eph-overlay .eph-body button{min-height:42px;border:1px solid #ffffff20;background:#211a2c;color:#fff;border-radius:12px;padding:10px 13px}
      .eph-overlay .eph-row{padding:12px 0;border-bottom:1px solid #ffffff12;display:flex;align-items:center;justify-content:space-between;gap:10px}
      .eph-overlay .eph-muted{color:#b3a6bf;font-size:11px;line-height:1.5}
      .eph-overlay [data-erischat-profile-controls]{display:grid!important;margin:0!important;border:0!important;background:none!important;padding:0!important}
      .eph-overlay #erisProfileRooms{display:block!important;margin:0}
      .eph-overlay #erisProfileRooms[hidden],.eph-overlay [data-erischat-profile-controls][hidden]{display:none!important}
      @media(max-width:520px){.eph-overlay{padding:12px}.eph-dialog{max-height:90dvh;border-radius:24px}.eph-dialog-head{padding:17px}.eph-dialog-content{padding:16px}}
    </style><div class="eph-nav"><span class="eph-section-label">Profil bölümleri</span><div id="ephTabs" class="eph-tabs" role="tablist" aria-label="Profil bölümleri"></div></div><div class="eph-body" role="tabpanel" aria-live="polite" hidden></div>`;
    view.append(hub);
    const overlay=document.createElement('div');overlay.className='eph-overlay';overlay.hidden=true;
    overlay.innerHTML='<section class="eph-dialog" role="dialog" aria-modal="true" aria-labelledby="ephDialogTitle"><header class="eph-dialog-head"><div><small>ERISCHAT • PROFİL</small><h2 id="ephDialogTitle">Profil</h2></div><button type="button" class="eph-close" aria-label="Kapat">×</button></header><div class="eph-dialog-content"></div></section>';
    document.body.append(overlay);
    overlay.querySelector('.eph-dialog-content').append(hub.querySelector('.eph-body'));
    const settings=view.querySelector('[data-erischat-profile-controls]');if(settings)overlay.querySelector('.eph-dialog-content').append(settings);
    let lastTrigger=null;const close=()=>{if(overlay.hidden)return;overlay.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview');if(lastTrigger?.isConnected)lastTrigger.focus()};
    overlay.querySelector('.eph-close').onclick=close;
    overlay.onclick=e=>{if(e.target===overlay)close()};
    overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Tab'){const focusables=Array.from(overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]'));const first=focusables[0],last=focusables[focusables.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
    const tabs = [['info','Bilgilerim'],['posts','Gönderilerim'],['social','Takip ve hayranlar'],['fan-ranking','Hayran sıralamam'],['collection','Koleksiyon'],['vip','VIP'],['wallet','Cüzdan'],['calls','Arama geçmişleri'],['notifications','Bildirimler'],['privacy','Gizlilik'],['blocked','Engellenenler'],['rooms','Odalarım'],['suggestion','Gelişim Fikri'],['settings','Ayarlar']];
    const strip = hub.querySelector('.eph-tabs');
    const icons={info:'profile',posts:'posts',social:'family','fan-ranking':'family',collection:'collection',vip:'vip',wallet:'wallet',calls:'bell',gifts:'gifts',notifications:'bell',privacy:'privacy',blocked:'blocked',rooms:'discover',suggestion:'posts',settings:'security'};
    for (const [key,label] of tabs) {
      const button = document.createElement('button');button.type='button';button.role='tab';button.dataset.tab=key;button.innerHTML='<svg class="eph-icon" aria-hidden="true"><use href="#home-'+icons[key]+'"></use></svg><span>'+escape(label)+'</span>';
      button.onclick=()=>{if(key==='suggestion'){window.ErisSuggestions?.open?.();return}if(key==='fan-ranking'){window.ErisPlatform.getMe().then(me=>window.ErisPersonalFanRanking?.(me.id)).catch(e=>window.toast?.(e.message));return}lastTrigger=button;show(key)};strip.append(button);
    }
    show('overview');
  }
  let requestIndex=0;
  async function show(key) {
    const hub=panel();if(!hub)return;
    const index=++requestIndex, overlay=document.querySelector('.eph-overlay'),body=overlay.querySelector('.eph-body');
    const labels={info:'Bilgilerim',posts:'Gönderilerim',social:'Takip ve hayranlar',collection:'Koleksiyon',vip:'VIP',wallet:'Cüzdan',calls:'Arama geçmişleri',gifts:'Hediyeler',notifications:'Bildirimler',privacy:'Gizlilik',blocked:'Engellenenler',rooms:'Odalarım',settings:'Ayarlar'};
    hub.closest('#profile')?.setAttribute('data-profile-section',key);
    hub.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===key)));
    body.hidden=['overview','settings','rooms'].includes(key);
    const settings=overlay.querySelector('[data-erischat-profile-controls]');if(settings)settings.hidden=key!=='settings';
    const rooms=overlay.querySelector('#erisProfileRooms');if(rooms)rooms.hidden=key!=='rooms';
    if(key==='overview')return;
    overlay.hidden=false;document.body.classList.add('eph-dialog-open');overlay.querySelector('#ephDialogTitle').textContent=labels[key];overlay.querySelector('.eph-close').focus();
    if(key==='settings')return;
    if(key==='rooms'){await window.ErisProfileRooms?.load?.();if(index!==requestIndex)return;const section=document.getElementById('erisProfileRooms');if(section){section.hidden=false;overlay.querySelector('.eph-dialog-content').append(section)}return}
    body.textContent='Yükleniyor…';
    try {
      const me=await window.ErisAuth.getMe();if(index!==requestIndex)return;
      if(key==='calls') {
        const calls=await api('/calls/history');if(index!==requestIndex)return;
        body.innerHTML='<h3>Arama geçmişleri</h3><div class="eph-muted">Sesli ve görüntülü görüşmeler</div><div data-calls></div>';
        const list=body.querySelector('[data-calls]');if(!calls.length)list.textContent='Henüz arama yok.';
        for(const row of calls){const card=document.createElement('div');card.className='eph-row';const info=document.createElement('div');const name=document.createElement('b');name.textContent=(row.kind==='video'?'📹 ':'☎ ')+row.peer_name;const meta=document.createElement('div');meta.className='eph-muted';const labels={active:'Sürüyor',ringing:'Çalıyor',reject:'Meşgul',unavailable:'Müsait değil',missed:'Ulaşılamıyor',ended:'Bitti'};meta.textContent=(row.incoming?'Gelen':'Giden')+' • '+new Date(row.created_at).toLocaleString('tr-TR')+' • '+(labels[row.status]||row.status)+' • '+Math.floor(row.duration_seconds/60)+' dk '+row.duration_seconds%60+' sn';info.append(name,meta);card.append(info);list.append(card)}return;
      }
      if(key==='info') {
        body.innerHTML='<h3>Hesap bilgileri</h3><div class="eph-muted" data-id></div><label>Ad<input data-first maxlength="64" autocomplete="given-name"></label><label>Soyad<input data-last maxlength="64" autocomplete="family-name"></label><label>Hakkımda<textarea data-bio maxlength="300" rows="3"></textarea></label><button type="button" data-save>Bilgileri kaydet</button><div class="eph-muted" data-status role="status"></div>';
        const publicId=/^\d{10}$/.test(String(me.public_id||''))?String(me.public_id):'';
        body.querySelector('[data-id]').textContent='Kullanıcı ID: '+(publicId||'yüklenemedi');
        body.querySelector('[data-first]').value=me.first_name||'';body.querySelector('[data-last]').value=me.last_name||'';body.querySelector('[data-bio]').value=me.bio||'';
        body.querySelector('[data-save]').onclick=async()=>{
          const btn=body.querySelector('[data-save]');btn.disabled=true;
          try {
            const first_name=body.querySelector('[data-first]').value.trim(),last_name=body.querySelector('[data-last]').value.trim();
            if(!first_name||!last_name)throw new Error('Ad ve soyad gerekli.');
            const updated=await window.ErisProfile.update({first_name,last_name,bio:body.querySelector('[data-bio]').value.trim()});
            body.querySelector('[data-status]').textContent=updated?'Profil kaydedildi.':'Profil kaydedilemedi.';
          }catch(error){body.querySelector('[data-status]').textContent=error.message||'Profil kaydedilemedi.'}finally{btn.disabled=false}
        };return;
      }
      if(key==='posts') {
        body.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div><h3 style="margin:0 0 4px">Gönderilerim</h3><div class="eph-muted">Paylaşımlarını buradan düzenle veya kaldır.</div></div><button type="button" data-create>＋ Paylaş</button></div><div data-posts-list style="margin-top:12px"></div>';
        body.querySelector('[data-create]').onclick=()=>{window.ErisProfileHub.close();window.ErisSocialFeed?.compose?.()};
        const list=body.querySelector('[data-posts-list]');
        if(window.ErisSocialFeed?.loadMine)await window.ErisSocialFeed.loadMine(list);else list.textContent='Gönderi sistemi yüklenemedi.';
        return;
      }
      if(key==='social') {
        const [followers,following,fans]=await Promise.all([api('/users/'+encodeURIComponent(me.id)+'/followers'),api('/users/'+encodeURIComponent(me.id)+'/following'),api('/users/'+encodeURIComponent(me.id)+'/fans')]);if(index!==requestIndex)return;
        body.innerHTML='<h3>Takip ve hayranlar</h3><div class="eph-row"><span>Takipçi</span><b data-followers></b></div><div class="eph-row"><span>Takip edilen</span><b data-following></b></div><div class="eph-row"><span>Hayran seviyesi</span><b data-level></b></div><div class="eph-muted" data-list></div>';
        body.querySelector('[data-followers]').textContent=String(followers.length);body.querySelector('[data-following]').textContent=String(following.length);body.querySelector('[data-level]').textContent=String(fans.level||0);
        const list=body.querySelector('[data-list]');list.textContent='Takip ettiklerin: ';
        if(!following.length) list.append('Henüz kimseyi takip etmiyorsun.');
        for(const row of following){const button=document.createElement('button');button.type='button';button.textContent=row.user_id;button.onclick=()=>{window.ErisProfileHub.close();window.openUserProfile?.(row.user_id)};list.append(button)}return;
      }
      if(key==='collection') {
        const [catalogData,ownedData]=await Promise.all([api('/cosmetics'),api('/me/cosmetics')]);if(index!==requestIndex)return;
        const catalog=Array.isArray(catalogData)?catalogData:catalogData?.items||catalogData?.cosmetics||[];
        const owned=Array.isArray(ownedData)?ownedData:ownedData?.items||ownedData?.cosmetics||[];
        const vipData=await api('/me/vip');if(index!==requestIndex)return;
        body.innerHTML='<h3>Avatar ve çerçeve koleksiyonum</h3><div class="eph-muted" data-count></div><div class="eph-assets" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px"></div><button type="button" data-shop style="margin-top:12px">Mağazayı aç</button>';
        body.querySelector('[data-count]').textContent=owned.length+' sahip olunan görünüm • VIP '+Number(vipData.level||0);
        const grid=body.querySelector('.eph-assets');
        if(!owned.length)grid.innerHTML='<div class="eph-muted">Henüz satın alınmış kozmetik yok. Standart görünümünü mağazadan seçebilirsin.</div>';
        for(const item of owned){
          const key=item.asset_key||item.key,type=item.cosmetic_type||item.type||'avatar';
          const card=document.createElement('div');card.style.cssText='padding:10px;border:1px solid #ffffff18;background:#ffffff08;border-radius:14px;text-align:center';
          const image=document.createElement('div');image.style.cssText='height:66px;background:center/contain no-repeat;margin-bottom:6px';
          if(type==='avatar')image.style.cssText='width:66px;height:66px;border-radius:50%;background:center/cover no-repeat;margin:0 auto 6px';
          image.style.backgroundImage='url("'+(window.ErisChatCosmetics?.assetUrl(key)||'')+'")';
          const label=document.createElement('div');label.className='eph-muted';label.textContent=type==='frame'?'Çerçeve':'Avatar';
          const use=document.createElement('button');use.type='button';use.textContent='Uygula';use.onclick=async()=>{use.disabled=true;try{await window.ErisChatCosmetics.apply(type,key);await window.ErisProfile.refresh();use.textContent='Uygulandı ✓'}catch(error){use.disabled=false;use.textContent=error.message||'Uygulanamadı'}};
          card.append(image,label,use);grid.append(card);
        }
        const shop=body.querySelector('[data-shop]');shop.onclick=()=>{window.ErisProfileHub.close();window.showView?.('shop')};return;
      }
      if(key==='vip') {
        const vip=await api('/me/vip');if(index!==requestIndex)return;
        body.innerHTML='<h3>VIP üyeliği</h3><div class="eph-row"><span>Seviye</span><b data-level></b></div><div class="eph-row"><span>Toplam harcama</span><b data-spent></b></div><div class="eph-row"><span>Sonraki seviye</span><b data-next></b></div><div class="eph-muted" data-perks></div><div data-vip-claims></div><button type="button" data-open style="margin-top:10px">VIP merkezini aç</button>';
        body.querySelector('[data-level]').textContent=String(vip.level||0);body.querySelector('[data-spent]').textContent=Number(vip.total_spent||0).toLocaleString('tr-TR')+' Lidya';body.querySelector('[data-next]').textContent=vip.next_level_spent?Number(vip.next_level_spent).toLocaleString('tr-TR')+' Lidya':'Maksimum seviye';body.querySelector('[data-perks]').textContent=(vip.perks||[]).join(' • ')||'Henüz açılmış VIP özelliği yok.';body.querySelector('[data-open]').onclick=()=>window.showView?.('vip');
        if(Number(vip.level||0)>=10){const claims=body.querySelector('[data-vip-claims]');claims.innerHTML='<h4>VIP 10 ödülleri</h4>';for(const [key,label,claimed] of [['knight_badge','Şövalye rozetini al',vip.knight_badge_claimed],['wallpaper','Özel duvar kağıdını al',vip.wallpaper_claimed]]){const button=document.createElement('button');button.type='button';button.textContent=claimed?'Ödül alındı':label;button.disabled=!!claimed;button.onclick=async()=>{button.disabled=true;try{await api('/me/vip/claims/'+encodeURIComponent(key),{method:'POST'});await show('vip');window.toast?.('VIP ödülü hesabına eklendi ✓')}catch(error){button.disabled=false;button.textContent=error.message||'Ödül alınamadı'}};claims.append(button)}}return;
      }
      if(key==='wallet') {
        const wallet=await api('/me/wallet');if(index!==requestIndex)return;
        body.innerHTML='<h3>Cüzdan</h3><div class="eph-row"><span>Lidya</span><b data-lidya></b></div><div class="eph-row"><span>Lidya taşı</span><b data-gem></b></div>';
        body.querySelector('[data-lidya]').textContent=Number(wallet.lidya||0).toLocaleString('tr-TR');body.querySelector('[data-gem]').textContent=Number(wallet.lidya_gem||0).toLocaleString('tr-TR');
        return;
      }
      if(key==='notifications') {
        const rows=await api('/me/notifications?limit=50');if(index!==requestIndex)return;
        body.innerHTML='<h3>Bildirimler</h3><div data-notifications></div>';
        const list=body.querySelector('[data-notifications]');
        if(!rows.length){list.innerHTML='<div class="eph-muted">Şimdilik bildirim yok.</div>';return}
        for(const row of rows){const line=document.createElement('div');line.className='eph-row';const text=document.createElement('div');const title=document.createElement('b');title.textContent=row.title||'Bildirim';const message=document.createElement('div');message.className='eph-muted';message.textContent=row.body||'';text.append(title,message);line.append(text);if(!row.read){const button=document.createElement('button');button.type='button';button.textContent='Okundu';button.onclick=async()=>{button.disabled=true;try{await api('/me/notifications/'+encodeURIComponent(row.id)+'/read',{method:'POST'});line.remove();if(!list.children.length)list.textContent='Tüm bildirimler okundu.'}catch(error){button.disabled=false;button.textContent=error.message||'Tekrar dene'}};line.append(button)}else{const read=document.createElement('span');read.className='eph-muted';read.textContent='Okundu';line.append(read)}list.append(line)}return;
      }
      if(key==='privacy') {
        body.innerHTML='<h3>Gizlilik ayarları</h3><p class="eph-muted">Profil görünürlüğünü gizlilik ekranından yönetebilirsin.</p><button data-open type="button">Gizlilik ayarlarını aç</button>';
        body.querySelector('[data-open]').onclick=()=>{window.ErisProfileHub.close();window.showView?.('anon')};return;
      }
      if(key==='blocked') {
        const rows=await api('/me/blocks');if(index!==requestIndex)return;
        body.innerHTML='<h3>Engellenen kullanıcılar</h3>';
        if(!rows.length){body.append('Engellenen kullanıcı yok.');return}
        for(const row of rows){const line=document.createElement('div');line.className='eph-row';const name=document.createElement('span');name.textContent=row.user_id;const button=document.createElement('button');button.type='button';button.textContent='Engeli kaldır';button.onclick=async()=>{button.disabled=true;try{await api('/users/'+encodeURIComponent(row.user_id)+'/block',{method:'DELETE'});line.remove()}catch(error){button.disabled=false;button.textContent=error.message||'Tekrar dene'}};line.append(name,button);body.append(line)}
      }
    }catch(error){if(index===requestIndex)body.textContent=error.message||'Profil bilgileri yüklenemedi.'}
  }
  window.ErisProfileHub={close:()=>{const dialog=document.querySelector('.eph-overlay');if(dialog)dialog.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview')},reset:()=>{const dialog=document.querySelector('.eph-overlay');if(dialog)dialog.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview')}};
  const start=()=>{mount();window.addEventListener('erischat:auth',event=>{if(event.detail?.state==='ready' && panel()?.closest('#profile')?.dataset.profileSection==='info')show('info')})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
