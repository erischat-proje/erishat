(()=>{"use strict";
const S=[
'[data-room-setting]','[data-room-theme]','[data-room-rename]',
'[data-room-lock]','[data-room-password]','[data-room-capacity]',
'[data-room-seats]','[data-room-moderator]','[data-room-ban]',
'[data-room-kick]','[data-room-mute]','.room-settings','.room-theme',
'.room-management','.room-admin','.room-owner-only','.seat-lock',
'.seat-mute','.seat-kick'
];
function guard(){
 const p=window.__erisRoomPermissions||{};
 const owner=!!(p.is_owner||p.owner);
 const mod=!!(p.is_moderator||p.moderator);
 const manage=!!(p.can_manage||p.manage);
 if(!owner&&!mod&&!manage)S.forEach(x=>{try{document.querySelectorAll(x).forEach(e=>e.remove())}catch(_){}});
 if(!owner)[
  '[data-room-rename]','[data-room-theme]','[data-room-password]',
  '[data-room-capacity]','[data-room-seats]','[data-room-moderator]',
  '.room-owner-only'
 ].forEach(x=>{try{document.querySelectorAll(x).forEach(e=>e.remove())}catch(_){}});
}
window.ErisProductionRoom={enforceRoomPermissions:guard};
new MutationObserver(guard).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(guard,0);
})();