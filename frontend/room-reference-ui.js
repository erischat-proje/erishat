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
    /* One room skin only: the reference controls live on the side rails. */
    #erisRoomSurface .eris-room-top #erisRoomGift,
    #erisRoomSurface .eris-room-top #erisRoomMusic,
    #erisRoomSurface .eris-room-tools { display:none !important; }
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

/* ErisChat complete room layer v2: social room navigation and controls. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const rid = () => String(window.ErisCurrentRoomId || window.currentRoomId || '');
  const uid = () => String(window.ErisCurrentUserId || localStorage.getItem('eris_user_id') || '');
  const roomApi = () => window.ErisRoom || {};
  const state = {room:null};

  function css(){
    if(document.getElementById('eris-room-complete-v2')) return;
    const s=document.createElement('style'); s.id='eris-room-complete-v2';
    s.textContent=[
      '#erisRoomSurface .erc-side-rail{position:absolute;left:0;right:0;bottom:230px;height:140px;z-index:27;pointer-events:none}',
      '#erisRoomSurface .erc-side-rail button{position:absolute;width:40px;height:40px;border-radius:13px;border:1px solid #ffffff12;background:#0c0618a0;color:#fff;backdrop-filter:blur(10px);box-shadow:0 7px 20px #0004;cursor:pointer;font-size:16px;pointer-events:auto}
      #erisRoomSurface .erc-side-rail button:nth-child(1){left:10px;bottom:48px}
      #erisRoomSurface .erc-side-rail button:nth-child(2){left:10px;bottom:0}
      #erisRoomSurface .erc-side-rail button:nth-child(3){right:10px;bottom:96px}
      #erisRoomSurface .erc-side-rail button:nth-child(4){right:10px;bottom:48px}
      #erisRoomSurface .erc-side-rail button:nth-child(5){right:10px;bottom:0}',
      '#erisRoomSurface .erc-room-panel{position:absolute;right:10px;top:88px;bottom:234px;width:min(360px,calc(100% - 20px));z-index:60;display:none;flex-direction:column;border:1px solid #ffffff14;border-radius:18px;background:#090512e8;backdrop-filter:blur(22px);box-shadow:0 18px 50px #0008;overflow:hidden}',
      '#erisRoomSurface .erc-room-panel.show{display:flex}',
      '#erisRoomSurface .erc-panel-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid #ffffff0d}',
      '#erisRoomSurface .erc-panel-head strong{font-size:12px;flex:1}',
      '#erisRoomSurface .erc-panel-close{width:30px;height:30px;border:0;border-radius:10px;background:#ffffff12;color:#fff}',
      '#erisRoomSurface .erc-tabs{display:flex;gap:5px;padding:8px;border-bottom:1px solid #ffffff0a;overflow:auto}',
      '#erisRoomSurface .erc-tab{white-space:nowrap;border:1px solid #ffffff0b;background:#ffffff08;color:#bfb5c8;border-radius:10px;padding:7px 9px;font-size:8px}',
      '#erisRoomSurface .erc-tab.active{background:linear-gradient(135deg,#754cff55,#ff4fa344);color:#fff;border-color:#ffffff1c}',
      '#erisRoomSurface .erc-panel-body{padding:10px;overflow:auto;flex:1}',
      '#erisRoomSurface .erc-card{border:1px solid #ffffff0b;background:#ffffff07;border-radius:13px;padding:10px;margin-bottom:7px}',
      '#erisRoomSurface .erc-card b{font-size:10px}.erc-card small{display:block;color:#9f95a8;font-size:8px;margin-top:4px;line-height:1.4}',
      '#erisRoomSurface .erc-statgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
      '#erisRoomSurface .erc-stat{padding:9px;border-radius:11px;background:#ffffff07;text-align:center}',
      '#erisRoomSurface .erc-stat b{display:block;font-size:12px}.erc-stat span{font-size:7px;color:#948a9e}',
      '#erisRoomSurface .erc-progress{height:6px;border-radius:99px;background:#ffffff0a;overflow:hidden;margin-top:8px}.erc-progress i{display:block;height:100%;background:linear-gradient(90deg,#754cff,#ff4fa3)}',
      '#erisRoomSurface .erc-row{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ffffff08;border-radius:11px;background:#ffffff05;margin-bottom:6px}',
      '#erisRoomSurface .erc-row .grow{flex:1;min-width:0}.erc-row b{font-size:9px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.erc-row small{color:#918899;font-size:7px}',
      '#erisRoomSurface .erc-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#754cff,#ff4fa3);background-size:cover;background-position:center;flex:none}',
      '#erisRoomSurface .erc-btn{border:1px solid #ffffff12;background:#ffffff0b;color:#fff;border-radius:10px;padding:7px 9px;font-size:8px;cursor:pointer}.erc-btn.primary{background:linear-gradient(135deg,#754cff,#ff4fa3);border:0}.erc-btn.danger{background:#ff4f6d22;border-color:#ff4f6d44}',
      '#erisRoomSurface .erc-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '#erisRoomSurface .erc-gift{min-height:76px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px}.erc-gift .emoji{font-size:22px}.erc-gift b{font-size:8px}.erc-gift small{margin:0}',
      '#erisRoomSurface .erc-seat-card{position:absolute;z-index:75;width:190px;display:none;padding:9px;border-radius:14px;background:#090512f5;border:1px solid #ffffff18;box-shadow:0 16px 40px #0008}.erc-seat-card.show{display:block}',
      '#erisRoomSurface .erc-seat-card-head{display:flex;align-items:center;gap:8px}.erc-seat-card-head .erc-avatar{width:38px;height:38px}',
      '#erisRoomSurface .erc-seat-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}',
      '#erisRoomSurface .erc-notice{padding:8px 9px;border-radius:10px;background:#ffffff06;color:#aaa0ad;font-size:8px;line-height:1.45}',
      '#erisRoomSurface .erc-chat-tabs{display:flex;gap:5px;padding:6px 10px 0;max-width:620px;width:100%;margin:0 auto;box-sizing:border-box;z-index:2}.erc-chat-tabs button{border:1px solid #ffffff0b;background:#ffffff08;color:#aaa0ad;border-radius:9px;padding:6px 9px;font-size:8px}.erc-chat-tabs button.active{color:#fff;background:#ffffff14}'+'@media(max-width:520px){#erisRoomSurface .erc-room-panel{left:8px;right:8px;top:82px;bottom:228px;width:auto}#erisRoomSurface .erc-side-rail{left:0;right:0;bottom:228px}#erisRoomSurface .erc-side-rail button{width:36px;height:36px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function panel(surface){
    let p=surface.querySelector('.erc-room-panel');
    if(p) return p;
    p=document.createElement('aside'); p.className='erc-room-panel';
    p.innerHTML='<div class="erc-panel-head"><strong id="ercPanelTitle">Oda Bilgisi</strong><button class="erc-panel-close">×</button></div>'+
      '<div class="erc-tabs">'+
      '<button class="erc-tab active" data-tab="info">Oda</button><button class="erc-tab" data-tab="users">Kullanıcılar</button>'+
      '<button class="erc-tab" data-tab="gifts">Hediyeler</button><button class="erc-tab" data-tab="music">Müzik</button><button class="erc-tab" data-tab="controls">Ayarlar</button></div>'+
      '<div class="erc-panel-body" id="ercPanelBody"></div>';
    surface.appendChild(p);
    p.querySelector('.erc-panel-close').onclick=()=>p.classList.remove('show');
    p.querySelectorAll('.erc-tab').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
    return p;
  }

  function rail(surface){
    if(surface.querySelector('.erc-side-rail')) return;
    const r=document.createElement('div'); r.className='erc-side-rail';
    r.innerHTML='<button title="Hediyeler" data-tab="gifts">🎁</button><button title="Müzik" data-tab="music">🎵</button>'+
      '<button title="Oda bilgisi" data-tab="info">ℹ️</button><button title="Ayarlar" data-tab="controls">⚙️</button><button title="Ayrıl" data-leave="1">🚪</button>';
    r.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
    r.querySelector('[data-extra]').onclick=()=>extra('announcement'); r.querySelector('[data-leave]').onclick=()=>window.closeRealRoom?.();
    surface.appendChild(r);
  }

  function capacity(level){const n=Number(level||1);return n>=7?16:n>=5?12:8}
  async function room(){
    const id=rid();
    if(!id || id.indexOf('demo-room-')===0){
      state.room=state.room||{id:id,name:document.getElementById('erisLiveTitle')?.textContent||'Demo Oda',level:1,capacity:8,member_count:1,seats:[]};
      return state.room;
    }
    try{state.room=await roomApi().get(id)}catch(e){console.warn('[ErisChat room panel]',e.message)}
    return state.room;
  }

  function info(r){
    const level=Number(r?.level||1), cap=Number(r?.capacity||r?.seat_count||capacity(level));
    const members=Number(r?.member_count||r?.members_count||0), spent=Number(r?.spent_lidya||r?.total_spent||0);
    const range=level>=7?'7–8':level>=5?'5–6':'1–4';
    const next=level>=8?0:(level<4?1000:level<6?5000:15000);
    const pct=next?Math.min(100,spent/next*100):100;
    return '<div class="erc-card"><b>🏠 '+esc(r?.name||'Oda')+'</b><small>Oda ID: '+esc(r?.id||rid())+' • '+(r?.locked?'🔒 Kilitli':'🟢 Açık')+' • '+(r?.chat_enabled===false?'💬 Kapalı':'💬 Açık')+'</small></div>'+
      '<div class="erc-statgrid"><div class="erc-stat"><b>Lv.'+level+'</b><span>SEVİYE</span></div><div class="erc-stat"><b>'+members+'/'+cap+'</b><span>KİŞİ/KOLTUK</span></div><div class="erc-stat"><b>'+spent.toLocaleString('tr-TR')+'</b><span>LİDYA</span></div></div>'+
      '<div class="erc-card" style="margin-top:7px"><b>Seviye '+level+' • '+cap+' koltuk</b><small>Bu seviye aralığı: '+range+'. Kapasite otomatik olarak 8 → 12 → 16 olur.</small><div class="erc-progress"><i style="width:'+pct+'%"></i></div><small>'+(next?'Sonraki eşik: '+next.toLocaleString('tr-TR')+' Lidya':'Maksimum oda seviyesi')+'</small></div>'+
      '<div class="erc-notice">Duvar kâğıdı oda yüzeyinin temelidir. Tema, avatar ve çerçeve değişimleri koltuk yerleşimini bozmadan uygulanır.</div>';
  }

  function users(body,r){
    const seats=Array.isArray(r?.seats)?r.seats:[];
    const rows=seats.filter(s=>s.user_id);
    body.innerHTML='<div class="erc-notice">'+rows.length+' konuşmacı • '+(seats.length||capacity(r?.level))+' koltuk</div>';
    if(!rows.length){body.innerHTML+='<div class="erc-notice" style="margin-top:7px">Koltuklarda şu an kullanıcı yok.</div>';return}
    rows.forEach(s=>{
      const u=s.user||s.profile||{}, name=s.nickname||s.user_name||u.nickname||u.display_name||'Kullanıcı';
      const av=s.avatar_url||s.avatar||u.avatar_url||u.avatar||'', img=av&&window.ErisChatCosmetics?.assetUrl?window.ErisChatCosmetics.assetUrl(av):av;
      const el=document.createElement('div');el.className='erc-row';
      el.innerHTML='<div class="erc-avatar"></div><div class="grow"><b>'+esc(name)+'</b><small>Koltuk '+Number(s.seat_number||0)+' • '+(s.muted?'🔇 Susturuldu':'🎙️ Açık')+'</small></div><button class="erc-btn">Profil</button>';
      if(img)el.querySelector('.erc-avatar').style.backgroundImage='url("'+String(img).replace(/"/g,'%22')+'")';
      el.querySelector('button').onclick=()=>extra('profile'); body.appendChild(el);
    });
  }

  async function gifts(body,r){
    const id=r?.id||rid(); let data=null,board=null;
    try{data=await roomApi().giftCatalog?.(id);board=await roomApi().leaderboard?.(id)}catch(e){}
    const gifts=Array.isArray(data)?data:(data?.items||data?.gifts||data?.data||[]);
    const rows=Array.isArray(board)?board:(board?.items||board?.leaderboard||[]);
    body.innerHTML='<div class="erc-notice">Odadaki kullanıcıya hediye gönder. Cüzdan ve yetki kontrolü backend tarafındadır.</div><div class="erc-grid" id="ercGiftGrid"></div><div class="erc-card" style="margin-top:8px"><b>🏆 Hediye liderliği</b><div id="ercGiftBoard" style="margin-top:6px"></div></div>';
    const grid=body.querySelector('#ercGiftGrid');
    if(!gifts.length)grid.innerHTML='<div class="erc-notice" style="grid-column:1/-1">Hediye kataloğu boş veya bağlantı bekliyor.</div>';
    gifts.slice(0,24).forEach((g,i)=>{
      const key=g.key||g.gift_key||g.asset_key||g.id, name=g.name||g.title||key||('Hediye '+(i+1)), price=Number(g.price||g.cost||g.value||0);
      const b=document.createElement('button');b.className='erc-card erc-gift';b.innerHTML='<span class="emoji">'+esc(g.emoji||g.icon||'🎁')+'</span><b>'+esc(name)+'</b><small>'+(price?price.toLocaleString('tr-TR')+' Lidya':'Gönder')+'</small>';
      b.onclick=async()=>{const target=(Array.isArray(r?.seats)?r.seats:[]).find(s=>s.user_id&&String(s.user_id)!==uid())?.user_id;if(!target)return window.toast?.('Hediye için odada başka bir kullanıcı gerekli.');try{await roomApi().sendGift(id,target,key,1);window.toast?.('Hediye gönderildi ✓')}catch(e){window.toast?.(e.message||'Hediye gönderilemedi.')}};
      grid.appendChild(b);
    });
    const out=body.querySelector('#ercGiftBoard');
    out.innerHTML=rows.length?rows.slice(0,10).map((x,i)=>'<div class="erc-row"><div class="grow"><b>#'+(i+1)+' '+esc(x.nickname||x.user_name||x.name||x.user_id||'Kullanıcı')+'</b><small>'+Number(x.total||x.amount||x.value||0).toLocaleString('tr-TR')+' Lidya</small></div></div>').join(''):'<div class="erc-notice">Henüz hediye hareketi yok.</div>';
  }

  async function music(body,r){
    const id=r?.id||rid(); let raw=[];
    try{raw=await roomApi().music?.(id)||[]}catch(e){}
    const rows=Array.isArray(raw)?raw:(raw?.items||raw?.music||raw?.data||[]);
    body.innerHTML='<div class="erc-notice">Ortak müzik kuyruğu. Oynatma yetkisi backend tarafından korunur.</div><div id="ercMusicList"></div>'+
      '<div class="erc-card"><b>Kuyruğa ekle</b><input id="ercMusicTitle" placeholder="Şarkı adı" style="display:block;width:100%;box-sizing:border-box;margin-top:7px;background:#ffffff08;border:1px solid #ffffff12;border-radius:9px;padding:8px;color:#fff">'+
      '<input id="ercMusicUrl" placeholder="Ses kaynağı URL" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;background:#ffffff08;border:1px solid #ffffff12;border-radius:9px;padding:8px;color:#fff"><button class="erc-btn primary" id="ercMusicAdd" style="margin-top:7px">＋ Ekle</button></div>';
    const list=body.querySelector('#ercMusicList');
    list.innerHTML=rows.length?rows.map(x=>'<div class="erc-row"><div class="grow"><b>'+esc(x.title||'Müzik')+'</b><small>'+(x.is_playing?'▶ Oynuyor':'⏸ Bekliyor')+' • '+Math.floor(Number(x.position_seconds||0))+' sn</small></div><button class="erc-btn" data-play="'+esc(x.id)+'">'+(x.is_playing?'⏸':'▶')+'</button></div>').join(''):'<div class="erc-notice" style="margin-bottom:7px">Kuyruk boş.</div>';
    body.querySelector('#ercMusicAdd').onclick=async()=>{const t=body.querySelector('#ercMusicTitle').value.trim(),u=body.querySelector('#ercMusicUrl').value.trim();if(!t||!u)return window.toast?.('Şarkı adı ve URL gerekli.');try{await roomApi().addMusic(id,t,u);window.toast?.('Müzik kuyruğa eklendi ✓');openTab('music')}catch(e){window.toast?.(e.message||'Müzik eklenemedi.')}};
    body.querySelectorAll('[data-play]').forEach(b=>b.onclick=async()=>{try{await roomApi().musicPlayback?.(id,b.dataset.play,'toggle');openTab('music')}catch(e){window.toast?.(e.message||'Oynatma yetkisi yok.')}});
  }

  async function controls(body,r){
    const owner=String(r?.owner_id||r?.owner?.id||'')===uid();
    body.innerHTML='<div class="erc-card"><b>🎛️ Oda durumu</b><small>'+(r?.locked?'🔒 Kilitli':'🟢 Açık')+' • '+(r?.chat_enabled===false?'💬 Sohbet kapalı':'💬 Sohbet açık')+'</small></div>'+
      '<div class="erc-grid"><button class="erc-btn" id="ercLock">'+(r?.locked?'🔓 Kilidi aç':'🔒 Odayı kilitle')+'</button><button class="erc-btn" id="ercChat">'+(r?.chat_enabled===false?'💬 Sohbeti aç':'🔕 Sohbeti kapat')+'</button></div>'+
      '<div class="erc-card" style="margin-top:7px"><b>🛡️ Moderasyon</b><small>Ban, moderatör, koltuk kilidi ve mute işlemleri yetkiyle çalışır.</small><div class="erc-grid" style="margin-top:7px"><button class="erc-btn" id="ercSafety">Güvenlik</button><button class="erc-btn" id="ercAnnouncement">📢 Duyuru</button></div></div>'+
      (owner?'<div class="erc-card"><b>👑 Oda sahibi</b><small>Gelişmiş oda ayarları yalnızca sahip için gösterilir.</small><button class="erc-btn primary" id="ercOwner" style="margin-top:7px">Oda ayarlarını aç</button></div>':'<div class="erc-notice">Sahip kontrolleri yalnızca oda sahibinde görünür.</div>');
    body.querySelector('#ercLock').onclick=async()=>{try{if(r?.locked)await roomApi().unlock(r.id);else await roomApi().lock(r.id);window.toast?.('Oda durumu güncellendi ✓');openTab('controls')}catch(e){window.toast?.(e.message||'Oda durumu değiştirilemedi.')}};
    body.querySelector('#ercChat').onclick=async()=>{try{await roomApi().setChat(r.id,r?.chat_enabled===false);window.toast?.('Sohbet ayarı güncellendi ✓');openTab('controls')}catch(e){window.toast?.(e.message||'Sohbet ayarı değiştirilemedi.')}};
    body.querySelector('#ercSafety').onclick=()=>extra('safety');
    body.querySelector('#ercAnnouncement').onclick=()=>extra('announcement');
    body.querySelector('#ercOwner')?.addEventListener('click',()=>extra('roomSettings'));
  }

  async function openTab(tab){
    const surface=document.getElementById('erisRoomSurface'); if(!surface)return;
    css(); const p=panel(surface); rail(surface); p.classList.add('show');
    p.querySelectorAll('.erc-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
    p.querySelector('#ercPanelTitle').textContent=({info:'Oda Bilgisi',users:'Kullanıcılar',gifts:'Hediyeler',music:'Müzik',controls:'Oda Ayarları'})[tab]||'Oda';
    const body=p.querySelector('#ercPanelBody'); body.innerHTML='<div class="erc-notice">Yükleniyor…</div>';
    const r=await room();
    if(tab==='info')body.innerHTML=info(r);
    else if(tab==='users')users(body,r);
    else if(tab==='gifts')await gifts(body,r);
    else if(tab==='music')await music(body,r);
    else if(tab==='controls')await controls(body,r);
  }

  function extra(key){
    const fn=window.ErisDemoExtras?.[key];
    if(typeof fn==='function'){fn();return}
    if(key==='music')openTab('music'); else window.toast?.('Bu panel henüz bağlanmadı.');
  }

  function bind(surface){
    if(surface.dataset.ercComplete==='1')return;
    surface.dataset.ercComplete='1'; css(); panel(surface); rail(surface);
    surface.querySelector('#erisRoomMore').onclick=()=>openTab('controls');
    surface.querySelector('#erisRoomGift').onclick=()=>openTab('gifts');
    surface.querySelector('#erisRoomMusic').onclick=()=>openTab('music');
    const card=document.createElement('div');card.className='erc-seat-card';surface.appendChild(card);
    const chat=surface.querySelector('.eris-room-chat');
    if(chat && !chat.querySelector('.erc-chat-tabs')){
      const tabs=document.createElement('div'); tabs.className='erc-chat-tabs';
      tabs.innerHTML='<button class="active" data-chat="chat">Oda Sohbeti</button><button data-chat="users">Kullanıcılar</button>';
      const list=chat.querySelector('.eris-chat-list');
      const people=document.createElement('div'); people.className='erc-inline-users'; people.style.cssText='display:none;flex:1;overflow:auto;padding:34px 12px 8px;max-width:620px;width:100%;margin:0 auto;';
      if(list)list.before(tabs);
      if(list)list.after(people);
      tabs.querySelectorAll('button').forEach(b=>b.onclick=async()=>{
        tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
        const usersMode=b.dataset.chat==='users';
        if(list)list.style.display=usersMode?'none':'flex';
        people.style.display=usersMode?'block':'none';
        if(usersMode){
          const r=await room();
          const seats=Array.isArray(r?.seats)?r.seats:[];
          people.innerHTML=seats.filter(x=>x.user_id).map(x=>'<div class="erc-row"><div class="grow"><b>'+esc(x.nickname||x.user_name||'Kullanıcı')+'</b><small>Koltuk '+Number(x.seat_number||0)+' • '+(x.muted?'🔇':'🎙️')+'</small></div></div>').join('')||'<div class="erc-notice">Kullanıcı yok.</div>';
        }
      });
    }
    surface.addEventListener('dblclick',e=>{
      const seat=e.target.closest('.eris-seat'); if(!seat)return;
      const name=seat.querySelector('b')?.textContent||'Kullanıcı',num=seat.dataset.seatNumber||'';
      card.innerHTML='<div class="erc-seat-card-head"><div class="erc-avatar"></div><div><b style="font-size:10px">'+esc(name)+'</b><small style="display:block;color:#988e9f;font-size:7px">Koltuk '+esc(num)+'</small></div></div>'+
        '<div class="erc-seat-actions"><button class="erc-btn" data-a="profile">Profil</button><button class="erc-btn" data-a="gift">🎁 Hediye</button><button class="erc-btn danger" data-a="report">🚩 Bildir</button></div>';
      card.style.left=Math.min(Math.max(8,e.clientX-95),window.innerWidth-205)+'px';
      card.style.top=Math.min(Math.max(84,e.clientY-70),window.innerHeight-150)+'px';
      card.classList.add('show');
      card.querySelector('[data-a="gift"]').onclick=()=>openTab('gifts');
      card.querySelector('[data-a="profile"]').onclick=()=>extra('profile');
      card.querySelector('[data-a="report"]').onclick=()=>extra('report');
    });
    surface.addEventListener('click',e=>{
      if(!e.target.closest('.erc-seat-card')&&!e.target.closest('.eris-seat')&&!e.target.closest('.erc-room-panel')&&!e.target.closest('.erc-side-rail'))card.classList.remove('show');
    });
  }

  window.ErisRoomComplete={openTab,refresh:room};
  const boot=()=>{const s=document.getElementById('erisRoomSurface');if(s)bind(s)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  new MutationObserver(boot).observe(document.body,{childList:true,subtree:true});
})();


/* ErisChat room layout v3 — clean in-room controls.
   Header: room name + id / level / more + leave.
   Footer: mic + chat composer + gift beside send.
   All room menus stay inside #erisRoomSurface. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const surface = () => document.getElementById('erisRoomSurface');
  const roomId = () => String(window.ErisCurrentRoomId || window.currentRoomId || '');
  const currentUser = () => String(window.ErisCurrentUserId || localStorage.getItem('eris_user_id') || '');
  const api = () => window.ErisRoom || {};

  function installCss(){
    if(document.getElementById('eris-room-v3-css')) return;
    const s=document.createElement('style');
    s.id='eris-room-v3-css';
    s.textContent=String.raw\`
      /* ---- single clean room chrome ---- */
      #erisRoomSurface .eris-room-top{
        height:76px!important;min-height:76px!important;padding:9px 10px!important;
        display:flex!important;align-items:center!important;gap:8px!important;
        background:linear-gradient(180deg,rgba(7,4,18,.78),rgba(7,4,18,.12))!important;
        border:0!important;z-index:80!important;
      }
      #erisRoomSurface .eris-room-top .room-action.back{
        width:38px!important;height:38px!important;font-size:27px!important;
        background:rgba(255,255,255,.08)!important;flex:none!important;
      }
      #erisRoomSurface .eris-room-title{
        flex:0 1 43%!important;min-width:0!important;cursor:pointer!important;
        padding:2px 3px!important;
      }
      #erisRoomSurface .eris-room-title b{
        font-size:14px!important;line-height:17px!important;font-weight:900!important;
      }
      #erisRoomSurface .eris-room-title small{
        font-size:8px!important;margin-top:2px!important;color:#bcb3c7!important;
      }
      #erisRoomSurface .eris-room-title .room-id{color:#8f879a!important}
      #erisRoomSurface .eris-room-top .room-action{
        width:38px!important;height:38px!important;border-radius:12px!important;
        border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.09)!important;
        box-shadow:none!important;flex:none!important;
      }
      #erisRoomSurface .eris-room-top #erisRoomGift,
      #erisRoomSurface .eris-room-top #erisRoomMusic{display:none!important}
      #erisRoomSurface #erisRoomLevel{
        position:absolute!important;left:50%!important;top:10px!important;
        transform:translateX(-50%)!important;width:auto!important;min-width:92px!important;
        height:38px!important;padding:0 12px!important;border-radius:13px!important;
        background:rgba(20,11,38,.72)!important;border:1px solid rgba(255,255,255,.14)!important;
        color:#fff!important;display:grid!important;place-items:center!important;
        line-height:1.05!important;box-shadow:0 8px 24px rgba(0,0,0,.22)!important;
      }
      #erisRoomSurface #erisRoomLevel b{font-size:10px!important;display:block!important}
      #erisRoomSurface #erisRoomLevel small{font-size:7px!important;color:#bdb2c7!important;display:block!important;margin-top:2px!important}
      #erisRoomSurface #erisRoomMoreTop{margin-left:auto!important}
      #erisRoomSurface #erisRoomLeaveTop{
        background:rgba(255,72,111,.13)!important;border-color:rgba(255,96,125,.25)!important;
      }

      /* Stage gets a little more room because the old rank/rail are gone. */
      #erisRoomSurface .eris-room-rank,
      #erisRoomSurface .erc-side-rail{display:none!important}
      #erisRoomSurface .eris-room-stage{
        top:82px!important;bottom:196px!important;
      }

      /* Bottom composer is the only home for the gift action. */
      #erisRoomSurface .eris-room-chat{
        height:196px!important;z-index:55!important;
      }
      #erisRoomSurface .eris-room-compose{
        display:flex!important;align-items:center!important;gap:6px!important;
        padding:7px 10px 11px!important;
        max-width:760px!important;margin:0 auto!important;
      }
      #erisRoomSurface .eris-room-compose input{
        height:40px!important;padding:0 14px!important;border-radius:20px!important;
        font-size:10px!important;
      }
      #erisRoomSurface .eris-room-compose .room-inline-action{
        width:40px!important;height:40px!important;padding:0!important;flex:none!important;
        display:grid!important;place-items:center!important;border-radius:50%!important;
        border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.09)!important;
        color:#fff!important;box-shadow:none!important;font-size:17px!important;
      }
      #erisRoomSurface .eris-room-compose #erisLiveSend{
        width:auto!important;min-width:66px!important;height:40px!important;
        padding:0 14px!important;border-radius:20px!important;font-size:10px!important;
        background:linear-gradient(135deg,#754cff,#ff4fa3)!important;
      }
      #erisRoomSurface .eris-room-tools{
        right:10px!important;bottom:202px!important;z-index:70!important;
        display:flex!important;gap:6px!important;
      }
      #erisRoomSurface .eris-room-tools button{
        width:40px!important;height:40px!important;border-radius:50%!important;
        background:rgba(10,6,22,.66)!important;border:1px solid rgba(255,255,255,.12)!important;
      }
      #erisRoomSurface .eris-room-tools #erisRoomMic{
        font-size:0!important;
      }
      #erisRoomSurface .eris-room-tools #erisRoomMic:after{content:"🎙️";font-size:16px!important}

      /* Every room menu is an overlay INSIDE the room surface. */
      #erisRoomSurface .erc-room-panel{
        left:50%!important;right:auto!important;top:82px!important;bottom:204px!important;
        transform:translateX(-50%)!important;width:min(420px,calc(100% - 20px))!important;
        z-index:120!important;border-radius:18px!important;
      }
      #erisRoomSurface .erc-room-panel.show{display:flex!important}
      #erisRoomSurface .erc-seat-card{z-index:130!important}

      /* Name and level overlays share the same in-room glass language. */
      #erisRoomSurface .erc-v3-overlay{
        position:absolute;left:50%;top:82px;bottom:204px;transform:translateX(-50%);
        width:min(420px,calc(100% - 20px));z-index:125;display:none;
        flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.14);
        border-radius:18px;background:rgba(8,4,18,.94);backdrop-filter:blur(24px);
        box-shadow:0 22px 70px rgba(0,0,0,.55);
      }
      #erisRoomSurface .erc-v3-overlay.show{display:flex}
      #erisRoomSurface .erc-v3-head{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)}
      #erisRoomSurface .erc-v3-head strong{font-size:12px;flex:1}
      #erisRoomSurface .erc-v3-close{width:30px;height:30px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff}
      #erisRoomSurface .erc-v3-body{padding:11px;overflow:auto;flex:1}
      #erisRoomSurface .erc-v3-input{
        width:100%;box-sizing:border-box;height:44px;padding:0 13px;border-radius:13px;
        border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;outline:none;
      }
      #erisRoomSurface .erc-v3-save{
        margin-top:8px;width:100%;height:42px;border:0;border-radius:13px;
        background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-weight:800;
      }
      #erisRoomSurface .erc-v3-note{font-size:8px;color:#a49aaa;line-height:1.45;margin-top:8px}
      #erisRoomSurface .erc-level-card{
        border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.045);
        border-radius:14px;padding:10px;margin-bottom:7px;
      }
      #erisRoomSurface .erc-level-card.current{border-color:rgba(255,79,163,.42);background:linear-gradient(135deg,rgba(117,76,255,.13),rgba(255,79,163,.08))}
      #erisRoomSurface .erc-level-line{display:flex;align-items:center;gap:8px}
      #erisRoomSurface .erc-level-num{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.08);font-weight:900;font-size:10px}
      #erisRoomSurface .erc-level-main{flex:1;min-width:0}
      #erisRoomSurface .erc-level-main b{display:block;font-size:10px}
      #erisRoomSurface .erc-level-main small{display:block;color:#a39aa9;font-size:7px;margin-top:3px}
      #erisRoomSurface .erc-level-reward{margin-top:7px;font-size:8px;color:#d7cedd}
      #erisRoomSurface .erc-level-progress{height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:7px}
      #erisRoomSurface .erc-level-progress i{display:block;height:100%;background:linear-gradient(90deg,#754cff,#ff4fa3)}
      @media(max-width:520px){
        #erisRoomSurface .eris-room-title{max-width:38%!important}
        #erisRoomSurface #erisRoomLevel{min-width:84px!important;padding:0 9px!important}
        #erisRoomSurface .eris-room-chat{height:196px!important}
        #erisRoomSurface .eris-room-tools{bottom:202px!important}
        #erisRoomSurface .erc-v3-overlay,#erisRoomSurface .erc-room-panel{top:80px!important;bottom:202px!important}
      }
    \`;
    document.head.appendChild(s);
  }

  function makeTopControls(s){
    const top=s.querySelector('.eris-room-top');
    if(!top) return;
    if(!top.querySelector('#erisRoomLevel')){
      const level=document.createElement('button');
      level.id='erisRoomLevel'; level.type='button'; level.innerHTML='<b>Seviye 1</b><small>ilerleme</small>';
      level.title='Oda seviyesi';
      level.onclick=()=>openLevel();
      top.appendChild(level);
    }
    if(!top.querySelector('#erisRoomMoreTop')){
      const more=document.createElement('button');
      more.id='erisRoomMoreTop'; more.type='button'; more.textContent='•••'; more.title='Oda menüsü';
      more.onclick=()=>window.ErisRoomComplete?.openTab?.('controls');
      top.appendChild(more);
    }
    if(!top.querySelector('#erisRoomLeaveTop')){
      const leave=document.createElement('button');
      leave.id='erisRoomLeaveTop'; leave.type='button'; leave.textContent='↪'; leave.title='Odadan çık';
      leave.onclick=()=>window.closeRealRoom?.();
      top.appendChild(leave);
    }
    const oldGift=top.querySelector('#erisRoomGift'), oldMusic=top.querySelector('#erisRoomMusic');
    if(oldGift) oldGift.style.display='none';
    if(oldMusic) oldMusic.style.display='none';
  }

  function moveGiftToComposer(s){
    const compose=s.querySelector('.eris-room-compose');
    if(!compose || compose.querySelector('#erisRoomGiftInline')) return;
    const b=document.createElement('button');
    b.type='button'; b.id='erisRoomGiftInline'; b.className='room-inline-action'; b.textContent='🎁';
    b.title='Hediye gönder';
    b.onclick=()=>window.ErisRoomComplete?.openTab?.('gifts');
    const send=compose.querySelector('#erisLiveSend');
    compose.insertBefore(b,send||null);
  }

  async function getRoom(){
    const id=roomId();
    if(!id) return {};
    try{return await api().get?.(id)||{}}catch(e){return {}}
  }

  function isOwner(r){
    const me=currentUser();
    return !!me && [r?.owner_id,r?.owner?.id,r?.created_by,r?.creator_id].filter(Boolean).some(x=>String(x)===me);
  }

  function openOverlay(title,html){
    const s=surface(); if(!s)return null;
    let o=s.querySelector('.erc-v3-overlay');
    if(!o){o=document.createElement('div');o.className='erc-v3-overlay';s.appendChild(o)}
    o.innerHTML='<div class="erc-v3-head"><strong>'+esc(title)+'</strong><button class="erc-v3-close">×</button></div><div class="erc-v3-body">'+html+'</div>';
    o.classList.add('show');
    o.querySelector('.erc-v3-close').onclick=()=>o.classList.remove('show');
    return o;
  }

  function openName(){
    getRoom().then(r=>{
      const title=document.getElementById('erisLiveTitle')?.textContent||r?.name||'Oda';
      const owner=isOwner(r) || roomId().startsWith('demo-room-');
      if(!owner){window.toast?.('Oda adını yalnızca oda sahibi değiştirebilir.');return}
      const o=openOverlay('Oda adını düzenle','<input id="ercV3RoomName" class="erc-v3-input" maxlength="40" value="'+esc(title)+'" placeholder="Oda adı"><button class="erc-v3-save" id="ercV3RoomNameSave">Kaydet</button><div class="erc-v3-note">Oda ilk oluşturulurken verilen ad buradan yeniden düzenlenebilir.</div>');
      o.querySelector('#ercV3RoomNameSave').onclick=async()=>{
        const input=o.querySelector('#ercV3RoomName'), name=input.value.trim();
        if(name.length<2){window.toast?.('Oda adı en az 2 karakter olmalı.');return}
        const id=roomId();
        let saved=false;
        try{
          if(typeof api().rename==='function'){await api().rename(id,name);saved=true}
          else if(window.ErisPlatform?.api){await window.ErisPlatform.api('/rooms/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({name})});saved=true}
        }catch(e){ if(!id.startsWith('demo-room-')){window.toast?.(e.message||'Oda adı kaydedilemedi.');return} }
        document.getElementById('erisLiveTitle').textContent=name;
        const meta=document.getElementById('erisLiveMeta'); if(meta?.dataset.roomNameMeta) meta.textContent=meta.dataset.roomNameMeta;
        if(id.startsWith('demo-room-')) localStorage.setItem('eris_demo_room_name_'+id,name);
        o.classList.remove('show');
        window.toast?.(saved?'Oda adı güncellendi ✓':'Demo oda adı bu oturum için güncellendi ✓');
      };
    });
  }

  function levelData(level,r){
    const raw=Array.isArray(r?.level_rewards)?r.level_rewards:null;
    if(raw && raw.length) return raw.map((x,i)=>({level:Number(x.level||i+1),need:Number(x.required||x.threshold||0),reward:x.reward||x.rewards||'Oda ayrıcalıkları'}));
    const out=[];
    for(let i=1;i<=8;i++){
      const cap=i>=7?16:i>=5?12:8;
      out.push({level:i,need:Number((r?.level_thresholds||[])[i-1]||0),reward:(cap+' koltuk kapasitesi')+(i===1?' • temel oda':i===5?' • 12 koltuk açılır':i===7?' • 16 koltuk açılır':' • yeni oda ayrıcalıkları')});
    }
    return out;
  }

  async function openLevel(){
    const r=await getRoom(), level=Math.max(1,Number(r?.level||1));
    const cap=Number(r?.seat_count||r?.capacity||(level>=7?16:level>=5?12:8));
    const progress=Number(r?.level_progress??r?.progress??0);
    const nextNeed=Number(r?.next_level_threshold??r?.next_level_cost??0);
    const pct=nextNeed>0?Math.max(0,Math.min(100,progress/nextNeed*100)):100;
    const data=levelData(level,r);
    const rows=data.map(x=>{
      const cur=x.level===level, done=x.level<level;
      return '<div class="erc-level-card '+(cur?'current':'')+'"><div class="erc-level-line"><div class="erc-level-num">'+x.level+'</div><div class="erc-level-main"><b>Seviye '+x.level+(cur?' • mevcut':'')+'</b><small>'+(x.need?x.need.toLocaleString('tr-TR')+' puan/eşik':'İlerleme verisi bekleniyor')+'</small></div><span>'+((done)?'✓':(cur?'●':'🔒'))+'</span></div><div class="erc-level-reward">🎁 '+esc(x.reward)+'</div>'+(cur?'<div class="erc-level-progress"><i style="width:'+pct+'%"></i></div><small style="display:block;color:#a39aa9;font-size:7px;margin-top:4px">'+(nextNeed?progress.toLocaleString('tr-TR')+' / '+nextNeed.toLocaleString('tr-TR'):'Mevcut ilerleme backend verisiyle güncellenir')+'</small>':'')+'</div>';
    }).join('');
    openOverlay('Oda seviyeleri','<div class="erc-v3-note" style="margin:0 0 8px">Mevcut seviye: <b>Seviye '+level+'</b> • '+cap+' koltuk. Seviyeye dokunarak hangi ayrıcalıkların açıldığını ve ilerlemeyi görebilirsin.</div>'+rows);
  }

  function bind(){
    const s=surface(); if(!s)return false;
    installCss(); makeTopControls(s); moveGiftToComposer(s);
    const title=s.querySelector('.eris-room-title');
    if(title && title.dataset.v3Bound!=='1'){title.dataset.v3Bound='1';title.onclick=openName}
    const level=s.querySelector('#erisRoomLevel');
    if(level) level.onclick=openLevel;
    return true;
  }

  const boot=()=>{if(bind()) return};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  new MutationObserver(()=>{const s=surface();if(s){installCss();makeTopControls(s);moveGiftToComposer(s);const t=s.querySelector('.eris-room-title');if(t&&t.dataset.v3Bound!=='1'){t.dataset.v3Bound='1';t.onclick=openName}}}).observe(document.body,{childList:true,subtree:true});

  window.ErisRoomLayoutV3={openName,openLevel};
})();
