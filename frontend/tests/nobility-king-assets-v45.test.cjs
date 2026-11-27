const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const window={};

const context=vm.createContext({window});

for(const file of [
 'nobility-catalog.js',
 'nobility-assets.js'
]){
 vm.runInContext(
  fs.readFileSync('frontend/'+file,'utf8'),
  context
 );
}

const catalog=window.LidyaNobilityCatalog;
const assets=window.LidyaNobilityAssets;

test('King has all 16 privileges',()=>{
 assert.equal(catalog.forRank(4).length,16);
});

for(const privilege of catalog.forRank(4)){
 test('King asset: '+privilege.id,()=>{
  const url=assets.resolvePreview(4,privilege.id);

  assert.ok(url);

  const path='frontend/'+url.replace(/^\.\//,'');

  assert.ok(fs.existsSync(path),path);

  const png=fs.readFileSync(path);

  assert.equal(
   png.subarray(0,8).toString('hex'),
   '89504e470d0a1a0a'
  );
 });
}

test('King bonus has independent transparent PNG',()=>{
 const p='frontend/assets/lidya-nobility/king/gift-bonus.png';
 const png=fs.readFileSync(p);

 assert.equal(png.readUInt32BE(16),1024);
 assert.equal(png.readUInt32BE(20),1024);
 assert.equal(png[25],6);

 assert.match(
  assets.resolvePreview(4,'gift_bonus'),
  /king\/gift-bonus\.png$/
 );
});

test('Count and Duke bonus assets remain independent',()=>{
 for(const [rank,key] of [[2,'count'],[3,'duke']]){
  assert.equal(
   assets.resolvePreview(rank,'gift_bonus'),
   './assets/lidya-nobility/'+key+'/gift-bonus.png'
  );
 }
});
