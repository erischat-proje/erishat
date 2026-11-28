const {JSDOM}=require('jsdom');
const fs=require('fs');
const assert=require('node:assert/strict');

(async()=>{
  const html=fs.readFileSync(
    'frontend/erischat-main.html','utf8'
  );

  const tag=html.match(
    /<button\b[^>]*data-home-privacy="1"[^>]*>/
  );

  assert.ok(tag,'Home privacy button missing');

  const dom=new JSDOM(
    '<section id="home">'+tag[0]+'Gizlilik</button></section>'+
    '<section id="profile"></section>'+
    '<section id="anon"><div data-privacy-page></div></section>',
    {url:'https://fixture.test',runScripts:'outside-only'}
  );

  const w=dom.window,d=w.document;
  const tick=()=>new Promise(r=>setTimeout(r,20));

  let state={},writes=0,allowLeave=false;
  w.confirm=()=>allowLeave;
  w.ErisAuth={getMe:async()=>({id:'fixture-user'})};
  w.ErisPlatform={
    getAccessToken:()=>'fixture-token',
    api:async(p,o)=>{
      assert.equal(p,'/privacy-center');
      if(o?.method==='PATCH'){
        writes++;
        Object.assign(state,JSON.parse(o.body).changes);
      }
      return {...state};
    }
  };

  for(const file of [
    'privacy-center.js',
    'privacy-live.js',
    'profile-hub.js'
  ]){
    w.eval(fs.readFileSync('frontend/'+file,'utf8'));
  }

  await tick();

  const home=d.querySelector('[data-home-privacy]');
  const profile=d.querySelector(
    '#erisProfileHub [data-tab="privacy"]'
  );

  assert.ok(home&&profile);

  home.onclick=new w.Function(
    'event',home.getAttribute('onclick')
  );

  home.click();
  await tick();

  const overlay=d.querySelector('.eph-overlay');
  const body=overlay.querySelector('.eph-body');
  const switches=()=>Array.from(
    body.querySelectorAll('[role="switch"]')
  ).map(b=>b.dataset.key);

  assert.equal(overlay.hidden,false);
  assert.equal(switches().length,10);
  const original=switches();

  console.log('PASS: HOME PRIVACY OPEN');

  body.querySelector('[data-key="hide_fans"]').click();
  overlay.querySelector('.eph-close').click();

  assert.equal(overlay.hidden,false);
  assert.equal(writes,0);

  console.log('PASS: UNSAVED CHANGE PROTECTION');

  allowLeave=true;
  overlay.querySelector('.eph-close').click();

  assert.equal(overlay.hidden,true);
  assert.equal(d.activeElement,home);

  console.log('PASS: HOME RETURN FOCUS');

  profile.click();
  await tick();

  assert.equal(overlay.hidden,false);
  assert.deepEqual(switches(),original);
  assert.equal(d.querySelectorAll('.eph-overlay').length,1);

  console.log('PASS: SAME PRIVACY MENU');

  overlay.querySelector('.eph-close').click();

  assert.equal(d.activeElement,profile);
  assert.equal(writes,0);

  console.log('PASS: PROFILE RETURN FOCUS');
  console.log('PASS: NO UNAUTHORIZED SETTINGS WRITE');
  console.log('=== HOME PRIVACY UNIFIED V1.2 PASS ===');

  dom.window.close();
})().catch(e=>{
  console.error(e);
  process.exitCode=1;
});
