const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(
  'frontend/profile-live.js','utf8'
);

const start=source.indexOf('  const esc =');
const end=source.indexOf(
  '  function confirmFollowAction(',start
);

assert.ok(start>=0&&end>start);

const window={
  LidyaNobilityAppearance:{
    resolve:(data,id)=>{
      return [1,2,3].includes(data?.rank) &&
        data.privileges?.includes(id)
        ? './assets/lidya-nobility/'+
          ({1:'knight',2:'count',3:'duke'}[data.rank])+'/'+id+'.png'
        : null;
    }
  }
};

const context={window};

vm.runInNewContext(
  source.slice(start,end)+`
    globalThis.render=followAvatar;
    globalThis.authorized=followKnightData;
  `,
  context
);

const knight={
  avatar_asset:'/assets/avatar.png',
  frame_asset:'/assets/normal-frame.png',
  nobility:{
    rank:1,
    privileges:['badge','frame']
  }
};

test('Sovalye cercevesi kullanilir',()=>{
  const html=context.render(knight);

  assert.ok(html.includes('/knight/frame.png'));
  assert.ok(!html.includes('normal-frame.png'));
});

test('Tek cerceve olusturulur',()=>{
  const html=context.render(knight);

  assert.equal(
    (html.match(/class="eris-follow-frame"/g)||[]).length,
    1
  );
});

test('Uyelik sona erince normal cerceve doner',()=>{
  const html=context.render({
    ...knight,
    nobility:{rank:0,privileges:[]}
  });

  assert.ok(html.includes('normal-frame.png'));
  assert.ok(!html.includes('/knight/frame.png'));
});

test('Yetkisiz cerceve gosterilmez',()=>{
  const html=context.render({
    ...knight,
    nobility:{rank:1,privileges:['badge']}
  });

  assert.ok(!html.includes('/knight/frame.png'));
});

for(const role of ['SA','UA','FA','DA']){
  test('Yonetim kimligi korunur: '+role,()=>{
    const user={...knight,admin_role:role};

    assert.equal(context.authorized(user),null);

    assert.ok(
      context.render(user).includes('normal-frame.png')
    );
  });
}

for(const rank of [0,4]){
  test('Diger rutbe korunur: '+rank,()=>{
    const user={
      ...knight,
      nobility:{
        rank,
        privileges:['badge','frame']
      }
    };

    assert.equal(context.authorized(user),null);
  });
}

test('Yonetim kilidi korunur',()=>{
  assert.equal(
    context.authorized({
      ...knight,
      management_locked:true
    }),
    null
  );
});

test('Yonetim cercevesi korunur',()=>{
  const user={
    ...knight,
    frame_asset:'/role-icons/management-v1/light/frame.png'
  };

  assert.equal(context.authorized(user),null);
});

test('Asalet bilgisi yoksa normal gorunum',()=>{
  assert.ok(context.render({
    frame_asset:'/assets/normal-frame.png'
  }).includes('normal-frame.png'));
});


const count={
  ...knight,
  nobility:{
    rank:2,
    privileges:['badge','frame']
  }
};

test('Kont kendi cercevesini kullanir',()=>{
  const html=context.render(count);

  assert.ok(html.includes('/count/frame.png'));
  assert.ok(!html.includes('/knight/frame.png'));
  assert.ok(!html.includes('normal-frame.png'));

  assert.equal(
    (html.match(/class="eris-follow-frame"/g)||[]).length,
    1
  );
});

test('Kont cercevesi cikarilinca normal cerceve doner',()=>{
  const html=context.render({
    ...count,
    nobility:{rank:2,privileges:['badge']}
  });

  assert.ok(html.includes('normal-frame.png'));
  assert.ok(!html.includes('/count/frame.png'));
});

for(const role of ['SA','UA','FA','DA']){
  test('Kont yonetim kimligini korur: '+role,()=>{
    assert.equal(
      context.authorized({...count,admin_role:role}),
      null
    );
  });
}

test('Kont yonetim kilidini korur',()=>{
  assert.equal(
    context.authorized({...count,management_locked:true}),
    null
  );
});


// DUKE PROFILE V1.21.5.1

const duke={
  ...knight,
  nobility:{
    rank:3,
    privileges:['badge','frame']
  }
};

test('Duke own profile frame',()=>{
  const html=context.render(duke);

  assert.ok(html.includes('/duke/frame.png'));
  assert.ok(!html.includes('/knight/frame.png'));
  assert.ok(!html.includes('/count/frame.png'));
  assert.ok(!html.includes('normal-frame.png'));

  assert.equal(
    (html.match(/class="eris-follow-frame"/g)||[]).length,
    1
  );
});

test('Duke frame unequipped',()=>{
  const html=context.render({
    ...duke,
    nobility:{rank:3,privileges:['badge']}
  });

  assert.ok(html.includes('normal-frame.png'));
  assert.ok(!html.includes('/duke/frame.png'));
});

for(const role of ['SA','UA','FA','DA']){
  test('Duke staff protection: '+role,()=>{
    const user={...duke,admin_role:role};

    assert.equal(context.authorized(user),null);

    assert.ok(
      context.render(user).includes('normal-frame.png')
    );
  });
}

test('Duke management lock',()=>{
  assert.equal(
    context.authorized({
      ...duke,
      management_locked:true
    }),
    null
  );
});
