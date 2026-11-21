/* Lidya management workspace. Existing specialist workflows stay authoritative. */
(()=>{'use strict';
const base=(window.ERISCHAT_API_BASE||window.ERIS_API||localStorage.getItem('erischat.apiBase')||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'').replace(/\/v1$/,'');
const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
const states=new WeakMap();
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
const normalize=s=>String(s||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFKD').replace(/\p{M}/gu,'');
const roleName=r=>r||'Kullanıcı';
const date=v=>v?new Date(v).toLocaleString('tr-TR'):'—';
const statusName=s=>({pending:'Karar bekliyor',executed:'Uygulandı',rejected:'Reddedildi',cancelled:'Geri çekildi'})[s]||s;
function alive(s){return s.panel.isConnected&&s.access===token();}
async function request(s,path,method='GET',body){
 if(!alive(s))throw Error('Oturum değişti. Yönetim menüsünü yeniden açın.');
 const version=s.generation;const response=await fetch(base+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+s.access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!alive(s))throw Error('Oturum değişti. Yönetim menüsünü yeniden açın.');
 if(version!==s.generation)throw Error('Görünüm değişti; güncel ekranı kullanın.');
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:response.status===422?'Form alanlarını kontrol edin.':'İşlem tamamlanamadı ('+response.status+').');return data;
}
function note(parent,text,error=false){const p=el('p',error?'aw-notice aw-error':'aw-notice',text);p.setAttribute('role',error?'alert':'status');parent.append(p);return p;}
function button(parent,title,run,cls=''){const b=el('button','aw-button '+cls,title);b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run();}catch(e){if(parent.isConnected)note(parent,e.message,true);}finally{b.disabled=false;}};parent.append(b);return b;}
function info(parent,key,value){const line=el('div','aw-pair');line.append(el('dt','',key),el('dd','',value??'—'));parent.append(line);}
function card(parent,title){const c=el('article','aw-card');if(title)c.append(el('h4','',title));parent.append(c);return c;}
function fields(parent,specs,send,submit){
 const f=el('form','aw-form'),inputs={};for(const spec of specs){const label=el('label','aw-field'),caption=el('span','',spec.title),i=el(spec.options?'select':spec.type==='textarea'?'textarea':'input');if(i.tagName==='INPUT')i.type=spec.type||'text';i.name=spec.name;i.required=spec.required!==false;
 if(spec.options)for(const [value,text] of Object.entries(spec.options)){const option=el('option','',text);option.value=value;i.append(option);}i.value=spec.value??'';
 for(const name of ['min','max','step'])if(spec[name]!==undefined)i[name]=spec[name];
 if(spec.maxLength)i.maxLength=spec.maxLength;if(spec.minLength)i.minLength=spec.minLength;if(spec.pattern)i.pattern=spec.pattern;if(spec.autocomplete)i.autocomplete=spec.autocomplete;
 inputs[spec.name]=i;label.append(caption,i);f.append(label);}
 const result=el('p','aw-result');result.setAttribute('role','status');const b=el('button','aw-button aw-primary',send);b.type='submit';f.append(b,result);parent.append(f);
 f.onsubmit=async e=>{e.preventDefault();if(b.disabled||!f.reportValidity())return;b.disabled=true;result.textContent='İşleniyor…';try{await submit(Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value])),result);if(result.isConnected&&result.textContent==='İşleniyor…')result.textContent='Kaydedildi.';}catch(error){if(result.isConnected){result.textContent=error.message;result.setAttribute('role','alert');}}finally{b.disabled=false;}};return {f,inputs,result};
}
function stage(s,title,description){s.generation++;s.body.replaceChildren();const nav=el('nav','aw-nav');button(nav,'← Yönetim menüsü',s.back);s.body.append(nav,el('h3','aw-title',title));if(description)note(s.body,description);return s.generation;}

// id-sorgu-v2: DA-scoped directory, precise counts, and detailed account view.
function directory(s,options={}){
 const version=stage(s,options.staff?'Yönetici kadrosu':'Kullanıcı ve Sistem Denetim Merkezi','Veriler canlı veritabanından alınır. Aktif hesap, çevrimiçi anlamına gelmez.');
 if(!options.staff){
  const metrics=el('section','aw-grid');s.body.append(metrics);
  request(s,'/v1/admin/workspace/users/statistics').then(d=>{
   if(!alive(s)||version!==s.generation)return;
   metrics.replaceChildren();
   for(const [name,key] of [['Toplam kullanıcı','total_users'],['Aktif hesap','active_accounts'],['Pasif hesap','inactive_accounts'],['Bugün kayıt olan','registered_today'],['Son 30 gün kayıt','registered_last_30_days'],['VIP kullanıcı','vip_accounts'],['Yetkili hesap','staff_accounts']]){
    const c=card(metrics,name);c.append(el('strong','',Number(d[key]||0).toLocaleString('tr-TR')));
   }
   note(metrics,'Çevrimiçi kullanıcı bu istatistiklere dahil değildir; ayrı canlı bağlantı verisi gerekir.');
  }).catch(e=>{if(alive(s)&&version===s.generation)note(metrics,'İstatistikler alınamadı: '+e.message,true);});
 }
 fields(s.body,[{name:'q',title:'Kullanıcı adı, profil ID veya sistem ID',value:options.q||'',required:false,maxLength:100},{name:'role',title:'Rol',value:options.role||(options.staff?'STAFF':''),required:false,options:{'':'Tümü',STAFF:'Tüm yetkililer',USER:'Standart kullanıcı',SA:'SA',UA:'UA',FA:'FA',DA:'DA'}},{name:'active',title:'Hesap durumu',value:options.active||'all',options:{all:'Tümü',active:'Aktif',inactive:'Pasif'}}],'Sorgula',v=>directory(s,{...v,staff:options.staff}));
 const summary=el('p','aw-notice','Sonuçlar yükleniyor…');s.body.append(summary);
 const list=el('div','aw-grid');s.body.append(list);
 const navigation=el('div','aw-actions');s.body.append(navigation);
 const more=button(navigation,'Sonraki 20 kullanıcı',async()=>{if(!after)return;params.set('after',after);const d=await request(s,'/v1/admin/workspace/users?'+params);if(!alive(s)||s.generation!==version)return;paint(d.items);after=d.next_after;more.hidden=!after;loaded+=d.items.length;summary.textContent='Eşleşen '+Number(d.total_matching||0).toLocaleString('tr-TR')+' kullanıcı · Gösterilen '+loaded;});
 more.hidden=true;let after=null,loaded=0;
 const params=new URLSearchParams({limit:'20',q:options.q||'',role:options.role||(options.staff?'STAFF':''),active:options.active||'all'});
 const paint=items=>{for(const p of items){const c=card(list,p.nickname),d=el('dl','aw-facts');info(d,'Profil ID',p.public_id);info(d,'Rol',roleName(p.role));info(d,'Hesap',p.is_active?'Aktif':'Pasif');info(d,'Kayıt tarihi',date(p.created_at));c.append(d);button(c,'Hesabı ayrıntılı incele',()=>profile(s,p.id,options.staff?'roles':'lookup'));}};
 request(s,'/v1/admin/workspace/users?'+params).then(d=>{if(!alive(s)||s.generation!==version)return;paint(d.items);loaded=d.items.length;summary.textContent='Eşleşen '+Number(d.total_matching||0).toLocaleString('tr-TR')+' kullanıcı · Gösterilen '+loaded;after=d.next_after;more.hidden=!after;if(!d.items.length)note(list,'Bu filtrelerde kullanıcı bulunamadı.');}).catch(e=>{if(alive(s)&&version===s.generation)summary.textContent='Sorgu hatası: '+e.message;});
 if(options.staff)button(s.body,'Rol talepleri ve kararlar',()=>roleRequests(s));
}
async function profile(s,id,kind='lookup'){
 const version=stage(s,'Kullanıcı Hesap İncelemesi','Bu görünüm salt okunur; hassas bilgiler yalnızca DA oturumu içinde sorgulanır.');
 const person=await request(s,'/v1/admin/workspace/users/'+encodeURIComponent(id));if(!alive(s)||s.generation!==version)return;
 const sections=[
  ['Kimlik ve hesap',[['Kullanıcı adı',person.nickname],['Profil ID',person.public_id],['Sistem ID',person.id],['Doğrulanmış / kayıtlı e-posta',(person.emails||[]).join(', ')||'Kayıt yok'],['Rol',roleName(person.role)],['Hesap',person.is_active?'Aktif':'Pasif'],['Kayıt tarihi',date(person.created_at)],['Son profil güncellemesi',date(person.updated_at)],['Profil tamamlandı mı?',person.profile_completed?'Evet':'Hayır'],['Cinsiyet',person.gender||'Belirtilmedi'],['Biyografi',person.bio||'Yok'],['Koşulları kabul tarihi',date(person.terms_accepted_at)]]],
  ['Bakiye, VIP ve ödeme özeti',[['Lidya bakiyesi',person.balance],['Lidya Gem',person.gem_balance],['VIP seviyesi',person.vip_level],['Yükleme sipariş kaydı',person.orders],['Google Play makbuz kaydı',person.google_play_receipts],['Bayi transferi alınan',person.dealer_transfers_received],['Ödeme temsilcisi talebi',person.assisted_payment_requests]]],
  ['Oyun ve sosyal hesap',[['Kayıtlı oyun bahisleri',person.game_bets],['Oluşturulan odalar',person.owned_rooms],['Aile üyelik kaydı',person.family_memberships]]],
  ['Moderasyon ve güvenlik özeti',[['Aktif hesap/cihaz yaptırımı',person.active_account_bans],['Aktif sohbet yaptırımı',person.active_chat_bans],['Açık olay dosyası',person.open_cases]]]
 ];
 for(const [heading,entries] of sections){const c=card(s.body,heading),d=el('dl','aw-facts');for(const [k,v] of entries)info(d,k,v??'—');c.append(d);}
 const actions=el('div','aw-actions');s.body.append(actions);
 button(actions,'Profil ID kopyala',async()=>{if(!navigator.clipboard?.writeText)throw Error('Tarayıcı panoya yazmayı desteklemiyor');await navigator.clipboard.writeText(person.public_id);note(actions,'Profil ID kopyalandı.');});
 button(actions,'Lidya ve satın alım denetimi',()=>window.LidyaManagementCenter.open('finance',{target:person.public_id}));
 button(actions,'Yetkili işlem geçmişi',()=>window.LidyaManagementCenter.open('audit',{actor:person.public_id}));
 button(actions,'İlgili olay dosyaları',()=>window.LidyaManagementCenter.open('cases',{q:person.public_id}));
 button(actions,'← Kullanıcı dizinine dön',()=>directory(s,{staff:kind==='roles'}));
 idInsightsV3(s,person,version);
 if(person.can_request_role)button(actions,'Rol değişikliği talep et',()=>roleForm(s,person));
 if(kind==='deleteaccount')deleteForm(s,person);
 else if(kind==='roles'&&person.can_request_role)roleForm(s,person);
 else if(person.can_delete)button(actions,'Hesap silme ön kontrolü',()=>profile(s,person.id,'deleteaccount'));
}
// id-sorgu-v3: read-only, DA-only additional account sections and paged records.
function insightsPairs(parent, rows){
 const dl=el('dl','aw-facts');
 for(const [label,value] of rows)info(dl,label,value??'Kayıtlı değil');
 parent.append(dl);
}
async function idInsightsV3(s,person,version){
 const host=el('section','aw-insights-v3');s.body.append(host);
 const loading=note(host,'Sosyal, VIP, güvenlik ve mali özet sorgulanıyor…');
 try{
  const data=await request(s,'/v1/admin/workspace/users/'+encodeURIComponent(person.id)+'/insights');
  if(!alive(s)||s.generation!==version||!host.isConnected)return;
  loading.remove();
  const sections=[
   ['Sosyal hesap istatistikleri',[
    ['Takipçiler',data.social.followers],['Takip edilen',data.social.following],
    ['Paylaşım kaydı',data.social.posts_recorded],['Story kaydı',data.social.stories_recorded],
    ['Yorum kaydı',data.social.comments_recorded],['Profil ziyaretçi kaydı',data.social.profile_visit_records],
    ['Engellenen kullanıcı',data.social.blocked_users]
   ]],
   ['Oda ve aile bilgileri',[
    ['Sahip olunan oda',data.rooms.owned],['Oda üyelik kaydı',data.rooms.member_records],
    ['Takip edilen oda',data.rooms.followed_rooms],['Oda moderatörlüğü kaydı',data.rooms.moderator_records],
    ['Aileler',data.rooms.families.map(x=>x.name+' ('+x.role+')').join(' · ')||'Kayıtlı değil'],
    ['Son sahip olunan odalar',data.rooms.rooms.map(x=>x.name+' · '+x.public_id+(x.active?' · Aktif':' · Pasif')).join(' | ')||'Kayıtlı değil']
   ]],
   ['VIP ve geçmiş ödeme kayıtları',[
    ['VIP seviyesi',data.vip.level],['Kazanılmış VIP seviyesi',data.vip.earned_level],
    ['VIP döngüsü başlangıcı',date(data.vip.cycle_start)],['VIP döngüsü bitişi',date(data.vip.cycle_end)],
    ['VIP döngüsü kaydedilmiş alım',data.vip.cycle_purchased],
    ['Kayıtlı toplam VIP alımı',data.vip.total_purchased_recorded],
    ['Sipariş kaydı',data.finance.orders_recorded],['Google Play makbuz kaydı',data.finance.play_receipts_recorded],
    ['Temsilci yükleme talebi',data.finance.assisted_requests_recorded],
    ['Alınan bayi transferi',data.finance.dealer_transfers_received],
    ['Yönetici Lidya ekleme kaydı',data.finance.manual_credits_recorded],
    ['VIP makbuz kaydı',data.finance.vip_receipts_recorded],
    ['Referans kodu kullanımı',data.finance.referral_redemptions]
   ]],
   ['Oyun ve iletişim',[
    ['Bahis kaydı',data.games.bets_recorded],['Oyun sonucu kaydı',data.games.plays_recorded],
    ['Kayıtlı ses/görüntülü arama',data.communication.calls_recorded]
   ]],
   ['Güvenlik ve moderasyon geçmişi',[
    ['Hesap yasağı kayıtları',data.security.account_ban_records],
    ['Sohbet yasağı kayıtları',data.security.chat_ban_records],
    ['Oda yasağı kayıtları',data.security.room_ban_records],
    ['Alınan şikâyet kaydı',data.security.reports_received],
    ['Gönderilen şikâyet kaydı',data.security.reports_sent],
    ['Hedefe bağlı yönetici denetim kaydı',data.security.admin_audit_records]
   ]]
  ];
  for(const [title,rows] of sections){const c=card(host,title);insightsPairs(c,rows);}
  note(host,data.note);
  const actions=el('div','aw-actions');host.append(actions);
  for(const [key,title] of [
   ['social','Sosyal etkinlik geçmişi'],['rooms','Oda etkinliği geçmişi'],
   ['gifts','Hediye geçmişi'],['moderation','Yaptırım ve denetim geçmişi']
  ])button(actions,title,()=>openIdActivityV3(s,person,key));
  button(actions,'Oyun ve satın alım geçmişine git',()=>{
   if(!window.LidyaManagementCenter?.open)throw Error('Mali denetim modülü yüklenemedi');
   return window.LidyaManagementCenter.open('finance',{target:person.public_id});
  });
 }catch(e){if(host.isConnected){loading.remove();note(host,'Ayrıntılı sorgu yüklenemedi: '+e.message,true);}}
}
async function openIdActivityV3(s,person,category){
 s.panel.querySelector('[data-id-activity-v3]')?.remove();
 const overlay=el('div','');overlay.dataset.idActivityV3='';
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483100;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
 const modal=el('section','aw-card');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const labels={social:'Sosyal etkinlik',rooms:'Oda geçmişi',gifts:'Hediye geçmişi',moderation:'Yaptırım ve denetim'};
 modal.setAttribute('aria-label',labels[category]||'Hesap geçmişi');
 modal.style.cssText='box-sizing:border-box;width:min(580px,100%);max-height:calc(100dvh - 30px);display:flex;flex-direction:column;gap:10px;background:var(--ui-panel,#261d17);color:var(--ui-ink,#f8e3b7);border:1px solid #b99353;border-radius:16px;padding:14px';
 const heading=el('div','aw-actions');const title=el('h3','',labels[category]+' · '+person.public_id);
 const closeBtn=el('button','aw-button','✕ Kapat');closeBtn.type='button';closeBtn.onclick=()=>overlay.remove();heading.append(title,closeBtn);
 const body=el('div','');body.style.cssText='overflow-y:auto;min-height:0;flex:1;overscroll-behavior:contain';
 const footer=el('div','aw-actions');const prev=el('button','aw-button','‹ Önceki');const next=el('button','aw-button','Sonraki ›');
 prev.type=next.type='button';const status=el('span','','Sayfa 1');footer.append(prev,status,next);modal.append(heading,body,footer);overlay.append(modal);s.panel.append(overlay);
 overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
 closeBtn.focus({preventScroll:true});let page=1,seq=0;
 async function load(wanted){
  const requestId=++seq;prev.disabled=next.disabled=true;body.replaceChildren(el('p','','Kayıtlar yükleniyor…'));
  try{
   const params=new URLSearchParams({category,page:String(wanted)});
   const data=await request(s,'/v1/admin/workspace/users/'+encodeURIComponent(person.id)+'/activity?'+params);
   if(!overlay.isConnected||requestId!==seq)return;
   page=data.page;body.replaceChildren();
   const total=el('p','',data.total+' kayıt');body.append(total);
   if(!data.items.length)body.append(el('p','','Kayıt bulunamadı.'));
   for(const entry of data.items){
    const c=card(body,entry.source+' · '+date(entry.created_at));
    insightsPairs(c,[['Ayrıntı',entry.detail],['Tutar (varsa)',entry.amount||'—'],['Kayıt ID',entry.id]]);
   }
   status.textContent='Sayfa '+data.page+' / '+data.total_pages;
   prev.disabled=!data.has_previous;next.disabled=!data.has_next;body.scrollTop=0;
  }catch(e){if(overlay.isConnected){body.replaceChildren();note(body,e.message,true);status.textContent='Sorgu hatası';}}
 }
 prev.onclick=()=>load(page-1);next.onclick=()=>load(page+1);
 await load(1);
}

function roleForm(s,p){
 s.body.querySelector('[data-role-proposal]')?.remove();const c=card(s.body,'DA · Doğrudan rol değişikliği');c.dataset.roleProposal='';note(c,'DA, hedef profil ID ve gerekçe doğrulamasından sonra rolü tek işlemle verebilir. İşlem ve karar ayrı denetim kayıtlarına yazılır. Kendi rolünüz değiştirilemez.');
 const key=crypto.randomUUID();fields(c,[{name:'role',title:'Yeni rol',options:{'':'Seçin',SA:'SA · Destek',UA:'UA · Talep',FA:'FA · Karar',DA:'DA · Sistem',REMOVE:'Yetkiyi kaldır'}},{name:'reason',title:'Gerekçe',type:'textarea',minLength:20,maxLength:2000},{name:'confirm',title:'Onay için profil ID değerini yazın: '+p.public_id,minLength:1,maxLength:64}],'Rolü doğrudan uygula',async v=>{const row=await request(s,'/v1/admin/workspace/role-requests','POST',{target_id:p.id,role:v.role==='REMOVE'?null:v.role,reason:v.reason,expected_snapshot:p.role_snapshot,confirm_public_id:v.confirm,request_key:key});let applied;try{applied=await request(s,'/v1/admin/workspace/role-requests/'+row.id+'/decision','POST',{action:'approve',note:v.reason,direct:true});}catch(error){await roleRequests(s);note(s.body,'Talep #'+row.id+' kaydedildi ancak doğrudan karar uygulanamadı: '+error.message,true);return;}await roleRequests(s,{status:'all'});note(s.body,'Rol işlemi #'+row.id+': '+statusName(applied.status)+'.');if(applied.realtime_refresh_pending)note(s.body,'İşlem kaydedildi; hedef kullanıcının oturumunu yenilemesi gerekebilir.');});
}
async function roleRequests(s,options={}){
 const version=stage(s,'Yetki değişikliği talepleri','DA rol kararlarını doğrudan uygulayabilir; tüm işlemler denetlenir. Sonuçlanan talepler tekrar uygulanmaz.');
 fields(s.body,[{name:'status',title:'Durum',value:options.status||'pending',options:{pending:'Karar bekliyor',executed:'Uygulandı',rejected:'Reddedildi',cancelled:'Geri çekildi',all:'Tümü'}}],'Filtrele',v=>roleRequests(s,v));
 const params=new URLSearchParams({status:options.status||'pending',limit:'20'}),data=await request(s,'/v1/admin/workspace/role-requests?'+params);if(!alive(s)||s.generation!==version)return;const list=el('div','aw-grid');s.body.append(list);
 const paint=items=>items.forEach(r=>{const c=card(list,'Yetki talebi #'+r.id+' · '+r.target_name),d=el('dl','aw-facts');for(const [k,v] of [['Profil ID',r.target_public_id],['Önceki rol',roleName(r.previous_role)],['Talep edilen',r.requested_role||'Yetki kaldırma'],['Durum',statusName(r.status)],['Talep sahibi',r.requester_public_id?(r.requester_name+' · '+r.requester_public_id):r.requester_id],['Gerekçe',r.reason],['Açılış',date(r.created_at)],['Karar veren',r.reviewer_public_id?(r.reviewer_name+' · '+r.reviewer_public_id):r.reviewer_id],['Karar gerekçesi',r.decision_note],['Karar zamanı',date(r.decided_at)]])info(d,k,v);c.append(d);
 if(r.can_decide||r.can_cancel)fields(c,[{name:'action',title:'Karar',options:r.can_decide?{'':'Karar seçin',approve:'Onayla ve uygula',reject:'Reddet'}:{cancel:'Talebi geri çek'}},{name:'note',title:'Gerekçeli karar',type:'textarea',minLength:20,maxLength:2000}],'Kararı kaydet',async v=>{const decided=await request(s,'/v1/admin/workspace/role-requests/'+r.id+'/decision','POST',v);await roleRequests(s,options);note(s.body,'Yetki talebi #'+r.id+': '+statusName(decided.status)+'.');if(decided.realtime_refresh_pending)note(s.body,'Yetki değişikliği kaydedildi. Canlı rozet/görünürlük güncellemesi gecikti; ilgili hesabın oturumunu yenileyin.');});
 });paint(data.items);if(!data.items.length)note(list,'Bu durumda yetki talebi yok. Kadrodan bir hesap seçerek gerekçeli talep açabilirsiniz.');let before=data.next_before;if(before)button(s.body,'Daha fazla talep',async()=>{if(!before)return;params.set('before',before);const d=await request(s,'/v1/admin/workspace/role-requests?'+params);if(!alive(s)||s.generation!==version)return;paint(d.items);before=d.next_before;});button(s.body,'Kadroya ve rol talebine dön',()=>directory(s,{staff:true}));
}
function deleteForm(s,p){
 const c=card(s.body,'Kalıcı hesap silme');if(!p.can_delete){note(c,'Kendi hesabınız veya yönetici hesabı bu panelden silinemez.',true);return;}
 note(c,'Bu işlem kalıcıdır. Hesapla ilişkili veriler mevcut güvenli silme kurallarına göre kaldırılır. Şema güvenli silmeye izin vermezse işlem geri alınır.');
 fields(c,[{name:'confirm',title:'Profil ID değerini aynen yazın: '+p.public_id,maxLength:64},{name:'ack',title:'Kalıcı silme onayı',options:{'':'Seçin',delete:'Kalıcı silme işlemini onaylıyorum'}}],'Hesabı kalıcı sil',async(v,result)=>{if(v.confirm!==p.public_id)throw Error('Profil ID onayı eşleşmedi.');if(v.ack!=='delete')throw Error('Kalıcı silme onayı gerekli.');await request(s,'/v1/admin/account-deletion/'+encodeURIComponent(p.id),'DELETE');c.replaceChildren();note(c,'Hesap silme işlemi tamamlandı.');button(c,'Kullanıcı dizinine dön',()=>directory(s));});
}
async function ghost(s){stage(s,'Ghost Mode','Mevcut oturum görünürlüğünü açıkça seçin.');const me=await request(s,'/v1/admin/me');if(!alive(s))return;note(s.body,'Mevcut durum: '+(me.ghost_mode?'Açık':'Kapalı'));fields(s.body,[{name:'enabled',title:'İstenen durum',value:me.ghost_mode?'false':'true',options:{true:'Aç',false:'Kapat'}}],'Durumu uygula',async v=>{const d=await request(s,'/v1/admin/ghost-mode','PATCH',{enabled:v.enabled==='true'});note(s.body,'Ghost Mode '+(d.enabled?'açıldı.':'kapatıldı.'));});}

const desk='/v1/admin/operations-desk';
const phaseNames={pending:'Bekliyor',awaiting_ready:'Müşteri onayı bekleniyor',active:'Canlı görüşme',closed:'Kapandı',connecting:'Bağlantı onayı',chat:'Ödeme görüşmesi',rejecting:'Ret hazırlanıyor',finishing:'Sonuç hazırlanıyor',approved:'Onaylandı',rejected:'Reddedildi',cancelled:'İptal',draft:'Taslak',published:'Yayınlandı',discarded:'Kapatıldı',triage:'Ön değerlendirme',planned:'Planlandı',in_progress:'Çalışılıyor',completed:'Tamamlandı',declined:'Uygun bulunmadı',exhausted:'Kullanım sınırı doldu'};
const pname=v=>phaseNames[v]||v;
function launch(s,module,method,...args){if(!alive(s))throw Error('Oturum değişti.');if(typeof window[module]?.[method]!=='function')throw Error('İlgili araç yüklenemedi. Sayfayı yenileyin.');window.ErisAdmin.launchTool(()=>window[module][method](...args));}
function facts(parent,values){const d=el('dl','aw-facts');for(const [k,v] of values)info(d,k,v);parent.append(d);}
async function pageList(s,params){
 const version=stage(s,params.title,params.description);if(params.intro)params.intro();
 if(params.specs.length)fields(s.body,params.specs.map(f=>({...f,value:params.options[f.name]??f.value})), 'Filtrele',v=>params.reload(v));
 const list=el('div','aw-grid');s.body.append(list);const query=new URLSearchParams(params.options);let before=null;
 const load=async append=>{if(append){if(!before)return;query.set('before',before);}const data=await request(s,params.path+'?'+query);if(!alive(s)||s.generation!==version)return;if(!append)list.replaceChildren();const items=Array.isArray(data)?data:data.items;items.forEach(row=>params.paint(list,row));if(!items.length)note(list,'Bu filtrelerde kayıt yok.');before=data.next_before||data.next;more.hidden=!before;};
 const more=button(s.body,'Daha fazla kayıt',()=>load(true));more.hidden=true;await load(false);
}
async function sourcePanel(s,kind,id,back){
 const version=stage(s,'Kayıt takibi · '+({support:'Destek',payment:'Ödeme',referral:'Referans',feedback:'Geri bildirim',appeal:'İtiraz',ban:'Yaptırım'})[kind]+' #'+id,'İç notlar müşteriye gönderilmez. Olay dosyasına yalnız yazdığınız özet ve kaynak kimliği aktarılır.');button(s.body,'← Kayda dön',back);
 const data=await request(s,desk+'/sources/'+kind+'/'+id);if(!alive(s)||s.generation!==version)return;
 if(data.case_id)button(s.body,'Bağlı olay dosyasını aç',()=>window.LidyaManagementCenter.open('cases',{caseId:data.case_id}));
 const n=card(s.body,'İç inceleme notu'),key=crypto.randomUUID();fields(n,[{name:'note',title:'Not',type:'textarea',minLength:20,maxLength:2000}],'İç notu kaydet',async v=>{await request(s,desk+'/sources/'+kind+'/'+id+'/notes','POST',{...v,request_key:key});await sourcePanel(s,kind,id,back);});
 if(!data.case_id){const c=card(s.body,'Olay incelemesine aktar');fields(c,[{name:'category',title:'Dosya kategorisi',options:{other:'Diğer',fraud:'Mali inceleme',account_safety:'Hesap güvenliği',harassment:'Taciz / rahatsızlık',room_abuse:'Oda ihlali'}},{name:'summary',title:'İnceleme özeti',type:'textarea',minLength:20,maxLength:3000}],'Bağlı olay dosyası aç',async v=>{const r=await request(s,desk+'/sources/'+kind+'/'+id+'/case','POST',v);await sourcePanel(s,kind,id,back);note(s.body,'Bağlı olay dosyası #'+r.case_id+' hazır.');});}
 const list=card(s.body,'İşlem geçmişi');let before=data.next_before;
 const paint=rows=>rows.forEach(r=>{const c=card(list,r.actor_name+' · '+date(r.created_at));facts(c,[['İşlem',({internal_note:'İç inceleme notu',case_linked:'Olay dosyası bağı',feedback_ack:'Okuma onayı',feedback_updated:'İş takibi güncellemesi',code_created:'Kod oluşturuldu',code_cancelled:'Kod iptal edildi',decision_approve:'Yaptırım onayı',decision_reject:'Yaptırım reddi',appeal_created:'İtiraz açıldı',appeal_approve:'İtiraz onayı',appeal_reject:'İtiraz reddi'})[r.action]||r.action]]);let text=r.note;try{const j=JSON.parse(text);text=[j.from&&('Önceki: '+pname(j.from)),j.to&&('Yeni: '+pname(j.to)),j.reason,j.explanation].filter(Boolean).join('\n');}catch{}c.append(el('p','aw-prose',text));});paint(data.items);
 if(before)button(list,'Önceki işlem kayıtları',async()=>{if(!before)return;const page=await request(s,desk+'/sources/'+kind+'/'+id+'?before='+before);if(!alive(s)||s.generation!==version)return;paint(page.items);before=page.next_before;});
}
async function supportDesk(s,options={}){
 const opts={q:'',phase:'all',category:'',days:'30',...options};
 await pageList(s,{title:'Destek çalışma masası',description:'Yalnız size atanmış veya şu anda size teklif edilmiş görüşmeler. Kapalı kayıtlar da aynı görev kapsamına tabidir.',options:opts,path:desk+'/support',reload:v=>supportDesk(s,v),specs:[{name:'q',title:'Talep no / konu',required:false,maxLength:100},{name:'phase',title:'Görüşme aşaması',options:{all:'Tümü',pending:'Yeni teklif',awaiting_ready:'Müşteri onayı',active:'Canlı görüşme',closed:'Kapalı'}},{name:'category',title:'Kategori',required:false,options:{'':'Tümü',account:'Hesap',payment:'Ödeme',room:'Oda',safety:'Güvenlik',other:'Diğer'}},{name:'days',title:'Tarih',options:{7:'Son 7 gün',30:'Son 30 gün',90:'Son 90 gün',365:'Son 365 gün'}}],paint:(list,r)=>{const c=card(list,'Destek #'+r.id+' · '+r.subject);facts(c,[['Kategori',r.category],['Aşama',pname(r.phase)],['Yeni müşteri mesajı',r.unread],['Açılış',date(r.created_at)]]);button(c,r.phase==='closed'?'Görüşme geçmişini aç':'Görüşmeyi aç',()=>launch(s,'ErisSupport','openAssigned',r.id));button(c,'İç not ve olay incelemesi',()=>sourcePanel(s,'support',r.id,()=>supportDesk(s,opts)));}});
}
async function referralDesk(s,options={}){
 const opts={q:'',state:'all',kind:'',...options};
 await pageList(s,{title:'Referans kodu yönetimi',description:'Kod oluşturma, kullanım sınırı, gerçek ödül geçmişi ve gerekçeli iptal. Kod iptali daha önce verilmiş ödülleri geri almaz.',options:opts,path:desk+'/referrals',reload:v=>referralDesk(s,v),specs:[{name:'q',title:'Kod içinde ara',required:false,maxLength:48},{name:'kind',title:'Kod türü',required:false,options:{'':'Tümü',USER:'USER',TANIDIK:'TANIDIK'}},{name:'state',title:'Durum',options:{all:'Tümü',active:'Aktif',exhausted:'Kullanım sınırı doldu',cancelled:'İptal edildi'}}],intro:()=>{const c=card(s.body,'Yeni kod oluştur'),key=crypto.randomUUID();fields(c,[{name:'kind',title:'Ödül türü',options:{USER:'USER · 2.500 Lidya',TANIDIK:'TANIDIK · 12.500 Lidya'}},{name:'max_uses',title:'En fazla kullanıcı',type:'number',min:1,max:100000,step:1,value:'1'}],'Kodu oluştur',async v=>{const r=await request(s,desk+'/referrals','POST',{kind:v.kind,max_uses:Number(v.max_uses),request_key:key});await referralDesk(s,opts);const result=card(s.body,'Kod oluşturuldu');result.append(el('p','aw-code',r.code));button(result,'Kodu kopyala',()=>navigator.clipboard.writeText(r.code));});},paint:(list,r)=>{const c=card(list,r.code);facts(c,[['Tür',r.kind],['Durum',r.state==='active'?'Aktif':pname(r.state)],['Kullanım',r.uses+' / '+r.max_uses],['Kalan',Math.max(0,r.max_uses-r.uses)],['Gerçek dağıtılan ödül',r.total_awarded+' Lidya'],['Oluşturma',date(r.created_at)]]);button(c,'Kullanım ve ödül geçmişi',()=>referralUses(s,r,opts));button(c,'İç not ve kayıt geçmişi',()=>sourcePanel(s,'referral',r.id,()=>referralDesk(s,opts)));if(r.state==='active'){const key=crypto.randomUUID(),d=el('details');d.append(el('summary','','Kodu gerekçeyle iptal et'));c.append(d);fields(d,[{name:'note',title:'İptal gerekçesi',type:'textarea',minLength:20,maxLength:2000}],'Kodu iptal et',async v=>{await request(s,desk+'/referrals/'+r.id+'/cancel','POST',{...v,request_key:key});await referralDesk(s,opts);});}}});
}
async function referralUses(s,r,options){
 const version=stage(s,r.code+' · Kullanım geçmişi','Tutarlar yalnız gerçekleşmiş kod kullanımlarından gelir.');button(s.body,'← Kodlara dön',()=>referralDesk(s,options));const list=el('div','aw-grid');s.body.append(list);let before=null;
 const load=async()=>{const d=await request(s,desk+'/referrals/'+r.id+'/uses'+(before?'?before='+before:''));if(!alive(s)||s.generation!==version)return;d.items.forEach(x=>facts(card(list,x.name),[['Profil ID',x.public_id],['Ödül',x.amount+' Lidya'],['Tarih',date(x.created_at)]]));if(!d.items.length)note(list,'Henüz kullanım kaydı yok.');before=d.next_before;more.hidden=!before;};const more=button(s.body,'Daha eski kullanımlar',load);more.hidden=true;await load();
}
async function feedbackDesk(s,options={}){
 const opts={q:'',status:'all',mine:'false',...options};
 await pageList(s,{title:'Geri bildirim iş takibi',description:'Önce öneriyi mevcut okuma akışında inceleyin; ardından sorumlu, durum, iç not ve olay bağlantısını yönetin.',options:opts,path:desk+'/feedback',reload:v=>feedbackDesk(s,v),specs:[{name:'q',title:'Öneri no / kullanıcı profil ID',required:false,maxLength:100},{name:'status',title:'Takip durumu',options:{all:'Tümü',triage:'Ön değerlendirme',planned:'Planlandı',in_progress:'Çalışılıyor',completed:'Tamamlandı',declined:'Uygun bulunmadı'}},{name:'mine',title:'Görev kapsamı',options:{false:'Tüm kayıtlar',true:'Bana atananlar'}}],paint:(list,r)=>{const c=card(list,'Öneri #'+r.id);facts(c,[['Okuma',r.read?'Okundu':'Okunmadı'],['Takip',pname(r.status)],['Sorumlu',r.assignee_id||'Atanmadı'],['Tarih',date(r.created_at)]]);button(c,'Öneriyi oku',()=>launch(s,'ErisSuggestions','openReview',r.id));if(r.can_manage)button(c,'İş takibini yönet',()=>feedbackEdit(s,r,opts));else note(c,'Bu hesapla okuma onayını tamamladıktan sonra listeyi yenileyin.');}});
 button(s.body,'Okuma sonrası listeyi yenile',()=>feedbackDesk(s,opts));
}
async function feedbackEdit(s,r,options){
 const version=stage(s,'Öneri #'+r.id+' · İş takibi','Durum müşterinin öneri geçmişinde görünür. İç gerekçe ve notlar müşteriye gönderilmez.');button(s.body,'← Geri bildirimlere dön',()=>feedbackDesk(s,options));const staff=await request(s,'/v1/admin/cases/staff');if(!alive(s)||s.generation!==version)return;
 fields(s.body,[{name:'status',title:'Yeni takip durumu',value:r.status,options:{triage:'Ön değerlendirme',planned:'Planlandı',in_progress:'Çalışılıyor',completed:'Tamamlandı',declined:'Uygun bulunmadı'}},{name:'assignee_id',title:'Takip sorumlusu',required:false,value:r.assignee_id||'',options:{'':'Atanmamış',...Object.fromEntries(staff.filter(x=>x.role==='DA').map(x=>[x.id,x.name+' · '+x.public_id]))}},{name:'note',title:'İç gerekçe',type:'textarea',minLength:20,maxLength:2000}],'Takibi güncelle',async v=>{await request(s,desk+'/feedback/'+r.id+'/workflow','POST',{...v,assignee_id:v.assignee_id||null,revision:r.revision});await feedbackDesk(s,options);note(s.body,'Öneri #'+r.id+' iş takibi güncellendi.');});button(s.body,'İç not, geçmiş ve olay bağlantısı',()=>sourcePanel(s,'feedback',r.id,()=>feedbackDesk(s,options)));
}
async function paymentDesk(s,options={}){
 const opts={q:'',status:'all',assignment:'all',days:'30',records:'false',...options};
 await pageList(s,{title:'Yükleme istekleri çalışma masası',description:'Kuyruk, görev ve kayıt filtreleri. Kabul, görüşme, dekont ve yükleme mevcut ödeme güvenlik akışında yapılır.',options:opts,path:'/v1/payment-assistance/admin/requests',reload:v=>paymentDesk(s,v),specs:[{name:'q',title:'Profil ID / istek ID / banka referansı',required:false,maxLength:100},{name:'records',title:'Kayıt kapsamı',options:{false:'Açık kuyruk',true:'Tüm kayıtlar'}},{name:'status',title:'Aşama',options:{all:'Tümü',pending:'Bekliyor',connecting:'Bağlantı onayı',chat:'Görüşme',rejecting:'Ret hazırlanıyor',finishing:'Sonuç hazırlanıyor',approved:'Onaylandı',rejected:'Reddedildi',cancelled:'İptal'}},{name:'assignment',title:'Görev',options:{all:'Tümü',mine:'Bana atananlar',unassigned:'Atanmamış'}},{name:'days',title:'Tarih',options:{7:'Son 7 gün',30:'Son 30 gün',90:'Son 90 gün',365:'Son 365 gün'}}],paint:(list,r)=>{const c=card(list,r.public_id+' · '+r.nickname);facts(c,[['İstek ID',r.id],['Aşama',pname(r.status)],['Paket',r.price_try+' TL · '+r.total+' Lidya'],['Yükleme',r.credited?'Tamamlandı':'Henüz yapılmadı'],['Görevli profil ID',r.agent_public_id||'Atanmamış'],['Açılış',date(r.created_at)]]);
 if(r.status==='pending'&&!r.own)button(c,'İsteği kabul et',async()=>{await request(s,'/v1/payment-assistance/requests/'+r.id+'/accept','POST',{});launch(s,'ErisPaymentAssistance','openRequest',r.id);});
 if(r.assigned_to===s.me.id||r.own)button(c,'Görüşmeye dön',()=>launch(s,'ErisPaymentAssistance','openRequest',r.id));
 if(['approved','rejected','cancelled'].includes(r.status))button(c,'Kaydı ve kanıtı incele',()=>launch(s,'ErisPaymentAssistance','openRecord',r.id));
 if(!r.assigned_to||r.assigned_to===s.me.id||['approved','rejected','cancelled'].includes(r.status))button(c,'İç not ve olay incelemesi',()=>sourcePanel(s,'payment',r.id,()=>paymentDesk(s,opts)));}});
 button(s.body,'Mevcut görev devralma ve kayıt araçları',()=>launch(s,'ErisPaymentAssistance','openQueue'));
}
async function announcementDesk(s,options={}){
 const opts={status:'draft',...options};
 await pageList(s,{title:'Duyuru yayın masası',description:'Taslağı kaydedin, kayıtlı sürümü önizleyin ve açık yayın onayı verin. Taslak kaydı kullanıcıya duyuru göndermez.',options:opts,path:desk+'/announcement-drafts',reload:v=>announcementDesk(s,v),specs:[{name:'status',title:'Taslak geçmişim',options:{draft:'Taslaklar',published:'Yayınlananlar',discarded:'Kapatılanlar',all:'Tümü'}}],intro:()=>{button(s.body,'Aktif duyuruları yönet',()=>activeAnnouncements(s));const c=card(s.body,'Yeni duyuru taslağı'),key=crypto.randomUUID();const f=fields(c,[{name:'message',title:'Duyuru metni',type:'textarea',minLength:3,maxLength:4000}],'Taslağı oluştur',async v=>draftEditor(s,await request(s,desk+'/announcement-drafts','POST',{...v,request_key:key})));const counter=note(c,'0 / 4000');f.inputs.message.oninput=()=>counter.textContent=f.inputs.message.value.length+' / 4000';},paint:(list,r)=>{const c=card(list,'Taslak #'+r.id+' · '+pname(r.status));c.append(el('p','aw-prose',r.message.slice(0,180)));facts(c,[['Sürüm',r.revision],['Güncelleme',date(r.updated_at)]]);button(c,'Taslağı ve yayın kaydını aç',()=>draftEditor(s,r));}});
}
function draftEditor(s,r){
 stage(s,'Duyuru taslağı #'+r.id,'Taslak yalnız hazırlayan yetkiliye aittir. Kayıtlı sürüm üzerinde işlem yapılır.');button(s.body,'← Yayın masasına dön',()=>announcementDesk(s));facts(s.body,[['Durum',pname(r.status)],['Sürüm',r.revision],['Yayınlayan profil ID',r.author_public_id],['Yayın kaydı',r.announcement_id||'Yayınlanmadı veya yayın kaydı kaldırıldı']]);
 if(r.status==='draft'){fields(s.body,[{name:'message',title:'Duyuru metni',type:'textarea',value:r.message,minLength:3,maxLength:4000}],'Taslağı kaydet',async v=>draftEditor(s,await request(s,desk+'/announcement-drafts/'+r.id,'PUT',{...v,revision:r.revision})));button(s.body,'Kaydedilen sürümü önizle',()=>draftPreview(s,r));button(s.body,'Taslağı yayına almadan kapat',async()=>draftEditor(s,await request(s,desk+'/announcement-drafts/'+r.id+'/discard','POST',{revision:r.revision})));}
 else card(s.body,'Kayıtlı duyuru metni').append(el('p','aw-prose',r.message));
}
function draftPreview(s,r){
 stage(s,'Duyuru önizlemesi','Aşağıdaki kayıtlı sürüm tüm kullanıcılara yayınlanacaktır. Düzenlediyseniz önce taslağı kaydedin.');button(s.body,'← Düzenlemeye dön',()=>draftEditor(s,r));const c=card(s.body,'LidyaChat Yönetim');c.append(el('p','aw-prose',r.message));note(c,'Yayınlayan yönetici ID: '+r.author_public_id);fields(s.body,[{name:'confirm',title:'Yayın onayı',options:{'':'Seçin',publish:'Bu kayıtlı metni tüm kullanıcılara yayınla'}}],'Duyuruyu yayınla',async v=>{if(v.confirm!=='publish')throw Error('Açık yayın onayı gerekli.');const data=await request(s,desk+'/announcement-drafts/'+r.id+'/publish','POST',{revision:r.revision});window.dispatchEvent(new CustomEvent('lidyachat:announcements-changed'));draftEditor(s,data);note(s.body,'Duyuru yayınlandı. Tekrarlanan yayın isteği yeni duyuru oluşturmaz.');});
}
async function activeAnnouncements(s){
 await pageList(s,{title:'Aktif duyurular',description:'Yayından kaldırılan duyuru kullanıcı listesinden çıkar; yönetim gerekçesi ve yayın kaydı saklanır.',options:{limit:'20'},path:'/v1/admin/announcements',reload:()=>activeAnnouncements(s),specs:[],paint:(list,r)=>{const c=card(list,'Duyuru #'+r.id);c.append(el('p','aw-prose',r.message));facts(c,[['Yayınlayan profil ID',r.admin_public_id],['Yayın zamanı',date(r.created_at)]]);const key=crypto.randomUUID();fields(c,[{name:'note',title:'Yayından kaldırma gerekçesi',type:'textarea',minLength:20,maxLength:2000}],'Duyuruyu yayından kaldır',async v=>{await request(s,desk+'/announcements/'+r.id+'/withdraw','POST',{...v,request_key:key});window.dispatchEvent(new CustomEvent('lidyachat:announcements-changed'));await activeAnnouncements(s);});}});button(s.body,'← Yayın masası',()=>announcementDesk(s));
}
async function appealDesk(s,options={}){
 const opts={q:'',status:'pending',...options};await pageList(s,{title:'İtiraz inceleme masası',description:'İlk karar, itiraz gerekçesi ve fotoğraf kanıtları birlikte değerlendirilir. İlk kararı veren yetkili itirazı sonuçlandıramaz.',options:opts,path:desk+'/appeals',reload:v=>appealDesk(s,v),specs:[{name:'q',title:'İtiraz no / hedef profil ID / gerekçe',required:false,maxLength:100},{name:'status',title:'Durum',options:{pending:'Karar bekliyor',approved:'Onaylandı',rejected:'Reddedildi',all:'Tümü'}}],paint:(list,r)=>{const c=card(list,'İtiraz #'+r.id);facts(c,[['İlk talep',r.request_id],['Tür',r.kind],['Durum',pname(r.status)],['İtiraz gerekçesi',r.reason],['Tarih',date(r.created_at)]]);button(c,'İlk karar ve kanıtı incele',()=>appealDetail(s,r.id,opts));}});
}
async function appealDetail(s,id,options){
 const version=stage(s,'İtiraz #'+id,'İlk gerekçe, ek kanıt ve bağımsız karar.');button(s.body,'← İtirazlara dön',()=>appealDesk(s,options));const r=await request(s,desk+'/appeals/'+id);if(!alive(s)||s.generation!==version)return;
 facts(s.body,[['İlk talep',r.request_id],['Hedef profil ID',r.target_public_id],['Oda',r.room_public_id?(r.room_name+' · '+r.room_public_id):'—'],['Yaptırım türü',r.kind],['Süre',r.days===null?'Süresiz':r.days+' gün'],['Talep sahibi profil ID',r.requester_public_id||r.requester_id],['İlk karar yetkilisi profil ID',r.first_reviewer_public_id||r.first_reviewer_id],['İlk talep gerekçesi',r.original_reason],['İlk ret kararı gerekçesi',r.first_decision_note||'Eski kayıtta gerekçe bulunmuyor'],['İtiraz gerekçesi',r.reason],['Ek açıklama',r.explanation],['Durum',pname(r.status)]]);
 const proof=card(s.body,'İtiraz fotoğrafları');for(const url of r.images){if(!/^data:image\/(png|jpeg|webp);base64,/.test(url))continue;const img=el('img','aw-proof');img.src=url;img.alt='İtiraz kanıtı';proof.append(img);}
 if(r.can_decide)fields(s.body,[{name:'action',title:'Bağımsız karar',options:{'':'Karar seçin',approve:'İtirazı onayla',reject:'İtirazı reddet'}},{name:'note',title:'Karar gerekçesi',type:'textarea',minLength:20,maxLength:2000}],'İtiraz kararını kaydet',async v=>{await request(s,'/v1/admin/ban-workflow/appeals/'+id+'/decision','POST',v);await appealDesk(s,options);note(s.body,'İtiraz #'+id+' kararı kaydedildi.');});else note(s.body,r.status==='pending'?'Bu itirazı bağımsız farklı bir yetkili sonuçlandırmalıdır.':'İtiraz sonuçlanmış.');button(s.body,'İç not ve olay bağlantısı',()=>sourcePanel(s,'appeal',id,()=>appealDetail(s,id,options)));
}
async function open(key,me,p){
 if(!['tickets','referrals','announcement','gaps','payments','banappeals','lookup','roles','deleteaccount','ghost','saactions','uaactions','faactions','daactions'].includes(key))return false;
 if(key==='tickets'?!['SA','UA','FA','DA'].includes(me.role):['announcement','banappeals'].includes(key)?!['FA','DA'].includes(me.role):me.role!=='DA')throw Error('Bu araca erişim yetkiniz yok.');const body=p.querySelector('#eaBody'),s={panel:p,body,me,access:token(),generation:0,back:()=>window.ErisAdmin.open()};states.set(p,s);
 if(key.endsWith('actions')){await window.LidyaManagementCenter.open('audit',{role:key.slice(0,2).toUpperCase()});return true;}
 if(key==='tickets')await supportDesk(s);
 else if(key==='referrals')await referralDesk(s);
 else if(key==='announcement')await announcementDesk(s);
 else if(key==='gaps')await feedbackDesk(s);
 else if(key==='payments')await paymentDesk(s);
 else if(key==='banappeals')await appealDesk(s);
 else if(key==='roles'){stage(s,'Yönetici Rolleri','Kadro, yetki talebi ve bağımsız karar.');const actions=el('div','aw-actions');body.append(actions);button(actions,'Kadro ve yeni talep',()=>directory(s,{staff:true}));button(actions,'Karar bekleyen talepler',()=>roleRequests(s));await roleRequests(s);}
 else if(key==='ghost')await ghost(s);
 else if(key==='deleteaccount'){stage(s,'Hesap silme · Hedef doğrulama','Kalıcı işlemden önce profil kimliğini ve hesap durumunu doğrulayın.');fields(body,[{name:'id',title:'Kullanıcı ID veya profil ID',maxLength:64}],'Hesabı sorgula',v=>profile(s,v.id,'deleteaccount'));}
 else directory(s);return true;
}
function menu(body,me,p){
 const s={body,me,panel:p,access:token(),generation:0,back:()=>window.ErisAdmin.open()};states.set(p,s);
 const toolbar=el('section','aw-menu-tools');toolbar.setAttribute('aria-label','Yönetim araçlarını bul');const search=el('input','aw-search');search.type='search';search.placeholder='Araç, görev veya işlem ara…';search.setAttribute('aria-label','Yönetim araçlarında ara');const category=el('select','aw-select');category.setAttribute('aria-label','Görev alanı');const all=el('option','','Tüm görev alanları');all.value='';category.append(all);const status=el('p','aw-result','Araç bilgileri yükleniyor…');status.setAttribute('role','status');const switches=el('div','aw-actions');let onlyFavorites=false,showDescriptions=false;const fav=button(switches,'Yalnız favoriler',()=>{onlyFavorites=!onlyFavorites;fav.setAttribute('aria-pressed',String(onlyFavorites));filter();});fav.setAttribute('aria-pressed','false');const details=button(switches,'Görev açıklamalarını göster',()=>{showDescriptions=!showDescriptions;details.setAttribute('aria-pressed',String(showDescriptions));details.textContent=showDescriptions?'Görev açıklamalarını gizle':'Görev açıklamalarını göster';filter();});details.setAttribute('aria-pressed','false');toolbar.append(search,category,switches,status);body.querySelector('.ea-profile')?.after(toolbar);
 let cards=[],favoriteKeys=new Set();const storageKey='lidya.admin.favorites.v1.'+me.id;
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))favoriteKeys=new Set(saved.filter(x=>typeof x==='string'));}catch{}
 function filter(){let visible=0;const q=normalize(search.value);for(const item of cards){const shown=(!q||normalize([item.tool.title,item.tool.description,item.tool.flow].join(' ')).includes(q))&&(!category.value||item.tool.section===category.value)&&(!onlyFavorites||favoriteKeys.has(item.tool.key));item.wrap.hidden=!shown;item.description.hidden=!showDescriptions;if(shown)visible++;}for(const grid of body.querySelectorAll('.eris-admin-grid')){const has=[...grid.children].some(e=>!e.hidden);grid.hidden=!has;const heading=grid.previousElementSibling;if(heading?.classList.contains('ea-section'))heading.hidden=!has;}status.textContent=visible+' / '+cards.length+' araç'+(!visible?' · Arama veya filtreyi değiştirin.':'');}
 search.oninput=filter;category.onchange=filter;
 const load=async()=>{const data=await request(s,'/v1/admin/workspace');if(!alive(s)||!toolbar.isConnected)return;const tools=new Map(data.tools.map(t=>[t.key,t]));
 for(const b of body.querySelectorAll('[data-a]')){const tool=tools.get(b.dataset.a);if(!tool){b.hidden=true;continue;}const wrap=el('article','aw-tool');wrap.dataset.toolKey=tool.key;b.before(wrap);wrap.append(b);b.setAttribute('aria-label',tool.title+' · '+tool.description);b.title=tool.description;
 const footer=el('div','aw-tool-footer'),star=button(footer,favoriteKeys.has(tool.key)?'★':'☆',()=>{if(favoriteKeys.has(tool.key))favoriteKeys.delete(tool.key);else favoriteKeys.add(tool.key);try{localStorage.setItem(storageKey,JSON.stringify([...favoriteKeys]));}catch{note(toolbar,'Favori tercihi bu cihazda kaydedilemedi.',true);}star.textContent=favoriteKeys.has(tool.key)?'★':'☆';star.setAttribute('aria-pressed',String(favoriteKeys.has(tool.key)));filter();});star.classList.add('aw-star');star.setAttribute('aria-label',tool.title+' favori');star.setAttribute('aria-pressed',String(favoriteKeys.has(tool.key)));
 const count=el('span','aw-count');count.dataset.countKey=tool.key;count.hidden=!Object.hasOwn(data.counts,tool.key);if(!count.hidden)count.textContent=String(data.counts[tool.key])+' bekleyen / açık';footer.append(count);const description=el('div','aw-tool-description');description.append(el('p','',tool.description),el('p','aw-flow',tool.flow));description.hidden=true;wrap.append(footer,description);cards.push({wrap,tool,description});}
 if(window.LidyaManagementLive){window.LidyaManagementLive.attach({element:toolbar,isAlive:()=>alive(s),load:signal=>window.LidyaManagementLive.read('/v1/admin/workspace',s.access,signal),paint:fresh=>{if(fresh.role!==me.role)throw Object.assign(Error('Yetki değişti.'),{status:403});for(const count of body.querySelectorAll('[data-count-key]')){const key=count.dataset.countKey;count.hidden=!Object.hasOwn(fresh.counts,key);if(!count.hidden)count.textContent=String(fresh.counts[key])+' bekleyen / açık';}const allowed=new Set(fresh.tools.map(t=>t.key));cards.forEach(c=>{if(!allowed.has(c.tool.key))c.wrap.remove()});},onDenied:()=>body.querySelectorAll('.eris-admin-grid').forEach(g=>g.remove())});}
 for(const value of [...new Set(data.tools.map(t=>t.section))]){const o=el('option','',value);o.value=value;category.append(o);}filter();};
 load().catch(e=>{if(!toolbar.isConnected)return;status.textContent='Araç bilgileri alınamadı: '+e.message;button(toolbar,'Bilgileri yeniden yükle',()=>{if(cards.length)return;return load();});});
}
function error(p,text){const body=p.querySelector('#eaBody');if(!body)return;body.querySelector('.aw-launch-error')?.remove();const n=note(body,text,true);n.classList.add('aw-launch-error');n.scrollIntoView?.({block:'nearest'});}
window.ErisAdminWorkspace={menu,open,error};
})();
