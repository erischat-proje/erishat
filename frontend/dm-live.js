(() => {
  const api = () => window.ErisPlatform;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '');
  const escapeHtml = value => esc(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let activeConversationId = null;
  let currentUserId = null;
  let loadedForUserId = null;
  let selectedMessages = new Set();
  let selectionBar = null;
  let notificationsRequested = false;

  function messageTime(value) {
    if (!value) return '';
    const date = new Date(value), now = new Date();
    if (Number.isNaN(date.getTime())) return '';
    const time = new Intl.DateTimeFormat('tr-TR', {hour:'2-digit',minute:'2-digit'}).format(date);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((today - day) / 86400000);
    const label = diff === 0 ? 'Bugün' : diff === 1 ? 'Dün' : new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:date.getFullYear()===now.getFullYear()?undefined:'numeric'}).format(date);
    return `${label} · ${time}`;
  }

  function renderMessage(message, mine) {
    const row = document.createElement('div');
    row.className = 'bubble' + (mine ? ' me' : '');
    if (message?.id != null) row.dataset.messageId = String(message.id);
    row.dataset.read = message?.is_read ? '1' : '0';
    const body = document.createElement('div');
    body.textContent = message?.gift_key ? `🎁 ${message.gift_key}` : String(message?.text ?? message?.message ?? '');
    row.append(body);
    if (message?.is_pinned) { const pin=document.createElement('span'); pin.dataset.pinIcon=''; pin.textContent='📌 '; pin.style.cssText='font-size:8px;color:#f3d995'; row.prepend(pin); }
    const meta = document.createElement('small');
    meta.style.cssText = 'display:flex;justify-content:flex-end;gap:5px;margin-top:4px;font-size:8px;line-height:1;color:#ffffff9c;white-space:nowrap';
    const when = document.createElement('span'); when.textContent = messageTime(message?.created_at); meta.append(when);
    if (mine) { const checks = document.createElement('span'); checks.className='dm-checks'; checks.textContent = message?.is_read ? '✓✓' : '✓'; checks.setAttribute('aria-label', message?.is_read ? 'Okundu' : 'Gönderildi'); meta.append(checks); }
    row.append(meta);
    if (message?.is_pinned) row.dataset.pinned = '1';
    return row;
  }

  function refreshSelectionBar() {
    if (!selectionBar) return;
    selectionBar.hidden = selectedMessages.size === 0;
    const count = selectionBar.querySelector('[data-selected-count]');
    if (count) count.textContent = `${selectedMessages.size} seçildi`;
    const pin = selectionBar.querySelector('[data-pin-selected]');
    if (pin) pin.textContent = [...selectedMessages].some(row => row.dataset.pinned === '1') ? 'Sabitlemeyi kaldır' : 'Sabitle';
  }

  function setSelected(row) {
    const id = row?.dataset?.messageId;
    if (!id) return;
    if (selectedMessages.has(row)) { selectedMessages.delete(row); row.classList.remove('dm-selected'); }
    else { selectedMessages.add(row); row.classList.add('dm-selected'); }
    refreshSelectionBar();
  }

  function asList(value, keys) {
    if (Array.isArray(value)) return value;
    for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
    return [];
  }

  function avatarValue(value, fallback = '') {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    return value.url || value.src || value.avatar_url || value.asset_url || value.path || fallback;
  }

  function renderAvatar(el, value, fallback) {
    if (!el) return;
    const avatar = avatarValue(value, fallback);
    el.textContent = '';
    el.style.backgroundImage = '';
    if (/^(https?:|data:|\/|\.\.?\/)/.test(avatar)) {
      el.style.backgroundImage = `url(${avatar})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.setAttribute('aria-label', fallback || 'Avatar');
    } else {
      el.textContent = avatar || fallback || '👤';
    }
  }

  async function resolveParticipant(conversation) {
    const members = asList(conversation?.members, ['members']);
    const other = members.find(member => String(member?.user_id) !== String(currentUserId));
    if (!other?.user_id) return {};
    try {
      return await api().api(`/users/${encodeURIComponent(other.user_id)}`);
    } catch (error) {
      console.warn('[ErisChat] participant profile unavailable', error);
      return { id: other.user_id, nickname: 'Anonim kullanıcı' };
    }
  }

  function showListError(list) {
    if (list) list.innerHTML = '<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Konuşmalar yüklenemedi.</div>';
  }

  function installChatTools(chat) {
    if (!chat || chat.querySelector('[data-dm-tools]')) return;
    const style = document.createElement('style');
    style.textContent = '.dm-unread{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:#ff4fa3;color:#fff;display:grid;place-items:center;font-size:9px;font-weight:900}.dm-selected{outline:2px solid #e9c66b!important}.dm-select-tools{display:flex;align-items:center;gap:7px;padding:7px 11px;border-bottom:1px solid #ffffff12;background:#100d16}.dm-select-tools[hidden]{display:none}.dm-select-tools button{border:1px solid #ffffff20;background:#ffffff0a;color:#fff;border-radius:10px;padding:6px 9px;font-size:9px}.dm-pinned{position:sticky;top:0;z-index:2;background:#e4b85d18;border:1px solid #e4b85d44;border-radius:10px;padding:7px 10px;font-size:9px;color:#f3d995}.dm-gift-sheet{position:fixed;inset:0;z-index:500;background:#020107bb;display:flex;align-items:flex-end}.dm-gift-sheet>section{width:min(520px,100%);max-height:76vh;overflow:auto;background:#0b0911;border:1px solid #ffffff20;border-radius:24px 24px 0 0;padding:16px}.dm-gift-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.dm-gift-grid button{background:#ffffff08;color:#fff;border:1px solid #ffffff15;border-radius:14px;padding:10px;font-size:11px}.dm-gift-grid small{display:block;color:#e4b85d;margin-top:4px;font-size:9px}';
    document.head.appendChild(style);
    selectionBar = document.createElement('div'); selectionBar.className = 'dm-select-tools'; selectionBar.dataset.dmTools = ''; selectionBar.hidden = true;
    selectionBar.innerHTML = '<span data-selected-count style="flex:1;font-size:9px;color:#d8cddd"></span><button data-pin-selected>Sabitle</button><button data-delete-selected>Sil</button><button data-clear-selected>Kapat</button>';
    const body = chat.querySelector('.chatBody'); body?.parentNode?.insertBefore(selectionBar, body);
    selectionBar.querySelector('[data-clear-selected]').onclick = () => { selectedMessages.forEach(row => row.classList.remove('dm-selected')); selectedMessages.clear(); refreshSelectionBar(); };
    selectionBar.querySelector('[data-delete-selected]').onclick = async () => {
      try { await api().deleteMessages(activeConversationId, [...selectedMessages].map(row => Number(row.dataset.messageId))); [...selectedMessages].forEach(row => row.remove()); selectedMessages.clear(); refreshSelectionBar(); }
      catch (e) { window.toast?.(e.message || 'Mesajlar silinemedi.'); }
    };
    selectionBar.querySelector('[data-pin-selected]').onclick = async () => {
      const rows = [...selectedMessages]; if (!rows.length) return;
      try {
        for (const row of rows) { const id = Number(row.dataset.messageId); const unpin = row.dataset.pinned === '1'; if (unpin) { await api().unpinMessage(activeConversationId,id); row.dataset.pinned='0'; row.querySelector('[data-pin-icon]')?.remove(); } else { await api().pinMessage(activeConversationId,id); row.dataset.pinned='1'; const pin=document.createElement('span');pin.dataset.pinIcon='';pin.textContent='📌 ';pin.style.cssText='font-size:8px;color:#f3d995';row.prepend(pin); } }
        selectedMessages.forEach(row => row.classList.remove('dm-selected')); selectedMessages.clear(); refreshSelectionBar();
      } catch (e) { window.toast?.(e.message || 'Sabitleme işlemi başarısız.'); }
    };
    let holdTimer = null, held = false;
    body?.addEventListener('pointerdown', event => { const row = event.target.closest('.bubble[data-message-id]'); if (!row) return; held = false; holdTimer = setTimeout(() => { held = true; setSelected(row); }, 520); });
    body?.addEventListener('pointerup', () => clearTimeout(holdTimer)); body?.addEventListener('pointerleave', () => clearTimeout(holdTimer));
    body?.addEventListener('click', event => { const row = event.target.closest('.bubble[data-message-id]'); if (held) { held = false; return; } if (selectedMessages.size && row) { event.preventDefault(); setSelected(row); } });
    const compose = chat.querySelector('.compose');
    const familyChat = / aile sohbeti$/i.test(String(chat.querySelector('.chatHead b')?.textContent||''));
    if (compose && !familyChat && !compose.querySelector('[data-dm-gift]')) { const button = document.createElement('button'); button.type='button'; button.dataset.dmGift=''; button.className='close'; button.textContent='🎁'; button.title='Hediye gönder'; compose.insertBefore(button,compose.firstChild); button.onclick=()=>openGiftSheet(); }
  }

  async function openGiftSheet() {
    if (!activeConversationId || !api()?.messageGifts) return;
    const modal = document.createElement('div'); modal.className='dm-gift-sheet'; modal.innerHTML='<section><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><b>Hediye seç</b><button class="close" data-close>×</button></div><div class="dm-gift-grid">Yükleniyor…</div></section>'; document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick=()=>modal.remove(); modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
    try { const gifts=await api().messageGifts(); const grid=modal.querySelector('.dm-gift-grid'); grid.replaceChildren(); gifts.forEach(g=>{const b=document.createElement('button');b.innerHTML=`<span>🎁 ${escapeHtml(g.gift_key)}</span><small>${Number(g.unit_price).toLocaleString('tr-TR')} Lidya</small>`;b.onclick=async()=>{try{const m=await api().sendMessageGift(activeConversationId,g.gift_key);document.querySelector('#chat .chatBody')?.append(renderMessage(m,true));modal.remove();loadConversations()}catch(e){window.toast?.(e.message||'Hediye gönderilemedi.')}};grid.append(b)}); }
    catch(e){modal.querySelector('.dm-gift-grid').textContent=e.message||'Hediyeler yüklenemedi.';}
  }

  async function loadUserProfile(userId){
    const id=String(userId||'').trim(); if(!id||!api()?.api)return;
    document.getElementById('eris-dm-profile-modal')?.remove();
    const modal=document.createElement('div');modal.id='eris-dm-profile-modal';modal.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(2,1,7,.78);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px';
    modal.innerHTML='<div style="width:min(420px,100%);max-height:80vh;overflow:auto;background:#0b0911;border:1px solid #ffffff14;border-radius:24px;padding:18px;color:#fff"><div style="display:flex;justify-content:space-between;align-items:center"><b>Kullanıcı profili</b><button id="erpClose" class="close">×</button></div><div id="erpBody" style="margin-top:12px">Yükleniyor…</div></div>';document.body.appendChild(modal);modal.querySelector('#erpClose').onclick=()=>modal.remove();
    try{const [u,f,g]=await Promise.all([api().api('/users/'+encodeURIComponent(id)),api().api('/users/'+encodeURIComponent(id)+'/fans').catch(()=>({level:0,total:0})),api().api('/users/'+encodeURIComponent(id)+'/profile-gifts').catch(()=>[])]);const body=modal.querySelector('#erpBody'),publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';body.innerHTML='<div class="card" style="padding:14px"><div style="font-size:20px">👤</div><b>'+escapeHtml(u.nickname||'Anonim kullanıcı')+'</b><small style="display:block;color:#938a9f;margin-top:5px">ID: '+escapeHtml(publicId)+'</small><small style="display:block;color:#938a9f;margin-top:4px">Fan seviyesi '+Number(f.level||0)+' • '+Number(f.total||0)+' fan • '+(Array.isArray(g)?g.length:0)+' profil hediyesi</small></div><div style="display:flex;gap:7px;margin-top:9px"><button id="erpMsg" class="primary" style="height:40px;flex:1">Mesaj gönder</button></div>';body.querySelector('#erpMsg').onclick=async()=>{modal.remove();try{await createConversation(u.id||id,u.nickname||'Anonim kullanıcı')}catch(e){window.toast?.(e.message||'Konuşma açılamadı.')}}}catch(e){modal.querySelector('#erpBody').textContent=e.message||'Kullanıcı bulunamadı.'}
  }
  function installMessageSearch(){
    const root=document.getElementById('messages');if(!root||root.querySelector('[data-dm-search]'))return;
    const title=root.querySelector('.title');const search=document.createElement('div');search.setAttribute('data-dm-search','');search.style.cssText='margin:0 0 14px;position:relative';search.innerHTML='<input data-dm-user-search class="search-input" inputmode="text" autocomplete="off" placeholder="Kullanıcı ID ara…" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.055);border:1px solid #ffffff14;color:#fff;border-radius:18px;padding:13px 45px 13px 15px;outline:none"><button data-dm-search-btn class="primary" style="position:absolute;right:5px;top:5px;height:36px;border-radius:14px">⌕</button><div data-dm-search-result style="margin-top:7px"></div>';title?.parentNode?.insertBefore(search,title.nextSibling);
    const notify=document.createElement('button');notify.type='button';notify.textContent='🔔 Mesaj bildirimlerini aç';notify.style.cssText='margin-top:7px;width:100%;padding:8px;border:1px solid #ffffff14;border-radius:12px;background:#ffffff05;color:#bdb3c7;font-size:9px';notify.onclick=async()=>{if(!('Notification' in window)){window.toast?.('Bu tarayıcı masaüstü bildirimlerini desteklemiyor.');return}const permission=await Notification.requestPermission();notify.textContent=permission==='granted'?'🔔 Bildirimler açık':'🔕 Bildirim izni verilmedi'};search.appendChild(notify);
    const input=search.querySelector('[data-dm-user-search]'),out=search.querySelector('[data-dm-search-result]');const run=async()=>{const q=input.value.trim();if(!q){out.innerHTML='';return}out.innerHTML='<div class="card" style="padding:10px;font-size:9px;color:#aaa">Aranıyor…</div>';try{const u=await api().api('/users/'+encodeURIComponent(q)),publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';out.innerHTML='<button type="button" class="item card" style="width:100%;text-align:left"><div class="ava round">👤</div><div class="grow"><b>'+escapeHtml(u.nickname||'Anonim kullanıcı')+'</b><small>ID: '+escapeHtml(publicId)+' • Profili görüntüle</small></div></button>';out.querySelector('button').onclick=()=>loadUserProfile(u.id||q)}catch(e){out.innerHTML='<div class="card" style="padding:10px;font-size:9px;color:#ff9dbd">Kullanıcı bulunamadı.</div>'}};search.querySelector('[data-dm-search-btn]').onclick=run;input.onkeydown=e=>{if(e.key==='Enter')run()};
  }
  async function loadConversations() {
    installMessageSearch();
    if (!(localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token'))) return;
    const list = document.querySelector('#messages .list');
    if (!list || !api()?.conversations) return;
    try {
      if (!currentUserId && api().getMe) {
        try {
          const me = await api().getMe();
          currentUserId = me?.id || null;
        } catch (error) {
          console.warn('[ErisChat] current user unavailable', error);
        }
      }
      if (!currentUserId) return;
      const payload = await api().conversations();
      const items = asList(payload, ['conversations', 'items', 'data']);
      list.innerHTML = '';
      loadedForUserId = currentUserId;
      if (!items.length) {
        list.innerHTML = '<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Henüz konuşma yok.</div>';
        return;
      }
      const participants = await Promise.all(items.map(resolveParticipant));
      items.forEach((c, index) => {
        const other = participants[index] || {};
        const id = c.id || c.conversation_id;
        if (!id) return;
        const family = c.type === 'family' || / aile sohbeti$/.test(String(c.name || ''));
        const name = family ? (c.name || 'Aile sohbeti') : (other.nickname || other.name || c.name || 'Anonim kullanıcı');
        const avatar = avatarValue(other.avatar_asset || other.avatar_url || other.avatar, name.slice(0, 1).toUpperCase());
        const b = document.createElement('button');
        b.className = 'item';
        b.innerHTML = '<div class="ava round"></div><div class="grow"><b></b><small></small></div><span class="dm-unread" hidden></span>';
        renderAvatar(b.querySelector('.ava'), family ? '👪' : avatar, name.slice(0, 1).toUpperCase());
        b.querySelector('b').textContent = name;
        b.querySelector('small').textContent = c.last_message || (family ? 'Aile sohbeti' : 'Mesajlaşma');
        const badge = b.querySelector('.dm-unread');
        const unread = Number(c.unread_count || 0);
        if (unread) { badge.hidden = false; badge.textContent = unread > 99 ? '99+' : String(unread); }
        b.onclick = () => { window.__erisActiveDmUserId = other.id || other.user_id || null; openRealChat(id, name, family ? '👪' : avatar); };
        list.appendChild(b);
      });
    } catch (e) {
      console.warn('[ErisChat] conversations unavailable', e);
      showListError(list);
    }
  }

  function bindSender(chat) {
    const input = chat.querySelector('input');
    const send = chat.querySelector('.primary');
    if (!send || send.dataset.realBound) return;
    send.dataset.realBound = '1';
    send.onclick = async () => {
      const id = activeConversationId;
      const text = input?.value?.trim();
      const body = chat.querySelector('.chatBody');
      if (!id || !text || !body) return;
      try {
        const m = await api().sendMessage(id, text);
        body.appendChild(renderMessage(m, true));
        input.value = '';
        body.scrollTop = body.scrollHeight;
      } catch (e) {
        if (/hediye ile kısıtlamış|hediyesi gerekli/i.test(String(e.message||''))) { window.toast?.(e.message); openGiftSheet(); return; }
        window.toast?.(e.message || 'Mesaj gönderilemedi.');
      }
    };
  }

  async function createConversation(participantId, participantName = 'Anonim kullanıcı') {
    if (!participantId || !api()?.createConversation) return null;
    const conversation = await api().createConversation(participantId); window.__erisActiveDmUserId = participantId;
    const id = conversation?.id || conversation?.conversation_id || conversation?.conversation?.id;
    if (id) {
      await loadConversations();
      const participant = await resolveParticipant(conversation);
      const name = participant.nickname || participant.name || participantName;
      const avatar = avatarValue(participant.avatar_asset || participant.avatar_url || participant.avatar, name.slice(0, 1).toUpperCase());
      openRealChat(id, name, avatar);
    }
    return conversation;
  }

  async function openRealChat(id, name, avatar = '') {
    const chat = $('chat');
    const body = chat?.querySelector('.chatBody');
    if (!chat || !body || !api()?.messages) return;
    activeConversationId = id;
    selectedMessages.clear();
    chat.classList.add('show');
    installChatTools(chat);
    const title = chat.querySelector('.chatHead b');
    if (title) title.textContent = name;
    renderAvatar(chat.querySelector('.chatHead .ava'), avatar, name?.slice(0, 1)?.toUpperCase());
    body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Mesajlar yükleniyor…</div>';
    try {
      const payload = await api().messages(id);
      const messages = asList(payload, ['messages', 'items', 'data']);
      body.innerHTML = '';
      if (!messages.length) body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Henüz mesaj yok.</div>';
      messages.forEach(m => {
        const senderId = m.sender_id ?? m.user_id;
        const mine = typeof m.is_mine === 'boolean' ? m.is_mine : String(senderId) === String(currentUserId);
        body.appendChild(renderMessage(m, mine));
      });
      refreshSelectionBar();
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      console.warn('[ErisChat] messages unavailable', e);
      body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Konuşma yüklenemedi.</div>';
    }
    bindSender(chat);
  }

  async function sendMessage(id, text) {
    if (!id || !text?.trim() || !api()?.sendMessage) throw new Error('Geçerli konuşma gerekli.');
    return api().sendMessage(id, text.trim());
  }
  function handleRealtimeMessage(event) {
    const data = event?.detail;
    if (data?.type === 'dm_read' && data.conversation_id) {
      if (String(activeConversationId||'') !== String(data.conversation_id)) return;
      document.querySelectorAll('#chat .bubble.me[data-message-id]').forEach(row=>{if(Number(row.dataset.messageId)<=Number(data.read_up_to||0)){row.dataset.read='1';const mark=row.querySelector('.dm-checks');if(mark){mark.textContent='✓✓';mark.setAttribute('aria-label','Okundu')}}});
      return;
    }
    if (!data || data.type !== 'dm_message' || !data.conversation_id) return;
    const id = String(data.conversation_id);
    if (String(activeConversationId || '') === id) {
      const body = document.querySelector('#chat .chatBody');
      if (!body || body.querySelector('[data-message-id="'+String(data.message_id).replace(/"/g,'&quot;')+'"]')) return;
      const mine = String(data.sender_id || '') === String(currentUserId || '');
      body.appendChild(renderMessage({...data,id:data.message_id}, mine));
      body.scrollTop = body.scrollHeight;
      if (!mine) api().messages(id).catch(()=>{});
    } else if (String(data.sender_id || '') !== String(currentUserId || '') && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(data.sender_nickname || 'Yeni mesaj', {body:data.text||'Yeni mesaj aldınız.',tag:'dm-'+data.conversation_id}); } catch (_) {}
    }
    loadConversations();
  }

  // One authenticated user socket carries DM realtime events. Room sockets stay separate.
  let dmSocket = null;
  let dmReconnectTimer = null;
  let dmReconnectAttempt = 0;
  function dmToken(){ return localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || ''; }
  function connectDmSocket(){
    const token = dmToken();
    if (!token) return;
    try { dmSocket?.close(); } catch (_) {}
    const apiBase = String(window.ERISCHAT_API_BASE || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
    const wsBase = apiBase.replace(/\/v1\/?$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const ws = new WebSocket(wsBase + '/ws', ['erischat', 'token.' + token]);
    dmSocket = ws;
    ws.onopen = () => { dmReconnectAttempt = 0; try { ws.send(JSON.stringify({type:'ping'})); } catch (_) {} };
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'dm_message' || data?.type === 'dm_read') window.dispatchEvent(new CustomEvent('erischat:event', {detail:data}));
      } catch (_) {}
    };
    ws.onclose = () => {
      if (dmSocket !== ws) return;
      dmSocket = null;
      if (!dmToken()) return;
      const delay = Math.min(15000, 1000 * Math.pow(2, dmReconnectAttempt++));
      clearTimeout(dmReconnectTimer);
      dmReconnectTimer = setTimeout(connectDmSocket, delay);
    };
  }
  window.addEventListener('erischat:event', handleRealtimeMessage);

  window.ErisChatDM = { load: loadConversations, open: openRealChat, create: createConversation, send: sendMessage, activeId: () => activeConversationId };

  window.addEventListener('erischat:auth', event => {
    if (event?.detail?.state === 'ready') {
      currentUserId = event.detail.user?.id || currentUserId;
      connectDmSocket();
      if (currentUserId !== loadedForUserId) loadConversations();
    } else if (event?.detail?.state === 'logged_out') {
      currentUserId = null;
      loadedForUserId = null;
      clearTimeout(dmReconnectTimer);
      dmReconnectTimer = null;
      try { dmSocket?.close(); } catch (_) {}
      dmSocket = null;
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadConversations, { once: true });
  else loadConversations();
  setInterval(() => { if (document.visibilityState !== 'hidden') loadConversations(); }, 18000);
})();
