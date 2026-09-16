/* ============================================
   Subject Hub — 6 subjects with notes, photos,
   homework links, resources + GitHub data.
   Admin can edit notes/photos in admin panel.
   ============================================ */

(function () {
  App.initShared('subjects.html');

  var pillsEl = document.getElementById('subjectPills');
  var gridEl = document.getElementById('subjectGrid');
  var githubEl = document.getElementById('githubResources');
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
        return '<img src="' + p + '" alt="' + App.escapeHtml(name) + ' photo ' + (i + 1) + '" loading="lazy" onclick="window.open(this.src)">';
      }).join('') + '</div></div>';
    }

    modalContent.innerHTML = html;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.getElementById('subjectModalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ---------- GitHub resources ---------- */
  var GITHUB_URL = DataStore.getGithubUrl();

  function renderGithub(resources) {
    var hasAny = resources && (resources.resources && resources.resources.length || resources.links && resources.links.length);
    if (!hasAny) {
      githubEl.innerHTML = '<div class="text-muted" style="text-align:center;padding:18px"><i class="fa-solid fa-inbox"></i> No GitHub resources configured yet. The admin can add a public JSON URL in the admin panel → Subjects.</div>';
      return;
    }
    var items = resources.resources || resources.links || [];
    githubEl.innerHTML = '<div class="github-title"><i class="fa-brands fa-github"></i> ' + App.escapeHtml(resources.title || 'Online Resources') + '</div>' +
      '<div class="github-list">' + items.map(function (r) {
        var url = r.url || '#';
        var desc = r.description || r.note || '';
        return '<a class="github-item" href="' + App.escapeHtml(url) + '" target="_blank" rel="noopener">' +
          '<i class="fa-solid fa-arrow-up-right-from-square"></i>' +
          '<div><strong>' + App.escapeHtml(r.title || r.name || url) + '</strong>' +
          (desc ? '<div class="text-muted" style="font-size:.8rem">' + App.escapeHtml(desc) + '</div>' : '') +
          '</div></a>';
      }).join('') + '</div>';
  }

  function loadGithub() {
    if (!GITHUB_URL) { renderGithub(null); return; }
    var cached = DataStore.getGithubData();
    if (cached && cached.url === GITHUB_URL) { renderGithub(cached.data); return; }
    fetch(GITHUB_URL)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        DataStore.setGithubData({ url: GITHUB_URL, data: data, fetchedAt: new Date().toISOString() });
        renderGithub(data);
        if (data.resources && data.resources.length) App.showToast('Resources synced from GitHub 🚀', 'success');
      })
      .catch(function () {
        if (cached) renderGithub(cached.data);
        else {
          githubEl.innerHTML = '<div class="text-muted" style="text-align:center;padding:18px"><i class="fa-solid fa-plug-circle-xmark"></i> Could not fetch GitHub data (offline or blocked). Admin can set the URL in the admin panel.</div>';
        }
      });
  }

  /* ---------- boot ---------- */
  renderPills();
  renderGrid();
  loadGithub();
})();