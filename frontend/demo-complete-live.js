/* ErisChat customer demo completion layer: VIP roadmap, gender rewards, cosmetics preview and playable demo games. */
(() => {
  'use strict';
  if (window.__ERIS_DEMO_COMPLETE__) return;
  window.__ERIS_DEMO_COMPLETE__ = true;

  const api = (path, options = {}) => window.ErisPlatform?.api(path, options) ?? Promise.reject(new Error('Platform hazır değil'));
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const asset = key => window.ErisChatCosmetics?.assetUrl ? window.ErisChatCosmetics.assetUrl(key) : `Gereken_icerikler/${String(key || '').replace(/^\//,'')}`;
  const vipThresholds = [0,1000,5000,15000,30000,60000,120000,250000,500000,1000000,2000000,5000000,10000000];
  const formatLidya = n => n>=1000000 ? (n/1000000)+'M' : n>=1000 ? (n/1000)+'K' : String(n);
  const perks = {
    1:['VIP rozeti','VIP avatar erişimi','VIP çerçeve erişimi'],
    2:['VIP 2 rozeti'],
    3:['Neon isim','20 neon renk paleti'],
    4:['Özel giriş mesajı'],
    5:['Giriş efekti'],
    6:['Oda açılış duyurusu'],
    7:['5.000 Lidya bonusu','10.000 Lidya karşılığı cinsiyet değiştirme hakkı'],
    8:['Oda kilitleme ücretinde %50 indirim'],
    9:['Moderatör kick bağışıklığı'],
    10:['Şövalye rozeti','Ücretsiz duvar kağıdı'],
    11:['Ücretsiz kilitli oda'],
    12:['Saygın Şövalye','Taç']
  };
  const labels = ['Başlangıç','Rozet','Neon','Giriş Mesajı','Giriş Efekti','Oda Duyurusu','Lidya + Cinsiyet','Kilit İndirimi','Mod Koruması','Şövalye','Ücretsiz Kilitli Oda','Taç'];
  const genderName = g => g === 'female' ? 'Kadın' : g === 'male' ? 'Erkek' : 'Belirtilmemiş';
  const modal = (title, body) => {
    const el = document.createElement('div');
    el.style.cssText='position:fixed;inset:0;z-index:500;background:#020107ed;display:flex;align-items:flex-end;justify-content:center';
    el.innerHTML=`<div style="width:min(560px,100%);max-height:94vh;overflow:auto;background:#0a0810;color:#fff;border:1px solid #ffffff18;border-radius:26px 26px 0 0;padding:16px;font-family:inherit"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:8px;letter-spacing:1.3px;color:#938a9f">ERISCHAT • CUSTOMER DEMO</div><h2 style="margin:4px 0 12px;font-size:20px">${esc(title)}</h2></div><button data-close style="border:0;border-radius:11px;background:#ffffff0b;color:#fff;width:36px;height:36px">×</button></div><div>${body}</div></div>`;
    document.body.append(el);el.querySelector('[data-close]').onclick=()=>el.remove();return el;
  };
  const card = (html) => `<div style="background:#12101a;border:1px solid #ffffff12;border-radius:15px;padding:11px">${html}</div>`;
  const playGameAnimation = (out, data) => {
    const a=data?.animation;
    if(!a) return;
    const box=document.createElement('div');
    box.style.cssText='margin-top:7px;padding:9px;border-radius:10px;background:#09070d;border:1px solid #ffffff12;font-size:9px';
    const title=document.createElement('b'); title.textContent='🎬 Oyun akışı'; box.append(title);
    const stage=document.createElement('div'); stage.style.cssText='margin-top:7px;min-height:28px;display:grid;place-items:center'; box.append(stage); out.append(box);
    const frames=a.frames||a.curve||a.checkpoints;
    if(Array.isArray(frames)&&frames.length){
      let i=0; const tick=()=>{const v=frames[i]; stage.textContent=Array.isArray(v)?v.join(' • '):typeof v==='object'?Object.entries(v).map(([k,x])=>k+': '+x).join(' • '):String(v); i++; if(i<frames.length) setTimeout(tick,Math.max(80,Math.floor((a.duration_ms||1600)/frames.length)));}; tick();
    } else if(Array.isArray(a.phases)){ let i=0; const tick=()=>{stage.textContent=a.phases[i++]; if(i<a.phases.length)setTimeout(tick,300)}; tick(); }
  };
  const btn = (text, action) => {const b=document.createElement('button');b.textContent=text;b.style.cssText='border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;padding:9px 10px;font-size:9px;font-weight:800';b.onclick=action;return b;};

  async function vipDemo() {
    let me={}, v={level:0};
    try {[me,v]=await Promise.all([api('/me'),api('/me/vip')]);} catch(e) { console.warn('[ErisChat demo] VIP data',e.message); }
    const gender=me.gender||'unspecified', level=Number(v.level||0);
    const body=document.createElement('div');
    body.innerHTML=`<div style="padding:14px;border-radius:17px;background:linear-gradient(145deg,#15101d,#0d0a12);border:1px solid #ffffff12;margin-bottom:10px"><b style="font-size:15px">✨ VIP 1 → VIP 12</b><small style="display:block;color:#938a9f;margin-top:5px">Mevcut: VIP ${level} • Cinsiyet: ${genderName(gender)}. Her seviye kendi erkek/kadın avatarını ve VIP çerçevesini gösterir; seviyeye bağlı sistem ayrıcalıkları aşağıda görünür.</small></div><div id="vipGender" style="display:flex;gap:6px;margin-bottom:9px"></div><div id="vipTable"></div>`;
    const genderBox=body.querySelector('#vipGender'), table=body.querySelector('#vipTable');
    const render=g=>{
      genderBox.innerHTML='';['male','female'].forEach(x=>genderBox.append(btn(x==='male'?'♂ Erkek ödülleri':'♀ Kadın ödülleri',()=>render(x))));
      table.innerHTML='';
      for(let n=1;n<=12;n++){
        const unlocked=n<=level, avatarKey=`${g==='female'?'vipkadınavatar':'viperkekavatar'}/vip${n}.png`, frameKey=`vipcerceve/vip${n}.png`;
        const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:68px 1fr;gap:8px;margin-bottom:8px;align-items:stretch';
        row.innerHTML=`<div style="background:#09070d;border:1px solid #ffffff12;border-radius:12px;display:grid;place-items:center;overflow:hidden"><img src="${esc(asset(avatarKey))}" style="width:62px;height:62px;object-fit:contain;${unlocked?'':'filter:grayscale(1);opacity:.5'}"></div><div style="background:#12101a;border:1px solid #ffffff12;border-radius:12px;padding:9px"><b>${unlocked?'✨':'🔒'} VIP ${n} • ${labels[n-1]}</b><small style="display:block;color:#938a9f;margin:4px 0">${unlocked?'Açık':'VIP '+n+' gerekli'} • Toplam harcama eşiği: ${formatLidya(vipThresholds[n])} Lidya • ${g==='female'?'Kadın':'Erkek'} avatar: vip${n}.png • Çerçeve: vip${n}.png</small><div style="font-size:8px;color:#d5cddd">${perks[n].map(esc).join(' • ')}</div><div style="margin-top:6px"><img src="${esc(asset(frameKey))}" style="height:30px;max-width:100%;object-fit:contain;${unlocked?'':'filter:grayscale(1);opacity:.4'}"></div></div>`;
        table.append(row);
      }
    };
    render(gender==='female'?'female':'male');
    const m=modal('VIP seviyeleri ve cinsiyet ödülleri','');m.querySelector('div div').append(body);
  }

  async function gamesDemo(scope='main', roomId=null) {
    const games = [
      ['roulette','🎰 Rulet','Oda oyunu • demo arayüzü'],
      ['cups','🥤 4 Kupa','Oda oyunu • demo arayüzü'],
      ['horse_race','🐎 At Yarışı','Oda oyunu • demo arayüzü'],
      ['blackjack','🃏 Blackjack','Kişisel oyun • demo arayüzü'],
      ['crash','🚀 Crash','Kişisel oyun • demo arayüzü'],
      ['vault','🎁 Kasa Açma','Kişisel oyun • demo arayüzü'],
      ['wheel','🎡 Şans Çarkı','Kişisel oyun • demo arayüzü']
    ];
    const body=document.createElement('div');
    body.innerHTML='<div style="padding:12px;border-radius:15px;background:#12101a;border:1px solid #ffffff12;margin-bottom:9px"><b>🎮 Oyun Merkezi</b><small style="display:block;color:#938a9f;margin-top:4px">7 oyun • oda ve kişisel oyun ekranları.</small></div><div id="gameGrid" style="display:grid;grid-template-columns:1fr;gap:8px"></div>';
    const grid=body.querySelector('#gameGrid');
    games.forEach(([key,title,desc])=>{
      const el=document.createElement('div');el.style.cssText='background:#12101a;border:1px solid #ffffff12;border-radius:15px;padding:11px';
      el.innerHTML='<b>'+esc(title)+'</b><small style="display:block;color:#938a9f;margin:5px 0 8px">'+esc(desc)+'</small><div style="display:flex;gap:5px;flex-wrap:wrap"><button data-play style="border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;padding:9px 10px;font-size:9px;font-weight:800">▶ Oyna</button><button data-history style="border:1px solid #ffffff12;border-radius:10px;background:#ffffff08;color:#fff;padding:9px 10px;font-size:9px">🕘 Geçmiş</button></div><div data-out></div>';
      const out=el.querySelector('[data-out]');
      el.querySelector('[data-play]').onclick=()=>{
        out.innerHTML='<div style="margin-top:7px;padding:9px;border-radius:10px;background:#8a5cff12"><b>'+esc(title)+' açıldı.</b><br><small>Oyun arayüzü ve seçim alanı hazır. '+esc(scope==='room'?'Oda içi':'Kişisel')+' demo modu.</small></div>';
      };
      el.querySelector('[data-history]').onclick=()=>{
        out.innerHTML='<div style="margin-top:7px;padding:9px;border-radius:10px;background:#ffffff06"><b>🕘 Oyun geçmişi</b><small style="display:block;margin-top:4px">Bu oyuna ait geçmiş burada görüntülenir.</small></div>';
      };
      grid.append(el);
    });
    const m=modal(scope==='room'?'Oda Oyunları':'Oyunlar','');m.querySelector('div div').append(body);
  }
  window.ErisChatGames={open:(scope='main',roomId=null)=>gamesDemo(scope,roomId)};
  function checklistDemo() {
    const items=[['VIP 1–12 ödül matrisi','Tamamlandı'],['Erkek/kadın VIP avatarları','12 + 12 gösterim'],['VIP çerçeveleri','12 seviye'],['VIP sistem ayrıcalıkları','12 seviye'],['139 kozmetik vitrini','Mağaza ekranında'],['Odalar / koltuk / moderasyon','Ürün yüzeyinde'],['Aile / keşif / sosyal / DM','Ürün yüzeyinde'],['Güvenlik / gizlilik / şikayet','Ürün yüzeyinde'],['Oyun ekranları','Demo simülasyonu'],['Gerçek ses/WebRTC','Geliştirme kalemi'],['Browser E2E','Doğrulama kalemi'],['Pages → Railway canlı zincir','Deploy/ortam kalemi']];
    modal('Müşteri demo kontrol listesi',items.map(x=>card(`<b>${x[0]}</b><small style="display:block;color:#938a9f;margin-top:4px">${x[1]}</small>`)).join('<div style="height:6px"></div>'));
  }

  function mountButtons(){
    // Customer demo controls are exposed through the main navigation / feature hub.
    // Keep the primary surface uncluttered: no floating demo toolbar.
    document.getElementById('erisDemoCompleteTools')?.remove();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mountButtons()},{once:true});else {mountButtons();}
})();
