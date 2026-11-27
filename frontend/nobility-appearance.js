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
 const fallback=resolve(data,'super_avatar');

 if(data?.rank!==4||!fallback)return fallback;

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
 decorateRoomCard,decorateProfile
});

})();
