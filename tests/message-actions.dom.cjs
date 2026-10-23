const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const pause=(ms=35)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document,errors=[],calls=[],toasts=[];w.localStorage.setItem('token','fixture');w.toast=x=>toasts.push(x);w.ErisApiTransport={poll(){}};w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
 const now=new Date().toISOString(),message=(id,extra={})=>({id,conversation_id:'dm',sender_id:'peer',text:'Mesaj '+id,created_at:now,reactions:[],...extra});
 let messages=[message(1,{media_type:'voice'}),message(2,{sender_id:'me',media_type:'document',media_name:'ornek.pdf',media_size:20}),message(3,{protected_message:true})],fail=false,hold=false,resolveHold;
 const conversations=[{id:'dm',type:'dm',members:[{user_id:'peer',nickname:'Kişi'}]},{id:'target',type:'dm',members:[{user_id:'other',nickname:'<img src=x>'}]},{id:'group',type:'group',name:'Grup',members:[]},{id:'system',type:'welcome',members:[]}];
 w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),getAccessToken:()=>'',messages:async()=>messages,messageHistory:async()=>({messages:structuredClone(messages),has_more:false}),api:async(path,opts)=>{
  calls.push([path,opts]);
  if(path.startsWith('/conversations?')){
   if(hold)return await new Promise(r=>resolveHold=r);
   const url=new URL(path,'https://eris.test');return url.searchParams.get('q')==='none'?[]:structuredClone(conversations);
  }
  if(path.endsWith('/reaction')){const mid=Number(path.split('/').at(-2)),emoji=JSON.parse(opts.body).emoji,m=messages.find(m=>m.id===mid);m.reactions=emoji?[{emoji,count:1,mine:true}]:[];return {forwarded:false,reactions:structuredClone(m.reactions)}}
  if(path.endsWith('/metadata'))return {forwarded:false,reactions:[{emoji:'😂',count:2,mine:false}]};
  if(path.endsWith('/forward')){if(fail)throw new Error('Tekrar dene');return {messages:[message(7,{forwarded:true})],replayed:false}}
  return {};
 }};
 w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await pause();await w.ErisChatDM.load();await w.ErisChatDM.open('dm','Kişi','K','peer');await pause();
 const row=id=>d.querySelector('.bubble[data-message-id="'+id+'"]'),select=id=>row(id).dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
 const clear=()=>d.querySelector('[data-clear-selected]').click();
 const voicePlayer=row(1).querySelector('.dm-voice-player');
 select(1);d.querySelector('[data-react-selected]').click();assert.equal(d.querySelectorAll('.dm-emoji-picker button').length,9);d.querySelector('.dm-emoji-picker button').click();await pause();assert.equal(row(1).querySelector('.dm-reactions button').textContent,'👍 1');assert.equal(row(1).querySelector('.dm-reactions button').getAttribute('aria-pressed'),'true');assert.equal(d.querySelector('[data-message-action-panel]'),null);
 row(1).querySelector('.dm-reactions button').click();await pause();assert.equal(row(1).querySelector('.dm-reactions'),null);
 w.dispatchEvent(new w.CustomEvent('erischat:event',{detail:{type:'dm_reactions_updated',conversation_id:'dm',message_id:1}}));await pause();assert.equal(row(1).querySelector('.dm-reactions button').textContent,'😂 2');assert.equal(row(1).querySelector('.dm-reactions button').getAttribute('aria-pressed'),'false');assert.equal(row(1).querySelector('.dm-voice-player'),voicePlayer);
 select(3);assert.equal(d.querySelector('[data-forward-selected]').disabled,true);assert.equal(d.querySelector('[data-react-selected]').disabled,true);clear();
 select(1);row(2).click();assert.equal(d.querySelector('[data-forward-selected]').disabled,false);d.querySelector('[data-forward-selected]').click();await pause();
 assert.equal(d.querySelectorAll('[data-forward-target]').length,2);assert.equal(d.querySelector('[data-forward-target="dm"]'),null);assert.equal(d.querySelector('[data-forward-target="system"]'),null);assert.equal(d.querySelector('[data-message-action-panel] img'),null);assert.equal(d.querySelector('[data-forward-target="target"]').textContent,'<img src=x>');assert(d.querySelector('[data-send]').disabled);
 d.querySelector('[data-forward-target="target"]').click();fail=true;d.querySelector('[data-send]').click();await pause();assert(d.querySelector('[data-status]').textContent.includes('Tekrar dene'));assert.equal(d.querySelector('[data-send]').disabled,false);
 fail=false;d.querySelector('[data-send]').click();await pause();assert.equal(d.querySelector('[data-message-action-panel]'),null);assert(toasts.includes('Mesajlar iletildi.'));
 const forwards=calls.filter(([p])=>p.endsWith('/forward')).map(([,o])=>JSON.parse(o.body));assert.equal(forwards.length,2);assert.equal(forwards[0].request_key,forwards[1].request_key);assert.deepEqual(forwards[0].message_ids,[1,2]);assert.equal(forwards[0].target_conversation_id,'target');
 // Query edits clear old targets immediately; delayed lists never survive chat changes.
 select(1);d.querySelector('[data-forward-selected]').click();await pause();const query=d.querySelector('[data-message-action-panel] [data-query]');query.value='none';query.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('[data-forward-target]').length,0);assert(d.querySelector('[data-send]').disabled);await pause(300);assert(d.querySelector('[data-status]').textContent.includes('uygun sohbet'));
 query.value='';query.dispatchEvent(new w.Event('input'));await pause(300);assert.equal(d.querySelectorAll('[data-forward-target]').length,2);
 d.querySelector('[data-close]').click();hold=true;d.querySelector('[data-forward-selected]').click();await pause();assert(resolveHold);await w.ErisChatDM.open('target','Diğer','D','other');resolveHold(conversations);await pause();assert.equal(d.querySelector('[data-message-action-panel]'),null);hold=false;
 // Forwarded copies carry a label. The action popup is cleared on logout.
 messages=[message(9,{forwarded:true})];await w.ErisChatDM.open('dm','Kişi','K','peer');assert.equal(row(9).querySelector('.dm-forward-label').textContent,'↪ İletildi');select(9);d.querySelector('[data-react-selected]').click();w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));assert.equal(d.querySelector('[data-message-action-panel]'),null);assert.deepEqual(errors,[]);
 dom.window.close();console.log('PASS: reaction add/remove/live metadata, protected messages, multi-message forwarding, safe target names, confirmation, stable retry key, search races, chat switch, forwarded label and logout');
})().catch(e=>{console.error(e);process.exit(1)});
