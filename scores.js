/* ============================================
   Scores page logic (PREMIUM REDESIGN)
   Table + animated percentage bars + analytics
   + grade distribution chart + top scorer crown
   ============================================ */

(function () {
  App.initShared('scores.html');

  var tbody = document.getElementById('scoresBody');
  var emptyEl = document.getElementById('scoresEmpty');
  var analytics = document.getElementById('analyticsGrid');
  var gradeDist = document.getElementById('gradeDist');
  var scores = DataStore.getTestScores();

  function pct(s) {
    return Math.round((s.score / s.max_score) * 100);
  }

  function barClass(p) {
    if (p >= 75) return 'high';
    if (p >= 50) return 'medium';
    return 'low';
  }

  function render() {
    emptyEl.style.display = scores.length ? 'none' : 'block';

    // find top scorer
    var bestIdx = -1, bestPct = -1;
    scores.forEach(function (s, i) {
      var p = pct(s);
      if (p > bestPct) { bestPct = p; bestIdx = i; }
    });

    tbody.innerHTML = scores.map(function (s, i) {
      var p = pct(s);
      var dateStr = s.test_date ? App.formatDate(s.test_date) : (s.test_date || '—');
      if (s.test_date === null) dateStr = '—';
      var isTop = i === bestIdx;
      return '<tr data-idx="' + i + '"' + (isTop ? ' class="top-row"' : '') + '>' +
        '<td><strong>' + (isTop ? '<span class="crown">👑</span> ' : '') + App.escapeHtml(s.student_name) + '</strong></td>' +
        '<td>' + App.escapeHtml(s.subject) + '</td>' +
        '<td>' + App.escapeHtml(s.test_name) + '</td>' +
        '<td><strong>' + s.score + '</strong> / ' + s.max_score + '</td>' +
        '<td><div class="score-bar-wrap"><div class="score-bar"><div class="score-bar-fill ' + barClass(p) + '" data-pct="' + p + '"></div></div><span class="score-percent">' + p + '%</span></div></td>' +
        '<td>' + dateStr + '</td>' +
        '</tr>';
    }).join('');

    // Animate bars
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var fill = entry.target;
          fill.style.width = fill.getAttribute('data-pct') + '%';
          observer.unobserve(fill);
        }
      });
    }, { threshold: 0.2 });
    tbody.querySelectorAll('.score-bar-fill').forEach(function (fill) { observer.observe(fill); });

    renderAnalytics();
    renderGradeDist();
  }

  function renderAnalytics() {
    if (!scores.length) {
      analytics.innerHTML = '<div class="glass-card reveal text-secondary" style="text-align:center;color:var(--text-muted)">No data to analyse yet.</div>';
      return;
    }
    var totalPct = 0;
    var best = { score: -1, name: '', subject: '' };
    var subjectsSet = {};
    scores.forEach(function (s) {
      var p = pct(s);
      totalPct += p;
      if (s.score > best.score) {
        best.score = s.score;
        best.name = s.student_name;
        best.subject = s.subject;
      }
      if (!subjectsSet[s.subject]) subjectsSet[s.subject] = { count: 0, total: 0 };
      subjectsSet[s.subject].count++;
      subjectsSet[s.subject].total += p;
    });
    var avg = Math.round(totalPct / scores.length);

    var cards = '';
    cards += '<div class="analytics-card reveal"><div class="analytics-value text-gold">' + scores.length + '</div><div class="analytics-label">Total Scores</div></div>';
    cards += '<div class="analytics-card reveal reveal-delay-1"><div class="analytics-value text-gold">' + avg + '%</div><div class="analytics-label">Class Average</div></div>';
    cards += '<div class="analytics-card reveal reveal-delay-2"><div class="analytics-value text-gold" style="font-size:1.15rem">' + App.escapeHtml(best.name) + '</div><div class="analytics-label">Top Scorer (' + App.escapeHtml(best.subject) + ' — ' + best.score + ')</div></div>';

    var subjHtml = Object.keys(subjectsSet).map(function (subj, i) {
      var d = subjectsSet[subj];
      var avgSubj = Math.round(d.total / d.count);
      return '<div class="analytics-card reveal reveal-delay-' + (i + 3) + '"><div class="analytics-value" style="color:var(--blue)">' + avgSubj + '%</div><div class="analytics-label">' + App.escapeHtml(subj) + ' Average</div></div>';
    }).join('');

    analytics.innerHTML = cards + subjHtml;
  }

  /* --- Grade distribution (CSS-only bars) --- */
  function renderGradeDist() {
    if (!gradeDist) return;
    if (!scores.length) {
      gradeDist.innerHTML = '<p class="text-muted" style="font-size:0.9rem">No data to chart yet.</p>';
      return;
    }
    var grades = [
      { label: 'A+ (90–100)', min: 90, color: 'linear-gradient(90deg,#34d399,#38e0ff)' },
      { label: 'A (80–89)', min: 80, color: 'linear-gradient(90deg,#38e0ff,#4f8cff)' },
      { label: 'B (70–79)', min: 70, color: 'linear-gradient(90deg,#4f8cff,#7c6cff)' },
      { label: 'C (60–69)', min: 60, color: 'linear-gradient(90deg,#f5b544,#ff8a3d)' },
      { label: 'D (50–59)', min: 50, color: 'linear-gradient(90deg,#ff8a3d,#ff5d7a)' },
      { label: 'F (below 50)', min: 0, color: 'linear-gradient(90deg,#ff5d7a,#e8356c)' }
    ];
    var total = scores.length;
    var rows = '';
    grades.forEach(function (g, gi) {
      var min = g.min, max = gi === 0 ? 101 : grades[gi - 1].min - 1;
      var count = scores.filter(function (s) {
        var p = pct(s);
        return p >= min && p < max;
      }).length;
      var pctRow = total ? Math.round((count / total) * 100) : 0;
      rows += '<div class="grade-row">' +
        '<span class="grade-label">' + g.label + '</span>' +
        '<div class="grade-track"><div class="grade-fill" data-gpct="' + pctRow + '" style="background:' + g.color + '"></div></div>' +
        '<span class="grade-count">' + count + '</span>' +
        '</div>';
    });
    gradeDist.innerHTML = rows;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var fill = entry.target;
          fill.style.width = fill.getAttribute('data-gpct') + '%';
          observer.unobserve(fill);
        }
      });
    }, { threshold: 0.3 });
    gradeDist.querySelectorAll('.grade-fill').forEach(function (fill) { observer.observe(fill); });
  }

  var scT = 0;
  window.__aiaRefresh = function () {
    clearTimeout(scT);
    scT = setTimeout(function () { scores = DataStore.getTestScores(); render(); App.observeReveals(document); }, 300);
  };

  render();
})();