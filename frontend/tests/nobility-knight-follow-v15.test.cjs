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
      return data?.rank===1 &&
        data.privileges?.includes(id)
        ? './assets/lidya-nobility/knight/'+id+'.png'
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

for(const rank of [0,2,3,4]){
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
