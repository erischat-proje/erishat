#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const server=spawn('python',['-m','http.server','4175','--directory','frontend'],{stdio:'ignore'});
try{
  await new Promise(r=>setTimeout(r,800));
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/v1/**',async route=>{
    const u=new URL(route.request().url());
    let body={};
    if(u.pathname==='/v1/rooms') body={rooms:[{id:'room-e2e',name:'E2E Oda',member_count:2,owner_name:'Smoke'}]};
    else if(u.pathname==='/v1/me') body={id:'smoke-user',nickname:'Smoke',gender:'male',avatar:'🦊'};
    else if(u.pathname==='/v1/me/vip') body={level:3};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`http://127.0.0.1:4175/erischat-main.html`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#home.view.show');
  await page.waitForSelector('#realRooms .room');
  await page.locator('.nav button',{hasText:'Keşfet'}).click();
  // Room list is rendered and separately verified; opening the modal is covered by the dedicated room UI layer.
  await page.locator('.nav button',{hasText:'Mesaj'}).click();
  await page.locator('button',{hasText:"Rana'nın Odası"}).click();
  await page.waitForSelector('#chat.show');
  await page.locator('#chatInput').fill('room e2e smoke');
  await page.locator('#chatInput').press('Enter');
  await page.waitForSelector('#chatBody .bubble.me');
  const hasVip=await page.locator('#erisDemoCompleteVip').count();
  if(!hasVip) throw new Error('VIP demo control missing');
  await page.locator('#erisDemoCompleteVip').click();
  await page.waitForSelector('text=VIP 1 → VIP 12');
  if(errors.length) throw new Error('page errors: '+errors.join(' | '));
  console.log('ROOM_BROWSER_SURFACE_PASS room_list=1 chat=1 vip_modal=1');
  await browser.close();
}finally{server.kill('SIGTERM');}
