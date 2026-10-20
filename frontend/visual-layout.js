/* Shared artwork geometry: text owns the size; decoration never owns a hit target. */
(() => {
  'use strict';
  const metadata=new Map(),pending=new Map(),mounted=new Set();
  const base=new URL('.',document.currentScript?.src||location.href);
  const clean=value=>{try{return decodeURIComponent(new URL(value,document.baseURI).pathname).replace(/^.*?(?=(?:vip-assets|vip-designs|shop-expansion|shop-premium-v2|shop-lydia-premium|shop-lydia|relationship-assets)\/)/,'').replace(/^\//,'')}catch{return String(value||'').split(/[?#]/)[0].replace(/^\.\//,'')}};
  const manifest=fetch(new URL('visual-layout.json?v=shop-fit-20261020',base),{signal:window.AbortSignal?.timeout?.(6000)}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{for(const [key,value] of Object.entries(data.assets||{}))metadata.set(key,value)}).catch(()=>{});
  const url=key=>window.ErisChatCosmetics?.assetUrl?.(key)||new URL(key,base).href;
  async function describe(key){
    if(!key)return null;
    const path=clean(key),premium=window.ErisLidyaPremium?.describe(path),shop=window.ErisShopArt?.describe(path);
    if(premium||shop)return premium||shop;
    await manifest;
    if(pending.has(path))return pending.get(path);
    const known=metadata.get(path);
    const result=new Promise(resolve=>{
      const image=new Image();let done=false;
      const finish=value=>{if(done)return;done=true;clearTimeout(timer);if(!value)pending.delete(path);resolve(value)};
      const timer=setTimeout(()=>finish(known||null),6000);
      image.onload=()=>{
        const width=image.naturalWidth,height=image.naturalHeight;
        if(/relationship-assets\/rewards\/sohbet-(?:male|female)-l(?:[1-9]|1[0-2])\.png$/.test(path))return finish({width,height,slice:[Math.round(height*.25),Math.round(width*.22),Math.round(height*.25),Math.round(width*.22)],border_cap:[18,34,18,34]});
        if(known&&known.width===width&&known.height===height)return finish(known);
        const value={width,height,name:null};
        if(known?.slice)value.slice=known.slice.map((n,i)=>Math.round(n*(i%2?width/known.width:height/known.height)));
        if(known&&Math.abs(width/height-known.width/known.height)<.1){value.avatar=known.avatar;value.ring=known.ring;}
        finish(value);
      };
      image.onerror=()=>finish(null);image.src=url(key);
    });
    pending.set(path,result);if(pending.size>128)pending.delete(pending.keys().next().value);return result;
  }
  const properties=['background-image','border-style','border-color','border-image-source','border-image-slice','border-image-width','border-image-repeat','border-width','--paid-art','--paid-slice','--paid-edge','--art-ink'];
  function reset(el){
    el._artTicket=null;el._artObserver?.disconnect();el._artObserver=null;
    if(el._artOriginal)for(const [name,value,priority] of el._artOriginal){if(value)el.style.setProperty(name,value,priority);else el.style.removeProperty(name);}
    el._artOriginal=null;el._visualKey=null;el._visualTask=null;
    el.classList?.remove('visual-chat-bubble','visual-profile-surface');el.removeAttribute?.('data-art-ready');mounted.delete(el);
  }
  function sliced(el,key,slices,widths,fill){
    const source='url("'+url(key).replace(/"/g,'%22')+'")',edges=widths.map(n=>Math.round(n)+'px').join(' ');
    el.style.backgroundImage='none';el.style.borderStyle='solid';el.style.borderColor='transparent';
    el.style.borderImageSource=source;el.style.borderImageSlice=slices.join(' ')+(fill?' fill':'');el.style.borderImageWidth='1';el.style.borderImageRepeat='stretch';el.style.borderWidth=edges;
    if(el.classList?.contains('visual-profile-surface')){el.style.setProperty('--paid-art',source);el.style.setProperty('--paid-slice',slices.join(' ')+(fill?' fill':''));el.style.setProperty('--paid-edge',edges);}
  }
  function surface(el,key,kind){
    if(!el)return Promise.resolve();
    if(!key){reset(el);return Promise.resolve();}
    const identity=kind+':'+clean(key);
    if(el._visualKey===identity)return el._visualTask;
    reset(el);el._visualKey=identity;
    if(el.style.getPropertyValue)el._artOriginal=properties.map(name=>[name,el.style.getPropertyValue(name),el.style.getPropertyPriority(name)]);
    el.classList?.add(kind==='bubble'?'visual-chat-bubble':'visual-profile-surface');
    const ticket={};el._artTicket=ticket;
    const fallback=()=>{if(kind==='profile'&&el.style.setProperty){el.style.setProperty('--paid-art','none');el.style.setProperty('--paid-slice','0');el.style.setProperty('--paid-edge','0px');}el.setAttribute?.('data-art-ready','fallback');};
    const task=describe(key).then(m=>{
      if(el._artTicket!==ticket||!el.isConnected)return;
      if(!m||!(m.width>0&&m.height>0)){fallback();return;}
      // Profile artwork without declared slices stays a readable native panel.
      if(kind==='profile'&&!m.slice){fallback();return;}
      const slice=m.slice||(kind==='bubble'?[m.height*.16,m.width*.1,m.height*.35,m.width*.1]:[m.height*.42,m.width*.14,m.height*.18,m.width*.14]);
      const host=kind==='bubble'?(el.closest?.('.chatBody,#erisLiveChat,[data-art],.rel-reward-body')||el.parentElement):el;
      const fit=()=>{
        if(!el.isConnected){reset(el);return;}
        const owner=host;let ownerWidth=owner?.clientWidth||innerWidth-24;if(kind==='bubble'&&owner&&typeof getComputedStyle==='function'){const style=getComputedStyle(owner);ownerWidth-=parseFloat(style.paddingLeft)||0;ownerWidth-=parseFloat(style.paddingRight)||0;}
        const width=kind==='bubble'?Math.max(48,Math.min(ownerWidth,600)):(el.getBoundingClientRect().width||Math.min(innerWidth-24,460));
        const scale=kind==='bubble'?Math.min(width/m.width,.28):width/m.width;
        let edges=slice.map((n,i)=>Math.min(m.border_cap?.[i]??(kind==='bubble'?32:48),Math.max(kind==='bubble'?4:0,n*scale)));
        // Even on a 240px screen decoration must leave a usable text/control pane.
        const budget=width*(kind==='bubble'?.42:.22),sum=edges[1]+edges[3];
        if(sum>budget){edges[1]*=budget/sum;edges[3]*=budget/sum;}
        sliced(el,key,slice,edges,kind==='profile'?m.fill===true:m.fill!==false);
        if(m.ink)el.style.setProperty('--art-ink',m.ink);
        el.setAttribute?.('data-art-ready','true');
      };
      fit();mounted.add(el);
      if(window.ResizeObserver){const observer=new ResizeObserver(fit);observer.observe(host||el);el._artObserver=observer;}
    });
    el._visualTask=task;return task;
  }
  const popup=(el,key)=>surface(el,key,'profile'),bubble=(el,key)=>surface(el,key,'bubble');
  const frameSelector='.dm-avatar-frame,.dm-message-frame,.eris-chat-frame,.eris-mini-frame,.eris-profile-frame,.frameImg,.seat-frame.has-frame,.eris-follow-frame,.eris-vip-entry-avatar-frame,.rel-entrance-frame';
  const avatarSelector='.face,.seat-ava,.eris-follow-avatar-main,.eris-profile-avatar,.eris-vip-entry-face,img:not(.dm-message-frame):not(.eris-chat-frame):not(.eris-mini-frame):not(.eris-profile-frame):not(.frameImg):not(.eris-follow-frame):not(.eris-vip-entry-avatar-frame):not(.rel-entrance-frame)';
  async function portrait(frame){
    const el=frame.parentElement;if(!el)return;
    const source=frame.getAttribute('src')||frame.style.backgroundImage?.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if(!source)return;
    const ticket={};frame._portraitTicket=ticket;
    const m=await describe(source);
    if(frame._portraitTicket!==ticket||!frame.isConnected)return;
    if(!m?.aperture){el.classList.remove('visual-portrait');return;}
    const a=m.aperture;let avatar=[...el.children].find(child=>child!==frame&&child.matches(avatarSelector));
    if(!avatar){avatar=el.querySelector(':scope > .visual-art-avatar');if(!avatar){avatar=document.createElement('span');for(const child of [...el.childNodes])if(child.nodeType===3)avatar.append(child);if(el.style.backgroundImage)avatar.style.backgroundImage=el.style.backgroundImage;el.prepend(avatar);}}
    el.classList.add('visual-portrait');el.classList.toggle('visual-portrait-static',getComputedStyle(el).position==='static');frame.classList.add('visual-art-frame');avatar.classList.add('visual-art-avatar');
    el.style.setProperty('--art-avatar-x',a.x*100+'%');el.style.setProperty('--art-avatar-y',a.y*100+'%');el.style.setProperty('--art-avatar-size',a.diameter*100+'%');
  }
  function portraits(root=document){if(root.nodeType===1&&root.matches(frameSelector))portrait(root);root.querySelectorAll?.(frameSelector).forEach(portrait);}
  // A single lifecycle observer also disposes observers when chat histories or dialogs are removed.
  let scheduled=false;const additions=new Set();
  if(window.MutationObserver)new MutationObserver(rows=>{
    for(const row of rows){if(row.type==='attributes')additions.add(row.target);else for(const node of row.addedNodes)if(node.nodeType===1)additions.add(node);}
    if(scheduled)return;scheduled=true;
    queueMicrotask(()=>{scheduled=false;for(const el of mounted)if(!el.isConnected)reset(el);for(const el of additions)if(el.isConnected)portraits(el);additions.clear();});
  }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  window.ErisDeviceLayout?.refresh?.();
  window.ErisVisualLayout={describe,popup,bubble,url,reset,portraits,status:async(el,key)=>{const m=await describe(key);if(m&&el.isConnected)el.style.aspectRatio=m.width+'/'+m.height;}};
  document.addEventListener?.('DOMContentLoaded',()=>portraits());
})();
