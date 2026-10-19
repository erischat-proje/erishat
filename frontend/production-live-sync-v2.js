(() => {
"use strict";
const API=()=>((window.ERIS_API||window.ERISCHAT_API||
"https://erischat-api-production.up.railway.app/v1").replace(/\/$/,""));
const token=()=>localStorage.getItem("erischat_access_token")||
localStorage.getItem("erischat.accessToken.v1")||localStorage.getItem("token")||"";
async function api(path,opt={}){return window.ErisPlatform.api(path,opt);}
function roomId(){
 return window.ErisCurrentRoomId||window.currentRoomId||"";
}
function apply(d){
 if(!d)return;
 window.__erisRoomPermissions={...window.__erisRoomPermissions,
  is_owner:!!d.is_owner,is_moderator:!!d.is_moderator,
  can_manage:!!d.can_manage,can_moderate:!!d.can_manage
 };
 window.__erisLiveRoom=d;
 window.dispatchEvent(new CustomEvent('erischat:room-permissions',{detail:{room:d}}));
 document.querySelectorAll("[data-room-name]").forEach(x=>x.textContent=d.name||x.textContent);
 document.querySelectorAll("[data-room-level]").forEach(x=>x.textContent="Lv "+d.level);
 document.querySelectorAll("[data-room-capacity]").forEach(x=>x.textContent=(d.seat_count||8)+" koltuk");
}
let refreshing=false;
async function refresh(){
 const id=roomId(); if(!id||refreshing||document.hidden)return;refreshing=true;
 try{const room=await api("/rooms/"+encodeURIComponent(id));if(String(roomId())===String(id))apply(room);}catch{}finally{refreshing=false;}
}
window.ErisProductionRoom={
 refresh,
 async theme(theme){
  const id=roomId(); if(!id)throw Error("Oda bulunamadı");
  const d=await api("/rooms/"+encodeURIComponent(id)+"/theme",
   {method:"PATCH",body:JSON.stringify({theme})}); apply(d); await refresh(); return d;
 },
 async seats(seat_count){
  const id=roomId(); if(!id)throw Error("Oda bulunamadı");
  const d=await api("/rooms/"+encodeURIComponent(id)+"/seats",
   {method:"PATCH",body:JSON.stringify({seat_count})}); apply(d); await refresh(); return d;
 }
};
if(document.readyState==="loading")
 document.addEventListener("DOMContentLoaded",refresh,{once:true});
else refresh();
window.ErisApiTransport.poll(refresh,10000,()=>!!roomId());
window.addEventListener('erischat:room-opened',e=>apply(e.detail?.room));
window.addEventListener('erischat:room-closed',()=>{window.__erisLiveRoom=null;window.__erisRoomPermissions={};});
})();
