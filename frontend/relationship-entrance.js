/* Equipped relationship entrance artwork and its inseparable sound. */
(() => {
  'use strict';
  const style=document.createElement('style');style.textContent=`
    .rel-chat-bubble{flex:1;min-width:0;max-width:100%;background-position:center;background-size:100% 100%;background-repeat:no-repeat;padding:18px 30px;box-sizing:border-box;color:#fff}
    .rel-chat-line{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.6}.rel-chat-line .eris-chat-text{display:inline;background:none;padding:0;color:inherit}.rel-chat-line b{color:#ffdda1}
    .rel-entrance{position:fixed;left:0;top:24%;width:min(540px,94vw);z-index:11100;pointer-events:none;animation:relEntrance 3.2s both}.rel-entrance-art{display:block;width:100%;height:auto}.rel-entrance-avatar{position:absolute;left:var(--avatar-x,16%);top:var(--slot-y,52%);width:var(--avatar-size,17%);aspect-ratio:1;height:auto;border-radius:50%;object-fit:cover;display:grid;place-items:center;transform:translate(-50%,-50%);font-size:25px;overflow:hidden;background:#100e18}.rel-entrance-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%}.rel-entrance-name{position:absolute;left:29%;top:79%;width:42%;height:12%;justify-content:center;background:#130e1dcc;border-radius:10px;display:flex;align-items:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#ffedc5;font-size:clamp(11px,3.4vw,20px);font-weight:800;text-shadow:0 2px 5px #000}.rel-entrance-ring{position:absolute;left:var(--ring-x,84%);top:var(--slot-y,52%);width:17%;height:auto;aspect-ratio:1;transform:translate(-50%,-50%);object-fit:contain}
    @keyframes relEntrance{0%{transform:translateX(-105%);opacity:0}18%{transform:translateX(0);opacity:1}78%{transform:translateX(0);opacity:1}100%{transform:translateX(-12%);opacity:0}}
    @media(prefers-reduced-motion:reduce){.rel-entrance{animation:relEntranceFade 3.2s both}@keyframes relEntranceFade{0%,100%{opacity:0}18%,78%{opacity:1}}}
  `;document.head.append(style);
  let context=null,active=null,timer=null;const queue=[];
  const asset=key=>window.ErisChatCosmetics?.assetUrl?.(key)||key;
  function audioContext(){if(!context){const C=window.AudioContext||window.webkitAudioContext;if(C)context=new C()}return context}
  document.addEventListener('pointerdown',()=>{try{audioContext()?.resume()?.catch(()=>{})}catch(_){}},{passive:true});
  function sound(key){
    const c=audioContext();if(!c||c.state!=='running')return;
    const female=key.includes('female'),level2=key.includes('-2.'),start=c.currentTime;
    function tone(freq,when,length,gain,type='sine',end=freq){const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,start+when);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),start+when+length);g.gain.setValueAtTime(.0001,start+when);g.gain.exponentialRampToValueAtTime(gain,start+when+.015);g.gain.exponentialRampToValueAtTime(.0001,start+when+length);o.connect(g);g.connect(c.destination);o.start(start+when);o.stop(start+when+length+.02)}
    // Short filtered air sweep, with volume low enough to retain voice clarity.
    const buffer=c.createBuffer(1,Math.floor(c.sampleRate*.45),c.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);
    const noise=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();noise.buffer=buffer;filter.type='bandpass';filter.frequency.setValueAtTime(female?1600:700,start);filter.frequency.exponentialRampToValueAtTime(250,start+.4);gain.gain.value=.055;noise.connect(filter);filter.connect(gain);gain.connect(c.destination);noise.start(start);
    if(female){(level2?[523.25,659.25,783.99,1046.5]:[783.99,1046.5]).forEach((f,i)=>{tone(f,.18+i*.14,level2?1.6:1.2,.035);tone(f*2,.19+i*.14,.9,.009)});}
    else{tone(level2?95:125,.17,.4,level2?.07:.045,'sine',45);tone(440,.27,.9,.025,'triangle');if(level2)[523.25,659.25,783.99].forEach((f,i)=>tone(f,.45+i*.16,1.1,.025));else tone(880,.29,.75,.012);}
  }
  async function next(){
    if(active||!queue.length)return;const d=queue.shift(),el=document.createElement('div');el.className='rel-entrance';active=el;
    const key=String(d.entrance_asset),layout=await window.ErisVisualLayout?.describe(key);if(active!==el)return;
    const art=document.createElement('img');art.className='rel-entrance-art';art.src=asset(key)+'?v=room-system-20261003';art.alt='Oda giriş efekti';art.onerror=()=>{if(active===el){el.remove();active=null;next()}};el.append(art);
    for(const kind of ['avatar','ring']){const slot=layout?.[kind];if(!slot)continue;const element=document.createElement(kind==='ring'?'img':'span');element.className='rel-entrance-'+kind;element.style.left=(slot.x*100)+'%';element.style.top=(slot.y*100)+'%';element.style.width=(slot.diameter*100)+'%';
      if(kind==='ring'){if(!d.ring_asset)continue;element.src=asset(d.ring_asset);element.alt='';}else if(d.avatar_asset){const image=document.createElement('img');image.src=asset(d.avatar_asset);image.alt='';element.append(image);}else element.textContent=d.avatar||'👤';if(kind==='avatar'&&d.frame_asset){const frame=document.createElement('img');frame.className='rel-entrance-frame';frame.src=asset(d.frame_asset);frame.alt='';element.append(frame)}el.append(element);}
    // A nickname is permitted only in a declared empty text rectangle.
    if(layout?.name){const n=layout.name,name=document.createElement('span');name.className='rel-entrance-name';name.style.left=(n.x*100)+'%';name.style.top=(n.y*100)+'%';name.style.width=(n.width*100)+'%';name.style.height=(n.height*100)+'%';name.textContent=d.nickname||'Kullanıcı';el.append(name);}
    document.body.append(el);try{sound(key)}catch(_){}timer=setTimeout(()=>{if(active!==el)return;el.remove();active=null;timer=null;next()},3200);
  }
  function show(d){if(!d?.entrance_asset||!String(d.entrance_asset).startsWith('relationship-assets/rewards/entrance-'))return;if(queue.length<8){queue.push(d);next()}}
  function clear(){queue.length=0;clearTimeout(timer);timer=null;active?.remove();active=null}
  window.ErisRelationshipEntrance={show,clear};window.addEventListener('erischat:room-closed',clear);window.addEventListener('erischat:auth',e=>{if(e.detail?.state!=='ready')clear()});
})();
