(() => {
  'use strict';
  const api = (path, options) => window.ErisPlatform.api(path, options);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const panel = () => document.getElementById('erisProfileHub');
  function mount() {
    const view = document.getElementById('profile');
    if (!view || panel()) return;
    const hub = document.createElement('section');
    hub.id = 'erisProfileHub';
    hub.innerHTML = `<style>
      #erisProfileHub{margin:16px 0 24px;color:#fff;min-width:0}
      #erisProfileHub .eph-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:5px 0 12px;max-width:100%}
      #erisProfileHub button{min-width:0;width:100%;border:1px solid #ffffff20;background:#15121b;color:#d7d0dc;border-radius:12px;padding:10px 8px;font-size:12px;white-space:normal;min-height:42px;transition:background .16s,border-color .16s,color .16s}
      #erisProfileHub button[aria-selected=true]{background:linear-gradient(135deg,#754cff32,#ef4eac18);border-color:#9c78ff;color:#fff;box-shadow:inset 3px 0 #a77aff}
      #erisProfileHub .eph-body{background:linear-gradient(145deg,#15121c,#0c0a10);border:1px solid #ffffff18;border-radius:19px;padding:17px;min-height:82px;font-size:13px;box-shadow:0 12px 30px #0003}
      #erisProfileHub .eph-body h3{margin:0 0 14px;font-size:16px;letter-spacing:-.2px}
      #erisProfileHub .eph-row{padding:9px 0;border-bottom:1px solid #ffffff12;display:flex;align-items:center;justify-content:space-between;gap:9px}
      #erisProfileHub .eph-body input,#erisProfileHub .eph-body textarea{display:block;width:100%;box-sizing:border-box;padding:12px;background:#100e15;border:1px solid #ffffff20;color:#fff;border-radius:12px;margin:6px 0 14px;font:inherit;outline:none}
      #erisProfileHub .eph-body input:focus,#erisProfileHub .eph-body textarea:focus{border-color:#9b76ff;box-shadow:0 0 0 3px #8a5cff22}
      @media(max-width:520px){#erisProfileHub .eph-tabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#erisProfileHub .eph-tabs button{font-size:11px;padding:9px 7px;min-height:44px}#erisProfileHub .eph-body{padding:15px;border-radius:17px}}
      #erisProfileHub .eph-body label{font-size:11px;color:#c4b5d2}
      #erisProfileHub .eph-muted{color:#aea0bc;font-size:11px;line-height:1.5}
      #erisProfileHub{margin-top:18px}
      #erisProfileHub .eph-tabs{gap:9px;padding-bottom:14px}
      #erisProfileHub .eph-tabs button{display:flex;align-items:center;gap:11px;text-align:left;min-height:64px;padding:12px 15px;border-radius:18px;border-color:#ffffff1b;background:linear-gradient(145deg,#17131e,#100e17);color:#eee8f3;font-size:13px;font-weight:700}
      #erisProfileHub .eph-tabs button[aria-selected=true]{border-color:#b18ade82;background:linear-gradient(145deg,#302139,#191321);box-shadow:none}
      #erisProfileHub .eph-icon{flex:none;width:24px;height:24px;color:#bb99e9;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      #erisProfileHub .eph-body{padding:clamp(18px,4vw,26px);border-color:#a986ce31;border-radius:23px;background:linear-gradient(145deg,#191420,#100e17);box-shadow:none}
      #erisProfileHub .eph-body h3{font-size:19px;letter-spacing:-.35px}
      #erisProfileHub .eph-row{padding:13px 0}
      @media(max-width:390px){#erisProfileHub .eph-tabs button{min-height:70px;padding:10px;gap:8px;font-size:11px}#erisProfileHub .eph-icon{width:20px;height:20px}}
      #erisProfileHub .eph-tabs[hidden],#erisProfileHub .eph-body[hidden]{display:none!important}
      #erisProfileHub .eph-tabs{margin-top:10px;padding:0;max-height:none;overflow:visible;border:0;background:none}
      #erisProfileHub .eph-section-label{display:block;margin:0 2px 12px;color:#b69ace;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}
      #erisProfileHub .eph-tabs button{min-height:52px}
      #erisProfileHub .eph-body{margin-top:12px}
      body.eph-dialog-open{overflow:hidden}
      .eph-overlay[hidden],.eph-overlay [hidden]{display:none!important}
      .eph-overlay{position:fixed;inset:0;z-index:9500;display:grid;place-items:center;padding:16px;background:#030208d9;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
      .eph-dialog{width:min(640px,100%);max-height:min(88dvh,820px);display:flex;flex-direction:column;overflow:hidden;border:1px solid #b996dc39;border-radius:28px;background:radial-gradient(circle at 100% 0,#9b4fbe2b,transparent 55%),linear-gradient(145deg,#1f1829,#0f0d16 78%);box-shadow:0 28px 85px #000b;color:#fff}
      .eph-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px 20px 16px;border-bottom:1px solid #ffffff16}
      .eph-dialog-head small{display:block;color:#bfa8df;font-size:10px;font-weight:800;letter-spacing:1.8px}
      .eph-dialog-head h2{margin:7px 0 0;font-size:clamp(22px,5vw,30px);line-height:1.2}
      .eph-overlay .eph-close{flex:none;width:44px;height:44px;border:1px solid #ffffff21;border-radius:15px;background:#ffffff09;color:#fff;font-size:27px;line-height:1}
      .eph-dialog-content{overflow-y:auto;overscroll-behavior:contain;padding:18px 20px 22px}
      .eph-overlay .eph-body{padding:0;border:0;background:none;box-shadow:none;font-size:13px;color:#eee8f3}
      .eph-overlay .eph-body h3{margin:0 0 16px;font-size:19px}
      .eph-overlay .eph-body label{display:block;color:#c4b5d2;font-size:12px}
      .eph-overlay .eph-body input,.eph-overlay .eph-body textarea{display:block;width:100%;box-sizing:border-box;padding:12px;background:#100e15;border:1px solid #ffffff20;color:#fff;border-radius:12px;margin:6px 0 14px;font:inherit}
      .eph-overlay .eph-body button{min-height:42px;border:1px solid #ffffff20;background:#211a2c;color:#fff;border-radius:12px;padding:10px 13px}
      .eph-overlay .eph-row{padding:12px 0;border-bottom:1px solid #ffffff12;display:flex;align-items:center;justify-content:space-between;gap:10px}
      .eph-overlay .eph-muted{color:#b3a6bf;font-size:11px;line-height:1.5}
      .eph-overlay [data-erischat-profile-controls]{display:grid!important;margin:0!important;border:0!important;background:none!important;padding:0!important}
      .eph-overlay #erisProfileRooms{display:block!important;margin:0}
      .eph-overlay #erisProfileRooms[hidden],.eph-overlay [data-erischat-profile-controls][hidden]{display:none!important}
      @media(max-width:520px){.eph-overlay{padding:12px}.eph-dialog{max-height:90dvh;border-radius:24px}.eph-dialog-head{padding:17px}.eph-dialog-content{padding:16px}}
      .eph-info-form{max-width:640px;margin:auto}.eph-info-summary{display:flex;align-items:center;gap:14px;padding:17px;border:1px solid #b78ddd22;border-radius:20px;background:linear-gradient(125deg,#291c35,#17121f)}.eph-info-summary>div{min-width:0}.eph-info-summary b{display:block;font-size:18px;overflow-wrap:anywhere}.eph-info-summary [data-id]{display:block;font-size:11px;color:#ad9cbc;margin-top:6px}.eph-info-avatar{position:relative;display:grid;place-items:center;width:54px;height:54px;flex:none;border-radius:18px;background:#9464c82a;color:#ddbcfa;font-size:22px;overflow:hidden}.eph-info-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.eph-info-intro{font-size:13px;line-height:1.6;color:#af9dbd;margin:20px 0}.eph-info-names{display:grid;grid-template-columns:1fr 1fr;gap:12px}.eph-info-form input,.eph-info-form textarea{font-size:16px!important;min-height:48px;border-radius:15px!important;padding:13px!important;resize:vertical;max-width:100%}.eph-info-form label{font-size:12px!important}.eph-info-count{text-align:right;font-size:11px;color:#a48db5;margin-top:-5px}.eph-info-form footer{display:grid;gap:12px;margin-top:22px}.eph-info-form [data-status]{min-height:20px;font-size:12px;line-height:1.5;color:#d8b9ed;overflow-wrap:anywhere}.eph-info-form [data-save]{width:100%;min-height:48px!important;border:0!important;background:linear-gradient(125deg,#8652d1,#c44b9c)!important;font-weight:700;font-size:14px}.eph-info-form [data-save]:disabled{opacity:.45;cursor:default}.eph-info-form :is(input,textarea,button):focus-visible{outline:2px solid #d2a5ef;outline-offset:3px}@media(max-width:360px){.eph-info-names{grid-template-columns:1fr;gap:0}}
      .eph-rename-form{margin:30px auto 0;padding-top:24px;border-top:1px solid #b790d326;max-width:640px}.eph-rename-form p{font-size:12px;line-height:1.6;color:#af9dbd}.eph-rename-price{display:flex;justify-content:space-between;gap:10px;padding:13px;margin:16px 0;border:1px solid #e4b85d28;border-radius:14px;font-size:12px;color:#ccbda8;background:#e4b85d08}.eph-rename-price b{color:#efcc88;white-space:nowrap}.eph-rename-form [data-nickname]{font-size:16px;min-height:48px}.eph-rename-consent{display:flex!important;align-items:center;gap:10px;margin:16px 0;line-height:1.6}.eph-rename-consent input{width:20px!important;height:20px;flex:0 0 20px;padding:0!important;margin:0!important;accent-color:#b785e8}.eph-rename-form [data-rename]{width:100%;min-height:48px;font-size:13px;color:#e5c9fa;border:1px solid #b58cdf55;background:#a06bce19}.eph-rename-form [data-rename]:disabled{opacity:.4}.eph-rename-form [data-rename-status]{min-height:20px;margin:10px 0;font-size:12px;line-height:1.5;color:#d8b9ed;overflow-wrap:anywhere}

      .eph-my-posts{max-width:640px;margin:auto;min-width:0}.eph-posts-heading{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;margin-bottom:22px}.eph-posts-kicker{font-size:10px;color:#c49ae5;letter-spacing:1.7px;font-weight:700}.eph-posts-heading h3{margin:7px 0!important;font-size:23px!important}.eph-posts-heading p{margin:0;max-width:340px;color:#a99bb7;font-size:12px;line-height:1.6}.eph-posts-heading [data-create]{min-height:46px;border:0;background:linear-gradient(125deg,#8652d1,#c44b9c);font-weight:700;white-space:nowrap}.eph-posts-list{display:grid;gap:16px;min-width:0}.eph-posts-list .ec-social-post{position:relative;min-width:0;padding:16px;border:1px solid #ffffff17;border-radius:20px;background:#110e18}.eph-posts-list .ec-social-avatar{flex:0 0 40px;width:40px;height:40px;padding:0;min-height:40px;border:0}.eph-posts-list .ec-social-author{flex-wrap:wrap}.eph-posts-list .ec-social-author>span:not(.ec-social-menu){flex:1;min-width:0}.eph-posts-list [data-author-name]{min-height:0;padding:0;border:0;background:none;overflow-wrap:anywhere}.eph-posts-list .ec-social-author b{font-size:13px}.eph-posts-list .ec-social-date{font-size:10px;line-height:1.5}.eph-posts-list .ec-social-menu{margin-left:auto}.eph-posts-list .ec-social-menu [data-options-toggle]{width:40px;height:40px;padding:0;font-size:23px}.eph-posts-list .ec-social-menu:has([data-post-options]:not([hidden])){width:100%;display:flex;flex-wrap:wrap;gap:8px}.eph-posts-list [data-post-options]:not([hidden]){position:static!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;padding:12px 0 0;background:none!important;border:0!important}.eph-posts-list [data-post-options] button{position:static!important;display:flex;justify-content:center;align-items:center;gap:6px;width:100%!important;min-height:44px;font-size:11px;padding:9px!important}.eph-posts-list [data-post-options] svg{width:18px;height:18px;flex:none}.eph-posts-list [data-delete]{color:#f29da8;border-color:#b5526333}.eph-posts-list .ec-social-caption{font-size:14px;line-height:1.6}.eph-posts-list .ec-social-photo,.eph-posts-list .ec-social-video{width:100%;max-height:420px;object-fit:contain;border-radius:14px}.eph-posts-list .ec-post-engagement{flex-wrap:wrap;gap:14px}.eph-posts-list .ec-post-engagement button{padding:7px 0;min-height:40px;background:none;border:0}.eph-posts-list .ec-social-empty{padding:34px 18px;border:1px dashed #b28ed640;border-radius:20px;background:#9c69d308}.eph-posts-list button:focus-visible{outline:2px solid #c498ef;outline-offset:3px}.eph-posts-error{display:grid;gap:12px;text-align:center;padding:24px;color:#bdaccb}

.eph-overlay .eph-my-posts .ec-social-post{padding:16px!important;border:1px solid #ffffff17!important;border-radius:20px!important;background:#110e18!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-author{padding-bottom:0!important;display:flex!important;flex-wrap:wrap!important;gap:10px!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu{max-width:100%;min-width:0;flex-shrink:0;flex-wrap:wrap;gap:8px}
.eph-overlay .eph-my-posts .ec-social-post.ec-post-options-open .ec-social-menu{width:100%!important;flex-basis:100%!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options]:not([hidden]){position:static!important;inset:auto!important;width:100%!important;box-sizing:border-box;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;padding:8px 0!important;border:0!important;background:transparent!important;box-shadow:none!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options] button{position:static!important;width:100%!important;height:auto!important;min-height:46px!important;min-width:0!important;box-sizing:border-box;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:10px!important;font-size:12px!important;line-height:1.4!important;border-radius:12px!important;background:#21172b!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options] button span{min-width:0;flex:1;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-options-toggle]{width:40px!important;height:40px!important;min-height:40px!important;padding:0!important;flex:none!important}
.eph-overlay .eph-my-posts .ec-social-avatar{flex:0 0 40px!important;width:40px!important;height:40px!important;min-height:40px!important;overflow:hidden!important}
@media(max-width:360px){.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options]:not([hidden]){grid-template-columns:1fr!important}}


.eph-call-history{max-width:640px;margin:auto;min-width:0}.eph-call-history header>span{font-size:10px;letter-spacing:1.7px;color:#c19bdc;font-weight:700}.eph-call-history h3{font-size:24px!important;margin:7px 0!important}.eph-call-history header p{font-size:12px;color:#a795b6;line-height:1.7;margin:0 0 20px}.eph-overlay .eph-call-history [data-clear]{min-height:44px;width:100%;font-size:12px;color:#e8b2c4;border-color:#af5b7338;background:#bd667e0d}.eph-call-history [data-clear-confirm]{padding:16px;border:1px solid #a784ca35;border-radius:16px;margin-top:12px;background:#1c1326}.eph-call-history [data-clear-confirm][hidden]{display:none!important}.eph-call-history [data-clear-confirm] p{color:#c2accf;font-size:12px;line-height:1.7;margin:0 0 12px}.eph-call-history [data-clear-confirm]>div{display:grid;grid-template-columns:1fr 1fr;gap:8px}.eph-call-history [data-call-status]{font-size:12px;color:#dbbde9;line-height:1.6;margin:12px 0;overflow-wrap:anywhere}.eph-call-history [data-calls]{display:grid;gap:12px}.eph-call-card{display:grid;grid-template-columns:42px minmax(0,1fr);gap:13px;padding:16px;border:1px solid #ffffff16;border-radius:18px;background:#14101c;align-items:center}.eph-call-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:#a66cc91a;color:#c8a2e0;font-size:20px}.eph-overlay .eph-call-card .eph-call-name{min-width:0;min-height:0;padding:0;background:none;border:0;text-align:left;font-size:14px;line-height:1.5;font-weight:700;overflow-wrap:anywhere}.eph-call-card p{color:#b9a2c9;font-size:11px;line-height:1.6;margin:6px 0}.eph-call-card small{color:#91819e;font-size:10px;line-height:1.6}.eph-calls-empty{text-align:center;padding:32px 16px;border:1px dashed #aa85c937;border-radius:18px;color:#a994ba;font-size:13px}.eph-call-history button:disabled{opacity:.45}.eph-call-history button:focus-visible{outline:2px solid #ce9eed;outline-offset:3px}

</style><div class="eph-nav"><span class="eph-section-label">Profil bölümleri</span><div id="ephTabs" class="eph-tabs" role="tablist" aria-label="Profil bölümleri"></div></div><div class="eph-body" role="tabpanel" aria-live="polite" hidden></div>`;
    view.append(hub);
    const overlay=document.createElement('div');overlay.className='eph-overlay';overlay.hidden=true;
    overlay.innerHTML='<section class="eph-dialog" role="dialog" aria-modal="true" aria-labelledby="ephDialogTitle"><header class="eph-dialog-head"><div><small>ERISCHAT • PROFİL</small><h2 id="ephDialogTitle">Profil</h2></div><button type="button" class="eph-close" aria-label="Kapat">×</button></header><div class="eph-dialog-content"></div></section>';
    document.body.append(overlay);
    overlay.querySelector('.eph-dialog-content').append(hub.querySelector('.eph-body'));
    const settings=view.querySelector('[data-erischat-profile-controls]');if(settings)overlay.querySelector('.eph-dialog-content').append(settings);
    let lastTrigger=null;const close=()=>{if(overlay.hidden)return;overlay.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview');if(lastTrigger?.isConnected)lastTrigger.focus()};
    overlay.querySelector('.eph-close').onclick=close;
    overlay.onclick=e=>{if(e.target===overlay)close()};
    overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Tab'){const focusables=Array.from(overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]'));const first=focusables[0],last=focusables[focusables.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
    const tabs = [['info','Bilgilerim'],['posts','Gönderilerim'],['fan-ranking','Hayran sıralamam'],['collection','Koleksiyon'],['tasks','Görevler'],['vip','VIP'],['topup','Lidya Yükleme'],['calls','Arama geçmişleri'],['notifications','Bildirimler'],['privacy','Gizlilik'],['blocked','Engellenenler'],['rooms','Odalarım'],['suggestion','Gelişim Fikri'],['settings','Ayarlar']];
    const strip = hub.querySelector('.eph-tabs');
    const icons={info:'profile',posts:'posts',social:'family','fan-ranking':'family',tasks:'posts',collection:'collection',vip:'vip',calls:'bell',gifts:'gifts',notifications:'bell',privacy:'privacy',blocked:'blocked',rooms:'discover',suggestion:'posts',settings:'security'};
    for (const [key,label] of tabs) {
      const button = document.createElement('button');button.type='button';button.role='tab';button.dataset.tab=key;button.innerHTML=(key==='topup'?'<img class="eph-icon" src="./lidya-coin.png" alt="">':'<svg class="eph-icon" aria-hidden="true"><use href="#home-'+icons[key]+'"></use></svg>')+'<span>'+escape(label)+'</span>';
      button.onclick=()=>{if(key==='vip'){window.ErisChatVIP?.open?.();return}if(key==='topup'){window.ErisPurchases?.open?.();return}if(key==='suggestion'){window.ErisSuggestions?.open?.();return}if(key==='fan-ranking'){window.ErisPlatform.getMe().then(me=>window.ErisPersonalFanRanking?.(me.id)).catch(e=>window.toast?.(e.message));return}lastTrigger=button;show(key)};strip.append(button);
    }
    show('overview');
  }
  let requestIndex=0;
  async function show(key) {
    const hub=panel();if(!hub)return;
    const index=++requestIndex, overlay=document.querySelector('.eph-overlay'),body=overlay.querySelector('.eph-body');
    body.classList.remove('epv','en-center','epl','eps');
    const labels={info:'Bilgilerim',posts:'Gönderilerim',social:'Takip ve hayranlar',tasks:'Görevler',collection:'Koleksiyon',vip:'VIP',calls:'Arama geçmişleri',gifts:'Hediyeler',notifications:'Bildirimler',privacy:'Gizlilik',blocked:'Engellenenler',rooms:'Odalarım',settings:'Ayarlar'};
    hub.closest('#profile')?.setAttribute('data-profile-section',key);
    hub.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===key)));
    body.hidden=key==='overview';
    const settings=overlay.querySelector('[data-erischat-profile-controls]');if(settings)settings.hidden=true;
    const rooms=overlay.querySelector('#erisProfileRooms');if(rooms)rooms.hidden=key!=='rooms';
    if(key==='overview')return;
    overlay.hidden=false;document.body.classList.add('eph-dialog-open');overlay.querySelector('#ephDialogTitle').textContent=labels[key];overlay.querySelector('.eph-close').focus();
    if(key==='settings'){await window.ErisSettings.render(body,()=>index===requestIndex);return;}
    if(key==='rooms'){await window.ErisProfileLists.rooms(body,()=>index===requestIndex);return}
    body.textContent='Yükleniyor…';
    try {
      const me=await window.ErisAuth.getMe();if(index!==requestIndex)return;
      if(key==='calls') {
        body.innerHTML='<section class="eph-call-history"><header><span>GÖRÜŞMELERİN</span><h3>Arama geçmişleri</h3><p>Sesli ve görüntülü görüşmelerini buradan takip et.</p></header><button type="button" data-clear disabled>Geçmişi temizle</button><div data-clear-confirm hidden><p>Arama geçmişini kendi listenden temizlemek istiyor musun? Bu işlem sistem kayıtlarını silmez; yetkili sorgularında kayıtlar korunur.</p><div><button type="button" data-cancel>Vazgeç</button><button type="button" data-confirm>Geçmişimi temizle</button></div></div><div data-call-status role="status" aria-live="polite"></div><div data-calls></div></section>';
        const list=body.querySelector('[data-calls]'),clear=body.querySelector('[data-clear]'),confirm=body.querySelector('[data-clear-confirm]'),status=body.querySelector('[data-call-status]');let pending=false;
        const empty=()=>{list.innerHTML='<div class="eph-calls-empty">Henüz arama geçmişin yok.</div>';clear.disabled=true};
        clear.onclick=()=>{confirm.hidden=false;body.querySelector('[data-confirm]').focus()};body.querySelector('[data-cancel]').onclick=()=>{if(pending)return;confirm.hidden=true;clear.focus()};
        body.querySelector('[data-confirm]').onclick=async()=>{if(pending)return;pending=true;const button=body.querySelector('[data-confirm]');button.disabled=true;status.textContent='Geçmiş temizleniyor…';try{await api('/calls/history',{method:'DELETE'});if(index!==requestIndex)return;empty();confirm.hidden=true;status.textContent='Arama geçmişin kendi listenden temizlendi.'}catch(e){if(index===requestIndex)status.textContent=e.message||'Geçmiş temizlenemedi.'}finally{pending=false;button.disabled=false}};
        async function loadCalls(){list.textContent='Aramalar yükleniyor…';try{const calls=await api('/calls/history');if(index!==requestIndex)return;list.replaceChildren();clear.disabled=!calls.length;if(!calls.length){empty();return}
          for(const row of calls){const card=document.createElement('article');card.className='eph-call-card';const icon=document.createElement('span');icon.className='eph-call-icon';icon.textContent=row.kind==='video'?'▣':'☎';const info=document.createElement('div');const name=document.createElement('button');name.type='button';name.className='eph-call-name';name.textContent=row.peer_name||'Kullanıcı';name.disabled=!row.peer_id;name.onclick=()=>{window.ErisProfileHub.close();window.openUserProfile?.(row.peer_id)};const meta=document.createElement('p');const duration=Math.max(0,Number(row.duration_seconds)||0);const labels={active:'Sürüyor',ringing:'Çalıyor',reject:'Reddedildi',unavailable:'Müsait değil',missed:'Yanıtsız',ended:'Tamamlandı'};meta.textContent=(row.incoming?'Gelen':'Giden')+' · '+(row.kind==='video'?'Görüntülü':'Sesli')+' · '+(labels[row.status]||row.status);const date=document.createElement('small');date.textContent=new Date(row.created_at).toLocaleString('tr-TR')+' · '+Math.floor(duration/60)+' dk '+duration%60+' sn';info.append(name,meta,date);card.append(icon,info);list.append(card)}
        }catch(e){if(index!==requestIndex)return;list.replaceChildren();const text=document.createElement('p');text.textContent=e.message||'Aramalar yüklenemedi.';const retry=document.createElement('button');retry.type='button';retry.textContent='Tekrar dene';retry.onclick=loadCalls;list.append(text,retry)}}await loadCalls();return;
      }
      if(key==='info') {
        body.innerHTML='<form class="eph-info-form"><div class="eph-info-summary"><span class="eph-info-avatar" data-avatar></span><div><b data-name></b><span data-id></span></div></div><p class="eph-info-intro" role="note">Uygulamadaki yetkili kişilerin profillerinde SA, UA, FA veya DA logosu bulunur. Bu logoları taşımayan kişiler uygulamada yetkili değildir.</p><p class="eph-info-intro">Profilindeki adını ve hakkında bilgilerini düzenle.</p><div class="eph-info-names"><label>Ad<input data-first maxlength="64" autocomplete="given-name" required></label><label>Soyad<input data-last maxlength="64" autocomplete="family-name" required></label></div><label>Hakkımda<textarea data-bio maxlength="300" rows="4" placeholder="Kendinden biraz bahset…"></textarea></label><div class="eph-info-count" data-count></div><footer><div data-status role="status" aria-live="polite"></div><button type="submit" data-save>Değişiklikleri kaydet</button></footer></form>';
        const form=body.querySelector('form'),first=form.querySelector('[data-first]'),last=form.querySelector('[data-last]'),bio=form.querySelector('[data-bio]'),btn=form.querySelector('[data-save]'),status=form.querySelector('[data-status]');
        const publicId=/^\d{10}$/.test(String(me.public_id||''))?String(me.public_id):'';
        form.querySelector('[data-id]').textContent='Kullanıcı ID · '+(publicId||'yüklenemedi');
        form.querySelector('[data-name]').textContent=me.nickname||'Profilim';
        const avatar=form.querySelector('[data-avatar]');avatar.textContent=String(me.nickname||'P').slice(0,1).toUpperCase();
        const url=window.ErisChatCosmetics?.assetUrl?.(me.avatar_asset)||me.avatar_url;
        if(url){const image=document.createElement('img');image.src=url;image.alt='Profil fotoğrafı';image.onerror=()=>image.remove();avatar.append(image)}
        first.value=me.first_name||'';last.value=me.last_name||'';bio.value=me.bio||'';
        let saving=false;const values=()=>[first.value.trim(),last.value.trim(),bio.value.trim()];let original=JSON.stringify(values());
        const refresh=()=>{form.querySelector('[data-count]').textContent=bio.value.length+' / 300';btn.disabled=saving||JSON.stringify(values())===original||!first.value.trim()||!last.value.trim()};
        form.addEventListener('input',()=>{status.textContent='';refresh()});refresh();
        form.onsubmit=async event=>{
          event.preventDefault();if(saving||btn.disabled||!form.reportValidity())return;
          saving=true;const submitted=values();refresh();status.textContent='Kaydediliyor…';
          try{
            const updated=await window.ErisProfile.update({first_name:submitted[0],last_name:submitted[1],bio:submitted[2]});
            if(index!==requestIndex)return;
            if(!updated)throw new Error('Profil kaydedilemedi. Tekrar dene.');
            original=JSON.stringify(submitted);status.textContent='Değişikliklerin kaydedildi.';
          }catch(error){if(index===requestIndex)status.textContent=error.message||'Profil kaydedilemedi.'}
          finally{saving=false;if(index===requestIndex)refresh()}
        };
        const rename=document.createElement('form');rename.className='eph-rename-form';
        rename.innerHTML='<h3>Kullanıcı adını değiştir</h3><p>Yeni kullanıcı adın profilinde ve sohbetlerde görünür. Eris, Chat ve ErisChat içeren adlar kullanılamaz.</p><div class="eph-rename-price">Değişiklik ücreti <b>150 Lidya</b></div><label>Yeni kullanıcı adı<input data-nickname maxlength="32" autocomplete="nickname" required></label><label class="eph-rename-consent"><input type="checkbox" data-consent required><span>Değişiklik için 150 Lidya ödemeyi onaylıyorum.</span></label><button type="submit" data-rename>Kullanıcı adını değiştir · 150 Lidya</button><div data-rename-status role="status" aria-live="polite"></div>';
        body.append(rename);const nickname=rename.querySelector('[data-nickname]'),renameButton=rename.querySelector('[data-rename]'),renameStatus=rename.querySelector('[data-rename-status]');
        let currentName=me.nickname||'',renaming=false;nickname.value=currentName;
        const refreshRename=()=>{renameButton.disabled=renaming||!nickname.value.trim()||nickname.value.trim()===currentName||!rename.querySelector('[data-consent]').checked};
        rename.addEventListener('input',()=>{renameStatus.textContent='';refreshRename()});refreshRename();
        rename.onsubmit=async event=>{
          event.preventDefault();if(renaming||renameButton.disabled||!rename.reportValidity())return;
          renaming=true;refreshRename();renameStatus.textContent='Kullanıcı adın değiştiriliyor…';
          try{
            const updated=await api('/me/nickname',{method:'POST',body:JSON.stringify({nickname:nickname.value.trim()})});
            window.dispatchEvent(new CustomEvent('erischat:profile',{detail:updated}));
            window.ErisProfile?.refresh?.();
            if(index!==requestIndex)return;
            currentName=updated.nickname;nickname.value=currentName;form.querySelector('[data-name]').textContent=currentName;
            rename.querySelector('[data-consent]').checked=false;renameStatus.textContent='Kullanıcı adın değiştirildi. Ücret: 150 Lidya.';
          }catch(error){if(index===requestIndex)renameStatus.textContent=error.message||'Kullanıcı adı değiştirilemedi.'}
          finally{renaming=false;if(index===requestIndex)refreshRename()}
        };return;
      }
      if(key==='posts') {
        body.innerHTML='<section class="eph-my-posts"><header class="eph-posts-heading"><div><span class="eph-posts-kicker">PAYLAŞIMLARIN</span><h3>Anıların burada</h3><p>Gönderilerini düzenle, sabitle veya görünürlüğünü yönet.</p></div><button type="button" data-create>＋ Yeni gönderi</button></header><div data-posts-list class="eph-posts-list"></div></section>';
        body.querySelector('[data-create]').onclick=()=>{window.ErisProfileHub.close();window.ErisSocialFeed?.compose?.()};
        const list=body.querySelector('[data-posts-list]');
        if(window.ErisSocialFeed?.loadMine)await window.ErisSocialFeed.loadMine(list);else list.textContent='Gönderi sistemi yüklenemedi. Uygulamayı yeniden aç.';
        return;
      }
      if(key==='social') {
        const [followers,following,fans]=await Promise.all([api('/users/'+encodeURIComponent(me.id)+'/followers'),api('/users/'+encodeURIComponent(me.id)+'/following'),api('/users/'+encodeURIComponent(me.id)+'/fans')]);if(index!==requestIndex)return;
        body.innerHTML='<h3>Takip ve hayranlar</h3><div class="eph-row"><span>Takipçi</span><b data-followers></b></div><div class="eph-row"><span>Takip edilen</span><b data-following></b></div><div class="eph-row"><span>Hayran seviyesi</span><b data-level></b></div><div class="eph-muted" data-list></div>';
        body.querySelector('[data-followers]').textContent=String(followers.length);body.querySelector('[data-following]').textContent=String(following.length);body.querySelector('[data-level]').textContent=String(fans.level||0);
        const list=body.querySelector('[data-list]');list.textContent='Takip ettiklerin: ';
        if(!following.length) list.append('Henüz kimseyi takip etmiyorsun.');
        for(const row of following){const button=document.createElement('button');button.type='button';button.textContent=row.user_id;button.onclick=()=>{window.ErisProfileHub.close();window.openUserProfile?.(row.user_id)};list.append(button)}return;
      }
      if(key==='tasks'){await window.ErisAppearanceTasks.render(body,()=>index===requestIndex);return;}
      if(key==='collection') {await window.ErisAppearanceInventory.render(body,()=>index===requestIndex);return;}
      if(key==='vip') {
        window.ErisProfileHub.close();
        window.ErisChatVIP?.open?.();
        return;
      }
      if(key==='notifications') {
        await window.ErisNotifications.render(body,()=>index===requestIndex);return;
      }
      if(key==='privacy') {
        await window.ErisPrivacy.render(body,()=>index===requestIndex);return;
      }
      if(key==='blocked') {
        await window.ErisProfileLists.blocked(body,()=>index===requestIndex);return;
      }
    }catch(error){if(index===requestIndex)body.textContent=error.message||'Profil bilgileri yüklenemedi.'}
  }
  window.ErisProfileHub={show,close:()=>{const dialog=document.querySelector('.eph-overlay');if(dialog)dialog.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview')},reset:()=>{const dialog=document.querySelector('.eph-overlay');if(dialog)dialog.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview')}};
  const start=()=>{mount();window.addEventListener('erischat:auth',event=>{if(event.detail?.state==='ready' && panel()?.closest('#profile')?.dataset.profileSection==='info')show('info')})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
