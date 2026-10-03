/* Live room gift picker. Uses the existing REST gift bridge and room view seats. */
(() => {
  const state = { roomId: null, gifts: [], recipients: [], selectedGift: null, selectedRecipient: null, category: 'all', balance: 0, quantity: 1 };
  const GIFT_CATEGORIES = [
    ['all','Tümü',0,Infinity,0],
    ['agora','Agora & Halk Pazarı',1,29,1],
    ['sofra','Antik Sofra & Bağlar',30,99,2],
    ['zanaat','Zanaat & Atölye',100,499,3],
    ['muhafiz','Saray Muhafızları',500,999,4],
    ['tuccar','Sardis Tüccarları',1000,9999,5],
    ['krallik','Krallık Hazinesi',10000,19999,6],
    ['ihtisam','Antik İhtişam',20000,49999,7],
    ['mitoloji','Mitoloji & Tanrılar',50000,89999,8],
    ['krezus','Krezus’un Mirası',90000,100000,9]
  ];
  const giftCategory = gift => {
    const price=Number(gift?.price||gift?.unit_price||0);
    return (GIFT_CATEGORIES.slice(1).find(x=>price>=x[2]&&price<=x[3])||GIFT_CATEGORIES[9])[0];
  };
  const giftLevel = gift => {
    const key=giftCategory(gift);
    return (GIFT_CATEGORIES.find(x=>x[0]===key)||GIFT_CATEGORIES[0])[4];
  };
  function giftIcon(value){const n=String(value||'').toLocaleLowerCase('tr-TR');const map=[['zeytin','🫒'],['incir','🫐'],['üzüm','🍇'],['nar','🍷'],['ekmek','🥖'],['lavaş','🫓'],['balık','🐟'],['bal ','🍯'],['peynir','🧀'],['mısır','🌽'],['elma','🍎'],['çay','🍵'],['çiçek','🌸'],['kurdele','🎀'],['boncuk','🔮'],['taç','👑'],['yüzük','💍'],['kılıç','⚔️'],['kalkan','🛡️'],['sancak','🚩'],['fener','🏮'],['ayna','🪞'],['sandık','🧰'],['vazo','🏺'],['heykel','🗿'],['halı','🪄'],['taht','👑'],['asası','🪄'],['altın','🪙'],['sikke','🪙'],['elmas','💎'],['mücevher','💎'],['at ','🐎'],['kartal','🦅'],['ejder','🐉'],['kanat','🪽'],['meşale','🔥'],['güneş','☀️'],['kasa','💰']];return map.find(([key])=>n.includes(key))?.[1]||(['Zeytin','Kil','Ahşap','Keten','Tunç','Bakır'].some(x=>String(value||'').startsWith(x))?'🏺':'✨')}
  function giftKind(value,level){const n=String(value||'').toLocaleLowerCase('tr-TR');if(level>=8||/mitolojik|sonsuzluk|krezus|ebedi|imparatorluk/.test(n))return 'mythic';if(level>=6||/kral|kraliyet|taç|altın|taht|mücevher/.test(n))return 'royal';if(/ekmek|incir|üzüm|bal|peynir|balık|elma|mısır|zeytin|çay|şarap/.test(n))return 'feast';return 'relic'}
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const toastSafe = message => typeof window.toast === 'function' ? window.toast(message) : console.warn('[ErisChat gift]', message);

  function injectStyles() {
    if (document.getElementById('erischat-gift-live-style')) return;
    const style = document.createElement('style');
    style.id = 'erischat-gift-live-style';
    style.textContent = '#erischatGiftFab{position:fixed;right:16px;bottom:86px;z-index:115;width:48px;height:48px;border:1px solid #ffffff22;border-radius:16px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-size:20px;box-shadow:0 12px 30px #0008;display:none}#erischatGiftPanel{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:116;width:min(500px,calc(100% - 24px));max-height:70vh;overflow:auto;padding:15px;border:1px solid #ffffff18;border-radius:22px;background:#0b0911;box-shadow:0 22px 60px #000b;display:none}#erischatGiftPanel.show{display:block}.egp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.egp-title{font-size:14px;font-weight:900}.egp-close{border:0;background:#ffffff09;color:#fff;border-radius:10px;width:34px;height:34px}.egp-row{display:flex;gap:7px;overflow:auto;margin:8px 0}.egp-chip{border:1px solid #ffffff14;background:#ffffff06;color:#ddd;border-radius:12px;padding:8px 10px;white-space:nowrap;font-size:9px}.egp-chip.active{border-color:#ff4fa3;background:#ff4fa31c;color:#fff}.egp-cats{display:flex;gap:6px;overflow:auto;margin:5px 0 10px}.egp-cat{border:1px solid #ffffff14;background:#ffffff06;color:#bbb;border-radius:11px;padding:7px 9px;white-space:nowrap;font-size:8px}.egp-cat.active{border-color:#ff4fa3;background:#ff4fa31c;color:#fff}.egp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.egp-gift{border:1px solid #ffffff12;background:#ffffff05;color:#fff;border-radius:14px;padding:9px;text-align:left}.egp-gift.active{border-color:#8a5cff;background:#8a5cff18}.egp-gift:disabled{opacity:.3;filter:grayscale(1)}.egp-gift .egp-name{display:block;font-size:10px;line-height:1.25;min-height:26px}.egp-gift .egp-price{display:block;color:#e4b85d;font-size:8px;margin-top:5px}.egp-send{width:100%;margin-top:10px;border:0;border-radius:13px;padding:11px;background:linear-gradient(135deg,#7b4cff,#ff4fa3);color:#fff;font-weight:900;font-size:10px}.egp-send:disabled{opacity:.45}.egp-note{color:#938a9f;font-size:9px;padding:8px 0}.egp-balance{color:#e4b85d;font-size:9px;font-weight:800}\n';
    style.textContent += '.egp-gift{display:grid;grid-template-rows:48px auto auto;align-items:center}.egp-art{display:grid;place-items:center;width:44px;height:44px;margin:0 auto 5px;border-radius:14px;background:radial-gradient(circle,#e8b45128,#8a5cff16 70%);font-size:28px;filter:drop-shadow(0 4px 8px #0008)}.egp-gift:hover .egp-art{transform:translateY(-3px) rotate(-4deg);transition:transform .18s}.egfx-kind-feast .egfx-icon{animation:giftBounce .7s ease-in-out infinite alternate}.egfx-kind-relic .egfx-icon{animation:giftSpin 1.6s ease-in-out infinite}.egfx-kind-royal .egfx-icon{animation:giftRise 1.3s ease-in-out infinite alternate}.egfx-kind-mythic .egfx-icon{animation:giftMythic 1.1s ease-in-out infinite alternate}.level-1 .egfx-card{animation-duration:1.25s}.level-1 .egfx-glow{animation-duration:1.25s}@keyframes giftBounce{to{transform:translateY(-12px) scale(1.12)}}@keyframes giftSpin{to{transform:rotateY(180deg) scale(1.08)}}@keyframes giftRise{to{transform:translateY(-12px) rotate(-7deg) scale(1.12)}}@keyframes giftMythic{to{transform:translateY(-8px) rotate(12deg) scale(1.25);filter:drop-shadow(0 0 18px #ffcf4a)}}';
    style.textContent += '.egp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.egp-gift{display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;min-height:110px}.egp-gift img{width:72px;height:72px;object-fit:contain;filter:drop-shadow(0 0 9px #e4b85d88)}.egp-gift .egp-price{font-size:10px}.egfx-card img{width:min(50vw,240px);height:min(50vw,240px);object-fit:contain;filter:drop-shadow(0 0 25px #f9d780aa)}@keyframes egspin{from{transform:rotate(-90deg) scale(.4)}to{transform:rotate(360deg) scale(1.1)}}@keyframes egfloat{from{transform:translateY(90px) scale(.6)}to{transform:translateY(-20px) scale(1.1)}}@keyframes egdrop{from{transform:translateY(-120px) scale(.5)}60%{transform:translateY(12px) scale(1.1)}to{transform:translateY(0) scale(1)}}@keyframes egopen{from{clip-path:circle(0%);transform:scale(.7)}to{clip-path:circle(80%);transform:scale(1.15)}}@keyframes egsway{from{transform:rotate(-20deg) translateX(-50px)}50%{transform:rotate(14deg) translateX(20px)}to{transform:rotate(0)}}';
    style.textContent += '.egp-gift>img{width:80px;height:80px;object-fit:contain}.egp-gift .eris-lidya-coin{width:12px!important;height:12px!important;display:inline!important;margin-left:2px!important;filter:none!important}.egp-gift .egp-price{display:flex;align-items:center;justify-content:center;gap:2px;font-size:10px}.egp-qty{display:flex;align-items:center;gap:5px;overflow:auto;margin:8px 0;color:#bdaed0;font-size:10px}.egp-qty button{flex:none;border:1px solid #ffffff24;border-radius:10px;padding:7px 9px;color:white;background:#ffffff0b}.egp-qty button.active{background:#754cff;border-color:#a580ff}';
    style.textContent += '.egp-gift .egp-select{display:flex;flex-direction:column;align-items:center;width:100%;border:0;background:none;color:inherit;cursor:pointer;padding:0}.egp-gift .egp-select:disabled{opacity:.4}.egp-gift .egp-send{width:auto;min-width:72px;margin:5px auto 0;padding:6px 12px;font-size:11px;border-radius:9px}.egp-gift{min-height:0}';
    document.head.appendChild(style);
  }

  function updateSend() {
    const button = document.querySelector('#egpGifts .egp-send');
    if (button) button.disabled = !(state.roomId && state.selectedRecipient && state.selectedGift);
  }

  function renderRecipients() {
    const box = document.getElementById('egpRecipients');
    if (!box) return;
    box.innerHTML = state.recipients.map(r => `<button class="egp-chip${state.selectedRecipient === r.id ? ' active' : ''}" data-rec="${esc(r.id)}" type="button">${r.special?'✦':'👤'} ${esc(r.name)}</button>`).join('');
    box.querySelectorAll('[data-rec]').forEach(btn => { btn.onclick = () => { state.selectedRecipient = btn.dataset.rec; renderRecipients(); updateSend(); }; });
  }

  function renderGifts() {
    const box = document.getElementById('egpGifts');
    const cats = document.getElementById('egpCategories');
    if (!box) return;
    if(cats) cats.innerHTML=GIFT_CATEGORIES.map(x=>{const count=x[0]==='all'?state.gifts.length:state.gifts.filter(g=>giftCategory(g)===x[0]).length;return `<button class="egp-cat${state.category===x[0]?' active':''}" data-cat="${esc(x[0])}" type="button">${esc(x[1])} <span>(${count})</span></button>`;}).join('');
    const visible=state.gifts.filter(g=>state.category==='all'||giftCategory(g)===state.category);
    box.innerHTML = visible.length ? visible.map(g => {
      const name=String(g.gift_key||g.name||'');
      const price=Number(g.price||g.unit_price||0);
      const affordable=state.balance>=price*state.quantity;
      return `<div class="egp-gift${state.selectedGift === name ? ' active' : ''}"><button class="egp-select" data-gift="${esc(name)}" type="button" title="${esc(name)}" aria-label="${esc(name)}" ${affordable?'':'disabled'}><img src="${esc(g.image_url)}" alt="" loading="lazy"><span class="egp-price">${price.toLocaleString('tr-TR')} Lidya</span></button><button class="gift-preview-button" data-gift-preview="${esc(name)}" type="button">Önizle</button>${state.selectedGift===name?'<button class="egp-send" type="button">Gönder</button>':''}</div>`;
    }).join('') : '<div class="egp-note">Bu kategoride hediye yok.</div>';
    cats?.querySelectorAll('[data-cat]').forEach(btn=>{btn.onclick=()=>{state.category=btn.dataset.cat;renderGifts();};});
    box.querySelectorAll('[data-gift-preview]').forEach(b=>b.onclick=()=>window.ErisGiftStage?.preview?.({gift_key:b.dataset.giftPreview,quantity:state.quantity}));
    box.querySelector('.egp-send')?.addEventListener('click',send);
    box.querySelectorAll('[data-gift]').forEach(btn => { btn.onclick = () => { state.selectedGift = state.selectedGift===btn.dataset.gift?null:btn.dataset.gift; renderGifts(); updateSend(); }; });
  }

  async function loadRecipients() {
    if (!state.roomId || !window.ErisPlatform?.api) return;
    const members = await window.ErisPlatform.api(`/rooms/${encodeURIComponent(state.roomId)}/members`);
    const recipients = [
      {id:'@mic',name:'Mikrofondaki herkes',special:true},
      {id:'@room',name:'Odadaki herkes',special:true}
    ];
    for (const member of members) recipients.push({id:String(member.user_id),name:String(member.nickname||'Kullanıcı')});
    state.recipients = recipients;
    if (!recipients.some(r=>r.id===state.selectedRecipient)) state.selectedRecipient = null;
    renderRecipients();
  }

  async function loadGifts() {
    if (!state.roomId || !window.ErisRoomGift) return;
    const data = await window.ErisRoomGift.catalog(state.roomId);
    state.gifts = Array.isArray(data) ? data : (data.items || data.gifts || []);
    renderGifts();
  }

  async function refresh() {
    if (!state.roomId || !window.ErisPlatform) return;
    try {
      const me = await window.ErisPlatform.getMe();
      state.balance = Number(me.lidya || 0);
      const balance = document.getElementById('egpBalance');
      if (balance) balance.textContent = `Bakiye: ${state.balance.toLocaleString('tr-TR')} Lidya`;
      await Promise.all([loadRecipients(), loadGifts()]);
      updateSend();
    } catch (error) { toastSafe(error.message || 'Hediye paneli yüklenemedi.'); }
  }

  async function send() {
    if (!state.roomId || !state.selectedRecipient || !state.selectedGift || !window.ErisRoomGift) return;
    const button = document.querySelector('#egpGifts .egp-send');
    if (button) { button.disabled = true; button.textContent = 'Gönderiliyor…'; }
    try {
      const target=state.selectedRecipient==='@mic'?'mic':state.selectedRecipient==='@room'?'room':'user';
      await window.ErisPlatform.api(`/rooms/${encodeURIComponent(state.roomId)}/gifts`,{
        method:'POST',body:JSON.stringify({target,recipient_id:target==='user'?state.selectedRecipient:null,
          gift_key:state.selectedGift,quantity:state.quantity})});
      toastSafe('Hediye gönderildi 🎁');
      document.getElementById('erischatGiftPanel')?.classList.remove('show'); state.selectedGift=null; renderGifts();
    } catch (error) { toastSafe(error.message || 'Hediye gönderilemedi.'); const note=document.querySelector('#erischatGiftPanel .egp-note'); if(note) note.textContent=error.message||'Hediye gönderilemedi.'; }
    finally { if (button) { button.textContent = 'Gönder'; updateSend(); } }
  }

  function ensureUi() {
    if (!document.body || document.getElementById('erischatGiftPanel')) return;
    injectStyles();
    const panel = document.createElement('section');
    panel.id = 'erischatGiftPanel';
    panel.innerHTML = '<div class="egp-head"><div><div class="egp-title">🎁 Odaya hediye gönder</div><div class="egp-balance" id="egpBalance">Bakiye yükleniyor…</div></div><button class="egp-close" type="button">×</button></div><div class="gift-sound-setting"><span>Hediye efektleri</span><button type="button" data-gift-sound>Ses açık</button></div><div class="egp-note">Alıcıyı seç; kategoriyi seç; hediyeyi adından seç.</div><div class="egp-row" id="egpRecipients"></div><div class="egp-cats" id="egpCategories"></div><div class="egp-qty" id="egpQuantity"></div><div class="egp-grid" id="egpGifts"></div>';
    panel.querySelector('[data-gift-sound]').textContent=window.ErisGiftStage?.soundEnabled?.()?'Ses açık':'Ses kapalı';
    panel.querySelector('[data-gift-sound]').onclick=()=>window.ErisGiftStage?.soundEnabled?.(!window.ErisGiftStage.soundEnabled());
    panel.querySelector('.egp-close').onclick = () => {panel.classList.remove('show');state.selectedGift=null;renderGifts()};
    const qty=panel.querySelector('#egpQuantity');
    qty.innerHTML='Adet: '+[1,3,5,9,49,99].map(n=>`<button type="button" data-qty="${n}">${n}</button>`).join('');
    qty.querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>{
      state.quantity=Number(b.dataset.qty);
      qty.querySelectorAll('[data-qty]').forEach(x=>x.classList.toggle('active',x===b));
      renderGifts();updateSend();
    });
    qty.querySelector('[data-qty="1"]').classList.add('active');
    document.body.appendChild(panel);
  }

  function setRoom(roomId, open = false) {
    state.roomId = roomId ? String(roomId) : null;
    if (state.roomId && open) { state.selectedGift=null; state.selectedRecipient=null; state.category='all';state.quantity=1; ensureUi();document.querySelectorAll('#egpQuantity [data-qty]').forEach(b=>b.classList.toggle('active',b.dataset.qty==='1')); document.getElementById('erischatGiftPanel')?.classList.add('show'); refresh(); }
  }

  window.addEventListener('erischat:room-ws', event => {
    const detail = event.detail || {};
    if (detail.state === 'open') setRoom(detail.roomId, false);
    if (detail.state === 'closed' && String(detail.roomId) === state.roomId) setRoom(null, false);
  });
  window.addEventListener('erischat:room-actions-ready', () => { if (state.roomId) ensureUi(); });
  window.openRoomGift = function(roomId) { setRoom(roomId || window.ErisCurrentRoomId || window.currentRoomId, true); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUi, { once: true }); else ensureUi();
})();
