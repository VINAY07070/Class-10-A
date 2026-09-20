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

  /* A device counts as "mobile" when it is touch-first. That is the case the
     lag reports come from, and it is a far more reliable signal than core
     count: many desktops report as few as 4 cores, and treating those as
     low-power would needlessly strip the glass look from a fast PC. */
  var mobile = coarse || isIOS;
  var lowPower = reduced || saveData || cores <= 2 || mem <= 2;
  var smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;

  /* ---------- 2. apply the style class as early as possible ---------- */
  /* perf-lite removes backdrop blurs, decorative orbs, the particle canvas
     and continuous animations. Run on every touch device plus genuinely
     weak hardware. */
  var lite = mobile || lowPower || smallScreen;
  /* A capable device still benefits from fewer blurred surfaces, but it
     should keep the glass look. Only non-lite devices that are not
     obviously weak get the middle tier. */
  var quiet = !lite && !reduced && cores >= 4 && mem >= 4;
  try {
    if (lite) doc.classList.add('perf-lite');
    else if (quiet) doc.classList.add('perf-quiet');
  } catch (e) {}

  /* expose so main.js / stickmen.js can pick cheap paths */
  window.AiaPerf = {
    lite: lite,
    quiet: quiet,
    lowPower: lowPower,
    mobile: mobile,
    reduced: reduced,
    smallScreen: smallScreen,
    saveData: saveData,
    cores: cores,
    memory: mem,
    isIOS: isIOS,
    /* count of live rAF loops, for debugging on a real phone */
    loops: 0,
    /* set by the adaptive governor; main.js can read it to trim particle
       counts without having to know how the measurement works */
    tier: lite ? 'lite' : (quiet ? 'quiet' : 'full')
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

  /* ---------- 4. adaptive quality governor ----------
     Decide from actually measured frame times, not from a user-agent guess.
     Sampling a real rAF loop for a few seconds catches the devices that
     slip through the initial classification (a low-end laptop, a tablet in
     desktop mode, a phone reporting 8 cores). The ladder only ever steps
     down, and only while the page is visible, so a slow first paint or a
     background tab can never trigger a false downgrade.
     Long tasks are used as a secondary signal when a slow frame already
     hinted at trouble. */
  function degrade(reason) {
    if (doc.classList.contains('perf-lite')) return false;
    if (!doc.classList.contains('perf-quiet')) {
      doc.classList.add('perf-quiet');
      window.AiaPerf.quiet = true;
      window.AiaPerf.tier = 'quiet';
      if (window.AiaPerf.onTierChange) { try { window.AiaPerf.onTierChange('quiet', reason); } catch (e) {} }
      return true;
    }
    return false;
  }
  function flattenToLite(reason) {
    if (doc.classList.contains('perf-lite')) return;
    doc.classList.remove('perf-quiet');
    doc.classList.add('perf-lite');
    window.AiaPerf.lite = true;
    window.AiaPerf.quiet = false;
    window.AiaPerf.tier = 'lite';
    if (window.AiaPerf.onTierChange) { try { window.AiaPerf.onTierChange('lite', reason); } catch (e) {} }
  }

  function initAdaptiveDowngrade() {
    if (lite || reduced || !window.requestAnimationFrame) return;
    var bad = 0, samples = 0, stopped = false;
    var start = 0, last = 0;
    function stop() { stopped = true; }
    function frame(t) {
      if (stopped) return;
      if (document.hidden) { last = 0; requestAnimationFrame(frame); return; }
      if (!last) { last = t; requestAnimationFrame(frame); return; }
      var dt = t - last;
      last = t;
      if (t - start > 8000) { stop(); return; }
      samples++;
      /* Ignore the first ~1s: fonts, images and layout are still settling
         and would otherwise be counted as jank. */
      if (t - start < 1000) { requestAnimationFrame(frame); return; }
      if (dt > 34) bad++;
      /* A sustained run of slow frames, not one hiccup, is what we act on. */
      if (samples > 30 && bad / samples > 0.30) {
        var stepped = degrade('slow-frames');
        if (stepped && window.AiaPerf.lite) { stop(); return; }
        /* Reset the window for a fresh verdict after the first step. */
        bad = 0; samples = 0; start = t;
      }
      if (samples > 30 && bad / samples > 0.5 && window.AiaPerf.quiet) {
        flattenToLite('severe-frames');
        stop(); return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(function (t) {
      start = t; last = 0;
      requestAnimationFrame(frame);
    });

    /* secondary signal: several long tasks early in the session */
    if ('PerformanceObserver' in window) {
      var heavy = 0;
      try {
        var po = new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (e) { if (e.duration > 140) heavy++; });
          if (heavy >= 4) { degrade('long-tasks'); try { po.disconnect(); } catch (err) {} }
        });
        po.observe({ entryTypes: ['longtask'] });
        setTimeout(function () { try { po.disconnect(); } catch (e) {} }, 12000);
      } catch (e) {}
    }
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