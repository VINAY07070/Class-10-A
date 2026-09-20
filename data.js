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
    aiLog: 'aia_ai_log',
    activityLog: 'aia_activity_log',
    presence: 'aia_presence',
    aiConfig: 'aia_ai_config',
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
  function deleteHomework(i) { var l = getHomework(); l.splice(i, 1); setHomework(l); rebuildCommentKeys('hw_', i); }
  function getAnnouncements() { return _get(KEYS.announcements, (window.SEED && window.SEED.announcements) || []); }
  function setAnnouncements(v) { _set(KEYS.announcements, v); }
  function addAnnouncement(item) {
    _stamp(item, 'ann');
    if (!item.date) item.date = item.created_at;
    var l = getAnnouncements(); l.unshift(item); setAnnouncements(l); return 0;
  }
  function deleteAnnouncement(i) { var l = getAnnouncements(); l.splice(i, 1); setAnnouncements(l); rebuildCommentKeys('ann_', i); }
  function getPolls() { return _get(KEYS.polls, (window.SEED && window.SEED.polls) || []); }
  function setPolls(v) { _set(KEYS.polls, v); }
  function addPoll(item) {
    _stamp(item, 'poll');
    item._voteCounts = item._voteCounts || {};
    item._votes = item._votes || {};
    var l = getPolls(); l.unshift(item); setPolls(l); return 0;
  }
  function deletePoll(i) {
    var l = getPolls(); l.splice(i, 1); setPolls(l);
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
  function deleteTestScore(i) { var l = getTestScores(); l.splice(i, 1); setTestScores(l); }

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
  function logActivity(page, name) {
    var s = getSession();
    var who = name || (s ? s.name : 'Visitor');
    var username = s ? s.username : 'visitor';
    var l = getActivityLog();
    l.push({ user: who, username: username, page: page, at: new Date().toISOString() });
    if (l.length > 800) l = l.slice(-800);
    _set(KEYS.activityLog, l);
    var p = getPresence();
    p[username] = { name: who, lastSeen: Date.now(), page: page };
    _set(KEYS.presence, p);
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
  function getUserStats() {
    var log = getActivityLog();
    var stats = {};
    log.forEach(function (e) {
      if (!stats[e.username]) stats[e.username] = { name: e.user, pages: {}, pageCount: 0, lastSeen: e.at, messages: 0 };
      var st = stats[e.username];
      st.pageCount++;
      st.pages[e.page] = (st.pages[e.page] || 0) + 1;
      if (!st.lastSeen || new Date(e.at) > new Date(st.lastSeen)) st.lastSeen = e.at;
    });
    return stats;
  }

  /* ---------- AI config ---------- */
  function getAiConfig() {
    return _get(KEYS.aiConfig, { mode: 'local', apiKey: '', systemPrompt: 'You are Class AI, a friendly study assistant for AIA Class 10-A students. Answer clearly and helpfully.', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', temperature: 0.7 });
  }
  function setAiConfig(cfg) { _set(KEYS.aiConfig, cfg); }

  /* ---------- subjects ---------- */
  function getSubjects() {
    return (window.SEED && window.SEED.subjects) || [];
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
    return 'glass';
  }
  function setTheme(t) {
    if (THEMES.indexOf(t) === -1) t = 'glass';
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
    try { out.aia_theme = localStorage.getItem('aia_theme') || 'glass'; } catch (e) {}
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
    findCredentialsByName: findCredentialsByName, authenticate: authenticate, resetPassword: resetPassword,
    getClassChat: getClassChat, addClassChat: addClassChat, setClassChat: setClassChat,
    deleteClassChat: deleteClassChat, deleteClassChatById: deleteClassChatById, clearClassChat: clearClassChat,
    getAiHistory: getAiHistory, addAiMessage: addAiMessage, clearAiHistory: clearAiHistory,
    getAiLog: getAiLog, clearAiLog: clearAiLog,
    getActivityLog: getActivityLog, logActivity: logActivity,
    getPresence: getPresence, getOnlineUsers: getOnlineUsers, getUserStats: getUserStats,
    getAiConfig: getAiConfig, setAiConfig: setAiConfig,
    getSubjects: getSubjects,
    getSubjectContent: getSubjectContent, setSubjectContent: setSubjectContent, getSubjectContentFor: getSubjectContentFor,
    getSubjectPhotos: getSubjectPhotos, setSubjectPhoto: setSubjectPhoto, getSubjectPhotoList: getSubjectPhotoList,
    getGithubData: getGithubData, setGithubData: setGithubData, getGithubUrl: getGithubUrl,
    getChatMode: getChatMode, setChatMode: setChatMode,
    getTheme: getTheme, setTheme: setTheme,
    getFiles: getFiles, addFile: addFile, removeFile: removeFile,
    exportAll: exportAll, importAll: importAll,
    resetToSeed: resetToSeed,
    getStudentCount: getStudentCount, getTeacherCount: getTeacherCount,
    getHomeworkCount: getHomeworkCount, getScoreCount: getScoreCount,
    getAnnouncementCount: getAnnouncementCount, getPollCount: getPollCount, getProfileCount: getProfileCount,
    KEYS: KEYS
  };
})();