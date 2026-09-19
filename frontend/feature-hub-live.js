/* ErisChat live feature hub: expose the implemented platform systems in one real UI. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  const api = (path, options = {}) => window.ErisPlatform?.api(path, options) ?? Promise.reject(new Error('Platform hazır değil'));
  const css = `
    /* legacy floating hub trigger removed */ #erisHubBtn{display:none!important;position:fixed;right:14px;bottom:88px;z-index:80;border:1px solid #ffffff22;background:#17121f;color:#fff;border-radius:14px;width:44px;height:44px;box-shadow:0 12px 30px #0007}
    #erisHub{display:none;position:fixed;inset:0;z-index:200;background:#030208ee;align-items:flex-end}
    #erisHub.show{display:flex}.eh-sheet{width:min(520px,100%);max-height:92vh;overflow:auto;background:#0b0911;border:1px solid #ffffff18;border-radius:27px 27px 0 0;padding:16px;color:#fff}
    .eh-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.eh-head h2{margin:0;font-size:19px}.eh-close{border:0;background:#ffffff0b;color:#fff;width:36px;height:36px;border-radius:11px}
    .eh-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:13px 0}.eh-tab{border:1px solid #ffffff12;background:#ffffff06;color:#a9a1b0;border-radius:11px;padding:9px 4px;font-size:9px}.eh-tab.active{color:#fff;background:#8a5cff1c;border-color:#8a5cff55}
    .eh-panel{display:none}.eh-panel.active{display:block}.eh-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.eh-card{border:1px solid #ffffff12;background:#12101a;border-radius:15px;padding:10px}.eh-card b{font-size:10px}.eh-card small{display:block;color:#938a9f;font-size:8px;margin-top:4px}.eh-btn{border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;padding:9px 10px;font-size:9px;font-weight:800}.eh-btn.alt{background:#ffffff0a;border:1px solid #ffffff12}.eh-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border:1px solid #ffffff10;background:#12101a;border-radius:14px;margin-bottom:7px}.eh-input{width:100%;box-sizing:border-box;background:#ffffff08;border:1px solid #ffffff14;color:#fff;border-radius:10px;padding:9px;margin:4px 0;font-size:10px}.eh-preview{height:92px;border-radius:12px;background:#09070d;display:grid;place-items:center;position:relative;overflow:hidden}.eh-avatar{width:58px;height:58px;border-radius:50%;background:linear-gradient(145deg,#c48670,#50324d);background-size:cover;background-position:center}.eh-frame{position:absolute;width:84px;height:84px;background-size:contain;background-position:center;background-repeat:no-repeat}.eh-note{padding:10px;border:1px dashed #ffffff18;border-radius:12px;color:#938a9f;font-size:9px;line-height:1.5;margin-bottom:8px}.eh-seats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.eh-seat{border:1px solid #ffffff12;background:#ffffff06;color:#fff;border-radius:10px;padding:8px 2px;font-size:8px}.eh-seat.occupied{border-color:#ff4fa355}.eh-ok{color:#61e6af}.eh-err{color:#ff819d}.eh-kicker{color:#938a9f;font-size:8px;text-transform:uppercase;letter-spacing:1.2px;margin:4px 0 7px}
  `;
  const add = html => document.head.insertAdjacentHTML('beforeend', `<style>${html}</style>`);
  function init(){
    if(document.getElementById('erisHub')) return;
    add(css);
    document.body.insertAdjacentHTML('beforeend', `

      <div id="erisHub"><div class="eh-sheet">
        <div class="eh-head"><div><div class="eh-kicker">ERISCHAT LIVE SYSTEMS</div><h2>Tüm sistemleri gör</h2></div><button class="eh-close" id="ehClose">×</button></div>
        <div class="eh-tabs">
          <button class="eh-tab active" data-tab="rooms">Odalar</button><button class="eh-tab" data-tab="shop">Mağaza</button><button class="eh-tab" data-tab="vip">VIP</button><button class="eh-tab" data-tab="family">Aile</button>
          <button class="eh-tab" data-tab="discover">Keşif</button><button class="eh-tab" data-tab="profile">Profil</button><button class="eh-tab" data-tab="privacy">Gizlilik</button><button class="eh-tab" data-tab="report">Şikayet</button><button class="eh-tab" data-tab="tools">Araçlar</button>
        </div>
        <div id="eh-rooms" class="eh-panel active"></div><div id="eh-shop" class="eh-panel"></div><div id="eh-vip" class="eh-panel"></div><div id="eh-family" class="eh-panel"></div>
        <div id="eh-discover" class="eh-panel"></div><div id="eh-profile" class="eh-panel"></div><div id="eh-privacy" class="eh-panel"></div><div id="eh-report" class="eh-panel"></div><div id="eh-tools" class="eh-panel"></div>
      </div></div>`);
    const hub=document.getElementById('erisHub');
    window.openErisHub=()=>{hub.classList.add('show');loadTab('rooms');};
    document.getElementById('ehClose').onclick=()=>hub.classList.remove('show');
    hub.addEventListener('click',e=>{if(e.target===hub) hub.classList.remove('show');});
    hub.querySelectorAll('.eh-tab').forEach(btn=>btn.onclick=()=>loadTab(btn.dataset.tab));
  }
  async function loadTab(tab){
    document.querySelectorAll('.eh-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
    document.querySelectorAll('.eh-panel').forEach(x=>x.classList.toggle('active',x.id===`eh-${tab}`));
    const panel=document.getElementById(`eh-${tab}`); if(!panel) return;
    if(tab==='rooms') return rooms(panel); if(tab==='shop') return shop(panel); if(tab==='vip') return vip(panel); if(tab==='family') return family(panel);
    if(tab==='discover') return discover(panel); if(tab==='profile') return profile(panel); if(tab==='privacy') return privacy(panel); if(tab==='report') return report(panel); if(tab==='tools') return tools(panel);
  }
  const btn=(label,fn,alt=false)=>{const b=document.createElement('button');b.className=`eh-btn${alt?' alt':''}`;b.textContent=label;b.onclick=fn;return b;};
  async function rooms(panel){
    panel.innerHTML='<div class="eh-note">Buradan kendi odanı açabilir, odalara katılabilir, koltukları deneyebilir ve oda seviyesini/gelişimini canlı görebilirsin.</div><input id="ehRoomName" class="eh-input" placeholder="Yeni oda adı"><div id="ehRoomActions"></div><div class="eh-kicker">Canlı odalar</div><div id="ehRoomList">Yükleniyor…</div>';
    const act=panel.querySelector('#ehRoomActions'); act.append(btn('＋ Oda aç',async()=>{try{const name=panel.querySelector('#ehRoomName').value.trim();if(!name)return (window.toast?.('Oda adı yaz.'), null);const r=await api('/rooms',{method:'POST',body:JSON.stringify({name})});window.toast?.(`Oda açıldı: ${r.name}`);await rooms(panel);}catch(e){window.toast?.(e.message)}}));
    try{const list=await api('/rooms');const wrap=panel.querySelector('#ehRoomList');wrap.innerHTML=''; if(!list.length){wrap.innerHTML='<div class="eh-note">Henüz oda yok. İlk odayı sen açabilirsin.</div>';return;} list.forEach(r=>{const row=document.createElement('div');row.className='eh-row';row.innerHTML=`<div><b>${esc(r.name)}</b><small>Lv.${r.level} • ${r.member_count}/${r.capacity} kişi • ${r.spent_lidya} Lidya</small></div>`;const controls=document.createElement('div');controls.append(btn('Katıl',async()=>{try{await api(`/rooms/${encodeURIComponent(r.id)}/join`,{method:'POST'});await roomDetail(r.id);}catch(e){window.toast?.(e.message)}}));row.append(controls);wrap.append(row);});}catch(e){panel.innerHTML+=`<div class="eh-err">Odalar yüklenemedi: ${esc(e.message)}</div>`;}
  }
  async function roomDetail(id){
    const panel=document.getElementById('eh-rooms'); try{const r=await api(`/rooms/${encodeURIComponent(id)}`);panel.innerHTML=`<div class="eh-row"><div><b>${esc(r.name)}</b><small>Seviye ${r.level} • ${r.member_count}/${r.capacity} • ${r.chat_enabled?'chat açık':'chat kapalı'}</small></div></div><div class="eh-grid"><div class="eh-card"><b>Oda sahibi</b><small>${esc(r.owner_id)}</small></div><div class="eh-card"><b>Seviye ilerlemesi</b><small>${r.spent_lidya} Lidya harcandı</small></div></div><div class="eh-kicker">Koltuklar</div><div class="eh-seats" id="ehSeats"></div><div style="display:flex;gap:7px;margin-top:9px" id="ehRoomCtl"></div><div class="eh-note" style="margin-top:9px">Oda işlemleri artık gerçek backend sistemine bağlı. Yönetici kontrolleri yalnızca yetkili kullanıcıda çalışır.</div>`;const seats=panel.querySelector('#ehSeats');r.seats.forEach(s=>{const b=btn(`${s.seat_number} ${s.user_id?'●':'○'}`,async()=>{try{await api(`/rooms/${encodeURIComponent(r.id)}/seats/${s.seat_number}/join`,{method:'POST'});await roomDetail(r.id);}catch(e){window.toast?.(e.message)}});b.classList.toggle('occupied',!!s.user_id);b.disabled=!!s.locked;seats.append(b);});const ctl=panel.querySelector('#ehRoomCtl');ctl.append(btn('Koltuğu bırak',async()=>{try{await api(`/rooms/${encodeURIComponent(r.id)}/seats/leave`,{method:'DELETE'});await roomDetail(r.id);}catch(e){window.toast?.(e.message)}} ,true));ctl.append(btn('Odadan ayrıl',async()=>{try{await api(`/rooms/${encodeURIComponent(r.id)}/leave`,{method:'POST'});await rooms(panel);}catch(e){window.toast?.(e.message)}} ,true));}catch(e){panel.innerHTML=`<div class="eh-err">${esc(e.message)}</div>`;}
  }
  async function shop(panel){
    panel.innerHTML='<div class="eh-note">139 görünümün tamamı katalogdan geliyor. Standart avatar/çerçeveler satın alınabilir; VIP görünümler VIP seviyesine göre açılır.</div><div class="eh-grid" id="ehShopGrid">Yükleniyor…</div>';
    try{const data=await api('/cosmetics');const items=data.items||[];const owned=await api('/me/cosmetics');const ownedSet=new Set((owned.items||[]).map(x=>`${x.cosmetic_type}:${x.asset_key}`));const vip=await api('/me/vip');const grid=panel.querySelector('#ehShopGrid');grid.innerHTML='';items.forEach((item,i)=>{const card=document.createElement('div');card.className='eh-card';const src=window.ErisChatCosmetics?.assetUrl(item.asset_key)||item.asset_key;const vipReq=item.vip_level||0;const unlocked=!item.vip||vip.level>=vipReq;card.innerHTML=`<div class="eh-preview"><div class="eh-avatar" style="background-image:url('${src}')"></div>${item.type==='frame'?`<div class="eh-frame" style="background-image:url('${src}')"></div>`:''}</div><b>${item.type==='avatar'?'Avatar':'Çerçeve'} #${i+1}${item.vip?' • VIP':''}</b><small>${item.vip?(unlocked?`VIP ${vipReq} açıldı`:`VIP ${vipReq} gerekli`):`${item.gender||'standart'} • ${item.price} Lidya`}</small>`;const key=`${item.type}:${item.asset_key}`;if(item.vip){if(unlocked)card.append(btn('Uygula',async()=>{try{await api('/me/cosmetics/apply',{method:'POST',body:JSON.stringify({cosmetic_type:item.type,asset_key:item.asset_key})});window.toast?.('VIP görünüm uygulandı ✓');}catch(e){window.toast?.(e.message)}}));else card.append(btn('🔒 Kilitli',()=>{},true));}else if(ownedSet.has(key))card.append(btn('Uygula',async()=>{try{await api('/me/cosmetics/apply',{method:'POST',body:JSON.stringify({cosmetic_type:item.type,asset_key:item.asset_key})});window.toast?.('Görünüm uygulandı ✓');}catch(e){window.toast?.(e.message)}}));else card.append(btn(`Satın al • ${item.price}`,async()=>{try{await api('/me/cosmetics/purchase',{method:'POST',body:JSON.stringify({cosmetic_type:item.type,asset_key:item.asset_key})});await shop(panel);}catch(e){window.toast?.(e.message)}}));grid.append(card);});}catch(e){panel.innerHTML+=`<div class="eh-err">Mağaza yüklenemedi: ${esc(e.message)}</div>`;}
  }
  async function vip(panel){try{const v=await api('/me/vip');const perks=(v.perks||[]).map(x=>`<div class="eh-card"><b>✓ ${esc(x)}</b></div>`).join('');panel.innerHTML=`<div class="eh-note">VIP seviyeleri 1 → 12. Kazanılan yetkiler burada gerçek backend verisinden gösterilir.</div><div class="eh-card"><b>VIP ${v.level}</b><small>${v.hidden?'Gizli':'Aktif'} • ${v.neon_color||'standart neon'} • ${v.entry_effect||'standart giriş'}</small></div><div class="eh-kicker">Açılan özellikler</div><div class="eh-grid">${perks||'<div class="eh-note">Henüz VIP özelliği yok.</div>'}</div>`;}catch(e){panel.innerHTML=`<div class="eh-err">${esc(e.message)}</div>`;}}
  async function family(panel){panel.innerHTML='<div class="eh-note">Aile sistemi: aile oluşturma, seviye, kapasite, bakiye ve bağış.</div><input id="ehFamilyName" class="eh-input" placeholder="Yeni aile adı"><div id="ehFamilyBox"></div>';const box=panel.querySelector('#ehFamilyBox');box.append(btn('＋ Aile oluştur',async()=>{try{const n=panel.querySelector('#ehFamilyName').value.trim();if(!n)return;const f=await api('/families',{method:'POST',body:JSON.stringify({name:n})});localStorage.setItem('eris_family_id',f.id);await family(panel);}catch(e){window.toast?.(e.message)}}));const id=localStorage.getItem('eris_family_id');if(id){try{const f=await api(`/families/${encodeURIComponent(id)}`);box.insertAdjacentHTML('beforeend',`<div class="eh-card" style="margin-top:8px"><b>${esc(f.name)}</b><small>Seviye ${f.level} • kapasite ${f.capacity} • bakiye ${f.balance}</small></div><input id="ehDonate" class="eh-input" type="number" min="1" placeholder="Bağış Lidya"><div id="ehDonateBtn"></div>`);box.querySelector('#ehDonateBtn').append(btn('Bağış yap',async()=>{try{const amount=Number(panel.querySelector('#ehDonate').value);await api(`/families/${encodeURIComponent(id)}/donate`,{method:'POST',body:JSON.stringify({amount})});await family(panel);}catch(e){window.toast?.(e.message)}}));}catch(e){box.insertAdjacentHTML('beforeend',`<div class="eh-err">Aile yüklenemedi: ${esc(e.message)}</div>`);}}}
  async function discover(panel){
    panel.innerHTML='<div class="eh-note">Konum/discovery izinleri backend tercihleriyle çalışır. Konum izni verilmeden yakın kullanıcılar listelenmez.</div><div class="eh-grid" id="ehDiscActions"></div><div id="ehDiscResults" style="margin-top:9px"></div>';
    const g=panel.querySelector('#ehDiscActions'),out=panel.querySelector('#ehDiscResults');
    const render=(title,rows,empty='Sonuç bulunamadı.')=>{
      const arr=Array.isArray(rows)?rows:(rows?.users||rows?.items||rows?.results||[]);
      out.innerHTML='<div class="eh-kicker">'+esc(title)+'</div>'+ (arr.length
        ? '<div class="eh-grid">'+arr.map(u=>'<div class="eh-card"><b>'+esc(u.nickname||u.display_name||u.name||u.user_id||'Kullanıcı')+'</b><small>'+esc(u.distance_km!=null?String(u.distance_km)+' km':(u.room_name||u.title||u.conversation_id||u.room_id||'Eşleşme bulundu'))+'</small></div>').join('')+'</div>'
        : '<div class="eh-note">'+esc(empty)+'</div>');
    };
    g.append(btn('Yakındakiler',async()=>{
      try{const x=await api('/discover/nearby');render('Yakındaki kullanıcılar',x,'Yakında kullanıcı yok.');}
      catch(e){window.toast?.(e.message||'Yakındakiler alınamadı.');}
    }));
    g.append(btn('Rastgele sohbet',async()=>{
      try{const x=await api('/discover/random-chat',{method:'POST'});render('Rastgele sohbet',x?.users||[x],'Eşleşme bulunamadı.');}
      catch(e){window.toast?.(e.message||'Rastgele sohbet başlatılamadı.');}
    }));
    g.append(btn('Rastgele oda',async()=>{
      try{const x=await api('/discover/random-room',{method:'POST'});render('Rastgele oda',x?.rooms||[x],'Uygun oda bulunamadı.');}
      catch(e){window.toast?.(e.message||'Rastgele oda bulunamadı.');}
    }));
  }
  async function profile(panel){try{const me=await api('/me');panel.innerHTML=`<div class="eh-card"><b>${esc(me.nickname||me.display_name||me.id)}</b><small>Lidya: ${me.lidya??0} • Cinsiyet: ${esc(me.gender||'-')}</small></div><div class="eh-grid" style="margin-top:8px"><div class="eh-card"><b>Avatar</b><small>${esc(me.avatar_asset||'varsayılan')}</small></div><div class="eh-card"><b>Çerçeve</b><small>${esc(me.frame_asset||'varsayılan')}</small></div></div>`;const id=me.id;const [fans,gifts]=await Promise.all([api(`/users/${encodeURIComponent(id)}/fans`),api(`/users/${encodeURIComponent(id)}/profile-gifts`)]);panel.insertAdjacentHTML('beforeend',`<div class="eh-kicker">Sosyal profil</div><div class="eh-grid"><div class="eh-card"><b>Hayran</b><small>${Array.isArray(fans)?fans.length:(fans.total??0)}</small></div><div class="eh-card"><b>Profil hediyesi</b><small>${Array.isArray(gifts)?gifts.length:(gifts.total??0)}</small></div></div>`);}catch(e){panel.innerHTML=`<div class="eh-err">${esc(e.message)}</div>`;}}
  async function privacy(panel){
    try{
      const p=await api('/me/privacy');
      const entries=Object.entries(p||{});
      panel.innerHTML='<div class="eh-note">Profilde VIP, rozet, neon, giriş ve konum görünürlüğünü yönet.</div><div id="privacyRows"></div><div id="privacyStatus" class="eh-note" style="margin-top:8px">Değişiklikler kaydedildiğinde burada gösterilir.</div>';
      const rows=panel.querySelector('#privacyRows'),status=panel.querySelector('#privacyStatus');
      if(!entries.length){rows.innerHTML='<div class="eh-card"><b>Gizlilik ayarı bulunamadı</b><small>Backend henüz bu hesap için görünürlük alanı döndürmedi.</small></div>';return;}
      entries.forEach(([key,val])=>{
        const row=document.createElement('label');row.className='eh-row';
        row.innerHTML=`<span>${esc(key)}</span><input type="checkbox" ${val?'checked':''}></label>`;
        const input=row.querySelector('input');
        input.onchange=async e=>{
          input.disabled=true;
          try{
            await api('/me/privacy',{method:'PATCH',body:JSON.stringify({[key]:e.target.checked})});
            status.textContent='✓ '+key+' gizlilik ayarı güncellendi.';
          }catch(err){
            e.target.checked=!e.target.checked;
            status.textContent='Güncelleme başarısız: '+(err.message||'bilinmeyen hata');
          }finally{input.disabled=false;}
        };
        rows.append(row);
      });
    }catch(e){panel.innerHTML=`<div class="eh-err">${esc(e.message||'Gizlilik ayarları alınamadı.')}</div>`;}
  }
  function tools(panel){
    const systems=[
      ['🎙️ Ses / Koltuk','Oda koltukları ve ses yüzeyi','seats'],
      ['💬 Oda Sohbeti','Gerçek oda sohbet yüzeyi','roomChat'],
      ['🎵 Müzik','Oda müzik kuyruğu ve oynatma','music'],
      ['📢 Duyuru','Oda duyuru yönetimi','announcement'],
      ['👑 Aile','Aile yönetimi ve sohbet','family'],
      ['🛍️ Mağaza','139 kozmetik vitrini','store'],
      ['👤 Profil Try-on','Avatar ve çerçeve deneme','profile'],
      ['🛡️ Güvenlik / Mod','Bildirim, engelleme ve moderasyon','safety'],
      ['🚀 Onboarding','İlk kullanım akışı','onboarding'],
      ['⚙️ Oda Ayarları','Oda sahibi ayarları','roomSettings'],
      ['🎮 Oyun Merkezi','7 oyunluk müşteri demo kataloğu','games']
    ];
    panel.innerHTML='<div class="eh-note">Tüm yardımcı sistemler burada. Artık ekranın üzerinde sürekli duran popup/buton yığını yok.</div><div class="eh-grid" id="ehToolsGrid"></div>';
    const grid=panel.querySelector('#ehToolsGrid');
    systems.forEach(([title,desc,key])=>{
      const card=document.createElement('div');card.className='eh-card';
      card.innerHTML='<b>'+esc(title)+'</b><small>'+esc(desc)+'</small>';
      const fn=key==='games' ? (window.ErisChatGames?.open ? (()=>window.ErisChatGames.open('main')) : null) : window.ErisDemoExtras?.[key];
      card.append(btn(fn?'Aç':'Hazırlanıyor',fn||(()=>window.toast?.('Bu sistem henüz bağlanmadı.')),!fn));
      grid.append(card);
    });
  }
  function report(panel){panel.innerHTML='<div class="eh-note">Kullanıcı, oda veya mesaj için şikayet oluştur. En az bir hedef alanı ve neden gerekli.</div><input id="ehTarget" class="eh-input" placeholder="Hedef kullanıcı ID (opsiyonel)"><input id="ehRoom" class="eh-input" placeholder="Oda ID (opsiyonel)"><input id="ehMsg" class="eh-input" type="number" placeholder="Mesaj ID (opsiyonel)"><input id="ehCat" class="eh-input" placeholder="Kategori"><textarea id="ehReason" class="eh-input" rows="4" placeholder="Şikayet nedeni"></textarea><div id="ehReportBtn"></div>';panel.querySelector('#ehReportBtn').append(btn('Şikayet gönder',async()=>{try{const category=panel.querySelector('#ehCat').value.trim(),reason=panel.querySelector('#ehReason').value.trim(),target=panel.querySelector('#ehTarget').value.trim(),room=panel.querySelector('#ehRoom').value.trim(),message=panel.querySelector('#ehMsg').value.trim();if(!category||!reason){window.toast?.('Kategori ve şikayet nedeni gerekli.');return}if(!target&&!room&&!message){window.toast?.('En az bir hedef alanı doldur.');return}const payload={target_user_id:target||null,room_id:room||null,message_id:Number(message)||null,category,reason};await api('/reports',{method:'POST',body:JSON.stringify(payload)});window.toast?.('Şikayet kaydedildi ✓');panel.querySelector('#ehCat').value='';panel.querySelector('#ehReason').value='';}catch(e){window.toast?.(e.message)}}));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
