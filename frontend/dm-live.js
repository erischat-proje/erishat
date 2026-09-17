(() => {
  const api = () => window.ErisPlatform;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '');
  let activeConversationId = null;
  let currentUserId = null;

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

  async function loadConversations() {
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
      const payload = await api().conversations();
      const items = asList(payload, ['conversations', 'items', 'data']);
      list.innerHTML = '';
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
        b.onclick = () => openRealChat(id, name, avatar);
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
    const conversation = await api().createConversation(participantId);
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

  window.ErisChatDM = { load: loadConversations, open: openRealChat, create: createConversation };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadConversations, { once: true });
  else loadConversations();
})();
