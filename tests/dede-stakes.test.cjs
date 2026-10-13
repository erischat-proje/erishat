const assert=require('assert'),S=require('../frontend/games/dede-stakes.js');
for(const [v,d,n] of [[1,1,51],[1,-1,1],[50,1,100],[200,1,300],[200,-1,150],[1000,1,1200],[1000,-1,900],[5000,1,5250],[5000,-1,4800],[10000,-1,9750],[10000,1,10000],[175,1,200],[250,-1,200],[950,1,1000],[1100,-1,1000],[4900,1,5000],[5100,-1,5000]])assert.equal(S.next(v,d),n);
for(let v=1;v<=10000;v++){assert(S.next(v,1)>=v&&S.next(v,1)<=10000);assert(S.next(v,-1)<=v&&S.next(v,-1)>=1);}
console.log('PASS: boundaries, directional step bands, all integer values');
