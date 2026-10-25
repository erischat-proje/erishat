(() => {
'use strict';
if(window.LidyaContactAliases)return;
let names={},session=null,request=null,revision=0,loaded=false;
const token=()=>window.ErisPlatform?.getAccessToken?.()||localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||'';
function reset(){names={};session=token();request=null;loaded=false;revision++;document.querySelector('[data-contact-alias-dialog]')?.remove();}
function sync(){if(session!==token())reset();}
async function load(){sync();if(loaded)return;if(request)return request;const r=revision,t=session;const pending=window.ErisPlatform.api('/me/contact-aliases').then(data=>{if(r===revision&&t===token()){names=data.aliases||{};loaded=true;}}).finally(()=>{if(r===revision)request=null;});request=pending;return pending;}
function name(id,fallback){sync();return names[String(id)]||fallback||'Kullanıcı';}
async function edit(id,currentName){
 if(!id)return;sync();const initialRevision=revision,initialToken=token();try{await load();}catch{window.toast?.('Takma adlar yüklenemedi. Tekrar deneyin.');return;}
 if(initialRevision!==revision||initialToken!==token())return;
 const r=revision,t=session;document.querySelector('[data-contact-alias-dialog]')?.remove();
 const layer=document.createElement('div');layer.dataset.contactAliasDialog='';layer.style.cssText='position:fixed;inset:0;z-index:300000;background:var(--ui-overlay,#0009);display:grid;place-items:center;padding:18px';
 layer.innerHTML='<form role="dialog" aria-modal="true" aria-label="Kişiye takma ad ver" style="box-sizing:border-box;width:min(420px,100%);background:var(--ui-panel,#fff9eb);color:var(--ui-ink,#30271b);border:1px solid var(--ui-line);border-radius:20px;padding:20px"><h3>Kişiye takma ad ver</h3><p>Yalnızca sen görürsün. Kullanıcı adı değişse de verdiğin ad kalır.</p><label>Takma ad<input maxlength="64" required data-alias-input style="box-sizing:border-box;display:block;width:100%;padding:12px;margin:12px 0;background:var(--ui-raised);color:inherit;border:1px solid var(--ui-line);border-radius:10px"></label><p data-status role="status"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit">Kaydet</button><button type="button" data-remove>Takma adı kaldır</button><button type="button" data-close>Vazgeç</button></div></form>';
 const previous=document.activeElement;document.body.append(layer);const input=layer.querySelector('input'),status=layer.querySelector('[data-status]');input.value=names[id]||'';input.placeholder=currentName||'Takma ad';input.focus();
 const valid=()=>r===revision&&t===token()&&layer.isConnected;const close=()=>{layer.remove();previous?.focus?.();};layer.querySelector('[data-close]').onclick=close;layer.querySelector('[data-remove]').disabled=!names[id];
 let busy=false;
 async function save(remove){if(busy||!valid())return;const alias=input.value.trim();if(!remove&&!alias){status.textContent='Takma ad boş olamaz.';return;}busy=true;for(const b of layer.querySelectorAll('button'))b.disabled=true;
 try{await window.ErisPlatform.api('/me/contact-aliases/'+encodeURIComponent(id),{method:remove?'DELETE':'PUT',...(!remove?{body:JSON.stringify({alias})}:{})});if(!valid())return;if(remove)delete names[id];else names[id]=alias;close();window.dispatchEvent(new CustomEvent('lidyachat:contact-alias',{detail:{userId:id}}));}
 catch(e){if(valid())status.textContent=e.message||'Kaydedilemedi.';}
 finally{busy=false;if(valid()){for(const b of layer.querySelectorAll('button'))b.disabled=false;layer.querySelector('[data-remove]').disabled=!names[id];}}}
 layer.querySelector('form').onsubmit=e=>{e.preventDefault();save(false)};layer.querySelector('[data-remove]').onclick=()=>save(true);
 layer.onkeydown=e=>{if(e.key==='Escape'&&!busy){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...layer.querySelectorAll('input,button')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
}
window.addEventListener('erischat:auth',reset);window.addEventListener('storage',e=>{if(['token','erischat_access_token','erischat.accessToken.v1',null].includes(e.key))reset()});
window.LidyaContactAliases={load,name,edit};
})();
