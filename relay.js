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
  /* A relay that is blocked or blackholed does not reject a request — it just
     never answers. Failover that only runs on rejection therefore never fires,
     and every sync attempt (plus the catch-up poll) hangs until the browser
     gives up. Every request gets its own deadline so a silent relay is treated
     as a failure and the next one is tried. */
  var FETCH_TIMEOUT = 8000;
  var WATCHDOG_MS = 9000;   /* how long to wait for the SSE stream to open */
  function fetchWithTimeout(url, opts, ms) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var o = opts || {}, timer = 0;
    if (ctl) {
      o.signal = ctl.signal;
      timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, ms || FETCH_TIMEOUT);
    }
    function clear() { if (timer) { clearTimeout(timer); timer = 0; } }
    return fetch(url, o).then(function (r) { clear(); return r; },
                             function (e) { clear(); throw e; });
  }
  var serverIdx = 0;
  function base() { return SERVERS[serverIdx]; }
  /* Remember the relay that actually answered, so a device that reloads does
     not pay the discovery cost again. */
  function rememberHost(i) {
    if (serverIdx === i) return;
    serverIdx = i;
    try { var cfg = rawGet('aia_relay_cfg', {}) || {}; cfg.host = SERVERS[i]; rawSet('aia_relay_cfg', cfg); } catch (e) {}
  }
  function rotate(note) {
    serverIdx = (serverIdx + 1) % SERVERS.length;
    try { var cfg = rawGet('aia_relay_cfg', {}) || {}; cfg.host = SERVERS[serverIdx]; rawSet('aia_relay_cfg', cfg); } catch (e) {}
    setStatus('starting', note || 'Switching to a backup relay');
  }
  var PUSH_DEBOUNCE = 140;      /* ms — keeps sending snappy but batched */
  var BACKSTOP_POLL = 4000;     /* ms — reliable poll (SSE is used when it stays up) */
  /* ntfy keeps topic history for a limited time, so this is the widest net
     we can cast for a device that has been offline for a while. */
  var CATCHUP_WINDOW = '168h';  /* 7 days */
  /* If a device has not been seen for longer than this, ask for the whole
     window again rather than a delta from a cursor that predates the
     relay's retained history. */
  var MAX_DELTA_AGE = 6 * 3600 * 1000;
  var MAX_BYTES = 3600;         /* keep every post well under the relay cap */
  var LAST_SEEN_KEY = 'aia_relay_last_seen';

  /* -------- compact key names (payload size ↓) -------- */
  var SHORT = {
    aia_students: 'st', aia_teachers: 'te', aia_leadership: 'ld',
    aia_homework: 'hw', aia_announcements: 'an', aia_test_scores: 'ts',
    aia_class_chat: 'cc', aia_comments: 'cm', aia_poll_votes: 'pv',
    aia_polls: 'pl', aia_student_profiles: 'sp', aia_subject_content: 'sc',
    aia_subject_photos: 'ph', aia_ai_config: 'ac', aia_theme: 'th',
    aia_pyqs: 'pq', aia_blocks: 'bk',
    aia_presence: 'pr', aia_ai_log: 'ag', aia_chat_mode: 'cm2',
    aia_files: 'fl', aia_credentials_overrides: 'co',
    aia_class_chat_deleted: 'cd', aia_class_chat_cleared: 'cw', aia_activity_log: 'al',
    aia_tombstones: 'tb', aia_ai_shared: 'as', aia_theme_plain: 'tp'
  };
  var LONG = {};
  Object.keys(SHORT).forEach(function (k) { LONG[SHORT[k]] = k; });

  function shortKey(k) {
    if (SHORT[k]) return SHORT[k];
    /* aia_ai_chat_* is a student's private conversation with the AI. The room
       is public and readable by anyone who knows its name, so these keys must
       never be published — an earlier version mapped them to a per-user code
       and shipped them, which exposed one student's questions to the class. */
    return null;
  }
  function longKey(s) { return LONG[s] || null; }

  /* -------- tiny helpers -------- */
  function rawGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function rawSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function bytes(s) { return s.length; }

  var device = (window.AiaSync && window.AiaSync.device) || { id: 'dev', name: 'device' };
  var settings = rawGet('aia_relay_cfg', {}) || {};
  var room = String(settings.room || DEFAULT_ROOM).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_ROOM;
  var enabled = settings.enabled !== false;
  /* Start on whichever relay answered last time, so a device that has already
     discovered a working host does not stall on a dead one again. */
  if (settings.host) {
    var hi = SERVERS.indexOf(settings.host);
    if (hi >= 0) serverIdx = hi;
  }

  var seen = {}, lastTime = 0, status = enabled ? 'starting' : 'off';
  var es = null, dirty = {}, pushTimer = 0, pollTimer = 0, reconnectTimer = 0, sseFails = 0;
  /* -------- durable outbox --------
     The relay is a free public service that rate-limits bursts (HTTP 429)
     and sometimes blackholes a request. With fire-and-forget posting, a
     message the admin cleared — or a chat line a student sent — could be
     dropped on the floor and never reach another phone, which is exactly
     the "it only cleared for me" and "it shows after a refresh" reports.
     So every payload is queued in localStorage and only retired once a
     relay acknowledges it. The queue survives a reload, and a periodic
     sweep retries whatever is still outstanding. */
  var OUTBOX_KEY = 'aia_relay_outbox';
  var outbox = [];
  try { outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') || []; }
  catch (e) { outbox = []; }
  var OUTBOX_MAX = 60, OUTBOX_TTL = 86400000; /* 1 day */
  var outboxFlushTimer = 0;
  function saveOutbox() {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox.slice(-OUTBOX_MAX))); } catch (e) {}
  }
  function enqueue(body, label) {
    outbox.push({ b: body, tag: label || '', r: room, t: Date.now(), tries: 0 });
    if (outbox.length > OUTBOX_MAX) outbox = outbox.slice(-OUTBOX_MAX);
    saveOutbox();
    flushOutbox();
  }
  /* Send everything still awaiting an acknowledgement, oldest first, so a
     "clear all" can never overtake the messages it is meant to remove. */
  function flushOutbox() {
    if (!enabled || !outbox.length) return;
    clearTimeout(outboxFlushTimer);
    var now = Date.now();
    var pending = outbox.filter(function (it) { return now - it.t < OUTBOX_TTL && (!it.r || it.r === room); });
    if (pending.length !== outbox.length) { outbox = pending; saveOutbox(); }
    outbox.forEach(function (item) {
      if (item.busy) return;
      item.busy = true; item.tries++;
      post(item.b, function () {
        item.busy = false;
        var i = outbox.indexOf(item);
        if (i !== -1) { outbox.splice(i, 1); saveOutbox(); }
      }, function () {
        item.busy = false;
      });
    });
    /* Anything that failed stays queued; try again shortly. */
    if (outbox.length) outboxFlushTimer = setTimeout(flushOutbox, 4000);
  }
  var lastPublishKey = {}, publishedChatIds = {};
  /* Catch-up cursor. Captured at module load, before the live stream can
     touch lastTime, so the first sync really does replay recent history. */
  var bootSince = 0, catchupDone = false;
  var bootAt = Date.now();
  try { lastTime = Number(localStorage.getItem(LAST_SEEN_KEY) || 0) || 0; } catch (e) {}
  /* The cursor is a relay timestamp in SECONDS; normalise it so an old
     millisecond value cannot be mistaken for a very recent time. */
  if (lastTime > 1e12) lastTime = Math.floor(lastTime / 1000);
  /* Only skip the history replay when the cursor is genuinely recent. A
     device that was away for days must replay, otherwise it silently misses
     everything the admin changed while it was offline. */
  var cursorFresh = lastTime && (bootAt - lastTime * 1000) < MAX_DELTA_AGE;
  bootSince = cursorFresh ? lastTime : CATCHUP_WINDOW;
  catchupDone = !!cursorFresh;
  function markSeen(t) {
    if (!t) return;
    t = Number(t) || 0;
    if (t > 1e12) t = Math.floor(t / 1000);   /* accept ms too */
    lastTime = Math.max(lastTime, t);
    try { localStorage.setItem(LAST_SEEN_KEY, String(lastTime)); } catch (e) {}
  }

  function saveSettings() {
    var prev = rawGet('aia_relay_cfg', {}) || {};
    rawSet('aia_relay_cfg', { room: room, enabled: enabled, host: prev.host || SERVERS[serverIdx] });
  }

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
  /* Ephemeral typing presence is intentionally not stored in localStorage. Each
     heartbeat is forwarded as a tiny relay message so different phones can
     see it in real time. */
  document.addEventListener('aia-typing-out', function (e) {
    var m = e.detail || {};
    if (!enabled || !m.user || !m.from || m.from === device.id) return;
    enqueue(JSON.stringify({ a: 'a10a', f: device.id, n: device.name, q: 'typing', d: {
      u: String(m.user), n: String(m.name || 'Someone'), a: m.active !== false ? 1 : 0
    }}), 'typing');
  });

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
      else if (k === 'aia_ai_config') v = stripAiSecrets(v);
      var size = sk.length + v.length + 6;
      if (payloadBytes + size > MAX_BYTES) flush();
      payload[sk] = v;
      payloadBytes += size;
    });
    flush();
    /* Queued rather than posted directly: if the relay rate-limits or is
       briefly unreachable the payload is retried instead of being lost. */
    queue.forEach(function (body) { enqueue(body, 'delta'); });
  }

  /* -------- full-state beacon --------
     BroadcastChannel covers same-origin tabs, and the stream covers anything
     posted while a device was online. Neither helps a phone that was closed
     while the admin made changes and whose relay history has since expired.
     So a joining device asks for the state, and whoever has it replays the
     whole thing (chunked) into the room. */
  var lastAnswered = 0, helloSoon = 0;
  function answerState() {
    if (!window.AiaSync || !window.AiaSync.snapshot) return;
    var snap;
    try { snap = window.AiaSync.snapshot({ photos: false, ai: false, activity: false }); }
    catch (e) { return; }
    if (!snap || !snap.data) return;
    var entries = Object.keys(snap.data);
    if (!entries.length) return;
    /* Split into small chunks so no single post hits the relay's size cap. */
    var chunk = {}, chunkBytes = 0, parts = [];
    function flushChunk() {
      if (!Object.keys(chunk).length) return;
      parts.push(chunk); chunk = {}; chunkBytes = 0;
    }
    entries.forEach(function (k) {
      var sk = shortKey(k);
      if (!sk) return;
      var v;
      try { v = JSON.stringify(snap.data[k]); } catch (e) { return; }
      if (k === 'aia_ai_config') v = stripAiSecrets(v);
      if (k === 'aia_ai_log') return;
      if (v == null) return;
      var size = sk.length + v.length + 8;
      if (chunkBytes + size > MAX_BYTES) flushChunk();
      chunk[sk] = v; chunkBytes += size;
    });
    flushChunk();
    parts.forEach(function (part) {
      enqueue(JSON.stringify({ a: 'a10a', f: device.id, n: device.name, q: 'state', d: part }), 'state');
    });
  }
  /* Only one device needs to answer, and it should not answer every join.
     A short jitter keeps several devices from replying at the same instant. */
  function maybeAnswerHello() {
    if (!enabled) return;
    var now = Date.now();
    if (now - lastAnswered < 20000) return;
    if (helloSoon) return;
    helloSoon = setTimeout(function () {
      helloSoon = 0;
      lastAnswered = Date.now();
      answerState();
    }, 400 + Math.random() * 1600);
  }
  function sayHello() {
    if (!enabled) return;
    post(JSON.stringify({ a: 'a10a', f: device.id, n: device.name, q: 'hello', d: {} }));
  }

  /* Defence in depth: even if a stale config blob still carries a key, it
     must never leave the device. The relay room is public and readable by
     anyone who knows the room name, so the key is removed here as well as
     at the storage layer. */
  function stripAiSecrets(jsonStr) {
    try {
      var cfg = JSON.parse(jsonStr);
      if (cfg && typeof cfg === 'object') {
        delete cfg.apiKey; delete cfg.api_key; delete cfg.key;
        return JSON.stringify(cfg);
      }
      return '{}';
    } catch (e) { return '{}'; }
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

  /* Publishers send to EVERY relay, not just one. The public ntfy mirrors are
     independent servers: a message posted to envs.net is invisible on
     mzte.de and vice versa. Devices pick whichever host answered for them,
     so publishing to a single relay meant a reader on a different mirror
     only learned about the message on its next all-relay safety poll — the
     ~30s "chat sync is broken" delay. Fanning out costs one small POST per
     relay and makes delivery immediate whichever mirror each device chose. */
  /* A relay that just timed out is skipped for a while. Without this, every
     catch-up waited out the dead host's full 8s deadline before the batch
     finished — which is what made every sync feel slow even when a healthy
     mirror answered instantly. */
  var downUntil = {}, DOWN_MS = 60000;
  function markUp(i) { delete downUntil[i]; }
  function liveServers() {
    var now = Date.now(), out = [];
    for (var i = 0; i < SERVERS.length; i++) if (!downUntil[i] || downUntil[i] <= now) out.push(i);
    /* Cooldown is an optimisation, not a circuit breaker: if every relay is
       cooling down, still ask them rather than going silent. */
    if (!out.length) for (var j = 0; j < SERVERS.length; j++) out.push(j);
    return out;
  }

  function post(body, onOk, onFail) {
    var anyOk = false;
    var preferred = serverIdx;
    var order = [preferred];
    for (var i = 0; i < SERVERS.length; i++) if (i !== preferred) order.push(i);
    order.forEach(function (idx, n) {
      try {
        fetchWithTimeout(SERVERS[idx] + '/' + room, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: body,
          cache: 'no-store'
        }).then(function (r) {
          if (!r.ok || r.status === 429 || r.status >= 500) return;
          anyOk = true;
          /* The preferred relay is the first in `order`, so a healthy answer
             from it can be trusted as this device's primary host. */
          if (n === 0) serverIdx = idx;
          if (onOk) { try { onOk(); } catch (e) {} }
        }).catch(function () {}).then(function () {
          if (n === order.length - 1 && !anyOk) { fails(); if (onFail) { try { onFail(); } catch (e) {} } }
        });
      } catch (e) { if (n === order.length - 1 && !anyOk) { fails(); if (onFail) { try { onFail(); } catch (e) {} } } }
    });
  }
  function fails() { sseFails++; if (sseFails >= 3) setStatus('error', 'Relay unreachable — local sync unaffected'); }

  /* -------- receiving -------- */
  function applyMessage(msg, fromNtfy) {
    if (!msg || msg.a !== 'a10a') return;
    if (msg.f === device.id) return;               /* our own echo */
    if (fromNtfy && seen[fromNtfy]) return;
    if (fromNtfy) seen[fromNtfy] = 1;
    /* A device that has just joined asks for the current state. Anyone who
       has it answers, so a phone opening the site gets everything at once
       even if the relay's own history has already expired. */
    if (msg.q === 'hello') { maybeAnswerHello(); return; }
    if (msg.q === 'typing') {
      try { document.dispatchEvent(new CustomEvent('aia-typing', { detail: {
        t: 'typing', user: msg.d.u, name: msg.d.n || 'Someone', active: !!msg.d.a, from: msg.f
      }})); } catch (e) {}
      return;
    }
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
    var opened = false;
    try {
      es = new EventSource(base() + '/' + room + '/sse');
    } catch (e) { setPolling(8000); return; }
    /* A dead relay leaves the EventSource sitting in CONNECTING forever with
       no error, so the stream never reports failure and the device stays
       silently offline. If it has not opened in time, treat it as an error
       and fail over. */
    var watchdog = setTimeout(function () {
      if (opened) return;
      closeStream();
      sseFails++;
      rotate('No answer from the live relay — trying a backup');
      setPolling(5000);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 1500);
    }, WATCHDOG_MS);
    es.onopen = function () {
      opened = true;
      clearTimeout(watchdog);
      sseFails = 0;
      rememberHost(SERVERS.indexOf(base()));
      setStatus('live');
      setPolling(30000);                  /* SSE healthy → occasional safety poll */
      flushOutbox();                      /* retire anything queued while offline */
      sayHello();                         /* ask whoever is online for the state */
      /* Reconcile anything we missed while the stream was down (or, on a
         first load, whatever was already in the room). */
      catchUp();
    };
    es.onmessage = function (ev) { handleNtfyEvent(ev); };
    es.onerror = function () {
      opened = true;                      /* stop the watchdog duplicating this path */
      clearTimeout(watchdog);
      closeStream();
      sseFails++;
      setStatus('error', 'Live link dropped — catching up');
      /* Exponential backoff: the free public relay rate-limits aggressive
         reconnects (HTTP 429), and hammering it makes recovery slower, not
         faster. Reset happens on a successful open. */
      var wait = Math.min(4000 * Math.pow(1.7, Math.min(sseFails - 1, 5)), 90000);
      setPolling(Math.min(5000 * sseFails, 60000));
      /* Repeated early failures mean this host is not working at all — move on. */
      if (sseFails >= 2) rotate('Live relay unresponsive — switching relay');
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

    /* Read from EVERY relay, not just the first that answers. Devices pick a
       relay independently (whichever responded for them), so a message may
       have been published to any of them; stopping at the first host with
       history would silently miss whatever another device posted elsewhere.
       Message ids are deduplicated in ingestLine(), so overlapping history is
       harmless. */
    var rateLimited = false, pending = 0, any = false;
    function finish() {
      pending--;
      if (pending > 0) return;
      catchingUp = false;
      if (!any) {
        rotate('Relays not answering — trying a backup');
        if (rateLimited) setPolling(Math.min((pollEvery || 5000) * 2, 60000));
      }
    }
    var idxs = liveServers();
    pending = idxs.length;
    if (!pending) { catchingUp = false; return; }
    idxs.forEach(function (idx) {
      var host = SERVERS[idx];
      fetchWithTimeout(host + '/' + room + '/json?poll=1&since=' + since,
            { cache: 'no-store' })
        .then(function (r) {
          if (r.status === 429 || r.status >= 500) { rateLimited = true; return null; }
          if (!r.ok) return null;
          return r.text();
        })
        .then(function (text) {
          if (text === null) { finish(); return; }
          markUp(idx);
          if (!any) rememberHost(idx);        /* first relay to answer wins */
          any = true;
          if (!text.length) { finish(); return; }
          ingest(text, finish);
        })
        .catch(function () { downUntil[idx] = Date.now() + DOWN_MS; finish(); });
    });
  }

  /* -------- local change → publish -------- */
  document.addEventListener('aia-local-write', function (e) {
    var key = e.detail && e.detail.key;
    if (!key || !shortKey(key)) return;
    dirty[key] = 1;
    clearTimeout(pushTimer);
    /* A chat message is a conversation, not a setting — batching it for
       140ms is enough to make the sender wait for the next poll, which is
       the "it only shows after a refresh" report. Chat goes out at once;
       everything else stays batched so a burst of edits is one post. */
    if (key === 'aia_class_chat' || key === 'aia_class_chat_deleted' || key === 'aia_class_chat_cleared') {
      var keys = Object.keys(dirty); dirty = {};
      publish(keys);
      return;
    }
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
      setTimeout(flushOutbox, 600);       /* send anything queued in a past session */
      setTimeout(function () { catchUp(); }, 400);   /* replay history as early as possible */
      /* Also ask live peers for their state: covers the case where this
         device was away long enough for the relay history to have expired. */
      setTimeout(sayHello, 1200);
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
      /* Queued payloads belong to the old room; sending them into the new one
         would leak one class's chat into another's. */
      outbox = []; saveOutbox(); clearTimeout(outboxFlushTimer);
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
    /* Send a payload straight into the durable queue. Used by the chat UI as
       a belt-and-braces path so an admin "clear all" reaches the room even
       if the storage event that normally triggers a publish was missed. */
    sendNow: function (obj) {
      if (!enabled) return false;
      try { enqueue(JSON.stringify(obj), 'direct'); } catch (e) { return false; }
      return true;
    },
    pending: function () { return outbox.length; },
    flush: function () { flushOutbox(); },
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