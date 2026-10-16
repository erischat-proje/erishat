(() => {
  'use strict';
  const platform=()=>window.ErisPlatform,token=()=>platform()?.getAccessToken?.()||'';
  const api=(path,options)=>platform().api(path,options);
  const makeKey=()=> 'http_'+(crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join(''));
  let key=makeKey(),socket=null,session='',retry=null,loading=null,generation=0,stopped=false,fallback=false,lastBeat=0;
  const fingerprints=new WeakMap();
  function message(root,text){const note=document.createElement('div');note.className='card ec-discovery-empty';const art=document.createElement('span');art.className='ec-empty-art';art.innerHTML=window.ErisSocialMedia?.icon?.('people')||'';const title=document.createElement('b');title.textContent='Yeni sohbetlere yer aç';const copy=document.createElement('p');copy.textContent=text;note.append(art,title,copy);root.replaceChildren(note);}
  function roomCard(room){
    const button=document.createElement('button');button.type='button';button.className='room card';
    const art=document.createElement('span');art.className='ec-room-art';art.innerHTML=window.ErisSocialMedia?.icon?.('room')||'';button.append(art);const info=document.createElement('span');info.className='grow roomText';const title=document.createElement('b');title.textContent=(room.locked?'🔒 ':'')+room.name;
    const detail=document.createElement('small');detail.textContent=`${room.member_count} çevrim içi • Bugün ${room.daily_gift_lidya} Lidya`;
    const id=document.createElement('small');id.textContent='ID: '+(room.public_id||'');info.append(title,detail,id);button.append(info);const badge=document.createElement('span');badge.className='ec-room-live';badge.textContent='CANLI';button.append(badge);
    button.onclick=()=>{window.ErisCurrentRoomId=room.id;window.currentRoomId=room.id;window.openRoom?.(room.id,room.name);};return button;
  }
  function renderRooms(id,rows,empty){const root=document.getElementById(id);if(!root)return;const hash=JSON.stringify(rows);if(fingerprints.get(root)===hash)return;fingerprints.set(root,hash);root.replaceChildren();rows.forEach(room=>root.append(roomCard(room)));if(!rows.length)message(root,empty);}
  function controls(root){
    let box=root.querySelector('[data-discovery-controls]');if(box)return box;
    box=document.createElement('div');box.dataset.discoveryControls='';box.className='card';box.style.padding='12px';
    const label=document.createElement('label');label.textContent='Göster: ';const select=document.createElement('select');select.setAttribute('aria-label','Cinsiyet tercihi');
    for(const [value,text] of [['any','Herkes'],['female','Kadınlar'],['male','Erkekler']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}label.append(select);
    select.onchange=async()=>{select.disabled=true;try{await platform().setDiscovery({gender_filter:select.value});await load();}catch(e){window.toast?.(e.message);}finally{select.disabled=false;}};
    const location=document.createElement('button');location.type='button';location.textContent='Konumumu güncelle';location.className='tab';location.style.marginLeft='8px';
    location.onclick=()=>{if(!navigator.geolocation){window.toast?.('Bu cihazda konum kullanılamıyor.');return;}location.disabled=true;navigator.geolocation.getCurrentPosition(async position=>{try{await platform().setLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,city:'Yakınım'});await load();}catch(e){window.toast?.(e.message);}finally{location.disabled=false;}},()=>{location.disabled=false;window.toast?.('Yakındaki kişileri görmek için konum izni gerekli.');},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});};
    box.append(label,location);root.prepend(box);return box;
  }
  function render(data){
    renderRooms('rooms',data.rooms||[],'Şu anda çevrim içi katılımcısı olan oda yok.');renderRooms('realRooms',data.rooms||[],'Şu anda aktif oda yok.');renderRooms('followingRooms',data.following||[],'Takip ettiğin çevrim içi kişilerin bulunduğu aktif oda yok.');
    const root=document.getElementById('people');if(!root)return;const box=controls(root);if(!box.querySelector('select').disabled)box.querySelector('select').value=data.gender_filter||'any';
    let list=root.querySelector('[data-discovery-people]');if(!list){list=document.createElement('div');list.dataset.discoveryPeople='';list.className='list';Array.from(root.children).filter(x=>x!==box).forEach(x=>x.remove());root.append(list);}
    const hash=JSON.stringify([data.people,data.location_required]);if(fingerprints.get(list)===hash)return;fingerprints.set(list,hash);list.replaceChildren();
    for(const user of data.people||[]){const button=document.createElement('button');button.type='button';button.className='item card ec-person-card';const avatar=document.createElement('span');avatar.className='ec-person-avatar';avatar.textContent=String(user.nickname||'?').slice(0,1).toUpperCase();button.append(avatar);const name=document.createElement('b');name.textContent=user.nickname;window.ErisRoleBadges?.bind(name,user);const detail=document.createElement('small');detail.textContent=Number.isFinite(Number(user.distance_km))&&user.distance_km!=null?`Çevrim içi • ${Number(user.distance_km).toFixed(1)} km`:'Çevrim içi';const info=document.createElement('span');info.append(name,detail);button.append(info);button.onclick=()=>window.openUserProfile?.(user.user_id);list.append(button);}
    if(!list.children.length)message(list,data.location_required?'Yakındaki kişileri görmek için konum izni ver.':'Tercihine uygun çevrim içi kullanıcı yok.');
  }
  async function presence(active){await api('/discover/presence',{method:'POST',body:JSON.stringify({connection_id:key,active})});fallback=active;lastBeat=Date.now();}
  async function load(){
    if(!token())return;if(loading)return loading;const stamp=generation;
    loading=(async()=>{try{if(socket?.readyState!==1&&!document.hidden)await presence(true);const data=await api('/discover/snapshot');if(stamp===generation&&token())render(data);}catch(e){if(stamp===generation)window.toast?.(e.message||'Keşfet bağlantısı kurulamadı.');}finally{loading=null;}})();return loading;
  }
  function connect(){
    if(stopped||!token()||socket||document.hidden)return;
    const stamp=generation;let ws;
    try{ws=new WebSocket(platform().getRealtimeUrl('/ws/discovery'),['erischat','token.'+token()]);}catch{load();retry=setTimeout(connect,5000);return;}
    socket=ws;
    ws.onopen=()=>{if(stamp!==generation)return ws.close();ws.send(JSON.stringify({type:'presence',active:!document.hidden}));if(fallback)presence(false).catch(()=>{});};
    ws.onmessage=event=>{if(stamp!==generation)return;try{const data=JSON.parse(event.data);if(data.type==='discovery_snapshot')render(data);}catch{}};
    ws.onclose=()=>{if(socket===ws)socket=null;if(stamp!==generation||stopped)return;load();clearTimeout(retry);retry=setTimeout(connect,5000);};ws.onerror=()=>ws.close();
  }
  function start(){const value=token();if(value===session&&!stopped){connect();return;}generation++;key=makeKey();fallback=false;session=value;stopped=false;clearTimeout(retry);const old=socket;socket=null;old?.close();fingerprints.delete(document.getElementById('rooms'));if(value){connect();load();}else{for(const id of ['rooms','realRooms','followingRooms','people']){const root=document.getElementById(id);if(root){fingerprints.delete(root);message(root,'Görmek için giriş yap.');}}}}
  window.ErisDiscovery={load};
  window.addEventListener('erischat:auth-state',start);window.addEventListener('erischat:auth',start);
  // Existing auth modules dispatch auth-ready and auth-state-changed in different flows.
  window.addEventListener('erischat:auth-ready',start);window.addEventListener('erischat:auth-state-changed',start);
  document.addEventListener('visibilitychange',()=>{if(socket?.readyState===1)socket.send(JSON.stringify({type:'presence',active:!document.hidden}));else if(document.hidden&&fallback)presence(false).catch(()=>{});if(!document.hidden){start();load();}});
  window.addEventListener('pagehide',()=>{stopped=true;generation++;clearTimeout(retry);socket?.close();if(fallback&&token()){const base=(window.ERIS_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'');fetch(base+'/discover/presence',{method:'POST',keepalive:true,headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},body:JSON.stringify({connection_id:key,active:false})}).catch(()=>{});}});
  window.addEventListener('pageshow',start);
  setInterval(()=>{if(token()!==session){start();return;}if(!token()||stopped||document.hidden)return;if(socket?.readyState!==1)load();else if(fallback&&Date.now()-lastBeat>20000)presence(false).catch(()=>{});},3000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
