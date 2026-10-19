(() => {
  'use strict';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const boot = () => {
    const profile = document.querySelector('.profile');
    if (!profile || document.querySelector('#profile [data-erischat-profile-controls]')) return;
    const name = profile.querySelector('.name h2');
    const balance = profile.querySelector('.balance, .profile .balance');
    const idButton = document.createElement('button');
    idButton.type = 'button';
    idButton.setAttribute('data-profile-public-id', '');
    idButton.setAttribute('aria-label', 'Kullanıcı ID bilgisini kopyala');
    idButton.style.cssText = "display:block;margin:8px auto 0;padding:7px 11px;border:1px solid var(--ui-line);border-radius:999px;background:color-mix(in srgb, var(--ui-button) 6%, transparent);color:var(--ui-gold);font:inherit;font-size:10px;font-weight:700;cursor:pointer";
    idButton.textContent = 'ID: Yükleniyor…';
    profile.querySelector('.name')?.appendChild(idButton);
    const controls = document.createElement('div');
    controls.setAttribute('data-erischat-profile-controls', '');
    controls.style.cssText = "margin-top:18px;padding:14px;border:1px solid var(--ui-line);border-radius:18px;background:color-mix(in srgb, var(--ui-panel) 2%, transparent);display:grid;gap:9px";
    controls.innerHTML = `
      <div style="font-size:11px;font-weight:800">Profil ayarları</div>
      <div hidden style="display:none">
        <input data-profile-nickname maxlength="32" placeholder="Takma ad" autocomplete="nickname" style="flex:1;min-width:0;background:color-mix(in srgb, var(--ui-panel) 3%, transparent);border:1px solid var(--ui-line);color:var(--ui-ink);border-radius:12px;padding:10px;outline:none">
        <button data-profile-save type="button" style="border:0;border-radius:12px;background:linear-gradient(135deg,var(--ui-button),var(--ui-danger-bg));color:var(--ui-ink);padding:0 13px;font-weight:800">Kaydet</button>
      </div>
      <button data-profile-notifications type="button" style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);border-radius:12px;padding:10px;text-align:left">
        <span><b style="display:block;font-size:10px">Bildirimler</b><small data-profile-notification-label style="color:var(--ui-ink);font-size:8px">Yükleniyor…</small></span>
        <span data-profile-switch class="switch"></span>
      </button>
      <div style="border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);border-radius:12px;padding:10px;display:grid;gap:8px">
        <div><b style="font-size:10px">Mesajları kısıtla</b><small data-dm-lock-label style="display:block;color:var(--ui-ink);font-size:8px;margin-top:3px">Yükleniyor…</small></div>
        <div style="display:flex;gap:7px"><select data-dm-lock-gift style="flex:1;min-width:0;background:var(--ui-panel);color:var(--ui-ink);border:1px solid var(--ui-line);border-radius:10px;padding:8px;font-size:9px"></select><button data-dm-lock-toggle type="button" style="border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 4%, transparent);color:var(--ui-ink);border-radius:10px;padding:0 10px;font-size:9px">Aç</button></div>
      </div>
      <button data-profile-logout type="button" style="border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-danger-bg) 5%, transparent);color:var(--ui-danger);border-radius:12px;padding:10px;font-size:10px;font-weight:800">Oturumu kapat</button>
      <div data-profile-status style="font-size:8px;color:var(--ui-ink);min-height:11px"></div>
    `;
    profile.insertAdjacentElement('afterend', controls);
    const roomsBtn=document.createElement('button');roomsBtn.type='button';roomsBtn.innerHTML='<svg class="profileActionIcon" aria-hidden="true"><use href="#home-discover"></use></svg> Odalar';roomsBtn.style.cssText="border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);border-radius:12px;padding:11px;font-size:10px;font-weight:800";controls.appendChild(roomsBtn);
    const openMyRooms=async()=>{const modal=document.createElement('div');modal.className='lydia-profile-overlay';modal.style.cssText="position:fixed;inset:0;z-index:500;background:var(--ui-overlay);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px";modal.innerHTML="<div style=\"width:min(440px,100%);max-height:82vh;overflow:auto;background:var(--ui-panel);border:1px solid var(--ui-line);border-radius:24px;padding:18px;color:var(--ui-ink)\"><div style=\"display:flex;justify-content:space-between;align-items:center\"><b>🏠 Odalarım</b><button class=\"close\" data-close>×</button></div><div data-myrooms style=\"margin-top:12px\">Yükleniyor…</div></div>";document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();try{const raw=await window.ErisPlatform.api('/rooms/me/rooms');const rows=Array.isArray(raw)?raw:(raw?.rooms||raw?.items||raw?.data||[]);const box=modal.querySelector('[data-myrooms]');box.innerHTML=rows.length?rows.map(r=>'<button data-room="'+escapeHtml(r.id)+'" data-name="'+escapeHtml(r.name||'Oda')+"\" style=\"width:100%;text-align:left;margin-bottom:8px;border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);border-radius:16px;padding:12px\"><b>🏠 "+escapeHtml(r.name||'Oda')+"</b><small style=\"display:block;color:var(--ui-ink);margin-top:4px\">"+(r.role==='owner'?'👑 Oda sahibi':'🛡️ Moderatör')+' • ID: '+escapeHtml(/^\d{12}$/.test(String(r.public_id||''))?r.public_id:'yüklenemedi')+' • Seviye '+Number(r.level||1)+'</small></button>').join(''):"<div style=\"color:var(--ui-ink);font-size:9px\">Sahibi veya moderatörü olduğun oda yok.</div>";box.querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>{modal.remove();window.openRoom?.(b.dataset.room,b.dataset.name)});}catch(e){modal.querySelector('[data-myrooms]').textContent=e.message||'Odalar alınamadı.'}};roomsBtn.onclick=()=>{window.ErisProfileHub?.close?.();openMyRooms()};
    const visitorsBtn=document.createElement('button');visitorsBtn.type='button';visitorsBtn.innerHTML='<svg class="profileActionIcon" aria-hidden="true"><use href="#home-privacy"></use></svg> Profilime bakanlar';visitorsBtn.style.cssText="border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);border-radius:12px;padding:11px;font-size:10px;font-weight:800";controls.appendChild(visitorsBtn);
    visitorsBtn.onclick=async()=>{window.ErisProfileHub?.close?.();const modal=document.createElement('div');modal.className='lydia-profile-overlay';modal.style.cssText="position:fixed;inset:0;z-index:550;background:var(--ui-overlay);backdrop-filter:blur(10px);display:grid;place-items:center;padding:16px";modal.innerHTML="<section style=\"width:min(440px,100%);max-height:82vh;overflow:auto;background:var(--ui-panel);border:1px solid var(--ui-line);border-radius:22px;padding:16px;color:var(--ui-ink)\"><header style=\"display:flex;justify-content:space-between;align-items:center\"><b>👁️ Profilime bakanlar</b><button class=\"close\" data-x>×</button></header><div data-list style=\"margin-top:12px\">Yükleniyor…</div></section>";document.body.append(modal);modal.querySelector('[data-x]').onclick=()=>modal.remove();try{const rows=await window.ErisPlatform.api('/me/profile-visitors');const list=modal.querySelector('[data-list]');list.replaceChildren();if(!rows.length){list.textContent='Henüz profilini ziyaret eden yok.';return}rows.forEach(v=>{const row=document.createElement('button');row.className='lydia-profile-list-row';row.type='button';row.style.cssText="width:100%;display:flex;align-items:center;gap:10px;padding:10px;margin:5px 0;border-radius:14px;border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);text-align:left";const avatar=document.createElement('span');avatar.textContent=v.avatar||'👤';avatar.style.cssText="width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--ui-button)";const name=document.createElement('b');name.textContent=v.nickname;window.ErisRoleBadges?.bind(name,v);const date=document.createElement('small');date.textContent=new Date(v.visited_at).toLocaleString('tr-TR');date.style.cssText="display:block;color:var(--ui-ink);font-size:9px;margin-top:3px";const copy=document.createElement('span');copy.style.flex='1';copy.append(name,date);row.append(avatar,copy);row.onclick=()=>window.openUserProfile?.(v.user_id);list.append(row)})}catch(e){modal.querySelector('[data-list]').textContent=e.message||'Ziyaretçiler yüklenemedi.'}};
    const nicknameInput = controls.querySelector('[data-profile-nickname]');
    const saveButton = controls.querySelector('[data-profile-save]');
    const notificationButton = controls.querySelector('[data-profile-notifications]');
    const logoutButton = controls.querySelector('[data-profile-logout]');
    const switchEl = controls.querySelector('[data-profile-switch]');
    const label = controls.querySelector('[data-profile-notification-label]');
    const status = controls.querySelector('[data-profile-status]');
    const toastSafe = message => typeof window.toast === 'function' ? window.toast(message) : (status.textContent = message);
    idButton.addEventListener('click', async () => {
      const publicId = idButton.dataset.publicId;
      if (!/^\d{10}$/.test(publicId || '')) return toastSafe('Kullanıcı ID bilgisi henüz alınamadı.');
      try { await navigator.clipboard.writeText(publicId); toastSafe('Kullanıcı ID kopyalandı.'); }
      catch (_) { toastSafe('Kullanıcı ID: ' + publicId); }
    });
    const setNotificationState = enabled => { switchEl.classList.toggle('on', !!enabled); label.textContent = enabled ? 'Açık' : 'Kapalı'; };
    const lockLabel = controls.querySelector('[data-dm-lock-label]'), lockGift = controls.querySelector('[data-dm-lock-gift]'), lockToggle = controls.querySelector('[data-dm-lock-toggle]');
    let dmLock = {enabled:false,gift_key:'Zeytin Dalı'};
    Promise.all([window.ErisPlatform?.getMessageRestriction?.(),window.ErisPlatform?.messageGifts?.()]).then(([state,gifts])=>{
      dmLock=state||dmLock; lockGift.replaceChildren(); (gifts||[]).forEach(g=>{const option=document.createElement('option');option.value=g.gift_key;option.textContent=`${g.gift_key} · ${Number(g.unit_price).toLocaleString('tr-TR')} Lidya`;lockGift.append(option)});
      lockGift.value=dmLock.gift_key; lockLabel.textContent=dmLock.enabled?`Açık · Her yeni kullanıcı ${dmLock.gift_key} gönderdikten sonra yazabilir.`:'Kapalı · Sana herkes mesaj gönderebilir.';lockToggle.textContent=dmLock.enabled?'Kapat':'Aç';
    }).catch(()=>{lockLabel.textContent='Ayar yüklenemedi.'});
    lockToggle.addEventListener('click',async()=>{try{dmLock=await window.ErisPlatform.setMessageRestriction({enabled:!dmLock.enabled,gift_key:lockGift.value});lockLabel.textContent=dmLock.enabled?`Açık · Her yeni kullanıcı ${dmLock.gift_key} gönderdikten sonra yazabilir.`:'Kapalı · Sana herkes mesaj gönderebilir.';lockToggle.textContent=dmLock.enabled?'Kapat':'Aç';toastSafe(dmLock.enabled?'Mesaj kısıtlaması açıldı.':'Mesaj kısıtlaması kapatıldı.')}catch(e){toastSafe(e.message||'Ayar kaydedilemedi.')}});
    const render = user => {
      if (!user) return;
      if (nicknameInput && user.nickname) nicknameInput.value = user.nickname;
      setNotificationState(user.notifications_enabled !== false);
      if (balance && user.lidya != null) balance.textContent = `${Number(user.lidya).toLocaleString('tr-TR')}`;
      if (name && user.nickname) {name.textContent = user.nickname;window.ErisRoleBadges?.bind(name,user);}
      const publicId = /^\d{10}$/.test(String(user.public_id || '')) ? String(user.public_id) : '';
      idButton.dataset.publicId = publicId;
      idButton.textContent = publicId ? `ID: ${publicId}  ⧉` : 'Kullanıcı ID yüklenemedi';
      const face = profile.querySelector('.face');
      const frame = profile.querySelector('.frameImg');
      const assetValue = value => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        return value.url || value.src || value.asset_url || value.path || value.asset_key || '';
      };
      const assetUrl = value => {
        const raw = assetValue(value);
        return raw && window.ErisChatCosmetics?.assetUrl ? window.ErisChatCosmetics.assetUrl(raw) : raw;
      };
      const avatarUrl = assetUrl(user.avatar_asset);
      const frameUrl = assetUrl(user.frame_asset);
      if (face) {
        if (avatarUrl) {
          face.style.backgroundImage = `url("${avatarUrl.replace(/"/g,'%22')}")`;
          face.style.backgroundSize = 'cover';
          face.style.backgroundPosition = 'center';
          face.textContent = '';
        } else {
          face.style.backgroundImage = '';
        }
      }
      if (frame) {
        frame.src = frameUrl || '';
        frame.style.display = frameUrl ? '' : 'none';
      }
      if (window.ErisChatCosmetics?.applyAppearance) window.ErisChatCosmetics.applyAppearance();
      if (user.id) window.ErisChatVIP?.watch?.(profile, user.id);
    };
    const refresh = async () => {
      try {
        if (!window.ErisAuth?.getMe) return;
        const user = await window.ErisAuth.getMe();
        render(user);
        status.textContent = 'Profil gerçek hesap verisiyle senkronize.';
      } catch (_) { status.textContent = 'Profil verisi alınamadı.'; }
    };
    saveButton.addEventListener('click', async () => {
      const nickname = (nicknameInput.value || '').trim();
      if (!nickname) return toastSafe('Takma ad boş olamaz.');
      saveButton.disabled = true;
      try {
        const user = await window.ErisAuth.updateMe({ nickname });
        render(user);
        window.dispatchEvent(new CustomEvent('erischat:profile', { detail: user }));
        toastSafe('Profil güncellendi ✓');
      } catch (error) { toastSafe(error.message || 'Profil güncellenemedi.'); }
      finally { saveButton.disabled = false; }
    });
    notificationButton.addEventListener('click', async () => {
      const enabled = !switchEl.classList.contains('on');
      notificationButton.disabled = true;
      try {
        if (enabled && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
        const user = await window.ErisAuth.updateMe({ notifications_enabled: enabled });
        window.ErisNotifications?.apply({hide_notifications:!enabled});
        render(user);
        toastSafe(enabled ? 'Bildirimler açıldı 🔔' : 'Bildirimler kapatıldı');
      } catch (error) { toastSafe(error.message || 'Bildirim ayarı güncellenemedi.'); }
      finally { notificationButton.disabled = false; }
    });
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        await window.ErisAuth.logout();
        status.textContent = 'Oturum kapatıldı.';
      } catch (error) { toastSafe(error.message || 'Oturum kapatılamadı.'); }
      finally { logoutButton.disabled = false; }
    });
    window.addEventListener('erischat:auth', event => { if (event.detail?.user) render(event.detail.user); else if (event.detail?.state === 'logged_out') status.textContent = 'Oturum kapatıldı.'; else refresh(); });
    window.addEventListener('erischat:profile', event => render(event.detail));
    window.addEventListener('erischat:cosmetics-updated', () => render(window.ErisAuth?.user));
    refresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
