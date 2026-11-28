(()=>{
  'use strict';

  if(window.LidyaWelcomePayment)return;

  const products=new Set([
    'welcome_bronze_v1',
    'welcome_silver_v1',
    'welcome_gold_v1'
  ]);

  const token=()=>
    window.ErisPlatform?.getAccessToken?.()||'';

  const inflight=new Map();
  const completed=new Set();

  let account='';
  let generation=0;
  let lastRecovery=-Infinity;

  function sync(){
    const current=token();

    if(current!==account){
      account=current;
      generation++;

      inflight.clear();
      completed.clear();

      lastRecovery=-Infinity;
    }

    return !!account;
  }

  function notify(message){
    if(typeof window.toast==='function'){
      window.toast(message);
    }
  }

  async function deliver(detail){

    if(!sync())return;

    const product=detail?.productId;
    const receipt=detail?.purchaseToken;

    if(!products.has(product)||
       typeof receipt!=='string'||
       receipt.length<8||
       receipt.length>4096)
      return;

    const key=product+'|'+receipt;

    if(inflight.has(key)||
       completed.has(key)||
       inflight.size>=8)
      return;

    const owner=account;
    const version=generation;
    const request={};

    inflight.set(key,request);

    const valid=()=>
      owner===token()&&
      generation===version&&
      inflight.get(key)===request;

    try{

      const result=await window.ErisPlatform.api(
        '/welcome-packages/checkout-complete',
        {
          method:'POST',
          cache:'no-store',
          body:JSON.stringify({
            product_id:product,
            purchase_token:receipt
          })
        }
      );

      if(!valid())return;

      if(result.status==='review_required'){

        notify(
          'Hoş Geldin ödemeniz inceleme bekliyor.'
        );

        return;
      }

      if(result.status!=='delivered'||
         !(result.credited===true||
           result.already_credited===true))
        return;

      if(result.consumption==='completed'){
        if(completed.size>=64)
          completed.delete(completed.values().next().value);

        completed.add(key);
      }

      if(result.credited===true){

        notify(
          'Hoş Geldin paketiniz hesabınıza teslim edildi.'
        );

      }else if(result.already_credited===true){

        notify(
          'Hoş Geldin paketiniz daha önce teslim edilmiş.'
        );
      }

      window.dispatchEvent(
        new Event('lidyachat:balance-refresh')
      );

      window.dispatchEvent(
        new Event('lidyachat:appearance-refresh')
      );

      window.LidyaWelcomePackages?.refresh?.();

      if(result.consumption==='retry_required'){

        notify(
          'Teslimat tamamlandı. Google Play onayı yeniden denenecek.'
        );
      }

    }catch(_){

      if(!valid())return;

      notify(
        'Hoş Geldin ödeme doğrulaması bekliyor. Daha sonra yeniden kontrol edilecek.'
      );

    }finally{

      if(inflight.get(key)===request)
        inflight.delete(key);
    }
  }

  function recover(){

    if(!sync()||document.hidden)return;

    const bridge=window.ErisChatAndroid;

    if(typeof bridge?.recoverWelcomePurchases!=='function')
      return;

    const now=performance.now();

    if(now-lastRecovery<60000)return;

    lastRecovery=now;

    try{
      bridge.recoverWelcomePurchases();
    }catch(_){}
  }

  window.addEventListener(
    'lidyachat:welcome-play-purchased',
    event=>deliver(event.detail)
  );

  for(const event of [
    'erischat:auth',
    'erischat:auth-ready',
    'erischat:auth-state',
    'erischat:auth-state-changed',
    'storage',
    'focus',
    'online',
    'pageshow'
  ]){
    window.addEventListener(event,recover);
  }

  document.addEventListener(
    'visibilitychange',recover
  );

  setInterval(recover,15000);

  window.LidyaWelcomePayment={recover};

  recover();

})();
