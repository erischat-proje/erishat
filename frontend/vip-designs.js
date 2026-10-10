/* Original artwork and motion direction for all twelve VIP levels. */
(() => {
  'use strict';
  const names=["Sardis Kıvılcımı", "Paktolos Gümüşü", "Asma Bahçesi", "Kehribar Yolu", "Palmet Sarayı", "Ametist Mührü", "Safir Muhafız", "Yakut Hanedanı", "Altın Aslan", "Elektron Hazinesi", "Krezus Sarayı", "Lidya İmparatorluğu"];
  const colors=['#d79660','#91d3d1','#8fc984','#edbc68','#e7aeac','#c1a0eb','#88a9ed','#ec8492','#efd27c','#b7e4df','#8bd0b4','#dbadf0'];
  const metals=['#daeaff','#e0fff6','#efdcb0','#f4ce90','#ffddcc','#ece0ff','#dce7ff','#f5c5aa','#ffe7a1','#efffff','#b5dcd8','#ffdc8a'];
  const motions=['crystal','moon','laurel','phoenix','rose','iris','comet','flame','sun','prism','eclipse','imperial'];
  const themes=names.map((name,i)=>Object.freeze({level:i+1,name,color:colors[i],metal:metals[i],motion:motions[i],frame:'./vip-designs/lydia/profile-female-'+(i+1)+'.webp',entryFrame:'./vip-designs/lydia/entry-female-'+(i+1)+'.webp',duration:3200+i*80}));
  const normal=Object.freeze({level:0,name:'Normal oda girişi',color:'#cbd5e1',metal:'#e2e8f0',motion:'normal',entryFrame:'./vip-designs/entry-normal.svg',duration:2600});
  function get(level,style=window.ErisAuth?.user?.gender||'female'){const t=themes[Number(level)-1],sex=style==='male'?'male':'female';return t?{...t,frame:'./vip-designs/lydia/profile-'+sex+'-'+t.level+'.webp',entryFrame:'./vip-designs/lydia/entry-'+sex+'-'+t.level+'.webp',avatar:'./vip-designs/lydia/avatar-'+sex+'-'+t.level+'.webp',avatarFrame:'./vip-designs/lydia/frame-'+sex+'-'+t.level+'.webp',wallpaper:'./vip-designs/lydia/wallpaper-'+sex+'-'+t.level+'.webp'}:null}
  window.ErisVIPDesigns=Object.freeze({themes:Object.freeze(themes),get,normal});
})();
