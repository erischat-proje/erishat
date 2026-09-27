(() => {
  'use strict';
  const api = () => window.ErisPlatform;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => api()?.getAccessToken?.() || localStorage.getItem('erischat_access_token') || localStorage.getItem('token') || '';
  const objectUrls = new Set();
  let mode = 'for-you';
  let busy = false;
  const style = document.createElement('style');
  style.textContent = `
    #explore>.title{font-size:27px;margin:0 0 4px}#explore>.eyebrow{margin-top:0}
    .ec-explore-subnav{display:flex;gap:8px;margin:2px 0 10px;padding:3px 0}.ec-explore-subnav button{flex:1;border:1px solid #ffffff16;border-radius:12px;background:#ffffff05;color:#aaa1b2;padding:9px 12px;font-size:12px;font-weight:700}.ec-explore-subnav button[aria-selected=true]{border-color:#a77aff;background:#8a5cff20;color:#fff}.ec-social-directory{margin-top:2px}.ec-social-directory[hidden],.ec-social[hidden]{display:none!important}
    .ec-social{margin:0 0 15px;padding:0 0 8px;border:0;border-radius:0;background:transparent;color:#fff}
    .ec-social-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 9px}.ec-social-head h2{font-size:15px;margin:0}.ec-social-head small{display:none}
    .ec-social-create-wrap{display:flex;align-items:center;gap:8px}.ec-social-create{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:9px;border:1px solid #ffffff18;border-radius:14px;background:#ffffff06;color:#aaa1b2}.ec-social-create b{color:#fff;font-size:12px;font-weight:600}.ec-social-photo-action{flex:0 0 43px;width:43px;height:43px;border:1px solid #ffffff18;border-radius:14px;background:#ffffff08;color:#fff;font-size:18px}
    .ec-social-modes{display:flex;gap:16px;overflow:auto;margin:10px 0 4px;padding:0 2px 7px;border-bottom:1px solid #ffffff12;scrollbar-width:none}.ec-social-modes button{white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:#9992a1;padding:8px 0;font-size:12px}.ec-social-modes button[aria-selected=true]{color:#fff;border-bottom-color:#bd77ff}
    .ec-social-post{padding:12px 0;border-top:1px solid #ffffff12}.ec-social-author{display:flex;align-items:center;gap:9px}.ec-social-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(140deg,#754cff,#d83ca6);overflow:hidden;font-size:16px}.ec-social-author .ec-social-avatar img{width:100%;height:100%;object-fit:cover}.ec-social-author b{font-size:12px}.ec-social-date{display:block;color:#928a9a;font-size:10px;margin-top:2px}.ec-social-menu{margin-left:auto;position:relative}.ec-social-menu summary{list-style:none;cursor:pointer;color:#aaa1b2;padding:5px 8px}.ec-social-menu[open] button{position:absolute;right:0;top:28px;z-index:3;width:max-content;background:#1a1522;border:1px solid #ffffff18;color:#fff;border-radius:10px;padding:9px 12px}.ec-social-caption{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.48;margin:10px 0}.ec-social-photo{display:block;width:100%;max-height:min(78vh,850px);object-fit:contain;border-radius:12px;background:#09070d}.ec-social-empty{text-align:center;color:#a99fb1;font-size:12px;padding:20px 8px}.ec-social-modal{position:fixed;inset:0;z-index:21010;background:#020107d9;display:grid;place-items:center;padding:16px}.ec-social-modal section{width:min(500px,100%);max-height:90vh;overflow:auto;padding:16px;border:1px solid #ffffff20;border-radius:22px;background:#100d16;color:#fff}.ec-social-modal textarea{width:100%;box-sizing:border-box;min-height:120px;resize:vertical;margin:12px 0;padding:12px;border:1px solid #ffffff18;border-radius:13px;background:#ffffff07;color:#fff;font:inherit;font-size:12px}.ec-social-modal button{border:1px solid #ffffff18;border-radius:11px;padding:10px 12px;background:#ffffff08;color:#fff}.ec-social-modal .ec-primary{border:0;background:linear-gradient(120deg,#8055ff,#ef4eac);font-weight:800}.ec-social-modal [data-preview]{display:block;max-width:100%;max-height:230px;margin:8px auto;border-radius:12px}
    #erisProfileHub .eph-tabs{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
    #erisProfileHub .eph-tabs button{display:flex;align-items:center;justify-content:flex-start;text-align:left;min-height:48px;padding:11px 13px!important;border-radius:14px!important;background:linear-gradient(145deg,#17131d,#100d15)!important;border-color:#ffffff14!important;color:#e7e0ec!important;font-size:12px!important}
    #erisProfileHub .eph-tabs button[aria-selected=true]{background:#754cff24!important;border-color:#9b76ff!important;color:#fff!important;box-shadow:inset 3px 0 #a77aff!important}
    @media(max-width:360px){#erisProfileHub .eph-tabs button{font-size:11px!important;padding:9px!important}}
  `;
  document.head.append(style);

  function cleanupUrls(){ for(const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear(); }
  function ensureExploreLayout(view,root){
    let menu=view.querySelector('.ec-explore-subnav');
    if(!menu){menu=document.createElement('nav');menu.className='ec-explore-subnav';menu.setAttribute('aria-label','Keşfet bölümleri');menu.innerHTML='<button type="button" data-pane="feed" aria-selected="true">Akış</button><button type="button" data-pane="social" aria-selected="false">Sosyal</button>';menu.querySelectorAll('[data-pane]').forEach(button=>button.onclick=()=>setPane(view,button.dataset.pane));}
    const story=view.querySelector('[data-eris-stories]');
    if(story?.nextElementSibling!==menu)view.insertBefore(menu,story?.nextSibling||root);
    let directory=view.querySelector('[data-social-directory]');
    if(!directory){directory=document.createElement('div');directory.className='ec-social-directory';directory.dataset.socialDirectory='';directory.hidden=true;}
    for(const selector of ['.tabs','#rooms','#people','#followingRooms','#erisDiscoverySettings']){const node=view.querySelector(selector);if(node&&node.parentElement!==directory)directory.append(node)}
    if(root.nextElementSibling!==directory)view.insertBefore(directory,root.nextSibling);
    if(!menu.dataset.bound){menu.querySelectorAll('[data-pane]').forEach(button=>button.onclick=()=>setPane(view,button.dataset.pane));menu.dataset.bound='true'}
    if(!view.dataset.explorePane)view.dataset.explorePane='feed';
    setPane(view,view.dataset.explorePane);
  }
  function setPane(view,pane){
    view.dataset.explorePane=pane;
    const root=view.querySelector('[data-ec-social]'),directory=view.querySelector('[data-social-directory]');
    if(root)root.hidden=pane!=='feed';if(directory)directory.hidden=pane!=='social';
    view.querySelectorAll('.ec-explore-subnav [data-pane]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.pane===pane)));
  }
  async function imageUrl(path){
    const response=await fetch(api().postMediaUrl(path),{headers:token()?{Authorization:'Bearer '+token()}: {},cache:'no-store'});
    if(!response.ok)throw new Error('Fotoğraf yüklenemedi.');
    const url=URL.createObjectURL(await response.blob());objectUrls.add(url);return url;
  }
  function mount(){
    const view=document.getElementById('explore');if(!view)return null;
    let root=view.querySelector('[data-ec-social]');
    if(!root){root=document.createElement('section');root.className='ec-social';root.dataset.ecSocial='';
      root.innerHTML='<div class="ec-social-head"><div><h2>Gönderiler</h2><small>Topluluktan paylaşımlar</small></div></div><div class="ec-social-create-wrap"><button type="button" class="ec-social-create" data-compose><span class="ec-social-avatar">＋</span><b>Bir gönderi paylaş…</b></button><button type="button" class="ec-social-photo-action" data-compose-photo aria-label="Fotoğraf paylaş">▧</button></div><div class="ec-social-modes" role="tablist" aria-label="Gönderi akışı"><button type="button" data-mode="following">Takip edilen</button><button type="button" data-mode="for-you">Senin için</button><button type="button" data-mode="recent">En son</button></div><div data-feed><div class="ec-social-empty">Gönderiler yükleniyor…</div></div>';
      root.querySelector('[data-compose]').onclick=()=>compose();
      root.querySelector('[data-compose-photo]').onclick=()=>compose(null,true);
      root.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;loadFeed(root)});
    }
    const story=view.querySelector('[data-eris-stories]');
    if(story&&story.nextElementSibling!==root)view.insertBefore(root,story.nextSibling);
    else if(!root.parentElement){const tabs=view.querySelector('.tabs');view.insertBefore(root,tabs||view.firstChild)}
    ensureExploreLayout(view,root);
    return root;
  }
  function formatDate(value){try{return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}catch(_){return ''}}
  async function renderPosts(container,rows,owner){
    cleanupUrls();container.replaceChildren();
    if(!rows.length){const empty=document.createElement('div');empty.className='ec-social-empty';empty.textContent=owner?'Henüz gönderin yok. İlk paylaşımını yap.':'Henüz gönderi yok. Takip ettiklerinin paylaşımları burada görünür.';container.append(empty);return}
    for(const post of rows){
      const card=document.createElement('article');card.className='ec-social-post';
      const avatar=post.avatar_asset||post.avatar||'👤';
      card.innerHTML='<div class="ec-social-author"><span class="ec-social-avatar" data-avatar></span><span style="min-width:0"><b></b><small class="ec-social-date"></small></span>'+(owner?'<details class="ec-social-menu"><summary aria-label="Gönderi işlemleri">•••</summary><button type="button" data-edit>✎ Düzenle</button><button type="button" data-delete>Sil</button></details>':'')+'</div><div class="ec-social-caption"></div><div data-photo></div>';
      const avatarEl=card.querySelector('[data-avatar]');if(typeof avatar==='string'&&/^(https?:|\/|data:|\.\.?\/)/.test(avatar)){const img=document.createElement('img');img.src=window.ErisChatCosmetics?.assetUrl?.(avatar)||avatar;img.alt='';avatarEl.append(img)}else avatarEl.textContent=avatar;
      card.querySelector('.ec-social-author b').textContent=post.nickname||'ErisChat kullanıcısı';card.querySelector('.ec-social-date').textContent=formatDate(post.created_at)+(post.updated_at&&post.created_at!==post.updated_at?' · düzenlendi':'');card.querySelector('.ec-social-caption').textContent=post.caption||'';
      if(post.media_url){try{const img=document.createElement('img');img.className='ec-social-photo';img.alt='Gönderi fotoğrafı';img.src=await imageUrl(post.media_url);card.querySelector('[data-photo]').append(img)}catch(_){}}
      if(owner){card.querySelector('[data-edit]').onclick=()=>compose(post);card.querySelector('[data-delete]').onclick=async()=>{if(!window.confirm('Bu gönderi silinsin mi?'))return;try{await api().deletePost(post.id);window.toast?.('Gönderi silindi.');if(owner==='profile')await loadMine(container);else await loadFeed()}catch(e){window.toast?.(e.message||'Gönderi silinemedi.')}}}
      container.append(card);
    }
  }
  async function loadFeed(root=mount()){
    if(!root||busy||!api())return;busy=true;root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.mode===mode)));
    const target=root.querySelector('[data-feed]');target.innerHTML='<div class="ec-social-empty">Gönderiler yükleniyor…</div>';
    try{await renderPosts(target,await api().socialFeed(mode,30,0),false)}catch(e){target.textContent=e.message||'Gönderiler yüklenemedi.'}finally{busy=false}
  }
  async function loadMine(container){
    if(!container||!api())return;container.innerHTML='<div class="ec-social-empty">Gönderilerin yükleniyor…</div>';
    try{await renderPosts(container,await api().myPosts(100,0),'profile')}catch(e){container.textContent=e.message||'Gönderilerin yüklenemedi.'}
  }
  function compose(post=null,startWithPhoto=false){
    const modal=document.createElement('div');modal.className='ec-social-modal';
    modal.innerHTML='<section><header style="display:flex;align-items:center;justify-content:space-between"><div><b>'+(post?'Gönderiyi düzenle':'Yeni gönderi')+'</b><small style="display:block;color:#aaa1b1;font-size:10px;margin-top:4px">Metin veya fotoğraf paylaşabilirsin.</small></div><button type="button" data-close aria-label="Kapat">×</button></header><textarea maxlength="2000" data-caption placeholder="Aklından ne geçiyor?\nEn fazla 2000 karakter"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-gallery>🖼 Galeriden seç</button><button type="button" data-camera>📷 Fotoğraf çek</button><button type="button" data-remove '+(!post?.media_url?'hidden':'')+'>Fotoğrafı kaldır</button></div><img data-preview alt="Seçilen fotoğraf" hidden><input type="file" data-file accept="image/jpeg,image/png,image/webp,image/gif" hidden><div data-status style="color:#aaa1b1;font-size:10px;margin:10px 0;min-height:14px"></div><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-cancel>Vazgeç</button><button type="button" class="ec-primary" data-save>'+(post?'Değişiklikleri kaydet':'Paylaş')+'</button></div></section>';
    document.body.append(modal);const caption=modal.querySelector('[data-caption]'),file=modal.querySelector('[data-file]'),preview=modal.querySelector('[data-preview]'),status=modal.querySelector('[data-status]'),save=modal.querySelector('[data-save]');caption.value=post?.caption||'';let removeImage=false,localUrl='',remoteUrl='';
    const close=()=>{if(localUrl)URL.revokeObjectURL(localUrl);if(remoteUrl){URL.revokeObjectURL(remoteUrl);objectUrls.delete(remoteUrl)}modal.remove()};modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
    const choose=camera=>{file.value='';if(camera)file.setAttribute('capture','environment');else file.removeAttribute('capture');file.click()};modal.querySelector('[data-gallery]').onclick=()=>choose(false);modal.querySelector('[data-camera]').onclick=()=>choose(true);
    file.onchange=()=>{const selected=file.files?.[0];if(!selected)return;if(selected.size>10*1024*1024){file.value='';status.textContent='Fotoğraf en fazla 10 MB olabilir.';return}if(localUrl)URL.revokeObjectURL(localUrl);localUrl=URL.createObjectURL(selected);preview.src=localUrl;preview.hidden=false;removeImage=false};
    modal.querySelector('[data-remove]').onclick=()=>{file.value='';preview.removeAttribute('src');preview.hidden=true;removeImage=true;status.textContent='Fotoğraf kaldırılacak.'};
    if(post?.media_url)imageUrl(post.media_url).then(url=>{if(!modal.isConnected){URL.revokeObjectURL(url);objectUrls.delete(url);return}remoteUrl=url;preview.src=url;preview.hidden=false}).catch(()=>{});
    save.onclick=async()=>{save.disabled=true;status.textContent='Kaydediliyor…';try{if(post)await api().updatePost(post.id,caption.value,file.files?.[0]||null,removeImage);else await api().createPost(caption.value,file.files?.[0]||null);close();window.toast?.(post?'Gönderi güncellendi.':'Gönderi paylaşıldı.');const feed=mount();if(feed)await loadFeed(feed);const mine=document.querySelector('#erisProfileHub [data-posts-list]');if(mine)await loadMine(mine)}catch(e){status.textContent=e.message||'Gönderi kaydedilemedi.';save.disabled=false}};
    if(startWithPhoto)setTimeout(()=>choose(false),80);
  }
  window.ErisSocialFeed={load:()=>loadFeed(),loadMine,compose};
  function boot(){const root=mount();if(root&&document.getElementById('explore')?.classList.contains('show'))loadFeed(root)}
  document.addEventListener('DOMContentLoaded',boot);window.addEventListener('erischat:auth',boot);document.addEventListener('visibilitychange',()=>{if(!document.hidden)boot()});
  document.addEventListener('click',event=>{if(event.target.closest('nav.nav button[onclick*="explore"]'))setTimeout(boot,50)});
})();
