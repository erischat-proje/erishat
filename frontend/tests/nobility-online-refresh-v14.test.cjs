const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../room-reference-ui.js'),
  'utf8'
);

const start = source.indexOf(
  '  let onlineUsersState=null;'
);

const end = source.indexOf(
  '  function renderOnlineUsers(', start
);

assert.ok(start >= 0 && end > start);

function setup(){
  let room = 'room1';
  let user = 'user1';
  let opened = true;
  let sequence = 0;
  let calls = 0;
  let rows = [{user_id:'u1'}];
  let loader = async()=>rows;

  const timers = new Map();
  const events = new Map();
  const renders = [];

  const panel = {
    classList: {
      contains:()=>opened
    },
    querySelector:()=>({
      classList:{contains:()=>true}
    })
  };

  const body = {
    isConnected:true,
    scrollTop:0,
    textContent:'',
    closest:()=>panel,
    replaceChildren(){
      this.textContent='';
    }
  };

  const document = {
    hidden:false,
    addEventListener:(name,fn)=>{
      events.set(name,fn);
    }
  };

  const window = {
    addEventListener:(name,fn)=>{
      events.set(name,fn);
    }
  };

  const context = {
    document,
    window,
    roomId:()=>room,
    userId:()=>user,
    surface:()=>({
      classList:{contains:()=>true}
    }),
    roomApi:()=>({
      onlineMembers:async()=>{
        calls++;
        return loader();
      },
      superKickStatus:async()=>null
    }),
    setTimeout:(fn,delay)=>{
      assert.equal(delay,15000);
      const id=++sequence;
      timers.set(id,fn);
      return id;
    },
    clearTimeout:id=>timers.delete(id),
    renderOnlineUsers:(body,r,list)=>{
      renders.push(JSON.stringify(list));
      body.scrollTop=0;
    }
  };

  vm.runInNewContext(
    source.slice(start,end)+`
      globalThis.controller={
        users,
        stopOnlineUsers,
        get state(){return onlineUsersState}
      };
    `,
    context
  );

  return {
    body,
    document,
    renders,
    timers,
    get calls(){return calls},
    get state(){return context.controller.state},
    setRows:value=>{rows=value},
    setLoader:fn=>{loader=fn},
    close:()=>{opened=false},
    changeRoom:()=>{room='room2'},
    changeUser:()=>{user='user2'},
    emit:name=>events.get(name)?.(),
    start:()=>context.controller.users(
      body,{id:room}
    ),
    async tick(){
      const entry=timers.entries().next().value;
      assert.ok(entry,'Timer bulunamadi');
      const [id,fn]=entry;
      timers.delete(id);
      await fn();
    }
  };
}

test('Ilk liste yuklenir',async()=>{
  const h=setup();
  await h.start();

  assert.equal(h.calls,1);
  assert.equal(h.renders.length,1);
  assert.equal(h.timers.size,1);
});

test('Degismeyen liste tekrar cizilmez',async()=>{
  const h=setup();
  await h.start();
  await h.tick();

  assert.equal(h.calls,2);
  assert.equal(h.renders.length,1);
});

test('Yeni kullanici otomatik gorunur',async()=>{
  const h=setup();
  await h.start();

  h.setRows([
    {user_id:'u1'},
    {user_id:'u2'}
  ]);

  await h.tick();

  assert.equal(h.renders.length,2);
  assert.equal(
    JSON.parse(h.renders[1]).length,2
  );
});

test('Kaydirma konumu korunur',async()=>{
  const h=setup();
  await h.start();

  h.body.scrollTop=175;
  h.setRows([{user_id:'u2'}]);

  await h.tick();

  assert.equal(h.body.scrollTop,175);
});

test('Kapali listede ag istegi durur',async()=>{
  const h=setup();
  await h.start();
  h.close();

  await h.tick();

  assert.equal(h.calls,1);
  assert.equal(h.timers.size,0);
});

test('Arka planda ag istegi gonderilmez',async()=>{
  const h=setup();
  await h.start();

  h.document.hidden=true;
  await h.tick();

  assert.equal(h.calls,1);

  h.document.hidden=false;
  await h.tick();

  assert.equal(h.calls,2);
});

test('Aktif islemde yenileme engellenir',async()=>{
  const h=setup();
  await h.start();

  h.state.busy=1;
  await h.tick();

  assert.equal(h.calls,1);

  h.state.busy=0;
  await h.tick();

  assert.equal(h.calls,2);
});

test('Eszamanli istek engellenir',async()=>{
  const h=setup();
  await h.start();

  let resolve;

  h.setLoader(()=>new Promise(r=>{
    resolve=r;
  }));

  const pending=h.tick();

  await h.state.refresh();

  assert.equal(h.calls,2);

  resolve([{user_id:'u2'}]);
  await pending;

  assert.equal(h.renders.length,2);
  assert.equal(h.timers.size,1);
});

test('Eski oda yaniti reddedilir',async()=>{
  const h=setup();
  await h.start();

  let resolve;

  h.setLoader(()=>new Promise(r=>{
    resolve=r;
  }));

  const pending=h.tick();

  h.changeRoom();

  resolve([{user_id:'old-room-user'}]);
  await pending;

  assert.equal(h.renders.length,1);
  assert.equal(h.timers.size,0);
});

test('Eski hesap yaniti reddedilir',async()=>{
  const h=setup();
  await h.start();

  let resolve;

  h.setLoader(()=>new Promise(r=>{
    resolve=r;
  }));

  const pending=h.tick();

  h.changeUser();

  resolve([{user_id:'old-account-user'}]);
  await pending;

  assert.equal(h.renders.length,1);
  assert.equal(h.timers.size,0);
});

test('Oturum degisiminde zamanlayici temizlenir',async()=>{
  const h=setup();
  await h.start();

  h.emit('erischat:auth');

  assert.equal(h.state,null);
  assert.equal(h.timers.size,0);
});

test('Oda degisiminde zamanlayici temizlenir',async()=>{
  const h=setup();
  await h.start();

  h.emit('erischat:room-opened');

  assert.equal(h.state,null);
  assert.equal(h.timers.size,0);
});

test('Baglanti hatasindan sonra liste kurtarilir',async()=>{
  const h=setup();
  await h.start();

  h.setLoader(async()=>{
    throw new Error('Network error');
  });

  await h.tick();

  assert.equal(h.state.signature,null);
  assert.equal(h.timers.size,1);

  h.setLoader(async()=>[
    {user_id:'reconnected'}
  ]);

  await h.tick();

  assert.equal(h.renders.length,2);
  assert.equal(h.timers.size,1);
});
