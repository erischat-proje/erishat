const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(){
 let now=Date.parse('2026-01-01T00:00:00Z');
 let serial=0;
 let calls=0;
 let token='test-session';
 let response=null;
 const timers=new Map();

 class Clock extends Date{
  static now(){return now}
 }

 const window={
  ErisAuth:{
   user:{id:'viewer'},
   getToken:()=>token
  },
  ErisPlatform:{
   async api(path){
    calls++;
    assert.equal(path,'/users/king');

    if(response instanceof Error)throw response;
    return response;
   }
  },
  LidyaNobilityAssets:{
   resolve:(rank,id)=>`/${rank}/${id}.png`
  },
  setTimeout(fn,delay){
   const id=++serial;
   timers.set(id,{fn,delay});
   return id;
  },
  clearTimeout:id=>timers.delete(id),
  addEventListener(){}
 };

 vm.runInNewContext(
  fs.readFileSync(
   'frontend/nobility-appearance.js','utf8'
  ),
  {window,Date:Clock,URL,console}
 );

 return {
  api:window.LidyaNobilityAppearance,
  calls:()=>calls,
  changeSession:()=>{token='new-session'},
  response:value=>{response=value},
  data:(duration=60000)=>({
   rank:4,
   privileges:['frame','super_avatar'],
   king_avatar_variant:'male',
   king_expires_at:new Date(now+duration).toISOString()
  }),
  async advance(ms){
   now+=ms;
   const jobs=[...timers.values()];
   timers.clear();
   jobs.forEach(job=>job.fn());

   await new Promise(resolve=>setImmediate(resolve));
  }
 };
}

test('Verified renewal preserves active King avatar',async()=>{
 const s=setup();
 const node={isConnected:true};
 const data=s.data();
 let restored=0;

 const renewed=s.data(120000);

 s.response({
  id:'king',
  nobility:renewed
 });

 s.api.watchKingExpiryFor(
  node,data,'king',()=>restored++
 );

 await s.advance(30000);

 assert.equal(s.calls(),1);
 assert.equal(
  data.king_expires_at,
  renewed.king_expires_at
 );

 await s.advance(30000);
 assert.equal(restored,0);
 assert.ok(s.api.superAvatar(data));
});

test('Network failure never extends King membership',async()=>{
 const s=setup();
 let restored=0;

 s.response(new Error('offline'));

 s.api.watchKingExpiryFor(
  {isConnected:true},s.data(),
  'king',()=>restored++
 );

 await s.advance(30000);
 assert.equal(restored,0);

 await s.advance(30000);
 assert.equal(restored,1);
});

test('Revoked King appearance is removed',async()=>{
 const s=setup();
 let restored=0;

 s.response({
  id:'king',
  nobility:{rank:0,privileges:[]}
 });

 s.api.watchKingExpiryFor(
  {isConnected:true},s.data(),
  'king',()=>restored++
 );

 await s.advance(30000);
 assert.equal(restored,1);
});

test('Same user portraits share one renewal request',async()=>{
 const s=setup();
 let restored=0;

 s.response({
  id:'king',
  nobility:s.data(120000)
 });

 for(let i=0;i<100;i++){
  s.api.watchKingExpiryFor(
   {isConnected:true},s.data(),
   'king',()=>restored++
  );
 }

 await s.advance(30000);

 assert.equal(s.calls(),1);
 assert.equal(restored,0);
});

test('Previous account cannot refresh King deadline',async()=>{
 const s=setup();

 s.api.watchKingExpiryFor(
  {isConnected:true},s.data(),
  'king',()=>{}
 );

 s.changeSession();
 await s.advance(30000);

 assert.equal(s.calls(),0);
});
