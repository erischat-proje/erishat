(() => {
  const api = () => window.ErisPlatform;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '');
  let activeConversationId = null;
  let currentUserId = null;
  let loadedForUserId = null;

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

  async function loadUserProfile(userId){
    const id=String(userId||'').trim(); if(!id||!api()?.api)return;
    document.getElementById('eris-dm-profile-modal')?.remove();
    const modal=document.createElement('div');modal.id='eris-dm-profile-modal';modal.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(2,1,7,.78);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px';
    modal.innerHTML='<div style="width:min(420px,100%);max-height:80vh;overflow:auto;background:#0b0911;border:1px solid #ffffff14;border-radius:24px;padding:18px;color:#fff"><div style="display:flex;justify-content:space-between;align-items:center"><b>Kullanıcı profili</b><button id="erpClose" class="close">×</button></div><div id="erpBody" style="margin-top:12px">Yükleniyor…</div></div>';document.body.appendChild(modal);modal.querySelector('#erpClose').onclick=()=>modal.remove();
    try{const [u,f,g]=await Promise.all([api().api('/users/'+encodeURIComponent(id)),api().api('/users/'+encodeURIComponent(id)+'/fans').catch(()=>({level:0,total:0})),api().api('/users/'+encodeURIComponent(id)+'/profile-gifts').catch(()=>[])]);const body=modal.querySelector('#erpBody');body.innerHTML='<div class="card" style="padding:14px"><div style="font-size:20px">👤</div><b>'+esc(u.nickname||'Anonim kullanıcı')+'</b><small style="display:block;color:#938a9f;margin-top:5px">ID: '+esc(u.public_id||u.id||id)+'</small><small style="display:block;color:#938a9f;margin-top:4px">Fan seviyesi '+Number(f.level||0)+' • '+Number(f.total||0)+' fan • '+(Array.isArray(g)?g.length:0)+' profil hediyesi</small></div><div style="display:flex;gap:7px;margin-top:9px"><button id="erpMsg" class="primary" style="height:40px;flex:1">Mesaj gönder</button></div>';body.querySelector('#erpMsg').onclick=async()=>{modal.remove();try{await createConversation(u.id||id,u.nickname||'Anonim kullanıcı')}catch(e){window.toast?.(e.message||'Konuşma açılamadı.')}}}catch(e){modal.querySelector('#erpBody').textContent=e.message||'Kullanıcı bulunamadı.'}
  }
  function installMessageSearch(){
    const root=document.getElementById('messages');if(!root||root.querySelector('[data-dm-search]'))return;
    const title=root.querySelector('.title');const search=document.createElement('div');search.setAttribute('data-dm-search','');search.style.cssText='margin:0 0 14px;position:relative';search.innerHTML='<input data-dm-user-search class="search-input" inputmode="text" autocomplete="off" placeholder="Kullanıcı ID ara…" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.055);border:1px solid #ffffff14;color:#fff;border-radius:18px;padding:13px 45px 13px 15px;outline:none"><button data-dm-search-btn class="primary" style="position:absolute;right:5px;top:5px;height:36px;border-radius:14px">⌕</button><div data-dm-search-result style="margin-top:7px"></div>';title?.parentNode?.insertBefore(search,title.nextSibling);
    const input=search.querySelector('[data-dm-user-search]'),out=search.querySelector('[data-dm-search-result]');const run=async()=>{const q=input.value.trim();if(!q){out.innerHTML='';return}out.innerHTML='<div class="card" style="padding:10px;font-size:9px;color:#aaa">Aranıyor…</div>';try{const u=await api().api('/users/'+encodeURIComponent(q));out.innerHTML='<button type="button" class="item card" style="width:100%;text-align:left"><div class="ava round">👤</div><div class="grow"><b>'+esc(u.nickname||'Anonim kullanıcı')+'</b><small>ID: '+esc(u.public_id||u.id||q)+' • Profili görüntüle</small></div></button>';out.querySelector('button').onclick=()=>loadUserProfile(u.id||q)}catch(e){out.innerHTML='<div class="card" style="padding:10px;font-size:9px;color:#ff9dbd">Kullanıcı bulunamadı.</div>'}};search.querySelector('[data-dm-search-btn]').onclick=run;input.onkeydown=e=>{if(e.key==='Enter')run()};
  }
  async function loadConversations() {
    installMessageSearch();
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
        const name = other.nickname || other.name || c.name || 'Anonim kullanıcı';
        const avatar = avatarValue(other.avatar_asset || other.avatar_url || other.avatar, name.slice(0, 1).toUpperCase());
        const b = document.createElement('button');
        b.className = 'item';
        b.innerHTML = '<div class="ava round"></div><div class="grow"><b></b><small>Gerçek konuşma</small></div>';
        renderAvatar(b.querySelector('.ava'), avatar, name.slice(0, 1).toUpperCase());
        b.querySelector('b').textContent = name;
        b.onclick = () => { window.__erisActiveDmUserId = other.id || other.user_id || null; openRealChat(id, name, avatar); };
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
        const row = document.createElement('div');
        row.className = 'bubble me';
        if (m?.id != null) row.dataset.messageId = String(m.id);
        row.textContent = m?.text || m?.message || text;
        body.appendChild(row);
        input.value = '';
        body.scrollTop = body.scrollHeight;
      } catch (e) {
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
    chat.classList.add('show');
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
        const row = document.createElement('div');
        row.className = 'bubble' + (mine ? ' me' : '');
        row.textContent = esc(m.text ?? m.message ?? '');
        body.appendChild(row);
      });
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
    if (!data || data.type !== 'dm_message' || !data.conversation_id) return;
    const id = String(data.conversation_id);
    if (String(activeConversationId || '') === id) {
      const body = document.querySelector('#chat .chatBody');
      if (!body || body.querySelector('[data-message-id="'+String(data.message_id).replace(/"/g,'&quot;')+'"]')) return;
      const mine = String(data.sender_id || '') === String(currentUserId || '');
      const row = document.createElement('div');
      row.className = 'bubble' + (mine ? ' me' : '');
      if (data.message_id != null) row.dataset.messageId = String(data.message_id);
      row.textContent = data.text || '';
      body.appendChild(row);
      body.scrollTop = body.scrollHeight;
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
    const apiBase = String(window.ERISCHAT_API_BASE || 'https://erischat-production.up.railway.app/v1').replace(/\\/$/, '');
    const wsBase = apiBase.replace(/\\/v1\\/?$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const ws = new WebSocket(wsBase + '/ws?token=' + encodeURIComponent(token));
    dmSocket = ws;
    ws.onopen = () => { dmReconnectAttempt = 0; try { ws.send(JSON.stringify({type:'ping'})); } catch (_) {} };
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'dm_message') window.dispatchEvent(new CustomEvent('erischat:event', {detail:data}));
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
})();