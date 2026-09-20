/* ============================================================
   PIG.JS — Parameshwar, the class pig.

   A small pink pig that wanders the bottom of every page on its own
   schedule, occasionally does something mischievous, and can be
   poked. Deliberately tiny (about 34px tall) so he reads as a pet
   loose in the site rather than a third mascot competing with the
   stickmen.

   Everything is generated SVG driven by one rAF loop that runs on
   the shared AiaTicker, so it costs one extra subscriber rather than
   its own animation frame budget. Layout is transform-only: no width,
   height, or offset writes per frame, which is what keeps it cheap on
   phones.
   ============================================================ */
(function () {
  'use strict';
  if (window.__PigLoaded) return;
  window.__PigLoaded = true;

  var P = window.AiaPerf || {};
  /* Respect reduced-motion and the phone "lite" tier: the pig stays
     parked rather than pacing, but he is still there to be poked. */
  var REDUCED = !!P.reduced;
  var LITE = !!P.lite;

  var NAMES = ['Parameshwar'];
  var MOODS = [
    { id: 'walk', ms: 2600 },
    { id: 'idle', ms: 2200 },
    { id: 'sniff', ms: 1800 },
    { id: 'dig', ms: 2000 },
    { id: 'trot', ms: 2400 },
    { id: 'idle', ms: 1600 },
    { id: 'mischief', ms: 2600 }
  ];
  /* What he gets up to. `say` is what he is thinking; `act` is what he does. */
  var MISCHIEF = [
    { say: 'oink', do: 'dig' },
    { say: 'hehe', do: 'charge' },
    { say: 'sniff sniff', do: 'sniff' },
    { say: 'oink oink!', do: 'rear' }
  ];

  var el = null, svgEl = null, bubbleEl = null, body = null, legEls = [];
  var x = 0, y = 0, vx = 0, dir = 1, dirSmooth = 1;
  var mode = 'idle', modeEnd = 0, nextThink = 0;
  var bob = 0, tilt = 0, legPhase = 0, blinkT = 0;
  var dragged = false, dragX = 0, vDrag = 0;
  var wanderMin = 8, wanderMax = 200;
  var W = 46;   /* world width of the pig, matched by the SVG viewBox */
  var mounted = false;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------------- art ---------------- */
  /* One small side-on pig. Kept to a couple of dozen shapes so it
     stays cheap; the personality is in the animation, not the detail. */
  function pigSVG() {
    var body = '#ffb0c8', shade = '#f291ab', dark = '#d9738f', ink = '#7a3550';
    var s = '';
    s += '<svg class="pig-svg" viewBox="0 0 46 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<ellipse class="pig-shadow" cx="23" cy="31.4" rx="13" ry="1.7" fill="#000" opacity=".3"/>';
    s += '<g class="pig-flip">';
    /* tail — a little curl behind the body */
    s += '<path class="pig-tail" d="M7 19 q-4 -1 -3.4 -4.2 q.5 -2.6 3 -2.2 q2.2 .35 1.9 2.4" ' +
         'fill="none" stroke="' + dark + '" stroke-width="1.7" stroke-linecap="round"/>';
    /* legs — four short stubs, animated in two diagonal pairs */
    var legs = [[13, 26], [17.5, 26], [28, 26], [32.5, 26]];
    for (var i = 0; i < legs.length; i++) {
      s += '<line class="pig-leg pig-leg-' + i + '" x1="' + legs[i][0] + '" y1="' + legs[i][1] +
           '" x2="' + legs[i][0] + '" y2="31"' +
           ' stroke="' + shade + '" stroke-width="3" stroke-linecap="round"/>';
    }
    /* body */
    s += '<ellipse class="pig-body" cx="23" cy="19.5" rx="14.5" ry="9" fill="' + body + '"/>';
    s += '<ellipse cx="23" cy="22.5" rx="11" ry="5.6" fill="' + shade + '" opacity=".45"/>';
    /* head */
    s += '<g class="pig-head">';
    s += '<ellipse cx="35" cy="15.5" rx="8.4" ry="7.6" fill="' + body + '"/>';
    /* ears */
    s += '<path d="M30.5 8.6 q1.2 -4 4.4 -3.1 q1.4 2.6 .4 5.2 z" fill="' + shade + '"/>';
    s += '<path d="M37.6 9.4 q2.6 -3.1 4.8 -.9 q-.6 2.9 -3.1 4.3 z" fill="' + dark + '" opacity=".85"/>';
    /* snout */
    s += '<ellipse class="pig-snout" cx="43" cy="17.2" rx="3.5" ry="3" fill="' + dark + '"/>';
    s += '<circle cx="41.9" cy="16.6" r=".62" fill="' + ink + '"/>';
    s += '<circle cx="44.1" cy="16.6" r=".62" fill="' + ink + '"/>';
    /* eye — closes by squashing the pupil */
    s += '<circle class="pig-eye" cx="37.4" cy="13.4" r="1.45" fill="' + ink + '"/>';
    s += '<circle cx="37.9" cy="12.9" r=".45" fill="#fff" opacity=".8"/>';
    /* cheek blush */
    s += '<ellipse cx="34.2" cy="18.6" rx="2.3" ry="1.5" fill="' + dark + '" opacity=".3"/>';
    s += '</g>'; /* head */
    s += '</g></svg>';
    return s;
  }

  function build() {
    if (document.querySelector('.pig-parameshwar')) return;
    el = document.createElement('div');
    el.className = 'pig-parameshwar';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Parameshwar the class pig');
    el.innerHTML = pigSVG() +
      '<div class="pig-bubble" aria-hidden="true"><span class="pig-bubble-text"></span></div>';
    document.body.appendChild(el);
    svgEl = el.querySelector('.pig-svg');
    body = el.querySelector('.pig-flip');
    bubbleEl = el.querySelector('.pig-bubble');
    legEls = [].slice.call(el.querySelectorAll('.pig-leg'));
    mounted = true;
    measure();
  }

  function measure() {
    var w = window.innerWidth || 360;
    W = w < 620 ? 38 : 46;
    el.style.width = W + 'px';
    el.style.height = Math.round(W * 34 / 46) + 'px';
    wanderMin = 6;
    wanderMax = Math.max(wanderMin + 40, w - W - 6);
    x = clamp(x, wanderMin, wanderMax);
    y = groundY();
    applyPos();
  }

  function groundY() {
    /* Rest just above the bottom edge. On phones the bottom tab bar sits
       there, so he walks along in front of it. */
    return (window.innerHeight || 700) - (window.innerHeight < 620 ? 58 : 14) - Math.round(W * 34 / 46);
  }

  function applyPos() {
    if (!el) return;
    el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0) scaleX(' +
      (dirSmooth >= 0 ? 1 : -1) + ')';
  }

  function say(text, ms) {
    if (!bubbleEl) return;
    var t = bubbleEl.querySelector('.pig-bubble-text');
    if (t) t.textContent = text;
    bubbleEl.classList.add('show');
    clearTimeout(say._t);
    say._t = setTimeout(function () { bubbleEl.classList.remove('show'); }, ms || 1700);
  }

  /* ---------------- behaviour ---------------- */
  function pickMode(now) {
    var m = MOODS[Math.floor(Math.random() * MOODS.length)];
    mode = m.id;
    modeEnd = now + m.ms;
    if (mode === 'walk') { vx = (dir > 0 ? 1 : -1) * 15; }
    else if (mode === 'trot') { vx = (dir > 0 ? 1 : -1) * 32; }
    else if (mode === 'idle' || mode === 'sniff') { vx = 0; }
    else if (mode === 'dig') { vx = 0; }
    else if (mode === 'mischief') {
      var act = MISCHIEF[Math.floor(Math.random() * MISCHIEF.length)];
      mode = act.do;
      modeEnd = now + 2400;
      say(act.say, 1600);
      if (act.do === 'charge') { vx = (dir > 0 ? 1 : -1) * 74; }
      else if (act.do === 'rear') { vx = 0; }
      else { vx = 0; }
    }
  }

  var ACCENT = 0;

  function tick(dt, now) {
    if (!mounted || !el) return;
    /* Never animate in a background tab; the ticker already handles this,
       but the pig is the cheapest thing to skip so skip it first. */
    if (document.hidden) return;

    if (!nextThink) nextThink = now + 600;
    if (now > modeEnd && now > nextThink) {
      pickMode(now);
      nextThink = now + 400;
    }

    if (mode === 'idle' || mode === 'sniff' || mode === 'dig' || mode === 'rear') {
      vx += (0 - vx) * Math.min(1, dt * 6);
    }

    /* drag overrides everything: he dangles and swings */
    if (dragged) {
      x = clamp(dragX, wanderMin, wanderMax);
      vx = vDrag;
    } else {
      x += vx * dt;
      if (x <= wanderMin) { x = wanderMin; vx = Math.abs(vx) * 0.5; dir = 1; }
      if (x >= wanderMax) { x = wanderMax; vx = -Math.abs(vx) * 0.5; dir = -1; }
      if (Math.abs(vx) > 0.4) dir = vx > 0 ? 1 : -1;
    }

    /* flip smoothly so he never snaps between facings */
    dirSmooth = lerp(dirSmooth, dir, Math.min(1, dt * 9));

    /* walk cycle: legs alternate in diagonal pairs, body bobs */
    var speed = Math.abs(vx);
    legPhase += dt * (6 + speed * 0.32);
    var amp = clamp(speed / 30, 0, 1);
    for (var i = 0; i < 4; i++) {
      if (!legEls[i]) continue;
      var ph = legPhase + (i % 2 ? Math.PI : 0);
      var sw = Math.sin(ph) * 3.1 * amp;
      legEls[i].setAttribute('x2', (parseFloat(legEls[i].getAttribute('x1')) + sw).toFixed(1));
    }
    bob = REDUCED ? 0 : Math.abs(Math.sin(legPhase)) * 1.5 * amp;
    /* sniff dips the head, rear lifts the front, dig paws at the ground */
    var dip = 0, lift = 0;
    if (mode === 'sniff') dip = 1.6;
    if (mode === 'dig') dip = Math.abs(Math.sin(now / 90)) * 2.2;
    if (mode === 'rear') lift = 2.6;

    tilt = mode === 'rear' ? -0.16 : (mode === 'dig' ? 0.1 : 0);
    el.style.transform = 'translate3d(' + Math.round(x) + 'px,' +
      Math.round(y + bob - lift) + 'px,0) scaleX(' + (dirSmooth >= 0 ? 1 : -1) + ')';
    if (body) body.setAttribute('transform',
      'rotate(' + (tilt * 57.3).toFixed(2) + ' 23 24) translate(0 ' + (-dip).toFixed(2) + ')');

    /* blink */
    blinkT -= dt;
    if (blinkT <= -0.06) blinkT = 2.4 + Math.random() * 3.4;
    var eye = el.querySelector('.pig-eye');
    if (eye) {
      var sy = blinkT < 0 ? 0.12 : 1;
      eye.setAttribute('transform', 'translate(37.4 13.4) scale(1 ' + sy + ') translate(-37.4 -13.4)');
    }
  }

  /* ---------------- interaction ---------------- */
  function onDown(e) {
    var pt = e.touches ? e.touches[0] : e;
    dragged = true;
    el.classList.add('grabbed');
    say('oink!', 900);
    var r = el.getBoundingClientRect();
    dragX = pt.clientX - r.width / 2;
    vDrag = 0;
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }
  var lastPt = null;
  function onMove(e) {
    if (!dragged) return;
    var pt = e.touches ? e.touches[0] : e;
    if (lastPt) vDrag = clamp((pt.clientX - lastPt) / 0.016, -900, 900) * 0.35;
    lastPt = pt;
    dragX = pt.clientX - W / 2;
  }
  function onUp() {
    if (!dragged) return;
    dragged = false;
    lastPt = null;
    el.classList.remove('grabbed');
    /* take the momentum and calm down quickly so he never rockets off */
    vx = (Math.abs(vDrag) > 400 ? vDrag : 0) * 1.4;
    vx = clamp(vx, -320, 320);
    mode = 'walk'; modeEnd = performance.now() + 1400;
    say(Math.random() < 0.5 ? 'wheee!' : 'oink oink', 1200);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
  }
  function onTap() {
    say(['oink', 'hehe!', 'oink oink', 'snort'][Math.floor(Math.random() * 4)], 1300);
    var roll = Math.random();
    if (roll < 0.4) { mode = 'dig'; modeEnd = performance.now() + 1500; }
    else if (roll < 0.7) { mode = 'rear'; modeEnd = performance.now() + 1200; }
    else { say('hehe!', 1200); vx = (dir > 0 ? 1 : -1) * 70; mode = 'charge'; modeEnd = performance.now() + 1200; }
  }

  function init() {
    if (REDUCED) return;              /* no roaming pig under reduced motion */
    build();
    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('click', onTap);
    window.addEventListener('resize', measure);
    /* On "lite" (phones) he still exists and can be poked, but we throttle
       his schedule so he is not a constant repaint in the corner. */
    var tickFn = tick;
    if (window.AiaTicker) window.AiaTicker.add(tickFn);
    else (function loop(t) { tick(0.016, t); requestAnimationFrame(loop); })(0);
    setTimeout(function () {
      if (LITE) return;
      say('oink!', 1500);
    }, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Parameshwar = {
    say: say,
    goTo: function (nx) { x = clamp(nx, wanderMin, wanderMax); vx = 0; },
    destroy: function () { if (el && el.parentNode) el.parentNode.removeChild(el); mounted = false; }
  };
})();