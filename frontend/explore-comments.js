(() => {
  'use strict';
  if(window.ErisExploreComments)return;
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  function attach(card,post,{report,confirmDelete}={}) {
    if(card.querySelector('[data-comment-center]'))return;
    const session=token(),pid=encodeURIComponent(post.id);let rootCursor=null,more=false,loading=false,revision=0,order='newest',busy=false,mode=null,backup='';
    const roots=new Map(),threads=new Map();
    const valid=()=>card.isConnected&&token()===session;
    const request=async(path,opt={})=>{if(!valid())throw Error('Oturum değişti.');const data=await window.ErisPlatform.api(path,opt);if(!valid())throw Error('Oturum değişti.');return data;};
    const alert=err=>{if(valid())status.textContent=err?.message||'İşlem tamamlanamadı.';};
    const controls=document.createElement('div');controls.className='ec-post-engagement';
    controls.innerHTML='<button type="button" data-like aria-label="Gönderiyi beğen" aria-pressed="false">♡ <span>0</span></button><button type="button" data-comments-button aria-label="Yorumları aç" aria-expanded="false">◯ <span>0</span></button>';
    const panel=document.createElement('section');panel.className='ec-post-comments ec-comment-center';panel.dataset.commentCenter='';panel.hidden=true;
    panel.innerHTML='<div class="ec-comment-toolbar"><strong>Yorumlar</strong><select data-comment-order aria-label="Yorum sıralaması"><option value="newest">En yeni</option><option value="oldest">En eski</option></select><button type="button" data-comment-refresh>Yenile</button></div><p data-comment-status role="status" aria-live="polite"></p><div data-comment-list></div><button type="button" data-comment-more hidden>Daha fazla yorum</button><form data-comment-form><label data-comment-mode hidden></label><textarea maxlength="1000" rows="2" placeholder="Yorum yaz…" aria-label="Yorum yaz" required></textarea><div class="ec-comment-submit"><small data-comment-count>0 / 1000</small><button type="submit">Gönder</button></div></form>';
    card.append(controls,panel);
    const q=s=>panel.querySelector(s),list=q('[data-comment-list]'),status=q('[data-comment-status]'),input=q('textarea'),form=q('form'),send=q('[type=submit]'),like=controls.querySelector('[data-like]'),comments=controls.querySelector('[data-comments-button]');
    let liked=!!post.liked_by_me;
    const paintCounts=data=>{liked=!!data.liked_by_me;like.firstChild.textContent=liked?'♥ ':'♡ ';like.setAttribute('aria-pressed',String(liked));like.querySelector('span').textContent=data.like_count||0;comments.querySelector('span').textContent=data.comment_count||0;};
    paintCounts(post);if(typeof post.like_count!=='number')queueMicrotask(()=>{if(valid())request('/posts/'+pid+'/engagement').then(paintCounts).catch(()=>{});});
    const count=()=>q('[data-comment-count]').textContent=input.value.length+' / 1000';input.oninput=count;
    function setMode(next) {
      if(mode?.edit){input.value=backup;count();}
      if(next?.edit){backup=input.value;input.value=next.row.body;count();}
      mode=next;const label=q('[data-comment-mode]');label.hidden=!mode;label.replaceChildren();send.textContent=mode?.edit?'Değişikliği kaydet':'Gönder';
      if(mode){label.append(text('span',mode.edit?'Yorumunu düzenliyorsun':(mode.row.nickname||'Kullanıcı')+' kullanıcısına yanıt'));const b=text('button','Vazgeç');b.type='button';b.onclick=()=>setMode(null);label.append(b);input.focus();}
    }
    async function mutate(button,fn) {if(button.disabled||!valid())return;button.disabled=true;status.textContent='';try{await fn();}catch(e){alert(e);}finally{if(valid())button.disabled=false;}}
    like.onclick=()=>mutate(like,async()=>paintCounts(await request('/posts/'+pid+'/like',{method:liked?'DELETE':'POST'})));
    function profile(row,cls) {const b=text('button',row.nickname||'Kullanıcı','ec-social-profile-link '+cls);b.type='button';b.dataset.userId=row.user_id;b.setAttribute('aria-label',(row.nickname||'Kullanıcı')+' profilini aç');return b;}
    function commentNode(row,isReply=false) {
      const el=document.createElement('article');el.className='ec-post-comment'+(isReply?' ec-post-reply':'');el.dataset.commentId=row.id;
      const content=document.createElement('div');content.className='ec-comment-content';
      content.append(profile(row,'ec-comment-name'),text('p',row.body));
      if(row.is_pinned)content.prepend(text('small','Sabit yorum','ec-comment-pinned'));
      const actions=document.createElement('div');actions.className='ec-comment-controls';
      const lb=text('button',(row.liked_by_me?'♥':'♡')+' '+(row.like_count||0));lb.type='button';lb.setAttribute('aria-label','Yorumu beğen');lb.setAttribute('aria-pressed',String(!!row.liked_by_me));
      lb.onclick=()=>mutate(lb,async()=>{const r=await request('/posts/'+pid+'/comments/'+row.id+'/like',{method:row.liked_by_me?'DELETE':'POST'});Object.assign(row,r);lb.textContent=(row.liked_by_me?'♥':'♡')+' '+(row.like_count||0);lb.setAttribute('aria-pressed',String(!!row.liked_by_me));});
      const reply=text('button','Yanıtla');reply.type='button';reply.onclick=()=>setMode({row,parent:row.parent_id||row.id});actions.append(lb,reply);
      const menu=document.createElement('details');menu.className='ec-comment-menu';menu.append(text('summary','İşlemler'));const options=document.createElement('div');menu.append(options);
      const add=(label,fn)=>{const b=text('button',label);b.type='button';b.onclick=()=>mutate(b,fn.bind(null,b));options.append(b);};
      if(row.is_mine)add('Düzenle',()=>{menu.open=false;setMode({edit:true,row});});
      if(post.is_mine&&!row.parent_id)add(row.is_pinned?'Sabitlemeyi kaldır':'Sabitle',async()=>{await request('/posts/'+pid+'/comments/'+row.id+'/pin',{method:row.is_pinned?'DELETE':'PUT'});await loadRoots(true,row.id);});
      if(row.is_mine||post.is_mine)add('Sil',async()=>{if(!await confirmDelete?.('yorum'))return;if(!valid())return;await request('/posts/'+pid+'/comments/'+row.id,{method:'DELETE'});if(mode?.row.id===row.id||mode?.parent===row.id)setMode(null);threads.delete(row.id);await loadRoots(true);await refreshCounts();});
      add('Bildir',()=>{menu.open=false;report?.(row);});actions.append(menu);content.append(actions);
      if(!isReply&&row.reply_count>0){
        const b=text('button','Yanıtlar ('+row.reply_count+')','ec-thread-toggle');b.type='button';b.dataset.threadToggle=row.id;const thread=threads.get(row.id);b.setAttribute('aria-expanded',String(!!thread?.open));
        b.onclick=async()=>{if(!threads.has(row.id)){threads.set(row.id,{items:new Map(),cursor:null,more:false,open:true,loaded:false,loading:false});await loadReplies(row.id);}else{const t=threads.get(row.id);t.open=!t.open;if(t.open&&!t.loaded)await loadReplies(row.id);else render();}};
        content.append(b);
      }
      el.append(content);
      if(!isReply){const thread=threads.get(row.id);if(thread?.open){const holder=document.createElement('div');holder.className='ec-thread';holder.dataset.thread=row.id;
        [...thread.items.values()].sort((a,b)=>a.id-b.id).forEach(child=>holder.append(commentNode(child,true)));
        if(thread.loading)holder.append(text('p','Yanıtlar yükleniyor…'));
        if(thread.error){holder.append(text('p',thread.error));const retry=text('button','Yanıtları yeniden dene');retry.type='button';retry.onclick=()=>loadReplies(row.id);holder.append(retry);}
        if(thread.more){const b=text('button','Daha fazla yanıt');b.type='button';b.disabled=thread.loading;b.dataset.replyMore=row.id;b.onclick=()=>loadReplies(row.id);holder.append(b);}
        el.append(holder);
      }}
      return el;
    }
    function render() {
      if(!valid())return;list.replaceChildren();const items=[...roots.values()].sort((a,b)=>Number(b.is_pinned)-Number(a.is_pinned)||(order==='newest'?b.id-a.id:a.id-b.id));
      items.forEach(row=>list.append(commentNode(row)));if(!items.length&&!loading)list.append(text('p','İlk yorumu sen yaz.','ec-comment-empty'));
      const b=q('[data-comment-more]');b.hidden=!more;b.disabled=loading;
    }
    async function loadReplies(parent) {
      const t=threads.get(parent);if(!t||t.loading)return;t.loading=true;t.error=null;const r=revision;render();
      try{const data=await request('/explore/posts/'+pid+'/comments?parent_id='+parent+'&order=oldest&limit=20'+(t.cursor?'&cursor='+encodeURIComponent(t.cursor):''));if(r!==revision||threads.get(parent)!==t)return;data.items.forEach(x=>t.items.set(x.id,x));t.cursor=data.next_cursor;t.more=data.has_more;t.loaded=true;}
      catch(e){if(valid()&&r===revision)t.error=e.message;}
      finally{t.loading=false;if(valid()&&r===revision)render();}
    }
    async function loadRoots(reset=false,keep=null) {
      if(loading&&!reset)return;const r=reset?++revision:revision;loading=true;q('[data-comment-more]').disabled=true;status.textContent='Yorumlar yükleniyor…';
      if(reset){rootCursor=null;more=false;roots.clear();threads.clear();render();}
      const cursor=rootCursor;
      try{const data=await request('/explore/posts/'+pid+'/comments?order='+order+'&limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(r!==revision)return;data.items.forEach(x=>roots.set(x.id,x));rootCursor=data.next_cursor;more=data.has_more;
        if(keep&&!roots.has(keep)){try{const row=await request('/explore/posts/'+pid+'/comments/'+keep);if(r!==revision)return;roots.set(row.id,row);}catch(e){if(valid())status.textContent=e.message;}}
        if(r===revision)status.textContent='';
      }catch(e){if(valid()&&r===revision){alert(e);const retry=text('button','Yorumları yeniden dene');retry.type='button';retry.onclick=()=>loadRoots(reset,keep);status.append(retry);}}
      finally{if(r===revision){loading=false;render();}}
    }
    async function refreshCounts(){paintCounts(await request('/posts/'+pid+'/engagement'));}
    comments.onclick=()=>{panel.hidden=!panel.hidden;comments.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&!roots.size)loadRoots(true);};
    q('[data-comment-refresh]').onclick=()=>loadRoots(true);q('[data-comment-more]').onclick=()=>loadRoots(false);
    q('[data-comment-order]').onchange=e=>{order=e.target.value;loadRoots(true);};
    form.onsubmit=async ev=>{
      ev.preventDefault();if(busy||!valid())return;const raw=input.value,body=raw.trim(),current=mode;if(!body||body.length>1000)return;
      busy=true;send.disabled=true;status.textContent='Kaydediliyor…';
      try{
        const row=await request('/posts/'+pid+'/comments'+(current?.edit?'/'+current.row.id:''),{method:current?.edit?'PATCH':'POST',body:JSON.stringify(current?.edit?{body,expected_body:current.row.body}:{body,parent_id:current?.parent||null})});
        if(input.value===raw&&mode===current){if(current?.edit){input.value=backup;}else input.value='';mode=null;q('[data-comment-mode]').hidden=true;send.textContent='Gönder';count();}
        await loadRoots(true,row.parent_id||row.id);
        if(row.parent_id){threads.set(row.parent_id,{items:new Map(),cursor:null,more:false,open:true,loaded:false,loading:false});await loadReplies(row.parent_id);const t=threads.get(row.parent_id);if(t){t.items.set(row.id,row);render();}}
        await refreshCounts();
      }catch(e){alert(e);}finally{busy=false;if(valid())send.disabled=false;}
    };
  }
  window.ErisExploreComments={attach};
})();
