/* ============================================
   Student Chat — REAL class group chatroom
   Everyone sees everyone's messages, live.
   Syncs serverlessly: tabs instantly, other
   devices via Sync Center (code/file/P2P).
   Typing indicators · date dividers · delete
   own (admin: delete any + clear all).
   ============================================ */

(function () {
  App.initShared('chat.html');

  var loginBox = document.getElementById('chatLoginBox');
  var appEl = document.getElementById('chatApp');
  var userInput = document.getElementById('chatUser');
  var passInput = document.getElementById('chatPass');
  var loginBtn = document.getElementById('chatLoginBtn');
  var loginError = document.getElementById('chatLoginError');
  var loggedAsEl = document.getElementById('chatLoggedAs');
  var messagesEl = document.getElementById('chatMessages');
  var inputEl = document.getElementById('chatInput');
  var sendBtn = document.getElementById('chatSendBtn');
  var attachBtn = document.getElementById('chatAttachBtn');
  var fileInput = document.getElementById('chatFileInput');
  var clearBtn = document.getElementById('clearMyChatBtn');
  var logoutBtn = document.getElementById('chatLogoutBtn');
  var adminToggle = document.getElementById('adminViewToggle');

  /* typing indicator row (injected) */
  var typingEl = document.createElement('div');
  typingEl.className = 'chat-typing';
  typingEl.id = 'chatTyping';
  messagesEl.parentNode.insertBefore(typingEl, messagesEl.nextSibling);

  var session = DataStore.getSession();
  var typingMap = {};
  var typingTimer = 0, lastTyped = 0;
  var pollTimer = 0, lastKnownLen = -1, lastKnownTail = '';

  /* ---------- login handling ---------- */
  function tryLogin() {
    var u = userInput.value.trim();
    var p = passInput.value;
    if (!u || !p) { loginError.textContent = 'Enter both username and password.'; return; }
    var auth = DataStore.authenticate(u, p);
    if (!auth) {
      loginError.textContent = 'Wrong username or password. Ask the admin.';
      return;
    }
    if (window.AiaBlock && window.AiaBlock.enforce(auth)) {
      loginError.textContent = 'Your account is blocked. See the reason on screen.';
      return;
    }
    DataStore.setSession(auth);
    session = DataStore.getSession();
    enterChat();
    App.showToast('Welcome to the chat, ' + auth.name.split(' ')[0] + '! 💬', 'success');
  }

  /* ---------- chat guidelines (first visit) ---------- */
  var GUIDE_KEY = 'aia_chat_guide_seen';
  var guideOverlay = document.getElementById('chatGuideOverlay');
  var guideBtn = document.getElementById('chatGuideBtn');
  var guideAccept = document.getElementById('guideAcceptBtn');

  function guideSeen() {
    try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (e) { return false; }
  }
  function markGuideSeen() {
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {}
  }
  function openGuide() { if (guideOverlay) guideOverlay.style.display = 'grid'; }
  function closeGuide() { if (guideOverlay) guideOverlay.style.display = 'none'; }

  if (guideAccept) guideAccept.addEventListener('click', function () {
    markGuideSeen();
    closeGuide();
    App.showToast('Thanks! Enjoy the chat 💬', 'success');
  });
  if (guideBtn) guideBtn.addEventListener('click', openGuide);
  if (guideOverlay) guideOverlay.addEventListener('click', function (e) {
    if (e.target === guideOverlay) { markGuideSeen(); closeGuide(); }
  });

  /* ---------- private chat with the admin ---------- */
  var pvToggle = document.getElementById('chatPvToggle');
  var pvPanel = document.getElementById('chatPrivate');
  var pvMessages = document.getElementById('chatPvMessages');
  var pvInput = document.getElementById('chatPvInput');
  var pvSendBtn = document.getElementById('chatPvSend');
  var pvClose = document.getElementById('chatPvClose');
  var pvClear = document.getElementById('chatPvClear');
  var pvStop = null;

  function myUsername() { return session ? session.username : ''; }

  function renderPv() {
    if (!pvMessages || !session) return;
    var msgs = DataStore.getPrivateChat(myUsername()) || [];
    if (!msgs.length) {
      pvMessages.innerHTML = '<p class="text-muted" style="font-size:.85rem;margin:0">No private messages yet. Only you and the admin can see this thread.</p>';
      return;
    }
    pvMessages.innerHTML = msgs.map(function (m) {
      var mine = m.role !== 'admin';
      return '<div class="pv-msg ' + (mine ? 'pv-mine' : 'pv-theirs') + '">' +
        '<div class="pv-bubble">' + App.escapeHtml(m.text || '') + '</div>' +
        '<div class="pv-time">' + App.escapeHtml(window.App && App.timeAgo ? App.timeAgo(m.at) : '') + '</div></div>';
    }).join('');
    pvMessages.scrollTop = pvMessages.scrollHeight;
  }

  function openPv() {
    if (!pvPanel || !session) return;
    pvPanel.style.display = 'block';
    renderPv();
    if (window.AiaPrivate && !pvStop) {
      var known = {};
      (DataStore.getPrivateChat(myUsername()) || []).forEach(function (m) { if (m && m.id) known[m.id] = 1; });
      /* Ids the student has cleared are pre-seeded as "seen" — both so the
         relay's replay of the old thread is ignored and so a message that
         arrives later with the same id is not resurrected. */
      (DataStore.getPrivateCleared ? DataStore.getPrivateCleared(myUsername()) : []).forEach(function (id) {
        if (id) known[id] = 1;
      });
      pvStop = window.AiaPrivate.listen(myUsername(), function (batch) {
        var changed = false;
        batch.forEach(function (m) {
          if (m.role !== 'admin') return;      /* our own outbound messages are already stored */
          if (known[m.id]) return;
          known[m.id] = 1;
          DataStore.addPrivateMessage(myUsername(), { id: m.id, text: m.text, role: 'admin', name: m.name, at: m.at });
          changed = true;
        });
        if (changed) renderPv();
      }, { known: known, since: '48h' });
    }
  }

  function closePv() {
    if (pvPanel) pvPanel.style.display = 'none';
    if (pvStop) { pvStop(); pvStop = null; }
  }

  function sendPv() {
    if (!pvInput || !session) return;
    var text = pvInput.value.trim();
    if (!text) return;
    pvInput.value = '';
    var msg = { text: text, role: 'student', name: session.name, at: new Date().toISOString() };
    DataStore.addPrivateMessage(myUsername(), msg);
    renderPv();
    if (window.AiaPrivate) {
      window.AiaPrivate.send(myUsername(), msg).catch(function () {
        App.showToast('Saved here, but could not reach the admin right now', 'info');
      });
    }
  }

  if (pvToggle) pvToggle.addEventListener('click', function () {
    if (pvPanel && pvPanel.style.display === 'block') closePv(); else openPv();
  });
  if (pvClear) {
    pvClear.addEventListener('click', function () {
      if (!session) return;
      if (!confirm('Clear this private thread from your device?')) return;
      var n = DataStore.clearPrivateChat(myUsername());
      App.showToast(n ? 'Private chat cleared on this device' : 'Nothing to clear', 'info');
      renderPv();
    });
  }
  if (pvClose) pvClose.addEventListener('click', closePv);
  if (pvSendBtn) pvSendBtn.addEventListener('click', sendPv);
  if (pvInput) pvInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendPv(); });

  function enterChat() {
    if (!session) { loginBox.style.display = 'block'; appEl.style.display = 'none'; return; }
    loginBox.style.display = 'none';
    appEl.style.display = 'block';
    var isAdmin = session.role === 'admin';
    loggedAsEl.innerHTML = 'Chatting as <strong>' + App.escapeHtml(session.name) + '</strong>' +
      (isAdmin ? ' <span class="session-role">ADMIN</span>' : '') +
      '<span class="chat-online-dot" title="Live"></span>';
    /* admin: repurpose the toggle as "Clear ALL chat" */
    if (adminToggle) {
      if (isAdmin) {
        adminToggle.style.display = '';
        adminToggle.innerHTML = '<i class="fa-solid fa-trash"></i> <span>Clear all</span>';
      } else adminToggle.style.display = 'none';
    }
    if (clearBtn) clearBtn.innerHTML = '<i class="fa-solid fa-broom"></i> Clear mine';
    /* non-admins get a private line to the admin */
    if (pvToggle) pvToggle.style.display = isAdmin ? 'none' : '';
    startLive();
    renderMessages(true);
    /* first visit: read the rules before chatting */
    if (!isAdmin && !guideSeen()) setTimeout(openGuide, 500);
  }

  function leaveChat() {
    DataStore.clearSession();
    window.location.href = 'index.html';
  }

  /* ---------- render ---------- */
  function esc(s) { return App.escapeHtml(s); }
  function dayLabel(iso) {
    var d = new Date(iso), now = new Date();
    var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var td = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((td - dd) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return App.formatDate(iso);
  }

  function renderMessages(forceScroll) {
    var msgs = DataStore.getClassChat() || [];
    lastKnownLen = msgs.length;
    lastKnownTail = msgs.length ? (msgs[msgs.length - 1].id || msgs[msgs.length - 1].at) : '';
    /* preserve scroll so live updates never yank readers to the top */
    var prevTop = messagesEl.scrollTop;
    var wasBottom = forceScroll || nearBottom();
    messagesEl.innerHTML = '';
    if (!msgs.length) {
      var empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.innerHTML = '<div class="empty-icon">💬</div><p>No messages yet.<br><span class="text-muted">Say hi — everyone in 10-A will see it!</span></p>';
      messagesEl.appendChild(empty);
      return;
    }
    var lastDay = '';
    var isAdmin = session && session.role === 'admin';
    msgs.forEach(function (m, i) {
      if (m.system) {
        var sys = document.createElement('div');
        sys.className = 'chat-system';
        sys.textContent = m.content;
        messagesEl.appendChild(sys);
        return;
      }
      var day = dayLabel(m.at || Date.now());
      if (day !== lastDay) {
        lastDay = day;
        var div = document.createElement('div');
        div.className = 'chat-day';
        div.textContent = day;
        messagesEl.appendChild(div);
      }
      var mine = session && m.username === session.username;
      var wrap = document.createElement('div');
      wrap.className = 'chat-msg' + (mine ? ' mine' : '');
      /* group consecutive messages from same author */
      var prev = msgs[i - 1];
      if (prev && !prev.system && prev.username === m.username && dayLabel(prev.at) === day) wrap.classList.add('grouped');
      var canDel = mine || isAdmin;
      wrap.innerHTML =
        '<div class="chat-msg-meta"><span class="chat-msg-author">' + esc(m.name || 'Unknown') + '</span>' +
        (isAdmin && m.username ? '<span class="chat-msg-user">@' + esc(m.username) + '</span>' : '') +
        '<span class="chat-msg-time">' + App.timeAgo(m.at) + '</span>' +
        (canDel ? '<button class="chat-del" data-id="' + esc(m.id || '') + '" title="Delete">✕</button>' : '') +
        '</div><div class="chat-msg-body">' + esc(m.content) + (m.file ? fileBlockHtml(m.file) : '') + '</div>';
      messagesEl.appendChild(wrap);
    });
    messagesEl.querySelectorAll('.chat-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteMessage(btn.getAttribute('data-id'));
      });
    });
    messagesEl.scrollTop = wasBottom ? messagesEl.scrollHeight : Math.min(prevTop, messagesEl.scrollHeight);
  }

  /* ---------- attachments ---------- */
  function fileBlockHtml(f) {
    if (!f || !f.url) return '';
    var safeUrl = esc(f.url);
    var name = esc(f.name || 'file');
    var size = window.AiaFiles ? window.AiaFiles.pretty(f.size || 0) : '';
    if (f.kind === 'image') {
      return '<a class="chat-attach chat-attach-img" href="' + safeUrl + '" target="_blank" rel="noopener">' +
        '<img src="' + safeUrl + '" alt="' + name + '" loading="lazy"></a>';
    }
    var icon = f.kind === 'pdf' ? 'fa-file-pdf' : (f.kind === 'audio' ? 'fa-file-audio' : (f.kind === 'video' ? 'fa-file-video' : 'fa-file'));
    return '<a class="chat-attach" href="' + safeUrl + '" target="_blank" rel="noopener" download="' + name + '">' +
      '<span class="chat-attach-icon"><i class="fa-solid ' + icon + '"></i></span>' +
      '<span class="chat-attach-meta"><strong>' + name + '</strong><small>' + size + ' · tap to download</small></span></a>';
  }

  function sendFiles(files) {
    if (!session || !window.AiaFiles || !files || !files.length) return;
    App.showToast('Uploading ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '…', 'info');
    window.AiaFiles.uploadAll(files, { by: session.name }, function (res) {
      if (!res.ok) { App.showToast(res.error || 'Upload failed', 'error'); return; }
      window.AiaFiles.share(res.file);
      DataStore.addClassChat({
        name: session.name,
        username: session.username,
        content: res.file.note || '📎 ' + res.file.name,
        file: res.file,
        at: new Date().toISOString()
      });
      App.showToast('Shared ' + res.file.name, 'success');
      try { DataStore.logAction('upload', 'Shared a file: ' + res.file.name, 'chat.html'); } catch (e) {}
      renderMessages(true);
    });
  }
  function nearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
  }

  function deleteMessage(id) {
    if (!id) return;
    var msgs = DataStore.getClassChat();
    var m = msgs.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var isAdmin = session && session.role === 'admin';
    if (!(isAdmin || (session && m.username === session.username))) return;
    if (!isAdmin && !confirm('Delete this message?')) return;
    DataStore.deleteClassChatById(id);
    renderMessages(false);
  }

  /* ---------- send ---------- */
  function send() {
    var text = inputEl.value.trim();
    if (!session) return;
    if (!text) return;
    if (text.length > 500) { App.showToast('Message too long (max 500)', 'error'); return; }
    DataStore.addClassChat({
      name: session.name,
      username: session.username,
      content: text,
      at: new Date().toISOString()
    });
    try { DataStore.logAction('chat', 'Sent a chat message', 'chat.html'); } catch (e) {}
    inputEl.value = '';
    inputEl.focus();
    renderMessages(true);
    try {
      if (window.StickMen && Math.random() < 0.3) StickMen.celebrate();
    } catch (e) {}
  }

  /* ---------- typing indicators ---------- */
  function broadcastTyping() {
    if (!session || !window.AiaSync) return;
    var now = Date.now();
    if (now - lastTyped < 2500) return;
    lastTyped = now;
    window.AiaSync.typing(session.username, session.name);
  }
  document.addEventListener('aia-typing', function (e) {
    var d = e.detail || {};
    if (!d.user || (session && d.user === session.username)) return;
    typingMap[d.user] = { name: d.name || 'Someone', at: Date.now() };
    renderTyping();
  });
  function renderTyping() {
    var now = Date.now();
    var names = [];
    Object.keys(typingMap).forEach(function (u) {
      if (now - typingMap[u].at < 4000) names.push(typingMap[u].name.split(' ')[0]);
      else delete typingMap[u];
    });
    if (!names.length) { typingEl.innerHTML = ''; typingEl.classList.remove('show'); return; }
    typingEl.classList.add('show');
    typingEl.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span> ' +
      esc(names.slice(0, 3).join(', ')) + (names.length > 3 ? ' +' + (names.length - 3) : '') + ' typing…';
  }
  setInterval(renderTyping, 1500);

  /* ---------- live updates (sync events + storage + poll fallback) ---------- */
  function onRemote() {
    var msgs = DataStore.getClassChat() || [];
    var tail = msgs.length ? (msgs[msgs.length - 1].id || msgs[msgs.length - 1].at) : '';
    if (msgs.length !== lastKnownLen || tail !== lastKnownTail) renderMessages(false);
  }
  /* keep "x minutes ago" fresh without rebuilding the DOM constantly */
  setInterval(function () {
    if (appEl.style.display !== 'none' && document.visibilityState === 'visible') renderMessages(false);
  }, 60000);
  function startLive() {
    if (pollTimer) return;
    window.addEventListener('aia-sync', onRemote);
    document.addEventListener('aia-data-change', function (e) {
      if (!e.detail || e.detail.key === '*' || e.detail.key === 'aia_class_chat') onRemote();
      /* blocks arrive through the same channel */
      if (e.detail && e.detail.key === 'aia_blocks' && window.AiaBlock) window.AiaBlock.enforceCurrentSession();
    });
    window.addEventListener('storage', function (e) {
      if (e.key === 'aia_class_chat') onRemote();
    });
    pollTimer = setInterval(onRemote, 2500); /* file:// fallback where events may lag */
  }
  window.__aiaRefresh = function () { if (appEl.style.display !== 'none') onRemote(); };

  /* ---------- events ---------- */
  if (loginBtn) loginBtn.addEventListener('click', tryLogin);
  if (passInput) passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
  if (userInput) userInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') passInput.focus(); });
  if (sendBtn) sendBtn.addEventListener('click', send);
  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function (e) {
      var files = Array.from(e.target.files || []);
      if (files.length) sendFiles(files);
      e.target.value = '';
    });
  }
  if (inputEl) {
    inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    inputEl.addEventListener('input', broadcastTyping);
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (!session) return;
      if (!confirm('Delete YOUR messages from this chat?')) return;
      var keep = DataStore.getClassChat().filter(function (m) { return m.system || m.username !== session.username; })
        .map(function (m) { return m.id; });
      DataStore.clearClassChat(keep);
      App.showToast('Your messages were cleared', 'info');
      renderMessages(false);
    });
  }
  if (adminToggle) {
    adminToggle.addEventListener('click', function () {
      if (!session || session.role !== 'admin') return;
      if (!confirm('ADMIN: delete ALL chat messages for everyone?')) return;
      DataStore.clearClassChat(null);
      App.showToast('Chat cleared', 'info');
      renderMessages(false);
    });
  }
  if (logoutBtn) logoutBtn.addEventListener('click', leaveChat);

  /* ---------- boot ---------- */
  if (session && (session.role === 'student' || session.role === 'admin')) {
    enterChat();
  } else {
    loginBox.style.display = 'block';
    if (session && session.name) {
      try { userInput.value = ''; } catch (e) {}
    }
  }
})();
