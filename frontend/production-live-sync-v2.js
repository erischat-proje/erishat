(() => {
"use strict";
const API=()=>((window.ERIS_API||window.ERISCHAT_API||
"https://erischat-api-production.up.railway.app/v1").replace(/\/$/,""));
const token=()=>localStorage.getItem("erischat_access_token")||
localStorage.getItem("erischat.accessToken.v1")||localStorage.getItem("token")||"";
async function api(path,opt={}){
 const h={Accept:"application/json",...(token()?{Authorization:"Bearer "+token()}: {})};
 if(opt.body)h["Content-Type"]="application/json";
 const r=await fetch(API()+path,{...opt,headers:h});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.detail||("HTTP "+r.status));
 return d;
}
function roomId(){
 return window.__erisRoom?.public_id||window.__erisRoom?.id||
 document.querySelector("[data-room-id]")?.dataset.roomId||
 localStorage.getItem("erischat.currentRoom")||"";
}
function apply(d){
 if(!d)return;
 window.__erisRoomPermissions={
  is_owner:!!d.is_owner,is_moderator:!!d.is_moderator,
  can_manage:!!d.can_manage,can_moderate:!!d.can_manage
 };
 window.__erisLiveRoom=d;
 document.querySelectorAll("[data-room-name]").forEach(x=>x.textContent=d.name||x.textContent);
 document.querySelectorAll("[data-room-level]").forEach(x=>x.textContent="Lv "+d.level);
 document.querySelectorAll("[data-room-capacity]").forEach(x=>x.textContent=(d.seat_count||8)+" koltuk");
}
async function refresh(){
 const id=roomId(); if(!id)return;
 try{apply(await api("/rooms/"+encodeURIComponent(id)));}catch{}
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
setInterval(refresh,5000);
})();