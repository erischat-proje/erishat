const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('frontend/erischat-main.html','utf8');
const markup=html.match(/<button\b[^>]*id="lidyaWelcomePackages"[^>]*>[\s\S]*?<\/button>/);
assert(markup,'actual home button missing');
const source=fs.readFileSync('frontend/welcome-packages-live.js','utf8');
const dom=new JSDOM(`<section id="home" class="view show">${markup[0]}</section>`,{url:'https://www.lidyachat.com/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;let time=0,session='male-token',tick,calls=[],hold=null,expires=120;
Object.defineProperty(w.performance,'now',{value:()=>time});w.setInterval=fn=>{tick=fn;return 1};
function payload(gender){return {eligible_for_offer:true,purchase_enabled:false,collection:gender,remaining_seconds:expires,packages:['bronze','silver','gold'].map((tier,i)=>({id:tier,collection:gender,name:gender+' '+tier,lidya:[6000,14000,28000][i],price_kurus:[9999,24999,49999][i],currency:'TRY',purchase_limit:1,duration_days:[7,15,30][i],cosmetic_rewards:[['frame','bubble'],['frame','bubble','profile','entrance'],['frame','bubble','profile','entrance','title']][i].map(type=>{const asset_key=`welcome_${gender}_${tier}_${type}_v1`;return {type,gender,tier,asset_key,name:asset_key,preview_asset:`welcome-premium-v3/${asset_key}.svg`,preview_ready:true}})}))}}
w.ErisPlatform={getAccessToken:()=>session,api:(path,opt)=>{calls.push([path,opt.method,session]);if(hold)return hold;if(session==='old-token')return Promise.resolve({eligible_for_offer:false});return Promise.resolve(payload(session.split('-')[0]))}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));const btn=d.getElementById('lidyaWelcomePackages');
(async()=>{try{
  w.eval(source);await settle();assert.equal(btn.hidden,false);assert.equal(calls[0][0],'/welcome-packages/status');console.log('PASS: ELIGIBLE HOME BUTTON');
  btn.focus();btn.click();await settle();assert.equal(d.querySelectorAll('.lwp-card').length,3);assert.equal(d.querySelectorAll('.lwp-rewards img').length,11);assert([...d.querySelectorAll('.lwp-rewards img')].every(e=>e.src.includes('welcome_male_')));assert([...d.querySelectorAll('.lwp-buy')].every(e=>e.disabled));console.log('PASS: MALE PREVIEWS AND DISABLED SALES');
  d.querySelector('.lwp-close').click();assert.equal(d.querySelector('.lwp-overlay'),null);assert.equal(d.activeElement,btn);console.log('PASS: CLOSE AND FOCUS');
  session='female-token';tick();await settle();btn.click();await settle();assert([...d.querySelectorAll('.lwp-rewards img')].every(e=>e.src.includes('welcome_female_')));console.log('PASS: FEMALE ACCOUNT ISOLATION');
  expires=0;time+=121000;tick();assert(btn.hidden);assert.equal(d.querySelector('.lwp-overlay'),null);console.log('PASS: EXPIRY CLOSES UI');await settle();
  session='old-token';tick();await settle();assert(btn.hidden);console.log('PASS: INELIGIBLE ACCOUNT HIDDEN');
  expires=120;let resolve;hold=new Promise(r=>{resolve=r});session='male-token';tick();session='old-token';hold=null;tick();await settle();resolve(payload('male'));await settle();assert(btn.hidden);assert.equal(d.querySelector('.lwp-overlay'),null);console.log('PASS: STALE ACCOUNT RESPONSE REJECTED');
  session='';tick();assert(btn.hidden);assert(calls.every(x=>x[1]==='GET'));console.log('PASS: LOGOUT AND READ ONLY');
  console.log('=== WELCOME PACKAGES UI V4: 8/8 PASS ===');
}finally{w.close()}})().catch(e=>{console.error(e);process.exitCode=1});
