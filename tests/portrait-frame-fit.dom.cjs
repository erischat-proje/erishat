const {JSDOM}=require('jsdom');const fs=require('fs');const assert=require('assert');
(async()=>{
const dom=new JSDOM('<body></body>',{url:'https://example.test/',runScripts:'outside-only'});const w=dom.window;
w.fetch=async()=>({ok:true,json:async()=>({})});w.ErisLidyaPremium={describe:()=>({width:100,height:100,aperture:{x:.5,y:.48,diameter:.64}})};
w.eval(fs.readFileSync(require('path').join(__dirname,'../frontend/visual-layout.js'),'utf8'));
const tick=()=>new Promise(r=>setTimeout(r,20));
for(const cls of ['dm-avatar-frame','dm-message-frame','eris-chat-frame','eris-mini-frame','eris-profile-frame','frameImg','eris-follow-frame','eris-vip-entry-avatar-frame','rel-entrance-frame','lgr-frame','personal-fan-frame']){
const host=w.document.createElement('div');host.innerHTML=`<img src="avatar.png"><img class="${cls}" src="frame.png">`;w.document.body.append(host);await tick();assert(host.classList.contains('visual-portrait'),cls);assert.equal(host.style.getPropertyValue('--art-avatar-size'),'64%');assert(host.firstChild.classList.contains('visual-art-avatar'));host.lastChild.remove();await tick();assert(!host.classList.contains('visual-portrait'),cls+' removal');host.remove();}
const seat=w.document.createElement('div');seat.innerHTML='<div class="seat-ava">A</div><div class="seat-frame"></div>';w.document.body.append(seat);await tick();const frame=seat.lastChild;frame.style.backgroundImage='url(frame.png)';frame.classList.add('has-frame');await tick();assert(seat.classList.contains('visual-portrait'));frame.hidden=true;await tick();assert(!seat.classList.contains('visual-portrait'));frame.hidden=false;await tick();assert(seat.classList.contains('visual-portrait'));frame.style.backgroundImage='';frame.classList.remove('has-frame');await tick();assert(!seat.classList.contains('visual-portrait'));
dom.window.close();console.log('PASS: 11 portrait surfaces, removal, seat class/background change, hide/show');
})().catch(e=>{console.error(e);process.exit(1)});
