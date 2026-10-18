(() => {
  let activeId = null, active = false, loading = false;
  const api = (path, opts) => window.ErisPlatform?.api(path, opts);
  function ui() {
    const chat = document.getElementById('chat');
    const header = chat?.querySelector('.chatHead');
    if (!header || !chat.classList.contains('show')) return;
    const id = window.ErisChatDM?.activeId?.();
    if (!id || String(id).startsWith('family')) return;
    let button = header.querySelector('.eris-ttl-toggle');
    if (!button) {
      button = document.createElement('button'); button.type = 'button';button.className = 'eris-ttl-toggle';
      button.title = 'Süreli Mesaj (24 saat)';button.setAttribute('aria-label','Süreli Mesaj');button.textContent = '◷';
      const call = header.querySelector('[data-video-call],.dm-video-call,.video-call,[data-call-video]');
      if (call) call.after(button); else header.append(button);
      button.addEventListener('click', async () => {
        if (!activeId || loading) return;
        const name = header.querySelector('b')?.textContent?.trim() || 'Bu kişi';
        const question = active ? `${name} isimli kullanıcı ile süreli mesajları iptal etmek istiyor musunuz?` : `${name} isimli kullanıcı ile 24 saat süreli sohbetleri aktif etmek istiyor musunuz?`;
        const overlay = document.createElement('div'); overlay.className='eris-ttl-overlay';
        const card=document.createElement('div');card.className='eris-ttl-card';
        const heading=document.createElement('h3');heading.textContent='◷ Süreli Mesaj';
        const message=document.createElement('p');message.textContent=question;
        const actions=document.createElement('div');actions.className='eris-ttl-actions';
        const yes=document.createElement('button');yes.textContent='Kabul Et';
        const no=document.createElement('button');no.textContent='Reddet';
        no.onclick=()=>overlay.remove();
        yes.onclick=async()=>{yes.disabled=true;try{const value=await api(`/conversations/${encodeURIComponent(activeId)}/ephemeral`,{method:'PATCH',body:JSON.stringify({is_ephemeral:!active}),headers:{'Content-Type':'application/json'}});active=!!value.is_ephemeral;draw();overlay.remove()}catch(err){yes.disabled=false;message.textContent=err.message||'İşlem başarısız'}};
        actions.append(yes,no);card.append(heading,message,actions);overlay.append(card);document.body.append(overlay);
      });
    }
    if (id !== activeId) {
      activeId = id; active = false;draw();loading=true;
      api(`/conversations/${encodeURIComponent(id)}/ephemeral`).then(data=>{if(activeId===id){active=!!data.is_ephemeral;draw()}}).catch(()=>{}).finally(()=>{loading=false});
    }
    draw();
  }
  function draw(){const h=document.querySelector('#chat .chatHead');const b=h?.querySelector('.eris-ttl-toggle');if(b){b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}let indicator=h?.querySelector('.eris-ttl-indicator');if(active&&!indicator){indicator=document.createElement('span');indicator.className='eris-ttl-indicator';indicator.textContent='◷';indicator.title='Süreli mesaj aktif';h?.querySelector('b')?.after(indicator)}if(!active)indicator?.remove()}
  function purgeExpired(){const body=document.querySelector('#chat.show .chatBody');if(!body)return;body.querySelectorAll('.bubble[data-ttl-expires]').forEach(el=>{if(Date.parse(el.dataset.ttlExpires)<=Date.now())el.remove()})}
  const observer=new MutationObserver(()=>{ui();purgeExpired()});
  function start(){const chat=document.getElementById('chat');if(chat)observer.observe(chat,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});ui();setInterval(()=>{ui();purgeExpired()},10000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
