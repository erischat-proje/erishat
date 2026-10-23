const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const pause=(ms=40)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document,calls=[],errors=[],desktop=[];w.localStorage.setItem('token','fixture');w.toast=()=>{};w.ErisApiTransport={poll(){}};w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));w.Notification=class{static permission='granted';constructor(title,opts){desktop.push({title,opts})}};
 let state={is_muted:false,muted_until:null},failGet=false,failPut=false,holdGet=false,holdPut=false,resolveGet,resolvePut;
 const c={id:'dm',type:'dm',members:[{user_id:'peer',nickname:'<img src=x>'}],last_message:'Son mesaj',unread_count:2},other={id:'other',type:'dm',members:[{user_id:'second',nickname:'Diğer'}]};
 w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),getAccessToken:()=>'',messages:async()=>[],api:async(path,opts)=>{
  calls.push([path,opts]);
  if(path.startsWith('/conversations?'))return [{...c,...state},other];
  if(path==='/me/privacy')return {hide_notifications:false};
  if(path.endsWith('/notifications')){
   if(opts?.method==='PUT'){
    if(holdPut)return await new Promise(r=>resolvePut=r);
    if(failPut)throw new Error('Kaydedilemedi');const payload=JSON.parse(opts.body);state={is_muted:payload.is_muted,muted_until:payload.duration_seconds?new Date(Date.now()+payload.duration_seconds*1000).toISOString():null};return structuredClone(state);
   }
   if(holdGet)return await new Promise(r=>resolveGet=r);
   if(failGet)throw new Error('Yüklenemedi');return structuredClone(state);
  }return {};
 }};
 w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await pause();await w.ErisChatDM.load();
 const panel=()=>d.querySelector('[data-notification-settings]'),select=()=>panel().querySelector('[data-notification-duration]'),save=()=>panel().querySelector('[data-notification-save]');
 const choose=value=>{select().value=String(value);select().dispatchEvent(new w.Event('change'))};
 // A list selection opens the named conversation before any chat is opened.
 d.querySelector('[data-inbox-select]').click();assert(!d.querySelector('[data-notify-selected]').disabled);d.querySelector('[data-notify-selected]').click();await pause();assert(panel());assert.equal(panel().querySelector('[data-name]').textContent,'<img src=x>');assert.equal(panel().querySelector('img'),null);assert(save().disabled);
 choose(3600);save().click();await pause();assert(state.is_muted&&state.muted_until);assert(d.querySelector('.dm-list-muted'));assert(panel().querySelector('[data-current]').textContent.includes('zamana kadar'));assert.equal(select().value,'choose');
 for(const value of [28800,86400,604800,'forever']){choose(value);save().click();await pause();const payload=JSON.parse(calls.filter(([p,o])=>p.endsWith('/notifications')&&o?.method==='PUT').at(-1)[1].body);if(value==='forever')assert.deepEqual(payload,{is_muted:true});else assert.equal(payload.duration_seconds,value)}
 assert(panel().querySelector('[data-current]').textContent.includes('süresiz'));choose('off');save().click();await pause();assert.equal(state.is_muted,false);assert.equal(d.querySelector('.dm-list-muted'),null);assert.equal(JSON.parse(calls.filter(([,o])=>o?.method==='PUT').at(-1)[1].body).is_muted,false);
 // Save failures keep the old state and permit a retry.
 choose(3600);failPut=true;save().click();await pause();assert(panel().querySelector('[data-status]').textContent.includes('Kaydedilemedi'));assert(!save().disabled);assert(!select().disabled);assert(!state.is_muted);failPut=false;save().click();await pause();assert(state.is_muted);
 panel().querySelector('[data-close]').click();failGet=true;d.querySelector('[data-notify-selected]').click();await pause();assert(!panel().querySelector('[data-notification-retry]').hidden);failGet=false;panel().querySelector('[data-notification-retry]').click();await pause();assert(!select().disabled);
 // Multiple selected conversations cannot silently change one arbitrary target.
 panel().querySelector('[data-close]').click();d.querySelector('.list .item[data-conversation-id="other"]').click();assert(d.querySelector('[data-notify-selected]').disabled);d.querySelector('.list .item[data-conversation-id="other"]').click();
 // Browser notifications consult the effective server state; message receipt is preserved.
 w.dispatchEvent(new w.CustomEvent('erischat:event',{detail:{type:'dm_message',conversation_id:'dm',message_id:10,sender_id:'peer',text:'Sessizde'}}));await pause();assert.equal(desktop.length,0);
 state={is_muted:false,muted_until:null};w.dispatchEvent(new w.CustomEvent('erischat:event',{detail:{type:'dm_message',conversation_id:'dm',message_id:11,sender_id:'peer',text:'Süre doldu'}}));await pause();assert.equal(desktop.length,1);
 holdGet=true;d.querySelector('[data-notify-selected]').click();await pause();assert(resolveGet);await w.ErisChatDM.open('other','Diğer','D','second');resolveGet({is_muted:true,muted_until:null});await pause();assert.equal(panel(),null);holdGet=false;
 d.querySelector('[data-chat-notifications]').click();await pause();assert(calls.some(([p])=>p==='/conversations/other/notifications'));choose(86400);holdPut=true;save().click();await pause();w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));resolvePut({is_muted:true,muted_until:null});await pause();assert.equal(panel(),null);assert.deepEqual(errors,[]);
 dom.window.close();console.log('PASS: selected-conversation settings, safe name, all durations/unmute, mute icon, GET/PUT retry, multi-select guard, desktop suppression/resume, stale GET and logout during save');
})().catch(e=>{console.error(e);process.exit(1)});
