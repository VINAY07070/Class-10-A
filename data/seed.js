/* Compatibility entry point for the seed data. */
(function () {
  var src = document.currentScript && document.currentScript.src;
  var base = src ? src.substring(0, src.lastIndexOf('/') + 1) : 'data/';
  document.write('<script src="' + base + '../seed.js"><\\/script>');
})();