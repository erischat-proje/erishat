const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const pause=(ms=40)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document,errors=[],calls=[],toasts=[];w.localStorage.setItem('token','fixture');w.toast=x=>toasts.push(x);w.ErisApiTransport={poll(){}};w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
 const conversations=['dm','other','system'].map(id=>({id,type:id==='system'?'welcome':'dm',members:[{user_id:'peer',nickname:'Kişi'}]}));
 const message=(id,extra={})=>({id,conversation_id:'dm',sender_id:'peer',sender_nickname:'<img src=x>',text:'Mesaj '+id,created_at:new Date().toISOString(),...extra});
 let pins=[message(8,{text:'<script>güvenli metin</script>'})],messages=[message(1,{media_type:'voice'}),message(2,{temporary:true})],manage=true,fail=false,failRead=false,hold=false,resolveRead,holdWrite=false,resolveWrite;
 w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),getAccessToken:()=>'',messages:async()=>messages,conversation:async id=>conversations.find(c=>c.id===id),messageHistory:async(id,before,around)=>{calls.push(['history',id,before,around]);return {messages:around?[message(around,{is_pinned:true})]:structuredClone(messages),has_more:false}},api:async(path,opts)=>{
  calls.push([path,opts]);if(path.startsWith('/conversations?'))return conversations;
  if(/^\/conversations\/[^/]+\/pins$/.test(path)){
   if(hold)return await new Promise(r=>resolveRead=r);if(failRead)throw new Error('Liste yüklenemedi');
   return {items:path.includes('/dm/')?pins.map((m,i)=>({pin_id:i+1,message:{...structuredClone(m),is_pinned:true}})):[],can_manage:manage,limit:5};
  }
  if(/^\/conversations\/[^/]+\/pins\/\d+$/.test(path)){
   if(holdWrite)return await new Promise(r=>resolveWrite=r);if(fail)throw new Error('Yetkiniz yok');const mid=Number(path.split('/').at(-1)),pinned=opts.method==='POST';pins=pinned?[...pins,message(mid,{is_pinned:true})]:pins.filter(m=>m.id!==mid);return {pinned};
  }return {};
 }};
 w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await pause();await w.ErisChatDM.load();await w.ErisChatDM.open('dm','Kişi','K','peer');await pause();
 const row=id=>d.querySelector('.bubble[data-message-id="'+id+'"]'),select=id=>row(id).dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
 assert(d.querySelector('[data-pin-banner]').textContent.includes('1 sabit mesaj'));assert(d.querySelector('[data-pinned-messages]').textContent.includes('(1)'));
 d.querySelector('[data-pin-banner]').click();await pause();assert.equal(d.querySelector('.dm-pin-card b').textContent,'<img src=x>');assert.equal(d.querySelector('.dm-pin-card script'),null);assert.equal(d.querySelector('.dm-pin-card img'),null);
 d.querySelector('[data-pin-goto]').click();await pause();assert(calls.some(c=>c[0]==='history'&&c[3]===8));assert(row(8));assert.equal(d.querySelector('[data-pinned-panel]'),null);
 await w.ErisChatDM.open('dm','Kişi','K','peer');await pause();select(2);assert(d.querySelector('[data-pin-selected]').disabled);d.querySelector('[data-clear-selected]').click();
 const player=row(1).querySelector('.dm-voice-player');select(1);assert(!d.querySelector('[data-pin-selected]').disabled);d.querySelector('[data-pin-selected]').click();await pause();d.querySelector('[data-yes]').click();await pause();assert(row(1).querySelector('[data-pin-icon]'));assert.equal(row(1).querySelector('.dm-voice-player'),player);assert.equal(row(1)._message.is_pinned,true);assert(toasts.includes('Mesaj sabitlendi.'));assert(!d.querySelector('[data-pin-selected]').disabled);
 // Single-message action avoids partially applied batches.
 row(2).click();assert(d.querySelector('[data-pin-selected]').disabled);d.querySelector('[data-clear-selected]').click();
 d.querySelector('[data-pinned-messages]').click();await pause();fail=true;d.querySelector('[data-pin-remove]').click();await pause();assert(Number(d.querySelector('.dm-vault-modal').style.zIndex)>100090);d.querySelector('[data-yes]').click();await pause();assert(d.querySelector('[data-status]').textContent.includes('Yetkiniz yok'));assert(!d.querySelector('[data-pin-remove]').disabled);assert.equal(d.querySelectorAll('.dm-pin-card').length,2);
 fail=false;d.querySelector('[data-pin-remove]').click();await pause();d.querySelector('[data-yes]').click();await pause();assert.equal(d.querySelectorAll('.dm-pin-card').length,1);
 // Peer changes remove both the shared list card and the existing bubble marker.
 pins=[];w.dispatchEvent(new w.CustomEvent('erischat:event',{detail:{type:'dm_pins_updated',conversation_id:'dm'}}));await pause();assert.equal(d.querySelectorAll('.dm-pin-card').length,0);assert.equal(row(1).querySelector('[data-pin-icon]'),null);assert(d.querySelector('[data-pin-banner]').hidden);assert(d.querySelector('[data-status]').textContent.includes('sabitlenmiş mesaj yok'));
 manage=false;pins=[message(1)];d.querySelector('[data-pin-refresh]').click();await pause();assert.equal(d.querySelector('[data-pin-remove]'),null);select(1);assert(d.querySelector('[data-pin-selected]').disabled);d.querySelector('[data-clear-selected]').click();
 failRead=true;d.querySelector('[data-pin-refresh]').click();await pause();assert.equal(d.querySelectorAll('.dm-pin-card').length,0);assert(d.querySelector('[data-status]').textContent.includes('Liste yüklenemedi'));failRead=false;
 // Older HTTP results cannot overwrite a newer socket refresh.
 hold=true;d.querySelector('[data-pin-refresh]').click();await pause();const oldRead=resolveRead;hold=false;pins=[message(8)];w.dispatchEvent(new w.CustomEvent('erischat:event',{detail:{type:'dm_pins_updated',conversation_id:'dm'}}));await pause();oldRead({items:[],can_manage:true,limit:5});await pause();assert.equal(d.querySelectorAll('.dm-pin-card').length,1);assert(d.querySelector('.dm-pin-card').dataset.pinMessageId==='8');
 hold=true;d.querySelector('[data-pin-refresh]').click();await pause();const stale=resolveRead;hold=false;await w.ErisChatDM.open('other','Diğer','D','peer');await pause();stale({items:[{message:message(99)}],can_manage:true});await pause();assert.equal(d.querySelector('[data-pinned-panel]'),null);assert(d.querySelector('[data-pin-banner]').hidden);
 // A delayed write must not alter the newly opened conversation.
 manage=true;await w.ErisChatDM.open('dm','Kişi','K','peer');await pause();select(1);holdWrite=true;d.querySelector('[data-pin-selected]').click();await pause();d.querySelector('[data-yes]').click();await pause();const pendingWrite=resolveWrite;await w.ErisChatDM.open('other','Diğer','D','peer');await pause();holdWrite=false;pendingWrite({pinned:true});await pause();assert(d.querySelector('[data-pin-banner]').hidden);assert.equal(row(1).querySelector('[data-pin-icon]'),null);
 // Logout closes the private list and ignores delayed responses.
 await w.ErisChatDM.open('dm','Kişi','K','peer');await pause();d.querySelector('[data-pinned-messages]').click();await pause();hold=true;d.querySelector('[data-pin-refresh]').click();await pause();const late=resolveRead;w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));late({items:[{message:message(100)}],can_manage:true});await pause();assert.equal(d.querySelector('[data-pinned-panel]'),null);assert.equal(d.querySelector('[data-pin-banner]'),null);assert.deepEqual(errors,[]);
 dom.window.close();console.log('PASS: pinned list/banner, safe previews, historical jump, single pin, media preservation, timed-message guard, shared confirmation, errors, peer unpin, manager controls, refresh ordering, chat switch and logout');
})().catch(e=>{console.error(e);process.exit(1)});
