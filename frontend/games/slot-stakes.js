(function(root){'use strict';
const presets=Object.freeze([10,100,1000,10000,100000]);let selected=100;
function selectStep(value){if(presets.includes(Number(value)))selected=Number(value);return selected;}
function next(value,direction,step=selected){value=Math.min(1000000000,Math.max(1,Math.trunc(Number(value)||50)));return Math.min(1000000000,Math.max(1,value+(direction>0?1:-1)*step));}
const api=Object.freeze({next,selectStep,presets,min:1,max:1000000000,initial:50,bonusBuy:true});
if(typeof module!=='undefined')module.exports=api;else{root.SlotStakes=api;for(const key of ['Dede','Seker','Balikci','Prenses','DogParty','Candy','Kovboy'])root[key+'Stakes']=api;}
})(typeof window!=='undefined'?window:globalThis);
