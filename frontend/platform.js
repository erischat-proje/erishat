(() => {
  const API = window.ERIS_API || 'https://erischat-api-production.up.railway.app/v1';
  const tokenKey = 'erischat_access_token';
  const token = () => localStorage.getItem(tokenKey) || localStorage.getItem('erischat.accessToken.v1') || localStorage.getItem('token') || '';
  async function request(path, options = {}) {
    const requestOptions = { ...options }; delete requestOptions.timeout;
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !(typeof FormData !== 'undefined' && options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
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
    getRealtimeUrl: path => { const base=(window.ERIS_API||'https://erischat-api-production.up.railway.app/v1').replace(/\/v1$/, '').replace(/^http:/,'ws:').replace(/^https:/,'wss:'); return base+path; },
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
    messageGifts: () => request('/message-gifts'),
    sendMessageGift: (id,gift_key) => request(`/messages/${encodeURIComponent(id)}/gifts`,{method:'POST',body:JSON.stringify({gift_key})}),
    sendMessageMedia: (id,file,mediaType,viewSeconds=0) => {const body=new FormData();body.append('file',file);body.append('media_type',mediaType);body.append('view_seconds',String(viewSeconds));return request(`/messages/${encodeURIComponent(id)}/media`,{method:'POST',body,timeout:30000});},
    messageMediaUrl: path => `${API}/${String(path||'').replace(/^\/+/, '')}`,
    deleteMessages: (id,message_ids) => request(`/messages/${encodeURIComponent(id)}/delete`,{method:'POST',body:JSON.stringify({message_ids})}),
    pinMessage: (id,message_id) => request(`/conversations/${encodeURIComponent(id)}/pins/${message_id}`,{method:'POST'}),
    unpinMessage: (id,message_id) => request(`/conversations/${encodeURIComponent(id)}/pins/${message_id}`,{method:'DELETE'}),
    getMessageRestriction: () => request('/me/message-restriction'),
    setMessageRestriction: payload => request('/me/message-restriction',{method:'PUT',body:JSON.stringify(payload)}),
    userMessageRestriction: id => request(`/users/${encodeURIComponent(id)}/message-restriction`),
    report: payload => request('/reports',{method:'POST',body:JSON.stringify(payload)}),
    createFamily: name => request('/families',{method:'POST',body:JSON.stringify({name})}), family:id=>request(`/families/${encodeURIComponent(id)}`), donateFamily:(id,amount)=>request(`/families/${encodeURIComponent(id)}/donate`,{method:'POST',body:JSON.stringify({amount})}),
    familyChat:id=>request(`/families/${encodeURIComponent(id)}/chat`), fans:userId=>request(`/users/${encodeURIComponent(userId)}/fans`),
    profileGifts:userId=>request(`/users/${encodeURIComponent(userId)}/profile-gifts`),
    stories:limit=>request(`/stories?limit=${Number(limit)||100}`),
    createStory:(file,caption='')=>{const body=new FormData();body.append('file',file);body.append('caption',caption);return request('/stories',{method:'POST',body,timeout:120000});},
    deleteStory:id=>request(`/stories/${encodeURIComponent(id)}`,{method:'DELETE'}),
    storyMediaUrl:path=>`${API}/${String(path||'').replace(/^\/+/, '')}`,
    socialFeed:(mode='for-you',limit=30,offset=0)=>request(`/posts/feed?mode=${encodeURIComponent(mode)}&limit=${Number(limit)||30}&offset=${Number(offset)||0}`),
    myPosts:(limit=100,offset=0)=>request(`/me/posts?limit=${Number(limit)||100}&offset=${Number(offset)||0}`),
    createPost:(caption,file,audience='public')=>{const body=new FormData();body.append('caption',caption||'');body.append('audience',audience);if(file)body.append('file',file);return request('/posts',{method:'POST',body,timeout:120000});},
    updatePost:(id,caption,file,removeImage=false,audience,hidden)=>{const body=new FormData();body.append('caption',caption||'');body.append('remove_image',String(!!removeImage));if(audience)body.append('audience',audience);if(hidden!==undefined)body.append('is_hidden',String(!!hidden));if(file)body.append('file',file);return request(`/posts/${encodeURIComponent(id)}`,{method:'PATCH',body,timeout:120000});},
    deletePost:id=>request(`/posts/${encodeURIComponent(id)}`,{method:'DELETE'}),
    postMediaUrl:path=>`${API}/${String(path||'').replace(/^\/+/, '')}`
  };
})();
