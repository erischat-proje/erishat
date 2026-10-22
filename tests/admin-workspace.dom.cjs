/* Whole menu and staff workflows: real DOM/events with mocked HTTP, no live account. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ERIS_JSDOM_MODULE||'jsdom');
const root=path.resolve(__dirname,'../frontend');
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function fixture(rank='DA',options={}){
 const dom=new JSDOM('<!doctype html><html data-eris-theme="light"><head></head><body><div id="adminMenuMount"></div></body></html>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.setTimeout=()=>1;w.clearTimeout=()=>{};w.setInterval=()=>1;w.ERISCHAT_API_BASE='https://fixture.test';w.localStorage.setItem('erischat.accessToken.v1','fixture-access');
 const calls=[],launched=[],toasts=[];let role=rank,actorId=rank,profileRole=null,pending=[],failRoles=false,workspaceFailure=options.workspaceFailure;
 const me=()=>({id:actorId,role,security_owner:role==='DA',ghost_mode:false});w.toast=m=>toasts.push(m);w.LidyaManagementCenter={open:async(...args)=>launched.push(args)};
 const methods={ErisBan:['open','openChat','openRoom','openRequests','openChatRequests','openRoomRequests','openLogs','openChatLogs','openRoomLogs'],ErisSupport:['openAdmin'],ErisSuggestions:['openAdmin'],ErisPaymentAssistance:['openQueue'],ErisReferral:['openAdmin'],ErisSecurityCenter:['open']};
 for(const [module,functions] of Object.entries(methods))w[module]=Object.fromEntries(functions.map(fn=>[fn,async()=>launched.push([module,fn])]));
 w.fetch=async(url,opt={})=>{const u=new URL(url),p=u.pathname,method=opt.method||'GET',body=opt.body?JSON.parse(opt.body):undefined;calls.push({p,method,body,query:u.search});let status=200,data={};
 if(p==='/v1/admin/me')data=me();
 else if(p==='/v1/admin/workspace'){
  if(workspaceFailure){status=503;data={detail:'Fixture service unavailable'};}
  else data={role,counts:{'lm-cases':2,roles:1,tickets:0},tools:[...d.querySelectorAll('[data-a]')].map(b=>({key:b.dataset.a,title:b.textContent,description:'Açıklama '+b.dataset.a,flow:'Hedef → inceleme → karar',section:b.dataset.a.startsWith('lm-')?'Olay operasyonu':'Günlük operasyon'}))};
 }
 else if(p==='/v1/admin/workspace/users')data={items:[{id:'USER',public_id:'1234567890',nickname:'Fixture Member',role:profileRole,is_active:true}],next_after:null};
 else if(p==='/v1/admin/workspace/users/USER')data={id:'USER',public_id:'1234567890',nickname:'Fixture Member',role:profileRole,is_active:true,balance:'9007199254740993',role_snapshot:'a'.repeat(64),active_account_bans:0,active_chat_bans:0,open_cases:2,can_request_role:true,can_delete:!profileRole};
 else if(p==='/v1/admin/workspace/role-requests'&&method==='GET')data={items:pending.map(r=>({...r,can_decide:r.status==='pending'&&r.requester_id!==actorId,can_cancel:r.status==='pending'&&r.requester_id===actorId})),next_before:null};
 else if(p==='/v1/admin/workspace/role-requests'&&method==='POST'){
  if(failRoles){status=409;data={detail:'Mevcut rol değişti; hesabı yeniden sorgulayın'};}
  else{data={id:1,...body,previous_role:profileRole,requested_role:body.role,target_public_id:body.confirm_public_id,target_name:'Fixture Member',requester_id:actorId,status:'pending'};pending.push(data);}
 }
 else if(p==='/v1/admin/workspace/role-requests/1/decision'){pending[0].status=body.action==='approve'?'executed':body.action==='cancel'?'cancelled':'rejected';profileRole=pending[0].requested_role;data=pending[0];}
 else if(p==='/v1/admin/ghost-mode')data={enabled:body.enabled};
 else if(p==='/v1/admin/account-deletion/USER')data={deleted:true};
 else if(p==='/v1/admin/announcements')data={items:[],next_before:null};
 else{status=404;data={detail:'Not Found'};}
 return {ok:status<400,status,json:async()=>JSON.parse(JSON.stringify(data))};
 };
 Object.defineProperty(d,'currentScript',{configurable:true,value:{src:'https://fixture.test/admin-live.js'}});
 w.eval(fs.readFileSync(path.join(root,'admin-workspace.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'admin-live.js'),'utf8'));Object.defineProperty(d,'currentScript',{configurable:true,value:null});
 await w.ErisAdmin.open();await tick();
 const button=text=>[...d.querySelectorAll('button')].find(b=>b.textContent===text);
 const click=async text=>{const b=button(text);assert.ok(b,'button '+text);b.click();await tick();};
 const submit=async(send,values)=>{const b=[...d.querySelectorAll('button[type=submit]')].find(b=>b.textContent===send);assert.ok(b,'submit '+send);const f=b.closest('form');for(const [name,val]of Object.entries(values)){assert.ok(f.elements.namedItem(name),'field '+name);f.elements.namedItem(name).value=val;}f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();};
 return {w,d,calls,launched,toasts,click,submit,button,pending,setActor:v=>actorId=v,setRole:v=>{role=v;actorId=v;},setRoleFailure:v=>failRoles=v,setWorkspaceFailure:v=>workspaceFailure=v,close:()=>dom.window.close()};
}
test('whole DA menu keeps every PNG handler, searchable task descriptions and scoped favourites',async()=>{const f=await fixture();try{
 const cards=[...f.d.querySelectorAll('.aw-tool')];assert.equal(cards.length,32);assert.equal(f.d.querySelectorAll('[data-a] img[data-ea-art-key]').length,32);assert.ok([...f.d.querySelectorAll('[data-a]')].every(b=>typeof b.onclick==='function'));
 const input=f.d.querySelector('input[type=search]');input.value='lm-cases';input.dispatchEvent(new f.w.Event('input'));assert.deepEqual(cards.filter(x=>!x.hidden).map(x=>x.dataset.toolKey),['lm-cases']);
 input.value='';input.dispatchEvent(new f.w.Event('input'));await f.click('Görev açıklamalarını göster');assert.ok([...f.d.querySelectorAll('.aw-tool-description')].every(e=>!e.hidden));
 const star=f.d.querySelector('[data-tool-key=lookup] .aw-star');star.click();await tick();await f.click('Yalnız favoriler');assert.deepEqual(cards.filter(x=>!x.hidden).map(x=>x.dataset.toolKey),['lookup']);assert.deepEqual(JSON.parse(f.w.localStorage.getItem('lidya.admin.favorites.v1.DA')),['lookup']);assert.equal(f.w.localStorage.getItem('lidya.admin.favorites.v1.SA'),null);
}finally{f.close();}});
test('SA UA FA menus never expose private controls or Ghost Mode profile copy',async()=>{for(const rank of ['SA','UA','FA']){const f=await fixture(rank);try{assert.ok(!/ghost mode/i.test(f.d.body.textContent));for(const key of ['roles','lookup','deleteaccount','ghost','payments','security','lm-audit'])assert.equal(f.d.querySelector('[data-a="'+key+'"]'),null);assert.ok(f.d.querySelector('[data-a=tickets]'));}finally{f.close();}}});
test('all existing specialist buttons dispatch, and both themes retain their art paths',async()=>{const f=await fixture();try{
 for(const theme of ['light','dark']){f.d.documentElement.dataset.erisTheme=theme;await tick();for(const key of ['tickets','ban','roomban','chatban','banrequests','roombanrequests','chatbanrequests','banlogs','roombanlogs','chatbanlogs','gaps','referrals','payments']){
  const b=f.d.querySelector('[data-a="'+key+'"]');assert.ok(b.querySelector('img').src.includes('/'+theme+'/'));await b.onclick();await tick();
 }for(const key of ['command','cases','emergency','finance','fraud','audit'])await f.d.querySelector('[data-a="lm-'+key+'"]').onclick();}
 assert.equal(f.launched.filter(x=>x[0].startsWith('Eris')).length,26);assert.equal(f.launched.filter(x=>!x[0].startsWith('Eris')).length,12);assert.deepEqual(f.toasts,[]);
}finally{f.close();}});
test('missing specialist produces a visible error without hiding the menu',async()=>{const f=await fixture();try{delete f.w.ErisSupport;await f.d.querySelector('[data-a=tickets]').onclick();assert.ok(f.d.querySelector('.aw-launch-error').textContent.includes('araç yüklenemedi'));assert.equal(f.d.querySelector('.eris-admin-overlay').style.display,'');}finally{f.close();}});
test('ID directory and verified profile avoid raw JSON and retain precise balance',async()=>{const f=await fixture();try{await f.w.ErisAdmin.openTool('lookup');await tick();await f.click('Hesabı incele');assert.ok(f.d.body.textContent.includes('9007199254740993'));assert.equal(f.d.querySelector('pre'),null);await f.click('İlgili olay dosyaları');assert.deepEqual(JSON.parse(JSON.stringify(f.launched.at(-1))),['cases',{q:'1234567890'}]);}finally{f.close();}});
test('role proposal is a real form with snapshot, identity confirmation, reason and stable key',async()=>{const f=await fixture();try{await f.w.ErisAdmin.openTool('roles');await tick();await f.click('Kadroya ve rol talebine dön');await f.click('Hesabı incele');await f.submit('Bağımsız onaya gönder',{role:'UA',reason:'A documented staffing decision for the designated fixture duty',confirm:'1234567890'});const c=f.calls.find(c=>c.p.endsWith('/role-requests')&&c.method==='POST');assert.equal(c.body.role,'UA');assert.equal(c.body.confirm_public_id,'1234567890');assert.equal(c.body.expected_snapshot,'a'.repeat(64));assert.ok(c.body.request_key.length>=16);assert.ok(f.d.body.textContent.includes('hesap yetkisi henüz değişmedi'));assert.ok(!f.calls.some(c=>c.p==='/v1/admin/roles'&&c.method==='PUT'));}finally{f.close();}});
test('role conflict remains visible and does not claim success',async()=>{const f=await fixture();try{await f.w.ErisAdmin.openTool('lookup');await tick();await f.click('Hesabı incele');await f.click('Rol değişikliği talep et');f.setRoleFailure(true);await f.submit('Bağımsız onaya gönder',{role:'FA',reason:'A documented staffing decision submitted with obsolete state',confirm:'1234567890'});assert.ok(f.d.body.textContent.includes('Mevcut rol değişti'));assert.ok(!f.d.body.textContent.includes('Yetki talebi #1 kaydedildi'));}finally{f.close();}});
test('account deletion requires exact ID and explicit selection before any DELETE',async()=>{const f=await fixture();try{await f.w.ErisAdmin.openTool('deleteaccount');await f.submit('Hesabı sorgula',{id:'USER'});await f.submit('Hesabı kalıcı sil',{confirm:'WRONG',ack:'delete'});assert.ok(!f.calls.some(c=>c.method==='DELETE'));assert.ok(f.d.body.textContent.includes('Profil ID onayı eşleşmedi'));await f.submit('Hesabı kalıcı sil',{confirm:'1234567890',ack:'delete'});assert.equal(f.calls.filter(c=>c.method==='DELETE').length,1);assert.ok(f.d.body.textContent.includes('Hesap silme işlemi tamamlandı'));}finally{f.close();}});
test('Ghost Mode never mutates on open and requires an explicit form submission',async()=>{const f=await fixture();try{await f.w.ErisAdmin.openTool('ghost');assert.ok(!f.calls.some(c=>c.method==='PATCH'));await f.submit('Durumu uygula',{enabled:'true'});assert.equal(f.calls.find(c=>c.method==='PATCH').body.enabled,true);}finally{f.close();}});
test('staff shortcuts carry fixed role filters into the real audit screen',async()=>{const f=await fixture();try{for(const [key,role]of [['saactions','SA'],['uaactions','UA'],['faactions','FA'],['daactions','DA']]){await f.w.ErisAdmin.openTool(key);assert.deepEqual(JSON.parse(JSON.stringify(f.launched.at(-1))),['audit',{role}]);}}finally{f.close();}});
test('old menu cannot dispatch a write or launch after account token changes',async()=>{const f=await fixture();try{const before=f.calls.length;f.w.localStorage.setItem('erischat.accessToken.v1','another-account');await f.d.querySelector('[data-a=ghost]').onclick();assert.ok(f.d.querySelector('.aw-launch-error').textContent.includes('Oturum değişti'));assert.equal(f.calls.length,before);}finally{f.close();}});
test('metadata failure keeps a visible retry and does not fabricate counters',async()=>{const f=await fixture('DA',{workspaceFailure:true});try{assert.ok(f.d.body.textContent.includes('Araç bilgileri alınamadı'));assert.equal(f.d.querySelectorAll('.aw-count').length,0);f.setWorkspaceFailure(false);await f.click('Bilgileri yeniden yükle');assert.equal(f.d.querySelectorAll('.aw-tool').length,32);}finally{f.close();}});

test('a different DA records an explicit decision and sees the execution receipt',async()=>{const f=await fixture();try{f.pending.push({id:1,requester_id:'DA',target_id:'USER',target_public_id:'1234567890',target_name:'Fixture Member',previous_role:null,requested_role:'UA',reason:'A complete staffing request awaiting an independent decision',status:'pending'});f.setActor('DA2');await f.w.ErisAdmin.openTool('roles');await tick();await f.submit('Kararı kaydet',{action:'approve',note:'Independent second DA verified the staffing request and evidence'});const c=f.calls.find(c=>c.p.endsWith('/role-requests/1/decision'));assert.equal(c.body.action,'approve');assert.ok(f.d.body.textContent.includes('Yetki talebi #1: Uygulandı.'));}finally{f.close();}});
