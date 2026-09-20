/* ============================================================
   STICKMEN v5 — "Classic Alive" engine
   ------------------------------------------------------------
   Vinay & Nitin as CLASSIC stick figures (circle head + line
   limbs) with a professional procedural-animation rig:

   • 2-bone IK arms & legs (elbows/knees bend naturally)
   • spring-lag head, cursor-tracking pupils, blinking,
     breathing chest, weight sway — they feel ALIVE
   • squash & stretch jumps, anticipation crouch, landing dust
   • walk / run gait, wave, dance, high-five, yawn, celebrate
   • GRAB & THROW them (mouse + touch) with gravity physics
   • typewriter speech bubbles fed by real site data
   • single rAF loop, pause when hidden, reduced-motion safe
   ============================================================ */
(function () {
  'use strict';
  if (window.StickMen && window.StickMen.__v === 5) return;

  /* ---------------- utils ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function dampRate(perSec, dt) { return 1 - Math.exp(-perSec * dt); }
  function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* 2-bone IK: root A -> joint J -> target B. bend=+1/-1 picks side. */
  function solveIK(ax, ay, bx, by, l1, l2, bend) {
    var dx = bx - ax, dy = by - ay;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var maxD = l1 + l2 - 0.5, minD = Math.abs(l1 - l2) + 0.5;
    if (d > maxD) { bx = ax + dx / d * maxD; by = ay + dy / d * maxD; d = maxD; }
    if (d < minD) { bx = ax + dx / d * minD; by = ay + dy / d * minD; d = minD; }
    var cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    var ang = Math.atan2(dy, dx) + bend * Math.acos(cosA);
    return { jx: ax + Math.cos(ang) * l1, jy: ay + Math.sin(ang) * l1, bx: bx, by: by };
  }

  var REDUCED = false;
  try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var IS_TOUCH = false;
  try { IS_TOUCH = window.matchMedia('(hover: none), (pointer: coarse)').matches; } catch (e) {}

  /* ---------------- speech (real site data) ---------------- */
  function siteLines() {
    var out = [];
    try {
      var sess = (window.DataStore && DataStore.getSession) ? DataStore.getSession() : null;
      var name = sess && sess.name ? String(sess.name) : '';
      var hw = (window.DataStore && DataStore.getHomework) ? (DataStore.getHomework() || []) : [];
      var ann = (window.DataStore && DataStore.getAnnouncements) ? (DataStore.getAnnouncements() || []) : [];
      var polls = (window.DataStore && DataStore.getPolls) ? (DataStore.getPolls() || []) : [];
      var chat = (window.DataStore && DataStore.getClassChat) ? (DataStore.getClassChat() || []) : [];
      var scores = (window.DataStore && DataStore.getTestScores) ? (DataStore.getTestScores() || []) : [];
      if (name && name !== 'Visitor') { out.push('Hey ' + name.split(' ')[0] + '!'); out.push(name.split(' ')[0] + ' is here!'); }
      else out.push('Hi! Tap us — we are alive!');
      if (ann.length) out.push(String(ann[0].title).slice(0, 40));
      if (hw.length) out.push((hw[0].subject || 'Homework') + ' due ' + (hw[0].due || hw[0].due_date || 'soon'));
      if (polls.length) out.push('Vote: ' + String(polls[0].question).slice(0, 34));
      if (chat.length) out.push(chat.length + ' chats in the hub!');
      if (scores.length) out.push(scores[0].student_name + ': ' + scores[0].score + '/' + scores[0].max_score + '!');
    } catch (e) { out = ['Hey there!', 'Welcome to 10-A!']; }
    out.push('Drag me & throw me!');
    out.push('Double-tap = dance!');
    return out;
  }
  var QUIPS = ['Yo!', 'Sup?', 'Hehe!', 'Wheee!', 'Nice!', '10-A rocks!', 'Ouch… jk!', 'Again! Again!'];

  /* ---------------- geometry / world ---------------- */
  var GY = 158, CX = 60;                 // ground Y / center X in SVG units
  /* Classic stick-figure proportions, all in one place. Ground 158, hip 112,
     spine top 78, shoulders 84, head centre 60 with r=14. So the head's
     bottom edge lands at 74, only 4 units above the spine top. That short
     neck is what makes it read as a stickman. The old geometry put the head
     centre at 50 and drew an 18.5-unit neck, over half the 34-unit torso,
     which made the figure look like a lollipop rather than a stick figure. */
  var HIP = { x: 60, y: 112 }, CHEST = { x: 60, y: 78 }, HEAD = { x: 60, y: 60 }, HEAD_R = 14;
  var SH = { x: 60, y: 84 };               // shoulder point
  var HAND_L = { x: 43, y: 110 }, HAND_R = { x: 77, y: 110 };
  var FOOT_L = { x: 51, y: GY }, FOOT_R = { x: 69, y: GY };
  var L_UPPER = 24, L_LOWER = 24, A_UPPER = 16, A_LOWER = 17;

  var stage = null, toggleBtn = null, rafId = 0, lastT = 0, hidden = false;
  var figures = {};
  var timers = [];
  var pointer = { x: -9999, y: -9999, active: false };
  var BUBBLE_CD = 22000, HF_CD = 60000, WAVE_CD = 18000;
  /* Wall-climb descent speed, px/s. Slow enough to read as deliberate
     climbing rather than sliding. */
  var C_SPEED = 52;
  var lastHighFive = -HF_CD, lastAmbient = 0, fightCd = 0;
  var floorPad = 10, figW = 88;            // set by measure()
  var MIN_X = 40, MAX_X = 300;

  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }

  /* ---------------- DOM ---------------- */
  function stickSVG(key) {
    var isV = key === 'vinay';
    var ink = isV ? '#a89bff' : '#5eead4';
    var inkDim = isV ? '#6a5ae0' : '#14b8a6';
    var acc = isV ? '#c4b5fd' : '#ffd889';
    var w = isV ? 4.6 : 4.4;
    var s = '';
    s += '<svg class="sm-svg" viewBox="0 0 120 172" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<ellipse class="p-shadow" cx="60" cy="162" rx="15" ry="2.6" fill="#000" opacity=".28"/>';
    s += '<g class="p-squash"><g class="p-all">';
    /* Legs: two straight lines, hip -> knee -> foot, opened into a
       natural stance. The rest pose has always been overridden by the
       IK solver in renderFigure(); the angles here only need to be a
       sane fallback for the very first paint (before any frame runs).
       A classic stick figure stands on straight legs, so the rest pose
       is deliberately near-vertical rather than bowed. */
    s += '<g stroke="' + ink + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" fill="none">';
    s += '<line class="p-thighL" x1="58" y1="112" x2="55" y2="135"/><line class="p-shinL" x1="55" y1="135" x2="53" y2="158"/>';
    s += '<line class="p-thighR" x1="62" y1="112" x2="65" y2="135"/><line class="p-shinR" x1="65" y1="135" x2="67" y2="158"/>';
    s += '</g>';
    /* feet are short bars, not blobs */
    s += '<g stroke="' + ink + '" stroke-width="' + w + '" stroke-linecap="round" fill="none">';
    s += '<line class="p-footL" x1="53" y1="158" x2="48" y2="158"/><line class="p-footR" x1="67" y1="158" x2="72" y2="158"/></g>';
    /* torso — a single clean spine line, classic stick figure proportions */
    s += '<line class="p-spine" x1="60" y1="112" x2="60" y2="78" stroke="' + ink + '" stroke-width="' + (w + 1.2) + '" stroke-linecap="round"/>';
    /* arms: straight lines, shoulder -> elbow -> hand */
    s += '<g stroke="' + ink + '" stroke-width="' + (w - 0.5) + '" stroke-linecap="round" stroke-linejoin="round" fill="none">';
    s += '<line class="p-upArmL" x1="60" y1="84" x2="51" y2="97"/><line class="p-foArmL" x1="51" y1="97" x2="43" y2="110"/>';
    s += '<line class="p-upArmR" x1="60" y1="84" x2="69" y2="97"/><line class="p-foArmR" x1="69" y1="97" x2="77" y2="110"/>';
    s += '</g>';
    /* head — a plain circle. No hair ribbon, no headband, no glasses:
       those details read as a character with a hairstyle rather than a
       universal "stickman", which is what the class asked us to fix. */
    s += '<line class="p-neck" x1="60" y1="78" x2="60" y2="74" stroke="' + ink + '" stroke-width="' + w + '" stroke-linecap="round"/>';
    s += '<g class="p-headG">';
    s += '<circle class="p-head" cx="60" cy="60" r="' + HEAD_R + '" fill="none" stroke="' + ink + '" stroke-width="' + w + '"/>';
    s += '<circle class="p-pupL" cx="54.5" cy="59.5" r="1.6" fill="' + ink + '"/>';
    s += '<circle class="p-pupR" cx="65.5" cy="59.5" r="1.6" fill="' + ink + '"/>';
    s += '<path class="p-mouth" d="M54 68 Q60 71.5 66 68" stroke="' + ink + '" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".85"/>';
    s += '<ellipse class="p-mouthOpen" cx="60" cy="69.5" rx="2.4" ry="3" fill="' + ink + '" opacity="0"/>';
    s += '</g>'; /* headG */
    s += '</g></g></svg>';
    return s;
  }

  function $(fig, cls) { return fig.svg.querySelector('.' + cls); }

  function buildFigure(key, name, x) {
    var el = document.createElement('div');
    el.className = 'stickman sm-' + key;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', name + ' — classic stickman mascot. Drag me!');
    el.innerHTML = '<div class="sm-tag">' + name + '</div>' +
      '<div class="sm-bubble" aria-hidden="true"><span class="sm-bubble-text"></span></div>' +
      stickSVG(key);
    el.style.width = figW + 'px';
    stage.appendChild(el);
    var svg = el.querySelector('svg');
    var F = {
      key: key, name: name, el: el, svg: svg,
      x: x, y: 0, yOff: 0, vx: 0, vy: 0, dir: 1,
      mode: 'idle', t0: 0, dur: 0, onDone: null,
      fromX: x, toX: x, speed: 70, jumpH: 0,
      phase: Math.random() * 6.28, breath: Math.random() * 6.28,
      /* smoothed joints */
      hip: { x: HIP.x, y: HIP.y }, chest: { x: CHEST.x, y: CHEST.y },
      head: { x: HEAD.x, y: HEAD.y, vx: 0, vy: 0 }, headTilt: 0, headTiltT: 0,
      handL: { x: HAND_L.x, y: HAND_L.y }, handR: { x: HAND_R.x, y: HAND_R.y },
      footL: { x: FOOT_L.x, y: FOOT_L.y }, footR: { x: FOOT_R.x, y: FOOT_R.y },
      gaze: { x: 0, y: 0 }, gazeT: { x: 0, y: 0 },
      blinkUntil: 0, nextBlink: performance.now() + rand(1800, 4200),
      nextLook: performance.now() + rand(2500, 6000),
      smile: 0.7, smileT: 0.7, mouthOpen: 0, mouthOpenT: 0,
      squashX: 1, squashY: 1, squashTX: 1, squashTY: 1,
      lean: 0, leanT: 0, crouch: 0, crouchT: 0,
      /* drag physics */
      dragging: false, px: 0, py: 0, lastPX: 0, lastPY: 0, air: 0,
      dangle: { aL: 0, aR: 0, vL: 0, vR: 0, lL: 0, lR: 0, uL: 0, uR: 0 },
      dizzy: 0, lastBubble: -BUBBLE_CD, lastWave: -WAVE_CD, noticedWave: 0,
      stepSide: 1, wasAir: false,
      /* wall climb: stick figures slide down the screen edges by alternately
         gripping with one limb pair while the other pair reaches for the
         next hold. Nothing else on the page does this, so they read as
         alive rather than as decorations sliding on rails. */
      climb: { side: 0, limb: 0, timer: 0, vy: 0, progress: 0, facing: 1 },
      climbCd: performance.now() + rand(14000, 32000)
    };
    F.elP = {
      shadow: svg.querySelector('.p-shadow'), squash: svg.querySelector('.p-squash'),
      thighL: svg.querySelector('.p-thighL'), shinL: svg.querySelector('.p-shinL'),
      thighR: svg.querySelector('.p-thighR'), shinR: svg.querySelector('.p-shinR'),
      footL: svg.querySelector('.p-footL'), footR: svg.querySelector('.p-footR'),
      spine: svg.querySelector('.p-spine'),
      upArmL: svg.querySelector('.p-upArmL'), foArmL: svg.querySelector('.p-foArmL'),
      upArmR: svg.querySelector('.p-upArmR'), foArmR: svg.querySelector('.p-foArmR'),
      handL: svg.querySelector('.p-handL'), handR: svg.querySelector('.p-handR'),
      headG: svg.querySelector('.p-headG'), head: svg.querySelector('.p-head'),
      neck: svg.querySelector('.p-neck'),
      pupL: svg.querySelector('.p-pupL'), pupR: svg.querySelector('.p-pupR'),
      mouth: svg.querySelector('.p-mouth'), mouthOpen: svg.querySelector('.p-mouthOpen')
    };
    bindPointer(F);
    return F;
  }

  /* ---------------- particles (pooled) ---------------- */
  var pool = [];
  function puff(x, y, txt, cls) {
    if (REDUCED && !txt) return;
    var el = pool.pop() || document.createElement('span');
    el.className = 'sm-fx ' + (cls || '');
    el.textContent = txt || '';
    if (!txt) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
    else { el.style.left = x + 'px'; el.style.top = y + 'px'; }
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); if (pool.length < 40) pool.push(el); }, txt ? 1400 : 700);
  }
  function figCenter(F) {
    var r = F.el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.55, w: r.width, h: r.height, top: r.top, bottom: r.bottom };
  }
  function burst(F, n, kind) {
    var c = figCenter(F);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, d = rand(6, 42);
      if (kind === 'confetti') puff(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.7 - 20, '', 'sm-confetti c' + ((Math.random() * 6) | 0));
      else if (kind === 'spark') puff(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, '', 'sm-spark');
      else if (kind === 'dust') puff(c.x + rand(-16, 16), c.bottom - rand(0, 8), '', 'sm-dust');
      else if (kind === 'stars') puff(c.x + rand(-18, 18), c.top + rand(-6, 10), pick(['★', '✦', '✶']), 'sm-emoji');
      else if (kind === 'notes') puff(c.x + rand(-20, 20), c.top - rand(0, 14), pick(['♪', '♫', '♩']), 'sm-emoji');
      else if (kind === 'hearts') puff(c.x + rand(-16, 16), c.top - rand(0, 10), pick(['❤', '💜', '✨']), 'sm-emoji');
      else if (kind === 'impact') puff(c.x, c.y, '', 'sm-impact');
      else if (kind === 'sweat') puff(c.x + rand(-14, 14), c.top - rand(0, 12), pick(['💧', '·']), 'sm-emoji');
      else if (kind === 'zzzbig') puff(c.x + rand(-10, 22), c.top - rand(0, 14), pick(['z', 'Z']), 'sm-zzz');
    }
  }
  function zzz(F) { var c = figCenter(F); puff(c.x + 16, c.top - 4, 'z', 'sm-zzz'); }

  /* ---------------- speech bubble ---------------- */
  function say(F, text, ms) {
    var b = F.el.querySelector('.sm-bubble'), t = F.el.querySelector('.sm-bubble-text');
    if (!b || !t) return;
    F.lastBubble = performance.now();
    b.classList.add('show');
    t.textContent = '';
    clearTimeout(b._t1); clearTimeout(b._t2);
    var i = 0;
    b._t1 = setInterval(function () {
      i++;
      t.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(b._t1);
    }, 22);
    b._t2 = setTimeout(function () { b.classList.remove('show'); }, ms || 2600);
  }
  function canBubble(F) { return performance.now() - F.lastBubble > BUBBLE_CD; }

  /* ---------------- actions ---------------- */
  function startWalk(key, tx) {
    var F = figures[key];
    if (!F || F.mode !== 'idle' || F.dragging || REDUCED) return false;
    if (typeof tx === 'number') F.toX = clamp(tx, MIN_X, MAX_X);
    else {
      var d = rand(110, 320) * (Math.random() < 0.5 ? -1 : 1);
      F.toX = clamp(F.x + d, MIN_X, MAX_X);
      if (Math.abs(F.toX - F.x) < 50) F.toX = clamp(F.x - d, MIN_X, MAX_X);
      if (Math.abs(F.toX - F.x) < 50) return false;
    }
    F.fromX = F.x; F.dir = F.toX > F.x ? 1 : -1;
    F.speed = rand(65, 95);
    F.dur = Math.abs(F.toX - F.x) / F.speed * 1000;
    F.t0 = performance.now(); F.mode = 'walk'; F.onDone = null;
    F.smileT = 0.6;
    return true;
  }
  function walkTo(key, x, cb) {
    var F = figures[key]; if (!F) { if (cb) cb(); return; }
    if (REDUCED) { F.x = clamp(x, MIN_X, MAX_X); if (cb) cb(); return; }
    F.fromX = F.x; F.toX = clamp(x, MIN_X, MAX_X);
    F.dir = F.toX >= F.x ? 1 : -1; F.speed = 85;
    F.dur = Math.max(500, Math.abs(F.toX - F.x) / F.speed * 1000);
    F.t0 = performance.now(); F.mode = 'walk'; F.onDone = cb || null;
  }
  function doJump(F, h, cb) {
    if (!F || F.mode === 'jump' || F.dragging || REDUCED) { if (cb) cb(); return; }
    F.mode = 'jump'; F.t0 = performance.now(); F.dur = 640; F.jumpH = h || 46; F.onDone = cb || null;
    F.crouchT = 1; F.squashTX = 1.12; F.squashTY = 0.86;
    later(function () { if (F.mode === 'jump') { F.crouchT = 0; F.squashTX = 0.94; F.squashTY = 1.1; } }, 130);
  }
  function doWave(F, ms) {
    if (!F || F.dragging || REDUCED) return;
    if (F.mode !== 'idle') return;
    F.mode = 'wave'; F.t0 = performance.now(); F.dur = ms || 1800; F.onDone = null;
    F.smileT = 1; F.lastWave = performance.now();
  }
  function doDance(F, ms) {
    if (!F || F.dragging || REDUCED) return;
    if (F.mode !== 'idle') return;
    F.mode = 'dance'; F.t0 = performance.now(); F.dur = ms || 2600; F.onDone = null;
    F.smileT = 1;
  }
  function doYawn(F) {
    if (!F || F.dragging || REDUCED) return;
    if (F.mode !== 'idle') return;
    F.mode = 'yawn'; F.t0 = performance.now(); F.dur = 3200; F.onDone = null;
    F.mouthOpenT = 1;
  }
  function celebrate(key) {
    var F = figures[key || (Math.random() < 0.5 ? 'vinay' : 'nitin')];
    if (!F || F.dragging) return;
    F.smileT = 1;
    burst(F, 14, 'confetti'); burst(F, 6, 'spark');
    doJump(F, 60, function () { later(function () { doJump(F, 44); }, 120); });
    if (canBubble(F)) say(F, pick(['Yay!', 'Woohoo!', '10-A rocks!', 'Amazing!']), 1800);
  }

  /* ---------------- wall climb ----------------
     The figure walks to a screen edge, turns to face the wall, then
     descends it hand over hand. Grip and reach alternate, so the limbs
     never move as one rigid pair. */
  function startClimb(F) {
    if (!F || REDUCED || F.dragging || F.mode !== 'idle') return false;
    /* pick the nearer edge, so the trip looks purposeful */
    var W = window.innerWidth;
    F.climb.side = (F.x < W / 2) ? -1 : 1;
    F.climb.limb = 0;
    F.climb.timer = 0;
    F.climb.progress = 0;
    F.climb.vy = 0;
    F.climb.facing = F.climb.side;
    walkTo(F.key, F.climb.side < 0 ? MIN_X : MAX_X, function () {
      if (hidden || REDUCED) return;
      /* Climb UP the edge first: yOff is the offset from the standing
         position, so a large negative yOff puts them near the top of the
         viewport. They then descend back to yOff 0 (the ground). */
      F.mode = 'climb';
      F.t0 = performance.now();
      F.yOff = -(F.y - 36);
      F.climb.timer = 0;
      F.climb.phase = 0;
      F.smileT = 0.85;
      F.mouthOpenT = 0.25;
    });
    return true;
  }
  function canClimb(F) {
    return F && F.mode === 'idle' && !F.dragging && !REDUCED &&
           performance.now() > F.climbCd;
  }

  /* ---------------- fall & dizzy recovery ---------------- */
  function maybeHighFive() {
    if (REDUCED || hidden || document.hidden) return;
    var now = performance.now();
    if (now - lastHighFive < HF_CD) return;
    var V = figures.vinay, N = figures.nitin;
    if (!V || !N || V.mode !== 'idle' || N.mode !== 'idle' || V.dragging || N.dragging) return;
    lastHighFive = now;
    var mid = clamp((V.x + N.x) / 2, MIN_X + 60, MAX_X - 60);
    walkTo('vinay', mid - 34, function () {
      walkTo('nitin', mid + 34, function () {
        [V, N].forEach(function (F) { F.mode = 'highfive'; F.t0 = performance.now(); F.dur = 1100; F.onDone = null; F.smileT = 1; });
        later(function () {
          burst(V, 8, 'spark'); burst(N, 8, 'spark');
          var c = figCenter(V);
          puff(c.x + 30, c.y - 60, '', 'sm-ring');
          say(V, 'High five!', 1500); say(N, 'Slap!', 1500);
        }, 420);
      });
    });
  }

  /* click / tap reaction.
     A repeated tap should not repeat the same move — it makes the mascot
     look mechanical. `nextReaction` rotates through a small repertoire and
     remembers what was used last, so consecutive taps always look different. */
  var REACTIONS = ['wave', 'jump', 'point', 'nod', 'shrug', 'dance', 'kick', 'cartwheel', 'backflip', 'stretch'];
  var lastReaction = 0;
  function pickReaction() {
    var i = (lastReaction + 1 + ((Math.random() * (REACTIONS.length - 1)) | 0)) % REACTIONS.length;
    lastReaction = i;
    return REACTIONS[i];
  }
  function react(F) {
    if (!F || hidden) return;
    if (F.dragging) return;
    F.smileT = 1;
    later(function () { if (F.mode === 'idle') F.smileT = 0.7; }, 2500);
    if (!REDUCED && F.mode === 'idle') {
      switch (pickReaction()) {
        case 'wave': burst(F, 5, 'spark'); doWave(F, 1600); break;
        case 'jump': doJump(F, 40); break;
        case 'point': doPoint(F, 1500); break;
        case 'nod': doNod(F, 1200); break;
        case 'dance': doDance(F, 2200); burst(F, 4, 'notes'); break;
        case 'kick': doKick(F, 1100); break;
        case 'cartwheel': doCartwheel(F, 1400); break;
        case 'backflip': doBackflip(F); break;
        case 'stretch': doStretch(F, 2200); break;
        default: doShrug(F, 1400); break;
      }
    }
    if (canBubble(F)) say(F, pick(siteLines()), 2600);
    else burst(F, 3, 'hearts');
  }

  /* ---------------- interaction set ----------------
     Short, purposeful gestures. Each is a timed mode handled in renderFigure,
     so they compose with the normal idle breathing instead of fighting it. */
  function gesture(F, mode, dur, opts) {
    if (!F || F.dragging || REDUCED) return false;
    if (F.mode !== 'idle') return false;
    F.mode = mode; F.t0 = performance.now(); F.dur = dur || 1200;
    F.onDone = null;
    F.gesture = opts || null;
    return true;
  }
  function doPoint(F, ms) { if (gesture(F, 'point', ms)) { F.smileT = 1; F.mouthOpenT = 0.2; } }
  function doNod(F, ms) { if (gesture(F, 'nod', ms)) { F.smileT = 0.9; } }
  function doShrug(F, ms) { if (gesture(F, 'shrug', ms)) { F.smileT = 0.5; F.mouthOpenT = 0.15; } }
  function doCower(F, ms) { if (gesture(F, 'cower', ms)) { F.smileT = 0.2; F.mouthOpenT = 0.8; } }

  /* ---- the activity repertoire --------------------------------------
     These are the "lively" moves the brief asked for: a classic stickman
     fight, a couple of sports beats, and a few bits of business that make
     the pair read as two kids messing about rather than two sprites on a
     loop. Each is a plain timed mode, so it composes with the idle
     breathing instead of fighting it (see renderFigure). */
  function doKick(F, ms) { if (gesture(F, 'kick', ms || 1100)) { F.smileT = 0.9; F.mouthOpenT = 0.3; } }
  function doPunch(F, ms) { if (gesture(F, 'punch', ms || 900)) { F.smileT = 0.85; F.mouthOpenT = 0.35; } }
  function doDuck(F, ms) { if (gesture(F, 'duck', ms || 900)) { F.smileT = 0.8; } }
  function doCartwheel(F, ms) { if (gesture(F, 'cartwheel', ms || 1500)) { F.smileT = 1; } }
  function doPushup(F, ms) { if (gesture(F, 'pushup', ms || 2400)) { F.smileT = 0.7; } }
  function doSleep(F, ms) { if (gesture(F, 'sleep', ms || 4200)) { F.smileT = 0.4; } }
  function doStretch(F, ms) { if (gesture(F, 'stretch', ms || 2400)) { F.smileT = 0.9; F.mouthOpenT = 0.4; } }
  function doCheer(F, ms) { if (gesture(F, 'cheer', ms || 2200)) { F.smileT = 1; F.mouthOpenT = 0.6; burst(F, 8, 'confetti'); } }
  function doBackflip(F) {
    if (!F || F.dragging || REDUCED || F.mode !== 'idle') return;
    F.mode = 'backflip'; F.t0 = performance.now(); F.dur = 1150; F.onDone = null;
    F.smileT = 1; F.mouthOpenT = 0.5; F.spin = 0;
    later(function () { burst(F, 8, 'spark'); if (canBubble(F)) say(F, pick(['Backflip!', 'Watch this!', 'Ta-da!']), 1600); }, 700);
  }

  /* A proper two-person scrap: they square up, trade a couple of quick
     blows, knock each other about, then make up. Choreographed as a
     sequence of timed modes rather than a separate system, so it reuses
     all the existing pose and particle machinery. */
  function startFight() {
    if (REDUCED || hidden || document.hidden) return false;
    var V = figures.vinay, N = figures.nitin;
    if (!V || !N || V.dragging || N.dragging) return false;
    if (V.mode !== 'idle' || N.mode !== 'idle') return false;
    if (performance.now() < fightCd) return false;
    fightCd = performance.now() + 55000;

    var mid = clamp((V.x + N.x) / 2, MIN_X + 70, MAX_X - 70);
    /* shuffle to face-off positions, flipping to look at each other */
    walkTo('vinay', mid - 30, function () {
      walkTo('nitin', mid + 30, function () {
        if (hidden || V.dragging || N.dragging) return;
        V.dir = 1; N.dir = -1;
        V.mode = 'idle'; N.mode = 'idle';
        if (canBubble(V)) say(V, pick(['You and me!', 'Bring it!', 'Round one!']), 1500);
        if (canBubble(N)) say(N, pick(['Ha! Try me.', 'Not scared!', 'Come on then!']), 1500);
        burst(V, 4, 'spark'); burst(N, 4, 'spark');
        later(function () { fightBlow(V, N, 0); }, 900);
      });
    });
    return true;
  }

  /* One exchange of the fight. Alternates attacker, so the whole thing
     reads as a scrap rather than one kid hitting a mannequin. */
  function fightBlow(A, B, n) {
    if (REDUCED || hidden || A.dragging || B.dragging) return;
    var attacker = n % 2 === 0 ? A : B;
    var defender = n % 2 === 0 ? B : A;
    var move = n % 3 === 0 ? 'punch' : (n % 3 === 1 ? 'kick' : 'punch');

    defender.mode = 'duck'; defender.t0 = performance.now(); defender.dur = 620; defender.smileT = 0.6;
    later(function () {
      attacker.mode = move; attacker.t0 = performance.now(); attacker.dur = 620; attacker.smileT = 0.95;
      attacker.mouthOpenT = 0.6;
    }, 120);
    /* impact: a puff where the hit lands, and a recoil on the defender */
    later(function () {
      var c = figCenter(defender);
      puff(c.x + (attacker.x < defender.x ? -14 : 14), c.y - 26, '', 'sm-impact');
      defender.leanT = attacker.x < defender.x ? 0.22 : -0.22;
      burst(defender, 3, 'stars');
      if (canBubble(attacker)) say(attacker, pick(['Pow!', 'Hah!', 'Gotcha!']), 900);
    }, 380);

    if (n < 5) later(function () { fightBlow(A, B, n + 1); }, 820);
    else later(function () {
      /* make up: dust off, shake hands, rub heads */
      [A, B].forEach(function (F) { F.mode = 'idle'; F.leanT = 0; F.mouthOpenT = 0; F.smileT = 0.9; });
      if (canBubble(A)) say(A, pick(['Good one.', 'You alright?', 'Truce!']), 1600);
      if (canBubble(B)) say(B, pick(['Yeah yeah.', 'Nice moves!', 'Haha!']), 1600);
      doWave(A, 1400); later(function () { doWave(B, 1400); }, 300);
      burst(A, 4, 'hearts'); burst(B, 4, 'hearts');
    }, 900);
  }

  /* React to what the user actually did, with a matching gesture. */
  function reactTo(action) {
    var F = figures[Math.random() < 0.5 ? 'vinay' : 'nitin'];
    if (!F || F.dragging || REDUCED) return;
    if (action === 'chat') {
      /* someone spoke — turn, nod, then bounce happily */
      if (gesture(F, 'point', 1100)) F.smileT = 1;
      later(function () { if (!F.dragging) doJump(F, 26); }, 1150);
    } else if (action === 'poll') {
      /* counting votes: a decisive nod then a small hop */
      if (gesture(F, 'nod', 1000)) F.smileT = 1;
      later(function () { if (!F.dragging) doJump(F, 22); }, 1050);
    } else if (action === 'ai') {
      /* thinking it over: shrug, then a confident point */
      if (gesture(F, 'shrug', 1100)) {}
      later(function () { if (!F.dragging) doPoint(F, 1300); }, 1150);
    } else if (action === 'upload') {
      burst(F, 6, 'confetti');
      if (gesture(F, 'nod', 1200)) F.smileT = 1;
    } else if (action === 'error') {
      doCower(F, 1100);
      if (canBubble(F) && Math.random() < 0.7) say(F, pick(['Oops!', 'Try again?', 'Uh oh…']), 1600);
    }
  }

  /* Arrival greeting — called once per session by main.js. */
  function greet(name) {
    if (REDUCED) return;
    var F = figures.vinay;
    if (!F || F.dragging) return;
    doWave(F, 2200);
    first = name ? String(name).split(' ')[0] : '';
    if (canBubble(F)) say(F, first ? ('Hey ' + first + '!') : 'Welcome back!', 2200);
    burst(F, 6, 'spark');
    later(function () {
      var G = figures.nitin;
      if (G && !G.dragging && G.mode === 'idle') doWave(G, 1800);
    }, 900);
  }
  var first = '';

  /* Look where the reader is scrolling — a subtle, continuous cue that the
     mascots are watching the same page you are. */
  function interest(dir) {
    Object.keys(figures).forEach(function (k) {
      var F = figures[k];
      if (!F || F.dragging || REDUCED) return;
      F.gazeT.y = clamp(dir, -0.5, 0.5);
      F.headTiltT = clamp(dir * 0.12, -0.16, 0.16);
    });
  }

  /* ---------------- pointer: click + drag & throw ---------------- */
  function bindPointer(F) {
    var moved = 0, downAt = 0, downX = 0, downY = 0, lastTap = 0;
    F.el.addEventListener('pointerdown', function (e) {
      if (hidden || REDUCED) return;
      moved = 0; downAt = performance.now(); downX = e.clientX; downY = e.clientY;
      F.lastPX = e.clientX; F.lastPY = e.clientY; F.vx = 0; F.vy = 0;
      try { F.el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    F.el.addEventListener('pointermove', function (e) {
      if (downAt === 0) return;
      var dx = e.clientX - downX, dy = e.clientY - downY;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (!F.dragging && moved > 9) {
        F.dragging = true; F.mode = 'drag'; F.onDone = null;
        F.mouthOpenT = 1; F.smileT = 0.2;
        F.el.classList.add('grabbed');
      }
      if (F.dragging) {
        F.vx = e.clientX - F.lastPX; F.vy = e.clientY - F.lastPY;
        F.lastPX = e.clientX; F.lastPY = e.clientY;
        F.x = clamp(F.x + F.vx, 8, window.innerWidth - 8);
        F.yOff = Math.min(0, F.yOff + F.vy);
        F.spin = 0; F.spinV = 0;
        /* dangle physics driven by acceleration */
        F.dangle.vL += (-F.dangle.aL * 90 - F.vx * 6) * 0.016;
        F.dangle.vR += (-F.dangle.aR * 90 - F.vx * 6) * 0.016;
      }
    });
    function up(e) {
      if (downAt === 0) return;
      downAt = 0;
      F.el.classList.remove('grabbed');
      if (F.dragging) {
        F.dragging = false;
        F.mouthOpenT = 0;
        /* throw! velocity in px/frame -> px/s */
        F.vx = clamp(F.vx * 60, -1400, 1400);
        F.vy = clamp(F.vy * 60, -1600, 400);
        if (Math.abs(F.vx) < 60 && Math.abs(F.vy) < 60) { F.mode = 'idle'; F.yOff = 0; }
        else {
          F.mode = 'thrown'; F.dizzy = 1;
          /* tumble proportional to the sideways part of the throw */
          F.spin = 0; F.spinV = clamp(F.vx / 520, -6, 6);
          burst(F, 5, 'stars');
        }
        F.t0 = performance.now();
      } else if (moved <= 9) {
        var now = performance.now();
        if (now - lastTap < 320) { lastTap = 0; doDance(F, 2400); burst(F, 6, 'notes'); if (canBubble(F)) say(F, pick(['Dance break!', 'Groove!', '♪ ♪']), 1600); }
        else { lastTap = now; later(function () { if (lastTap && performance.now() - lastTap >= 300) { lastTap = 0; react(F); } }, 330); }
      }
      moved = 0;
    }
    F.el.addEventListener('pointerup', up);
    F.el.addEventListener('pointercancel', up);
  }

  /* ---------------- scheduler ---------------- */
  function schedule() {
    timers.push(setTimeout(function () {
      if (stage) {
        if (!hidden && !document.hidden && !REDUCED) {
          var r = Math.random();
          var V = figures.vinay, N = figures.nitin;
          var idleV = V && V.mode === 'idle' && !V.dragging;
          var idleN = N && N.mode === 'idle' && !N.dragging;
          /* helper: whichever of the two is free to do something */
          function freeOne() {
            if (idleV && idleN) return Math.random() < 0.5 ? V : N;
            return idleV ? V : (idleN ? N : null);
          }
          if (r < 0.26) { /* walk one of them */
            var k = Math.random() < 0.5 ? 'vinay' : 'nitin';
            if (!startWalk(k)) startWalk(k === 'vinay' ? 'nitin' : 'vinay');
          } else if (r < 0.34 && idleV && idleN) {
            /* a full two-person scrap, the headline activity */
            if (!startFight()) { var kf = freeOne(); if (kf) doPunch(kf, 900); }
          } else if (r < 0.41 && ((V && canClimb(V)) || (N && canClimb(N)))) {
            /* occasionally send one down a screen edge */
            var CF = (V && canClimb(V)) ? V : N;
            if (CF) startClimb(CF); else startWalk('vinay');
          } else if (r < 0.47 && freeOne()) {
            var w1 = freeOne();
            doWave(w1, 1700);
            if (Math.random() < 0.4 && canBubble(w1)) say(w1, pick(QUIPS), 1500);
          } else if (r < 0.54 && freeOne()) {
            var d1 = freeOne();
            doDance(d1, 2400); burst(d1, 5, 'notes');
          } else if (r < 0.60 && freeOne()) {
            doJump(freeOne(), rand(36, 58));
          } else if (r < 0.65 && freeOne()) {
            doBackflip(freeOne());
          } else if (r < 0.70 && freeOne()) {
            /* sports beats */
            var s1 = freeOne();
            if (Math.random() < 0.5) doKick(s1, 1100);
            else doCheer(s1, 2200);
          } else if (r < 0.75 && freeOne()) {
            doCartwheel(freeOne(), 1500);
          } else if (r < 0.80 && freeOne()) {
            doStretch(freeOne(), 2400);
          } else if (r < 0.84 && freeOne()) {
            var p1 = freeOne();
            doPushup(p1, 2400);
            burst(p1, 1, 'sweat');
          } else if (r < 0.88 && freeOne()) {
            var z1 = freeOne();
            doSleep(z1, 4200);
            zzz(z1);
          } else if (r < 0.94) { maybeHighFive(); }
          else if (freeOne()) { doYawn(freeOne()); }
          /* rare ambient chatter */
          var now = performance.now();
          if (now - lastAmbient > 75000 && Math.random() < 0.35) {
            lastAmbient = now;
            var FA = Math.random() < 0.5 ? V : N;
            if (FA && FA.mode === 'idle' && canBubble(FA)) say(FA, pick(siteLines()), 2400);
          }
        }
        schedule();
      }
    }, rand(7000, 15000)));
  }

  /* ---------------- per-frame update ---------------- */
  function updateFigure(F, now, dt, t) {
    var p, k;
    /* --- mode state --- */
    if (F.mode === 'walk') {
      p = clamp((now - F.t0) / F.dur, 0, 1);
      var e = easeInOut(p);
      F.x = F.fromX + (F.toX - F.fromX) * e;
      F.dir = F.toX >= F.fromX ? 1 : -1;
      F.phase += dt * (F.speed / 26) * Math.PI;   /* stride-linked cadence */
      F.leanT = F.dir * 0.09;
      /* footstep dust on plant */
      var s = Math.sin(F.phase);
      var side = s > 0 ? 1 : -1;
      if (side !== F.stepSide) { F.stepSide = side; burst(F, 2, 'dust'); }
      if (p >= 1) { var cb = F.onDone; F.mode = 'idle'; F.onDone = null; F.leanT = 0; if (cb) cb(); }
    } else if (F.mode === 'jump') {
      p = clamp((now - F.t0) / F.dur, 0, 1);
      if (p < 0.2) { F.yOff = -6 * Math.sin(p / 0.2 * Math.PI / 2); }        /* crouch dip */
      else { var jp = (p - 0.2) / 0.8; F.yOff = -F.jumpH * 4 * jp * (1 - jp); } /* parabola */
      if (p > 0.85) { F.squashTX = 1; F.squashTY = 1; }
      if (p >= 1) {
        F.mode = 'idle'; F.yOff = 0; F.onDone && F.onDone(); F.onDone = null;
        F.squashTX = 1.14; F.squashTY = 0.84;                                  /* land squash */
        burst(F, 5, 'dust');
        later(function () { F.squashTX = 1; F.squashTY = 1; }, 140);
      }
    } else if (F.mode === 'thrown') {
      /* Projectile motion with air drag, a bounce, then a skid to rest.
         spin tracks horizontal velocity so a hard sideways throw tumbles
         and a straight-up toss stays upright, which is what actually
         happens to a thrown object. */
      F.vy += 2600 * dt;
      F.x += F.vx * dt;
      F.yOff += F.vy * dt;
      F.vx *= Math.exp(-0.4 * dt);
      F.spin = (F.spin || 0) + (F.spinV || 0) * dt;
      F.spinV = (F.spinV || 0) * Math.exp(-1.2 * dt);
      var W = window.innerWidth;
      if (F.x < 20) { F.x = 20; F.vx = Math.abs(F.vx) * 0.55; F.spinV *= -0.6; }
      if (F.x > W - 20) { F.x = W - 20; F.vx = -Math.abs(F.vx) * 0.55; F.spinV *= -0.6; }
      if (F.yOff >= 0) {
        F.yOff = 0;
        if (Math.abs(F.vy) > 260) {
          /* bounce: keep some horizontal speed and scrub it off fast */
          F.vy = -F.vy * 0.42;
          F.vx *= 0.62;
          F.spinV *= 0.45;
          burst(F, 4, 'dust');
          F.squashTX = 1.16; F.squashTY = 0.82;
          later(function () { F.squashTX = 1; F.squashTY = 1; }, 130);
        } else {
          F.vy = 0;
          F.vx *= Math.exp(-7 * dt);
          F.spinV *= Math.exp(-6 * dt);
          if (Math.abs(F.vx) < 25 && Math.abs(F.spinV) < 0.25) {
            F.mode = 'idle'; F.yOff = 0; F.dizzy = Math.max(F.dizzy, 0.7);
            /* lie still a beat, then spring upright like a recovering acrobat */
            F.spin = 0; F.spinV = 0;
            burst(F, 5, 'stars');
            F.squashTX = 1.1; F.squashTY = 0.9;
            later(function () {
              F.squashTX = 1; F.squashTY = 1;
              if (!REDUCED && Math.random() < 0.6) doJump(F, 26);
            }, 320);
            if (canBubble(F)) say(F, pick(['Whoa!', 'Wheee!', 'Again!', "I'm ok!"]), 1600);
          }
        }
      }
      F.phase += dt * 14;
      F.dizzy = Math.max(F.dizzy, 0.4);
    } else if (F.mode === 'wave' || F.mode === 'dance' || F.mode === 'yawn' || F.mode === 'highfive' ||
                 F.mode === 'point' || F.mode === 'nod' || F.mode === 'shrug' || F.mode === 'cower' ||
                 F.mode === 'kick' || F.mode === 'punch' || F.mode === 'duck' || F.mode === 'cartwheel' ||
                 F.mode === 'pushup' || F.mode === 'sleep' || F.mode === 'stretch' || F.mode === 'cheer' ||
                 F.mode === 'backflip') {
      p = clamp((now - F.t0) / F.dur, 0, 1);
      if (F.mode === 'dance' && Math.random() < dt * 3) burst(F, 1, 'notes');
      if (F.mode === 'yawn' && Math.random() < dt * 1.4) zzz(F);
      if (F.mode === 'highfive') F.yOff = -14 * 4 * p * (1 - p);
      if (F.mode === 'backflip' && p > 0.1 && p < 0.9) F.yOff = -46 * Math.sin((p - 0.1) / 0.8 * Math.PI);
      if (p >= 1) {
        F.mode = 'idle'; F.yOff = 0; F.mouthOpenT = 0; F.extraSpin = 0;
        if (F.smileT > 0.8) F.smileT = 0.7;
      }
    } else if (F.mode === 'drag') {
      /* dangle pendulum */
      var D = F.dangle;
      D.vL += (-D.aL * 120 - D.vL * 3.2) * dt; D.aL += D.vL * dt;
      D.vR += (-D.aR * 120 - D.vR * 3.2) * dt; D.aR += D.vR * dt;
      D.uL += (-D.lL * 100 - D.uL * 3.2) * dt; D.lL += D.uL * dt;
      D.uR += (-D.lR * 100 - D.uR * 3.2) * dt; D.lR += D.uR * dt;
    } else if (F.mode === 'climb') {
      /* Descend the edge hand over hand. Each limb pair alternates
         between "gripping" (planted) and "reaching" (moving to the next
         hold), so the pose keeps changing instead of sliding rigidly. */
      var C = F.climb;
      C.timer += dt;
      if (C.phase === undefined) C.phase = 0;
      /* one full grip/reach cycle per ~0.9s */
      var cycle = 0.9;
      var step = Math.floor(C.timer / cycle);
      if (step !== C.limb) {
        C.limb = step;
        if (Math.random() < 0.7) burst(F, 1, 'dust');   /* grip scuff */
      }
      C.progress = (C.timer % cycle) / cycle;
      /* climb at a steady, believable pace; yOff runs from -(height) to 0 */
      F.yOff = Math.min(0, F.yOff + C_SPEED * dt);
      F.x = F.climb.side < 0 ? MIN_X + 12 : MAX_X - 12;
      F.dir = F.climb.side;
      F.phase += dt * 2.2;
      if (F.yOff >= -0.5) {
        F.yOff = 0;
        F.mode = 'idle';
        F.climbCd = performance.now() + rand(30000, 60000);
        burst(F, 3, 'dust');
        if (canBubble(F) && Math.random() < 0.5) say(F, pick(['Made it down!', 'Phew!', 'Easy!']), 1500);
      }
    } else { F.leanT *= 0.9; }

    F.dizzy = Math.max(0, F.dizzy - dt * 0.5);

    /* --- blink --- */
    if (now >= F.nextBlink) { F.blinkUntil = now + 130; F.nextBlink = now + rand(2200, 5200); }
    var blinking = now < F.blinkUntil || F.mode === 'yawn';

    /* --- gaze: cursor tracking + wander --- */
    var c = figCenter(F);
    if (pointer.active && !IS_TOUCH) {
      var gx = clamp((pointer.x - c.x) / 160, -1, 1), gy = clamp((pointer.y - c.y) / 160, -1, 1);
      F.gazeT.x = gx; F.gazeT.y = gy * 0.7;
      /* noticed you! wave when cursor hovers close */
      var near = Math.abs(pointer.x - c.x) < 90 && Math.abs(pointer.y - c.y) < 130;
      if (near && F.mode === 'idle' && now - F.noticedWave > 25000 && now - F.lastWave > WAVE_CD) {
        F.noticedWave = now; doWave(F, 1500);
        if (canBubble(F) && Math.random() < 0.5) say(F, pick(['Hi!!', 'Hey you!', 'I see you!', 'Hello!']), 1500);
      }
    } else if (now >= F.nextLook) {
      F.nextLook = now + rand(2500, 6000);
      F.gazeT.x = rand(-0.7, 0.7); F.gazeT.y = rand(-0.4, 0.4);
    }

    /* --- smooth values --- */
    var kd = dampRate(10, dt), ks = dampRate(16, dt), kh = dampRate(7, dt);
    F.gaze.x = lerp(F.gaze.x, F.gazeT.x, kd); F.gaze.y = lerp(F.gaze.y, F.gazeT.y, kd);
    F.smile = lerp(F.smile, F.smileT, kd);
    F.mouthOpen = lerp(F.mouthOpen, F.mouthOpenT, dampRate(8, dt));
    F.squashX = lerp(F.squashX, F.squashTX, ks); F.squashY = lerp(F.squashY, F.squashTY, ks);
    F.lean = lerp(F.lean, F.leanT, kd);
    F.crouch = lerp(F.crouch, F.crouchT, dampRate(14, dt));
    F.headTilt = lerp(F.headTilt, F.headTiltT, kd);

    renderFigure(F, now, dt, t, blinking);
  }

  function renderFigure(F, now, dt, t, blinking) {
    var E = F.elP;
    /* targets for this frame */
    var hip = { x: HIP.x, y: HIP.y }, chest = { x: CHEST.x, y: CHEST.y };
    var hL = { x: HAND_L.x, y: HAND_L.y }, hR = { x: HAND_R.x, y: HAND_R.y };
    var fL = { x: FOOT_L.x, y: FOOT_L.y }, fR = { x: FOOT_R.x, y: FOOT_R.y };
    var headY = HEAD.y, headX = HEAD.x, tilt = 0;

    var br = Math.sin(t * (F.mode === 'dance' ? 9 : 1.7) + F.breath);   /* breath */
    var sway = Math.sin(t * 0.7 + F.breath * 2) * 1.6;                    /* weight sway */

    if (F.mode === 'walk') {
      var stride = 13, lift = 9;
      var pL = F.phase, pR = F.phase + Math.PI;
      fL.x = FOOT_L.x + Math.sin(pL) * stride; fL.y = GY - Math.max(0, Math.cos(pL)) * lift;
      fR.x = FOOT_R.x + Math.sin(pR) * stride; fR.y = GY - Math.max(0, Math.cos(pR)) * lift;
      var bob = Math.abs(Math.sin(F.phase)) * 2.6;
      hip.y -= bob; chest.y -= bob * 1.25; headY -= bob * 1.4;
      hip.x += Math.sin(F.phase) * 1.5 + F.lean * 30;
      chest.x += F.lean * 46; headX += F.lean * 52;
      hL.x = HAND_L.x - Math.sin(pL) * 10; hL.y = HAND_L.y - Math.max(0, -Math.cos(pL)) * 3;
      hR.x = HAND_R.x - Math.sin(pR) * 10; hR.y = HAND_R.y - Math.max(0, -Math.cos(pR)) * 3;
      chest.y -= 0.8;
    } else if (F.mode === 'jump') {
      var air = clamp(-F.yOff / 50, 0, 1);
      fL.y = GY - 16 * air; fL.x = FOOT_L.x - 4 * air;
      fR.y = GY - 16 * air; fR.x = FOOT_R.x + 4 * air;
      hL.x = 38; hL.y = 58 - 6 * air; hR.x = 82; hR.y = 58 - 6 * air;
      headY -= 2 * air;
    } else if (F.mode === 'thrown') {
      var fl = Math.sin(t * 22);
      hL.x = 36 + fl * 5; hL.y = 66 + fl * 4; hR.x = 84 - fl * 5; hR.y = 66 - fl * 4;
      fL.y = GY - 8 + fl * 3; fR.y = GY - 8 - fl * 3;
      tilt = clamp(F.vx / 1400, -1, 1) * 0.35;
      F.mouthOpenT = 1;
    } else if (F.mode === 'drag') {
      var D = F.dangle;
      hL.x = SH.x - 14 + D.aL * 22; hL.y = 108 + Math.abs(D.aL) * -8 + 6;
      hR.x = SH.x + 14 + D.aR * 22; hR.y = 108 + Math.abs(D.aR) * -8 + 6;
      fL.x = 54 + D.lL * 20; fL.y = GY - 4; fR.x = 66 + D.lR * 20; fR.y = GY - 4;
      headY += 3; tilt = clamp((F.lastPX - (figCenter(F).x)) / 200, -0.4, 0.4);
    } else if (F.mode === 'climb') {
      /* Hug the wall with the body upright. Limbs alternate between a
         planted grip and an upward reach, so the pose is never static. */
      var C = F.climb, sgn = C.side, alt = C.limb % 2;
      hip.x = 60 + sgn * 2; chest.x = 60 + sgn * 3; headX = 60 + sgn * 4;
      chest.y = 78 + Math.sin(t * 4) * 1.2;
      /* feet pressed flat to the wall at two different heights */
      fL.x = 60 + sgn * 9; fR.x = 60 + sgn * 10;
      fL.y = GY - 30 + (alt ? 5 : 0);
      fR.y = GY - 24 - (alt ? 5 : 0);
      /* hands grip / reach alternately above the head */
      hL.x = 60 + sgn * 11 - 4; hR.x = 60 + sgn * 11 + 4;
      hL.y = 40 + (alt ? 10 : 0);
      hR.y = 34 - (alt ? 10 : 0);
      tilt = sgn * 0.05;
    } else if (F.mode === 'wave') {
      var wag = Math.sin(t * 16) * 7;
      hR.x = 86 + wag * 0.5; hR.y = 50 + Math.abs(wag) * 0.3;
      hL.x = HAND_L.x - 2; hL.y = HAND_L.y + 2;
      tilt = 0.14; headY += 1;
      hip.y += Math.abs(Math.sin(t * 8)) * -1.5;
    } else if (F.mode === 'dance') {
      var b = Math.abs(Math.sin(t * 10));
      hip.y -= b * 7; chest.y -= b * 8; headY -= b * 9;
      hip.x += Math.sin(t * 5) * 5; chest.x += Math.sin(t * 5 + 0.6) * 6;
      var up = Math.sin(t * 10) > 0;
      hL.x = up ? 34 : 52; hL.y = up ? 56 : 104;
      hR.x = up ? 68 : 86; hR.y = up ? 104 : 56;
      fL.y = GY - (up ? 6 : 0); fR.y = GY - (up ? 0 : 6);
      tilt = Math.sin(t * 5) * 0.16;
    } else if (F.mode === 'highfive') {
      var hf = Math.sin(clamp((now - F.t0) / F.dur, 0, 1) * Math.PI);
      if (F.key === 'vinay') { hR.x = 92; hR.y = 62 - 10 * hf; hL.x = 42; hL.y = 112; }
      else { hL.x = 28; hL.y = 62 - 10 * hf; hR.x = 78; hR.y = 112; }
      headY -= 3 * hf; tilt = F.key === 'vinay' ? -0.1 * hf : 0.1 * hf;
    } else if (F.mode === 'point') {
      /* swing the right arm out to indicate something in front of them */
      var pp = Math.sin(clamp((now - F.t0) / F.dur, 0, 1) * Math.PI);
      hR.x = 88 + 10 * pp; hR.y = 74 - 14 * pp;
      hL.x = HAND_L.x - 2; hL.y = HAND_L.y + 1;
      tilt = 0.1 * pp + F.dir * 0.04;
      headX += F.dir * 6 * pp;
    } else if (F.mode === 'nod') {
      /* agree: two crisp dips of the head, no limb movement */
      var np = (now - F.t0) / F.dur;
      var dips = Math.sin(np * Math.PI * 4);
      headY += 4 * Math.max(0, dips);
      tilt = 0.05 * dips;
      hL.y += 1; hR.y += 1;
    } else if (F.mode === 'shrug') {
      /* palms up, shoulders lifted — the universal "no idea" */
      var sp = Math.sin(clamp((now - F.t0) / F.dur, 0, 1) * Math.PI);
      hL.x = 34 - 8 * sp; hL.y = 96 - 16 * sp;
      hR.x = 86 + 8 * sp; hR.y = 96 - 16 * sp;
      chest.y -= 3 * sp; headY -= 1 * sp;
      tilt = -0.05 * sp;
    } else if (F.mode === 'cower') {
      /* startled: recoil, arms up defensively */
      var cp = Math.sin(clamp((now - F.t0) / F.dur, 0, 1) * Math.PI);
      hip.y += 5 * cp; chest.y += 6 * cp; headY += 5 * cp;
      hL.x = 44 - 6 * cp; hL.y = 58 + 4 * cp;
      hR.x = 76 + 6 * cp; hR.y = 58 + 4 * cp;
      fL.x -= 3 * cp; fR.x += 3 * cp;
      tilt = -0.1 * cp;
    } else if (F.mode === 'kick') {
      /* a sport/martial-arts kick: plant one leg, whip the other out
         front, arms counterbalance. Reads clearly even at mascot size. */
      var kp = clamp((now - F.t0) / F.dur, 0, 1);
      var snap = Math.sin(kp * Math.PI);                    /* out and back */
      var kickLeg = F.dir > 0 ? 'R' : 'L';
      if (kickLeg === 'R') { fR.x = FOOT_R.x + 26 * snap; fR.y = GY - 34 * snap; fL.x = FOOT_L.x - 4 * snap; }
      else { fL.x = FOOT_L.x - 26 * snap; fL.y = GY - 34 * snap; fR.x = FOOT_R.x + 4 * snap; }
      hL.x = 34 + 8 * snap; hL.y = 74 + 6 * snap;
      hR.x = 86 - 10 * snap; hR.y = 96 - 4 * snap;
      hip.y -= 3 * snap; chest.y -= 2 * snap;
      tilt = 0.16 * snap; headY += 2 * snap;
    } else if (F.mode === 'punch') {
      /* fast jab straight ahead, shoulder turned into it, rear foot braced */
      var jp2 = clamp((now - F.t0) / F.dur, 0, 1);
      var jext = Math.sin(jp2 * Math.PI);
      var lead = F.dir > 0 ? 'R' : 'L';
      if (lead === 'R') { hR.x = 78 + 30 * jext; hR.y = 74 - 6 * jext; hL.x = 40 - 2 * jext; hL.y = 84 + 4 * jext; }
      else { hL.x = 42 - 30 * jext; hL.y = 74 - 6 * jext; hR.x = 80 + 2 * jext; hR.y = 84 + 4 * jext; }
      chest.x += (F.dir > 0 ? 1 : -1) * 5 * jext;
      hip.x += (F.dir > 0 ? 1 : -1) * 3 * jext;
      fR.x += (F.dir > 0 ? 0 : 5) * jext; fL.x -= (F.dir > 0 ? 5 : 0) * jext;
      tilt = 0.12 * jext;
    } else if (F.mode === 'duck') {
      /* sink under a swing, arms up guarding the face */
      var dp = clamp((now - F.t0) / F.dur, 0, 1);
      var duck = Math.sin(dp * Math.PI);
      hip.y += 16 * duck; chest.y += 20 * duck; headY += 24 * duck;
      hL.x = 44 + 6 * duck; hL.y = 62 + 8 * duck;
      hR.x = 76 - 6 * duck; hR.y = 62 + 8 * duck;
      fL.x -= 4 * duck; fR.x += 4 * duck;
      tilt = 0.06 * duck;
    } else if (F.mode === 'cartwheel') {
      /* sideways roll: the whole body pivots about the hip while the
         limbs stay extended like spokes */
      var cw = clamp((now - F.t0) / F.dur, 0, 1);
      var spin = cw * Math.PI * 2;
      F.extraSpin = spin;                        /* consumed below */
      hip.y -= 34 * Math.sin(cw * Math.PI);
      hL.x = 60 - 30 * Math.cos(spin); hL.y = 84 + 30 * Math.sin(spin);
      hR.x = 60 + 30 * Math.cos(spin); hR.y = 84 + 30 * Math.sin(spin);
      fL.x = 60 - 28 * Math.cos(spin); fL.y = 112 + 28 * Math.sin(spin);
      fR.x = 60 + 28 * Math.cos(spin); fR.y = 112 + 28 * Math.sin(spin);
      tilt = Math.sin(spin) * 0.3;
    } else if (F.mode === 'pushup') {
      /* plank down to the floor and back, arms bending in the middle */
      var pu = clamp((now - F.t0) / F.dur, 0, 1);
      var wave = (1 - Math.cos(pu * Math.PI * 4)) / 2;   /* four reps */
      var drop = wave;
      hip.x = 60; hip.y = 112 - 46 + 18 * drop; chest.y = 78 - 30 + 16 * drop;
      headX = 60; headY = 60 - 24 + 14 * drop;
      fL.y = GY; fR.y = GY; fL.x = 56; fR.x = 64;        /* feet planted */
      hL.x = 44; hL.y = GY - 24 + 14 * drop;
      hR.x = 76; hR.y = GY - 24 + 14 * drop;
      tilt = -0.5;
      if (F.smileT < 0.6) F.smileT = 0.7;
    } else if (F.mode === 'sleep') {
      /* curled up on the floor, slow breathing, z's drifting up */
      var sl = Math.sin(t * 1.2) * 1.4;
      hip.x = 58; hip.y = 132 + sl; chest.x = 50; chest.y = 136 + sl;
      headX = 40; headY = 140 + sl;
      hL.x = 48; hL.y = 142; hR.x = 56; hR.y = 146;
      fL.x = 70; fL.y = GY; fR.x = 76; fR.y = GY - 2;
      tilt = -0.9;
      if (Math.random() < dt * 1.1) burst(F, 1, 'zzzbig');
    } else if (F.mode === 'stretch') {
      /* yawn-stretch: reach both arms overhead, rise onto the toes */
      var st = Math.sin(clamp((now - F.t0) / F.dur, 0, 1) * Math.PI);
      hL.x = 56 - 6 * st; hL.y = 110 - 62 * st;
      hR.x = 64 + 6 * st; hR.y = 110 - 62 * st;
      hip.y -= 7 * st; chest.y -= 9 * st; headY -= 10 * st;
      fL.y = GY - 5 * st; fR.y = GY - 5 * st;
      tilt = -0.05 * st;
    } else if (F.mode === 'cheer') {
      /* both arms punched up, bouncing on the spot */
      var ch = Math.abs(Math.sin(t * 7));
      hip.y -= 4 + ch * 9; chest.y -= 5 + ch * 10; headY -= 6 + ch * 11;
      hL.x = 42; hL.y = 62 - ch * 26;
      hR.x = 78; hR.y = 62 - ch * 26;
      fL.y = GY - (ch > 0.5 ? 7 : 0); fR.y = GY - (ch > 0.5 ? 0 : 7);
      tilt = Math.sin(t * 7) * 0.07;
    } else if (F.mode === 'backflip') {
      /* crouch, launch, tuck, rotate a full turn, land */
      var bp = clamp((now - F.t0) / F.dur, 0, 1);
      var rot;
      if (bp < 0.15) { rot = 0; hip.y += 10 * (bp / 0.15); chest.y += 8 * (bp / 0.15); }
      else if (bp > 0.85) { rot = 0; hip.y += 10 * ((1 - bp) / 0.15); chest.y += 8 * ((1 - bp) / 0.15); }
      else {
        var fp = (bp - 0.15) / 0.7;
        rot = fp * Math.PI * 2;
        F.extraSpin = rot;
        /* tuck: limbs drawn in tight while airborne */
        var tuck = Math.sin(fp * Math.PI);
        hL.x = 60 - 16 * tuck; hL.y = 84 + 6 * tuck;
        hR.x = 60 + 16 * tuck; hR.y = 84 + 6 * tuck;
        fL.x = 60 - 12 * tuck; fL.y = 112 + 10 * tuck;
        fR.x = 60 + 12 * tuck; fR.y = 112 + 10 * tuck;
        hip.y -= 40 * tuck;
      }
      if (bp >= 1) burst(F, 6, 'dust');
    } else if (F.mode === 'yawn') {
      hip.y += 4; chest.y += 4; headY += 9; tilt = 0.12;
      hL.y += 7; hR.y += 7; fL.x -= 2; fR.x += 2;
    } else { /* idle — breathe, sway, micro-life */
      hip.x += sway; chest.x += sway * 1.2 + F.gaze.x * 2; headX += sway * 1.3 + F.gaze.x * 4.5;
      var b2 = (br * 0.5 + 0.5);
      chest.y -= b2 * 1.8; headY -= b2 * 2.2 + F.gaze.y * 2;
      hL.x += sway * 0.8; hR.x += sway * 0.8;
      hL.y += Math.sin(t * 1.7 + F.breath) * 1.2; hR.y += Math.sin(t * 1.7 + F.breath + 1) * 1.2;
      tilt = F.gaze.x * 0.08;
    }

    /* crouch (jump anticipation) */
    if (F.crouch > 0.01) {
      hip.y += 9 * F.crouch; chest.y += 7 * F.crouch; headY += 6 * F.crouch;
      hL.y -= 4 * F.crouch; hR.y -= 4 * F.crouch;
    }
    /* dizzy wobble */
    if (F.dizzy > 0.01) { tilt += Math.sin(t * 18) * 0.2 * F.dizzy; headX += Math.sin(t * 15) * 3 * F.dizzy; }

    /* smooth joints toward targets */
    var j = dampRate(F.mode === 'walk' || F.mode === 'dance' || F.mode === 'thrown' ? 26 : (F.mode === 'climb' ? 18 : 11), dt);
    F.hip.x = lerp(F.hip.x, hip.x, j); F.hip.y = lerp(F.hip.y, hip.y, j);
    F.chest.x = lerp(F.chest.x, chest.x, j); F.chest.y = lerp(F.chest.y, chest.y, j);
    F.handL.x = lerp(F.handL.x, hL.x, j); F.handL.y = lerp(F.handL.y, hL.y, j);
    F.handR.x = lerp(F.handR.x, hR.x, j); F.handR.y = lerp(F.handR.y, hR.y, j);
    F.footL.x = lerp(F.footL.x, fL.x, j); F.footL.y = lerp(F.footL.y, fL.y, j);
    F.footR.x = lerp(F.footR.x, fR.x, j); F.footR.y = lerp(F.footR.y, fR.y, j);
    F.headTiltT = tilt;
    /* springy head (lag = life) */
    var hx = F.head, k2 = 170;
    hx.vx += ((headX - hx.x) * k2) * dt; hx.vx *= Math.exp(-11 * dt); hx.x += hx.vx * dt;
    hx.vy += ((headY - hx.y) * k2) * dt; hx.vy *= Math.exp(-11 * dt); hx.y += hx.vy * dt;

    var shX = F.chest.x, shY = F.chest.y + 6;   /* shoulder follows chest */
    /* IK solves. The bend sign must push each joint AWAY from the body
       centreline: positive bend bows the joint toward -x, negative toward +x.
       Left limbs therefore bend positive and right limbs negative. Getting
       these signs backwards collapses both knees onto the centreline and the
       figure reads as if its legs are folded. */
    var kL = solveIK(F.hip.x - 2, F.hip.y, F.footL.x, F.footL.y, L_UPPER, L_LOWER, 0.34);
    var kR = solveIK(F.hip.x + 2, F.hip.y, F.footR.x, F.footR.y, L_UPPER, L_LOWER, -0.34);
    var eL = solveIK(shX - 2, shY, F.handL.x, F.handL.y, A_UPPER, A_LOWER, 0.5);
    var eR = solveIK(shX + 2, shY, F.handR.x, F.handR.y, A_UPPER, A_LOWER, -0.5);

    function setL(el, x1, y1, x2, y2) { el.setAttribute('x1', x1.toFixed(1)); el.setAttribute('y1', y1.toFixed(1)); el.setAttribute('x2', x2.toFixed(1)); el.setAttribute('y2', y2.toFixed(1)); }
    function setC(el, cx, cy) { el.setAttribute('cx', cx.toFixed(1)); el.setAttribute('cy', cy.toFixed(1)); }

    setL(E.thighL, F.hip.x - 2, F.hip.y, kL.jx, kL.jy); setL(E.shinL, kL.jx, kL.jy, kL.bx, kL.by); setL(E.footL, kL.bx, kL.by, kL.bx - (F.dir > 0 ? 5 : -5), kL.by);
    setL(E.thighR, F.hip.x + 2, F.hip.y, kR.jx, kR.jy); setL(E.shinR, kR.jx, kR.jy, kR.bx, kR.by); setL(E.footR, kR.bx, kR.by, kR.bx - (F.dir > 0 ? 5 : -5), kR.by);
    setL(E.spine, F.hip.x, F.hip.y, F.chest.x, F.chest.y);
    setL(E.upArmL, shX - 2, shY, eL.jx, eL.jy); setL(E.foArmL, eL.jx, eL.jy, eL.bx, eL.by);
    setL(E.upArmR, shX + 2, shY, eR.jx, eR.jy); setL(E.foArmR, eR.jx, eR.jy, eR.bx, eR.by);

    /* head group: position + tilt */
    var tiltDeg = (F.headTilt * 57.3).toFixed(1);
    E.headG.setAttribute('transform', 'translate(' + (hx.x - HEAD.x).toFixed(1) + ' ' + (hx.y - HEAD.y).toFixed(1) + ') rotate(' + tiltDeg + ' 60 60)');
    /* Neck is drawn in root coordinates from the live shoulder/chest anchor to
       the head's bottom edge, so springy head lag never detaches it. */
    if (E.neck) {
      var neckTopY = hx.y + HEAD_R;           /* head's bottom edge */
      var neckBotY = F.chest.y + 2;           /* chest anchor, always lower */
      if (neckBotY - neckTopY < 2) neckBotY = neckTopY + 2;
      setL(E.neck, F.chest.x, neckBotY, hx.x, neckTopY);
    }
    /* eyes: blink by squashing the pupil dots vertically, then let them
       track the gaze. Keeping the blink to a scaleY on two circles is much
       cheaper than swapping art, and reads clearly at mascot size. */
    var blinkSquash = blinking ? 0.12 : 1;
    var px = F.gaze.x * 1.1, py = F.gaze.y * 1.2;
    E.pupL.setAttribute('cx', (55 + px).toFixed(1)); E.pupL.setAttribute('cy', (45.5 + py).toFixed(1));
    E.pupR.setAttribute('cx', (65 + px).toFixed(1)); E.pupR.setAttribute('cy', (45.5 + py).toFixed(1));
    var lidY = (45.5 + py).toFixed(1);
    var lid = blinking ? 'translate(0 ' + lidY + ') scale(1 ' + blinkSquash + ') translate(0 -' + lidY + ')' : null;
    if (lid) { E.pupL.setAttribute('transform', lid); E.pupR.setAttribute('transform', lid); }
    else { E.pupL.removeAttribute('transform'); E.pupR.removeAttribute('transform'); }
    /* mouth: smile <-> frown morph + open (surprise/yawn) */
    var sm = clamp(F.smile, -1, 1);
    E.mouth.setAttribute('d', 'M55 53 Q60 ' + (53 + sm * 4.2).toFixed(1) + ' 65 53');
    E.mouth.setAttribute('opacity', (0.9 * (1 - F.mouthOpen)).toFixed(2));
    E.mouthOpen.setAttribute('opacity', (F.mouthOpen * 0.95).toFixed(2));
    E.mouthOpen.setAttribute('cy', (54.5).toFixed(1));
    E.mouthOpen.setAttribute('ry', (1.4 + F.mouthOpen * 2.4).toFixed(2));

    /* squash & stretch around feet */
    E.squash.setAttribute('transform', 'translate(60 158) scale(' + F.squashX.toFixed(3) + ' ' + F.squashY.toFixed(3) + ') translate(-60 -158)');
    /* shadow */
    var airH = clamp(Math.abs(F.yOff) / 60, 0, 1);
    E.shadow.setAttribute('opacity', (0.28 * (1 - airH * 0.6)).toFixed(2));
    E.shadow.setAttribute('rx', (15 * (1 - airH * 0.3)).toFixed(1));

    /* world position — thrown figures tumble about their own centre, and
       cartwheel/backflip add their own rotation on top of that. */
    var totalSpin = (F.spin || 0) + (F.extraSpin || 0);
    var rot = totalSpin ? ' rotate(' + (totalSpin * 57.3).toFixed(1) + 'deg)' : '';
    F.el.style.transform = 'translate3d(' + F.x.toFixed(1) + 'px,' + (F.y + F.yOff).toFixed(1) + 'px,0)' + rot;
  }

  var lastFrameAt = 0;
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    /* On phones/weak devices the mascots do not need 60fps to look
       alive. Halving the cadence there is the single biggest win for
       keeping the rest of the page responsive while they animate. */
    var lite = window.AiaPerf && window.AiaPerf.lite;
    var busy = (figures.vinay && figures.vinay.mode !== 'idle') ||
               (figures.nitin && figures.nitin.mode !== 'idle');
    var cap = (lite && !busy) ? 30 : 0;
    if (cap && now - lastFrameAt < 1000 / cap - 1.5) return;
    lastFrameAt = now;
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    if (lite) dt = Math.min(dt, 0.05);
    lastT = now;
    var t = now / 1000;
    if (figures.vinay) updateFigure(figures.vinay, now, dt, t);
    if (figures.nitin) updateFigure(figures.nitin, now, dt, t);
  }

  /* ---------------- geometry ---------------- */
  function measure() {
    var mobile = window.innerWidth <= 820;
    figW = mobile ? 70 : 88;
    floorPad = mobile ? 84 : 12;
    MIN_X = 8; MAX_X = Math.max(80, window.innerWidth - figW - 8);
    var floorY = window.innerHeight - floorPad - figW * 1.55;
    Object.keys(figures).forEach(function (k2) {
      var F = figures[k2];
      F.x = clamp(F.x, MIN_X, MAX_X);
      F.y = floorY;
      F.el.style.width = figW + 'px';
    });
  }

  /* ---------------- toggle ---------------- */
  function buildToggle() {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'stickmen-toggle';
    toggleBtn.type = 'button';
    toggleBtn.innerHTML = '<span class="st-ico">◠‿◠</span>';
    toggleBtn.setAttribute('aria-label', 'Toggle Vinay and Nitin mascots');
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.title = 'Vinay & Nitin — tap to hide/show';
    document.body.appendChild(toggleBtn);
    toggleBtn.addEventListener('click', function () {
      hidden = !hidden;
      document.body.classList.toggle('stickmen-hidden', hidden);
      toggleBtn.setAttribute('aria-pressed', String(hidden));
      toggleBtn.classList.toggle('off', hidden);
      if (hidden) { cancelAnimationFrame(rafId); timers.forEach(clearTimeout); timers = []; }
      else if (!REDUCED) { lastT = performance.now(); rafId = requestAnimationFrame(frame); schedule(); }
    });
  }

  /* ---------------- init / destroy ---------------- */
  function init() {
    if (stage) return;
    stage = document.createElement('div');
    stage.className = 'stickmen-stage';
    stage.id = 'stickmenStage';
    document.body.appendChild(stage);
    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    }, { passive: true });
    document.addEventListener('pointerdown', function (e) {
      /* glance at taps anywhere */
      if (IS_TOUCH) { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; }
    }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) cancelAnimationFrame(rafId);
      else if (!hidden && !REDUCED) { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
    });

    figures.vinay = buildFigure('vinay', 'Vinay', clamp(window.innerWidth * 0.12, MIN_X, MAX_X));
    figures.nitin = buildFigure('nitin', 'Nitin', clamp(window.innerWidth * 0.8, MIN_X, MAX_X));
    measure();
    buildToggle();

    /* first paint even with reduced motion */
    var n = performance.now();
    renderFigure(figures.vinay, n, 0.016, n / 1000, false);
    renderFigure(figures.nitin, n, 0.016, n / 1000, false);
    if (REDUCED) {
      figures.vinay.el.addEventListener('click', function () { if (canBubble(figures.vinay)) say(figures.vinay, pick(siteLines()), 2600); });
      figures.nitin.el.addEventListener('click', function () { if (canBubble(figures.nitin)) say(figures.nitin, pick(siteLines()), 2600); });
      return;
    }
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
    schedule();
    /* welcome wave shortly after load */
    later(function () {
      if (!hidden && figures.vinay.mode === 'idle') { doWave(figures.vinay, 1800); }
      later(function () { if (!hidden && figures.nitin.mode === 'idle') doWave(figures.nitin, 1800); }, 900);
    }, 2500);
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    timers.forEach(clearTimeout); timers = [];
    if (stage) { stage.remove(); stage = null; }
    figures = {};
    if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; }
  }

  window.StickMen = {
    __v: 5, init: init, destroy: destroy, celebrate: celebrate,
    say: function (k, t) { var F = figures[k]; if (F) say(F, t); },
    wave: function (k) { var F = figures[k]; if (F) doWave(F, 1700); },
    greet: greet,
    react: reactTo,
    interest: interest,
    /* Trigger a named activity on one mascot (or either, by name).
       Used by the page to celebrate real events, and by tests. */
    act: function (name, k) {
      var F = k ? figures[k] : figures[Math.random() < 0.5 ? 'vinay' : 'nitin'];
      if (!F || F.mode !== 'idle' || F.dragging) return false;
      switch (name) {
        case 'wave': doWave(F, 1700); return true;
        case 'jump': doJump(F, 46); return true;
        case 'dance': doDance(F, 2400); return true;
        case 'kick': doKick(F, 1100); return true;
        case 'punch': doPunch(F, 900); return true;
        case 'cartwheel': doCartwheel(F, 1500); return true;
        case 'backflip': doBackflip(F); return true;
        case 'stretch': doStretch(F, 2400); return true;
        case 'cheer': doCheer(F, 2200); return true;
        case 'pushup': doPushup(F, 2400); return true;
        case 'sleep': doSleep(F, 4200); return true;
        case 'highfive': maybeHighFive(); return true;
        case 'fight': return startFight();
        default: return false;
      }
    },
    /* full list of activities, for the admin debug view */
    activities: ['wave', 'jump', 'dance', 'kick', 'punch', 'cartwheel', 'backflip',
                 'stretch', 'cheer', 'pushup', 'sleep', 'highfive', 'fight'],
    /* Introspection for tests and for the admin debug view: what each mascot
       is doing right now. Read-only. */
    state: function () {
      var out = {};
      Object.keys(figures).forEach(function (k) {
        var F = figures[k];
        out[k] = { mode: F.mode, x: Math.round(F.x), yOff: Math.round(F.yOff), dragging: !!F.dragging };
      });
      return out;
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (!stage) init(); });
  } else if (!stage) { init(); }
})();
