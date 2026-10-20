/* Real room, 101 renderer, full production CSS; transport is deterministic. */
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const frontend=path.resolve('frontend'),assets=path.resolve(process.env.ERIS_ASSET_ROOT||'frontend');
const html=fs.readFileSync(frontend+'/erischat-main.html','utf8');
const inline=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const links=[...html.matchAll(/<link[^>]+href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map(m=>`<link rel="stylesheet" href="${m[1]}">`).join('');
(async()=>{
 const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);if(name==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end('<!doctype html><html data-eris-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+inline+'</style>'+links+'</head><body></body></html>');}const relative=name.replace(/^\//,'');let file=path.resolve(frontend,relative);if(!file.startsWith(frontend+'/'))return res.writeHead(403).end();if(!fs.existsSync(file))file=path.resolve(assets,relative);if(!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'image/png');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.ERIS_CHROMIUM_EXECUTABLE,args:process.env.ERIS_SERVERLESS_CHROMIUM?['--no-sandbox','--no-zygote','--single-process','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],headless:true});
 const page=await browser.newPage({viewport:{width:393,height:820},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.evaluate(()=>{
  window.toast=()=>{};window.posts=[];window.failNext=false;window.holdPost=false;window.apiDelay=null;
  window.fixture={my_id:'u1',balance:5000,unlocked:true,can_manage:true,server_time:Date.now()/1000,seats:[1,2,3,4].map(n=>({seat:n,user_id:'u'+n,name:['Sen','Ayşe','Mehmet','Zeynep'][n-1]})),suggestions:[],pair_suggestions:[],lay_options:[],can_return_discard:false};
  fixture.state={round_id:'qa-101',version:1,status:'playing',mode:'solo',progressive:false,penalties:true,hand_number:1,hand_count:3,threshold:101,pair_threshold:5,host:'u1',pool:200,turn:1,phase:'discard',indicator:25,joker:[0,1],stock_count:20,deadline:Date.now()/1000+45,history:[],events:[],penalty_log:[],melds:[],discards:{1:[],2:[37],3:[60],4:[83]},players:fixture.seats.map(q=>({...q,stake:50,score:0,opened:null,hand_count:q.seat===1?22:21,...(q.seat===1?{hand:[0,1,2,3,4,5,26,27,28,29,30,52,53,54,55,56,78,79,80,81,104,105]}:{})}))};
  window.room={id:'qa-room',public_id:'123456789012',name:'Lidya 101 Masası',level:4,current_user_id:'u1',current_user_seat:1,is_owner:true,seat_count:12,seats:Array.from({length:12},(_,i)=>({seat_number:i+1,...(i<4?{user_id:'u'+(i+1),nickname:['Sen','Ayşe','Mehmet','Zeynep'][i]}:{})}))};
  window.ErisRoom={join:async()=>{},get:async()=>room,leave:async()=>{},leaveSeat:async()=>{}};
  window.ErisPlatform={getAccessToken:()=> 'qa-token',getRealtimeUrl:()=> 'ws://fixture',api:async(p,opts)=>{
   if(p.endsWith('/chat-history?before=1&limit=100'))return {messages:[{id:-1,nickname:'Önceki',text:'Geçmiş mesaj'}],has_more:false};
   if(!p.endsWith('/okey101'))return p.includes('blocks')?[]:{};
   if(opts){const body=JSON.parse(opts.body);posts.push(body);if(holdPost)await new Promise(r=>apiDelay=r);if(failNext){failNext=false;throw new Error('Bağlantı kesildi');}if(body.action==='create'||body.action==='restart'){fixture.state.round_id='qa-lobby';Object.assign(fixture.state,body,{status:'lobby',players:[]});}if(body.action==='ready'){fixture.state.players=[{seat:1,user_id:'u1',name:'Sen',stake:body.stake,score:0}];}if(body.action==='configure')Object.assign(fixture.state,body);if(body.action==='discard'){fixture.state.players[0].hand=fixture.state.players[0].hand.filter(t=>t!==body.tile);fixture.state.players[0].hand_count--;fixture.state.discards['1'].push(body.tile);fixture.state.phase='draw';fixture.state.turn=2;}if(body.action==='draw'){fixture.state.players[0].hand.push(body.source==='discard'?fixture.state.discards['4'].pop():32);fixture.state.players[0].hand_count++;fixture.state.stock_count--;fixture.state.phase='discard';}fixture.state.version++;}
   fixture.server_time=Date.now()/1000;return structuredClone(fixture);
  }};
  class Socket{constructor(){this.readyState=1;queueMicrotask(()=>this.onopen?.());}send(data){const d=JSON.parse(data);if(d.type==='room_chat')this.message({type:'room_chat',id:9000,nickname:'Sen',text:d.text});}close(){this.readyState=3;}message(d){this.onmessage?.({data:JSON.stringify(d)});}}window.WebSocket=Socket;Socket.OPEN=1;
 });
 for(const script of ['device-layout.js','room-live.js','room-reference-ui.js','room-screen-fit.js','room-modern-audio.js','room-okey101.js'])await page.addScriptTag({url:origin+'/'+script});
 await page.evaluate(()=>openRoom('qa-room','Lidya 101'));await page.waitForSelector('.o101-root[data-phase="playing"]');
 // Exercise all compose accessories, exactly as the room audio/emoji/gift modules add them.
 await page.evaluate(()=>{const row=document.querySelector('.eris-room-compose');for(const [id,label] of [['erisRoomEmojiButton','☺'],['erisRoomMicInline','♩'],['erisRoomAudioOutput','♫'],['erisRoomGiftInline','◇']])if(!document.getElementById(id)){const b=document.createElement('button');b.id=id;b.textContent=label;row.append(b);}__erisRoomSocket.message({type:'room_history',messages:Array.from({length:12},(_,i)=>({id:i+1,user_id:'u2',nickname:'Ayşe',text:'Mesaj '+(i+1)+' · Güzel bir oyun olsun.\nHepinize iyi şanslar.'}))});});
page.setDefaultTimeout(10000);
const tile=n=>page.locator('.o101-rack [data-tile="'+n+'"]');
async function drag(from,to,cancel=false){
 const a=await from.boundingBox(),b=await to.boundingBox();
 const cdp=await page.context().newCDPSession(page);
 const ax=a.x+a.width/2,ay=a.y+a.height/2,bx=b.x+b.width/2,by=b.y+b.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ax,y:ay}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:ax+(bx-ax)*i/8,y:ay+(by-ay)*i/8}]});
 await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();await page.waitForTimeout(420);
}
assert.equal(await page.locator('[data-slot]').count(),30);
await drag(tile(0),page.locator('[data-slot="29"]'));
assert.equal(await page.locator('[data-slot="29"] [data-tile]').getAttribute('data-tile'),'0');
assert.equal(await page.locator('[data-slot="0"] [data-tile]').count(),0);
assert.equal(await page.evaluate(()=>posts.length),0);
await drag(tile(1),page.locator('[data-slot="28"]'),true);
assert.equal(await page.locator('[data-slot="28"] [data-tile]').count(),0);
await drag(tile(2),page.locator('[data-drop="discard"]'));
await page.waitForFunction(()=>posts.some(x=>x.action==='discard'));
assert.equal(await page.evaluate(()=>posts.filter(x=>x.action==='discard').length),1);
assert.equal(await page.evaluate(()=>posts.at(-1).tile),2);
// Sorting remains local and keeps every physical tile.
await page.locator('.o101-quick-tools [data-action="sort"]').tap();
assert.equal(await page.locator('.o101-rack [data-tile]').count(),21);
// Opponent turn cannot throw a tile.
const count=await page.evaluate(()=>posts.length);await drag(tile(3),page.locator('[data-drop="discard"]'));assert.equal(await page.evaluate(()=>posts.length),count);
// Drive next turn through the same public API refresh.
await page.evaluate(()=>{fixture.state.turn=1;fixture.state.phase='draw';fixture.state.version++;});
await page.waitForFunction(()=>!document.querySelector('.o101-stock-count').disabled);
await drag(page.locator('.o101-stock-count'),page.locator('[data-slot="29"]'));
await page.waitForFunction(()=>posts.at(-1).action==='draw');assert.equal(await page.evaluate(()=>posts.at(-1).source),'stock');
assert.equal(await page.locator('.o101-rack [data-tile]').count(),22);
// Public per processing uses the server-provided legal target.
await page.evaluate(()=>{fixture.state.players[0].opened='run';fixture.state.melds=[{id:'touch-meld',owner:2,kind:'run',tiles:[7,8,9],faces:[[0,8],[0,9],[0,10]]}];fixture.lay_options=[{tile:0,meld_id:'touch-meld',end:'left',face:[0,1]}];fixture.state.version++;});
await page.waitForSelector('[data-meld="touch-meld"]');await drag(tile(0),page.locator('[data-meld="touch-meld"]'));assert.equal(await page.evaluate(()=>posts.at(-1).action),'lay');
await page.waitForFunction(()=>document.querySelector('.o101-root').getAttribute('aria-busy')==='false');
// Prepare a selected run by dragging it onto the public table.
await tile(3).tap();await tile(4).tap();await tile(5).tap();await drag(tile(3),page.locator('[data-drop="open"]'));
assert(await page.locator('.o101-editor').isVisible());assert.equal(await page.locator('[data-kind]').inputValue(),'run');await page.locator('[data-action="cancel-editor"]').tap();
// Left discard is a physical source too.
await page.evaluate(()=>{fixture.state.phase='draw';fixture.state.version++;});await page.waitForFunction(()=>!document.querySelector('.o101-stock-count').disabled);
await drag(page.locator('.o101-discards [data-source="discard"]'),page.locator('[data-slot="28"]'));
assert.equal(await page.evaluate(()=>posts.at(-1).source),'discard');
// A newer authoritative state cancels an in-progress gesture.
const oldPosts=await page.evaluate(()=>posts.length);
const box=await tile(3).boundingBox(),target=await page.locator('[data-drop="discard"]').boundingBox(),cdp=await page.context().newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+5,y:box.y+5}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+20,y:box.y-20}]});
await page.evaluate(()=>{fixture.state.turn=2;fixture.state.version++;});await page.waitForFunction(()=>!document.querySelector('.o101-drag-ghost'));
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+10,y:target.y+10}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();assert.equal(await page.evaluate(()=>posts.length),oldPosts);
for(const [width,height] of [[320,640],[393,820],[430,932],[844,390]])for(const theme of ['light','dark']){
await page.setViewportSize({width,height});await page.evaluate(t=>document.documentElement.dataset.erisTheme=t,theme);
assert(await page.locator('.o101-rack').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
assert(await page.locator('.o101-rack').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight));
}
await page.setViewportSize({width:430,height:932});await page.screenshot({path:'/tmp/okey-touch.png'});
assert.deepEqual(errors,[]);await browser.close();await new Promise(r=>server.close(r));console.log('PASS: rack gaps, cancel, physical discard, wrong turn, deck drag, 8 viewport/theme cases');
})().catch(e=>{console.error(e);process.exit(1)});
