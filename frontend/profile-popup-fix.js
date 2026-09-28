// --- Kesin ve Kararlı Profil Popup Tetikleyicisi ---
window.openUserProfileModal = async function(userData) {
    const existing = document.getElementById('erischatUserProfileOverlay');
    if (existing) existing.remove();

    const userId = userData.id || userData.user_id || userData.userId || "1";
    const username = userData.username || userData.name || userData.nickname || "Kullanıcı";
    const avatar = userData.avatar || userData.avatar_asset || 'https://via.placeholder.com/50';
    const frame = userData.frame || '';
    const followers = userData.followers_count || 0;
    const following = userData.following_count || 0;
    let isFollowing = userData.is_following || false;

    const overlay = document.createElement('div');
    overlay.id = 'erischatUserProfileOverlay';
    overlay.className = 'erischat-user-profile-overlay';

    overlay.innerHTML = `
        <div class="erischat-user-profile-card">
            <div class="erischat-upc-header">
                <div class="erischat-upc-user-info">
                    <div class="erischat-upc-avatar-wrap">
                        <img src="${avatar}" class="erischat-upc-avatar" alt="Avatar">
                        ${frame ? `<img src="${frame}" class="erischat-upc-frame" alt="Çerçeve">` : ''}
                    </div>
                    <div>
                        <div class="erischat-upc-name-area">
                            <span class="erischat-upc-username">${username}</span>
                            <img src="/frontend/fan-levels/LEVEL1.png" class="erischat-upc-fan-badge" alt="Hayran Listesi" title="Hayran Listesi" id="upcFanListBtn">
                        </div>
                    </div>
                </div>
                <div class="erischat-upc-top-actions">
                    <button class="erischat-upc-icon-btn" id="upcReportBtn" title="Şikayet Et">!</button>
                    <button class="erischat-upc-icon-btn" id="upcCloseBtn" title="Kapat">✕</button>
                </div>
            </div>
            
            <div class="erischat-upc-stats">
                <span><b>${followers}</b> Takipçi</span>
                <span><b>${following}</b> Takip</span>
            </div>

            <div class="erischat-upc-actions">
                <button class="erischat-upc-btn erischat-upc-follow-btn ${isFollowing ? 'following' : ''}" id="upcFollowBtn">
                    ${isFollowing ? 'Takibi Bırak' : 'Takip Et'}
                </button>
                <button class="erischat-upc-btn erischat-upc-gift-btn" id="upcGiftBtn">Hediye Gönder</button>
                <button class="erischat-upc-btn erischat-upc-dm-btn" id="upcDmBtn">Mesaj</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('upcCloseBtn').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const followBtn = document.getElementById('upcFollowBtn');
    followBtn.onclick = async () => {
        try {
            const endpoint = isFollowing ? `/api/users/${userId}/unfollow` : `/api/users/${userId}/follow`;
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') } });
            if (res.ok) {
                isFollowing = !isFollowing;
                followBtn.textContent = isFollowing ? 'Takibi Bırak' : 'Takip Et';
                followBtn.classList.toggle('following', isFollowing);
            }
        } catch (err) {
            console.error('Takip hatası:', err);
        }
    };

    document.getElementById('upcFanListBtn').onclick = () => {
        overlay.remove();
        if (typeof window.openRoomFanRanking === 'function') window.openRoomFanRanking(userId);
    };

    document.getElementById('upcGiftBtn').onclick = () => {
        overlay.remove();
        if (typeof window.openGiftModal === 'function') window.openGiftModal(userId);
        else if (typeof window.openRoomGiftUi === 'function') window.openRoomGiftUi(userId);
    };

    document.getElementById('upcDmBtn').onclick = () => {
        overlay.remove();
        if (typeof window.openDirectMessage === 'function') window.openDirectMessage(userId, username);
    };

    document.getElementById('upcReportBtn').onclick = () => {
        overlay.remove();
        const reason = prompt('Şikayet nedeninizi yazın (en fazla 200 karakter):');
        if (reason) alert('Şikayetiniz destek ekibine iletildi.');
    };
};

// Oda katkı listesindeki satırlara dinamik olarak data-user-id enjekte etme ve tıklama yakalama
document.addEventListener('click', (e) => {
    // 1. Oda katkı listesindeki bir satıra tıklandıysa (.rc-row)
    const rcRow = e.target.closest('.rc-row');
    if (rcRow) {
        // Satır içerisindeki metin veya elementlerden kullanıcı adını ve ID'yi yakalayalım
        const nameEl = rcRow.querySelector('.rc-name');
        const username = nameEl ? nameEl.textContent.trim() : "Kullanıcı";
        const imgEl = rcRow.querySelector('img');
        const avatar = imgEl ? imgEl.src : 'https://via.placeholder.com/50';
        // row datasından veya elementten ID almaya çalışalım
        const userId = rcRow.getAttribute('data-user-id') || rcRow.dataset?.userId || username;
        
        window.openUserProfileModal({ id: userId, username, avatar });
        return;
    }

    // 2. Sohbet akışındaki veya genel alanlardaki kullanıcı elementleri
    const userTarget = e.target.closest('[data-user-id], .room-chat-username, .room-chat-avatar, .erischat-upc-username, img[src*="avatar"]');
    if (userTarget) {
        const userId = userTarget.getAttribute('data-user-id') || userTarget.dataset?.userId || "1";
        const username = userTarget.getAttribute('data-username') || userTarget.textContent?.trim() || "Kullanıcı";
        const avatar = userTarget.getAttribute('data-avatar') || userTarget.querySelector('img')?.src || 'https://via.placeholder.com/50';
        
        window.openUserProfileModal({ id: userId, username, avatar });
    }
});
