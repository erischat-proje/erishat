/* ErisChat Family V2 - progressive enhancement of the existing backend-backed family UI */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rules = [0,40000,100000,200000,350000,610000,890000,1130000,1500000,2000000,2600000,3200000];
  const num = n => Number(n||0).toLocaleString('tr-TR');
  const api = p => window.ErisPlatform?.api(p) ?? Promise.reject(new Error('API bağlantısı bulunamadı'));
  async function enhance(shell,f,members,role,apiClient){
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
            if(!/^(https?:|\/|[a-zA-Z0-9_-])/i.test(raw))return '';
            return window.ErisChatCosmetics?.assetUrl?.(raw)
              ||(raw.startsWith('/')||/^https?:/i.test(raw)?
                raw:'/'+raw);
          };

          if(person.avatar_asset){
            const img=element('img','ef-member-avatar-main');
            img.src=assetUrl(person.avatar_asset);
            img.alt='';
            avatar.append(img);
          }else{
            avatar.append(element('div','ef-member-avatar-main',
              person.avatar||'👤'));
          }

          if(person.frame_asset){
            avatar.classList.add('has-frame');
            const frame=element('img','ef-member-frame');
            frame.src=assetUrl(person.frame_asset);
            frame.alt='';
            avatar.append(frame);
          }

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
