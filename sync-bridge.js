/* ============================================================
   AIA SYNC v2 — 100% SERVERLESS synchronization
   ------------------------------------------------------------
   No server needed. Ever. Works from file:// too.

   • Same device, all tabs ........ BroadcastChannel + storage
   • Other phones / PCs ........... Sync Codes (copy/paste),
                                     backup Files, or LIVE P2P
                                     (WebRTC data-channel with
                                     manual codes — no server,
                                     STUN only helps NAT)
   • Deployed with server? ......... optional merge-bridge to
                                     /api/state (merge, never
                                     overwrite — old bug fixed)

   Syncs: class chat, comments, polls + votes, homework,
   announcements, scores, profiles, subjects + photos,
   theme, AI config, activity — with smart per-key merge.
   ============================================================ */
(function () {
  'use strict';
  if (window.AiaSync && window.AiaSync.__v === 2) return;

  /* ---------------- tiny helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36); }
  function toast(msg, type) {
    try {
      if (window.App && App.showToast) { App.showToast(msg, type || 'info'); return; }
    } catch (e) {}
    try {
      var d = document.createElement('div');
      d.textContent = msg;
      d.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a2440;color:#fff;padding:10px 18px;border-radius:12px;z-index:9999;font:600 13px system-ui;border:1px solid rgba(255,255,255,.2)';
      document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
    } catch (e2) {}
  }
  function rawGet(k) { try { var v = localStorage.getItem(k); return v === null ? undefined : JSON.parse(v); } catch (e) { return undefined; } }
  function rawSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function b64e(str) { try { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch (e) { return ''; } }
  function b64d(str) { try { str = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return decodeURIComponent(escape(atob(str))); } catch (e) { return ''; } }
  function fmtSize(n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(2) + ' MB'; }
  function timeAgo(ts) { var d = Date.now() - ts; if (d < 8000) return 'just now'; if (d < 60000) return Math.floor(d / 1000) + 's ago'; if (d < 3600000) return Math.floor(d / 60000) + 'm ago'; return new Date(ts).toLocaleString(); }

  /* ---------------- identity / meta ---------------- */
  var DEVICE_KEY = 'aia_device', META_KEY = 'aia_sync_meta_v2';
  var device = rawGet(DEVICE_KEY);
  if (!device || !device.id) {
    var animals = ['Tiger', 'Falcon', 'Panda', 'Dolphin', 'Eagle', 'Lion', 'Fox', 'Wolf', 'Bear', 'Hawk'];
    device = { id: uid('dev'), name: animals[(Math.random() * animals.length) | 0] + '-' + Math.floor(100 + Math.random() * 900) };
    rawSet(DEVICE_KEY, device);
  }
  var meta = rawGet(META_KEY) || {};
  function saveMeta() { rawSet(META_KEY, meta); }
  function touchMeta(key) {
    meta[key] = { rev: (meta[key] && meta[key].rev || 0) + 1, at: Date.now(), by: device.id };
    saveMeta();
  }

  /* ---------------- synced keys ---------------- */
  var LWW = 'lww', UNION = 'union', MAP = 'map', POLLS = 'polls', PROFILES = 'profiles', SUBJ = 'subj', PHOTOS = 'photos', VOTES = 'votes', CHATKEYS = 'aichat';
  /* Append-style, oldest-first collections that must be trimmed by time. */
  var BY_TIME_KEYS = { 'aia_class_chat': 1, 'aia_activity_log': 1, 'aia_ai_log': 1, 'aia_class_chat_deleted': 1 };
  var SYNC_DEFS = {};
  function def(key, kind, cap) { SYNC_DEFS[key] = { kind: kind, cap: cap || 0 }; }
  ['aia_students', 'aia_teachers', 'aia_leadership', 'aia_ai_config', 'aia_github_data',
   'aia_credentials_overrides', 'aia_theme_plain', 'aia_chat_mode'
  ].forEach(function (k) { def(k, LWW); });
  def('aia_theme', LWW); // note: stored as raw string, handled specially
  def('aia_homework', UNION, 300);
  def('aia_files', UNION, 120);
  def('aia_announcements', UNION, 300);
  def('aia_test_scores', UNION, 600);
  def('aia_class_chat', UNION, 500);
  def('aia_class_chat_deleted', UNION, 600);
  def('aia_ai_log', UNION, 400);
  def('aia_activity_log', UNION, 400);
  def('aia_presence', MAP, 60);
  def('aia_comments', MAP, 0);
  def('aia_poll_votes', VOTES);
  def('aia_polls', POLLS, 60);
  def('aia_student_profiles', PROFILES, 120);
  def('aia_subject_content', SUBJ);
  def('aia_subject_photos', PHOTOS);

  function isSyncedKey(k) {
    if (SYNC_DEFS[k]) return true;
    return k && k.indexOf('aia_ai_chat_') === 0;
  }
  function kindOf(k) {
    if (SYNC_DEFS[k]) return SYNC_DEFS[k].kind;
    if (k.indexOf('aia_ai_chat_') === 0) return CHATKEYS;
    return null;
  }

  /* theme is stored as a plain string, not JSON */
  function readKey(k) {
    if (k === 'aia_theme') { try { return localStorage.getItem('aia_theme'); } catch (e) { return null; } }
    return rawGet(k);
  }
  function writeKey(k, v) {
    window.__aiaApplying = true;
    try {
      if (k === 'aia_theme') {
        try { localStorage.setItem('aia_theme', v); } catch (e) {}
        if (v) document.documentElement.setAttribute('data-theme', v);
      } else rawSet(k, v);
    } finally { window.__aiaApplying = false; }
  }

  /* ---------------- merge engine ---------------- */
  function itemId(it, i) {
    if (it && typeof it === 'object') {
      if (it.id) return 'id:' + it.id;
      if (it.student_name && it.test_name) return 'sc:' + it.student_name + '|' + it.test_name + '|' + it.score;
      if (it.name && it.username && it.content && it.at) return 'chat:' + it.username + '|' + it.at + '|' + String(it.content).length + '|' + String(it.content).slice(0, 24);
      if (it.author && it.text && it.at) return 'cm:' + it.author + '|' + it.at + '|' + String(it.text).slice(0, 30);
      if (it.question) return 'poll:' + it.question;
      if (it.title && it.body) return 'ann:' + it.title + '|' + String(it.body).slice(0, 30);
      if (it.subject && it.task) return 'hw:' + it.subject + '|' + String(it.task).slice(0, 30);
      if (it.user && it.page && it.at) return 'ac:' + it.user + '|' + it.page + '|' + it.at;
      if (it.role && it.content && it.at) return 'ai:' + it.role + '|' + it.at + '|' + String(it.content).length;
      if (it.user && it.role && it.content && it.at) return 'ail:' + it.user + '|' + it.at + '|' + String(it.content).length;
    }
    return 'idx:' + i + ':' + JSON.stringify(it).slice(0, 60);
  }
  function tsOf(it) {
    if (!it || typeof it !== 'object') return 0;
    var t = it.at || it.created_at || it.updatedAt || it.updated_at || it.date;
    var n = t ? new Date(t).getTime() : 0;
    return isNaN(n) ? 0 : n;
  }
  function unionMerge(localArr, remoteArr, cap, byTime) {
    localArr = Array.isArray(localArr) ? localArr : [];
    remoteArr = Array.isArray(remoteArr) ? remoteArr : [];
    var seen = {}, out = [];
    localArr.forEach(function (it, i) { var id = itemId(it, i); if (!seen[id]) { seen[id] = 1; out.push(it); } });
    var added = 0;
    var extra = [];
    remoteArr.forEach(function (it, i) {
      var id = itemId(it, i);
      if (!seen[id]) { seen[id] = 1; extra.push(it); added++; }
    });
    out = out.concat(extra);
    /* Append-style streams (chat, activity, AI logs) are oldest-first, so a
       plain tail slice would throw away the NEWEST entries. Trim them by time. */
    if (cap && out.length > cap) {
      if (byTime) out = out.slice().sort(function (a, b) { return tsOf(a) - tsOf(b); });
      out = out.slice(-cap);
    }
    return { value: out, changed: added > 0, added: added };
  }
  function newerOf(a, b) {
    var ta = (a && (a.updatedAt || a.updated_at || a.at)) || 0;
    var tb = (b && (b.updatedAt || b.updated_at || b.at)) || 0;
    return (new Date(tb).getTime() || 0) > (new Date(ta).getTime() || 0) ? b : a;
  }
  function mergeValues(key, localV, remoteV) {
    if (remoteV === undefined) return { value: localV, changed: false, added: 0 };
    if (localV === undefined) return { value: remoteV, changed: true, added: 1 };
    var kind = kindOf(key), cap = SYNC_DEFS[key] ? SYNC_DEFS[key].cap : 80;
    if (kind === LWW) {
      var a = JSON.stringify(localV), b = JSON.stringify(remoteV);
      if (a === b) return { value: localV, changed: false, added: 0 };
      return { value: remoteV, changed: true, added: 1, conflict: true };
    }
    if (kind === UNION || kind === CHATKEYS) {
      var byTime = (kind === CHATKEYS) || BY_TIME_KEYS[key] === 1;
      var r = unionMerge(localV, remoteV, cap, byTime);
      /* chat tombstones win: never resurrect a message the class deleted */
      if (key === 'aia_class_chat') {
        var dead = SYNC_DEFS['aia_class_chat_deleted'] ? readKey('aia_class_chat_deleted') : null;
        if (Array.isArray(dead) && dead.length) {
          var filtered = r.value.filter(function (m) { return !m || !m.id || dead.indexOf(m.id) === -1; });
          if (filtered.length !== r.value.length) { r.value = filtered; r.changed = true; }
        }
      }
      return r;
    }
    if (kind === VOTES) {
      var m = Object.assign({}, localV), added = 0;
      Object.keys(remoteV || {}).forEach(function (k) { if (m[k] === undefined) { m[k] = remoteV[k]; added++; } });
      return { value: m, changed: added > 0, added: added };
    }
    if (kind === MAP) {
      var mm = Object.assign({}, localV), ad = 0;
      Object.keys(remoteV || {}).forEach(function (k) {
        if (Array.isArray(remoteV[k])) {
          var r = unionMerge(mm[k], remoteV[k], 200);
          mm[k] = r.value; ad += r.added;
        } else if (mm[k] === undefined) { mm[k] = remoteV[k]; ad++; }
        else if (JSON.stringify(mm[k]) !== JSON.stringify(remoteV[k])) { mm[k] = newerOf(mm[k], remoteV[k]); ad++; }
      });
      return { value: mm, changed: ad > 0, added: ad };
    }
    if (kind === PROFILES) {
      var byName = {}, order = [];
      (Array.isArray(localV) ? localV : []).forEach(function (p) {
        var n = String(p.student_name || '').toUpperCase();
        if (!byName[n]) { byName[n] = p; order.push(n); } else byName[n] = newerOf(byName[n], p);
      });
      var ad2 = 0;
      (Array.isArray(remoteV) ? remoteV : []).forEach(function (p) {
        var n = String(p.student_name || '').toUpperCase();
        if (!byName[n]) { byName[n] = p; order.push(n); ad2++; }
        else { var w = newerOf(byName[n], p); if (w !== byName[n]) { byName[n] = w; ad2++; } }
      });
      return { value: order.map(function (n) { return byName[n]; }), changed: ad2 > 0, added: ad2 };
    }
    if (kind === POLLS) {
      var list = Array.isArray(localV) ? localV.slice() : [];
      var idx = {};
      list.forEach(function (p, i) { idx[itemId(p, i)] = i; });
      var ad3 = 0;
      (Array.isArray(remoteV) ? remoteV : []).forEach(function (rp, i) {
        var id = itemId(rp, i);
        if (idx[id] === undefined) { list.unshift(rp); ad3++; return; }
        var lp = list[idx[id]];
        /* merge voter maps (first vote wins per user) */
        lp._votes = lp._votes || {}; rp._votes = rp._votes || {};
        Object.keys(rp._votes).forEach(function (u) { if (lp._votes[u] === undefined) { lp._votes[u] = rp._votes[u]; ad3++; } });
        /* legacy counts: take max */
        lp._voteCounts = lp._voteCounts || {}; rp._voteCounts = rp._voteCounts || {};
        Object.keys(rp._voteCounts).forEach(function (o) {
          var nv = Math.max(lp._voteCounts[o] || 0, rp._voteCounts[o] || 0);
          if (nv !== (lp._voteCounts[o] || 0)) { lp._voteCounts[o] = nv; ad3++; }
        });
        if ((rp.options || []).length > (lp.options || []).length) { lp.options = rp.options; ad3++; }
      });
      if (cap && list.length > cap) list = list.slice(0, cap);
      return { value: list, changed: ad3 > 0, added: ad3 };
    }
    if (kind === SUBJ) {
      var s = Object.assign({}, localV), ad4 = 0;
      Object.keys(remoteV || {}).forEach(function (k) {
        if (s[k] === undefined) { s[k] = remoteV[k]; ad4++; }
        else { var w = newerOf(s[k], remoteV[k]); if (JSON.stringify(w) !== JSON.stringify(s[k])) { s[k] = w; ad4++; } }
      });
      return { value: s, changed: ad4 > 0, added: ad4 };
    }
    if (kind === PHOTOS) {
      var ph = Object.assign({}, localV), ad5 = 0;
      Object.keys(remoteV || {}).forEach(function (subj) {
        var la = Array.isArray(ph[subj]) ? ph[subj].slice() : [];
        var seen = {};
        la.forEach(function (p) { seen[String(p).length + ':' + String(p).slice(30, 80)] = 1; });
        (remoteV[subj] || []).forEach(function (p) {
          var h = String(p).length + ':' + String(p).slice(30, 80);
          if (!seen[h]) { seen[h] = 1; la.push(p); ad5++; }
        });
        ph[subj] = la.slice(-24);
      });
      return { value: ph, changed: ad5 > 0, added: ad5 };
    }
    return { value: localV, changed: false, added: 0 };
  }

  var lastSyncAt = 0, lastSyncInfo = 'never';
  function applyRemote(key, remoteV, from) {
    if (!isSyncedKey(key)) return 0;
    var m = mergeValues(key, readKey(key), remoteV);
    if (!m.changed) return 0;
    writeKey(key, m.value);
    meta[key] = { rev: (meta[key] && meta[key].rev || 0) + 1, at: Date.now(), by: from || 'remote' };
    saveMeta();
    lastSyncAt = Date.now(); lastSyncInfo = 'merged ' + (m.added || 1) + ' update(s) from ' + (from || 'peer');
    document.dispatchEvent(new CustomEvent('aia-data-change', { detail: { key: key } }));
    try { window.dispatchEvent(new Event('aia-sync')); } catch (e) {}
    refreshFab();
    return m.added || 1;
  }

  /* ---------------- live channels: BroadcastChannel + storage ---------------- */
  var bc = null, peers = {};
  try { if ('BroadcastChannel' in window) bc = new BroadcastChannel('aia_class10a_v2'); } catch (e) { bc = null; }
  function bcPost(msg) { if (!bc) return; try { bc.postMessage(msg); } catch (e) {} }
  if (bc) {
    bc.onmessage = function (ev) {
      var m = ev.data; if (!m || m.from === device.id) return;
      if (m.t === 'update') { applyRemote(m.key, m.value, m.fromName || 'tab'); }
      else if (m.t === 'hello' || m.t === 'beat') {
        peers[m.from] = { name: m.fromName || 'tab', at: Date.now() };
        if (m.t === 'hello') bcPost({ t: 'hi', from: device.id, fromName: device.name });
        refreshFab();
      }
      else if (m.t === 'hi' || m.t === 'bye') {
        if (m.t === 'hi') peers[m.from] = { name: m.fromName || 'tab', at: Date.now() };
        else delete peers[m.from];
        refreshFab();
      }
      else if (m.t === 'typing') {
        document.dispatchEvent(new CustomEvent('aia-typing', { detail: m }));
      }
    };
  }
  /* storage-event fallback (covers browsers without BroadcastChannel) */
  window.addEventListener('storage', function (e) {
    if (!e.key || !isSyncedKey(e.key) || e.key === META_KEY || e.key === DEVICE_KEY) return;
    var v;
    try { v = e.key === 'aia_theme' ? e.newValue : JSON.parse(e.newValue); } catch (err) { return; }
    applyRemote(e.key, v, 'tab');
  });
  /* local writes from DataStore */
  document.addEventListener('aia-local-write', function (e) {
    var key = e.detail && e.detail.key;
    if (!key || !isSyncedKey(key)) return;
    touchMeta(key);
    var v = readKey(key);
    bcPost({ t: 'update', key: key, value: v, rev: meta[key].rev, at: meta[key].at, from: device.id, fromName: device.name });
    p2pBroadcast({ t: 'update', key: key, value: v, from: device.id, fromName: device.name });
    queueServerPush();
    lastSyncAt = Date.now(); lastSyncInfo = 'shared update (' + key.replace('aia_', '') + ')';
    refreshFab();
  });
  setInterval(function () {
    bcPost({ t: 'beat', from: device.id, fromName: device.name });
    var now = Date.now(), changed = false;
    Object.keys(peers).forEach(function (k) { if (now - peers[k].at > 14000) { delete peers[k]; changed = true; } });
    if (changed) refreshFab();
  }, 5000);
  window.addEventListener('beforeunload', function () { bcPost({ t: 'bye', from: device.id }); });

  /* ---------------- snapshot / codes / files ---------------- */
  function allSyncKeys() {
    var keys = Object.keys(SYNC_DEFS);
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('aia_ai_chat_') === 0 && keys.indexOf(k) === -1) keys.push(k);
      }
    } catch (e) {}
    return keys;
  }
  function snapshot(opts) {
    opts = opts || {};
    var data = {};
    allSyncKeys().forEach(function (k) {
      if (!opts.photos && k === 'aia_subject_photos') return;
      if (!opts.ai && (k === 'aia_ai_log' || k.indexOf('aia_ai_chat_') === 0)) return;
      if (!opts.activity && (k === 'aia_activity_log' || k === 'aia_presence')) return;
      var v = readKey(k);
      if (v !== undefined && v !== null) data[k] = v;
    });
    return { v: 2, app: 'aia-class10a', at: Date.now(), from: device.id, fromName: device.name, data: data };
  }
  function encodeSnap(snap) { return 'AIA2.' + b64e(JSON.stringify(snap)); }
  function decodeSnap(str) {
    str = String(str || '').trim();
    if (!str) return null;
    try {
      if (str.indexOf('AIA2.') === 0) return JSON.parse(b64d(str.slice(5)));
      var o = JSON.parse(str);
      if (o && o.data) return o;
      if (o && (o.aia_class_chat || o.aia_homework || o._exported_at)) {
        var d = {}; Object.keys(o).forEach(function (k) { if (k !== '_exported_at') d[k] = o[k]; });
        return { v: 1, at: Date.now(), from: 'file', data: d };
      }
      return null;
    } catch (e) { return null; }
  }
  function mergeSnapshot(snap) {
    if (!snap || !snap.data) return { keys: 0, added: 0 };
    var keys = 0, added = 0;
    Object.keys(snap.data).forEach(function (k) {
      if (!isSyncedKey(k)) return;
      keys++;
      added += applyRemote(k, snap.data[k], snap.fromName || snap.from || 'peer');
    });
    lastSyncAt = Date.now();
    lastSyncInfo = 'merged code/file: +' + added + ' update(s)';
    try { window.dispatchEvent(new Event('aia-sync')); } catch (e) {}
    document.dispatchEvent(new CustomEvent('aia-data-change', { detail: { key: '*' } }));
    refreshFab();
    return { keys: keys, added: added };
  }
  function downloadFile(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- P2P live link (WebRTC, manual signaling) ---------------- */
  var pc = null, dc = null, p2pPeers = {}, p2pStatus = 'off', inbox = {};
  function p2pSetStatus(s, extra) {
    p2pStatus = s;
    var el = $('aiaP2pStatus');
    if (el) el.innerHTML = '<span class="p2p-dot ' + s + '"></span> ' + ({ off: 'Not connected', host: 'Hosting — waiting for partner…', join: 'Answer ready — send it back', live: 'LIVE link ✓' }[s] || s) + (extra ? ' · ' + extra : '');
    refreshFab();
  }
  function rtcConfig() { return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }; }
  function setupDC(ch) {
    dc = ch;
    dc.onopen = function () {
      p2pSetStatus('live');
      toast('P2P link LIVE — syncing now ⚡', 'success');
      sendFullState();
    };
    dc.onclose = function () { p2pSetStatus('off'); };
    dc.onmessage = function (ev) { p2pReceive(ev.data); };
  }
  function gatherComplete(codeEl) {
    return function () {
      if (!pc || pc.iceGatheringState !== 'complete') return;
      var desc = pc.localDescription;
      if (desc && codeEl) codeEl.value = 'AIALINK.' + b64e(JSON.stringify({ sdp: desc.sdp, type: desc.type }));
    };
  }
  window.__aiaP2pHost = function () {
    try {
      pcClose();
      pc = new RTCPeerConnection(rtcConfig());
      setupDC(pc.createDataChannel('aia'));
      p2pSetStatus('host');
      var codeEl = $('aiaP2pMyCode');
      pc.onicegatheringstatechange = gatherComplete(codeEl);
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () {
        if (pc.iceGatheringState === 'complete') gatherComplete(codeEl)();
      }).catch(function (e) { toast('P2P failed: ' + e.message, 'error'); p2pSetStatus('off'); });
    } catch (e) { toast('WebRTC not supported here', 'error'); }
  };
  window.__aiaP2pJoin = function () {
    try {
      var pasted = ($('aiaP2pPeerCode') || {}).value || '';
      var sig = pasted.indexOf('AIALINK.') === 0 ? JSON.parse(b64d(pasted.slice(8))) : null;
      if (!sig || !sig.sdp) { toast('Paste a valid link code first', 'error'); return; }
      pcClose();
      pc = new RTCPeerConnection(rtcConfig());
      pc.ondatachannel = function (ev) { setupDC(ev.channel); };
      p2pSetStatus('join');
      var codeEl = $('aiaP2pMyCode');
      pc.onicegatheringstatechange = gatherComplete(codeEl);
      pc.setRemoteDescription(new RTCSessionDescription(sig)).then(function () { return pc.createAnswer(); })
        .then(function (a) { return pc.setLocalDescription(a); })
        .then(function () { if (pc.iceGatheringState === 'complete') gatherComplete(codeEl)(); })
        .catch(function (e) { toast('P2P failed: ' + e.message, 'error'); p2pSetStatus('off'); });
    } catch (e) { toast('Bad link code', 'error'); }
  };
  window.__aiaP2pAccept = function () {
    try {
      var pasted = ($('aiaP2pPeerCode') || {}).value || '';
      var sig = pasted.indexOf('AIALINK.') === 0 ? JSON.parse(b64d(pasted.slice(8))) : null;
      if (!pc || !sig || !sig.sdp) { toast('Nothing to accept', 'error'); return; }
      pc.setRemoteDescription(new RTCSessionDescription(sig)).then(function () { toast('Answer accepted — linking…', 'success'); });
    } catch (e) { toast('Bad answer code', 'error'); }
  };
  function pcClose() { try { if (dc) dc.close(); } catch (e) {} try { if (pc) pc.close(); } catch (e) {} pc = null; dc = null; }
  window.__aiaP2pClose = function () { pcClose(); p2pSetStatus('off'); };
  function dcSend(obj) {
    if (!dc || dc.readyState !== 'open') return;
    try {
      var s = JSON.stringify(obj), id = uid('m'), CH = 14000;
      var n = Math.ceil(s.length / CH) || 1;
      for (var i = 0; i < n; i++) dc.send(JSON.stringify({ __ch: 1, id: id, i: i, n: n, part: s.slice(i * CH, (i + 1) * CH) }));
    } catch (e) {}
  }
  function p2pReceive(raw) {
    try {
      var m = JSON.parse(raw);
      if (m.__ch) {
        inbox[m.id] = inbox[m.id] || { parts: [], n: m.n };
        inbox[m.id].parts[m.i] = m.part;
        var got = inbox[m.id].parts.filter(Boolean).length;
        if (got >= m.n) { var full = JSON.parse(inbox[m.id].parts.join('')); delete inbox[m.id]; p2pHandle(full); }
        return;
      }
      p2pHandle(m);
    } catch (e) {}
  }
  function p2pHandle(m) {
    if (!m) return;
    if (m.t === 'update' && m.key) applyRemote(m.key, m.value, 'P2P partner');
    else if (m.t === 'state' && m.snap) {
      var r = mergeSnapshot(m.snap);
      toast('P2P sync: +' + r.added + ' update(s) ⚡', 'success');
      sendFullState(true); /* echo ours back so both converge */
    }
  }
  function p2pBroadcast(msg) { if (dc && dc.readyState === 'open') dcSend(msg); }
  function sendFullState(light) {
    var snap = snapshot({ photos: true, ai: true, activity: false });
    var s = JSON.stringify({ t: 'state', snap: snap });
    if (s.length > 900000 && !light) { /* huge (photos) — send without photos first */ snap = snapshot({ photos: false, ai: true, activity: false }); }
    dcSend({ t: 'state', snap: snap });
  }

  /* ---------------- optional server merge-bridge (deploy only) ----------------
     Only used when the site is intentionally deployed WITH server.js and the
     page opts in via window.AIA_SERVER_HUB = true. On a pure static host this
     stays silent (no 404 noise in the console): the live relay covers sync. */
  var serverMode = false, serverTimer = null, pushTimer = null, serverFails = 0;
  var serverOptIn = false;
  try { serverOptIn = window.AIA_SERVER_HUB === true; } catch (e) { serverOptIn = false; }
  var TO_SHORT = { aia_students: 'students', aia_student_profiles: 'student_profiles', aia_teachers: 'teachers', aia_leadership: 'leadership', aia_homework: 'homework', aia_announcements: 'announcements', aia_polls: 'polls', aia_test_scores: 'test_scores', aia_class_chat: 'class_chat', aia_comments: 'comments', aia_poll_votes: 'poll_votes', aia_subject_content: 'subject_content', aia_subject_photos: 'subject_photos', aia_ai_config: 'ai_config', aia_theme: 'theme', aia_activity_log: 'activity_log' };
  var TO_LONG = {}; Object.keys(TO_SHORT).forEach(function (k) { TO_LONG[TO_SHORT[k]] = k; });
  function serverPull() {
    fetch('/api/state', { credentials: 'include', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('no-server');
      return r.json();
    }).then(function (state) {
      if (!state || typeof state !== 'object') return;
      serverFails = 0;
      if (!serverMode) { serverMode = true; refreshFab(); }
      var added = 0;
      Object.keys(state).forEach(function (sk) {
        var lk = TO_LONG[sk] || (sk.indexOf('aia_') === 0 ? sk : null);
        if (lk && isSyncedKey(lk)) added += applyRemote(lk, state[sk], 'server');
      });
      if (added) { lastSyncInfo = 'server merge: +' + added; refreshFab(); }
    }).catch(function () {
      /* static/file mode — stay serverless; stop polling after 3 misses */
      serverFails++;
      if (serverFails >= 3 && serverTimer) { clearInterval(serverTimer); serverTimer = null; }
    });
  }
  function queueServerPush() {
    if (!serverMode) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var out = {};
      Object.keys(TO_SHORT).forEach(function (lk) { var v = readKey(lk); if (v !== undefined) out[TO_SHORT[lk]] = v; });
      fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(out) }).catch(function () {});
    }, 2000);
  }

  /* ---------------- Sync Center UI ---------------- */
  var fab = null, modal = null;
  function peerCount() { return Object.keys(peers).length; }
  function refreshFab() {
    if (!fab) return;
    try {
      var n = peerCount() + (p2pStatus === 'live' ? 1 : 0);
      var badge = fab.querySelector ? fab.querySelector('.sync-n') : null;
      if (badge) badge.textContent = n > 0 ? n : '';
      if (fab.classList && fab.classList.toggle) fab.classList.toggle('linked', n > 0 || serverMode);
      fab.title = n > 0 ? ('Synced with ' + n + ' device(s)/tab(s)') : 'Sync Center — works without any server';
      var st = $('aiaSyncStatusLine');
      if (st) st.innerHTML = statusHTML();
    } catch (e) {}
  }
  function statusHTML() {
    var tabs = Object.keys(peers).map(function (k) { return peers[k].name; });
    var relay = (window.AiaRelay && window.AiaRelay.statusHTML) ? window.AiaRelay.statusHTML() : '';
    return '<div class="sync-stat"><span>This device</span><strong>' + device.name + '</strong></div>' +
      '<div class="sync-stat"><span>Tabs here</span><strong>' + (tabs.length ? tabs.join(', ') : 'just this one') + '</strong></div>' +
      relay +
      '<div class="sync-stat"><span>P2P link</span><strong>' + (p2pStatus === 'live' ? 'LIVE ✓' : p2pStatus) + '</strong></div>' +
      '<div class="sync-stat"><span>Backup hub</span><strong>' + (serverMode ? 'connected (merge)' : 'none needed ✓') + '</strong></div>' +
      '<div class="sync-stat"><span>Last sync</span><strong>' + lastSyncInfo + (lastSyncAt ? ' · ' + timeAgo(lastSyncAt) : '') + '</strong></div>';
  }
  function buildUI() {
    if (fab) return;
    fab = document.createElement('button');
    fab.className = 'sync-fab';
    fab.id = 'syncFab';
    fab.type = 'button';
    fab.innerHTML = '<i class="fa-solid fa-rotate"></i><span class="sync-n"></span>';
    fab.setAttribute('aria-label', 'Open Sync Center');
    document.body.appendChild(fab);
    fab.addEventListener('click', openModal);

    modal = document.createElement('div');
    modal.className = 'modal-overlay sync-modal';
    modal.id = 'syncModal';
    modal.innerHTML =
      '<div class="modal-content sync-content" role="dialog" aria-label="Sync Center">' +
      '<button class="modal-close" id="syncClose" aria-label="Close">✕</button>' +
      '<h2 class="heading-md">⇄ Sync Center</h2>' +
      '<p class="text-secondary" style="font-size:.85rem;margin:6px 0 16px">Everything syncs <strong>automatically</strong> across your phones, tabs and PCs — no server to run. Same-device tabs are instant; other devices join the class room live below. Backup codes/files are still here if you are offline.</p>' +
      '<div class="sync-status" id="aiaSyncStatusLine"></div>' +
      '<div class="sync-sec"><h4><i class="fa-solid fa-bolt"></i> Live class room — automatic</h4>' +
      '<div id="aiaRelayLine" class="sync-status"></div>' +
      '<div class="sync-row" style="margin-top:10px">' +
      '<button class="btn btn-secondary btn-sm" id="aiaRelayToggle">Turn live link off</button>' +
      '<button class="btn btn-secondary btn-sm" id="aiaRelayRoomBtn">Change room</button>' +
      '<button class="btn btn-secondary btn-sm" id="aiaRelayRefreshBtn">Sync now</button></div>' +
      '<div class="text-muted" style="font-size:.76rem;margin-top:8px">Every device using the same room stays in sync instantly. Keep the default room unless you want a private one — then set the same room on every device.</div></div>' +
      '<div class="sync-sec"><h4><i class="fa-solid fa-share-nodes"></i> 1 · Share from this device</h4>' +
      '<div class="sync-row"><button class="btn btn-primary btn-sm" id="aiaShareCompact">Copy compact code</button>' +
      '<button class="btn btn-secondary btn-sm" id="aiaShareFull">Copy FULL code</button>' +
      '<button class="btn btn-secondary btn-sm" id="aiaShareFile">Download file</button></div>' +
      '<div class="text-muted" id="aiaShareInfo" style="font-size:.76rem;margin-top:8px">Compact = chats, polls, homework, news, settings (no photos). FULL = everything incl. photos.</div>' +
      '<textarea id="aiaShareCode" class="sync-code" readonly placeholder="Your code appears here — copy & send it (WhatsApp etc.)"></textarea></div>' +
      '<div class="sync-sec"><h4><i class="fa-solid fa-download"></i> 2 · Receive on this device</h4>' +
      '<textarea id="aiaRecvCode" class="sync-code" placeholder="Paste a sync code here…"></textarea>' +
      '<div class="sync-row"><button class="btn btn-primary btn-sm" id="aiaMergeCode">Merge code ✓</button>' +
      '<label class="btn btn-secondary btn-sm" style="cursor:pointer">Import file<input type="file" id="aiaImportFile" accept="application/json,.json" style="display:none"></label></div>' +
      '<div class="text-muted" style="font-size:.76rem;margin-top:8px">Merging is safe & additive — nothing on this device is deleted.</div></div>' +
      '<div class="sync-sec"><h4><i class="fa-solid fa-bolt"></i> 3 · LIVE P2P link (both online, no server)</h4>' +
      '<div id="aiaP2pStatus" class="p2p-status"><span class="p2p-dot off"></span> Not connected</div>' +
      '<div class="sync-row"><button class="btn btn-secondary btn-sm" id="aiaP2pHostBtn">① Host: make link code</button>' +
      '<button class="btn btn-secondary btn-sm" id="aiaP2pJoinBtn">② Join: use partner code ↓</button></div>' +
      '<textarea id="aiaP2pMyCode" class="sync-code" readonly placeholder="Your link code appears here — send to partner"></textarea>' +
      '<textarea id="aiaP2pPeerCode" class="sync-code" placeholder="Paste partner\'s link/answer code here…"></textarea>' +
      '<div class="sync-row"><button class="btn btn-primary btn-sm" id="aiaP2pAcceptBtn">Connect ✓</button>' +
      '<button class="btn btn-secondary btn-sm" id="aiaP2pCloseBtn">Disconnect</button></div>' +
      '<div class="text-muted" style="font-size:.76rem;margin-top:8px">Host sends code → partner taps ② then Connect → partner sends back its code → host pastes & taps Connect. Stays live while both pages are open.</div></div>' +
      '</div>';
    document.body.appendChild(modal);
    /* null-safe binder (also keeps non-DOM test harnesses happy) */
    function on(id, ev, fn) { var el = $(id); if (el && el.addEventListener) el.addEventListener(ev, fn); return el; }
    on('syncClose', 'click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

    on('aiaShareCompact', 'click', function () {
      var code = encodeSnap(snapshot({ photos: false, ai: false, activity: false }));
      $('aiaShareCode').value = code;
      copyText(code, 'Compact code copied ✓ (' + fmtSize(code.length) + ')');
      $('aiaShareInfo').textContent = 'Compact code ready: ' + fmtSize(code.length) + ' — paste it on the other device → Merge.';
    });
    on('aiaShareFull', 'click', function () {
      var code = encodeSnap(snapshot({ photos: true, ai: true, activity: true }));
      $('aiaShareCode').value = code;
      if (code.length > 120000) { toast('FULL code is ' + fmtSize(code.length) + ' — use Download file instead', 'error'); return; }
      copyText(code, 'FULL code copied ✓ (' + fmtSize(code.length) + ')');
      $('aiaShareInfo').textContent = 'FULL code ready: ' + fmtSize(code.length) + ' (includes photos).';
    });
    on('aiaShareCode', 'focus', function () { this.select(); });
    on('aiaShareFile', 'click', function () {
      downloadFile('class10a-sync-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(snapshot({ photos: true, ai: true, activity: true }), null, 1));
      toast('Sync file downloaded 💾', 'success');
    });
    on('aiaMergeCode', 'click', function () {
      var snap = decodeSnap($('aiaRecvCode').value);
      if (!snap) { toast('That code is not valid', 'error'); return; }
      var r = mergeSnapshot(snap);
      toast(r.added ? ('Merged +' + r.added + ' update(s) ✓' ) : 'Already up to date ✓', 'success');
      $('aiaRecvCode').value = '';
      refreshFab();
    });
    on('aiaImportFile', 'change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var snap = decodeSnap(rd.result);
        if (!snap) { toast('That file is not a Class 10-A backup', 'error'); return; }
        var r = mergeSnapshot(snap);
        toast(r.added ? ('Imported +' + r.added + ' update(s) ✓') : 'Already up to date ✓', 'success');
        refreshFab();
      };
      rd.readAsText(f); this.value = '';
    });
    on('aiaP2pHostBtn', 'click', window.__aiaP2pHost);
    on('aiaP2pJoinBtn', 'click', window.__aiaP2pJoin);
    on('aiaP2pAcceptBtn', 'click', window.__aiaP2pAccept);
    on('aiaP2pCloseBtn', 'click', window.__aiaP2pClose);
    on('aiaP2pMyCode', 'focus', function () { this.select(); });

    /* live class room controls */
    on('aiaRelayToggle', 'click', function () {
      if (!window.AiaRelay) return;
      var on = window.AiaRelay.setEnabled(!window.AiaRelay.isEnabled());
      this.textContent = on ? 'Turn live link off' : 'Turn live link on';
      relayLine();
    });
    on('aiaRelayRoomBtn', 'click', function () {
      if (!window.AiaRelay) return;
      var cur = window.AiaRelay.room();
      var next = prompt('Class room name for automatic sync.\nUse the SAME room on every device.\n\nLetters, numbers, - and _ only.', cur);
      if (next === null) return;
      if (window.AiaRelay.setRoom(next)) { toast('Room set — reconnecting live link', 'success'); relayLine(); }
      else toast('That room name is not valid', 'error');
    });
    on('aiaRelayRefreshBtn', 'click', function () {
      if (window.AiaRelay) { window.AiaRelay.refresh(); toast('Checking the class room for updates…', 'info'); }
    });

    /* footer shortcut */
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var fb = document.querySelector('.footer-links, .site-footer');
      if (fb && !$('syncFooterLink')) {
        var a = document.createElement('a');
        a.href = '#'; a.id = 'syncFooterLink';
        a.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync';
        a.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
        if (fb.classList.contains('footer-links')) fb.appendChild(a);
        else fb.appendChild(a);
      }
      if (tries > 20 || $('syncFooterLink')) clearInterval(iv);
    }, 500);
    refreshFab();
  }
  function copyText(text, okMsg) {
    function done() { toast(okMsg, 'success'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — long-press & copy manually', 'error'); }
      ta.remove();
    }
  }
  function openModal() {
    if (modal) {
      var st = $('aiaSyncStatusLine');
      if (st) st.innerHTML = statusHTML();
      relayLine();
      modal.classList.add('open');
    }
  }
  function closeModal() { if (modal) modal.classList.remove('open'); }
  function relayLine() {
    var el = $('aiaRelayLine');
    if (el && window.AiaRelay && window.AiaRelay.statusHTML) el.innerHTML = window.AiaRelay.statusHTML();
    var btn = $('aiaRelayToggle');
    if (btn && window.AiaRelay) btn.textContent = window.AiaRelay.isEnabled() ? 'Turn live link off' : 'Turn live link on';
  }
  document.addEventListener('aia-relay-status', function () { relayLine(); });

  /* ---------------- boot ---------------- */
  function boot() {
    buildUI();
    bcPost({ t: 'hello', from: device.id, fromName: device.name });
    /* optional server merge (only when explicitly deployed with server.js) */
    try {
      if (serverOptIn && location.protocol.indexOf('http') === 0) {
        serverPull();
        serverTimer = setInterval(serverPull, 8000);
      }
    } catch (e) {}
    refreshFab();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.AiaSync = {
    __v: 2, open: openModal, device: device,
    snapshot: snapshot, mergeSnapshot: mergeSnapshot,
    exportCode: function (full) { return encodeSnap(snapshot(full ? { photos: true, ai: true, activity: true } : { photos: false, ai: false, activity: false })); },
    importCode: function (s) { var snap = decodeSnap(s); return snap ? mergeSnapshot(snap) : null; },
    peers: function () { return Object.keys(peers).length; },
    typing: function (user, name) { bcPost({ t: 'typing', user: user, name: name, from: device.id }); p2pBroadcast({ t: 'typing', user: user, name: name, from: device.id }); }
  };
})();
