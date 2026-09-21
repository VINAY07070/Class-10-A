/* Authentication bridge: server auth when deployed, local demo fallback when opened statically. */
(function () {
  'use strict';
  function finish(auth) {
    if (!window.DataStore) return;
    if (window.AiaBlock && window.AiaBlock.enforce(auth)) return;
    DataStore.setUnlocked(true);
    DataStore.setAdminAuth(auth.role === 'admin' ? 'full' : null);
    DataStore.setSession(auth);
    var overlay = document.getElementById('loginOverlay');
    var main = document.getElementById('mainSite');
    if (!overlay) return;
    overlay.classList.add('done');
    setTimeout(function () {
      if (main) main.style.display = '';
      overlay.style.display = 'none';
      if (window.App) { App.initStickMen(); App.showToast('Welcome, ' + auth.name + '! 🎉', 'success'); }
    }, 350);
  }
  function showError(text) { var el = document.getElementById('loginError'); if (el) el.textContent = text; }
  function localLogin(input, visitor) {
    var auth = null;
    if (visitor) {
      var level = DataStore.verifyPass(input.pass);
      if (level) auth = { name: level === 'full' ? 'ADMIN' : 'Visitor', username: level === 'full' ? 'admin' : 'visitor', role: level === 'full' ? 'admin' : 'visitor' };
    } else auth = DataStore.authenticate(input.username, input.password);
    if (auth) finish(auth); else showError(visitor ? 'That pass is not recognised.' : 'Wrong username or password.');
  }
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || (form.id !== 'studentForm' && form.id !== 'visitorForm')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var visitor = form.id === 'visitorForm';
    var input = visitor ? { pass: (document.getElementById('visitorPass').value || '').trim() } : {
      username: (document.getElementById('loginUsername').value || '').trim(),
      password: document.getElementById('loginPassword').value || ''
    };
    if (visitor ? !input.pass : (!input.username || !input.password)) { showError('Enter the required details.'); return; }
    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    /* The optional server login only exists over http(s); on file:// (or when
       opened without a backend) go straight to the local credential check so we
       don't log a spurious network error. */
    var canUseServer = location.protocol === 'http:' || location.protocol === 'https:';
    if (!canUseServer) { localLogin(input, visitor); if (button) button.disabled = false; return; }
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(input) })
      .then(function (r) { if (!r.ok) throw new Error('login'); return r.json(); })
      .then(finish)
      .catch(function () { localLogin(input, visitor); })
      .finally(function () { if (button) button.disabled = false; });
  }, true);
})();
