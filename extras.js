/* ============================================================
   EXTRAS.JS — GitHub / remote JSON resource browser.

   The brief asks for a section that pulls study content from a
   configurable public JSON URL and degrades gracefully when the
   network, CORS or file:// protocol says no. This is that section.

   Behaviour by protocol matters a lot here:
   - On file:// (double-clicked index.html) fetch() of a remote URL is
     usually blocked by CORS, so we go straight to the cache and say so
     plainly rather than showing a scary error.
   - On http(s) we fetch, parse, render and cache.
   - Either way the last good copy stays in localStorage, so the page is
     never empty once it has worked once.
   ============================================================ */
(function () {
  'use strict';

  var PROTOCOL_IS_FILE = location.protocol === 'file:';

  /* If the admin has not set a URL, this built-in list keeps the page
     genuinely useful offline instead of being an empty state. It is
     seed content, not invented class data: study technique and formulas
     that are true regardless of the class. */
  var FALLBACK_RESOURCES = [
    { title: 'How to revise a chapter properly', tag: 'Method', icon: 'fa-brain',
      body: 'Read once for the shape of it, close the book, write down everything you remember, then reopen and fill the gaps in a different colour. The gaps you colour in are the only things worth re-reading.' },
    { title: 'Algebra: the three identities that cover most questions', tag: 'Maths', icon: 'fa-calculator',
      body: '(a+b)² = a² + 2ab + b²\n(a−b)² = a² − 2ab + b²\na² − b² = (a+b)(a−b)\nMost factorisation questions in Class 10 reduce to one of these.' },
    { title: 'Physics: sign conventions before formulas', tag: 'Science', icon: 'fa-flask',
      body: 'Write your sign convention at the top of every numerical answer. Mirror and lens questions in Class 10 are almost never lost to the formula — they are lost to a sign flipped halfway through.' },
    { title: 'Writing answers that actually score', tag: 'English', icon: 'fa-book-open',
      body: 'Answer the question in the first line, then support it. An examiner marking forty scripts should not have to hunt for your point in paragraph three.' },
    { title: 'Making a revision timetable you will keep', tag: 'Method', icon: 'fa-calendar-check',
      body: 'Plan in 40-minute blocks with a 10-minute break, and never plan more than four blocks on a school day. A timetable you abandon after three days is worse than none, because it costs you confidence.' },
    { title: 'Map work: practise, do not memorise', tag: 'SST', icon: 'fa-earth-asia',
      body: 'Print a blank outline map and label it from memory weekly. Recognition feels like knowledge but is not — the exam asks you to produce the location, not to nod at it.' }
  ];

  function el(id) { return document.getElementById(id); }

  function srcURL() {
    try {
      if (window.DataStore && DataStore.getGithubUrl) return DataStore.getGithubUrl() || '';
    } catch (e) {}
    return (window.SEED && window.SEED.github_data_url) || '';
  }

  function cached() {
    try {
      if (window.DataStore && DataStore.getGithubData) return DataStore.getGithubData();
    } catch (e) {}
    return null;
  }

  /* Accept either a documented shape ({resources:[...]}) or a bare array,
     because whoever points this at a gist should not have to match a
     bespoke schema. */
  function normalise(raw) {
    if (!raw) return [];
    var list = Array.isArray(raw) ? raw : (Array.isArray(raw.resources) ? raw.resources : null);
    if (!list) return [];
    return list.map(function (r) {
      if (typeof r === 'string') return { title: r, tag: 'Note', icon: 'fa-lightbulb', body: '' };
      return {
        title: String(r.title || r.name || 'Untitled'),
        tag: String(r.tag || r.subject || r.category || 'Note'),
        icon: String(r.icon || 'fa-lightbulb'),
        body: String(r.body || r.text || r.description || '')
      };
    }).filter(function (r) { return r.title; });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(list, originNote) {
    var grid = el('extrasGrid');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML =
        '<div class="glass-card empty-state reveal">' +
        '<div class="empty-icon"><i class="fa-solid fa-inbox"></i></div>' +
        '<h3>Nothing here yet</h3>' +
        '<p>No resources were found at the configured source, and no cached copy exists.</p>' +
        '</div>';
      return;
    }
    grid.innerHTML = list.map(function (r, i) {
      return '<article class="glass-card extras-card reveal" style="transition-delay:' + Math.min(i * 45, 320) + 'ms">' +
        '<div class="extras-card-top">' +
          '<span class="extras-icon"><i class="fa-solid ' + esc(r.icon) + '"></i></span>' +
          '<span class="extras-tag">' + esc(r.tag) + '</span>' +
        '</div>' +
        '<h3 class="extras-title">' + esc(r.title) + '</h3>' +
        (r.body ? '<p class="extras-body">' + esc(r.body).replace(/\n/g, '<br>') + '</p>' : '') +
      '</article>';
    }).join('');
    if (window.AiaReveal && AiaReveal.scan) { try { AiaReveal.scan(); } catch (e) {} }
    if (originNote) status(originNote, 'info');
  }

  function status(msg, kind) {
    var s = el('extrasStatus');
    if (!s) return;
    if (!msg) { s.hidden = true; s.innerHTML = ''; return; }
    s.hidden = false;
    var icon = kind === 'warn' ? 'fa-triangle-exclamation'
             : kind === 'ok' ? 'fa-circle-check' : 'fa-circle-info';
    s.className = 'extras-status reveal ' + (kind || 'info');
    s.innerHTML = '<i class="fa-solid ' + icon + '"></i> <span>' + esc(msg) + '</span>';
  }

  function setSrcLine(text) {
    var l = el('extrasSrcLine');
    if (l) l.textContent = text;
  }

  function updateHint() {
    var hint = el('extrasHint');
    if (!hint) return;
    if (PROTOCOL_IS_FILE) {
      hint.innerHTML = 'Opened from a file, so live fetching is blocked by the browser. ' +
        'Everything below comes from the offline cache. An admin can set a source URL in the Admin panel.';
    } else {
      hint.innerHTML = 'Set the source URL in the Admin panel under Settings. ' +
        'It accepts a JSON array, or an object with a <code>resources</code> array.';
    }
  }

  function load(force) {
    var url = srcURL();
    var have = cached();

    if (!url) {
      setSrcLine('No source configured — showing the built-in offline set.');
      render(normalise(FALLBACK_RESOURCES), '');
      return;
    }

    setSrcLine('Source: ' + url);

    if (PROTOCOL_IS_FILE) {
      if (have && have.resources) {
        render(normalise(have.resources), 'Showing the saved copy — live fetch is blocked on file://.');
      } else {
        render(normalise(FALLBACK_RESOURCES), 'Live fetch is blocked on file:// and nothing is cached yet — showing the built-in offline set.');
      }
      return;
    }

    status('Loading resources…', 'info');
    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        var list = normalise(json);
        if (window.DataStore && DataStore.setGithubData) {
          DataStore.setGithubData({ resources: list, at: Date.now(), url: url });
        }
        render(list, 'Loaded ' + list.length + ' resource(s) from the configured source.');
      })
      .catch(function (err) {
        /* Offline, CORS, bad JSON, 404 — all end up here. Prefer the cache,
           then fall back to the built-in set, and never look broken. */
        if (have && have.resources && have.resources.length) {
          render(normalise(have.resources), 'Could not reach the source (' + err.message + '). Showing the last saved copy.');
        } else {
          render(normalise(FALLBACK_RESOURCES), 'Could not reach the source (' + err.message + '). Showing the built-in offline set.');
        }
      });
  }

  /* ---------------- offline tools ---------------- */
  var TOOLS = [
    { id: 'study', icon: 'fa-stopwatch', title: 'Study timer', desc: '40 minute focus block with a 10 minute break.' },
    { id: 'percent', icon: 'fa-percent', title: 'Percentage', desc: 'What a score out of a total works out to.' },
    { id: 'timer', icon: 'fa-hourglass-half', title: 'Class countdown', desc: 'Days left until a date you pick.' }
  ];

  function renderTools() {
    var wrap = el('extrasTools');
    if (!wrap) return;
    wrap.innerHTML = TOOLS.map(function (t) {
      return '<div class="glass-card extras-tool reveal" data-tool="' + t.id + '">' +
        '<span class="extras-icon"><i class="fa-solid ' + t.icon + '"></i></span>' +
        '<h3>' + esc(t.title) + '</h3>' +
        '<p>' + esc(t.desc) + '</p>' +
        '<div class="extras-tool-body" id="tool-' + t.id + '"></div>' +
      '</div>';
    }).join('');

    /* Study timer */
    var st = el('tool-study');
    if (st) {
      st.innerHTML = '<button class="btn btn-secondary" id="timerToggle" type="button"><i class="fa-solid fa-play"></i> Start</button>' +
        '<div class="extras-readout" id="timerOut">40:00</div>';
      var left = 40 * 60, running = false, iv = null, onBreak = false;
      function paint() {
        var m = Math.floor(left / 60), s = left % 60;
        var o = el('timerOut');
        if (o) o.textContent = m + ':' + (s < 10 ? '0' : '') + s + (onBreak ? ' — break' : '');
      }
      function step() {
        left--;
        if (left <= 0) {
          onBreak = !onBreak;
          left = onBreak ? 10 * 60 : 40 * 60;
          if (window.Toast && Toast.show) Toast.show(onBreak ? 'Break time!' : 'Back to work!', 'info');
        }
        paint();
      }
      var btn = el('timerToggle');
      if (btn) btn.addEventListener('click', function () {
        running = !running;
        btn.innerHTML = running ? '<i class="fa-solid fa-pause"></i> Pause' : '<i class="fa-solid fa-play"></i> Start';
        clearInterval(iv);
        if (running) iv = setInterval(step, 1000);
      });
      paint();
    }

    /* Percentage */
    var pt = el('tool-percent');
    if (pt) {
      pt.innerHTML =
        '<div class="extras-row">' +
          '<input class="input" id="pctGot" type="number" inputmode="decimal" placeholder="Got" aria-label="Score obtained">' +
          '<input class="input" id="pctTot" type="number" inputmode="decimal" placeholder="Out of" aria-label="Score total">' +
        '</div>' +
        '<div class="extras-readout" id="pctOut">—</div>';
      function calc() {
        var g = parseFloat((el('pctGot') || {}).value);
        var t = parseFloat((el('pctTot') || {}).value);
        var o = el('pctOut');
        if (!o) return;
        if (!isFinite(g) || !isFinite(t) || t <= 0) { o.textContent = '—'; return; }
        var p = g / t * 100;
        o.textContent = p.toFixed(1) + '%';
      }
      ['pctGot', 'pctTot'].forEach(function (id) {
        var n = el(id);
        if (n) n.addEventListener('input', calc);
      });
    }

    /* Countdown */
    var ct = el('tool-timer');
    if (ct) {
      ct.innerHTML = '<input class="input" id="cdDate" type="date" aria-label="Target date">' +
        '<div class="extras-readout" id="cdOut">—</div>';
      function calcCd() {
        var v = (el('cdDate') || {}).value;
        var o = el('cdOut');
        if (!o) return;
        if (!v) { o.textContent = '—'; return; }
        var target = new Date(v + 'T00:00:00');
        var days = Math.ceil((target - new Date()) / 86400000);
        o.textContent = days > 1 ? days + ' days' : (days === 1 ? 'tomorrow' : (days === 0 ? 'today' : 'passed'));
      }
      var d = el('cdDate');
      if (d) d.addEventListener('change', calcCd);
      calcCd();
    }
  }

  function init() {
    if (window.App && App.initShared) App.initShared('extras.html');
    updateHint();
    renderTools();
    load();
    var r = el('extrasRefresh');
    if (r) r.addEventListener('click', function () { load(true); });
    var c2 = el('extrasClear');
    if (c2) c2.addEventListener('click', function () {
      try { if (window.DataStore && DataStore.setGithubData) DataStore.setGithubData(null); } catch (e) {}
      status('Cache cleared.', 'ok');
      load(true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();