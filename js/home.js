/* Compatibility entry point for the existing home module. */
(function () {
  var src = document.currentScript && document.currentScript.src;
  var base = src ? src.substring(0, src.lastIndexOf('/') + 1) : 'js/';
  document.write('<script src="' + base + '../home.js"><\\/script>');
})();