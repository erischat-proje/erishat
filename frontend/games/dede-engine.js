/* Dede mathematical reference for offline simulation. Live outcomes come from the server. */
(function(root){'use strict';
const KEYS=['blue','green','yellow','purple','red','cup','ring','hourglass','crown'];
const PAY=[[.25,.75,2],[.4,.9,4],[.5,1,5],[.8,1.5,8],[1,2,10],[1.5,2,12],[2,5,15],[3,10,25],[10,15,50]];
const DEFAULT={"version": "dede-v1", "weights": [17.015, 16, 15, 13, 11, 9, 7, 6, 6], "bonusWeights": [19, 17, 15, 13, 11, 9, 7, 5, 4], "orbRate": 0.01985, "anteOrbRate": 0.0209, "bonusOrbRate": 0.0665, "orbValues": [2, 3, 4, 5, 10, 15, 20, 25, 50, 100, 250, 500], "orbWeights": [5000, 2200, 1000, 500, 400, 120, 50, 25, 10, 5, 2, 1], "bonusTrigger": 0.002232142857142857, "retrigger": 0.01, "cap": 5000};
function weighted(rng,weights){const sum=weights.reduce((a,b)=>a+b,0);let p=rng()*sum;for(let i=0;i<weights.length;i++){p-=weights[i];if(p<0)return i;}return weights.length-1;}
function evaluate(board){const counts=Array(9).fill(0);for(const cell of board)if(cell.s<9)counts[cell.s]++;const wins=[];let amount=0;for(let s=0;s<9;s++)if(counts[s]>=8){const pay=PAY[s][counts[s]>=12?2:counts[s]>=10?1:0];amount+=Math.round(pay*100);wins.push({symbol:KEYS[s],count:counts[s],pay});}return {amount:amount/100,wins};}
function spin({rng=Math.random,config=DEFAULT,bonus=false,pool=0,ante=false,remainingCap=5000,trace=true,forcedScatters=null}={}){
 const rate=bonus?config.bonusOrbRate:ante?config.anteOrbRate:config.orbRate,weights=bonus?config.bonusWeights:config.weights;
 const fresh=()=>rng()<rate?{s:10,m:config.orbValues[weighted(rng,config.orbWeights)]}:{s:weighted(rng,weights)};
 let board=Array.from({length:30},fresh);let scatters;
 if(forcedScatters!==null)scatters=forcedScatters;
 else if(bonus)scatters=rng()<config.retrigger?3:weighted(rng,[55,35,10]);
 else scatters=rng()<config.bonusTrigger*(ante?2:1)?4+weighted(rng,[985,14,1]):weighted(rng,[55,35,10]);
 const positions=Array.from({length:30},(_,i)=>i);for(let i=0;i<scatters;i++){const j=i+Math.floor(rng()*(30-i));[positions[i],positions[j]]=[positions[j],positions[i]];board[positions[i]]={s:9};}
 let raw=0,steps=[],tumbles=0;let ev=evaluate(board);
 while(ev.amount>0){raw+=Math.round(ev.amount*100);const hit=new Set(ev.wins.map(w=>KEYS.indexOf(w.symbol)));const removed=[];for(let i=0;i<30;i++)if(hit.has(board[i].s))removed.push(i);
 if(trace)steps.push({board:board.map(c=>({...c})),wins:ev.wins,removed,win:ev.amount});
 const current=board.filter(c=>c.s===10).reduce((a,c)=>a+c.m,0);const scatter=!bonus&&scatters>=4?[3,5,100][Math.min(6,scatters)-4]:0;
 if(raw*Math.max(1,bonus?pool+current:current)+Math.round(scatter*100)>=remainingCap*100)break;
 // Symbols stay in their columns. Multipliers/scatters survive until this spin ends.
 let next=Array(30);for(let col=0;col<6;col++){const survivors=[];for(let row=0;row<5;row++){const cell=board[row*6+col];if(!hit.has(cell.s))survivors.push(cell);}const n=5-survivors.length;for(let row=0;row<5;row++)next[row*6+col]=row<n?fresh():survivors[row-n];}board=next;tumbles++;ev=evaluate(board);
 // An exceptional nonterminating RNG is rejected rather than silently paid differently.
 if(tumbles>1000)throw Error('Tumble safety limit');
 }
 const multipliers=board.filter(c=>c.s===10).map(c=>c.m),sum=multipliers.reduce((a,b)=>a+b,0);
 const newPool=bonus&&raw>0?pool+sum:pool;
 const applied=bonus?Math.max(1,newPool):Math.max(1,sum);
 const scatterPay=!bonus&&scatters>=4?[3,5,100][Math.min(6,scatters)-4]:0;
 const uncapped=raw*applied+Math.round(scatterPay*100),payout=Math.min(remainingCap*100,uncapped)/100;
 if(trace)steps.push({board:board.map(c=>({...c})),wins:[],removed:[],win:0});
 return {steps,payout,raw:raw/100,scatterPay,scatters,multipliers,applied,pool:newPool,bonusTriggered:!bonus&&scatters>=4,extraSpins:bonus&&scatters>=3?5:0,capped:uncapped>=remainingCap*100,tumbles};
}
function round({rng=Math.random,config=DEFAULT,ante=false,buy=false,trace=false}={}){let total=0,pool=0,left=buy?15:0,spins=[];
 if(!buy){const s=spin({rng,config,ante,trace});total=s.payout;spins.push(s);if(s.bonusTriggered&&!s.capped)left=15;}
 let bonusCount=0;while(left>0&&total<config.cap){left--;const s=spin({rng,config,bonus:true,pool,remainingCap:config.cap-total,trace});pool=s.pool;total+=s.payout;left+=s.extraSpins;bonusCount++;if(trace)spins.push(s);if(bonusCount>10000)throw Error('Bonus safety limit');}
 return {payout:total,bonusCount,pool,spins,capped:total>=config.cap,cost:buy?100:ante?1.25:1};}
function seeded(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const api={KEYS,PAY,DEFAULT,weighted,evaluate,spin,round,seeded};if(typeof module!=='undefined')module.exports=api;else root.DedeMath=api;
})(typeof window!=='undefined'?window:globalThis);
