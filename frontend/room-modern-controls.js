/* Room controls, floating room and contribution ranking. */
(() => {
  const surface = () => document.getElementById('erisRoomSurface');
  const roomId = () => String(window.ErisCurrentRoomId || window.currentRoomId || '');
  const api = (id, period) => window.ErisPlatform.api(`/rooms/${encodeURIComponent(id)}/gift-leaderboard?period=${period}`);
  let minimized = false;
  let activePeriod = 'daily';
  let requestNumber = 0;
  const labels = {daily:'Günlük',weekly:'Haftalık',monthly:'Aylık',season:'Sezonluk'};
  const bubble = document.createElement('button');
  bubble.id = 'erisRoomFloatingBubble'; bubble.type = 'button'; bubble.hidden = true;
  bubble.setAttribute('aria-label', 'Odaya geri dön');
  bubble.innerHTML = '<span aria-hidden="true">⌂</span><small>Odaya dön</small>';
  document.body.appendChild(bubble);
  const exitTarget = document.createElement('div');
  exitTarget.id = 'erisRoomBubbleExit'; exitTarget.hidden = true;
  exitTarget.setAttribute('aria-hidden', 'true');
  exitTarget.innerHTML = '<span>×</span>';
  document.body.appendChild(exitTarget);
  const overExit = () => {
    const b=bubble.getBoundingClientRect(), x=exitTarget.getBoundingClientRect();
    return b.left+b.width/2 >= x.left && b.left+b.width/2 <= x.right && b.top+b.height/2 >= x.top && b.top+b.height/2 <= x.bottom;
  };
  const hideExit = () => {exitTarget.hidden=true;exitTarget.classList.remove('near')};
  let start = null, moved = false;
  bubble.addEventListener('pointerdown', e => {
    start = {x:e.clientX, y:e.clientY, left:bubble.getBoundingClientRect().left, top:bubble.getBoundingClientRect().top};
    moved = false; exitTarget.hidden=false; bubble.setPointerCapture(e.pointerId);
  });
  bubble.addEventListener('pointermove', e => {
    if (!start) return;
    const dx=e.clientX-start.x, dy=e.clientY-start.y;
    if (Math.abs(dx)+Math.abs(dy)<6 && !moved) return;
    moved=true;
    const left=Math.min(window.innerWidth-bubble.offsetWidth-8,Math.max(8,start.left+dx));
    const top=Math.min(window.innerHeight-bubble.offsetHeight-8,Math.max(8,start.top+dy));
    bubble.style.left=left+'px';bubble.style.top=top+'px';bubble.style.right='auto';bubble.style.bottom='auto';
    exitTarget.classList.toggle('near',overExit());
  });
  bubble.addEventListener('pointerup', () => {
    const exit=moved&&overExit();start=null;hideExit();
    if(exit){
      moved=true;minimized=false;bubble.hidden=true;
      bubble.style.left='';bubble.style.top='';bubble.style.right='';bubble.style.bottom='';
      Promise.resolve(window.closeRealRoom?.()).catch(e=>window.toast?.(e.message||'Odadan çıkılamadı.'));
    }
  });
  bubble.addEventListener('pointercancel', () => { start=null;hideExit(); });
  bubble.onclick=() => {
    if (moved || !roomId()) return;
    clearSeatUi();
    minimized=false;bubble.hidden=true;hideExit();
    const s=surface();
    if(s){
      s.classList.add('show');
      s.style.setProperty('display','block','important');
    }
    window.ErisScreenProtection?.set?.('room',!!window.__erisCurrentRoomLocked);
  };
  function clearSeatUi(){
    document.getElementById('eris-seat-actions')?.remove();
    document.querySelector('.eris-seat-action-sheet')?.remove();
    window.ErisSeatPermissions?.closeUi?.();
  }
  function minimize(){
    if (!roomId()) return;
    clearSeatUi();
    const s=surface();
    minimized=true;
    if(s){
      s.classList.remove('show');
      s.style.setProperty('display','none','important');
    }
    bubble.hidden=false;
    window.ErisScreenProtection?.set?.('room',false);
  }
  function dialog(){
    const s=surface();if(!s)return null;
    let d=s.querySelector('#erisRoomContribution');
    if(d)return d;
    d=document.createElement('div');d.id='erisRoomContribution';d.hidden=true;
    d.innerHTML='<div class="rc-shade"></div><section class="rc-panel" role="dialog" aria-modal="true" aria-label="Oda katkısı"><header><div><small>ERISCHAT · ODA</small><h2>Oda katkısı</h2></div><button class="rc-close" type="button" aria-label="Kapat">×</button></header><nav class="rc-periods" aria-label="Sıralama dönemi"></nav><div class="rc-list" aria-live="polite"></div></section>';
    d.querySelector('h2').textContent=window.__erisCurrentCoupleId?'Çift hediyesi':'Oda katkısı';s.appendChild(d);
    d.querySelector('.rc-close').onclick=close;
    d.querySelector('.rc-shade').onclick=close;
    d.querySelector('.rc-periods').innerHTML=Object.entries(labels).map(([key,label])=>`<button type="button" data-period="${key}">${label}</button>`).join('');
    d.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>load(b.dataset.period));
    return d;
  }
  function close(){const d=dialog();if(d)d.hidden=true;requestNumber++;}
  async function load(period){
    const d=dialog(), id=roomId();if(!d || !id)return;d.querySelector('h2').textContent=window.__erisCurrentCoupleId?'Çift hediyesi':'Oda katkısı';
    activePeriod=period;
    d.querySelectorAll('[data-period]').forEach(b=>{const selected=b.dataset.period===period;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    const list=d.querySelector('.rc-list');list.textContent='Sıralama yükleniyor…';
    const request=++requestNumber;
    try{
      const rows=await api(id,period);
      if(request!==requestNumber||id!==roomId())return;
      list.replaceChildren();
      if(!Array.isArray(rows)||!rows.length){list.textContent='Bu dönemde henüz odaya hediye gönderilmedi.';return;}
      for(const row of rows){
        const item=document.createElement('div');item.className='rc-row';
        const rank=document.createElement('span');rank.className='rc-rank';rank.textContent=String(row.rank||'');
        const avatar=document.createElement('span');avatar.className='rc-avatar';
        const asset=row.avatar_asset && window.ErisChatCosmetics?.assetUrl?.(row.avatar_asset);
        if(asset){const img=document.createElement('img');img.src=asset;img.alt='';avatar.appendChild(img)}else avatar.textContent=row.avatar||'◈';
        const name=document.createElement('span');name.className='rc-name';name.textContent=row.nickname||'Kullanıcı';
        const amount=document.createElement('span');amount.className='rc-amount';amount.textContent=Number(row.total_lidya||0).toLocaleString('tr-TR')+' Lidya';
        if(row.user_id){avatar.style.cursor='pointer';name.style.cursor='pointer';avatar.onclick=name.onclick=()=>window.ErisFloatingProfile?.open(row.user_id)}
        item.append(rank,avatar,name,amount);list.appendChild(item);
      }
    }catch(e){if(request===requestNumber)list.textContent=e.message||'Sıralama yüklenemedi.';}
  }
  function setup(){
    const s=surface();if(!s)return;
    const icons={
      erisRoomGift:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9C6 9 6 3 9 3c2 0 3 3 3 6Zm0 0c6 0 6-6 3-6-2 0-3 3-3 6Z"/>',
      erisRoomMusic:'<path d="M9 18V5l12-2v13M9 8l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      erisRoomWallpaper:'<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 18 6-5 4 3 3-3 5 5"/>'
    };
    for(const [id,paths] of Object.entries(icons)){
      const button=s.querySelector('#'+id);
      if(!button)continue;
      if(!button.querySelector('svg'))button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
      const label={erisRoomGift:'Hediye',erisRoomMusic:'Müzik',erisRoomWallpaper:'Duvar'}[id];
      button.title=button.getAttribute('aria-label')||label;
      if(!button.querySelector('span')){const caption=document.createElement('span');caption.textContent=label;button.append(caption)}
    }
    const actions=s.querySelector('.eris-room-quick-actions');
    if(actions&&actions.parentElement!==s)s.appendChild(actions);
    const emblem=s.querySelector('.eris-room-emblem');
    if(emblem && emblem.tagName!=='BUTTON'){
      const home=document.createElement('button');home.id='erisRoomMinimize';home.type='button';home.className='eris-room-emblem';
      home.textContent='⌂';home.title='Odayı balona küçült';home.setAttribute('aria-label','Odayı balona küçült');
      home.onclick=minimize;emblem.replaceWith(home);
    }
    let contribution=s.querySelector('#erisRoomContributionButton');
    if(!contribution){contribution=document.createElement('button');contribution.id='erisRoomContributionButton';contribution.type='button';contribution.textContent='◇ Oda katkısı';contribution.onclick=()=>{const d=dialog();d.hidden=false;load(activePeriod)};s.appendChild(contribution)}
    const gift=s.querySelector('#erisRoomGiftInline');if(gift)gift.remove();
    if(minimized){minimized=false;bubble.hidden=true;hideExit();s.classList.add('show')}
  }
  window.addEventListener('erischat:room-opened',setup);
  window.addEventListener('erischat:room-closed',()=>{clearSeatUi();bubble.hidden=true;hideExit();minimized=false;close()});
  window.addEventListener('erischat:ludo-view-closed',clearSeatUi);
  const originalClose=window.closeRealRoom;
  if(typeof originalClose==='function')window.closeRealRoom=async(...args)=>{clearSeatUi();bubble.hidden=true;hideExit();minimized=false;close();return originalClose(...args)};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog()?.hidden)close()});
})();
