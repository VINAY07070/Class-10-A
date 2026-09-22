/* ============================================================
   NOTIFICATIONS + SOUND + MY PROFILE
   One module shared by every page. Three jobs:

   1. A notification bell in the header that lights up when a new
      class-chat message arrives, or when the admin sends this user a
      private message. The private side reuses AiaPrivate's relay room
      for this user, so it only ever fires for the right person.
   2. Satisfying little sounds, synthesised with the Web Audio API so
      the site ships no audio files and stays dependency-free.
   3. "My Profile" — lets a signed-in student edit their own bio,
      strengths, interests and goals. Writes through
      DataStore.saveProfile(), which is a synced key, so an edit shows
      up on every device.

   Everything degrades quietly: no AudioContext (or a file:// quirk),
   no AiaPrivate, or no session all leave the rest of the page working.
   ============================================================ */
(function () {
  'use strict';
  if (window.AiaNotify && window.AiaNotify.__v === 1) return;

  var SEEN_CLASS = 'aia_notif_seen_class';
  var SEEN_PV = 'aia_notif_seen_pv';
  var SOUND_KEY = 'aia_sound_on';

  function session() {
    try { return window.DataStore ? DataStore.getSession() : null; } catch (e) { return null; }
  }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k, d) {
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  }

  /* ---------------- sound ----------------
     Short synthesised cues. Kept quiet and rounded; a harsh square wave
     at full volume is the opposite of satisfying on a phone speaker. */
  var ac = null, soundOn = load(SOUND_KEY, true);
  function ctx() {
    if (ac) return ac;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { ac = new C(); } catch (e) { ac = null; }
    return ac;
  }
  /* A single plucked note: triangle body, exponential decay, gentle lowpass. */
  function note(freq, at, dur, gain) {
    var a = ctx(); if (!a) return;
    var t0 = a.currentTime + at;
    var osc = a.createOscillator(), amp = a.createGain(), lp = a.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t0);
    lp.frequency.exponentialRampToValueAtTime(900, t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain || 0.16, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(lp); lp.connect(amp); amp.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function play(kind) {
    if (!soundOn) return;
    var a = ctx(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    if (kind === 'tap') { note(660, 0, 0.07, 0.07); return; }
    if (kind === 'send') { note(587.33, 0, 0.10, 0.11); note(880, 0.055, 0.13, 0.09); return; }
    if (kind === 'success') { note(659.25, 0, 0.10, 0.13); note(880, 0.075, 0.12, 0.12); note(1174.66, 0.15, 0.20, 0.10); return; }
    if (kind === 'notify') { note(783.99, 0, 0.11, 0.14); note(1046.5, 0.10, 0.18, 0.12); return; }
    if (kind === 'error') { note(311.13, 0, 0.13, 0.12); note(233.08, 0.10, 0.22, 0.11); return; }
    if (kind === 'open') { note(523.25, 0, 0.08, 0.09); note(783.99, 0.05, 0.14, 0.08); return; }
    note(660, 0, 0.08, 0.09);
  }

  /* Wire the sounds into things the user already clicks, once, at the
     document level so it covers buttons rendered later too. */
  function bindTapSounds() {
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ?
        e.target.closest('button, .btn, .tabbar-item, .quick-link, .theme-card, .suggest-chip') : null;
      if (!el || el.disabled) return;
      if (el.closest('.notif-panel') || el.id === 'notifBell') return;
      play('tap');
    }, true);
  }

  /* ---------------- header bell ---------------- */
  function headerHost() {
    var nav = document.querySelector('.navbar-inner, .navbar-actions, .nav-actions, .navbar .container, .navbar');
    if (!nav) return null;
    var box = document.createElement('div');
    box.className = 'notif-wrap';
    var isAdmin = session() && session().role === 'admin';
    box.innerHTML =
      '<button class="notif-bell" id="notifBell" aria-label="Notifications" aria-expanded="false">' +
        '<i class="fa-solid fa-bell"></i><span class="notif-dot" id="notifDot" style="display:none"></span>' +
      '</button>' +
      '<button class="notif-bell" id="soundToggle" aria-label="Toggle sounds" title="Sound effects">' +
        '<i class="fa-solid fa-volume-high"></i>' +
      '</button>' +
      '<div class="notif-panel" id="notifPanel" role="region" aria-label="Notifications">' +
        '<div class="notif-head"><strong>Notifications</strong>' +
          '<button class="notif-clear" id="notifClear">Clear</button></div>' +
        '<div class="notif-list" id="notifList"></div>' +
      '</div>' +
      (isAdmin ? '' : '<button class="notif-bell" id="myProfileBtn" aria-label="My profile" title="My profile">' +
        '<i class="fa-solid fa-user-pen"></i></button>');
    nav.appendChild(box);
    return box;
  }

  var feed = [];   /* {id, kind, title, text, at, href, read} */
  function renderFeed() {
    var list = document.getElementById('notifList');
    var dot = document.getElementById('notifDot');
    if (!list) return;
    var unread = feed.filter(function (n) { return !n.read; }).length;
    if (dot) dot.style.display = unread ? 'block' : 'none';
    if (!feed.length) {
      list.innerHTML = '<p class="notif-empty">Nothing new yet. Chat and private messages show up here.</p>';
      return;
    }
    var icon = { chat: 'fa-comments', private: 'fa-user-shield', sound: 'fa-volume-high', profile: 'fa-user-pen' };
    list.innerHTML = feed.slice(0, 40).map(function (n) {
      return '<div class="notif-item' + (n.read ? '' : ' unread') + '" data-id="' + n.id + '">' +
        '<span class="notif-ic"><i class="fa-solid ' + (icon[n.kind] || 'fa-bell') + '"></i></span>' +
        '<div class="notif-body"><div class="notif-title">' + esc(n.title) + '</div>' +
        '<div class="notif-text">' + esc(n.text) + '</div>' +
        '<div class="notif-time">' + esc(timeAgo(n.at)) + '</div></div></div>';
    }).join('');
    list.querySelectorAll('.notif-item').forEach(function (row) {
      row.addEventListener('click', function () {
        row.classList.remove('unread');
        var it = feed.find(function (x) { return String(x.id) === row.getAttribute('data-id'); });
        if (it) it.read = true;
        renderFeed();
        if (it && it.href) location.href = it.href;
      });
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function timeAgo(at) {
    var t = Date.parse(at || '') || 0;
    if (!t) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function push(n) {
    if (!n) return;
    if (n.id && feed.some(function (x) { return x.id === n.id; })) return;
    feed.unshift(Object.assign({ read: false, at: new Date().toISOString() }, n));
    if (feed.length > 60) feed = feed.slice(0, 60);
    renderFeed();
    play('notify');
    toast(n.title, n.text);
  }
  function toast(title, text) {
    var host = document.getElementById('notifToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'notifToastHost';
      host.className = 'notif-toast-host';
      document.body.appendChild(host);
    }
    var t = document.createElement('div');
    t.className = 'notif-toast';
    t.innerHTML = '<i class="fa-solid fa-bell"></i> <strong>' + esc(title) + '</strong> ' + esc(text || '');
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 4200);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 5000);
  }

  /* ---------------- watch class chat ----------------
     The class room is a shared store that every page reads, so polling it
     locally is enough — no extra relay connection needed. */
  var lastClassId = null;
  function watchClassChat() {
    var s = session(); if (!s || !window.DataStore) return;
    try {
      var l = DataStore.getClassChat() || [];
      lastClassId = l.length ? l[l.length - 1].id : null;
    } catch (e) { lastClassId = null; }
    setInterval(function () {
      if (document.hidden) return;
      var l = (DataStore.getClassChat && DataStore.getClassChat()) || [];
      if (!l.length) return;
      var last = l[l.length - 1];
      if (!last || !last.id || last.id === lastClassId) return;
      var fresh = [];
      for (var i = l.length - 1; i >= 0; i--) {
        if (l[i].id === lastClassId) break;
        fresh.push(l[i]);
      }
      lastClassId = last.id;
      var s2 = session();
      fresh.reverse().forEach(function (m) {
        if (m.system) return;
        if (s2 && m.username === s2.username) return;   /* never notify me about my own message */
        push({
          id: 'c-' + m.id, kind: 'chat',
          title: m.name ? m.name + ' in class chat' : 'New class chat message',
          text: m.text || (m.file ? 'Sent a file' : ''), at: m.at, href: 'chat.html'
        });
      });
    }, 4000);
  }

  /* ---------------- watch private thread ----------------
     Uses the per-student encrypted room, so only this student (and the
     admin) can even decrypt it. Only admin messages notify. */
  function watchPrivate() {
    var s = session();
    if (!s || s.role === 'admin' || !window.AiaPrivate || !DataStore) return;
    var user = s.username;
    var known = {};
    (DataStore.getPrivateChat(user) || []).forEach(function (m) { if (m && m.id) known[m.id] = 1; });
    (DataStore.getPrivateCleared ? DataStore.getPrivateCleared(user) : []).forEach(function (id) { if (id) known[id] = 1; });
    try {
      window.AiaPrivate.listen(user, function (batch) {
        batch.forEach(function (m) {
          if (m.role !== 'admin' || known[m.id]) return;
          known[m.id] = 1;
          DataStore.addPrivateMessage(user, { id: m.id, text: m.text, role: 'admin', name: m.name, at: m.at });
          push({
            id: 'p-' + m.id, kind: 'private',
            title: 'Private message from ' + (m.name || 'Admin'),
            text: m.text, at: m.at, href: 'chat.html'
          });
        });
      }, { known: known, since: '48h' });
    } catch (e) {}
  }

  /* ---------------- My Profile ---------------- */
  function myName() {
    var s = session();
    return s && s.name ? String(s.name).toUpperCase() : '';
  }
  function blankRow(name) {
    return '<p class="notif-empty" style="grid-column:1/-1">No profile saved for <strong>' +
      esc(name) + '</strong> yet. Fill it in and save.</p>';
  }
  function openProfile() {
    var name = myName();
    if (!name) return;
    var ps = (DataStore.getStudentProfiles && DataStore.getStudentProfiles()) || [];
    var mine = ps.find(function (p) {
      return String(p.student_name || '').toUpperCase() === name;
    }) || {};
    var ov = document.getElementById('myProfileOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'myProfileOverlay';
      ov.className = 'guide-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      document.body.appendChild(ov);
    }
    ov.innerHTML =
      '<div class="guide-modal glass-card myprofile-modal">' +
        '<div class="guide-head"><span class="guide-badge"><i class="fa-solid fa-user-pen"></i></span>' +
        '<h3 class="heading-sm" id="mpTitle">My Profile — ' + esc(name) + '</h3>' +
        '<button class="pv-close" id="mpClose" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>' +
        '<p class="text-muted" style="font-size:.8rem;margin:0 0 14px">Saved to your profile and synced to every device.</p>' +
        '<div class="admin-form">' +
          field('mpBio', 'About me', mine.bio) +
          field('mpStrengths', 'Strengths', mine.strengths) +
          field('mpInterests', 'Interests', mine.interests) +
          field('mpGoals', 'Goals', mine.goals) +
        '</div>' +
        '<div class="myprofile-actions">' +
          '<button class="btn btn-primary" id="mpSave"><i class="fa-solid fa-floppy-disk"></i> Save Profile</button>' +
          '<button class="btn btn-secondary" id="mpCancel">Cancel</button>' +
        '</div>' +
      '</div>';
    ov.style.display = 'grid';
    function field(id, label, val) {
      return '<div class="form-group"><label for="' + id + '">' + label + '</label>' +
        '<textarea id="' + id + '" rows="2" maxlength="600">' + esc(val || '') + '</textarea></div>';
    }
    function close() { ov.style.display = 'none'; }
    document.getElementById('mpClose').onclick = close;
    document.getElementById('mpCancel').onclick = function () { play('tap'); close(); };
    ov.onclick = function (e) { if (e.target === ov) close(); };
    document.getElementById('mpSave').onclick = function () {
      var fields = {
        bio: document.getElementById('mpBio').value.trim(),
        strengths: document.getElementById('mpStrengths').value.trim(),
        interests: document.getElementById('mpInterests').value.trim(),
        goals: document.getElementById('mpGoals').value.trim()
      };
      DataStore.saveProfile(name, fields);
      play('success');
      App.showToast('Profile saved — syncing to all devices ✓', 'success');
      close();
    };
  }

  /* ---------------- boot ---------------- */
  function mount() {
    /* The navbar is injected by main.js, so on a cold load there may not be
       a header to mount into yet. Retry briefly instead of giving up — but
       only once, so the pollers are not started twice. */
    if (headerHost()) { wire(); return; }
    var tries = 0;
    var t = setInterval(function () {
      if (headerHost()) { clearInterval(t); wire(); }
      else if (++tries > 40) clearInterval(t);
    }, 150);
  }

  function wire() {
    renderFeed();
    var bell = document.getElementById('notifBell');
    var panel = document.getElementById('notifPanel');
    var snd = document.getElementById('soundToggle');
    var prof = document.getElementById('myProfileBtn');
    if (bell && panel) {
      bell.addEventListener('click', function () {
        var open = panel.classList.toggle('open');
        bell.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          play('open');
          feed.forEach(function (n) { n.read = true; });
          renderFeed();
          var d = document.getElementById('notifDot');
          if (d) d.style.display = 'none';
        }
      });
    }
    var clearBtn = document.getElementById('notifClear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      feed = []; renderFeed(); play('tap');
    });
    if (snd) {
      snd.querySelector('i').className = 'fa-solid ' + (soundOn ? 'fa-volume-high' : 'fa-volume-xmark');
      snd.addEventListener('click', function () {
        soundOn = !soundOn; store(SOUND_KEY, soundOn);
        snd.querySelector('i').className = 'fa-solid ' + (soundOn ? 'fa-volume-high' : 'fa-volume-xmark');
        if (soundOn) play('success');
      });
    }
    if (prof) prof.addEventListener('click', openProfile);
    document.addEventListener('click', function (e) {
      if (!panel || !panel.classList.contains('open')) return;
      if (e.target.closest && (e.target.closest('#notifPanel') || e.target.closest('#notifBell'))) return;
      panel.classList.remove('open');
      if (bell) bell.setAttribute('aria-expanded', 'false');
    });
    watchClassChat();
    watchPrivate();
  }

  /* The header and the session both appear after this file runs: main.js
     injects the navbar and the login overlay stores the session without a
     reload. Wait for both before mounting, and only mount once. */
  function whenReady(cb) {
    var tries = 0, t = setInterval(function () {
      if (session() && document.querySelector('.navbar-inner, .navbar')) {
        clearInterval(t);
        cb();
      } else if (++tries > 60) clearInterval(t);
    }, 200);
  }

  function boot() {
    bindTapSounds();
    whenReady(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.AiaNotify = {
    __v: 1,
    play: play,
    push: push,
    soundOn: function () { return soundOn; },
    openProfile: openProfile,
    feed: function () { return feed.slice(); }
  };
})();
