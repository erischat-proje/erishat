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
    .ec-social-profile-link{border:0;background:transparent;color:inherit;padding:0;cursor:pointer;text-align:left;display:inline-flex;align-items:center}.ec-social-profile-link:focus-visible{outline:2px solid #bd77ff;outline-offset:3px;border-radius:8px}.ec-social-post{padding:12px 0;border-top:1px solid #ffffff12}.ec-social-author{display:flex;align-items:center;gap:9px}.ec-social-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(140deg,#754cff,#d83ca6);overflow:hidden;font-size:16px}.ec-social-author .ec-social-avatar img{width:100%;height:100%;object-fit:cover}.ec-social-author b{font-size:12px}.ec-social-date{display:block;color:#928a9a;font-size:10px;margin-top:2px}.ec-social-menu{margin-left:auto;position:relative}.ec-social-menu summary{list-style:none;cursor:pointer;color:#aaa1b2;padding:5px 8px}.ec-social-menu[open] button{position:absolute;right:0;top:28px;z-index:3;width:max-content;background:#1a1522;border:1px solid #ffffff18;color:#fff;border-radius:10px;padding:9px 12px}.ec-social-caption{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.48;margin:10px 0}.ec-social-photo{display:block;width:100%;max-height:min(78vh,850px);object-fit:contain;border-radius:12px;background:#09070d}.ec-social-empty{text-align:center;color:#a99fb1;font-size:12px;padding:20px 8px}.ec-social-modal{position:fixed;inset:0;z-index:21010;background:#020107d9;display:grid;place-items:center;padding:16px}.ec-social-modal section{width:min(500px,100%);max-height:90vh;overflow:auto;padding:16px;border:1px solid #ffffff20;border-radius:22px;background:#100d16;color:#fff}.ec-social-modal textarea{width:100%;box-sizing:border-box;min-height:120px;resize:vertical;margin:12px 0;padding:12px;border:1px solid #ffffff18;border-radius:13px;background:#ffffff07;color:#fff;font:inherit;font-size:12px}.ec-social-modal button{border:1px solid #ffffff18;border-radius:11px;padding:10px 12px;background:#ffffff08;color:#fff}.ec-social-modal .ec-primary{border:0;background:linear-gradient(120deg,#8055ff,#ef4eac);font-weight:800}.ec-social-modal [data-preview]{display:block;max-width:100%;max-height:230px;margin:8px auto;border-radius:12px}
    #erisProfileHub .eph-tabs{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
    #erisProfileHub .eph-tabs button{display:flex;align-items:center;justify-content:flex-start;text-align:left;min-height:48px;padding:11px 13px!important;border-radius:14px!important;background:linear-gradient(145deg,#17131d,#100d15)!important;border-color:#ffffff14!important;color:#e7e0ec!important;font-size:12px!important}
    #erisProfileHub .eph-tabs button[aria-selected=true]{background:#754cff24!important;border-color:#9b76ff!important;color:#fff!important;box-shadow:inset 3px 0 #a77aff!important}
    @media(max-width:360px){#erisProfileHub .eph-tabs button{font-size:11px!important;padding:9px!important}}
  `;
  style.textContent += `
    .ec-post-engagement{display:flex;gap:18px;padding:12px 0 5px}
    .ec-post-engagement button,.ec-comment-controls button{border:0;background:none;color:#c8c0d0;cursor:pointer;font:inherit}
    .ec-post-engagement button{display:flex;align-items:center;gap:6px;font-size:20px}
    .ec-post-engagement button span{font-size:12px}
    .ec-post-engagement button[aria-pressed=true],.ec-comment-controls button[aria-pressed=true]{color:#f35cae}
    .ec-post-comments[hidden]{display:none}
    .ec-post-comments{padding:5px 0 12px}
    .ec-post-comment{display:flex;gap:9px;padding:9px 0}
    .ec-post-reply{margin-left:35px}
    .ec-comment-avatar{width:32px;height:32px;min-width:32px;border-radius:50%;overflow:hidden}
    .ec-comment-avatar img{width:100%;height:100%;object-fit:cover}
    .ec-comment-content{min-width:0;flex:1}
    .ec-comment-name{font-size:12px;font-weight:700}
    .ec-comment-content p{margin:3px 0 4px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
    .ec-comment-controls{display:flex;gap:15px}
    .ec-comment-controls button{padding:2px 0;font-size:11px}
    .ec-comment-empty{color:#a69aaa;font-size:12px}
    .ec-comment-composer{display:flex;gap:8px;margin-top:8px}
    .ec-comment-composer input{min-width:0;flex:1;border:1px solid #ffffff22;border-radius:13px;background:#ffffff09;color:#fff;padding:11px;font:inherit;font-size:12px}
    .ec-comment-composer button{border:0;border-radius:12px;background:linear-gradient(120deg,#8055ff,#ef4eac);color:#fff;padding:10px 13px;font-weight:700}
    [data-reply-label]{display:block;color:#b997ea;font-size:11px}
    [data-reply-label][hidden]{display:none}
    [data-reply-label] button{border:0;background:none;color:#fff;text-decoration:underline}
  `;
  document.head.append(style);style.textContent += '.ec-social-modal [hidden]{display:none!important}.ec-social-video{display:block;width:100%;max-height:min(78vh,850px);border-radius:12px;background:#09070d}';
  style.textContent += '.ec-social-post,.ec-post-comment{position:relative}.ec-hold-actions{position:absolute;right:3px;top:3px;display:flex;gap:5px;z-index:2}.ec-hold-actions button{width:31px;height:31px;display:grid;place-items:center;border:1px solid #ffffff35;border-radius:50%;background:#21172de8;color:#fff;font-size:16px}.ec-hold-actions[hidden],.ec-hold-actions button[hidden]{display:none}.ec-post-pin{position:absolute;right:42px;top:9px;color:#cda4ff;font-size:16px}.ec-pin-marker{position:absolute;right:6px;top:5px;font-size:14px;color:#cda4ff}.ec-post-comment .ec-hold-actions{top:4px}.ec-social-post.ec-actions-open,.ec-post-comment.ec-actions-open{background:#a778ff0d}.ec-report-preview{display:flex;gap:10px;align-items:center;padding:10px;margin:12px 0;border:1px solid #ffffff24;border-radius:12px}.ec-report-preview img,.ec-report-preview video{width:72px;height:72px;object-fit:cover;border-radius:9px}.ec-report-preview p{margin:0;overflow-wrap:anywhere}.ec-social-modal input[type=file]{max-width:100%;color:white}.ec-social-menu{display:flex;align-items:center;gap:5px;margin-left:0!important}.ec-social-menu button{position:static!important;width:33px!important;height:33px!important;min-height:33px!important;padding:0!important;border:1px solid #b996dc55!important;border-radius:11px!important;background:#21172b!important;color:#e8d8ff!important;font-size:18px!important;display:grid;place-items:center}.ec-visibility-toggle{margin-left:auto;width:33px;height:33px;border:1px solid #b996dc55;border-radius:11px;background:#21172b;color:#e8d8ff;display:grid;place-items:center}.ec-visibility-toggle svg{width:18px;height:18px}.ec-visibility-toggle[aria-pressed=true] svg{opacity:.55}.eph-overlay .ec-social-post .ec-social-profile-link,.eph-overlay .ec-social-post .ec-post-engagement button,.eph-overlay .ec-social-post .ec-comment-controls button{min-height:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;font-size:inherit!important}.eph-overlay .ec-social-post .ec-hold-actions button{width:31px!important;height:31px!important;min-height:31px!important;padding:0!important;border-radius:50%!important;background:#21172de8!important}.eph-overlay .ec-social-post .ec-social-menu button,.eph-overlay .ec-social-post .ec-visibility-toggle{min-height:33px!important;padding:5px!important}.eph-overlay .ec-social-post{padding:13px 0!important;background:transparent!important;border-radius:0!important;box-shadow:none!important}.eph-overlay .ec-social-avatar{width:38px!important;height:38px!important;min-height:38px!important;border-radius:50%!important;padding:0!important}.eph-overlay .ec-post-comment{padding:9px 0!important}';
  style.textContent += '.ec-social-post .ec-hold-actions,.ec-post-comment .ec-hold-actions{top:8px;right:8px;gap:5px;padding:3px;border:1px solid #b996dc45;border-radius:13px;background:#16101fe8;backdrop-filter:blur(12px)}.ec-social-post .ec-hold-actions button,.ec-post-comment .ec-hold-actions button,.eph-overlay .ec-social-post .ec-hold-actions button{width:30px!important;height:30px!important;min-height:30px!important;padding:0!important;border:1px solid #b996dc55!important;border-radius:9px!important;background:#2a1b38!important;color:#ead8ff!important;font-size:15px!important}.ec-comment-report{margin-left:auto;align-self:start}.ec-comment-report button{width:28px;height:28px;border:1px solid #b996dc42;border-radius:9px;background:#21172b;color:#e8d8ff}.ec-post-comment .ec-comment-content{padding-right:30px}.ec-post-comment.ec-actions-open .ec-comment-content{padding-top:31px}.ec-social-post.ec-actions-open>.ec-social-author{padding-top:35px}';
  style.textContent += '.ec-social-post .ec-social-menu{margin-left:auto!important;display:flex;align-items:center;gap:5px;min-width:0}.ec-social-post .ec-social-menu [data-post-options][hidden]{display:none!important}.ec-social-post .ec-social-menu [data-post-options]{display:flex;align-items:center;gap:5px;min-width:0}.ec-social-post .ec-social-menu [data-post-options] button,.ec-social-post .ec-social-menu [data-options-toggle]{flex:none}.ec-social-post .ec-social-menu [data-post-options] .ec-visibility-toggle{margin-left:0}.ec-social-post .ec-post-pin{right:8px;top:46px}.eph-overlay .ec-social-post .ec-social-menu [data-post-options] button{min-height:33px!important;padding:5px!important}@media(max-width:380px){.ec-social-post .ec-social-menu{gap:3px}.ec-social-post .ec-social-menu [data-post-options]{gap:3px}.ec-social-post .ec-social-menu button{width:29px!important;height:29px!important;min-height:29px!important}}';

  function holdActions(target,actions){
    let timer,startX=0,startY=0;
    const cancel=()=>{clearTimeout(timer);timer=null};
    const open=()=>{document.querySelectorAll('.ec-hold-actions').forEach(other=>{if(other!==actions){other.hidden=true;other.closest('.ec-actions-open')?.classList.remove('ec-actions-open')}});actions.hidden=false;target.classList.add('ec-actions-open')};
    target.addEventListener('pointerdown',e=>{if(e.target.closest('button,input,video,summary,.ec-post-comment')&&target.classList.contains('ec-social-post'))return;if(e.target.closest('button,input,video,summary'))return;e.stopPropagation();startX=e.clientX;startY=e.clientY;cancel();timer=setTimeout(()=>{open();timer=null},550)});
    target.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-startX)>12||Math.abs(e.clientY-startY)>12)cancel()});
    for(const type of ['pointerup','pointercancel','pointerleave'])target.addEventListener(type,cancel);
    target.addEventListener('contextmenu',e=>{if(target.classList.contains('ec-social-post')&&e.target.closest('.ec-post-comment'))return;e.preventDefault();e.stopPropagation();cancel();open()});
  }
  document.addEventListener('pointerdown',e=>{if(e.target.closest('.ec-hold-actions'))return;document.querySelectorAll('.ec-hold-actions:not([hidden])').forEach(actions=>{actions.hidden=true;actions.closest('.ec-actions-open')?.classList.remove('ec-actions-open')})},true);
  function confirmDelete(kind){
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='ec-social-modal';
      modal.innerHTML='<section role="alertdialog" aria-modal="true"><b>Silme onayı</b><p>Bu '+(kind==='yorum'?'yorumu':'gönderiyi')+' silmek istediğine emin misin?</p><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-no>Reddet</button><button type="button" class="ec-primary" data-yes>Kabul et</button></div></section>';
      document.body.append(modal);const done=value=>{modal.remove();resolve(value)};
      modal.querySelector('[data-no]').onclick=()=>done(false);modal.querySelector('[data-yes]').onclick=()=>done(true);
      modal.onclick=e=>{if(e.target===modal)done(false)};
    });
  }
  function captureSnapshot(post,card,comment){
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=460;
    const c=canvas.getContext('2d');if(!c)throw new Error('Ekran görüntüsü oluşturulamadı.');
    c.fillStyle='#100b1b';c.fillRect(0,0,640,460);
    c.fillStyle='#261835';c.fillRect(16,16,608,428);c.strokeStyle='#b996dc';c.strokeRect(16,16,608,428);
    c.fillStyle='#fff';c.font='bold 25px system-ui';c.fillText(String(post.nickname||'ErisChat kullanıcısı').slice(0,32),38,57);
    c.font='16px system-ui';c.fillStyle='#bcb0ca';c.fillText(formatDate(post.created_at),38,83);
    const wrap=(value,x,y,maxWidth,lineHeight,maxLines)=>{
      const words=String(value||'').split(/\s+/);let line='',lines=0;
      for(const word of words){const next=(line?line+' ':'')+word;if(c.measureText(next).width>maxWidth&&line){c.fillText(line,x,y);y+=lineHeight;lines++;line=word;if(lines>=maxLines)return y}else line=next}
      if(line&&lines<maxLines){c.fillText(line,x,y);y+=lineHeight}return y;
    };
    c.fillStyle='#fff';c.font='20px system-ui';let y=wrap(post.caption||'Medya gönderisi',38,126,562,29,3);
    const media=card.querySelector('.ec-social-photo,.ec-social-video');
    if(media&&((media.tagName==='IMG'&&media.complete&&media.naturalWidth)||(media.tagName==='VIDEO'&&media.readyState>=2))){
      const width=media.videoWidth||media.naturalWidth,height=media.videoHeight||media.naturalHeight;
      const boxW=220,boxH=comment?90:160,scale=Math.min(boxW/width,boxH/height);
      try{c.drawImage(media,38,Math.min(y+5,comment?248:350),width*scale,height*scale);y+=comment?100:170}catch(_){}
    }
    if(comment){const top=Math.min(Math.max(y+8,282),305);c.fillStyle='#a777e4';c.fillRect(30,top,580,105);c.fillStyle='#fff';c.font='bold 18px system-ui';c.fillText('Yorum · '+String(comment.nickname||'Kullanıcı').slice(0,30),42,top+23);c.font='18px system-ui';wrap(comment.body,42,top+53,550,24,2)}
    c.font='13px system-ui';c.fillStyle='#aa94c9';c.fillText('Gönderi #'+post.id+(comment?' · Yorum #'+comment.id:''),38,423);
    try{return canvas.toDataURL('image/jpeg',.72)}catch(_){
      const fallback=document.createElement('canvas');fallback.width=640;fallback.height=460;
      const fc=fallback.getContext('2d');fc.fillStyle='#100b1b';fc.fillRect(0,0,640,460);fc.fillStyle='#fff';fc.font='bold 24px system-ui';fc.fillText(String(post.nickname||'ErisChat kullanıcısı').slice(0,32),38,57);
      fc.font='16px system-ui';fc.fillText(formatDate(post.created_at),38,83);fc.font='20px system-ui';
      const lines=(value,start)=>{let line=0;for(const part of String(value||'').match(/.{1,50}/g)||[]){if(line>=4)break;fc.fillText(part,38,start+line*29);line++}};
      lines(post.caption||'Medya gönderisi',126);
      if(comment){fc.fillStyle='#a777e4';fc.fillRect(30,282,580,105);fc.fillStyle='#fff';fc.font='bold 18px system-ui';fc.fillText('Yorum · '+String(comment.nickname||'Kullanıcı').slice(0,30),42,305);fc.font='18px system-ui';lines(comment.body,335)}
      fc.font='13px system-ui';fc.fillText('Gönderi #'+post.id+(comment?' · Yorum #'+comment.id:''),38,423);
      return fallback.toDataURL('image/jpeg',.72);
    }
  }
  function reportPost(post,card,comment=null){
    const modal=document.createElement('div');modal.className='ec-social-modal';
    modal.innerHTML='<section role="dialog" aria-modal="true" aria-label="'+(comment?'Yorumu':'Gönderiyi')+' bildir"><header style="display:flex;justify-content:space-between;align-items:center"><b>'+(comment?'Yorumu':'Gönderiyi')+' bildir</b><button type="button" data-close aria-label="Kapat">×</button></header><div class="ec-report-preview"></div><p style="font-size:12px;color:#c9b9d8">Ekran görüntüsü otomatik eklendi. Ek kanıt da seçebilirsin.</p><textarea data-reason minlength="3" maxlength="2000" placeholder="Şikâyet nedenini yaz"></textarea><label>Ek kanıt (en fazla 3 fotoğraf veya 1 video)<input type="file" data-evidence accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple></label><p data-error role="alert" style="color:#ff9dbd"></p><button type="button" class="ec-primary" data-submit>Desteğe gönder</button></section>';
    document.body.append(modal);const preview=modal.querySelector('.ec-report-preview');
    let screenshot='';try{screenshot=captureSnapshot(post,card,comment)}catch(error){modal.querySelector('[data-error]').textContent=error.message}
    if(screenshot){const img=document.createElement('img');img.src=screenshot;img.alt='Otomatik gönderi ekran görüntüsü';preview.append(img)}
    const meta=document.createElement('p');meta.textContent=formatDate(comment?.created_at||post.created_at)+' · '+(comment?.body||post.caption||'Medya gönderisi').slice(0,110);preview.append(meta);
    const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
    modal.querySelector('[data-submit]').onclick=async e=>{
      const button=e.currentTarget,error=modal.querySelector('[data-error]');error.textContent='';
      const reason=modal.querySelector('[data-reason]').value.trim(),files=[...modal.querySelector('[data-evidence]').files];
      const videos=files.filter(file=>file.type.startsWith('video/'));
      if(!screenshot){error.textContent='Otomatik ekran görüntüsü oluşturulamadı. Tekrar dene.';return}
      if(reason.length<3){error.textContent='Şikâyet nedenini yaz.';return}
      if(files.length>3||videos.length&&(videos.length!==1||files.length!==1)||files.some(file=>!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type)||file.size>(file.type.startsWith('video/')?8*1024*1024:1500000))){error.textContent='En fazla 3 fotoğraf (1,5 MB) veya 1 video (8 MB) ekle.';return}
      button.disabled=true;
      try{const extra=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})));
        const attachments=[screenshot,...extra];
        await api().api('/support/tickets',{method:'POST',body:JSON.stringify({category:comment?'comment_report':'post_report',subject:(comment?'Yorum':'Gönderi')+' şikâyeti #'+(comment?.id||post.id),message:'Gönderi ID: '+post.id+(comment?'\nYorum ID: '+comment.id:'')+'\nGönderen: '+(comment?.user_id||post.user_id)+'\nTarih: '+formatDate(comment?.created_at||post.created_at)+'\nŞikâyet: '+reason,attachments})});
        close();window.toast?.('Şikâyet ekran görüntüsü ve kanıtlarıyla desteğe iletildi.');
      }catch(err){error.textContent=err.message||'Şikâyet gönderilemedi.';button.disabled=false}
    };
  }

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
    if(!response.ok)throw new Error('Medya yüklenemedi.');
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

  function attachPostEngagement(card,post){
    const id=encodeURIComponent(post.id);
    const actions=document.createElement('div');
    actions.className='ec-post-engagement';
    actions.innerHTML='<button type="button" data-like aria-label="Gönderiyi beğen">♡ <span>0</span></button>'
      +'<button type="button" data-comments-button aria-label="Yorumları aç">◯ <span>0</span></button>';
    const panel=document.createElement('section');
    panel.className='ec-post-comments';
    panel.hidden=true;
    panel.innerHTML='<div data-comment-list></div><form data-comment-form>'
      +'<label data-reply-label hidden></label>'
      +'<div class="ec-comment-composer"><input maxlength="1000" required placeholder="Yorum yaz..." aria-label="Yorum yaz"><button type="submit">Gönder</button></div></form>';
    card.append(actions,panel);
    const like=actions.querySelector('[data-like]');
    const commentsButton=actions.querySelector('[data-comments-button]');
    const list=panel.querySelector('[data-comment-list]');
    const form=panel.querySelector('[data-comment-form]');
    const input=form.querySelector('input');
    const replyLabel=form.querySelector('[data-reply-label]');
    let replyTo=null;
    let liked=false;

    function paintCounts(data){
      liked=Boolean(data.liked_by_me);
      like.querySelector('span').textContent=String(data.like_count||0);
      like.setAttribute('aria-pressed',String(liked));
      like.firstChild.textContent=liked?'♥ ':'♡ ';
      commentsButton.querySelector('span').textContent=String(data.comment_count||0);
    }
    async function refreshCounts(){
      paintCounts(await api().api('/posts/'+id+'/engagement'));
    }
    refreshCounts().catch(()=>{});

    like.onclick=async()=>{
      like.disabled=true;
      try{
        const data=await api().api('/posts/'+id+'/like',{method:liked?'DELETE':'POST'});
        paintCounts({...data,comment_count:Number(commentsButton.querySelector('span').textContent||0)});
      }catch(error){window.toast?.(error.message||'Beğeni kaydedilemedi.')}
      finally{like.disabled=false}
    };

    function avatarFor(row){
      const fallback=String(row.gender||row.avatar||'').toLowerCase().includes('kad')
        ? 'avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART KADIN AVATAR/1.png'
        : 'avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART ERKEK AVATAR/1.png';
      return window.ErisChatCosmetics?.assetUrl?.(row.avatar_asset||fallback)||row.avatar_asset||fallback;
    }
    function renderComment(row,children=[]){
      const item=document.createElement('div');
      item.className='ec-post-comment';
      if(row.parent_id&&!row.is_pinned)item.classList.add('ec-post-reply');
      const avatar=document.createElement('button');
      avatar.type='button';avatar.className='ec-social-profile-link ec-comment-avatar';
      avatar.dataset.userId=String(row.user_id);
      avatar.setAttribute('aria-label',(row.nickname||'Kullanıcı')+' profilini aç');
      const img=document.createElement('img');img.src=avatarFor(row);img.alt='';
      img.onerror=()=>{img.remove();avatar.textContent='👤'};
      avatar.append(img);
      const content=document.createElement('div');content.className='ec-comment-content';
      const name=document.createElement('button');
      name.type='button';name.className='ec-social-profile-link ec-comment-name';
      name.dataset.userId=String(row.user_id);name.textContent=row.nickname||'Kullanıcı';
      const body=document.createElement('p');body.textContent=row.body||'';
      const controls=document.createElement('div');controls.className='ec-comment-controls';
      const likeComment=document.createElement('button');
      likeComment.type='button';
      const paintComment=updated=>{
        likeComment.textContent=(updated.liked_by_me?'♥':'♡')+' '+String(updated.like_count||0);
        likeComment.setAttribute('aria-pressed',String(Boolean(updated.liked_by_me)));
      };
      paintComment(row);
      likeComment.onclick=async()=>{
        likeComment.disabled=true;
        try{
          const method=likeComment.getAttribute('aria-pressed')==='true'?'DELETE':'POST';
          const updated=await api().api('/posts/'+id+'/comments/'+row.id+'/like',{method});
          paintComment(updated);
        }catch(error){window.toast?.(error.message||'Yorum beğenilemedi.')}
        finally{likeComment.disabled=false}
      };
      const reply=document.createElement('button');reply.type='button';reply.textContent='Yanıtla';
      reply.onclick=()=>{
        replyTo=row.parent_id||row.id;
        replyLabel.hidden=false;
        replyLabel.textContent=(row.nickname||'Kullanıcı')+' kullanıcısına yanıt · ';
        const cancel=document.createElement('button');
        cancel.type='button';cancel.textContent='Vazgeç';
        cancel.onclick=()=>{replyTo=null;replyLabel.hidden=true;replyLabel.replaceChildren()};
        replyLabel.append(cancel);
        input.focus();
      };
      controls.append(likeComment,reply);
      if(row.is_pinned){const marker=document.createElement('span');marker.className='ec-pin-marker';marker.textContent='📌';marker.title='Sabit yorum';content.append(marker)}
      if(row.is_mine){
        const tools=document.createElement('div');tools.className='ec-hold-actions';tools.hidden=true;
        tools.innerHTML=(post.is_mine?'<button type="button" data-pin aria-label="'+(row.is_pinned?'Sabitlemeyi kaldır':'Yorumu sabitle')+'">📌</button>':'')+(row.is_mine?'<button type="button" data-edit-comment aria-label="Yorumu düzenle">✎</button>':'')+'<button type="button" data-report aria-label="Yorumu bildir">!</button><button type="button" data-remove aria-label="Yorumu sil">−</button>';
        const remove=tools.querySelector('[data-remove]');remove.hidden=!!row.is_pinned;
        holdActions(item,tools);
        if(post.is_mine)tools.querySelector('[data-pin]').onclick=async()=>{try{await api().api('/posts/'+id+'/comments/'+row.id+'/pin',{method:row.is_pinned?'DELETE':'PUT'});await refreshComments()}catch(error){window.toast?.(error.message||'Yorum sabitlenemedi.')}};
        if(row.is_mine)tools.querySelector('[data-edit-comment]').onclick=async()=>{const modal=document.createElement('div');modal.className='ec-social-modal';modal.innerHTML='<section role="dialog" aria-modal="true"><header style="display:flex;justify-content:space-between;align-items:center"><b>Yorumu düzenle</b><button type="button" data-close>×</button></header><textarea data-body maxlength="1000"></textarea><button type="button" class="ec-primary" data-save>Kaydet</button></section>';document.body.append(modal);modal.querySelector('[data-body]').value=row.body;modal.querySelector('[data-close]').onclick=()=>modal.remove();modal.querySelector('[data-save]').onclick=async()=>{const value=modal.querySelector('[data-body]').value.trim();if(!value)return;try{await api().api('/posts/'+id+'/comments/'+row.id,{method:'PATCH',body:JSON.stringify({body:value})});modal.remove();await refreshComments()}catch(error){window.toast?.(error.message||'Yorum düzenlenemedi.')}}};
        tools.querySelector('[data-report]').onclick=()=>reportPost(post,card,row);
        remove.onclick=async()=>{if(!await confirmDelete('yorum'))return;remove.disabled=true;try{await api().api('/posts/'+id+'/comments/'+row.id,{method:'DELETE'});await refreshComments()}catch(error){remove.disabled=false;window.toast?.(error.message||'Yorum silinemedi.')}};
        item.append(tools);
      }else{
        const tools=document.createElement('div');tools.className='ec-comment-report';
        tools.innerHTML='<button type="button" data-report aria-label="Yorumu bildir">!</button>';
        tools.querySelector('[data-report]').onclick=()=>reportPost(post,card,row);
        item.append(tools);
      }
      content.append(name,body,controls);
      item.append(avatar,content);
      list.append(item);
      children.forEach(child=>renderComment(child));
    }
    async function refreshComments(){
      const rows=await api().api('/posts/'+id+'/comments');
      list.replaceChildren();
      if(!rows.length){
        const empty=document.createElement('p');
        empty.className='ec-comment-empty';empty.textContent='İlk yorumu sen yaz.';
        list.append(empty);
      }else{
        const pinned=rows.find(row=>row.is_pinned);
        if(pinned)renderComment(pinned,rows.filter(child=>child.parent_id===pinned.id));
        const roots=rows.filter(row=>!row.parent_id&&row.id!==pinned?.id);
        roots.forEach(row=>renderComment(row,rows.filter(child=>child.parent_id===row.id&&child.id!==pinned?.id)));
      }
      await refreshCounts();
    }
    commentsButton.onclick=async()=>{
      panel.hidden=!panel.hidden;
      if(!panel.hidden){
        try{await refreshComments()}
        catch(error){window.toast?.(error.message||'Yorumlar yüklenemedi.')}
      }
    };
    form.onsubmit=async event=>{
      event.preventDefault();
      const body=input.value.trim();
      if(!body)return;
      const submit=form.querySelector('[type=submit]');submit.disabled=true;
      try{
        await api().api('/posts/'+id+'/comments',{
          method:'POST',body:JSON.stringify({body,parent_id:replyTo})
        });
        input.value='';replyTo=null;replyLabel.hidden=true;replyLabel.replaceChildren();
        await refreshComments();
      }catch(error){window.toast?.(error.message||'Yorum gönderilemedi.')}
      finally{submit.disabled=false}
    };
  }

  async function renderPosts(container,rows,owner){
    cleanupUrls();container.replaceChildren();
    if(!rows.length){const empty=document.createElement('div');empty.className='ec-social-empty';empty.textContent=owner?'Henüz gönderin yok. İlk paylaşımını yap.':'Henüz gönderi yok. Takip ettiklerinin paylaşımları burada görünür.';container.append(empty);return}
    for(const post of rows){
      const card=document.createElement('article');card.className='ec-social-post';
      const fallbackAvatar=String(post.gender||post.avatar||'').toLowerCase().includes('kad')
        ? 'avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART KADIN AVATAR/1.png'
        : 'avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART ERKEK AVATAR/1.png';
      const avatar=post.avatar_asset||fallbackAvatar;
      card.innerHTML='<div class="ec-social-author"><button type="button" class="ec-social-profile-link ec-social-avatar" data-avatar data-user-id></button><span style="min-width:0"><button type="button" class="ec-social-profile-link" data-author-name data-user-id><b></b></button><small class="ec-social-date"></small></span>'+(owner?'<span class="ec-social-menu"><span data-post-options hidden><button type="button" data-visibility aria-label="Profilden gizle" title="Profilden gizle"></button><button type="button" data-pin aria-label="Gönderiyi sabitle" title="Gönderiyi sabitle">📌</button><button type="button" data-edit aria-label="Gönderiyi düzenle" title="Düzenle">✎</button><button type="button" data-delete aria-label="Gönderiyi sil" title="Sil">−</button></span><button type="button" data-options-toggle aria-label="Gönderi işlemlerini aç" aria-expanded="false">⋯</button></span>':(post.is_mine?'':'<button type="button" data-report aria-label="Gönderiyi bildir" style="margin-left:auto;border:0;background:transparent;color:#fff;font-size:20px">!</button>'))+'</div><div class="ec-social-caption"></div><small data-visibility style="display:block;color:#aaa1b1;font-size:10px"></small><div data-photo></div>';
      card.querySelectorAll('[data-user-id]').forEach(el => {
        el.dataset.userId=String(post.user_id||'');
        el.setAttribute('aria-label',(post.nickname||'Kullanıcı')+' profilini aç');
      });
      const avatarEl=card.querySelector('[data-avatar]');
      const avatarImg=document.createElement('img');
      avatarImg.src=window.ErisChatCosmetics?.assetUrl?.(avatar)||avatar;
      avatarImg.alt='';
      avatarImg.onerror=()=>{avatarImg.remove();avatarEl.textContent='👤'};
      avatarEl.append(avatarImg);
      card.querySelector('.ec-social-author b').textContent=post.nickname||'ErisChat kullanıcısı';card.querySelector('.ec-social-date').textContent=formatDate(post.created_at)+(post.updated_at&&post.created_at!==post.updated_at?' · düzenlendi':'');card.querySelector('.ec-social-caption').textContent=post.caption||'';card.querySelector('small[data-visibility]').textContent=owner?(post.is_hidden?'Profilden gizli · yalnızca sen görebilirsin':(post.audience==='followers'?'Takipçilerim':'Herkese açık')):'';
      if(post.media_url){try{const url=await imageUrl(post.media_url);if(post.media_kind==='video'||String(post.mime_type||'').startsWith('video/')){const video=document.createElement('video');video.className='ec-social-video';video.controls=true;video.playsInline=true;video.preload='metadata';video.src=url;card.querySelector('[data-photo]').append(video)}else{const img=document.createElement('img');img.className='ec-social-photo';img.alt='Gönderi fotoğrafı';img.src=url;card.querySelector('[data-photo]').append(img)}}catch(_){}}
      if(post.is_pinned){const marker=document.createElement('span');marker.className='ec-post-pin';marker.textContent='📌';marker.title='Sabit gönderi';card.append(marker)}
      if(owner){const menu=card.querySelector('.ec-social-menu'),options=menu.querySelector('[data-post-options]'),toggle=menu.querySelector('[data-options-toggle]');toggle.onclick=()=>{const opening=options.hidden;container.querySelectorAll('[data-post-options]:not([hidden])').forEach(other=>{if(other===options)return;other.hidden=true;const button=other.parentElement.querySelector('[data-options-toggle]');button.textContent='⋯';button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Gönderi işlemlerini aç')});options.hidden=!opening;toggle.textContent=opening?'×':'⋯';toggle.setAttribute('aria-expanded',String(opening));toggle.setAttribute('aria-label',opening?'Gönderi işlemlerini kapat':'Gönderi işlemlerini aç')};
        const hide=menu.querySelector('[data-visibility]');hide.className='ec-visibility-toggle';hide.title=post.is_hidden?'Profilden gizlemeyi kaldır':'Profilden gizle';hide.setAttribute('aria-label',hide.title);hide.setAttribute('aria-pressed',String(!!post.is_hidden));hide.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/>'+(post.is_hidden?'<path d="M3 21 21 3" stroke-width="2.4"/>':'')+'</svg>';hide.onclick=async()=>{hide.disabled=true;try{await api().updatePost(post.id,post.caption,null,false,post.audience,!post.is_hidden);window.toast?.(post.is_hidden?'Gönderi profilde gösteriliyor.':'Gönderi profilden gizlendi.');await loadMine(container)}catch(e){hide.disabled=false;window.toast?.(e.message||'Görünürlük değiştirilemedi.')}};
        const pin=menu.querySelector('[data-pin]');pin.title=post.is_pinned?'Sabitlemeyi kaldır':'Gönderiyi sabitle';pin.setAttribute('aria-label',pin.title);pin.onclick=async()=>{pin.disabled=true;try{await api().api('/posts/'+post.id+'/pin',{method:post.is_pinned?'DELETE':'PUT'});await loadMine(container)}catch(e){pin.disabled=false;window.toast?.(e.message||'Gönderi sabitlenemedi.')}};
        menu.querySelector('[data-edit]').onclick=()=>compose(post);menu.querySelector('[data-delete]').onclick=async()=>{if(!await confirmDelete('gönderi'))return;try{await api().deletePost(post.id);window.toast?.('Gönderi silindi.');await loadMine(container)}catch(e){window.toast?.(e.message||'Gönderi silinemedi.')}};
      }else if(!post.is_mine){card.querySelector('[data-report]').onclick=()=>reportPost(post,card)}
      attachPostEngagement(card,post);
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
    modal.innerHTML='<section><header style="display:flex;align-items:center;justify-content:space-between"><div><b>'+(post?'Gönderiyi düzenle':'Yeni gönderi')+'</b><small style="display:block;color:#aaa1b1;font-size:10px;margin-top:4px">Metin, fotoğraf veya video paylaşabilirsin.</small></div><button type="button" data-close aria-label="Kapat">×</button></header><label style="display:block;margin:12px 0 6px;color:#aaa1b1;font-size:11px">Kimler görebilir?<select data-audience style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #ffffff20;border-radius:12px;background:#17121e;color:#fff"><option value="public">Herkese açık · Keşfet ve takipçiler</option><option value="followers">Yalnızca takipçilerim</option></select></label><textarea maxlength="2000" data-caption placeholder="Aklından ne geçiyor?\nEn fazla 2000 karakter"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-gallery>🖼 Galeriden seç</button><button type="button" data-camera>📷 Fotoğraf çek</button><button type="button" data-remove '+(!post?.media_url?'hidden':'')+'>Fotoğrafı kaldır</button></div><img data-preview alt="Seçilen medya" hidden><video data-video-preview controls playsinline hidden style="display:block;width:100%;max-height:260px;margin:8px auto;border-radius:12px"></video><input type="file" data-file accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" hidden><div data-status style="color:#aaa1b1;font-size:10px;margin:10px 0;min-height:14px"></div><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-cancel>Vazgeç</button><button type="button" class="ec-primary" data-save>'+(post?'Değişiklikleri kaydet':'Paylaş')+'</button></div></section>';
    document.body.append(modal);const caption=modal.querySelector('[data-caption]'),file=modal.querySelector('[data-file]'),preview=modal.querySelector('[data-preview]'),videoPreview=modal.querySelector('[data-video-preview]'),audience=modal.querySelector('[data-audience]'),status=modal.querySelector('[data-status]'),save=modal.querySelector('[data-save]');caption.value=post?.caption||'';audience.value=post?.audience||'public';let removeImage=false,localUrl='',remoteUrl='';
    const close=()=>{if(localUrl)URL.revokeObjectURL(localUrl);if(remoteUrl){URL.revokeObjectURL(remoteUrl);objectUrls.delete(remoteUrl)}modal.remove()};modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-cancel]').onclick=close;modal.onclick=e=>{if(e.target===modal)close()};
    const choose=camera=>{file.value='';if(camera)file.setAttribute('capture','environment');else file.removeAttribute('capture');file.click()};modal.querySelector('[data-gallery]').onclick=()=>choose(false);modal.querySelector('[data-camera]').onclick=()=>choose(true);
    preview.onerror=()=>{preview.hidden=true;status.textContent='Önizleme açılamadı; yeniden medya seçebilirsin.'};videoPreview.onerror=()=>{videoPreview.hidden=true;status.textContent='Video önizlemesi açılamadı.'};
    file.onchange=()=>{const selected=file.files?.[0];if(!selected)return;const isVideo=selected.type.startsWith('video/');if(selected.size>(isVideo?80:10)*1024*1024){file.value='';status.textContent=isVideo?'Video en fazla 80 MB olabilir.':'Fotoğraf en fazla 10 MB olabilir.';return}if(localUrl)URL.revokeObjectURL(localUrl);localUrl=URL.createObjectURL(selected);preview.hidden=isVideo;videoPreview.hidden=!isVideo;if(isVideo){videoPreview.src=localUrl;preview.removeAttribute('src')}else{preview.src=localUrl;videoPreview.removeAttribute('src')}removeImage=false};
    modal.querySelector('[data-remove]').onclick=()=>{file.value='';preview.removeAttribute('src');preview.hidden=true;videoPreview.removeAttribute('src');videoPreview.hidden=true;removeImage=true;status.textContent='Fotoğraf kaldırılacak.'};
    if(post?.media_url&&String(post.mime_type||'').startsWith('video/'))status.textContent='Mevcut video korunacak. Yeni dosya seçerek değiştirebilirsin.';
    if(post?.media_url&&!String(post.mime_type||'').startsWith('video/'))imageUrl(post.media_url).then(url=>{if(!modal.isConnected){URL.revokeObjectURL(url);objectUrls.delete(url);return}remoteUrl=url;const isVideo=post.media_kind==='video'||String(post.mime_type||'').startsWith('video/');if(isVideo){videoPreview.src=url;videoPreview.hidden=false;preview.hidden=true}else{preview.src=url;preview.hidden=false}}).catch(()=>{});
    save.onclick=async()=>{save.disabled=true;status.textContent='Kaydediliyor…';try{if(post)await api().updatePost(post.id,caption.value,file.files?.[0]||null,removeImage,audience.value);else await api().createPost(caption.value,file.files?.[0]||null,audience.value);close();window.toast?.(post?'Gönderi güncellendi.':'Gönderi paylaşıldı.');const feed=mount();if(feed)await loadFeed(feed);const mine=document.querySelector('#erisProfileHub [data-posts-list]');if(mine)await loadMine(mine)}catch(e){status.textContent=e.message||'Gönderi kaydedilemedi.';save.disabled=false}};
    if(startWithPhoto)setTimeout(()=>choose(false),80);
  }
  async function loadProfile(container,userId,isOwner=false){
    if(!container||!api()?.api)return;
    container.innerHTML='<div class="ec-social-empty">Gönderiler yükleniyor…</div>';
    try{
      const rows=await api().api('/users/'+encodeURIComponent(userId)+'/posts?limit=50');
      await renderPosts(container,Array.isArray(rows)?rows:[],isOwner?'profile':false);
    }catch(error){container.textContent=error.message||'Profil gönderileri yüklenemedi.'}
  }
  window.ErisSocialFeed={load:()=>loadFeed(),loadMine,loadProfile,compose};
  function boot(){const root=mount();if(root&&document.getElementById('explore')?.classList.contains('show'))loadFeed(root)}
  document.addEventListener('DOMContentLoaded',boot);window.addEventListener('erischat:auth',boot);document.addEventListener('visibilitychange',()=>{if(!document.hidden)boot()});
  document.addEventListener('click',event=>{if(event.target.closest('nav.nav button[onclick*="explore"]'))setTimeout(boot,50)});
})();
