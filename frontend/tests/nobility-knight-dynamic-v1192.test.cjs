const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const cards=[];
 function element(){return {children:[],append(...nodes){this.children.push(...nodes)},remove(){}};}
 const document={hidden:false,createElement:element,addEventListener(){},body:{appendChild(x){cards.push(x)}}};
 const window={addEventListener(){},LidyaNobilityAssets:{resolve:(r,k)=>`${r}/${k}.png`}};
 vm.runInNewContext(fs.readFileSync('frontend/nobility-banners.js','utf8'),{document,window,setTimeout(){return 1},clearTimeout(){}});
 return {cards,api:window.LidyaNobilityBanners};
}
function data(){return {type:'nobility_banner',rank:1,kind:'gift_banner',scope:'global',id:'gift:1',nickname:'Devil🖤',gift:{name:'Toprak Bardak',quantity:3,image_url:'/hediyesistemi/28.png'}};}
test('Knight gift renders server-provided dynamic fields',()=>{
 const {cards,api}=setup(); assert.equal(api.show(data()),true);
 const card=cards[0]; assert.match(card.className,/lidya-knight-dynamic-gift/);
 assert.match(card.children[0].src,/gift-banner-dynamic\.png$/);
 assert.equal(card.children[1].textContent,'Devil🖤');
 assert.equal(card.children[2].src,'./hediyesistemi/28.png');
 assert.equal(card.children[3].textContent,'Toprak Bardak ×3');
});
test('Different gifts and sender remain dynamic and literal',()=>{
 const {cards,api}=setup(); const d=data(); d.nickname='<b>user</b>'; d.gift={name:'Çiçek',quantity:9,image_url:'/hediyesistemi/7.png'}; api.show(d);
 assert.equal(cards[0].children[1].textContent,'<b>user</b>'); assert.equal(cards[0].children[3].textContent,'Çiçek ×9');
});
for(const value of ['https://evil.example/x.png','/hediyesistemi/../x.png','javascript:alert(1)','/hediyesistemi/1.png?x=1']){
 test('Reject non-catalog image '+value,()=>{const {cards,api}=setup();const d=data();d.gift.image_url=value;api.show(d);assert.doesNotMatch(cards[0].className,/dynamic-gift/);});
}
test('Old events and other ranks keep legacy rendering',()=>{for(const rank of [1,2,3,4]){const {cards,api}=setup();const d=data();d.rank=rank;if(rank===1||rank===2||rank===3)delete d.gift;api.show(d);assert.equal(cards[0].children.length,2);}});
test('Template load failure retains readable text',()=>{const {cards,api}=setup();api.show(data());cards[0].children[0].onerror();assert.match(cards[0].className,/ln-dynamic-template-failed/);assert.match(cards[0].children[4].textContent,/Toprak Bardak ×3/);});
test('Template PNG exists',()=>{const p='frontend/assets/lidya-nobility/knight/gift-banner-dynamic.png';assert.equal(fs.readFileSync(p).subarray(0,8).toString('hex'),'89504e470d0a1a0a');});
