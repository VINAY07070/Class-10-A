/* Shared cross-device synchronization. The static fallback remains localStorage-only. */
(function () {
  'use strict';
  var KEYS = ['aia_students','aia_student_profiles','aia_teachers','aia_leadership','aia_homework','aia_announcements','aia_polls','aia_test_scores','aia_comments','aia_class_chat','aia_ai_config','aia_subject_content','aia_subject_photos','aia_github_data'];
  var lastRemote = '';
  function snapshot() { var o = {}; KEYS.forEach(function (k) { try { var v = localStorage.getItem(k); if (v !== null) o[k] = JSON.parse(v); } catch (_) {} }); return o; }
  function apply(state) { if (!state) return; KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(state, k)) localStorage.setItem(k, JSON.stringify(state[k])); }); window.dispatchEvent(new Event('aia-sync')); }
  function hash(o) { try { return JSON.stringify(o); } catch (_) { return ''; } }
  function pull() { fetch('/api/state', { credentials: 'include', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (state) { var h = hash(state); if (h && h !== lastRemote) { lastRemote = h; apply(state); } }).catch(function () {}); }
  function push() { var data = snapshot(); fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) }).then(function () { lastRemote = hash(data); }).catch(function () {}); }
  window.addEventListener('storage', function (e) { if (KEYS.indexOf(e.key) !== -1 && location.pathname.indexOf('admin.html') !== -1) push(); });
  document.addEventListener('DOMContentLoaded', function () { pull(); setInterval(pull, 3000); if (location.pathname.indexOf('admin.html') !== -1) setInterval(push, 3000); });
})();
