(() => {
  'use strict';
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
      if (state === 'error') { title.textContent = 'Oturum kullanılamıyor'; detail.textContent = 'Anonim oturum oluşturulamadı.'; dot.style.background = '#ff6b81'; return; }
      if (state === 'logged_out') { title.textContent = 'Oturum kapalı'; detail.textContent = 'Token temizlendi. Yeni oturum gerektiğinde oluşturulacak.'; dot.style.background = '#e4b85d'; return; }
      if (state === 'ready' || user) {
        title.textContent = 'Anonim oturum aktif';
        detail.textContent = user?.nickname ? `${user.nickname} • oturum güvenli` : 'Oturum token ile aktif';
        dot.style.background = '#54dfaa';
        return;
      }
      if (state === 'open') { title.textContent = 'Canlı bağlantı aktif'; detail.textContent = 'Gerçek zamanlı bağlantı açık.'; dot.style.background = '#54dfaa'; return; }
      if (state === 'closed') { title.textContent = 'Canlı bağlantı yeniden deneniyor'; detail.textContent = 'Oturum korunuyor, bağlantı tekrar kurulacak.'; dot.style.background = '#e4b85d'; return; }
      if (state === 'error') { title.textContent = 'Canlı bağlantı hatası'; detail.textContent = 'Bağlantı tekrar kurulacak.'; dot.style.background = '#ff6b81'; }
    };
    window.addEventListener('erischat:auth', render);
    window.addEventListener('erischat:ws', render);
    render({ detail: { state: window.ErisAuth?.user ? 'ready' : 'pending', user: window.ErisAuth?.user } });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
