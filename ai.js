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
      return 'I\'m **Class AI** 🤖 — the AIA Class 10-A study companion. I know our students, teachers, homework, scores, subjects and announcements. I can also quiz you!';
    }
    return 'Good question! 🤔 I\'m best with things like:\n\n' +
      '• "Who teaches Maths?"\n• "What homework is due?"\n• "Tell me about RUDRA"\n• "Start a quiz"\n• "What are the subject notes?"\n\n' +
      'Or ask our **smart API brain** (if the admin enabled it) for anything at all!';
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

  /* ============ API engine ============ */
  function apiAnswer(raw, done) {
    if (!config || !config.apiKey) { done(localAnswer(raw)); return; }
    AiaApi.chat(config, raw, config.systemPrompt)
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
  setMode(mode);
  renderHistory();
})();