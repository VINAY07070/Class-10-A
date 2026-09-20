/* ============================================
   Students page logic (PREMIUM REDESIGN)
   Searchable grid + profile modal/drawer
   Gradient avatars · staggered entrance
   ============================================ */

(function () {
  App.initShared('students.html');

  var grid = document.getElementById('studentGrid');
  var searchInput = document.getElementById('studentSearch');
  var emptyState = document.getElementById('studentsEmpty');
  var modal = document.getElementById('studentModal');
  var modalContent = document.getElementById('modalContent');
  var students = DataStore.getStudents().slice().sort(function (a, b) {
    return a.localeCompare(b, 'en', { sensitivity: 'base' });
  });
  var profiles = DataStore.getStudentProfiles();

  var AVATAR_GRADIENTS = [
    'linear-gradient(135deg,#7c6cff,#4f8cff)',
    'linear-gradient(135deg,#38e0ff,#4f8cff)',
    'linear-gradient(135deg,#f5b544,#ff8a3d)',
    'linear-gradient(135deg,#ff6ec7,#7c6cff)',
    'linear-gradient(135deg,#34d399,#38e0ff)',
    'linear-gradient(135deg,#ff5d7a,#ff8a3d)'
  ];

  function getProfile(name) {
    return profiles.find(function (p) {
      return p.student_name.toUpperCase() === name.toUpperCase();
    });
  }

  function highlight(name, query) {
    if (!query) return name;
    var idx = name.toUpperCase().indexOf(query.toUpperCase());
    if (idx === -1) return name;
    return name.slice(0, idx) + '<mark>' +
      name.slice(idx, idx + query.length) + '</mark>' + name.slice(idx + query.length);
  }

  var HIGHLIGHTS = {
    'VINAY KHILERI': 'admin',
    'NITIN': 'admin'
  };
  function highlightRole(name) { return HIGHLIGHTS[String(name).toUpperCase()] || ''; }

  function render(searchTerm) {
    var query = (searchTerm || '').trim();
    var filtered = students.filter(function (s) {
      return !query || s.toUpperCase().includes(query.toUpperCase());
    });
    grid.innerHTML = filtered.map(function (name, i) {
      var profile = getProfile(name);
      var hasProfile = !!profile;
      var initials = name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
      var role = highlightRole(name);
      var isFounder = String(name).toUpperCase() === 'VINAY KHILERI';
      var num = students.indexOf(name) + 1;
      var grad = AVATAR_GRADIENTS[num % AVATAR_GRADIENTS.length];
      return '<div class="student-card reveal ' + (query ? 'highlight' : '') +
        (role ? ' student-' + role + (isFounder ? ' student-founder' : '') : '') +
        '" data-name="' + name + '" tabindex="0" role="button"' +
        ' style="animation-delay:' + (i * 0.025) + 's">' +
        (role ? '<span class="admin-badge">' + (isFounder ? 'FOUNDER' : 'ADMIN') + '</span>' : '') +
        '<div class="student-avatar" style="background:' + grad + '">' + initials + '</div>' +
        '<div class="student-name">' + highlight(name, query) + '</div>' +
        '<div class="student-number">#' + num + (hasProfile ? ' •  Profile' : '') + '</div>' +
        '</div>';
    }).join('');

    emptyState.style.display = filtered.length ? 'none' : 'block';

    // Staggered reveal for new cards (CSS transition-delay via animation-delay)
    grid.querySelectorAll('.reveal').forEach(function (el, i) {
      el.style.transitionDelay = (i * 0.035) + 's';
    });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    grid.querySelectorAll('.reveal').forEach(function (el) { observer.observe(el); });

    // Click handlers
    grid.querySelectorAll('.student-card').forEach(function (card) {
      card.addEventListener('click', function () { openModal(card.getAttribute('data-name')); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') openModal(card.getAttribute('data-name'));
      });
    });
  }

  function openModal(name) {
    var profile = getProfile(name);
    var initials = name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
    var isAdmin = name.toUpperCase() === 'VINAY KHILERI';
    var isCoAdmin = name.toUpperCase() === 'NITIN';
    var num = students.indexOf(name) + 1;
    var grad = AVATAR_GRADIENTS[num % AVATAR_GRADIENTS.length];

    var html = '';
    html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap">';
    html += '<div class="modal-avatar" style="background:' + grad + '">' + initials + '</div>';
    html += '<div><h2 class="heading-md">' + name + '</h2>';
    html += '<div class="text-muted" style="font-size:0.85rem">Student #' + num +
      (isAdmin ? ' • 👑 Class Admin' : (isCoAdmin ? ' • 👑 Admin' : '')) + '</div>';
    html += '</div></div>';

    if (!profile) {
      html += '<div class="no-profile-msg">';
      html += '<div class="no-profile-icon">🌱</div>';
      html += '<p>Profile not set yet.</p>';
      html += '<p class="text-muted" style="font-size:0.85rem;margin-top:6px">This student hasn\'t added their story yet. Check back soon!</p>';
      html += '</div>';
    } else {
      if (profile.bio) html += '<div class="profile-field"><div class="field-label">Bio</div><div class="field-value" style="white-space:pre-line">' + App.escapeHtml(profile.bio) + '</div></div>';
      if (profile.strengths) html += '<div class="profile-field"><div class="field-label"><i class="fa-solid fa-dumbbell" style="margin-right:5px"></i>Strengths</div><div class="field-value">' + App.escapeHtml(profile.strengths) + '</div></div>';
      if (profile.interests) html += '<div class="profile-field"><div class="field-label"><i class="fa-solid fa-star" style="margin-right:5px;color:var(--gold)"></i>Interests</div><div class="field-value">' + App.escapeHtml(profile.interests) + '</div></div>';
      if (profile.goals) html += '<div class="profile-field"><div class="field-label"><i class="fa-solid fa-bullseye" style="margin-right:5px"></i>Goals</div><div class="field-value">' + App.escapeHtml(profile.goals) + '</div></div>';
    }

    modalContent.innerHTML = html;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.getElementById('modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
    // '/' focuses search
    if (e.key === '/' && document.activeElement !== searchInput &&
        !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  searchInput.addEventListener('input', function () {
    render(searchInput.value);
  });

  /* --- Section 10-B info --- */
  var info = window.SEED.other && window.SEED.other[0] ? window.SEED.other[0].note : '';
  document.getElementById('info10B').innerHTML =
    '<div style="display:flex;gap:16px;align-items:flex-start">' +
    '<div style="font-size:2.2rem"><i class="fa-solid fa-school" style="color:var(--gold)"></i></div>' +
    '<div><h3 class="heading-sm" style="margin-bottom:8px">Section 10-B</h3>' +
    '<p class="text-secondary" style="font-size:0.9rem">' + App.escapeHtml(info) + '</p></div></div>';

  var stT = 0;
  window.__aiaRefresh = function () {
    clearTimeout(stT);
    stT = setTimeout(function () {
      profiles = DataStore.getStudentProfiles();
      students = DataStore.getStudents().slice().sort(function (a, b) { return a.localeCompare(b, 'en', { sensitivity: 'base' }); });
      render(searchInput.value);
    }, 300);
  };

  render('');
})();