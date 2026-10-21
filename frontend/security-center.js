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
 function reset(title){body.replaceChildren();body.append(el('h3',title));const note=el('div','','ea-sub');note.setAttribute('data-security-error','');note.style.color='var(--ea-danger)';body.append(note);}
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
       a.append(button('Şikâyet soruşturması',cases));
       a.append(button('Sorgulama Kayıtları',logs));
       a.append(button('Güvenlik oturumunu kapat',async()=>{await req('/revoke','POST');await render()}));
     }
   }
   body.append(button('← Yönetim menüsüne dön',()=>{back?.()}));
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
   card.append(button('E-postayı doğrula',async()=>{
     const out=await req('/challenges/verify','POST',{challenge_id:challenge.challenge_id});challenge=null;
     if(out.archived)await logs();else await render();
   }));nav();
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
 async function logs(showArchived=false){reset('🕘 Sorgulama Kayıtları');
   const d=await req('/logs?include_archived='+(showArchived?'true':'false'));
   body.append(button(showArchived?'Güncel kayıtlar':'Arşivlenmişleri de göster',()=>logs(!showArchived)));
   if(!d.items.length)line(body,'Kayıt bulunamadı.');
   for(const r of d.items){const card=group('#'+r.id+' • '+r.kind);
     line(card,new Date(r.created_at).toLocaleString('tr-TR'));if(r.subject)line(card,r.subject);if(r.details)line(card,r.details);
     card.append(button('İkinci e-posta doğrulamasıyla listeden kaldır',()=>startChallenge('archive',r.id)));
   }nav();
 }
 window.ErisSecurityCenter={open:async(panel,onBack,tokenResolver)=>{
   body=panel?.querySelector('#eaBody');back=onBack;
   if(typeof tokenResolver==='function')provider=tokenResolver;
   if(!body)return;try{await render()}catch(e){reset('Güvenlik Merkezi');showError(e);nav();}
 }};
})();
