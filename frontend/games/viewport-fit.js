(function(root){'use strict';
function bounds(v){const oldNative=v.android&&!v.handled&&!v.framed,top=oldNative?28:0,bottom=oldNative?24:0;return {left:Math.max(0,v.left||0),top:Math.max(0,v.top||0)+top,width:Math.max(1,v.width),height:Math.max(1,v.height-top-bottom)};}
function contain(width,height,ratio){const w=Math.max(0,Math.min(Math.max(0,width),Math.max(0,height)*ratio));return {width:w,height:w/ratio};}
if(typeof module==='object'&&module.exports){module.exports={bounds,contain};return;}
const configs={erisDedeModal:['dede','.dd-stage','.dd-board',6/5],erisPrensesModal:['prenses','.pp-stage','.pp-board',6/5],erisSekerModal:['seker','.ss-canvas-wrap','canvas',6/5],erisBalikciModal:['balikci','.fh-canvas-wrap','canvas',5/3],erisDogPartyModal:['dogparty','.dp-stage','canvas',5/3],erisCandyModal:['candy','.cu-stage','canvas',1],erisKovboyModal:['kovboy','.kw-stage','canvas',5/4],erisBastetModal:['bastet','.bt-stage','canvas',5/4],erisAltinModal:['altin','.as-stage','canvas',5/3],erisKureModal:['kure','.kk-stage','[data-board]',1.18],erisFiravunModal:['firavun','.ft-stage','canvas',5/3],erisLidyaOriginalModal:['original'],lidyaWheelLive:['wheel'],lidyaCrashFinal:['crash'],erisGamesModal:['classic']};
const selector=Object.keys(configs).map(id=>'#'+id).join(',')+',.sf-overlay,main.nrs-game';
const records=new Map();let queued=false;
function set(el,name,value){if(el.style.getPropertyValue(name)!==value)el.style.setProperty(name,value);}
function handled(){try{return JSON.parse(root.ErisChatAndroid?.getViewportInsets?.()||'{}').handled===true;}catch{return false;}}
function geometry(edgeToEdge=false){const v=root.visualViewport,zoomed=(v?.scale||1)>1.05;return bounds({width:zoomed?document.documentElement.clientWidth:(v?.width||root.innerWidth),height:zoomed?root.innerHeight:(v?.height||root.innerHeight),left:zoomed?0:(v?.offsetLeft||0),top:zoomed?0:(v?.offsetTop||0),android:!edgeToEdge&&/ErisChatAndroid\//.test(root.navigator?.userAgent||''),handled:handled(),framed:root.parent!==root});}
function attach(el){if(records.has(el))return;let cfg=configs[el.id];if(!cfg&&el.matches('.sf-overlay'))cfg=['slot'];if(!cfg&&el.matches('main.nrs-game'))cfg=[el.dataset.nrsGame||'original','.arena>.board','canvas',el.dataset.nrsGame==='ares'?6/5:1];if(!cfg)return;
 el.classList.add('gv-fit');el.dataset.gvGame=cfg[0];let shell=el.querySelector(':scope>[class$="-shell"],:scope>.sf-panel,:scope>.eg-panel,:scope>.lw-panel,:scope>.cf-panel');if(!shell&&el.matches('main.nrs-game')){shell=document.createElement('div');while(el.firstChild)shell.append(el.firstChild);el.append(shell);}if(shell)shell.classList.add('gv-shell');
 const stage=cfg[1]?el.querySelector(cfg[1]):null,board=stage?stage.querySelector(cfg[2]):null;
 if(stage)stage.classList.add('gv-stage');if(board)board.classList.add('gv-board');
 const resize=new ResizeObserver(schedule);if(stage)resize.observe(stage);if(shell)resize.observe(shell);
 const styleObserver=cfg[0]==='altin'&&board?new MutationObserver(schedule):null;styleObserver?.observe(board,{attributes:true,attributeFilter:['style']});
 records.set(el,{cfg,shell,stage,board,resize,styleObserver});
}
function fit(){queued=false;const box=geometry();
 for(const [el,item]of records){if(!el.isConnected){item.resize.disconnect();item.styleObserver?.disconnect();records.delete(el);continue;}
  if(!el.getClientRects().length)continue;
  const gameBox=['slot','dede','seker','balikci','prenses','dogparty'].includes(item.cfg[0])?geometry(true):box;
  for(const [key,value]of Object.entries(gameBox))set(el,'--gv-'+key,value+'px');set(el,'--nrs-height',box.height+'px');
  el.classList.toggle('gv-compact',box.height<740);el.classList.toggle('gv-short',box.height<560);el.classList.toggle('gv-narrow',box.width<600);
  if(item.stage&&item.board){let ratio=item.cfg[3];if(item.cfg[0]==='altin'){const w=parseFloat(item.board.style.width),h=parseFloat(item.board.style.height);if(w>0&&h>0)ratio=w/h;}
   const css=root.getComputedStyle(item.stage),spaceX=(parseFloat(css.paddingLeft)||0)+(parseFloat(css.paddingRight)||0),spaceY=(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0);
   const size=contain(Math.max(0,item.stage.clientWidth-spaceX-8),Math.max(0,item.stage.clientHeight-spaceY-8),ratio);
   set(item.board,'--gv-board-width',size.width.toFixed(2)+'px');set(item.board,'--gv-board-height',size.height.toFixed(2)+'px');
  }
 }
}
function schedule(){if(!queued){queued=true;root.requestAnimationFrame(fit);}}
function scan(){for(const el of document.querySelectorAll(selector))attach(el);schedule();}
function start(){new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan();}
root.addEventListener('resize',schedule);root.addEventListener('orientationchange',schedule);root.visualViewport?.addEventListener('resize',schedule);root.visualViewport?.addEventListener('scroll',schedule);
root.LidyaGameViewport={refresh:scan,bounds,contain};if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})(typeof window!=='undefined'?window:globalThis);

