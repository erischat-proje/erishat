const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require(
 process.env.ERIS_JSDOM_MODULE||'jsdom'
);

function setup(){
 const dom=new JSDOM(`
  <div id="chat" class="show"
       style="position:fixed;z-index:100000">
  </div>
  <div id="erisUserProfileModal"
       style="position:fixed;z-index:52000">
   <button id="trigger">Hayran listesi</button>
  </div>
 `,{
  runScripts:'outside-only',
  url:'https://example.test'
 });

 const w=dom.window;
 const d=w.document;

 w.ErisPlatform={
  getAccessToken:()=> 'test-session',
  api:async()=>[]
 };

 w.eval(fs.readFileSync(
  'frontend/room-fan-ranking.js','utf8'
 ));

 w.eval(fs.readFileSync(
  'frontend/lidya-android-back-v1.js','utf8'
 ));

 const trigger=d.querySelector('#trigger');

 trigger.focus();

 w.ErisPersonalFanRanking('test-user');

 return {dom,w,d,trigger};
}

test('Fan window above DM and profile',()=>{
 const {dom,w,d}=setup();

 try{
  const fan=d.querySelector('.personal-fan-overlay');

  const z=Number(w.getComputedStyle(fan).zIndex);

  assert.ok(z>100090);
  assert.ok(z<100120);
  assert.equal(fan.parentElement,d.body);
 }finally{dom.window.close()}
});

test('Close restores profile and DM',()=>{
 const {dom,d,trigger}=setup();

 try{
  d.querySelector('.personal-fan-close').click();

  assert.equal(d.querySelector('.personal-fan-overlay'),null);
  assert.ok(d.querySelector('#chat.show'));
  assert.ok(d.querySelector('#erisUserProfileModal'));
  assert.equal(d.activeElement,trigger);
 }finally{dom.window.close()}
});

test('Android back closes fan window first',()=>{
 const {dom,w,d}=setup();

 try{
  assert.equal(w.LidyaAndroidBack.handle(),true);

  assert.equal(d.querySelector('.personal-fan-overlay'),null);
  assert.ok(d.querySelector('#chat.show'));
  assert.ok(d.querySelector('#erisUserProfileModal'));
 }finally{dom.window.close()}
});

test('Repeated opening keeps one fan window',()=>{
 const {dom,w,d}=setup();

 try{
  w.ErisPersonalFanRanking('second-user');

  assert.equal(
   d.querySelectorAll('.personal-fan-overlay').length,1
  );
 }finally{dom.window.close()}
});

test('Critical vault confirmation keeps priority',()=>{
 const {dom,w,d}=setup();

 try{
  const vault=d.createElement('div');
  vault.className='dm-vault-modal';
  vault.style.zIndex='100120';

  const close=d.createElement('button');
  close.dataset.no='';
  close.onclick=()=>vault.remove();

  vault.append(close);
  d.body.append(vault);

  assert.equal(w.LidyaAndroidBack.handle(),true);

  assert.equal(d.querySelector('.dm-vault-modal'),null);
  assert.ok(d.querySelector('.personal-fan-overlay'));
 }finally{dom.window.close()}
});
