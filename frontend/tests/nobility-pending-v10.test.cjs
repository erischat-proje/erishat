const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(
 'frontend/nobility-pending.js','utf8'
);

const KEY='12345678-1234-4123-8123-123456789abc';

const KEY2='12345678-1234-4123-8123-123456789abd';

const STORAGE_KEY='lidyachat.nobility.pending.v1:u1';

const REVISION='a'.repeat(64);

function setup(store=new Map()){
 const window={
  localStorage:{
   getItem:key=>store.has(key)
    ?store.get(key):null,
   setItem:(key,value)=>store.set(key,value),
   removeItem:key=>store.delete(key)
  }
 };

 vm.runInNewContext(source,{window});

 return {
  api:window.LidyaNobilityPending,
  window,
  store
 };
}

function state(action='renew',rank=4,cost='800000'){
 return {
  kind:'action',
  enabled:true,
  action,
  rank,
  cost,
  revision:REVISION
 };
}

test('Bos hesap kaydi',()=>{
 const s=setup();
 assert.equal(s.api.read('u1'),null);
});

for(const action of ['activate','upgrade','renew']){
 test('Kalici islem kaydi: '+action,()=>{
  const s=setup();

  const record=s.api.reserve(
   'u1',state(action),KEY
  );

  assert.equal(record.action,action);
  assert.equal(record.requestId,KEY);
  assert.equal(record.userId,'u1');
  assert.equal(record.cost,'800000');
  assert.equal(record.version,2);
  assert.equal(record.revision,REVISION);

  assert.equal(
   s.api.read('u1').requestId,KEY
  );
 });
}

test('Uygulama yeniden acilinca UUID korunur',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 const reopened=setup(s.store);

 assert.equal(
  reopened.api.read('u1').requestId,KEY
 );
});

test('Bekleyen islem yeni islemi engeller',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 assert.throws(()=>s.api.reserve(
  'u1',state(),KEY2
 ));

 assert.equal(
  s.api.read('u1').requestId,KEY
 );
});

test('Ayni UUID ile ikinci rezervasyon engellenir',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 assert.throws(()=>s.api.reserve(
  'u1',state(),KEY
 ));
});

test('Hesaplar birbirinden izole',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 assert.equal(s.api.read('u2'),null);

 s.api.reserve('u2',state(),KEY2);

 assert.equal(
  s.api.read('u1').requestId,KEY
 );

 assert.equal(
  s.api.read('u2').requestId,KEY2
 );
});

test('Baska hesabin kaydi reddedilir',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 const raw=s.store.get(STORAGE_KEY);

 s.store.set(
  'lidyachat.nobility.pending.v1:u2',
  raw
 );

 assert.throws(()=>s.api.read('u2'));
});

test('Yanlis UUID ile kayit silinemez',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 assert.throws(()=>s.api.clear(
  'u1',KEY2
 ));

 assert.equal(
  s.api.read('u1').requestId,KEY
 );
});

test('Dogru UUID ile kayit temizlenir',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 assert.equal(
  s.api.clear('u1',KEY),true
 );

 assert.equal(s.api.read('u1'),null);
});

test('Olmayan kaydi temizleme',()=>{
 const s=setup();

 assert.equal(
  s.api.clear('u1',KEY),false
 );
});

test('Bir hesabin temizligi digerini etkilemez',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);
 s.api.reserve('u2',state(),KEY2);

 s.api.clear('u1',KEY);

 assert.equal(
  s.api.read('u2').requestId,KEY2
 );
});

test('Gecersiz kullanici kimligi',()=>{
 const s=setup();

 for(const id of [
  '',null,undefined,123,' ',
  ' u1','u1 ','x'.repeat(65)
 ]){
  assert.throws(()=>s.api.read(id));
 }
});

test('Gecersiz islem turu',()=>{
 const s=setup();

 for(const action of [
  '',null,'refund','delete'
 ]){
  assert.throws(()=>s.api.reserve(
   'u1',state(action),KEY
  ));
 }

 assert.equal(s.api.read('u1'),null);
});

test('Gecersiz asalet sinifi',()=>{
 const s=setup();

 for(const rank of [
  0,5,-1,1.5,'4',true,null
 ]){
  assert.throws(()=>s.api.reserve(
   'u1',state('renew',rank),KEY
  ));
 }
});

test('Gecersiz puan bedeli',()=>{
 const s=setup();

 for(const cost of [
  '0','-1','1.5','01',
  800000,null,'',
  '9223372036854775808'
 ]){
  assert.throws(()=>s.api.reserve(
   'u1',state('renew',4,cost),KEY
  ));
 }
});

test('Gecersiz UUID reddedilir',()=>{
 const s=setup();

 for(const id of [
  '',null,123,'invalid',
  KEY.toUpperCase(),
  KEY.replace('-4123-','-5123-')
 ]){
  assert.throws(()=>s.api.reserve(
   'u1',state(),id
  ));
 }
});

test('Yetersiz bakiye durumu kaydedilemez',()=>{
 const s=setup();

 assert.throws(()=>s.api.reserve(
  'u1',
  {...state(),kind:'topup'},
  KEY
 ));
});

test('Kilitli islem kaydedilemez',()=>{
 const s=setup();

 assert.throws(()=>s.api.reserve(
  'u1',
  {...state(),enabled:false},
  KEY
 ));
});

test('Bozuk JSON otomatik silinmez',()=>{
 const s=setup();

 s.store.set(STORAGE_KEY,'{broken');

 assert.throws(()=>s.api.read('u1'));

 assert.equal(
  s.store.get(STORAGE_KEY),'{broken'
 );
});

test('Bozuk kayit uzerine yazilamaz',()=>{
 const s=setup();

 s.store.set(STORAGE_KEY,'{broken');

 assert.throws(()=>s.api.reserve(
  'u1',state(),KEY
 ));
});

test('Bilinmeyen kayit surumu reddedilir',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',state(),KEY
 );

 s.store.set(
  STORAGE_KEY,
  JSON.stringify({...record,version:3})
 );

 assert.throws(()=>s.api.read('u1'));
});

test('Beklenmeyen alanlar reddedilir',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',state(),KEY
 );

 s.store.set(
  STORAGE_KEY,
  JSON.stringify({...record,extra:true})
 );

 assert.throws(()=>s.api.read('u1'));
});

test('Depolama hatasinda islem reddedilir',()=>{
 const s=setup();

 s.window.localStorage.setItem=()=>{
  throw new Error('Storage unavailable');
 };

 assert.throws(()=>s.api.reserve(
  'u1',state(),KEY
 ));

 assert.equal(s.api.read('u1'),null);
});

test('Sessiz depolama hatasi yakalanir',()=>{
 const s=setup();

 s.window.localStorage.setItem=()=>{};

 assert.throws(()=>s.api.reserve(
  'u1',state(),KEY
 ));
});

test('Silme hatasi yakalanir',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 s.window.localStorage.removeItem=()=>{};

 assert.throws(()=>s.api.clear(
  'u1',KEY
 ));
});

test('Token ve sifre saklanmaz',()=>{
 const s=setup();

 s.api.reserve(
  'u1',
  {
   ...state(),
   token:'secret-token',
   password:'secret-password'
  },
  KEY
 );

 const raw=s.store.get(STORAGE_KEY);

 assert.ok(!raw.includes('secret-token'));
 assert.ok(!raw.includes('secret-password'));
});

test('Kalici kayit degistirilemez',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',state(),KEY
 );

 assert.ok(Object.isFrozen(record));
 assert.ok(Object.isFrozen(s.api.read('u1')));
});

test('Asiri buyuk kayit reddedilir',()=>{
 const s=setup();

 s.store.set(
  STORAGE_KEY,'x'.repeat(2049)
 );

 assert.throws(()=>s.api.read('u1'));
});

for(const revision of [
 undefined,
 null,
 '',
 123,
 'a'.repeat(63),
 'a'.repeat(65),
 'A'.repeat(64),
 'g'.repeat(64),
 'a'.repeat(64)+'\n'
]){
 test('Gecersiz kalici revizyon: '+revision,()=>{
  const s=setup();

  assert.throws(()=>s.api.reserve(
   'u1',
   {...state(),revision},
   KEY
  ));

  assert.equal(s.api.read('u1'),null);
 });
}

test('Orijinal finansal onay yeniden acilinca korunur',()=>{
 const s=setup();

 const original=s.api.reserve(
  'u1',
  {
   ...state('renew',1,'100000'),
   revision:'b'.repeat(64)
  },
  KEY
 );

 const reopened=setup(s.store);
 const restored=reopened.api.read('u1');

 assert.equal(restored.version,2);
 assert.equal(restored.userId,'u1');
 assert.equal(restored.action,'renew');
 assert.equal(restored.rank,1);
 assert.equal(restored.requestId,KEY);
 assert.equal(restored.cost,'100000');
 assert.equal(restored.revision,'b'.repeat(64));
 assert.equal(restored.createdAt,original.createdAt);
});

test('Kaynak onay degisse bile kalici kayit degismez',()=>{
 const s=setup();

 const confirmation=state(
  'activate',1,'400000'
 );

 s.api.reserve('u1',confirmation,KEY);

 confirmation.cost='800000';
 confirmation.rank=2;
 confirmation.action='upgrade';
 confirmation.revision='b'.repeat(64);

 const record=s.api.read('u1');

 assert.equal(record.cost,'400000');
 assert.equal(record.rank,1);
 assert.equal(record.action,'activate');
 assert.equal(record.revision,REVISION);
});

test('Eski V1 kaydi otomatik silinmez',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',state(),KEY
 );

 const legacy={...record,version:1};

 delete legacy.revision;

 const raw=JSON.stringify(legacy);

 s.store.set(STORAGE_KEY,raw);

 assert.throws(()=>s.api.read('u1'));

 assert.equal(
  s.store.get(STORAGE_KEY),raw
 );
});

test('Eski V1 kaydi uzerine yazilamaz',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',state(),KEY
 );

 const legacy={...record,version:1};

 delete legacy.revision;

 const raw=JSON.stringify(legacy);

 s.store.set(STORAGE_KEY,raw);

 assert.throws(()=>s.api.reserve(
  'u1',state(),KEY2
 ));

 assert.equal(
  s.store.get(STORAGE_KEY),raw
 );
});

test('Eski V1 kaydi normal temizleme ile silinemez',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',state(),KEY
 );

 const legacy={...record,version:1};

 delete legacy.revision;

 const raw=JSON.stringify(legacy);

 s.store.set(STORAGE_KEY,raw);

 assert.throws(()=>s.api.clear(
  'u1',KEY
 ));

 assert.equal(
  s.store.get(STORAGE_KEY),raw
 );
});

test('Eksik revizyonlu V2 kaydi reddedilir',()=>{
 const s=setup();

 const record={
  ...s.api.reserve('u1',state(),KEY)
 };

 delete record.revision;

 const raw=JSON.stringify(record);

 s.store.set(STORAGE_KEY,raw);

 assert.throws(()=>s.api.read('u1'));

 assert.equal(
  s.store.get(STORAGE_KEY),raw
 );
});

test('Bozuk revizyonlu V2 kaydi reddedilir',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',state(),KEY
 );

 const raw=JSON.stringify({
  ...record,
  revision:'invalid'
 });

 s.store.set(STORAGE_KEY,raw);

 assert.throws(()=>s.api.read('u1'));

 assert.equal(
  s.store.get(STORAGE_KEY),raw
 );
});

test('Bekleyen islem yeni finansal onayla ezilemez',()=>{
 const s=setup();

 s.api.reserve('u1',state(),KEY);

 const raw=s.store.get(STORAGE_KEY);

 assert.throws(()=>s.api.reserve(
  'u1',
  {
   ...state('upgrade',4,'3200000'),
   revision:'b'.repeat(64)
  },
  KEY2
 ));

 assert.equal(
  s.store.get(STORAGE_KEY),raw
 );
});

test('V2 kaydi yalnizca izinli alanlari saklar',()=>{
 const s=setup();

 const record=s.api.reserve(
  'u1',
  {
   ...state(),
   token:'secret-token',
   password:'secret-password',
   extra:'unexpected'
  },
  KEY
 );

 assert.deepEqual(
  Object.keys(record).sort(),
  [
   'version',
   'userId',
   'action',
   'rank',
   'requestId',
   'cost',
   'revision',
   'createdAt'
  ].sort()
 );
});
