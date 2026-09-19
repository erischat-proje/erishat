(() => {
  const API = window.ERIS_API || 'https://erischat-production.up.railway.app/v1';
  const tokenKey = 'erischat_access_token';
  const token = () => localStorage.getItem(tokenKey) || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  async function request(path, options = {}) {
    const requestOptions = { ...options }; delete requestOptions.timeout;
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeout || 8000));
    let res;
    try { res = await fetch(`${API}${path}`, { ...options, headers, signal: controller.signal }); }
    catch (e) { throw new Error(e?.name === 'AbortError' ? 'Sunucu yanıt vermedi (8 sn zaman aşımı).' : (e?.message || 'Ağ bağlantısı kurulamadı.')); }
    finally { clearTimeout(timeout); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  }
  window.ErisPlatform = {
    api: request,
    getMe: () => request('/me'),
    getAccessToken: () => token(),
    getRealtimeUrl: path => { const base=(window.ERIS_API||'https://erischat-production.up.railway.app/v1').replace(/\/v1$/, '').replace(/^http:/,'ws:').replace(/^https:/,'wss:'); return base+path; },
    getVip: () => request('/me/vip'), getPrivacy: () => request('/me/privacy'),
    setPrivacy: payload => request('/me/privacy', { method:'PATCH', body:JSON.stringify(payload) }),
    setLocation: payload => request('/me/location', { method:'PUT', body:JSON.stringify(payload) }),
    getDiscovery: () => request('/me/discovery'), setDiscovery: payload => request('/me/discovery',{method:'PATCH',body:JSON.stringify(payload)}),
    discoverRooms: () => request('/discover/rooms'), nearby: () => request('/discover/nearby'),
    randomChat: () => request('/discover/random-chat',{method:'POST'}), randomRoom: () => request('/discover/random-room',{method:'POST'}),
    conversations: (limit=50,offset=0) => request(`/conversations?limit=${limit}&offset=${offset}`),
    conversation: id => request(`/conversations/${encodeURIComponent(id)}`),
    createConversation: participantId => request('/conversations',{method:'POST',body:JSON.stringify({participant_id:participantId})}),
    messages: (id,limit=100,offset=0) => request(`/messages/${encodeURIComponent(id)}?limit=${limit}&offset=${offset}`),
    sendMessage: (id,text) => request(`/messages/${encodeURIComponent(id)}`,{method:'POST',body:JSON.stringify({text})}),
    report: payload => request('/reports',{method:'POST',body:JSON.stringify(payload)}),
    createFamily: name => request('/families',{method:'POST',body:JSON.stringify({name})}), family:id=>request(`/families/${encodeURIComponent(id)}`), donateFamily:(id,amount)=>request(`/families/${encodeURIComponent(id)}/donate`,{method:'POST',body:JSON.stringify({amount})}),
    familyChat:id=>request(`/families/${encodeURIComponent(id)}/chat`), fans:userId=>request(`/users/${encodeURIComponent(userId)}/fans`),
    profileGifts:userId=>request(`/users/${encodeURIComponent(userId)}/profile-gifts`)
  };
})();
