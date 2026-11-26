(()=>{
'use strict';

const MAX_POINTS=9223372036854775807n;

function parsePoints(value){
 if(
  typeof value!=='string'||
  value.length>19||
  !/^(0|[1-9][0-9]*)$/.test(value)
 ){
  throw new Error('Invalid points');
 }

 const points=BigInt(value);

 if(points>MAX_POINTS){
  throw new Error('Points overflow');
 }

 return points;
}

function unavailable(reason){
 return Object.freeze({
  kind:'unavailable',
  enabled:false,
  reason,
  action:null,
  rank:null,
  cost:null,
  revision:null,
  balance:null,
  remaining:null,
  missing:null,
  progress:0
 });
}

function resolve(data,targetRank,now=Date.now()){
 try{
  if(
   !Number.isInteger(targetRank)||
   targetRank<1||
   targetRank>4||
   !Number.isFinite(now)
  ){
   return unavailable('invalid_rank');
  }

  const catalog=data?.catalog;
  const me=data?.me;

  if(!catalog||!me){
   return unavailable('account_unavailable');
  }

  if(catalog.enabled!==true||me.enabled!==true){
   return unavailable('system_disabled');
  }

  if(me.configuration_valid!==true){
   return unavailable('configuration_invalid');
  }

  if(
   typeof me.revision!=='string'||
   me.revision.length!==64||
   !/^[0-9a-f]{64}$/.test(me.revision)
  ){
   return unavailable('invalid_revision');
  }

  if(
   !Number.isInteger(me.rank)||
   me.rank<0||
   me.rank>4||
   typeof me.active!=='boolean'||
   me.active!==(me.rank>0)
  ){
   return unavailable('invalid_membership');
  }

  if(me.active){
   const expiry=Date.parse(me.expires_at);

   if(!Number.isFinite(expiry)||expiry<=now){
    return unavailable('refresh_required');
   }
  }

  if(!Array.isArray(catalog.ranks)){
   return unavailable('invalid_catalog');
  }

  const matches=catalog.ranks.filter(
   item=>item?.rank===targetRank
  );

  if(matches.length!==1){
   return unavailable('invalid_catalog');
  }

  const target=matches[0];

  if(target.available!==true){
   return unavailable('rank_unavailable');
  }

  if(target.duration_days!==30){
   return unavailable('invalid_duration');
  }

  const balance=parsePoints(me.points);

  if(me.rank>targetRank){
   return unavailable('higher_rank_active');
  }

  const action=me.rank===0
   ?'activate'
   :me.rank===targetRank
    ?'renew'
    :'upgrade';

  const required=parsePoints(
   target.required_points
  );

  const renewal=parsePoints(
   target.renewal_points
  );

  if(
   required<=0n||
   renewal<=0n||
   renewal*4n!==required
  ){
   return unavailable('invalid_price');
  }

  const cost=action==='renew'
   ?renewal
   :required;

  const sufficient=balance>=cost;

  const progress=sufficient
   ?100
   :Number(balance*10000n/cost)/100;

  return Object.freeze({
   kind:sufficient?'action':'topup',
   enabled:true,
   reason:sufficient
    ?null
    :'insufficient_points',
   action,
   rank:targetRank,
   cost:cost.toString(),
   revision:me.revision,
   balance:balance.toString(),
   remaining:sufficient
    ?(balance-cost).toString()
    :null,
   missing:sufficient
    ?'0'
    :(cost-balance).toString(),
   progress
  });

 }catch(_){
  return unavailable('invalid_account_data');
 }
}

window.LidyaNobilityActionState=Object.freeze({
 resolve
});

})();
