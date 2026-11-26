'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const {
 createLockManager
}=require('./nobility-lock-helper.cjs');

const PREFIX='lidyachat.nobility.finance.v1:';

function environment(){
 return {
  locks:createLockManager(),
  store:new Map()
 };
}

function tab(env,userId='u1'){
 const snapshot=Object.freeze({
  userId,
  token:'token-'+userId
 });

 const state=Object.freeze({
  kind:'action',
  enabled:true,
  action:'activate',
  rank:1,
  cost:'400000',
  revision:'a'.repeat(64)
 });

 const KEY='12345678-1234-4123-8123-123456789abc';

 let uuidCalls=0;
 let postCalls=0;
 let writes=0;
 let validSession=true;

 const window={
  isSecureContext:true,
  navigator:{locks:env.locks},

  localStorage:{
   getItem:key=>env.store.has(key)
    ?env.store.get(key):null,

   setItem:(key,value)=>{
    writes++;
    env.store.set(key,value);
   },

   removeItem:key=>env.store.delete(key)
  },

  LidyaNobilityAPI:{
   sameSession:s=>validSession&&s===snapshot,

   newRequestId:()=>{
    uuidCalls++;
    return KEY;
   },

   action:async(...args)=>{
    postCalls++;

    return {
     ok:true,
     action:args[1],
     applied:true,
     duplicate:false,
     membership:{user_id:userId}
    };
   },

   cancel:async(s,record)=>{
    postCalls++;

    return {
     ok:true,
     user_id:record.userId,
     request_id:record.requestId,
     action:record.action,
     rank:record.rank,
     confirmed_cost:record.cost,
     confirmed_revision:record.revision,
     status:'cancelled',
     duplicate:false
    };
   }
  }
 };

 const context=vm.createContext({window});

 for(const file of [
  'nobility-pending.js',
  'nobility-submit.js'
 ]){
  vm.runInContext(
   fs.readFileSync('frontend/'+file,'utf8'),
   context
  );
 }

 const api=window.LidyaNobilitySubmit;
 const pending=window.LidyaNobilityPending;

 return {
  window,
  snapshot,
  state,
  KEY,
  api,
  pending,

  submit:signal=>api.submit(
   snapshot,state,signal
  ),

  recover:(record,signal)=>api.recover(
   snapshot,record,signal
  ),

  cancel:(record,signal)=>api.cancel(
   snapshot,record,signal
  ),

  reserve:()=>pending.reserve(
   userId,state,KEY
  ),

  uuidCalls:()=>uuidCalls,
  postCalls:()=>postCalls,
  writes:()=>writes,
  setSession:value=>{validSession=value;}
 };
}

function pauseAction(t){
 let release;
 const original=t.window.LidyaNobilityAPI.action;

 t.window.LidyaNobilityAPI.action=async(...args)=>{
  await new Promise(resolve=>{release=resolve;});
  return original(...args);
 };

 return ()=>release();
}

test('Guvenli Web Locks destegi algilanir',()=>{
 const t=tab(environment());

 assert.equal(t.api.supported(),true);
});

for(const kind of [
 'insecure',
 'missing_navigator',
 'missing_locks',
 'missing_request'
]){
 test('Guvenli kilit yoksa finansal ret: '+kind,async()=>{
  const t=tab(environment());

  if(kind==='insecure'){
   t.window.isSecureContext=false;
  }else if(kind==='missing_navigator'){
   delete t.window.navigator;
  }else if(kind==='missing_locks'){
   delete t.window.navigator.locks;
  }else{
   t.window.navigator.locks={};
  }

  assert.equal(t.api.supported(),false);

  await assert.rejects(t.submit());

  assert.equal(t.uuidCalls(),0);
  assert.equal(t.writes(),0);
  assert.equal(t.postCalls(),0);
  assert.equal(t.api.busy(),false);
 });
}

test('Ayni hesap iki sekmede eszamanli gonderilemez',async()=>{
 const env=environment();
 const a=tab(env);
 const b=tab(env);

 const release=pauseAction(a);
 const first=a.submit();

 try{
  await assert.rejects(
   b.submit(),
   /Account financial action already running/
  );

  assert.equal(b.uuidCalls(),0);
  assert.equal(b.writes(),0);
  assert.equal(b.postCalls(),0);

  assert.equal(env.locks.held.size,1);
 }finally{
  release();
  await first;
 }

 assert.equal(env.locks.held.size,0);
 assert.equal(a.postCalls(),1);
});

test('Farkli hesaplar birbirini engellemez',async()=>{
 const env=environment();
 const a=tab(env,'u1');
 const b=tab(env,'u2');

 const release=pauseAction(a);
 const first=a.submit();

 try{
  const result=await b.submit();

  assert.equal(result.applied,true);
  assert.equal(b.postCalls(),1);
  assert.equal(env.locks.held.has(PREFIX+'u1'),true);
 }finally{
  release();
  await first;
 }

 assert.equal(env.locks.held.size,0);
});

test('UUID olusturulurken hesap kilidi tutulur',async()=>{
 const env=environment();
 const t=tab(env);

 const original=t.window.LidyaNobilityAPI.newRequestId;

 t.window.LidyaNobilityAPI.newRequestId=()=>{
  assert.equal(env.locks.held.has(PREFIX+'u1'),true);
  return original();
 };

 await t.submit();
});

test('Kalici kayit yazilirken kilit tutulur',async()=>{
 const env=environment();
 const t=tab(env);

 const original=t.window.localStorage.setItem;

 t.window.localStorage.setItem=(...args)=>{
  assert.equal(env.locks.held.has(PREFIX+'u1'),true);
  return original(...args);
 };

 await t.submit();
});

test('Kalici kayit temizlenirken kilit tutulur',async()=>{
 const env=environment();
 const t=tab(env);

 const original=t.window.localStorage.removeItem;

 t.window.localStorage.removeItem=(...args)=>{
  assert.equal(env.locks.held.has(PREFIX+'u1'),true);
  return original(...args);
 };

 await t.submit();

 assert.equal(env.locks.held.size,0);
});

test('Sunucu yaniti beklenirken kilit birakilmaz',async()=>{
 const env=environment();
 const t=tab(env);

 const release=pauseAction(t);
 const first=t.submit();

 try{
  assert.equal(env.locks.held.has(PREFIX+'u1'),true);
  assert.equal(t.pending.read('u1').requestId,t.KEY);
 }finally{
  release();
  await first;
 }

 assert.equal(env.locks.held.size,0);
 assert.equal(t.pending.read('u1'),null);
});

test('Ag hatasinda kilit serbest kalir kayit korunur',async()=>{
 const env=environment();
 const t=tab(env);

 t.window.LidyaNobilityAPI.action=async()=>{
  throw new Error('Network error');
 };

 await assert.rejects(t.submit());

 assert.equal(env.locks.held.size,0);
 assert.equal(t.api.busy(),false);
 assert.equal(t.pending.read('u1').requestId,t.KEY);
});

test('Ag hatasi sonrasi diger sekme kaydi kurtarabilir',async()=>{
 const env=environment();
 const a=tab(env);
 const b=tab(env);

 a.window.LidyaNobilityAPI.action=async()=>{
  throw new Error('Network error');
 };

 await assert.rejects(a.submit());

 const record=b.pending.read('u1');

 await b.recover(record);

 assert.equal(b.uuidCalls(),0);
 assert.equal(b.postCalls(),1);
 assert.equal(b.pending.read('u1'),null);
 assert.equal(env.locks.held.size,0);
});

test('Abort sonrasi kilit birakilir kayit korunur',async()=>{
 const env=environment();
 const t=tab(env);
 const controller=new AbortController();

 const original=t.window.LidyaNobilityAPI.action;

 t.window.LidyaNobilityAPI.action=async(...args)=>{
  controller.abort();
  return original(...args);
 };

 await assert.rejects(t.submit(controller.signal));

 assert.equal(env.locks.held.size,0);
 assert.equal(t.pending.read('u1').requestId,t.KEY);
});

test('Onceden abort edilen istek kilit almaz',async()=>{
 const env=environment();
 const t=tab(env);
 const controller=new AbortController();

 controller.abort();

 await assert.rejects(t.submit(controller.signal));

 assert.equal(env.locks.events.length,0);
 assert.equal(t.uuidCalls(),0);
});

test('Kilit alinirken oturum degisirse islem reddedilir',async()=>{
 const env=environment();
 const t=tab(env);

 const original=env.locks.request.bind(env.locks);

 env.locks.request=(name,options,callback)=>{
  return original(name,options,lock=>{
   t.setSession(false);
   return callback(lock);
  });
 };

 await assert.rejects(t.submit());

 assert.equal(t.uuidCalls(),0);
 assert.equal(t.writes(),0);
 assert.equal(t.postCalls(),0);
 assert.equal(env.locks.held.size,0);
});

for(const mode of ['recover','cancel']){
 test('Gonderim surerken diger sekmede '+mode+' engellenir',async()=>{
  const env=environment();
  const a=tab(env);
  const b=tab(env);

  const release=pauseAction(a);
  const first=a.submit();

  try{
   const record=b.pending.read('u1');

   await assert.rejects(
    b[mode](record),
    /Account financial action already running/
   );

   assert.equal(b.postCalls(),0);
   assert.equal(b.uuidCalls(),0);
  }finally{
   release();
   await first;
  }
 });

 test('Kilit destegi yoksa '+mode+' kaydi korur',async()=>{
  const t=tab(environment());
  const record=t.reserve();

  delete t.window.navigator;

  await assert.rejects(t[mode](record));

  assert.equal(t.postCalls(),0);
  assert.equal(t.pending.read('u1').requestId,t.KEY);
 });
}

test('Kesin iptal ortak hesap kilidini kullanir',async()=>{
 const env=environment();
 const t=tab(env);
 const record=t.reserve();

 const original=t.window.LidyaNobilityAPI.cancel;

 t.window.LidyaNobilityAPI.cancel=async(...args)=>{
  assert.equal(env.locks.held.has(PREFIX+'u1'),true);
  return original(...args);
 };

 await t.cancel(record);

 assert.equal(t.pending.read('u1'),null);
 assert.equal(env.locks.held.size,0);
});

test('Kilit saglayici hatasinda finansal islem baslamaz',async()=>{
 const env=environment();
 const t=tab(env);

 env.locks.request=async()=>{
  throw new Error('Lock provider unavailable');
 };

 await assert.rejects(t.submit());

 assert.equal(t.uuidCalls(),0);
 assert.equal(t.writes(),0);
 assert.equal(t.postCalls(),0);
 assert.equal(t.api.busy(),false);
});

test('Gecersiz kilit kimligi reddedilir',async()=>{
 const env=environment();
 const t=tab(env);

 env.locks.request=async(name,options,callback)=>{
  return callback({
   name:'wrong-account',
   mode:'exclusive'
  });
 };

 await assert.rejects(t.submit());

 assert.equal(t.uuidCalls(),0);
 assert.equal(t.writes(),0);
 assert.equal(t.postCalls(),0);
});

test('Paylasimli kilit finansal islem icin reddedilir',async()=>{
 const env=environment();
 const t=tab(env);

 env.locks.request=async(name,options,callback)=>{
  return callback({
   name,
   mode:'shared'
  });
 };

 await assert.rejects(t.submit());

 assert.equal(t.uuidCalls(),0);
 assert.equal(t.postCalls(),0);
});
