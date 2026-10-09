// Regression checks execute production functions with a small DOM adapter.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../'+n),'utf8');
function fn(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0);let pos=source.indexOf('{',start),level=1,i=pos+1;for(;level;i++){if(source[i]==='{')level++;if(source[i]==='}')level--;}return source.slice(start,i);}
class Seat{
 constructor(n,html='seat'){this.dataset={seatNumber:String(n)};this.innerHTML=html;this.className='eris-seat';this.style={setProperty(){}};this.classList={remove(){},add(){}};this.listeners={};}
 get outerHTML(){return this.dataset.seatNumber+this.innerHTML;}
 cloneNode(){return new Seat(this.dataset.seatNumber,this.innerHTML)}
 addEventListener(n,f){this.listeners[n]=f} removeAttribute(){} querySelectorAll(){return []}
 remove(){const a=this.parent.children;a.splice(a.indexOf(this),1)}
}
for(const file of ['room-uno.js','room-okey101.js']){
 let originals=Array.from({length:24},(_,i)=>new Seat(i+1));
 const strip={children:[],scrollLeft:173,style:{setProperty(){}},insertBefore(n,next){if(n.parent)n.remove();const i=next?this.children.indexOf(next):this.children.length;this.children.splice(i,0,n);n.parent=this;}};
 let clicked;const host=()=>({querySelector:()=>strip,querySelectorAll:()=>originals});
 const c={host,window:{ErisRoomSeatMenu:r=>clicked=r}};vm.createContext(c);vm.runInContext(fn(read(file),'syncSeats'),c);c.syncSeats();
 assert.equal(strip.children.length,24,file);const anchors=[...strip.children];c.syncSeats();assert.deepEqual(strip.children,anchors);assert.equal(strip.scrollLeft,173);
 originals=originals.map((s,i)=>new Seat(i+1,'new'));c.syncSeats();assert.deepEqual(strip.children,anchors);assert.equal(strip.scrollLeft,173);
 strip.children[23].listeners.click({preventDefault(){},stopImmediatePropagation(){}});assert.equal(clicked,originals[23]);
 originals=originals.slice(0,16);c.syncSeats();assert.equal(strip.children.length,16);
}
const okey=read('room-okey101.js');
const c={rid:'room',data:null,hidden:'',visible:true,lastRound:'',lastHand:0,order:[],selected:[],groups:[],editor:null,processing:null,showScores:false,rulesOpen:false,menu:false,offset:0,dismissedResults:new Set(),window:{},Date,host:()=>({classList:{contains:()=>false},querySelector:()=>({})}),render(){this.renders=(this.renders||0)+1},clear(){}};
c.state=()=>c.data?.state;c.resultKey=s=>c.rid+'/'+s?.round_id;vm.createContext(c);vm.runInContext(fn(okey,'viewSignature')+'\n'+fn(okey,'receive'),c);
const snapshot=(round='r1',status='finished',version=1)=>({state:{round_id:round,hand_number:1,status,version,players:[]},server_time:Date.now()/1000,balance:100});
c.receive(snapshot());c.menu=true;c.dismissedResults.add('room/r1');c.rulesOpen=true;const count=c.renders;c.receive(snapshot('r1','finished',2));assert.equal(c.renders,count);assert.equal(c.rulesOpen,true);assert.equal(c.menu,true);
c.lastRound='';c.receive(snapshot());assert.equal(c.menu,true);c.receive(snapshot('r2'));assert.equal(c.menu,false);
const ludo=read('room-ludo.js');
const d={rid:'room',data:null,round:null,accepted:-1,offset:0,hiddenRound:null,menuRound:null,stake:50,epoch:0,queue:Promise.resolve(),animating:false,pending:false,retry:null,selectedDie:null,modal:null,dismissedResults:new Set(['room/r1']),Date,Promise,window:{},surface:()=>null,stage:()=>null,closeDialog(){},render(){},renderDialog(){}};
d.resultKey=s=>String(d.rid)+'/'+s?.round_id;vm.createContext(d);vm.runInContext(fn(ludo,'receive'),d);d.receive(snapshot());assert.equal(d.menuRound,'r1');d.round=null;d.receive(snapshot());assert.equal(d.menuRound,'r1');d.receive(snapshot('r2'));assert.equal(d.menuRound,null);
console.log('Room regression tests passed: 24 seats, stable nodes/scroll, live seat clicks, Okey polling/options, dismissed Okey/Ludo results and new rounds.');
