(() => {
  const API = () => (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');
  const TOKEN_KEY = 'erischat_access_token';
  const getToken = () => localStorage.getItem(TOKEN_KEY) || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const setToken = token => { if (token) localStorage.setItem(TOKEN_KEY, token); };
  const clearToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('erischat.accessToken.v1'); localStorage.removeItem('token'); };

  // Remember identity labels only. A logged-out session token is never retained.
  let authGeneration=0;
  const ACCOUNTS_KEY = 'erischat.rememberedAccounts.v1';
  const normalizeAccount = row => ({
    id:String(row?.id || '').slice(0,128),
    nickname:String(row?.nickname || 'Kullanıcı').slice(0,64),
    public_id:String(row?.public_id || '').slice(0,32),
    email:String(row?.email || '').trim().toLowerCase().slice(0,320),
    provider:row?.provider === 'google' ? 'google' : 'email',
    lastUsed:Number(row?.lastUsed) || 0
  });
  function rememberedAccounts() {
    try {
      const rows=JSON.parse(localStorage.getItem(ACCOUNTS_KEY)||'[]');
      return Array.isArray(rows) ? rows.map(normalizeAccount).filter(row=>row.id).slice(0,20) : [];
    } catch (_) { return []; }
  }
  function writeAccounts(rows) {
    try { localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(rows)); }
    catch (_) { window.toast?.('Hesap listesi bu cihazda kaydedilemedi.'); }
  }
  function rememberAccount(user, hint={}) {
    if(!user?.id)return;
    const rows=rememberedAccounts(), previous=rows.find(row=>row.id===String(user.id))||{};
    const row=normalizeAccount({...previous,...user,
      email:hint.email || previous.email || '',
      provider:hint.provider || previous.provider || 'email',lastUsed:Date.now()});
    writeAccounts([row,...rows.filter(item=>item.id!==row.id)].slice(0,20));
  }
  function forgetAccount(id) {
    writeAccounts(rememberedAccounts().filter(row=>row.id!==String(id)));
    renderRememberedAccounts(document.getElementById('erisGoogleGate'));
  }
  function credentialEmail(credential) {
    try {
      const part=String(credential).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'='))).email || '';
    } catch (_) { return ''; }
  }
  function renderRememberedAccounts(gate) {
    if(!gate)return;
    const host=gate.querySelector('[data-remembered-accounts]');
    if(!host)return;
    host.replaceChildren();
    const rows=rememberedAccounts();host.hidden=!rows.length;
    if(!rows.length)return;
    const title=document.createElement('h2');title.textContent='Bu cihazdaki hesaplar';host.append(title);
    rows.forEach(account=>{
      const row=document.createElement('div');row.className='eris-account-row';
      const select=document.createElement('button');select.type='button';select.className='eris-account-select';
      const name=document.createElement('b');name.textContent=account.nickname;
      const detail=document.createElement('small');detail.textContent=account.email || ('ID: '+(account.public_id||account.id));
      select.append(name,detail);
      select.onclick=()=>{
        gate.querySelector('#authLoginMode').click();
        gate.querySelector('#authEmailInput').value=account.email;
        gate.querySelector('#erisGoogleStatus').textContent=account.nickname+' hesabına giriş yapmak için doğrulama yap.';
        if(account.provider==='google')googleRegister();
        else gate.querySelector('#authEmailInput').focus();
      };
      const remove=document.createElement('button');remove.type='button';remove.className='eris-account-remove';
      remove.textContent='×';remove.setAttribute('aria-label',account.nickname+' hesabını bu cihazdaki listeden kaldır');
      remove.onclick=()=>forgetAccount(account.id);row.append(select,remove);host.append(row);
    });
    const another=document.createElement('button');another.type='button';another.className='authBtn';another.textContent='Başka hesap ile giriş yap';
    another.onclick=()=>{gate.querySelector('#authLoginMode').click();gate.querySelector('#authEmailInput').value='';gate.querySelector('#authOtpInput').value='';gate.querySelector('#authEmailInput').focus()};
    host.append(another);
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = getToken();
    const publicPath = ['/auth/google-config', '/auth/google', '/auth/otp/request', '/auth/otp/verify'];
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
  const existingGate = document.getElementById('erisGoogleGate');
  if (existingGate) return existingGate;

  const style = document.createElement('style');
  style.id = 'erisGoogleGateStyle';
  style.textContent = `
    #erisGoogleGate{position:fixed;inset:0;z-index:100000;background:rgba(4,3,8,.97);display:grid;place-items:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(12px)}
    .erisGoogleCard{max-height:90dvh;overflow:auto;width:min(430px,100%);box-sizing:border-box;background:linear-gradient(155deg,#15111d,#0d0b12);border:1px solid #ffffff1c;border-radius:24px;padding:24px;box-shadow:0 25px 90px #000b;text-align:left;color:#fff}
    .erisGoogleCard h1{margin:0 0 7px;font-size:26px;letter-spacing:-.5px}
    .erisGoogleCard p{color:#aaa1b1;font-size:13px;line-height:1.55;margin:0 0 20px}
    .authMethods{display:grid;gap:12px}
    [data-remembered-accounts]{margin:0 0 18px}
    [data-remembered-accounts][hidden]{display:none}
    [data-remembered-accounts] h2{font-size:15px;margin:0 0 9px}
    .eris-account-row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
    .eris-account-select{flex:1;min-width:0;text-align:left;border:1px solid #ffffff20;border-radius:13px;background:#21192e;color:#fff;padding:12px;cursor:pointer}
    .eris-account-select b,.eris-account-select small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .eris-account-select small{margin-top:5px;color:#b5aabd;font-size:11px}
    .eris-account-remove{flex:0 0 38px;width:38px;height:38px;border:0;border-radius:12px;background:#ffffff0a;color:#c7bbd4;font-size:24px;cursor:pointer}
    .authBtn{width:100%;min-height:48px;border:1px solid #ffffff20;border-radius:13px;color:#fff;background:#17131f;font-weight:700;font-size:14px;cursor:pointer;transition:background .15s,border-color .15s}
    .authBtn:hover{background:#211b2b;border-color:#ffffff35}.authBtn:disabled{opacity:.58;cursor:wait}
    .authGoogle{background:#fff;color:#111;border-color:#fff}.authGoogle:hover{background:#f0edf3;color:#111}
    .authEmail{display:grid;gap:9px;margin-top:0}
    .authEmail label{font-size:12px;color:#c4baca;font-weight:600}
    .authEmail input{width:100%;box-sizing:border-box;background:#09070d;border:1px solid #ffffff20;color:#fff;border-radius:12px;padding:13px;margin-top:6px;outline:none;font:inherit;font-size:14px}
    .authEmail input:focus{border-color:#9b76ff;box-shadow:0 0 0 3px #8a5cff22}
    .authModes{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:1px 0 3px}
    .authMode{min-height:39px;border:1px solid #ffffff16;border-radius:11px;background:#ffffff06;color:#aaa1b1;font-size:13px;font-weight:600}
    .authMode[aria-pressed=true]{background:#754cff25;border-color:#9b76ff;color:#fff}
    .authDivider{display:flex;align-items:center;gap:10px;color:#827988;font-size:11px;margin:1px 0}.authDivider:before,.authDivider:after{content:"";height:1px;background:#ffffff18;flex:1}
    .authStatus{font-size:12px;color:#ff9bc2;min-height:20px;margin-top:13px;line-height:1.45}
    .authOtp{display:none;gap:8px;margin-top:2px}
    .authOtp input{flex:1;min-width:0;margin:0}
    .authOtp button{min-width:100px;border:0;border-radius:12px;padding:0 14px;background:#754cff;color:#fff;font-weight:700}
    .realOnly{font-size:11px;color:#81798a;margin-top:16px;padding-top:13px;border-top:1px solid #ffffff12}
    @media(max-width:520px){.erisGoogleCard{padding:21px;border-radius:21px}}
  `;
  document.head.appendChild(style);

  const gate = document.createElement('div');
  gate.id = 'erisGoogleGate';
  gate.innerHTML = `
    <div class="erisGoogleCard">
      <div style="font-size:11px;letter-spacing:1.3px;color:#b39bff;font-weight:700;margin-bottom:9px">ERISCHAT • HESAP</div>
      <h1>Hoş geldin</h1>
      <p>Hesabına giriş yap veya yeni hesabını oluştur.</p>

      <section data-remembered-accounts hidden aria-label="Hatırlanan hesaplar"></section>
      <div class="authMethods">
        <div id="erisGoogleButton"></div>
        <button type="button" id="authGoogleBtn" class="authBtn authGoogle" hidden>Google ile devam et</button>

        <div class="authEmail">
          <div class="authDivider">veya e-posta ile</div>
          <div class="authModes" role="group" aria-label="E-posta işlemi">
            <button type="button" class="authMode" id="authLoginMode" aria-pressed="true">Giriş yap</button>
            <button type="button" class="authMode" id="authRegisterMode" aria-pressed="false">Hesap oluştur</button>
          </div>
          <label for="authEmailInput">E-posta adresi</label>
          <input id="authEmailInput" type="email" autocomplete="email" required placeholder="ornek@eposta.com">
          <button type="button" id="authEmailBtn" class="authBtn">Email kodu gönder</button>
          <div class="authOtp" id="authOtpBox">
            <input id="authOtpInput" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6 haneli kod" aria-label="E-posta doğrulama kodu">
            <button type="button" id="authOtpBtn">Doğrula</button>
          </div>
        </div>
      </div>

      <div id="erisGoogleStatus" class="authStatus" role="status" aria-live="polite"></div>
      <div class="realOnly">Doğrulama kodu yalnızca bu e-posta adresine gönderilir.</div>
    </div>
  `;

  document.body.appendChild(gate);

  const status = gate.querySelector('#erisGoogleStatus');
  let emailPurpose = 'login';
  let emailCodeRequested = false;
  const setEmailPurpose = purpose => {
    emailPurpose = purpose;
    gate.querySelector('#authLoginMode').setAttribute('aria-pressed',String(purpose==='login'));
    gate.querySelector('#authRegisterMode').setAttribute('aria-pressed',String(purpose==='register'));
    if(emailCodeRequested){emailCodeRequested=false;gate.querySelector('#authOtpBox').style.display='none';gate.querySelector('#authOtpInput').value='';gate.querySelector('#authEmailBtn').disabled=false;gate.querySelector('#authEmailBtn').textContent='Email kodu gönder';}
    status.textContent = purpose==='login' ? 'Mevcut hesabınla giriş yap.' : 'Yeni hesap için e-posta doğrulaması gönder.';
  };
  gate.querySelector('#authLoginMode').onclick=()=>setEmailPurpose('login');
  gate.querySelector('#authRegisterMode').onclick=()=>setEmailPurpose('register');

  gate.querySelector('#authGoogleBtn').onclick = () => googleRegister();

  gate.querySelector('#authEmailBtn').onclick = async () => {
    const input=gate.querySelector('#authEmailInput'),button=gate.querySelector('#authEmailBtn'),email=input.value.trim();
    if(!input.checkValidity()){input.reportValidity();return;}
    const purpose=emailPurpose,modeButtons=[gate.querySelector('#authLoginMode'),gate.querySelector('#authRegisterMode')];
    button.disabled=true;
    modeButtons.forEach(mode=>mode.disabled=true);

    try {
      status.textContent = 'Doğrulama kodu gönderiliyor…';
      await emailOtpLogin(email, null, purpose);
      emailCodeRequested=true;
      gate.querySelector('#authOtpBox').style.display = 'flex';
      gate.querySelector('#authOtpInput').focus();
      button.textContent='Kod yeniden gönder';
      status.textContent = 'Kod e-posta adresine gönderildi. Gelen kutunu ve spam klasörünü kontrol et.';
    } catch (e) {
      status.textContent = /cooldown/i.test(e.message||'') ? 'Yeni kod istemeden önce bir dakika bekle.' : (e.message || 'Kod gönderilemedi.');
    } finally {button.disabled=false;modeButtons.forEach(mode=>mode.disabled=false);}
  };

  gate.querySelector('#authOtpBtn').onclick = async () => {
    const email = gate.querySelector('#authEmailInput').value.trim();
    const codeInput=gate.querySelector('#authOtpInput'),code=codeInput.value.trim(),button=gate.querySelector('#authOtpBtn');
    if(!/^\d{6}$/.test(code)){status.textContent='E-postadaki 6 haneli kodu gir.';codeInput.focus();return;}
    button.disabled=true;

    try {
      status.textContent = 'Kod doğrulanıyor…';
      await emailOtpLogin(email, code, emailPurpose);
      closeGate();
    } catch (e) {
      status.textContent = e.message || 'Kod doğrulanamadı.';
    } finally {button.disabled=false;}
  };
  gate.querySelector('#authOtpInput').addEventListener('input',event=>{event.target.value=event.target.value.replace(/\D/g,'').slice(0,6)});
  gate.querySelector('#authEmailInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();gate.querySelector('#authEmailBtn').click()}});
  gate.querySelector('#authOtpInput').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();gate.querySelector('#authOtpBtn').click()}});

  renderRememberedAccounts(gate);
  if(rememberedAccounts().length)gate.querySelector('#authGoogleBtn').hidden=false;
  return gate;
}

function closeGate() { document.getElementById('erisGoogleGate')?.remove(); document.getElementById('erisGoogleGateStyle')?.remove(); }

  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      let settled=false;
      const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else if(window.google?.accounts?.id)resolve();else reject(new Error('Google giriş kütüphanesi yüklenemedi.'))};
      const timer=setTimeout(()=>finish(new Error('Google giriş servisi zaman aşımına uğradı.')),12000);
      if(!script){script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;document.head.appendChild(script);}
      script.addEventListener('load',()=>finish(),{once:true});
      script.addEventListener('error',()=>finish(new Error('Google giriş servisine ulaşılamadı.')),{once:true});
    });
  }

  let googlePending=false;
  let initializedGoogleClientId='';
  async function googleRegister() {
    if(googlePending)return;
    googlePending=true;
    const gate = document.getElementById('erisGoogleGate') || addGate();
    const status = gate.querySelector('#erisGoogleStatus');
    const box = gate.querySelector('#erisGoogleButton');
    const googleBtn = gate.querySelector('#authGoogleBtn');

    try {
      // Android APK: Google girişini WebView içinde açma.
      // Native Android köprüsü hesap seçiciyi açacak.
      if (window.ErisChatAndroid?.googleSignIn) {
        status.textContent = 'Google hesabı açılıyor…';
        box.replaceChildren();
        googleBtn.hidden = true;

        const generation=authGeneration;
        const cleanupNative=()=>{
          window.removeEventListener('erischat:native-google-token',tokenHandler);
          window.removeEventListener('erischat:native-google-error',errorHandler);
        };
        const tokenHandler = async event => {
          cleanupNative();
          if(generation!==authGeneration)return;
          const credential = event?.detail?.credential;
          if (!credential) {
            status.textContent = 'Google doğrulama bilgisi alınamadı.';
            return;
          }

          status.textContent = 'Google hesabı doğrulanıyor…';

          try {
            const session = await request('/auth/google', {
              method: 'POST',
              body: JSON.stringify({credential})
            });

            if(generation!==authGeneration)return;
            setToken(session.access_token);
            window.ErisAuth.user = session.user;
            rememberAccount(session.user,{provider:'google',email:credentialEmail(credential)});
            emit('erischat:auth', {
              state:'ready',
              user:session.user,
              real:true
            });

            continueAfterAuth(session.user);
            setTimeout(closeGate,250);
            connectGeneralWs();

          } catch (e) {
            status.textContent =
              e.message || 'Google girişi tamamlanamadı.';
          }
        };

        const errorHandler = event => {
          cleanupNative();
          if(generation!==authGeneration)return;
          status.textContent =
            event?.detail?.message || 'Google giriş penceresi açılamadı.';
          googleBtn.hidden = false;
          googleBtn.textContent = 'Google ile tekrar dene';
          googleBtn.onclick = () => googleRegister();
        };

        window.addEventListener(
          'erischat:native-google-token',
          tokenHandler,
          {once:true}
        );

        window.addEventListener(
          'erischat:native-google-error',
          errorHandler,
          {once:true}
        );

        window.ErisChatAndroid.googleSignIn();
        return;
      }

      const cfg = await request('/auth/google-config');

      if (!cfg.enabled || !cfg.client_id) {
        status.textContent = 'Google girişi yapılandırılmamış. E-posta ile giriş yapabilirsin.';
        box.replaceChildren();
        googleBtn.hidden=true;
        return;
      }

      await loadGsi();
      const googleId=window.google?.accounts?.id;
      if(!googleId)throw new Error('Google giriş arayüzü hazır değil.');
      if(initializedGoogleClientId!==cfg.client_id){
        googleId.initialize({
          client_id: cfg.client_id,
          callback: async response => {
            if(!response?.credential){status.textContent='Google doğrulama yanıtı alınamadı.';return;}
            const generation=authGeneration;
            status.textContent = 'Google hesabı doğrulanıyor…';
            try {
              const session = await request('/auth/google', {method:'POST',body:JSON.stringify({credential:response.credential})});
              if(generation!==authGeneration)return;
              setToken(session.access_token);
              window.ErisAuth.user = session.user;
              rememberAccount(session.user,{provider:'google',email:credentialEmail(response.credential)});
              emit('erischat:auth', {state:'ready',user:session.user,real:true});
              continueAfterAuth(session.user);
              setTimeout(closeGate,250);
              connectGeneralWs();
            } catch (e) {status.textContent = e.message || 'Google girişi tamamlanamadı.';}
          },
          auto_select: false,
          cancel_on_tap_outside: false
        });
        initializedGoogleClientId=cfg.client_id;
      }
      box.replaceChildren();
      googleId.renderButton(box, {
        theme:'filled_black',
        size:'large',
        shape:'pill',
        text:'continue_with',
        width:320
      });
      googleBtn.hidden=true;
      status.textContent='';
      setTimeout(()=>{
        if(!document.getElementById('erisGoogleGate')||box.querySelector('iframe'))return;
        googleBtn.hidden=false;googleBtn.textContent='Google ile giriş penceresini aç';
        googleBtn.onclick=()=>{
          status.textContent='Google giriş penceresi açılıyor…';
          try{googleId.prompt(notification=>{if(notification.isNotDisplayed?.())status.textContent='Google penceresi açılamadı. E-posta ile giriş yapabilir veya sayfayı yenileyebilirsin.';});}
          catch(error){status.textContent=error.message||'Google giriş penceresi açılamadı.';}
        };
      },1800);
    } catch (e) {
      status.textContent = e.message || 'Google giriş arayüzü yüklenemedi.';
      box.replaceChildren();googleBtn.hidden=false;googleBtn.textContent='Google ile tekrar dene';
      googleBtn.onclick=()=>googleRegister();
    } finally {googlePending=false;}
  }


async function emailOtpLogin(email, code = null, purpose = 'login') {
  const generation=authGeneration;
  email = String(email || '').trim().toLowerCase();
  if (!email) throw new Error('Email adresini gir.');

  if (!code) {
    return request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'email',
        identifier: email,
        purpose: purpose === 'register' ? 'register' : 'login'
      })
    });
  }

  const session = await request('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'email',
      identifier: email,
      purpose: purpose === 'register' ? 'register' : 'login',
      code: String(code).trim()
    })
  });

  if(generation!==authGeneration)throw new Error('Giriş işlemi iptal edildi.');
  setToken(session.access_token);
  window.ErisAuth.user = session.user;
  rememberAccount(session.user,{provider:'email',email});
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
    rememberAccount(session.user);
    return session.user;
  }

  async function ensureSession() {
    const generation=authGeneration;
    if (getToken()) {
      try {
        const user = await request('/me');
        if(generation!==authGeneration)return null;
        window.ErisAuth.user = user;
        rememberAccount(user);
        return user;
      } catch (error) {
        if(generation!==authGeneration)return null;
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
    socket = new WebSocket(`${base}/ws`, ['erischat', `token.${token}`]);
    socket.onopen = () => { retryMs=1000; emit('erischat:ws',{state:'open'}); socket.send(JSON.stringify({type:'ping'})); };
    socket.onmessage = event => { try { emit('erischat:event', JSON.parse(event.data)); } catch (_) {} };
    socket.onclose = () => { emit('erischat:ws',{state:'closed'}); if(!getToken())return; clearTimeout(retryTimer); retryTimer=setTimeout(connectGeneralWs,retryMs); retryMs=Math.min(retryMs*2,15000); };
    socket.onerror = () => emit('erischat:ws',{state:'error'});
  }

  let logoutPending=false;
  async function logout() {
    if(logoutPending)return;
    logoutPending=true;
    authGeneration++;
    const token=getToken();rememberAccount(window.ErisAuth.user);
    // Teardown begins while the old token is still available to room/call APIs.
    const gate=addGate();
    gate.querySelector('#erisGoogleStatus').textContent='Çıkış yapılıyor…';
    gate.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    const jobs=[];
    try { jobs.push(Promise.resolve(window.closeRealRoom?.({switching:true})).catch(()=>{})); } catch (_) {}
    try { jobs.push(Promise.resolve(window.ErisCalls?.closeForLogout?.()).catch(()=>{})); } catch (_) {}
    try { window.ErisRoomRTC?.leaveRoom?.(); } catch (_) {}
    await Promise.race([Promise.allSettled(jobs),new Promise(resolve=>setTimeout(resolve,1500))]);
    clearToken();window.ErisAuth.user=null;
    clearTimeout(retryTimer);retryTimer=null;
    if(socket){socket.onclose=null;try{socket.close()}catch(_){}}socket=null;
    if(window.__erisRoomSocket){try{window.__erisRoomSocket.close(1000)}catch(_){}window.__erisRoomSocket=null;}
    window.ErisChatDMVaultToken=null;
    sessionStorage.clear();
    localStorage.removeItem('eris_last_room');
    emit('erischat:auth',{state:'logged_out'});
    if(token){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),4000);
      jobs.push(request('/logout',{method:'POST',headers:{Authorization:'Bearer '+token},signal:controller.signal})
        .catch(()=>{}).finally(()=>clearTimeout(timer)));
    }
    await Promise.race([Promise.allSettled(jobs),new Promise(resolve=>setTimeout(resolve,4500))]);
    location.reload();
  }

  window.ErisAuth = { ensureSession, registerAnonymous, googleRegister, emailOtpLogin, logout, rememberedAccounts, forgetAccount, getToken, connectGeneralWs, getMe:()=>request('/me'), updateMe:payload=>request('/me',{method:'PATCH',body:JSON.stringify(payload)}) };

  function continueAfterAuth(user) {
    const generation=authGeneration;
    window.ErisAuth = window.ErisAuth || {};
    window.ErisAuth.user = user;
    let attempts = 0;

    const run = () => {
      if(generation!==authGeneration || logoutPending)return;
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
        if(!rememberedAccounts().length)googleRegister().catch(error=>{
          const status=document.getElementById('erisGoogleStatus');
          if(status)status.textContent=error.message||'Google girişi hazırlanamadı.';
        });
      }
    } catch (error) {
      console.warn('[ErisChat] auth unavailable', error);
      addGate().querySelector('#erisGoogleStatus').textContent = error.message || 'Giriş sistemi kullanılamıyor.';
      emit('erischat:auth',{state:'error',error:error.message});
    }
  }, {once:true});
})();
