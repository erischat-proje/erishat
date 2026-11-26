(()=>{
'use strict';

let inFlight=false;

const LOCK_PREFIX='lidyachat.nobility.finance.v1:';

function supported(){
 try{
  return window.isSecureContext===true&&
   typeof window.navigator?.locks?.request==='function';
 }catch(_){
  return false;
 }
}

function lockName(userId){
 if(typeof userId!=='string'||
    userId.length===0||
    userId.length>64||
    userId.trim()!==userId){
  throw new Error('Invalid account identity');
 }

 return LOCK_PREFIX+encodeURIComponent(userId);
}

async function withAccountLock(snapshot,signal,operation){
 if(!supported()){
  throw new Error('Secure financial lock unavailable');
 }

 const api=window.LidyaNobilityAPI;

 if(!api?.sameSession(snapshot)||signal?.aborted){
  throw new Error('Session unavailable');
 }

 const name=lockName(snapshot.userId);

 return await window.navigator.locks.request(
  name,
  {
   mode:'exclusive',
   ifAvailable:true
  },
  async lock=>{
   if(!lock){
    throw new Error('Account financial action already running');
   }

   if(lock.name!==name||lock.mode!=='exclusive'){
    throw new Error('Invalid financial lock');
   }

   if(!api.sameSession(snapshot)||signal?.aborted){
    throw new Error('Session changed');
   }

   return await operation();
  }
 );
}


function busy(){
 return inFlight;
}

function sameRecord(a,b){
 return !!a&&!!b&&[
  'version',
  'userId',
  'action',
  'rank',
  'requestId',
  'cost',
  'revision',
  'createdAt'
 ].every(field=>a[field]===b[field]);
}

async function submit(
 snapshot,state,signal
){
 if(inFlight){
  throw new Error('Action already running');
 }

 inFlight=true;

 try{
  return await withAccountLock(
   snapshot,signal,async()=>{

  const api=window.LidyaNobilityAPI;
  const pending=window.LidyaNobilityPending;

  if(!api||!pending){
   throw new Error('Action service unavailable');
  }

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session unavailable');
  }

  if(!state||
     state.kind!=='action'||
     state.enabled!==true){
   throw new Error('Invalid action state');
  }

  if(pending.read(snapshot.userId)!==null){
   throw new Error('Pending action exists');
  }

  const requestId=api.newRequestId();

  const record=pending.reserve(
   snapshot.userId,state,requestId
  );

  if(!sameRecord(
   record,pending.read(snapshot.userId)
  )){
   throw new Error('Pending record changed');
  }

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session changed');
  }

  const result=await api.action(
   snapshot,
   record.action,
   record.rank,
   record.requestId,
   {
    revision:record.revision,
    cost:record.cost
   },
   signal
  );

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session changed');
  }

  if(!result||
     result.ok!==true||
     result.action!==record.action||
     typeof result.applied!=='boolean'||
     typeof result.duplicate!=='boolean'||
     result.applied===result.duplicate||
     result.membership?.user_id!==snapshot.userId){
   throw new Error('Invalid action result');
  }

  if(!sameRecord(
   record,pending.read(snapshot.userId)
  )){
   throw new Error('Pending record changed');
  }

  if(pending.clear(
   snapshot.userId,record.requestId
  )!==true){
   throw new Error('Pending cleanup failed');
  }

  return result;

   }
  );
 }finally{
  inFlight=false;
 }
}

async function recover(
 snapshot,expectedRecord,signal
){
 if(inFlight){
  throw new Error('Action already running');
 }

 inFlight=true;

 try{
  return await withAccountLock(
   snapshot,signal,async()=>{

  const api=window.LidyaNobilityAPI;
  const pending=window.LidyaNobilityPending;

  if(!api||!pending){
   throw new Error('Action service unavailable');
  }

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session unavailable');
  }

  const record=pending.read(snapshot.userId);

  if(!record||
     !sameRecord(record,expectedRecord)){
   throw new Error('Pending record changed');
  }

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session changed');
  }

  const result=await api.action(
   snapshot,
   record.action,
   record.rank,
   record.requestId,
   {
    revision:record.revision,
    cost:record.cost
   },
   signal
  );

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session changed');
  }

  if(!result||
     result.ok!==true||
     result.action!==record.action||
     typeof result.applied!=='boolean'||
     typeof result.duplicate!=='boolean'||
     result.applied===result.duplicate||
     result.membership?.user_id!==snapshot.userId){
   throw new Error('Invalid recovery result');
  }

  if(!sameRecord(
   record,pending.read(snapshot.userId)
  )){
   throw new Error('Pending record changed');
  }

  if(pending.clear(
   snapshot.userId,record.requestId
  )!==true){
   throw new Error('Pending cleanup failed');
  }

  return result;

   }
  );
 }finally{
  inFlight=false;
 }
}

async function cancel(
 snapshot,expectedRecord,signal
){
 if(inFlight){
  throw new Error('Action already running');
 }

 inFlight=true;

 try{
  return await withAccountLock(
   snapshot,signal,async()=>{

  const api=window.LidyaNobilityAPI;
  const pending=window.LidyaNobilityPending;

  if(!api||!pending||
     typeof api.cancel!=='function'){
   throw new Error('Cancellation service unavailable');
  }

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session unavailable');
  }

  const record=pending.read(snapshot.userId);

  if(!record||
     !sameRecord(record,expectedRecord)){
   throw new Error('Pending record changed');
  }

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session changed');
  }

  const result=await api.cancel(
   snapshot,
   record,
   signal
  );

  if(!api.sameSession(snapshot)||signal?.aborted){
   throw new Error('Session changed');
  }

  if(!result||
     result.ok!==true||
     result.user_id!==record.userId||
     result.request_id!==record.requestId||
     result.action!==record.action||
     result.rank!==record.rank||
     result.confirmed_cost!==record.cost||
     result.confirmed_revision!==record.revision||
     !['cancelled','completed'].includes(result.status)||
     typeof result.duplicate!=='boolean'||
     (result.status==='completed'&&
      result.duplicate!==true)){
   throw new Error('Invalid cancellation result');
  }

  if(!sameRecord(
   record,pending.read(snapshot.userId)
  )){
   throw new Error('Pending record changed');
  }

  if(pending.clear(
   snapshot.userId,record.requestId
  )!==true){
   throw new Error('Pending cleanup failed');
  }

  return result;

   }
  );
 }finally{
  inFlight=false;
 }
}

window.LidyaNobilitySubmit=Object.freeze({
 busy,
 supported,
 submit,
 recover,
 cancel
});

})();
