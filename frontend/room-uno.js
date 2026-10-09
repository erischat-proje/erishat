(() => {
  'use strict';
  const colors={red:'#ee5269',yellow:'#efbd48',green:'#32b88c',blue:'#498df0'};
  const names={red:'Kırmızı',yellow:'Sarı',green:'Yeşil',blue:'Mavi'};
  const values={skip:'⊘',reverse:'⇄',draw2:'+2',wild:'✦',draw4:'+4'};
  const cards=[];
  for(const color of Object.keys(colors)){
    cards.push({id:cards.length,color,value:'0'});
    for(const value of [...Array.from({length:9},(_,i)=>String(i+1)),'skip','reverse','draw2'])
      for(let i=0;i<2;i++)cards.push({id:cards.length,color,value});
  }
  for(const value of ['wild','draw4'])for(let i=0;i<4;i++)cards.push({id:cards.length,color:null,value});
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rid='',epoch=0,data=null,visible=false,pending=false,flight=null,retry=null,error='',offset=0;
  let mode='solo',victory='quick',stake=50,selected=null,armed=false,hiddenRound='',lastRound='',confirmClose=false,rulesOpen=false,handPage=0,revealOpen=false;
  const host=()=>document.getElementById('erisRoomSurface');
  const state=()=>data?.state;
  const me=()=>state()?.players.find(p=>p.user_id===data.my_id);
  const myTurn=()=>state()?.status==='playing'&&state()?.turn===me()?.seat;
  const controls=()=>data?.can_manage||state()?.host===data?.my_id;
  const api=(id,opts)=>window.ErisPlatform.api('/rooms/'+encodeURIComponent(id)+'/uno',opts);
  const button=(label,action,disabled=false,cls='')=>'<button type="button" class="'+cls+'" data-uno-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
  function cardHTML(cid,interactive=false,disabled=false){
    const c=cards[cid];if(!c)return '';
    const text=values[c.value]||c.value;
    const label=(names[c.color]||'Joker')+' '+({skip:'Pas',reverse:'Yön değiştir',draw2:'İki kart çektir',wild:'Renk değiştir',draw4:'Dört kart çektir'}[c.value]||c.value);
    const tag=interactive?'button':'div';
    return '<'+tag+(interactive?' type="button" data-uno-card="'+cid+'" '+(disabled?'disabled':''):'')+' class="uno-card '+(!c.color?'uno-wild':'')+'" style="--uno-color:'+(colors[c.color]||'#313c58')+'" aria-label="'+label+'"><small>'+text+'</small><b>'+text+'</b><small>'+text+'</small></'+tag+'>';
  }
  function clear(){host()?.querySelector('.uno-root')?.remove();host()?.classList.remove('uno-mode');}
  function hide(){if(window.ErisUnoActive)return;visible=false;hiddenRound=state()?.round_id||'';selected=null;confirmClose=false;clear();}
  function notice(message){error=message;render();}
  function receive(result){
    const s=result.state,old=state();
    if(s&&old&&s.round_id===old.round_id&&s.version<old.version)return;
    const same=!!s&&!!old&&s.round_id===old.round_id&&s.version===old.version&&result.balance===data?.balance&&JSON.stringify(result.seats)===JSON.stringify(data?.seats);
    data=result;offset=result.server_time-Date.now()/1000;
    window.ErisUnoActive=!!s&&['lobby','playing','hand_finished'].includes(s.status);
    if(s?.round_id!==lastRound){const root=host()?.querySelector('.uno-root');if(root)delete root.dataset.menu;lastRound=s?.round_id||'';hiddenRound='';selected=null;armed=false;confirmClose=false;rulesOpen=false;handPage=0;}
    if(s?.status==='closed'){visible=false;clear();return;}
    if(s?.status==='finished'&&(window.ErisOkey101Active||host()?.classList.contains('ludo-mode'))){hide();return;}
    if(s&&['lobby','playing','hand_finished'].includes(s.status)){
      visible=true;
      window.dispatchEvent(new CustomEvent('erischat:uno-active'));
    }
    if(s){mode=s.mode;victory=s.victory;stake=s.stake??0;}
    if(selected!==null&&(!myTurn()||!s?.legal?.includes(selected))){selected=null;}
    if(same&&visible&&host()?.querySelector('.uno-root')){clock();return;}
    render();
  }
  async function poll(){
    if(!rid||document.hidden||flight)return;
    const id=rid,gen=epoch,token={};flight=token;
    try{const r=await api(id);if(id===rid&&gen===epoch){receive(r);}}
    catch(e){if(id===rid&&gen===epoch&&visible){error=e.message||'Oyun bağlantısı kesildi.';render();}}
    finally{if(flight===token)flight=null;}
  }
  function key(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);}
  async function send(action,extra={}){
    if(!rid||pending)return;
    if(retry&&action)return notice('Sonucu belirsiz işlemi önce tekrar deneyin.');
    const s=state(),payload=action?{action,round_id:s?.round_id||'',version:s?.version||0,request_key:key(),...extra}:retry;
    if(!payload)return;
    const id=rid,gen=epoch;pending=true;error='';render();
    try{const r=await api(id,{method:'POST',body:JSON.stringify(payload)});if(id===rid&&gen===epoch){retry=null;selected=null;armed=false;confirmClose=false;receive(r);}}
    catch(e){if(id===rid&&gen===epoch){error=e.message||'İşlem tamamlanamadı.';retry=e.status?null:payload;await poll();}}
    finally{if(id===rid&&gen===epoch){pending=false;render();}}
  }
  const rulesHTML='<details class="uno-rules"><summary>Nasıl oynanır?</summary><p>108 kart; herkese 7 kart. Renk, sayı veya sembol eşleştir. Uygun kart yoksa bir kart çek; uygunsa yalnızca çektiğini oynayabilir ya da pas geçebilirsin.</p><p>Pas sonraki oyuncuyu atlar. Yön değiştir sırayı tersine çevirir; iki kişide pas gibi çalışır. +2 ve +4 kart çektirir ve sırayı atlar. Cezalar biriktirilmez.</p><p>+4 mevcut renkten kartın yokken kurala uygundur. Blöf yapılabilir: itiraz haklıysa atan 4; haksızsa itiraz eden 6 kart çeker. Kontrol için el yalnızca itiraz edene gösterilir.</p><p>Tek karta düşerken UNO! de. Unutursan sonraki oyuncu kart atmadan veya çekmeden yakalayan sana 2 kart çektirir. UNO düğmesini kartını atmadan da hazırlayabilirsin.</p><p>Teklide ilk bitiren, eşlide ortağıyla birlikte kazanır. Eşler 1+3 ve 2+4. Hızlı oyun tek eldir; puanlı maçta 500 puana ulaşılır. Sayılar kendi değeri, renkli özel kartlar 20, jokerler 50 puandır.</p><p>Hamle 20 saniye; süre dolarsa bir kart çekilip sıra geçer. Kopan oyuncu 60 saniye içinde koltuğuna dönebilir; ardından bot devralır. Bahis hazır olduğunda bakiyenden ayrılır. Hazırdan çıkış ve bitmemiş oyun iptalinde iade edilir. Tekli kazanan havuzu alır; eşlide iki kazanan eşit paylaşır. Puanlı maçın havuzu maç bitince ödenir.</p></details>';
  function seating(){
    const s=state();
    return '<div class="uno-players">'+[1,2,3,4].map(n=>{
      const p=s?.players.find(p=>p.seat===n),q=data?.seats.find(p=>p.seat===n);
      const score=s?.scores?.[String(s.mode==='paired'?p?.team:n)]||0;
      return '<div class="uno-player '+(p&&s?.status==='playing'&&s.turn===n?'is-turn':'')+' '+(p?.user_id===data?.my_id?'is-me':'')+'"><span class="uno-seat-no">'+n+'</span><strong>'+esc(p?.name||q?.name||'Boş koltuk')+'</strong><small>'+(p?(s.status==='lobby'?'Hazır':p.card_count+' kart')+(s.mode==='paired'?' · Takım '+p.team:'')+(p.bot?' · BOT':p.disconnected_at?' · Bağlantı bekleniyor':'')+(p.uno?' · UNO!':'')+(s.victory==='points'?' · '+score+' puan':''):q?'Hazır değil':'İzleyici')+'</small></div>';
    }).join('')+'</div>';
  }
  const money=n=>Number(n||0).toLocaleString('tr-TR');
  function options(s){
    const locked=pending||!controls()||!!s?.players.length;
    const disabled=locked?'disabled':'';
    return '<div class="uno-options"><label>Mod<select data-uno-option="mode" '+disabled+'><option value="solo" '+(mode==='solo'?'selected':'')+'>Tekli · 2 / 3 / 4 kişi</option><option value="paired" '+(mode==='paired'?'selected':'')+'>Eşli · 2 takım</option></select></label><label>Maç<select data-uno-option="victory" '+disabled+'><option value="quick" '+(victory==='quick'?'selected':'')+'>Hızlı · Tek el</option><option value="points" '+(victory==='points'?'selected':'')+'>500 puan</option></select></label></div><div class="uno-stakes" aria-label="Bahis tutarı">'+(data.stakes||[50,100,150,200,250,300]).map(n=>'<button type="button" data-uno-stake="'+n+'" class="'+(stake===n?'chosen':'')+'" '+disabled+'>'+n+'</button>').join('')+'</div>';
  }
  function lobby(){
    const s=state(),p=me(),eligible=data?.seats.some(p=>p.user_id===data.my_id);
    if(!s||['closed','finished'].includes(s.status))return '<div class="uno-lobby"><h2>Oda UNO</h2><p>2–4 kişi · Tekli veya eşli</p>'+button('Ortak masayı aç','create',pending||(!eligible&&!data?.can_manage),'uno-primary')+'</div>';
    const count=s.players.length,canStart=count>=2&&count<=4&&(s.mode!=='paired'||count===4);
    return '<div class="uno-lobby"><h2>'+count+' / 4 oyuncu hazır</h2>'+options(s)+'<p class="uno-lobby-note">'+(s.players.length?'Ayar değiştirmek için herkes hazırdan çıkmalı.':'Bahsi kurucu belirler; tüm oyuncular aynı tutarla katılır.')+'</p><div class="uno-lobby-actions">'+button(p?'Hazırdan çık · iade':'Hazırım · '+money(stake)+' Lidya',p?'withdraw':'ready',pending||!eligible||(!p&&data.balance<stake),'uno-primary')+(controls()?button('Oyunu başlat','start',pending||!canStart,'uno-primary'):'')+'</div><p>'+(s.mode==='paired'&&count<4?'Eşli oyun için dört oyuncu gerekli.':!eligible?'Oynamak için 1–4. koltuktan birine otur.':!controls()?'Kurucunun başlatması bekleniyor.':'')+'</p></div>';
  }
  function palette(){return '<div class="uno-color-picker" role="group" aria-label="Renk seç"><strong>Devam edecek rengi seç</strong><div>'+Object.entries(colors).map(([c,h])=>'<button type="button" data-uno-color="'+c+'" style="--uno-swatch:'+h+'">'+names[c]+'</button>').join('')+'</div>'+ (selected!==null?button('Vazgeç','cancel-card'):'')+'</div>';}
  function table(){
    const s=state(),p=me(),mine=myTurn(),turn=s.players.find(p=>p.seat===s.turn);
    let action='';
    if(mine&&s.phase==='challenge')action='<div class="uno-challenge"><strong>Sana +4 oynandı</strong><p>Kabul edersen 4 kart; haksız itiraz edersen 6 kart çekersin.</p>'+button('4 kart çek','accept4',pending)+button('İtiraz et','challenge',pending)+'</div>';
    else if(mine&&(s.phase==='opening_color'||selected!==null))action=palette();
    else if(mine)action=button(s.phase==='drawn'?'Pas geç':'Bir kart çek',s.phase==='drawn'?'pass':'draw',pending,'uno-primary');
    else action='<p class="uno-wait">'+esc(turn?.name||'Oyuncu')+' oynuyor…</p>';
    const caught=s.uno_vulnerable!==null&&s.uno_vulnerable!==undefined&&s.uno_vulnerable!==p?.seat;
    const reveal=s.challenge_reveal;
    const hand=p?.hand||[];const pages=Math.max(1,Math.ceil(hand.length/7));handPage=Math.min(handPage,pages-1);
    return '<div class="uno-table"><div class="uno-turn-line"><span>'+(mine?'SIRA SENDE':esc(turn?.name))+'</span><b data-uno-clock></b><span>'+ (s.direction===1?'↻':'↺')+'</span></div><div class="uno-piles"><div class="uno-stock"><div class="uno-card uno-back"><b>ERIS</b><small>'+s.stock_count+' kart</small></div><span>Çekme destesi</span></div><div class="uno-discard">'+cardHTML(s.top_card)+'<span style="--uno-swatch:'+(colors[s.active_color]||'#ddd')+'">'+(names[s.active_color]||'Renk seçiliyor')+'</span></div></div><div class="uno-actions">'+action+'</div></div><div class="uno-hand-area"><div class="uno-hand-label"><strong>'+(p?'Kartların · '+p.card_count:'İzleyici')+'</strong><div>'+(p?button(armed?'UNO hazır ✓':p.uno?'UNO dedin ✓':'UNO!','uno',pending||p.uno||!(p.card_count===1||mine&&p.card_count===2),'uno-call'):'')+(p&&caught?button('UNO demedi!','catch',pending):'')+'</div></div><div class="uno-hand">'+(p?hand.slice(handPage*7,handPage*7+7).map(cid=>cardHTML(cid,true,pending||!!retry||!mine||!s.legal.includes(cid))).join(''):'<p>Kartlar gizli. Oyuncuların hamlelerini izleyebilirsin.</p>')+'</div>'+ (p&&pages>1?'<div class="uno-hand-pages">'+button('‹','hand-prev',handPage===0)+'<span>'+ (handPage+1)+' / '+pages+'</span>'+button('›','hand-next',handPage===pages-1)+'</div>':'')+'</div>'+ (reveal?button('Son +4 kontrolü','reveal',false,'uno-reveal-button'):'');
  }
  function result(){
    const s=state(),winning=s.status==='finished'?s.winners:s.hand_winners;
    const label=s.players.filter(p=>winning.includes(p.seat)).map(p=>p.name).join(' & ');
    return '<div class="uno-result"><span class="uno-eyebrow">'+(s.status==='finished'?'OYUN TAMAMLANDI':'EL TAMAMLANDI')+'</span><div class="uno-trophy">✦</div><h2>'+esc(label)+'</h2><p>'+ (s.mode==='paired'?'Takım kazandı':'Kazandı')+' · '+s.hand_points+' puan'+(s.status==='finished'&&s.pool?' · '+money(s.pool)+' Lidya havuz':'')+'</p><div class="uno-scores">'+s.players.map(p=>'<div><strong>'+esc(p.name)+'</strong><span>'+ (s.scores[String(s.mode==='paired'?p.team:p.seat)]||0)+' puan'+(s.payouts?.[String(p.seat)]?' · '+money(s.payouts[String(p.seat)])+' Lidya':'')+'</span></div>').join('')+'</div>'+(controls()?button(s.status==='hand_finished'?'Sonraki eli başlat':'Yeni masa',s.status==='hand_finished'?'next_hand':'new-menu',pending,'uno-primary'):'<p>Kurucu veya oda yönetimi devam edebilir.</p>')+'</div>';
  }
  function syncSeats(){
    const strip=host()?.querySelector('.uno-room-seats');if(!strip)return;
    const originals=[...host().querySelectorAll('.eris-room-stage > .eris-seat')];
    const scroll=strip.scrollLeft;
    const existing=new Map([...strip.children].map(n=>[n.dataset.seatNumber,n]));
    const keep=new Set();
    originals.forEach((real,index)=>{
      const number=String(real.dataset.seatNumber||index+1);
      let clone=existing.get(number);
      if(!clone){
        clone=real.cloneNode(true);
        clone.classList.remove('eris-seat');clone.classList.add('uno-seat-proxy');
        clone.dataset.seatNumber=number;
        clone.addEventListener('click',e=>{
          e.preventDefault();e.stopImmediatePropagation();
          const live=[...host().querySelectorAll('.eris-room-stage > .eris-seat')].find(n=>String(n.dataset.seatNumber)===number);
          if(!live)return;
          if(window.ErisRoomSeatMenu)window.ErisRoomSeatMenu(live,clone);else live.click();
        });
      }
      if(clone.__sourceHTML!==real.outerHTML){
        clone.innerHTML=real.innerHTML;
        clone.className=real.className.replace(/\beris-seat\b/g,'').trim()+' uno-seat-proxy';
        for(const [key,value] of Object.entries(real.dataset))clone.dataset[key]=value;
        clone.dataset.seatNumber=number;
        clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
        clone.style.visibility='visible';clone.style.pointerEvents='auto';
        clone.__sourceHTML=real.outerHTML;
      }
      keep.add(clone);
      // Appending an existing button unnecessarily also moves the scroll.
      if(strip.children[index]!==clone)strip.insertBefore(clone,strip.children[index]||null);
    });
    [...strip.children].forEach(n=>{if(!keep.has(n))n.remove();});
    strip.scrollLeft=scroll;
    strip.style.setProperty('--room-seat-rows',String(Math.max(1,Math.ceil(originals.length/8))));
  }
  function render(){
    if(!visible||!data||!host())return;
    let root=host().querySelector('.uno-root');
    if(!root){root=document.createElement('section');root.className='uno-root';root.setAttribute('aria-label','Oda UNO oyunu');host().append(root);}
    host().classList.add('uno-mode');
    const s=state();
    const lobbyMode=!s||['lobby','closed'].includes(s.status)||s.status==='finished'&&root.dataset.menu==='true';
    const active=!!s&&['lobby','playing','hand_finished'].includes(s.status);
    const phase=s?.status==='playing'?'game':lobbyMode?'lobby':'result';
    const reveal=s?.challenge_reveal;
    root.dataset.phase=phase;
    root.innerHTML='<header class="uno-header"><div><span class="uno-brand">UNO</span><small>ERISCHAT · '+(s?.mode==='paired'?'EŞLİ':'ODA OYUNU')+'</small></div><div>'+ (s&&controls()&&s.status!=='closed'?button('İptal','close-dialog',pending):'')+button('?','rules',false,'uno-view-close')+(active?'':button('×','hide',false,'uno-view-close'))+'</div></header><div class="uno-room-seats" aria-label="Oda koltukları"></div>'+seating()+'<div class="uno-bet-strip"><span>Bahis <b>'+money(s?.stake??stake)+'</b> L</span><span>Havuz <b>'+money(s?.pool)+'</b> L</span><span>Bakiye <b>'+money(data.balance)+'</b> L</span></div><div class="uno-content">'+(lobbyMode?lobby():['finished','hand_finished'].includes(s.status)?result():table())+'<p class="uno-error" role="status">'+esc(error)+'</p>'+(retry?button('İşlemi tekrar dene','retry',pending):'')+'</div>'+(rulesOpen?'<div class="uno-info-overlay"><header><strong>UNO kuralları</strong>'+button('×','rules')+'</header>'+rulesHTML.replace('<details','<details open')+'</div>':'')+(revealOpen&&reveal?'<div class="uno-info-overlay"><header><strong>+4 kontrolü</strong>'+button('×','reveal')+'</header><p>'+(reveal.guilty?'Blöf yakalandı':'Kart kurala uygun')+'</p><div class="uno-reveal-cards">'+reveal.cards.map(cid=>cardHTML(cid)).join('')+'</div></div>':'')+ (confirmClose?'<div class="uno-confirm" role="dialog" aria-modal="true" aria-label="Oyunu iptal et"><h3>UNO masasını kapat?</h3><p>Bitmemiş oyunun bahisleri oyunculara iade edilir.</p>'+button('Vazgeç','cancel-close')+button('Masayı kapat','close',pending)+'</div>':'');
    root.onclick=handle;
    root.onchange=e=>{if(pending||!controls())return;if(e.target.dataset.unoOption==='mode')mode=e.target.value;else if(e.target.dataset.unoOption==='victory')victory=e.target.value;else return;send('configure',{mode,victory,stake});};
    syncSeats();clock();

  }
  function handle(e){
    const b=e.target.closest('button');if(!b||b.disabled)return;
    const a=b.dataset.unoAction,s=state(),p=me();
    if(a==='hide')return hide();
    if(a==='rules'){rulesOpen=!rulesOpen;return render();}
    if(a==='reveal'){revealOpen=!revealOpen;return render();}
    if(a==='hand-prev'){handPage=Math.max(0,handPage-1);return render();}
    if(a==='hand-next'){handPage++;return render();}
    if(a==='retry')return send(null);
    if(pending||retry)return;
    if(a==='close-dialog'){confirmClose=true;return render();}
    if(a==='cancel-close'){confirmClose=false;return render();}
    if(a==='cancel-card'){selected=null;return render();}
    if(a==='new-menu'){mode=s.mode;victory=s.victory;stake=s.stake||50;return send('create',{mode,victory,stake});}
    if(a==='create')return send('create',{mode,victory,stake:stake||50});
    if(a==='ready')return send('ready',{stake:stake||50});
    if(b.dataset.unoStake)return send('configure',{mode,victory,stake:+b.dataset.unoStake});
    if(a==='uno'){
      if(p.card_count===1)return send('uno');
      armed=!armed;return render();
    }
    if(b.dataset.unoCard!==undefined){
      const cid=+b.dataset.unoCard;
      if(cards[cid].color===null){selected=cid;return render();}
      return send('play',{card:cid,call_uno:armed});
    }
    if(b.dataset.unoColor){
      const color=b.dataset.unoColor;
      return selected!==null?send('play',{card:selected,color,call_uno:armed}):send('color',{color});
    }
    if(a)send(a);
  }
  function clock(){const s=state();host()?.querySelectorAll('[data-uno-clock]').forEach(n=>n.textContent=Math.max(0,Math.ceil((s?.deadline||0)-(Date.now()/1000+offset)))+' sn');}
  async function open(){
    const id=String(window.ErisCurrentRoomId||rid);if(!id)return;
    if(id!==rid){leave();rid=id;}
    hiddenRound='';visible=true;await poll();
    if(!data){notice('Oyun bilgileri yüklenemedi. Menüden tekrar açın.');return;}
    if(data.blocked_by){visible=false;clear();window.toast?.('Önce '+data.blocked_by+' oyununu kapatın.');return;}
    if(!state()||['closed','finished'].includes(state().status)){
      if(data.can_manage||data.seats.some(p=>p.user_id===data.my_id)){
        await send('create',{mode,victory,stake:stake||50});
      }else{
        visible=false;clear();window.toast?.('UNO masasını oda yönetimi veya ilk dört koltuktaki oyuncular açabilir.');return;
      }
    }
    window.dispatchEvent(new CustomEvent('erischat:uno-active'));
    render();
  }
  function leave(){epoch++;rid='';data=null;flight=null;visible=false;pending=false;retry=null;error='';selected=null;armed=false;hiddenRound='';lastRound='';confirmClose=false;rulesOpen=false;revealOpen=false;handPage=0;window.ErisUnoActive=false;clear();}
  window.addEventListener('erischat:room-opened',e=>{const id=String(e.detail?.room?.id||window.ErisCurrentRoomId||'');if(!id)return;if(id!==rid){leave();rid=id;}poll();});
  window.addEventListener('erischat:room-closed',leave);
  window.addEventListener('erischat:room-state-updated',syncSeats);
  for(const name of ['erischat:ludo-active','erischat:okey101-active'])window.addEventListener(name,()=>{if(state()?.status==='finished'||!state()){hide();}});
  setInterval(()=>{poll();clock();},1000);
  window.ErisUno={open};
})();
