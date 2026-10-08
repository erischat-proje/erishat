(() => {
  'use strict';
  const style=document.createElement('style');
  style.textContent=`
    [data-profile-logout]{display:none!important}
    #erisProfileHub .eph-tabs [data-account-action]{white-space:nowrap;word-break:normal;overflow-wrap:normal}
    #erisAccountPicker{position:fixed;inset:0;z-index:110000;background:#030208b8;display:grid;place-items:center;padding:18px;box-sizing:border-box;backdrop-filter:blur(8px)}
    #erisAccountPicker *{box-sizing:border-box}
    .eris-account-dialog{width:min(460px,100%);max-height:85dvh;overflow:auto;background:linear-gradient(145deg,#21182d,#100d17);border:1px solid #b996dc40;border-radius:24px;padding:20px;color:#fff;box-shadow:0 24px 80px #0009}
    .eris-account-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .eris-account-heading h2{margin:0;font-size:21px}
    #erisAccountPicker button{font:inherit;cursor:pointer;color:#eee8f3}
    #erisAccountPicker button:disabled{opacity:.55;cursor:wait}
    .eris-picker-close,.eris-picker-remove{border:1px solid #ffffff20;background:#ffffff08;border-radius:12px;width:40px;height:40px;flex:none;font-size:25px!important}
    .eris-picker-note{font-size:12px;color:#bbaaca;line-height:1.5;margin:12px 0 18px}
    .eris-picker-row{display:flex;align-items:center;gap:8px;margin:9px 0}
    .eris-picker-select{display:flex;align-items:center;gap:12px;flex:1;min-width:0;border:1px solid #ffffff20;background:#ffffff05;border-radius:15px;padding:12px;text-align:left}
    .eris-picker-select[aria-current=true]{border-color:#ae82dc;background:#ae82dc16}
    .eris-picker-avatar{width:46px;height:46px;border-radius:50%;object-fit:cover;flex:none;display:grid;place-items:center;background:#382647;font-size:25px;overflow:hidden}
    .eris-picker-copy{min-width:0;flex:1}
    .eris-picker-copy b,.eris-picker-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .eris-picker-copy small{color:#b6a4c6;font-size:11px;margin-top:5px}
    .eris-picker-status{font-size:12px;color:#e8b5d1;line-height:1.5;min-height:18px}
  `;
  document.head.append(style);
  function openAccountPicker(trigger) {
    if(document.getElementById('erisAccountPicker'))return;
    const shade=document.createElement('div');shade.id='erisAccountPicker';
    shade.innerHTML='<section class="eris-account-dialog" role="dialog" aria-modal="true" aria-labelledby="erisAccountPickerTitle"><header class="eris-account-heading"><h2 id="erisAccountPickerTitle">Kayıtlı hesaplar</h2><button type="button" class="eris-picker-close" aria-label="Kapat">×</button></header><p class="eris-picker-note">Bu cihazda en fazla 5 hesap kaydedilebilir.</p><div data-picker-list></div><div class="eris-picker-status" role="status" aria-live="polite"></div><div data-picker-login></div></section>';
    let busy=false;
    const close=()=>{if(busy)return;if(shade.querySelector('#erisGoogleGate'))window.ErisAuth.cancelAccountLogin();shade.remove();trigger?.focus();};
    shade.querySelector('.eris-picker-close').onclick=close;
    shade.onclick=e=>{if(e.target===shade)close();};
    shade.onkeydown=e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){
        const items=[...shade.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(el=>!el.hidden && !el.closest('[hidden]'));
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    const list=shade.querySelector('[data-picker-list]'),status=shade.querySelector('.eris-picker-status');
    const render=()=>{
      list.replaceChildren();
      const rows=window.ErisAuth.rememberedAccounts();
      if(!rows.length){list.textContent='Henüz kayıtlı hesap yok.';return;}
      rows.forEach(account=>{
        const row=document.createElement('div');row.className='eris-picker-row';
        const select=document.createElement('button');select.type='button';select.className='eris-picker-select';
        const active=String(window.ErisAuth.user?.id)===account.id;
        select.setAttribute('aria-current',String(active));
        let source=account.avatar_asset;
        if(source && window.ErisChatCosmetics?.assetUrl)source=window.ErisChatCosmetics.assetUrl(source);
        const valid=source && (/^https?:\/\//i.test(source)||/^\/(?!\/)/.test(source)||/^\.\//.test(source));
        const avatar=document.createElement(valid?'img':'span');avatar.className='eris-picker-avatar';
        if(valid){avatar.src=source;avatar.alt='';avatar.onerror=()=>{const fallback=document.createElement('span');fallback.className='eris-picker-avatar';fallback.textContent='👤';avatar.replaceWith(fallback);};}else avatar.textContent=account.avatar||'👤';
        const copy=document.createElement('span');copy.className='eris-picker-copy';
        const name=document.createElement('b');name.textContent=account.nickname;
        const detail=document.createElement('small');detail.textContent=(active?'Aktif hesap · ':'')+'ID: '+(account.public_id||account.id);
        copy.append(name,detail);select.append(avatar,copy);
        select.onclick=async()=>{
          if(busy)return;if(active){close();return;}
          busy=true;shade.querySelectorAll('button').forEach(button=>button.disabled=true);status.textContent='Hesaba geçiliyor…';
          try{
            const switched=await window.ErisAuth.switchAccount(account.id);
            if(switched)return;
            status.textContent='Bu hesabın ilk doğrulamasını aşağıdan tamamla.';
            if(shade.querySelector('#erisGoogleGate'))window.ErisAuth.cancelAccountLogin();
            window.ErisAuth.openAccountLogin(shade.querySelector('[data-picker-login]'),account);
          }catch(error){status.textContent=error.message||'Hesaba geçilemedi.';}
          finally{busy=false;shade.querySelectorAll('button').forEach(button=>button.disabled=false);}
        };
        const remove=document.createElement('button');remove.type='button';remove.className='eris-picker-remove';remove.textContent='×';remove.setAttribute('aria-label',account.nickname+' hesabını listeden kaldır');
        remove.onclick=()=>{if(busy)return;window.ErisAuth.forgetAccount(account.id);if(shade.querySelector('#erisGoogleGate'))window.ErisAuth.cancelAccountLogin();render();status.textContent='Hesap kayıtlı listeden kaldırıldı.';};
        row.append(select,remove);list.append(row);
      });
    };
    document.body.append(shade);render();shade.querySelector('.eris-picker-close').focus();
  }
  function mountAccountActions() {
    const strip=document.querySelector('#erisProfileHub .eph-tabs');
    if(!strip || strip.querySelector('[data-account-action]'))return;
    const buttons=[['switch','Hesap değiştir','profile'],['logout','Çıkış yap','blocked']].map(([key,label,icon])=>{
      const button=document.createElement('button');button.type='button';button.dataset.accountAction=key;
      button.innerHTML='<svg class="eph-icon" aria-hidden="true"><use href="#home-'+icon+'"></use></svg><span>'+label+'</span>';
      button.onclick=async()=>{
        if(key==='switch'){openAccountPicker(button);return;}
        button.disabled=true;
        try{await window.ErisAuth.logout();}catch(error){window.toast?.(error.message||'Çıkış tamamlanamadı.');button.disabled=false;}
      };
      return button;
    });
    const keepLast=()=>{if(strip.lastElementChild!==buttons[1] || buttons[1].previousElementSibling!==buttons[0])strip.append(...buttons);};
    keepLast();new MutationObserver(keepLast).observe(strip,{childList:true});
  }
  const boot = () => {
    const profile = document.querySelector('.profile');
    if (!profile || profile.querySelector('[data-erischat-session-status]')) return;
    const card = document.createElement('div');
    card.setAttribute('data-erischat-session-status', '');
    card.style.cssText = 'margin-top:10px;padding:11px 12px;border:1px solid #ffffff14;border-radius:14px;background:#ffffff05;display:flex;align-items:center;gap:9px';
    card.innerHTML = '<span data-session-dot style="width:8px;height:8px;border-radius:50%;background:#938a9f;flex:none"></span><div style="min-width:0"><b data-session-title style="display:block;font-size:10px">Oturum durumu</b><small data-session-detail style="display:block;color:#938a9f;font-size:8px;margin-top:3px">Kontrol ediliyor…</small></div>';
    const controls = profile.querySelector('[data-erischat-profile-controls]');
    if (controls) profile.insertBefore(card, controls); else profile.appendChild(card);
    const dot = card.querySelector('[data-session-dot]');
    const title = card.querySelector('[data-session-title]');
    const detail = card.querySelector('[data-session-detail]');
    const render = detailEvent => {
      const state = detailEvent?.detail?.state;
      const user = detailEvent?.detail?.user || window.ErisAuth?.user;
      if (state === 'error') {
        title.textContent = detailEvent.type === 'erischat:ws' ? 'Canlı bağlantı hatası' : 'Oturum kullanılamıyor';
        detail.textContent = detailEvent.type === 'erischat:ws' ? 'Bağlantı tekrar kurulacak.' : 'Oturum oluşturulamadı.';
        dot.style.background = '#ff6b81';
        return;
      }
      if (state === 'logged_out') { title.textContent = 'Oturum kapalı'; detail.textContent = 'Hesap listede hatırlanır. Geri girişte doğrulama yapılır.'; dot.style.background = '#e4b85d'; return; }
      if (state === 'ready' || user) {
        title.textContent = 'Oturum aktif';
        detail.textContent = user?.nickname ? `${user.nickname} • oturum güvenli` : 'Oturum token ile aktif';
        dot.style.background = '#54dfaa';
        return;
      }
      if (state === 'open') { title.textContent = 'Canlı bağlantı aktif'; detail.textContent = 'Gerçek zamanlı bağlantı açık.'; dot.style.background = '#54dfaa'; return; }
      if (state === 'closed') { title.textContent = 'Canlı bağlantı yeniden deneniyor'; detail.textContent = 'Oturum korunuyor, bağlantı tekrar kurulacak.'; dot.style.background = '#e4b85d'; return; }
    };
    window.addEventListener('erischat:auth', render);
    window.addEventListener('erischat:ws', render);
    render({ type: 'erischat:auth', detail: { state: window.ErisAuth?.user ? 'ready' : 'pending', user: window.ErisAuth?.user } });
  };
  const start=()=>{boot();setTimeout(mountAccountActions,0);};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
