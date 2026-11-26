(()=>{
'use strict';

const PREFIX='lidyachat.nobility.pending.v1:';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ACTIONS=['activate','upgrade','renew'];

const MAX_POINTS=9223372036854775807n;

function validUser(userId){
 return typeof userId==='string'&&
  userId.length>0&&
  userId.length<=64&&
  userId.trim()===userId;
}

function key(userId){
 if(!validUser(userId)){
  throw new Error('Invalid account identity');
 }

 return PREFIX+encodeURIComponent(userId);
}

function validPoints(value){
 return typeof value==='string'&&
  value.length<=19&&
  /^(0|[1-9][0-9]*)$/.test(value)&&
  BigInt(value)<=MAX_POINTS;
}

function validRevision(value){
 return typeof value==='string'&&
  value.length===64&&
  /^[0-9a-f]{64}$/.test(value);
}

function validate(record,userId){
 if(
  !record||
  typeof record!=='object'||
  Array.isArray(record)||
  record.version!==2||
  record.userId!==userId||
  !validUser(record.userId)||
  !ACTIONS.includes(record.action)||
  !Number.isInteger(record.rank)||
  record.rank<1||
  record.rank>4||
  typeof record.requestId!=='string'||
  record.requestId.length!==36||
  !UUID.test(record.requestId)||
  !validRevision(record.revision)||
  !validPoints(record.cost)||
  BigInt(record.cost)<=0n||
  !Number.isSafeInteger(record.createdAt)||
  record.createdAt<=0
 ){
  throw new Error('Invalid pending transaction');
 }

 const allowed=[
  'version','userId','action','rank',
  'requestId','cost','revision','createdAt'
 ];

 if(
  Object.keys(record).length!==allowed.length||
  Object.keys(record).some(k=>!allowed.includes(k))
 ){
  throw new Error('Unexpected transaction fields');
 }

 return Object.freeze(record);
}

function read(userId){
 const raw=window.localStorage.getItem(
  key(userId)
 );

 if(raw===null)return null;

 if(raw.length>2048){
  throw new Error('Invalid pending record size');
 }

 return validate(JSON.parse(raw),userId);
}

function reserve(userId,state,requestId){
 if(read(userId)!==null){
  throw new Error('Pending transaction exists');
 }

 if(
  !state||
  state.kind!=='action'||
  state.enabled!==true
 ){
  throw new Error('Invalid transaction state');
 }

 const record=validate({
  version:2,
  userId,
  action:state.action,
  rank:state.rank,
  requestId,
  cost:state.cost,
  revision:state.revision,
  createdAt:Date.now()
 },userId);

 const raw=JSON.stringify(record);

 window.localStorage.setItem(
  key(userId),raw
 );

 if(
  window.localStorage.getItem(
   key(userId)
  )!==raw
 ){
  throw new Error('Pending transaction not persisted');
 }

 return record;
}

function clear(userId,requestId){
 const existing=read(userId);

 if(!existing)return false;

 if(existing.requestId!==requestId){
  throw new Error('Pending transaction conflict');
 }

 window.localStorage.removeItem(
  key(userId)
 );

 if(read(userId)!==null){
  throw new Error('Pending transaction not cleared');
 }

 return true;
}

window.LidyaNobilityPending=Object.freeze({
 read,
 reserve,
 clear
});

})();
