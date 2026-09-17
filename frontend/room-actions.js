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
    join: roomId => api(`/rooms/${id(roomId)}/join`, body({})),
    leave: roomId => api(`/rooms/${id(roomId)}/leave`, body({})),
    joinSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/join`, body({})),
    leaveSeat: roomId => api(`/rooms/${id(roomId)}/seats/leave`, { method: 'DELETE' }),
    setChat: (roomId, enabled) => api(`/rooms/${id(roomId)}/chat`, { method: 'PATCH', body: JSON.stringify({ enabled: !!enabled }) }),
    addModerator: (roomId, userId) => api(`/rooms/${id(roomId)}/moderators`, body({ user_id: userId })),
    removeModerator: (roomId, userId) => api(`/rooms/${id(roomId)}/moderators/${id(userId)}`, { method: 'DELETE' }),
    ban: (roomId, userId) => api(`/rooms/${id(roomId)}/bans`, body({ user_id: userId })),
    unban: (roomId, userId) => api(`/rooms/${id(roomId)}/bans/${id(userId)}`, { method: 'DELETE' }),
    lockSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/lock`, body({})),
    unlockSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/lock`, { method: 'DELETE' }),
    muteSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/mute`, body({})),
    unmuteSeat: (roomId, seatNumber) => api(`/rooms/${id(roomId)}/seats/${Number(seatNumber)}/mute`, { method: 'DELETE' }),
    lock: roomId => api(`/rooms/${id(roomId)}/lock`, body({})),
    unlock: roomId => api(`/rooms/${id(roomId)}/lock`, { method: 'DELETE' }),
    giftCatalog: roomId => api(`/rooms/${id(roomId)}/gift-catalog`),
    giftEvents: (roomId, limit = 50) => api(`/rooms/${id(roomId)}/gift-events?limit=${Math.max(1, Math.min(100, Number(limit) || 50))}`),
    leaderboard: roomId => api(`/rooms/${id(roomId)}/gift-leaderboard`),
    sendGift: (roomId, recipientId, giftKey, quantity = 1) => api(`/rooms/${id(roomId)}/gifts`, body({ recipient_id: recipientId, gift_key: giftKey, quantity: Number(quantity) })),
    addMusic: (roomId, title, sourceUrl) => api(`/rooms/${id(roomId)}/music`, body({ title, source_url: sourceUrl })),
    music: roomId => api(`/rooms/${id(roomId)}/music`),
    deleteMusic: (roomId, musicId) => api(`/rooms/${id(roomId)}/music/${id(musicId)}`, { method: 'DELETE' })
  };

  window.dispatchEvent(new CustomEvent('erischat:room-actions-ready'));
})();
