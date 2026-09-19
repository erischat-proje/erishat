(() => {
  const auth = () => window.ErisAuth;
  const $ = selector => document.querySelector(selector);

  function render(user) {
    if (!user) return;
    const name = $('.profile .name h2');
    const stats = document.querySelectorAll('.profile .stats .stat b');
    if (stats[0]) stats[0].textContent = user.followers_count != null ? Number(user.followers_count).toLocaleString('tr-TR') : '—';
    if (stats[1]) stats[1].textContent = user.following_count != null ? Number(user.following_count).toLocaleString('tr-TR') : '—';
    if (name) name.textContent = user.nickname || 'Anonim';
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
    if (balance && Number.isFinite(Number(user.lidya))) balance.textContent = `💎 ${Number(user.lidya).toLocaleString('tr-TR')}`;
    document.querySelectorAll('[data-erischat-nickname]').forEach(el => { el.textContent = user.nickname || 'Anonim'; });
    if (window.ErisChatCosmetics?.applyAppearance) window.ErisChatCosmetics.applyAppearance();
    fetch((window.ERIS_API||window.ERISCHAT_API||'https://erischat-production.up.railway.app/v1')+'/me/vip',{headers:(()=>{const t=localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';return t?{Authorization:'Bearer '+t}:{}})()}).then(r=>r.ok?r.json():null).then(v=>{if(!v)return;const l=document.getElementById('profileVipLevel'),b=document.getElementById('profileVipBadge'),bar=document.querySelector('.profile .progress .bar i'),pct=document.querySelector('.profile .progressTop span:last-child');const level=Number(v.level||0);if(l)l.textContent=String(level);if(b)b.textContent=level?'VIP '+level:'VIP';if(v.total_spent!=null){const spent=Number(v.total_spent||0);const thresholds=[0,500,1500,3000,5500,9000,14000,21000,30000,42000,58000,78000,105000];const next=thresholds[Math.min(level+1,12)]||spent;const prev=thresholds[Math.min(level,12)]||0;const ratio=level>=12?1:Math.max(0,Math.min(1,(spent-prev)/Math.max(1,next-prev)));if(bar)bar.style.width=(ratio*100)+'%';if(pct)pct.textContent=level>=12?'MAX':Math.round(ratio*100)+'%';}}).catch(()=>{});
  }

  async function refresh() {
    if (!auth()?.getMe) return null;
    const user = await auth().getMe();
    auth().user = user;
    render(user);
    return user;
  }

  async function update(payload) {
    if (!auth()?.updateMe) return null;
    const user = await auth().updateMe(payload);
    auth().user = user;
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
