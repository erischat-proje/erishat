const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const base=path.resolve(__dirname,'../frontend'),errors=[];
 const browser=await chromium.launch({executablePath:process.env.ERIS_CHROME,headless:true,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-software-rasterizer','--disable-gpu-compositing','--use-gl=disabled']});
 const page=await browser.newPage({userAgent:'ErisChatAndroid/1.0',reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());if(u.origin!=='http://eris.test')return r.abort();
  if(u.pathname==='/')return r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html data-eris-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body></body></html>'});
  const f=path.join(base,u.pathname);if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
  return r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.png')?'image/png':'text/html'});
 });
 await page.goto('http://eris.test/');
 const main=fs.readFileSync(base+'/erischat-main.html','utf8');
 for(const m of main.matchAll(/<link[^>]*href="\.\/([^"?]+\.css)[^"]*"/g))await page.addStyleTag({url:'http://eris.test/'+m[1]});
 await page.evaluate(()=>{
  window.AudioContext=window.webkitAudioContext=undefined;window.mode='normal';window.HasanSound={create:()=>({enabled:true,play(){},stop(){},close(){},unlock(){},mute(on){this.enabled=on;}})};
  window.LidyaGameRanking={open(){},close(){}};
  window.ErisBalikciTest={api:async p=>{
   if(p==='/rules')return {paytable:Array(10).fill([1,2,3]),lines:Array(10).fill([0,0,0,0,0]),bonus_cost:100};
   if(p==='/active')return {balance:1000000,state:mode==='bonus'?{stake:10000,remaining:4,total_payout:90000,collected:5,multiplier:2,finished:false}:null};
   const board=Array.from({length:15},(_,i)=>({s:i%9,v:2}));board[0]={s:11};board[7]={s:9,v:5};
   return {balance:1000250,payout:250,state:{stake:50,remaining:0,total_payout:250,collected:1,multiplier:1,finished:true},result:{initialBoard:board,board,lineWins:[],fishermen:[0],fish:[{index:7,value:5}],fishSum:5,multiplier:1,collectedBefore:0,collected:1,nextMultiplier:1,thresholds:[],extraSpins:0,dynamite:[]}};
  }};
 });
 for(const name of ['games/slot-stakes.js','games/balikci-stakes.js','games/nonroom-standard.js','games/viewport-fit.js','games/slot-buy-ui.js','games/balikci.js'])await page.addScriptTag({url:'http://eris.test/'+name});
 let count=0;
 for(const mode of ['normal','bonus'])for(const skin of ['light','dark'])for(const [width,height]of [[320,568],[393,820],[412,915],[844,390],[1440,900]]){
  await page.setViewportSize({width,height});await page.evaluate(({mode,skin})=>{window.mode=mode;document.documentElement.dataset.erisTheme=skin;ErisGameBalikci.open();},{mode,skin});
  await page.waitForFunction(()=>!document.querySelector('#erisBalikciModal [data-spin]').disabled);await page.waitForTimeout(80);
  const info=await page.locator('#erisBalikciModal').evaluate(el=>{const r=el.getBoundingClientRect(),shell=el.querySelector('.fh-shell'),s=shell.getBoundingClientRect(),title=el.querySelector('.fh-title'),canvas=el.querySelector('canvas'),c=canvas.getBoundingClientRect(),wrap=el.querySelector('.fh-canvas-wrap').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,sx:s.x,sy:s.y,sw:s.width,sh:s.height,overflow:shell.scrollWidth-shell.clientWidth,shadow:getComputedStyle(shell).boxShadow,art:el.querySelector('img[data-actor]').src,canvas:[c.width,c.height],contained:c.x>=wrap.x-1&&c.right<=wrap.right+1};});
  console.log(mode,skin,width,height,info.canvas);
  assert.deepEqual([info.x,info.y,info.w,info.h,info.sx,info.sy,info.sw,info.sh],[0,0,width,height,0,0,width,height]);assert(info.overflow<=1);assert.equal(info.shadow,'none');assert(info.art.includes('/actor-final/'+skin+'/idle.png'));assert(info.contained);assert(info.canvas[0]>100);assert(Math.abs(info.canvas[0]/info.canvas[1]-5/3)<.03);
  await page.evaluate(async skin=>{for(const pose of ['idle','cast','reel','celebrate']){const image=new Image();image.src='http://eris.test/assets/lidya-balikci/actor-final/'+skin+'/'+pose+'.png';await image.decode();}},skin);
  if(width===393){fs.mkdirSync('/tmp/hasan-final-qa',{recursive:true});await page.screenshot({path:'/tmp/hasan-final-qa/'+skin+'-'+mode+'.png'});}
  if(mode==='normal'){
   await page.locator('[data-buy]').click();assert(await page.locator('[data-buy-sheet]').isVisible());await page.locator('[data-buy-cancel]').click();
  }else assert(await page.locator('[data-minus]').isDisabled());
  await page.locator('[data-rules]').click();assert(await page.locator('[data-rules-sheet]').isVisible());await page.locator('[data-rules-close]').click();
  await page.locator('[data-sound]').scrollIntoViewIfNeeded();assert(await page.locator('[data-sound]').isVisible());
  await page.locator('[data-close]').click();count++;
 }
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:393,height:820});await page.evaluate(()=>{mode='normal';document.documentElement.dataset.erisTheme='light';ErisGameBalikci.open();});await page.waitForFunction(()=>!document.querySelector('[data-spin]').disabled);
 await page.evaluate(()=>document.documentElement.dataset.erisTheme='dark');await page.waitForTimeout(60);assert((await page.locator('img[data-actor]').getAttribute('src')).includes('/actor-final/dark/idle.png'));assert.equal(await page.locator('.fh-title .fh-host').count(),1);
 await page.evaluate(()=>{window.poses=[];new MutationObserver(()=>poses.push({pose:document.querySelector('#erisBalikciModal').dataset.actor,src:document.querySelector('img[data-actor]').src})).observe(document.querySelector('#erisBalikciModal'),{attributes:true,attributeFilter:['data-actor']});});
 await page.locator('[data-spin]').click();await page.waitForFunction(()=>document.querySelector('#erisBalikciModal').dataset.phase==='result');assert.equal(await page.locator('[data-total]').textContent(),'250');
 const trace=await page.evaluate(()=>poses);for(const pose of ['cast','reel','celebrate'])assert(trace.some(x=>x.pose===pose&&x.src.includes('/actor-final/dark/'+pose+'.png')));
 await page.locator('[data-close]').click();assert.equal(await page.locator('#erisBalikciModal').count(),0);await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{
  const original=ErisBalikciTest.api;window.purchaseBalance=100000;window.purchaseState=null;window.purchaseCalls=[];
  ErisBalikciTest.api=async(p,o)=>{
   if(p==='/active')return {balance:purchaseBalance,state:purchaseState};
   if(p==='/rules')return {...await original(p,o),buy_spins:10};
   const body=JSON.parse(o.body);purchaseCalls.push(body);await new Promise(r=>setTimeout(r,60));
   if(body.action!=='buy')throw Error('Test expected purchase only');
   purchaseBalance-=body.stake*100;purchaseState={stake:body.stake,remaining:10,total_payout:0,collected:0,multiplier:1,finished:false};
   return {balance:purchaseBalance,payout:0,charge:body.stake*100,state:purchaseState,result:null};
  };ErisGameBalikci.open();
 });
 await page.waitForFunction(()=>!document.querySelector('[data-buy]').disabled);
 assert((await page.locator('[data-buy]').textContent()).includes('10 ÜCRETSİZ DÖNÜŞ SATIN AL'));
 await page.locator('[data-buy]').click();assert.equal(await page.locator('[data-selected-stake]').textContent(),'50');assert.equal(await page.locator('[data-after-buy]').textContent(),'95.000');
 await page.locator('[data-buy-cancel]').click();assert.equal(await page.evaluate(()=>purchaseCalls.length),0);
 await page.locator('[data-buy]').click();await page.locator('[data-buy-confirm]').evaluate(el=>{el.click();el.click();});
 await page.waitForFunction(()=>document.querySelector('[data-free]').textContent==='10'&&!document.querySelector('[data-spin]').disabled);
 await page.locator('[data-auto]').click();assert.equal(await page.evaluate(()=>purchaseCalls.length),1);assert.equal(await page.evaluate(()=>purchaseBalance),95000);assert(await page.locator('[data-buy]').isDisabled());
 await page.locator('[data-close]').click();await page.evaluate(()=>{purchaseState=null;purchaseBalance=1000;ErisGameBalikci.open();});
 await page.waitForFunction(()=>!document.querySelector('[data-spin]').disabled);assert(await page.locator('[data-buy]').isDisabled());assert.equal(await page.evaluate(()=>purchaseCalls.length),1);await page.locator('[data-close]').click();
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: '+count+' full-window normal/resumed-bonus layouts; eight themed actor PNGs, live theme switch, fishing collection poses, correct payout, overlays, cancel/no charge, double-confirm/one debit, 10 purchased spins, bonus lock and insufficient balance.');
})().catch(e=>{console.error(e);process.exit(1)});
