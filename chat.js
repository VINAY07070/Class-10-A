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
    DataStore.setSession(auth);
    session = DataStore.getSession();
    enterChat();
    App.showToast('Welcome to the chat, ' + auth.name.split(' ')[0] + '! 💬', 'success');
  }

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
    startLive();
    renderMessages(true);
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
        '</div><div class="chat-msg-body">' + esc(m.content) + '</div>';
      messagesEl.appendChild(wrap);
    });
    messagesEl.querySelectorAll('.chat-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteMessage(btn.getAttribute('data-id'));
      });
    });
    messagesEl.scrollTop = wasBottom ? messagesEl.scrollHeight : Math.min(prevTop, messagesEl.scrollHeight);
  }
  function nearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
  }

  function deleteMessage(id) {
    if (!id) return;
    var msgs = DataStore.getClassChat();
    var idx = -1;
    for (var i = 0; i < msgs.length; i++) if (msgs[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    var m = msgs[idx];
    var isAdmin = session && session.role === 'admin';
    if (!(isAdmin || (session && m.username === session.username))) return;
    if (!isAdmin && !confirm('Delete this message?')) return;
    msgs.splice(idx, 1);
    DataStore.setClassChat(msgs);
    renderMessages(false);
  }

  /* ---------- send ---------- */
  function send() {
    var text = inputEl.value.trim();
    if (!text || !session) return;
    if (text.length > 500) { App.showToast('Message too long (max 500)', 'error'); return; }
    DataStore.addClassChat({
      name: session.name,
      username: session.username,
      content: text,
      at: new Date().toISOString()
    });
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
  if (inputEl) {
    inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    inputEl.addEventListener('input', broadcastTyping);
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (!session) return;
      if (!confirm('Delete YOUR messages from this chat?')) return;
      var kept = DataStore.getClassChat().filter(function (m) { return m.system || m.username !== session.username; });
      DataStore.setClassChat(kept);
      App.showToast('Your messages were cleared', 'info');
      renderMessages(false);
    });
  }
  if (adminToggle) {
    adminToggle.addEventListener('click', function () {
      if (!session || session.role !== 'admin') return;
      if (!confirm('ADMIN: delete ALL chat messages for everyone?')) return;
      DataStore.setClassChat([]);
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
