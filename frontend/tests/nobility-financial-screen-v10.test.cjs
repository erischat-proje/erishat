const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(
 'frontend/nobility-live.js','utf8'
);

const start=source.indexOf('let confirmation=null;');
const end=source.indexOf(
 'function pendingStatus(snapshot){',start
);

assert.ok(start>=0);
assert.ok(end>start);

function setup(){
 const snapshot={userId:'u1',token:'test-token'};

 const record={
  version:2,
  userId:'u1',
  action:'activate',
  rank:1,
  requestId:'12345678-1234-4123-8123-123456789abc',
  cost:'400000',
  revision:'a'.repeat(64),
  createdAt:Date.now()
 };

 const state={
  kind:'action',
  enabled:true,
  action:'activate',
  rank:1,
  cost:'400000',
  revision:record.revision
 };

 function panel(){
  const nodes=new Map();

  return {
   hidden:false,
   querySelector(selector){
    if(!nodes.has(selector)){
     nodes.set(selector,{
      disabled:false,
      textContent:'',
      focus(){}
     });
    }
    return nodes.get(selector);
   },
   querySelectorAll(){
    return [
     this.querySelector('[data-confirm-submit]'),
     this.querySelector('[data-pending-recover]'),
     this.querySelector('[data-pending-cancel]'),
     this.querySelector('[data-pending-later]')
    ];
   }
  };
 }

 const confirm=panel();
 const pending=panel();

 const root={
  querySelector(selector){
   if(selector==='.ln-confirm')return confirm;
   if(selector==='.ln-pending')return pending;
   return {focus(){}};
  }
 };

 const calls=[];
 const notices=[];
 let currentRecord=record;
 let sessionValid=true;
 let reloads=0;
 let closes=0;
 let serviceBusy=false;
 let confirmed=state;

 const context={
  root,
  AbortController,
  accountSnapshot:snapshot,
  accountState:'ready',
  accountData:{
   me:{
    enabled:true,
    configuration_valid:true
   },
   catalog:{enabled:true}
  },
  ranks:[{id:1,name:'Şövalye'}],
  formatPoints:value=>value,
  pendingStatus:()=>currentRecord
   ?{kind:'pending',record:currentRecord}
   :{kind:'clear'},
  confirmedState:()=>confirmed,
  renderAction(){},
  closeConfirmation(){confirm.hidden=true;},
  loadAccount(){reloads++;},
  close(){closes++;},
  window:{
   toast:message=>notices.push(message),
   LidyaNobilityAPI:{
    sameSession:s=>sessionValid&&s===snapshot
   },
   LidyaNobilitySubmit:{
    busy:()=>serviceBusy,
    supported:()=>true,
    submit:async(...args)=>{
     calls.push(['submit',...args]);
     return {ok:true};
    },
    recover:async(...args)=>{
     calls.push(['recover',...args]);
     return {ok:true};
    },
    cancel:async(...args)=>{
     calls.push(['cancel',...args]);
     return {ok:true,status:'cancelled'};
    }
   }
  }
 };

 vm.createContext(context);

 vm.runInContext(
  source.slice(start,end),context
 );

 const run=code=>vm.runInContext(code,context);

 run('openPending()');

 return {
  context,root,record,state,snapshot,
  confirm,pending,calls,notices,run,
  service:context.window.LidyaNobilitySubmit,
  setRecord:value=>{currentRecord=value;},
  setSession:value=>{sessionValid=value;},
  setBusy:value=>{serviceBusy=value;},
  setConfirmed:value=>{confirmed=value;},
  reloads:()=>reloads,
  closes:()=>closes
 };
}

test('Finansal onay servise iletilir',async()=>{
 const s=setup();

 await s.run("runFinancial('submit')");

 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0][0],'submit');
 assert.equal(s.calls[0][1],s.snapshot);
 assert.equal(s.calls[0][2],s.state);
 assert.equal(s.reloads(),1);
});

test('Gecersiz onay finansal islem baslatmaz',async()=>{
 const s=setup();

 s.setConfirmed(null);

 await s.run("runFinancial('submit')");

 assert.equal(s.calls.length,0);
 assert.equal(
  s.confirm.querySelector(
   '[data-confirm-submit]'
  ).disabled,true
 );
});

test('Kurtarma orijinal kaydi kullanir',async()=>{
 const s=setup();

 await s.run("runFinancial('recover')");

 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0][0],'recover');
 assert.equal(s.calls[0][2],s.record);
 assert.equal(s.reloads(),1);
});

test('Kesin iptal orijinal kaydi kullanir',async()=>{
 const s=setup();

 await s.run("runFinancial('cancel')");

 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0][0],'cancel');
 assert.equal(s.calls[0][2],s.record);
 assert.equal(s.reloads(),1);
});

for(const status of ['loading','error']){
 test('Hesap durumu '+status+' iken iptal',async()=>{
  const s=setup();

  s.context.accountState=status;

  s.run('refreshPendingControls()');

  assert.equal(
   s.pending.querySelector(
    '[data-pending-cancel]'
   ).disabled,false
  );

  assert.equal(
   s.pending.querySelector(
    '[data-pending-recover]'
   ).disabled,true
  );

  await s.run("runFinancial('cancel')");

  assert.equal(s.calls.length,1);
 });

 test('Hesap durumu '+status+' iken kurtarma engeli',async()=>{
  const s=setup();

  s.context.accountState=status;

  await s.run("runFinancial('recover')");

  assert.equal(s.calls.length,0);
 });
}

test('Sistem kapaliyken iptal mumkun',async()=>{
 const s=setup();

 s.context.accountData.me.enabled=false;
 s.context.accountData.catalog.enabled=false;

 await s.run("runFinancial('cancel')");

 assert.equal(s.calls.length,1);
});

test('Sistem kapaliyken kurtarma engellenir',async()=>{
 const s=setup();

 s.context.accountData.me.enabled=false;

 await s.run("runFinancial('recover')");

 assert.equal(s.calls.length,0);
});

test('Gecersiz konfigurasyon kurtarmayi engeller',async()=>{
 const s=setup();

 s.context.accountData.me.configuration_valid=false;

 await s.run("runFinancial('recover')");

 assert.equal(s.calls.length,0);
});

test('Hesap yuklenince kurtarma butonu acilir',()=>{
 const s=setup();

 s.context.accountState='loading';

 s.run('refreshPendingControls()');

 const button=s.pending.querySelector(
  '[data-pending-recover]'
 );

 assert.equal(button.disabled,true);

 s.context.accountState='ready';

 s.run('refreshPendingControls()');

 assert.equal(button.disabled,false);
});

for(const [field,value] of [
 ['version',1],
 ['userId','u2'],
 ['action','upgrade'],
 ['rank',2],
 ['requestId','different'],
 ['cost','800000'],
 ['revision','b'.repeat(64)],
 ['createdAt',1]
]){
 test('Degisen bekleyen kayit: '+field,async()=>{
  const s=setup();

  s.setRecord({...s.record,[field]:value});

  await s.run("runFinancial('cancel')");

  assert.equal(s.calls.length,0);

  assert.equal(
   s.pending.querySelector(
    '[data-pending-cancel]'
   ).disabled,true
  );
 });
}

test('Eski oturum finansal islem baslatamaz',async()=>{
 const s=setup();

 s.setSession(false);

 await s.run("runFinancial('submit')");

 assert.equal(s.calls.length,0);
 assert.equal(s.closes(),1);
});

test('Servis mesgulken yeni islem engellenir',async()=>{
 const s=setup();

 s.setBusy(true);

 await s.run("runFinancial('cancel')");

 assert.equal(s.calls.length,0);
});

test('Cift dokunma ikinci finansal istegi engeller',async()=>{
 const s=setup();

 let release;
 let requests=0;

 s.service.submit=async()=>{
  requests++;

  return new Promise(resolve=>{
   release=resolve;
  });
 };

 const first=s.run("runFinancial('submit')");

 await s.run("runFinancial('submit')");

 assert.equal(requests,1);

 release({ok:true});

 await first;

 assert.equal(s.reloads(),1);
});

test('Ekran kapanirken finansal istek abort edilir',async()=>{
 const s=setup();

 let release;
 let signal;

 s.service.submit=async(a,b,c)=>{
  signal=c;

  return new Promise(resolve=>{
   release=resolve;
  });
 };

 const first=s.run("runFinancial('submit')");

 s.run('stopFinancial()');

 assert.equal(signal.aborted,true);

 release({ok:true});

 await first;

 assert.equal(s.reloads(),0);
 assert.equal(s.notices.length,0);
});

test('Eski yanit yeni ekrani degistiremez',async()=>{
 const s=setup();

 let release;

 s.service.submit=async()=>new Promise(resolve=>{
  release=resolve;
 });

 const first=s.run("runFinancial('submit')");

 s.context.root={};

 release({ok:true});

 await first;

 assert.equal(s.reloads(),0);
 assert.equal(s.notices.length,0);
});

test('Islem sirasinda oturum degisirse ekran kapanir',async()=>{
 const s=setup();

 s.service.submit=async()=>{
  s.setSession(false);
  return {ok:true};
 };

 await s.run("runFinancial('submit')");

 assert.equal(s.closes(),1);
 assert.equal(s.reloads(),0);
});

test('Ag hatasinda bekleyen islem penceresi acilir',async()=>{
 const s=setup();

 s.service.submit=async()=>{
  throw new Error('Network error');
 };

 await s.run("runFinancial('submit')");

 assert.equal(s.pending.hidden,false);
 assert.equal(s.reloads(),0);

 assert.match(
  s.pending.querySelector(
   '.ln-pending-status'
  ).textContent,
  /korunuyor/
 );
});

test('Bekleyen kayit yoksa hata sonrasi hesap yenilenir',async()=>{
 const s=setup();

 s.setRecord(null);

 s.service.submit=async()=>{
  throw new Error('Network error');
 };

 await s.run("runFinancial('submit')");

 assert.equal(s.reloads(),1);
});

test('Tamamlanmis islem iptal ile geri alinmaz',async()=>{
 const s=setup();

 s.service.cancel=async()=>({
  ok:true,
  status:'completed',
  duplicate:true
 });

 await s.run("runFinancial('cancel')");

 assert.match(
  s.notices.at(-1),
  /Geri alınmadı/
 );

 assert.equal(s.reloads(),1);
});

test('Kapali onay penceresi islem baslatamaz',async()=>{
 const s=setup();

 s.confirm.hidden=true;

 await s.run("runFinancial('submit')");

 assert.equal(s.calls.length,0);
});

test('Finansal servis eksikse islem baslatilmaz',async()=>{
 const s=setup();

 delete s.service.cancel;

 await s.run("runFinancial('submit')");

 assert.equal(s.calls.length,0);
});
