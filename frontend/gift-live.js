/* ErisChat live room gift events. */
(function(){
  const API = window.ERIS_API || 'https://erischat-production.up.railway.app/v1';
  const token = () => localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const wsBase = () => {
    const api = (window.ERISCHAT_API_BASE || API).replace(/\/$/, '');
    return api.replace(/\/v1\/?$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  };
  let socket = null;
  let currentRoomId = null;

  function connectRoomGiftSocket(roomId){
    if(!roomId) return null;
    if(socket){ try{socket.close();}catch(_){} socket=null; }
    currentRoomId = String(roomId);
    const t = token();
    if(!t) return null;
    const url = wsBase() + '/ws/rooms/' + encodeURIComponent(currentRoomId) + '?token=' + encodeURIComponent(t);
    socket = new WebSocket(url);
    socket.onopen = () => { try{socket.send(JSON.stringify({type:'ping'}));}catch(_){} };
    socket.onmessage = ev => {
      try{
        const data = JSON.parse(ev.data);
        if(data && data.type === 'room_gift'){
          window.dispatchEvent(new CustomEvent('erischat:room-gift',{detail:data}));
          renderGiftEvent(data);
        }
      }catch(_){}
    };
    socket.onclose = () => { if(currentRoomId===String(roomId)) socket=null; };
    return socket;
  }

  function renderGiftEvent(data){
    const box = document.getElementById('realRoomChat');
    if(!box) return;
    const row = document.createElement('div');
    row.style.cssText='padding:7px 9px;margin:5px 0;border-radius:10px;background:#ffffff08;color:#f3d27d;font-size:10px;';
    row.textContent = '🎁 ' + String(data.sender_id||'') + ' → ' + String(data.recipient_id||'') + ': ' + String(data.gift_key||'') + ' × ' + Number(data.quantity||1).toLocaleString('tr-TR') + ' • ' + Number(data.total_price||0).toLocaleString('tr-TR') + ' Lidya';
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    if(data.animation){
      row.style.outline='2px solid #ff68b5';
      row.style.boxShadow='0 0 22px #ff4fa366';
      setTimeout(()=>{row.style.outline='';row.style.boxShadow='';},900);
    }
  }

  window.connectRoomGiftSocket = connectRoomGiftSocket;

  // Route relative ErisChat API calls to Railway even when the frontend is
  // served from GitHub Pages. Capture the successful room join as well so
  // the live gift WebSocket is opened without a second room-state flow.
  const originalFetch = window.fetch;
  window.fetch = async function(input, init){
    const target = typeof input === 'string' && input.startsWith('/v1/') ? API + input : input;
    const response = await originalFetch.call(this, target, init);
    try{
      const url = typeof input === 'string' ? input : input && input.url || '';
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const match = url.match(/\/v1\/rooms\/([^/?#]+)\/join(?:[/?#]|$)/);
      if(method === 'POST' && match && response.ok){
        connectRoomGiftSocket(decodeURIComponent(match[1]));
      }
    }catch(_){}
    return response;
  };
})();
