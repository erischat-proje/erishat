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
      #erisProfileHub{margin:12px 0 24px;color:#fff}
      #erisProfileHub .eph-tabs{display:flex;gap:7px;overflow:auto;padding:5px 0 12px;scrollbar-width:thin}
      #erisProfileHub button{border:1px solid #a98aff44;background:#21172f;color:#f9f3ff;border-radius:12px;padding:10px 12px;font-size:11px;white-space:nowrap}
      #erisProfileHub button[aria-selected=true]{background:#754cff;border-color:#b79bff}
      #erisProfileHub .eph-body{background:linear-gradient(145deg,#171023,#0c0913);border:1px solid #ffffff1b;border-radius:19px;padding:15px;min-height:82px;font-size:12px}
      #erisProfileHub .eph-body h3{margin:0 0 12px;font-size:15px}
      #erisProfileHub .eph-row{padding:9px 0;border-bottom:1px solid #ffffff12;display:flex;align-items:center;justify-content:space-between;gap:9px}
      #erisProfileHub .eph-body input,#erisProfileHub .eph-body textarea{display:block;width:100%;box-sizing:border-box;padding:11px;background:#ffffff0b;border:1px solid #ffffff24;color:#fff;border-radius:11px;margin:5px 0 12px;font:inherit}
      #erisProfileHub .eph-body label{font-size:11px;color:#c4b5d2}
      #erisProfileHub .eph-muted{color:#aea0bc;font-size:11px;line-height:1.5}
    </style><div class="eph-tabs" role="tablist" aria-label="Profil bölümleri"></div><div class="eph-body" role="tabpanel" aria-live="polite"></div>`;
    view.append(hub);
    const tabs = [['info','Bilgilerim'],['social','Takip'],['collection','Koleksiyon'],['vip','VIP'],['wallet','Cüzdan'],['gifts','Hediyeler'],['notifications','Bildirimler'],['privacy','Gizlilik'],['blocked','Engellenenler']];
    const strip = hub.querySelector('.eph-tabs');
    for (const [key,label] of tabs) {
      const button = document.createElement('button');button.type='button';button.role='tab';button.dataset.tab=key;button.textContent=label;
      button.onclick=()=>show(key);strip.append(button);
    }
    show('info');
  }
  let requestIndex=0;
  async function show(key) {
    const hub=panel();if(!hub)return;
    const index=++requestIndex, body=hub.querySelector('.eph-body');
    hub.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===key)));
    body.textContent='Yükleniyor…';
    try {
      const me=await window.ErisAuth.getMe();if(index!==requestIndex)return;
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
      if(key==='social') {
        const [followers,following,fans]=await Promise.all([api('/users/'+encodeURIComponent(me.id)+'/followers'),api('/users/'+encodeURIComponent(me.id)+'/following'),api('/users/'+encodeURIComponent(me.id)+'/fans')]);if(index!==requestIndex)return;
        body.innerHTML='<h3>Takip ve hayranlar</h3><div class="eph-row"><span>Takipçi</span><b data-followers></b></div><div class="eph-row"><span>Takip edilen</span><b data-following></b></div><div class="eph-row"><span>Hayran seviyesi</span><b data-level></b></div><div class="eph-muted" data-list></div>';
        body.querySelector('[data-followers]').textContent=String(followers.length);body.querySelector('[data-following]').textContent=String(following.length);body.querySelector('[data-level]').textContent=String(fans.level||0);
        const list=body.querySelector('[data-list]');list.textContent='Takip ettiklerin: ';
        if(!following.length) list.append('Henüz kimseyi takip etmiyorsun.');
        for(const row of following){const button=document.createElement('button');button.type='button';button.textContent=row.user_id;button.onclick=()=>window.openUserProfile?.(row.user_id);list.append(button)}return;
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
          image.style.backgroundImage='url("'+(window.ErisChatCosmetics?.assetUrl(key)||'')+'")';
          const label=document.createElement('div');label.className='eph-muted';label.textContent=type==='frame'?'Çerçeve':'Avatar';
          const use=document.createElement('button');use.type='button';use.textContent='Uygula';use.onclick=async()=>{use.disabled=true;try{await window.ErisChatCosmetics.apply(type,key);await window.ErisProfile.refresh();use.textContent='Uygulandı ✓'}catch(error){use.disabled=false;use.textContent=error.message||'Uygulanamadı'}};
          card.append(image,label,use);grid.append(card);
        }
        const shop=body.querySelector('[data-shop]');shop.onclick=()=>window.showView?.('shop');return;
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
        body.insertAdjacentHTML('beforeend','<h3 style="margin-top:18px">1:1 takas</h3><label>Tutar<input data-amount type="number" min="1" step="1" inputmode="numeric" placeholder="Takas miktarı"></label><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-exchange="lidya_to_gem">Lidya → Gem</button><button type="button" data-exchange="gem_to_lidya">Gem → Lidya</button></div><div class="eph-muted" data-wallet-status role="status"></div>');
        body.querySelectorAll('[data-exchange]').forEach(button=>button.onclick=async()=>{const amount=Number(body.querySelector('[data-amount]').value),status=body.querySelector('[data-wallet-status]');if(!Number.isSafeInteger(amount)||amount<1){status.textContent='1 veya daha büyük tam sayı gir.';return}button.disabled=true;try{const key=globalThis.crypto?.randomUUID?.()||('wallet-'+Date.now()+'-'+Math.random().toString(16).slice(2));const updated=await api('/me/wallet/exchange',{method:'POST',body:JSON.stringify({direction:button.dataset.exchange,amount,idempotency_key:key})});body.querySelector('[data-lidya]').textContent=Number(updated.lidya||0).toLocaleString('tr-TR');body.querySelector('[data-gem]').textContent=Number(updated.lidya_gem||0).toLocaleString('tr-TR');status.textContent='Takas tamamlandı.'}catch(error){status.textContent=error.message||'Takas başarısız.'}finally{button.disabled=false}});return;
      }
      if(key==='gifts') {
        const rows=await api('/users/'+encodeURIComponent(me.id)+'/profile-gifts');if(index!==requestIndex)return;
        body.innerHTML='<h3>Profil hediyeleri</h3>'+(rows.length?rows.map(row=>'<div class="eph-row"><span>'+escape(row.gift)+'</span><b>'+Number(row.amount||0).toLocaleString('tr-TR')+' Lidya</b></div>').join(''):'<div class="eph-muted">Henüz profil hediyesi yok.</div>');return;
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
        body.querySelector('[data-open]').onclick=()=>window.showView?.('anon');return;
      }
      if(key==='blocked') {
        const rows=await api('/me/blocks');if(index!==requestIndex)return;
        body.innerHTML='<h3>Engellenen kullanıcılar</h3>';
        if(!rows.length){body.append('Engellenen kullanıcı yok.');return}
        for(const row of rows){const line=document.createElement('div');line.className='eph-row';const name=document.createElement('span');name.textContent=row.user_id;const button=document.createElement('button');button.type='button';button.textContent='Engeli kaldır';button.onclick=async()=>{button.disabled=true;try{await api('/users/'+encodeURIComponent(row.user_id)+'/block',{method:'DELETE'});line.remove()}catch(error){button.disabled=false;button.textContent=error.message||'Tekrar dene'}};line.append(name,button);body.append(line)}
      }
    }catch(error){if(index===requestIndex)body.textContent=error.message||'Profil bilgileri yüklenemedi.'}
  }
  const start=()=>{mount();window.addEventListener('erischat:auth',event=>{if(event.detail?.state==='ready')show('info')})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
