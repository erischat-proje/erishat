/* LidyaChat V10: paginated dealer transaction history, dealer and DA lookup. */
(()=>{'use strict';
const PAGE_SIZE=20;
const apiBase=()=>String(window.ERISCHAT_API_BASE||window.ERIS_API||localStorage.getItem('erischat.apiBase')||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'').replace(/\/v1$/,'');
const auth=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=String(txt);return node;};
const number=value=>Number(value||0).toLocaleString('tr-TR');
const when=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('tr-TR');};
if(!document.getElementById('lbh10-css')){const style=el('style');style.id='lbh10-css';style.textContent=`
.lbh10-mask{position:fixed;inset:0;z-index:110110;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box}
.lbh10-panel{width:min(100%,680px);max-height:calc(100dvh - 20px);min-height:240px;display:flex;flex-direction:column;box-sizing:border-box;border-radius:19px;border:1px solid #b89558;background:var(--ui-panel,#fff8ed);color:var(--ui-ink,#26190d);box-shadow:0 18px 55px #0009;overflow:hidden}
.lbh10-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex:none;padding:15px 15px 12px;border-bottom:1px solid #b895585e}.lbh10-head h2{font-size:19px;margin:0;line-height:1.35;color:inherit}
.lbh10-panel button{font:inherit;cursor:pointer;min-height:42px;padding:8px 13px;font-weight:800;border-radius:11px;border:1px solid #b89558;background:var(--ui-raised,#eed9b8);color:var(--ui-ink,#26190d)}
.lbh10-panel button:disabled{opacity:.45;cursor:default}.lbh10-close{font-size:23px!important;min-width:44px!important;background:#402d20!important;color:white!important}
.lbh10-list{overflow-y:auto;overscroll-behavior:contain;flex:1;min-height:0;padding:12px 15px;scrollbar-width:thin}
.lbh10-entry{border:1px solid #b8955866;border-radius:13px;padding:11px 12px;margin-bottom:10px;background:var(--ui-raised,#f7e9d2);overflow-wrap:anywhere;color:inherit}
.lbh10-entry-title{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-weight:900}.lbh10-entry-type{color:#a97825}.lbh10-entry dl{margin:8px 0 0;display:grid;grid-template-columns:minmax(105px,35%) minmax(0,1fr);gap:5px 9px;font-size:13px}.lbh10-entry dt{opacity:.75}.lbh10-entry dd{margin:0;font-weight:650;overflow-wrap:anywhere}
.lbh10-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:12px 15px;border-top:1px solid #b895585e;flex:none}.lbh10-status{font-size:12px;opacity:.85}.lbh10-pages{display:flex;align-items:center;gap:8px}.lbh10-pages span{font-size:13px;font-weight:800}
@media(max-width:390px){.lbh10-head h2{font-size:16px}.lbh10-panel{border-radius:13px}.lbh10-list{padding:9px}.lbh10-foot{padding:8px}.lbh10-panel button{padding:8px}}
@media(prefers-color-scheme:dark){.lbh10-panel{background:var(--ui-panel,#30251c);color:var(--ui-ink,#fff4e4)}.lbh10-entry,.lbh10-panel button:not(.lbh10-close){background:var(--ui-raised,#453323);color:var(--ui-ink,#fff4e4)}}
`;document.head.append(style);}
function open({admin=false,publicId=''}={}){
 if(admin&&!String(publicId).trim()){window.toast?.('Önce bayi ID sorgulayın');return;}
 document.querySelector('.lbh10-mask')?.remove();
 const mask=el('div','lbh10-mask'),panel=el('section','lbh10-panel'),head=el('header','lbh10-head');
 mask.setAttribute('role','dialog');mask.setAttribute('aria-modal','true');mask.setAttribute('aria-label','Bayi işlem geçmişi');
 const title=el('h2','',admin?'Bayi İşlem Geçmişi · '+publicId:'İşlem Geçmişim');
 const close=el('button','lbh10-close','×');close.type='button';close.setAttribute('aria-label','İşlem geçmişini kapat');
 head.append(title,close);
 const list=el('div','lbh10-list');list.setAttribute('role','region');list.setAttribute('aria-label','İşlem kayıtları');
 const foot=el('footer','lbh10-foot'),status=el('span','lbh10-status',''),pages=el('div','lbh10-pages'),prev=el('button','','‹ Önceki'),counter=el('span','','1 / 1'),next=el('button','','Sonraki ›');
 for(const b of [prev,next])b.type='button';pages.append(prev,counter,next);foot.append(status,pages);panel.append(head,list,foot);mask.append(panel);document.body.append(mask);
 let page=1,totalPages=1,requestId=0;const previous=document.activeElement;
 const dismiss=()=>{requestId++;mask.remove();if(previous?.isConnected)previous.focus();};
 close.onclick=dismiss;mask.onclick=e=>{if(e.target===mask)dismiss();};mask.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();dismiss();}};
 function field(dl,name,value){if(value===null||value===undefined||value==='')return;dl.append(el('dt','',name),el('dd','',value));}


 // LIDYA_HISTORY_EVIDENCE_V45
 async function downloadEvidence(id,button){
  const bearer=auth();
  if(!bearer)throw Error('Oturum açılmalı');

  const oldText=button.textContent;
  button.disabled=true;
  button.textContent='Dekont yükleniyor…';

  try{
   const url=apiBase()+'/v1/dealers/transfers/'+
    encodeURIComponent(id)+'/evidence';

   const response=await fetch(url,{
    cache:'no-store',
    headers:{Authorization:'Bearer '+bearer}
   });

   if(bearer!==auth()){
    throw Error('Oturum değişti');
   }

   if(!response.ok){
    const error=await response.json().catch(()=>({}));
    throw Error(
     typeof error.detail==='string'
      ?error.detail
      :'Dekont bulunamadı veya erişim reddedildi'
    );
   }

   const blob=await response.blob();
   const formats={
    'image/jpeg':'.jpg',
    'image/png':'.png',
    'image/webp':'.webp',
    'application/pdf':'.pdf'
   };

   const extension=formats[blob.type];
   if(!extension){
    throw Error('Desteklenmeyen dekont türü');
   }

   const objectUrl=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=objectUrl;
   link.download='LidyaChat-Dekont-'+id+extension;
   document.body.append(link);
   link.click();
   link.remove();

   setTimeout(()=>{
    URL.revokeObjectURL(objectUrl);
   },60000);

  }finally{
   button.disabled=false;
   button.textContent=oldText;
  }
 }

 function render(items){list.replaceChildren();if(!items.length){list.append(el('p','','Bu sayfada işlem bulunmuyor.'));return;}
  for(const tx of items){const card=el('article','lbh10-entry'),h=el('div','lbh10-entry-title'),kind=tx.kind==='stock_grant'?'Stok yüklemesi':'Kullanıcıya aktarım';h.append(el('span','lbh10-entry-type',kind),el('span','',number(tx.amount)+' Lidya'));
   const dl=el('dl');field(dl,'Tarih / Saat',when(tx.created_at));field(dl,'İşlem numarası',tx.id);field(dl,'Bayi profil ID',tx.dealer_public_id);field(dl,'İşlemi yapan',tx.actor_public_id);field(dl,'Alıcı profil ID',tx.recipient_public_id);if(admin)field(dl,'İstek referansı',tx.request_key);
   card.append(h,dl);
   if(tx.kind==='transfer' && tx.id){
    const receipt=el(
     'button','lbh10-receipt','📎 Dekont Görüntüle'
    );
    receipt.type='button';
    receipt.style.cssText=
     'width:100%;margin-top:10px;padding:12px;'+
     'border-radius:12px;font-weight:800;cursor:pointer';

    const error=el('p','lbh10-status','');
    error.setAttribute('role','status');

    receipt.onclick=async()=>{
     error.textContent='';
     try{
      await downloadEvidence(tx.id,receipt);
     }catch(e){
      error.textContent=e.message||'Dekont açılamadı';
     }
    };

    card.append(receipt,error);
   }
   list.append(card);}
 }
 async function load(p){const serial=++requestId;page=p;list.replaceChildren(el('p','','İşlemler yükleniyor…'));prev.disabled=true;next.disabled=true;status.textContent='Yükleniyor…';
  try{const token=auth();if(!token)throw Error('Oturum açılmalı');const path=admin?'/admin/history?public_id='+encodeURIComponent(publicId)+'&page='+page:'/history?page='+page;const response=await fetch(apiBase()+'/v1/dealers'+path,{cache:'no-store',headers:{Authorization:'Bearer '+token}});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'İşlem geçmişi alınamadı');if(serial!==requestId||!mask.isConnected)return;
   totalPages=Math.max(1,Number(data.total_pages)||1);page=Math.min(page,totalPages);render(data.items||[]);counter.textContent=page+' / '+totalPages;status.textContent=number(data.total)+' işlem · Sayfada en fazla '+PAGE_SIZE+' kayıt';prev.disabled=page<=1;next.disabled=page>=totalPages;list.scrollTop=0;
  }catch(e){if(serial!==requestId||!mask.isConnected)return;list.replaceChildren(el('p','',e.message||'İşlem geçmişi alınamadı'));status.textContent='Yüklenemedi';counter.textContent=page+' / '+totalPages;prev.disabled=page<=1;next.disabled=page>=totalPages;}}
 prev.onclick=()=>{if(page>1)load(page-1);};next.onclick=()=>{if(page<totalPages)load(page+1);};close.focus();load(1);
}
window.LidyaDealerHistoryV10={open};
})();
