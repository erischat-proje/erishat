const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(){
 let now=Date.parse('2026-01-01T00:00:00Z');
 let serial=0;
 const timers=new Map();

 class FakeDate extends Date{
  static now(){return now}
 }

 const window={
  LidyaNobilityAssets:{
   resolve:(rank,id)=>`/${rank}/${id}.png`
  },
  setTimeout(fn,delay){
   const id=++serial;
   timers.set(id,{fn,delay});
   return id;
  },
  clearTimeout(id){timers.delete(id)},
  addEventListener(){}
 };

 vm.runInNewContext(
  fs.readFileSync(
   'frontend/nobility-appearance.js','utf8'
  ),
  {window,Date:FakeDate,URL,console}
 );

 return {
  api:window.LidyaNobilityAppearance,
  timers,
  data:(duration=1000)=>({
   rank:4,
   privileges:['frame','super_avatar'],
   king_avatar_variant:'male',
   king_expires_at:new Date(now+duration).toISOString()
  }),
  advance(ms){
   now+=ms;
   const current=[...timers.values()];
   timers.clear();
   current.forEach(job=>job.fn());
  }
 };
}

test('Royal avatar restored only after expiry',()=>{
 const s=setup();
 const node={isConnected:true};
 let restored=0;
 const data=s.data();

 s.api.watchKingExpiry(node,data,()=>restored++);

 s.advance(999);
 assert.equal(restored,0);

 s.advance(1);
 assert.equal(restored,1);
 assert.equal(s.api.superAvatar(data),null);
 assert.equal(s.api.resolve(data,'frame'),null);

 s.advance(1000);
 assert.equal(restored,1);
});

test('Renewed snapshot replaces old deadline',()=>{
 const s=setup();
 const node={isConnected:true};
 let restored=0;

 s.api.watchKingExpiry(
  node,s.data(1000),()=>restored++
 );

 s.api.watchKingExpiry(
  node,s.data(5000),()=>restored++
 );

 s.advance(1000);
 assert.equal(restored,0);

 s.advance(4000);
 assert.equal(restored,1);
});

test('Disconnected portraits are discarded',()=>{
 const s=setup();
 let restored=0;

 s.api.watchKingExpiry(
  {isConnected:false},s.data(),()=>restored++
 );

 s.advance(1000);
 assert.equal(restored,0);
 assert.equal(s.timers.size,0);
});

test('Lower ranks create no King timer',()=>{
 const s=setup();

 for(const rank of [0,1,2,3]){
  assert.equal(
   s.api.watchKingExpiry(
    {isConnected:true},
    {...s.data(),rank},
    ()=>{}
   ),
   false
  );
 }

 assert.equal(s.timers.size,0);
});

test('200 portraits use one timer',()=>{
 const s=setup();
 let restored=0;

 for(let i=0;i<200;i++){
  s.api.watchKingExpiry(
   {isConnected:true},
   s.data(),
   ()=>restored++
  );
 }

 assert.equal(s.timers.size,1);

 s.advance(1000);
 assert.equal(restored,200);
 assert.equal(s.timers.size,0);
});

test('Normal appearance cancels old King timer',()=>{
 const s=setup();
 const node={isConnected:true};
 let restored=0;

 s.api.watchKingExpiry(
  node,s.data(),()=>restored++
 );

 s.api.watchKingExpiry(
  node,{rank:0,privileges:[]},()=>{}
 );

 s.advance(1000);
 assert.equal(restored,0);
 assert.equal(s.timers.size,0);
});
