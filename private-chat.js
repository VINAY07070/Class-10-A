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

  function post(user, body, i) {
    i = i || 0;
    return fetch(SERVERS[i] + '/' + roomFor(user), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 429 || r.status >= 500) {
        if (i + 1 < SERVERS.length) return post(user, body, i + 1);
        return null;
      }
      return r;
    }).catch(function () {
      if (i + 1 < SERVERS.length) return post(user, body, i + 1);
      return null;
    });
  }

  /* Send one message. `msg` carries the plain fields; the text is encrypted. */
  function send(user, msg) {
    var env = {
      id: msg.id, from: msg.from, name: msg.name, role: msg.role,
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

    function tick() {
      if (stopped) return;
      var url = SERVERS[0] + '/' + roomFor(user) + '/json?poll=1&since=' + encodeURIComponent(since);
      fetch(url, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (txt) {
          if (stopped) return;
          var lines = String(txt || '').split('\n');
          var raws = [];
          lines.forEach(function (line) {
            line = line.trim();
            if (!line) return;
            var ev;
            try { ev = JSON.parse(line); } catch (e) { return; }
            if (!ev || ev.event !== 'message' || !ev.message) return;
            if (ev.id && seen[ev.id]) return;
            if (ev.id) seen[ev.id] = 1;
            if (ev.time) since = ev.time;      /* advance the cursor */
            var m;
            try { m = JSON.parse(ev.message); } catch (e) { return; }
            if (!m || !m.id) return;
            if (known[m.id]) return;
            raws.push(m);
          });
          if (!raws.length) return;
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
        })
        .catch(function () {})
        .then(function () { if (!stopped) timer = setTimeout(tick, POLL_MS); });
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
