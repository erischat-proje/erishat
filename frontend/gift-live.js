/* ErisChat live room gift events.
 * The room page can call connectRoomGiftSocket(roomId, onGift).
 */
window.connectRoomGiftSocket = function(roomId, onGift){
  const base = (window.ERISCHAT_WS_BASE || localStorage.getItem('erischat.wsBase') || '').replace(/\/$/,'');
  if(!base || !roomId) return null;
  const token = localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  const url = base + '/v1/rooms/' + encodeURIComponent(roomId) + '/ws' + (token ? '?token=' + encodeURIComponent(token) : '');
  const ws = new WebSocket(url);
  ws.onmessage = function(ev){
    try {
      const data = JSON.parse(ev.data);
      if(data && data.type === 'room_gift' && typeof onGift === 'function') onGift(data);
    } catch(_) {}
  };
  return ws;
};
