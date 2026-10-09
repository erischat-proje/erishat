(() => {
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors=['#b83238','#236dbc','#202c38','#e2a026'], names=['Kırmızı','Mavi','Siyah','Sarı'];
 const host=()=>document.getElementById('erisRoomSurface');
 let rid='',epoch=0,data=null,hidden='',visible=false,pending=false,polling=false,error='',order=[],selected=[],groups=[],editor=null,lastRound='',lastHand=0,offset=0,stake=50,mode='solo',progressive=false,handCount=3,retry=null,menu=false,penalties=true,processing=null,showScores=false;
 const state=()=>data?.state, me=()=>state()?.players.find(p=>p.user_id===data.my_id);
 const mine=()=>state()?.status==='playing'&&me()?.seat===state().turn&&data?.seats.some(q=>q.user_id===data.my_id&&q.seat===me()?.seat);
 const api=opts=>window.ErisPlatform.api('/rooms/'+encodeURIComponent(rid)+'/okey101',opts);
 const face=t=>t>=104?state().joker:[Math.floor(t/26),t%13+1];
 const wild=t=>t<104&&face(t).every((v,i)=>v===state().joker[i]);
 function tile(t,f=face(t),attrs='') {return '<button type="button" class="o101-tile '+(wild(t)?'wild ':'')+(selected.includes(t)?'chosen':'')+'" style="--tile-color:'+colors[f[0]]+'" '+attrs+' aria-label="'+names[f[0]]+' '+f[1]+(wild(t)?' okey':'')+'"><b>'+f[1]+'</b><i>'+(wild(t)?'★':t>=104?'◇':'●')+'</i></button>';}
 function clear(){host()?.querySelector('.o101-root')?.remove();host()?.classList.remove('okey101-mode');visible=false;editor=null;processing=null;}
 function hide(){hidden=state()?.round_id||'empty';clear();}
 function receive(v){const previous=state();if(previous&&v.state?.round_id===previous.round_id&&v.state.version<previous.version)return;const same=previous&&v.state?.round_id===previous.round_id&&v.state?.version===previous.version;data=v;offset=v.server_time-Date.now()/1000;const s=v.state;
   if(window.ErisUnoActive&&(!s||!['lobby','playing','hand_finished'].includes(s.status))){hidden=s?.round_id||'empty';clear();window.ErisOkey101Active=false;return;}
   if(s?.status==='finished'&&(window.ErisUnoActive||host()?.classList.contains('ludo-mode'))){hidden=s.round_id;clear();window.ErisOkey101Active=false;return;}
   window.ErisOkey101Active=!!s&&['lobby','playing','hand_finished','finished'].includes(s.status);
   if(!s||s.status==='closed'){if(visible&&hidden!=='empty')render();else clear();return;}
   if(s.round_id!==lastRound||s.hand_number!==lastHand){order=[];selected=[];groups=[];editor=null;processing=null;showScores=false;menu=false;lastRound=s.round_id;lastHand=s.hand_number;}
   if(hidden===s.round_id)return;
   if(hidden&&hidden!==s.round_id)hidden='';
   if(!same||!visible||!host()?.querySelector('.o101-root'))render();
 }
 async function poll(){if(!rid||polling||!window.ErisPlatform?.api)return;polling=true;const id=rid,gen=epoch;
   try{const v=await api();if(id===rid&&gen===epoch)receive(v);}catch(e){if(visible){error=e.message||'Bağlantı kurulamadı.';render();}}finally{polling=false;}
 }
 async function send(action,extra={},key=null){if(pending||!rid)return;pending=true;error='';const id=rid,gen=epoch;
   const body={action,round_id:state()?.round_id||'',version:state()?.version||0,request_key:key||crypto.randomUUID(),...extra};
   try{const v=await api({method:'POST',body:JSON.stringify(body)});if(id!==rid||gen!==epoch)return;retry=null;if(action==='preview_lay'){processing={plan:v.processing_plan,version:v.state.version,tiles:extra.tiles??null};}else{groups=[];selected=[];editor=null;processing=null;}receive(v);
     const penalty=v.state?.events?.filter(e=>e.kind==='penalty'&&e.seat===me()?.seat).at(-1);
     if(action==='open'&&penalty?.reason==='wrong_open'&&penalty.seq>body.version)error='Hatalı açılış: '+(penalty.message||'Perleri kontrol edin.')+' • 101 ceza puanı';}
   catch(e){if(id!==rid||gen!==epoch)return;error=e.message||'İşlem tamamlanamadı.';if(!e.status||e.status>=500)retry=body;await poll();}
   finally{if(id===rid&&gen===epoch){pending=false;render();}}
 }
 const btn=(label,action,disabled=false)=>'<button type="button" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
 const reasons={wrong_open:'Hatalı açılış',discard_working:'İşlek taş atma',discard_okey:'Bitmeden okey atma',okey_retrieved:'Okeyinizin başka oyuncu tarafından alınması',wrong_take:'Soldan alınan taşı kullanmadan geri bırakma'};
 const rules='<details class="o101-rules"><summary>Oyun kuralları</summary><p>106 taş • Dört oyuncu • Başlayan 22, diğerleri 21 taş. Gösterge +1 aynı renk okeydir; sahte okey yalnızca o sayıyı temsil eder.</p><p>Aynı renkte ardışık en az 3 taş veya aynı sayıda farklı renkli 3–4 taş perdir. 12–13–1 geçersizdir. İlk açılış en az 101 puan ya da 5 aynı renk/sayı çifti. Katlamalı oyunda önceki açılışı geçmelisiniz. Çift açan oyuncu tur başına en fazla iki taş işler. Dört oyuncu çift açarsa aynı el yeniden dağıtılır.</p><p>Açmadan taş işlenmez. Çift açan yeni seri açamaz. Soldan alınan taş açılmalı veya işlenmelidir. Masadaki okey temsil ettiği taşla değiştirilir; grupta dört renk tamamlanmalıdır. Son taş atılarak bitilir.</p><p>Normal bitiş −101; açmayan 202, açan eldeki toplam, çift açan iki katı. Eldeki her gerçek okey +101; bu ek ceza bitiş çarpanıyla katlanmaz. Okeyle bitişte −202 ve rakiplerin cezası iki kat. Elden bitiş aynı turda açıp bitmektir. Kimse açmadan doğrudan bitiş rakibe 404; okeyle 808. Taş biterse aynı elde kalan cezaları yazılır. Eşlide bitenin ortağı elde kalanlardan ceza almaz; daha önceki oyun içi cezalar korunur.</p><p>Cezalı masada hatalı açılış, bitmeden gerçek okey atma, işlek taş atma ve okeyinizin başka oyuncu tarafından alınması otomatik +101 puandır. Ceza puanları Lidya kesintisi değildir. Oyun içi cezalar ayrıca tutulur; bitiş çarpanlarıyla büyümez. Cezasız masada bu cezalar yoktur. Soldan alınan taşı kullanmadan geri bırakmak cezalı masada +101’dir. Taş değeri ×10/×20 ve gösterge çifti varyantları kullanılmaz.</p><p>Maç sonunda en düşük toplam kazanır. Eşlide 1+3 ve 2+4 takım. Eşit puanda havuz paylaşılır; bölünmeyen Lidya koltuk sırasıyla dağıtılır. Ayrılanın yerine bot oynar; süre 45 saniye. X yalnızca görünümü kapatır. Oda yönetimi iptal ederse paylar iade edilir.</p></details>';
 function syncSeats(){
   const strip=host()?.querySelector('.o101-seat-strip');if(!strip)return;
   strip.replaceChildren();
   host().querySelectorAll('.eris-room-stage > .eris-seat').forEach(real=>{
     const clone=real.cloneNode(true);
     clone.classList.remove('eris-seat');clone.classList.add('o101-seat-proxy');
     clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
     clone.style.visibility='visible';clone.style.pointerEvents='auto';
     clone.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();
       if(window.ErisRoomSeatMenu)window.ErisRoomSeatMenu(real,clone);else real.click();
     });
     strip.append(clone);
   });
 }
 function render(){if(!data||!rid||hidden===state()?.round_id)return;const h=host();if(!h)return;
   let root=h.querySelector('.o101-root');if(!root){root=document.createElement('section');root.className='o101-root';h.append(root);}h.classList.add('okey101-mode');visible=true;
   const s=state(),p=me(),lobby=!s||['closed','lobby'].includes(s.status)||menu;
   root.innerHTML='<div class="o101-seat-strip" aria-label="Oda koltukları"></div><header class="o101-head"><strong>101 OKEY</strong><span>'+esc(s?(s.mode==='paired'?'Eşli':'Tekli')+' • '+(s.progressive?'Katlamalı':'Katlamasız')+' • '+(s.pool||s.players.reduce((n,p)=>n+p.stake,0))+' Lidya':'Dört kişilik oda oyunu')+'</span>'+btn('?', 'rules')+btn('×','hide')+'</header><div class="o101-content"></div><div class="o101-error" role="alert">'+esc(error)+(retry?btn('İşlemi tekrar dene','retry'):'')+'</div>';
   syncSeats();
   const content=root.querySelector('.o101-content');
   if(lobby){renderLobby(content);}
   else {renderGame(content);}
   root.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
     if(b.dataset.tile!==undefined){const t=+b.dataset.tile;selected=selected.includes(t)?selected.filter(x=>x!==t):[...selected,t];render();return;}
     if(b.dataset.option!==undefined){const o=(data.lay_options||[])[+b.dataset.option];if(o)send('lay',{tile:o.tile,meld_id:o.meld_id,end:o.end,face:o.face});return;}
     if(b.dataset.lay){if(selected.length!==1)return notice('İşlemek için bir taş seçin.');const g=s.melds.find(x=>x.id===b.dataset.lay);openLay(g,b.dataset.end);return;}
     if(b.dataset.replace){if(selected.length!==1)return notice('Okey yerine koyacağınız tek taşı seçin.');send('replace',{tile:selected[0],meld_id:b.dataset.replace,index:+b.dataset.index});return;}
     action(b.dataset.action,b);
   };
   root.querySelectorAll('[data-tile]').forEach(b=>{b.draggable=true;b.ondragstart=e=>e.dataTransfer.setData('text/plain',b.dataset.tile);b.ondragover=e=>e.preventDefault();b.ondrop=e=>{e.preventDefault();const t=+e.dataTransfer.getData('text/plain'),to=+b.dataset.tile;if(!order.includes(t)||!order.includes(to))return;order=order.filter(x=>x!==t);order.splice(order.indexOf(to),0,t);render();};});
 }
 function notice(s){error=s;render();}
 function renderLobby(out){const s=state(),p=me(),seat=data.seats.find(p=>p.user_id===data.my_id)?.seat,first=s?.players.find(p=>p.seat===1),active=s?.status==='lobby';
   const configurable=!active||(!s.players.length&&(s.host===data.my_id||data.can_manage));
   if(s){mode=s.mode;progressive=s.progressive;handCount=s.hand_count;penalties=!!s.penalties;if(first&&seat!==1)stake=first.stake;}
   out.className='o101-content o101-lobby';
   out.innerHTML='<p>İlk dört koltuk oyuncu, diğer oda üyeleri izleyicidir.</p><div class="o101-settings"><label>Mod<select data-config="mode" '+(!configurable?'disabled':'')+'><option value="solo" '+(mode==='solo'?'selected':'')+'>Tekli</option><option value="paired" '+(mode==='paired'?'selected':'')+'>Eşli • 1+3 / 2+4</option></select></label><label>Açılış<select data-config="progressive" '+(!configurable?'disabled':'')+'><option value="0" '+(!progressive?'selected':'')+'>Katlamasız</option><option value="1" '+(progressive?'selected':'')+'>Katlamalı</option></select></label><label>El sayısı<select data-config="handCount" '+(!configurable?'disabled':'')+'>'+[1,3,5,7].map(n=>'<option '+(n===handCount?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label>Hata cezaları<select data-config="penalties" '+(!configurable?'disabled':'')+'><option value="1" '+(penalties?'selected':'')+'>Cezalı • otomatik</option><option value="0" '+(!penalties?'selected':'')+'>Cezasız</option></select></label></div><div class="o101-players">'+[1,2,3,4].map(n=>{const q=active?s.players.find(p=>p.seat===n):null,card=data.seats.find(p=>p.seat===n);return '<article><b>'+n+'. '+esc(card?.name||'Boş koltuk')+'</b><small>'+(q?'Hazır • '+q.stake+' Lidya':'Hazır değil')+'</small></article>';}).join('')+'</div><p>Bakiye: '+data.balance.toLocaleString('tr-TR')+' Lidya</p><div class="o101-stakes">'+[50,100,150,200,250,300].map(n=>'<button data-action="stake" data-stake="'+n+'" class="'+(n===stake?'chosen':'')+'" '+((active&&first&&seat!==1)||pending?'disabled':'')+'>'+n+'</button>').join('')+'</div><div class="o101-lobby-actions">'+(!active?btn(menu?'Aynı ayarlarla yeni oyun':'Yeni oyun','create',pending||(!seat&&!data.can_manage)||!data.unlocked):((seat?btn(p?'Hazır payımı güncelle':'Hazırım • '+stake+' Lidya','ready',pending||(!first&&seat!==1)):'<p>Oynamak için ilk dört koltuktan birine oturun.</p>')+(p?btn('Vazgeç • Payımı iade et','withdraw',pending):'')+((s.host===data.my_id||data.can_manage)?btn('Oyunu başlat','start',pending||s.players.length!==4):'')))+(active&&data.can_manage?btn('Oyunu iptal et ve iade et','close',pending):'')+'</div>'+rules;
   out.querySelectorAll('[data-config]').forEach(el=>el.onchange=()=>{mode=out.querySelector('[data-config="mode"]').value;progressive=out.querySelector('[data-config="progressive"]').value==='1';handCount=+out.querySelector('[data-config="handCount"]').value;penalties=out.querySelector('[data-config="penalties"]').value==='1';if(active)send('configure',{mode,progressive,hand_count:handCount,penalties});});
 }
 function validGroup(g){const f=g.faces;
   if(new Set(g.tiles).size!==g.tiles.length)return false;
   if(g.kind==='pair')return f.length===2&&f[0][0]===f[1][0]&&f[0][1]===f[1][1];
   if(g.kind==='set')return f.length>=3&&f.length<=4&&new Set(f.map(x=>x[0])).size===f.length&&new Set(f.map(x=>x[1])).size===1;
   return f.length>=3&&new Set(f.map(x=>x[0])).size===1&&f.every((x,i)=>x[1]===f[0][1]+i&&x[1]<=13);
 }
 function meldArt(g){
   const opts=(data.lay_options||[]).filter(o=>selected.length===1&&o.tile===selected[0]&&o.meld_id===g.id);
   const owner=state().players.find(p=>p.seat===g.owner);
   const target=end=>{const list=opts.filter(o=>o.end===end);return list.map(o=>'<button type="button" class="o101-target" data-option="'+data.lay_options.indexOf(o)+'" aria-label="'+names[o.face[0]]+' '+o.face[1]+' işle">＋'+o.face[1]+'</button>').join('');};
   return '<article data-meld="'+g.id+'" class="o101-meld '+(opts.length?'can-lay':'')+'"><small>'+esc(owner?.name||g.owner)+ ' • '+(g.kind==='pair'?'Çift':g.kind==='run'?'Seri':'Grup')+'</small><div class="o101-meld-row">'+target('left')+g.tiles.map((t,i)=>tile(t,g.faces[i],wild(t)?'data-replace="'+g.id+'" data-index="'+i+'"':'')).join('')+target('right')+'</div></article>';
 }
 function renderScores(){
   const s=state();
   const table='<div class="o101-score-scroll"><table><thead><tr><th>El</th>'+s.players.map(p=>'<th>'+esc(p.name)+'</th>').join('')+'</tr></thead><tbody>'+s.history.map(h=>'<tr><td>'+h.hand+(h.kind==='redeal'?' • yeniden':'')+'</td>'+s.players.map(p=>'<td>'+h.scores[String(p.seat)]+'</td>').join('')+'</tr>').join('')+'<tr><th>Toplam</th>'+s.players.map(p=>'<th>'+p.score+'</th>').join('')+'</tr></tbody></table></div>';
   const breakdown=s.score_breakdown?'<div class="o101-breakdown">'+s.players.map(p=>{const b=s.score_breakdown[String(p.seat)];return '<p><b>'+esc(p.name)+'</b>: elde '+b.base+' × '+b.multiplier+'; elde okey '+b.held_okey+'; oyun içi ceza '+b.in_play+' → <strong>'+b.result+'</strong></p>';}).join('')+'</div>':'';
   const hands=['hand_finished','finished'].includes(s.status)?'<div class="o101-revealed-hands">'+s.players.map(p=>'<article><strong>'+esc(p.name)+'</strong><div>'+(p.hand||[]).map(t=>tile(t)).join('')+'</div></article>').join('')+'</div>':'';
   const ledger='<div class="o101-penalty-ledger">'+(s.penalty_log||[]).map(e=>'<p>'+esc(s.players.find(p=>p.seat===e.seat)?.name)+' • '+esc(reasons[e.reason]||e.reason)+' • +'+e.points+'</p>').join('')+'</div>';
   return '<section class="o101-score-panel"><strong>Puan cetveli</strong>'+btn('Kapat','scores')+table+breakdown+hands+ledger+'</section>';
 }
 function renderProcessing(){const plan=processing?.plan,chosen=selected.length===1?selected[0]:null;
   const opts=(data.lay_options||[]).filter(o=>o.tile===chosen);
   return '<section class="o101-processing" role="dialog" aria-label="Taş işle"><header><strong>Taş işle</strong>'+btn('×','cancel-processing')+'</header><p>Elle işlemek için bir taş seçip masada vurgulanan yere dokun. Okeyin temsil edeceği renk ve sayı hedefte gösterilir.</p>'+btn('Elle seç: ıstakaya dön','manual-processing')+btn('Otomatik planı göster','preview-auto',pending)+ (selected.length?btn('Yalnız seçtiğim taşları planla','preview-selected',pending):'')+(plan?'<div class="o101-plan"><strong>'+plan.length+' taş işlenecek</strong>'+plan.map(o=>{const g=state().melds.find(g=>g.id===o.meld_id),owner=state().players.find(p=>p.seat===g?.owner);return '<div>'+tile(o.tile,o.face)+'<span>→ '+esc(owner?.name||'Masa')+' / '+(g?.kind==='run'?'Seri':'Grup')+' / '+(g?.faces||[]).map(f=>f[1]).join('–')+' / '+(o.end==='left'?'Başına':'Sonuna')+'</span></div>';}).join('')+'</div><p>Gerçek okey otomatik kullanılmaz; son atış taşı elde kalır.</p>'+btn('Onayla ve işle','confirm-auto',pending||!plan.length||processing.version!==state().version):'')+'<small>Birden fazla geçerli yer varsa otomatik planı uygulamak yerine kendi yerini seçebilirsin. Otomatik plan geçerli bir öneridir; her durumda en iyi stratejiyi bulma iddiası yoktur. Çift açan oyuncu tur başına en fazla iki taş işler.</small>'+ (chosen!==null?'<div class="o101-manual-options">'+opts.map(o=>{const g=state().melds.find(g=>g.id===o.meld_id),owner=state().players.find(p=>p.seat===g?.owner);return btn(names[o.face[0]]+' '+o.face[1]+' → '+esc(owner?.name||'Masa')+' / '+(g?.faces||[]).map(f=>f[1]).join('–')+' / '+(o.end==='left'?'Başına':'Sonuna'),'manual-option').replace('data-action="manual-option"','data-option="'+data.lay_options.indexOf(o)+'"');}).join('')+'</div>':'')+'</section>';
 }
 function renderGame(out){const s=state(),p=me(),hand=p?.hand||[];
   order=order.filter(t=>hand.includes(t));hand.forEach(t=>{if(!order.includes(t))order.push(t);});selected=selected.filter(t=>hand.includes(t));
   const draft=new Set(groups.flatMap(g=>g.tiles)),remaining=hand.filter(t=>!draft.has(t));
   const total=groups.reduce((n,g)=>n+(g.kind==='pair'?0:g.faces.reduce((a,f)=>a+f[1],0)),0),pairCount=groups.filter(g=>g.kind==='pair').length;
   out.className='o101-content o101-game';
   const mineTurn=mine()&&s.phase==='discard'&&!pending;
   const meldSection=(pair)=>'<section class="o101-meld-section"><h3>'+(pair?'Çift alanı':'Seri ve grup alanı')+'</h3><div class="o101-melds">'+s.melds.filter(g=>(g.kind==='pair')===pair).map(meldArt).join('')+'</div></section>';
   const cards='<div class="o101-players">'+s.players.map(q=>'<article class="'+(q.seat===s.turn?'turn':'')+'"><b>'+q.seat+'. '+esc(q.name)+'</b><small>'+q.hand_count+' taş • '+q.score+' puan'+(q.opened?' • '+(q.opened==='pair'?'Çift':'Seri'):'')+(q.bot?' • BOT':'')+'</small></article>').join('')+'</div>';
   const info='<div class="o101-info">El '+s.hand_number+'/'+s.hand_count+' • Açılış '+s.threshold+' / '+s.pair_threshold+' çift • '+(s.penalties?'Cezalı':'Cezasız')+' • <span data-clock></span>'+btn('Puanlar','scores')+'</div>';
   const deck='<div class="o101-deck"><div>Gösterge '+tile(s.indicator)+'</div>'+btn('Kapalıdan çek • '+s.stock_count,'draw-stock',!mine()||s.phase!=='draw'||pending)+'<div>Okey <span class="o101-joker-face" style="color:'+colors[s.joker[0]]+'">'+s.joker[1]+' ★</span></div></div>';
   const discards='<div class="o101-discards">'+[1,2,3,4].map(n=>{const t=s.discards[String(n)].at(-1);return '<div><small>'+n+'. koltuk</small>'+(t===undefined?'—':tile(t))+'</div>';}).join('')+'</div>';
   const table='<div class="o101-table">'+deck+discards+meldSection(false)+meldSection(true)+'</div>';
   const result=s.status==='finished'?'<div class="o101-result"><strong>Maç tamamlandı</strong><p>'+s.players.filter(q=>s.winners.includes(q.seat)).map(q=>esc(q.name)+' • '+s.payouts?.[String(q.seat)]+' Lidya').join('<br>')+'</p>'+btn('Ana menü','menu')+btn('Tekrar','restart',pending)+btn('Puan cetveli','scores')+'</div>':s.status==='hand_finished'?'<div class="o101-result"><strong>'+(s.redeal?'Dört oyuncu çift açtı':'El tamamlandı')+'</strong><p>'+s.players.map(q=>esc(q.name)+': '+s.round_scores[String(q.seat)]).join(' • ')+'</p><small>'+(s.redeal?'Aynı el yeniden dağıtılacak.':'Sonraki el otomatik başlayacak.')+'</small>'+btn('Puan cetveli','scores')+'</div>':'';
   const rack=p&&s.status==='playing'?'<div class="o101-rack">'+order.filter(t=>!draft.has(t)).map(t=>tile(t,face(t),'data-tile="'+t+'"')).join('')+'</div><div class="o101-actions">'+btn('Seri diz','sort')+btn('Çift diz','sort-pairs')+btn('Per ekle','editor',!mineTurn||!selected.length)+btn('Seri öner','suggest',!mineTurn)+btn('Çift öner','suggest-pairs',!mineTurn)+btn('Taş işle','process',!mineTurn||!p.opened)+btn('Soldan çek','draw-discard',!mine()||s.phase!=='draw'||pending)+btn('Alınan taşı geri bırak','return-discard',!mineTurn||!data.can_return_discard)+btn('Seçili taşı at','discard',!mineTurn||selected.length!==1)+'</div>':(!p?'<p class="o101-watch">İzleyicisiniz. Oyun sürerken oyuncuların taşları gizlidir.</p>':'');
   const draftHtml=groups.length?'<div class="o101-draft"><strong>Açılış: '+(pairCount?pairCount+' çift / '+s.pair_threshold+' çift':total+' puan / '+s.threshold+' puan')+'</strong>'+groups.map((g,i)=>'<article>'+g.tiles.map((t,j)=>tile(t,g.faces[j])).join('')+'<button data-action="remove-group" data-group="'+i+'">×</button></article>').join('')+btn('Perleri aç','open',pending)+(remaining.length===1?btn('Aç ve bitir','open-finish',pending):'')+btn('Taslağı temizle','clear-groups')+'</div>':'';
   const lastPenalty=s.penalty_log?.at(-1);const notice=lastPenalty?'<div class="o101-penalty"><b>'+esc(s.players.find(q=>q.seat===lastPenalty.seat)?.name)+'</b> • '+esc(reasons[lastPenalty.reason]||lastPenalty.reason)+' • +'+lastPenalty.points+' puan</div>':'';
   out.innerHTML=cards+info+notice+table+'<div class="o101-rack-area">'+result+rack+draftHtml+'</div>'+(showScores?renderScores():'')+(processing?renderProcessing():'');
   if(editor)renderEditor(out);clock();
   out.querySelectorAll('.o101-meld').forEach(el=>{el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();const t=+e.dataTransfer.getData('text/plain');if(!hand.includes(t)||!mineTurn)return;const opts=(data.lay_options||[]).filter(o=>o.tile===t&&o.meld_id===el.dataset.meld);selected=[t];if(opts.length===1){const o=opts[0];send('lay',{tile:o.tile,meld_id:o.meld_id,end:o.end,face:o.face});}else{processing=null;notice(opts.length?'Taşın başa veya sona işleneceği yeri seç.':'Bu taş bu pere işlenemez.');}};});
 }
 function renderEditor(out){const edit=document.createElement('section');edit.className='o101-editor';edit.setAttribute('role','dialog');edit.setAttribute('aria-label','Per düzenle');
   edit.innerHTML='<strong>'+ (editor.lay?'Okeyin temsil edeceği taş':'Per düzenle • seçtiğiniz sırada')+'</strong><div>'+editor.tiles.map(t=>'<label>'+tile(t)+'<span>Temsil ettiği</span><select data-color="'+t+'" '+(!wild(t)?'disabled':'')+'>'+names.map((n,c)=>'<option value="'+c+'" '+(face(t)[0]===c?'selected':'')+'>'+n+'</option>').join('')+'</select><select data-number="'+t+'" '+(!wild(t)?'disabled':'')+'>'+Array.from({length:13},(_,i)=>'<option '+(face(t)[1]===i+1?'selected':'')+'>'+(i+1)+'</option>').join('')+'</select></label>').join('')+'</div>'+(editor.lay?'':'<select data-kind><option value="run">Seri</option><option value="set">Grup</option><option value="pair">Çift</option></select>')+btn('Onayla','confirm-editor')+btn('Vazgeç','cancel-editor');out.append(edit);
 }
 function openLay(g,end){const t=selected[0];if(wild(t)){editor={tiles:[t],lay:g.id,end};render();}else send('lay',{tile:t,meld_id:g.id,end});}
 function action(a,b){const s=state();if(!a)return;
   if(a==='hide')return hide();
   if(a==='rules'){let d=host().querySelector('.o101-rules');if(!d){const el=document.createElement('div');el.className='o101-rule-overlay';el.innerHTML=btn('Kapat','close-rules')+rules;host().querySelector('.o101-content').append(el);d=el.querySelector('details');}d.open=true;return;}
   if(a==='close-rules')return b.closest('.o101-rule-overlay')?.remove();
   if(a==='retry'&&retry){const q=retry;return send(q.action,q,q.request_key);}
   if(a==='menu'){menu=true;render();return;}
   if(a==='create')return send(menu?'restart':'create',{mode,progressive,hand_count:handCount,penalties});
   if(a==='restart')return send('restart');
   if(a==='stake'){stake=+b.dataset.stake;render();return;}
   if(['start','withdraw'].includes(a))return send(a);
   if(a==='close'){if(window.confirm('Oyunu kapatıp katılım paylarını iade etmek istiyor musunuz?'))send('close');return;}
   if(a==='ready')return send('ready',{stake});
   if(a==='draw-stock'||a==='draw-discard')return send('draw',{source:a==='draw-stock'?'stock':'discard'});
   if(a==='return-discard'){if(window.confirm('Soldan aldığın taş hâlâ elindeyse geri bırakılır ve kapalıdan çekilir.'+(state().penalties?' Kullanılmadan geri bırakılan taş için 101 ceza yazılır.':'')))send('return_discard');return;}
   if(a==='discard')return send('discard',{tile:selected[0]});
   if(a==='sort'||a==='sort-pairs'){order.sort((x,y)=>a==='sort'?face(x)[0]-face(y)[0]||face(x)[1]-face(y)[1]:face(x)[1]-face(y)[1]||face(x)[0]-face(y)[0]);render();return;}
   if(a==='scores'){showScores=!showScores;render();return;}
   if(a==='process'){processing={};render();return;}
   if(a==='manual-processing'){processing=null;notice('Istakadan tek taş seç; masada vurgulanan işleme yerine dokun.');return;}
   if(a==='cancel-processing'){processing=null;render();return;}
   if(a==='preview-auto'||a==='preview-selected')return send('preview_lay',{tiles:a==='preview-selected'?[...selected]:null});
   if(a==='confirm-auto')return send('auto_lay',{tiles:processing.tiles,plan:processing.plan});
   if(a==='open-finish'){const used=new Set(groups.flatMap(g=>g.tiles));const rest=me().hand.filter(t=>!used.has(t));if(rest.length===1)send('open',{groups,finish_tile:rest[0]});return;}
   if(a==='editor'){editor={tiles:[...selected]};render();return;}
   if(a==='cancel-editor'){editor=null;render();return;}
   if(a==='confirm-editor'){const root=host().querySelector('.o101-editor');const faces=editor.tiles.map(t=>[+root.querySelector('[data-color="'+t+'"]').value,+root.querySelector('[data-number="'+t+'"]').value]);if(editor.lay)return send('lay',{tile:editor.tiles[0],meld_id:editor.lay,end:editor.end,face:faces[0]});const g={kind:root.querySelector('[data-kind]').value,tiles:editor.tiles,faces};if(!validGroup(g))return notice('Bu taşlar seçtiğin türde geçerli per oluşturmuyor. Seri taşlarını küçükten büyüğe seç.');groups.push(g);editor=null;selected=[];render();return;}
   if(a==='remove-group'){groups.splice(+b.dataset.group,1);render();return;}
   if(a==='clear-groups'){groups=[];render();return;}
   if(a==='suggest'||a==='suggest-pairs'){groups=((a==='suggest-pairs'?data.pair_suggestions:data.suggestions)||[]).map(g=>({...g}));selected=[];render();return;}
   if(a==='open'){const pairs=groups.every(g=>g.kind==='pair'),value=pairs?groups.length:groups.reduce((n,g)=>n+g.faces.reduce((a,f)=>a+f[1],0),0),limit=pairs?s.pair_threshold:s.threshold;if(!me().opened&&value<limit)return notice('Açılış yetersiz: '+value+' / '+limit+'. Tek seferde bitiyorsan Aç ve bitir seçeneğini kullan.');return send('open',{groups});}
 }
 function clock(){const s=state();host()?.querySelectorAll('[data-clock]').forEach(n=>n.textContent=s?.status==='playing'?Math.max(0,Math.ceil(s.deadline-(Date.now()/1000+offset)))+' sn':'');}
 async function open(){if(window.ErisUnoActive){window.toast?.('Önce UNO oyununu kapatın.');return;}rid=String(window.ErisCurrentRoomId||window.currentRoomId||rid);hidden='';visible=true;await poll();if(!state()||state().status==='closed'){menu=false;render();}}
 function leave(){epoch++;pending=false;rid='';data=null;hidden='';order=[];groups=[];selected=[];retry=null;lastRound='';lastHand=0;window.ErisOkey101Active=false;clear();}
 window.addEventListener('erischat:room-opened',e=>{const id=String(e.detail?.room?.id||window.ErisCurrentRoomId||'');if(!id)return;if(id!==rid){leave();rid=id;}poll();});
 window.addEventListener('erischat:room-closed',leave);
 window.addEventListener('erischat:ludo-active',()=>{if(state()?.status==='finished'){hide();window.ErisOkey101Active=false;}});
 window.addEventListener('erischat:room-state-updated',syncSeats);
 setInterval(()=>{poll();clock();},1000);
 window.addEventListener('erischat:uno-active',()=>{if(state()?.status==='finished'||!state()){hide();window.ErisOkey101Active=false;}});
 window.ErisOkey101={open};
})();
