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

console.log('5 navigasyon testi basarili.');
