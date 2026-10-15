const assert=require('assert'),S=require('../frontend/games/dede-stakes.js');
S.selectStep(100);
for(const value of [1,50,10000,100000,1000000000,2000000000,1000000000000]){assert.equal(S.next(value,1),value+100);assert.equal(S.next(value,-1),Math.max(1,value-100));}
for(const step of S.presets){S.selectStep(step);assert.equal(S.next(2000000000,1),2000000000+step);}
assert.equal(S.max,null);assert(Number.isSafeInteger(S.next(Number.MAX_SAFE_INTEGER,1)));
console.log('PASS: shared presets, large stakes beyond old caps, exact integers');
