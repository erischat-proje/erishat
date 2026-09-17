/* ErisChat customer demo extras: visualize remaining product surfaces without pretending unavailable backend is live. */
(() => {
  'use strict';
  if (window.__ERIS_DEMO_EXTRAS__) return;
  window.__ERIS_DEMO_EXTRAS__ = true;

  const api = (path, options = {}) => window.ErisPlatform?.api ? window.ErisPlatform.api(path, options) : Promise.reject(new Error('Platform hazır değil'));
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const asset = key => window.ErisChatCosmetics?.assetUrl ? window.ErisChatCosmetics.assetUrl(key) : `Gereken_icerikler/${String(key || '').replace(/^\//,'')}`;
  const card = html => `<div style="background:#12101a;border:1px solid #ffffff12;border-radius:15px;padding:11px">${html}</div>`;
  const button = (text, fn) => { const b=document.createElement('button'); b.textContent=text; b.style.cssText='border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;padding:9px 10px;font-size:9px;font-weight:800'; b.onclick=fn; return b; };
  const modal = (title, body) => { const el=document.createElement('div'); el.style.cssText='position:fixed;inset:0;z-index:520;background:#020107ed;display:flex;align-items:flex-end;justify-content:center'; el.innerHTML=`<div style="width:min(620px,100%);max-height:94vh;overflow:auto;background:#0a0810;color:#fff;border:1px solid #ffffff18;border-radius:26px 26px 0 0;padding:16px;font-family:inherit"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:8px;letter-spacing:1.3px;color:#938a9f">ERISCHAT • CUSTOMER DEMO+</div><h2 style="margin:4px 0 12px;font-size:20px">${esc(title)}</h2></div><button data-close style="border:0;border-radius:11px;background:#ffffff0b;color:#fff;width:36px;height:36px">×</button></div><div id="demoExtraBody">${body}</div></div>`; document.body.append(el); el.querySelector('[data-close]').onclick=()=>el.remove(); return el; };

  function seatsDemo(){
    const seats=Array.from({length:12},(_,i)=>({n:i+1,name:i<7?['Eris','Lavin','Nora','Mert','Ayla','Rana','Cesur'][i]:'Boş',state:i<7?'DOLU':'BOŞ'}));
    const m=modal('🎙️ Oda koltukları + ses yüzeyi',`<div style="padding:11px;border-radius:14px;background:#8a5cff10;border:1px solid #ffffff10;margin-bottom:9px"><b>12 koltuklu oda</b><small style="display:block;color:#938a9f;margin-top:4px">Bu ekran müşteri demosundaki koltuk, mikrofon, susturma ve konuşmacı durumunu gösterir. Gerçek WebRTC transportu ayrıca geliştirilecektir.</small></div><div id="seatGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:7px"></div>`);
    const grid=m.querySelector('#seatGrid'); seats.forEach(s=>{const d=document.createElement('div');d.innerHTML=card(`<div style="display:flex;justify-content:space-between"><b>🎙️ ${s.n}. ${s.name}</b><span style="font-size:8px">${s.state}</span></div><small style="display:block;color:#938a9f;margin-top:4px">${s.state==='DOLU'?'🎤 Açık • 🔊 konuşuyor':'🔒 boş koltuk'}</small>`);grid.append(d);});
  }

  function musicDemo(){
    const queue=[['🎵','Sezen Aksu','Gülümse'],['🎵','Müslüm Gürses','Nilüfer'],['🎵','Teoman','Paramparça'],['🎵','Mor ve Ötesi','Bir Derdim Var']];
    const body=`<div style="display:flex;gap:7px;margin-bottom:9px"><span style="padding:8px 10px;border-radius:10px;background:#8a5cff18">▶ Şimdi çalıyor</span><span style="padding:8px 10px;border-radius:10px;background:#ffffff08">🔁 Kuyruk</span></div><div>${queue.map((x,i)=>card(`<div style="display:flex;justify-content:space-between;gap:8px"><div><b>${x[0]} ${esc(x[1])}</b><small style="display:block;color:#938a9f;margin-top:3px">${esc(x[2])}</small></div><span style="font-size:8px">${i===0?'▶ Çalıyor':'#'+(i+1)}</span></div>`)).join('<div style="height:6px"></div>')}</div><div id="musicControls" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px"></div><small style="display:block;color:#938a9f;margin-top:9px">Demo yüzeyi: sıra ekleme/çıkarma, oynat/durdur, moderasyon. Gerçek ses kaynağı/stream transportu production işidir.</small>`;
    const m=modal('🎵 Oda müzik merkezi',body); const c=m.querySelector('#musicControls'); ['▶ Oynat','⏸ Durdur','➕ Kuyruğa ekle','🗑 Seçiliyi kaldır','🛡 DJ kilidi'].forEach(t=>c.append(button(t,()=>window.toast?.(`${t} demo işlemi`))));
  }

  async function announcementDemo(){
    let roomId=''; try { const rooms=await api('/rooms'); const arr=Array.isArray(rooms)?rooms:(rooms?.rooms||[]); roomId=arr[0]?.id||arr[0]?.room_id||''; } catch(e){}
    const m=modal('📢 Duyuru yönetimi',`<div style="display:grid;gap:8px"><input id="annText" placeholder="Oda duyurusu..." style="padding:10px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:10px"><div id="annOut"></div><small style="color:#938a9f">Mevcut backend yalnızca son duyuruyu GET ile gösteriyor; yazma endpointi yoksa buton demo durumunda kalır.</small><div id="annBtns" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>`);
    const out=m.querySelector('#annOut'),bs=m.querySelector('#annBtns'); ['📌 Yayınla','✏️ Düzenle','🗑 Kaldır','📣 Sabitle'].forEach(t=>bs.append(button(t,async()=>{ if(t.includes('Yayınla')&&roomId){try{const x=await api(`/rooms/${encodeURIComponent(roomId)}/announcement`);out.innerHTML=card(`<b>📢 ${esc(x.message||'Yeni duyuru')}</b>`);}catch(e){out.innerHTML=card('<b>Demo duyuru</b><small style="display:block;color:#938a9f">Backend yazma endpointi mevcut değil.</small>')}}else out.innerHTML=card(`<b>${esc(t)}</b><small style="display:block;color:#938a9f">Müşteri demo etkileşimi gösterildi.</small>`)}))); }

  async function familyDemo(){
    let data=null; try { const me=await api('/me'); const families=await api('/families'); data=Array.isArray(families)?families[0]:families; if(!data && me) data={name:'Demo Ailesi',level:1,balance:0,capacity:30}; } catch(e){ data={name:'Demo Ailesi',level:1,balance:0,capacity:30}; }
    const members=['Kurucu • Eris','Yönetici • Lavin','Üye • Nora','Üye • Mert','Üye • Ayla'];
    const m=modal('👑 Aile yönetimi + aile sohbeti',`${card(`<b>👑 ${esc(data?.name||'Demo Ailesi')}</b><small style="display:block;color:#938a9f;margin-top:4px">Seviye ${Number(data?.level||1)} • ${Number(data?.capacity||30)} kapasite • ${Number(data?.balance||0).toLocaleString('tr-TR')} bakiye</small>`)}<div style="height:8px"></div><div id="familyMembers">${members.map((x,i)=>card(`<div style="display:flex;justify-content:space-between"><b>${esc(x)}</b><span style="font-size:8px">${i===0?'KURUCU':'AKTİF'}</span></div><small style="display:block;color:#938a9f;margin-top:4px">${i===0?'Yetki: tüm aile yönetimi':'Yetki: üye'}</small>`)).join('<div style="height:6px"></div>')}</div><div id="familyActions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px"></div><div style="margin-top:9px">${card('<b>💬 Aile sohbeti</b><small style="display:block;color:#938a9f;margin-top:4px">Gerçek endpoint aile sohbetinin açık olduğunu doğruluyor; mesaj geçmişi ayrı chat akışına bağlanacak.</small>')}</div>`);
    const a=m.querySelector('#familyActions'); ['➕ Üye davet et','👤 Üyeyi çıkar','🛡 Rol değiştir','💬 Aile sohbetini aç','💎 Bağış yap'].forEach(t=>a.append(button(t,()=>window.toast?.(`${t} demo yüzeyi`))));
  }

  async function storeDemo(){
    let items=[]; try{const x=await api('/cosmetics');items=Array.isArray(x)?x:(x.items||x.cosmetics||[]);}catch(e){}
    const m=modal('🛍️ 139 kozmetik • tam vitrin',`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><input id="cosSearch" placeholder="Ara: avatar, çerçeve, VIP..." style="flex:1;min-width:160px;padding:9px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"><select id="cosFilter" style="padding:9px;background:#17131f;color:#fff;border:1px solid #ffffff14;border-radius:9px"><option value="all">Tümü</option><option value="avatar">Avatar</option><option value="frame">Çerçeve</option><option value="vip">VIP</option><option value="standard">Standart</option></select></div><div id="cosCount" style="font-size:8px;color:#938a9f;margin-bottom:7px">Katalog yükleniyor...</div><div id="cosGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px"></div>`);
    const search=m.querySelector('#cosSearch'),filter=m.querySelector('#cosFilter'),grid=m.querySelector('#cosGrid'),count=m.querySelector('#cosCount');
    if(!items.length){count.textContent='Katalog API yanıtı alınamadı; asset klasörleri demo vitrininde mevcut.'; return;}
    const draw=()=>{const q=search.value.toLowerCase().trim(),f=filter.value;const rows=items.filter(x=>{const key=String(x.key||x.id||x.name||'').toLowerCase(),type=String(x.type||x.category||key).toLowerCase(),vip=key.includes('vip')||type.includes('vip');return (!q||key.includes(q))&&(f==='all'||(f==='avatar'&&type.includes('avatar'))||(f==='frame'&&type.includes('cerceve')||type.includes('frame'))||(f==='vip'&&vip)||(f==='standard'&&!vip));});count.textContent=`${rows.length} sonuç • hedef katalog 139`;grid.innerHTML=rows.map(x=>{const key=String(x.key||x.id||x.name||'');const src=asset(key);return `<div style="background:#12101a;border:1px solid #ffffff12;border-radius:12px;padding:6px;overflow:hidden"><div style="height:76px;background:#09070d;border-radius:9px;display:grid;place-items:center"><img src="${esc(src)}" loading="lazy" style="max-width:100%;max-height:72px;object-fit:contain"></div><small style="display:block;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.name||key)}</small><span style="font-size:7px;color:#938a9f">${esc(x.type||x.category||'kozmetik')}</span></div>`}).join('');}; search.oninput=draw;filter.onchange=draw;draw();
  }

  async function profileDemo(){
    let me={};try{me=await api('/me')}catch(e){}
    const avatar=me.avatar_asset||me.avatar||'erkekavatar/avatar1.png', frame=me.frame_asset||'standartcerceve/cerceve1.png';
    const m=modal('👤 Profil + avatar/çerçeve try-on',`<div style="display:grid;grid-template-columns:130px 1fr;gap:12px;align-items:center"><div style="height:150px;border-radius:18px;background:#0a0810;border:1px solid #ffffff12;display:grid;place-items:center;position:relative;overflow:hidden"><img src="${esc(asset(avatar))}" style="width:100px;height:100px;object-fit:contain"><img src="${esc(asset(frame))}" style="position:absolute;width:128px;height:128px;object-fit:contain"></div><div>${card(`<b>${esc(me.nickname||'ErisChat kullanıcısı')}</b><small style="display:block;color:#938a9f;margin-top:4px">${esc(me.gender||'Belirtilmemiş')} • VIP profil • Fan seviyesi • Profil hediyeleri</small>`)}<div id="profileBtns" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div></div></div>`);
    ['✨ Avatarı uygula','🖼 Çerçeveyi uygula','⭐ Favoriye ekle','🎁 Hediye vitrini','➕ Takip et'].forEach(t=>m.querySelector('#profileBtns').append(button(t,()=>window.toast?.(`${t} demo yüzeyi`))));
  }

  function safetyDemo(){
    const cards=[['🔔 Bildirim merkezi','Okunmamış DM, hediye, aile, VIP ve oda olayları tek listede.','Demo bildirim akışı'],['🚫 Engelleme','Kullanıcıyı engelle / kaldır ve DM görünürlüğünü yönet.','Backend endpointi sonraki tur'],['🛡️ Güvenlik','Oturum, gizlilik, şikayet ve moderasyon kontrolleri.','Mevcut API + demo yönetim yüzeyi'],['🧰 Admin / Mod','Rapor kuyruğu, kullanıcı/oda işlemleri, ban ve denetim.','Yönetim UI demo yüzeyi']];
    const m=modal('🛡️ Bildirim • Güvenlik • Moderasyon',cards.map(x=>card(`<b>${x[0]}</b><small style="display:block;color:#d5cddd;margin-top:4px">${x[1]}</small><span style="display:block;font-size:7px;color:#938a9f;margin-top:5px">${x[2]}</span>`)).join('<div style="height:7px"></div>'));
    m.querySelector('#demoExtraBody').insertAdjacentHTML('beforeend','<div style="margin-top:9px">'+card('<b>⚠️ Not</b><small style="display:block;color:#938a9f;margin-top:4px">Bildirim, engelleme ve admin yönetimi için henüz doğrulanmış production endpointi yok; bu yüzden burada sahte canlılık iddiası yapılmıyor.</small>')+'</div>');
  }

  function onboardingDemo(){
    const steps=[['1','👋 Hoş geldin','Anonim giriş / oturum'],['2','✏️ Takma ad','Kullanıcı adı seç'],['3','♂♀ Cinsiyet','Profil tercihi'],['4','🖼 Avatar','139 kozmetik içinden başlangıç görünümü'],['5','🎯 İlgi alanları','Keşif kişiselleştirme'],['6','🔒 Gizlilik','VIP / rozet / konum görünürlüğü'],['7','🚀 Başla','Odalar + keşif + DM']];
    const m=modal('🚀 İlk kullanım / onboarding',`<div id="onboard" style="display:grid;gap:7px">${steps.map((x,i)=>card(`<div style="display:flex;gap:8px;align-items:center"><b style="font-size:15px">${x[0]}</b><div><b>${x[1]}</b><small style="display:block;color:#938a9f;margin-top:2px">${x[2]}</small></div><span style="margin-left:auto;font-size:8px">${i===0?'AKTİF':'BEKLEMEDE'}</span></div>`)).join('')}</div><div style="display:flex;gap:6px;margin-top:9px" id="onboardBtns"></div>`); ['← Geri','İleri →','Tamamla ✓'].forEach(t=>m.querySelector('#onboardBtns').append(button(t,()=>window.toast?.(`${t} demo adımı`))));
  }

  function roomSettingsDemo(){
    const settings=[['🔒 Odayı kilitle',true],['👥 Maksimum kişi','50'],['💬 Sohbet','Açık'],['🎁 Hediyeler','Açık'],['🎵 Müzik','Açık'],['🛡 Moderatörler','3'],['📢 Duyuru','Açık'],['🚪 Odayı kapat','İşlem']];
    modal('⚙️ Oda sahibi ayarları',settings.map(x=>card(`<div style="display:flex;justify-content:space-between"><b>${x[0]}</b><span style="font-size:8px">${esc(x[1])}</span></div>`)).join('<div style="height:6px"></div>'));
  }

  function mount(){
    if(document.getElementById('erisDemoExtras'))return;
    const wrap=document.createElement('div');wrap.id='erisDemoExtras';wrap.style.cssText='position:fixed;right:14px;bottom:72px;z-index:289;display:flex;flex-direction:column;gap:5px;align-items:flex-end;max-width:170px';
    const groups=[['🎙️ Ses/Koltuk',seatsDemo],['🎵 Müzik',musicDemo],['📢 Duyuru',announcementDemo],['👑 Aile',familyDemo],['🛍️ 139 Mağaza',storeDemo],['👤 Profil Try-on',profileDemo],['🛡️ Güvenlik/Mod',safetyDemo],['🚀 Onboarding',onboardingDemo],['⚙️ Oda Ayarları',roomSettingsDemo]];
    groups.forEach(([t,fn])=>{const b=button(t,fn);b.style.fontSize='8px';wrap.append(b)});document.body.append(wrap);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
