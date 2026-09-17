/* ErisChat live room gift + chat events. */
(function(){
  const API = window.ERIS_API || 'https://erischat-production.up.railway.app/v1';
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const wsBase = () => {
    const api = (window.ERISCHAT_API_BASE || API).replace(/\/$/, '');
    return api.replace(/\/v1\/?$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  };
  let socket = null;
  let currentRoomId = null;

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

  function connectRoomGiftSocket(roomId){
    if(!roomId) return null;
    if(socket){try{socket.close();}catch(_){} socket=null;}
    currentRoomId=String(roomId);
    const t=token();
    if(!t) return null;
    const url=wsBase()+'/ws/rooms/'+encodeURIComponent(currentRoomId)+'?token='+encodeURIComponent(t);
    socket=new WebSocket(url);
    socket.onopen=()=>{try{socket.send(JSON.stringify({type:'ping'}));}catch(_){} };
    socket.onmessage=ev=>{
      try{
        const data=JSON.parse(ev.data);
        if(data && data.type==='room_history') renderHistory(data);
        else if(data && data.type==='room_chat') renderChatMessage(data);
        else if(data && data.type==='room_gift') renderGiftEvent(data);
      }catch(_){}
    };
    socket.onclose=()=>{if(currentRoomId===String(roomId)) socket=null;};
    return socket;
  }

  window.connectRoomGiftSocket=connectRoomGiftSocket;
  window.sendRoomChatMessage=function(text){
    const value=String(text||'').trim();
    if(!value) return false;
    if(!socket || socket.readyState!==WebSocket.OPEN){toast('Oda bağlantısı hazır değil.');return false;}
    if(value.length>500){toast('Mesaj en fazla 500 karakter olabilir.');return false;}
    socket.send(JSON.stringify({type:'room_chat',text:value}));
    return true;
  };
  window.addEventListener('erischat:room-gift',()=>{});

  // Route relative ErisChat API calls to Railway even when served from GitHub Pages.
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

  // The canonical page currently defines a placeholder sendRealRoomMessage before
  // this script loads. Replace only that handler; keep the existing DOM intact.
  window.sendRealRoomMessage=function(){
    const input=document.getElementById('realRoomMsg');
    const value=input&&input.value||'';
    if(window.sendRoomChatMessage(value) && input) input.value='';
  };
})();
