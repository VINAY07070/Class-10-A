/* ============================================
   Announcements page logic (PREMIUM REDESIGN)
   Blog-style cards + read-more expand +
   comment threads (localStorage)
   ============================================ */

(function () {
  App.initShared('announcements.html');

  var listEl = document.getElementById('announcementList');
  var emptyEl = document.getElementById('announcementEmpty');
  var students = DataStore.getStudents();

  function render() {
    var announcements = DataStore.getAnnouncements();
    emptyEl.style.display = announcements.length ? 'none' : 'block';

    listEl.innerHTML = announcements.map(function (ann, i) {
      var dateStr = ann.date ? App.formatDate(ann.date) : (ann.created_at ? App.formatDate(ann.created_at) : '');
      var comments = DataStore.getComments('ann_' + i);
      var isNew = false;
      var d = ann.date || ann.created_at;
      if (d) {
        isNew = (Date.now() - new Date(d).getTime()) < 3 * 86400000;
      }

      var html = '<div class="announcement-card reveal">';
      html += '<div class="announcement-date"><i class="fa-regular fa-calendar"></i> ' + dateStr + (isNew ? '<span class="new-badge">New</span>' : '') + '</div>';
      html += '<div class="announcement-title">' + App.escapeHtml(ann.title) + '</div>';
      html += '<div class="announcement-body">' + App.escapeHtml(ann.body) + '</div>';
      html += '<button class="announcement-readmore" data-expand="' + i + '"><i class="fa-solid fa-angle-down"></i> <span>Read more</span></button>';
      // Comments
      html += '<div class="comments-section">';
      html += '<div class="comments-title"><i class="fa-regular fa-comment"></i> Comments (' + comments.length + ')</div>';
      html += '<div class="comment-list" id="annComments_' + i + '">';
      comments.forEach(function (c) {
        html += '<div class="comment-item"><span class="comment-author">' + App.escapeHtml(c.author) + ':</span> <span class="comment-text">' + App.escapeHtml(c.text) + '</span></div>';
      });
      html += '</div>';
      html += '<form class="comment-form" data-ann="' + i + '">';
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

    // Read-more expand toggles
    listEl.querySelectorAll('.announcement-readmore').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.announcement-card');
        var body = card.querySelector('.announcement-body');
        var isExpanded = body.classList.toggle('expanded');
        btn.querySelector('span').textContent = isExpanded ? 'Read less' : 'Read more';
        btn.querySelector('i').style.transform = isExpanded ? 'rotate(180deg)' : '';
      });
    });

    // Bind comment forms
    listEl.querySelectorAll('.comment-form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var annIdx = form.getAttribute('data-ann');
        var session = DataStore.getSession();
        var author = (session && session.name) ? session.name : 'Visitor';
        var text = form.querySelector('input').value.trim();
        if (!text) return;
        DataStore.addComment('ann_' + annIdx, author, text);
        form.querySelector('input').value = '';
        App.showToast('Comment posted', 'success');
        render();
      });
    });
  }

  render();
})();