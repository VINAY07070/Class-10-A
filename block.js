/* ============================================================
   BLOCK ENFORCEMENT
   ------------------------------------------------------------
   The admin blocks a student with a reason and a duration. That
   record syncs like any other data, so the block applies on every
   device the student uses, not just the one where it was issued.

   What this is: a clear, honest "you are blocked, here is why and
   for how long" screen that stops the account being used.
   What this is not: a security boundary. The data lives in the
   browser, so someone technical could clear it. It is a classroom
   rule, not a jail.
   ============================================================ */
(function () {
  'use strict';
  if (window.AiaBlock && window.AiaBlock.__v === 1) return;

  var overlay = null;
  var timer = 0;

  function build(block) {
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'blocked-screen';
    overlay.id = 'blockedScreen';
    overlay.setAttribute('role', 'alertdialog');
    overlay.innerHTML =
      '<div class="blocked-card">' +
        '<div class="blocked-icon"><i class="fa-solid fa-ban"></i></div>' +
        '<h2>Your account is blocked</h2>' +
        '<p class="blocked-note" style="margin:6px 0 0">An admin has blocked this account for the Class 10-A Hub.</p>' +
        '<div class="blocked-reason">' +
          '<span class="blocked-label">Reason</span>' +
          '<span id="blockedReason"></span>' +
        '</div>' +
        '<span class="blocked-label" style="opacity:.6;font-size:.68rem;letter-spacing:.09em;text-transform:uppercase">Time remaining</span>' +
        '<div class="blocked-timer" id="blockedTimer">—</div>' +
        '<p class="blocked-note">If you think this is a mistake, talk to your class teacher or the admin. ' +
        'The block ends on its own when the timer runs out.</p>' +
      '</div>';
    document.body.appendChild(overlay);

    var reasonEl = overlay.querySelector('#blockedReason');
    var timerEl = overlay.querySelector('#blockedTimer');
    reasonEl.textContent = block.reason || 'No reason given.';

    function tick() {
      var left = window.DataStore.blockCountdown(block.until);
      timerEl.textContent = left;
      /* the block lapsed while the screen was open: let them back in */
      if (block.until && Date.now() >= block.until) {
        clearInterval(timer);
        if (overlay) { overlay.remove(); overlay = null; }
        try { window.location.reload(); } catch (e) {}
      }
    }
    tick();
    timer = setInterval(tick, 1000);
  }

  /* Show the blocked screen if this account is blocked.
     Returns true when it took over the page. */
  function enforce(auth) {
    var user = auth && (auth.username || auth.name);
    if (!user) return false;
    var block = window.DataStore.getBlock(user);
    /* the visitor pass and the admin account are never blockable */
    if (!block || /^(visitor|admin)$/i.test(user)) return false;
    build(block);
    return true;
  }

  /* Cover a session restored from storage, so a blocked student who reloads
     does not slip straight back into the site. */
  function enforceCurrentSession() {
    try {
      var s = window.DataStore.getSession();
      if (s) return enforce(s);
    } catch (e) {}
    return false;
  }

  window.AiaBlock = {
    __v: 1,
    enforce: enforce,
    enforceCurrentSession: enforceCurrentSession,
    hide: function () { if (overlay) { overlay.remove(); overlay = null; } clearInterval(timer); }
  };
})();
