// --- Kesin ve Kararlı Oda ve Sohbet Profil Popup Düzeltmesi ---
document.addEventListener('click', (e) => {
    // 1. Oda Katkı Listesi Satırları (.rc-row)
    const rcRow = e.target.closest('.rc-row');
    if (rcRow) {
        const nameEl = rcRow.querySelector('.rc-name');
        const username = nameEl ? nameEl.textContent.trim() : '';
        if (username) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (typeof window.openUserProfile === 'function') {
                window.ErisPlatform?.api('/discover/nearby').then(data => {
                    const rows = Array.isArray(data) ? data : (data?.users || data?.items || data?.data || []);
                    const found = rows.find(x => String(x.nickname || '').toLowerCase() === username.toLowerCase());
                    if (found?.id || found?.user_id) {
                        window.openUserProfile(found.id || found.user_id);
                    } else {
                        window.openUserProfile(username);
                    }
                }).catch(() => window.openUserProfile(username));
            }
            return;
        }
    }

    // 2. Sohbet Akışı Elementleri (İsim, Avatar, Mesaj İçi Etiketler)
    const chatTarget = e.target.closest('.room-chat-username, .room-chat-avatar, .user-mention-trigger, [data-user-id], .chat-message-user');
    if (chatTarget) {
        const userId = chatTarget.getAttribute('data-user-id') || chatTarget.dataset?.userId;
        const username = chatTarget.getAttribute('data-username') || chatTarget.textContent?.trim();

        if (userId && typeof window.openUserProfile === 'function') {
            e.preventDefault();
            e.stopImmediatePropagation();
            window.openUserProfile(userId);
            return;
        } else if (username && typeof window.openUserProfile === 'function') {
            e.preventDefault();
            e.stopImmediatePropagation();
            window.openUserProfile(username);
            return;
        }
    }
}, true);
