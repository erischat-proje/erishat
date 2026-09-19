(() => {
  const style = document.createElement('style');
  style.id = 'eris-room-reference-ui';
  style.textContent = `
    #erisRoomSurface .eris-room-wall { background-position:center; }
    #erisRoomSurface .eris-room-top { height:74px; padding:9px 10px; background:linear-gradient(180deg,rgba(8,4,16,.78),rgba(8,4,16,.12)); }
    #erisRoomSurface .eris-room-top button { border-radius:14px; background:rgba(14,8,23,.60); border-color:rgba(255,255,255,.13); }
    #erisRoomSurface .eris-room-title b { font-size:15px; }
    #erisRoomSurface .eris-room-title small { font-size:8px; }
    #erisRoomSurface .eris-room-stage { top:100px; bottom:218px; }
    #erisRoomSurface .eris-room-core { width:108px; height:108px; background:rgba(13,8,22,.24); }
    #erisRoomSurface .eris-seat { width:82px; height:82px; border:0; background:transparent; }
    #erisRoomSurface .eris-seat .seat-ava { width:48px; height:48px; border:2px solid rgba(255,255,255,.38); box-shadow:0 5px 16px #0009; }
    #erisRoomSurface .eris-seat.empty .seat-ava { width:45px; height:45px; background:rgba(8,5,15,.55); border:1px dashed rgba(255,255,255,.35); }
    #erisRoomSurface .eris-seat b { font-size:8px; margin-top:3px; }
    #erisRoomSurface .eris-seat small { font-size:7px; }
    #erisRoomSurface .eris-seat.me { border-color:transparent; }
    #erisRoomSurface .eris-seat.me .seat-ava { box-shadow:0 0 0 3px rgba(255,80,170,.20),0 5px 18px #0009; }
    #erisRoomSurface .eris-room-chat { height:218px; background:linear-gradient(180deg,transparent,rgba(7,4,12,.42) 18%,rgba(7,4,12,.91) 62%,rgba(7,4,12,.97)); }
    #erisRoomSurface .eris-chat-msg { border-radius:14px; background:rgba(16,10,24,.62); }
    #erisRoomSurface .eris-room-compose input { height:40px; border-radius:20px; background:rgba(9,6,16,.68); }
    #erisRoomSurface .eris-room-compose button { height:40px; border-radius:20px; }
    #erisRoomSurface .eris-room-tools { bottom:228px; }
    @media(max-width:520px){
      #erisRoomSurface .eris-room-stage { top:100px; bottom:212px; }
      #erisRoomSurface .eris-seat { width:72px; height:72px; }
      #erisRoomSurface .eris-seat .seat-ava { width:43px; height:43px; }
      #erisRoomSurface .eris-room-chat { height:212px; }
      #erisRoomSurface .eris-room-tools { bottom:220px; }
    }
    @media(min-width:760px){
      #erisRoomSurface .eris-room-stage,#erisRoomSurface .eris-room-chat { width:min(900px,100%); left:50%; right:auto; transform:translateX(-50%); }
    }
  `;
  document.head.appendChild(style);

  function arrange(surface) {
    const box = surface.querySelector('#erisLiveSeats');
    if (!box) return;
    const seats = [...box.querySelectorAll('.eris-seat')];
    const count = Number(box.dataset.seatCount || seats.length || 8);
    if (count !== 8) return;
    const slots = [[17,24],[39,18],[61,18],[83,24],[17,70],[39,76],[61,76],[83,70]];
    seats.forEach((el,i) => {
      if (slots[i]) { el.style.left=slots[i][0]+'%'; el.style.top=slots[i][1]+'%'; }
    });
  }

  function decorate(surface) {
    if (!surface || surface.dataset.referenceUi === '1') return;
    surface.dataset.referenceUi = '1';
    const rank=document.createElement('div');
    rank.className='eris-room-rank';
    rank.style.cssText='position:absolute;top:76px;left:50%;transform:translateX(-50%);z-index:18;padding:6px 11px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(12,7,20,.55);backdrop-filter:blur(12px);font-size:8px;white-space:nowrap';
    rank.innerHTML='<b>🏆 Oda sıralaması</b><span style="margin-left:7px;color:#c7bdca">Bugünün canlı odaları</span>';
    surface.appendChild(rank);
    const watcher=new MutationObserver(()=>arrange(surface));
    watcher.observe(surface.querySelector('#erisLiveSeats')||surface,{childList:true,subtree:true,attributes:true});
    arrange(surface);
  }

  const boot=()=>decorate(document.getElementById('erisRoomSurface'));
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  const observer=new MutationObserver(()=>{ const s=document.getElementById('erisRoomSurface'); if(s) decorate(s); });
  observer.observe(document.body,{childList:true,subtree:true});
})();