(() => {
  'use strict';
  const api = () => window.ErisPlatform;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => api()?.getAccessToken?.() || localStorage.getItem('erischat_access_token') || localStorage.getItem('token') || '';
  let loading = false,loadRevision=0,storyRows=[],activeViewerClose=null,viewerRevision=0,viewerReturnFocus=null,storiesSession=token(),storyAccount=window.ErisAuth?.user?.id||null,activeComposerClose=null;
  const style = document.createElement('style');
  style.textContent = ".eris-stories{margin:0 0 7px;padding:5px 0 10px;border:0;border-bottom:1px solid var(--ui-line);border-radius:0;background:transparent;overflow:hidden}.eris-stories-head{display:none}.eris-stories-row{display:flex;gap:14px;overflow-x:auto;padding:3px 2px 5px;scrollbar-width:none}.eris-stories-row::-webkit-scrollbar{display:none}.eris-story-wrap{position:relative;flex:0 0 68px}.eris-story{position:relative;border:0;background:transparent;color:var(--ui-ink);padding:0;flex:0 0 68px;text-align:center}.eris-story-face{position:relative;width:62px;height:62px;border-radius:50%;margin:0 auto 5px;border:2px solid transparent;padding:3px;background:linear-gradient(var(--ui-panel),var(--ui-panel)) padding-box,linear-gradient(135deg,var(--ui-button),var(--ui-danger-bg),var(--ui-button)) border-box;display:grid;place-items:center;font-size:23px;overflow:visible}.eris-story-face img{width:100%;height:100%;object-fit:cover;border-radius:50%}.eris-story.seen .eris-story-face{background:linear-gradient(var(--ui-panel),var(--ui-panel)) padding-box,linear-gradient(135deg,var(--ui-panel),var(--ui-button)) border-box;opacity:.84}.eris-story-name{display:block;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ui-ink)}.eris-story-add .eris-story-face{background:linear-gradient(var(--ui-panel),var(--ui-panel)) padding-box,linear-gradient(135deg,var(--ui-button),var(--ui-button)) border-box}.eris-story-plus{position:absolute;right:2px;top:41px;width:22px;height:22px;padding:0;border:2px solid var(--ui-line);border-radius:50%;display:grid;place-items:center;background:var(--ui-panel);color:var(--ui-ink);font-size:18px;line-height:1;font-weight:700}.eris-story-viewer{position:fixed;inset:0;z-index:21000;background:var(--ui-panel);display:flex;align-items:center;justify-content:center;color:var(--ui-ink)}.eris-story-viewer img{max-width:100vw;max-height:84vh;object-fit:contain}.eris-story-viewer header{position:absolute;top:max(12px,env(safe-area-inset-top));left:14px;right:14px;display:flex;align-items:center;gap:9px}.eris-story-viewer header b{flex:1}.eris-story-viewer footer{position:absolute;left:18px;right:18px;bottom:max(20px,env(safe-area-inset-bottom));text-align:center;font-size:12px;text-shadow:0 1px 7px var(--ui-shadow)}.eris-story-modal{position:fixed;inset:0;z-index:20500;background:var(--ui-overlay);display:grid;place-items:center;padding:18px}.eris-story-modal section{width:min(430px,100%);padding:17px;border:1px solid var(--ui-line);border-radius:22px;background:var(--ui-panel);color:var(--ui-ink)}.eris-story-modal input{width:100%;margin:12px 0;padding:12px;border:1px solid var(--ui-line);border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 3%, transparent);color:var(--ui-ink)}.eris-story-modal button{border:1px solid var(--ui-line);border-radius:11px;padding:10px;background:color-mix(in srgb, var(--ui-raised) 3%, transparent);color:var(--ui-ink)}.eris-story-modal .story-primary{background:linear-gradient(120deg,var(--ui-primary),var(--ui-danger-bg));border:0;font-weight:800}.eris-story-progress{height:3px;background:color-mix(in srgb, var(--ui-panel) 26%, transparent);position:absolute;top:max(8px,env(safe-area-inset-top));left:14px;right:14px;border-radius:9px}.eris-story-progress i{display:block;height:100%;background:var(--ui-panel);border-radius:9px}";
  document.head.append(style);style.textContent += ".eris-story-viewer video{display:block;max-width:100%;max-height:82vh;border-radius:14px;background:var(--ui-panel)}";
  style.textContent += ".eris-story-modal [hidden],.eris-story-viewer [hidden]{display:none!important}.eris-story-viewer header button,.eris-story-viewer footer button{border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-raised);color:var(--ui-ink);min-width:35px;min-height:35px;padding:5px 10px}.eris-story-viewer footer{display:grid;gap:8px;text-align:left}.eris-story-reactions{display:flex;align-items:center;gap:8px}.eris-story-reactions button[aria-pressed=true]{color:var(--ui-danger)}.eris-story-reactions input{flex:1;min-width:0;padding:9px 11px;border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-panel);color:var(--ui-ink)}.eris-story-modal input{box-sizing:border-box}.eris-story-modal [data-gallery],.eris-story-modal [data-camera]{font-size:12px;min-height:39px}.eris-story-modal small{font-size:11px!important}";

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
    const list = root.querySelector('[data-story-list]'),session=token(),generation=++loadRevision;
    try {
      const rows = await api().stories(100); if(session!==token()||generation!==loadRevision)return;storyRows=rows;list.replaceChildren();
      const own = rows.find(item => item.is_mine || (window.ErisAuth?.user?.id && String(item.user_id) === String(window.ErisAuth.user.id)));
      list.append(storyButton({...(own||{}),nickname:'Hikâyen',isAdd:true,ownStory:own}, root));
      const seenUsers = new Set();
      rows.filter(item => item !== own && !item.is_mine).forEach(item => {
        const key = String(item.user_id ?? item.id);
        if (seenUsers.has(key)) return; seenUsers.add(key); list.append(storyButton(item, root));
      });
    } catch (error) { if(session!==token()||generation!==loadRevision)return;list.innerHTML = "<small style=\"color:var(--ui-danger);font-size:9px\">Hikâyeler yüklenemedi.</small><button type=\"button\" data-story-retry>Yeniden dene</button>";list.querySelector('[data-story-retry]').onclick=()=>load(); }
    finally { if(generation===loadRevision)loading = false; }
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
    const session=token();
    const existing=document.querySelector('.ec-compose');if(existing){existing.querySelector('[data-close]')?.focus();return;}
    const modal=document.createElement('div');modal.className='eris-story-modal';
    modal.classList.add('ec-compose');const icon=window.ErisSocialMedia.icon;
    modal.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Hikâye paylaş"><header class="ec-compose-head"><div><span class="ec-compose-kicker">LİDYACHAT / HİKÂYE</span><h2>Anını hikâyene ekle</h2><p>Takipçilerinle paylaş. 24 saat sonra kaybolur.</p></div><button type="button" data-close aria-label="Kapat">${icon('close')}</button></header><div class="ec-compose-body"><div class="ec-story-intro">${icon('image')}<strong>Senin günün, senin hikâyen.</strong><span>Bir fotoğraf veya 30 saniyelik sesli video ekle.</span></div><div class="ec-media-tools"><button type="button" data-gallery>${icon('image')}<span>Galeri<small>Hazır bir anı seç</small></span></button><button type="button" data-camera>${icon('camera')}<span>Kamera<small>Yeni bir an yakala</small></span></button></div><input type="file" data-file accept="image/*,video/*" hidden><img data-preview alt="Hikâye önizlemesi" hidden><video data-video-preview controls playsinline hidden><\/video><div class="ec-caption-wrap"><input data-caption maxlength="300" placeholder="Bir not ekle… (isteğe bağlı)"><small data-count>0 / 300</small></div><small data-status role="status">Paylaşmadan önce önizlemeyi kontrol edebilirsin.</small></div><footer class="ec-compose-footer"><span>24 saat · Takipçilerin</span><button type="button" class="story-primary" data-publish disabled>Paylaş ${icon('arrow')}</button></footer></section>`;
    document.body.append(modal);let file=null,url='',saving=false;const status=modal.querySelector('[data-status]');
    const close=(force=false)=>{if(saving&&force!==true)return;selection++;window.ErisSocialMedia.cancel(modal.querySelector('[data-file]'));modal.querySelector('[data-video-preview]').pause();if(url)URL.revokeObjectURL(url);modal.remove();if(activeComposerClose===close)activeComposerClose=null};activeComposerClose=close;modal.querySelector('[data-close]').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
    const input=modal.querySelector('[data-file]'),publish=modal.querySelector('[data-publish]');let selection=0;
    const choose=camera=>window.ErisSocialMedia.choose(input,camera,modal.querySelector('[data-camera]'));
    input.onchange=async()=>{const next=window.ErisSocialMedia.selected(input);if(!next)return;const revision=++selection;file=null;publish.disabled=true;status.textContent='Medya kontrol ediliyor…';try{await window.ErisSocialMedia.validate(next,50);if(revision!==selection||!modal.isConnected)return;const video=next.type.startsWith('video/');file=next;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(file);const img=modal.querySelector('[data-preview]'),clip=modal.querySelector('[data-video-preview]');clip.pause();modal.querySelector('.ec-story-intro').hidden=true;img.hidden=video;clip.hidden=!video;if(video){clip.src=url;img.removeAttribute('src')}else{img.src=url;clip.removeAttribute('src')}status.textContent=file.name;publish.disabled=false}catch(error){if(revision===selection){window.ErisSocialMedia.clear(input);status.textContent=error.message;modal.querySelector('[data-preview]').hidden=true;modal.querySelector('[data-video-preview]').hidden=true;modal.querySelector('[data-video-preview]').pause();modal.querySelector('.ec-story-intro').hidden=false}}};
    modal.querySelector('[data-gallery]').onclick=()=>choose(false);modal.querySelector('[data-camera]').onclick=()=>choose(true);
    modal.querySelector('[data-caption]').oninput=e=>modal.querySelector('[data-count]').textContent=e.target.value.length+' / 300';window.ErisSocialMedia.bindDialog(modal,close);
    modal.querySelector('[data-publish]').onclick=async e=>{if(!file||saving||session!==token()||!modal.isConnected)return;saving=true;e.currentTarget.disabled=true;status.textContent='Paylaşılıyor…';try{await api().createStory(file,modal.querySelector('[data-caption]').value);if(session!==token()||!modal.isConnected)return;saving=false;close();window.toast?.('Hikâye paylaşıldı.');await load()}catch(error){if(session!==token()||!modal.isConnected)return;saving=false;status.textContent=error.message||'Hikâye paylaşılamadı.';e.currentTarget.disabled=false}};
  }

  async function openStory(requested,navigate=false) {
    const previousFocus=viewerReturnFocus;
    activeViewerClose?.(false);
    if(!previousFocus)viewerReturnFocus=document.activeElement;
    const groups=new Map();storyRows.forEach(row=>{if(!groups.has(row.user_id))groups.set(row.user_id,[]);groups.get(row.user_id).push(row);});
    const sequence=[...groups.values()].flatMap(rows=>rows.slice().sort((a,b)=>a.id-b.id));
    let item=navigate?requested:(sequence.find(row=>row.user_id===requested.user_id&&!row.viewed)||sequence.find(row=>row.user_id===requested.user_id)||requested);
    if(!sequence.some(row=>row.id===item.id))sequence.push(item);
    const index=sequence.findIndex(row=>row.id===item.id),session=token(),generation=++viewerRevision;
    const controller=new AbortController();let alive=true,objectUrl='',media=null,ticker=null,elapsed=0,last=performance.now(),manualPaused=false,holding=false,ready=false,reportPanel=null;
    const valid=()=>alive&&generation===viewerRevision&&token()===session;
    const viewer=document.createElement('div');viewer.className='eris-story-viewer ec-story-enhanced';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','Hikâye görüntüle');
    viewer.innerHTML='<div class="eris-story-progress"></div><header><b></b><small data-story-position></small><button type="button" class="close" data-story-close aria-label="Hikâyeyi kapat">×</button></header><p data-story-status role="status" aria-live="polite">Hikâye yükleniyor…</p><footer><p data-story-caption></p><div class="ec-story-controls"><button type="button" data-story-prev>Önceki</button><button type="button" data-story-pause>Duraklat</button><button type="button" data-story-next>Sonraki</button></div></footer>';
    viewer.querySelector('header b').textContent=item.nickname||'Kullanıcı';window.ErisRoleBadges?.bind(viewer.querySelector('header b'),item);viewer.querySelector('[data-story-caption]').textContent=item.caption||'';viewer.querySelector('[data-story-position]').textContent=(index+1)+' / '+sequence.length;
    const progress=viewer.querySelector('.eris-story-progress');sequence.forEach((row,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',(i+1)+'. hikâyeye git');const bar=document.createElement('i');bar.style.width=i<index?'100%':'0%';b.append(bar);b.onclick=()=>openStory(row,true);progress.append(b);});
    const status=viewer.querySelector('[data-story-status]'),footer=viewer.querySelector('footer');
    const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.append(viewer);
    const q=s=>viewer.querySelector(s),say=e=>{if(valid())status.textContent=e?.message||String(e);};
    const close=(restore=true)=>{if(!alive)return;alive=false;controller.abort();clearInterval(ticker);media?.pause?.();if(objectUrl)URL.revokeObjectURL(objectUrl);reportPanel?.remove();viewer.remove();document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',keys);document.removeEventListener('visibilitychange',visibility);if(activeViewerClose===close)activeViewerClose=null;if(restore){if(viewerReturnFocus?.isConnected)viewerReturnFocus.focus();else mount()?.querySelector('button')?.focus();viewerReturnFocus=null;}};
    activeViewerClose=close;q('[data-story-close]').onclick=()=>close();q('[data-story-close]').focus();
    const move=delta=>{const next=sequence[index+delta];if(next)openStory(next,true);else close();};
    q('[data-story-prev]').disabled=index===0;q('[data-story-prev]').onclick=()=>move(-1);q('[data-story-next]').textContent=index===sequence.length-1?'Bitir':'Sonraki';q('[data-story-next]').onclick=()=>move(1);
    const focused=()=>viewer.contains(document.activeElement)&&!!document.activeElement.closest('input,textarea');
    const paused=()=>manualPaused||holding||document.hidden||focused()||!!q('.ec-story-viewers')||!!reportPanel;
    const syncPause=()=>{q('[data-story-pause]').textContent=paused()?'Devam et':'Duraklat';if(media?.tagName==='VIDEO'){if(paused())media.pause();else media.play()?.catch(()=>{if(valid()){manualPaused=true;q('[data-story-pause]').textContent='Devam et';say('Videoyu başlatmak için Devam et düğmesine dokun.');}});}};
    q('[data-story-pause]').onclick=()=>{if(focused())document.activeElement.blur();manualPaused=!manualPaused;holding=false;syncPause();last=performance.now();};
    function visibility(){if(document.hidden){manualPaused=true;syncPause();}last=performance.now();}
    function keys(e){
      if(!valid())return;
      if(e.key==='Escape'){if(reportPanel){reportPanel.querySelector('[data-close]')?.click();}else if(q('.ec-story-viewers'))q('.ec-story-viewers [data-viewers-close]').click();else close();return;}
      if(e.key==='Tab'){const scope=reportPanel||q('.ec-story-viewers')||viewer;const nodes=[...scope.querySelectorAll('button:not(:disabled),input,textarea,summary')];if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}
      if(e.target.closest('input,textarea')||reportPanel||q('.ec-story-viewers'))return;
      if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key==='ArrowLeft'&&index>0){e.preventDefault();move(-1);}if(e.code==='Space'){e.preventDefault();q('[data-story-pause]').click();}
    }
    document.addEventListener('keydown',keys);document.addEventListener('visibilitychange',visibility);
    viewer.addEventListener('focusin',()=>{if(focused()){manualPaused=true;syncPause();}});viewer.addEventListener('focusout',()=>{queueMicrotask(()=>{if(valid()){syncPause();last=performance.now();}});});
    try {
      const response=await fetch(api().storyMediaUrl(item.media_url),{headers:session?{Authorization:'Bearer '+session}:{},cache:'no-store',signal:controller.signal});
      if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.detail||'Hikâye açılamadı.');}
      const blob=await response.blob();if(!valid()){close();return;}objectUrl=URL.createObjectURL(blob);
      const video=String(item.media_kind||item.mime_type||'').startsWith('video');media=document.createElement(video?'video':'img');media.alt='Hikâye';
      if(video){media.controls=true;media.playsInline=true;media.autoplay=true;media.addEventListener('loadedmetadata',()=>{ready=true;syncPause();});media.addEventListener('ended',()=>{if(valid())move(1);});}
      else{media.onload=()=>{ready=true;last=performance.now();};media.addEventListener('pointerdown',()=>{holding=true;syncPause();});for(const type of ['pointerup','pointercancel','pointerleave'])media.addEventListener(type,()=>{holding=false;syncPause();last=performance.now();});}
      media.onerror=()=>{say('Medya görüntülenemedi.');const b=document.createElement('button');b.type='button';b.textContent='Yeniden dene';b.onclick=()=>openStory(item,true);status.append(b);};
      media.src=objectUrl;viewer.insertBefore(media,status);status.textContent='';item.viewed=true;
      const mine=!!item.is_mine||String(window.ErisAuth?.user?.id||'')===String(item.user_id);
      const capture=async()=>{
        const c=document.createElement('canvas');c.width=400;c.height=440;const ctx=c.getContext('2d');if(!ctx)return null;
        ctx.fillStyle=getComputedStyle(viewer).getPropertyValue('--ui-panel').trim()||'#eee4ce';ctx.fillRect(0,0,400,440);ctx.fillStyle=getComputedStyle(viewer).getPropertyValue('--ui-ink').trim()||'#30291e';ctx.font='bold 19px system-ui';ctx.fillText(String(item.nickname||'Kullanıcı').slice(0,25),16,28);
        const w=media.videoWidth||media.naturalWidth,h=media.videoHeight||media.naturalHeight;if(w&&h){const scale=Math.min(390/w,330/h);try{ctx.drawImage(media,(400-w*scale)/2,38,w*scale,h*scale);}catch(_){}}
        ctx.font='15px system-ui';ctx.fillText(String(item.caption||'Hikâye').slice(0,42),16,404);return new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.72));
      };
      if(mine){
        const views=document.createElement('button');views.type='button';views.textContent='Görüntüleyenler';views.dataset.storyViewers='';q('.ec-story-controls').append(views);
        views.onclick=()=>{
          if(q('.ec-story-viewers'))return;const panel=document.createElement('section');panel.className='ec-story-viewers';panel.setAttribute('aria-label','Hikâyeyi görüntüleyenler');panel.innerHTML='<header><strong>Görüntüleyenler</strong><button type="button" data-viewers-close>Kapat</button></header><p data-viewers-status role="status"></p><div data-viewer-rows></div><button type="button" data-viewers-more>Daha fazla</button>';
          viewer.append(panel);syncPause();const dismiss=()=>{panel.remove();syncPause();last=performance.now();views.focus();};panel.querySelector('[data-viewers-close]').onclick=dismiss;panel.querySelector('[data-viewers-close]').focus();
          let before=null,loading=false;const seen=new Set();const loadPage=async()=>{if(loading||!valid())return;loading=true;const more=panel.querySelector('[data-viewers-more]'),hint=panel.querySelector('[data-viewers-status]');more.disabled=true;hint.textContent='Yükleniyor…';
            try{const page=await api().api('/explore/stories/'+item.id+'/viewers?limit=20'+(before?'&before='+before:''));if(!valid()||!panel.isConnected)return;for(const row of page.items){if(seen.has(row.user_id))continue;seen.add(row.user_id);const el=document.createElement('div'),name=document.createElement('button');name.type='button';name.className='ec-social-profile-link';name.dataset.userId=row.user_id;name.textContent=row.nickname||'Kullanıcı';const like=document.createElement('small');like.textContent=row.liked?'♥ Beğendi':'';el.append(name,like);panel.querySelector('[data-viewer-rows]').append(el);}before=page.next_before;more.hidden=!page.has_more;more.textContent='Daha fazla';hint.textContent=seen.size?'Görünen görüntüleyenler: '+seen.size:'Henüz görüntüleyen yok.';}
            catch(e){if(valid()&&panel.isConnected){hint.textContent=e.message;more.hidden=false;more.textContent='Yeniden dene';}}
            finally{loading=false;more.disabled=false;}};panel.querySelector('[data-viewers-more]').onclick=loadPage;loadPage();
        };
        const remove=document.createElement('button');remove.type='button';remove.textContent='Sil';remove.onclick=async()=>{if(!window.confirm('Bu hikâye silinsin mi?')||!valid())return;remove.disabled=true;try{await api().deleteStory(item.id);if(!valid())return;close();await load();}catch(e){say(e);remove.disabled=false;}};q('header').insertBefore(remove,q('[data-story-close]'));
      }else{
        const actions=document.createElement('div');actions.className='eris-story-reactions';actions.innerHTML='<button type="button" data-like aria-label="Hikâyeyi beğen">♥ <span></span></button><input data-reply maxlength="1000" placeholder="Hikâyeye yanıt yaz…" aria-label="Hikâyeye yanıt yaz"><button type="button" data-send>Gönder</button><button type="button" data-report aria-label="Hikâyeyi bildir">!</button>';footer.append(actions);
        const like=actions.querySelector('[data-like]');const syncLike=()=>{like.setAttribute('aria-pressed',String(!!item.liked));like.querySelector('span').textContent=item.like_count||0;};syncLike();
        like.onclick=async()=>{if(like.disabled||!valid())return;like.disabled=true;try{const state=await api().api('/explore/stories/'+item.id+'/liked',{method:item.liked?'DELETE':'PUT'});if(valid()){Object.assign(item,state);syncLike();}}catch(e){say(e);}finally{like.disabled=false;}};
        actions.querySelector('[data-send]').onclick=async e=>{const input=actions.querySelector('[data-reply]'),raw=input.value,text=raw.trim(),button=e.currentTarget;if(!text||text.length>1000||button.disabled||!valid())return;button.disabled=true;
          try{const form=new FormData();form.append('text',text);const shot=await capture();if(!valid())return;if(shot)form.append('snapshot',shot,'story.jpg');await api().api('/stories/'+item.id+'/reply',{method:'POST',body:form});if(!valid())return;if(input.value===raw)input.value='';say('Yanıt mesaj kutusuna gönderildi.');}
          catch(error){say(error);}finally{button.disabled=false;}};
        actions.querySelector('[data-reply]').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();actions.querySelector('[data-send]').click();}};
        actions.querySelector('[data-report]').onclick=()=>{
          if(reportPanel)return;const panel=document.createElement('div');reportPanel=panel;panel.className='eris-story-modal';panel.innerHTML='<section role="dialog" aria-modal="true" aria-label="Hikâyeyi bildir"><header><b>Hikâyeyi bildir</b><button type="button" data-close>Kapat</button></header><textarea data-reason maxlength="2000" placeholder="Şikâyet nedeni" aria-label="Şikâyet nedeni" style="width:100%;min-height:90px"></textarea><label>Ek kanıt <input type="file" data-extra accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"></label><p data-error role="alert"></p><button type="button" data-submit>Bildir</button></section>';
          document.body.append(panel);syncPause();const dismiss=()=>{panel.remove();reportPanel=null;syncPause();last=performance.now();};panel.querySelector('[data-close]').onclick=dismiss;panel.querySelector('[data-reason]').focus();
          panel.querySelector('[data-submit]').onclick=async e=>{const reason=panel.querySelector('[data-reason]').value.trim(),button=e.currentTarget;if(reason.length<3){panel.querySelector('[data-error]').textContent='Şikâyet nedenini yaz.';return;}if(button.disabled||!valid())return;button.disabled=true;
            try{const shot=await capture();if(!shot)throw Error('Görüntü alınamadı.');const files=[shot,panel.querySelector('[data-extra]').files?.[0]].filter(Boolean);const attachments=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Kanıt okunamadı.'));reader.readAsDataURL(file);})));if(!valid()||!panel.isConnected)return;
              await api().api('/support/tickets',{method:'POST',body:JSON.stringify({category:'story_report',subject:'Hikâye şikâyeti #'+item.id,message:'Story ID: '+item.id+'\nGönderen: '+item.user_id+'\nŞikâyet: '+reason,attachments})});if(valid()){dismiss();say('Şikâyet gönderildi.');}}
            catch(error){if(valid())panel.querySelector('[data-error]').textContent=error.message;}finally{button.disabled=false;}};
        };
      }
      ticker=setInterval(()=>{if(!valid()){close();return;}const at=performance.now(),delta=Math.max(0,at-last);last=at;if(!ready)return;
        if(video){const duration=Number(media.duration);if(Number.isFinite(duration)&&duration>0)progress.children[index].firstChild.style.width=Math.min(100,media.currentTime/duration*100)+'%';}
        else if(!paused()){elapsed+=delta;progress.children[index].firstChild.style.width=Math.min(100,elapsed/6000*100)+'%';if(elapsed>=6000)move(1);}
      },100);
      await load();
    }catch(error){if(!valid()){close();return;}if(error.name==='AbortError')return;status.textContent=error.message||'Hikâye açılamadı.';const retry=document.createElement('button');retry.type='button';retry.textContent='Yeniden dene';retry.onclick=()=>openStory(item,true);status.append(retry);}
  }

  function clearAccount(){loadRevision++;loading=false;viewerRevision++;activeViewerClose?.();activeComposerClose?.(true);storyRows=[];mount()?.querySelector('[data-story-list]')?.replaceChildren();}
  function authChanged(event){
    const next=token(),uid=event?.detail?.user?.id;
    if(next!==storiesSession||uid&&storyAccount&&String(uid)!==String(storyAccount)||!next){storiesSession=next;storyAccount=uid||null;clearAccount();if(next)load();}
    else if(uid)storyAccount=uid;
  }
  window.addEventListener('erischat:auth',event=>{if(event.detail?.state==='logged_out'){storiesSession='';storyAccount=null;clearAccount();}else authChanged(event);});
  window.addEventListener('erischat:auth-state',authChanged);
  window.addEventListener('storage',event=>{if(['erischat_access_token','erischat.accessToken.v1','token',null].includes(event.key))authChanged(event);});
  window.ErisChatStories={load,compose,close:()=>activeViewerClose?.()};
  const run=()=>{if(document.getElementById('explore')?.classList.contains('show'))load()};
  document.addEventListener('DOMContentLoaded',run);window.addEventListener('erischat:auth',run);document.addEventListener('visibilitychange',()=>{if(!document.hidden)run()});
})();
