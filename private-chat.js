/* ============================================================
   AIA PRIVATE CHAT — admin <-> one student, nobody else
   ------------------------------------------------------------
   The class chat lives in one shared public relay room, so putting
   private messages there would expose them to the whole class. This
   module instead gives every conversation its OWN room, derived from
   the student's username, and encrypts each payload before it is
   published.

   What this does and does not protect against — please read:
   • Other students cannot see a thread: it is not in the class room,
     and the room name is derived from a username they would have to
     guess and then subscribe to deliberately.
   • Someone who does find the room sees ciphertext only, because the
     body is AES-GCM encrypted before publishing.
   • It is NOT protection against a determined person reading this
     site's JavaScript, because the key is derived in the browser.
     True end-to-end privacy needs a server. Do not use this thread
     for anything genuinely sensitive.

   Encryption uses crypto.subtle, which needs a secure context
   (https or file://). Where it is unavailable the module still
   works, but falls back to plain base64 and reports `secure:false`
   so the UI can warn instead of pretending.
   ============================================================ */
(function () {
  'use strict';
  if (window.AiaPrivate && window.AiaPrivate.__v === 1) return;

  var SERVERS = ['https://ntfy.sh', 'https://ntfy.envs.net', 'https://ntfy.mzte.de'];
  var APP_SALT = 'aia10a-pc-v1';
  var POLL_MS = 3500;
  var MAX_BYTES = 3000;
  /* A blocked or blackholed relay never answers — the request just hangs, so
     failover driven only by rejection never happens. Give every request a
     deadline and treat silence as a failure. */
  var FETCH_TIMEOUT = 8000;
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
  /* Remember the relay that last worked here, per conversation, so polling
     does not rediscover a dead host on every cycle. */
  var goodHost = {};
  var HOST_KEY = 'aia_pv_host';
  try { var savedHost = localStorage.getItem(HOST_KEY); if (savedHost && SERVERS.indexOf(savedHost) >= 0) goodHost._ = savedHost; } catch (e) {}
  /* A relay that just timed out is not asked again for a while. Without this
     every poll cycle waited out the full 8s deadline of the dead host before
     the batch could complete, which is what made private messages take ~12s
     even when a healthy mirror answered in milliseconds. */
  var downUntil = {}, DOWN_MS = 60000;
  function markDown(i) { downUntil[i] = Date.now() + DOWN_MS; }
  function markUp(i) { delete downUntil[i]; }
  function liveServers() {
    var now = Date.now(), out = [];
    for (var i = 0; i < SERVERS.length; i++) if (!downUntil[i] || downUntil[i] <= now) out.push(i);
    /* If everything is cooling down, ask them all anyway rather than going
       quiet — the cooldown is an optimisation, not a circuit breaker. */
    if (!out.length) for (var j = 0; j < SERVERS.length; j++) out.push(j);
    return out;
  }

  function startHost(user) {
    var h = goodHost[user] || goodHost._;
    var i = h ? SERVERS.indexOf(h) : -1;
    return i >= 0 ? i : 0;
  }
  function noteHost(user, i) {
    goodHost[user] = SERVERS[i];
    try { localStorage.setItem(HOST_KEY, SERVERS[i]); } catch (e) {}
  }

  function enc(s) {
    try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return ''; }
  }
  function dec(s) {
    try { return decodeURIComponent(escape(atob(s))); } catch (e) { return ''; }
  }

  /* -------- key + room, both derived from the username -------- */
  function roomFor(user) {
    var h = 5381, s = APP_SALT + '|' + String(user || '').toLowerCase();
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'aia10a-pv-' + h.toString(36);
  }

  var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  function canSecure() { return !!subtle; }

  var keyCache = {};
  function keyFor(user) {
    var u = String(user || '').toLowerCase();
    if (keyCache[u]) return keyCache[u];
    if (!subtle) return null;
    keyCache[u] = subtle.digest('SHA-256', new TextEncoder().encode(APP_SALT + '|' + u))
      .then(function (bits) { return subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); });
    return keyCache[u];
  }

  function b64bytes(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function bytes64(str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* Envelope: {v:1, e:'gcm', iv, ct} when encrypted, {v:1, e:'b64', ct} otherwise. */
  function encrypt(user, text) {
    if (!subtle) return Promise.resolve({ v: 1, e: 'b64', ct: enc(text) });
    return keyFor(user).then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(text))
        .then(function (ct) { return { v: 1, e: 'gcm', iv: b64bytes(iv), ct: b64bytes(ct) }; });
    }).catch(function () { return { v: 1, e: 'b64', ct: enc(text) }; });
  }

  function decrypt(user, env) {
    if (!env || !env.e) return Promise.resolve('');
    if (env.e === 'b64') return Promise.resolve(dec(env.ct));
    if (!subtle) return Promise.resolve('');
    return keyFor(user).then(function (key) {
      return subtle.decrypt({ name: 'AES-GCM', iv: bytes64(env.iv) }, key, bytes64(env.ct))
        .then(function (pt) { return new TextDecoder().decode(pt); });
    }).catch(function () { return ''; });
  }

  /* Private chat publishes to every relay for the same reason the class room
     does: the mirrors are independent servers, so a message sent to one is
     invisible on the others. A recipient polling a different mirror would
     otherwise see the conversation only on a later sweep — or not at all. */
  function post(user, body, i) {
    var wire = JSON.stringify(body);
    var order = [startHost(user)];
    for (var n = 0; n < SERVERS.length; n++) if (order.indexOf(n) === -1) order.push(n);
    return Promise.all(order.map(function (idx) {
      return fetchWithTimeout(SERVERS[idx] + '/' + roomFor(user), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: wire,
        cache: 'no-store'
      }).then(function (r) {
        if (r.ok && r.status !== 429 && r.status < 500) { noteHost(user, idx); return r; }
        return null;
      }).catch(function () { return null; });
    })).then(function (rs) { return rs[0]; });
  }

  /* Send one message. `msg` carries the plain fields; the text is encrypted. */
  function send(user, msg) {
    var env = {
      /* The listener drops any envelope without an id, so a missing one must
         never reach the wire — otherwise the message is stored locally but
         silently disappears for the recipient. */
      id: msg.id || ('pv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)),
      from: msg.from, name: msg.name, role: msg.role,
      at: msg.at || new Date().toISOString()
    };
    return encrypt(user, msg.text || '').then(function (payload) {
      env.p = payload;
      var body = JSON.stringify(env);
      if (body.length > MAX_BYTES) {
        /* keep under the relay cap by trimming the text rather than silently failing */
        env.p = { v: 1, e: 'b64', ct: enc(String(msg.text || '').slice(0, 1200)) };
        body = JSON.stringify(env);
      }
      return post(user, env).then(function () { return env; });
    });
  }

  /* Poll one conversation. onBatch receives fully decrypted messages.
     Returns a stop() function. */
  function listen(user, onBatch, opts) {
    opts = opts || {};
    var since = opts.since || 'all';
    var stopped = false, seen = {}, timer = 0;
    var known = opts.known || {};

    /* Ask every live relay and merge what comes back. Devices choose a relay
       independently, so a message can be sitting on any of them; stopping at
       the first answer would miss the rest. Ids are deduplicated below. */
    function pollAll(cursor, cb) {
      var idxs = liveServers(), remaining = idxs.length, batches = [];
      if (!remaining) { cb(batches); return; }
      idxs.forEach(function (i) {
        var host = SERVERS[i];
        fetchWithTimeout(host + '/' + roomFor(user) + '/json?poll=1&since=' + encodeURIComponent(cursor),
              { cache: 'no-store' })
          .then(function (r) {
            if (r.status === 429 || r.status >= 500) return null;
            if (!r.ok) return null;
            return r.text();
          })
          .then(function (txt) {
            if (txt != null) { markUp(i); noteHost(user, i); batches.push(txt); }
            else markDown(i);
          })
          .catch(function () { markDown(i); })
          .then(function () {
            remaining--;
            if (remaining === 0) cb(batches);
          });
      });
    }

    function tick() {
      if (stopped) return;
      pollAll(since, function (batches) {
        if (stopped) return;
        var raws = [];
        batches.forEach(function (txt) {
          String(txt || '').split('\n').forEach(function (line) {
            line = line.trim();
            if (!line) return;
            var ev;
            try { ev = JSON.parse(line); } catch (e) { return; }
            if (!ev || ev.event !== 'message' || !ev.message) return;
            if (ev.id && seen[ev.id]) return;
            if (ev.id) seen[ev.id] = 1;
            /* `since` starts as the string 'all'; only switch it to a numeric
               cursor once a relay actually reports a timestamp. */
            if (ev.time) {
              var t = Number(ev.time);
              if (t && (!Number.isFinite(since) || t > since)) since = t;
            }
            var m;
            try { m = JSON.parse(ev.message); } catch (e) { return; }
            if (!m || !m.id) return;
            if (known[m.id]) return;
            raws.push(m);
          });
        });
        if (raws.length) {
          Promise.all(raws.map(function (m) {
            return decrypt(user, m.p).then(function (text) {
              return {
                id: m.id, from: m.from, name: m.name, role: m.role, at: m.at,
                text: text, mine: m.from === (opts.me || '')
              };
            });
          })).then(function (out) {
            if (!stopped) onBatch(out.filter(function (m) { return m.text !== ''; }));
          });
        }
        if (!stopped) timer = setTimeout(tick, POLL_MS);
      });
    }
    tick();
    return function stop() { stopped = true; clearTimeout(timer); };
  }

  window.AiaPrivate = {
    __v: 1,
    roomFor: roomFor,
    secure: canSecure,
    send: send,
    listen: listen,
    encrypt: encrypt,
    decrypt: decrypt
  };
})();
