/* LidyaChat V9 — DA only, read-only dealer audit dashboard. */
(()=>{'use strict';
const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
const base=(window.ERISCHAT_API_BASE||window.ERIS_API||localStorage.getItem('erischat.apiBase')||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'').replace(/\/v1$/,'');
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
const qty=n=>Number(n).toLocaleString('tr-TR')+' Lidya';
const flagLabels={STOCK_LEDGER_MISMATCH_REVIEW:'Stok / kayıt tutarsızlığı',HIGH_TRANSFER_FREQUENCY_REVIEW:'Son 1 saatte yoğun işlem',HIGH_HOURLY_TRANSFER_VOLUME_REVIEW:'Son 1 saatte yüksek hacim'};
let requestSerial=0;
async function load(path){const t=token();if(!t)throw Error('Oturum açılmalı');const r=await fetch(base+'/v1/dealers'+path,{cache:'no-store',headers:{Authorization:'Bearer '+t}});const json=await r.json().catch(()=>({}));if(t!==token())throw Error('Oturum değişti');if(!r.ok)throw Error(typeof json.detail==='string'?json.detail:'Denetim bilgileri alınamadı ('+r.status+')');return json;}
function open(){document.querySelector('.lbv9-mask')?.remove();const serial=++requestSerial;
 const mask=el('div','lbv9-mask'),panel=el('section','lbv9-panel'),header=el('header','lbv9-header'),title=el('div','lbv9-title');
 mask.setAttribute('role','presentation');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Bayi Denetim Merkezi');
 title.append(el('div','lbv9-crown','♛'),el('h2','', 'Bayi Denetim Merkezi'),el('p','','DA · Salt okunur kontrol paneli'));
 const close=el('button','lbv9-close','×');close.type='button';close.setAttribute('aria-label','Kapat');
 let pending=false;function dismiss(){++requestSerial;mask.remove();document.removeEventListener('keydown',keys,true)}
 close.onclick=dismiss;mask.onclick=e=>{if(e.target===mask)dismiss()};function keys(e){if(!mask.isConnected)return;if(e.key==='Escape'){e.preventDefault();dismiss()}else if(e.key==='Tab'){const focusables=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(n=>n.offsetParent!==null);if(!focusables.length)return;const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
 header.append(title,close);panel.append(header);
 const intro=el('p','lbv9-intro','İşaretlenen hareketler inceleme gerektirir; tek başına usulsüzlük kanıtı değildir. Bu ekrandan bakiye değiştirilemez.');panel.append(intro);
 const toolbar=el('form','lbv9-toolbar'),search=el('input'),go=el('button','lbv9-primary','Sorgula'),all=el('button','','Tüm bayiler'),refresh=el('button','','Yenile');
 search.type='text';search.placeholder='Bayi profil ID (isteğe bağlı)';search.maxLength=64;search.autocomplete='off';search.setAttribute('aria-label','Bayi profil ID');go.type='submit';all.type=refresh.type='button';toolbar.append(search,go,all,refresh);panel.append(toolbar);
 const status=el('p','lbv9-status','Rapor hazırlanıyor…'),summary=el('div','lbv9-summary'),results=el('div','lbv9-results');status.setAttribute('role','status');panel.append(status,summary,results);
 function stat(label,value){const c=el('div','lbv9-stat');c.append(el('span','',label),el('strong','',value));summary.append(c)}
 function addField(container,label,value){const line=el('div','lbv9-line');line.append(el('span','',label),el('strong','',value));container.append(line)}
 function render(data){summary.replaceChildren();results.replaceChildren();const items=Array.isArray(data.items)?data.items:[];
  stat('Listelenen bayi',items.length);stat('İnceleme işaretli',items.filter(x=>x.status==='REVIEW').length);stat('Stok sapması',items.filter(x=>Number(x.difference)!==0).length);
  if(!items.length){results.append(el('p','lbv9-empty','Görüntülenecek bayi kaydı bulunamadı.'));return}
  for(const x of items){const card=el('article','lbv9-dealer'),head=el('div','lbv9-dealer-head'),name=el('div','lbv9-person'),badge=el('span',x.status==='REVIEW'?'lbv9-review':'lbv9-ok',x.status==='REVIEW'?'İnceleme gerekli':'Kayıt uyumlu');
   name.append(el('strong','',x.public_id||'—'),el('small','',x.active?'Aktif bayi':'Pasif bayi'));head.append(name,badge);card.append(head);
   const values=el('div','lbv9-values');addField(values,'Toplam tahsis',qty(x.granted));addField(values,'Toplam aktarım',qty(x.transferred));addField(values,'Mevcut stok',qty(x.current_stock));addField(values,'Beklenen stok',qty(x.expected_stock));addField(values,'Fark',qty(x.difference));addField(values,'Son 1 saat',String(x.hourly_transfer_count)+' işlem · '+qty(x.hourly_transfer_amount));card.append(values);
   if(Array.isArray(x.review_flags)&&x.review_flags.length){const flags=el('div','lbv9-flags');for(const f of x.review_flags)flags.append(el('span','',flagLabels[f]||'İnceleme: '+f));card.append(flags)}results.append(card)
  }
 }
 async function fetchReport(){if(pending)return;pending=true;go.disabled=all.disabled=refresh.disabled=true;status.textContent='Denetim raporu yükleniyor…';summary.replaceChildren();results.replaceChildren();const current=++requestSerial;
  try{const id=search.value.trim();const d=await load('/admin/audit?limit=100'+(id?'&public_id='+encodeURIComponent(id):''));if(current!==requestSerial||!mask.isConnected)return;render(d);status.textContent=(d.items||[]).length+' bayi gösteriliyor · '+(d.review_count||0)+' inceleme işareti · Salt okunur';}
  catch(e){if(current===requestSerial&&mask.isConnected)status.textContent=e.message||'Rapor alınamadı'}finally{pending=false;if(mask.isConnected){go.disabled=all.disabled=refresh.disabled=false}}}
 toolbar.onsubmit=e=>{e.preventDefault();fetchReport()};all.onclick=()=>{search.value='';fetchReport()};refresh.onclick=fetchReport;
 mask.append(panel);document.body.append(mask);document.addEventListener('keydown',keys,true);close.focus();fetchReport();
}
window.LidyaDealerAuditV9={open};
})();
