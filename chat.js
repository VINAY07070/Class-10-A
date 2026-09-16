/* ============================================
   Student Chat — class chatroom
   Login with student credentials, messages
   show the student's real name only.
   Per-user privacy: admin has an admin view.
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

  var session = DataStore.getSession();
  var adminView = false;

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
  }

  function enterChat() {
    loginBox.style.display = 'none';
    appEl.style.display = 'block';
    loggedAsEl.textContent = 'Chatting as ' + session.name;
    var isAdmin = session.role === 'admin';
    adminToggle.style.display = isAdmin ? '' : 'none';
    adminView = false;
    adminToggle.querySelector('span').textContent = 'Admin view';
    renderMessages();
  }

  function leaveChat() {
    DataStore.clearSession();
    window.location.href = 'index.html';
  }

  /* ---------- render ---------- */
  function renderMessages() {
    var msgs = DataStore.getClassChat();
    var showAll = adminView && session && session.role === 'admin';
    var visible = msgs.filter(function (m) {
      if (showAll) return true;
      // student view: only messages from this student + system info stays
      if (!session) return false;
      if (m.system) return true;
      return m.username === session.username;
    });
    messagesEl.innerHTML = '';
    if (!visible.length) {
      var empty = document.createElement('div');
      empty.className = 'chat-empty';
      if (showAll) {
        empty.innerHTML = '<div class="empty-icon">🗒️</div><p>No messages from anyone yet.<br><span class="text-muted">Admin view shows every student\'s messages.</span></p>';
      } else {
        empty.innerHTML = '<div class="empty-icon">💬</div><p>No messages yet.<br><span class="text-muted">Send the first hello!</span></p>';
      }
      messagesEl.appendChild(empty);
      return;
    }
    visible.forEach(function (m) {
      messagesEl.appendChild(buildMessage(m, showAll));
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function buildMessage(m, showAll) {
    var div = document.createElement('div');
    if (m.system) {
      div.className = 'chat-system';
      div.textContent = m.content;
      return div;
    }
    var mine = session && m.username === session.username;
    div.className = 'chat-msg' + (mine ? ' mine' : '');
    if (showAll && !mine) div.className += ' admin-seen';
    var meta = '<div class="chat-msg-meta"><span class="chat-msg-author">' + App.escapeHtml(m.name) + '</span>' +
      (showAll ? '<span class="chat-msg-user">@' + App.escapeHtml(m.username) + '</span>' : '') +
      '<span class="chat-msg-time">' + App.timeAgo(m.at) + '</span></div>';
    var body = '<div class="chat-msg-body">' + App.escapeHtml(m.content) + '</div>';
    div.innerHTML = meta + body;
    return div;
  }

  /* ---------- send ---------- */
  function send() {
    var text = inputEl.value.trim();
    if (!text || !session) return;
    DataStore.addClassChat({
      name: session.name,
      username: session.username,
      content: text,
      at: new Date().toISOString()
    });
    inputEl.value = '';
    renderMessages();
  }

  /* ---------- events ---------- */
  if (loginBtn) loginBtn.addEventListener('click', tryLogin);
  if (passInput) passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
  if (userInput) userInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') passInput.focus(); });
  if (sendBtn) sendBtn.addEventListener('click', send);
  if (inputEl) inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      var msgs = DataStore.getClassChat();
      var kept = msgs.filter(function (m) { return m.system || m.username !== session.username; });
      DataStore.setClassChat(kept);
      App.showToast('Your messages were cleared', 'info');
      renderMessages();
    });
  }
  if (logoutBtn) logoutBtn.addEventListener('click', leaveChat);
  if (adminToggle) {
    adminToggle.addEventListener('click', function () {
      adminView = !adminView;
      adminToggle.querySelector('span').textContent = adminView ? 'My view' : 'Admin view';
      renderMessages();
    });
  }

  /* cross-tab live update (nice touch: storage events) */
  window.addEventListener('storage', function (e) {
    if (e.key && (e.key.indexOf('aia_class_chat') === 0 || e.key === DataStore.KEYS.classChat)) {
      renderMessages();
    }
  });

  /* ---------- boot ---------- */
  if (session && session.role === 'student') {
    enterChat();
  } else if (session && session.role === 'admin') {
    enterChat();
  } else {
    // visitor or no session → show login box, prefill if session has student creds
    loginBox.style.display = 'block';
  }
})();