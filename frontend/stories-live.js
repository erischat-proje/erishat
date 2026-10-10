(() => {
  'use strict';
  const api = () => window.ErisPlatform;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => api()?.getAccessToken?.() || localStorage.getItem('erischat_access_token') || localStorage.getItem('token') || '';
  let loading = false;
  const style = document.createElement('style');
  style.textContent = '.eris-stories{margin:0 0 7px;padding:5px 0 10px;border:0;border-bottom:1px solid #ffffff12;border-radius:0;background:transparent;overflow:hidden}.eris-stories-head{display:none}.eris-stories-row{display:flex;gap:14px;overflow-x:auto;padding:3px 2px 5px;scrollbar-width:none}.eris-stories-row::-webkit-scrollbar{display:none}.eris-story-wrap{position:relative;flex:0 0 68px}.eris-story{position:relative;border:0;background:transparent;color:#fff;padding:0;flex:0 0 68px;text-align:center}.eris-story-face{position:relative;width:62px;height:62px;border-radius:50%;margin:0 auto 5px;border:2px solid transparent;padding:3px;background:linear-gradient(#100d16,#100d16) padding-box,linear-gradient(135deg,#ffc857,#ef347d,#8e4dff) border-box;display:grid;place-items:center;font-size:23px;overflow:visible}.eris-story-face img{width:100%;height:100%;object-fit:cover;border-radius:50%}.eris-story.seen .eris-story-face{background:linear-gradient(#100d16,#100d16) padding-box,linear-gradient(135deg,#6e6875,#403b47) border-box;opacity:.84}.eris-story-name{display:block;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e6e0eb}.eris-story-add .eris-story-face{background:linear-gradient(#100d16,#100d16) padding-box,linear-gradient(135deg,#494153,#393342) border-box}.eris-story-plus{position:absolute;right:2px;top:41px;width:22px;height:22px;padding:0;border:2px solid #100d16;border-radius:50%;display:grid;place-items:center;background:#fff;color:#15111b;font-size:18px;line-height:1;font-weight:700}.eris-story-viewer{position:fixed;inset:0;z-index:21000;background:#05040a;display:flex;align-items:center;justify-content:center;color:#fff}.eris-story-viewer img{max-width:100vw;max-height:84vh;object-fit:contain}.eris-story-viewer header{position:absolute;top:max(12px,env(safe-area-inset-top));left:14px;right:14px;display:flex;align-items:center;gap:9px}.eris-story-viewer header b{flex:1}.eris-story-viewer footer{position:absolute;left:18px;right:18px;bottom:max(20px,env(safe-area-inset-bottom));text-align:center;font-size:12px;text-shadow:0 1px 7px #000}.eris-story-modal{position:fixed;inset:0;z-index:20500;background:#020107c9;display:grid;place-items:center;padding:18px}.eris-story-modal section{width:min(430px,100%);padding:17px;border:1px solid #ffffff20;border-radius:22px;background:#100d16;color:#fff}.eris-story-modal input{width:100%;margin:12px 0;padding:12px;border:1px solid #ffffff20;border-radius:12px;background:#ffffff08;color:#fff}.eris-story-modal button{border:1px solid #ffffff1c;border-radius:11px;padding:10px;background:#ffffff08;color:#fff}.eris-story-modal .story-primary{background:linear-gradient(120deg,#8055ff,#ef4eac);border:0;font-weight:800}.eris-story-progress{height:3px;background:#ffffff42;position:absolute;top:max(8px,env(safe-area-inset-top));left:14px;right:14px;border-radius:9px}.eris-story-progress i{display:block;height:100%;background:#fff;border-radius:9px}';
  document.head.append(style);style.textContent += '.eris-story-viewer video{display:block;max-width:100%;max-height:82vh;border-radius:14px;background:#05040a}';
  style.textContent += '.eris-story-modal [hidden],.eris-story-viewer [hidden]{display:none!important}.eris-story-viewer header button,.eris-story-viewer footer button{border:1px solid #b996dc55;border-radius:12px;background:#21172b;color:#f5e8ff;min-width:35px;min-height:35px;padding:5px 10px}.eris-story-viewer footer{display:grid;gap:8px;text-align:left}.eris-story-reactions{display:flex;align-items:center;gap:8px}.eris-story-reactions button[aria-pressed=true]{color:#ff69b3}.eris-story-reactions input{flex:1;min-width:0;padding:9px 11px;border:1px solid #b996dc55;border-radius:12px;background:#1c1527;color:#fff}.eris-story-modal input{box-sizing:border-box}.eris-story-modal [data-gallery],.eris-story-modal [data-camera]{font-size:12px;min-height:39px}.eris-story-modal small{font-size:11px!important}';

  function mount() {
    const explore = document.getElementById('explore');
    if (!explore) return null;
    const existing=explore.querySelector('[data-eris-stories]');
    if(existing){const anchor=explore.querySelector('.ec-explore-subnav,[data-ec-social],.tabs');if(anchor&&existing.nextElementSibling!==anchor)explore.insertBefore(existing,anchor);return existing}
    const root = document.createElement('section'); root.className = 'eris-stories'; root.dataset.erisStories = '';
    root.innerHTML = '<div class="eris-stories-row" data-story-list aria-label="Hikâyeler"></div>';
    const anchor = explore.querySelector('.ec-explore-subnav,[data-ec-social],.tabs'); explore.insertBefore(root, anchor || explore.firstChild.nextSibling);
    return root;
  }

  async function load() {
    const root = mount(); if (!root || loading || !(token())) return;
    loading = true;
    const list = root.querySelector('[data-story-list]');
    try {
      const rows = await api().stories(100); list.replaceChildren();
      const own = rows.find(item => item.is_mine || (window.ErisAuth?.user?.id && String(item.user_id) === String(window.ErisAuth.user.id)));
      list.append(storyButton({...(own||{}),nickname:'Hikâyen',isAdd:true,ownStory:own}, root));
      const seenUsers = new Set();
      rows.filter(item => item !== own && !item.is_mine).forEach(item => {
        const key = String(item.user_id ?? item.id);
        if (seenUsers.has(key)) return; seenUsers.add(key); list.append(storyButton(item, root));
      });
    } catch (error) { list.innerHTML = '<small style="color:#f7aac7;font-size:9px">Story’ler yüklenemedi. Tekrar denemek için sayfayı yenileyin.</small>'; }
    finally { loading = false; }
  }

  function storyButton(item, root) {
    const wrapper = item.isAdd ? document.createElement('div') : null;
    if(wrapper)wrapper.className='eris-story-wrap';
    const button = document.createElement('button'); button.type='button'; button.className='eris-story'+(item.viewed?' seen':'')+(item.isAdd?' eris-story-add':'');
    const face=document.createElement('span');face.className='eris-story-face';
    const avatar=item.avatar_asset||item.avatar||window.ErisChatCosmetics?.state?.user?.avatar_asset||'👤';
    const isAsset=typeof avatar==='string'&&(/^(https?:|\/|data:|\.\.?\/)/.test(avatar)||(/[/.]/.test(avatar)&&/\.(?:png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i.test(avatar)));
    if(isAsset){const img=document.createElement('img');img.alt='';img.src=window.ErisChatCosmetics?.assetUrl?.(avatar)||avatar;face.append(img)}else if(avatar==='👤')face.innerHTML=window.ErisSocialMedia.icon('people');else face.textContent=avatar;
    const name=document.createElement('span');name.className='eris-story-name';name.textContent=item.isAdd?'Hikâyen':item.nickname||'Kullanıcı';if(!item.isAdd)window.ErisRoleBadges?.bind(name,item);button.append(face,name);
    button.setAttribute('aria-label',item.isAdd?'Hikâye ekle':`${item.nickname||'Kullanıcı'} hikâyesini görüntüle`);
    button.onclick=()=>item.isAdd?(item.ownStory?openStory(item.ownStory):compose(root)):openStory(item);
    if(!item.isAdd)return button;
    const plus=document.createElement('button');plus.type='button';plus.className='eris-story-plus';plus.textContent='+';plus.setAttribute('aria-label','Hikâye ekle');plus.onclick=()=>compose(root);
    wrapper.append(button,plus);return wrapper;
  }

  function compose(root) {
    const existing=document.querySelector('.ec-compose');if(existing){existing.querySelector('[data-close]')?.focus();return;}
    const modal=document.createElement('div');modal.className='eris-story-modal';
    modal.classList.add('ec-compose');const icon=window.ErisSocialMedia.icon;
    modal.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Hikâye paylaş"><header class="ec-compose-head"><div><span class="ec-compose-kicker">ERISCHAT / HİKÂYE</span><h2>Anını hikâyene ekle</h2><p>Takipçilerinle paylaş. 24 saat sonra kaybolur.</p></div><button type="button" data-close aria-label="Kapat">${icon('close')}</button></header><div class="ec-compose-body"><div class="ec-story-intro">${icon('image')}<strong>Senin günün, senin hikâyen.</strong><span>Bir fotoğraf veya 30 saniyelik sesli video ekle.</span></div><div class="ec-media-tools"><button type="button" data-gallery>${icon('image')}<span>Galeri<small>Hazır bir anı seç</small></span></button><button type="button" data-camera>${icon('camera')}<span>Kamera<small>Yeni bir an yakala</small></span></button></div><input type="file" data-file accept="image/*,video/*" hidden><img data-preview alt="Hikâye önizlemesi" hidden><video data-video-preview controls playsinline hidden><\/video><div class="ec-caption-wrap"><input data-caption maxlength="300" placeholder="Bir not ekle… (isteğe bağlı)"><small data-count>0 / 300</small></div><small data-status role="status">Paylaşmadan önce önizlemeyi kontrol edebilirsin.</small></div><footer class="ec-compose-footer"><span>24 saat · Takipçilerin</span><button type="button" class="story-primary" data-publish disabled>Paylaş ${icon('arrow')}</button></footer></section>`;
    document.body.append(modal);let file=null,url='',saving=false;const status=modal.querySelector('[data-status]');
    const close=()=>{if(saving)return;selection++;window.ErisSocialMedia.cancel(modal.querySelector('[data-file]'));modal.querySelector('[data-video-preview]').pause();if(url)URL.revokeObjectURL(url);modal.remove()};modal.querySelector('[data-close]').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
    const input=modal.querySelector('[data-file]'),publish=modal.querySelector('[data-publish]');let selection=0;
    const choose=camera=>window.ErisSocialMedia.choose(input,camera,modal.querySelector('[data-camera]'));
    input.onchange=async()=>{const next=window.ErisSocialMedia.selected(input);if(!next)return;const revision=++selection;file=null;publish.disabled=true;status.textContent='Medya kontrol ediliyor…';try{await window.ErisSocialMedia.validate(next,50);if(revision!==selection||!modal.isConnected)return;const video=next.type.startsWith('video/');file=next;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(file);const img=modal.querySelector('[data-preview]'),clip=modal.querySelector('[data-video-preview]');clip.pause();modal.querySelector('.ec-story-intro').hidden=true;img.hidden=video;clip.hidden=!video;if(video){clip.src=url;img.removeAttribute('src')}else{img.src=url;clip.removeAttribute('src')}status.textContent=file.name;publish.disabled=false}catch(error){if(revision===selection){window.ErisSocialMedia.clear(input);status.textContent=error.message;modal.querySelector('[data-preview]').hidden=true;modal.querySelector('[data-video-preview]').hidden=true;modal.querySelector('[data-video-preview]').pause();modal.querySelector('.ec-story-intro').hidden=false}}};
    modal.querySelector('[data-gallery]').onclick=()=>choose(false);modal.querySelector('[data-camera]').onclick=()=>choose(true);
    modal.querySelector('[data-caption]').oninput=e=>modal.querySelector('[data-count]').textContent=e.target.value.length+' / 300';window.ErisSocialMedia.bindDialog(modal,close);
    modal.querySelector('[data-publish]').onclick=async e=>{if(!file||saving)return;saving=true;e.currentTarget.disabled=true;status.textContent='Paylaşılıyor…';try{await api().createStory(file,modal.querySelector('[data-caption]').value);saving=false;close();window.toast?.('Hikâye paylaşıldı.');await load()}catch(error){saving=false;status.textContent=error.message||'Hikâye paylaşılamadı.';e.currentTarget.disabled=false}};
  }

  async function openStory(item) {
    const tokenValue=token(),url=api().storyMediaUrl(item.media_url);let objectUrl;
    try {const response=await fetch(url,{headers:tokenValue?{Authorization:'Bearer '+tokenValue}:{},cache:'no-store'});if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.detail||'Story açılamadı.')}objectUrl=URL.createObjectURL(await response.blob())}
    catch(error){window.toast?.(error.message||'Story açılamadı.');await load();return}
    const viewer=document.createElement('div');viewer.className='eris-story-viewer';viewer.innerHTML='<div class="eris-story-progress"><i></i></div><header><b></b><button type="button" class="close" style="color:white">×</button></header><footer></footer>';
    const isVideo=String(item.media_kind||item.mime_type||'').startsWith('video');
    const media=document.createElement(isVideo?'video':'img');media.alt='Story';
    if(isVideo){media.controls=true;media.autoplay=true;media.playsInline=true}
    media.src=objectUrl;viewer.insertBefore(media,viewer.querySelector('footer'));
    viewer.querySelector('header b').textContent=item.nickname||'Kullanıcı';window.ErisRoleBadges?.bind(viewer.querySelector('header b'),item);viewer.querySelector('footer').textContent=item.caption||'';document.body.append(viewer);
    const mine=!!item.is_mine||String(window.ErisAuth?.user?.id||'')===String(item.user_id);
    if(!mine){
      const actions=document.createElement('div');actions.className='eris-story-reactions';
      actions.innerHTML='<button type="button" data-like aria-label="Story beğen">♥ <span></span></button><input data-reply maxlength="1000" placeholder="Story’ye yorum yap…" aria-label="Story’ye yorum yap"><button type="button" data-send>Gönder</button><button type="button" data-report aria-label="Story’yi bildir">!</button>';
      viewer.querySelector('footer').append(actions);
      const like=actions.querySelector('[data-like]');const syncLike=()=>{like.setAttribute('aria-pressed',String(!!item.liked));like.querySelector('span').textContent=String(item.like_count||0)};syncLike();
      like.onclick=async()=>{like.disabled=true;try{const state=await api().api('/stories/'+item.id+'/like',{method:'POST'});Object.assign(item,state);syncLike()}catch(e){window.toast?.(e.message||'Beğeni gönderilemedi.')}finally{like.disabled=false}};
      const capture=async()=>{const c=document.createElement('canvas');c.width=400;c.height=440;const ctx=c.getContext('2d');ctx.fillStyle='#120d1c';ctx.fillRect(0,0,400,440);ctx.fillStyle='#f5e8ff';ctx.font='bold 19px system-ui';ctx.fillText(String(item.nickname||'Kullanıcı').slice(0,25),16,28);if(media.complete||media.readyState>=2){const w=media.videoWidth||media.naturalWidth,h=media.videoHeight||media.naturalHeight;try{const scale=Math.min(390/w,330/h);ctx.drawImage(media,(400-w*scale)/2,38,w*scale,h*scale)}catch(_){}}ctx.font='15px system-ui';ctx.fillText(String(item.caption||'Story').slice(0,42),16,404);return new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.72))};
      actions.querySelector('[data-send]').onclick=async e=>{const text=actions.querySelector('[data-reply]').value.trim();if(!text)return;e.currentTarget.disabled=true;try{const form=new FormData();form.append('text',text);const shot=await capture();if(shot)form.append('snapshot',shot,'story.jpg');await api().api('/stories/'+item.id+'/reply',{method:'POST',body:form});window.toast?.('Yorum mesaj kutusuna gönderildi.');close()}catch(error){window.toast?.(error.message||'Yorum gönderilemedi.')}finally{e.currentTarget.disabled=false}};
      actions.querySelector('[data-reply]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();actions.querySelector('[data-send]').click()}};
      actions.querySelector('[data-report]').onclick=()=>{
        const report=document.createElement('div');report.className='eris-story-modal';
        report.innerHTML='<section role="dialog" aria-modal="true" aria-label="Story bildir"><div style="display:flex;justify-content:space-between;align-items:center"><b>Story’yi bildir</b><button type="button" data-close aria-label="Kapat">×</button></div><img data-shot alt="Story ekran görüntüsü" style="max-width:115px;max-height:110px;object-fit:contain;border-radius:10px;opacity:.8"><textarea data-reason placeholder="Şikâyet nedeni" maxlength="2000" style="width:100%;box-sizing:border-box;min-height:80px;margin:10px 0;padding:10px;border:1px solid #ffffff25;border-radius:12px;background:#ffffff09;color:#fff"></textarea><label>Ek kanıt <input type="file" data-extra accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"></label><small data-error role="alert" style="display:block;color:#ff9dbd"></small><button type="button" class="story-primary" data-submit>Bildir</button></section>';
        document.body.append(report);const dismiss=()=>report.remove();report.querySelector('[data-close]').onclick=dismiss;
        capture().then(shot=>{if(shot)report.querySelector('[data-shot]').src=URL.createObjectURL(shot)});
        report.querySelector('[data-submit]').onclick=async e=>{const reason=report.querySelector('[data-reason]').value.trim();const error=report.querySelector('[data-error]');if(reason.length<3){error.textContent='Şikâyet nedenini yaz.';return}e.currentTarget.disabled=true;try{
          const shot=await capture();if(!shot)throw new Error('Görüntü alınamadı');const files=[shot,report.querySelector('[data-extra]').files?.[0]].filter(Boolean);
          const attachments=await Promise.all(files.map(file=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file)})));
          await api().api('/support/tickets',{method:'POST',body:JSON.stringify({category:'story_report',subject:'Story şikâyeti #'+item.id,message:'Story ID: '+item.id+'\nGönderen: '+item.user_id+'\nŞikâyet: '+reason,attachments})});dismiss();window.toast?.('Story şikâyeti gönderildi.')
        }catch(err){error.textContent=err.message||'Şikâyet gönderilemedi.';e.currentTarget.disabled=false}};
      };
    }
    const close=()=>{clearTimeout(timer);URL.revokeObjectURL(objectUrl);viewer.remove()};viewer.querySelector('button').onclick=close;
    let timer=setTimeout(close,isVideo?60000:6000);viewer.addEventListener('focusin',()=>clearTimeout(timer));viewer.addEventListener('focusout',()=>{clearTimeout(timer);timer=setTimeout(close,30000)});if(isVideo)media.addEventListener('ended',close,{once:true});
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
