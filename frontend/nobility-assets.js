(()=>{
'use strict';

const base='./assets/lidya-nobility/';

const files=Object.freeze({
 crest:'crest.png',
 badge:'badge.png',
 frame:'frame.png',
 entrance:'entrance-thumb.png',
 entrance_video:'entrance.mp4',
 region_background:'region-background.png',
 room_frame:'room-frame.png',
 super_avatar:'super-avatar.png',
 gift_banner:'gift-banner.png',
 activation_banner:'activation-banner.png',
 daily_banner:'daily-banner.png',
 room_welcome:'room-welcome.png',
 online_priority:'online-priority.png',
 kick_protection:'kick-protection.png',
 gift_bonus:'gift-bonus.png',
 animated_avatar:'animated-avatar.png',
 couple_repair:'couple-repair.png',
 super_kick:'super-kick.png'
});

const catalog=window.LidyaNobilityCatalog;

if(!catalog)return;

function resolve(rank,id){
 const r=catalog.ranks.find(x=>x.id===rank);

 if(!r||!Object.hasOwn(files,id))return null;

 const p=catalog.privileges.find(
  x=>x.id===id
 );

 const required=p
  ? Math.max(rank,p.minRank)
  : rank;

 const owner=catalog.ranks.find(
  x=>x.id===required
 );

 if(!owner)return null;

 if(rank===4 && id==='daily_banner')return base+'king/king-daily-banner-v5.png';
 return base+owner.key+'/'+files[id];
}

const kingPreviews=Object.freeze({
 online_priority:'online-priority.png',
 gift_banner:'gift-banner-preview.png',
 activation_banner:'activation-banner-preview.png',
 kick_protection:'kick-protection.png',
 room_welcome:'room-welcome-preview.png',
 gift_bonus:'gift-bonus-preview.png',
 daily_banner:'daily-banner-preview.png',
 animated_avatar:'animated-avatar.png',
 couple_repair:'couple-repair.png',
 super_kick:'super-kick.png',
});

function resolvePreview(rank,id){
 if(rank===4 && Object.hasOwn(kingPreviews,id)){
  return base+'king/previews/'+kingPreviews[id];
 }
 return resolve(rank,id);
}

window.LidyaNobilityAssets=Object.freeze({
 resolve,
 resolvePreview,
 files
});
})();
