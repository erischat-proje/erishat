/* Read-only polling lifecycle shared by management panels. */
(()=>{'use strict';
const version='management-mobile-live-v8-20261023';
const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
const base=()=> (window.ERISCHAT_API_BASE||window.ERIS_API||localStorage.getItem('erischat.apiBase')||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'').replace(/\/v1$/,'');
async function read(path,access,signal){
 if(!access||access!==token())throw Object.assign(Error('Oturum değişti.'),{status:401});
 const response=await fetch(base()+path,{headers:{Authorization:'Bearer '+access},cache:'no-store',signal});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(Error(typeof data.detail==='string'?data.detail:'Veri alınamadı ('+response.status+').'),{status:response.status});
 if(access!==token())throw Object.assign(Error('Oturum değişti.'),{status:401});return data;
}
function attach({element,controls=element,load,paint,isAlive=()=>true,onDenied=()=>{},interval=15000}){
 let timer,controller,pending,stopped=false,automatic=true,last=null,generation=0;
 const bar=document.createElement('div');bar.className='aw-live-bar lm-live-bar';bar.dataset.live='';
 const state=document.createElement('span');state.setAttribute('role','status');state.textContent='Veri kaynağına bağlanıyor…';
 const refresh=document.createElement('button');refresh.type='button';refresh.className='aw-button';refresh.textContent='Şimdi yenile';
 const toggle=document.createElement('button');toggle.type='button';toggle.className='aw-button';toggle.textContent='Otomatik: açık · 15 sn';toggle.setAttribute('aria-pressed','true');bar.append(state,refresh,toggle);controls.prepend(bar);
 const authEvents=['erischat:auth','erischat:auth-state','erischat:auth-ready','erischat:auth-state-changed'];
 const alive=()=>!stopped&&element.isConnected&&bar.isConnected&&isAlive();
 function visible(){if(document.hidden)return false;for(let node=element;node&&node.nodeType===1;node=node.parentElement)if(node.hidden||node.style.display==='none')return false;return true;}
 function schedule(){clearTimeout(timer);if(!stopped)timer=setTimeout(()=>{if(!alive()){stop();return}if(automatic&&visible())update();else schedule()},interval)}
 function show(text,status){state.textContent=text;bar.dataset.state=status;}
 function stop(){if(stopped)return;stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);authEvents.forEach(event=>window.removeEventListener(event,sessionCheck));refresh.disabled=true;toggle.disabled=true;}
 async function update(){
  if(!alive()){if(element.isConnected)onDenied();show('Oturum veya ekran değişti. Yeniden açın.','paused');stop();return}
  if(pending)return pending;
  const stamp=generation;controller=new AbortController();refresh.disabled=true;show(last?'Güncelleniyor · Son başarılı okuma: '+last:'Veriler yükleniyor…','loading');
  pending=(async()=>{try{const data=await load(controller.signal);if(!alive()||stamp!==generation)return;paint(data);last=new Date(data.generated_at||Date.now()).toLocaleTimeString('tr-TR');show('Veritabanı · Son güncelleme '+last,'live')}
   catch(e){if(e.name==='AbortError'||!alive()||stamp!==generation)return;if([401,403].includes(e.status)){onDenied();show('Erişim sona erdi. Yönetimi yeniden açın.','error');stop()}else show('Bağlantı hatası · '+(last?'Son başarılı veri '+last:'Henüz veri alınamadı')+' · '+e.message,'error')}
   finally{pending=null;refresh.disabled=stopped;schedule()}})();return pending;
 }
 function visibility(){if(!alive()){stop();return}if(document.hidden){show('Arka planda duraklatıldı'+(last?' · Son veri '+last:''),'paused');clearTimeout(timer)}else if(automatic)update();else schedule()}
 refresh.onclick=update;toggle.onclick=()=>{automatic=!automatic;toggle.setAttribute('aria-pressed',String(automatic));toggle.textContent=automatic?'Otomatik: açık · 15 sn':'Otomatik: kapalı';if(automatic)update();else{show('Otomatik yenileme kapalı'+(last?' · Son veri '+last:''),'paused');schedule()}};
 function sessionCheck(){if(!stopped&&!isAlive()){if(element.isConnected)onDenied();show('Oturum değişti. Yeniden açın.','paused');stop()}}
 function reload(){generation++;if(pending){controller?.abort();return pending.then(()=>update())}return update()}
 authEvents.forEach(event=>window.addEventListener(event,sessionCheck));document.addEventListener('visibilitychange',visibility);update();return {update,reload,stop,bar};
}
window.LidyaManagementLive={attach,read,version};
})();
