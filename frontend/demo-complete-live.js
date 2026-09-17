/* ErisChat customer demo completion layer: VIP roadmap, gender rewards, cosmetics preview and playable demo games. */
(() => {
  'use strict';
  if (window.__ERIS_DEMO_COMPLETE__) return;
  window.__ERIS_DEMO_COMPLETE__ = true;

  const api = (path, options = {}) => window.ErisPlatform?.api(path, options) ?? Promise.reject(new Error('Platform hazır değil'));
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const asset = key => window.ErisChatCosmetics?.assetUrl ? window.ErisChatCosmetics.assetUrl(key) : `Gereken_icerikler/${String(key || '').replace(/^\//,'')}`;
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
        row.innerHTML=`<div style="background:#09070d;border:1px solid #ffffff12;border-radius:12px;display:grid;place-items:center;overflow:hidden"><img src="${esc(asset(avatarKey))}" style="width:62px;height:62px;object-fit:contain;${unlocked?'':'filter:grayscale(1);opacity:.5'}"></div><div style="background:#12101a;border:1px solid #ffffff12;border-radius:12px;padding:9px"><b>${unlocked?'✨':'🔒'} VIP ${n} • ${labels[n-1]}</b><small style="display:block;color:#938a9f;margin:4px 0">${unlocked?'Açık':'VIP '+n+' gerekli'} • ${g==='female'?'Kadın':'Erkek'} avatar: vip${n}.png • Çerçeve: vip${n}.png</small><div style="font-size:8px;color:#d5cddd">${perks[n].map(esc).join(' • ')}</div><div style="margin-top:6px"><img src="${esc(asset(frameKey))}" style="height:30px;max-width:100%;object-fit:contain;${unlocked?'':'filter:grayscale(1);opacity:.4'}"></div></div>`;
        table.append(row);
      }
    };
    render(gender==='female'?'female':'male');
    const m=modal('VIP seviyeleri ve cinsiyet ödülleri','');m.querySelector('div div').append(body);
  }

  function gamesDemo() {
    const body=document.createElement('div');
    body.innerHTML=`<div style="padding:12px;border-radius:15px;background:#12101a;border:1px solid #ffffff12;margin-bottom:9px"><b>🎮 Oyun merkezi</b><small style="display:block;color:#938a9f;margin-top:4px">Bu müşteri demosunda oyunların ekranı, seçimleri, sonuçları ve ödül tablosu çalışır. Bu katman demo simülasyonudur; gerçek Lidya ekonomisi backend turunda bağlanacaktır.</small></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div id="roulette"></div><div id="cups"></div></div>`;
    const r=body.querySelector('#roulette');r.innerHTML=card('<b>🎰 Roulette</b><div style="font-size:8px;color:#938a9f;margin:6px 0">Görsel sonuç + çarpan</div><select id="rouletteChoice" style="width:100%;padding:8px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"><option>rose</option><option>heart</option><option>star</option><option>diamond</option><option>crown</option><option>gift</option><option>fire</option><option>gem</option><option>jackpot</option></select><input id="rouletteAmount" type="number" value="1000" min="1" style="width:100%;box-sizing:border-box;margin:6px 0;padding:8px;background:#ffffff08;color:#fff;border:1px solid #ffffff14;border-radius:9px"><div id="rouletteOut"></div>');
    const multipliers={rose:0,heart:1.1,star:1.3,diamond:1.6,crown:2,gift:2.5,fire:3,gem:4,jackpot:6};
    const spin=btn('Çevir',()=>{const c=body.querySelector('#rouletteChoice').value,a=Number(body.querySelector('#rouletteAmount').value)||1,m=multipliers[c];body.querySelector('#rouletteOut').innerHTML=`<div style="margin-top:7px;padding:9px;border-radius:10px;background:#8a5cff12">🎰 <b>${c.toUpperCase()}</b><br><small>Çarpan ×${m} • Demo ödülü ${Math.floor(a*m).toLocaleString('tr-TR')} Lidya</small></div>`});r.append(spin);
    const c=body.querySelector('#cups');c.innerHTML=card('<b>🥤 4 Kupa</b><div style="font-size:8px;color:#938a9f;margin:6px 0">Bir kupa seç</div><div id="cupBtns" style="display:grid;grid-template-columns:1fr 1fr;gap:6px"></div><div id="cupOut"></div>');
    const cupOut=c.querySelector('#cupOut'),cupBtns=c.querySelector('#cupBtns');['1','2','3','4'].forEach(n=>cupBtns.append(btn('Kupa '+n,()=>{const win=Math.floor(Math.random()*4)+1;cupOut.innerHTML=`<div style="margin-top:7px;padding:9px;border-radius:10px;background:#8a5cff12">🥤 Seçim: ${n} • Sonuç: Kupa ${win}<br><small>${n===String(win)?'🎉 Demo ödülü kazandın!':'Bu tur ödül çıkmadı.'}</small></div>`})));
    modal('Oyunlar','').querySelector('div div').append(body);
  }

  function checklistDemo() {
    const items=[['VIP 1–12 ödül matrisi','Tamamlandı'],['Erkek/kadın VIP avatarları','12 + 12 gösterim'],['VIP çerçeveleri','12 seviye'],['VIP sistem ayrıcalıkları','12 seviye'],['139 kozmetik vitrini','Mağaza ekranında'],['Odalar / koltuk / moderasyon','Ürün yüzeyinde'],['Aile / keşif / sosyal / DM','Ürün yüzeyinde'],['Güvenlik / gizlilik / şikayet','Ürün yüzeyinde'],['Oyun ekranları','Demo simülasyonu'],['Gerçek ses/WebRTC','Geliştirme kalemi'],['Browser E2E','Doğrulama kalemi'],['Pages → Railway canlı zincir','Deploy/ortam kalemi']];
    modal('Müşteri demo kontrol listesi',items.map(x=>card(`<b>${x[0]}</b><small style="display:block;color:#938a9f;margin-top:4px">${x[1]}</small>`)).join('<div style="height:6px"></div>'));
  }

  function mountButtons(){
    if(document.getElementById('erisDemoCompleteVip'))return;
    const wrap=document.createElement('div');wrap.style.cssText='position:fixed;right:14px;bottom:196px;z-index:290;display:flex;flex-direction:column;gap:6px;align-items:flex-end';
    [['erisDemoCompleteVip','✨ VIP + Ödüller',vipDemo],['erisDemoCompleteGames','🎮 Oyun Demo',gamesDemo],['erisDemoCompleteCheck','☑ Demo Kontrol',checklistDemo]].forEach(([id,text,fn])=>{const b=btn(text,fn);b.id=id;b.style.fontSize='8px';wrap.append(b)});document.body.append(wrap);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountButtons,{once:true});else mountButtons();
})();
