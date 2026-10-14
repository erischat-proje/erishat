(()=>{'use strict';
const games={aztek:'ErisGameAztek',ares:'ErisGameAres',dede:'ErisGameDede',seker:'ErisGameSeker',balikci:'ErisGameBalikci',prenses:'ErisGamePrenses',dogparty:'ErisGameDogParty',candy:'ErisGameCandy',kovboy:'ErisGameKovboy',firavun:'ErisGameFiravun',bastet:'ErisGameBastet',altin:'ErisGameAltin',kure:'ErisGameKure'};
// Route before both inline handlers and the legacy bubbling dispatcher.
document.addEventListener('click',event=>{
 const card=event.target.closest?.('.eg-launcher-card[data-game],#erisGamesModal .eg-keys button[data-game]');
 if(!card||!games[card.dataset.game])return;
 event.preventDefault();event.stopImmediatePropagation();
 const game=window[games[card.dataset.game]];
 if(typeof game?.open==='function')game.open();
 else{let notice=document.getElementById('custom-game-notice');if(!notice){notice=document.createElement('p');notice.id='custom-game-notice';notice.setAttribute('role','status');card.after(notice);}notice.textContent='Oyun yükleniyor. Lütfen tekrar dene.';}
},true);
})();
