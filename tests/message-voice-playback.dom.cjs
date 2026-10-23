const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const wait=(ms=25)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dom=new JSDOM('<html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document,errors=[],audios=[],revoked=[],requests=[],polls=[];let nextBlob=0,failFetch=false,holdFetch=false,fetchResolve,failPlay=false,holdPlay=false,playResolve,rows=[];
 const conversations=['dm','other'].map(id=>({id,type:'dm',members:[{user_id:'peer',nickname:'Kişi'}]}));
 const msg=id=>({id,conversation_id:'dm',sender_id:'peer',text:'[Sesli mesaj]',media_type:'voice',media_url:'/messages/dm/'+id+'/media',created_at:new Date().toISOString()});rows=[msg(1),msg(2)];
 w.localStorage.setItem('token','fixture');w.toast=()=>{};w.ErisApiTransport={poll:(fn,ms)=>polls.push({fn,ms})};w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
 w.URL.createObjectURL=()=>`blob:voice-${++nextBlob}`;w.URL.revokeObjectURL=url=>revoked.push(url);
 w.fetch=async(url,options)=>{requests.push({url,options});if(failFetch)throw new Error('Ağ hatası');if(holdFetch)await new Promise(r=>fetchResolve=r);return {ok:true,blob:async()=>new w.Blob(['voice']),headers:{get:()=>null}}};
 class FakeAudio{
  constructor(src){this.src=src;this.currentTime=0;this.duration=60;this.paused=true;audios.push(this)}
  async play(){if(failPlay)throw new Error('Oynatma reddedildi');if(holdPlay)await new Promise(r=>playResolve=r);this.paused=false;this.onplay?.()}
  pause(){this.paused=true;this.onpause?.()}
  removeAttribute(name){if(name==='src')this.src=''}load(){this.loaded=true}
 }
 w.Audio=FakeAudio;
 w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),getAccessToken:()=> 'token',messageMediaUrl:path=>path,messageMediaHeaders:()=>({Authorization:'Bearer token','X-Eris-Dm-Vault':'vault-fixture'}),messages:async()=>rows,messageHistory:async()=>({messages:structuredClone(rows),has_more:false}),api:async path=>path.startsWith('/conversations?')?conversations:{}};
 w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await wait();await w.ErisChatDM.load();await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();
 const player=id=>d.querySelector(`[data-message-id="${id}"] .dm-voice-player`),toggle=id=>player(id).querySelector('.dm-voice-toggle'),speed=id=>player(id).querySelector('.dm-voice-speed'),progress=id=>player(id).querySelector('.dm-voice-progress');
 assert(progress(1).disabled);assert(player(1).querySelector('[data-voice-seek]').disabled);
 speed(1).click();assert.equal(speed(1).textContent,'1,5×');toggle(1).click();toggle(1).click();await wait();assert.equal(requests.length,1);assert.equal(audios.length,1);assert.equal(audios[0].playbackRate,1.5);assert.equal(audios[0].preservesPitch,true);assert.equal(toggle(1).getAttribute('aria-label'),'Sesli mesajı duraklat');assert(!progress(1).disabled);assert.equal(requests[0].options.headers.Authorization,'Bearer token');
 speed(1).click();assert.equal(audios[0].playbackRate,2);speed(1).click();assert.equal(audios[0].playbackRate,1);
 audios[0].currentTime=5;player(1).querySelector('[data-voice-seek="-10"]').click();assert.equal(audios[0].currentTime,0);audios[0].currentTime=55;player(1).querySelector('[data-voice-seek="10"]').click();assert.equal(audios[0].currentTime,60);
 progress(1).value='500';progress(1).dispatchEvent(new w.Event('input'));assert.equal(audios[0].currentTime,30);assert.equal(progress(1).getAttribute('aria-valuetext'),'0:30 / 1:00');
 toggle(1).click();assert(audios[0].paused);assert.equal(toggle(1).getAttribute('aria-label'),'Sesli mesajı oynat');toggle(1).click();await wait();assert(!audios[0].paused);assert.equal(requests.length,1);assert.equal(audios[0].currentTime,30);
 toggle(2).click();await wait();assert(audios[0].paused);assert(!audios[1].paused);assert.equal(toggle(1).getAttribute('aria-pressed'),'false');
 audios[1].currentTime=60;audios[1].paused=true;audios[1].onended();assert.equal(audios[1].currentTime,0);assert.equal(toggle(2).getAttribute('aria-pressed'),'false');
 // Unknown/streaming duration cannot produce infinite positions or invalid seeks.
 audios[1].duration=Infinity;audios[1].ondurationchange();assert(progress(2).disabled);assert.equal(progress(2).value,'0');audios[1].duration=60;audios[1].ondurationchange();assert(!progress(2).disabled);
 // play() refusal is visible and recoverable, including resuming an already loaded message.
 failPlay=true;toggle(2).click();await wait();assert(player(2).querySelector('.dm-voice-status').textContent.includes('Oynatma reddedildi'));assert.equal(toggle(2).getAttribute('aria-pressed'),'false');assert(!toggle(2).disabled);failPlay=false;toggle(2).click();await wait();assert(!audios[1].paused);assert.equal(player(2).querySelector('.dm-voice-status').textContent,'');
 // Decoder/network media errors release the old URL and retry downloads afresh.
 const brokenUrl=audios[1].src;audios[1].onerror();assert(revoked.includes(brokenUrl));assert.equal(audios[1].src,'');assert(player(2).querySelector('.dm-voice-status').textContent.includes('Yeniden deneyin'));failFetch=true;toggle(2).click();await wait();assert(player(2).querySelector('.dm-voice-status').textContent.includes('Ağ hatası'));failFetch=false;toggle(2).click();await wait();assert.equal(audios.length,3);assert(!audios[2].paused);
 // Server metadata refresh keeps the playing audio node and playhead.
 audios[2].currentTime=19;await polls.find(p=>p.ms===8000).fn();await wait();assert.equal(player(2)._audio,audios[2]);assert.equal(audios[2].currentTime,19);
 // Deleting a message stops playback and clears its URL.
 const deletedUrl=audios[2].src;w.dispatchEvent(new w.CustomEvent('erischat:event',{detail:{type:'dm_messages_deleted',conversation_id:'dm',message_ids:[2]}}));await wait();assert(audios[2].paused);assert(revoked.includes(deletedUrl));
 // A slow request loses to the newest click and cannot begin playback later.
 rows=[msg(3),msg(4)];await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();holdFetch=true;toggle(3).click();await wait();holdFetch=false;toggle(4).click();await wait();const playing=audios.at(-1),count=audios.length;assert(!playing.paused);fetchResolve();await wait();assert.equal(audios.length,count);assert(!playing.paused);assert(!toggle(3).disabled);
 // Leaving while a download is pending never creates an orphan audio/URL.
 rows=[msg(5)];await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();holdFetch=true;toggle(5).click();await wait();const before=audios.length;rows=[];await w.ErisChatDM.open('other','Diğer','D','peer');fetchResolve();await wait();assert.equal(audios.length,before);holdFetch=false;
 // A play promise that resolves after navigation is paused and fully released.
 rows=[msg(6)];await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();holdPlay=true;toggle(6).click();await wait();const pending=audios.at(-1),pendingUrl=pending.src;rows=[];await w.ErisChatDM.open('other','Diğer','D','peer');playResolve();await wait();assert(pending.paused);assert.equal(pending.src,'');assert(revoked.includes(pendingUrl));
 // Chat close and logout stop loaded audio as well as invalidating pending downloads.
 holdPlay=false;rows=[msg(7)];await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();toggle(7).click();await wait();const closed=audios.at(-1);d.querySelector('.chatHead>.close').click();assert(closed.paused);assert.equal(closed.src,'');
 rows=[msg(8)];await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();toggle(8).click();await wait();const loggedOut=audios.at(-1);w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));assert(loggedOut.paused);assert.equal(loggedOut.src,'');
 // Switching away and immediately back supersedes the old unresolved play promise.
 w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'ready',user:{id:'me'}}}));await wait();rows=[msg(9),msg(10)];await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();holdPlay=true;toggle(9).click();await wait();const oldPending=audios.at(-1),resolveOld=playResolve;holdPlay=false;toggle(10).click();await wait();toggle(9).click();await wait();const newest=audios.at(-1);assert.notEqual(newest,oldPending);assert(!newest.paused);resolveOld();await wait();assert(oldPending.paused);assert(!newest.paused);
 w.dispatchEvent(new w.CustomEvent('erischat:auth',{detail:{state:'ready',user:{id:'another-user'}}}));assert(newest.paused);assert.equal(newest.src,'');
 const html=fs.readFileSync('frontend/erischat-main.html','utf8');assert(/dm-live\.js\?v=[^"\s]+/.test(html));
 assert.deepEqual(errors,[]);dom.window.close();console.log('PASS: voice rates, seeking, bounds/unknown duration, pause/resume, single playback, accessible state, authorized download, playback/fetch/decoder retries, metadata preservation, deletion cleanup and stale fetch/play protection');
})().catch(e=>{console.error(e);process.exit(1)});
