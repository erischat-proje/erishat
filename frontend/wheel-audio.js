(() => {'use strict';
const base=new URL('./assets/lidya-wheel/audio/',document.currentScript.src);
window.LidyaWheelAudio={create(){
 let ctx=null,master=null,closed=false,enabled=localStorage.getItem('eris.wheel.sound')!=='off';
 const buffers=new Map(),voices=new Set(),last=new Map();let loading=null,timer=null;
 function stop(){clearInterval(timer);timer=null;for(const v of voices){try{v.stop();}catch{}}voices.clear();}
 async function unlock(){if(closed)return;ctx ||= new (window.AudioContext||window.webkitAudioContext)();if(!master){master=ctx.createGain();master.gain.value=.24;master.connect(ctx.destination);}if(ctx.state==='suspended')await ctx.resume();loading ||= Promise.all(['select','bet','tick','win','jackpot'].map(async key=>{try{const r=await fetch(new URL(key+'.wav',base));if(!r.ok)return;buffers.set(key,await ctx.decodeAudioData(await r.arrayBuffer()));}catch{}}));await loading;}
 function play(key){if(closed||!enabled||document.hidden||ctx?.state!=='running'||!buffers.has(key))return;const at=ctx.currentTime;if(at-(last.get(key)??-10)<.055)return;last.set(key,at);while(voices.size>=4){const v=voices.values().next().value;try{v.stop();}catch{}voices.delete(v);}const source=ctx.createBufferSource();source.buffer=buffers.get(key);source.connect(master);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();};source.start();}
 const visibility=()=>{if(document.hidden){stop();ctx?.suspend().catch(()=>{});}};document.addEventListener('visibilitychange',visibility);
 return {unlock,play,get enabled(){return enabled;},setEnabled(value){enabled=!!value;localStorage.setItem('eris.wheel.sound',enabled?'on':'off');if(!enabled)stop();},spin(){stop();if(enabled)timer=setInterval(()=>play('tick'),130);},stop,close(){closed=true;stop();document.removeEventListener('visibilitychange',visibility);ctx?.close().catch(()=>{});buffers.clear();}};
}};
})();
