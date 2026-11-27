const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={
 URL,
 window:{
  LidyaNobilityAssets:{
   resolve:(rank,id)=>`/${rank}/${id}.png`
  }
 }
};

vm.runInNewContext(
 fs.readFileSync(
  'frontend/nobility-appearance.js','utf8'
 ),context
);

const api=context.window.LidyaNobilityAppearance;

const king={
 rank:4,
 privileges:['super_avatar','frame']
};

test('King embedded frame',()=>{
 assert.equal(
  api.hasEmbeddedFrame(king,api.superAvatar(king)),
  true
 );
});

test('Disabled Super Avatar restores frame',()=>{
 const data={rank:4,privileges:['frame']};
 assert.equal(api.superAvatar(data),null);
 assert.equal(api.hasEmbeddedFrame(data,null),false);
 assert.equal(api.resolve(data,'frame'),'/4/frame.png');
});

for(const rank of [0,1,2,3]){
 test('Other rank protected '+rank,()=>{
  assert.equal(
   api.hasEmbeddedFrame(
    {rank,privileges:['super_avatar']},
    '/4/super_avatar.png'
   ),false
  );
 });
}

test('Custom animated avatar keeps frame',()=>{
 const data={
  ...king,
  animated_avatar:{
   asset_id:'12345678-1234-4123-8123-123456789abc',
   expires_at:'2099-01-01T00:00:00Z'
  }
 };
 const src=api.superAvatar(data);
 assert.match(src,/animated-avatar/);
 assert.equal(api.hasEmbeddedFrame(data,src),false);
});

test('Expired animated avatar returns to King',()=>{
 const data={
  ...king,
  animated_avatar:{
   asset_id:'12345678-1234-4123-8123-123456789abc',
   expires_at:'2000-01-01T00:00:00Z'
  }
 };
 assert.equal(
  api.hasEmbeddedFrame(data,api.superAvatar(data)),
  true
 );
});
