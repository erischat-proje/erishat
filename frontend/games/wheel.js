(() => {
  'use strict';

  const SYMBOLS = [
    {key:'rose',    icon:'🌹', name:'Gül'},
    {key:'heart',   icon:'♥',  name:'Kalp'},
    {key:'star',    icon:'★',  name:'Yıldız'},
    {key:'diamond', icon:'◆',  name:'Elmas'},
    {key:'crown',   icon:'♛',  name:'Taç'},
    {key:'gift',    icon:'🎁', name:'Hediye'},
    {key:'fire',    icon:'🔥', name:'Alev'},
    {key:'gem',     icon:'💠', name:'Kristal'},
    {key:'jackpot', icon:'🏆', name:'Jackpot'}
  ];

  const COLORS = [
    '#8f2946','#b92f55','#8a5de8',
    '#4b83d8','#d79b38','#8b4bc1',
    '#dc5b32','#2b9b9e','#b88631'
  ];

  let currentRotation = 0;

  function drawRoundedSegment(ctx, center, radius, start, end, color) {
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
    ctx.strokeStyle='rgba(10,7,15,.72)';
    ctx.lineWidth=3;
    ctx.stroke();
  }

  const WheelGame = {
    options: SYMBOLS.map(x => [x.key, `${x.icon} ${x.name}`]),
    symbols: SYMBOLS,

    render(container) {
      container.innerHTML = `
        <div class="eris-wheel-v2">
          <div class="eris-wheel-caption">
            <span>ŞANS ÇARKI</span>
            <b>CANLI TUR · 60 SANİYE</b>
          </div>

          <div class="eris-wheel-wrap">
            <div class="eris-wheel-pointer">
              <i></i>
            </div>
            <canvas id="proWheelCanvas" width="640" height="640"></canvas>
            <div class="eris-wheel-hub">
              <span>ERIS</span>
              <b>LIVE</b>
            </div>
          </div>

          <div class="eris-wheel-note">
            Gül 1.5× · Kalp 2× · Yıldız 2.5× · Elmas 3× · Taç 3.5× · Hediye 4× · Alev 4.5× · Kristal 5× · Jackpot 6×
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
    },

    drawWheel(angleDeg) {
      const canvas=document.getElementById('proWheelCanvas');
      if(!canvas)return;
      const ctx=canvas.getContext('2d');
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
        drawRoundedSegment(ctx,center,radius,start,end,COLORS[i]);

        ctx.save();
        ctx.translate(center,center);
        ctx.rotate(start+slice/2);
        ctx.translate(radius*.69,0);
        ctx.rotate(Math.PI/2);
        ctx.textAlign='center';
        ctx.textBaseline='middle';

        ctx.shadowColor='rgba(0,0,0,.65)';
        ctx.shadowBlur=8;
        ctx.font='700 52px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
        ctx.fillStyle='#fff';
        ctx.fillText(symbol.icon,0,-7);

        ctx.shadowBlur=4;
        ctx.font='900 18px sans-serif';
        ctx.fillStyle='#fff';
        ctx.fillText(symbol.name.toUpperCase(),0,37);
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
      const duration=4700;

      return new Promise(resolve=>{
        const frame=now=>{
          const p=Math.min((now-started)/duration,1);
          const eased=1-Math.pow(1-p,4);
          const angle=start+(finalAngle-start)*eased;
          this.drawWheel(angle);

          if(p<1){
            requestAnimationFrame(frame);
          }else{
            currentRotation=finalAngle%360;
            this.drawWheel(currentRotation);
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });
    }
  };

  window.ErisGameWheel=WheelGame;
})();
