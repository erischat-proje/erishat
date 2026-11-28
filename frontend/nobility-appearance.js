(()=>{
'use strict';

const required=Object.freeze({
 badge:1,
 frame:1,
 entrance:1,
 region_background:3,
 room_frame:4,
 super_avatar:4
});

function resolve(data,privilege){
 if(!Object.hasOwn(required,privilege))return null;

 const rank=data?.rank;

 if(!Number.isInteger(rank)||rank<1||rank>4)return null;
 if(rank<required[privilege])return null;

 if(rank===4 && Object.hasOwn(data,'king_expires_at')){
  const end=Date.parse(data.king_expires_at);
  if(!Number.isFinite(end)||end<=Date.now())return null;
 }

 if(!Array.isArray(data.privileges)||
    !data.privileges.includes(privilege))return null;

 return window.LidyaNobilityAssets?.resolve(
  rank,privilege
 )||null;
}

function badge(element,data){
 if(!element)return;

 element.querySelectorAll(
  '[data-nobility-badge]'
 ).forEach(node=>node.remove());

 const src=resolve(data,'badge');
 if(!src)return;

 const image=document.createElement('img');

 image.dataset.nobilityBadge='';
 image.className='lidya-nobility-badge';
 image.src=src;
 image.alt=['','Şövalye','Kont','Dük','Kral'][data.rank];
 image.title=image.alt;
 image.draggable=false;

 element.append(image);
}

function roomVisuals(data){
 return Object.freeze({
  background:resolve(data,'region_background'),
  frame:resolve(data,'room_frame')
 });
}

function superAvatar(data){
 const entitlement=resolve(data,'super_avatar');

 if(data?.rank!==4||!entitlement)return entitlement;

 let fallback=entitlement;

 if(Object.hasOwn(data,'king_avatar_variant')){
  const variant=data.king_avatar_variant;

  fallback=['male','female'].includes(variant)
   ? './assets/lidya-nobility/king/king-avatar-'+
     variant+'.webp'
   : null;
 }

 const avatar=data.animated_avatar;
 const id=avatar?.asset_id;

 if(typeof id!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)){
  return fallback;
 }

 const expires=Date.parse(avatar.expires_at);

 if(!Number.isFinite(expires)||expires<=Date.now()){
  return fallback;
 }

 try{
  const api=new URL(
   window.ERIS_API||
   'https://erischat-api-production.up.railway.app/v1'
  );

  if(api.protocol!=='https:')return fallback;

  return api.href.replace(/\/+$/,'')+
   '/nobility/animated-avatar/'+id;

 }catch{
  return fallback;
 }
}

function hasEmbeddedFrame(data,src){
 const embedded=resolve(data,'super_avatar');
 return Boolean(
  data?.rank===4 &&
  src &&
  embedded &&
  src===embedded
 );
}

function royalPortrait(user,data=user?.nobility){
 if(!user||data?.rank!==4)return null;

 if(
  user.management_locked===true ||
  ['SA','UA','FA','DA'].includes(user.admin_role) ||
  window.ErisStaffIdentity?.isStaff(user) ||
  [user.avatar_asset,user.frame_asset].some(value=>
   String(value||'').includes('/role-icons/management-v1/')
  )
 )return null;

 const avatar=superAvatar(data);
 const embedded=hasEmbeddedFrame(data,avatar);
 const frame=embedded?'':resolve(data,'frame');

 if(!avatar&&!frame)return null;

 return Object.freeze({avatar,frame,embedded});
}

const kingExpiryJobs=new Map();
const kingRefreshInFlight=new Set();

function kingSession(){
 const token=window.ErisAuth?.getToken?.();
 const viewer=window.ErisAuth?.user?.id;

 return token&&viewer
  ? {token,viewer:String(viewer)}
  : null;
}

function sameKingSession(session){
 const current=kingSession();

 return Boolean(
  session&&current&&
  session.token===current.token&&
  session.viewer===current.viewer
 );
}

function sameRoyalVisual(before,after){
 const privileges=data=>['frame','super_avatar']
  .filter(key=>data?.privileges?.includes(key))
  .join(',');

 return (
  before?.rank===4&&after?.rank===4&&
  before.king_avatar_variant===after.king_avatar_variant&&
  privileges(before)===privileges(after)&&
  (before.animated_avatar?.asset_id||'')===
   (after.animated_avatar?.asset_id||'')&&
  (before.animated_avatar?.expires_at||'')===
   (after.animated_avatar?.expires_at||'')
 );
}

function verifyKingDeadline(userId,jobs){
 const now=Date.now();

 if(
  kingRefreshInFlight.has(userId)||
  kingRefreshInFlight.size>=4
 ){
  for(const [,job] of jobs){
   job.checkAt=Math.min(job.expires,now+1000);
  }
  return;
 }

 const session=kingSession();

 if(!session||typeof window.ErisPlatform?.api!=='function'){
  for(const [,job] of jobs)job.checkAt=Infinity;
  return;
 }

 jobs=jobs.filter(([,job])=>
  sameKingSession(job.session)
 );

 if(!jobs.length)return;

 for(const [,job] of jobs){
  job.checkAt=job.expires-now>5000
   ? job.expires-5000
   : Infinity;
 }

 kingRefreshInFlight.add(userId);

 Promise.resolve()
  .then(()=>window.ErisPlatform.api(
   '/users/'+encodeURIComponent(userId)
  ))
  .then(profile=>{
   if(!sameKingSession(session))return;

   if(String(profile?.id||'')!==userId)return;

   const data=profile.nobility;
   const deadline=Date.parse(data?.king_expires_at);

   const authorized=Boolean(
    !profile.banned&&
    !profile.you_blocked&&
    !profile.blocked_by_them&&
    !profile.management_locked&&
    !['SA','UA','FA','DA'].includes(profile.admin_role)&&
    data?.rank===4&&
    Number.isFinite(deadline)&&
    deadline>Date.now()
   );

   for(const [node,job] of jobs){
    if(
     kingExpiryJobs.get(node)!==job||
     !node.isConnected||
     !sameKingSession(job.session)
    )continue;

    if(!authorized){
     job.data.king_expires_at=
      new Date(Date.now()).toISOString();

     kingExpiryJobs.delete(node);
     job.restore();
     continue;
    }

    if(
     deadline>job.expires&&
     sameRoyalVisual(job.data,data)
    ){
     job.data.king_expires_at=data.king_expires_at;
     job.expires=deadline;
     job.checkAt=Math.max(
      Date.now(),deadline-30000
     );
    }
   }
  })
  .catch(()=>{
   // Network failure never extends membership.
  })
  .finally(()=>{
   kingRefreshInFlight.delete(userId);
   scheduleKingExpiry();
  });
}
let kingExpiryTimer=null;
let kingExpiryListening=false;

function scheduleKingExpiry(){
 if(kingExpiryTimer!==null){
  window.clearTimeout(kingExpiryTimer);
  kingExpiryTimer=null;
 }

 if(!kingExpiryJobs.size)return;

 let earliest=Infinity;

 for(const job of kingExpiryJobs.values()){
  earliest=Math.min(
   earliest,job.expires,job.checkAt??Infinity
  );
 }

 kingExpiryTimer=window.setTimeout(
  sweepKingExpiry,
  Math.max(0,Math.min(30000,earliest-Date.now()))
 );
}

function sweepKingExpiry(){
 const now=Date.now();
 const pending=new Map();

 for(const [node,job] of kingExpiryJobs){
  if(!node.isConnected){
   kingExpiryJobs.delete(node);
   continue;
  }

  if(job.expires<=now){
   kingExpiryJobs.delete(node);

   try{
    job.restore();
   }catch(error){
    console.warn('[LidyaChat] Royal expiry',error);
   }
   continue;
  }

  if(job.userId&&!sameKingSession(job.session)){
   job.checkAt=Infinity;
   continue;
  }

  if(job.userId&&job.checkAt<=now){
   if(!pending.has(job.userId)){
    pending.set(job.userId,[]);
   }

   pending.get(job.userId).push([node,job]);
  }
 }

 for(const [userId,jobs] of pending){
  verifyKingDeadline(userId,jobs);
 }

 scheduleKingExpiry();
}

function watchKingExpiry(node,data,restore,userId=null){
 if(!node||typeof window.setTimeout!=='function'){
  return false;
 }

 kingExpiryJobs.delete(node);

 const expires=Date.parse(data?.king_expires_at);

 if(
  data?.rank!==4 ||
  !Number.isFinite(expires) ||
  expires<=Date.now() ||
  typeof restore!=='function'
 ){
  scheduleKingExpiry();
  return false;
 }

 const session=kingSession();

 kingExpiryJobs.set(node,{
  expires,
  restore,
  data,
  session,
  userId:userId&&session?String(userId):null,
  checkAt:userId&&session
   ? Math.max(Date.now(),expires-30000)
   : Infinity
 });

 if(!kingExpiryListening){
  kingExpiryListening=true;

  if(typeof document!=='undefined'){
   document.addEventListener(
    'visibilitychange',sweepKingExpiry
   );
  }

  window.addEventListener?.(
   'pageshow',sweepKingExpiry
  );
 }

 scheduleKingExpiry();

 return true;
}

function watchKingExpiryFor(node,data,userId,restore){
 return watchKingExpiry(node,data,restore,userId);
}

function appendRoyalFrame(element,royal){
 if(!element||!royal?.frame||royal.embedded)return;

 element.classList.add('lidya-social-royal-portrait');

 const frame=document.createElement('img');
 frame.className='lidya-social-royal-frame';
 frame.src=royal.frame;
 frame.alt='';
 frame.draggable=false;

 frame.onerror=()=>{
  frame.remove();
  element.classList.remove('lidya-social-royal-portrait');
 };

 element.append(frame);
}

function decorateRoomCard(element,data){
 if(!element)return;

 const src=resolve(data,'room_frame');

 element.classList.toggle(
  'lidya-nobility-room-card',Boolean(src)
 );

 if(src){
  element.style.setProperty(
   '--lidya-nobility-room-frame',
   'url("'+src+'")'
  );
 }else{
  element.style.removeProperty(
   '--lidya-nobility-room-frame'
  );
 }
}

function decorateProfile(element,user){
 if(!element)return;

 const staff=user?.management_locked===true||
  ['SA','UA','FA','DA'].includes(user?.admin_role);

 const src=staff?null:resolve(
  user?.nobility,'region_background'
 );

 element.classList.toggle(
  'lidya-nobility-profile',Boolean(src)
 );

 if(src){
  element.style.setProperty(
   '--lidya-nobility-profile-bg',
   'url("'+src+'")'
  );
 }else{
  element.style.removeProperty(
   '--lidya-nobility-profile-bg'
  );
 }
}

window.LidyaNobilityAppearance=Object.freeze({
 resolve,badge,roomVisuals,superAvatar,hasEmbeddedFrame,
 royalPortrait,watchKingExpiry,watchKingExpiryFor,appendRoyalFrame,decorateRoomCard,decorateProfile
});

})();
