/* Uses the existing preview and paid-event stage; no second event listener. */
(function(g){'use strict';
const modes=['chariot','ship','building','garden','throne','water','column','statue','mosaic','gate','stable','tower','arch','water','cloth','ship','column','arch','hall','farm','amphi','stairs','library','feast','statue','lightning','wing','cloth','lyre','shield','trident','sword','sandals','helmet','mirror','staff','arrow','wheat','hourglass','fire','eye','tooth','horn','wing','hammer','gold','seal','throne','coin','crown','treasure','fire','statue','armor','cup','crown','staff','sun','bowl','key','eagle','emblem','shield','ring','citadel','pearl','sword','throne','wheat','heart'];
function motion(id,t,s){const n=id-131,mode=modes[n],a=t*(1.4+n%7*.11)+n*.13,entry=Math.min(1,t/.9);let x=0,y=(1-entry)*s*.1,r=0,k=.9+.1*entry;
if(['ship','chariot','sandals'].includes(mode)){x=Math.sin(a)*s*.05;y+=Math.sin(a*1.7)*s*.015;r=Math.sin(a)*.045}
else if(['wing','eagle'].includes(mode)){r=Math.sin(a*1.8)*.13;k*=1+.035*Math.sin(a*2);y-=Math.sin(a)*s*.025}
else if(['sword','trident','staff','arrow','key','hammer'].includes(mode)){r=Math.sin(a)*.16;x=Math.sin(a)*s*.02}
else if(['coin','ring','pearl','heart','eye','sun','emblem','mirror'].includes(mode)){r=Math.sin(a)*.12;k*=.96+.04*Math.sin(a*1.4)}
else if(['cloth','wheat'].includes(mode)){r=Math.sin(a)*.05;x=Math.sin(a)*s*.015}
else if(['seal','armor','shield','helmet','tooth','horn'].includes(mode)){y-=Math.abs(Math.sin(t*2.7))*s*.025*Math.exp(-t*.4);r=Math.sin(a)*.045}
else if(mode==='crown'){y-=(1-entry)*s*.12;r=Math.sin(a)*.045}
else if(mode==='lyre'){r=Math.sin(a*2)*.04}
else if(mode==='hourglass'){r=Math.sin(a*.7)*.24}
else {y+=Math.sin(a)*s*.009;r=Math.sin(a)*.018}
return {x,y,r,k,mode}}
function render(c,p,asset,t,w,h,quality,destination,H){c.clearRect(0,0,w,h);const s=Math.min(w*.72,h*.43),x=w*.5,y=h*.46,m=motion(p.id,t,s),fade=Math.max(0,Math.min(1,t/.5,(p.duration-t)/.7));if(!fade)return;c.save();c.globalAlpha=fade;H.glow(c,x,y,s*.72,p.colors[0],.34);const n=Math.round(24*quality);for(let i=0;i<n;i++){const u=(t*.22+i/n)%1,a=i*2.399+p.id*.17,rad=s*(.35+u*.42);c.globalAlpha=fade*(1-u)*.65;
if(['water','ship'].includes(m.mode)){c.strokeStyle=p.colors[1];c.lineWidth=1.2;c.beginPath();c.ellipse(x,y+s*.23,rad,rad*.19,0,a,a+.35);c.stroke()}
else if(['fire','treasure','gold'].includes(m.mode)){c.fillStyle=p.colors[i%3];c.beginPath();c.ellipse(x+Math.sin(a)*s*.28,y+s*.15-u*s*.72,2,3,0,0,7);c.fill()}
else H.spark(c,x+Math.cos(a)*rad,y+Math.sin(a)*rad,2+2*(1-u),p.colors[i%3])}
c.globalAlpha=fade;H.sprite(c,asset,{...p,rig:['cloth','wheat','wing','eagle'].includes(m.mode)?'cloth':'solid',reveal:['mosaic','gate','stairs','library'].includes(m.mode)?'wipe':'bloom'},x+m.x,y+m.y,s,m.r,m.k,1,Math.min(1,t/.9),t);
if(m.mode==='lightning'){c.save();c.globalAlpha=fade*Math.max(0,Math.sin(t*9))*.6;c.strokeStyle='#c8eaff';c.lineWidth=2;c.beginPath();c.moveTo(x-s*.38,y-s*.26);c.lineTo(x-s*.13,y-s*.09);c.lineTo(x-s*.2,y+s*.04);c.lineTo(x+s*.28,y+s*.22);c.stroke();c.restore()}
if(['sun','shield','emblem','crown'].includes(m.mode))H.ring(c,x,y,s*(.32+(t%1)*.18),p.colors[1],.3*(1-t%1));
if(['pearl','heart','mirror','eye','ring'].includes(m.mode))H.spark(c,x+s*.12,y-s*.11,7*Math.max(0,Math.sin(t*4)),p.colors[1]);
if(m.mode==='lyre'){c.save();c.strokeStyle=p.colors[1];c.globalAlpha=fade*.35;for(let i=0;i<5;i++){c.beginPath();c.moveTo(x+(i-2)*s*.025,y-s*.14);c.quadraticCurveTo(x+(i-2)*s*.025+Math.sin(t*18+i)*4,y,x+(i-2)*s*.025,y+s*.1);c.stroke()}c.restore()}
c.restore()}
g.ErisFinaleGifts={render,motion,modes};})(typeof window==='undefined'?globalThis:window);
