(() => {
  'use strict';
  if (window.LidyaChess) return;
  const artwork=(cls='')=>`<span class="lc-art ${cls}"><img class="lc-art-light" src="./assets/chess-premium/light.png" alt=""><img class="lc-art-dark" src="./assets/chess-premium/dark.png" alt=""></span>`;
  let detailsOpen=false;
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {p:'Piyon',n:'At',b:'Fil',r:'Kale',q:'Vezir',k:'Şah'};
  const paths = {
    p:'M18 43h28v5H18z M23 39c0-7 4-10 5-15a7 7 0 1 1 8 0c1 5 5 8 5 15z',
    r:'M17 12h8v7h4v-7h6v7h4v-7h8v15l-6 4 2 12H21l2-12-6-4z M18 44h28v5H18z',
    b:'M20 43h24v6H20z M24 39c-9-10 0-20 8-29 8 9 17 19 8 29z M32 16l-5 9',
    n:'M19 44h28v5H19z M22 40c0-8 5-12 13-15l-5-4-7 7-8-5 10-14 11 4c12 5 10 18 8 27z M27 8l1-4 7 8 M27 17h1',
    q:'M17 43h30v6H17z M23 39l-7-20 11 7 5-13 5 13 11-7-7 20z M14 15a3 3 0 1 0 0-.1 M29 9a3 3 0 1 0 0-.1 M47 15a3 3 0 1 0 0-.1',
    k:'M19 43h26v6H19z M24 39l-4-13c-3-10 8-13 12-6 4-7 15-4 12 6l-4 13z M32 5v13 M26 10h12'
  };
  function piece(p) {
    if (!paths[p?.toLowerCase()]) return '';
    const white = p === p.toUpperCase();
    return `<svg viewBox="0 0 64 56" aria-hidden="true"><path d="${paths[p.toLowerCase()]}" fill="${white?'#fff6de':'#282823'}" stroke="${white?'#4a3d27':'#d0ac69'}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  function squares(fen) {
    const out = {};
    (fen || START).split(' ')[0].split('/').forEach((row,y) => {
      let x=0; for (const p of row) { if (/[1-8]/.test(p)) x+=Number(p); else out[String.fromCharCode(97+x++)+(8-y)]=p; }
    }); return out;
  }
  const reason = {checkmate:'Şah mat',stalemate:'Pat',insufficient_material:'Yetersiz mat materyali',seventy_five_moves:'75 hamle kuralı',fivefold_repetition:'Beş tekrar',timeout:'Süre doldu',resignation:'Terk',agreement:'Anlaşmalı beraberlik',claimed_draw:'Beraberlik talebi',invite_expired:'Davetin süresi doldu'};
  let root=null,tab='play',hub=null,match=null,tournament=null,busy=false,selection=null,flipped=false,replay=null,pending=null,epoch=0,received=0,pollTimer=null,clockTimer=null,lastFocus=null,historyOffset=0,refreshing=false;
  const api = (path,options={}) => {
    if (!window.ErisPlatform?.api) return Promise.reject(new Error('Platform henüz hazır değil.'));
    const token=window.ErisPlatform.getAccessToken?.(),requestEpoch=epoch;
    return window.ErisPlatform.api('/chess'+path,options).then(data=>{
      if(token!==window.ErisPlatform.getAccessToken?.()){if(root&&epoch===requestEpoch)close(false);throw new Error('Oturum değişti.');}
      return data;
    });
  };
  const post = (path,body) => api(path,{method:'POST',...(body?{body:JSON.stringify(body)}:{})});
  const $ = s => root?.querySelector(s);
  const btn=(text,action,extra='')=>`<button type="button" class="lc-btn ${extra}" data-lc="${action}">${text}</button>`;
  const preset = () => '<option value="3+2">3 + 2 · Hızlı</option><option value="5+3" selected>5 + 3 · Dengeli</option><option value="10+5">10 + 5 · Düşünerek</option>';
  function notice(text) { if ($('.lc-notice')) $('.lc-notice').textContent=text; }
  function status(text) { if ($('.lc-status')) $('.lc-status').textContent=text; }
  function shell() {
    root.classList.remove('lc-in-match');detailsOpen=false;
    root.innerHTML=`<div class="lc-wrap"><header class="lc-header">${artwork('lc-brand')}<div><h1>Satranç Merkezi</h1><p>LİDYA · Her hamlede yeni bir ihtimal</p></div>${btn('Kapat','close','lc-close')}</header><nav class="lc-tabs" aria-label="Satranç bölümleri">${[['play','Oyna'],['tournaments','Turnuvalar'],['history','Maçlarım'],['leaderboard','Sıralama'],['rules','Nasıl oynanır?']].map(([v,t])=>`<button type="button" class="lc-btn" data-lc="tab" data-tab="${v}" aria-selected="${tab===v}">${t}</button>`).join('')}</nav><div class="lc-notice" role="status" aria-live="polite"></div><div class="lc-status" aria-live="polite"></div><main class="lc-content"></main></div>`;
  }
  function renderPlay() {
    root.classList.remove('lc-in-match');
    if (match) return renderMatch();
    const me=hub?.me,stats=hub?.stats||{};
    $('.lc-content').innerHTML=`<div class="lc-grid"><section class="lc-card lc-hero"><div class="lc-eyebrow">HAMLE SENİN</div>${artwork('lc-crest')}<h2>${esc(me?.name||'Satranç zamanı')}</h2><p class="lc-sub">Canlı rakibe karşı oyna, arkadaşını davet et veya botla hazırlan. Tüm maçlar ve turnuvalar ücretsiz.</p><div class="lc-stats"><div><strong>${me?.rating??1200}</strong><span>Satranç puanı</span></div><div><strong>${stats.wins||0} / ${stats.draws||0} / ${stats.losses||0}</strong><span>Dereceli galibiyet / beraberlik / yenilgi</span></div></div>${hub?.active?btn('Mevcut maça dön','resume','primary'):''}${hub?.tournament_id?`<p class="lc-sub">Bir turnuvaya kayıtlısın. Maç eşleşmelerin turnuva ekranında.</p>${btn('Turnuvama git','my-tournament')}`:''}</section><div class="lc-stack"><section class="lc-card"><h3>Canlı maç</h3><label class="lc-field">Süre ve hamle başına ek süre<select id="lc-preset">${preset()}</select></label><label class="lc-field lc-inline"><input id="lc-rated" type="checkbox" checked> Dereceli eşleştirme</label><div class="lc-row">${hub?.queue?btn('Aramayı durdur','cancel-queue'):btn('Rakip bul','queue','primary')}${btn('Botla antrenman','practice')}</div><p class="lc-sub">${hub?.queue?'Rakip bekleniyor. Bu ekran açıkken arama yenilenir.':'Bot: süresiz temel antrenman. Dereceli puanını etkilemez.'}</p></section><section class="lc-card"><h3>Arkadaşınla oyna</h3><label class="lc-field">Arkadaşının kullanıcı ID’si<input id="lc-friend" maxlength="32" autocomplete="off" placeholder="Profilde görünen ID"></label>${btn('Maça davet et','invite')}<p class="lc-sub">Davet 2 dakika geçerlidir. Arkadaş maçları derecesizdir.</p></section></div></div><section class="lc-card" style="margin-top:18px"><h3>Gelen davetler</h3><div class="lc-list">${(hub?.invitations||[]).map(m=>`<div class="lc-list-item"><strong>${esc(m.white.name)}</strong><p>${esc(m.preset)} · Derecesiz maç</p><button class="lc-btn primary" data-lc="open-match" data-id="${esc(m.id)}">Daveti aç</button></div>`).join('')||'<p class="lc-sub">Bekleyen davet yok.</p>'}</div></section>`;
  }
  function clock(ms) {const s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  function tick() {
    if (!match||!root) return;
    for (const side of ['white','black']) {
      const el=$(`[data-clock="${side}"]`);if(!el)continue;
      const running=match.status==='active'&&match.mode!=='bot'&&match.turn===(side==='white'?'w':'b');
      const ms=match[side+'_ms']-(running?Math.max(0,performance.now()-received):0);
      el.textContent=match.mode==='bot'?'∞':clock(ms);el.classList.toggle('running',running);el.classList.toggle('low',ms<20000&&match.mode!=='bot');
    }
  }
  function playerRow(side) {const p=match[side];return `<div class="lc-player"><div><strong>${esc(p.name)}</strong><small>${p.rating??'Temel bot'}${p.id===hub?.me.id?' · Sen':''}${side==='white'?' · Beyaz':' · Siyah'}</small></div><div class="lc-clock" data-clock="${side}" aria-label="${side==='white'?'Beyaz':'Siyah'} kalan süre"></div></div>`;}
  function boardHTML() {
    const ply=replay===null?match.moves.length:replay;
    const fen=ply===0?START:match.moves[ply-1]?.fen||match.fen;
    const board=squares(fen),last=ply?match.moves[ply-1]?.uci:null,legal=selection&&replay===null?match.legal.filter(m=>m.startsWith(selection)):[];
    const order=Array.from({length:64},(_,i)=>flipped?63-i:i);
    const checked=match.check&&ply===match.moves.length?Object.keys(board).find(s=>board[s]===(match.turn==='w'?'K':'k')):null;
    return order.map((n,i)=>{const square=String.fromCharCode(97+n%8)+(8-Math.floor(n/8)),p=board[square],target=legal.some(m=>m.slice(2,4)===square);return `<button type="button" class="lc-square ${((n%8+Math.floor(n/8))%2)?'dark':''} ${selection===square?'selected':''} ${last&&(last.slice(0,2)===square||last.slice(2,4)===square)?'last':''} ${checked===square?'check':''} ${target?'legal':''} ${target&&p?'capture':''}" data-square="${square}" role="gridcell" aria-label="${square}${p?' '+(p===p.toUpperCase()?'Beyaz ':'Siyah ')+labels[p.toLowerCase()]:', boş'}" aria-selected="${selection===square}">${i%8===0?`<span class="lc-coordinate">${square[1]}</span>`:''}${i>=56?`<span class="lc-coordinate lc-file">${square[0]}</span>`:''}${piece(p)}</button>`;}).join('');
  }
  function renderMatch() {
    selection=null;
    const participant=[match.white.id,match.black.id].includes(hub?.me.id),active=match.status==='active',invited=match.status==='invited';
    const myTurn=active&&match.legal.length>0;
    const words=invited?'Arkadaşının daveti kabul etmesi bekleniyor.':active?(participant?(myTurn?'Hamle sırası sende.':'Rakibin düşünüyor…'):'Turnuva maçı · İzleyici'):(reason[match.reason]||'Maç kapandı');
    $('.lc-content').innerHTML=`<div class="lc-match"><section class="lc-board-panel">${playerRow(flipped?'white':'black')}<div class="lc-board" role="grid" aria-label="Satranç tahtası; kare seçerek hamle yap">${boardHTML()}</div>${playerRow(flipped?'black':'white')}<div class="lc-row">${btn('Tahtayı çevir','flip')}${btn('Lobiye dön','lobby')}${match.tournament_id?btn('Turnuvaya dön','match-tournament'):''}</div></section><aside class="lc-stack"><section class="lc-card"><div class="lc-eyebrow">${match.mode==='bot'?'ANTRENMAN':match.rated?'DERECELİ MAÇ':'DERECESİZ MAÇ'} · ${esc(match.preset)}</div><h2>${match.status==='finished'?'Maç tamamlandı':'Oyun tahtası'}</h2><p class="lc-sub" id="lc-match-state" aria-live="polite">${esc(words)}${match.check&&active?' Şah!':''}</p>${match.result!=='*'?`<div class="lc-result">${esc(match.result)}</div>`:''}${match.status==='finished'&&match.rated?`<p class="lc-sub">Puan değişimi · Beyaz: ${match.rating_delta.white>=0?'+':''}${match.rating_delta.white||0} / Siyah: ${match.rating_delta.black>=0?'+':''}${match.rating_delta.black||0}</p>`:''}<div class="lc-row">${invited&&participant?(match.black.id===hub?.me.id?btn('Kabul et','accept','primary'):'')+btn('Daveti iptal et / reddet','decline'):''}${active&&participant?btn('Terk et','resign','danger')+(match.mode!=='bot'?btn('Beraberlik öner','offer_draw'):'')+btn('Beraberlik talep et','claim_draw'):''}${pending?btn('Hamleyi yeniden dene','retry','primary'):''}</div>${active&&match.draw_by&&match.draw_by!==hub?.me.id&&participant?`<div class="lc-note" style="margin-top:12px">Rakibin beraberlik öneriyor.<div class="lc-row">${btn('Kabul','accept_draw')}${btn('Reddet','decline_draw')}</div></div>`:active&&match.draw_by?'<p class="lc-sub">Beraberlik teklifi bekliyor.</p>':''}<p class="lc-sub">${match.mode==='bot'?'Bot bir hamlelik materyal hesabı yapar; güçlü bir satranç motoru değildir.':'Süreler sunucuda işler. Ekranı kapatmak maçı durdurmaz.'}</p></section><section class="lc-card"><h3>Hamleler ve tekrar</h3><div class="lc-row">${btn('Başa','first')}${btn('Önceki','prev')}${btn('Sonraki','next')}${btn('Canlı / son','last')}</div><label class="lc-field">Konum <span id="lc-replay-label">${replay??match.moves.length} / ${match.moves.length}</span><input class="lc-replay" type="range" min="0" max="${match.moves.length}" value="${replay??match.moves.length}" id="lc-replay" aria-label="Tekrar hamlesi"></label><div class="lc-moves">${match.moves.map((m,i)=>(i%2===0?`<span>${i/2+1}.</span>`:'')+`<button type="button" data-lc="ply" data-ply="${i+1}" class="${replay===i+1?'current':''}">${esc(m.san)}</button>`).join('')||'<span>—</span>'}</div>${btn('PGN indir','pgn')}<p class="lc-sub">Tekrar izlerken hamle yapılamaz. Devam etmek için “Canlı / son” seç.</p></section></aside></div>`;
    root.classList.add('lc-in-match');
    const panel=$('.lc-match aside');panel.classList.add('lc-detail-panel');panel.hidden=!detailsOpen;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Hamleler ve maç işlemleri');
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='lc-btn lc-detail-close';dismiss.dataset.lc='details-close';dismiss.textContent='Tahtaya dön ×';panel.prepend(dismiss);
    const board=$('.lc-board'),slot=document.createElement('div');slot.className='lc-board-slot';board.before(slot);slot.append(board);
    if(match.tournament_id)panel.append(Object.assign(document.createElement('div'),{innerHTML:btn('Turnuvaya dön','match-tournament')}));
    const controls=$('.lc-board-panel > .lc-row');controls.classList.add('lc-board-tools');controls.innerHTML=btn('Çevir','flip')+btn('Hamleler / İşlemler','details')+btn('Lobi','lobby');
    const strip=document.createElement('div');strip.className='lc-matchline';strip.setAttribute('role','status');strip.textContent=(replay!==null?'Tekrar izleniyor · Hamle yapılamaz':words)+(match.check&&active?' Şah!':'')+(match.result!=='*'?' · '+match.result:'');
    if(replay!==null)strip.insertAdjacentHTML('beforeend',btn('Canlıya dön','last'));
    if(active&&match.draw_by&&match.draw_by!==hub?.me.id)strip.insertAdjacentHTML('beforeend',btn('Beraberlik teklifi','details'));
    if(pending)strip.insertAdjacentHTML('beforeend',btn('Tekrar dene','retry'));
    $('.lc-content').prepend(strip);tick();syncBusy();
  }
  function updateBoard() {if($('.lc-board'))$('.lc-board').innerHTML=boardHTML();if($('#lc-replay'))$('#lc-replay').value=replay??match.moves.length;if($('#lc-replay-label'))$('#lc-replay-label').textContent=(replay??match.moves.length)+' / '+match.moves.length;}
  function setMatch(m) {match=m;received=performance.now();pending=pending&&m.moves.some(x=>x.uci===pending.uci)&&m.revision>pending.revision?null:pending;}
  function syncBusy() {root?.querySelectorAll('button[data-lc]').forEach(b=>{b.disabled=busy&&!['close','flip'].includes(b.dataset.lc);});}
  async function run(fn) {
    if(busy||!root)return;const e=epoch;busy=true;syncBusy();notice('');
    try {await fn(e);} catch(err) {if(root&&e===epoch)notice(err?.message||'İşlem tamamlanamadı. Bağlantınızı kontrol edin.');}
    finally {if(root&&e===epoch){busy=false;syncBusy();}}
  }
  async function loadHub(e=epoch,render=true) {
    const h=await api('/hub');if(!root||e!==epoch)return false;
    if(hub&&hub.me.id!==h.me.id){match=null;tournament=null;pending=null;replay=null;selection=null;tab='play';shell();}
    hub=h;
    if(render)renderPlay();return true;
  }
  function renderTournaments() {
    const rows=hub?.tournaments||[];
    $('.lc-content').innerHTML=`<div class="lc-grid"><section class="lc-card"><div class="lc-eyebrow">BİRLİKTE YARIŞ</div><h2>Turnuvalar</h2><p class="lc-sub">4–32 oyuncu, 3–5 tur. Puanına yakın rakiplerle eşleş; galibiyet 1, beraberlik ½ puan. Katılım ücretsiz, Lidya ödülü veya giriş ücreti yok.</p>${hub?.tournament_id?btn('Kayıtlı olduğum turnuva','my-tournament','primary'):''}<div class="lc-list" style="margin-top:16px">${rows.map(t=>`<div class="lc-list-item"><strong>${esc(t.name)}</strong><p>${t.status==='registration'?'Kayıt açık':'Devam ediyor'} · ${esc(t.preset)} · ${t.round}/${t.rounds} tur</p><p>Başlangıç: ${esc(new Date(t.starts_at).toLocaleString('tr-TR'))}</p><button class="lc-btn" data-lc="open-tournament" data-id="${esc(t.id)}">Turnuvayı aç</button></div>`).join('')||'<p class="lc-sub">Şu an açık turnuva yok. İlkini sen oluştur.</p>'}</div></section><section class="lc-card"><h3>Turnuva oluştur</h3><form id="lc-create-tournament"><label class="lc-field">Turnuva adı<input id="lc-tname" minlength="3" maxlength="64" required placeholder="Lidya Akşam Turnuvası"></label><label class="lc-field">Süre<select id="lc-tpreset">${preset()}</select></label><div class="lc-row"><label class="lc-field">Turlar<select id="lc-rounds"><option>3</option><option>4</option><option>5</option></select></label><label class="lc-field">Oyuncu sınırı<select id="lc-capacity"><option>8</option><option selected>16</option><option>32</option></select></label></div><label class="lc-field">Kaç dakika sonra başlasın?<input id="lc-start" type="number" value="10" min="2" max="1440" required></label><button class="lc-btn primary" type="submit">Ücretsiz turnuva oluştur</button></form><p class="lc-sub">Oluşturan kişi otomatik kaydolur. En az 4 oyuncu gerekir. Kayıt süresi dolunca sistem başlatır; yeterli oyuncu yoksa iptal eder.</p></section></div>`;
  }
  function renderTournament() {
    const t=tournament,mine=t.standings.some(e=>e.user.id===hub?.me.id),owner=t.owner_id===hub?.me.id;
    $('.lc-content').innerHTML=`<section class="lc-card"><div class="lc-eyebrow">LİDYA TURNUVASI · ÜCRETSİZ</div><h2>${esc(t.name)}</h2><p class="lc-sub">${({registration:'Kayıt açık',active:'Devam ediyor',finished:'Tamamlandı',cancelled:'İptal edildi'})[t.status]} · ${esc(t.preset)} · Tur ${t.round}/${t.rounds} · ${t.standings.length}/${t.capacity} oyuncu</p><p class="lc-sub">${esc(new Date(t.starts_at).toLocaleString('tr-TR'))} · Turlar aralıksız ilerler. Kayıtlıysan başlangıçta burada ol.</p><div class="lc-row">${t.status==='registration'?(mine?btn('Kayıttan ayrıl','t-leave'):btn('Turnuvaya katıl','t-join','primary')):''}${owner&&t.status==='registration'?btn('Şimdi başlat','t-start')+btn('Turnuvayı iptal et','t-cancel','danger'):''}${btn('Turnuva listesi','t-list')}${btn('Yenile','t-refresh')}</div></section><div class="lc-grid" style="margin-top:18px"><section class="lc-card"><h3>${t.status==='finished'?'Son sıralama':'Puan tablosu'}</h3><div class="lc-table-wrap"><table class="lc-table"><thead><tr><th>Sıra</th><th>Oyuncu</th><th>Puan</th><th>Buchholz</th></tr></thead><tbody>${t.standings.map(e=>`<tr><td>${e.rank===1&&t.status==='finished'?'♛ ':''}${e.rank}</td><td>${esc(e.user.name)}${e.user.id===hub?.me.id?' · Sen':''}${e.bye?' (bay)':''}</td><td>${e.points}</td><td>${e.buchholz}</td></tr>`).join('')}</tbody></table></div><p class="lc-sub">Eşitlik: rakiplerin toplam puanı (Buchholz), başlangıç puanı, kullanıcı ID’si. Bay geçen oyuncu 1 puan alır.</p></section><section class="lc-card"><h3>Tur maçları</h3><div class="lc-list">${t.matches.slice().reverse().map(m=>`<div class="lc-list-item"><strong>${esc(m.white.name)} — ${esc(m.black.name)}</strong><p>Tur ${m.round} · ${m.status==='active'?'Oynanıyor':esc(m.result)}</p><button class="lc-btn ${[m.white.id,m.black.id].includes(hub?.me.id)&&m.status==='active'?'primary':''}" data-lc="open-match" data-id="${esc(m.id)}">${[m.white.id,m.black.id].includes(hub?.me.id)&&m.status==='active'?'Maça gir':'İzle / tekrar'}</button></div>`).join('')||'<p class="lc-sub">Eşleştirmeler turnuva başlayınca açıklanır.</p>'}</div></section></div>`;syncBusy();
  }
  async function openTournament(id,e=epoch) {const t=await api('/tournaments/'+encodeURIComponent(id));if(!root||e!==epoch)return;tab='tournaments';tournament=t;match=null;replay=null;shell();renderTournament();}
  async function openMatch(id,e=epoch) {const m=await api('/matches/'+encodeURIComponent(id));if(!root||e!==epoch)return;tab='play';setMatch(m);flipped=m.black.id===hub?.me.id;replay=null;shell();renderMatch();}
  async function renderHistory(e=epoch) {
    const d=await api('/history?offset='+historyOffset);if(!root||e!==epoch)return;
    $('.lc-content').innerHTML=`<section class="lc-card"><h2>Maçlarım</h2><p class="lc-sub">Tamamlanan maçlarını tekrar izle; PGN olarak kaydet.</p><div class="lc-list">${d.items.map(m=>`<div class="lc-list-item"><strong>${esc(m.white)} — ${esc(m.black)}</strong><p>${esc(m.result)} · ${m.rated?'Dereceli':'Derecesiz'} · ${esc(new Date(m.finished_at).toLocaleDateString('tr-TR'))}</p><button class="lc-btn" data-lc="open-match" data-id="${esc(m.id)}">Tekrar izle</button></div>`).join('')||'<p class="lc-sub">Henüz tamamlanan maçın yok.</p>'}</div><div class="lc-row" style="margin-top:15px">${historyOffset?btn('Önceki sayfa','history-prev'):''}${d.has_more?btn('Sonraki sayfa','history-next'):''}</div></section>`;
  }
  async function renderLeaderboard(e=epoch) {
    const d=await api('/leaderboard');if(!root||e!==epoch)return;
    $('.lc-content').innerHTML=`<section class="lc-card"><div class="lc-eyebrow">DERECELİ SATRANÇ</div><h2>Lidya sıralaması</h2><p class="lc-sub">En az bir dereceli maçını tamamlayan oyuncular. Başlangıç 1200, Elo katsayısı 32. Bot, arkadaş ve turnuva maçları puanı etkilemez.</p><div class="lc-table-wrap"><table class="lc-table"><thead><tr><th>Sıra</th><th>Oyuncu</th><th>Puan</th><th>G / B / Y</th></tr></thead><tbody>${d.items.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.name)}</td><td>${p.rating}</td><td>${p.wins} / ${p.draws} / ${p.losses}</td></tr>`).join('')}</tbody></table>${!d.items.length?'<p class="lc-sub">İlk dereceli maçınla sıralamayı başlat.</p>':''}</div></section>`;
  }
  function renderRules() {
    $('.lc-content').innerHTML=`<section class="lc-card lc-rules"><div class="lc-eyebrow">BİR HAMLEYLE BAŞLA</div><h2>Satranç rehberi</h2><ul><li>Önce taşına, sonra hedef kareye dokun. Noktalar yasal hedefleri gösterir. Şah tehdit altındaysa kırmızı görünür. Piyon son yataya geldiğinde vezir, kale, fil veya at seç.</li><li>Rok, geçerken alma ve terfi sunucuda doğrulanır. Şahını tehdit altında bırakacak hamle yapamazsın.</li><li>3+2, her oyuncuya 3 dakika ve her hamlesine 2 saniye ek süre demektir. Bağlantı kesilince veya ekran kapanınca saat durmaz. Yeniden açtığında mevcut maçına dön.</li><li>Şah mat, pat ve yaygın yetersiz materyal konumları otomatik sonuçlanır. Beş tekrar ve 75 hamle de otomatik beraberliktir. Mevcut konumda üç tekrar veya 50 hamle koşulu oluştuğunda, sıra sendeyken beraberlik talep edebilirsin. Bir sonraki hamleyi bildirerek yapılan ön talep bu sürümde yoktur.</li><li>Beraberlik önerisini rakip kabul edebilir. Bir hamle yapılınca bekleyen teklif kapanır. Terk etmek maçı bitirir; pencereyi kapatmak bitirmez.</li><li>Dereceli canlı maçlar ayrı Elo puanı kullanır. Lidya bakiyene dokunulmaz. Canlı maçta harici motor yardımı kullanma. Bu sürüm otomatik motor/hile tespiti yapmaz.</li><li>Turnuvalar puana göre eşleştirmeli 3–5 turluk etkinliklerdir. 4–32 oyuncu katılabilir. Tekrar eşleşmeden kaçınılır; mümkün değilse en az tekrar tercih edilir. Renk dengesi gözetilir. Bu, FIDE onaylı İsviçre eşleştirme yazılımı değildir.</li><li>Galibiyet 1, beraberlik ½, yenilgi 0 puandır. Oyuncu sayısı tekse düşük puanlı ve daha önce bay geçmemiş oyuncuya 1 puanlık bay verilir. Tur sayısı en fazla katılımcı sayısı eksi birdir. Sonuç sırası: puan, Buchholz, başlangıç puanı ve kullanıcı ID’si.</li><li>Turlar önceki turun tüm maçları bitince otomatik ilerler. Ekranı açık tut; tur arası bekleme süresi yoktur. Turnuva başladıktan sonra kayıt kapalıdır. Oynamazsan süren dolar. Kayıtlıyken başka maça giremezsin; başlamadan kayıttan ayrılabilirsin.</li><li>Bot süresiz, temel bir antrenman rakibidir. Maçlarım bölümünden tamamlanan oyunları tekrar izle ve PGN indir. Canlı rakipler için motor analizi sunulmaz.</li></ul></section>`;
  }
  async function changeTab(value,e=epoch) {
    tab=value;match=null;tournament=null;selection=null;replay=null;shell();$('.lc-content').innerHTML='<p class="lc-loading">Yükleniyor…</p>';
    if(value==='play'){await loadHub(e);}
    else if(value==='tournaments'){await loadHub(e,false);if(root&&epoch===e)renderTournaments();}
    else if(value==='history')await renderHistory(e);
    else if(value==='leaderboard')await renderLeaderboard(e);
    else renderRules();
  }
  async function sendMove(data,e=epoch) {
    pending=data;
    try {const m=await post('/matches/'+encodeURIComponent(match.id)+'/move',data);if(!root||e!==epoch)return;pending=null;setMatch(m);replay=null;renderMatch();}
    catch(err) {
      if(root&&e===epoch){
        try {const m=await api('/matches/'+encodeURIComponent(match.id));if(root&&e===epoch){if(m.revision>data.revision)pending=null;setMatch(m);renderMatch();}}catch(_){}
      }throw err;
    }
  }
  function promote(choices) {
    const panel=document.createElement('div');panel.className='lc-promotion';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Terfi taşını seç');
    panel.innerHTML=`<div class="lc-card"><h3>Piyonunu terfi ettir</h3><div class="lc-row">${choices.map(m=>`<button type="button" class="lc-btn" data-promotion="${m}" aria-label="${labels[m[4]]}">${piece(match.turn==='w'?m[4].toUpperCase():m[4])}</button>`).join('')}</div>${btn('Vazgeç','promotion-cancel')}</div>`;
    root.appendChild(panel);panel.querySelector('button').focus();
  }
  function onSquare(square) {
    if(!match||busy||replay!==null||match.status!=='active'||$('.lc-promotion'))return;
    const choices=selection?match.legal.filter(m=>m.slice(0,2)===selection&&m.slice(2,4)===square):[];
    if(choices.length>1){promote(choices);return;}
    if(choices.length===1){const data={uci:choices[0],revision:match.revision,key:makeKey()};selection=null;run(e=>sendMove(data,e));return;}
    selection=match.legal.some(m=>m.startsWith(square))?square:null;updateBoard();
  }
  function makeKey() {return window.crypto?.randomUUID?.()||'move_'+Date.now()+'_'+Math.random().toString(36).slice(2);}
  function confirmAction(text,fn) {
    const panel=document.createElement('div');panel.className='lc-confirm';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','İşlemi onayla');
    panel.innerHTML=`<div class="lc-card"><h3>${esc(text)}</h3><p class="lc-sub">Bu işlem geri alınamaz.</p><div class="lc-row"><button class="lc-btn danger" type="button" data-confirm="yes">Onayla</button><button class="lc-btn" type="button" data-confirm="no">Vazgeç</button></div></div>`;
    panel.onclick=ev=>{const yes=ev.target.closest('[data-confirm]');if(!yes)return;panel.remove();if(yes.dataset.confirm==='yes')fn();};root.appendChild(panel);panel.querySelector('[data-confirm=no]').focus();
  }
  async function handle(action,target,e) {
    if(action==='tab')return changeTab(target.dataset.tab,e);
    if(action==='resume')return openMatch(hub.active.id,e);
    if(action==='open-match')return openMatch(target.dataset.id,e);
    if(action==='open-tournament')return openTournament(target.dataset.id,e);
    if(action==='my-tournament')return openTournament(hub.tournament_id,e);
    if(action==='match-tournament')return openTournament(match.tournament_id,e);
    if(action==='lobby')return changeTab('play',e);
    if(action==='t-list')return changeTab('tournaments',e);
    if(action==='t-refresh')return openTournament(tournament.id,e);
    if(action==='queue') {
      const d=await post('/queue',{preset:$('#lc-preset').value,rated:$('#lc-rated').checked});if(!root||e!==epoch)return;
      if(d.match){setMatch(d.match);flipped=d.match.black.id===hub.me.id;replay=null;renderMatch();}else{await loadHub(e);status('Rakip aranıyor…');}return;
    }
    if(action==='cancel-queue'){await api('/queue',{method:'DELETE'});return loadHub(e);}
    if(action==='practice'){const m=await post('/practice');if(root&&e===epoch){setMatch(m);flipped=false;replay=null;renderMatch();}return;}
    if(action==='invite') {
      const public_id=$('#lc-friend').value.trim();if(!public_id)throw new Error('Arkadaşının kullanıcı ID’sini yaz.');
      const m=await post('/invite',{public_id,preset:$('#lc-preset').value,rated:false});if(root&&e===epoch){setMatch(m);flipped=false;replay=null;renderMatch();}return;
    }
    if(action==='retry'&&pending)return sendMove(pending,e);
    if(['accept','decline','resign','offer_draw','accept_draw','decline_draw','claim_draw'].includes(action)) {
      const m=await post('/matches/'+encodeURIComponent(match.id)+'/action',{action});if(root&&e===epoch){setMatch(m);renderMatch();}return;
    }
    if(action.startsWith('t-')) {const t=await post('/tournaments/'+encodeURIComponent(tournament.id)+'/action',{action:action.slice(2)});if(root&&e===epoch){tournament=t;renderTournament();}return;}
    if(action==='history-next'||action==='history-prev'){historyOffset=Math.max(0,historyOffset+(action==='history-next'?20:-20));return renderHistory(e);}
  }
  function click(ev) {
    const sq=ev.target.closest('[data-square]');if(sq){onSquare(sq.dataset.square);return;}
    const promotion=ev.target.closest('[data-promotion]');if(promotion){const uci=promotion.dataset.promotion;$('.lc-promotion')?.remove();run(e=>sendMove({uci,revision:match.revision,key:makeKey()},e));return;}
    const target=ev.target.closest('[data-lc]');if(!target)return;
    const a=target.dataset.lc;
    if(a==='close'){close();return;}
    if(a==='promotion-cancel'){$('.lc-promotion')?.remove();selection=null;updateBoard();return;}
    if(a==='details'||a==='details-close'){detailsOpen=a==='details';const panel=$('.lc-detail-panel');if(panel){panel.hidden=!detailsOpen;(detailsOpen?panel.querySelector('button'):$('[data-lc=details]'))?.focus();}return;}
    if(a==='flip'){flipped=!flipped;renderMatch();return;}
    if(['first','prev','next','last','ply'].includes(a)&&match){replay=a==='last'?null:a==='first'?0:a==='prev'?Math.max(0,(replay??match.moves.length)-1):a==='next'?Math.min(match.moves.length,(replay??match.moves.length)+1):Number(target.dataset.ply);selection=null;renderMatch();return;}
    if(a==='pgn'&&match){const blob=new Blob([match.pgn],{type:'application/x-chess-pgn;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='lidya-satranc-'+match.id+'.pgn';root.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    if(a==='resign'||a==='t-cancel'){confirmAction(a==='resign'?'Maçı terk etmek istiyor musun?':'Turnuvayı iptal etmek istiyor musun?',()=>run(e=>handle(a,target,e)));return;}
    run(e=>handle(a,target,e));
  }
  function submit(ev) {
    if(ev.target.id!=='lc-create-tournament')return;ev.preventDefault();
    const data={name:$('#lc-tname').value.trim(),preset:$('#lc-tpreset').value,rounds:Number($('#lc-rounds').value),capacity:Number($('#lc-capacity').value),starts_in_minutes:Number($('#lc-start').value)};
    run(async e=>{const t=await post('/tournaments',data);if(root&&e===epoch){tournament=t;hub.tournament_id=t.id;renderTournament();}});
  }
  function keydown(ev) {
    if(!root)return;
    if(ev.key==='Escape'){if($('.lc-promotion'))$('.lc-promotion').remove();else if($('.lc-confirm'))$('.lc-confirm').remove();else if(detailsOpen){detailsOpen=false;$('.lc-detail-panel').hidden=true;$('[data-lc=details]')?.focus();}else close();return;}
    if(ev.key==='Tab'){
      const scope=$('.lc-promotion')||$('.lc-confirm')||(detailsOpen?$('.lc-detail-panel'):root);
      const els=[...scope.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')].filter(n=>!n.closest('[hidden]'));const first=els[0],last=els.at(-1);
      if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}
    }
    const sq=ev.target.closest('[data-square]');
    if(sq&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){ev.preventDefault();const cells=[...$('.lc-board').children],i=cells.indexOf(sq),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}[ev.key];cells[Math.min(63,Math.max(0,i+delta))]?.focus();}
  }
  async function refresh() {
    if(!root||busy||refreshing||document.hidden)return;
    refreshing=true;const e=epoch;
    try {
      const h=await api('/hub?compact=true');if(!root||e!==epoch||busy)return;
      if(hub&&hub.me.id!==h.me.id){hub=h;match=null;tournament=null;pending=null;selection=null;replay=null;tab='play';shell();renderPlay();return;}
      const old=hub;hub=h;
      if(match) {
        const id=match.id,m=await api('/matches/'+encodeURIComponent(id));if(!root||e!==epoch||match?.id!==id||busy)return;
        const changed=m.revision!==match.revision||m.status!==match.status;setMatch(m);
        if(changed&&!$('.lc-confirm')&&!$('.lc-promotion'))renderMatch();else tick();
      } else if(tournament) {
        const t=await api('/tournaments/'+encodeURIComponent(tournament.id));if(root&&e===epoch&&!busy&&tournament&&JSON.stringify(t)!==JSON.stringify(tournament)){tournament=t;renderTournament();}
      } else if(tab==='play') {
        if(h.active?.status==='active'){await openMatch(h.active.id,e);return;}
        if(h.queue){const d=await post('/queue',{preset:h.queue.slice(0,-1),rated:h.queue.endsWith('R')});if(root&&e===epoch&&!busy&&d.match){setMatch(d.match);flipped=d.match.black.id===hub.me.id;replay=null;renderMatch();return;}}
        if(!root||e!==epoch||busy||tab!=='play'||match)return;
        if(JSON.stringify(old?.invitations?.map(m=>[m.id,m.revision,m.status]))!==JSON.stringify(h.invitations.map(m=>[m.id,m.revision,m.status]))||old?.queue!==h.queue||old?.active?.id!==h.active?.id){
          const typed=$('#lc-friend')?.value,presetValue=$('#lc-preset')?.value,rated=$('#lc-rated')?.checked;
          renderPlay();if($('#lc-friend'))$('#lc-friend').value=typed||'';if($('#lc-preset'))$('#lc-preset').value=presetValue||'5+3';if($('#lc-rated'))$('#lc-rated').checked=rated??true;
        }
      }
      status('');
    }catch(err){if(root&&e===epoch){
      if(err?.status===401||err?.status===403){match=null;tournament=null;hub=null;pending=null;selection=null;$('.lc-content').innerHTML='<p class="lc-note">Oturum doğrulanamadı. Merkezi kapatıp yeniden giriş yap.</p>';}
      status('Bağlantı yenilenemedi. Saatler sunucuda işlemeye devam ediyor.');
    }}
    finally{refreshing=false;}
  }
  function close(cancelQueue=true) {
    if(!root)return;epoch++;clearInterval(pollTimer);clearInterval(clockTimer);root.remove();root=null;busy=false;refreshing=false;selection=null;match=null;tournament=null;pending=null;
    document.removeEventListener('keydown',keydown);document.body.style.overflow=document.body.dataset.lcPreviousOverflow||'';delete document.body.dataset.lcPreviousOverflow;lastFocus?.focus?.();
    if(cancelQueue&&hub?.queue)api('/queue',{method:'DELETE'}).catch(()=>{});
  }
  function open() {
    if(root)return;epoch++;lastFocus=document.activeElement;tab='play';hub=null;match=null;tournament=null;pending=null;replay=null;
    root=document.createElement('section');root.id='lidyaChessCenter';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Lidya Satranç Merkezi');
    document.body.dataset.lcPreviousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.appendChild(root);root.addEventListener('click',click);root.addEventListener('submit',submit);root.addEventListener('input',ev=>{if(ev.target.id==='lc-replay'){replay=Number(ev.target.value);selection=null;renderMatch();}});document.addEventListener('keydown',keydown);shell();$('.lc-close').focus();
    run(async e=>{await loadHub(e);if(root&&e===epoch&&hub?.active?.status==='active'){setMatch(hub.active);flipped=match.black.id===hub.me.id;renderMatch();}});
    pollTimer=setInterval(refresh,2500);clockTimer=setInterval(tick,200);
  }
  function mount() {
    const grid=document.querySelector('#games .eg-launcher-grid');
    if(!grid||grid.querySelector('.lc-chess-launch'))return;
    const el=document.createElement('button');el.type='button';el.className='lc-chess-launch';el.innerHTML=artwork('lc-mark')+'<span class="lc-launch-copy"><strong>Satranç</strong><small>Canlı maç · Turnuva · Antrenman</small></span>';el.addEventListener('click',ev=>{ev.stopPropagation();open();});grid.appendChild(el);
  }
  window.addEventListener('erischat:auth',event=>{
    if(!root)return;const detail=event.detail;
    if(detail?.state==='logged_out'||detail?.state==='ready'&&hub?.me.id&&detail.user?.id&&String(detail.user.id)!==String(hub.me.id))close(false);
  });
  window.addEventListener('storage',event=>{if(root&&['erischat_access_token','erischat.accessToken.v1','token',null].includes(event.key))close(false);});
  window.LidyaChess={open,close};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();

