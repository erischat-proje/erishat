const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {parseHTML}=require(process.env.ERIS_DOM_MODULE||'linkedom');
const {window}=parseHTML('<html data-eris-theme="light"><head></head><body><section id="games"><h2 class="title">Oyunlar</h2><div id="launcher"></div></section></body></html>');
const {document}=window;let currentSrc='',frames=0,capture=null;const calls=[];
Object.defineProperty(document,'currentScript',{get:()=>({src:currentSrc})});
const add=document.addEventListener.bind(document);
document.addEventListener=(name,fn,options)=>{if(name==='click'&&options===true)capture=fn;return add(name,fn,options);};
window.LidyaGameArt={markup:()=>'<img alt="">'};window.ErisChatGames={open:(...args)=>calls.push(args)};
const raf=fn=>{if(++frames>300)throw Error('Menu mutation loop');setImmediate(fn);};
const ctx={window,document,URL,MutationObserver:window.MutationObserver,queueMicrotask,requestAnimationFrame:raf,console};
function load(file){currentSrc='https://eris.test/'+file.replace(/^frontend\//,'');vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});}
const tick=()=>new Promise(setImmediate);async function settle(){for(let i=0;i<12;i++)await tick();}
const modules={dede:'ErisGameDede',seker:'ErisGameSeker',balikci:'ErisGameBalikci',prenses:'ErisGamePrenses',dogparty:'ErisGameDogParty',candy:'ErisGameCandy',kovboy:'ErisGameKovboy',bastet:'ErisGameBastet',altin:'ErisGameAltin',kure:'ErisGameKure',firavun:'ErisGameFiravun',aztek:'ErisGameAztek',ares:'ErisGameAres'};
const menuFiles=['dede','seker','balikci','prenses','dogparty','candy','kovboy','bastet','altin','kure','firavun','aztek-ares'];
(async()=>{
 load('frontend/games-menu.js');window.ErisGamesMenuConfig.renderLauncher(document.querySelector('#launcher'));load('frontend/games-png-premium.js');
 for(const game of menuFiles)load('frontend/games/'+game+'-menu.js');
 for(const [game,name]of Object.entries(modules))window[name]={open:()=>calls.push(['custom',game])};
 load('frontend/games/custom-game-routing.js');await settle();
 const check=theme=>{
  const cards=[...document.querySelectorAll('#games .eg-launcher-card')];assert.equal(cards.length,20);assert.equal(new Set(cards.map(c=>c.dataset.game)).size,20);
  for(const card of cards){assert(card.classList.contains('lgm-card'));assert.equal(card.querySelectorAll('.pg-cover').length,1);assert.equal(card.querySelectorAll('.lgm-copy').length,1);assert(card.querySelector('.lgm-copy>.eg-lc-title'));assert(card.querySelector('.lgm-copy>.eg-lc-play'));assert.equal(card.querySelector('.pg-cover').src,'https://eris.test/assets/lidya-ranking-v2/'+theme+'/'+card.dataset.game+'.png');assert.equal(card.querySelector('.pg-cover').loading,'lazy');assert(card.getAttribute('aria-label').endsWith('oyununu aç'));}
 };
 check('light');document.documentElement.dataset.erisTheme='dark';await settle();check('dark');
 window.dispatchEvent(new window.Event('erischat:theme'));await settle();check('dark');
 const stable=frames;await settle();assert.equal(frames,stable,'observers never settle');
 // Re-rendering the legacy launcher must reinstall exactly one card per game.
 window.ErisGamesMenuConfig.renderLauncher(document.querySelector('#launcher'));await settle();check('dark');
 for(const card of document.querySelectorAll('#games .eg-launcher-card')){
  calls.length=0;let stopped=false;
  // Browser capture runs before the old inline/bubbling launchers.
  capture({target:card.querySelector('.eg-lc-title'),preventDefault(){},stopImmediatePropagation(){stopped=true;}});
  if(!stopped){const event=new window.Event('click',{bubbles:true});card.dispatchEvent(event);}
  assert.equal(calls.length,1,card.dataset.game+' opened more than once');
  if(modules[card.dataset.game])assert.deepEqual(calls[0],['custom',card.dataset.game]);else assert.deepEqual(calls[0],['main',null,card.dataset.game]);
 }
 document.documentElement.dataset.erisTheme='light';await settle();check('light');
 const {document:css}=parseHTML('<html><style>'+fs.readFileSync('frontend/game-menu-ranking-art.css','utf8')+'</style></html>');assert(css.querySelector('style').sheet.cssRules.length>15);
 console.log('PASS: actual 12 menu installers + renderer; 20 unique cards; both themes; mutation settling; re-render; each game opens once with no Wheel fallback; CSS parsed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
