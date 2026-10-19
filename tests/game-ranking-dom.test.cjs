const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require(process.env.ERIS_DOM_MODULE||'linkedom');
const {window}=parseHTML('<!doctype html><html data-eris-theme="light"><body><button id="origin">Sıralama</button></body></html>');
const cssDocument=parseHTML('<html><style>'+fs.readFileSync('frontend/game-ranking.css','utf8')+'</style></html>').document;assert(cssDocument.querySelector('style').sheet.cssRules.length>80);
const {document}=window,requests=[];let focus=document.querySelector('#origin'),observing=0;
Object.defineProperty(document,'activeElement',{get:()=>focus});
Object.defineProperty(document,'currentScript',{value:{src:'https://eris.test/game-ranking.js'}});
window.HTMLElement.prototype.focus=function(){focus=this;};
window.HTMLElement.prototype.showModal=function(){this.open=true;this.setAttribute('open','');};
window.HTMLElement.prototype.close=function(){this.open=false;this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};
const NativeObserver=window.MutationObserver;
class Observer{constructor(cb){this.value=new NativeObserver(cb);}observe(...args){observing++;this.value.observe(...args);}disconnect(){observing--;this.value.disconnect();}}
window.ErisPlatform={api:path=>new Promise((resolve,reject)=>requests.push({path,resolve,reject}))};
let profile=null;window.openUserProfile=id=>{profile=id;};
const context={window,document,URL,location:{href:'https://eris.test/'},MutationObserver:Observer,console};
vm.runInNewContext(fs.readFileSync('frontend/game-ranking.js','utf8'),context);
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)],tick=()=>new Promise(setImmediate);
const click=s=>{assert(q(s),s);q(s).onclick();};
const reply=(request,nickname='Kazanan',n=1)=>request.resolve({my_winnings:12345,items:Array.from({length:n},(_,i)=>({rank:i+1,nickname,user_id:'u'+i,winnings:50000-i,avatar:'♛',avatar_asset:'javascript:bad()',frame_asset:'https://eris.test/frame.png'}))});
(async()=>{
 window.LidyaGameRanking.open('unknown');assert.equal(all('[data-rank-game]').length,20);assert.equal(requests.length,0);assert.equal(observing,1);
 const games=all('[data-rank-game]').map(b=>b.dataset.rankGame);
 const manifest=JSON.parse(fs.readFileSync('frontend/assets/lidya-ranking-v2/manifest.json'));assert.equal(manifest.items.length,40);
 const crypto=require('node:crypto');for(const game of games)for(const theme of ['light','dark']){const entry=manifest.items.find(e=>e.game===game&&e.theme===theme);assert(entry);const bytes=fs.readFileSync(entry.path);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),bytes.readUInt32BE(20)*2);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
 assert.equal(q('[data-rank-game="wheel"]').getAttribute('aria-pressed'),'true');
 for(const game of games){
  click('[data-rank-game="'+game+'"]');const request=requests.at(-1);assert.equal(request.path,'/games/'+game+'/leaderboard?period=hour');
  reply(request);await tick();assert.equal(all('.lgr-row').length,1);assert.equal(q('[data-mine]').textContent,'12.345');assert.equal(q('.lgr-avatar'),null);assert(q('.lgr-frame'));
  click('[data-back]');assert.equal(q('.lgr-menu').hidden,false);
 }
 q('[data-search]').value='ŞEKER';q('[data-search]').oninput();assert.deepEqual(all('[data-rank-game]').filter(b=>!b.hidden).map(b=>b.dataset.rankGame),['seker']);
 q('[data-search]').value='kure';q('[data-search]').oninput();assert.deepEqual(all('[data-rank-game]').filter(b=>!b.hidden).map(b=>b.dataset.rankGame),['kure']);
 q('[data-search]').value='';q('[data-search]').oninput();click('[data-category="classic"]');assert.equal(all('[data-rank-game]').filter(b=>!b.hidden).length,7);
 click('[data-category="slots"]');assert.equal(all('[data-rank-game]').filter(b=>!b.hidden).length,13);click('[data-category="all"]');
 click('[data-rank-game="dede"]');const old=requests.at(-1);click('[data-period="day"]');const newer=requests.at(-1);
 reply(newer,'Gün lideri',55);await tick();reply(old,'Eski saat lideri');await tick();assert.equal(all('.lgr-row').length,50);assert.equal(q('.lgr-name').textContent,'Gün lideri');assert.equal(q('.lgr-list').getAttribute('aria-busy'),'false');
 document.documentElement.dataset.erisTheme='dark';window.dispatchEvent(new window.Event('erischat:theme'));await tick();
 assert(all('img[data-game-art]').every(i=>i.src.includes('/dark/')));assert(all('img[data-coin]').every(i=>i.src.includes('/dark/')));
 click('[data-period="week"]');requests.at(-1).reject(Error('Bağlantı testi'));await tick();assert(q('.lgr-empty button'));click('.lgr-empty button');reply(requests.at(-1),'<img src=x onerror=bad()>');await tick();assert.equal(q('.lgr-name').textContent,'<img src=x onerror=bad()>');assert.equal(q('.lgr-name img'),null);
 click('.lgr-name');assert.equal(profile,'u0');assert.equal(q('.lgr-dialog'),null);assert.equal(observing,0);assert.equal(focus.id,'origin');
 window.LidyaGameRanking.open();click('[data-rank-game="ares"]');const late=requests.at(-1);click('[data-close]');reply(late);await tick();assert.equal(q('.lgr-dialog'),null);assert.equal(observing,0);
 window.LidyaGameRanking.open();window.LidyaGameRanking.open('bastet');assert.equal(all('.lgr-dialog').length,1);assert.equal(observing,1);
 click('[data-rank-game="bastet"]');requests.at(-1).resolve({my_winnings:0,items:[]});await tick();assert(q('.lgr-empty').textContent.includes('henüz kazanan yok'));
 let cancel=new window.Event('cancel',{cancelable:true});q('.lgr-dialog').dispatchEvent(cancel);assert.equal(q('.lgr-menu').hidden,false);assert(q('.lgr-dialog'));
 q('.lgr-dialog').dispatchEvent(new window.Event('cancel',{cancelable:true}));assert.equal(q('.lgr-dialog'),null);assert.equal(observing,0);
 console.log('PASS: 20 endpoints; 7/13 categories; Turkish search; stale/late requests; 50 rows; theme sync; retry/empty; safe names; profiles; Escape/back; focus and observer cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
