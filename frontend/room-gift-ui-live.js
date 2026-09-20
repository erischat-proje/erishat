/* Live room gift picker. Uses the existing REST gift bridge and room view seats. */
(() => {
  const state = { roomId: null, gifts: [], recipients: [], selectedGift: null, selectedRecipient: null, category: 'all' };
  const giftCategory = gift => {
    const price=Number(gift?.price||gift?.unit_price||0);
    if(price<=99) return 'Başlangıç';
    if(price<=999) return 'Eşya & Savaş';
    if(price<=9999) return 'Zenginlik';
    if(price<=19999) return 'Kraliyet';
    if(price<=49999) return 'Saray';
    if(price<=89999) return 'Mitoloji';
    return 'Lidya';
  };
  const giftIcon = name => {
    const n=String(name||'').toLocaleLowerCase('tr-TR');
    const rules=[
      [/gül|çiçek|başak|incir ağacı/,'🌹'],[/kalp|aşk|afrodit|inci/,'💖'],[/altın|hazine|taht|krezus|lidya|sikke|paktolos/,'👑'],
      [/elmas|mücevher|yakut|safir|zümrüt|lapis|kehribar|değerli taş/,'💎'],[/kılıç|mızrak|bıçak|hançer|balta|yay|ok|zırh|kalkan|çekiç|kamçı/,'⚔️'],
      [/taç|çelenk|gerdanlık|bilezik|yüzük|broş|kemer|mühür/,'👑'],[/yemek|ekmek|bal|peynir|süt|yoğurt|balık|meyve|elma|ceviz|üzüm|noh[u]?t|çörek|pide|çay|baharat|reçel|mısır/,'🍯'],
      [/şarap|kase|kupa|karaf|vazo|şişe|sürahi|bardak/,'🏺'],[/gemi|yat|araba|ahır/,'🛥️'],[/saray|köşk|kule|bahçe|havuz|çeşme|sütun|amfi|kütüphane|çiftlik/,'🏛️'],
      [/zeus|pegasus|apollon|athena|poseidon|ares|hermes|hades|dionysos|artemis|demeter|chronos|prometheus|medusa|hydra|minotaur|sphinx|titan/,'⚡'],
      [/ateş|meşale|şimşek|yıldırım/,'🔥'],[/müzik|liri|borusu|çan/,'🎵'],[/kitap|parşömen|harita/,'📜'],[/kumaş|şal|cübbe|kaftan|halı|örtü/,'🧵'],[/ayna|tarak|parfüm|sandalet|eldiven/,'✨']
    ];
    return (rules.find(([re])=>re.test(n))||[])[1] || (Number(name?.price||0)>=90000?'🏆':Number(name?.price||0)>=50000?'✨':'🎁');
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const toastSafe = message => typeof window.toast === 'function' ? window.toast(message) : console.warn('[ErisChat gift]', message);

  function injectStyles() {
    if (document.getElementById('erischat-gift-live-style')) return;
    const style = document.createElement('style');
    style.id = 'erischat-gift-live-style';
    style.textContent = '#erischatGiftFab{position:fixed;right:16px;bottom:86px;z-index:115;width:48px;height:48px;border:1px solid #ffffff22;border-radius:16px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-size:20px;box-shadow:0 12px 30px #0008;display:none}#erischatGiftPanel{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:116;width:min(500px,calc(100% - 24px));max-height:70vh;overflow:auto;padding:15px;border:1px solid #ffffff18;border-radius:22px;background:#0b0911;box-shadow:0 22px 60px #000b;display:none}#erischatGiftPanel.show{display:block}.egp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.egp-title{font-size:14px;font-weight:900}.egp-close{border:0;background:#ffffff09;color:#fff;border-radius:10px;width:34px;height:34px}.egp-row{display:flex;gap:7px;overflow:auto;margin:8px 0}.egp-chip{border:1px solid #ffffff14;background:#ffffff06;color:#ddd;border-radius:12px;padding:8px 10px;white-space:nowrap;font-size:9px}.egp-chip.active{border-color:#ff4fa3;background:#ff4fa31c;color:#fff}.egp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.egp-gift{border:1px solid #ffffff12;background:#ffffff05;color:#fff;border-radius:14px;padding:9px;text-align:left}.egp-gift.active{border-color:#8a5cff;background:#8a5cff18}.egp-gift b{display:block;font-size:9px}.egp-gift small{display:block;color:#e4b85d;font-size:8px;margin-top:4px}.egp-send{width:100%;margin-top:10px;border:0;border-radius:13px;padding:11px;background:linear-gradient(135deg,#7b4cff,#ff4fa3);color:#fff;font-weight:900;font-size:10px}.egp-send:disabled{opacity:.45}.egp-note{color:#938a9f;font-size:9px;padding:8px 0}.egp-balance{color:#e4b85d;font-size:9px;font-weight:800}\n';
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
    const categories=['all','Başlangıç','Eşya & Savaş','Zenginlik','Kraliyet','Saray','Mitoloji','Lidya'];
    if(cats) cats.innerHTML=categories.map(x=>`<button class="egp-cat${state.category===x?' active':''}" data-cat="${esc(x)}" type="button">${x==='all'?'Tümü':x}</button>`).join('');
    const visible=state.gifts.filter(g=>state.category==='all'||giftCategory(g)===state.category);
    box.innerHTML = visible.length ? visible.map(g => {
      const name=String(g.gift_key||g.name||'');
      const price=Number(g.price||g.unit_price||0);
      return `<button class="egp-gift${state.selectedGift === name ? ' active' : ''}" data-gift="${esc(name)}" type="button" title="${esc(name)}" aria-label="${esc(name)}"><span class="egp-icon">${giftIcon(name)}</span><span class="egp-price">💎 ${price.toLocaleString('tr-TR')}</span></button>`;
    }).join('') : '<div class="egp-note">Bu kategoride hediye yok.</div>';
    cats?.querySelectorAll('[data-cat]').forEach(btn=>{btn.onclick=()=>{state.category=btn.dataset.cat;renderGifts();};});
    box.querySelectorAll('[data-gift]').forEach(btn => { btn.onclick = () => { state.selectedGift = btn.dataset.gift; renderGifts(); updateSend(); }; });
  }

  async function loadRecipients() {
    if (!state.roomId || !window.ErisPlatform?.api) return;
    const room = await window.ErisPlatform.api(`/rooms/${encodeURIComponent(state.roomId)}`);
    const me = await window.ErisPlatform.getMe().catch(() => null);
    const ids = new Set();
    const recipients = [];
    if (room.owner_id && room.owner_id !== me?.id) { ids.add(room.owner_id); recipients.push({ id: room.owner_id, name: 'Oda sahibi' }); }
    (Array.isArray(room.seats) ? room.seats : []).forEach(seat => {
      if (seat.user_id && seat.user_id !== me?.id && !ids.has(seat.user_id)) { ids.add(seat.user_id); recipients.push({ id: seat.user_id, name: `Koltuk ${seat.seat_number}` }); }
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
      const balance = document.getElementById('egpBalance');
      if (balance) balance.textContent = `💎 ${Number(me.lidya || 0).toLocaleString('tr-TR')}`;
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
    } catch (error) { toastSafe(error.message || 'Hediye gönderilemedi.'); }
    finally { if (button) { button.textContent = 'Hediye gönder'; updateSend(); } }
  }

  function ensureUi() {
    if (!document.body || document.getElementById('erischatGiftPanel')) return;
    injectStyles();
    const panel = document.createElement('section');
    panel.id = 'erischatGiftPanel';
    panel.innerHTML = '<div class="egp-head"><div><div class="egp-title">🎁 Odaya hediye gönder</div><div class="egp-balance" id="egpBalance">Bakiye yükleniyor…</div></div><button class="egp-close" type="button">×</button></div><div class="egp-note">Alıcıyı seç, sonra kategoriden hediyeyi bul ve logosuna dokun.</div><div class="egp-row" id="egpRecipients"></div><div class="egp-cats" id="egpCategories"></div><div class="egp-grid" id="egpGifts"></div><button class="egp-send" id="egpSend" type="button" disabled>Hediye gönder</button>';
    panel.querySelector('.egp-close').onclick = () => panel.classList.remove('show');
    panel.querySelector('#egpSend').onclick = send;
    document.body.appendChild(panel);
  }

  function setRoom(roomId, open = false) {
    state.roomId = roomId ? String(roomId) : null;
    if (state.roomId && open) { ensureUi(); document.getElementById('erischatGiftPanel')?.classList.add('show'); refresh(); }
  }

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
