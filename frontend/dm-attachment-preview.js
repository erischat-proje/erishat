/* Local attachment review. File selection never starts an upload. */
(() => {
  'use strict';
  const MIMES={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',mp4:'video/mp4',webm:'video/webm'};
  function prepare(file,type,seconds=0){
    const maximum=type==='video'?25*1024*1024:type==='document'?20*1024*1024:12*1024*1024;
    if(!file||!file.size)throw new Error('Dosya boş. Başka bir dosya seçin.');
    if(file.size>maximum)throw new Error('Dosya en fazla '+maximum/(1024*1024)+' MB olabilir.');
    const ext=String(file.name||'').split('.').at(-1).toLowerCase(),mime=String(file.type||'').split(';',1)[0].toLowerCase();
    if(type==='document'){
      if(!/^(pdf|txt|csv|zip|docx|xlsx|pptx)$/.test(ext))throw new Error('PDF, TXT, CSV, ZIP, DOCX, XLSX veya PPTX belgesi seçin.');
    }else{
      const actual=mime||MIMES[ext];
      if(type==='image'&&!['image/jpeg','image/png','image/webp','image/gif'].includes(actual))throw new Error('JPEG, PNG, WEBP veya GIF fotoğrafı seçin.');
      if(type==='video'&&!['video/mp4','video/webm'].includes(actual))throw new Error('MP4 veya WEBM videosu seçin.');
      if(!['image','video'].includes(type))throw new Error('Dosya türü desteklenmiyor.');
      if(!mime)file=new File([file],file.name,{type:actual,lastModified:file.lastModified});
    }
    if(type==='image'&&![0,10,20,30].includes(seconds)||type!=='image'&&seconds!==0)throw new Error('Geçersiz gönderim süresi.');
    return file;
  }
  function open({panel,host,file,type,seconds=0,name,valid,send,reselect,closed=()=>{}}){
    file=prepare(file,type,seconds);let alive=true,sending=false,url=null,media=null,invalid=false;
    const content=panel.querySelector('[data-content]'),status=panel.querySelector('[data-status]');panel.dataset.attachmentPreview='';panel.dataset.kind=type;
    content.innerHTML='<p data-preview-target></p><b data-preview-name></b><small data-preview-size></small><p data-preview-duration></p><div data-preview-art></div><label data-preview-caption-label>Açıklama (isteğe bağlı)<textarea data-preview-caption maxlength="1000" rows="3" placeholder="Bu dosya için bir açıklama yaz…"></textarea><small data-preview-caption-count>0 / 1000</small></label><footer><button type="button" data-preview-cancel>Vazgeç</button><button type="button" data-preview-change>Başka dosya seç</button><button type="button" data-preview-send>Gönder</button></footer>';
    content.querySelector('[data-preview-target]').textContent='Gönderilecek sohbet: '+(name||'Sohbet');content.querySelector('[data-preview-name]').textContent=file.name||'Dosya';
    content.querySelector('[data-preview-size]').textContent=(file.size/(1024*1024)<1?(file.size/1024).toFixed(1)+' KB':(file.size/(1024*1024)).toFixed(1)+' MB')+' · '+({image:'Fotoğraf',video:'Video',document:'Belge'}[type]);
    content.querySelector('[data-preview-duration]').textContent=seconds?'Süreli fotoğraf · '+seconds+' saniye · Süre alıcı açtığında başlar.':type==='image'?'Normal fotoğraf':type==='video'?'Video · En fazla 2 dakika':'Belgenin içeriği bu ekranda açılmaz.';
    const sendButton=content.querySelector('[data-preview-send]');
    const caption=content.querySelector('[data-preview-caption]'),captionCount=content.querySelector('[data-preview-caption-count]');
    content.querySelector('[data-preview-caption-label]').hidden=seconds>0;caption.disabled=seconds>0;caption.oninput=()=>{captionCount.textContent=caption.value.length+' / 1000'};
    const update=()=>{panel.dataset.sending=String(sending);panel.querySelectorAll('button').forEach(b=>b.disabled=sending);sendButton.disabled=sending||invalid;caption.disabled=sending||seconds>0};
    function close(){
      if(!alive)return;alive=false;observer.disconnect();window.removeEventListener('pagehide',close);
      if(media){media.onerror=media.onloadedmetadata=null;if(type==='video'){media.pause();media.removeAttribute('src');media.load()}else media.removeAttribute('src')}
      if(url)URL.revokeObjectURL(url);file=null;panel.remove();closed();
    }
    const ensure=()=>{if(!alive)return false;if(!panel.isConnected||!valid()){close();return false}return true};
    const observer=new MutationObserver(()=>{if(alive&&(!panel.isConnected||!host.isConnected||!valid()))close()});
    observer.observe(document.body,{childList:true});observer.observe(host,{attributes:true,attributeFilter:['class','hidden']});window.addEventListener('pagehide',close);
    if(type==='image'||type==='video'){
      url=URL.createObjectURL(file);media=document.createElement(type==='image'?'img':'video');media.src=url;media.setAttribute('aria-label',type==='image'?'Gönderilecek fotoğraf':'Gönderilecek video');
      if(type==='image')media.alt='Gönderilecek fotoğraf';else{media.controls=true;media.preload='metadata';media.playsInline=true;media.onloadedmetadata=()=>{if(!alive)return;invalid=Number.isFinite(media.duration)&&media.duration>120;if(invalid)status.textContent='Video en fazla 2 dakika olabilir. Başka bir video seçin.';update()}};
      media.onerror=()=>{if(alive&&!sending)status.textContent='Önizleme bu cihazda açılamadı. Göndermeden önce dosyanı kontrol edebilirsin.'};content.querySelector('[data-preview-art]').append(media);
    }else{const art=document.createElement('span');art.className='dm-document-review-icon';art.textContent='▤';art.setAttribute('aria-hidden','true');content.querySelector('[data-preview-art]').append(art)}
    content.querySelector('[data-preview-cancel]').onclick=()=>{if(!sending)close()};content.querySelector('[data-preview-change]').onclick=()=>{if(!sending&&ensure()){close();reselect?.()}};
    panel.querySelector('[data-close]').onclick=()=>{if(!sending)close()};const originalKeys=panel.onkeydown;panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();if(!sending)close()}else if(sending&&e.key==='Tab')e.preventDefault();else originalKeys?.(e)};
    sendButton.onclick=async()=>{
      if(sending||invalid||!ensure())return;const text=seconds?'':caption.value.trim();if(text.length>1000){status.textContent='Açıklama en fazla 1000 karakter olabilir.';caption.focus();return}sending=true;status.textContent='Dosya gönderiliyor…';if(type==='video')media.pause();update();status.tabIndex=-1;status.focus();
      try{await send(file,text);if(alive)close()}
      catch(e){if(ensure()){sending=false;status.textContent=e.message||'Gönderilemedi. Dosyan burada; yeniden deneyebilirsin.';update();sendButton.focus()}}
    };
    status.textContent='Kontrol ettikten sonra Gönder düğmesine dokun.';update();sendButton.focus();return {close};
  }
  window.ErisAttachmentPreview={open,prepare};
})();
