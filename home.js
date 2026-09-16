/* ============================================
   Home page logic (V2 landing)
   Hero typewriter · spotlight renders · stats ·
   GSAP entrance · parallax · magnetic buttons
   ============================================ */

(function () {
  App.initShared('index.html');

  /* --- Hero subtitle typewriter --- */
  var heroSub = document.getElementById('heroSub');
  if (heroSub) {
    var fullText = 'Your classmates, teachers, homework, scores, chat, polls, subject resources and an AI study bot — all in one place.';
    var i = 0;
    var caret = document.createElement('span');
    caret.className = 'type-caret';
    heroSub.appendChild(caret);
    setTimeout(function type() {
      if (i < fullText.length) {
        heroSub.insertBefore(document.createTextNode(fullText.charAt(i)), caret);
        i++;
        setTimeout(type, 16);
      } else if (caret.parentNode) {
        caret.remove();
      }
    }, 1150);
  }

  /* --- Announcement spotlight --- */
  var spot = document.getElementById('announcementSpotlight');
  if (spot) {
    var ann = DataStore.getAnnouncements();
    if (ann.length) {
      var latest = ann[0];
      var dateStr = latest.date || latest.created_at ? '<div class="spot-date"><i class="fa-regular fa-calendar"></i> ' + App.formatDate(latest.date || latest.created_at) + '</div>' : '';
      spot.innerHTML =
        '<div class="glass-card grad-border announcement-spot spot-hero">' +
        '<div class="spot-ornament spot-orn-a">📢</div>' +
        '<div class="spot-ornament spot-orn-b">✨</div>' +
        '<div class="spot-badge"><i class="fa-solid fa-bullhorn"></i> LATEST UPDATE</div>' +
        '<h3 class="heading-md spot-title">' + App.escapeHtml(latest.title) + '</h3>' +
        '<div class="spot-rule"></div>' +
        '<p class="text-secondary spot-body" style="white-space:pre-line;margin:0">' + App.escapeHtml(latest.body) + '</p>' +
        '<div class="spot-meta">' +
        '<a href="announcements.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-arrow-right"></i> Read all news</a>' +
        dateStr +
        '</div></div>';
    } else {
      spot.innerHTML = '<div class="announcement-spot-empty"><i class="fa-solid fa-bullhorn"></i><p>No announcements yet — check back soon!</p></div>';
    }
  }

  /* --- Teacher spotlight (with real details!) --- */
  var tSpot = document.getElementById('teacherSpotlight');
  if (tSpot) {
    var teachers = DataStore.getTeachers();
    var icons = ['fa-book-open', 'fa-feather-pointed', 'fa-om', 'fa-earth-asia', 'fa-calculator', 'fa-flask'];
    var colors = ['#f5b544', '#38e0ff', '#7c6cff', '#ff8a3d', '#4f8cff', '#34d399'];
    tSpot.innerHTML = teachers.map(function (t, i) {
      var c = colors[i % colors.length];
      return '<div class="glass-card teacher-mini-card" style="--tc:' + c + '" data-tilt>' +
        '<div class="teacher-mini-icon"><i class="fa-solid ' + (icons[i % icons.length] || 'fa-book') + '"></i></div>' +
        '<div class="teacher-mini-subject">' + App.escapeHtml(t.subject) + '</div>' +
        '<div class="teacher-mini-name">' + App.escapeHtml(t.name) + '</div>' +
        '<div class="teacher-mini-detail">' + App.escapeHtml(t.detail || '') + '</div>' +
        '</div>';
    }).join('');
  }

  /* --- GSAP hero entrance + parallax --- */
  App.heroEntrance();
  App.initParallax();

  /* --- Magnetic buttons --- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        btn.style.transform = 'translate(' + x * 0.18 + 'px,' + y * 0.18 + 'px)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }
})();