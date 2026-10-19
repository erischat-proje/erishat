/* Geometry checks run without a browser; the browser suite checks real hit targets. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),frontend=path.join(root,'frontend');
const document={baseURI:'https://eris.test/',currentScript:{src:'https://eris.test/visual-layout.js'}};
const window={};
const context=vm.createContext({window,document,URL,innerWidth:320,fetch:async()=>({ok:true,json:async()=>({assets:{}})}),setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(path.join(frontend,'lidya-premium.js'),'utf8'),context);
window.ErisChatCosmetics={assetUrl:key=>'https://eris.test/'+(window.ErisLidyaPremium.resolve(key)||key)};
vm.runInContext(fs.readFileSync(path.join(frontend,'visual-layout.js'),'utf8'),context);
(async()=>{
  const report=JSON.parse(fs.readFileSync(path.join(root,'docs/lidya-premium-progress.json')));
  let checked=0;
  for(const id of report.ids){
    const key='shop-expansion/'+id+'.svg',m=window.ErisLidyaPremium.describe(key);
    assert.ok(m,id);assert.match(window.ErisLidyaPremium.resolve(key),/shop-lydia-premium\/.+\.png$/);
    if(id.startsWith('profile-'))for(const width of [296,366,420,740]){
      const el={style:{},isConnected:true,getBoundingClientRect:()=>({width})};
      await window.ErisVisualLayout.popup(el,key);
      assert.ok(!el.style.borderImageSlice.includes('fill'),'profile center cannot receive artwork');
      const edges=el.style.borderWidth.split(' ').map(parseFloat);
      assert.ok(edges[1]<=26&&edges[3]<=26,'profile side limits');
      assert.ok(width-edges[1]-edges[3]-16>=228,'readable inner pane at 320px viewport');
      assert.match(el.style.borderImageSource,/shop-lydia-premium/);checked++;
    }
    if(id.startsWith('entrance-')){
      assert.ok(m.avatar.x>.1&&m.avatar.x<.4);
      assert.ok(m.avatar.diameter>.3&&m.avatar.diameter<.8);
      assert.ok(m.avatar.x+m.avatar.diameter*m.height/m.width/2<m.name_box.x);
    }
  }
  for(const key of ['vip-designs/avatar-frame-male-12.svg','vip-designs/lydia/avatar-female-12.webp','relationship-assets/rewards/frame-female-l1.png'])assert.equal(window.ErisLidyaPremium.resolve(key),null);
  console.log(`PASS: ${report.generated} artwork mappings, ${checked} profile width checks, omitted profile centers, measured entrance apertures and VIP preservation.`);
})().catch(e=>{console.error(e);process.exitCode=1});
