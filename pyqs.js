/* ============================================================
   PYQ PAPERS — previous-year question papers
   ------------------------------------------------------------
   Content policy: this page never invents papers. It renders the
   papers the admin has actually uploaded, and shows a clear empty
   state per category until they exist. Each card links out to the
   uploaded file, so nothing is duplicated into localStorage.
   ============================================================ */
(function () {
  'use strict';
  App.initShared('pyqs.html');

  var KINDS = {
    'half-yearly': { label: 'Half Yearly', root: '.pyq-grid' },
    'yearly': { label: 'Yearly', root: '.pyq-grid' },
    'practice': { label: 'Practice Papers', root: '.pyq-grid' }
  };

  var tabsEl = document.getElementById('pyqGrid').parentNode.querySelector('.pyq-tabs');
  var gridEl = document.getElementById('pyqGrid');
  var filterEl = document.getElementById('pyqFilter');
  var emptyEl = document.getElementById('pyqEmpty');
  var emptyTitle = document.getElementById('pyqEmptyTitle');
  var emptyBody = document.getElementById('pyqEmptyBody');
  var noticeEl = document.getElementById('pyqNotice');

  var kind = 'half-yearly';
  var subject = 'all';

  /* Subjects come from the seed, so the filter always matches the class. */
  function subjects() {
    var list = (window.DataStore && DataStore.getSubjects()) || [];
    return list.map(function (s) { return s && s.name; }).filter(Boolean);
  }

  function buildFilter() {
    if (!filterEl) return;
    var html = '<button class="pyq-chip' + (subject === 'all' ? ' active' : '') + '" data-subject="all">All subjects</button>';
    subjects().forEach(function (s) {
      html += '<button class="pyq-chip' + (subject === s ? ' active' : '') + '" data-subject="' +
        App.escapeHtml(s) + '">' + App.escapeHtml(s) + '</button>';
    });
    filterEl.innerHTML = html;
  }

  function papers() {
    var all = (window.DataStore && DataStore.getPyqs()) || [];
    return all.filter(function (p) {
      if (!p || !p.title) return false;
      if (p.kind !== kind) return false;
      if (subject !== 'all' && p.subject !== subject) return false;
      return true;
    }).sort(function (a, b) {
      /* newest year first, then newest upload */
      var ya = parseInt(a.year, 10) || 0, yb = parseInt(b.year, 10) || 0;
      if (ya !== yb) return yb - ya;
      return String(b.at || '').localeCompare(String(a.at || ''));
    });
  }

  function iconFor(type) {
    var t = String(type || '').toLowerCase();
    if (t.indexOf('pdf') === 0) return 'fa-file-pdf';
    if (t.indexOf('image') === 0) return 'fa-file-image';
    if (t.indexOf('doc') === 0 || t.indexOf('word') === 0) return 'fa-file-word';
    return 'fa-file-lines';
  }

  function render() {
    var list = papers();
    gridEl.innerHTML = '';
    if (!list.length) {
      emptyEl.style.display = 'block';
      emptyTitle.textContent = 'No ' + (KINDS[kind] ? KINDS[kind].label.toLowerCase() : '') + ' papers yet';
      emptyBody.textContent = subject === 'all'
        ? 'Papers uploaded by the class admin appear here for everyone.'
        : 'No ' + subject + ' papers in this category yet.';
      return;
    }
    emptyEl.style.display = 'none';
    list.forEach(function (p) {
      var card = document.createElement('article');
      card.className = 'pyq-card glass-card reveal';
      var meta = [p.subject, p.year].filter(Boolean).join(' · ');
      card.innerHTML =
        '<div class="pyq-card-top">' +
          '<span class="pyq-icon"><i class="fa-solid ' + iconFor(p.type) + '"></i></span>' +
          '<div class="pyq-head">' +
            '<h3 class="pyq-title">' + App.escapeHtml(p.title) + '</h3>' +
            (meta ? '<p class="pyq-meta">' + App.escapeHtml(meta) + '</p>' : '') +
          '</div>' +
        '</div>' +
        (p.note ? '<p class="pyq-note">' + App.escapeHtml(p.note) + '</p>' : '') +
        '<div class="pyq-actions">' +
          (p.url ? '<a class="btn btn-primary btn-sm" href="' + App.escapeHtml(p.url) +
            '" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open paper</a>'
            : '<span class="pyq-nofile">No file attached</span>') +
          (p.solutionUrl ? '<a class="btn btn-secondary btn-sm" href="' + App.escapeHtml(p.solutionUrl) +
            '" target="_blank" rel="noopener"><i class="fa-solid fa-check-double"></i> Answers</a>' : '') +
        '</div>';
      gridEl.appendChild(card);
    });
  }

  function setKind(k) {
    if (!KINDS[k]) return;
    kind = k;
    if (tabsEl) {
      tabsEl.querySelectorAll('.pyq-tab').forEach(function (b) {
        var on = b.getAttribute('data-kind') === k;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    render();
  }

  tabsEl && tabsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.pyq-tab');
    if (b) setKind(b.getAttribute('data-kind'));
  });

  filterEl && filterEl.addEventListener('click', function (e) {
    var b = e.target.closest('.pyq-chip');
    if (!b) return;
    subject = b.getAttribute('data-subject');
    buildFilter();
    render();
  });

  /* Papers are added by the admin on another device: re-render on sync. */
  window.addEventListener('aia-sync', render);
  document.addEventListener('aia-remote-apply', render);

  buildFilter();
  render();
  if (window.App && App.revealAll) App.revealAll();
})();
