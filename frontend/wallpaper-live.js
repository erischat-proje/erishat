(() => {
  'use strict';
  const API=()=> (window.ERIS_API||window.ERISCHAT_API||'https://erischat-production.up.railway.app/v1').replace(/\/$/,'');
  const token=()=>localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';
  const api=async(path,options={})=>{const h=new Headers(options.headers||{});h.set('Accept','application/json');if(options.body!==undefined)h.set('Content-Type','application/json');const t=token();if(t)h.set('Authorization','Bearer '+t);const r=await fetch(API()+path,{...options,headers:h});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.detail||'HTTP '+r.status);return d};
  const url=k=>window.ErisChatCosmetics?.assetUrl?window.ErisChatCosmetics.assetUrl(k):k;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function render(){
    const root=document.getElementById('shop'); if(!root)return;
    let box=root.querySelector('[data-eris-wallpapers]');
    if(!box){box=document.createElement('section');box.dataset.erisWallpapers='';box.style.cssText='margin-top:16px;padding-top:14px;border-top:1px solid #ffffff12';root.appendChild(box)}
    box.innerHTML='<div style="font-weight:900;font-size:12px">🌌 Duvar Kağıtları</div><div style="font-size:9px;color:#938a9f;margin:4px 0 10px">Normal koleksiyon satın alınabilir; VIP koleksiyonu seviyeye göre açılır.</div><div data-wg style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">Yükleniyor…</div>';
    const grid=box.querySelector('[data-wg]');
    try{
      const [data,vip,user,ownedData]=await Promise.all([api('/wallpapers'),api('/me/vip'),api('/me'),api('/me/cosmetics')]);
      const items=data.items||[]; const level=Number(vip.level||0);
      const owned=ownedData.items||[];
      const own=new Set(owned.filter(x=>x.cosmetic_type==='wallpaper').map(x=>x.asset_key));
      grid.innerHTML='';
      items.forEach(item=>{
        const unlocked=item.tier==='normal'||level>=Number(item.vip_level||0);
        const card=document.createElement('article');card.style.cssText='border:1px solid #ffffff12;border-radius:14px;background:#100d16;padding:7px;overflow:hidden';
        card.innerHTML='<div style="height:100px;border-radius:10px;background:center/cover url("'+esc(url(item.asset))+'");"></div><div style="font-size:9px;font-weight:800;margin-top:6px">'+(item.tier==='vip'?'👑 VIP '+item.vip_level:'🌌 Standart')+'</div><div style="font-size:8px;color:#938a9f;margin-top:3px">'+(item.tier==='vip'?(unlocked?'Açık':'VIP '+item.vip_level+' gerekli'):Number(item.price).toLocaleString('tr-TR')+' Lidya')+'</div>';
        const b=document.createElement('button');b.style.cssText='width:100%;border:0;border-radius:9px;padding:7px;margin-top:6px;background:linear-gradient(135deg,#754cff,#ff4fa3);color:#fff;font-size:8px;font-weight:900';
        if(!unlocked){b.textContent='🔒 Kilitli';b.disabled=true}
        else if(own.has(item.key)||item.tier==='vip'){b.textContent='✓ Uygula';b.onclick=async()=>{try{await api('/me/wallpaper/apply',{method:'POST',body:JSON.stringify({asset_key:item.key})});await window.ErisChatCosmetics?.load?.();window.toast?.('Duvar kağıdı uygulandı ✓')}catch(e){window.toast?.(e.message||'İşlem başarısız.')}}}
        else {b.textContent='Satın al • '+Number(item.price).toLocaleString('tr-TR');b.onclick=async()=>{try{await api('/me/wallpaper/purchase',{method:'POST',body:JSON.stringify({asset_key:item.key})});await render();window.toast?.('Duvar kağıdı satın alındı ✓')}catch(e){window.toast?.(e.message||'İşlem başarısız.')}}}
        card.appendChild(b);grid.appendChild(card);
      });
    }catch(e){grid.innerHTML='<div style="font-size:9px;color:#938a9f">'+esc(e.message)+'</div>'}
  }
  window.ErisChatWallpapers={render};
  window.addEventListener('erischat:auth',e=>{if(e.detail?.state==='ready')render()});
  window.addEventListener('erischat:cosmetics-updated',()=>render());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();