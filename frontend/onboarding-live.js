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
      const error=new Error(data.detail?.message || data.detail || data.message || `İşlem başarısız (${response.status})`);error.code=data.detail?.code;throw error;
    }

    return data;
  }

  function removeExisting() {
    const old=document.getElementById('erisOnboarding'); old?._erisCleanup?.(); old?.remove();
  }

  function todayTR(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').reduce((a,p)=>(a[p.type]=p.value,a),{});}
  function isAdult(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),t=todayTR(),date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return false;return Number(t.year)-y-((Number(t.month)<m||Number(t.month)===m&&Number(t.day)<d)?1:0)>=18;}

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
            radial-gradient(circle at top, color-mix(in srgb, var(--ui-button) 25%, transparent), transparent 45%),
            color-mix(in srgb, var(--ui-panel) 96%, transparent);
          color: var(--ui-ink);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #erisOnboarding .eris-onboard-card {
          width: min(460px, 100%);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          border: 1px solid var(--ui-line);
          border-radius: 24px;
          padding: 28px;
          background: color-mix(in srgb, var(--ui-raised) 97%, transparent);
          box-shadow: 0 24px 80px var(--ui-shadow);
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
          background: linear-gradient(135deg,var(--ui-button),var(--ui-button));
          box-shadow: 0 10px 30px var(--ui-shadow);
        }

        #erisOnboarding h1 {
          margin: 0;
          text-align: center;
          font-size: 25px;
        }

        #erisOnboarding .eris-subtitle {
          margin: 8px 0 24px;
          text-align: center;
          color: var(--ui-muted);
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
          color: var(--ui-muted);
          font-size: 13px;
          font-weight: 600;
        }

        #erisOnboarding input,
        #erisOnboarding textarea,
        #erisOnboarding select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--ui-line);
          border-radius: 13px;
          padding: 13px 14px;
          outline: none;
          color: var(--ui-ink);
          background: color-mix(in srgb, var(--ui-panel) 6%, transparent);
          font: inherit;
        }

        #erisOnboarding input:focus,
        #erisOnboarding textarea:focus,
        #erisOnboarding select:focus {
          border-color: var(--ui-line);
          box-shadow: 0 0 0 3px var(--ui-shadow);
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
          border: 1px solid var(--ui-line);
          border-radius: 13px;
          padding: 13px;
          color: var(--ui-ink);
          background: color-mix(in srgb, var(--ui-raised) 5%, transparent);
          cursor: pointer;
          font: inherit;
        }

        #erisOnboarding .eris-gender button.selected {
          border-color: var(--ui-line);
          background: color-mix(in srgb, var(--ui-button) 20%, transparent);
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
          color: var(--ui-primary-ink);
          background: linear-gradient(135deg,var(--ui-primary),var(--ui-primary));
        }

        #erisOnboarding .eris-back {
          color: var(--ui-ink);
          background: color-mix(in srgb, var(--ui-panel) 8%, transparent);
        }

        #erisOnboarding .eris-error {
          min-height: 20px;
          margin-top: 12px;
          color: var(--ui-danger);
          font-size: 13px;
          text-align: center;
        }

        #erisOnboarding .eris-counter {
          margin-top: 6px;
          color: var(--ui-ink);
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
        border: 1px solid var(--ui-line);
        background: color-mix(in srgb, var(--ui-raised) 5%, transparent);
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

      #erisOnboarding .eris-cosmetic-item:not(.eris-frame-item) img {
        border-radius: 50%;
        object-fit: cover;
      }

      #erisOnboarding .eris-frame-item img {
        width: 68px;
        height: 68px;
        max-width: 68px;
        max-height: 68px;
        object-fit: contain;
      }

      #erisOnboarding .eris-cosmetic-item.selected {
        border-color: var(--ui-line);
        box-shadow: 0 0 0 2px var(--ui-shadow);
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
          background: color-mix(in srgb, var(--ui-panel) 10%, transparent);
        }

        #erisOnboarding .eris-progress span.active {
          background: var(--ui-button);
        }
      </style>

      <div class="eris-onboard-card">
        <div class="eris-logo eris-shared-brand"><img class="eris-brand-image" src="./assets/lidya-menu/light-logo.png" alt="ErisChat" width="1600" height="544" decoding="async"></div>
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

          <div class="eris-consent-row">
            <button type="button" id="erisTermsCheck" role="checkbox" aria-checked="false" aria-label="Kullanıcı sözleşmesini aç ve onayla"><span aria-hidden="true">✓</span></button>
            <div><button type="button" id="erisReadTerms">Kullanıcı sözleşmesini oku ve onayla</button><small>18 yaşını doldurmuş olmalısın. Devam etmek için sözleşmeyi sonuna kadar görüntüleyip onayla.</small></div>
          </div>
          <div id="erisOnboardError" class="eris-error" role="status"></div>

          <div class="eris-actions">
            <button type="button" class="eris-next" id="erisStep1Next" disabled>Devam Et</button>
          </div>
        </div>

        <div id="erisStep2" class="eris-step">
          <p class="eris-reward-note">Kayıt hediyeni seç: 1 standart avatar + 1 standart çerçeve. Seçtiklerin ücretsiz ve kalıcı olarak koleksiyonuna eklenecek.</p>
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
      <dialog id="erisTermsDialog" aria-labelledby="erisTermsTitle">
        <header><h2 id="erisTermsTitle">Kullanıcı sözleşmesi</h2><button type="button" data-terms-close aria-label="Sözleşmeyi kapat">×</button></header>
        <div class="eris-terms-body" tabindex="0" aria-label="Sözleşme metni"></div>
        <p data-terms-hint role="status">Metnin sonuna ulaşınca onay düğmesi açılır.</p>
        <footer><button type="button" data-terms-retry hidden>Yeniden yükle</button><button type="button" data-terms-accept disabled>Okudum, onaylıyorum</button></footer>
      </dialog>
    `;

    document.body.appendChild(root);

    let selectedGender = '';
    let selectedAvatarAsset = '';
    let selectedFrameAsset = '';
    let consent = null, agreement = null, alive=true, loadingCatalog=false, catalogSequence=0;
    const termsDialog=root.querySelector('#erisTermsDialog'),termsBody=root.querySelector('.eris-terms-body');
    const termsCheck=root.querySelector('#erisTermsCheck'),nextButton=root.querySelector('#erisStep1Next'),acceptButton=root.querySelector('[data-terms-accept]');
    const termsHint=root.querySelector('[data-terms-hint]'),retryTerms=root.querySelector('[data-terms-retry]');
    const updateConsent=()=>{termsCheck.setAttribute('aria-checked',String(!!consent));nextButton.disabled=!consent;root.querySelector('#erisReadTerms').textContent=consent?'Kullanıcı sözleşmesi onaylandı · Tekrar oku':'Kullanıcı sözleşmesini oku ve onayla';};
    function checkEnd(){if(!agreement)return;const read=termsBody.scrollHeight>0&&termsBody.clientHeight>0&&termsBody.scrollTop+termsBody.clientHeight>=termsBody.scrollHeight-3;if(read){acceptButton.disabled=false;termsHint.textContent='Metnin sonuna ulaştın. Kabul ediyorsan onaylayabilirsin.';}}
    function closeTerms(){if(termsDialog.close)termsDialog.close();else termsDialog.removeAttribute('open');termsCheck.focus();}
    async function openTerms(){
      agreement=null;acceptButton.disabled=true;retryTerms.hidden=true;termsBody.replaceChildren();termsBody.textContent='Sözleşme yükleniyor…';termsHint.textContent='Metnin sonuna ulaşınca onay düğmesi açılır.';
      if(!termsDialog.open){if(termsDialog.showModal)termsDialog.showModal();else termsDialog.setAttribute('open','');}
      try{
        const data=await request('/legal/user-agreement');if(!alive)return;
        if(!data.version||!/^[a-f0-9]{64}$/.test(data.sha256)||!Array.isArray(data.sections)||!data.sections.length)throw Error('Sözleşme yüklenemedi.');
        if(consent&&(consent.version!==data.version||consent.digest!==data.sha256)){consent=null;updateConsent();}
        agreement=data;termsBody.replaceChildren();root.querySelector('#erisTermsTitle').textContent=data.title;
        const info=document.createElement('p');info.textContent='Sürüm '+data.version+' · '+data.effective_date;termsBody.append(info);
        for(const section of data.sections){const title=document.createElement('h3');title.textContent=section.title;termsBody.append(title);for(const text of section.paragraphs){const p=document.createElement('p');p.textContent=text;termsBody.append(p);}}
        termsBody.scrollTop=0;requestAnimationFrame(checkEnd);termsBody.focus();
      }catch(error){if(!alive)return;termsBody.textContent=error.message||'Sözleşme yüklenemedi.';retryTerms.hidden=false;}
    }
    termsCheck.onclick=openTerms;root.querySelector('#erisReadTerms').onclick=openTerms;retryTerms.onclick=openTerms;
    root.querySelector('[data-terms-close]').onclick=closeTerms;termsBody.addEventListener('scroll',checkEnd,{passive:true});
    acceptButton.onclick=()=>{if(acceptButton.disabled||!agreement)return;consent={version:agreement.version,digest:agreement.sha256};updateConsent();closeTerms();};
    function syncLogo(){const theme=document.documentElement.dataset.erisTheme||document.documentElement.dataset.theme||'light';const logo=root.querySelector('.eris-brand-image'),src='./assets/lidya-menu/'+(theme==='dark'?'dark':'light')+'-logo.png';if(logo.getAttribute('src')!==src)logo.src=src;}
    const themeObserver=new MutationObserver(syncLogo);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme','data-theme','class']});syncLogo();
    const resizeTerms=typeof ResizeObserver==='function'?new ResizeObserver(checkEnd):null;resizeTerms?.observe(termsBody);
    root._erisCleanup=()=>{alive=false;catalogSequence++;themeObserver.disconnect();resizeTerms?.disconnect();};
    const now=todayTR();root.querySelector('#erisBirthDate').max=(Number(now.year)-18)+'-'+now.month+'-'+now.day;


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
        if(loadingCatalog)return;
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

      const sequence=++catalogSequence;loadingCatalog=true;
      try {
        const catalogResponse = await request('/cosmetics');
        if(!alive||sequence!==catalogSequence)return false;
        const catalog = Array.isArray(catalogResponse)
          ? catalogResponse
          : (catalogResponse?.items || []);

        const avatars = catalog.filter(item =>
          item.type === 'avatar' &&
          item.vip === false &&
          (item.gender === selectedGender || item.gender == null || item.gender === 'unisex')
        );

        const frames = catalog.filter(item =>
          item.type === 'frame' &&
          item.vip === false &&
          (item.gender === selectedGender || item.gender == null || item.gender === 'unisex')
        );

        const oldAvatar=selectedAvatarAsset,oldFrame=selectedFrameAsset;
        selectedAvatarAsset='';selectedFrameAsset='';
        avatarGallery.innerHTML = '';
        frameGallery.innerHTML = '';

        avatars.forEach((item, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'eris-cosmetic-item';
          button.innerHTML = '<img alt="Avatar" loading="lazy" decoding="async">';

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

          if (item.asset_key===oldAvatar || index===0&&!avatars.some(i=>i.asset_key===oldAvatar)) {
            selectedAvatarAsset = item.asset_key;
            button.classList.add('selected');
          }
        });

        frames.forEach((item, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'eris-cosmetic-item eris-frame-item';
          button.innerHTML = '<img alt="Çerçeve" loading="lazy" decoding="async">';

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

          if (item.asset_key===oldFrame || index===0&&!frames.some(i=>i.asset_key===oldFrame)) {
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
        return !!avatars.length&&!!frames.length;
      } catch (error) {
        if(!alive||sequence!==catalogSequence)return false;
        console.error('Onboarding cosmetics yüklenemedi:', error);
        avatarGallery.innerHTML = '<div class="eris-cosmetics-loading">Avatarlar yüklenemedi.</div>';
        frameGallery.innerHTML = '<div class="eris-cosmetics-loading">Çerçeveler yüklenemedi.</div>';
        return false;
      }finally{loadingCatalog=false;}
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

      if(!isAdult(birthDate)){error1.textContent='ErisChat yalnızca 18 yaşını doldurmuş kişiler içindir.';return;}
      if(!consent){error1.textContent='Kullanıcı sözleşmesini okuyup onaylamalısın.';return;}
      if (!selectedGender) {
        error1.textContent = 'Lütfen cinsiyetini seç.';
        return;
      }

      error1.textContent = '';
      if(loadingCatalog)return;nextButton.disabled=true;
      const ready=await loadOnboardingCosmetics();nextButton.disabled=!consent;
      if(!ready){error1.textContent='Kayıt hediyeleri yüklenemedi. Tekrar deneyebilirsin.';return;}
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

      if(!consent||!isAdult(birthDate)||!selectedAvatarAsset||!selectedFrameAsset){error2.textContent='18 yaş şartını, sözleşme onayını ve hediye seçimlerini tamamlamalısın.';return;}
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
            avatar_asset: selectedAvatarAsset,
            frame_asset: selectedFrameAsset,
            terms_accepted:true,
            terms_version:consent.version,
            terms_digest:consent.digest,
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

        root._erisCleanup();root.remove();
      } catch (error) {
        if(error.code==='terms_changed'){consent=null;updateConsent();step2.classList.remove('active');step1.classList.add('active');progress2.classList.remove('active');progress1.classList.add('active');openTerms();}
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
    show,isAdult,
  };

  if (window.ErisAuth?.user) setTimeout(() => show(window.ErisAuth.user), 100);

  window.addEventListener('erischat:auth', event => {
    const detail = event.detail || {};
    if (detail.state === 'ready' && detail.user && !detail.user.profile_completed) {
      setTimeout(() => show(detail.user), 50);
    }
  });
})();
