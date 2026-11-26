(()=>{
'use strict';

const API=()=>(
 window.ERIS_API ||
 window.ERISCHAT_API ||
 'https://erischat-api-production.up.railway.app/v1'
).replace(/\/$/,'');

const MAX_POINTS=9223372036854775807n;

function validUserId(value){
 return typeof value==='string'&&
  value.length>0&&
  value.length<=64&&
  value.trim()===value;
}

function validRevision(value){
 return typeof value==='string'&&
  value.length===64&&
  /^[0-9a-f]{64}$/.test(value);
}

function validPoints(value,positive=false){
 if(typeof value!=='string'||
    value.length>19||
    !/^(0|[1-9][0-9]*)$/.test(value)){
  return false;
 }

 const points=BigInt(value);

 return points<=MAX_POINTS&&
  (!positive||points>0n);
}

function validateMembership(data,snapshot){
 if(
  !data||
  data.user_id!==snapshot.userId||
  !validRevision(data.revision)||
  typeof data.enabled!=='boolean'||
  typeof data.configuration_valid!=='boolean'||
  !Number.isInteger(data.rank)||
  data.rank<0||
  data.rank>4||
  !validPoints(data.points)||
  typeof data.active!=='boolean'||
  data.active!==(data.rank>0)||
  !Array.isArray(data.privileges)||
  ((!data.enabled||!data.configuration_valid)&&
   data.rank!==0)
 ){
  throw new Error('Gecersiz uyelik yaniti');
 }

 return data;
}

function session(){
 const token=window.ErisAuth?.getToken?.();
 if(!token)throw new Error('Oturum gerekli');

 const userId=String(
  window.ErisAuth?.user?.id||''
 );

 if(!validUserId(userId)){
  throw new Error('Hesap kimligi gerekli');
 }

 return Object.freeze({token,userId});
}

function sameSession(snapshot){
 return Boolean(
  snapshot &&
  snapshot.token &&
  validUserId(snapshot.userId) &&
  window.ErisAuth?.getToken?.()===snapshot.token &&
  String(window.ErisAuth?.user?.id||'')===snapshot.userId
 );
}

async function request(
 path,snapshot,signal,body
){
 if(!sameSession(snapshot)){
  throw new Error('Oturum degisti');
 }

 const controller=new AbortController();
 const abort=()=>controller.abort();

 if(signal?.aborted)abort();
 signal?.addEventListener('abort',abort,{once:true});

 const timer=setTimeout(abort,15000);

 try{
  const response=await fetch(
   API()+'/nobility'+path,
   {
    method:body===undefined?'GET':'POST',
    headers:{
     Authorization:'Bearer '+snapshot.token,
     Accept:'application/json',
    ...(body===undefined?{}:{
     'Content-Type':'application/json'
    })
    },
    ...(body===undefined?{}:{
     body:JSON.stringify(body)
    }),
    cache:'no-store',
    signal:controller.signal
   }
  );

  if(!response.ok){
   let detail=null;

   try{
    const failure=await response.json();

    if(typeof failure?.detail==='string'){
     detail=failure.detail;
    }
   }catch(_){}

   if(!sameSession(snapshot)){
    throw new Error('Oturum degisti');
   }

   if(controller.signal.aborted){
    throw new Error('Istek iptal edildi');
   }

   const error=new Error('Asalet islemi basarisiz');
   error.status=response.status;
   error.code=detail;
   throw error;
  }

  const data=await response.json();

  if(!sameSession(snapshot)){
   throw new Error('Oturum degisti');
  }

  if(controller.signal.aborted){
   throw new Error('Istek iptal edildi');
  }

  if(data?.ok!==true){
   throw new Error('Gecersiz API yaniti');
  }

  return data;
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}

async function load(snapshot,signal){
 const [catalog,me]=await Promise.all([
  request('/catalog',snapshot,signal),
  request('/me',snapshot,signal)
 ]);

 if(!sameSession(snapshot)){
  throw new Error('Oturum degisti');
 }

 validateMembership(me,snapshot);

 return {catalog,me};
}

function history(snapshot,offset=0,signal){
 if(!Number.isInteger(offset)||
    offset<0||offset>10000){
  throw new Error('Gecersiz sayfa');
 }

 return request(
  '/history?limit=20&offset='+offset,
  snapshot,
  signal
 );
}

function newRequestId(){
 if(typeof window.crypto?.randomUUID==='function'){
  return window.crypto.randomUUID();
 }

 if(typeof window.crypto?.getRandomValues!=='function'){
  throw new Error('Guvenli islem kimligi olusturulamadi');
 }

 const bytes=new Uint8Array(16);

 window.crypto.getRandomValues(bytes);

 bytes[6]=(bytes[6]&15)|64;
 bytes[8]=(bytes[8]&63)|128;

 const hex=Array.from(
  bytes,b=>b.toString(16).padStart(2,'0')
 ).join('');

 return [
  hex.slice(0,8),
  hex.slice(8,12),
  hex.slice(12,16),
  hex.slice(16,20),
  hex.slice(20)
 ].join('-');
}

async function action(
 snapshot,type,rank,requestId,confirmation,signal
){
 if(!['activate','upgrade','renew'].includes(type)){
  throw new Error('Gecersiz asalet islemi');
 }

 if(!Number.isInteger(rank)||rank<1||rank>4){
  throw new Error('Gecersiz asalet sinifi');
 }

 if(typeof requestId!=='string'||
    requestId.length!==36||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)){
  throw new Error('Gecersiz islem kimligi');
 }

 if(
  !confirmation||
  !validRevision(confirmation.revision)||
  !validPoints(confirmation.cost,true)
 ){
  throw new Error('Gecersiz finansal onay');
 }

 const data=await request(
  '/'+type,
  snapshot,
  signal,
  {
   rank,
   request_id:requestId,
   confirmed_revision:confirmation.revision,
   confirmed_cost:confirmation.cost
  }
 );

 if(
  data.action!==type||
  typeof data.applied!=='boolean'||
  typeof data.duplicate!=='boolean'||
  data.applied===data.duplicate
 ){
  throw new Error('Gecersiz islem yaniti');
 }

 validateMembership(data.membership,snapshot);

 return data;
}

async function cancel(
 snapshot,record,signal
){
 if(!sameSession(snapshot)||signal?.aborted){
  throw new Error('Oturum kullanilamiyor');
 }

 if(!record||
    record.version!==2||
    record.userId!==snapshot.userId||
    !['activate','upgrade','renew'].includes(record.action)||
    !Number.isInteger(record.rank)||
    record.rank<1||
    record.rank>4||
    typeof record.requestId!=='string'||
    record.requestId.length!==36||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record.requestId)||
    !validRevision(record.revision)||
    !validPoints(record.cost,true)||
    !Number.isSafeInteger(record.createdAt)||
    record.createdAt<=0){
  throw new Error('Gecersiz bekleyen islem');
 }

 const body=Object.freeze({
  user_id:record.userId,
  request_id:record.requestId,
  action:record.action,
  rank:record.rank,
  confirmed_cost:record.cost,
  confirmed_revision:record.revision
 });

 const data=await request(
  '/cancel',
  snapshot,
  signal,
  body
 );

 if(!sameSession(snapshot)||signal?.aborted){
  throw new Error('Oturum degisti');
 }

 if(
  data.user_id!==body.user_id||
  data.request_id!==body.request_id||
  data.action!==body.action||
  data.rank!==body.rank||
  data.confirmed_cost!==body.confirmed_cost||
  data.confirmed_revision!==body.confirmed_revision||
  !['cancelled','completed'].includes(data.status)||
  typeof data.duplicate!=='boolean'||
  (data.status==='completed'&&data.duplicate!==true)
 ){
  throw new Error('Gecersiz kesin iptal yaniti');
 }

 return data;
}

window.LidyaNobilityAPI=Object.freeze({
 session,
 sameSession,
 load,
 history,
 newRequestId,
 action,
 cancel
});

})();
