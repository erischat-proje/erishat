const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({accepted=true}={}) {
  const listeners = new Map();
  const events = [];
  const overlays = [];
  const timers = [];
  const socketListeners = new Map();

  function element(tag) {
    return {
      tag,
      dataset: {},
      children: [],
      setAttribute() {},
      append(...items) {
        this.children.push(...items);
      },
      remove() {
        const i = overlays.indexOf(this);
        if(i >= 0) overlays.splice(i,1);
      }
    };
  }

  const document = {
    baseURI: 'https://test.lidyachat.invalid/',
    currentScript: null,
    addEventListener() {},
    getElementById() { return null; },
    createElement: element,
    querySelector(selector) {
      return selector === '.vp-gift-seal'
        ? overlays.find(x=>x.className==='vp-gift-seal') || null
        : null;
    },
    querySelectorAll() {
      return [...overlays];
    },
    body: {
      append(node) { overlays.push(node); }
    }
  };

  const socket = {
    __erisRoomId: 'room-test',
    readyState: 1,
    addEventListener(type,fn) {
      socketListeners.set(type,fn);
    },
    removeEventListener(type,fn) {
      if(socketListeners.get(type)===fn)
        socketListeners.delete(type);
    }
  };

  const window = {
    document,
    fetch: async()=>({ok:true}),
    __erisRoomSocket: socket,
    LidyaNobilityBanners: {
      replacesGift: ()=>true,
      show: ()=>accepted
    },
    addEventListener(type,fn) {
      if(!listeners.has(type))listeners.set(type,[]);
      listeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      events.push(event);
      for(const fn of listeners.get(event.type)||[]) {
        fn(event);
      }
    }
  };

  const context = vm.createContext({
    window, document, URL, console,
    localStorage: {getItem:()=>null},
    WebSocket: {OPEN:1},
    CustomEvent: class {
      constructor(type,options={}) {
        this.type=type;
        this.detail=options.detail;
      }
    },
    setTimeout(fn) {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout() {}
  });

  for(const file of [
    'frontend/gift-live.js',
    'frontend/vip-privileges.js'
  ]) {
    vm.runInContext(
      fs.readFileSync(file,'utf8'),
      context,
      {filename:file}
    );
  }

  window.connectRoomGiftSocket('room-test');

  const send = data => {
    socketListeners.get('message')?.({
      data:JSON.stringify(data)
    });
  };

  const count = type =>
    events.filter(x=>x.type===type).length;

  const gift = (extra={}) => ({
    type:'room_gift',
    id:101,
    room_id:'room-test',
    sender_name:'VIP Test',
    gift_name:'Altın Hediye',
    total_price:100,
    vip_benefits:{
      gift_seal:'lion',
      gift_motion:'rain',
      gift_scene:'enabled'
    },
    ...extra
  });

  const banner = () => send({
    type:'nobility_banner',
    gift:{event_ids:['101']}
  });

  return {
    window, send, gift, banner,
    count, overlays, timers
  };
}

test('Normal gift and VIP effect coexist',()=>{
  const h=setup();

  h.send(h.gift());

  assert.equal(h.count('erischat:room-gift'),1);
  assert.equal(h.count('lidyachat:vip-gift-effect'),1);
  assert.equal(h.overlays.length,1);
  assert.equal(h.overlays[0].dataset.nobility,'false');
  assert.equal(h.overlays[0].dataset.motion,'rain');
});

test('Nobility replaces normal gift but preserves VIP',()=>{
  const h=setup();

  h.banner();
  h.send(h.gift());

  assert.equal(h.count('erischat:room-gift'),0);
  assert.equal(h.count('lidyachat:vip-gift-effect'),1);
  assert.equal(h.overlays.length,1);
  assert.equal(h.overlays[0].dataset.nobility,'true');
});

test('Rejected nobility banner preserves regular gift',()=>{
  const h=setup({accepted:false});

  h.banner();
  h.send(h.gift());

  assert.equal(h.count('erischat:room-gift'),1);
  assert.equal(h.overlays.length,1);
  assert.equal(h.overlays[0].dataset.nobility,'false');
});

test('Duplicate and global events do not replay VIP',()=>{
  const h=setup();

  h.send(h.gift());

  const first=h.overlays[0];

  h.send(h.gift());
  h.send(h.gift({type:'gift_announcement'}));

  assert.equal(h.overlays.length,1);
  assert.equal(h.overlays[0],first);
  assert.equal(h.timers.length,1);

  h.timers[0]();

  assert.equal(h.overlays.length,0);
});

test('Hidden VIP and disconnected socket show no effect',()=>{
  const h=setup();

  h.send(h.gift({vip_benefits:{}}));

  assert.equal(h.overlays.length,0);

  h.window.disconnectRoomGiftSocket();
  h.send(h.gift());

  assert.equal(h.overlays.length,0);
});
