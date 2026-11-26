const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createLockManager}=require('./nobility-lock-helper.cjs');

function setup(){
 const store=new Map();
 const calls=[];

 const snapshot=Object.freeze({
  userId:'u1',
  token:'test-token'
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

 const window={
  isSecureContext:true,
  navigator:{locks:createLockManager()},
  localStorage:{
   getItem:key=>store.has(key)?store.get(key):null,
   setItem:(key,value)=>store.set(key,value),
   removeItem:key=>store.delete(key)
  },
  LidyaNobilityAPI:{
   sameSession:s=>s===snapshot,
   newRequestId:()=>KEY,
   action:async(...args)=>{
    calls.push(args);

    return {
     ok:true,
     action:args[1],
     applied:true,
     duplicate:false,
     membership:{user_id:'u1'}
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

 return {
  window,
  store,
  calls,
  snapshot,
  state,
  KEY,
  api:window.LidyaNobilitySubmit,
  pending:window.LidyaNobilityPending,
  submit:signal=>window.LidyaNobilitySubmit.submit(
   snapshot,state,signal
  )
 };
}

test('Basarili finansal gonderim',async()=>{
 const s=setup();

 const result=await s.submit();

 assert.equal(result.applied,true);
 assert.equal(s.calls.length,1);
 assert.equal(s.pending.read('u1'),null);
 assert.equal(s.api.busy(),false);
});

test('Orijinal finansal onay APIye iletilir',async()=>{
 const s=setup();

 await s.submit();

 const args=s.calls[0];

 assert.equal(args[0],s.snapshot);
 assert.equal(args[1],'activate');
 assert.equal(args[2],1);
 assert.equal(args[3],s.KEY);
 assert.equal(args[4].cost,'400000');
 assert.equal(args[4].revision,'a'.repeat(64));
});

test('POST oncesinde kalici kayit zorunlu',async()=>{
 const s=setup();

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  const record=s.pending.read('u1');

  assert.equal(record.requestId,s.KEY);
  assert.equal(record.cost,'400000');
  assert.equal(record.revision,'a'.repeat(64));

  return original(...args);
 };

 await s.submit();
});

test('Cift dokunma ikinci POST baslatamaz',async()=>{
 const s=setup();

 let release;

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  await new Promise(resolve=>{release=resolve;});
  return original(...args);
 };

 const first=s.submit();

 assert.equal(s.api.busy(),true);

 await assert.rejects(s.submit());

 release();

 await first;

 assert.equal(s.calls.length,1);
 assert.equal(s.api.busy(),false);
});

test('Ag hatasinda kalici kayit korunur',async()=>{
 const s=setup();

 s.window.LidyaNobilityAPI.action=async()=>{
  throw new Error('Network error');
 };

 await assert.rejects(s.submit());

 assert.equal(
  s.pending.read('u1').requestId,s.KEY
 );

 assert.equal(s.api.busy(),false);
});

test('Bekleyen islem yeni POSTu engeller',async()=>{
 const s=setup();

 s.pending.reserve('u1',s.state,s.KEY);

 await assert.rejects(s.submit());

 assert.equal(s.calls.length,0);
});

test('Depolama hatasinda POST gonderilmez',async()=>{
 const s=setup();

 s.window.localStorage.setItem=()=>{
  throw new Error('Storage unavailable');
 };

 await assert.rejects(s.submit());

 assert.equal(s.calls.length,0);
});

test('Sessiz depolama hatasinda POST engellenir',async()=>{
 const s=setup();

 s.window.localStorage.setItem=()=>{};

 await assert.rejects(s.submit());

 assert.equal(s.calls.length,0);
});

test('Eski oturum finansal islem baslatamaz',async()=>{
 const s=setup();

 s.window.LidyaNobilityAPI.sameSession=()=>false;

 await assert.rejects(s.submit());

 assert.equal(s.calls.length,0);
 assert.equal(s.pending.read('u1'),null);
});

test('Onceden iptal edilmis istek gonderilmez',async()=>{
 const s=setup();

 const controller=new AbortController();
 controller.abort();

 await assert.rejects(
  s.submit(controller.signal)
 );

 assert.equal(s.calls.length,0);
 assert.equal(s.pending.read('u1'),null);
});

test('POST sirasinda oturum degisirse kayit korunur',async()=>{
 const s=setup();

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  const result=await original(...args);

  s.window.LidyaNobilityAPI.sameSession=()=>false;

  return result;
 };

 await assert.rejects(s.submit());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('POST sirasinda iptal kaydi silmez',async()=>{
 const s=setup();

 const controller=new AbortController();
 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  const result=await original(...args);

  controller.abort();

  return result;
 };

 await assert.rejects(
  s.submit(controller.signal)
 );

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('Dogrulanmis duplicate yaniti kabul edilir',async()=>{
 const s=setup();

 s.window.LidyaNobilityAPI.action=async()=>({
  ok:true,
  action:'activate',
  applied:false,
  duplicate:true,
  membership:{user_id:'u1'}
 });

 const result=await s.submit();

 assert.equal(result.duplicate,true);
 assert.equal(s.pending.read('u1'),null);
});

for(const [name,changes] of [
 ['Yanlis hesap',{membership:{user_id:'u2'}}],
 ['Yanlis islem',{action:'renew'}],
 ['Celiskili bayrak',{duplicate:true}],
 ['Basarisiz sonuc',{ok:false}],
 ['Eksik uyelik',{membership:null}],
 ['Eksik bayrak',{applied:undefined}]
]){
 test('Gecersiz sonuc: '+name,async()=>{
  const s=setup();

  s.window.LidyaNobilityAPI.action=async()=>({
   ok:true,
   action:'activate',
   applied:true,
   duplicate:false,
   membership:{user_id:'u1'},
   ...changes
  });

  await assert.rejects(s.submit());

  assert.equal(
   s.pending.read('u1').requestId,s.KEY
  );
 });
}

test('Temizleme hatasinda finansal kayit korunur',async()=>{
 const s=setup();

 s.window.localStorage.removeItem=()=>{};

 await assert.rejects(s.submit());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
 assert.equal(s.api.busy(),false);
});

test('Sunucu reddinde kayit otomatik silinmez',async()=>{
 const s=setup();

 s.window.LidyaNobilityAPI.action=async()=>{
  const error=new Error('Conflict');
  error.status=409;
  error.code='stale_confirmation';
  throw error;
 };

 await assert.rejects(s.submit());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('Yetersiz bakiye POST baslatamaz',async()=>{
 const s=setup();

 await assert.rejects(
  s.api.submit(
   s.snapshot,
   {...s.state,kind:'topup'}
  )
 );

 assert.equal(s.calls.length,0);
 assert.equal(s.pending.read('u1'),null);
});

test('Kilitli karar POST baslatamaz',async()=>{
 const s=setup();

 await assert.rejects(
  s.api.submit(
   s.snapshot,
   {...s.state,enabled:false}
  )
 );

 assert.equal(s.calls.length,0);
});

test('Degistirilmis kalici kayit silinmez',async()=>{
 const s=setup();

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  const result=await original(...args);

  const key=[...s.store.keys()][0];
  const record=JSON.parse(s.store.get(key));

  record.revision='b'.repeat(64);

  s.store.set(key,JSON.stringify(record));

  return result;
 };

 await assert.rejects(s.submit());

 assert.equal(
  s.pending.read('u1').revision,
  'b'.repeat(64)
 );
});

test('Ag hatasinda otomatik tekrar yapilmaz',async()=>{
 const s=setup();

 let attempts=0;

 s.window.LidyaNobilityAPI.action=async()=>{
  attempts++;
  throw new Error('Network error');
 };

 await assert.rejects(s.submit());

 assert.equal(attempts,1);
 assert.equal(s.api.busy(),false);
});

function recoverySetup(){
 const s=setup();

 const record=s.pending.reserve(
  'u1',s.state,s.KEY
 );

 return {
  ...s,
  record,
  recover:signal=>s.api.recover(
   s.snapshot,record,signal
  )
 };
}

test('Kurtarma orijinal UUID kullanir',async()=>{
 const s=recoverySetup();

 s.window.LidyaNobilityAPI.newRequestId=()=>{
  throw new Error('Yeni UUID yasak');
 };

 await s.recover();

 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0][3],s.KEY);
 assert.equal(s.pending.read('u1'),null);
});

test('Kurtarma orijinal maliyeti korur',async()=>{
 const s=recoverySetup();

 await s.recover();

 assert.equal(
  s.calls[0][4].cost,'400000'
 );
});

test('Kurtarma orijinal revizyonu korur',async()=>{
 const s=recoverySetup();

 await s.recover();

 assert.equal(
  s.calls[0][4].revision,'a'.repeat(64)
 );
});

test('Tamamlanmis islem kurtarilir',async()=>{
 const s=recoverySetup();

 s.window.LidyaNobilityAPI.action=async()=>({
  ok:true,
  action:'activate',
  applied:false,
  duplicate:true,
  membership:{user_id:'u1'}
 });

 const result=await s.recover();

 assert.equal(result.duplicate,true);
 assert.equal(s.pending.read('u1'),null);
});

test('Kayit yoksa kurtarma yapilamaz',async()=>{
 const s=recoverySetup();

 s.pending.clear('u1',s.KEY);

 await assert.rejects(s.recover());

 assert.equal(s.calls.length,0);
});

test('Yanlis kayit kurtarilamaz',async()=>{
 const s=recoverySetup();

 await assert.rejects(
  s.api.recover(
   s.snapshot,
   {...s.record,rank:2}
  )
 );

 assert.equal(s.calls.length,0);
 assert.equal(s.pending.read('u1').rank,1);
});

test('Eski oturum kurtarma yapamaz',async()=>{
 const s=recoverySetup();

 s.window.LidyaNobilityAPI.sameSession=()=>false;

 await assert.rejects(s.recover());

 assert.equal(s.calls.length,0);
 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('Iptal edilen kurtarma POST gondermez',async()=>{
 const s=recoverySetup();

 const controller=new AbortController();
 controller.abort();

 await assert.rejects(
  s.recover(controller.signal)
 );

 assert.equal(s.calls.length,0);
 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('Kurtarma ag hatasinda kayit korunur',async()=>{
 const s=recoverySetup();

 let attempts=0;

 s.window.LidyaNobilityAPI.action=async()=>{
  attempts++;
  throw new Error('Network error');
 };

 await assert.rejects(s.recover());

 assert.equal(attempts,1);
 assert.equal(s.pending.read('u1').requestId,s.KEY);
 assert.equal(s.api.busy(),false);
});

for(const [status,code] of [
 [409,'stale_confirmation'],
 [409,'price_changed'],
 [409,'confirmation_required'],
 [409,'request_conflict'],
 [403,'inactive_account'],
 [401,'unauthorized'],
 [503,'nobility_disabled'],
 [503,'nobility_unavailable'],
 [500,'nobility_action_failed']
]){
 test('Kurtarma hata kaydini korur: '+code,async()=>{
  const s=recoverySetup();

  s.window.LidyaNobilityAPI.action=async()=>{
   const error=new Error(code);
   error.status=status;
   error.code=code;
   throw error;
  };

  await assert.rejects(s.recover());

  assert.equal(
   s.pending.read('u1').requestId,s.KEY
  );

  assert.equal(s.api.busy(),false);
 });
}

test('Cift kurtarma ikinci POST baslatamaz',async()=>{
 const s=recoverySetup();

 let release;

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  await new Promise(resolve=>{release=resolve;});
  return original(...args);
 };

 const first=s.recover();

 assert.equal(s.api.busy(),true);

 await assert.rejects(s.recover());

 release();

 await first;

 assert.equal(s.calls.length,1);
});

test('Kurtarma sirasinda yeni islem engellenir',async()=>{
 const s=recoverySetup();

 let release;

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  await new Promise(resolve=>{release=resolve;});
  return original(...args);
 };

 const first=s.recover();

 await assert.rejects(s.submit());

 release();

 await first;

 assert.equal(s.calls.length,1);
});

test('Kurtarma yanlis hesap sonucunu reddeder',async()=>{
 const s=recoverySetup();

 s.window.LidyaNobilityAPI.action=async()=>({
  ok:true,
  action:'activate',
  applied:true,
  duplicate:false,
  membership:{user_id:'u2'}
 });

 await assert.rejects(s.recover());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('Kurtarma sirasinda oturum degisimi',async()=>{
 const s=recoverySetup();

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  const result=await original(...args);

  s.window.LidyaNobilityAPI.sameSession=()=>false;

  return result;
 };

 await assert.rejects(s.recover());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('Kurtarma sirasinda iptal kaydi silmez',async()=>{
 const s=recoverySetup();

 const controller=new AbortController();
 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  const result=await original(...args);
  controller.abort();
  return result;
 };

 await assert.rejects(
  s.recover(controller.signal)
 );

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});

test('Kurtarma temizleme hatasini yakalar',async()=>{
 const s=recoverySetup();

 s.window.localStorage.removeItem=()=>{};

 await assert.rejects(s.recover());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
 assert.equal(s.api.busy(),false);
});

test('Kurtarma degistirilmis kaydi silmez',async()=>{
 const s=recoverySetup();

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  const result=await original(...args);

  const key=[...s.store.keys()][0];
  const record=JSON.parse(s.store.get(key));

  record.revision='b'.repeat(64);

  s.store.set(key,JSON.stringify(record));

  return result;
 };

 await assert.rejects(s.recover());

 assert.equal(
  s.pending.read('u1').revision,
  'b'.repeat(64)
 );
});


function cancellationSetup(){
 const s=setup();

 const record=s.pending.reserve(
  'u1',s.state,s.KEY
 );

 const cancelCalls=[];

 const response={
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

 s.window.LidyaNobilityAPI.cancel=async(...args)=>{
  cancelCalls.push(args);
  return {...response};
 };

 return {
  ...s,
  record,
  response,
  cancelCalls,
  cancel:signal=>s.api.cancel(
   s.snapshot,record,signal
  )
 };
}


for(const [status,duplicate] of [
 ['cancelled',false],
 ['cancelled',true],
 ['completed',true]
]){
 test(
  `Kesin iptal basarili: ${status}/${duplicate}`,
  async()=>{
   const s=cancellationSetup();

   s.response.status=status;
   s.response.duplicate=duplicate;

   const result=await s.cancel();

   assert.equal(result.status,status);
   assert.equal(result.duplicate,duplicate);
   assert.equal(s.pending.read('u1'),null);
   assert.equal(s.cancelCalls.length,1);
   assert.equal(s.calls.length,0);
   assert.equal(s.api.busy(),false);
  }
 );
}


test('Iptal orijinal kaydi kullanir',async()=>{
 const s=cancellationSetup();

 await s.cancel();

 const args=s.cancelCalls[0];

 assert.equal(args[0],s.snapshot);

 for(const field of Object.keys(s.record)){
  assert.equal(args[1][field],s.record[field]);
 }
});


test('Iptal yeni UUID olusturmaz',async()=>{
 const s=cancellationSetup();

 s.window.LidyaNobilityAPI.newRequestId=()=>{
  throw new Error('Unexpected UUID generation');
 };

 await s.cancel();

 assert.equal(s.cancelCalls.length,1);
});


for(const [field,value] of [
 ['ok',false],
 ['user_id','u2'],
 ['request_id','wrong-id'],
 ['action','upgrade'],
 ['rank',2],
 ['confirmed_cost','400001'],
 ['confirmed_revision','b'.repeat(64)],
 ['status','pending'],
 ['status','unknown'],
 ['duplicate',null],
 ['duplicate','false']
]){
 test(
  `Gecersiz iptal yaniti kaydi korur: ${field}/${value}`,
  async()=>{
   const s=cancellationSetup();

   s.response[field]=value;

   await assert.rejects(s.cancel());

   assert.equal(
    s.pending.read('u1').requestId,s.KEY
   );

   assert.equal(s.api.busy(),false);
  }
 );
}


test('Completed sonucu duplicate zorunlu',async()=>{
 const s=cancellationSetup();

 s.response.status='completed';
 s.response.duplicate=false;

 await assert.rejects(s.cancel());

 assert.equal(
  s.pending.read('u1').requestId,s.KEY
 );
});


for(const code of [
 'network_error',
 'request_conflict',
 'confirmation_unavailable',
 'account_mismatch',
 'nobility_unavailable',
 'nobility_cancellation_failed'
]){
 test(`Iptal hatasinda kayit korunur: ${code}`,async()=>{
  const s=cancellationSetup();

  let attempts=0;

  s.window.LidyaNobilityAPI.cancel=async()=>{
   attempts++;
   const error=new Error(code);
   error.code=code;
   throw error;
  };

  await assert.rejects(s.cancel());

  assert.equal(attempts,1);

  assert.equal(
   s.pending.read('u1').requestId,s.KEY
  );

  assert.equal(s.api.busy(),false);
 });
}


test('Iptal oncesi oturum degisimi',async()=>{
 const s=cancellationSetup();

 s.window.LidyaNobilityAPI.sameSession=()=>false;

 await assert.rejects(s.cancel());

 assert.equal(s.cancelCalls.length,0);
 assert.equal(s.pending.read('u1').requestId,s.KEY);
});


test('Iptal sirasinda oturum degisimi',async()=>{
 const s=cancellationSetup();

 s.window.LidyaNobilityAPI.cancel=async()=>{
  s.window.LidyaNobilityAPI.sameSession=()=>false;
  return {...s.response};
 };

 await assert.rejects(s.cancel());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
 assert.equal(s.api.busy(),false);
});


test('Onceden abort edilen iptal gonderilmez',async()=>{
 const s=cancellationSetup();

 const controller=new AbortController();
 controller.abort();

 await assert.rejects(
  s.cancel(controller.signal)
 );

 assert.equal(s.cancelCalls.length,0);
 assert.equal(s.pending.read('u1').requestId,s.KEY);
});


test('Iptal sirasinda abort kaydi korur',async()=>{
 const s=cancellationSetup();

 const controller=new AbortController();

 s.window.LidyaNobilityAPI.cancel=async()=>{
  controller.abort();
  return {...s.response};
 };

 await assert.rejects(
  s.cancel(controller.signal)
 );

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});


test('Bekleyen kayit yoksa iptal gonderilmez',async()=>{
 const s=cancellationSetup();

 s.pending.clear('u1',s.KEY);

 await assert.rejects(s.cancel());

 assert.equal(s.cancelCalls.length,0);
});


test('Farkli bekleyen kayit iptal edilemez',async()=>{
 const s=cancellationSetup();

 await assert.rejects(
  s.api.cancel(
   s.snapshot,
   {...s.record,cost:'400001'}
  )
 );

 assert.equal(s.cancelCalls.length,0);
 assert.equal(s.pending.read('u1').cost,'400000');
});


test('Iptal sirasinda degisen kayit silinmez',async()=>{
 const s=cancellationSetup();

 s.window.LidyaNobilityAPI.cancel=async()=>{
  const key=[...s.store.keys()][0];
  const record=JSON.parse(s.store.get(key));

  record.revision='b'.repeat(64);

  s.store.set(key,JSON.stringify(record));

  return {...s.response};
 };

 await assert.rejects(s.cancel());

 assert.equal(
  s.pending.read('u1').revision,'b'.repeat(64)
 );
});


test('Iptal temizleme hatasi yakalanir',async()=>{
 const s=cancellationSetup();

 s.window.localStorage.removeItem=()=>{};

 await assert.rejects(s.cancel());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
 assert.equal(s.api.busy(),false);
});


test('Iptal servisi yoksa kayit korunur',async()=>{
 const s=cancellationSetup();

 delete s.window.LidyaNobilityAPI.cancel;

 await assert.rejects(s.cancel());

 assert.equal(s.pending.read('u1').requestId,s.KEY);
});


test('Iptal ortak finansal kilidi kullanir',async()=>{
 const s=cancellationSetup();

 let release;
 let attempts=0;

 s.window.LidyaNobilityAPI.cancel=async()=>{
  attempts++;

  await new Promise(resolve=>{
   release=resolve;
  });

  return {...s.response};
 };

 const first=s.cancel();

 assert.equal(s.api.busy(),true);

 await assert.rejects(s.cancel());

 await assert.rejects(
  s.api.recover(s.snapshot,s.record)
 );

 await assert.rejects(s.submit());

 assert.equal(attempts,1);
 assert.equal(s.calls.length,0);

 release();

 await first;

 assert.equal(s.pending.read('u1'),null);
 assert.equal(s.api.busy(),false);
});


test('Kurtarma sirasinda iptal engellenir',async()=>{
 const s=cancellationSetup();

 let release;

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  await new Promise(resolve=>{
   release=resolve;
  });

  return original(...args);
 };

 const first=s.api.recover(
  s.snapshot,s.record
 );

 assert.equal(s.api.busy(),true);

 await assert.rejects(s.cancel());

 assert.equal(s.cancelCalls.length,0);

 release();

 await first;

 assert.equal(s.api.busy(),false);
 assert.equal(s.pending.read('u1'),null);
});


test('Finansal gonderim sirasinda iptal engellenir',async()=>{
 const s=setup();

 let release;

 const original=s.window.LidyaNobilityAPI.action;

 s.window.LidyaNobilityAPI.action=async(...args)=>{
  await new Promise(resolve=>{
   release=resolve;
  });

  return original(...args);
 };

 let cancellations=0;

 s.window.LidyaNobilityAPI.cancel=async()=>{
  cancellations++;
 };

 const first=s.submit();

 const record=s.pending.read('u1');

 assert.equal(s.api.busy(),true);

 await assert.rejects(
  s.api.cancel(s.snapshot,record)
 );

 assert.equal(cancellations,0);

 release();

 await first;

 assert.equal(s.api.busy(),false);
 assert.equal(s.pending.read('u1'),null);
});
