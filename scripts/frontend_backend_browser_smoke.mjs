#!/usr/bin/env node
import { chromium } from 'playwright';

const API='http://127.0.0.1:8000/v1';
const pageUrl='http://127.0.0.1:4175/erischat-main.html';

async function main(){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(api=>{window.ERIS_API=api;},API);
  await page.goto(pageUrl,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.ErisAuth?.getToken);
  await page.waitForFunction(()=>!!window.ErisAuth?.user,{timeout:15000}).catch(async()=>{ throw new Error('anonymous auth timeout; token='+await page.evaluate(()=>localStorage.getItem('erischat_access_token')?'present':'missing')+' auth='+await page.evaluate(()=>JSON.stringify({keys:Object.keys(window.ErisAuth||{}),user:window.ErisAuth?.user||null}))); });
  const owner=await page.evaluate(()=>window.ErisAuth.user);
  if(!owner?.id) throw new Error('anonymous browser session missing user');
  await page.locator('.nav button',{hasText:'Profil'}).click();
  await page.waitForFunction(()=>document.querySelector('#profile')?.classList.contains('show'));
  await page.waitForFunction(expected => document.querySelector('.profile .name h2')?.textContent === expected.nickname, owner);
  const member=await page.evaluate(async api=>{
    const suffix=Math.random().toString(36).slice(2,8);
    const r=await fetch(api+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'Browser_'+suffix,avatar:'🐺',gender:'male'})});
    return r.json();
  },API);
  if(!member?.user?.id||!member?.access_token) throw new Error('second browser user registration failed');
  const dm=await page.evaluate(async ({api,id})=>{
    const r=await fetch(api+'/conversations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('erischat_access_token')},body:JSON.stringify({participant_id:id})});
    return {status:r.status,data:await r.json()};
  },{api:API,id:member.user.id});
  if(dm.status!==201&&dm.status!==200) throw new Error('conversation create failed: '+JSON.stringify(dm));
  const conversationId=dm.data?.id||dm.data?.conversation_id||dm.data?.conversation?.id;
  if(!conversationId) throw new Error('conversation id missing');
  await page.locator('.nav button',{hasText:'Mesaj'}).click();
  await page.evaluate(({id,name})=>window.ErisChatDM.open(id,name,'🐺'),{id:conversationId,name:member.user.nickname});
  await page.waitForSelector('#chat.show');
  await page.locator('#chatInput').fill('browser backend dm smoke');
  await page.locator('#chatInput').press('Enter');
  await page.waitForSelector('#chatBody .bubble.me');
  const dmVisible=await page.locator('#chatBody .bubble.me').count();
  if(dmVisible<1) throw new Error('DM bubble did not render');
  const family=await page.evaluate(async api=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const cr=await fetch(api+'/families',{method:'POST',headers:h,body:JSON.stringify({name:'Browser Smoke Ailesi'})});
    const created=await cr.json();
    const id=created.id;
    const detail=await fetch(api+'/families/'+encodeURIComponent(id),{headers:h}).then(r=>r.json());
    const donation=await fetch(api+'/families/'+encodeURIComponent(id)+'/donate',{method:'POST',headers:h,body:JSON.stringify({amount:40000})}).then(r=>r.json());
    const chat=await fetch(api+'/families/'+encodeURIComponent(id)+'/chat',{headers:h}).then(r=>r.json());
    return {create:cr.status,id,detail,donation,chat};
  },API);
  if(family.create!==201||!family.id||family.detail?.id!==family.id||Number(family.donation?.balance)!==40000||Number(family.donation?.level)!==2) throw new Error('family browser backend chain failed: '+JSON.stringify(family));
  await page.locator('#erisDemoCompleteVip').click();
  await page.waitForSelector('text=VIP seviyeleri ve cinsiyet ödülleri');
  const vipRows=await page.locator('text=/VIP 1/').count();
  if(vipRows<1) throw new Error('VIP reward matrix did not render');
  await page.locator('[data-close]').last().click();
  await page.locator('#erisDemoCompleteCheck').click();
  await page.waitForSelector('text=Müşteri demo kontrol listesi');
  await page.locator('[data-close]').last().click();
  if(errors.length) throw new Error('page errors: '+errors.join(' | '));
  await browser.close();
  console.log('FRONTEND_BACKEND_BROWSER_SMOKE_PASS anonymous=1 profile=1 dm=1 family=1');
}
main().catch(async e=>{console.error(e.stack||e);process.exit(1);});
