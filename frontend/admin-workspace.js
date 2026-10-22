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
 const response=await fetch(base+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+s.access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!alive(s))throw Error('Oturum değişti. Yönetim menüsünü yeniden açın.');
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:response.status===422?'Form alanlarını kontrol edin.':'İşlem tamamlanamadı ('+response.status+').');return data;
}
function note(parent,text,error=false){const p=el('p',error?'aw-notice aw-error':'aw-notice',text);p.setAttribute('role',error?'alert':'status');parent.append(p);return p;}
function button(parent,title,run,cls=''){const b=el('button','aw-button '+cls,title);b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{await run();}catch(e){if(parent.isConnected)note(parent,e.message,true);}finally{b.disabled=false;}};parent.append(b);return b;}
function info(parent,key,value){const line=el('div','aw-pair');line.append(el('dt','',key),el('dd','',value??'—'));parent.append(line);}
function card(parent,title){const c=el('article','aw-card');if(title)c.append(el('h4','',title));parent.append(c);return c;}
function fields(parent,specs,send,submit){
 const f=el('form','aw-form'),inputs={};for(const spec of specs){const label=el('label','aw-field'),caption=el('span','',spec.title),i=el(spec.options?'select':spec.type==='textarea'?'textarea':'input');if(i.tagName==='INPUT')i.type=spec.type||'text';i.name=spec.name;i.required=spec.required!==false;
 if(spec.options)for(const [value,text] of Object.entries(spec.options)){const option=el('option','',text);option.value=value;i.append(option);}i.value=spec.value??'';
 if(spec.maxLength)i.maxLength=spec.maxLength;if(spec.minLength)i.minLength=spec.minLength;if(spec.pattern)i.pattern=spec.pattern;if(spec.autocomplete)i.autocomplete=spec.autocomplete;
 inputs[spec.name]=i;label.append(caption,i);f.append(label);}
 const result=el('p','aw-result');result.setAttribute('role','status');const b=el('button','aw-button aw-primary',send);b.type='submit';f.append(b,result);parent.append(f);
 f.onsubmit=async e=>{e.preventDefault();if(b.disabled||!f.reportValidity())return;b.disabled=true;result.textContent='İşleniyor…';try{await submit(Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value])),result);if(result.isConnected&&result.textContent==='İşleniyor…')result.textContent='Kaydedildi.';}catch(error){if(result.isConnected){result.textContent=error.message;result.setAttribute('role','alert');}}finally{b.disabled=false;}};return {f,inputs,result};
}
function stage(s,title,description){s.generation++;s.body.replaceChildren();const nav=el('nav','aw-nav');button(nav,'← Yönetim menüsü',s.back);s.body.append(nav,el('h3','aw-title',title));if(description)note(s.body,description);return s.generation;}
function directory(s,options={}){
 const version=stage(s,options.staff?'Yönetici kadrosu':'Kullanıcı dizini','Profil ID, sistem ID veya kullanıcı adına göre arayın. Hesabı açıp hedefi doğrulayın.');
 const filters=fields(s.body,[{name:'q',title:'Kullanıcı veya profil ID',value:options.q,required:false,maxLength:100},{name:'role',title:'Rol',value:options.role||(options.staff?'STAFF':''),required:false,options:{'':'Tümü',STAFF:'Tüm yetkililer',USER:'Kullanıcı',SA:'SA',UA:'UA',FA:'FA',DA:'DA'}},{name:'active',title:'Hesap durumu',value:options.active||'all',options:{all:'Tümü',active:'Aktif',inactive:'Pasif'}}],'Ara',v=>directory(s,{...v,staff:options.staff}));
 const list=el('div','aw-grid');s.body.append(list);const loading=note(list,'Kayıtlar yükleniyor…');let after=null;
 const params=new URLSearchParams({limit:'20',q:options.q||'',role:options.role||(options.staff?'STAFF':''),active:options.active||'all'});
 const paint=items=>{for(const p of items){const c=card(list,p.nickname);const d=el('dl','aw-facts');info(d,'Profil ID',p.public_id);info(d,'Rol',roleName(p.role));info(d,'Hesap',p.is_active?'Aktif':'Pasif');c.append(d);button(c,'Hesabı incele',()=>profile(s,p.id,options.staff?'roles':'lookup'));}};
 const more=button(s.body,'Daha fazla kullanıcı',async()=>{if(!after)return;params.set('after',after);const d=await request(s,'/v1/admin/workspace/users?'+params);if(!alive(s)||s.generation!==version)return;paint(d.items);after=d.next_after;more.hidden=!after;});more.hidden=true;
 request(s,'/v1/admin/workspace/users?'+params).then(d=>{if(!alive(s)||s.generation!==version)return;loading.remove();paint(d.items);after=d.next_after;more.hidden=!after;if(!d.items.length)note(list,'Bu filtrelerde kullanıcı bulunamadı. ID veya filtreyi değiştirin.');}).catch(e=>{if(loading.isConnected){loading.textContent=e.message;button(list,'Yeniden dene',()=>directory(s,options));}});
 if(options.staff)button(s.body,'Rol talepleri ve kararlar',()=>roleRequests(s));return filters;
}
async function profile(s,id,kind='lookup'){
 const version=stage(s,'Hesap doğrulama','Hedef kimliği ve güncel durumu kontrol edin.');const person=await request(s,'/v1/admin/workspace/users/'+encodeURIComponent(id));if(!alive(s)||s.generation!==version)return;
 const c=card(s.body,person.nickname),d=el('dl','aw-facts');for(const [k,v] of [['Profil ID',person.public_id],['Sistem ID',person.id],['Rol',roleName(person.role)],['Hesap',person.is_active?'Aktif':'Pasif'],['Kayıt',date(person.created_at)],['Lidya bakiyesi',person.balance],['Aktif hesap/cihaz yaptırımı',person.active_account_bans],['Aktif sohbet yaptırımı',person.active_chat_bans],['Açık olay dosyası',person.open_cases]])info(d,k,v);c.append(d);
 const actions=el('div','aw-actions');c.append(actions);button(actions,'Profil ID kopyala',async()=>{if(!navigator.clipboard?.writeText)throw Error('Kopyalama desteklenmiyor; yukarıdaki Profil ID alanını seçin.');await navigator.clipboard.writeText(person.public_id);note(c,'Profil ID kopyalandı.');});button(actions,'Yetkili işlem geçmişi',()=>window.LidyaManagementCenter.open('audit',{actor:person.public_id}));button(actions,'İlgili olay dosyaları',()=>window.LidyaManagementCenter.open('cases',{q:person.public_id}));
 if(person.can_request_role)button(actions,'Rol değişikliği talep et',()=>roleForm(s,person));
 if(kind==='deleteaccount')deleteForm(s,person);
 else if(kind==='roles'&&person.can_request_role)roleForm(s,person);
 else if(person.can_delete)button(actions,'Hesap silme ön kontrolü',()=>profile(s,person.id,'deleteaccount'));
}
function roleForm(s,p){
 s.body.querySelector('[data-role-proposal]')?.remove();const c=card(s.body,'Bağımsız onaylı rol değişikliği');c.dataset.roleProposal='';note(c,'Talep kaydedildiğinde yetki değişmez. Talebi açan ve hedef dışındaki farklı bir sistem yöneticisi gerekçeli karar verir.');
 const key=crypto.randomUUID();fields(c,[{name:'role',title:'Yeni rol',options:{'':'Seçin',SA:'SA · Destek',UA:'UA · Talep',FA:'FA · Karar',DA:'DA · Sistem',REMOVE:'Yetkiyi kaldır'}},{name:'reason',title:'Gerekçe',type:'textarea',minLength:20,maxLength:2000},{name:'confirm',title:'Onay için profil ID değerini yazın: '+p.public_id,minLength:1,maxLength:64}],'Bağımsız onaya gönder',async v=>{const row=await request(s,'/v1/admin/workspace/role-requests','POST',{target_id:p.id,role:v.role==='REMOVE'?null:v.role,reason:v.reason,expected_snapshot:p.role_snapshot,confirm_public_id:v.confirm,request_key:key});await roleRequests(s);note(s.body,'Yetki talebi #'+row.id+' kaydedildi; hesap yetkisi henüz değişmedi.');});
}
async function roleRequests(s,options={}){
 const version=stage(s,'Yetki değişikliği talepleri','Talep, bağımsız karar ve uygulama geçmişi. Sonuçlanmış talep tekrar uygulanmaz.');
 fields(s.body,[{name:'status',title:'Durum',value:options.status||'pending',options:{pending:'Karar bekliyor',executed:'Uygulandı',rejected:'Reddedildi',cancelled:'Geri çekildi',all:'Tümü'}}],'Filtrele',v=>roleRequests(s,v));
 const params=new URLSearchParams({status:options.status||'pending',limit:'20'}),data=await request(s,'/v1/admin/workspace/role-requests?'+params);if(!alive(s)||s.generation!==version)return;const list=el('div','aw-grid');s.body.append(list);
 const paint=items=>items.forEach(r=>{const c=card(list,'Yetki talebi #'+r.id+' · '+r.target_name),d=el('dl','aw-facts');for(const [k,v] of [['Profil ID',r.target_public_id],['Önceki rol',roleName(r.previous_role)],['Talep edilen',r.requested_role||'Yetki kaldırma'],['Durum',statusName(r.status)],['Talep sahibi',r.requester_public_id?(r.requester_name+' · '+r.requester_public_id):r.requester_id],['Gerekçe',r.reason],['Açılış',date(r.created_at)],['Karar veren',r.reviewer_public_id?(r.reviewer_name+' · '+r.reviewer_public_id):r.reviewer_id],['Karar gerekçesi',r.decision_note],['Karar zamanı',date(r.decided_at)]])info(d,k,v);c.append(d);
 if(r.can_decide||r.can_cancel)fields(c,[{name:'action',title:'Karar',options:r.can_cancel?{cancel:'Talebi geri çek'}:{'':'Karar seçin',approve:'Onayla ve uygula',reject:'Reddet'}},{name:'note',title:'Gerekçeli karar',type:'textarea',minLength:20,maxLength:2000}],'Kararı kaydet',async v=>{const decided=await request(s,'/v1/admin/workspace/role-requests/'+r.id+'/decision','POST',v);await roleRequests(s,options);note(s.body,'Yetki talebi #'+r.id+': '+statusName(decided.status)+'.');if(decided.realtime_refresh_pending)note(s.body,'Yetki değişikliği kaydedildi. Canlı rozet/görünürlük güncellemesi gecikti; ilgili hesabın oturumunu yenileyin.');});
 });paint(data.items);if(!data.items.length)note(list,'Bu durumda yetki talebi yok. Kadrodan bir hesap seçerek gerekçeli talep açabilirsiniz.');let before=data.next_before;if(before)button(s.body,'Daha fazla talep',async()=>{if(!before)return;params.set('before',before);const d=await request(s,'/v1/admin/workspace/role-requests?'+params);if(!alive(s)||s.generation!==version)return;paint(d.items);before=d.next_before;});button(s.body,'Kadroya ve rol talebine dön',()=>directory(s,{staff:true}));
}
function deleteForm(s,p){
 const c=card(s.body,'Kalıcı hesap silme');if(!p.can_delete){note(c,'Kendi hesabınız veya yönetici hesabı bu panelden silinemez.',true);return;}
 note(c,'Bu işlem kalıcıdır. Hesapla ilişkili veriler mevcut güvenli silme kurallarına göre kaldırılır. Şema güvenli silmeye izin vermezse işlem geri alınır.');
 fields(c,[{name:'confirm',title:'Profil ID değerini aynen yazın: '+p.public_id,maxLength:64},{name:'ack',title:'Kalıcı silme onayı',options:{'':'Seçin',delete:'Kalıcı silme işlemini onaylıyorum'}}],'Hesabı kalıcı sil',async(v,result)=>{if(v.confirm!==p.public_id)throw Error('Profil ID onayı eşleşmedi.');if(v.ack!=='delete')throw Error('Kalıcı silme onayı gerekli.');await request(s,'/v1/admin/account-deletion/'+encodeURIComponent(p.id),'DELETE');c.replaceChildren();note(c,'Hesap silme işlemi tamamlandı.');button(c,'Kullanıcı dizinine dön',()=>directory(s));});
}
async function ghost(s){stage(s,'Ghost Mode','Mevcut oturum görünürlüğünü açıkça seçin.');const me=await request(s,'/v1/admin/me');if(!alive(s))return;note(s.body,'Mevcut durum: '+(me.ghost_mode?'Açık':'Kapalı'));fields(s.body,[{name:'enabled',title:'İstenen durum',value:me.ghost_mode?'false':'true',options:{true:'Aç',false:'Kapat'}}],'Durumu uygula',async v=>{const d=await request(s,'/v1/admin/ghost-mode','PATCH',{enabled:v.enabled==='true'});note(s.body,'Ghost Mode '+(d.enabled?'açıldı.':'kapatıldı.'));});}
async function open(key,me,p){
 if(!['lookup','roles','deleteaccount','ghost','saactions','uaactions','faactions','daactions'].includes(key))return false;
 if(me.role!=='DA')throw Error('Bu araca erişim yetkiniz yok.');const body=p.querySelector('#eaBody'),s={panel:p,body,me,access:token(),generation:0,back:()=>window.ErisAdmin.open()};states.set(p,s);
 if(key.endsWith('actions')){await window.LidyaManagementCenter.open('audit',{role:key.slice(0,2).toUpperCase()});return true;}
 if(key==='roles'){stage(s,'Yönetici Rolleri','Kadro, yetki talebi ve bağımsız karar.');const actions=el('div','aw-actions');body.append(actions);button(actions,'Kadro ve yeni talep',()=>directory(s,{staff:true}));button(actions,'Karar bekleyen talepler',()=>roleRequests(s));await roleRequests(s);}
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
 if(Object.hasOwn(data.counts,tool.key))footer.append(el('span','aw-count',String(data.counts[tool.key])+' bekleyen / açık'));const description=el('div','aw-tool-description');description.append(el('p','',tool.description),el('p','aw-flow',tool.flow));description.hidden=true;wrap.append(footer,description);cards.push({wrap,tool,description});}
 for(const value of [...new Set(data.tools.map(t=>t.section))]){const o=el('option','',value);o.value=value;category.append(o);}filter();};
 load().catch(e=>{if(!toolbar.isConnected)return;status.textContent='Araç bilgileri alınamadı: '+e.message;button(toolbar,'Bilgileri yeniden yükle',()=>{if(cards.length)return;return load();});});
}
function error(p,text){const body=p.querySelector('#eaBody');if(!body)return;body.querySelector('.aw-launch-error')?.remove();const n=note(body,text,true);n.classList.add('aw-launch-error');n.scrollIntoView?.({block:'nearest'});}
window.ErisAdminWorkspace={menu,open,error};
})();
