(() => {
  if (!document.getElementById('eris-admin-name-badge-style')) {
    const style = document.createElement('style');
    style.id = 'eris-admin-name-badge-style';
    style.textContent = `
      .profile .name h2{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}
      .eris-admin-name-badge{display:inline-flex;align-items:center;justify-content:center;height:20px;min-width:28px;padding:0 7px;border-radius:7px;font-size:10px;font-weight:950;line-height:1;letter-spacing:.7px;color:#fff;border:1px solid currentColor;box-shadow:0 0 12px currentColor;vertical-align:middle}
      .eris-admin-name-badge-sa{color:#ff5364;background:linear-gradient(135deg,#55121d,#b51f36)}
      .eris-admin-name-badge-ua{color:#ffd15c;background:linear-gradient(135deg,#5b3c08,#b7790b)}
      .eris-admin-name-badge-fa{color:#58b9ff;background:linear-gradient(135deg,#0a3458,#126ca8)}
      .eris-admin-name-badge-da{color:#c78aff;background:linear-gradient(135deg,#351057,#7626ad)}
    `;
    document.head.appendChild(style);
  }
  const auth = () => window.ErisAuth;
  const $ = selector => document.querySelector(selector);
  const socialApi = (path, options) => window.ErisPlatform.api(path, options);

  if (!document.getElementById('eris-profile-follow-lists-style')) {
    const style = document.createElement('style');
    style.id = 'eris-profile-follow-lists-style';
    style.textContent = `
      .profile .stats .stat.eris-own-follow-stat{cursor:pointer;user-select:none;transition:.16s transform,.16s background}
      .profile .stats .stat.eris-own-follow-stat:active{transform:scale(.96)}
      .eris-follow-shade{position:fixed;inset:0;z-index:68000;background:#0009;display:flex;align-items:flex-end;justify-content:center;padding:14px}
      .eris-follow-panel{width:min(520px,100%);max-height:78dvh;overflow:hidden;display:flex;flex-direction:column;background:#120e19;border:1px solid #ffffff18;border-radius:24px 24px 18px 18px;box-shadow:0 24px 80px #000c;color:#fff}
      .eris-follow-head{display:flex;align-items:center;justify-content:space-between;padding:17px 18px;border-bottom:1px solid #ffffff12}
      .eris-follow-head b{font-size:18px}
      .eris-follow-close,.eris-follow-remove{border:0;background:transparent;color:#fff;cursor:pointer}
      .eris-follow-close{font-size:27px;width:38px;height:38px}
      .eris-follow-list{overflow:auto;padding:7px 14px 18px}
      .eris-follow-row{display:flex;align-items:center;gap:12px;padding:12px 2px;border-bottom:1px solid #ffffff0d}
      .eris-follow-avatar{position:relative;width:52px;height:52px;flex:none;display:grid;place-items:center}
      .eris-follow-avatar-main{width:43px;height:43px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:#332640;font-size:23px;overflow:hidden}
      .eris-follow-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
      .eris-follow-info{min-width:0;flex:1}
      .eris-follow-info b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
      .eris-follow-info small{display:block;margin-top:4px;color:#918699;font-size:11px}
      .eris-follow-remove{font-size:23px;width:38px;height:38px;border-radius:50%}
      .eris-follow-remove:active{background:#ffffff10}
      .eris-follow-empty{text-align:center;color:#918699;padding:34px 12px}
      .eris-follow-confirm{position:fixed;inset:0;z-index:69000;background:#000a;display:grid;place-items:center;padding:22px}
      .eris-follow-confirm-card{width:min(390px,100%);background:#17111f;border:1px solid #ffffff18;border-radius:20px;padding:20px;color:#fff;box-shadow:0 25px 80px #000d}
      .eris-follow-confirm-card p{margin:0 0 18px;line-height:1.55;color:#e7dfec}
      .eris-follow-confirm-actions{display:flex;gap:9px}
      .eris-follow-confirm-actions button{flex:1;border:0;border-radius:12px;padding:11px;font-weight:800;cursor:pointer}
      .eris-follow-no{background:#ffffff12;color:#fff}
      .eris-follow-yes{background:linear-gradient(135deg,#754cff,#ff4da3);color:#fff}
    `;
    document.head.appendChild(style);
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const assetUrl = value => {
    if (!value) return '';
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    return value.startsWith('/') ? value : '/' + value;
  };

  const followDate = value => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR',{
      day:'numeric',month:'long',year:'numeric'
    }).format(date);
  };

  function followAvatar(user) {
    const avatarAsset = assetUrl(user.avatar_asset);
    const frameAsset = assetUrl(user.frame_asset);
    return `<div class="eris-follow-avatar">${
      avatarAsset
        ? `<img class="eris-follow-avatar-main" src="${esc(avatarAsset)}" alt="">`
        : `<div class="eris-follow-avatar-main">${esc(user.avatar || '👤')}</div>`
    }${frameAsset ? `<img class="eris-follow-frame" src="${esc(frameAsset)}" alt="">` : ''}</div>`;
  }

  function confirmFollowAction(message) {
    return new Promise(resolve => {
      const shade=document.createElement('div');
      shade.className='eris-follow-confirm';
      shade.innerHTML=`<div class="eris-follow-confirm-card">
        <p>${esc(message)}</p>
        <div class="eris-follow-confirm-actions">
          <button type="button" class="eris-follow-no">Reddet</button>
          <button type="button" class="eris-follow-yes">Onayla</button>
        </div>
      </div>`;
      const finish=value=>{shade.remove();resolve(value)};
      shade.querySelector('.eris-follow-no').onclick=()=>finish(false);
      shade.querySelector('.eris-follow-yes').onclick=()=>finish(true);
      shade.addEventListener('click',e=>{if(e.target===shade)finish(false)});
      document.body.appendChild(shade);
    });
  }

  async function openFollowList(type) {
    const me=auth()?.user || await auth()?.getMe?.();
    if (!me?.id) return;

    const followers=type==='followers';
    const shade=document.createElement('div');
    shade.className='eris-follow-shade';
    shade.innerHTML=`<section class="eris-follow-panel">
      <header class="eris-follow-head">
        <b>${followers?'Takipçiler':'Takip Ettiklerim'}</b>
        <button type="button" class="eris-follow-close" aria-label="Kapat">×</button>
      </header>
      <div class="eris-follow-list"><div class="eris-follow-empty">Yükleniyor…</div></div>
    </section>`;

    shade.querySelector('.eris-follow-close').onclick=()=>shade.remove();
    shade.addEventListener('click',e=>{if(e.target===shade)shade.remove()});
    document.body.appendChild(shade);

    const list=shade.querySelector('.eris-follow-list');

    const load=async()=>{
      try{
        const rows=await socialApi(`/users/${encodeURIComponent(me.id)}/${followers?'followers':'following'}`);
        if(!Array.isArray(rows)||!rows.length){
          list.innerHTML=`<div class="eris-follow-empty">${followers?'Henüz takipçiniz yok.':'Henüz kimseyi takip etmiyorsunuz.'}</div>`;
          return;
        }

        list.innerHTML='';
        rows.forEach(user=>{
          const row=document.createElement('div');
          row.className='eris-follow-row';
          const date=followDate(user.created_at);
          row.innerHTML=`${followAvatar(user)}
            <div class="eris-follow-info">
              <b>${esc(user.nickname||'Kullanıcı')}</b>
              <small>${date ? (followers ? `${esc(date)} tarihinden beri seni takip ediyor` : `${esc(date)} tarihinden beri takip ediyorsun`) : ''}</small>
            </div>
            <button type="button" class="eris-follow-remove" aria-label="Kaldır">×</button>`;

          window.ErisRoleBadges?.bind(row.querySelector('.eris-follow-info b'),user);
          row.querySelector('.eris-follow-remove').onclick=async()=>{
            const nickname=user.nickname||'Kullanıcı';
            const ok=await confirmFollowAction(
              followers
                ? `${nickname} isimli kullanıcıyı takipçileriniz arasından çıkarmak istiyor musunuz?`
                : `${nickname} isimli kullanıcıyı takibi bırakmak istiyor musunuz?`
            );
            if(!ok)return;

            try{
              if(followers){
                await socialApi(`/users/${encodeURIComponent(user.user_id)}/follower`,{method:'DELETE'});
              }else{
                await socialApi(`/users/${encodeURIComponent(user.user_id)}/follow`,{method:'DELETE'});
              }

              await refresh();
              await load();
            }catch(error){
              window.toast?.(error?.message || 'İşlem gerçekleştirilemedi.');
            }
          };

          list.appendChild(row);
        });
      }catch(error){
        list.innerHTML='<div class="eris-follow-empty">Liste yüklenemedi.</div>';
        window.toast?.(error?.message || 'Liste yüklenemedi.');
      }
    };

    await load();
  }

  function bindOwnFollowStats() {
    const boxes=document.querySelectorAll('.profile .stats .stat');
    const followers=boxes[0];
    const following=boxes[1];
    if(!followers||!following)return;

    [
      [followers,'followers','Takipçileri aç'],
      [following,'following','Takip edilenleri aç']
    ].forEach(([box,type,label])=>{
      box.classList.add('eris-own-follow-stat');
      box.setAttribute('role','button');
      box.setAttribute('tabindex','0');
      box.setAttribute('aria-label',label);
      box.onclick=()=>openFollowList(type);
      box.onkeydown=e=>{
        if(e.key==='Enter'||e.key===' '){
          e.preventDefault();
          openFollowList(type);
        }
      };
    });
  }

  function render(user) {
    if (!user) return;
    const name = $('.profile .name h2');
    const stats = document.querySelectorAll('.profile .stats .stat b');
    if (stats[0] && user.followers_count != null) stats[0].textContent = Number(user.followers_count).toLocaleString('tr-TR');
    if (stats[1] && user.following_count != null) stats[1].textContent = Number(user.following_count).toLocaleString('tr-TR');
    bindOwnFollowStats();
    if (name) {
      name.replaceChildren();
      const role = ['SA','UA','FA','DA'].includes(user.admin_role) ? user.admin_role : null;
      if (role) {
        const badge = document.createElement('span');
        badge.className = 'eris-admin-name-badge eris-admin-name-badge-' + role.toLowerCase();
        badge.textContent = role;
        badge.setAttribute('aria-label', role + ' yönetici rozeti');
        name.append(badge);
      }
      const nickname = document.createElement('span');
      nickname.textContent = user.nickname || 'Anonim';
      name.append(nickname);window.ErisRoleBadges?.bind(name,user);
    }
    const face = $('.profile .face');
    if (face) {
      const hasCosmeticAvatar = Boolean(user.avatar_asset || user.avatar?.url || user.avatar?.src || user.avatar?.asset_url || user.avatar?.path || user.avatar?.asset_key);
      if (!hasCosmeticAvatar) {
        face.textContent = user.avatar || '👤';
        face.style.display = 'grid';
        face.style.placeItems = 'center';
        face.style.fontSize = '54px';
      }
    }
    const balance = $('.balance');
    if (balance && Number.isFinite(Number(user.lidya))) balance.textContent = `${Number(user.lidya).toLocaleString('tr-TR')}`;
    document.querySelectorAll('[data-erischat-nickname]').forEach(el => { el.textContent = user.nickname || 'Anonim'; });
    if (window.ErisChatCosmetics?.applyAppearance) window.ErisChatCosmetics.applyAppearance();
    const profile = document.querySelector('.profile');
    if (profile && user.id) window.ErisChatVIP?.watch?.(profile, user.id);

  }

  async function refresh() {
    if (!auth()?.getMe || !(localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token'))) return null;
    const user = await auth().getMe();
    auth().user = user;
    if(window.ErisChatCosmetics?.state)window.ErisChatCosmetics.state.user=user;
    render(user);
    return user;
  }

  async function update(payload) {
    if (!auth()?.updateMe) return null;
    const user = await auth().updateMe(payload);
    auth().user = user;
    if(window.ErisChatCosmetics?.state)window.ErisChatCosmetics.state.user=user;
    render(user);
    window.dispatchEvent(new CustomEvent('erischat:profile', { detail: user }));
    return user;
  }

  async function setNotifications(enabled) {
    return update({ notifications_enabled: Boolean(enabled) });
  }

  window.ErisProfile = { refresh, update, setNotifications, render };

  window.addEventListener('erischat:auth', event => {
    if (event.detail?.state === 'ready') render(event.detail.user);
  });

  const boot = () => refresh().catch(error => console.warn('[ErisChat] profile refresh unavailable', error));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
