const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  'frontend/nobility-banners.js','utf8'
);

function setup(){
  const cards = [];
  const timers = new Map();
  let counter = 0;

  function element(){
    return {
      children:[],
      append(...items){this.children.push(...items)},
      remove(){
        const index = cards.indexOf(this);
        if(index >= 0) cards.splice(index,1);
      }
    };
  }

  const document = {
    hidden:false,
    createElement:element,
    addEventListener(){},
    body:{
      appendChild(card){cards.push(card)}
    }
  };

  const window = {
    addEventListener(){},
    LidyaNobilityAssets:{
      resolve:(rank,kind)=>`${rank}/${kind}.png`
    }
  };

  vm.runInNewContext(source,{
    window,document,
    setTimeout(fn){
      const id = ++counter;
      timers.set(id,fn);
      return id;
    },
    clearTimeout(id){timers.delete(id)}
  });

  return {
    api:window.LidyaNobilityBanners,
    document,cards,
    tick(){
      const entry = timers.entries().next().value;
      if(entry){
        timers.delete(entry[0]);
        entry[1]();
      }
    }
  };
}

function payload(rank=4,kind='gift_banner',id='1'){
  return {
    type:'nobility_banner',
    rank,kind,id,
    nickname:'Test Kullanici',
    scope:kind==='room_welcome' ||
      (kind==='activation_banner' && rank<3)
      ? 'room':'global'
  };
}

for(const kind of [
  'gift_banner','activation_banner',
  'daily_banner','room_welcome'
]){
  for(let rank=1;rank<=4;rank++){
    test(`${kind} rank ${rank}`,()=>{
      const {api}=setup();

      const allowed =
        !['daily_banner','room_welcome'].includes(kind)
        || rank>=3;

      assert.equal(
        api.validate(payload(rank,kind)),
        allowed
      );
    });
  }
}

for(const rank of [0,5,-1,1.5,'4',null]){
  test(`invalid rank ${rank}`,()=>{
    const {api}=setup();
    assert.equal(api.validate(payload(rank)),false);
  });
}

test('invalid scope',()=>{
  const {api}=setup();
  assert.equal(api.validate({
    ...payload(),scope:'room'
  }),false);
});

test('invalid kind',()=>{
  const {api}=setup();
  assert.equal(
    api.validate(payload(4,'unknown')),false
  );
});

test('duplicate banner',()=>{
  const {api,cards}=setup();
  assert.equal(api.show(payload()),true);
  assert.equal(api.show(payload()),false);
  assert.equal(cards.length,1);
});

test('hidden screen',()=>{
  const {api,document,cards}=setup();
  document.hidden=true;
  assert.equal(api.show(payload()),false);
  assert.equal(cards.length,0);
});

test('sequential queue',()=>{
  const {api,cards,tick}=setup();

  api.show(payload(4,'gift_banner','1'));
  api.show(payload(3,'daily_banner','2'));

  assert.equal(cards.length,1);
  tick();
  assert.equal(cards.length,1);
  tick();
  assert.equal(cards.length,0);
});

test('queue limit',()=>{
  const {api}=setup();

  for(let i=0;i<9;i++){
    assert.equal(
      api.show(payload(4,'gift_banner',String(i))),
      true
    );
  }

  assert.equal(
    api.show(payload(4,'gift_banner','overflow')),
    false
  );
});

test('clear removes active banner',()=>{
  const {api,cards,tick}=setup();
  api.show(payload());
  api.clear();
  tick();
  assert.equal(cards.length,0);
});

test('nickname rendered as text',()=>{
  const {api,cards}=setup();

  api.show({
    ...payload(),
    nickname:'<script>alert(1)</script>'
  });

  assert.ok(
    cards[0].children[1].textContent
      .includes('<script>alert(1)</script>')
  );
});
