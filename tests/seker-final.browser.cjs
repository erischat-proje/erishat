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
  window.AudioContext=window.webkitAudioContext=undefined;window.mode='normal';
  window.LidyaGameRanking={open(){},close(){}};
  window.ErisSekerTest={api:async p=>{
   if(p==='/rules')return {paytable:Array(9).fill([1,2,3]),rtp_status:'calibration-pending'};
   if(p==='/active')return {balance:1000000,state:mode==='bonus'?{stake:10000,remaining:4,total_payout:90000,ante:false,finished:false}:null};
   return {balance:1000100,payout:100,state:{stake:50,remaining:0,total_payout:100,finished:true},result:{steps:[{board:Array.from({length:30},(_,i)=>({s:i%9})),removed:[],winHundredths:0,terminal:true}],multipliers:[],rawHundredths:0,applied:1}};
  }};
 });
 for(const name of ['games/slot-stakes.js','games/seker-stakes.js','games/nonroom-standard.js','games/viewport-fit.js','games/seker.js'])await page.addScriptTag({url:'http://eris.test/'+name});
 let count=0;
 for(const mode of ['normal','bonus'])for(const skin of ['light','dark'])for(const [width,height]of [[320,568],[393,820],[412,915],[844,390],[1440,900]]){
  await page.setViewportSize({width,height});await page.evaluate(({mode,skin})=>{window.mode=mode;document.documentElement.dataset.erisTheme=skin;ErisGameSeker.open();},{mode,skin});
  await page.waitForFunction(()=>!document.querySelector('#erisSekerModal [data-spin]').disabled);await page.waitForTimeout(80);
  const info=await page.locator('#erisSekerModal').evaluate(el=>{const r=el.getBoundingClientRect(),shell=el.querySelector('.ss-shell'),s=shell.getBoundingClientRect(),title=el.querySelector('.ss-title'),canvas=el.querySelector('canvas'),c=canvas.getBoundingClientRect(),wrap=el.querySelector('.ss-canvas-wrap').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,sx:s.x,sy:s.y,sw:s.width,sh:s.height,overflow:shell.scrollWidth-shell.clientWidth,shadow:getComputedStyle(shell).boxShadow,art:getComputedStyle(title).backgroundImage,canvas:[c.width,c.height],contained:c.x>=wrap.x-1&&c.right<=wrap.right+1};});
  console.log(mode,skin,width,height,info.canvas);
  assert.deepEqual([info.x,info.y,info.w,info.h,info.sx,info.sy,info.sw,info.sh],[0,0,width,height,0,0,width,height]);assert(info.overflow<=1);assert.equal(info.shadow,'none');assert(info.art.includes('/'+skin+'/seker.png'));assert(info.contained);assert(info.canvas[0]>100);assert(Math.abs(info.canvas[0]/info.canvas[1]-6/5)<.03);
  await page.evaluate(async skin=>{const image=new Image();image.src='http://eris.test/assets/lidya-ranking-v2/'+skin+'/seker.png';await image.decode();},skin);
  if(width===393){fs.mkdirSync('/tmp/seker-final-qa',{recursive:true});await page.screenshot({path:'/tmp/seker-final-qa/'+skin+'-'+mode+'.png'});}
  if(mode==='normal'){
   await page.locator('[data-buy]').click();assert(await page.locator('[data-buy-sheet]').isVisible());await page.locator('[data-cancel]').click();
  }else assert(await page.locator('[data-minus]').isDisabled());
  await page.locator('[data-rules]').click();assert(await page.locator('[data-rule-sheet]').isVisible());await page.locator('[data-rules-close]').click();
  await page.locator('[data-sound]').scrollIntoViewIfNeeded();assert(await page.locator('[data-sound]').isVisible());
  await page.locator('[data-close]').click();count++;
 }
 await page.setViewportSize({width:393,height:820});await page.evaluate(()=>{mode='normal';document.documentElement.dataset.erisTheme='light';ErisGameSeker.open();});await page.waitForFunction(()=>!document.querySelector('[data-spin]').disabled);
 await page.evaluate(()=>document.documentElement.dataset.erisTheme='dark');assert((await page.locator('.ss-title').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('/dark/seker.png'));
 await page.locator('[data-spin]').click();await page.waitForFunction(()=>document.querySelector('#erisSekerModal').dataset.phase==='result');assert.equal(await page.locator('[data-total]').textContent(),'100');
 await page.locator('[data-close]').click();assert.equal(await page.locator('#erisSekerModal').count(),0);assert.deepEqual(errors,[]);await browser.close();console.log('PASS: '+count+' full-window normal/resumed-bonus layouts; both palace PNGs, live theme switch, overlays, spin result and close.');
})().catch(e=>{console.error(e);process.exit(1)});
