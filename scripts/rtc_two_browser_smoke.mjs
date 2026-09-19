#!/usr/bin/env node
import { chromium } from 'playwright';

const API='http://127.0.0.1:8000/v1';
const PAGE='http://127.0.0.1:4175/erischat-main.html';

async function main(){
  const browser=await chromium.launch({
    headless:true,
    args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']
  });
  const ctx1=await browser.newContext({permissions:['microphone']});
  const ctx2=await browser.newContext({permissions:['microphone']});
  const p1=await ctx1.newPage();
  const p2=await ctx2.newPage();
  await Promise.all([p1.goto(PAGE,{waitUntil:'domcontentloaded'}),p2.goto(PAGE,{waitUntil:'domcontentloaded'})]);
  await Promise.all([
    p1.waitForFunction(()=>!!window.ErisAuth?.user,{timeout:15000}),
    p2.waitForFunction(()=>!!window.ErisAuth?.user,{timeout:15000})
  ]);
  const owner=await p1.evaluate(()=>({user:window.ErisAuth.user,token:localStorage.getItem('erischat_access_token')}));
  const created=await p1.evaluate(async api=>{
    const s=Math.random().toString(36).slice(2,8);
    const r=await fetch(api+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'RTC2B_'+s,avatar:'🎧',gender:'male'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(!created.data?.user?.id||!created.data?.access_token) throw new Error('second user creation failed: '+JSON.stringify(created));
  await p2.evaluate(token=>localStorage.setItem('erischat_access_token',token),created.data.access_token);
  await p2.reload({waitUntil:'domcontentloaded'});
  await p2.waitForFunction(()=>!!window.ErisAuth?.user,{timeout:15000});
  const member=await p2.evaluate(()=>({user:window.ErisAuth.user,token:localStorage.getItem('erischat_access_token')}));
  if(String(member.user.id)===String(owner.user.id)) throw new Error('two browser users are identical');

  const room=await p1.evaluate(async api=>{
    const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'};
    const r=await fetch(api+'/rooms',{method:'POST',headers:h,body:JSON.stringify({name:'RTC 2B Smoke'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(room.status!==201||!room.data?.id) throw new Error('room create failed: '+JSON.stringify(room));
  const joined=await p2.evaluate(async ({api,id})=>{
    const r=await fetch(api+'/rooms/'+encodeURIComponent(id)+'/join',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('erischat_access_token')}});
    return r.status;
  },{api:API,id:room.data.id});
  if(![200,201,204].includes(joined)) throw new Error('member join failed: '+joined);

  const result=await p1.evaluate(async ({api,roomId,memberId})=>{
    const ownerToken=localStorage.getItem('erischat_access_token');
    const memberToken=window.__rtcMemberToken;
    const headers=t=>({Authorization:'Bearer '+t,'Content-Type':'application/json'});
    const cfg=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/rtc-config',{headers:headers(ownerToken)});
    const config=await cfg.json();
    if(!cfg.ok||!Array.isArray(config.ice_servers)) throw new Error('rtc config failed: '+cfg.status);
    const pc=new RTCPeerConnection({iceServers:config.ice_servers});
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    const offer=await pc.createOffer({offerToReceiveAudio:true});
    await pc.setLocalDescription(offer);
    const send=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/rtc-signals',{method:'POST',headers:headers(ownerToken),body:JSON.stringify({target_id:memberId,type:'offer',payload:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}})});
    if(!send.ok) throw new Error('offer send failed: '+send.status);
    return {iceServers:config.ice_servers.length,offerSent:true};
  },{api:API,roomId:room.data.id,memberId:member.user.id});
  await p2.evaluate(token=>window.__rtcMemberToken=token,member.token);
  const memberResult=await p2.evaluate(async ({api,roomId,ownerId})=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const started=Date.now(); let offer=null;
    while(Date.now()-started<7000){
      const r=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/rtc-signals',{headers:h});
      const rows=await r.json();
      offer=rows.find(x=>x.type==='offer'&&String(x.sender_id)===String(ownerId));
      if(offer) break;
      await new Promise(r=>setTimeout(r,100));
    }
    if(!offer) throw new Error('offer was not delivered to second browser');
    const cfg=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/rtc-config',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
    const pc=new RTCPeerConnection({iceServers:cfg.ice_servers||[]});
    let remoteTrack=false;
    pc.ontrack=()=>{remoteTrack=true};
    await pc.setRemoteDescription(offer.payload);
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const sent=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/rtc-signals',{method:'POST',headers:h,body:JSON.stringify({target_id:ownerId,type:'answer',payload:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}})});
    if(!sent.ok) throw new Error('answer send failed: '+sent.status);
    return {answerSent:true,remoteTrackInitially:remoteTrack};
  },{api:API,roomId:room.data.id,ownerId:owner.user.id});
  const ownerFinal=await p1.evaluate(async ({api,roomId,memberId})=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token};
    const started=Date.now(); let answer=null;
    while(Date.now()-started<7000){
      const r=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/rtc-signals',{headers:h});
      const rows=await r.json();
      answer=rows.find(x=>x.type==='answer'&&String(x.sender_id)===String(memberId));
      if(answer) break;
      await new Promise(r=>setTimeout(r,100));
    }
    if(!answer) throw new Error('answer was not delivered to first browser');
    return answer;
  },{api:API,roomId:room.data.id,memberId:member.user.id});

  await p1.evaluate(({answer})=>window.__rtcAnswer=answer,{answer:ownerFinal});
  const connected=await p1.evaluate(async ()=>{
    const pc=window.__rtcLastPc;
    if(!pc) return false;
    await pc.setRemoteDescription(window.__rtcAnswer.payload);
    return await new Promise(resolve=>{
      if(pc.connectionState==='connected') return resolve(true);
      const t=setTimeout(()=>resolve(false),7000);
      pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='connected'){clearTimeout(t);resolve(true)}});
    });
  });
  if(!connected) throw new Error('two-browser RTCPeerConnection did not reach connected state');

  await browser.close();
  console.log('REAL_2_BROWSER_WEBRTC_PASS offer=1 answer=1 connected=1 fake_microphone=1');
}
main().catch(async e=>{console.error(e.stack||e);process.exit(1);});
