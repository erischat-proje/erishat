/* ErisChat room REST actions. Keeps room controls behind the authenticated platform API. */
(() => {
  const api = (path, options = {}) => window.ErisPlatform && window.ErisPlatform.api
    ? window.ErisPlatform.api(path, options)
    : Promise.reject(new Error('ErisPlatform hazır değil'));
  const id = value => encodeURIComponent(String(value));
  const body = payload => ({ method: 'POST', body: JSON.stringify(payload) });

  window.ErisRoom = {
    list: () => api('/rooms'),
    get: roomId => api(`/rooms/${id(roomId)}`),
    create: name => api('/rooms', body({ name })),
    join: (roomId,password='') => api(`/rooms/${id(roomId)}/join`, body(password ? {password} : {})),
    leave: roomId => api(`/rooms/${id(roomId)}/leave`, body({})),
    joinSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/join`, body({})),
    leaveSeat: roomId => api(`/rooms/${id(roomId)}/seats/leave`, { method: 'DELETE' }),
    setChat: (roomId, enabled) => api(`/rooms/${id(roomId)}/chat`, { method: 'PATCH', body: JSON.stringify({ enabled: !!enabled }) }),
    rename: (roomId, name) => api(`/rooms/${id(roomId)}/name`, { method: 'PATCH', body: JSON.stringify({ name: String(name || '').trim() }) }),
    setCapacity: (roomId, seatCount) => api(`/rooms/${id(roomId)}/seats`, { method: 'PATCH', body: JSON.stringify({ seat_count: Number(seatCount) }) }),
    setTheme: (roomId, theme) => api(`/rooms/${id(roomId)}/theme`, { method: 'PATCH', body: JSON.stringify({ theme: String(theme || 'normal') }) }),
    addModerator: (roomId, userId) => api(`/rooms/${id(roomId)}/moderators`, body({ user_id: userId })),
    removeModerator: (roomId, userId) => api(`/rooms/${id(roomId)}/moderators/${id(userId)}`, { method: 'DELETE' }),
    bans: roomId => api(`/rooms/${id(roomId)}/bans`),
    ban: (roomId, userId) => api(`/rooms/${id(roomId)}/bans`, body({ user_id: userId })),
    unban: (roomId, userId) => api(`/rooms/${id(roomId)}/bans/${id(userId)}`, { method: 'DELETE' }),
    lockSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/lock`, body({})),
    unlockSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/lock`, { method: 'DELETE' }),
    muteSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/mute`, body({})),
    unmuteSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/mute`, { method: 'DELETE' }),
    lock: roomId => api(`/rooms/${id(roomId)}/lock`, body({})),
    setPassword: (roomId,password) => api(`/rooms/${id(roomId)}/password`, { method:'PUT', body:JSON.stringify({password}) }),
    clearPassword: roomId => api(`/rooms/${id(roomId)}/password`, { method:'DELETE' }),
    unlock: roomId => api(`/rooms/${id(roomId)}/lock`, { method: 'DELETE' }),
    giftCatalog: roomId => api(`/rooms/${id(roomId)}/gift-catalog`),
    giftEvents: (roomId, limit = 50) => api(`/rooms/${id(roomId)}/gift-events?limit=${Math.max(1, Math.min(100, Number(limit) || 50))}`),
    leaderboard: roomId => api(`/rooms/${id(roomId)}/gift-leaderboard`),
    sendGift: (roomId, recipientId, giftKey, quantity = 1) => api(`/rooms/${id(roomId)}/gifts`, body({ recipient_id: recipientId, gift_key: giftKey, quantity: Number(quantity) })),
    addMusic: async (roomId, title, file) => {
      if (!(file instanceof File)) throw new Error('Telefonundan bir müzik dosyası seç.');
      if (file.size > 8 * 1024 * 1024) throw new Error('Müzik en fazla 8 MB olabilir.');
      const form = new FormData(); form.append('title', title || file.name); form.append('file', file);
      const token = localStorage.getItem('erischat_access_token') || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
      const base = (window.ERIS_API || window.ERISCHAT_API || 'https://erischat-api-production.up.railway.app/v1').replace(/\/$/, '');
      const response = await fetch(`${base}/rooms/${id(roomId)}/music`, {method:'POST', body:form, headers:{Authorization:`Bearer ${token}`}});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Müzik yüklenemedi.');
      return data;
    },
    music: roomId => api(`/rooms/${id(roomId)}/music`),
    deleteMusic: (roomId, musicId) => api(`/rooms/${id(roomId)}/music/${id(musicId)}`, { method: 'DELETE' })
  };

  window.dispatchEvent(new CustomEvent('erischat:room-actions-ready'));
})();
