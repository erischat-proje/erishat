/* Original artwork and motion direction for all twelve VIP levels. */
(() => {
  'use strict';
  const names=['Buz Gümüş','Aytaşı','Zümrüt','Kehribar','Gül Kuvars','Ametist','Safir','Yakut','Güneş Altını','Elmas','Gece İmparatoru','Lidya İmparatorluğu'];
  const colors=['#8edbff','#9ae5df','#77df9a','#efb965','#ffb4cd','#c89bff','#7ba7ff','#ff7a91','#ffd77a','#a6efff','#69e4cf','#d59aff'];
  const metals=['#daeaff','#e0fff6','#efdcb0','#f4ce90','#ffddcc','#ece0ff','#dce7ff','#f5c5aa','#ffe7a1','#efffff','#b5dcd8','#ffdc8a'];
  const motions=['crystal','moon','laurel','phoenix','rose','iris','comet','flame','sun','prism','eclipse','imperial'];
  const themes=names.map((name,i)=>Object.freeze({level:i+1,name,color:colors[i],metal:metals[i],motion:motions[i],frame:'./vip-designs/profile-'+(i+1)+'.png',entryFrame:'./vip-designs/entry-'+(i+1)+'.png',duration:3200+i*80}));
  const normal=Object.freeze({level:0,name:'Normal oda girişi',color:'#cbd5e1',metal:'#e2e8f0',motion:'normal',entryFrame:'./vip-designs/entry-normal.svg',duration:2600});
  function get(level,style='female'){const t=themes[Number(level)-1];return t?(style==='male'?{...t,entryFrame:'./vip-designs/entry-male-'+t.level+'.png'}:t):null}
  window.ErisVIPDesigns=Object.freeze({themes:Object.freeze(themes),get,normal});
})();
