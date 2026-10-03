/* Equipped relationship entrance artwork and its inseparable sound. */
(() => {
  'use strict';
  const style=document.createElement('style');style.textContent=`
    .rel-chat-bubble{flex:1;min-width:0;max-width:100%;background-position:center;background-size:100% 100%;background-repeat:no-repeat;padding:18px 30px;box-sizing:border-box;color:#fff}
    .rel-chat-line{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.6}.rel-chat-line .eris-chat-text{display:inline;background:none;padding:0;color:inherit}.rel-chat-line b{color:#ffdda1}
    .rel-entrance{position:fixed;left:0;top:24%;width:min(540px,94vw);z-index:11100;pointer-events:none;animation:relEntrance 3.2s both}.rel-entrance-art{display:block;width:100%;height:auto}.rel-entrance-avatar{position:absolute;left:10%;top:19%;width:12.2%;height:67%;border-radius:50%;object-fit:cover;display:grid;place-items:center;font-size:25px;overflow:hidden;background:#100e18}.rel-entrance-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%}.rel-entrance-name{position:absolute;left:26%;top:32%;width:46%;height:38%;display:flex;align-items:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#ffedc5;font-size:clamp(11px,3.4vw,20px);font-weight:800;text-shadow:0 2px 5px #000}.rel-entrance-ring{position:absolute;left:79.3%;top:32%;width:8.5%;height:48%;object-fit:contain}
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
  function next(){if(active||!queue.length)return;const d=queue.shift();const el=document.createElement('div');el.className='rel-entrance';const art=document.createElement('img');art.className='rel-entrance-art';art.src=asset(d.entrance_asset);art.alt='';const avatar=document.createElement('span');avatar.className='rel-entrance-avatar';if(d.avatar_asset){const img=document.createElement('img');img.src=asset(d.avatar_asset);img.alt='';avatar.append(img)}else avatar.textContent=d.avatar||'👤';const name=document.createElement('span');name.className='rel-entrance-name';name.textContent=d.nickname||'Kullanıcı';el.append(art,avatar,name);if(d.ring_asset){const ring=document.createElement('img');ring.className='rel-entrance-ring';ring.src=asset(d.ring_asset);ring.alt='';el.append(ring)}document.body.append(el);active=el;try{sound(d.entrance_asset)}catch(_){}timer=setTimeout(()=>{el.remove();active=null;timer=null;next()},3200)}
  function show(d){if(!d?.entrance_asset||!String(d.entrance_asset).startsWith('relationship-assets/rewards/entrance-'))return;if(queue.length<8){queue.push(d);next()}}
  function clear(){queue.length=0;clearTimeout(timer);timer=null;active?.remove();active=null}
  window.ErisRelationshipEntrance={show,clear};window.addEventListener('erischat:room-closed',clear);window.addEventListener('erischat:auth',e=>{if(e.detail?.state!=='ready')clear()});
})();
