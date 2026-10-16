#!/usr/bin/env node
import { chromium } from 'playwright';

const API='http://127.0.0.1:8000/v1';
const PAGE='http://127.0.0.1:4175/erischat-main.html';

async function main(){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(api=>{window.ERIS_API=api;},API);
  await page.goto(PAGE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.ErisAuth?.user,{timeout:15000});
  const owner=await page.evaluate(()=>window.ErisAuth.user);
  const ownerToken=await page.evaluate(()=>localStorage.getItem('erischat_access_token'));
  if(!owner?.id||!ownerToken) throw new Error('owner session missing');

  const member=await page.evaluate(async api=>{
    const suffix=Math.random().toString(36).slice(2,8);
    const r=await fetch(api+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'RTCSEC_'+suffix,avatar:'🐺',gender:'male'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(!member.data?.user?.id||!member.data?.access_token) throw new Error('member creation failed: '+JSON.stringify(member));

  const outsider=await page.evaluate(async api=>{
    const suffix=Math.random().toString(36).slice(2,8);
    const r=await fetch(api+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'RTCOUT_'+suffix,avatar:'🦊',gender:'male'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(!outsider.data?.user?.id||!outsider.data?.access_token) throw new Error('outsider creation failed: '+JSON.stringify(outsider));

  const room=await page.evaluate(async api=>{
    const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'};
    const r=await fetch(api+'/rooms',{method:'POST',headers:h,body:JSON.stringify({name:'RTC Sec Smoke'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(room.status!==201||!room.data?.id) throw new Error('room creation failed: '+JSON.stringify(room));

  const rtcConfigBase=API+'/rooms/'+encodeURIComponent(room.data.id)+'/rtc-config';
  const outsiderConfig=await page.evaluate(async ({url,token})=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});return {status:r.status,body:await r.json().catch(()=>null)};},{url:rtcConfigBase,token:outsider.data.access_token});
  if(outsiderConfig.status!==403) throw new Error('non-member RTC config access was not rejected: '+JSON.stringify(outsiderConfig));
  const base=API+'/rooms/'+encodeURIComponent(room.data.id)+'/rtc-signals';
  const outsiderHeaders={Authorization:'Bearer '+outsider.data.access_token,'Content-Type':'application/json'};
  const memberHeaders={Authorization:'Bearer '+member.data.access_token,'Content-Type':'application/json'};

  const beforeJoin=await page.evaluate(async ({base,headers,ownerId})=>{
    const get=await fetch(base,{headers});
    const post=await fetch(base,{method:'POST',headers,body:JSON.stringify({target_id:ownerId,type:'offer',payload:{probe:'outsider'}})});
    return {get:get.status,post:post.status};
  },{base,headers:outsiderHeaders,ownerId:owner.id});
  if(beforeJoin.get!==403||beforeJoin.post!==403) throw new Error('non-member RTC access was not rejected: '+JSON.stringify(beforeJoin));

  const joinMember=await page.evaluate(async ({api,roomId,token})=>{
    const r=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/join',{method:'POST',headers:{Authorization:'Bearer '+token}});
    return r.status;
  },{api:API,roomId:room.data.id,token:member.data.access_token});
  if(![200,201,204].includes(joinMember)) throw new Error('member join failed: '+joinMember);

  const targetValidation=await page.evaluate(async ({base,headers,outsiderId})=>{
    const post=await fetch(base,{method:'POST',headers,body:JSON.stringify({target_id:outsiderId,type:'offer',payload:{probe:'nonmember-target'}})});
    return {status:post.status,body:await post.json().catch(()=>null)};
  },{base,headers:memberHeaders,outsiderId:outsider.data.user.id});
  if(targetValidation.status!==404) throw new Error('non-member RTC target was not rejected: '+JSON.stringify(targetValidation));

  const invalidType=await page.evaluate(async ({base,headers,ownerId})=>{
    const post=await fetch(base,{method:'POST',headers,body:JSON.stringify({target_id:ownerId,type:'bogus',payload:{}})});
    return {status:post.status,body:await post.json().catch(()=>null)};
  },{base,headers:memberHeaders,ownerId:owner.id});
  if(invalidType.status!==422) throw new Error('invalid RTC signal type was not rejected: '+JSON.stringify(invalidType));

  const valid=await page.evaluate(async ({base,headers,ownerId})=>{
    const post=await fetch(base,{method:'POST',headers,body:JSON.stringify({target_id:ownerId,type:'offer',payload:{probe:'security-valid'}})});
    return {status:post.status,body:await post.json().catch(()=>null)};
  },{base,headers:memberHeaders,ownerId:owner.id});
  if(valid.status!==200||valid.body?.queued!==true) throw new Error('valid RTC signal was rejected: '+JSON.stringify(valid));

  const memberConfig=await page.evaluate(async ({url,token})=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});return {status:r.status,body:await r.json().catch(()=>null)};},{url:rtcConfigBase,token:member.data.access_token});
  if(memberConfig.status!==200||!Array.isArray(memberConfig.body?.ice_servers)) throw new Error('member RTC config response invalid: '+JSON.stringify(memberConfig));

  console.log('RTC_SIGNALING_SECURITY_SMOKE_PASS nonmember=403 target=404 invalid-type=422 valid=200');
  await browser.close();
}
main().catch(async e=>{console.error(e.stack||e);process.exit(1);});
