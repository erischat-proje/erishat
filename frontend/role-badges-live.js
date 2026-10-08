(() => {
  'use strict';
  const ROLES=new Set(['DA','SA','UA','FA']);
  const cache=new Map(),queued=new Set();
  let scheduled=false,timer=null,busy=false,epoch=0;
  const idOf=user=>String(typeof user==='object'?user?.user_id||user?.id||'':user||'');
  const normalize=value=>ROLES.has(value)?value:null;
  const atlas=new URL('./role-icons/staff-badges.png?v=staff-20261009',document.baseURI).href;
  const positions={SA:'0% 0%',UA:'100% 0%',FA:'0% 100%',DA:'100% 100%'};
  const style=document.createElement('style');style.id='eris-role-icons-style';
  style.textContent=`
    .eris-role-icon{display:inline-block!important;position:static!important;width:3.4em!important;height:1.7em!important;min-width:3.4em!important;max-width:3.4em!important;flex:0 0 3.4em!important;margin:0 .3em 0 0!important;padding:0!important;vertical-align:middle!important;border:0!important;border-radius:0!important;background-color:transparent!important;background-image:url("${atlas}")!important;background-size:200% 200%!important;background-repeat:no-repeat!important;box-shadow:none!important;pointer-events:none!important}
    .eris-role-icon[data-role=SA]{background-position:0% 0%!important;background-size:200% 196.24%!important}.eris-role-icon[data-role=UA]{background-position:100% 0%!important;background-size:200% 196.24%!important}.eris-role-icon[data-role=FA]{background-position:0% 100%!important;background-size:200% 203.91%!important}.eris-role-icon[data-role=DA]{background-position:100% 100%!important;background-size:200% 203.91%!important}
    .seat-name .eris-role-icon{width:32px!important;height:16px!important;min-width:32px!important;max-width:32px!important;flex-basis:32px!important;margin-right:3px!important}
    .profile .name h2 .eris-role-icon{width:84px!important;height:42px!important;min-width:84px!important;max-width:84px!important;flex-basis:84px!important}
    .eris-mini-name .eris-role-icon{width:64px!important;height:32px!important;min-width:64px!important;max-width:64px!important;flex-basis:64px!important}
    [data-eris-role-user]>.eris-admin-name-badge{display:none!important}
  `;
  document.head.append(style);
  function paint(node,role) {
    if(!node)return;
    const icons=[...node.children].filter(child=>child.classList.contains('eris-role-icon'));
    [...node.children].filter(child=>child.classList.contains('eris-admin-name-badge')).forEach(child=>child.remove());
    if(!role){icons.forEach(child=>child.remove());return;}
    let icon=icons.find(child=>child.dataset.role===role);
    icons.forEach(child=>{if(child!==icon)child.remove();});
    if(!icon){icon=document.createElement('span');icon.className='eris-role-icon';icon.dataset.role=role;icon.setAttribute('role','img');icon.setAttribute('aria-label',role+' yetkilisi');icon.title=role+' yetkilisi';}
    if(node.firstChild!==icon)node.prepend(icon);
  }
  function update(id,role) {
    const previous=cache.get(id);cache.set(id,{role:normalize(role),expires:Date.now()+15000,revision:(previous?.revision||0)+1});
    document.querySelectorAll('[data-eris-role-user]').forEach(node=>{if(node.dataset.erisRoleUser===id)paint(node,normalize(role));});
    if(String(window.ErisAuth?.user?.id)===id)window.ErisAuth.user.admin_role=normalize(role);
  }
  function register(user) {
    const id=idOf(user);
    if(id && !cache.has(id) && Object.prototype.hasOwnProperty.call(user||{},'admin_role'))cache.set(id,{role:normalize(user.admin_role),expires:0,revision:0});
  }
  function request(id) {
    if(!id || !window.ErisPlatform?.api || !window.ErisAuth?.getToken?.())return;
    queued.add(id);if(!timer&&!busy)timer=setTimeout(flush,60);
  }
  async function flush() {
    timer=null;if(busy || !queued.size)return;
    busy=true;const keys=[...queued].slice(0,100);keys.forEach(id=>queued.delete(id));
    const currentEpoch=epoch,revisions=new Map(keys.map(id=>[id,cache.get(id)?.revision||0]));
    try{
      const result=await window.ErisPlatform.api('/role-badges?ids='+encodeURIComponent(keys.join(',')),{timeout:12000});
      if(currentEpoch!==epoch)return;
      keys.forEach(id=>{if((cache.get(id)?.revision||0)===revisions.get(id) && Object.prototype.hasOwnProperty.call(result.badges||{},id))update(id,result.badges[id]);});
    }catch(_){
      // Leave the last confirmed badge intact during a transport failure.
      keys.forEach(id=>{const row=cache.get(id);if(row)row.expires=Date.now()+15000;else cache.set(id,{role:null,expires:Date.now()+15000,revision:0});});
    }finally{busy=false;if(queued.size&&!timer)timer=setTimeout(flush,60);}
  }
  function refresh(node) {
    const id=node.dataset.erisRoleUser;if(!id){paint(node,null);return;}
    const known=cache.get(id);if(known)paint(node,known.role);
    if(!known || known.expires<=Date.now())request(id);
  }
  function bind(node,user) {
    if(!node)return;
    const id=idOf(user);
    if(node.dataset.erisRoleUser!==id){paint(node,null);node.dataset.erisRoleUser=id;}
    register(typeof user==='object'?user:{});
    const known=cache.get(id);if(known)paint(node,known.role);
    if(node.isConnected)refresh(node);
  }
  function scan() {
    scheduled=false;
    const me=window.ErisAuth?.user;
    if(me?.id){bind(document.querySelector('.profile .name h2'),me);document.querySelectorAll('[data-erischat-nickname]').forEach(node=>bind(node,me));}
    document.querySelectorAll('[data-eris-role-user]').forEach(refresh);
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(scan);}}
  function revalidate(){document.querySelectorAll('[data-eris-role-user]').forEach(node=>request(node.dataset.erisRoleUser));}
  new MutationObserver(records=>{
    if(records.some(record=>record.type==='characterData'||record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>!node.classList?.contains('eris-role-icon'))))schedule();
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-eris-role-user']});
  window.ErisRoleBadges={bind,register,refresh:revalidate};
  window.addEventListener('erischat:event',event=>{const data=event.detail;if(data?.type==='role_badge_changed'&&data.user_id)update(String(data.user_id),data.admin_role);});
  window.addEventListener('erischat:ws',event=>{if(event.detail?.state==='open')revalidate();});
  window.addEventListener('erischat:auth',event=>{
    if(event.detail?.state==='logged_out'){epoch++;cache.clear();queued.clear();document.querySelectorAll('[data-eris-role-user]').forEach(node=>paint(node,null));}
    if(event.detail?.user){register(event.detail.user);schedule();revalidate();}
  });
  window.addEventListener('erischat:profile',event=>{register(event.detail);schedule();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){schedule();revalidate();}});
  setInterval(()=>{if(document.visibilityState==='visible'&&window.ErisAuth?.user)revalidate();},15000);
  schedule();
})();
