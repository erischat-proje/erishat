const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const source=fs.readFileSync(
  'frontend/welcome-packages-live.js','utf8'
);

const dom=new JSDOM(
  '<section id="home" class="view show">'+
  '<button id="lidyaWelcomePackages">'+
  '<small></small></button></section>',
  {
    url:'https://www.lidyachat.com/',
    runScripts:'outside-only',
    pretendToBeVisual:true
  }
);

const w=dom.window,d=w.document;

let account='a'.repeat(64);
let time=0;
let enabled=false;
let tick;
let calls=[];
let cancellations=0;
let timeoutFn=null;
let seconds=120;

Object.defineProperty(
  w.performance,'now',{value:()=>time}
);

w.setInterval=fn=>{
  tick=fn;
  return 1;
};

w.setTimeout=(fn,ms)=>{
  assert.equal(ms,25000);
  timeoutFn=fn;
  return 2;
};

w.clearTimeout=()=>{
  timeoutFn=null;
};

function payload(){
  const collection='male';

  return {
    eligible_for_offer:true,
    purchase_enabled:false,
    collection,
    remaining_seconds:seconds,

    packages:['bronze','silver','gold']
      .map((tier,i)=>({

        id:tier,
        collection,
        name:tier,
        lidya:[6000,14000,28000][i],
        price_kurus:[9999,24999,49999][i],
        currency:'TRY',
        purchase_limit:1,
        duration_days:[7,15,30][i],

        cosmetic_rewards:[
          ['frame','bubble'],
          ['frame','bubble','profile','entrance'],
          ['frame','bubble','profile','entrance','title']
        ][i].map(type=>{

          const asset_key=
            `welcome_${collection}_${tier}_${type}_v1`;

          return {
            type,
            gender:collection,
            tier,
            asset_key,
            name:asset_key,
            preview_ready:true,
            preview_asset:
              `welcome-premium-v3/${asset_key}.svg`
          };
        })
      }))
  };
}

w.ErisPlatform={
  getAccessToken:()=>account,

  api:async(path,options)=>{
    assert.equal(options.method,'GET');

    if(path.endsWith('/checkout-status')){
      return {
        preparation_enabled:enabled,
        launch_allowed:false,
        available_tiers:enabled
          ?['bronze','gold']:[],
        read_only:true
      };
    }

    return payload();
  }
};

w.ErisChatAndroid={
  prepareWelcomePurchase:(product,token,id)=>{
    calls.push({product,token,id});
  },

  cancelWelcomePreflight:()=>{
    cancellations++;
  },

  startPlayPurchase:()=>{
    throw Error('REAL CHECKOUT MUST NOT START');
  }
};

const settle=()=>new Promise(
  r=>setImmediate(r)
);

const trigger=d.getElementById(
  'lidyaWelcomePackages'
);

const buttons=()=>[
  ...d.querySelectorAll('.lwp-buy')
];

const status=()=>d.querySelector(
  '.lwp-checkout-status'
)?.textContent||'';

const reply=(call,extra={})=>{
  w.dispatchEvent(new w.CustomEvent(
    'lidyachat:welcome-preflight',
    {
      detail:{
        requestId:call.id,
        productId:call.product,
        state:'prepared_locked',
        launchAllowed:false,
        ...extra
      }
    }
  ));
};

async function open(){
  trigger.click();
  await settle();
}

function close(){
  d.querySelector('.lwp-close').click();
}

(async()=>{
 try{
  w.eval(source);
  await settle();

  await open();

  assert.equal(buttons().length,3);
  assert(buttons().every(b=>b.disabled));

  console.log('PASS 1: Disabled server gate');

  close();
  enabled=true;
  await open();

  assert.equal(buttons()[0].disabled,false);
  assert.equal(buttons()[1].disabled,true);
  assert.equal(buttons()[2].disabled,false);

  console.log('PASS 2: Per-tier availability');

  buttons()[2].click();

  assert.equal(calls.length,1);
  assert.equal(calls[0].product,'welcome_gold_v1');
  assert.equal(calls[0].token,account);
  assert.match(calls[0].id,/^[a-f0-9]{32}$/);

  console.log('PASS 3: Native request binding');

  buttons()[0].click();

  assert.equal(calls.length,1);
  assert(buttons().every(b=>b.disabled));

  console.log('PASS 4: Concurrent request blocked');

  reply(calls[0],{requestId:'f'.repeat(32)});

  assert(buttons().every(b=>b.disabled));

  console.log('PASS 5: Wrong request ID rejected');

  reply(calls[0],{
    productId:'welcome_bronze_v1'
  });

  assert(buttons().every(b=>b.disabled));

  console.log('PASS 6: Wrong product rejected');

  reply(calls[0]);
  await settle();

  assert(status().includes('Gerçek ödeme'));
  assert.equal(buttons()[2].disabled,false);

  console.log('PASS 7: Verified preparation only');

  buttons()[2].click();

  reply(calls.at(-1),{launchAllowed:true});

  assert(buttons().every(b=>b.disabled));
  assert(status().includes('doğrulanamadı'));

  console.log('PASS 8: Forged launch permission rejected');

  close();
  await open();

  buttons()[2].click();

  const old=calls.at(-1);
  const before=cancellations;

  close();

  assert.equal(cancellations,before+1);

  reply(old);
  await open();

  assert.equal(status(),'');

  console.log('PASS 9: Close cancels old request');

  buttons()[0].click();

  const previous=calls.at(-1);

  account='b'.repeat(64);

  w.dispatchEvent(new w.Event('erischat:auth'));

  await settle();

  assert(!d.querySelector('.lwp-overlay'));

  await open();

  buttons()[0].click();

  reply(previous);

  assert(buttons().every(b=>b.disabled));

  console.log('PASS 10: Account switch isolation');

  assert(timeoutFn);

  timeoutFn();
  await settle();

  assert(status().includes('zaman aşımı'));
  assert.equal(buttons()[0].disabled,false);

  console.log('PASS 11: Timeout recovery');

  buttons()[2].click();

  time+=121000;
  seconds=0;
  tick();

  assert(!d.querySelector('.lwp-overlay'));
  assert(trigger.hidden);

  console.log('PASS 12: Campaign expiry cancellation');

  console.log(
    '=== WELCOME CHECKOUT DOM V10.10: 12/12 PASS ==='
  );

 }finally{
   w.close();
 }
})().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
