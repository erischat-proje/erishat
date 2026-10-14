(() => {
  'use strict';

  const SYMBOLS = [
    {key:'rose',    icon:'🌹', name:'Gül'},
    {key:'heart',   icon:'♥',  name:'Kalp'},
    {key:'star',    icon:'★',  name:'Yıldız'},
    {key:'diamond', icon:'◆',  name:'Elmas'},
    {key:'crown',   icon:'♛',  name:'Taç'},
    {key:'fire',    icon:'🔥', name:'Alev'},
    {key:'gem',     icon:'💠', name:'Kristal'},
    {key:'jackpot', icon:'🏆', name:'Jackpot'}
  ];

  // Muted enamel and engraved bronze; result keys remain the server's eight symbols.
  const PALETTES = {
    light: ['#713d43','#80424c','#55513a','#345467','#74602d','#5b485b','#874729','#36615c','#6f5528'],
    dark: ['#43282f','#512c36','#343728','#263e4c','#493c24','#39303f','#573522','#28433e','#4b3821']
  };
  const ENGRAVINGS = {
    rose: 'M32 35c-17-1-20-17-8-22 3-8 17-8 20 0 12 5 9 21-12 22Z M25 17c-3 8 4 16 13 9 7-7-4-14-10-7 M32 35v19 M32 45c-11 1-15-7-15-7 10-2 15 2 15 7 M32 41c10-1 15-8 15-8-11-2-15 2-15 8',
    heart: 'M32 51 12 31C-1 15 20 4 32 19 44 4 65 15 52 31Z M17 23c0-6 6-8 10-5',
    star: 'm32 8 7 15 17 2-12 12 3 18-15-8-15 8 3-18L8 25l17-2Z M32 18v24 M18 28l28 9 M46 28l-28 9',
    diamond: 'm32 8 22 24-22 24L10 32Z M10 32h44 M32 8 22 32l10 24 10-24Z',
    crown: 'M12 20 22 30 32 12 42 30 52 20l-5 25H17Z M17 49h30 M24 37h16',
    gift: 'M13 28h38v26H13Z M9 20h46v8H9Z M28 20v34h8V20 M32 20C5 22 17-1 32 20 47-1 59 22 32 20',
    fire: 'M32 7c5 13 1 14 10 21 2-5 3-7 3-11 21 28-1 44-16 38C8 48 11 29 24 17c-2 11 3 15 3 15 8-10 0-14 5-25Z M32 34c-13 16-2 24 6 17 5-5-3-9-6-17',
    gem: 'm20 11 24 0 13 18-25 26L7 29Z M7 29h50 M20 11l-2 18 14 26 14-26-2-18 M20 11l12 18 12-18',
    jackpot: 'M20 10h24v20c0 21-24 21-24 0Z M20 16H9v10c0 9 6 12 14 12 M44 16h11v10c0 9-6 12-14 12 M32 45v9 M22 55h20 M32 17l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z'
  };
  let lastDrawnRotation = 0;

  let currentRotation = 0;

  function drawRoundedSegment(ctx, center, radius, start, end, color) {
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
    ctx.strokeStyle='#b2955d';
    ctx.lineWidth=3;
    ctx.stroke();
  }

  const WheelGame = {
    options: SYMBOLS.map(x => [x.key, `${x.icon} ${x.name}`]),
    symbols: SYMBOLS,
    configure(keys) {
      const names={rose:'Gül',heart:'Kalp',star:'Yıldız',diamond:'Elmas',crown:'Taç',gift:'Hediye',fire:'Alev',gem:'Kristal',jackpot:'Jackpot'};
      if(keys?.length){SYMBOLS.splice(0,SYMBOLS.length,...keys.map(key=>({key,name:names[key]||key})));this.options=SYMBOLS.map(x=>[x.key,x.name]);}
    },
    cancel() {
      if(this._frame)cancelAnimationFrame(this._frame);
      this._frame=null;
      const done=this._resolve;this._resolve=null;if(done)done();
    },
    symbolMarkup(key) {
      return window.LidyaGameArt.markup(key);
    },

    render(container) {
      container.innerHTML = `
        <div class="eris-wheel-v2">
          <div class="eris-wheel-caption">
            <span>ŞANS ÇARKI</span>
            <b>SARDİS · CANLI TUR</b>
          </div>

          <div class="eris-wheel-wrap">
            <div class="eris-wheel-pointer">
              <i></i>
            </div>
            <canvas id="proWheelCanvas" width="640" height="640" role="img" aria-label="Sekiz sembollü Lidya Şans Çarkı"></canvas>
            <div class="eris-wheel-hub">
              <span>LİDYA</span>
              <b>${window.LidyaGameArt.markup("coin")}</b>
            </div>
          </div>

          <div class="eris-wheel-note">
            Gül 5× · Kalp 5× · Yıldız 5× · Elmas 5× · Taç 15× · Alev 25× · Kristal 45× · Jackpot 60×
          </div>
        </div>
      `;

      if(!document.getElementById('eris-wheel-v2-style')){
        const style=document.createElement('style');
        style.id='eris-wheel-v2-style';
        style.textContent=`
          .eris-wheel-v2{width:100%;display:flex;flex-direction:column;align-items:center;padding:4px 0 2px}
          .eris-wheel-caption{width:min(330px,94%);display:flex;justify-content:space-between;align-items:center;margin:0 auto 12px;color:#8f849a;font-size:9px;font-weight:900;letter-spacing:1.2px}
          .eris-wheel-caption b{color:#ffd276;font-size:9px}
          .eris-wheel-wrap{position:relative;width:min(286px,78vw);aspect-ratio:1;margin:auto;filter:drop-shadow(0 18px 28px #0008)}
          .eris-wheel-wrap:before{content:"";position:absolute;inset:-7px;border-radius:50%;background:linear-gradient(145deg,#caa05b,#4c376b 46%,#b78442);box-shadow:0 0 0 2px #ffffff0b,0 0 32px #8a5cff26;z-index:0}
          .eris-wheel-wrap:after{content:"";position:absolute;inset:1px;border-radius:50%;box-shadow:inset 0 0 30px #0009;pointer-events:none;z-index:3}
          #proWheelCanvas{position:relative;z-index:1;width:100%;height:100%;display:block;border-radius:50%}
          .eris-wheel-pointer{position:absolute;left:50%;top:-17px;transform:translateX(-50%);z-index:8;width:36px;height:45px;display:grid;place-items:center;filter:drop-shadow(0 5px 5px #0009)}
          .eris-wheel-pointer:before{content:"";width:28px;height:28px;border-radius:50%;background:linear-gradient(145deg,#ffe09a,#9e6a2c);border:3px solid #302033}
          .eris-wheel-pointer i{position:absolute;top:23px;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:20px solid #e8b75d}
          .eris-wheel-hub{position:absolute;z-index:5;left:50%;top:50%;transform:translate(-50%,-50%);width:67px;height:67px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 25%,#493761,#181020 65%);border:4px solid #d0a35b;box-shadow:0 5px 18px #000b,inset 0 0 12px #ffffff0b}
          .eris-wheel-hub span{font-size:8px;font-weight:950;letter-spacing:1.4px;color:#d5c7e1}
          .eris-wheel-hub b{font-size:18px;color:#ffd477;line-height:1.05}
          .eris-wheel-note{width:min(340px,96%);margin-top:15px;text-align:center;color:#9d92a8;font-size:10px;line-height:1.5}
        `;
        document.head.appendChild(style);
      }

      this.drawWheel(currentRotation);
      SYMBOLS.forEach(s=>{const img=window.LidyaGameArt.image(s.key);if(!img.complete)img.addEventListener("load",()=>{if(container.isConnected)this.drawWheel(lastDrawnRotation);},{once:true});});
    },

    drawWheel(angleDeg) {
      const canvas=document.getElementById('proWheelCanvas');
      if(!canvas)return;
      const ctx=canvas.getContext('2d');
      if(!ctx)return;
      lastDrawnRotation=angleDeg;
      const dark=document.documentElement.dataset.erisTheme==='dark';
      const colors=PALETTES[dark?'dark':'light'];
      const center=canvas.width/2;
      const radius=center-13;
      const slice=(Math.PI*2)/SYMBOLS.length;

      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.save();
      ctx.translate(center,center);
      ctx.rotate(angleDeg*Math.PI/180);
      ctx.translate(-center,-center);

      SYMBOLS.forEach((symbol,i)=>{
        const start=i*slice-Math.PI/2;
        const end=start+slice;
        const enamel=ctx.createRadialGradient(center,center,70,center,center,radius);
        enamel.addColorStop(0,colors[i]);enamel.addColorStop(.8,colors[i]);enamel.addColorStop(1,dark?'#1e2118':'#493a27');
        drawRoundedSegment(ctx,center,radius,start,end,enamel);
        ctx.save();
        ctx.beginPath();ctx.arc(center,center,radius-9,start+.025,end-.025);
        ctx.strokeStyle='#b2955d';ctx.lineWidth=1.5;ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(center,center);
        ctx.rotate(start+slice/2);
        ctx.translate(radius*.69,0);
        ctx.rotate(Math.PI/2);
        ctx.textAlign='center';
        ctx.textBaseline='middle';

        window.LidyaGameArt.draw(ctx,symbol.key,-42,-50,84);
        ctx.font='700 17px Georgia,serif';
        ctx.fillStyle='#f5e6bc';
        ctx.fillText(symbol.name.toLocaleUpperCase('tr-TR'),0,37);
        ctx.restore();
      });

      ctx.restore();
    },

    async animate(container,data) {
      const resultKey=data?.result_key || data?.segment || data?.result;
      const winningIndex=SYMBOLS.findIndex(x=>x.key===resultKey);
      const index=winningIndex>=0?winningIndex:0;
      const sliceDeg=360/SYMBOLS.length;

      // Segment merkezini üstteki sabit işaretçiye getir.
      const target=(360-(index*sliceDeg+sliceDeg/2))%360;
      const delta=(target-(currentRotation%360)+360)%360;
      const finalAngle=currentRotation+(360*7)+delta;
      const start=currentRotation;
      const started=performance.now();
      let tick=-1;
      this.cancel();
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:(data?.duration_ms??4200);

      return new Promise(resolve=>{
        this._resolve=resolve;
        const frame=now=>{
          if(!container.isConnected){this.cancel();return;}
          const p=duration?Math.min((now-started)/duration,1):1;
          const eased=1-Math.pow(1-p,4);
          const angle=start+(finalAngle-start)*eased;
          this.drawWheel(angle);
          const nextTick=Math.floor(angle/sliceDeg);if(duration&&nextTick!==tick){tick=nextTick;data?.onTick?.();}

          if(p<1){
            this._frame=requestAnimationFrame(frame);
          }else{
            currentRotation=finalAngle%360;
            this.drawWheel(currentRotation);
            this._resolve=null;this._frame=null;resolve();
          }
        };
        this._frame=requestAnimationFrame(frame);
      });
    }
  };

  window.addEventListener('erischat:theme',()=>WheelGame.drawWheel(lastDrawnRotation));
  window.ErisGameWheel=WheelGame;
})();

