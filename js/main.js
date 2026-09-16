/* ============================================================
    AIA CLASS 10-A HUB — Main Shared JS V2
    Login overlay · navbar · footer · mobile tabbar · gate ·
    particles · reveals · counters · cursor · toasts ·
    tilt · stick men bootstrap · activity tracking
    ============================================================ */

var App = (function () {

  /* ==================================================================
      SHARED INIT (every page calls this)
      ================================================================== */
  function initShared(page) {
    var activePage = page || '';

    // gate: locked users get sent to the landing page
    var locked = !DataStore.isUnlocked();
    if (locked && activePage !== 'index.html') {
      window.location.href = 'index.html';
      return;
    }

    buildNavbar(activePage);
    buildFooter();
    buildTabbar(activePage);
    initNavbar();
    initClock();
    initLoginOverlay();
    initScrollReveal();
    initCounters();
    initRings();
    initBackToTop();
    initTiltCards();
    initParallax();
    initParticles('heroCanvas');
    initParticles('loginCanvas');
    App.initRipple();
    if (!locked) initStickMen();
    logVisit(activePage);

    updateSessionChip();
  }

  function logVisit(page) {
    try { DataStore.logActivity(page); } catch (e) {}
  }

  /* ==================================================================
      LOGIN OVERLAY (index.html)
      ================================================================== */
  function initLoginOverlay() {
    var overlay = document.getElementById('loginOverlay');
    if (!overlay) return;

    if (DataStore.isUnlocked()) {
      overlay.classList.add('done');
      setTimeout(function () {
        var main = document.getElementById('mainSite');
        if (main) main.style.display = '';
        overlay.style.display = 'none';
      }, 900);
      return;
    }

    var errorEl = document.getElementById('loginError');
    var studentForm = document.getElementById('studentForm');
    var visitorForm = document.getElementById('visitorForm');
    var modeStudent = document.getElementById('modeStudentBtn');
    var modeVisitor = document.getElementById('modeVisitorBtn');
    var loginSub = document.getElementById('loginSub');
    if (loginSub) loginSub.textContent = 'Log in as a student or grab a visitor pass';

    function setMode(mode) {
      if (mode === 'student') {
        modeStudent.classList.add('active');
        modeVisitor.classList.remove('active');
        studentForm.classList.add('active');
        visitorForm.classList.remove('active');
      } else {
        modeVisitor.classList.add('active');
        modeStudent.classList.remove('active');
        visitorForm.classList.add('active');
        studentForm.classList.remove('active');
      }
      if (errorEl) errorEl.textContent = '';
    }
    if (modeStudent) modeStudent.addEventListener('click', function () { setMode('student'); });
    if (modeVisitor) modeVisitor.addEventListener('click', function () { setMode('visitor'); });

    function finish(unlock) {
      DataStore.setUnlocked(true);
      if (unlock.adminAuth) DataStore.setAdminAuth(unlock.adminAuth);
      if (unlock.session) DataStore.setSession(unlock.session);
      sessionStorage.setItem('aia_welcome', unlock.name || '');
      overlay.classList.add('done');
      setTimeout(function () {
        var main = document.getElementById('mainSite');
        if (main) main.style.display = '';
        overlay.style.display = 'none';
        initStickMen();
        var name = unlock.name || 'everyone';
        showToast('Welcome, ' + name + '! 🎉', 'success');
      }, 950);
    }

    if (studentForm) {
      studentForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var u = document.getElementById('loginUsername').value.trim();
        var p = document.getElementById('loginPassword').value;
        var btn = document.getElementById('studentLoginBtn');
        if (!u || !p) {
          if (errorEl) errorEl.textContent = 'Enter both username and password.';
          return;
        }
        var auth = DataStore.authenticate(u, p);
        if (!auth) {
          if (errorEl) errorEl.textContent = 'Wrong username or password. Ask the admin for your login.';
          return;
        }
        if (btn) {
          btn.querySelector('.login-btn-text').textContent = 'Logging in...';
          var load = btn.querySelector('.login-btn-load');
          if (load) load.style.display = '';
        }
        setTimeout(function () {
          finish({
            name: auth.name,
            adminAuth: auth.role === 'admin' ? 'full' : null,
            session: auth
          });
        }, 600);
      });
    }

    if (visitorForm) {
      visitorForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = document.getElementById('visitorPass').value.trim();
        if (!v) return;
        var level = DataStore.verifyPass(v);
        if (!level) {
          if (errorEl) errorEl.textContent = 'That pass is not recognised.';
          return;
        }
        if (level === 'full') {
          finish({
            name: 'ADMIN',
            adminAuth: 'full',
            session: { name: 'ADMIN', username: 'admin', role: 'admin' }
          });
        } else {
          finish({
            name: 'Visitor',
            adminAuth: null,
            session: { name: 'Visitor', username: 'visitor', role: 'visitor' }
          });
        }
      });
    }
  }

  /* ==================================================================
      NAVBAR
      ================================================================== */
  function getNavLinks() {
    return [
      { href: 'index.html', icon: 'fa-house', label: 'Home' },
      { href: 'students.html', icon: 'fa-graduation-cap', label: 'Students' },
      { href: 'teachers.html', icon: 'fa-chalkboard-user', label: 'Teachers' },
      { href: 'subjects.html', icon: 'fa-book-open', label: 'Subjects' },
      { href: 'chat.html', icon: 'fa-message', label: 'Chat' },
      { href: 'homework.html', icon: 'fa-pen-to-square', label: 'Homework' },
      { href: 'scores.html', icon: 'fa-chart-column', label: 'Scores' },
      { href: 'announcements.html', icon: 'fa-bullhorn', label: 'News' },
      { href: 'polls.html', icon: 'fa-square-poll-vertical', label: 'Polls' },
      { href: 'ai.html', icon: 'fa-robot', label: 'AI Bot' }
    ];
  }

  function getNavHTML(activePage) {
    var links = getNavLinks();
    var html = '<nav class="navbar"><div class="navbar-inner">';
    html += '<a href="index.html" class="navbar-brand">' +
      '<span class="brand-logo"><svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true"><path d="M32 8 L58 19 L32 30 L6 19 Z" fill="url(#lg)"/><path d="M12 22.5 V31 C12 34 21 38 32 38 C43 38 52 34 52 31 V22.5 Z" fill="url(#lg)"/></svg></span>' +
      '<span>AIA <span class="brand-accent">10-A</span></span></a>';
    html += '<ul class="navbar-links"><span class="navbar-pill" id="navbarPill"></span>';
    links.forEach(function (l) {
      var cls = l.href === activePage ? ' class="active"' : '';
      html += '<li><a href="' + l.href + '"' + cls + '><i class="fa-solid ' + l.icon + '"></i>' + l.label + '</a></li>';
    });
    html += '<li><a href="admin.html" class="admin-link"><i class="fa-solid fa-gear"></i>Admin</a></li>';
    html += '<li class="session-chip-wrap" id="sessionChipWrap"></li>';
    html += '</ul>';
    html += '<span class="navbar-clock" id="navbarClock"><span class="clock-dot"></span> --:--:--</span>';
    html += '<button class="navbar-toggle" id="navToggle" aria-label="Menu"><span></span><span></span><span></span></button>';
    html += '</div>';
    html += '<div class="mobile-drawer" id="mobileDrawer">';
    html += '<div class="heading-sm" style="margin:0 6px 14px;color:var(--gold)">MENU</div>';
    links.forEach(function (l) {
      var cls = l.href === activePage ? ' active' : '';
      html += '<a href="' + l.href + '" class="' + cls + '"><i class="fa-solid ' + l.icon + '"></i>' + l.label + '</a>';
    });
    html += '<a href="admin.html"><i class="fa-solid fa-gear"></i>Admin Panel</a>';
    html += '<div class="drawer-session" id="drawerSession"></div>';
    html += '</div>';
    html += '<div class="drawer-backdrop" id="drawerBackdrop"></div>';
    html += '</nav>';
    return html;
  }

  function buildNavbar(activePage) {
    var holder = document.getElementById('navbar-placeholder');
    if (holder) holder.innerHTML = getNavHTML(activePage);
  }

  function updateSessionChip() {
    var wrap = document.getElementById('sessionChipWrap');
    var drawerSession = document.getElementById('drawerSession');
    var s = DataStore.getSession();
    if (!s) {
      if (wrap) wrap.innerHTML = '';
      if (drawerSession) drawerSession.innerHTML = '';
      return;
    }
    var roleTag = s.role === 'admin' ? '<span class="session-role admin">ADMIN</span>' : '';
    var chip = '<span class="session-chip"><i class="fa-solid fa-circle-user"></i> ' +
      App.escapeHtml(s.name) + roleTag +
      '<button class="session-logout" id="sessionLogoutBtn" title="Log out"><i class="fa-solid fa-right-from-bracket"></i></button></span>';
    if (wrap) wrap.innerHTML = chip;
    if (drawerSession) {
      drawerSession.innerHTML = '<div class="drawer-session-inner"><i class="fa-solid fa-circle-user"></i> Logged in as <strong>' +
        App.escapeHtml(s.name) + '</strong>' + roleTag +
        '<button class="btn btn-sm btn-secondary" id="drawerLogoutBtn">Log out</button></div>';
    }
    var chipBtn = document.getElementById('sessionLogoutBtn');
    var drawerBtn = document.getElementById('drawerLogoutBtn');
    function doLogout() {
      DataStore.clearSession();
      DataStore.setUnlocked(false);
      window.location.href = 'index.html';
    }
    if (chipBtn) chipBtn.addEventListener('click', doLogout);
    if (drawerBtn) drawerBtn.addEventListener('click', doLogout);
  }

  /* ==================================================================
      FOOTER
      ================================================================== */
  function buildFooter() {
    var holder = document.getElementById('footer-placeholder');
    if (!holder) return;
    holder.innerHTML =
      '<footer class="footer"><div class="container">' +
      '<div class="footer-top">' +
      '<div>' +
      '<div class="footer-title"><i class="fa-solid fa-graduation-cap"></i> AIA Class 10-A Hub</div>' +
      '<p class="footer-sub">Alpha International Academy · Class 10-A · Built with ❤ for our class</p>' +
      '</div>' +
      '<div class="footer-links">' +
      '<a href="chat.html"><i class="fa-solid fa-message"></i> Chat</a>' +
      '<a href="subjects.html"><i class="fa-solid fa-book-open"></i> Subjects</a>' +
      '<a href="ai.html"><i class="fa-solid fa-robot"></i> Class AI</a>' +
      '<a href="admin.html"><i class="fa-solid fa-gear"></i> Admin</a>' +
      '</div>' +
      '</div>' +
      '<div class="footer-bottom">' +
      '<span>© 2026 AIA Class 10-A. Made by <strong class="text-gold">Vinay &amp; Nitin</strong> 👌</span>' +
      '<button class="back-to-top" id="backToTopBtn" aria-label="Back to top"><i class="fa-solid fa-arrow-up"></i></button>' +
      '</div></div></footer>';
    var topBtn = document.getElementById('backToTopBtn');
    if (topBtn) topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ==================================================================
      MOBILE BOTTOM TABBAR
      ================================================================== */
  function buildTabbar(activePage) {
    var items = [
      { href: 'index.html', icon: 'fa-house', label: 'Home' },
      { href: 'chat.html', icon: 'fa-message', label: 'Chat' },
      { href: 'subjects.html', icon: 'fa-book-open', label: 'Subjects' },
      { href: 'scores.html', icon: 'fa-chart-column', label: 'Scores' },
      { href: 'ai.html', icon: 'fa-robot', label: 'AI' }
    ];
    var bar = document.createElement('nav');
    bar.className = 'tabbar';
    bar.innerHTML = items.map(function (it) {
      var cls = it.href === activePage ? ' active' : '';
      return '<a href="' + it.href + '" class="tabbar-item' + cls + '">' +
        '<i class="fa-solid ' + it.icon + '"></i><span>' + it.label + '</span></a>';
    }).join('');
    document.body.appendChild(bar);
    document.body.classList.add('has-tabbar');
  }

  /* ==================================================================
      NAVBAR behaviour (drawer, scrolled, pill)
      ================================================================== */
  function initNavbar() {
    var toggle = document.getElementById('navToggle');
    var drawer = document.getElementById('mobileDrawer');
    var backdrop = document.getElementById('drawerBackdrop');

    function closeDrawer() {
      if (toggle) toggle.classList.remove('open');
      if (drawer) drawer.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    }
    function openDrawer() {
      if (toggle) toggle.classList.add('open');
      if (drawer) drawer.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    }
    if (toggle && drawer) {
      toggle.addEventListener('click', function () {
        drawer.classList.contains('open') ? closeDrawer() : openDrawer();
      });
      if (backdrop) backdrop.addEventListener('click', closeDrawer);
      drawer.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', closeDrawer);
      });
    }

    var navbar = document.querySelector('.navbar');
    if (navbar) {
      window.addEventListener('scroll', function () {
        navbar.classList.toggle('scrolled', window.scrollY > 20);
      }, { passive: true });
    }

    var pill = document.getElementById('navbarPill');
    var activeLink = document.querySelector('.navbar-links a.active');
    function positionPill() {
      if (!pill) return;
      if (!activeLink) { pill.classList.remove('visible'); return; }
      var nav = document.querySelector('.navbar-links');
      if (!nav) return;
      var navRect = nav.getBoundingClientRect();
      var linkRect = activeLink.getBoundingClientRect();
      pill.style.left = (linkRect.left - navRect.left) + 'px';
      pill.style.width = linkRect.width + 'px';
      pill.classList.add('visible');
    }
    positionPill();
    window.addEventListener('resize', positionPill);
  }

  /* ==================================================================
      CLOCK (IST)
      ================================================================== */
  function initClock() {
    var el = document.getElementById('navbarClock');
    if (!el) return;
    function update() {
      var now = new Date();
      var utc = now.getTime() + now.getTimezoneOffset() * 60000;
      var ist = new Date(utc + 5.5 * 3600000);
      var h = ist.getHours();
      var m = String(ist.getMinutes()).padStart(2, '0');
      var s = String(ist.getSeconds()).padStart(2, '0');
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      var days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      var day = days[ist.getDay()];
      el.textContent = day + ' ' + h + ':' + m + ':' + s + ' ' + ampm;
    }
    update();
    setInterval(update, 1000);
  }

  /* ==================================================================
      PARTICLES (canvas)
      ================================================================== */
  function initParticles(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w, h, particles = [];
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var mouse = { x: -9999, y: -9999 };
    var PALETTE = ['124,108,255', '56,224,255', '79,140,255', '245,181,68', '255,110,199'];

    function resize() {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    var count = reduced ? 16 : Math.min(85, Math.floor(w * h / 13000));
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.9 + 0.6,
        dx: (Math.random() - 0.5) * 0.55,
        dy: (Math.random() - 0.5) * 0.55,
        alpha: Math.random() * 0.55 + 0.2,
        hue: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.8 + Math.random() * 1.2
      });
    }

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mouseleave', function () {
      mouse.x = -9999; mouse.y = -9999;
    });

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      particles.forEach(function (p) {
        var dxm = p.x - mouse.x, dym = p.y - mouse.y;
        var dm2 = dxm * dxm + dym * dym;
        if (dm2 < 13000 && dm2 > 0.01) {
          var dm = Math.sqrt(dm2);
          p.x += (dxm / dm) * 0.9;
          p.y += (dym / dm) * 0.9;
        }
        p.x += p.dx; p.y += p.dy;
        if (p.x < -8 || p.x > w + 8) p.dx *= -1;
        if (p.y < -8 || p.y > h + 8) p.dy *= -1;
        var tw = p.alpha * (0.55 + 0.45 * Math.sin(t / 900 * p.twinkle + p.phase));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.hue + ',' + Math.max(0.05, tw) + ')';
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* ==================================================================
      SCROLL REVEAL
      ================================================================== */
  function initScrollReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) return;
    els.forEach(function (el) { el.classList.add('pending'); });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.remove('pending');
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    els.forEach(function (el) { observer.observe(el); });
  }

  /* ==================================================================
      COUNTERS
      ================================================================== */
  function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    counters.forEach(function (el) { observer.observe(el); });
  }

  function animateCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var duration = 1500;
    var start = performance.now();
    function step(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ==================================================================
      RINGS
      ================================================================== */
  var ringAnimated = [];
  function animateRing(el, pct) {
    if (!el || ringAnimated.indexOf(el) !== -1) return;
    ringAnimated.push(el);
    var circumference = 276.5;
    var start = performance.now();
    var duration = 1700;
    function step(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.style.strokeDashoffset = circumference - (circumference * (pct / 100) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initRings() {
    var rings = document.querySelectorAll('[data-ring]');
    if (!rings.length) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          animateRing(el, parseFloat(el.getAttribute('data-ring')) || 0);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.4 });
    rings.forEach(function (el) { observer.observe(el); });
  }

  /* ==================================================================
      BACK TO TOP
      ================================================================== */
  function initBackToTop() {
    var btn = document.querySelector('.back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', function () {
      btn.classList.toggle('visible', window.scrollY > 420);
    }, { passive: true });
  }

  /* ==================================================================
      TOASTS
      ================================================================== */
  var toastContainer;
  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }
  function showToast(message, type) {
    type = type || 'info';
    ensureToastContainer();
    var icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><span>' + message + '</span>';
    toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('removing');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3300);
  }

  /* ==================================================================
      CONFETTI
      ================================================================== */
  function burstConfetti() {
    var container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    var colors = ['#f5a524', '#4f8cff', '#7c6cff', '#ff5d7a', '#34d399', '#38e0ff', '#ffd889'];
    for (var i = 0; i < 56; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = (Math.random() * 90 + 5) + '%';
      piece.style.top = (Math.random() * 25 - 25) + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      container.appendChild(piece);
    }
    setTimeout(function () { container.remove(); }, 3400);
  }

  /* ==================================================================
      3D TILT
      ================================================================== */
  function initTiltCards() {
    var cards = document.querySelectorAll('[data-tilt]');
    if (!cards.length) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    cards.forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var rotateX = (y - rect.height / 2) / (rect.height / 2) * -6;
        var rotateY = (x - rect.width / 2) / (rect.width / 2) * 6;
        card.style.transform = 'perspective(900px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) translateY(-6px)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  /* ==================================================================
      STICK MEN
      ================================================================== */
  function initStickMen() {
    if (window.StickMen && StickMen.init) StickMen.init();
  }

  /* ==================================================================
      UTILITIES
      ================================================================== */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }

  function timeAgo(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    return formatDate(isoStr);
  }

  function parseDueDate(str) {
    if (!str) return null;
    var parts = String(str).trim().split(' ');
    if (parts.length === 3) {
      var months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      var m = months[parts[1].toUpperCase()];
      if (m !== undefined) {
        return new Date(parseInt(parts[0], 10), m, parseInt(parts[2], 10));
      }
    }
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function getDueBadge(dueDateStr) {
    var d = parseDueDate(dueDateStr);
    if (!d) return '<span class="due-badge upcoming">No due date</span>';
    var diff = d.getTime() - Date.now();
    var days = Math.ceil(diff / 86400000);
    if (days < 0) return '<span class="due-badge overdue">Overdue</span>';
    if (days === 0) return '<span class="due-badge urgent">Due today!</span>';
    if (days === 1) return '<span class="due-badge urgent">Due tomorrow</span>';
    if (days <= 3) return '<span class="due-badge urgent">Due in ' + days + ' days</span>';
    return '<span class="due-badge upcoming">Due in ' + days + ' days</span>';
  }

  function showStudentName(studentName) {
    return escapeHtml(studentName);
  }

  /* ==================================================================
      GSAP hero entrance (home)
      ================================================================== */
  function heroEntrance() {
    if (!window.gsap) return;
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.hero-eyebrow', { y: 24, opacity: 0, duration: 0.7 }, 0.15)
      .from('.hero-title .line-top', { xPercent: -14, opacity: 0, duration: 0.85 }, 0.35)
      .from('.hero-title .line-glow', { scale: 0.92, opacity: 0, filter: 'blur(14px)', duration: 1.0 }, 0.5)
      .from('.hero-subtitle', { opacity: 0, duration: 0.5 }, 1.15)
      .from('.hero-actions .btn', { y: 26, opacity: 0, duration: 0.6, stagger: 0.12 }, 1.3)
      .from('.hero-float', { scale: 0, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'back.out(2)' }, 0.8);
  }

  function initParallax() {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.utils.toArray('[data-parallax]').forEach(function (el) {
      var amt = parseFloat(el.getAttribute('data-parallax')) || 0.18;
      gsap.to(el, {
        yPercent: amt * 100,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
      });
    });
  }

  /* ==================================================================
      PUBLIC API
      ================================================================== */
  return {
    initShared: initShared,
    showToast: showToast,
    burstConfetti: burstConfetti,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formatTime: formatTime,
    timeAgo: timeAgo,
    parseDueDate: parseDueDate,
    getDueBadge: getDueBadge,
    showStudentName: showStudentName,
    heroEntrance: heroEntrance,
    initParallax: initParallax,
    initStickMen: initStickMen,
    initRipple: function () {
      document.addEventListener('click', function (e) {
        var el = e.target.closest('.btn, .tabbar-link, .quick-link');
        if (!el) return;
        var rect = el.getBoundingClientRect();
        var rip = document.createElement('span');
        rip.className = 'ripple';
        var size = Math.max(rect.width, rect.height) * 2;
        rip.style.width = rip.style.height = size + 'px';
        rip.style.left = (e.clientX - rect.left - size / 2) + 'px';
        rip.style.top = (e.clientY - rect.top - size / 2) + 'px';
        el.appendChild(rip);
        setTimeout(function () { rip.remove(); }, 650);
      });
    }
  };
})();