/* LidyaChat Security Center: owner-only, case-scoped investigations. */
(() => {
 'use strict';
 const rootApi=(window.ERISCHAT_API_BASE||window.ERIS_API||localStorage.getItem('erischat.apiBase')||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'').replace(/\/v1$/,'');
 const apiPath='/v1/security';
 const auth=()=>localStorage.getItem('erischat.token')||localStorage.getItem('eris.token')||sessionStorage.getItem('erischat.token')||window.ErisAuth?.token?.()||'';
 // Always use the same token resolver as admin-live where possible.
 const originalToken=()=>{
   const keys=['erischat.session','eris.session','erischat.token','erischat.authToken','eris.authToken','access_token'];
   for(const key of keys){for(const store of [localStorage,sessionStorage]){
     const raw=store.getItem(key);if(!raw)continue;
     if(raw[0]==='{'){try{const obj=JSON.parse(raw);const v=obj.token||obj.access_token||obj.accessToken;if(v)return v}catch{}}
     else if(raw.length>20)return raw;
   }}
   return auth();
 };
 let provider=originalToken;
 const req=async(path,method='GET',data)=>{
   const res=await fetch(rootApi+apiPath+path,{method,headers:{Authorization:'Bearer '+provider(),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
   const payload=await res.json().catch(()=>({}));if(!res.ok)throw Error(payload.detail||'Güvenlik işlemi başarısız');return payload;
 };
 let body=null,back=null,challenge=null,status=null;
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node};
 const button=(text,handler)=>{const b=el('button',text,'ea-action');b.type='button';b.onclick=async()=>{b.disabled=true;try{await handler()}catch(e){showError(e)}finally{b.disabled=false}};return b};
 const showError=e=>{const n=body?.querySelector('[data-security-error]');if(n)n.textContent=e.message||String(e);};
 const group=(title)=>{const div=el('article',undefined,'eris-admin-card');div.append(el('h4',title));body.append(div);return div};
 const line=(parent,text)=>parent.append(el('p',text));
 const copy=(text)=>navigator.clipboard?.writeText(text).catch(()=>{
   prompt('Kopyalamak için metni seç:',text);
 })||prompt('Kopyalamak için metni seç:',text);
 let mediaAbort=new AbortController();
 const objectUrls=new Set();
 function releaseMedia(){mediaAbort.abort();mediaAbort=new AbortController();
   for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();}
 function reset(title){releaseMedia();body.replaceChildren();body.append(el('h3',title));const note=el('div','','ea-sub');note.setAttribute('data-security-error','');note.style.color='var(--ea-danger)';body.append(note);}
 function nav(){body.append(button('← Güvenlik Merkezi',render));}
 function connected(v){return Boolean(v?.['destek@lidyachat.com']&&v?.['erischat@erischat.com']);}
 async function render(){reset('🛡 Güvenlik Merkezi');status=await req('/status');
   line(body,status.active?'Geçici güvenlik oturumu açık • '+new Date(status.expires_at).toLocaleString('tr-TR'):'Geçici güvenlik oturumu kapalı');
   const account=group('Google Workspace bağlantıları');
   for(const mail of ['destek@lidyachat.com','erischat@erischat.com']){
     const ready=status.connected?.[mail];line(account,mail+' — '+(ready?'Bağlandı ✓':'Bağlanmadı'));
     account.append(button(ready?'Yeniden yetkilendir':'Google hesabını bağla',async()=>{
       const reply=await req('/google/start','POST',{mailbox:mail});
       const link=document.createElement('a');link.href=reply.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Google ile bağlanmak için buraya dokun';link.style.cssText='display:block;margin:12px 0;color:var(--ea-gold);text-decoration:underline';
       account.append(link);link.focus();
     }));
   }
   if(!status.configured)line(account,'Railway SECURITY_* değişkenleri henüz tamamlanmadı.');
   if(connected(status.connected)){
     const a=group('30 dakikalık güvenlik oturumu');
     if(!status.active)a.append(button('E-posta ile erişim doğrulaması başlat',()=>startChallenge('access')));
     else{
       a.append(button('🛡 Kullanıcı ID ile DM incelemesi',dmInvestigations));
       a.append(button('Sorgulama Kayıtları',logs));
       a.append(button(
        '♛ Kral Animasyon Tanımlama',
        nobilityAvatarGrant
       ));
       a.append(button('Güvenlik oturumunu kapat',async()=>{await req('/revoke','POST');await render()}));
     }
   }
   body.append(button('← Yönetim menüsüne dön',()=>{back?.()}));
 }

 async function nobilityAvatarGrant(){
   status=await req('/status');

   if(!status.active){
     throw Error('Aktif güvenlik oturumu gerekli.');
   }

   reset('♛ Kral Animasyon Tanımlama');

   const card=group('Kişiye özel animasyonlu avatar');

   line(card,'Yalnızca aktif Kral üyeleri için.');
   line(card,'15 gün geçerlidir. Süre dolmadan değiştirilemez.');
   line(card,'GIF / WebP • 2 MB • 512 × 512 • 10 saniye');

   const id=document.createElement('input');
   id.type='text';
   id.inputMode='numeric';
   id.maxLength=12;
   id.placeholder='Kullanıcı ID numarası';
   id.setAttribute('aria-label','Kullanıcı ID');
   id.style.cssText='width:100%;box-sizing:border-box;margin:10px 0;padding:12px;border:1px solid var(--ea-line);border-radius:10px;background:var(--ea-panel);color:inherit';

   const file=document.createElement('input');
   file.type='file';
   file.accept='image/gif,image/webp';
   file.setAttribute('aria-label','Animasyon dosyası');
   file.style.cssText='display:block;width:100%;margin:12px 0';

   const result=el('p','');
   const openedBody=body;

   // KING ROYAL AVATAR PRESETS V5 — DA-only grant flow; no entitlement changes.
   const royalPresets=Object.freeze({
     male:'king-avatar-male.webp',
     female:'king-avatar-female.webp'
   });
   const preset=document.createElement('select');
   preset.setAttribute('aria-label','Hazır Kral animasyonu');
   preset.style.cssText='display:block;width:100%;box-sizing:border-box;margin:10px 0;padding:12px;border:1px solid var(--ea-line);border-radius:10px;background:var(--ea-panel);color:inherit';
   for(const [value,label] of [['','Kendi GIF / WebP dosyanı seç'],['male','Kral — Erkek animasyonu'],['female','Kral — Kadın animasyonu']]){
     const option=document.createElement('option');
     option.value=value;
     option.textContent=label;
     preset.append(option);
   }
   const preview=document.createElement('img');
   preview.alt='Seçilen Kral animasyonu önizlemesi';
   preview.hidden=true;
   preview.style.cssText='width:96px;height:96px;object-fit:cover;border-radius:50%;margin:10px auto;border:2px solid var(--ea-line)';
   const presetURL=key=>'./assets/lidya-nobility/king/'+royalPresets[key];
   preset.onchange=()=>{
     const key=preset.value;
     file.disabled=Boolean(key);
     preview.hidden=!Object.hasOwn(royalPresets,key);
     if(preview.hidden)preview.removeAttribute('src');
     else preview.src=presetURL(key);
   };
   card.append(id,preset,preview,file,result);

   card.append(button('Animasyonu Tanımla',async()=>{
     const publicId=id.value.trim();
     const presetKey=preset.value;
     const customFile=file.files?.[0];
     let selected=presetKey ? null : customFile;
     if(presetKey&&!Object.hasOwn(royalPresets,presetKey)){
       throw Error('Geçersiz hazır animasyon.');
     }

     if(!/^[0-9]{10,12}$/.test(publicId)){
       throw Error('Geçerli kullanıcı ID girin.');
     }

     if(!presetKey&&!selected){
       throw Error('Animasyon dosyası seçin.');
     }

     if(selected&&selected.size>2*1024*1024){
       throw Error('Dosya en fazla 2 MB olabilir.');
     }

     const token=provider();

     if(!token)throw Error('Giriş gerekli.');

     const fresh=await req('/status');

     if(!fresh.active){
       throw Error('Güvenlik oturumu sona erdi.');
     }

     if(!confirm(publicId+' ID numaralı kullanıcıya 15 günlük animasyon tanımlansın mı?')){
       return;
     }

     if(provider()!==token||body!==openedBody||!card.isConnected){
       throw Error('Oturum veya ekran değişti.');
     }

     if(presetKey){
       const asset=await fetch(presetURL(presetKey),{cache:'no-store'});
       if(!asset.ok)throw Error('Hazır animasyon alınamadı.');
       const blob=await asset.blob();
       if(!blob.size||blob.size>2*1024*1024){
         throw Error('Hazır animasyon dosyası geçersiz.');
       }
       selected=new File([blob],royalPresets[presetKey],{type:'image/webp'});
       if(provider()!==token||body!==openedBody||!card.isConnected||
          preset.value!==presetKey||id.value.trim()!==publicId){
         throw Error('Oturum veya seçim değişti.');
       }
     }
     const data=new FormData();
     data.append('file',selected);

     result.textContent='Animasyon doğrulanıyor…';

     const response=await fetch(
       rootApi+'/v1/nobility/admin/animated-avatar/'+
       encodeURIComponent(publicId),
       {
         method:'POST',
         headers:{Authorization:'Bearer '+token},
         body:data,
         cache:'no-store'
       }
     );

     const payload=await response.json().catch(()=>({}));

     if(!response.ok||payload.ok!==true){
       result.textContent='';
       throw Error(
         typeof payload.detail==='string'
          ?payload.detail
          :'Animasyon tanımlanamadı.'
       );
     }

     if(provider()!==token||!card.isConnected)return;

     result.textContent=
       '✓ Animasyon tanımlandı. Bitiş: '+
       new Date(payload.expires_at).toLocaleString('tr-TR');

     file.value='';
     preset.value='';
     preset.onchange();
     id.value='';
   }));

   nav();
 }

 async function startChallenge(purpose,eventId){
   const data={purpose};if(eventId)data.event_id=eventId;
   challenge=await req('/challenges','POST',data);showChallenge();
 }
 function showChallenge(){reset('✉ Workspace e-posta doğrulaması');
   const card=group('Bu e-postayı kendin gönder');
   line(card,'Gönderen: '+challenge.sender);line(card,'Alıcı: '+challenge.receiver);
   line(card,'Konu: '+challenge.subject);line(card,'Kod 10 dakika geçerli ve tek kullanımlıktır.');
   card.append(button('Konu başlığını kopyala',()=>copy(challenge.subject)));
   card.append(button('Gmail’i aç',()=>window.open('https://mail.google.com/mail/','_blank','noopener,noreferrer')));
   const info=el('p','E-postayı gönderdikten sonra aşağıdan doğrula. Gönderilenler ve gelen kutusunda aynı ileti bulunmalı.');card.append(info);
   const verifyButton=button('E-postayı doğrula',async()=>{
     if(verifyButton.disabled)return;
     verifyButton.disabled=true;
     try{
       const out=await req('/challenges/verify','POST',{challenge_id:challenge.challenge_id});challenge=null;
       if(out.archived||out.all_archived)await logs();else await render();
     }finally{
       verifyButton.disabled=false;
     }
   });
   card.append(verifyButton);nav();
 }
 async function dmInvestigations(){reset('🛡 Kullanıcı ID ile DM incelemesi');
   line(body,'Gerekçeli bir güvenlik dosyası başlat. Yalnızca doğrulanmış güvenlik oturumu boyunca hesabın DM konuşmaları incelenebilir; her erişim kaydedilir.');
   const card=group('İncelenecek kullanıcı');
   const publicId=el('input');publicId.type='text';publicId.inputMode='numeric';publicId.maxLength=32;
   publicId.placeholder='Kullanıcı ID numarası';publicId.setAttribute('aria-label','Kullanıcı ID numarası');
   const category=el('select');category.setAttribute('aria-label','Güvenlik olayı türü');
   for(const [key,label] of [['','Olay türü seç'],['threat','Tehdit'],['blackmail','Şantaj'],['scam','Dolandırıcılık'],['harassment','Taciz'],['child_safety','Çocuk güvenliği'],['other_safety','Diğer ciddi güvenlik olayı']]){
     const option=el('option',label);option.value=key;category.append(option);
   }
   const reason=el('textarea');reason.placeholder='Olay gerekçesi ve elindeki kanıtlar (en az 20 karakter)';reason.maxLength=1500;
   card.append(publicId,category,reason,button('Kullanıcının DM konuşmalarını incele',async()=>{
     if(!/^\d{6,32}$/.test(publicId.value.trim()))throw Error('Geçerli bir kullanıcı ID numarası yaz. Şikâyet numarası değil.');
     if(!category.value)throw Error('Önce olay türünü seç.');
     if(reason.value.trim().length<20)throw Error('Güvenlik gerekçesi en az 20 karakter olmalı.');
     const c=await req('/dm-inspections','POST',{public_id:publicId.value.trim(),category:category.value,reason:reason.value.trim()});
     await dmConversationList(c.id,0,c.target_public_id);
   }));
   const list=group('Bu oturumdaki açık güvenlik incelemeleri');
   const cases=await req('/dm-inspections');
   if(!cases.items.length)line(list,'Henüz açık bir inceleme yok.');
   for(const c of cases.items){const item=el('div',undefined,'eris-admin-card');
     line(item,(c.nickname||'Kullanıcı')+' • ID '+(c.public_id||'—'));
     line(item,'Dosya: '+c.category+' • Oturum bitişi: '+new Date(c.expires_at).toLocaleString('tr-TR'));
     item.append(button('DM kutusunu aç',()=>dmConversationList(c.id,0,c.public_id)));
     item.append(button('Dosyayı kapat',async()=>{await req('/dm-inspections/'+encodeURIComponent(c.id)+'/close','POST');await dmInvestigations();}));
     list.append(item);
   }
   nav();
 }
 async function dmConversationList(caseId,offset=0,targetPublicId=''){
   reset('💬 DM konuşmaları • '+targetPublicId);
   line(body,'Bu listedeki hesaplar seçilen kullanıcının birebir DM konuşma ortaklarıdır. Grup sohbetleri gösterilmez.');
   const d=await req('/dm-inspections/'+encodeURIComponent(caseId)+'/conversations?offset='+offset+'&limit=25');
   if(!d.items.length)line(body,'Bu sayfada DM konuşması bulunamadı.');
   for(const c of d.items){const card=group((c.peer_nickname||'Kullanıcı')+' • ID '+(c.peer_public_id||'—'));
     line(card,'DM oluşturulma: '+new Date(c.created_at).toLocaleString('tr-TR'));
     card.append(button('İki tarafın mesajlarını göster',()=>dmConversationMessages(caseId,c.conversation_id,c.peer_nickname,undefined,targetPublicId)));
   }
   if(offset>0)body.append(button('← Önceki konuşmalar',()=>dmConversationList(caseId,Math.max(0,offset-25),targetPublicId)));
   if(d.has_more)body.append(button('Daha fazla konuşma →',()=>dmConversationList(caseId,d.next_offset,targetPublicId)));
   body.append(button('← İnceleme dosyaları',dmInvestigations));
 }
 async function loadInspectionMedia(mediaUrl,container,kind){
   const signal=mediaAbort.signal;
   const response=await fetch(rootApi+apiPath+mediaUrl,{
     method:'GET',headers:{Authorization:'Bearer '+provider()},
     cache:'no-store',signal});
   if(!response.ok){const d=await response.json().catch(()=>({}));throw Error(d.detail||'Medya açılamadı');}
   const blob=await response.blob();
   if(signal.aborted||!container.isConnected)return;
   if(kind==='image'&&!blob.type.startsWith('image/'))throw Error('Geçersiz fotoğraf biçimi');
   if(kind==='voice'&&!blob.type.startsWith('audio/'))throw Error('Geçersiz ses biçimi');
   const url=URL.createObjectURL(blob);objectUrls.add(url);
   if(kind==='image'){const img=el('img');img.src=url;img.alt='DM fotoğrafı';
     img.loading='lazy';img.style.cssText='max-width:100%;max-height:360px;object-fit:contain;border-radius:12px;cursor:zoom-in';
     img.onclick=()=>window.open(url,'_blank','noopener,noreferrer');container.append(img);
   }else{const audio=el('audio');audio.controls=true;audio.preload='metadata';audio.src=url;
     audio.style.cssText='width:100%;max-width:360px';container.append(audio);}
 }
 async function dmConversationMessages(caseId,conversationId,peerName,beforeId,targetPublicId){
   reset('✉ DM mesajları • '+(peerName||'Kullanıcı'));
   line(body,'Her iki tarafın sistemde saklanan mesajları • en yeniden eskiye • silinmiş/süresi dolmuş içerik gösterilmez.');
   const url='/dm-inspections/'+encodeURIComponent(caseId)+'/conversations/'+encodeURIComponent(conversationId)+'/messages?limit=50'+
          (beforeId?'&before_id='+encodeURIComponent(beforeId):'');
   const data=await req(url);
   if(!data.items.length)line(body,'Bu sayfada saklanan mesaj bulunamadı.');
   for(const m of data.items){const card=group((m.sender_nickname||'Kullanıcı')+' • '+(m.sender_public_id||'—'));
     line(card,new Date(m.created_at).toLocaleString('tr-TR')+' • Mesaj #'+m.id);
     const content=el('p',m.text);content.style.whiteSpace='pre-wrap';content.style.overflowWrap='anywhere';card.append(content);
     if(m.media_url&&(m.media_type==='image'||m.media_type==='voice')){
       const holder=el('div');holder.style.cssText='margin:8px 0;max-width:100%';card.append(holder);
       if(m.media_type==='image'){
         const info=el('span','Fotoğraf yükleniyor…');holder.append(info);
         loadInspectionMedia(m.media_url,holder,'image').then(()=>info.remove())
           .catch(err=>{if(info.isConnected)info.textContent=err.message||'Fotoğraf yüklenemedi';});
       }else{
         const play=button('▶ Sesli mesajı yükle ve oynat',async()=>{
           play.disabled=true;
           try{await loadInspectionMedia(m.media_url,holder,'voice');play.remove();}
           catch(e){play.disabled=false;play.textContent=e.message||'Ses yüklenemedi';}
         });holder.append(play);
       }
     }
   }
   if(data.has_more)body.append(button('Daha eski mesajları getir',()=>dmConversationMessages(caseId,conversationId,peerName,data.next_before_id,targetPublicId)));
   body.append(button('← DM konuşmaları',()=>dmConversationList(caseId,0,targetPublicId)));
 }
 async function cases(){reset('📋 Şikâyete bağlı soruşturmalar');const create=group('Yeni soruşturma');
   line(create,'Yalnızca mevcut şikâyette bildirilen kanıtlar incelenir; tüm özel mesajlara erişim verilmez.');
   const id=el('input');id.type='number';id.min='1';id.placeholder='Şikâyet numarası';id.setAttribute('aria-label','Şikâyet numarası');
   const reason=el('textarea');reason.placeholder='Soruşturma gerekçesi (en az 20 karakter)';reason.maxLength=1500;reason.setAttribute('aria-label','Gerekçe');
   create.append(id,reason,button('Soruşturma oluştur',async()=>{
     await req('/cases','POST',{report_id:Number(id.value),reason:reason.value});await cases();
   }));
   const data=await req('/cases');
   for(const c of data.items){const card=group('#'+c.report_id+' • '+c.status);
     line(card,'Hedef hesap: '+c.target_user_id);line(card,c.reason);
     card.append(button('Bildirilmiş kanıtı incele',()=>evidence(c.id)));
     if(c.status==='open')card.append(button('Soruşturmayı kapat',async()=>{await req('/cases/'+encodeURIComponent(c.id)+'/close','POST');await cases()}));
   }nav();
 }
 async function evidence(id){reset('Şikâyete bağlı deliller');const d=await req('/cases/'+encodeURIComponent(id)+'/evidence');
   const card=group('Şikâyet #'+d.report_id);line(card,'Kategori: '+d.category);line(card,d.reason);
   if(d.message){line(card,'Mesaj #'+d.message.id+' • '+new Date(d.message.created_at).toLocaleString('tr-TR'));
     const p=el('p',d.message.text);p.style.whiteSpace='pre-wrap';card.append(p);
   }else line(card,'Şikâyete bağlı erişilebilir mesaj kanıtı yok.');
   body.append(button('← Soruşturmalara dön',cases));
 }
 async function logs(){reset('🕘 Sorgulama Kayıtları');
   const d=await req('/logs');
   const controls=group('Geçmiş yönetimi');
   line(controls,'Tek doğrulama ile eski sorgulama geçmişi bu ekrandan kaldırılır. Korunan sistem denetim kayıtları silinmez.');
   controls.append(button('Tüm sorgulama geçmişini temizle',async()=>{
     if(!confirm('Bütün eski kayıtlar bu ekrandan kaldırılacak. Devam edilsin mi?'))return;
     await startChallenge('archive_all');
   }));
   if(!d.items.length)line(body,'Sorgulama geçmişinde gösterilecek kayıt yok.');
   for(const r of d.items){const card=group('#'+r.id+' • '+r.kind);
     line(card,new Date(r.created_at).toLocaleString('tr-TR'));if(r.subject)line(card,r.subject);if(r.details)line(card,r.details);
   }nav();
 }
 function clearExpiredInspection(){
   if(status?.active&&status.expires_at&&Date.now()>=Date.parse(status.expires_at)&&body){
     status.active=false;reset('Güvenlik oturumu süresi doldu');line(body,'DM içerikleri kapatıldı. Yeni güvenlik doğrulaması gerekli.');
     nav();
   }
 }
 setInterval(clearExpiredInspection,15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)clearExpiredInspection()});
 window.ErisSecurityCenter={open:async(panel,onBack,tokenResolver)=>{
   body=panel?.querySelector('#eaBody');back=onBack;
   if(typeof tokenResolver==='function')provider=tokenResolver;
   if(!body)return;try{await render()}catch(e){reset('Güvenlik Merkezi');showError(e);nav();}
 }};
})();
