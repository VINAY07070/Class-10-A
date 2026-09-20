/* ============================================================
   AIA REALTIME RELAY — automatic cross-device sync, no server
   ------------------------------------------------------------
   sync-bridge.js already merges data (tabs instantly; other
   devices via copy/paste codes). This module adds the missing
   piece: an AUTOMATIC live link between every phone and PC.

   How it works with zero infrastructure:
   • The class shares one public pub/sub "room".
   • Each device subscribes (SSE) and publishes small deltas
     whenever local data changes.
   • Incoming deltas are merged with AiaSync.mergeSnapshot(),
     so merging stays additive and can never lose data.

   Offline / relay down? Everything still works exactly as
   before (local + tabs + codes). Nothing is ever deleted.
   ============================================================ */
(function () {
  'use strict';
  if (window.AiaRelay && window.AiaRelay.__v === 1) return;

  /* Every deployment of this site shares one room, so a student
     just opens the page and is connected. Admins can override
     the room in the Sync Center (all devices then follow it). */
  var DEFAULT_ROOM = 'aia10a-7f3c9e21b8d4';
  /* Several free public relays with the same simple API. If one is down or
     rate-limited we rotate to the next, so sync keeps working unattended. */
  var SERVERS = ['https://ntfy.sh', 'https://ntfy.envs.net', 'https://ntfy.mzte.de'];
  var serverIdx = 0;
  function base() { return SERVERS[serverIdx]; }
  function rotate() {
    serverIdx = (serverIdx + 1) % SERVERS.length;
    setStatus('starting', 'Switching to a backup relay');
  }
  var PUSH_DEBOUNCE = 140;      /* ms — keeps sending snappy but batched */
  var BACKSTOP_POLL = 4000;     /* ms — reliable poll (SSE is used when it stays up) */
  var CATCHUP_WINDOW = '12h';   /* first connect only — later loads are incremental */
  var MAX_BYTES = 3600;         /* keep every post well under the relay cap */
  var LAST_SEEN_KEY = 'aia_relay_last_seen';

  /* -------- compact key names (payload size ↓) -------- */
  var SHORT = {
    aia_students: 'st', aia_teachers: 'te', aia_leadership: 'ld',
    aia_homework: 'hw', aia_announcements: 'an', aia_test_scores: 'ts',
    aia_class_chat: 'cc', aia_comments: 'cm', aia_poll_votes: 'pv',
    aia_polls: 'pl', aia_student_profiles: 'sp', aia_subject_content: 'sc',
    aia_subject_photos: 'ph', aia_ai_config: 'ac', aia_theme: 'th',
    aia_presence: 'pr', aia_ai_log: 'ag', aia_chat_mode: 'cm2',
    aia_files: 'fl', aia_credentials_overrides: 'co',
    aia_class_chat_deleted: 'cd', aia_activity_log: 'al'
  };
  var LONG = {};
  Object.keys(SHORT).forEach(function (k) { LONG[SHORT[k]] = k; });

  function shortKey(k) {
    if (SHORT[k]) return SHORT[k];
    if (k.indexOf('aia_ai_chat_') === 0) return 'u:' + k.slice(12);
    return null;
  }
  function longKey(s) {
    if (LONG[s]) return LONG[s];
    if (s.indexOf('u:') === 0) return 'aia_ai_chat_' + s.slice(2);
    return null;
  }

  /* -------- tiny helpers -------- */
  function rawGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function rawSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function bytes(s) { return s.length; }

  var device = (window.AiaSync && window.AiaSync.device) || { id: 'dev', name: 'device' };
  var settings = rawGet('aia_relay_cfg', {}) || {};
  var room = String(settings.room || DEFAULT_ROOM).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_ROOM;
  var enabled = settings.enabled !== false;

  var seen = {}, lastTime = 0, status = enabled ? 'starting' : 'off';
  var es = null, dirty = {}, pushTimer = 0, pollTimer = 0, reconnectTimer = 0, sseFails = 0;
  var lastPublishKey = {}, publishedChatIds = {};
  /* Catch-up cursor. Captured at module load, before the live stream can
     touch lastTime, so the first sync really does replay recent history. */
  var bootSince = 0, catchupDone = false;
  try { lastTime = Number(localStorage.getItem(LAST_SEEN_KEY) || 0) || 0; } catch (e) {}
  bootSince = lastTime || CATCHUP_WINDOW;
  /* A device that already synced recently does not need the whole window
     again on every page load — only a fresh device does. */
  catchupDone = !!lastTime;
  function markSeen(t) {
    if (!t) return;
    lastTime = Math.max(lastTime, t);
    try { localStorage.setItem(LAST_SEEN_KEY, String(lastTime)); } catch (e) {}
  }

  function saveSettings() { rawSet('aia_relay_cfg', { room: room, enabled: enabled }); }

  function setStatus(s, note) {
    status = s;
    var el = document.getElementById('aiaRelayLine');
    if (el) el.innerHTML = statusHTML(note);
    try { document.dispatchEvent(new CustomEvent('aia-relay-status', { detail: { status: s, room: room, note: note } })); } catch (e) {}
  }
  function statusHTML(note) {
    var map = {
      live: ['LIVE ✓', 'Every phone & PC is in sync automatically'],
      starting: ['connecting…', 'Linking this device to the class room'],
      off: ['off', 'Using tabs + sync codes only'],
      error: ['retrying…', 'Relay unreachable — local sync still works']
    };
    var m = map[status] || map.off;
    return '<div class="sync-stat"><span>Realtime link</span><strong class="relay-' + status + '">' + m[0] + '</strong></div>' +
      '<div class="sync-stat"><span>Class room</span><strong>' + room + '</strong></div>' +
      (note ? '<div class="text-muted" style="font-size:.74rem;margin-top:6px">' + note + '</div>' : '');
  }

  /* -------- publishing -------- */
  function publish(keys) {
    if (!enabled || !keys.length) return;
    /* Chunk by size so a single post never exceeds the relay limit. */
    var payload = {}, payloadBytes = 0;
    var queue = [];
    function flush() {
      if (!Object.keys(payload).length) return;
      queue.push(JSON.stringify({ a: 'a10a', f: device.id, n: device.name, d: payload }));
      payload = {}; payloadBytes = 0;
    }
    keys.forEach(function (k) {
      var sk = shortKey(k);
      if (!sk) return;
      var v;
      try { v = localStorage.getItem(k); } catch (e) { return; }
      if (v === null) return;
      if (k === 'aia_class_chat') v = capChat(v);
      else if (k === 'aia_subject_photos') v = trimPhotos(v);
      else if (k === 'aia_activity_log') v = capActivity(v);
      else if (k === 'aia_ai_log') return; /* too heavy for live */
      var size = sk.length + v.length + 6;
      if (payloadBytes + size > MAX_BYTES) flush();
      payload[sk] = v;
      payloadBytes += size;
    });
    flush();
    queue.forEach(post);
  }

  function capChat(chatJson) {
    try {
      var arr = JSON.parse(chatJson);
      if (!Array.isArray(arr)) return chatJson;
      /* only ship messages the room hasn't seen — keeps live chat light */
      var fresh = [];
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i];
        var id = m && (m.id || (m.username + '|' + m.at));
        if (id && !publishedChatIds[id]) { fresh.push(m); publishedChatIds[id] = 1; }
      }
      if (fresh.length) return JSON.stringify(fresh.slice(-40));
      return JSON.stringify(arr.slice(-3)); /* heartbeat: newest few, dedup-safe */
    } catch (e) { return chatJson.slice(0, MAX_BYTES); }
  }
  function trimPhotos(jsonStr) {
    try {
      var obj = JSON.parse(jsonStr), out = {};
      Object.keys(obj).forEach(function (k) { out[k] = (obj[k] || []).slice(-4); });
      return JSON.stringify(out);
    } catch (e) { return '{}'; }
  }
  /* Activity log: ship only entries this device hasn't published yet, and
     never the whole history — the admin Activity tab on another device needs
     to see what classmates are doing, but the payload has to stay small.
     Merging is additive + id-deduped, so trimming here loses nothing. */
  var publishedActivity = {};
  function capActivity(jsonStr) {
    try {
      var arr = JSON.parse(jsonStr);
      if (!Array.isArray(arr)) return '[]';
      var fresh = [];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i];
        if (!e) continue;
        var id = (e.username || '') + '|' + (e.at || '') + '|' + (e.action || '') + '|' + (e.page || '');
        if (!publishedActivity[id]) { publishedActivity[id] = 1; fresh.push(e); }
      }
      if (!fresh.length) return '[]';
      var out = fresh.slice(-25);
      publishedActivity = {};                 /* keep the map from growing forever */
      out.forEach(function (e) {
        publishedActivity[(e.username || '') + '|' + (e.at || '') + '|' + (e.action || '') + '|' + (e.page || '')] = 1;
      });
      return JSON.stringify(out);
    } catch (e) { return '[]'; }
  }

  function post(body, i) {
    i = i || 0;
    try {
      fetch(SERVERS[i] + '/' + room, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: body,
        cache: 'no-store'
      }).then(function (r) {
        if (r.status === 429 || r.status >= 500) {
          /* Try the next relay so the message always lands somewhere others read. */
          if (i + 1 < SERVERS.length) { serverIdx = i + 1; post(body, i + 1); } else fails();
        }
      }).catch(function () {
        if (i + 1 < SERVERS.length) { serverIdx = i + 1; post(body, i + 1); } else fails();
      });
    } catch (e) { fails(); }
  }
  function fails() { sseFails++; if (sseFails >= 3) setStatus('error', 'Relay unreachable — local sync unaffected'); }

  /* -------- receiving -------- */
  function applyMessage(msg, fromNtfy) {
    if (!msg || msg.a !== 'a10a') return;
    if (msg.f === device.id) return;               /* our own echo */
    if (fromNtfy && seen[fromNtfy]) return;
    if (fromNtfy) seen[fromNtfy] = 1;
    if (!window.AiaSync || !msg.d) return;
    var data = {};
    Object.keys(msg.d).forEach(function (sk) {
      var full = longKey(sk);
      if (!full) return;
      /* Values are normally JSON, but a few settings (e.g. the theme) are
         stored as plain strings — pass those through untouched. */
      try { data[full] = JSON.parse(msg.d[sk]); }
      catch (e) { data[full] = msg.d[sk]; }
    });
    if (!Object.keys(data).length) return;
    try {
      window.AiaSync.mergeSnapshot({ data: data, from: msg.f, fromName: msg.n || 'live device' });
    } catch (e) {}
  }

  function handleNtfyEvent(ev) {
    var data;
    try { data = JSON.parse(ev.data); } catch (e) { return; }
    if (!data || data.event !== 'message' || !data.message) return;
    /* Do not let live traffic move the catch-up cursor forward before the
       first history replay has run — that is what made a device which opened
       after a write skip it entirely. */
    if (catchupDone) markSeen(data.time);
    var msg;
    try { msg = JSON.parse(data.message); } catch (e) { return; }
    applyMessage(msg, data.id);
  }

  /* -------- transport --------
     SSE is the primary channel (one long-lived connection, instant).
     Polling is only a fallback, with exponential backoff, so we never
     hammer the free public relay (which rate-limits at HTTP 429). */
  var pollEvery = 0;   /* 0 = polling disabled (SSE healthy) */

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!enabled || !pollEvery) return;
    pollTimer = setTimeout(function () {
      catchUp();
      schedulePoll();
    }, pollEvery);
  }
  function setPolling(ms) {
    pollEvery = ms;
    schedulePoll();
  }

  function connect() {
    if (!enabled) return;
    if (typeof EventSource === 'undefined') { setPolling(8000); return; }
    if (es) return;                       /* never stack connections */
    try {
      es = new EventSource(base() + '/' + room + '/sse');
    } catch (e) { setPolling(8000); return; }
    es.onopen = function () {
      sseFails = 0;
      setStatus('live');
      setPolling(30000);                  /* SSE healthy → occasional safety poll */
      /* Reconcile anything we missed while the stream was down (or, on a
         first load, whatever was already in the room). */
      catchUp();
    };
    es.onmessage = function (ev) { handleNtfyEvent(ev); };
    es.onerror = function () {
      closeStream();
      sseFails++;
      setStatus('error', 'Live link dropped — catching up');
      /* Exponential backoff: the free public relay rate-limits aggressive
         reconnects (HTTP 429), and hammering it makes recovery slower, not
         faster. Reset happens on a successful open. */
      var wait = Math.min(4000 * Math.pow(1.7, Math.min(sseFails - 1, 5)), 90000);
      setPolling(Math.min(5000 * sseFails, 60000));
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, wait);
    };
  }
  function closeStream() { try { if (es) es.close(); } catch (e) {} es = null; }

  /* -------- fallback polling --------
     One request at a time. The old code fired a GET at every relay in
     parallel, so a fresh device pulled the whole history three times over
     — megabytes of JSON parsed on the main thread, which is exactly what
     made the first load feel laggy on a phone. The backup relays are now
     only tried when the primary returns nothing. */
  var catchingUp = false;

  /* Keys that are live signals rather than durable data: presence
     heartbeats and the activity feed. A device that opens later gets fresh
     ones over the live stream within seconds, so replaying hundreds of stale
     copies is pure cost. They made up ~97% of the room history (830 KB of
     presence/activity noise), and parsing that on the main thread was what
     actually made a first load feel laggy on a phone. */
  var HISTORY_SKIP = { al: 1, pr: 1 };

  /* Parse one relay line into an applied message. `live` marks traffic that
     arrived over the stream, as opposed to a history replay. */
  function ingestLine(line, live) {
    line = line.trim();
    if (!line) return false;
    var d;
    try { d = JSON.parse(line); } catch (e) { return false; }
    if (!d || d.event !== 'message' || !d.message) return false;
    if (d.id && seen[d.id]) return false;
    markSeen(d.time);
    var msg;
    try { msg = JSON.parse(d.message); } catch (e) { return false; }
    if (!live && msg && msg.d) {
      var keep = false;
      Object.keys(msg.d).forEach(function (k) {
        if (HISTORY_SKIP[k]) delete msg.d[k]; else keep = true;
      });
      if (!keep) return false;
    }
    applyMessage(msg, d.id);
    return true;
  }

  /* The relay can hand back hundreds of KB of history. Parsing all of it in
     one go blocks the main thread for hundreds of ms on a phone — which is
     what "laggy" actually was. Process in small batches and yield between
     them so frames keep flowing. */
  function ingest(text, done) {
    var lines = text ? text.split('\n') : [];
    var i = 0, got = false, sliceStart = performance.now();
    function pump() {
      var n = 0;
      while (i < lines.length && n < 30) {
        if (ingestLine(lines[i], false)) got = true;
        i++; n++;
        if (performance.now() - sliceStart > 8) break;  /* keep frames smooth */
      }
      sliceStart = performance.now();
      if (i < lines.length) setTimeout(pump, 0);
      else done(got);
    }
    pump();
  }
  /* `cursor` is the "since" value this catch-up must use. It is captured
     once at boot (see CATCHUP_SINCE) because the SSE stream can advance
     lastTime within milliseconds of connecting — before this catch-up runs —
     which would make us ask for "everything since a moment ago" and silently
     skip the whole history. A device opening for the first time must see
     what is already in the room. */
  function catchUp(force) {
    if (!enabled || catchingUp) return;
    catchingUp = true;
    var since = (force || !catchupDone)
      ? (bootSince || CATCHUP_WINDOW)
      : (lastTime || CATCHUP_WINDOW);
    catchupDone = true;

    function tryServer(i, sawAny) {
      if (i >= SERVERS.length) {
        catchingUp = false;
        if (!sawAny && rateLimited) {
          setPolling(Math.min((pollEvery || 5000) * 2, 60000));
        }
        return;
      }
      fetch(SERVERS[i] + '/' + room + '/json?poll=1&since=' + since,
            { cache: 'no-store' })
        .then(function (r) {
          if (r.status === 429 || r.status >= 500) { rateLimited = true; return null; }
          if (!r.ok) return null;
          return r.text();
        })
        .then(function (text) {
          /* A non-empty body means this relay is healthy and has the room.
             Stop here — the backups mirror the same room, so fetching them
             as well would only repeat hundreds of KB we already processed. */
          if (!text || !text.length) { tryServer(i + 1, sawAny); return; }
          ingest(text, function () { catchingUp = false; });
        })
        .catch(function () { tryServer(i + 1, sawAny); });
    }
    var rateLimited = false;
    tryServer(0, false);
  }

  /* -------- local change → publish -------- */
  document.addEventListener('aia-local-write', function (e) {
    var key = e.detail && e.detail.key;
    if (!key || !shortKey(key)) return;
    dirty[key] = 1;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var keys = Object.keys(dirty);
      dirty = {};
      publish(keys);
    }, PUSH_DEBOUNCE);
  });

  /* -------- boot -------- */
  function boot() {
    if (enabled) {
      setStatus('starting');
      connect();
      setPolling(5000);                   /* reliable poll until SSE is healthy */
      setTimeout(function () { catchUp(); }, 400);   /* replay history as early as possible */
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* -------- public API (Sync Center UI) -------- */
  window.AiaRelay = {
    __v: 1,
    status: function () { return status; },
    room: function () { return room; },
    setRoom: function (r) {
      r = String(r || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      if (!r) return false;
      room = r; saveSettings();
      lastTime = 0; seen = {};
      /* a new room is a fresh history: force a full catch-up again */
      bootSince = CATCHUP_WINDOW; catchupDone = false;
      try { localStorage.removeItem(LAST_SEEN_KEY); } catch (e) {}
      closeStream();
      setStatus('starting', 'Room changed — reconnecting');
      connect();
      setPolling(8000);
      catchUp(true);
      return true;
    },
    setEnabled: function (on) {
      enabled = !!on; saveSettings();
      if (enabled) { setStatus('starting'); connect(); setPolling(8000); }
      else { closeStream(); clearTimeout(pollTimer); pollEvery = 0; setStatus('off'); }
      return enabled;
    },
    isEnabled: function () { return enabled; },
    statusHTML: function () { return statusHTML(status === 'live' ? '' : 'Sync codes still work even without the live link.'); },
    refresh: function () { catchingUp = false; catchUp(false); },
    /* Force a full-history replay (used by the Sync Center "re-sync" action). */
    resync: function () {
      catchingUp = false; bootSince = CATCHUP_WINDOW; catchupDone = false;
      try { localStorage.removeItem(LAST_SEEN_KEY); } catch (e) {}
      lastTime = 0; seen = {};
      catchUp(true);
    }
  };
})();