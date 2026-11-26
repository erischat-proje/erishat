(()=>{
'use strict';

const ranks=[
 {id:1,name:'Şövalye',key:'knight',color:'#c99c6b'},
 {id:2,name:'Kont',key:'count',color:'#c66b68'},
 {id:3,name:'Dük',key:'duke',color:'#739edb'},
 {id:4,name:'Kral',key:'king',color:'#e8bd55'}
];

const privileges=[
 ['badge','Asalet Rozeti',1,'appearance'],
 ['frame','Profil Çerçevesi',1,'appearance'],
 ['entrance','Giriş Efekti',1,'appearance'],
 ['region_background','Bölge Arka Planı',3,'appearance'],
 ['room_frame','Oda Kartı Çerçevesi',4,'appearance'],
 ['super_avatar','Süper Avatar',4,'appearance'],
 ['online_priority','Çevrimiçi Öncelik',1,'privilege'],
 ['gift_banner','Özel Hediye Afişi',1,'privilege'],
 ['activation_banner','Asalet Açılış Afişi',1,'privilege'],
 ['kick_protection','Atılmaya Karşı Koruma',2,'privilege'],
 ['gift_bonus','Hediye İade Bonusu',2,'privilege'],
 ['daily_banner','Günlük Giriş Afişi',3,'privilege'],
 ['room_welcome','Odaya Giriş Karşılama',3,'privilege'],
 ['animated_avatar','Özel Animasyonlu Avatar',4,'privilege'],
 ['couple_repair','Çift Günü Onarımı',4,'privilege'],
 ['super_kick','Süper Atma',4,'privilege']
].map(([id,title,minRank,category])=>
 Object.freeze({id,title,minRank,category})
);

window.LidyaNobilityCatalog=Object.freeze({
 ranks:Object.freeze(ranks.map(Object.freeze)),
 privileges:Object.freeze(privileges),
 forRank(rank){
  return privileges.filter(p=>p.minRank<=rank);
 }
});
})();
