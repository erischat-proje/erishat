/* LidyaChat web-only PayTR checkout. Disabled until merchant settings are active. */
(() => {
  'use strict';
  const API=(window.ERISCHAT_API_BASE||window.ERIS_API||'https://api.lidyachat.com/v1').replace(/\/$/,'').replace(/\/v1$/,'');
  const auth=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
  let active=null;
  async function json(path,opts={}){
    const r=await fetch(API+path,{...opts,headers:{'Authorization':'Bearer '+auth(),'Content-Type':'application/json',...(opts.headers||{})},cache:'no-store'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'Ödeme servisine bağlanılamadı');
    return data;
  }
  async function enabled(){try{return !!(await json('/v1/paytr/status')).enabled}catch{return false}}
  function close(){if(!active)return;clearInterval(active.poll);active.root.remove();document.body.style.overflow=active.overflow;active=null}
  function panel(pkg){
    close();
    const root=document.createElement('section');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','PayTR ile ödeme');root.style.cssText='position:fixed;inset:0;z-index:25000;background:var(--ui-panel,#16110d);color:var(--ui-ink,#fff);padding:env(safe-area-inset-top) 15px env(safe-area-inset-bottom);display:flex;flex-direction:column;box-sizing:border-box;';
    root.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0"><strong>PayTR • Lidya Yükleme</strong><button type="button" data-close style="padding:12px">✕ Kapat</button></div><div style="flex:1;min-height:0;overflow:auto"><p data-result role="status" aria-live="polite">Seçilen paket: ${Number(pkg.total).toLocaleString('tr-TR')} Lidya / ${Number(pkg.price_try).toLocaleString('tr-TR')} TL</p><form data-details style="display:grid;gap:12px;max-width:520px;margin:16px auto"><label>Ad Soyad<input name="billing_name" autocomplete="name" minlength="2" maxlength="60" required style="width:100%;padding:12px;box-sizing:border-box"></label><label>Telefon<input name="phone" autocomplete="tel" inputmode="tel" minlength="10" maxlength="20" required style="width:100%;padding:12px;box-sizing:border-box" placeholder="05XXXXXXXXX"></label><label>Fatura adresi<textarea name="billing_address" autocomplete="street-address" minlength="5" maxlength="400" required style="width:100%;box-sizing:border-box;padding:12px"></textarea></label><button type="submit" data-submit style="padding:14px">Güvenli ödeme ekranına geç</button></form><div data-frame style="width:100%;display:none"><iframe title="PayTR güvenli ödeme" referrerpolicy="strict-origin-when-cross-origin" style="border:0;width:100%;height:min(75dvh,700px)" loading="eager"></iframe><button data-refresh type="button" style="padding:14px">Ödeme durumunu yenile</button></div><p style="font-size:12px;opacity:.8">Bakiye yalnızca PayTR'nin sunucu onayı sonrasında yüklenir. Ödeme ekranından çıkmak ödeme iptali anlamına gelmez.</p></div>`;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.append(root);active={root,overflow,poll:null};root.querySelector('[data-close]').onclick=close;
    const info=root.querySelector('[data-result]'),form=root.querySelector('form'),frame=root.querySelector('[data-frame]');
    let oid='';
    async function update(){if(!oid)return;try{const d=await json('/v1/paytr/orders/'+encodeURIComponent(oid));if(!active||active.root!==root)return;const names={pending:'Ödeme sonucu bekleniyor',paid:'Ödeme onaylandı, Lidya yüklendi',failed:'Ödeme başarısız',test:'Test işlemi tamamlandı, gerçek bakiye yüklenmedi'};info.textContent=names[d.status]||('Sipariş durumu: '+d.status);if(d.status!=='pending'){clearInterval(active.poll);if(d.status==='paid')window.ErisProfile?.refresh?.()}}catch(e){info.textContent=e.message}}
    root.querySelector('[data-refresh]').onclick=update;
    form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[data-submit]');submit.disabled=true;info.textContent='PayTR ödeme ekranı hazırlanıyor…';try{const v=Object.fromEntries(new FormData(form));const d=await json('/v1/paytr/checkout',{method:'POST',body:JSON.stringify({package_id:pkg.id,...v})});if(!/^https:\/\/www\.paytr\.com\/odeme\/guvenli\/[A-Za-z0-9_-]+$/.test(d.iframe_url))throw Error('Ödeme adresi geçersiz');oid=d.oid;form.style.display='none';frame.style.display='block';frame.querySelector('iframe').src=d.iframe_url;info.textContent='Ödeme ekranı açıldı. Sonuç bekleniyor…';active.poll=setInterval(update,5000)}catch(err){info.textContent=err.message;submit.disabled=false}};
  }
  async function catalog(){
    const data=await json('/v1/purchases/catalog');
    if(!Array.isArray(data.packages))throw Error('Paket listesi bulunamadı');
    close();
    const shell=document.createElement('div');shell.style.cssText='position:fixed;inset:0;z-index:24999;background:var(--ui-panel,#18130f);color:var(--ui-ink,#fff);padding:20px;overflow:auto;box-sizing:border-box';
    const heading=document.createElement('h2');heading.textContent='PayTR ile Lidya yükle';
    const back=document.createElement('button');back.textContent='Kapat';back.onclick=()=>{shell.remove()};
    shell.append(back,heading);
    const list=document.createElement('div');list.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:700px;margin:auto';
    for(const pkg of data.packages){const b=document.createElement('button');b.style.cssText='padding:18px 10px;border-radius:12px;background:var(--ui-button,#34291b);color:inherit;border:1px solid var(--ui-line,#96774d)';b.textContent=Number(pkg.total).toLocaleString('tr-TR')+' Lidya • '+Number(pkg.price_try).toLocaleString('tr-TR')+' TL';b.onclick=()=>{shell.remove();panel(pkg)};list.append(b)}
    shell.append(list);document.body.append(shell);
  }
  async function mount(){
    if(!await enabled())return;
    const shop=document.getElementById('shop');if(!shop||shop.querySelector('[data-paytr-entry]'))return;
    const b=document.createElement('button');b.dataset.paytrEntry='';b.type='button';b.textContent='💳 PayTR ile Lidya Yükle';
    b.style.cssText='display:block;min-height:50px;padding:12px 20px;margin:16px 0;border-radius:14px;background:var(--ui-button,#493515);color:var(--ui-ink,#fff);border:2px solid var(--ui-line,#a48139);font-weight:700';
    b.onclick=()=>catalog().catch(e=>alert(e.message));shop.insertBefore(b,shop.querySelector('#shopLiveMount'));
  }
  window.LidyaPayTR={enabled,open:panel,openCatalog:catalog,close};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
