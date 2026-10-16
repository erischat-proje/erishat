#!/usr/bin/env node
import { chromium } from 'playwright';

const API = 'http://127.0.0.1:8000/v1';
const PAGE = 'http://127.0.0.1:4175/erischat-main.html';

async function jsonFetch(api, path, options = {}) {
  const response = await fetch(api + path, options);
  let data = null;
  try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(api => { window.ERIS_API = api; }, API);
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.ErisAuth?.user, { timeout: 15000 });

  const token = await page.evaluate(() => localStorage.getItem('erischat_access_token'));
  if (!token) throw new Error('anonymous session token missing');
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const vip0 = await jsonFetch(API, '/me/vip', { headers: auth });
  if (vip0.status !== 200 || vip0.data?.level !== 0 || vip0.data?.current_level_spent !== 0) {
    throw new Error('fresh VIP state was not level 0: ' + JSON.stringify(vip0));
  }

  const catalog = await jsonFetch(API, '/cosmetics', { headers: auth });
  const standard = (catalog.data?.items || []).filter(x => !x.vip && x.type === 'avatar');
  if (standard.length < 15) throw new Error('not enough standard avatars for deterministic VIP lifecycle');

  const purchase = async item => jsonFetch(API, '/me/cosmetics/purchase', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ cosmetic_type: item.type, asset_key: item.asset_key })
  });

  const first = await purchase(standard[0]);
  if (![200, 201].includes(first.status) || first.data?.level !== 1 || first.data?.total_spent !== 1000) {
    throw new Error('VIP1 transition failed: ' + JSON.stringify(first));
  }

  const vip1Asset = (catalog.data.items || []).find(x => x.vip && x.vip_level === 1 && x.type === 'avatar');
  if (!vip1Asset) throw new Error('VIP1 avatar asset missing');
  const unlock1 = await jsonFetch(API, '/me/cosmetics/apply', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ cosmetic_type: 'avatar', asset_key: vip1Asset.asset_key })
  });
  if (unlock1.status !== 200 || unlock1.data?.vip_level !== 1) {
    throw new Error('VIP1 unlock/apply failed: ' + JSON.stringify(unlock1));
  }

  for (let i = 1; i < 5; i++) {
    const result = await purchase(standard[i]);
    if (![200, 201].includes(result.status)) throw new Error('VIP2 purchase failed: ' + JSON.stringify(result));
  }
  const vip2 = await jsonFetch(API, '/me/vip', { headers: auth });
  if (vip2.data?.level !== 2 || vip2.data?.total_spent !== 5000 || vip2.data?.current_level_spent !== 5000) {
    throw new Error('VIP2 threshold transition failed: ' + JSON.stringify(vip2));
  }

  for (let i = 5; i < 15; i++) {
    const result = await purchase(standard[i]);
    if (![200, 201].includes(result.status)) throw new Error('VIP3 purchase failed: ' + JSON.stringify(result));
  }
  const vip3 = await jsonFetch(API, '/me/vip', { headers: auth });
  if (vip3.data?.level !== 3 || vip3.data?.total_spent !== 15000 || vip3.data?.current_level_spent !== 15000) {
    throw new Error('VIP3 threshold transition failed: ' + JSON.stringify(vip3));
  }

  const vip3Asset = (catalog.data.items || []).find(x => x.vip && x.vip_level === 3 && x.type === 'avatar');
  if (!vip3Asset) throw new Error('VIP3 avatar asset missing');
  const unlock3 = await jsonFetch(API, '/me/cosmetics/apply', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ cosmetic_type: 'avatar', asset_key: vip3Asset.asset_key })
  });
  if (unlock3.status !== 200 || unlock3.data?.vip_level !== 3) {
    throw new Error('VIP3 unlock/apply failed: ' + JSON.stringify(unlock3));
  }

  const finalMe = await jsonFetch(API, '/me', { headers: auth });
  if (finalMe.status !== 200 || finalMe.data?.avatar_asset !== vip3Asset.asset_key) {
    throw new Error('VIP3 avatar read-back failed: ' + JSON.stringify(finalMe));
  }

  console.log(JSON.stringify({
    ok: true,
    lifecycle: [
      { level: 0, spent: 0 },
      { level: 1, spent: 1000, currentLevelSpent: 1000, unlock: 'vip1-avatar' },
      { level: 2, spent: 5000, currentLevelSpent: 5000 },
      { level: 3, spent: 15000, currentLevelSpent: 15000, unlock: 'vip3-avatar' }
    ],
    totalStandardPurchases: 15
  }, null, 2));
  await browser.close();
}

main().catch(async error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
