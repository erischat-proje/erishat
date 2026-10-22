/* LidyaChat upload-tier upgrades: durable, authenticated, cross-page in-app alerts. */
(()=>{'use strict';
const EVENT_KIND='upload_reward_upgrade';
const pollMs=45000;
const seen=new Set();
let busy=false, showing=false, timer=null;
function token(){return localStorage.getItem('erischat_access_token')||localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('token')||''}
function apiBase(){return String(window.ERIS_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'')}
function create(tag,cls,txt){const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el}
async function request(path, method='GET'){
 const access=token();if(!access)return null;
 const response=await fetch(apiBase()+'/me/upload-rewards'+path,{method,headers:{Authorization:'Bearer '+access},cache:'no-store'});
 if(!response.ok)throw new Error('Ödül bildirimi servisi kullanılamıyor');
 return response.status===204?null:response.json();
}
function showAlert(evt){if(showing||!evt)return;showing=true;seen.add(evt.id);
 const pane=create('div','lur-alert-overlay');pane.setAttribute('role','dialog');pane.setAttribute('aria-modal','true');pane.setAttribute('aria-label','Yeni yükleme ayrıcalığı');
 const card=create('section','lur-alert-card'),crown=create('div','lur-alert-crown','♛'),title=create('h2','',evt.title||'Yeni bir seviyeye yükseldin!'),body=create('p','',evt.body||'Yükleme Ödülleri bölümünden ödüllerini görebilirsin.'),open=create('button','','Ödüllerimi gör'),close=create('button','','Daha sonra');
 const buttons=create('div','lur-alert-actions');buttons.append(open,close);card.append(crown,title,body,buttons);pane.append(card);document.body.append(pane);
 const finish=async(toRewards)=>{pane.remove();showing=false;try{await request('/alerts/'+encodeURIComponent(evt.id)+'/ack','POST')}catch(_err){}if(toRewards)window.ErisUploadRewards?.open?.();queueMicrotask(poll)};
 open.addEventListener('click',()=>finish(true),{once:true});close.addEventListener('click',()=>finish(false),{once:true});
}
async function poll(){if(busy||showing||!token()||document.visibilityState==='hidden')return;busy=true;
 try{const payload=await request('/alerts');const events=payload?.events||[];const next=events.find(x=>x.kind===EVENT_KIND&&!seen.has(x.id));if(next)showAlert(next)}catch(_err){}finally{busy=false}}
function install(){if(document.getElementById('lur-upgrade-alerts-css'))return;
 const style=document.createElement('style');style.id='lur-upgrade-alerts-css';style.textContent=`
 .lur-alert-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(10,7,8,.82);backdrop-filter:blur(8px)}
 .lur-alert-card{width:min(100%,420px);padding:28px 20px;border:2px solid var(--ui-gold,#dab873);border-radius:24px;text-align:center;color:var(--ui-ink,#fff);background:radial-gradient(circle at 50% 0,rgba(215,174,94,.26),transparent 60%),var(--ui-panel,#181714);box-shadow:0 22px 75px #0009}
 .lur-alert-crown{font-size:57px;color:var(--ui-gold,#e5c381);text-shadow:0 0 20px #cf9e44aa}.lur-alert-card h2{font-size:22px;line-height:1.3;margin:12px 0}.lur-alert-card p{line-height:1.65;font-size:14px}
 .lur-alert-actions{display:grid;gap:10px;margin-top:20px}.lur-alert-actions button{min-height:45px;background:var(--ui-raised,#29261f);border:1px solid var(--ui-gold,#d9b675);border-radius:13px;color:var(--ui-ink,#fff);font-weight:750}
 `;document.head.appendChild(style);
 document.addEventListener('visibilitychange',poll);
 window.addEventListener('erischat:view-changed',poll);
 window.addEventListener('erischat:login',poll);
 timer=setInterval(poll,pollMs);poll();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
