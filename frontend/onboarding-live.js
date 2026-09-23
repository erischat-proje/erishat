(() => {
  const API = () => (
    window.ERIS_API ||
    window.ERISCHAT_API ||
    'https://erischat-api-production.up.railway.app/v1'
  ).replace(/\/$/, '');

  const token = () => localStorage.getItem('erischat_access_token') || '';

  async function request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;

    const response = await fetch(`${API()}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || data.message || `İşlem başarısız (${response.status})`);
    }

    return data;
  }

  function removeExisting() {
    document.getElementById('erisOnboarding')?.remove();
  }

  function createUI() {
    removeExisting();

    const root = document.createElement('div');
    root.id = 'erisOnboarding';

    root.innerHTML = `
      <style>
        #erisOnboarding {
          position: fixed;
          inset: 0;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background:
            radial-gradient(circle at top, rgba(120,90,255,.25), transparent 45%),
            rgba(5,7,18,.96);
          color: #fff;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #erisOnboarding .eris-onboard-card {
          width: min(460px, 100%);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 24px;
          padding: 28px;
          background: rgba(18,20,35,.97);
          box-shadow: 0 24px 80px rgba(0,0,0,.55);
          box-sizing: border-box;
        }

        #erisOnboarding .eris-logo {
          width: 58px;
          height: 58px;
          margin: 0 auto 14px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          background: linear-gradient(135deg,#795cff,#a855f7);
          box-shadow: 0 10px 30px rgba(121,92,255,.3);
        }

        #erisOnboarding h1 {
          margin: 0;
          text-align: center;
          font-size: 25px;
        }

        #erisOnboarding .eris-subtitle {
          margin: 8px 0 24px;
          text-align: center;
          color: #aeb3c7;
          line-height: 1.5;
          font-size: 14px;
        }

        #erisOnboarding .eris-step {
          display: none;
        }

        #erisOnboarding .eris-step.active {
          display: block;
        }

        #erisOnboarding label {
          display: block;
          margin: 14px 0 7px;
          color: #dfe2ef;
          font-size: 13px;
          font-weight: 600;
        }

        #erisOnboarding input,
        #erisOnboarding textarea,
        #erisOnboarding select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 13px;
          padding: 13px 14px;
          outline: none;
          color: #fff;
          background: rgba(255,255,255,.06);
          font: inherit;
        }

        #erisOnboarding input:focus,
        #erisOnboarding textarea:focus,
        #erisOnboarding select:focus {
          border-color: #846cff;
          box-shadow: 0 0 0 3px rgba(132,108,255,.12);
        }

        #erisOnboarding textarea {
          min-height: 110px;
          resize: vertical;
        }

        #erisOnboarding .eris-gender {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        #erisOnboarding .eris-gender button {
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 13px;
          padding: 13px;
          color: #fff;
          background: rgba(255,255,255,.05);
          cursor: pointer;
          font: inherit;
        }

        #erisOnboarding .eris-gender button.selected {
          border-color: #846cff;
          background: rgba(132,108,255,.2);
        }

        #erisOnboarding .eris-actions {
          display: flex;
          gap: 10px;
          margin-top: 22px;
        }

        #erisOnboarding .eris-actions button {
          flex: 1;
          border: 0;
          border-radius: 13px;
          padding: 14px;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }

        #erisOnboarding .eris-next {
          color: #fff;
          background: linear-gradient(135deg,#795cff,#a855f7);
        }

        #erisOnboarding .eris-back {
          color: #dfe2ef;
          background: rgba(255,255,255,.08);
        }

        #erisOnboarding .eris-error {
          min-height: 20px;
          margin-top: 12px;
          color: #ff8e9e;
          font-size: 13px;
          text-align: center;
        }

        #erisOnboarding .eris-counter {
          margin-top: 6px;
          color: #8f95aa;
          font-size: 12px;
          text-align: right;
        }

        #erisOnboarding .eris-cosmetics-gallery {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        width: 100%;
      }

      #erisOnboarding .eris-cosmetic-item {
        width: 100%;
        height: 82px;
        min-width: 0;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.045);
      }

      #erisOnboarding .eris-cosmetic-item img {
        display: block;
        width: 58px;
        height: 58px;
        max-width: 58px;
        max-height: 58px;
        min-width: 0;
        min-height: 0;
        object-fit: contain;
        object-position: center;
        flex: 0 0 auto;
      }

      #erisOnboarding .eris-frame-item img {
        width: 68px;
        height: 68px;
        max-width: 68px;
        max-height: 68px;
        object-fit: contain;
      }

      #erisOnboarding .eris-cosmetic-item.selected {
        border-color: rgba(132,108,255,.9);
        box-shadow: 0 0 0 2px rgba(132,108,255,.18);
      }

      #erisOnboarding .eris-progress {
          display: flex;
          gap: 7px;
          margin: 0 0 22px;
        }

        #erisOnboarding .eris-progress span {
          height: 4px;
          flex: 1;
          border-radius: 10px;
          background: rgba(255,255,255,.1);
        }

        #erisOnboarding .eris-progress span.active {
          background: #846cff;
        }
      </style>

      <div class="eris-onboard-card">
        <div class="eris-logo">E</div>
        <h1>ErisChat'e Hoş Geldin</h1>
        <div class="eris-subtitle">
          Seni daha iyi tanıyabilmemiz için profilini tamamlayalım.
        </div>

        <div class="eris-progress">
          <span id="erisProgress1" class="active"></span>
          <span id="erisProgress2"></span>
        </div>

        <div id="erisStep1" class="eris-step active">
          <label>Adın</label>
          <input id="erisFirstName" maxlength="64" autocomplete="given-name" placeholder="Adın">

          <label>Soyadın</label>
          <input id="erisLastName" maxlength="64" autocomplete="family-name" placeholder="Soyadın">

          <label>Doğum tarihin</label>
          <input id="erisBirthDate" type="date">

          <label>Cinsiyet</label>
          <div class="eris-gender">
            <button type="button" data-gender="male">Erkek</button>
            <button type="button" data-gender="female">Kadın</button>
          </div>

          <div id="erisOnboardError" class="eris-error"></div>

          <div class="eris-actions">
            <button type="button" class="eris-next" id="erisStep1Next">Devam Et</button>
          </div>
        </div>

        <div id="erisStep2" class="eris-step">
          <div class="eris-cosmetics-section">
            <label>Avatarını seç</label>
            <div id="erisAvatarGallery" class="eris-cosmetics-gallery"></div>
          </div>

          <div class="eris-cosmetics-section">
            <label>Çerçeveni seç</label>
            <div id="erisFrameGallery" class="eris-cosmetics-gallery"></div>
          </div>
          <label>Kullanıcı adın</label>
          <input id="erisUsername" maxlength="32" minlength="3" autocomplete="username" placeholder="Kullanıcı adın">

          <label>Biyografi</label>
          <textarea id="erisBio" maxlength="300" placeholder="Kendinden biraz bahset..."></textarea>
          <div class="eris-counter"><span id="erisBioCount">0</span>/300</div>

          <div id="erisOnboardError2" class="eris-error"></div>

          <div class="eris-actions">
            <button type="button" class="eris-back" id="erisStep2Back">Geri</button>
            <button type="button" class="eris-next" id="erisFinish">Profili Tamamla</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    let selectedGender = '';
    let selectedAvatarAsset = '';
    let selectedFrameAsset = '';

    const step1 = root.querySelector('#erisStep1');
    const step2 = root.querySelector('#erisStep2');
    const progress1 = root.querySelector('#erisProgress1');
    const progress2 = root.querySelector('#erisProgress2');
    const error1 = root.querySelector('#erisOnboardError');
    const error2 = root.querySelector('#erisOnboardError2');
    const bio = root.querySelector('#erisBio');
    const bioCount = root.querySelector('#erisBioCount');

    root.querySelectorAll('[data-gender]').forEach(button => {
      button.addEventListener('click', () => {
        selectedGender = button.dataset.gender;
        root.querySelectorAll('[data-gender]').forEach(x => x.classList.remove('selected'));
        button.classList.add('selected');
        error1.textContent = '';
      });
    });

    bio.addEventListener('input', () => {
      bioCount.textContent = String(bio.value.length);
    });

    async function loadOnboardingCosmetics() {
      const avatarGallery = root.querySelector('#erisAvatarGallery');
      const frameGallery = root.querySelector('#erisFrameGallery');

      avatarGallery.innerHTML = '<div class="eris-cosmetics-loading">Avatarlar yükleniyor...</div>';
      frameGallery.innerHTML = '<div class="eris-cosmetics-loading">Çerçeveler yükleniyor...</div>';

      try {
        const catalogResponse = await request('/cosmetics');
        const catalog = Array.isArray(catalogResponse)
          ? catalogResponse
          : (catalogResponse?.items || []);

        const avatars = catalog.filter(item =>
          item.type === 'avatar' &&
          item.vip === false &&
          item.gender === selectedGender
        );

        const frames = catalog.filter(item =>
          item.type === 'frame' &&
          item.vip === false
        );

        avatarGallery.innerHTML = '';
        frameGallery.innerHTML = '';

        avatars.forEach((item, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'eris-cosmetic-item';
          button.innerHTML = '<img alt="Avatar" loading="lazy">';

          const img = button.querySelector('img');
          img.src = window.ErisChatCosmetics
            ? window.ErisChatCosmetics.assetUrl(item.asset_key)
            : 'Gereken_icerikler/' + item.asset_key;

          button.addEventListener('click', () => {
            selectedAvatarAsset = item.asset_key;
            avatarGallery.querySelectorAll('.eris-cosmetic-item')
              .forEach(x => x.classList.remove('selected'));
            button.classList.add('selected');
          });

          avatarGallery.appendChild(button);

          if (index === 0) {
            selectedAvatarAsset = item.asset_key;
            button.classList.add('selected');
          }
        });

        frames.forEach((item, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'eris-cosmetic-item eris-frame-item';
          button.innerHTML = '<img alt="Çerçeve" loading="lazy">';

          const img = button.querySelector('img');
          img.src = window.ErisChatCosmetics
            ? window.ErisChatCosmetics.assetUrl(item.asset_key)
            : 'Gereken_icerikler/' + item.asset_key;

          button.addEventListener('click', () => {
            selectedFrameAsset = item.asset_key;
            frameGallery.querySelectorAll('.eris-cosmetic-item')
              .forEach(x => x.classList.remove('selected'));
            button.classList.add('selected');
          });

          frameGallery.appendChild(button);

          if (index === 0) {
            selectedFrameAsset = item.asset_key;
            button.classList.add('selected');
          }
        });

        if (!avatars.length) {
          avatarGallery.innerHTML = '<div class="eris-cosmetics-loading">Avatar bulunamadı.</div>';
        }

        if (!frames.length) {
          frameGallery.innerHTML = '<div class="eris-cosmetics-loading">Standart çerçeve bulunamadı.</div>';
        }
      } catch (error) {
        console.error('Onboarding cosmetics yüklenemedi:', error);
        avatarGallery.innerHTML = '<div class="eris-cosmetics-loading">Avatarlar yüklenemedi.</div>';
        frameGallery.innerHTML = '<div class="eris-cosmetics-loading">Çerçeveler yüklenemedi.</div>';
      }
    }

    root.querySelector('#erisStep1Next').addEventListener('click', async () => {
      const firstName = root.querySelector('#erisFirstName').value.trim();
      const lastName = root.querySelector('#erisLastName').value.trim();
      const birthDate = root.querySelector('#erisBirthDate').value;

      if (!firstName) {
        error1.textContent = 'Lütfen adını yaz.';
        return;
      }

      if (!lastName) {
        error1.textContent = 'Lütfen soyadını yaz.';
        return;
      }

      if (!birthDate) {
        error1.textContent = 'Lütfen doğum tarihini seç.';
        return;
      }

      if (!selectedGender) {
        error1.textContent = 'Lütfen cinsiyetini seç.';
        return;
      }

      error1.textContent = '';
      await loadOnboardingCosmetics();
      step1.classList.remove('active');
      step2.classList.add('active');
      progress1.classList.remove('active');
      progress2.classList.add('active');
      root.querySelector('#erisUsername').focus();
    });

    root.querySelector('#erisStep2Back').addEventListener('click', () => {
      step2.classList.remove('active');
      step1.classList.add('active');
      progress2.classList.remove('active');
      progress1.classList.add('active');
    });

    root.querySelector('#erisFinish').addEventListener('click', async () => {
      const firstName = root.querySelector('#erisFirstName').value.trim();
      const lastName = root.querySelector('#erisLastName').value.trim();
      const birthDate = root.querySelector('#erisBirthDate').value;
      const username = root.querySelector('#erisUsername').value.trim();
      const bioValue = bio.value.trim();

      error2.textContent = '';

      if (username.length < 3) {
        error2.textContent = 'Kullanıcı adı en az 3 karakter olmalı.';
        return;
      }

      const button = root.querySelector('#erisFinish');
      button.disabled = true;
      button.textContent = 'Kaydediliyor...';

      try {
        const user = await request('/onboarding', {
          method: 'POST',
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            birth_date: birthDate,
            gender: selectedGender,
            username,
            bio: bioValue,
                                    avatar_asset: selectedAvatarAsset || null,
                                    frame_asset: selectedFrameAsset || null,
          }),
        });

        window.ErisAuth = window.ErisAuth || {};
        window.ErisAuth.user = user;

        window.dispatchEvent(new CustomEvent('erischat:auth', {
          detail: {
            state: 'ready',
            user,
            real: true,
            onboarding_completed: true,
          }
        }));
          setTimeout(() => window.ErisWelcome?.show?.(user), 100);

        root.remove();
      } catch (error) {
        error2.textContent = error.message || 'Profil kaydedilemedi.';
        button.disabled = false;
        button.textContent = 'Profili Tamamla';
      }
    });

    return root;
  }

  function show(user) {
    if (!user || user.profile_completed) return;
    createUI();
  }

  window.ErisOnboarding = {
    show,
  };

  if (window.ErisAuth?.user) setTimeout(() => show(window.ErisAuth.user), 100);

  window.addEventListener('erischat:auth', event => {
    const detail = event.detail || {};
    if (detail.state === 'ready' && detail.user && !detail.user.profile_completed) {
      setTimeout(() => show(detail.user), 50);
    }
  });
})();
