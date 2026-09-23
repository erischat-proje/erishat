(() => {
  'use strict';

  const API = () => (
    window.ERIS_API ||
    window.ERISCHAT_API ||
    'https://erischat-api-production.up.railway.app/v1'
  ).replace(/\/$/, '');

  const token = () =>
    localStorage.getItem('erischat_access_token') ||
    localStorage.getItem('erischat.accessToken.v1') ||
    localStorage.getItem('token') || '';

  const headers = () => token()
    ? {Authorization: 'Bearer ' + token(), Accept: 'application/json'}
    : {Accept: 'application/json'};

  const api = async (path, options = {}) => {
    const h = {...headers(), ...(options.headers || {})};
    if (options.body && !h['Content-Type']) h['Content-Type'] = 'application/json';
    const r = await fetch(API() + path, {...options, headers: h});
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.detail || `HTTP ${r.status}`);
    return b;
  };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])
  );

  function style() {
    if (document.getElementById('eris-production-ui-css')) return;

    const s = document.createElement('style');
    s.id = 'eris-production-ui-css';
    s.textContent = `
      /* Production UI cleanup */
      #demoAudit,
      #demoAudit + *,
      [data-demo-only],
      .demo-only,
      .demo-control,
      #demoControlCenter {
        display:none!important;
      }

      .eris-ui-search {
        display:flex;
        gap:8px;
        margin:0 0 14px;
      }

      .eris-ui-search input {
        flex:1;
        min-width:0;
        height:44px;
        border:1px solid #ffffff12;
        background:#ffffff07;
        color:#fff;
        border-radius:15px;
        padding:0 14px;
        outline:none;
      }

      .eris-ui-search button {
        height:44px;
        border:0;
        border-radius:15px;
        padding:0 15px;
        color:#fff;
        font-weight:800;
        background:linear-gradient(135deg,#754cff,#ff4fa3);
      }

      .eris-search-result {
        display:flex;
        align-items:center;
        gap:10px;
        width:100%;
        border:1px solid #ffffff12;
        background:#ffffff06;
        color:#fff;
        border-radius:16px;
        padding:10px;
        text-align:left;
        margin-bottom:8px;
      }

      .eris-search-result .grow {
        flex:1;
        min-width:0;
      }

      .eris-search-result small {
        display:block;
        color:#938a9f;
        font-size:8px;
        margin-top:3px;
      }

      .eris-own-room {
        width:100%;
        margin-top:10px;
        border:1px solid #ffffff12;
        background:linear-gradient(135deg,#754cff18,#ff4fa310);
        color:#fff;
        border-radius:16px;
        padding:12px;
        text-align:left;
      }

      .eris-own-room b {font-size:10px}
      .eris-own-room small {
        display:block;
        color:#aaa0b2;
        font-size:8px;
        margin-top:4px;
      }

      /* Requested room header: no left back button. */
      #erisRoomSurface .eris-room-top .room-action.back {
        display:none!important;
      }

      #erisRoomSurface .eris-room-top {
        gap:6px!important;
        padding-left:10px!important;
      }

      #erisRoomSurface #erisRoomGift,
      #erisRoomSurface #erisRoomMusic {
        display:none!important;
      }

      #erisRoomSurface #erisRoomMoreTop {
        order:4!important;
      }

      #erisRoomSurface #erisRoomLeaveTop {
        order:5!important;
      }

      #erisRoomSurface .eris-room-title {
        order:1!important;
      }

      #erisRoomSurface #erisRoomLevel {
        order:3!important;
      }

      #erisRoomSurface .eris-room-compose {
        display:flex!important;
      }

      #erisRoomSurface .eris-room-compose input {
        order:1!important;
      }

      #erisRoomSurface #erisRoomGiftInline {
        order:2!important;
      }

      #erisRoomSurface #erisRoomMicInline {
        order:3!important;
      }

      #erisRoomSurface #erisLiveSend {
        order:4!important;
      }

      #erisRoomSurface .room-v5-panel,
      #erisRoomSurface .room-v3-panel {
        z-index:500!important;
      }

      .eris-seat-action-sheet {
        position:fixed;
        inset:auto 10px 18px;
        z-index:7000;
        display:none;
        padding:10px;
        border:1px solid #ffffff18;
        border-radius:20px;
        background:rgba(10,7,18,.97);
        backdrop-filter:blur(22px);
        box-shadow:0 20px 70px #000b;
      }

      .eris-seat-action-sheet.show {display:block}

      .eris-seat-action-sheet b {
        display:block;
        font-size:11px;
        margin:3px 4px 9px;
      }

      .eris-seat-actions {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:7px;
      }

      .eris-seat-actions button {
        min-height:42px;
        border:1px solid #ffffff12;
        background:#ffffff08;
        color:#fff;
        border-radius:12px;
        font-size:9px;
      }

      .eris-seat-actions button.danger {
        background:#ff4f6818;
        border-color:#ff4f6835;
      }

      @media(min-width:760px) {
        .eris-ui-search {max-width:760px}
        .eris-seat-action-sheet {
          left:50%;
          right:auto;
          width:420px;
          transform:translateX(-50%);
        }
      }
    `;
    document.head.appendChild(s);
  }

  function toast(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.warn('[ErisChat]', message);
  }

  function hideDemoSurface() {
    document.querySelectorAll('#demoAudit,.demo-only,.demo-control,[data-demo-only],#demoControlCenter')
      .forEach(x => x.remove());

    document.querySelectorAll('.section').forEach(section => {
      const text = section.textContent || '';
      if (/demo kontrol merkezi/i.test(text)) section.remove();
    });
  }

  async function userById(value) {
    const id = String(value || '').trim();
    if (!id) throw new Error('Kullanıcı ID gir.');
    if (!token()) throw new Error('Önce giriş yapmalısın.');

    const u = await api('/users/' + encodeURIComponent(id));
    if (!u || !u.id) throw new Error('Kullanıcı bulunamadı.');
    return u;
  }

  function installMessageSearch() {
    const view = document.getElementById('messages');
    if (!view || view.dataset.productionSearch === '1') return;

    view.dataset.productionSearch = '1';

    const title = view.querySelector('.title');
    const box = document.createElement('div');
    box.className = 'eris-ui-search';
    box.innerHTML = `
      <input id="erisMessageUserSearch"
             autocomplete="off"
             inputmode="text"
             placeholder="Kullanıcı ID ile ara…">
      <button id="erisMessageUserSearchBtn" type="button">Ara</button>
    `;

    title?.after(box);

    const result = document.createElement('div');
    result.id = 'erisMessageSearchResult';
    view.insertBefore(result, view.querySelector('.list'));

    const run = async () => {
      const input = box.querySelector('input');
      const value = input?.value?.trim();
      if (!value) return toast('Kullanıcı ID gir.');

      result.innerHTML =
        '<div class="card" style="padding:12px;font-size:9px;color:#aaa0b2">Aranıyor…</div>';

      try {
        const u = await userById(value);
        const name = u.nickname || u.username || 'Anonim kullanıcı';
        const publicId = u.public_id || u.id;

        result.innerHTML = `
          <button class="eris-search-result" type="button">
            <div class="ava round">${esc((name[0] || '?').toUpperCase())}</div>
            <div class="grow">
              <b>${esc(name)}</b>
              <small>ID: ${esc(publicId)} • Mesaj gönder</small>
            </div>
            <span>›</span>
          </button>
        `;

        result.querySelector('button').onclick = async () => {
          try {
            const c = await window.ErisChatDM?.create?.(
              u.id,
              name
            );
            if (!c) throw new Error('Konuşma oluşturulamadı.');
            result.innerHTML = '';
          } catch (e) {
            toast(e.message || 'Konuşma açılamadı.');
          }
        };
      } catch (e) {
        result.innerHTML = `
          <div class="card" style="padding:12px;font-size:9px;color:#aaa0b2">
            ${esc(e.message || 'Kullanıcı bulunamadı.')}
          </div>
        `;
      }
    };

    box.querySelector('button').onclick = run;
    box.querySelector('input').addEventListener('keydown', e => {
      if (e.key === 'Enter') run();
    });
  }

  async function installOwnRoom() {
    const profile = document.getElementById('profile');
    if (!profile || profile.dataset.ownRoom === '1') return;

    profile.dataset.ownRoom = '1';

    const card = profile.querySelector('.profile');
    if (!card) return;

    const wrap = document.createElement('div');
    wrap.className = 'eris-own-room';
    wrap.innerHTML = `
      <b>🏠 Odam</b>
      <small id="erisOwnRoomText">Odan kontrol ediliyor…</small>
    `;
    card.after(wrap);

    try {
      if (!window.ErisRoom?.list) throw new Error('Oda servisi hazır değil.');
      const data = await window.ErisRoom.list();
      const rooms = Array.isArray(data)
        ? data
        : (data.rooms || data.items || data.data || []);

      const me =
        localStorage.getItem('eris_user_id') ||
        window.ErisCurrentUserId ||
        '';

      const mine = rooms.find(r =>
        r.is_owner === true ||
        String(r.owner_id || '') === String(me)
      );

      if (!mine) {
        wrap.querySelector('small').textContent =
          'Henüz kendi odan yok.';
        return;
      }

      const id = mine.id || mine.public_id;
      const name = mine.name || 'Odam';

      wrap.querySelector('small').textContent =
        `${name} • ${mine.seat_count || mine.capacity || 8} koltuk`;

      wrap.onclick = () => {
        window.openRoom?.(id, name);
      };
    } catch (_) {
      wrap.querySelector('small').textContent =
        'Oda bilgisi giriş yaptıktan sonra yüklenir.';
    }
  }

  function roomPermission() {
    const p = window.__erisRoomPermissions || {};
    return !!(p.is_owner || p.is_moderator || p.can_manage);
  }

  function hardenRoomHeader() {
    const surface = document.getElementById('erisRoomSurface');
    if (!surface) return;

    surface.querySelector('.room-action.back')?.setAttribute('aria-hidden', 'true');
    surface.querySelector('.room-action.back')?.style.setProperty(
      'display','none','important'
    );

    const staff = roomPermission();

    [
      '#erisRoomMoreTop',
      '[data-management-tab]',
      '[data-room-management]',
      '[data-room-settings]',
      '[data-room-admin]',
      '#roomSettingsBtn',
      '#roomThemeBtn',
      '#roomLockBtn',
      '#roomMuteBtn',
      '#roomKickBtn',
      '#roomSeatLockBtn',
      '#roomModerationBtn',
      '#roomMusicManage'
    ].forEach(sel => {
      surface.querySelectorAll(sel).forEach(el => {
        if (staff) {
          el.style.removeProperty('display');
          el.removeAttribute('aria-hidden');
        } else {
          el.style.setProperty('display','none','important');
          el.setAttribute('aria-hidden','true');
        }
      });
    });
  }

  function installSeatLongPress() {
    const surface = document.getElementById('erisRoomSurface');
    if (!surface || surface.dataset.longPress === '1') return;

    surface.dataset.longPress = '1';

    let timer = null;
    let startX = 0;
    let startY = 0;

    const close = () =>
      document.querySelector('.eris-seat-action-sheet')?.classList.remove('show');

    const show = async seat => {
      close();

      const staff = roomPermission();
      const occupied = seat.classList.contains('occupied');
      const locked = seat.classList.contains('locked');
      const seatNumber = Number(seat.dataset.seatNumber || seat.dataset.seat || 0);

      if (!seatNumber) return;

      const roomId =
        window.ErisCurrentRoomId ||
        window.currentRoomId ||
        '';

      const sheet = document.createElement('div');
      sheet.className = 'eris-seat-action-sheet';
      sheet.innerHTML = `
        <b>${occupied ? '👤 Dolu koltuk' : '💺 Boş koltuk'} • ${seatNumber}</b>
        <div class="eris-seat-actions"></div>
      `;

      const actions = sheet.querySelector('.eris-seat-actions');

      if (!staff) {
        actions.innerHTML =
          '<button type="button">Koltuk bilgisi</button>';
        actions.firstElementChild.onclick = close;
      } else if (occupied) {
        actions.innerHTML = `
          <button type="button" data-action="mute">🔇 Sustur</button>
          <button type="button" data-action="kick" class="danger">🚫 Odadan at</button>
        `;
      } else {
        actions.innerHTML = `
          <button type="button" data-action="lock">
            ${locked ? '🔓 Kilidi aç' : '🔒 Koltuğu kilitle'}
          </button>
          <button type="button" data-action="mute">🔇 Mikrofonu yönet</button>
        `;
      }

      document.body.appendChild(sheet);
      requestAnimationFrame(() => sheet.classList.add('show'));

      const room = window.ErisRoom;

      sheet.querySelector('[data-action="lock"]')?.addEventListener('click', async () => {
        try {
          if (locked) await room.unlockSeat(roomId, seatNumber);
          else await room.lockSeat(roomId, seatNumber);
          close();
          window.openRoom?.(
            roomId,
            document.getElementById('erisLiveTitle')?.textContent || 'Oda'
          );
        } catch (e) {
          toast(e.message || 'Koltuk işlemi reddedildi.');
        }
      });

      sheet.querySelector('[data-action="mute"]')?.addEventListener('click', async () => {
        try {
          await room.muteSeat(roomId, seatNumber);
          close();
          toast('Koltuk mikrofonu güncellendi ✓');
        } catch (e) {
          toast(e.message || 'Mikrofon işlemi reddedildi.');
        }
      });

      sheet.querySelector('[data-action="kick"]')?.addEventListener('click', async () => {
        try {
          const uid = seat.dataset.userId || seat.dataset.userid;
          if (!uid) throw new Error('Kullanıcı bilgisi bulunamadı.');
          await room.ban(roomId, uid);
          close();
          window.openRoom?.(
            roomId,
            document.getElementById('erisLiveTitle')?.textContent || 'Oda'
          );
          toast('Kullanıcı odadan çıkarıldı ✓');
        } catch (e) {
          toast(e.message || 'Kullanıcı çıkarılamadı.');
        }
      });

      setTimeout(() => {
        const outside = e => {
          if (!sheet.contains(e.target)) {
            close();
            document.removeEventListener('pointerdown', outside);
          }
        };
        document.addEventListener('pointerdown', outside);
      }, 0);
    };

    const seats = () => surface.querySelectorAll('.eris-seat');

    surface.addEventListener('pointerdown', e => {
      const seat = e.target.closest('.eris-seat');
      if (!seat) return;

      startX = e.clientX;
      startY = e.clientY;
      clearTimeout(timer);

      timer = setTimeout(() => {
        timer = null;
        show(seat);
      }, 520);
    }, {passive:true});

    surface.addEventListener('pointermove', e => {
      if (!timer) return;
      if (
        Math.abs(e.clientX - startX) > 12 ||
        Math.abs(e.clientY - startY) > 12
      ) {
        clearTimeout(timer);
        timer = null;
      }
    }, {passive:true});

    ['pointerup','pointercancel'].forEach(type =>
      surface.addEventListener(type, () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }, {passive:true})
    );

    void seats;
  }

  function normalizeRoom() {
    const surface = document.getElementById('erisRoomSurface');
    if (!surface) return;

    hardenRoomHeader();
    installSeatLongPress();

    const compose = surface.querySelector('.eris-room-compose');
    if (compose) {
      const send = compose.querySelector('#erisLiveSend');
      const gift = compose.querySelector('#erisRoomGiftInline');

      if (gift && send && gift.parentElement !== compose) {
        compose.insertBefore(gift, send);
      }
    }
  }

  function boot() {
    style();
    hideDemoSurface();
    installMessageSearch();
    installOwnRoom();
    normalizeRoom();
  }

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab && tab.dataset.tab === 'messages') {
      setTimeout(() => {
        installMessageSearch();
        installOwnRoom();
      }, 50);
    }
  });

  window.addEventListener('erischat:auth', e => {
    if (e.detail?.state === 'ready') {
      setTimeout(() => {
        installMessageSearch();
        installOwnRoom();
      }, 100);
    }
  });

  window.addEventListener('erischat:room-opened', () =>
    setTimeout(normalizeRoom, 60)
  );

  const observer = new MutationObserver(() => {
    if (document.getElementById('erisRoomSurface')) normalizeRoom();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      boot();
      observer.observe(document.body, {childList:true, subtree:true});
    }, {once:true});
  } else {
    boot();
    observer.observe(document.body, {childList:true, subtree:true});
  }

  window.ErisProductionUI = {
    boot,
    normalizeRoom,
    searchUser: userById
  };
})();
