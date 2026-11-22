const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  'frontend/auth-live.js', 'utf8'
);

const start = source.indexOf("  let lidyaPushToken = '';");
const end = source.indexOf(
  "  window.addEventListener('lidyachat:fcm-token'",
  start
);

assert.ok(start >= 0 && end > start,
  'Firebase lifecycle kodu bulunamadi');

const lifecycle = source.slice(start, end);

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
}

function setup(fetchMock) {
  let currentToken = 'session-user-a';

  const sandbox = {
    window: {
      ErisAuth: {user: {id: 'user-a'}},
      ErisChatAndroid: {}
    },
    API: () => 'https://example.test/v1',
    getToken: () => currentToken,
    switchPending: false,
    logoutPending: false,
    AbortSignal,
    fetch: fetchMock
  };

  vm.runInNewContext(
    lifecycle + `
      globalThis.pushTest = {
        register: lidyaPushRegister,
        unregister: lidyaPushUnregister,
        transition: () => {
          lidyaPushTransitioning = true;
        },
        setDeviceToken: token => {
          lidyaPushToken = token;
        },
        pending: () => lidyaPushPending
      };
    `,
    sandbox
  );

  return sandbox;
}

test('Kayit istekleri sirayla calisir', async () => {
  const first = deferred();
  const calls = [];

  const env = setup((url, options) => {
    calls.push(options);
    if (calls.length === 1) return first.promise;
    return Promise.resolve({ok: true});
  });

  const a = env.pushTest.register('device-token-A');
  const b = env.pushTest.register('device-token-B');

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);

  first.resolve({ok: true});
  await Promise.all([a, b]);

  assert.equal(calls.length, 2);
  assert.equal(
    JSON.parse(calls[0].body).token,
    'device-token-A'
  );
  assert.equal(
    JSON.parse(calls[1].body).token,
    'device-token-B'
  );
});

test('Kayit bitmeden cihaz silinmez', async () => {
  const first = deferred();
  const calls = [];

  const env = setup((url, options) => {
    calls.push(options);
    if (options.method === 'POST') return first.promise;
    return Promise.resolve({ok: true});
  });

  env.pushTest.setDeviceToken('device-token-A');

  const registration =
    env.pushTest.register('device-token-A');

  await new Promise(resolve => setImmediate(resolve));

  const removal =
    env.pushTest.unregister('session-user-a');

  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');

  first.resolve({ok: true});
  await Promise.all([registration, removal]);

  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, 'DELETE');
});

test('Hesap gecisi yeni kaydi engeller', async () => {
  const calls = [];

  const env = setup((url, options) => {
    calls.push(options);
    return Promise.resolve({ok: true});
  });

  env.pushTest.transition();

  await env.pushTest.register('device-token-A');

  assert.equal(calls.length, 0);
});

test('Bekleyen ikinci kayit geciste iptal edilir', async () => {
  const first = deferred();
  const calls = [];

  const env = setup((url, options) => {
    calls.push(options);
    return first.promise;
  });

  const a = env.pushTest.register('device-token-A');
  const b = env.pushTest.register('device-token-B');

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);

  env.pushTest.transition();
  first.resolve({ok: true});

  await Promise.all([a, b]);

  assert.equal(calls.length, 1);
});
