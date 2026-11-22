const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  'frontend/lidya-android-back-v1.js', 'utf8'
);

function setup() {
  const elements = new Map();
  const listeners = {};
  let current = 'home';
  let exits = 0;

  const make = (name) => ({
    isConnected: true,
    disabled: false,
    style: {},
    classList: {contains: () => true},
    click() {
      elements.delete(name);
    },
    querySelector() {
      return this.closeButton || null;
    }
  });

  const document = {
    querySelectorAll(selector) {
      return [...elements.entries()]
        .filter(([key]) => key === selector)
        .flatMap(([, element]) =>
          Array.isArray(element) ? element : [element]);
    },
    querySelector(selector) {
      if (selector.includes('.view.show')) {
        return {id: current};
      }
      return elements.get(selector) || null;
    },
    getElementById(id) {
      return {classList: {contains: () => true}};
    }
  };

  const window = {
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    showView(id) {
      current = id;
      listeners['erischat:view-changed']?.({detail: {id}});
    },
    closeChat() {
      elements.delete('#chat.show');
    },
    toast() {},
    closeCreateRoom() {
      elements.delete('#createRoomModal.show');
    },
    ErisFloatingProfile: {
      close() {
        elements.delete('.eris-mini-profile-shade');
      }
    }
  };

  const context = {
    window, document,
    getComputedStyle: () => ({
      display: 'block',
      visibility: 'visible'
    })
  };

  vm.runInNewContext(source, context);

  function back() {
    const handled = window.LidyaAndroidBack.handle();
    if (!handled) exits++;
    return handled;
  }

  return {
    back,
    window,
    elements,
    make,
    getCurrent: () => current,
    getExits: () => exits
  };
}

{
  const t = setup();
  t.window.showView('messages');
  t.window.showView('profile');
  assert.equal(t.back(), true);
  assert.equal(t.getCurrent(), 'messages');
  assert.equal(t.back(), true);
  assert.equal(t.getCurrent(), 'home');
  assert.equal(t.back(), false);
  assert.equal(t.getExits(), 1);
  console.log('PASS: Sayfalar geriye dogru geziliyor.');
}

{
  const t = setup();
  t.window.showView('messages');
  t.elements.set('#chat.show', t.make('#chat.show'));
  assert.equal(t.back(), true);
  assert.equal(t.getCurrent(), 'messages');
  assert.equal(t.elements.has('#chat.show'), false);
  console.log('PASS: Sohbet once kapaniyor.');
}

{
  const t = setup();
  t.elements.set('#erisRoomSurface.show', t.make('room'));
  assert.equal(t.back(), true);
  assert.equal(t.elements.has('#erisRoomSurface.show'), true);
  assert.equal(t.getExits(), 0);
  console.log('PASS: Sesli oda korunuyor.');
}

{
  const t = setup();
  t.elements.set('.eris-mini-profile-shade', t.make('profile'));
  assert.equal(t.back(), true);
  assert.equal(t.elements.has('.eris-mini-profile-shade'), false);
  console.log('PASS: Profil penceresi kapaniyor.');
}

{
  const t = setup();
  const modal = t.make('#erisGamesModal');
  modal.closeButton = t.make('game-close');
  modal.closeButton.click = () =>
    t.elements.delete('#erisGamesModal');

  t.elements.set('#erisGamesModal', modal);
  assert.equal(t.back(), true);
  assert.equal(t.elements.has('#erisGamesModal'), false);
  console.log('PASS: Oyun penceresi kapaniyor.');
}


const extraCases = [
  ['.lb-mask', 'Bayi paneli'],
  ['.lbv9-mask', 'Bayi denetim merkezi'],
  ['.lbh10-mask', 'Bayi islem gecmisi'],
  ['.vp-overlay', 'VIP penceresi'],
  ['.eph-overlay', 'Profil alt penceresi'],
  ['.room-v5-panel.show', 'Oda V5 menusu'],
  ['.room-v3-panel.show', 'Oda V3 menusu']
];

for (const [selector, title] of extraCases) {
  const t = setup();
  const modal = t.make(selector);

  if (selector === '.eph-overlay') modal.hidden = false;

  modal.closeButton = t.make(title + '-close');
  modal.closeButton.click = () => {
    t.elements.delete(selector);
  };

  t.elements.set(selector, modal);

  if (selector.startsWith('.room-')) {
    t.elements.set(
      '#erisRoomSurface.show',
      t.make('active-room')
    );
  }

  assert.equal(t.back(), true, title);
  assert.equal(t.elements.has(selector), false, title);
  assert.equal(t.getExits(), 0, title);

  if (selector.startsWith('.room-')) {
    assert.equal(
      t.elements.has('#erisRoomSurface.show'),
      true,
      'Sesli oda korunmali'
    );
  }

  console.log('PASS: ' + title);
}

{
  const t = setup();

  const dealer = t.make('.lb-mask');
  dealer.closeButton = t.make('dealer-close');
  dealer.closeButton.click = () =>
    t.elements.delete('.lb-mask');

  const history = t.make('.lbh10-mask');
  history.closeButton = t.make('history-close');
  history.closeButton.click = () =>
    t.elements.delete('.lbh10-mask');

  t.elements.set('.lb-mask', dealer);
  t.elements.set('.lbh10-mask', history);

  assert.equal(t.back(), true);
  assert.equal(t.elements.has('.lbh10-mask'), false);
  assert.equal(t.elements.has('.lb-mask'), true);

  assert.equal(t.back(), true);
  assert.equal(t.elements.has('.lb-mask'), false);

  console.log('PASS: Bayi pencereleri sirayla kapaniyor.');
}


const newCases = [
  ['.lp-evidence', 'Dekont onizlemesi'],
  ['.lp-overlay', 'Lidya yukleme'],
  ['.shop-buy-confirm', 'Magaza satin alma onayi'],
  ['#shop800preview', 'Magaza onizlemesi'],
  ['#erischatGiftPanel.show', 'Oda hediye secimi'],
  ['dialog.lgr-dialog[open]', 'Oyun siralamasi'],
  ['.personal-fan-overlay', 'Hayran siralamasi']
];

for (const [selector, title] of newCases) {
  const t = setup();
  const modal = t.make(selector);

  modal.closeButton = t.make(title + '-close');
  modal.closeButton.click = () => {
    t.elements.delete(selector);
  };

  t.elements.set(selector, modal);

  assert.equal(t.back(), true, title);
  assert.equal(t.elements.has(selector), false, title);
  assert.equal(t.getExits(), 0, title);

  console.log('PASS: ' + title);
}


const v28Cases = [
  ['.eris-gift-cinema', 'Hediye animasyonu'],
  ['.dm-shared-panel', 'DM paylasilanlar'],
  ['.ludo-modal', 'Ludo penceresi'],
  ['#erisMusicPanel', 'Oda muzik paneli']
];

for (const [selector, title] of v28Cases) {
  const t = setup();
  const modal = t.make(selector);

  modal.closeButton = t.make(title + '-close');
  modal.closeButton.click = () =>
    t.elements.delete(selector);

  t.elements.set(selector, modal);

  // Sesli oda bu pencereler acikken de korunmali.
  t.elements.set(
    '#erisRoomSurface.show',
    t.make('active-room')
  );

  assert.equal(t.back(), true, title);
  assert.equal(t.elements.has(selector), false, title);
  assert.equal(
    t.elements.has('#erisRoomSurface.show'),
    true,
    title + ': oda baglantisi korunmali'
  );
  assert.equal(t.getExits(), 0, title);

  console.log('PASS: ' + title);
}


const v210Cases = [
  ['.dm-search-panel', 'DM mesaj arama'],
  ['.dm-action-panel', 'DM mesaj islemleri'],
  ['.lidya-group-modal', 'DM grup yonetimi'],
  ['.o101-rule-overlay', 'Okey 101 kurallar'],
  ['.o101-editor', 'Okey 101 per duzenleme'],
  ['.o101-processing', 'Okey 101 tas islemleri']
];

for (const [selector, title] of v210Cases) {
  const t = setup();
  const modal = t.make(selector);

  modal.closeButton = t.make(title + '-close');
  modal.closeButton.click = () =>
    t.elements.delete(selector);

  t.elements.set(selector, modal);

  // Oda aciksa geri tusu sesli odayi korumali.
  if (selector.startsWith('.o101-')) {
    t.elements.set(
      '#erisRoomSurface.show',
      t.make('active-room')
    );
  }

  assert.equal(t.back(), true, title);
  assert.equal(t.elements.has(selector), false, title);
  assert.equal(t.getExits(), 0, title);

  if (selector.startsWith('.o101-')) {
    assert.equal(
      t.elements.has('#erisRoomSurface.show'),
      true,
      title + ': oda korunmali'
    );
  }

  console.log('PASS: ' + title);
}


// UNO: geri tusu tehlikeli islemleri onaylamamali.
const unoCases = [
  ['.uno-confirm [data-uno-action="cancel-close"]',
   'UNO masa kapatma onayindan vazgec'],
  ['.uno-info-overlay [data-uno-action="rules"], .uno-info-overlay [data-uno-action="reveal"]',
   'UNO bilgi penceresini kapat'],
  ['.uno-color-picker [data-uno-action="cancel-card"]',
   'UNO kart seciminden vazgec']
];

for (const [selector, title] of unoCases) {
  const t = setup();
  const root = t.make('.uno-root');
  let cancelled = 0;

  root.querySelector = q => {
    if (q !== selector) return null;
    return {
      disabled: false,
      click() { cancelled++; }
    };
  };

  t.elements.set('.uno-root', root);
  t.elements.set(
    '#erisRoomSurface.show',
    t.make('active-room')
  );

  assert.equal(t.back(), true, title);
  assert.equal(cancelled, 1, title);
  assert.equal(t.getExits(), 0, title);
  assert.equal(
    t.elements.has('#erisRoomSurface.show'),
    true,
    title + ': sesli oda korunmali'
  );

  console.log('PASS: ' + title);
}

// DM: silme ve islem onaylari iptal edilmeli.
{
  const t = setup();
  const modal = t.make('.dm-vault-modal');
  let cancelled = 0;
  let confirmed = 0;

  modal.querySelector = selector => {
    if (selector === '[aria-label="Kapat"]') {
      return {
        disabled: false,
        click() { cancelled++; }
      };
    }
    if (selector === '[data-yes]') {
      return {
        disabled: false,
        click() { confirmed++; }
      };
    }
    return null;
  };

  t.elements.set('.dm-vault-modal', modal);

  assert.equal(t.back(), true);
  assert.equal(cancelled, 1);
  assert.equal(confirmed, 0);
  assert.equal(t.getExits(), 0);

  console.log('PASS: DM silme onayi guvenli iptal.');
}


// V215_STACK_TESTS

// DM: onay penceresi once kapanmali.
{
  const t = setup();
  const actions = t.make('.dm-action-panel');
  const confirm = t.make('.dm-vault-modal');
  let approved = 0;

  confirm.querySelector = selector => {
    if (selector === '[aria-label="Kapat"]') {
      return {
        disabled: false,
        click() {
          t.elements.delete('.dm-vault-modal');
        }
      };
    }
    if (selector === '[data-yes]') {
      return {
        disabled: false,
        click() { approved++; }
      };
    }
    return null;
  };

  actions.closeButton = {
    disabled: false,
    click() {
      t.elements.delete('.dm-action-panel');
    }
  };

  t.elements.set('.dm-action-panel', actions);
  t.elements.set('.dm-vault-modal', confirm);

  assert.equal(t.back(), true);
  assert.equal(t.elements.has('.dm-vault-modal'), false);
  assert.equal(t.elements.has('.dm-action-panel'), true);
  assert.equal(approved, 0);

  assert.equal(t.back(), true);
  assert.equal(t.elements.has('.dm-action-panel'), false);

  console.log('PASS: DM onay ve mesaj menusu sirasi.');
}

// Odeme: en son acilan pencere once kapanmali.
{
  const t = setup();
  const first = t.make('payment-first');
  const second = t.make('payment-second');

  first.closeButton = {
    disabled: false,
    click() {
      t.elements.set('.pa-overlay', []);
    }
  };

  second.closeButton = {
    disabled: false,
    click() {
      t.elements.set('.pa-overlay', [first]);
    }
  };

  t.elements.set('.pa-overlay', [first, second]);

  assert.equal(t.back(), true);
  assert.equal(t.elements.get('.pa-overlay').length, 1);
  assert.equal(t.elements.get('.pa-overlay')[0], first);

  assert.equal(t.back(), true);
  assert.equal(t.elements.get('.pa-overlay').length, 0);

  console.log('PASS: Odeme pencereleri sirayla kapaniyor.');
}

// Magaza: satin alma onayi once iptal edilmeli.
{
  const t = setup();
  const preview = t.make('#shop800preview');
  const confirm = t.make('.shop-buy-confirm');
  let purchased = 0;

  confirm.querySelector = selector => {
    if (selector.includes('[data-cancel]')) {
      return {
        disabled: false,
        click() {
          t.elements.delete('.shop-buy-confirm');
        }
      };
    }
    if (selector === '[data-buy]') {
      return {
        disabled: false,
        click() { purchased++; }
      };
    }
    return null;
  };

  preview.closeButton = {
    disabled: false,
    click() {
      t.elements.delete('#shop800preview');
    }
  };

  t.elements.set('#shop800preview', preview);
  t.elements.set('.shop-buy-confirm', confirm);

  assert.equal(t.back(), true);
  assert.equal(t.elements.has('.shop-buy-confirm'), false);
  assert.equal(t.elements.has('#shop800preview'), true);
  assert.equal(purchased, 0);

  assert.equal(t.back(), true);
  assert.equal(t.elements.has('#shop800preview'), false);

  console.log('PASS: Magaza satin alma onayi once kapanir.');
}

console.log('37 navigasyon testi basarili.');
