(() => {
  const api = () => window.ErisPlatform;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '');
  const escapeHtml = value => esc(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function dmIcon(name){const art={chat:'<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/>',camera:'<path d="M8 5 9 3h6l1 2h5v15H3V5Z"/><circle cx="12" cy="12" r="4"/>',mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',gift:'<path d="M3 8h18v13H3ZM2 5h20v3H2ZM12 5v16M12 5C4 5 6-2 12 5ZM12 5c8 0 6-7 0 0Z"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>'};return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(art[name]||art.chat)+'</svg>';}
  let activeConversationId = null;
  let chatRevision=0,listRevision=0;
  const textSends=new Map();
  let currentUserId = null;
  let loadedForUserId = null;
  let selectedMessages = new Set();
  let messageSelectionMode = false;
  let allMessagesSelected = false;
  let inboxFolder = 'inbox';
  const selectedConversations = new Set();
  let vaultToken = '';
  let selectionBar = null;
  let activeRecorder = null;
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

  function formatAudioTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const n = Math.max(0, Math.floor(value));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`;
  }

  function releaseMediaUrls(root){
    root?.querySelectorAll('[data-object-url]').forEach(node=>{URL.revokeObjectURL(node.dataset.objectUrl);delete node.dataset.objectUrl});
    root?.querySelectorAll('.dm-voice-player').forEach(player=>{player._audio?.pause();if(player._objectUrl)URL.revokeObjectURL(player._objectUrl);player._audio=null;player._objectUrl=null});
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
    const row = document.createElement('div');
    row.className = 'bubble' + (mine ? ' me' : '');
    if (message?.media_type === 'image' || message?.media_type === 'voice') row.classList.add('dm-media-bubble');
    if (message?.id != null) row.dataset.messageId = String(message.id);
    row.dataset.read = message?.is_read ? '1' : '0';
    const portrait=document.createElement('span');portrait.className='dm-message-portrait';
    const asset=window.ErisChatCosmetics?.assetUrl;
    if(message.sender_avatar_asset){const img=document.createElement('img');img.src=asset?.(message.sender_avatar_asset)||message.sender_avatar_asset;img.alt='';portrait.append(img)}else portrait.textContent=message.sender_avatar||'👤';
    if(message.sender_frame_asset){const frame=document.createElement('img');frame.className='dm-message-frame';frame.src=asset?.(message.sender_frame_asset)||message.sender_frame_asset;frame.alt='';portrait.append(frame)}
    row.append(portrait);
    const body = document.createElement('div'); body.className='dm-message-text';
    if(message?.gift_key && message?.gift_image_url){
      const img=document.createElement('img');img.src=message.gift_image_url;img.alt=message.gift_key;img.style.cssText='display:block;width:70px;height:70px;object-fit:contain;margin:auto';body.append(img);
      const price=document.createElement('small');price.textContent=Number(message.gift_price||0).toLocaleString('tr-TR')+' Lidya';body.append(price);
    }else body.textContent = message?.gift_key ? `🎁 ${message.gift_key}` : (String(message?.text||'').startsWith('[Story yanıtı #') ? String(message.text).replace(/^\[Story yanıtı #\d+\]\s*/, '') : (message?.media_type ? '' : String(message?.text ?? message?.message ?? '')));
    const storyReply=String(message?.text||'').startsWith('[Story yanıtı #');
    if(storyReply)row.classList.add('dm-story-reply');
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
    } else if (message?.media_type === 'voice') {
      const player=document.createElement('div');player.className='dm-voice-player';
      player.innerHTML='<button type="button" class="dm-voice-toggle" aria-label="Sesli mesajı oynat">▶</button><div class="dm-voice-main"><div class="dm-wave" aria-hidden="true">'+Array.from({length:24},(_,i)=>`<i style="--h:${20+((i*17+9)%68)}%"></i>`).join('')+'</div><input class="dm-voice-progress" type="range" min="0" max="1000" value="0" aria-label="Sesli mesaj konumu"><div class="dm-track" aria-hidden="true"><i></i></div><small class="dm-voice-time">0:00</small></div>';
      player.querySelector('.dm-voice-toggle').onclick=()=>playVoice(message,player);player.querySelector('.dm-voice-progress').oninput=()=>{const audio=player._audio;if(audio?.duration)audio.currentTime=audio.duration*Number(player.querySelector('.dm-voice-progress').value)/1000};row.append(player);
    }
    if (message?.is_pinned) { const pin=document.createElement('span'); pin.dataset.pinIcon=''; pin.textContent='📌 '; pin.style.cssText='font-size:8px;color:#f3d995'; row.prepend(pin); }
    const meta = document.createElement('small');
    meta.style.cssText = 'display:flex;justify-content:flex-end;gap:5px;margin-top:4px;font-size:8px;line-height:1;color:#ffffff9c;white-space:nowrap';
    const when = document.createElement('span'); when.textContent = messageTime(message?.created_at); meta.append(when);
    if (mine) { const checks = document.createElement('span'); checks.className='dm-checks'; checks.textContent = message?.is_read ? '✓✓' : '✓'; checks.setAttribute('aria-label', message?.is_read ? 'Okundu' : 'Gönderildi'); meta.append(checks); }
    row.append(meta);
    if(message.bubble_asset && message.media_type!=='voice'){const content=document.createElement('div');content.className='rel-chat-bubble dm-award-content';window.ErisVisualLayout?.bubble(content,message.bubble_asset);for(const child of [...row.children])if(child!==portrait)content.append(child);row.append(content);row.classList.add('dm-award-bubble')}

    if (message?.is_pinned) row.dataset.pinned = '1';
    return row;
  }

  function appendMessageOnce(body, message, mine) {
    if (!body || !message) return null;
    const id = message.id ?? message.message_id;
    if (id != null) {
      const existing = [...body.querySelectorAll('.bubble[data-message-id]')].find(row => row.dataset.messageId === String(id));
      if (existing) return existing;
    }
    body.querySelectorAll(':scope > .muted').forEach(node=>node.remove());
    const row = renderMessage({...message, id}, mine);
    body.appendChild(row);
    return row;
  }

  function refreshSelectionBar() {
    if (!selectionBar) return;
    selectionBar.hidden = !messageSelectionMode;
    $('chat')?.classList.toggle('dm-selection-mode', messageSelectionMode);
    const count = selectionBar.querySelector('[data-selected-count]');
    if (count) count.textContent = allMessagesSelected?'Tüm mesajlar seçildi':`${selectedMessages.size} seçildi`;
    const pin = selectionBar.querySelector('[data-pin-selected]');
    if (pin) {pin.textContent='📌';pin.title=[...selectedMessages].some(row => row.dataset.pinned === '1') ? 'Sabitlemeyi kaldır' : 'Sabitle';pin.setAttribute('aria-label',pin.title)}
    selectionBar.querySelector('[data-delete-selected]').disabled = !selectedMessages.size;
    selectionBar.querySelector('[data-pin-selected]').disabled = !selectedMessages.size;
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

  function dmConfirm(question){
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='dm-vault-modal';
      modal.innerHTML='<section role="alertdialog" aria-modal="true"><header><h3>Silme onayı</h3><button type="button" data-no aria-label="Kapat">×</button></header><p></p><footer><button type="button" class="accept" data-yes>Kabul et</button><button type="button" class="reject" data-cancel>İptal</button></footer></section>';
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

  function renderAvatar(el, value, fallback) {
    if (!el) return;
    const avatar = avatarValue(value, fallback);
    el.textContent = '';
    el.style.backgroundImage = '';
    const fileAsset=/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(avatar);
    const imageUrl=fileAsset?(window.ErisChatCosmetics?.assetUrl?.(avatar)||avatar):avatar;
    if (/^(https?:|data:|\/|\.\.?\/)/.test(imageUrl)) {
      el.style.backgroundImage = `url("${imageUrl.replace(/"/g,'%22')}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.setAttribute('aria-label', fallback || 'Avatar');
    } else {
      el.textContent = avatar || fallback || '👤';
    }
  }

  async function resolveParticipant(conversation) {
    const members = asList(conversation?.members, ['members']);
    const other = members.find(member => String(member?.user_id) !== String(currentUserId));
    if (!other?.user_id) return {};
    if (other.nickname) return other;
    try {
      return await api().api(`/users/${encodeURIComponent(other.user_id)}`);
    } catch (error) {
      console.warn('[ErisChat] participant profile unavailable', error);
      return { id: other.user_id, nickname: 'Anonim kullanıcı' };
    }
  }

  function showListError(list) {
    if(list){list.innerHTML='<div class="dm-list-state" role="status"><b>Konuşmalar yüklenemedi</b><p>Bağlantını kontrol edip yeniden dene.</p><button type="button" data-retry>Tekrar dene</button></div>';list.querySelector('[data-retry]').onclick=loadConversations;}
  }

  async function fetchMedia(message, preview=false) {
    const token=api()?.getAccessToken?.()||localStorage.getItem('erischat_access_token')||localStorage.getItem('token')||'';
    let url=api()?.messageMediaUrl?.(message.media_url);
    if(!url)throw new Error('Medya adresi bulunamadı.');
    if(preview)url+=(url.includes('?')?'&':'?')+'preview=1';
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

  async function playVoice(message, player) {
    const button=player?.querySelector('.dm-voice-toggle'),progress=player?.querySelector('.dm-voice-progress'),time=player?.querySelector('.dm-voice-time');
    if(!player)return;
    if(player._audio){if(player._audio.paused){await player._audio.play().catch(()=>{});if(button)button.textContent='Ⅱ'}else{player._audio.pause();if(button)button.textContent='▶'}return}
    if(button){button.disabled=true;button.textContent='…'}
    try{
      const response=await fetchMedia(message),url=URL.createObjectURL(await response.blob()),audio=new Audio(url);player._audio=audio;player._objectUrl=url;
      const sync=()=>{if(!progress||!time)return;const ratio=audio.duration?audio.currentTime/audio.duration:0;progress.value=String(Math.round(ratio*1000));progress.style.setProperty('--played',`${ratio*100}%`);player.querySelector('.dm-wave')?.style.setProperty('--played',`${ratio*100}%`);const track=player.querySelector('.dm-track i');if(track)track.style.width=`${ratio*100}%`;time.textContent=audio.duration?`${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}`:formatAudioTime(audio.currentTime)};
      audio.ontimeupdate=sync;audio.onloadedmetadata=sync;audio.onplay=()=>{if(button){button.disabled=false;button.textContent='Ⅱ'}};audio.onpause=()=>{if(button){button.disabled=false;button.textContent='▶'}};audio.onended=()=>{audio.currentTime=0;sync();if(button)button.textContent='▶'};
      if(button)button.disabled=false;await audio.play();
    }catch(error){if(button){button.disabled=false;button.textContent='↻'}window.toast?.(error.message||'Sesli mesaj oynatılamadı.')}
  }

  async function uploadMedia(file,type,seconds=0){
    const conversationId=activeConversationId;
    if(!conversationId||!api()?.sendMessageMedia||!file)return;
    const lock=String(conversationId);
    if(mediaUploadsInFlight.has(lock))return;
    mediaUploadsInFlight.add(lock);
    try{
      const message=await api().sendMessageMedia(conversationId,file,type,seconds);
      if(String(activeConversationId)===lock){
        const body=document.querySelector('#chat .chatBody');
        appendMessageOnce(body,message,true);
        if(body)body.scrollTop=body.scrollHeight;
      }
      loadConversations();
    }catch(error){window.toast?.(error.message||'Medya gönderilemedi.')}
    finally{mediaUploadsInFlight.delete(lock)}
  }

  function pickPhoto(seconds=0,camera=false){
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif';if(camera)input.setAttribute('capture','environment');
    input.onchange=()=>{const file=input.files?.[0];if(file)uploadMedia(file,'image',seconds)};input.click();
  }

  function openPhotoChooser(){
    const modal=document.createElement('div');modal.className='dm-gift-sheet';modal.innerHTML='<section><div style="display:flex;align-items:center;justify-content:space-between"><b>Fotoğraf gönder</b><button class="close" data-x>×</button></div><p style="font-size:9px;color:#aaa1b1;line-height:1.5">Normal fotoğraf mesajda kalır. Süreli fotoğraf, alıcı ilk açtığında seçilen sürenin sonunda silinir.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button data-gallery>🖼 Galeriden fotoğraf</button><button data-camera>📷 Kamerayla fotoğraf</button></div><hr style="border-color:#ffffff15;margin:14px 0"><b style="font-size:11px">Süreli fotoğraf</b><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px"><button data-temp="10" aria-pressed="true">10 sn</button><button data-temp="20">20 sn</button><button data-temp="30">30 sn</button></div><div data-temp-source style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button data-source="gallery">🖼 Süreli galeriden</button><button data-source="camera">📸 Süreli kamera</button></div></section>';document.body.append(modal);
    let duration=10;modal.querySelector('[data-x]').onclick=()=>modal.remove();modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
    modal.querySelector('[data-gallery]').onclick=()=>{modal.remove();pickPhoto(0,false)};modal.querySelector('[data-camera]').onclick=()=>{modal.remove();pickPhoto(0,true)};
    modal.querySelectorAll('[data-temp]').forEach(b=>b.onclick=()=>{duration=Number(b.dataset.temp);modal.querySelectorAll('[data-temp]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));modal.querySelector('[data-temp-source]').style.outline='1px solid #a679ff';window.toast?.('Süre '+duration+' saniye seçildi; galeriden veya kameradan gönder.')});
    modal.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{modal.remove();pickPhoto(duration,b.dataset.source==='camera')});
  }

  async function toggleVoiceRecording(button){
    if(activeRecorder){activeRecorder.stop();activeRecorder=null;button.textContent='🎙';button.title='Ses kaydet';return}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){window.toast?.('Bu tarayıcı ses kaydını desteklemiyor.');return}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const recorder=new MediaRecorder(stream);const chunks=[];activeRecorder=recorder;recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onerror=()=>window.toast?.('Ses kaydı sırasında hata oluştu.');recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const type=(recorder.mimeType||'audio/webm').split(';',1)[0]||'audio/webm';const blob=new Blob(chunks,{type});activeRecorder=null;if(blob.size)await uploadMedia(new File([blob],`voice-${Date.now()}.${type==='audio/mp4'?'m4a':type==='audio/ogg'?'ogg':'webm'}`,{type}),'voice',0)};recorder.start();button.textContent='⏹';button.title='Kaydı bitir ve gönder'}catch(error){activeRecorder=null;window.toast?.(error.name==='NotAllowedError'?'Mikrofon izni gerekli.':'Ses kaydı başlatılamadı.')}
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
      #chat .dm-select-tools{position:absolute;inset:0 0 auto 0;min-height:65px;z-index:5;justify-content:flex-end;background:#15101ce8;flex-wrap:wrap}
      #chat .dm-select-tools[hidden]{display:none!important}#chat .dm-select-tools [data-selected-count]{margin-right:auto}
      #chat .dm-select-tools button{width:34px;height:34px;border-radius:11px;font-size:17px;padding:0}
      #chat .dm-select-tools button[data-delete-selected]{color:#ff6d87;border-color:#ff6d8755}#chat .dm-select-tools button:disabled{opacity:.4}
      #chat.dm-selection-mode .chatBody .bubble[data-message-id]{position:relative;transform:translateX(24px);margin-right:25px;max-width:calc(78% - 24px);cursor:pointer}
      #chat.dm-selection-mode .chatBody .bubble[data-message-id]::before{content:'';position:absolute;left:-31px;top:calc(50% - 10px);width:19px;height:19px;border:1px solid #bda4d5;border-radius:5px;background:#21172b}
      #chat.dm-selection-mode .chatBody .bubble.dm-selected::before{content:'✓';text-align:center;line-height:19px;background:#8255d9;border-color:#a881f4;color:white}
      #messages .dm-inbox-nav{display:flex;gap:8px;margin:8px 0 12px}#messages .dm-inbox-nav[hidden]{display:none!important}#messages .dm-inbox-nav button,#messages .dm-list-tools button{border:1px solid #ffffff25;border-radius:12px;background:#21172b;color:#f3e7fa;padding:9px 10px;font-size:11px}
      #messages .dm-inbox-nav button{flex:1}#messages .dm-list-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}#messages .dm-list-tools[hidden]{display:none!important}#messages .dm-list-tools [data-count]{flex:1;min-width:100px;font-size:10px}#messages .dm-list-tools [data-select-all],#messages .dm-list-tools [data-delete],#messages .dm-list-tools [data-cancel]{width:36px;min-width:36px;height:36px;padding:0;font-size:17px}
      #messages .dm-list-selected{border-color:#a46fff;box-shadow:0 0 0 1px #a46fff}#messages .dm-list-selected::before{content:'✓';border:1px solid #ae87ea;border-radius:5px;padding:2px 5px;background:#62459c}
      .dm-vault-modal{position:fixed;inset:0;z-index:22000;background:#07040bc9;backdrop-filter:blur(7px);display:grid;place-items:center;padding:18px}
      .dm-vault-modal section{width:min(440px,100%);max-height:90vh;overflow:auto;padding:18px;border:1px solid #aa83d466;border-radius:23px;background:linear-gradient(140deg,#23162d,#100b19);box-shadow:0 18px 50px #0009}
      .dm-vault-modal header{display:flex;align-items:center;justify-content:space-between;gap:8px}.dm-vault-modal h3{margin:0;font-size:18px}.dm-vault-modal p{font-size:12px;line-height:1.45;color:#cabdd5}
      .dm-vault-modal label{display:block;font-size:11px;color:#e2d6ed;margin:12px 0}.dm-vault-modal input{display:block;width:100%;margin-top:5px;padding:11px;border:1px solid #ffffff36;border-radius:11px;background:#0f0b16;color:#fff;font-size:14px}
      .dm-vault-modal footer{display:flex;gap:8px;margin-top:15px}.dm-vault-modal button{border:1px solid #ffffff35;border-radius:11px;background:#ffffff12;color:#fff;padding:9px 13px}.dm-vault-modal .accept{background:#19895b;border-color:#47ce91}.dm-vault-modal .reject{background:#802d48;border-color:#bc5b78}.dm-vault-modal .warn{color:#ff7787;font-size:10px}.dm-vault-modal .error{color:#ff7787;font-size:11px}
    `;document.head.appendChild(folderStyle);
  }

  function installChatTools(chat) {
    if (!chat) return;
    syncDmCapturePreference(chat);
    if (chat.querySelector('[data-dm-tools]')) return;
    const style = document.createElement('style');
    style.textContent = '.dm-unread{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:#ff4fa3;color:#fff;display:grid;place-items:center;font-size:9px;font-weight:900}.dm-selected{outline:2px solid #e9c66b!important}.dm-select-tools{display:flex;align-items:center;gap:7px;padding:7px 11px;border-bottom:1px solid #ffffff12;background:#100d16}.dm-select-tools[hidden]{display:none}.dm-select-tools button{border:1px solid #ffffff20;background:#ffffff0a;color:#fff;border-radius:10px;padding:6px 9px;font-size:9px}.dm-pinned{position:sticky;top:0;z-index:2;background:#e4b85d18;border:1px solid #e4b85d44;border-radius:10px;padding:7px 10px;font-size:9px;color:#f3d995}.dm-gift-sheet{position:fixed;inset:0;z-index:500;background:#020107bb;display:flex;align-items:flex-end}.dm-gift-sheet>section{width:min(520px,100%);max-height:76vh;overflow:auto;background:#0b0911;border:1px solid #ffffff20;border-radius:24px 24px 0 0;padding:16px}.dm-gift-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.dm-gift-grid button{background:#ffffff08;color:#fff;border:1px solid #ffffff15;border-radius:14px;padding:10px;font-size:11px}.dm-gift-grid small{display:block;color:#e4b85d;margin-top:4px;font-size:9px}';
    document.head.appendChild(style);
    const mediaStyle=document.createElement('style');
    mediaStyle.textContent=`.dm-unread[hidden]{display:none!important}.bubble.dm-media-bubble,.bubble.me.dm-media-bubble{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;overflow:visible!important}.dm-image-message{margin-top:7px}.dm-photo-open{position:relative;display:block;max-width:100%;padding:0;border:0;background:transparent;color:#fff;text-align:left}.dm-inline-photo{display:block;width:min(250px,68vw);max-height:320px;min-height:96px;object-fit:cover;border-radius:14px;background:#201a28}.dm-media-loading{display:block;padding:8px 12px;color:#aaa1b1;font-size:10px}.dm-temp-preview{position:relative;isolation:isolate;display:flex;align-items:center;gap:10px;overflow:hidden;width:min(250px,68vw);min-height:112px;padding:14px;border:1px solid #ffffff20;border-radius:15px;background:linear-gradient(135deg,#201a2c,#37213d 55%,#562948);color:#fff;text-align:left}.dm-temp-blur{position:absolute;z-index:-1;inset:-12px;background:radial-gradient(ellipse at 22% 28%,#e872b9a8 0 13%,transparent 46%),radial-gradient(ellipse at 76% 74%,#7860ffa6 0 18%,transparent 52%),linear-gradient(130deg,#29213a,#b14878);filter:blur(15px);transform:scale(1.12)}.dm-temp-lock{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:1px solid #ffffff5c;border-radius:50%;background:#0907116e;font-size:17px}.dm-temp-label,.dm-temp-preview>span:last-child{display:grid;gap:4px}.dm-temp-preview b{font-size:12px}.dm-temp-preview small{font-size:10px;color:#f0e6f4}.dm-temp-preview.expired{min-height:74px;background:#16131b;color:#aaa1b1}.dm-voice-player{display:flex;align-items:center;gap:10px;width:min(285px,72vw);margin-top:6px;padding:9px 11px;border:1px solid #ffffff14;border-radius:18px;background:linear-gradient(135deg,#211b2a,#15121b)}.dm-voice-toggle{flex:0 0 38px;width:38px;height:38px;border:0;border-radius:50%;background:linear-gradient(135deg,#8c54ff,#d44bad);color:white;font-size:15px}.dm-voice-main{position:relative;flex:1;min-width:0;padding-bottom:15px}.dm-wave{height:25px;display:flex;align-items:center;gap:2px;overflow:hidden}.dm-wave i{flex:1;min-width:2px;height:var(--h);border-radius:3px;background:#c6bacf8c}.dm-voice-progress{position:absolute;inset:0 0 14px;width:100%;height:26px;margin:0;opacity:0;cursor:pointer}.dm-voice-time{position:absolute;bottom:0;left:0;color:#b9b0c1;font-size:9px}.dm-photo-viewer{position:fixed;inset:0;z-index:20000;background:#05040af5;display:grid;place-items:center;padding:16px}.dm-photo-viewer-head{position:absolute;top:max(12px,env(safe-area-inset-top));left:14px;right:14px;display:flex;align-items:center;justify-content:space-between;color:#fff;font-size:13px}.dm-photo-viewer-head button{border:1px solid #ffffff20;background:#ffffff12;color:#fff;border-radius:14px;width:42px;height:42px;font-size:22px}.dm-photo-viewer img{display:block;max-width:100%;max-height:82vh;object-fit:contain;border-radius:14px}.dm-photo-viewer>small{position:absolute;bottom:max(18px,env(safe-area-inset-bottom));color:#fff;font-size:12px}.dm-photo-viewer.capture-hidden img{filter:blur(24px);visibility:hidden}.dm-gift-sheet button:not(.close){min-height:44px;border:1px solid #ffffff18;border-radius:14px;background:linear-gradient(145deg,#201a2a,#15121b);color:#f5eff8;font-size:12px;font-weight:650;box-shadow:0 5px 18px #0003;transition:transform .15s,border-color .15s}.dm-gift-sheet button:not(.close):active{transform:scale(.97)}.dm-gift-sheet [data-temp][aria-pressed=true]{border-color:#bd8cff;background:linear-gradient(135deg,#6044a1,#452d66);color:#fff;box-shadow:0 0 0 2px #a67aff26}.dm-gift-sheet .close{border:1px solid #ffffff16;background:#ffffff0b;color:#fff;border-radius:13px;width:42px;height:42px;font-size:21px}.dm-gift-sheet p{font-size:11px!important}.compose button.close[data-dm-photo],.compose button.close[data-dm-voice],.compose button.close[data-dm-gift]{width:46px;height:46px;flex:0 0 46px;border:1px solid #ffffff18;border-radius:15px;background:linear-gradient(145deg,#211a2a,#121019);color:#f8f3fb;font-size:18px;box-shadow:0 5px 15px #0003}.compose button.close[data-dm-photo]:active,.compose button.close[data-dm-voice]:active,.compose button.close[data-dm-gift]:active{transform:scale(.96)}.compose button.close[data-dm-voice][title="Kaydı bitir ve gönder"]{background:linear-gradient(135deg,#c83d69,#8e2f62);box-shadow:0 0 0 3px #ff4fa326}`;
    mediaStyle.textContent += '.dm-temp-preview img.dm-temp-blur{inset:-12px;width:calc(100% + 24px);height:calc(100% + 24px);object-fit:cover;opacity:.86;filter:blur(13px)}.dm-temp-status{position:absolute;inset:0;pointer-events:none}.dm-voice-player .dm-wave{background:linear-gradient(90deg,#de89ff var(--played,0%),transparent var(--played,0%))}.dm-track{height:3px;margin-top:3px;border-radius:9px;background:#ffffff24;overflow:hidden}.dm-track i{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#a76bff,#f45db5)}.dm-voice-player input:focus-visible{opacity:.25;outline:2px solid #bd8cff}';
    mediaStyle.textContent += '.dm-inline-photo{width:min(150px,42vw);max-height:160px;min-height:55px}.dm-temp-preview{width:min(180px,50vw);min-height:80px}.dm-voice-player{width:min(218px,60vw);padding:6px 8px;gap:7px}.dm-voice-toggle{width:31px;height:31px;flex-basis:31px}.dm-wave{height:17px}.dm-story-reply .dm-image-message{margin:0 0 5px}.dm-story-reply .dm-inline-photo{opacity:.62;width:min(142px,42vw);max-height:148px}.dm-story-reply .dm-message-text{font-size:12px;padding:4px 8px}.dm-story-reply .dm-photo-open{cursor:zoom-in}';
    document.head.appendChild(mediaStyle);
    installFolderStyles();
    selectionBar = document.createElement('div'); selectionBar.className = 'dm-select-tools'; selectionBar.dataset.dmTools = ''; selectionBar.hidden = true;
    selectionBar.innerHTML = '<button type="button" data-all-selected aria-label="Tümünü seç" title="Tümünü seç">□</button><span data-selected-count style="font-size:10px;color:#d8cddd"></span><button type="button" data-pin-selected aria-label="Sabitle" title="Sabitle">📌</button><button type="button" data-delete-selected aria-label="Seçilenleri sil" title="Seçilenleri sil">Sil</button><button type="button" data-clear-selected aria-label="Seçimi kapat" title="Seçimi kapat">×</button>';
    const body = chat.querySelector('.chatBody'); chat.querySelector('.chatHead')?.append(selectionBar);
    selectionBar.querySelector('[data-clear-selected]').onclick = () => { selectedMessages.forEach(row => row.classList.remove('dm-selected')); selectedMessages.clear();allMessagesSelected=false; messageSelectionMode=false;refreshSelectionBar(); };
    selectionBar.querySelector('[data-all-selected]').onclick = () => { const rows=[...body.querySelectorAll('.bubble[data-message-id]')];allMessagesSelected=!allMessagesSelected;selectedMessages.clear();rows.forEach(row=>{row.classList.toggle('dm-selected',allMessagesSelected);if(allMessagesSelected)selectedMessages.add(row)});refreshSelectionBar() };
    selectionBar.querySelector('[data-delete-selected]').onclick = async () => {
      if(!selectedMessages.size&&!allMessagesSelected)return;
      const approved=await dmConfirm(allMessagesSelected?'Bu konuşmadaki tüm mesajları silmek istediğine emin misin?':selectedMessages.size===1?'Bu mesajı silmek istediğine emin misin?':'Seçtiğin '+selectedMessages.size+' mesajı silmek istediğine emin misin?');
      if(!approved)return;
      try { await api().deleteMessages(activeConversationId, [...selectedMessages].map(row => Number(row.dataset.messageId)),allMessagesSelected); if(allMessagesSelected){releaseMediaUrls(body);body.replaceChildren()}else [...selectedMessages].forEach(row => row.remove()); selectedMessages.clear();allMessagesSelected=false;refreshSelectionBar(); }
      catch (e) { window.toast?.(e.message || 'Mesajlar silinemedi.'); }
    };
    selectionBar.querySelector('[data-pin-selected]').onclick = async () => {
      const rows = [...selectedMessages]; if (!rows.length) return;
      try {
        for (const row of rows) { const id = Number(row.dataset.messageId); const unpin = row.dataset.pinned === '1'; if (unpin) { await api().unpinMessage(activeConversationId,id); row.dataset.pinned='0'; row.querySelector('[data-pin-icon]')?.remove(); } else { await api().pinMessage(activeConversationId,id); row.dataset.pinned='1'; const pin=document.createElement('span');pin.dataset.pinIcon='';pin.textContent='📌 ';pin.style.cssText='font-size:8px;color:#f3d995';row.prepend(pin); } }
        selectedMessages.forEach(row => row.classList.remove('dm-selected')); selectedMessages.clear(); refreshSelectionBar();
      } catch (e) { window.toast?.(e.message || 'Sabitleme işlemi başarısız.'); }
    };
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
    const compose = chat.querySelector('.compose');
    const chatName=String(chat.querySelector('.chatHead b')?.textContent||'');
    const familyChat=/ aile sohbeti$/i.test(chatName), systemChat=chatName==='ErisChat';
    if(compose&&systemChat){compose.style.display='none';}
    else if(compose){compose.style.display='';}
    if (compose && !familyChat && !systemChat && !compose.querySelector('[data-dm-gift]')) { const button = document.createElement('button'); button.type='button'; button.dataset.dmGift=''; button.className='close'; button.innerHTML=dmIcon('gift'); button.title='Hediye gönder';button.setAttribute('aria-label','Hediye gönder'); compose.insertBefore(button,compose.firstChild); button.onclick=()=>openGiftSheet(); }
    if (compose && !systemChat && !compose.querySelector('[data-dm-photo]')) {const b=document.createElement('button');b.type='button';b.dataset.dmPhoto='';b.className='close';b.innerHTML=dmIcon('camera');b.title='Fotoğraf gönder';b.setAttribute('aria-label','Fotoğraf gönder');compose.insertBefore(b,compose.firstChild);b.onclick=openPhotoChooser;}
    if (compose && !systemChat && !compose.querySelector('[data-dm-voice]')) {const b=document.createElement('button');b.type='button';b.dataset.dmVoice='';b.className='close';b.innerHTML=dmIcon('mic');b.title='Ses kaydet';b.setAttribute('aria-label','Ses kaydet');compose.insertBefore(b,compose.firstChild);b.onclick=()=>toggleVoiceRecording(b);}
  }

  let sendingGift=false;
  async function openGiftSheet() {
    if (!activeConversationId || !api()?.messageGifts) return;
    const modal = document.createElement('div'); modal.className='dm-gift-sheet'; modal.innerHTML='<section><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><b>Hediye seç</b><button class="close" data-close>×</button></div><div class="dm-gift-grid">Yükleniyor…</div></section>'; document.body.appendChild(modal);
    const giftStyle=document.createElement('style');giftStyle.textContent='.dm-gift-controls{display:grid;gap:8px;margin:8px 0}.dm-gift-categories,.dm-gift-quantities{display:flex;gap:5px;overflow:auto}.dm-gift-controls button{white-space:nowrap;padding:8px;font-size:11px}.dm-gift-controls button.active{border-color:#bd8cff;background:#6044a1}.dm-gift-grid button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}.dm-gift-art{width:82px;height:82px;object-fit:contain}.dm-gift-price{font-size:10px}.dm-gift-price .eris-lidya-coin{width:12px!important;height:12px!important;vertical-align:-2px!important}';modal.append(giftStyle);
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
          const image=document.createElement('img');image.src=g.image_url;image.alt='';image.loading='lazy';image.className='dm-gift-art';
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
    const modal=document.createElement('div');modal.id='eris-dm-profile-modal';modal.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(2,1,7,.78);backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px';
    modal.innerHTML='<div style="width:min(420px,100%);max-height:80vh;overflow:auto;background:#0b0911;border:1px solid #ffffff14;border-radius:24px;padding:18px;color:#fff"><div style="display:flex;justify-content:space-between;align-items:center"><b>Kullanıcı profili</b><button id="erpClose" class="close">×</button></div><div id="erpBody" style="margin-top:12px">Yükleniyor…</div></div>';document.body.appendChild(modal);modal.querySelector('#erpClose').onclick=()=>modal.remove();
    try{const [u,f,g]=await Promise.all([api().api('/users/'+encodeURIComponent(id)),api().api('/users/'+encodeURIComponent(id)+'/fans').catch(()=>({level:0,total:0})),api().api('/users/'+encodeURIComponent(id)+'/profile-gifts').catch(()=>[])]);const body=modal.querySelector('#erpBody'),publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';body.innerHTML='<div class="card" style="padding:14px"><div style="font-size:20px">👤</div><b>'+escapeHtml(u.nickname||'Anonim kullanıcı')+'</b><small style="display:block;color:#938a9f;margin-top:5px">ID: '+escapeHtml(publicId)+'</small><small style="display:block;color:#938a9f;margin-top:4px">Fan seviyesi '+Number(f.level||0)+' • '+Number(f.total||0)+' fan • '+(Array.isArray(g)?g.length:0)+' profil hediyesi</small></div><div style="display:flex;gap:7px;margin-top:9px"><button id="erpMsg" class="primary" style="height:40px;flex:1">Mesaj gönder</button></div>';window.ErisRoleBadges?.bind(body.querySelector('.card b'),u);body.querySelector('#erpMsg').onclick=async()=>{modal.remove();try{await createConversation(u.id||id,u.nickname||'Anonim kullanıcı')}catch(e){window.toast?.(e.message||'Konuşma açılamadı.')}}}catch(e){modal.querySelector('#erpBody').textContent=e.message||'Kullanıcı bulunamadı.'}
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
    const tools=document.createElement('div');tools.className='dm-list-tools';tools.hidden=true;tools.innerHTML='<button type="button" data-select-all aria-label="Tüm sohbetleri seç" title="Tüm sohbetleri seç">□</button><small data-count></small><button type="button" data-move>✉ Arşiv</button><button type="button" data-lock>🔒 Kilitle</button><button type="button" data-delete aria-label="Seçilen sohbetlerin mesajlarını sil">Sil</button><button type="button" data-cancel>×</button>';
    root.querySelector('[data-dm-search]')?.after(nav,tools);
    nav.querySelector('[data-back]').onclick=()=>{inboxFolder='inbox';selectedConversations.clear();vaultToken='';window.ErisChatDMVaultToken='';loadConversations()};
    nav.querySelector('[data-change]').onclick=changeVault;
    tools.querySelector('[data-move]').onclick=()=>moveSelected('archive');tools.querySelector('[data-lock]').onclick=()=>moveSelected('locked');tools.querySelector('[data-cancel]').onclick=()=>{selectedConversations.clear();loadConversations()};
    tools.querySelector('[data-select-all]').onclick=()=>{const rows=[...root.querySelectorAll('.list .item[data-conversation-id]')];const all=rows.length>0&&rows.every(row=>selectedConversations.has(row.dataset.conversationId));rows.forEach(row=>{if(all)selectedConversations.delete(row.dataset.conversationId);else selectedConversations.add(row.dataset.conversationId);row.classList.toggle('dm-list-selected',!all)});renderFolderControls(root)};
    tools.querySelector('[data-delete]').onclick=async()=>{const ids=[...selectedConversations];if(!ids.length||!await dmConfirm(ids.length===1?'Bu sohbetin tüm mesajlarını silmek istediğine emin misin?':ids.length+' sohbetin tüm mesajlarını silmek istediğine emin misin?'))return;try{for(const id of ids)await api().deleteMessages(id,[],true);selectedConversations.clear();await loadConversations();window.toast?.('Mesajlar silindi.')}catch(e){window.toast?.(e.message||'Mesajlar silinemedi.')}};
  }
  function renderFolderControls(root){
    const nav=root.querySelector('.dm-inbox-nav'),tools=root.querySelector('.dm-list-tools');if(!nav||!tools)return;
    nav.querySelector('[data-back]').hidden=inboxFolder==='inbox';nav.querySelector('[data-change]').hidden=inboxFolder!=='locked';nav.hidden=inboxFolder==='inbox';
    tools.hidden=!selectedConversations.size;tools.querySelector('[data-count]').textContent=selectedConversations.size+' sohbet seçildi';
    const rows=[...root.querySelectorAll('.list .item[data-conversation-id]')];const all=rows.length>0&&rows.every(row=>selectedConversations.has(row.dataset.conversationId));tools.querySelector('[data-select-all]').textContent=all?'☑':'□';tools.querySelector('[data-select-all]').setAttribute('aria-pressed',String(all));
    tools.querySelector('[data-move]').textContent=inboxFolder==='archive'?'✉ Arşivden çıkar':'✉ Arşivle';tools.querySelector('[data-move]').hidden=inboxFolder==='locked';
    tools.querySelector('[data-lock]').textContent=inboxFolder==='locked'?'🔓 Kilidi kaldır':'🔒 Kilitle';
  }
  function installMessageSearch(){
    installFolderStyles();
    const root=document.getElementById('messages');if(!root||root.querySelector('[data-dm-search]'))return;
    const title=root.querySelector('.title');const search=document.createElement('div');search.setAttribute('data-dm-search','');search.style.cssText='margin:0 0 14px;position:relative';search.innerHTML='<input data-dm-user-search class="search-input" inputmode="text" autocomplete="off" placeholder="Kullanıcı ID ara…" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.055);border:1px solid #ffffff14;color:#fff;border-radius:18px;padding:13px 45px 13px 15px;outline:none"><button data-dm-search-btn class="primary" style="position:absolute;right:5px;top:5px;height:36px;border-radius:14px">⌕</button><div data-dm-search-result style="margin-top:7px"></div>';title?.parentNode?.insertBefore(search,title.nextSibling);
    const controls=document.createElement('div');controls.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:7px';const notify=document.createElement('button');notify.type='button';notify.textContent=window.ErisNotifications?.enabled===false?'Bildirimleri aç':'Bildirimleri kapat';notify.style.cssText='width:100%;min-width:0;min-height:40px;padding:8px;border:1px solid #ffffff14;border-radius:12px;background:#ffffff05;color:#bdb3c7;font-size:10px';notify.onclick=async()=>{notify.disabled=true;try{const hidden=window.ErisNotifications?.enabled!==false;const p=await window.ErisPlatform.api('/me/privacy',{method:'PATCH',body:JSON.stringify({hide_notifications:hidden})});window.ErisNotifications?.apply(p);notify.textContent=p.hide_notifications?'Bildirimleri aç':'Bildirimleri kapat';if(!hidden&&'Notification' in window&&Notification.permission==='default')await Notification.requestPermission();}catch(e){window.toast?.(e.message)}finally{notify.disabled=false}};notify.dataset.dmNotifications='';window.addEventListener('erischat:notification-settings',e=>{notify.textContent=e.detail?.enabled===false?'Bildirimleri aç':'Bildirimleri kapat'});const archive=document.createElement('button');archive.type='button';archive.textContent='Arşiv';archive.style.cssText='width:100%;min-width:0;min-height:40px;padding:8px;border:1px solid #ffffff14;border-radius:12px;background:#ffffff05;color:#bdb3c7;font-size:10px';archive.onclick=()=>{inboxFolder='archive';selectedConversations.clear();loadConversations()};controls.append(notify,archive);search.append(controls);
    const input=search.querySelector('[data-dm-user-search]'),out=search.querySelector('[data-dm-search-result]');let searchRevision=0;input.addEventListener('input',()=>{searchRevision++;out.replaceChildren()});const run=async()=>{const revision=++searchRevision,q=input.value.trim();if(!q){out.innerHTML='';return}if(/^\d{6}$/.test(q)){input.value='';out.replaceChildren();await enterLockedFolder(q);return}out.innerHTML='<div class="card" style="padding:10px;font-size:9px;color:#aaa">Aranıyor…</div>';try{const u=await api().api('/users/'+encodeURIComponent(q));if(revision!==searchRevision)return;const publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';out.innerHTML='<button type="button" class="item card" style="width:100%;text-align:left"><div class="ava round">👤</div><div class="grow"><b>'+escapeHtml(u.nickname||'Anonim kullanıcı')+'</b><small>ID: '+escapeHtml(publicId)+' • Profili görüntüle</small></div></button>';renderAvatar(out.querySelector('.ava'),avatarValue(u.avatar_asset||u.avatar_url||u.avatar,String(u.nickname||'A').slice(0,1).toUpperCase()),String(u.nickname||'A').slice(0,1).toUpperCase());window.ErisRoleBadges?.bind(out.querySelector('b'),u);out.querySelector('button').onclick=()=>loadUserProfile(u.id||q)}catch(e){if(revision!==searchRevision)return;out.innerHTML='<div class="card" style="padding:10px;font-size:9px;color:#ff9dbd">Kullanıcı bulunamadı.</div>'}};search.querySelector('[data-dm-search-btn]').setAttribute('aria-label','Kullanıcı ara');input.setAttribute('aria-label','Kullanıcı ID veya kilitli sohbet şifresi');search.querySelector('[data-dm-search-btn]').innerHTML=dmIcon('search');search.querySelector('[data-dm-search-btn]').onclick=run;input.onkeydown=e=>{if(e.key==='Enter')run()};installFolderControls(root);
  }
  async function loadConversations() {
    installMessageSearch();
    if (!(localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token'))) return;
    const list = document.querySelector('#messages .list');
    if (!list || !api()?.conversations) return;
    const revision=++listRevision,folder=inboxFolder,user=currentUserId;
    const valid=()=>revision===listRevision&&folder===inboxFolder&&(!user||String(user)===String(currentUserId));
    list.setAttribute('aria-busy','true');
    try {
      if (!currentUserId && api().getMe) {
        try {
          const me = await api().getMe();
          if(revision!==listRevision)return;
          currentUserId = me?.id || null;
        } catch (error) {
          console.warn('[ErisChat] current user unavailable', error);
        }
      }
      if (!currentUserId) return;
      const payload = await api().api('/conversations?folder='+folder+'&limit=100');
      if(!valid())return;
      const items = asList(payload, ['conversations', 'items', 'data']);
      renderFolderControls(document.getElementById('messages'));
      loadedForUserId = currentUserId;
      if (!items.length) {
        list.innerHTML = '<div class="dm-list-state"><span aria-hidden="true">'+dmIcon('chat')+'</span><b>'+(folder==='archive'?'Arşivin boş':folder==='locked'?'Kilitli sohbet yok':'İlk sohbetini başlat')+'</b><p>Bir kullanıcı ID’si aratarak konuşmaya başlayabilirsin.</p></div>';
        return;
      }
      const participants = await Promise.all(items.map(c => c.type === 'welcome' ? Promise.resolve({ nickname: 'ErisChat' }) : resolveParticipant(c)));
      if(!valid())return;
      list.replaceChildren();
      items.forEach((c, index) => {
        const other = participants[index] || {};
        const id = c.id || c.conversation_id;
        if (!id) return;
        const family = c.type === 'family' || / aile sohbeti$/i.test(String(c.name || ''));
        const welcome = c.type === 'welcome';
        const name = family ? (c.name || 'Aile sohbeti') : (welcome ? 'ErisChat' : (other.nickname || other.name || c.name || 'Kullanıcı'));
        const avatar = avatarValue(other.avatar_asset || other.avatar_url || other.avatar, name.slice(0, 1).toUpperCase());
        const b = document.createElement('button');
        b.className = 'item';b.dataset.conversationId=String(id);
        b.innerHTML = '<div class="ava round"></div><div class="grow"><b></b><small></small></div><span class="dm-unread" hidden></span>';
        renderAvatar(b.querySelector('.ava'), family ? '👪' : avatar, name.slice(0, 1).toUpperCase());
        b.querySelector('b').textContent = name;if(!family&&!welcome)window.ErisRoleBadges?.bind(b.querySelector('b'),other);
        b.querySelector('small').textContent = c.last_message || (family ? 'Aile sohbeti' : 'Mesajlaşma');
        const badge = b.querySelector('.dm-unread');
        const unread = Number(c.unread_count || 0);
        if (Number.isFinite(unread) && unread > 0 && c.last_message) { badge.hidden = false; badge.textContent = unread > 99 ? '99+' : String(unread); }
        else badge.remove();
        b.classList.toggle('dm-list-selected',selectedConversations.has(String(id)));
        let held=false,timer=null,x=0,y=0;
        const toggle=()=>{const key=String(id);if(selectedConversations.has(key))selectedConversations.delete(key);else selectedConversations.add(key);b.classList.toggle('dm-list-selected',selectedConversations.has(key));renderFolderControls(document.getElementById('messages'))};
        b.addEventListener('pointerdown',e=>{x=e.clientX;y=e.clientY;held=false;clearTimeout(timer);timer=setTimeout(()=>{held=true;toggle()},520)});
        b.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-x)>12||Math.abs(e.clientY-y)>12)clearTimeout(timer)});
        ['pointerup','pointercancel','pointerleave'].forEach(type=>b.addEventListener(type,()=>clearTimeout(timer)));
        b.oncontextmenu=e=>{e.preventDefault();if(!held){held=true;toggle()}};
        b.onclick = e => {if(held){held=false;e.preventDefault();return}if(selectedConversations.size){toggle();return}window.__erisActiveDmUserId = family || welcome ? null : (other.id || other.user_id || null); openRealChat(id, name, family ? '👪' : avatar, window.__erisActiveDmUserId); };
        list.appendChild(b);
      });
      renderFolderControls(document.getElementById('messages'));
    } catch (e) {
      console.warn('[ErisChat] conversations unavailable', e);
      if(valid())showListError(list);
    }finally{if(revision===listRevision)list.setAttribute('aria-busy','false')}
  }

  function bindSender(chat) {
    const input = chat.querySelector('.compose #chatInput, .compose input:not([type=range])');
    const send = chat.querySelector('.compose .primary');
    if (!send || send.dataset.realBound) return;
    send.dataset.realBound = '1';
    send.onclick = async () => {
      const id = activeConversationId;
      const text = input?.value?.trim();
      const body = chat.querySelector('.chatBody');
      if (!id || !text || !body) return;
      try {
        send.disabled=true;
        const m = await sendMessage(id, text);
        if(String(activeConversationId)!==String(id))return;
        appendMessageOnce(body, m, true);
        if(input.value.trim()===text)input.value = '';
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
    const revision=++chatRevision;
    activeConversationId = id;
    window.__erisActiveDmUserId = participantId || null;
    selectedMessages.clear();allMessagesSelected=false;messageSelectionMode=false;refreshSelectionBar();
    chat.classList.remove('eris-floating-dm');
    chat.classList.add('show');
    const title = chat.querySelector('.chatHead b');
    if (title) {title.textContent = name;window.ErisRoleBadges?.bind(title,participantId);}
    installChatTools(chat);
    window.ErisCalls?.syncChat?.();
    const compose=chat.querySelector('.compose');
    if(compose){compose.hidden=name==='ErisChat';compose.style.display=name==='ErisChat'?'none':'';compose.querySelector('[data-dm-gift]')?.toggleAttribute('hidden',/ aile sohbeti$/i.test(name)||name==='ErisChat');}
    renderAvatar(chat.querySelector('.chatHead .ava'), avatar, name?.slice(0, 1)?.toUpperCase());
    releaseMediaUrls(body);body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Mesajlar yükleniyor…</div>';
    try {
      const payload = await api().messages(id);
      if(revision!==chatRevision || String(activeConversationId)!==String(id))return;
      const messages = asList(payload, ['messages', 'items', 'data']);
      body.innerHTML = '';
      if (!messages.length) body.innerHTML = '<div class="muted" style="font-size:10px;text-align:center">Henüz mesaj yok.</div>';
      messages.forEach(m => {
        const senderId = m.sender_id ?? m.user_id;
        const mine = name==='ErisChat' ? false : (typeof m.is_mine === 'boolean' ? m.is_mine : String(senderId) === String(currentUserId));
        body.appendChild(renderMessage(m, mine));
      });
      refreshSelectionBar();
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      console.warn('[ErisChat] messages unavailable', e);
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
  }

  async function sendMessage(id, text) {
    if (!id || !text?.trim() || !api()?.sendMessage) throw new Error('Geçerli konuşma gerekli.');
    if(textSends.has(String(id)))return textSends.get(String(id));
    const task=(async()=>{const message=await api().sendMessage(id,text.trim());
      if(String(activeConversationId)===String(id))appendMessageOnce(document.querySelector('#chat .chatBody'),message,true);
      return message;})();
    textSends.set(String(id),task);
    try{return await task}finally{textSends.delete(String(id))}
  }
  function handleRealtimeMessage(event) {
    const data = event?.detail;
    if (data?.type === 'dm_read' && data.conversation_id) {
      if (String(activeConversationId||'') !== String(data.conversation_id)) return;
      document.querySelectorAll('#chat .bubble.me[data-message-id]').forEach(row=>{if(Number(row.dataset.messageId)<=Number(data.read_up_to||0)){row.dataset.read='1';const mark=row.querySelector('.dm-checks');if(mark){mark.textContent='✓✓';mark.setAttribute('aria-label','Okundu')}}});
      return;
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
      const mine = String(data.sender_id || '') === String(currentUserId || '');
      appendMessageOnce(body, data, mine);
      if(data.gift_key)window.dispatchEvent(new CustomEvent('erischat:dm-gift',{detail:data}));
      body.scrollTop = body.scrollHeight;
      if (!mine) api().messages(id).catch(()=>{});
    } else if (String(data.sender_id || '') !== String(currentUserId || '') && window.ErisNotifications?.enabled!==false && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(data.sender_nickname || 'Yeni mesaj', {body:data.text||'Yeni mesaj aldınız.',tag:'dm-'+data.conversation_id}); } catch (_) {}
    }
    loadConversations();
  }

  // HTTP reconciliation also covers reconnects and multi-worker socket delivery.
  let reconciling=false;
  async function reconcileChat(){
    const id=activeConversationId,revision=chatRevision,chat=$('chat');
    if(reconciling||!id||!chat?.classList.contains('show')||document.visibilityState==='hidden')return;
    reconciling=true;
    try{const rows=asList(await api().messages(id),['messages','items','data']);
      if(revision!==chatRevision||String(activeConversationId)!==String(id))return;
      const body=chat.querySelector('.chatBody'),nearBottom=body.scrollHeight-body.scrollTop-body.clientHeight<80;
      for(const m of rows){const mine=String(m.sender_id||m.user_id)===String(currentUserId);const row=appendMessageOnce(body,m,mine);if(mine&&m.is_read){row.dataset.read='1';const marks=row.querySelector('.dm-checks');if(marks)marks.textContent='✓✓'}}
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
        if (data?.type === 'dm_message' || data?.type === 'dm_read') window.dispatchEvent(new CustomEvent('erischat:event', {detail:data}));
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
      currentUserId = event.detail.user?.id || currentUserId;
      connectDmSocket();
      if (currentUserId !== loadedForUserId) loadConversations();
    } else if (event?.detail?.state === 'logged_out') {
      listRevision++;chatRevision++;activeConversationId=null;
      currentUserId = null;
      loadedForUserId = null;
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
