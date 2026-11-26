const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

const source=fs.readFileSync(
 'frontend/nobility-api.js','utf8'
);

const KEY='12345678-1234-4123-8123-123456789abc';

const REVISION='a'.repeat(64);

const CONFIRMATION=Object.freeze({
 revision:REVISION,
 cost:'400000'
});

function setup(){
 let token='test-token-1';
 const calls=[];

 const window={
  ERIS_API:'https://test.invalid/v1',
  crypto:webcrypto,
  ErisAuth:{
   user:{id:'u1'},
   getToken:()=>token
  }
 };

 const context={
  window,
  AbortController,
  Uint8Array,
  setTimeout,
  clearTimeout,
  fetch:async(url,options)=>{
   calls.push({url,options});

   return {
    ok:true,
    json:async()=>response(
     url.split('/').pop()
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

function response(action='activate'){
 return {
  ok:true,
  action,
  applied:true,
  duplicate:false,
  membership:{
   user_id:'u1',
   revision:REVISION,
   enabled:true,
   configuration_valid:true,
   rank:1,
   points:'400000',
   active:true,
   privileges:['badge']
  }
 };
}

for(const action of ['activate','upgrade','renew']){
 test('Guvenli POST: '+action,async()=>{
  const s=setup();

  await s.api.action(
   s.api.session(),action,1,KEY,CONFIRMATION
  );

  assert.equal(s.calls.length,1);

  const call=s.calls[0];

  assert.equal(
   call.url,
   'https://test.invalid/v1/nobility/'+action
  );

  assert.equal(call.options.method,'POST');

  assert.equal(
   call.options.headers.Authorization,
   'Bearer test-token-1'
  );

  assert.equal(
   call.options.headers['Content-Type'],
   'application/json'
  );

  assert.equal(call.options.cache,'no-store');

  assert.deepEqual(
   JSON.parse(call.options.body),
   {
    rank:1,
    request_id:KEY,
    confirmed_revision:REVISION,
    confirmed_cost:'400000'
   }
  );
 });
}

test('Gecersiz islem engeli',async()=>{
 const s=setup();

 for(const action of [
  'delete','refund','../me','',null
 ]){
  await assert.rejects(
   s.api.action(
    s.api.session(),action,1,KEY,CONFIRMATION
   )
  );
 }

 assert.equal(s.calls.length,0);
});

test('Gecersiz sinif engeli',async()=>{
 const s=setup();

 for(const rank of [
  0,5,-1,1.5,'1',true,null,NaN
 ]){
  await assert.rejects(
   s.api.action(
    s.api.session(),'activate',rank,KEY,CONFIRMATION
   )
  );
 }

 assert.equal(s.calls.length,0);
});

test('Gecersiz UUID engeli',async()=>{
 const s=setup();

 for(const key of [
  '',null,123,'invalid',
  KEY.toUpperCase(),
  KEY.replace('-4123-','-5123-'),
  KEY.replace('-8123-','-7123-')
 ]){
  await assert.rejects(
   s.api.action(
    s.api.session(),'activate',1,key,CONFIRMATION
   )
  );
 }

 assert.equal(s.calls.length,0);
});

test('Kriptografik UUID uretimi',()=>{
 const s=setup();

 const ids=Array.from(
  {length:100},
  ()=>s.api.newRequestId()
 );

 const pattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

 assert.ok(ids.every(id=>pattern.test(id)));
 assert.equal(new Set(ids).size,100);
});

test('UUID fallback guvenligi',()=>{
 const s=setup();

 s.window.crypto={
  getRandomValues:bytes=>
   webcrypto.getRandomValues(bytes)
 };

 const id=s.api.newRequestId();

 assert.match(
  id,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
 );
});

test('Guvenli rastgele kaynak zorunlu',()=>{
 const s=setup();

 s.window.crypto=undefined;

 assert.throws(
  ()=>s.api.newRequestId()
 );
});

test('Eski hesap POST istegi engellenir',async()=>{
 const s=setup();
 const snapshot=s.api.session();

 s.window.ErisAuth.user.id='u2';

 await assert.rejects(
  s.api.action(snapshot,'activate',1,KEY,CONFIRMATION)
 );

 assert.equal(s.calls.length,0);
});

test('Eski token POST istegi engellenir',async()=>{
 const s=setup();
 const snapshot=s.api.session();

 s.setToken('test-token-2');

 await assert.rejects(
  s.api.action(snapshot,'activate',1,KEY,CONFIRMATION)
 );

 assert.equal(s.calls.length,0);
});

test('Gecikmis POST yaniti reddedilir',async()=>{
 const s=setup();
 const snapshot=s.api.session();

 s.context.fetch=async()=>({
  ok:true,
  json:async()=>{
   s.setToken('test-token-2');
   return response();
  }
 });

 await assert.rejects(
  s.api.action(snapshot,'activate',1,KEY,CONFIRMATION)
 );
});

test('Sunucu hata kodu korunur',async()=>{
 const s=setup();

 s.context.fetch=async()=>({
  ok:false,
  status:409,
  json:async()=>({
   detail:'insufficient_points'
  })
 });

 await assert.rejects(
  s.api.action(
   s.api.session(),'activate',1,KEY,CONFIRMATION
  ),
  error=>
   error.status===409&&
   error.code==='insufficient_points'
 );
});

test('Tekrarlanan islem yaniti kabul edilir',async()=>{
 const s=setup();

 s.context.fetch=async()=>({
  ok:true,
  json:async()=>({
   ...response(),
   applied:false,
   duplicate:true
  })
 });

 const data=await s.api.action(
  s.api.session(),'activate',1,KEY,CONFIRMATION
 );

 assert.equal(data.applied,false);
 assert.equal(data.duplicate,true);
});

test('Ayni UUID ile guvenli tekrar',async()=>{
 const s=setup();
 const snapshot=s.api.session();

 await s.api.action(
  snapshot,'renew',1,KEY,CONFIRMATION
 );

 await s.api.action(
  snapshot,'renew',1,KEY,CONFIRMATION
 );

 assert.equal(s.calls.length,2);

 assert.equal(
  s.calls[0].options.body,
  s.calls[1].options.body
 );
});

test('Ag hatasinda otomatik POST tekrari yok',async()=>{
 const s=setup();
 let attempts=0;

 s.context.fetch=async()=>{
  attempts++;
  throw new Error('Network error');
 };

 await assert.rejects(
  s.api.action(
   s.api.session(),'renew',1,KEY,CONFIRMATION
  )
 );

 assert.equal(attempts,1);
});

test('Iptal edilen POST yaniti reddedilir',async()=>{
 const s=setup();
 const controller=new AbortController();

 s.context.fetch=async()=>({
  ok:true,
  json:async()=>{
   controller.abort();
   return response();
  }
 });

 await assert.rejects(
  s.api.action(
   s.api.session(),
   'activate',
   1,
   KEY,
   CONFIRMATION,
   controller.signal
  )
 );
});

test('Buyuk puan bakiyesi hassasiyet kaybetmez',async()=>{
 const s=setup();

 s.context.fetch=async()=>{
  const data=response();

  data.membership.points='9223372036854775807';

  return {
   ok:true,
   json:async()=>data
  };
 };

 const data=await s.api.action(
  s.api.session(),'activate',1,KEY,CONFIRMATION
 );

 assert.equal(
  data.membership.points,
  '9223372036854775807'
 );
});

const invalidResponses=[
 ['Yanlis islem',d=>{d.action='renew'}],
 ['Iki basari bayragi',d=>{d.duplicate=true}],
 ['Iki basarisizlik bayragi',d=>{d.applied=false}],
 ['Gecersiz bayrak',d=>{d.applied=1}],
 ['Uyelik eksik',d=>{delete d.membership}],
 ['Gecersiz sinif',d=>{d.membership.rank=5}],
 ['Sayisal bakiye',d=>{d.membership.points=100}],
 ['Negatif bakiye',d=>{d.membership.points='-1'}],
 ['Ondalik bakiye',d=>{d.membership.points='1.5'}],
 ['Uyelik durum celiskisi',d=>{d.membership.active=false}],
 ['Ayricalik listesi hatali',d=>{d.membership.privileges=null}]
];

for(const [name,mutate] of invalidResponses){
 test('Gecersiz yanit: '+name,async()=>{
  const s=setup();

  s.context.fetch=async()=>{
   const data=response();
   mutate(data);

   return {
    ok:true,
    json:async()=>data
   };
  };

  await assert.rejects(
   s.api.action(
    s.api.session(),'activate',1,KEY,CONFIRMATION
   )
  );
 });
}

test('Hesap kimligi zorunlu',()=>{
 const s=setup();
 delete s.window.ErisAuth.user.id;

 assert.throws(()=>s.api.session());
 assert.equal(s.calls.length,0);
});

test('Finansal onay zorunlu',async()=>{
 const s=setup();

 await assert.rejects(
  s.api.action(
   s.api.session(),'activate',1,KEY
  )
 );

 assert.equal(s.calls.length,0);
});

for(const revision of [
 null,
 '',
 'a'.repeat(63),
 'a'.repeat(65),
 'A'.repeat(64),
 'g'.repeat(64),
 123
]){
 test('Gecersiz revizyon: '+revision,async()=>{
  const s=setup();

  await assert.rejects(
   s.api.action(
    s.api.session(),'activate',1,KEY,
    {revision,cost:'400000'}
   )
  );

  assert.equal(s.calls.length,0);
 });
}

for(const cost of [
 null,
 '',
 '0',
 '-1',
 '1.5',
 '0400000',
 400000,
 '9223372036854775808'
]){
 test('Gecersiz maliyet: '+cost,async()=>{
  const s=setup();

  await assert.rejects(
   s.api.action(
    s.api.session(),'activate',1,KEY,
    {revision:REVISION,cost}
   )
  );

  assert.equal(s.calls.length,0);
 });
}

const invalidMemberships=[
 ['Farkli hesap',m=>{m.user_id='u2'}],
 ['Eksik hesap',m=>{delete m.user_id}],
 ['Eksik revizyon',m=>{delete m.revision}],
 ['Yanlis revizyon',m=>{m.revision='invalid'}],
 ['Eksik sistem durumu',m=>{delete m.enabled}],
 ['Eksik konfigurasyon',m=>{
  delete m.configuration_valid;
 }],
 ['Kapali sistemde aktif sinif',m=>{
  m.enabled=false;
 }],
 ['Gecersiz konfigurasyonda aktif sinif',m=>{
  m.configuration_valid=false;
 }],
 ['Bakiye sinir asimi',m=>{
  m.points='9223372036854775808';
 }]
];

for(const [name,mutate] of invalidMemberships){
 test('Uyelik guvenligi: '+name,async()=>{
  const s=setup();

  s.context.fetch=async()=>{
   const data=response();

   mutate(data.membership);

   return {
    ok:true,
    json:async()=>data
   };
  };

  await assert.rejects(
   s.api.action(
    s.api.session(),'activate',1,KEY,
    CONFIRMATION
   )
  );
 });
}

test('Yenilemede orijinal onay korunur',async()=>{
 const s=setup();

 const confirmation=Object.freeze({
  revision:'b'.repeat(64),
  cost:'100000'
 });

 const snapshot=s.api.session();

 await s.api.action(
  snapshot,'renew',1,KEY,confirmation
 );

 await s.api.action(
  snapshot,'renew',1,KEY,confirmation
 );

 assert.equal(s.calls.length,2);

 assert.equal(
  s.calls[0].options.body,
  s.calls[1].options.body
 );

 assert.deepEqual(
  JSON.parse(s.calls[0].options.body),
  {
   rank:1,
   request_id:KEY,
   confirmed_revision:'b'.repeat(64),
   confirmed_cost:'100000'
  }
 );
});

for(const code of [
 'stale_confirmation',
 'price_changed',
 'confirmation_required',
 'request_conflict'
]){
 test('Finansal hata kodu: '+code,async()=>{
  const s=setup();

  s.context.fetch=async()=>({
   ok:false,
   status:409,
   json:async()=>({detail:code})
  });

  await assert.rejects(
   s.api.action(
    s.api.session(),'activate',1,KEY,
    CONFIRMATION
   ),
   error=>error.status===409&&error.code===code
  );
 });
}


function cancelApiSetup(){
 const s=setup();

 const record=Object.freeze({
  version:2,
  userId:'u1',
  action:'activate',
  rank:1,
  requestId:KEY,
  cost:'400000',
  revision:REVISION,
  createdAt:Date.now()
 });

 const result={
  ok:true,
  user_id:'u1',
  request_id:KEY,
  action:'activate',
  rank:1,
  confirmed_cost:'400000',
  confirmed_revision:REVISION,
  status:'cancelled',
  duplicate:false
 };

 s.context.fetch=async(url,options)=>{
  s.calls.push({url,options});

  return {
   ok:true,
   json:async()=>({...result})
  };
 };

 return {
  ...s,
  record,
  result,
  snapshot:s.api.session()
 };
}


for(const [status,duplicate] of [
 ['cancelled',false],
 ['cancelled',true],
 ['completed',true]
]){
 test(
  `Kesin iptal HTTP sonucu: ${status}/${duplicate}`,
  async()=>{
   const s=cancelApiSetup();

   s.result.status=status;
   s.result.duplicate=duplicate;

   const result=await s.api.cancel(
    s.snapshot,s.record
   );

   assert.equal(result.status,status);
   assert.equal(result.duplicate,duplicate);
   assert.equal(s.calls.length,1);
  }
 );
}


test('Kesin iptal HTTP adresi ve govdesi',async()=>{
 const s=cancelApiSetup();

 await s.api.cancel(
  s.snapshot,s.record
 );

 assert.equal(s.calls.length,1);

 const call=s.calls[0];

 assert.equal(
  call.url,
  'https://test.invalid/v1/nobility/cancel'
 );

 assert.equal(call.options.method,'POST');

 assert.equal(
  call.options.headers.Authorization,
  'Bearer test-token-1'
 );

 assert.equal(
  call.options.headers['Content-Type'],
  'application/json'
 );

 assert.equal(
  call.options.headers.Accept,
  'application/json'
 );

 assert.equal(call.options.cache,'no-store');

 assert.deepEqual(
  JSON.parse(call.options.body),
  {
   user_id:'u1',
   request_id:KEY,
   action:'activate',
   rank:1,
   confirmed_cost:'400000',
   confirmed_revision:REVISION
  }
 );
});


for(const [field,value] of [
 ['version',1],
 ['version',3],
 ['userId','u2'],
 ['userId',''],
 ['action','refund'],
 ['action','../me'],
 ['rank',0],
 ['rank',5],
 ['rank',true],
 ['rank','1'],
 ['requestId','invalid'],
 ['requestId',KEY.toUpperCase()],
 ['requestId',KEY.replace('-4123-','-5123-')],
 ['cost','0'],
 ['cost','-1'],
 ['cost','0400000'],
 ['cost',400000],
 ['cost','9223372036854775808'],
 ['revision','invalid'],
 ['revision',REVISION.toUpperCase()],
 ['revision',null],
 ['createdAt',0],
 ['createdAt',-1],
 ['createdAt',1.5],
 ['createdAt',Number.MAX_SAFE_INTEGER+1]
]){
 test(
  `Gecersiz iptal istegi: ${field}/${value}`,
  async()=>{
   const s=cancelApiSetup();

   const changed={
    ...s.record,
    [field]:value
   };

   await assert.rejects(
    s.api.cancel(s.snapshot,changed)
   );

   assert.equal(s.calls.length,0);
  }
 );
}


for(const [field,value] of [
 ['ok',false],
 ['user_id','u2'],
 ['request_id','invalid'],
 ['action','upgrade'],
 ['rank',2],
 ['rank','1'],
 ['confirmed_cost','400001'],
 ['confirmed_cost',400000],
 ['confirmed_revision','b'.repeat(64)],
 ['status','pending'],
 ['status','unknown'],
 ['status',null],
 ['duplicate',null],
 ['duplicate','true'],
 ['duplicate',1]
]){
 test(
  `Gecersiz iptal HTTP yaniti: ${field}/${value}`,
  async()=>{
   const s=cancelApiSetup();

   s.result[field]=value;

   await assert.rejects(
    s.api.cancel(s.snapshot,s.record)
   );

   assert.equal(s.calls.length,1);
  }
 );
}


test('Completed HTTP sonucu duplicate zorunlu',async()=>{
 const s=cancelApiSetup();

 s.result.status='completed';
 s.result.duplicate=false;

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(s.calls.length,1);
});


for(const [status,detail] of [
 [401,'unauthorized'],
 [403,'account_mismatch'],
 [409,'request_conflict'],
 [409,'confirmation_unavailable'],
 [422,'invalid_request'],
 [500,'nobility_cancellation_failed'],
 [503,'nobility_unavailable']
]){
 test(
  `Iptal HTTP hata kodu korunur: ${status}/${detail}`,
  async()=>{
   const s=cancelApiSetup();

   s.context.fetch=async(url,options)=>{
    s.calls.push({url,options});

    return {
     ok:false,
     status,
     json:async()=>({detail})
    };
   };

   await assert.rejects(
    s.api.cancel(s.snapshot,s.record),
    error=>{
     assert.equal(error.status,status);
     assert.equal(error.code,detail);
     return true;
    }
   );

   assert.equal(s.calls.length,1);
  }
 );
}


test('Iptal oncesi token degisimi',async()=>{
 const s=cancelApiSetup();

 s.setToken('different-token');

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(s.calls.length,0);
});


test('Iptal oncesi hesap degisimi',async()=>{
 const s=cancelApiSetup();

 s.window.ErisAuth.user.id='u2';

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(s.calls.length,0);
});


test('Iptal yaniti sirasinda token degisimi',async()=>{
 const s=cancelApiSetup();

 s.context.fetch=async(url,options)=>{
  s.calls.push({url,options});

  return {
   ok:true,
   json:async()=>{
    s.setToken('different-token');
    return {...s.result};
   }
  };
 };

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(s.calls.length,1);
});


test('Iptal yaniti sirasinda hesap degisimi',async()=>{
 const s=cancelApiSetup();

 s.context.fetch=async(url,options)=>{
  s.calls.push({url,options});

  return {
   ok:true,
   json:async()=>{
    s.window.ErisAuth.user.id='u2';
    return {...s.result};
   }
  };
 };

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(s.calls.length,1);
});


test('Onceden abort edilen HTTP iptali gonderilmez',async()=>{
 const s=cancelApiSetup();

 const controller=new AbortController();
 controller.abort();

 await assert.rejects(
  s.api.cancel(
   s.snapshot,s.record,controller.signal
  )
 );

 assert.equal(s.calls.length,0);
});


test('HTTP iptal sirasinda abort',async()=>{
 const s=cancelApiSetup();

 const controller=new AbortController();

 s.context.fetch=async(url,options)=>{
  s.calls.push({url,options});

  controller.abort();

  assert.equal(options.signal.aborted,true);

  return {
   ok:true,
   json:async()=>({...s.result})
  };
 };

 await assert.rejects(
  s.api.cancel(
   s.snapshot,s.record,controller.signal
  )
 );

 assert.equal(s.calls.length,1);
});


test('Iptal ag hatasinda otomatik tekrar yok',async()=>{
 const s=cancelApiSetup();

 s.context.fetch=async(url,options)=>{
  s.calls.push({url,options});

  throw new Error('Network unavailable');
 };

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(s.calls.length,1);
});


test('Iptal gecersiz JSON yanitini reddeder',async()=>{
 const s=cancelApiSetup();

 s.context.fetch=async(url,options)=>{
  s.calls.push({url,options});

  return {
   ok:true,
   json:async()=>{
    throw new SyntaxError('Invalid JSON');
   }
  };
 };

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(s.calls.length,1);
});


test('Iptal zaman asimi 15 saniye',async()=>{
 const s=cancelApiSetup();

 let timeout;
 let delay;
 let cleared=false;

 s.context.setTimeout=(callback,ms)=>{
  timeout=callback;
  delay=ms;
  return 123;
 };

 s.context.clearTimeout=id=>{
  assert.equal(id,123);
  cleared=true;
 };

 s.context.fetch=async(url,options)=>{
  s.calls.push({url,options});

  timeout();

  assert.equal(options.signal.aborted,true);

  return {
   ok:true,
   json:async()=>({...s.result})
  };
 };

 await assert.rejects(
  s.api.cancel(s.snapshot,s.record)
 );

 assert.equal(delay,15000);
 assert.equal(cleared,true);
 assert.equal(s.calls.length,1);
});
