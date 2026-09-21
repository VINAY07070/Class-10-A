/* ============================================
   Admin panel V2 — analytics, activity feed,
   user stats, AI brain config, subject mgmt,
   photos, backup/export/import.
   ============================================ */

(function () {
  App.initShared('admin.html');

  var loginEl = document.getElementById('adminLogin');
  var appEl = document.getElementById('adminApp');
  var passInput = document.getElementById('adminPassInput');
  var loginBtn = document.getElementById('adminLoginBtn');
  var ownerUser = document.getElementById('adminOwnerUser');
  var ownerPass = document.getElementById('adminOwnerPass');
  var ownerBtn = document.getElementById('adminOwnerLoginBtn');
  var loginError = document.getElementById('adminLoginError');

  var authLevel = 'full'; // basic = visitor pass, full = admin pass
  var refreshTimer = null;

  /* ---------- auth ---------- */
  function checkAuth() {
    if (DataStore.isAdminAuthed()) {
      authLevel = DataStore.getAdminAuth();
      loginEl.style.display = 'none';
      appEl.style.display = 'block';
      renderAuthBanner();
      loadAll();
      startLiveRefresh();
    }
  }

  function grantAuth(level, who) {
    DataStore.setAdminAuth(level);
    authLevel = level;
    if (who) DataStore.setSession(who);
    loginEl.style.display = 'none';
    appEl.style.display = 'block';
    renderAuthBanner();
    loadAll();
    startLiveRefresh();
    App.showToast('Welcome, Admin! 👑', 'success');
  }

  function renderAuthBanner() {
    var banner = document.getElementById('adminAuthBanner');
    if (!banner) return;
    if (authLevel === 'full') {
      banner.className = 'admin-auth-banner full';
      banner.innerHTML = '<i class="fa-solid fa-crown"></i> Full admin access — you can edit everything.';
    } else {
      banner.className = 'admin-auth-banner basic';
      banner.innerHTML = '<i class="fa-solid fa-eye"></i> Read-only (visitor pass). Full access needs the admin pass <code>Admin@AIA2026</code>.';
    }
  }

  function tryPassLogin() {
    var val = passInput.value.trim();
    if (!val) { loginError.textContent = 'Enter a passcode.'; return; }
    var level = DataStore.verifyPass(val);
    if (!level) { loginError.textContent = 'Incorrect passcode. Try again.'; return; }
    grantAuth(level);
  }

  function tryOwnerLogin() {
    var u = ownerUser.value.trim();
    var p = ownerPass.value;
    if (!u || !p) { loginError.textContent = 'Enter both owner username and password.'; return; }
    var auth = DataStore.authenticate(u, p);
    if (!auth || auth.role !== 'admin') { loginError.textContent = 'Those owner credentials are not recognised.'; return; }
    grantAuth('full', auth);
  }

  if (loginBtn) loginBtn.addEventListener('click', tryPassLogin);
  if (passInput) passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPassLogin(); });
  if (ownerBtn) ownerBtn.addEventListener('click', tryOwnerLogin);
  if (ownerPass) ownerPass.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryOwnerLogin(); });

  /* ---------- tab switching ---------- */
  document.querySelectorAll('.admin-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.admin-panel').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var panel = document.getElementById('panel-' + tab.getAttribute('data-tab'));
      if (panel) panel.classList.add('active');
    });
  });

  /* ---------- dashboard ---------- */
  function loadDashboard() {
    var el = document.getElementById('adminDashboard');
    if (!el) return;
    var online = DataStore.getOnlineUsers().length;
    var log = DataStore.getActivityLog();
    var chatCount = DataStore.getClassChat().length;
    var aiMsgs = DataStore.getAiLog().length;
    var cards = [
      { icon: 'fa-book-open', label: 'Homeworks', value: DataStore.getHomeworkCount(), color: 'gold' },
      { icon: 'fa-chart-column', label: 'Test Scores', value: DataStore.getScoreCount(), color: 'blue' },
      { icon: 'fa-bullhorn', label: 'Announcements', value: DataStore.getAnnouncementCount(), color: 'violet' },
      { icon: 'fa-square-poll-vertical', label: 'Polls', value: DataStore.getPollCount(), color: 'pink' },
      { icon: 'fa-users', label: 'Students', value: DataStore.getStudentCount(), color: 'green' },
      { icon: 'fa-graduation-cap', label: 'Profiles', value: DataStore.getProfileCount(), color: 'gold' },
      { icon: 'fa-message', label: 'Chat messages', value: chatCount, color: 'cyan' },
      { icon: 'fa-robot', label: 'AI messages', value: aiMsgs, color: 'blue' }
    ];
    el.innerHTML = '<div class="online-banner"><span class="pulse-dot"></span> <strong>' + online + '</strong> online now · ' +
      App.escapeHtml(log.length) + ' total visits logged</div>' +
      '<div class="admin-stat-grid">' + cards.map(function (c) {
        return '<div class="admin-stat-card"><div class="admin-stat-icon ' + c.color + '"><i class="fa-solid ' + c.icon + '"></i></div>' +
          '<div class="admin-stat-value">' + c.value + '</div><div class="admin-stat-label">' + c.label + '</div></div>';
      }).join('') + '</div>';
  }

  /* ---------- live activity ---------- */
  var ACTION_META = {
    visit: { icon: 'fa-eye', label: 'Visited' },
    chat: { icon: 'fa-comment', label: 'Chatted' },
    upload: { icon: 'fa-paperclip', label: 'Shared a file' },
    ai: { icon: 'fa-robot', label: 'Used the AI' },
    poll: { icon: 'fa-square-poll-vertical', label: 'Voted' },
    login: { icon: 'fa-right-to-bracket', label: 'Logged in' },
    profile: { icon: 'fa-id-card', label: 'Edited a profile' }
  };
  function actionIcon(e) { return (ACTION_META[e.action] || ACTION_META.visit).icon; }
  function actionLabel(e) {
    var m = ACTION_META[e.action] || ACTION_META.visit;
    return e.detail ? e.detail : m.label + (e.page ? ' ' + e.page : '');
  }
  function prettyPage(p) { return String(p || '').replace('.html', '') || 'hub'; }
  function isAdminUser(username, name) {
    return String(username || '').indexOf('admin_') === 0 ||
      String(name || '').toUpperCase() === 'VINAY KHILERI';
  }

  function renderActivity() {
    var onlineEl = document.getElementById('onlineNow');
    var feedEl = document.getElementById('activityFeed');
    if (!onlineEl || !feedEl || !DataStore.isAdminAuthed()) return;

    var online = DataStore.getOnlineUsers();
    onlineEl.innerHTML = '<div class="online-title"><span class="pulse-dot"></span> Online now (' + online.length + ')</div>' +
      (online.length
        ? online.map(function (u) {
            var act = u.action && u.action !== 'visit' ? u.action : 'browsing';
            return '<span class="online-user" title="' + App.escapeHtml(u.detail || '') + '">' +
              '<i class="fa-solid fa-circle"></i> ' + App.escapeHtml(u.name) +
              ' <span class="text-muted">· ' + App.escapeHtml(act) + ' ' +
              (u.page ? '@ ' + App.escapeHtml(prettyPage(u.page)) : '') + '</span></span>';
          }).join('')
        : '<span class="text-muted">Nobody online right now.</span>');

    var log = DataStore.getActivityLog().slice().reverse();

    /* Group the newest entries per user so every student gets their own
       section: what they are doing, where, and when. */
    var order = [], groups = {};
    log.forEach(function (e) {
      var k = e.username || 'visitor';
      if (!groups[k]) { groups[k] = { name: e.user, items: [], last: e.at }; order.push(k); }
      if (groups[k].items.length < 8) groups[k].items.push(e);
      if (e.at > groups[k].last) groups[k].last = e.at;
    });
    /* most recently active first */
    order.sort(function (a, b) { return new Date(groups[b].last) - new Date(groups[a].last); });
    order = order.slice(0, 25);

    feedEl.innerHTML = order.length
      ? order.map(function (k) {
          var g = groups[k];
          return '<div class="activity-user-block">' +
            '<div class="activity-user-head">' +
              '<span class="activity-user-name"><i class="fa-solid fa-circle-user"></i> ' + App.escapeHtml(g.name) + '</span>' +
              '<span class="activity-user-sub">@' + App.escapeHtml(k) + ' · ' +
                (isAdminUser(k, g.name) ? '<span class="admin-chip">ADMIN</span>' : g.items.length + ' recent') +
              ' · last ' + App.timeAgo(g.last) + '</span>' +
            '</div>' +
            '<ul class="activity-user-items">' + g.items.map(function (e) {
              return '<li><i class="fa-solid ' + actionIcon(e) + '"></i>' +
                '<span class="act-text">' + App.escapeHtml(actionLabel(e)) + '</span>' +
                '<span class="act-time">' + App.timeAgo(e.at) + '</span></li>';
            }).join('') + '</ul>' +
          '</div>';
        }).join('')
      : '<div class="text-muted" style="text-align:center;padding:20px">No activity yet — students will show up here as they visit pages.</div>';
  }

  /* ---------- student credentials ---------- */
  function credRows() {
    var creds = DataStore.getEffectiveCredentials().slice();
    var roster = DataStore.getStudents();
    /* roster order first, then anything else */
    var order = {};
    roster.forEach(function (n, i) { order[String(n).toUpperCase()] = i; });
    creds.sort(function (a, b) {
      var ai = order[String(a.name).toUpperCase()], bi = order[String(b.name).toUpperCase()];
      if (ai === undefined) ai = 9999; if (bi === undefined) bi = 9999;
      return ai - bi || String(a.name).localeCompare(String(b.name));
    });
    return creds;
  }
  function credCsv() {
    var lines = ['Student,Username,Password,Role'];
    credRows().forEach(function (c) {
      var role = isAdminUser(c.username, c.name) ? 'admin' : 'student';
      lines.push([c.name, c.username, c.password, role]
        .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','));
    });
    return lines.join('\n');
  }
  function renderCreds() {
    var el = document.getElementById('credTable');
    if (!el) return;
    var creds = credRows();
    var missing = DataStore.getStudents().filter(function (n) {
      return !creds.some(function (c) { return String(c.name).toUpperCase() === String(n).toUpperCase(); });
    });
    el.innerHTML = (missing.length
      ? '<div class="cred-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' + missing.length +
        ' student' + (missing.length > 1 ? 's have' : ' has') + ' no login yet: ' + App.escapeHtml(missing.join(', ')) + '</div>'
      : '<div class="cred-ok"><i class="fa-solid fa-circle-check"></i> All ' + DataStore.getStudents().length + ' students have logins.</div>') +
      '<table class="admin-table"><thead><tr><th>#</th><th>Student</th><th>Username</th><th>Password</th><th></th></tr></thead><tbody>' +
      creds.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td>' +
          '<td><strong>' + App.escapeHtml(c.name) + '</strong>' +
            (isAdminUser(c.username, c.name) ? ' <span class="admin-chip">ADMIN</span>' : '') + '</td>' +
          '<td><code>' + App.escapeHtml(c.username) + '</code></td>' +
          '<td><code>' + App.escapeHtml(c.password) + '</code></td>' +
          '<td><button class="btn btn-secondary btn-sm copy-cred" data-user="' + App.escapeHtml(c.username) + '" title="Copy"><i class="fa-solid fa-copy"></i></button></td></tr>';
      }).join('') + '</tbody></table>';
    bindCopy(el);
  }
  function bindCopy(scope) {
    scope.querySelectorAll('.copy-cred').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var u = btn.getAttribute('data-user');
        var c = DataStore.getEffectiveCredentials().find(function (x) { return x.username.toLowerCase() === u.toLowerCase(); });
        if (!c) return;
        var text = 'Username: ' + c.username + '\nPassword: ' + c.password;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { App.showToast('Credentials copied', 'success'); })
            .catch(function () { App.showToast(text, 'info'); });
        } else App.showToast(text, 'info');
      });
    });
  }
  function initCreds() {
    var gen = document.getElementById('genCredsBtn');
    var copy = document.getElementById('copyCredsBtn');
    var dl = document.getElementById('downloadCredsBtn');
    if (gen) gen.addEventListener('click', function () {
      var res = DataStore.ensureAllCredentials();
      var out = document.getElementById('credGenResult');
      if (res.created.length) {
        out.textContent = 'Created ' + res.created.length + ' new login' + (res.created.length > 1 ? 's' : '') + ': ' +
          res.created.map(function (c) { return c.name + ' (' + c.username + ')'; }).join(', ');
        App.showToast('Generated ' + res.created.length + ' login' + (res.created.length > 1 ? 's' : ''), 'success');
      } else {
        out.textContent = 'Nothing to generate — every student already has a login.';
        App.showToast('All students already have logins', 'info');
      }
      renderCreds();
    });
    if (copy) copy.addEventListener('click', function () {
      var text = credCsv();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { App.showToast('All credentials copied', 'success'); })
          .catch(function () { App.showToast('Copy blocked by the browser', 'error'); });
      } else App.showToast('Copy not supported here', 'error');
    });
    if (dl) dl.addEventListener('click', function () {
      var blob = new Blob([credCsv()], { type: 'text/csv' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'class-10a-logins.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      App.showToast('Downloaded logins CSV', 'success');
    });
    renderCreds();
  }

  /* ---------- user stats ---------- */
  function renderUserStats() {
    var el = document.getElementById('userStatsTable');
    if (!el) return;
    var stats = DataStore.getUserStats();
    var creds = DataStore.getEffectiveCredentials();
    var names = stats ? Object.keys(stats) : [];

    if (!names.length) {
      el.innerHTML = '<div class="text-muted" style="text-align:center;padding:20px">No visit data yet. Ask classmates to open the site!</div>';
      return;
    }

    var rows = names.sort().map(function (u) {
      var s = stats[u];
      var pages = Object.keys(s.pages).sort().map(function (p) { return p + '×' + s.pages[p]; }).join(', ');
      var cred = creds.find(function (c) { return c.username.toLowerCase() === u.toLowerCase(); });
      var pw = cred ? cred.password : '—';
      var acts = Object.keys(s.actions).filter(function (a) { return a !== 'visit'; })
        .map(function (a) { return (ACTION_META[a] || { label: a }).label + '×' + s.actions[a]; }).join(', ');
      /* newest first: what this student is doing right now */
      var trail = (s.recent || []).slice(0, 5).map(function (r) {
        return '<li><i class="fa-solid ' + actionIcon(r) + '"></i> ' +
          App.escapeHtml(r.detail || ((ACTION_META[r.action] || ACTION_META.visit).label + (r.page ? ' ' + prettyPage(r.page) : ''))) +
          ' <span class="text-muted">· ' + App.timeAgo(r.at) + '</span></li>';
      }).join('');
      return '<tr>' +
        '<td><strong>' + App.escapeHtml(s.name) + '</strong>' +
          (isAdminUser(u, s.name) ? ' <span class="admin-chip">ADMIN</span>' : '') +
          '<div class="text-muted" style="font-size:.75rem">@' + App.escapeHtml(u) + '</div>' +
          (trail ? '<ul class="user-trail">' + trail + '</ul>' : '') + '</td>' +
        '<td>' + s.pageCount + '<div class="text-muted" style="font-size:.72rem">' + (s.chats || 0) + ' chat · ' + (s.ai || 0) + ' AI</div></td>' +
        '<td class="user-pages">' + App.escapeHtml(pages || '—') + '</td>' +
        '<td>' + (acts ? App.escapeHtml(acts) : '—') + '</td>' +
        '<td>' + App.timeAgo(s.lastSeen) + '</td>' +
        '<td><code style="font-size:.75rem">' + App.escapeHtml(pw) + '</code>' +
        '<button class="btn btn-secondary btn-sm reset-pw" data-user="' + App.escapeHtml(u) + '" style="margin-left:6px" title="Reset password"><i class="fa-solid fa-arrows-rotate"></i></button>' +
        '<button class="btn btn-secondary btn-sm copy-cred" data-user="' + App.escapeHtml(u) + '" style="margin-left:4px" title="Copy username &amp; password"><i class="fa-solid fa-copy"></i></button></td></tr>';
    }).join('');

    el.innerHTML = '<table class="admin-table"><thead><tr><th>Student</th><th>Visits</th><th>Pages</th><th>Actions</th><th>Last seen</th><th>Password</th></tr></thead><tbody>' + rows + '</tbody></table>';

    el.querySelectorAll('.reset-pw').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var u = btn.getAttribute('data-user');
        var newPw = randomPw(6);
        if (DataStore.resetPassword(u, newPw)) {
          App.showToast('Password reset → ' + newPw, 'success');
          renderUserStats();
        }
      });
    });
    el.querySelectorAll('.copy-cred').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var u = btn.getAttribute('data-user');
        var c = creds.find(function (x) { return x.username.toLowerCase() === u.toLowerCase(); });
        if (!c) return;
        var text = 'Username: ' + c.username + '\nPassword: ' + c.password;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { App.showToast('Credentials copied', 'success'); })
            .catch(function () { App.showToast(text, 'info'); });
        } else App.showToast(text, 'info');
      });
    });
  }

  function randomPw(n) {
    var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    var s = '';
    for (var i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }

  /* ---------- homework ---------- */
  function renderHw() {
    var el = document.getElementById('hwAdminList');
    if (!el) return;
    var list = DataStore.getHomework();
    el.innerHTML = list.length ? '<h4 class="admin-list-title">Published homework</h4>' + list.map(function (h, i) {
      return '<div class="admin-item"><div><strong>' + App.escapeHtml(h.subject) + '</strong> — ' + App.escapeHtml(String(h.task || '').split('\n')[0]) +
        '<div class="text-muted" style="font-size:.78rem">due ' + App.escapeHtml(h.due_date || '—') + '</div></div>' +
        '<button class="btn btn-danger btn-sm" data-del="hw" data-idx="' + i + '"><i class="fa-solid fa-trash"></i></button></div>';
    }).join('') : '<div class="text-muted" style="text-align:center;padding:16px">No homework yet.</div>';

    el.querySelectorAll('[data-del="hw"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this homework?')) return;
        DataStore.deleteHomework(parseInt(btn.getAttribute('data-idx'), 10));
        renderHw(); loadDashboard(); App.showToast('Deleted', 'info');
      });
    });
  }

  /* ---------- scores ---------- */
  function renderScores() {
    var el = document.getElementById('scoreAdminList');
    if (!el) return;
    var list = DataStore.getTestScores();
    el.innerHTML = list.length ? '<h4 class="admin-list-title">Published scores</h4>' + list.map(function (s, i) {
      return '<div class="admin-item"><div><strong>' + App.escapeHtml(s.student_name) + '</strong> — ' + App.escapeHtml(s.subject) + ' · ' + App.escapeHtml(s.test_name) +
        ' <span class="text-gold">' + s.score + '/' + s.max_score + '</span>' +
        '<div class="text-muted" style="font-size:.78rem">' + App.escapeHtml(s.test_date || 'date not set') + '</div></div>' +
        '<button class="btn btn-danger btn-sm" data-del="score" data-idx="' + i + '"><i class="fa-solid fa-trash"></i></button></div>';
    }).join('') : '<div class="text-muted" style="text-align:center;padding:16px">No scores yet.</div>';

    el.querySelectorAll('[data-del="score"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this score?')) return;
        DataStore.deleteTestScore(parseInt(btn.getAttribute('data-idx'), 10));
        renderScores(); loadDashboard(); App.showToast('Deleted', 'info');
      });
    });
  }

  /* ---------- announcements ---------- */
  function renderAnn() {
    var el = document.getElementById('annAdminList');
    if (!el) return;
    var list = DataStore.getAnnouncements();
    el.innerHTML = list.length ? '<h4 class="admin-list-title">Published announcements</h4>' + list.map(function (a, i) {
      return '<div class="admin-item"><div><strong>' + App.escapeHtml(a.title) + '</strong>' +
        '<div class="text-muted" style="font-size:.8rem">' + App.escapeHtml(a.body.split('\n')[0]) + '</div>' +
        '<div class="text-muted" style="font-size:.75rem">' + App.formatDate(a.date || a.created_at) + '</div></div>' +
        '<button class="btn btn-danger btn-sm" data-del="ann" data-idx="' + i + '"><i class="fa-solid fa-trash"></i></button></div>';
    }).join('') : '<div class="text-muted" style="text-align:center;padding:16px">No announcements yet.</div>';

    el.querySelectorAll('[data-del="ann"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this announcement?')) return;
        DataStore.deleteAnnouncement(parseInt(btn.getAttribute('data-idx'), 10));
        renderAnn(); loadDashboard(); App.showToast('Deleted', 'info');
      });
    });
  }

  /* ---------- polls ---------- */
  function renderPolls() {
    var el = document.getElementById('pollAdminList');
    if (!el) return;
    var list = DataStore.getPolls();
    el.innerHTML = list.length ? '<h4 class="admin-list-title">Published polls</h4>' + list.map(function (p, i) {
      return '<div class="admin-item"><div><strong>' + App.escapeHtml(p.question) + '</strong>' +
        '<div class="text-muted" style="font-size:.8rem">' + (p.options || []).join(' · ') + '</div></div>' +
        '<button class="btn btn-danger btn-sm" data-del="poll" data-idx="' + i + '"><i class="fa-solid fa-trash"></i></button></div>';
    }).join('') : '<div class="text-muted" style="text-align:center;padding:16px">No polls yet.</div>';

    el.querySelectorAll('[data-del="poll"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this poll?')) return;
        DataStore.deletePoll(parseInt(btn.getAttribute('data-idx'), 10));
        renderPolls(); loadDashboard(); App.showToast('Deleted', 'info');
      });
    });
  }

  /* ---------- selects ---------- */
  function fillStudentSelect(sel) {
    sel = sel || document.getElementById('scStudent');
    if (!sel) return;
    var students = DataStore.getStudents();
    sel.innerHTML = students.map(function (s) { return '<option value="' + App.escapeHtml(s) + '">' + App.escapeHtml(s) + '</option>'; }).join('');
    var psel = document.getElementById('profileStudent');
    if (psel) psel.innerHTML = students.map(function (s) { return '<option value="' + App.escapeHtml(s) + '">' + App.escapeHtml(s) + '</option>'; }).join('');
  }

  /* ---------- subjects admin ---------- */
  function renderSubjectsAdmin() {
    var sel = document.getElementById('subjSelect');
    if (!sel) return;
    var subjects = DataStore.getSubjects();
    sel.innerHTML = subjects.map(function (s) { return '<option value="' + App.escapeHtml(s.name) + '">' + App.escapeHtml(s.name) + '</option>'; }).join('');
    sel.dispatchEvent(new Event('change'));
  }

  function loadSubjectFields() {
    var sel = document.getElementById('subjSelect');
    var notesEl = document.getElementById('subjNotes');
    var preview = document.getElementById('subjPhotoPreview');
    if (!sel || !notesEl) return;
    var name = sel.value;
    var subj = DataStore.getSubjects().find(function (s) { return s.name === name; });
    var content = DataStore.getSubjectContentFor(name);
    notesEl.value = (content && content.notes) || (subj && subj.info) || '';
    var photos = DataStore.getSubjectPhotoList(name);
    if (preview) {
      preview.innerHTML = photos.length ? photos.map(function (p) {
        return '<img src="' + p + '" alt="photo">';
      }).join('') : '<span class="text-muted" style="font-size:.8rem">No photos yet. Add some below.</span>';
    }
  }

  var pendingPhotos = [];
  /* Compress photos before storing (max 1200px, JPEG ~0.72) so localStorage
     quota (~5MB) and sync codes don't explode. PNG kept only if tiny. */
  function compressImage(dataUrl, done) {
    var img = new Image();
    img.onload = function () {
      try {
        var MAX = 1200;
        var w = img.width, h = img.height;
        if (w <= MAX && h <= MAX && dataUrl.length < 350000) { done(dataUrl); return; }
        var scale = Math.min(1, MAX / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#0d1428'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var out = c.toDataURL('image/jpeg', 0.72);
        if (out.length > 900000) { /* still huge — shrink more */
          c.width = Math.round(c.width * 0.6); c.height = Math.round(c.height * 0.6);
          var ctx2 = c.getContext('2d');
          ctx2.fillStyle = '#0d1428'; ctx2.fillRect(0, 0, c.width, c.height);
          ctx2.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', 0.62);
        }
        done(out);
      } catch (e) { done(dataUrl); }
    };
    img.onerror = function () { done(null); };
    img.src = dataUrl;
  }
  function handlePhotoPick(e) {
    var files = Array.from(e.target.files || []).slice(0, 8);
    var preview = document.getElementById('subjPhotoPreview');
    if (!files.length) return;
    App.showToast('Compressing ' + files.length + ' photo(s)…', 'info');
    var done = 0;
    files.forEach(function (file) {
      if (!file.type || file.type.indexOf('image/') !== 0) { done++; return; }
      if (file.size > 12 * 1024 * 1024) { App.showToast(file.name + ' is over 12MB — skipped', 'error'); done++; return; }
      var reader = new FileReader();
      reader.onload = function (ev) {
        compressImage(ev.target.result, function (small) {
          done++;
          if (!small) { App.showToast('Could not read an image — skipped', 'error'); return; }
          pendingPhotos.push(small);
          var img = document.createElement('img');
          img.src = small;
          img.alt = 'new photo';
          if (preview) preview.appendChild(img);
          if (done === files.length) App.showToast(files.length + ' photo(s) ready — tap Save ✓', 'success');
        });
      };
      reader.onerror = function () { done++; App.showToast('Could not read ' + file.name, 'error'); };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function saveSubject() {
    var sel = document.getElementById('subjSelect');
    var notesEl = document.getElementById('subjNotes');
    if (!sel || !notesEl) return;
    var name = sel.value;
    var content = DataStore.getSubjectContentFor(name) || {};
    content.notes = notesEl.value;
    if (DataStore.setSubjectContent(name, content) === false) {
      App.showToast('Could not save — storage is full', 'error');
      return;
    }
    if (pendingPhotos.length) {
      var photos = DataStore.getSubjectPhotoList(name).concat(pendingPhotos);
      if (DataStore.setSubjectPhoto(name, photos) === false) {
        App.showToast('Photos NOT saved — storage full. Notes were saved. Remove old photos first.', 'error');
        return;
      }
      pendingPhotos = [];
    }
    App.showToast(name + ' saved ✅', 'success');
    loadSubjectFields();
  }

  /* ---------- AI config ---------- */
  function loadAiConfig() {
    var cfg = DataStore.getAiConfig();
    var modeEl = document.getElementById('aiMode');
    var keyEl = document.getElementById('aiApiKey');
    var baseEl = document.getElementById('aiBaseUrl');
    var modelEl = document.getElementById('aiModel');
    var tempEl = document.getElementById('aiTemp');
    var sysEl = document.getElementById('aiSystemPrompt');
    if (modeEl) modeEl.value = cfg.mode || 'local';
    if (keyEl) keyEl.value = cfg.apiKey || '';
    if (baseEl) baseEl.value = cfg.baseUrl || 'https://api.openai.com/v1';
    if (modelEl) modelEl.value = cfg.model || 'gpt-4o-mini';
    if (tempEl) tempEl.value = cfg.temperature || 0.7;
    if (sysEl) sysEl.value = cfg.systemPrompt || '';
    var urlEl = document.getElementById('githubUrlInput');
    if (urlEl) urlEl.value = DataStore.getGithubUrl() || '';
  }

  function saveAiConfig() {
    var cfg = {
      mode: document.getElementById('aiMode').value,
      apiKey: document.getElementById('aiApiKey').value.trim(),
      baseUrl: document.getElementById('aiBaseUrl').value.trim() || 'https://api.openai.com/v1',
      model: document.getElementById('aiModel').value.trim() || 'gpt-4o-mini',
      temperature: parseFloat(document.getElementById('aiTemp').value) || 0.7,
      systemPrompt: document.getElementById('aiSystemPrompt').value.trim()
    };
    DataStore.setAiConfig(cfg);
    App.showToast('AI config saved 🤖', 'success');
  }

  function testAi() {
    var resultEl = document.getElementById('aiTestResult');
    var msg = (document.getElementById('aiTestMsg') || {}).value || 'What is photosynthesis?';
    saveAiConfig();
    var cfg = DataStore.getAiConfig();
    resultEl.innerHTML = '<div class="text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> Testing' + (cfg.mode === 'api' ? ' via API (' + cfg.model + ')...' : ' local engine...') + '</div>';
    setTimeout(function () {
      if (cfg.mode === 'api' && cfg.apiKey) {
        var url = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
          body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: cfg.systemPrompt || 'You are Class AI.' }, { role: 'user', content: msg }], temperature: Number(cfg.temperature) || 0.7 })
        })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (d) {
            var text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || 'empty reply';
            resultEl.innerHTML = '<div class="ai-test-ok"><i class="fa-solid fa-circle-check"></i> API works! Reply: ' + App.escapeHtml(text.slice(0, 220)) + '</div>';
          })
          .catch(function (err) {
            resultEl.innerHTML = '<div class="ai-test-fail"><i class="fa-solid fa-circle-xmark"></i> API error: ' + App.escapeHtml(err.message) + '.<br><span class="text-muted">Note: browsers may block direct API calls (CORS). A local server or a CORS-enabled endpoint works best.</span></div>';
          });
      } else {
        var answer = 'Local engine works! 🎉 (No API key set — asking local class-knowledge engine.)';
        resultEl.innerHTML = '<div class="ai-test-ok"><i class="fa-solid fa-circle-check"></i> ' + answer + '</div>';
      }
    }, 250);
  }

  /* ---------- backup ---------- */
  function exportData() {
    var json = DataStore.exportAll();
    var blob = new Blob([json], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aia-class10a-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    App.showToast('Backup downloaded 💾', 'success');
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        DataStore.importAll(ev.target.result);
        App.showToast('Data imported ✅', 'success');
        loadDashboard();
        renderActivity();
        renderUserStats();
        renderSubjectsAdmin();
        loadAiConfig();
      } catch (e) {
        App.showToast('Import failed: ' + e.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- live refresh ---------- */
  function startLiveRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (!DataStore.isAdminAuthed()) return;
      loadDashboard();
      renderActivity();
    }, 8000);
  }

  /* ---------- add handlers ---------- */
  function bindAdds() {
    var hwBtn = document.getElementById('addHwBtn');
    if (hwBtn) hwBtn.addEventListener('click', function () {
      var subject = document.getElementById('hwSubject').value.trim();
      var task = document.getElementById('hwTask').value.trim();
      var due = document.getElementById('hwDue').value.trim();
      if (!subject || !task) { App.showToast('Subject and task are required', 'error'); return; }
      DataStore.addHomework({ subject: subject, task: task, due_date: due || null });
      document.getElementById('hwSubject').value = ''; document.getElementById('hwTask').value = ''; document.getElementById('hwDue').value = '';
      renderHw(); loadDashboard(); App.showToast('Homework published 📚', 'success');
    });

    var scoreBtn = document.getElementById('addScoreBtn');
    if (scoreBtn) scoreBtn.addEventListener('click', function () {
      var student = document.getElementById('scStudent').value;
      var subject = document.getElementById('scSubject').value.trim();
      var test = document.getElementById('scTest').value.trim();
      var score = parseFloat(document.getElementById('scScore').value);
      var max = parseFloat(document.getElementById('scMax').value);
      var date = document.getElementById('scDate').value.trim() || null;
      if (!student || !subject || !test || isNaN(score) || isNaN(max)) { App.showToast('Fill student, subject, test, score and max marks', 'error'); return; }
      DataStore.addTestScore({ student_name: student, subject: subject, test_name: test, score: score, max_score: max, test_date: date });
      document.getElementById('scSubject').value = ''; document.getElementById('scTest').value = ''; document.getElementById('scScore').value = ''; document.getElementById('scMax').value = ''; document.getElementById('scDate').value = '';
      renderScores(); loadDashboard(); App.showToast('Score published 📊', 'success');
    });

    var annBtn = document.getElementById('addAnnBtn');
    if (annBtn) annBtn.addEventListener('click', function () {
      var title = document.getElementById('anTitle').value.trim();
      var body = document.getElementById('anBody').value.trim();
      if (!title || !body) { App.showToast('Title and message are required', 'error'); return; }
      DataStore.addAnnouncement({ title: title, body: body });
      document.getElementById('anTitle').value = ''; document.getElementById('anBody').value = '';
      renderAnn(); loadDashboard(); App.showToast('Announcement posted 📣', 'success');
    });

    var pollBtn = document.getElementById('addPollBtn');
    if (pollBtn) pollBtn.addEventListener('click', function () {
      var q = document.getElementById('pollQ').value.trim();
      var opts = [document.getElementById('op1').value.trim(), document.getElementById('op2').value.trim(), document.getElementById('op3').value.trim(), document.getElementById('op4').value.trim()].filter(Boolean);
      if (!q || opts.length < 2) { App.showToast('Question and at least 2 options required', 'error'); return; }
      DataStore.addPoll({ question: q, options: opts });
      ['pollQ', 'op1', 'op2', 'op3', 'op4'].forEach(function (id) { document.getElementById(id).value = ''; });
      renderPolls(); loadDashboard(); App.showToast('Poll created 🗳️', 'success');
    });

    var profileBtn = document.getElementById('saveProfileBtn');
    if (profileBtn) profileBtn.addEventListener('click', function () {
      var name = document.getElementById('profileStudent').value;
      DataStore.saveProfile(name, {
        bio: document.getElementById('pBio').value.trim(),
        strengths: document.getElementById('pStrengths').value.trim(),
        interests: document.getElementById('pInterests').value.trim(),
        goals: document.getElementById('pGoals').value.trim()
      });
      App.showToast('Profile saved 👤', 'success');
    });

    var subjSel = document.getElementById('subjSelect');
    if (subjSel) subjSel.addEventListener('change', function () { pendingPhotos = []; loadSubjectFields(); });
    var photoInput = document.getElementById('subjPhotoInput');
    if (photoInput) photoInput.addEventListener('change', handlePhotoPick);
    var saveSubj = document.getElementById('saveSubjBtn');
    if (saveSubj) saveSubj.addEventListener('click', saveSubject);

    var saveAi = document.getElementById('saveAiBtn');
    if (saveAi) saveAi.addEventListener('click', saveAiConfig);
    var testBtn = document.getElementById('testAiBtn');
    if (testBtn) testBtn.addEventListener('click', testAi);

    var exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportData);
    var importFile = document.getElementById('importFile');
    if (importFile) importFile.addEventListener('change', function () {
      if (importFile.files && importFile.files[0]) importData(importFile.files[0]);
      importFile.value = '';
    });

    var resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (!confirm('Reset EVERYTHING back to seed data? This cannot be undone.')) return;
      DataStore.resetToSeed(false);
      loadSubjectFields(); renderSubjectsAdmin(); loadAiConfig();
      loadDashboard(); renderActivity(); renderUserStats(); renderCreds();
      App.showToast('All data reset to seed 🔄', 'success');
    });

    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      DataStore.setAdminAuth(null);
      window.location.reload();
    });
  }

  /* ---------- theme picker ---------- */
  function renderThemePicker() {
    var picker = document.getElementById('themePicker');
    if (!picker) return;
    var current = DataStore.getTheme();
    var themes = [
      { id: 'luxury', name: 'Luxury', desc: 'Default · black & gold', swatch: 'linear-gradient(135deg,#0a0705 0%,#241505 60%,#f0b24b 140%)' },
      { id: 'glass', name: 'Glass', desc: 'Cool frosted blue', swatch: 'linear-gradient(135deg,#0d1428 0%,#1a2440 55%,#7c6cff 130%)' },
      { id: 'simple', name: 'Simple', desc: 'Clean & light', swatch: 'linear-gradient(135deg,#f4f6fb 0%,#dbe3f5 60%,#6c5ce7 140%)' },
      { id: 'midnight', name: 'Midnight', desc: 'Deep navy glow', swatch: 'linear-gradient(135deg,#020617 0%,#0b1530 60%,#3f7bff 140%)' },
      { id: 'neon', name: 'Neon', desc: 'Electric vibes', swatch: 'linear-gradient(135deg,#05030f 0%,#130a2e 55%,#00e5ff 130%,#ff2fd6 170%)' },
      { id: 'sunset', name: 'Sunset', desc: 'Warm dusk', swatch: 'linear-gradient(135deg,#160a12 0%,#3a1620 55%,#ff8a5c 135%,#ff7ab8 165%)' },
      { id: 'ocean', name: 'Ocean', desc: 'Blue-teal deep', swatch: 'linear-gradient(135deg,#04121c 0%,#0b2738 55%,#2dd4bf 135%)' },
      { id: 'royal', name: 'Royal', desc: 'Purple crown', swatch: 'linear-gradient(135deg,#0d0717 0%,#2a1448 55%,#a78bfa 135%,#e9b44c 175%)' }
    ];
    picker.innerHTML = themes.map(function (t) {
      return '<button class="theme-card' + (t.id === current ? ' active' : '') + '" data-theme="' + t.id + '" title="Apply ' + t.name + ' theme">' +
        '<span class="theme-swatch" style="background:' + t.swatch + '"></span>' +
        '<span class="theme-meta"><span class="theme-name">' + t.name + '</span>' +
        '<span class="theme-desc">' + t.desc + '</span></span></button>';
    }).join('');
    picker.querySelectorAll('.theme-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.getAttribute('data-theme');
        DataStore.setTheme(id);
        picker.querySelectorAll('.theme-card').forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        App.showToast('Theme applied: ' + id, 'success');
      });
    });
  }

  /* ---------- serverless sync card (Settings panel) ---------- */
  function injectSyncCard() {
    if (document.getElementById('syncAdminCard')) return;
    var settings = document.getElementById('panel-settings');
    if (!settings) return;
    var card = document.createElement('div');
    card.className = 'admin-form';
    card.id = 'syncAdminCard';
    card.innerHTML =
      '<h3 class="heading-sm">⇄ Serverless Sync — no server needed</h3>' +
      '<p class="text-secondary" style="font-size:.86rem;margin:6px 0 14px">Chats, polls, homework, photos & settings sync between tabs instantly. To sync another phone, open the Sync Center and share a code, file, or live P2P link.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-primary btn-sm" id="openSyncCenterBtn"><i class="fa-solid fa-rotate"></i> Open Sync Center</button>' +
      '<button class="btn btn-secondary btn-sm" id="quickSyncCodeBtn"><i class="fa-solid fa-copy"></i> Copy compact code</button>' +
      '</div>';
    settings.insertBefore(card, settings.firstChild);
    document.getElementById('openSyncCenterBtn').addEventListener('click', function () {
      if (window.AiaSync) window.AiaSync.open();
    });
    document.getElementById('quickSyncCodeBtn').addEventListener('click', function () {
      if (!window.AiaSync) return;
      var code = window.AiaSync.exportCode(false);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { App.showToast('Compact sync code copied ✓', 'success'); });
      } else { window.AiaSync.open(); }
    });
  }

  /* ---------- PYQ papers ---------- */
  function fillPyqSelect() {
    var sel = document.getElementById('pyqSubject');
    if (!sel) return;
    var subjects = (DataStore.getSubjects() || []).map(function (s) { return s && s.name; }).filter(Boolean);
    sel.innerHTML = subjects.map(function (s) {
      return '<option value="' + App.escapeHtml(s) + '">' + App.escapeHtml(s) + '</option>';
    }).join('');
  }

  function renderPyqAdmin() {
    var el = document.getElementById('pyqAdminList');
    if (!el) return;
    var list = DataStore.getPyqs() || [];
    if (!list.length) {
      el.innerHTML = '<p class="text-muted" style="font-size:.85rem">No papers uploaded yet. Add the first one above.</p>';
      return;
    }
    var KIND_LABEL = { 'half-yearly': 'Half Yearly', 'yearly': 'Yearly', 'practice': 'Practice' };
    var rows = list.slice().reverse().map(function (p) {
      return '<tr><td>' + App.escapeHtml(p.subject || '—') + '</td>' +
        '<td>' + App.escapeHtml(KIND_LABEL[p.kind] || p.kind || '—') + '</td>' +
        '<td>' + App.escapeHtml(p.year || '—') + '</td>' +
        '<td>' + App.escapeHtml(p.title) + '</td>' +
        '<td><button class="btn btn-secondary btn-sm" data-del-pyq="' + App.escapeHtml(p.id) + '">' +
        '<i class="fa-solid fa-trash"></i></button></td></tr>';
    }).join('');
    el.innerHTML = '<table class="admin-table"><thead><tr><th>Subject</th><th>Type</th><th>Year</th><th>Title</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    el.querySelectorAll('[data-del-pyq]').forEach(function (b) {
      b.addEventListener('click', function () {
        DataStore.removePyq(b.getAttribute('data-del-pyq'));
        renderPyqAdmin();
        App.showToast('Paper removed', 'info');
      });
    });
  }

  function pyqValue(urlId, fileId) {
    var fileEl = document.getElementById(fileId);
    var urlEl = document.getElementById(urlId);
    var url = urlEl && urlEl.value.trim();
    var file = fileEl && fileEl.files && fileEl.files[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) return Promise.reject(new Error(file.name + ' is over 4 MB — the free relay caps files at 4 MB.'));
      return window.AiaFiles.upload(file, { name: file.name }).then(function (res) {
        if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Upload failed');
        return res.file.url;
      });
    }
    return Promise.resolve(url || '');
  }

  function addPyq() {
    var statusEl = document.getElementById('pyqUploadStatus');
    var title = document.getElementById('pyqTitle').value.trim();
    if (!title) { App.showToast('Give the paper a title first', 'error'); return; }
    var kind = document.getElementById('pyqKind').value;
    var subject = document.getElementById('pyqSubject').value;
    var year = document.getElementById('pyqYear').value.trim();
    var note = document.getElementById('pyqNote').value.trim();
    if (statusEl) statusEl.textContent = 'Uploading…';
    Promise.all([pyqValue('pyqUrl', 'pyqFile'), pyqValue('pyqSolUrl', 'pyqSolFile')])
      .then(function (urls) {
        var rec = {
          title: title, kind: kind, subject: subject, year: year, note: note,
          url: urls[0] || '', solutionUrl: urls[1] || '',
          type: (document.getElementById('pyqFile').files[0] || {}).type || ''
        };
        DataStore.addPyq(rec);
        try { document.dispatchEvent(new CustomEvent('aia-local-write', { detail: { key: 'aia_pyqs' } })); } catch (e) {}
        document.getElementById('pyqTitle').value = '';
        document.getElementById('pyqYear').value = '';
        document.getElementById('pyqNote').value = '';
        document.getElementById('pyqUrl').value = '';
        document.getElementById('pyqSolUrl').value = '';
        document.getElementById('pyqFile').value = '';
        document.getElementById('pyqSolFile').value = '';
        if (statusEl) statusEl.textContent = '';
        renderPyqAdmin();
        App.showToast('Paper added 📄', 'success');
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = '';
        App.showToast(err.message || 'Could not add the paper', 'error');
      });
  }

  /* ---------- private chat (admin side) ---------- */
  var pvStop = null;
  var pvCurrent = '';

  function pvUsernameFor(name) {
    var creds = DataStore.getEffectiveCredentials ? DataStore.getEffectiveCredentials() : DataStore.getCredentials();
    var c = (creds || []).find(function (x) { return x && x.name === name; });
    return c ? c.username : '';
  }

  function renderPvThread() {
    var el = document.getElementById('pvThread');
    if (!el) return;
    var msgs = pvCurrent ? DataStore.getPrivateChat(pvCurrent) : [];
    if (!msgs.length) {
      el.innerHTML = '<p class="text-muted" style="font-size:.85rem;margin:0">No messages yet. Say hello 👋</p>';
      return;
    }
    el.innerHTML = msgs.map(function (m) {
      var mine = m.role === 'admin';
      return '<div class="pv-msg ' + (mine ? 'pv-mine' : 'pv-theirs') + '">' +
        '<div class="pv-bubble">' + App.escapeHtml(m.text || '') + '</div>' +
        '<div class="pv-time">' + App.escapeHtml(window.App && App.timeAgo ? App.timeAgo(m.at) : '') + '</div></div>';
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function pvSelect(name) {
    if (pvStop) { pvStop(); pvStop = null; }
    pvCurrent = pvUsernameFor(name);
    if (!pvCurrent) { renderPvThread(); return; }
    renderPvThread();
    var warn = document.getElementById('pvWarn');
    if (warn) {
      warn.innerHTML = window.AiaPrivate && window.AiaPrivate.secure()
        ? '<i class="fa-solid fa-lock"></i> Encrypted in transit. Only you and this student can read it.'
        : '<i class="fa-solid fa-triangle-exclamation"></i> This browser cannot encrypt — messages are sent encoded but not encrypted. Use HTTPS for full protection.';
    }
    if (window.AiaPrivate) {
      var known = {};
      DataStore.getPrivateChat(pvCurrent).forEach(function (m) { if (m && m.id) known[m.id] = 1; });
      pvStop = window.AiaPrivate.listen(pvCurrent, function (batch) {
        var changed = false;
        batch.forEach(function (m) {
          if (m.role === 'admin') return;    /* our own outbound messages are already stored */
          DataStore.addPrivateMessage(pvCurrent, { id: m.id, text: m.text, role: 'student', name: m.name, at: m.at });
          changed = true;
        });
        if (changed) renderPvThread();
      }, { known: known, since: '48h' });
    }
  }

  function pvSend() {
    var input = document.getElementById('pvInput');
    var text = input.value.trim();
    if (!text || !pvCurrent) return;
    input.value = '';
    var msg = { text: text, role: 'admin', name: DataStore.getSession() ? DataStore.getSession().name : 'Admin', at: new Date().toISOString() };
    DataStore.addPrivateMessage(pvCurrent, msg);
    renderPvThread();
    if (window.AiaPrivate) {
      window.AiaPrivate.send(pvCurrent, msg).catch(function () {
        App.showToast('Message saved locally but could not be sent right now', 'info');
      });
    }
  }

  /* ---------- block users ---------- */
  function renderBlocked() {
    var el = document.getElementById('blockedList');
    if (!el) return;
    var map = DataStore.getBlocks ? DataStore.getBlocks() : {};
    var keys = Object.keys(map || {});
    if (!keys.length) {
      el.innerHTML = '<p class="text-muted" style="font-size:.85rem">Nobody is blocked right now.</p>';
      return;
    }
    var rows = keys.map(function (k) {
      var b = map[k];
      var left = b.until ? DataStore.timeUntil(b.until) : 'Until unblocked';
      return '<tr><td>' + App.escapeHtml(b.username || k) + '</td>' +
        '<td>' + App.escapeHtml(b.reason || '—') + '</td>' +
        '<td>' + App.escapeHtml(String(left)) + '</td>' +
        '<td><button class="btn btn-secondary btn-sm" data-unblock="' + App.escapeHtml(b.username || k) + '">' +
        '<i class="fa-solid fa-unlock"></i> Unblock</button></td></tr>';
    }).join('');
    el.innerHTML = '<table class="admin-table"><thead><tr><th>Student</th><th>Reason</th><th>Ends</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    el.querySelectorAll('[data-unblock]').forEach(function (b) {
      b.addEventListener('click', function () {
        DataStore.unblockUser(b.getAttribute('data-unblock'));
        try { document.dispatchEvent(new CustomEvent('aia-local-write', { detail: { key: 'aia_blocks' } })); } catch (e) {}
        renderBlocked();
        App.showToast('User unblocked ✓', 'success');
      });
    });
  }

  function doBlock() {
    var name = document.getElementById('blkStudent').value;
    var username = pvUsernameFor(name) || name;
    var reason = document.getElementById('blkReason').value.trim();
    var dur = document.getElementById('blkDuration').value;
    if (!username) { App.showToast('Pick a student first', 'error'); return; }
    if (!reason) { App.showToast('A reason is required — the student will see it', 'error'); return; }
    var until = null;
    if (dur === 'custom') {
      var hours = parseFloat(document.getElementById('blkCustomHours').value);
      if (!hours || hours <= 0) { App.showToast('Enter how many hours', 'error'); return; }
      until = Date.now() + hours * 3600000;
    } else if (dur !== 'forever') {
      until = Date.now() + parseInt(dur, 10);
    }
    DataStore.blockUser(username, reason, until, DataStore.getSession() ? DataStore.getSession().name : 'admin');
    try { document.dispatchEvent(new CustomEvent('aia-local-write', { detail: { key: 'aia_blocks' } })); } catch (e) {}
    document.getElementById('blkReason').value = '';
    renderBlocked();
    App.showToast(name.split(' ')[0] + ' blocked', 'success');
  }

  /* live: refresh lists when synced data arrives */
  var syncT = 0;
  window.__aiaRefresh = function () {
    if (!DataStore.isAdminAuthed()) return;
    clearTimeout(syncT);
    syncT = setTimeout(function () {
      loadDashboard(); renderActivity(); renderUserStats(); renderCreds();
      renderHw(); renderScores(); renderAnn(); renderPolls();
    }, 400);
  };

  /* ---------- load all ---------- */
  function loadAll() {
    /* Each section is isolated: one malformed synced record must not stop the
       rest of the panel (or the new selects) from rendering. */
    function safe(label, fn) {
      try { fn(); } catch (e) { console.warn('admin section failed:', label, e); }
    }
    safe('students', fillStudentSelect);
    safe('homework', renderHw);
    safe('scores', renderScores);
    safe('announcements', renderAnn);
    safe('polls', renderPolls);
    safe('subjects', renderSubjectsAdmin);
    safe('ai', loadAiConfig);
    safe('dashboard', loadDashboard);
    safe('activity', renderActivity);
    safe('users', renderUserStats);
    safe('credentials', initCreds);
    safe('theme', renderThemePicker);
    /* new admin sections */
    safe('pyqs', fillPyqSelect);
    safe('pyqs-list', renderPyqAdmin);
    safe('blocks', renderBlocked);
    var pvSel = document.getElementById('pvStudent');
    if (pvSel) {
      var names = ((DataStore.getStudents ? DataStore.getStudents() : []) || []).filter(function (n) { return typeof n === 'string' && n; });
      pvSel.innerHTML = names.map(function (n) {
        return '<option value="' + App.escapeHtml(n) + '">' + App.escapeHtml(n) + '</option>';
      }).join('');
      pvSel.addEventListener('change', function () { pvSelect(pvSel.value); });
      if (names.length) pvSelect(names[0]);
    }
    var blkSel = document.getElementById('blkStudent');
    if (blkSel) {
      var names2 = ((DataStore.getStudents ? DataStore.getStudents() : []) || []).filter(function (n) { return typeof n === 'string' && n; });
      blkSel.innerHTML = names2.map(function (n) {
        return '<option value="' + App.escapeHtml(n) + '">' + App.escapeHtml(n) + '</option>';
      }).join('');
    }
  }

  bindAdds();
  var addPyqBtn = document.getElementById('addPyqBtn');
  if (addPyqBtn) addPyqBtn.addEventListener('click', addPyq);
  var pvSendBtn = document.getElementById('pvSendBtn');
  if (pvSendBtn) pvSendBtn.addEventListener('click', pvSend);
  var pvInputEl = document.getElementById('pvInput');
  if (pvInputEl) pvInputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') pvSend(); });
  var blockBtn = document.getElementById('blockBtn');
  if (blockBtn) blockBtn.addEventListener('click', doBlock);
  var blkDur = document.getElementById('blkDuration');
  if (blkDur) blkDur.addEventListener('change', function () {
    var wrap = document.getElementById('blkCustomWrap');
    if (wrap) wrap.style.display = blkDur.value === 'custom' ? 'block' : 'none';
  });
  injectSyncCard();
  checkAuth();
})();