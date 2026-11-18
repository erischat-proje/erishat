'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const rtcPath = path.resolve(process.cwd(), 'frontend/room-rtc-live.js');
const source = fs.readFileSync(rtcPath, 'utf8');

function createClient(id) {
  const sent = [];
  const connections = [];
  const timers = new Map();
  let nextTimer = 1;
  const listeners = new Map();
  const apiCalls = [];
  const socket = {readyState: 1, send(raw) {sent.push(JSON.parse(raw));}};
  const emptyElement = () => ({
    classList: {add() {}, remove() {}, toggle() {}},
    style: {setProperty() {}}, dataset: {},
    setAttribute() {}, append() {}, remove() {},
    querySelector() {return null}, querySelectorAll() {return []}
  });
  const document = {
    visibilityState: 'visible', head: {append() {}},
    body: {append() {}}, getElementById() {return null},
    createElement() {return emptyElement()},
    querySelectorAll() {return []},
    addEventListener(event, fn) {listeners.set('document:'+event, fn)}
  };
  class Peer {
    constructor() {
      this.connectionState = 'new';
      this.iceConnectionState = 'new';
      this.signalingState = 'stable';
      this.transceivers = [];
      this.receivers = [];
      this.senders = [];
      this.closed = false;
      connections.push(this);
    }
    addTransceiver() {
      const sender = {track: null, async replaceTrack(track) {this.track = track;}};
      const receiver = {track: {kind:'audio',readyState:'live'}};
      const trx = {sender, receiver, stopped:false, direction:'sendrecv'};
      this.transceivers.push(trx);
      this.senders.push(sender);
      this.receivers.push(receiver);
      return trx;
    }
    addTrack(track) {
      const trx=this.addTransceiver('audio');
      trx.sender.track=track;
      return trx.sender;
    }
    getTransceivers() {return this.transceivers}
    getReceivers() {return this.receivers}
    getSenders() {return this.senders}
    setConfiguration() {}
    async createOffer() {return {type:'offer',sdp:'mock-offer'}}
    async createAnswer() {return {type:'answer',sdp:'mock-answer'}}
    async setLocalDescription(desc) {
      if(desc.type==='rollback') {this.signalingState='stable';return}
      this.localDescription=desc;
      this.signalingState=desc.type==='offer'?'have-local-offer':'stable';
    }
    async setRemoteDescription(desc) {
      this.remoteDescription=desc;
      this.signalingState=desc.type==='offer'?'have-remote-offer':'stable';
    }
    async addIceCandidate() {}
    async getStats() {return new Map()}
    restartIce() {}
    close() {this.closed=true;this.signalingState='closed';this.connectionState='closed'}
  }
  const window = {
    ErisCurrentRoomId:'room-v45',
    __erisRoomSocket:socket,
    ErisPlatform:{api:async(endpoint)=>{apiCalls.push(endpoint);return {ice_servers:[{urls:'stun:localhost'}],seat_number:null,muted:false}}},
    addEventListener(event,fn) {listeners.set('window:'+event,fn)},
    dispatchEvent() {},
    setInterval() {return 0},
    ErisRoomBlocks:{has:()=>false},
    ErisRoomUI:{refresh:async()=>{}}
  };
  const context = {
    window,document,
    WebSocket:{OPEN:1},
    RTCPeerConnection:Peer,
    RTCSessionDescription:class {constructor(data){Object.assign(this,data)}},
    RTCIceCandidate:class {constructor(data){Object.assign(this,data)}},
    AbortController,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
    localStorage:{getItem:()=>null,setItem(){}},
    navigator:{mediaDevices:{addEventListener(){}}},
    setTimeout(fn,ms) {const n=nextTimer++;timers.set(n,{fn,ms});return n},
    clearTimeout(n) {timers.delete(n)},
    setInterval() {return 0},
    clearInterval() {},
    requestAnimationFrame() {return 0},cancelAnimationFrame() {},
    console,Date,Math,performance,Promise,Set,Map,Uint8Array
  };
  vm.createContext(context);
  vm.runInContext(source,context,{filename:rtcPath,timeout:1500});
  const rtc=window.ErisRoomRTC;
  assert.ok(rtc,'RTC module did not register ErisRoomRTC');
  const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve))};
  const ready=async(peers=[])=>{await rtc.message({type:'rtc_ready',user_id:id,peers});await flush()};
  const event=async(payload)=>{await rtc.message(payload);await flush()};
  const active=()=>rtc.diagnostics().peers;
  return {rtc,ready,event,flush,sent,connections,timers,apiCalls,socket,active,listeners};
}

test('rtc_ready creates peers without requesting microphone or a seat', async()=>{
  const client=createClient('a');
  await client.ready(['b','c']);
  assert.equal(client.active().length,2);
  assert.equal(client.rtc.state().microphone,false);
  assert.ok(client.sent.some(x=>x.type==='rtc_offer'&&x.to_user_id==='b'));
  assert.ok(client.sent.some(x=>x.type==='rtc_offer'&&x.to_user_id==='c'));
  client.rtc.leaveRoom();
});

test('rtc_peer_joined creates a previously missing listener peer once',async()=>{
  const client=createClient('a');
  await client.ready([]);
  await client.event({type:'rtc_peer_joined',user_id:'b'});
  assert.equal(client.active().length,1);
  const count=client.connections.length;
  await client.event({type:'rtc_peer_joined',user_id:'b'});
  assert.equal(client.connections.length,count);
  client.rtc.leaveRoom();
});

test('rtc_roster recreates missing peers and removes departed peers',async()=>{
  const client=createClient('a');
  await client.ready(['b']);
  await client.event({type:'rtc_roster',peers:['c']});
  assert.equal(client.active().length,1);
  assert.equal(client.active()[0].id,'c');
  assert.equal(client.connections[0].closed,true);
  client.rtc.leaveRoom();
});

test('rtc_peer_left closes peer without requesting microphone',async()=>{
  const client=createClient('a');
  await client.ready(['b']);
  await client.event({type:'rtc_peer_left',user_id:'b'});
  assert.equal(client.active().length,0);
  assert.equal(client.connections[0].closed,true);
  assert.equal(client.rtc.state().microphone,false);
  client.rtc.leaveRoom();
});

test('recover requests fresh offer for peer with missing remote track',async()=>{
  const client=createClient('a');
  await client.ready(['b']);
  const peer=client.connections[0];
  peer.signalingState='stable';
  peer.connectionState='connected';
  peer.iceConnectionState='connected';
  peer.receivers=[];
  const initial=client.sent.filter(x=>x.type==='rtc_offer').length;
  client.rtc.recover();
  await client.flush();
  assert.ok(client.sent.filter(x=>x.type==='rtc_offer').length>initial);
  client.rtc.leaveRoom();
});
