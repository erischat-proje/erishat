/* Functional DOM tests: real forms/events and mocked HTTP; no live account. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ERIS_JSDOM_MODULE||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../frontend/management-center.js'),'utf8');
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function setup(role='FA'){
 const dom=new JSDOM('<!doctype html><html data-eris-theme="light"><body><button id="opener">Menu</button></body></html>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window,doc=w.document;
 const calls=[],legacy=[],downloads=[];let currentRole=role,failNotes=false;
 const cases=[{id:1,category:'harassment',status:'open',summary:'The original reported incident has enough context',target_public_id:'1234567890',target_name:'Fixture User',target_user_id:'USER',reporter_id:'UA',reporter_name:'UA',assigned_id:null,assigned_name:null,created_at:new Date().toISOString()}];
 const history=[];
 const financial={id:1,requester_id:'FA2',requester_name:'FA2',target_public_id:'1234567890',target_name:'Fixture User',amount:'50',operation:'EKLEME',status:'pending_review',reason:'A documented correction for an existing transaction',evidence_url:'/v1/admin/management/finance-requests/1/evidence'};
 w.localStorage.setItem('erischat.accessToken.v1','fixture-token');w.ERISCHAT_API_BASE='https://fixture.test';w.ErisAdmin={openTool:async key=>legacy.push(key)};w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
 const answer=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>JSON.parse(JSON.stringify(data)),blob:async()=>new w.Blob(['fixture'],{type:'image/png'})});
 w.fetch=async(url,options={})=>{
  const u=new URL(url),p=u.pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;calls.push({p,method,body});
  if(p==='/v1/admin/me')return answer(200,{id:currentRole,role:currentRole});
  if(p==='/v1/admin/operations/overview')return answer(200,{open_cases:1,assigned_to_me:0,counts:{awaiting_decision:0},active_emergency:0,recent_cases:cases});
  if(p==='/v1/admin/cases/staff')return answer(200,[{id:'SA',role:'SA',name:'SA',public_id:'1111111111'},{id:'FA',role:'FA',name:'FA',public_id:'2222222222'}]);
  if(p==='/v1/admin/cases'&&method==='GET')return answer(200,cases);
  if(p==='/v1/admin/cases'&&method==='POST'){const c={...cases[0],...body,id:cases.length+1,reporter_id:currentRole};cases.push(c);return answer(201,c);}
  let match=p.match(/^\/v1\/admin\/cases\/(\d+)(?:\/(.*))?$/);
  if(match){const cid=Number(match[1]),action=match[2],c=cases.find(c=>c.id===cid);if(!c)return answer(404,{detail:'Olay dosyası bulunamadı'});
   if(!action)return answer(200,{case:c,history,next_before:null,can_assign:['FA','DA'].includes(currentRole),can_decide:currentRole!==c.reporter_id});
   if(action==='notes'){if(failNotes)return answer(409,{detail:'Dosya başka bir işlemle kapatıldı'});history.unshift({id:1,event:'note',actor_name:currentRole,details:{note:body.note}});return answer(201,{recorded:true});}
   if(action==='assign'){c.assigned_id=body.assignee_id;c.assigned_name=body.assignee_id;return answer(200,c);}
   if(action==='status'){c.status=body.status;return answer(200,c);}
   if(action==='evidence'||action==='evidence-upload')return answer(201,{id:1,recorded:true});
   if(action==='sanction-request')return answer(201,{request_id:7,status:'pending'});
  }
  if(p==='/v1/admin/operations/emergency-chat')return method==='GET'?answer(200,{items:[],next_before:null}):answer(201,{action_id:1});
  if(p==='/v1/admin/management/finance-requests')return method==='GET'?answer(200,{items:[financial],next_before:null}):answer(201,{id:2});
  if(p==='/v1/admin/management/finance-requests/1')return answer(200,{...financial,can_review:financial.status==='pending_review'&&currentRole==='FA',can_execute:financial.status==='reviewed'&&currentRole==='DA',can_cancel:false});
  if(p.endsWith('/finance-requests/1/review')){financial.status=body.approve?'reviewed':'rejected';return answer(200,financial);}
  if(p.endsWith('/finance-requests/1/decision')){financial.status=body.approve?'executed':'rejected';financial.operation_id='op1';return answer(200,financial);}
  if(p.endsWith('/evidence'))return answer(200,{});
  if(p==='/v1/admin/finance-audit/overview')return answer(200,{manual_operation_count:1,vip_accounts:2,lidya_added_sample:'50',lidya_removed_sample:'0'});
  if(['/v1/admin/finance-audit/manual-operations','/v1/admin/finance-audit/orders','/v1/admin/finance-audit/vip'].includes(p))return answer(200,{items:[],next_cursor:null});
  if(p==='/v1/admin/finance-audit/manual-operations/op1')return answer(200,{id:'op1',target_public_id:'1234567890',amount:'50',before:'0',after:'50',operation:'EKLEME',balanced:false});
  if(p==='/v1/admin/fraud-review/signals')return answer(200,{scanned:1,findings:[{operation_id:'op1',type:'balance_delta_mismatch',target_public_id:'1234567890'}]});
  if(p==='/v1/admin/management/signal-reviews')return answer(200,method==='GET'?[]:{recorded:true});
  if(p==='/v1/admin/management/audit')return answer(200,{items:[{id:1,action:'case_created',actor_name:'FA',actor_public_id:'1234567899',role:'FA',details:{case_id:1}}],next_before:null});
  return answer(404,{detail:'Not Found'});
 };
 w.eval(source);
 const button=text=>[...doc.querySelectorAll('button')].find(b=>b.textContent===text);
 const details=title=>[...doc.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent===title);
 async function click(text){const b=button(text);assert.ok(b,'button '+text);b.click();await tick();}
 async function submit(title,values){const section=details(title);assert.ok(section,'section '+title);section.open=true;const f=section.querySelector('form');for(const [name,value] of Object.entries(values)){const input=f.elements.namedItem(name);assert.ok(input,'field '+name);input.value=value;}f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();return f;}
 return {w,doc,calls,legacy,downloads,cases,button,details,click,submit,setRole:r=>currentRole=r,setFailNotes:v=>failNotes=v,open:kind=>w.LidyaManagementCenter.open(kind),close:()=>dom.window.close()};
}
test('case creation, note and assignment use real visible forms',async()=>{const f=setup();try{
 await f.open('cases');await f.click('Yeni dosya');await f.submit('Olay bilgileri',{category:'harassment',target_public_id:'1234567890',summary:'A detailed complaint submitted with its original context'});
 assert.ok(f.doc.body.textContent.includes('Olay #2'));await f.submit('İnceleme notu ekle',{note:'This note records the evidence review results'});assert.ok(f.doc.body.textContent.includes('This note records the evidence review results'));
 await f.submit('Görev ata',{assignee_id:'SA',note:'Please examine the supporting support record'});assert.equal(f.calls.find(c=>c.p.endsWith('/assign')).body.assignee_id,'SA');
 assert.equal(f.calls.filter(c=>c.method==='POST'&&c.p==='/v1/admin/cases').length,1);
}finally{f.close();}});
test('server conflict remains in form and does not show false success',async()=>{const f=setup();try{await f.open('cases');await f.click('Dosyayı incele');f.setFailNotes(true);await f.submit('İnceleme notu ekle',{note:'Valid but concurrently closed incident note'});assert.ok(f.details('İnceleme notu ekle').textContent.includes('Dosya başka bir işlemle kapatıldı'));assert.ok(!f.details('İnceleme notu ekle').textContent.includes('Kaydedildi.'));}finally{f.close();}});
test('emergency form posts case, target, reason and bounded duration',async()=>{const f=setup('UA');try{await f.open('emergency');await f.submit('Yeni acil sohbet kısıtlaması',{case_id:'1',target_public_id:'1234567890',minutes:'60',reason:'Immediate protective intervention for the documented incident'});const c=f.calls.find(c=>c.method==='POST'&&c.p.endsWith('/operations/emergency-chat'));assert.equal(c.body.minutes,60);assert.equal(c.body.case_id,1);assert.ok(f.doc.body.textContent.includes('Tedbir uygulandı'));}finally{f.close();}});
test('financial review and final approval are separate actions and final state visible',async()=>{const f=setup('FA');try{await f.open('finance');await f.click('Talep ve kanıtı incele');assert.ok(!f.details('Bağımsız son karar'));await f.submit('Bağımsız ön inceleme',{approve:'yes',note:'Evidence independently checked and the amount is supported'});assert.ok(f.doc.body.textContent.includes('Son onay bekliyor'));f.setRole('DA');await f.open('finance');await f.click('Talep ve kanıtı incele');await f.submit('Bağımsız son karar',{approve:'yes',note:'Final independent authorization with the checked source proof'});assert.ok(f.doc.body.textContent.includes('Uygulandı'));assert.equal(f.calls.filter(c=>c.p.endsWith('/review')&&c.method==='POST').length,1);assert.equal(f.calls.filter(c=>c.p.endsWith('/decision')&&c.method==='POST').length,1);}finally{f.close();}});
test('financial proposal carries proof and stable request identity, without direct balance calls',async()=>{const f=setup('FA');try{await f.open('finance');const section=f.details('Yeni mali düzeltme talebi'),input=section.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new f.w.File(['proof'],'proof.png',{type:'image/png'})]});input.required=false;/* jsdom cannot set the native FileList; fileData still requires the selected fixture. */await f.submit('Yeni mali düzeltme talebi',{target_public_id:'1234567890',operation:'EKLEME',amount:'9007199254740993',reason:'A supported correction amount represented as an exact integer string'});const c=f.calls.find(c=>c.method==='POST'&&c.p.endsWith('/finance-requests'));assert.equal(c.body.amount,'9007199254740993');assert.ok(c.body.request_key.length>=16);assert.ok(c.body.evidence.startsWith('data:image/png;base64,'));assert.ok(!f.calls.some(c=>/lidya\/(add|remove)$/.test(c.p)));}finally{f.close();}});
test('signal creates linked incident and records explicit review disposition',async()=>{const f=setup('DA');try{await f.open('fraud');await f.click('Göstergeyi incele');await f.submit('İnceleme sonucunu kaydet',{status:'escalated',case_id:'1',note:'The mismatching operation requires case-based investigation'});const c=f.calls.find(c=>c.method==='POST'&&c.p.endsWith('/signal-reviews'));assert.equal(c.body.operation_id,'op1');assert.equal(c.body.case_id,1);assert.equal(c.body.status,'escalated');}finally{f.close();}});
test('audit filters and visible-only CSV are actionable',async()=>{const f=setup('DA');try{await f.open('audit');await f.submit('Denetim filtreleri',{role:'FA',actor:'1234567899',action:'case',days:'7'});await f.click('Görüntülenen kayıtları CSV indir');assert.equal(f.downloads[0],'lidya-yonetim-denetimi.csv');assert.ok(f.doc.body.textContent.includes('case_created'));}finally{f.close();}});
test('guide explains SA UA FA without disclosing excluded management features',async()=>{const f=setup('SA');try{await f.open('help');const text=f.doc.querySelector('main').textContent;assert.ok(text.includes('SA ·'));assert.ok(text.includes('UA ·'));assert.ok(text.includes('FA ·'));assert.ok(!/\bDA\b|ghost/i.test(text));}finally{f.close();}});
test('operations centre exposes casework and existing support shortcuts',async()=>{const f=setup('FA');try{await f.open('command');assert.ok(f.button('Yeni olay dosyası'));await f.click('Destek talepleri');assert.deepEqual(f.legacy,['tickets']);assert.equal(f.doc.querySelectorAll('.lm-command-overlay').length,0);}finally{f.close();}});

test('a source case link opens the authorized case detail directly',async()=>{const f=setup('FA');try{await f.w.LidyaManagementCenter.open('cases',{caseId:1});assert.ok(f.doc.body.textContent.includes('Olay #1'));assert.ok(f.details('İnceleme notu ekle'));}finally{f.close();}});
