const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(
 'frontend/nobility-live.js','utf8'
);

const start=source.indexOf(
 'function pendingStatus(snapshot){'
);

const end=source.indexOf(
 'function closeConfirmation(){',start
);

assert.ok(start>=0);
assert.ok(end>start);

const securitySource=source.slice(start,end);

function setup(){
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
  revision:'a'.repeat(64),
  balance:'800000',
  remaining:'400000'
 });

 const context={
  root:{},
  accountState:'ready',
  accountSnapshot:snapshot,
  accountData:{
   me:{
    rank:0,
    expires_at:null
   }
  },
  selected:0,
  ranks:[
   {id:1},
   {id:2},
   {id:3},
   {id:4}
  ],
  confirmation:Object.freeze({
   ...state,
   snapshot,
   currentRank:0,
   expiry:null
  }),
  window:{
   LidyaNobilityAPI:{
    sameSession:s=>s===snapshot
   },
   LidyaNobilityPending:{
    read:()=>null
   },
   LidyaNobilityActionState:{
    resolve:()=>state
   }
  }
 };

 vm.createContext(context);

 vm.runInContext(
  securitySource,context
 );

 return {
  context,
  snapshot,
  state,
  pending:()=>vm.runInContext(
   'pendingStatus(accountSnapshot)',
   context
  ),
  confirmed:()=>vm.runInContext(
   'confirmedState()',context
  )
 };
}

test('Bos kalici kayit islemi engellemez',()=>{
 const s=setup();
 assert.equal(s.pending().kind,'clear');
});

test('Bekleyen kayit tespit edilir',()=>{
 const s=setup();

 const record={requestId:'test-id'};

 s.context.window.LidyaNobilityPending.read=
  ()=>record;

 assert.equal(s.pending().kind,'pending');
 assert.equal(s.pending().record,record);
});

test('Depolama hatasinda guvenli kilit',()=>{
 const s=setup();

 s.context.window.LidyaNobilityPending.read=
  ()=>{throw new Error('Storage error');};

 assert.equal(s.pending().kind,'unavailable');
 assert.equal(s.confirmed(),null);
});

test('Kalici motor yoksa islem engellenir',()=>{
 const s=setup();

 delete s.context.window.LidyaNobilityPending;

 assert.equal(s.pending().kind,'unavailable');
 assert.equal(s.confirmed(),null);
});

test('API yoksa islem engellenir',()=>{
 const s=setup();

 delete s.context.window.LidyaNobilityAPI;

 assert.equal(s.pending().kind,'unavailable');
 assert.equal(s.confirmed(),null);
});

test('Eski oturum depolamaya erisemez',()=>{
 const s=setup();

 let reads=0;

 s.context.window.LidyaNobilityAPI.sameSession=
  ()=>false;

 s.context.window.LidyaNobilityPending.read=
  ()=>{reads++;return null;};

 assert.equal(s.pending().kind,'unavailable');
 assert.equal(s.confirmed(),null);
 assert.equal(reads,0);
});

test('Kalici kayit dogru hesaptan okunur',()=>{
 const s=setup();

 let userId=null;

 s.context.window.LidyaNobilityPending.read=
  id=>{userId=id;return null;};

 assert.equal(s.pending().kind,'clear');
 assert.equal(userId,'u1');
});

test('Gecerli finansal onay kabul edilir',()=>{
 const s=setup();

 assert.equal(s.confirmed(),s.state);
});

test('Bekleyen islem yeni onayi engeller',()=>{
 const s=setup();

 s.context.window.LidyaNobilityPending.read=
  ()=>({requestId:'previous'});

 assert.equal(s.confirmed(),null);
});

test('Kapali ekran finansal onay veremez',()=>{
 const s=setup();

 s.context.root=null;

 assert.equal(s.confirmed(),null);
});

for(const status of ['loading','error']){
 test('Hazir olmayan hesap: '+status,()=>{
  const s=setup();

  s.context.accountState=status;

  assert.equal(s.confirmed(),null);
 });
}

test('Onay olmadan finansal islem yapilamaz',()=>{
 const s=setup();

 s.context.confirmation=null;

 assert.equal(s.confirmed(),null);
});

test('Degisen oturum nesnesi onayi gecersiz kilar',()=>{
 const s=setup();

 s.context.accountSnapshot={
  ...s.snapshot
 };

 assert.equal(s.confirmed(),null);
});

test('Karar motoru yoksa onay reddedilir',()=>{
 const s=setup();

 delete s.context.window.LidyaNobilityActionState;

 assert.equal(s.confirmed(),null);
});

test('Karar motoru sonuc vermezse onay reddedilir',()=>{
 const s=setup();

 s.context.window.LidyaNobilityActionState.resolve=
  ()=>null;

 assert.equal(s.confirmed(),null);
});

test('Yetersiz bakiye onayi engeller',()=>{
 const s=setup();

 s.context.window.LidyaNobilityActionState.resolve=
  ()=>({...s.state,kind:'topup'});

 assert.equal(s.confirmed(),null);
});

test('Kilitli karar onayi engeller',()=>{
 const s=setup();

 s.context.window.LidyaNobilityActionState.resolve=
  ()=>({...s.state,enabled:false});

 assert.equal(s.confirmed(),null);
});

for(const [field,value] of [
 ['action','upgrade'],
 ['rank',2],
 ['cost','800000'],
 ['revision','b'.repeat(64)],
 ['balance','900000'],
 ['remaining','500000']
]){
 test('Degisen finansal alan: '+field,()=>{
  const s=setup();

  s.context.window.LidyaNobilityActionState.resolve=
   ()=>({...s.state,[field]:value});

  assert.equal(s.confirmed(),null);
 });
}

test('Mevcut sinif degisirse onay reddedilir',()=>{
 const s=setup();

 s.context.accountData.me.rank=1;

 assert.equal(s.confirmed(),null);
});

test('Uyelik suresi degisirse onay reddedilir',()=>{
 const s=setup();

 s.context.accountData.me.expires_at=
  '2026-12-25T12:00:00Z';

 assert.equal(s.confirmed(),null);
});

test('Secili hedef sinif karar motoruna iletilir',()=>{
 const s=setup();

 s.context.selected=2;

 let target=null;

 s.context.window.LidyaNobilityActionState.resolve=
  (data,rank)=>{
   target=rank;
   return {...s.state,rank};
  };

 assert.equal(s.confirmed(),null);
 assert.equal(target,3);
});
