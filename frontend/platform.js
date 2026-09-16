(() => {
  const API = window.ERIS_API || `${location.origin}/v1`;
  const tokenKey = 'erischat_access_token';
  const token = () => localStorage.getItem(tokenKey) || '';
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  }
  window.ErisPlatform = {
    api: request,
    getVip: () => request('/me/vip'),
    getPrivacy: () => request('/me/privacy'),
    setPrivacy: (payload) => request('/me/privacy', { method: 'PATCH', body: JSON.stringify(payload) }),
    setLocation: (payload) => request('/me/location', { method: 'PUT', body: JSON.stringify(payload) }),
    getDiscovery: () => request('/me/discovery'),
    setDiscovery: (payload) => request('/me/discovery', { method: 'PATCH', body: JSON.stringify(payload) }),
    discoverRooms: () => request('/discover/rooms'),
    nearby: () => request('/discover/nearby'),
    randomChat: () => request('/discover/random-chat', { method: 'POST' }),
    randomRoom: () => request('/discover/random-room', { method: 'POST' }),
    report: (payload) => request('/reports', { method: 'POST', body: JSON.stringify(payload) }),
    createFamily: (name) => request('/families', { method: 'POST', body: JSON.stringify({ name }) }),
    family: (id) => request(`/families/${encodeURIComponent(id)}`),
    donateFamily: (id, amount) => request(`/families/${encodeURIComponent(id)}/donate`, { method: 'POST', body: JSON.stringify({ amount }) }),
    familyChat: (id) => request(`/families/${encodeURIComponent(id)}/chat`),
    fans: (userId) => request(`/users/${encodeURIComponent(userId)}/fans`),
    profileGifts: (userId) => request(`/users/${encodeURIComponent(userId)}/profile-gifts`),
    startGame: (roomId, type) => request(`/rooms/${encodeURIComponent(roomId)}/games/${encodeURIComponent(type)}`, { method: 'POST' }),
    bet: (roundId, choice, amount) => request(`/games/${encodeURIComponent(roundId)}/bet`, { method: 'POST', body: JSON.stringify({ choice, amount }) }),
    settleGame: (roundId) => request(`/games/${encodeURIComponent(roundId)}/settle`, { method: 'POST' }),
  };
})();
