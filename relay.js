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
  try { lastTime = Number(localStorage.getItem(LAST_SEEN_KEY) || 0) || 0; } catch (e) {}
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
    markSeen(data.time);
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
     Reads from EVERY relay (not just the active one) so a device that
     published to a backup server is still heard. Backoff keeps us under
     the free-tier rate limits. */
  var catchingUp = false;
  function ingest(text) {
    text.split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var d;
      try { d = JSON.parse(line); } catch (e) { return; }
      if (!d || d.event !== 'message' || !d.message) return;
      if (d.id && seen[d.id]) return;
      markSeen(d.time);
      var msg;
      try { msg = JSON.parse(d.message); } catch (e) { return; }
      applyMessage(msg, d.id);
    });
  }
  function catchUp() {
    if (!enabled || catchingUp) return;
    catchingUp = true;
    var since = lastTime ? lastTime : CATCHUP_WINDOW;
    var pending = SERVERS.length, rateLimited = false;
    SERVERS.forEach(function (srv) {
      fetch(srv + '/' + room + '/json?poll=1&since=' + since, { cache: 'no-store' })
        .then(function (r) {
          if (r.status === 429 || r.status >= 500) { rateLimited = true; return ''; }
          if (!r.ok) return '';
          return r.text();
        })
        .then(function (text) { if (text) ingest(text); })
        .catch(function () {})
        .then(function () {
          if (--pending === 0) {
            catchingUp = false;
            if (rateLimited) setPolling(Math.min((pollEvery || 5000) * 2, 60000));
          }
        });
    });
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
      setTimeout(catchUp, 400);           /* immediate catch-up of recent history */
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
      try { localStorage.removeItem(LAST_SEEN_KEY); } catch (e) {}
      closeStream();
      setStatus('starting', 'Room changed — reconnecting');
      connect();
      setPolling(8000);
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
    refresh: function () { catchingUp = false; catchUp(); }
  };
})();