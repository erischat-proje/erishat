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
    const publicPath = ['/auth/google-config', '/auth/google'];
    if (token && !publicPath.includes(path)) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`${API()}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.detail || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail })); }

  function addGate() {
  if (document.getElementById('erisGoogleGate')) return;

  const style = document.createElement('style');
  style.id = 'erisGoogleGateStyle';
  style.textContent = `
    #erisGoogleGate{position:fixed;inset:0;z-index:100000;background:rgba(4,3,8,.97);display:grid;place-items:center;padding:22px}
    .erisGoogleCard{width:min(430px,100%);background:#0f0c16;border:1px solid #ffffff18;border-radius:26px;padding:24px;box-shadow:0 25px 90px #000b;text-align:center}
    .erisGoogleCard h1{margin:0 0 7px;font-size:28px}
    .erisGoogleCard p{color:#aaa1b1;font-size:12px;line-height:1.6;margin:0 0 18px}
    .authMethods{display:grid;gap:9px}
    .authBtn{width:100%;min-height:46px;border:1px solid #ffffff18;border-radius:14px;color:#fff;background:#17131f;font-weight:800;cursor:pointer}
    .authBtn:hover{background:#211b2b}
    .authGoogle{background:#fff;color:#111}
    .authEmail{display:grid;gap:8px;margin-top:2px}
    .authEmail input{width:100%;box-sizing:border-box;background:#09070d;border:1px solid #ffffff18;color:#fff;border-radius:12px;padding:13px;outline:none}
    .authStatus{font-size:10px;color:#ff8ebd;min-height:18px;margin-top:12px}
    .authOtp{display:none;gap:8px;margin-top:8px}
    .authOtp input{flex:1;min-width:0;background:#09070d;border:1px solid #ffffff18;color:#fff;border-radius:12px;padding:13px;outline:none}
    .authOtp button{border:0;border-radius:12px;padding:0 14px;background:linear-gradient(135deg,#7b4cff,#ff4fa3);color:#fff;font-weight:800}
    .realOnly{font-size:9px;color:#7f7687;margin-top:14px}
  `;
  document.head.appendChild(style);

  const gate = document.createElement('div');
  gate.id = 'erisGoogleGate';
  gate.innerHTML = `
    <div class="erisGoogleCard">
      <div style="font-size:40px;margin-bottom:8px">◉</div>
      <h1>ErisChat</h1>
      <p>Hesabına giriş yap veya yeni hesabını oluştur.</p>

      <div class="authMethods">
        <div id="erisGoogleButton"></div>
        <div id="erisGoogleId"></div>
        <button type="button" id="authGoogleBtn" class="authBtn authGoogle">Google ile devam et</button>

        <div class="authEmail">
          <input id="authEmailInput" type="email" autocomplete="email" placeholder="Email adresin">
          <button type="button" id="authEmailBtn" class="authBtn">Email kodu gönder</button>
          <div class="authOtp" id="authOtpBox">
            <input id="authOtpInput" inputmode="numeric" maxlength="6" placeholder="6 haneli kod">
            <button type="button" id="authOtpBtn">Doğrula</button>
          </div>
        </div>
      </div>

      <div id="erisGoogleStatus" class="authStatus"></div>
      <div class="realOnly">Tek hesap • gerçek kullanıcı • ortak onboarding</div>
    </div>
  `;

  document.body.appendChild(gate);

  const status = gate.querySelector('#erisGoogleStatus');

  gate.querySelector('#erisGoogleButton').onclick = () => {
    googleRegister().catch(e => {
      status.textContent = e.message || 'Google giriş başlatılamadı.';
    });
  };

  gate.querySelector('#authAppleBtn').onclick = () => {
    status.textContent = 'Apple girişini başlatmak için Apple yapılandırması gerekiyor.';
  };

  gate.querySelector('#authFacebookBtn').onclick = () => {
    status.textContent = 'Facebook girişini başlatmak için Facebook yapılandırması gerekiyor.';
  };

  gate.querySelector('#authEmailBtn').onclick = async () => {
    const email = gate.querySelector('#authEmailInput').value.trim();

    try {
      status.textContent = 'Doğrulama kodu gönderiliyor…';
      await emailOtpLogin(email);
      gate.querySelector('#authOtpBox').style.display = 'flex';
      status.textContent = 'Kod email adresine gönderildi.';
    } catch (e) {
      status.textContent = e.message || 'Kod gönderilemedi.';
    }
  };

  gate.querySelector('#authOtpBtn').onclick = async () => {
    const email = gate.querySelector('#authEmailInput').value.trim();
    const code = gate.querySelector('#authOtpInput').value.trim();

    try {
      status.textContent = 'Kod doğrulanıyor…';
      await emailOtpLogin(email, code);
      closeGate();
    } catch (e) {
      status.textContent = e.message || 'Kod doğrulanamadı.';
    }
  };

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
    const gate = document.getElementById('erisGoogleGate') || addGate();
    const status = gate.querySelector('#erisGoogleStatus');
    const box = gate.querySelector('#erisGoogleButton');

    try {
      const cfg = await request('/auth/google-config');

      if (!cfg.enabled || !cfg.client_id) {
        status.textContent = 'Google kayıt sistemi henüz etkinleştirilmemiş.';
        box.type = 'button'; box.className = 'authBtn authGoogle'; box.textContent = 'Google ile giriş yap';
        return;
      }

      await loadGsi();

      window.google.accounts.id.initialize({
        client_id: cfg.client_id,
        callback: async response => {
          status.textContent = 'Google hesabı doğrulanıyor…';

          try {
            const session = await request('/auth/google', {
              method: 'POST',
              body: JSON.stringify({ credential: response.credential })
            });

            setToken(session.access_token);
            window.ErisAuth.user = session.user;
            

            emit('erischat:auth', { state:'ready', user:session.user, real:true });
            continueAfterAuth(session.user);
            setTimeout(closeGate, 250);
            connectGeneralWs();
          } catch (e) {
            status.textContent = e.message || 'Google kaydı başarısız.';
          }
        },
        auto_select: false,
        cancel_on_tap_outside: false
      });

      box.innerHTML = '';

      window.google.accounts.id.renderButton(box, {
        theme:'filled_black',
        size:'large',
        shape:'pill',
        text:'continue_with',
        width:320
      });

      setTimeout(() => {
        if (!box.querySelector('iframe')) {
          box.type = 'button'; box.className = 'authBtn authGoogle'; box.textContent = 'Google ile giriş yap';
          box.querySelector('button').onclick = () => {
            status.textContent = 'Google giriş servisi başlatılıyor…';
            try {
              window.google.accounts.id.prompt();
            } catch (e) {
              status.textContent = 'Google giriş servisi başlatılamadı.';
            }
          };
        }
      }, 1500);

    } catch (e) {
      status.textContent = e.message || 'Google giriş arayüzü yüklenemedi.';
      box.type = 'button'; box.className = 'authBtn authGoogle'; box.textContent = 'Google ile giriş yap';
      box.querySelector('button').onclick = () => {
        status.textContent = 'Google giriş servisi yüklenemedi. Sayfayı yenileyip tekrar dene.';
      };
    }
  }


async function emailOtpLogin(email, code = null) {
  email = String(email || '').trim().toLowerCase();
  if (!email) throw new Error('Email adresini gir.');

  if (!code) {
    return request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'email',
        identifier: email,
        purpose: 'login'
      })
    });
  }

  const session = await request('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'email',
      identifier: email,
      purpose: 'login',
      code: String(code).trim()
    })
  });

  setToken(session.access_token);
  window.ErisAuth.user = session.user;
  emit('erischat:auth', {state:'ready', user:session.user, real:true});
  continueAfterAuth(session.user);
  connectGeneralWs();
  return session.user;
}

async function appleLogin(authorizationCode) {
  const session = await request('/auth/apple', {
    method: 'POST',
    body: JSON.stringify({
      authorization_code: authorizationCode
    })
  });

  setToken(session.access_token);
  window.ErisAuth.user = session.user;
  emit('erischat:auth', {state:'ready', user:session.user, real:true});
  continueAfterAuth(session.user);
  connectGeneralWs();
  return session.user;
}

async function facebookLogin(accessToken) {
  const session = await request('/auth/facebook', {
    method: 'POST',
    body: JSON.stringify({
      access_token: accessToken
    })
  });

  setToken(session.access_token);
  window.ErisAuth.user = session.user;
  emit('erischat:auth', {state:'ready', user:session.user, real:true});
  continueAfterAuth(session.user);
  connectGeneralWs();
  return session.user;
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
        if (error?.status !== 401) throw error;
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

  window.ErisAuth = { ensureSession, registerAnonymous, googleRegister, emailOtpLogin, appleLogin, facebookLogin, logout, getToken, connectGeneralWs, getMe:()=>request('/me'), updateMe:payload=>request('/me',{method:'PATCH',body:JSON.stringify(payload)}) };

  function continueAfterAuth(user) {
    window.ErisAuth = window.ErisAuth || {};
    window.ErisAuth.user = user;
    let attempts = 0;

    const run = () => {
      attempts++;
      const current = window.ErisAuth?.user || user;
      if (!current) return;

      if (!current.profile_completed) {
        if (window.ErisOnboarding?.show) {
          window.ErisOnboarding.show(current);
          return;
        }
      } else if (!current.welcome_gift_claimed) {
        if (window.ErisWelcome?.show) {
          window.ErisWelcome.show(current);
          return;
        }
      }

      if (attempts < 50) setTimeout(run, 100);
    };

    setTimeout(run, 0);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const user = await ensureSession();
      if (user) {
        emit('erischat:auth',{state:'ready',user,real:!!user.google_email});
        continueAfterAuth(user);
        connectGeneralWs();
      } else {
        addGate();
        emit('erischat:auth',{state:'login_required'});
      }
    } catch (error) {
      console.warn('[ErisChat] auth unavailable', error);
      addGate().querySelector('#erisGoogleStatus').textContent = error.message || 'Giriş sistemi kullanılamıyor.';
      emit('erischat:auth',{state:'error',error:error.message});
    }
  }, {once:true});
})();
