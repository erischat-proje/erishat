/* ErisChat Family V2 - progressive enhancement of the existing backend-backed family UI */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rules = [0,40000,100000,200000,350000,610000,890000,1130000,1500000,2000000,2600000,3200000];
  const num = n => Number(n||0).toLocaleString('tr-TR');
  const api = p => window.ErisPlatform?.api(p) ?? Promise.reject(new Error('API bağlantısı bulunamadı'));
  async function enhance(shell,f,members,role,apiClient,refreshFamily){
    const request=typeof apiClient==='function'?apiClient:api;
    if (!shell || !f || shell.dataset.familyV2==='ready') return;
    shell.dataset.familyV2='ready';
    shell.classList.add('ef2');
    const hero=shell.querySelector('.eh-family-hero');
    const actions=shell.querySelector('.eh-family-actions');
    const staff=shell.querySelector('.eh-family-section-title');
    const strip=shell.querySelector('.eh-family-member-strip');
    const output=shell.querySelector('[data-family-panel]');
    if(!hero||!actions||!output)return;
    const header=document.createElement('div');header.className='ef2-intro';
    header.innerHTML='<span class="ef2-kicker">LİDYACHAT · LİDYA AİLELERİ</span><h2>Aile merkezim</h2><p>Birlikte büyü, aile seviyeni yükselt ve üyelerini yönet.</p>';
    shell.prepend(header);
    const stats=document.createElement('div');stats.className='ef2-stats';
    stats.innerHTML='<div><small>AİLE SEVİYESİ</small><strong>'+num(f.level)+'/12</strong></div><div><small>ÜYELER</small><strong>'+num(f.member_count)+'/'+num(f.capacity)+'</strong></div><div><small>SIRALAMA</small><strong>#'+num(f.rank)+'</strong></div><div><small>AİLE DENEYİMİ</small><strong>'+num(f.balance)+'</strong></div>';
    hero.after(stats);
    const nav=document.createElement('nav');nav.className='ef2-tabs';nav.setAttribute('aria-label','Aile bölümleri');
    const sections=document.createElement('div');sections.className='ef2-sections';
    const tabs=[['home','Ana sayfa'],['members','Üyeler'],['levels','Seviyeler'],['rank','Sıralama'],['activity','Katkılar'],['manage','İşlemler']];
    for(const [id,label] of tabs){const b=document.createElement('button');b.type='button';b.dataset.ef2Tab=id;b.textContent=label;nav.append(b);const page=document.createElement('section');page.dataset.ef2Page=id;page.hidden=true;sections.append(page)}
    stats.after(nav,sections);
    const page=id=>sections.querySelector('[data-ef2-page="'+id+'"]');
    const home=page('home'),membersPage=page('members'),levels=page('levels'),ranking=page('rank'),activity=page('activity'),manage=page('manage');
    const feedPanel=document.createElement('div');
    feedPanel.className='ef4-feed-panel';
    feedPanel.innerHTML=`
      <div class="ef4-feed-header">
        <div>
          <h3>Aile gönderileri</h3>
          <small>Ailenden en yeni paylaşımlar</small>
        </div>
        <button type="button" data-family-refresh
          aria-label="Akışı yenile">↻</button>
        <button type="button" data-family-compose>
          + Paylaş
        </button>
      </div>
      <div class="ef4-feed-list" data-family-feed></div>
      <div class="ef4-feed-footer">
        <button type="button" data-family-more hidden>
          Devamını yükle
        </button>
      </div>`;
    home.append(feedPanel);

    const feedList=feedPanel.querySelector('[data-family-feed]');
    const more=feedPanel.querySelector('[data-family-more]');
    const refresh=feedPanel.querySelector('[data-family-refresh]');
    const compose=feedPanel.querySelector('[data-family-compose]');
    let familyCursor=null;
    let familyLoading=false;
    const familyToken=()=>window.ErisPlatform?.getAccessToken?.()
      ||localStorage.getItem('erischat_access_token')
      ||localStorage.getItem('token')||'';

    const familySession=familyToken();
    const familyValid=()=>Boolean(
      familySession &&
      familyToken()===familySession &&
      feedList.isConnected
    );

    const familyHeader=shell.closest('#erisHub')?.querySelector('.eh-head');

    if(familyHeader){
      const syncHeader=()=>{
        const height=familyHeader.getBoundingClientRect().height;
        if(height>0){
          shell.style.setProperty('--ef4-header-height',height+'px');
        }
      };

      syncHeader();

      if('ResizeObserver' in window){
        const headerObserver=new ResizeObserver(()=>{
          if(!shell.isConnected){
            headerObserver.disconnect();
            return;
          }
          syncHeader();
        });

        headerObserver.observe(familyHeader);
        feedList._familyHeaderObserver=headerObserver;
      }
    }

    const authEvents=[
      'erischat:auth',
      'erischat:auth-state',
      'erischat:auth-ready',
      'erischat:auth-state-changed',
      'storage'
    ];

    const disposeFamily=()=>{
      feedList._familyPaginationObserver?.disconnect();
      feedList._familyHeaderObserver?.disconnect();
      window.ErisSocialFeed?.release?.(feedList);

      authEvents.forEach(event=>{
        window.removeEventListener(event,checkFamilySession);
      });

      clearInterval(familySessionTimer);
      feedList._familyRefresh=null;
    };

    function checkFamilySession(){
      if(familyValid())return;

      disposeFamily();
      feedList.replaceChildren();

      if(shell.isConnected){
        shell.replaceChildren();
        shell.textContent='Aile bilgileri için yeniden giriş yap.';
      }
    }

    const familySessionTimer=setInterval(
      checkFamilySession,1000
    );

    authEvents.forEach(event=>{
      window.addEventListener(event,checkFamilySession);
    });

    feedList._familyDispose=disposeFamily;

    let familyLoaded=false;
    let familyAutoLoad=true;

    const familySeen=new Set();

    async function loadFamilyFeed(append=false){
      if(!familyValid()){
        window.ErisSocialFeed?.release?.(feedList);
        feedList.replaceChildren();
        return;
      }
      if(familyLoading)return;
      const social=window.ErisSocialFeed;
      if(!social?.renderFamilyRows){
        feedList.textContent='Gönderi sistemi henüz hazır değil.';
        return;
      }

      familyLoading=true;
      refresh.disabled=true;
      more.disabled=true;
      feedList.setAttribute('aria-busy','true');

      if(!append){
        familyCursor=null;
        familyAutoLoad=true;
        familySeen.clear();
        social.release?.(feedList);
        feedList.textContent='Aile gönderileri yükleniyor…';
        more.hidden=true;
      }

      try{
        const params=new URLSearchParams({limit:'20'});
        if(append&&familyCursor){
          params.set('cursor',familyCursor);
        }

        const data=await request(
          '/families/'+encodeURIComponent(f.id)+'/feed?'+params
        );

        if(!familyValid()){
          social.release?.(feedList);
          feedList.replaceChildren();
          return;
        }

        const rows=(data.items||[]).filter(post=>{
          if(familySeen.has(post.id))return false;
          familySeen.add(post.id);
          return true;
        });

        await social.renderFamilyRows(feedList,rows,append);
        if(!familyValid()){
          social.release?.(feedList);
          feedList.replaceChildren();
          return;
        }

        familyCursor=data.next_cursor||null;
        familyLoaded=true;
        more.hidden=!data.has_more||!familyCursor;
        more.textContent='Devamını yükle';

        if(!feedList.querySelector('article')){
          feedList.textContent='Henüz aile gönderisi bulunmuyor.';
        }

        more.onclick=()=>loadFamilyFeed(true);

      }catch(error){
        familyAutoLoad=false;
        if(!familyValid()){
          social.release?.(feedList);
          feedList.replaceChildren();
          return;
        }
        if(!append){
          feedList.textContent='Aile gönderileri yüklenemedi.';
        }
        more.hidden=false;
        more.textContent='Tekrar dene';
        more.onclick=()=>loadFamilyFeed(append);
      }finally{
        familyLoading=false;
        refresh.disabled=false;
        more.disabled=false;
        feedList.setAttribute('aria-busy','false');
      }
    }

    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(entries=>{
        if(!familyValid()){
          observer.disconnect();
          return;
        }
        if(entries.some(entry=>entry.isIntersecting)
          &&familyLoaded
          &&familyAutoLoad
          &&familyCursor
          &&!familyLoading
          &&!more.hidden
          &&more.getClientRects().length){
          loadFamilyFeed(true);
        }
      },{rootMargin:'160px'});

      observer.observe(more);
      feedList._familyPaginationObserver=observer;
    }

    feedList._familyRefresh=()=>{
      if(familyValid())return loadFamilyFeed();
    };

    refresh.onclick=()=>loadFamilyFeed();
    compose.onclick=()=>{
      window.ErisSocialFeed?.compose?.(
        null,false,()=>loadFamilyFeed(),f.id
      );
    };

    if(staff&&strip){const title=document.createElement('h3');title.textContent='Aile yetkilileri';membersPage.append(title,strip);staff.remove()}
    const memberButton=actions.querySelector('[data-action="members"]');
    const memberPanel=document.createElement('div');
    memberPanel.className='ef2-panel ef2-member-list';
    membersPage.append(memberPanel);

    if(memberButton){
      const previousNodes=new Set(output.childNodes);
      memberButton.click();
      const memberNodes=Array.from(output.childNodes)
        .filter(node=>!previousNodes.has(node));
      memberPanel.append(...memberNodes);
    }

    const levelTitle=document.createElement('div');levelTitle.className='ef2-panel';levelTitle.innerHTML='<h3>12 seviyelik aile yolculuğu</h3><p>Her seviyede daha fazla üye kapasitesi açılır. Deneyim eşikleri mevcut aile sistemiyle aynıdır.</p>';levels.append(levelTitle);
    rules.forEach((required,i)=>{const level=i+1;const card=document.createElement('article');card.className='ef2-level'+(level===Number(f.level)?' current':'')+(level<Number(f.level)?' achieved':'');card.innerHTML='<span class="ef2-medal">'+level+'</span><div><b>Seviye '+level+'</b><small>'+num(required)+' aile deneyimi</small></div><span class="ef2-capacity">'+(30+i*10)+' üye</span>';levels.append(card)});
    const rankTitle=document.createElement('div');rankTitle.className='ef2-panel';rankTitle.innerHTML='<h3>Aile sıralaması</h3><p>Gerçek aile deneyimi puanlarına göre sıralanır.</p>';ranking.append(rankTitle);
    const rankList=document.createElement('div');rankList.className='ef2-rank-list';rankList.textContent='Sıralama yükleniyor…';ranking.append(rankList);
    let loaded=false;
    async function loadRank(){if(loaded)return;loaded=true;try{const rows=await request('/families/discover?limit=50');rankList.replaceChildren();rows.forEach((item,index)=>{const row=document.createElement('div');row.className='ef2-rank';row.innerHTML='<strong>#'+(index+1)+'</strong><span>'+esc(item.name)+'</span><small>Sv. '+num(item.level)+' · '+num(item.balance)+' XP</small>';rankList.append(row)});if(!rows.length)rankList.textContent='Henüz aile bulunmuyor.'}catch(e){rankList.textContent='Sıralama alınamadı: '+e.message;loaded=false}}
    const manageInfo=document.createElement('div');manageInfo.className='ef2-panel';manageInfo.innerHTML='<h3>Aile işlemleri</h3><p>'+(role==='owner'?'Kurucu olarak aileyi ve yetkileri yönetebilirsin.':role==='admin'?'Aile yetkilisi olarak davet ve başvuruları yönetebilirsin.':'Aile sohbetine katılabilir, katkı yapabilir ve üyeleri görebilirsin.')+'</p>';manage.append(manageInfo,actions);
    const results=document.createElement('div');results.className='ef2-results';manage.append(results);
    // The original button handlers update [data-family-panel]. Keep that exact node and its event handlers.
    manage.append(output);
    for(const button of actions.querySelectorAll('button[data-action]')){
      const name=button.dataset.action;
      const text={members:'Üyeler',chat:'Aile sohbeti',invite:'Üye davet et',applications:'Başvurular',manage:'Aileyi yönet',donate:'Aileye katkı',leave:'Aileden ayrıl',close:'Aileyi kapat'}[name];
      if(text)button.textContent=text;
      button.classList.add('ef2-action','ef2-'+name);
      if(name==='members')button.style.display='none';
    }
    // FAMILY OPERATIONS PREMIUM V4
    actions.classList.add('ef4-operations');

    const operationMeta={
      chat:['message-circle','Aile sohbeti','Aile üyeleriyle iletişim kur'],
      invite:['user-plus','Üye davet et','Ailene yeni üyeler kazandır'],
      applications:['clipboard-list','Üyelik başvuruları','Gelen başvuruları değerlendir'],
      manage:['shield','Aile yönetimi','Üyeleri ve yetkileri yönet'],
      donate:['coins','Aileye katkı yap','Aile deneyimini yükselt'],
      leave:['log-out','Aileden ayrıl','Aile üyeliğini sonlandır'],
      close:['trash','Aileyi kapat','Aileyi kalıcı olarak kapat']
    };

    const operationIcons={
      'message-circle':'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
      'user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6m-3-3h6"/>',
      'clipboard-list':'<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6m-6 4h6m-6 4h4"/>',
      shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',
      coins:'<circle cx="9" cy="9" r="6"/><path d="M15 9a6 6 0 1 1-6 6"/><path d="M9 6v6m-2-3h4"/>',
      'log-out':'<path d="M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
      trash:'<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'
    };

    for(const button of actions.querySelectorAll('button[data-action]')){
      const key=button.dataset.action;
      const meta=operationMeta[key];
      if(!meta)continue;

      const [icon,label,description]=meta;
      const critical=key==='leave'||key==='close';

      button.classList.add('ef4-operation-card');
      button.classList.toggle('ef4-critical',critical);

      const symbol=document.createElement('span');
      symbol.className='ef4-operation-icon';
      symbol.setAttribute('aria-hidden','true');
      symbol.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+operationIcons[icon]+'</svg>';

      const info=document.createElement('span');
      info.className='ef4-operation-info';

      const title=document.createElement('strong');
      title.textContent=label;

      const detail=document.createElement('small');
      detail.textContent=description;
      info.append(title,detail);

      const arrow=document.createElement('span');
      arrow.className='ef4-operation-arrow';
      arrow.textContent='›';
      arrow.setAttribute('aria-hidden','true');

      button.replaceChildren(symbol,info,arrow);
    }

    const avatar=shell.querySelector('[data-action="family-avatar"]');if(avatar){avatar.classList.add('ef2-avatar-btn');hero.append(avatar)}
    function activate(id){
      if(id!=='home'){
        feedList.querySelectorAll('video')
          .forEach(video=>video.pause());
      }
nav.querySelectorAll('button').forEach(b=>{const active=b.dataset.ef2Tab===id;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});sections.querySelectorAll('[data-ef2-page]').forEach(el=>el.hidden=el.dataset.ef2Page!==id);if(id==='rank')loadRank();if(id==='activity')loadActivity()}
    nav.addEventListener('click',e=>{const b=e.target.closest('button[data-ef2-tab]');if(b)activate(b.dataset.ef2Tab)});
    activate('home');
    loadFamilyFeed();
    // FAMILY CONTRIBUTION PREMIUM V3
    const activityBody=document.createElement('div');
    activityBody.className='ef2-activity ef3-contribution';
    activity.append(activityBody);

    let activityLoaded=false;
    let contributionPeriod='all';
    let contributionPage=1;
    let contributionRequest=0;

    const element=(tag,cls,value)=>{
      const el=document.createElement(tag);
      if(cls)el.className=cls;
      if(value!==undefined)el.textContent=value;
      return el;
    };

    const legacyDonate=actions.querySelector('[data-action="donate"]');
    if(legacyDonate){
      legacyDonate.onclick=()=>openContribution();
    }

    // FAMILY OPERATIONS REFRESH V4
    const operationsToken=familyToken();

    const operationsValid=()=>shell.isConnected&&
      familyToken()===operationsToken;

    async function refreshOperations(){
      if(!operationsValid())return;

      if(typeof refreshFamily==='function'){
        try{
          await refreshFamily();
        }catch(err){
          window.toast?.(
            'İşlem tamamlandı. Aile ekranını yeniden açın.'
          );
        }
      }
    }

    // FAMILY INVITATION PREMIUM V4
    let invitationBusy=false;

    const inviteButton=actions.querySelector('[data-action="invite"]');

    if(inviteButton){
      inviteButton.onclick=()=>{
        if(invitationBusy||
          shell.querySelector('.ef4-invite-mask'))return;

        const mask=element('div',
          'ef3-donate-mask ef4-invite-mask');
        const card=element('div','ef3-donate-card');
        card.setAttribute('role','dialog');
        card.setAttribute('aria-modal','true');
        card.setAttribute('aria-label','Üye davet et');

        const head=element('div','ef3-donate-head');
        const close=element('button','','×');
        close.type='button';
        close.setAttribute('aria-label','Kapat');
        close.onclick=()=>{
          if(!invitationBusy)mask.remove();
        };

        head.append(element('h3','','Üye davet et'),close);

        const body=element('div','ef3-donate-body');
        const capacity=element('div','ef3-donate-wallet');

        capacity.append(
          element('small','','AİLE KAPASİTESİ'),
          element('strong','',
            num(f.member_count)+' / '+num(f.capacity)),
          element('small','',
            num(Math.max(0,Number(f.capacity)-
              Number(f.member_count)))+' boş üyelik')
        );

        const form=element('form','ef4-invite-form');
        const label=element('label','','Kullanıcı profil ID');
        const input=element('input','ef3-donate-input');

        input.id='ef4-invite-user-id';
        label.htmlFor=input.id;
        input.type='text';
        input.required=true;
        input.maxLength=128;
        input.autocomplete='off';
        input.spellcheck=false;
        input.placeholder='Profil ID giriniz';

        const note=element('p','ef4-invite-note',
          'Davet edilen kullanıcıya bildirim gönderilir. Davet 7 gün boyunca geçerlidir.');

        const status=element('p','ef4-invite-status');
        status.setAttribute('aria-live','polite');

        const controls=element('div','ef3-donate-controls');
        const cancel=element('button','','İptal');
        const submit=element('button','ef3-approve','Davet gönder');

        cancel.type='button';
        submit.type='submit';
        cancel.onclick=close.onclick;
        submit.disabled=true;

        input.oninput=()=>{
          submit.disabled=!input.value.trim()||invitationBusy;
          status.textContent='';
        };

        form.onsubmit=async e=>{
          e.preventDefault();

          const uid=input.value.trim();
          if(!uid||invitationBusy||!operationsValid()||!mask.isConnected)return;

          invitationBusy=true;
          input.disabled=true;
          submit.disabled=true;
          cancel.disabled=true;
          close.disabled=true;
          submit.textContent='Gönderiliyor…';
          status.textContent='';

          try{
            await request(
              '/families/'+encodeURIComponent(f.id)+'/members',
              {method:'POST',body:JSON.stringify({user_id:uid})}
            );

            if(!mask.isConnected||!operationsValid())return;

            body.replaceChildren();

            const success=element('div','ef4-invite-success');
            success.append(
              element('span','','✓'),
              element('h3','','Davet gönderildi'),
              element('p','',
                'Kullanıcının daveti kabul etmesi bekleniyor.')
            );

            const done=element('button',
              'ef3-donate-button','Tamam');
            done.type='button';
            done.onclick=()=>mask.remove();

            body.append(success,done);

          }catch(err){
            status.textContent=String(
              err?.message||'Davet gönderilemedi.'
            );
            input.disabled=false;
            submit.disabled=false;
            submit.textContent='Davet gönder';
            cancel.disabled=false;
          }finally{
            invitationBusy=false;
            close.disabled=false;
          }
        };

        controls.append(cancel,submit);
        form.append(label,input,note,status,controls);
        body.append(capacity,form);
        card.append(head,body);
        mask.append(card);
        shell.append(mask);
      };
    }

    // FAMILY APPLICATIONS PREMIUM V4
    let applicationBusy=false;

    const applicationButton=actions.querySelector(
      '[data-action="applications"]'
    );

    if(applicationButton){
      applicationButton.onclick=()=>{
        if(applicationBusy||
          shell.querySelector('.ef4-application-mask'))return;

        const mask=element('div',
          'ef3-donate-mask ef4-application-mask');
        const card=element('div','ef3-donate-card');
        card.setAttribute('role','dialog');
        card.setAttribute('aria-modal','true');
        card.setAttribute('aria-label','Üyelik başvuruları');

        const head=element('div','ef3-donate-head');
        const close=element('button','','×');
        close.type='button';
        close.setAttribute('aria-label','Kapat');
        close.onclick=()=>{
          if(!applicationBusy)mask.remove();
        };

        head.append(
          element('h3','','Üyelik başvuruları'),close
        );

        const body=element('div','ef3-donate-body');
        const status=element('p','ef4-invite-status');
        status.setAttribute('aria-live','polite');

        card.append(head,status,body);
        mask.append(card);
        shell.append(mask);

        const base='/families/'+
          encodeURIComponent(f.id)+'/applications';

        async function loadApplications(){
          body.replaceChildren(
            element('p','','Başvurular yükleniyor…')
          );

          try{
            const rows=await request(base);
            if(!mask.isConnected||!operationsValid())return;
            if(!Array.isArray(rows)){
              throw Error('Başvuru listesi alınamadı.');
            }

            body.replaceChildren();

            const summary=element('div','ef3-donate-wallet');
            summary.append(
              element('small','','BEKLEYEN BAŞVURULAR'),
              element('strong','',num(rows.length))
            );
            body.append(summary);

            if(!rows.length){
              const empty=element('div','ef4-application-empty');
              empty.append(
                element('span','','✓'),
                element('h3','','Bekleyen başvuru yok'),
                element('p','','Yeni başvurular burada görünecek.')
              );
              body.append(empty);
            }

            for(const item of rows){
              const row=element('div','ef4-application-card');
              const person=element('div','ef4-application-person');
              const avatar=element('span','ef4-application-avatar','👤');
              const info=element('div','ef3-person');

              const name=item.nickname||'Kullanıcı';
              info.append(element('strong','',name));

              if(item.created_at){
                const date=new Date(item.created_at);
                if(!Number.isNaN(date.getTime())){
                  info.append(element('small','',
                    date.toLocaleString('tr-TR')));
                }
              }

              person.append(avatar,info);

              const message=element('p','ef4-application-message',
                item.message||'Başvuru mesajı yok.');

              const controls=element('div','ef4-application-controls');
              const reject=element('button','ef4-reject','✕ Reddet');
              const accept=element('button','ef3-approve','✓ Kabul et');

              reject.type=accept.type='button';

              function confirmDecision(decision){
                if(applicationBusy||!operationsValid()||!mask.isConnected||
                  row.querySelector('.ef4-decision'))return;

                const confirmation=element('div','ef4-decision');
                const accepting=decision==='accept';

                confirmation.append(
                  element('strong','',accepting?
                    'Başvuruyu kabul et':'Başvuruyu reddet'),
                  element('p','',name+(accepting?
                    ' adlı kullanıcı aileye katılacak.':
                    ' adlı kullanıcının başvurusu reddedilecek.'))
                );

                const buttons=element('div','ef3-donate-controls');
                const cancel=element('button','','Vazgeç');
                const approve=element('button',
                  accepting?'ef3-approve':'ef4-reject',
                  'Onayla');

                cancel.type=approve.type='button';
                controls.hidden=true;

                cancel.onclick=()=>{
                  confirmation.remove();
                  controls.hidden=false;
                };

                approve.onclick=async()=>{
                  if(applicationBusy||!operationsValid()||!mask.isConnected)return;

                  applicationBusy=true;
                  status.textContent='';
                  const locked=Array.from(card.querySelectorAll('button'))
                    .filter(b=>!b.disabled);

                  locked.forEach(b=>b.disabled=true);
                  approve.textContent='İşleniyor…';

                  try{
                    await request(
                      base+'/'+encodeURIComponent(item.id)+
                      '/'+decision,
                      {method:'POST'}
                    );

                    status.textContent=accepting?
                      '✓ Başvuru kabul edildi.':
                      '✓ Başvuru reddedildi.';

                    if(accepting){
                      await refreshOperations();
                      return;
                    }
                    await loadApplications();

                  }catch(err){
                    status.textContent=String(
                      err?.message||'İşlem tamamlanamadı.'
                    );
                    confirmation.remove();
                    controls.hidden=false;
                  }finally{
                    applicationBusy=false;
                    locked.forEach(b=>b.disabled=false);
                  }
                };

                buttons.append(cancel,approve);
                confirmation.append(buttons);
                row.append(confirmation);
              }

              accept.onclick=()=>confirmDecision('accept');
              reject.onclick=()=>confirmDecision('reject');

              controls.append(reject,accept);
              row.append(person,message,controls);
              body.append(row);
            }

          }catch(err){
            body.replaceChildren(
              element('p','',String(
                err?.message||'Başvurular alınamadı.'
              ))
            );
          }

          const refresh=element('button',
            'ef3-donate-button','Listeyi yenile');
          refresh.type='button';
          refresh.onclick=async()=>{
            if(applicationBusy||!operationsValid()||!mask.isConnected)return;
            applicationBusy=true;
            close.disabled=true;
            try{
              await loadApplications();
            }finally{
              applicationBusy=false;
              close.disabled=false;
            }
          };
          body.append(refresh);
        }

        loadApplications();
      };
    }

    // FAMILY MANAGEMENT PREMIUM V4
    let managementBusy=false;

    const managementButton=actions.querySelector(
      '[data-action="manage"]'
    );

    if(managementButton){
      const legacyManagement=managementButton.onclick;

      managementButton.onclick=()=>{
        if(managementBusy||
          shell.querySelector('.ef4-management-mask'))return;

        if(role!=='owner'&&role!=='admin')return;

        const mask=element('div',
          'ef3-donate-mask ef4-management-mask');
        const card=element('div','ef3-donate-card');
        card.setAttribute('role','dialog');
        card.setAttribute('aria-modal','true');
        card.setAttribute('aria-label','Aile yönetimi');

        const head=element('div','ef3-donate-head');
        const close=element('button','','×');
        close.type='button';
        close.setAttribute('aria-label','Kapat');
        close.onclick=()=>{
          if(!managementBusy)mask.remove();
        };

        head.append(element('h3','','Aile yönetimi'),close);

        const body=element('div','ef3-donate-body');
        const status=element('p','ef4-invite-status');
        status.setAttribute('aria-live','polite');

        card.append(head,status,body);
        mask.append(card);
        shell.append(mask);

        const base='/families/'+encodeURIComponent(f.id);
        const initialToken=familyToken();

        const valid=()=>mask.isConnected&&
          shell.isConnected&&familyToken()===initialToken;

        async function loadManagement(){
          body.replaceChildren(
            element('p','','Üyeler yükleniyor…')
          );

          try{
            const roster=await request(base+'/members');

            if(!valid())return;
            if(!Array.isArray(roster)){
              throw Error('Üye listesi alınamadı.');
            }

            body.replaceChildren();

            const manageable=roster.filter(m=>
              m.role!=='owner'&&
              (role==='owner'||m.role==='member')
            );

            const summary=element('div','ef3-donate-wallet');

            summary.append(
              element('small','','YÖNETİLEBİLİR ÜYELER'),
              element('strong','',num(manageable.length)),
              element('small','',role==='owner'?
                'Kurucu yönetim yetkileri':
                'Normal üye yönetim yetkileri')
            );

            body.append(summary);

            if(!manageable.length){
              body.append(element('p','',
                'Yönetilecek üye bulunmuyor.'));
            }

            for(const m of manageable){
              const row=element('div',
                'ef4-application-card ef4-management-card');

              const person=element('div','ef4-application-person');
              const avatar=element('span',
                'ef4-application-avatar',m.avatar||'👤');

              const info=element('div','ef3-person');
              const name=m.nickname||'Kullanıcı';

              info.append(
                element('strong','',name),
                element('small','',
                  m.role==='admin'?'Aile yöneticisi':'Aile üyesi')
              );

              if(m.public_id){
                info.append(element('small','',
                  'ID: '+m.public_id));
              }

              person.append(avatar,info);

              const menu=element('div','ef4-management-actions');
              const memberPath=base+'/members/'+
                encodeURIComponent(m.user_id);

              function addAction(label,description,run,critical,transfer){
                const button=element('button',
                  critical?'ef4-reject':'',label);
                button.type='button';

                button.onclick=()=>{
                  if(managementBusy||!valid()||
                    row.querySelector('.ef4-decision'))return;

                  const ask=element('div','ef4-decision');

                  ask.append(
                    element('strong','',label),
                    element('p','',description)
                  );

                  const controls=element('div','ef3-donate-controls');
                  const cancel=element('button','','Vazgeç');
                  const approve=element('button',
                    critical?'ef4-reject':'ef3-approve','Onayla');

                  cancel.type=approve.type='button';
                  menu.hidden=true;

                  cancel.onclick=()=>{
                    ask.remove();
                    menu.hidden=false;
                  };

                  approve.onclick=async()=>{
                    if(managementBusy||!valid())return;

                    managementBusy=true;
                    status.textContent='';

                    const locked=Array.from(
                      card.querySelectorAll('button')
                    ).filter(b=>!b.disabled);

                    locked.forEach(b=>b.disabled=true);
                    approve.textContent='İşleniyor…';

                    try{
                      await run();

                      if(!valid())return;

                      if(transfer){
                        // Eski kurucu yetkilerini hemen kapat.
                        for(const key of [
                          'invite','applications','manage','close'
                        ]){
                          const b=actions.querySelector(
                            '[data-action="'+key+'"]'
                          );
                          if(b){
                            b.disabled=true;
                            b.hidden=true;
                            b.style.display='none';
                          }
                        }

                        const visual=shell.querySelector(
                          '[data-action="family-avatar"]'
                        );
                        if(visual){
                          visual.disabled=true;
                          visual.hidden=true;
                        }

                        output.replaceChildren();
                        body.replaceChildren(
                          element('h3','','Kuruculuk devredildi'),
                          element('p','',
                            name+' yeni aile kurucusu oldu.'),
                          element('p','',
                            'Yeni yetkilerinizin yüklenmesi için aile ekranını kapatıp yeniden açın.')
                        );

                        window.toast?.('Kuruculuk devredildi.');
                        await refreshOperations();
                        return;
                      }

                      window.toast?.('İşlem tamamlandı.');
                      await refreshOperations();

                    }catch(err){
                      if(valid()){
                        status.textContent=String(
                          err?.message||'İşlem tamamlanamadı.'
                        );
                        ask.remove();
                        menu.hidden=false;
                      }
                    }finally{
                      managementBusy=false;
                      locked.forEach(b=>{
                        if(b.isConnected)b.disabled=false;
                      });
                    }
                  };

                  controls.append(cancel,approve);
                  ask.append(controls);
                  row.append(ask);
                };

                menu.append(button);
              }

              if(role==='owner'){
                const nextRole=m.role==='admin'?'member':'admin';

                addAction(
                  nextRole==='admin'?
                    'Yönetici olarak ata':'Yönetici yetkisini kaldır',
                  name+(nextRole==='admin'?
                    ' aile yöneticisi olacak.':
                    ' artık normal aile üyesi olacak.'),
                  ()=>request(memberPath,{
                    method:'PATCH',
                    body:JSON.stringify({
                      user_id:m.user_id,
                      role:nextRole
                    })
                  }),
                  false,false
                );

                addAction(
                  'Kuruculuğu devret',
                  'Ailenin sahipliği '+name+
                    ' adlı kullanıcıya geçecek. Siz normal üye olacaksınız. Kurucu yetkilerinizi kaybedeceksiniz.',
                  ()=>request(base+'/transfer-ownership',{
                    method:'POST',
                    body:JSON.stringify({user_id:m.user_id})
                  }),
                  true,true
                );
              }

              addAction(
                'Aileden çıkar',
                name+' aileden ve aile sohbetinden çıkarılacak.',
                ()=>request(memberPath,{method:'DELETE'}),
                true,false
              );

              row.append(person,menu);
              body.append(row);
            }

          }catch(err){
            if(valid()){
              body.replaceChildren(
                element('p','',String(
                  err?.message||'Üyeler alınamadı.'
                ))
              );
            }
          }
        }

        loadManagement();
      };
    }

    // FAMILY CRITICAL OPERATIONS PREMIUM V4
    let criticalBusy=false;

    function openCriticalOperation(kind){
      if(criticalBusy||
        shell.querySelector('.ef4-critical-mask'))return;

      const closing=kind==='close';

      if(closing&&role!=='owner')return;

      const initialToken=familyToken();

      const mask=element('div',
        'ef3-donate-mask ef4-critical-mask');
      const card=element('div','ef3-donate-card');

      card.setAttribute('role','dialog');
      card.setAttribute('aria-modal','true');
      card.setAttribute('aria-label',
        closing?'Aileyi kapat':'Aileden ayrıl');

      const head=element('div','ef3-donate-head');
      const close=element('button','','×');

      close.type='button';
      close.setAttribute('aria-label','Kapat');
      close.onclick=()=>{
        if(!criticalBusy)mask.remove();
      };

      head.append(
        element('h3','',
          closing?'Aileyi kapat':'Aileden ayrıl'),
        close
      );

      const body=element('div','ef3-donate-body');
      const warning=element('div','ef4-critical-warning');

      warning.append(
        element('span','ef4-critical-symbol','!'),
        element('h3','',f.name)
      );

      const status=element('p','ef4-invite-status');
      status.setAttribute('aria-live','polite');

      body.append(warning,status);
      card.append(head,body);
      mask.append(card);
      shell.append(mask);

      const valid=()=>mask.isConnected&&
        shell.isConnected&&familyToken()===initialToken;

      const base='/families/'+encodeURIComponent(f.id);

      async function prepare(){
        criticalBusy=true;
        close.disabled=true;
        status.textContent='Aile bilgileri kontrol ediliyor…';

        try{
          const fresh=await request(base);

          if(!valid())return;

          const owner=role==='owner';
          const count=Number(fresh.member_count);

          if(!Number.isFinite(count)||count<1){
            throw Error('Aile üye sayısı doğrulanamadı.');
          }

          const dissolving=!closing&&owner&&count===1;
          const blocked=!closing&&owner&&count>1;
          const destructive=closing||dissolving;

          status.textContent='';

          if(blocked){
            warning.append(
              element('p','',
                'Aileden ayrılmadan önce kuruculuğu başka bir üyeye devretmelisiniz.')
            );

            const done=element('button',
              'ef3-donate-button','Anladım');

            done.type='button';
            done.onclick=()=>mask.remove();
            body.append(done);
            return;
          }

          warning.append(
            element('p','',destructive?
              'Aile kalıcı olarak kapatılacak. Tüm üyelikler ve aile sohbetine erişim sona erecek. Yapılan katkılar iade edilmez.':
              'Aile üyeliğiniz sona erecek ve aile sohbetine erişiminiz kaldırılacak.')
          );

          const form=element('form','ef4-invite-form');
          let input=null;
          const familyName=String(fresh.name||f.name);

          if(destructive){
            form.append(element('label','',
              'Onaylamak için aile adını yazın: '+familyName));

            input=element('input','ef3-donate-input');
            input.type='text';
            input.required=true;
            input.autocomplete='off';
            input.placeholder='Aile adı';
            input.setAttribute('aria-label','Aile adı');
            form.append(input);
          }

          const controls=element('div','ef3-donate-controls');
          const cancel=element('button','','Vazgeç');
          const submit=element('button','ef4-danger-button',
            destructive?'Aileyi kapat':'Aileden ayrıl');

          cancel.type='button';
          submit.type='submit';
          cancel.onclick=close.onclick;
          submit.disabled=destructive;

          if(input){
            input.oninput=()=>{
              submit.disabled=criticalBusy||
                input.value.trim()!==familyName;
            };
          }

          form.onsubmit=async e=>{
            e.preventDefault();

            if(criticalBusy||!valid())return;

            if(destructive&&
              input.value.trim()!==familyName)return;

            criticalBusy=true;
            close.disabled=true;
            cancel.disabled=true;
            submit.disabled=true;

            if(input)input.disabled=true;

            submit.textContent='İşleniyor…';
            status.textContent='';

            try{
              await request(
                closing?base:base+'/leave',
                {method:'DELETE'}
              );

              if(!valid())return;

              localStorage.removeItem('eris_family_id');

              document.getElementById('chat')
                ?.classList.remove('show');

              for(const b of shell.querySelectorAll('button')){
                if(!mask.contains(b))b.disabled=true;
              }

              body.replaceChildren();

              const success=element('div','ef4-invite-success');

              success.append(
                element('span','','✓'),
                element('h3','',destructive?
                  'Aile kapatıldı':'Aileden ayrıldınız'),
                element('p','',
                  'Aile ekranını kapatıp yeniden açabilirsiniz.')
              );

              body.append(success);

              window.toast?.(destructive?
                'Aile kapatıldı':'Aileden ayrıldınız');

              Promise.resolve()
                .then(()=>window.ErisChatDM?.load?.())
                .catch(()=>{});

              await refreshOperations();

            }catch(err){
              if(valid()){
                status.textContent=String(
                  err?.message||'İşlem doğrulanamadı. Aile durumunu kontrol edin.'
                );

                cancel.disabled=false;
                if(input)input.disabled=false;

                submit.textContent=destructive?
                  'Aileyi kapat':'Aileden ayrıl';

                submit.disabled=false;
              }
            }finally{
              criticalBusy=false;
              close.disabled=false;
            }
          };

          controls.append(cancel,submit);
          form.append(controls);
          body.append(form);

        }catch(err){
          if(valid()){
            status.textContent=String(
              err?.message||'Aile bilgileri alınamadı.'
            );
          }
        }finally{
          criticalBusy=false;
          close.disabled=false;
        }
      }

      prepare();
    }

    for(const key of ['leave','close']){
      const button=actions.querySelector(
        '[data-action="'+key+'"]'
      );

      if(button){
        button.onclick=()=>openCriticalOperation(key);
      }
    }

    let donationBusy=false;

    async function openContribution(){
      if(donationBusy||shell.querySelector('.ef3-donate-mask'))return;

      const mask=element('div','ef3-donate-mask');
      const card=element('div','ef3-donate-card');
      card.setAttribute('role','dialog');
      card.setAttribute('aria-modal','true');
      card.setAttribute('aria-label','Aileye katkı yap');

      const heading=element('div','ef3-donate-head');
      const close=element('button','','×');
      close.type='button';
      close.setAttribute('aria-label','Kapat');
      close.onclick=()=>{
        if(!donationBusy)mask.remove();
      };

      heading.append(element('h3','','Aileye katkı yap'),close);
      const body=element('div','ef3-donate-body');
      body.append(element('p','','Bakiye yükleniyor…'));
      card.append(heading,body);
      mask.append(card);
      shell.append(mask);

      try{
        const me=await request('/me');
        if(!mask.isConnected)return;

        const balance=Number(me.lidya);
        if(!Number.isSafeInteger(balance)||balance<0){
          throw Error('Bakiye doğrulanamadı.');
        }

        body.replaceChildren();

        const wallet=element('div','ef3-donate-wallet');
        wallet.append(
          element('small','','MEVCUT LİDYA BAKİYEN'),
          element('strong','',num(balance)+' Lidya')
        );

        const presets=element('div','ef3-donate-presets');
        const input=element('input','ef3-donate-input');
        input.type='number';
        input.min='1';
        input.max='10000000';
        input.step='1';
        input.inputMode='numeric';
        input.placeholder='Özel miktar';
        input.value='1000';

        const details=element('div','ef3-donate-details');
        const warning=element('p','ef3-donate-warning');
        const controls=element('div','ef3-donate-controls');
        const cancel=element('button','','İptal');
        const approve=element('button','ef3-approve','Katkıyı onayla');

        cancel.type=approve.type='button';
        cancel.onclick=close.onclick;

        const validAmount=()=>{
          const amount=Number(input.value);
          return Number.isSafeInteger(amount)&&
            amount>=1&&amount<=10000000&&amount<=balance;
        };

        function update(){
          const amount=Number(input.value);
          const valid=validAmount();

          details.replaceChildren();
          for(const [label,value] of [
            ['Aktarılacak Lidya',valid?num(amount):'—'],
            ['Aile deneyimi',valid?'+'+num(amount)+' XP':'—'],
            ['Kalan bakiyen',valid?num(balance-amount):'—']
          ]){
            const row=element('div');
            row.append(element('span','',label),
              element('strong','',value));
            details.append(row);
          }

          warning.textContent=valid?
            'Yapılan katkılar iade edilmez.':
            'Geçersiz miktar veya yetersiz bakiye.';

          approve.disabled=!valid||donationBusy;
          presets.querySelectorAll('button').forEach(b=>{
            b.classList.toggle('active',
              Number(b.dataset.amount)===amount);
          });
        }

        for(const amount of [100,1000,10000,100000]){
          const button=element('button','',num(amount));
          button.type='button';
          button.dataset.amount=String(amount);
          button.onclick=()=>{
            input.value=String(amount);
            update();
          };
          presets.append(button);
        }

        input.addEventListener('input',update);

        approve.onclick=async()=>{
          if(donationBusy||!validAmount())return;

          const amount=Number(input.value);
          donationBusy=true;
          approve.disabled=cancel.disabled=close.disabled=true;
          input.disabled=true;
          presets.querySelectorAll('button').forEach(b=>b.disabled=true);
          approve.textContent='İşleniyor…';

          try{
            const result=await request(
              '/families/'+encodeURIComponent(f.id)+'/donate',
              {method:'POST',body:JSON.stringify({amount})}
            );

            if(result&&typeof result==='object'){
              Object.assign(f,result);
            }

            mask.remove();
            window.toast?.('Aile katkısı tamamlandı ✓');
            contributionPage=1;
            await loadActivity(true);

          }catch(e){
            warning.textContent=
              'İşlem sonucu doğrulanamadı. Bakiyeni ve katkı geçmişini kontrol et.';
            approve.textContent='Tekrar işlem yapmadan kontrol et';
            approve.disabled=true;
            cancel.disabled=close.disabled=false;
          }finally{
            donationBusy=false;
          }
        };

        controls.append(cancel,approve);
        body.append(wallet,presets,input,details,warning,controls);
        update();

      }catch(e){
        body.replaceChildren(element('p','',
          'Güncel bakiye alınamadı. Pencereyi kapatıp tekrar dene.'));
      }
    }

    async function loadActivity(force=false){
      if(activityLoaded&&!force)return;
      activityLoaded=true;
      const serial=++contributionRequest;

      activityBody.setAttribute('aria-busy','true');
      activityBody.replaceChildren(
        element('p','','Katkılar yükleniyor…')
      );

      try{
        const data=await request(
          '/families/'+encodeURIComponent(f.id)+
          '/insights?period='+contributionPeriod+
          '&page='+contributionPage
        );

        if(serial!==contributionRequest||!shell.isConnected)return;
        activityBody.replaceChildren();

        const hero=element('div','ef3-contribution-hero');
        hero.append(
          element('small','','TOPLAM AİLE KATKISI'),
          element('strong','ef3-total',num(data.all_time_total)+' XP'),
          element('span','','Aile deneyimine yapılan toplam katkı')
        );
        const progress=element('div','ef2-meter');
        const progressBar=element('i');
        const percent=Math.max(0,Math.min(100,
          Number(f.next_level_progress??0)||0));
        progressBar.style.width=percent+'%';
        progress.append(progressBar);

        hero.append(
          element('small','','Aile seviyesi '+num(f.level)),
          progress,
          element('span','',f.next_level_required?
            'Sonraki seviyeye '+num(Math.max(0,
              Number(f.next_level_required)-Number(f.balance||0)))+' XP kaldı':
            'Maksimum seviye')
        );

        const donateButton=element('button',
          'ef3-donate-button','＋ Aileye katkı yap');
        donateButton.type='button';
        donateButton.onclick=openContribution;
        activityBody.append(hero,donateButton);

        const summary=element('div','ef2-stats ef3-stats');
        for(const [label,value] of [
          ['BUGÜN',num(data.today_total)],
          ['BU HAFTA',num(data.week_total)],
          ['BU AY',num(data.month_total)],
          ['KATKI SAYISI',num(data.donation_count)],
          ['BENİM KATKIM',num(data.my_total)+' XP'],
          ['KATKI SIRAM',data.my_rank?'#'+data.my_rank:'—']
        ]){
          const cell=element('div');
          cell.append(
            element('small','',label),
            element('strong','',value)
          );
          summary.append(cell);
        }
        activityBody.append(summary);

        const goals=element('div','ef2-panel');
        goals.append(element('h3','','Günlük aile hedefleri'));

        for(const target of [1000,5000,20000]){
          const row=element('div','ef2-goal');
          const meter=element('div','ef2-meter');
          const bar=element('i');
          bar.style.width=Math.min(
            100,100*Number(data.today_total||0)/target
          )+'%';
          meter.append(bar);
          row.append(
            element('span','',num(Math.min(data.today_total,target))+
              ' / '+num(target)+' XP'),
            meter,
            element('small','',data.today_total>=target?
              'Tamamlandı':'Devam ediyor')
          );
          goals.append(row);
        }

        goals.append(element('p','',
          'Hedefler ilerleme göstergesidir; ayrıca Lidya ödülü dağıtılmaz.'
        ));
        activityBody.append(goals);

        const top=element('div','ef2-panel');
        top.append(element('h3','','Katkı sıralaması'));

        const filters=element('div','ef3-filters');
        for(const [key,label] of [
          ['daily','Günlük'],
          ['weekly','Haftalık'],
          ['monthly','Aylık'],
          ['all','Tümü']
        ]){
          const button=element('button',
            key===contributionPeriod?'active':'',label);
          button.type='button';
          button.setAttribute('aria-pressed',
            String(key===contributionPeriod));
          button.onclick=()=>{
            contributionPeriod=key;
            contributionPage=1;
            loadActivity(true);
          };
          filters.append(button);
        }
        top.append(filters);

        for(const [index,person] of
          (data.top_contributors||[]).entries()){

          const row=element('div','ef3-rank');
          const place=element('strong','ef3-place','#'+(index+1));
          const avatar=element('div','ef-member-avatar');
          const assetUrl=value=>{
            if(!value)return '';
            const raw=String(value);
            if(raw.startsWith('./assets/'))return raw;
            if(!/^(https?:|\/|[a-zA-Z0-9_-])/i.test(raw))return '';
            return window.ErisChatCosmetics?.assetUrl?.(raw)
              ||(raw.startsWith('/')||/^https?:/i.test(raw)?
                raw:'/'+raw);
          };

          const paintPortrait=()=>{
            avatar.replaceChildren();
            avatar.classList.remove('has-frame');

          const royal=window.LidyaNobilityAppearance
            ?.royalPortrait?.(person);

          const avatarSource=royal?.avatar||person.avatar_asset;
          const frameSource=royal?.embedded?'':(
            royal?.frame||person.frame_asset
          );

          if(avatarSource){
            const img=element('img','ef-member-avatar-main');
            img.src=assetUrl(avatarSource);
            img.alt='';
            avatar.append(img);
          }else{
            avatar.append(element('div','ef-member-avatar-main',
              person.avatar||'👤'));
          }

          if(frameSource){
            avatar.classList.add('has-frame');
            const frame=element('img','ef-member-frame');
            frame.src=assetUrl(frameSource);
            frame.alt='';
            avatar.append(frame);
          }

          };

          paintPortrait();

          window.LidyaNobilityAppearance
            ?.watchKingExpiryFor?.(avatar,person.nobility,person.user_id,paintPortrait
            );

          const info=element('div','ef3-person');
          info.append(element('strong','',person.nickname));
          if(Number(person.vip_level)>0){
            info.append(element('small','ef3-vip',
              'VIP '+Number(person.vip_level)));
          }

          row.append(place,avatar,info,
            element('strong','ef3-amount',num(person.total)+' XP'));
          top.append(row);
        }

        if(!(data.top_contributors||[]).length){
          top.append(element('p','','Henüz katkı yapılmamış.'));
        }
        activityBody.append(top);

        const recent=element('div','ef2-panel');
        recent.append(element('h3','','Katkı geçmişi'));

        for(const item of data.recent||[]){
          const row=element('div','ef3-history-row');
          const info=element('div','ef3-person');
          const date=item.created_at?
            new Date(item.created_at).toLocaleString('tr-TR'):'';

          info.append(
            element('strong','',item.nickname),
            element('small','',date)
          );
          row.append(info,element('strong','ef3-amount',
            '+'+num(item.amount)+' XP'));
          recent.append(row);
        }

        if(!(data.recent||[]).length){
          recent.append(element('p','','Henüz kayıt yok.'));
        }

        const pagination=element('div','ef3-pagination');
        const prev=element('button','','‹ Önceki');
        const next=element('button','','Sonraki ›');
        prev.type=next.type='button';
        prev.disabled=contributionPage<=1;
        next.disabled=!data.has_more;

        prev.onclick=()=>{
          contributionPage=Math.max(1,contributionPage-1);
          loadActivity(true);
        };
        next.onclick=()=>{
          contributionPage++;
          loadActivity(true);
        };

        pagination.append(prev,element('span','',
          contributionPage+' / '+(data.total_pages||1)),next);
        recent.append(pagination);
        activityBody.append(recent);

      }catch(e){
        if(serial!==contributionRequest)return;
        activityLoaded=false;
        activityBody.replaceChildren(element('p','',
          'Katkı bilgileri alınamadı.'));
        const retry=element('button','ef3-retry','Tekrar dene');
        retry.type='button';
        retry.onclick=()=>loadActivity(true);
        activityBody.append(retry);
      }finally{
        if(serial===contributionRequest){
          activityBody.removeAttribute('aria-busy');
        }
      }
    }
    // The discover list is never mounted for members; remove any leftover DOM defensively.
    shell.querySelectorAll('[data-family-discover]').forEach(el=>el.closest('section')?.remove());
  }
  window.ErisFamilyV2={enhance};
})();
