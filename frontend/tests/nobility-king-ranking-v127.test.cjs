const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

for(const [file,fn] of [
 ['game-ranking.js','rankingKnight'],
 ['room-fan-ranking.js','fanKnight']
]){
 const source=fs.readFileSync(
   'frontend/'+file,'utf8'
 );

 const start=source.indexOf('function '+fn+'(row)');
 const end=source.indexOf(
   'return row.nobility;',start
 );

 assert.ok(start>=0 && end>start);

 const close=source.indexOf('}',end);

 const context={
   window:{ErisStaffIdentity:{
     isStaff:row=>row.staff===true
   }}
 };

 vm.runInNewContext(
   source.slice(start,close+1)+
   '\nglobalThis.resolve='+fn+';',
   context
 );

 const resolve=context.resolve;

 for(const rank of [1,2,3,4]){
   test(file+' authorized rank '+rank,()=>{
     const data={
       rank,
       privileges:['badge','frame']
     };
     assert.equal(resolve({nobility:data}),data);
   });
 }

 for(const rank of [0,5,-1,'4',null]){
   test(file+' invalid rank '+rank,()=>{
     assert.equal(resolve({
       nobility:{rank,privileges:['badge']}
     }),null);
   });
 }

 for(const role of ['SA','UA','FA','DA']){
   test(file+' staff protection '+role,()=>{
     assert.equal(resolve({
       admin_role:role,
       nobility:{rank:4,privileges:['badge','frame']}
     }),null);
   });
 }

 test(file+' management lock',()=>{
   assert.equal(resolve({
     management_locked:true,
     nobility:{rank:4}
   }),null);
 });

 test(file+' management frame',()=>{
   assert.equal(resolve({
     frame_asset:'/role-icons/management-v1/frame.png',
     nobility:{rank:4}
   }),null);
 });

 test(file+' staff identity',()=>{
   assert.equal(resolve({
     staff:true,
     nobility:{rank:4}
   }),null);
 });

 test(file+' missing membership',()=>{
   assert.equal(resolve({}),null);
 });
}
