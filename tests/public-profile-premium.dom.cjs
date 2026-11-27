const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require(
 process.env.ERIS_JSDOM_MODULE||'jsdom'
);

const tick=async()=>{
 for(let i=0;i<8;i++)
  await new Promise(r=>setImmediate(r));
};

async function setup(extra={},rows=[]){
 const dom=new JSDOM(`
  <!doctype html>
  <main class="app">
   <header class="top">LidyaChat</header>
   <div class="content">
    <div id="messages" class="view show"></div>
   </div>
   <nav class="nav">Mesaj</nav>
  </main>
 `,{
  url:'https://example.test',
  runScripts:'outside-only'
 });

 const w=dom.window,d=w.document;
 const calls=[],errors=[],events=[];

 const observers=[];
 const runtimeErrors=[];
 const NativeObserver=w.MutationObserver;

 w.MutationObserver=class extends NativeObserver{
  constructor(callback){
   super(callback);
   observers.push(this);
  }
 };

 w.addEventListener('error',e=>{
  runtimeErrors.push(e.message);
 });

 const user={
  id:'peer',
  nickname:'Test Kullanici',
  public_id:'1234567890',
  age:31,
  bio:'Test hakkimda',
  followers_count:12,
  following_count:8,
  avatar_asset:'/avatar.png',
  frame_asset:'/frame.png',
  fan_level:5,
  ...extra
 };

 w.toast=m=>errors.push(m);
 w.HTMLMediaElement.prototype.pause=()=>{};

 w.ErisSocialMedia={
  icon:()=>'<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4Z"/></svg>',
  bindDialog:()=>{},
  cancel:()=>{}
 };

 w.ErisPlatform={
  getAccessToken:()=> 'test-session',
  postMediaUrl:p=>p,
  createConversation:async id=>{
   events.push(['conversation',id]);
   return {id:'dm-test'};
  },
  api:async(path,opt={})=>{
   calls.push({
    path,
    method:opt.method||'GET'
   });

   if(path==='/users/peer')return user;

   if(path==='/me/blocks')return [];

   if(path.startsWith('/users/peer/posts'))
    return rows;

   if(path==='/users/peer/follow')
    return {following:true,requested:false};

   if(path==='/users/peer/block')
    return {};

   return [];
  }
 };

 w.ErisChatVIP={
  decorate:(m,u)=>events.push(['vip',u.id]),
  watch:()=>{}
 };

 w.ErisRoleBadges={
  bind:(m,u)=>events.push(['role',u.id])
 };

 w.ErisChatDM={
  load:()=>{},
  open:(...args)=>events.push(['dm',...args]),
  openFloating:async(...args)=>{
   events.push(['gift',...args]);
  }
 };

 w.ErisPersonalFanRanking=id=>{
  events.push(['fans',id]);
 };

 w.ErisFloatingProfile={
  report:u=>events.push(['report',u.id])
 };

 for(const name of [
  'explore-comments.js',
  'social-feed-live.js',
  'user-profile-navigation.js'
 ]){
  w.eval(fs.readFileSync(
   'frontend/'+name,'utf8'
  ));
 }

 await w.openUserProfile('peer');
 await tick();

 return {
  w,d,calls,errors,events,
  close:()=>{
   observers.forEach(observer=>observer.disconnect());
   dom.window.close();
   assert.deepEqual(runtimeErrors,[]);
  }
 };
}

test('Premium profile structure and avatar',async()=>{
 const h=await setup();

 try{
  const d=h.d;
  assert.ok(d.querySelector('.lidya-public-profile'));
  assert.ok(d.querySelector('.lidya-profile-toolbar'));
  assert.ok(d.querySelector('.lidya-profile-hero'));
  assert.ok(d.querySelector('.lidya-profile-bio'));

  assert.equal(
   d.querySelector('[data-profile-age]').textContent,
   '31 yaş'
  );

  assert.equal(
   d.querySelectorAll('.eris-profile-stats>div').length,
   3
  );

  assert.ok(d.querySelector('.eris-profile-avatar'));
  assert.ok(d.querySelector('.eris-profile-frame'));

  assert.ok(h.events.some(x=>x[0]==='vip'));
  assert.ok(h.events.some(x=>x[0]==='role'));

  assert.deepEqual(h.errors,[]);
 }finally{h.close()}
});

test('Visitor empty state is correct',async()=>{
 const h=await setup();

 try{
  assert.equal(
   h.d.querySelector('[data-profile-posts] .ec-discovery-empty b').textContent,
   'Henüz gönderi yok'
  );

  assert.equal(
   h.d.querySelectorAll('[data-profile-posts] .ec-empty-art svg').length,
   1
  );
 }finally{h.close()}
});

test('Private profile does not request posts',async()=>{
 const h=await setup({
  is_private:true,
  can_view_private:false
 });

 try{
  assert.ok(
   h.d.querySelector('.eris-private-profile-notice')
  );

  assert.equal(h.calls.some(c=>
   c.path.startsWith('/users/peer/posts')
  ),false);

  assert.match(
   h.d.querySelector('[data-profile-posts]').textContent,
   /takip isteği/
  );
 }finally{h.close()}
});

test('Banned profile does not request posts',async()=>{
 const h=await setup({banned:true});

 try{
  assert.ok(
   h.d.querySelector('.eris-banned-profile')
  );

  assert.ok(
   h.d.querySelector('.eris-ban-notice')
  );

  assert.equal(h.calls.some(c=>
   c.path.startsWith('/users/peer/posts')
  ),false);
 }finally{h.close()}
});

test('Follow and block functionality preserved',async()=>{
 const h=await setup();

 try{
  h.d.querySelector('[data-follow]').click();
  await tick();

  assert.equal(
   h.d.querySelector('[data-follow]').textContent,
   'Takip ediliyor'
  );

  h.d.querySelector('[data-block]').click();
  await tick();

  assert.equal(
   h.d.querySelector('[data-message]').disabled,
   true
  );

  assert.equal(
   h.d.querySelector('[data-gift]').disabled,
   true
  );

  assert.equal(
   h.d.querySelector('[data-block]').textContent,
   'Engeli kaldır'
  );
 }finally{h.close()}
});

test('Fan and report actions remain functional',async()=>{
 const h=await setup();

 try{
  h.d.querySelector('[data-fans]').click();
  h.d.querySelector(
   '#erisUserProfileModal [data-report]'
  ).click();

  assert.ok(h.events.some(x=>
   x[0]==='fans'&&x[1]==='peer'
  ));

  assert.ok(h.events.some(x=>
   x[0]==='report'&&x[1]==='peer'
  ));
 }finally{h.close()}
});

test('Message action opens correct conversation',async()=>{
 const h=await setup();

 try{
  h.d.querySelector('[data-message]').click();
  await tick();

  assert.equal(
   h.d.querySelector('#erisUserProfileModal'),
   null
  );

  assert.ok(h.events.some(x=>
   x[0]==='dm'&&x[1]==='dm-test'
  ));

  assert.ok(h.d.querySelector('#messages.show'));
 }finally{h.close()}
});

test('Profile close preserves underlying page',async()=>{
 const h=await setup();

 try{
  h.d.querySelector('[data-close]').click();

  assert.equal(
   h.d.querySelector('#erisUserProfileModal'),
   null
  );

  assert.ok(h.d.querySelector('#messages.show'));
  assert.ok(h.d.querySelector('.app>.nav'));
  assert.ok(h.d.querySelector('.app>.top'));
 }finally{h.close()}
});

test('Hidden fan list stays hidden',async()=>{
 const h=await setup({fans_hidden:true});

 try{
  assert.equal(
   h.d.querySelector('[data-fans]').hidden,
   true
  );
 }finally{h.close()}
});

test('Existing posts still render',async()=>{
 const h=await setup({},[{
  id:1,
  user_id:'peer',
  nickname:'Test Kullanici',
  caption:'Premium profil test gonderisi',
  audience:'public',
  created_at:'2026-11-27T12:00:00Z',
  like_count:2,
  comment_count:0
 }]);

 try{
  assert.equal(
   h.d.querySelectorAll(
    '[data-profile-posts] article'
   ).length,1
  );

  assert.match(
   h.d.querySelector('.ec-social-caption').textContent,
   /Premium profil test/
  );

  assert.equal(
   h.d.querySelector('[data-profile-posts] .ec-discovery-empty'),
   null
  );
 }finally{h.close()}
});
