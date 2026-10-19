const {chromium}=require('playwright'),assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(process.env.ERIS_TEST_ROOT||path.join(__dirname,'..'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('frontend/erischat-main.html');
const cssPaths=[...new Set([...html.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map(m=>m[1].split('?')[0].replace(/^\.\//,'')))];
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+cssPaths.map(p=>{try{return read('frontend/'+p)}catch{return ''}}).join('\n');
(async()=>{
 const server=http.createServer((q,s)=>{if(q.url==='/'){s.setHeader('Content-Type','text/html');return s.end('<html></html>')}const f=path.join(root,'frontend',decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(path.join(root,'frontend')+path.sep)||!fs.existsSync(f)){s.statusCode=404;return s.end()}s.setHeader('Content-Type',f.endsWith('.png')?'image/png':'text/javascript; charset=utf-8');s.end(fs.readFileSync(f))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-software-rasterizer','--disable-gpu-compositing','--use-gl=disabled']});
 const page=await browser.newPage({viewport:{width:393,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.setContent('<html data-theme="dark" data-eris-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="erisRoomSurface" class="room-layout-v6"><div id="erisLiveSeats"><div class="eris-seat" data-user-id="u"><div class="seat-pod">Avatar</div><div class="eris-seat-name">Kullanıcı</div></div><div class="eris-seat" data-user-id="other"><div class="seat-pod">Avatar 2</div></div></div><div class="eris-room-compose"><button id="erisLiveSend">Gönder</button></div></div></body></html>');
 await page.addStyleTag({content:styles});
 await page.addStyleTag({content:'#erisRoomSurface{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;background:var(--ui-panel)}#erisLiveSeats{display:grid;grid-template-columns:repeat(4,1fr);padding:20px;gap:12px}#erisLiveSeats>.eris-seat{position:relative;width:75px;height:90px}.eris-room-compose{position:absolute;bottom:10px;left:12px;display:flex}body{margin:0}'});
 await page.evaluate(()=>{localStorage.setItem('erischat_access_token','test');window.ErisCurrentRoomId='R';window.__erisCurrentRoomUserId='u';window.__erisRoomSocket={readyState:1,__erisRoomId:'R',send:s=>window.sent.push(JSON.parse(s))};window.sent=[];window.messages=[];window.toast=s=>messages.push(s);window.testLevel=0;window.failVip=false;window.clock=Date.now();Date.now=()=>clock;window.ErisRoomBlocks=new Set();window.fetch=async(url,options)=>{if(!String(url).endsWith('/me/room-emojis'))throw Error('Unexpected fetch '+url);if(window.failVip)return {ok:false};return {ok:true,json:async()=>({level:window.testLevel,unlocked_ids:Array.from({length:window.testLevel},(_,i)=>'vip_'+(i+1))})}}});
 await page.addScriptTag({url:page.url()+'room-emojis.js'});
 const open=async(level)=>{await page.evaluate(n=>{testLevel=n;ErisRoomEmojis.open()},level);await page.waitForFunction(()=>document.querySelector('.ee-status').textContent.startsWith('VIP '))};
 for(const theme of ['light','dark']){
  await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.dataset.erisTheme=t},theme);
  for(const [width,height] of [[320,568],[360,640],[393,850],[568,320],[768,1024],[1280,800]]){
   await page.setViewportSize({width,height});await open(6);await page.locator('[data-tab="standard"]').click();assert.equal(await page.locator('[data-emoji-id]').count(),28);
   await page.waitForFunction(()=>[...document.querySelectorAll('.ee-grid img')].every(i=>i.complete&&i.naturalWidth>0));
   await page.locator('[data-tab="vip"]').click();assert.equal(await page.locator('[data-emoji-id]').count(),12);
   await page.waitForFunction(()=>[...document.querySelectorAll('.ee-grid img')].every(i=>i.complete&&i.naturalWidth>0));
   const g=await page.locator('.ee-sheet').evaluate(e=>{const r=e.getBoundingClientRect(),grid=e.querySelector('.ee-grid'),head=e.querySelector('header').getBoundingClientRect(),close=e.querySelector('[data-close]').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflow:e.scrollWidth>e.clientWidth+1,gridHeight:grid.clientHeight,gridScroll:grid.scrollHeight>grid.clientHeight,headVisible:head.top>=r.top-1,closeVisible:close.bottom<=r.bottom+1}});
   assert(g.x>=-1&&g.y>=-1&&g.right<=width+1&&g.bottom<=height+1&&!g.overflow&&g.gridHeight>50&&g.headVisible&&g.closeVisible,JSON.stringify({theme,width,height,g}));
   assert.equal(await page.locator('.ee-locked').count(),6);await page.locator('[data-level="12"]').click();assert.equal(await page.locator('[data-emoji-id]').count(),1);await page.locator('[data-level="0"]').click();
   if(process.env.ERIS_SCREENSHOTS&&width===393){await page.screenshot({path:path.join(process.env.ERIS_SCREENSHOTS,'emoji-panel-'+theme+'.png')})}
   await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'erisRoomEmojiButton');
  }
  for(let level=0;level<=12;level++){
   await open(level);await page.locator('[data-tab="vip"]').click();assert.equal(await page.locator('.ee-premium:not(.ee-locked)').count(),level);
   let before=await page.evaluate(()=>sent.length);
   if(level<12){await page.locator('[data-emoji-id="vip_12"]').click({force:true});assert.equal(await page.evaluate(()=>sent.length),before)}
   if(level){await page.evaluate(()=>clock+=2100);await page.locator(`[data-emoji-id="vip_${level}"]`).click();const sent=await page.evaluate(()=>window.sent.at(-1));assert.deepEqual(sent,{type:'room_reaction',reaction_id:'vip_'+level});assert(await page.locator('#erisRoomEmojiPanel').evaluate(e=>e.hidden))}
  }
 }
 // VIP lookup failure keeps basic emoji usable and fails VIP closed; retry restores access.
 await page.setViewportSize({width:393,height:850});await page.evaluate(()=>{failVip=true;ErisRoomEmojis.open()});await page.locator('[data-retry]').waitFor();await page.locator('[data-tab="vip"]').click();assert.equal(await page.locator('.ee-locked').count(),12);await page.evaluate(()=>failVip=false);await page.locator('[data-retry]').click();await page.waitForFunction(()=>document.querySelector('.ee-status').textContent.startsWith('VIP 12'));assert.equal(await page.locator('.ee-locked').count(),0);
 // An account change while a lookup is in flight cannot reuse its VIP grant.
 await page.evaluate(()=>{ErisRoomEmojis.open();localStorage.setItem('erischat_access_token','other-account')});await page.locator('[data-retry]').waitFor();await page.locator('[data-tab="vip"]').click();assert.equal(await page.locator('.ee-locked').count(),12);let accountBefore=await page.evaluate(()=>sent.length);await page.locator('[data-emoji-id="vip_12"]').click({force:true});assert.equal(await page.evaluate(()=>sent.length),accountBefore);await page.evaluate(()=>localStorage.setItem('erischat_access_token','test'));
 // Receiving another user's premium emoji does not require the viewer's VIP level.
 await page.evaluate(()=>{ErisRoomEmojis.close();ErisRoomEmojis.receive({id:'e1',room_id:'R',user_id:'other',reaction_id:'vip_12',duration_ms:4000})});assert.equal(await page.locator('[data-user-id="other"] .ee-vip-art').count(),1);
 await page.evaluate(()=>{ErisRoomBlocks.add('other');dispatchEvent(new Event('erischat:room-blocks-updated'))});assert.equal(await page.locator('[data-user-id="other"] .eris-seat-reaction').count(),0);
 await page.evaluate(()=>{ErisRoomBlocks.clear();ErisRoomEmojis.receive({id:'e2',room_id:'R',user_id:'u',reaction_id:'vip_12'})});await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.eris-seat-reaction .ee-sticker').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.evaluate(()=>ErisRoomEmojis.openInteraction('other'));assert.equal(await page.locator('[data-emoji-id]').count(),6);assert(await page.locator('.ee-tabs').evaluate(e=>e.hidden));await page.evaluate(()=>clock+=2100);await page.locator('[data-emoji-id="send_heart"]').click();assert.deepEqual(await page.evaluate(()=>sent.at(-1)),{type:'room_reaction',reaction_id:'send_heart',target_user_id:'other'});
 // No-seat and cooldown checks remain in the client as well.
 const cooldownBefore=await page.evaluate(()=>sent.length);await page.evaluate(()=>ErisRoomEmojis.openInteraction('other'));await page.locator('[data-emoji-id="send_heart"]').click();assert.equal(await page.evaluate(()=>sent.length),cooldownBefore);
 await open(12);await page.locator('[data-tab="standard"]').click();await page.evaluate(()=>{clock+=2100;document.querySelector('[data-user-id="u"]').remove()});const seatBefore=await page.evaluate(()=>sent.length);await page.locator('[data-emoji-id="laugh"]').click();assert.equal(await page.evaluate(()=>sent.length),seatBefore);
 // Room teardown removes active artwork and cancels outstanding VIP grants.
 await page.evaluate(()=>dispatchEvent(new Event('erischat:room-closed')));assert.equal(await page.locator('.eris-seat-reaction').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: 40 PNGs; 2 themes × 6 viewports; VIP 0–12 cumulative gates, locked send, retry, receive, blocks, motion, focus, targeted interaction, teardown.');
 await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});
