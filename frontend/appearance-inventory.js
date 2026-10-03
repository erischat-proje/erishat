(() => {
  'use strict';
  const labels={avatar:'Avatar',frame:'Çerçeve',wallpaper:'Duvar kağıdı',bubble:'Sohbet balonu',title:'Ünvan',entrance:'Oda girişi',ring:'Yüzük',relationship_status:'İlişki düzeyi ünvanı'};
  const api=(p,o)=>window.ErisPlatform.api(p,o);
  async function render(root,current=()=>true,initialCategory=null){
    root.textContent='Koleksiyon yükleniyor…';const data=await api('/me/appearance-inventory');if(!current()||!root.isConnected)return;
    root.replaceChildren();const title=document.createElement('h3');title.textContent='Koleksiyonum';const tabs=document.createElement('div');tabs.className='appearance-tabs';tabs.setAttribute('aria-label','Koleksiyon kategorileri');const grid=document.createElement('div');grid.className='appearance-grid';root.append(title,tabs,grid);
    let category=initialCategory||(data.categories||Object.keys(labels))[0];
    function draw(){grid.replaceChildren();const items=data.items.filter(i=>i.type===category);tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
      if(!items.length){const empty=document.createElement('p');empty.className='eph-muted';empty.textContent='Bu kategoride sahip olduğun görünüm yok.';grid.append(empty);return;}
      for(const item of items){const card=document.createElement('article');card.className='appearance-item';const image=document.createElement('img');image.src=window.ErisChatCosmetics.assetUrl(item.asset);image.alt=item.name;image.loading='lazy';image.onerror=()=>{image.hidden=true;card.dataset.imageMissing='true'};const name=document.createElement('b');name.textContent=(item.type==='relationship_status'?item.name:labels[item.type])+(item.level?' · Seviye '+item.level:'');const source=document.createElement('small');source.textContent={relationship:'İlişki ödülü',vip:'VIP ödülü',standard:'Standart'}[item.source]||'';const use=document.createElement('button');use.type='button';use.textContent=item.equipped?'✓ Kullanılıyor':item.compatible===false?'Yüzükle uyumsuz':'Uygula';use.disabled=item.equipped||item.compatible===false;
        use.onclick=async()=>{use.disabled=true;try{const relation=item.source==='relationship';const path=item.type==='ring'?'/relationship/ring/equip':relation?'/relationship/rewards/equip':item.type==='wallpaper'?'/me/wallpaper/apply':'/me/cosmetics/apply';const payload=item.type==='ring'?{ring:item.equip_key}:relation?{kind:item.type,asset_key:item.equip_key}:{cosmetic_type:item.type,asset_key:item.equip_key};await api(path,{method:'POST',body:JSON.stringify(payload)});window.dispatchEvent(new Event('erischat:cosmetics-updated'));window.ErisProfile?.refresh?.();if(current()&&root.isConnected)await render(root,current,category);}catch(e){use.disabled=false;window.toast?.(e.message||'Görünüm uygulanamadı.')}};
        card.append(image,name,source,use);grid.append(card);}}
    for(const cat of data.categories||Object.keys(labels)){const b=document.createElement('button');b.type='button';b.dataset.category=cat;b.textContent=(labels[cat]||cat)+' ('+data.items.filter(i=>i.type===cat).length+')';b.onclick=()=>{category=cat;draw()};tabs.append(b);}draw();
  }
  window.ErisAppearanceInventory={render};
})();
