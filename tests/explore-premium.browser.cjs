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
   <body>
    <main class="app">
     <div class="content">
      <div id="explore" class="view show">
       <h1 class="title">Keşfet</h1>
       <div class="tabs"></div>
       <div id="rooms"></div>
       <div id="people"></div>
       <div id="followingRooms"></div>
      </div>
     </div>
    </main>
   </body>
   </html>
  `);

  const html=fs.readFileSync(
   'frontend/erischat-main.html','utf8'
  ).replace(
   /<script\b[^>]*>[\s\S]*?<\/script>/gi,''
  );

  for(const match of html.matchAll(
   /<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*href=["']\.\/([^"'?]+\.css)(?:\?[^"']*)?["'][^>]*>/gi
  )){
   await page.addStyleTag({
    content:match[2]
     ?fs.readFileSync('frontend/'+match[2],'utf8')
     :match[1]
   });
  }

  await page.evaluate(async()=>{
   window.calls=[];

   // Generate a real local video without external media.
   const canvas=document.createElement('canvas');
   canvas.width=160;
   canvas.height=90;

   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#b69b60';
   ctx.fillRect(0,0,160,90);

   const stream=canvas.captureStream(15);

   const recorder=new MediaRecorder(stream,{
    mimeType:'video/webm'
   });

   const chunks=[];

   const finished=new Promise(resolve=>{
    recorder.ondataavailable=e=>{
     if(e.data.size)chunks.push(e.data);
    };

    recorder.onstop=()=>resolve(
     new Blob(chunks,{type:'video/webm'})
    );
   });

   recorder.start();

   let frame=0;

   const timer=setInterval(()=>{
    ctx.fillStyle=frame++%2?'#b69b60':'#75613b';
    ctx.fillRect(0,0,160,90);
   },70);

   await new Promise(r=>setTimeout(r,1800));

   clearInterval(timer);
   recorder.stop();

   const clip=await finished;

   stream.getTracks().forEach(t=>t.stop());

   window.fetch=async()=>new Response(clip,{
    status:200,
    headers:{'Content-Type':'video/webm'}
   });

   window.ErisSocialMedia={
    icon:()=>'<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4Z"/></svg>',
    bindDialog:()=>{},
    cancel:()=>{}
   };

   window.ErisPlatform={
    getAccessToken:()=> 'browser-test',

    postMediaUrl:p=>p,
    storyMediaUrl:p=>p,

    stories:async()=>[{
     id:77,
     user_id:'story-author',
     nickname:'Hikaye test',
     media_kind:'video',
     mime_type:'video/webm',
     media_url:'/stories/77/media'
    }],

    api:async(path,opt={})=>{
     calls.push({
      path,
      method:opt.method||'GET'
     });

     if(path.startsWith('/explore/feed')){
      return {
       items:[{
        id:1,
        user_id:'author',
        nickname:'LidyaChat Test',
        caption:'Premium gonderi',
        created_at:'2026-11-27T12:00:00Z',
        media_url:'/posts/1/media',
        media_kind:'video',
        mime_type:'video/webm',
        like_count:3,
        comment_count:0
       }],
       has_more:false,
       next_cursor:null
      };
     }

     return {};
    }
   };
  });

  for(const name of [
   'device-layout.js',
   'explore-comments.js',
   'social-feed-live.js',
   'stories-live.js'
  ]){
   await page.addScriptTag({
    content:fs.readFileSync('frontend/'+name,'utf8')
   });
  }

  await page.evaluate(()=>ErisSocialFeed.load());

  await page.waitForSelector('.ec-feed-actions');

  const evidence='explore-premium-browser-results';
  fs.mkdirSync(evidence,{recursive:true});

  let passed=0;

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

    const bar=page.locator('.ec-feed-actions').first();

    await bar.scrollIntoViewIfNeeded();

    const result=await bar.evaluate(el=>{
     const buttons=[...el.querySelectorAll('button')];
     const rects=buttons.map(b=>b.getBoundingClientRect());

     return {
      buttons:buttons.length,

      aligned:rects.every(r=>
       Math.abs(r.top-rects[0].top)<2
      ),

      equalWidth:rects.every(r=>
       Math.abs(r.width-rects[0].width)<2
      ),

      icons:buttons.every(b=>{
       const icon=b.querySelector('svg');
       const r=icon?.getBoundingClientRect();

       return r&&r.width>=18&&r.width<=23;
      }),

      overflow:el.scrollWidth-el.clientWidth,

      contained:rects.every(r=>
       r.left>=-1&&r.right<=innerWidth+1
      ),

      accessible:rects.every(r=>r.height>=44)
     };
    });

    const label=theme+' '+width+'x'+height;

    assert.equal(result.buttons,3,label);
    assert.ok(result.aligned,label);
    assert.ok(result.equalWidth,label);
    assert.ok(result.icons,label);
    assert.ok(result.overflow<=1,label);
    assert.ok(result.contained,label);
    assert.ok(result.accessible,label);

    if(width===393){
     await bar.screenshot({
      path:evidence+'/'+theme+'-393.png'
     });
    }

    console.log('PASS:',label,JSON.stringify(result));
    passed++;
   }
  }

  await page.setViewportSize({width:393,height:820});

  const save=page.locator('[data-feed-action="save"]');

  await save.click();

  await page.waitForFunction(()=>
   document.querySelector('[data-feed-action="save"]')
    .getAttribute('aria-pressed')==='true'
  );

  assert.equal(await save.innerText(),'Kaydedildi');
  assert.equal(await save.locator('svg').count(),1);

  await save.click();

  await page.waitForFunction(()=>
   document.querySelector('[data-feed-action="save"]')
    .getAttribute('aria-pressed')==='false'
  );

  assert.equal(await save.innerText(),'Kaydet');

  console.log('PASS: Save and unsave browser actions');

  const postVideo=page.locator('.ec-social-video').first();

  await postVideo.scrollIntoViewIfNeeded();

  await page.waitForFunction(()=>{
   const video=document.querySelector('.ec-social-video');
   return video&&video.readyState>=2;
  });

  const verifyVideo=video=>video.evaluate(v=>{
   const event=new MouseEvent('contextmenu',{
    bubbles:true,cancelable:true
   });

   v.dispatchEvent(event);

   return {
    noDownload:v.controlsList.contains('nodownload'),
    contextMenuBlocked:event.defaultPrevented,
    controls:v.controls,
    inline:v.playsInline
   };
  });

  const expected={
   noDownload:true,
   contextMenuBlocked:true,
   controls:true,
   inline:true
  };

  assert.deepEqual(await verifyVideo(postVideo),expected);

  await postVideo.evaluate(async v=>{
   v.currentTime=0;
   v.muted=true;
   await v.play();
  });

  await page.waitForFunction(()=>
   document.querySelector('.ec-social-video').currentTime>.1
  );

  await postVideo.evaluate(v=>v.pause());

  console.log('PASS: Real post video playback');
  console.log('PASS: Post download control disabled');

  await page.evaluate(()=>ErisChatStories.load());

  await page.locator(
   '.eris-story:not(.eris-story-add)'
  ).first().click();

  const storyVideo=page.locator('.eris-story-viewer video');

  await storyVideo.waitFor();

  assert.deepEqual(await verifyVideo(storyVideo),expected);

  await page.evaluate(()=>ErisChatStories.close());

  assert.equal(await storyVideo.count(),0);

  console.log('PASS: Story download control disabled');

  assert.deepEqual(errors,[]);

  console.log('=== '+passed+' EXPLORE BROWSER LAYOUTS PASS ===');

 }finally{
  await browser.close();
 }
})().catch(e=>{
 console.error(e);
 process.exit(1);
});
