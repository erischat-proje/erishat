(() => {
  'use strict';
  // Room lists are mounted only inside their menu; navigating to Profile no longer inserts a second list.
  window.ErisProfileRooms={load:()=>window.ErisProfileHub?.show?.('rooms')};
})();
