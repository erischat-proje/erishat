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

  await page.route('https://king.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;

   if(path==='/'){
    return route.fulfill({
     contentType:'text/html',
     body:`<!doctype html>
      <html data-eris-theme="light">
      <body>
       <div id="eris-notice-stack"
        style="position:fixed">
       </div>
      </body></html>`
    });
   }

   if(path.includes('..'))return route.abort();

   for(const file of ['frontend'+path,'.'+path]){
    if(fs.existsSync(file)&&fs.statSync(file).isFile()){
     return route.fulfill({path:file});
    }
   }

   return route.abort();
  });

  await page.goto('https://king.test/');

  const html=fs.readFileSync(
   'frontend/erischat-main.html','utf8'
  ).replace(
   /<script\b[^>]*>[\s\S]*?<\/script>/gi,''
  );

  for(const m of html.matchAll(
   /<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*href=["']\.\/([^"'?]+\.css)(?:\?[^"']*)?["'][^>]*>/gi
  )){
   await page.addStyleTag({
    content:m[2]
     ?fs.readFileSync('frontend/'+m[2],'utf8')
     :m[1]
   });
  }

  for(const file of [
   'nobility-catalog.js',
   'nobility-assets.js',
   'nobility-banners.js'
  ]){
   await page.addScriptTag({
    content:fs.readFileSync('frontend/'+file,'utf8')
   });
  }

  const evidence='king-final-browser-results';
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
    },theme);

    for(const kind of [
     'gift_banner',
     'activation_banner',
     'daily_banner',
     'room_welcome'
    ]){
     const data={
      type:'nobility_banner',
      kind,
      rank:4,
      scope:kind==='room_welcome'?'room':'global',
      id:'king-test-'+passed,
      nickname:'Devil🖤',
      action:'activate'
     };

     if(kind==='gift_banner'){
      data.gift={
       name:'Toprak Bardak',
       quantity:50,
       image_url:'/hediyesistemi/28.png'
      };
     }

     const shown=await page.evaluate(data=>{
      LidyaNobilityBanners.clear();
      return LidyaNobilityBanners.show(data);
     },data);

     assert.equal(shown,true);

     await page.waitForFunction(()=>{
      const card=document.querySelector(
       '.lidya-nobility-live-banner'
      );

      return card&&[...card.querySelectorAll('img')]
       .every(img=>img.complete&&img.naturalWidth>0);
     });

     const card=page.locator('.lidya-nobility-live-banner');

     await page.waitForTimeout(350);

     const result=await card.evaluate(el=>{
      const rect=el.getBoundingClientRect();

      const contained=node=>{
       const r=node.getBoundingClientRect();

       return r.width>0&&r.height>0&&
        r.left>=rect.left-1&&
        r.right<=rect.right+1&&
        r.top>=rect.top-1&&
        r.bottom<=rect.bottom+1;
      };

      const dynamic=[...el.querySelectorAll(
       '.ln-dynamic-sender,'+
       '.ln-dynamic-artwork,'+
       '.ln-dynamic-label,'+
       '.ln-king-activation-panel'
      )];

      const stack=document.querySelector(
       '#eris-notice-stack'
      );

      return {
       fullscreenSafe:
        rect.left>=-1&&rect.top>=-1&&
        rect.right<=innerWidth+1&&
        rect.bottom<=innerHeight+1,

       dynamicContained:
        dynamic.length>0&&dynamic.every(contained),

       noticeSafe:
        parseFloat(getComputedStyle(stack).top)>=
        rect.bottom-2,

       nickname:el.querySelector(
        '.ln-dynamic-sender,.ln-king-activation-name'
       )?.textContent,

       quantity:el.querySelector(
        '.ln-king-gift-quantity'
       )?.textContent,

       fallback:el.className.includes('fallback')
        ||el.className.includes('template-failed')
      };
     });

     const label=theme+' '+width+'x'+height+' '+kind;

     assert.ok(result.fullscreenSafe,label);
     assert.ok(result.dynamicContained,label);
     assert.ok(result.noticeSafe,label);

     assert.equal(result.nickname,'Devil🖤',label);
     assert.equal(result.fallback,false,label);

     if(kind==='gift_banner'){
      assert.equal(result.quantity,'×50',label);
     }

     if(width===393){
      await card.screenshot({
       path:evidence+'/'+theme+'-'+kind+'.png'
      });
     }

     console.log('PASS:',label,JSON.stringify(result));

     passed++;
    }
   }
  }

  await page.evaluate(()=>LidyaNobilityBanners.clear());

  assert.equal(
   await page.locator('.lidya-nobility-live-banner').count(),
   0
  );

  assert.deepEqual(errors,[]);
  assert.equal(passed,48);

  console.log('=== 48 KING BROWSER LAYOUTS PASS ===');

 }finally{
  await browser.close();
 }
})().catch(error=>{
 console.error(error);
 process.exit(1);
});
