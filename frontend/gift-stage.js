/* ErisChat gift cinema: continuous Canvas scenes with per-artwork timelines and SFX. */
(function(global){
  'use strict';
  const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const rnd=n=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
  const ease=x=>1-Math.pow(1-clamp(x),3);
  function glow(c,x,y,r,color,alpha=1){c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color+'99');g.addColorStop(.35,color+'32');g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
  function ring(c,x,y,r,color,alpha=1,stretch=1){c.save();c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=1.8;c.beginPath();c.ellipse(x,y,Math.max(.1,r),Math.max(.1,r*stretch),0,0,TAU);c.stroke();c.restore();}
  function spark(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.moveTo(x-r,y);c.quadraticCurveTo(x,y,x,y-r);c.quadraticCurveTo(x,y,x+r,y);c.quadraticCurveTo(x,y,x,y+r);c.quadraticCurveTo(x,y,x-r,y);c.fill();}
  function gem(c,x,y,r,color,spin=0){c.save();c.translate(x,y);c.rotate(spin);c.fillStyle=color;c.strokeStyle='#fff4';c.lineWidth=.7;c.beginPath();c.moveTo(0,-r);c.lineTo(r*.8,-r*.25);c.lineTo(r*.65,r*.55);c.lineTo(0,r);c.lineTo(-r*.65,r*.55);c.lineTo(-r*.8,-r*.25);c.closePath();c.fill();c.stroke();c.beginPath();c.moveTo(-r*.8,-r*.25);c.lineTo(r*.8,-r*.25);c.lineTo(0,r);c.lineTo(-r*.8,-r*.25);c.stroke();c.restore();}
  function coin(c,x,y,r,color,t){c.save();c.translate(x,y);c.scale(Math.max(.12,Math.abs(Math.cos(t))),1);c.fillStyle=color;c.strokeStyle='#fff4';c.lineWidth=1;c.beginPath();c.arc(0,0,r,0,TAU);c.fill();c.stroke();c.beginPath();c.arc(0,0,r*.68,0,TAU);c.stroke();c.restore();}
  function heartPath(c,x,y,s){c.moveTo(x,y+s*.27);c.bezierCurveTo(x-s*.95,y-s*.2,x-s*.62,y-s*.9,x,y-s*.43);c.bezierCurveTo(x+s*.62,y-s*.9,x+s*.95,y-s*.2,x,y+s*.27);}
  function ribbon(c,x,y,s,t,col,turns=3){c.save();c.strokeStyle=col;c.lineWidth=2;c.globalAlpha*=.7;c.beginPath();for(let i=0;i<90;i++){const u=i/89,a=u*TAU*turns+t,xx=x+Math.sin(a)*s*(.25+u*.45),yy=y+s*.7-u*s*1.5;i?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.stroke();c.restore();}
  function lightning(c,x,y,s,t,col,seed){c.save();c.globalCompositeOperation='lighter';for(let branch=0;branch<4;branch++){c.beginPath();c.lineWidth=branch?1.8:4;c.strokeStyle=branch?'#effaff':col;let xx=x,yy=y-s*.65;c.moveTo(xx,yy);for(let j=1;j<10;j++){xx=x+(rnd(seed+branch*15+j)-.5)*s*.5+branch*s*.12;yy=y-s*.65+j*s*.13;c.lineTo(xx,yy);}c.globalAlpha*=.85;c.stroke();}c.restore();}
  function sprite(c,asset,plan,x,y,size,rotation=0,scale=1,alpha=1,reveal=1,t=0){
    const image=asset?.image||asset;if(!image)return;
    const b=asset?.trimmed?[0,0,image.width,image.height]:plan.bounds;
    const iw=b[2]-b[0],ih=b[3]-b[1],w=size*iw/Math.max(iw,ih),h=size*ih/Math.max(iw,ih);
    c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);c.globalAlpha*=alpha;
    const draw=(sx,sy,sw,sh,dx,dy,dw,dh)=>{if(sw>0&&sh>0&&dw>0&&dh>0)c.drawImage(image,b[0]+sx*iw,b[1]+sy*ih,sw*iw,sh*ih,dx*w-w/2,dy*h-h/2,dw*w,dh*h);};
    if(plan.reveal==='tiles'&&reveal<1){
      const n=plan.scene==='mosaic'?6:4;for(let row=0;row<n;row++)for(let col=0;col<n;col++){const z=ease((reveal-rnd(plan.seed+row*n+col)*.42)/.55),a=(col+row*n)*2.399;c.save();c.translate(Math.cos(a)*(1-z)*size*.8,Math.sin(a)*(1-z)*size*.8);c.globalAlpha*=z;draw(col/n,row/n,1/n,1/n,col/n,row/n,1/n,1/n);c.restore();}
    }else{
      if(reveal<1){c.beginPath();if(plan.reveal==='wipe')c.rect(-w*reveal/2,-h/2,w*reveal,h);else if(plan.reveal==='bloom'||plan.reveal==='portal')c.ellipse(0,0,Math.max(.1,w*.7*reveal),Math.max(.1,h*.7*reveal),0,0,TAU);else c.rect(-w/2,h/2-h*reveal,w,h*reveal);c.clip();}
      if(plan.rig==='cloth'||plan.rig==='growth'){
        const n=32;for(let k=0;k<n;k++){const v=k/n,wave=Math.sin(v*9-t*(plan.rig==='cloth'?7:3)+plan.id*.07)*size*(plan.rig==='cloth'?.035:.018)*v;c.save();c.translate(wave,0);draw(0,v,1,1/n,0,v,1,1/n+.002);c.restore();}
      }else if(plan.rig==='wing'&&plan.wing){
        const wing=plan.wing,path=()=>{c.moveTo(wing.polygon[0][0]*w-w/2,wing.polygon[0][1]*h-h/2);for(const [px,py] of wing.polygon.slice(1))c.lineTo(px*w-w/2,py*h-h/2);c.closePath();};
        c.save();c.beginPath();c.rect(-w/2,-h/2,w,h);path();c.clip('evenodd');draw(0,0,1,1,0,0,1,1);c.restore();
        c.save();const px=(wing.pivot[0]-.5)*w,py=(wing.pivot[1]-.5)*h;c.translate(px,py);c.rotate(Math.sin(t*6)*wing.amplitude);c.translate(-px,-py);c.beginPath();path();c.clip();draw(0,0,1,1,0,0,1,1);c.restore();
      }else if(plan.rig==='lid'){
        draw(0,.42,1,.58,0,.42,1,.58);const opening=Math.max(0,Math.sin(clamp((t-.55)/3.6)*Math.PI));c.save();c.translate(0,-h*.08);c.rotate(-opening*(plan.scene==='gate'?.08:.17));c.scale(1,1-opening*.25);c.translate(0,h*.08);draw(0,0,1,.42,0,0,1,.42);c.restore();
      }else if(plan.rig==='balance'){
        draw(.3,0,.4,1,.3,0,.4,1);for(const side of [0,1]){c.save();c.translate(0,Math.sin(t*5)*(side?1:-1)*h*.055*Math.exp(-t*.4));draw(side?.7:0,0,.3,1,side?.7:0,0,.3,1);c.restore();}
      }else draw(0,0,1,1,0,0,1,1);
    }
    c.restore();
  }
  function particles(c,p,t,x,y,s,quality,front=false){
    const count=Math.round(p.particles*quality*(front?.55:1));c.save();c.globalCompositeOperation='lighter';
    for(let i=0;i<count;i++){
      const seed=p.seed+i*19,u=rnd(seed),v=rnd(seed+1),delay=rnd(seed+2)*1.5,lifetime=1.2+v*1.5,phase=(t-delay)/lifetime;
      if(phase<0)continue;const age=phase%1,angle=u*TAU,r=s*(.15+age*.8),col=p.colors[i%3];
      let px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r*.8;
      if(p.family==='organic'){px=x+(u-.5)*s*1.5+Math.sin(t*1.8+i)*s*.06;py=y+s*.7-age*s*1.55;}
      else if(p.family==='liquid'||p.scene==='ship'){px=x+(u-.5)*s*1.3;py=y+s*.45-Math.sin(age*Math.PI)*s*(.3+v*.4);}
      else if(p.family==='fire'){px=x+(u-.5)*s*.5+Math.sin(t*4+i)*s*.08;py=y+s*.25-age*s*1.1;}
      else if(p.scene==='treasure'||p.scene==='goldpile'||p.scene==='coin'){px=x+(u-.5)*s*age*1.5;py=y+s*.1-Math.sin(age*Math.PI)*s*(.65+v*.4);}
      else if(p.family==='stone'){py=y+s*.45+(v-.5)*s*.13;px=x+Math.cos(angle)*r;}
      c.globalAlpha=Math.sin(age*Math.PI)*(.25+v*.5);
      const size=1.5+rnd(seed+3)*3;
      if(p.family==='organic'){c.save();c.translate(px,py);c.rotate(angle+t);c.fillStyle=col;c.beginPath();c.ellipse(0,0,size*1.7,size*.6,0,0,TAU);c.fill();c.restore();}
      else if(p.scene==='coin'||p.scene==='goldpile')coin(c,px,py,size*1.8,col,t*4+i);
      else if(p.scene==='treasure'||p.family==='treasure'&&front)gem(c,px,py,size*1.6,col,t+i);
      else if(p.family==='liquid'){c.fillStyle=col;c.beginPath();c.arc(px,py,size,0,TAU);c.fill();}
      else spark(c,px,py,size,col);
    }c.restore();
  }
  function environment(c,p,t,x,y,s,quality){
    const [a,b]=p.colors,energy=Math.sin(clamp((t-.2)/(p.duration-.6))*Math.PI);
    c.save();c.globalAlpha*=energy;
    glow(c,x,y,s*.9,a,.55);ring(c,x,y+s*.44,s*.48,a,.3,.2);
    if(p.family==='liquid'||p.scene==='ship'){
      for(let i=0;i<4;i++){const u=(t*.5+i*.24)%1;ring(c,x,y+s*.35,s*(.25+u*.7),a,(1-u)*.6,.18);}
      if(['fountain','trident','pour','juice','oil','honey','vortex'].includes(p.scene)){
        c.strokeStyle=a;c.lineWidth=p.scene==='honey'?5:2.4;
        for(let i=0;i<(p.scene==='trident'?3:5);i++){const ang=-1+i*.5;c.beginPath();c.moveTo(x,y+s*.22);c.bezierCurveTo(x+ang*s*.15,y-s*.8,x+ang*s*.5,y-s*.7,x+ang*s*.5,y+s*.35);c.globalAlpha=.28+Math.sin(t*5+i)*.1;c.stroke();}
      }
    }
    if(p.family==='cloth'){ribbon(c,x,y,s*.8,t*2,a,2+(p.id%3));}
    if(p.family==='organic'){for(let i=0;i<5;i++){const bx=x+(i-2)*s*.21,curl=Math.sin(t*2+i)*s*.08;c.strokeStyle=a;c.lineWidth=1.3;c.beginPath();c.moveTo(bx,y+s*.6);c.quadraticCurveTo(bx+curl,y,bx+s*.06,y-s*.6);c.stroke();}}
    if(p.family==='stone'){
      const n=6+(p.id%5);for(let i=0;i<n;i++){const u=clamp((t-.5-i*.07)/1.1);c.fillStyle=a+'44';c.fillRect(x+(i/n-.5)*s*1.2,y+s*.5-smooth(u)*s*1.1,s*.012,smooth(u)*s*1.1);}
      if(['gate','palace','tower','library','mountain','arena','stairs','royalthrone'].includes(p.scene)){c.fillStyle=b+'22';c.beginPath();c.moveTo(x-s*.2,y+s*.35);c.lineTo(x+s*.2,y+s*.35);c.lineTo(x+s*.85,y-s*1.3);c.lineTo(x-s*.85,y-s*1.3);c.closePath();c.fill();}
    }
    if(p.family==='fire'){
      c.globalCompositeOperation='lighter';for(let i=0;i<7;i++){const r=s*(.16+i*.015),fx=x+Math.sin(i*5+t*3)*s*.2,fy=y+s*.14;const g=c.createLinearGradient(0,fy,0,fy-s*.7);g.addColorStop(0,'#ffd46daa');g.addColorStop(.45,'#ff662888');g.addColorStop(1,'#ff400000');c.fillStyle=g;c.beginPath();c.moveTo(fx-r,fy);c.bezierCurveTo(fx-r*2,fy-s*.3,fx+r,fy-s*.2,fx+Math.sin(t*7+i)*r,fy-s*(.5+Math.sin(t*6+i)*.1));c.bezierCurveTo(fx+r*2,fy-s*.2,fx+r,fy-s*.05,fx+r,fy);c.fill();}
    }
    if(p.family==='forge'){
      c.globalCompositeOperation='lighter';const v=(t*.7)%1;c.strokeStyle=b;c.lineWidth=2+Math.sin(t*8);c.beginPath();c.arc(x,y,s*.62,-Math.PI*.8,-Math.PI*.8+v*Math.PI*1.7);c.stroke();
      if(['strike','hammer','flint','axe'].includes(p.scene)&&t>1.1){const hit=(t-1.1)%1;ring(c,x,y+s*.35,s*hit,a,(1-hit)*.7,.26);}
    }
    if(p.family==='music'){
      for(let i=0;i<6;i++){const phase=(t*.55+i*.17)%1,nx=x+(i-2.5)*s*.15+Math.sin(t+i)*s*.08,ny=y+s*.3-phase*s*1.3;c.globalAlpha=Math.sin(phase*Math.PI)*.8;c.fillStyle=a;c.beginPath();c.ellipse(nx,ny,s*.025,s*.016,-.5,0,TAU);c.fill();c.strokeStyle=a;c.lineWidth=1.5;c.beginPath();c.moveTo(nx+s*.022,ny);c.lineTo(nx+s*.022,ny-s*.09);c.quadraticCurveTo(nx+s*.08,ny-s*.06,nx+s*.05,ny-s*.03);c.stroke();}
      if(p.scene==='bell')for(let i=0;i<3;i++){const u=(t*.6+i/3)%1;ring(c,x,y,s*(.4+u*.5),b,(1-u)*.55);}
    }
    if(p.family==='sky'){
      c.strokeStyle=b;c.lineWidth=1;for(let i=0;i<6;i++){const xx=x-s*.9+(t*.3+i*.17)%1*s*1.8,yy=y+(i-2.5)*s*.14;c.beginPath();c.moveTo(xx,yy);c.lineTo(xx-s*(.12+(i%3)*.08),yy);c.globalAlpha=.3;c.stroke();}
    }
    c.restore();particles(c,p,t,x,y,s,quality,false);
  }
  function signature(c,p,t,x,y,s){
    const col=p.colors[0],pulse=Math.sin(t*6),alive=clamp((t-.6)/.3)*clamp((p.duration-t-.25)/.4);
    c.save();c.globalAlpha*=alive;c.globalCompositeOperation='lighter';
    if(p.scene==='heart'){
      const beat=Math.exp(-Math.pow((t-1.2)*8,2))+Math.exp(-Math.pow((t-1.52)*10,2))*.6;
      glow(c,x,y,s*.8+beat*s*.2,col,.55);c.strokeStyle=col;c.lineWidth=2.5;c.beginPath();heartPath(c,x,y+s*.18,s*.76);c.setLineDash([s*3.8]);c.lineDashOffset=s*3.8*(1-ease((t-.5)/1.9));c.stroke();c.setLineDash([]);
      for(let i=0;i<3;i++){const u=clamp((t-1.18-i*.25)/1.2);if(u>0&&u<1)ring(c,x,y,s*(.35+u*.65),col,(1-u)*.6);}
    }else if(['lightning','hammer','flamesword','staff','royalsword'].includes(p.scene)){
      const flash=p.scene==='lightning'?.55:Math.max(0,Math.sin(t*4));if(flash>.1){c.globalAlpha*=flash;lightning(c,x,y,s*.85,t,col,p.seed+Math.floor(t*8));}
      if(p.scene==='staff'){c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.moveTo(x,y-s*.8);c.lineTo(x-s*.26,y-s*.35);c.lineTo(x+s*.26,y-s*.35);c.closePath();c.stroke();}
    }else if(['treasure','chest','goldpile','coin'].includes(p.scene)){
      const n=p.scene==='chest'?8:18;for(let i=0;i<n;i++){const age=clamp((t-.8-rnd(p.seed+i)*.65)/2.1),sx=x+(rnd(p.seed+i+9)-.5)*s*age*1.2,sy=y+s*.07-Math.sin(age*Math.PI)*s*(.55+rnd(i)*.6);c.globalAlpha=alive*Math.sin(age*Math.PI);if(p.scene==='treasure')gem(c,sx,sy,s*.035,p.colors[i%3],age*9+i);else coin(c,sx,sy,s*.027,col,t*4+i);}
    }else if(['crown','ruby','jewel','medallion','crest'].includes(p.scene)){
      for(let i=0;i<7;i++){const a=i/7*TAU-Math.PI/2,r=s*.37,u=Math.max(0,Math.sin((t-i*.09)*5));glow(c,x+Math.cos(a)*r,y+Math.sin(a)*r,s*.08,col,u*.7);spark(c,x+Math.cos(a)*r,y+Math.sin(a)*r,s*.025*u,p.colors[1]);}
    }else if(['sun','key','ripple','shield','armor','mirror','telescope'].includes(p.scene)){
      for(let i=0;i<3;i++){const u=(t*.3+i*.33)%1;ring(c,x,y,s*(.28+u*.6),col,(1-u)*.6,p.scene==='key'?.65:1);}
      if(p.scene==='sun')for(let i=0;i<16;i++){const a=i/16*TAU+t*.2;c.strokeStyle=col;c.lineWidth=1.4;c.beginPath();c.moveTo(x+Math.cos(a)*s*.35,y+Math.sin(a)*s*.35);c.lineTo(x+Math.cos(a)*s*(.6+pulse*.07),y+Math.sin(a)*s*(.6+pulse*.07));c.stroke();}
      if(p.scene==='shield'||p.scene==='armor'||p.scene==='crest'){for(let i=0;i<9;i++){const a=i/9*TAU;c.strokeStyle=col+'99';c.lineWidth=.8;c.beginPath();for(let j=0;j<6;j++){const b=j/6*TAU,xx=x+Math.cos(a)*s*.35+Math.cos(b)*s*.08,yy=y+Math.sin(a)*s*.35+Math.sin(b)*s*.08;j?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.closePath();c.stroke();}}
    }else if(p.scene==='hourglass'){
      for(let i=0;i<45;i++){const age=(t*.6+i*.023)%1,nx=x+(rnd(i+p.seed)-.5)*s*.22*Math.abs(age-.5)*2,ny=y+(age-.5)*s*.6;c.fillStyle=p.colors[i%3];c.fillRect(nx,ny,1.7,1.7);}
    }else if(p.scene==='hydra'||p.scene==='medusa'){
      for(let i=0;i<5;i++){c.strokeStyle=col;c.lineWidth=1.8;c.beginPath();c.moveTo(x,y+s*.3);c.bezierCurveTo(x+Math.sin(t+i)*s*.7,y+s*.1,x+Math.sin(t*1.4+i)*s*.55,y-s*.4,x+(i-2)*s*.23,y-s*.7+Math.sin(t*2+i)*s*.1);c.stroke();}
    }else if(p.scene==='bow'||p.scene==='arrow'){
      const age=clamp((t-1.3)/.65);if(age>0){c.strokeStyle=col;c.lineWidth=3;c.beginPath();c.moveTo(x-s*.4+age*s*1.3,y);c.lineTo(x+age*s*1.3,y);c.stroke();spark(c,x+age*s*1.3,y,s*.035,col);}
    }else if(p.scene==='bloom'||p.scene==='mirror'){
      for(let i=0;i<8;i++){const a=i/8*TAU+t*.4,rad=s*.5*Math.sin(clamp((t-.3)/3)*Math.PI);c.fillStyle=p.colors[i%3];c.beginPath();c.ellipse(x+Math.cos(a)*rad,y+Math.sin(a)*rad,s*.06,s*.02,a,0,TAU);c.fill();}
    }else if(p.scene==='lyre'){
      for(let i=0;i<7;i++){const xx=x+(i-3)*s*.045;c.strokeStyle=col;c.lineWidth=.8;c.beginPath();c.moveTo(xx,y-s*.2);c.quadraticCurveTo(xx+Math.sin(t*30+i)*s*.02,y,xx,y+s*.15);c.stroke();}
    }else if(['bake','tea','steam','ember','jar'].includes(p.scene)){
      for(let i=0;i<5;i++){c.strokeStyle=p.colors[1]+'77';c.lineWidth=2;c.beginPath();c.moveTo(x+(i-2)*s*.12,y);c.bezierCurveTo(x+Math.sin(t*2+i)*s*.25,y-s*.2,x+Math.cos(t*2+i)*s*.2,y-s*.5,x+(i-2)*s*.17,y-s*.7);c.stroke();}
    }
    c.restore();
  }
  function renderFrame(c,p,asset,t,w,h,quality=1,destination=null){
    if(p.craft&&global.ErisCraftGifts)return global.ErisCraftGifts.render(c,p,asset,t,w,h,quality,destination,{sprite,glow,ring,spark,gem,coin,lightning});
    if(p.agora&&global.ErisAgoraGifts)return global.ErisAgoraGifts.render(c,p,asset,t,w,h,quality,destination,{sprite,glow,ring,spark,gem,coin,lightning});
    if(global.ErisGiftUltra)return global.ErisGiftUltra.render(c,p,asset,t,w,h,quality,destination,{sprite,glow,ring,spark,gem,coin,lightning});
    c.clearRect(0,0,w,h);if(t<0||t>p.duration)return;
    const enter=ease(t/.72),end=smooth((t/p.duration-.83)/.17),opacity=smooth(t/.2)*(1-end),s=Math.min(w*.66,h*.47),cx=w*.5,cy=h*.47;
    let x=cx,y=cy,rot=0,scale=.9+enter*.1;
    if(['spin','orbit','magnet','coin','ruby','perfume'].includes(p.scene)){rot=Math.sin(t*2.8)*.18;scale*=1+Math.sin(t*2)*.025;}
    else if(['strike','hammer','axe','flint'].includes(p.scene)){rot=-.65*(1-enter)+Math.sin(t*7)*.12*Math.exp(-t*.5);y+=Math.max(0,Math.sin(t*5))*s*.08;}
    else if(['drop','bounce','stack','goldpile','pop','bake'].includes(p.scene)){y-=Math.abs(Math.sin(t*4))*s*.12*Math.exp(-t*.7);rot=Math.sin(t*3)*.05;}
    else if(['wing','eagle','sandals','swim'].includes(p.scene)){x+=(1-enter)*w*.55+Math.sin(t*1.8)*s*.07;y-=Math.sin(t*2)*s*.08;rot=Math.sin(t*2)*.06;}
    else if(['ship','chariot'].includes(p.scene)){x+=(1-enter)*-w*.6+(t/p.duration-.5)*s*.14;rot=Math.sin(t*2)*.035;}
    else if(['bell','balance','swing'].includes(p.scene))rot=Math.sin(t*7)*.17*Math.exp(-t*.35);
    else if(p.family==='stone')y+=(1-enter)*s*.6;
    else if(p.family==='organic'){y+=(1-enter)*s*.3;rot=Math.sin(t*2+p.id)*.025;}
    else{rot=(1-enter)*((p.id%3)-1)*.3;y+=(1-enter)*s*.16;}
    if(p.scene==='heart')scale*=1+Math.exp(-Math.pow((t-1.2)*8,2))*.13+Math.exp(-Math.pow((t-1.52)*10,2))*.07;
    if(p.scene==='sun'||p.scene==='ripple')rot+=Math.sin(t*.9)*.12;
    if(destination){x+=(destination.x-x)*end;y+=(destination.y-y)*end;scale*=1-end*.8;}
    c.save();c.globalAlpha=opacity;
    environment(c,p,t,x,y,s,quality);
    const reveal=ease((t-.1)/(['tiles','rise','bloom'].includes(p.reveal)?1.05:.6));
    sprite(c,asset,p,x,y,s,rot,scale,1,reveal,t);
    // Re-light details with travelling pinpoints rather than a flashing full image.
    if(t>.9){const a=t*1.7+p.id*.18;spark(c,x+Math.cos(a)*s*.19,y+Math.sin(a)*s*.26,3.5,p.colors[1]);}
    signature(c,p,t,x,y,s);particles(c,p,t,x,y,s,quality,true);c.restore();
  }
  const doc=global.document;const api={renderFrame};global.ErisGiftStage=api;if(!doc)return;
  const base=new URL('.',doc.currentScript?.src||global.location.href);
  let catalogPromise,plans=new Map(),giftNames=new Map(),queue=[],active=null,epoch=0,raf=0,root=null,audioContext,master,audioReady=Promise.resolve();
  const images=new Map(),sounds=new Map(),seen=new Map(),scopeVersions={room:0,dm:0,preview:0};let enabled=true;
  try{enabled=global.localStorage.getItem('eris.gift.sound')!=='off';}catch(_){}
  async function catalog(){catalogPromise ||= global.fetch(new URL('gift-effects/catalog.json?v=craft-20261010',base),{signal:global.AbortSignal?.timeout?.(8000)}).then(r=>{if(!r.ok)throw new Error('Hediye efektleri yüklenemedi.');return r.json();}).then(r=>{plans=new Map(r.items.map(p=>[String(p.id),p]));giftNames=new Map(r.items.map(p=>[String(p.name),String(p.id)]));return plans;}).catch(e=>{catalogPromise=null;throw e;});return catalogPromise;}
  function unlock(){if(!enabled)return;try{const C=global.AudioContext||global.webkitAudioContext;if(!C)return;audioContext ||= new C();if(!master){master=audioContext.createGain();master.gain.value=.28;master.connect(audioContext.destination);}if(audioContext.state==='suspended')audioReady=audioContext.resume().catch(()=>{});}catch(_){} }
  function soundEnabled(value){if(value===undefined)return enabled;enabled=!!value;try{global.localStorage.setItem('eris.gift.sound',enabled?'on':'off');}catch(_){}if(active?.sourceGain)active.sourceGain.gain.setTargetAtTime(enabled?1:0,audioContext.currentTime,.025);if(enabled)unlock();doc.querySelectorAll('[data-gift-sound]').forEach(b=>{b.textContent=enabled?'Ses açık':'Ses kapalı';b.setAttribute('aria-pressed',String(enabled));});return enabled;}
  doc.addEventListener('pointerdown',unlock,{capture:true,passive:true});doc.addEventListener('keydown',unlock,{capture:true});
  const limited=(promise,ms)=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(null),ms))]);
  function retain(cache,key,value,max){cache.delete(key);cache.set(key,value);while(cache.size>max){const first=cache.keys().next().value,old=cache.get(first);old?.image?.close?.();cache.delete(first);}return value;}
  async function imageFor(p){if(images.has(p.id))return images.get(p.id);const image=new Image();image.decoding='async';const loaded=new Promise(resolve=>{image.onload=async()=>{let asset={image,trimmed:false};try{if(global.createImageBitmap){const b=p.bounds,max=Math.max(b[2]-b[0],b[3]-b[1]),factor=Math.min(1,((global.navigator.deviceMemory||4)<=2?448:896)/max);const bitmap=await global.createImageBitmap(image,b[0],b[1],b[2]-b[0],b[3]-b[1],{resizeWidth:Math.max(1,Math.round((b[2]-b[0])*factor)),resizeHeight:Math.max(1,Math.round((b[3]-b[1])*factor))});asset={image:bitmap,trimmed:true};}}catch(_){}resolve(retain(images,p.id,asset,8));};image.onerror=()=>resolve(null);});image.src=new URL(p.image,base).href;return limited(loaded,15000);}
  async function soundFor(p){if(!enabled||!audioContext)return null;await limited(audioReady,600);if(audioContext.state!=='running')return null;if(sounds.has(p.id))return sounds.get(p.id);try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);try{const r=await global.fetch(new URL(p.audio,base),{signal:controller.signal});if(!r.ok)return null;const buffer=await audioContext.decodeAudioData(await r.arrayBuffer());return retain(sounds,p.id,buffer,6);}finally{clearTimeout(timer);}}catch(_){return null;}}
  function mount(){if(root)return;root=doc.createElement('section');root.className='eris-gift-cinema';root.setAttribute('aria-label','Hediye animasyonu');root.innerHTML='<canvas aria-hidden="true"></canvas><div class="gift-cinema-caption" role="status" aria-live="polite"><b></b><span></span></div><div class="gift-cinema-tools"><button type="button" data-gift-sound></button><button type="button" data-skip aria-label="Bu animasyonu kapat">×</button></div>';doc.body.append(root);root.querySelector('[data-gift-sound]').onclick=()=>soundEnabled(!enabled);root.querySelector('[data-skip]').onclick=()=>finish();soundEnabled(enabled);}
  function finish(){epoch++;if(raf)global.cancelAnimationFrame(raf);raf=0;try{active?.source?.stop();}catch(_){}active=null;root?.remove();root=null;next();}
  function clear(scope){if(scope)scopeVersions[scope]=(scopeVersions[scope]||0)+1;else Object.keys(scopeVersions).forEach(key=>scopeVersions[key]++);queue=scope?queue.filter(item=>item.scope!==scope):[];if(!scope||active?.item.scope===scope)finish();}
  function destination(item){if(item.scope==='room'){const target=[...doc.querySelectorAll('.eris-seat[data-user-id]')].find(n=>n.dataset.userId===String(item.recipient_id));if(target){const r=target.getBoundingClientRect();if(r.width)return {x:r.left+r.width/2,y:r.top+r.height/2};}}return null;}
  async function next(){
    if(active||!queue.length||doc.hidden)return;const item=queue.shift(),p=plans.get(String(item.gift_key));if(!p)return next();const generation=++epoch;active={item,p};
    const audioPromise=soundFor(p);const asset=await imageFor(p);if(epoch!==generation||!active)return;
    const audioBuffer=await limited(audioPromise,900);if(epoch!==generation||!active)return;
    if(!asset){global.toast?.((item.preview?'Önizleme yüklenemedi: ':'Hediye: ')+p.name+' ×'+item.quantity);active=null;return next();}
    mount();root.querySelector('.gift-cinema-caption b').textContent=p.name+' ×'+item.quantity;
    const caption=root.querySelector('.gift-cinema-caption span');
    if(item.preview)caption.textContent='Ücretsiz önizleme';
    else{const sender=document.createElement('span'),recipient=document.createElement('span');sender.textContent=item.sender_nickname||item.sender_name||'Bir kullanıcı';recipient.textContent=item.recipient_nickname||item.recipient_name||'Alıcı';caption.replaceChildren(sender,document.createTextNode(' → '),recipient);if(sender.textContent!=='Birden çok gönderici')window.ErisRoleBadges?.bind(sender,item.sender_id);if(recipient.textContent!=='Birden çok alıcı')window.ErisRoleBadges?.bind(recipient,item.recipient_id);}

    const startSound=()=>{if(epoch!==generation||!active||!audioBuffer||!enabled||audioContext?.state!=='running')return;try{const source=audioContext.createBufferSource(),gain=audioContext.createGain();source.buffer=audioBuffer;gain.gain.value=1;source.connect(gain);gain.connect(master);source.onended=()=>{source.disconnect();gain.disconnect();};source.start(audioContext.currentTime);active.source=source;active.sourceGain=gain;}catch(_){}};
    const canvas=root.querySelector('canvas'),c=canvas.getContext('2d',{alpha:true});if(!c){startSound();const fallback=doc.createElement('img');fallback.src=new URL(p.image,base).href;fallback.alt=p.name;fallback.style.cssText='position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);width:min(70vw,450px);max-height:60vh;object-fit:contain';root.append(fallback);setTimeout(()=>{if(epoch===generation)finish();},Math.round(p.duration*1000));return;}
    const reduced=global.matchMedia?.('(prefers-reduced-motion: reduce)').matches,lasting=reduced?1.1:p.duration;
    let w=0,h=0,dpr=1,quality=(global.navigator.deviceMemory||4)<=2?.55:1,start=global.performance.now(),last=start,slow=0;
    const fit=()=>{w=global.visualViewport?.width||global.innerWidth;h=global.visualViewport?.height||global.innerHeight;dpr=Math.min(global.devicePixelRatio||1,1.6,Math.sqrt(1400000/(w*h)));canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';};fit();
    start=global.performance.now();last=start;startSound();
    const target=destination(item),tick=now=>{if(epoch!==generation||!active)return;const time=(now-start)/1000;if(time>=lasting){finish();return;}const frameTime=now-last;last=now;slow=frameTime>40?Math.min(16,slow+1):Math.max(0,slow-1);if(slow>8)quality=Math.max(.4,quality-.04);else if(slow===0)quality=Math.min((global.navigator.deviceMemory||4)<=2?.55:1,quality+.01);if(w!==(global.visualViewport?.width||global.innerWidth)||h!==(global.visualViewport?.height||global.innerHeight))fit();c.setTransform(dpr,0,0,dpr,0,0);
      if(reduced){c.clearRect(0,0,w,h);sprite(c,asset,p,w*.5,h*.47,Math.min(w*.6,h*.45),0,1,smooth(time/.15)*smooth((lasting-time)/.2),1,1.4);}else renderFrame(c,p,asset,time,w,h,quality,target);
      raf=global.requestAnimationFrame(tick);};raf=global.requestAnimationFrame(tick);
  }
  async function enqueue(detail,scope='room',preview=false){
    if(doc.hidden&&preview)return;const scopeVersion=scopeVersions[scope]||0;
    try{await catalog();}catch(_){global.toast?.('Hediye efektleri yüklenemedi.');return;}
    if(scopeVersion!==(scopeVersions[scope]||0))return;
    const key=String(detail?.gift_key||''),id=String(detail?.gift_id||(/^[0-9]{1,3}$/.test(key)?key:giftNames.get(key))||'');
    if(!plans.has(id))return;
    const eventId=detail.id??detail.message_id,eventKey=eventId==null?null:(scope==='dm'?'dm:':'gift:')+eventId;
    if(!preview&&eventKey){if(seen.has(eventKey))return;seen.set(eventKey,Date.now());while(seen.size>600)seen.delete(seen.keys().next().value);}
    const quantity=Math.max(1,Math.min(100000,Number(detail.quantity)||1));
    // Aggregate a burst of the same gift while retaining its full visible quantity.
    const same=queue.find(q=>!preview&&!q.preview&&q.gift_key===id&&q.scope===scope);
    if(same){same.quantity+=quantity;if(same.sender_id!==detail.sender_id)same.sender_nickname='Birden çok gönderici';if(same.recipient_id!==detail.recipient_id)same.recipient_nickname='Birden çok alıcı';}
    else{if(preview&&queue.some(q=>q.preview))queue=queue.filter(q=>!q.preview);queue.push({...detail,gift_key:id,quantity,scope,preview});}
    queue.sort((a,b)=>Number(b.preview)-Number(a.preview));
    if(preview&&active){if(!active.item.preview)queue.push(active.item);finish();return;}
    // Keep paid gifts across previews and visibility changes; room exit clears room scenes only.
    next();
  }
  global.addEventListener('erischat:event',e=>{const d=e.detail;if(d?.type==='dm_message'&&d.gift_key)enqueue(d,'dm')});
  global.addEventListener('erischat:room-gift',e=>enqueue(e.detail||{},'room'));
  global.addEventListener('erischat:dm-gift',e=>enqueue(e.detail||{},'dm'));
  global.addEventListener('erischat:room-closed',()=>clear('room'));
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden){queue=queue.filter(item=>!item.preview);if(active&&!active.item.preview)queue.unshift(active.item);finish();}else next();});
  Object.assign(api,{preview:gift=>{unlock();return enqueue(gift,'preview',true);},play:enqueue,clear,soundEnabled,load:catalog});
})(typeof window==='undefined'?globalThis:window);
