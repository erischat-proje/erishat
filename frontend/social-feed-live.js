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
  document.head.append(style);style.textContent += '.ec-social-video{display:block;width:100%;max-height:min(78vh,850px);border-radius:12px;background:#09070d}';

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
        ? 'kadınavatar/kadin_avatar_06_ULTRA_HD_CLEAN.jpg'
        : 'erkekavatar/avatar_01_ULTRA_HD_CLEAN.jpg';
      return window.ErisChatCosmetics?.assetUrl?.(row.avatar_asset||fallback)||row.avatar_asset||fallback;
    }
    function renderComment(row,children=[]){
      const item=document.createElement('div');
      item.className='ec-post-comment';
      if(row.parent_id)item.classList.add('ec-post-reply');
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
      if(row.is_mine || post.is_mine){
        const remove=document.createElement('button');
        remove.type='button';remove.textContent='Sil';
        remove.onclick=async()=>{
          if(!window.confirm('Bu yorum silinsin mi?'))return;
          remove.disabled=true;
          try{
            await api().api('/posts/'+id+'/comments/'+row.id,{method:'DELETE'});
            await refreshComments();
          }catch(error){
            remove.disabled=false;
            window.toast?.(error.message||'Yorum silinemedi.');
          }
        };
        controls.append(remove);
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
        const roots=rows.filter(row=>!row.parent_id);
        roots.forEach(row=>renderComment(row,rows.filter(child=>child.parent_id===row.id)));
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
        ? 'kadınavatar/kadin_avatar_06_ULTRA_HD_CLEAN.jpg'
        : 'erkekavatar/avatar_01_ULTRA_HD_CLEAN.jpg';
      const avatar=post.avatar_asset||fallbackAvatar;
      card.innerHTML='<div class="ec-social-author"><button type="button" class="ec-social-profile-link ec-social-avatar" data-avatar data-user-id></button><span style="min-width:0"><button type="button" class="ec-social-profile-link" data-author-name data-user-id><b></b></button><small class="ec-social-date"></small></span>'+(owner?'<details class="ec-social-menu"><summary aria-label="Gönderi işlemleri">•••</summary><button type="button" data-edit>✎ Düzenle</button><button type="button" data-delete>Sil</button></details>':'')+'</div><div class="ec-social-caption"></div><small data-visibility style="display:block;color:#aaa1b1;font-size:10px"></small><div data-photo></div>';
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
      card.querySelector('.ec-social-author b').textContent=post.nickname||'ErisChat kullanıcısı';card.querySelector('.ec-social-date').textContent=formatDate(post.created_at)+(post.updated_at&&post.created_at!==post.updated_at?' · düzenlendi':'');card.querySelector('.ec-social-caption').textContent=post.caption||'';card.querySelector('[data-visibility]').textContent=owner?(post.is_hidden?'Profilden gizli · yalnızca sen görebilirsin':(post.audience==='followers'?'Takipçilerim':'Herkese açık')):'';
      if(post.media_url){try{const url=await imageUrl(post.media_url);if(post.media_kind==='video'||String(post.mime_type||'').startsWith('video/')){const video=document.createElement('video');video.className='ec-social-video';video.controls=true;video.playsInline=true;video.preload='metadata';video.src=url;card.querySelector('[data-photo]').append(video)}else{const img=document.createElement('img');img.className='ec-social-photo';img.alt='Gönderi fotoğrafı';img.src=url;card.querySelector('[data-photo]').append(img)}}catch(_){}}
      if(owner){const hide=document.createElement('button');hide.type='button';hide.textContent=post.is_hidden?'Profilden göster':'Profilden gizle';card.querySelector('.ec-social-menu').append(hide);hide.onclick=async()=>{hide.disabled=true;try{await api().updatePost(post.id,post.caption,null,false,post.audience,!post.is_hidden);window.toast?.(post.is_hidden?'Gönderi profilde gösteriliyor.':'Gönderi profilden gizlendi.');await loadMine(container)}catch(e){hide.disabled=false;window.toast?.(e.message||'Görünürlük değiştirilemedi.')}};card.querySelector('[data-edit]').onclick=()=>compose(post);card.querySelector('[data-delete]').onclick=async()=>{if(!window.confirm('Bu gönderi silinsin mi?'))return;try{await api().deletePost(post.id);window.toast?.('Gönderi silindi.');if(owner==='profile')await loadMine(container);else await loadFeed()}catch(e){window.toast?.(e.message||'Gönderi silinemedi.')}}}
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
    file.onchange=()=>{const selected=file.files?.[0];if(!selected)return;const isVideo=selected.type.startsWith('video/');if(selected.size>(isVideo?80:10)*1024*1024){file.value='';status.textContent=isVideo?'Video en fazla 80 MB olabilir.':'Fotoğraf en fazla 10 MB olabilir.';return}if(localUrl)URL.revokeObjectURL(localUrl);localUrl=URL.createObjectURL(selected);preview.hidden=isVideo;videoPreview.hidden=!isVideo;if(isVideo){videoPreview.src=localUrl;preview.removeAttribute('src')}else{preview.src=localUrl;videoPreview.removeAttribute('src')}removeImage=false};
    modal.querySelector('[data-remove]').onclick=()=>{file.value='';preview.removeAttribute('src');preview.hidden=true;videoPreview.removeAttribute('src');videoPreview.hidden=true;removeImage=true;status.textContent='Fotoğraf kaldırılacak.'};
    if(post?.media_url)imageUrl(post.media_url).then(url=>{if(!modal.isConnected){URL.revokeObjectURL(url);objectUrls.delete(url);return}remoteUrl=url;const isVideo=post.media_kind==='video'||String(post.mime_type||'').startsWith('video/');if(isVideo){videoPreview.src=url;videoPreview.hidden=false;preview.hidden=true}else{preview.src=url;preview.hidden=false}}).catch(()=>{});
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
