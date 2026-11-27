const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(
  'frontend/room-live.js','utf8'
);

const start=source.indexOf(
  '  function renderSeatNobilityBadge('
);

const end=source.indexOf(
  '  function renderRoomSeats(',start
);

assert.ok(start>=0 && end>start);

function setup(){
  const calls=[];
  const classes=new Set();

  const button={
    classList:{
      toggle:(name,enabled)=>{
        if(enabled)classes.add(name);
        else classes.delete(name);
      }
    },
    querySelector:selector=>selector
  };

  const window={
    LidyaNobilityAppearance:{
      resolve:(data,id)=>{
        return data?.privileges?.includes(id)
          ? 'badge.png' : null;
      },
      badge:(target,data)=>{
        calls.push({target,data});
      }
    }
  };

  const context={window};

  vm.runInNewContext(
    source.slice(start,end)+
    'globalThis.render=renderSeatNobilityBadge;',
    context
  );

  return {
    calls,
    classes,
    render:(seat,staff=false)=>{
      context.render(button,seat,staff);
    }
  };
}

const knight={
  user_id:'u1',
  nobility:{
    rank:1,
    privileges:['badge','frame']
  }
};

test('Sovalye rozeti gorunur koltuk alaninda',()=>{
  const h=setup();
  h.render(knight);

  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].target,'.seat-pod');
  assert.ok(h.classes.has('lidya-knight-seat'));
});

test('Bos koltukta rozet yok',()=>{
  const h=setup();
  h.render({user_id:null});

  assert.equal(h.calls.length,0);
});

test('Asaletsiz kullanici premium alan alamaz',()=>{
  const h=setup();

  h.render({
    user_id:'u2',
    nobility:{rank:0,privileges:[]}
  });

  assert.equal(h.calls[0].target,'b');
  assert.equal(h.classes.size,0);
});

test('Rozet yetkisi yoksa premium alan yok',()=>{
  const h=setup();

  h.render({
    user_id:'u3',
    nobility:{rank:1,privileges:[]}
  });

  assert.equal(h.classes.size,0);
});

test('Yonetim kimligi korunur',()=>{
  const h=setup();
  h.render(knight,true);

  assert.equal(h.calls[0].target,'b');
  assert.equal(h.classes.size,0);
});

for(const rank of [3,4]){
  test('Diger rutbe korunur: '+rank,()=>{
    const h=setup();

    h.render({
      user_id:'u4',
      nobility:{rank,privileges:['badge']}
    });

    assert.equal(h.calls[0].target,'b');
    assert.equal(h.classes.size,0);
  });
}


test('Kont rozeti koltuk alaninda gorunur',()=>{
  const h=setup();

  h.render({
    user_id:'count-user',
    nobility:{rank:2,privileges:['badge']}
  });

  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].target,'.seat-pod');
  assert.equal(h.calls[0].data.rank,2);
  assert.ok(h.classes.has('lidya-knight-seat'));
});

test('Kont rozeti cikarilinca premium alan kapanir',()=>{
  const h=setup();

  h.render({
    user_id:'count-user',
    nobility:{rank:2,privileges:['badge']}
  });

  h.render({
    user_id:'count-user',
    nobility:{rank:2,privileges:['frame']}
  });

  assert.equal(h.classes.size,0);
  assert.equal(h.calls.at(-1).target,'b');
});

test('Kont yonetim koltuk yerlesimini korur',()=>{
  const h=setup();

  h.render({
    user_id:'count-user',
    nobility:{rank:2,privileges:['badge']}
  },true);

  assert.equal(h.classes.size,0);
  assert.equal(h.calls[0].target,'b');
});
