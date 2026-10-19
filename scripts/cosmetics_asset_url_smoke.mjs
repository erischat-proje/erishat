import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('frontend/cosmetics.js', 'utf8');
const window = { addEventListener() {} };
const document = {
  readyState: 'loading',
  baseURI: 'https://semihvarolymk-png.github.io/erischat/',
  addEventListener() {},
};
const localStorage = { getItem() { return ''; } };
const context = {
  window,
  document,
  localStorage,
  console,
  fetch: async () => { throw new Error('fetch must not run in URL smoke'); },
  Headers,
  URL,
  CustomEvent: class CustomEvent {},
};
vm.runInNewContext(source, context, { filename: 'frontend/cosmetics.js' });

const assetUrl = window.ErisChatCosmetics?.assetUrl;
if (typeof assetUrl !== 'function') throw new Error('assetUrl export missing');

const cases = [
  ['standartcerceve/#U00fc.png', 'Gereken_icerikler/standartcerceve/%23U00fc.png'],
  ['standartcerceve/#U011f.png', 'Gereken_icerikler/standartcerceve/%23U011f.png'],
  ['kadınavatar/kadin_avatar_06_ULTRA_HD_CLEAN.jpg', 'Gereken_icerikler/kad%C4%B1navatar/kadin_avatar_06_ULTRA_HD_CLEAN.jpg'],
  ['./Gereken_icerikler/vipkadınavatar/x.jpg', 'Gereken_icerikler/vipkad%C4%B1navatar/x.jpg'],
];

for (const [input, expectedPath] of cases) {
  const actual = new URL(assetUrl(input));
  if (actual.pathname !== `/erischat/${expectedPath}`) {
    throw new Error(`asset URL mismatch: ${input} -> ${actual.pathname}; expected /erischat/${expectedPath}`);
  }
}

console.log(`Cosmetic asset URL smoke OK (${cases.length} encoded path cases)`);
