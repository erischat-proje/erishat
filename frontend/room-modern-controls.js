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
  let start = null, moved = false;
  bubble.addEventListener('pointerdown', e => {
    start = {x:e.clientX, y:e.clientY, left:bubble.getBoundingClientRect().left, top:bubble.getBoundingClientRect().top};
    moved = false; bubble.setPointerCapture(e.pointerId);
  });
  bubble.addEventListener('pointermove', e => {
    if (!start) return;
    const dx=e.clientX-start.x, dy=e.clientY-start.y;
    if (Math.abs(dx)+Math.abs(dy)<6 && !moved) return;
    moved=true;
    const left=Math.min(window.innerWidth-bubble.offsetWidth-8,Math.max(8,start.left+dx));
    const top=Math.min(window.innerHeight-bubble.offsetHeight-8,Math.max(8,start.top+dy));
    bubble.style.left=left+'px';bubble.style.top=top+'px';bubble.style.right='auto';bubble.style.bottom='auto';
  });
  bubble.addEventListener('pointerup', () => { start=null; });
  bubble.addEventListener('pointercancel', () => { start=null; });
  bubble.onclick=() => {
    if (moved || !roomId()) return;
    minimized=false;bubble.hidden=true;surface()?.classList.add('show');
    window.ErisScreenProtection?.set?.('room',!!window.__erisCurrentRoomLocked);
  };
  function minimize(){
    if (!roomId()) return;
    minimized=true;surface()?.classList.remove('show');bubble.hidden=false;
    window.ErisScreenProtection?.set?.('room',false);
  }
  function dialog(){
    const s=surface();if(!s)return null;
    let d=s.querySelector('#erisRoomContribution');
    if(d)return d;
    d=document.createElement('div');d.id='erisRoomContribution';d.hidden=true;
    d.innerHTML='<div class="rc-shade"></div><section class="rc-panel" role="dialog" aria-modal="true" aria-label="Oda katkısı"><header><div><small>ERISCHAT · ODA</small><h2>Oda katkısı</h2></div><button class="rc-close" type="button" aria-label="Kapat">×</button></header><nav class="rc-periods" aria-label="Sıralama dönemi"></nav><div class="rc-list" aria-live="polite"></div></section>';
    s.appendChild(d);
    d.querySelector('.rc-close').onclick=close;
    d.querySelector('.rc-shade').onclick=close;
    d.querySelector('.rc-periods').innerHTML=Object.entries(labels).map(([key,label])=>`<button type="button" data-period="${key}">${label}</button>`).join('');
    d.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>load(b.dataset.period));
    return d;
  }
  function close(){const d=dialog();if(d)d.hidden=true;requestNumber++;}
  async function load(period){
    const d=dialog(), id=roomId();if(!d || !id)return;
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
      if(button && !button.querySelector('svg'))button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
    }
    const emblem=s.querySelector('.eris-room-emblem');
    if(emblem && emblem.tagName!=='BUTTON'){
      const home=document.createElement('button');home.id='erisRoomMinimize';home.type='button';home.className='eris-room-emblem';
      home.textContent='⌂';home.title='Odayı balona küçült';home.setAttribute('aria-label','Odayı balona küçült');
      home.onclick=minimize;emblem.replaceWith(home);
    }
    let contribution=s.querySelector('#erisRoomContributionButton');
    if(!contribution){contribution=document.createElement('button');contribution.id='erisRoomContributionButton';contribution.type='button';contribution.textContent='◇ Oda katkısı';contribution.onclick=()=>{const d=dialog();d.hidden=false;load(activePeriod)};s.appendChild(contribution)}
    const gift=s.querySelector('#erisRoomGiftInline');if(gift)gift.remove();
    if(minimized){minimized=false;bubble.hidden=true;s.classList.add('show')}
  }
  window.addEventListener('erischat:room-opened',setup);
  window.addEventListener('erischat:room-closed',()=>{bubble.hidden=true;minimized=false;close()});
  const originalClose=window.closeRealRoom;
  if(typeof originalClose==='function')window.closeRealRoom=async(...args)=>{bubble.hidden=true;minimized=false;close();return originalClose(...args)};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog()?.hidden)close()});
})();
