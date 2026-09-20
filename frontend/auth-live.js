(() => {
  const API = () => (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
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

  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail })); }

  function addGate() {
    if (document.getElementById('erisGoogleGate')) return;
    const style = document.createElement('style');
    style.id = 'erisGoogleGateStyle';
    style.textContent = '#erisGoogleGate{position:fixed;inset:0;z-index:100000;background:rgba(4,3,8,.96);display:grid;place-items:center;padding:22px}.erisGoogleCard{width:min(430px,100%);background:#0f0c16;border:1px solid #ffffff18;border-radius:26px;padding:28px;box-shadow:0 25px 90px #000b;text-align:center}.erisGoogleCard h1{margin:0 0 8px;font-size:28px}.erisGoogleCard p{color:#aaa1b1;font-size:12px;line-height:1.6}.erisGoogleLogo{font-size:42px;margin-bottom:10px}.erisGoogleButton{min-height:44px;display:flex;justify-content:center;margin:18px 0}.erisGoogleStatus{font-size:10px;color:#ff8ebd;min-height:18px}.erisGoogleId{font-size:9px;color:#756d80;margin-top:16px;word-break:break-all}.erisGoogleCard .realOnly{font-size:9px;color:#7f7687;margin-top:12px}';
    document.head.appendChild(style);
    const gate = document.createElement('div');
    gate.id = 'erisGoogleGate';
    gate.innerHTML = '<div class="erisGoogleCard"><div class="erisGoogleLogo">◉</div><h1>ErisChat</h1><p>Gerçek kullanıcı hesabı oluşturmak için Google hesabınla giriş yap.</p><div id="erisGoogleButton" class="erisGoogleButton"></div><div id="erisGoogleStatus" class="erisGoogleStatus"></div><div id="erisGoogleId" class="erisGoogleId"></div><div class="realOnly">Gerçek kayıt • gerçek veritabanı • gerçek yetki sistemi</div></div>';
    document.body.appendChild(gate);
    return gate;
  }

  function closeGate() { document.getElementById('erisGoogleGate')?.remove(); document.getElementById('erisGoogleGateStyle')?.remove(); }

  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) { existing.addEventListener('load', resolve, {once:true}); existing.addEventListener('error', reject, {once:true}); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true; script.defer = true;
      script.onload = resolve; script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function googleRegister() {
    const gate = addGate();
    const status = gate.querySelector('#erisGoogleStatus');
    const idBox = gate.querySelector('#erisGoogleId');
    try {
      const cfg = await request('/auth/google-config');
      if (!cfg.enabled || !cfg.client_id) {
        status.textContent = 'Google kayıt sistemi henüz etkinleştirilmemiş. Railway GOOGLE_CLIENT_ID bekleniyor.';
        return;
      }
      await loadGsi();
      window.google.accounts.id.initialize({
        client_id: cfg.client_id,
        callback: async response => {
          status.textContent = 'Google hesabı doğrulanıyor…';
          try {
            const session = await request('/auth/google', { method:'POST', body:JSON.stringify({credential:response.credential}) });
            setToken(session.access_token);
            window.ErisAuth.user = session.user;
            idBox.textContent = 'Kullanıcı ID: ' + session.user.public_id;
            emit('erischat:auth', { state:'ready', user:session.user, real:true });
            setTimeout(closeGate, 250);
            connectGeneralWs();
          } catch (e) {
            status.textContent = e.message || 'Google kaydı başarısız.';
          }
        },
        auto_select: false,
        cancel_on_tap_outside: false,
      });
      window.google.accounts.id.renderButton(gate.querySelector('#erisGoogleButton'), {
        theme:'filled_black', size:'large', shape:'pill', text:'continue_with', width:320
      });
    } catch (e) {
      status.textContent = e.message || 'Google giriş arayüzü yüklenemedi.';
    }
  }

  async function registerAnonymous() {
    const suffix = Math.random().toString(36).slice(2, 7);
    const session = await request('/users', { method:'POST', body:JSON.stringify({ nickname:`Anonim_${suffix}`, gender:'male', avatar:'👤' }) });
    setToken(session.access_token);
    window.ErisAuth.user = session.user;
    return session.user;
  }

  async function ensureSession() {
    if (getToken()) {
      try {
        const user = await request('/me');
        window.ErisAuth.user = user;
        return user;
      } catch (error) {
        if (!String(error.message).includes('401')) throw error;
        clearToken();
      }
    }
    return null;
  }

  let socket = null, retryTimer = null, retryMs = 1000;
  function connectGeneralWs() {
    const token = getToken();
    if (!token || (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))) return;
    const base = API().replace(/^http/, 'ws').replace(/\/v1$/, '');
    socket = new WebSocket(`${base}/ws?token=${encodeURIComponent(token)}`);
    socket.onopen = () => { retryMs=1000; emit('erischat:ws',{state:'open'}); socket.send(JSON.stringify({type:'ping'})); };
    socket.onmessage = event => { try { emit('erischat:event', JSON.parse(event.data)); } catch (_) {} };
    socket.onclose = () => { emit('erischat:ws',{state:'closed'}); if(!getToken())return; clearTimeout(retryTimer); retryTimer=setTimeout(connectGeneralWs,retryMs); retryMs=Math.min(retryMs*2,15000); };
    socket.onerror = () => emit('erischat:ws',{state:'error'});
  }

  async function logout() {
    const token=getToken();
    try { if(token) await request('/logout',{method:'POST'}); } catch (_) {}
    clearToken(); if(socket){try{socket.close()}catch(_){}} socket=null;
    emit('erischat:auth',{state:'logged_out'});
    location.reload();
  }

  window.ErisAuth = { ensureSession, registerAnonymous, googleRegister, logout, getToken, connectGeneralWs, getMe:()=>request('/me'), updateMe:payload=>request('/me',{method:'PATCH',body:JSON.stringify(payload)}) };

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const user = await ensureSession();
      if (user) {
        emit('erischat:auth',{state:'ready',user,real:!!user.google_email});
        connectGeneralWs();
      } else {
        await googleRegister();
        emit('erischat:auth',{state:'login_required'});
      }
    } catch (error) {
      console.warn('[ErisChat] auth unavailable', error);
      addGate().querySelector('#erisGoogleStatus').textContent = error.message || 'Giriş sistemi kullanılamıyor.';
      emit('erischat:auth',{state:'error',error:error.message});
    }
  }, {once:true});
})();
