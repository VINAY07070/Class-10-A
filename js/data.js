/* Compatibility entry point: the source data layer remains at the repository root. */
(function () {
  var src = document.currentScript && document.currentScript.src;
  var base = src ? src.substring(0, src.lastIndexOf('/') + 1) : 'js/';
  document.write('<script src="' + base + '../data.js"><\\/script>');
})();