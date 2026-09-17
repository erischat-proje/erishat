#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const port = 4173;
const server = spawn('python', ['-m', 'http.server', String(port), '--directory', 'frontend'], { stdio: 'ignore' });

try {
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**/v1/**', async route => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/rooms')
      ? { rooms: [{ id: 'browser-room-1', name: 'Browser Smoke Room', member_count: 3, owner_name: 'Smoke' }] }
      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`http://127.0.0.1:${port}/erischat-main.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#home.view.show');
  await page.waitForSelector('#realRooms .room');

  for (const label of ['Mağaza', 'Profil', 'Keşfet']) {
    await page.locator('.nav button', { hasText: label }).click();
  }
  await page.waitForSelector('#explore.view.show');

  await page.locator('.nav button', { hasText: 'Mesaj' }).click();
  await page.locator('button', { hasText: "Rana'nın Odası" }).click();
  await page.waitForSelector('#chat.show');
  await page.locator('#chatInput').fill('browser smoke');
  await page.locator('#chatInput').press('Enter');
  await page.waitForSelector('#chatBody .bubble.me');

  if (errors.length) throw new Error('browser page errors: ' + errors.join(' | '));
  console.log('FRONTEND_BROWSER_SMOKE_PASS navigation=shop,profile,explore room_list=1 chat_send=1');
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
