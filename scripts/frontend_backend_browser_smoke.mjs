#!/usr/bin/env node
import { chromium } from 'playwright';

const API='http://127.0.0.1:8000/v1';
const pageUrl='http://127.0.0.1:4175/erischat-main.html';

async function main(){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(api=>{window.ERIS_API=api;},API);
  await page.goto(pageUrl,{waitUntil:'domcontentloaded'});
  const anonymous = await page.evaluate(async api=>{
    const suffix=Math.random().toString(36).slice(2,8);
    const r=await fetch(api+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'Smoke_'+suffix,avatar:'👤',gender:'male'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(anonymous.status!==201&&anonymous.status!==200) throw new Error('anonymous smoke registration failed: '+JSON.stringify(anonymous));
  await page.evaluate(token=>localStorage.setItem('erischat_access_token',token),anonymous.data.access_token);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(async api=>{const r=await fetch(api+"/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname:"Smoke_"+Math.random().toString(36).slice(2,8),avatar:"👤",gender:"male"})});const d=await r.json();if(!d.access_token)throw new Error("anonymous smoke registration failed");localStorage.setItem("erischat_access_token",d.access_token)},API);
  await page.waitForFunction(()=>!!window.ErisAuth?.getToken);
  await page.waitForFunction(()=>!!window.ErisAuth?.user,{timeout:15000}).catch(async()=>{ throw new Error('anonymous auth timeout; token='+await page.evaluate(()=>localStorage.getItem('erischat_access_token')?'present':'missing')+' auth='+await page.evaluate(()=>JSON.stringify({keys:Object.keys(window.ErisAuth||{}),user:window.ErisAuth?.user||null}))); });
  const owner=await page.evaluate(()=>window.ErisAuth.user);
  if(!owner?.id) throw new Error('anonymous browser session missing user');
  const vip=await page.evaluate(async api=>fetch(api+'/me/vip',{headers:{Authorization:'Bearer '+localStorage.getItem('erischat_access_token')}}).then(r=>r.json()),API);
  if(typeof vip.level!=='number'||!Array.isArray(vip.perks)||typeof vip.title!=='string'||typeof vip.neon_enabled!=='boolean') throw new Error('VIP presentation metadata missing: '+JSON.stringify(vip));
  await page.locator('#erisOnboarding').evaluate(el=>el.remove()).catch(()=>{});
  await page.locator('.nav button',{hasText:'Profil'}).click();
  await page.waitForFunction(()=>document.querySelector('#profile')?.classList.contains('show'));
  await page.waitForFunction(expected => document.querySelector('.profile .name h2')?.textContent === expected.nickname, owner);
  await page.waitForSelector('[data-erischat-vip-panel]');
  const vipPanel=await page.evaluate(()=>({title:document.querySelector('[data-vip-title]')?.textContent||'',progress:document.querySelector('[data-vip-progress]')?.textContent||'',badge:document.querySelector('[data-vip-badge]')?.textContent||'',bar:document.querySelector('[data-vip-bar]')?.style.width||''}));
  if(!vipPanel.title||!vipPanel.progress||!vipPanel.bar) throw new Error('Profile VIP panel did not render: '+JSON.stringify(vipPanel));
  const member=await page.evaluate(async api=>{
    const suffix=Math.random().toString(36).slice(2,8);
    const r=await fetch(api+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'Browser_'+suffix,avatar:'🐺',gender:'male'})});
    return r.json();
  },API);
  if(!member?.user?.id||!member?.access_token) throw new Error('second browser user registration failed');
  await page.evaluate(token=>{window.__memberToken=token},member.access_token);
  const dm=await page.evaluate(async ({api,id})=>{
    const r=await fetch(api+'/conversations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('erischat_access_token')},body:JSON.stringify({participant_id:id})});
    return {status:r.status,data:await r.json()};
  },{api:API,id:member.user.id});
  if(dm.status!==201&&dm.status!==200) throw new Error('conversation create failed: '+JSON.stringify(dm));
  const conversationId=dm.data?.id||dm.data?.conversation_id||dm.data?.conversation?.id;
  if(!conversationId) throw new Error('conversation id missing');
  await page.locator('.nav button',{hasText:'Mesaj'}).click();
  await page.evaluate(({id,name})=>window.ErisChatDM.open(id,name,'🐺'),{id:conversationId,name:member.user.nickname});
  await page.waitForSelector('#chat.show');
  await page.locator('#chatInput').fill('browser backend dm smoke');
  await page.locator('#chatInput').press('Enter');
  await page.waitForSelector('#chatBody .bubble.me');
  const dmVisible=await page.locator('#chatBody .bubble.me').count();
  if(dmVisible<1) throw new Error('DM bubble did not render');
  await page.evaluate(()=>{ if(typeof window.closeChat==='function') window.closeChat(); });
  await page.waitForFunction(()=>!document.querySelector('#chat')?.classList.contains('show'));
  const social=await page.evaluate(async ({api,targetId,memberToken,ownerId})=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const follow=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/follow',{method:'POST',headers:h});
    const followers=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/followers',{headers:h}).then(r=>r.json());
    const fans=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/fans',{headers:h}).then(r=>r.json());
    const notifications=await fetch(api+'/me/notifications',{headers:{Authorization:'Bearer '+memberToken}}).then(r=>r.json());
    const following=await fetch(api+'/users/'+encodeURIComponent(ownerId)+'/following',{headers:h}).then(r=>r.json());
    const block=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/block',{method:'POST',headers:h});
    const blocks=await fetch(api+'/me/blocks',{headers:h}).then(r=>r.json());
    const unblock=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/block',{method:'DELETE',headers:h});
    const privacy=await fetch(api+'/me/privacy',{method:'PATCH',headers:h,body:JSON.stringify({hide_vip_badge:true})});
    const privacyBack=await fetch(api+'/me/privacy',{headers:h}).then(r=>r.json());
    const unfollow=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/follow',{method:'DELETE',headers:h});
    return {follow:follow.status,followers,following,fans,notifications,unfollow:unfollow.status,block:block.status,blocks,unblock:unblock.status,privacy:privacy.status,privacyBack};
  },{api:API,targetId:member.user.id,memberToken:member.access_token,ownerId:owner.id});
  if(social.follow!==201||!social.followers.some(x=>x.user_id===owner.id)) throw new Error('follow flow failed: '+JSON.stringify(social));
  if(!social.notifications.some(x=>x.kind==='follow')) throw new Error('follow notification missing: '+JSON.stringify(social));
  if(social.fans?.total < 1 || social.fans?.level < 1) throw new Error('fan profile flow failed: '+JSON.stringify(social));
  if(!social.following.some(x=>x.user_id===member.user.id)||social.unfollow!==200) throw new Error('following/unfollow flow failed: '+JSON.stringify(social));
  if(social.block!==200||!social.blocks.some(x=>x.user_id===member.user.id)||social.unblock!==200) throw new Error('block flow failed: '+JSON.stringify(social));
  if(social.privacy!==200||social.privacyBack?.hide_vip_badge!==true) throw new Error('privacy update failed: '+JSON.stringify(social));
  const notificationRead=await page.evaluate(async ({api,memberToken})=>{
    const token=memberToken;
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const list=await fetch(api+'/me/notifications',{headers:h}).then(r=>r.json());
    const n=(list||[]).find(x=>x.kind==='follow') || (list||[])[0];
    if(!n) return {listStatus:200,readStatus:204,readback:null,skipped:true};
    const rr=await fetch(api+'/me/notifications/'+encodeURIComponent(n.id)+'/read',{method:'POST',headers:h});
    const back=await fetch(api+'/me/notifications',{headers:h}).then(r=>r.json());
    const found=(back||[]).find(x=>x.id===n.id);
    return {listStatus:200,readStatus:rr.status,readback:found?.read,skipped:false};
  },{api:API,memberToken:member.access_token});
  if(notificationRead.readStatus!==200&&notificationRead.readStatus!==204) throw new Error('notification read failed: '+JSON.stringify(notificationRead));
  if(!notificationRead.skipped && notificationRead.readback!==true) throw new Error('notification readback failed: '+JSON.stringify(notificationRead));
  const room=await page.evaluate(async api=>{
    const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'};
    const r=await fetch(api+'/rooms',{method:'POST',headers:h,body:JSON.stringify({name:'Browser UI Room'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(room.status!==201||!room.data?.id) throw new Error('room browser backend create failed: '+JSON.stringify(room));


  const memberRoomJoin=await page.evaluate(async ({api,roomId,memberToken})=>{
    const r=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/join',{method:'POST',headers:{Authorization:'Bearer '+memberToken,'Content-Type':'application/json'}});
    return {status:r.status,data:await r.json().catch(()=>null)};
  },{api:API,roomId:room.data.id,memberToken:member.access_token});
  if(![200,201,204].includes(memberRoomJoin.status)) throw new Error('member room join before realtime smoke failed: '+JSON.stringify(memberRoomJoin));

  const roomChatRealtime=await page.evaluate(async ({roomId,ownerToken,memberToken})=>{
    const wsUrl=token=>'ws://127.0.0.1:8000/ws/rooms/'+encodeURIComponent(roomId)+'?token='+encodeURIComponent(token);
    const openSocket=token=>new Promise((resolve,reject)=>{
      const ws=new WebSocket(wsUrl(token));
      const messages=[];
      const timer=setTimeout(()=>{try{ws.close();}catch{} reject(new Error('room websocket open timeout'));},5000);
      ws.onopen=()=>{clearTimeout(timer);resolve({ws,messages});};
      ws.onerror=()=>{clearTimeout(timer);reject(new Error('room websocket error'));};
      ws.onmessage=e=>{try{messages.push(JSON.parse(e.data));}catch{}};
    });
    const owner=await openSocket(ownerToken);
    const member=await openSocket(memberToken);
    const waitFor=(messages,predicate,timeout=5000)=>new Promise((resolve,reject)=>{
      const start=Date.now();
      const tick=()=>{const found=messages.find(predicate); if(found)return resolve(found); if(Date.now()-start>timeout)return reject(new Error('room websocket message timeout')); setTimeout(tick,25);};
      tick();
    });
    const ownerHistory=await waitFor(owner.messages,m=>m?.type==='room_history');
    const memberHistory=await waitFor(member.messages,m=>m?.type==='room_history');
    const text='browser realtime room chat smoke';
    member.ws.send(JSON.stringify({type:'room_chat',text}));
    const received=await waitFor(owner.messages,m=>m?.type==='room_chat'&&m.text===text);
    const echoed=await waitFor(member.messages,m=>m?.type==='room_chat'&&m.text===text);
    owner.ws.close(); member.ws.close();
    return {ownerHistoryCount:ownerHistory.messages?.length||0,memberHistoryCount:memberHistory.messages?.length||0,received,echoed};
  },{roomId:room.data.id,ownerToken:await page.evaluate(()=>localStorage.getItem('erischat_access_token')),memberToken:member.access_token});
  if(roomChatRealtime.ownerHistoryCount<0||roomChatRealtime.memberHistoryCount<0||roomChatRealtime.received?.text!=='browser realtime room chat smoke'||roomChatRealtime.echoed?.text!=='browser realtime room chat smoke') throw new Error('room realtime chat browser flow failed: '+JSON.stringify(roomChatRealtime));

  const rtcSignalingRealtime=await page.evaluate(async ({roomId,ownerToken,memberToken,ownerId,memberId})=>{
    const wsUrl=token=>'ws://127.0.0.1:8000/ws/rooms/'+encodeURIComponent(roomId)+'?token='+encodeURIComponent(token);
    const open=token=>new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl(token));const messages=[];const timer=setTimeout(()=>{try{ws.close()}catch{}reject(new Error('rtc websocket open timeout'))},5000);ws.onopen=()=>{clearTimeout(timer);resolve({ws,messages})};ws.onerror=()=>{clearTimeout(timer);reject(new Error('rtc websocket error'))};ws.onmessage=e=>{try{messages.push(JSON.parse(e.data))}catch{}}});
    const owner=await open(ownerToken), member=await open(memberToken);
    const wait=(label,arr,pred,timeout=7000)=>new Promise((resolve,reject)=>{const started=Date.now();const tick=()=>{const hit=arr.find(pred);if(hit)return resolve(hit);if(Date.now()-started>timeout)return reject(new Error('rtc '+label+' timeout; buffered='+JSON.stringify(arr.slice(-10))));setTimeout(tick,25)};tick()});
    await wait('owner history',owner.messages,m=>m?.type==='room_history'); await wait('member history',member.messages,m=>m?.type==='room_history');
    const ownerReady=await wait('owner ready',owner.messages,m=>m?.type==='rtc_ready');
    const memberReady=await wait('member ready',member.messages,m=>m?.type==='rtc_ready');
    const resolvedOwnerId=String(ownerReady.user_id||ownerId), resolvedMemberId=String(memberReady.user_id||memberId);
    if(resolvedOwnerId!==String(ownerId)||resolvedMemberId!==String(memberId)) throw new Error('rtc identity mismatch');

    const rtcConfigResponse=await fetch('http://127.0.0.1:8000/v1/rooms/'+encodeURIComponent(roomId)+'/rtc-config',{headers:{Authorization:'Bearer '+ownerToken}});
    if(!rtcConfigResponse.ok) throw new Error('rtc-config request failed: '+rtcConfigResponse.status);
    const rtcConfig=await rtcConfigResponse.json();
    if(!Array.isArray(rtcConfig.ice_servers)) throw new Error('rtc-config missing ice_servers');
    const pcs=new Map();
    const audioCtx=new AudioContext();
    const source=audioCtx.createOscillator();
    const dest=audioCtx.createMediaStreamDestination();
    source.connect(dest); source.start();
    const make=(label)=>{const pc=new RTCPeerConnection({iceServers:rtcConfig.ice_servers});pc.__label=label;pc.__connected=new Promise(resolve=>pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')resolve(true)});return pc};
    const offerPc=make('offer'), answerPc=make('answer');
    pcs.set('offer',offerPc); pcs.set('answer',answerPc);
    const candidateQueues={owner:[],member:[]};
    const applyCandidate=async(pc,queue,candidate)=>{if(!candidate)return;if(pc.remoteDescription)await pc.addIceCandidate(candidate);else queue.push(candidate)};
    member.ws.addEventListener('message',async ev=>{try{const d=JSON.parse(ev.data);if(d?.type==='rtc_ice'&&d.from_user_id===resolvedOwnerId)await applyCandidate(offerPc,candidateQueues.member,d.payload)}catch{}});
    owner.ws.addEventListener('message',async ev=>{try{const d=JSON.parse(ev.data);if(d?.type==='rtc_ice'&&d.from_user_id===resolvedMemberId)await applyCandidate(answerPc,candidateQueues.owner,d.payload)}catch{}});
    offerPc.onicecandidate=e=>{if(e.candidate)member.ws.send(JSON.stringify({type:'rtc_ice',to_user_id:resolvedOwnerId,payload:e.candidate}))};
    answerPc.onicecandidate=e=>{if(e.candidate)owner.ws.send(JSON.stringify({type:'rtc_ice',to_user_id:resolvedMemberId,payload:e.candidate}))};
    offerPc.ontrack=()=>{}; answerPc.ontrack=()=>{};
    dest.stream.getAudioTracks().forEach(t=>offerPc.addTrack(t,dest.stream));
    const offer=await offerPc.createOffer(); await offerPc.setLocalDescription(offer);
    member.ws.send(JSON.stringify({type:'rtc_offer',to_user_id:resolvedOwnerId,payload:offerPc.localDescription}));
    const receivedOffer=await wait('offer',owner.messages,m=>m?.type==='rtc_offer'&&m.from_user_id===resolvedMemberId&&m.payload?.sdp);
    await answerPc.setRemoteDescription(receivedOffer.payload);
    for(const candidate of candidateQueues.owner.splice(0)){try{await answerPc.addIceCandidate(candidate)}catch{}}
    const answer=await answerPc.createAnswer(); await answerPc.setLocalDescription(answer);
    owner.ws.send(JSON.stringify({type:'rtc_answer',to_user_id:resolvedMemberId,payload:answerPc.localDescription}));
    const receivedAnswer=await wait('answer',member.messages,m=>m?.type==='rtc_answer'&&m.from_user_id===resolvedOwnerId&&m.payload?.sdp);
    await offerPc.setRemoteDescription(receivedAnswer.payload);
    for(const candidate of candidateQueues.member.splice(0)){try{await offerPc.addIceCandidate(candidate)}catch{}}
    const connected=await Promise.race([Promise.all([offerPc.__connected,answerPc.__connected]).then(()=>true),new Promise(r=>setTimeout(()=>r(false),7000))]);
    const connectionStates=[offerPc.connectionState,answerPc.connectionState];
    if(!connected||connectionStates.some(x=>x!=='connected')) throw new Error('real RTCPeerConnection did not connect: '+JSON.stringify(connectionStates));
    member.ws.send(JSON.stringify({type:'rtc_leave',to_user_id:resolvedOwnerId,payload:null}));
    const receivedLeave=await wait('leave',owner.messages,m=>m?.type==='rtc_leave'&&m.from_user_id===resolvedMemberId);
    offerPc.close(); answerPc.close(); source.stop(); audioCtx.close(); owner.ws.close(); member.ws.close();
    return {receivedOffer,receivedAnswer,receivedLeave,connectionStates,realPeerConnection:true,iceServerCount:rtcConfig.ice_servers.length};
  },{roomId:room.data.id,ownerToken:await page.evaluate(()=>localStorage.getItem('erischat_access_token')),memberToken:member.access_token,ownerId:String(owner.id),memberId:String(member.user.id)});
  if(!rtcSignalingRealtime.realPeerConnection||rtcSignalingRealtime.connectionStates.some(x=>x!=='connected')||!rtcSignalingRealtime.receivedOffer||!rtcSignalingRealtime.receivedAnswer||!rtcSignalingRealtime.receivedLeave) throw new Error('RTC real browser flow failed: '+JSON.stringify(rtcSignalingRealtime));

  const announcementFlow=await page.evaluate(async ({api,roomId,targetId,memberToken})=>{
    const ownerToken=localStorage.getItem('erischat_access_token');
    const oh={Authorization:'Bearer '+ownerToken,'Content-Type':'application/json'};
    const mh={Authorization:'Bearer '+memberToken,'Content-Type':'application/json'};
    const denied=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements',{method:'POST',headers:mh,body:JSON.stringify({message:'denied announcement'})});
    const created=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements',{method:'POST',headers:oh,body:JSON.stringify({message:'browser announcement'})});
    const row=await created.json();
    const listed=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements',{headers:oh}).then(r=>r.json());
    const edited=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements/'+row.id,{method:'PATCH',headers:oh,body:JSON.stringify({message:'browser announcement edited',pinned:true})});
    const editedData=await edited.json();
    const memberList=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements',{headers:mh}).then(r=>r.json());
    const disabled=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements/'+row.id,{method:'PATCH',headers:oh,body:JSON.stringify({enabled:false})});
    const afterDisable=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements',{headers:oh}).then(r=>r.json());
    const deleted=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/announcements/'+row.id,{method:'DELETE',headers:oh});
    return {denied:denied.status,created:created.status,row,listed,edited:edited.status,editedData,memberList,disabled:disabled.status,afterDisable,deleted:deleted.status};
  },{api:API,roomId:room.data.id,targetId:member.user.id,memberToken:member.access_token});
  if(announcementFlow.denied!==403||announcementFlow.created!==200||!announcementFlow.row?.id||announcementFlow.edited!==200||announcementFlow.editedData?.pinned!==true||!announcementFlow.memberList.some(x=>x.id===announcementFlow.row.id)||announcementFlow.disabled!==200||announcementFlow.afterDisable.some(x=>x.id===announcementFlow.row.id)||announcementFlow.deleted!==200) throw new Error('announcement browser permission/lifecycle flow failed: '+JSON.stringify(announcementFlow));

  const reportFlow=await page.evaluate(async ({api,targetId})=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const r=await fetch(api+'/reports',{method:'POST',headers:h,body:JSON.stringify({target_user_id:targetId,category:'safety',reason:'browser smoke report'})});
    return {status:r.status,data:await r.json()};
  },{api:API,targetId:member.user.id});
  if(reportFlow.status!==201) throw new Error('report flow failed: '+JSON.stringify(reportFlow));
  const reportList=await page.evaluate(async api=>{
    const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token')};
    const r=await fetch(api+'/me/reports',{headers:h});
    return {status:r.status,data:await r.json()};
  },API);
  if(reportList.status!==200||!Array.isArray(reportList.data)||!reportList.data.some(x=>x.id===reportFlow.data.id)) throw new Error('report history endpoint failed: '+JSON.stringify(reportList));

  const cosmeticSurface=await page.evaluate(async api=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const all=await fetch(api+'/cosmetics',{headers:h}).then(r=>r.json());
    const avatars=await fetch(api+'/cosmetics?kind=avatar',{headers:h}).then(r=>r.json());
    const frames=await fetch(api+'/cosmetics?kind=frame',{headers:h}).then(r=>r.json());
    const candidate=(avatars.items||[]).find(x=>!x.vip);
    let purchase=null,apply=null,me=null,vipAfter=null;
    if(candidate){
      purchase=await fetch(api+'/me/cosmetics/purchase',{method:'POST',headers:h,body:JSON.stringify({cosmetic_type:'avatar',asset_key:candidate.asset_key})});
      if(purchase.status===201||purchase.status===200) { vipAfter=await fetch(api+'/me/vip',{headers:h}).then(r=>r.json()); apply=await fetch(api+'/me/cosmetics/apply',{method:'POST',headers:h,body:JSON.stringify({cosmetic_type:'avatar',asset_key:candidate.asset_key})});
      me=await fetch(api+'/me',{headers:h}).then(r=>r.json());
      }
    }
    return {all:(all.items||[]).length,avatars:(avatars.items||[]).length,frames:(frames.items||[]).length,candidate:candidate?.asset_key,purchaseStatus:purchase?.status,purchaseData:purchase?await purchase.clone().json().catch(()=>null):null,vipAfter,applyStatus:apply?.status,avatarAsset:me?.avatar_asset};
  },API);  if(cosmeticSurface.all!==147||cosmeticSurface.avatars<1||cosmeticSurface.frames<1) throw new Error('cosmetic catalog/filter surface failed: '+JSON.stringify(cosmeticSurface));
  if(cosmeticSurface.candidate && cosmeticSurface.purchaseStatus!==200) throw new Error('cosmetic purchase failed: '+JSON.stringify(cosmeticSurface));
  if(cosmeticSurface.candidate && (Number(cosmeticSurface.purchaseData?.total_spent||0)<Number(cosmeticSurface.purchaseData?.spent||0)||Number(cosmeticSurface.vipAfter?.total_spent||0)<Number(cosmeticSurface.purchaseData?.spent||0))) throw new Error('VIP spending progression was not recorded: '+JSON.stringify(cosmeticSurface));
  if(cosmeticSurface.candidate && cosmeticSurface.applyStatus!==200) throw new Error('cosmetic apply failed: '+JSON.stringify(cosmeticSurface));
  if(cosmeticSurface.candidate && cosmeticSurface.avatarAsset!==cosmeticSurface.candidate) throw new Error('profile avatar asset was not applied: '+JSON.stringify(cosmeticSurface));
  await page.evaluate(id => { window.__memberId = id; }, member.user.id);
  const vipPrivacy=await page.evaluate(async api=>{
    const token=localStorage.getItem('erischat_access_token'); const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const mine=await fetch(api+'/me/vip',{headers:h}).then(r=>r.json());
    const publicBefore=await fetch(api+'/users/'+encodeURIComponent(window.__memberId||'')+'/vip',{headers:h});
    const hide=await fetch(api+'/me/privacy',{method:'PATCH',headers:h,body:JSON.stringify({hide_vip_badge:true,hide_vip_neon:true,hide_vip_entry:true,hide_vip_title:true})});
    const privacy=await fetch(api+'/me/privacy',{headers:h}).then(r=>r.json());
    return {mine,publicStatus:publicBefore.status,hide:hide.status,privacy};
  },API);
  if(vipPrivacy.mine?.level===undefined||vipPrivacy.hide!==200||vipPrivacy.privacy?.hide_vip_badge!==true||vipPrivacy.privacy?.hide_vip_neon!==true||vipPrivacy.privacy?.hide_vip_entry!==true||vipPrivacy.privacy?.hide_vip_title!==true) throw new Error('VIP privacy surface failed: '+JSON.stringify(vipPrivacy));
  // REST rtc-signals relay has dedicated security smoke coverage; this end-to-end smoke continues with the canonical RTC config + real WebSocket/RTCPeerConnection path.
  const rtcConfig=await page.evaluate(async ({api,roomId})=>{const r=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/rtc-config',{headers:{Authorization:'Bearer '+localStorage.getItem('erischat_access_token')}});return {status:r.status,data:await r.json()};},{api:API,roomId:room.data.id});
  if(rtcConfig.status!==200||!Array.isArray(rtcConfig.data?.ice_servers)) throw new Error('RTC ICE config endpoint failed: '+JSON.stringify(rtcConfig));

  const giftFlow=await page.evaluate(async ({api,roomId,targetId})=>{
    const ownerToken=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+ownerToken,'Content-Type':'application/json'};
    const jr=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/join',{method:'POST',headers:h});
    const mr=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/join',{method:'POST',headers:{Authorization:'Bearer '+window.__memberToken,'Content-Type':'application/json'}});
    const gr=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/gifts',{method:'POST',headers:h,body:JSON.stringify({recipient_id:targetId,gift_key:'Zeytin Dalı',quantity:1})});
    const notifications=await fetch(api+'/me/notifications',{headers:{Authorization:'Bearer '+window.__memberToken}}).then(r=>r.json());
    const profile=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/profile-gifts',{headers:h}).then(r=>r.json());
    const events=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/gift-events',{headers:h}).then(r=>r.json());
    return {joinOwner:jr.status,joinMember:mr.status,gift:gr.status,giftData:await gr.json(),notifications,profile,events};
  },{api:API,roomId:room.data.id,targetId:member.user.id});
  if(![200,201,204].includes(giftFlow.joinOwner)||![200,201,204].includes(giftFlow.joinMember)) throw new Error('gift flow room join failed: '+JSON.stringify(giftFlow));
  if(giftFlow.gift!==200||!giftFlow.giftData?.gift_key) throw new Error('gift send failed: '+JSON.stringify(giftFlow));
  const roomControls=await page.evaluate(async ({api,roomId,targetId})=>{
    const ownerToken=localStorage.getItem('erischat_access_token'); const h={Authorization:'Bearer '+ownerToken,'Content-Type':'application/json'};
    const join=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/join',{method:'POST',headers:{Authorization:'Bearer '+window.__memberToken}});
    const seat=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/seats/1/join',{method:'POST',headers:{Authorization:'Bearer '+window.__memberToken}});
    const mute=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/seats/1/mute',{method:'POST',headers:h});
    const unmute=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/seats/1/mute',{method:'DELETE',headers:h});
    const lockSeat=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/seats/2/lock',{method:'POST',headers:h});
    const unlockSeat=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/seats/2/lock',{method:'DELETE',headers:h});
    const mod=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/moderators',{method:'POST',headers:h,body:JSON.stringify({user_id:targetId})});
    const mods=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/moderators',{headers:h}).then(r=>r.json());
    const music=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music',{method:'POST',headers:{Authorization:'Bearer '+window.__memberToken,'Content-Type':'application/json'},body:JSON.stringify({title:'Smoke Track',source_url:'https://example.com/smoke.mp3'})});
    const musicData=await music.json();
    const play=musicData?.id?await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music/'+musicData.id+'/playback',{method:'POST',headers:h,body:JSON.stringify({action:'play',position_seconds:3})}):null;
    const playData=play?await play.json():null;
    const secondMusic=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music',{method:'POST',headers:{Authorization:'Bearer '+window.__memberToken,'Content-Type':'application/json'},body:JSON.stringify({title:'Smoke Track 2',source_url:'https://example.com/smoke-2.mp3'})});
    const secondMusicData=await secondMusic.json();
    const secondPlay=secondMusicData?.id?await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music/'+secondMusicData.id+'/playback',{method:'POST',headers:h,body:JSON.stringify({action:'play',position_seconds:1})}):null;
    const musicList=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music',{headers:h}).then(r=>r.json());
    const firstState=musicList.find(x=>x.id===musicData?.id),secondState=musicList.find(x=>x.id===secondMusicData?.id);
    const pause=secondMusicData?.id?await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music/'+secondMusicData.id+'/playback',{method:'POST',headers:{Authorization:'Bearer '+window.__memberToken,'Content-Type':'application/json'},body:JSON.stringify({action:'pause'})}):null;
    const delMusic=null;
    return {join:join.status,seat:seat.status,mute:mute.status,unmute:unmute.status,lockSeat:lockSeat.status,unlockSeat:unlockSeat.status,mod:mod.status,mods,music:music.status,musicData,play:play?.status,playData,secondMusic:secondMusic.status,secondMusicData,secondPlay:secondPlay?.status,firstState,secondState,pause:pause?.status,musicList,delMusic:delMusic?.status};
  },{api:API,roomId:room.data.id,targetId:member.user.id});
  if(![200,201,204].includes(roomControls.join)||!roomControls.seat||roomControls.mute!==200||roomControls.unmute!==200||roomControls.lockSeat!==200||roomControls.unlockSeat!==200) throw new Error('room seat controls failed: '+JSON.stringify(roomControls));
  if(![200,201].includes(roomControls.mod)||!roomControls.mods.some(x=>x.user_id===member.user.id)) throw new Error('room moderator flow failed: '+JSON.stringify(roomControls));
  if(roomControls.music!==200||!roomControls.musicData?.id||roomControls.play!==200||roomControls.secondMusic!==200||!roomControls.secondMusicData?.id||roomControls.secondPlay!==200||roomControls.firstState?.is_playing||!roomControls.secondState?.is_playing||roomControls.pause!==200||Number(roomControls.playData?.position_seconds)!==3||!Array.isArray(roomControls.musicList)) throw new Error('room music queue flow failed: '+JSON.stringify(roomControls));
  const musicUi=await page.evaluate(async ({roomId,musicId})=>{
    window.ErisCurrentRoomId=roomId;
    if(!window.ErisChatMusic?.open) throw new Error('ErisChatMusic.open missing');
    window.ErisChatMusic.open();
    await new Promise(r=>setTimeout(r,50));
    const started=Date.now();
    let row=null;
    while(Date.now()-started<3000){
      row=document.querySelector('#erisMusicList [data-play="'+musicId+'"]');
      if(row) break;
      await new Promise(r=>setTimeout(r,50));
    }
    if(!row) return {panel:false,audio:false,src:'',musicId:'',row:false};
    row.click();
    await new Promise(r=>setTimeout(r,250));
    const a=document.querySelector('audio');
    return {panel:getComputedStyle(document.querySelector('#erisMusicPanel')).display==='flex',audio:!!a,src:a?.src||'',musicId:a?.dataset?.musicId||'',row:true};
  },{roomId:room.data.id,musicId:roomControls.musicData.id});
  if(!musicUi.row||!musicUi.panel||!musicUi.audio||musicUi.musicId!==String(roomControls.musicData.id)||!musicUi.src.includes('example.com/smoke.mp3')) throw new Error('room music HTMLAudio playback binding failed: '+JSON.stringify(musicUi));
  const musicRealtime=await page.evaluate(async ({roomId,musicId,ownerToken,memberToken})=>{
    const url=token=>'ws://127.0.0.1:8000/ws/rooms/'+encodeURIComponent(roomId)+'?token='+encodeURIComponent(token);
    const open=token=>new Promise((resolve,reject)=>{const ws=new WebSocket(url(token));const messages=[];const t=setTimeout(()=>reject(new Error('music websocket open timeout')),5000);ws.onopen=()=>{clearTimeout(t);resolve({ws,messages});};ws.onerror=()=>{clearTimeout(t);reject(new Error('music websocket error'));};ws.onmessage=e=>{try{messages.push(JSON.parse(e.data));}catch{}};});
    const owner=await open(ownerToken); const member=await open(memberToken);
    member.ws.send(JSON.stringify({type:'music_sync',music_id:musicId,action:'seek',position_seconds:17}));
    const sync=await new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{const found=owner.messages.find(x=>x?.type==='music_sync'&&x.music_id===musicId&&x.position_seconds===17);if(found)return resolve(found);if(Date.now()-start>5000)return reject(new Error('music sync timeout'));setTimeout(tick,25);};tick();});
    owner.ws.close(); member.ws.close(); return sync;
  },{roomId:room.data.id,musicId:roomControls.musicData.id,ownerToken:await page.evaluate(()=>localStorage.getItem('erischat_access_token')),memberToken:member.access_token});
  if(musicRealtime?.type!=='music_sync'||Number(musicRealtime.position_seconds)!==17) throw new Error('music realtime sync browser flow failed: '+JSON.stringify(musicRealtime));
  const musicCleanup=await page.evaluate(async ({api,roomId,musicId})=>{const r=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music/'+musicId,{method:'DELETE',headers:{Authorization:'Bearer '+localStorage.getItem('erischat_access_token')}});return r.status;},{api:API,roomId:room.data.id,musicId:roomControls.musicData.id});
  if(musicCleanup!==200) throw new Error('music cleanup failed: '+musicCleanup);
  await page.locator('#musicClose').click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#erisMusicPanel')).display==='none');
  if(!giftFlow.notifications.some(x=>x.kind==='gift')) throw new Error('gift notification missing: '+JSON.stringify(giftFlow.notifications));
  if(!giftFlow.profile.some(x=>x.gift==='Zeytin Dalı')) throw new Error('profile gift history missing: '+JSON.stringify(giftFlow.profile));
  if(!giftFlow.events.some(x=>x.gift_key==='Zeytin Dalı')) throw new Error('gift event history missing: '+JSON.stringify(giftFlow.events));
  const currentUi=await page.evaluate(()=>({
    profile:!!document.querySelector('#profile'),
    shop:!!document.querySelector('#shop'),
    vip:!!document.querySelector('#vip'),
    explore:!!document.querySelector('#explore'),
    nav:document.querySelectorAll('.nav button').length
  }));
  if(!currentUi.profile||!currentUi.shop||!currentUi.vip||!currentUi.explore||currentUi.nav<5) throw new Error('current frontend navigation surface missing: '+JSON.stringify(currentUi));
  await page.locator('.nav button',{hasText:'Mağaza'}).click();
  await page.waitForFunction(()=>document.querySelector('#shop')?.classList.contains('show'));
  await page.locator('.nav button',{hasText:'Profil'}).click();
  await page.waitForFunction(()=>document.querySelector('#profile')?.classList.contains('show'));
  if(errors.length) throw new Error('page errors: '+errors.join(' | '));
  await browser.close();
  console.log('FRONTEND_BACKEND_BROWSER_SMOKE_PASS anonymous=1 profile=1 dm=1 family=1 gifts=1 current_ui=1');
}
main().catch(async e=>{console.error(e.stack||e);process.exit(1);});
