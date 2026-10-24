(() => {
'use strict';
const source=new URL('.',document.currentScript.src);
const assets=new URL('assets/lidya-ranking-v2/',source);
const icon=new URL('assets/lidya-wheel/leaderboard-v1.png',source).href;
const games=[
 ['wheel','Şans Çarkı','Çarkın liderleri','classic'],['crash','Crash','Zirveye yükselenler','classic'],
 ['blackjack','Blackjack','Masanın ustaları','classic'],['slot','Klasik Slot','Hazinenin sahipleri','classic'],
 ['cups','Dört Kupa','Doğru seçimin ödülü','classic'],['horse_race','At Yarışı','Pistin şampiyonları','classic'],
 ['vault','Kasa','Kasayı açanlar','classic'],['dede','Dede','Yıldırımın gücü','slots'],
 ['seker','Şeker Sarayı','Tatlı zaferler','slots'],['balikci','Balıkçı Hasan','Günün büyük avı','slots'],
 ['prenses','Prenses','Yıldızların zirvesi','slots'],['dogparty','Dog Party','Patili zaferler','slots'],
 ['candy','Candy Ultimate','Renkli kazançlar','slots'],['kovboy','Kovboy','Kasabanın liderleri','slots'],
 ['bastet','Bastet’in Hazinesi','Kedilerin hazinesi','slots'],['altin','Altın Şöleni','Dört hazine, tek şölen','slots'],
 ['kure','Kaderin Küresi','Kaderin kazananları','slots'],['firavun','Firavun’un Sırrı','Antik hazinenin izinde','slots'],
 ['aztek','Aztek Hazinesi','Tapınağın zirvesi','slots'],['ares','Ares’in Gazabı','Zaferin gücü','slots']
];
const periods={hour:'Bu saat',day:'Günlük',week:'Haftalık',month:'Aylık'};
const format=value=>Number(value||0).toLocaleString('tr-TR');
const searchKey=value=>String(value).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const theme=()=>document.documentElement.dataset.erisTheme==='dark'?'dark':'light';
function safeAsset(path){
 const value=window.ErisChatCosmetics?.assetUrl?.(path)||path||'';
 if(!value)return '';
 try{const url=new URL(value,location.href);return ['https:','http:','blob:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
let active=null;
const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
for(const type of ['erischat:auth','erischat:auth-state','erischat:auth-ready','erischat:auth-state-changed'])window.addEventListener(type,()=>{if(active&&active.account!==token())active.close()});
function open(selectedGame='wheel'){
 active?.close();
 let game=games.find(row=>row[0]===selectedGame)?.[0]||'wheel';
 const account=token(),valid=()=>alive&&account===token();let alive=true,requestIndex=0,period='hour',view='games',category='all',busy=false,cached=[];
 const previous=document.activeElement,dialog=document.createElement('dialog');
 dialog.className='lgr-dialog';dialog.setAttribute('aria-labelledby','lgr-title');
 dialog.innerHTML=`<header class="lgr-header"><button type="button" class="lgr-back" data-back aria-label="Oyun seçimine dön" hidden>‹</button><div class="lgr-brand"><span class="lgr-monogram" aria-hidden="true">L</span><div><small>LİDYA OYUN SALONU</small><h2 id="lgr-title">Oyun sıralaması</h2></div></div><button type="button" class="lgr-close" data-close aria-label="Sıralamayı kapat">×</button></header>
 <main class="lgr-main"><section class="lgr-menu" aria-label="Oyun seçimi"><div class="lgr-intro"><span class="lgr-eyebrow">LİDERLERİN SAHNESİ</span><h3>Oyunun zirvesini keşfet.</h3><p>Oyununu seç, Lidya kazananlarını gör.</p></div><div class="lgr-tools"><label class="lgr-search"><span aria-hidden="true">⌕</span><input type="search" data-search aria-label="Oyun ara" placeholder="Oyun ara" autocomplete="off"></label><nav class="lgr-categories" aria-label="Oyun kategorisi"><button type="button" data-category="all" aria-pressed="true">Tümü <span>20</span></button><button type="button" data-category="classic" aria-pressed="false">Klasik</button><button type="button" data-category="slots" aria-pressed="false">Slotlar</button></nav></div><div class="lgr-game-grid"></div><p class="lgr-no-games" hidden>Bu aramada oyun bulunamadı.</p><p class="lgr-menu-note">Sıralamalar ödenmiş toplam Lidya kazancına göre hazırlanır.</p></section>
 <section class="lgr-detail" aria-label="Seçilen oyunun sıralaması" hidden><div class="lgr-selected"><img data-selected-art alt=""><div><span class="lgr-eyebrow">OYUN LİDERLERİ</span><h3 data-game-title></h3><p>Ödenmiş toplam Lidya kazancı</p></div><button type="button" data-change>Oyun değiştir</button></div><nav class="lgr-periods" aria-label="Sıralama dönemi"></nav><div class="lgr-list-heading"><span>İLK 50</span><span>Türkiye saati</span></div><div class="lgr-list" role="list" aria-live="polite" aria-busy="false"></div></section></main>
 <footer class="lgr-footer" hidden><div><span>Senin kazancın</span><small data-my-period></small></div><strong data-mine>—</strong><img data-coin alt="Lidya"></footer>`;
 const q=s=>dialog.querySelector(s),all=s=>[...dialog.querySelectorAll(s)];
 const main=q('.lgr-main'),grid=q('.lgr-game-grid');
 const tools=document.createElement('div');tools.className='lgr-tools';const player=document.createElement('input');player.type='search';player.placeholder='İlk 50 içinde oyuncu ara';player.setAttribute('aria-label',player.placeholder);player.style.cssText='box-sizing:border-box;width:100%;min-height:44px;padding:12px;border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-panel);color:var(--ui-ink);font:inherit';const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Yenile';refresh.style.cssText='min-height:44px;border:1px solid var(--ui-line);border-radius:12px;padding:10px;background:var(--ui-raised);color:var(--ui-ink)';refresh.onclick=()=>{if(valid()&&view==='detail'&&!busy)load(period)};const updated=document.createElement('p');updated.setAttribute('role','status');updated.style.cssText='font-size:12px;color:var(--ui-gold)';tools.append(player,refresh,updated);q('.lgr-list-heading').before(tools);player.oninput=()=>{if(valid()&&view==='detail'&&!busy)draw(cached)};
 function close(){
  if(!alive)return;alive=false;requestIndex++;observer.disconnect();
  window.removeEventListener('erischat:theme',syncTheme);
  if(dialog.open)dialog.close();dialog.remove();
  if(active?.dialog===dialog)active=null;
  if(previous?.isConnected)previous.focus({preventScroll:true});
 }
 function syncTheme(){
  if(!alive)return;const t=theme();dialog.dataset.theme=t;
  for(const image of all('img[data-game-art]'))image.src=new URL(t+'/'+image.dataset.gameArt+'.png',assets).href;
  q('[data-selected-art]').src=new URL(t+'/'+game+'.png',assets).href;
  for(const coin of all('img[data-coin]'))coin.src=new URL('assets/lidya-games-png/'+t+'/coin.png',source).href;
 }
 const observer=new MutationObserver(syncTheme);
 observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});
 window.addEventListener('erischat:theme',syncTheme);
 function filter(){
  const term=searchKey(q('[data-search]').value.trim());let count=0;
  for(const button of all('[data-rank-game]')){
   const row=games.find(g=>g[0]===button.dataset.rankGame);
   button.hidden=!(category==='all'||row[3]===category)||!searchKey(row[1]).includes(term);
   if(!button.hidden)count++;
  }
  q('.lgr-no-games').hidden=count>0;
 }
 for(const [id,name,tag] of games){
  const button=document.createElement('button');button.type='button';button.className='lgr-game-card';
  button.dataset.rankGame=id;button.setAttribute('aria-label',name+' sıralamasını aç');
  button.setAttribute('aria-pressed',String(id===game));
  const art=document.createElement('img');art.className='lgr-card-art';art.dataset.gameArt=id;art.alt='';art.decoding='async';art.loading='lazy';art.draggable=false;
  const copy=document.createElement('span');copy.className='lgr-card-copy';
  const title=document.createElement('strong');title.textContent=name;
  const subtitle=document.createElement('span');subtitle.textContent=tag;
  const action=document.createElement('span');action.className='lgr-card-action';action.textContent='Sıralamayı gör';
  const arrow=document.createElement('span');arrow.className='lgr-card-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='›';
  copy.append(title,subtitle,action);button.append(art,copy,arrow);
  button.onclick=()=>{if(valid()){game=id;showDetail();}};grid.append(button);
 }
 function showMenu(){
  if(!valid())return;
  view='games';requestIndex++;busy=false;refresh.disabled=false;q('.lgr-menu').hidden=false;q('.lgr-detail').hidden=true;
  q('.lgr-footer').hidden=true;q('[data-back]').hidden=true;q('#lgr-title').textContent='Oyun sıralaması';
  main.scrollTop=0;
  const selected=q('[data-rank-game="'+game+'"]');
  (selected&&!selected.hidden?selected:q('[data-search]')).focus({preventScroll:true});
 }
 function showDetail(){
  if(!valid())return;player.value='';
  view='detail';q('.lgr-menu').hidden=true;q('.lgr-detail').hidden=false;q('.lgr-footer').hidden=false;q('[data-back]').hidden=false;
  const name=games.find(row=>row[0]===game)[1];q('#lgr-title').textContent=name;q('[data-game-title]').textContent=name;
  for(const button of all('[data-rank-game]'))button.setAttribute('aria-pressed',String(button.dataset.rankGame===game));
  syncTheme();main.scrollTop=0;q('[data-back]').focus({preventScroll:true});load(period);
 }
 function empty(text,retry=false){
  const box=document.createElement('div');box.className='lgr-empty';
  const mark=document.createElement('span');mark.className='lgr-empty-mark';mark.setAttribute('aria-hidden','true');mark.textContent=retry?'↻':'✧';
  const message=document.createElement('p');message.textContent=text;box.append(mark,message);
  if(retry){const button=document.createElement('button');button.type='button';button.textContent='Tekrar dene';button.onclick=()=>load(period);box.append(button);}
  q('.lgr-list').replaceChildren(box);
 }
 async function load(nextPeriod){
  if(!valid()||view!=='detail'||busy&&nextPeriod===period)return;if(nextPeriod!==period)player.value='';busy=true;cached=[];refresh.disabled=true;updated.textContent='';period=nextPeriod;const index=++requestIndex,currentGame=game,list=q('.lgr-list');
  for(const button of all('[data-period]'))button.setAttribute('aria-pressed',String(button.dataset.period===period));
  q('[data-mine]').textContent='—';q('[data-my-period]').textContent=periods[period];list.setAttribute('aria-busy','true');empty('Sıralama yükleniyor…');
  try{
   const data=await window.ErisPlatform.api('/games/'+currentGame+'/leaderboard?period='+period);
   if(!valid()||view!=='detail'||index!==requestIndex)return;
   if(!data||!Array.isArray(data.items))throw Error('Sıralama şu anda görüntülenemiyor.');
   q('[data-mine]').textContent=format(data.my_winnings);cached=data.items.slice(0,50);draw(cached);updated.textContent='Son yenileme: '+new Date().toLocaleTimeString('tr-TR');
  }catch(error){if(valid()&&view==='detail'&&index===requestIndex)empty(error.message||'Sıralama yüklenemedi.',true);}
  finally{if(valid()&&index===requestIndex){busy=false;refresh.disabled=false;list.setAttribute('aria-busy','false');}}
 }
 function draw(items){if(!valid())return;const list=q('.lgr-list'),term=searchKey(player.value.trim()),rows=items.filter(r=>searchKey(r.nickname||'Kullanıcı').includes(term));list.replaceChildren();
   if(!rows.length){empty(player.value.trim()?'Bu aramada oyuncu bulunamadı.':'Bu dönemde henüz kazanan yok.');return;}
   for(const row of rows){
    const entry=document.createElement('article');entry.className='lgr-row';entry.setAttribute('role','listitem');entry.dataset.rank=row.rank;
    const rank=document.createElement('b');rank.className='lgr-rank';rank.textContent=String(row.rank??'—');rank.setAttribute('aria-label',String(row.rank??'')+'. sıra');
    const portrait=document.createElement('span');portrait.className='lgr-portrait';
    const fallback=document.createElement('span');fallback.className='lgr-avatar-fallback';fallback.textContent=row.avatar||String(row.nickname||'L').trim().slice(0,1).toLocaleUpperCase('tr-TR');portrait.append(fallback);
    const avatar=safeAsset(row.avatar_asset),frame=safeAsset(row.frame_asset);
    if(avatar){const image=document.createElement('img');image.className='lgr-avatar';image.src=avatar;image.alt='';image.loading='lazy';image.onerror=()=>image.remove();portrait.append(image);}
    if(frame){const image=document.createElement('img');image.className='lgr-frame';image.src=frame;image.alt='';image.loading='lazy';image.onerror=()=>image.remove();portrait.append(image);}
    const name=document.createElement('button');name.type='button';name.className='lgr-name';name.textContent=row.nickname||'Kullanıcı';name.title=row.nickname||'Kullanıcı';
    name.disabled=!row.user_id;name.onclick=()=>{if(valid()&&row.user_id&&window.openUserProfile){close();window.openUserProfile(row.user_id);}};
    const prize=document.createElement('span');prize.className='lgr-prize';
    const amount=document.createElement('b');amount.textContent=format(row.winnings);
    const coin=document.createElement('img');coin.dataset.coin='';coin.src=q('[data-coin]').src;coin.alt='Lidya';prize.append(amount,coin);
    entry.append(rank,portrait,name,prize);list.append(entry);
   }
 }
 for(const [id,label] of Object.entries(periods)){
  const button=document.createElement('button');button.type='button';button.dataset.period=id;button.textContent=label;button.setAttribute('aria-pressed',String(id===period));button.onclick=()=>load(id);q('.lgr-periods').append(button);
 }
 q('[data-search]').oninput=filter;
 for(const button of all('[data-category]'))button.onclick=()=>{category=button.dataset.category;for(const b of all('[data-category]'))b.setAttribute('aria-pressed',String(b===button));filter();};
 q('[data-close]').onclick=close;q('[data-back]').onclick=showMenu;q('[data-change]').onclick=showMenu;
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(view==='detail')showMenu();else close();});
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 dialog.addEventListener('close',close);
 document.body.append(dialog);syncTheme();dialog.showModal();active={close,dialog,account};q('[data-close]').focus();
}
window.LidyaGameRanking={open,close:()=>active?.close(),icon};
})();

