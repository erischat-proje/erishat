(() => {
  'use strict';
  // Discovery controls are scoped to the People tab by discovery-live.js.
  window.ErisChatPeople={load:()=>window.ErisDiscovery?.load?.()};
  document.getElementById('erisDiscoverySettings')?.remove();
})();
