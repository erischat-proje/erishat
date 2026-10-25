'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../frontend/chess-center.js'),'utf8');
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const white={id:'w',name:'Beyaz <img src=x onerror=alert(1)>',rating:1200},black={id:'b',name:'Siyah',rating:1200};
const baseMatch=()=>({id:'m1',white:{...white},black:{...black},viewer:'w',mode:'live',status:'active',rated:true,preset:'5+3',fen:START,moves:[],legal:['e2e4','e2e3','g1f3'],turn:'w',white_ms:300000,black_ms:300000,revision:0,result:'*',reason:null,check:false,draw_by:null,rating_delta:{},tournament_id:null,pgn:'[Event "Lidya"]\n\n*'});
const baseHub=()=>({me:{...white},stats:{wins:0,draws:0,losses:0},active:null,queue:null,tournament_id:null,invitations:[],tournaments:[]});
const baseTournament=()=>({id:'t1',name:'Akşam <script>bad()</script>',owner_id:'w',status:'registration',preset:'5+3',rounds:3,round:0,capacity:16,starts_at:'2026-10-23T14:00:00Z',standings:[],matches:[]});
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function setup() {
 const dom=new JSDOM('<!doctype html><html data-eris-theme="light"><body><button id="previous">Önceki</button><section id="games"><div class="eg-launcher-grid"></div></section></body></html>',{runScripts:'outside-only',url:'https://example.test',pretendToBeVisual:true});
 const w=dom.window,d=w.document,timers=[],calls=[];
 w.setInterval=fn=>{timers.push(fn);return timers.length;};w.clearInterval=()=>{};
 const state={hub:baseHub(),match:baseMatch(),tournament:baseTournament(),handler:null};
 w.ErisPlatform={api:async(p,o={})=>{const data=o.body?JSON.parse(o.body):null;calls.push({p,o,data});if(state.handler){const r=await state.handler(p,o,data);if(r!==undefined)return structuredClone(r);}
 if(p.startsWith('/chess/hub'))return structuredClone(state.hub);
 if(p==='/chess/practice')return structuredClone({...state.match,mode:'bot',rated:false,black:{id:null,name:'Antrenman botu',rating:null}});
 if(p==='/chess/queue')return o.method==='DELETE'?{ok:true}:{queued:true,match:null};
 if(p==='/chess/invite')return structuredClone({...state.match,status:'invited',mode:'friend',rated:false});
 if(p==='/chess/tournaments'||p==='/chess/tournaments/t1'||p.endsWith('/tournaments/t1/action'))return structuredClone(state.tournament);
 if(p==='/chess/history?offset=0')return {items:[{id:'m1',white:white.name,black:'Siyah',result:'1-0',finished_at:'2026-10-23T12:00:00Z',rated:true}],has_more:true};
 if(p.startsWith('/chess/history'))return {items:[],has_more:false};
 if(p==='/chess/leaderboard')return {items:[{...white,wins:1,draws:0,losses:0}]};
 if(p==='/chess/matches/m1'||p==='/chess/matches/m1/action')return structuredClone(state.match);
 throw new Error('Unhandled API '+p);}};
 w.eval(source);d.dispatchEvent(new w.Event('DOMContentLoaded'));await flush();
 const q=s=>d.querySelector(s),click=async s=>{const el=typeof s==='string'?q(s):s;assert(el,'Missing '+s);el.click();await flush();};
 const open=async()=>{w.LidyaChess.open();await flush();};
 const poll=async()=>{await timers[0]();await flush();};
 return {dom,w,d,q,click,open,poll,state,calls,timers};
}
const tests=[];function test(name,fn){tests.push([name,fn]);}
test('menu entry mounts once and survives menu redraw; open/close restores focus and body',async()=>{
 const x=await setup();await x.click('.lc-chess-launch');assert(x.q('#lidyaChessCenter'));assert.equal(x.q('#lidyaChessCenter').getAttribute('aria-modal'),'true');assert.equal(x.d.body.style.overflow,'hidden');
 x.w.eval(source);assert.equal(x.d.querySelectorAll('.lc-chess-launch').length,1);
 await x.click('[data-lc=close]');assert(!x.q('#lidyaChessCenter'));assert.equal(x.d.body.style.overflow,'');
 x.q('.eg-launcher-grid').innerHTML='';await flush();assert.equal(x.d.querySelectorAll('.lc-chess-launch').length,1);x.dom.window.close();
});
test('safe text and board has 64 accessible squares; basic practice and flip',async()=>{
 const x=await setup();await x.open();assert(x.q('.lc-content').textContent.includes(white.name));assert(!x.q('.lc-content img[src=x]'));assert(!x.q('.lc-content [onerror]'));await x.click('[data-lc=practice]');assert.equal(x.d.querySelectorAll('[data-square]').length,64);assert(x.q('[data-square=e1]').getAttribute('aria-label').includes('Beyaz Şah'));assert(x.q('[data-clock=white]').textContent==='∞');
 assert.equal(x.q('[data-square]').dataset.square,'a8');await x.click('[data-lc=flip]');assert.equal(x.q('[data-square]').dataset.square,'h1');x.w.LidyaChess.close();x.dom.window.close();
});
test('tap-to-move uses server legal list and sends revision plus stable key',async()=>{
 const x=await setup();x.state.hub.active=x.state.match;await x.open();
 x.state.handler=async(p,o,b)=>{if(p.endsWith('/move')){assert.equal(b.uci,'e2e4');assert.equal(b.revision,0);assert(b.key.length>=8);x.state.match={...x.state.match,revision:1,turn:'b',legal:[],moves:[{uci:'e2e4',san:'e4',fen:START.replace('PPPPPPPP','PPPP1PPP')}]};return x.state.match;}};
 await x.click('[data-square=e2]');assert(x.q('[data-square=e4]').classList.contains('legal'));await x.click('[data-square=e5]');assert.equal(x.calls.filter(c=>c.p.endsWith('/move')).length,0);
 await x.click('[data-square=e2]');await x.click('[data-square=e4]');assert.equal(x.calls.filter(c=>c.p.endsWith('/move')).length,1);assert(x.q('.lc-moves').textContent.includes('e4'));x.w.LidyaChess.close();x.dom.window.close();
});
test('failed move can retry using identical idempotency key',async()=>{
 const x=await setup();x.state.hub.active=x.state.match;await x.open();let n=0;
 x.state.handler=async(p,o,b)=>{if(p.endsWith('/move')){n++;if(n===1)throw new Error('Ağ koptu');return {...x.state.match,revision:1,turn:'b',legal:[],moves:[{uci:b.uci,san:'e4',fen:START}]};}};
 await x.click('[data-square=e2]');await x.click('[data-square=e4]');assert(x.q('.lc-notice').textContent.includes('Ağ koptu'));await x.click('[data-lc=retry]');const calls=x.calls.filter(c=>c.p.endsWith('/move'));assert.equal(calls.length,2);assert.equal(calls[0].data.key,calls[1].data.key);x.w.LidyaChess.close();x.dom.window.close();
});
test('promotion dialog offers all four pieces and sends selected underpromotion',async()=>{
 const x=await setup();x.state.match={...x.state.match,fen:'7k/P7/8/8/8/8/8/4K3 w - - 0 1',legal:['a7a8q','a7a8r','a7a8b','a7a8n']};x.state.hub.active=x.state.match;await x.open();await x.click('[data-square=a7]');await x.click('[data-square=a8]');assert.equal(x.d.querySelectorAll('[data-promotion]').length,4);
 x.state.handler=async(p,o,b)=>{if(p.endsWith('/move')){assert.equal(b.uci,'a7a8n');return {...x.state.match,revision:1};}};await x.click('[data-promotion=a7a8n]');assert(!x.q('.lc-promotion'));x.w.LidyaChess.close();x.dom.window.close();
});
test('replay disables moves until live; keyboard navigation and PGN download',async()=>{
 const x=await setup();x.state.match={...x.state.match,revision:2,moves:[{uci:'e2e4',san:'e4',fen:START},{uci:'e7e5',san:'e5',fen:START}]};x.state.hub.active=x.state.match;await x.open();await x.click('[data-lc=first]');assert.equal(x.q('#lc-replay').value,'0');await x.click('[data-square=e2]');assert(!x.q('[data-square=e2]').classList.contains('selected'));await x.click('[data-lc=last]');await x.click('[data-square=e2]');assert(x.q('[data-square=e2]').classList.contains('selected'));
 const sq=x.q('[data-square=a8]');sq.focus();sq.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(x.d.activeElement.dataset.square,'b8');
 let blob,revoked=false;x.w.URL.createObjectURL=b=>{blob=b;return 'blob:test';};x.w.URL.revokeObjectURL=()=>{revoked=true;};x.w.HTMLAnchorElement.prototype.click=function(){assert(this.download.endsWith('.pgn'));};await x.click('[data-lc=pgn]');assert(blob);x.w.LidyaChess.close();x.dom.window.close();
});
test('queue poll discovers a match made by another player and heartbeat preserves preset',async()=>{
 const x=await setup();await x.open();x.state.handler=async(p,o,b)=>{if(p==='/chess/queue'&&o.method==='POST'){x.state.hub.queue='3+2F';return {queued:true,match:null};}};x.q('#lc-preset').value='3+2';x.q('#lc-rated').checked=false;await x.click('[data-lc=queue]');await x.poll();const cs=x.calls.filter(c=>c.p==='/chess/queue'&&c.o.method==='POST');assert.equal(cs.at(-1).data.preset,'3+2');assert.equal(cs.at(-1).data.rated,false);
 x.state.hub.active=x.state.match;x.state.hub.queue=null;await x.poll();assert(x.q('.lc-board'));x.w.LidyaChess.close();x.dom.window.close();
});
test('friend invitation flow and validation',async()=>{
 const x=await setup();await x.open();await x.click('[data-lc=invite]');assert(x.q('.lc-notice').textContent.includes('ID'));x.q('#lc-friend').value=' ID42 ';await x.click('[data-lc=invite]');assert.equal(x.calls.find(c=>c.p==='/chess/invite').data.public_id,'ID42');assert(x.q('[data-lc=decline]'));x.w.LidyaChess.close();x.dom.window.close();
});
test('tournament creation, standings and safe names; owner and participant actions',async()=>{
 const x=await setup();await x.open();await x.click('[data-tab=tournaments]');x.q('#lc-tname').value='Akşam';x.q('#lc-rounds').value='3';x.q('#lc-create-tournament').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await flush();assert(x.q('.lc-content').textContent.includes(x.state.tournament.name));assert(!x.q('.lc-content script'));assert(x.q('[data-lc=t-start]'));assert(x.q('[data-lc=t-join]'));
 await x.click('[data-lc=t-cancel]');assert(x.q('.lc-confirm'));await x.click('[data-confirm=no]');assert.equal(x.calls.filter(c=>c.p.endsWith('/t1/action')).length,0);x.w.LidyaChess.close();x.dom.window.close();
});
test('resignation requires local confirmation and draw action goes to server',async()=>{
 const x=await setup();x.state.hub.active=x.state.match;await x.open();await x.click('[data-lc=resign]');assert(x.q('.lc-confirm'));await x.click('[data-confirm=no]');assert.equal(x.calls.filter(c=>c.p.endsWith('/action')).length,0);
 await x.click('[data-lc=resign]');await x.click('[data-confirm=yes]');assert.equal(x.calls.find(c=>c.p.endsWith('/action')).data.action,'resign');await x.click('[data-lc=offer_draw]');assert.equal(x.calls.filter(c=>c.p.endsWith('/action')).at(-1).data.action,'offer_draw');x.w.LidyaChess.close();x.dom.window.close();
});
test('history pagination, leaderboard and rules are usable',async()=>{
 const x=await setup();await x.open();await x.click('[data-tab=history]');assert(x.q('.lc-content').textContent.includes(white.name));await x.click('[data-lc=history-next]');assert(x.calls.some(c=>c.p==='/chess/history?offset=20'));await x.click('[data-tab=leaderboard]');assert(x.q('.lc-table').textContent.includes('1200'));await x.click('[data-tab=rules]');assert(x.q('.lc-rules').textContent.includes('FIDE'));x.w.LidyaChess.close();x.dom.window.close();
});
test('account change clears private board and late responses after close cannot reopen',async()=>{
 const x=await setup();x.state.hub.active=x.state.match;await x.open();x.state.hub={...baseHub(),me:{id:'new',name:'Yeni hesap',rating:1200}};await x.poll();assert(!x.q('.lc-board'));assert(x.q('.lc-content').textContent.includes('Yeni hesap'));
 let resolve;x.state.handler=async p=>{if(p==='/chess/practice')return new Promise(r=>{resolve=r;});};x.q('[data-lc=practice]').click();await flush();x.w.LidyaChess.close();resolve(x.state.match);await flush();assert(!x.q('#lidyaChessCenter'));x.dom.window.close();
});
test('theme CSS uses actual Lidya tokens and mobile layout; HTML loads both assets once',async()=>{
 const css=fs.readFileSync(path.join(__dirname,'../frontend/chess-center.css'),'utf8');assert(css.includes('var(--theme-page'));assert(css.includes('data-eris-theme="dark"'));assert(css.includes('@media(max-width:760px)'));assert(css.includes('aspect-ratio:1'));
 const html=fs.readFileSync(path.join(__dirname,'../frontend/erischat-main.html'),'utf8');assert.equal((html.match(/src="\.\/chess-center.js\?/g)||[]).length,1);assert.equal((html.match(/href="\.\/chess-center.css\?/g)||[]).length,1);
});
test('logout and account event immediately clear a private board and never cancel another account queue',async()=>{
 const x=await setup();x.state.hub.active=x.state.match;await x.open();x.w.dispatchEvent(new x.w.CustomEvent('erischat:auth',{detail:{state:'ready',user:{id:'other'}}}));assert(!x.q('#lidyaChessCenter'));
 x.state.hub={...baseHub(),queue:'5+3R'};await x.open();x.w.dispatchEvent(new x.w.CustomEvent('erischat:auth',{detail:{state:'logged_out'}}));await flush();assert(!x.q('#lidyaChessCenter'));assert.equal(x.calls.filter(c=>c.p==='/chess/queue'&&c.o.method==='DELETE').length,0);x.dom.window.close();
});
test('a pending move blocks repeated taps and a token change discards its late response',async()=>{
 const x=await setup();let token='old';x.w.ErisPlatform.getAccessToken=()=>token;x.state.hub.active=x.state.match;await x.open();let resolve;
 x.state.handler=async p=>{if(p.endsWith('/move'))return new Promise(r=>{resolve=r;});};await x.click('[data-square=e2]');x.q('[data-square=e4]').click();await flush();x.q('[data-square=e2]').click();x.q('[data-square=e4]').click();await flush();assert.equal(x.calls.filter(c=>c.p.endsWith('/move')).length,1);token='new';resolve(x.state.match);await flush();assert(!x.q('#lidyaChessCenter'));x.dom.window.close();
});
test('secondary panel opens, traps focus and Escape returns to board; lobby clears compact mode',async()=>{
 const x=await setup();x.state.hub.active=x.state.match;await x.open();assert(x.q('.lc-detail-panel').hidden);assert(x.q('.lc-board-slot .lc-board'));await x.click('[data-lc=details]');assert(!x.q('.lc-detail-panel').hidden);assert.equal(x.d.activeElement.dataset.lc,'details-close');x.d.activeElement.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(x.q('.lc-detail-panel').hidden);assert.equal(x.d.activeElement.dataset.lc,'details');assert(x.q('#lidyaChessCenter'));await x.click('[data-lc=lobby]');assert(!x.q('.lc-in-match'));x.w.LidyaChess.close();x.dom.window.close();
});
test('theme artwork, compact replay warning and tournament return remain available',async()=>{
 const x=await setup();x.state.match.tournament_id='t1';x.state.match.moves=[{uci:'e2e4',san:'e4',fen:START}];x.state.hub.active=x.state.match;await x.open();assert(x.q('.lc-art-light'));assert(x.q('.lc-art-dark'));await x.click('[data-lc=details]');assert(x.q('.lc-detail-panel [data-lc=match-tournament]'));await x.click('[data-lc=first]');await x.click('[data-lc=details-close]');assert(x.q('.lc-matchline').textContent.includes('Tekrar izleniyor'));await x.click('.lc-matchline [data-lc=last]');assert(!x.q('.lc-matchline').textContent.includes('Tekrar izleniyor'));x.w.LidyaChess.close();x.dom.window.close();
});
test('chess uses shared PNG launcher and resizes board against both available axes',async()=>{
 const x=await setup();assert(x.q('.eg-launcher-card.lgm-card[data-game=chess] .pg-cover'));x.state.hub.active=x.state.match;await x.open();const slot=x.q('.lc-board-slot');slot.getBoundingClientRect=()=>({width:320,height:260});x.w.dispatchEvent(new x.w.Event('resize'));assert.equal(x.q('.lc-board').style.width,'260px');assert.equal(x.q('.lc-board').style.height,'260px');slot.getBoundingClientRect=()=>({width:200,height:410});x.w.dispatchEvent(new x.w.Event('resize'));assert.equal(x.q('.lc-board').style.width,'200px');x.w.LidyaChess.close();x.dom.window.close();
});
test('shared PNG renderer switches chess cover for both themes without duplicate images',async()=>{
 const x=await setup();Object.defineProperty(x.d,'currentScript',{configurable:true,value:{src:'https://example.test/games-png-premium.js'}});x.w.eval(fs.readFileSync(path.join(__dirname,'../frontend/games-png-premium.js'),'utf8'));await flush();assert(x.q('.lc-chess-launch>.pg-cover').src.endsWith('/chess-premium/light.png'));x.d.documentElement.dataset.erisTheme='dark';await flush();assert(x.q('.lc-chess-launch>.pg-cover').src.endsWith('/chess-premium/dark.png'));assert.equal(x.d.querySelectorAll('.lc-chess-launch>.pg-cover').length,1);x.dom.window.close();
});
(async()=>{let pass=0;for(const [name,fn]of tests){try{await fn();pass++;process.stdout.write('PASS '+name+'\n');}catch(e){console.error('FAIL '+name,e);process.exitCode=1;break;}}console.log(`${pass}/${tests.length} DOM scenarios passed`);})();

