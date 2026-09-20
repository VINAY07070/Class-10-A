/* ============================================================
   SIGNATURE.JS — applies the 10-A identity to every page.

   Works from the DOM the pages already have, so no page markup
   needs to change and nothing here can break if a page is
   missing an element. Everything is idempotent: calling init()
   twice is a no-op, which matters because main.js can re-render
   sections after login.

   Cheap by construction: the rail is built once from the
   sections that exist, the section numbers are written once per
   section, and the only per-frame work is the card glow, which
   is throttled to a pointer-move listener on desktop only.
   ============================================================ */
(function () {
  'use strict';
  if (window.__SignatureLoaded) return;
  window.__SignatureLoaded = true;

  var P = window.AiaPerf || {};
  var LITE = !!P.lite;
  var REDUCED = !!P.reduced;
  var TOUCH = false;
  try { TOUCH = window.matchMedia('(hover: none), (pointer: coarse)').matches; } catch (e) {}

  /* ---------------- the crest ---------------- */
  /* A hexagonal mark with a slowly counter-rotating outer ring and the
     class monogram in the middle. Drawn with SVG text so it stays crisp
     at every size and costs nothing to scale. */
  function crestSVG(size) {
    var s = size || 46;
    var r = s / 2;
    return '<span class="sig-crest" aria-hidden="true">' +
      '<svg viewBox="0 0 64 64">' +
        '<g class="crest-ring">' +
          '<path d="M32 4 L55 17.5 L55 44.5 L32 58 L9 44.5 L9 17.5 Z" ' +
                'fill="none" stroke="rgba(168,155,255,.34)" stroke-width="1.4"/>' +
          '<circle cx="32" cy="4" r="1.9" fill="#f5b544"/>' +
          '<circle cx="55" cy="44.5" r="1.9" fill="#5eead4"/>' +
          '<circle cx="9" cy="44.5" r="1.9" fill="#ff8fb1"/>' +
        '</g>' +
        '<path d="M32 11 L49 21 L49 41 L32 51 L15 41 L15 21 Z" ' +
              'fill="rgba(12,17,34,.85)" stroke="rgba(245,181,68,.4)" stroke-width="1.2"/>' +
        '<text class="crest-mono" x="32" y="39" text-anchor="middle">10' +
          '<tspan class="crest-x">A</tspan></text>' +
      '</svg></span>';
  }

  function swapBrand() {
    var brand = document.querySelector('.navbar-brand .brand-logo');
    if (!brand || brand.dataset.sigCrest === '1') return;
    brand.dataset.sigCrest = '1';
    brand.style.display = 'none';
    var holder = document.createElement('span');
    holder.innerHTML = crestSVG(38);
    brand.parentNode.insertBefore(holder.firstChild, brand);
  }

  /* ---------------- numbered section rules ---------------- */
  /* Each top-level section gets a small numbered hairline. The number is
     its position on the page, which doubles as the rail's labelling. */
  function numberSections() {
    var sections = sectionsOf();
    sections.forEach(function (sec, i) {
      var head = sec.querySelector('.section-head, .page-header-inner');
      if (!head || head.querySelector('.sig-rule')) return;
      var rule = document.createElement('div');
      rule.className = 'sig-rule';
      rule.innerHTML = '<span class="sig-rule-num">' + pad(i + 1) + '</span>' +
        '<span class="sig-rule-line"></span>';
      head.insertBefore(rule, head.firstChild);
    });
  }

  /* Draw the chalk underline under every h2 that has a heading class. */
  function underlines() {
    document.querySelectorAll('.heading-lg').forEach(function (h) {
      if (h.querySelector('.sig-underline')) return;
      var u = document.createElement('span');
      u.className = 'sig-underline';
      h.appendChild(u);
    });
  }

  /* Reveal the numbered rules as they scroll in. Reuses whatever
     IntersectionObserver support exists; without it they are simply
     visible, which is the graceful degradation we want. */
  function revealRules() {
    var rules = [].filter.call(document.querySelectorAll('.sig-rule'), function (r) {
      return !r.classList.contains('in');
    });
    if (!rules.length) return;
    if (LITE || REDUCED || !window.IntersectionObserver) {
      rules.forEach(function (r) { r.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    rules.forEach(function (r) { io.observe(r); });
  }

  /* Flash a number when the live stats update, so the reader notices the
     change without a toast or a sound. */
  function wireStatTicks() {
    ['statStudents', 'statTeachers', 'statHomework', 'statChat'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.sigTick === '1') return;
      el.dataset.sigTick = '1';
      if (LITE || REDUCED) return;
      var prev = el.textContent;
      setInterval(function () {
        if (el.textContent === prev) return;
        prev = el.textContent;
        el.classList.remove('sig-tick');
        void el.offsetWidth;                 /* restart the animation */
        el.classList.add('sig-tick');
      }, 1500);
    });
  }

  /* ---------------- graph-paper wash ---------------- */

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* Sections worth putting on the rail: the big content blocks only.
     Skip the hero (top of page is its own dot) and anything tiny. */
  function sectionsOf() {
    return [].filter.call(document.querySelectorAll('section.section'), function (s) {
      return s.offsetHeight > 120 || s.querySelector('.section-head');
    });
  }

  /* ---------------- the scroll rail ---------------- */
  var rail = null, dots = [], railSections = [], railOn = false, railFill = null;

  function labelFor(sec, i) {
    var h = sec.querySelector('.heading-lg, .heading-md, h2, h3');
    var t = h ? String(h.textContent).replace(/\s+/g, ' ').trim() : '';
    if (t.length > 22) t = t.slice(0, 21) + '…';
    return t || ('Section ' + pad(i + 1));
  }

  function buildRail() {
    if (TOUCH || REDUCED) return;
    railSections = sectionsOf();
    /* need a few sections before a rail is worth showing */
    if (railSections.length < 2) return;

    if (!rail) {
      rail = document.createElement('nav');
      rail.className = 'sig-rail';
      rail.setAttribute('aria-label', 'Page sections');
      document.body.appendChild(rail);

      var top = document.createElement('button');
      top.className = 'sig-dot';
      top.type = 'button';
      top.dataset.label = 'Top';
      top.setAttribute('aria-label', 'Back to top');
      top.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      });
      rail.appendChild(top);
      dots = [top];

      railFill = document.createElement('span');
      railFill.className = 'sig-rail-fill';
      railFill.setAttribute('aria-hidden', 'true');
      rail.appendChild(railFill);
    }

    /* one dot per section, rebuilt because a page may re-render */
    dots.slice(1).forEach(function (d) { d.remove(); });
    dots = dots.slice(0, 1);
    railSections.forEach(function (sec, i) {
      var d = document.createElement('button');
      d.className = 'sig-dot';
      d.type = 'button';
      d.dataset.label = labelFor(sec, i);
      d.setAttribute('aria-label', labelFor(sec, i));
      d.addEventListener('click', function () {
        sec.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      });
      rail.appendChild(d);
      dots.push(d);
    });
  }

  function updateRail() {
    if (!rail || !dots.length) return;
    /* show the rail only once the reader is past the hero */
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var show = y > window.innerHeight * 0.5;
    if (show !== railOn) { railOn = show; rail.classList.toggle('on', show); }
    if (!show) return;

    /* active = the last section whose top has passed the navbar line */
    var line = y + window.innerHeight * 0.34;
    var active = 0;
    railSections.forEach(function (sec, i) {
      var top = sec.getBoundingClientRect().top + y;
      if (top <= line) active = i + 1;
    });
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('active', i === active);

    /* grow the spine toward the active dot */
    if (railFill && dots[active]) {
      var dr = dots[active].getBoundingClientRect();
      var rr = rail.getBoundingClientRect();
      railFill.style.height = Math.max(0, dr.top - rr.top - 26 + dr.height / 2).toFixed(0) + 'px';
    }
  }

  /* ---------------- card pointer glow ---------------- */
  function wireGlow() {
    if (TOUCH || LITE) return;
    document.querySelectorAll('.feature-card:not([data-sig-glow]), .glass-card:not([data-sig-glow])')
      .forEach(function (card) {
        card.dataset.sigGlow = '1';
        card.addEventListener('pointermove', glowMove, { passive: true });
        card.addEventListener('pointerleave', function () {
          card.style.removeProperty('--mx'); card.style.removeProperty('--my');
        }, { passive: true });
      });
  }
  function glowMove(e) {
    /* coalesce to one write per frame so a fast pointer cannot queue up
       a style recalculation per event */
    var card = e.currentTarget;
    if (card._glowRaf) return;
    card._glowRaf = requestAnimationFrame(function () {
      card._glowRaf = 0;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }

  /* ---------------- button ripple ---------------- */
  function wireRipple() {
    if (REDUCED) return;
    document.addEventListener('pointerdown', function (e) {
      var t = e.target.closest && e.target.closest('.btn, .login-btn, .tabbar-item, .quick-link');
      if (!t) return;
      var r = t.getBoundingClientRect();
      var d = Math.max(r.width, r.height);
      var s = document.createElement('span');
      s.className = 'sig-ripple';
      s.style.width = s.style.height = d + 'px';
      s.style.left = (e.clientX - r.left - d / 2) + 'px';
      s.style.top = (e.clientY - r.top - d / 2) + 'px';
      t.appendChild(s);
      setTimeout(function () { s.remove(); }, 620);
    }, { passive: true });
  }

  /* ---------------- index-card numbering ---------------- */
  function indexCards() {
    ['.feature-grid', '.quick-grid', '.dash-grid'].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (grid) {
        [].forEach.call(grid.children, function (child, i) {
          if (child.classList.contains('sig-indexed')) return;
          child.classList.add('sig-indexed');
          child.dataset.index = pad(i + 1);
        });
      });
    });
  }

  /* ---------------- footer sign-off ---------------- */
  function signOff() {
    var f = document.querySelector('.site-footer .container, footer .container');
    if (!f || f.querySelector('.sig-signoff')) return;
    var d = document.createElement('div');
    d.className = 'sig-signoff';
    d.innerHTML = 'Alpha International Academy<span class="dot"></span>Class 10-A' +
                  '<span class="dot"></span>Built by the class';
    f.appendChild(d);
  }

  /* ---------------- graph-paper wash ---------------- */
  function addWash() {
    if (document.querySelector('.sig-wash')) return;
    var w = document.createElement('div');
    w.className = 'sig-wash';
    w.setAttribute('aria-hidden', 'true');
    document.body.appendChild(w);
  }

  /* ---------------- run ---------------- */
  var raf = 0;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; updateRail(); });
  }

  function apply() {
    addWash();
    swapBrand();
    numberSections();
    underlines();
    buildRail();
    wireGlow();
    indexCards();
    signOff();
    wireStatTicks();
    revealRules();
    updateRail();
  }

  function init() {
    apply();
    wireRipple();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { buildRail(); updateRail(); }, { passive: true });
    /* pages that render after login / after data load: re-apply once the
       DOM settles, and once more after a delay for slow async pages */
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () {
        clearTimeout(mo._t);
        mo._t = setTimeout(apply, 300);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    setTimeout(apply, 1200);
    setTimeout(apply, 3000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Signature = { init: apply, crest: crestSVG };
})();