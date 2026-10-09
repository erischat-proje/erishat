// State/event tests with a minimal DOM adapter; this is not visual browser QA.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const listeners={},timers=[];let root=null,view=null;
const host={classList:{add(){},remove(){},contains(){return false}},append(n){root=n},querySelector(s){return s==='.uno-root'?root:null},querySelectorAll(){return []}};
const document={hidden:false,getElementById:id=>id==='erisRoomSurface'?host:null,createElement:()=>({dataset:{},setAttribute(){},innerHTML:'',querySelector(){return null},querySelectorAll(){return []},remove(){root=null}})};
const calls=[];
const window={ErisCurrentRoomId:'r1',ErisPlatform:{api:async(_p,opts)=>{if(opts){const body=JSON.parse(opts.body);calls.push(body);if(body.action==='create')view.state={round_id:'r'+calls.length,status:'lobby',version:1,host:'u1',mode:body.mode,victory:body.victory,players:[],scores:{}};}return JSON.parse(JSON.stringify(view))}},addEventListener:(n,cb)=>(listeners[n]??=[]).push(cb),dispatchEvent:e=>(listeners[e.type]||[]).forEach(cb=>cb(e))};
const context={window,document,crypto:{randomUUID:()=>`req-1234567890-${calls.length}`},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}},setInterval:cb=>timers.push(cb),Date,console};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../room-uno.js'),'utf8'),context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const click=async dataset=>{root.onclick({target:{closest:()=>({dataset,disabled:false})}});await settle();};
const poll=async()=>{timers[0]();await settle();};
(async()=>{
 view={state:null,my_id:'u1',seats:[1,2,3,4].map(n=>({seat:n,user_id:'u'+n,name:'P'+n})),can_manage:true,blocked_by:null,server_time:Date.now()/1000};
 await window.ErisUno.open();assert.match(root.innerHTML,/Masayı kur/);
 root.onchange({target:{dataset:{unoOption:'mode'},value:'paired'}});root.onchange({target:{dataset:{unoOption:'victory'},value:'points'}});
 await click({unoAction:'create'});assert.equal(calls.at(-1).mode,'paired');assert.equal(calls.at(-1).victory,'points');
 view.state={round_id:'r1',status:'playing',version:5,host:'u1',mode:'paired',victory:'points',players:[1,2,3,4].map(n=>({seat:n,user_id:'u'+n,name:'P'+n,team:n%2?1:2,card_count:2,...(n===1?{hand:[1,104]}:{})})),turn:1,phase:'play',legal:[1,104],stock_count:80,top_card:9,active_color:'red',direction:1,scores:{},uno_vulnerable:null,deadline:Date.now()/1000+20};
 await poll();await click({unoAction:'uno'});await click({unoCard:'104'});assert.match(root.innerHTML,/Renk seç/);
 await click({unoColor:'blue'});assert.equal(calls.at(-1).action,'play');assert.equal(calls.at(-1).card,104);assert.equal(calls.at(-1).color,'blue');assert.equal(calls.at(-1).call_uno,true);
 const before=root.innerHTML;await poll();assert.equal(root.innerHTML,before);
 view.state.version++;view.state.status='finished';view.state.winners=[1,3];view.state.hand_winners=[1,3];view.state.hand_points=60;
 await poll();assert.match(root.innerHTML,/OYUN TAMAMLANDI/);await click({unoAction:'new-menu'});assert.match(root.innerHTML,/Masayı kur/);
 await click({unoAction:'create'});view.state.round_id='r-new';view.state.status='finished';view.state.version++;view.state.players=[{seat:1,user_id:'u1',name:'Winner',team:1,card_count:0}];view.state.winners=[1];view.state.hand_winners=[1];view.state.hand_points=30;
 await poll();assert.match(root.innerHTML,/OYUN TAMAMLANDI/);
 await click({unoAction:'hide'});assert.equal(root,null);await window.ErisUno.open();assert.ok(root);
 window.dispatchEvent(new context.CustomEvent('erischat:room-closed'));assert.equal(root,null);assert.equal(window.ErisUnoActive,false);
 console.log('UNO frontend state tests passed: create options, UNO + joker, stable polling, result reset, hide/reopen, room cleanup.');
})().catch(e=>{console.error(e);process.exit(1)});
