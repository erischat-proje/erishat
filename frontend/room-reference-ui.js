(() => {
  const style = document.createElement('style');
  style.id = 'eris-room-reference-ui';
  style.textContent = `
    /* Reference-room skin: transparent UI over the existing wallpaper. */
    #erisRoomSurface {
      background:transparent !important;
      --room-accent:var(--pink,#ff4fa3);
      --room-secondary:var(--violet,#8a5cff);
      --room-gold:var(--gold,#e4b85d);
    }
    #erisRoomSurface .eris-room-wall {
      background-position:center !important;
      background-size:cover !important;
      filter:saturate(1.08) contrast(1.02);
    }
    #erisRoomSurface .eris-room-wall:after {
      content:""; position:absolute; inset:0; pointer-events:none;
      background:linear-gradient(180deg,rgba(18,9,36,.10) 0%,rgba(22,10,43,.02) 42%,rgba(8,5,18,.62) 100%);
    }

    /* Header matches the reference: back, title/id, plus, people, menu. */
    #erisRoomSurface .eris-room-top {
      height:82px; min-height:82px; padding:10px 11px;
      background:linear-gradient(180deg,rgba(10,6,24,.72),rgba(10,6,24,.08));
      border:0; backdrop-filter:blur(5px); z-index:30;
    }
    #erisRoomSurface .eris-room-top:after { display:none; }
    #erisRoomSurface .eris-room-top button {
      width:38px;height:38px;border:0;border-radius:12px;
      background:rgba(255,255,255,.12);box-shadow:none;
      font-size:17px;
    }
    #erisRoomSurface .eris-room-top .room-action.back {
      width:34px;background:transparent;font-size:29px;
    }
    #erisRoomSurface .eris-room-title { padding:0 4px; }
    #erisRoomSurface .eris-room-title b { font-size:15px;line-height:18px; }
    #erisRoomSurface .eris-room-title small { font-size:8px;margin-top:2px;opacity:.72; }

    /* Make the stage feel like a social-room seating area, not an orbit diagram. */
    #erisRoomSurface .eris-room-stage {
      top:92px; bottom:224px; min-height:0;
      overflow:visible;
    }
    #erisRoomSurface .eris-room-core {
      width:116px;height:116px; top:49%;
      border:0;background:rgba(30,12,53,.16);
      box-shadow:0 0 70px rgba(132,73,255,.18);
    }
    #erisRoomSurface .eris-room-core b { font-size:9px;opacity:.62; }
    #erisRoomSurface .eris-room-core small { font-size:7px;opacity:.55; }

    #erisRoomSurface .eris-seat {
      width:96px;height:96px;border:0 !important;border-radius:50%;
      background:transparent !important;box-shadow:none !important;
      backdrop-filter:none;padding:0;z-index:10;overflow:visible;
    }
    #erisRoomSurface .eris-seat > .seat-pod {
      position:relative;width:100%;height:100%;
      display:flex;flex-direction:column;align-items:center;
    }
    #erisRoomSurface .eris-seat > .seat-pod:before {
      content:"";position:absolute;left:7%;right:7%;top:12%;bottom:9%;
      border-radius:48% 48% 43% 43%;
      background:
        radial-gradient(circle at 50% 28%,rgba(255,255,255,.12),transparent 25%),
        linear-gradient(145deg,rgba(112,72,180,.78),rgba(16,8,31,.92) 58%,rgba(4,3,14,.96));
      border:1px solid rgba(173,132,255,.48);
      box-shadow:inset 0 0 22px rgba(255,255,255,.08),0 12px 24px rgba(0,0,0,.48);
      z-index:-1;
    }
    #erisRoomSurface .eris-seat > .seat-pod:after {
      content:"";position:absolute;left:12%;right:12%;bottom:4%;height:23%;
      border-radius:50%;background:radial-gradient(ellipse,rgba(110,70,220,.42),transparent 72%);
      filter:blur(3px);z-index:-1;
    }
    #erisRoomSurface .eris-seat .seat-ava {
      position:relative;width:60px;height:60px;margin-top:5px;border-radius:50%;
      border:3px solid rgba(255,255,255,.82);
      background:linear-gradient(145deg,#7e56df,#e85b9c);
      box-shadow:0 5px 17px rgba(0,0,0,.55),0 0 18px rgba(138,92,255,.22);
      font-size:18px;z-index:2;
    }
    #erisRoomSurface .eris-seat .seat-frame {
      position:absolute;top:2px;width:66px;height:66px;border-radius:50%;
      background:center/cover no-repeat;pointer-events:none;z-index:3;
    }
    #erisRoomSurface .eris-seat .seat-mic {
      position:absolute;right:14px;top:49px;width:22px;height:22px;
      display:grid;place-items:center;border-radius:50%;
      background:rgba(9,6,20,.88);border:1px solid rgba(255,255,255,.28);
      font-size:11px;z-index:4;
    }
    #erisRoomSurface .eris-seat b {
      margin-top:5px;padding:3px 7px;border-radius:8px;
      background:rgba(9,5,19,.48);font-size:8px;
      text-shadow:0 1px 3px #000;max-width:76px;
    }
    #erisRoomSurface .eris-seat small {
      margin-top:1px;padding:2px 6px;border-radius:7px;
      background:rgba(9,5,19,.38);font-size:7px;
    }
    #erisRoomSurface .eris-seat.empty .seat-ava {
      width:54px;height:54px;border:2px dashed rgba(255,255,255,.64);
      background:rgba(20,10,37,.36);font-size:23px;color:#fff;
    }
    #erisRoomSurface .eris-seat.empty > .seat-pod:before {
      background:linear-gradient(145deg,rgba(72,46,120,.50),rgba(10,6,22,.78));
      border-color:rgba(255,255,255,.25);
    }
    #erisRoomSurface .eris-seat.locked > .seat-pod:before { opacity:.45; }
    #erisRoomSurface .eris-seat.empty b {
      background:rgba(10,5,20,.42);font-size:8px;
    }
    #erisRoomSurface .eris-seat.me .seat-ava {
      border-color:var(--room-accent);
      box-shadow:0 0 0 4px color-mix(in srgb,var(--room-accent) 20%,transparent),0 6px 20px #0008;
    }

    /* Eight-seat reference layout: two upper, two inner upper, two inner lower, two lower. */
    #erisRoomSurface #erisLiveSeats[data-seat-count="8"] .eris-seat:nth-of-type(2) { }
    
    /* Ranking strip sits between header and seats. */
    #erisRoomSurface .eris-room-rank {
      top:78px !important; left:50% !important; z-index:25 !important;
      min-width:190px;padding:6px 12px !important;
      border:1px solid rgba(255,255,255,.16) !important;
      border-radius:13px !important;
      background:rgba(35,15,57,.46) !important;
      backdrop-filter:blur(12px) !important;
      box-shadow:0 7px 18px rgba(0,0,0,.18);
      font-size:8px !important;
    }

    /* Chat is a translucent bottom sheet with floating bubbles, as in the reference. */
    #erisRoomSurface .eris-room-chat {
      height:224px;left:0;right:0;bottom:0;
      background:linear-gradient(180deg,transparent 0%,rgba(11,5,23,.18) 12%,rgba(10,5,21,.78) 45%,rgba(7,4,15,.96) 100%);
      backdrop-filter:blur(7px);z-index:20;
    }
    #erisRoomSurface .eris-chat-list {
      padding:20px 12px 6px;gap:5px;
      max-width:620px;width:100%;margin:0 auto;
    }
    #erisRoomSurface .eris-chat-msg {
      width:max-content;max-width:82%;padding:7px 10px;
      border:1px solid rgba(255,255,255,.10);
      border-radius:12px 12px 12px 4px;
      background:rgba(24,11,39,.56);
      box-shadow:0 4px 12px rgba(0,0,0,.16);
      font-size:9px;
    }
    #erisRoomSurface .eris-chat-msg.me {
      margin-left:auto;border-radius:12px 12px 4px 12px;
      background:linear-gradient(135deg,rgba(103,65,210,.80),rgba(221,66,139,.80));
    }
    #erisRoomSurface .eris-chat-msg b { font-size:8px;color:#f2dff0; }
    #erisRoomSurface .eris-chat-msg span { margin-top:2px; }

    /* Bottom composer: microphone + pill input + gift/menu controls. */
    #erisRoomSurface .eris-room-compose {
      width:100%;max-width:620px;margin:0 auto;
      padding:7px 10px 12px;gap:6px;
      align-items:center;
    }
    #erisRoomSurface .eris-room-compose:before {
      content:"🎙️";display:grid;place-items:center;
      width:38px;height:38px;border-radius:50%;
      background:rgba(255,255,255,.10);font-size:16px;flex:none;
    }
    #erisRoomSurface .eris-room-compose input {
      height:40px;padding:0 15px;border:1px solid rgba(255,255,255,.12);
      border-radius:20px;background:rgba(13,7,25,.66);
      font-size:10px;
    }
    #erisRoomSurface .eris-room-compose button {
      width:40px;height:40px;padding:0;border-radius:50%;
      font-size:0;background:rgba(255,255,255,.10);
      box-shadow:none;position:relative;flex:none;
    }
    #erisRoomSurface .eris-room-compose button:after { content:"➤";font-size:14px; }

    #erisRoomSurface .eris-room-tools {
      right:11px;bottom:230px;z-index:24;gap:6px;
    }
    #erisRoomSurface .eris-room-tools button {
      width:38px;height:38px;border:0;border-radius:12px;
      background:rgba(255,255,255,.11);box-shadow:none;
    }
    #erisRoomSurface .eris-room-tools #erisRoomMic { font-size:0; }
    #erisRoomSurface .eris-room-tools #erisRoomMic:after { content:"🎙️";font-size:15px; }

    #erisRoomSurface #erisLiveSeats[data-seat-count="12"] .eris-seat { width:78px;height:78px; }
    #erisRoomSurface #erisLiveSeats[data-seat-count="16"] .eris-seat { width:68px;height:68px; }
    #erisRoomSurface #erisLiveSeats[data-seat-count="12"] .seat-ava { width:50px;height:50px; }
    #erisRoomSurface #erisLiveSeats[data-seat-count="16"] .seat-ava { width:44px;height:44px; }
    #erisRoomSurface #erisLiveSeats[data-seat-count="12"] .seat-frame { width:56px;height:56px; }
    #erisRoomSurface #erisLiveSeats[data-seat-count="16"] .seat-frame { width:50px;height:50px; }
    #erisRoomSurface #erisLiveSeats[data-seat-count="12"] .seat-mic { right:10px;top:40px; }
    #erisRoomSurface #erisLiveSeats[data-seat-count="16"] .seat-mic { right:8px;top:34px; }

    @media(max-width:520px){
      #erisRoomSurface .eris-room-top { height:80px;min-height:80px; }
      #erisRoomSurface .eris-room-stage { top:88px;bottom:224px; }
      #erisRoomSurface .eris-seat { width:80px;height:80px; }
      #erisRoomSurface .eris-seat .seat-ava { width:52px;height:52px; }
      #erisRoomSurface .eris-seat .seat-frame { width:58px;height:58px; }
      #erisRoomSurface .eris-seat .seat-mic { right:10px;top:43px;width:20px;height:20px;font-size:10px; }
      #erisRoomSurface .eris-seat.empty .seat-ava { width:48px;height:48px; }
      #erisRoomSurface #erisLiveSeats[data-seat-count="12"] .eris-seat { width:64px;height:64px; }
      #erisRoomSurface #erisLiveSeats[data-seat-count="16"] .eris-seat { width:56px;height:56px; }
      #erisRoomSurface #erisLiveSeats[data-seat-count="12"] .seat-ava { width:43px;height:43px; }
      #erisRoomSurface #erisLiveSeats[data-seat-count="16"] .seat-ava { width:38px;height:38px; }
      #erisRoomSurface #erisLiveSeats[data-seat-count="12"] .seat-frame { width:48px;height:48px; }
      #erisRoomSurface #erisLiveSeats[data-seat-count="16"] .seat-frame { width:44px;height:44px; }
      #erisRoomSurface .eris-room-chat { height:224px; }
      #erisRoomSurface .eris-room-tools { bottom:229px; }
    }
    @media(min-width:760px){
      #erisRoomSurface .eris-room-stage,
      #erisRoomSurface .eris-room-chat { width:min(760px,100%);left:50%;right:auto;transform:translateX(-50%); }
    }
  `;
  document.head.appendChild(style);

  function seatSlots(count) {
    if (count === 8) return [
      [17,25],[39,18],[61,18],[83,25],
      [17,71],[39,80],[61,80],[83,71]
    ];
    const slots=[];
    const centerY=50;
    const radiusX=count===12?40:43;
    const radiusY=count===12?42:44;
    for(let i=0;i<count;i++){
      const angle=(-90+(360/count)*i)*Math.PI/180;
      slots.push([
        50+Math.cos(angle)*radiusX,
        centerY+Math.sin(angle)*radiusY
      ]);
    }
    return slots;
  }

  function arrange(surface) {
    const box=surface.querySelector('#erisLiveSeats');
    if(!box)return;
    const seats=[...box.querySelectorAll('.eris-seat')];
    const count=Number(box.dataset.seatCount||seats.length||8);
    const slots=seatSlots(count);
    seats.forEach((el,i)=>{
      const slot=slots[i];
      if(!slot)return;
      el.style.left=slot[0].toFixed(2)+'%';
      el.style.top=slot[1].toFixed(2)+'%';
    });
  }
  function decorate(surface) {
    if (!surface || surface.dataset.referenceUi === '1') return;
    surface.dataset.referenceUi='1';

    const rank=document.createElement('div');
    rank.className='eris-room-rank';
    rank.innerHTML='<b>🏆 Oda sıralaması</b><span style="margin-left:7px;color:#d9cde0">Bugünün canlı odaları</span>';
    surface.appendChild(rank);

    const seats=surface.querySelector('#erisLiveSeats');
    const watcher=new MutationObserver(()=>arrange(surface));
    watcher.observe(seats||surface,{childList:true,subtree:true,attributes:true});
    arrange(surface);
  }

  const boot=()=>decorate(document.getElementById('erisRoomSurface'));
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  const observer=new MutationObserver(()=>{
    const s=document.getElementById('erisRoomSurface');
    if(s) decorate(s);
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();