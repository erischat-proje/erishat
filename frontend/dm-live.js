(() => {
  const api = () => window.ErisPlatform;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '');

  async function loadConversations() {
    const list = document.querySelector('#messages .list');
    if (!list || !api()?.conversations) return;
    try {
      const items = await api().conversations();
      list.innerHTML = '';
      if (!items.length) {
        list.innerHTML = '<div class="card" style="padding:16px;text-align:center;color:#938a9f;font-size:10px">Henüz konuşma yok.</div>';
        return;
      }
      items.forEach(c => {
        const other = c.participants?.find?.(p => p.id !== c.current_user_id) || c.participant || {};
        const id = c.id || c.conversation_id;
        const name = other.nickname || c.name || 'Anonim kullanıcı';
        const avatar = other.avatar || name.slice(0,1).toUpperCase();
        const b = document.createElement('button'); b.className = 'item';
        b.innerHTML = '<div class="ava round"></div><div class="grow"><b></b><small>Gerçek konuşma</small></div>';
        b.querySelector('.ava').textContent = avatar; b.querySelector('b').textContent = name;
        b.onclick = () => openRealChat(id, name, avatar);
        list.appendChild(b);
      });
    } catch (e) { console.warn('[ErisChat] conversations unavailable', e); }
  }

  async function openRealChat(id, name, avatar) {
    const chat = $('chat');
    const body = chat?.querySelector('.chatBody');
    if (!chat || !body) return;
    chat.classList.add('show');
    const title = chat.querySelector('.chatHead b'); if (title) title.textContent = name;
    body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Mesajlar yükleniyor…</div>';
    try {
      const messages = await api().messages(id);
      body.innerHTML = '';
      messages.forEach(m => {
        const row = document.createElement('div'); row.className = 'bubble' + (m.sender_id === m.user_id || m.is_mine ? ' me' : ''); row.textContent = esc(m.text); body.appendChild(row);
      });
      body.scrollTop = body.scrollHeight;
      const input = chat.querySelector('input'); const send = chat.querySelector('.primary');
      if (send && !send.dataset.realBound) {
        send.dataset.realBound = '1';
        send.onclick = async () => {
          const text = input?.value?.trim(); if (!text) return;
          try { const m = await api().sendMessage(id, text); const row=document.createElement('div'); row.className='bubble me'; row.textContent=m.text || text; body.appendChild(row); input.value=''; body.scrollTop=body.scrollHeight; }
          catch (e) { window.toast?.(e.message || 'Mesaj gönderilemedi.'); }
        };
      }
    } catch (e) { body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Konuşma yüklenemedi.</div>'; }
  }

  window.ErisChatDM = { load: loadConversations, open: openRealChat };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadConversations, {once:true}); else loadConversations();
})();
