const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const dom=new JSDOM('',{
  url:'https://www.lidyachat.com/',
  runScripts:'outside-only',
  pretendToBeVisual:true
});

const w=dom.window;

let account='a'.repeat(64);
let time=0;
let calls=[];
let notices=[];
let recovery=0;
let balance=0;
let appearance=0;
let tick;
let hold=null;
let fail=false;

let result={
  status:'delivered',
  credited:true,
  already_credited:false,
  consumption:'completed'
};

Object.defineProperty(
  w.performance,'now',{value:()=>time}
);

w.setInterval=fn=>{
  tick=fn;
  return 1;
};

w.toast=message=>notices.push(message);

w.ErisChatAndroid={
  recoverWelcomePurchases:()=>recovery++,
  startPlayPurchase:()=>{
    throw Error('Checkout must stay disabled');
  }
};

w.ErisPlatform={
  getAccessToken:()=>account,

  api:async(path,options)=>{
    calls.push({
      path,
      options,
      owner:account
    });

    if(hold)return hold;
    if(fail)throw Error('Network error');

    return result;
  }
};

w.addEventListener(
  'lidyachat:balance-refresh',
  ()=>balance++
);

w.addEventListener(
  'lidyachat:appearance-refresh',
  ()=>appearance++
);

const settle=()=>new Promise(
  resolve=>setImmediate(resolve)
);

function purchase(
  receipt='welcome-test-token-001',
  product='welcome_gold_v1'
){
  w.dispatchEvent(new w.CustomEvent(
    'lidyachat:welcome-play-purchased',
    {
      detail:{
        productId:product,
        purchaseToken:receipt
      }
    }
  ));
}

(async()=>{
 try{

   w.eval(fs.readFileSync(
     'frontend/welcome-payment-live.js','utf8'
   ));

   assert.equal(recovery,1);

   console.log('PASS 1: Automatic recovery on startup');

   purchase();
   await settle();

   assert.equal(calls.length,1);
   assert.equal(balance,1);
   assert.equal(appearance,1);

   assert.equal(
     calls[0].path,
     '/welcome-packages/checkout-complete'
   );

   assert.equal(calls[0].options.method,'POST');

   assert.deepEqual(
     JSON.parse(calls[0].options.body),
     {
       product_id:'welcome_gold_v1',
       purchase_token:'welcome-test-token-001'
     }
   );

   console.log('PASS 2: Authenticated delivery and refresh');

   purchase();
   await settle();

   assert.equal(calls.length,1);

   console.log('PASS 3: Completed receipt deduplication');

   purchase('welcome-test-token-002','lidya_001');
   purchase('welcome-test-token-003','welcome_fake_v1');
   purchase('short');

   await settle();

   assert.equal(calls.length,1);

   console.log('PASS 4: Invalid products and tokens blocked');

   let release;

   hold=new Promise(resolve=>release=resolve);

   purchase('welcome-test-token-004');
   purchase('welcome-test-token-004');

   assert.equal(calls.length,2);

   release(result);
   hold=null;

   await settle();

   console.log('PASS 5: Concurrent delivery blocked');

   result={
     status:'delivered',
     credited:true,
     consumption:'retry_required'
   };

   purchase('welcome-test-token-005');
   await settle();

   const beforeRetry=calls.length;

   result={
     status:'delivered',
     already_credited:true,
     consumption:'completed'
   };

   purchase('welcome-test-token-005');
   await settle();

   assert.equal(calls.length,beforeRetry+1);

   console.log('PASS 6: Consumption retry permitted');

   result={
     status:'review_required',
     credited:false,
     consumption:'not_attempted'
   };

   const previousBalance=balance;

   purchase('welcome-test-token-006');
   await settle();

   assert.equal(balance,previousBalance);
   assert(notices.at(-1).includes('inceleme'));

   console.log('PASS 7: Review does not report delivery');

   fail=true;

   purchase('welcome-test-token-007');
   await settle();

   fail=false;

   const retry=calls.length;

   result={
     status:'delivered',
     credited:true,
     consumption:'completed'
   };

   purchase('welcome-test-token-007');
   await settle();

   assert.equal(calls.length,retry+1);

   console.log('PASS 8: Network interruption recovery');

   hold=new Promise(resolve=>release=resolve);

   purchase('welcome-test-token-008');

   const oldBalance=balance;
   const oldNotices=notices.length;

   account='b'.repeat(64);

   w.dispatchEvent(new w.Event('erischat:auth'));

   release(result);
   hold=null;

   await settle();

   assert.equal(balance,oldBalance);
   assert.equal(notices.length,oldNotices);

   console.log('PASS 9: Stale account delivery ignored');

   account='';

   w.dispatchEvent(new w.Event('erischat:auth'));

   const previousCalls=calls.length;

   purchase('welcome-test-token-009');

   await settle();

   assert.equal(calls.length,previousCalls);

   console.log('PASS 10: Logout blocks receipt submission');

   account='c'.repeat(64);

   w.dispatchEvent(new w.Event('erischat:auth'));

   const recoveryBefore=recovery;

   tick();
   tick();

   assert.equal(recovery,recoveryBefore);

   time+=61000;
   tick();

   assert.equal(recovery,recoveryBefore+1);

   console.log('PASS 11: Recovery rate limit');

   assert.equal(w.localStorage.length,0);
   assert.equal(w.sessionStorage.length,0);

   console.log('PASS 12: No persistent receipt storage');

   console.log(
     '=== WELCOME PAYMENT V10.13: 12/12 PASS ==='
   );

 }finally{
   w.close();
 }
})().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
