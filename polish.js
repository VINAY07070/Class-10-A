/* ============================================================
   POLISH.JS — cursor follower, angular dividers, scroll hue.

   Desktop-only extras from the layout brief. Each one short-circuits on
   touch devices, the "lite" performance tier, and reduced-motion, so a
   phone never pays for them.
   ============================================================ */
(function () {
  'use strict';
  if (window.__PolishLoaded) return;
  window.__PolishLoaded = true;

  var P = window.AiaPerf || {};
  var REDUCED = !!P.reduced;
  var TOUCH = false;
  try { TOUCH = window.matchMedia('(hover: none), (pointer: coarse)').matches; } catch (e) {}
  var LITE = !!P.lite;

  function el(tag, cls) { var d = document.createElement(tag); if (cls) d.className = cls; return d; }

  /* ---- desktop cursor follower ------------------------------------ */
  function cursor() {
    if (TOUCH || LITE || REDUCED) return;
    var dot = el('div', 'cursor-dot');
    var ring = el('div', 'cursor-ring');
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;
    var seen = false;

    window.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; rx = mx; ry = my; document.body.classList.add('cursor-on'); }
    }, { passive: true });
    document.addEventListener('mouseleave', function () { document.body.classList.remove('cursor-on'); });

    /* ring reacts to interactive elements */
    document.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('a, button, .glass-card, .feature-card, input, .quick-link, .stickman, .pig-parameshwar')) {
        ring.classList.add('hot');
      } else {
        ring.classList.remove('hot');
      }
    }, { passive: true });

    /* Follow on the shared ticker rather than another rAF loop, and use
       translate3d so this never triggers layout. */
    function tick() {
      if (!seen) return;
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
    }
    if (window.AiaTicker) window.AiaTicker.add(tick);
    else (function loop() { tick(); requestAnimationFrame(loop); })();
  }

  /* ---- angular section dividers ----------------------------------- */
  function dividers() {
    if (LITE) return;
    /* Only on pages that actually stack several sections. */
    var sections = document.querySelectorAll('section.section');
    if (sections.length < 2) return;
    var made = 0;
    for (var i = 0; i < sections.length - 1 && i < 5; i++) {
      var s = sections[i];
      if (s.nextElementSibling && s.nextElementSibling.classList.contains('section-divider')) continue;
      var d = el('div', 'section-divider');
      /* A shallow asymmetric wedge; the skew flips per section so the
         page reads as faceted rather than repeating one shape. */
      var up = i % 2 === 0;
      d.innerHTML = '<svg viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="M0,' + (up ? 60 : 0) + ' L1440,' + (up ? 0 : 60) + ' L1440,' +
        (up ? 60 : 60) + ' L0,' + (up ? 60 : 60) + ' Z"/></svg>';
      s.parentNode.insertBefore(d, s.nextSibling);
      made++;
    }
  }

  /* ---- scroll-driven background hue ------------------------------- */
  function scrollHue() {
    if (LITE) return;
    var root = document.documentElement;
    var last = -1, ticking = false;
    function apply() {
      ticking = false;
      var max = document.body.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      /* quantise to 1% steps; writing a custom property every scroll frame
         would thrash style recalculation */
      var q = Math.round(p * 100);
      if (q === last) return;
      last = q;
      root.style.setProperty('--scroll-p', (q / 100).toFixed(2));
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
    apply();
  }

  /* ---- accent tagging -------------------------------------------- */
  function accents() {
    var page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    var h = document.querySelector('.page-header');
    if (h) h.setAttribute('data-accent', page);
  }

  function init() {
    cursor();
    dividers();
    scrollHue();
    accents();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();