const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const wait=()=>new Promise(r=>setTimeout(r,35));
(async()=>{
const dom=new JSDOM('<div id="messages"><div class="title">Mesajlar</div><div class="list"></div></div><div id="chat"><div class="chatHead"><div class="ava"></div><div class="grow"><b>Sohbet</b><small></small></div><button class="close">×</button></div><div class="chatBody"></div><div class="compose"><input id="chatInput"><button class="primary">Gönder</button></div></div>',{url:'https://test.invalid',runScripts:'outside-only'});
const w=dom.window,d=w.document;let account='one',nickname='İlk ad',maps={one:{},two:{}},hold=false,resolve;
w.localStorage.setItem('token',account);w.toast=()=>{};w.ErisApiTransport={poll:()=>{}};
w.ErisPlatform={conversations(){},getMe:async()=>({id:'me'}),getAccessToken:()=>account,messages:async()=>[],messageHistory:async()=>({messages:[],has_more:false}),api:async(path,opt={})=>{
 if(path==='/me/contact-aliases'){const result={aliases:{...maps[account]}};if(hold)return new Promise(r=>resolve=()=>r(result));return result;}
 if(path.startsWith('/me/contact-aliases/')){if(opt.method==='DELETE')delete maps[account].peer;else maps[account].peer=JSON.parse(opt.body).alias;return {};}
 if(path.startsWith('/conversations?'))return [{id:'a',type:'dm',members:[{user_id:'peer',nickname}]}];
 if(path==='/users/peer')return {id:'peer',nickname};return {};
}};
w.eval(fs.readFileSync('frontend/contact-aliases.js','utf8'));w.eval(fs.readFileSync('frontend/dm-live.js','utf8'));await wait();await w.ErisChatDM.load();await w.ErisChatDM.open('a',nickname,'K','peer');await wait();
assert.equal(d.querySelector('[data-contact-alias]').hidden,false);d.querySelector('[data-contact-alias]').click();await wait();
async function save(value){d.querySelector('[data-alias-input]').value=value;d.querySelector('[data-contact-alias-dialog] form').dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();await wait();}
await save('Canım <img src=x>');assert.equal(maps.one.peer,'Canım <img src=x>');assert.equal(d.querySelector('.chatHead b').textContent,'Canım <img src=x>');assert.equal(d.querySelector('.chatHead b img'),null);assert.equal(d.querySelector('[data-conversation-id="a"] b').textContent,'Canım <img src=x>');
nickname='Yeni kullanıcı adı';await w.ErisChatDM.load();await w.ErisChatDM.open('a',nickname,'K','peer');await wait();assert.equal(d.querySelector('.chatHead b').textContent,'Canım <img src=x>');
await w.LidyaContactAliases.edit('peer',nickname);await save('Dostum');assert.equal(w.LidyaContactAliases.name('peer',nickname),'Dostum');
await w.LidyaContactAliases.edit('peer',nickname);d.querySelector('[data-remove]').click();await wait();await wait();assert.equal(d.querySelector('.chatHead b').textContent,nickname);assert.equal(maps.one.peer,undefined);
maps.one.peer='Özel';w.dispatchEvent(new w.Event('erischat:auth'));await w.LidyaContactAliases.load();assert.equal(w.LidyaContactAliases.name('peer',nickname),'Özel');
account='two';w.dispatchEvent(new w.Event('erischat:auth'));await w.LidyaContactAliases.load();assert.equal(w.LidyaContactAliases.name('peer',nickname),nickname);
account='one';w.dispatchEvent(new w.Event('erischat:auth'));hold=true;const pending=w.LidyaContactAliases.edit('peer',nickname);await wait();account='two';w.dispatchEvent(new w.Event('erischat:auth'));resolve();await pending;assert.equal(d.querySelector('[data-contact-alias-dialog]'),null);assert.equal(w.LidyaContactAliases.name('peer',nickname),nickname);
dom.window.close();console.log('PASS: real DM alias controls, create/edit/remove, rename stability, text escaping, account isolation and late response protection');
})().catch(e=>{console.error(e);process.exit(1)});
