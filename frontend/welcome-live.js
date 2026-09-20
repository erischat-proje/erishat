(() => {
  const API = () => (
    window.ERIS_API ||
    window.ERISCHAT_API ||
    'https://erischat-api-production.up.railway.app/v1'
  ).replace(/\/$/, '');

  const token = () =>
    localStorage.getItem('erischat_access_token') ||
    localStorage.getItem('eris_token') ||
    '';

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
      throw new Error(data.detail || data.message || `HTTP ${response.status}`);
    }

    return data;
  }

  function removeExisting() {
    document.getElementById('erisWelcomeGift')?.remove();
  }

  function createUI(user) {
    removeExisting();

    const root = document.createElement('div');
    root.id = 'erisWelcomeGift';

    root.innerHTML = `
      <div class="eris-welcome-backdrop">
        <div class="eris-welcome-card">
          <div class="eris-welcome-logo">E</div>
          <div class="eris-welcome-brand">ErisChat</div>

          <div class="eris-welcome-title">Hoşgeldin ${escapeHtml(user.nickname || '')} 💜</div>

          <div class="eris-welcome-text">
            Selam ${escapeHtml(user.nickname || '')} ErisChat'e hoşgeldin seni aramızda
            gördüğümüz için çok mutlu olduk. Umarım uygulamada keyifli vakit geçirirsin
            sana hoşgeldin hediyeleri veriyoruz uygulamada vakit geçirmen dileği ile
            keyifli vakitler.
          </div>

          <div class="eris-welcome-gifts">
            <div>💰 <b>+500 Lidya</b></div>
            <div>🧑 <b>Standart avatar</b></div>
            <div>🖼️ <b>Standart çerçeve</b></div>
          </div>

          <button type="button" id="erisClaimWelcome" class="eris-welcome-claim">
            Hediyelerini Kabul Et
          </button>

          <div id="erisWelcomeStatus" class="eris-welcome-status"></div>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #erisWelcomeGift {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        font-family: inherit;
      }

      .eris-welcome-backdrop {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(4, 2, 10, .82);
        backdrop-filter: blur(12px);
      }

      .eris-welcome-card {
        width: min(430px, 100%);
        box-sizing: border-box;
        padding: 28px 22px 22px;
        text-align: center;
        color: #fff;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 28px;
        background: linear-gradient(180deg, #171020, #0b0911);
        box-shadow: 0 25px 80px rgba(0,0,0,.55);
      }

      .eris-welcome-logo {
        width: 58px;
        height: 58px;
        margin: 0 auto 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 18px;
        background: linear-gradient(135deg, #9b5cff, #e85cff);
        font-size: 30px;
        font-weight: 900;
      }

      .eris-welcome-brand {
        font-size: 14px;
        font-weight: 800;
        opacity: .82;
        margin-bottom: 22px;
      }

      .eris-welcome-title {
        font-size: 22px;
        font-weight: 900;
        margin-bottom: 15px;
      }

      .eris-welcome-text {
        color: #d8d0df;
        font-size: 13px;
        line-height: 1.65;
      }

      .eris-welcome-gifts {
        margin: 20px 0;
        padding: 14px;
        display: grid;
        gap: 9px;
        border-radius: 18px;
        background: rgba(255,255,255,.055);
        color: #eee7f3;
        font-size: 13px;
      }

      .eris-welcome-claim {
        width: 100%;
        min-height: 48px;
        border: 0;
        border-radius: 16px;
        cursor: pointer;
        color: #fff;
        background: linear-gradient(135deg, #9b5cff, #e85cff);
        font-size: 14px;
        font-weight: 900;
      }

      .eris-welcome-claim:disabled {
        opacity: .55;
        cursor: wait;
      }

      .eris-welcome-status {
        min-height: 18px;
        margin-top: 10px;
        color: #bcb1c7;
        font-size: 11px;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(root);

    root.querySelector('#erisClaimWelcome').onclick = async () => {
      const button = root.querySelector('#erisClaimWelcome');
      const status = root.querySelector('#erisWelcomeStatus');

      button.disabled = true;
      button.textContent = 'Hediyelerin veriliyor…';
      status.textContent = '';

      try {
        const updatedUser = await request('/welcome/claim', {
          method: 'POST',
        });

        window.ErisAuth = window.ErisAuth || {};
        window.ErisAuth.user = updatedUser;

        window.dispatchEvent(new CustomEvent('erischat:auth', {
          detail: {
            state: 'ready',
            user: updatedUser,
            real: true,
            welcome_claimed: true,
          }
        }));

        status.textContent = 'Hediyelerin hesabına eklendi! 🎁';
        button.textContent = 'Hediyeler Alındı ✓';

        setTimeout(() => root.remove(), 900);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Hediyelerini Kabul Et';
        status.textContent = error.message || 'Hediyeler alınamadı.';
      }
    };

    return root;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  }

  function show(user) {
    if (!user || !user.profile_completed || user.welcome_gift_claimed) return;
    createUI(user);
  }

  window.ErisWelcome = { show };

  window.addEventListener('erischat:auth', event => {
    const detail = event.detail || {};
    if (detail.state === 'ready' && detail.user) {
      setTimeout(() => show(detail.user), 150);
    }
  });
})();
