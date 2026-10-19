(() => {
"use strict";

const API=()=>((window.ERIS_API||window.ERISCHAT_API||
"https://erischat-api-production.up.railway.app/v1").replace(/\/$/,""));

const token=()=>localStorage.getItem("erischat_access_token")||
localStorage.getItem("erischat.accessToken.v1")||
localStorage.getItem("token")||"";

async function api(path,opt={}) {
  const h={Accept:"application/json"};
  if(token())h.Authorization="Bearer "+token();
  if(opt.body)h["Content-Type"]="application/json";
  const r=await fetch(API()+path,{...opt,headers:h});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.detail||("HTTP "+r.status));
  return d;
}

function cleanup(){
  document.querySelectorAll(
    "#demoAudit,.demo-only,.demo-control,#demoControlCenter,[data-demo-only]"
  ).forEach(x=>x.remove());
}

async function syncRoom(){
  const id=window.ErisCurrentRoomId||window.currentRoomId||
    window.__erisRoom?.public_id||window.__erisRoom?.id;
  if(!id)return;

  try{
    const room=await api("/rooms/"+encodeURIComponent(id));
    window.__erisLiveRoom=room;
    window.__erisRoomPermissions={
      is_owner:!!room.is_owner,
      is_moderator:!!room.is_moderator,
      can_manage:!!room.can_manage
    };

    const level=document.getElementById("erisRoomLevel");
    if(level){
      level.textContent="Lv "+Number(room.level||1);
      level.onclick=()=>{
        window.toast?.(
          "Seviye "+Number(room.level||1)+
          " • "+Number(room.seat_count||8)+" koltuk • "+
          Number(room.spent_lidya||0).toLocaleString("tr-TR")+" Lidya"
        );
      };
    }

    document.querySelectorAll("[data-room-name]")
      .forEach(x=>x.textContent=room.name||x.textContent);

    document.querySelectorAll("[data-room-capacity]")
      .forEach(x=>x.textContent=(room.seat_count||8)+" koltuk");

    if(!room.can_manage){
      document.querySelectorAll(
        "#roomSettings,#roomTheme,#roomPassword,#roomMusicManage,"+
        "#seatLock,#seatMute,#seatKick,.room-settings,.room-theme,"+
        ".seat-lock,.seat-mute,.seat-kick"
      ).forEach(x=>x.remove());
    }
  }catch{}
}

function boot(){
  cleanup();
  syncRoom();
  setTimeout(syncRoom,1200);
  setTimeout(syncRoom,3000);
}

if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();

window.ErisProductionFinal={syncRoom};
})();