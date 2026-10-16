// State/event tests use a minimal DOM adapter, not visual browser rendering.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
function client(uid,getShared){
 const listeners={},timers=[],calls=[];let root=null;
 const host={classList:{add(){},remove(){},contains(){return false}},append(n){root=n},querySelector(s){return s==='.uno-root'?root:null},querySelectorAll(){return []}};
 const document={hidden:false,getElementById:id=>id==='erisRoomSurface'?host:null,createElement:()=>({dataset:{},setAttribute(){},innerHTML:'',querySelector(){return null},querySelectorAll(){return []},remove(){root=null}})};
 const window={ErisCurrentRoomId:'r1',ErisPlatform:{api:async(_p,opts)=>{
  const shared=getShared();
  if(opts){const body=JSON.parse(opts.body);calls.push(body);
   if(body.action==='create')shared.state={round_id:'r'+calls.length,status:'lobby',version:1,host:uid,mode:body.mode,victory:body.victory,stake:body.stake,pool:0,players:[],scores:{}};
   if(body.action==='configure'){Object.assign(shared.state,{mode:body.mode,victory:body.victory,stake:body.stake});shared.state.version++;}
  }
  const reply=JSON.parse(JSON.stringify(shared));reply.my_id=uid;reply.can_manage=uid==='u1';
  if(reply.state)for(const p of reply.state.players)if(p.user_id!==uid)delete p.hand;
  return reply;
 }},addEventListener:(n,cb)=>(listeners[n]??=[]).push(cb),dispatchEvent:e=>(listeners[e.type]||[]).forEach(cb=>cb(e))};
 const context={window,document,crypto:{randomUUID:()=>`req-1234567890-${calls.length}`},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}},setInterval:cb=>timers.push(cb),Date,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../room-uno.js'),'utf8'),context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {window,calls,html:()=>root?.innerHTML,exists:()=>!!root,
  click:async dataset=>{root.onclick({target:{closest:()=>({dataset,disabled:false})}});await settle();},
  change:async(key,value)=>{root.onchange({target:{dataset:{unoOption:key},value}});await settle();},
  poll:async()=>{timers[0]();await settle();},
  event:async(type,detail)=>{window.dispatchEvent(new context.CustomEvent(type,{detail}));await settle();},
  removeSurface:()=>{root=null}
 };
}
(async()=>{
 const shared={state:null,balance:1000,stakes:[50,100,150,200,250,300],seats:[1,2,3,4].map(n=>({seat:n,user_id:'u'+n,name:'P'+n})),blocked_by:null,server_time:Date.now()/1000};
 const owner=client('u1',()=>shared),watcher=client('watcher',()=>shared);
 await owner.window.ErisUno.open();assert.equal(owner.calls[0].action,'create');assert.equal(owner.calls[0].stake,50);
 await watcher.event('erischat:room-opened',{room:{id:'r1'}});assert.match(watcher.html(),/MASA|oyuncu hazır/i);assert.equal(watcher.calls.length,0);
 await owner.change('mode','paired');await owner.change('victory','points');await owner.click({unoStake:'100'});
 assert.equal(owner.calls.at(-1).action,'configure');assert.equal(owner.calls.at(-1).stake,100);assert.equal(shared.state.mode,'paired');assert.equal(shared.state.victory,'points');
 await watcher.poll();assert.match(watcher.html(),/100/);assert.ok(!watcher.html().includes('data-uno-action="hide"'));
 await owner.click({unoAction:'ready'});assert.equal(owner.calls.at(-1).stake,100);
 shared.state={round_id:'r1',status:'playing',version:9,host:'u1',mode:'paired',victory:'points',stake:100,pool:400,players:[1,2,3,4].map(n=>({seat:n,user_id:'u'+n,name:'P'+n,team:n%2?1:2,card_count:2,...(n===1?{hand:[1,104]}:{})})),turn:1,phase:'play',legal:[1,104],stock_count:80,top_card:9,active_color:'red',direction:1,scores:{},uno_vulnerable:null,deadline:Date.now()/1000+20};
 await owner.poll();await watcher.poll();assert.ok(watcher.html().includes('İzleyici'));assert.ok(!watcher.html().includes('data-uno-card'));
 await owner.click({unoAction:'uno'});await owner.click({unoCard:'104'});assert.match(owner.html(),/Renk seç/);await owner.click({unoColor:'blue'});
 assert.equal(owner.calls.at(-1).card,104);assert.equal(owner.calls.at(-1).color,'blue');assert.equal(owner.calls.at(-1).call_uno,true);
 const before=owner.html();await owner.poll();assert.equal(owner.html(),before);
 shared.balance=875;await owner.poll();assert.match(owner.html(),/875/);
 shared.state.players[0].hand=[1,2,3,4,5,6,7,8,9,10,11,12,13,14];shared.state.players[0].card_count=14;shared.state.version++;
 await owner.poll();assert.equal((owner.html().match(/data-uno-card=/g)||[]).length,7);await owner.click({unoAction:'hand-next'});assert.ok(owner.html().includes('data-uno-card="14"'));assert.ok(!owner.html().includes('data-uno-card="1"'));
 watcher.removeSurface();await watcher.poll();assert.ok(watcher.exists());
 const late=client('u4',()=>shared);await late.event('erischat:room-opened',{room:{id:'r1'}});assert.ok(late.exists());assert.equal(late.calls.length,0);
 shared.state.status='finished';shared.state.version++;shared.state.winners=[1,3];shared.state.hand_winners=[1,3];shared.state.hand_points=60;shared.state.payouts={'1':200,'3':200};
 await owner.poll();assert.match(owner.html(),/OYUN TAMAMLANDI/);assert.match(owner.html(),/200 Lidya/);
 await owner.click({unoAction:'new-menu'});assert.equal(owner.calls.at(-1).action,'create');assert.equal(shared.state.status,'lobby');
 await watcher.poll();assert.match(watcher.html(),/oyuncu hazır/);
 await owner.event('erischat:room-closed');assert.equal(owner.exists(),false);assert.equal(owner.window.ErisUnoActive,false);
 console.log('UNO v2 frontend state tests passed: shared opening, spectators, late join, bet settings/consent, private cards, UNO/joker, hand paging, remount, balances, payouts, cleanup.');
})().catch(e=>{console.error(e);process.exit(1)});
