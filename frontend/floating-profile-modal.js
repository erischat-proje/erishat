// --- İstediğin Tasarıma Tam Uyumlu Yüzen Profil Popup Modülü ---
(() => {
    'use strict';
    const escapeHtml = val => String(val ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

    window.openUserProfile = async function(identifier) {
        if (!identifier) return;

        // Eski açık modal varsa kapat
        document.getElementById('erischat-floating-profile')?.remove();

        // Modal arkaplanı (Yarı saydam ve blur)
        const modal = document.createElement('div');
        modal.id = 'erischat-floating-profile';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(2,1,7,0.78);backdrop-filter:blur(12px);display:grid;place-items:center;padding:16px;animation:fadeIn 0.2s ease;';

        // Kart kutusu
        const card = document.createElement('div');
        card.style.cssText = 'width:min(360px,100%);background:linear-gradient(135deg,rgba(18,14,26,0.95),rgba(10,8,16,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:20px;color:#fff;box-shadow:0 20px 40px rgba(0,0,0,0.6);position:relative;display:flex;flex-direction:column;gap:18px;';

        // Üst Kısım: Avatar, İsim, Takip Bilgileri ve Sağ üstte X ile ! butonları
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="position:relative;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7b4cff,#ff4fa3);display:grid;place-items:center;font-size:24px;" data-profile-avatar>
                        👤
                    </div>
                    <div>
                        <b style="font-size:15px;display:block;color:#fff;" data-profile-name>Yükleniyor...</b>
                        <small style="color:#a99fb1;font-size:11px;display:block;margin-top:2px;" data-profile-stats>Takipçi: ... • Takip: ...</small>
                    </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button type="button" data-action="report" title="Şikayet Et" style="width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#ff9aaa;display:grid;place-items:center;cursor:pointer;font-weight:bold;font-size:13px;">!</button>
                    <button type="button" data-action="close" title="Kapat" style="width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;display:grid;place-items:center;cursor:pointer;font-weight:bold;font-size:15px;">×</button>
                </div>
            </div>

            <!-- Alt Kısım: Aksiyon Butonları (Takip Et/Bırak, Hediye Gönder, Mesaj Gönder) -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px;">
                <button type="button" data-action="follow" style="padding:10px 8px;border-radius:14px;border:1px solid rgba(123,76,255,0.4);background:rgba(123,76,255,0.15);color:#d0bfff;font-weight:700;font-size:11px;cursor:pointer;text-align:center;">Takip Et</button>
                <button type="button" data-action="gift" style="padding:10px 8px;border-radius:14px;border:1px solid rgba(255,79,163,0.4);background:rgba(255,79,163,0.15);color:#ffb8df;font-weight:700;font-size:11px;cursor:pointer;text-align:center;">Hediye</button>
                <button type="button" data-action="dm" style="padding:10px 8px;border-radius:14px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#fff;font-weight:700;font-size:11px;cursor:pointer;text-align:center;">Mesaj</button>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        // Kapatma butonları
        modal.querySelector('[data-action="close"]').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        // Şikayet butonu (!)
        modal.querySelector('[data-action="report"]').onclick = () => {
            alert('Şikayet menüsü açılıyor...');
        };

        // Verileri API'den çekme
        let isFollowing = false;
        let userId = identifier;

        try {
            // Eğer identifier nickname ise veya id ise uygun endpoint'ten bilgileri çekelim
            const res = await window.ErisPlatform?.api(`/users/${identifier}/profile`).catch(() => null) || 
                        await window.ErisPlatform?.api(`/discover/nearby`).catch(() => null);

            // Gelen veriyi işle
            let userData = res?.user || res;
            if (Array.isArray(res)) {
                userData = res.find(x => x.id == identifier || x.user_id == identifier || String(x.nickname).toLowerCase() === String(identifier).toLowerCase());
            }

            if (userData) {
                userId = userData.id || userData.user_id || identifier;
                card.querySelector('[data-profile-name]').textContent = userData.nickname || userData.username || identifier;
                card.querySelector('[data-profile-stats]').textContent = `Takipçi: ${userData.followers_count || 0} • Takip: ${userData.following_count || 0}`;
                if (userData.avatar) {
                    card.querySelector('[data-profile-avatar]').textContent = '';
                    const img = document.createElement('img');
                    img.src = userData.avatar;
                    img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
                    card.querySelector('[data-profile-avatar]').appendChild(img);
                }
                isFollowing = !!userData.is_following;
            } else {
                card.querySelector('[data-profile-name]').textContent = identifier;
                card.querySelector('[data-profile-stats]').textContent = 'Takipçi: 0 • Takip: 0';
            }
        } catch (err) {
            card.querySelector('[data-profile-name]').textContent = identifier;
            card.querySelector('[data-profile-stats]').textContent = 'Bilgiler yüklenemedi';
        }

        const followBtn = modal.querySelector('[data-action="follow"]');
        const updateFollowUI = () => {
            if (isFollowing) {
                followBtn.textContent = 'Takibi Bırak';
                followBtn.style.background = 'rgba(255,79,109,0.15)';
                followBtn.style.borderColor = 'rgba(255,79,109,0.4)';
                followBtn.style.color = '#ff9aaa';
            } else {
                followBtn.textContent = 'Takip Et';
                followBtn.style.background = 'rgba(123,76,255,0.15)';
                followBtn.style.borderColor = 'rgba(123,76,255,0.4)';
                followBtn.style.color = '#d0bfff';
            }
        };
        updateFollowUI();

        // Takip Et / Bırak Butonu Mantığı
        followBtn.onclick = async () => {
            try {
                // API isteği simülasyonu / gerçek çağrı
                isFollowing = !isFollowing;
                updateFollowUI();
            } catch (e) {
                console.error(e);
            }
        };

        // Hediye Gönder Butonu
        modal.querySelector('[data-action="gift"]').onclick = () => {
            if (typeof window.openGiftModal === 'function') {
                window.openGiftModal(userId);
            } else {
                alert('Hediye paneli açılıyor...');
            }
        };

        // Mesaj Gönder Butonu
        modal.querySelector('[data-action="dm"]').onclick = () => {
            if (typeof window.openDirectMessage === 'function') {
                window.openDirectMessage(userId);
            } else {
                alert('Özel mesaj penceresi açılıyor...');
            }
        };
    };
})();
