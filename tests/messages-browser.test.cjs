const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.ERIS_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader'],headless:true});
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync('frontend/erischat-main.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await p.route("https://eris.test/**",r=>r.fulfill({contentType:"text/html",body:html}));await p.goto("https://eris.test/");await p.evaluate(()=>{document.querySelectorAll('.view').forEach(e=>e.classList.remove('show'));document.getElementById('messages').classList.add('show');});
 for(const name of ['home-part1.css','device-layout.css','screen-layout-fix.css','app-shell.css','messages-polish.css'])if(fs.existsSync('frontend/'+name))await p.addStyleTag({content:fs.readFileSync('frontend/'+name,'utf8')});
 await p.evaluate(()=>{
  const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
  window.lists=[];window.searches=[];window.pendingSend=null;localStorage.setItem('token','fixture');
  window.ErisApiTransport={poll(){}};window.toast=()=>{};window.ErisNotifications={enabled:true};
  window.ErisPlatform={conversations(){},getMe:async()=>({id:1}),api:path=>{const d=defer();if(path.startsWith('/conversations'))lists.push(d);else if(path.startsWith('/users/'))searches.push(d);else return Promise.resolve({});return d.promise},messages:async()=>[],sendMessage:(id,text)=>{pendingSend=defer();return pendingSend.promise}};
 });
 await p.addScriptTag({content:fs.readFileSync('frontend/dm-live.js','utf8')});await p.waitForFunction(()=>lists.length===1);
 await p.evaluate(()=>{ErisChatDM.load();});await p.waitForFunction(()=>lists.length===2);
 await p.evaluate(()=>lists[1].resolve([{id:2,last_message:'Yeni',members:[{user_id:2,nickname:'Yeni kişi'}]}]));await p.waitForSelector('[data-conversation-id="2"]');
 await p.evaluate(()=>lists[0].resolve([{id:3,last_message:'Eski',members:[{user_id:3,nickname:'Eski kişi'}]}]));await p.waitForTimeout(40);assert.equal(await p.locator('[data-conversation-id="3"]').count(),0);
 await p.fill('[data-dm-user-search]','1111111111');await p.click('[data-dm-search-btn]');await p.waitForFunction(()=>searches.length===1);await p.fill('[data-dm-user-search]','2222222222');await p.click('[data-dm-search-btn]');await p.waitForFunction(()=>searches.length===2);
 await p.evaluate(()=>searches[1].resolve({id:2,nickname:'Yeni sonuç',public_id:'2222222222'}));await p.waitForFunction(()=>document.querySelector('[data-dm-search-result]').textContent.includes('Yeni sonuç'));await p.evaluate(()=>searches[0].resolve({id:3,nickname:'Eski sonuç'}));await p.waitForTimeout(40);assert(!(await p.locator('[data-dm-search-result]').innerText()).includes('Eski sonuç'));
 await p.evaluate(()=>ErisChatDM.open(2,'Yeni kişi','Y',2));await p.fill('#chatInput','Eski sohbet mesajı');await p.click('#chat .compose .primary');await p.waitForFunction(()=>pendingSend);await p.evaluate(()=>ErisChatDM.open(3,'Başka kişi','B',3));await p.evaluate(()=>pendingSend.resolve({id:81,text:'Eski sohbet mesajı',is_mine:true}));await p.waitForTimeout(40);assert.equal(await p.locator('#chat [data-message-id="81"]').count(),0);
 for(const width of [320,393,768])for(const height of [760,420]){
  await p.setViewportSize({width,height});await p.evaluate(({width,height})=>{document.documentElement.classList.add('eris-adaptive');for(const name of ['--app-top','--eris-safe-top','--eris-safe-bottom','--eris-viewport-left','--eris-safe-left','--eris-safe-right'])document.documentElement.style.setProperty(name,'0px');document.documentElement.style.setProperty('--app-height',height+'px');document.documentElement.style.setProperty('--eris-usable-height',height+'px');}, {width,height});
  const r=await p.evaluate(()=>{const sheet=document.querySelector('#chat .chatSheet').getBoundingClientRect(),input=document.getElementById('chatInput').getBoundingClientRect(),send=document.querySelector('#chat .compose .primary').getBoundingClientRect();return {sheetBottom:sheet.bottom,inputWidth:input.width,sendRight:send.right,inputBottom:input.bottom,bodyWidth:document.documentElement.scrollWidth}});
  assert(r.inputWidth>120,JSON.stringify(r));assert(r.sheetBottom<=height+1&&r.inputBottom<=height+1&&r.sendRight<=width+1&&r.bodyWidth<=width,JSON.stringify(r));
 }
 await p.evaluate(()=>ErisChatDM.open(4,'ErisChat','E',null));assert.equal(await p.locator('#chat .compose').isVisible(),false);await p.evaluate(()=>ErisChatDM.open(3,'Başka kişi','B',3));assert.equal(await p.locator('#chat .compose').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS: list/search races, sending during chat switch, 6 viewport layouts, system chat controls');await b.close();
})();
