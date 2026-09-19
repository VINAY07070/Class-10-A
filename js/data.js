/* DataStore loader plus temporary same-browser synchronisation.
   This is not server sync: BroadcastChannel/storage only sync tabs and windows
   using the same origin/browser. */
(function () {
  var current = document.currentScript && document.currentScript.src;
  var base = current ? current.substring(0, current.lastIndexOf('/') + 1) : 'js/';
  document.write('<script src="' + base + '../data.js"><\\/script>');
})();

(function () {
  'use strict';
  if (window.DataSync) return;

  var channel = null;
  var applying = false;
  var prefix = 'aia_';
  var listeners = [];

  function notify(key, value) {
    listeners.slice().forEach(function (listener) {
      try { listener(key, value); } catch (e) {}
    });
  }

  function apply(key, value) {
    if (!key || key.indexOf(prefix) !== 0 || applying) return;
    applying = true;
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
    applying = false;
    notify(key, value);
  }

  try {
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('aia-class-10a-sync');
      channel.onmessage = function (event) {
        var data = event.data || {};
        apply(data.key, data.value);
      };
    }
  } catch (e) {}

  window.addEventListener('storage', function (event) {
    if (event.key) notify(event.key, event.newValue);
  });

  // Broadcast writes made by the existing localStorage-backed DataStore.
  try {
    var originalSet = Storage.prototype.setItem;
    var originalRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      originalSet.call(this, key, value);
      if (!applying && channel && key.indexOf(prefix) === 0) {
        try { channel.postMessage({ key: key, value: String(value) }); } catch (e) {}
      }
    };
    Storage.prototype.removeItem = function (key) {
      originalRemove.call(this, key);
      if (!applying && channel && key.indexOf(prefix) === 0) {
        try { channel.postMessage({ key: key, value: null }); } catch (e) {}
      }
    };
  } catch (e) {}

  window.DataSync = {
    available: function () { return !!channel; },
    onChange: function (listener) {
      if (typeof listener === 'function') listeners.push(listener);
      return function () {
        listeners = listeners.filter(function (item) { return item !== listener; });
      };
    },
    exportData: function () {
      var output = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(prefix) === 0) output[key] = localStorage.getItem(key);
      }
      return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: output }, null, 2);
    },
    importData: function (json) {
      var packet = typeof json === 'string' ? JSON.parse(json) : json;
      var data = packet && packet.data ? packet.data : packet;
      if (!data || typeof data !== 'object') throw new Error('Invalid sync data');
      Object.keys(data).forEach(function (key) {
        if (key.indexOf(prefix) === 0) localStorage.setItem(key, data[key]);
      });
      return true;
    },
    close: function () { if (channel) channel.close(); }
  };
})();