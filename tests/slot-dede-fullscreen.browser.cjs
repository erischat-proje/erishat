const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const base=path.resolve(__dirname,'../frontend');
 const browser=await chromium.launch({executablePath:process.env.ERIS_CHROME,headless:true,args:['--no-sandbox','--disable-gpu','--single-process','--no-zygote','--disable-software-rasterizer','--disable-gpu-compositing','--use-gl=disabled']});
 const page=await browser.newPage({userAgent:'ErisChatAndroid/1.0',reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://eris.test/**',route=>{
  const name=new URL(route.request().url()).pathname;
  if(name==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html data-eris-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body></body></html>'});
  const file=path.join(base,name);
  if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.png')?'image/png':'text/html'});
 });
 await page.goto('http://eris.test/');
 const main=fs.readFileSync(base+'/erischat-main.html','utf8');
 for(const match of main.matchAll(/<link[^>]*href="\.\/([^"?]+\.css)[^"]*"/g))await page.addStyleTag({url:'http://eris.test/'+match[1]});
 await page.evaluate(()=>{
  window.ErisPlatform={getMe:async()=>({id:'test'}),api:async p=>p.endsWith('/active')?{balance:1000000,state:null}:p.endsWith('/rules')?{paytable:Array(10).fill([1,2,3])}:{balance:1000000,my_id:'test',remaining:0,history:[],bonus_spins:10,bonus_price_multiplier:10}};
  window.LidyaGameRanking={icon:'',open(){},close(){}};
 });
 for(const name of ['lidya-game-art.js','games/slot-stakes.js','games/nonroom-standard.js','games/viewport-fit.js','games/dede-stakes.js','games/dede.js','slot-final.js'])await page.addScriptTag({url:'http://eris.test/'+name});
 let count=0;
 for(const game of ['slot','dede'])for(const theme of ['light','dark'])for(const [width,height]of [[320,568],[393,820],[412,915],[844,390],[1440,900]]){
  await page.setViewportSize({width,height});
  await page.evaluate(({game,theme})=>{document.documentElement.dataset.erisTheme=theme;game==='slot'?LidyaSlotLive.open():ErisGameDede.open();},{game,theme});
  await page.waitForTimeout(120);
  const root=page.locator(game==='slot'?'#lidyaSlotFinal':'#erisDedeModal');
  const info=await root.evaluate(el=>{const r=el.getBoundingClientRect(),shell=el.querySelector('.gv-shell'),s=shell.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,sx:s.x,sy:s.y,sw:s.width,sh:s.height,overflow:shell.scrollWidth-shell.clientWidth,shadow:getComputedStyle(shell).boxShadow};});
  assert.equal(info.x,0);assert.equal(info.y,0);assert.equal(info.w,width);assert.equal(info.h,height);
  assert.equal(info.sx,0);assert.equal(info.sy,0);assert.equal(info.sw,width);assert.equal(info.sh,height);assert(info.overflow<=1);assert.equal(info.shadow,'none');
  if(game==='dede'){
   await root.locator('.dd-actor').evaluate(img=>img.decode());
   assert(await root.locator('.dd-actor').evaluate(img=>img.naturalWidth>0&&img.getBoundingClientRect().height>=100));
   assert.equal(await root.locator('.dd-cell').count(),30);
  }else assert.equal(await root.locator('.sf-reel').count(),3);
  await root.locator('[data-auto]').scrollIntoViewIfNeeded();assert(await root.locator('[data-auto]').isVisible());
  await root.locator('.gv-shell').evaluate(el=>el.scrollTop=0);
  if(width===393){fs.mkdirSync('/tmp/slot-dede-qa',{recursive:true});await page.screenshot({path:'/tmp/slot-dede-qa/'+game+'-'+theme+'.png'});}
  await root.locator('[data-close]').click();count++;
 }
 await page.setViewportSize({width:393,height:820});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{
  const original=ErisPlatform.api;window.throwTrace=[];
  ErisPlatform.api=async(p,o)=>{
   if(!p.endsWith('/spin'))return original(p,o);
   const board=Array.from({length:30},(_,i)=>({s:i%9}));board[8]={s:10,m:5};board[22]={s:10,m:20};
   return {balance:1001200,payout:1250,state:{stake:50,ante:false,finished:true,remaining:0,total_payout:1250},result:{steps:[{board,wins:[],removed:[],win:0}],multipliers:[5,20],raw:1,applied:25,payout:1}};
  };
  ErisGameDede.open();
  const hero=document.querySelector('.dd-hero');new MutationObserver(()=>throwTrace.push({pose:hero.dataset.actor,src:hero.querySelector('img').src})).observe(hero,{attributes:true,attributeFilter:['data-actor']});
 });
 await page.waitForFunction(()=>!document.querySelector('#erisDedeModal [data-spin]').disabled);
 await page.locator('#erisDedeModal [data-spin]').click();
 await page.waitForSelector('.dd-throw-projectile');
 assert.equal(await page.locator('#erisDedeModal [data-spin]').isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('#erisDedeModal').dataset.phase==='result');
 const trace=await page.evaluate(()=>throwTrace);
 for(const pose of ['anticipation','release','cast','follow'])assert.equal(trace.filter(x=>x.pose===pose).length,2,pose+' for each multiplier');
 assert.equal(new Set(trace.filter(x=>x.pose!=='idle').map(x=>x.src)).size,4,'four different arm poses');
 assert.equal(await page.locator('.dd-throw-projectile').count(),0);
 assert.equal(await page.locator('[data-pool]').textContent(),'25×');
 await page.locator('#erisDedeModal [data-close]').click();
 await page.evaluate(()=>ErisGameDede.open());await page.waitForFunction(()=>!document.querySelector('#erisDedeModal [data-spin]').disabled);
 await page.locator('#erisDedeModal [data-spin]').click();await page.waitForSelector('.dd-throw-projectile');
 await page.locator('#erisDedeModal [data-close]').click();await page.waitForTimeout(600);
 assert.equal(await page.locator('.dd-throw-projectile,#erisDedeModal').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>ErisGameDede.open());
 await page.waitForFunction(()=>!document.querySelector('#erisDedeModal [data-spin]').disabled);
 await page.locator('#erisDedeModal [data-spin]').click();await page.waitForFunction(()=>document.querySelector('#erisDedeModal').dataset.phase==='result');
 assert.equal(await page.locator('.dd-throw-projectile').count(),0);assert.equal(await page.locator('[data-pool]').textContent(),'25×');
 await page.locator('#erisDedeModal [data-close]').click();
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: '+count+' fullscreen layouts; two real multiplier throws, four poses, locked spin, correct pool and close during throw.');
})().catch(e=>{console.error(e);process.exit(1)});
