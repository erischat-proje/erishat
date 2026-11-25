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
    const memberPanel=document.createElement('div');memberPanel.className='ef2-panel';memberPanel.innerHTML='<h3>Üye listesi</h3><p>Üyelerin profillerini ve mesaj seçeneklerini görüntüleyebilirsin.</p><button class="ef2-primary" type="button">Üyeleri göster</button>';
    memberPanel.querySelector('button').onclick=()=>{memberButton?.click();activate('manage')};
    membersPage.append(memberPanel);
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
    // Real, server-backed family contribution data. No fabricated rewards.
    const contribution=document.createElement('div');contribution.className='ef2-panel';
    contribution.innerHTML='<h3>Aile katkıları ve hedefler</h3><p>Katkılar aile deneyimini yükseltir. Günlük ve haftalık hedefler gerçek bağış kayıtlarından hesaplanır.</p>';
    activity.append(contribution);
    const activityBody=document.createElement('div');activityBody.className='ef2-activity';activityBody.textContent='Katkı bilgileri yükleniyor…';activity.append(activityBody);
    let activityLoaded=false;
    async function loadActivity(){
      if(activityLoaded)return;
      activityLoaded=true;
      try{
        const data=await request('/families/'+encodeURIComponent(f.id)+'/insights');
        activityBody.replaceChildren();
        const summary=document.createElement('div');summary.className='ef2-stats';
        for(const [label,value] of [['BUGÜN',data.today_total],['BU HAFTA',data.week_total],['TOPLAM',data.all_time_total],['KATKI SAYISI',data.donation_count]]){
          const cell=document.createElement('div');const small=document.createElement('small');small.textContent=label;
          const strong=document.createElement('strong');strong.textContent=num(value);cell.append(small,strong);summary.append(cell);
        }
        activityBody.append(summary);
        const goals=document.createElement('div');goals.className='ef2-panel';
        const heading=document.createElement('h3');heading.textContent='Günlük aile hedefleri';goals.append(heading);
        for(const target of [1000,5000,20000]){
          const row=document.createElement('div');row.className='ef2-goal';
          const label=document.createElement('span');label.textContent=num(Math.min(data.today_total,target))+' / '+num(target)+' XP';
          const meter=document.createElement('div');meter.className='ef2-meter';const bar=document.createElement('i');bar.style.width=Math.min(100,100*data.today_total/target)+'%';meter.append(bar);
          const status=document.createElement('small');status.textContent=data.today_total>=target?'Tamamlandı':'Devam ediyor';row.append(label,meter,status);goals.append(row);
        }
        const note=document.createElement('p');note.textContent='Hedefler ilerleme göstergesidir; ayrıca Lidya ödülü dağıtılmaz.';goals.append(note);activityBody.append(goals);
        const top=document.createElement('div');top.className='ef2-panel';const topTitle=document.createElement('h3');topTitle.textContent='En çok katkı yapanlar';top.append(topTitle);
        for(const [index,person] of (data.top_contributors||[]).entries()){
          const row=document.createElement('div');row.className='ef2-rank';
          const place=document.createElement('strong');place.textContent='#'+(index+1);
          const name=document.createElement('span');name.textContent=person.nickname;
          const amount=document.createElement('small');amount.textContent=num(person.total)+' Lidya';row.append(place,name,amount);top.append(row);
        }
        if(!(data.top_contributors||[]).length){const empty=document.createElement('p');empty.textContent='Henüz katkı yapılmamış.';top.append(empty)}
        activityBody.append(top);
        const recent=document.createElement('div');recent.className='ef2-panel';const recentTitle=document.createElement('h3');recentTitle.textContent='Son katkılar';recent.append(recentTitle);
        for(const item of data.recent||[]){const row=document.createElement('div');row.className='ef2-rank';
          const name=document.createElement('span');name.textContent=item.nickname;
          const amount=document.createElement('strong');amount.textContent='+'+num(item.amount);
          const date=document.createElement('small');date.textContent=item.created_at?new Date(item.created_at).toLocaleDateString('tr-TR'):'';
          row.append(name,amount,date);recent.append(row)}
        if(!(data.recent||[]).length){const empty=document.createElement('p');empty.textContent='Henüz kayıt yok.';recent.append(empty)}
        activityBody.append(recent);
      }catch(e){activityBody.textContent='Katkı bilgileri alınamadı: '+(e?.message||'Bilinmeyen hata');activityLoaded=false}
    }
    // The discover list is never mounted for members; remove any leftover DOM defensively.
    shell.querySelectorAll('[data-family-discover]').forEach(el=>el.closest('section')?.remove());
  }
  window.ErisFamilyV2={enhance};
})();
