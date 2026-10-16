const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const text=fs.readFileSync('frontend/room-live.js','utf8');
const fn=text.slice(text.indexOf('  function attachRoomChat('),text.indexOf('  async function openRoom('));
function setup(){
 let now=1000,stops=0;const intervals=new Map(),timers=new Map(),sockets=[],messages=[];let n=0;
 const node=()=>({dataset:{},style:{},children:[],parentElement:{querySelector:()=>null},replaceChildren(){},before(){},querySelector:()=>null});
 const nodes={erisLiveChat:node(),erisLiveMeta:node(),erisLiveInput:node(),erisLiveSend:node()};
 class WS{static OPEN=1;constructor(){this.readyState=0;sockets.push(this)}send(value){messages.push(JSON.parse(value))}close(code=1006){this.readyState=3;this.onclose?.({code})}}
 const window={ErisCurrentRoomId:'room',ErisPlatform:{getRealtimeUrl:()=>'',getAccessToken:()=> 'token'},ErisRoomRTC:{stop:()=>stops++,message:x=>messages.push(x),leaveRoom:()=>stops++},toast(){}};
 const document={visibilityState:'visible',getElementById:id=>nodes[id],createElement:node};
 const ctx={window,document,WebSocket:WS,blockedUsers:new Set(),Date:{now:()=>now},setInterval:fn=>{intervals.set(++n,fn);return n},clearInterval:id=>intervals.delete(id),setTimeout:fn=>{timers.set(++n,fn);return n},clearTimeout:id=>timers.delete(id),Promise};
 vm.createContext(ctx);vm.runInContext('let stopRoomHeartbeat=()=>{};let reconnectRoomTransport=()=>{};'+fn+';globalThis.attach=attachRoomChat;globalThis.recover=()=>reconnectRoomTransport();',ctx);
 ctx.attach('room');const socket=sockets[0];socket.readyState=1;socket.onopen();
 return {ctx,socket,sockets,messages,intervals,timers,window,document,setNow:n=>now=n,get stops(){return stops}};
}
{const t=setup();t.setNow(70000);[...t.intervals.values()][0]();assert.equal(t.socket.readyState,3);assert.equal(t.stops,1);[...t.timers.values()][0]();assert.equal(t.sockets.length,2);}
{const t=setup();t.socket.onmessage({data:JSON.stringify({type:'pong',peers:['a']})});assert.equal(t.messages[0].type,'rtc_roster');t.ctx.attach('room');assert.equal(t.stops,0);assert.equal(t.intervals.size,0);}
{const t=setup();t.socket.close();t.window.ErisCurrentRoomId='another';[...t.timers.values()][0]();assert.equal(t.sockets.length,1);}
{const t=setup();t.document.visibilityState='hidden';t.setNow(70000);[...t.intervals.values()][0]();assert.equal(t.socket.readyState,1);assert.equal(t.messages[0].type,'ping');}
console.log('PASS: 4 transport scenarios (heartbeat timeout, roster/replacement, stale retry, hidden-room heartbeat)');
