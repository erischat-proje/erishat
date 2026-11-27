const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(){
  const cards=[];

  function element(){
    return {
      children:[],
      append(...nodes){
        this.children.push(...nodes);
      },
      remove(){}
    };
  }

  const document={
    hidden:false,
    createElement:element,
    addEventListener(){},
    body:{
      appendChild(card){cards.push(card)}
    }
  };

  const window={
    addEventListener(){},
    LidyaNobilityAssets:{
      resolve:(r,k)=>`${r}/${k}.png`
    }
  };

  vm.runInNewContext(
    fs.readFileSync('frontend/nobility-banners.js','utf8'),
    {
      document,window,
      setTimeout(){return 1},
      clearTimeout(){}
    }
  );

  return {
    cards,document,
    api:window.LidyaNobilityBanners
  };
}

function event(kind,action='activate'){
  return {
    type:'nobility_banner',
    rank:3,
    kind,
    scope:kind==='room_welcome'?'room':'global',
    id:'duke:'+kind,
    nickname:'Devil🖤',
    action
  };
}

for(const [action,expected] of [
  ['activate','Dük asaletine ulaştı!'],
  ['upgrade','Dük seviyesine yükseldi!'],
  ['renew','Dük asaletini yeniledi!']
]){
  test('Duke activation '+action,()=>{
    const h=setup();

    assert.equal(
      h.api.show(event('activation_banner',action)),
      true
    );

    const card=h.cards[0];
    const panel=card.children[1];

    assert.match(card.className,/lidya-duke-notice/);
    assert.equal(card.children[0].src,'3/activation_banner.png');
    assert.equal(panel.children[0].textContent,'DÜK');
    assert.equal(panel.children[1].textContent,'Devil🖤');
    assert.equal(panel.children[2].textContent,expected);
  });
}

for(const [kind,expected] of [
  ['daily_banner','Bugün aramızda!'],
  ['room_welcome','Odaya hoş geldin!']
]){
  test('Duke '+kind,()=>{
    const h=setup();

    assert.equal(h.api.show(event(kind)),true);

    const card=h.cards[0];

    assert.equal(card.children[0].src,`3/${kind}.png`);
    assert.equal(
      card.children[1].children[2].textContent,
      expected
    );
  });

  test('Invalid scope '+kind,()=>{
    const h=setup();
    const data=event(kind);

    data.scope=data.scope==='room'?'global':'room';

    assert.equal(h.api.show(data),false);
    assert.equal(h.cards.length,0);
  });
}

test('Duke activation cannot use room scope',()=>{
  const h=setup();
  const data=event('activation_banner');
  data.scope='room';

  assert.equal(h.api.show(data),false);
});

test('Count cannot access Duke daily notice',()=>{
  const h=setup();
  const data=event('daily_banner');
  data.rank=2;

  assert.equal(h.api.show(data),false);
});

test('Duke nickname remains literal text',()=>{
  const h=setup();
  const data=event('daily_banner');

  data.nickname='<b>Devil</b>';

  h.api.show(data);

  assert.equal(
    h.cards[0].children[1].children[1].textContent,
    '<b>Devil</b>'
  );
});

test('Duke notice image fallback',()=>{
  const h=setup();
  h.api.show(event('room_welcome'));

  const card=h.cards[0];

  card.children[0].onerror();

  assert.equal(card.children[0].hidden,true);

  assert.match(
    card.className,
    /ln-duke-notice-fallback/
  );

  assert.equal(
    card.children[1].children[1].textContent,
    'Devil🖤'
  );
});

test('Duplicate Duke notice rejected',()=>{
  const h=setup();
  const data=event('daily_banner');

  assert.equal(h.api.show(data),true);
  assert.equal(h.api.show(data),false);
  assert.equal(h.cards.length,1);
});

test('Hidden document rejects Duke notice',()=>{
  const h=setup();
  h.document.hidden=true;

  assert.equal(
    h.api.show(event('daily_banner')),
    false
  );
});

test('King notice retains legacy rendering',()=>{
  const h=setup();
  const data=event('daily_banner');
  data.rank=4;

  assert.equal(h.api.show(data),true);

  assert.doesNotMatch(
    h.cards[0].className,
    /lidya-duke-notice/
  );
});

test('Notices never suppress gift animation',()=>{
  const h=setup();

  for(const kind of [
    'activation_banner',
    'daily_banner',
    'room_welcome'
  ]){
    assert.equal(
      h.api.replacesGift(event(kind)),
      false
    );
  }
});
