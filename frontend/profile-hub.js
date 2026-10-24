(() => {
  'use strict';
  const api = (path, options) => window.ErisPlatform.api(path, options);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const sessionToken=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const panel = () => document.getElementById('erisProfileHub');
  async function renderCalls(body,isCurrent) {
    body.innerHTML='<section class="eph-call-history"><header><h3>Arama geçmişleri</h3><p>Son 100 görünür görüşmeni kişi, yön ve türüne göre bul.</p></header><input type="search" data-search aria-label="Aranan kişi" placeholder="Kişi ara"><div data-tools></div><p data-summary></p><button type="button" data-refresh>Yenile</button><button type="button" data-clear disabled>Geçmişi temizle</button><div data-clear-confirm hidden><p>Filtrelerden bağımsız olarak tüm arama geçmişin kendi listenden temizlenecek. Karşı tarafın geçmişi değişmez.</p><button type="button" data-cancel>Vazgeç</button><button type="button" data-confirm>Geçmişimi temizle</button></div><p data-call-status role="status"></p><div data-calls></div></section>';
    const section=body.firstElementChild,active=()=>isCurrent()&&body.contains(section);
    const get=s=>section.querySelector(s), list=get('[data-calls]'),status=get('[data-call-status]'),clear=get('[data-clear]'),confirm=get('[data-clear-confirm]'),refresh=get('[data-refresh]');
    let rows=[],busy=false,limit=20;const filters={direction:'all',kind:'all',status:'all'};
    const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
    const btn=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n};
    for(const [key,label,options] of [['direction','Arama yönü',[['all','Tüm yönler'],['incoming','Gelen'],['outgoing','Giden']]],['kind','Arama türü',[['all','Tüm türler'],['audio','Sesli'],['video','Görüntülü']]],['status','Arama sonucu',[['all','Tüm sonuçlar'],['missed','Yanıtsız'],['ended','Tamamlandı'],['reject','Reddedildi'],['unavailable','Müsait değil'],['active','Sürüyor'],['ringing','Çalıyor']]]]){
      const select=el('select');select.setAttribute('aria-label',label);select.dataset.filter=key;select.style.cssText='max-width:100%;min-height:44px;margin:4px;padding:8px;border:1px solid var(--ui-line);border-radius:12px;background:var(--ui-panel);color:var(--ui-ink)';
      for(const [value,text] of options){const o=el('option',text);o.value=value;select.append(o)}
      select.onchange=()=>{filters[key]=select.value;limit=20;draw()};get('[data-tools]').append(select);
    }
    get('[data-search]').oninput=()=>{limit=20;draw()};
    function draw(){
      if(!active())return;list.replaceChildren();const q=get('[data-search]').value.trim().toLocaleLowerCase('tr-TR');
      const found=rows.filter(r=>String(r.peer_name||'Kullanıcı').toLocaleLowerCase('tr-TR').includes(q)&&(filters.direction==='all'||Boolean(r.incoming)===(filters.direction==='incoming'))&&(filters.kind==='all'||(r.kind==='video'?'video':'audio')===filters.kind)&&(filters.status==='all'||r.status===filters.status));
      get('[data-summary]').textContent=rows.length+' kayıt · '+found.length+' eşleşme';clear.disabled=busy||!rows.length;
      if(!found.length){const p=el('p',rows.length?'Bu filtrelerde arama bulunamadı.':'Henüz arama geçmişin yok.');p.className='eph-calls-empty';list.append(p)}
      for(const row of found.slice(0,limit)){
        const card=el('article');card.className='eph-call-card';const icon=el('span',row.kind==='video'?'▣':'☎');icon.className='eph-call-icon';icon.setAttribute('aria-hidden','true');const info=el('div');
        const name=btn(row.peer_name||'Kullanıcı',()=>{if(!active()||busy)return;window.ErisProfileHub.close();window.openUserProfile?.(row.peer_id)});name.className='eph-call-name';name.disabled=!row.peer_id||busy;
        const labels={active:'Sürüyor',ringing:'Çalıyor',reject:'Reddedildi',unavailable:'Müsait değil',missed:'Yanıtsız',ended:'Tamamlandı'};
        const meta=el('p',(row.incoming?'Gelen':'Giden')+' · '+(row.kind==='video'?'Görüntülü':'Sesli')+' · '+(labels[row.status]||'Bilinmeyen sonuç'));
        const duration=Number.isFinite(Number(row.duration_seconds))?Math.max(0,Math.floor(Number(row.duration_seconds))):0,date=new Date(row.created_at);
        info.append(name,meta,el('small',(Number.isNaN(date.getTime())?'Tarih bilinmiyor':date.toLocaleString('tr-TR'))+' · '+Math.floor(duration/60)+' dk '+duration%60+' sn'));card.append(icon,info);list.append(card);
      }
      if(found.length>limit)list.append(btn('Daha fazla göster',()=>{limit+=20;draw()}));
    }
    function lock(value){busy=value;refresh.disabled=value;get('[data-confirm]').disabled=value;get('[data-cancel]').disabled=value;draw()}
    clear.onclick=()=>{if(!active()||busy)return;confirm.hidden=false;get('[data-confirm]').focus()};
    get('[data-cancel]').onclick=()=>{if(!active()||busy)return;confirm.hidden=true;clear.focus()};
    get('[data-confirm]').onclick=async()=>{
      if(!active()||busy||confirm.hidden)return;lock(true);status.textContent='Geçmiş temizleniyor…';
      try{await api('/calls/history',{method:'DELETE'});if(!active())return;rows=[];confirm.hidden=true;status.textContent='Arama geçmişin kendi listenden temizlendi.'}
      catch(e){if(active())status.textContent=e.message||'Geçmiş temizlenemedi. Tekrar dene.'}
      finally{if(active())lock(false)}
    };
    async function load(){
      if(!active()||busy)return;confirm.hidden=true;lock(true);status.textContent='Aramalar yükleniyor…';
      try{const result=await api('/calls/history');if(!active())return;if(!Array.isArray(result))throw Error('Arama listesi alınamadı.');rows=result.filter(r=>r&&typeof r==='object');limit=20;status.textContent=''}
      catch(e){if(active())status.textContent=(e.message||'Aramalar yüklenemedi.')+' Yenile düğmesiyle tekrar dene.'}
      finally{if(active())lock(false)}
    }
    refresh.onclick=load;await load();
  }
  function mount() {
    const view = document.getElementById('profile');
    if (!view || panel()) return;
    const hub = document.createElement('section');
    hub.id = 'erisProfileHub';
    hub.innerHTML = `<style>
      #erisProfileHub{margin:16px 0 24px;color:var(--ui-ink);min-width:0}
      #erisProfileHub .eph-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:5px 0 12px;max-width:100%}
      #erisProfileHub button{min-width:0;width:100%;border:1px solid var(--ui-line);background:var(--ui-raised);color:var(--ui-ink);border-radius:12px;padding:10px 8px;font-size:12px;white-space:normal;min-height:42px;transition:background .16s,border-color .16s,color .16s}
      #erisProfileHub button[aria-selected=true]{background:linear-gradient(135deg,color-mix(in srgb, var(--ui-button) 20%, transparent),color-mix(in srgb, var(--ui-danger-bg) 9%, transparent));border-color:var(--ui-line);color:var(--ui-ink);box-shadow:inset 3px 0 var(--ui-shadow)}
      #erisProfileHub .eph-body{background:linear-gradient(145deg,var(--ui-panel),var(--ui-panel));border:1px solid var(--ui-line);border-radius:19px;padding:17px;min-height:82px;font-size:13px;box-shadow:0 12px 30px var(--ui-shadow)}
      #erisProfileHub .eph-body h3{margin:0 0 14px;font-size:16px;letter-spacing:-.2px}
      #erisProfileHub .eph-row{padding:9px 0;border-bottom:1px solid var(--ui-line);display:flex;align-items:center;justify-content:space-between;gap:9px}
      #erisProfileHub .eph-body input,#erisProfileHub .eph-body textarea{display:block;width:100%;box-sizing:border-box;padding:12px;background:var(--ui-panel);border:1px solid var(--ui-line);color:var(--ui-ink);border-radius:12px;margin:6px 0 14px;font:inherit;outline:none}
      #erisProfileHub .eph-body input:focus,#erisProfileHub .eph-body textarea:focus{border-color:var(--ui-line);box-shadow:0 0 0 3px var(--ui-shadow)}
      @media(max-width:520px){#erisProfileHub .eph-tabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#erisProfileHub .eph-tabs button{font-size:11px;padding:9px 7px;min-height:44px}#erisProfileHub .eph-body{padding:15px;border-radius:17px}}
      #erisProfileHub .eph-body label{font-size:11px;color:var(--ui-muted)}
      #erisProfileHub .eph-muted{color:var(--ui-muted);font-size:11px;line-height:1.5}
      #erisProfileHub{margin-top:18px}
      #erisProfileHub .eph-tabs{gap:9px;padding-bottom:14px}
      #erisProfileHub .eph-tabs button{display:flex;align-items:center;gap:11px;text-align:left;min-height:64px;padding:12px 15px;border-radius:18px;border-color:var(--ui-line);background:linear-gradient(145deg,var(--ui-raised),var(--ui-raised));color:var(--ui-ink);font-size:13px;font-weight:700}
      #erisProfileHub .eph-tabs button[aria-selected=true]{border-color:var(--ui-line);background:linear-gradient(145deg,var(--ui-raised),var(--ui-raised));box-shadow:none}
      #erisProfileHub .eph-icon{flex:none;width:24px;height:24px;color:var(--ui-gold);fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      #erisProfileHub .eph-body{padding:clamp(18px,4vw,26px);border-color:var(--ui-line);border-radius:23px;background:linear-gradient(145deg,var(--ui-panel),var(--ui-panel));box-shadow:none}
      #erisProfileHub .eph-body h3{font-size:19px;letter-spacing:-.35px}
      #erisProfileHub .eph-row{padding:13px 0}
      @media(max-width:390px){#erisProfileHub .eph-tabs button{min-height:70px;padding:10px;gap:8px;font-size:11px}#erisProfileHub .eph-icon{width:20px;height:20px}}
      #erisProfileHub .eph-tabs[hidden],#erisProfileHub .eph-body[hidden]{display:none!important}
      #erisProfileHub .eph-tabs{margin-top:10px;padding:0;max-height:none;overflow:visible;border:0;background:none}
      #erisProfileHub .eph-section-label{display:block;margin:0 2px 12px;color:var(--ui-gold);font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}
      #erisProfileHub .eph-tabs button{min-height:52px}
      #erisProfileHub .eph-body{margin-top:12px}
      body.eph-dialog-open{overflow:hidden}
      .eph-overlay[hidden],.eph-overlay [hidden]{display:none!important}
      .eph-overlay{position:fixed;inset:0;z-index:9500;display:grid;place-items:center;padding:16px;background:var(--ui-overlay);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
      .eph-dialog{width:min(640px,100%);max-height:min(88dvh,820px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--ui-line);border-radius:28px;background:radial-gradient(circle at 100% 0,color-mix(in srgb, var(--ui-button) 17%, transparent),transparent 55%),linear-gradient(145deg,var(--ui-panel),var(--ui-panel) 78%);box-shadow:0 28px 85px var(--ui-shadow);color:var(--ui-ink)}
      .eph-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px 20px 16px;border-bottom:1px solid var(--ui-line)}
      .eph-dialog-head small{display:block;color:var(--ui-gold);font-size:10px;font-weight:800;letter-spacing:1.8px}
      .eph-dialog-head h2{margin:7px 0 0;font-size:clamp(22px,5vw,30px);line-height:1.2}
      .eph-overlay .eph-close{flex:none;width:44px;height:44px;border:1px solid var(--ui-line);border-radius:15px;background:color-mix(in srgb, var(--ui-panel) 4%, transparent);color:var(--ui-ink);font-size:27px;line-height:1}
      .eph-dialog-content{overflow-y:auto;overscroll-behavior:contain;padding:18px 20px 22px}
      .eph-overlay .eph-body{padding:0;border:0;background:none;box-shadow:none;font-size:13px;color:var(--ui-ink)}
      .eph-overlay .eph-body h3{margin:0 0 16px;font-size:19px}
      .eph-overlay .eph-body label{display:block;color:var(--ui-muted);font-size:12px}
      .eph-overlay .eph-body input,.eph-overlay .eph-body textarea{display:block;width:100%;box-sizing:border-box;padding:12px;background:var(--ui-panel);border:1px solid var(--ui-line);color:var(--ui-ink);border-radius:12px;margin:6px 0 14px;font:inherit}
      .eph-overlay .eph-body button{min-height:42px;border:1px solid var(--ui-line);background:var(--ui-raised);color:var(--ui-ink);border-radius:12px;padding:10px 13px}
      .eph-overlay .eph-row{padding:12px 0;border-bottom:1px solid var(--ui-line);display:flex;align-items:center;justify-content:space-between;gap:10px}
      .eph-overlay .eph-muted{color:var(--ui-muted);font-size:11px;line-height:1.5}
      .eph-overlay [data-erischat-profile-controls]{display:grid!important;margin:0!important;border:0!important;background:none!important;padding:0!important}
      .eph-overlay #erisProfileRooms{display:block!important;margin:0}
      .eph-overlay #erisProfileRooms[hidden],.eph-overlay [data-erischat-profile-controls][hidden]{display:none!important}
      @media(max-width:520px){.eph-overlay{padding:12px}.eph-dialog{max-height:90dvh;border-radius:24px}.eph-dialog-head{padding:17px}.eph-dialog-content{padding:16px}}
      .eph-info-form{max-width:640px;margin:auto}.eph-info-summary{display:flex;align-items:center;gap:14px;padding:17px;border:1px solid var(--ui-line);border-radius:20px;background:linear-gradient(125deg,var(--ui-raised),var(--ui-raised))}.eph-info-summary>div{min-width:0}.eph-info-summary b{display:block;font-size:18px;overflow-wrap:anywhere}.eph-info-summary [data-id]{display:block;font-size:11px;color:var(--ui-gold);margin-top:6px}.eph-info-avatar{position:relative;display:grid;place-items:center;width:54px;height:54px;flex:none;border-radius:18px;background:color-mix(in srgb, var(--ui-button) 16%, transparent);color:var(--ui-gold);font-size:22px;overflow:hidden}.eph-info-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.eph-info-intro{font-size:13px;line-height:1.6;color:var(--ui-gold);margin:20px 0}.eph-info-names{display:grid;grid-template-columns:1fr 1fr;gap:12px}.eph-info-form input,.eph-info-form textarea{font-size:16px!important;min-height:48px;border-radius:15px!important;padding:13px!important;resize:vertical;max-width:100%}.eph-info-form label{font-size:12px!important}.eph-info-count{text-align:right;font-size:11px;color:var(--ui-gold);margin-top:-5px}.eph-info-form footer{display:grid;gap:12px;margin-top:22px}.eph-info-form [data-status]{min-height:20px;font-size:12px;line-height:1.5;color:var(--ui-gold);overflow-wrap:anywhere}.eph-info-form [data-save]{width:100%;min-height:48px!important;border:0!important;background:linear-gradient(125deg,var(--ui-primary),var(--ui-danger-bg))!important;font-weight:700;font-size:14px}.eph-info-form [data-save]:disabled{opacity:.45;cursor:default}.eph-info-form :is(input,textarea,button):focus-visible{outline:2px solid var(--ui-line);outline-offset:3px}@media(max-width:360px){.eph-info-names{grid-template-columns:1fr;gap:0}}
      .eph-rename-form{margin:30px auto 0;padding-top:24px;border-top:1px solid var(--ui-line);max-width:640px}.eph-rename-form p{font-size:12px;line-height:1.6;color:var(--ui-gold)}.eph-rename-price{display:flex;justify-content:space-between;gap:10px;padding:13px;margin:16px 0;border:1px solid var(--ui-line);border-radius:14px;font-size:12px;color:var(--ui-ink);background:color-mix(in srgb, var(--ui-button) 3%, transparent)}.eph-rename-price b{color:var(--ui-gold);white-space:nowrap}.eph-rename-form [data-nickname]{font-size:16px;min-height:48px}.eph-rename-consent{display:flex!important;align-items:center;gap:10px;margin:16px 0;line-height:1.6}.eph-rename-consent input{width:20px!important;height:20px;flex:0 0 20px;padding:0!important;margin:0!important;accent-color:var(--ui-gold)}.eph-rename-form [data-rename]{width:100%;min-height:48px;font-size:13px;color:var(--ui-gold);border:1px solid var(--ui-line);background:color-mix(in srgb, var(--ui-button) 10%, transparent)}.eph-rename-form [data-rename]:disabled{opacity:.4}.eph-rename-form [data-rename-status]{min-height:20px;margin:10px 0;font-size:12px;line-height:1.5;color:var(--ui-gold);overflow-wrap:anywhere}

      .eph-my-posts{max-width:640px;margin:auto;min-width:0}.eph-posts-heading{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;margin-bottom:22px}.eph-posts-kicker{font-size:10px;color:var(--ui-gold);letter-spacing:1.7px;font-weight:700}.eph-posts-heading h3{margin:7px 0!important;font-size:23px!important}.eph-posts-heading p{margin:0;max-width:340px;color:var(--ui-gold);font-size:12px;line-height:1.6}.eph-posts-heading [data-create]{min-height:46px;border:0;background:linear-gradient(125deg,var(--ui-primary),var(--ui-danger-bg));font-weight:700;white-space:nowrap}.eph-posts-list{display:grid;gap:16px;min-width:0}.eph-posts-list .ec-social-post{position:relative;min-width:0;padding:16px;border:1px solid var(--ui-line);border-radius:20px;background:var(--ui-panel)}.eph-posts-list .ec-social-avatar{flex:0 0 40px;width:40px;height:40px;padding:0;min-height:40px;border:0}.eph-posts-list .ec-social-author{flex-wrap:wrap}.eph-posts-list .ec-social-author>span:not(.ec-social-menu){flex:1;min-width:0}.eph-posts-list [data-author-name]{min-height:0;padding:0;border:0;background:none;overflow-wrap:anywhere}.eph-posts-list .ec-social-author b{font-size:13px}.eph-posts-list .ec-social-date{font-size:10px;line-height:1.5}.eph-posts-list .ec-social-menu{margin-left:auto}.eph-posts-list .ec-social-menu [data-options-toggle]{width:40px;height:40px;padding:0;font-size:23px}.eph-posts-list .ec-social-menu:has([data-post-options]:not([hidden])){width:100%;display:flex;flex-wrap:wrap;gap:8px}.eph-posts-list [data-post-options]:not([hidden]){position:static!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;padding:12px 0 0;background:none!important;border:0!important}.eph-posts-list [data-post-options] button{position:static!important;display:flex;justify-content:center;align-items:center;gap:6px;width:100%!important;min-height:44px;font-size:11px;padding:9px!important}.eph-posts-list [data-post-options] svg{width:18px;height:18px;flex:none}.eph-posts-list [data-delete]{color:var(--ui-danger);border-color:var(--ui-danger)}.eph-posts-list .ec-social-caption{font-size:14px;line-height:1.6}.eph-posts-list .ec-social-photo,.eph-posts-list .ec-social-video{width:100%;max-height:420px;object-fit:contain;border-radius:14px}.eph-posts-list .ec-post-engagement{flex-wrap:wrap;gap:14px}.eph-posts-list .ec-post-engagement button{padding:7px 0;min-height:40px;background:none;border:0}.eph-posts-list .ec-social-empty{padding:34px 18px;border:1px dashed var(--ui-line);border-radius:20px;background:color-mix(in srgb, var(--ui-button) 3%, transparent)}.eph-posts-list button:focus-visible{outline:2px solid var(--ui-line);outline-offset:3px}.eph-posts-error{display:grid;gap:12px;text-align:center;padding:24px;color:var(--ui-danger)}

.eph-overlay .eph-my-posts .ec-social-post{padding:16px!important;border:1px solid var(--ui-line)!important;border-radius:20px!important;background:var(--ui-panel)!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-author{padding-bottom:0!important;display:flex!important;flex-wrap:wrap!important;gap:10px!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu{max-width:100%;min-width:0;flex-shrink:0;flex-wrap:wrap;gap:8px}
.eph-overlay .eph-my-posts .ec-social-post.ec-post-options-open .ec-social-menu{width:100%!important;flex-basis:100%!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options]:not([hidden]){position:static!important;inset:auto!important;width:100%!important;box-sizing:border-box;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;padding:8px 0!important;border:0!important;background:transparent!important;box-shadow:none!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options] button{position:static!important;width:100%!important;height:auto!important;min-height:46px!important;min-width:0!important;box-sizing:border-box;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:10px!important;font-size:12px!important;line-height:1.4!important;border-radius:12px!important;background:var(--ui-raised)!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options] button span{min-width:0;flex:1;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important}
.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-options-toggle]{width:40px!important;height:40px!important;min-height:40px!important;padding:0!important;flex:none!important}
.eph-overlay .eph-my-posts .ec-social-avatar{flex:0 0 40px!important;width:40px!important;height:40px!important;min-height:40px!important;overflow:hidden!important}
@media(max-width:360px){.eph-overlay .eph-my-posts .ec-social-post .ec-social-menu [data-post-options]:not([hidden]){grid-template-columns:1fr!important}}


.eph-call-history{max-width:640px;margin:auto;min-width:0}.eph-call-history header>span{font-size:10px;letter-spacing:1.7px;color:var(--ui-gold);font-weight:700}.eph-call-history h3{font-size:24px!important;margin:7px 0!important}.eph-call-history header p{font-size:12px;color:var(--ui-gold);line-height:1.7;margin:0 0 20px}.eph-overlay .eph-call-history [data-clear]{min-height:44px;width:100%;font-size:12px;color:var(--ui-ink);border-color:var(--ui-line);background:color-mix(in srgb, var(--ui-danger-bg) 5%, transparent)}.eph-call-history [data-clear-confirm]{padding:16px;border:1px solid var(--ui-line);border-radius:16px;margin-top:12px;background:var(--ui-primary)}.eph-call-history [data-clear-confirm][hidden]{display:none!important}.eph-call-history [data-clear-confirm] p{color:var(--ui-primary-ink);font-size:12px;line-height:1.7;margin:0 0 12px}.eph-call-history [data-clear-confirm]>div{display:grid;grid-template-columns:1fr 1fr;gap:8px}.eph-call-history [data-call-status]{font-size:12px;color:var(--ui-gold);line-height:1.6;margin:12px 0;overflow-wrap:anywhere}.eph-call-history [data-calls]{display:grid;gap:12px}.eph-call-card{display:grid;grid-template-columns:42px minmax(0,1fr);gap:13px;padding:16px;border:1px solid var(--ui-line);border-radius:18px;background:var(--ui-raised);align-items:center}.eph-call-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:color-mix(in srgb, var(--ui-button) 10%, transparent);color:var(--ui-gold);font-size:20px}.eph-overlay .eph-call-card .eph-call-name{min-width:0;min-height:0;padding:0;background:none;border:0;text-align:left;font-size:14px;line-height:1.5;font-weight:700;overflow-wrap:anywhere}.eph-call-card p{color:var(--ui-gold);font-size:11px;line-height:1.6;margin:6px 0}.eph-call-card small{color:var(--ui-gold);font-size:10px;line-height:1.6}.eph-calls-empty{text-align:center;padding:32px 16px;border:1px dashed var(--ui-line);border-radius:18px;color:var(--ui-gold);font-size:13px}.eph-call-history button:disabled{opacity:.45}.eph-call-history button:focus-visible{outline:2px solid var(--ui-line);outline-offset:3px}

</style><div class="eph-nav"><span class="eph-section-label">Profil bölümleri</span><div id="ephTabs" class="eph-tabs" role="tablist" aria-label="Profil bölümleri"></div></div><div class="eph-body" role="tabpanel" aria-live="polite" hidden></div>`;
    view.append(hub);
    const overlay=document.createElement('div');overlay.className='eph-overlay';overlay.hidden=true;
    overlay.innerHTML='<section class="eph-dialog" role="dialog" aria-modal="true" aria-labelledby="ephDialogTitle"><header class="eph-dialog-head"><div><small>LİDYACHAT • PROFİL</small><h2 id="ephDialogTitle">Profil</h2></div><button type="button" class="eph-close" aria-label="Kapat">×</button></header><div class="eph-dialog-content"></div></section>';
    document.body.append(overlay);
    overlay.querySelector('.eph-dialog-content').append(hub.querySelector('.eph-body'));
    const settings=view.querySelector('[data-erischat-profile-controls]');if(settings)overlay.querySelector('.eph-dialog-content').append(settings);
    let lastTrigger=null;const close=()=>{if(overlay.hidden)return;if(window.ErisProfileWorkspace?.canLeave&&!window.ErisProfileWorkspace.canLeave())return;if(window.ErisPrivacyCenter?.canLeave&&!window.ErisPrivacyCenter.canLeave())return;overlay.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview',true);if(lastTrigger?.isConnected)lastTrigger.focus()};
    overlay.querySelector('.eph-close').onclick=close;
    overlay.onclick=e=>{if(e.target===overlay)close()};
    overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Tab'){const focusables=Array.from(overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]'));const first=focusables[0],last=focusables[focusables.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
    const tabs = [['info','Bilgilerim'],['posts','Gönderilerim'],['fan-ranking','Hayran sıralamam'],['game-ranking','Oyun sıralaması'],['collection','Koleksiyon'],['tasks','Görevler'],['vip','VIP'],['topup','Lidya Yükleme'],['calls','Arama geçmişleri'],['notifications','Bildirimler'],['privacy','Gizlilik'],['blocked','Engellenenler'],['rooms','Odalarım'],['suggestion','Gelişim Fikri'],['settings','Ayarlar']];
    const strip = hub.querySelector('.eph-tabs');
    const icons={info:'profile',posts:'posts',social:'family','fan-ranking':'family',tasks:'posts',collection:'collection',vip:'vip',calls:'bell',gifts:'gifts',notifications:'bell',privacy:'privacy',blocked:'blocked',rooms:'discover',suggestion:'posts',settings:'security'};
    for (const [key,label] of tabs) {
      const button = document.createElement('button');button.type='button';button.role='tab';button.dataset.tab=key;button.innerHTML=(key==='game-ranking'?'<img class="eph-icon pp-icon" src="./assets/lidya-wheel/leaderboard-v1.png" alt="">':key==='topup'?'<img class="eph-icon" src="./lidya-coin.png" alt="">':'<svg class="eph-icon" aria-hidden="true"><use href="#home-'+icons[key]+'"></use></svg>')+'<span>'+escape(label)+'</span>';
      button.onclick=()=>{if(key==='game-ranking'){window.LidyaGameRanking?.open();return}if(key==='vip'){window.ErisChatVIP?.open?.();return}if(key==='topup'){window.ErisPurchases?.open?.();return}if(key==='suggestion'){window.ErisSuggestions?.open?.();return}if(key==='fan-ranking'){window.ErisPlatform.getMe().then(me=>window.ErisPersonalFanRanking?.(me.id)).catch(e=>window.toast?.(e.message));return}lastTrigger=button;show(key)};strip.append(button);
    }
    show('overview');
  }
  let requestIndex=0;
  async function show(key,force=false) {
    if(!force&&window.ErisProfileWorkspace?.canLeave&&!window.ErisProfileWorkspace.canLeave())return;
    if(!force&&window.ErisPrivacyCenter?.canLeave&&!window.ErisPrivacyCenter.canLeave())return;
    window.ErisProfileWorkspace?.reset();window.ErisPrivacyCenter?.reset();
    const hub=panel();if(!hub)return;
    const index=++requestIndex,session=sessionToken(),isCurrent=()=>index===requestIndex&&session===sessionToken(), overlay=document.querySelector('.eph-overlay'),body=overlay.querySelector('.eph-body');
    window.ErisSocialFeed?.release?.(body);
    body.classList.remove('epv','en-center','epl','eps');
    const labels={info:'Bilgilerim',posts:'Gönderilerim',social:'Takip ve hayranlar',tasks:'Görevler',collection:'Koleksiyon',vip:'VIP',calls:'Arama geçmişleri',gifts:'Hediyeler',notifications:'Bildirimler',privacy:'Gizlilik',blocked:'Engellenenler',rooms:'Odalarım',settings:'Ayarlar'};
    hub.closest('#profile')?.setAttribute('data-profile-section',key);
    hub.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===key)));
    body.hidden=key==='overview';
    const settings=overlay.querySelector('[data-erischat-profile-controls]');if(settings)settings.hidden=true;
    const rooms=overlay.querySelector('#erisProfileRooms');if(rooms)rooms.hidden=key!=='rooms';
    if(key==='overview'){window.ErisSocialFeed?.release?.(body);body.replaceChildren();return;}
    overlay.hidden=false;document.body.classList.add('eph-dialog-open');overlay.querySelector('#ephDialogTitle').textContent=labels[key];overlay.querySelector('.eph-close').focus();
    if(key==='settings'){await window.ErisSettings.render(body,isCurrent);return;}
    if(key==='rooms'){await window.ErisProfileLists.rooms(body,isCurrent);return}
    body.textContent='Yükleniyor…';
    try {
      const me=await window.ErisAuth.getMe();if(!isCurrent())return;
      if(key==='calls'){await renderCalls(body,isCurrent);return;}
      if(key==='info'&&window.ErisProfileWorkspace){await window.ErisProfileWorkspace.info(body,me,isCurrent);return;}
      if(key==='posts'&&window.ErisProfileWorkspace){await window.ErisProfileWorkspace.posts(body,me,isCurrent);return;}
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
            if(!isCurrent())return;
            if(!updated)throw new Error('Profil kaydedilemedi. Tekrar dene.');
            original=JSON.stringify(submitted);status.textContent='Değişikliklerin kaydedildi.';
          }catch(error){if(isCurrent())status.textContent=error.message||'Profil kaydedilemedi.'}
          finally{saving=false;if(isCurrent())refresh()}
        };
        if(me.management_locked){for(const el of form.querySelectorAll('input,textarea,button'))el.disabled=true;status.textContent='Yönetim kimliği sabittir: LidyaChat Yönetim, LidyaChat logosu ve yönetim çerçevesi kullanılır.';return;}
        const rename=document.createElement('form');rename.className='eph-rename-form';
        rename.innerHTML='<h3>Kullanıcı adını değiştir</h3><p>Yeni kullanıcı adın profilinde ve sohbetlerde görünür. Uygulama markasına ayrılmış adlar kullanılamaz.</p><div class="eph-rename-price">Değişiklik ücreti <b>150 Lidya</b></div><label>Yeni kullanıcı adı<input data-nickname maxlength="32" autocomplete="nickname" required></label><label class="eph-rename-consent"><input type="checkbox" data-consent required><span>Değişiklik için 150 Lidya ödemeyi onaylıyorum.</span></label><button type="submit" data-rename>Kullanıcı adını değiştir · 150 Lidya</button><div data-rename-status role="status" aria-live="polite"></div>';
        body.append(rename);const nickname=rename.querySelector('[data-nickname]'),renameButton=rename.querySelector('[data-rename]'),renameStatus=rename.querySelector('[data-rename-status]');
        let currentName=me.nickname||'',renaming=false;nickname.value=currentName;
        const refreshRename=()=>{renameButton.disabled=renaming||!nickname.value.trim()||nickname.value.trim()===currentName||!rename.querySelector('[data-consent]').checked};
        rename.addEventListener('input',()=>{renameStatus.textContent='';refreshRename()});refreshRename();
        rename.onsubmit=async event=>{
          event.preventDefault();if(renaming||renameButton.disabled||!rename.reportValidity())return;
          renaming=true;refreshRename();renameStatus.textContent='Kullanıcı adın değiştiriliyor…';
          try{
            const updated=await api('/me/nickname',{method:'POST',body:JSON.stringify({nickname:nickname.value.trim()})});
            if(!isCurrent())return;
            window.dispatchEvent(new CustomEvent('erischat:profile',{detail:updated}));
            window.ErisProfile?.refresh?.();
            if(!isCurrent())return;
            currentName=updated.nickname;nickname.value=currentName;form.querySelector('[data-name]').textContent=currentName;
            rename.querySelector('[data-consent]').checked=false;renameStatus.textContent='Kullanıcı adın değiştirildi. Ücret: 150 Lidya.';
          }catch(error){if(isCurrent())renameStatus.textContent=error.message||'Kullanıcı adı değiştirilemedi.'}
          finally{renaming=false;if(isCurrent())refreshRename()}
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
        const [followers,following,fans]=await Promise.all([api('/users/'+encodeURIComponent(me.id)+'/followers'),api('/users/'+encodeURIComponent(me.id)+'/following'),api('/users/'+encodeURIComponent(me.id)+'/fans')]);if(!isCurrent())return;
        body.innerHTML='<h3>Takip ve hayranlar</h3><div class="eph-row"><span>Takipçi</span><b data-followers></b></div><div class="eph-row"><span>Takip edilen</span><b data-following></b></div><div class="eph-row"><span>Hayran seviyesi</span><b data-level></b></div><div class="eph-muted" data-list></div>';
        body.querySelector('[data-followers]').textContent=String(followers.length);body.querySelector('[data-following]').textContent=String(following.length);body.querySelector('[data-level]').textContent=String(fans.level||0);
        const list=body.querySelector('[data-list]');list.textContent='Takip ettiklerin: ';
        if(!following.length) list.append('Henüz kimseyi takip etmiyorsun.');
        for(const row of following){const button=document.createElement('button');button.type='button';button.textContent=row.user_id;button.onclick=()=>{window.ErisProfileHub.close();window.openUserProfile?.(row.user_id)};list.append(button)}return;
      }
      if(key==='tasks'){await window.ErisAppearanceTasks.render(body,isCurrent);return;}
      if(key==='collection') {await window.ErisAppearanceInventory.render(body,isCurrent);return;}
      if(key==='vip') {
        window.ErisProfileHub.close();
        window.ErisChatVIP?.open?.();
        return;
      }
      if(key==='notifications') {
        await window.ErisNotifications.render(body,isCurrent);return;
      }
      if(key==='privacy') {
        await window.ErisPrivacy.render(body,isCurrent);return;
      }
      if(key==='blocked') {
        await window.ErisProfileLists.blocked(body,isCurrent);return;
      }
    }catch(error){if(isCurrent())body.textContent=error.message||'Profil bilgileri yüklenemedi.'}
  }
  window.ErisProfileHub={show,close:()=>document.querySelector('.eph-close')?.click(),reset:()=>{window.ErisProfileWorkspace?.reset();const dialog=document.querySelector('.eph-overlay');if(dialog)dialog.hidden=true;document.body.classList.remove('eph-dialog-open');show('overview',true)}};
  let profileSession=sessionToken(),profileAccount=window.ErisAuth?.user?.id;
  const accountChanged=event=>{const next=sessionToken(),uid=event.detail?.user?.id;if(next!==profileSession||uid&&profileAccount&&String(uid)!==String(profileAccount)||event.detail?.state==='logged_out'){profileSession=next;profileAccount=uid;window.ErisProfileHub.reset();}else if(uid)profileAccount=uid;};
  for(const type of ['erischat:auth','erischat:auth-state','erischat:auth-ready','erischat:auth-state-changed'])window.addEventListener(type,accountChanged);
  window.addEventListener('storage',event=>{if(['erischat_access_token','erischat.accessToken.v1','token',null].includes(event.key))accountChanged(event);});
  const start=()=>{mount();window.addEventListener('erischat:auth',event=>{if(event.detail?.state==='ready' && panel()?.closest('#profile')?.dataset.profileSection==='info')show('info')})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
