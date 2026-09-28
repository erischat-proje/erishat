/* Permanent room fan ranking, based on total gifts sent to this room. */
(() => {
  let request = 0;
  function open() {
    const roomId=String(window.ErisCurrentRoomId||window.currentRoomId||'');
    const surface=document.getElementById('erisRoomSurface');
    if(!roomId||!surface)return;
    let dialog=surface.querySelector('#erisRoomFanRanking');
    if(!dialog){
      dialog=document.createElement('div');dialog.id='erisRoomFanRanking';
      dialog.innerHTML='<div class="rc-shade"></div><section class="rc-panel" role="dialog" aria-modal="true" aria-label="Oda hayranları"><header><div><small>ERISCHAT · ODA</small><h2>Hayran sıralaması</h2></div><button class="rc-close" type="button" aria-label="Kapat">×</button></header><p class="rf-explain">Bu odaya gönderilen hediyelerin toplam Lidya değeriyle seviye kazanılır. Sıralama tüm zamanları kapsar ve sıfırlanmaz.</p><div class="rc-list" aria-live="polite"></div></section>';
      surface.appendChild(dialog);
      const close=()=>{dialog.hidden=true;request++};
      dialog.querySelector('.rc-close').onclick=close;
      dialog.querySelector('.rc-shade').onclick=close;
    }
    dialog.hidden=false;
    const list=dialog.querySelector('.rc-list');list.textContent='Sıralama yükleniyor…';
    const current=++request;
    window.ErisPlatform.api('/rooms/'+encodeURIComponent(roomId)+'/fan-leaderboard').then(rows=>{
      if(current!==request||dialog.hidden)return;
      list.replaceChildren();
      if(!Array.isArray(rows)||!rows.length){list.textContent='Bu odaya henüz hediye gönderilmedi.';return}
      for(const row of rows){
        const item=document.createElement('div');item.className='rc-row rf-row';
        const rank=document.createElement('span');rank.className='rc-rank';rank.textContent=row.rank;
        const avatar=document.createElement('span');avatar.className='rc-avatar';
        const src=row.avatar_asset&&window.ErisChatCosmetics?.assetUrl?.(row.avatar_asset);
        if(src){const img=document.createElement('img');img.src=src;img.alt='';avatar.appendChild(img)}else avatar.textContent=row.avatar||'◈';
        const frame=row.frame_asset&&window.ErisChatCosmetics?.assetUrl?.(row.frame_asset);
        if(frame){const img=document.createElement('img');img.className='rf-avatar-frame';img.src=frame;img.alt='';avatar.appendChild(img)}
        const name=document.createElement('span');name.className='rc-name';name.textContent=row.nickname||'Kullanıcı';
        const badge=document.createElement('img');badge.className='rf-level';badge.src='./fan-levels/LEVEL'+Math.max(1,Math.min(40,Number(row.fan_level)||1))+'.png';badge.alt='Hayran seviyesi '+row.fan_level;
        const amount=document.createElement('span');amount.className='rc-amount';amount.textContent=Number(row.total_lidya||0).toLocaleString('tr-TR')+' Lidya';
        item.append(rank,avatar,name,badge,amount);list.appendChild(item);
      }
    }).catch(e=>{if(current===request)list.textContent=e.message||'Sıralama yüklenemedi.'});
  }
  window.ErisRoomFanRanking=open;
  window.addEventListener('erischat:room-opened',()=>{
    const s=document.getElementById('erisRoomSurface');
    if(!s||s.querySelector('#erisRoomFanButton'))return;
    const button=document.createElement('button');button.id='erisRoomFanButton';button.type='button';button.textContent='✦ Hayranlar';button.onclick=open;
    s.appendChild(button);
  });
})();
