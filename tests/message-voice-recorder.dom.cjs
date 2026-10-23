const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const wait=(ms=25)=>new Promise(r=>setTimeout(r,ms));
async function setup(){
 const dom=new JSDOM('<html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test',runScripts:'outside-only'});
 const w=dom.window,d=w.document,errors=[],toasts=[],uploads=[],recorders=[],tracks=[],revoked=[],polls=[],timers=new Map();let timerId=0,clock=0,url=0;
 const control={permission:null,upload:null,denied:false,failUpload:false,empty:false,startFails:false,constructorFails:false,blocked:false,limited:false,mediaType:'audio/webm'};
 w.localStorage.setItem('token','fixture');w.toast=x=>toasts.push(x);w.ErisApiTransport={poll:(fn,ms)=>polls.push({fn,ms})};w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
 w.URL.createObjectURL=()=>`blob:voice-${++url}`;w.URL.revokeObjectURL=u=>revoked.push(u);w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 Object.defineProperty(w.performance,'now',{value:()=>clock});w.setInterval=fn=>{timers.set(++timerId,fn);return timerId};w.clearInterval=id=>timers.delete(id);
 const tick=ms=>{clock+=ms;for(const fn of [...timers.values()])fn()};
 function stream(){const track={stops:0,stop(){this.stops++}};tracks.push(track);return {getTracks:()=>[track]}}
 Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{if(control.denied)throw Object.assign(new Error('Permission'),{name:'NotAllowedError'});if(control.permission)return control.permission;return stream()}}});
 class Recorder{
  static isTypeSupported(type){return type.split(';')[0]===control.mediaType}
  constructor(stream,opts={}){if(control.constructorFails)throw new Error('Constructor');this.stream=stream;this.state='inactive';this.mimeType=opts.mimeType||control.mediaType;recorders.push(this)}
  start(){if(control.startFails)throw new Error('Start');this.state='recording'}
  pause(){assert.equal(this.state,'recording');this.state='paused'}
  resume(){assert.equal(this.state,'paused');this.state='recording'}
  stop(){this.state='inactive';if(!control.empty)this.ondataavailable?.({data:new w.Blob(['voice-bytes'],{type:this.mimeType})});this.onstop?.()}
 }
 w.MediaRecorder=Recorder;
 const convs=[{id:'dm',type:'dm',members:[{user_id:'peer',nickname:'Kişi'}]},{id:'other',type:'dm',members:[{user_id:'second',nickname:'Diğer'}]},{id:'grp_demo',type:'group',name:'Grup',members:[]}];
 w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),getAccessToken:()=>'',messages:async()=>[],messageHistory:async()=>({messages:[],has_more:false}),api:async path=>{
  if(path.startsWith('/conversations?'))return convs;
  if(path==='/message-groups/grp_demo')return {name:'Grup',my_role:'member',closed:false,admins_only:control.blocked};
  if(path==='/message-groups/grp_demo/members')return [{user_id:'me'}];return {};
 },sendMessageMedia:async(id,file,type,seconds)=>{uploads.push({id,file,type,seconds});if(control.failUpload)throw new Error('Bağlantı kesildi');if(control.upload)return control.upload;return {id:50,conversation_id:id,sender_id:'me',text:'[Sesli mesaj]',created_at:new Date().toISOString(),media_type:'voice'}}};
 w.eval(fs.readFileSync('frontend/dm-voice-recorder.js','utf8'));w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await wait();await w.ErisChatDM.load();await w.ErisChatDM.open('dm','Kişi','K','peer');await wait();
 const button=name=>d.querySelector('[data-voice-'+name+']'),panel=()=>d.querySelector('[data-voice-composer]');
 return {dom,w,d,errors,toasts,uploads,recorders,tracks,revoked,polls,timers,control,stream,tick,button,panel,start:async()=>{d.querySelector('[data-dm-voice]').click();await wait()},stop:async()=>{button('stop').click();await wait()},finish(){assert.deepEqual(errors,[]);dom.window.close()}};
}
(async()=>{
 let t=await setup();t.d.querySelector('#chatInput').value='Taslağım';await t.start();assert.equal(t.panel().dataset.state,'recording');assert.equal(t.recorders.length,1);assert.equal(t.uploads.length,0);t.d.querySelector('[data-dm-voice]').click();await wait();assert.equal(t.recorders.length,1);
 t.tick(1200);assert(t.button('time').textContent.startsWith('00:01'));t.button('pause').click();assert.equal(t.panel().dataset.state,'paused');t.tick(50000);assert(t.button('time').textContent.startsWith('00:01'));t.button('pause').click();t.tick(1000);await t.stop();assert.equal(t.panel().dataset.state,'preview');assert(t.d.querySelector('audio[controls]'));assert.equal(t.uploads.length,0);assert(t.tracks[0].stops>0);assert.equal(t.timers.size,0);assert.equal(t.d.querySelector('#chatInput').value,'Taslağım');t.button('send').click();await wait();assert.equal(t.uploads.length,1);assert.equal(t.uploads[0].id,'dm');assert.equal(t.uploads[0].type,'voice');assert.equal(t.uploads[0].seconds,0);assert.equal(t.uploads[0].file.type,'audio/webm');assert.equal(t.panel(),null);assert.equal(t.revoked.length,1);assert.equal(t.d.querySelector('#chatInput').value,'Taslağım');t.finish();
 console.log('PASS: explicit preview/send, timer excluding pause, resume, no automatic send, one recorder, text draft, microphone and URL cleanup');
 t=await setup();await t.start();await t.stop();t.control.failUpload=true;const file=t.d.querySelector('audio').src;t.button('send').click();await wait();assert.equal(t.panel().dataset.state,'preview');assert(t.button('status').textContent.includes('Bağlantı kesildi'));assert(!t.button('send').disabled);assert.equal(t.d.querySelector('audio').src,file);t.control.failUpload=false;let resolveUpload;t.control.upload=new Promise(r=>resolveUpload=r);t.button('send').click();t.button('send').click();await wait();assert.equal(t.uploads.length,2);assert(t.button('send').disabled);resolveUpload({id:51,conversation_id:'dm',sender_id:'me',text:'[Sesli mesaj]'});await wait();assert.equal(t.panel(),null);assert.equal(t.uploads[0].file,t.uploads[1].file);t.finish();
 console.log('PASS: failed upload retains recording, retry uses same file, pending send cannot be duplicated');
 t=await setup();await t.start();t.button('delete').click();assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);assert.equal(t.uploads.length,0);await t.start();await t.stop();t.button('delete').click();assert.equal(t.revoked.length,1);assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: discard during recording and preview');
 t=await setup();await t.start();await t.w.ErisChatDM.open('other','Diğer','D','second');await wait();assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);assert.equal(t.uploads.length,0);assert.equal(t.timers.size,0);t.finish();
 console.log('PASS: conversation switch cancels recording and never uploads to new conversation');
 t=await setup();let resolvePermission;t.control.permission=new Promise(r=>resolvePermission=r);await t.start();assert.equal(t.panel().dataset.state,'permission');await t.w.ErisChatDM.open('other','Diğer','D','second');const lateStream=t.stream();resolvePermission(lateStream);await wait();assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);assert.equal(t.recorders.length,0);assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: late microphone permission result stops tracks after chat change');
 t=await setup();await t.start();t.tick(120001);await wait();assert.equal(t.panel().dataset.state,'preview');assert(t.button('status').textContent.includes('2 dakikalık'));assert(t.tracks[0].stops>0);assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: recorder limit stops at two minutes and still requires send');
 t=await setup();await t.start();Object.defineProperty(t.d,'visibilityState',{configurable:true,value:'hidden'});t.d.dispatchEvent(new t.w.Event('visibilitychange'));assert.equal(t.panel().dataset.state,'paused');Object.defineProperty(t.d,'visibilityState',{configurable:true,value:'visible'});t.d.dispatchEvent(new t.w.Event('visibilitychange'));assert.equal(t.panel().dataset.state,'paused');t.button('pause').click();assert.equal(t.panel().dataset.state,'recording');t.w.dispatchEvent(new t.w.Event('pagehide'));assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);t.finish();
 console.log('PASS: background pauses, foreground requires explicit resume, page exit cancels');
 t=await setup();t.control.denied=true;await t.start();assert.equal(t.panel(),null);assert(t.toasts.some(x=>x.includes('mikrofon izni')));t.control.denied=false;t.control.startFails=true;await t.start();assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);assert.equal(t.uploads.length,0);t.control.startFails=false;await t.start();t.recorders.at(-1).onerror();assert.equal(t.panel(),null);assert(t.tracks.at(-1).stops>0);t.finish();
 console.log('PASS: permission denial, constructor/start failure and recorder error leave no microphone or timer');
 t=await setup();await t.start();t.control.empty=true;await t.stop();assert.equal(t.panel(),null);assert(t.toasts.some(x=>x.includes('boş')));assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: empty recording is rejected');
 t=await setup();t.control.mediaType='audio/mp4';await t.start();await t.stop();t.button('send').click();await wait();assert.equal(t.uploads[0].file.type,'audio/mp4');assert(t.uploads[0].file.name.endsWith('.m4a'));t.finish();
 console.log('PASS: supported MP4 audio produces matching filename and MIME');
 t=await setup();await t.start();const chunk=new t.w.Blob(['x']);Object.defineProperty(chunk,'size',{value:12*1024*1024+1});t.recorders[0].ondataavailable({data:chunk});assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: memory/file size limit discards oversized recording');
 t=await setup();await t.w.ErisChatDM.open('grp_demo','Grup','👥',null);await wait();await t.start();assert(t.panel());t.control.blocked=true;await t.polls.find(x=>x.ms===8000).fn();await wait();assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: group write restriction ends recording and prevents send');
 t=await setup();await t.start();t.d.querySelector('.chatHead>.close').click();assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);await t.start();await t.stop();t.w.dispatchEvent(new t.w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));assert.equal(t.panel(),null);assert.equal(t.revoked.length,1);assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: chat close and logout discard draft and release resources');
 t=await setup();await t.start();await t.stop();let release;t.control.upload=new Promise(r=>release=r);t.button('send').click();await wait();await t.w.ErisChatDM.open('other','Diğer','D','second');release({id:99,conversation_id:'dm',sender_id:'me',text:'Eski ses'});await wait();assert.equal(t.uploads[0].id,'dm');assert.equal(t.d.querySelector('[data-message-id="99"]'),null);assert.equal(t.panel(),null);t.finish();
 console.log('PASS: already submitted voice remains bound to original conversation; late response cannot appear in new chat');
 t=await setup();t.control.constructorFails=true;await t.start();assert.equal(t.panel(),null);assert(t.tracks[0].stops>0);t.control.constructorFails=false;t.w.MediaRecorder.prototype.pause=undefined;t.w.MediaRecorder.prototype.resume=undefined;await t.start();assert(t.button('pause').hidden);Object.defineProperty(t.d,'visibilityState',{configurable:true,value:'hidden'});t.d.dispatchEvent(new t.w.Event('visibilitychange'));await wait();assert.equal(t.panel().dataset.state,'preview');assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: recorder construction error cleans tracks; background stops to preview when pause is unavailable');
 t=await setup();await t.start();await t.stop();t.w.dispatchEvent(new t.w.CustomEvent('erischat:auth',{detail:{state:'ready',user:{id:'different-user'}}}));await wait();assert.equal(t.panel(),null);assert.equal(t.revoked.length,1);assert.equal(t.uploads.length,0);t.finish();
 console.log('PASS: account switch discards voice draft without sending');
 t=await setup();let grant;t.control.permission=new Promise(r=>grant=r);await t.start();Object.defineProperty(t.d,'visibilityState',{configurable:true,value:'hidden'});t.d.dispatchEvent(new t.w.Event('visibilitychange'));assert.equal(t.panel(),null);grant(t.stream());await wait();assert(t.tracks[0].stops>0);assert.equal(t.recorders.length,0);t.finish();
 console.log('PASS: background during permission request cancels, late grant cannot start recording');
 const html=fs.readFileSync('frontend/erischat-main.html','utf8');assert(html.indexOf('./dm-voice-recorder.js?')<html.indexOf('./dm-live.js?'));assert(html.includes('./dm-voice-recorder.css?'));
 console.log('PASS: HTML loads recorder and stylesheet before message integration');
})().catch(e=>{console.error(e);process.exit(1)});
