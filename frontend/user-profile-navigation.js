(() => {
  'use strict';

  const apiBase = () => String(window.ERISCHAT_API_BASE || localStorage.getItem('erischat.apiBase') || '').replace(/\/$/, '');
  const token = () => localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('erischat_access_token') || '';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const request = async (path) => {
    const headers = {};
    const t = token(); if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(apiBase() + path, {headers});
    let b = null; try { b = await r.json(); } catch {}
    if (!r.ok) throw new Error(b?.detail || 'Kullanıcı profili alınamadı.');
    return b;
  };

  function installCss() {
    if (document.getElementById('eris-profile-navigation-css')) return;
    const s = document.createElement('style');
    s.id = 'eris-profile-navigation-css';
    s.textContent = [
      '#erisUserProfileModal{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;padding:18px;background:rgba(2,1,7,.76);backdrop-filter:blur(14px)}',
      '#erisUserProfileModal .epn-box{width:min(390px,100%);background:#0b0811;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:20px;color:#fff;box-shadow:0 25px 90px #000c}',
      '#erisUserProfileModal .epn-close{float:right;border:0;background:rgba(255,255,255,.08);color:#fff;border-radius:10px;width:34px;height:34px;font-size:20px}',
      '#erisUserProfileModal .epn-head{display:flex;gap:13px;align-items:center;padding-top:4px}',
      '#erisUserProfileModal .epn-avatar{width:68px;height:68px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#824dff,#ff4da8);font-size:30px;overflow:hidden;background-size:cover;background-position:center}',
      '#erisUserProfileModal .epn-id{color:#918699;font-size:10px;margin-top:4px}',
      '#erisUserProfileModal .epn-actions{display:flex;gap:8px;margin-top:18px}',
      '#erisUserProfileModal .epn-actions button{flex:1;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:#fff;border-radius:12px;padding:11px;font-weight:800}',
      '.eris-profile-link{cursor:pointer!important}.eris-profile-link:active{transform:scale(.99)}'
    ].join('');
    document.head.appendChild(s);
  }

  async function openUserProfile(userId) {
    const id = String(userId || '').trim();
    if (!id) return;
    try {
      const user = await request('/v1/users/' + encodeURIComponent(id));
      document.getElementById('erisUserProfileModal')?.remove();
      const m = document.createElement('div');
      m.id = 'erisUserProfileModal';
      const avatar = esc(user.avatar || '👤');
      m.innerHTML = '<div class="epn-box"><button class="epn-close" aria-label="Kapat">×</button>' +
        '<div class="epn-head"><div class="epn-avatar">' + avatar + '</div><div><h2 style="margin:0 0 2px">' +
        esc(user.nickname || 'Kullanıcı') + '</h2><div class="epn-id">Kullanıcı ID: ' + esc(user.public_id || user.id) +
        '</div></div></div><div class="epn-actions"><button data-message>💬 Mesaj</button></div></div>';
      document.body.appendChild(m);
      m.querySelector('.epn-close').onclick = () => m.remove();
      m.onclick = e => { if (e.target === m) m.remove(); };
      m.querySelector('[data-message]').onclick = async () => {
        try {
          const c = await window.ErisChatAPI?.createConversation?.(user.id);
          m.remove();
          window.openView?.('messages');
          window.openChat?.(user.nickname || 'Kullanıcı', String(user.nickname || 'K').charAt(0).toUpperCase());
          await window.ErisChatAPI?.setConversation?.(c.id);
        } catch (e) {
          window.showToast?.(e.message || 'Konuşma açılamadı.');
        }
      };
    } catch (e) {
      window.showToast?.(e.message || 'Kullanıcı bulunamadı.');
    }
  }
  window.openUserProfile = openUserProfile;

  function markChatHeader(userId) {
    const id = String(userId || '');
    if (!id) return;
    const chat = document.querySelector('.chat.show, .chat');
    if (!chat) return;
    const head = chat.querySelector('.chathead');
    if (!head) return;
    const targets = [head.querySelector('.pic'), head.querySelector('h3')].filter(Boolean);
    targets.forEach(el => {
      el.dataset.userId = id;
      el.classList.add('eris-profile-link');
      el.setAttribute('role','button');
      el.setAttribute('tabindex','0');
      el.setAttribute('aria-label','Profili aç');
    });
  }

  async function resolveConversation(conversationId) {
    if (!conversationId) return;
    try {
      const c = await request('/v1/conversations/' + encodeURIComponent(conversationId));
      const me = localStorage.getItem('eris_user_id') || window.ErisCurrentUserId || '';
      const member = (c.members || []).find(x => String(x.user_id) !== String(me));
      if (member?.user_id) {
        window.__erisActiveDmUserId = member.user_id;
        markChatHeader(member.user_id);
      }
    } catch {}
  }

  function wrapConversationApi() {
    const api = window.ErisChatAPI;
    if (!api || typeof api.setConversation !== 'function' || api.setConversation.__erisProfileWrapped) return;
    const original = api.setConversation.bind(api);
    const wrapped = async function(conversationId, ...rest) {
      const result = await original(conversationId, ...rest);
      resolveConversation(conversationId);
      return result;
    };
    wrapped.__erisProfileWrapped = true;
    api.setConversation = wrapped;
  }

  document.addEventListener('click', e => {
    const target = e.target.closest?.('[data-user-id]');
    if (target?.dataset.userId) {
      e.preventDefault();
      e.stopPropagation();
      openUserProfile(target.dataset.userId);
      return;
    }
    const seat = e.target.closest?.('.eris-seat.occupied');
    if (seat?.dataset.userId) {
      e.preventDefault();
      e.stopPropagation();
      openUserProfile(seat.dataset.userId);
    }
  }, true);

  const observer = new MutationObserver(() => {
    wrapConversationApi();
    const id = window.__erisActiveDmUserId;
    if (id) markChatHeader(id);
  });

  function start() {
    installCss();
    wrapConversationApi();
    observer.observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();