const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {bounds,contain}=require('../frontend/games/viewport-fit.js');
for(const [width,height]of [[320,480],[320,568],[360,640],[384,853],[390,844],[844,390],[1280,720]]){
 for(const android of [false,true])for(const handled of [false,true])for(const framed of [false,true]){
  const b=bounds({width,height,android,handled,framed,top:3,left:2});assert.equal(b.height,height-(android&&!handled&&!framed?52:0));assert.equal(b.top,3+(android&&!handled&&!framed?28:0));
  for(const ratio of [1,6/5,5/3,5/4,1.18,10/7.2]){const s=contain(b.width,b.height,ratio);assert(s.width<=b.width+.001&&s.height<=b.height+.001);assert(Math.abs(s.width/s.height-ratio)<.00001);}
 }
}
assert.deepEqual(contain(-1,20,1),{width:0,height:0});
const {parseHTML}=require(process.env.ERIS_DOM_MODULE||'linkedom');
const {window}=parseHTML('<html><body></body></html>'),{document}=window;
let queue=[],disconnects=0;const observed=[];
class RO{constructor(cb){this.cb=cb;}observe(el){observed.push(el);}disconnect(){disconnects++;}}
window.innerWidth=390;window.innerHeight=844;window.parent=window;
window.requestAnimationFrame=fn=>queue.push(fn);window.getComputedStyle=()=>({paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0',position:'static'});
window.visualViewport={width:390,height:844,offsetLeft:0,offsetTop:0,addEventListener(){}};
function flush(){let n=0;while(queue.length){assert(++n<30,'resize failed to settle');queue.shift()();}}
function fixture(id,stage,board){const el=document.createElement('div');el.id=id;el.innerHTML=`<div class="xx-shell"><header><button disabled>test</button></header><div class="${stage}">${board}</div><button data-spin>ÇEVİR</button></div>`;document.body.append(el);const shell=el.firstElementChild,area=shell.children[1];Object.defineProperties(shell,{clientHeight:{value:800,configurable:true},scrollHeight:{get(){return 800;},configurable:true}});Object.defineProperties(area,{clientWidth:{value:374},clientHeight:{value:400}});return el;}
const fixtures=[['erisDedeModal','dd-stage','<div class="dd-board"></div>'],['erisPrensesModal','pp-stage','<div class="pp-board"></div>'],['erisSekerModal','ss-canvas-wrap','<canvas></canvas>'],['erisBalikciModal','fh-canvas-wrap','<canvas></canvas>'],['erisDogPartyModal','dp-stage','<canvas></canvas>'],['erisCandyModal','cu-stage','<canvas></canvas>'],['erisKovboyModal','kw-stage','<canvas></canvas>'],['erisBastetModal','bt-stage','<canvas></canvas>'],['erisAltinModal','as-stage','<canvas style="width:1000px;height:720px"></canvas>'],['erisKureModal','kk-stage','<div data-board></div>'],['erisFiravunModal','ft-stage','<canvas></canvas>']];
fixtures.forEach(x=>fixture(...x));
vm.runInNewContext(fs.readFileSync('frontend/games/viewport-fit.js','utf8'),{window,document,ResizeObserver:RO,MutationObserver:window.MutationObserver});flush();
for(const [id]of fixtures){const el=document.getElementById(id);assert.equal(el.style.getPropertyValue('--gv-height'),'844px');const board=el.querySelector('.gv-board');assert(board);assert(parseFloat(board.style.getPropertyValue('--gv-board-width'))<=366);assert(parseFloat(board.style.getPropertyValue('--gv-board-height'))<=392);assert(el.querySelector('header button').disabled);assert.equal(el.querySelector('[data-spin]').textContent,'ÇEVİR');}
const altin=document.querySelector('#erisAltinModal .gv-board');assert(Math.abs(parseFloat(altin.style.getPropertyValue('--gv-board-width'))/parseFloat(altin.style.getPropertyValue('--gv-board-height'))-1000/720)<.001);
window.visualViewport.height=390;window.dispatchEvent(new window.Event('resize'));flush();assert(document.getElementById('erisDedeModal').classList.contains('gv-short'));
const fresh=fixture('erisGamesModal','eg-stage','<button>Oyna</button>');window.LidyaGameViewport.refresh();flush();assert(fresh.classList.contains('gv-fit'));Object.defineProperty(fresh.firstElementChild,'clientHeight',{get(){return 400/Number(fresh.style.getPropertyValue('--gv-scale')||1);}});Object.defineProperty(fresh.firstElementChild,'scrollHeight',{value:800});window.LidyaGameViewport.refresh();flush();assert.equal(fresh.style.getPropertyValue('--gv-scale'),'0.5');
fresh.remove();window.LidyaGameViewport.refresh();flush();assert(disconnects>0);
const css=fs.readFileSync('frontend/games/viewport-fit.css','utf8');assert(!/overflow(?:-y)?:\s*(auto|scroll)/.test(css));const parsed=parseHTML('<html><style>'+css+'</style></html>');assert(parsed.document.querySelector('style').sheet.cssRules.length>30);
console.log('PASS: 56 viewport combinations; 6 board ratios; 11 game fixtures; resize; dynamic open/close; overflow scaling; existing controls preserved; CSS parsed and no scrolling enabled.');
