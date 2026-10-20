/* Full catalog geometry plus real mini/full profile and DM integration. */
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const frontend=path.resolve('frontend'),assetRoot=path.resolve(process.env.ERIS_ASSET_ROOT||'frontend');
const source=fs.readFileSync(frontend+'/erischat-main.html','utf8');
const inline=[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const links=[...source.matchAll(/<link[^>]+href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map(m=>`<link rel="stylesheet" href="${m[1]}">`).join('');
const fixture='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+inline+'</style>'+links+'</head><body></body></html>';
let user={id:'u1',public_id:'1234567890',nickname:'Uzun Kullanıcı Adı İle Profil Uyumu',avatar_asset:'shop-expansion/avatar-female-01.png',frame_asset:'shop-expansion/frame-female-39.svg',profile_asset:'shop-expansion/profile-female-39.svg',title_asset:'shop-expansion/title-female-39.svg',vip_level:0,gender:'female',followers_count:123456789,following_count:987654321,received_gift_lidya:1234567890123};
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://eris.test').pathname);
  if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);return;}
  if(name.startsWith('/v1/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(name.includes('profile-stats')?user:[]));return;}
  const relative=name.replace(/^\//,'');let file=path.resolve(frontend,relative);if(!file.startsWith(frontend+'/')){res.writeHead(403).end();return;}
  if(!fs.existsSync(file))file=path.resolve(assetRoot,relative);
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'image/png');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.ERIS_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const errors=[],page=await browser.newPage({viewport:{width:320,height:820},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.evaluate(({origin,user})=>{window.ERIS_API=origin+'/v1';window.ErisApiTransport={poll(){}};window.fixtureUser=user;window.ErisAuth={user};window.toast=()=>{};window.ErisPlatform={getMe:async()=>fixtureUser,api:async path=>path.includes('/blocks')||path.endsWith('/posts')?[]:fixtureUser};},{origin,user});
 for(const script of ['lidya-premium.js','shop-art-lydia.js','cosmetics.js','visual-layout.js','vip-rewards-live.js','floating-profile-modal.js','user-profile-navigation.js'])await page.addScriptTag({url:origin+'/'+script});
 let checked=0;
 // Every premium profile, frame and bubble is exercised at narrow and wide widths in both themes.
 for(let batch=Number(process.env.ERIS_START_BATCH||0);batch<20;batch++){
  const keys=[];for(let i=batch*8;i<(batch+1)*8;i++)keys.push({gender:i<80?'female':'male',n:String(i%80+1).padStart(2,'0')});
  await page.evaluate(async keys=>{
   document.body.innerHTML='<main style="padding:12px;max-width:760px;margin:auto"><div id="chat" style="position:relative!important;inset:auto!important;display:block!important;background:none!important;overflow:visible!important"><div class="chatBody" style="height:auto!important;overflow:visible!important"></div></div><div id="erisRoomSurface" class="room-layout-v6 room-screen-fit" style="position:relative!important;display:block!important;inset:auto!important;height:auto!important;width:100%!important"><div id="erisLiveChat"></div></div><div class="profiles"></div><div class="portraits"></div></main>';
   const tasks=[];
   for(const {gender,n} of keys){
    const key=kind=>'shop-expansion/'+kind+'-'+gender+'-'+n+'.svg';
    for(const scope of ['dm','room']){
     const row=document.createElement('div');row.className=scope==='dm'?'bubble dm-award-bubble':'eris-chat-msg';row.dataset.key=key('bubble');row.dataset.scope=scope;
     if(scope==='room'){const identity=document.createElement('div');identity.className='eris-chat-identity';identity.textContent='Kullanıcı';row.append(identity);}
     const bubble=document.createElement('div');bubble.className='rel-chat-bubble'+(scope==='dm'?' dm-award-content':'');bubble.dataset.testBubble='';bubble.innerHTML='<div class="dm-message-text">Selam</div><small>Bugün · 16:40</small>';row.append(bubble);
     document.querySelector(scope==='dm'?'#chat .chatBody':'#erisLiveChat').append(row);tasks.push(ErisVisualLayout.bubble(bubble,key('bubble')));
    }
    const profile=document.createElement('div');profile.className='shop800-profile';profile.dataset.testProfile='';profile.innerHTML='<div class="shop800-profile-identity"><span class="shop800-avatar">E</span><div><b>Çok Uzun Kullanıcı Adı İçeren Profil</b><small>ID: 1234567890</small></div></div><div class="shop800-profile-stats"><div><b>123.456.789</b><small>Takipçi</small></div><div><b>987.654.321</b><small>Takip</small></div><div><b>1.234.567.890.123</b><small>Alınan hediye</small></div></div><button class="shop800-profile-action">Mesaj gönder</button>';
    document.querySelector('.profiles').append(profile);tasks.push(ErisVisualLayout.popup(profile,key('profile')));
    const portrait=document.createElement('div');portrait.className='shop800-preview-portrait';portrait.style.cssText='position:relative;width:80px;height:80px';const avatar=document.createElement('img');avatar.src=ErisChatCosmetics.assetUrl('shop-expansion/avatar-female-01.png');const frame=document.createElement('img');frame.className='eris-mini-frame';frame.src=ErisChatCosmetics.assetUrl(key('frame'));portrait.append(avatar,frame);document.querySelector('.portraits').append(portrait);
   }
   ErisVisualLayout.portraits(document);await Promise.all(tasks);
  },keys);
  await page.waitForFunction(()=>document.querySelectorAll('.visual-portrait').length===8);
  for(const width of [320,393,768])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:820});await page.evaluate(theme=>document.documentElement.dataset.erisTheme=theme,theme);await page.waitForTimeout(25);
   const results=await page.evaluate(()=>{
    const errors=[];for(const bubble of document.querySelectorAll('[data-test-bubble]')){const rect=bubble.getBoundingClientRect(),parent=bubble.parentElement.getBoundingClientRect();if(rect.width>parent.width+1||bubble.scrollWidth>bubble.clientWidth+1)errors.push(['bubble overflow',bubble.parentElement.dataset.key,rect.width,parent.width]);if(getComputedStyle(bubble).borderImageSource==='none')errors.push(['bubble art missing']);}
    for(const profile of document.querySelectorAll('[data-test-profile]')){if(profile.scrollWidth>profile.clientWidth+1)errors.push(['profile overflow']);if(getComputedStyle(profile).borderImageSlice.includes('fill'))errors.push(['profile center obscures controls']);const button=profile.querySelector('button'),r=button.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===button)button.dataset.hit='true';}
    for(const portrait of document.querySelectorAll('.visual-portrait')){const outer=portrait.getBoundingClientRect(),frame=portrait.querySelector('.visual-art-frame').getBoundingClientRect(),avatar=portrait.querySelector('.visual-art-avatar').getBoundingClientRect();if(Math.abs(frame.width-outer.width)>1||avatar.left<outer.left-1||avatar.right>outer.right+1)errors.push(['frame/face fit',outer.width,frame.width,avatar.width]);}
    return errors;
   });assert.deepEqual(results,[],JSON.stringify({batch,width,theme,results}));checked+=32;
  }
  const sizes=await page.evaluate(async()=>{
   const bubbles=[...document.querySelectorAll('[data-test-bubble]')],short=bubbles.map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}));
   for(const b of bubbles)b.querySelector('.dm-message-text').textContent='Uzun bir mesaj satır atlamalı şekilde görüntülenmeli. '.repeat(45)+'\nhttps://eris.test/'+('a'.repeat(300));
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return bubbles.map((b,i)=>({short:short[i],long:{w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height},overflow:b.scrollWidth>b.clientWidth+1}));
  });for(const size of sizes){assert(size.long.h>size.short.h);assert(size.long.w>size.short.w);assert(!size.overflow,JSON.stringify(size));}

 }
 // Real mini profile uses the same frame and all controls remain clickable.
 await page.evaluate(()=>document.body.replaceChildren());await page.evaluate(()=>ErisFloatingProfile.open('u1'));
 await page.waitForSelector('.eris-mini-card[data-art-ready="true"]');await page.waitForSelector('.eris-mini-portrait.visual-portrait');
 for(const [width,height] of [[320,820],[393,820],[768,820],[320,420],[768,390]])for(const theme of ['light','dark']){await page.setViewportSize({width,height});await page.evaluate(theme=>document.documentElement.dataset.erisTheme=theme,theme);assert(await page.locator('.eris-mini-card').evaluate(el=>el.scrollWidth<=el.clientWidth+1));const button=page.locator('.eris-mini-card [data-message]');await button.scrollIntoViewIfNeeded();assert(await button.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}));}
 await page.screenshot({path:'/tmp/lidya-mini-fit-qa.png'});
 await page.evaluate(()=>document.querySelector('.eris-mini-profile-shade').remove());await page.evaluate(()=>openUserProfile('u1'));await page.waitForSelector('#erisUserProfileModal .visual-profile-surface[data-art-ready="true"]');
 for(const width of [320,393]){await page.setViewportSize({width,height:820});assert(await page.locator('#erisUserProfileModal > div').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
 await page.screenshot({path:'/tmp/lidya-full-profile-fit-qa.png'});
 // Own profile, removal/reset and rapid changes use the same renderer.
 await page.evaluate(html=>{
  document.getElementById('erisUserProfileModal')?.remove();const doc=new DOMParser().parseFromString(html,'text/html');const own=document.createElement('section');own.id='profile';own.append(document.importNode(doc.querySelector('.profile.card'),true));document.body.append(own);ErisChatVIP.decorate(own.querySelector('.profile.card'),fixtureUser);
 },source);
 await page.waitForSelector('#profile .visual-profile-surface[data-art-ready="true"]');
 assert(await page.locator('#profile .profile.card').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 const reset=await page.evaluate(async()=>{const el=document.querySelector('#profile .profile.card');await Promise.all([ErisVisualLayout.popup(el,'shop-expansion/profile-male-01.svg'),ErisVisualLayout.popup(el,'shop-expansion/profile-male-80.svg')]);const latest=getComputedStyle(el).borderImageSource;ErisChatVIP.decorate(el,{...fixtureUser,profile_asset:null});return {latest,paid:el.classList.contains('eris-mini-paid'),observer:!!el._artObserver};});
 assert(reset.latest.includes('profile-male-80'));assert.equal(reset.paid,false);assert.equal(reset.observer,false);
 const fallback=await page.evaluate(async()=>{const el=document.querySelector('#profile .profile.card');el.classList.add('eris-mini-paid');await ErisVisualLayout.popup(el,'shop-expansion/profile-male-99.svg');const result={ready:el.dataset.artReady,edge:el.style.getPropertyValue('--paid-edge')};ErisVisualLayout.reset(el);el.classList.remove('eris-mini-paid');return result;});assert.equal(fallback.ready,'fallback');assert.equal(fallback.edge,'0px');
 // Real DM rendering: list/header/message portraits and actual short/long bubbles.
 await page.evaluate(html=>{
  const doc=new DOMParser().parseFromString(html,'text/html');document.body.replaceChildren(document.importNode(doc.getElementById('messages'),true),document.importNode(doc.getElementById('chat'),true));document.getElementById('messages').classList.add('show');
  localStorage.setItem('token','fixture');ErisPlatform.conversations=()=>{};
  const rows=[{id:'dm-fit',type:'dm',members:[{user_id:'u1'},{user_id:'friend',nickname:'Arkadaş',avatar_asset:fixtureUser.avatar_asset,frame_asset:fixtureUser.frame_asset}],last_message:'Merhaba'}];
  ErisPlatform.api=async p=>p.startsWith('/conversations?')?rows:{};
  ErisPlatform.messages=async()=>[{id:1,sender_id:'friend',text:'Selam',sender_avatar_asset:fixtureUser.avatar_asset,sender_frame_asset:fixtureUser.frame_asset,bubble_asset:'shop-expansion/bubble-female-39.svg'},{id:2,sender_id:'friend',text:'Uzun metin ve bağlantı '.repeat(55)+'https://eris.test/'+('a'.repeat(200)),sender_avatar_asset:fixtureUser.avatar_asset,sender_frame_asset:fixtureUser.frame_asset,bubble_asset:'shop-expansion/bubble-male-80.svg'}];
 },source);
 await page.addScriptTag({url:origin+'/dm-live.js'});await page.waitForSelector('[data-conversation-id="dm-fit"] .visual-portrait');
 await page.locator('[data-conversation-id="dm-fit"]').click();await page.waitForSelector('#chat .dm-award-content[data-art-ready="true"]');await page.waitForSelector('#chat .chatHead .visual-portrait');
 for(const width of [320,393,768])for(const theme of ['light','dark']){await page.setViewportSize({width,height:820});await page.evaluate(theme=>document.documentElement.dataset.erisTheme=theme,theme);assert(await page.locator('#chat .dm-award-content').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth+1)));}
 await page.screenshot({path:'/tmp/lidya-dm-fit-qa.png'});
 // All 160 entrance name plates are checked with the real scene renderer.
 await page.evaluate(()=>document.body.replaceChildren());await page.addScriptTag({url:origin+'/vip-designs.js'});await page.addScriptTag({url:origin+'/vip-entrance.js'});
 let entrances=0;
 for(const gender of ['female','male'])for(let n=1;n<=80;n++){
  const key='shop-expansion/entrance-'+gender+'-'+String(n).padStart(2,'0')+'.svg';
  await page.evaluate(key=>ErisRoomEntrance.previewAsset(key),key);await page.waitForSelector('.eris-vip-entrance [data-measured="true"]',{state:'attached',timeout:5000}).catch(async e=>{console.log('ENTRY FAILURE',key,await page.locator('body').innerHTML(),errors);throw e;});
  for(const [width,theme] of [[320,'light'],[393,'dark']]){
   await page.setViewportSize({width,height:820});await page.evaluate(theme=>document.documentElement.dataset.erisTheme=theme,theme);
   const fit=await page.evaluate(()=>{const banner=document.querySelector('.eris-vip-entry-banner'),name=banner.querySelector('.eris-vip-entry-identity'),portrait=banner.querySelector('.eris-vip-entry-portrait'),a=banner.getBoundingClientRect(),b=name.getBoundingClientRect(),c=portrait.getBoundingClientRect();return {plate:b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1,separate:c.right<=b.left+1,visible:getComputedStyle(name.querySelector('strong')).display!=='none',noteHidden:name.querySelector('span').hidden};});
   assert(fit.plate&&fit.separate&&fit.visible&&fit.noteHidden,JSON.stringify({key,width,fit}));
  }
  await page.evaluate(()=>ErisRoomEntrance.clear());entrances++;
 }
 assert.deepEqual(errors,[]);console.log(`PASS: 480 premium bubble/frame/profile assets; ${checked} theme/viewport geometry cases; short/long/URL text; real mini/full/own profile controls; equipped skin reset; DM list/header/message frames; ${entrances} real entrance scenes`);await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});
