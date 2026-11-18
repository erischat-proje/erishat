const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  'frontend/room-rtc-live.js', 'utf8'
);

function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' bulunamadi');
  const opening = source.indexOf('{', start);
  let depth = 0;
  for (let i = opening; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(name + ' fonksiyonu eksik');
}

const health = vm.runInNewContext(
  extract('hasLiveRemoteAudio') +
  '\nhasLiveRemoteAudio'
);

const pc = (tracks) => ({
  getReceivers: () => tracks.map(track => ({ track }))
});

test('Canli ses izi saglikli kabul edilir', () => {
  assert.equal(health(pc([
    { kind: 'audio', readyState: 'live', muted: true }
  ])), true);
});

test('Ses izi bulunmazsa sagliksiz kabul edilir', () => {
  assert.equal(health(pc([])), false);
});

test('Kapanmis ses izi sagliksiz kabul edilir', () => {
  assert.equal(health(pc([
    { kind: 'audio', readyState: 'ended' }
  ])), false);
});

test('Video izi ses yerine gecmez', () => {
  assert.equal(health(pc([
    { kind: 'video', readyState: 'live' }
  ])), false);
});

test('Receiver hatasi guvenli ele alinir', () => {
  assert.equal(health({
    getReceivers() { throw Error('receiver failed'); }
  }), false);
});

test('Ag kurtarma saglikli peer icin teklif olusturmaz', () => {
  let offers = 0;
  const peer = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    signalingState: 'stable',
    getReceivers: () => [{
      track: {kind: 'audio', readyState: 'live'}
    }]
  };
  const context = {
    currentRoom: () => 'room1',
    socket: () => ({readyState: 1}),
    WebSocket: {OPEN: 1},
    resumeRoomAudio: () => Promise.resolve(),
    known: new Set(['other']),
    peers: new Map([['other', peer]]),
    hasLiveRemoteAudio: health,
    shouldInitiate: () => true,
    offer: () => {offers++; return Promise.resolve()},
    signal: () => true,
    checkMicrophoneSeat: () => {},
    networkRecoveryAt: new Map(),
    NETWORK_RECOVERY_COOLDOWN: 5000
  };
  vm.runInNewContext(
    extract('recoverNetwork') + '\nrecoverNetwork()',
    context
  );
  assert.equal(offers, 0);
});

test('Eksik ses izi icin yeniden baglanti istenir', () => {
  let offers = 0;
  const peer = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    signalingState: 'stable',
    getReceivers: () => []
  };
  const context = {
    currentRoom: () => 'room1',
    socket: () => ({readyState: 1}),
    WebSocket: {OPEN: 1},
    resumeRoomAudio: () => Promise.resolve(),
    known: new Set(['other']),
    peers: new Map([['other', peer]]),
    hasLiveRemoteAudio: health,
    shouldInitiate: () => true,
    offer: () => {offers++; return Promise.resolve()},
    signal: () => true,
    checkMicrophoneSeat: () => {},
    networkRecoveryAt: new Map(),
    NETWORK_RECOVERY_COOLDOWN: 5000
  };
  vm.runInNewContext(
    extract('recoverNetwork') + '\nrecoverNetwork()',
    context
  );
  assert.equal(offers, 1);
});
