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
        row.innerHTML=`<div style="background:#09070d;border:1px solid #ffffff12;border-radius:12px;display:grid;place-items:center;overflow:hidden"><img src="${esc(asset(avatarKey))}" style="width:62px;height:62px;object-fit:contain;${unlocked?'':'filter:grayscale(1);opacity:.5'}"></div><div style="background:#12101a;border:1px solid #ffffff12;border-radius:12px;padding:9px"><b>${unlocked?'✨':'🔒'} VIP ${n} • ${labels[n-1]}</b><small style="display:block;color:#938a9f;margin:4px 0">${unlocked?'Açık':'VIP '+n+' gerekli'} • ${g==='female'?'Kadın':'Erkek'} avatar: vip${n}.png • Çerçeve: vip${n}.png</small><div style="font-size:8px;color:#d5cddd">${perks[n].map(esc).join(' • ')}</div><div style="margin-top:6px"><img src="${esc(asset(frameKey))}" style="height:30px;max-width:100%;object-fit:contain;${unlocked?'':'filter:grayscale(1);opacity:.4'}"></div></div>`;
        table.append(row);
      }
    };
    render(gender==='female'?'female':'male');
    const m=modal('VIP seviyeleri ve cinsiyet ödülleri','');m.querySelector('div div').append(body);
  }

  async function gamesDemo(scope='main', roomId=null) {
    const catalog=await api('/games').then(r=>r.json()).catch(()=>[]);
    const body=document.createElement('div');
    body.innerHTML=`<div style="padding:12px;border-radius:15px;background:#12101a;border:1px solid #ffffff12;margin-bottom:9px"><b>🎮 Oyun Merkezi • Analiz</b><small style="display:block;color:#938a9f;margin-top:4px">${scope==='room'?'Oda oyunları: Rulet, 4 Kupa, At Yarışı ve Şans Çarkı.':'7 oyun • ücretsiz/free-play • sonuç analizi ve geçmiş.'}</small></div><div id="gameScope" style="display:flex;gap:6px;margin-bottom:9px"></div><div id="gameGrid" style="display:grid;grid-template-columns:1fr;gap:8px"></div>`;
    const scopeBox=body.querySelector('#gameScope'),grid=body.querySelector('#gameGrid');
    const names={roulette:'🎰 Rulet',cups:'🥤 4 Kupa',horse_race:'🐎 At Yarışı',blackjack:'🃏 Blackjack',crash:'🚀 Crash',vault:'🎁 Kasa Açma',wheel:'🎡 Şans Çarkı'};
    async function render(kind){
      scopeBox.innerHTML='';
      [['🌐 Genel/Oda','room'],['👤 Özel/Kişisel','private']].forEach(([label,key])=>{const b=btn(label,()=>render(key));b.style.opacity=key===kind?'.65':'1';scopeBox.append(b)});
      grid.innerHTML='';
      for(const g of catalog.filter(x=>x.scope===kind)){
        const el=document.createElement('div');el.style.cssText='background:#12101a;border:1px solid #ffffff12;border-radius:15px;padding:11px';
        el.innerHTML=`<b>${esc(names[g.key]||g.key)}</b><small style="display:block;color:#938a9f;margin:5px 0 8px">${esc(g.description)}</small><div style="display:flex;gap:5px;flex-wrap:wrap"><button data-play style="border:0;border-radius:10px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;padding:9px 10px;font-size:9px;font-weight:800">🎲 Oyna</button><button data-history style="border:1px solid #ffffff12;border-radius:10px;background:#ffffff08;color:#fff;padding:9px 10px;font-size:9px">🕘 Geçmiş</button></div><div data-out></div>`;
        const out=el.querySelector('[data-out]'); let selected=null;
        const opts=(g.key==='roulette'?['rose','heart','star','diamond','crown','gift','fire','gem','jackpot']:g.key==='cups'?['cup_1','cup_2','cup_3','cup_4']:g.key==='horse_race'?['horse_1','horse_2','horse_3','horse_4','horse_5','horse_6','horse_7']:g.key==='wheel'?['small','medium','large','special','grand']:[]);
        if(opts.length){const box=document.createElement('div');box.style.cssText='display:flex;gap:4px;flex-wrap:wrap;margin-bottom:7px';opts.forEach(x=>{const b=btn(x,()=>{selected=x;box.querySelectorAll('button').forEach(y=>y.style.opacity=y===b?'1':'.5')});b.style.fontSize='8px';box.append(b)});el.insertBefore(box,el.querySelector('[data-play]'))}

        el.querySelector('[data-play]').onclick=async()=>{
          if(kind==='room'&&!roomId){out.innerHTML='<small style="color:#ff9bbd">Önce bir odaya gir.</small>';return;}
          const res=await api('/games/'+encodeURIComponent(g.key)+'/play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign(kind==='room'?{room_id:roomId}:{},selected?{choice:selected}:{}))}).catch(()=>null);
          const d=res?await res.json().catch(()=>({})):{}; const data=d.data||{};
          const hit=data.choice_hit;
          const base=()=>`<div style="margin-top:7px;padding:9px;border-radius:10px;background:#8a5cff12">🎲 Sonuç: <b>${esc(d.result||d.detail||'Sonuç alınamadı')}</b>${selected?'<br>'+(hit?'✅ Seçimin tuttu!':'❌ Seçimin tutmadı.') : ''}${data.multiplier?'<br>🚀 '+data.multiplier+'×':''}${data.player_total?'<br>🃏 Sen '+data.player_total+' • Dağıtıcı '+data.dealer_total:''}${data.finish_order?'<br>🏁 '+data.finish_order.join(' → '):''}${data.animation?.type?'<br>🎬 '+esc(data.animation.type)+' • animasyon '+esc(data.animation.duration_ms||data.animation.steps||data.animation.turns||''):''}</div>`;
          if(g.key!=='blackjack'||!data.round_id||d.result!=='pending'){out.innerHTML=base(); playGameAnimation(out,data); return;}
          const actionBox=document.createElement('div'); actionBox.style.cssText='margin-top:7px;display:flex;gap:5px;flex-wrap:wrap';
          const renderHands=(host,state)=>{
            const hands=state?.hands;
            if(!Array.isArray(hands)||!hands.length)return;
            const wrap=document.createElement('div'); wrap.style.cssText='display:grid;gap:6px;margin-top:7px';
            hands.forEach((h,i)=>{const card=document.createElement('div');card.style.cssText='padding:8px;border:1px solid '+(i===(state.active_hand??0)?'#b77cff55':'#ffffff0d')+';border-radius:9px;background:#ffffff05';card.innerHTML='<b>🃏 El '+(i+1)+(i===(state.active_hand??0)?' • Aktif':'')+'</b><br>'+esc((h.cards||[]).join('  '))+'<br><small>Toplam: '+esc(h.total??0)+(h.result?' • '+esc(h.result):'')+'</small>';wrap.append(card)}); host.append(wrap);
          };
          const show=()=>{const s=data.state||{};out.innerHTML='<div style="padding:9px;border-radius:10px;background:#8a5cff12">🃏 El: <b>'+esc((s.player_hand||data.player_hand||[]).join(' '))+'</b><br>Toplam: <b>'+esc(s.player_total??data.player_total??'')+'</b><br>Dealer: <b>'+esc((s.dealer_hand||data.dealer_hand||[]).map((x,i)=>i===1&&s.phase==='player'?'🂠':x).join(' '))+'</b></div>'; renderHands(out,s); out.append(actionBox);};
          const act=async(action)=>{
            actionBox.querySelectorAll('button').forEach(b=>b.disabled=true);
            const rr=await api('/games/blackjack/'+encodeURIComponent(data.round_id)+'/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}).catch(()=>null);
            const dd=rr?await rr.json().catch(()=>({})):{}; if(!rr?.ok){out.innerHTML='<small style="color:#ff9bbd">'+esc(dd.detail||'Blackjack işlemi başarısız')+'</small>';return;}
            data.state=dd.state||data.state; data.player_total=dd.state?.player_total; data.dealer_total=dd.state?.dealer_total; data.available_actions=dd.available_actions||[];
            if(dd.result==='pending'){show();return;}
            out.innerHTML='<div style="padding:9px;border-radius:10px;background:#8a5cff12">🃏 Sonuç: <b>'+esc(dd.result||dd.detail||'Bilinmiyor')+'</b><br>Sen: '+esc(dd.state?.player_total??'')+' • Dealer: '+esc(dd.state?.dealer_total??'')+'</div>'; renderHands(out,dd.state||{});
          };
          [['👊 Hit','hit'],['✋ Stand','stand'],['⚡ Double','double'],['✂️ Split','split']].forEach(([label,action])=>{const b=btn(label,()=>act(action));b.style.fontSize='8px'; b.disabled=Array.isArray(data.available_actions)&&data.available_actions.length>0&&!data.available_actions.includes(action); actionBox.append(b)});
          show();
        };
        el.querySelector('[data-history]').onclick=async()=>{const res=await api('/games/'+encodeURIComponent(g.key)+'/history').catch(()=>null);const d=res?await res.json().catch(()=>[]):[];out.innerHTML=`<div style="margin-top:7px;padding:9px;border-radius:10px;background:#ffffff06"><b>🕘 Son oyunlar</b><small style="display:block;margin-top:4px">${d.length?d.slice(0,8).map(x=>new Date(x.created_at).toLocaleString()+' • '+esc(x.result)).join('<br>'):'Henüz oyun geçmişi yok.'}</small></div>`};
        grid.append(el);
      }
    }
    await render(scope);
    const m=modal(scope==='room'?'Oda Oyunları':'Oyunlar','');m.querySelector('div div').append(body);
  }
  window.ErisChatGames={open:(scope='main',roomId=null)=>gamesDemo(scope,roomId)};
  function checklistDemo() {
    const items=[['VIP 1–12 ödül matrisi','Tamamlandı'],['Erkek/kadın VIP avatarları','12 + 12 gösterim'],['VIP çerçeveleri','12 seviye'],['VIP sistem ayrıcalıkları','12 seviye'],['139 kozmetik vitrini','Mağaza ekranında'],['Odalar / koltuk / moderasyon','Ürün yüzeyinde'],['Aile / keşif / sosyal / DM','Ürün yüzeyinde'],['Güvenlik / gizlilik / şikayet','Ürün yüzeyinde'],['Oyun ekranları','Demo simülasyonu'],['Gerçek ses/WebRTC','Geliştirme kalemi'],['Browser E2E','Doğrulama kalemi'],['Pages → Railway canlı zincir','Deploy/ortam kalemi']];
    modal('Müşteri demo kontrol listesi',items.map(x=>card(`<b>${x[0]}</b><small style="display:block;color:#938a9f;margin-top:4px">${x[1]}</small>`)).join('<div style="height:6px"></div>'));
  }

  function mountButtons(){
    if(document.getElementById('erisDemoCompleteVip'))return;
    const wrap=document.createElement('div');wrap.style.cssText='position:fixed;right:14px;bottom:196px;z-index:290;display:flex;flex-direction:column;gap:6px;align-items:flex-end';
    [['erisDemoCompleteVip','✨ VIP + Ödüller',vipDemo],['erisDemoCompleteGames','🎮 Oyunlar',()=>gamesDemo('main',null)],['erisDemoCompleteCheck','☑ Demo Kontrol',checklistDemo]].forEach(([id,text,fn])=>{const b=btn(text,fn);b.id=id;b.style.fontSize='8px';wrap.append(b)});document.body.append(wrap);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mountButtons();mountGameEntryPoints()},{once:true});else {mountButtons();mountGameEntryPoints();}
})();
