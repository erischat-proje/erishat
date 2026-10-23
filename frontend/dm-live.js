(() => {
  const api = () => window.ErisPlatform;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '');
  const escapeHtml = value => esc(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function dmIcon(name){const art={chat:'<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/>',camera:'<path d="M8 5 9 3h6l1 2h5v15H3V5Z"/><circle cx="12" cy="12" r="4"/>',mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',gift:'<path d="M3 8h18v13H3ZM2 5h20v3H2ZM12 5v16M12 5C4 5 6-2 12 5ZM12 5c8 0 6-7 0 0Z"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>'};return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(art[name]||art.chat)+'</svg>';}
  // LIDYACHAT_WELCOME_IDENTITY_V3: identify system chats by conversation, never display name.
  const systemConversationIds = new Set();
  const SYSTEM_AVATAR = new URL('./assets/lidyachat-system-avatar.png?v=welcome-v4', document.baseURI).href;
  const conversationInfo = new Map();
  const isSystemConversation = (id = activeConversationId) =>
    String(id || '').startsWith('welcome:') || systemConversationIds.has(String(id));
  let activeConversationId = null;
  let chatRevision=0,listRevision=0;
  const textSends=new Map();
  let currentUserId = null;
  let messageMode=null,historyCursor=null,historyBusy=false,historyWindow=false;
  const drafts=new Map();
  let nativeDocumentJob=null;
  let loadedForUserId = null;
  let selectedMessages = new Set();
  let messageSelectionMode = false;
  let allMessagesSelected = false;
  let inboxFolder = 'inbox';
  let inboxQuery='',inboxView='all',inboxLimit=50,inboxScope='',inboxSearchTimer=null,inboxAuthRevision=0;
  const selectedConversations = new Set();
  let vaultToken = '';
  let selectionBar = null;
  let voiceRecorder = null;
  let activeVoicePlayer=null, voicePlayRevision=0;
  let attachmentPreview = null;
  const mediaUploadsInFlight = new Set();

  function messageTime(value) {
    if (!value) return '';
    const date = new Date(value), now = new Date();
    if (Number.isNaN(date.getTime())) return '';
    const time = new Intl.DateTimeFormat('tr-TR', {hour:'2-digit',minute:'2-digit'}).format(date);
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((today - day) / 86400000);
    const label = diff === 0 ? 'Bugün' : diff === 1 ? 'Dün' : new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',year:date.getFullYear()===now.getFullYear()?undefined:'numeric'}).format(date);
    return `${label} · ${time}`;
  }

  function markPhotoExpired(message) {
    message._expired = true;
    const row = document.querySelector(`#chat .bubble[data-message-id="${String(message.id).replace(/[^\w-]/g,'')}"]`);
    const media=row?.querySelector('.dm-image-message');
    if(media)media.innerHTML='<div class="dm-temp-preview expired"><span class="dm-temp-lock">⌛</span><span><b>Süre doldu</b><small>Bu fotoğraf artık görüntülenemiyor</small></span></div>';
  }

  function schedulePhotoExpiry(message, seconds) {
    if (!message.id || !(seconds > 0)) return;
    clearTimeout(message._expiryTimer);
    message._expiresClientAt = Date.now() + seconds * 1000;
    message._expiryTimer = setTimeout(() => markPhotoExpired(message), seconds * 1000 + 100);
  }

  function formatFileSize(value){
    const n=Number(value);if(!Number.isFinite(n)||n<=0)return 'Dosya';return n<1024?n+' B':n<1024*1024?(n/1024).toFixed(0)+' KB':(n/(1024*1024)).toFixed(1)+' MB';
  }
  function setUploadStatus(value){const status=$('chat')?.querySelector('[data-upload-status]');if(status){status.textContent=value;status.hidden=!value}}
  function pickAttachment(kind){
    const id=activeConversationId,revision=chatRevision,owner=currentUserId,input=document.createElement('input');input.type='file';
    input.accept=kind==='video'?'video/mp4,video/webm':'.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx';
    input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(owner!==currentUserId||revision!==chatRevision||String(activeConversationId)!==String(id)){window.toast?.('Sohbet değişti. Dosyayı yeniden seçin.');return}openAttachmentPreview(file,kind,0,{id,revision,user:owner})};input.click();
  }
  function cancelNativeDocument(){
    if(nativeDocumentJob){try{window.ErisChatAndroid?.abortDocument?.(nativeDocumentJob.token)}catch{}nativeDocumentJob=null}
  }
  async function saveNativeDocument(blob,name,owner,revision){
    const bridge=window.ErisChatAndroid;
    if(!bridge)return false;
    if(!bridge.beginDocument||!bridge.appendDocument||!bridge.finishDocument)throw new Error('Belge kaydetmek için APK sürümünü güncelleyin.');
    if(nativeDocumentJob)throw new Error('Önce açık dosya kaydetme işlemini tamamlayın.');
    const token=String(bridge.beginDocument(name,blob.size)||'');if(!token)throw new Error('Dosya kaydetme başlatılamadı. Açık kaydetme penceresini kapatın.');
    nativeDocumentJob={token,owner};
    try{
      for(let offset=0;offset<blob.size;offset+=65536){
        if(owner!==currentUserId||revision!==chatRevision||nativeDocumentJob?.token!==token)throw new Error('Kaydetme iptal edildi.');
        const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(new Error('Dosya okunamadı.'));reader.readAsDataURL(blob.slice(offset,offset+65536))});
        if(!bridge.appendDocument(token,encoded))throw new Error('Dosya aktarımı tamamlanamadı.');
      }
      if(owner!==currentUserId||revision!==chatRevision)throw new Error('Kaydetme iptal edildi.');
      bridge.finishDocument(token);return true;
    }catch(e){try{bridge.abortDocument?.(token)}catch{}if(nativeDocumentJob?.token===token)nativeDocumentJob=null;throw e}
  }
  window.addEventListener('erischat:document-saved',event=>{
    const data=event.detail,job=nativeDocumentJob;if(!job||data?.id!==job.token)return;
    nativeDocumentJob=null;if(job.owner===currentUserId)window.toast?.(data.saved?'Belge kaydedildi.':'Kaydetme iptal edildi veya tamamlanamadı.');
  });
  async function downloadAttachment(message,button){
    if(button.disabled)return;const id=activeConversationId,owner=currentUserId,revision=chatRevision;button.disabled=true;
    const label=button.textContent;button.textContent='İndiriliyor…';
    try{const response=await fetchMedia(message),blob=await response.blob();if(!button.isConnected||revision!==chatRevision||String(activeConversationId)!==String(id)||owner!==currentUserId)return;
      if(await saveNativeDocument(blob,String(message.media_name||'belge'),owner,revision))return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=String(message.media_name||'belge').replace(/[\\/\x00-\x1f]/g,'_');link.rel='noopener';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){if(button.isConnected)window.toast?.(e.message||'Dosya indirilemedi.')}finally{if(button.isConnected){button.disabled=false;button.textContent=label}}
  }
  async function loadAttachmentVideo(message,video,button){
    if(button.disabled)return;const id=activeConversationId,owner=currentUserId,revision=chatRevision;button.disabled=true;button.textContent='Video yükleniyor…';
    try{const response=await fetchMedia(message),blob=await response.blob();if(!video.isConnected||revision!==chatRevision||String(activeConversationId)!==String(id)||owner!==currentUserId)return;
      const url=URL.createObjectURL(blob);video.dataset.objectUrl=url;video.src=url;button.textContent='Video hazır · Oynat düğmesine dokun';video.onerror=()=>{if(button.isConnected){button.textContent='Video oynatılamadı. Yeniden yükle';button.disabled=false;URL.revokeObjectURL(url);delete video.dataset.objectUrl}};
    }catch(e){if(button.isConnected){button.textContent=e.message||'Video yüklenemedi. Tekrar dene';button.disabled=false}}
  }
  function closeSharedMedia(){
    const panel=document.querySelector('[data-shared-panel]');if(panel){panel._thumbnailObserver?.disconnect();releaseMediaUrls(panel);panel.remove()}
  }
  function openSharedMedia(){
    if(!activeConversationId||!api()?.sharedMessages){window.toast?.('Paylaşılanlar için uygulamayı yenileyin.');return}
    closeSharedMedia();const id=activeConversationId,revision=chatRevision,previous=document.activeElement;
    const overlay=document.createElement('div');overlay.className='dm-shared-panel';overlay.dataset.sharedPanel='';
    overlay.innerHTML='<section role="dialog" aria-modal="true" aria-label="Paylaşılanlar"><header><div><small>SOHBET ARŞİVİ</small><h3>Paylaşılanlar</h3></div><button type="button" data-close aria-label="Kapat">×</button></header><p>Bu sohbette paylaşılan dosyalar. Süreli fotoğraflar burada listelenmez.</p><nav role="tablist" aria-label="Dosya türü"></nav><form><label>Dosya adı veya mesajda ara<input name="q" maxlength="100" type="search" autocomplete="off"></label><button type="submit">Ara</button></form><p data-status role="status"></p><div data-results role="tabpanel" aria-label="Paylaşılan dosyalar"></div><button type="button" data-more hidden>Daha eski paylaşımlar</button></section>';
    const close=()=>{closeSharedMedia();previous?.focus?.()};overlay.querySelector('[data-close]').onclick=close;overlay.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button:not(:disabled):not([hidden]),input')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.body.append(overlay);
    const tabs=overlay.querySelector('nav'),form=overlay.querySelector('form'),results=overlay.querySelector('[data-results]'),status=overlay.querySelector('[data-status]'),more=overlay.querySelector('[data-more]');let kind='all',query='',cursor=null,ticket=0,busy=false;
    const alive=()=>overlay.isConnected&&revision===chatRevision&&String(activeConversationId)===String(id);
    const loadThumb=async(image,m)=>{if(image.dataset.requested)return;image.dataset.requested='1';try{const response=await fetchMedia(m,false,true),blob=await response.blob();if(!alive()||!image.isConnected)return;const url=URL.createObjectURL(blob);image.src=url;image.dataset.objectUrl=url}catch{if(image.isConnected)image.alt='Fotoğraf'}};
    if('IntersectionObserver' in window){overlay._thumbnailObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const img=entry.target;overlay._thumbnailObserver.unobserve(img);loadThumb(img,img._message)}},{root:overlay,rootMargin:'150px'})}
    const draw=m=>{
      const card=document.createElement('article');card.className='dm-shared-item';const art=document.createElement('div');art.className='dm-shared-art';art.textContent=({image:'▧',video:'▶',voice:'♫',document:'▤'}[m.media_type]||'▤');
      if(m.media_type==='image'){const image=document.createElement('img');image.alt='Fotoğraf';image._message=m;art.replaceChildren(image);if(overlay._thumbnailObserver)overlay._thumbnailObserver.observe(image);else loadThumb(image,m)}
      const main=document.createElement('div');main.className='dm-shared-info';const name=document.createElement('b');name.textContent=m.media_name||({image:'Fotoğraf',video:'Video',voice:'Sesli mesaj',document:'Belge'}[m.media_type]||'Dosya');const details=document.createElement('small');details.textContent=(m.sender_nickname||'Kullanıcı')+' · '+messageTime(m.created_at)+' · '+formatFileSize(m.media_size);main.append(name,details);
      const actions=document.createElement('div');actions.className='dm-shared-actions';const open=document.createElement('button');open.type='button';open.textContent=m.media_type==='document'?'İndir':m.media_type==='video'?'Videoyu yükle':'Aç';
      open.onclick=()=>{if(m.media_type==='document')downloadAttachment(m,open);else if(m.media_type==='video')loadAttachmentVideo(m,card.querySelector('video'),open);else{close();if(m.media_type==='image')viewPhoto(m);else jumpToMessage(m.id)}};
      const locate=document.createElement('button');locate.type='button';locate.textContent='Sohbette göster';locate.onclick=()=>{close();jumpToMessage(m.id)};actions.append(open,locate);main.append(actions);card.append(art,main);
      if(m.media_type==='video'){const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-label','Paylaşılan video');card.append(video)}
      results.append(card);
    };
    const load=async(append=false)=>{if(append&&busy)return;const own=++ticket;busy=true;more.disabled=true;status.textContent='Yükleniyor…';
      if(!append){overlay._thumbnailObserver?.disconnect();releaseMediaUrls(results);results.replaceChildren();cursor=null;more.hidden=true}
      try{const page=await api().sharedMessages(id,kind,query,append?cursor:null);if(!alive()||own!==ticket)return;for(const m of asList(page,['messages']))draw(m);cursor=page.has_more?page.next_before:null;more.hidden=!cursor;status.textContent=results.children.length?'':'Bu bölümde paylaşım bulunamadı.'}
      catch(e){if(alive()&&own===ticket)status.textContent=e.message||'Paylaşılanlar yüklenemedi.'}finally{if(own===ticket){busy=false;more.disabled=false}}
    };
    for(const [value,label] of [['all','Tümü'],['image','Fotoğraf'],['video','Video'],['voice','Ses'],['document','Belge']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.kind=value;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(value===kind));button.onclick=()=>{kind=value;query=form.elements.q.value.trim();tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b===button)));load()};tabs.append(button)}
    form.onsubmit=e=>{e.preventDefault();query=form.elements.q.value.trim();load()};form.elements.q.oninput=()=>{ticket++;busy=false;more.hidden=true;status.textContent='Aramak için Ara düğmesine dokun.'};more.onclick=()=>load(true);overlay.querySelector('[data-close]').focus();load();
  }

  function formatAudioTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const n = Math.max(0, Math.floor(value));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`;
  }

  function releaseMediaUrls(root){
    root?.querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.load()});
    root?.querySelectorAll('[data-object-url]').forEach(node=>{URL.revokeObjectURL(node.dataset.objectUrl);delete node.dataset.objectUrl});
    root?.querySelectorAll('.dm-voice-player').forEach(releaseVoicePlayer);
  }

  function loadRegularPhoto(message, image, status) {
    fetchMedia(message).then(async response => {
      const url = URL.createObjectURL(await response.blob());
      if (!image.isConnected) { URL.revokeObjectURL(url); return; }
      image.src = url; image.dataset.objectUrl = url; image.classList.add('loaded'); status?.remove();
    }).catch(error => { if (image.isConnected && status) status.textContent = error.message || 'Fotoğraf yüklenemedi'; });
  }

  function loadTemporaryPreview(message,image,status){
    fetchMedia(message,true).then(async response=>{const url=URL.createObjectURL(await response.blob());if(!image.isConnected){URL.revokeObjectURL(url);return}image.src=url;image.dataset.objectUrl=url;status?.remove()}).catch(error=>{if(error?.message?.includes('süresi doldu')||error?.message?.includes('artık kullanılamıyor'))markPhotoExpired(message);else if(status)status.textContent='Süreli fotoğraf'});
  }

  function renderMessage(message, mine) {
    if (isSystemConversation()) {
      mine = false;
      message = {...message, sender_avatar_asset:SYSTEM_AVATAR, sender_avatar:null,
        sender_frame_asset:null, bubble_asset:null};
    }
    const row = document.createElement('div');
    row._message={...message};row._mine=mine;
    row.className = 'bubble' + (mine ? ' me' : '');
    if (['image','voice','video','document'].includes(message?.media_type)) row.classList.add('dm-media-bubble');
    if (message?.id != null) row.dataset.messageId = String(message.id);
    if (message?.expires_at) row.dataset.ttlExpires = message.expires_at;
    row.dataset.read = message?.is_read ? '1' : '0';
    const portrait=document.createElement('span');portrait.className='dm-message-portrait';
    const asset=value=>/^\.?\/?assets\//.test(value)?new URL(value,document.baseURI).href:(window.ErisChatCosmetics?.assetUrl?.(value)||value);
    if(message.sender_avatar_asset){const img=document.createElement('img');img.src=asset?.(message.sender_avatar_asset)||message.sender_avatar_asset;img.alt='';portrait.append(img)}else portrait.textContent=message.sender_avatar||'👤';
    if(message.sender_frame_asset){const frame=document.createElement('img');frame.className='dm-message-frame';frame.src=asset?.(message.sender_frame_asset)||message.sender_frame_asset;frame.alt='';portrait.append(frame)}
    row.append(portrait);
    const body = document.createElement('div'); body.className='dm-message-text';
    if(message?.gift_key){
      if(message.gift_image_url){const img=document.createElement('img');img.src=window.ErisGiftArt?.url(message.gift_key,message.gift_image_url)||message.gift_image_url;img.alt=message.gift_key;img.style.cssText='display:block;width:70px;height:70px;object-fit:contain;margin:auto';body.append(img)}const label=document.createElement('strong');label.style.display='block';const quantity=Number(message.gift_quantity||message.quantity||String(message.text||'').match(/[×x](\d+)/)?.[1]||1);label.textContent=message.gift_key+' ×'+quantity;body.append(label);
      const price=document.createElement('small');price.textContent=(mine?'Gönderilen: ':'Hediye değeri: ')+Number(message.gift_price||0).toLocaleString('tr-TR')+' 🪙';body.append(price);if(message.gift_received!=null){const earned=document.createElement('small');earned.style.display='block';earned.textContent=mine?`Sizden gönderilen hediye karşılığında ${Number(message.gift_received).toLocaleString('tr-TR')} 🪙 kazandı`:`${Number(message.gift_received).toLocaleString('tr-TR')} 🪙 kazandınız`;body.append(earned)}
    }else body.textContent = message?.gift_key ? `🎁 ${message.gift_key}` : (String(message?.text||'').startsWith('[Story yanıtı #') ? String(message.text).replace(/^\[Story yanıtı #\d+\]\s*/, '') : (message?.media_type||message.poll||message.has_poll ? '' : String(message?.text ?? message?.message ?? '')));
    const storyReply=String(message?.text||'').startsWith('[Story yanıtı #');
    if(storyReply)row.classList.add('dm-story-reply');
    if(String(activeConversationId||'').startsWith('grp_')){const sender=document.createElement('b');sender.className='group-message-sender';sender.textContent=message.sender_nickname||'Üye';row.append(sender)}
    if(message.reply){
      const quote=document.createElement('button');quote.type='button';quote.className='dm-reply-quote';
      const who=document.createElement('b');who.textContent=message.reply.sender_name||'Yanıtlanan mesaj';
      const excerpt=document.createElement('span');excerpt.textContent=message.reply.text||'Mesaj artık görüntülenemiyor.';quote.append(who,excerpt);
      quote.disabled=!!message.reply.unavailable||!message.reply_to_id;
      quote.onclick=()=>jumpToMessage(message.reply_to_id);row.append(quote);
    }
    if(message.forwarded){const label=document.createElement('small');label.className='dm-forward-label';label.textContent='↪ İletildi';row.append(label)}
    row.append(body);
    if (message?.media_type === 'image') {
      const media=document.createElement('div');media.className='dm-image-message';
      const expired=message.temporary&&message.expires_at&&new Date(message.expires_at).getTime()<=Date.now();
      if(message.temporary&&!mine){
        const open=document.createElement('button');open.type='button';open.className='dm-temp-preview'+(expired?' expired':'');open.innerHTML=expired?'<span class="dm-temp-lock">⌛</span><span><b>Süre doldu</b><small>Bu fotoğraf artık görüntülenemiyor</small></span>':`<span class="dm-temp-lock">◉</span><span class="dm-temp-label"><b>Süreli fotoğraf</b><small>${Number(message.view_seconds||10)} sn · Dokunup aç</small></span>`;
        if(!expired){const preview=document.createElement('img');preview.className='dm-temp-blur';preview.alt='Bulanık süreli fotoğraf önizlemesi';open.prepend(preview);const status=document.createElement('span');status.className='dm-temp-status';open.prepend(status);loadTemporaryPreview(message,preview,status)}
        open.disabled=!!expired;open.onclick=()=>viewPhoto(message);media.append(open);
      }else{
        const image=document.createElement('img');image.className='dm-inline-photo';image.alt='Gönderilen fotoğraf';image.loading='lazy';
        const status=document.createElement('span');status.className='dm-media-loading';status.textContent='Fotoğraf yükleniyor…';
        const open=document.createElement('button');open.type='button';open.className='dm-photo-open';open.setAttribute('aria-label','Fotoğrafı büyüt');open.append(image,status);open.onclick=()=>viewPhoto(message);media.append(open);loadRegularPhoto(message,image,status);
      }
      if(storyReply)row.prepend(media);else row.append(media);
    } else if(message?.media_type==='video'){
      const media=document.createElement('div');media.className='dm-video-message';
      const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-label','Gönderilen video');
      const load=document.createElement('button');load.type='button';load.className='dm-attachment-action';load.textContent='▶ Videoyu yükle · '+formatFileSize(message.media_size);load.onclick=()=>loadAttachmentVideo(message,video,load);media.append(video,load);row.append(media);
    } else if(message?.media_type==='document'){
      const file=document.createElement('div');file.className='dm-document-message';const name=document.createElement('b');name.textContent=message.media_name||'Belge';const size=document.createElement('small');size.textContent=formatFileSize(message.media_size);const download=document.createElement('button');download.type='button';download.className='dm-attachment-action';download.textContent='Belgeyi indir';download.onclick=()=>downloadAttachment(message,download);file.append(name,size,download);row.append(file);
    } else if (message?.media_type === 'voice') {
      const player=document.createElement('div');player.className='dm-voice-player';
      player.innerHTML='<button type="button" class="dm-voice-toggle" aria-label="Sesli mesajı oynat">▶</button><div class="dm-voice-main"><div class="dm-wave" aria-hidden="true">'+Array.from({length:24},(_,i)=>`<i style="--h:${20+((i*17+9)%68)}%"></i>`).join('')+'</div><input class="dm-voice-progress" type="range" min="0" max="1000" value="0" aria-label="Sesli mesaj konumu"><div class="dm-track" aria-hidden="true"><i></i></div><small class="dm-voice-time">0:00</small></div><div class="dm-voice-controls"><button type="button" class="dm-voice-speed" aria-label="Oynatma hızı: 1 kat">1×</button><div><button type="button" data-voice-seek="-10" aria-label="10 saniye geri" disabled>−10</button><button type="button" data-voice-seek="10" aria-label="10 saniye ileri" disabled>+10</button></div></div><span class="dm-voice-status" role="status" aria-live="polite"></span>';
      player.querySelector('.dm-voice-toggle').onclick=()=>playVoice(message,player);
      player.querySelector('.dm-voice-progress').disabled=true;
      player.querySelector('.dm-voice-progress').oninput=()=>seekVoice(player,null);
      player.querySelectorAll('[data-voice-seek]').forEach(button=>button.onclick=()=>seekVoice(player,Number(button.dataset.voiceSeek)));
      player.querySelector('.dm-voice-speed').onclick=()=>{
        const rates=[1,1.5,2];player._rate=rates[(rates.indexOf(player._rate||1)+1)%rates.length];
        const button=player.querySelector('.dm-voice-speed');button.textContent=String(player._rate).replace('.',',')+'×';button.setAttribute('aria-label','Oynatma hızı: '+String(player._rate).replace('.',',')+' kat');
        if(player._audio)player._audio.playbackRate=player._rate;
      };row.append(player);
    }
    if (message?.is_pinned) { const pin=document.createElement('span'); pin.dataset.pinIcon=''; pin.textContent='📌 '; pin.style.cssText="font-size:8px;color:var(--ui-gold)"; row.prepend(pin); }
    const meta = document.createElement('small');
    meta.style.cssText = "display:flex;justify-content:flex-end;gap:5px;margin-top:4px;font-size:8px;line-height:1;color:color-mix(in srgb, var(--ui-ink) 61%, transparent);white-space:nowrap";
    meta.className='dm-message-meta';
    const when = document.createElement('span'); when.textContent = messageTime(message?.created_at); meta.append(when);
    if(message.edited_at){const edited=document.createElement('span');edited.className='dm-edited';edited.textContent='düzenlendi';meta.append(edited)}
    if (mine) { const checks = document.createElement('span'); checks.className='dm-checks'; checks.textContent = message?.is_read ? '✓✓' : '✓'; checks.setAttribute('aria-label', message?.is_read ? 'Okundu' : 'Gönderildi'); meta.append(checks); }
    renderMediaCaption(row,message);
    row.append(meta);renderReadReceipt(row,message);
    renderMessageReactions(row,message);renderMessageStar(row,message);renderMessagePoll(row,message);
    if(message.bubble_asset && message.media_type!=='voice'){const content=document.createElement('div');content.className='rel-chat-bubble dm-award-content';window.ErisVisualLayout?.bubble(content,message.bubble_asset);for(const child of [...row.children])if(child!==portrait)content.append(child);row.append(content);row.classList.add('dm-award-bubble')}

    if (message?.is_pinned) row.dataset.pinned = '1';
    return row;
  }

  function renderMediaCaption(row,message){
    row.querySelector('.dm-media-caption')?.remove();
    if(!message.caption||message.temporary||!['image','video','document'].includes(message.media_type))return;
    const caption=document.createElement('p');caption.className='dm-media-caption';caption.textContent=message.caption;
    const content=row.querySelector('.dm-award-content')||row,meta=content.querySelector('.dm-message-meta');if(meta)meta.before(caption);else content.append(caption);
  }
  function renderReadReceipt(row,message){
    if(!row?._mine)return;const mark=row.querySelector('.dm-checks');if(!mark)return;
    const total=Number(message.recipient_count),seen=Number(message.read_count),counted=message.recipient_count!=null&&message.read_count!=null;
    mark.textContent=message.is_read?'✓✓':counted&&seen>0?'✓ '+seen+'/'+total:'✓';
    mark.setAttribute('aria-label',counted&&total>0?seen+' / '+total+' kişi okudu':message.is_read?'Okundu':'Gönderildi');row.dataset.read=message.is_read?'1':'0';
  }
  function refreshMessageInfo(){document.querySelector('[data-message-info]')?._reload?.()}
  function openMessageInfo(){
    const row=selectedMessages.size===1?[...selectedMessages][0]:null,m=row?._message,cid=activeConversationId,user=currentUserId,chatVersion=chatRevision;
    if(!m||!row._mine||isSystemConversation()||m.temporary||m.protected_message)return;
    if(!document.getElementById('dm-info-style')){const style=document.createElement('style');style.id='dm-info-style';style.textContent='[data-message-info] [data-info-counts]{padding:14px;border:1px solid var(--ui-line);border-radius:14px;font-size:18px;font-weight:750;color:var(--ui-gold)}[data-message-info] [role=group]{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}[data-message-info] [aria-pressed=true]{border-color:var(--ui-gold);background:var(--ui-button)}[data-message-info] [data-info-people]>p{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--ui-line)}[data-message-info] [data-info-people] span{white-space:nowrap;font-size:12px}[data-message-info] [data-info-more]{width:100%;margin-top:12px}';document.head.append(style)}
    const panel=messageActionPanel('Mesaj bilgisi');panel.dataset.messageInfo='';panel.dataset.messageId=String(m.id);panel.dataset.conversationId=String(cid);
    const content=panel.querySelector('[data-content]'),status=panel.querySelector('[data-status]');
    content.innerHTML='<div data-info-meta></div><p data-info-counts></p><p>Mesaj gönderildiğinde sohbette olup hâlâ üye olan kişiler gösterilir. Okundu bilgisi, ses kaydının dinlendiği veya dosyanın indirildiği anlamına gelmez.</p><div role="group" aria-label="Okunma filtreleri"><button type="button" data-info-view="all">Tümü</button><button type="button" data-info-view="read">Okuyanlar</button><button type="button" data-info-view="unread">Henüz okumayanlar</button></div><button type="button" data-info-refresh>Yenile</button><div data-info-people></div><button type="button" data-info-more hidden>Daha fazla kişi</button>';
    const people=content.querySelector('[data-info-people]'),meta=content.querySelector('[data-info-meta]'),counts=content.querySelector('[data-info-counts]'),more=content.querySelector('[data-info-more]');
    let view='all',cursor=null,revision=0,busy=false;const valid=()=>panel.isConnected&&user===currentUserId&&chatVersion===chatRevision&&String(cid)===String(activeConversationId);
    async function load(append=false){
      if(!valid()||append&&busy)return;busy=true;const own=++revision;if(!append){cursor=null;people.replaceChildren()}more.hidden=true;status.textContent='Mesaj bilgisi yükleniyor…';
      panel.querySelectorAll('[data-info-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.infoView===view)));
      try{const data=await api().api('/message-info/'+encodeURIComponent(cid)+'/'+Number(m.id)+'?view='+view+'&limit=30'+(append&&cursor?'&after='+cursor:''));
        if(!valid()||own!==revision)return;
        meta.replaceChildren();const text=document.createElement('p'),date=document.createElement('small');text.textContent=data.message.media_name||data.message.text||'Mesaj';date.textContent='Gönderildi: '+messageTime(data.message.created_at)+(data.message.edited_at?' · Düzenlendi: '+messageTime(data.message.edited_at):'')+(data.message.media_size?' · '+formatFileSize(data.message.media_size):'');meta.append(text,date);
        counts.textContent=data.read_count+' / '+data.recipient_count+' kişi okudu';
        for(const person of asList(data,['recipients'])){if([...people.children].some(x=>x.dataset.infoUser===String(person.user_id)))continue;const item=document.createElement('p');item.dataset.infoUser=String(person.user_id);const name=document.createElement('b'),state=document.createElement('span');name.textContent=person.nickname||'Kullanıcı';state.textContent=person.is_read?' · Okundu':' · Henüz okunmadı';item.append(name,state);people.append(item)}
        const body=$('chat')?.querySelector('.chatBody'),existing=body?.querySelector('[data-message-id="'+Number(m.id)+'"]');if(existing)appendMessageOnce(body,{...existing._message,is_read:data.is_read,read_count:data.read_count,recipient_count:data.recipient_count},true);
        cursor=data.next_after;more.hidden=!data.has_more;status.textContent=people.children.length?'':'Bu filtrede kişi yok.';
      }catch(e){if(valid()&&own===revision){people.replaceChildren();meta.replaceChildren();counts.textContent='';status.textContent=e.message||'Mesaj bilgisi yüklenemedi.'}}
      finally{if(own===revision)busy=false}
    }
    panel._reload=()=>load();panel.querySelectorAll('[data-info-view]').forEach(b=>b.onclick=()=>{view=b.dataset.infoView;load()});content.querySelector('[data-info-refresh]').onclick=()=>load();more.onclick=()=>load(true);load();
  }
  function renderMessageReactions(row,message){
    row.querySelector('.dm-reactions')?.remove();
    if(Array.isArray(message.reactions)&&message.reactions.length){
      const reactions=document.createElement('div');reactions.className='dm-reactions';reactions.setAttribute('aria-label','Mesaj tepkileri');
      for(const reaction of message.reactions){if(!REACTION_EMOJIS.includes(reaction.emoji))continue;const button=document.createElement('button');button.type='button';button.textContent=reaction.emoji+' '+reaction.count;button.setAttribute('aria-pressed',String(!!reaction.mine));button.setAttribute('aria-label',reaction.emoji+' · '+reaction.count+' tepki'+(reaction.mine?' · Senin tepkin':''));button.onclick=e=>{e.stopPropagation();setMessageReaction(row,reaction.mine?null:reaction.emoji,button)};reactions.append(button)}
      (row.querySelector('.dm-award-content')||row).append(reactions);
    }
  }

  function appendMessageOnce(body, message, mine) {
    if (!body || !message) return null;
    const id = message.id ?? message.message_id;
    if (id != null) {
      const existing = [...body.querySelectorAll('.bubble[data-message-id]')].find(row => row.dataset.messageId === String(id));
      if (existing) {
        const old=existing._message||{},merged={...old,...message,id};
        if(old.poll&&merged.poll&&((old.poll.is_closed&&!merged.poll.is_closed)||Number(merged.poll.revision||0)<Number(old.poll.revision||0)))merged.poll=old.poll;
        if(old.text!==merged.text||old.edited_at!==merged.edited_at||JSON.stringify(old.reply)!==JSON.stringify(merged.reply)||old.is_pinned!==merged.is_pinned||!!old.forwarded!==!!merged.forwarded){
          const next=renderMessage(merged,mine);const selected=selectedMessages.has(existing);
          if(selected){selectedMessages.delete(existing);selectedMessages.add(next);next.classList.add('dm-selected')}
          releaseMediaUrls(existing);existing.replaceWith(next);
          if(old.text!==merged.text)for(const quote of [...body.querySelectorAll('.bubble[data-message-id]')])if(Number(quote._message?.reply_to_id)===Number(id)&&!quote._message.reply?.unavailable)appendMessageOnce(body,{...quote._message,reply:{...quote._message.reply,text:String(merged.text||'').slice(0,180)}},quote._mine);
          return next;
        }
        existing._message=merged;renderReadReceipt(existing,merged);if(old.caption!==merged.caption)renderMediaCaption(existing,merged);
        if(JSON.stringify(old.poll)!==JSON.stringify(merged.poll)||old.has_poll!==merged.has_poll)renderMessagePoll(existing,merged);
        if(!!old.is_starred!==!!merged.is_starred)renderMessageStar(existing,merged);
        if(JSON.stringify(old.reactions)!==JSON.stringify(merged.reactions))renderMessageReactions(existing,merged);
        return existing;
      }
    }
    body.querySelectorAll(':scope > .muted').forEach(node=>node.remove());
    const row = renderMessage({...message, id}, mine);
    const later=Number.isFinite(Number(id))?[...body.querySelectorAll('.bubble[data-message-id]')].find(node=>Number(node.dataset.messageId)>Number(id)):null;
    if(later)body.insertBefore(row,later);else body.appendChild(row);
    return row;
  }

  function refreshSelectionBar() {
    if (!selectionBar) return;
    selectionBar.hidden = !messageSelectionMode;
    $('chat')?.classList.toggle('dm-selection-mode', messageSelectionMode);
    const count = selectionBar.querySelector('[data-selected-count]');
    if (count) count.textContent = allMessagesSelected?'Tüm mesajlar seçildi':`${selectedMessages.size} seçildi`;
    const one=selectedMessages.size===1&&!allMessagesSelected?[...selectedMessages][0]:null;
    const reply=selectionBar.querySelector('[data-reply-selected]'),edit=selectionBar.querySelector('[data-edit-selected]');
    if(reply)reply.disabled=!one||isSystemConversation();
    if(edit)edit.disabled=!one||!canEditMessage(one);
    const star=selectionBar.querySelector('[data-star-selected]');if(star){star.disabled=!one||isSystemConversation()||((!!one?._message?.protected_message||!!one?._message?.temporary||!!one?._message?.expires_at)&&!one?._message?.is_starred);star.textContent=one?._message?.is_starred?'Yıldızı kaldır':'Yıldızla'}
    const react=selectionBar.querySelector('[data-react-selected]'),forward=selectionBar.querySelector('[data-forward-selected]');
    if(react)react.disabled=!one||isSystemConversation()||!!one?._message?.temporary||!!one?._message?.protected_message;
    if(forward)forward.disabled=isSystemConversation()||allMessagesSelected||!selectedMessages.size||selectedMessages.size>10||[...selectedMessages].some(row=>!canForwardMessage(row._message));
    const info=selectionBar.querySelector('[data-info-selected]');if(info)info.disabled=!one||!one._mine||isSystemConversation()||!!one._message?.temporary||!!one._message?.protected_message;
    const pin = selectionBar.querySelector('[data-pin-selected]');
    if (pin) {pin.textContent='📌';pin.title=[...selectedMessages].some(row => row.dataset.pinned === '1') ? 'Sabitlemeyi kaldır' : 'Sabitle';pin.setAttribute('aria-label',pin.title)}
    selectionBar.querySelector('[data-delete-selected]').disabled = !selectedMessages.size;
    selectionBar.querySelector('[data-pin-selected]').disabled = pinBusy || !one || $('chat')?.dataset.pinManage!=='1' || (!one?._message?.is_pinned && (!!one?._message?.temporary||!!one?._message?.expires_at||!!one?._message?.protected_message));
    selectionBar.querySelector('[data-all-selected]').setAttribute('aria-pressed',String(allMessagesSelected));selectionBar.querySelector('[data-all-selected]').textContent=allMessagesSelected?'☑':'□';
  }

  function setSelected(row) {
    const id = row?.dataset?.messageId;
    if (!id) return;
    messageSelectionMode = true;
    allMessagesSelected = false;
    if (selectedMessages.has(row)) { selectedMessages.delete(row); row.classList.remove('dm-selected'); }
    else { selectedMessages.add(row); row.classList.add('dm-selected'); }
    refreshSelectionBar();
  }

  function asList(value, keys) {
    if (Array.isArray(value)) return value;
    for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
    return [];
  }

  function dmDeleteScope(){
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='dm-vault-modal';modal.style.setProperty('z-index','100120','important');
      modal.innerHTML='<section role="alertdialog" aria-modal="true"><header><h3>Mesajları ne şekilde silmek istiyorsunuz?</h3><button type="button" data-close aria-label="Kapat">×</button></header><footer><button type="button" class="accept" data-me>Kendim İçin</button><button type="button" class="reject" data-everyone>'+(String(activeConversationId||'').startsWith('grp_')?'Herkes İçin':'İki Taraf İçin')+'</button></footer></section>';
      document.body.append(modal);
      const done=value=>{modal.remove();resolve(value)};
      modal.querySelector('[data-me]').onclick=()=>done('me');
      modal.querySelector('[data-everyone]').onclick=()=>done('everyone');
      modal.querySelector('[data-close]').onclick=()=>done(null);
      modal.onclick=e=>{if(e.target===modal)done(null)};
    });
  }

  function dmConfirm(question){
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='dm-vault-modal';modal.style.setProperty('z-index','100120','important');
      modal.innerHTML='<section role="alertdialog" aria-modal="true"><header><h3>İşlem onayı</h3><button type="button" data-no aria-label="Kapat">×</button></header><p></p><footer><button type="button" class="accept" data-yes>Kabul et</button><button type="button" class="reject" data-cancel>İptal</button></footer></section>';
      modal.querySelector('p').textContent=question;document.body.append(modal);
      const done=value=>{modal.remove();resolve(value)};
      modal.querySelector('[data-yes]').onclick=()=>done(true);
      modal.querySelector('[data-no]').onclick=modal.querySelector('[data-cancel]').onclick=()=>done(false);
      modal.onclick=e=>{if(e.target===modal)done(false)};
    });
  }

  function avatarValue(value, fallback = '') {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    return value.url || value.src || value.avatar_url || value.asset_url || value.path || fallback;
  }

  function renderAvatar(el, value, fallback, frameKey = '') {
    if (!el) return;
    const avatar = avatarValue(value, fallback);
    el.classList.remove('visual-portrait','visual-portrait-static');
    if(el.dataset.objectUrl){URL.revokeObjectURL(el.dataset.objectUrl);delete el.dataset.objectUrl;}
    el.dataset.avatarRequest = String(Number(el.dataset.avatarRequest || 0) + 1);
    el.textContent = '';
    el.style.backgroundImage = '';
    const fileAsset=/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(avatar);
    const imageUrl=fileAsset?(window.ErisChatCosmetics?.assetUrl?.(avatar)||avatar):avatar;
    if (/^(https?:|data:|blob:|\/|\.\.?\/)/.test(imageUrl)) {
      el.style.backgroundImage = `url("${imageUrl.replace(/"/g,'%22')}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.setAttribute('aria-label', fallback || 'Avatar');
    } else {
      el.textContent = avatar || fallback || '👤';
    }
    if(frameKey){const frame=document.createElement('img');frame.className='dm-avatar-frame';frame.src=window.ErisChatCosmetics?.assetUrl?.(frameKey)||frameKey;frame.alt='';frame.style.cssText='position:absolute;inset:-8%;width:116%;height:116%;object-fit:contain;pointer-events:none';el.style.position='relative';el.append(frame);window.ErisVisualLayout?.portraits(el);}
  }

  function renderConversationAvatar(el, info, fallback) {
    renderAvatar(el, fallback, fallback);
    if (!el || !info?.avatar_url) return;
    const request = el.dataset.avatarRequest;
    const token = api()?.getAccessToken?.();
    // Family and group images require a bearer token; CSS image requests cannot send one.
    fetch(api().messageMediaUrl(info.avatar_url), {headers:token?{Authorization:'Bearer '+token}:{},cache:'no-store'})
      .then(res=>{if(!res.ok)throw new Error('Avatar');return res.blob()})
      .then(blob=>{if(!el.isConnected || el.dataset.avatarRequest!==request)return;
        const url=URL.createObjectURL(blob);el.dataset.objectUrl=url;el.textContent='';
        el.style.backgroundImage=`url("${url}")`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';
      }).catch(()=>{});
  }

  async function resolveParticipant(conversation) {
    const members = asList(conversation?.members, ['members']);
    const other = members.find(member => String(member?.user_id) !== String(currentUserId));
    if (!other?.user_id) return {};
    if (other.nickname) return other;
    try {
      return await api().api(`/users/${encodeURIComponent(other.user_id)}`);
    } catch (error) {
      console.warn('[LidyaChat] participant profile unavailable', error);
      return { id: other.user_id, nickname: 'Anonim kullanıcı' };
    }
  }

  function showListError(list) {
    if(list){list.innerHTML='<div class="dm-list-state" role="status"><b>Konuşmalar yüklenemedi</b><p>Bağlantını kontrol edip yeniden dene.</p><button type="button" data-retry>Tekrar dene</button></div>';list.querySelector('[data-retry]').onclick=loadConversations;}
  }

  async function fetchMedia(message, preview=false,thumbnail=false) {
    const token=api()?.getAccessToken?.()||localStorage.getItem('erischat_access_token')||localStorage.getItem('token')||'';
    let url=api()?.messageMediaUrl?.(message.media_url);
    if(!url)throw new Error('Medya adresi bulunamadı.');
    if(preview)url+=(url.includes('?')?'&':'?')+'preview=1';
    if(thumbnail)url+=(url.includes('?')?'&':'?')+'thumbnail=1';
    const headers=token?{Authorization:'Bearer '+token}:{};
    if(vaultToken)headers['X-Eris-DM-Vault']=vaultToken;
    const response=await fetch(url,{headers,cache:'no-store'});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.detail||'Medya açılamadı.');}
    return response;
  }

  async function viewPhoto(message) {
    if(message._expired)return;
    let response,objectUrl;
    try{response=await fetchMedia(message);objectUrl=URL.createObjectURL(await response.blob());}
    catch(error){if(error?.message?.includes('süresi doldu')||error?.message?.includes('artık kullanılamıyor'))markPhotoExpired(message);window.toast?.(error.message||'Fotoğraf açılamadı.');return;}
    const seconds=Number(response.headers.get('X-Erischat-Expires-In')||0);
    const protectedView=!!message.temporary&&seconds>0;
    if(protectedView)schedulePhotoExpiry(message,seconds);
    const modal=document.createElement('div');modal.id='erisTemporaryPhotoViewer';modal.className='dm-photo-viewer';
    modal.innerHTML='<div class="dm-photo-viewer-head"><b data-photo-label></b><button type="button" data-photo-close aria-label="Kapat">×</button></div><img data-photo-image alt="Gönderilen fotoğraf"><small data-photo-timer></small>';
    document.body.append(modal);modal.querySelector('[data-photo-image]').src=objectUrl;
    let timer=null;const expiresAt=Date.now()+seconds*1000;
    const label=modal.querySelector('[data-photo-label]'),countdown=modal.querySelector('[data-photo-timer]');
    const update=()=>{const remain=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));label.textContent=protectedView?'Süreli fotoğraf':'';countdown.textContent=protectedView?`Kalan süre · ${remain} sn`:'';return remain};update();
    const close=()=>{if(timer)clearInterval(timer);window.ErisScreenProtection?.set?.('temporary-photo',false);modal.remove();URL.revokeObjectURL(objectUrl);document.removeEventListener('contextmenu',block);document.removeEventListener('keydown',keyBlock,true);window.removeEventListener('blur',blurCheck);document.removeEventListener('visibilitychange',visibilityCheck)};
    const block=e=>{if(protectedView)e.preventDefault()};
    const keyBlock=e=>{if(protectedView&&(e.key==='PrintScreen'||(e.ctrlKey&&['s','p','c'].includes(e.key.toLowerCase())))){e.preventDefault();e.stopImmediatePropagation()}};
    const blurCheck=()=>{if(protectedView)modal.classList.add('capture-hidden')};
    const visibilityCheck=()=>{if(document.hidden&&protectedView)modal.classList.add('capture-hidden');else modal.classList.remove('capture-hidden')};
    modal.querySelector('[data-photo-close]').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal&&!protectedView)close()});
    if(protectedView){window.ErisScreenProtection?.set?.('temporary-photo',true);modal.addEventListener('contextmenu',block);document.addEventListener('contextmenu',block);document.addEventListener('keydown',keyBlock,true);window.addEventListener('blur',blurCheck);document.addEventListener('visibilitychange',visibilityCheck);timer=setInterval(()=>{if(update()<=0){markPhotoExpired(message);close()}},250)}
  }

  function voiceButton(player,playing=false,loading=false){
    const button=player.querySelector('.dm-voice-toggle');
    button.disabled=loading;button.textContent=loading?'…':playing?'Ⅱ':'▶';
    button.setAttribute('aria-label',loading?'Sesli mesaj yükleniyor':playing?'Sesli mesajı duraklat':'Sesli mesajı oynat');
    button.setAttribute('aria-pressed',String(playing));player.setAttribute('aria-busy',String(loading));
  }
  function releaseVoicePlayer(player){
    player._voiceJob=null;
    if(activeVoicePlayer===player){activeVoicePlayer=null;voicePlayRevision++}
    const audio=player._audio;player._audio=null;
    if(audio){audio.onplay=audio.onpause=audio.onended=audio.ontimeupdate=audio.onloadedmetadata=audio.ondurationchange=audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load()}
    if(player._objectUrl)URL.revokeObjectURL(player._objectUrl);player._objectUrl=null;
    voiceButton(player);syncVoice(player);
  }
  function syncVoice(player){
    const audio=player._audio,duration=audio?.duration,known=Number.isFinite(duration)&&duration>0;
    const current=Number.isFinite(audio?.currentTime)?Math.max(0,audio.currentTime):0;
    const progress=player.querySelector('.dm-voice-progress'),ratio=known?Math.min(1,current/duration):0;
    progress.disabled=!known;progress.value=String(Math.round(ratio*1000));
    progress.setAttribute('aria-valuetext',formatAudioTime(current)+(known?' / '+formatAudioTime(duration):''));
    player.querySelector('.dm-voice-time').textContent=formatAudioTime(current)+(known?' / '+formatAudioTime(duration):'');
    player.querySelector('.dm-wave').style.setProperty('--played',`${ratio*100}%`);player.querySelector('.dm-track i').style.width=`${ratio*100}%`;
    player.querySelectorAll('[data-voice-seek]').forEach(button=>button.disabled=!known);
  }
  function seekVoice(player,delta){
    const audio=player._audio;if(!audio||!Number.isFinite(audio.duration)||audio.duration<=0)return;
    const desired=delta===null?audio.duration*Number(player.querySelector('.dm-voice-progress').value)/1000:audio.currentTime+delta;
    if(Number.isFinite(desired)){audio.currentTime=Math.max(0,Math.min(audio.duration,desired));syncVoice(player)}
  }
  async function playVoice(message,player){
    if(!player?.isConnected||player._voiceJob)return;
    if(player._audio&&!player._audio.paused){voicePlayRevision++;player._audio.pause();return}
    // Cancel pending work on the previous player so it can be selected again immediately.
    if(activeVoicePlayer&&activeVoicePlayer!==player){
      if(activeVoicePlayer._voiceJob)releaseVoicePlayer(activeVoicePlayer);
      else{activeVoicePlayer._audio?.pause();voiceButton(activeVoicePlayer)}
    }
    const revision=++voicePlayRevision,job={};activeVoicePlayer=player;player._voiceJob=job;
    const valid=()=>player.isConnected&&player._voiceJob===job&&revision===voicePlayRevision&&activeVoicePlayer===player;
    const status=player.querySelector('.dm-voice-status');status.textContent='';voiceButton(player,false,true);
    try{
      if(!player._audio){
        const response=await fetchMedia(message),blob=await response.blob();if(!valid())return;
        const url=URL.createObjectURL(blob),audio=new Audio(url);player._audio=audio;player._objectUrl=url;
        const sync=()=>syncVoice(player);
        audio.ontimeupdate=audio.onloadedmetadata=audio.ondurationchange=sync;
        audio.onplay=()=>{if(!player.isConnected||activeVoicePlayer!==player){audio.pause();return}voiceButton(player,true)};
        audio.onpause=()=>voiceButton(player);
        audio.onended=()=>{audio.currentTime=0;sync();voiceButton(player)};
        audio.onerror=()=>{releaseVoicePlayer(player);if(player.isConnected)status.textContent='Sesli mesaj açılamadı. Yeniden deneyin.'};sync();
      }
      const audio=player._audio;audio.playbackRate=player._rate||1;audio.preservesPitch=true;
      await audio.play();if(!valid()){audio.pause();return}voiceButton(player,!audio.paused);
    }catch(error){if(valid()){voiceButton(player);status.textContent=error.message||'Sesli mesaj oynatılamadı. Yeniden deneyin.'}}
    finally{if(player._voiceJob===job){player._voiceJob=null;if(player.isConnected)voiceButton(player,!!player._audio&&!player._audio.paused)}}
  }

  async function uploadMedia(file,type,seconds=0,expected=null,caption=''){
    const conversationId=expected?.id||activeConversationId,revision=expected?.revision??chatRevision,owner=expected?.user??currentUserId;
    const valid=()=>revision===chatRevision&&String(activeConversationId)===String(conversationId)&&owner===currentUserId;
    const reject=message=>{if(expected)throw new Error(message);window.toast?.(message);return false};
    if(expected&&!valid())return reject('Sohbet değişti. Dosyayı yeniden seçin.');
    if(!conversationId||!api()?.sendMessageMedia||!file)return reject('Medya gönderimi şu anda kullanılamıyor.');
    const maximum=type==='video'?25*1024*1024:type==='document'?20*1024*1024:12*1024*1024;
    if(file.size>maximum)return reject('Dosya en fazla '+maximum/(1024*1024)+' MB olabilir.');
    const lock=String(conversationId);
    if(mediaUploadsInFlight.has(lock))return reject('Bu sohbette bir dosya gönderiliyor. Tamamlanınca yeniden deneyin.');
    mediaUploadsInFlight.add(lock);setUploadStatus('Dosya gönderiliyor…');
    try{
      const message=await api().sendMessageMedia(conversationId,file,type,seconds,caption);
      if(valid()){
        const body=document.querySelector('#chat .chatBody');appendMessageOnce(body,message,true);
        if(body)body.scrollTop=body.scrollHeight;
      }
      if(owner===currentUserId)loadConversations();return message;
    }catch(error){if(expected)throw error;if(valid())window.toast?.(error.message||'Medya gönderilemedi.');return false}
    finally{mediaUploadsInFlight.delete(lock);if(valid())setUploadStatus('')}
  }

  function closeAttachmentPreview(){attachmentPreview?.close();attachmentPreview=null}
  function openAttachmentPreview(file,type,seconds,context){
    const chat=$('chat'),valid=()=>context.id===activeConversationId&&context.revision===chatRevision&&context.user===currentUserId&&chat?.classList.contains('show')&&!chat.querySelector('.compose')?.hidden&&chat.dataset.groupWriteBlocked!=='1'&&!isSystemConversation();
    if(!valid()){window.toast?.('Sohbet değişti veya gönderim izni kaldırıldı.');return}
    if(voiceRecorder?.isActive()){window.toast?.('Önce ses kaydını gönderin veya silin.');return}
    if(!window.ErisAttachmentPreview){window.toast?.('Gönderim önizlemesi için uygulamayı yenileyin.');return}
    let panel;
    try{file=window.ErisAttachmentPreview.prepare(file,type,seconds);panel=messageActionPanel('Gönderim önizlemesi');
      attachmentPreview=window.ErisAttachmentPreview.open({panel,host:chat,file,type,seconds,name:chat.querySelector('.chatHead b')?.textContent,valid,
        send:(chosen,caption)=>uploadMedia(chosen,type,seconds,context,caption),reselect:()=>type==='image'?pickPhoto(seconds):pickAttachment(type),closed:()=>{attachmentPreview=null;chat.querySelector('[data-dm-photo]')?.focus()}});
    }catch(e){panel?.remove();window.toast?.(e.message||'Dosya önizlemesi açılamadı.')}
  }

  function pickPhoto(seconds=0,camera=false){
    const id=activeConversationId,revision=chatRevision,owner=currentUserId,input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif';if(camera)input.setAttribute('capture','environment');
    input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(owner!==currentUserId||revision!==chatRevision||String(activeConversationId)!==String(id)){window.toast?.('Sohbet değişti. Dosyayı yeniden seçin.');return}openAttachmentPreview(file,'image',seconds,{id,revision,user:owner})};input.click();
  }

  function openPhotoChooser(){
    if(voiceRecorder?.isActive()){window.toast?.('Önce ses kaydını gönderin veya silin.');return}
    const modal=document.createElement('div');modal.className='dm-gift-sheet';modal.innerHTML="<section><div style=\"display:flex;align-items:center;justify-content:space-between\"><b>Fotoğraf, video ve belge</b><button class=\"close\" data-x>×</button></div><p style=\"font-size:9px;color:var(--ui-ink);line-height:1.5\">Normal fotoğraf mesajda kalır. Süreli fotoğraf, alıcı ilk açtığında seçilen sürenin sonunda silinir.</p><div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px\"><button data-gallery>🖼 Galeriden fotoğraf</button><button data-camera>📷 Kamerayla fotoğraf</button></div><hr style=\"border-color:var(--ui-line);margin:14px 0\"><b style=\"font-size:11px\">Süreli fotoğraf</b><div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px\"><button data-temp=\"10\" aria-pressed=\"true\">10 sn</button><button data-temp=\"20\">20 sn</button><button data-temp=\"30\">30 sn</button></div><div data-temp-source style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px\"><button data-source=\"gallery\">🖼 Süreli galeriden</button><button data-source=\"camera\">📸 Süreli kamera</button></div></section>";document.body.append(modal);
    const attachments=document.createElement('div');attachments.className='dm-attachment-choices';attachments.innerHTML='<button type="button" data-video>▶ Video gönder</button><button type="button" data-document>▤ Belge gönder</button><small>Video: MP4/WEBM · 25 MB · 2 dakika<br>Belge: PDF, TXT, CSV, ZIP, DOCX, XLSX, PPTX · 20 MB</small>';
    modal.querySelector('[data-camera]').parentElement.after(attachments);
    for(const kind of ['video','document'])attachments.querySelector('[data-'+kind+']').onclick=()=>{modal.remove();pickAttachment(kind)};
    modal.dataset.attachmentChooser='';modal.querySelector('section').setAttribute('role','dialog');modal.querySelector('section').setAttribute('aria-modal','true');modal.querySelector('section').setAttribute('aria-label','Fotoğraf, video ve belge gönder');
    modal.onkeydown=e=>{if(e.key==='Escape')modal.remove();if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};modal.querySelector('[data-x]').focus();
    let duration=10;modal.querySelector('[data-x]').onclick=()=>modal.remove();modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
    modal.querySelector('[data-gallery]').onclick=()=>{modal.remove();pickPhoto(0,false)};modal.querySelector('[data-camera]').onclick=()=>{modal.remove();pickPhoto(0,true)};
    modal.querySelectorAll('[data-temp]').forEach(b=>b.onclick=()=>{duration=Number(b.dataset.temp);modal.querySelectorAll('[data-temp]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));modal.querySelector('[data-temp-source]').style.outline='1px solid var(--ui-gold,#b98c46)';window.toast?.('Süre '+duration+' saniye seçildi; galeriden veya kameradan gönder.')});
    modal.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{modal.remove();pickPhoto(duration,b.dataset.source==='camera')});
  }

  function cancelVoiceRecording(){voiceRecorder?.cancel();voiceRecorder=null}
  async function toggleVoiceRecording(button){
    if(voiceRecorder?.isActive()){voiceRecorder.focus();return}
    const chat=$('chat'),context={id:activeConversationId,revision:chatRevision,user:currentUserId};
    const valid=()=>!!context.id&&context.id===activeConversationId&&context.revision===chatRevision&&context.user===currentUserId&&chat?.classList.contains('show')&&!chat.querySelector('.compose')?.hidden&&chat.dataset.groupWriteBlocked!=='1'&&!isSystemConversation();
    if(!valid())return;
    if(messageMode){window.toast?.('Önce yanıt veya düzenleme işlemini tamamlayın.');return}
    if(!window.ErisVoiceRecorder){window.toast?.('Ses kaydı araçlarını yüklemek için uygulamayı yenileyin.');return}
    voiceRecorder=window.ErisVoiceRecorder.create({host:chat,valid,send:file=>uploadMedia(file,'voice',0,context),notice:text=>window.toast?.(text),changed:active=>{
      button.setAttribute('aria-pressed',String(active));button.title=active?'Ses kaydı araçlarını aç':'Ses kaydet';button.setAttribute('aria-label',button.title);
    }});
    await voiceRecorder.start();
  }

  let activeCaptureKey = null;

  function syncDmCapturePreference(chat) {
    if(activeCaptureKey)window.ErisScreenProtection?.set(activeCaptureKey,false);
    activeCaptureKey=null;
    chat?.querySelectorAll('[data-dm-capture-toggle]').forEach(button=>button.remove());
  }

  function installFolderStyles(){
    if(document.getElementById("dm-folder-style"))return;
    const folderStyle=document.createElement('style');folderStyle.id='dm-folder-style';folderStyle.textContent=`
      #chat .chatHead{position:relative;min-height:65px}#chat.dm-selection-mode .chatHead>.ava,#chat.dm-selection-mode .chatHead>.grow,#chat.dm-selection-mode .chatHead>.close{visibility:hidden}
      #chat .dm-select-tools{position:absolute;inset:0 0 auto 0;min-height:65px;z-index:5;justify-content:flex-end;background:color-mix(in srgb, var(--ui-panel) 91%, transparent);flex-wrap:wrap}
      #chat .dm-select-tools[hidden]{display:none!important}#chat .dm-select-tools [data-selected-count]{margin-right:auto}
      #chat .dm-select-tools button{width:34px;height:34px;border-radius:11px;font-size:17px;padding:0}
      #chat .dm-select-tools button[data-delete-selected]{color:var(--ui-danger);border-color:var(--ui-danger)}#chat .dm-select-tools button:disabled{opacity:.4}
      #chat.dm-selection-mode .chatBody .bubble[data-message-id]{position:relative;transform:translateX(24px);margin-right:25px;max-width:calc(78% - 24px);cursor:pointer}
      #chat.dm-selection-mode .chatBody .bubble[data-message-id]::before{content:'';position:absolute;left:-31px;top:calc(50% - 10px);width:19px;height:19px;border:1px solid var(--ui-line);border-radius:5px;background:var(--ui-panel)}
      #chat.dm-selection-mode .chatBody .bubble.dm-selected::before{content:'✓';text-align:center;line-height:19px;background:var(--ui-button);border-color:var(--ui-line);color:var(--ui-ink)}
      #messages .dm-inbox-nav{display:flex;gap:8px;margin:8px 0 12px}#messages .dm-inbox-nav[hidden]{display:none!important}#messages .dm-inbox-nav button,#messages .dm-list-tools button{border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-raised);color:var(--ui-ink);padding:9px 10px;font-size:11px}
      #messages .dm-inbox-nav button{flex:1}#messages .dm-list-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}#messages .dm-list-tools[hidden]{display:none!important}#messages .dm-list-tools [data-count]{flex:1;min-width:100px;font-size:10px}#messages .dm-list-tools [data-select-all],#messages .dm-list-tools [data-delete],#messages .dm-list-tools [data-cancel]{width:36px;min-width:36px;height:36px;padding:0;font-size:17px}
      #messages .dm-list-selected{border-color:var(--ui-line);box-shadow:0 0 0 1px var(--ui-shadow)}#messages .dm-list-selected::before{content:'✓';border:1px solid var(--ui-line);border-radius:5px;padding:2px 5px;background:var(--ui-button)}
      .dm-vault-modal{position:fixed;inset:0;z-index:22000;background:var(--ui-overlay);backdrop-filter:blur(7px);display:grid;place-items:center;padding:18px}
      .dm-vault-modal section{width:min(440px,100%);max-height:90vh;overflow:auto;padding:18px;border:1px solid var(--ui-line);border-radius:23px;background:linear-gradient(140deg,var(--ui-panel),var(--ui-panel));box-shadow:0 18px 50px var(--ui-shadow)}
      .dm-vault-modal header{display:flex;align-items:center;justify-content:space-between;gap:8px}.dm-vault-modal h3{margin:0;font-size:18px}.dm-vault-modal p{font-size:12px;line-height:1.45;color:var(--ui-ink)}
      .dm-vault-modal label{display:block;font-size:11px;color:var(--ui-muted);margin:12px 0}.dm-vault-modal input{display:block;width:100%;margin-top:5px;padding:11px;border:1px solid var(--ui-line);border-radius:11px;background:var(--ui-panel);color:var(--ui-ink);font-size:14px}
      .dm-vault-modal footer{display:flex;gap:8px;margin-top:15px}.dm-vault-modal button{border:1px solid var(--ui-line);border-radius:11px;background:color-mix(in srgb, var(--ui-raised) 7%, transparent);color:var(--ui-ink);padding:9px 13px}.dm-vault-modal .accept{background:var(--ui-ok-bg);border-color:var(--ui-ok)}.dm-vault-modal .reject{background:var(--ui-danger-bg);border-color:var(--ui-danger)}.dm-vault-modal .warn{color:var(--ui-danger);font-size:10px}.dm-vault-modal .error{color:var(--ui-danger);font-size:11px}
    `;document.head.appendChild(folderStyle);
  }

  function installChatTools(chat) {
    if (!chat) return;
    syncDmCapturePreference(chat);
    if (chat.querySelector('[data-dm-tools]')) return;
    const style = document.createElement('style');
    style.textContent = ".dm-unread{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:var(--ui-danger-bg);color:var(--ui-ink);display:grid;place-items:center;font-size:9px;font-weight:900}.dm-selected{outline:2px solid var(--ui-line)!important}.dm-select-tools{display:flex;align-items:center;gap:7px;padding:7px 11px;border-bottom:1px solid var(--ui-line);background:var(--ui-panel)}.dm-select-tools[hidden]{display:none}.dm-select-tools button{border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-raised) 4%, transparent);color:var(--ui-ink);border-radius:10px;padding:6px 9px;font-size:9px}.dm-pinned{position:sticky;top:0;z-index:2;background:color-mix(in srgb, var(--ui-button) 9%, transparent);border:1px solid var(--ui-line);border-radius:10px;padding:7px 10px;font-size:9px;color:var(--ui-gold)}.dm-gift-sheet{position:fixed;inset:0;z-index:500;background:color-mix(in srgb, var(--ui-panel) 73%, transparent);display:flex;align-items:flex-end}.dm-gift-sheet>section{width:min(520px,100%);max-height:76vh;overflow:auto;background:var(--ui-panel);border:1px solid var(--ui-line);border-radius:24px 24px 0 0;padding:16px}.dm-gift-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.dm-gift-grid button{background:color-mix(in srgb, var(--ui-raised) 3%, transparent);color:var(--ui-ink);border:1px solid var(--ui-line);border-radius:14px;padding:10px;font-size:11px}.dm-gift-grid small{display:block;color:var(--ui-gold);margin-top:4px;font-size:9px}";
    document.head.appendChild(style);
    const mediaStyle=document.createElement('style');
    mediaStyle.textContent=`.dm-unread[hidden]{display:none!important}.bubble.dm-media-bubble,.bubble.me.dm-media-bubble{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;overflow:visible!important}.dm-image-message{margin-top:7px}.dm-photo-open{position:relative;display:block;max-width:100%;padding:0;border:0;background:transparent;color:var(--ui-ink);text-align:left}.dm-inline-photo{display:block;width:min(250px,68vw);max-height:320px;min-height:96px;object-fit:cover;border-radius:14px;background:var(--ui-panel)}.dm-media-loading{display:block;padding:8px 12px;color:var(--ui-ink);font-size:10px}.dm-temp-preview{position:relative;isolation:isolate;display:flex;align-items:center;gap:10px;overflow:hidden;width:min(250px,68vw);min-height:112px;padding:14px;border:1px solid var(--ui-line);border-radius:15px;background:linear-gradient(135deg,var(--ui-raised),var(--ui-raised) 55%,var(--ui-button));color:var(--ui-ink);text-align:left}.dm-temp-blur{position:absolute;z-index:-1;inset:-12px;background:radial-gradient(ellipse at 22% 28%,color-mix(in srgb, var(--ui-danger-bg) 66%, transparent) 0 13%,transparent 46%),radial-gradient(ellipse at 76% 74%,color-mix(in srgb, var(--ui-button) 65%, transparent) 0 18%,transparent 52%),linear-gradient(130deg,var(--ui-panel),var(--ui-danger-bg));filter:blur(15px);transform:scale(1.12)}.dm-temp-lock{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:1px solid var(--ui-line);border-radius:50%;background:color-mix(in srgb, var(--ui-panel) 43%, transparent);font-size:17px}.dm-temp-label,.dm-temp-preview>span:last-child{display:grid;gap:4px}.dm-temp-preview b{font-size:12px}.dm-temp-preview small{font-size:10px;color:var(--ui-muted)}.dm-temp-preview.expired{min-height:74px;background:var(--ui-raised);color:var(--ui-ink)}.dm-voice-player{display:flex;align-items:center;gap:10px;width:min(285px,72vw);margin-top:6px;padding:9px 11px;border:1px solid var(--ui-line);border-radius:18px;background:linear-gradient(135deg,var(--ui-panel),var(--ui-panel))}.dm-voice-toggle{flex:0 0 38px;width:38px;height:38px;border:0;border-radius:50%;background:linear-gradient(135deg,var(--ui-button),var(--ui-danger-bg));color:var(--ui-ink);font-size:15px}.dm-voice-main{position:relative;flex:1;min-width:0;padding-bottom:15px}.dm-wave{height:25px;display:flex;align-items:center;gap:2px;overflow:hidden}.dm-wave i{flex:1;min-width:2px;height:var(--h);border-radius:3px;background:color-mix(in srgb, var(--ui-panel) 55%, transparent)}.dm-voice-progress{position:absolute;inset:0 0 14px;width:100%;height:26px;margin:0;opacity:0;cursor:pointer}.dm-voice-time{position:absolute;bottom:0;left:0;color:var(--ui-ink);font-size:9px}.dm-photo-viewer{position:fixed;inset:0;z-index:20000;background:color-mix(in srgb, var(--ui-panel) 96%, transparent);display:grid;place-items:center;padding:16px}.dm-photo-viewer-head{position:absolute;top:max(12px,env(safe-area-inset-top));left:14px;right:14px;display:flex;align-items:center;justify-content:space-between;color:var(--ui-ink);font-size:13px}.dm-photo-viewer-head button{border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-raised) 7%, transparent);color:var(--ui-ink);border-radius:14px;width:42px;height:42px;font-size:22px}.dm-photo-viewer img{display:block;max-width:100%;max-height:82vh;object-fit:contain;border-radius:14px}.dm-photo-viewer>small{position:absolute;bottom:max(18px,env(safe-area-inset-bottom));color:var(--ui-muted);font-size:12px}.dm-photo-viewer.capture-hidden img{filter:blur(24px);visibility:hidden}.dm-gift-sheet button:not(.close){min-height:44px;border:1px solid var(--ui-line);border-radius:14px;background:linear-gradient(145deg,var(--ui-raised),var(--ui-raised));color:var(--ui-ink);font-size:12px;font-weight:650;box-shadow:0 5px 18px var(--ui-shadow);transition:transform .15s,border-color .15s}.dm-gift-sheet button:not(.close):active{transform:scale(.97)}.dm-gift-sheet [data-temp][aria-pressed=true]{border-color:var(--ui-line);background:linear-gradient(135deg,var(--ui-button),var(--ui-button));color:var(--ui-ink);box-shadow:0 0 0 2px var(--ui-shadow)}.dm-gift-sheet .close{border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-panel) 4%, transparent);color:var(--ui-ink);border-radius:13px;width:42px;height:42px;font-size:21px}.dm-gift-sheet p{font-size:11px!important}.compose button.close[data-dm-photo],.compose button.close[data-dm-voice],.compose button.close[data-dm-gift]{width:46px;height:46px;flex:0 0 46px;border:1px solid var(--ui-line);border-radius:15px;background:linear-gradient(145deg,var(--ui-raised),var(--ui-raised));color:var(--ui-ink);font-size:18px;box-shadow:0 5px 15px var(--ui-shadow)}.compose button.close[data-dm-photo]:active,.compose button.close[data-dm-voice]:active,.compose button.close[data-dm-gift]:active{transform:scale(.96)}.compose button.close[data-dm-voice][aria-pressed="true"]{background:linear-gradient(135deg,var(--ui-danger-bg),var(--ui-danger-bg));box-shadow:0 0 0 3px var(--ui-shadow)}`;
    mediaStyle.textContent += `.dm-voice-player{position:relative;flex-wrap:wrap}.dm-voice-controls{display:flex;align-items:center;justify-content:flex-end;gap:6px;width:100%;border-top:1px solid var(--ui-line);padding-top:5px}.dm-voice-controls>div{display:flex;gap:5px}.dm-voice-controls button{min-width:38px;min-height:36px;padding:3px 7px;border:1px solid var(--ui-line);border-radius:10px;background:var(--ui-raised);color:var(--ui-ink);font-size:11px;touch-action:manipulation}.dm-voice-controls button:disabled{opacity:.4}.dm-voice-controls button:focus-visible,.dm-voice-toggle:focus-visible{outline:2px solid var(--ui-gold);outline-offset:2px}.dm-voice-status{width:100%;color:var(--ui-ink);font-size:10px;overflow-wrap:anywhere}.dm-voice-status:empty{display:none}`;
    mediaStyle.textContent += ".dm-temp-preview img.dm-temp-blur{inset:-12px;width:calc(100% + 24px);height:calc(100% + 24px);object-fit:cover;opacity:.86;filter:blur(13px)}.dm-temp-status{position:absolute;inset:0;pointer-events:none}.dm-voice-player .dm-wave{background:linear-gradient(90deg,var(--ui-button) var(--played,0%),transparent var(--played,0%))}.dm-track{height:3px;margin-top:3px;border-radius:9px;background:color-mix(in srgb, var(--ui-panel) 14%, transparent);overflow:hidden}.dm-track i{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--ui-button),var(--ui-danger-bg))}.dm-voice-player input:focus-visible{opacity:.25;outline:2px solid var(--ui-line)}";
    mediaStyle.textContent += '.dm-inline-photo{width:min(150px,42vw);max-height:160px;min-height:55px}.dm-temp-preview{width:min(180px,50vw);min-height:80px}.dm-voice-player{width:min(218px,60vw);padding:6px 8px;gap:7px}.dm-voice-toggle{width:31px;height:31px;flex-basis:31px}.dm-wave{height:17px}.dm-story-reply .dm-image-message{margin:0 0 5px}.dm-story-reply .dm-inline-photo{opacity:.62;width:min(142px,42vw);max-height:148px}.dm-story-reply .dm-message-text{font-size:12px;padding:4px 8px}.dm-story-reply .dm-photo-open{cursor:zoom-in}';
    document.head.appendChild(mediaStyle);
    installFolderStyles();
    selectionBar = document.createElement('div'); selectionBar.className = 'dm-select-tools'; selectionBar.dataset.dmTools = ''; selectionBar.hidden = true;
    selectionBar.innerHTML = "<button type=\"button\" data-all-selected aria-label=\"Tümünü seç\" title=\"Tümünü seç\">□</button><button type=\"button\" data-reply-selected disabled>Yanıtla</button><button type=\"button\" data-edit-selected disabled>Düzenle</button><button type=\"button\" data-react-selected disabled>Tepki</button><button type=\"button\" data-forward-selected disabled>İlet</button><button type=\"button\" data-star-selected disabled title=\"Sadece sana görünür\">Yıldızla</button><button type=\"button\" data-info-selected disabled aria-label=\"Mesaj bilgisi\" title=\"Mesaj bilgisi\">ⓘ</button><span data-selected-count style=\"font-size:10px;color:var(--ui-ink)\"></span><button type=\"button\" data-pin-selected aria-label=\"Sabitle\" title=\"Sabitle\">📌</button><button type=\"button\" data-delete-selected aria-label=\"Seçilenleri sil\" title=\"Seçilenleri sil\">Sil</button><button type=\"button\" data-clear-selected aria-label=\"Seçimi kapat\" title=\"Seçimi kapat\">×</button>";
    const body = chat.querySelector('.chatBody'); chat.querySelector('.chatHead')?.append(selectionBar);
    selectionBar.querySelector('[data-clear-selected]').onclick = () => { selectedMessages.forEach(row => row.classList.remove('dm-selected')); selectedMessages.clear();allMessagesSelected=false; messageSelectionMode=false;refreshSelectionBar(); };
    selectionBar.querySelector('[data-all-selected]').onclick = () => { const rows=[...body.querySelectorAll('.bubble[data-message-id]')];allMessagesSelected=!allMessagesSelected;selectedMessages.clear();rows.forEach(row=>{row.classList.toggle('dm-selected',allMessagesSelected);if(allMessagesSelected)selectedMessages.add(row)});refreshSelectionBar() };
    selectionBar.querySelector('[data-delete-selected]').onclick = async () => {
      if(!selectedMessages.size&&!allMessagesSelected)return;
      const scope=await dmDeleteScope();
      if(!scope)return;
      const approved=await dmConfirm(scope==='everyone'?(String(activeConversationId||'').startsWith('grp_')?'Seçilen mesajlar herkes için silinsin mi?':'Bu mesajı iki taraf için de silmek istediğinize emin misiniz?'):'Bu mesajı kendiniz için silmek istediğinize emin misiniz?');
      if(!approved)return;
      try { await api().api('/messages/'+encodeURIComponent(activeConversationId)+'/delete',{method:'POST',body:JSON.stringify({message_ids:[...selectedMessages].map(row=>Number(row.dataset.messageId)),all:allMessagesSelected,scope})}); if(allMessagesSelected){releaseMediaUrls(body);body.replaceChildren()}else [...selectedMessages].forEach(row => {releaseMediaUrls(row);row.remove()}); invalidateQuotedMessages([...selectedMessages].map(row=>Number(row.dataset.messageId)));selectedMessages.clear();allMessagesSelected=false;refreshSelectionBar(); }
      catch (e) { window.toast?.(e.message || 'Mesajlar silinemedi.'); }
    };
    selectionBar.querySelector('[data-pin-selected]').onclick = () => {if(selectedMessages.size===1)changeMessagePin([...selectedMessages][0]._message)};
    selectionBar.querySelector('[data-star-selected]').onclick=()=>{if(selectedMessages.size===1)setMessageStar([...selectedMessages][0])};
    selectionBar.querySelector('[data-info-selected]').onclick=openMessageInfo;
    selectionBar.querySelector('[data-react-selected]').onclick=openReactionPicker;
    selectionBar.querySelector('[data-forward-selected]').onclick=openForwardPicker;
    selectionBar.querySelector('[data-reply-selected]').onclick=()=>startMessageMode('reply');
    selectionBar.querySelector('[data-edit-selected]').onclick=()=>startMessageMode('edit');
    let holdTimer = null, suppressNextClick = false, lastLongPressRow = null,holdX=0,holdY=0;
    const clearHold = () => { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; };
    body?.addEventListener('pointerdown', event => {
      if(messageSelectionMode)return;
      const row = event.target.closest('.bubble[data-message-id]');
      if (!row || (event.button !== undefined && event.button !== 0)) return;
      clearHold(); suppressNextClick = false; lastLongPressRow = row;holdX=event.clientX;holdY=event.clientY;
      holdTimer = setTimeout(() => { suppressNextClick = true; setSelected(row); }, 520);
    }, {passive:true});
    body?.addEventListener('pointermove',event=>{if(Math.abs(event.clientX-holdX)>12||Math.abs(event.clientY-holdY)>12)clearHold()},{passive:true});
    body?.addEventListener('pointerup', clearHold);
    body?.addEventListener('pointercancel', clearHold);
    body?.addEventListener('pointerleave', clearHold);
    body?.addEventListener('contextmenu', event => {
      const row = event.target.closest('.bubble[data-message-id]');
      if (!row) return;
      event.preventDefault();
      clearTimeout(holdTimer);
      if (messageSelectionMode || row.classList.contains('dm-selected')) return;
      setSelected(row);
    });
    body?.addEventListener('click', event => {
      const row = event.target.closest('.bubble[data-message-id]');
      if (suppressNextClick && row === lastLongPressRow) { suppressNextClick = false; event.preventDefault();event.stopImmediatePropagation(); return; }
      if (messageSelectionMode && row) { event.preventDefault();event.stopImmediatePropagation();setSelected(row); }
    },true);
    installMessageWorkbench(chat);
    syncChatCompose(chat);
  }

  function syncChatCompose(chat) {
    const compose = chat.querySelector('.compose');
    const chatName=String(chat.querySelector('.chatHead b')?.textContent||'');
    const familyChat=/ aile sohbeti$/i.test(chatName), systemChat=isSystemConversation();
    const poll=chat.querySelector('[data-create-poll]');if(poll){poll.hidden=!['group','family'].includes(chat.dataset.conversationType);poll.disabled=chat.dataset.groupWriteBlocked==='1'}
    if(compose&&systemChat){compose.style.display='none';}
    else if(compose){compose.style.display='';}
    if (compose && !familyChat && !systemChat && !compose.querySelector('[data-dm-gift]')) { const button = document.createElement('button'); button.type='button'; button.dataset.dmGift=''; button.className='close'; button.innerHTML=dmIcon('gift'); button.title='Hediye gönder';button.setAttribute('aria-label','Hediye gönder'); compose.insertBefore(button,compose.firstChild); button.onclick=()=>openGiftSheet(); }
    if (compose && !systemChat && !compose.querySelector('[data-dm-photo]')) {const b=document.createElement('button');b.type='button';b.dataset.dmPhoto='';b.className='close';b.innerHTML=dmIcon('camera');b.title='Fotoğraf, video veya belge gönder';b.setAttribute('aria-label',b.title);compose.insertBefore(b,compose.firstChild);b.onclick=openPhotoChooser;}
    if (compose && !systemChat && !compose.querySelector('[data-dm-voice]')) {const b=document.createElement('button');b.type='button';b.dataset.dmVoice='';b.className='close';b.innerHTML=dmIcon('mic');b.title='Ses kaydet';b.setAttribute('aria-label','Ses kaydet');compose.insertBefore(b,compose.firstChild);b.onclick=()=>toggleVoiceRecording(b);}
  }

  async function requiredGift(cid,uid){
    document.getElementById('eris-required-gift')?.remove();
    if(!uid)return;
    const r=await api().api('/users/'+encodeURIComponent(uid)+'/message-restriction');
    if(String(activeConversationId)!==String(cid)||!r.enabled||r.unlocked||!r.gift_key)return;
    const catalog=await api().messageGifts();
    if(String(activeConversationId)!==String(cid))return;
    const g=catalog.find(x=>x.gift_key===r.gift_key);
    const compose=document.querySelector('#chat .compose');if(!compose)return;
    const panel=document.createElement('div');panel.id='eris-required-gift';
    panel.style.cssText='padding:14px;border:1px solid var(--ui-line);border-radius:18px;background:var(--ui-panel);color:var(--ui-ink);display:grid;gap:10px;text-align:center;margin:8px 0';
    const title=document.createElement('b');title.textContent='Bu kişi mesaj için hediye kısıtlaması koymuştur';
    const line=document.createElement('div');line.style.cssText='display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap';
    if(g?.image_url){const img=document.createElement('img');img.src=window.ErisGiftArt?.url(g.id||g.gift_key,g.image_url)||g.image_url;img.alt='';img.style.cssText='width:52px;height:52px;object-fit:contain';line.append(img)}
    const name=document.createElement('b');name.textContent=g?.name||r.gift_key;
    const price=document.createElement('span');price.textContent=Number(r.gift_price||g?.unit_price||0).toLocaleString('tr-TR')+' 🪙';line.append(name,price);
    const btn=document.createElement('button');btn.type='button';btn.textContent='Gönder';btn.className='primary';
    btn.onclick=async()=>{if(btn.disabled||String(activeConversationId)!==String(cid))return;btn.disabled=true;
      try{const m=await api().sendMessageGift(cid,r.gift_key,1);
        const body=document.querySelector('#chat .chatBody');if(body&&String(activeConversationId)===String(cid))appendMessageOnce(body,m,true);
        panel.remove();window.dispatchEvent(new Event('erischat:gift-updated'));await loadConversations();
        window.toast?.('Hediye gönderildi. Mesajlaşma açıldı.');
      }catch(e){btn.disabled=false;window.toast?.(e.message||'Hediye gönderilemedi.')}};
    panel.append(title,line,btn);compose.before(panel);
  }
  let sendingGift=false;
  async function openGiftSheet() {
    if (!activeConversationId || !api()?.messageGifts) return;
    const modal = document.createElement('div'); modal.className='dm-gift-sheet'; modal.innerHTML='<section><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><b>Hediye seç</b><button class="close" data-close>×</button></div><div class="dm-gift-grid">Yükleniyor…</div></section>'; document.body.appendChild(modal);
    const giftStyle=document.createElement('style');giftStyle.textContent=".dm-gift-controls{display:grid;gap:8px;margin:8px 0}.dm-gift-categories,.dm-gift-quantities{display:flex;gap:5px;overflow:auto}.dm-gift-controls button{white-space:nowrap;padding:8px;font-size:11px}.dm-gift-controls button.active{border-color:var(--ui-line);background:var(--ui-button)}.dm-gift-grid button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}.dm-gift-art{width:82px;height:82px;object-fit:contain}.dm-gift-price{font-size:10px}.dm-gift-price .eris-lidya-coin{width:12px!important;height:12px!important;vertical-align:-2px!important}";modal.append(giftStyle);
    modal.querySelector('[data-close]').onclick=()=>modal.remove(); modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
    try {
      const gifts=await api().messageGifts(),grid=modal.querySelector('.dm-gift-grid');
      const categories=[['all','Tümü',0,Infinity],['agora','Agora & Halk Pazarı',1,29],['sofra','Antik Sofra & Bağlar',30,99],['zanaat','Zanaat & Atölye',100,499],['muhafiz','Saray Muhafızları',500,999],['tuccar','Sardis Tüccarları',1000,9999],['krallik','Krallık Hazinesi',10000,19999],['ihtisam','Antik İhtişam',20000,49999],['mitoloji','Mitoloji & Tanrılar',50000,89999],['krezus','Krezus’un Mirası',90000,Infinity]];
      let category='all',quantity=1;
      const controls=document.createElement('div');controls.className='dm-gift-controls';
      const tabs=document.createElement('div');tabs.className='dm-gift-categories';
      const qty=document.createElement('div');qty.className='dm-gift-quantities';
      controls.append(tabs,qty);grid.before(controls);
      function draw(){
        tabs.replaceChildren();for(const [key,label,min,max] of categories){
          const count=key==='all'?gifts.length:gifts.filter(g=>Number(g.unit_price)>=min&&Number(g.unit_price)<=max).length;
          const button=document.createElement('button');button.type='button';button.textContent=label+' ('+count+')';button.className=category===key?'active':'';
          button.onclick=()=>{category=key;draw()};tabs.append(button);
        }
        qty.replaceChildren();for(const n of [1,3,5,9,49,99]){
          const button=document.createElement('button');button.type='button';button.textContent='×'+n;button.className=quantity===n?'active':'';
          button.onclick=()=>{quantity=n;draw()};qty.append(button);
        }
        grid.replaceChildren();grid.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
        const selected=categories.find(x=>x[0]===category);
        for(const g of gifts.filter(g=>category==='all'||Number(g.unit_price)>=selected[2]&&Number(g.unit_price)<=selected[3])){
          const button=document.createElement('button');button.type='button';button.title=g.name||g.gift_key;
          const image=document.createElement('img');image.src=window.ErisGiftArt?.url(g.id||g.gift_key,g.image_url)||g.image_url;image.alt='';image.loading='lazy';image.className='dm-gift-art';
          const price=document.createElement('small');price.className='dm-gift-price';price.textContent=Number(g.unit_price).toLocaleString('tr-TR')+' Lidya';
          button.append(image,price);
          button.onclick=async()=>{if(sendingGift)return;sendingGift=true;button.disabled=true;const conversation=activeConversationId,count=quantity;try{
            const message=await api().sendMessageGift(conversation,g.gift_key,count);
            const chatBody=document.querySelector('#chat .chatBody');if(conversation===activeConversationId&&chatBody)appendMessageOnce(chatBody,message,true);
            modal.remove();loadConversations();
            window.dispatchEvent(new CustomEvent('erischat:dm-gift',{detail:{...message,gift_key:g.gift_key,quantity:count,sender_name:'Sen'}}));
            window.dispatchEvent(new Event('erischat:gift-updated'));
          }catch(e){button.disabled=false;window.toast?.(e.message||'Hediye gönderilemedi.')}finally{sendingGift=false}};
          const cell=document.createElement('div');cell.className='gift-preview-cell';cell.append(button);const preview=document.createElement('button');preview.type='button';preview.className='gift-preview-button';preview.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';preview.setAttribute('aria-label',(g.name||g.gift_key)+' önizle');preview.title='Ücretsiz önizle';preview.onclick=()=>window.ErisGiftStage?.preview?.({gift_key:g.gift_key,quantity});cell.append(preview);grid.append(cell);
        }
      }
      draw();
    }
    catch(e){modal.querySelector('.dm-gift-grid').textContent=e.message||'Hediyeler yüklenemedi.';}
  }

  async function loadUserProfile(userId){
    const id=String(userId||'').trim(); if(!id||!api()?.api)return;
    if (window.openUserProfile) { window.openUserProfile(id); return; }
    document.getElementById('eris-dm-profile-modal')?.remove();
    const modal=document.createElement('div');modal.id='eris-dm-profile-modal';modal.style.cssText="position:fixed;inset:0;z-index:400;background:var(--ui-overlay);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px";
    modal.innerHTML="<div style=\"width:min(420px,100%);max-height:80vh;overflow:auto;background:var(--ui-panel);border:1px solid var(--ui-line);border-radius:24px;padding:18px;color:var(--ui-ink)\"><div style=\"display:flex;justify-content:space-between;align-items:center\"><b>Kullanıcı profili</b><button id=\"erpClose\" class=\"close\">×</button></div><div id=\"erpBody\" style=\"margin-top:12px\">Yükleniyor…</div></div>";document.body.appendChild(modal);modal.querySelector('#erpClose').onclick=()=>modal.remove();
    try{const [u,f,g]=await Promise.all([api().api('/users/'+encodeURIComponent(id)),api().api('/users/'+encodeURIComponent(id)+'/fans').catch(()=>({level:0,total:0})),api().api('/users/'+encodeURIComponent(id)+'/profile-gifts').catch(()=>[])]);const body=modal.querySelector('#erpBody'),publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';body.innerHTML='<div class="card" style="padding:14px"><div style="font-size:20px">👤</div><b>'+escapeHtml(u.nickname||'Anonim kullanıcı')+"</b><small style=\"display:block;color:var(--ui-ink);margin-top:5px\">ID: "+escapeHtml(publicId)+"</small><small style=\"display:block;color:var(--ui-ink);margin-top:4px\">Fan seviyesi "+Number(f.level||0)+' • '+Number(f.total||0)+' fan • '+(Array.isArray(g)?g.length:0)+' profil hediyesi</small></div><div style="display:flex;gap:7px;margin-top:9px"><button id="erpMsg" class="primary" style="height:40px;flex:1">Mesaj gönder</button></div>';window.ErisRoleBadges?.bind(body.querySelector('.card b'),u);body.querySelector('#erpMsg').onclick=async()=>{modal.remove();try{await createConversation(u.id||id,u.nickname||'Anonim kullanıcı')}catch(e){window.toast?.(e.message||'Konuşma açılamadı.')}}}catch(e){modal.querySelector('#erpBody').textContent=e.message||'Kullanıcı bulunamadı.'}
  }
  function vaultForm(title,fields,note='',buttons=['Kabul et','İptal']){
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='dm-vault-modal';
      const section=document.createElement('section'),head=document.createElement('header'),heading=document.createElement('h3'),x=document.createElement('button'),form=document.createElement('form'),footer=document.createElement('footer'),error=document.createElement('p');
      heading.textContent=title;x.type='button';x.textContent='×';x.setAttribute('aria-label','Kapat');head.append(heading,x);section.append(head);
      const inputs={};for(const field of fields){const label=document.createElement('label'),input=document.createElement('input');label.textContent=field.label;input.name=field.name;input.type=field.type||'text';input.required=true;input.maxLength=field.max||100;if(field.pin){input.inputMode='numeric';input.pattern='[0-9]{6}';input.maxLength=6}label.append(input);form.append(label);inputs[field.name]=input}
      if(note){const info=document.createElement('p');info.className='warn';info.textContent=note;form.append(info)}
      error.className='error';error.hidden=true;form.append(error);
      const accept=document.createElement('button'),cancel=document.createElement('button');accept.type='submit';accept.className='accept';accept.textContent=buttons[0];cancel.type='button';cancel.className='reject';cancel.textContent=buttons[1];footer.append(accept,cancel);form.append(footer);section.append(form);modal.append(section);document.body.append(modal);
      const done=value=>{modal.remove();resolve(value)};x.onclick=()=>done(null);cancel.onclick=()=>{if(buttons[1]==='Bilgileri sıfırla'){form.reset();Object.values(inputs)[0]?.focus()}else done(buttons[1]==='Şifremi unuttum'?{recover:true}:null)};modal.onclick=e=>{if(e.target===modal)done(null)};
      form.onsubmit=e=>{e.preventDefault();const values={};for(const [name,input] of Object.entries(inputs))values[name]=input.value.trim();done(values)};
      setTimeout(()=>Object.values(inputs)[0]?.focus(),50);
    });
  }
  const pinField={name:'pin',label:'6 haneli şifre',type:'password',pin:true};
  const setupFields=[pinField,{name:'hint',label:'Şifre ipucu (en fazla 30 karakter)',max:30},{name:'answer',label:'İpucu cevabı (en fazla 100 karakter)',max:100}];
  const vaultNote='Kilitli sohbetlere erişmek için mesajlardaki Kullanıcı ID ara alanına 6 haneli şifrenizi yazın. Şifreyi unutursanız ipucu cevabınız istenir.';
  async function unlockFolder(pin){
    const entry=pin?{pin}:await vaultForm('Kilitli sohbetler',[pinField],'Şifrenizi unutursanız kurtarma seçeneğini kullanın.',['Kabul et','Şifremi unuttum']);
    if(entry?.recover)return recoverFolder();
    const value=entry?.pin;
    if(!value)return false;
    const result=await api().api('/me/dm-vault/unlock',{method:'POST',body:JSON.stringify({pin:value})});
    vaultToken=result.token;window.ErisChatDMVaultToken=vaultToken;return true;
  }
  async function recoverFolder(){
    const info=await api().api('/me/dm-vault/recover');
    let result,remaining=info.attempts_left;
    while(!result){
      const answer=await vaultForm('Şifremi unuttum',[{name:'answer',label:'İpucu: '+info.hint,max:100}],`${remaining} deneme hakkınız kaldı. Beş yanlış cevapta kilitli mesajlarınız imha edilir.`,['Kabul et','Geri']);
      if(!answer)return false;
      try{result=await api().api('/me/dm-vault/recover',{method:'POST',body:JSON.stringify(answer)})}
      catch(e){window.toast?.(e.message);if(/imha edilmiştir/i.test(e.message)){inboxFolder='inbox';await loadConversations();return false}remaining=(await api().api('/me/dm-vault/recover')).attempts_left}
    }
    const next=await vaultForm('Yeni kilitli sohbet şifresi',setupFields,vaultNote);
    if(!next)return false;
    window.ErisChatDMVaultToken=result.recovery_token;
    const changed=await api().api('/me/dm-vault',{method:'PUT',body:JSON.stringify(next)});
    vaultToken=changed.token;window.ErisChatDMVaultToken=vaultToken;window.toast?.('Şifreniz değişmiştir.');return true;
  }
  async function enterLockedFolder(pin){
    try{
      if(!await unlockFolder(pin))return;
      inboxFolder='locked';selectedConversations.clear();await loadConversations();
    }catch(e){window.toast?.(e.message||'Kilitli sohbetlere girilemedi.')}
  }
  async function changeVault(){
    try{
      const info=await api().api('/me/dm-vault/recover');
      const old=await vaultForm('Kilitli sohbet şifresini değiştir',[{...pinField,name:'old_pin',label:'Mevcut 6 haneli şifre'},{name:'old_answer',label:'Mevcut ipucu: '+info.hint+' · cevabı',max:100}]);
      if(!old)return;
      await unlockFolder(old.old_pin);
      const next=await vaultForm('Yeni şifre ve ipucu',setupFields,vaultNote);
      if(!next)return;
      const result=await api().api('/me/dm-vault',{method:'PUT',body:JSON.stringify({...old,...next})});
      vaultToken=result.token;window.ErisChatDMVaultToken=vaultToken;window.toast?.('Şifreniz değişmiştir.');
    }catch(e){window.toast?.(e.message||'Şifre değiştirilemedi.')}
  }
  async function moveSelected(kind){
    const ids=[...selectedConversations];if(!ids.length)return;
    try{
      if(kind==='locked'&&inboxFolder!=='locked'){
        const status=await api().api('/me/dm-vault');
        if(!status.configured){const setup=await vaultForm('Kilitli sohbet şifresi oluştur',setupFields,vaultNote,['Kabul et','Bilgileri sıfırla']);if(!setup)return;const result=await api().api('/me/dm-vault/setup',{method:'POST',body:JSON.stringify(setup)});vaultToken=result.token;window.ErisChatDMVaultToken=vaultToken}
        else if(!await unlockFolder())return;
      }
      let removalPin=null;
      if(kind==='locked'&&inboxFolder==='locked'){
        const answer=await vaultForm('Sohbet kilidini kaldır',[pinField],'Bu işlem için mevcut şifrenizi yeniden girin.');
        if(!answer)return;
        removalPin=answer.pin;
      }
      for(const id of ids)await api().api('/conversations/'+encodeURIComponent(id)+'/folder',{method:'PATCH',body:JSON.stringify(kind==='locked'?{locked:inboxFolder!=='locked',...(removalPin?{pin:removalPin}:{})}:{archived:inboxFolder!=='archive'})});
      selectedConversations.clear();await loadConversations();
      window.toast?.(kind==='locked'?'Kilitli sohbetler güncellendi.':'Arşiv güncellendi.');
    }catch(e){window.toast?.(e.message||'Sohbet taşınamadı.');await loadConversations()}
  }
  function installFolderControls(root){
    if(root.querySelector('.dm-inbox-nav'))return;
    const nav=document.createElement('div');nav.className='dm-inbox-nav';nav.innerHTML='<button type="button" data-back hidden>← Geri</button><button type="button" data-change hidden>🔒✎</button>';
    const tools=document.createElement('div');tools.className='dm-list-tools';tools.hidden=true;tools.innerHTML='<button type="button" data-select-all aria-label="Görünen sohbetleri seç" title="Görünen sohbetleri seç">□</button><small data-count></small><button type="button" data-notify-selected>Bildirimler</button><button type="button" data-move>✉ Arşiv</button><button type="button" data-lock>🔒 Kilitle</button><button type="button" data-delete aria-label="Seçilen sohbetlerin mesajlarını sil">Sil</button><button type="button" data-cancel>×</button>';
    root.querySelector('[data-dm-search]')?.after(nav,tools);
    nav.querySelector('[data-back]').onclick=()=>{inboxFolder='inbox';selectedConversations.clear();vaultToken='';window.ErisChatDMVaultToken='';loadConversations()};
    nav.querySelector('[data-change]').onclick=changeVault;
    tools.querySelector('[data-notify-selected]').onclick=()=>{if(selectedConversations.size===1)openNotificationSettings([...selectedConversations][0])};
    tools.querySelector('[data-move]').onclick=()=>moveSelected('archive');tools.querySelector('[data-lock]').onclick=()=>moveSelected('locked');tools.querySelector('[data-cancel]').onclick=()=>{selectedConversations.clear();loadConversations()};
    tools.querySelector('[data-select-all]').onclick=()=>{const rows=[...root.querySelectorAll('.list .item[data-conversation-id]')];const all=rows.length>0&&rows.every(row=>selectedConversations.has(row.dataset.conversationId));rows.forEach(row=>{if(all)selectedConversations.delete(row.dataset.conversationId);else selectedConversations.add(row.dataset.conversationId);row.classList.toggle('dm-list-selected',!all)});renderFolderControls(root)};
    tools.querySelector('[data-delete]').onclick=async()=>{const ids=[...selectedConversations];if(!ids.length)return;const scope=await dmDeleteScope();if(!scope)return;if(!await dmConfirm(scope==='everyone'?'Bu mesajı iki taraf için de silmek istediğinize emin misiniz?':'Bu mesajı kendiniz için silmek istediğinize emin misiniz?'))return;try{for(const id of ids)await api().api('/messages/'+encodeURIComponent(id)+'/delete',{method:'POST',body:JSON.stringify({all:true,scope})});selectedConversations.clear();if(ids.includes(String(activeConversationId))){activeConversationId=null;chatRevision++;releaseMediaUrls($('chat'));document.getElementById('chat')?.classList.remove('show');document.getElementById('eris-required-gift')?.remove()}await loadConversations();window.toast?.('Sohbetler silindi.')}catch(e){window.toast?.(e.message||'Mesajlar silinemedi.')}};
  }
  function renderFolderControls(root){
    const nav=root.querySelector('.dm-inbox-nav'),tools=root.querySelector('.dm-list-tools');if(!nav||!tools)return;
    nav.querySelector('[data-back]').hidden=inboxFolder==='inbox';nav.querySelector('[data-change]').hidden=inboxFolder!=='locked';nav.hidden=inboxFolder==='inbox';
    tools.querySelector('[data-notify-selected]').disabled=selectedConversations.size!==1;
    tools.hidden=!selectedConversations.size;tools.querySelector('[data-count]').textContent=selectedConversations.size+' sohbet seçildi';
    const rows=[...root.querySelectorAll('.list .item[data-conversation-id]')];const all=rows.length>0&&rows.every(row=>selectedConversations.has(row.dataset.conversationId));tools.querySelector('[data-select-all]').textContent=all?'☑':'□';tools.querySelector('[data-select-all]').setAttribute('aria-pressed',String(all));
    tools.querySelector('[data-move]').textContent=inboxFolder==='archive'?'✉ Arşivden çıkar':'✉ Arşivle';tools.querySelector('[data-move]').hidden=inboxFolder==='locked';
    tools.querySelector('[data-lock]').textContent=inboxFolder==='locked'?'🔓 Kilidi kaldır':'🔒 Kilitle';
  }
  function installGroupCreation(root){
    if(root.querySelector('[data-group-create]'))return;
    const title=root.querySelector('.title');if(!title)return;
    if(!document.getElementById('lidya-group-styles')){
      const style=document.createElement('style');style.id='lidya-group-styles';style.textContent=`
      .lidya-group-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;clear:both;margin:12px 0}
      .lidya-group-actions button{width:100%;min-width:0;min-height:46px;padding:10px 6px;border-radius:15px;border:1px solid #b78b46;background:linear-gradient(135deg,#ac7a36,#e9c67c);color:#241605;font-size:clamp(13px,3.5vw,17px);font-weight:750;box-shadow:0 2px 6px #0002}
      .lidya-group-actions button:active{transform:scale(.98)}
      .lidya-group-modal{position:fixed;inset:0;z-index:100050;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px}
      .lidya-group-card{position:relative;width:min(440px,100%);max-height:90dvh;overflow:auto;box-sizing:border-box;background:var(--ui-panel,var(--panel,#fffaf0));color:var(--ui-ink,var(--ink,#30271c));border:2px solid #c69c59;border-radius:22px;padding:22px;box-shadow:0 20px 70px #0007}
      .lidya-group-card input:not([type=file]),.lidya-group-card textarea{display:block;width:100%;box-sizing:border-box;margin:7px 0 14px;padding:12px;border-radius:10px;border:1px solid #bba782;background:var(--ui-panel,#fff);color:var(--ui-ink,#241605);font:inherit}
      .lidya-group-card select{width:100%;box-sizing:border-box;border:1px solid #bba782;border-radius:10px;padding:12px;background:var(--ui-panel,#fff);color:var(--ui-ink,#241605);font:inherit}.lidya-group-manager{padding:0}.lidya-group-manager .lidya-group-card{width:100%;height:100dvh;max-height:100dvh;max-width:720px;border-radius:0;padding:20px 18px calc(24px + env(safe-area-inset-bottom));overscroll-behavior:contain}.group-manager-head{display:flex;justify-content:space-between;gap:12px}.group-manager-head h3{margin:6px 0;font-size:24px;overflow-wrap:anywhere}.group-manager-head small{font-size:10px;letter-spacing:2px;color:var(--ui-gold,#a67c38)}.group-manager-head button{align-self:start;min-width:44px;min-height:44px;background:transparent;border:1px solid #b78b4670;border-radius:50%;font-size:24px;color:inherit}.group-member-row{padding:16px 0;border-bottom:1px solid #b78b4650;overflow-wrap:anywhere}.group-member-row>small{display:block;margin-top:5px;opacity:.75}.group-member-row>button{margin-top:10px;padding:10px;border-radius:10px}.lidya-group-actions .group-danger{background:var(--ui-panel,#fffaf0);color:var(--ui-danger,#b43535);border-color:currentColor}.group-image-form{margin-top:24px;padding-top:16px;border-top:1px solid #b78b4650}.group-message-sender{display:block;font-size:11px;color:var(--ui-gold,#aa7d32);margin:0 0 5px}.lidya-group-manager [data-status]{position:sticky;bottom:0;background:var(--ui-panel,#fffaf0);padding:8px;border-radius:8px}.lidya-group-manager [data-description]{white-space:pre-wrap;overflow-wrap:anywhere}.lidya-group-card label{display:block;margin:12px 0 4px}.lidya-group-card input[type=file]{max-width:100%;font-size:12px}
      .lidya-group-card .group-submit{width:100%;padding:14px;border:0;border-radius:12px;background:linear-gradient(130deg,#ae7b36,#f0cf87);color:#281900;font-weight:800}
      .lidya-invite-row{display:grid;grid-template-columns:54px minmax(0,1fr) 42px 42px;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #c69c5966}
      .lidya-invite-photo{width:52px;height:52px;border-radius:50%;object-fit:cover;border:1px solid #c69c59}.lidya-invite-name{overflow-wrap:anywhere;font-weight:700}
      .lidya-invite-row button{width:40px;height:40px;border:0;border-radius:12px;color:white;font-size:23px;font-weight:800}
      .lidya-invite-accept{background:#168342}.lidya-invite-reject{background:#bb3030}
      `;document.head.appendChild(style);
    }
    const actions=document.createElement('div');actions.className='lidya-group-actions';
    const btn=document.createElement('button');btn.type='button';btn.dataset.groupCreate='';btn.textContent='✦ Grup Kur';
    const invites=document.createElement('button');invites.type='button';invites.dataset.groupInvites='';invites.textContent='✉ Davetler';invites.onclick=checkGroupInvites;
    actions.append(btn,invites);title.appendChild(actions);
    btn.onclick=()=>{
      const overlay=document.createElement('div');overlay.className='lidya-group-modal';
      const card=document.createElement('form');card.className='lidya-group-card';
      card.innerHTML='<button type="button" data-close style="position:absolute;right:12px;top:9px;border:0;background:transparent;color:inherit;font-size:24px">×</button><h3 style="margin:0 0 16px">Lidya Mesaj Grubu</h3><div style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><img data-preview alt="Grup fotoğrafı" style="width:68px;height:68px;object-fit:cover;border-radius:50%;border:2px solid #c69c59" hidden><span data-empty style="width:68px;height:68px;border:2px solid #c69c59;border-radius:50%;display:grid;place-items:center">👥</span><label style="flex:1;min-width:0">Grup fotoğrafı seç<small style="display:block;font-size:12px;opacity:.75">En fazla 20 MB</small><input type="file" name="image" accept="image/*"></label></div><label>Grup adı<input name="name" required minlength="2" maxlength="64"></label><label>Grup açıklaması<textarea name="description" maxlength="500" rows="3"></textarea></label><button type="submit" class="group-submit">Grubu oluştur · 1.000 🪙 Lidya</button><small>Grup oluşturulduktan sonra üyeleri kullanıcı ID ile ekleyebilirsiniz.</small>';
      overlay.appendChild(card);document.body.appendChild(overlay);
      const close=()=>{if(card.querySelector('[name=image]')._preview)URL.revokeObjectURL(card.querySelector('[name=image]')._preview);overlay.remove()};
      card.querySelector('[data-close]').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
      const file=card.querySelector('[name=image]');file.onchange=()=>{const img=card.querySelector('[data-preview]');if(file._preview)URL.revokeObjectURL(file._preview);if(file.files[0]){file._preview=URL.createObjectURL(file.files[0]);img.src=file._preview;img.hidden=false;card.querySelector('[data-empty]').hidden=true}};
      const requestKey=(window.crypto?.randomUUID?.()||'group_'+Date.now()+'_'+Math.random().toString(36).slice(2));
      card.onsubmit=async e=>{e.preventDefault();const submit=card.querySelector('[type=submit]');submit.disabled=true;
        try{
          const data=new FormData(card);data.set('request_key',requestKey);
          // LIDYACHAT_GROUP_CREATE_20MB_V1
          if(file.files[0]&&file.files[0].size>20_000_000)throw new Error('Grup fotoğrafı en fazla 20 MB olabilir.');
          await api().api('/message-groups',{method:'POST',body:data,timeout:120000});
          close();await loadConversations();window.toast?.('Grup kuruldu. Üye eklemek için grup sohbetini açın.');
        }catch(err){window.toast?.(err.message||'Grup kurulamadı. Bağlantınızı kontrol edip yeniden deneyin.');}
        finally{submit.disabled=false}
      };
    };
  }
  async function openGroupManagement(id){
    if(document.querySelector('[data-group-menu]'))return;
    const overlay=document.createElement('div');overlay.className='lidya-group-modal lidya-group-manager';overlay.dataset.groupMenu='';
    const card=document.createElement('section');card.className='lidya-group-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','Grup yönetimi');
    card.innerHTML='<header class="group-manager-head"><div><small>GRUP YÖNETİMİ</small><h3 data-name>Yükleniyor…</h3></div><button type="button" data-close aria-label="Kapat">×</button></header><p data-description></p><div data-summary></div><nav data-actions class="lidya-group-actions" aria-label="Grup işlemleri"></nav><div data-content aria-live="polite"></div><p data-status role="status"></p>';
    const previous=document.activeElement;
    const close=()=>{overlay.remove();previous?.focus?.()};
    card.querySelector('[data-close]').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};
    overlay.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...card.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
    overlay.append(card);document.body.append(overlay);card.querySelector('[data-close]').focus();
    const content=card.querySelector('[data-content]'),status=card.querySelector('[data-status]'),endpoint='/message-groups/'+encodeURIComponent(id);
    let group,members,role,viewRevision=0;
    const run=async(button,action)=>{if(button.disabled)return;button.disabled=true;status.textContent='İşleniyor…';try{await action();if(overlay.isConnected)status.textContent='İşlem tamamlandı.'}catch(e){status.textContent=e.message||'İşlem tamamlanamadı.'}finally{button.disabled=false}};
    const request=(path,method='GET',body)=>api().api(endpoint+path,{method,headers:vaultToken?{'X-Eris-DM-Vault':vaultToken}:{},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
    const addButton=(parent,label,handler,danger=false)=>{const button=document.createElement('button');button.type='button';button.textContent=label;if(danger)button.classList.add('group-danger');button.onclick=()=>run(button,()=>handler(button));parent.append(button);return button};
    const refresh=async()=>{[group,members]=await Promise.all([request(''),request('/members')]);role=group.my_role;};
    const canManage=()=>['owner','moderator'].includes(role);
    const endChat=async()=>{close();if(String(activeConversationId)===String(id)){chatRevision++;activeConversationId=null;releaseMediaUrls($('chat'));$('chat')?.classList.remove('show')}await loadConversations()};
    const control=async(m,action,minutes=60)=>{await request('/members/'+encodeURIComponent(m.user_id)+'/control','POST',{action,minutes});await refresh();roster()};
    const roster=()=>{
      viewRevision++;content.replaceChildren();
      const search=document.createElement('input');search.placeholder='Üyelerde ad veya ID ara';search.setAttribute('aria-label','Üye ara');content.append(search);
      const list=document.createElement('div');content.append(list);
      const draw=()=>{list.replaceChildren();const q=search.value.toLocaleLowerCase('tr-TR');
        for(const m of members.filter(m=>(m.nickname+' '+m.public_id).toLocaleLowerCase('tr-TR').includes(q))){
          const row=document.createElement('article');row.className='group-member-row';
          const label=document.createElement('b');label.textContent=m.nickname;row.append(label);
          const meta=document.createElement('small');meta.textContent=({owner:'Kurucu',moderator:'Yönetici',member:'Üye'}[m.role]||'Üye')+' · ID '+m.public_id+(m.muted_until&&new Date(m.muted_until)>new Date()?' · Susturuldu':'');row.append(meta);
          const controls=document.createElement('div');controls.className='lidya-group-actions';
          if(!group.closed&&role==='owner'&&m.role!=='owner'){
            addButton(controls,m.role==='moderator'?'Yöneticiliği kaldır':'Yönetici yap',async()=>{await request('/members/'+encodeURIComponent(m.user_id)+'/role','PUT',{role:m.role==='moderator'?'member':'moderator'});await refresh();roster()});
            addButton(controls,'Sahipliği devret',async()=>{if(!await dmConfirm(m.nickname+' grubun yeni kurucusu olacak. Yönetim yetkilerinizi devretmek istiyor musunuz?'))return;await request('/transfer','POST',{user_id:m.user_id});await refresh();render()});
          }
          if(!group.closed&&(role==='owner'||role==='moderator'&&m.role==='member')&&String(m.user_id)!==String(currentUserId)&&m.role!=='owner'){
            addButton(controls,'Gruptan çıkar',async()=>{if(!await dmConfirm(m.nickname+' gruptan çıkarılsın mı?'))return;await request('/members/'+encodeURIComponent(m.user_id),'DELETE');await refresh();roster()},true);
            addButton(controls,'Yasakla',async()=>{if(await dmConfirm(m.nickname+' çıkarılacak ve yeniden katılması engellenecek. Onaylıyor musunuz?'))await control(m,'ban')},true);
            if(m.muted_until&&new Date(m.muted_until)>new Date())addButton(controls,'Susturmayı kaldır',()=>control(m,'unmute'));
            else {
              const select=document.createElement('select');select.setAttribute('aria-label',m.nickname+' susturma süresi');for(const [v,t] of [[15,'15 dakika'],[60,'1 saat'],[1440,'24 saat'],[10080,'7 gün']]){const opt=document.createElement('option');opt.value=v;opt.textContent=t;select.append(opt)}controls.append(select);
              addButton(controls,'Sustur',()=>control(m,'mute',Number(select.value)));
            }
          }
          if(controls.children.length)row.append(controls);list.append(row);
        }if(!list.children.length)list.textContent='Eşleşen üye yok.';
      };search.oninput=draw;draw();
    };
    const editInfo=()=>{
      viewRevision++;content.innerHTML='<form class="group-settings-form"><label>Grup adı<input name="name" minlength="2" maxlength="64" required></label><label>Açıklama<textarea name="description" maxlength="500" rows="4"></textarea></label><button class="group-submit">Bilgileri kaydet</button></form><form class="group-image-form"><label>Grup fotoğrafı · en fazla 20 MB<input name="image" type="file" accept="image/*" required></label><button class="group-submit">Fotoğrafı değiştir</button></form>';
      const form=content.querySelector('form');form.elements.name.value=group.name;form.elements.description.value=group.description||'';
      form.onsubmit=e=>{e.preventDefault();run(form.querySelector('button'),async()=>{await request('','PATCH',{name:form.elements.name.value.trim(),description:form.elements.description.value.trim()});await refresh();render();await loadConversations();if(String(activeConversationId)===String(id))$('chat').querySelector('.chatHead b').textContent=group.name})};
      const photo=content.querySelector('.group-image-form');photo.onsubmit=e=>{e.preventDefault();run(photo.querySelector('button'),async()=>{const file=photo.elements.image.files[0];if(!file)return;if(file.size>20000000)throw new Error('Fotoğraf en fazla 20 MB olabilir.');const data=new FormData();data.append('image',file);await request('/image','PUT',data);await refresh();render();await loadConversations();if(String(activeConversationId)===String(id))renderConversationAvatar($('chat').querySelector('.chatHead .ava'),{avatar_url:group.image_url},'👥')})};
      if(group.has_image)addButton(content,'Fotoğrafı kaldır',async()=>{if(!await dmConfirm('Grup fotoğrafı kaldırılsın mı?'))return;await request('/image','DELETE');await refresh();render();await loadConversations();if(String(activeConversationId)===String(id))renderConversationAvatar($('chat').querySelector('.chatHead .ava'),{},'👥')},true);
    };
    const permissions=()=>{
      viewRevision++;content.innerHTML='<form><label>Mesaj gönderme<select name="admins_only"><option value="false">Tüm üyeler</option><option value="true">Yalnızca yöneticiler</option></select></label><label>Üye davet etme<select name="members_can_invite"><option value="false">Yalnızca yöneticiler</option><option value="true">Tüm üyeler</option></select></label><label>Yöneticiler grup bilgilerini düzenleyebilir<select name="admins_edit_info"><option value="true">Evet</option><option value="false">Yalnızca kurucu</option></select></label><label>Yavaş mod<select name="slow_seconds"><option value="0">Kapalı</option><option value="10">10 saniye</option><option value="30">30 saniye</option><option value="60">1 dakika</option><option value="300">5 dakika</option><option value="3600">1 saat</option></select></label><p>Yavaş mod yöneticileri etkilemez. Susturulan üyeler metin, fotoğraf veya ses gönderemez.</p><button class="group-submit">İzinleri kaydet</button></form>';
      const form=content.querySelector('form');for(const k of ['admins_only','members_can_invite','admins_edit_info','slow_seconds']){if(k==='slow_seconds'&&![...form.elements[k].options].some(o=>o.value===String(group[k]))){const o=document.createElement('option');o.value=group[k];o.textContent=group[k]+' saniye';form.elements[k].append(o)}form.elements[k].value=String(group[k])}
      form.onsubmit=e=>{e.preventDefault();run(form.querySelector('button'),async()=>{await request('','PATCH',{admins_only:form.elements.admins_only.value==='true',members_can_invite:form.elements.members_can_invite.value==='true',admins_edit_info:form.elements.admins_edit_info.value==='true',slow_seconds:Number(form.elements.slow_seconds.value)});await refresh();render();await syncGroupState(id)})};
    };
    const invite=()=>{
      viewRevision++;content.innerHTML='<form><label>Kullanıcının görünen ID numarası<input name="user_id" required maxlength="64" autocomplete="off"></label><p>Davet edilen kişi onay verince gruba katılır. Grup kapasitesi 50 kişidir.</p><button class="group-submit">Davet gönder</button></form>';
      const form=content.querySelector('form');form.onsubmit=e=>{e.preventDefault();run(form.querySelector('button'),async()=>{await request('/invitations','POST',{user_id:form.elements.user_id.value.trim()});form.reset()})};
    };
    const remoteList=async(kind)=>{
      const revision=++viewRevision;content.textContent='Yükleniyor…';const rows=await request('/'+kind);if(!overlay.isConnected||revision!==viewRevision)return;content.replaceChildren();
      for(const m of rows){const row=document.createElement('div');row.className='group-member-row';const text=document.createElement('b');text.textContent=m.nickname;row.append(text);
        if(!group.closed)addButton(row,kind==='bans'?'Yasağı kaldır':'Daveti iptal et',async()=>{if(kind==='bans')await request('/members/'+encodeURIComponent(m.user_id)+'/control','POST',{action:'unban'});else await request('/invitations/'+encodeURIComponent(m.user_id),'DELETE');await remoteList(kind)});
        content.append(row);
      }if(!rows.length)content.textContent=kind==='bans'?'Yasaklı üye yok.':'Bekleyen davet yok.';
    };
    const log=async()=>{
      const revision=++viewRevision;content.textContent='Yükleniyor…';
      const labels={pin_message:'Mesaj sabitlendi',unpin_message:'Mesaj sabitlemesi kaldırıldı',settings:'Grup ayarları güncellendi',image:'Grup fotoğrafı değişti',remove_image:'Fotoğraf kaldırıldı',transfer:'Sahiplik devredildi',close:'Grup kapatıldı',invite:'Üye davet edildi',join:'Gruba katıldı',reject_invite:'Daveti reddetti',revoke_invite:'Davet iptal edildi',role_moderator:'Yönetici atandı',role_member:'Yöneticilik kaldırıldı',leave:'Gruptan ayrıldı',remove:'Üye çıkarıldı',ban:'Üye yasaklandı',unban:'Yasak kaldırıldı',mute:'Üye susturuldu',unmute:'Susturma kaldırıldı',delete_messages:'Mesajlar silindi'};
      const load=async(before)=>{const rows=await request('/audit'+(before?'?before='+before:''));if(!overlay.isConnected||revision!==viewRevision)return;if(!before)content.replaceChildren();content.querySelector('[data-more]')?.remove();
        for(const m of rows){const row=document.createElement('article');row.className='group-member-row';const b=document.createElement('b');b.textContent=labels[m.action]||m.action;const small=document.createElement('small');small.textContent=m.actor_name+(m.target_name?' → '+m.target_name:'')+' · '+new Date(m.created_at).toLocaleString('tr-TR');row.append(b,small);content.append(row)}
        if(rows.length===50){const more=addButton(content,'Önceki işlemler',()=>load(rows[rows.length-1].id));more.dataset.more=''}else if(!content.children.length)content.textContent='Yeni yönetim işlemleri burada kaydedilecek.';
      };await load();
    };
    const searchMessages=()=>{
      const revision=++viewRevision;content.innerHTML='<form><label>Grup mesajlarında ara<input name="q" required minlength="2" maxlength="100" autocomplete="off"></label><button class="group-submit">Ara</button></form><div data-results></div>';
      const form=content.querySelector('form'),results=content.querySelector('[data-results]');
      const load=async(before)=>{const rows=await request('/search?q='+encodeURIComponent(form.elements.q.value.trim())+(before?'&before='+before:''));if(!overlay.isConnected||revision!==viewRevision)return;if(!before)results.replaceChildren();results.querySelector('[data-more]')?.remove();
        for(const m of rows){const row=document.createElement('article');row.className='group-member-row';const title=document.createElement('small');title.textContent=m.sender_nickname+' · '+new Date(m.created_at).toLocaleString('tr-TR');const text=document.createElement('p');text.textContent=m.text;row.append(title,text);results.append(row)}
        if(rows.length===50){const more=addButton(results,'Daha eski sonuçlar',()=>load(rows[rows.length-1].id));more.dataset.more=''}else if(!results.children.length)results.textContent='Eşleşen mesaj bulunamadı.';
      };form.onsubmit=e=>{e.preventDefault();run(form.querySelector('button'),()=>load())};
    };
    const render=()=>{
      card.querySelector('[data-name]').textContent=group.name;card.querySelector('[data-description]').textContent=group.description||'Bu grup için henüz açıklama eklenmedi.';
      card.querySelector('[data-summary]').textContent=members.length+'/50 üye · '+({owner:'Kurucusunuz',moderator:'Yöneticisiniz',member:'Üyesiniz'}[role])+(group.closed?' · Kapatıldı · Salt okunur':group.admins_only?' · Duyuru grubu':' · Sohbet açık');
      const actions=card.querySelector('[data-actions]');actions.replaceChildren();
      addButton(actions,'Üyeler',roster);
      addButton(actions,'Mesajlarda ara',searchMessages);
      if(!group.closed&&(canManage()||group.members_can_invite))addButton(actions,'Üye davet et',invite);
      if(!group.closed&&(role==='owner'||role==='moderator'&&group.admins_edit_info))addButton(actions,'Grup bilgileri',editInfo);
      if(!group.closed&&role==='owner')addButton(actions,'Grup izinleri',permissions);
      if(canManage()){addButton(actions,'Bekleyen davetler',()=>remoteList('invitations'));addButton(actions,'Yasaklı üyeler',()=>remoteList('bans'));addButton(actions,'İşlem geçmişi',log)}
      addButton(actions,'Bildirim ayarı',()=>openNotificationSettings(id,group.name));
      if(!group.closed&&role==='owner')addButton(actions,'Grubu kapat',async()=>{if(!await dmConfirm('Grup kalıcı olarak kapatılacak. Davetler iptal edilir, yeni mesaj gönderilemez. Mevcut üyeler geçmişi okuyabilir. Devam edilsin mi?'))return;await request('/close','POST');await refresh();render();await syncGroupState(id)},true);
      if(role!=='owner')addButton(actions,'Gruptan ayrıl',async()=>{if(!await dmConfirm('Bu gruptan ayrılmak istiyor musunuz?'))return;await request('/members/'+encodeURIComponent(currentUserId),'DELETE');await endChat()},true);
      roster();
    };
    try{await refresh();if(overlay.isConnected)render()}catch(e){content.textContent=e.message||'Grup yönetimi açılamadı.'}
  }

  async function syncGroupState(id){
    if(!String(id||'').startsWith('grp_'))return;
    const revision=chatRevision;
    try{
      const [g,roster]=await Promise.all([api().api('/message-groups/'+encodeURIComponent(id)),api().api('/message-groups/'+encodeURIComponent(id)+'/members')]);
      if(revision!==chatRevision||String(activeConversationId)!==String(id))return;
      const chat=$('chat'),me=roster.find(m=>String(m.user_id)===String(currentUserId));
      const muted=me?.muted_until&&new Date(me.muted_until)>new Date();
      const reason=g.closed?'Grup kapatıldı · Salt okunur':muted?'Susturuldunuz · '+new Date(me.muted_until).toLocaleString('tr-TR'):g.admins_only&&g.my_role==='member'?'Yalnızca yöneticiler mesaj gönderebilir':'';
      const previouslyBlocked=chat.dataset.groupWriteBlocked;chat.dataset.groupWriteBlocked=reason?'1':'0';if(previouslyBlocked!==chat.dataset.groupWriteBlocked)chat.querySelectorAll('.bubble').forEach(row=>{if(row._message?.poll)renderMessagePoll(row,row._message)});const pollButton=chat.querySelector('[data-create-poll]');if(pollButton)pollButton.disabled=!!reason;
      if(reason){closeAttachmentPreview();cancelVoiceRecording();clearMessageMode();document.querySelector('[data-attachment-chooser]')?.remove()}
      const compose=chat.querySelector('.compose');if(compose){compose.hidden=!!reason;compose.style.display=reason?'none':''}
      const subtitle=chat.querySelector('.chatHead small');if(subtitle)subtitle.textContent=reason||roster.length+' üye · Grup bilgileri için ada dokun'+(g.slow_seconds?' · Yavaş mod '+g.slow_seconds+' sn':'');
      const title=chat.querySelector('.chatHead b');if(title)title.textContent=g.name;
    }catch(e){if(revision!==chatRevision)return;if(/üye değilsiniz|erişiminiz yok|bulunamadı/i.test(e.message||'')){chatRevision++;activeConversationId=null;releaseMediaUrls($('chat'));$('chat')?.classList.remove('show');document.querySelector('[data-group-menu]')?.remove();cancelVoiceRecording();closeSharedMedia();closeMessageActions();document.querySelector('[data-pin-banner]')?.remove();loadConversations();window.toast?.('Bu gruba erişiminiz sona erdi.')}}
  }
  async function checkGroupInvites(){
    const overlay=document.createElement('div');overlay.className='lidya-group-modal';
    const card=document.createElement('section');card.className='lidya-group-card';
    card.innerHTML='<button type="button" data-close style="position:absolute;right:12px;top:9px;border:0;background:transparent;color:inherit;font-size:24px">×</button><h3>Grup Davetleri</h3><div data-invite-list>Yükleniyor…</div>';
    overlay.append(card);document.body.append(overlay);
    const close=()=>overlay.remove();card.querySelector('[data-close]').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};
    const list=card.querySelector('[data-invite-list]');
    try{
      const rows=await api().api('/message-groups/invitations/mine');list.replaceChildren();
      if(!rows?.length){list.textContent='Bekleyen grup davetiniz yok.';return}
      for(const invite of rows){
        const row=document.createElement('div');row.className='lidya-invite-row';
        const photo=document.createElement('div');photo.className='lidya-invite-photo';photo.style.cssText='display:grid;place-items:center;font-size:24px';photo.textContent='👥';
        if(invite.has_image){
          try{const token=api().getAccessToken();const res=await fetch(api().messageMediaUrl(invite.image_url),{headers:token?{Authorization:'Bearer '+token}:{}});if(res.ok){const url=URL.createObjectURL(await res.blob());const img=document.createElement('img');img.className='lidya-invite-photo';img.src=url;img.onload=()=>URL.revokeObjectURL(url);photo.replaceWith(img);row.append(img)}else row.append(photo)}catch(e){row.append(photo)}
        }else row.append(photo);
        const name=document.createElement('span');name.className='lidya-invite-name';name.textContent=invite.name;row.append(name);
        for(const [action,symbol,klass,label] of [['accept','✓','lidya-invite-accept','Daveti kabul et'],['reject','×','lidya-invite-reject','Daveti reddet']]){
          const button=document.createElement('button');button.type='button';button.className=klass;button.textContent=symbol;button.setAttribute('aria-label',label);
          button.onclick=async()=>{const buttons=row.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{await api().api('/message-groups/'+encodeURIComponent(invite.conversation_id)+'/invitations/respond',{method:'POST',body:JSON.stringify({action})});row.remove();window.toast?.(action==='accept'?'Gruba katıldınız.':'Grup daveti reddedildi.');if(action==='accept'){close();await loadConversations();await openRealChat(invite.conversation_id,invite.name,'👥',null)}if(!list.children.length)list.textContent='Bekleyen grup davetiniz yok.'}catch(e){window.toast?.(e.message||'Davet yanıtı gönderilemedi.');buttons.forEach(b=>b.disabled=false)}};
          row.append(button);
        }
        list.append(row);
      }
    }catch(e){list.textContent=e.message||'Davetler yüklenemedi.'}
  }
  function installMessageSearch(){
    installFolderStyles();
    const root=document.getElementById('messages');
    if(root)installGroupCreation(root);if(!root||root.querySelector('[data-dm-search]'))return;
    const title=root.querySelector('.title');const search=document.createElement('div');search.setAttribute('data-dm-search','');search.style.cssText='margin:0 0 14px;position:relative';search.innerHTML="<input data-dm-user-search class=\"search-input\" inputmode=\"text\" autocomplete=\"off\" placeholder=\"Kullanıcı ID ara…\" style=\"width:100%;box-sizing:border-box;background:color-mix(in srgb, var(--ui-panel) 6%, transparent);border:1px solid var(--ui-line);color:var(--ui-ink);border-radius:18px;padding:13px 45px 13px 15px;outline:none\"><button data-dm-search-btn class=\"primary\" style=\"position:absolute;right:5px;top:5px;height:36px;border-radius:14px\">⌕</button><div data-dm-search-result style=\"margin-top:7px\"></div>";title?.parentNode?.insertBefore(search,title.nextSibling);
    const controls=document.createElement('div');controls.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px';const notify=document.createElement('button');notify.type='button';notify.textContent='Sohbet bildirimlerini yönet';notify.style.cssText="width:100%;min-width:0;min-height:40px;padding:8px;border:1px solid var(--ui-line);border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);font-size:10px";notify.onclick=()=>{if(!activeConversationId){window.toast?.('Önce bir sohbet seçin.');return}openNotificationSettings(activeConversationId)};
    notify.dataset.dmNotifications='';const archive=document.createElement('button');archive.type='button';archive.textContent='Arşiv';archive.style.cssText="width:100%;min-width:0;min-height:40px;padding:8px;border:1px solid var(--ui-line);border-radius:12px;background:color-mix(in srgb, var(--ui-panel) 2%, transparent);color:var(--ui-ink);font-size:10px";archive.onclick=()=>{inboxFolder='archive';selectedConversations.clear();loadConversations()};controls.append(notify,archive);search.append(controls);
    const input=search.querySelector('[data-dm-user-search]'),out=search.querySelector('[data-dm-search-result]');let searchRevision=0;input.addEventListener('input',()=>{searchRevision++;out.replaceChildren()});const run=async()=>{const revision=++searchRevision,q=input.value.trim();if(!q){out.innerHTML='';return}if(/^\d{6}$/.test(q)){input.value='';out.replaceChildren();await enterLockedFolder(q);return}out.innerHTML="<div class=\"card\" style=\"padding:10px;font-size:9px;color:var(--ui-ink)\">Aranıyor…</div>";try{const u=await api().api('/users/'+encodeURIComponent(q));if(revision!==searchRevision)return;const publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';out.innerHTML='<button type="button" class="item card" style="width:100%;text-align:left"><div class="ava round">👤</div><div class="grow"><b>'+escapeHtml(u.nickname||'Anonim kullanıcı')+'</b><small>ID: '+escapeHtml(publicId)+' • Profili görüntüle</small></div></button>';renderAvatar(out.querySelector('.ava'),avatarValue(u.avatar_asset||u.avatar_url||u.avatar,String(u.nickname||'A').slice(0,1).toUpperCase()),String(u.nickname||'A').slice(0,1).toUpperCase());window.ErisRoleBadges?.bind(out.querySelector('b'),u);out.querySelector('button').onclick=()=>loadUserProfile(u.id||q)}catch(e){if(revision!==searchRevision)return;out.innerHTML="<div class=\"card\" style=\"padding:10px;font-size:9px;color:var(--ui-danger)\">Kullanıcı bulunamadı.</div>"}};search.querySelector('[data-dm-search-btn]').setAttribute('aria-label','Kullanıcı ara');input.setAttribute('aria-label','Kullanıcı ID veya kilitli sohbet şifresi');search.querySelector('[data-dm-search-btn]').innerHTML=dmIcon('search');search.querySelector('[data-dm-search-btn]').onclick=run;input.onkeydown=e=>{if(e.key==='Enter')run()};installFolderControls(root);
  }
  function resetInbox(){
    cancelVoiceRecording();closeMessageActions();pinFetchRevision++;document.querySelector('[data-pin-banner]')?.remove();inboxAuthRevision++;clearTimeout(inboxSearchTimer);inboxQuery='';inboxView='all';inboxFolder='inbox';inboxLimit=50;inboxScope='';selectedConversations.clear();
    const input=document.querySelector('[data-inbox-query]');if(input)input.value='';
    document.querySelector('#messages .list')?.replaceChildren();
    const root=$('messages');if(root){renderFolderControls(root);root.querySelectorAll('[data-inbox-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inboxView==='all')));const status=root.querySelector('[data-inbox-status]');if(status)status.textContent='';const userSearch=root.querySelector('[data-dm-user-search]');if(userSearch)userSearch.value='';root.querySelector('[data-dm-search-result]')?.replaceChildren()}
  }
  function installInboxControls(){
    const root=$('messages');if(!root||root.querySelector('[data-inbox-controls]'))return;
    const panel=document.createElement('div');panel.dataset.inboxControls='';panel.className='dm-inbox-controls';
    panel.innerHTML='<label>Sohbetlerde ara<input type="search" data-inbox-query maxlength="100" placeholder="Kişi, grup, aile adı veya kullanıcı ID" autocomplete="off"></label><div role="group" aria-label="Sohbet filtreleri"><button type="button" data-inbox-view="all">Tümü</button><button type="button" data-inbox-view="unread">Okunmamış</button><button type="button" data-inbox-view="pinned">Sabitlenmiş</button><button type="button" data-inbox-select>Seç</button></div><small data-inbox-status role="status" aria-live="polite"></small>';
    root.querySelector('.list')?.before(panel);
    const style=document.createElement('style');style.textContent=`
      .dm-inbox-controls{margin:12px 0;min-width:0}.dm-inbox-controls label{display:block;font-size:12px}
      .dm-inbox-controls input{display:block;width:100%;box-sizing:border-box;min-height:44px;margin:6px 0 10px;padding:10px 12px;border:1px solid var(--ui-line,#c8ae79);border-radius:12px;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c);font:inherit}
      .dm-inbox-controls [role=group],.dm-list-tools{display:flex;flex-wrap:wrap;gap:6px}.dm-inbox-controls button,.dm-list-tools button,.dm-inbox-more{min-height:40px;padding:8px 10px;border:1px solid var(--ui-line,#c8ae79);border-radius:10px;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c);font:inherit;font-size:12px}
      .dm-inbox-controls button[aria-pressed=true]{border-color:var(--ui-gold,#a67c38);box-shadow:inset 0 0 0 1px var(--ui-gold,#a67c38)}.dm-inbox-controls small{display:block;margin-top:8px;opacity:.8}.dm-inbox-more{display:block;width:100%;margin:12px 0}.dm-list-pin{font-size:11px;margin-inline-start:6px}.dm-list-tools[hidden]{display:none}
    `;document.head.appendChild(style);
    const refresh=()=>{selectedConversations.clear();inboxLimit=50;loadConversations()};
    panel.querySelector('[data-inbox-query]').addEventListener('input',e=>{
      inboxQuery=e.target.value.trim();listRevision++;clearTimeout(inboxSearchTimer);selectedConversations.clear();
      root.querySelector('.list').setAttribute('aria-busy','true');inboxSearchTimer=setTimeout(refresh,250);
    });
    panel.querySelectorAll('[data-inbox-view]').forEach(b=>b.onclick=()=>{inboxView=b.dataset.inboxView;clearTimeout(inboxSearchTimer);refresh()});
    panel.querySelector('[data-inbox-select]').onclick=()=>{const first=root.querySelector('.list .item[data-conversation-id]');if(first){const id=first.dataset.conversationId;if(selectedConversations.has(id))selectedConversations.delete(id);else selectedConversations.add(id);first.classList.toggle('dm-list-selected',selectedConversations.has(id));renderFolderControls(root)}};
    const tools=root.querySelector('.dm-list-tools');
    for(const [key,text,payload] of [['pin','Sabitle',{pinned:true}],['unpin','Sabitlemeyi kaldır',{pinned:false}],['read','Okundu',{unread:false}],['unread','Okunmadı',{unread:true}]]){
      const b=document.createElement('button');b.type='button';b.dataset.inboxAction=key;b.textContent=text;tools?.appendChild(b);
      b.onclick=async()=>{
        const ids=[...selectedConversations],user=currentUserId,authRevision=inboxAuthRevision;if(!ids.length)return;
        const buttons=[...tools.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
        try{for(let i=0;i<ids.length;i+=100){if(user!==currentUserId||authRevision!==inboxAuthRevision)return;await api().api('/inbox/preferences',{method:'POST',body:JSON.stringify({conversation_ids:ids.slice(i,i+100),...payload})})}
          if(user!==currentUserId||authRevision!==inboxAuthRevision)return;selectedConversations.clear();await loadConversations();window.toast?.('Sohbetler güncellendi.');
        }catch(e){if(user===currentUserId)window.toast?.(e.message||'Sohbetler güncellenemedi.')}finally{buttons.forEach(b=>b.disabled=false)}
      };
    }
  }
  async function loadConversations(more=false) {
    installMessageSearch();installInboxControls();installStarControls();
    window.ErisPaymentAssistance?.renderInbox?.();
    if (!(localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token'))) return;
    const list = document.querySelector('#messages .list');
    if (!list || !api()?.conversations) return;
    const scope=[currentUserId,inboxFolder,inboxQuery,inboxView].join('|');
    if(scope!==inboxScope){inboxScope=scope;inboxLimit=50;selectedConversations.clear()}
    if(more===true)inboxLimit+=50;
    const revision=++listRevision,folder=inboxFolder,user=currentUserId,q=inboxQuery,view=inboxView;
    document.querySelectorAll('[data-inbox-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inboxView===view)));
    const status=document.querySelector('[data-inbox-status]');if(status)status.textContent='Sohbetler yükleniyor…';
    const valid=()=>revision===listRevision&&folder===inboxFolder&&q===inboxQuery&&view===inboxView&&(!user||String(user)===String(currentUserId));
    list.setAttribute('aria-busy','true');
    try {
      if (!currentUserId && api().getMe) {
        try {
          const me = await api().getMe();
          if(revision!==listRevision)return;
          currentUserId = me?.id || null;
        } catch (error) {
          console.warn('[LidyaChat] current user unavailable', error);
        }
      }
      if (!currentUserId) return;
      const items=[],seen=new Set();let hasMore=false;
      for(let offset=0;offset<inboxLimit;offset+=50){
        const payload=await api().api('/conversations?folder='+folder+'&limit=51&offset='+offset+'&q='+encodeURIComponent(q)+'&view='+view);
        if(!valid())return;
        const page=asList(payload,['conversations','items','data']);hasMore=page.length>50;
        for(const c of page.slice(0,50)){const id=String(c.id||c.conversation_id);if(!seen.has(id)){seen.add(id);items.push(c)}}
        if(!hasMore)break;
      }
      if(status)status.textContent=items.length+' sohbet'+(hasMore?' · Devamı var':'');
      renderFolderControls(document.getElementById('messages'));
      loadedForUserId = currentUserId;
      if (!items.length) {
        releaseMediaUrls(list);
        if(q||view!=='all'){list.innerHTML='<div class="dm-list-state"><b>Bu filtrede sohbet yok</b><p>Aramayı veya sohbet filtresini değiştirebilirsin.</p></div>';return}
        list.innerHTML = '<div class="dm-list-state"><span aria-hidden="true">'+dmIcon('chat')+'</span><b>'+(folder==='archive'?'Arşivin boş':folder==='locked'?'Kilitli sohbet yok':'İlk sohbetini başlat')+'</b><p>Bir kullanıcı ID’si aratarak konuşmaya başlayabilirsin.</p></div>';
        return;
      }
      const participants = await Promise.all(items.map(c => c.type === 'welcome' ? Promise.resolve({ nickname: 'LidyaChat' }) : resolveParticipant(c)));
      if(!valid())return;
      releaseMediaUrls(list);list.replaceChildren();
      items.forEach((c, index) => {
        const other = participants[index] || {};
        const id = c.id || c.conversation_id;
        if (!id) return;
        conversationInfo.set(String(id),c);
        const family = c.type === 'family' || / aile sohbeti$/i.test(String(c.name || ''));
        const group = c.type === 'group';
        const welcome = c.type === 'welcome';
        if (welcome) systemConversationIds.add(String(id));
        const name = group ? (c.name || 'Mesaj grubu') : family ? (c.name || 'Aile sohbeti') : (welcome ? 'LidyaChat' : (other.nickname || other.name || c.name || 'Kullanıcı'));
        const avatar = welcome ? SYSTEM_AVATAR : avatarValue(other.avatar_asset || other.avatar_url || other.avatar, name.slice(0, 1).toUpperCase());
        const b = document.createElement('button');
        b.className = 'item';b.dataset.conversationId=String(id);
        b.innerHTML = '<div class="ava round"></div><div class="grow"><b></b><small></small></div><span class="dm-unread" hidden></span>';
        if(group||family)renderConversationAvatar(b.querySelector('.ava'),c,group?'👥':'👪');
        else renderAvatar(b.querySelector('.ava'),avatar,name.slice(0,1).toUpperCase(),welcome?'':other.frame_asset);
        b.querySelector('b').textContent = name;if(!family&&!welcome&&!group)window.ErisRoleBadges?.bind(b.querySelector('b'),other);
        if(c.is_muted){const muted=document.createElement('span');muted.className='dm-list-muted';muted.textContent=' 🔕';muted.setAttribute('aria-label','Sohbet bildirimleri sessizde');muted.title=c.muted_until?'Şu zamana kadar sessizde: '+new Date(c.muted_until).toLocaleString('tr-TR'):'Süresiz sessizde';b.querySelector('.grow').append(muted)}
        if(c.pinned){const pin=document.createElement('span');pin.className='dm-list-pin';pin.textContent='📌';pin.setAttribute('aria-label','Sabitlenmiş sohbet');b.querySelector('.grow').appendChild(pin)}
        b.querySelector('small').textContent = c.last_message || (group ? 'Grup sohbeti' : family ? 'Aile sohbeti' : 'Mesajlaşma');
        const badge = b.querySelector('.dm-unread');
        const unread = Number(c.unread_count || 0);
        if ((Number.isFinite(unread) && unread > 0) || c.manual_unread) { badge.hidden = false; badge.textContent = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '●';badge.setAttribute('aria-label',unread>0?unread+' okunmamış mesaj':'Okunmadı olarak işaretlendi'); }
        else badge.remove();
        b.classList.toggle('dm-list-selected',selectedConversations.has(String(id)));
        let held=false,timer=null,x=0,y=0;
        const toggle=()=>{const key=String(id);if(selectedConversations.has(key))selectedConversations.delete(key);else selectedConversations.add(key);b.classList.toggle('dm-list-selected',selectedConversations.has(key));renderFolderControls(document.getElementById('messages'))};
        b.addEventListener('pointerdown',e=>{x=e.clientX;y=e.clientY;held=false;clearTimeout(timer);timer=setTimeout(()=>{held=true;toggle()},520)});
        b.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-x)>12||Math.abs(e.clientY-y)>12)clearTimeout(timer)});
        ['pointerup','pointercancel','pointerleave'].forEach(type=>b.addEventListener(type,()=>clearTimeout(timer)));
        b.oncontextmenu=e=>{e.preventDefault();if(!held){held=true;toggle()}};
        b.onclick = e => {if(held){held=false;e.preventDefault();return}if(selectedConversations.size){toggle();return}window.__erisActiveDmUserId = family || welcome || group ? null : (other.id || other.user_id || null); openRealChat(id, name, group ? '👥' : family ? '👪' : avatar, window.__erisActiveDmUserId); };
        list.appendChild(b);
      });
      if(hasMore){const next=document.createElement('button');next.type='button';next.className='dm-inbox-more';next.dataset.inboxMore='';next.textContent='Daha fazla sohbet';next.onclick=()=>{next.disabled=true;loadConversations(true)};list.appendChild(next)}
      renderFolderControls(document.getElementById('messages'));
    } catch (e) {
      console.warn('[LidyaChat] conversations unavailable', e);
      if(valid()){if(status)status.textContent='Sohbetler yüklenemedi.';showListError(list)}
    }finally{if(revision===listRevision)list.setAttribute('aria-busy','false')}
  }

  function invalidateQuotedMessages(ids){
    const removed=new Set(ids.map(Number)),body=$('chat')?.querySelector('.chatBody');if(!body)return;
    for(const row of body.querySelectorAll('.bubble[data-message-id]'))if(removed.has(Number(row._message?.reply_to_id)))appendMessageOnce(body,{...row._message,reply_to_id:null,reply:{unavailable:true,sender_name:'',text:'Mesaj artık görüntülenemiyor.'}},row._mine);
    if(messageMode&&removed.has(Number(messageMode.message.id)))clearMessageMode();
  }
  function openNotificationSettings(id,label=null){
    if(!id)return;
    const info=conversationInfo.get(String(id)),peer=asList(info?.members,['members']).find(x=>String(x.user_id)!==String(currentUserId));
    const name=label||info?.name||peer?.nickname||(String(activeConversationId)===String(id)?$('chat')?.querySelector('.chatHead b')?.textContent:null)||'Sohbet';
    const panel=messageActionPanel('Sohbet bildirimleri');panel.dataset.notificationSettings='';
    const content=panel.querySelector('[data-content]'),status=panel.querySelector('[data-status]'),user=currentUserId,authRevision=inboxAuthRevision;
    content.innerHTML='<h4 data-name></h4><p data-current></p><p>Mesajlar gelmeye devam eder. Bu ayar yalnızca bu sohbetin mesaj, medya, Story yanıtı ve hediye bildirimlerini etkiler. Arama bildirimleri ayrıdır. Genel bildirimlerin kapalıysa bu ayar onları açmaz.</p><label>Bildirim tercihi<select data-notification-duration disabled><option value="choose" disabled>Süre seçin…</option><option value="off">Bildirimler açık</option><option value="3600">1 saat sessize al</option><option value="28800">8 saat sessize al</option><option value="86400">1 gün sessize al</option><option value="604800">1 hafta sessize al</option><option value="forever">Süresiz sessize al</option></select></label><button type="button" data-notification-save disabled>Kaydet</button><button type="button" data-notification-retry hidden>Yeniden yükle</button>';
    content.querySelector('[data-name]').textContent=name;
    if(!document.getElementById('dm-notification-styles')){const style=document.createElement('style');style.id='dm-notification-styles';style.textContent=`
      [data-notification-settings]{position:fixed;inset:0;z-index:100090;overflow:auto;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c)}[data-notification-settings] section{box-sizing:border-box;width:min(620px,100%);margin:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}[data-notification-settings] header{display:flex;align-items:center;justify-content:space-between;gap:10px}[data-notification-settings] p{font-size:13px;line-height:1.6;overflow-wrap:anywhere}[data-notification-settings] h4{overflow-wrap:anywhere}[data-notification-settings] label{display:block;margin:18px 0;font-size:13px}[data-notification-settings] select{display:block;box-sizing:border-box;width:100%;margin-top:8px;padding:12px;border:1px solid var(--ui-line,#c8ae79);border-radius:12px;background:var(--ui-raised,var(--ui-panel,#fffaf0));color:inherit;font:inherit}[data-notification-settings] button{min-height:44px;border:1px solid var(--ui-line,#c8ae79);border-radius:12px;padding:10px 14px;background:var(--ui-raised,var(--ui-panel,#fffaf0));color:inherit;font:inherit}.dm-list-muted{font-size:11px}
    `;document.head.append(style)}
    const select=content.querySelector('[data-notification-duration]'),save=content.querySelector('[data-notification-save]'),retry=content.querySelector('[data-notification-retry]'),path='/conversations/'+encodeURIComponent(id)+'/notifications';
    const valid=()=>panel.isConnected&&user===currentUserId&&authRevision===inboxAuthRevision;let busy=false;
    const render=state=>{content.querySelector('[data-current]').textContent=state.is_muted?(state.muted_until?'Şu zamana kadar sessizde: '+new Date(state.muted_until).toLocaleString('tr-TR'):'Bu sohbet süresiz sessizde.'):'Bu sohbetin bildirimleri açık.';select.value=state.is_muted?(state.muted_until?'choose':'forever'):'off';save.disabled=true};
    const load=async()=>{if(busy)return;busy=true;select.disabled=save.disabled=true;retry.hidden=true;status.textContent='Bildirim ayarı yükleniyor…';
      try{const state=await api().api(path);if(!valid())return;render(state);select.disabled=false;status.textContent=''}catch(e){if(valid()){status.textContent=e.message||'Bildirim ayarı yüklenemedi.';retry.hidden=false}}finally{busy=false}
    };
    retry.onclick=load;select.onchange=()=>{save.disabled=busy||select.value==='choose'};
    save.onclick=async()=>{if(!valid()||busy||select.value==='choose')return;busy=true;save.disabled=select.disabled=true;status.textContent='Kaydediliyor…';
      const value=select.value,payload={is_muted:value!=='off',...(value!=='off'&&value!=='forever'?{duration_seconds:Number(value)}:{})};
      try{const state=await api().api(path,{method:'PUT',body:JSON.stringify(payload)});if(!valid())return;render(state);status.textContent='Bildirim ayarı kaydedildi.';loadConversations();}
      catch(e){if(valid()){status.textContent=e.message||'Bildirim ayarı kaydedilemedi.';save.disabled=false}}finally{busy=false;if(valid())select.disabled=false}
    };load();
  }
  function ensurePollStyles(){
    if(document.getElementById('dm-poll-styles'))return;const style=document.createElement('style');style.id='dm-poll-styles';style.textContent=`
      .dm-poll{min-width:min(220px,58vw);margin:8px 0;overflow-wrap:anywhere}.dm-poll h4{margin:0 0 10px;font-size:14px}.dm-poll label{display:flex;align-items:start;gap:8px;padding:10px 0;border-bottom:1px solid var(--ui-line,#c8ae79);font-size:13px}.dm-poll label span{flex:1;white-space:pre-wrap}.dm-poll label small{white-space:nowrap}.dm-poll>p{font-size:11px;line-height:1.5}.dm-poll button{min-height:38px;margin:7px 5px 0 0;padding:7px 10px;border:1px solid var(--ui-line,#c8ae79);border-radius:10px;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c);font:inherit;font-size:12px}
      [data-poll-create]{position:fixed;inset:0;z-index:100090;overflow:auto;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c)}[data-poll-create] section{box-sizing:border-box;width:min(620px,100%);margin:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}[data-poll-create] header{display:flex;justify-content:space-between;align-items:center;gap:10px}[data-poll-create] label{display:block;margin:14px 0;font-size:13px}[data-poll-create] input:not([type=checkbox]),[data-poll-create] textarea,[data-poll-create] select{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:12px;border:1px solid var(--ui-line,#c8ae79);border-radius:11px;background:var(--ui-raised,var(--ui-panel,#fffaf0));color:inherit;font:inherit}[data-poll-create] button{min-height:44px;border:1px solid var(--ui-line,#c8ae79);border-radius:11px;padding:9px 12px;background:var(--ui-raised,var(--ui-panel,#fffaf0));color:inherit;font:inherit}[data-poll-create] p{font-size:13px;line-height:1.6}.dm-poll-option-editor{display:flex;gap:8px;align-items:end}.dm-poll-option-editor label{flex:1;min-width:0}.dm-poll-option-editor button{margin-bottom:14px}
    `;document.head.append(style);
  }
  function renderMessagePoll(row,message){
    if(!message.poll&&!message.has_poll)return;ensurePollStyles();const p=message.poll,old=row.querySelector('.dm-poll');
    if(old?.dataset.dirty==='1'&&p&&!p.is_closed&&$('chat')?.dataset.groupWriteBlocked!=='1'&&JSON.stringify(old._options)===JSON.stringify(p.options.map(x=>x.text))){old.querySelectorAll('[data-option-count]').forEach(x=>{x.textContent=String(p.options[Number(x.dataset.optionCount)]?.count||0)});old.querySelector('[data-total]').textContent=p.voter_count+' kişi oy verdi';return}
    old?.remove();const form=document.createElement('form');form.className='dm-poll';form.dataset.messageId=String(message.id);form.onclick=e=>e.stopPropagation();
    if(!p){const label=document.createElement('p');label.textContent='Anket yükleniyor…';const retry=document.createElement('button');retry.type='button';retry.textContent='Yeniden yükle';retry.onclick=()=>refreshPollMessage(row);form.append(label,retry);row.append(form);return}
    form._options=p.options.map(x=>x.text);const title=document.createElement('h4');title.textContent=p.question;form.append(title);
    const blocked=p.is_closed||$('chat')?.dataset.groupWriteBlocked==='1';
    for(const option of p.options){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),count=document.createElement('small');input.type=p.multiple?'checkbox':'radio';input.name='choice';input.value=String(option.id);input.checked=p.my_choices.includes(option.id);input.disabled=blocked;input.onchange=()=>{form.dataset.dirty='1'};text.textContent=option.text;count.dataset.optionCount=String(option.id);count.textContent=String(option.count);label.append(input,text,count);form.append(label)}
    const total=document.createElement('p');total.dataset.total='';total.textContent=p.voter_count+' kişi oy verdi';const state=document.createElement('p');state.textContent=(p.multiple?'Birden fazla seçenek işaretlenebilir.':'Tek seçenek seçilebilir.')+' '+(p.is_closed?'Anket kapalı.':p.expires_at?'Bitiş: '+new Date(p.expires_at).toLocaleString('tr-TR'):'');form.append(total,state);
    const status=document.createElement('p');status.dataset.pollStatus='';status.setAttribute('role','status');const submit=document.createElement('button');submit.type='submit';submit.textContent='Oyu kaydet';submit.disabled=blocked;const clear=document.createElement('button');clear.type='button';clear.textContent='Oyumu kaldır';clear.disabled=blocked||!p.my_choices.length;
    form.onsubmit=e=>{e.preventDefault();savePoll(row,form,'vote',{choices:[...form.querySelectorAll('input:checked')].map(x=>Number(x.value))})};clear.onclick=()=>savePoll(row,form,'vote',{choices:[]});form.append(submit,clear);
    if(p.can_close){const close=document.createElement('button');close.type='button';close.textContent='Anketi kapat';close.onclick=async()=>{if(await dmConfirm('Anket kapatılacak ve yeni oy kabul edilmeyecek. Devam edilsin mi?'))savePoll(row,form,'close')};form.append(close)}
    form.append(status);(row.querySelector('.dm-award-content')||row).append(form);
  }
  async function refreshPollMessage(row){
    const cid=activeConversationId,revision=chatRevision,id=Number(row?.dataset.messageId);if(!cid||!id)return;
    try{const poll=await api().api('/message-polls/'+encodeURIComponent(cid)+'/'+id);if(revision!==chatRevision||String(activeConversationId)!==String(cid))return;const body=$('chat')?.querySelector('.chatBody'),current=body?.querySelector('[data-message-id="'+id+'"]');if(current)appendMessageOnce(body,{...current._message,poll},current._mine)}catch(e){if(revision===chatRevision){const label=row.querySelector('.dm-poll p');if(label)label.textContent=e.message||'Anket yüklenemedi.'}}
  }
  async function savePoll(row,form,action,payload){
    const cid=activeConversationId,revision=chatRevision,id=Number(row.dataset.messageId);if(form.dataset.busy==='1'||!cid||!row.isConnected||String(row._message?.conversation_id||cid)!==String(cid))return;form.dataset.busy='1';form.querySelectorAll('input,button').forEach(x=>x.disabled=true);
    try{const poll=await api().api('/message-polls/'+encodeURIComponent(cid)+'/'+id+'/'+action,{method:action==='vote'?'PUT':'POST',...(payload?{body:JSON.stringify(payload)}:{})});if(revision!==chatRevision)return;const body=$('chat')?.querySelector('.chatBody'),current=body?.querySelector('[data-message-id="'+id+'"]');if(current){const active=current.querySelector('.dm-poll');if(active)active.dataset.dirty='';const updated=appendMessageOnce(body,{...current._message,poll},current._mine);if(updated?.querySelector('.dm-poll')===active)renderMessagePoll(updated,updated._message)}}
    catch(e){if(revision===chatRevision&&form.isConnected){form.querySelector('[data-poll-status]').textContent=e.message||'Anket işlemi kaydedilemedi.';form.querySelectorAll('input,button').forEach(x=>x.disabled=false)}}finally{form.dataset.busy=''}
  }
  function openCreatePoll(){
    const cid=activeConversationId,revision=chatRevision,user=currentUserId;if(!cid||!['group','family'].includes($('chat')?.dataset.conversationType))return;
    ensurePollStyles();const panel=messageActionPanel('Anket oluştur');panel.dataset.pollCreate='';const content=panel.querySelector('[data-content]'),status=panel.querySelector('[data-status]');
    const form=document.createElement('form');form.innerHTML='<label>Soru<textarea name="question" required maxlength="180" rows="3"></textarea></label><div data-options></div><button type="button" data-add-option>Seçenek ekle</button><label><input name="multiple" type="checkbox"> Birden fazla seçenek seçilebilsin</label><label>Oylama süresi<select name="duration"><option value="">Elle kapatana kadar</option><option value="86400">1 gün</option><option value="604800">1 hafta</option></select></label><p>Sonuçlarda oy sayıları ve yalnızca kendi seçimin görünür. Anketi oluşturan kişi veya sohbet yöneticisi kapatabilir. Soru ve seçenekler gönderildikten sonra değiştirilemez.</p><button type="submit">Anketi gönder</button>';content.append(form);
    const options=form.querySelector('[data-options]'),add=form.querySelector('[data-add-option]');
    const labels=()=>{const rows=[...options.children];rows.forEach((row,i)=>{row.querySelector('span').textContent='Seçenek '+(i+1);row.querySelector('input').setAttribute('aria-label','Seçenek '+(i+1));row.querySelector('button').disabled=rows.length<=2});add.disabled=rows.length>=10};
    const append=()=>{const row=document.createElement('div');row.className='dm-poll-option-editor';row.innerHTML='<label><span></span><input required maxlength="80"></label><button type="button" aria-label="Seçeneği kaldır">×</button>';row.querySelector('button').onclick=()=>{row.remove();labels()};options.append(row);labels()};add.onclick=append;append();append();
    const key=window.crypto?.randomUUID?.()||('poll_'+Date.now()+'_'+Math.random().toString(36).slice(2));let busy=false;
    form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const payload={question:form.elements.question.value.trim(),options:[...options.querySelectorAll('input')].map(x=>x.value.trim()),multiple:form.elements.multiple.checked,request_key:key,...(form.elements.duration.value?{duration_seconds:Number(form.elements.duration.value)}:{})};form.querySelectorAll('input,button,textarea,select').forEach(x=>x.disabled=true);status.textContent='Anket gönderiliyor…';
      try{const message=await api().api('/message-polls/'+encodeURIComponent(cid),{method:'POST',body:JSON.stringify(payload)});if(revision!==chatRevision||user!==currentUserId)return;appendMessageOnce($('chat').querySelector('.chatBody'),message,true);if(panel.isConnected)panel.remove();loadConversations();window.toast?.('Anket oluşturuldu.')}catch(error){if(panel.isConnected&&revision===chatRevision)status.textContent=error.message||'Anket gönderilemedi.'}finally{busy=false;if(panel.isConnected){form.querySelectorAll('input,button,textarea,select').forEach(x=>x.disabled=false);labels()}}
    };
  }
  function renderMessageStar(row,message){
    row.querySelector('.dm-message-star')?.remove();if(!message.is_starred)return;
    const badge=document.createElement('span');badge.className='dm-message-star';badge.textContent='★';badge.setAttribute('aria-label','Sana özel yıldızlı mesaj');badge.title='Sana özel yıldızlı mesaj';
    (row.querySelector('.dm-message-meta')||row).append(badge);
  }
  function installStarControls(){
    const searchRoot=$('messages');if(searchRoot&&!searchRoot.querySelector('[data-open-global-search]')){const button=document.createElement('button');button.type='button';button.dataset.openGlobalSearch='';button.textContent='Mesajlarda ara';button.onclick=openGlobalMessageSearch;searchRoot.querySelector('[data-inbox-controls]')?.append(button)}
    const root=$('messages');if(root&&!root.querySelector('[data-open-stars]')){const button=document.createElement('button');button.type='button';button.dataset.openStars='';button.textContent='★ Yıldızlı mesajlar';button.onclick=()=>openStarredMessages();root.querySelector('[data-inbox-controls]')?.append(button)}
    if(document.getElementById('dm-stars-styles'))return;
    const style=document.createElement('style');style.id='dm-stars-styles';style.textContent=`
      .dm-message-star{color:var(--ui-gold,#b98c46);font-size:12px}#chat .dm-select-tools button[data-star-selected]{width:auto;font-size:11px;padding:0 8px}
      [data-open-stars]{width:100%;margin-top:10px;min-height:44px;border:1px solid var(--ui-line,#c8ae79);border-radius:12px;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c);font:inherit}
      [data-starred-panel]{position:fixed;inset:0;z-index:100090;overflow:auto;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c);overscroll-behavior:contain}[data-starred-panel] section{box-sizing:border-box;width:min(620px,100%);margin:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}[data-starred-panel] header{display:flex;justify-content:space-between;align-items:center;gap:10px}[data-starred-panel] button{min-height:44px;border:1px solid var(--ui-line,#c8ae79);border-radius:12px;padding:9px 12px;background:var(--ui-raised,var(--ui-panel,#fffaf0));color:inherit;font:inherit}[data-starred-panel] label{display:block;font-size:12px;margin:12px 0}[data-starred-panel] input,[data-starred-panel] select{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:12px;border:1px solid var(--ui-line,#c8ae79);border-radius:10px;background:var(--ui-raised,var(--ui-panel,#fffaf0));color:inherit;font:inherit}[data-starred-panel] p{font-size:13px;overflow-wrap:anywhere}.dm-star-card{margin:14px 0;padding:14px;border:1px solid var(--ui-line,#c8ae79);border-radius:16px;overflow-wrap:anywhere}.dm-star-card small{display:block;opacity:.75;margin:8px 0}.dm-star-card p{white-space:pre-wrap}.dm-star-card footer{display:flex;flex-wrap:wrap;gap:8px}[data-star-more]{width:100%;margin-top:12px}
    `;document.head.append(style);
  }
  async function setMessageStar(row){
    const cid=activeConversationId,revision=chatRevision,user=currentUserId,m=row?._message;if(!m||!cid)return;
    const button=selectionBar?.querySelector('[data-star-selected]');if(button)button.disabled=true;
    try{const data=await api().api('/message-stars/'+encodeURIComponent(cid)+'/'+m.id,{method:'PUT',body:JSON.stringify({starred:!m.is_starred})});
      if(revision!==chatRevision||user!==currentUserId)return;
      const body=$('chat')?.querySelector('.chatBody'),current=body?.querySelector('[data-message-id="'+Number(m.id)+'"]');if(current)appendMessageOnce(body,{...current._message,is_starred:!!data.is_starred},current._mine);
      refreshSelectionBar();window.toast?.(data.is_starred?'Mesaj yıldızlandı.':'Mesajın yıldızı kaldırıldı.');
    }catch(e){if(revision===chatRevision&&user===currentUserId){window.toast?.(e.message||'Yıldız kaydedilemedi.');refreshSelectionBar()}}
  }
  let pinFetchRevision=0,pinBusy=false;
  function updatePinRows(items){
    const ids=new Set(items.map(x=>String(x.message.id)));
    $('chat')?.querySelectorAll('.bubble[data-message-id]').forEach(row=>{
      const pinned=ids.has(row.dataset.messageId);if(row._message)row._message.is_pinned=pinned;
      row.dataset.pinned=pinned?'1':'0';row.querySelectorAll('[data-pin-icon]').forEach(x=>x.remove());
      if(pinned){const icon=document.createElement('span');icon.dataset.pinIcon='';icon.textContent='📌 ';icon.setAttribute('aria-label','Sabitlenmiş mesaj');row.prepend(icon)}
    });refreshSelectionBar();
  }
  async function refreshPinnedMessages(){
    const cid=activeConversationId,user=currentUserId,revision=chatRevision,own=++pinFetchRevision,chat=$('chat');
    if(!cid||isSystemConversation())return;
    const valid=()=>revision===chatRevision&&user===currentUserId&&String(cid)===String(activeConversationId)&&own===pinFetchRevision;
    try{const data=await api().api('/conversations/'+encodeURIComponent(cid)+'/pins');if(!valid())return;
      const items=asList(data,['items']).filter(x=>x.message?.id);chat.dataset.pinManage=data.can_manage?'1':'0';updatePinRows(items);
      const button=chat.querySelector('[data-pinned-messages]');if(button)button.textContent='Sabitlenenler'+(items.length?' ('+items.length+')':'');
      let banner=chat.querySelector('[data-pin-banner]');if(!banner){banner=document.createElement('button');banner.type='button';banner.dataset.pinBanner='';banner.className='dm-pinned';banner.onclick=openPinnedMessages;chat.querySelector('.chatBody').before(banner)}
      banner.hidden=!items.length;banner.textContent=items.length?'📌 '+items.length+' sabit mesaj · '+String(items[0].message.media_name||items[0].message.text||'Mesaj').slice(0,100):'';
      const panel=document.querySelector('[data-pinned-panel]');if(panel?.dataset.conversationId===String(cid))renderPinnedMessages(panel,data);
      return data;
    }catch(e){if(valid()){chat.dataset.pinManage='0';refreshSelectionBar();chat.querySelector('[data-pin-banner]')?.remove();const panel=document.querySelector('[data-pinned-panel]');if(panel){panel.querySelector('[data-pin-results]').replaceChildren();panel.querySelector('[data-status]').textContent=e.message||'Sabitlenen mesajlar yüklenemedi.'}}}
  }
  function renderPinnedMessages(panel,data){
    const content=panel.querySelector('[data-pin-results]'),status=panel.querySelector('[data-status]');content.replaceChildren();
    const items=asList(data,['items']);status.textContent=items.length?items.length+' / '+(data.limit||5)+' sabit mesaj':'Bu sohbette sabitlenmiş mesaj yok.';
    for(const item of items){const m=item.message,card=document.createElement('article');card.className='dm-pin-card';card.dataset.pinMessageId=String(m.id);
      const title=document.createElement('b'),text=document.createElement('p'),meta=document.createElement('small'),footer=document.createElement('footer');
      title.textContent=m.sender_nickname||'Kullanıcı';text.textContent=m.media_name||m.text||'Mesaj';meta.textContent=messageTime(m.created_at)+(m.media_type?' · '+({image:'Fotoğraf',voice:'Sesli mesaj',video:'Video',document:'Belge'}[m.media_type]||'Medya'):'');
      const open=document.createElement('button');open.type='button';open.dataset.pinGoto='';open.textContent='Sohbette göster';open.onclick=()=>{if(panel.dataset.conversationId!==String(activeConversationId))return;panel.remove();jumpToMessage(m.id)};footer.append(open);
      if(data.can_manage){const remove=document.createElement('button');remove.type='button';remove.dataset.pinRemove='';remove.textContent='Sabitlemeyi kaldır';remove.disabled=pinBusy;remove.onclick=()=>changeMessagePin(m,panel);footer.append(remove)}
      card.append(title,meta,text,footer);content.append(card);
    }
  }
  function openPinnedMessages(){
    if(!activeConversationId||isSystemConversation())return;
    const panel=messageActionPanel('Sabitlenen mesajlar');panel.dataset.pinnedPanel='';panel.dataset.conversationId=String(activeConversationId);
    panel.querySelector('[data-content]').innerHTML='<p>Sabitlenenler sohbetteki herkes içindir. Sana özel kaydetmek için Yıldızla seçeneğini kullanabilirsin.</p><button type="button" data-pin-refresh>Yenile</button><div data-pin-results></div>';
    panel.querySelector('[data-pin-refresh]').onclick=refreshPinnedMessages;refreshPinnedMessages();
  }
  async function changeMessagePin(message,panel=null){
    const cid=activeConversationId,user=currentUserId,revision=chatRevision;if(!message?.id||!cid||pinBusy)return;
    const valid=()=>revision===chatRevision&&user===currentUserId&&String(activeConversationId)===String(cid);
    const pinned=!message.is_pinned;
    if(!await dmConfirm(pinned?'Bu mesaj sohbetteki herkes için sabitlensin mi?':'Mesajın sabitlemesi herkes için kaldırılsın mı?'))return;
    if(!valid()||pinBusy)return;pinBusy=true;refreshSelectionBar();panel?.querySelectorAll('[data-pin-remove]').forEach(b=>b.disabled=true);
    try{await api().api('/conversations/'+encodeURIComponent(cid)+'/pins/'+Number(message.id),{method:pinned?'POST':'DELETE'});
      if(!valid())return;await refreshPinnedMessages();if(!valid())return;
      window.toast?.(pinned?'Mesaj sabitlendi.':'Sabitleme kaldırıldı.');
    }catch(e){if(valid()){const status=panel?.querySelector('[data-status]');if(status)status.textContent=e.message||'Sabitleme değiştirilemedi.';else window.toast?.(e.message||'Sabitleme değiştirilemedi.')}}
    finally{pinBusy=false;refreshSelectionBar();document.querySelector('[data-pinned-panel]')?.querySelectorAll('[data-pin-remove]').forEach(b=>b.disabled=false)}
  }
  function openGlobalMessageSearch(){
    installStarControls();const panel=messageActionPanel('Tüm mesajlarda ara');panel.dataset.globalSearch='';
    const content=panel.querySelector('[data-content]'),status=panel.querySelector('[data-status]'),user=currentUserId,authRevision=inboxAuthRevision;
    content.innerHTML='<p>Mesaj metninde ve dosya adında ara. Süreli mesajlar arama sonuçlarına dahil edilmez.</p><form data-global-form><label>Aranacak metin<input type="search" data-global-query minlength="2" maxlength="100" required autocomplete="off" placeholder="En az 2 karakter"></label><label>Mesaj türü<select data-global-kind><option value="all">Tümü</option><option value="text">Metin</option><option value="image">Fotoğraf</option><option value="voice">Sesli mesaj</option><option value="video">Video</option><option value="document">Belge</option></select></label><label>Kapsam<select data-global-scope><option value="all">Sohbetler ve Arşiv</option></select></label><button type="submit">Ara</button></form><div data-global-results></div><button type="button" data-global-more hidden>Daha fazla sonuç</button>';
    if(!document.getElementById('dm-global-search-style')){const style=document.createElement('style');style.id='dm-global-search-style';style.textContent='[data-global-search]{position:fixed;inset:0;z-index:100090;overflow:auto;overscroll-behavior:contain;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c)}[data-global-search] section{box-sizing:border-box;width:min(620px,100%);margin:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}[data-global-search] header{display:flex;justify-content:space-between;align-items:center;gap:10px}[data-global-search] button{min-height:44px;padding:9px 12px;border:1px solid var(--ui-line,#c8ae79);border-radius:12px;background:var(--ui-raised,#fffaf0);color:inherit;font:inherit}[data-global-search] label{display:block;margin:12px 0;font-size:12px}[data-global-search] input,[data-global-search] select{display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:6px;border:1px solid var(--ui-line,#c8ae79);border-radius:10px;background:var(--ui-raised,#fffaf0);color:inherit;font:inherit}[data-global-search] p{font-size:13px;line-height:1.5;overflow-wrap:anywhere}[data-global-more]{width:100%;margin-top:12px}';document.head.append(style)}
    const form=content.querySelector('form'),query=content.querySelector('[data-global-query]'),kind=content.querySelector('[data-global-kind]'),scope=content.querySelector('[data-global-scope]'),results=content.querySelector('[data-global-results]'),more=content.querySelector('[data-global-more]');
    if(vaultToken){const option=document.createElement('option');option.value='locked';option.textContent='Kilitli sohbetler';scope.append(option);if(inboxFolder==='locked')scope.value='locked'}
    let revision=0,cursor=null,busy=false,navigating=false;
    const valid=()=>panel.isConnected&&user===currentUserId&&authRevision===inboxAuthRevision;
    const clear=()=>{revision++;busy=false;cursor=null;results.replaceChildren();more.hidden=true;status.textContent='Aramak için Ara düğmesine dokun.'};
    const load=async(append=false)=>{
      if(!valid()||append&&busy)return;const q=query.value.trim();if(q.length<2){clear();status.textContent='En az 2 karakter yazın.';return}
      busy=true;const own=++revision;if(!append){cursor=null;results.replaceChildren()}more.hidden=true;status.textContent='Mesajlar aranıyor…';
      try{const data=await api().api('/message-search?q='+encodeURIComponent(q)+'&kind='+kind.value+'&scope='+scope.value+'&limit=30'+(append&&cursor?'&before='+cursor:''));
        if(!valid()||own!==revision)return;
        for(const item of asList(data,['items'])){const m=item.message,c=item.conversation;if(!m?.id||!c?.id||results.querySelector('[data-search-message="'+Number(m.id)+'"]'))continue;
          const card=document.createElement('article');card.className='dm-star-card';card.dataset.searchMessage=String(m.id);card.dataset.searchConversation=String(c.id);
          const title=document.createElement('b'),meta=document.createElement('small'),text=document.createElement('p'),open=document.createElement('button');title.textContent=c.name||'Sohbet';meta.textContent=(m.sender_nickname||'Kullanıcı')+' · '+messageTime(m.created_at)+(m.media_type?' · '+({image:'Fotoğraf',voice:'Sesli mesaj',video:'Video',document:'Belge'}[m.media_type]||'Medya'):'');const excerpt=String(m.text||'').replace(/^\[(?:Fotoğraf|Video|Belge)\][^\n]*\n/,'');text.textContent=m.media_name&&excerpt&&(excerpt!==m.text||excerpt.startsWith('…'))?m.media_name+'\n'+excerpt:m.media_name||m.text||'Mesaj';open.type='button';open.dataset.globalGoto='';open.textContent='Sohbette göster';card.append(title,meta,text,open);results.append(card);
          open.onclick=async()=>{if(!valid()||navigating)return;navigating=true;open.disabled=true;const chatVersion=chatRevision,searchVersion=revision;
            try{const details=api()?.conversation?await api().conversation(c.id):c;if(!valid()||chatVersion!==chatRevision||searchVersion!==revision)return;
              const info={...conversationInfo.get(String(c.id)),...c,...details};conversationInfo.set(String(c.id),info);const peer=asList(info.members,['members']).find(x=>String(x.user_id)!==String(user));panel.remove();await openRealChat(c.id,info.name||c.name||'Sohbet',c.type==='group'?'👥':c.type==='family'?'👪':'👤',c.type==='dm'?peer?.user_id:null);
              if(user===currentUserId&&authRevision===inboxAuthRevision&&String(activeConversationId)===String(c.id))await jumpToMessage(m.id);
            }catch(e){if(valid())status.textContent=e.message||'Sohbet açılamadı.'}finally{navigating=false;open.disabled=false}
          };
        }
        cursor=data.next_before;more.hidden=!data.has_more;status.textContent=results.children.length?results.children.length+' sonuç gösteriliyor.':'Bu aramada sonuç yok.';
      }catch(e){if(valid()&&own===revision)status.textContent=e.message||'Mesajlar aranamadı. Yeniden deneyin.'}finally{if(own===revision)busy=false}
    };
    query.oninput=clear;kind.onchange=scope.onchange=clear;form.onsubmit=e=>{e.preventDefault();load()};more.onclick=()=>load(true);status.textContent='Aramak için en az 2 karakter yazın.';query.focus();
  }
  function openStarredMessages(conversationId=null){
    installStarControls();const panel=messageActionPanel(conversationId?'Sohbetin yıldızlı mesajları':'Yıldızlı mesajlar');panel.dataset.starredPanel='';
    const content=panel.querySelector('[data-content]'),status=panel.querySelector('[data-status]'),user=currentUserId,authRevision=inboxAuthRevision;
    content.innerHTML='<p>Yıldızların yalnızca sana görünür. Mesaj silinir veya erişimin kalkarsa burada gösterilmez.</p><label>Mesaj, dosya veya sohbet ara<input type="search" data-star-query maxlength="100" autocomplete="off"></label><label>Tür<select data-star-kind><option value="all">Tümü</option><option value="text">Metin</option><option value="image">Fotoğraf</option><option value="voice">Ses</option><option value="video">Video</option><option value="document">Belge</option></select></label><label data-scope-label>Klasör<select data-star-scope><option value="all">Sohbetler ve Arşiv</option></select></label><button type="button" data-star-refresh>Yenile</button><div data-star-results></div><button type="button" data-star-more hidden>Daha fazla yıldızlı mesaj</button>';
    const query=content.querySelector('[data-star-query]'),kind=content.querySelector('[data-star-kind]'),scope=content.querySelector('[data-star-scope]'),results=content.querySelector('[data-star-results]'),more=content.querySelector('[data-star-more]');
    if(vaultToken){const locked=document.createElement('option');locked.value='locked';locked.textContent='Kilitli sohbetler';scope.append(locked);if(inboxFolder==='locked')scope.value='locked'}
    content.querySelector('[data-scope-label]').hidden=!!conversationId;
    let revision=0,cursor=null,timer=null,busy=false;const valid=()=>panel.isConnected&&user===currentUserId&&authRevision===inboxAuthRevision;
    const load=async(append=false)=>{
      if(append&&busy)return;busy=true;const own=++revision;if(!append){cursor=null;results.replaceChildren()}more.hidden=true;status.textContent='Yıldızlı mesajlar yükleniyor…';
      try{const data=await api().api('/message-stars?q='+encodeURIComponent(query.value.trim())+'&kind='+kind.value+'&scope='+scope.value+'&limit=30'+(conversationId?'&conversation_id='+encodeURIComponent(conversationId):'')+(append&&cursor?'&before='+cursor:''));
        if(!valid()||own!==revision)return;
        for(const item of asList(data,['items'])){
          const m=item.message,c=item.conversation;if(!m?.id||!c?.id||results.querySelector('[data-star-id="'+Number(item.star_id)+'"]'))continue;
          const card=document.createElement('article');card.className='dm-star-card';card.dataset.starId=String(item.star_id);card.dataset.starMessageId=String(m.id);card.dataset.starConversationId=String(c.id);
          const title=document.createElement('b');title.textContent=c.name||'Sohbet';const meta=document.createElement('small');meta.textContent=(m.sender_nickname||'Kullanıcı')+' · '+(Number.isNaN(new Date(m.created_at).getTime())?'':new Date(m.created_at).toLocaleString('tr-TR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}));const text=document.createElement('p');text.textContent=m.media_name||m.text||'Mesaj';const footer=document.createElement('footer'),open=document.createElement('button'),remove=document.createElement('button');open.type=remove.type='button';open.dataset.starGoto='';remove.dataset.starRemove='';open.textContent='Sohbette göster';remove.textContent='Yıldızı kaldır';footer.append(open,remove);card.append(title,meta,text,footer);results.append(card);
          open.onclick=async()=>{if(!valid())return;open.disabled=true;const chatVersion=chatRevision;try{const details=api()?.conversation?await api().conversation(c.id):c;if(!valid()||chatVersion!==chatRevision)return;const info={...conversationInfo.get(String(c.id)),...c,...details};conversationInfo.set(String(c.id),info);const peer=asList(info.members,['members']).find(x=>String(x.user_id)!==String(user));panel.remove();await openRealChat(c.id,info.name||c.name||'Sohbet',c.type==='group'?'👥':c.type==='family'?'👪':'👤',c.type==='dm'?peer?.user_id:null);if(user===currentUserId&&authRevision===inboxAuthRevision&&String(activeConversationId)===String(c.id))await jumpToMessage(m.id)}catch(e){if(valid())status.textContent=e.message||'Sohbet açılamadı.'}finally{open.disabled=false}};
          remove.onclick=async()=>{if(!valid())return;remove.disabled=true;try{await api().api('/message-stars/'+encodeURIComponent(c.id)+'/'+m.id,{method:'PUT',body:JSON.stringify({starred:false})});if(!valid())return;card.remove();if(String(activeConversationId)===String(c.id)){const body=$('chat')?.querySelector('.chatBody'),row=body?.querySelector('[data-message-id="'+Number(m.id)+'"]');if(row){appendMessageOnce(body,{...row._message,is_starred:false},row._mine);refreshSelectionBar()}}if(!results.children.length)status.textContent='Bu filtrede yıldızlı mesaj yok.'}catch(e){if(valid())status.textContent=e.message||'Yıldız kaldırılamadı.'}finally{remove.disabled=false}};
        }
        cursor=data.next_before;more.hidden=!data.has_more;status.textContent=results.children.length?'':'Bu filtrede yıldızlı mesaj yok.';
      }catch(e){if(valid()&&own===revision)status.textContent=e.message||'Yıldızlı mesajlar yüklenemedi.'}finally{if(own===revision)busy=false}
    };
    query.oninput=()=>{revision++;busy=false;clearTimeout(timer);results.replaceChildren();more.hidden=true;timer=setTimeout(()=>{if(valid())load()},250)};kind.onchange=scope.onchange=()=>{clearTimeout(timer);load()};more.onclick=()=>load(true);content.querySelector('[data-star-refresh]').onclick=()=>load();load();
  }
  const REACTION_EMOJIS=['👍','❤️','😂','😮','😢','🙏','🔥','👏'];
  const reactionJobs=new Set();
  function canForwardMessage(m){return !!m&&!m.poll&&!m.has_poll&&!m.gift_key&&!m.temporary&&!m.expires_at&&!m.protected_message}
  function closeMessageActions(){closeAttachmentPreview();document.querySelector('[data-message-action-panel]')?.remove()}
  function messageActionPanel(title){
    closeMessageActions();const panel=document.createElement('div');panel.className='dm-action-panel';panel.dataset.messageActionPanel='';
    panel.innerHTML='<section role="dialog" aria-modal="true"><header><h3></h3><button type="button" data-close aria-label="Kapat">×</button></header><div data-content></div><p data-status role="status" aria-live="polite"></p></section>';
    if(!document.getElementById('dm-pins-style')){const style=document.createElement('style');style.id='dm-pins-style';style.textContent='[data-pin-banner][hidden]{display:none!important}[data-pin-banner]{text-align:start;cursor:pointer;color:var(--ui-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:40px}.dm-pin-card{padding:14px;margin:12px 0;border:1px solid var(--ui-line);border-radius:14px;overflow-wrap:anywhere}.dm-pin-card p{white-space:pre-wrap}.dm-pin-card small{display:block;margin-top:8px;opacity:.75}.dm-pin-card footer{display:flex;gap:8px;flex-wrap:wrap}';document.head.append(style)}
    panel.querySelector('h3').textContent=title;panel.querySelector('section').setAttribute('aria-label',title);
    const previous=document.activeElement,close=()=>{panel.remove();previous?.focus?.()};panel.querySelector('[data-close]').onclick=close;
    panel.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not(:disabled),input,select,textarea')].filter(node=>!node.disabled&&!node.closest('[hidden]')),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};document.body.append(panel);panel.querySelector('[data-close]').focus();return panel;
  }
  async function setMessageReaction(row,emoji,button){
    const cid=activeConversationId,revision=chatRevision,user=currentUserId,m=row?._message;
    const job=[user,cid,m?.id,revision].join('|'),panel=document.querySelector('[data-message-action-panel]');
    if(!m||!cid||isSystemConversation()||reactionJobs.has(job))return;reactionJobs.add(job);if(button)button.disabled=true;
    try{const data=await api().api('/message-actions/'+encodeURIComponent(cid)+'/'+m.id+'/reaction',{method:'PUT',body:JSON.stringify({emoji})});
      if(revision!==chatRevision||user!==currentUserId)return;
      const body=$('chat')?.querySelector('.chatBody'),current=body?.querySelector('[data-message-id="'+Number(m.id)+'"]');
      if(current)appendMessageOnce(body,{...current._message,...data},current._mine);
      if(panel&&panel===document.querySelector('[data-message-action-panel]')){panel.remove();selectionBar?.querySelector('[data-clear-selected]')?.click()}
    }catch(e){if(revision===chatRevision&&user===currentUserId){const status=document.querySelector('[data-message-action-panel] [data-status]');if(status)status.textContent=e.message||'Tepki kaydedilemedi.';else window.toast?.(e.message||'Tepki kaydedilemedi.')}}finally{reactionJobs.delete(job);if(button)button.disabled=false}
  }
  function openReactionPicker(){
    const row=selectedMessages.size===1?[...selectedMessages][0]:null;if(!row||isSystemConversation())return;
    const panel=messageActionPanel('Mesaja tepki ver'),content=panel.querySelector('[data-content]');content.className='dm-emoji-picker';
    for(const emoji of REACTION_EMOJIS){const b=document.createElement('button');b.type='button';b.textContent=emoji;b.setAttribute('aria-label',emoji+' tepkisi');b.onclick=()=>{content.querySelectorAll('button').forEach(x=>x.disabled=true);setMessageReaction(row,emoji,b).finally(()=>content.querySelectorAll('button').forEach(x=>x.disabled=false))};content.append(b)}
    const remove=document.createElement('button');remove.type='button';remove.textContent='Tepkimi kaldır';remove.onclick=()=>setMessageReaction(row,null,remove);content.append(remove);
  }
  function openForwardPicker(){
    const messages=[...selectedMessages].map(row=>row._message),source=activeConversationId,revision=chatRevision,user=currentUserId;
    if(!source||!messages.length||messages.length>10||messages.some(m=>!canForwardMessage(m))||isSystemConversation())return;
    const panel=messageActionPanel('Mesaj ilet'),content=panel.querySelector('[data-content]'),status=panel.querySelector('[data-status]');
    content.innerHTML='<p data-summary></p><label>Sohbet ara<input data-query type="search" maxlength="100" autocomplete="off"></label><label>Klasör<select data-folder><option value="inbox">Sohbetler</option><option value="archive">Arşiv</option></select></label><div data-targets></div><button type="button" data-more hidden>Daha fazla sohbet</button><p data-chosen></p><button type="button" data-send disabled>İlet</button>';
    content.querySelector('[data-summary]').textContent=messages.length+' mesaj iletilecek. Kaynak sohbet ve gönderen bilgisi paylaşılmaz. Süreli mesajlar ve hediyeler iletilemez.';
    const query=content.querySelector('[data-query]'),folder=content.querySelector('[data-folder]'),targets=content.querySelector('[data-targets]'),send=content.querySelector('[data-send]'),more=content.querySelector('[data-more]');
    if(vaultToken){const option=document.createElement('option');option.value='locked';option.textContent='Kilitli';folder.append(option)}
    let requestRevision=0,offset=0,timer=null,target=null,key=null,busy=false;
    const valid=()=>panel.isConnected&&revision===chatRevision&&user===currentUserId;
    const newKey=()=>window.crypto?.randomUUID?.()||('forward_'+Date.now()+'_'+Math.random().toString(36).slice(2));
    const load=async(append=false)=>{
      const own=++requestRevision;if(!append){offset=0;targets.replaceChildren();target=null;key=null;send.disabled=true;content.querySelector('[data-chosen]').textContent=''}more.hidden=true;status.textContent='Sohbetler yükleniyor…';
      try{const page=asList(await api().api('/conversations?folder='+folder.value+'&q='+encodeURIComponent(query.value.trim())+'&limit=51&offset='+offset),['conversations','items','data']);
        if(!valid()||own!==requestRevision)return;
        const names=await Promise.all(page.slice(0,50).map(c=>resolveParticipant(c)));if(!valid()||own!==requestRevision)return;
        page.slice(0,50).forEach((c,i)=>{if(String(c.id)===String(source)||c.type==='welcome')return;const b=document.createElement('button');b.type='button';b.className='dm-forward-target';b.dataset.forwardTarget=String(c.id);b.textContent=c.type==='group'||c.type==='family'?c.name||'Sohbet':names[i]?.nickname||c.name||'Kullanıcı';b.setAttribute('aria-pressed',String(target?.id===c.id));b.onclick=()=>{target=c;key=newKey();targets.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));content.querySelector('[data-chosen]').textContent='Seçilen: '+b.textContent;send.disabled=false};targets.append(b)});
        offset+=50;more.hidden=page.length<=50;status.textContent=targets.children.length?'':'Bu klasörde uygun sohbet bulunamadı.';
      }catch(e){if(valid()&&own===requestRevision)status.textContent=e.message||'Sohbetler yüklenemedi.'}
    };
    query.oninput=()=>{requestRevision++;clearTimeout(timer);target=null;send.disabled=true;targets.replaceChildren();more.hidden=true;content.querySelector('[data-chosen]').textContent='';timer=setTimeout(()=>{if(valid())load()},250)};folder.onchange=()=>{clearTimeout(timer);load()};more.onclick=()=>load(true);
    send.onclick=async()=>{if(busy||!target||!valid())return;busy=true;const destination=target.id,requestKey=key;
      content.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);status.textContent='İletiliyor…';
      try{await api().api('/message-actions/'+encodeURIComponent(source)+'/forward',{method:'POST',body:JSON.stringify({message_ids:messages.map(m=>m.id),target_conversation_id:destination,request_key:requestKey})});
        if(!valid())return;panel.remove();selectionBar?.querySelector('[data-clear-selected]')?.click();loadConversations();window.toast?.('Mesajlar iletildi.');
      }catch(e){if(valid())status.textContent=e.message||'Mesajlar iletilemedi. Tekrar deneyebilirsin.'}finally{busy=false;if(valid()){content.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);send.disabled=!target}}
    };load();
  }
  function canEditMessage(row){
    const m=row?._message;
    return !!m&&!m.poll&&!m.has_poll&&!!api()?.editMessage&&String(m.sender_id)===String(currentUserId)&&!m.media_type&&!m.gift_key&&!isSystemConversation()&&Number.isFinite(new Date(m.created_at).getTime())&&Date.now()-new Date(m.created_at).getTime()<15*60*1000;
  }
  function clearMessageMode(restore=true){
    const old=messageMode;messageMode=null;
    const chat=$('chat'),input=chat?.querySelector('#chatInput');
    if(restore&&old?.kind==='edit'&&input)input.value=old.savedDraft;
    const bar=chat?.querySelector('[data-message-mode]');if(bar){bar.hidden=true;bar.querySelector('[data-mode-text]').textContent=''}
    chat?.querySelectorAll('[data-mode-disabled]').forEach(button=>{button.disabled=false;delete button.dataset.modeDisabled});
    const send=chat?.querySelector('.compose .primary');if(send)send.textContent=send.dataset.normalLabel||'Gönder';
  }
  function startMessageMode(kind,row=[...selectedMessages][0]){
    if(!row?._message||!activeConversationId||isSystemConversation())return;
    const chat=$('chat'),input=chat?.querySelector('#chatInput');
    if(!input||chat.querySelector('.compose')?.hidden){window.toast?.('Bu sohbette şu anda mesaj gönderemezsiniz.');return}
    if(voiceRecorder?.isActive()){window.toast?.('Önce ses kaydını gönderin veya silin.');return}
    if(kind==='edit'&&!canEditMessage(row)){window.toast?.('Yalnızca kendi metin mesajınızı ilk 15 dakika içinde düzenleyebilirsiniz.');return}
    clearMessageMode();
    messageMode={kind,conversationId:String(activeConversationId),message:{...row._message},savedDraft:input.value};
    chat.querySelectorAll('.compose [data-dm-photo],.compose [data-dm-voice],.compose [data-dm-gift]').forEach(button=>{if(!button.disabled){button.dataset.modeDisabled='';button.disabled=true}});
    const bar=chat.querySelector('[data-message-mode]');bar.hidden=false;bar.querySelector('[data-mode-label]').textContent=kind==='edit'?'Mesajı düzenle':(row._message.sender_nickname||'Mesaj')+' kişisine yanıt';
    bar.querySelector('[data-mode-text]').textContent=row._message.media_type==='image'?'Fotoğraf':row._message.media_type==='voice'?'Sesli mesaj':String(row._message.media_name||row._message.text||'').slice(0,180);
    if(kind==='edit'){input.value=row._message.text;chat.querySelector('.compose .primary').textContent='Kaydet'}
    selectedMessages.forEach(r=>r.classList.remove('dm-selected'));selectedMessages.clear();allMessagesSelected=false;messageSelectionMode=false;refreshSelectionBar();input.focus();
  }
  function updateHistoryButton(){
    const old=$('chat')?.querySelector('[data-older-messages]');if(old){old.hidden=!api()?.messageHistory;old.disabled=historyBusy||!historyCursor;old.textContent=historyBusy?'Yükleniyor…':historyCursor?'Eski mesajları yükle':'Sohbetin başlangıcı'}
    const newest=$('chat')?.querySelector('[data-newest-messages]');if(newest)newest.hidden=!historyWindow;
  }
  async function loadOlderMessages(){
    if(historyBusy||!historyCursor||!activeConversationId||!api()?.messageHistory)return;
    const id=activeConversationId,revision=chatRevision,cursor=historyCursor,body=$('chat').querySelector('.chatBody');historyBusy=true;updateHistoryButton();
    const oldHeight=body.scrollHeight,oldTop=body.scrollTop;
    try{const page=await api().messageHistory(id,cursor);if(revision!==chatRevision||String(activeConversationId)!==String(id))return;
      const fragment=document.createDocumentFragment();for(const m of asList(page,['messages']))if(!body.querySelector('[data-message-id="'+String(m.id)+'"]'))fragment.append(renderMessage(m,String(m.sender_id)===String(currentUserId)));
      body.prepend(fragment);historyCursor=page.has_more?page.next_before:null;body.scrollTop=oldTop+body.scrollHeight-oldHeight;
    }catch(e){if(revision===chatRevision)window.toast?.(e.message||'Eski mesajlar yüklenemedi.')}finally{if(revision===chatRevision){historyBusy=false;updateHistoryButton()}}
  }
  async function jumpToMessage(messageId){
    const id=activeConversationId,revision=chatRevision,body=$('chat')?.querySelector('.chatBody');if(!id||!body)return;
    let row=body.querySelector('[data-message-id="'+String(messageId)+'"]');
    if(!row&&api()?.messageHistory){
      try{const page=await api().messageHistory(id,null,messageId);if(revision!==chatRevision||String(activeConversationId)!==String(id))return;
        selectedMessages.clear();allMessagesSelected=false;messageSelectionMode=false;refreshSelectionBar();releaseMediaUrls(body);body.replaceChildren();
        for(const m of asList(page,['messages']))body.append(renderMessage(m,String(m.sender_id)===String(currentUserId)));
        historyWindow=true;historyCursor=page.has_more?page.next_before:null;updateHistoryButton();row=body.querySelector('[data-message-id="'+String(messageId)+'"]');
      }catch(e){window.toast?.(e.message||'Mesaj artık görüntülenemiyor.');return}
    }
    if(row){row.scrollIntoView?.({block:'center',behavior:'smooth'});row.classList.add('dm-message-highlight');setTimeout(()=>row.classList.remove('dm-message-highlight'),2000)}
    else window.toast?.('Mesaj artık görüntülenemiyor.');
  }
  function openMessageSearch(){
    if(!activeConversationId||!api()?.searchMessages){window.toast?.('Mesaj arama için uygulamayı yenileyin.');return}
    document.querySelector('[data-dm-search-panel]')?.remove();closeSharedMedia();
    const id=activeConversationId,revision=chatRevision,previous=document.activeElement;
    const overlay=document.createElement('div');overlay.className='dm-search-panel';overlay.dataset.dmSearchPanel='';
    overlay.innerHTML='<section role="dialog" aria-modal="true" aria-label="Sohbette mesaj ara"><header><h3>Sohbette ara</h3><button type="button" data-close aria-label="Kapat">×</button></header><form><label>Aranacak kelime<input name="q" required minlength="2" maxlength="100" autocomplete="off" type="search"></label><button type="submit">Ara</button></form><p data-status role="status"></p><div data-results></div></section>';
    const close=()=>{overlay.remove();previous?.focus?.()};overlay.querySelector('[data-close]').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};overlay.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button:not(:disabled),input')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
    document.body.append(overlay);const form=overlay.querySelector('form'),results=overlay.querySelector('[data-results]'),status=overlay.querySelector('[data-status]');let requestRevision=0,query='';
    const load=async(before=null)=>{const own=++requestRevision;status.textContent='Aranıyor…';
      try{const page=await api().searchMessages(id,query,before);if(own!==requestRevision||revision!==chatRevision||!overlay.isConnected)return;
        if(!before)results.replaceChildren();results.querySelector('[data-more]')?.remove();
        for(const m of asList(page,['messages'])){const button=document.createElement('button');button.type='button';button.className='dm-search-result';const label=document.createElement('small');label.textContent=(m.sender_nickname||'Kullanıcı')+' · '+messageTime(m.created_at);const text=document.createElement('span');text.textContent=m.text;button.append(label,text);button.onclick=()=>{close();jumpToMessage(m.id)};results.append(button)}
        if(page.has_more){const more=document.createElement('button');more.type='button';more.dataset.more='';more.textContent='Daha eski sonuçlar';more.onclick=()=>load(page.next_before);results.append(more)}status.textContent=results.children.length?'':'Eşleşen mesaj bulunamadı.';
      }catch(e){if(own===requestRevision&&overlay.isConnected)status.textContent=e.message||'Arama yapılamadı.'}
    };
    form.elements.q.oninput=()=>{requestRevision++;status.textContent='';results.replaceChildren()};form.onsubmit=e=>{e.preventDefault();query=form.elements.q.value.trim();if(query.length>=2)load()};form.elements.q.focus();
  }
  function installMessageWorkbench(chat){
    if(chat.querySelector('[data-message-workbench]'))return;
    const style=document.createElement('style');style.textContent=`

      .dm-attachment-choices{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.dm-attachment-choices small{grid-column:1/-1;font-size:10px;line-height:1.5;color:var(--ui-muted,var(--ui-ink))}
      .dm-video-message{width:min(290px,68vw)}.dm-video-message video{display:block;width:100%;min-height:130px;max-height:320px;background:#111;border-radius:14px;object-fit:contain}.dm-attachment-action{min-height:38px;padding:9px 12px;margin-top:8px;border:1px solid var(--ui-line);border-radius:11px;background:var(--ui-raised);color:var(--ui-ink);font-size:12px;max-width:100%}.dm-attachment-action:disabled{opacity:.65}.dm-document-message{display:grid;gap:5px;max-width:min(280px,67vw);padding:13px;border:1px solid var(--ui-line);border-radius:14px;background:var(--ui-raised);color:var(--ui-ink);overflow-wrap:anywhere}.dm-document-message b{font-size:13px}.dm-document-message small{font-size:11px;opacity:.75}
      .dm-message-workbench [data-upload-status]{width:100%;font-size:11px;color:var(--ui-gold,#b98c46)}
      .dm-shared-panel{position:fixed;inset:0;z-index:100080;overflow:auto;overscroll-behavior:contain;background:var(--ui-panel);color:var(--ui-ink)}.dm-shared-panel section{width:min(680px,100%);box-sizing:border-box;margin:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}.dm-shared-panel header{display:flex;justify-content:space-between;align-items:center;gap:12px}.dm-shared-panel header small{font-size:10px;letter-spacing:2px;color:var(--ui-gold,#b98c46)}.dm-shared-panel h3{margin:6px 0;font-size:25px}.dm-shared-panel p{font-size:12px;line-height:1.5}.dm-shared-panel button{min-height:38px;padding:8px 11px;border:1px solid var(--ui-line);border-radius:11px;background:var(--ui-raised);color:var(--ui-ink);font:inherit;font-size:12px}.dm-shared-panel nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin:18px 0}.dm-shared-panel nav button{padding:9px 3px;font-size:11px}.dm-shared-panel [aria-selected=true]{background:var(--ui-gold,#b98c46);color:#20180e;border-color:var(--ui-gold,#b98c46);font-weight:750}.dm-shared-panel form{display:flex;gap:8px;align-items:end;margin-bottom:14px}.dm-shared-panel label{flex:1;min-width:0;font-size:11px}.dm-shared-panel input{display:block;box-sizing:border-box;width:100%;padding:11px;margin-top:6px;border:1px solid var(--ui-line);border-radius:11px;background:var(--ui-raised);color:var(--ui-ink);font:inherit}.dm-shared-item{display:grid;grid-template-columns:62px minmax(0,1fr);gap:12px;padding:14px 0;border-bottom:1px solid var(--ui-line)}.dm-shared-art{width:62px;height:62px;display:grid;place-items:center;border-radius:14px;background:var(--ui-raised);color:var(--ui-gold,#b98c46);font-size:25px;overflow:hidden}.dm-shared-art img{width:100%;height:100%;object-fit:cover}.dm-shared-info{min-width:0;overflow-wrap:anywhere}.dm-shared-info>b{display:block;font-size:13px}.dm-shared-info>small{display:block;font-size:10px;margin-top:5px;opacity:.75;line-height:1.5}.dm-shared-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.dm-shared-actions button{font-size:11px}.dm-shared-item video{grid-column:1/-1;width:100%;max-height:320px;background:#111;border-radius:13px}.dm-shared-panel [hidden]{display:none!important}
      .dm-message-workbench{display:flex;gap:8px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--ui-line);background:var(--ui-panel);flex:none}
      .dm-message-workbench button{min-height:36px;border:1px solid var(--ui-line);border-radius:11px;padding:7px 10px;background:var(--ui-raised);color:var(--ui-ink);font:inherit;font-size:11px}
      .dm-message-workbench button:disabled{opacity:.6}.dm-message-workbench [hidden]{display:none!important}
      .dm-compose-mode{display:flex;align-items:center;gap:10px;padding:9px 12px;border-left:3px solid var(--ui-gold,#b98c46);background:var(--ui-raised);color:var(--ui-ink);flex:none}.dm-compose-mode[hidden]{display:none!important}.dm-compose-mode>div{flex:1;min-width:0}.dm-compose-mode b,.dm-compose-mode small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dm-compose-mode small{font-size:11px;margin-top:4px}.dm-compose-mode button{min-width:36px;min-height:36px;border:0;border-radius:9px;background:var(--ui-panel);color:var(--ui-ink);font-size:20px}
      #chat .dm-reply-quote{display:block;max-width:100%;width:100%;text-align:left;padding:8px 10px;border:0;border-left:3px solid var(--ui-gold,#b98c46);border-radius:8px;background:color-mix(in srgb,var(--ui-gold,#b98c46) 12%,var(--ui-panel));color:var(--ui-ink);margin-bottom:7px;overflow-wrap:anywhere}.dm-reply-quote b,.dm-reply-quote span{display:block;font-size:11px}.dm-reply-quote span{margin-top:4px;white-space:pre-wrap}.dm-reply-quote:disabled{opacity:.65}
      #chat .dm-select-tools{flex-wrap:wrap;height:auto}#chat .dm-select-tools button[data-react-selected],#chat .dm-select-tools button[data-forward-selected]{width:auto;font-size:11px;padding:0 8px}
      .dm-forward-label{display:block;font-size:10px;opacity:.7;margin-bottom:6px}.dm-reactions{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.dm-reactions button{padding:5px 8px;min-height:32px;border:1px solid var(--ui-line);border-radius:14px;background:var(--ui-panel);color:var(--ui-ink)}.dm-reactions button[aria-pressed=true]{border-color:var(--ui-gold,#b98c46);box-shadow:inset 0 0 0 1px var(--ui-gold,#b98c46)}
      .dm-action-panel{position:fixed;inset:0;z-index:100090;overflow:auto;background:var(--ui-panel,#fffaf0);color:var(--ui-ink,#30271c);overscroll-behavior:contain}.dm-action-panel section{box-sizing:border-box;width:min(620px,100%);margin:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}.dm-action-panel header{display:flex;justify-content:space-between;align-items:center;gap:10px}.dm-action-panel button{min-height:44px;border:1px solid var(--ui-line,#c8ae79);border-radius:12px;padding:9px 12px;background:var(--ui-raised,#fffaf0);color:inherit;font:inherit}.dm-action-panel label{display:block;font-size:12px;margin:12px 0}.dm-action-panel input,.dm-action-panel select{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:12px;border:1px solid var(--ui-line);border-radius:10px;background:var(--ui-raised);color:inherit;font:inherit}.dm-action-panel p{font-size:13px;overflow-wrap:anywhere}.dm-action-panel .dm-forward-target{display:block;width:100%;text-align:left;margin:8px 0;overflow-wrap:anywhere}.dm-forward-target[aria-pressed=true]{border:2px solid var(--ui-gold,#b98c46)}.dm-emoji-picker{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:20px}.dm-emoji-picker button{font-size:24px}.dm-emoji-picker button:last-child{grid-column:1/-1;font-size:14px}
      #chat .dm-select-tools button[data-reply-selected],#chat .dm-select-tools button[data-edit-selected]{width:auto;font-size:11px;padding:0 8px}.dm-edited{opacity:.7}.dm-message-highlight{outline:2px solid var(--ui-gold,#b98c46)!important}
      .dm-search-panel{position:fixed;inset:0;z-index:100070;background:var(--ui-panel);color:var(--ui-ink);overflow:auto;overscroll-behavior:contain}.dm-search-panel section{width:min(620px,100%);box-sizing:border-box;margin:auto;padding:18px 16px calc(24px + env(safe-area-inset-bottom))}.dm-search-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px}.dm-search-panel form{display:flex;align-items:end;gap:10px;margin:16px 0}.dm-search-panel label{flex:1;min-width:0;font-size:12px}.dm-search-panel input{display:block;width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-raised);color:var(--ui-ink);font:inherit}.dm-search-panel button{min-height:40px;padding:9px 12px;border:1px solid var(--ui-line);border-radius:11px;background:var(--ui-raised);color:var(--ui-ink);font:inherit}.dm-search-result{display:block;width:100%;text-align:left;margin:10px 0;overflow-wrap:anywhere}.dm-search-result small,.dm-search-result span{display:block}.dm-search-result small{color:var(--ui-gold,#b98c46);margin-bottom:6px;font-size:11px}.dm-search-result span{white-space:pre-wrap;font-size:13px}
      @media(max-width:360px){#chat .dm-select-tools{gap:4px}#chat .dm-select-tools button{width:30px;height:32px;font-size:14px}#chat .dm-select-tools [data-selected-count]{font-size:9px!important}}
    `;document.head.append(style);
    const toolbar=document.createElement('nav');toolbar.className='dm-message-workbench';toolbar.dataset.messageWorkbench='';toolbar.setAttribute('aria-label','Sohbet araçları');toolbar.innerHTML='<button type="button" data-older-messages>Eski mesajları yükle</button><button type="button" data-newest-messages hidden>En yeni mesajlar</button><button type="button" data-search-messages>Sohbette ara</button><button type="button" data-shared-messages>Paylaşılanlar</button><button type="button" data-starred-messages>Yıldızlılar</button><button type="button" data-pinned-messages>Sabitlenenler</button><button type="button" data-chat-notifications>Bildirimler</button><button type="button" data-create-poll hidden>Anket oluştur</button><small data-upload-status role="status" hidden></small>';
    chat.querySelector('.chatBody').before(toolbar);toolbar.querySelector('[data-older-messages]').onclick=loadOlderMessages;toolbar.querySelector('[data-search-messages]').onclick=openMessageSearch;toolbar.querySelector('[data-shared-messages]').onclick=openSharedMedia;toolbar.querySelector('[data-starred-messages]').onclick=()=>openStarredMessages(activeConversationId);toolbar.querySelector('[data-chat-notifications]').onclick=()=>openNotificationSettings(activeConversationId);toolbar.querySelector('[data-create-poll]').onclick=openCreatePoll;toolbar.querySelector('[data-pinned-messages]').onclick=openPinnedMessages;
    toolbar.querySelector('[data-newest-messages]').onclick=()=>{if(activeConversationId)openRealChat(activeConversationId,chat.querySelector('.chatHead b')?.textContent||'Sohbet','',window.__erisActiveDmUserId)};
    const mode=document.createElement('div');mode.className='dm-compose-mode';mode.dataset.messageMode='';mode.hidden=true;mode.innerHTML='<div><b data-mode-label></b><small data-mode-text></small></div><button type="button" aria-label="Yanıtı veya düzenlemeyi iptal et">×</button>';mode.querySelector('button').onclick=()=>clearMessageMode();chat.querySelector('.compose').before(mode);
    const send=chat.querySelector('.compose .primary');if(send)send.dataset.normalLabel=send.textContent||'Gönder';
    updateHistoryButton();
  }

  function bindSender(chat) {
    const input = chat.querySelector('.compose #chatInput, .compose input:not([type=range])');
    const send = chat.querySelector('.compose .primary');
    if (!send || send.dataset.realBound) return;
    send.dataset.realBound = '1';
    send.onclick = async () => {
      const id = activeConversationId,revision=chatRevision;
      const text = input?.value?.trim();
      const body = chat.querySelector('.chatBody');
      if (!id || !text || !body) return;
      try {
        send.disabled=true;
        const mode=messageMode&&messageMode.conversationId===String(id)?messageMode:null;
        const m=mode?.kind==='edit'?await api().editMessage(id,mode.message.id,text,mode.message.text):await sendMessage(id,text,mode?.kind==='reply'?mode.message.id:null);
        if(revision!==chatRevision||String(activeConversationId)!==String(id))return;
        appendMessageOnce(body,m,true);
        if(messageMode===mode){if(mode?.kind==='edit'&&input.value.trim()!==text)mode.message={...mode.message,...m};else clearMessageMode(mode?.kind==='edit')}
        if(mode?.kind!=='edit'&&input.value.trim()===text)input.value='';
        drafts.set(String(id),input.value);
        body.scrollTop = body.scrollHeight;
      } catch (e) {
        if (/hediye ile kısıtlamış|hediyesi gerekli/i.test(String(e.message||''))) { window.toast?.(e.message); openGiftSheet(); return; }
        window.toast?.(e.message || 'Mesaj gönderilemedi.');
      }finally{send.disabled=false}
    };
    input?.removeAttribute('onkeydown');
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();if(!send.disabled)send.click()}};
  }

  async function createConversation(participantId, participantName = 'Kullanıcı') {
    if (!participantId || !api()?.createConversation) return null;
    const conversation = await api().createConversation(participantId); window.__erisActiveDmUserId = participantId;
    const id = conversation?.id || conversation?.conversation_id || conversation?.conversation?.id;
    if (id) {
      await loadConversations();
      const participant = await resolveParticipant(conversation);
      const name = participant.nickname || participant.name || participantName;
      const avatar = avatarValue(participant.avatar_asset || participant.avatar_url || participant.avatar, name.slice(0, 1).toUpperCase());
      openRealChat(id, name, avatar, participantId);
    }
    return conversation;
  }

  async function openRealChat(id, name, avatar = '', participantId = window.__erisActiveDmUserId) {
    const chat = $('chat');
    const body = chat?.querySelector('.chatBody');
    if (!chat || !body || !api()?.messages) return;
    const input=chat.querySelector('#chatInput');
    if(activeConversationId){drafts.set(String(activeConversationId),messageMode?.kind==='edit'?messageMode.savedDraft:(input?.value||''))}
    document.querySelector('[data-attachment-chooser]')?.remove();
    cancelVoiceRecording();closeMessageActions();clearMessageMode(false);historyCursor=null;historyBusy=false;historyWindow=false;document.querySelector('[data-dm-search-panel]')?.remove();closeSharedMedia();
    if(input)input.value=drafts.get(String(id))||'';
    const revision=++chatRevision;chat.dataset.groupWriteBlocked='0';chat.dataset.pinManage='0';chat.querySelector('[data-pin-banner]')?.remove();const pinsButton=chat.querySelector('[data-pinned-messages]');if(pinsButton)pinsButton.textContent='Sabitlenenler';
    activeConversationId = id;
    const info=conversationInfo.get(String(id));
    const isGroup=info?.type==='group'||String(id).startsWith('grp_');
    const kind=info?.type||(isGroup?'group':isSystemConversation(id)?'welcome':/ aile sohbeti$/i.test(String(name||''))?'family':'dm');
    // Header identity belongs to this conversation, never to the previous DM.
    chat.dataset.conversationId=String(id);
    chat.dataset.conversationType=kind;
    participantId=kind==='dm'?(participantId||null):null;
    window.__erisActiveDmUserId = participantId;
    chat.querySelectorAll('.chatHead .ava,.chatHead b').forEach(el=>{
      el.removeAttribute('data-user-id');
      if(el.title==='Profili aç')el.removeAttribute('title');
    });
    selectedMessages.clear();allMessagesSelected=false;messageSelectionMode=false;refreshSelectionBar();
    chat.classList.remove('eris-floating-dm');
    chat.classList.add('show');
    const title = chat.querySelector('.chatHead b');
    if (title) {
      title.textContent = name;window.ErisRoleBadges?.bind(title,participantId);
      title.onclick=isGroup?()=>openGroupManagement(id):null;
      title.onkeydown=isGroup?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGroupManagement(id)}}:null;
      title.style.cursor=isGroup?'pointer':'';
      if(isGroup){title.setAttribute('role','button');title.tabIndex=0;title.setAttribute('aria-label',name+' · Grup menüsü');}
      else{title.removeAttribute('role');title.removeAttribute('tabindex');title.removeAttribute('aria-label');}
    }
    const headerAvatar=chat.querySelector('.chatHead .ava');
    if(headerAvatar){
      headerAvatar.onclick=isGroup?()=>openGroupManagement(id):null;
      headerAvatar.onkeydown=isGroup?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGroupManagement(id)}}:null;
      headerAvatar.style.cursor=isGroup?'pointer':'';
      if(isGroup){headerAvatar.setAttribute('role','button');headerAvatar.tabIndex=0;headerAvatar.setAttribute('aria-label',name+' · Grup menüsü')}
      else{headerAvatar.removeAttribute('role');headerAvatar.removeAttribute('tabindex');headerAvatar.removeAttribute('aria-label')}
    }
    installChatTools(chat);
    const close=chat.querySelector('.chatHead>.close');if(close&&!close.dataset.voiceCloseBound){close.dataset.voiceCloseBound='';close.addEventListener('click',()=>{cancelVoiceRecording();closeAttachmentPreview();releaseMediaUrls(chat)})}
    setUploadStatus(mediaUploadsInFlight.has(String(id))?'Dosya gönderiliyor…':'');
    syncChatCompose(chat);
    chat.classList.toggle('dm-system-conversation', isSystemConversation());
    const subtitle = chat.querySelector('.chatHead small');
    if (subtitle) {
      if (!subtitle.dataset.normalDmLabel) subtitle.dataset.normalDmLabel = subtitle.textContent;
      subtitle.textContent = isSystemConversation() ? 'Resmî sistem mesajları' : subtitle.dataset.normalDmLabel;
    }
    window.ErisCalls?.syncChat?.();
    const compose=chat.querySelector('.compose');
    if(compose){compose.hidden=isSystemConversation();compose.style.display=isSystemConversation()?'none':'';compose.querySelector('[data-dm-gift]')?.toggleAttribute('hidden',/ aile sohbeti$/i.test(name)||isSystemConversation()||isGroup);}
    const headAvatar=chat.querySelector('.chatHead .ava');
    if(info?.type==='family'||isGroup)renderConversationAvatar(headAvatar,info,isGroup?'👥':'👪');
    else renderAvatar(headAvatar,isSystemConversation()?SYSTEM_AVATAR:avatar,name?.slice(0,1)?.toUpperCase(),isSystemConversation()?'':asList(info?.members,['members']).find(m=>String(m.user_id)!==String(currentUserId))?.frame_asset);
    if(!info && !participantId && !isSystemConversation() && api().conversation){
      api().conversation(id).then(details=>{
        conversationInfo.set(String(id),details);
        if(revision!==chatRevision)return;
        if(details.type==='family'||details.type==='group')renderConversationAvatar(headAvatar,details,details.type==='group'?'👥':'👪');
      }).catch(()=>{});
    }
    document.getElementById('eris-required-gift')?.remove();
    if(participantId && !isSystemConversation() && !/ aile sohbeti$/i.test(name))
      requiredGift(id,participantId).catch(e=>console.warn('Gift restriction',e));

    releaseMediaUrls(body);body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Mesajlar yükleniyor…</div>';
    try {
      const payload = api().messageHistory?await api().messageHistory(id):await api().messages(id);
      if(revision!==chatRevision || String(activeConversationId)!==String(id))return;
      const messages = asList(payload, ['messages', 'items', 'data']);
      historyCursor=payload?.has_more?payload.next_before:null;updateHistoryButton();
      body.innerHTML = '';
      if (!messages.length) body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Henüz mesaj yok.</div>';
      messages.forEach(m => {
        const senderId = m.sender_id ?? m.user_id;
        const mine = isSystemConversation() ? false : (typeof m.is_mine === 'boolean' ? m.is_mine : String(senderId) === String(currentUserId));
        body.appendChild(renderMessage(m, mine));
      });
      refreshSelectionBar();
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      console.warn('[LidyaChat] messages unavailable', e);
      if(revision!==chatRevision)return;
      body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Konuşma yüklenemedi.</div>';
      if(/kilitli sohbet/i.test(String(e.message||''))){
        const status=await api().api('/me/dm-vault').catch(()=>null);
        if(status?.configured && await unlockFolder().catch(error=>{window.toast?.(error.message);return false})){
          openRealChat(id,name,avatar,participantId).catch(()=>{});return;
        }
      }
    }
    bindSender(chat);
    refreshPinnedMessages();
    if(isGroup)syncGroupState(id);
    window.ErisPrivateDM?.open?.(id, chat);
  }

  async function sendMessage(id, text,replyToId=null) {
    if (isSystemConversation(id)) throw new Error('Bu sistem sohbetine yanıt gönderilemez.');
    if (!id || !text?.trim() || !api()?.sendMessage) throw new Error('Geçerli konuşma gerekli.');
    if(textSends.has(String(id)))return textSends.get(String(id));
    const task=(async()=>{const message=await api().sendMessage(id,text.trim(),replyToId);
      if(String(activeConversationId)===String(id))appendMessageOnce(document.querySelector('#chat .chatBody'),message,true);
      window.ErisPrivateDM?.sent?.(id);
      return message;})();
    textSends.set(String(id),task);
    try{return await task}finally{textSends.delete(String(id))}
  }
  async function handleRealtimeMessage(event) {
    const data = event?.detail;
    if(data?.type==='dm_poll_updated'){const row=$('chat')?.querySelector('.chatBody [data-message-id="'+Number(data.message_id)+'"]');if(String(activeConversationId)===String(data.conversation_id)&&row)refreshPollMessage(row);return}
    if(data?.type==='dm_reactions_updated'){
      const cid=String(data.conversation_id),revision=chatRevision,mid=Number(data.message_id),body=$('chat')?.querySelector('.chatBody');
      if(String(activeConversationId)!==cid||!body?.querySelector('[data-message-id="'+mid+'"]'))return;
      try{const metadata=await api().api('/message-actions/'+encodeURIComponent(cid)+'/'+mid+'/metadata');if(revision!==chatRevision||String(activeConversationId)!==cid)return;const row=body.querySelector('[data-message-id="'+mid+'"]');if(row)appendMessageOnce(body,{...row._message,...metadata},row._mine)}catch{}return;
    }
    if(data?.type==='dm_message_updated'){if(String(activeConversationId||'')===String(data.conversation_id))reconcileChat();loadConversations();return}
    if (data?.type === 'dm_read' && data.conversation_id) {
      if (String(activeConversationId||'') !== String(data.conversation_id)) return;
      refreshMessageInfo();
      if($('chat')?.dataset.conversationType!=='dm'){reconcileChat();return}
      document.querySelectorAll('#chat .bubble.me[data-message-id]').forEach(row=>{if(Number(row.dataset.messageId)<=Number(data.read_up_to||0)){row._message={...row._message,is_read:true,read_count:1,recipient_count:1};renderReadReceipt(row,row._message)}});
      return;
    }
    if(data?.type==='dm_pins_updated' && data.conversation_id){if(String(activeConversationId)===String(data.conversation_id))refreshPinnedMessages();return}
    if(data?.type==='dm_messages_deleted' && data.conversation_id){
      const info=document.querySelector('[data-message-info]');if(info?.dataset.conversationId===String(data.conversation_id)&&(data.message_ids||[]).some(id=>String(id)===info.dataset.messageId))info.remove();
      if(String(activeConversationId)===String(data.conversation_id))refreshPinnedMessages();
      const deletedStars=new Set((data.message_ids||[]).map(String));document.querySelectorAll('[data-global-search] [data-search-message]').forEach(card=>{if(card.dataset.searchConversation===String(data.conversation_id)&&deletedStars.has(card.dataset.searchMessage))card.remove()});document.querySelectorAll('[data-starred-panel] .dm-star-card').forEach(card=>{if(card.dataset.starConversationId===String(data.conversation_id)&&deletedStars.has(card.dataset.starMessageId))card.remove()});
      if(String(activeConversationId||'')===String(data.conversation_id)){
        const body=document.querySelector('#chat .chatBody');
        for(const id of data.message_ids||[])body?.querySelectorAll('.bubble[data-message-id="'+String(id)+'"]').forEach(row=>{selectedMessages.delete(row);releaseMediaUrls(row);row.remove()});
        invalidateQuotedMessages(data.message_ids||[]);refreshSelectionBar();closeSharedMedia();
      }
      loadConversations();return;
    }
    if (!data || data.type !== 'dm_message' || !data.conversation_id) return;
    const id = String(data.conversation_id);
    if(data.locked){
      if(String(activeConversationId||'')===id && vaultToken){
        const chat=$('chat'),name=chat?.querySelector('.chatHead b')?.textContent||'Sohbet';
        openRealChat(id,name,'',window.__erisActiveDmUserId).catch(()=>{});
      }
      loadConversations();return;
    }
    if (String(activeConversationId || '') === id) {
      const body = document.querySelector('#chat .chatBody');
      if (!body || body.querySelector('[data-message-id="'+String(data.message_id).replace(/"/g,'&quot;')+'"]')) return;
      if(historyWindow){updateHistoryButton();return}
      const mine = String(data.sender_id || '') === String(currentUserId || '');
      const incoming=appendMessageOnce(body, data, mine);if(data.has_poll)refreshPollMessage(incoming);
      if(data.gift_key)window.dispatchEvent(new CustomEvent('erischat:dm-gift',{detail:data}));
      body.scrollTop = body.scrollHeight;
      if(data.has_reply)reconcileChat();
      if (!mine) api().messages(id).catch(()=>{});
    } else if (String(data.sender_id || '') !== String(currentUserId || '') && window.ErisNotifications?.enabled!==false && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const [privacy,mute]=await Promise.all([
          window.ErisPlatform.api('/me/privacy'),
          window.ErisPlatform.api('/conversations/'+encodeURIComponent(data.conversation_id)+'/notifications')
        ]);
        if(!privacy.hide_notifications && !mute.is_muted)
          new Notification(data.sender_nickname || 'Yeni mesaj', {body:data.text||'Yeni mesaj aldınız.',tag:'dm-'+data.conversation_id});
      } catch (_) {}
    }
    loadConversations();
  }

  // HTTP reconciliation also covers reconnects and multi-worker socket delivery.
  let reconciling=false;
  async function reconcileChat(){
    const id=activeConversationId,revision=chatRevision,chat=$('chat');
    if(reconciling||!id||!chat?.classList.contains('show')||document.visibilityState==='hidden')return;
    reconciling=true;
    refreshPinnedMessages();refreshMessageInfo();
    if(String(id).startsWith('grp_'))await syncGroupState(id);
    if(String(activeConversationId)!==String(id)){reconciling=false;return}
    try{const around=historyWindow?Math.max(...[...chat.querySelectorAll('.bubble[data-message-id]')].map(row=>Number(row.dataset.messageId))):null;
      const rows=asList(api().messageHistory?await api().messageHistory(id,null,Number.isFinite(around)?around:null):await api().messages(id),['messages','items','data']);
      if(revision!==chatRevision||String(activeConversationId)!==String(id))return;
      const body=chat.querySelector('.chatBody'),nearBottom=body.scrollHeight-body.scrollTop-body.clientHeight<80;
      const authoritative=new Set(rows.map(m=>String(m.id))),oldest=rows.length?Math.min(...rows.map(m=>Number(m.id))):0;
      for(const old of body.querySelectorAll('.bubble[data-message-id]'))if(!authoritative.has(old.dataset.messageId)&&(!rows.length||Number(old.dataset.messageId)>=oldest)){selectedMessages.delete(old);releaseMediaUrls(old);old.remove()}
      refreshSelectionBar();
      for(const m of rows){const mine=String(m.sender_id||m.user_id)===String(currentUserId);appendMessageOnce(body,m,mine)}
      if(nearBottom)body.scrollTop=body.scrollHeight;
    }catch{}finally{reconciling=false}
  }
  window.ErisApiTransport.poll(reconcileChat,8000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reconcileChat()});

  // One authenticated user socket carries DM realtime events. Room sockets stay separate.
  let dmSocket = null;
  let dmReconnectTimer = null;
  let dmReconnectAttempt = 0;
  function dmToken(){ return localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || ''; }
  function connectDmSocket(){
    const token = dmToken();
    if (!token) return;
    try { dmSocket?.close(); } catch (_) {}
    const apiBase = String(window.ERISCHAT_API_BASE || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
    const wsBase = apiBase.replace(/\/v1\/?$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const ws = new WebSocket(wsBase + '/ws', ['erischat', 'token.' + token]);
    dmSocket = ws;
    ws.onopen = () => { dmReconnectAttempt = 0; try { ws.send(JSON.stringify({type:'ping'})); } catch (_) {} };
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'dm_message' || data?.type === 'dm_read' || data?.type === 'dm_messages_deleted' || data?.type === 'dm_message_updated' || data?.type === 'dm_reactions_updated' || data?.type === 'dm_poll_updated' || data?.type === 'dm_pins_updated') window.dispatchEvent(new CustomEvent('erischat:event', {detail:data}));
      } catch (_) {}
    };
    ws.onclose = () => {
      if (dmSocket !== ws) return;
      dmSocket = null;
      if (!dmToken()) return;
      const delay = Math.min(15000, 1000 * Math.pow(2, dmReconnectAttempt++));
      clearTimeout(dmReconnectTimer);
      dmReconnectTimer = setTimeout(connectDmSocket, delay);
    };
  }
  window.addEventListener('erischat:event', handleRealtimeMessage);

  async function openFloating(participantId, participantName, withGift=false) {
    const conversation=await createConversation(participantId, participantName);
    const chat=$('chat');
    if(!conversation || !chat?.classList.contains('show') || !activeConversationId) throw new Error('Konuşma açılamadı.');
    chat.classList.add('eris-floating-dm');
    if(withGift) await openGiftSheet();
    return conversation;
  }
  window.ErisChatDM = { load: loadConversations, open: openRealChat, create: createConversation, openFloating, send: sendMessage, openGiftSheet, activeId: () => activeConversationId };

  window.addEventListener('erischat:auth', event => {
    if (event?.detail?.state === 'ready') {
      document.querySelector('[data-attachment-chooser]')?.remove();
      if(currentUserId&&event.detail.user?.id&&String(currentUserId)!==String(event.detail.user.id)){
        resetInbox();inboxFolder='inbox';cancelNativeDocument();drafts.clear();clearMessageMode(false);historyCursor=null;historyWindow=false;historyBusy=false;
        listRevision++;chatRevision++;activeConversationId=null;selectedMessages.clear();allMessagesSelected=false;messageSelectionMode=false;
        conversationInfo.clear();vaultToken='';window.ErisChatDMVaultToken='';window.__erisActiveDmUserId=null;
        document.querySelector('[data-dm-search-panel]')?.remove();closeSharedMedia();const chat=$('chat');releaseMediaUrls(chat);chat?.querySelector('.chatBody')?.replaceChildren();chat?.classList.remove('show');
      }
      currentUserId = event.detail.user?.id || currentUserId;
      connectDmSocket();
      if (currentUserId !== loadedForUserId) loadConversations();
    } else if (event?.detail?.state === 'logged_out') {
      releaseMediaUrls($('chat'));
      document.querySelector('[data-attachment-chooser]')?.remove();
      resetInbox();cancelNativeDocument();drafts.clear();clearMessageMode(false);historyCursor=null;document.querySelector('[data-dm-search-panel]')?.remove();closeSharedMedia();
      listRevision++;chatRevision++;activeConversationId=null;
      currentUserId = null;
      loadedForUserId = null;
      systemConversationIds.clear();conversationInfo.clear();
      vaultToken='';window.ErisChatDMVaultToken='';inboxFolder='inbox';selectedConversations.clear();
      clearTimeout(dmReconnectTimer);
      dmReconnectTimer = null;
      try { dmSocket?.close(); } catch (_) {}
      dmSocket = null;
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadConversations, { once: true });
  else loadConversations();
  window.ErisApiTransport.poll(loadConversations,20000);
})();

