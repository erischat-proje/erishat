const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../frontend');
 const server=http.createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://test').pathname);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.png')?'image/png':'text/css');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:393,height:850}}),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/v1/admin/**',route=>{
  const req=route.request(),url=new URL(req.url());if(req.method()!=='GET')writes.push(url.pathname);
  let data=[];
  if(url.pathname.endsWith('/me'))data={id:'admin',role:'DA',ghost_mode:false};
  if(url.pathname.endsWith('/overview'))data={open_cases:0,manual_operation_count:0,vip_accounts:0};
  if(url.pathname.endsWith('/manual-operations'))data={items:[]};
  if(url.pathname.endsWith('/alerts')||url.pathname.endsWith('/signals'))data={findings:[],scanned:0};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin+'/admin-live.js');
 await page.setContent('<html data-eris-theme="light"><head><meta charset="utf-8"></head><body><div id="adminMenuMount"></div></body></html>');
 await page.evaluate(()=>{window.ERISCHAT_API_BASE=location.origin;localStorage.setItem('erischat.accessToken.v1','test');window.toast=message=>{throw Error(message)}});
 await page.addStyleTag({url:origin+'/management-center.css'});
 await page.addStyleTag({url:origin+'/management-center-responsive.css'});
 await page.addScriptTag({url:origin+'/admin-live.js'});
 await page.addScriptTag({url:origin+'/management-center.js'});
 assert.equal(await page.evaluate(()=>document.currentScript),null);
 await page.evaluate(()=>ErisAdmin.open());
 const keys=['command','cases','emergency','finance','fraud','audit'];
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.erisTheme=t,theme);
  await page.waitForFunction(()=>[...document.querySelectorAll('img[data-ea-art-key]')].every(i=>i.complete&&i.naturalWidth>0));
  assert.ok(await page.locator('[data-a]').evaluateAll(bs=>bs.every(b=>typeof b.onclick==='function')),'all menu buttons have handlers');
  for(const key of keys){
   const button=page.locator('[data-a="lm-'+key+'"]');
   const src=await button.locator('img').getAttribute('src');assert.ok(src.endsWith('/admin-lidya-v4/'+theme+'/'+key+'.png'),src);
   await button.click();await page.locator('.lm-command-overlay').waitFor();
   await page.waitForFunction(()=>!document.querySelector('.lm-command-content').textContent.includes('Gerçek veriler yükleniyor'));
   assert.equal(await page.locator('.lm-command-error').count(),0);
   assert.ok(await page.locator('.lm-command-overlay').evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.width/2,80)?.closest('.lm-command-overlay')===e}));
   await page.locator('.lm-command-overlay [data-close]').click();
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log('PASS: 12 themed PNGs loaded, all menu handlers bound, all six panels open/close in both themes; currentScript null; no JS errors or API writes');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
