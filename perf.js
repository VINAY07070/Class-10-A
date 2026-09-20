/* ============================================================
   PERF.JS — decides what "smooth" means for this device and
   keeps the expensive decorative layers off the critical path.

   Runs before first paint of the decorative layers, so the page
   never flashes the heavy version and then downgrades.
   ============================================================ */
(function () {
  'use strict';
  var doc = document.documentElement;

  /* ---------- 1. classify the device ---------- */
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var coarse = false, reduced = false, saveData = false, cores = 4, mem = 8;
  try { coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches; } catch (e) {}
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  try { saveData = !!(navigator.connection && navigator.connection.saveData); } catch (e) {}
  try { if (navigator.hardwareConcurrency) cores = navigator.hardwareConcurrency; } catch (e) {}
  try { if (navigator.deviceMemory) mem = navigator.deviceMemory; } catch (e) {}

  var lowPower = coarse || reduced || saveData || cores <= 4 || mem <= 4;
  var smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;

  /* ---------- 2. apply the style class as early as possible ---------- */
  var lite = lowPower || smallScreen;
  try { if (lite) doc.classList.add('perf-lite'); } catch (e) {}

  /* expose so main.js / stickmen.js can pick cheap paths */
  window.AiaPerf = {
    lite: lite,
    lowPower: lowPower,
    reduced: reduced,
    smallScreen: smallScreen,
    saveData: saveData,
    cores: cores,
    memory: mem,
    isIOS: isIOS,
    /* count of live rAF loops, for debugging on a real phone */
    loops: 0
  };

  /* ---------- 3. pause animations that scroll out of view ---------- */
  function initVisibilityPause() {
    if (!('IntersectionObserver' in window)) return;
    var staged = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        /* Only toggle things that actually animate continuously. */
        en.target.style.animationPlayState = en.isIntersecting ? '' : 'paused';
      });
    }, { rootMargin: '120px 0px' });

    function watch(scope) {
      var sel = '.hero-aurora .blob, .login-gate .gate-orb, .bg-blob, ' +
                '.hero-orb, .aurora-blob, .particle-blob';
      (scope || document).querySelectorAll(sel).forEach(function (el) {
        if (el.__perfWatched) return;
        el.__perfWatched = 1;
        io.observe(el);
      });
    }
    watch();
    setTimeout(function () { watch(); }, 1200);

    /* re-check when the page grows (dynamic content) */
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function () { watch(); });
      mo.observe(document.body || doc, { childList: true, subtree: true });
      staged.push(mo);
    }
    window.__perfStopVis = function () {
      io.disconnect();
      staged.forEach(function (m) { try { m.disconnect(); } catch (e) {} });
    };
  }

  /* ---------- 4. drop to lite if we actually notice jank ---------- */
  function initAdaptiveDowngrade() {
    /* Chromium exposes real measured long tasks; if the device is
       struggling right after load, quietly switch to flat panels. */
    if (lite || !('PerformanceObserver' in window)) return;
    var heavy = 0;
    try {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          if (e.duration > 120) heavy++;
        });
        if (heavy >= 3 && !doc.classList.contains('perf-lite')) {
          doc.classList.add('perf-lite');
          window.AiaPerf.lite = true;
          try { po.disconnect(); } catch (err) {}
        }
      });
      po.observe({ entryTypes: ['longtask'] });
      setTimeout(function () { try { po.disconnect(); } catch (e) {} }, 12000);
    } catch (e) {}
  }

  /* ---------- 5. keep one rAF cadence for the whole page ---------- */
  window.AiaTicker = (function () {
    var subs = [], running = false, last = 0;
    function frame(t) {
      var dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016;
      last = t;
      for (var i = 0; i < subs.length; i++) {
        try { subs[i](dt, t); } catch (e) {}
      }
      running = subs.length > 0;
      if (running) requestAnimationFrame(frame); else last = 0;
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; }
      else if (subs.length && !running) { running = true; last = 0; requestAnimationFrame(frame); }
    });
    return {
      add: function (fn) {
        subs.push(fn);
        window.AiaPerf.loops = subs.length;
        if (!running && !document.hidden) { running = true; last = 0; requestAnimationFrame(frame); }
        return fn;
      },
      remove: function (fn) {
        var i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
        window.AiaPerf.loops = subs.length;
      }
    };
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initVisibilityPause();
      initAdaptiveDowngrade();
    }, { once: true });
  } else {
    initVisibilityPause();
    initAdaptiveDowngrade();
  }
})();