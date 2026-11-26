const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(
 'frontend/nobility-api.js','utf8'
);

function setup(){
 let token='test-token-1';
 const calls=[];

 const window={
  ERIS_API:'https://test.invalid/v1',
  ErisAuth:{
   user:{id:'u1'},
   getToken:()=>token
  }
 };

 const context={
  window,
  AbortController,
  setTimeout,
  clearTimeout,
  fetch:async(url,options)=>{
   calls.push({url,options});
   return {
    ok:true,
    json:async()=>(
     url.endsWith('/me')?
     {
      ok:true,
      user_id:'u1',
      revision:'a'.repeat(64),
      enabled:true,
      configuration_valid:true,
      rank:0,
      points:'800000',
      active:false,
      privileges:[]
     }:
     {ok:true}
    )
   };
  }
 };

 vm.createContext(context);
 vm.runInContext(source,context);

 return {
  api:window.LidyaNobilityAPI,
  window,
  context,
  calls,
  setToken:value=>{token=value}
 };
}

test('Oturum olmadan erisim engeli',()=>{
 const s=setup();
 s.setToken('');
 assert.throws(()=>s.api.session());
});

test('Guvenli GET ve token baglantisi',async()=>{
 const s=setup();

 await s.api.load(s.api.session());

 assert.equal(s.calls.length,2);

 for(const call of s.calls){
  assert.equal(call.options.method,'GET');
  assert.equal(
   call.options.headers.Authorization,
   'Bearer test-token-1'
  );
  assert.equal(call.options.cache,'no-store');
  assert.ok(call.url.startsWith(
   'https://test.invalid/v1/nobility/'
  ));
 }
});

test('Hesap degisikligi engeli',async()=>{
 const s=setup();
 const snapshot=s.api.session();

 s.window.ErisAuth.user.id='u2';

 assert.equal(
  s.api.sameSession(snapshot),false
 );

 await assert.rejects(
  s.api.load(snapshot)
 );

 assert.equal(s.calls.length,0);
});

test('Token degisikligi engeli',async()=>{
 const s=setup();
 const snapshot=s.api.session();

 s.setToken('test-token-2');

 await assert.rejects(
  s.api.load(snapshot)
 );

 assert.equal(s.calls.length,0);
});

test('Gecikmis eski hesap yaniti reddedilir',async()=>{
 const s=setup();
 const snapshot=s.api.session();

 s.context.fetch=async()=>({
  ok:true,
  json:async()=>{
   s.setToken('test-token-2');
   return {ok:true};
  }
 });

 await assert.rejects(
  s.api.load(snapshot)
 );
});

test('Iptal edilen istek reddedilir',async()=>{
 const s=setup();
 const controller=new AbortController();

 controller.abort();

 await assert.rejects(
  s.api.load(
   s.api.session(),controller.signal
  )
 );
});

test('Gecersiz sayfalama engeli',()=>{
 const s=setup();

 for(const offset of [-1,10001,1.5,'20']){
  assert.throws(()=>s.api.history(
   s.api.session(),offset
  ));
 }
});

test('Islem gecmisi sayfalama',async()=>{
 const s=setup();

 await s.api.history(s.api.session(),20);

 assert.equal(
  s.calls[0].url,
  'https://test.invalid/v1/nobility/history?limit=20&offset=20'
 );
});

test('HTTP hatasi reddedilir',async()=>{
 const s=setup();

 s.context.fetch=async()=>({
  ok:false,
  status:401
 });

 await assert.rejects(
  s.api.load(s.api.session()),
  error=>error.status===401
 );
});

test('Gecersiz API yaniti reddedilir',async()=>{
 const s=setup();

 s.context.fetch=async()=>({
  ok:true,
  json:async()=>({ok:false})
 });

 await assert.rejects(
  s.api.load(s.api.session())
 );
});

for(const userId of ['u2','',null,undefined]){
 test('GET hesap izolasyonu: '+userId,async()=>{
  const s=setup();

  s.context.fetch=async(url)=>({
   ok:true,
   json:async()=>(
    url.endsWith('/me')?
    {
     ok:true,
     user_id:userId,
     revision:'a'.repeat(64),
     enabled:true,
     configuration_valid:true,
     rank:0,
     points:'800000',
     active:false,
     privileges:[]
    }:
    {ok:true}
   )
  });

  await assert.rejects(
   s.api.load(s.api.session())
  );
 });
}

test('Bos hesap kimligi reddedilir',()=>{
 const s=setup();

 s.window.ErisAuth.user.id='';

 assert.throws(()=>s.api.session());
});

test('Oturum bilgisi degistirilemez',()=>{
 const s=setup();

 assert.equal(
  Object.isFrozen(s.api.session()),
  true
 );
});
