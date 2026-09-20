/* ============================================
   Polls page logic
   Vote + animated live result bars
   One vote per student (synced across devices)
   ============================================ */

(function () {
  App.initShared('polls.html');

  var pollList = document.getElementById('pollList');
  var emptyEl = document.getElementById('pollEmpty');
  var session = DataStore.getSession();
  var me = session ? session.username : null;

  function render() {
    session = DataStore.getSession();
    me = session ? session.username : null;
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
        var ok = DataStore.votePoll(pollIdx, optIdx, me);
        if (!ok) {
          App.showToast('You already voted on this one!', 'info');
          return;
        }
        App.showToast('Vote submitted! 🎉', 'success');
        try { DataStore.logAction('poll', 'Voted in a poll', 'polls.html'); } catch (e) {}
        var r = opt.getBoundingClientRect();
        App.burstConfetti({ x: r.left + r.width / 2, y: r.top });
        try { if (window.StickMen) StickMen.celebrate(); } catch (e) {}
        render();
      });
    });

    // Animate bars after render
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        pollList.querySelectorAll('.poll-option-bar').forEach(function (bar) {
          bar.style.width = bar.getAttribute('data-w') + '%';
        });
      });
    });
    App.observeReveals(pollList);
  }

  function renderPoll(poll, idx) {
    var opts = poll.options || [];
    var counts = DataStore.pollCounts ? DataStore.pollCounts(poll) : (poll._voteCounts || {});
    var total = opts.reduce(function (sum, o, oi) { return sum + (counts[oi] || 0); }, 0);
    var myVote = DataStore.myPollVote ? DataStore.myPollVote(idx, me) : null;
    var votedAny = myVote !== null;
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
      var votedThis = myVote === oi;

      html += '<div class="poll-option' + (votedAny ? ' voted' : '') + '" data-poll="' + idx + '" data-opt="' + oi + '" role="button" tabindex="0">';
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

  /* keyboard voting */
  pollList.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var opt = e.target.closest ? e.target.closest('.poll-option:not(.voted)') : null;
    if (opt) { e.preventDefault(); opt.click(); }
  });

  /* live: re-render when votes sync in */
  var renderT = 0;
  function queueRender() { clearTimeout(renderT); renderT = setTimeout(render, 250); }
  window.__aiaRefresh = queueRender;

  render();
})();
