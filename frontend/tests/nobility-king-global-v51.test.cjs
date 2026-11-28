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
 privileges:['super_avatar','frame'],
 king_expires_at:'2099-01-01T00:00:00Z'
};

for(const gender of ['male','female']){
 const user={...king,king_avatar_variant:gender};

 test('Correct royal avatar '+gender,()=>{
  assert.equal(
   api.superAvatar(user),
   './assets/lidya-nobility/king/king-avatar-'+
   gender+'.webp'
  );
 });

 test('External frame '+gender,()=>{
  assert.equal(api.resolve(user,'frame'),'/4/frame.png');

  assert.equal(
   api.hasEmbeddedFrame(user,api.superAvatar(user)),
   false
  );
 });
}

for(const rank of [0,1,2,3]){
 test('Royal avatar unavailable for rank '+rank,()=>{
  assert.equal(
   api.superAvatar({...king,rank,king_avatar_variant:'male'}),
   null
  );
 });
}

test('Expired King loses royal avatar and frame',()=>{
 const user={
  ...king,
  king_avatar_variant:'female',
  king_expires_at:'2000-01-01T00:00:00Z'
 };
 assert.equal(api.superAvatar(user),null);
 assert.equal(api.resolve(user,'frame'),null);
});

test('Unknown gender does not select wrong avatar',()=>{
 assert.equal(
  api.superAvatar({...king,king_avatar_variant:null}),
  null
 );
});

test('Invalid membership expiry rejected',()=>{
 assert.equal(api.superAvatar({
  ...king,
  king_avatar_variant:'male',
  king_expires_at:'invalid'
 }),null);
});

test('Disabled super avatar remains disabled',()=>{
 assert.equal(api.superAvatar({
  ...king,
  king_avatar_variant:'male',
  privileges:['frame']
 }),null);
});

test('Authorized personal animation keeps external frame',()=>{
 const user={
  ...king,
  king_avatar_variant:'female',
  animated_avatar:{
   asset_id:'12345678-1234-4123-8123-123456789abc',
   expires_at:'2099-01-01T00:00:00Z'
  }
 };

 assert.match(api.superAvatar(user),/animated-avatar/);
 assert.equal(
  api.hasEmbeddedFrame(user,api.superAvatar(user)),
  false
 );
});

test('Expired personal animation restores royal animation',()=>{
 const user={
  ...king,
  king_avatar_variant:'female',
  animated_avatar:{
   asset_id:'12345678-1234-4123-8123-123456789abc',
   expires_at:'2000-01-01T00:00:00Z'
  }
 };

 assert.match(api.superAvatar(user),/king-avatar-female.webp$/);
});

for(const gender of ['male','female']){
 test('Global royal portrait '+gender,()=>{
  const user={
   nobility:{
    ...king,
    king_avatar_variant:gender
   }
  };
  const result=api.royalPortrait(user);

  assert.match(
   result.avatar,
   new RegExp('king-avatar-'+gender+'\\.webp$')
  );
  assert.equal(result.frame,'/4/frame.png');
  assert.equal(result.embedded,false);
 });
}

for(const role of ['SA','UA','FA','DA']){
 test('Global staff protection '+role,()=>{
  assert.equal(api.royalPortrait({
   admin_role:role,
   nobility:{
    ...king,
    king_avatar_variant:'male'
   }
  }),null);
 });
}

test('Global management lock protection',()=>{
 assert.equal(api.royalPortrait({
  management_locked:true,
  nobility:king
 }),null);
});

test('Expired global royal portrait rejected',()=>{
 assert.equal(api.royalPortrait({
  nobility:{
   ...king,
   king_avatar_variant:'female',
   king_expires_at:'2000-01-01T00:00:00Z'
  }
 }),null);
});

test('Global management frame protection',()=>{
 assert.equal(api.royalPortrait({
  frame_asset:'/role-icons/management-v1/frame.png',
  nobility:king
 }),null);
});

test('No duplicate embedded royal frame',()=>{
 const result=api.royalPortrait({nobility:king});
 assert.equal(result.embedded,true);
 assert.equal(result.frame,'');
});
