/* ErisChat live room gift + chat events. */
(function(){
  const API = window.ERIS_API || 'https://erischat-api-production.up.railway.app/v1';
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const wsBase = () => {
    const api = (window.ERISCHAT_API_BASE || API).replace(/\/$/, '');
    return api.replace(/\/v1\/?$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  };
  const toastSafe = message => typeof window.toast === 'function' ? window.toast(message) : console.warn('[ErisChat room]', message);
  let socket = null;
  let currentRoomId = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  function roomBox(){ return document.getElementById('realRoomChat'); }
  function appendRow(text, kind){
    const box = roomBox();
    if(!box) return;
    const row = document.createElement('div');
    row.style.cssText='padding:7px 9px;margin:5px 0;border-radius:10px;background:#ffffff08;color:'+(kind==='gift'?'#f3d27d':'#c9c0d1')+';font-size:10px;';
    row.textContent=text;
    box.appendChild(row);
    box.scrollTop=box.scrollHeight;
  }
  function renderChatMessage(data){
    if(!data || data.type!=='room_chat') return;
    appendRow('💬 '+String(data.user_id||'')+': '+String(data.text||''),'chat');
    window.dispatchEvent(new CustomEvent('erischat:room-chat',{detail:data}));
  }
  function renderHistory(data){
    const box=roomBox();
    if(!box || !Array.isArray(data.messages)) return;
    box.innerHTML='';
    data.messages.forEach(renderChatMessage);
  }
  let giftCatalogCache=[];
  let roomPeopleCache={};
  const giftLevelByPrice=p=>p>=90000?9:p>=50000?8:p>=20000?7:p>=10000?6:p>=1000?5:p>=500?4:p>=100?3:p>=30?2:1;
  async function refreshGiftMeta(){
    try{
      if(window.ErisRoomGift&&currentRoomId) giftCatalogCache=await window.ErisRoomGift.catalog(currentRoomId);
      const room=await window.ErisRoom?.get?.(currentRoomId);
      roomPeopleCache={};
      if(room){
        if(room.current_user_id)roomPeopleCache[room.current_user_id]=room.current_user_name||'Sen';
        if(room.owner_id)roomPeopleCache[room.owner_id]=room.owner_name||'Oda sahibi';
        (room.seats||[]).forEach(s=>{if(s.user_id)roomPeopleCache[s.user_id]=s.user_name||s.nickname||('Koltuk '+s.seat_number);});
      }
    }catch(_){}
  }
  function giftDetail(data){
    const key=String(data.gift_key||'');
    const meta=(Array.isArray(giftCatalogCache)?giftCatalogCache:[]).find(g=>String(g.gift_key||g.name)===key)||{};
    const giftName=String(data.gift_name||meta.name||key||'Hediye');
    const unit=Number(data.unit_price||meta.price||meta.unit_price||0);
    const total=Number(data.total_price||unit);
    const quantity=Math.max(1,Number(data.quantity||1));
    const level=giftLevelByPrice(unit);
    const sender=String(data.sender_name||data.sender_nickname||roomPeopleCache[data.sender_id]||data.sender_id||'Bir kullanıcı');
    const recipient=String(data.recipient_name||data.recipient_nickname||roomPeopleCache[data.recipient_id]||data.recipient_id||'Bir kullanıcı');
    return {...data,gift_name:giftName,unit_price:unit,total_price:total,quantity,level,sender_name:sender,recipient_name:recipient};
  }
  function renderGiftEvent(data){
    const detail=giftDetail(data);
    window.dispatchEvent(new CustomEvent('erischat:room-gift',{detail}));
  }
  function renderGiftAnnouncement(data){
    const detail=giftDetail(data);
    appendRow('📢 '+detail.sender_name+' kişisi '+detail.recipient_name+' kişisine '+detail.gift_name+' verdi • 💎 '+detail.total_price.toLocaleString('tr-TR'),'gift');
    window.dispatchEvent(new CustomEvent('erischat:room-gift',{detail:{...detail,global:true}}));
  }

  function scheduleReconnect(roomId){
    if(!roomId || reconnectTimer) return;
    const delay=Math.min(15000,1000*Math.pow(2,reconnectAttempt++));
    reconnectTimer=setTimeout(()=>{
      reconnectTimer=null;
      if(currentRoomId===String(roomId) && token()) connectRoomGiftSocket(roomId);
    },delay);
  }

  function connectRoomGiftSocket(roomId){
    if(!roomId) return null;
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
    if(socket){
      const oldSocket=socket;
      socket=null;
      try{oldSocket.close();}catch(_){}
    }
    currentRoomId=String(roomId);
    const t=token();
    if(!t) return null;
    const url=wsBase()+'/ws/rooms/'+encodeURIComponent(currentRoomId);
    const activeRoom=currentRoomId;
    const ws=new WebSocket(url,['erischat','token.'+t]);
    socket=ws;
    ws.onopen=()=>{
      if(socket!==ws || currentRoomId!==activeRoom) return;
      reconnectAttempt=0;
      refreshGiftMeta();
      try{ws.send(JSON.stringify({type:'ping'}));}catch(_){}
      window.dispatchEvent(new CustomEvent('erischat:room-ws',{detail:{roomId:activeRoom,state:'open'}}));
    };
    ws.onmessage=ev=>{
      if(socket!==ws || currentRoomId!==activeRoom) return;
      try{
        const data=JSON.parse(ev.data);
        if(data && data.type==='room_history') renderHistory(data);
        else if(data && data.type==='room_chat') renderChatMessage(data);
        else if(data && data.type==='room_gift') renderGiftEvent(data);
        else if(data && data.type==='gift_announcement') renderGiftAnnouncement(data);
      }catch(_){}
    };
    ws.onerror=()=>{
      if(socket!==ws || currentRoomId!==activeRoom) return;
      window.dispatchEvent(new CustomEvent('erischat:room-ws',{detail:{roomId:activeRoom,state:'error'}}));
    };
    ws.onclose=()=>{
      if(socket!==ws || currentRoomId!==activeRoom) return;
      socket=null;
      window.dispatchEvent(new CustomEvent('erischat:room-ws',{detail:{roomId:activeRoom,state:'closed'}}));
      if(token()) scheduleReconnect(activeRoom);
    };
    return ws;
  }

  window.connectRoomGiftSocket=connectRoomGiftSocket;
  window.disconnectRoomGiftSocket=function(){
    currentRoomId=null;
    reconnectAttempt=0;
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
    if(socket){const ws=socket;socket=null;try{ws.close();}catch(_){} }
  };
  window.sendRoomChatMessage=function(text){
    const value=String(text||'').trim();
    if(!value) return false;
    if(!socket || socket.readyState!==WebSocket.OPEN){toastSafe('Oda bağlantısı hazır değil.');return false;}
    if(value.length>500){toastSafe('Mesaj en fazla 500 karakter olabilir.');return false;}
    socket.send(JSON.stringify({type:'room_chat',text:value}));
    return true;
  };

  // REST gift bridge: catalog, send, history and leaderboard are now exposed
  // separately from the WebSocket event stream so the UI can use real data.
  function roomApi(){ return window.ErisRoom || null; }
  window.ErisRoomGift = {
    catalog: roomId => roomApi() ? roomApi().giftCatalog(roomId) : Promise.reject(new Error('ErisRoom hazır değil')),
    send: (roomId, recipientId, giftKey, quantity=1) => roomApi() ? roomApi().sendGift(roomId, recipientId, giftKey, quantity) : Promise.reject(new Error('ErisRoom hazır değil')),
    events: (roomId, limit=50) => roomApi() ? roomApi().giftEvents(roomId, limit) : Promise.reject(new Error('ErisRoom hazır değil')),
    leaderboard: roomId => roomApi() ? roomApi().leaderboard(roomId) : Promise.reject(new Error('ErisRoom hazır değil'))
  };

  const originalFetch=window.fetch;
  window.fetch=async function(input,init){
    const target=typeof input==='string'&&input.startsWith('/v1/')?API+input:input;
    const response=await originalFetch.call(this,target,init);
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
      const match=url.match(/\/v1\/rooms\/([^/?#]+)\/join(?:[/?#]|$)/);
      if(method==='POST'&&match&&response.ok) connectRoomGiftSocket(decodeURIComponent(match[1]));
    }catch(_){}
    return response;
  };

  window.sendRealRoomMessage=function(){
    const input=document.getElementById('realRoomMsg');
    const value=input&&input.value||'';
    if(window.sendRoomChatMessage(value) && input) input.value='';
  };
})();
