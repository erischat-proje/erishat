const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.ERIS_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const p=await browser.newPage({viewport:{width:393,height:820}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync('frontend/erischat-main.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 const logo=fs.readFileSync('frontend/assets/lidyachat-system-avatar.png');let privateRequests=0;
 await p.route('https://eris.test/**',r=>r.request().url().includes('/assets/')?r.fulfill({contentType:'image/png',body:logo}):r.fulfill({contentType:'text/html',body:html}));
 await p.route('https://api.test/**',r=>{assert.equal(r.request().headers().authorization,'Bearer fixture');privateRequests++;return r.fulfill({contentType:'image/png',body:logo})});
 await p.goto('https://eris.test/');await p.addStyleTag({content:'header.top,.app>.nav{display:none!important}'});
 for(const name of ['home-part1.css','device-layout.css','messages-polish.css','messages-lidya.css'])await p.addStyleTag({content:fs.readFileSync('frontend/'+name,'utf8')});
 await p.evaluate(()=>{
  document.querySelectorAll('.view').forEach(e=>e.classList.remove('show'));document.getElementById('messages').classList.add('show');
  localStorage.setItem('token','fixture');window.ErisApiTransport={poll(){}};window.toast=()=>{};window.calls=[];window.fixtureRole='owner';
  window.ErisChatCosmetics={assetUrl:key=>key.startsWith('https:')?key:'https://eris.test/Gereken_icerikler/'+key};
  const rows=[{id:'welcome:owner',type:'welcome',last_message:'Hoş geldin',members:[]},{id:'family_chat',type:'family',name:'Aile aile sohbeti',avatar_url:'/families/fam/avatar',members:[]},{id:'grp_test',type:'group',name:'LidyaChat',avatar_url:'/message-groups/grp_test/image',members:[]}];
  window.ErisPlatform={getMe:async()=>({id:'owner'}),conversations(){},getAccessToken:()=> 'fixture',messageMediaUrl:path=>'https://api.test/v1'+path,messages:async()=>[{id:1,text:'Hoş geldin',sender_id:'owner'}],api:async(path,options)=>{
   if(options){calls.push({path,...options});return {}}
   if(path.startsWith('/conversations?'))return rows;
   if(path.endsWith('/members'))return [{user_id:'owner',nickname:'Ben',role:fixtureRole},{user_id:'member',nickname:'Üye',role:'member'}];
   if(path==='/message-groups/grp_test')return {name:'LidyaChat',description:'Grup açıklaması'};
   return {};
  }};
 });
 await p.addScriptTag({content:fs.readFileSync('frontend/dm-live.js','utf8')});
 await p.waitForSelector('[data-conversation-id="grp_test"]');
 assert.equal(await p.locator('[data-conversation-id="grp_test"] button').count(),0);
 await p.waitForFunction(()=>document.querySelector('[data-conversation-id="family_chat"] .ava').style.backgroundImage.includes('blob:'));
 const welcomeUrl=await p.locator('[data-conversation-id="welcome:owner"] .ava').evaluate(el=>el.style.backgroundImage);
 assert(welcomeUrl.includes('/assets/lidyachat-system-avatar.png')&&!welcomeUrl.includes('Gereken_icerikler'));
 await p.locator('[data-conversation-id="welcome:owner"]').click();
 await p.waitForFunction(()=>document.querySelector('#chat .dm-message-portrait img')?.complete);
 assert(await p.locator('#chat .dm-message-portrait img').evaluate(el=>el.naturalWidth>0));
 assert((await p.locator('#chat .chatHead .ava').evaluate(el=>el.style.backgroundImage)).includes('/assets/'));
 await p.evaluate(()=>document.getElementById('chat').classList.remove('show'));
 await p.locator('[data-conversation-id="grp_test"]').click();
 await p.waitForFunction(()=>document.querySelector('#chat .chatHead .ava').style.backgroundImage.includes('blob:'));
 await p.locator('#chat .chatHead b').click();await p.waitForSelector('[data-group-menu] [data-content] b');
 assert(await p.getByRole('button',{name:'Moderatör yap',exact:true}).isVisible());
 for(const theme of ['light','dark'])for(const width of [320,393]){
  await p.setViewportSize({width,height:820});await p.evaluate(theme=>{document.documentElement.dataset.erisTheme=theme;document.documentElement.style.setProperty('--ui-panel',theme==='dark'?'#27241e':'#fffaf0');document.documentElement.style.setProperty('--ui-ink',theme==='dark'?'#f2e5cf':'#30271c');},theme);
  const rect=await p.locator('[data-group-menu] .lidya-group-card').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1);
 }
 await p.getByRole('button',{name:'Gruptan çıkar',exact:true}).click();await p.waitForSelector('.dm-vault-modal');assert(await p.locator('.dm-vault-modal').evaluate(el=>Number(getComputedStyle(el).zIndex)>100050));await p.locator('.dm-vault-modal [data-cancel]').click();
 await p.getByRole('button',{name:'Üye davet et',exact:true}).click();await p.locator('[data-group-menu] input').fill('1234567890');await p.getByRole('button',{name:'Davet gönder',exact:true}).click();
 await p.waitForFunction(()=>calls.some(c=>c.path.endsWith('/invitations')));
 await p.locator('[data-group-menu] [data-close]').click();await p.evaluate(()=>fixtureRole='member');await p.locator('#chat .chatHead b').click();await p.waitForSelector('[data-group-menu] [data-content] b');
 assert.equal(await p.getByRole('button',{name:'Üye davet et',exact:true}).count(),0);assert(await p.getByRole('button',{name:'Gruptan ayrıl',exact:true}).isVisible());
 await p.screenshot({path:'/tmp/lidya-group-menu-qa.png'});assert(privateRequests>=3);assert.deepEqual(errors,[]);
 console.log('PASS: official logo in list/header/message, authenticated family/group images, title menu, invitation, role visibility, 4 theme/viewport layouts');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
