/* ============================================
   Polls page logic
   Vote + animated live result bars
   ============================================ */

(function () {
  App.initShared('polls.html');

  var pollList = document.getElementById('pollList');
  var emptyEl = document.getElementById('pollEmpty');

  function render() {
    var polls = DataStore.getPolls();
    emptyEl.style.display = polls.length ? 'none' : 'block';

    pollList.innerHTML = polls.map(function (poll, idx) {
      return renderPoll(poll, idx);
    }).join('');

    // Bind vote buttons
    pollList.querySelectorAll('.poll-option:not(.voted)').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var pollIdx = parseInt(opt.getAttribute('data-poll'), 10);
        var optIdx = parseInt(opt.getAttribute('data-opt'), 10);
        var ok = DataStore.votePoll(pollIdx, optIdx);
        if (!ok) {
          App.showToast('You already voted on this one!', 'info');
          return;
        }
        App.showToast('Vote submitted! 🎉', 'success');
        App.burstConfetti();
        render();
      });
    });

    // Animate bars after render
    requestAnimationFrame(function () {
      pollList.querySelectorAll('.poll-option-bar').forEach(function (bar) {
        var w = bar.getAttribute('data-w');
        bar.style.width = w + '%';
      });
    });
  }

  function renderPoll(poll, idx) {
    var opts = poll.options || [];
    var counts = poll._voteCounts || {};
    var total = opts.reduce(function (sum, o, oi) { return sum + (counts[oi] || 0); }, 0);
    var votedAny = DataStore.hasVotedPoll(idx);
    var created = poll.created_at ? App.formatDate(poll.created_at) : '';

    var html = '<div class="poll-card reveal">';
    html += '<div class="poll-header">';
    html += '<span class="poll-live"><span class="pulse-dot"></span>LIVE</span>';
    html += '<span class="poll-total">🗳️ ' + total + ' vote' + (total === 1 ? '' : 's') + (created ? ' • ' + created : '') + '</span>';
    html += '</div>';
    html += '<div class="poll-question">' + App.escapeHtml(poll.question) + '</div>';
    html += '<div class="poll-options">';

    opts.forEach(function (opt, oi) {
      var n = counts[oi] || 0;
      var pct = total ? Math.round((n / total) * 100) : 0;
      var votedThis = DataStore.hasVoted(idx, oi);

      html += '<div class="poll-option' + (votedAny ? ' voted' : '') + '" data-poll="' + idx + '" data-opt="' + oi + '">';
      html += '<div class="poll-option-bar" data-w="' + pct + '"></div>';
      html += '<div class="poll-option-content">';
      html += '<span class="poll-option-text">' + App.escapeHtml(opt) + (votedThis ? ' <span style="font-size:0.75rem;color:var(--green)">✓ your vote</span>' : '') + '</span>';
      if (votedAny) {
        html += '<span class="poll-option-stats"><span class="poll-option-count">' + n + ' vote' + (n === 1 ? '' : 's') + '</span><span class="poll-option-percent">' + pct + '%</span></span>';
      } else {
        html += '<span class="poll-option-stats"><span class="poll-option-count" style="color:var(--text-muted)">tap to vote →</span></span>';
      }
      html += '</div></div>';
    });

    html += '</div></div>';
    return html;
  }

  render();
})();