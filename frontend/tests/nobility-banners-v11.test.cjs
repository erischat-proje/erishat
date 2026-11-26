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


// KNIGHT PREMIUM BANNER V1.7.1

test('Knight gift premium design',()=>{
  const {api,cards}=setup();

  assert.equal(
    api.show(payload(1,'gift_banner')),
    true
  );

  assert.ok(
    cards[0].className.includes(
      'lidya-knight-gift-banner'
    )
  );

  assert.equal(
    cards[0].children[0].src,
    '1/gift_banner.png'
  );
});

test('Knight activation premium design',()=>{
  const {api,cards}=setup();

  api.show(payload(1,'activation_banner'));

  assert.ok(
    cards[0].className.includes(
      'lidya-knight-activation-banner'
    )
  );

  assert.equal(
    cards[0].children[0].src,
    '1/activation_banner.png'
  );
});

test('Knight renewal message',()=>{
  const {api,cards}=setup();

  api.show({
    ...payload(1,'activation_banner'),
    action:'renew'
  });

  assert.ok(
    cards[0].children[1].textContent
      .includes('yeniledi')
  );
});

test('Knight image error fallback',()=>{
  const {api,cards}=setup();

  api.show(payload(1,'gift_banner'));

  const card=cards[0];
  card.children[0].onerror();

  assert.equal(
    card.children[0].hidden,true
  );

  assert.ok(
    card.className.includes(
      'lidya-knight-banner-fallback'
    )
  );

  assert.ok(card.children[1].textContent);
});

test('Knight long nickname limited',()=>{
  const {api,cards}=setup();

  api.show({
    ...payload(1,'gift_banner'),
    nickname:'X'.repeat(500)
  });

  assert.equal(
    (cards[0].children[1].textContent.match(/X/g)||[]).length,
    80
  );
});

test('Knight banners remain sequential',()=>{
  const {api,cards,tick}=setup();

  api.show(payload(1,'gift_banner','knight-1'));
  api.show(payload(1,'activation_banner','knight-2'));

  assert.equal(cards.length,1);

  tick();

  assert.equal(cards.length,1);

  assert.ok(
    cards[0].className.includes(
      'lidya-knight-activation-banner'
    )
  );

  tick();

  assert.equal(cards.length,0);
});

test('Knight activation cannot be global',()=>{
  const {api}=setup();

  assert.equal(
    api.show({
      ...payload(1,'activation_banner'),
      scope:'global'
    }),
    false
  );
});

for(const rank of [2,3,4]){
  test('Other rank design preserved: '+rank,()=>{
    const {api,cards}=setup();

    api.show(payload(rank,'gift_banner'));

    assert.equal(
      cards[0].className,
      'lidya-nobility-live-banner'
    );
  });
}
