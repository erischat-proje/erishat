/* ErisChat live shop: render the real cosmetic catalog in the main shop view. */
(() => {
  'use strict';
  const API = () => (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-production.up.railway.app/v1').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const value = token();
    if (value) headers.set('Authorization', `Bearer ${value}`);
    const response = await fetch(`${API()}${path}`, {...options, headers});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }
  const list = value => Array.isArray(value) ? value : value?.items || value?.cosmetics || value?.data || [];
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  const assetUrl = key => window.ErisChatCosmetics?.assetUrl ? window.ErisChatCosmetics.assetUrl(key) : String(key || '');
  const typeOf = item => item.type || item.cosmetic_type || 'avatar';
  const keyOf = item => item.asset_key || item.key || '';
  const vipOf = item => Boolean(item.vip || item.vip_level);
  const vipLevel = item => Number(item.vip_level || item.required_vip_level || 0);
  const demoWallet = () => window.ErisDemoWallet;
  const demoOwned = () => { try { return JSON.parse(localStorage.getItem('erischat_demo_owned_v1') || '[]'); } catch { return []; } };
  const saveDemoOwned = value => localStorage.setItem('erischat_demo_owned_v1', JSON.stringify(value));

  function installStyle() {
    if (document.getElementById('eris-live-shop-style')) return;
    const style = document.createElement('style');
    style.id = 'eris-live-shop-style';
    style.textContent = `
      #shop .liveShopGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      #shop .liveShopCard{border:1px solid #ffffff12;background:#100d16;border-radius:18px;padding:9px;color:#fff}
      #shop .liveShopPreview{height:125px;border-radius:14px;background:radial-gradient(circle,#8a5cff18,transparent 65%),#09070d;display:grid;place-items:center;position:relative;overflow:hidden}
      #shop .liveShopAvatar{width:72px;height:72px;border-radius:50%;background:#2a2034 center/cover no-repeat;z-index:2}
      #shop .liveShopFrame{position:absolute;width:105px;height:105px;background:center/contain no-repeat;z-index:3;pointer-events:none}
      #shop .liveShopName{font-size:10px;font-weight:800;margin-top:8px;word-break:break-word}
      #shop .liveShopMeta{font-size:8px;color:#938a9f;margin-top:4px;min-height:24px}
      #shop .liveShopAction{width:100%;border:0;border-radius:11px;padding:9px 7px;margin-top:7px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-size:9px;font-weight:900}
      #shop .liveShopAction.locked{background:#ffffff0a;border:1px solid #ffffff12;color:#938a9f}
      #shop .liveShopTabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}
      #shop .liveShopTab{border:1px solid #ffffff12;background:#ffffff06;color:#938a9f;border-radius:10px;padding:8px 3px;font-size:8px}
      #shop .liveShopTab.active{color:#fff;background:#8a5cff18;border-color:#8a5cff55}
      #shop .liveShopNote{padding:10px;border:1px dashed #ffffff18;border-radius:12px;color:#938a9f;font-size:9px;line-height:1.45;margin-bottom:9px}
    `;
    document.head.appendChild(style);
  }

  async function render() {
    const root = document.getElementById('shop');
    if (!root) return;
    installStyle();
    root.innerHTML = '<div class="eyebrow">LİDYA MAĞAZASI</div><h1 class="title">Gerçek kozmetik kataloğu.</h1><div class="liveShopNote">Standart avatar ve çerçeveler mağazadan alınır. VIP avatar ve çerçeveler VIP seviyesine ulaşıldığında açılır.</div><div class="liveShopTabs"><button class="liveShopTab active" data-filter="all">Tümü</button><button class="liveShopTab" data-filter="avatar">Avatar</button><button class="liveShopTab" data-filter="frame">Çerçeve</button><button class="liveShopTab" data-filter="vip">VIP</button></div><div class="liveShopGrid">Yükleniyor…</div>';
    const grid = root.querySelector('.liveShopGrid');
    try {
      const [catalog, owned, vip] = await Promise.all([api('/cosmetics'), api('/me/cosmetics'), api('/me/vip')]);
      const items = list(catalog);
      const ownedSet = new Set(list(owned).map(item => `${item.cosmetic_type || item.type}:${item.asset_key || item.key}`));
      const currentVip = Number(vip?.level || 0);
      const localOwned = new Set(demoOwned());
      const renderItems = filter => {
        grid.innerHTML = '';
        const filtered = items.filter(item => filter === 'all' || (filter === 'vip' && vipOf(item)) || typeOf(item) === filter);
        if (!filtered.length) { grid.innerHTML = '<div class="liveShopNote">Bu kategoride kayıtlı kozmetik yok.</div>'; return; }
        filtered.forEach((item, index) => {
          const type = typeOf(item);
          const key = keyOf(item);
          const isVip = vipOf(item);
          const required = vipLevel(item);
          const unlocked = !isVip || currentVip >= required;
          const isOwned = ownedSet.has(`${type}:${key}`) || localOwned.has(`${type}:${key}`);
          const src = assetUrl(key);
          const card = document.createElement('article');
          card.className = 'liveShopCard';
          card.innerHTML = `<div class="liveShopPreview"><div class="liveShopAvatar" style="background-image:url('${esc(src)}')"></div>${type === 'frame' ? `<div class="liveShopFrame" style="background-image:url('${esc(src)}')"></div>` : ''}</div><div class="liveShopName">${type === 'frame' ? 'Çerçeve' : 'Avatar'} #${index + 1}${isVip ? ' • VIP' : ''}</div><div class="liveShopMeta">${isVip ? (unlocked ? `VIP ${required} açıldı` : `VIP ${required} gerekli`) : `${esc(item.gender || 'standart')} • ${Number(item.price || catalog.price || 1000).toLocaleString('tr-TR')} Lidya`}</div>`;
          const action = document.createElement('button');
          action.className = `liveShopAction${isVip && !unlocked ? ' locked' : ''}`;
          if (isVip && !unlocked) {
            action.textContent = `🔒 VIP ${required}`;
            action.disabled = true;
          } else if (isOwned) {
            action.textContent = '✓ Uygula';
            action.onclick = async () => { try { await api('/me/cosmetics/apply', {method:'POST', body:JSON.stringify({cosmetic_type:type, asset_key:key})}); } catch (error) { localStorage.setItem('erischat_demo_applied_v1', JSON.stringify({type,key})); } window.ErisChatCosmetics?.load(); window.toast?.('Görünüm uygulandı ✓'); };
          } else {
            const price = Number(item.price || 1000);
            action.textContent = `Satın al • ${price.toLocaleString('tr-TR')}`;
            action.onclick = async () => { const price = Number(item.price || catalog.price || 1000); try { await api('/me/cosmetics/purchase', {method:'POST', body:JSON.stringify({cosmetic_type:type, asset_key:key})}); } catch (error) { const wallet = demoWallet(); if (!wallet?.spend || !wallet.spend(price)) { window.toast?.(error.message||'Satın alma başarısız.'); return; } const owned = demoOwned(); if (!owned.includes(`${type}:${key}`)) owned.push(`${type}:${key}`); saveDemoOwned(owned); } await render(); window.toast?.('Kozmetik demo olarak satın alındı ✓'); };
          }
          card.appendChild(action);
          grid.appendChild(card);
        });
      };
      root.querySelectorAll('.liveShopTab').forEach(tab => tab.onclick = () => { root.querySelectorAll('.liveShopTab').forEach(x => x.classList.remove('active')); tab.classList.add('active'); renderItems(tab.dataset.filter); });
      renderItems('all');
    } catch (error) {
      const demoItems=[];
      for(let i=1;i<=40;i++) demoItems.push({type:'avatar',asset_key:'demo-avatar-'+i,price:1000+(i-1)*250,name:'Standart Avatar '+i});
      for(let i=1;i<=40;i++) demoItems.push({type:'frame',asset_key:'demo-frame-'+i,price:1500+(i-1)*300,name:'Standart Çerçeve '+i});
      for(let i=1;i<=12;i++){demoItems.push({type:'avatar',asset_key:'demo-vip-avatar-'+i,vip:true,vip_level:i,name:'VIP Avatar '+i});demoItems.push({type:'frame',asset_key:'demo-vip-frame-'+i,vip:true,vip_level:i,name:'VIP Çerçeve '+i});}
      for(let i=1;i<=35;i++) demoItems.push({type:'gift',asset_key:'demo-gift-'+i,price:500+i*250,name:'Hediye '+i});
      const icons=['🖤','💜','💙','💚','💛','❤️','🩷','🩵','✨','👑','🌙','🔥'];
      grid.innerHTML='';
      demoItems.forEach((item,index)=>{
        const card=document.createElement('article');card.className='liveShopCard';
        const icon=icons[index%icons.length]; const isVip=!!item.vip;
        card.innerHTML='<div class="liveShopPreview"><div style="font-size:48px">'+icon+'</div></div><div class="liveShopName">'+esc(item.name)+'</div><div class="liveShopMeta">'+(isVip?'VIP '+item.vip_level+' gerekli':'Demo katalog • '+Number(item.price||500).toLocaleString('tr-TR')+' Lidya')+'</div>';
        const action=document.createElement('button');action.className='liveShopAction'+(isVip?' locked':'');action.textContent=isVip?'🔒 VIP '+item.vip_level:'Demo satın al';
        action.onclick=()=>{if(isVip)return;const price=Number(item.price||500);if(window.ErisDemoWallet?.spend?.(price)){window.toast?.(item.name+' demo olarak alındı ✓');action.textContent='✓ Sahip';action.disabled=true}else window.toast?.('Demo bakiyesi yetersiz.');};
        card.appendChild(action);grid.appendChild(card);
      });
    }
  }

  window.ErisChatLiveShop = {render};
  window.addEventListener('erischat:auth', event => { if (event.detail?.state === 'ready') render(); });
  window.addEventListener('erischat:cosmetics-updated', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once:true}); else render();
})();
