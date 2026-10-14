(() => {
  'use strict';
  const names={rose:'Gül',heart:'Kalp',star:'Yıldız',diamond:'Elmas',crown:'Taç',gift:'Hediye',fire:'Alev',gem:'Kristal',jackpot:'Jackpot'};
  const multipliers={rose:5,heart:5,star:5,diamond:5,crown:15,gift:4,fire:25,gem:45,jackpot:60};
  let symbols=['rose','heart','star','diamond','crown','fire','gem','jackpot'].map(key=>({key,name:names[key]}));
  let rotation=0,lastAngle=0,winner=null;
  const WheelGame={
    options:symbols.map(s=>[s.key,s.name]),symbols,
    configure(keys,values){if(values)Object.assign(multipliers,values);if(keys?.length){symbols=keys.map(key=>({key,name:names[key]||key}));this.symbols=symbols;this.options=symbols.map(s=>[s.key,s.name]);}winner=null;},
    cancel(){if(this._frame)cancelAnimationFrame(this._frame);this._frame=null;const done=this._resolve;this._resolve=null;if(done)done();},
    symbolMarkup:key=>window.LidyaGameArt.markup(key),
    showWinner(key){winner=key||null;this.drawWheel(lastAngle);},
    render(container){
      this.cancel();
      container.innerHTML='<div class="eris-wheel-v2"><div class="eris-wheel-caption"><span>ŞANS ÇARKI</span></div><div class="eris-wheel-wrap"><div class="eris-wheel-pointer" aria-hidden="true"><i></i></div><canvas id="proWheelCanvas" width="800" height="800" role="img" aria-label="Sekiz sembollü altın Lidya Şans Çarkı"></canvas><div class="eris-wheel-hub" aria-hidden="true"><span>LİDYA</span>'+window.LidyaGameArt.markup('coin')+'</div></div><div class="eris-wheel-note">Lidya Şans Çarkı</div></div>';
      this.drawWheel(rotation);
      symbols.forEach(s=>{const img=window.LidyaGameArt.image(s.key);if(!img.complete)img.addEventListener('load',()=>{if(container.isConnected)this.drawWheel(lastAngle);},{once:true});});
    },
    drawWheel(angle){
      const canvas=document.getElementById('proWheelCanvas'),ctx=canvas?.getContext('2d');if(!ctx)return;
      lastAngle=angle;const dark=document.documentElement.dataset.erisTheme==='dark',c=canvas.width/2,r=c-29,slice=Math.PI*2/symbols.length;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      // Three machined concentric rims remain visible, with no cards on top of the wheel.
      const rim=ctx.createLinearGradient(0,0,canvas.width,canvas.height);rim.addColorStop(0,'#f5df9b');rim.addColorStop(.3,'#ad8139');rim.addColorStop(.55,'#efd39a');rim.addColorStop(.8,'#805b28');rim.addColorStop(1,'#d8b66c');
      ctx.beginPath();ctx.arc(c,c,c-3,0,Math.PI*2);ctx.fillStyle=rim;ctx.fill();
      ctx.beginPath();ctx.arc(c,c,c-13,0,Math.PI*2);ctx.fillStyle=dark?'#111a14':'#f5ecd7';ctx.fill();
      ctx.beginPath();ctx.arc(c,c,c-21,0,Math.PI*2);ctx.strokeStyle=dark?'#c5a46b':'#a88647';ctx.lineWidth=3;ctx.stroke();
      ctx.save();ctx.translate(c,c);ctx.rotate(angle*Math.PI/180);ctx.translate(-c,-c);
      symbols.forEach((s,i)=>{
        const start=i*slice-Math.PI/2,end=start+slice,lit=winner===s.key;
        const enamel=ctx.createRadialGradient(c,c,80,c,c,r);
        enamel.addColorStop(0,lit?(dark?'#a87b30':'#fff2c4'):dark?(i%2?'#1b2a20':'#27382a'):(i%2?'#eadcbf':'#fff9e9'));
        enamel.addColorStop(1,lit?(dark?'#5c4220':'#d9b572'):dark?(i%2?'#16221a':'#203024'):(i%2?'#dac69e':'#efe4ce'));
        ctx.beginPath();ctx.moveTo(c,c);ctx.arc(c,c,r,start,end);ctx.closePath();ctx.fillStyle=enamel;ctx.fill();ctx.strokeStyle=lit?'#f5d79d':dark?'#89734b':'#c7ad7d';ctx.lineWidth=lit?6:2;ctx.stroke();
        ctx.save();ctx.beginPath();ctx.arc(c,c,r-10,start+.022,end-.022);ctx.strokeStyle=lit?'#ffe5ae':dark?'#4d573c':'#e4d2af';ctx.lineWidth=lit?5:2;ctx.stroke();ctx.restore();
        ctx.save();ctx.translate(c,c);ctx.rotate(start+slice/2);ctx.translate(r*.69,0);ctx.rotate(Math.PI/2);
        if(lit){ctx.shadowColor='#f9d581';ctx.shadowBlur=24;}
        window.LidyaGameArt.draw(ctx,s.key,-53,-63,106);ctx.shadowBlur=0;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 24px Georgia,serif';ctx.fillStyle=dark?'#f0e4cb':'#564023';ctx.fillText(multipliers[s.key]+'×',0,58);ctx.restore();
      });
      ctx.restore();
      // Small gold studs finish the outer ring; they do not move over the betting controls.
      for(let i=0;i<32;i++){const a=i/32*Math.PI*2;ctx.beginPath();ctx.arc(c+Math.cos(a)*(c-9),c+Math.sin(a)*(c-9),2.3,0,Math.PI*2);ctx.fillStyle=i%2?'#795827':'#fff0bc';ctx.fill();}
    },
    async animate(container,data){
      this.cancel();winner=null;
      const result=data?.result_key||data?.segment||data?.result,index=Math.max(0,symbols.findIndex(s=>s.key===result)),slice=360/symbols.length;
      const target=(360-(index*slice+slice/2))%360,delta=(target-(rotation%360)+360)%360,start=rotation,final=start+360*6+delta,at=performance.now();
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:(data?.duration_ms??4200);let tick=-1;
      return new Promise(resolve=>{this._resolve=resolve;const frame=now=>{
        if(!container.isConnected){this.cancel();return;}
        const p=duration?Math.min((now-at)/duration,1):1,a=start+(final-start)*(1-Math.pow(1-p,4));this.drawWheel(a);
        const t=Math.floor(a/slice);if(duration&&t!==tick){tick=t;data?.onTick?.();}
        if(p<1)this._frame=requestAnimationFrame(frame);else{rotation=final%360;winner=result;this.drawWheel(rotation);this._resolve=null;this._frame=null;resolve();}
      };this._frame=requestAnimationFrame(frame);});
    }
  };
  window.addEventListener('erischat:theme',()=>WheelGame.drawWheel(lastAngle));window.ErisGameWheel=WheelGame;
})();
