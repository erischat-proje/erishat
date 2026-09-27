(() => {
  'use strict';
  const api = () => window.ErisPlatform;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => api()?.getAccessToken?.() || localStorage.getItem('erischat_access_token') || localStorage.getItem('token') || '';
  let loading = false;
  const style = document.createElement('style');
  style.textContent = '.eris-stories{margin:0 0 15px;padding:12px;border:1px solid #ffffff14;border-radius:20px;background:linear-gradient(135deg,#17121f,#0c0a11)}.eris-stories-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.eris-stories-head b{font-size:12px}.eris-stories-head small{display:block;color:#9b92a4;font-size:9px;margin-top:3px}.eris-stories-row{display:flex;gap:12px;overflow-x:auto;padding:2px 1px 5px;scrollbar-width:none}.eris-story{border:0;background:transparent;color:#fff;padding:0;flex:0 0 64px;text-align:center}.eris-story-face{width:58px;height:58px;border-radius:20px;margin:0 auto 5px;border:2px solid #aa75ff;padding:2px;background:linear-gradient(140deg,#8a5cff,#ff4fa3);display:grid;place-items:center;font-size:22px;overflow:hidden}.eris-story-face img{width:100%;height:100%;object-fit:cover;border-radius:16px}.eris-story.seen .eris-story-face{border-color:#77717f;opacity:.78}.eris-story-name{display:block;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.eris-story-add .eris-story-face{background:#ffffff0a;border:1px dashed #aa75ff;color:#bd9cff;font-size:27px}.eris-story-viewer{position:fixed;inset:0;z-index:21000;background:#05040a;display:flex;align-items:center;justify-content:center;color:#fff}.eris-story-viewer img{max-width:100vw;max-height:84vh;object-fit:contain}.eris-story-viewer header{position:absolute;top:max(12px,env(safe-area-inset-top));left:14px;right:14px;display:flex;align-items:center;gap:9px}.eris-story-viewer header b{flex:1}.eris-story-viewer footer{position:absolute;left:18px;right:18px;bottom:max(20px,env(safe-area-inset-bottom));text-align:center;font-size:12px;text-shadow:0 1px 7px #000}.eris-story-modal{position:fixed;inset:0;z-index:20500;background:#020107c9;display:grid;place-items:center;padding:18px}.eris-story-modal section{width:min(430px,100%);padding:17px;border:1px solid #ffffff20;border-radius:22px;background:#100d16;color:#fff}.eris-story-modal input{width:100%;margin:12px 0;padding:12px;border:1px solid #ffffff20;border-radius:12px;background:#ffffff08;color:#fff}.eris-story-modal button{border:1px solid #ffffff1c;border-radius:11px;padding:10px;background:#ffffff08;color:#fff}.eris-story-modal .story-primary{background:linear-gradient(120deg,#8055ff,#ef4eac);border:0;font-weight:800}.eris-story-progress{height:3px;background:#ffffff42;position:absolute;top:max(8px,env(safe-area-inset-top));left:14px;right:14px;border-radius:9px}.eris-story-progress i{display:block;height:100%;background:#fff;border-radius:9px}';
  document.head.append(style);

  function mount() {
    const explore = document.getElementById('explore');
    if (!explore || explore.querySelector('[data-eris-stories]')) return explore?.querySelector('[data-eris-stories]');
    const root = document.createElement('section'); root.className = 'eris-stories'; root.dataset.erisStories = '';
    root.innerHTML = '<div class="eris-stories-head"><div><b>Story’ler</b><small>Paylaşımlar 24 saat sonra silinir</small></div><button type="button" class="close" data-story-add aria-label="Story paylaş">＋</button></div><div class="eris-stories-row" data-story-list></div>';
    const tabs = explore.querySelector('.tabs'); explore.insertBefore(root, tabs || explore.firstChild.nextSibling);
    root.querySelector('[data-story-add]').onclick = () => compose(root);
    return root;
  }

  async function load() {
    const root = mount(); if (!root || loading || !(token())) return;
    loading = true;
    const list = root.querySelector('[data-story-list]');
    try {
      const rows = await api().stories(100); list.replaceChildren();
      list.append(storyButton({id:'new',nickname:'Story ekle',avatar:'＋',isAdd:true}, root));
      rows.forEach(item => list.append(storyButton(item, root)));
    } catch (error) { list.innerHTML = '<small style="color:#f7aac7;font-size:9px">Story’ler yüklenemedi. Tekrar denemek için sayfayı yenileyin.</small>'; }
    finally { loading = false; }
  }

  function storyButton(item, root) {
    const button = document.createElement('button'); button.type='button'; button.className='eris-story'+(item.viewed?' seen':'')+(item.isAdd?' eris-story-add':'');
    const face=document.createElement('span');face.className='eris-story-face';
    const avatar=item.avatar_asset||item.avatar||'👤';
    if(!item.isAdd&&typeof avatar==='string'&&/^(https?:|\/|data:|\.\.?\/)/.test(avatar)){const img=document.createElement('img');img.alt='';img.src=window.ErisChatCosmetics?.assetUrl?.(avatar)||avatar;face.append(img)}else face.textContent=item.isAdd?'＋':avatar;
    const name=document.createElement('span');name.className='eris-story-name';name.textContent=item.isAdd?'Story ekle':item.nickname||'Kullanıcı';button.append(face,name);
    button.onclick=()=>item.isAdd?compose(root):openStory(item);
    return button;
  }

  function compose(root) {
    const modal=document.createElement('div');modal.className='eris-story-modal';
    modal.innerHTML='<section><div style="display:flex;justify-content:space-between;align-items:center"><div><b>24 saatlik story paylaş</b><small style="display:block;margin-top:4px;color:#aaa1b1;font-size:9px">Fotoğrafın takipçilerine gösterilir.</small></div><button type="button" data-close>×</button></div><input data-caption maxlength="300" placeholder="Bir not ekle (isteğe bağlı)"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" data-gallery>🖼 Galeriden seç</button><button type="button" data-camera>📷 Fotoğraf çek</button></div><small data-status style="display:block;margin-top:10px;color:#aaa1b1;font-size:9px">Story 24 saat sonra otomatik kaldırılır.</small></section>';
    document.body.append(modal); modal.querySelector('[data-close]').onclick=()=>modal.remove(); modal.onclick=e=>{if(e.target===modal)modal.remove()};
    const choose=camera=>{const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif';if(camera)input.setAttribute('capture','environment');input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>10*1024*1024){window.toast?.('Fotoğraf en fazla 10 MB olabilir.');return}const status=modal.querySelector('[data-status]');status.textContent='Paylaşılıyor…';modal.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api().createStory(file,modal.querySelector('[data-caption]').value);modal.remove();window.toast?.('Story 24 saatliğine paylaşıldı.');await load()}catch(error){status.textContent=error.message||'Story paylaşılamadı.';modal.querySelectorAll('button').forEach(b=>b.disabled=false)}};input.click()};
    modal.querySelector('[data-gallery]').onclick=()=>choose(false);modal.querySelector('[data-camera]').onclick=()=>choose(true);
  }

  async function openStory(item) {
    const tokenValue=token(),url=api().storyMediaUrl(item.media_url);let objectUrl;
    try {const response=await fetch(url,{headers:tokenValue?{Authorization:'Bearer '+tokenValue}:{},cache:'no-store'});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.detail||'Story açılamadı.')}objectUrl=URL.createObjectURL(await response.blob())}
    catch(error){window.toast?.(error.message||'Story açılamadı.');await load();return}
    const viewer=document.createElement('div');viewer.className='eris-story-viewer';viewer.innerHTML='<div class="eris-story-progress"><i></i></div><header><b></b><button type="button" class="close" style="color:white">×</button></header><img alt="Story"><footer></footer>';
    viewer.querySelector('header b').textContent=item.nickname||'Kullanıcı';viewer.querySelector('img').src=objectUrl;viewer.querySelector('footer').textContent=item.caption||'';document.body.append(viewer);
    const close=()=>{clearTimeout(timer);URL.revokeObjectURL(objectUrl);viewer.remove()};viewer.querySelector('button').onclick=close;let timer=setTimeout(close,6000);
    const myId=window.ErisAuth?.user?.id;
    if(item.is_mine||(myId&&String(myId)===String(item.user_id))){
      const remove=document.createElement('button');remove.type='button';remove.className='close';remove.textContent='Sil';remove.style.cssText='color:#fff;border:1px solid #ffffff30;background:#21131c;padding:0 12px;width:auto';
      remove.onclick=async()=>{if(!window.confirm('Bu story silinsin mi?'))return;remove.disabled=true;try{await api().deleteStory(item.id);close();window.toast?.('Story silindi.');await load()}catch(error){remove.disabled=false;window.toast?.(error.message||'Story silinemedi.')}};
      viewer.querySelector('header').insertBefore(remove,viewer.querySelector('header button'));
    }
    await load();
  }

  window.ErisChatStories={load,compose};
  const run=()=>{if(document.getElementById('explore')?.classList.contains('show'))load()};
  document.addEventListener('DOMContentLoaded',run);window.addEventListener('erischat:auth',run);document.addEventListener('visibilitychange',()=>{if(!document.hidden)run()});
})();
