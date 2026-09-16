/* ============================================
   Homework page logic (PREMIUM REDESIGN)
   Timeline list + live countdown timers +
   color-coded urgency + comment threads
   ============================================ */

(function () {
  App.initShared('homework.html');

  var listEl = document.getElementById('homeworkList');
  var emptyEl = document.getElementById('homeworkEmpty');
  var students = DataStore.getStudents();
  var countdownTimers = [];

  function render() {
    var homework = DataStore.getHomework();
    emptyEl.style.display = homework.length ? 'none' : 'block';

    listEl.innerHTML = homework.map(function (hw, i) {
      var dueDate = hw.due_date ? parseDueDate(hw.due_date) : null;
      var dueBadge = dueDate ? App.getDueBadge(hw.due_date) : '<span class="due-badge upcoming">No due date</span>';
      var comments = DataStore.getComments('hw_' + i);
      var dateStr = App.formatDate(hw.due_date || new Date().toISOString());

      var html = '<div class="homework-item reveal" data-due="' + (dueDate ? dueDate.getTime() : '') + '">';
      html += '<div class="homework-header">';
      html += '<div><div class="homework-subject"><i class="fa-solid fa-book-open" style="margin-right:5px"></i>' + App.escapeHtml(hw.subject) + '</div>';
      html += '<div class="homework-task">' + App.escapeHtml(hw.task) + '</div>';
      html += '<div class="text-muted" style="font-size:0.8rem;margin-top:8px"><i class="fa-regular fa-calendar"></i> ' + dateStr + '</div>';
      html += dueDate ? '<div class="countdown-line" data-countdown="' + dueDate.getTime() + '"><i class="fa-solid fa-hourglass-half"></i> <span>--</span></div>' : '';
      html += '</div>';
      html += dueBadge;
      html += '</div>';
      // Comments
      html += '<div class="comments-section">';
      html += '<div class="comments-title"><i class="fa-regular fa-comment"></i> Comments (' + comments.length + ')</div>';
      html += '<div class="comment-list" id="comments_' + i + '">';
      comments.forEach(function (c) {
        html += '<div class="comment-item"><span class="comment-author">' + App.escapeHtml(c.author) + ':</span> <span class="comment-text">' + App.escapeHtml(c.text) + '</span></div>';
      });
      html += '</div>';
      html += '<form class="comment-form" data-hw="' + i + '">';
      var me = DataStore.getSession();
      var myName = (me && me.name) ? me.name : 'Visitor';
      html += '<div class="comment-as"><i class="fa-solid fa-id-badge"></i> Commenting as <strong>' + App.escapeHtml(myName) + '</strong></div>';
      html += '<div class="comment-row"><input type="text" placeholder="Add a comment..." required>';
      html += '<button type="submit" class="btn btn-primary btn-sm"><i class="fa-solid fa-paper-plane"></i> Post</button></div>';
      html += '</form>';
      html += '</div>';
      html += '</div>';
      return html;
    }).join('');

    // Bind comment forms
    listEl.querySelectorAll('.comment-form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var hwIdx = form.getAttribute('data-hw');
        var session = DataStore.getSession();
        var author = (session && session.name) ? session.name : 'Visitor';
        var text = form.querySelector('input').value.trim();
        if (!text) return;
        DataStore.addComment('hw_' + hwIdx, author, text);
        form.querySelector('input').value = '';
        App.showToast('Comment posted', 'success');
        render();
      });
    });

    startCountdowns();
  }

  /* --- Live countdown timers --- */
  function startCountdowns() {
    countdownTimers.forEach(clearInterval);
    countdownTimers = [];
    var items = listEl.querySelectorAll('[data-countdown]');
    items.forEach(function (el) {
      var target = parseInt(el.getAttribute('data-countdown'), 10);
      if (isNaN(target)) return;
      var label = el.querySelector('span');
      function tick() {
        var diff = target - Date.now();
        if (diff <= 0) {
          label.textContent = 'Due now! ⏰';
          el.classList.add('urgent');
          clearInterval(timer);
          return;
        }
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins = Math.floor((diff % 3600000) / 60000);
        var secs = Math.floor((diff % 60000) / 1000);
        var parts = [];
        if (days > 0) parts.push(days + 'd');
        parts.push(hours + 'h', mins + 'm', secs + 's');
        label.textContent = parts.join(' ') + ' left';
        if (diff < 6 * 3600000) el.classList.add('urgent');
      }
      tick();
      var timer = setInterval(tick, 1000);
      countdownTimers.push(timer);
    });
  }

  function parseDueDate(str) {
    // Handle "15 SEP 2026" format
    var parts = str.split(' ');
    if (parts.length === 3) {
      var months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      var day = parseInt(parts[0], 10);
      var month = months[parts[1].toUpperCase()];
      var year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    return new Date(str);
  }

  render();
})();