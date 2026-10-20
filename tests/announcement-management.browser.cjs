const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ERIS_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const page=await browser.newPage({viewport:{width:393,height:820}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 let rows=[{id:2,message:'Denetlenecek duyuru',admin_public_id:'1234567890',active:true,created_at:'2026-10-20T14:00:00Z'},{id:1,message:'Önceki duyuru',admin_public_id:'9876543210',active:true,created_at:'2026-10-20T13:00:00Z'}];
 await page.route('https://eris.test/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;requests.push({path,method:req.method()});
  if(path.endsWith('.js'))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync('frontend/'+path.split('/').pop(),'utf8')});
  if(path.startsWith('/v1/')){
   let body={};
   if(path==='/v1/admin/me')body={id:'admin',role:'DA',ghost_mode:false};
   else if(path==='/v1/announcements')body=rows;
   else if(path==='/v1/admin/announcements'){
    if(req.method()==='POST'){const input=req.postDataJSON();body={id:3,message:input.message,admin_public_id:'1122334455',active:true,created_at:'2026-10-20T14:10:00Z'};rows.unshift(body);}
    else body={items:rows,next_before:null};
   }else if(req.method()==='DELETE'){const id=Number(path.split('/').pop());rows=rows.filter(row=>row.id!==id);body={id,deleted:true,active:false};}
   return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  }
  if(path.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
  if(path.endsWith('.png'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1sAAAAASUVORK5CYII=','base64')});
  return route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="adminMenuMount"></div><section id="home"></section><section id="messages"><div class="list"></div></section></body></html>'});
 });
 await page.goto('https://eris.test/');await page.evaluate(()=>{window.ERISCHAT_API_BASE=location.origin;window.ERIS_API=location.origin+'/v1';localStorage.setItem('erischat.accessToken.v1','fixture');window.toast=()=>{};});
 await page.addScriptTag({url:'https://eris.test/admin-live.js'});await page.addScriptTag({url:'https://eris.test/announcement-live.js'});
 await page.evaluate(()=>ErisAnnouncements.load());assert((await page.locator('#erisAnnouncementCard').textContent()).includes('Yayınlayan yönetici ID: 1234567890'));assert((await page.locator('#erisAnnouncementInbox').innerText()).includes('1234567890'));
 await page.waitForSelector('.eris-admin-menu');await page.evaluate(()=>ErisAdmin.open());await page.locator('[data-a=announcement]').click();
 const listReads=()=>requests.filter(r=>r.path==='/v1/admin/announcements'&&r.method==='GET').length;
 assert.equal(listReads(),0);assert.equal(await page.locator('#ea-current-announcements').isVisible(),false);
 await page.getByPlaceholder('Duyuru mesajı').fill('Yeni yönetici duyurusu');await page.getByRole('button',{name:'Duyuruyu yayınla',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#eaBody [role=status]').textContent.includes('Yayınlandı'));
 assert.equal(listReads(),0);assert.equal(await page.locator('#ea-current-announcements').isVisible(),false);
 await page.getByRole('button',{name:'Mevcut duyurular',exact:true}).click();await page.waitForSelector('[data-announcement-id="3"]');
 assert.equal(await page.locator('#ea-current-announcements article').count(),3);
 assert((await page.locator('[data-announcement-id="2"]').innerText()).includes('1234567890'));
 for(const theme of ['light','dark'])for(const width of [320,393]){await page.setViewportSize({width,height:820});await page.evaluate(theme=>document.documentElement.dataset.erisTheme=theme,theme);assert(await page.locator('#eaBody').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
 await page.locator('[data-announcement-id="3"]').getByRole('button',{name:'Duyuruyu iptal et'}).click();await page.waitForFunction(()=>!document.querySelector('[data-announcement-id="3"]'));
 assert(!(await page.locator('#ea-current-announcements').innerText()).includes('İptal edildi'));
 await page.waitForFunction(()=>!document.querySelector('#erisAnnouncementCard')?.textContent.includes('Yeni yönetici duyurusu'));
 await page.getByRole('button',{name:'Mevcut duyurular',exact:true}).click();assert.equal(await page.locator('#ea-current-announcements').isVisible(),false);
 await page.getByRole('button',{name:'Mevcut duyurular',exact:true}).click();await page.waitForSelector('[data-announcement-id="2"]');assert.equal(await page.locator('[data-announcement-id="3"]').count(),0);
 await page.screenshot({path:'/tmp/lidya-announcement-qa.png'});
 assert.deepEqual(errors,[]);console.log('PASS: publisher ID in home/inbox/admin; lazy list; publish keeps list closed; cancel removes row/public card; reopening excludes cancelled; 4 theme/viewport layouts');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
