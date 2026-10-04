(function(){
  'use strict';
  async function open(roomId,room){
    const api=window.ErisPlatform?.api;
    if(!api)return window.toast?.('Oda duvar kâğıdı servisi hazır değil.');
    document.getElementById('erisRoomWallpaperModal')?.remove();
    const modal=document.createElement('div');
    modal.id='erisRoomWallpaperModal';
    modal.style.cssText='position:fixed;inset:0;z-index:12000;background:#030208e8;backdrop-filter:blur(12px);display:grid;place-items:center;padding:12px;color:white';
    modal.innerHTML='<style>#erisRoomWallpaperModal .wallpaper-preview{display:grid;place-items:center;width:100%;height:min(55vh,480px);min-height:260px;margin:10px 0;padding:6px;box-sizing:border-box;border-radius:14px;background:#08060c;border:1px solid #ffffff18;overflow:hidden;cursor:zoom-in}#erisRoomWallpaperModal .wallpaper-preview img{display:block;width:100%;height:100%;object-fit:contain}#erisRoomWallpaperZoom{position:fixed;inset:0;z-index:12001;display:grid;place-items:center;padding:12px;background:#020106f5}#erisRoomWallpaperZoom img{display:block;width:100%;height:100%;object-fit:contain}#erisRoomWallpaperZoom button{position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;z-index:1;width:44px;height:44px;border:1px solid #ffffff33;border-radius:50%;background:#17121f;color:white;font-size:24px}#erisRoomWallpaperModal [data-wallpaper-toggle][hidden]{display:none}#erisRoomWallpaperModal .wallpaper-thumbnails{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:210px;overflow:auto}#erisRoomWallpaperModal .wallpaper-thumb{position:relative;min-height:96px;padding:0;border:1px solid #ffffff29;border-radius:11px;background:#120e1b;color:white;overflow:hidden}#erisRoomWallpaperModal .wallpaper-thumb[aria-pressed=true]{border:2px solid #a779ff}#erisRoomWallpaperModal .wallpaper-thumb img{width:100%;height:96px;object-fit:cover}#erisRoomWallpaperModal .wallpaper-thumb.locked img{opacity:.1}#erisRoomWallpaperModal .wallpaper-lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-weight:800}#erisRoomWallpaperModal .wallpaper-lock img{width:12px;height:12px;object-fit:contain;opacity:1;vertical-align:middle}</style><section style="width:min(560px,100%);max-height:94dvh;overflow:auto;border:1px solid #ffffff20;border-radius:22px;background:#100d16;padding:16px;box-sizing:border-box"><header style="display:flex;justify-content:space-between;align-items:center"><div><b>🌌 Oda duvar kâğıdı</b><small style="display:block;color:#a99fb1;margin-top:4px">Süreli kullanım · Lidya ile ödenir</small></div><button data-close class="close" aria-label="Kapat">×</button></header><div data-current style="margin:12px 0;color:#cfc5d8;font-size:12px"></div><div data-thumbnails role="group" aria-label="Duvar kâğıdı seçimi" class="wallpaper-thumbnails"></div><button type="button" data-preview class="wallpaper-preview" aria-label="Seçili duvar kâğıdını tam ekran görüntüle"><img data-preview-image alt="Seçili oda duvar kâğıdı tam boy önizleme"></button><div data-owned-note style="font-size:11px;color:#cfc5d8;margin:4px 0 10px"></div><button type="button" data-wallpaper-toggle hidden style="width:100%;height:42px;margin:0 0 10px;border:1px solid #ffffff24;border-radius:12px;background:#ffffff0a;color:#fff;font-weight:700"></button><div style="font-size:12px;color:#cfc5d8;margin-bottom:7px">Satın alma süresi</div><div data-days style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px"></div><button data-buy class="primary" style="width:100%;height:46px;margin-top:10px">Satın al ve uygula</button><div data-error style="color:#ff9dbd;font-size:12px;margin-top:8px"></div></section>';
    document.body.append(modal);
    modal.querySelector('[data-close]').onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove()};
    try{
      const data=await api('/rooms/'+encodeURIComponent(roomId)+'/wallpaper');
      const thumbs=modal.querySelector('[data-thumbnails]');
      let selectedKey=null;
      const select={get value(){return selectedKey},set value(value){selectedKey=value;drawThumbs()}};
      const preview=modal.querySelector('[data-preview-image]');
      const priceMap=data.prices||{1:1,7:5,30:18};
      const assetUrl=key=>window.ErisChatCosmetics?.assetUrl?.(key)||key;
      const ownedKey=data.asset_key||null;
      let isApplied=!!data.applied;
      let days=1;
      const items=data.items||[];
      selectedKey=ownedKey||items[0]?.key||null;
      function drawThumbs(){thumbs.replaceChildren();items.forEach(item=>{
        const owned=item.free || item.unlocked || item.key===ownedKey || (item.tier==='vip'&&Number(data.owner_vip_level||0)>=Number(item.vip_level));
        const button=document.createElement('button');button.type='button';button.className='wallpaper-thumb'+(owned?'':' locked');button.setAttribute('aria-pressed',String(item.key===selectedKey));button.setAttribute('aria-label',item.key+(owned?' · kullanılabilir':' · kilitli'));
        const image=document.createElement('img');image.src=assetUrl(item.asset);image.alt='';button.append(image);
        if(!owned){const label=document.createElement('span');label.className='wallpaper-lock';const price=item.tier==='vip'?'VIP '+item.vip_level:Number(item.price||0).toLocaleString('tr-TR')+' <img src="./lidya-coin.png" alt="Lidya">';label.innerHTML='🔒<small>'+price+'</small>';button.append(label)}
        button.onclick=()=>{selectedKey=item.key;drawThumbs();draw()};thumbs.append(button)})}
      drawThumbs();
      const toggle=modal.querySelector('[data-wallpaper-toggle]');
      const draw=()=>{
        const item=(data.items||[]).find(x=>x.key===select.value);
        preview.src=item?assetUrl(item.asset):'';
        preview.alt=item?item.key+' · tam boy önizleme':'Duvar kâğıdı önizlemesi';
        const canApply=!!ownedKey&&select.value===ownedKey;
        toggle.hidden=!canApply;
        toggle.textContent=isApplied?'ErisChat standart duvar kâğıdına dön':'Duvar kâğıdımı uygula';
        const relationshipReward=item?.tier==='relationship';const vipReward=item?.tier==='vip'||relationshipReward||item?.free;
        modal.querySelector('header small').textContent=relationshipReward?'İlişki seviyesinde kazanılan duvar kağıdı':item?.free?'Ücretsiz cinsiyete özel standart tema':vipReward?'VIP seviyesine bağlı ücretsiz ödül':'Standart temalar süreli kullanım için satılır';
        modal.querySelector('[data-owned-note]').textContent=relationshipReward?'Aktif ilişkiniz boyunca ücretsiz kullanabilirsiniz.':item?.free?'Herkese açık ücretsiz standart görünüm.':vipReward?'VIP '+item.vip_level+' seviyesine ulaştığında ücretsiz uygulanır.':ownedKey===select.value&&data.paid_until?'Satın alınan tema '+new Date(data.paid_until).toLocaleDateString('tr-TR')+' tarihine kadar tekrar uygulanabilir.':'ErisChat standart duvar kâğıdı herkese açık.';
        modal.querySelector('[data-days]').previousElementSibling.style.display=vipReward?'none':'';
        modal.querySelector('[data-days]').style.display=vipReward?'none':'grid';
        modal.querySelector('[data-days]')?.querySelectorAll('button').forEach((b,i)=>b.textContent=[1,7,30][i]+' gün · '+(Number(item?.price||0)*Number(priceMap[[1,7,30][i]])).toLocaleString('tr-TR')+' Lidya');
        modal.querySelector('[data-buy]').textContent=relationshipReward?'İlişki ödülünü uygula':item?.free?'Standart temayı ücretsiz uygula':vipReward?'VIP ödülünü ücretsiz uygula':ownedKey&&select.value===ownedKey?'Süreyi uzat ve uygula':'Satın al ve uygula';
      };
      draw();
      modal.querySelector('[data-preview]').onclick=()=>{
        if(!preview.src)return;
        const zoom=document.createElement('div');zoom.id='erisRoomWallpaperZoom';
        zoom.innerHTML='<button type="button" aria-label="Önizlemeyi kapat">×</button><img alt="Tam ekran oda duvar kâğıdı">';
        zoom.querySelector('img').src=preview.src;zoom.querySelector('button').onclick=()=>zoom.remove();zoom.onclick=e=>{if(e.target===zoom)zoom.remove()};document.body.append(zoom);
      };
      const current=modal.querySelector('[data-current]');
      current.textContent=ownedKey?'Seçili tema: '+ownedKey+(data.paid_until?' · '+new Date(data.paid_until).toLocaleDateString('tr-TR')+' tarihine kadar':''):'ErisChat standart duvar kâğıdı etkin.';
      const dayBox=modal.querySelector('[data-days]');
      [1,7,30].forEach(d=>{const b=document.createElement('button');b.type='button';b.textContent=d+' gün · '+(Number((data.items||[]).find(x=>x.key===select.value)?.price||0)*Number(priceMap[d])).toLocaleString('tr-TR')+' Lidya';b.style.cssText='padding:11px 5px;border:1px solid #ffffff22;border-radius:10px;background:#ffffff08;color:white;font-size:11px';b.onclick=()=>{days=d;dayBox.querySelectorAll('button').forEach(x=>x.style.borderColor='#ffffff22');b.style.borderColor='#a779ff'};if(d===1)b.style.borderColor='#a779ff';dayBox.append(b)});
      toggle.onclick=async()=>{
        toggle.disabled=true;
        try{
          if(isApplied){await window.ErisRoom.resetWallpaper(roomId);isApplied=false;window.__erisActiveRoomWallpaper=data.default_asset;room.wallpaper_asset=null;room.wallpaper_asset_path=data.default_asset;room.wallpaper_applied=false;window.toast?.('ErisChat standart duvar kâğıdı etkinleştirildi.')}
          else{const result=await window.ErisRoom.applyWallpaper(roomId);isApplied=true;window.__erisActiveRoomWallpaper=result.asset_path;room.wallpaper_asset=result.asset_key;room.wallpaper_asset_path=result.asset_path;room.wallpaper_applied=true;window.toast?.('Duvar kâğıdı yeniden uygulandı.')}
          draw();window.dispatchEvent(new Event('erischat:cosmetics-updated'));
        }catch(e){modal.querySelector('[data-error]').textContent=e.message||'Oda teması değiştirilemedi.'}
        finally{toggle.disabled=false}
      };
      modal.querySelector('[data-buy]').onclick=async()=>{
        const status=modal.querySelector('[data-error]');status.textContent='';
        try{
          const result=await api('/rooms/'+encodeURIComponent(roomId)+'/wallpaper',{method:'POST',body:JSON.stringify({asset_key:select.value,days})});
          window.__erisActiveRoomWallpaper=result.asset_path;room.wallpaper_asset=result.asset_key;room.wallpaper_asset_path=result.asset_path;room.wallpaper_applied=true;
          window.dispatchEvent(new Event('erischat:cosmetics-updated'));window.toast?.(result.spent?'Oda duvar kâğıdı '+days+' gün için satın alındı ve uygulandı.':'VIP oda duvar kâğıdı uygulandı.');modal.remove();
        }catch(e){status.textContent=e.message||'Satın alma başarısız.'}
      };
    }catch(e){modal.querySelector('[data-error]').textContent=e.message||'Duvar kâğıtları alınamadı.'}
  }
  window.ErisChatRoomWallpaper={open};
})();
