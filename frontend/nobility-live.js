(()=>{
'use strict';

const catalog=window.LidyaNobilityCatalog;
const details=window.LidyaNobilityDetails;

if(!catalog||!details)return;

const ranks=catalog.ranks;
const privileges=catalog.privileges;

const symbols=[
 '⚔','♜','⚜','♛'
];

const icons={
 badge:'♜',
 frame:'◎',
 entrance:'▶',
 region_background:'✦',
 room_frame:'▣',
 super_avatar:'♛',
 online_priority:'⇧',
 gift_banner:'🎁',
 activation_banner:'✧',
 kick_protection:'⛨',
 gift_bonus:'◈',
 daily_banner:'☀',
 room_welcome:'✉',
 animated_avatar:'◉',
 couple_repair:'♡',
 super_kick:'⚡'
};

let root=null;
let selected=0;
let detailIndex=-1;
let previousFocus=null;
let detailTrigger=null;

let accountData=null;
let accountSnapshot=null;
let accountController=null;
let accountTimer=null;
let accountState='loading';

function stopAccount(){
 stopFinancial();
 closeConfirmation();
 closeHistory();
 accountController?.abort();
 accountController=null;
 clearInterval(accountTimer);
 accountTimer=null;
 accountData=null;
 accountSnapshot=null;
}


let historyController=null;
let historyOffset=0;

function closeHistory(){
 historyController?.abort();
 historyController=null;
 root?.querySelector('.ln-history')?.remove();
 historyOffset=0;
}

async function loadHistory(panel,append=false){
 if(!accountSnapshot||!accountData)return;

 historyController?.abort();

 const controller=new AbortController();
 const snapshot=accountSnapshot;
 const api=window.LidyaNobilityAPI;

 historyController=controller;

 const list=panel.querySelector('.ln-history-list');
 const status=panel.querySelector('.ln-history-status');
 const more=panel.querySelector('[data-history-more]');

 more.hidden=true;
 status.textContent='Yükleniyor...';

 try{
  const data=await api.history(
   snapshot,historyOffset,controller.signal
  );

  if(controller.signal.aborted||
     historyController!==controller||
     !panel.isConnected||
     !api.sameSession(snapshot))return;

  if(!Array.isArray(data.items)){
   throw new Error('Invalid history');
  }

  if(!append)list.replaceChildren();

  for(const item of data.items){
   const row=document.createElement('div');
   row.className='ln-history-row';

   const info=document.createElement('div');
   const title=document.createElement('strong');
   const date=document.createElement('small');
   const amount=document.createElement('strong');

   const value=BigInt(item.amount);

   title.textContent=value>0n
    ?'Asalet puanı kazanımı'
    :'Asalet puanı düşümü';

   date.textContent=new Date(
    item.created_at
   ).toLocaleString('tr-TR');

   amount.textContent=
    (value>0n?'+':'')+
    value.toLocaleString('tr-TR');

   amount.className=value>0n
    ?'ln-history-credit'
    :'ln-history-debit';

   info.append(title,date);
   row.append(info,amount);
   list.append(row);
  }

  status.textContent=list.children.length
   ?'':'Henüz asalet işleminiz bulunmuyor.';

  if(data.has_more&&
     Number.isInteger(data.next_offset)&&
     data.next_offset>historyOffset&&
     data.next_offset<=10000){

   historyOffset=data.next_offset;
   more.textContent='Daha Fazla Göster';
   more.hidden=false;
  }

 }catch(_){
  if(controller.signal.aborted||
     historyController!==controller||
     !panel.isConnected)return;

  status.textContent='İşlem geçmişi alınamadı.';
  more.textContent='Yeniden Dene';
  more.hidden=false;
 }
}

function openHistory(){
 if(!root||!accountData||!accountSnapshot)return;

 if(!window.LidyaNobilityAPI.sameSession(accountSnapshot)){
  close();
  return;
 }

 closeHistory();

 const panel=document.createElement('div');
 panel.className='ln-history';
 panel.setAttribute('role','dialog');
 panel.setAttribute('aria-label','Asalet İşlem Geçmişim');

 panel.innerHTML=`
 <header class="ln-header">
 <button data-history-close aria-label="Geri">‹</button>
 <strong>Asalet İşlem Geçmişim</strong>
 <span></span>
 </header>
 <div class="ln-history-list"></div>
 <p class="ln-history-status" aria-live="polite"></p>
 <button data-history-more hidden>Daha Fazla Göster</button>
 `;

 root.append(panel);

 panel.querySelector('[data-history-close]').onclick=closeHistory;
 panel.querySelector('[data-history-more]').onclick=()=>{
  loadHistory(panel,true);
 };

 loadHistory(panel);
}

function formatPoints(value){
 if(!/^\d+$/.test(String(value)))return '—';
 return BigInt(value).toLocaleString('tr-TR');
}

let confirmation=null;
let financialController=null;
let pendingRecord=null;
let financialNotice='';

function financialBusy(){
 return Boolean(
  financialController||
  window.LidyaNobilitySubmit?.busy?.()
 );
}

function financialAvailable(){
 const service=window.LidyaNobilitySubmit;

 return Boolean(
  service&&
  typeof service.busy==='function'&&
  typeof service.supported==='function'&&
  service.supported()===true&&
  typeof service.submit==='function'&&
  typeof service.recover==='function'&&
  typeof service.cancel==='function'
 );
}

function stopFinancial(){
 financialController?.abort();
 financialController=null;
 closePending();
}

function closePending(){
 pendingRecord=null;

 if(!root)return;

 const panel=root.querySelector('.ln-pending');

 if(panel&&!panel.hidden){
  panel.hidden=true;
  root.querySelector('[data-nobility-action]')?.focus();
 }
}

function samePendingRecord(a,b){
 return Boolean(a&&b&&[
  'version','userId','action','rank',
  'requestId','cost','revision','createdAt'
 ].every(field=>a[field]===b[field]));
}

function refreshPendingControls(){
 if(!root||financialBusy())return;

 const panel=root.querySelector('.ln-pending');

 if(!panel||panel.hidden)return;

 const pending=pendingStatus(accountSnapshot);

 const valid=
  pending.kind==='pending'&&
  samePendingRecord(pending.record,pendingRecord)&&
  financialAvailable();

 panel.querySelector('[data-pending-cancel]').disabled=
  !valid;

 panel.querySelector('[data-pending-recover]').disabled=
  !valid||
  accountState!=='ready'||
  accountData?.me?.enabled!==true||
  accountData?.me?.configuration_valid!==true||
  accountData?.catalog?.enabled!==true;

 panel.querySelector('[data-pending-later]').disabled=false;

 if(!valid){
  panel.querySelector('.ln-pending-status').textContent=
   'Bekleyen işlem bilgileri değişti. Pencereyi yeniden açın.';
 }
}

function openPending(){
 if(!root||financialBusy()||!financialAvailable())return;

 const pending=pendingStatus(accountSnapshot);

 if(pending.kind!=='pending'){
  renderAction();
  return;
 }

 const panel=root.querySelector('.ln-pending');

 if(!panel)return;

 const record=pending.record;
 const rank=ranks.find(item=>item.id===record.rank);

 if(!rank)return;

 const labels={
  activate:'Asalet etkinleştirme',
  upgrade:'Asalet yükseltme',
  renew:'Asalet yenileme'
 };

 pendingRecord=record;

 panel.querySelector('.ln-pending-action').textContent=
  labels[record.action];

 panel.querySelector('.ln-pending-rank').textContent=
  rank.name;

 panel.querySelector('.ln-pending-cost').textContent=
  formatPoints(record.cost)+' puan';

 panel.querySelector('.ln-pending-status').textContent=
  financialNotice||'Önceki işlemin sonucu doğrulanamadı.';

 panel.querySelector('[data-pending-recover]').disabled=
  accountState!=='ready'||
  accountData?.me?.enabled!==true||
  accountData?.catalog?.enabled!==true;

 panel.querySelector('[data-pending-cancel]').disabled=false;
 panel.querySelector('[data-pending-later]').disabled=false;

 panel.hidden=false;

 refreshPendingControls();

 panel.querySelector('[data-pending-later]').focus();
}

async function runFinancial(mode){
 if(!root||financialBusy()||!financialAvailable())return;

 if(!['submit','recover','cancel'].includes(mode))return;

 const screen=root;
 const snapshot=accountSnapshot;
 const api=window.LidyaNobilityAPI;
 const service=window.LidyaNobilitySubmit;

 if(!api?.sameSession(snapshot)){
  close();
  return;
 }

 const panel=root.querySelector(
  mode==='submit'?'.ln-confirm':'.ln-pending'
 );

 if(!panel||panel.hidden)return;

 const status=panel.querySelector(
  mode==='submit'
   ?'.ln-confirm-status'
   :'.ln-pending-status'
 );

 let state=null;
 let record=null;

 if(mode==='submit'){
  state=confirmedState();

  if(!state){
   status.textContent='Onay bilgileri değişti. Yeniden kontrol edin.';
   panel.querySelector('[data-confirm-submit]').disabled=true;
   return;
  }
 }else{
  const pending=pendingStatus(snapshot);

  if(pending.kind!=='pending'||
     !samePendingRecord(pending.record,pendingRecord)){
   status.textContent='Bekleyen işlem doğrulanamadı.';
   refreshPendingControls();
   return;
  }

  record=pendingRecord;

  if(mode==='recover'&&(
   accountState!=='ready'||
   accountData?.me?.enabled!==true||
   accountData?.me?.configuration_valid!==true||
   accountData?.catalog?.enabled!==true
  )){
   status.textContent='Yeniden gönderim şu anda kullanılamıyor.';
   return;
  }
 }

 const controller=new AbortController();

 financialController=controller;
 financialNotice='';

 panel.querySelectorAll('button').forEach(
  button=>{button.disabled=true;}
 );

 status.textContent='İşlem doğrulanıyor. Lütfen bekleyin.';

 renderAction();

 let result=null;
 let failed=false;

 try{
  if(mode==='submit'){
   result=await service.submit(
    snapshot,state,controller.signal
   );
  }else if(mode==='recover'){
   result=await service.recover(
    snapshot,record,controller.signal
   );
  }else{
   result=await service.cancel(
    snapshot,record,controller.signal
   );
  }
 }catch(_){
  failed=true;
 }finally{
  if(financialController===controller){
   financialController=null;
  }
 }

 if(root!==screen||
    accountSnapshot!==snapshot||
    controller.signal.aborted)return;

 if(!api.sameSession(snapshot)){
  close();
  return;
 }

 closeConfirmation();
 closePending();

 if(failed){
  const pending=pendingStatus(snapshot);

  financialNotice=pending.kind==='pending'
   ?'İşlem sonucu doğrulanamadı. Bekleyen kayıt korunuyor.'
   :'İşlem doğrulanamadı. Güncel bilgileri kontrol edin.';

  window.toast?.(financialNotice);

  if(pending.kind==='pending'){
   renderAction();
   openPending();
   return;
  }

  loadAccount();
  return;
 }

 if(mode==='cancel'){
  financialNotice=result.status==='cancelled'
   ?'Bekleyen işlem iptal edildi.'
   :'İşlem daha önce tamamlanmış. Geri alınmadı.';
 }else{
  financialNotice='Asalet işlemi başarıyla doğrulandı.';
 }

 window.toast?.(financialNotice);

 if(api.sameSession(snapshot)){
  Promise.resolve()
   .then(()=>window.ErisProfile?.refresh?.())
   .then(user=>{
    if(user&&api.sameSession(snapshot)){
     window.dispatchEvent(new CustomEvent(
      'erischat:profile',{detail:user}
     ));
    }
   })
   .catch(error=>console.warn(
    '[LidyaChat] Nobility profile refresh',error
   ));
 }

 loadAccount();
}


function pendingStatus(snapshot){
 try{
  const api=window.LidyaNobilityAPI;
  const pending=window.LidyaNobilityPending;

  if(!api?.sameSession(snapshot)||!pending){
   return {kind:'unavailable'};
  }

  const record=pending.read(snapshot.userId);

  return record
   ?{kind:'pending',record}
   :{kind:'clear'};

 }catch(_){
  return {kind:'unavailable'};
 }
}

function confirmedState(){
 if(!root||
    accountState!=='ready'||
    !confirmation||
    confirmation.snapshot!==accountSnapshot){
  return null;
 }

 const api=window.LidyaNobilityAPI;

 if(!api?.sameSession(accountSnapshot)){
  return null;
 }

 if(pendingStatus(accountSnapshot).kind!=='clear'){
  return null;
 }

 const state=window.LidyaNobilityActionState?.resolve(
  accountData,ranks[selected].id
 );

 if(!state||
    state.kind!=='action'||
    state.enabled!==true){
  return null;
 }

 for(const field of [
  'action','rank','cost','revision',
  'balance','remaining'
 ]){
  if(state[field]!==confirmation[field]){
   return null;
  }
 }

 if(accountData.me.rank!==confirmation.currentRank||
    accountData.me.expires_at!==confirmation.expiry){
  return null;
 }

 return state;
}

function closeConfirmation(){
 confirmation=null;

 if(!root)return;

 const panel=root.querySelector('.ln-confirm');

 if(panel&&!panel.hidden){
  panel.hidden=true;

  root.querySelector(
   '[data-nobility-action]'
  )?.focus();
 }
}

function openConfirmation(){
 if(!root||accountState!=='ready'||
    financialBusy()||!financialAvailable())return;

 const api=window.LidyaNobilityAPI;

 if(!api?.sameSession(accountSnapshot)){
  close();
  return;
 }

 const state=window.LidyaNobilityActionState?.resolve(
  accountData,ranks[selected].id
 );

 if(state?.kind!=='action')return;

 if(pendingStatus(accountSnapshot).kind!=='clear'){
  renderAction();
  return;
 }

 const panel=root.querySelector('.ln-confirm');

 if(!panel)return;

 const titles={
  activate:'Asalet Etkinleştirme',
  upgrade:'Asalet Yükseltme',
  renew:'Asalet Yenileme'
 };

 const labels={
  activate:'Onayla ve Etkinleştir',
  upgrade:'Onayla ve Yükselt',
  renew:'Onayla ve Yenile'
 };

 const descriptions={
  activate:'Asalet üyeliğiniz 30 gün boyunca geçerli olacaktır.',
  upgrade:'Tam sınıf bedeli kesilir. Yeni üyelik süreniz 30 gün olarak başlar.',
  renew:'Mevcut üyelik sürenize 30 gün eklenir.'
 };

 const set=(selector,value)=>{
  panel.querySelector(selector).textContent=value;
 };

 confirmation=Object.freeze({
  snapshot:accountSnapshot,
  action:state.action,
  rank:state.rank,
  cost:state.cost,
  revision:state.revision,
  balance:state.balance,
  remaining:state.remaining,
  currentRank:accountData.me.rank,
  expiry:accountData.me.expires_at
 });

 set('.ln-confirm-title',titles[state.action]);

 set('.ln-confirm-rank',ranks[selected].name);

 set('.ln-confirm-current',
  accountData.me.rank_name
 );

 set('.ln-confirm-target',ranks[selected].name);

 set('.ln-confirm-balance',
  formatPoints(state.balance)
 );

 set('.ln-confirm-cost',
  formatPoints(state.cost)
 );

 set('.ln-confirm-remaining',
  formatPoints(state.remaining)
 );

 set('.ln-confirm-description',
  descriptions[state.action]
 );

 set('.ln-confirm-duration',
  state.action==='renew'?'+30 gün':'30 gün'
 );

 set('[data-confirm-submit]',
  labels[state.action]
 );

 renderAsset(
  panel.querySelector('.ln-confirm-emblem'),
  ranks[selected],
  'crest',
  symbols[selected]
 );

 panel.querySelectorAll('button').forEach(
  button=>{button.disabled=false;}
 );

 panel.querySelector('.ln-confirm-status').textContent=
  'Onayladığınızda belirtilen Asalet puanı harcanacaktır.';

 panel.querySelector(
  '[data-confirm-submit]'
 ).disabled=!confirmedState()||
  financialBusy()||!financialAvailable();

 panel.hidden=false;

 panel.querySelector(
  '[data-confirm-cancel]'
 ).focus();
}

function renderAction(){
 if(!root)return;

 const button=root.querySelector('[data-nobility-action]');
 const note=root.querySelector('.ln-action-note');

 if(!button||!note)return;

 button.disabled=true;
 button.textContent='Şu Anda Kullanılamıyor';
 note.textContent='';

 if(financialBusy()){
  button.textContent='İşlem Doğrulanıyor…';
  return;
 }

 if(window.LidyaNobilityAPI?.sameSession(accountSnapshot)){
  const pending=pendingStatus(accountSnapshot);

  if(pending.kind==='pending'){
   button.textContent='Bekleyen Asalet İşlemi';
   note.textContent=
    'Önceki işlemin sonucu doğrulanmalıdır.';
   button.disabled=!financialAvailable();
   return;
  }

  if(pending.kind!=='clear'){
   button.textContent='İşlem Güvenliği Sağlanamadı';
   note.textContent=
    'Yeni işlem şu anda başlatılamıyor.';
   return;
  }
 }

 if(accountState!=='ready'||!accountData){
  button.textContent=accountState==='loading'
   ?'Yükleniyor…'
   :'Asalet Bilgileri Alınamadı';
  return;
 }

 if(!window.LidyaNobilityAPI?.sameSession(accountSnapshot)){
  return;
 }

 if(!financialAvailable()){
  note.textContent='Finansal işlem bağlantısı kullanılamıyor.';
  return;
 }

 const state=window.LidyaNobilityActionState?.resolve(
  accountData,ranks[selected].id
 );

 if(!state)return;

 const labels={
  activate:'Asaleti Etkinleştir',
  upgrade:'Asaleti Yükselt',
  renew:'Asaleti Yenile'
 };

 if(state.kind==='unavailable'){
  if(state.reason==='higher_rank_active'){
   button.textContent='Mevcut Asaletiniz Daha Yüksek';
  }else if(state.reason==='refresh_required'){
   button.textContent='Üyelik Bilgilerini Yenile';
   button.disabled=false;
  }

  return;
 }

 const bar=root.querySelector('.ln-progress-fill');

 if(bar)bar.style.width=state.progress+'%';

 if(state.kind==='topup'){
  button.textContent='Lidya Yükle';
  button.disabled=
   typeof window.ErisPurchases?.open!=='function';

  note.textContent=
   'Eksik puan: '+formatPoints(state.missing);

  return;
 }

 button.textContent=labels[state.action];

 note.textContent=
  'İşlem bedeli: '+formatPoints(state.cost)+' puan';

 button.disabled=false;
}

function renderAccount(){
 try{
 if(!root)return;

 const footer=root.querySelector('.ln-footer');
 if(!footer)return;

 const set=(selector,value)=>{
  footer.querySelector(selector).textContent=value;
 };

 const bar=footer.querySelector('.ln-progress-fill');
 const retry=footer.querySelector('[data-account-retry]');

 bar.style.width='0%';
 retry.hidden=accountState!=='error';
 footer.querySelector('[data-history-open]').hidden=
  accountState!=='ready';

 set('.ln-current-rank','—');
 set('.ln-account-points','—');
 set('.ln-account-expiry','');

 if(accountState==='loading'){
  set('.ln-account-status','Asalet bilgileri yükleniyor...');
  return;
 }

 if(accountState==='error'||!accountData){
  set('.ln-account-status','Asalet bilgileri alınamadı.');
  return;
 }

 const {catalog:serverCatalog,me}=accountData;

 set('.ln-current-rank',me.rank_name);
 set('.ln-account-points',formatPoints(me.points));

 if(me.active&&me.expires_at){
  const remaining=Date.parse(me.expires_at)-Date.now();

  if(Number.isFinite(remaining)&&remaining>0){
   const hours=Math.ceil(remaining/3600000);
   set('.ln-account-expiry',
    'Kalan süre: '+Math.floor(hours/24)+' gün '+hours%24+' saat'
   );
  }
 }

 if(!serverCatalog.enabled||!me.enabled){
  set('.ln-account-status','Asalet sistemi henüz aktif değil.');
  return;
 }

 const target=serverCatalog.ranks.find(
  item=>item.rank===ranks[selected].id
 );

 if(!target?.available){
  set('.ln-account-status','Bu rütbenin kazanma şartları henüz açıklanmadı.');
  return;
 }

 if(me.rank>=target.rank){
  set('.ln-account-status','Bu rütbe seviyesine ulaştınız.');
  bar.style.width='100%';
  return;
 }

 try{
  const points=BigInt(me.points);
  const required=BigInt(target.required_points);

  if(points<0n||required<=0n)throw new Error();

  const percent=points>=required
   ?100:Number(points*10000n/required)/100;

  bar.style.width=percent+'%';

  set('.ln-account-status',
   target.name+' hedefi: '+formatPoints(required)+' puan'
  );
 }catch(_){
  set('.ln-account-status','Hedef puan bilgisi alınamadı.');
 }
 }finally{
  renderAction();
  refreshPendingControls();
 }
}

async function loadAccount(){
 stopAccount();

 const screen=root;
 const controller=new AbortController();

 accountController=controller;
 accountState='loading';
 renderAccount();

 try{
  const api=window.LidyaNobilityAPI;
  const snapshot=api.session();

  accountSnapshot=snapshot;
  renderAction();

  accountTimer=setInterval(()=>{
   if(!api.sameSession(snapshot)){
    close();
   }
  },250);

  const data=await api.load(snapshot,controller.signal);

  if(root!==screen||
     accountController!==controller||
     controller.signal.aborted)return;

  if(!api.sameSession(snapshot)){
   close();
   return;
  }

  if(!Array.isArray(data.catalog.ranks)||
     !/^\d+$/.test(String(data.me.points))){
   throw new Error('Invalid account data');
  }

  accountData=data;
  accountState='ready';
  renderAccount();

 }catch(_){
  if(root!==screen||
     accountController!==controller||
     controller.signal.aborted)return;

  controller.abort();
  accountData=null;
  accountState='error';
  renderAccount();
 }
}


function closeDetail(){
 if(!root)return;
 root.querySelector('.ln-detail').hidden=true;
 detailIndex=-1;
 detailTrigger?.focus();
}

function close(){
 stopAccount();
 financialNotice='';
 window.LidyaNobilityEntrance?.close();

 if(!root)return;
 root.remove();
 root=null;
 detailIndex=-1;
 previousFocus?.focus();
}

function card(p){
 const available=p.minRank<=ranks[selected].id;

 return `
 <button type="button"
 class="ln-feature ${available?'':'ln-locked'}"
 data-privilege="${p.id}">
 <span class="ln-feature-icon">
 ${icons[p.id]}
 </span>
 <span>${p.title}</span>
 ${available?'':'<small>🔒</small>'}
 </button>`;
}


const assetRequests=new WeakMap();

function renderAsset(target,rank,id,fallback){
 if(!target)return;

 const token=Symbol();
 assetRequests.set(target,token);

 target.textContent=fallback||'';

 const src=window.LidyaNobilityAssets?.resolve(rank,id);
 if(!src)return;

 const img=document.createElement('img');
 img.className='ln-premium-art';
 img.alt='';
 img.decoding='async';

 img.onload=()=>{
  if(!target.isConnected||
     assetRequests.get(target)!==token)return;
  target.replaceChildren(img);
 };

 img.onerror=()=>{
  if(!target.isConnected||
     assetRequests.get(target)!==token)return;
  target.textContent=fallback||'';
 };

 img.src=src;
}

function render(){
 if(!root)return;

 const r=ranks[selected];
 const available=catalog.forRank(r.id);

 root.style.setProperty('--ln-accent',r.color);

 root.querySelectorAll('[data-rank]').forEach((b,i)=>{
  b.setAttribute('aria-selected',String(i===selected));
 });

 renderAsset(
 root.querySelector('.ln-emblem'),
 r.id,'crest',symbols[selected]
 );

 root.querySelector('.ln-rank-title').textContent=
 r.name.toLocaleUpperCase('tr-TR');

 root.querySelector('.ln-count').textContent=
 'Dahil Edilen Ayrıcalıklar '+available.length+'/16';

 const visual=privileges.filter(
 p=>p.category==='appearance'
 );

 const extra=privileges.filter(
 p=>p.category==='privilege'
 );

 root.querySelector('.ln-visual-count').textContent=
 'Özel Görünümler ('+
 visual.filter(p=>p.minRank<=r.id).length+'/6)';

 root.querySelector('.ln-extra-count').textContent=
 'Özel Ayrıcalıklar ('+
 extra.filter(p=>p.minRank<=r.id).length+'/10)';

 root.querySelector('.ln-visual-grid').innerHTML=
 visual.map(card).join('');

 root.querySelector('.ln-extra-grid').innerHTML=
 extra.map(card).join('');

 root.querySelectorAll('[data-privilege]').forEach(b=>{
  const id=b.dataset.privilege;
  renderAsset(
   b.querySelector('.ln-feature-icon'),
   r.id,id,icons[id]
  );
 });
}

function showDetail(index){
 if(!root)return;

 detailIndex=(index+privileges.length)%
 privileges.length;

 const p=privileges[detailIndex];
 const r=ranks[selected];
 const available=p.minRank<=r.id;
 const panel=root.querySelector('.ln-detail');

 panel.hidden=false;

 panel.querySelector('.ln-detail-title').textContent=
 p.title;

 renderAsset(
 panel.querySelector('.ln-detail-art'),
 r.id,p.id,icons[p.id]
 );

 panel.querySelector('.ln-detail-text').textContent=
 details[p.id];

 panel.querySelector('.ln-preview-play')?.remove();
 panel.querySelector('.ln-nobility-request')?.remove();

 if(['animated_avatar','couple_repair'].includes(p.id)
    &&r.id===4){

  const button=document.createElement('button');

  button.type='button';
  button.className='ln-preview-play ln-nobility-request';

  button.textContent=p.id==='animated_avatar'
   ?'Resmi Ekibe Başvur'
   :'Onarım Başvurusu';

  button.onclick=()=>{
   const support=window.ErisSupport;

   if(typeof support?.openNobilityRequest!=='function'){
    window.toast?.('Destek merkezi şu anda kullanılamıyor.');
    return;
   }

   close();
   support.openNobilityRequest(p.id);
  };

  panel.querySelector('.ln-detail-status').after(button);
 }


 if(p.id==='entrance'){
  const button=document.createElement('button');
  button.type='button';
  button.className='ln-preview-play';
  button.textContent='▶ Ön İzlemeyi Oynat';

  button.onclick=async()=>{
   button.disabled=true;

   try{
    const me=await window.ErisAuth.getMe();

    if(!button.isConnected||
       panel.hidden||
       privileges[detailIndex]?.id!=='entrance'||
       ranks[selected].id!==r.id)return;

    window.LidyaNobilityEntrance?.play(
     r.id,me.nickname
    );
   }catch(e){
    if(button.isConnected&&!panel.hidden&&
       ranks[selected].id===r.id){
     window.LidyaNobilityEntrance?.play(
      r.id,'LidyaChat'
     );
    }
   }finally{
    button.disabled=false;
   }
  };

  panel.querySelector('.ln-detail-art')
   .after(button);
 }


 panel.querySelector('.ln-detail-status').textContent=
 available
 ? 'Bu seviyeye dahil'
 : 'Gerekli seviye: '+ranks[p.minRank-1].name;

 panel.querySelector('.ln-detail-position').textContent=
 (detailIndex+1)+' / '+privileges.length;

 panel.querySelector('.ln-detail-art')
 .classList.toggle('ln-locked',!available);
}

function open(){
 if(root)return;

 previousFocus=document.activeElement;
 selected=0;

 root=document.createElement('section');
 root.className='ln-screen';
 root.setAttribute('role','dialog');
 root.setAttribute('aria-modal','true');
 root.setAttribute('aria-label','Lidya Asaleti');

 root.innerHTML=`
 <header class="ln-header">
 <button data-close aria-label="Geri">‹</button>
 <strong>Lidya Asaleti</strong>
 <button data-info aria-label="Bilgi">?</button>
 </header>

 <nav class="ln-tabs" role="tablist">
 ${ranks.map((r,i)=>`
 <button role="tab" data-rank="${i}">
 ${r.name}</button>`).join('')}
 </nav>

 <main class="ln-content">
 <section class="ln-hero">
 <div class="ln-emblem"></div>
 <h2 class="ln-rank-title"></h2>
 <p class="ln-count"></p>
 </section>

 <section class="ln-section">
 <h3 class="ln-visual-count"></h3>
 <div class="ln-grid ln-visual-grid"></div>
 </section>

 <section class="ln-section">
 <h3 class="ln-extra-count"></h3>
 <div class="ln-grid ln-extra-grid"></div>
 </section>
 </main>

 <footer class="ln-footer">
 <div class="ln-account-row">
 <strong>Mevcut Asaletim</strong>
 <span class="ln-current-rank">—</span>
 </div>
 <div class="ln-account-row">
 <small>Asalet Puanlarım</small>
 <strong class="ln-account-points">—</strong>
 </div>
 <small class="ln-account-expiry"></small>
 <div class="ln-progress">
 <div class="ln-progress-fill"></div>
 </div>
 <small class="ln-account-status" aria-live="polite"></small>
 <button type="button"
 class="ln-action-button"
 data-nobility-action disabled>
 Yükleniyor…
 </button>
 <small class="ln-action-note"
 aria-live="polite"></small>

 <button type="button" data-account-retry hidden>
 Yeniden Dene
 </button>
 <button type="button" data-history-open hidden>
 Asalet İşlem Geçmişim
 </button>
 </footer>

 <div class="ln-confirm" hidden>
 <section class="ln-confirm-sheet"
 role="dialog"
 aria-modal="true"
 aria-labelledby="ln-confirm-heading">

 <button type="button"
 class="ln-confirm-close"
 data-confirm-cancel
 aria-label="Kapat">×</button>

 <div class="ln-confirm-emblem"></div>

 <h2 class="ln-confirm-rank"></h2>

 <h3 id="ln-confirm-heading"
 class="ln-confirm-title"></h3>

 <div class="ln-confirm-summary">

 <div>
 <span>Mevcut Asalet</span>
 <strong class="ln-confirm-current"></strong>
 </div>

 <div>
 <span>Seçilen Asalet</span>
 <strong class="ln-confirm-target"></strong>
 </div>

 <div>
 <span>Mevcut puan</span>
 <strong class="ln-confirm-balance"></strong>
 </div>

 <div>
 <span>Kesilecek puan</span>
 <strong class="ln-confirm-cost"></strong>
 </div>

 <div>
 <span>Kalan puan</span>
 <strong class="ln-confirm-remaining"></strong>
 </div>

 <div>
 <span>Üyelik süresi</span>
 <strong class="ln-confirm-duration"></strong>
 </div>

 </div>

 <p class="ln-confirm-description"></p>

 <small class="ln-confirm-status"
 aria-live="polite">
 İşlem bağlantısı hazırlanıyor.
 </small>

 <button type="button"
 class="ln-action-button"
 data-confirm-submit disabled>
 Onayla
 </button>

 <button type="button"
 class="ln-confirm-cancel"
 data-confirm-cancel>
 Vazgeç
 </button>

 </section>
 </div>

 <div class="ln-confirm ln-pending" hidden>
 <section class="ln-confirm-sheet"
 role="dialog"
 aria-modal="true"
 aria-labelledby="ln-pending-heading">

 <div class="ln-pending-symbol">◷</div>

 <h2 id="ln-pending-heading"
 class="ln-confirm-rank">Bekleyen Asalet İşlemi</h2>

 <div class="ln-confirm-summary">
 <div>
 <span>İşlem</span>
 <strong class="ln-pending-action"></strong>
 </div>
 <div>
 <span>Asalet sınıfı</span>
 <strong class="ln-pending-rank"></strong>
 </div>
 <div>
 <span>İşlem maliyeti</span>
 <strong class="ln-pending-cost"></strong>
 </div>
 </div>

 <p class="ln-confirm-description">
 Yeniden gönderim, işlem daha önce tamamlanmadıysa
 belirtilen Asalet puanını harcayabilir.
 </p>

 <small class="ln-confirm-status ln-pending-status"
 aria-live="polite"></small>

 <button type="button"
 class="ln-action-button"
 data-pending-recover disabled>
 İşlemi Yeniden Gönder
 </button>

 <button type="button"
 class="ln-confirm-cancel"
 data-pending-cancel disabled>
 İşlemi İptal Et
 </button>

 <p class="ln-confirm-description">
 İptal, henüz gerçekleşmemiş işlemi engeller.
 Tamamlanmış işlemi geri almaz.
 </p>

 <button type="button"
 class="ln-confirm-cancel"
 data-pending-later>
 Daha Sonra
 </button>

 </section>
 </div>

 <div class="ln-detail" hidden>
 <section class="ln-detail-sheet"
 role="dialog" aria-label="Ayrıcalık detayı">
 <div class="ln-detail-handle"></div>
 <button class="ln-detail-close"
 data-detail-close aria-label="Kapat">×</button>

 <h2 class="ln-detail-title"></h2>
 <div class="ln-detail-art"></div>

 <div class="ln-detail-nav">
 <button data-prev aria-label="Önceki">‹</button>
 <span class="ln-detail-position"></span>
 <button data-next aria-label="Sonraki">›</button>
 </div>

 <p class="ln-detail-text"></p>
 <p class="ln-detail-status"></p>
 </section>
 </div>`;

 document.body.append(root);

 root.onclick=e=>{
  const b=e.target.closest('button');

  if(financialBusy())return;

  if(e.target.classList.contains('ln-detail')){
   closeDetail();
   return;
  }

  const pendingPanel=root.querySelector('.ln-pending');

  if(pendingPanel&&!pendingPanel.hidden){
   if(b?.hasAttribute('data-pending-recover')&&!b.disabled){
    void runFinancial('recover');
   }else if(b?.hasAttribute('data-pending-cancel')&&!b.disabled){
    void runFinancial('cancel');
   }else if(
    e.target===pendingPanel||
    b?.hasAttribute('data-pending-later')
   ){
    closePending();
   }

   return;
  }

  const confirmPanel=root.querySelector('.ln-confirm');

  if(confirmPanel&&!confirmPanel.hidden){
   if(b?.hasAttribute('data-confirm-submit')&&!b.disabled){
    void runFinancial('submit');
    return;
   }

   if(
    e.target===confirmPanel||
    b?.hasAttribute('data-confirm-cancel')
   ){
    closeConfirmation();
   }

   return;
  }

  if(!b)return;

  if(b.hasAttribute('data-history-open'))openHistory();
  else if(b.hasAttribute('data-nobility-action')){
   if(b.disabled||financialBusy())return;

   if(!window.LidyaNobilityAPI?.sameSession(accountSnapshot)){
    close();
    return;
   }

   const pending=pendingStatus(accountSnapshot);

   if(pending.kind==='pending'){
    openPending();
    return;
   }

   if(pending.kind!=='clear'||
      accountState!=='ready'){
    renderAction();
    return;
   }

   const state=window.LidyaNobilityActionState?.resolve(
    accountData,ranks[selected].id
   );

   if(state?.reason==='refresh_required'){
    loadAccount();
    return;
   }

   if(state?.kind==='topup'){
    if(typeof window.ErisPurchases?.open!=='function'){
     window.toast?.('Lidya yükleme şu anda kullanılamıyor.');
     return;
    }

    close();
    window.ErisPurchases.open();
    return;
   }

   if(state?.kind==='action'){
    openConfirmation();
   }
  }
  else if(b.hasAttribute('data-account-retry'))loadAccount();
  else if(b.hasAttribute('data-close'))close();
  else if(b.hasAttribute('data-detail-close'))
   closeDetail();
  else if(b.hasAttribute('data-prev'))
   showDetail(detailIndex-1);
  else if(b.hasAttribute('data-next'))
   showDetail(detailIndex+1);
  else if(b.hasAttribute('data-info'))
   window.toast?.('Asalet kazanma kuralları hazırlanıyor.');
  else if(b.hasAttribute('data-rank')){
   selected=Number(b.dataset.rank);
   render();
   renderAccount();
  }
  else if(b.hasAttribute('data-privilege')){
   detailTrigger=b;
   showDetail(privileges.findIndex(
    p=>p.id===b.dataset.privilege
   ));
   root.querySelector('[data-detail-close]').focus();
  }
 };

 let startX=0;
 let startY=0;

 const sheet=root.querySelector('.ln-detail-sheet');

 sheet.addEventListener('touchstart',e=>{
  startX=e.changedTouches[0].clientX;
  startY=e.changedTouches[0].clientY;
 },{passive:true});

 sheet.addEventListener('touchend',e=>{
  const dx=e.changedTouches[0].clientX-startX;
  const dy=e.changedTouches[0].clientY-startY;

  if(Math.abs(dx)>60&&
     Math.abs(dx)>Math.abs(dy)*1.5){
   showDetail(detailIndex+(dx<0?1:-1));
  }
 },{passive:true});

 root.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   e.preventDefault();
   e.stopPropagation();

   if(financialBusy())return;

   if(pendingRecord)closePending();
   else if(confirmation)closeConfirmation();
   else if(root.querySelector('.ln-history'))closeHistory();
   else if(detailIndex>=0)closeDetail();
   else close();
  }
 });

 render();
 loadAccount();
 root.querySelector('[data-close]').focus();
}

window.LidyaNobility={open,close};
})();
