const fs=require('fs'),vm=require('vm'),assert=require('assert');const source=fs.readFileSync(process.env.WAKE_SCRIPT||'security/patched/frontend/screen-awake.js','utf8');
function setup({delay=false,native=false,deny=false}={}){
 const doc=new EventTarget(),win=new EventTarget(),stored=new Map();doc.visibilityState='visible';let requests=0,releases=0,resolve,nativeValues=[];
 class Custom extends Event{constructor(t,o){super(t);this.detail=o?.detail}}
 function lock(){const l=new EventTarget();l.released=false;l.release=async()=>{l.released=true;releases++;l.dispatchEvent(new Event('release'))};return l}
 const navigator={wakeLock:{request:async type=>{assert.equal(type,'screen');requests++;if(deny)throw Error('denied');if(delay)return new Promise(r=>resolve=()=>r(lock()));return lock()}}};
 if(native)win.ErisChatAndroid={setKeepScreenAwake:v=>nativeValues.push(v)};
 const context={window:win,document:doc,navigator,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},CustomEvent:Custom,Date,queueMicrotask,
  // Browser timers exist in production. The isolated VM test drives state
  // transitions explicitly; delayed retry callbacks must not fire during it.
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{}
 };vm.runInNewContext(source,context);
 return{doc,win,stored,get requests(){return requests},get releases(){return releases},nativeValues,resolve:()=>resolve(),tick:()=>new Promise(r=>setTimeout(r,0))}
}
(async()=>{const s=setup({native:true});await s.tick();assert.equal(s.requests,1);assert(s.win.LidyaScreenAwake.state().active);s.doc.visibilityState='hidden';s.doc.dispatchEvent(new Event('visibilitychange'));await s.tick();assert.equal(s.releases,1);assert(!s.win.LidyaScreenAwake.state().active);s.doc.visibilityState='visible';s.doc.dispatchEvent(new Event('visibilitychange'));await s.tick();assert.equal(s.requests,2);await s.win.LidyaScreenAwake.setEnabled(false);assert.equal(s.stored.get('lidyachat.screenAwake.v1'),'off');assert.equal(s.nativeValues.at(-1),false);assert.equal(s.releases,2);await s.win.LidyaScreenAwake.setEnabled(true);assert.equal(s.requests,3);s.win.dispatchEvent(new Event('pagehide'));await s.tick();assert.equal(s.releases,3);
const race=setup({delay:true});race.doc.visibilityState='hidden';race.doc.dispatchEvent(new Event('visibilitychange'));race.resolve();await race.tick();assert.equal(race.releases,1);assert(!race.win.LidyaScreenAwake.state().active);const fail=setup({deny:true});await fail.tick();assert(!fail.win.LidyaScreenAwake.state().active);assert.equal(fail.requests,1);console.log('PASS wake control: visible acquire, hidden release, return reacquire, persisted opt-out, native preference sync, pagehide, pending-request race and OS denial without retry loop')})().catch(e=>{console.error(e);process.exit(1)});
