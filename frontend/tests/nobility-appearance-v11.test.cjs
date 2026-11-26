const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const rules={
 badge:1,
 frame:1,
 entrance:1,
 region_background:3,
 room_frame:4,
 super_avatar:4
};

const window={
 LidyaNobilityAssets:{
  resolve:(rank,id)=>`${rank}/${id}.png`
 }
};

vm.runInNewContext(
 fs.readFileSync(
  'frontend/nobility-appearance.js','utf8'
 ),
 {window}
);

const api=window.LidyaNobilityAppearance;

for(const rank of [0,1,2,3,4]){
 for(const [id,min] of Object.entries(rules)){
  test(`Rank ${rank}: ${id}`,()=>{
   const data={
    rank,
    privileges:Object.keys(rules).filter(
     key=>rank>=rules[key]
    )
   };

   assert.equal(
    api.resolve(data,id),
    rank>=min?`${rank}/${id}.png`:null
   );
  });
 }
}

for(const [id,min] of Object.entries(rules)){
 test(`Missing privilege: ${id}`,()=>{
  assert.equal(
   api.resolve({rank:min,privileges:[]},id),
   null
  );
 });

 test(`Forged privilege: ${id}`,()=>{
  assert.equal(
   api.resolve({
    rank:min-1,
    privileges:[id]
   },id),
   null
  );
 });
}

for(const rank of [-1,5,99,'4',null,undefined]){
 test(`Invalid rank: ${rank}`,()=>{
  assert.equal(
   api.resolve({rank,privileges:['badge']},'badge'),
   null
  );
 });
}

test('Missing membership',()=>{
 assert.equal(api.resolve(null,'frame'),null);
});

test('Unknown privilege',()=>{
 assert.equal(
  api.resolve({rank:4,privileges:['unknown']},'unknown'),
  null
 );
});

function element(){
 const classes=new Set();
 const properties=new Map();

 return {
  classes,properties,
  classList:{
   toggle:(key,value)=>{
    if(value)classes.add(key);
    else classes.delete(key);
   }
  },
  style:{
   setProperty:(key,value)=>properties.set(key,value),
   removeProperty:key=>properties.delete(key)
  }
 };
}

test('Profile background removed after downgrade',()=>{
 const el=element();

 api.decorateProfile(el,{
  nobility:{rank:4,privileges:['region_background']}
 });

 assert.equal(el.classes.size,1);
 assert.equal(el.properties.size,1);

 api.decorateProfile(el,{
  nobility:{rank:2,privileges:[]}
 });

 assert.equal(el.classes.size,0);
 assert.equal(el.properties.size,0);
});

test('Management profile protected',()=>{
 const el=element();

 api.decorateProfile(el,{
  admin_role:'DA',
  nobility:{rank:4,privileges:['region_background']}
 });

 assert.equal(el.classes.size,0);
 assert.equal(el.properties.size,0);
});

test('Royal room frame removed after downgrade',()=>{
 const el=element();

 api.decorateRoomCard(el,{
  rank:4,privileges:['room_frame']
 });

 assert.equal(el.classes.size,1);

 api.decorateRoomCard(el,{
  rank:3,privileges:[]
 });

 assert.equal(el.classes.size,0);
 assert.equal(el.properties.size,0);
});
