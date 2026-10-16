(() => {
  'use strict';
  const art={
    home:'<path d="m3 10 9-7 9 7v11H3zM9 21v-7h6v7"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    exit:'<path d="M10 4H4v16h6M8 12h13m-5-5 5 5-5 5"/>',
    gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M12 8C3 8 5 1 9 3l3 5Zm0 0c9 0 7-7 3-5l-3 5Z"/>',
    music:'<path d="M9 18V5l11-2v13M9 8l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    audio:'<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',
    mute:'<path d="M3 9h4l5-4v14l-5-4H3zM17 9l5 6m0-6-5 6"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
    ban:'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    dice:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
    cards:'<rect x="8" y="3" width="12" height="18" rx="2"/><path d="M5 6H3v14a2 2 0 0 0 2 2h10m-1-15 3 5-3 5-3-5Z"/>',
    tiles:'<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/><path d="M7 8v6m-2 0h4M16 8h2v3h-2v3h2"/>',
    game:'<path d="M6 7h12c3 0 5 12 2 13-2 1-4-3-4-3H8s-2 4-4 3C1 19 3 7 6 7ZM6 11v5M4 13h5M16 12h.1M19 15h.1"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',
    crown:'<path d="m3 6 5 5 4-7 4 7 5-5-2 13H5zM6 22h12"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>'
  };
  const svg=key=>'<svg class="erm-icon" data-erm-icon="'+key+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+art[key]+'</svg>';
  function paint(button,key,label,caption=false){
    if(!button||!art[key])return;
    if(button.querySelector('[data-erm-icon="'+key+'"]'))return;
    button.innerHTML=svg(key)+(caption?'<span class="erm-caption"></span>':'');
    if(caption)button.querySelector('.erm-caption').textContent=label;
    if(label){button.setAttribute('aria-label',label);button.title=label;}
  }
  const controls={erisRoomMinimize:['home','Odayı küçült'],erisRoomMoreTop:['more','Oda menüsü'],erisRoomLeaveTop:['exit','Odadan ayrıl'],erisRoomGift:['gift','Hediye'],erisRoomMusic:['music','Müzik'],erisRoomWallpaper:['image','Duvar'],erisRoomGiftInline:['gift','Hediye gönder'],erisRoomContributionButton:['crown','Oda katkısı']};
  const menuIcons={info:'home',users:'users',guests:'users',staff:'shield',moderators:'crown',promote:'plus',gifts:'gift',music:'music',report:'shield',adminroomban:'ban',bans:'ban',mutes:'mute',settings:'settings',theme:'image',ludo:'dice',okey101:'tiles',uno:'cards'};
  let queued=false;
  function refresh(){
    queued=false;
    const room=document.getElementById('erisRoomSurface');
    if(room){
      room.classList.add('room-menu-polished');
      for(const [id,[key,label]] of Object.entries(controls))paint(document.getElementById(id),key,label,['erisRoomContributionButton','erisRoomGift','erisRoomMusic','erisRoomWallpaper'].includes(id));
      const mic=document.getElementById('erisRoomMicInline');paint(mic,'mic',mic?.getAttribute('aria-label')||'Mikrofon');
      const output=document.getElementById('erisRoomAudioOutput');paint(output,output?.getAttribute('aria-pressed')==='false'?'mute':'audio',output?.getAttribute('aria-label')||'Oda sesi');
      room.querySelectorAll('[data-v5]').forEach(b=>{const span=b.firstElementChild,key=menuIcons[b.dataset.v5];if(span&&key&&!span.querySelector('[data-erm-icon]'))span.innerHTML=svg(key)});
      room.querySelectorAll('.room-v3-close,.room-center-close,.room-v5-dialog [data-close],.rc-close').forEach(b=>paint(b,'close',b.getAttribute('aria-label')||'Kapat'));
      room.querySelectorAll('#eris-seat-actions .esa-toolbar button').forEach(b=>{const title=b.getAttribute('aria-label')||'';const key=/Mikrofon/i.test(title)?'mic':/kilit/i.test(title)?'lock':/hediye/i.test(title)?'gift':/Profili/i.test(title)?'users':/otur|Davet/i.test(title)?'plus':/kalk/i.test(title)?'exit':/sustur/i.test(title)?'mute':'ban';paint(b,key,title)});
    }
    document.querySelectorAll('#erisMusicPanel [data-close],#erisRoomWallpaperModal [data-close],#erischatGiftPanel .egp-close').forEach(b=>paint(b,'close','Kapat'));
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(refresh)}}
  new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&[...r.addedNodes].some(n=>n.nodeType===1)||r.type==='attributes'&&r.target.closest?.('#erisRoomSurface')))schedule()}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']});
  ['erischat:room-opened','erischat:room-audio-state'].forEach(name=>window.addEventListener(name,schedule));
  refresh();
})();
