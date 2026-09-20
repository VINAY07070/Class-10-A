/* ============================================
   Subject Hub — 6 subjects with notes, photos
   and homework links. Admin can edit notes and
   photos in the admin panel.
   ============================================ */

(function () {
  App.initShared('subjects.html');

  var pillsEl = document.getElementById('subjectPills');
  var gridEl = document.getElementById('subjectGrid');
  var modal = document.getElementById('subjectModal');
  var modalContent = document.getElementById('subjectModalContent');

  var subjects = DataStore.getSubjects();
  var activeFilter = 'ALL';

  /* ---------- render pills ---------- */
  function renderPills() {
    var names = ['ALL'].concat(subjects.map(function (s) { return s.name; }));
    pillsEl.innerHTML = names.map(function (n) {
      var cls = n === activeFilter ? 'active' : '';
      return '<button class="subject-pill ' + cls + '" data-subj="' + n + '">' + n + '</button>';
    }).join('');
    pillsEl.querySelectorAll('.subject-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeFilter = btn.getAttribute('data-subj');
        renderPills();
        renderGrid();
      });
    });
  }

  /* ---------- homework per subject ---------- */
  function homeworkFor(subjectName) {
    var hw = DataStore.getHomework();
    var key = subjectName.toUpperCase();
    // match subject field (e.g. "ECONOMICS" won't match, but "MATHS" -> Maths)
    var matched = hw.filter(function (h) {
      var hs = (h.subject || '').toUpperCase();
      return hs === key || hs.indexOf(key) === 0 || key.indexOf(hs) === 0;
    });
    return matched;
  }

  /* ---------- render grid ---------- */
  function renderGrid() {
    var list = subjects.filter(function (s) {
      return activeFilter === 'ALL' || s.name === activeFilter;
    });
    gridEl.innerHTML = list.map(function (subj, i) {
      var hw = homeworkFor(subj.name);
      var content = DataStore.getSubjectContentFor(subj.name);
      var notes = (content && content.notes) || subj.info || '';
      var photos = DataStore.getSubjectPhotoList(subj.name);
      var hwHtml = hw.length
        ? hw.map(function (h) {
            return '<div class="subject-hw-item"><i class="fa-solid fa-pen-to-square"></i> ' +
              App.escapeHtml(h.task.split('\n')[0]) +
              (h.due_date ? ' <span class="text-muted">· due ' + App.escapeHtml(h.due_date) + '</span>' : '') +
              '</div>';
          }).join('')
        : '<div class="text-muted" style="font-size:.82rem">No homework posted for ' + App.escapeHtml(subj.name) + ' yet.</div>';
      return '<div class="subject-card reveal" data-subj="' + App.escapeHtml(subj.name) + '" style="--subj:' + subj.color + '">' +
        '<div class="subject-card-top">' +
        '<div class="subject-icon"><i class="fa-solid ' + subj.icon + '"></i></div>' +
        '<div class="subject-info">' +
        '<h3 class="subject-name">' + App.escapeHtml(subj.name) + '</h3>' +
        '<div class="subject-teacher"><i class="fa-solid fa-user-tie"></i> ' + App.escapeHtml(subj.teacher) + '</div>' +
        '</div>' +
        (photos.length ? '<span class="subject-photo-count"><i class="fa-solid fa-image"></i> ' + photos.length + '</span>' : '') +
        '</div>' +
        '<p class="subject-notes">' + App.escapeHtml(notes) + '</p>' +
        '<div class="subject-hw">' + hwHtml + '</div>' +
        '<button class="subject-open-btn" data-open="' + App.escapeHtml(subj.name) + '">Open subject <i class="fa-solid fa-arrow-right"></i></button>' +
        '</div>';
    }).join('');

    gridEl.querySelectorAll('.subject-open-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openSubject(btn.getAttribute('data-open'));
      });
    });
  }

  /* ---------- subject modal ---------- */
  function openSubject(name) {
    var subj = subjects.find(function (s) { return s.name === name; });
    if (!subj) return;
    var content = DataStore.getSubjectContentFor(name);
    var notes = (content && content.notes) || subj.info || '';
    var photos = DataStore.getSubjectPhotoList(name);
    var hw = homeworkFor(name);

    var html = '';
    html += '<div class="subject-modal-head" style="--subj:' + subj.color + '">';
    html += '<div class="subject-icon big"><i class="fa-solid ' + subj.icon + '"></i></div>';
    html += '<div><h2 class="heading-md">' + App.escapeHtml(subj.name) + '</h2>';
    html += '<div class="text-muted" style="font-size:.85rem"><i class="fa-solid fa-user-tie"></i> ' + App.escapeHtml(subj.teacher) + '</div></div>';
    html += '</div>';

    html += '<div class="subject-modal-section"><h4 class="heading-sm"><i class="fa-solid fa-note-sticky"></i> Notes</h4>';
    html += '<p class="subject-notes" style="white-space:pre-line">' + App.escapeHtml(notes) + '</p></div>';

    html += '<div class="subject-modal-section"><h4 class="heading-sm"><i class="fa-solid fa-list-check"></i> Homework</h4>';
    if (!hw.length) html += '<p class="text-muted" style="font-size:.85rem">Nothing assigned yet.</p>';
    hw.forEach(function (h) {
      html += '<div class="subject-hw-item"><i class="fa-solid fa-pen-to-square"></i> ' + App.escapeHtml(h.task) +
        (h.due_date ? '<br><span class="text-muted" style="font-size:.78rem">Due ' + App.escapeHtml(h.due_date) + '</span>' : '') + '</div>';
    });
    html += '</div>';

    if (photos.length) {
      html += '<div class="subject-modal-section"><h4 class="heading-sm"><i class="fa-solid fa-images"></i> Photos (' + photos.length + ')</h4>';
      html += '<div class="subject-photos">' + photos.map(function (p, i) {
        return '<img src="' + p + '" alt="' + App.escapeHtml(name) + ' photo ' + (i + 1) + '" loading="lazy" data-photo="' + i + '">';
      }).join('') + '</div></div>';
    }

    modalContent.innerHTML = html;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    /* photo lightbox (no popup blocker issues, pinch-zoom friendly) */
    modalContent.querySelectorAll('[data-photo]').forEach(function (img) {
      img.addEventListener('click', function () { openLightbox(img.src); });
    });
  }

  function openLightbox(src) {
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = '<img src="' + src + '" alt="photo"><button class="lightbox-close" aria-label="Close">✕</button>';
    document.body.appendChild(lb);
    document.body.style.overflow = 'hidden';
    function close() { lb.remove(); document.body.style.overflow = modal.classList.contains('open') ? 'hidden' : ''; }
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.getElementById('subjectModalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ---------- boot ---------- */
  renderPills();
  renderGrid();
  App.observeReveals(gridEl);
  var sjT = 0;
  window.__aiaRefresh = function () {
    clearTimeout(sjT);
    sjT = setTimeout(function () { subjects = DataStore.getSubjects(); renderGrid(); App.observeReveals(gridEl); }, 300);
  };
})();