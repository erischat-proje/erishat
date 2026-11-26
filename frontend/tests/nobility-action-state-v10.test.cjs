const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const window={};

vm.runInNewContext(
 fs.readFileSync(
  'frontend/nobility-action-state.js','utf8'
 ),
 {window}
);

const {resolve}=window.LidyaNobilityActionState;

const NOW=Date.parse('2026-11-25T12:00:00Z');

const COSTS=[
 400000,
 800000,
 1600000,
 3200000
];

function account(rank=0,points='400000'){
 return {
  catalog:{
   enabled:true,
   ranks:COSTS.map((cost,i)=>({
    rank:i+1,
    available:true,
    required_points:String(cost),
    renewal_points:String(cost/4),
    duration_days:30
   }))
  },
  me:{
   enabled:true,
   configuration_valid:true,
   revision:'a'.repeat(64),
   rank,
   active:rank>0,
   points,
   expires_at:rank>0
    ?new Date(NOW+86400000).toISOString()
    :null
  }
 };
}

for(let rank=1;rank<=4;rank++){
 test('Aktivasyon: '+rank,()=>{
  const cost=String(COSTS[rank-1]);

  const state=resolve(
   account(0,cost),rank,NOW
  );

  assert.equal(state.kind,'action');
  assert.equal(state.action,'activate');
  assert.equal(state.cost,cost);
  assert.equal(state.remaining,'0');
  assert.equal(state.progress,100);
 });

 test('Yenileme: '+rank,()=>{
  const cost=String(COSTS[rank-1]/4);

  const state=resolve(
   account(rank,cost),rank,NOW
  );

  assert.equal(state.kind,'action');
  assert.equal(state.action,'renew');
  assert.equal(state.cost,cost);
  assert.equal(state.remaining,'0');
 });
}

for(let current=1;current<=3;current++){
 for(let target=current+1;target<=4;target++){
  test(
   'Tam fiyatli yukseltme: '+current+'-'+target,
   ()=>{
    const cost=String(COSTS[target-1]);

    const state=resolve(
     account(current,cost),target,NOW
    );

    assert.equal(state.kind,'action');
    assert.equal(state.action,'upgrade');
    assert.equal(state.cost,cost);
   }
  );
 }
}

test('Alt sinif islemi engellenir',()=>{
 const state=resolve(
  account(4,'9999999'),1,NOW
 );

 assert.equal(state.enabled,false);
 assert.equal(state.reason,'higher_rank_active');
});

test('Yetersiz aktivasyon bakiyesi',()=>{
 const state=resolve(
  account(0,'100000'),1,NOW
 );

 assert.equal(state.kind,'topup');
 assert.equal(state.missing,'300000');
 assert.equal(state.progress,25);
});

test('Yetersiz yenileme bakiyesi',()=>{
 const state=resolve(
  account(4,'200000'),4,NOW
 );

 assert.equal(state.kind,'topup');
 assert.equal(state.cost,'800000');
 assert.equal(state.missing,'600000');
 assert.equal(state.progress,25);
});

test('Yetersiz yukseltme bakiyesi',()=>{
 const state=resolve(
  account(1,'400000'),4,NOW
 );

 assert.equal(state.kind,'topup');
 assert.equal(state.cost,'3200000');
 assert.equal(state.missing,'2800000');
});

test('Buyuk bakiye hassasiyeti korunur',()=>{
 const state=resolve(
  account(0,'9223372036854775807'),
  1,NOW
 );

 assert.equal(
  state.remaining,
  '9223372036854375807'
 );
});

test('Sifir bakiye',()=>{
 const state=resolve(
  account(0,'0'),1,NOW
 );

 assert.equal(state.kind,'topup');
 assert.equal(state.progress,0);
});

test('Kapali katalog',()=>{
 const data=account();
 data.catalog.enabled=false;

 assert.equal(
  resolve(data,1,NOW).reason,
  'system_disabled'
 );
});

test('Kapali uyelik sistemi',()=>{
 const data=account();
 data.me.enabled=false;

 assert.equal(
  resolve(data,1,NOW).enabled,false
 );
});

test('Kullanilamayan sinif',()=>{
 const data=account();
 data.catalog.ranks[0].available=false;

 assert.equal(
  resolve(data,1,NOW).reason,
  'rank_unavailable'
 );
});

test('Suresi biten uyelik yenilenemez',()=>{
 const data=account(4,'800000');
 data.me.expires_at=new Date(NOW).toISOString();

 assert.equal(
  resolve(data,4,NOW).reason,
  'refresh_required'
 );
});

test('Gecersiz bitis tarihi',()=>{
 const data=account(4,'800000');
 data.me.expires_at='invalid';

 assert.equal(
  resolve(data,4,NOW).enabled,false
 );
});

test('Celiskili uyelik durumu',()=>{
 const data=account();
 data.me.active=true;

 assert.equal(
  resolve(data,1,NOW).enabled,false
 );
});

test('Tekrarlanan katalog sinifi',()=>{
 const data=account();

 data.catalog.ranks.push(
  data.catalog.ranks[0]
 );

 assert.equal(
  resolve(data,1,NOW).enabled,false
 );
});

test('Eksik katalog sinifi',()=>{
 const data=account();
 data.catalog.ranks=[];

 assert.equal(
  resolve(data,1,NOW).enabled,false
 );
});

test('Hatali yenileme orani',()=>{
 const data=account();

 data.catalog.ranks[0].renewal_points='1';

 assert.equal(
  resolve(data,1,NOW).reason,
  'invalid_price'
 );
});

test('Hatali uyelik suresi',()=>{
 const data=account();

 data.catalog.ranks[0].duration_days=365;

 assert.equal(
  resolve(data,1,NOW).enabled,false
 );
});

test('Gecersiz bakiyeler',()=>{
 for(const value of [
  '-1','1.5','NaN','',
  '01',100,true,null,
  '9223372036854775808'
 ]){
  assert.equal(
   resolve(account(0,value),1,NOW).enabled,
   false
  );
 }
});

test('Gecersiz hedef siniflar',()=>{
 for(const rank of [
  0,5,-1,'1',null,1.5,true
 ]){
  assert.equal(
   resolve(account(),rank,NOW).enabled,
   false
  );
 }
});

test('Eksik hesap verisi',()=>{
 assert.equal(
  resolve(null,1,NOW).enabled,false
 );
});

test('Karar nesnesi degistirilemez',()=>{
 assert.ok(
  Object.isFrozen(resolve(account(),1,NOW))
 );
});

for(const value of [
 false,undefined,null,0,1,'true'
]){
 test('Gecersiz konfigurasyon: '+value,()=>{
  const data=account();

  data.me.configuration_valid=value;

  const state=resolve(data,1,NOW);

  assert.equal(state.kind,'unavailable');
  assert.equal(state.enabled,false);
  assert.equal(state.reason,'configuration_invalid');
  assert.equal(state.revision,null);
 });
}

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
 test('Gecersiz karar revizyonu: '+revision,()=>{
  const data=account();

  data.me.revision=revision;

  const state=resolve(data,1,NOW);

  assert.equal(state.kind,'unavailable');
  assert.equal(state.enabled,false);
  assert.equal(state.reason,'invalid_revision');
  assert.equal(state.revision,null);
 });
}

for(const [action,current,target,cost] of [
 ['activate',0,1,'400000'],
 ['upgrade',1,2,'800000'],
 ['renew',4,4,'800000']
]){
 test('Finansal karar revizyonu: '+action,()=>{
  const data=account(current,cost);

  data.me.revision='b'.repeat(64);

  const state=resolve(data,target,NOW);

  assert.equal(state.kind,'action');
  assert.equal(state.action,action);
  assert.equal(state.cost,cost);
  assert.equal(state.revision,'b'.repeat(64));
  assert.ok(Object.isFrozen(state));
 });
}

test('Uyelik verisi degisse bile karar korunur',()=>{
 const data=account();

 const state=resolve(data,1,NOW);

 data.me.revision='b'.repeat(64);
 data.me.points='800000';

 assert.equal(state.revision,'a'.repeat(64));
 assert.equal(state.balance,'400000');
 assert.equal(state.cost,'400000');
});

test('Yetersiz bakiyede revizyon korunur',()=>{
 const data=account(0,'100000');

 const state=resolve(data,1,NOW);

 assert.equal(state.kind,'topup');
 assert.equal(state.revision,'a'.repeat(64));
 assert.equal(state.missing,'300000');
});

test('Gecersiz konfigurasyonda yukleme engellenir',()=>{
 const data=account(0,'100000');

 data.me.configuration_valid=false;

 const state=resolve(data,1,NOW);

 assert.equal(state.kind,'unavailable');
 assert.equal(state.enabled,false);
 assert.equal(state.action,null);
});
