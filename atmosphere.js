/* ============================================================
   ATMOSPHERE.JS — builds each theme's signature "weather" layer.

   One fixed, inert container per page. The contents depend on the
   active theme, and are rebuilt when the theme changes (from the
   admin panel, another device over sync, or another tab), so every
   page in the site reacts to a theme switch.

   Cost control: every element animated here is transform/opacity
   only, which the compositor handles off the main thread. Particle
   counts stay in the tens and are capped on narrow screens. Under
   `perf-lite` the layer is skipped entirely — phones get their
   atmosphere from the static gradients instead.
   ============================================================ */
(function () {
  'use strict';

  if (window.AiaAtmosphere && window.AiaAtmosphere.__v === 1) return;

  /* `perf-lite` means a phone or weak device: the decoration is not worth
     the compositor time there. `perf-quiet` is a capable machine, which can
     afford the full effect. */
  function tooWeak() {
    var c = document.documentElement.classList;
    return c.contains('perf-lite');
  }
  function motionOff() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function tooNarrow() {
    /* matches the max-width: 860px rule that hides the animated layer */
    return window.innerWidth <= 860;
  }

  var host = null, current = '', timer = 0;

  function makeLayer() {
    host = document.createElement('div');
    host.className = 'atmo';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* Sparse particles read as atmosphere; dense ones read as noise and cost
     proportionally more compositing work. */
  function count(base) {
    var w = window.innerWidth;
    if (w < 900) return Math.round(base * 0.5);
    if (w < 1500) return base;
    return Math.round(base * 1.3);
  }

  var BUILDERS = {
    glass: function (frag) {
      frag.appendChild(el('div', 'atmo-band'));
      frag.appendChild(el('div', 'atmo-band b2'));
    },

    luxury: function (frag) {
      var n = count(22);
      for (var i = 0; i < n; i++) {
        var d = el('div', 'atmo-dust');
        d.style.left = rnd(0, 100) + '%';
        d.style.top = rnd(85, 105) + '%';
        d.style.animationDuration = rnd(9, 19).toFixed(1) + 's';
        d.style.animationDelay = '-' + rnd(0, 19).toFixed(1) + 's';
        frag.appendChild(d);
      }
    },

    simple: function (frag) {
      for (var i = 0; i < 3; i++) {
        var f = el('div', 'atmo-fold' + (i ? ' b2' : ''));
        f.style.left = rnd(6, 76) + '%';
        f.style.top = rnd(8, 70) + '%';
        f.style.animationDuration = rnd(38, 64).toFixed(0) + 's';
        f.style.animationDelay = '-' + rnd(0, 40).toFixed(0) + 's';
        frag.appendChild(f);
      }
    },

    midnight: function (frag) {
      var n = count(46);
      for (var i = 0; i < n; i++) {
        var s = el('div', 'atmo-star');
        s.style.left = rnd(0, 100) + '%';
        s.style.top = rnd(0, 100) + '%';
        var sc = rnd(0.6, 1.6);
        s.style.transform = 'scale(' + sc.toFixed(2) + ')';
        s.style.animationDuration = rnd(2.4, 6.5).toFixed(1) + 's';
        s.style.animationDelay = '-' + rnd(0, 6).toFixed(1) + 's';
        frag.appendChild(s);
      }
      frag.appendChild(el('div', 'atmo-shoot'));
    },

    neon: function (frag) {
      frag.appendChild(el('div', 'atmo-grid'));
      frag.appendChild(el('div', 'atmo-scan'));
    },

    sunset: function (frag) {
      var a = el('div', 'atmo-dune');
      var b = el('div', 'atmo-dune b2');
      a.style.animationDuration = '16s';
      b.style.animationDuration = '21s';
      frag.appendChild(a);
      frag.appendChild(b);
    },

    ocean: function (frag) {
      frag.appendChild(el('div', 'atmo-caustic'));
      var n = count(16);
      for (var i = 0; i < n; i++) {
        var u = el('div', 'atmo-bub');
        var sz = rnd(3, 8);
        u.style.width = sz.toFixed(1) + 'px';
        u.style.height = sz.toFixed(1) + 'px';
        u.style.left = rnd(0, 100) + '%';
        u.style.top = rnd(88, 106) + '%';
        u.style.animationDuration = rnd(10, 22).toFixed(1) + 's';
        u.style.animationDelay = '-' + rnd(0, 22).toFixed(1) + 's';
        frag.appendChild(u);
      }
    },

    royal: function (frag) {
      for (var i = 0; i < 3; i++) {
        var c = el('div', 'atmo-crest' + (i ? ' b2' : ''));
        c.style.left = rnd(2, 74) + '%';
        c.style.top = rnd(4, 66) + '%';
        c.style.animationDuration = rnd(52, 88).toFixed(0) + 's';
        c.style.animationDelay = '-' + rnd(0, 50).toFixed(0) + 's';
        frag.appendChild(c);
      }
    }
  };

  function el(tag, cls) {
    var e = document.createElement(tag);
    e.className = cls;
    return e;
  }

  function themeNow() {
    return document.documentElement.getAttribute('data-theme') || 'glass';
  }

  function render(theme) {
    if (!host) return;
    if (theme === current) return;
    current = theme;

    while (host.firstChild) host.removeChild(host.firstChild);

    /* The static per-theme graphics are pure CSS on `.atmo`, so the layer is
       always present. Only the animated children are skipped on a phone or
       weak device, where they are hidden by CSS as well. */
    if (tooWeak() || motionOff() || tooNarrow()) return;

    var build = BUILDERS[theme] || BUILDERS.glass;
    var frag = document.createDocumentFragment();
    build(frag);
    host.appendChild(frag);
  }

  function boot() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', boot); return; }
    makeLayer();

    /* data-theme is set by the inline head script and by setTheme(); watch
       the attribute so admin changes, sync updates and other tabs all
       rebuild the weather on this page. */
    try {
      new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(themeNow()); }, 60);
      }).observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-theme']
      });
    } catch (e) {}

    var reflow = function () {
      clearTimeout(timer);
      timer = setTimeout(function () { current = ''; render(themeNow()); }, 250);
    };
    window.addEventListener('resize', reflow, { passive: true });
    window.addEventListener('orientationchange', reflow, { passive: true });

    render(themeNow());
  }

  window.AiaAtmosphere = {
    __v: 1,
    refresh: function () { current = ''; render(themeNow()); },
    theme: themeNow
  };

  boot();
})();