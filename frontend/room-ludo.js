(() => {
  'use strict';
  const COLORS={1:'#20c983',2:'#eebc37',3:'#348bf0',4:'#ed526e'}, BOMBS=[4,17,30,43];
const bombPoint=i=>{const q=TRACK[i%TRACK.length];return {x:(q[1]+.5)*100/15,y:(q[0]+.5)*100/15};};
  const START={1:0,2:13,3:26,4:39};
  const TRACK=[[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
  const HOME={1:[[7,1],[7,2],[7,3],[7,4],[7,5]],2:[[1,7],[2,7],[3,7],[4,7],[5,7]],3:[[7,13],[7,12],[7,11],[7,10],[7,9]],4:[[13,7],[12,7],[11,7],[10,7],[9,7]]};
  const CORNERS={1:[0,0],2:[0,9],3:[9,9],4:[9,0]};
  const STAKES=[50,100,150,200,250,300];
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number(n||0).toLocaleString('tr-TR');
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let rid=null,epoch=0,data=null,accepted=-1,round=null,queue=Promise.resolve(),animating=false,pending=false,polling=false;
  let modal=null,mode='solo',stake=50,retry=null,lastError='',resize=null,offset=0,dialogVersion='';
  const surface=()=>document.getElementById('erisRoomSurface');
  const stage=()=>surface()?.querySelector('.eris-room-stage');
  const request=(options)=>window.ErisPlatform.api('/rooms/'+encodeURIComponent(rid)+'/ludo',options);
  const current=()=>data?.state;
  const seatMe=()=>data?.seats?.find(p=>p.user_id===data.my_id)?.seat;
  const playerMe=()=>current()?.players.find(p=>p.user_id===data.my_id);
  const busy=()=>pending||animating;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,reduced()?0:ms));

  function point(seat,token,pos){
    let row,col;
    if(pos<0){const [r,c]=CORNERS[seat];row=r+2+(token>1?2:0);col=c+2+(token%2?2:0);}
    else if(pos<=50)[row,col]=TRACK[(START[seat]+pos)%52].map(n=>n+.5);
    else if(pos<56)[row,col]=HOME[seat][pos-51].map(n=>n+.5);
    else{const centers={1:[7.5,6.5],2:[6.5,7.5],3:[7.5,8.5],4:[8.5,7.5]};[row,col]=centers[seat];row+=(token>1?.16:-.16);col+=(token%2?.16:-.16);}
    return {left:(col/15*100)+'%',top:(row/15*100)+'%'};
  }
  function star(x,y){return '<path d="M0 -3.6 1.1 -1.2 3.6 -1.1 1.7 .8 2.2 3.3 0 2 -2.2 3.3 -1.7 .8 -3.6 -1.1 -1.1 -1.2Z" transform="translate('+x+' '+y+')" fill="#ffd54b" stroke="#99681b" stroke-width=".35"/>';}
  function boardArt(){
    let svg='<svg viewBox="-2 -2 154 154" xmlns="http://www.w3.org/2000/svg" aria-label="Ludo tahtası: dört sarı yıldız güvenli alandır" role="img"><defs><linearGradient id="ludo-rim" x2="1" y2="1"><stop stop-color="#f0d69b"/><stop offset=".35" stop-color="#795b32"/><stop offset=".7" stop-color="#d8ba79"/><stop offset="1" stop-color="#705639"/></linearGradient><linearGradient id="ludo-tile" x2=".8" y2="1"><stop stop-color="#f3f0e9"/><stop offset="1" stop-color="#b8bacb"/></linearGradient>';
    for(const [seat,color] of Object.entries(COLORS))svg+='<linearGradient id="ludo-color-'+seat+'" x2="1" y2="1"><stop stop-color="'+color+'"/><stop offset="1" stop-color="#121d33"/></linearGradient>';
    svg+='</defs><rect x="-1" y="-1" width="152" height="152" rx="6" fill="url(#ludo-rim)"/><rect width="150" height="150" rx="5" fill="#131828"/>';
    for(const [seat,[r,c]] of Object.entries(CORNERS)){
      svg+='<rect x="'+(c*10+1)+'" y="'+(r*10+1)+'" width="58" height="58" rx="5" fill="url(#ludo-color-'+seat+')" stroke="#fff6" stroke-width=".45"/><rect x="'+(c*10+9)+'" y="'+(r*10+9)+'" width="42" height="42" rx="6" fill="#101525" stroke="#e1c789" stroke-width=".6"/>';
      for(let t=0;t<4;t++){const pt=point(+seat,t,-1);svg+='<circle cx="'+parseFloat(pt.left)*1.5+'" cy="'+parseFloat(pt.top)*1.5+'" r="6.8" fill="#090e19" stroke="'+COLORS[seat]+'" stroke-width=".65"/><circle cx="'+parseFloat(pt.left)*1.5+'" cy="'+parseFloat(pt.top)*1.5+'" r="5.6" fill="none" stroke="#e6c99155" stroke-width=".4"/>';}
    }
    TRACK.forEach(([r,c],i)=>{const seat=Object.keys(START).find(n=>START[n]===i);svg+='<rect x="'+(c*10+.35)+'" y="'+(r*10+.35)+'" width="9.3" height="9.3" rx=".8" fill="'+(seat?COLORS[seat]:'url(#ludo-tile)')+'" stroke="#777789" stroke-width=".3"/>';if([8,21,34,47].includes(i))svg+=star(c*10+5,r*10+5);if(seat)svg+='<path d="M-2 -2 2 0 -2 2Z" fill="#fff" transform="translate('+(c*10+5)+' '+(r*10+5)+') rotate('+({1:0,2:90,3:180,4:270}[seat])+')"/>';});
    for(const [seat,cells] of Object.entries(HOME))for(const [r,c] of cells)svg+='<rect x="'+(c*10+.35)+'" y="'+(r*10+.35)+'" width="9.3" height="9.3" rx=".8" fill="'+COLORS[seat]+'" stroke="#fff5" stroke-width=".5"/>';
    const triangles={1:'60,60 60,90 75,75',2:'60,60 90,60 75,75',3:'90,60 90,90 75,75',4:'60,90 90,90 75,75'};
    for(const [seat,points] of Object.entries(triangles))svg+='<polygon points="'+points+'" fill="url(#ludo-color-'+seat+')" stroke="#f5db9a" stroke-width=".5"/>';
    return svg+'<circle cx="75" cy="75" r="3" fill="url(#ludo-rim)"/><path d="M74 75 75 73 76 75 75 77Z" fill="#ffefbf"/></svg>';
  }
  function tokenArt(seat,t){const id='ludo-pawn-'+seat+'-'+t;return '<svg viewBox="0 0 40 48" aria-hidden="true"><defs><radialGradient id="'+id+'"><stop offset="0" stop-color="#fff8"/><stop offset=".4" stop-color="'+COLORS[seat]+'"/><stop offset="1" stop-color="#182136"/></radialGradient></defs><ellipse cx="20" cy="41" rx="15" ry="5" fill="#05081388"/><path d="M12 22 Q13 31 8 37 Q7 43 20 43 Q33 43 32 37 Q27 31 28 22Z" fill="url(#'+id+')" stroke="#e7cc8b" stroke-width="1"/><ellipse cx="20" cy="37" rx="11" ry="3" fill="none" stroke="#ffe8b555"/><circle cx="20" cy="15" r="11" fill="url(#'+id+')" stroke="#ffdf92" stroke-width="1"/><ellipse cx="17" cy="10" rx="4" ry="2.5" fill="#fff8" transform="rotate(-30 17 10)"/><path d="M16 26H24" stroke="#f4d69b" stroke-width="2"/></svg>';}
  function diceArt(value){const layouts={1:[[50,50]],2:[[24,24],[76,76]],3:[[24,24],[50,50],[76,76]],4:[[24,24],[76,24],[24,76],[76,76]],5:[[24,24],[76,24],[50,50],[24,76],[76,76]],6:[[24,24],[76,24],[24,50],[76,50],[24,76],[76,76]]};return '<svg viewBox="0 0 100 100" aria-hidden="true">'+(layouts[value]||layouts[1]).map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="9" fill="#2e2418"/>').join('')+'</svg>';}

  function mount(){
    const host=surface();if(!host)return null;
    let root=host.querySelector(':scope > .ludo-room');
    if(root)return root;
    surface()?.classList.add('ludo-mode');
stage()?.classList.add('ludo-active');
root=document.createElement('section');root.className='ludo-room ludo-enhanced';
const strip=document.createElement('div');
strip.className='ludo-seat-strip';

const syncSeats=()=>{
  const originals=[...document.querySelectorAll('#erisRoomSurface .eris-room-stage > .eris-seat')];
  strip.replaceChildren();
  originals.forEach(real=>{
    const clone=real.cloneNode(true);
    clone.classList.remove('eris-seat');
    clone.classList.add('ludo-seat-proxy');
    clone.style.visibility='visible';
    clone.style.pointerEvents='auto';
    clone.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      if(window.ErisRoomSeatMenu) window.ErisRoomSeatMenu(real,clone);
      else real.click();
    });
    strip.appendChild(clone);
  });
};

syncSeats();
root.setAttribute('aria-label','Oda Ludo oyunu');
    root.innerHTML='<button class="ludo-view-close" data-view-close type="button" aria-label="Ludo görünümünü kapat">×</button><div class="ludo-toolbar"><strong>LUDO</strong><span class="ludo-pool"></span><button data-settings aria-label="Ludo ayarları">⚙</button><button data-stop>Oyunu kapat</button></div><div class="ludo-players"></div><div class="ludo-board-space"><div class="ludo-board">'+boardArt()+'</div></div><div class="ludo-control"><div class="ludo-dice-wrap"><button class="ludo-die" data-die="0" aria-label="Birinci zar"></button><button class="ludo-die" data-die="1" aria-label="İkinci zar"></button><button class="ludo-roll" aria-label="İki zar at">ZAR AT</button></div><div class="ludo-status" aria-live="polite"></div></div>';
    root.prepend(strip);
host.append(root);
root.__syncLudoSeats=syncSeats;
root.querySelector('[data-settings]').onclick=open;
    root.querySelector('[data-stop]').onclick=()=>stopDialog();
    root.querySelector('[data-view-close]').onclick=()=>{
      closeDialog();
      clearBoard();
    };
    root.querySelector('.ludo-roll').onclick=()=>send('roll');
    resize?.disconnect();const fit=()=>{const area=root.querySelector('.ludo-board-space');const d=Math.max(1,Math.min(area.clientWidth,area.clientHeight));root.querySelector('.ludo-board').style.width=d+'px';};
    if(window.ResizeObserver){resize=new ResizeObserver(fit);resize.observe(root.querySelector('.ludo-board-space'));}requestAnimationFrame(fit);
    return root;
  }
  function closeRoomOverlays(){
    const host=surface();
    document.getElementById('eris-seat-actions')?.remove();
    document.querySelector('.eris-seat-action-sheet')?.remove();
    document.getElementById('erisUserProfileModal')?.remove();
    window.ErisFloatingProfile?.close?.();
    if(host){
      host.querySelectorAll('.room-v5-panel.show,.room-v3-panel.show').forEach(n=>n.classList.remove('show'));
      const contribution=host.querySelector('#erisRoomContribution');
      if(contribution) contribution.hidden=true;
    }
  }

  function isLudoTarget(target){
    if(!(target instanceof Element))return false;
    return !!target.closest('.ludo-room,.ludo-modal,.eris-room-chat,#erisRoomMinimize,#erisRoomFloatingBubble');
  }

  function guardRoomEvent(event){
    const host=surface();
    if(!host?.classList.contains('ludo-mode'))return;
    if(isLudoTarget(event.target))return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  ['pointerdown','click','contextmenu'].forEach(type=>{
    document.addEventListener(type,event=>{
      const host=surface();
      if(!host?.classList.contains('ludo-mode'))return;
      if(!(event.target instanceof Element)||!host.contains(event.target))return;
      guardRoomEvent(event);
    },true);
  });

  function clearBoard(){
    resize?.disconnect();resize=null;
    const host=surface(),roomStage=stage();
    closeDialog();
    host?.querySelector(':scope > .ludo-room')?.remove();
    host?.querySelectorAll(':scope > .ludo-modal').forEach(n=>n.remove());

    host?.classList.remove('ludo-mode');
    roomStage?.classList.remove('ludo-active');

    roomStage?.style.removeProperty('visibility');
    roomStage?.style.removeProperty('pointer-events');
    roomStage?.style.removeProperty('opacity');
    roomStage?.querySelectorAll(':scope > .eris-seat').forEach(seat=>{
      seat.style.removeProperty('visibility');
      seat.style.removeProperty('pointer-events');
      seat.style.removeProperty('opacity');
    });

    document.getElementById('eris-seat-actions')?.remove();
    document.querySelector('.eris-seat-action-sheet')?.remove();
    host?.querySelectorAll('.room-v5-panel.show,.room-v3-panel.show').forEach(n=>n.classList.remove('show'));
    const contribution=host?.querySelector('#erisRoomContribution');
    if(contribution) contribution.hidden=true;

    Promise.resolve(window.ErisRoomUI?.refresh?.()).catch(()=>{});
    window.dispatchEvent(new CustomEvent('erischat:ludo-view-closed',{detail:{room_id:rid}}));
  }
  function render(snapshot=data){
    if(!snapshot||!rid)return;
    if(animating){surface()?.querySelectorAll('.ludo-token,.ludo-dice,[data-stop]').forEach(n=>n.disabled=true);return;}
    const s=snapshot.state;
    surface()?.querySelector(':scope > .ludo-room')?.__syncLudoSeats?.();
    /* Gecici state yoklugu aktif Ludo gorunumunu kapatamaz. */
    if(!s){
      if(surface()?.classList.contains('ludo-mode')){
        modal?.__syncLudoSeats?.();
        return;
      }
      renderDialog();
      return;
    }

    /* Oyun state'i kapanabilir; Ludo gorunumu kullanici kapatmadikca acik kalir.
       Tahtayi temizle ve yeni oyun/lobi ekranina don. */
    if(s.status==='closed'){
      resize?.disconnect();
      resize=null;
      surface()?.querySelector(':scope > .ludo-room')?.remove();

      if(surface()?.classList.contains('ludo-mode')){
        stage()?.classList.add('ludo-active');
        if(!modal){
          dialog();
          modal?.classList.add('ludo-inline-lobby');
        }
        renderDialog();
      }
      return;
    }

    if(s.status==='lobby'){
      /* Lobi Ludo modunun kendisidir.
         clearBoard() burada ludo-mode'u kaldırmamalı. */
      surface()?.classList.add('ludo-mode');
      stage()?.classList.add('ludo-active');
      modal?.__syncLudoSeats?.();
      renderDialog();
      return;
    }
    const root=mount();if(!root)return;
    root.querySelector('[data-stop]').hidden=!snapshot.can_manage;
    root.querySelector('[data-stop]').disabled=busy();
    root.querySelector('.ludo-pool').textContent=money(s.pool??s.players.reduce((n,p)=>n+p.stake,0))+' Lidya • '+(s.mode==='paired'?'Eşli':'Tekli');
    root.querySelector('.ludo-players').innerHTML=[1,2,3,4].map(seat=>{const p=s.players.find(p=>p.seat===seat)||snapshot.seats.find(p=>p.seat===seat);return '<div class="ludo-player '+(s.status==='playing'&&s.turn===seat?'active':'')+'" style="--pawn:'+COLORS[seat]+'"><b>'+seat+'. '+esc(p?.name||'Boş koltuk')+'</b><small>'+(p?.bot?'BOT • ':s.mode==='paired'?'Takım '+(seat===1||seat===3?'1':'2')+' • ':'')+(p?.stake?money(p.stake)+' Lidya':'İzleyici')+'</small></div>';}).join('');
    const board=root.querySelector('.ludo-board');

    for(const bomb of (s.bombs||[])){
      let b=board.querySelector('[data-bomb="'+bomb.id+'"]');
      if(!b){
        b=document.createElement('div');
        b.className='ludo-bomb';
        b.dataset.bomb=bomb.id;
        b.textContent='💣';
        board.append(b);
      }
      const bp=bombPoint(bomb.square);
      b.style.left=bp.x+'%';
      b.style.top=bp.y+'%';
      b.classList.toggle('used',!!bomb.used);
    }

    for(const p of s.players)for(let i=0;i<4;i++){
      let node=board.querySelector('[data-pawn="'+p.seat+'-'+i+'"]');if(!node){node=document.createElement('button');node.className='ludo-token';node.type='button';node.dataset.pawn=p.seat+'-'+i;node.innerHTML=tokenArt(p.seat,i);board.append(node);node.onclick=()=>{const selected=window.ludoSelectedDie;const m=(data.moves||[]).find(x=>x.token===i&&(!selected||x.die===selected))||(data.moves||[]).find(x=>x.token===i);if(m)send('move',{token:i,die:m.die});};}
      Object.assign(node.style,point(p.seat,i,p.tokens[i]));
      // Spread stacks without changing their actual square.
      const stack=s.players.flatMap(q=>q.tokens.map((pos,t)=>({seat:q.seat,t,pos}))).filter(q=>q.pos>=0&&q.pos<=50&&p.tokens[i]>=0&&p.tokens[i]<=50&&(START[q.seat]+q.pos)%52===(START[p.seat]+p.tokens[i])%52);
      const rank=stack.findIndex(q=>q.seat===p.seat&&q.t===i);node.style.translate=stack.length>1?((rank%3-1)*18)+'% '+(Math.floor(rank/3)*-18)+'%':'';
      const playable=!busy()&&s.status==='playing'&&p.user_id===snapshot.my_id&&s.turn===p.seat&&snapshot.legal.includes(i);
      node.classList.toggle('playable',playable);node.classList.toggle('finished',p.tokens[i]===56);node.disabled=!playable;node.setAttribute('aria-label',p.name+' '+(i+1)+'. piyon'+(playable?' • hareket et':''));
    }
    const valid=new Set(s.players.flatMap(p=>p.tokens.map((_,i)=>p.seat+'-'+i)));board.querySelectorAll('[data-pawn]').forEach(n=>{if(!valid.has(n.dataset.pawn))n.remove();});
    const diceValues=(s.dice||[]).length? s.dice : [...s.events].reverse().find(e=>e.kind==='roll')?.dice||[];
    const pending=s.pending_dice||[];
    const dieButtons=[...root.querySelectorAll('.ludo-die')];
    dieButtons.forEach((btn,i)=>{
      const value=diceValues[i];
      btn.innerHTML=value?diceArt(value):'';
      btn.disabled=!value||busy()||s.status!=='playing';
      btn.classList.toggle('active',!!pending.find(x=>x.index===i));
      btn.onclick=()=>{if(value&&!busy()){window.ludoSelectedDie=value;}};
    });
    const roll=root.querySelector('.ludo-roll');
    const p=s.players.find(p=>p.seat===s.turn);
    roll.disabled=busy()||s.status!=='playing'||pending.length>0||p?.user_id!==snapshot.my_id||p?.bot;
    let message=s.status==='lobby'?'Hazırlık: katılım payını seçip hazır olun.':s.status==='finished'?'Oyun tamamlandı.':pending.length?(p?.user_id===snapshot.my_id?'Parçanızı seçin.':(p?.name||'Oyuncu')+' oynuyor.'):(p?.name||'Oyuncu')+(p?.bot?' • Bot oynuyor.':' zar atıyor.');
    if(pending.length===2&&pending[0].value===6&&pending[1].value===6) message+=' • 6+6! Tekrar zar hakkı';
    const status=root.querySelector('.ludo-status');status.innerHTML='<span>'+esc(lastError||message)+'</span><small>'+(s.status==='playing'?'<span class="ludo-clock"></span> • ':'' )+(s.status==='lobby'?'<button data-lobby>Oyun ayarları</button>':s.events.at(-1)?.kind==='pass'?esc(s.events.at(-1).reason):'Sarı yıldızlar güvenli alan')+'</small>'+(retry?'<button data-retry>İşlemi tekrar dene</button>':'')+(!busy()&&snapshot.legal.length?'<span class="ludo-picks">'+snapshot.legal.map(i=>'<button data-pick="'+i+'" aria-label="'+(i+1)+'. piyonu hareket ettir">'+(i+1)+'</button>').join('')+'</span>':'');
    status.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{
  const token=Number(b.dataset.pick);
  const selected=window.ludoSelectedDie;const m=(data.moves||[]).find(x=>x.token===token&&(!selected||x.die===selected))||(data.moves||[]).find(x=>x.token===token);
  if(m)send('move',{token,die:m.die});
});
    status.querySelector('[data-lobby]')?.addEventListener('click',open);status.querySelector('[data-retry]')?.addEventListener('click',()=>send(null));updateClock();
    if(s.status==='finished'&&!board.querySelector('.ludo-result')){const result=document.createElement('div');result.className='ludo-result';result.innerHTML='<strong>Zafer!</strong><p>'+s.players.filter(p=>s.winners.includes(p.seat)).map(p=>esc(p.name)).join(' & ')+'</p><p>Kişi başına '+money(s.payout)+' Lidya</p>';board.append(result);}
    renderDialog();
  }
  function updateClock(){const s=current();const seconds=Math.max(0,Math.ceil((s?.deadline||0)-(Date.now()/1000+offset)));surface()?.querySelectorAll('.ludo-clock').forEach(n=>n.textContent=seconds+' sn');}
  function sparkle(board){if(reduced())return;for(let i=0;i<24;i++){const node=document.createElement('i');node.className='ludo-spark';node.style.cssText='left:50%;top:50%;--spark:'+Object.values(COLORS)[i%4];board.append(node);if(node.animate){const a=node.animate([{transform:'translate(0,0) rotate(0)',opacity:1},{transform:'translate('+((Math.random()-.5)*230)+'px,'+((Math.random()-.5)*230)+'px) rotate(360deg)',opacity:0}],{duration:1100,easing:'ease-out'});a.finished.catch(()=>{}).finally(()=>node.remove());}else node.remove();}}
  async function animateEvent(e, generation){
    if(epoch!==generation)return;
    const root=surface()?.querySelector('.ludo-room');if(!root)return;
    if(e.kind==='roll'){
      const dice=[...root.querySelectorAll('.ludo-die')];dice.forEach(d=>d.classList.add('rolling'));let tick=0;const interval=setInterval(()=>dice.forEach(d=>d.innerHTML=diceArt((tick++%6)+1)),70);await wait(650);clearInterval(interval);dice.forEach((d,i)=>{d.classList.remove('rolling');d.innerHTML=diceArt((e.dice||[e.die])[i]||e.die||1);});
      if(e.die===6&&dice.animate&&!reduced())dice.animate([{boxShadow:'0 0 0 #ffe18e'},{boxShadow:'0 0 25px #ffe18e'},{boxShadow:'0 0 0 #ffe18e'}],{duration:600});
    }else if(e.kind==='move'){
      const node=root.querySelector('[data-pawn="'+e.seat+'-'+e.token+'"]');if(!node)return;
      node.classList.add('moving');node.style.translate='';Object.assign(node.style,point(e.seat,e.token,e.before));
      for(const hit of e.captured||[]){const victim=root.querySelector('[data-pawn="'+hit.seat+'-'+hit.token+'"]');if(victim)Object.assign(victim.style,point(hit.seat,hit.token,hit.pos));}
      const steps=e.before<0?[0]:Array.from({length:e.after-e.before},(_,i)=>e.before+i+1);
      for(const pos of steps){if(epoch!==generation)break;const p=point(e.seat,e.token,pos),before={left:node.style.left,top:node.style.top};if(node.animate&&!reduced()){const a=node.animate([{...before,transform:'translateY(0) scale(1)'},{left:p.left,top:p.top,transform:'translateY(-5px) scale(1.13)'},{...p,transform:'translateY(0) scale(1)'}],{duration:145,easing:'ease-out'});await a.finished.catch(()=>{});}Object.assign(node.style,p);}
      node.classList.remove('moving');
      for(const hit of e.captured||[]){const victim=root.querySelector('[data-pawn="'+hit.seat+'-'+hit.token+'"]');if(!victim)continue;const end=point(hit.seat,hit.token,-1);if(victim.animate&&!reduced()){const a=victim.animate([{left:victim.style.left,top:victim.style.top,transform:'scale(1)'},{left:end.left,top:end.top,transform:'translateY(-10px) scale(.6)',opacity:.4},{...end,transform:'scale(1)',opacity:1}],{duration:550,easing:'cubic-bezier(.2,.8,.3,1)'});await a.finished.catch(()=>{});}Object.assign(victim.style,end);}
      if(e.after===56)sparkle(root.querySelector('.ludo-board'));
    }else if(e.kind==='bomb'){
      const bomb=root.querySelector('[data-bomb="'+e.bomb+'"]');
      if(bomb){
        for(const sq of e.path||[]){
          if(epoch!==generation)break;
          const bp=bombPoint(sq);
          if(bomb.animate&&!reduced()){
            const a=bomb.animate([{left:bomb.style.left,top:bomb.style.top},{left:bp.x+'%',top:bp.y+'%'}],{duration:110,easing:'linear'});
            await a.finished.catch(()=>{});
          }
          bomb.style.left=bp.x+'%';
          bomb.style.top=bp.y+'%';
        }
        bomb.classList.add('explode');
        await wait(450);
        bomb.classList.remove('explode');
      }
    }else if(e.kind==='win')sparkle(root.querySelector('.ludo-board'));
  }
  function receive(snapshot){
    if(!rid)return;offset=snapshot.server_time-Date.now()/1000;
    const s=snapshot.state;
    if(s&&s.round_id===round&&s.version<accepted)return;
    const first=!round||s?.round_id!==round,previous=accepted;
    data=snapshot;

    /* Gecici bos snapshot aktif Ludo gorunumunu kapatmasin. */
    if(!s){
      if(surface()?.classList.contains('ludo-mode')){
        modal?.__syncLudoSeats?.();
        return;
      }
      renderDialog();
      return;
    }

    round=s.round_id;
    accepted=s.version;

    if(first){
      epoch++;
      queue=Promise.resolve();
      animating=false;
      pending=false;
      retry=null;

      /* round_id degisimi UI modundan cikis degildir.
         Lobby/oyun gecislerinde Ludo gorunumu korunur. */
      if(surface()?.classList.contains('ludo-mode')){
        surface()?.classList.add('ludo-mode');
        stage()?.classList.add('ludo-active');

        if(s.status==='lobby'){
          surface()?.querySelector('.ludo-room')?.remove();
          modal?.__syncLudoSeats?.();
        }else{
          closeDialog();
        }
      }

      render();
      return;
    }
    if(s.version===previous){if(!animating)render();return;}
    const events=s.events.filter(e=>e.seq>previous),generation=epoch;if(events.length&&events[0].seq>previous+1){render();return;}
    queue=queue.catch(()=>{}).then(async()=>{if(epoch!==generation)return;animating=true;render(snapshot);try{for(const event of events)await animateEvent(event,generation);}finally{if(epoch===generation){animating=false;render();}}});
  }
  async function poll(){if(!rid||polling||document.hidden)return;polling=true;const id=rid,generation=epoch;try{const result=await request();if(rid===id&&epoch===generation)receive(result);}catch(e){if(rid===id&&epoch===generation&&current()?.status==='playing'){lastError=e.message;render();}}finally{polling=false;}}
  async function send(action,extra={}){
    if(!rid||busy())return;
    if(retry&&action){lastError='Önce sonucu belirsiz işlemi tekrar deneyin.';render();return;}
    const payload=action?{action,round_id:current()?.round_id||'',version:current()?.version||0,request_key:crypto.randomUUID(),...extra}:retry;
    if(!payload)return;pending=true;lastError='';render();const id=rid,generation=epoch;
    try{const result=await request({method:'POST',body:JSON.stringify(payload)});if(rid!==id||epoch!==generation)return;retry=null;receive(result);if(action==='start')closeDialog();window.ErisProfile?.refresh?.();}
    catch(e){if(rid!==id||epoch!==generation)return;lastError=e.message;if(!e.status)retry=payload;else retry=null;await poll();}
    finally{if(rid===id&&epoch===generation){pending=false;render();}}
  }
  function closeDialog(){modal?.remove();modal=null;dialogVersion='';}
  function dialog(){closeDialog();const focus=document.activeElement;modal=document.createElement('div');modal.className='ludo-modal';modal.innerHTML='<section class="ludo-dialog" role="dialog" aria-modal="true" aria-label="Ludo oyun ayarları"><header><h2>Oda Ludo</h2><button data-close aria-label="Pencereyi kapat">×</button></header><div data-body></div></section>';const host=surface();
if(!host){modal=null;return;}
host.append(modal);

/* Lobi açıkken de bütün oda koltuklarını üstte canlı göster. */
const lobbySeats=document.createElement('div');
lobbySeats.className='ludo-lobby-seats';

const syncLobbySeats=()=>{
  const originals=[...document.querySelectorAll('#erisRoomSurface .eris-room-stage > .eris-seat')];
  lobbySeats.replaceChildren();

  originals.forEach(real=>{
    const clone=real.cloneNode(true);
    clone.classList.remove('eris-seat');
    clone.classList.add('ludo-seat-proxy');
    clone.style.visibility='visible';
    clone.style.pointerEvents='auto';

    clone.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      if(window.ErisRoomSeatMenu) window.ErisRoomSeatMenu(real,clone);
      else real.click();
    });

    lobbySeats.appendChild(clone);
  });
};

syncLobbySeats();
modal.prepend(lobbySeats);
modal.__syncLudoSeats=syncLobbySeats;

const dismissLudo=()=>{
  closeDialog();
  clearBoard();
  focus?.focus?.();
};
modal.querySelector('[data-close]').onclick=dismissLudo;
modal.onclick=e=>{if(e.target===modal)dismissLudo();};
modal.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();dismissLudo();}if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};modal.querySelector('[data-close]').focus();}
  const ruleText='<details><summary>Oyun kuralları</summary><ul><li>Yalnızca 1–4. koltuklar katılır. Tekli: 2 veya 4 oyuncu. Eşli: dört oyuncu; 1–3 ve 2–4 takım olur.</li><li>Dört piyonunuzu 6 ile çıkarın, saat yönünde ilerleyin. Her 6 ek zar verir; üçüncü ardışık 6 geçersiz olur ve sıra değişir.</li><li>Dört sarı yıldızda piyonlar güvendedir. Diğer alanlarda rakip piyonlar başlangıca döner; takım arkadaşları birbirini yakalayamaz.</li><li>Eve tam sayıyla girilir. Aynı karede piyonlar birlikte durabilir; yol kapanmaz. Yakalamak ek zar vermez.</li><li>Teklide dört piyonunu, eşlide takımın sekiz piyonunu eve ulaştıran kazanır. Havuz tek kazanana veya kazanan iki partnere eşit ödenir.</li><li>Odadan veya koltuktan ayrılınca bot devralır. Bot rakip yakalayamaz. Sıra için 30 saniye vardır; süre dolunca güvenli bir otomatik hamle yapılır.</li><li>Hazırlıkta ayrılanın katkısı iade edilir. Oda yönetimi oyunu kapatırsa bitmemiş oyunun tüm katkıları iade edilir. Hazırlık süresi 10 dakikadır.</li></ul></details>';
  function renderDialog(){
    if(!modal||!data||modal.dataset.stop)return;
    const s=current(),lobby=s?.status==='lobby',playing=s?.status==='playing',me=playerMe(),eligible=!!seatMe(),mySeat=seatMe(),seat1=s?.players?.find(p=>p.seat===1),gameStake=seat1?.stake??stake;
    if(lobby&&mySeat!==1&&seat1)stake=seat1.stake;
    const signature=JSON.stringify([s?.round_id,s?.version,data.balance,pending,animating,mode,stake,lastError,retry]);if(signature===dialogVersion)return;dialogVersion=signature;
    const body=modal.querySelector('[data-body]');
    body.innerHTML='<p>Ludo yalnızca bu odada oynanır. İlk dört koltuk oyuncu, diğer üyeler izleyicidir.</p>'+(!lobby&&!playing?'<h3>Oyun modu</h3><div class="ludo-modes"><button data-mode="solo" class="'+(mode==='solo'?'chosen':'')+'">Tekli • 2 / 4 kişi</button><button data-mode="paired" class="'+(mode==='paired'?'chosen':'')+'">Eşli • 4 kişi</button></div>':'<div class="ludo-summary">'+(s.mode==='paired'?'Eşli • 1+3 ve 2+4 takım':'Tekli • Herkes kendi adına')+' • Havuz '+money(s.pool??s.players.reduce((n,p)=>n+p.stake,0))+' Lidya</div>')+
      (lobby?'<h3>Katılım payınız • Bakiye '+money(data.balance)+' Lidya</h3><div class="ludo-stakes">'+STAKES.map(n=>'<button data-stake="'+n+'" class="'+((mySeat!==1&&seat1?gameStake:stake)===n?'chosen':'')+'" '+(!eligible||busy()||(mySeat!==1&&!!seat1)||n>data.balance+(me?.stake||0)?'disabled':'')+'>'+n+'</button>').join('')+'</div>':'')+
      '<div class="ludo-ready-cards">'+[1,2,3,4].map(seat=>{const p=s?.players.find(p=>p.seat===seat),q=data.seats.find(p=>p.seat===seat);return '<div class="ludo-ready-card" style="--pawn:'+COLORS[seat]+'"><b>'+seat+'. '+esc(p?.name||q?.name||'Boş koltuk')+'</b><small>'+(p?money(p.stake)+' Lidya • '+(lobby?'Hazır':p.bot?'BOT':'Oyuncu'):q?'Hazır değil':'İlk dört koltuktan biri')+'</small></div>';}).join('')+'</div>'+
      (!lobby&&!playing?'<button class="ludo-primary" data-create '+(!data.unlocked||(!eligible&&!data.can_manage)||busy()?'disabled':'')+'>Oyunu kur</button>':lobby?(eligible?'<button class="ludo-primary" data-ready '+(busy()||stake>data.balance+(me?.stake||0)?'disabled':'')+'>'+ (me?'Katılım payını güncelle':'Hazırım • '+stake+' Lidya')+'</button>'+(me?'<button data-withdraw '+(busy()?'disabled':'')+'>Vazgeç ve katkımı iade et</button>':''):'<p>Katılmak için 1–4. koltuklardan birine oturun.</p>')+((s.host===data.my_id||data.can_manage)?'<button class="ludo-primary" data-start '+(busy()||![2,4].includes(s.players.length)||(s.mode==='paired'&&s.players.length!==4)?'disabled':'')+'>Oyunu başlat</button>':'<p>Oyun kurucusunun başlatması bekleniyor.</p>'):'<p>Oyun başladı. Pencereyi kapatıp tahtadan devam edin.</p>')+
      '<p class="ludo-error" role="alert">'+esc(lastError)+'</p>'+(retry?'<button data-retry>İşlemi tekrar dene</button>':'')+ruleText;
    body.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;renderDialog();});body.querySelectorAll('[data-stake]').forEach(b=>b.onclick=()=>{stake=Number(b.dataset.stake);renderDialog();});
    body.querySelector('[data-create]')?.addEventListener('click',()=>send('create',{mode}));body.querySelector('[data-ready]')?.addEventListener('click',()=>send('ready',{stake:(mySeat!==1&&seat1?seat1.stake:stake)}));body.querySelector('[data-withdraw]')?.addEventListener('click',()=>send('withdraw'));body.querySelector('[data-start]')?.addEventListener('click',()=>send('start'));body.querySelector('[data-retry]')?.addEventListener('click',()=>send(null));
  }
  function stopDialog(){if(!data?.can_manage)return;dialog();modal.dataset.stop='true';modal.querySelector('h2').textContent='Oyunu kapat';const body=modal.querySelector('[data-body]');body.innerHTML='<p>Bitmemiş oyunda tüm katılım payları oyunculara iade edilir. Oyun kapatılsın mı?</p><button class="ludo-primary">Oyunu kapat</button>';body.querySelector('button').onclick=async()=>{closeDialog();await send('close');};}
  async function open(){
    if(!rid)return;
    await poll();
    if(!data)return;
    if(!data.unlocked){
      window.toast?.('Ludo 4. oda seviyesinde açılır.');
      return;
    }

    mode=current()?.mode||'solo';
    stake=playerMe()?.stake||50;

    const host=surface();
    if(!host)return;

    /* Ludo açılırken normal oda popup/panelleri arkada açık kalmasın. */
    host.querySelectorAll('.room-v5-panel.show,.room-v3-panel.show').forEach(panel=>{
      panel.classList.remove('show');
    });
    document.getElementById('eris-seat-actions')?.remove();

    closeRoomOverlays();
    host.classList.add('ludo-mode');
    stage()?.classList.add('ludo-active');

    /* Oyun zaten başladıysa doğrudan tahtayı göster. */
    if(current()?.status==='playing'||current()?.status==='finished'){
      closeDialog();
      render();
      return;
    }

    /* Hazırlık/lobi ekranı oda içindeki Ludo alanında açılır. */
    dialog();
    modal?.classList.add('ludo-inline-lobby');
    renderDialog();
  }
  function leave(){epoch++;rid=null;data=null;round=null;accepted=-1;queue=Promise.resolve();animating=false;pending=false;retry=null;lastError='';closeDialog();clearBoard();}
  window.addEventListener('erischat:room-opened',e=>{
    const nextRid=String(e.detail?.room?.id||window.ErisCurrentRoomId||'');
    if(!nextRid)return;

    /* Ayni odanin yeniden render/open eventi Ludo'yu kapatamaz. */
    if(rid===nextRid){
      modal?.__syncLudoSeats?.();
      surface()?.querySelector(':scope > .ludo-room')?.__syncLudoSeats?.();
      poll();
      return;
    }

    /* Yalnizca gercekten baska odaya geciste eski Ludo oturumunu temizle. */
    leave();
    rid=nextRid;
    poll();
  });
  window.addEventListener('erischat:room-state-updated',()=>{
    if(!rid||animating)return;
    if(!surface()?.classList.contains('ludo-mode'))return;
    modal?.__syncLudoSeats?.();
    surface()?.querySelector(':scope > .ludo-room')?.__syncLudoSeats?.();
    render();
  });
  window.addEventListener('erischat:room-closed',leave);
  setInterval(()=>{poll();updateClock();},1000);
  window.ErisLudo={open};
})();
