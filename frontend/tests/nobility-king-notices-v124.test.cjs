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
    rank:4,
    kind,
    scope:kind==='room_welcome'?'room':'global',
    id:'king:'+kind,
    nickname:'Devil🖤',
    action
  };
}

for(const [action,expected] of [
  ['activate','Kral asaletine ulaştı!'],
  ['upgrade','Kral seviyesine yükseldi!'],
  ['renew','Kral asaletini yeniledi!']
]){
  test('King activation '+action,()=>{
    const h=setup();

    assert.equal(
      h.api.show(event('activation_banner',action)),
      true
    );

    const card=h.cards[0];
    const panel=card.children[1];

    assert.match(card.className,/lidya-king-notice/);
    assert.equal(card.children[0].src,'4/activation_banner.png');
    assert.equal(panel.children[0].textContent,'KRAL');
    assert.equal(panel.children[1].textContent,'Devil🖤');
    assert.equal(panel.children[2].textContent,expected);
  });
}

for(const [kind,expected] of [
  ['daily_banner','Bugün aramızda!'],
  ['room_welcome','Odaya hoş geldin!']
]){
  test('King '+kind,()=>{
    const h=setup();

    assert.equal(h.api.show(event(kind)),true);

    const card=h.cards[0];

    assert.equal(card.children[0].src,`4/${kind}.png`);
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

test('King activation cannot use room scope',()=>{
  const h=setup();
  const data=event('activation_banner');
  data.scope='room';

  assert.equal(h.api.show(data),false);
});

test('Count cannot access King daily notice',()=>{
  const h=setup();
  const data=event('daily_banner');
  data.rank=2;

  assert.equal(h.api.show(data),false);
});

test('King nickname remains literal text',()=>{
  const h=setup();
  const data=event('daily_banner');

  data.nickname='<b>Devil</b>';

  h.api.show(data);

  assert.equal(
    h.cards[0].children[1].children[1].textContent,
    '<b>Devil</b>'
  );
});

test('King notice image fallback',()=>{
  const h=setup();
  h.api.show(event('room_welcome'));

  const card=h.cards[0];

  card.children[0].onerror();

  assert.equal(card.children[0].hidden,true);

  assert.match(
    card.className,
    /ln-king-activation-fallback/
  );

  assert.equal(
    card.children[1].children[1].textContent,
    'Devil🖤'
  );
});

test('Duplicate King notice rejected',()=>{
  const h=setup();
  const data=event('daily_banner');

  assert.equal(h.api.show(data),true);
  assert.equal(h.api.show(data),false);
  assert.equal(h.cards.length,1);
});

test('Hidden document rejects King notice',()=>{
  const h=setup();
  h.document.hidden=true;

  assert.equal(
    h.api.show(event('daily_banner')),
    false
  );
});

test('Duke notice remains independent of King',()=>{
  const h=setup();
  const data=event('daily_banner');
  data.rank=3;

  assert.equal(h.api.show(data),true);

  assert.doesNotMatch(
    h.cards[0].className,
    /lidya-king-notice/
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
