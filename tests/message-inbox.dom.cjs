const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const pause=(ms=30)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document,errors=[],calls=[],toasts=[];
 w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));w.localStorage.setItem('token','fixture');w.toast=x=>toasts.push(x);w.ErisApiTransport={poll(){}};
 const rows=Array.from({length:63},(_,i)=>({id:'c'+i,type:'dm',members:[{user_id:'peer'+i,nickname:i===0?'<img src=x onerror=alert(1)>':'Kişi '+i}],last_message:'Son mesaj',unread_count:i===0?2:0,pinned:false,manual_unread:false}));
 let hold=null,fail=false;
 w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),messages:async()=>[],getAccessToken:()=>'',api:async(path,opts)=>{
  calls.push([path,opts]);if(path==='/inbox/preferences'){
   if(fail)throw new Error('İşlem başarısız');const payload=JSON.parse(opts.body);
   for(const row of rows.filter(c=>payload.conversation_ids.includes(c.id))){if('pinned'in payload)row.pinned=payload.pinned;if('unread'in payload){row.manual_unread=payload.unread;if(!payload.unread)row.unread_count=0}}
   return {updated:payload.conversation_ids};
  }
  if(!path.startsWith('/conversations?'))return {};
  const url=new URL(path,'https://eris.test'),q=url.searchParams.get('q'),view=url.searchParams.get('view');
  if(q==='slow')return await new Promise(r=>hold=r);
  const result=rows.filter(c=>(!q||c.members[0].nickname.includes(q))&&(view!=='unread'||c.manual_unread||c.unread_count)&&(view!=='pinned'||c.pinned)).sort((a,b)=>Number(b.pinned)-Number(a.pinned));
  return structuredClone(result.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+Number(url.searchParams.get('limit'))));
 }};
 w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await pause();await w.ErisChatDM.load();
 const visible=()=>[...d.querySelectorAll('.list .item[data-conversation-id]')];
 const action=k=>d.querySelector('[data-inbox-action="'+k+'"]');
 const query=async text=>{const input=d.querySelector('[data-inbox-query]');input.value=text;input.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(300)};
 assert.equal(visible().length,50);assert(d.querySelector('[data-inbox-more]'));assert.equal(visible()[0].querySelector('.grow img'),null);assert.equal(visible()[0].querySelector('b').textContent,'<img src=x onerror=alert(1)>');
 d.querySelector('[data-inbox-more]').click();await pause();assert.equal(visible().length,63);assert.equal(d.querySelector('[data-inbox-more]'),null);
 d.querySelector('[data-inbox-view="unread"]').click();await pause();assert.equal(visible().length,1);assert.equal(d.querySelector('[data-inbox-view="unread"]').getAttribute('aria-pressed'),'true');
 d.querySelector('[data-inbox-select]').click();assert.equal(d.querySelector('.dm-list-tools').hidden,false);action('read').click();await pause();assert.equal(visible().length,0);assert(d.querySelector('.dm-list-state').textContent.includes('Bu filtrede'));
 d.querySelector('[data-inbox-view="all"]').click();await pause();d.querySelector('[data-inbox-select]').click();action('unread').click();await pause();assert.equal(visible()[0].querySelector('.dm-unread').textContent,'●');
 d.querySelector('[data-inbox-select]').click();action('pin').click();await pause();assert(visible()[0].querySelector('.dm-list-pin'));d.querySelector('[data-inbox-view="pinned"]').click();await pause();assert.equal(visible().length,1);
 d.querySelector('[data-inbox-select]').click();fail=true;action('unpin').click();await pause();assert.equal(d.querySelector('.dm-list-tools').hidden,false);assert.equal(action('unpin').disabled,false);assert(toasts.includes('İşlem başarısız'));fail=false;action('unpin').click();await pause();assert.equal(visible().length,0);
 d.querySelector('[data-inbox-view="all"]').click();await pause();await query('Kişi 62');assert.equal(visible().length,1);assert.equal(visible()[0].dataset.conversationId,'c62');
 // Selection is scoped to the current search; older responses cannot replace it.
 d.querySelector('[data-inbox-select]').click();await query('slow');assert(hold);await query('Kişi 61');assert.equal(visible()[0].dataset.conversationId,'c61');assert.equal(d.querySelector('.dm-list-tools').hidden,true);
 hold([{id:'stale',type:'dm',members:[]}]);await pause();assert.equal(visible()[0].dataset.conversationId,'c61');
 // User-ID search and folder navigation remain available beside conversation search.
 assert(d.querySelector('[data-dm-user-search]'));assert(d.querySelector('.dm-inbox-nav'));assert(d.querySelector('[data-select-all]').getAttribute('aria-label').includes('Görünen'));
 await query('slow');assert(hold);w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));hold(rows.slice(0,1));await pause();assert.equal(visible().length,0);assert.equal(d.querySelector('[data-inbox-query]').value,'');assert.deepEqual(errors,[]);
 assert(calls.some(([p,o])=>p==='/inbox/preferences'&&JSON.parse(o.body).unread===false));
 dom.window.close();console.log('PASS: inbox pagination, filters, safe labels, accessible selection, read/unread/pin/unpin, mutation failure, search races, legacy search and logout isolation');
})().catch(e=>{console.error(e);process.exit(1)});
