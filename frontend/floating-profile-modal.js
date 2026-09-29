(() => {
  'use strict';
  const css = document.createElement('style');
  css.textContent = `
    .eris-mini-shade{position:fixed;inset:0;z-index:11030;display:grid;place-items:center;padding:16px;background:#060411a8;backdrop-filter:blur(8px)}
    .eris-mini-card{box-sizing:border-box;width:min(390px,100%);padding:20px;border:1px solid #bd93ee77;border-radius:24px;background:linear-gradient(135deg,#291a3bde,#100b1ce8);box-shadow:0 25px 80px #000b;color:#fff}
    .eris-mini-head{display:flex;align-items:center;gap:12px}.eris-mini-portrait{position:relative;width:64px;height:64px;flex:none;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:#49336d;color:#fff;font-size:24px;cursor:pointer}.eris-mini-portrait img:not(.eris-mini-frame){width:100%;height:100%;border-radius:50%;object-fit:cover}.eris-mini-frame{position:absolute;inset:-6px;width:76px;height:76px;object-fit:contain;pointer-events:none}
    .eris-mini-name{min-width:0;flex:1;overflow-wrap:anywhere;font-weight:800}.eris-mini-icon{flex:none;width:34px;height:34px;border:1px solid #d4bafa66;border-radius:11px;background:#ffffff13;color:white;font-size:19px;cursor:pointer}.eris-mini-top{display:flex;gap:5px;align-items:center;align-self:flex-start}.eris-mini-fan{align-self:flex-start;border:0;background:transparent;padding:0;display:grid;place-items:center}
    .eris-mini-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:19px 0}.eris-mini-stats div{min-width:0;padding:10px 5px;text-align:center;border:1px solid #ffffff1d;border-radius:13px;background:#ffffff0d}.eris-mini-stats b{display:block;font-size:17px}.eris-mini-stats small{display:block;color:#cabdd7;font-size:10px}
    .eris-mini-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.eris-mini-actions button,.eris-mini-submit{min-height:42px;padding:7px;border:1px solid #bd93ee77;border-radius:13px;background:#7b4cff44;color:white;font-weight:700;cursor:pointer}.eris-mini-actions button:disabled{opacity:.5;cursor:default}
    .eris-mini-block{width:100%;margin-top:8px;border-color:#ff8a9c77!important;background:#ff5a7918!important}
    #chat.eris-floating-dm{z-index:11000;align-items:center;justify-content:center;padding:14px;background:#060411a8;backdrop-filter:blur(8px)}
    #chat.eris-floating-dm .chatSheet{width:min(480px,100%);height:min(640px,78dvh);min-height:280px;max-height:calc(100dvh - 28px);border:1px solid #bd93ee77;border-radius:24px;background:linear-gradient(145deg,#241736eb,#100b1deb);box-shadow:0 25px 80px #000b;overflow:hidden;backdrop-filter:blur(18px)}
    #chat.eris-floating-dm .chatHead{background:#ffffff08}#chat.eris-floating-dm .chatHead .ava{cursor:pointer}
    .dm-gift-sheet{z-index:11010!important;align-items:center!important;justify-content:center!important;padding:14px;backdrop-filter:blur(8px)}
    .dm-gift-sheet>section{box-sizing:border-box;border-radius:24px!important;background:#171025ed!important;max-height:78dvh!important;box-shadow:0 25px 80px #000b}
    .eris-mini-report-shade{z-index:11040}.eris-mini-report-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.eris-mini-report-head h2{margin:0;font-size:19px}.eris-mini-card textarea{box-sizing:border-box;width:100%;min-height:110px;margin:15px 0 10px;padding:11px;border:1px solid #ffffff33;border-radius:13px;background:#0e0a19;color:#fff;resize:vertical}.eris-mini-card input[type=file]{max-width:100%;margin:10px 0;color:#fff}.eris-mini-error{min-height:18px;color:#ffa6b7;font-size:12px}`;
  document.head.append(css);
  const api = (path, options) => window.ErisPlatform.api(path, options);
  const asset = path => path ? (window.ErisChatCosmetics?.assetUrl?.(path) || path) : '';
  const count = n => Number(n || 0).toLocaleString('tr-TR');
  const closeProfile = () => { document.querySelector('.eris-mini-report-shade')?.remove(); document.querySelector('.eris-mini-profile-shade')?.remove(); };
  function closeReport() { document.querySelector('.eris-mini-report-shade')?.remove(); }
  function report(user) {
    closeReport();
    const shade = document.createElement('div'); shade.className='eris-mini-shade eris-mini-report-shade';
    shade.innerHTML='<form class="eris-mini-card" role="dialog" aria-modal="true" aria-label="Kişiyi şikâyet et"><div class="eris-mini-report-head"><h2>Kişiyi şikâyet et</h2><button type="button" class="eris-mini-icon" aria-label="Şikâyeti kapat">×</button></div><textarea name="reason" required minlength="3" maxlength="2000" placeholder="Şikâyet nedenini yazın"></textarea><label>Kanıt (en fazla 3 fotoğraf veya 1 video)<input type="file" name="evidence" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple></label><p class="eris-mini-error" role="alert"></p><button class="eris-mini-submit" type="submit">Desteğe gönder</button></form>';
    document.body.append(shade);
    shade.querySelector('.eris-mini-icon').onclick=closeReport;
    shade.onclick=e=>{if(e.target===shade)closeReport()};
    const form=shade.querySelector('form'), error=shade.querySelector('.eris-mini-error');
    form.onsubmit=async e=>{
      e.preventDefault(); error.textContent='';
      const files=[...form.elements.evidence.files], videos=files.filter(f=>f.type.startsWith('video/'));
      if(files.length>3 || (videos.length && (files.length!==1 || videos.length!==1)) || files.some(f=>!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(f.type) || f.size>(f.type.startsWith('video/')?8*1024*1024:1500000))){error.textContent='En fazla 3 fotoğraf (her biri 1,5 MB) veya 1 video (8 MB) seçin.';return}
      if(!form.elements.reason.value.trim() || form.elements.reason.value.trim().length<3){error.textContent='Şikâyet nedenini yazın.';return}
      const submit=form.querySelector('[type=submit]');submit.disabled=true;
      try{
        const attachments=await Promise.all(files.map(f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Kanıt okunamadı.'));r.readAsDataURL(f)})));
        await api('/support/tickets',{method:'POST',body:JSON.stringify({category:'user_report',subject:'Kullanıcı şikâyeti: '+String(user.nickname||user.id).slice(0,85),message:'Şikâyet edilen kullanıcı ID: '+user.id+'\n'+form.elements.reason.value.trim(),attachments})});
        closeReport();window.toast?.('Şikâyet kanıtlarıyla birlikte desteğe iletildi.');
      }catch(err){error.textContent=err.message||'Şikâyet gönderilemedi.';submit.disabled=false}
    };
  }
  async function open(identifier) {
    if(!identifier)return;
    closeProfile();
    const shade=document.createElement('div');shade.className='eris-mini-shade eris-mini-profile-shade';
    shade.innerHTML='<section class="eris-mini-card" role="dialog" aria-modal="true" aria-label="Mini profil"><div class="eris-mini-head"><button type="button" class="eris-mini-portrait" aria-label="Tam profili aç">👤</button><div class="eris-mini-name">Yükleniyor…</div><button class="eris-mini-icon eris-mini-fan" data-fans type="button" title="Hayran listesi" aria-label="Hayran listesi">✦</button><div class="eris-mini-top"><button class="eris-mini-icon" data-report type="button" title="Şikâyet et" aria-label="Şikâyet et">!</button><button class="eris-mini-icon" data-close type="button" aria-label="Profili kapat">×</button></div></div><div class="eris-mini-stats"><div><b data-followers>–</b><small>Takipçi</small></div><div><b data-following>–</b><small>Takip</small></div><div><b data-gifters>–</b><small>Hediye gönderen</small></div></div><div class="eris-mini-actions"><button type="button" data-follow disabled>Takip et</button><button type="button" data-gift disabled>Hediye</button><button type="button" data-message disabled>Mesaj gönder</button></div><button type="button" class="eris-mini-submit eris-mini-block" data-block disabled>Engelle</button><p class="eris-mini-error" role="alert"></p></section>';
    document.body.append(shade);
    shade.querySelector('[data-close]').onclick=closeProfile;
    shade.onclick=e=>{if(e.target===shade)closeProfile()};
    const error=shade.querySelector('.eris-mini-error');
    try{
      const u=await api('/users/'+encodeURIComponent(identifier));
      if(!shade.isConnected)return;
      shade.querySelector('.eris-mini-name').textContent=u.nickname||'Kullanıcı';
      const portrait=shade.querySelector('.eris-mini-portrait'), avatar=asset(u.avatar_asset);
      portrait.textContent='';
      if(avatar){const img=document.createElement('img');img.src=avatar;img.alt='';portrait.append(img)}else portrait.textContent=u.avatar||'👤';
      const frame=asset(u.frame_asset);
      if(frame){const img=document.createElement('img');img.className='eris-mini-frame';img.src=frame;img.alt='';portrait.append(img)}
      portrait.onclick=()=>{closeProfile();document.getElementById('chat')?.classList.remove('show','eris-floating-dm');window.openUserProfile?.(u.id)};
      const level=Math.max(0,Math.min(40,Number(u.fan_level)||0));
      const fanButton=shade.querySelector('[data-fans]');
      fanButton.title='Hayran seviyesi '+level+' · listeyi aç';
      fanButton.setAttribute('aria-label',fanButton.title);
      if(level){const badge=document.createElement('img');badge.src='./fan-levels/LEVEL'+level+'.png';badge.alt='Hayran seviyesi '+level;badge.style.cssText='width:34px;height:34px;object-fit:contain';fanButton.replaceChildren(badge)}
      shade.querySelector('[data-followers]').textContent=count(u.followers_count);
      shade.querySelector('[data-following]').textContent=count(u.following_count);
      shade.querySelector('[data-gifters]').textContent=count(u.gift_fan_count);
      shade.querySelector('[data-fans]').onclick=()=>{closeProfile();window.ErisPersonalFanRanking?.(u.id)};
      shade.querySelector('[data-report]').onclick=()=>report(u);
      const follow=shade.querySelector('[data-follow]'), gift=shade.querySelector('[data-gift]'), message=shade.querySelector('[data-message]'), block=shade.querySelector('[data-block]');
      let following=!!u.is_following;
      let blocked=!!u.you_blocked;
      follow.textContent=u.is_self?'Kendi profilin':following?'Takibi bırak':'Takip et';
      const syncBlock=()=>{block.textContent=blocked?'Engeli kaldır':'Engelle';gift.disabled=!!u.is_self||blocked||!!u.blocked_by_them;message.disabled=gift.disabled};
      follow.disabled=!!u.is_self;block.disabled=!!u.is_self;syncBlock();
      block.onclick=async()=>{block.disabled=true;error.textContent='';try{
        await api('/users/'+encodeURIComponent(u.id)+'/block',{method:blocked?'DELETE':'POST'});
        blocked=!blocked;syncBlock();
        window.dispatchEvent(new CustomEvent('erischat:user-block-changed',{detail:{userId:u.id,blocked}}));
      }catch(e){error.textContent=e.message||'Engel işlemi başarısız.'}finally{block.disabled=!!u.is_self}};
      follow.onclick=async()=>{follow.disabled=true;error.textContent='';try{await api('/users/'+encodeURIComponent(u.id)+'/follow',{method:following?'DELETE':'POST'});following=!following;follow.textContent=following?'Takibi bırak':'Takip et';const followers=shade.querySelector('[data-followers]');followers.textContent=count(Number(String(followers.textContent).replace(/\D/g,''))+(following?1:-1));window.ErisProfile?.refresh?.()}catch(e){error.textContent=e.message||'Takip işlemi başarısız.'}finally{follow.disabled=false}};
      const conversation=async withGift=>{error.textContent='';try{if(!window.ErisChatDM?.openFloating)throw new Error('Mesajlaşma hazır değil.');await window.ErisChatDM.openFloating(u.id,u.nickname||'Kullanıcı',withGift);closeProfile()}catch(e){error.textContent=e.message||'Konuşma açılamadı.'}};
      message.onclick=()=>conversation(false);gift.onclick=()=>conversation(true);
    }catch(e){if(shade.isConnected)error.textContent=e.message||'Profil yüklenemedi.'}
  }
  window.ErisFloatingProfile={open,close:closeProfile,report};
})();
