/* ============================================================
   AIA CLASS 10-A HUB — Data / Storage Layer V2
   Bridges window.SEED and localStorage.
   Added: sessions, per-user AI history, class chat,
   activity tracking, presence, AI config, subject content,
   photos, GitHub data cache, export/import.
   ============================================================ */

var DataStore = (function () {
  var KEYS = {
    students: 'aia_students',
    studentProfiles: 'aia_student_profiles',
    teachers: 'aia_teachers',
    leadership: 'aia_leadership',
    homework: 'aia_homework',
    announcements: 'aia_announcements',
    polls: 'aia_polls',
    testScores: 'aia_test_scores',
    comments: 'aia_comments',
    pollVotes: 'aia_poll_votes',
    chatMode: 'aia_chat_mode',
    unlocked: 'aia_unlocked',
    adminAuth: 'aia_admin_auth',
    session: 'aia_session',
    classChat: 'aia_class_chat',
    classChatDeleted: 'aia_class_chat_deleted',
    files: 'aia_files',
    pyqs: 'aia_pyqs',
    blocks: 'aia_blocks',
    aiLog: 'aia_ai_log',
    activityLog: 'aia_activity_log',
    presence: 'aia_presence',
    aiConfig: 'aia_ai_config',
    /* The AI API key is a SECRET. It lives in its own key that is
       deliberately absent from every sync list (sync-bridge.js SYNC_DEFS,
       relay.js SHORT, the export/import sets) so it can never reach the
       shared relay room or another device. */
    aiKey: 'aia_ai_key',
    subjectContent: 'aia_subject_content',
    subjectPhotos: 'aia_subject_photos',
    githubData: 'aia_github_data'
  };

  /* ---------- low-level ---------- */
  function _get(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('LocalStorage read failed for', key, e);
      return fallback;
    }
  }
  /* Quota-safe write. Returns true on success. Notifies the serverless
     sync engine (sync-bridge.js) so tabs/devices stay in sync. */
  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
      try { document.dispatchEvent(new CustomEvent('aia-quota', { detail: { key: key } })); } catch (e2) {}
      return false;
    }
    if (!window.__aiaApplying) {
      try { document.dispatchEvent(new CustomEvent('aia-local-write', { detail: { key: key } })); } catch (e) {}
    }
    try { window.dispatchEvent(new Event('aia-sync')); } catch (e) {}
    return true;
  }
  /* Stable unique ids — required for serverless merge (no dupes). */
  function _uid(p) {
    return (p || 'id') + '_' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }
  function _stamp(obj, prefix) {
    if (obj && typeof obj === 'object') {
      if (!obj.id) obj.id = _uid(prefix);
      var now = new Date().toISOString();
      if (!obj.created_at) obj.created_at = now;
      obj.updatedAt = now;
    }
    return obj;
  }

  /* Record a deliberate removal so other devices drop the item instead of
     syncing their old copy back. See sync-bridge.js markDeleted(). */
  function _markDeleted(key, ids) {
    try {
      if (window.AiaSync && window.AiaSync.markDeleted) window.AiaSync.markDeleted(key, ids);
    } catch (e) {}
  }
  function _idsOf(list) {
    var fn = (window.AiaSync && window.AiaSync.itemId) ? window.AiaSync.itemId : null;
    return (list || []).map(function (x, i) {
      if (fn) return fn(x, i);
      return x && x.id;
    }).filter(Boolean);
  }

  /* ---------- seed collections ---------- */
  function getStudents() { return _get(KEYS.students, (window.SEED && window.SEED.students) || []); }
  function setStudents(v) { _set(KEYS.students, v); }
  function getStudentProfiles() { return _get(KEYS.studentProfiles, (window.SEED && window.SEED.student_profiles) || []); }
  function setStudentProfiles(v) { _set(KEYS.studentProfiles, v); }
  function saveProfile(name, fields) {
    var profiles = getStudentProfiles();
    var idx = profiles.findIndex(function (p) { return String(p.student_name || '').toUpperCase() === String(name).toUpperCase(); });
    var entry = Object.assign({ student_name: name }, fields);
    entry.updatedAt = new Date().toISOString();
    if (idx >= 0) { entry.id = profiles[idx].id || _uid('prof'); profiles[idx] = entry; }
    else { entry.id = _uid('prof'); profiles.push(entry); }
    setStudentProfiles(profiles);
  }
  function getTeachers() { return _get(KEYS.teachers, (window.SEED && window.SEED.teachers) || []); }
  function setTeachers(v) { _set(KEYS.teachers, v); }
  function getLeadership() { return _get(KEYS.leadership, (window.SEED && window.SEED.leadership) || []); }
  function setLeadership(v) { _set(KEYS.leadership, v); }
  function getHomework() { return _get(KEYS.homework, (window.SEED && window.SEED.homework) || []); }
  function setHomework(v) { _set(KEYS.homework, v); }
  function addHomework(item) { _stamp(item, 'hw'); var l = getHomework(); l.unshift(item); setHomework(l); return 0; }
  function deleteHomework(i) {
    var l = getHomework();
    var gone = l[i];
    l.splice(i, 1); setHomework(l);
    _markDeleted('aia_homework', _idsOf([gone]));
    rebuildCommentKeys('hw_', i);
  }
  function getAnnouncements() { return _get(KEYS.announcements, (window.SEED && window.SEED.announcements) || []); }
  function setAnnouncements(v) { _set(KEYS.announcements, v); }
  function addAnnouncement(item) {
    _stamp(item, 'ann');
    if (!item.date) item.date = item.created_at;
    var l = getAnnouncements(); l.unshift(item); setAnnouncements(l); return 0;
  }
  function deleteAnnouncement(i) {
    var l = getAnnouncements();
    var gone = l[i];
    l.splice(i, 1); setAnnouncements(l);
    _markDeleted('aia_announcements', _idsOf([gone]));
    rebuildCommentKeys('ann_', i);
  }
  function getPolls() { return _get(KEYS.polls, (window.SEED && window.SEED.polls) || []); }
  function setPolls(v) { _set(KEYS.polls, v); }
  function addPoll(item) {
    _stamp(item, 'poll');
    item._voteCounts = item._voteCounts || {};
    item._votes = item._votes || {};
    var l = getPolls(); l.unshift(item); setPolls(l); return 0;
  }
  function deletePoll(i) {
    var l = getPolls();
    var gone = l[i];
    l.splice(i, 1); setPolls(l);
    _markDeleted('aia_polls', _idsOf([gone]));
    /* re-index local vote flags so later polls keep their flags */
    var votes = _get(KEYS.pollVotes, {}), next = {};
    Object.keys(votes).forEach(function (k) {
      var m = /^poll_(\d+)$/.exec(k);
      if (!m) { next[k] = votes[k]; return; }
      var idx = parseInt(m[1], 10);
      if (idx === i) return;
      next['poll_' + (idx > i ? idx - 1 : idx)] = votes[k];
    });
    _set(KEYS.pollVotes, next);
  }
  function getTestScores() { return _get(KEYS.testScores, (window.SEED && window.SEED.test_scores) || []); }
  function setTestScores(v) { _set(KEYS.testScores, v); }
  function addTestScore(item) { _stamp(item, 'score'); var l = getTestScores(); l.unshift(item); setTestScores(l); return 0; }
  function deleteTestScore(i) {
    var l = getTestScores();
    var gone = l[i];
    l.splice(i, 1); setTestScores(l);
    _markDeleted('aia_test_scores', _idsOf([gone]));
  }

  /* ---------- comments ---------- */
  function getComments(key) { return _get(KEYS.comments, {})[key] || []; }
  function addComment(key, author, text) {
    var all = _get(KEYS.comments, {});
    if (!all[key]) all[key] = [];
    all[key].push({ id: _uid('cm'), author: author, text: text, at: new Date().toISOString() });
    if (all[key].length > 200) all[key] = all[key].slice(-200);
    _set(KEYS.comments, all);
  }
  function deleteComment(key, idx) {
    var all = _get(KEYS.comments, {});
    if (all[key] && all[key][idx]) { all[key].splice(idx, 1); _set(KEYS.comments, all); }
  }
  /* FIX: only comments AFTER the deleted item shift down; the deleted
     item's own thread is dropped, earlier ones keep their keys. */
  function rebuildCommentKeys(prefix, deletedIdx) {
    deletedIdx = (typeof deletedIdx === 'number') ? deletedIdx : -1;
    var all = _get(KEYS.comments, {});
    var next = {};
    Object.keys(all).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) { next[k] = all[k]; return; }
      var idx = parseInt(k.slice(prefix.length), 10);
      if (isNaN(idx)) { next[k] = all[k]; return; }
      if (idx === deletedIdx) return;                    /* dropped with item */
      if (idx > deletedIdx) next[prefix + (idx - 1)] = all[k];
      else next[k] = all[k];
    });
    _set(KEYS.comments, next);
  }

  /* ---------- polls (voter-map: one vote per user, merges across devices) ---------- */
  function pollUid(pollIdx) {
    var p = getPolls()[pollIdx];
    if (!p) return 'poll_' + pollIdx;
    return p.id ? 'p_' + p.id : 'poll_' + pollIdx;
  }
  function votePoll(pollIdx, optIdx, username) {
    if (hasVotedPoll(pollIdx, username)) return false;
    var polls = getPolls();
    var poll = polls[pollIdx]; if (!poll) return false;
    poll._votes = poll._votes || {};
    poll._voteCounts = poll._voteCounts || {};
    var who = username || ('anon_' + Math.random().toString(36).slice(2, 9));
    poll._votes[who] = optIdx;
    poll._voteCounts[optIdx] = (poll._voteCounts[optIdx] || 0) + 1;
    poll.updatedAt = new Date().toISOString();
    setPolls(polls);
    var votes = _get(KEYS.pollVotes, {});
    votes[pollUid(pollIdx)] = optIdx;
    votes['poll_' + pollIdx] = optIdx; /* legacy positional flag */
    _set(KEYS.pollVotes, votes);
    return true;
  }
  function pollCounts(poll) {
    /* derive counts: voter-map first, legacy counts as floor */
    var counts = {}, i;
    (poll.options || []).forEach(function (o, oi) { counts[oi] = 0; });
    Object.keys(poll._voteCounts || {}).forEach(function (k) { counts[k] = Math.max(counts[k] || 0, poll._voteCounts[k] || 0); });
    var fromMap = {};
    Object.keys(poll._votes || {}).forEach(function (u) { var o = poll._votes[u]; fromMap[o] = (fromMap[o] || 0) + 1; });
    Object.keys(fromMap).forEach(function (k) { counts[k] = Math.max(counts[k] || 0, fromMap[k]); });
    return counts;
  }
  function myPollVote(pollIdx, username) {
    var polls = getPolls(), poll = polls[pollIdx];
    if (poll && username && poll._votes && typeof poll._votes[username] === 'number') return poll._votes[username];
    var votes = _get(KEYS.pollVotes, {});
    var v = votes[pollUid(pollIdx)];
    if (typeof v === 'number') return v;
    v = votes['poll_' + pollIdx];
    return (typeof v === 'number') ? v : null;
  }
  function hasVoted(pollIdx, optIdx, username) { return myPollVote(pollIdx, username) === optIdx; }
  function hasVotedPoll(pollIdx, username) { return myPollVote(pollIdx, username) !== null; }

  /* ---------- unlock / admin auth ---------- */
  function isUnlocked() { return _get(KEYS.unlocked, false) === true; }
  function setUnlocked(v) { _set(KEYS.unlocked, v); }
  function getAdminAuth() { return _get(KEYS.adminAuth, null); }
  function setAdminAuth(level) { _set(KEYS.adminAuth, level); } // 'basic' | 'full' | null
  function isAdminAuthed() { return !!getAdminAuth(); }
  function isFullAdmin() { return getAdminAuth() === 'full'; }
  function verifyPass(pass) {
    var passes = (window.SEED && window.SEED.admin_passes) || { basic: '', full: 'Admin@AIA2026' };
    if (typeof pass !== 'string') return null;
    pass = pass.trim();
    // easypass100 is retired — visitors must log in with username/password.
    if (pass.toLowerCase() === 'easypass100') return null;
    if (pass && pass === passes.full) return 'full';
    if (pass && pass === passes.basic) return 'basic';
    return null;
  }

  /* ---------- session (student login) ---------- */
  function getSession() { return _get(KEYS.session, null); }
  function setSession(s) { _set(KEYS.session, s); }
  function clearSession() { localStorage.removeItem(KEYS.session); }
  function isLoggedIn() { var s = getSession(); return !!(s && s.name); }
  function isAdminUser() { var s = getSession(); return !!(s && s.role === 'admin'); }
  function getCredentials() { return (window.SEED && window.SEED.credentials) || []; }
  function findCredentialsByName(name) {
    return getCredentials().find(function (c) { return c.name.toUpperCase() === String(name).toUpperCase(); });
  }
  function authenticate(username, password) {
    var list = getEffectiveCredentials();
    var match = list.find(function (c) {
      return c.username.toLowerCase() === String(username).toLowerCase() && c.password === password;
    });
    if (!match) return null;
    var role = (match.username === 'admin_vinay' || match.username === 'admin_nitin') ? 'admin' : 'student';
    return { name: match.name, username: match.username, role: role };
  }
  function resetPassword(username, newPass) {
    var list = getCredentials();
    var idx = list.findIndex(function (c) { return c.username.toLowerCase() === String(username).toLowerCase(); });
    if (idx < 0) return false;
    list[idx].password = newPass;
    // persist overrides in localStorage so changes survive
    _set('aia_credentials_overrides', list);
    return true;
  }
  function getEffectiveCredentials() {
    var overrides = _get('aia_credentials_overrides', null);
    var base = getCredentials();
    if (!overrides) return base;
    // merge overrides onto base by username
    var map = {};
    base.forEach(function (c) { map[c.username.toLowerCase()] = c; });
    overrides.forEach(function (c) { map[c.username.toLowerCase()] = c; });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function _randPw(n) {
    var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    var s = '';
    for (var i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }
  /* Make sure every student on the roster has a working username/password.
     Existing credentials are never touched. Returns the full list plus the
     names that were newly generated. */
  function ensureAllCredentials() {
    var list = getCredentials().slice();
    var have = {};
    list.forEach(function (c) { have[String(c.name).toUpperCase()] = true; });
    var used = {};
    list.forEach(function (c) { used[String(c.username).toLowerCase()] = true; });
    var created = [];
    getStudents().forEach(function (name) {
      var key = String(name).toUpperCase();
      if (have[key]) return;
      var base = key.replace(/[^A-Z]/g, '').slice(0, 3) || 'STU';
      if (base.length < 3) base = (base + 'STU').slice(0, 3);
      var uname, tries = 0;
      do {
        uname = base + String(Math.floor(100 + Math.random() * 900));
        tries++;
      } while (used[uname.toLowerCase()] && tries < 60);
      used[uname.toLowerCase()] = true;
      var cred = { name: name, username: uname, password: _randPw(6) };
      list.push(cred);
      created.push(cred);
    });
    if (created.length) _set('aia_credentials_overrides', list);
    return { list: list, created: created };
  }

  /* ---------- class chat ---------- */
  /* Applies the shared "deleted message ids" tombstone list, so a message
     deleted on one device disappears for the class instead of syncing back. */
  function _applyChatTombstones(list) {
    var dead = _get(KEYS.classChatDeleted, []);
    if (!Array.isArray(dead) || !dead.length) return list;
    return (list || []).filter(function (m) { return !m || !m.id || dead.indexOf(m.id) === -1; });
  }
  function _markChatDeleted(ids) {
    var dead = _get(KEYS.classChatDeleted, []);
    var changed = false;
    ids.forEach(function (id) { if (id && dead.indexOf(id) === -1) { dead.push(id); changed = true; } });
    if (changed) _set(KEYS.classChatDeleted, dead.slice(-600));
  }
  function getClassChat() { return _applyChatTombstones(_get(KEYS.classChat, [])); }
  function addClassChat(msg) {
    if (!msg.id) msg.id = _uid('msg');
    if (!msg.at) msg.at = new Date().toISOString();
    var l = _get(KEYS.classChat, []).filter(function (m) { return m && m.id !== msg.id; });
    l.push(msg);
    if (l.length > 500) l = l.slice(-500);
    _set(KEYS.classChat, l); return l;
  }
  function setClassChat(l) { _set(KEYS.classChat, l); }
  function deleteClassChat(idx) {
    var l = _get(KEYS.classChat, []);
    var m = l[idx];
    if (m && m.id) _markChatDeleted([m.id]);
    l.splice(idx, 1); setClassChat(l);
  }
  /* delete by stable id (used by chat UI + sync) */
  function deleteClassChatById(id) {
    if (!id) return false;
    var l = _get(KEYS.classChat, []);
    var out = l.filter(function (m) { return !m || m.id !== id; });
    _markChatDeleted([id]);
    if (out.length === l.length) return false;
    setClassChat(out); return true;
  }
  /* bulk delete (admin clear-all / clear-mine) */
  function clearClassChat(keepIds) {
    var l = _get(KEYS.classChat, []);
    var gone = [], keep = [];
    l.forEach(function (m) {
      if (!m) return;
      if (keepIds && m.id && keepIds.indexOf(m.id) !== -1) keep.push(m);
      else if (m.id) gone.push(m.id);
    });
    _markChatDeleted(gone);
    setClassChat(keep);
    return gone.length;
  }

  /* ---------- PYQ library (previous-year question papers) ----------
     Papers are contributed by the admin (or a teacher) as file links, so
     nothing here is invented: the section renders exactly what has been
     uploaded and shows an honest empty state until then. `kind` is one of
     'half-yearly' | 'yearly' | 'practice'. */
  function getPyqs() {
    /* The seed ships the RBSE paper set, and the admin adds their own on top.
       Returning only the stored list would make every seeded paper vanish the
       moment the admin uploaded one, so merge the two by id (a stored paper
       wins, which is what lets an admin attach a file to a seeded paper). */
    var seed = (window.SEED && window.SEED.pyqs) || [];
    var stored = _get(KEYS.pyqs, null);
    if (!stored || !stored.length) return seed;
    var byId = {}, order = [];
    function put(p, overwrite) {
      if (!p || !p.title) return;
      var id = p.id || p.title;
      if (byId[id] && !overwrite) return;
      if (!byId[id]) order.push(id);
      byId[id] = p;
    }
    seed.forEach(function (p) { put(p, false); });
    stored.forEach(function (p) { put(p, true); });
    return order.map(function (id) { return byId[id]; });
  }
  function addPyq(p) {
    if (!p || !p.title) return null;
    if (!p.id) p.id = _uid('pyq');
    if (!p.at) p.at = new Date().toISOString();
    var l = getPyqs().filter(function (x) { return x && x.id !== p.id; });
    l.push(p);
    if (l.length > 400) l = l.slice(-400);
    _set(KEYS.pyqs, l);
    return p;
  }
  function removePyq(id) {
    if (!id) return;
    var l = getPyqs();
    var out = l.filter(function (x) { return !x || x.id !== id; });
    if (out.length === l.length) return;
    _set(KEYS.pyqs, out);
  }

  /* ---------- private chat (admin <-> one student) ----------
     Stored per student under its own key so a thread only ever reaches the
     two people in it. `withUser` is the student's username. */
  function privateKey(username) { return 'aia_private_chat_' + username; }
  function getPrivateChat(username) {
    if (!username) return [];
    return _get(privateKey(username), []);
  }
  function addPrivateMessage(username, msg) {
    if (!username || !msg) return [];
    if (msg.id && getPrivateCleared(username).indexOf(msg.id) !== -1) {
      return getPrivateChat(username);
    }
    var l = getPrivateChat(username);
    if (!msg.id) msg.id = _uid('pm');
    if (!msg.at) msg.at = new Date().toISOString();
    l = l.filter(function (m) { return m && m.id !== msg.id; });
    l.push(msg);
    if (l.length > 300) l = l.slice(-300);
    _set(privateKey(username), l);
    return l;
  }

  /* Clearing a private thread has to be remembered, not just deleted. The
     relay still holds the messages and keeps replaying them for ~12h, so a
     plain wipe would restore the whole thread on the next poll. Cleared ids
     are tombstoned and skipped on ingest, which is what makes the clear
     stick. */
  function privateClearedKey(username) { return 'aia_private_chat_cleared_' + username; }
  function getPrivateCleared(username) {
    if (!username) return [];
    return _get(privateClearedKey(username), []);
  }
  function clearPrivateChat(username) {
    if (!username) return 0;
    var ids = getPrivateChat(username).map(function (m) { return m && m.id; }).filter(Boolean);
    if (!ids.length) { _set(privateKey(username), []); return 0; }
    var done = getPrivateCleared(username);
    ids.forEach(function (id) { if (done.indexOf(id) === -1) done.push(id); });
    if (done.length > 800) done = done.slice(-800);
    _set(privateClearedKey(username), done);
    _set(privateKey(username), []);
    return ids.length;
  }

  /* ---------- user blocks (admin action) ----------
     A block carries a reason and an expiry, so the blocked student sees
     exactly why and for how long. `until = null` means indefinite. */
  /* Raw map, including cleared tombstones used for sync. */
  function getBlocksRaw() { return _get(KEYS.blocks, {}); }
  function getBlocks() {
    var raw = getBlocksRaw(), out = {};
    Object.keys(raw).forEach(function (k) {
      var b = raw[k];
      if (!b || b.cleared) return;
      if (b.until && Date.now() > b.until) return;
      out[k] = b;
    });
    return out;
  }
  function setBlocks(map) { return _set(KEYS.blocks, map || {}); }
  function getBlock(username) {
    if (!username) return null;
    var b = getBlocksRaw()[String(username).toLowerCase()];
    if (!b || b.cleared) return null;
    /* an expired block becomes a tombstone so every device drops it */
    if (b.until && Date.now() > b.until) {
      unblockUser(b.username || username);
      return null;
    }
    return b;
  }
  function blockUser(username, reason, until, by) {
    if (!username) return null;
    var m = getBlocksRaw();
    var b = {
      username: username, reason: String(reason || '').slice(0, 300),
      until: until || null, at: new Date().toISOString(), by: by || 'admin'
    };
    m[String(username).toLowerCase()] = b;
    setBlocks(m);
    return b;
  }
  /* Unblocking has to survive sync. Deleting the entry would let it come back
     from a device that still holds the old copy, so we keep a tombstone with a
     fresh timestamp — the merge picks the newest record per user. */
  function unblockUser(username) {
    if (!username) return false;
    var m = getBlocksRaw();
    var k = String(username).toLowerCase();
    m[k] = { username: username, cleared: true, at: new Date().toISOString() };
    setBlocks(m);
    return true;
  }
  function isBlocked(username) { return !!getBlock(username); }

  /* Human-readable time left on a block, e.g. "2 days 3 hours left". */
  function timeUntil(ts) {
    if (!ts) return 'Until unblocked';
    var ms = ts - Date.now();
    if (ms <= 0) return 'expired';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60);
    if (d) return d + (d === 1 ? ' day ' : ' days ') + h + (h === 1 ? ' hour left' : ' hours left');
    if (h) return h + (h === 1 ? ' hour ' : ' hours ') + m + (m === 1 ? ' minute left' : ' minutes left');
    return m + (m === 1 ? ' minute left' : ' minutes left');
  }

  /* Same, as a short countdown for the blocked screen timer. */
  function blockCountdown(ts) {
    if (!ts) return 'no end date';
    var ms = ts - Date.now();
    if (ms <= 0) return '0s';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    if (d) return d + 'd ' + h + 'h ' + m + 'm';
    if (h) return h + 'h ' + m + 'm ' + s + 's';
    return m + 'm ' + s + 's';
  }

  /* ---------- shared files (photos, PDFs, docs) ---------- */
  /* Only lightweight metadata lives in localStorage: the bytes are uploaded
     to the shared relay and referenced by URL, so a phone never fills up. */
  function getFiles() { return _get(KEYS.files, []); }
  function addFile(file) {
    if (!file || !file.url) return null;
    if (!file.id) file.id = _uid('file');
    if (!file.at) file.at = new Date().toISOString();
    var l = getFiles().filter(function (f) { return f && f.id !== file.id; });
    l.push(file);
    if (l.length > 120) l = l.slice(-120);
    _set(KEYS.files, l);
    return file;
  }
  function removeFile(id) {
    if (!id) return;
    var l = getFiles();
    var out = l.filter(function (f) { return !f || f.id !== id; });
    if (out.length === l.length) return;
    _set(KEYS.files, out);
  }

  /* ---------- per-user AI history + global admin log ---------- */
  function aiKey(username) { return 'aia_ai_chat_' + username; }
  function getAiHistory(username) { return _get(aiKey(username), []); }
  function addAiMessage(username, role, content) {
    var l = getAiHistory(username);
    l.push({ id: _uid('aim'), role: role, content: content, at: new Date().toISOString() });
    if (l.length > 120) l = l.slice(-120);
    _set(aiKey(username), l);
    var glob = getAiLog();
    glob.push({ user: username, role: role, content: content, at: new Date().toISOString() });
    if (glob.length > 600) glob = glob.slice(-600);
    _set(KEYS.aiLog, glob);
    return l;
  }
  function clearAiHistory(username) { localStorage.removeItem(aiKey(username)); }
  function getAiLog() { return _get(KEYS.aiLog, []); }
  function clearAiLog() { _set(KEYS.aiLog, []); }

  /* ---------- activity tracking ---------- */
  function getActivityLog() { return _get(KEYS.activityLog, []); }
  function logActivity(page, name, action, detail) {
    var s = getSession();
    var who = name || (s ? s.name : 'Visitor');
    var username = s ? s.username : 'visitor';
    var l = getActivityLog();
    l.push({
      user: who, username: username, page: page,
      action: action || 'visit', detail: detail || '',
      at: new Date().toISOString()
    });
    if (l.length > 1200) l = l.slice(-1200);
    _set(KEYS.activityLog, l);
    var p = getPresence();
    var seenAt = Date.now();
    /* `at` mirrors `lastSeen` as an ISO string: the sync merge engine picks
       the newer of two presence entries via `at`/`updatedAt`, and without it
       remote devices could never overwrite a stale local presence record. */
    p[username] = {
      name: who, username: username, lastSeen: seenAt,
      at: new Date(seenAt).toISOString(),
      page: page, action: action || 'visit', detail: detail || ''
    };
    _set(KEYS.presence, p);
  }
  /* Record a meaningful in-page action ("sent a chat message", "answered a
     poll", …) against the current user. */
  function logAction(action, detail, page) {
    var s = getSession();
    logActivity(page || (document.body && document.body.getAttribute('data-page')) || '', null, action, detail);
    /* One place to fan a notable action out to the mascots: every caller of
       logAction (chat, polls, AI, uploads) then gets a matching reaction
       without each page having to remember to ask for one. */
    try {
      document.dispatchEvent(new CustomEvent('aia-stickman-react', { detail: { action: action, detail: detail } }));
    } catch (e) {}
    return s;
  }
  function getPresence() { return _get(KEYS.presence, {}); }
  function getOnlineUsers(maxAgeMs) {
    maxAgeMs = maxAgeMs || 120000;
    var now = Date.now();
    var p = getPresence();
    var out = [];
    Object.keys(p).forEach(function (k) {
      if (now - p[k].lastSeen < maxAgeMs) out.push(p[k]);
    });
    return out.sort(function (a, b) { return b.lastSeen - a.lastSeen; });
  }
  /* Aggregate per-user activity: page visits, notable actions, chat and AI
     usage. Names come from the real student roster only. */
  function getUserStats() {
    var log = getActivityLog();
    var stats = {};
    function ensure(username, name) {
      if (!stats[username]) {
        stats[username] = {
          name: name, username: username, pages: {}, pageCount: 0,
          actions: {}, actionCount: 0, lastSeen: null, firstSeen: null,
          recent: [], chats: 0, ai: 0
        };
      }
      var st = stats[username];
      if (name && (!st.name || st.name === 'Visitor' || st.name === 'ADMIN')) st.name = name;
      return st;
    }
    log.forEach(function (e) {
      var st = ensure(e.username, e.user);
      st.pageCount++;
      if (e.page) st.pages[e.page] = (st.pages[e.page] || 0) + 1;
      var act = e.action || 'visit';
      st.actions[act] = (st.actions[act] || 0) + 1;
      if (act !== 'visit') st.actionCount++;
      if (!st.lastSeen || new Date(e.at) > new Date(st.lastSeen)) st.lastSeen = e.at;
      if (!st.firstSeen || new Date(e.at) < new Date(st.firstSeen)) st.firstSeen = e.at;
    });
    /* recent trail, newest first, capped for display */
    var byUser = {};
    log.slice().reverse().forEach(function (e) {
      var st = ensure(e.username, e.user);
      byUser[e.username] = byUser[e.username] || 0;
      if (byUser[e.username] < 12) {
        st.recent.push({ page: e.page, action: e.action || 'visit', detail: e.detail || '', at: e.at });
        byUser[e.username]++;
      }
    });
    /* chat counts by username */
    getClassChat().forEach(function (m) {
      if (!m || !m.username) return;
      var st = ensure(m.username, m.name);
      st.chats++;
    });
    /* AI usage counts. The global AI log keys entries by username in `user`. */
    getAiLog().forEach(function (m) {
      if (!m || !m.user) return;
      var st = ensure(m.user, null);
      st.ai++;
      if (m.role === 'user') st.aiPrompts = (st.aiPrompts || 0) + 1;
    });
    return stats;
  }

  /* ---------- AI config ---------- */
  /* The config object itself is synced (mode, model, prompt…) but the API
     key is stripped and kept in its own device-local key. `getAiConfig()`
     reassembles the two so callers are unchanged, and anything reading the
     raw synced value can never see the secret. */
  function getAiKey() { return _get(KEYS.aiKey, ''); }
  function setAiKey(k) { return _set(KEYS.aiKey, String(k || '')); }
  function getAiConfig() {
    var cfg = _get(KEYS.aiConfig, { mode: 'local', apiKey: '', systemPrompt: 'You are Class AI, a friendly study assistant for AIA Class 10-A students. Answer clearly and helpfully.', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', temperature: 0.7 });
    cfg = Object.assign({}, cfg);
    /* older saves may still carry a key in the synced blob — migrate it out
       so a previously exposed key stops being published from now on */
    if (cfg.apiKey) { if (!getAiKey()) setAiKey(cfg.apiKey); delete cfg.apiKey; _set(KEYS.aiConfig, cfg); }
    cfg.apiKey = getAiKey();
    return cfg;
  }
  /* ---------- shared AI (admin opt-in) ----------
     A student with no key of their own would otherwise only ever get the
     offline answers. The admin can turn this on to lend their own key to the
     class. The endpoint and model travel in the clear; the key itself is
     wrapped so it is not sitting in plain sight in the synced blob.
     This is obfuscation, NOT secrecy: anyone who can read the page's own
     JavaScript can derive the same wrapper. The admin panel says so before
     the switch can be turned on. */
  var AI_SHARE_KEY = 'aia_ai_shared';
  var AI_SHARE_SALT = 'aia10a-sharing-v1';
  function _shareCipher() { return (getPassFull() || '') + '|' + AI_SHARE_SALT; }
  /* Small reversible wrapper — enough to keep the key out of casual view in
     the synced JSON, not a security boundary. */
  function _obfuscate(str, cipher) {
    try {
      var out = [], c = String(cipher || '');
      for (var i = 0; i < str.length; i++) {
        out.push(str.charCodeAt(i) ^ c.charCodeAt(i % c.length));
      }
      return btoa(out.map(function (n) { return String.fromCharCode(n & 0xff); }).join(''));
    } catch (e) { return ''; }
  }
  function _unobfuscate(b64, cipher) {
    try {
      var raw = atob(b64), c = String(cipher || ''), out = '';
      for (var i = 0; i < raw.length; i++) {
        out += String.fromCharCode(raw.charCodeAt(i) ^ c.charCodeAt(i % c.length));
      }
      return out;
    } catch (e) { return ''; }
  }
  /* The full admin passphrase, used only as the shared-key wrapper input. */
  function getPassFull() {
    var passes = (window.SEED && window.SEED.admin_passes) || {};
    return passes.full || '';
  }
  function getAiSharedRaw() { return _get(AI_SHARE_KEY, null); }
  /* Returns a ready-to-use config for this device, or null when sharing is
     off / this device cannot unlock it. */
  function getAiSharedConfig() {
    var raw = getAiSharedRaw();
    if (!raw || !raw.blob) return null;
    var cipher = _shareCipher();
    if (!cipher) return null;
    try {
      var packed = _unobfuscate(raw.blob, cipher);
      var obj = JSON.parse(packed);
      if (!obj || !obj.apiKey) return null;
      var base = getAiConfig();
      return {
        apiKey: obj.apiKey,
        baseUrl: raw.baseUrl || base.baseUrl,
        model: raw.model || base.model,
        temperature: (raw.temperature != null ? raw.temperature : base.temperature),
        systemPrompt: raw.systemPrompt || base.systemPrompt,
        mode: 'api',
        shared: true
      };
    } catch (e) { return null; }
  }
  function aiSharingOn() { return !!(getAiSharedRaw() && getAiSharedRaw().blob); }
  /* Called from the admin panel. `cfg` is the admin's own config. */
  function setAiSharedConfig(cfg) {
    var cipher = _shareCipher();
    if (!cfg || !cfg.apiKey || !cipher) return false;
    var inner = { apiKey: cfg.apiKey };
    var meta = {
      baseUrl: cfg.baseUrl || 'https://api.openai.com/v1',
      model: cfg.model || 'gpt-4o-mini',
      temperature: (cfg.temperature != null ? cfg.temperature : 0.7),
      systemPrompt: cfg.systemPrompt || '',
      at: new Date().toISOString(),
      blob: _obfuscate(JSON.stringify(inner), cipher)
    };
    _set(AI_SHARE_KEY, meta);
    return true;
  }
  function clearAiShared() { _set(AI_SHARE_KEY, null); }
  function setAiConfig(cfg) {
    var clean = Object.assign({}, cfg || {});
    if ('apiKey' in clean) { setAiKey(clean.apiKey); delete clean.apiKey; }
    return _set(KEYS.aiConfig, clean);
  }

  /* ---------- subjects ---------- */
  function getSubjects() {
    var list = (window.SEED && window.SEED.subjects) || [];
    var teachers = getTeachers();
    if (!teachers.length) return list;
    /* The teacher's name is owned by the (synced) teacher record, so an admin
       edit there must show up on every page. Returns copies — callers must not
       mutate the seed. */
    return list.map(function (s) {
      if (!s) return s;
      var want = String(s.name || '').trim().toLowerCase();
      var t = teachers.find(function (x) {
        return x && String(x.subject || '').trim().toLowerCase() === want;
      });
      return t && t.name ? Object.assign({}, s, { teacher: t.name }) : s;
    });
  }
  function getSubjectContent() { return _get(KEYS.subjectContent, {}); }
  function setSubjectContent(name, data) {
    data.updatedAt = new Date().toISOString();
    var all = getSubjectContent(); all[name] = data; return _set(KEYS.subjectContent, all);
  }
  function getSubjectContentFor(name) { return _get(KEYS.subjectContent, {})[name] || null; }
  function getSubjectPhotos() { return _get(KEYS.subjectPhotos, {}); }
  function setSubjectPhoto(name, photos) {
    var all = getSubjectPhotos(); all[name] = (photos || []).slice(-24);
    var ok = _set(KEYS.subjectPhotos, all);
    if (ok) { try { localStorage.setItem('aia_subject_photos_at_' + name, new Date().toISOString()); } catch (e) {} }
    return ok;
  }
  function getSubjectPhotoList(name) { return _get(KEYS.subjectPhotos, {})[name] || []; }

  /* ---------- GitHub data cache ---------- */
  function getGithubData() { return _get(KEYS.githubData, null); }
  function setGithubData(d) { _set(KEYS.githubData, d); }
  function getGithubUrl() {
    var cfg = getAiConfig();
    return cfg.githubUrl || (window.SEED && window.SEED.github_data_url) || '';
  }

  /* ---------- chat mode (-) ---------- */
  function getChatMode() { return _get(KEYS.chatMode, 'study'); }
  function setChatMode(m) { _set(KEYS.chatMode, m); }

  /* ---------- theme (admin pick) ---------- */
  var THEMES = ['glass', 'luxury', 'simple', 'midnight', 'neon', 'sunset', 'ocean', 'royal'];
  var THEME_KEY = 'aia_theme';
  function getTheme() {
    var t;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (t && THEMES.indexOf(t) !== -1) return t;
    return 'luxury';
  }
  function setTheme(t) {
    if (THEMES.indexOf(t) === -1) t = 'luxury';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    document.documentElement.setAttribute('data-theme', t);
    if (!window.__aiaApplying) {
      try { document.dispatchEvent(new CustomEvent('aia-local-write', { detail: { key: THEME_KEY } })); } catch (e) {}
    }
    return t;
  }

  /* ---------- export / import ---------- */
  function exportAll() {
    var out = {};
    [KEYS.students, KEYS.studentProfiles, KEYS.teachers, KEYS.leadership, KEYS.homework,
     KEYS.announcements, KEYS.polls, KEYS.testScores, KEYS.comments, KEYS.pollVotes,
     KEYS.classChat, KEYS.activityLog, KEYS.presence, KEYS.aiLog,
     KEYS.subjectContent, KEYS.subjectPhotos,
     KEYS.githubData, KEYS.aiConfig, 'aia_credentials_overrides'].forEach(function (k) {
      try {
        var v = localStorage.getItem(k);
        if (v) out[k] = JSON.parse(v);
      } catch (e) {}
    });
    try { out.aia_theme = localStorage.getItem('aia_theme') || 'luxury'; } catch (e) {}
    out._exported_at = new Date().toISOString();
    return JSON.stringify(out, null, 2);
  }
  function importAll(jsonStr) {
    var data = JSON.parse(jsonStr);
    /* Accept both raw backups and AIA2 sync snapshots — merge safely. */
    if (data && data.data && !data.aia_homework) {
      if (window.AiaSync) { window.AiaSync.mergeSnapshot(data); return true; }
      data = data.data;
    }
    Object.keys(data).forEach(function (k) {
      if (k === '_exported_at') return;
      try {
        if (k === 'aia_theme' && typeof data[k] === 'string') { setTheme(data[k]); return; }
        localStorage.setItem(k, JSON.stringify(data[k]));
      } catch (e) {}
    });
    try { document.dispatchEvent(new CustomEvent('aia-data-change', { detail: { key: '*' } })); } catch (e) {}
    try { window.dispatchEvent(new Event('aia-sync')); } catch (e) {}
    return true;
  }

  /* ---------- reset ---------- */
  function resetToSeed(includeSession) {
    var seed = window.SEED || {};
    _set(KEYS.students, seed.students || []);
    _set(KEYS.studentProfiles, seed.student_profiles || []);
    _set(KEYS.teachers, seed.teachers || []);
    _set(KEYS.leadership, seed.leadership || []);
    _set(KEYS.homework, seed.homework || []);
    _set(KEYS.announcements, (seed.announcements || []).map(function (a) {
      if (!a.created_at) a = Object.assign({ created_at: '2026-09-14T12:00:00.000Z' }, a);
      return a;
    }));
    _set(KEYS.polls, seed.polls || []);
    _set(KEYS.testScores, seed.test_scores || []);
    _set(KEYS.comments, {});
    _set(KEYS.pollVotes, {});
    _set(KEYS.classChat, []);
    _set(KEYS.aiLog, []);
    _set(KEYS.activityLog, []);
    _set(KEYS.presence, {});
    _set(KEYS.subjectContent, {});
    _set(KEYS.subjectPhotos, {});
    _set(KEYS.githubData, null);
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf('aia_ai_chat_') === 0) localStorage.removeItem(k);
    });
    if (includeSession) { clearSession(); setUnlocked(false); setAdminAuth(null); }
  }

  /* ---------- counts ---------- */
  function getStudentCount() { return getStudents().length; }
  function getTeacherCount() { return getTeachers().length; }
  function getHomeworkCount() { return getHomework().length; }
  function getScoreCount() { return getTestScores().length; }
  function getAnnouncementCount() { return getAnnouncements().length; }
  function getPollCount() { return getPolls().length; }
  function getProfileCount() {
    return getStudentProfiles().filter(function (p) {
      return p.bio || p.strengths || p.interests || p.goals;
    }).length;
  }

  return {
    getStudents: getStudents, setStudents: setStudents,
    getStudentProfiles: getStudentProfiles, setStudentProfiles: setStudentProfiles, saveProfile: saveProfile,
    getTeachers: getTeachers, setTeachers: setTeachers,
    getLeadership: getLeadership, setLeadership: setLeadership,
    getHomework: getHomework, setHomework: setHomework, addHomework: addHomework, deleteHomework: deleteHomework,
    getAnnouncements: getAnnouncements, setAnnouncements: setAnnouncements, addAnnouncement: addAnnouncement, deleteAnnouncement: deleteAnnouncement,
    getPolls: getPolls, setPolls: setPolls, addPoll: addPoll, deletePoll: deletePoll,
    getTestScores: getTestScores, setTestScores: setTestScores, addTestScore: addTestScore, deleteTestScore: deleteTestScore,
    getComments: getComments, addComment: addComment, deleteComment: deleteComment,
    votePoll: votePoll, hasVoted: hasVoted, hasVotedPoll: hasVotedPoll,
    pollCounts: pollCounts, myPollVote: myPollVote, uid: _uid,
    isUnlocked: isUnlocked, setUnlocked: setUnlocked,
    getAdminAuth: getAdminAuth, setAdminAuth: setAdminAuth, isAdminAuthed: isAdminAuthed, isFullAdmin: isFullAdmin, verifyPass: verifyPass,
    getSession: getSession, setSession: setSession, clearSession: clearSession, isLoggedIn: isLoggedIn, isAdminUser: isAdminUser,
    getCredentials: getCredentials, getEffectiveCredentials: getEffectiveCredentials,
    ensureAllCredentials: ensureAllCredentials,
    findCredentialsByName: findCredentialsByName, authenticate: authenticate, resetPassword: resetPassword,
    getClassChat: getClassChat, addClassChat: addClassChat, setClassChat: setClassChat,
    deleteClassChat: deleteClassChat, deleteClassChatById: deleteClassChatById, clearClassChat: clearClassChat,
    getAiHistory: getAiHistory, addAiMessage: addAiMessage, clearAiHistory: clearAiHistory,
    getAiLog: getAiLog, clearAiLog: clearAiLog,
    getActivityLog: getActivityLog, logActivity: logActivity, logAction: logAction,
    getPresence: getPresence, getOnlineUsers: getOnlineUsers, getUserStats: getUserStats,
    getAiConfig: getAiConfig, setAiConfig: setAiConfig,
    getAiSharedConfig: getAiSharedConfig, setAiSharedConfig: setAiSharedConfig,
    clearAiShared: clearAiShared, aiSharingOn: aiSharingOn,
    getAiKey: getAiKey, setAiKey: setAiKey,
    getSubjects: getSubjects,
    getSubjectContent: getSubjectContent, setSubjectContent: setSubjectContent, getSubjectContentFor: getSubjectContentFor,
    getSubjectPhotos: getSubjectPhotos, setSubjectPhoto: setSubjectPhoto, getSubjectPhotoList: getSubjectPhotoList,
    getGithubData: getGithubData, setGithubData: setGithubData, getGithubUrl: getGithubUrl,
    getChatMode: getChatMode, setChatMode: setChatMode,
    getTheme: getTheme, setTheme: setTheme,
    getFiles: getFiles, addFile: addFile, removeFile: removeFile,
    getPyqs: getPyqs, addPyq: addPyq, removePyq: removePyq,
    getPrivateChat: getPrivateChat, addPrivateMessage: addPrivateMessage,
    getPrivateCleared: getPrivateCleared, clearPrivateChat: clearPrivateChat,
    getBlock: getBlock, blockUser: blockUser, unblockUser: unblockUser,
    isBlocked: isBlocked, getBlocks: getBlocks, getBlocksRaw: getBlocksRaw,
    timeUntil: timeUntil, blockCountdown: blockCountdown,
    exportAll: exportAll, importAll: importAll,
    resetToSeed: resetToSeed,
    getStudentCount: getStudentCount, getTeacherCount: getTeacherCount,
    getHomeworkCount: getHomeworkCount, getScoreCount: getScoreCount,
    getAnnouncementCount: getAnnouncementCount, getPollCount: getPollCount, getProfileCount: getProfileCount,
    KEYS: KEYS
  };
})();