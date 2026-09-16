/* ============================================================
   STICK MEN — VINAY & NITIN (v5 enhanced)
   Enhanced stickmen with GLASSES, improved animations,
   better mobile optimization, and professional polish
   ============================================================ */
(function () {
  'use strict';
  if (window.StickMen) return;

  var REDUCED = false;
  try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function siteLines(key) {
    var out = [];
    try {
      var name = '';
      var sess = (window.DataStore && DataStore.getSession) ? DataStore.getSession() : null;
      if (sess && sess.name) name = String(sess.name);
      var hw = (window.DataStore && DataStore.getHomework) ? (DataStore.getHomework() || []) : [];
      var ann = (window.DataStore && DataStore.getAnnouncements) ? (DataStore.getAnnouncements() || []) : [];
      var polls = (window.DataStore && DataStore.getPolls) ? (DataStore.getPolls() || []) : [];
      var msg = (window.DataStore && DataStore.getClassChat) ? (DataStore.getClassChat() || []) : [];
      if (name) {
        out.push('👋 Hey ' + name + '!');
        out.push('😊 Good to see you, ' + name + '.');
      } else {
        out.push('👋 Hi there! Login to see your class.');
      }
      if (ann.length) out.push('📢 ' + String(ann[0].title).slice(0, 42));
      if (hw.length) out.push('📚 ' + String(hw[0].subject || 'Homework') + ' by ' + String(hw[0].due || 'soon'));
      if (polls.length) out.push('🗳️ Poll open: ' + String(polls[0].question).slice(0, 36));
      if (msg.length) out.push('💬 ' + msg.length + ' messages in class chat');
      if (out.length < 3) out.push('🌱 Check homework, news or polls!');
    } catch (e) {
      out = ['👋 Hey!', '🌱 Explore the hub!'];
    }
    return out;
  }

  function easeInOutCubic(t) {
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function overshoot(t) {
    t = Math.max(0, Math.min(1, t));
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  var W = 44, H = 64;
  var VIEW_W = 0, VIEW_H = 0;
  var FLOOR_Y = 0;
  var MIN_X = 34, MAX_X = 0;
  var HIGHFIVE_COOLDOWN = 60000;
  var BUBBLE_COOLDOWN = 30000;
  var lastHighFiveAt = -60000;

  var stage = null;
  var figures = {};
  var rafId = 0;
  var last = 0;
  var timers = [];
  var toggleBtn = null;
  var hidden = false;

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randBetween(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Enhanced stickman SVG with GLASSES and professional look */
  function stickSVG(key) {
    var isVinay = key === 'vinay';
    var skin = '#ffd9a8';
    var bodyHi = isVinay ? '#7c6cff' : '#2dd4bf';
    var bodyLo = isVinay ? '#5546d6' : '#159ec9';
    var ink = isVinay ? '#3d2fa8' : '#0e6f92';
    var gradId = 'smg' + (isVinay ? 'Vinay' : 'Nitin');
    var streamline = isVinay ? '#5a4bd6' : '#12a8c2';

    var emblem = isVinay
      ? '<path d="M22 27.2 l.9 2.05 2.05 .9 -2.05 .9 -.9 2.05 -.9 -2.05 -2.05 -.9 2.05 -.9 z" fill="#ffd889"/>'
      : '<g><rect x="19" y="26.4" width="6" height="7" rx="1.6" fill="#ffffff" opacity=".9"/>' +
        '<rect x="20.2" y="27.8" width="3.6" height="1.5" rx=".75" fill="' + streamline + '"/>' +
        '<circle cx="22" cy="31.4" r="1.1" fill="' + streamline + '"/></g>';

    var sparkle = isVinay
      ? '<g class="sm-sparkle"><path d="M22 1.6 l1 2.3 2.3 1 -2.3 1 -1 2.3 -1 -2.3 -2.3 -1 2.3 -1 z" fill="#ffd889"/></g>'
      : '';

    /* Professional glasses frame */
    var glassesFrame = '<g class="sm-glasses" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="18.9" cy="12.6" r="3.1" stroke="' + (isVinay ? '#5a4bd6' : '#0e86a8') + '"/>' +
      '<circle cx="25.1" cy="12.6" r="3.1" stroke="' + (isVinay ? '#5a4bd6' : '#0e86a8') + '"/>' +
      '<line x1="21.2" y1="12.6" x2="22.8" y2="12.6" stroke="' + (isVinay ? '#5a4bd6' : '#0e86a8') + '"/>' +
      '<line x1="15.8" y1="11" x2="14.4" y2="9.8" stroke="' + (isVinay ? '#5a4bd6' : '#0e86a8') + '"/>' +
      '<line x1="28.2" y1="11" x2="29.6" y2="9.8" stroke="' + (isVinay ? '#5a4bd6' : '#0e86a8') + '"/>' +
      '</g>';

    return (
      '<svg class="sm-svg" viewBox="0 0 44 64" width="44" height="64" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + bodyHi + '"/><stop offset="1" stop-color="' + bodyLo + '"/>' +
      '</linearGradient></defs>' +
      '<ellipse class="sm-shadow" cx="22" cy="60.5" rx="11" ry="2.4" fill="#000" opacity=".26"/>' +
      '<g class="sm-flip">' +
      '<g class="sm-bodyroot">' +
      sparkle +
      '<g class="sm-legL"><path d="M22 42 L17 58" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="17" cy="58.5" r="2.6" fill="' + ink + '"/></g>' +
      '<g class="sm-legR"><path d="M22 42 L27 58" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="27" cy="58.5" r="2.6" fill="' + ink + '"/></g>' +
      '<g class="sm-torso"><rect x="14" y="22" width="16" height="20" rx="6" fill="url(#' + gradId + ')"/>' + emblem + '</g>' +
      '<g class="sm-armL"><line x1="17" y1="25" x2="11" y2="36" stroke="' + ink + '" stroke-width="4.2" stroke-linecap="round"/>' +
      '<circle cx="11" cy="36.5" r="2.3" fill="' + skin + '"/></g>' +
      '<g class="sm-armR"><line x1="27" y1="25" x2="33" y2="36" stroke="' + ink + '" stroke-width="4.2" stroke-linecap="round"/>' +
      '<circle cx="33" cy="36.5" r="2.3" fill="' + skin + '"/></g>' +
      '<g class="sm-head">' +
      '<circle cx="22" cy="13" r="9" fill="' + skin + '"/>' +
      (isVinay
        ? '<g class="sm-hair"><path d="M13.5 10.5 Q13 5 16 3.6 Q17.5 7 22 5.5 Q26 7 28 3.8 Q31 5.4 30.5 10.5 Q26 7.4 22 9 Q18 7.4 13.5 10.5 Z" fill="#2b1f6e"/>' +
          '<path d="M13.5 10.5 Q17 8 22 9 Q27 8 30.5 10.5" stroke="#2b1f6e" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>'
        : '<g class="sm-hair"><path d="M13.5 11 Q13 4.6 17 3.4 Q22 2.6 27 3.6 Q31 4.8 30.5 11 Q27 7.6 22 8 Q17 7.6 13.5 11 Z" fill="#123c52"/>' +
          '<path d="M22 3.4 Q20.5 7 22 8" stroke="#123c52" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>') +
      '<g class="sm-eyes"><circle cx="18.9" cy="12.6" r="1.45" fill="#1b1240"/>' +
      '<circle cx="25.1" cy="12.6" r="1.45" fill="#1b1240"/></g>' +
      glassesFrame +
      '<path d="M18.6 16 Q22 18.8 25.4 16" stroke="' + (isVinay ? '#6b3a1f' : '#0e5a4a') + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      '</g></g></svg>'
    );
  }

  function buildFigure(key, name, x) {
    var fig = document.createElement('div');
    fig.className = 'stickman sm-' + key;
    fig.setAttribute('role', 'img');
    fig.setAttribute('aria-label', name + ' mascot');
    fig.innerHTML = '<div class="sm-tag">' + name + '</div>' +
      '<div class="sm-bubble" aria-hidden="true"></div>' +
      stickSVG(key);
    stage.appendChild(fig);

    var svg = fig.querySelector('svg');
    function g(cls) { return svg.querySelector('.' + cls); }

    var f = {
      key: key, name: name, el: fig, svg: svg,
      root: g('sm-bodyroot'), torso: g('sm-torso'),
      armL: g('sm-armL'), armR: g('sm-armR'),
      legL: g('sm-legL'), legR: g('sm-legR'),
      eyes: g('sm-eyes'), shadow: g('sm-shadow'), sparkle: g('sm-sparkle'),
      x: x, y: FLOOR_Y, yOff: 0, facing: 1,
      mode: 'idle',
      t0: 0, dur: 0,
      fromX: x, toX: x, jumpH: 0, onDone: null,
      stepPhase: Math.random() * Math.PI * 2,
      lean: 0, bob: 0,
      breathPhase: Math.random() * Math.PI * 2,
      shiftPhase: Math.random() * Math.PI * 2,
      nextBlink: performance.now() + randBetween(8000, 15000),
      blinkUntil: 0,
      lastBubble: -BUBBLE_COOLDOWN,
      nod: 0, nodPhase: 0
    };
    fig.addEventListener('click', function () { react(key); });
    return f;
  }

  function bubble(fig, text, ms) {
    var b = fig ? fig.querySelector('.sm-bubble') : null;
    if (!b) return;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.remove('show'); }, ms || 2200);
  }

  function sparkle(fig, n) {
    if (REDUCED) return;
    n = n || 6;
    var r = fig.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height * 0.45;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      s.className = 'sm-spark';
      var ang = Math.random() * Math.PI * 2;
      var dist = Math.random() * 14;
      s.style.left = (cx + Math.cos(ang) * dist) + 'px';
      s.style.top = (cy + Math.sin(ang) * dist) + 'px';
      s.style.animationDelay = (Math.random() * 0.25) + 's';
      document.body.appendChild(s);
      (function (el) { setTimeout(function () { el.remove(); }, 1100); })(s);
    }
  }

  function startWalk(key) {
    var f = figures[key];
    if (!f || f.mode !== 'idle' || REDUCED) return false;
    var dist = randBetween(100, 300) * (Math.random() < 0.5 ? -1 : 1);
    var toX = clamp(f.x + dist, MIN_X, MAX_X);
    if (Math.abs(toX - f.x) < 40) {
      toX = clamp(f.x + (toX > f.x ? 140 : -140), MIN_X, MAX_X);
    }
    if (Math.abs(toX - f.x) < 40) return false;
    f.facing = toX > f.x ? 1 : -1;
    f.mode = 'walk';
    f.t0 = performance.now();
    f.fromX = f.x;
    f.toX = toX;
    f.dur = clamp(Math.abs(toX - f.x) / 75 * 1000, 2000, 4000);
    f.onDone = null;
    return true;
  }

  function walkTo(key, x, done) {
    var f = figures[key];
    if (!f) { if (done) done(); return; }
    f.facing = x > f.x ? 1 : -1;
    f.mode = 'walk';
    f.t0 = performance.now();
    f.fromX = f.x;
    f.toX = clamp(x, MIN_X, MAX_X);
    f.dur = clamp(Math.abs(f.toX - f.fromX) / 75 * 1000, 2000, 4000);
    f.onDone = done || null;
  }

  function maybeHighFive() {
    if (REDUCED || hidden) return;
    var now = performance.now();
    if (now - lastHighFiveAt < HIGHFIVE_COOLDOWN) return;
    var v = figures.vinay, n = figures.nitin;
    if (!v || !n) return;
    if (v.mode !== 'idle' || n.mode !== 'idle') return;

    var midX = clamp((v.x + n.x) / 2, MIN_X + 30, MAX_X - 30);
    lastHighFiveAt = now;

    walkTo('vinay', midX - 24, function () {
      walkTo('nitin', midX + 24, function () {
        var t = performance.now();
        v.mode = 'highfive'; v.t0 = t; v.dur = 1500;
        n.mode = 'highfive'; n.t0 = t; n.dur = 1500;
        bubble(v, 'High five! ✋', 1400);
        bubble(n, 'Yay! ✋', 1400);
        sparkle(v, 5);
        sparkle(n, 5);
      });
    });
  }

  function react(key) {
    var f = figures[key];
    if (!f || hidden) return;
    var now = performance.now();
    if (!REDUCED && f.mode === 'idle') {
      f.mode = 'jump';
      f.t0 = now;
      f.dur = 700;
      f.jumpH = 30;
    }
    if (now - f.lastBubble >= BUBBLE_COOLDOWN) {
      f.lastBubble = now;
      var lines = siteLines(key);
      bubble(f.el, lines[Math.floor(Math.random() * lines.length)], 2600);
    }
    sparkle(f.el, 6);
  }

  function updateFigure(f, now, t, dt) {
    var p;
    if (f.mode === 'walk') {
      p = clamp((now - f.t0) / f.dur, 0, 1);
      var eased = easeInOutCubic(p);
      f.x = f.fromX + (f.toX - f.fromX) * eased;
      var speed = Math.abs(f.toX - f.fromX) / f.dur;
      var cadence = 2.6 * clamp(speed / 0.11, 0.6, 1.4);
      f.stepPhase += (dt / 1000) * cadence * Math.PI * 2;
      f.bob = -Math.abs(Math.sin(f.stepPhase)) * 2.6;
      f.lean = f.facing * 3.4 * Math.sin(Math.min(1, p) * Math.PI);
      if (p >= 1) {
        var cb = f.onDone;
        f.mode = 'idle'; f.onDone = null;
        f.x = f.toX; f.bob = 0; f.lean = 0;
        if (cb) cb();
      }
    } else if (f.mode === 'jump') {
      p = clamp((now - f.t0) / f.dur, 0, 1);
      f.yOff = -f.jumpH * overshoot(p);
      f.bob = 0; f.lean = 0;
      if (p >= 1) { f.mode = 'idle'; f.yOff = 0; }
    } else if (f.mode === 'highfive') {
      p = clamp((now - f.t0) / f.dur, 0, 1);
      f.bob = 0; f.lean = 0;
      if (p >= 1) f.mode = 'idle';
    } else {
      f.bob *= 0.85;
      f.lean *= 0.85;
      f.yOff *= 0.85;
    }

    if (now >= f.nextBlink) {
      f.blinkUntil = now + 130;
      f.nextBlink = now + randBetween(8000, 15000);
    }
    var blinking = now < f.blinkUntil;

    var breath = 1 + 0.015 * Math.sin(t * 2.0 + f.breathPhase);
    var shift = Math.sin((t / 6.0) * Math.PI * 2 + f.shiftPhase) * 1.5;

    renderFigure(f, breath, shift, blinking);
  }

  function renderFigure(f, breath, shift, blinking) {
    var now = performance.now();
    var svgStyle = f.svg.style;
    svgStyle.transform = 'scaleX(' + f.facing + ')';
    svgStyle.transformOrigin = '22px 32px';

    var rootT = 'translate(0 ' + f.yOff.toFixed(2) + ') translate(' + shift.toFixed(2) + ' 0) rotate(' + f.lean.toFixed(2) + ' 22 42)';
    f.root.setAttribute('transform', rootT);

    f.torso.setAttribute('transform',
      'translate(22 32) scale(' + breath.toFixed(4) + ' ' + breath.toFixed(4) + ') translate(-22 -32)');

    var swing = 0, idleSway = Math.sin(now / 560 + f.breathPhase) * 2.5;
    if (f.mode === 'walk') {
      swing = Math.sin(f.stepPhase) * 24;
    } else if (f.mode === 'jump') {
      swing = 18;
    } else if (f.mode === 'highfive') {
      swing = 0;
    }
    var legA = f.mode === 'walk' ? swing : (f.mode === 'jump' ? 14 : idleSway * 0.4);
    var armA = f.mode === 'walk' ? swing : (f.mode === 'jump' ? 0 : idleSway);

    if (f.mode === 'jump') {
      f.armL.setAttribute('transform', 'rotate(-118 17 25)');
      f.armR.setAttribute('transform', 'rotate(118 27 25)');
    } else if (f.mode === 'highfive') {
      if (f.key === 'vinay') {
        f.armR.setAttribute('transform', 'rotate(-96 27 25)');
        f.armL.setAttribute('transform', 'rotate(-24 17 25)');
      } else {
        f.armL.setAttribute('transform', 'rotate(-84 17 25)');
        f.armR.setAttribute('transform', 'rotate(24 27 25)');
      }
    } else {
      f.legL.setAttribute('transform', 'rotate(' + ((-12 + legA).toFixed(2)) + ' 22 42)');
      f.legR.setAttribute('transform', 'rotate(' + ((12 - legA).toFixed(2)) + ' 22 42)');
      f.armL.setAttribute('transform', 'rotate(' + ((-26 - armA).toFixed(2)) + ' 17 25)');
      f.armR.setAttribute('transform', 'rotate(' + ((26 + armA).toFixed(2)) + ' 27 25)');
    }

    f.eyes.setAttribute('opacity', blinking ? '0' : '1');

    if (f.sparkle) {
      f.sparkle.setAttribute('opacity', (0.55 + 0.45 * Math.sin(now / 340)).toFixed(2));
    }

    var air = clamp(Math.abs(f.yOff) / 40, 0, 1);
    f.shadow.setAttribute('opacity', (0.26 * (1 - air * 0.65)).toFixed(2));
    f.shadow.setAttribute('transform', 'scale(' + (1 - air * 0.35).toFixed(3) + ' 1)');

    f.el.style.transform = 'translate3d(' + f.x.toFixed(2) + 'px,' + (f.y + f.yOff).toFixed(2) + 'px,0)';
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(50, now - last);
    last = now;
    var t = now / 1000;
    updateFigure(figures.vinay, now, t, dt);
    updateFigure(figures.nitin, now, t, dt);
  }

  function scheduleNext() {
    timers.push(setTimeout(function () {
      if (!stage || hidden) { if (stage) scheduleNext(); return; }
      if (document.hidden) { scheduleNext(); return; }
      var roll = Math.random();
      if (roll < 0.82) {
        var k = Math.random() < 0.5 ? 'vinay' : 'nitin';
        if (!startWalk(k)) scheduleNext();
      } else if (roll < 0.94) {
        maybeHighFive();
      }
      scheduleNext();
    }, randBetween(8000, 20000)));
  }

  function measure() {
    VIEW_W = window.innerWidth;
    VIEW_H = window.innerHeight;
    FLOOR_Y = VIEW_H - 78;
    MIN_X = 34;
    MAX_X = Math.max(MIN_X + 60, VIEW_W - 34 - W);
    ['vinay', 'nitin'].forEach(function (k) {
      var f = figures[k];
      if (!f) return;
      f.x = clamp(f.x, MIN_X, MAX_X);
      f.y = FLOOR_Y;
    });
  }

  function buildToggle() {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'stickmen-toggle';
    toggleBtn.id = 'stickmenToggle';
    toggleBtn.type = 'button';
    toggleBtn.textContent = '🧍';
    toggleBtn.setAttribute('aria-label', 'Toggle Vinay and Nitin');
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.setAttribute('title', 'Toggle Vinay & Nitin');
    document.body.appendChild(toggleBtn);
    toggleBtn.addEventListener('click', function () {
      hidden = !hidden;
      document.body.classList.toggle('stickmen-hidden', hidden);
      toggleBtn.textContent = hidden ? '🙈' : '🧍';
      toggleBtn.setAttribute('aria-pressed', String(hidden));
      if (hidden) {
        cancelAnimationFrame(rafId);
        timers.forEach(clearTimeout);
        timers = [];
      } else if (!REDUCED) {
        last = performance.now();
        rafId = requestAnimationFrame(frame);
        scheduleNext();
      }
    });
  }

  function init() {
    if (stage) return;
    stage = document.createElement('div');
    stage.className = 'stickmen-stage';
    stage.id = 'stickmenStage';
    document.body.appendChild(stage);

    measure();
    window.addEventListener('resize', measure, { passive: true });

    figures.vinay = buildFigure('vinay', 'Vinay', MIN_X + randBetween(0, 120));
    figures.nitin = buildFigure('nitin', 'Nitin', Math.max(MIN_X + 140, MAX_X - randBetween(0, 120)));

    var t = performance.now() / 1000;
    renderFigure(figures.vinay, 1, 0, false);
    renderFigure(figures.nitin, 1, 0, false);

    buildToggle();

    if (!REDUCED) {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
      scheduleNext();
    } else {
      var vEl = figures.vinay.el;
      vEl.addEventListener('click', function () {
        if (performance.now() - figures.vinay.lastBubble >= BUBBLE_COOLDOWN) {
          figures.vinay.lastBubble = performance.now();
          var l2 = siteLines('vinay');
          bubble(vEl, l2[Math.floor(Math.random() * l2.length)], 2600);
        }
      });
    }
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    timers.forEach(clearTimeout);
    timers = [];
    if (stage) { stage.remove(); stage = null; }
    figures = {};
    if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; }
  }

  window.StickMen = { init: init, destroy: destroy, bubble: bubble, sparkle: sparkle };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!stage && !document.body.classList.contains('stickmen-hidden')) init();
    });
  } else {
    if (!stage && !document.body.classList.contains('stickmen-hidden')) init();
  }
})();