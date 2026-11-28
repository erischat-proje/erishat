const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const source=fs.readFileSync(
  'frontend/admin-workspace.js','utf8'
);

const dom=new JSDOM(
  '<div class="eris-admin-overlay">'+
  '<main id="eaBody"></main></div>',
  {
    url:'https://www.lidyachat.com/',
    runScripts:'outside-only',
    pretendToBeVisual:true
  }
);

const w=dom.window;
const d=w.document;
const panel=d.querySelector('.eris-admin-overlay');
const storageKey='erischat.accessToken.v1';

let role='DA';
let calls=[];
let timers=new Map();
let sequence=0;
let hold=null;
let denied=false;

w.localStorage.setItem(storageKey,'da-test-session');

w.setInterval=(fn,ms)=>{
  const id=++sequence;
  timers.set(id,{fn,ms});
  return id;
};

w.clearInterval=id=>timers.delete(id);

w.ErisAdmin={open:()=>panel.replaceChildren()};

const me={id:'admin-test',role:'DA'};

const stats={
  count:1,
  catalog_value_kurus:49999,
  historically_delivered_lidya:28000
};

const summary={
  states:{
    delivered:stats,
    pending:stats,
    review:stats,
    refunded:stats
  },
  prepared_intents:2
};

const item={
  receipt_id:123,
  public_id:'9900000001',
  tier:'gold',
  collection:'male',
  product_id:'welcome_gold_v1',
  catalog_price_kurus:49999,
  package_lidya:28000,
  delivered_lidya:28000,
  duration_days:30,
  status:'refunded',
  refund_case_id:456,
  refund_case_status:'pending',
  created_at:'2026-11-28T12:00:00Z'
};

function response(data,status=200){
  return {
    ok:status===200,
    status,
    json:async()=>data
  };
}

w.fetch=async(url,options)=>{
  const u=new URL(url);

  calls.push({
    path:u.pathname,
    query:u.searchParams,
    method:options.method,
    authorization:options.headers.Authorization
  });

  if(denied){
    return response({detail:'Yetki yok'},403);
  }

  if(u.pathname==='/v1/admin/me'){
    return response({id:me.id,role});
  }

  if(u.pathname.endsWith('/overview')){
    if(hold)return hold;
    return response(summary);
  }

  if(u.pathname.endsWith('/payments')){
    return response({
      items:[{
        ...item,
        public_id:u.searchParams.has('before')
          ?'9900000002'
          :item.public_id
      }],
      has_more:!u.searchParams.has('before'),
      next_before:122
    });
  }

  if(u.pathname.endsWith('/cosmetics')){
    return response({
      items:[{
        name:'Altın İmparator Çerçevesi',
        type:'frame',
        status:'refunded',
        duration_days:30,
        expires_at:'2026-12-28T12:00:00Z',
        asset_key:'welcome_male_gold_frame_v1'
      }]
    });
  }

  if(u.pathname.endsWith('/financial-review')){
    return response({
      package_lidya:28000,
      current_balance:28100
    });
  }

  throw Error('Unexpected path '+url);
};

const settle=()=>new Promise(r=>setImmediate(r));

const body=()=>d.querySelector('#eaBody');

const open=()=>w.ErisAdminWorkspace.open(
  'welcome-premium',me,panel
);

const click=text=>{
  const b=[...body().querySelectorAll('button')]
    .find(x=>x.textContent===text);

  assert(b,'Missing button: '+text);
  b.click();
};

const tick=async ms=>{
  for(const timer of [...timers.values()]){
    if(timer.ms===ms)await timer.fn();
  }

  await settle();
};

(async()=>{
 try{
   w.eval(source);

   await open();

   assert.equal(
     d.querySelectorAll('.welcome-admin-tile').length,4
   );

   assert(body().textContent.includes('9900000001'));

   console.log('PASS 1: DA dashboard');

   const filter=body().querySelector('form');

   filter.querySelector('[name="public_id"]').value=
     '9900000001';

   filter.querySelector('[name="status"]').value=
     'refunded';

   filter.dispatchEvent(
     new w.Event('submit',{
       bubbles:true,cancelable:true
     })
   );

   await settle();

   assert(calls.some(c=>
     c.query.get('public_id')==='9900000001'&&
     c.query.get('status')==='refunded'
   ));

   console.log('PASS 2: ID and status filter');

   click('Sonraki 20 kayıt');
   await settle();

   assert(body().textContent.includes('9900000002'));
   assert(calls.some(c=>c.query.get('before')==='122'));

   console.log('PASS 3: Pagination');

   click('Finansal incelemeyi aç');
   await settle();

   assert(d.querySelector('.welcome-refund-report'));

   console.log('PASS 4: Refund detail');

   click('Kozmetik haklarını incele');
   await settle();

   assert(d.querySelector('.welcome-cosmetic-report'));
   assert(body().textContent.includes('Altın İmparator Çerçevesi'));
   assert(body().textContent.includes('İade edildi'));

   console.log('PASS: Cosmetic entitlement details');


   await assert.rejects(
     w.ErisAdminWorkspace.open(
       'welcome-premium',
       {id:'another',role:'FA'},
       panel
     )
   );

   console.log('PASS 5: Non-DA blocked');

   w.localStorage.setItem(
     storageKey,'another-session'
   );

   w.dispatchEvent(new w.Event('erischat:auth'));

   assert(!d.querySelector('.welcome-admin-tile'));
   assert(!body().textContent.includes('9900000002'));

   console.log('PASS 6: Account switch clears data');

   w.localStorage.setItem(
     storageKey,'da-test-session'
   );

   await open();

   role='FA';
   await tick(10000);

   assert(!d.querySelector('.welcome-admin-tile'));

   console.log('PASS 7: Revoked DA authority');

   role='DA';
   await open();

   w.localStorage.removeItem(storageKey);

   await tick(1000);

   assert(!d.querySelector('.welcome-admin-tile'));

   console.log('PASS 8: Logout clears data');

   w.localStorage.setItem(
     storageKey,'da-test-session'
   );

   let release;
   hold=new Promise(resolve=>release=resolve);

   const pending=open();

   await settle();

   w.localStorage.setItem(
     storageKey,'changed-session'
   );

   w.dispatchEvent(new w.Event('erischat:auth'));

   release(response(summary));
   hold=null;

   await pending;

   assert(!d.querySelector('.welcome-admin-tile'));

   console.log('PASS 9: Stale response rejected');

   w.localStorage.setItem(
     storageKey,'da-test-session'
   );

   await open();
   denied=true;

   click('Finansal incelemeyi aç');
   await settle();

   assert(!d.querySelector('.welcome-admin-tile'));
   assert(!d.querySelector('.welcome-refund-report'));

   console.log('PASS 10: Refund access denial');

   assert(calls.every(c=>c.method==='GET'));

   console.log('PASS 11: Read-only requests');

   denied=false;
   await open();

   panel.remove();
   await tick(1000);

   assert.equal(timers.size,0);

   console.log('PASS 12: Timer lifecycle cleanup');

   console.log(
     '=== WELCOME ADMIN V9.7: 13/13 PASS ==='
   );

 }finally{
   w.close();
 }
})().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
