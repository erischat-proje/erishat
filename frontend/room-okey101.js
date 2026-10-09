(() => {
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors=['#b83238','#236dbc','#202c38','#e2a026'], names=['Kırmızı','Mavi','Siyah','Sarı'];
 const host=()=>document.getElementById('erisRoomSurface');
 let rid='',epoch=0,data=null,hidden='',visible=false,pending=false,polling=false,error='',order=[],selected=[],groups=[],editor=null,lastRound='',lastHand=0,offset=0,stake=50,mode='solo',progressive=false,handCount=3,retry=null,menu=false;
 const state=()=>data?.state, me=()=>state()?.players.find(p=>p.user_id===data.my_id);
 const mine=()=>state()?.status==='playing'&&me()?.seat===state().turn;
 const api=opts=>window.ErisPlatform.api('/rooms/'+encodeURIComponent(rid)+'/okey101',opts);
 const face=t=>t>=104?state().joker:[Math.floor(t/26),t%13+1];
 const wild=t=>t<104&&face(t).every((v,i)=>v===state().joker[i]);
 function tile(t,f=face(t),attrs='') {return '<button type="button" class="o101-tile '+(wild(t)?'wild ':'')+(selected.includes(t)?'chosen':'')+'" style="--tile-color:'+colors[f[0]]+'" '+attrs+' aria-label="'+names[f[0]]+' '+f[1]+(wild(t)?' okey':'')+'"><b>'+f[1]+'</b><i>'+(wild(t)?'★':t>=104?'◇':'●')+'</i></button>';}
 function clear(){host()?.querySelector('.o101-root')?.remove();host()?.classList.remove('okey101-mode');visible=false;editor=null;}
 function hide(){hidden=state()?.round_id||'empty';clear();}
 function receive(v){const previous=state();if(previous&&v.state?.round_id===previous.round_id&&v.state.version<previous.version)return;const same=previous&&v.state?.round_id===previous.round_id&&v.state?.version===previous.version;data=v;offset=v.server_time-Date.now()/1000;const s=v.state;
   if(s?.status==='finished'&&host()?.classList.contains('ludo-mode')){hidden=s.round_id;clear();window.ErisOkey101Active=false;return;}
   window.ErisOkey101Active=!!s&&['lobby','playing','hand_finished','finished'].includes(s.status);
   if(!s||s.status==='closed'){if(visible&&hidden!=='empty')render();else clear();return;}
   if(s.round_id!==lastRound||s.hand_number!==lastHand){order=[];selected=[];groups=[];editor=null;menu=false;lastRound=s.round_id;lastHand=s.hand_number;}
   if(hidden===s.round_id)return;
   if(hidden&&hidden!==s.round_id)hidden='';
   if(!same||!visible||!host()?.querySelector('.o101-root'))render();
 }
 async function poll(){if(!rid||polling||!window.ErisPlatform?.api)return;polling=true;const id=rid,gen=epoch;
   try{const v=await api();if(id===rid&&gen===epoch)receive(v);}catch(e){if(visible){error=e.message||'Bağlantı kurulamadı.';render();}}finally{polling=false;}
 }
 async function send(action,extra={},key=null){if(pending||!rid)return;pending=true;error='';const id=rid,gen=epoch;
   const body={action,round_id:state()?.round_id||'',version:state()?.version||0,request_key:key||crypto.randomUUID(),...extra};
   try{const v=await api({method:'POST',body:JSON.stringify(body)});if(id!==rid||gen!==epoch)return;retry=null;groups=[];selected=[];editor=null;receive(v);}
   catch(e){if(id!==rid||gen!==epoch)return;error=e.message||'İşlem tamamlanamadı.';if(!e.status||e.status>=500)retry=body;await poll();}
   finally{pending=false;if(id===rid&&gen===epoch)render();}
 }
 const btn=(label,action,disabled=false)=>'<button type="button" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
 const rules='<details class="o101-rules"><summary>Oyun kuralları</summary><p>106 taş • Dört oyuncu • Başlayan 22, diğerleri 21 taş. Gösterge +1 aynı renk okeydir; sahte okey yalnızca o sayıyı temsil eder.</p><p>Aynı renkte ardışık en az 3 taş veya aynı sayıda farklı renkli 3–4 taş perdir. 12–13–1 geçersizdir. İlk açılış en az 101 puan ya da 5 aynı renk/sayı çifti. Katlamalı oyunda önceki açılışı geçmelisiniz.</p><p>Açmadan taş işlenmez. Çift açan yeni seri açamaz. Soldan alınan taş açılmalı veya işlenmelidir. Masadaki okey temsil ettiği taşla değiştirilir; grupta dört renk tamamlanmalıdır. Son taş atılarak bitilir.</p><p>Normal bitiş −101; açmayan 202, açan eldeki toplam, çift açan iki katı. Elde okey +101. Okeyle bitişte −202 ve rakiplerin cezası iki kat. Kimse açmadan doğrudan bitiş 404; okeyle 808. Taş biterse aynı elde kalan cezaları yazılır. Eşlide bitenin ortağı 0 alır.</p><p>Maç sonunda en düşük toplam kazanır. Eşlide 1+3 ve 2+4 takım. Eşit puanda havuz paylaşılır; bölünmeyen Lidya koltuk sırasıyla dağıtılır. Ayrılanın yerine bot oynar; süre 45 saniye. X yalnızca görünümü kapatır. Oda yönetimi iptal ederse paylar iade edilir.</p></details>';
 function render(){if(!data||!rid||hidden===state()?.round_id)return;const h=host();if(!h)return;
   let root=h.querySelector('.o101-root');if(!root){root=document.createElement('section');root.className='o101-root';h.append(root);}h.classList.add('okey101-mode');visible=true;
   const s=state(),p=me(),lobby=!s||['closed','lobby'].includes(s.status)||menu;
   root.innerHTML='<header class="o101-head"><strong>101 OKEY</strong><span>'+esc(s?(s.mode==='paired'?'Eşli':'Tekli')+' • '+(s.progressive?'Katlamalı':'Katlamasız')+' • '+(s.pool||s.players.reduce((n,p)=>n+p.stake,0))+' Lidya':'Dört kişilik oda oyunu')+'</span>'+btn('?', 'rules')+btn('×','hide')+'</header><div class="o101-content"></div><div class="o101-error" role="alert">'+esc(error)+(retry?btn('İşlemi tekrar dene','retry'):'')+'</div>';
   const content=root.querySelector('.o101-content');
   if(lobby){renderLobby(content);}
   else {renderGame(content);}
   root.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
     if(b.dataset.tile!==undefined){const t=+b.dataset.tile;selected=selected.includes(t)?selected.filter(x=>x!==t):[...selected,t];render();return;}
     if(b.dataset.lay){if(selected.length!==1)return notice('İşlemek için bir taş seçin.');const g=s.melds.find(x=>x.id===b.dataset.lay);openLay(g,b.dataset.end);return;}
     if(b.dataset.replace){if(selected.length!==1)return notice('Okey yerine koyacağınız tek taşı seçin.');send('replace',{tile:selected[0],meld_id:b.dataset.replace,index:+b.dataset.index});return;}
     action(b.dataset.action,b);
   };
   root.querySelectorAll('[data-tile]').forEach(b=>{b.draggable=true;b.ondragstart=e=>e.dataTransfer.setData('text/plain',b.dataset.tile);b.ondragover=e=>e.preventDefault();b.ondrop=e=>{e.preventDefault();const t=+e.dataTransfer.getData('text/plain'),to=+b.dataset.tile;if(!order.includes(t)||!order.includes(to))return;order=order.filter(x=>x!==t);order.splice(order.indexOf(to),0,t);render();};});
 }
 function notice(s){error=s;render();}
 function renderLobby(out){const s=state(),p=me(),seat=data.seats.find(p=>p.user_id===data.my_id)?.seat,first=s?.players.find(p=>p.seat===1),active=s?.status==='lobby';
   const configurable=!active||(!s.players.length&&(s.host===data.my_id||data.can_manage));
   if(s){mode=s.mode;progressive=s.progressive;handCount=s.hand_count;if(first&&seat!==1)stake=first.stake;}
   out.className='o101-content o101-lobby';
   out.innerHTML='<p>İlk dört koltuk oyuncu, diğer oda üyeleri izleyicidir.</p><div class="o101-settings"><label>Mod<select data-config="mode" '+(!configurable?'disabled':'')+'><option value="solo" '+(mode==='solo'?'selected':'')+'>Tekli</option><option value="paired" '+(mode==='paired'?'selected':'')+'>Eşli • 1+3 / 2+4</option></select></label><label>Açılış<select data-config="progressive" '+(!configurable?'disabled':'')+'><option value="0" '+(!progressive?'selected':'')+'>Katlamasız</option><option value="1" '+(progressive?'selected':'')+'>Katlamalı</option></select></label><label>El sayısı<select data-config="handCount" '+(!configurable?'disabled':'')+'>'+[1,3,5,7].map(n=>'<option '+(n===handCount?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div><div class="o101-players">'+[1,2,3,4].map(n=>{const q=active?s.players.find(p=>p.seat===n):null,card=data.seats.find(p=>p.seat===n);return '<article><b>'+n+'. '+esc(card?.name||'Boş koltuk')+'</b><small>'+(q?'Hazır • '+q.stake+' Lidya':'Hazır değil')+'</small></article>';}).join('')+'</div><p>Bakiye: '+data.balance.toLocaleString('tr-TR')+' Lidya</p><div class="o101-stakes">'+[50,100,150,200,250,300].map(n=>'<button data-action="stake" data-stake="'+n+'" class="'+(n===stake?'chosen':'')+'" '+((active&&first&&seat!==1)||pending?'disabled':'')+'>'+n+'</button>').join('')+'</div><div class="o101-lobby-actions">'+(!active?btn(menu?'Aynı ayarlarla yeni oyun':'Yeni oyun','create',pending||(!seat&&!data.can_manage)||!data.unlocked):((seat?btn(p?'Hazır payımı güncelle':'Hazırım • '+stake+' Lidya','ready',pending||(!first&&seat!==1)):'<p>Oynamak için ilk dört koltuktan birine oturun.</p>')+(p?btn('Vazgeç • Payımı iade et','withdraw',pending):'')+((s.host===data.my_id||data.can_manage)?btn('Oyunu başlat','start',pending||s.players.length!==4):'')))+(active&&data.can_manage?btn('Oyunu iptal et ve iade et','close',pending):'')+'</div>'+rules;
   out.querySelectorAll('[data-config]').forEach(el=>el.onchange=()=>{mode=out.querySelector('[data-config="mode"]').value;progressive=out.querySelector('[data-config="progressive"]').value==='1';handCount=+out.querySelector('[data-config="handCount"]').value;if(active)send('configure',{mode,progressive,hand_count:handCount});});
 }
 function renderGame(out){const s=state(),p=me();const hand=p?.hand||[];
   order=order.filter(t=>hand.includes(t));hand.forEach(t=>{if(!order.includes(t))order.push(t);});selected=selected.filter(t=>hand.includes(t));
   const draft=new Set(groups.flatMap(g=>g.tiles));
   out.className='o101-content o101-game';
   out.innerHTML='<div class="o101-players">'+s.players.map(q=>'<article class="'+(q.seat===s.turn?'turn':'')+'"><b>'+q.seat+'. '+esc(q.name)+'</b><small>'+q.hand_count+' taş • '+q.score+' puan'+(q.opened?' • '+(q.opened==='pair'?'Çift':'Seri'):'')+(q.bot?' • BOT':'')+'</small></article>').join('')+'</div><div class="o101-info">El '+s.hand_number+'/'+s.hand_count+' • Açılış '+s.threshold+' / '+s.pair_threshold+' çift • <span data-clock></span></div><div class="o101-table"><div class="o101-deck"><div>Gösterge '+tile(s.indicator)+'</div>'+btn('Kapalıdan çek • '+s.stock_count,'draw-stock',!mine()||s.phase!=='draw'||pending)+'<div>Okey '+tile(104,s.joker)+'</div></div><div class="o101-discards">'+[1,2,3,4].map(n=>{const t=s.discards[String(n)].at(-1);return '<div><small>'+n+'. koltuk</small>'+(t===undefined?'—':tile(t))+'</div>';}).join('')+'</div><div class="o101-melds">'+s.melds.map(g=>'<div class="o101-meld">'+btn('＋',null,!mine()||!p?.opened||g.kind==='pair').replace('data-action="null"','data-lay="'+g.id+'" data-end="left"')+g.tiles.map((t,i)=>tile(t,g.faces[i],wild(t)?'data-replace="'+g.id+'" data-index="'+i+'"':'')).join('')+btn('＋',null,!mine()||!p?.opened||g.kind==='pair').replace('data-action="null"','data-lay="'+g.id+'" data-end="right"')+'</div>').join('')+'</div></div><div class="o101-rack-area">'+(s.status==='finished'?'<div class="o101-result"><strong>Maç tamamlandı</strong><p>'+s.players.filter(q=>s.winners.includes(q.seat)).map(q=>esc(q.name)+' • '+s.payouts?.[String(q.seat)]+' Lidya').join('<br>')+'</p>'+btn('Ana menü','menu')+btn('Tekrar','restart',pending)+'</div>':s.status==='hand_finished'?'<div class="o101-result"><strong>El tamamlandı</strong><p>'+s.players.map(q=>esc(q.name)+': '+s.round_scores[String(q.seat)]).join(' • ')+'</p><small>Sonraki el otomatik başlayacak.</small></div>':'')+(p?'<div class="o101-rack">'+order.filter(t=>!draft.has(t)).map(t=>tile(t,face(t),'data-tile="'+t+'"')).join('')+'</div><div class="o101-actions">'+btn('Seri diz','sort')+btn('Çift diz','sort-pairs')+btn('Per ekle','editor',!mine()||s.phase!=='discard'||!selected.length||pending)+btn('Seri öner','suggest',!mine()||s.phase!=='discard'||pending)+btn('Çift öner','suggest-pairs',!mine()||s.phase!=='discard'||pending)+btn('Soldan çek','draw-discard',!mine()||s.phase!=='draw'||pending)+btn('Seçili taşı at','discard',!mine()||s.phase!=='discard'||selected.length!==1||pending)+'</div>':'<p class="o101-watch">İzleyicisiniz. Oyuncuların taşları gizlidir.</p>')+(groups.length?'<div class="o101-draft">'+groups.map((g,i)=>'<div>'+esc(g.kind==='pair'?'Çift':g.kind==='run'?'Seri':'Grup')+' • '+g.faces.map(f=>f[1]).join('–')+' <button data-action="remove-group" data-group="'+i+'">×</button></div>').join('')+btn('Perleri aç','open',pending)+btn('Taslağı temizle','clear-groups')+'</div>':'')+'</div>';
   if(editor)renderEditor(out);
   clock();
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
   if(a==='create')return send(menu?'restart':'create',{mode,progressive,hand_count:handCount});
   if(a==='restart')return send('restart');
   if(a==='stake'){stake=+b.dataset.stake;render();return;}
   if(['start','withdraw'].includes(a))return send(a);
   if(a==='close'){if(window.confirm('Oyunu kapatıp katılım paylarını iade etmek istiyor musunuz?'))send('close');return;}
   if(a==='ready')return send('ready',{stake});
   if(a==='draw-stock'||a==='draw-discard')return send('draw',{source:a==='draw-stock'?'stock':'discard'});
   if(a==='discard')return send('discard',{tile:selected[0]});
   if(a==='sort'||a==='sort-pairs'){order.sort((x,y)=>a==='sort'?face(x)[0]-face(y)[0]||face(x)[1]-face(y)[1]:face(x)[1]-face(y)[1]||face(x)[0]-face(y)[0]);render();return;}
   if(a==='editor'){editor={tiles:[...selected]};render();return;}
   if(a==='cancel-editor'){editor=null;render();return;}
   if(a==='confirm-editor'){const root=host().querySelector('.o101-editor');const faces=editor.tiles.map(t=>[+root.querySelector('[data-color="'+t+'"]').value,+root.querySelector('[data-number="'+t+'"]').value]);if(editor.lay)return send('lay',{tile:editor.tiles[0],meld_id:editor.lay,end:editor.end,face:faces[0]});groups.push({kind:root.querySelector('[data-kind]').value,tiles:editor.tiles,faces});editor=null;selected=[];render();return;}
   if(a==='remove-group'){groups.splice(+b.dataset.group,1);render();return;}
   if(a==='clear-groups'){groups=[];render();return;}
   if(a==='suggest'||a==='suggest-pairs'){groups=((a==='suggest-pairs'?data.pair_suggestions:data.suggestions)||[]).map(g=>({...g}));selected=[];render();return;}
   if(a==='open')return send('open',{groups});
 }
 function clock(){const s=state();host()?.querySelectorAll('[data-clock]').forEach(n=>n.textContent=s?.status==='playing'?Math.max(0,Math.ceil(s.deadline-(Date.now()/1000+offset)))+' sn':'');}
 async function open(){rid=String(window.ErisCurrentRoomId||window.currentRoomId||rid);hidden='';visible=true;await poll();if(!state()||state().status==='closed'){menu=false;render();}}
 function leave(){epoch++;rid='';data=null;hidden='';order=[];groups=[];selected=[];retry=null;lastRound='';lastHand=0;window.ErisOkey101Active=false;clear();}
 window.addEventListener('erischat:room-opened',e=>{const id=String(e.detail?.room?.id||window.ErisCurrentRoomId||'');if(!id)return;if(id!==rid){leave();rid=id;}poll();});
 window.addEventListener('erischat:room-closed',leave);
 window.addEventListener('erischat:ludo-active',()=>{if(state()?.status==='finished'){hide();window.ErisOkey101Active=false;}});
 setInterval(()=>{poll();clock();},1000);
 window.ErisOkey101={open};
})();
