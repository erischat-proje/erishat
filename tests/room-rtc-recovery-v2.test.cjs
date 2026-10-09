const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('frontend/room-rtc-live.js','utf8');
const tick=async()=>{for(let i=0;i<100;i++)await Promise.resolve()};
function setup(){
  const intervals=[], timers=new Map(), pcs=[], sent=[], events={}, tracks=[];
  let n=0, requestError=null, configCalls=0, capture=null;
  const node=()=>({dataset:{},style:{},classList:{toggle(){}},append(){},remove(){},setAttribute(){},play:async()=>{}});
  const document={head:node(),body:node(),getElementById:()=>null,createElement:node,querySelectorAll:()=>[],addEventListener(){}};
  const track={kind:'audio',stop(){this.stopped=true},addEventListener(){}};
  tracks.push(track);
  const media={getTracks:()=>tracks,getAudioTracks:()=>tracks};
  class PC{
    constructor(cfg){this.cfg=cfg;this.signalingState='stable';this.connectionState='new';this.iceConnectionState='new';this.trans=[];pcs.push(this)}
    setConfiguration(cfg){this.cfg=cfg}
    addTransceiver(){const sender={track:null,replaceTrack:async t=>{sender.track=t}};const t={sender,receiver:{track:{kind:'audio'}},direction:'sendrecv'};this.trans.push(t);return t}
    getTransceivers(){return this.trans}getSenders(){return this.trans.map(t=>t.sender)}
    async createOffer(){this.offers=(this.offers||0)+1;return {type:'offer',sdp:'mock'}}
    async setLocalDescription(d){this.localDescription=d;this.signalingState=d.type==='offer'?'have-local-offer':'stable'}
    async setRemoteDescription(d){if(this.remoteGate)await this.remoteGate;if(d.type==='offer'&&!this.trans.length)this.addTransceiver();this.remoteDescription=d;this.signalingState=d.type==='offer'?'have-remote-offer':'stable'}
    async createAnswer(){return {type:'answer',sdp:'mock'}}
    async addIceCandidate(){if(this.badIce)throw new Error('stale');this.ice=(this.ice||0)+1}
    restartIce(){this.restarts=(this.restarts||0)+1}
    close(){this.signalingState='closed';this.connectionState='closed'}
  }
  const window={ErisCurrentRoomId:'room',__erisRoomPermissions:{current_user_seat:1},RTCPeerConnection:PC,
    __erisRoomSocket:{readyState:1,send:x=>sent.push(JSON.parse(x))},
    ErisPlatform:{api:async()=>{configCalls++;if(requestError)throw requestError;return {seat_number:1,muted:false,ice_servers:[{urls:'turn:example.test'}]}}},
    setInterval:fn=>intervals.push(fn),addEventListener:(name,fn)=>events[name]=fn};
  vm.runInNewContext(source,{window,document,console:{warn(){}},AbortController,Date,RTCPeerConnection:PC,RTCSessionDescription:function(x){return x},RTCIceCandidate:function(x){return x},WebSocket:{OPEN:1},navigator:{mediaDevices:{getUserMedia:args=>typeof capture==='function'?capture(args):capture||Promise.resolve(media)}},localStorage:{setItem(){}},setTimeout:fn=>{timers.set(++n,fn);return n},clearTimeout:id=>timers.delete(id),requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  return {window,pcs,sent,events,timers,intervals,track,setError:e=>requestError=e,setCapture:p=>capture=p,get calls(){return configCalls}};
}
(async()=>{
  {const t=setup();await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'a',peers:['b']});await tick();assert.ok(t.calls>=1);assert.equal(t.pcs[0].cfg.iceServers[0].urls,'turn:example.test');assert.equal(t.sent.filter(x=>x.type==='rtc_offer').length,1);
   t.pcs[0].signalingState='stable';t.pcs[0].connectionState='disconnected';t.pcs[0].onconnectionstatechange();for(const fn of [...t.timers.values()])fn();await tick();assert.ok(t.pcs[0].restarts);assert.equal(t.sent.filter(x=>x.type==='rtc_offer').length,2);}
  {const t=setup();await t.window.ErisRoomRTC.toggle();assert.equal(t.track.stopped,undefined);t.setError(Object.assign(new Error('temporary'),{status:503}));await t.intervals[0]();assert.equal(t.track.stopped,undefined);t.setError(Object.assign(new Error('forbidden'),{status:403}));await t.intervals[0]();assert.equal(t.track.stopped,true);}
  {const t=setup();let resolve;t.setCapture(new Promise(r=>resolve=r));const opening=t.window.ErisRoomRTC.toggle();await tick();t.window.ErisRoomRTC.leaveRoom();resolve({getTracks:()=>[t.track],getAudioTracks:()=>[t.track]});await opening;assert.equal(t.track.stopped,true);assert.equal(t.pcs.length,0);}
  {const t=setup();await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'z',peers:['a']});await Promise.all([t.window.ErisRoomRTC.message({type:'rtc_offer',from_user_id:'a',payload:{type:'offer',sdp:'mock'}}),t.window.ErisRoomRTC.message({type:'rtc_ice',from_user_id:'a',payload:{candidate:'mock'}})]);assert.equal(t.pcs[0].ice,1);assert.equal(t.sent.filter(x=>x.type==='rtc_answer').length,1);t.window.ErisRoomRTC.leaveRoom();assert.equal(t.timers.size,0);}
  // The callee microphone must use the transceiver created from the offer.
  {const t=setup();await t.window.ErisRoomRTC.toggle();await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'z',peers:['a']});await t.window.ErisRoomRTC.message({type:'rtc_offer',from_user_id:'a',payload:{type:'offer',sdp:'mock',_eris_offer:'o1'}});assert.equal(t.pcs[0].trans.length,1);assert.equal(t.pcs[0].trans[0].sender.track,t.track);}
  // One slow peer must not stop negotiation with another peer.
  {const t=setup();await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'z',peers:['a','b']});let release;t.pcs[0].remoteGate=new Promise(r=>release=r);const slow=t.window.ErisRoomRTC.message({type:'rtc_offer',from_user_id:'a',payload:{type:'offer',sdp:'mock'}});await tick();await t.window.ErisRoomRTC.message({type:'rtc_offer',from_user_id:'b',payload:{type:'offer',sdp:'mock'}});assert.ok(t.sent.some(x=>x.type==='rtc_answer'&&x.to_user_id==='b'));release();await slow;}
  // Old offer answers/ICE must not be applied to a later attempt.
  {const t=setup();await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'a',peers:['b']});await tick();const pc=t.pcs[0];await t.window.ErisRoomRTC.message({type:'rtc_answer',from_user_id:'b',payload:{type:'answer',sdp:'old',_eris_offer:'old'}});assert.equal(pc.remoteDescription,undefined);await t.window.ErisRoomRTC.message({type:'rtc_answer',from_user_id:'b',payload:{type:'answer',sdp:'new',_eris_offer:pc._erisOffer}});assert.equal(pc.remoteDescription.sdp,'new');await t.window.ErisRoomRTC.message({type:'rtc_ice',from_user_id:'b',payload:{candidate:'old',_eris_offer:'old'}});assert.equal(pc.ice,undefined);pc.badIce=true;await t.window.ErisRoomRTC.message({type:'rtc_ice',from_user_id:'b',payload:{candidate:'bad',_eris_offer:pc._erisOffer}});assert.notEqual(pc.connectionState,'closed');}
  // A second mic tap cancels a pending browser permission prompt.
  {const t=setup();let release;t.setCapture(new Promise(r=>release=r));const opening=t.window.ErisRoomRTC.toggle();await tick();await t.window.ErisRoomRTC.toggle();release({getTracks:()=>[t.track],getAudioTracks:()=>[t.track]});await opening;assert.equal(t.track.stopped,true);assert.equal(t.window.ErisRoomRTC.diagnostics().microphone,false);}
  // Server roster reconciliation clears departed audio and does not add ICE-only ghosts.
  {const t=setup();await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'z',peers:['a']});await t.window.ErisRoomRTC.message({type:'rtc_roster',peers:[]});assert.equal(t.window.ErisRoomRTC.diagnostics().peers.length,0);await t.window.ErisRoomRTC.message({type:'rtc_ice',from_user_id:'unknown',payload:{candidate:'mock'}});assert.equal(t.window.ErisRoomRTC.diagnostics().peers.length,0);}
  // A mute remains immediate even when another peer's negotiation is pending.
  {const t=setup();await t.window.ErisRoomRTC.toggle();await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'z',peers:['a']});let release;t.pcs[0].remoteGate=new Promise(r=>release=r);const slow=t.window.ErisRoomRTC.message({type:'rtc_offer',from_user_id:'a',payload:{type:'offer',sdp:'mock'}});await tick();const muted=t.window.ErisRoomRTC.message({type:'room_seat_muted',muted:true,user_id:'z'});assert.equal(t.track.stopped,true);release();await Promise.all([slow,muted]);}
  // Unsupported constraints fall back once, but permission denial is never retried.
  {const t=setup();const media={getTracks:()=>[t.track],getAudioTracks:()=>[t.track]};t.setCapture(null);const original=t.window.ErisRoomRTC;t.setCapture(Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'})));await original.toggle();assert.equal(original.diagnostics().microphone,false);assert.equal(t.track.stopped,undefined);}
  {const t=setup();const calls=[];t.setCapture(async args=>{calls.push(args.audio);if(calls.length===1)throw Object.assign(new Error('constraint'),{name:'OverconstrainedError'});return {getTracks:()=>[t.track],getAudioTracks:()=>[t.track]}});await t.window.ErisRoomRTC.toggle();assert.equal(calls.length,2);assert.equal(calls[1],true);assert.equal(t.window.ErisRoomRTC.diagnostics().microphone,true);}
  {const t=setup();let calls=0;t.setCapture(async()=>{calls++;throw Object.assign(new Error('permission'),{name:'NotAllowedError'})});await t.window.ErisRoomRTC.toggle();assert.equal(calls,1);}
  {const t=setup();t.window.__erisRoomPermissions.current_user_seat=null;
   await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'a',peers:[]});await tick();
   assert.equal(t.window.ErisRoomRTC.diagnostics().microphone,false);
   t.window.__erisRoomPermissions.current_user_seat=1;
   t.events['erischat:room-state-updated']({detail:{room:{id:'room',current_user_seat:1,seats:[]}}});await tick();
   assert.equal(t.window.ErisRoomRTC.diagnostics().microphone,true);
   await t.window.ErisRoomRTC.toggle();
   t.events['erischat:room-state-updated']({detail:{room:{id:'room',current_user_seat:1,seats:[]}}});await tick();
   assert.equal(t.window.ErisRoomRTC.diagnostics().microphone,false);
   t.events['erischat:room-state-updated']({detail:{room:{id:'other',current_user_seat:1,seats:[]}}});await tick();
   assert.equal(t.window.ErisRoomRTC.diagnostics().microphone,false);
  }
  {const t=setup();let calls=0;t.setCapture(async()=>{calls++;throw Object.assign(new Error('denied'),{name:'NotAllowedError'})});
   await t.window.ErisRoomRTC.message({type:'rtc_ready',user_id:'a',peers:[]});await tick();
   for(let i=0;i<3;i++){t.window.ErisRoomRTC.syncSeatMicrophone();await tick()}
   assert.equal(calls,1);
  }
  console.log('PASS: 15 RTC scenarios (mocked WebRTC; no live network test)');
})().catch(e=>{console.error(e);process.exitCode=1});
