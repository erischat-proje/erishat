const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({
  headless:true,
  args:['--no-sandbox']
 });

 try{
  const page=await browser.newPage({
   viewport:{width:393,height:820}
  });

  const errors=[];

  page.on('pageerror',e=>errors.push(e.message));

  await page.setContent(`
   <!doctype html>
   <html data-eris-theme="light">
   <head>
    <meta name="viewport"
          content="width=device-width,initial-scale=1">
   </head>
   <body>
    <main class="app">
     <header class="top">LidyaChat</header>
     <div class="content">
      <div id="messages" class="view show">Mesajlar</div>
     </div>
     <nav class="nav">Alt navigasyon</nav>
    </main>
   </body>
   </html>
  `);

  const html=fs.readFileSync(
   'frontend/erischat-main.html','utf8'
  ).replace(
   /<script\b[^>]*>[\s\S]*?<\/script>/gi,''
  );

  const styles=html.matchAll(
   /<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*href=["']\.\/([^"'?]+\.css)(?:\?[^"']*)?["'][^>]*>/gi
  );

  for(const match of styles){
   await page.addStyleTag({
    content:match[2]
     ?fs.readFileSync('frontend/'+match[2],'utf8')
     :match[1]
   });
  }

  await page.evaluate(()=>{
   window.ErisSocialMedia={
    icon:()=>'<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4Z"/></svg>',
    bindDialog:()=>{},
    cancel:()=>{}
   };

   window.ErisPlatform={
    getAccessToken:()=> 'browser-test',
    api:async path=>{
     if(path==='/users/peer'){
      return {
       id:'peer',
       nickname:'Premium Kullanici',
       public_id:'1234567890',
       age:31,
       bio:'LidyaChat profil tasarimi',
       followers_count:123,
       following_count:456
      };
     }

     return [];
    }
   };
  });

  for(const name of [
   'device-layout.js',
   'explore-comments.js',
   'social-feed-live.js',
   'user-profile-navigation.js',
   'room-fan-ranking.js'
  ]){
   await page.addScriptTag({
    content:fs.readFileSync(
     'frontend/'+name,'utf8'
    )
   });
  }

  await page.evaluate(()=>
   window.openUserProfile('peer')
  );

  await page.waitForSelector(
   '[data-profile-posts] .ec-empty-art svg'
  );

  let passed=0;

  const evidence='public-profile-browser-results';

  fs.mkdirSync(evidence,{recursive:true});

  for(const theme of ['light','dark']){
   for(const [width,height] of [
    [320,568],
    [360,640],
    [393,820],
    [412,915],
    [768,1024],
    [667,375]
   ]){
    await page.setViewportSize({width,height});

    await page.evaluate(theme=>{
     document.documentElement.dataset.erisTheme=theme;

     window.ErisDeviceLayout.refresh();
    },theme);

    await page.waitForFunction(()=>{
     const r=document.querySelector(
      '#erisUserProfileModal'
     ).getBoundingClientRect();

     return Math.abs(r.width-innerWidth)<2 &&
            Math.abs(r.height-innerHeight)<2;
    });

    const result=await page.evaluate(()=>{
     const root=document.querySelector(
      '#erisUserProfileModal'
     );

     const panel=root.firstElementChild;

     panel.scrollTop=0;

     const rect=e=>e.getBoundingClientRect();

     const stats=[...root.querySelectorAll(
      '.eris-profile-stats>div'
     )].map(rect);

     const icon=rect(root.querySelector(
      '.ec-empty-art svg'
     ));

     const avatar=rect(root.querySelector(
      '[data-profile-photo]'
     ));

     const surface=rect(panel);

     return {
      width:rect(root).width,
      height:rect(root).height,

      navHidden:getComputedStyle(
       document.querySelector('.app>.nav')
      ).visibility==='hidden',

      headerHidden:getComputedStyle(
       document.querySelector('.app>.top')
      ).visibility==='hidden',

      horizontalOverflow:
       panel.scrollWidth-panel.clientWidth,

      statsAligned:stats.every(r=>
       Math.abs(r.top-stats[0].top)<2
      ),

      iconWidth:icon.width,
      iconHeight:icon.height,

      avatarCentered:Math.abs(
       avatar.left+avatar.width/2-
       surface.left-surface.width/2
      )<3,

      foreground:[
       document.elementFromPoint(innerWidth/2,5),
       document.elementFromPoint(innerWidth/2,innerHeight-5)
      ].every(e=>e?.closest('#erisUserProfileModal'))
     };
    });

    const label=theme+' '+width+'x'+height;

    assert.ok(result.navHidden,label);
    assert.ok(result.headerHidden,label);
    assert.ok(result.horizontalOverflow<=1,label);
    assert.ok(result.statsAligned,label);
    assert.ok(result.avatarCentered,label);
    assert.ok(result.foreground,label);

    assert.ok(result.iconWidth>0,label);
    assert.ok(result.iconWidth<=28,label);
    assert.ok(result.iconHeight<=28,label);

    if(width===393){
     await page.screenshot({
      path:evidence+'/'+theme+'-393.png'
     });
    }

    console.log('PASS:',label,JSON.stringify(result));

    passed++;
   }
  }

  await page.setViewportSize({
   width:393,height:820
  });

  await page.locator(
   '#erisUserProfileModal [data-fans]'
  ).click();

  await page.waitForSelector('.personal-fan-overlay');

  const layers=await page.evaluate(()=>({
   profile:Number(getComputedStyle(
    document.querySelector('#erisUserProfileModal')
   ).zIndex),

   fan:Number(getComputedStyle(
    document.querySelector('.personal-fan-overlay')
   ).zIndex)
  }));

  assert.ok(layers.fan>layers.profile);

  await page.click('.personal-fan-close');

  assert.equal(
   await page.locator('#erisUserProfileModal').count(),1
  );

  await page.click('#erisUserProfileModal [data-close]');

  assert.equal(
   await page.locator('#erisUserProfileModal').count(),0
  );

  assert.equal(
   await page.locator('.app>.nav').evaluate(
    e=>getComputedStyle(e).visibility
   ),
   'visible'
  );

  assert.deepEqual(errors,[]);

  console.log('PASS: Fan window and profile return');
  console.log('PASS: Navigation restored');
  console.log('=== '+passed+' BROWSER LAYOUTS PASS ===');

 }finally{
  await browser.close();
 }
})().catch(e=>{
 console.error(e);
 process.exit(1);
});
