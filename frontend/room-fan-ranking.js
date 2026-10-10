/* Personal supporters, ranked by received gifts across rooms and DMs. */
(() => {
  'use strict';
  let dismiss=null;
  const style=document.createElement('style');
  style.textContent=`
.personal-fan-overlay{position:fixed;inset:0;z-index:21030;background:#0b0811;color:#f4edf9;display:flex;justify-content:center;box-sizing:border-box;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
.personal-fan-panel{width:100%;max-width:720px;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:radial-gradient(ellipse at top right,#35204055,transparent 55%),#0b0811}
.personal-fan-panel header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 20px 18px;border-bottom:1px solid #ffffff12}
.personal-fan-panel header small{font-size:10px;letter-spacing:2px;color:#bd9cd5;font-weight:700}.personal-fan-panel h2{margin:6px 0 0;font-size:26px;letter-spacing:-.6px}
.personal-fan-panel button{font:inherit;color:inherit;cursor:pointer}.personal-fan-close{flex:none;width:44px;height:44px;border:1px solid #ffffff20;border-radius:15px;background:#ffffff06;font-size:26px!important}
.personal-fan-intro{margin:0;padding:18px 20px;color:#a99ab7;font-size:12px;line-height:1.7}.personal-fan-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 20px 18px}.personal-fan-tabs button{min-height:46px;border:1px solid #ffffff18;border-radius:14px;background:#ffffff04;color:#ad9fba;font-size:13px;font-weight:700}.personal-fan-tabs button[aria-pressed=true]{color:#fff;border-color:#bb8fe580;background:#a365d823}
.personal-fan-list{overflow:auto;overscroll-behavior:contain;flex:1;min-height:0;padding:0 20px 24px}.personal-fan-meta{font-size:11px;color:#a999b6;margin:0 0 12px}.personal-fan-row{display:grid;grid-template-columns:24px 48px minmax(0,1fr);gap:12px;align-items:center;padding:15px 12px;margin-bottom:10px;border:1px solid #ffffff14;border-radius:19px;background:#16101f}.personal-fan-row[data-rank="1"]{border-color:#bba05a70;background:linear-gradient(120deg,#a8862920,#16101f)}.personal-fan-rank{text-align:center;color:#bea0d6;font-size:14px;font-weight:800}.personal-fan-row[data-rank="1"] .personal-fan-rank{color:#e5c774}
.personal-fan-person{min-width:0}.personal-fan-name{display:flex;align-items:center;gap:5px;max-width:100%;padding:0;border:0;background:transparent;text-align:left;font-size:14px!important;font-weight:700;overflow-wrap:anywhere;line-height:1.5}.personal-fan-name .personal-fan-nickname{min-width:0;overflow-wrap:anywhere}.personal-fan-details{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:6px}.personal-fan-amount{font-size:12px;color:#dec178;font-weight:600}.personal-fan-level{width:32px;height:28px;object-fit:contain}.personal-fan-avatar{position:relative;display:grid;place-items:center;width:48px;height:48px;border:0;padding:0;border-radius:50%;background:#382145;color:#d0a9eb;font-size:18px!important;flex:none}.personal-fan-avatar>img:not(.personal-fan-frame){position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%}.personal-fan-frame{position:absolute;inset:-6px;width:60px;height:60px;object-fit:contain;pointer-events:none}
.personal-fan-state{display:grid;justify-items:center;gap:12px;text-align:center;padding:44px 20px;border:1px dashed #aa80cc30;border-radius:20px;color:#aa9bb8;font-size:13px;line-height:1.6}.personal-fan-state b{color:#e8d9f2;font-size:17px}.personal-fan-state button{min-height:44px;padding:10px 20px;border:1px solid #b187d74a;border-radius:13px;background:#a365d819;font-size:13px}.personal-gift-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.personal-gift-card{min-width:0;border:1px solid #ffffff15;border-radius:17px;background:#171020;padding:12px 8px;text-align:center}.personal-gift-card img{width:100%;height:90px;object-fit:contain}.personal-gift-card b{display:block;margin-top:8px;color:#dabbef;font-size:13px}.personal-gift-card small{display:block;overflow-wrap:anywhere;font-size:10px;color:#a493b2;margin-top:4px}.personal-fan-panel button:focus-visible{outline:2px solid #c99bef;outline-offset:3px}
@media(max-width:360px){.personal-fan-panel header{padding:20px 16px}.personal-fan-panel h2{font-size:23px}.personal-fan-list{padding:0 16px 20px}.personal-fan-row{gap:9px;padding:14px 10px;grid-template-columns:20px 44px minmax(0,1fr)}.personal-fan-avatar{width:44px;height:44px}.personal-fan-frame{width:56px;height:56px}.personal-gift-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
  document.head.append(style);
  function open(userId){
    const id=String(userId||'');if(!id)return;
    dismiss?.();
    const previous=document.activeElement,overlay=document.createElement('div');overlay.className='personal-fan-overlay';
    overlay.innerHTML='<section class="personal-fan-panel" role="dialog" aria-modal="true" aria-labelledby="personalFanTitle"><header><div><small>ERISCHAT · PROFİL</small><h2 id="personalFanTitle">Hayran sıralaması</h2></div><button type="button" class="personal-fan-close" aria-label="Kapat">×</button></header><p class="personal-fan-intro">Oda ve özel mesajlarda alınan hediyelere göre tüm zamanların ilk 50 destekçisi. Tutarlar Lidya değeridir.</p><div class="personal-fan-tabs" role="group" aria-label="Hayran bölümleri"><button type="button" data-tab="ranking" aria-pressed="true">Sıralama</button><button type="button" data-tab="gifts" aria-pressed="false">Hediyeler</button></div><div class="personal-fan-list" aria-live="polite"></div></section>';
    document.body.append(overlay);
    const list=overlay.querySelector('.personal-fan-list');let generation=0,tab='ranking';
    const close=()=>{generation++;overlay.remove();document.removeEventListener('keydown',key);if(dismiss===close)dismiss=null;if(previous?.isConnected)previous.focus()};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
    dismiss=close;document.addEventListener('keydown',key);overlay.querySelector('.personal-fan-close').onclick=close;overlay.querySelector('.personal-fan-close').focus();
    function state(title,detail,retry=false){list.replaceChildren();const box=document.createElement('div');box.className='personal-fan-state';const heading=document.createElement('b');heading.textContent=title;const copy=document.createElement('span');copy.textContent=detail;box.append(heading,copy);if(retry){const button=document.createElement('button');button.type='button';button.textContent='Tekrar dene';button.onclick=load;box.append(button)}list.append(box)}
    function profile(row){close();if(window.ErisFloatingProfile?.open)window.ErisFloatingProfile.open(row.user_id);else window.openUserProfile?.(row.user_id)}
    async function load(){
      const current=++generation,section=tab;list.setAttribute('aria-busy','true');state('Yükleniyor…',section==='ranking'?'Destekçilerin hazırlanıyor.':'Alınan hediyeler hazırlanıyor.');
      try{
        const rows=await window.ErisPlatform.api('/users/'+encodeURIComponent(id)+(section==='ranking'?'/fan-leaderboard':'/received-gifts'));
        if(!overlay.isConnected||current!==generation)return;
        if(!Array.isArray(rows))throw Error('Liste alınamadı.');
        if(!rows.length){state(section==='ranking'?'İlk destekçini bekliyor':'Henüz hediye yok','Alınan hediyeler ve destekçilerin burada görünecek.');return}
        list.replaceChildren();
        const meta=document.createElement('p');meta.className='personal-fan-meta';meta.textContent=section==='ranking'?rows.length+' destekçi · tüm zamanlar':rows.length+' farklı hediye';list.append(meta);
        if(section==='gifts'){
          const grid=document.createElement('div');grid.className='personal-gift-list';
          for(const row of rows){const card=document.createElement('div');card.className='personal-gift-card';const img=document.createElement('img');img.src=row.image_url||'';img.alt=row.gift_key||'Hediye';img.loading='lazy';const count=document.createElement('b');count.textContent='× '+Number(row.count||0).toLocaleString('tr-TR');const name=document.createElement('small');name.textContent=row.gift_key||'Hediye';card.append(img,count,name);grid.append(card)}list.append(grid);return;
        }
        for(const row of rows){
          const item=document.createElement('div');item.className='personal-fan-row';item.dataset.rank=String(row.rank);const rank=document.createElement('span');rank.className='personal-fan-rank';rank.textContent=row.rank;
          const avatar=document.createElement('button');avatar.type='button';avatar.className='personal-fan-avatar';avatar.setAttribute('aria-label',(row.nickname||'Kullanıcı')+' profilini aç');avatar.textContent=String(row.nickname||'K').slice(0,1).toLocaleUpperCase('tr-TR');
          const asset=row.avatar_asset&&(window.ErisChatCosmetics?.assetUrl?.(row.avatar_asset)||row.avatar_asset);
          if(asset){const img=document.createElement('img');img.src=asset;img.alt='';img.onerror=()=>img.remove();avatar.append(img)}
          const frame=row.frame_asset&&(window.ErisChatCosmetics?.assetUrl?.(row.frame_asset)||row.frame_asset);if(frame){const img=document.createElement('img');img.src=frame;img.alt='';img.className='personal-fan-frame';avatar.append(img)}
          const person=document.createElement('div');person.className='personal-fan-person';const name=document.createElement('button');name.type='button';name.className='personal-fan-name';const nick=document.createElement('span');nick.className='personal-fan-nickname';nick.textContent=row.nickname||'Kullanıcı';name.append(nick);window.ErisRoleBadges?.bind(nick,row);
          const details=document.createElement('div');details.className='personal-fan-details';const badge=document.createElement('img');badge.className='personal-fan-level';const level=Math.max(1,Math.min(40,Number(row.fan_level)||1));badge.src='./fan-levels/LEVEL'+level+'.png';badge.alt='Hayran seviyesi '+level;badge.onerror=()=>{const fallback=document.createElement('span');fallback.textContent='Sv. '+level;fallback.style.cssText='font-size:10px;color:#ba98d4';badge.replaceWith(fallback)};const amount=document.createElement('span');amount.className='personal-fan-amount';amount.textContent=Number(row.total_lidya||0).toLocaleString('tr-TR')+' Lidya';details.append(badge,amount);person.append(name,details);
          if(row.user_id){avatar.onclick=name.onclick=()=>profile(row)}else{avatar.disabled=name.disabled=true}
          item.append(rank,avatar,person);list.append(item);
        }
      }catch(e){if(overlay.isConnected&&current===generation)state('Liste yüklenemedi',e.message||'Bağlantını kontrol edip tekrar dene.',true)}finally{if(current===generation)list.setAttribute('aria-busy','false')}
    }
    overlay.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;overlay.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));load()});load();
  }
  window.ErisPersonalFanRanking=open;
})();
