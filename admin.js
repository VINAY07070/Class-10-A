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
  function renderActivity() {
    var onlineEl = document.getElementById('onlineNow');
    var feedEl = document.getElementById('activityFeed');
    if (!onlineEl || !feedEl || !DataStore.isAdminAuthed()) return;

    var online = DataStore.getOnlineUsers();
    onlineEl.innerHTML = '<div class="online-title"><span class="pulse-dot"></span> Online now</div>' +
      (online.length
        ? online.map(function (u) { return '<span class="online-user"><i class="fa-solid fa-circle"></i> ' + App.escapeHtml(u.name) + (u.page ? ' <span class="text-muted">· ' + App.escapeHtml(u.page) + '</span>' : '') + '</span>'; }).join('')
        : '<span class="text-muted">Nobody online right now.</span>');

    var log = DataStore.getActivityLog().slice().reverse().slice(0, 40);
    feedEl.innerHTML = log.length
      ? log.map(function (e) {
          var icon = 'fa-circle-user';
          if (e.page === 'index.html') icon = 'fa-house';
          else if (e.page === 'chat.html') icon = 'fa-message';
          else if (e.page === 'ai.html') icon = 'fa-robot';
          else if (e.page === 'subjects.html') icon = 'fa-book-open';
          else if (e.page === 'admin.html') icon = 'fa-gear';
          return '<div class="activity-item"><span class="activity-icon"><i class="fa-solid ' + icon + '"></i></span>' +
            '<span class="activity-user">' + App.escapeHtml(e.user) + '</span>' +
            '<span class="activity-page">' + App.escapeHtml(e.page) + '</span>' +
            '<span class="activity-time">' + App.timeAgo(e.at) + '</span></div>';
        }).join('')
      : '<div class="text-muted" style="text-align:center;padding:20px">No activity yet — students will show up here as they visit pages.</div>';
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
      return '<tr><td><strong>' + App.escapeHtml(s.name) + '</strong><div class="text-muted" style="font-size:.75rem">@' + App.escapeHtml(u) + '</div></td>' +
        '<td>' + s.pageCount + '</td>' +
        '<td class="user-pages">' + App.escapeHtml(pages) + '</td>' +
        '<td>' + App.timeAgo(s.lastSeen) + '</td>' +
        '<td><code style="font-size:.75rem">' + App.escapeHtml(pw) + '</code>' +
        '<button class="btn btn-secondary btn-sm reset-pw" data-user="' + App.escapeHtml(u) + '" style="margin-left:6px"><i class="fa-solid fa-arrows-rotate"></i> Reset</button></td></tr>';
    }).join('');

    el.innerHTML = '<table class="admin-table"><thead><tr><th>Student</th><th>Visits</th><th>Pages</th><th>Last seen</th><th>Password</th></tr></thead><tbody>' + rows + '</tbody></table>';

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
      return '<div class="admin-item"><div><strong>' + App.escapeHtml(h.subject) + '</strong> — ' + App.escapeHtml(h.task.split('\n')[0]) +
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
  function handlePhotoPick(e) {
    var files = Array.from(e.target.files || []);
    var preview = document.getElementById('subjPhotoPreview');
    var remaining = pendingPhotos.length;
    files.forEach(function (file) {
      if (!file.type || file.type.indexOf('image/') !== 0) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        pendingPhotos.push(ev.target.result);
        var img = document.createElement('img');
        img.src = ev.target.result;
        img.alt = 'new photo';
        if (preview) preview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  function saveSubject() {
    var sel = document.getElementById('subjSelect');
    var notesEl = document.getElementById('subjNotes');
    if (!sel || !notesEl) return;
    var name = sel.value;
    var content = DataStore.getSubjectContentFor(name) || {};
    content.notes = notesEl.value;
    DataStore.setSubjectContent(name, content);
    if (pendingPhotos.length) {
      var photos = DataStore.getSubjectPhotoList(name).concat(pendingPhotos);
      DataStore.setSubjectPhoto(name, photos);
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
    if (subjSel) subjSel.addEventListener('change', loadSubjectFields);
    var photoInput = document.getElementById('subjPhotoInput');
    if (photoInput) photoInput.addEventListener('change', handlePhotoPick);
    var saveSubj = document.getElementById('saveSubjBtn');
    if (saveSubj) saveSubj.addEventListener('click', saveSubject);
    var saveGithub = document.getElementById('saveGithubBtn');
    if (saveGithub) saveGithub.addEventListener('click', function () {
      var urlEl = document.getElementById('githubUrlInput');
      var cfg = DataStore.getAiConfig();
      cfg.githubUrl = urlEl.value.trim();
      DataStore.setAiConfig(cfg);
      App.showToast('GitHub URL saved. Check the Subjects page 🌐', 'success');
    });

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
      loadDashboard(); renderActivity(); renderUserStats();
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
      { id: 'glass', name: 'Glass', desc: 'Default dark glass', swatch: 'linear-gradient(135deg,#0d1428 0%,#1a2440 55%,#7c6cff 130%)' },
      { id: 'luxury', name: 'Luxury', desc: 'Black & gold', swatch: 'linear-gradient(135deg,#0a0705 0%,#241505 60%,#f0b24b 140%)' },
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

  /* ---------- load all ---------- */
  function loadAll() {
    fillStudentSelect();
    renderHw();
    renderScores();
    renderAnn();
    renderPolls();
    renderSubjectsAdmin();
    loadAiConfig();
    loadDashboard();
    renderActivity();
    renderUserStats();
    renderThemePicker();
  }

  bindAdds();
  checkAuth();
})();