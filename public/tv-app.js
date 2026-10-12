/* Rescue: stale classic /tv SW caches load this file. Nuke SW and reload React TV. */
(function () {
  "use strict";
  function go() {
    var q = location.search && location.search.indexOf("n=") >= 0
      ? location.search
      : "?n=" + Date.now();
    location.replace("/tv" + q);
  }
  function clearCaches() {
    if (!window.caches || !caches.keys) return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          return caches.delete(k);
        })
      );
    });
  }
  if (!("serviceWorker" in navigator)) {
    go();
    return;
  }
  navigator.serviceWorker
    .getRegistrations()
    .then(function (regs) {
      return Promise.all(
        regs.map(function (r) {
          return r.unregister();
        })
      );
    })
    .then(clearCaches)
    .then(go)
    .catch(go);
})();
