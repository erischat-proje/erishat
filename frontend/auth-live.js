(() => {
  const API = () => window.ERIS_API || 'https://erischat-production.up.railway.app/v1';
  const TOKEN_KEY = 'erischat_access_token';
  const getToken = () => localStorage.getItem(TOKEN_KEY) || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const setToken = token => { if (token) localStorage.setItem(TOKEN_KEY, token); };
  const clearToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('erischat.accessToken.v1'); localStorage.removeItem('token'); };

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${API()}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  async function registerAnonymous() {
    const suffix = Math.random().toString(36).slice(2, 7);
    const payload = { nickname: `Anonim_${suffix}`, gender: 'male', avatar: '👤' };
    const session = await request('/users', { method: 'POST', body: JSON.stringify(payload) });
    setToken(session.access_token);
    return session.user;
  }

  async function ensureSession() {
    if (getToken()) {
      try { return await request('/me'); }
      catch (error) {
        if (!String(error.message).includes('401')) throw error;
        clearToken();
      }
    }
    return registerAnonymous();
  }

  let socket = null;
  let retryTimer = null;
  let retryMs = 1000;

  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail })); }

  function connectGeneralWs() {
    const token = getToken();
    if (!token) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    const base = API().replace(/^http/, 'ws').replace(/\/v1$/, '');
    socket = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}`);
    socket.onopen = () => { retryMs = 1000; emit('erischat:ws', { state: 'open' }); socket.send(JSON.stringify({ type: 'ping' })); };
    socket.onmessage = event => { try { emit('erischat:event', JSON.parse(event.data)); } catch (_) {} };
    socket.onclose = event => {
      emit('erischat:ws', { state: 'closed', code: event.code });
      if (!getToken()) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connectGeneralWs, retryMs);
      retryMs = Math.min(retryMs * 2, 15000);
    };
    socket.onerror = () => emit('erischat:ws', { state: 'error' });
  }

  async function logout() {
    const token = getToken();
    try { if (token) await request('/logout', { method: 'POST' }); } catch (_) {}
    clearToken();
    if (socket) { try { socket.close(); } catch (_) {} }
    socket = null;
    emit('erischat:auth', { state: 'logged_out' });
  }

  window.ErisAuth = { ensureSession, registerAnonymous, logout, getToken, connectGeneralWs, getMe: () => request('/me'), updateMe: payload => request('/me', { method: 'PATCH', body: JSON.stringify(payload) }) };

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const user = await ensureSession();
      window.ErisAuth.user = user;
      emit('erischat:auth', { state: 'ready', user });
      connectGeneralWs();
    } catch (error) {
      console.warn('[ErisChat] anonymous session unavailable', error);
      emit('erischat:auth', { state: 'error', error: error.message });
    }
  }, { once: true });
})();
