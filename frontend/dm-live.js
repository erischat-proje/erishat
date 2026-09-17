(() => {
  const api = () => window.ErisPlatform;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '');
  let activeConversationId = null;

  function asList(value, keys) {
    if (Array.isArray(value)) return value;
    for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
    return [];
  }

  function showListError(list) {
    if (list) list.innerHTML = '<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Konuşmalar yüklenemedi.</div>';
  }

  async function loadConversations() {
    const list = document.querySelector('#messages .list');
    if (!list || !api()?.conversations) return;
    try {
      const payload = await api().conversations();
      const items = asList(payload, ['conversations', 'items', 'data']);
      list.innerHTML = '';
      if (!items.length) {
        list.innerHTML = '<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Henüz konuşma yok.</div>';
        return;
      }
      items.forEach(c => {
        const other = c.participants?.find?.(p => String(p.id) !== String(c.current_user_id)) || c.participant || {};
        const id = c.id || c.conversation_id;
        if (!id) return;
        const name = other.nickname || other.name || c.name || 'Anonim kullanıcı';
        const avatar = other.avatar || name.slice(0, 1).toUpperCase();
        const b = document.createElement('button');
        b.className = 'item';
        b.innerHTML = '<div class="ava round"></div><div class="grow"><b></b><small>Gerçek konuşma</small></div>';
        b.querySelector('.ava').textContent = avatar;
        b.querySelector('b').textContent = name;
        b.onclick = () => openRealChat(id, name);
        list.appendChild(b);
      });
    } catch (e) {
      console.warn('[ErisChat] conversations unavailable', e);
      showListError(list);
    }
  }

  function bindSender(chat, body) {
    const input = chat.querySelector('input');
    const send = chat.querySelector('.primary');
    if (!send || send.dataset.realBound) return;
    send.dataset.realBound = '1';
    send.onclick = async () => {
      const id = activeConversationId;
      const text = input?.value?.trim();
      if (!id || !text) return;
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

  async function openRealChat(id, name) {
    const chat = $('chat');
    const body = chat?.querySelector('.chatBody');
    if (!chat || !body || !api()?.messages) return;
    activeConversationId = id;
    chat.classList.add('show');
    const title = chat.querySelector('.chatHead b');
    if (title) title.textContent = name;
    body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Mesajlar yükleniyor…</div>';
    try {
      const payload = await api().messages(id);
      const messages = asList(payload, ['messages', 'items', 'data']);
      body.innerHTML = '';
      if (!messages.length) body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Henüz mesaj yok.</div>';
      messages.forEach(m => {
        const row = document.createElement('div');
        row.className = 'bubble' + (m.is_mine ? ' me' : '');
        row.textContent = esc(m.text ?? m.message ?? '');
        body.appendChild(row);
      });
      body.scrollTop = body.scrollHeight;
      bindSender(chat, body);
    } catch (e) {
      console.warn('[ErisChat] messages unavailable', e);
      body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Konuşma yüklenemedi.</div>';
      bindSender(chat, body);
    }
  }

  window.ErisChatDM = { load: loadConversations, open: openRealChat };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadConversations, { once: true });
  else loadConversations();
})();
