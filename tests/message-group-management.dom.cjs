// Run with jsdom installed, e.g. NODE_PATH=/path/to/node_modules node this-file.
const {JSDOM}=require('jsdom'),assert=require('node:assert/strict'),fs=require('fs');
const wait=()=>new Promise(r=>setTimeout(r,25));
(async()=>{
 for(const role of ['owner','moderator','member']){
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><span class="ava"></span><b></b><small></small></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div></body></html>',{url:'https://eris.test/',runScripts:'outside-only'});
  const w=dom.window,errors=[],calls=[];w.addEventListener('error',e=>errors.push(e.error?.stack||e.message));w.localStorage.setItem('token','test');
  let group={id:'grp_test',conversation_id:'grp_test',name:'Grup <test>',description:'Açıklama',my_role:role,closed:false,admins_only:false,members_can_invite:false,admins_edit_info:true,slow_seconds:0};
  let roster=[{user_id:'owner',nickname:'Kurucu',public_id:'1000000000',role:'owner'},{user_id:'admin',nickname:'Yönetici',public_id:'1000000001',role:'moderator'},{user_id:'member',nickname:'Üye <img src=x>',public_id:'1000000002',role:'member'}];
  const me={owner:'owner',moderator:'admin',member:'member'}[role];
  w.toast=()=>{};w.ErisApiTransport={poll(){}};
  w.ErisPlatform={conversations(){},getMe:async()=>({id:me}),getAccessToken:()=>'',messages:async()=>[{id:1,sender_id:'member',sender_nickname:'Üye <img src=x>',text:'Test mesajı',created_at:'2026-10-23T10:00:00Z'}],sendMessage:async()=>({}),api:async(path,opts={})=>{
    calls.push({path,...opts});const body=typeof opts.body==='string'?JSON.parse(opts.body):opts.body;
    if(path.startsWith('/conversations?'))return [{id:'grp_test',type:'group',name:group.name,members:[]}];
    if(path==='/message-groups/grp_test/members')return roster;
    if(path==='/message-groups/grp_test'){if(opts.method==='PATCH')Object.assign(group,body);return {...group}}
    if(path==='/message-groups/grp_test/close'){group.closed=true;return {closed:true}}
    if(path.includes('/notifications'))return {is_muted:false};
    if(path.endsWith('/invitations')&&opts.method==='GET')return [{user_id:'other',nickname:'Davetli'}];
    if(path.endsWith('/bans'))return [{user_id:'banned',nickname:'Yasaklı'}];
    if(path.endsWith('/audit'))return [{id:1,action:'settings',actor_name:'Kurucu',created_at:'2026-10-23T10:00:00Z'}];
    if(path.includes('/search?'))return [{id:1,sender_nickname:'Üye',text:'Bulunan mesaj <script>oops</script>',created_at:'2026-10-23T10:00:00Z'}];
    return {};
  }};
  w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await wait();await w.ErisChatDM.load();await w.ErisChatDM.open('grp_test',group.name,'👥',null);await wait();
  assert.equal(w.document.querySelector('.group-message-sender').textContent,'Üye <img src=x>');assert.equal(w.document.querySelector('.group-message-sender img'),null);
  assert.equal(w.document.querySelector('[data-dm-gift]').hidden,true);
  w.document.querySelector('.chatHead b').click();await wait();
  const card=()=>w.document.querySelector('[data-group-menu]');
  const button=text=>[...card().querySelectorAll('button')].find(b=>b.textContent===text);
  assert(card());assert.equal(card().querySelector('[data-name]').textContent,group.name);
  assert.equal(!!button('Grup izinleri'),role==='owner');assert.equal(!!button('Grubu kapat'),role==='owner');assert.equal(!!button('İşlem geçmişi'),role!=='member');
  assert.equal(!!button('Yönetici yap'),role==='owner');assert.equal(!!button('Sahipliği devret'),role==='owner');assert.equal(!!button('Sustur'),role!=='member');
  const search=card().querySelector('input');search.value='1000000002';search.dispatchEvent(new w.Event('input'));assert.equal(card().querySelectorAll('.group-member-row').length,1);assert(card().textContent.includes('Üye <img src=x>'));assert.equal(card().querySelector('img'),null);
  button('Mesajlarda ara').click();await wait();let form=card().querySelector('form');form.elements.q.value='mesaj';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert(card().textContent.includes('Bulunan mesaj <script>oops</script>'));assert.equal(card().querySelector('script'),null);
  if(role==='owner'){
    button('Grup bilgileri').click();await wait();form=card().querySelector('form');form.elements.name.value='Yeni Grup';form.elements.description.value='Yeni açıklama';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(group.name,'Yeni Grup');
    button('Grup izinleri').click();await wait();form=card().querySelector('form');form.elements.admins_only.value='true';form.elements.members_can_invite.value='true';form.elements.slow_seconds.value='30';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(group.admins_only,true);assert.equal(group.slow_seconds,30);
    button('Bekleyen davetler').click();await wait();assert(button('Daveti iptal et'));button('Daveti iptal et').click();await wait();assert(calls.some(c=>c.path.endsWith('/invitations/other')&&c.method==='DELETE'));
    button('Grubu kapat').click();await wait();w.document.querySelector('[data-yes]').click();await wait();await wait();assert.equal(group.closed,true);assert.equal(button('Grubu kapat'),undefined);assert.equal(w.document.querySelector('.compose').hidden,true);
  }
  if(role==='moderator'){
    button('Yasaklı üyeler').click();await wait();button('Yasağı kaldır').click();await wait();assert(calls.some(c=>c.path.endsWith('/members/banned/control')&&JSON.parse(c.body).action==='unban'));
  }
  card().querySelector('[data-close]').click();assert.equal(card(),null);assert.deepEqual(errors,[]);dom.window.close();
 }
 console.log('PASS: owner/admin/member menus, member filtering, safe names, message search, settings, invite revoke, unban, closure, compose state');
})().catch(e=>{console.error(e);process.exit(1)});
