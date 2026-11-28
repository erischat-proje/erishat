(()=>{
  'use strict';
  const home=document.getElementById('home');
  const trigger=document.getElementById('lidyaWelcomePackages');
  if(!home||!trigger)return;
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const number=n=>new Intl.NumberFormat('tr-TR').format(n);
  const price=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n/100);
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
  let account='', revision=0, state=null, deadline=0, lastRequest=-Infinity, pending=false, overlay=null, priorFocus=null;
  const now=()=>performance.now();
  const remaining=()=>Math.max(0,Math.floor((deadline-now())/1000));
  const eligible=()=>!!(account&&token()===account&&state&&remaining()>0);
  function close(restore=true){
    if(!overlay)return;
    overlay.remove();overlay=null;
    if(restore&&priorFocus?.isConnected&&!priorFocus.hidden)priorFocus.focus();
    priorFocus=null;
  }
  function clear(){state=null;deadline=0;trigger.hidden=true;close(false)}
  function syncAccount(){const next=token();if(next!==account){account=next;revision++;pending=false;lastRequest=-Infinity;clear()}return !!account}
  function valid(data){
    if(data?.eligible_for_offer!==true||!['male','female'].includes(data.collection)||!Number.isInteger(data.remaining_seconds)||data.remaining_seconds<=0||data.remaining_seconds>604800||!Array.isArray(data.packages)||data.packages.length!==3)return false;
    const tiers=['bronze','silver','gold'];
    return tiers.every((tier,i)=>{const p=data.packages[i];return p?.id===tier&&p.collection===data.collection&&typeof p.name==='string'&&Number.isSafeInteger(p.lidya)&&p.lidya>0&&Number.isSafeInteger(p.price_kurus)&&p.price_kurus>0&&p.currency==='TRY'&&p.purchase_limit===1&&p.duration_days===[7,15,30][i]&&Array.isArray(p.cosmetic_rewards)&&p.cosmetic_rewards.length===[2,4,5][i]&&p.cosmetic_rewards.every(r=>['frame','bubble','profile','entrance','title'].includes(r.type)&&r.gender===data.collection&&r.tier===tier&&r.asset_key===`welcome_${data.collection}_${tier}_${r.type}_v1`&&r.preview_asset===`welcome-premium-v3/${r.asset_key}.svg`&&r.preview_ready===true&&typeof r.name==='string')&&new Set(p.cosmetic_rewards.map(r=>r.type)).size===p.cosmetic_rewards.length});
  }
  function countdown(){let s=remaining();return `${Math.floor(s/86400)}g ${String(Math.floor(s%86400/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
  function update(){if(!eligible()){clear();return}trigger.hidden=false;trigger.querySelector('small').textContent='Kalan süre: '+countdown();if(overlay)overlay.querySelector('[data-wp-time]').textContent=countdown()}
  async function refresh(force=false){
    if(!syncAccount()||!window.ErisPlatform?.api||pending)return;
    if(!force&&(document.hidden||!home.classList.contains('show')||now()-lastRequest<60000))return;
    const captured=account, rev=++revision, start=now();pending=true;lastRequest=start;
    try{
      const data=await window.ErisPlatform.api('/welcome-packages/status',{method:'GET',cache:'no-store'});
      if(rev!==revision||captured!==token())return;
      if(!valid(data)){clear();return}
      const previous=state?.collection;state=data;deadline=start+data.remaining_seconds*1000;
      if(overlay&&previous!==state.collection)close(false);update();
    }catch(_){if(rev===revision&&captured===token())clear()}
    finally{if(rev===revision)pending=false}
  }
  const labels={frame:'Çerçeve',bubble:'Sohbet balonu',profile:'Profil kartı',entrance:'Oda girişi',title:'Ünvan'};
  function open(){
    if(!syncAccount()||!eligible()||overlay)return;
    priorFocus=document.activeElement;overlay=node('div',undefined,'lwp-overlay');
    overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','lwp-title');
    const head=node('header',undefined,'lwp-head'), headText=node('div');headText.append(node('small','LİDYACHAT • PREMIUM'));const title=node('h2','Hoş Geldin Paketleri');title.id='lwp-title';headText.append(title);
    const x=node('button','×','lwp-close');x.type='button';x.setAttribute('aria-label','Kapat');x.onclick=()=>close();head.append(headText,x);
    const body=node('div',undefined,'lwp-body'), intro=node('div',undefined,'lwp-intro');intro.append(node('strong',state.collection==='male'?'Erkek koleksiyonu':'Kadın koleksiyonu'),node('p','Yeni üyeliğine özel üç farklı koleksiyon. Her seviyeden en fazla bir paket.'));
    const time=node('div',countdown(),'lwp-time');time.dataset.wpTime='';intro.append(time);body.append(intro);
    for(const p of state.packages){const card=node('article',undefined,'lwp-card');card.dataset.tier=p.id;card.append(node('h3',p.name),node('div',number(p.lidya)+' Lidya','lwp-amount'),node('p',p.duration_days+' günlük özel görünüm hakkı'));
      const grid=node('div',undefined,'lwp-rewards');for(const r of p.cosmetic_rewards){const item=node('figure');const img=node('img');img.src='./'+r.preview_asset;img.alt=r.name;img.loading='lazy';item.append(img,node('figcaption',labels[r.type]));grid.append(item)}card.append(grid);
      const buy=node('button','Satış henüz açık değil','lwp-buy');buy.type='button';buy.disabled=true;card.append(node('strong',price(p.price_kurus),'lwp-price'),buy);body.append(card)}
    body.append(node('p','Önizleme fiyatlarıdır. Google Play satış fiyatı ve ödeme doğrulaması henüz etkin değildir.','lwp-note'));
    overlay.append(head,body);overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}else if(e.key==='Tab'){e.preventDefault();x.focus()}});document.body.append(overlay);x.focus();
    refresh(true);
  }
  trigger.addEventListener('click',open);
  function tick(){syncAccount();if(state)update();refresh()}
  window.addEventListener('storage',tick);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
  setInterval(tick,1000);tick();
  window.LidyaWelcomePackages={refresh:()=>refresh(true),close};
})();
