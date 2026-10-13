(function(root){'use strict';
const bands=Object.freeze([[1,200,50],[200,1000,100],[1000,5000,200],[5000,10000,250]].map(Object.freeze));
function next(value,direction){value=Math.min(10000,Math.max(1,Math.trunc(Number(value)||50)));const up=direction>0,band=bands.find(([lo,hi])=>up?value>=lo&&value<hi:value>lo&&value<=hi);if(!band)return value;const [lo,hi,step]=band;return Math.min(hi,Math.max(lo,value+(up?step:-step)));}
const api=Object.freeze({next,bands,min:1,max:10000,initial:50,bonusBuy:true});
if(typeof module!=='undefined')module.exports=api;else{root.SlotStakes=api;for(const key of ['Dede','Seker','Balikci','Prenses','DogParty','Candy','Kovboy'])root[key+'Stakes']=api;}
})(typeof window!=='undefined'?window:globalThis);
