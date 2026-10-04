/* Original artwork choreography. PNG motion effects, not generated 3D footage. */
(function(global){
  'use strict';
  const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
  const ease=v=>1-Math.pow(1-clamp(v),3);
  const rnd=v=>{const n=Math.sin(v*12.9898+78.233)*43758.5453;return n-Math.floor(n);};
  const groups={
    impact:new Set(['strike','hammer','axe','flint','club','boots']),
    float:new Set(['jewel','ruby','crown','pearl','medallion','crest','mirror','armor','shield']),
    swing:new Set(['bell','balance','swing','horn','music','lyre']),
    travel:new Set(['ship','chariot','swim']),
    flight:new Set(['wing','eagle','sandals']),
    masonry:new Set(['arena','build','column','palace','tower','library','mountain','stairs','stable','throne','royalthrone','gate']),
    pour:new Set(['pour','juice','oil','honey','stir','bowl','vase','jar']),
    steam:new Set(['bake','tea','steam','ember']),
    metal:new Set(['sword','spear','dualblade','royalsword','flamesword','helmet','staff','key','belt','telescope']),
    loose:new Set(['scatter','drop','pop','bounce','stack','goldpile','spice'])
  };
  function timeline(p,t){
    const length=Math.max(1,p.duration),entry=Math.min(.82,length*.22),exit=Math.min(.95,length*.22);
    const enter=ease(t/entry),leave=smooth((t-length+exit)/exit);
    const hit=(p.cues||[]).find(v=>v>=entry*.85&&v<length-exit)||Math.min(1.15,length*.35);
    return {enter,leave,hit,opacity:smooth(t/.18)*(1-leave),reveal:ease((t-.08)/(p.reveal==='tiles'?.9:.55))};
  }
  function motion(p,t,w,h,target){
    const phase=timeline(p,t),rank=clamp((p.tier||1)/9),seed=(p.id%11)/11;
    const safeTop=Math.min(132,h*.28),safeBottom=Math.min(90,h*.20),space=h-safeTop-safeBottom;
    const size=Math.min(w*(.60+rank*.10),space*.85,560),enter=phase.enter,age=Math.max(0,t-phase.hit);
    let x=w*.5,y=safeTop+space*.5,rotation=0,scale=.83+.17*enter,squash=1;
    if(groups.impact.has(p.scene)){
      const wind=smooth((t-phase.hit+.48)/.48),strike=smooth((t-phase.hit)/.16);
      rotation=-.45*wind+.48*strike;rotation+=Math.sin(age*14)*Math.exp(-age*6)*.045;
      y+=size*(.05*strike-.12*wind);scale*=1+Math.sin(age*15)*Math.exp(-age*6)*.015;
    }else if(groups.flight.has(p.scene)){
      x+=w*.42*(1-enter);y+=size*(.16*(1-enter)-.07*Math.sin(t*2.1+seed));rotation=Math.sin(t*2.1)*.025;
    }else if(groups.travel.has(p.scene)){
      x-=w*.43*(1-enter);x+=Math.sin(t*.65)*size*.035;rotation=Math.sin(t*2.2)*.018;y+=Math.sin(t*2.2+.4)*size*.018;
    }else if(groups.masonry.has(p.scene)){
      y+=size*.32*(1-enter);scale=.92+.08*enter;
    }else if(groups.swing.has(p.scene)){
      rotation=Math.sin(Math.max(0,t-.22)*6)*.12*Math.exp(-Math.max(0,t-.22)*.65);y+=size*.06*(1-enter);
    }else if(groups.pour.has(p.scene)){
      const tilt=smooth((t-.65)/.5)*(1-smooth((t-p.duration+.85)/.4));rotation=(p.scene==='stir'?Math.sin(t*3)*.045:-.09)*tilt;y+=size*.06*(1-enter);
    }else if(groups.loose.has(p.scene)){
      y-=size*.23*(1-enter);y-=Math.abs(Math.sin(Math.max(0,t-.5)*5))*size*.055*Math.exp(-Math.max(0,t-.5)*1.4);
    }else if(p.scene==='spin'){
      rotation=t*5/(1+t*.8);y+=size*.08*(1-enter);
    }else if(p.scene==='coin'){
      squash=.38+.62*Math.abs(Math.cos(t*2.8));rotation=Math.sin(t*2)*.045;
    }else if(p.scene==='heart'){
      const beat=(p.cues||[1.2,1.52]).reduce((sum,cue)=>sum+Math.exp(-Math.pow((t-cue)*9,2)),0);
      scale*=1+Math.min(1,beat)*.075;y+=size*.10*(1-enter);
    }else if(p.family==='organic'||p.family==='cloth'){
      y+=size*.18*(1-enter);rotation=Math.sin(t*1.35+seed)*.018;
    }else if(groups.metal.has(p.scene)){
      rotation=-.12*(1-enter)+Math.sin(t*.7)*.014;y+=size*.15*(1-enter);
    }else{
      y+=size*.12*(1-enter);rotation=groups.float.has(p.scene)?Math.sin(t*.8+seed)*.016:0;
      if(groups.float.has(p.scene))y+=Math.sin(t*1.3+seed)*size*.018;
    }
    if(target){x+=(target.x-x)*phase.leave;y+=(target.y-y)*phase.leave;scale*=1-phase.leave*.76;}
    else{y-=size*.07*phase.leave;scale*=1-phase.leave*.07;}
    return {...phase,x,y,size,rotation,scale,squash,rank};
  }
  function atmosphere(c,p,t,m,quality,helpers){
    const {x,y,size:s,rank}=m,color=p.colors[0];
    c.save();
    // A local tonal backdrop keeps the illustration readable without covering the room.
    const backdrop=c.createRadialGradient(x,y,s*.18,x,y,s*.87);
    backdrop.addColorStop(0,'#10091750');backdrop.addColorStop(1,'#10091700');c.fillStyle=backdrop;c.fillRect(x-s,y-s,s*2,s*2);
    helpers.glow(c,x,y,s*.73,color,.12+rank*.12);
    c.save();c.translate(x,y+s*.50);c.scale(1,.16);
    const shadow=c.createRadialGradient(0,0,0,0,0,s*.42);shadow.addColorStop(0,'#00000048');shadow.addColorStop(1,'#00000000');c.fillStyle=shadow;c.fillRect(-s*.42,-s*.42,s*.84,s*.84);c.restore();
    if(rank>.5){
      c.strokeStyle=p.colors[1];c.lineWidth=1;c.globalAlpha*=.16;
      c.beginPath();c.ellipse(x,y+s*.45,s*.48,s*.07,-.07,t*.12,t*.12+Math.PI*1.65);c.stroke();
    }
    const count=Math.round((8+rank*16)*quality);
    for(let i=0;i<count;i++){
      const z=rnd(p.seed+i*7),age=(t*(.10+z*.12)+rnd(i+29))%1;
      const px=x+(rnd(p.seed+i*5)-.5)*s*1.6,py=y+s*.75-age*s*1.5;
      c.globalAlpha=m.opacity*Math.sin(age*Math.PI)*(.08+z*.14);
      c.fillStyle=p.colors[i%3];c.beginPath();c.arc(px,py,.7+z*1.3,0,TAU);c.fill();
    }
    c.restore();
  }
  function glint(asset,p,t){
    const image=asset?.image||asset;if(!image||!global.document)return null;
    let surface=asset.glintSurface;
    if(!surface){surface=global.document.createElement('canvas');surface.width=192;const b=asset.trimmed?[0,0,image.width,image.height]:p.bounds;surface.height=Math.max(1,Math.round(192*(b[3]-b[1])/(b[2]-b[0])));asset.glintSurface=surface;}
    const c=surface.getContext('2d');if(!c)return null;
    const b=asset.trimmed?[0,0,image.width,image.height]:p.bounds;c.clearRect(0,0,surface.width,surface.height);
    c.globalCompositeOperation='source-over';c.drawImage(image,b[0],b[1],b[2]-b[0],b[3]-b[1],0,0,surface.width,surface.height);
    c.globalCompositeOperation='source-in';
    const progress=clamp((t-.7)/Math.max(1,p.duration-1.6)),x=(-.3+progress*1.6)*surface.width;
    const gradient=c.createLinearGradient(x-surface.width*.12,0,x+surface.width*.12,surface.height*.08);
    gradient.addColorStop(0,'#ffffff00');gradient.addColorStop(.5,'#fff5da6b');gradient.addColorStop(1,'#ffffff00');
    c.fillStyle=gradient;c.fillRect(0,0,surface.width,surface.height);c.globalCompositeOperation='source-over';
    return {image:surface,trimmed:true};
  }
  function accents(c,p,t,m,quality,helpers){
    const {x,y,size:s,hit,rank}=m,col=p.colors[0],age=t-hit;
    if(groups.impact.has(p.scene)&&age>=0&&age<.8){
      const q=age/.8;helpers.ring(c,x,y+s*.32,s*(.07+q*.55),col,(1-q)*.55,.19);
      for(let i=0;i<Math.round(12*quality);i++){const a=rnd(p.seed+i)*Math.PI,velocity=s*(.24+rnd(i+8)*.24),px=x+Math.cos(a)*velocity*age,py=y+s*.28-Math.sin(a)*velocity*age+s*.38*age*age;c.save();c.globalAlpha*=(1-q)*.7;helpers.spark(c,px,py,1.2,p.colors[1]);c.restore();}
    }
    if(groups.steam.has(p.scene)||p.scene==='candle'||p.scene==='lantern'){
      c.save();c.strokeStyle='#fff0d5';c.lineWidth=1.25;
      for(let i=0;i<3;i++){const age=(t*.25+i/3)%1;c.globalAlpha*=.40;c.beginPath();c.moveTo(x+(i-1)*s*.09,y-s*.16-age*s*.18);c.bezierCurveTo(x+s*.08,y-s*.35-age*s*.18,x-s*.10,y-s*.48-age*s*.18,x+s*.03,y-s*.60-age*s*.18);c.stroke();}c.restore();
    }
    if(p.family==='liquid'||p.scene==='ship'){
      for(let i=0;i<2;i++){const q=(t*.28+i*.5)%1;helpers.ring(c,x,y+s*.46,s*(.12+q*.46),col,(1-q)*.24,.13);}
      if(['fountain','trident','vortex'].includes(p.scene)){
        c.save();c.strokeStyle=p.colors[1];c.lineWidth=1.6;c.globalAlpha*=.3;
        for(let i=0;i<3;i++){const dx=(i-1)*s*.16;c.beginPath();c.moveTo(x+dx,y+s*.1);c.bezierCurveTo(x+dx,y-s*.52,x+dx*2,y-s*.52,x+dx*2,y+s*.35);c.stroke();}c.restore();
      }
    }
    if(p.family==='fire'){
      c.save();c.globalCompositeOperation='lighter';
      for(let i=0;i<Math.round(18*quality);i++){const q=(t*.45+rnd(p.seed+i))%1;c.globalAlpha=m.opacity*Math.sin(q*Math.PI)*.6;const px=x+(rnd(i+2)-.5)*s*.35+Math.sin(t+i)*s*.025,py=y+s*.12-q*s*.75;c.fillStyle=i%2?'#ff9c43':'#ffe098';c.beginPath();c.arc(px,py,1+rnd(i)*1.5,0,TAU);c.fill();}c.restore();
    }
    if(['lightning','staff','flamesword','royalsword','hammer'].includes(p.scene)){
      const discharge=Math.exp(-Math.pow((t-hit)*4,2));
      if(discharge>.02){c.save();c.globalAlpha*=discharge*.40;helpers.lightning(c,x,y,s*.72,t,col,p.seed);c.restore();}
    }
    if(p.scene==='heart'){
      const pulses=p.cues||[1.2,1.52];for(const cue of pulses){const a=t-cue;if(a>0&&a<.8)helpers.ring(c,x,y,s*(.28+a*.40),col,(1-a/.8)*.22);}
    }
    if(['treasure','chest','coin','goldpile'].includes(p.scene)&&age>=0&&age<1.7){
      for(let i=0;i<Math.round((6+rank*7)*quality);i++){const dt=age-rnd(p.seed+i)*.25;if(dt<0)continue;const a=-Math.PI*.2-rnd(i+5)*Math.PI*.6,velocity=s*(.34+rnd(i)*.20),px=x+Math.cos(a)*velocity*dt,py=y+s*.10+Math.sin(a)*velocity*dt+s*.32*dt*dt;c.save();c.globalAlpha*=smooth((1.7-dt)/.45);if(p.scene==='treasure')helpers.gem(c,px,py,s*.021,p.colors[i%3],dt+i);else helpers.coin(c,px,py,s*.017,col,dt*7+i);c.restore();}
    }
    if(['crown','ruby','jewel','medallion','pearl','crest','sun','mirror'].includes(p.scene)){
      for(let i=0;i<3;i++){const flash=Math.exp(-Math.pow((t-hit-.18-i*.32)*6,2));if(flash>.02){const a=i*TAU/3-.8;c.save();c.globalAlpha*=flash*.55;helpers.spark(c,x+Math.cos(a)*s*.26,y+Math.sin(a)*s*.29,2+rank*2,p.colors[1]);c.restore();}}
    }
  }
  function render(c,p,asset,t,w,h,quality=1,target=null,helpers){
    c.clearRect(0,0,w,h);if(t<=0||t>=p.duration||!asset)return;
    const m=motion(p,t,w,h,target);quality=clamp(quality,.3,1);
    // A flat top-band cut cannot form a perspective-correct chest lid or gate.
    // Preserve these illustrations intact until layered artwork is available.
    const artworkPlan=p.rig==='lid'?{...p,rig:'solid'}:p;
    c.save();c.globalAlpha=m.opacity;
    atmosphere(c,p,t,m,quality,helpers);
    c.save();c.translate(m.x,m.y);c.scale(m.squash,1);
    helpers.sprite(c,asset,artworkPlan,0,0,m.size,m.rotation,m.scale,1,m.reveal,t);
    // The moving highlight is masked by the real artwork alpha, including cloth/wing rigs.
    if(quality>.55&&!['food','organic'].includes(p.family)&&t>.6&&m.leave<.4){
      const mask=glint(asset,p,t);if(mask){c.save();c.globalCompositeOperation='screen';helpers.sprite(c,mask,artworkPlan,0,0,m.size,m.rotation,m.scale,.34,m.reveal,t);c.restore();}
    }
    c.restore();accents(c,p,t,m,quality,helpers);c.restore();
  }
  global.ErisGiftUltra={render,motion,timeline,version:'20261004'};
})(typeof window==='undefined'?globalThis:window);
