(()=>{'use strict';
const BASE=new URL('../assets/lidya-balikci-audio/',document.currentScript.src).href;
const keys=['spin','reel','cast','splash','catch','land','line','meter','explosion','payout','bonus','win'];
const volumes={spin:.35,reel:.38,cast:.5,splash:.35,catch:.5,land:.32,line:.42,meter:.28,explosion:.34,payout:.4,bonus:.38,win:.38};
const banks=new Set();
window.HasanSound={
 create(){let ctx=null,closed=false,enabled=true,loading=null,generation=0,compressor=null;const buffers=new Map(),voices=new Set(),controllers=new Set(),events=[];
 try{enabled=localStorage.getItem('eris.balikci.sound')!=='off';}catch{}
 function context(){if(closed)return null;if(!ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;ctx=new A();compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-16;compressor.knee.value=12;compressor.ratio.value=3;compressor.attack.value=.006;compressor.release.value=.12;compressor.connect(ctx.destination);}return ctx;}
 function preload(){if(loading)return loading;loading=(async()=>{const c=context();if(!c)return;await Promise.all(keys.map(async key=>{const abort=new AbortController();controllers.add(abort);const timer=setTimeout(()=>abort.abort(),8000);try{const response=await fetch(BASE+key+'.mp3',{signal:abort.signal});if(!response.ok)return;const data=await response.arrayBuffer();const buffer=await c.decodeAudioData(data);if(!closed)buffers.set(key,buffer);}catch{}finally{clearTimeout(timer);controllers.delete(abort);}}));})();return loading;}
 function stop(){generation++;for(const voice of voices){try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();}voices.clear();}
 function unlock(){try{const c=context();preload().catch(()=>{});c?.resume().catch(()=>{});}catch{}}
 function play(key,options={}){if(!enabled||closed||document.hidden)return;const c=context(),buffer=buffers.get(key);if(!c||c.state!=='running'||!buffer)return;const same=[...voices].filter(v=>v.key===key),limit=key==='land'||key==='line'?2:1;while(same.length>=limit){const old=same.shift();try{old.source.stop();}catch{}voices.delete(old);}while(voices.size>=8){const old=voices.values().next().value;try{old.source.stop();}catch{}voices.delete(old);}const source=c.createBufferSource(),gain=c.createGain(),now=c.currentTime;source.buffer=buffer;source.playbackRate.value=Math.min(2,Math.max(.5,options.rate||1));gain.gain.setValueAtTime((volumes[key]||.35)*(options.volume??1),now);source.connect(gain).connect(compressor);const voice={source,gain,key};voices.add(voice);source.onended=()=>{voices.delete(voice);source.disconnect();gain.disconnect();};source.start();events.push({key,at:now});if(events.length>100)events.shift();}
 const bank={preload,unlock,play,stop,mute(value){enabled=!!value;try{localStorage.setItem('eris.balikci.sound',enabled?'on':'off');}catch{}if(!enabled)stop();},close(){if(closed)return;closed=true;stop();for(const c of controllers)c.abort();controllers.clear();buffers.clear();compressor?.disconnect();ctx?.close().catch(()=>{});banks.delete(bank);},inspect(){return{decoded:buffers.size,voices:voices.size,enabled,closed,events:events.slice(),generation};},get enabled(){return enabled;}};
 banks.add(bank);preload().catch(()=>{});return bank;
 },inspect(){return [...banks].map(b=>b.inspect());}
};
})();
