const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const pause=(ms=40)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document,errors=[],calls=[],toasts=[];w.localStorage.setItem('token','fixture');w.toast=x=>toasts.push(x);w.ErisApiTransport={poll(){}};w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
 const now=new Date().toISOString(),message=(id,extra={})=>({id,conversation_id:'dm',sender_id:'peer',sender_nickname:'Kişi',text:'Metin '+id,created_at:now,...extra});
 const conversation={id:'dm',type:'dm',name:'<img src=x>',members:[{user_id:'peer',nickname:'Kişi'}]},other={id:'other',type:'dm',name:'Diğer',members:[{user_id:'second',nickname:'Diğer'}]};
 let messages=[message(1,{media_type:'voice',is_starred:false}),message(2,{protected_message:true})],stars=[],fail=false,hold=null,holdResolve,detailFail=false;
 w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),getAccessToken:()=>'',messages:async()=>messages,conversation:async id=>{if(detailFail)throw new Error('Erişim yok');return id==='dm'?conversation:other},messageHistory:async(id,before,around)=>{calls.push(['history',id,before,around]);return {messages:around?[message(around,{is_starred:true})]:structuredClone(messages),has_more:false}},api:async(path,opts)=>{
  calls.push([path,opts]);
  if(path.startsWith('/conversations?'))return [conversation,other];
  if(path.startsWith('/message-stars?')){
   const url=new URL(path,'https://eris.test'),q=url.searchParams.get('q');
   if(q==='slow')return await new Promise(r=>holdResolve=r);
   if(q==='none'||url.searchParams.get('kind')==='document')return {items:[],has_more:false};
   if(url.searchParams.has('before'))return {items:[{star_id:1,conversation,message:message(8)}],has_more:false};
   return {items:structuredClone(stars),has_more:stars.length>0,next_before:5};
  }
  if(path.startsWith('/message-stars/')){
   if(fail)throw new Error('Kaydedilemedi');const mid=Number(path.split('/').at(-1)),starred=JSON.parse(opts.body).starred,m=messages.find(m=>m.id===mid);if(m)m.is_starred=starred;
   stars=starred?[{star_id:5,conversation,message:{...message(mid),text:'<script>güvenli metin</script>',is_starred:true}}]:[];
   return {is_starred:starred};
  }return {};
 }};
 w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await pause();await w.ErisChatDM.load();
 // Inbox entry works before any conversation installs the chat tools/styles.
 d.querySelector('[data-open-stars]').click();await pause();assert(d.querySelector('[data-starred-panel]'));assert(d.querySelector('#dm-stars-styles'));assert(d.querySelector('[data-status]').textContent.includes('yıldızlı mesaj yok'));d.querySelector('[data-message-action-panel] [data-close]').click();
 await w.ErisChatDM.open('dm','Kişi','K','peer');await pause();
 const row=id=>d.querySelector('.bubble[data-message-id="'+id+'"]'),clear=()=>d.querySelector('[data-clear-selected]').click(),select=id=>row(id).dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
 const player=row(1).querySelector('.dm-voice-player');select(1);d.querySelector('[data-star-selected]').click();await pause();assert(row(1).querySelector('.dm-message-star'));assert.equal(row(1).querySelector('.dm-voice-player'),player);assert.equal(d.querySelector('[data-star-selected]').textContent,'Yıldızı kaldır');
 fail=true;d.querySelector('[data-star-selected]').click();await pause();assert(row(1).querySelector('.dm-message-star'));assert(!d.querySelector('[data-star-selected]').disabled);assert(toasts.includes('Kaydedilemedi'));fail=false;clear();select(2);assert(d.querySelector('[data-star-selected]').disabled);clear();
 d.querySelector('[data-starred-messages]').click();await pause();assert(calls.some(([p])=>p.startsWith('/message-stars?')&&p.includes('conversation_id=dm')));assert(d.querySelector('[data-scope-label]').hidden);assert.equal(d.querySelector('.dm-star-card b').textContent,'<img src=x>');assert.equal(d.querySelector('.dm-star-card img'),null);assert.equal(d.querySelector('.dm-star-card script'),null);
 d.querySelector('[data-star-more]').click();await pause();assert.equal(d.querySelectorAll('.dm-star-card').length,2);assert(d.querySelector('[data-star-more]').hidden);
 detailFail=true;d.querySelector('[data-star-goto]').click();await pause();assert(d.querySelector('[data-status]').textContent.includes('Erişim yok'));assert(d.querySelector('[data-starred-panel]'));detailFail=false;d.querySelectorAll('[data-star-goto]')[1].click();await pause();assert.equal(d.querySelector('[data-starred-panel]'),null);assert(calls.some(c=>c[0]==='history'&&c[3]===8));assert(row(8));await w.ErisChatDM.open('dm','Kişi','K','peer');
 d.querySelector('[data-open-stars]').click();await pause();d.querySelector('[data-star-remove]').click();await pause();assert.equal(d.querySelectorAll('.dm-star-card').length,0);assert.equal(row(1).querySelector('.dm-message-star'),null);
 // Query edits empty old results immediately, and stale responses cannot overwrite a newer query.
 const input=d.querySelector('[data-star-query]');input.value='slow';input.dispatchEvent(new w.Event('input'));await pause(300);assert(holdResolve);input.value='none';input.dispatchEvent(new w.Event('input'));await pause(300);holdResolve({items:[{star_id:99,conversation,message:message(99)}],has_more:false});await pause();assert.equal(d.querySelectorAll('.dm-star-card').length,0);
 // Refresh and kind filters remain usable after failures/empty results; logout closes the private panel.
 input.value='';input.dispatchEvent(new w.Event('input'));await pause(300);d.querySelector('[data-star-kind]').value='document';d.querySelector('[data-star-kind]').dispatchEvent(new w.Event('change'));await pause();assert(d.querySelector('[data-status]').textContent.includes('yıldızlı mesaj yok'));
 input.value='slow';input.dispatchEvent(new w.Event('input'));await pause(300);w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));holdResolve({items:[{star_id:100,conversation,message:message(100)}],has_more:false});await pause();assert.equal(d.querySelector('[data-starred-panel]'),null);assert.deepEqual(errors,[]);
 dom.window.close();console.log('PASS: inbox-first stars UI, private star/unstar, protected messages, audio preservation, safe text, scoped/global list, paging, gated navigation/jump, remove, stale search and logout');
})().catch(e=>{console.error(e);process.exit(1)});
