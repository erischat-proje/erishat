const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(){
  const cards = [];
  const animations = [];
  const listeners = {};
  const socketListeners = {};

  function element(){
    return {
      children:[],
      append(...nodes){
        this.children.push(...nodes);
      },
      remove(){}
    };
  }

  const document = {
    hidden:false,
    getElementById(){return null},
    createElement:element,
    addEventListener(){},
    body:{
      appendChild(card){cards.push(card)}
    }
  };

  const socket = {
    __erisRoomId:'room-1',
    readyState:0,
    addEventListener(name,fn){
      socketListeners[name]=fn;
    },
    removeEventListener(){}
  };

  const window = {
    __erisRoomSocket:socket,
    fetch:async()=>({ok:true}),
    addEventListener(name,fn){
      (listeners[name] ||= []).push(fn);
    },
    dispatchEvent(e){
      if(e.type==='erischat:room-gift'){
        animations.push(e.detail);
      }

      for(const fn of listeners[e.type]||[]){
        fn(e);
      }
    },
    LidyaNobilityAssets:{
      resolve:(rank,kind)=>`${rank}/${kind}.png`
    }
  };

  const context = vm.createContext({
    window,
    document,
    WebSocket:{OPEN:1},
    CustomEvent:class {
      constructor(type,options){
        this.type=type;
        this.detail=options.detail;
      }
    },
    setTimeout(){return 1},
    clearTimeout(){}
  });

  for(const file of [
    'nobility-banners.js',
    'gift-live.js'
  ]){
    vm.runInContext(
      fs.readFileSync('frontend/'+file,'utf8'),
      context
    );
  }

  window.connectRoomGiftSocket('room-1');

  return {
    window,cards,animations,
    receive(data){
      socketListeners.message({
        data:JSON.stringify(data)
      });
    }
  };
}

function banner(ids=['101'],rank=1){
  return {
    type:'nobility_banner',
    kind:'gift_banner',
    scope:'global',
    id:'gift:'+ids[0],
    rank,
    nickname:'Test Knight',
    gift:{
      name:'Toprak Bardak',
      quantity:3,
      image_url:'/hediyesistemi/28.png',
      event_ids:ids
    }
  };
}

function gift(id='101',type='room_gift'){
  return {
    type,id,
    gift_key:'28',
    quantity:3,
    total_price:84
  };
}

test('Equipped Knight replaces normal animation',()=>{
  const s=setup();

  s.receive(banner());
  s.receive(gift());

  assert.equal(s.cards.length,1);
  assert.equal(s.animations.length,0);
});

test('Disabled banner preserves normal animation',()=>{
  const s=setup();

  s.receive(gift());

  assert.equal(s.cards.length,0);
  assert.equal(s.animations.length,1);
});

test('Multiple recipients use one special banner',()=>{
  const s=setup();

  s.receive(banner(['101','102','103']));

  for(const id of ['101','102','103']){
    s.receive(gift(id));
  }

  assert.equal(s.cards.length,1);
  assert.equal(s.animations.length,0);
});

test('Global duplicate animation is suppressed',()=>{
  const s=setup();

  s.receive(banner());

  s.receive(gift());
  s.receive(gift('101','gift_announcement'));

  assert.equal(s.animations.length,0);
});

test('Unrelated gift animation is not suppressed',()=>{
  const s=setup();

  s.receive(banner());

  s.receive(gift('202'));

  assert.equal(s.animations.length,1);
});

test('Other ranks preserve legacy animations',()=>{
  for(const rank of [4]){
    const s=setup();

    s.receive(banner(['101'],rank));
    s.receive(gift());

    assert.equal(s.animations.length,1);
  }
});

test('Invalid dynamic artwork preserves animation',()=>{
  const s=setup();

  const data=banner();
  data.gift.image_url='https://invalid.example/a.png';

  s.receive(data);
  s.receive(gift());

  assert.equal(s.animations.length,1);
});

test('Legacy Knight event preserves animation',()=>{
  const s=setup();

  const data=banner();
  delete data.gift;

  s.receive(data);
  s.receive(gift());

  assert.equal(s.animations.length,1);
});

test('Duplicate banner cannot create second card',()=>{
  const s=setup();

  s.receive(banner());
  s.receive(banner());

  assert.equal(s.cards.length,1);
});

test('Rejected full queue falls back to animation',()=>{
  const s=setup();

  for(let i=0;i<9;i++){
    s.receive(banner([String(300+i)]));
  }

  s.receive(banner(['999']));
  s.receive(gift('999'));

  assert.equal(s.animations.length,1);
});

test('Authentication change clears suppressed IDs',()=>{
  const s=setup();

  s.receive(banner());

  s.window.dispatchEvent({
    type:'erischat:auth'
  });

  s.receive(gift());

  assert.equal(s.animations.length,1);
});

test('Dynamic banner does not depend on old artwork',()=>{
  const s=setup();

  delete s.window.LidyaNobilityAssets;

  s.receive(banner());
  s.receive(gift());

  assert.equal(s.cards.length,1);
  assert.equal(s.animations.length,0);
});

test('Notification offset exists for dynamic banner',()=>{
  const css=fs.readFileSync(
    'frontend/nobility.css','utf8'
  );

  assert.ok(css.includes(
    'body:has(.lidya-knight-dynamic-gift) #eris-notice-stack'
  ));
});
