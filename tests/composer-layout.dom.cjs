const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'../frontend/messages-polish.css'),'utf8');
for(const theme of ['light','dark'])for(const kind of ['dm','group','family']){
const d=new JSDOM(`<html data-eris-theme="${theme}"><head><style>${css}</style></head><body><div id="chat" class="${kind==='dm'?'eris-floating-dm':''}" data-conversation-type="${kind}"><div class="compose"><div class="dm-compose-field"><textarea></textarea></div><button class="close">Ek</button><button class="close" hidden>Hediye</button><button class="primary">Gönder</button></div></div></body></html>`);
const w=d.window,q=s=>w.document.querySelector(s),c=e=>w.getComputedStyle(e);
assert.equal(c(q('.compose')).display,'flex');assert.equal(c(q('.compose')).flexWrap,'wrap');assert.equal(c(q('.dm-compose-field')).flexBasis,'100%');assert.equal(c(q('.primary')).height,'44px');assert.equal(c(q('.close')).width,'44px');assert.equal(c(q('[hidden]')).display,'none');q('.compose').hidden=true;assert.equal(c(q('.compose')).display,'none');w.close();}
console.log('PASS: DM/group/family, both themes, full-width field, controls and hidden permissions');
