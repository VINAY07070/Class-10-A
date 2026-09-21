/* ============================================
   Home page logic (V2 landing)
   Hero typewriter · spotlight renders · stats ·
   GSAP entrance · parallax · magnetic buttons
   ============================================ */

(function () {
  App.initShared('index.html');

  /* --- Hero subtitle typewriter --- */
  var heroSub = document.getElementById('heroSub');
  if (heroSub) {
    var fullText = 'Your classmates, teachers, homework, scores, chat, polls, subject resources and an AI study bot — all in one place.';
    var i = 0;
    var caret = document.createElement('span');
    caret.className = 'type-caret';
    heroSub.appendChild(caret);
    setTimeout(function type() {
      if (i < fullText.length) {
        heroSub.insertBefore(document.createTextNode(fullText.charAt(i)), caret);
        i++;
        setTimeout(type, 16);
      } else if (caret.parentNode) {
        caret.remove();
      }
    }, 1150);
  }

  /* --- Live ticker: built from the same records the inner pages show,
         so the home page never invents its own copy of the news. --- */
  var track = document.getElementById('homeTickerTrack');
  if (track) {
    var items = [];
    DataStore.getAnnouncements().slice(0, 3).forEach(function (a) {
      if (a && a.title) items.push({ label: 'NEWS', text: a.title });
    });
    DataStore.getHomework().slice(0, 3).forEach(function (h) {
      if (h && h.subject) items.push({ label: 'HOMEWORK', text: h.subject + (h.due_date ? ' · due ' + App.formatDate(h.due_date) : '') });
    });
    DataStore.getPolls().slice(0, 2).forEach(function (p) {
      if (p && p.question) items.push({ label: 'POLL', text: p.question });
    });
    DataStore.getPyqs && DataStore.getPyqs().slice(0, 2).forEach(function (p) {
      if (p && (p.title || p.subject)) items.push({ label: 'PYQ', text: p.title || p.subject });
    });
    if (!items.length) items.push({ label: 'WELCOME', text: 'Class 10-A Hub — everything for your class in one place.' });
    /* the track is duplicated so the CSS marquee loops seamlessly */
    var half = items.map(function (it) {
      return '<div class="marquee-item"><span class="badge">' + App.escapeHtml(it.label) + '</span> ' + App.escapeHtml(it.text) + '</div>';
    }).join('');
    track.innerHTML = half + half;
  }

  /* --- Announcement teaser ---
     The full post lives on announcements.html, so the home page only shows the
     opening lines. Reprinting the whole body here meant the two pages had to
     be kept in step by hand. */
  function teaser(text, n) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
  }
  var spot = document.getElementById('announcementSpotlight');
  if (spot) {
    var ann = DataStore.getAnnouncements();
    if (ann.length) {
      var latest = ann[0];
      var dateStr = latest.date || latest.created_at ? '<div class="spot-date"><i class="fa-regular fa-calendar"></i> ' + App.formatDate(latest.date || latest.created_at) + '</div>' : '';
      spot.innerHTML =
        '<div class="glass-card grad-border announcement-spot spot-hero">' +
        '<div class="spot-ornament spot-orn-a">📢</div>' +
        '<div class="spot-ornament spot-orn-b">✨</div>' +
        '<div class="spot-badge"><i class="fa-solid fa-bullhorn"></i> LATEST UPDATE</div>' +
        '<h3 class="heading-md spot-title">' + App.escapeHtml(latest.title) + '</h3>' +
        '<div class="spot-rule"></div>' +
        '<p class="text-secondary spot-body" style="margin:0">' + App.escapeHtml(teaser(latest.body, 190)) + '</p>' +
        '<div class="spot-meta">' +
        '<a href="announcements.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-arrow-right"></i> Read the rest</a>' +
        dateStr +
        '</div></div>';
    } else {
      spot.innerHTML = '<div class="announcement-spot-empty"><i class="fa-solid fa-bullhorn"></i><p>No announcements yet — check back soon!</p></div>';
    }
  }

  /* --- Class constellation ---
     One drifting point of light per classmate, with the nearest joined by
     faint lines and the whole field leaning toward the pointer. Deliberately
     has no names on it: the students page owns the roster, this is just the
     shape of the class. Pointer events are bound to the stage, not the
     document, so nothing off-page has to be watched. */
  function initConstellation() {
    var stage = document.getElementById('cnStage');
    var cv = document.getElementById('cnCanvas');
    if (!stage || !cv) return;

    var countEl = document.getElementById('cnCount');
    var names = (DataStore.getStudents ? DataStore.getStudents() : []) || [];
    if (countEl && names.length) countEl.textContent = names.length;

    var ctx = cv.getContext('2d');
    var stars = [], w = 0, h = 0, raf = 0, running = false;
    var px = -9999, py = -9999, pointerIn = false;

    /* Phones get the same effect at a lower cost rather than no effect:
       fewer points, fewer links and a capped backing store. */
    var LITE = document.documentElement.classList.contains('perf-lite');
    var MAX_DPR = LITE ? 1.5 : 2;
    var MAX_STARS = LITE ? 22 : 40;

    var CSS = getComputedStyle(document.documentElement);
    function v(name, fb) {
      var s = CSS.getPropertyValue(name).trim();
      return s || fb;
    }
    function palette() {
      CSS = getComputedStyle(document.documentElement);
      return [v('--gold', '#f0b24b'), v('--violet', '#c9a24b'), v('--cyan', '#f6d584'), v('--blue', '#e0b45c'), v('--pink', '#e8c07a')];
    }
    var COLORS = palette();

    function seed() {
      var n = Math.min(Math.max(names.length || 0, 6), MAX_STARS);
      stars = [];
      var cols = Math.min(6, Math.max(3, Math.round(Math.sqrt(n))));
      var rows = Math.ceil(n / cols);
      for (var i = 0; i < n; i++) {
        var cx = i % cols, cy = Math.floor(i / cols);
        /* even spread across the grid, then jittered so it never looks tabular */
        stars.push({
          x: ((cx + 0.5) / cols) * w + (Math.random() - 0.5) * (w / cols) * 0.55,
          y: ((cy + 0.5) / rows) * h + (Math.random() - 0.5) * (h / rows) * 0.55,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          r: 1.3 + Math.random() * 1.5,
          c: COLORS[i % COLORS.length],
          tw: Math.random() * Math.PI * 2
        });
      }
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      var r = stage.getBoundingClientRect();
      /* The site sits at display:none behind the login overlay, so an early
         measurement reads 0x0. Bail out and let the ResizeObserver below
         call us again once the stage has a real box, instead of baking a
         1x1 canvas that never recovers. */
      if (r.width < 2 || r.height < 2) return;
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      /* re-seeded points need a repaint; with motion on the loop does it */
      if (REDUCED && w >= 2 && h >= 2) drawStill();
    }

    var LINK = LITE ? 104 : 118;
    function step() {
      var i, a, dx, dy, d2, d;
      for (i = 0; i < stars.length; i++) {
        a = stars[i];
        a.x += a.vx; a.y += a.vy; a.tw += 0.02;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;

        if (pointerIn) {
          /* gentle attraction, then a soft push once a star is too close —
             together this reads as the class gathering around the pointer */
          dx = px - a.x; dy = py - a.y; d2 = dx * dx + dy * dy; d = Math.sqrt(d2) || 1;
          if (d < 240) { a.x += (dx / d) * 0.5; a.y += (dy / d) * 0.5; }
          if (d < 62) { a.x -= (dx / d) * 1.5; a.y -= (dy / d) * 1.5; }
        }
      }
    }

    function paint() {
      ctx.clearRect(0, 0, w, h);
      var i, j, a, b, dx, dy, d2, alpha;

      /* links first so the dots sit on top of them */
      ctx.lineWidth = 1;
      for (i = 0; i < stars.length; i++) {
        a = stars[i];
        for (j = i + 1; j < stars.length; j++) {
          b = stars[j];
          dx = a.x - b.x; dy = a.y - b.y; d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            alpha = (1 - Math.sqrt(d2) / LINK) * 0.32;
            ctx.strokeStyle = 'rgba(' + LINK_RGB[0] + ',' + LINK_RGB[1] + ',' + LINK_RGB[2] + ',' + alpha.toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }

      /* Two filled circles instead of a shadowBlur halo. shadowBlur forces a
         per-arc blur pass that costs far more than the extra fill, and the
         result is all but identical at these sizes. */
      for (i = 0; i < stars.length; i++) {
        a = stars[i];
        var tw = 0.62 + Math.sin(a.tw) * 0.38;
        ctx.fillStyle = a.c;
        ctx.globalAlpha = tw * 0.18;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 3.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = tw;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function frame() {
      step();
      paint();
      raf = requestAnimationFrame(frame);
    }

    var REDUCED = false;
    try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    /* Under reduced motion the constellation is drawn once and left still:
       the drift is what the setting asks us to drop, not the picture. */
    function drawStill() {
      step(); paint();
    }
    function start() {
      if (REDUCED) { if (!running) { running = true; drawStill(); running = false; } return; }
      if (!running) { running = true; raf = requestAnimationFrame(frame); }
    }
    function stop() { if (running) { running = false; cancelAnimationFrame(raf); } }

    function toLocal(e) {
      var r = cv.getBoundingClientRect();
      var t = (e.touches && e.touches[0]) || e;
      px = t.clientX - r.left; py = t.clientY - r.top; pointerIn = true;
    }
    stage.addEventListener('pointerdown', toLocal, { passive: true });
    stage.addEventListener('pointermove', function (e) {
      toLocal(e);
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
    }, { passive: false });
    stage.addEventListener('pointerleave', function () { pointerIn = false; });
    stage.addEventListener('pointerup', function () { pointerIn = false; });

    window.addEventListener('resize', resize);
    /* fires both when the login overlay is dismissed and on any layout change */
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        var r = stage.getBoundingClientRect();
        if (r.width >= 2 && Math.abs(r.width - w) > 1) resize();
      }).observe(stage);
    }
    /* only paint while on screen — keeps the canvas off the phone's battery
       and main thread when the section is scrolled past */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (en) { en.isIntersecting ? start() : stop(); });
      }, { threshold: 0.05 }).observe(stage);
    } else { start(); }

    /* repaint in the new palette when the theme changes */
    var LINK_RGB = [240, 178, 75];
    function readLinkRgb() {
      var raw = (getComputedStyle(document.documentElement).getPropertyValue('--gold') || '').trim();
      var m = raw.match(/^#([0-9a-f]{6})$/i);
      if (m) {
        LINK_RGB = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
      }
    }
    readLinkRgb();
    document.addEventListener('themechange', function () { COLORS = palette(); readLinkRgb(); });
    window.__aiaRefreshConstellation = function () {
      var n2 = DataStore.getStudents ? DataStore.getStudents().length : 0;
      if (countEl && n2) countEl.textContent = n2;
      resize(); start();
    };

    resize();
  }

  initConstellation();

  /* --- Live stats counters --- */
  function fillStats() {
    var map = {
      statStudents: DataStore.getStudentCount(),
      statTeachers: DataStore.getTeacherCount(),
      statHomework: DataStore.getHomeworkCount(),
      statChat: DataStore.getClassChat().length
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('data-count', map[id]);
      /* if the counter already ran, just update the number */
      if (el.getAttribute('data-done') === '1') el.textContent = map[id];
    });
  }
  fillStats();
  /* mark counters done so sync updates don't replay the animation */
  setTimeout(function () {
    ['statStudents', 'statTeachers', 'statHomework', 'statChat'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.setAttribute('data-done', '1');
    });
  }, 2200);
  window.__aiaRefresh = fillStats;

  App.initTiltCards();
  App.observeReveals(document);

  /* --- GSAP hero entrance + parallax --- */
  App.heroEntrance();
  App.initParallax();

  /* --- Magnetic buttons --- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        btn.style.transform = 'translate(' + x * 0.18 + 'px,' + y * 0.18 + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }
})();