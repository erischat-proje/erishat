(function(){
'use strict';


// LIDYACHAT_MANAGEMENT_IDENTITY_V2
const managementAvatarUrl=new URL('./assets/lidyachat-management-avatar-v2.png',document.currentScript.src).href;
const artBase=new URL('./assets/lidya-room-png/',document.currentScript.src).href;
const adminArtBase=new URL('./assets/admin-lidya-v2/',document.currentScript.src).href;
// Capture during script execution; currentScript is null in callbacks.
const adminV3ArtBase=new URL('./assets/admin-lidya-v4/',document.currentScript.src).href;
// ERISCHAT_ORIGINAL_LIDYA_ART_MAPPING_V1
// Use existing, verified light/dark Lidya card art. The live button title
// stays as HTML text, so the image cannot cause doubled lettering.
function adminArtworkKey(key){
 const original={lookup:'roles',deleteaccount:'faactions',chatban:'roomban',chatbanlogs:'banlogs',lidya:'referrals',security:'daactions','lm-command':'daactions','lm-cases':'banrequests','lm-emergency':'ban','lm-finance':'referrals'};
 return original[key]||key;
}
const menuArtBase=new URL('./assets/lidya-menu/',document.currentScript.src).href;
const apiBase=(window.ERISCHAT_API_BASE||window.ERIS_API||localStorage.getItem('erischat.apiBase')||'https://erischat-api-production.up.railway.app/v1').replace(/\/$/,'').replace(/\/v1$/,'');
const token=()=>localStorage.getItem('erischat.accessToken.v1')||localStorage.getItem('erischat_access_token')||'';
const req=async(path,opt={})=>{const r=await fetch(apiBase+path,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{}),Authorization:'Bearer '+token()}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.detail||'İşlem başarısız');return b};
function addStyles(){if(document.getElementById('erisAdminCss'))return;const s=document.createElement('style');s.id='erisAdminCss';s.textContent=`
/* Lidya management: shared approved PNG artwork and live theme tokens. */
.eris-admin-overlay,.ea-float{--ea-page:#faf7f0;--ea-panel:#fffaf0;--ea-raised:#f8eedb;--ea-ink:#49301d;--ea-muted:#735c43;--ea-line:#c9a56c;--ea-gold:#866029;--ea-shadow:#70502218;--ea-danger:#963d32;--ea-ok:#286447;--ea-focus:#8a6429;--ea-art-theme:light;color-scheme:light}
html[data-eris-theme="dark"] .eris-admin-overlay,html[data-eris-theme="dark"] .ea-float{--ea-page:#061a16;--ea-panel:#0b2822;--ea-raised:#12382e;--ea-ink:#fff2d7;--ea-muted:#d1c2a4;--ea-line:#b49352;--ea-gold:#e0bd77;--ea-shadow:#0005;--ea-danger:#ffc4b5;--ea-ok:#b4e2c2;--ea-focus:#f2d191;--ea-art-theme:dark;color-scheme:dark}
.eris-admin-overlay,.ea-float{--ui-panel:var(--ea-panel);--ui-raised:var(--ea-raised);--ui-ink:var(--ea-ink);--ui-muted:var(--ea-muted);--ui-line:var(--ea-line);--ui-gold:var(--ea-gold);--ui-button:var(--ea-gold);--ui-shadow:var(--ea-shadow);--ui-ok-bg:color-mix(in srgb,var(--ea-ok) 15%,var(--ea-panel));--ui-danger-bg:color-mix(in srgb,var(--ea-danger) 15%,var(--ea-panel))}
.eris-admin-overlay{position:fixed;inset:0;z-index:10000;display:block;padding:0!important;background:var(--ea-page);color:var(--ea-ink);overscroll-behavior:contain}
.eris-admin-overlay *,.ea-float *{box-sizing:border-box}
.eris-admin-panel{width:100%!important;height:100dvh!important;max-height:100dvh!important;overflow:auto;overscroll-behavior:contain;margin:0;padding:0!important;border:0;border-radius:0!important;background:radial-gradient(ellipse at 100% 0,color-mix(in srgb,var(--ea-gold) 9%,transparent),transparent 50%),var(--ea-page);color:var(--ea-ink);font-family:inherit;box-shadow:none}
.ea-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0;padding:calc(18px + env(safe-area-inset-top)) max(18px,calc((100vw - 1000px)/2)) 18px;border-bottom:1px solid var(--ea-line);background:var(--ea-page);box-shadow:0 4px 18px var(--ea-shadow)}
.ea-heading{min-width:0}.ea-kicker{font-size:10px;font-weight:800;letter-spacing:2px;color:var(--ea-gold)}.ea-title{font-family:Georgia,'Times New Roman',serif;margin:5px 0;font-size:clamp(25px,4vw,35px);line-height:1.15;color:var(--ea-ink)}.ea-sub{font-size:12px;line-height:1.6;color:var(--ea-muted)}
.ea-brand{width:126px;height:40px;background:var(--ea-logo) center/contain no-repeat;margin-bottom:12px}
#eaBody{width:min(100%,1040px);margin:auto;padding:22px 20px calc(32px + env(safe-area-inset-bottom));min-width:0}
.ea-profile{display:flex;align-items:center;gap:13px;margin:0 0 25px;padding:16px;border:1px solid var(--ea-line);border-radius:7px 20px;background:linear-gradient(130deg,var(--ea-panel),var(--ea-raised));box-shadow:inset 0 0 0 3px var(--ea-page),0 5px 18px var(--ea-shadow)}.ea-profile>div:nth-child(2){min-width:0;overflow-wrap:anywhere}.ea-profile b{font-size:14px}.ea-profile small{display:block;margin-top:5px;color:var(--ea-muted);font-size:11px}.ea-shield{flex:none;width:54px;height:54px;background:url("${managementAvatarUrl}") center/contain no-repeat;border-radius:50%;font-size:0}
.ea-role,.eris-admin-menu .ea-role{flex:none;margin-left:auto;padding:9px 12px;border:1px solid var(--ea-line);border-radius:6px 12px;background:var(--ea-raised);color:var(--ea-gold);font-size:12px;font-weight:900;letter-spacing:1px}
.ea-section{display:flex;align-items:center;gap:12px;margin:26px 0 13px;color:var(--ea-gold);font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}.ea-section::after{content:'';height:1px;flex:1;background:var(--ea-line);opacity:.6}
.eris-admin-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;min-width:0}
.eris-admin-panel button,.ea-float button{font:inherit;cursor:pointer;touch-action:manipulation;min-width:0;min-height:44px;padding:12px 16px;border:1px solid var(--ea-line);border-radius:7px 15px;background:linear-gradient(145deg,var(--ea-panel),var(--ea-raised));color:var(--ea-ink);font-size:12px;font-weight:700;line-height:1.4;box-shadow:inset 0 0 0 2px var(--ea-panel),0 3px 10px var(--ea-shadow);transition:transform .15s,box-shadow .15s}
.eris-admin-grid>button[data-a]{position:relative;display:flex;align-items:center;gap:12px;min-height:108px;padding:15px 14px;text-align:left;border-radius:7px 20px;overflow:hidden}
.eris-admin-grid>button[data-a]::after{content:'›';font-size:22px;color:var(--ea-gold);margin-left:auto}
.ea-tool-icon{display:block;flex:0 0 48px;width:48px;height:48px;background-position:center;background-size:contain;background-repeat:no-repeat;pointer-events:none}
.ea-tool-copy{display:block;min-width:0;flex:1}.ea-tool-copy b{display:block;color:var(--ea-ink);font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.35;overflow-wrap:anywhere}.ea-tool-copy small{display:block;font-size:10px;line-height:1.4;font-weight:400;color:var(--ea-muted);margin-top:5px}
.eris-admin-panel button:hover:not(:disabled),.ea-float button:hover:not(:disabled){box-shadow:inset 0 0 0 2px var(--ea-line),0 5px 14px var(--ea-shadow)}.eris-admin-panel button:active:not(:disabled){transform:translateY(1px)}
.eris-admin-panel button:focus-visible,.eris-admin-panel input:focus-visible,.eris-admin-panel textarea:focus-visible,.eris-admin-panel select:focus-visible,.ea-float button:focus-visible{outline:3px solid var(--ea-focus);outline-offset:3px}
.eris-admin-panel button:disabled,.ea-float button:disabled{opacity:.5;cursor:wait;box-shadow:none}
.eris-admin-panel .ea-close{flex:none;align-self:flex-start;width:44px;height:44px;min-height:44px;padding:0;border-radius:50%;font-size:25px}
.eris-admin-card{padding:16px;margin:12px 0;border:1px solid var(--ea-line);border-radius:7px 18px;background:var(--ea-panel);color:var(--ea-ink);font-size:12px;line-height:1.65;overflow-wrap:anywhere;min-width:0}
.eris-admin-panel h3{font-family:Georgia,serif;font-size:23px;line-height:1.3;color:var(--ea-ink)}.eris-admin-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.6;max-width:100%;overflow:auto;color:var(--ea-ink)}
.eris-admin-panel input:not([type=checkbox]):not([type=radio]),.eris-admin-panel textarea,.eris-admin-panel select{max-width:100%;width:100%;min-height:46px;padding:12px!important;border:1px solid var(--ea-line)!important;border-radius:9px!important;background:var(--ea-panel)!important;color:var(--ea-ink)!important;font:inherit;font-size:16px!important;line-height:1.5}
.eris-admin-panel textarea{resize:vertical;min-height:120px}.eris-admin-panel input[type=file]{font-size:12px!important}.eris-admin-panel option{background:var(--ea-panel);color:var(--ea-ink)}.eris-admin-panel ::placeholder{color:var(--ea-muted);opacity:1}.eris-admin-panel label{display:grid;gap:7px;color:var(--ea-ink);font-size:12px}.ea-action{margin-top:8px}.ea-back{margin-top:22px!important;color:var(--ea-gold)!important}
.ea-ban-person{display:flex;align-items:center;gap:12px}.ea-ban-portrait{position:relative;width:58px;height:58px;flex:none}.ea-ban-portrait img{width:52px;height:52px;border-radius:50%;object-fit:cover}.ea-ban-portrait img.frame{position:absolute;inset:0;width:58px;height:58px;object-fit:contain}.ea-ban-actions{display:flex;gap:9px;margin-top:14px}.ea-ban-actions button{flex:1}.ea-ban-actions .approve{color:var(--ea-ok);background:var(--ui-ok-bg)}.ea-ban-actions .reject{color:var(--ea-danger);background:var(--ui-danger-bg)}.ea-ban-proof{width:70px;height:70px;object-fit:cover;border-radius:9px;margin:5px;cursor:zoom-in}
.ea-float{position:fixed;right:14px;bottom:max(22px,env(safe-area-inset-bottom));z-index:22000;width:min(360px,calc(100vw - 28px));padding:20px 48px 20px 18px;border:1px solid var(--ea-line);border-radius:7px 20px;background:var(--ea-panel);color:var(--ea-ink);box-shadow:0 12px 45px var(--ea-shadow)}.ea-float button[data-close]{position:absolute;top:8px;right:8px;padding:0;width:36px;min-height:36px}
.eris-admin-menu{grid-column:1/-1;min-width:0}.eris-admin-menu .ea-role{color:var(--lm-ink,#49301d);background:var(--lm-surface,#fffaf0);border-color:var(--lm-line,#c9a56c)}
@media(max-width:760px){.eris-admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ea-tool-icon{width:42px;height:42px;flex-basis:42px}.eris-admin-grid>button[data-a]{gap:9px;padding:13px 11px}.ea-tool-copy b{font-size:14px}}
@media(max-width:420px){#eaBody{padding-inline:14px}.ea-head{padding-inline:16px;gap:10px}.eris-admin-grid{gap:10px}.eris-admin-grid>button[data-a]{flex-direction:column;align-items:flex-start;min-height:155px;padding:15px 12px}.eris-admin-grid>button[data-a]::after{position:absolute;right:12px;top:19px}.ea-tool-copy small{font-size:10px}.ea-profile{padding:13px;gap:10px}.ea-profile b{font-size:12px}.ea-brand{height:32px;width:108px}.ea-sub{font-size:11px}}
@media(prefers-reduced-motion:reduce){.eris-admin-panel *{transition:none!important;scroll-behavior:auto!important}}

.eris-admin-overlay,.ea-float{--ea-shield:url("${artBase}light/shield.png");--ea-users:url("${artBase}light/users.png");--ea-ban:url("${artBase}light/ban.png");--ea-crown:url("${artBase}light/crown.png");--ea-more:url("${artBase}light/more.png");--ea-gift:url("${artBase}light/gift.png");--ea-lock:url("${artBase}light/lock.png");--ea-settings:url("${artBase}light/settings.png");--ea-audio:url("${artBase}light/audio.png");--ea-logo:url("${menuArtBase}light-logo.png")}
html[data-eris-theme="dark"] .eris-admin-overlay,html[data-eris-theme="dark"] .ea-float{--ea-shield:url("${artBase}dark/shield.png");--ea-users:url("${artBase}dark/users.png");--ea-ban:url("${artBase}dark/ban.png");--ea-crown:url("${artBase}dark/crown.png");--ea-more:url("${artBase}dark/more.png");--ea-gift:url("${artBase}dark/gift.png");--ea-lock:url("${artBase}dark/lock.png");--ea-settings:url("${artBase}dark/settings.png");--ea-audio:url("${artBase}dark/audio.png");--ea-logo:url("${menuArtBase}dark-logo.png")}

/* Each main management action has independent light/dark generated PNG art. */
html body .eris-admin-overlay{z-index:50000!important;background:var(--ea-page)!important;backdrop-filter:none!important}
html body .eris-admin-overlay .eris-admin-panel{isolation:isolate!important;background:var(--ea-page)!important;color:var(--ea-ink)!important;width:100%!important;height:100dvh!important;max-height:100dvh!important;overflow:auto!important;padding:0!important;border-radius:0!important}
html body .eris-admin-overlay .ea-head{background:var(--ea-page)!important;color:var(--ea-ink)!important;z-index:5!important}
html body .eris-admin-overlay .ea-title{font-size:clamp(23px,4vw,32px)!important;color:var(--ea-ink)!important}
html body .eris-admin-overlay .ea-head .ea-sub{background:none!important;color:var(--ea-muted)!important}
html body .eris-admin-overlay #eaBody .eris-admin-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
html body .eris-admin-overlay #eaBody .eris-admin-grid>button[data-a].ea-png-button{position:relative!important;isolation:isolate!important;display:block!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;max-width:100%!important;aspect-ratio:3/1!important;height:auto!important;min-height:0!important;padding:0!important;gap:0!important;overflow:hidden!important;background:transparent!important;background-image:none!important;border:0!important;border-radius:12px!important;box-shadow:none!important;text-align:left!important;transform:none!important;color:var(--ea-ink)!important;font-size:14px!important;line-height:1.2!important;-webkit-tap-highlight-color:transparent}
html body .eris-admin-overlay #eaBody .ea-png-button::before,html body .eris-admin-overlay #eaBody .ea-png-button::after{display:none!important;content:none!important}
html body .eris-admin-overlay #eaBody .ea-png-art{position:absolute!important;inset:0!important;display:block!important;width:100%!important;height:100%!important;min-width:0!important;max-width:100%!important;object-fit:fill!important;pointer-events:none!important;border:0!important;filter:none!important;opacity:1!important;margin:0!important;padding:0!important;border-radius:inherit!important}
html body .eris-admin-overlay #eaBody .ea-png-art img{display:block!important;width:100%!important;height:100%!important;object-fit:fill!important;opacity:1!important;filter:none!important;margin:0!important;border:0!important;border-radius:inherit!important}
html body .eris-admin-overlay #eaBody .ea-png-copy{position:absolute!important;z-index:1!important;left:6%!important;top:11%!important;bottom:11%!important;width:45%!important;max-width:45%!important;display:flex!important;flex-direction:column!important;justify-content:center!important;gap:5px!important;pointer-events:none!important;background:none!important;padding:0!important;margin:0!important;overflow:visible!important}
html body .eris-admin-overlay #eaBody .ea-png-copy b{display:block!important;color:#422b16!important;background:none!important;font:700 clamp(11px,1.6vw,18px)/1.15 Georgia,'Times New Roman',serif!important;text-shadow:0 1px 1px #fff8!important;letter-spacing:-.25px!important;overflow-wrap:normal!important;word-break:normal!important;margin:0!important;padding:0!important}
html body .eris-admin-overlay #eaBody .ea-png-copy small{display:block!important;color:#614a30!important;background:none!important;font:400 clamp(8px,1vw,11px)/1.2 Arial,sans-serif!important;text-shadow:0 1px #fff8!important;margin:0!important;padding:0!important}
html[data-eris-theme=dark] body .eris-admin-overlay #eaBody .ea-png-copy b{color:#fff2d1!important;text-shadow:0 1px 3px #000!important}
html[data-eris-theme=dark] body .eris-admin-overlay #eaBody .ea-png-copy small{color:#e2d3b4!important;text-shadow:0 1px 3px #000!important}
html body .eris-admin-overlay #eaBody .ea-png-button:hover:not(:disabled){filter:brightness(1.05)!important;box-shadow:0 3px 10px var(--ea-shadow)!important}
html body .eris-admin-overlay #eaBody .ea-png-button:active:not(:disabled){filter:brightness(.94)!important;transform:translateY(1px)!important}
html body .eris-admin-overlay #eaBody .ea-png-button:focus-visible{outline:3px solid var(--ea-focus)!important;outline-offset:3px!important}
html body .eris-admin-overlay #eaBody .ea-png-button:disabled{opacity:.55!important;cursor:wait!important}
html body .eris-admin-overlay .eris-admin-panel .ea-head button.ea-close{background:var(--ea-panel)!important;color:var(--ea-ink)!important;border:1px solid var(--ea-line)!important;box-shadow:inset 0 0 0 2px var(--ea-panel)!important;font-size:26px!important}
html body .eris-admin-overlay #eaBody{padding-bottom:calc(35px + env(safe-area-inset-bottom))!important}
@media(max-width:420px){html body .eris-admin-overlay #eaBody .eris-admin-grid{gap:9px!important}html body .eris-admin-overlay #eaBody{padding-inline:12px!important}html body .eris-admin-overlay #eaBody .ea-png-copy{width:49%!important;max-width:49%!important;gap:3px!important}html body .eris-admin-overlay #eaBody .ea-png-copy b{font-size:11px!important;line-height:1.08!important}html body .eris-admin-overlay #eaBody .ea-png-copy small{display:none!important}}


/* ERISCHAT_LIDYA_CARD_MATCH_V2 */
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="lookup"],
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="deleteaccount"],
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="chatban"],
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="chatbanlogs"],
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="lidya"]{
 aspect-ratio:3/1!important;min-height:0!important;border-radius:12px!important;
 border:0!important;box-shadow:none!important;
}
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="lookup"] .ea-png-copy,
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="deleteaccount"] .ea-png-copy,
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="chatban"] .ea-png-copy,
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="chatbanlogs"] .ea-png-copy,
html body .eris-admin-overlay #eaBody .ea-png-button[data-a="lidya"] .ea-png-copy{
 left:6%!important;top:11%!important;bottom:11%!important;width:49%!important;max-width:49%!important;
}
html body .eris-admin-overlay #eaBody .ea-png-copy b{
 color:#392719!important;text-shadow:0 1px 1px #fff8!important;
 font:700 clamp(11px,1.6vw,18px)/1.15 Georgia,'Times New Roman',serif!important;
}
html body .eris-admin-overlay #eaBody .ea-png-copy small{color:#56402b!important;text-shadow:none!important}
html[data-eris-theme=dark] body .eris-admin-overlay #eaBody .ea-png-copy b{
 color:#fff2d1!important;text-shadow:0 1px 3px #000!important;
}
html[data-eris-theme=dark] body .eris-admin-overlay #eaBody .ea-png-copy small{color:#e2d3b4!important}
@media(max-width:420px){html body .eris-admin-overlay #eaBody .ea-png-copy small{display:none!important}}

/* ERISCHAT_ORIGINAL_LIDYA_CARD_GEOMETRY_V1 */
html body .eris-admin-overlay #eaBody .ea-png-button:is([data-a="lookup"],[data-a="deleteaccount"],[data-a="chatban"],[data-a="chatbanlogs"],[data-a="lidya"]){aspect-ratio:3/1!important;min-height:0!important;border-radius:12px!important;}
html body .eris-admin-overlay #eaBody .ea-png-button:is([data-a="lookup"],[data-a="deleteaccount"],[data-a="chatban"],[data-a="chatbanlogs"],[data-a="lidya"]) .ea-png-copy{left:6%!important;top:11%!important;bottom:11%!important;width:49%!important;max-width:49%!important;}
html body .eris-admin-overlay #eaBody .ea-png-button:is([data-a="lookup"],[data-a="deleteaccount"],[data-a="chatban"],[data-a="chatbanlogs"],[data-a="lidya"]) .ea-png-copy b{font:700 clamp(11px,1.6vw,18px)/1.15 Georgia,serif!important;}

/* ERISCHAT_LIDYA_ACTION_CONTRAST_V2 */
/* ERISCHAT_LIDYA_ACTION_CONTRAST_V2: only non-PNG action controls */
html[data-eris-theme="light"] .eris-admin-overlay {--ea-action-bg:#c9a36a;--ea-action-fg:#24190e;--ea-action-border:#936d39}
html[data-eris-theme="dark"] .eris-admin-overlay {--ea-action-bg:#302b24;--ea-action-fg:#fff1d7;--ea-action-border:#9e8356}
html[data-eris-theme="light"] .ea-float {--ea-action-bg:#c9a36a;--ea-action-fg:#24190e;--ea-action-border:#936d39}
html[data-eris-theme="dark"] .ea-float {--ea-action-bg:#302b24;--ea-action-fg:#fff1d7;--ea-action-border:#9e8356}
html body .eris-admin-overlay .eris-admin-panel #eaBody button:not(.ea-png-button),
html body .eris-admin-overlay .eris-admin-panel #eaBody .ea-back,
html body .ea-float button:not(.ea-png-button):not([data-close]) {
 background:var(--ea-action-bg)!important;
 background-image:none!important;
 color:var(--ea-action-fg)!important;
 border:1px solid var(--ea-action-border)!important;
 text-shadow:none!important;
 box-shadow:0 2px 9px rgba(0,0,0,.12)!important;
 font-weight:700!important;
}
html body .eris-admin-overlay .eris-admin-panel #eaBody button:not(.ea-png-button) :is(span,b,strong,small),
html body .ea-float button:not(.ea-png-button) :is(span,b,strong,small) {color:inherit!important;text-shadow:none!important}
html body .eris-admin-overlay .eris-admin-panel #eaBody button:not(.ea-png-button):disabled {opacity:.72!important;cursor:not-allowed!important}
html body .eris-admin-overlay .eris-admin-panel #eaBody button:not(.ea-png-button):focus-visible,
html body .eris-admin-overlay .eris-admin-panel #eaBody :is(input,select,textarea):focus-visible {outline:3px solid var(--ea-focus)!important;outline-offset:2px!important}
html body .eris-admin-overlay .eris-admin-panel #eaBody :is(input,textarea,select) {background:var(--ea-panel)!important;color:var(--ea-ink)!important}
html body .eris-admin-overlay .eris-admin-panel #eaBody :is(input,textarea)::placeholder {color:var(--ea-muted)!important;opacity:1!important}
/* PNG buttons retain all original imagery, colors and positioning. */

/* LIDYA_MANAGEMENT_V3_ASSET_STYLE */
/* Original v2 geometry; v4 artwork leaves the left side clear for live text. */
html body .eris-admin-overlay #eaBody .ea-png-button[data-a^="lm-"] .ea-png-copy{display:flex!important;width:45%!important;max-width:45%!important}
html body .eris-admin-overlay #eaBody .ea-png-button.ea-art-missing{background:var(--ea-panel)!important;border:1px solid var(--ea-line)!important}
`;document.head.appendChild(s)}
function lmCenterToolsExtra(me){if(me.role!=='DA')return '';return '<div class="ea-section">Denetim ve Analiz</div><div class="eris-admin-grid"><button data-a="lm-fraud">Dolandırıcılık İnceleme</button><button data-a="lm-audit">Yönetici Denetimi</button></div>';}
function lmCenterTools(me){const opts=[['command','Güvenlik Merkezi'],['cases','Olay Dosyaları']];if(['UA','FA','DA'].includes(me.role))opts.push(['emergency','Acil Müdahale']);if(me.role==='DA')opts.push(['finance','Lidya Denetimi']);return '<div class="ea-section">Güvenlik ve Denetim</div><div class="eris-admin-grid">'+opts.map(([key,label])=>'<button data-a="lm-'+key+'">'+label+'</button>').join('')+'</div>'+lmCenterToolsExtra(me); }
function adminMenu(me){const role=me.role,fa=role==='FA',da=role==='DA',ua=role==='UA';let html='<div class="ea-profile"><div class="ea-shield">🛡️</div><div><b>'+escapeHtml('LidyaChat Yönetim')+'</b><small>Ghost Mode '+(me.ghost_mode?'açık':'kapalı')+'</small></div><span class="ea-role">'+escapeHtml(role)+'</span></div><div class="ea-section">Günlük operasyon</div><div class="eris-admin-grid">'+(da?'<button data-a="ghost">👻　Ghost Mode</button>':'')+'<button data-a="tickets">🎫　Destek talepleri</button>';if(fa||da)html+='<button data-a="announcement">📢　Duyuru gönder</button>';if(da)html+='<button data-a="gaps">🧩　Uygulama Geri Bildirimi Paneli</button><button data-a="payments">Yükleme İsteği</button>';if(ua||da)html+='<button data-a="ban">🚫　Kullanıcı Ban</button><button data-a="roomban">🏠　Oda Ban</button><button data-a="chatban">💬　CHAT/DM BAN</button>';html+='</div>';if(fa||da){html+='<div class="ea-section">Ban ve itiraz yönetimi</div><div class="eris-admin-grid"><button data-a="banrequests">🚫　Ban talepleri</button><button data-a="roombanrequests">🏠　Oda ban talepleri</button><button data-a="chatbanrequests">💬　Sohbet ban talepleri</button><button data-a="banappeals">📝　İtiraz talepleri</button>'+(da?'<button data-a="topup">💰　Lidya yükleme</button>':'')+'</div>'}if(da)html+='<div class="ea-section">Geliştirici yönetimi</div><div class="eris-admin-grid"><button data-a="lookup">🔎　ID Sorgu</button><button data-a="deleteaccount">🗑　Hesap Silme</button><button data-a="roles">👑　Yönetici Rolleri</button><button data-a="faactions">📋　FA işlemleri</button><button data-a="daactions">📋　DA işlemleri</button><button data-a="uaactions">📋　UA işlemleri</button><button data-a="saactions">📋　SA işlemleri</button><button data-a="banlogs">📋　Ban işlem logları</button><button data-a="roombanlogs">📋　Oda ban işlem logları</button><button data-a="chatbanlogs">📋　Sohbet ban işlem logları</button><button data-a="lidya">💰　Lidya İşlemleri · Yönetim</button><button data-a="referrals">✦　Referans Kod Oluştur</button></div>';if(da&&me.security_owner)html+='<div class="ea-section">Güvenlik incelemeleri</div><div class="eris-admin-grid"><button data-a="security">🛡　Güvenlik Merkezi</button></div>';return html+lmCenterTools(me)}

function decorateAdminTools(root){
 const hints={'lm-command':'Olay ve tedbir özeti','lm-cases':'Olay kayıtları','lm-emergency':'Koruyucu tedbir kayıtları','lm-finance':'Mali işlem incelemesi','lm-fraud':'İnceleme göstergeleri','lm-audit':'Yetkili işlem geçmişi',ghost:'Görünürlük ayarları',tickets:'Kullanıcı desteği',announcement:'Topluluğa duyuru',gaps:'Öneriler ve eksikler',ban:'Hesap güvenliği',roomban:'Oda güvenliği',chatban:'Sohbet güvenliği',banrequests:'Bekleyen incelemeler',roombanrequests:'Oda incelemeleri',chatbanrequests:'Sohbet incelemeleri',banappeals:'Karar incelemesi',topup:'Bakiye yükleme',payments:'DA ödeme kuyruğu',lookup:'DA kullanıcı sorgulama',deleteaccount:'DA hesap silme',roles:'Yetki yönetimi',lidya:'Hazine yönetimi',referrals:'USER ve TANIDIK kodları'};
 for(const button of root.querySelectorAll('[data-a]')){
  const key=button.dataset.a,label=button.textContent.replace(/^[^\p{L}\p{N}]+/u,'').trim();
  button.type='button';button.classList.add('ea-png-button');button.setAttribute('aria-label',label);
  const picture=document.createElement('picture');picture.className='ea-png-art';picture.setAttribute('aria-hidden','true');
  const image=document.createElement('img');image.alt='';image.width=960;image.height=320;image.decoding='async';image.draggable=false;image.dataset.eaArtKey=key==='payments'?'topup':key;image.onerror=()=>button.classList.add('ea-art-missing');image.onload=()=>button.classList.remove('ea-art-missing');
  const theme=document.documentElement.dataset.erisTheme==='dark'?'dark':'light';image.src=(image.dataset.eaArtKey.startsWith('lm-')?adminV3ArtBase:adminArtBase)+theme+'/'+(image.dataset.eaArtKey.startsWith('lm-')?image.dataset.eaArtKey.slice(3):adminArtworkKey(image.dataset.eaArtKey))+'.png';picture.append(image);
  const copy=document.createElement('span');copy.className='ea-png-copy';const title=document.createElement('b');title.textContent=({gaps:'Geri Bildirim',lidya:'Lidya Yönetimi'})[key]||label;
  const hint=document.createElement('small');hint.textContent=hints[key]||'İşlem geçmişi';copy.append(title,hint);button.replaceChildren(picture,copy);
 }
}
function syncAdminArt(){const theme=document.documentElement.dataset.erisTheme==='dark'?'dark':'light';for(const image of document.querySelectorAll('img[data-ea-art-key]')){const src=(image.dataset.eaArtKey.startsWith('lm-')?adminV3ArtBase:adminArtBase)+theme+'/'+(image.dataset.eaArtKey.startsWith('lm-')?image.dataset.eaArtKey.slice(3):adminArtworkKey(image.dataset.eaArtKey))+'.png';if(image.src!==src)image.src=src}}
new MutationObserver(syncAdminArt).observe(document.documentElement,{attributes:true,attributeFilter:['data-eris-theme']});
window.addEventListener('erischat:theme',syncAdminArt);
function installAdminInteriorContrastV2(){
 if(document.getElementById('erisAdminInteriorContrastV2'))return;
 const st=document.createElement('style'); st.id='erisAdminInteriorContrastV2';
 st.textContent=`/* ERISCHAT_ADMIN_INTERIOR_CONTRAST_SCOPED_V2 */
 .eris-admin-overlay #eaBody,.ea-float{color:var(--ea-ink,var(--ui-ink,#f5e8cc));}
 .eris-admin-overlay #eaBody :is(input:not([type=checkbox]):not([type=radio]),textarea,select),.ea-float :is(input:not([type=checkbox]):not([type=radio]),textarea,select){background:var(--ui-raised,#29261f);color:var(--ui-ink,#f5e8cc);border:1px solid var(--ui-line,#947342);min-height:44px;font-size:16px;opacity:1;}
 .eris-admin-overlay #eaBody :is(input,textarea)::placeholder,.ea-float :is(input,textarea)::placeholder{color:var(--ui-muted,#948875);opacity:1;}
 .eris-admin-overlay #eaBody :is(button,input,textarea,select):focus-visible,.ea-float :is(button,input,textarea,select):focus-visible{outline:2px solid var(--ui-gold,#d8b66f);outline-offset:2px;}
 .eris-admin-overlay #eaBody :is(pre,code),.ea-float :is(pre,code){overflow-wrap:anywhere;white-space:pre-wrap;}`;
 document.head.append(st);
}

function openPanel(me){installAdminInteriorContrastV2();addStyles();document.querySelector('.eris-admin-overlay')?.remove();const opener=document.activeElement,previousOverflow=document.body.style.overflow;const p=document.createElement('div');const remove=p.remove.bind(p);p.remove=()=>{remove();document.body.style.overflow=previousOverflow;if(opener?.isConnected)opener.focus({preventScroll:true})};document.body.style.overflow='hidden';p.className='eris-admin-overlay';p.setAttribute('role','dialog');p.setAttribute('aria-modal','true');p.setAttribute('aria-label','LidyaChat Yönetim');p.innerHTML='<section class="eris-admin-panel"><header class="ea-head"><div class="ea-heading"><div class="ea-brand" role="img" aria-label="LidyaChat"></div><div class="ea-kicker">LİDYA • YÖNETİM</div><h2 class="ea-title">LidyaChat Yönetim</h2><div class="ea-sub">Yetki seviyene göre güvenli yönetim araçları.</div></div><button class="ea-close" data-close aria-label="Kapat">×</button></header><div id="eaBody"></div></section>';document.body.appendChild(p);const closeButton=p.querySelector('[data-close]');for(const [property,value] of [['background','var(--ea-panel)'],['color','var(--ea-ink)']])closeButton.style.setProperty(property,value,'important');const dismiss=()=>{if(p.querySelector('#eaBody .ea-profile'))p.remove();else openPanel(me)};p.querySelector('[data-close]').onclick=dismiss;p.onclick=e=>{if(e.target===p)dismiss()};p.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();dismiss();return}if(e.key==='Tab'){const focusable=[...p.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};p.querySelector('[data-close]').focus({preventScroll:true});const b=p.querySelector('#eaBody');b.innerHTML=adminMenu(me);decorateAdminTools(b);b.querySelectorAll('[data-a]').forEach(x=>x.onclick=()=>action(x.dataset.a,me,p))};
function openAdminTool(parent,launch){
 const baseline=new Set(document.body.children);let seen=false,done=false;
 const roots=()=>[...document.body.children].filter(el=>!baseline.has(el)&&(el.matches('[role="dialog"],dialog,.support-window,.eb-overlay,.esi-overlay,.lp-overlay,.pa-overlay')||el.querySelector('[role="dialog"],dialog')));
 const finish=()=>{if(done)return;done=true;observer.disconnect();clearTimeout(timer);if(parent.isConnected){parent.style.removeProperty('display');parent.inert=false;document.body.style.overflow='hidden';parent.querySelector('[data-close]')?.focus({preventScroll:true})}};
 const observer=new MutationObserver(()=>{const children=roots();if(children.length)seen=true;else if(seen)finish();if(!parent.isConnected){done=true;observer.disconnect();clearTimeout(timer)}});
 parent.style.setProperty('display','none','important');parent.inert=true;
 observer.observe(document.body,{childList:true,subtree:true});
 const timer=setTimeout(()=>{if(!seen)finish()},10000);
 try{Promise.resolve(launch()).catch(error=>{finish();window.toast?.(error.message||'Yönetim aracı açılamadı.')})}catch(error){finish();window.toast?.(error.message||'Yönetim aracı açılamadı.')}
}
async function action(a,me,p){try{
 if(a.startsWith('lm-')){window.LidyaManagementCenter.open(a.slice(3));return;}

 if(a==='security'){if(!me.security_owner)throw new Error('Bu işlem için yetki yok');await window.ErisSecurityCenter.open(p,()=>openPanel(me),token);return}
 if(a==='deleteaccount'){if(me.role!=='DA')throw new Error('DA yetkisi gerekli.');showAdminAccountDeletion(p,me);return}
 if(a==='lookup'&&me.role!=='DA')throw new Error('DA yetkisi gerekli.');
 if(a==='ghost'){if(me.role!=='DA')throw new Error('Ghost Mode yalnızca DA yetkililerine açıktır.');const r=await req('/v1/admin/ghost-mode',{method:'PATCH',body:JSON.stringify({enabled:!me.ghost_mode})});me.ghost_mode=r.enabled;window.toast?.('Ghost Mode '+(r.enabled?'açıldı':'kapatıldı'));p.remove();openPanel(me);if(r.enabled)showGhostNotice(me);return}
 if(['daactions','uaactions','saactions'].includes(a)){if(me.role!=='DA')throw new Error('DA yetkisi gerekli.');const rank=a.slice(0,2).toUpperCase();showData(p,rank+' işlemleri',await req('/v1/admin/role-actions/'+rank),me);return}
 if(a==='faactions'){await renderFaActions(p,me);return}
 if(a==='banrequests'){openAdminTool(p,()=>window.ErisBan?.openRequests?.());return}
 if(a==='banlogs'){openAdminTool(p,()=>window.ErisBan?.openLogs?.());return}
 if(a==='ban'){openAdminTool(p,()=>window.ErisBan?.open?.());return}
 if(a==='chatban'){openAdminTool(p,()=>window.ErisBan?.openChat?.());return}
 if(a==='chatbanrequests'){openAdminTool(p,()=>window.ErisBan?.openChatRequests?.());return}
 if(a==='chatbanlogs'){openAdminTool(p,()=>window.ErisBan?.openChatLogs?.());return}
 if(a==='roomban'){openAdminTool(p,()=>window.ErisBan?.openRoom?.());return}
 if(a==='roombanrequests'){openAdminTool(p,()=>window.ErisBan?.openRoomRequests?.());return}
 if(a==='roombanlogs'){openAdminTool(p,()=>window.ErisBan?.openRoomLogs?.());return}
 if(a==='topup'){openAdminTool(p,()=>window.ErisPurchases?.openTopUp?.());return}
 if(a==='banappeals'){await renderBanAppeals(p,me);return}
 if(a==='gaps'){if(me.role!=='DA')throw new Error('Bu panel yalnızca DA yetkililerine açıktır.');openAdminTool(p,()=>window.ErisSuggestions?.openAdmin?.());return}
 if(a==='referrals'){if(me.role!=='DA')throw new Error('DA yetkisi gerekli.');openAdminTool(p,()=>window.ErisReferral?.openAdmin?.());return}
 if(a==='lidya'){if(me.role!=='DA')throw new Error('DA yetkisi gerekli.');openAdminTool(p,()=>window.ErisPurchases?.openManagement?.());return}
 if(a==='payments'){if(me.role!=='DA')throw new Error('DA yetkisi gerekli.');openAdminTool(p,()=>window.ErisPaymentAssistance?.openQueue?.());return}
 if(a==='tickets'){openAdminTool(p,()=>window.ErisSupport?.openAdmin?.());return}
 if(a==='announcement'){renderAnnouncement(p,me);return}
 if(['lookup','calls','vip','ban','roomban','chatban','roles','gaps'].includes(a)){showActionForm(a,me,p);return}
 if(a==='users'){const rows=await req('/v1/admin/users');showData(p,'👤 Gerçek Kullanıcılar',rows,me);return}
}catch(e){window.toast?.(e.message||'Yönetim işlemi başarısız')}}
async function showAdminAccountDeletion(p,me){
 if(me.role!=='DA')throw new Error('DA yetkisi gerekli.');
 const body=p.querySelector('#eaBody');body.replaceChildren();
 const title=document.createElement('h3');title.textContent='DA • Hesap Silme';body.append(title);
 const form=document.createElement('form');form.className='ea-form';form.style.cssText='display:grid;gap:12px';
 const input=document.createElement('input');input.required=true;input.maxLength=128;input.placeholder='Kullanıcı ID veya 10 haneli profil ID';input.setAttribute('aria-label','Silinecek kullanıcı ID');input.className='ea-input';
 const lookup=document.createElement('button');lookup.type='submit';lookup.textContent='Önce ID sorgula';lookup.className='ea-action';
 const status=document.createElement('p');status.setAttribute('role','status');form.append(input,lookup,status);body.append(form);
 form.onsubmit=async e=>{e.preventDefault();lookup.disabled=true;status.textContent='Kullanıcı sorgulanıyor…';
  try{const id=input.value.trim(),user=await req('/v1/admin/users/'+encodeURIComponent(id));
   status.textContent='Kullanıcı: '+user.nickname+' • Profil ID: '+user.public_id+' • Sistem ID: '+user.id;
   const button=document.createElement('button');button.type='button';button.className='ea-action';button.textContent='Bu hesabı kalıcı sil';
   form.querySelector('[data-delete-confirm]')?.remove();button.dataset.deleteConfirm='';form.append(button);
   button.onclick=async()=>{if(!confirm('Bu kullanıcı hesabı kalıcı olarak silinecek. Devam edilsin mi?'))return;
    const typed=prompt('Onay için profil ID değerini aynen yaz: '+user.public_id);
    if(typed!==String(user.public_id)){status.textContent='Onay eşleşmedi, işlem iptal edildi.';return}
    button.disabled=true;try{await req('/v1/admin/account-deletion/'+encodeURIComponent(user.id),{method:'DELETE'});status.textContent='Hesap silme isteği tamamlandı.';button.remove()}
    catch(error){status.textContent=error.message||'Hesap silinemedi.';button.disabled=false}
   };
  }catch(error){status.textContent=error.message||'Kullanıcı bulunamadı.'}finally{lookup.disabled=false}
 };
 const back=document.createElement('button');back.type='button';back.className='ea-back';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);body.append(back);
}
async function showActionForm(actionKey,me,p){
 const body=p.querySelector('#eaBody'),titles={calls:'Arama sorgu',lookup:'Kullanıcı ID sorgu',lidya:'Lidya işlemleri',vip:'VIP seviyesi',ban:'Kullanıcı Ban',roomban:'Oda Ban',chatban:'CHAT/DM BAN',roles:'Yönetici rolleri',gaps:'Uygulama geri bildirimi'};
 body.replaceChildren();const title=document.createElement('h3');title.textContent=titles[actionKey];body.append(title);
 if(actionKey==='roles'){try{const rows=await req('/v1/admin/roles');const list=document.createElement('div');list.className='eris-admin-grid';for(const r of rows){const card=document.createElement('div');card.className='eris-admin-card';card.textContent=(r.public_id?'ID: '+r.public_id:'Profil ID bulunamadı')+' • '+r.role+(r.ghost_mode?' • Ghost':'')+(r.nickname?' • '+r.nickname:'');card.dataset.profileId=String(r.public_id||'');list.append(card)}body.append(list)}catch(e){const err=document.createElement('div');err.className='eris-admin-card';err.textContent=e.message;body.append(err)}}
 const form=document.createElement('form');form.className='ea-form';form.style.cssText='display:grid;gap:10px;margin-top:12px';
 const fields={
   lookup:[['id','Kullanıcı ID veya 10 haneli profil ID','text']],
   calls:[['id','Kullanıcı ID veya 10 haneli profil ID','text']],
   vip:[['id','Kullanıcı ID veya 10 haneli profil ID','text'],['level','VIP seviyesi','number',0]],
   ban:[['id','Kullanıcı ID veya 10 haneli profil ID','text'],['operation','İşlem','select',['Hesap banı','Banı kaldır','Cihaz banı']],['days','Süre (gün); boş bırakınca süresiz','number',1],['reason','İşlem nedeni','text']],
   roomban:[['id','Oda ID veya 12 haneli oda ID','text'],['operation','İşlem','select',['Odayı yasakla','Banı kaldır']],['days','Süre (gün); boş bırakınca süresiz','number',1],['reason','İşlem nedeni','text']],
   chatban:[['id','Kullanıcı ID veya 10 haneli profil ID','text'],['operation','İşlem','select',['Sohbet banı','Banı kaldır']],['days','Süre (gün); boş bırakınca süresiz','number',1],['reason','İşlem nedeni','text']],
   roles:[['id','Kullanıcı ID veya 10 haneli profil ID','text'],['role','Yeni rol','select',['SA','UA','FA','DA']]],
   gaps:[['message','Geri bildirim / uygulama eksiği','textarea']]
 }[actionKey]||[];
 for(const [name,label,type,min] of fields){const wrap=document.createElement('label');wrap.className='ea-field';wrap.style.cssText="display:grid;gap:5px;color:var(--ui-ink);font-size:10px;font-weight:750";const caption=document.createElement('span');caption.textContent=label;wrap.append(caption);let input;
   if(type==='select'){input=document.createElement('select');const values=actionKey==='lidya'?['add','remove']:actionKey==='roles'?min:actionKey==='ban'?['ban','unban','device']:['ban','unban'];min.forEach((text,i)=>{const opt=document.createElement('option');opt.value=values[i]||text;opt.textContent=text;input.append(opt)})}
   else if(type==='textarea'){input=document.createElement('textarea');input.rows=4;input.maxLength=2000;input.required=true}
   else{input=document.createElement('input');input.type=type;if(type==='number'){input.min=String(min);input.step='1';input.required=name!=='days';if(name==='level')input.max='12';if(name==='amount')input.max='1000000000';if(name==='days')input.max='3650';if(name==='level')input.value='0'}else{input.maxLength=128;input.required=true}}
   input.name=name;input.className='ea-input';input.style.cssText="width:100%;box-sizing:border-box;border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-panel);color:var(--ui-ink);padding:11px;font:inherit";wrap.append(input);form.append(wrap)
 }
 if(['ban','roomban','chatban'].includes(actionKey)){
   const days=form.elements.namedItem('days'),reason=form.elements.namedItem('reason');
   reason.required=true;reason.minLength=3;
   const choice=document.createElement('select');choice.name='duration_mode';choice.required=true;choice.innerHTML='<option value="">Ban süresini seçin</option><option value="limited">Gün sayısı</option><option value="indefinite">Süresiz</option>';choice.className='ea-input';choice.style.cssText="width:100%;padding:11px;border-radius:12px;background:var(--ui-panel);color:var(--ui-ink)";choice.onchange=()=>{days.required=choice.value==='limited';days.disabled=choice.value!=='limited';if(days.disabled)days.value=''};days.disabled=true;form.insertBefore(choice,form.firstChild);
   const note=document.createElement('small');note.textContent='Ban süresini ve nedenini doldurun.';form.append(note);
 }
 const status=document.createElement('div');status.className='ea-sub';status.setAttribute('role','status');const submit=document.createElement('button');submit.className='ea-action';submit.type='submit';submit.textContent='Devam et';form.append(submit,status);body.append(form);
 if(actionKey==='roles'){const revoke=document.createElement('button');revoke.type='button';revoke.className='ea-action';revoke.textContent='Yetki Al';revoke.onclick=async()=>{const id=form.elements.namedItem('id').value.trim();if(!id){status.textContent='Hedef kullanıcı ID girin.';return}revoke.disabled=true;try{await req('/v1/admin/roles/'+encodeURIComponent(id),{method:'DELETE'});window.ErisRoleBadges?.refresh();status.textContent='Yetki kaldırıldı. Hesap standart kullanıcı oldu.'}catch(e){status.textContent=e.message}finally{revoke.disabled=false}};form.append(revoke)}
 const opField=form.elements.namedItem('operation'),reasonField=form.elements.namedItem('reason');if(opField&&reasonField){const toggleReason=()=>{const remove=opField.value==='unban',device=opField.value==='device',choice=form.elements.namedItem('duration_mode'),days=form.elements.namedItem('days');reasonField.required=!remove;choice.required=!remove;choice.disabled=remove;if(remove){days.required=false;days.disabled=true}else if(device){choice.value='indefinite';days.value='';days.disabled=true;days.required=false}else{days.disabled=choice.value!=='limited';days.required=choice.value==='limited'}};opField.addEventListener('change',toggleReason);toggleReason()}
 form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;status.textContent='İşlem yapılıyor…';const v=Object.fromEntries(new FormData(form).entries()),id=encodeURIComponent(v.id||'');try{let result;
   if(!['lookup','calls','gaps'].includes(actionKey)&&!confirm(`${titles[actionKey]} işlemini ${v.id||''} için uygulamak istiyor musun?`)){submit.disabled=false;status.textContent='İşlem iptal edildi.';return}
   if(actionKey==='lookup')result=await req('/v1/admin/users/'+id);
   else if(actionKey==='calls'){result=await req('/v1/admin/calls/'+id);showCalls(p,result,me);return}
   else if(actionKey==='vip')result=await req('/v1/admin/users/'+id+'/vip',{method:'POST',body:JSON.stringify({level:Number(v.level)})});
   else if(actionKey==='roles'){result=await req('/v1/admin/roles',{method:'PUT',body:JSON.stringify({user_id:v.id,role:v.role})});window.ErisRoleBadges?.refresh();}
   else if(actionKey==='gaps')result=await req('/v1/admin/application-gaps',{method:'POST',body:JSON.stringify({message:v.message})});
   else {const room=actionKey==='roomban',chat=actionKey==='chatban',device=actionKey==='ban'&&v.operation==='device',remove=v.operation==='unban';const path=room?'/v1/admin/rooms/'+id+'/ban':'/v1/admin/users/'+id+(chat?'/chat-ban':device?'/device-ban':'/ban');result=await req(path,{method:remove?'DELETE':'POST',...(remove?{}:{body:JSON.stringify({days:v.duration_mode==='indefinite'?null:Number(v.days),reason:v.reason})})});}
   if(result?.pending){openPanel(me);floating('Ban işleminiz yetkili DA’lara iletilmiştir.');return}
   showData(p,titles[actionKey],[result],me);window.toast?.('İşlem tamamlandı.');
  }catch(error){status.textContent=error.message||'İşlem başarısız.';submit.disabled=false}
 };
 const back=document.createElement('button');back.className='ea-back';back.type='button';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);body.append(back)
}
function showGhostNotice(me){
 document.querySelector('[data-ghost-notice]')?.remove();
 floating('Ghost modu aktif, sevgili [DA] '+(me.nickname||'Yönetici')+'.\n\nOdalara görünmez girersin. Giriş bildirimi ve herkese açık giriş/çıkış kaydı gösterilmez.\n\n• Sohbete yazamazsın.\n• Kilitli odalara şifresiz girebilirsin.\n• Koltuğa oturamazsın veya mikrofon açamazsın.\n• Odalarda hediye gönderemezsin.\n\nNormal yetkilerine dönmek için Ghost Mode’u kapat. × yalnızca bu pencereyi gizler. Gizlilik esastır.');
 const box=document.querySelector('.ea-float:last-child');if(box){box.dataset.ghostNotice='';box.style.whiteSpace='pre-line';box.style.maxHeight='75dvh';box.style.overflowY='auto';box.style.background="color-mix(in srgb, var(--ui-raised) 72%, transparent)";}
}
function floating(message,appeal){addStyles();const box=document.createElement('div');box.className='ea-float';box.setAttribute('role','status');const label=document.createElement('div');label.textContent=message;const close=document.createElement('button');close.dataset.close='';close.textContent='×';close.setAttribute('aria-label','Kapat');close.onclick=()=>box.remove();box.append(label,close);if(appeal){const button=document.createElement('button');button.textContent='İtiraz et';button.style.marginTop='10px';button.onclick=()=>{box.remove();renderAppealModal(appeal)};box.append(button)}document.body.append(box)}
function portrait(asset,frame){const wrap=document.createElement('span');wrap.className='ea-ban-portrait';const img=document.createElement('img');img.src=window.ErisChatCosmetics?.assetUrl?.(asset)||'';img.alt='';wrap.append(img);if(frame){const border=document.createElement('img');border.className='frame';border.src=window.ErisChatCosmetics?.assetUrl?.(frame)||'';border.alt='';wrap.append(border)}return wrap}
function banCard(row,appeal){const card=document.createElement('article');card.className='eris-admin-card';const head=document.createElement('div');head.className='ea-ban-person';head.append(portrait(appeal?row.requester_avatar:row.target_avatar,appeal?row.requester_frame:row.target_frame));const title=document.createElement('b');title.textContent=appeal?row.requester_name:row.target_name;head.append(title);card.append(head);const meta=document.createElement('p');meta.textContent=(appeal?'İtiraz edilen: '+row.target_name+' • ID: '+row.target_id:'Süre: '+(row.days===null?'Süresiz':row.days+' gün'))+' • '+row.kind;card.append(meta);const reason=document.createElement('p');reason.textContent='Ban nedeni: '+row.reason;card.append(reason);return card}
async function renderBanRequests(p,me){const rows=await req('/v1/admin/ban-requests');const b=p.querySelector('#eaBody');b.replaceChildren();const h=document.createElement('h3');h.textContent='Ban talepleri';b.append(h);const pending=rows.filter(r=>r.status==='pending');if(!pending.length)b.append('Bekleyen talep yok.');for(const row of pending){const card=banCard(row,false),actions=document.createElement('div');actions.className='ea-ban-actions';for(const [label,action] of [['Ban onay','approve'],['Ban reddet','reject']]){const button=document.createElement('button');button.className=action;button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await req('/v1/admin/ban-requests/'+row.id+'/decision',{method:'POST',body:JSON.stringify({action})});renderBanRequests(p,me)}catch(e){button.disabled=false;window.toast?.(e.message)}};actions.append(button)}card.append(actions);b.append(card)}const back=document.createElement('button');back.className='ea-back';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);b.append(back)}
async function renderBanAppeals(p,me){const rows=await req('/v1/admin/ban-appeals');const b=p.querySelector('#eaBody');b.replaceChildren();const h=document.createElement('h3');h.textContent='İtiraz talepleri';b.append(h);const pending=rows.filter(r=>r.status==='pending');if(!pending.length)b.append('Bekleyen itiraz yok.');for(const appeal of pending){const row=appeal.request,card=banCard(row,true);for(const text of ['İtiraz nedeni: '+appeal.reason,'Açıklama: '+appeal.explanation]){const para=document.createElement('p');para.textContent=text;card.append(para)}for(const source of appeal.images){const image=document.createElement('img');image.className='ea-ban-proof';image.src=source;image.alt='İtiraz kanıtı';image.onclick=()=>{const modal=document.createElement('div');modal.className='eris-admin-overlay';const full=document.createElement('img');full.src=source;full.alt='Büyütülmüş kanıt';full.style.cssText='max-width:95vw;max-height:90vh;object-fit:contain';modal.append(full);modal.onclick=()=>modal.remove();document.body.append(modal)};card.append(image)}const actions=document.createElement('div');actions.className='ea-ban-actions';for(const [label,action] of [['İtirazı onayla','approve'],['İtirazı reddet','reject']]){const button=document.createElement('button');button.className=action;button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await req('/v1/admin/ban-appeals/'+appeal.id+'/decision',{method:'POST',body:JSON.stringify({action})});renderBanAppeals(p,me)}catch(e){button.disabled=false;window.toast?.(e.message)}};actions.append(button)}card.append(actions);b.append(card)}const back=document.createElement('button');back.className='ea-back';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);b.append(back)}
function renderAppealModal(row){addStyles();const overlay=document.createElement('div');overlay.className='eris-admin-overlay';overlay.innerHTML='<section class="eris-admin-panel"><h3>Ban talebine itiraz</h3><form class="ea-form" style="display:grid;gap:12px"><label>İtiraz nedeni<input name="reason" maxlength="200" minlength="3" required></label><label>Açıklama (en fazla 400 karakter)<textarea name="explanation" maxlength="400" required></textarea></label><label>Kanıt (en fazla 3 fotoğraf)<input name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><button class="ea-action" type="submit">İtirazı gönder</button><button type="button" data-close>Kapat</button></form></section>';document.body.append(overlay);overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,files=[...form.elements.images.files];if(files.length>3||files.some(f=>f.size>1500000)){window.toast?.('En fazla 3 fotoğraf, her biri 1,5 MB.');return}const images=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})));try{await req('/v1/admin/ban-requests/'+row.id+'/appeal',{method:'POST',body:JSON.stringify({reason:form.elements.reason.value,explanation:form.elements.explanation.value,images})});overlay.remove();floating('İtirazınız DA yetkililerine iletildi.')}catch(error){window.toast?.(error.message)}}}
let currentAdminId=null,currentAdminRole=null;let seenDecisions=new Set(JSON.parse(localStorage.getItem('eris.admin.decisions')||'[]'));
async function checkDecisions(){if(!token())return;try{const rows=await req('/v1/admin/ban-requests');for(const row of rows){if(row.workflow)continue;if(row.requester_id!==currentAdminId||!['approved','rejected'].includes(row.status)||seenDecisions.has(row.id))continue;seenDecisions.add(row.id);localStorage.setItem('eris.admin.decisions',JSON.stringify([...seenDecisions].slice(-200)));floating(row.target_name+' isimli kullanıcı için yapmış olduğunuz ban talebi '+(row.status==='approved'?'onaylanmıştır.':'reddedilmiştir.'),row.status==='rejected'&&!row.appeal_used?row:null)}const appeals=await req('/v1/admin/ban-appeals').catch(()=>[]);for(const appeal of appeals){if(appeal.request.requester_id!==currentAdminId||appeal.status!=='rejected')continue;const key='appeal-'+appeal.id;if(seenDecisions.has(key))continue;seenDecisions.add(key);localStorage.setItem('eris.admin.decisions',JSON.stringify([...seenDecisions].slice(-200)));floating(appeal.request.target_name+' isimli kullanıcı için yapmış olduğunuz ban itirazınız reddedilmiştir.')}}catch{}}
setInterval(checkDecisions,15000);
async function renderFaActions(p,me){const rows=await req('/v1/admin/fa-actions'),body=p.querySelector('#eaBody');body.replaceChildren();const title=document.createElement('h3');title.textContent='FA işlemleri';body.append(title);if(!rows.length){const empty=document.createElement('p');empty.textContent='Henüz FA işlemi yok.';body.append(empty)}for(const row of rows){const card=document.createElement('article');card.className='eris-admin-card';const head=document.createElement('b');head.textContent=new Date(row.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'medium'})+' • '+row.admin_name+' • '+row.action;const target=document.createElement('p');target.textContent=(row.target_name||'')+(row.target_id?' • ID: '+row.target_id:'');const details=document.createElement('pre');details.textContent=JSON.stringify(row.details,null,2);card.append(head,target,details);body.append(card)}const back=document.createElement('button');back.className='ea-back';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);body.append(back)}
const incomingSeen=new Set(JSON.parse(sessionStorage.getItem('eris.admin.incoming')||'[]'));
async function checkIncoming(){if(!currentAdminId||!['FA','DA'].includes(currentAdminRole))return;try{const requests=await req('/v1/admin/ban-requests'),appeals=await req('/v1/admin/ban-appeals');for(const row of requests.filter(x=>x.status==='pending'&&!x.workflow)){const key='request-'+row.id;if(incomingSeen.has(key))continue;incomingSeen.add(key);incomingBubble(row,null)}for(const appeal of appeals.filter(x=>x.status==='pending')){const key='appeal-'+appeal.id;if(incomingSeen.has(key))continue;incomingSeen.add(key);incomingBubble(appeal.request,appeal)}sessionStorage.setItem('eris.admin.incoming',JSON.stringify([...incomingSeen].slice(-300)))}catch{}}
function incomingBubble(row,appeal){addStyles();const box=document.createElement('aside');box.className='ea-float ea-incoming';box.style.bottom='max(22px,env(safe-area-inset-bottom))';box.style.maxHeight='80vh';box.style.overflow='auto';const close=document.createElement('button');close.dataset.close='';close.textContent='×';close.setAttribute('aria-label','Kapat');close.onclick=()=>box.remove();const who=document.createElement('div');who.className='ea-ban-person';who.append(portrait(row.requester_avatar,row.requester_frame));const name=document.createElement('b');name.textContent=row.requester_name;who.append(name);box.append(close,who);for(const value of [appeal?'İtiraz talebi':'Ban talebi',row.target_name+' • ID: '+(row.target_id||'—'),row.kind+' • '+(row.days===null?'Süresiz':row.days+' gün'),'Ban nedeni: '+row.reason,...(appeal?['İtiraz nedeni: '+appeal.reason,'Açıklama: '+appeal.explanation]:[])]){const line=document.createElement('p');line.textContent=value;box.append(line)}if(appeal)for(const source of appeal.images){const image=document.createElement('img');image.className='ea-ban-proof';image.src=source;image.alt='İtiraz kanıtı';image.onclick=()=>{const modal=document.createElement('div');modal.className='eris-admin-overlay';const enlarged=document.createElement('img');enlarged.src=source;enlarged.alt='Büyütülmüş kanıt';enlarged.style.cssText='max-width:95vw;max-height:90vh;object-fit:contain';modal.append(enlarged);modal.onclick=()=>modal.remove();document.body.append(modal)};box.append(image)}const actions=document.createElement('div');actions.className='ea-ban-actions';for(const [label,action] of [['Ban onay','approve'],['Ban reddet','reject']]){const button=document.createElement('button');button.className=action;button.textContent=appeal?(action==='approve'?'İtirazı onayla':'İtirazı reddet'):label;button.onclick=async()=>{button.disabled=true;const path=appeal?'/v1/admin/ban-appeals/'+appeal.id:'/v1/admin/ban-requests/'+row.id;try{await req(path+'/decision',{method:'POST',body:JSON.stringify({action})});box.remove();window.toast?.('Karar kaydedildi.')}catch(e){button.disabled=false;window.toast?.(e.message)}};actions.append(button)}box.append(actions);document.body.append(box)}
setInterval(checkIncoming,12000);
function showCalls(p,result,me){const body=p.querySelector('#eaBody');body.replaceChildren();const h=document.createElement('h3');h.textContent='☎ Arama sorgu';body.append(h);const person=document.createElement('article');person.className='eris-admin-card';person.style.cssText='display:flex;align-items:center;gap:14px';const portrait=document.createElement('div');portrait.style.cssText='position:relative;width:58px;height:58px;flex:none';const avatar=document.createElement('img');avatar.src=window.ErisChatCosmetics?.assetUrl?.(result.user.avatar_asset)||'';avatar.alt='';avatar.style.cssText='width:50px;height:50px;border-radius:50%;object-fit:cover';portrait.append(avatar);if(result.user.frame_asset){const frame=document.createElement('img');frame.src=window.ErisChatCosmetics?.assetUrl?.(result.user.frame_asset)||'';frame.alt='';frame.style.cssText='position:absolute;inset:0;width:58px;height:58px;object-fit:contain';portrait.append(frame)}const label=document.createElement('b');label.textContent=result.user.nickname+' • '+result.user.public_id;person.append(portrait,label);body.append(person);for(const row of result.calls){const card=document.createElement('article');card.className='eris-admin-card';const date=new Date(row.created_at).toLocaleString('tr-TR');card.textContent=(row.kind==='video'?'📹':'☎')+' '+date+' • '+(row.incoming?'Gelen':'Giden')+' • '+row.peer_name+' • '+row.status+' • '+Math.floor(row.duration_seconds/60)+' dk '+row.duration_seconds%60+' sn';body.append(card)}if(!result.calls.length){const empty=document.createElement('p');empty.textContent='Arama kaydı yok.';body.append(empty)}const back=document.createElement('button');back.className='ea-back';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);body.append(back)}
function showData(p,title,data,me){const b=p.querySelector('#eaBody');b.replaceChildren();const h=document.createElement('h3');h.textContent=title;b.append(h);const rows=Array.isArray(data)?data:[data];if(!rows.length){const empty=document.createElement('div');empty.className='eris-admin-card';empty.textContent='Gösterilecek kayıt yok.';b.append(empty)}for(const row of rows){const card=document.createElement('article');card.className='eris-admin-card';const heading=document.createElement('b');heading.textContent=row?.nickname||row?.subject||row?.name||row?.title||((row?.id||row?.user_id)?'#'+(row.id||row.user_id):'Kayıt');card.append(heading);const summary=document.createElement('div');summary.style.cssText="color:var(--ui-ink);font-size:10px;margin-top:5px";summary.textContent=[row?.status,row?.role,row?.public_id,row?.created_at].filter(Boolean).join(' • ')||'Yönetim kaydı';card.append(summary);const details=document.createElement('details');details.style.marginTop='10px';const label=document.createElement('summary');label.textContent='Kayıt ayrıntıları';const pre=document.createElement('pre');pre.textContent=JSON.stringify(row,null,2);details.append(label,pre);card.append(details);b.append(card)}const back=document.createElement('button');back.className='ea-back';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);b.append(back)}
function showTickets(p,rows,me){const b=p.querySelector('#eaBody');b.replaceChildren();const title=document.createElement('h3');title.textContent='🎫 Destek talepleri';b.append(title);if(!rows.length){const empty=document.createElement('div');empty.className='eris-admin-card';empty.textContent='Bekleyen destek talebi yok.';b.append(empty)}for(const ticket of rows){const card=document.createElement('div');card.className='eris-admin-card';const label=document.createElement('b');label.textContent='#'+ticket.id+' • '+ticket.subject;const meta=document.createElement('div');meta.textContent=(ticket.category||'Genel')+' • '+ticket.status+' • '+ticket.user_id+(ticket.has_attachments?' • 📷 Fotoğraf var':'');const open=document.createElement('button');open.className='ea-action';open.textContent='Talebi incele →';open.onclick=()=>showTicket(p,ticket.id,me);card.append(label,meta,open);b.append(card)}const back=document.createElement('button');back.className='ea-back';back.textContent='← LidyaChat Yönetim menüsüne dön';back.onclick=()=>openPanel(me);b.append(back)}
async function showTicket(p,id,me){const b=p.querySelector('#eaBody');b.textContent='Talep yükleniyor…';try{const ticket=await req('/v1/admin/tickets/'+encodeURIComponent(id));b.replaceChildren();const title=document.createElement('h3');title.textContent='#'+ticket.id+' • '+ticket.subject;const meta=document.createElement('div');meta.className='eris-admin-card';meta.textContent=(ticket.category||'Genel')+' • '+ticket.status+' • '+ticket.user_id;b.append(title,meta);const messages=ticket.messages?.length?ticket.messages:[{sender_role:'USER',message:ticket.message,attachments:ticket.attachments||[]}];for(const row of messages){const item=document.createElement('article');item.className='eris-admin-card';const who=document.createElement('b');who.textContent=['USER','US'].includes(row.sender_role)?'Kullanıcı':'LidyaChat Yönetim';const body=document.createElement('p');body.textContent=row.message||'';body.style.cssText='white-space:pre-wrap;line-height:1.5';item.append(who,body);(row.attachments||[]).forEach(src=>{const img=document.createElement(src.startsWith('data:video/')?'video':'img');img.src=src;if(img.tagName==='VIDEO'){img.controls=true;img.preload='metadata'}else img.alt='Destek talebine eklenen fotoğraf';img.style.cssText='display:block;width:min(100%,260px);max-height:260px;object-fit:contain;border-radius:12px;margin:7px 0';item.append(img)});b.append(item)}const controls=document.createElement('div');controls.className='eris-admin-grid';const button=(label,fn)=>{const x=document.createElement('button');x.textContent=label;x.onclick=fn;controls.append(x);return x};if(['pending','open'].includes(ticket.status))button('Kabul et',async()=>{await req('/v1/admin/tickets/'+id+'/accept',{method:'POST'});await showTicket(p,id,me)});if(['pending','open','accepted'].includes(ticket.status)){button('Reddet',async()=>{const note=prompt('Red nedeni (isteğe bağlı):','');if(note===null)return;await req('/v1/admin/tickets/'+id+'/reject',{method:'POST',body:JSON.stringify({note})});await showTicket(p,id,me)});const input=document.createElement('textarea');input.className='eris-admin-card';input.placeholder='Kullanıcıya yanıt yaz';input.maxLength=4000;input.style.cssText="width:100%;box-sizing:border-box;color:var(--ui-ink);background:var(--ui-panel)";controls.append(input);button('Yanıt gönder',async()=>{const text=input.value.trim();if(!text)return window.toast?.('Yanıt metni yaz.');await req('/v1/admin/tickets/'+id+'/message',{method:'POST',body:JSON.stringify({message:text})});await showTicket(p,id,me)});button('Kapat',async()=>{const note=prompt('Sonuç: supported veya unsupported','supported');if(note===null)return;await req('/v1/admin/tickets/'+id+'/close',{method:'POST',body:JSON.stringify({note})});await showTicket(p,id,me)})}b.append(controls);const back=document.createElement('button');back.textContent='← Talepler';back.onclick=async()=>showTickets(p,await req('/v1/admin/tickets'),me);b.append(back)}catch(e){b.textContent=e.message||'Destek talebi açılamadı.'}}
function renderAnnouncement(p,me){
 const b=p.querySelector('#eaBody');b.replaceChildren();
 const title=document.createElement('h3');title.textContent='📢 Tüm kullanıcılara duyuru';
 const note=document.createElement('div');note.className='eris-admin-card';note.textContent='Duyuruda yayınlayan yöneticinin ID’si görünür. Kullanıcılar duyuruya yanıt veremez.';
 const form=document.createElement('form');form.style.cssText='display:grid;gap:10px';
 const input=document.createElement('textarea');input.required=true;input.minLength=3;input.maxLength=4000;input.placeholder='Duyuru mesajı';input.style.cssText='width:100%;min-height:140px;box-sizing:border-box;padding:12px;border-radius:12px;background:var(--ui-panel);color:var(--ui-ink);border:1px solid var(--ui-line)';
 const send=document.createElement('button');send.type='submit';send.className='ea-action';send.textContent='Duyuruyu yayınla';
 const status=document.createElement('div');status.className='ea-sub';status.setAttribute('role','status');form.append(input,send,status);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='ea-action';toggle.textContent='Mevcut duyurular';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','ea-current-announcements');
 const section=document.createElement('section');section.id='ea-current-announcements';section.hidden=true;
 const listing=document.createElement('div');listing.setAttribute('aria-live','polite');
 const more=document.createElement('button');more.type='button';more.className='ea-action';more.textContent='Daha eski duyurular';more.hidden=true;
 let cursor=null,revision=0;
 const empty=()=>{if(!listing.querySelector('article'))listing.textContent='Mevcut duyuru yok.'};
 async function load(append=false){
  const request=++revision;more.disabled=true;
  if(!append){listing.textContent='Duyurular yükleniyor…';cursor=null;more.hidden=true;}
  try{
   const result=await req('/v1/admin/announcements'+(append&&cursor?'?before='+cursor:''));
   if(request!==revision||!b.isConnected||section.hidden)return;
   if(!append)listing.replaceChildren();
   for(const row of result.items){
    if(row.active===false)continue;
    const card=document.createElement('article');card.className='eris-admin-card';card.dataset.announcementId=String(row.id);
    const publisher=document.createElement('b');publisher.textContent='Yayınlayan yönetici ID: '+(row.admin_public_id||'Bilinmiyor');publisher.style.cssText='display:block;overflow-wrap:anywhere';
    const text=document.createElement('p');text.textContent=row.message;text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
    const time=document.createElement('small');time.textContent=new Date(row.created_at).toLocaleString('tr-TR');
    const cancel=document.createElement('button');cancel.type='button';cancel.className='ea-action';cancel.textContent='Duyuruyu iptal et';
    cancel.onclick=async()=>{
     if(!confirm('Bu duyuru silinsin ve tüm kullanıcılar için yayından kaldırılsın mı?'))return;
     cancel.disabled=true;
     try{await req('/v1/admin/announcements/'+row.id,{method:'DELETE'});revision++;more.disabled=false;card.remove();empty();status.textContent='Duyuru silindi.';window.dispatchEvent(new CustomEvent('lidyachat:announcements-changed'));}
     catch(err){status.textContent=err.message||'Duyuru silinemedi.';cancel.disabled=false;}
    };
    card.append(publisher,text,time,cancel);listing.append(card);
   }
   empty();cursor=result.next_before;more.hidden=!cursor;
  }catch(err){if(request===revision){status.textContent=err.message||'Duyurular yüklenemedi.';if(!append)listing.textContent='Duyurular alınamadı. Kapatıp tekrar açabilirsiniz.';}}
  finally{if(request===revision)more.disabled=false;}
 }
 toggle.onclick=()=>{section.hidden=!section.hidden;toggle.setAttribute('aria-expanded',String(!section.hidden));if(section.hidden){revision++;}else load();};
 more.onclick=()=>load(true);
 form.onsubmit=async e=>{
  e.preventDefault();const message=input.value.trim();if(message.length<3)return;
  send.disabled=true;status.textContent='Yayınlanıyor…';
  try{const result=await req('/v1/admin/announcements',{method:'POST',body:JSON.stringify({message})});input.value='';if(!section.hidden)load();status.textContent='Yayınlandı • '+new Date(result.created_at).toLocaleString('tr-TR');window.dispatchEvent(new CustomEvent('lidyachat:announcements-changed'));}
  catch(err){status.textContent=err.message||'Duyuru yayınlanamadı.';}finally{send.disabled=false;}
 };
 section.append(listing,more);b.append(title,note,form,toggle,section);
}

function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
window.ErisAdmin={open:async()=>{try{openPanel(await req('/v1/admin/me'))}catch(e){window.toast?.(e.message)}},clear:function(){document.querySelectorAll('.eris-admin-btn,.eris-admin-menu,.eris-admin-overlay').forEach(el=>el.remove())}};
// Safe retry: admin menu stays restricted to server-confirmed SA/UA/FA/DA identities.
let adminBootTimer=null, adminBootSerial=0;
async function boot(attempt=0){
  const serial=++adminBootSerial;
  const mount=document.getElementById('adminMenuMount');
  if(!mount){if(attempt<8)adminBootTimer=setTimeout(()=>boot(attempt+1),550);return}
  const bearer=token();
  if(!bearer){window.ErisAdmin.clear();return}
  try{
    const response=await fetch(apiBase+'/v1/admin/me',{headers:{Authorization:'Bearer '+bearer},cache:'no-store'});
    if(serial!==adminBootSerial)return;
    if(response.status===401||response.status===403){window.ErisAdmin.clear();return}
    if(!response.ok)throw new Error('HTTP '+response.status);
    const me=await response.json();
    if(!me||!['SA','UA','FA','DA'].includes(me.role)){window.ErisAdmin.clear();return}
    currentAdminId=me.id;currentAdminRole=me.role;
    addStyles();
    const btn=document.createElement('button');btn.type='button';btn.className='homeMenuItem eris-admin-menu';
    btn.setAttribute('aria-label','LidyaChat Yönetim menüsünü aç');
    btn.innerHTML='<svg class="homeMenuIcon" aria-hidden="true"><use href="#home-security"></use></svg><div class="homeMenuCopy"><strong>LidyaChat Yönetim</strong><small>Güvenlik, destek ve hesap araçları</small></div><b class="ea-role">'+escapeHtml(me.role)+'</b>';
    btn.onclick=()=>openPanel(me);mount.replaceChildren(btn);
    checkDecisions();checkIncoming();
  }catch(error){
    console.warn('[LidyaChat yönetim] Yetki servisine erişilemedi:',error.message);
    if(attempt<6)adminBootTimer=setTimeout(()=>boot(attempt+1),Math.min(900*(attempt+1),4500));
    else if(mount&&!mount.querySelector('.eris-admin-menu')){
      const message=document.createElement('small');message.className='eris-admin-connection-warning';
      message.setAttribute('role','status');message.textContent='Yönetim bağlantısı kurulamadı. Oturumu ve API erişimini kontrol edin.';
      mount.replaceChildren(message);
    }
  }
}
function scheduleAdminBoot(){if(adminBootTimer)clearTimeout(adminBootTimer);adminBootTimer=setTimeout(()=>boot(0),350)}
if(document.readyState==='complete')scheduleAdminBoot();else window.addEventListener('load',scheduleAdminBoot,{once:true});
window.addEventListener('erischat:auth',scheduleAdminBoot);
window.addEventListener('online',scheduleAdminBoot);
window.addEventListener('pageshow',scheduleAdminBoot);
})();




