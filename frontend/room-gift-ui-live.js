/* Live room gift picker. Uses the existing REST gift bridge and room view seats. */
(() => {
  const state = { roomId: null, gifts: [], recipients: [], selectedGift: null, selectedRecipient: null, category: 'all', balance: 0 };
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
    return (GIFT_CATEGORIES.find(x=>price>=x[2]&&price<=x[3])||GIFT_CATEGORIES[9])[0];
  };
  const giftLevel = gift => {
    const key=giftCategory(gift);
    return (GIFT_CATEGORIES.find(x=>x[0]===key)||GIFT_CATEGORIES[0])[4];
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const toastSafe = message => typeof window.toast === 'function' ? window.toast(message) : console.warn('[ErisChat gift]', message);

  function injectStyles() {
    if (document.getElementById('erischat-gift-live-style')) return;
    const style = document.createElement('style');
    style.id = 'erischat-gift-live-style';
    style.textContent = '#erisGiftFx{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;pointer-events:none;background:radial-gradient(circle at center,#ff4fa322,transparent 45%);animation:egfxbg 1s ease-out}.egfx-card{position:relative;text-align:center;padding:26px 32px;border:1px solid #ffffff33;border-radius:24px;background:#0d0915ee;box-shadow:0 0 50px #ff4fa366;animation:egfxcard 1s ease-out}.egfx-level{font-size:10px;letter-spacing:3px;color:#f1c96b;font-weight:900}.egfx-icon{font-size:64px;margin:10px}.egfx-title{font-size:18px;font-weight:900}.egfx-gift{margin-top:7px;color:#d8cfe0;font-size:11px}.level-2 .egfx-card{animation-duration:1.4s}.level-3 .egfx-card{animation-duration:1.6s}.level-4 .egfx-card{animation:egfxcard 1.8s ease-out}.level-5 .egfx-card{animation:egfxcard 2s ease-out}.level-6 .egfx-card{animation:egfxcard 2.2s ease-out}.level-7 .egfx-card{animation:egfxcard 2.5s ease-out;box-shadow:0 0 90px #ffcf4a99}.level-8 .egfx-card{animation:egfxcard 3s ease-out;box-shadow:0 0 120px #9d6bffff}.level-9 .egfx-card{animation:egfxcard 3.5s ease-out;box-shadow:0 0 160px #ffcf4aff}.egfx-glow{position:absolute;inset:20%;border-radius:50%;filter:blur(30px);background:#ff4fa355;animation:egfxpulse 1s infinite alternate}@keyframes egfxcard{0%{opacity:0;transform:scale(.35) translateY(30px)}45%{opacity:1;transform:scale(1.08) translateY(0)}100%{opacity:0;transform:scale(1.18) translateY(-15px)}}@keyframes egfxbg{0%{opacity:0}20%{opacity:1}100%{opacity:0}}@keyframes egfxpulse{from{transform:scale(.7);opacity:.25}to{transform:scale(1.3);opacity:.8}}.level-2 .egfx-glow{animation-duration:1.3s}.level-3 .egfx-glow{animation-duration:1.1s;filter:blur(24px)}.level-4 .egfx-glow{animation-duration:.9s;transform:scale(1.15)}.level-5 .egfx-glow{animation-duration:.75s;filter:blur(34px)}.level-6 .egfx-glow{animation-duration:.65s;transform:scale(1.25)}.level-7 .egfx-glow{animation-duration:.55s;filter:blur(42px)}.level-8 .egfx-glow{animation-duration:.45s;transform:scale(1.4)}.level-9 .egfx-glow{animation-duration:.35s;filter:blur(52px);transform:scale(1.55)}.level-7 #erisGiftFx,.level-8 #erisGiftFx,.level-9 #erisGiftFx{background:radial-gradient(circle at center,#ffcf4a44,transparent 55%)}.level-7 .egfx-card,.level-8 .egfx-card,.level-9 .egfx-card{border-width:2px}#erischatGiftFab{position:fixed;right:16px;bottom:86px;z-index:115;width:48px;height:48px;border:1px solid #ffffff22;border-radius:16px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-size:20px;box-shadow:0 12px 30px #0008;display:none}#erischatGiftPanel{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:116;width:min(500px,calc(100% - 24px));max-height:70vh;overflow:auto;padding:15px;border:1px solid #ffffff18;border-radius:22px;background:#0b0911;box-shadow:0 22px 60px #000b;display:none}#erischatGiftPanel.show{display:block}.egp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.egp-title{font-size:14px;font-weight:900}.egp-close{border:0;background:#ffffff09;color:#fff;border-radius:10px;width:34px;height:34px}.egp-row{display:flex;gap:7px;overflow:auto;margin:8px 0}.egp-chip{border:1px solid #ffffff14;background:#ffffff06;color:#ddd;border-radius:12px;padding:8px 10px;white-space:nowrap;font-size:9px}.egp-chip.active{border-color:#ff4fa3;background:#ff4fa31c;color:#fff}.egp-cats{display:flex;gap:6px;overflow:auto;margin:5px 0 10px}.egp-cat{border:1px solid #ffffff14;background:#ffffff06;color:#bbb;border-radius:11px;padding:7px 9px;white-space:nowrap;font-size:8px}.egp-cat.active{border-color:#ff4fa3;background:#ff4fa31c;color:#fff}.egp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.egp-gift{border:1px solid #ffffff12;background:#ffffff05;color:#fff;border-radius:14px;padding:9px;text-align:left}.egp-gift.active{border-color:#8a5cff;background:#8a5cff18}.egp-gift:disabled{opacity:.3;filter:grayscale(1)}.egp-gift .egp-name{display:block;font-size:10px;line-height:1.25;min-height:26px}.egp-gift .egp-price{display:block;color:#e4b85d;font-size:8px;margin-top:5px}.egp-send{width:100%;margin-top:10px;border:0;border-radius:13px;padding:11px;background:linear-gradient(135deg,#7b4cff,#ff4fa3);color:#fff;font-weight:900;font-size:10px}.egp-send:disabled{opacity:.45}.egp-note{color:#938a9f;font-size:9px;padding:8px 0}.egp-balance{color:#e4b85d;font-size:9px;font-weight:800}\n';
    document.head.appendChild(style);
  }

  function updateSend() {
    const button = document.getElementById('egpSend');
    if (button) button.disabled = !(state.roomId && state.selectedRecipient && state.selectedGift);
  }

  function renderRecipients() {
    const box = document.getElementById('egpRecipients');
    if (!box) return;
    box.innerHTML = state.recipients.length ? state.recipients.map(r => `<button class="egp-chip${state.selectedRecipient === r.id ? ' active' : ''}" data-rec="${esc(r.id)}" type="button">👤 ${esc(r.name)}</button>`).join('') : '<div class="egp-note">Şu anda hediye gönderilebilecek aktif koltuk bulunamadı.</div>';
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
      const affordable=state.balance>=price;
      return `<button class="egp-gift${state.selectedGift === name ? ' active' : ''}" data-gift="${esc(name)}" type="button" title="${esc(name)}" aria-label="${esc(name)}" ${affordable?'':'disabled'}><span class="egp-name">${esc(name)}</span><span class="egp-price">💎 ${price.toLocaleString('tr-TR')}</span></button>`;
    }).join('') : '<div class="egp-note">Bu kategoride hediye yok.</div>';
    cats?.querySelectorAll('[data-cat]').forEach(btn=>{btn.onclick=()=>{state.category=btn.dataset.cat;renderGifts();};});
    box.querySelectorAll('[data-gift]').forEach(btn => { btn.onclick = () => { state.selectedGift = btn.dataset.gift; renderGifts(); updateSend(); }; });
  }

  async function loadRecipients() {
    if (!state.roomId || !window.ErisPlatform?.api) return;
    const room = await window.ErisPlatform.api(`/rooms/${encodeURIComponent(state.roomId)}`);
    const me = await window.ErisPlatform.getMe().catch(() => null);
    const ids = new Set();
    const meId=String(me?.id||'');
    const recipients = [];
    if (room.owner_id && String(room.owner_id)!==meId) { const rid=String(room.owner_id); ids.add(rid); recipients.push({ id: rid, name: String(room.owner_name || 'Oda sahibi') }); }
    (Array.isArray(room.seats) ? room.seats : []).forEach(seat => {
      if (seat.user_id && String(seat.user_id)!==meId && !ids.has(String(seat.user_id))) { const rid=String(seat.user_id); ids.add(rid); recipients.push({ id: rid, name: String(seat.user_name || `Koltuk ${seat.seat_number}`) }); }
    });
    state.recipients = recipients;
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
      if (balance) balance.textContent = `💎 ${state.balance.toLocaleString('tr-TR')} Lidya`;
      await Promise.all([loadRecipients(), loadGifts()]);
      updateSend();
    } catch (error) { toastSafe(error.message || 'Hediye paneli yüklenemedi.'); }
  }

  async function send() {
    if (!state.roomId || !state.selectedRecipient || !state.selectedGift || !window.ErisRoomGift) return;
    const button = document.getElementById('egpSend');
    if (button) { button.disabled = true; button.textContent = 'Gönderiliyor…'; }
    try {
      await window.ErisRoomGift.send(state.roomId, state.selectedRecipient, state.selectedGift, 1);
      toastSafe('Hediye gönderildi 🎁');
      document.getElementById('erischatGiftPanel')?.classList.remove('show');
    } catch (error) { toastSafe(error.message || 'Hediye gönderilemedi.'); const note=document.querySelector('#erischatGiftPanel .egp-note'); if(note) note.textContent=error.message||'Hediye gönderilemedi.'; }
    finally { if (button) { button.textContent = 'Hediye gönder'; updateSend(); } }
  }

  function ensureUi() {
    if (!document.body || document.getElementById('erischatGiftPanel')) return;
    injectStyles();
    const panel = document.createElement('section');
    panel.id = 'erischatGiftPanel';
    panel.innerHTML = '<div class="egp-head"><div><div class="egp-title">🎁 Odaya hediye gönder</div><div class="egp-balance" id="egpBalance">Bakiye yükleniyor…</div></div><button class="egp-close" type="button">×</button></div><div class="egp-note">Alıcıyı seç; kategoriyi seç; hediyeyi adından seç.</div><div class="egp-row" id="egpRecipients"></div><div class="egp-cats" id="egpCategories"></div><div class="egp-grid" id="egpGifts"></div><button class="egp-send" id="egpSend" type="button" disabled>Hediye gönder</button>';
    panel.querySelector('.egp-close').onclick = () => panel.classList.remove('show');
    panel.querySelector('#egpSend').onclick = send;
    document.body.appendChild(panel);
  }

  function setRoom(roomId, open = false) {
    state.roomId = roomId ? String(roomId) : null;
    if (state.roomId && open) { state.selectedGift=null; state.selectedRecipient=null; state.category='all'; ensureUi(); document.getElementById('erischatGiftPanel')?.classList.add('show'); refresh(); }
  }

  function showGiftAnimation(data){
    const level=Number(data?.level||0);
    if(level<=1)return;
    const name=String(data?.gift_name||data?.gift_key||'Hediye');
    const price=Number(data?.total_price||data?.price||0);
    const sender=String(data?.sender_name||data?.sender_nickname||data?.sender_id||'Bir kullanıcı');
    const recipient=String(data?.recipient_name||data?.recipient_nickname||data?.recipient_id||'bir kullanıcı');
    const old=document.getElementById('erisGiftFx'); old?.remove();
    const fx=document.createElement('div'); fx.id='erisGiftFx'; fx.className='eris-gift-fx level-'+Math.min(level,9);
    fx.innerHTML=`<div class="egfx-glow"></div><div class="egfx-card"><div class="egfx-level">SEVİYE ${level}</div><div class="egfx-title">${esc(sender)} → ${esc(recipient)}</div><div class="egfx-gift">${esc(name)} • 💎 ${price.toLocaleString('tr-TR')}</div></div>`;
    document.body.appendChild(fx); setTimeout(()=>fx.remove(), level>=7?6500:Math.min(5200,1800+level*350));
  }
  window.addEventListener('erischat:room-gift',e=>showGiftAnimation(e.detail||{}));
  window.addEventListener('erischat:room-ws', event => {
    const detail = event.detail || {};
    if (detail.state === 'open') setRoom(detail.roomId, false);
    if (detail.state === 'closed' && String(detail.roomId) === state.roomId) setRoom(null, false);
  });
  window.addEventListener('erischat:room-gift', () => {});
  window.addEventListener('erischat:room-actions-ready', () => { if (state.roomId) ensureUi(); });
  window.openRoomGift = function(roomId) { setRoom(roomId || window.ErisCurrentRoomId || window.currentRoomId, true); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUi, { once: true }); else ensureUi();
})();
