(function(){
  'use strict';
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function open(roomId,room){
    const api=window.ErisPlatform?.api;if(!api)return window.toast?.('Oda duvar kâğıdı servisi hazır değil.');
    document.getElementById('erisRoomWallpaperModal')?.remove();
    const modal=document.createElement('div');modal.id='erisRoomWallpaperModal';modal.style.cssText='position:fixed;inset:0;z-index:12000;background:#030208d9;backdrop-filter:blur(12px);display:grid;place-items:center;padding:16px;color:white';
    modal.innerHTML='<section style="width:min(480px,100%);max-height:86vh;overflow:auto;border:1px solid #ffffff20;border-radius:22px;background:#100d16;padding:16px"><header style="display:flex;justify-content:space-between;align-items:center"><div><b>🌌 Oda duvar kâğıdı</b><small style="display:block;color:#a99fb1;margin-top:4px">Geçici kullanım • ücret Lidya ile ödenir</small></div><button data-close class="close">×</button></header><div data-current style="margin:12px 0;color:#cfc5d8;font-size:10px"></div><label style="font-size:10px;color:#cfc5d8">Duvar kâğıdı<select data-select style="display:block;width:100%;margin-top:6px;padding:10px;border-radius:12px;background:#17121f;color:white;border:1px solid #ffffff22"></select></label><div data-preview style="height:145px;margin:10px 0;border-radius:14px;background:#1b1421 center/cover"></div><div style="font-size:10px;color:#cfc5d8;margin-bottom:7px">Kullanım süresi</div><div data-days style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px"></div><button data-buy class="primary" style="width:100%;height:42px;margin-top:10px">Satın al</button><div data-error style="color:#ff9dbd;font-size:10px;margin-top:8px"></div></section>';
    document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()};
    try{
      const data=await api('/rooms/'+encodeURIComponent(roomId)+'/wallpaper');
      const select=modal.querySelector('[data-select]'),preview=modal.querySelector('[data-preview]'),priceMap=data.prices||{1:1000,7:5000,30:18000};let days=1;
      const assetUrl=key=>window.ErisChatCosmetics?.assetUrl?.(key)||key;
      (data.items||[]).forEach(item=>{const opt=document.createElement('option');opt.value=item.key;opt.textContent=(item.tier==='vip'?'VIP '+item.vip_level+' · ':'')+item.key;select.append(opt)});
      if(room.wallpaper_asset)select.value=room.wallpaper_asset;
      const draw=()=>{const item=(data.items||[]).find(x=>x.key===select.value);preview.style.backgroundImage=item?'linear-gradient(#0002,#0002),url("'+String(assetUrl(item.asset)).replace(/"/g,'%22')+'")':''};select.onchange=draw;draw();
      const current=modal.querySelector('[data-current]');current.textContent=data.asset_key?'Etkin duvar kâğıdı: '+data.asset_key+' · '+new Date(data.paid_until).toLocaleDateString('tr-TR')+' tarihine kadar':'Bu odada etkin süreli duvar kâğıdı yok.';
      const dayBox=modal.querySelector('[data-days]');[1,7,30].forEach(d=>{const b=document.createElement('button');b.type='button';b.textContent=d+' gün · '+Number(priceMap[d]).toLocaleString('tr-TR')+' Lidya';b.style.cssText='padding:9px 5px;border:1px solid #ffffff22;border-radius:10px;background:#ffffff08;color:white;font-size:9px';b.onclick=()=>{days=d;dayBox.querySelectorAll('button').forEach(x=>x.style.borderColor='#ffffff22');b.style.borderColor='#a779ff'};if(d===1)b.style.borderColor='#a779ff';dayBox.append(b)});
      modal.querySelector('[data-buy]').onclick=async()=>{const status=modal.querySelector('[data-error]');status.textContent='';try{const result=await api('/rooms/'+encodeURIComponent(roomId)+'/wallpaper',{method:'POST',body:JSON.stringify({asset_key:select.value,days})});window.__erisActiveRoomWallpaper=result.asset_key;window.dispatchEvent(new Event('erischat:cosmetics-updated'));window.toast?.('Oda duvar kâğıdı '+days+' gün için etkinleştirildi.');modal.remove()}catch(e){status.textContent=e.message||'Satın alma başarısız.'}};
    }catch(e){modal.querySelector('[data-error]').textContent=e.message||'Duvar kâğıtları alınamadı.'}
  }
  window.ErisChatRoomWallpaper={open};
})();
