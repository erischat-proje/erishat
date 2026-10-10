(() => {
  'use strict';
  const groups=[
    ['Profil görünürlüğü',[
      ['hide_vip','VIP bilgilerimi gizle','VIP seviyeni, rozetini, neonunu, girişini ve ünvanını başkalarından gizler.'],
      ['hide_vip_badge','VIP rozetimi gizle','Profilindeki VIP rozetini gizler.'],
      ['hide_vip_neon','VIP neonumu gizle','VIP neon görünümünü gizler.'],
      ['hide_vip_entry','VIP girişimi gizle','Oda girişindeki VIP efektini gizler.'],
      ['hide_vip_title','VIP ünvanımı gizle','VIP ünvanının başkalarına görünmesini kapatır.'],
      ['hide_location','Konumumu gizle','Konumunu başkalarından gizler ve konuma göre keşif listesinde görünmeni kapatır.']]],
    ['Hayranlar ve hediyeler',[
      ['hide_fans','Hayran listemi gizle','Başkaları hayran sıralamanı ve kişiye göre hediye detaylarını göremez. Kendi listeni görmeye devam edersin.'],
      ['hide_received_gifts','Aldığım hediyeleri gizle','Alınan hediyeleri, adetlerini ve tutarlarını başkalarından gizler. Kendi kayıtların sende kalır.']]],
    ['Bildirimler',[
      ['hide_notifications','Bildirimlerimi gizle','Uygulama içindeki bildirim listesini ve yeni bildirim kartlarını gizler.']]]
  ];
  let epoch=0,busy=false,state=null;const roots=new Map();
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const api=(path,opts)=>window.ErisPlatform.api(path,opts);
  const style=document.createElement('style');style.textContent=`.epv{min-width:0;color:#f4eafa}.epv .epv-intro{margin:0 0 22px;color:#b7a7c4;line-height:1.6;font-size:14px}.epv h3{font-size:16px;letter-spacing:.02em;margin:24px 0 12px}.epv .epv-row{display:flex;gap:16px;align-items:center;padding:17px;margin:10px 0;background:#181020;border:1px solid #a87bcc28;border-radius:19px}.epv .epv-copy{flex:1;min-width:0;overflow-wrap:anywhere}.epv b{font-size:15px;display:block;line-height:1.5}.epv small{display:block;font-size:12px;color:#ab9ab8;line-height:1.6;margin-top:5px}.epv button.epv-switch{flex:none!important;position:relative;width:52px!important;min-width:52px!important;height:44px!important;padding:0!important;border:0!important;border-radius:14px!important;background:transparent!important;cursor:pointer}.epv-switch:before{content:'';position:absolute;left:0;right:0;top:8px;height:28px;border-radius:20px;background:#46344f}.epv-switch:after{content:'';position:absolute;left:4px;top:12px;width:20px;height:20px;border-radius:50%;background:#d0bedc}.epv-switch[aria-checked=true]:before{background:#9854c5}.epv-switch[aria-checked=true]:after{left:28px;background:#fff}.epv button:disabled{opacity:.55;cursor:wait}.epv button:focus-visible{outline:2px solid #dda9ff;outline-offset:4px}.epv .epv-status{min-height:24px;color:#c9a7e6;font-size:13px;line-height:1.6}.epv .epv-retry{width:auto!important;height:auto!important;min-height:44px;border:1px solid #9464b9;border-radius:12px;padding:10px 16px;background:#2b1938;color:#fff}.epv-note{font-size:12px;color:#ab9ab8;line-height:1.6}@media(max-width:360px){.epv .epv-row{padding:14px;gap:10px}}`;
  document.head.append(style);
  function clean(){for(const [r,valid] of roots)if(!r.isConnected||!valid())roots.delete(r)}
  function sync(message=''){
    clean();for(const root of roots.keys()){
      root.querySelectorAll('[data-epv-key]').forEach(b=>{const key=b.dataset.epvKey;b.setAttribute('aria-checked',String(!!state?.[key]));b.disabled=busy||!state||(key.startsWith('hide_vip_')&&!!state.hide_vip)});
      root.querySelector('.epv-status').textContent=message;
    }
  }
  async function load(){
    if(busy){sync('Ayarlar yükleniyor…');return}
    const g=epoch,account=token();if(!account){state=null;sync('Gizlilik ayarları için giriş yap.');return}
    busy=true;sync('Ayarlar yükleniyor…');
    try{const result=await api('/me/privacy');if(g!==epoch||account!==token())return;state=result;window.ErisNotifications?.apply?.(state);sync('Ayarların hesabına kaydedilir.');}
    catch(e){if(g!==epoch)return;state=null;sync('Ayarlar yüklenemedi. Yeniden dene.');}
    finally{if(g===epoch){busy=false;sync(state?'Ayarların hesabına kaydedilir.':'Ayarlar yüklenemedi. Yeniden dene.')}}
  }
  async function save(key){
    if(busy||!state)return;const g=epoch,account=token(),next=!state[key];busy=true;sync('Kaydediliyor…');
    try{
      const result=await api('/me/privacy',{method:'PATCH',body:JSON.stringify({[key]:next})});
      if(g!==epoch||account!==token())return;
      state=result;window.ErisNotifications?.apply?.(state);
      const verified=await api('/me/privacy');if(g!==epoch||account!==token())return;
      state=verified;if(state[key]!==next)throw Error('Ayar doğrulanamadı.');
      window.ErisNotifications?.apply?.(state);window.dispatchEvent(new CustomEvent('erischat:privacy',{detail:state}));
      window.ErisProfile?.refresh?.();busy=false;sync('Ayar kaydedildi.');
    }catch(e){if(g===epoch&&account===token()){busy=false;sync('Ayar kaydedilemedi veya doğrulanamadı. Yenile ve tekrar dene.')}}
  }
  async function render(root,valid=()=>true){
    root.classList.add('epv');root.replaceChildren();roots.set(root,valid);
    const intro=document.createElement('p');intro.className='epv-intro';intro.textContent='Profilinde nelerin görüneceğini sen seç. Açık olan seçenekler ilgili bilgiyi gizler.';root.append(intro);
    for(const [title,items] of groups){const h=document.createElement('h3');h.textContent=title;root.append(h);for(const [key,label,description] of items){const row=document.createElement('div');row.className='epv-row';const copy=document.createElement('div');copy.className='epv-copy';const name=document.createElement('b');name.textContent=label;const small=document.createElement('small');small.textContent=description;copy.append(name,small);const button=document.createElement('button');button.type='button';button.className='epv-switch';button.dataset.epvKey=key;button.setAttribute('role','switch');button.setAttribute('aria-label',label);button.setAttribute('aria-checked','false');button.disabled=true;button.onclick=()=>save(key);row.append(copy,button);root.append(row)}}
    const note=document.createElement('p');note.className='epv-note';note.textContent='VIP bilgilerimi gizle açıkken alt VIP seçenekleri birlikte gizlenir. Bu seçimleri ayrı yapmak için önce ana VIP seçeneğini kapat.';
    const status=document.createElement('p');status.className='epv-status';status.setAttribute('role','status');const retry=document.createElement('button');retry.type='button';retry.className='epv-retry';retry.textContent='Ayarları yenile';retry.onclick=()=>{if(!busy)load()};root.append(note,status,retry);await load();
  }
  window.ErisPrivacy={load,render};
  const start=()=>{const legacy=document.querySelector('[data-privacy-page]');if(legacy)render(legacy)};
  window.addEventListener('erischat:auth',()=>{epoch++;busy=false;state=null;sync('Ayarlar yeniden yükleniyor…');if(token())load()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
