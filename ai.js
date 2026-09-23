/* ============================================
   Class AI — smart study companion V2
   Dual engine:
   1. LOCAL mode — rule-based knowledge engine
   2. API mode — OpenAI-compatible endpoint
      (key + system prompt configured by admin)
   Per-user history privacy (admin sees all in
   the admin panel log). Clear-history per user.
   ============================================ */

(function () {
  App.initShared('ai.html');

  var messagesEl = document.getElementById('chatMessages');
  var inputEl = document.getElementById('chatInput');
  var sendBtn = document.getElementById('sendBtn');
  var clearBtn = document.getElementById('clearBtn');
  var chipsEl = document.getElementById('suggestedChips');
  var mode = DataStore.getChatMode() || 'study';
  var busy = false;
  var quiz = null;
  var config = null;

  var USER = DataStore.getSession() || { name: 'Visitor', username: 'visitor', role: 'visitor' };
  var HISTORY_KEY = USER.username;

  var suggestions = {
    study: ['Explain photosynthesis simply', 'Who teaches Maths?', 'Tell me about RUDRA', 'Who is the admin?', 'Give me a study tip', 'What is in the subject hub?'],
    homework: ['What homework is due?', 'Show all homework', 'What was the Economics task?'],
    quiz: ['Start a quiz', 'Quiz me on Science', 'Quiz me on Maths']
  };

  /* ============ knowledge base (local engine) ============ */
  function buildKnowledge() {
    var k = { students: {}, teachers: {}, homework: [], announcements: [], polls: [], scores: [], subjects: [] };
    DataStore.getStudents().forEach(function (s) { k.students[s.toUpperCase()] = true; });
    DataStore.getStudentProfiles().forEach(function (p) { k.students[p.student_name.toUpperCase()] = p; });
    DataStore.getTeachers().forEach(function (t) {
      k.teachers[t.subject.toUpperCase()] = t;
      k.teachers[t.name.toUpperCase()] = t;
    });
    k.homework = DataStore.getHomework();
    k.announcements = DataStore.getAnnouncements();
    k.polls = DataStore.getPolls();
    k.scores = DataStore.getTestScores();
    DataStore.getSubjects().forEach(function (s) {
      var c = DataStore.getSubjectContentFor(s.name);
      k.subjects.push({
        name: s.name, teacher: s.teacher,
        info: (c && c.notes) || s.info,
        hw: DataStore.getHomework().filter(function (h) { return (h.subject || '').toUpperCase() === s.name.toUpperCase(); })
      });
    });
    return k;
  }

  function getSubjectText() {
    var k = buildKnowledge();
    if (!k.subjects.length) return '';
    return k.subjects.map(function (s) {
      return s.name + ' (' + s.teacher + '): ' + (s.info || 'no notes yet') +
        (s.hw.length ? ' | homework: ' + s.hw.map(function (h) { return h.task; }).join('; ') : '');
    }).join('\n');
  }

  function quizQuestions() {
    return [
      { q: 'Which gas do plants absorb for photosynthesis?', opt: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], a: 1 },
      { q: 'What is the chemical symbol for gold?', opt: ['Gd', 'Go', 'Au', 'Ag'], a: 2 },
      { q: 'Who is the director of our school?', opt: ['Saroj Ma\'am', 'Rekha Kataria', 'Babulal Ji', 'Vishaka Maam'], a: 1 },
      { q: 'A triangle with all sides equal is called?', opt: ['Isosceles', 'Scalene', 'Equilateral', 'Right'], a: 2 },
      { q: 'Which chapter did NITIN score 49/50 in?', opt: ['Maths', 'Science', 'English', 'SST'], a: 0 }
    ];
  }

  /* ============ local answer engine ============ */
  function localAnswer(raw) {
    var q = raw.toLowerCase().replace(/[?.!]+$/g, '').trim();
    var k = buildKnowledge();

    if (q.indexOf('photosynthesis') !== -1) {
      return 'Photosynthesis is how plants make food! 🌱\n\n' +
        '• Plants take in **carbon dioxide** (CO₂) from air and **water** from soil\n' +
        '• Sunlight + chlorophyll (green pigment) power the reaction\n' +
        '• They produce **glucose** (food) and release **oxygen**\n\n' +
        'Equation: 6CO₂ + 6H₂O →(light)→ C₆H₁₂O₆ + 6O₂';
    }
    if (q.indexOf('who teaches') !== -1 || q.indexOf('teacher') !== -1) {
      var parts = q.split(/teaches|teacher/);
      var subj = parts[1] ? parts[1].trim().toUpperCase() : '';
      var t = k.teachers[subj];
      if (t) return t.subject + ' is taught by **' + t.name + '**. ' + (t.detail ? t.detail : '');
      return 'Our teachers:\n' + DataStore.getTeachers().map(function (t) {
        return '• **' + t.subject + '** — ' + t.name;
      }).join('\n');
    }
    if (q.indexOf('admin') !== -1) {
      return 'The admin is **VINAY KHILERI** 👑 and **NITIN** is the admin partner. They built this hub! The full admin pass is managed in the admin panel.';
    }
    // student lookup
    var names = Object.keys(k.students);
    var found = names.find(function (n) {
      return q.indexOf(n.toLowerCase()) !== -1;
    });
    if (found) {
      var p = k.students[found];
      if (p && typeof p === 'object' && (p.bio || p.strengths)) {
        return '**' + p.student_name + '**\n\n' +
          (p.bio ? '• Bio: ' + p.bio + '\n' : '') +
          (p.strengths ? '• Strengths: ' + p.strengths + '\n' : '') +
          (p.interests ? '• Interests: ' + p.interests + '\n' : '') +
          (p.goals ? '• Goals: ' + p.goals : '');
      }
      return found + ' is in Class 10-A! Their profile isn\'t set up yet.';
    }
    if (q.indexOf('homework') !== -1 || q.indexOf('hw') === 0 || q.indexOf('assignment') !== -1) {
      if (!k.homework.length) return 'No homework right now! 🎉 Enjoy the break.';
      return k.homework.map(function (h) {
        return '• **' + h.subject + '** — ' + String(h.task || '').split('\n')[0] + (h.due_date ? ' (due ' + h.due_date + ')' : '');
      }).join('\n') + '\n\nCheck the Homework or Subject Hub page for details!';
    }
    if (q.indexOf('econom') !== -1) {
      var eco = k.homework.find(function (h) { return (h.subject || '').toUpperCase() === 'ECONOMICS'; });
      return eco ? 'The Economics task: **' + eco.task.replace(/\n/g, ' ') + '** (due ' + (eco.due_date || 'soon') + ')' : 'No Economics homework found.';
    }
    if (q.indexOf('announcement') !== -1 || q.indexOf('annual') !== -1 || q.indexOf('function') !== -1) {
      if (!k.announcements.length) return 'No announcements right now.';
      return k.announcements.map(function (a) {
        return '• **' + a.title + '** — ' + a.body.replace(/\n/g, ' ');
      }).join('\n');
    }
    if (q.indexOf('poll') !== -1 || q.indexOf('favourite teacher') !== -1 || q.indexOf('favorite teacher') !== -1) {
      if (!k.polls.length) return 'No polls are live right now.';
      return k.polls.map(function (p) {
        return '• **' + p.question + '** — options: ' + (p.options || []).join(', ');
      }).join('\n') + '\n\nVote on the Polls page! 🗳️';
    }
    if (q.indexOf('score') !== -1 || q.indexOf('marks') !== -1 || q.indexOf('test') !== -1) {
      if (!k.scores.length) return 'No test scores recorded yet.';
      return k.scores.map(function (s) {
        return '• ' + s.student_name + ' — **' + s.subject + '** ' + s.score + '/' + s.max_score + ' (' + Math.round(s.score / s.max_score * 100) + '%)';
      }).join('\n');
    }
    if (q.indexOf('subject') !== -1 || q.indexOf('chapter') !== -1 || q.indexOf('syllabus') !== -1 || q.indexOf('notes') !== -1) {
      return 'Here is what we have per subject:\n\n' + getSubjectText() || 'Subject info is being added by the admin.';
    }
    // subject name direct
    var subjMatch = DataStore.getSubjects().find(function (s) { return q.indexOf(s.name.toLowerCase()) !== -1; });
    if (subjMatch) {
      var c = DataStore.getSubjectContentFor(subjMatch.name);
      return '**' + subjMatch.name + '** (taught by ' + subjMatch.teacher + ')\n\n' + ((c && c.notes) || subjMatch.info);
    }
    if (q.indexOf('study tip') !== -1 || q.indexOf('how to study') !== -1 || q.indexOf('advice') !== -1) {
      return 'Study tips for 10-A 📚\n\n' +
        '1. Study in **25-min focus sprints**, then 5-min breaks\n' +
        '2. Revise Maths formulas daily — 10 problems minimum\n' +
        '3. Read one English chapter every week\n' +
        '4. Use the Subject Hub notes before class tests\n' +
        '5. Sleep well — a fresh brain scores better! 😴';
    }
    if (q.indexOf('hello') !== -1 || q.indexOf('hi') === 0 || q.indexOf('hey') === 0) {
      return 'Hello, ' + USER.name + '! 👋 I\'m Class AI. Ask me about teachers, homework, scores, students, subjects — or start a quiz!';
    }
    if (q.indexOf('who are you') !== -1 || q.indexOf('what are you') !== -1) {
      return 'I\'m **Class AI** 🤖 — the AIA Class 10-A study companion. I can answer general study questions and I know our students, teachers, homework, scores, subjects and announcements. I can also quiz you!';
    }
    /* Small built-in general-knowledge set so the offline brain still answers
       common exam questions instead of refusing. This is a fallback only: the
       admin's API brain answers anything, so keep it short and factual. */
    var g = generalAnswer(q);
    if (g) return g;
    return 'Here\'s a solid answer:\n\nThat one is a general study question rather than something stored on this site, so I can\'t look it up in the class data. Try me on:\n\n' +
      '• "Who teaches Maths?"\n• "What homework is due?"\n• "Tell me about RUDRA"\n• "Start a quiz"\n• "What are the subject notes?"\n\n' +
      'For open-ended questions, ask the admin to switch on the **smart API brain** — it answers anything. 📚';
  }

  /* Built-in answers for common Class 10 general questions. Deliberately
     small and factual — the API brain handles everything else. */
  function generalAnswer(q) {
    var F = [
      [/pythagoras|hypotenuse/, 'Pythagoras theorem 📐\n\nIn a right triangle: **a² + b² = c²**, where c is the hypotenuse.\n\nExample: legs 3 and 4 → c² = 9 + 16 = 25 → **c = 5**.'],
      [/quadratic formula/, 'Quadratic formula ✏️\n\nFor **ax² + bx + c = 0**:\n\n**x = (−b ± √(b² − 4ac)) / 2a**\n\nThe part b² − 4ac is the *discriminant*: positive = 2 real roots, zero = 1, negative = no real roots.'],
      [/newton.{0,12}(second|2nd) law|f\s*=\s*ma/, 'Newton\'s Second Law ⚙️\n\n**F = m × a** — force equals mass times acceleration.\n\nA bigger force gives more acceleration; a heavier object accelerates less.'],
      [/photosynthesis/, 'Photosynthesis is how plants make food! 🌱\n\n• Plants take in **carbon dioxide** (CO₂) from air and **water** from soil\n• Sunlight + chlorophyll (green pigment) power the reaction\n• They produce **glucose** (food) and release **oxygen**\n\nEquation: 6CO₂ + 6H₂O →(light)→ C₆H₁₂O₆ + 6O₂'],
      [/ohm.{0,12}law|v\s*=\s*ir/, 'Ohm\'s Law ⚡\n\n**V = I × R** — voltage equals current times resistance.\n\nSo I = V/R and R = V/I.'],
      [/mole concept|avogadro/, 'Mole concept 🧪\n\nOne mole = **6.022 × 10²³** particles (Avogadro\'s number).\n\nMoles = mass ÷ molar mass.'],
      [/study tip|how to study|advice/, 'Study tips for 10-A 📚\n\n' +
        '1. Study in **25-min focus sprints**, then 5-min breaks\n' +
        '2. Revise Maths formulas daily — 10 problems minimum\n' +
        '3. Read one English chapter every week\n' +
        '4. Use the Subject Hub notes before class tests\n' +
        '5. Sleep well — a fresh brain scores better! 😴']
    ];
    for (var i = 0; i < F.length; i++) if (F[i][0].test(q)) return F[i][1];
    return null;
  }

  /* ============ quiz mode ============ */
  function startQuiz() {
    var qs = quizQuestions();
    quiz = { qs: qs, i: 0, score: 0, active: true };
    messagesEl.appendChild(msgBubble('Class AI', 'Quiz time! 🧠 Answer with **1**, **2**, **3** or **4**. I\'ll ask 5 questions. Type "skip" to move on or "stop" to end.', 'ai'));
    renderSuggested([]);
    nextQuiz();
  }
  function nextQuiz() {
    if (!quiz) return;
    if (quiz.i >= quiz.qs.length) {
      messagesEl.appendChild(msgBubble('Class AI', 'Quiz complete! 🎉 You scored **' + quiz.score + '/' + quiz.qs.length + '**.\n\nType "start a quiz" to go again!', 'ai'));
      quiz = null;
      renderSuggested(suggestions.quiz);
      return;
    }
    var item = quiz.qs[quiz.i];
    messagesEl.appendChild(msgBubble('Class AI', 'Q' + (quiz.i + 1) + ': ' + item.q + '\n\n' + item.opt.map(function (o, oi) { return (oi + 1) + '. ' + o; }).join('\n'), 'ai'));
  }
  function handleQuizAnswer(raw) {
    if (!quiz || !quiz.active) return false;
    var t = raw.toLowerCase().trim();
    if (t === 'stop') {
      messagesEl.appendChild(msgBubble('Class AI', 'Quiz stopped. You scored ' + quiz.score + ' so far. Type "start a quiz" anytime!', 'ai'));
      quiz = null;
      return true;
    }
    if (t === 'skip') {
      messagesEl.appendChild(msgBubble('Class AI', 'Skipping! The answer was **' + quiz.qs[quiz.i].opt[quiz.qs[quiz.i].a] + '**', 'ai'));
      quiz.i++;
      nextQuiz();
      return true;
    }
    if (t === '1' || t === '2' || t === '3' || t === '4') {
      var chosen = parseInt(t, 10) - 1;
      if (chosen === quiz.qs[quiz.i].a) {
        quiz.score++;
        messagesEl.appendChild(msgBubble('Class AI', '✅ Correct! Well done.', 'ai'));
      } else {
        messagesEl.appendChild(msgBubble('Class AI', '❌ Not quite — the answer is **' + quiz.qs[quiz.i].opt[quiz.qs[quiz.i].a] + '**', 'ai'));
      }
      quiz.i++;
      nextQuiz();
      return true;
    }
    return false;
  }

  /* ============ live site context (API engine) ============ */
  /* The API brain is told everything the site knows. Rebuilt from DataStore
     on every question so the answer reflects the latest synced state —
     announcements posted a second ago, a teacher just renamed in the admin
     panel, homework added from another phone. */
  function buildSiteContext() {
    var L = [];
    var meta = (window.SEED && window.SEED.meta) || {};
    L.push('SITE: ' + (meta.site_name || 'AIA Class 10-A Hub'));
    L.push('SCHOOL: ' + (meta.school || '') + ' | CLASS: ' + (meta.class || '') + ' | ADMIN: ' + (meta.admin_name || ''));
    L.push('You are the friendly class assistant inside this site. You are a helpful general study assistant FIRST: answer any question a Class 10 student asks — science, maths, English, history, exam technique, general knowledge, everyday questions — using your own knowledge, in a short, clear, exam-focused way.');
    L.push('The SITE DATA below is the single source of truth for anything about THIS class: student names, teachers, leadership, homework, scores, polls, announcements, subjects and PYQ papers. Use it exactly and never invent or guess those class-specific facts. If a class detail is genuinely not listed below, say you do not have it yet.');
    L.push('For everything that is not a class-specific fact, you MUST answer normally from your own knowledge. Never refuse a general question, and never say you only know class data.');

    try {
      var teachers = DataStore.getTeachers() || [];
      L.push('\nTEACHERS (' + teachers.length + '):');
      teachers.forEach(function (t) {
        L.push('- ' + (t.subject || '?') + ': ' + (t.name || '?') + (t.detail ? ' — ' + t.detail : ''));
      });
    } catch (e) {}

    try {
      var lead = DataStore.getLeadership() || [];
      if (lead.length) {
        L.push('\nLEADERSHIP:');
        lead.forEach(function (p) { L.push('- ' + (p.role || '') + ': ' + (p.name || '')); });
      }
    } catch (e) {}

    try {
      var subs = DataStore.getSubjects() || [];
      if (subs.length) {
        L.push('\nSUBJECTS & NOTES:');
        subs.forEach(function (s) {
          var c = DataStore.getSubjectContentFor(s.name);
          L.push('- ' + s.name + ' (teacher ' + s.teacher + '): ' + ((c && c.notes) || s.info || 'no notes'));
        });
      }
    } catch (e) {}

    try {
      var students = DataStore.getStudents() || [];
      var profiles = DataStore.getStudentProfiles() || [];
      var byName = {};
      profiles.forEach(function (p) { if (p && p.student_name) byName[String(p.student_name).toUpperCase()] = p; });
      L.push('\nSTUDENTS (' + students.length + '): ' + students.join(', '));
      var withProfile = Object.keys(byName);
      if (withProfile.length) {
        L.push('STUDENT PROFILES:');
        withProfile.forEach(function (n) {
          var p = byName[n];
          var bits = [];
          if (p.bio) bits.push('bio: ' + p.bio);
          if (p.strengths) bits.push('strengths: ' + p.strengths);
          if (p.interests) bits.push('interests: ' + p.interests);
          if (p.goals) bits.push('goals: ' + p.goals);
          if (bits.length) L.push('- ' + p.student_name + ': ' + bits.join(' | '));
        });
      }
    } catch (e) {}

    try {
      var hw = DataStore.getHomework() || [];
      L.push('\nHOMEWORK (' + hw.length + '):');
      if (!hw.length) L.push('- none right now');
      hw.slice(0, 40).forEach(function (h) {
        L.push('- ' + (h.subject || '') + ': ' + String(h.task || '').replace(/\s+/g, ' ').slice(0, 200) +
          (h.due_date ? ' (due ' + h.due_date + ')' : ''));
      });
    } catch (e) {}

    try {
      var ann = DataStore.getAnnouncements() || [];
      L.push('\nANNOUNCEMENTS (' + ann.length + '):');
      if (!ann.length) L.push('- none right now');
      ann.slice(-20).forEach(function (a) {
        L.push('- ' + (a.title || '') + ': ' + String(a.body || '').replace(/\s+/g, ' ').slice(0, 300));
      });
    } catch (e) {}

    try {
      var polls = DataStore.getPolls() || [];
      if (polls.length) {
        L.push('\nPOLLS:');
        polls.forEach(function (p) {
          var counts = DataStore.pollCounts ? DataStore.pollCounts(p.id) : null;
          L.push('- ' + (p.question || '') + ' | options: ' + (p.options || []).join(', ') +
            (counts ? ' | votes: ' + JSON.stringify(counts) : ''));
        });
      }
    } catch (e) {}

    try {
      var scores = DataStore.getTestScores() || [];
      if (scores.length) {
        L.push('\nTEST SCORES:');
        scores.slice(-60).forEach(function (s) {
          var pct = s.max_score ? Math.round(s.score / s.max_score * 100) : '';
          L.push('- ' + (s.student_name || '') + ' | ' + (s.subject || '') + ' | ' + (s.test_name || '') +
            ' | ' + s.score + '/' + s.max_score + (pct !== '' ? ' (' + pct + '%)' : ''));
        });
      }
    } catch (e) {}

    try {
      var pyqs = DataStore.getPyqs() || [];
      if (pyqs.length) {
        var byKind = {};
        pyqs.forEach(function (p) {
          var k = p.kind || 'other';
          byKind[k] = byKind[k] || [];
          byKind[k].push(p.subject + (p.year ? ' ' + p.year : ''));
        });
        L.push('\nPYQ PAPERS (' + pyqs.length + ' total) — students practise these on the PYQs page:');
        Object.keys(byKind).forEach(function (k) {
          L.push('- ' + k + ': ' + byKind[k].join(', '));
        });
      }
    } catch (e) {}

    try {
      var chat = DataStore.getClassChat() || [];
      if (chat.length) {
        L.push('\nRECENT CLASS CHAT (latest ' + Math.min(chat.length, 12) + '):');
        chat.slice(-12).forEach(function (m) {
          L.push('- ' + (m.name || m.username || '?') + ': ' + String(m.content || '').replace(/\s+/g, ' ').slice(0, 160));
        });
      }
    } catch (e) {}

    try {
      L.push('\nTODAY: ' + new Date().toDateString());
      L.push('CURRENT USER: ' + USER.name + ' (' + USER.role + ')');
    } catch (e) {}

    return L.join('\n');
  }

  /* ============ API engine ============ */
  /* Exposed so other pages (and tests) can inspect exactly what the AI is
     told about the site. */
  window.AiaContext = { build: buildSiteContext };

  function apiAnswer(raw, done) {
    /* A student with no key of their own can still reach the class AI when
       the admin has chosen to share it. */
    var cfg = config;
    if (!cfg || !cfg.apiKey) {
      var shared = DataStore.getAiSharedConfig ? DataStore.getAiSharedConfig() : null;
      if (shared) cfg = shared;
    }
    if (!cfg || !cfg.apiKey) { done(localAnswer(raw)); return; }
    /* Rebuild the site context now, not at page load, so the reply reflects
       whatever synced in since — including a just-posted announcement. */
    var prompt = (cfg.systemPrompt || '') + '\n\n' + buildSiteContext();
    AiaApi.chat(cfg, raw, prompt)
      .then(function (text) { done(text); })
      .catch(function (err) {
        done('\u26a0\ufe0f **API brain error:** ' + err.message +
          '\n\nMeanwhile here is my local answer:\n\n' + localAnswer(raw));
      });
  }

  /* ============ send pipeline ============ */
  function send() {
    var text = inputEl.value.trim();
    if (!text || busy) return;
    busy = true;
    inputEl.value = '';
    DataStore.addAiMessage(HISTORY_KEY, 'user', text);
    try { DataStore.logAction('ai', 'Asked the AI a question', 'ai.html'); } catch (e) {}
    messagesEl.appendChild(msgBubble(USER.name, text, 'user'));
    showTyping();

    setTimeout(function () {
      var matchedQuiz = handleQuizAnswer(text);
      if (matchedQuiz) { hideTyping(); busy = false; saveHistory(); scrollBottom(); return; }
      if (/start a quiz|quiz me|quiz on|begin quiz|quiz$/.test(text.toLowerCase())) {
        hideTyping();
        startQuiz();
        busy = false;
        saveHistory();
        scrollBottom();
        return;
      }
      var replyFn = function (answer) {
        hideTyping();
        DataStore.addAiMessage(HISTORY_KEY, 'ai', answer);
        messagesEl.appendChild(msgBubble('Class AI', answer, 'ai'));
        busy = false;
        saveHistory();
        scrollBottom();
      };
      apiAnswer(text, replyFn);
    }, 500 + Math.random() * 400);
  }

  function showTyping() {
    var t = document.createElement('div');
    t.className = 'chat-msg ai typing';
    t.id = 'typingMsg';
    t.innerHTML = '<div class="chat-msg-meta"><span class="chat-msg-author">Class AI</span></div><div class="typing-indicator"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(t);
    scrollBottom();
  }
  function hideTyping() {
    var t = document.getElementById('typingMsg');
    if (t) t.remove();
  }

  function msgBubble(author, text, who) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + who;
    div.innerHTML = '<div class="chat-msg-meta"><span class="chat-msg-author">' + App.escapeHtml(author) + '</span><span class="chat-msg-time">' +
      new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) + '</span></div>' +
      '<div class="chat-msg-body md">' + mdLite(text) + '</div>';
    return div;
  }

  /* ============ markdown-lite ============ */
  function mdLite(text) {
    var s = App.escapeHtml(text);
    s = s.replace(/^### (.*)$/gm, '<h4>$1</h4>');
    s = s.replace(/^## (.*)$/gm, '<h4>$1</h4>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/`(.+?)`/g, '<code>$1</code>');
    s = s.replace(/^- (.*)$/gm, '<li>$1</li>');
    s = s.replace(/((?:<li>.*<\/li>(?:\r?\n)?)+)/g, '<ul>$1</ul>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  /* ============ mode + history ============ */
  function setMode(m) {
    mode = m;
    DataStore.setChatMode(m);
    document.querySelectorAll('.chat-mode-chip').forEach(function (chip) {
      chip.classList.toggle('active', chip.getAttribute('data-mode') === m);
    });
    renderSuggested(suggestions[m] || []);
    if (m === 'quiz' && !quiz) {
      messagesEl.innerHTML = '';
      messagesEl.appendChild(msgBubble('Class AI', 'Quiz Bot ready! 🧠 Type **"start a quiz"** or pick a topic: Science, Maths, Class facts.', 'ai'));
    }
  }

  function renderSuggested(list) {
    chipsEl.innerHTML = '';
    list.forEach(function (s) {
      var chip = document.createElement('button');
      chip.className = 'suggest-chip';
      chip.textContent = s;
      chip.addEventListener('click', function () {
        inputEl.value = s;
        send();
      });
      chipsEl.appendChild(chip);
    });
  }

  function saveHistory() {
    // history already persisted via DataStore.addAiMessage
  }

  function renderHistory() {
    var history = DataStore.getAiHistory(HISTORY_KEY);
    if (!history.length && mode !== 'quiz') {
      messagesEl.innerHTML = '';
      messagesEl.appendChild(msgBubble('Class AI', 'Hey ' + USER.name + '! 👋 I\'m **Class AI**.\n\nI can answer class questions, explain topics, show homework, or quiz you. Try the suggestion chips below!', 'ai'));
      return;
    }
    messagesEl.innerHTML = '';
    history.forEach(function (m) {
      messagesEl.appendChild(msgBubble(m.role === 'user' ? USER.name : 'Class AI', m.content, m.role));
    });
    scrollBottom();
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /* ============ events ============ */
  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  clearBtn.addEventListener('click', function () {
    DataStore.clearAiHistory(HISTORY_KEY);
    App.showToast('Your chat history cleared', 'info');
    renderHistory();
  });
  document.querySelectorAll('.chat-mode-chip').forEach(function (chip) {
    chip.addEventListener('click', function () { setMode(chip.getAttribute('data-mode')); });
  });

  /* ============ boot ============ */
  config = DataStore.getAiConfig();
  /* The shared config can land after this page loaded, so re-read it when
     the relay reports a change. */
  function refreshConfig() { try { config = DataStore.getAiConfig(); } catch (e) {} }
  document.addEventListener('aia-sync-applied', refreshConfig);
  setMode(mode);
  renderHistory();
})();