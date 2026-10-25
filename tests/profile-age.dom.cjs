const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const dom=new JSDOM('<body></body>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;let age=26;const errors=[];w.toast=m=>errors.push(m);w.ErisPlatform={api:async path=>path==='/users/peer'?{id:'peer',nickname:'Kişi',age,public_id:'1234567890'}:[]};
w.eval(fs.readFileSync('frontend/user-profile-navigation.js','utf8'));
await w.openUserProfile('peer');assert.equal(w.document.querySelector('[data-profile-age]').textContent,'26 yaş');
age=null;await w.openUserProfile('peer');assert.equal(w.document.querySelector('[data-profile-age]').hidden,true);assert.equal(w.document.querySelector('[data-profile-age]').textContent,'');assert.equal(errors.length,0);
dom.window.close();console.log('PASS: public profile age, missing/hidden age and stale age replacement');})().catch(e=>{console.error(e);process.exit(1)});
