/* ErisChat Family V2 - progressive enhancement of the existing backend-backed family UI */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rules = [0,40000,100000,200000,350000,610000,890000,1130000,1500000,2000000,2600000,3200000];
  const num = n => Number(n||0).toLocaleString('tr-TR');
  const api = p => window.ErisPlatform?.api(p) ?? Promise.reject(new Error('API bağlantısı bulunamadı'));
  async function enhance(shell,f,members,role){
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
    header.innerHTML='<span class="ef2-kicker">ERISCHAT · LİDYA AİLELERİ</span><h2>Aile merkezim</h2><p>Birlikte büyü, aile seviyeni yükselt ve üyelerini yönet.</p>';
    shell.prepend(header);
    const stats=document.createElement('div');stats.className='ef2-stats';
    stats.innerHTML='<div><small>AİLE SEVİYESİ</small><strong>'+num(f.level)+'/12</strong></div><div><small>ÜYELER</small><strong>'+num(f.member_count)+'/'+num(f.capacity)+'</strong></div><div><small>SIRALAMA</small><strong>#'+num(f.rank)+'</strong></div><div><small>AİLE DENEYİMİ</small><strong>'+num(f.balance)+'</strong></div>';
    hero.after(stats);
    const nav=document.createElement('nav');nav.className='ef2-tabs';nav.setAttribute('aria-label','Aile bölümleri');
    const sections=document.createElement('div');sections.className='ef2-sections';
    const tabs=[['home','Ana sayfa'],['members','Üyeler'],['levels','Seviyeler'],['rank','Sıralama'],['manage','İşlemler']];
    for(const [id,label] of tabs){const b=document.createElement('button');b.type='button';b.dataset.ef2Tab=id;b.textContent=label;nav.append(b);const page=document.createElement('section');page.dataset.ef2Page=id;page.hidden=true;sections.append(page)}
    stats.after(nav,sections);
    const page=id=>sections.querySelector('[data-ef2-page="'+id+'"]');
    const home=page('home'),membersPage=page('members'),levels=page('levels'),ranking=page('rank'),manage=page('manage');
    const welcome=document.createElement('div');welcome.className='ef2-panel';welcome.innerHTML='<h3>Birlikte daha güçlüyüz</h3><p>Aile deneyimi katkılarla yükselir. Seviye ilerledikçe üye kapasitesi artar.</p>';
    home.append(welcome);const shortcuts=document.createElement('div');shortcuts.className='ef2-shortcuts';shortcuts.innerHTML='<button type="button" data-go="members">Üyeler</button><button type="button" data-go="levels">Seviye yolculuğu</button><button type="button" data-go="rank">Aile sıralaması</button><button type="button" data-go="manage">Aile işlemleri</button>';home.append(shortcuts);
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
    async function loadRank(){if(loaded)return;loaded=true;try{const rows=await api('/families/discover?limit=50');rankList.replaceChildren();rows.forEach((item,index)=>{const row=document.createElement('div');row.className='ef2-rank';row.innerHTML='<strong>#'+(index+1)+'</strong><span>'+esc(item.name)+'</span><small>Sv. '+num(item.level)+' · '+num(item.balance)+' XP</small>';rankList.append(row)});if(!rows.length)rankList.textContent='Henüz aile bulunmuyor.'}catch(e){rankList.textContent='Sıralama alınamadı: '+e.message;loaded=false}}
    const manageInfo=document.createElement('div');manageInfo.className='ef2-panel';manageInfo.innerHTML='<h3>Aile işlemleri</h3><p>'+(role==='owner'?'Kurucu olarak aileyi ve yetkileri yönetebilirsin.':role==='admin'?'Aile yetkilisi olarak davet ve başvuruları yönetebilirsin.':'Aile sohbetine katılabilir, katkı yapabilir ve üyeleri görebilirsin.')+'</p>';manage.append(manageInfo,actions);
    const results=document.createElement('div');results.className='ef2-results';manage.append(results);
    // The original button handlers update [data-family-panel]. Keep that exact node and its event handlers.
    manage.append(output);
    for(const button of actions.querySelectorAll('button[data-action]')){
      const name=button.dataset.action;
      const text={members:'Üyeler',chat:'Aile sohbeti',invite:'Üye davet et',applications:'Başvurular',manage:'Aileyi yönet',donate:'Aileye katkı',leave:'Aileden ayrıl'}[name];
      if(text)button.textContent=text;
      button.classList.add('ef2-action','ef2-'+name);
      if(name==='members')button.style.display='none';
    }
    const avatar=shell.querySelector('[data-action="family-avatar"]');if(avatar){avatar.classList.add('ef2-avatar-btn');hero.append(avatar)}
    function activate(id){nav.querySelectorAll('button').forEach(b=>{const active=b.dataset.ef2Tab===id;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});sections.querySelectorAll('[data-ef2-page]').forEach(el=>el.hidden=el.dataset.ef2Page!==id);if(id==='rank')loadRank()}
    nav.addEventListener('click',e=>{const b=e.target.closest('button[data-ef2-tab]');if(b)activate(b.dataset.ef2Tab)});
    home.querySelector('.ef2-shortcuts').addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)activate(b.dataset.go)});activate('home');
    // The discover list is never mounted for members; remove any leftover DOM defensively.
    shell.querySelectorAll('[data-family-discover]').forEach(el=>el.closest('section')?.remove());
  }
  window.ErisFamilyV2={enhance};
})();
