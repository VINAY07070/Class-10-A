/* ============================================
   Teachers page logic (PREMIUM REDESIGN)
   Cards with floating icons + hover reveals
   ============================================ */

(function () {
  App.initShared('teachers.html');

  var teacherGrid = document.getElementById('teacherGrid');
  var leadershipGrid = document.getElementById('leadershipGrid');

  var icons = ['fa-book-open', 'fa-feather-pointed', 'fa-om', 'fa-earth-asia', 'fa-calculator', 'fa-flask'];
  var iconColors = [
    'rgba(124,108,255,.25)', 'rgba(56,224,255,.22)', 'rgba(245,181,68,.24)',
    'rgba(52,211,153,.22)', 'rgba(255,110,199,.22)', 'rgba(79,140,255,.25)'
  ];

  var teachers = DataStore.getTeachers();
  teacherGrid.innerHTML = teachers.map(function (t, i) {
    return '<div class="teacher-card reveal reveal-delay-' + (i % 5 + 1) + '" data-tilt>' +
      '<div class="teacher-icon" style="background:' + iconColors[i % iconColors.length] + '"><i class="fa-solid ' + (icons[i % icons.length] || 'fa-book') + '"></i></div>' +
      '<div class="teacher-subject">' + App.escapeHtml(t.subject) + '</div>' +
      '<div class="teacher-name">' + App.escapeHtml(t.name) + '</div>' +
      '<div class="teacher-detail">' + App.escapeHtml(t.detail) + '</div>' +
      '</div>';
  }).join('');

  var leadership = DataStore.getLeadership();
  var leadIcons = ['fa-crown', 'fa-school'];
  leadershipGrid.innerHTML = leadership.map(function (l, i) {
    return '<div class="teacher-card leadership-card reveal reveal-delay-' + (i % 2 + 1) + '" data-tilt>' +
      '<div class="teacher-icon"><i class="fa-solid ' + (leadIcons[i] || 'fa-award') + '"></i></div>' +
      '<div class="teacher-subject">' + App.escapeHtml(l.role) + '</div>' +
      '<div class="teacher-name">' + App.escapeHtml(l.name) + '</div>' +
      '<div class="teacher-detail">AIA School Leadership</div>' +
      '</div>';
  }).join('');
})();