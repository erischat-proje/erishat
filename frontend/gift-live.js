/* ErisChat live room gift + chat events. */
(function(){
  const API = window.ERIS_API || 'https://erischat-production.up.railway.app/v1';
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
  function renderGiftEvent(data){
    appendRow('🎁 '+String(data.sender_id||'')+' → '+String(data.recipient_id||'')+': '+String(data.gift_key||'')+' × '+Number(data.quantity||1).toLocaleString('tr-TR')+' • '+Number(data.total_price||0).toLocaleString('tr-TR'),'gift');
    window.dispatchEvent(new CustomEvent('erischat:room-gift',{detail:data}));
    if(data.animation){
      const box=roomBox(), row=box&&box.lastElementChild;
      if(row){row.style.outline='2px solid #ff68b5';row.style.boxShadow='0 0 22px #ff4fa366';setTimeout(()=>{row.style.outline='';row.style.boxShadow='';},900);}
    }
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
    const url=wsBase()+'/ws/rooms/'+encodeURIComponent(currentRoomId)+'?token='+encodeURIComponent(t);
    const activeRoom=currentRoomId;
    const ws=new WebSocket(url);
    socket=ws;
    ws.onopen=()=>{
      if(socket!==ws || currentRoomId!==activeRoom) return;
      reconnectAttempt=0;
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

  window.addEventListener('erischat:room-gift',()=>{});

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