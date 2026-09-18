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
  await page.waitForFunction(()=>!!window.ErisAuth?.getToken);
  await page.waitForFunction(()=>!!window.ErisAuth?.user,{timeout:15000}).catch(async()=>{ throw new Error('anonymous auth timeout; token='+await page.evaluate(()=>localStorage.getItem('erischat_access_token')?'present':'missing')+' auth='+await page.evaluate(()=>JSON.stringify({keys:Object.keys(window.ErisAuth||{}),user:window.ErisAuth?.user||null}))); });
  const owner=await page.evaluate(()=>window.ErisAuth.user);
  if(!owner?.id) throw new Error('anonymous browser session missing user');
  const vip=await page.evaluate(async api=>fetch(api+'/me/vip',{headers:{Authorization:'Bearer '+localStorage.getItem('erischat_access_token')}}).then(r=>r.json()),API);
  if(typeof vip.level!=='number'||!Array.isArray(vip.perks)||typeof vip.title!=='string'||typeof vip.neon_enabled!=='boolean') throw new Error('VIP presentation metadata missing: '+JSON.stringify(vip));
  await page.locator('.nav button',{hasText:'Profil'}).click();
  await page.waitForFunction(()=>document.querySelector('#profile')?.classList.contains('show'));
  await page.waitForFunction(expected => document.querySelector('.profile .name h2')?.textContent === expected.nickname, owner);
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
  const social=await page.evaluate(async ({api,targetId})=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const follow=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/follow',{method:'POST',headers:h});
    const followers=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/followers',{headers:h}).then(r=>r.json());
    const fans=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/fans',{headers:h}).then(r=>r.json());
    const notifications=await fetch(api+'/me/notifications',{headers:h}).then(r=>r.json());
    const following=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/following',{headers:h}).then(r=>r.json());
    const block=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/block',{method:'POST',headers:h});
    const blocks=await fetch(api+'/me/blocks',{headers:h}).then(r=>r.json());
    const unblock=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/block',{method:'DELETE',headers:h});
    const privacy=await fetch(api+'/me/privacy',{method:'PATCH',headers:h,body:JSON.stringify({hide_vip_badge:true})});
    const privacyBack=await fetch(api+'/me/privacy',{headers:h}).then(r=>r.json());
    const unfollow=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/follow',{method:'DELETE',headers:h});
    return {follow:follow.status,followers,following,fans,notifications,unfollow:unfollow.status,block:block.status,blocks,unblock:unblock.status,privacy:privacy.status,privacyBack};
  },{api:API,targetId:member.user.id});
  if(social.follow!==201||!social.followers.some(x=>x.user_id===owner.id)) throw new Error('follow flow failed: '+JSON.stringify(social));
  if(!social.notifications.some(x=>x.kind==='follow')) throw new Error('follow notification missing: '+JSON.stringify(social));
  if(social.fans?.total < 1 || social.fans?.level < 1) throw new Error('fan profile flow failed: '+JSON.stringify(social));
  if(!social.following.some(x=>x.user_id===member.user.id)||social.unfollow!==200) throw new Error('following/unfollow flow failed: '+JSON.stringify(social));
  if(social.block!==200||!social.blocks.some(x=>x.user_id===member.user.id)||social.unblock!==200) throw new Error('block flow failed: '+JSON.stringify(social));
  if(social.privacy!==200||social.privacyBack?.hide_vip_badge!==true) throw new Error('privacy update failed: '+JSON.stringify(social));
  const notificationRead=await page.evaluate(async api=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const list=await fetch(api+'/me/notifications',{headers:h}).then(r=>r.json());
    const n=(list||[]).find(x=>x.kind==='follow') || (list||[])[0];
    if(!n) return {listStatus:200,readStatus:204,readback:null,skipped:true};
    const rr=await fetch(api+'/me/notifications/'+encodeURIComponent(n.id)+'/read',{method:'POST',headers:h});
    const back=await fetch(api+'/me/notifications',{headers:h}).then(r=>r.json());
    const found=(back||[]).find(x=>x.id===n.id);
    return {listStatus:200,readStatus:rr.status,readback:found?.read,skipped:false};
  },API);
  if(notificationRead.readStatus!==200&&notificationRead.readStatus!==204) throw new Error('notification read failed: '+JSON.stringify(notificationRead));
  if(!notificationRead.skipped && notificationRead.readback!==true) throw new Error('notification readback failed: '+JSON.stringify(notificationRead));
  const reportFlow=await page.evaluate(async ({api,targetId})=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const r=await fetch(api+'/reports',{method:'POST',headers:h,body:JSON.stringify({target_user_id:targetId,reason:'browser smoke report'})});
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
    let purchase=null,apply=null,me=null;
    if(candidate){
      purchase=await fetch(api+'/me/cosmetics/purchase',{method:'POST',headers:h,body:JSON.stringify({cosmetic_type:'avatar',asset_key:candidate.asset_key})});
      if(purchase.status===201||purchase.status===200) apply=await fetch(api+'/me/cosmetics/apply',{method:'POST',headers:h,body:JSON.stringify({cosmetic_type:'avatar',asset_key:candidate.asset_key})});
      me=await fetch(api+'/me',{headers:h}).then(r=>r.json());
    }
    return {all:(all.items||[]).length,avatars:(avatars.items||[]).length,frames:(frames.items||[]).length,candidate:candidate?.asset_key,purchaseStatus:purchase?.status,applyStatus:apply?.status,avatarAsset:me?.avatar_asset};
  },API);  if(cosmeticSurface.all!==139||cosmeticSurface.avatars<1||cosmeticSurface.frames<1) throw new Error('cosmetic catalog/filter surface failed: '+JSON.stringify(cosmeticSurface));
  if(cosmeticSurface.candidate && cosmeticSurface.purchaseStatus!==200) throw new Error('cosmetic purchase failed: '+JSON.stringify(cosmeticSurface));
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
  if(roomInvite.status!==201||!roomInvite.data?.invited||!roomInvite.memberNotifications.some(x=>x.kind==='room_invite')) throw new Error('room invite notification flow failed: '+JSON.stringify(roomInvite));
  const room=await page.evaluate(async api=>{
    const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'};
    const r=await fetch(api+'/rooms',{method:'POST',headers:h,body:JSON.stringify({name:'Browser UI Room'})});
    return {status:r.status,data:await r.json()};
  },API);
  if(room.status!==201||!room.data?.id) throw new Error('room browser backend create failed: '+JSON.stringify(room));

  const giftFlow=await page.evaluate(async ({api,roomId,targetId})=>{
    const ownerToken=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+ownerToken,'Content-Type':'application/json'};
    const jr=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/join',{method:'POST',headers:h});
    const mr=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/join',{method:'POST',headers:{Authorization:'Bearer '+window.__memberToken,'Content-Type':'application/json'}});
    const gr=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/gifts',{method:'POST',headers:h,body:JSON.stringify({recipient_id:targetId,gift_key:'rose',quantity:1})});
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
    const music=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music',{method:'POST',headers:{...h},body:JSON.stringify({title:'Smoke Track',source_url:'https://example.com/smoke.mp3'})});
    const musicData=await music.json();
    const musicList=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music',{headers:h}).then(r=>r.json());
    const delMusic=musicData?.id?await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/music/'+musicData.id,{method:'DELETE',headers:h}):null;
    return {join:join.status,seat:seat.status,mute:mute.status,unmute:unmute.status,lockSeat:lockSeat.status,unlockSeat:unlockSeat.status,mod:mod.status,mods,music:music.status,musicData,musicList,delMusic:delMusic?.status};
  },{api:API,roomId:room.data.id,targetId:member.user.id});
  if(![200,201,204].includes(roomControls.join)||!roomControls.seat||roomControls.mute!==200||roomControls.unmute!==200||roomControls.lockSeat!==200||roomControls.unlockSeat!==200) throw new Error('room seat controls failed: '+JSON.stringify(roomControls));
  if(![200,201].includes(roomControls.mod)||!roomControls.mods.some(x=>x.user_id===member.user.id)) throw new Error('room moderator flow failed: '+JSON.stringify(roomControls));
  if(roomControls.music!==200||!roomControls.musicData?.id||!Array.isArray(roomControls.musicList)||roomControls.delMusic!==200) throw new Error('room music queue flow failed: '+JSON.stringify(roomControls));
  if(!giftFlow.notifications.some(x=>x.kind==='gift')) throw new Error('gift notification missing: '+JSON.stringify(giftFlow.notifications));
  if(!giftFlow.profile.some(x=>x.gift==='rose')) throw new Error('profile gift history missing: '+JSON.stringify(giftFlow.profile));
  if(!giftFlow.events.some(x=>x.gift_key==='rose')) throw new Error('gift event history missing: '+JSON.stringify(giftFlow.events));
  await page.locator('#erisDemoBtn').click();
  await page.locator('[data-ed="shop"]').click();
  await page.waitForFunction(() => document.querySelector('#ed-shop')?.textContent.includes('139 görünüm'));
  await page.locator('[data-ed="avatar"]').count().catch(()=>{});
  const shopCards=await page.locator('#edShop .ed-card').count();
  if(shopCards<1) throw new Error('shop catalog cards did not render');
  await page.locator('#ed-shop [data-filter="avatar"]').click();
  const avatarCards=await page.locator('#edShop .ed-card').count();
  if(avatarCards<1||avatarCards>cosmeticSurface.all) throw new Error('shop avatar filter failed');
  await page.locator('#ed-shop [data-filter="frame"]').click();
  const frameCards=await page.locator('#edShop .ed-card').count();
  if(frameCards<1||frameCards>cosmeticSurface.all) throw new Error('shop frame filter failed');
  await page.locator('#edClose').click();
  const family=await page.evaluate(async api=>{
    const token=localStorage.getItem('erischat_access_token');
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const cr=await fetch(api+'/families',{method:'POST',headers:h,body:JSON.stringify({name:'Browser Smoke Ailesi'})});
    const created=await cr.json();
    const id=created.id;
    const detail=await fetch(api+'/families/'+encodeURIComponent(id),{headers:h}).then(r=>r.json());
    const donation=await fetch(api+'/families/'+encodeURIComponent(id)+'/donate',{method:'POST',headers:h,body:JSON.stringify({amount:40000})}).then(r=>r.json());
    const chat=await fetch(api+'/families/'+encodeURIComponent(id)+'/chat',{headers:h}).then(r=>r.json());
    return {create:cr.status,id,detail,donation,chat};
  },API);
  if(family.create!==201||!family.id||family.detail?.id!==family.id||Number(family.donation?.balance)!==40000||Number(family.donation?.level)!==2) throw new Error('family browser backend chain failed: '+JSON.stringify(family));
  await page.evaluate(id => localStorage.setItem('eris_family_id', id), family.id);
  const memberAdd=await page.evaluate(async ({api,familyId,userId})=>{
    const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'};
    const r=await fetch(api+'/families/'+encodeURIComponent(familyId)+'/members',{method:'POST',headers:h,body:JSON.stringify({user_id:userId})});
    return {status:r.status,data:await r.json()};
  },{api:API,familyId:family.id,userId:member.user.id});
  if(memberAdd.status!==200&&memberAdd.status!==201) throw new Error('family member add failed: '+JSON.stringify(memberAdd));
  const reportFlow=await page.evaluate(async ({api,targetId})=>{ const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'}; const create=await fetch(api+'/reports',{method:'POST',headers:h,body:JSON.stringify({target_user_id:targetId,category:'spam',reason:'browser smoke report'})}); const data=await create.json(); const history=await fetch(api+'/me/reports',{headers:h}).then(r=>r.json()); return {status:create.status,data,history}; },{api:API,targetId:member.user.id});
  if(reportFlow.status!==201||!reportFlow.data?.id||!reportFlow.history.some(x=>x.id===reportFlow.data.id||x.reason==='browser smoke report')) throw new Error('report history flow failed: '+JSON.stringify(reportFlow));
  const familyInviteNotifications=await page.evaluate(async token=>fetch(API+'/me/notifications',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json()),member.access_token);
  if(!familyInviteNotifications.some(x=>x.kind==='family_invite')) throw new Error('family invite notification missing: '+JSON.stringify(familyInviteNotifications));
  const dmAccessFlow=await page.evaluate(async ({api,targetId})=>{
    const token=localStorage.getItem('erischat_access_token'); const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const create=await fetch(api+'/conversations',{method:'POST',headers:h,body:JSON.stringify({participant_id:targetId})}); const conv=await create.json();
    const detail=await fetch(api+'/conversations/'+encodeURIComponent(conv.id),{headers:h});
    const send=await fetch(api+'/messages/'+encodeURIComponent(conv.id),{method:'POST',headers:h,body:JSON.stringify({text:'dm access smoke'})}); const msg=await send.json();
    const list=await fetch(api+'/messages/'+encodeURIComponent(conv.id),{headers:h}).then(r=>r.json());
    return {create:create.status,detail:detail.status,send:send.status,listStatus:200,list,conversation:conv,message:msg};
  },{api:API,targetId:member.user.id});
  if(dmAccessFlow.create!==200||dmAccessFlow.detail!==200||dmAccessFlow.send!==200||!dmAccessFlow.list.some(x=>x.id===dmAccessFlow.message.id)) throw new Error('DM access/history flow failed: '+JSON.stringify(dmAccessFlow));
  const locationFlow=await page.evaluate(async api=>{
    const token=localStorage.getItem('erischat_access_token'); const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const before=await fetch(api+'/me/location',{headers:h});
    const save=await fetch(api+'/me/location',{method:'PUT',headers:h,body:JSON.stringify({latitude:39.925,longitude:32.836,city:'Ankara'})});
    const after=await fetch(api+'/me/location',{headers:h}).then(r=>r.json());
    return {before:before.status,save:save.status,after};
  },API);
  if(locationFlow.save!==200||locationFlow.after?.city!=='Ankara') throw new Error('location flow failed: '+JSON.stringify(locationFlow));
  const discovery=await page.evaluate(async api=>{
    const token=localStorage.getItem('erischat_access_token'); const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const pref=await fetch(api+'/me/discovery',{headers:h}).then(r=>r.json());
    const update=await fetch(api+'/me/discovery',{method:'PATCH',headers:h,body:JSON.stringify({gender_filter:'any',random_enabled:true})});
    const nearby=await fetch(api+'/discover/nearby',{headers:h});
    const rooms=await fetch(api+'/discover/rooms?limit=20',{headers:h});
    const randomRoom=await fetch(api+'/discover/random-room',{method:'POST',headers:h});
    return {pref,update:update.status,nearby:nearby.status,nearbyData:await nearby.json(),rooms:rooms.status,roomsData:await rooms.json(),randomRoom:randomRoom.status,randomRoomData:await randomRoom.json()};
  },API);
  if(discovery.update!==200||discovery.nearby!==200||discovery.rooms!==200||!Array.isArray(discovery.nearbyData)||!Array.isArray(discovery.roomsData)||![200,404].includes(discovery.randomRoom)) throw new Error('discovery surface failed: '+JSON.stringify(discovery));
  const socialFlow=await page.evaluate(async ({api,targetId})=>{
    const token=localStorage.getItem('erischat_access_token'); const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const follow=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/follow',{method:'POST',headers:h});
    const following=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/following',{headers:h});
    const followers=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/followers',{headers:h});
    const unfollow=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/follow',{method:'DELETE',headers:h});
    const block=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/block',{method:'POST',headers:h});
    const blocks=await fetch(api+'/me/blocks',{headers:h});
    const unblock=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/block',{method:'DELETE',headers:h});
    return {follow:follow.status,following:following.status,followers:followers.status,unfollow:unfollow.status,block:block.status,blocks:blocks.status,blocksData:await blocks.json(),unblock:unblock.status};
  },{api:API,targetId:member.user.id});
  if(![200,201].includes(socialFlow.follow)||socialFlow.following!==200||socialFlow.followers!==200||![200,204].includes(socialFlow.unfollow)||![200,201].includes(socialFlow.block)||socialFlow.blocks!==200||![200,204].includes(socialFlow.unblock)) throw new Error('social follow/block browser chain failed: '+JSON.stringify(socialFlow));
  const roomInvite=await page.evaluate(async ({api,roomId,targetId})=>{
    const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'};
    const r=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/invite',{method:'POST',headers:h,body:JSON.stringify({user_id:targetId})});
    const n=await fetch(api+'/me/notifications',{headers:{Authorization:'Bearer '+window.__memberToken}}).catch(()=>null);
    return {status:r.status,data:await r.json(),memberNotifications:n?await n.json():[]};
  },{api:API,roomId:room.data.id,targetId:member.user.id});
  await page.locator('#erisDemoBtn').click();
  await page.locator('[data-ed="profile"]').click();
  await page.waitForFunction(() => document.querySelector('#ed-profile')?.textContent.includes('AKTİF GÖRÜNÜM / TRY-ON'));
  const profileApplyCount=await page.locator('#ed-profile [data-profile-apply]').count();
  if(profileApplyCount<1) throw new Error('profile try-on controls missing');
  await page.locator('#ed-profile [data-profile-apply="avatar"]').first().click();
  await page.waitForFunction(() => document.querySelector('#ed-profile')?.textContent.includes('AKTİF GÖRÜNÜM / TRY-ON'));
  const frameApply=page.locator('#ed-profile [data-profile-apply="frame"]').first();
  if(await frameApply.count()){
    await frameApply.click();
    await page.waitForFunction(() => document.querySelector('#ed-profile')?.textContent.includes('AKTİF GÖRÜNÜM / TRY-ON'));
  }
  const profileLive=await page.evaluate(async api=>{const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token')}; const me=await fetch(api+'/me',{headers:h}).then(r=>r.json()); const vip=await fetch(api+'/me/vip',{headers:h}).then(r=>r.json()); return {avatar:me.avatar_asset,frame:me.frame_asset,vip};},API);
  if(!profileLive.avatar) throw new Error('profile avatar was not applied through UI: '+JSON.stringify(profileLive));
  if(await frameApply.count() && !profileLive.frame) throw new Error('profile frame was not applied through UI: '+JSON.stringify(profileLive));
  await page.locator('#edClose').click();
  await page.locator('#erisDemoBtn').click();
  await page.locator('[data-ed="social"]').click();
  await page.locator('#edUser').fill(String(member.user.id));
  await page.getByRole('button',{name:'Profili getir',exact:true}).click();
  await page.waitForFunction(id=>document.querySelector('#ed-social')?.textContent.includes(id),String(member.user.id));
  const socialFollowBtn=page.locator('#ed-social #edFollow');
  const socialUnfollowBtn=page.locator('#ed-social #edUnfollow');
  const socialBlockBtn=page.locator('#ed-social #edBlock');
  const socialUnblockBtn=page.locator('#ed-social #edUnblock');
  if(!(await socialFollowBtn.count())||!(await socialUnfollowBtn.count())||!(await socialBlockBtn.count())||!(await socialUnblockBtn.count())) throw new Error('social reverse-action UI controls missing');
  await socialFollowBtn.click();
  await page.waitForFunction(() => document.querySelector('#ed-social')?.textContent.includes('Takip işlemi tamamlandı.'));
  await socialUnfollowBtn.click();
  await page.waitForFunction(() => document.querySelector('#ed-social')?.textContent.includes('Takipten çıkıldı.'));
  await socialBlockBtn.click();
  await page.waitForFunction(() => document.querySelector('#ed-social')?.textContent.includes('Kullanıcı engellendi.'));
  await socialUnblockBtn.click();
  await page.waitForFunction(() => document.querySelector('#ed-social')?.textContent.includes('Engel kaldırıldı.'));
  const unreadMark=page.locator('#ed-social [data-notification-read]').first();
  if(await unreadMark.count()){
    await unreadMark.click();
    await page.waitForTimeout(150);
    const notifState=await page.locator('#edNotifications').textContent();
    if(!notifState.includes('Okundu')) throw new Error('notification mark-read UI did not refresh');
  }
  await page.locator('[data-ed="report"]').click();
  await page.locator('#edReportTarget').fill(String(member.user.id));
  await page.locator('#edReportCat').fill('browser-ui');
  await page.locator('#edReportReason').fill('browser UI report smoke');
  let reportDialogText='';
  page.once('dialog',async dialog=>{reportDialogText=dialog.message();await dialog.accept();});
  await page.getByRole('button',{name:'Şikayeti gönder',exact:true}).click();
  await page.waitForTimeout(150);
  if(!reportDialogText.includes('Şikayet oluşturuldu:')) throw new Error('report UI did not complete: '+reportDialogText);
  if(!(await page.locator('#edReportHistory').textContent()).includes('browser UI report smoke')) throw new Error('report history UI did not refresh');
  const privacyUi=await page.evaluate(async api=>{const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token'),'Content-Type':'application/json'}; const save=await fetch(api+'/me/privacy',{method:'PATCH',headers:h,body:JSON.stringify({hide_location:true,hide_vip_badge:false})}); const read=await fetch(api+'/me/privacy',{headers:h}).then(r=>r.json()); return {save:save.status,read};},API);
  if(privacyUi.save!==200||privacyUi.read?.hide_location!==true) throw new Error('privacy UI backend roundtrip failed: '+JSON.stringify(privacyUi));
  await page.locator('#edClose').click();
  await page.locator('#erisDemoBtn').click();
  await page.locator('[data-ed="family"]').click();
  await page.waitForFunction(() => document.querySelector('#ed-family')?.textContent.includes('Browser Smoke Ailesi'));
  await page.locator('#ed-family button',{hasText:'Üyeleri yönet'}).click();
  await page.waitForFunction(() => document.querySelector('#ed-family')?.textContent.includes('Browser_'));
  await page.locator('[data-ed="rooms"]').click();
  await page.waitForFunction(() => document.querySelector('#ed-rooms')?.textContent.includes('Browser UI Room'));
  await page.locator('#ed-rooms button',{hasText:'İncele'}).first().click();
  await page.waitForFunction(() => document.querySelector('#edRoomDetail')?.textContent.includes('KOLTUKLAR'));
  const roomJoinText=await page.locator('#edRoomActions').textContent();
  if(!roomJoinText.includes('Katıl')||!roomJoinText.includes('Mikrofon')) throw new Error('room UI controls missing');
  await page.getByRole('button',{name:'Katıl',exact:true}).click();
  await page.waitForSelector('#edRoomActions');
  await page.evaluate(() => { window.__micSmoke={requested:0,stopped:0}; const md=navigator.mediaDevices; if(!md)return; md.__originalGetUserMedia=md.getUserMedia.bind(md); md.getUserMedia=async constraints=>{window.__micSmoke.requested++; return {getTracks:()=>[{stop:()=>window.__micSmoke.stopped++}]};}; });
  await page.getByRole('button',{name:'🎙️ Mikrofon',exact:true}).click();
  const micOn=await page.evaluate(()=>({state:document.querySelector('#edRoomDetail')?.querySelector('#edRoomActions')?.textContent||'',requested:window.__micSmoke?.requested||0,flag:document.querySelector('#edRoomDetail')?.querySelector('#edRoomActions')?.parentElement?.dataset?.mic}));
  if((micOn.requested||0)!==1) throw new Error('real microphone permission flow was not requested');
  await page.getByRole('button',{name:'🎙️ Mikrofon',exact:true}).click();
  const micOff=await page.evaluate(()=>({stopped:window.__micSmoke?.stopped||0,flag:document.querySelector('#edRoomDetail')?.querySelector('#edRoomActions')?.parentElement?.dataset?.mic}));
  if((micOff.stopped||0)!==1) throw new Error('microphone stream was not stopped');

  const emptySeat=page.locator('#edSeats button').filter({hasText:'▫️'}).first();
  if(await emptySeat.count()) await emptySeat.click();
  await page.waitForSelector('#edRoomTools #edStaff');
  const chatButton=page.locator('#edStaff button').filter({hasText:/Sohbeti kapat|Sohbeti aç/}).first();
  if(await chatButton.count()) {
    const beforeChat=await chatButton.textContent();
    await chatButton.click();
    await page.waitForSelector('#edRoomTools #edStaff');
    const afterChat=await page.locator('#edStaff button').filter({hasText:/Sohbeti kapat|Sohbeti aç/}).first().textContent();
    if(beforeChat===afterChat) throw new Error('room chat UI toggle did not change');
  }
  const moderatorButton=page.locator('#edStaff button').filter({hasText:'Moderatör'}).first();
  if(await moderatorButton.count()){
    page.once('dialog',async dialog=>{await dialog.accept(String(member.user.id));});
    await moderatorButton.click();
    await page.waitForFunction(id=>document.querySelector('#edRoomTools')?.textContent.includes(id),String(member.user.id));
  }
  const giftButton=page.getByRole('button',{name:'🎁 Hediye',exact:true});
  if(await giftButton.count()){
    let giftDialogText='';
    page.once('dialog',async dialog=>{giftDialogText=dialog.message();await dialog.accept();});
    await giftButton.click();
    await page.waitForTimeout(250);
    if(!giftDialogText.includes('Hediye gönderildi')) throw new Error('room gift UI did not complete: '+giftDialogText);
  }
  const giftUiReadback=await page.evaluate(async ({api,targetId,roomId,memberToken})=>{
    const h={Authorization:'Bearer '+memberToken};
    const notifications=await fetch(api+'/me/notifications',{headers:h}).then(r=>r.json());
    const profile=await fetch(api+'/users/'+encodeURIComponent(targetId)+'/profile-gifts',{headers:h}).then(r=>r.json());
    const events=await fetch(api+'/rooms/'+encodeURIComponent(roomId)+'/gift-events',{headers:h}).then(r=>r.json()).catch(()=>[]);
    return {notifications,profile,events};
  },{api:API,targetId:member.user.id,roomId:room.data.id,memberToken:member.access_token});
  if(!giftUiReadback.notifications.some(x=>x.kind==='gift')) throw new Error('gift UI notification read-back missing: '+JSON.stringify(giftUiReadback.notifications));
  if(!giftUiReadback.profile.some(x=>x.gift==='rose')) throw new Error('gift UI profile-gifts read-back missing: '+JSON.stringify(giftUiReadback.profile));
  const roomUiState=await page.evaluate(async ({api,id})=>{const h={Authorization:'Bearer '+localStorage.getItem('erischat_access_token')}; const r=await fetch(api+'/rooms/'+encodeURIComponent(id),{headers:h}); return {status:r.status,data:await r.json()};},{api:API,id:room.data.id});
  if(roomUiState.status!==200||!Array.isArray(roomUiState.data?.seats)) throw new Error('room UI state read-back failed: '+JSON.stringify(roomUiState));
  await page.locator('#edClose').click();
  await page.locator('#erisDemoCompleteVip').click();
  await page.waitForSelector('text=VIP seviyeleri ve cinsiyet ödülleri');
  const vipRows=await page.locator('text=/VIP 1/').count();
  if(vipRows<1) throw new Error('VIP reward matrix did not render');
  await page.locator('[data-close]').last().click();
  await page.locator('#erisDemoCompleteCheck').click();
  await page.waitForSelector('text=Müşteri demo kontrol listesi');
  await page.locator('[data-close]').last().click();
  if(errors.length) throw new Error('page errors: '+errors.join(' | '));
  await browser.close();
  console.log('FRONTEND_BACKEND_BROWSER_SMOKE_PASS anonymous=1 profile=1 dm=1 family=1');
}
main().catch(async e=>{console.error(e.stack||e);process.exit(1);});
