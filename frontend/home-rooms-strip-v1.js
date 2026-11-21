/* LidyaChat Home Rooms V1 — existing room API and join handler only. */
(() => {
  'use strict';
  const root = document.getElementById('lidyaHomeRoomsV1');
  if (!root) return;
  const track = root.querySelector('[data-room-track]');
  const status = root.querySelector('[data-room-status]');
  const allLink = root.querySelector('[data-room-all]');
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const apiBase = () => (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
  const list = x => Array.isArray(x) ? x : x?.rooms || x?.items || x?.data || [];
  let loading = false;
  let lastLoaded = 0;
  const t = (tag, klass, value) => { const e = document.createElement(tag); if (klass) e.className=klass; if (value != null) e.textContent=String(value); return e; };
  const countOf = room => Math.max(0, Number(room.member_count ?? room.members_count ?? room.online_count ?? 0) || 0);
  const keyOf = room => String(room.id ?? room.room_id ?? room.public_id ?? '');
  const assetUrl = value => {
    if (!value) return '';
    const raw = typeof value === 'string' ? value : (value.url || value.asset || value.path || value.asset_key || '');
    if (!raw || typeof raw !== 'string') return '';
    const converted = window.ErisChatCosmetics?.assetUrl?.(raw) || raw;
    return /^(https?:\/\/|\/|\.\/)/i.test(converted) ? converted : '';
  };
  const avatarOf = room => assetUrl(room.owner_avatar_asset || room.owner_avatar || room.owner_avatar_url);
  const frameOf = room => assetUrl(room.owner_frame_asset || room.owner_frame_url);
  const open = room => {
    const id = room.id ?? room.room_id;
    if (id == null || !window.openRoom) {
      window.toast?.('Oda bağlantısı henüz hazır değil.');
      return;
    }
    window.ErisCurrentRoomId=id;
    window.currentRoomId=id;
    window.__erisCurrentRoomUserId=localStorage.getItem('eris_user_id')||'';
    window.openRoom(id, room.name || room.title || 'Oda');
  };
  function render(rooms, followed) {
    track.replaceChildren();
    const follow = new Set(followed.map(keyOf));
    const unique = new Map();
    [...followed,...rooms].forEach(room => {const key=keyOf(room); if(key && !unique.has(key)) unique.set(key,room);});
    const items=[...unique.values()].filter(r=>r.is_active!==false && countOf(r)>0)
      .sort((a,b)=>Number(follow.has(keyOf(b)))-Number(follow.has(keyOf(a)))||countOf(b)-countOf(a)).slice(0,20);
    root.hidden = !items.length;
    if (!items.length) return;
    const fragment=document.createDocumentFragment();
    items.forEach(room => {
      const name=room.name || room.title || 'Oda';
      const item=t('button','lhr-card');item.type='button';
      item.setAttribute('aria-label',`${name} odasına gir, ${countOf(room)} kişi`);
      const portrait=t('span','lhr-avatar');
      const url=avatarOf(room);
      if(url){const image=t('img');image.src=url;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>{image.remove();portrait.textContent='👤';};portrait.append(image);}
      else portrait.textContent='👤';
      const frameUrl=frameOf(room);
      if(frameUrl){const frame=t('span','lhr-frame');frame.style.backgroundImage=`url("${frameUrl.replace(/"/g,'%22')}")`;portrait.append(frame);}
      const live=t('span','lhr-live-dot');live.setAttribute('aria-hidden','true');portrait.append(live);
      const title=t('span','lhr-name',name);
      const info=t('span','lhr-count',`${countOf(room)} kişi`);
      item.append(portrait,title,info);
      if(follow.has(keyOf(room)) || room.is_following){item.classList.add('lhr-followed');item.append(t('span','lhr-follow-mark','★'));}
      if(room.locked || room.password_set){item.classList.add('lhr-locked');item.append(t('span','lhr-lock','🔒'));}
      item.onclick=()=>open(room);
      fragment.append(item);
    });
    track.append(fragment);
    status.textContent=`${items.length} canlı oda`;
  }
  async function load(force=false){
    if(loading || (!force && Date.now()-lastLoaded<15000))return;
    if(document.visibilityState==='hidden')return;
    if(!token()){root.hidden=true;return;}
    loading=true;
    try {
      const [roomResponse,followResult]=await Promise.allSettled([
        fetch(`${apiBase()}/rooms`,{headers:{Authorization:`Bearer ${token()}`},cache:'no-store'}),
        window.ErisRoom?.listFollowing?.() || Promise.resolve([])
      ]);
      if(roomResponse.status!=='fulfilled' || !roomResponse.value.ok)throw Error('Odalar alınamadı');
      const rooms=list(await roomResponse.value.json());
      const followed=followResult.status==='fulfilled' ? list(followResult.value) : [];
      render(rooms,followed);
      lastLoaded=Date.now();
    }catch(err){root.hidden=true;console.warn('[LidyaChat] home room strip',err);}
    finally{loading=false;}
  }
  allLink?.addEventListener('click',()=>window.openRoomsFromHome?.());
  const poll=setInterval(()=>{if(document.visibilityState==='visible' && document.getElementById('home')?.classList.contains('show'))load();},15000);
  root.querySelector('[data-room-prev]')?.addEventListener('click',()=>track.scrollBy({left:-track.clientWidth*.8,behavior:'smooth'}));
  root.querySelector('[data-room-next]')?.addEventListener('click',()=>track.scrollBy({left:track.clientWidth*.8,behavior:'smooth'}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible' && document.getElementById('home')?.classList.contains('show'))load();});
  window.addEventListener('erischat:room-opened',()=>{lastLoaded=0;});
  window.addEventListener('erischat:room-state-updated',()=>{lastLoaded=0;});
  const observer = new MutationObserver(()=>{if(document.getElementById('home')?.classList.contains('show'))load();});
  observer.observe(document.getElementById('home'),{attributes:true,attributeFilter:['class']});
  window.LidyaHomeRooms={refresh:()=>load(true)};
  if(document.getElementById('home')?.classList.contains('show'))load();
})();
