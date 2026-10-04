/* Twelve original motion scenes. Live events come only from the room socket. */
(() => {
  'use strict';
  const queue=[],seen=new Set();let active=null,epoch=0,pumping=false;
  let shopThemes={};const shopReady=fetch(new URL('shop-expansion/entrances.json?v=expansion-800-20261004',document.currentScript.src),{signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(x=>{shopThemes=x}).catch(()=>{});
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const asset=key=>window.ErisChatCosmetics?.assetUrl?.(key)||key;
  function finish(){if(!active)return;const a=active;active=null;clearTimeout(a.timer);clearTimeout(a.loadTimer);cancelAnimationFrame(a.raf);a.el.remove();a.resolve();}
  function clear(){epoch++;pumping=false;queue.length=0;finish();window.ErisRelationshipEntrance?.clear?.();}
  function paint(canvas,theme,duration,holder){
    const c=canvas.getContext('2d');if(!c)return;
    const w=Math.min(innerWidth,900),h=Math.min(innerHeight,1100),ratio=Math.min(devicePixelRatio||1,1.5);
    canvas.width=w*ratio;canvas.height=h*ratio;c.scale(ratio,ratio);
    const start=performance.now(),count=Math.min(88,26+theme.level*5);
    const particles=Array.from({length:count},(_,i)=>({a:i/count*Math.PI*2,r:.2+(i*37%101)/140,s:2+i%4,offset:i*.037}));
    function frame(now){
      if(active!==holder)return;const t=(now-start)/1000,p=t/(duration/1000);c.clearRect(0,0,w,h);
      const alpha=Math.min(1,p*6,(1-p)*5);if(alpha<=0&&p>=1)return;
      c.globalAlpha=Math.max(0,alpha);const cx=w/2,cy=h*.42,radius=Math.min(w*.43,h*.3),mode=theme.motion;
      for(let i=0;i<particles.length;i++){
        const z=particles[i],a=z.a+t*(mode==='comet'?1.7:.35),r=radius*z.r;let x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.6;
        if(mode==='crystal'||mode==='prism'){x=cx+Math.cos(z.a)*r*(.4+p*1.4);y=cy+Math.sin(z.a)*r*(.4+p*1.4);}
        if(mode==='moon'){x=cx+Math.cos(a)*radius*.85;y=cy+Math.sin(a)*radius*.7;}
        if(mode==='laurel'){x=cx+(i%2?1:-1)*Math.sin(p*Math.PI)*radius*(.5+z.r*.45);y=cy+((i/count)-.5)*radius*1.6;}
        if(mode==='phoenix'){x=cx+(i%2?1:-1)*r*(.5+Math.sin(t)*.2);y=cy-r*Math.sin(p*Math.PI)*1.2+Math.sin(a)*20;}
        if(mode==='rose'||mode==='iris'){x=cx+Math.sin(a)*r;y=cy-radius*.6+((t*50+i*17)%(radius*1.5));}
        if(mode==='flame'){x=cx+Math.sin(a*3+t)*r*.7;y=cy+radius*.5-((t*100+i*23)%(radius*1.6));}
        if(mode==='sun'){x=cx+Math.cos(z.a)*r*(.5+p);y=cy+Math.sin(z.a)*r*(.5+p);}
        if(mode==='eclipse'){x=cx+Math.cos(a)*radius*.9;y=cy+Math.sin(a)*radius*.9;}
        if(mode==='imperial'){x=cx+Math.sin(a)*r*1.1;y=cy+Math.cos(a*2)*r*.55-Math.sin(p*Math.PI)*25;}
        c.save();c.translate(x,y);c.rotate(a);c.fillStyle=i%3?theme.color:theme.metal;c.shadowColor=theme.color;c.shadowBlur=i%4===0?10:0;c.globalAlpha=Math.max(0,alpha)*(.3+.7*Math.abs(Math.sin(t+z.offset)));
        c.beginPath();
        if(['rose','iris','laurel'].includes(mode)){c.ellipse(0,0,z.s,z.s*2.4,.4,0,Math.PI*2);}
        else if(mode==='sun'||mode==='phoenix'||mode==='comet'){c.moveTo(-z.s*5,0);c.lineTo(z.s,1);c.lineTo(z.s,-1);}
        else{c.moveTo(0,-z.s*1.8);c.lineTo(z.s,0);c.lineTo(0,z.s*1.8);c.lineTo(-z.s,0);}c.closePath();c.fill();c.restore();
      }
      if(['moon','eclipse','imperial','sun'].includes(mode)){
        c.globalAlpha=Math.max(0,alpha)*.45;c.strokeStyle=theme.metal;c.lineWidth=1.5;c.beginPath();c.arc(cx,cy,radius*.8,-t*.25,Math.PI*1.7-t*.25);c.stroke();
      }
      c.globalAlpha=1;holder.raf=requestAnimationFrame(frame);
    }
    holder.raf=requestAnimationFrame(frame);
  }
  function play(d,theme){return new Promise(resolve=>{
    const el=document.createElement('section');el.className='eris-vip-entrance';el.dataset.motion=theme.motion;el.dataset.level=String(theme.level);el.dataset.preview=String(!!d.preview);
    el.style.setProperty('--entry-accent',theme.color);el.style.setProperty('--entry-metal',theme.metal);el.style.setProperty('--entry-duration',theme.duration+'ms');
    el.dataset.userId=String(d.user_id||'');
    el.setAttribute('aria-live','polite');el.setAttribute('aria-label',theme.level?'VIP '+theme.level+' oda girişi':'Normal oda girişi');
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');el.append(canvas);
    const stage=document.createElement('div');stage.className='eris-vip-entry-stage';el.append(stage);
    const banner=document.createElement('div');banner.className='eris-vip-entry-banner';stage.append(banner);
    const artwork=document.createElement('img');artwork.className='eris-vip-entry-frame';artwork.alt='';banner.append(artwork);
    const content=document.createElement('div');content.className='eris-vip-entry-content';banner.append(content);
    const portrait=document.createElement('span');portrait.className='eris-vip-entry-portrait';
    const face=document.createElement('span');face.className='eris-vip-entry-face';portrait.append(face);
    if(d.avatar_asset){const image=document.createElement('img');image.src=asset(d.avatar_asset);image.alt='';image.onerror=()=>{face.textContent=d.avatar||'👤'};face.append(image)}else face.textContent=d.avatar||'👤';
    if(d.frame_asset){const frame=document.createElement('img');frame.className='eris-vip-entry-avatar-frame';frame.src=asset(d.frame_asset);frame.alt='';frame.onerror=()=>{frame.remove();portrait.classList.remove('has-frame')};portrait.append(frame);portrait.classList.add('has-frame')}
    content.append(portrait);
    const identity=document.createElement('div');identity.className='eris-vip-entry-identity';
    const tag=document.createElement('small');tag.textContent=(theme.level?'VIP '+theme.level+' · ':'')+theme.name;
    const name=document.createElement('strong');name.textContent=String(d.nickname||'Kullanıcı').slice(0,120);
    const note=document.createElement('span');note.textContent=d.preview?'Oda girişi önizlemesi':'Odaya katıldı';identity.append(tag,name,note);content.append(identity);
    if(d.preview){const close=document.createElement('button');close.type='button';close.className='eris-vip-entry-dismiss';close.textContent='Önizlemeyi kapat ×';close.onclick=finish;stage.append(close);el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();finish()}})}
    const holder={el,resolve,timer:null,loadTimer:null,raf:null,started:false};active=holder;
    function start(){if(active!==holder||holder.started)return;holder.started=true;clearTimeout(holder.loadTimer);document.body.append(el);if(!reduced())paint(canvas,theme,theme.duration,holder);holder.timer=setTimeout(finish,reduced()?2200:theme.duration)}
    artwork.onload=()=>{if(active!==holder)return;banner.classList.add('has-art');start()};
    artwork.onerror=()=>{if(active!==holder)return;artwork.hidden=true;start()};
    holder.loadTimer=setTimeout(start,1200);artwork.src=theme.entryFrame;
  });}
  async function next(){
    if(pumping||active||!queue.length)return;const ticket=epoch,d=queue.shift();
    if(document.hidden||(!d.preview&&window.ErisRoomBlocks?.has?.(d.user_id))){next();return}
    pumping=true;if(d.shop_entry)await shopReady;if(ticket!==epoch)return;const custom=shopThemes[d.shop_entry];const theme=custom?{...custom,entryFrame:asset(custom.entryFrame)}:d.normal_entry?window.ErisVIPDesigns?.normal:window.ErisVIPDesigns?.get(d.vip_entry_level,d.vip_entry_style);
    if(theme)await play(d,theme);
    if(ticket!==epoch)return;
    if(!d.preview&&d.entrance_asset)await window.ErisRelationshipEntrance?.show?.(d);
    if(ticket===epoch){pumping=false;next()}
  }
  function show(d){
    if(!d||document.hidden||window.ErisRoomBlocks?.has?.(d.user_id))return;
    if(!d.shop_entry&&!d.normal_entry&&!window.ErisVIPDesigns?.get(d.vip_entry_level)&&!d.entrance_asset)return;
    if(d.event_id){if(seen.has(d.event_id))return;seen.add(d.event_id);if(seen.size>120)seen.delete(seen.values().next().value)}
    if(queue.length<8){queue.push({...d});next()}
  }
  function preview(level,style){const user=window.ErisAuth?.user||{};style=style||user.gender;const theme=Number(level)===0?window.ErisVIPDesigns?.normal:window.ErisVIPDesigns?.get(level,style);if(!theme)return;
    queue.unshift({preview:true,normal_entry:theme.level===0,vip_entry_level:theme.level,vip_entry_style:style,nickname:user.nickname||'VIP misafiri',avatar_asset:user.avatar_asset,avatar:user.avatar,frame_asset:user.frame_asset});if(queue.length>8)queue.pop();next();
  }
  async function previewAsset(key){await shopReady;if(!shopThemes[key])return;const user=window.ErisAuth?.user||{};queue.unshift({preview:true,shop_entry:key,nickname:user.nickname||'ErisChat misafiri',avatar_asset:user.avatar_asset,avatar:user.avatar,frame_asset:user.frame_asset});if(queue.length>8)queue.pop();next();}
  window.ErisRoomEntrance={show,clear,preview,previewAsset};
  window.addEventListener('erischat:room-closed',clear);
  window.addEventListener('erischat:auth',e=>{if(e.detail?.state!=='ready'){clear();seen.clear()}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});
  window.addEventListener('erischat:user-block-changed',e=>{if(e.detail?.blocked&&String(e.detail.userId)===String(active?.el.dataset.userId))finish()});
})();
