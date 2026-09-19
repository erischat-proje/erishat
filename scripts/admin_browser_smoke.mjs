#!/usr/bin/env node
import fs from 'node:fs';
import { chromium } from 'playwright';

const API = process.env.ERISCHAT_SMOKE_BASE_URL || 'http://127.0.0.1:8000';
const PAGE = process.env.ERISCHAT_SMOKE_PAGE_URL || 'http://127.0.0.1:4175/erischat-main.html';
const fixturePath = process.env.ERISCHAT_ADMIN_SMOKE_FIXTURE || '.smoke-admin.json';

if (!fs.existsSync(fixturePath)) throw new Error('admin smoke fixture missing: '+fixturePath);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!fixture.da_token || !fixture.target_user_id) throw new Error('admin smoke fixture incomplete');

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', async dialog => {
  if (dialog.type() === 'prompt' && dialog.message().includes('Kullanıcı ID')) return dialog.accept(String(fixture.target_user_id));
  return dialog.dismiss();
});
await page.addInitScript(({api, token}) => {
  window.ERIS_API = api;
  window.ERISCHAT_API_BASE = api.replace(/\/v1$/, '');
  localStorage.setItem('erischat_access_token', token);
  localStorage.setItem('erischat.accessToken.v1', token);
}, {api: API, token: fixture.da_token});
await page.goto(PAGE, {waitUntil:'domcontentloaded'});
await page.waitForTimeout(1200);

const adminButton = page.locator('.eris-admin-btn');
await adminButton.waitFor({state:'visible', timeout:10000});
await adminButton.click();
await page.locator('.eris-admin-panel').waitFor({state:'visible', timeout:5000});

const header = await page.locator('.eris-admin-panel h2').textContent();
if (!header?.includes('Yönetim Merkezi')) throw new Error('admin panel header missing');
const roleCard = await page.locator('.eris-admin-card').first().textContent();
if (!roleCard?.includes('[DA]')) throw new Error('DA role not rendered in admin UI: '+roleCard);

await page.locator('.eris-admin-panel button[data-a="lookup"]').click();
await page.waitForFunction(() => document.querySelector('.eris-admin-panel h3')?.textContent?.includes('ID Sorgu'), null, {timeout:5000}).catch(()=>{});
const bodyText = await page.locator('.eris-admin-panel').textContent();
if (!bodyText.includes('ID Sorgu')) throw new Error('DA lookup action did not open');
await page.locator('#eaBack').click();
await page.waitForTimeout(100);
await page.locator('.eris-admin-btn').click();

await page.locator('.eris-admin-panel button[data-a="roles"]').click();
await rolesPage.waitForFunction(() => document.querySelector('.eris-admin-panel h3')?.textContent?.includes('Yönetici Yetkileri'), null, {timeout:5000}).catch(()=>{});
const rolesText = await page.locator('.eris-admin-panel').textContent();
if (!rolesText.includes('SA') || !rolesText.includes('UA') || !rolesText.includes('DA')) throw new Error('role matrix missing from DA admin UI');

const enforcement = await page.evaluate(async ({api, targetId}) => {
  const token = localStorage.getItem('erischat_access_token');
  const h = {Authorization:'Bearer '+token, 'Content-Type':'application/json'};
  const deniedSelf = await fetch(api+'/v1/admin/users/'+encodeURIComponent(targetId)+'/lidya/add', {
    method:'POST', headers:h, body:JSON.stringify({amount:1})
  });
  return {status:deniedSelf.status};
}, {api: API.replace(/\/$/, ''), targetId: fixture.target_user_id});
if (enforcement.status !== 200) throw new Error('DA backend enforcement smoke failed: '+JSON.stringify(enforcement));

if (errors.length) throw new Error('page errors: '+errors.join(' | '));
await browser.close();
fs.rmSync(fixturePath, {force:true});
console.log('ADMIN_BROWSER_SMOKE_PASS da_ui=1 role_matrix=1 backend_enforcement=1');
