(() => {'use strict';
const lion=new Image();lion.src=new URL('../assets/lidya-crash-final/crash-lion-v1.png',document.currentScript.src).href;
let last=[1,0];
const CrashGame={
 options:[['1.5','1.5x'],['2.0','2.0x'],['3.0','3.0x'],['5.0','5.0x']],
 asset:lion.src,imageReady:()=>lion.decode().catch(()=>{}),
 cancel(){if(this._frame)cancelAnimationFrame(this._frame);this._frame=null;},
 render(container){this.cancel();this._shownMultiplier=1;container.innerHTML='<div class="crash-flight" data-crash-phase="open"><canvas id="proCrashCanvas" role="img" aria-label="Sahneye tam sığan altın kanatlı aslan ve canlı çarpan eğrisi"></canvas><div class="crash-flight-caption">SARDİS CRASH · <span data-crash-phase-label>BAHİS AÇIK</span></div><div id="crashMultiplierText">1.00x</div><div class="crash-flight-note">KANATLI ASLAN · LİDYA</div></div>';this.drawScene(1,0);if(!lion.complete)lion.addEventListener('load',()=>{if(container.isConnected)this.drawScene(...last);},{once:true});},
 drawScene(multiplier,progress){
  const canvas=document.getElementById('proCrashCanvas');if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  const box=canvas.getBoundingClientRect(),w=Math.max(1,box.width),h=Math.max(1,box.height),dpr=Math.min(2,window.devicePixelRatio||1);
  const pw=Math.round(w*dpr),ph=Math.round(h*dpr);if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);last=[multiplier,progress];
  const dark=document.documentElement.dataset.erisTheme==='dark',ink=dark?'#dbb978':'#987435';
  ctx.strokeStyle=dark?'#c9bc9f12':'#85622912';ctx.lineWidth=1;for(let x=0;x<w;x+=35){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const p=Math.max(0,Math.min(1,progress)),size=Math.min(110,Math.min(w,h)*.24),radius=size*Math.SQRT2/2,pad=radius+12;
  const sx=pad,sy=h-pad-20,ex=sx+p*(w-2*pad),endY=Math.min(pad+72,sy),ey=sy-Math.pow(p,1.6)*(sy-endY);
  ctx.beginPath();ctx.moveTo(sx,sy);for(let i=1;i<=80;i++){const t=p*i/80;ctx.lineTo(sx+t*(w-2*pad),sy-Math.pow(t,1.6)*(sy-endY));}
  ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.shadowColor=ink;ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;
  ctx.save();ctx.translate(ex,ey);ctx.rotate(-.08-p*.14);ctx.shadowColor='#d1ad65';ctx.shadowBlur=9;
  if(lion.complete&&lion.naturalWidth)ctx.drawImage(lion,-size/2,-size/2,size,size);else window.LidyaGameArt?.draw(ctx,'crash',-size/2,-size/2,size);ctx.restore();
  this.sceneBounds={left:ex-radius,right:ex+radius,top:ey-radius,bottom:ey+radius,width:w,height:h};
 },
 updateLive(container,state){
  if(!container?.isConnected)return;this.cancel();const status=state.status||'open',value=Math.max(1,Number(state.multiplier)||1),previous=status==='open'?1:this._shownMultiplier??1,started=performance.now(),duration=status==='running'&&!matchMedia('(prefers-reduced-motion: reduce)').matches?350:0;
  const paint=now=>{if(!container.isConnected)return;const t=duration?Math.min(1,(now-started)/duration):1,shown=previous+(value-previous)*t;this._shownMultiplier=shown;container.querySelector('.crash-flight').dataset.crashPhase=status;container.querySelector('[data-crash-phase-label]').textContent=({open:'BAHİS AÇIK',running:'YÜKSELİYOR',finished:'TUR BİTTİ'})[status];
   const text=container.querySelector('#crashMultiplierText');text.textContent=status==='open'?Number(state.betting_remaining||0)+' sn':shown.toFixed(2)+'x';text.style.color=status==='finished'?'var(--crash-finished)':status==='open'?'var(--crash-open)':'var(--crash-running)';this.drawScene(shown,status==='open'?0:Math.min(1,Math.log2(Math.max(1,shown))/5));if(t<1)this._frame=requestAnimationFrame(paint);else this._frame=null;
  };this._frame=requestAnimationFrame(paint);
 },
 async animate(container,data){this.updateLive(container,{status:'finished',multiplier:data?.multiplier||1});}
};
window.addEventListener('erischat:theme',()=>CrashGame.drawScene(...last));window.ErisGameCrash=CrashGame;
})();
