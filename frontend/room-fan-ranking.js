/* Personal gift supporters: gifts received in any room and in direct messages. */
(() => {
  let request=0;
  const style=document.createElement('style');
  style.textContent=`.personal-fan-overlay{position:fixed;inset:0;z-index:11020;display:grid;place-items:center;background:#070310bf;backdrop-filter:blur(10px);padding:14px}.personal-fan-panel{width:min(480px,100%);max-height:85dvh;display:flex;flex-direction:column;box-sizing:border-box;padding:18px;border:1px solid #bd93ed80;border-radius:25px;color:white;background:linear-gradient(155deg,#251636,#100b1e);box-shadow:0 30px 90px #000b}.personal-fan-panel header{display:flex;justify-content:space-between;align-items:start}.personal-fan-panel header small{font-size:10px;letter-spacing:2px;color:#c3a4ed}.personal-fan-panel h2{margin:5px 0 13px;font-size:24px}.personal-fan-panel button{width:37px;height:37px;flex:none;border:1px solid #d6bbf85a;border-radius:12px;background:#ffffff10;color:#fff;font-size:25px}.personal-fan-panel p{font-size:12px;line-height:1.5;color:#c7b8d8}.personal-fan-list{overflow:auto;min-height:0;flex:1;font-size:13px;color:#cdbbe0}.personal-fan-row{display:flex;align-items:center;gap:6px;margin:0 0 8px}.personal-fan-rank{width:22px;flex:none;text-align:center;color:#d6b2ff;font-weight:800}.personal-fan-avatar{position:relative;flex:none;width:36px;height:36px;display:grid;place-items:center;border:1px solid #c9a6f7;border-radius:50%;background:#492e6b}.personal-fan-avatar img:not(.personal-fan-frame){width:100%;height:100%;object-fit:cover;border-radius:50%}.personal-fan-frame{position:absolute;inset:-4px;width:44px;height:44px;object-fit:contain}.personal-fan-name,.personal-fan-amount{min-width:0;padding:8px;border:1px solid #d6b4f451;border-radius:25px;background:#ffffff0c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.personal-fan-name{flex:1}.personal-fan-row .personal-fan-level{width:28px;height:30px;object-fit:contain;flex:none}.personal-fan-amount{flex:none;font-size:11px}`;
  style.textContent+='.personal-fan-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:2px 0 12px}.personal-fan-tabs button{width:100%;height:36px;font-size:12px;border-radius:12px}.personal-fan-tabs button[aria-selected=true]{background:#673e96;border-color:#c4a0ed}.personal-gift-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.personal-gift-card{padding:9px;border:1px solid #d6b4f451;border-radius:14px;background:#ffffff0c;text-align:center}.personal-gift-card img{width:100%;height:82px;object-fit:contain}.personal-gift-card b{display:block;font-size:12px}';
  document.head.appendChild(style);
  function open(userId) {
    const id=String(userId||'');if(!id)return;
    document.querySelector('.personal-fan-overlay')?.remove();
    const overlay=document.createElement('div');overlay.className='personal-fan-overlay';
    overlay.innerHTML='<section class="personal-fan-panel" role="dialog" aria-modal="true" aria-label="Kişisel hayran sıralaması"><header><div><small>ERISCHAT · PROFİL</small><h2>Hayran sıralaması</h2></div><button type="button" aria-label="Kapat">×</button></header><p>Oda ve özel mesajlarda bu kullanıcıya gelen hediyelerin toplamı. İlk 50 kişi, tüm zamanlar.</p><div class="personal-fan-tabs"><button type="button" data-ranking aria-selected="true">Sıralama</button><button type="button" data-gifts aria-selected="false">Hediyeler</button></div><div class="personal-fan-list" aria-live="polite">Yükleniyor…</div></section>';
    document.body.appendChild(overlay);
    const close=()=>{overlay.remove();request++};
    overlay.querySelector('button').onclick=close;
    overlay.onclick=e=>{if(e.target===overlay)close()};
    const current=++request,list=overlay.querySelector('.personal-fan-list');
    overlay.querySelector('[data-ranking]').onclick=()=>{overlay.querySelector('[data-ranking]').setAttribute('aria-selected','true');overlay.querySelector('[data-gifts]').setAttribute('aria-selected','false');openRanking()};
    overlay.querySelector('[data-gifts]').onclick=async()=>{overlay.querySelector('[data-ranking]').setAttribute('aria-selected','false');overlay.querySelector('[data-gifts]').setAttribute('aria-selected','true');list.textContent='Hediyeler yükleniyor…';try{const rows=await window.ErisPlatform.api('/users/'+encodeURIComponent(id)+'/received-gifts');if(!overlay.isConnected)return;list.replaceChildren();if(!rows.length){list.textContent='Henüz hediye alınmadı.';return}const grid=document.createElement('div');grid.className='personal-gift-list';for(const row of rows){const card=document.createElement('div');card.className='personal-gift-card';const img=document.createElement('img');img.src=row.image_url||'';img.alt=row.gift_key;const count=document.createElement('b');count.textContent='× '+Number(row.count||0).toLocaleString('tr-TR');card.append(img,count);grid.append(card)}list.append(grid)}catch(e){list.textContent=e.message||'Hediyeler yüklenemedi.'}};
    function openRanking(){list.textContent='Sıralama yükleniyor…';
    window.ErisPlatform.api('/users/'+encodeURIComponent(id)+'/fan-leaderboard').then(rows=>{
      if(request!==current||!overlay.isConnected||overlay.querySelector('[data-ranking]').getAttribute('aria-selected')!=='true')return;
      list.replaceChildren();if(!rows.length){list.textContent='Henüz hediye gönderilmedi.';return}
      for(const row of rows){
        const item=document.createElement('div');item.className='personal-fan-row';
        const rank=document.createElement('span');rank.className='personal-fan-rank';rank.textContent=row.rank;
        const avatar=document.createElement('span');avatar.className='personal-fan-avatar';
        const asset=row.avatar_asset&&window.ErisChatCosmetics?.assetUrl?.(row.avatar_asset);
        if(asset){const img=document.createElement('img');img.src=asset;img.alt='';avatar.append(img)}else avatar.textContent=row.avatar||'◈';
        const frame=row.frame_asset&&window.ErisChatCosmetics?.assetUrl?.(row.frame_asset);
        if(frame){const img=document.createElement('img');img.src=frame;img.alt='';img.className='personal-fan-frame';avatar.append(img)}
        const name=document.createElement('span');name.className='personal-fan-name';name.textContent=row.nickname||'Kullanıcı';
        const badge=document.createElement('img');badge.className='personal-fan-level';badge.src='./fan-levels/LEVEL'+Math.max(1,Math.min(40,Number(row.fan_level)||1))+'.png';badge.alt='Hayran seviyesi '+row.fan_level;
        const amount=document.createElement('span');amount.className='personal-fan-amount';amount.textContent=Number(row.total_lidya||0).toLocaleString('tr-TR')+' Lidya';
        if(row.user_id){avatar.style.cursor='pointer';name.style.cursor='pointer';avatar.onclick=name.onclick=()=>window.ErisFloatingProfile?.open(row.user_id)}
        item.append(rank,avatar,name,badge,amount);list.append(item);
      }
    }).catch(e=>{if(current===request)list.textContent=e.message||'Sıralama yüklenemedi.'});}
    openRanking();
  }
  window.ErisPersonalFanRanking=open;
})();
