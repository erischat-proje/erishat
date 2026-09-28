(() => {
    'use strict';
    const api = () => window.ErisPlatform;
    const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    async function getUser(id){
        if(!id || !api()?.api) throw new Error('Profil servisi hazır değil.');
        return api().api('/users/'+encodeURIComponent(id));
    }

    async function openUserProfile(userId){
        const id=String(userId||'').trim(); if(!id)return;
        try{
            const [u,blockedRows,vip,fans,gifts]=await Promise.all([
                getUser(id),
                api().api('/me/blocks').catch(()=>[]),
                api().api('/users/'+encodeURIComponent(id)+'/vip').catch(()=>({level:0})),
                api().api('/users/'+encodeURIComponent(id)+'/fans').catch(()=>({total:0})),
                api().api('/users/'+encodeURIComponent(id)+'/profile-gifts').catch(()=>[])
            ]);
            let blocked=(Array.isArray(blockedRows)?blockedRows:[]).some(row=>String(row.user_id)===String(u.id));
            const blockedByThem=Boolean(u.blocked_by_them);
            document.getElementById('erisUserProfileModal')?.remove();

            const m=document.createElement('div');
            m.id='erisUserProfileModal';
            m.style.cssText='position:fixed;inset:0;z-index:10000;background:#09070d;overflow:auto;padding:0';
            
            const publicId=/^\d{10}$/.test(String(u.public_id||''))?String(u.public_id):'gizli';
            const avatarPath=u.avatar_asset||('avatarveduvarkağıdı/BİTMİŞ AVATAR/STANDART KADIN AVATAR/1.png');
            const framePath=u.frame_asset||'';
            const avatarUrl=avatarPath?(window.ErisChatCosmetics?.assetUrl?.(avatarPath)||avatarPath):'';
            const frameUrl=framePath?(window.ErisChatCosmetics?.assetUrl?.(framePath)||framePath):'';

            m.innerHTML=`<div style="width:100%;min-height:100%;max-height:100dvh;overflow:auto;background:#0b0811;border:0;border-radius:0;padding:20px 20px calc(24px + env(safe-area-inset-bottom));color:#fff"><button data-close style="float:right;border:0;background:#ffffff10;color:#fff;border-radius:10px;padding:8px;font-size:18px">×</button><div style="display:flex;gap:14px;align-items:center;padding:8px 0 14px"><div style="position:relative;width:76px;height:76px;flex:none"><div style="width:64px;height:64px;margin:6px;border-radius:50%;background:${avatarUrl?`url("${esc(avatarUrl)}") center/cover`: 'linear-gradient(135deg,#824dff,#ff4da8)'};display:grid;place-items:center;font-size:26px">${avatarUrl?'':esc(u.avatar||'👤')}</div>${frameUrl?`<div aria-hidden="true" style="position:absolute;inset:0;background:url("${esc(frameUrl)}") center/contain no-repeat;pointer-events:none"></div>`:''}</div><div style="min-width:0"><h2 style="margin:0 0 5px">${esc(u.nickname||'Kullanıcı')}</h2><small style="color:#918699">Kullanıcı ID: ${esc(publicId)}</small></div></div><div style="padding:12px;border:1px solid #ffffff12;border-radius:15px;background:#ffffff05;font-size:12px;line-height:1.6;color:#c9bfd3">${esc(u.bio||'Henüz hakkında bilgisi eklenmemiş.')}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px"><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Number(vip.level||0)}</b><small style="display:block;color:#918699;font-size:9px">VIP</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Number(fans.total||0)}</b><small style="display:block;color:#918699;font-size:9px">Takipçi</small></div><div style="text-align:center;padding:9px;border-radius:12px;background:#ffffff08"><b>${Array.isArray(gifts)?gifts.length:0}</b><small style="display:block;color:#918699;font-size:9px">Hediye</small></div></div><div style="display:flex;gap:8px;margin-top:14px"><button data-follow style="flex:1;border:0;background:linear-gradient(135deg,#754cff,#ff4da3);color:#fff;border-radius:12px;padding:11px;font-weight:800">${u.is_following?'Takip ediliyor':'Takip et'}</button><button data-block style="flex:1;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">${blocked?'Engeli kaldır':'Engelle'}</button></div><button data-message style="width:100%;margin-top:8px;border:1px solid #ffffff18;background:#ffffff0c;color:#fff;border-radius:12px;padding:11px;font-weight:800">💬 Mesaj gönder</button></div>`;

            document.body.appendChild(m);
            m.querySelector('[data-close]').onclick = () => m.remove();
            m.onclick = e => { if (e.target === m) m.remove(); };

            const followButton = m.querySelector('[data-follow]');
            if(u.is_self){followButton.disabled=true;followButton.textContent='Bu senin profilin';}
            followButton.onclick = async()=>{
                followButton.disabled=true;
                try{
                    const following=followButton.textContent==='Takip ediliyor';
                    await api().api('/users/'+encodeURIComponent(u.id)+'/follow',{method:following?'DELETE':'POST'});
                    followButton.textContent=following?'Takip et':'Takip ediliyor';
                }catch(error){window.toast?.(error.message||'Takip işlemi başarısız.')}finally{followButton.disabled=false}
            };

            const messageButton=m.querySelector('[data-message]');
            messageButton.onclick = async()=>{
                if(blocked || blockedByThem) return;
                try{
                    const c=await api().createConversation(id);
                    m.remove();
                    window.__erisActiveDmUserId=id;
                    window.ErisChatDM?.load?.();
                    window.ErisChatDM?.open?.(c?.id||c?.conversation_id||c?.conversation?.id,u.nickname||'Kullanıcı',u.avatar_asset||u.avatar||'',u.id||id);
                }catch(e){window.toast?.(e.message||'Konuşma açılamadı.');}
            };
        }catch(e){window.toast?.(e.message||'Kullanıcı bulunamadı.');}
    }

    window.openUserProfile = openUserProfile;

    // Evrensel Tıklama Dinleyicisi (Sohbet ve Oda Katkı Listesi Dahil)
    document.addEventListener('click', e => {
        // 1. Oda katkı listesindeki satırlar (.rc-row)
        const rcRow = e.target.closest('.rc-row');
        if(rcRow) {
            const nameEl = rcRow.querySelector('.rc-name');
            const username = nameEl ? nameEl.textContent.trim() : '';
            if(username) {
                e.preventDefault();
                e.stopImmediatePropagation();
                api().api('/discover/nearby').then(data => {
                    const rows = Array.isArray(data)?data:(data?.users||data?.items||data?.data||[]);
                    const found = rows.find(x => String(x.nickname||'').toLowerCase() === username.toLowerCase());
                    if(found?.id) openUserProfile(found.id);
                }).catch(()=>{});
                return;
            }
        }

        // 2. Diğer tüm kullanıcı elementleri
        const t = e.target.closest?.('[data-user-id], .room-chat-username, .room-chat-avatar, .user-mention-trigger');
        if(t) {
            const uid = t.getAttribute('data-user-id') || t.dataset?.userId;
            if(uid) {
                e.preventDefault();
                e.stopImmediatePropagation();
                openUserProfile(uid);
                return;
            }
        }
    }, true);

    function mark(){
        document.querySelectorAll('.rc-row').forEach(row => {
            if(!row.dataset.boundClick) {
                row.dataset.boundClick = 'true';
                row.style.cursor = 'pointer';
            }
        });
    }

    const mo = new MutationObserver(mark);
    const start = () => { mark(); mo.observe(document.body, {childList:true, subtree:true}); };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
