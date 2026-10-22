const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const frontend=path.resolve(__dirname,'../frontend');
function fixture(){
 const observers=[],opened=[];
 class El{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.style={setProperty(){}};this.className='';this.classList={add:x=>this.className+=' '+x};this.textContent='';}
  append(...xs){for(const x of xs){x.parent=this;this.children.push(x)}} appendChild(x){this.append(x)}
  replaceChildren(...xs){this.children=[];this.append(...xs)}setAttribute(k,v){this[k]=v}focus(){}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
  set innerHTML(html){this.children=[];if(html.includes('id="eaBody"')){const close=new El('button');close.close=true;const body=new El('div');body.id='eaBody';this.append(close,body)}else for(const m of html.matchAll(/<button data-a="([^"]+)"[^>]*>([^<]*)<\/button>/g)){const b=new El('button');b.dataset.a=m[1];b.textContent=m[2];this.append(b)}}
  querySelectorAll(selector){const all=this.children.flatMap(x=>[x,...x.querySelectorAll('*')]);if(selector==='*')return all;if(selector==='[data-a]')return all.filter(x=>x.dataset.a);if(selector==='img[data-ea-art-key]')return all.filter(x=>x.tagName==='img'&&x.dataset.eaArtKey);return []}
  querySelector(selector){return this.querySelectorAll('*').find(x=>selector==='[data-close]'?x.close:selector==='#eaBody'?x.id==='eaBody':selector==='.eris-admin-overlay'?x.className==='eris-admin-overlay':false)||null}
 }
 const body=new El('body'),head=new El('head');
 const document={body,head,documentElement:{dataset:{erisTheme:'light'}},currentScript:{src:'https://example.test/frontend/admin-live.js'},readyState:'loading',createElement:t=>new El(t),getElementById:id=>[...head.querySelectorAll('*'),...body.querySelectorAll('*')].find(x=>x.id===id),querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s)};
 const window={addEventListener(){},LidyaManagementCenter:{open:key=>opened.push(key)},toast:msg=>{throw Error(msg)}};
 const ctx={document,window,localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>null},URL,MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}},setInterval(){},setTimeout(){},clearTimeout(){},console,fetch:async()=>({ok:true,json:async()=>({id:'test-admin',role:'DA'})})};
 vm.runInNewContext(fs.readFileSync(process.env.ADMIN_TEST_SOURCE||path.join(frontend,'admin-live.js'),'utf8'),ctx);
 document.currentScript=null;
 return {document,window,observers,opened};
}
test('menu opens after script execution, binds every handler and dispatches all six tools in both themes',async()=>{
 const f=fixture();await f.window.ErisAdmin.open();
 const buttons=f.document.querySelectorAll('[data-a]');assert.ok(buttons.length>6);assert.ok(buttons.every(b=>typeof b.onclick==='function'));
 for(const theme of ['light','dark']){
  f.document.documentElement.dataset.erisTheme=theme;f.observers[0]();
  for(const key of ['command','cases','emergency','finance','fraud','audit']){
   const button=buttons.find(b=>b.dataset.a==='lm-'+key);assert.ok(button);
   const img=button.querySelectorAll('*').find(e=>e.tagName==='img');
   const expected='assets/admin-lidya-v4/'+theme+'/'+key+'.png';assert.equal(new URL(img.src).pathname,'/frontend/'+expected);
   const bytes=fs.readFileSync(path.join(frontend,expected));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(bytes.length>1000);
   await button.onclick();assert.equal(f.opened.at(-1),key);
  }
 }
 assert.equal(f.opened.length,12);
});
