/* LidyaChat dealer inventory. Inventory is separate from personal Lidya. */
(()=>{'use strict';
const badgeAsset=new URL('./role-icons/dealer-lb-v3.svg?v=20261117-v3',document.currentScript.src).href;
const coinAsset=new URL('./role-icons/coin-temsilcisi-v1.png?v=20261121',document.currentScript.src).href;
const supportAsset=new URL('./role-icons/bayi-temsilcisi-bt-v1.png?v=20261121',document.currentScript.src).href;
const roleAsset=k=>k==='support'?supportAsset:coinAsset;
const roleTitle=k=>k==='support'?'Bayi Temsilcisi':'Coin Temsilcisi';
const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
const base=(window.ERISCHAT_API_BASE||window.ERIS_API||localStorage.getItem('erischat.apiBase')||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'').replace(/\/v1$/,'');
async function api(path,method='GET',payload){const bearer=token();if(!bearer)throw Error('Oturum açılmalı');const r=await fetch(base+'/v1/dealers'+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});const j=await r.json().catch(()=>({}));if(bearer!==token())throw Error('Oturum değişti');if(!r.ok)throw Error(j.detail||'İşlem başarısız ('+r.status+')');return j;}
const elt=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
const amount=v=>Number(v).toLocaleString('tr-TR')+' Lidya';
const css=`.lb-dealer-badge img{display:block;width:100%;height:100%;object-fit:contain}.lb-dealer-badge.lb-dealer-badge{display:inline-grid!important;place-items:center!important;width:2.1em!important;min-width:2.1em!important;max-width:2.1em!important;height:1.4em!important;min-height:1.4em!important;max-height:1.4em!important;padding:0!important;margin:0 .3em 0 0!important;vertical-align:middle!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;pointer-events:none!important}.seat-name .lb-dealer-badge{width:26px!important;min-width:26px!important;height:26px!important}.profile .name h2 .lb-dealer-badge{width:44px!important;min-width:44px!important;height:44px!important}.lb-panel .lb-list-item{display:block;width:100%;margin:6px 0;text-align:left;overflow-wrap:anywhere;font-size:12px}.lb-panel .lb-admin-result{border-top:1px solid var(--ui-line,#ac894d);margin-top:12px;padding-top:12px}.lb-mask{position:fixed;inset:0;z-index:110005;background:#080602d9;display:flex;align-items:center;justify-content:center;padding:12px}.lb-panel{box-sizing:border-box;width:min(100%,550px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--ui-panel,#fffaf0);border:1px solid var(--ui-gold,#b58e4b);border-radius:20px;color:var(--ui-ink,#3d2a17);padding:18px;box-shadow:0 16px 60px #0008}.lb-panel h2{font-size:20px;margin:0}.lb-panel p{color:var(--ui-muted,#796b55)}.lb-panel header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.lb-panel button{cursor:pointer;border:1px solid var(--ui-line,#ac894d);padding:12px;border-radius:12px;background:var(--ui-raised,#f8e8c7);color:var(--ui-ink,#3d2a17);font-weight:800}.lb-panel button.lb-primary{background:var(--ui-button,#cba45e);color:#20160b}.lb-panel button:disabled{opacity:.55}.lb-panel label{display:block;font-weight:700;font-size:13px;margin:13px 0}.lb-panel input{display:block;width:100%;margin-top:6px;box-sizing:border-box;border:1px solid var(--ui-line,#ad946f);border-radius:10px;min-height:44px;padding:10px;background:var(--ui-raised,#fff);color:var(--ui-ink,#302314);font-size:16px}.lb-panel form{border-top:1px solid var(--ui-line,#ac894d);padding:12px 0}.lb-panel .lb-msg{font-size:13px;min-height:22px;white-space:pre-wrap}.lb-panel .lb-stock{font-weight:900;font-size:27px;color:var(--ui-gold,#996820)}.lb-dealer-badge{display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#e9c67f,#a7712c);border:1px solid #f6daa1;border-radius:6px;padding:1px 5px;color:#211405;font-size:11px!important;line-height:1.4;font-weight:900;vertical-align:middle;margin-right:4px}.lb-panel .lb-history{max-height:170px;overflow:auto;font-size:12px}.lb-panel .lb-history>div{padding:8px;border-bottom:1px solid var(--ui-line,#ad946f)}.lb-panel .lb-actions{display:flex;gap:8px;flex-wrap:wrap}`;
if(!document.getElementById('lb-style')){const style=elt('style');style.id='lb-style';style.textContent=css;document.head.append(style);}
// V5: Accessible, branded confirmations shared by LB dealer and DA inventory grants.
function confirmDealerTransfer({kind,publicId,quantity}){
 return new Promise(resolve=>{
  const existing=document.querySelector('.lb-confirm-mask');
  if(existing){resolve(false);return;}
  const mask=elt('div','lb-confirm-mask');
  const dialog=elt('section','lb-confirm-card');
  mask.setAttribute('role','presentation');
  dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
  const heading=elt('h2','lb-confirm-heading','LidyaChat · İşlem Onayı');
  heading.id='lb-confirm-heading';dialog.setAttribute('aria-labelledby',heading.id);
  const sub=elt('p','lb-confirm-sub',kind==='grant'?'Yönetimden Bayiye Stok Yükleme':'Bayi Stokundan Kullanıcıya Aktarım');
  const note=elt('p','lb-confirm-note','Aşağıdaki işlemi onaylıyor musunuz?');
  const details=elt('div','lb-confirm-details');
  const recipient=elt('div','lb-confirm-row');
  recipient.append(elt('span','',kind==='grant'?'Bayi profil ID':'Alıcı profil ID'),elt('strong','',String(publicId)));
  const qty=elt('div','lb-confirm-quantity');
  qty.append(elt('small','','Aktarılacak miktar'),elt('strong','',amount(quantity)));
  details.append(recipient,qty);
  const foot=elt('p','lb-confirm-foot','İşlem sunucuda yetki ve stok doğrulamasından geçirilecektir.');
  const actions=elt('div','lb-confirm-actions');
  const cancel=elt('button','lb-confirm-cancel','Vazgeç');
  const approve=elt('button','lb-confirm-approve','Onayla');
  cancel.type=approve.type='button';
  let done=false;const previous=document.activeElement;
  function finish(value){if(done)return;done=true;document.removeEventListener('keydown',onKey,true);mask.remove();if(previous?.isConnected&&typeof previous.focus==='function')previous.focus();resolve(value);}
  function onKey(event){if(!mask.isConnected)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}else if(event.key==='Tab'){const a=[cancel,approve];const index=a.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();approve.focus();}else if(!event.shiftKey&&index>=1){event.preventDefault();cancel.focus();}}}
  cancel.addEventListener('click',()=>finish(false));approve.addEventListener('click',()=>finish(true));
  mask.addEventListener('click',event=>{if(event.target===mask)finish(false)});
  actions.append(cancel,approve);dialog.append(heading,sub,note,details,foot,actions);mask.append(dialog);
  document.body.append(mask);document.addEventListener('keydown',onKey,true);cancel.focus();
 });
}
const confirmCss=`
.lb-confirm-mask{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,7,4,.78);box-sizing:border-box}
.lb-confirm-card{box-sizing:border-box;width:min(100%,440px);max-height:calc(100dvh - 32px);overflow-y:auto;border-radius:22px;border:1px solid #b78a44;background:linear-gradient(155deg,#30271c,#17120e);color:#fff1d8;padding:24px 18px;box-shadow:0 18px 65px #000b;text-align:center;font-family:inherit}
.lb-confirm-heading{color:#f4d49a!important;font-size:21px!important;font-weight:900!important;margin:0 0 7px!important;line-height:1.35!important}
.lb-confirm-sub{color:#eac382!important;font-weight:800!important;font-size:15px!important;margin:0 0 14px!important}
.lb-confirm-note{color:#f8eedf!important;font-size:14px!important;margin:0 0 16px!important}
.lb-confirm-details{border-radius:14px;background:rgba(0,0,0,.27);border:1px solid #705333;padding:14px 12px;text-align:left}
.lb-confirm-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:#d7b88e;overflow-wrap:anywhere}
.lb-confirm-row strong{color:#fff3d9;font-size:15px;text-align:right}
.lb-confirm-quantity{display:flex;flex-direction:column;align-items:center;gap:7px;padding:13px 0 2px;margin-top:12px;border-top:1px solid #6d5236}
.lb-confirm-quantity small{color:#cfb58d;font-size:13px}.lb-confirm-quantity strong{font-size:27px;color:#f9cf7b;overflow-wrap:anywhere;text-align:center}
.lb-confirm-foot{color:#ccb592!important;font-size:12px!important;margin:15px 0!important}
.lb-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lb-confirm-actions button{min-height:49px;border-radius:12px;border:1px solid #8e724d;font-weight:900;font-size:15px;cursor:pointer;font-family:inherit}
.lb-confirm-cancel{background:#473b30;color:#fff!important}.lb-confirm-approve{background:linear-gradient(145deg,#f2d495,#b8893d);color:#20160c!important}
.lb-confirm-actions button:focus-visible{outline:3px solid #fff6d1;outline-offset:3px}
@media(max-width:360px){.lb-confirm-card{padding:19px 12px}.lb-confirm-quantity strong{font-size:22px}}
`;
if(!document.getElementById('lb-confirm-style')){const st=elt('style');st.id='lb-confirm-style';st.textContent=confirmCss;document.head.append(st);}

function overlay(title){document.querySelector('.lb-mask')?.remove();const mask=elt('div','lb-mask'),panel=elt('section','lb-panel');mask.setAttribute('role','dialog');mask.setAttribute('aria-modal','true');const header=elt('header');header.append(elt('h2','',title));const close=elt('button','', '×');close.type='button';close.setAttribute('aria-label','Kapat');close.onclick=()=>mask.remove();header.append(close);panel.append(header);mask.append(panel);mask.onclick=e=>{if(e.target===mask)mask.remove()};mask.onkeydown=e=>{if(e.key==='Escape')mask.remove()};document.body.append(mask);close.focus();return panel;}
function form(panel,title,fields,buttonText,submit){const f=elt('form'),h=elt('h3','',title);f.append(h);const inputs={};for(const [key,caption,kind] of fields){const l=elt('label','',caption),input=elt('input');input.name=key;input.type=kind||'text';input.required=true;if(kind==='number'){input.min='1';input.step='1';input.max='9000000000000000';}else input.maxLength=64;input.autocomplete='off';inputs[key]=input;l.append(input);f.append(l);}const btn=elt('button','lb-primary',buttonText),status=elt('p','lb-msg');btn.type='submit';status.setAttribute('role','status');f.append(btn,status);f.onsubmit=async e=>{e.preventDefault();if(btn.disabled)return;btn.disabled=true;status.textContent='İşlem yapılıyor…';try{const values=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.type==='number'?Number(v.value):v.value.trim()]));const data=await submit(values);status.textContent=data.message||'İşlem tamamlandı';if(data.stock!==undefined)panel.querySelector('.lb-stock')?.replaceChildren(document.createTextNode(amount(data.stock)));}catch(err){status.textContent=err.message||'İşlem başarısız';}finally{btn.disabled=false;}};panel.append(f);return f;}
async function openAdmin(which){
 const kind=which==='support'?'support':which==='coin'?'coin':null;
 const panel=overlay(kind==='support'?'Bayi Temsilcisi Ata':kind==='coin'?'Coin Temsilcisi Ata':'Temsilci Atama Merkezi');
 panel.append(elt('p','','Yalnızca DA atama ve stok tahsisi yapabilir. CT ve BT aynı güvenli bayi stok sistemini kullanır.'));
 if(kind===null||kind==='coin')form(panel,'Coin Temsilcisi Ata', [['public_id','Profil ID']], 'Coin Temsilcisi olarak ata', async v=>{
   const r=await api('/admin/assign','POST',{...v,kind:'coin'});
   return {...r,message:'Coin Temsilcisi atandı · Stok: '+amount(r.stock)};
 });
 if(kind===null||kind==='support')form(panel,'Bayi Temsilcisi Ata (BT)', [['public_id','Profil ID']], 'Bayi Temsilcisi olarak ata', async v=>{
   const r=await api('/admin/assign','POST',{...v,kind:'support'});
   return {...r,message:'BT yetkisi atandı · Stok: '+amount(r.stock)};
 });
 form(panel,'Temsilciye Stok Yükle',[['public_id','Temsilci Profil ID'],['amount','Lidya stoğu','number']], 'Stoğa yükle',async v=>{
   if(!await confirmDealerTransfer({kind:'grant',publicId:v.public_id,quantity:v.amount}))throw Error('İşlem iptal edildi');
   const r=await api('/admin/stock','POST',{...v,request_key:crypto.randomUUID()});
   return {...r,message:'Stok yüklendi: '+amount(r.stock)};
 });
}
async function openDealer(){const panel=overlay('Temsilci Sistemi'),summary=elt('p','','Stok yükleniyor…'),balance=elt('div','lb-stock','—');panel.append(summary,balance);try{const me=await api('/me');panel.querySelector('h2').textContent=roleTitle(me.kind)+' · Stok Yönetimi';summary.textContent='Yalnızca bayi stoğu · Kişisel Lidya bakiyenden bağımsız';balance.textContent=amount(me.stock)}catch(e){summary.textContent=e.message;return;}form(panel,'Kullanıcıya Lidya gönder',[['recipient_public_id','Alıcının profil ID’si'],['amount','Gönderilecek Lidya','number']], 'Stoktan aktar',async v=>{if(!await confirmDealerTransfer({kind:'transfer',publicId:v.recipient_public_id,quantity:v.amount}))throw Error('İşlem iptal edildi');const r=await api('/transfer','POST',{...v,request_key:crypto.randomUUID()});return {...r,message:'Aktarıldı · İşlem '+r.transfer_id}});const historyButton=elt('button','lb-primary','📋 İşlem geçmişi');historyButton.type='button';historyButton.onclick=()=>window.LidyaDealerHistoryV10?.open({admin:false});panel.append(historyButton);}
async function openAdminLookup(){
 const panel=overlay('Lidya Bayisi Ara');
 panel.append(elt('p','','DA yönetimi · Bayi ID sorgulama, kalan stok ve işlem geçmişi. Kişisel Lidya bakiyesi bu ekranda gösterilmez.'));
 const f=elt('form'),label=elt('label','','Bayi profil ID'),id=elt('input');
 id.required=true;id.maxLength=64;id.placeholder='Bayi profil ID';id.autocomplete='off';
 label.append(id);const submit=elt('button','lb-primary','Bayi sorgula');submit.type='submit';
 f.append(label,submit);panel.append(f);
 const result=elt('section','lb-admin-result'),status=elt('p','lb-msg');status.setAttribute('role','status');panel.append(status,result);
 async function lookup(publicId){
   submit.disabled=true;status.textContent='Bayi aranıyor…';result.replaceChildren();
   try{
     const d=await api('/admin/lookup?public_id='+encodeURIComponent(publicId));
     status.textContent='Bayi kaydı bulundu';
     const title=elt('h3','',d.nickname+' · '+d.public_id);
     const flag=elt('p','',d.active?'LB · Aktif Bayi':'LB · Pasif Bayi');
     const label=elt('p','','Kalan bayi stoğu (kişisel Lidya değil)');
     const stock=elt('div','lb-stock',amount(d.stock));
     const totals=elt('p','','Toplam tahsis: '+amount(d.total_granted)+' · Gönderilen: '+amount(d.total_sent));
     result.append(title,flag,label,stock,totals);
      const historyButton=elt('button','lb-primary','📋 Tüm işlem geçmişini görüntüle');
      historyButton.type='button';historyButton.onclick=()=>window.LidyaDealerHistoryV10?.open({admin:true,publicId:d.public_id});
      result.append(historyButton);
    }catch(e){status.textContent=e.message||'Bayi bulunamadı'}
   finally{submit.disabled=false;}
 }
 f.onsubmit=e=>{e.preventDefault();if(id.value.trim())lookup(id.value.trim())};
 const auditButton=elt('button','lb-primary','♛ Bayi Denetim Merkezi');auditButton.type='button';auditButton.onclick=()=>{if(typeof window.LidyaDealerAuditV9?.open==='function')window.LidyaDealerAuditV9.open();else window.toast?.('Denetim merkezi yüklenemedi. Sayfayı yenileyin.')};panel.append(auditButton);
 const listButton=elt('button','','Kayıtlı bayileri listele');listButton.type='button';
 const list=elt('div','lb-admin-list');panel.append(listButton,list);
 listButton.onclick=async()=>{listButton.disabled=true;list.textContent='Liste yükleniyor…';
  try{const d=await api('/admin/list?limit=100');list.replaceChildren();
   if(!d.items.length)list.textContent='Henüz bayi kaydı yok';
   for(const item of d.items){const b=elt('button','lb-list-item',item.public_id+' · '+item.nickname+' · '+(item.active?'Aktif':'Pasif')+' · '+amount(item.stock));b.type='button';b.onclick=()=>{id.value=item.public_id;lookup(item.public_id)};list.append(b)}
  }catch(e){list.textContent=e.message||'Liste alınamadı'}finally{listButton.disabled=false;}};
}
window.LidyaDealer={openAdmin,openDealer,openAdminLookup};
// Dealer button is mounted outside the admin mount because admin-live owns its contents.
let lastToken='',checkSerial=0;
async function boot(){
 const access=token(),mount=document.getElementById('adminMenuMount');
 if(!mount||!access){document.getElementById('lidya-dealer-menu')?.remove();return;}
 const serial=++checkSerial;
 try{
  const me=await api('/me');if(serial!==checkSerial||access!==token())return;
  let btn=document.getElementById('lidya-dealer-menu');
  if(!btn){btn=elt('button','homeMenuItem lidya-dealer-card');btn.id='lidya-dealer-menu';btn.type='button';btn.onclick=openDealer;mount.insertAdjacentElement('afterend',btn);}
  btn.classList.add('lbv4-card');btn.replaceChildren();
  const badge=elt('span','lbv4-mark'),img=elt('img');img.src=roleAsset(me.kind);img.alt='';badge.append(img);
  const copy=elt('span','lbv4-copy');copy.append(elt('strong','',roleTitle(me.kind)),elt('small','','Stok ve kullanıcıya Lidya aktarımı'));
  btn.append(badge,copy,elt('span','lbv4-arrow','›'));
  btn.setAttribute('aria-label',roleTitle(me.kind)+': stok ve Lidya aktarımı');btn.hidden=!me.dealer;
 }catch{if(serial===checkSerial)document.getElementById('lidya-dealer-menu')?.remove();}
}
function sync(){const v=token();if(v!==lastToken){lastToken=v;boot();}}
window.addEventListener('erischat:auth',()=>{lastToken=token();boot()});window.addEventListener('pageshow',boot);window.addEventListener('online',boot);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')boot()});setInterval(()=>{if(document.visibilityState==='visible'&&token())boot()},20000);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();setInterval(sync,5000);
// Public LB badge, independent of the SA/UA/FA/DA staff-identity rendering.
const cache=new Map();let pending=false;
async function badgeScan(){
 if(pending||!token())return;
 const nodes=[...document.querySelectorAll('[data-eris-role-user]')];
 const ids=[...new Set(nodes.map(n=>n.dataset.erisRoleUser).filter(Boolean))].slice(0,100);
 if(!ids.length)return;
 const unknown=ids.filter(id=>!cache.has(id)||cache.get(id).time<Date.now()-30000);
 if(unknown.length){pending=true;try{
   const r=await api('/badges?ids='+encodeURIComponent(unknown.join(',')));
   const dealers=new Set(r.dealers||[]);
   for(const id of unknown)cache.set(id,{kind:dealers.has(id)?(r.roles?.[id]||'coin'):null,time:Date.now()});
 }catch{}finally{pending=false;}}
 for(const node of nodes){
   const kind=cache.get(node.dataset.erisRoleUser)?.kind;
   let badge=node.querySelector(':scope > .lb-dealer-badge');
   if(!kind){badge?.remove();continue;}
   if(!badge){badge=elt('span','lb-dealer-badge');node.prepend(badge);}
   const img=badge.querySelector('img')||elt('img');img.src=roleAsset(kind);
   img.alt=kind==='support'?'BT':'CT';
   img.onerror=()=>{badge.textContent=kind==='support'?'BT':'CT';};
   if(!img.isConnected)badge.replaceChildren(img);
   badge.title=roleTitle(kind);
 }
}
setInterval(badgeScan,4000);window.addEventListener('erischat:auth',()=>{cache.clear();badgeScan()});
})();
