(()=>{'use strict';
const api=()=>((window.ERIS_API||window.ERISCHAT_API||'https://erischat-api-production.up.railway.app/v1')+'').replace(/\/$/,'');
const token=()=>localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';
async function request(path,method='GET',body){const res=await fetch(api()+path,{method,headers:{Authorization:'Bearer '+token(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(typeof data.detail==='string'?data.detail:'İşlem başarısız');return data;}
const theme=()=>document.documentElement.dataset.erisTheme==='dark'?'dark':'light';
function modal(title,html,bind){document.getElementById('erisReferralOverlay')?.remove();const overlay=document.createElement('div');overlay.id='erisReferralOverlay';overlay.className='er-ref-overlay';overlay.innerHTML=`<section class="er-ref-dialog" role="dialog" aria-modal="true"><header><strong></strong><button type="button" data-close aria-label="Kapat">×</button></header><main></main></section>`;overlay.querySelector('strong').textContent=title;overlay.querySelector('main').innerHTML=html;overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});document.body.append(overlay);bind?.(overlay);return overlay;}
function message(title,msg){modal(title,'<p class="er-ref-message"></p>',o=>o.querySelector('p').textContent=msg)}
function openRedeem(){modal('Referans Kodu','<p>Referans kodunuzu girin.</p><input maxlength="48" autocomplete="off" placeholder="Referans kodu"><button class="er-ref-action">Aktifleştir</button><p data-result></p>',o=>{o.querySelector('.er-ref-action').onclick=async()=>{const b=o.querySelector('.er-ref-action');b.disabled=true;try{const v=await request('/referrals/redeem','POST',{code:o.querySelector('input').value.trim()});message('Lidya kazandınız',`${v.code} referans kodunu kullandığınız için ${v.amount.toLocaleString('tr-TR')} Lidya kazandınız, hesabınıza eklenmiştir.`);window.ErisProfile?.refresh?.()}catch(e){o.querySelector('[data-result]').textContent=e.message}finally{b.disabled=false}}})}
function admin(){
 modal('Referans Kodu Yönetimi','<p>Yalnızca DA yetkilileri kod oluşturabilir.</p><div class="er-ref-actions"><button data-kind="USER">USER · 2.500</button><button data-kind="TANIDIK">TANIDIK · 12.500</button></div><button class="er-ref-action" data-custom type="button">Özel Referans Kodu Oluştur</button><button data-list type="button">Mevcut Kodlar</button><div data-codes hidden></div>',o=>{
  const box=o.querySelector('[data-codes]');
  async function load(){
   box.hidden=false;box.textContent='Yükleniyor…';
   try{
    const codes=await request('/admin/referrals');box.replaceChildren();
    if(!codes.length){box.textContent='Kod bulunmuyor.';return;}
    for(const c of codes){
     const line=document.createElement('div');line.className='er-ref-code';
     const label=document.createElement('span');label.style.cssText='min-width:0;overflow-wrap:anywhere;flex:1';
     label.textContent=c.code+' · '+(c.reward==null?'Ödül geçersiz':Number(c.reward).toLocaleString('tr-TR')+' Lidya')+' · '+c.uses+'/'+c.max_uses+' · '+(c.active?'Aktif':c.remaining===0?'Limit doldu':'Pasif');
     const action=document.createElement('button');action.type='button';
     action.textContent=c.active?'Pasifleştir':'Aktifleştir';
     action.disabled=!c.active&&(c.kind!=='CUSTOM'||!c.remaining||c.reward==null);
     action.onclick=()=>modal('Kod durumunu değiştir','<p>Önceden verilen ödüller ve kullanım kayıtları korunacaktır.</p><div class="er-ref-actions"><button data-accept>Onayla</button><button data-reject>Vazgeç</button></div><p data-result></p>',m=>{
      m.querySelector('[data-reject]').onclick=admin;
      m.querySelector('[data-accept]').onclick=async()=>{const b=m.querySelector('[data-accept]');b.disabled=true;try{
       if(c.kind==='CUSTOM')await request('/admin/referrals/'+c.id+'/state','PATCH',{active:!c.active});
       else await request('/admin/referrals/'+c.id,'DELETE');admin();
      }catch(e){m.querySelector('[data-result]').textContent=e.message;b.disabled=false;}};
     });line.append(label,action);box.append(line);
    }
   }catch(e){box.textContent=e.message;}
  }
  o.querySelector('[data-list]').onclick=load;
  function create(kind){
   const custom=kind==='CUSTOM';
   modal(custom?'Özel Referans Kodu Oluştur':kind+' kodu oluştur',
    (custom?'<label>Referans kodu<input data-code maxlength="48" autocomplete="off" placeholder="Örn. VUSAL75" autocapitalize="characters"></label><label>Kişi başına Lidya<input data-reward type="number" min="1" max="1000000" step="1" inputmode="numeric" placeholder="Örn. 7500"></label>':'')+
    '<label>Toplam kullanım limiti<input data-count type="number" min="1" max="100000" step="1" value="1" inputmode="numeric"></label>'+(custom?'<label><input data-active type="checkbox" checked style="width:auto"> Hemen aktif et</label><p data-budget></p>':'')+'<button class="er-ref-action">Kod Oluştur</button><p data-result role="status"></p>',m=>{
     const result=m.querySelector('[data-result]'),count=m.querySelector('[data-count]'),reward=m.querySelector('[data-reward]');
     if(custom){const budget=()=>{m.querySelector('[data-budget]').textContent='Azami dağıtım: '+(Number(reward.value)*Number(count.value)).toLocaleString('tr-TR')+' Lidya';};reward.oninput=count.oninput=budget;budget();}
     m.querySelector('.er-ref-action').onclick=async()=>{
      const n=Number(count.value),amount=Number(reward?.value),code=m.querySelector('[data-code]')?.value.trim();
      if(!Number.isInteger(n)||n<1||n>100000){result.textContent='1–100.000 arasında kullanım limiti gir.';return;}
      if(custom&&(!/^[A-Za-z0-9]{4,48}$/.test(code)||!Number.isInteger(amount)||amount<1||amount>1000000||amount*n>100000000)){result.textContent='Kod 4–48 İngilizce harf/rakam; ödül 1–1.000.000; toplam bütçe en fazla 100.000.000 Lidya.';return;}
      if(!window.confirm('Kod oluşturulsun mu? Azami dağıtım: '+(n*(custom?amount:kind==='USER'?2500:12500)).toLocaleString('tr-TR')+' Lidya'))return;
      const b=m.querySelector('.er-ref-action');b.disabled=true;
      try{const data=await request('/admin/referrals','POST',{kind,max_uses:n,...(custom?{code,reward:amount,active:m.querySelector('[data-active]').checked}:{})});
       message('Kod oluşturuldu',data.code+' · '+Number(data.reward).toLocaleString('tr-TR')+' Lidya · '+n+' kullanım · '+(data.active?'Aktif':'Pasif'));
      }catch(e){result.textContent=e.message;b.disabled=false;}
     };
    });
  }
  o.querySelector('[data-custom]').onclick=()=>create('CUSTOM');
  o.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>create(b.dataset.kind));
 });
}
async function family(familyId){try{let f=null,status=null;if(familyId){status=await request('/families/'+encodeURIComponent(familyId)+'/referral-reward');f={id:familyId}}else{const rows=await request('/families');for(const candidate of (Array.isArray(rows)?rows:rows.items||rows.families||[])){try{status=await request('/families/'+encodeURIComponent(candidate.id)+'/referral-reward');f=candidate;break}catch(e){if(!/yalnızca aile sahibi|403/i.test(e.message))throw e}}}if(!f){message('Aile referans ödülü','Bu işlem yalnızca aile sahiplerine açıktır.');return}modal('Aile Referans Ödülü',`<p>Mevcut ${status.member_count} aile üyesinin her birine 1.000 Lidya dağıtılacaktır. 30 gün tekrar talep edemezsiniz. Sonradan katılanlar geçmiş ödülü alamaz.</p><p data-date></p><div class="er-ref-actions"><button data-accept>Kabul Et</button><button data-reject>Reddet</button></div><p data-result></p>`,o=>{o.querySelector('[data-date]').textContent='Bir sonraki kullanım tarihi: '+(status.next_claim_at?new Date(status.next_claim_at).toLocaleString('tr-TR'):'İlk talep sonrası 30 gün');o.querySelector('[data-reject]').onclick=()=>o.remove();const b=o.querySelector('[data-accept]');b.disabled=!status.eligible;b.onclick=async()=>{b.disabled=true;try{const result=await request('/families/'+encodeURIComponent(f.id)+'/referral-reward','POST');message('Ödüller dağıtıldı',`${result.member_count} üyeye 1.000 Lidya yüklendi.`);window.ErisProfile?.refresh?.()}catch(e){o.querySelector('[data-result]').textContent=e.message;b.disabled=false}}})}catch(e){message('Aile ödülü',e.message)}}
function add(){const tabs=document.querySelector('#profile #erisProfileHub .eph-tabs');if(tabs&&!tabs.querySelector('[data-referral-open]')){const b=document.createElement('button');b.type='button';b.dataset.referralOpen='1';b.className='er-ref-menu';b.innerHTML='<img class="er-ref-icon" alt="" aria-hidden="true"><span>Referans Kodu</span>';const icon=b.querySelector('img');icon.src=new URL('./assets/lidya-profile-png/'+theme()+'/referral.png',document.currentScript?.src||location.href).href;b.onclick=openRedeem;const history=tabs.querySelector('[data-payment-history]');if(history)history.after(b);else tabs.append(b)}const icon=tabs?.querySelector('[data-referral-open] .er-ref-icon');if(icon){const src=new URL('./assets/lidya-profile-png/'+theme()+'/referral.png',document.querySelector('script[src*="referral-lidya.js"]')?.src||location.href).href;if(icon.src!==src)icon.src=src}}
let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;add()})});function start(){add();observer.observe(document.body,{childList:true,subtree:true});new MutationObserver(add).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();window.ErisReferral={openRedeem,openAdmin:admin,openFamily:family};

// Poll persisted family rewards. Unread notifications survive a closed app.
let referralToastBusy=false;
let referralToastToken='';
const referralToastSeen=new Set();
async function pollFamilyRewards(){
 const access=token();
 if(referralToastBusy || document.visibilityState==='hidden' || !access)return;
 if(access!==referralToastToken){referralToastSeen.clear();referralToastToken=access;}
 referralToastBusy=true;
 try{
  const rows=await request('/me/notifications?limit=50');
  if(access!==token())return;
  const notices=(Array.isArray(rows)?rows:[]).filter(x=>x.kind==='family_referral_reward' && !x.read);
  for(const n of notices.sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0))){
   const id=String(n.id);
   if(referralToastSeen.has(id))continue;
   referralToastSeen.add(id);
   const toast=document.createElement('div');toast.className='er-ref-toast';
   const coin=document.createElement('span');coin.className='er-ref-toast-coin';coin.textContent='✦';
   const label=document.createElement('span');label.textContent=n.body||'Ailenize 1.000 Lidya ikramiyesi tanımlandı.';
   toast.append(coin,label);document.body.append(toast);setTimeout(()=>toast.remove(),3000);
   // Only acknowledge after showing the reward, so offline users can see it later.
   request('/me/notifications/'+encodeURIComponent(id)+'/read','POST').catch(()=>{});
  }
 }catch(e){/* Retry after connectivity is restored. */}
 finally{referralToastBusy=false}
}
setInterval(pollFamilyRewards,5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pollFamilyRewards()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pollFamilyRewards,{once:true});else pollFamilyRewards();
})();
