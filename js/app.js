/* Echo English - application logic */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var appRoot = $('#app');
  var modalRoot = $('#modal-root');
  var toastRoot = $('#toast-root');
  var popover = $('#word-popover');

  var STORAGE_KEY = 'echo_english_state_v1';
  var DICT_CACHE_KEY = 'echo_english_dict_cache_v1';

  var DEFAULT_STATE = {
    version: 1,
    theme: 'light',
    settings: {
      rate: 0.92,
      voiceURI: '',
      autoSpeak: true,
      showZh: false,
      accent: 'en-US',
      dailyGoal: 3,
      onlineDict: true
    },
    completedArticles: [],
    articleProgress: {},
    quizScores: {},
    words: {},
    dialogueProgress: {},
    activity: {},
    daily: { date: '', tasks: { read: false, speak: false, vocab: false }, minutes: 0 }
  };

  function mergeDeep(base, extra) {
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (extra === null || typeof extra !== 'object') return out;
    Object.keys(extra).forEach(function (key) {
      var value = extra[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof out[key] === 'object' && out[key] !== null) {
        out[key] = mergeDeep(out[key], value);
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return mergeDeep(DEFAULT_STATE, {});
      return mergeDeep(DEFAULT_STATE, JSON.parse(raw));
    } catch (error) {
      return mergeDeep(DEFAULT_STATE, {});
    }
  }

  var state = loadState();
  var uiState = {
    articleFocus: {},
    readerToken: 0,
    currentWord: null,
    dialogueSession: null,
    reviewQueue: [],
    reviewIndex: 0,
    reviewFlipped: false,
    page: 'today'
  };

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* ignore */ }
  }

  function todayKey(date) {
    var d = date || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function dateOffset(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return todayKey(d);
  }

  function formatDate(dateStr) {
    if (dateStr === '') return '';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[0] + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';
  }

  function ensureDaily() {
    var today = todayKey();
    if (state.daily === null || state.daily.date !== today) {
      state.daily = { date: today, tasks: { read: false, speak: false, vocab: false }, minutes: 0 };
      saveState();
    }
  }

  function addActivity(count) {
    ensureDaily();
    var today = todayKey();
    state.activity[today] = (state.activity[today] || 0) + (count || 1);
    state.daily.minutes = (state.daily.minutes || 0) + (count || 1);
    saveState();
  }

  function completeTask(key) {
    ensureDaily();
    if (state.daily.tasks[key] === false || state.daily.tasks[key] === undefined) {
      state.daily.tasks[key] = true;
      addActivity(1);
      saveState();
    }
  }

  function currentStreak() {
    var streak = 0;
    var d = new Date();
    for (var i = 0; i < 400; i++) {
      var key = todayKey(d);
      if (state.activity[key]) {
        streak += 1;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[’']/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getArticle(id) {
    return (window.ARTICLES || []).filter(function (item) { return item.id === id; })[0] || null;
  }

  function getDialogue(id) {
    return (window.DIALOGUES || []).filter(function (item) { return item.id === id; })[0] || null;
  }

  function buildVocabIndex() {
    var index = {};
    (window.ARTICLES || []).forEach(function (article) {
      (article.vocab || []).forEach(function (item) {
        var key = normalizeText(item.word);
        if (key) index[key] = Object.assign({}, item, { source: article.id });
      });
    });
    Object.keys(window.CORE_DICTIONARY || {}).forEach(function (key) {
      var normalized = normalizeText(key);
      if (normalized) index[normalized] = Object.assign({}, window.CORE_DICTIONARY[key], { word: key });
    });
    return index;
  }

  var vocabIndex = buildVocabIndex();

  function lookupLocal(rawWord) {
    var word = String(rawWord || '').toLowerCase().replace(/[^a-z'’-]/g, '');
    if (word === '') return null;
    var candidates = [word];
    if (word.endsWith('ies') && word.length > 4) candidates.push(word.slice(0, -3) + 'y');
    if (word.endsWith('es') && word.length > 3) candidates.push(word.slice(0, -2));
    if (word.endsWith('s') && word.length > 3) candidates.push(word.slice(0, -1));
    if (word.endsWith('ing') && word.length > 5) candidates.push(word.slice(0, -3));
    if (word.endsWith('ed') && word.length > 4) candidates.push(word.slice(0, -2));
    if (word.endsWith('er') && word.length > 4) candidates.push(word.slice(0, -2));
    if (word.endsWith('est') && word.length > 5) candidates.push(word.slice(0, -3));
    for (var i = 0; i < candidates.length; i++) {
      var found = vocabIndex[normalizeText(candidates[i])];
      if (found) return Object.assign({}, found, { query: rawWord });
    }
    return null;
  }

  function dictCacheRead() {
    try { return JSON.parse(localStorage.getItem(DICT_CACHE_KEY)) || {}; } catch (error) { return {}; }
  }

  function dictCacheWrite(cache) {
    try { localStorage.setItem(DICT_CACHE_KEY, JSON.stringify(cache)); } catch (error) { /* ignore */ }
  }

  function timedFetch(url, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms || 3800);
      fetch(url).then(function (res) {
        clearTimeout(timer);
        if (res.ok === false) throw new Error('http');
        return res.json();
      }).then(resolve).catch(function (err) { clearTimeout(timer); reject(err); });
    });
  }

  function lookupOnline(word) {
    var clean = String(word || '').trim().toLowerCase();
    if (clean === '') return Promise.resolve(null);
    var cache = dictCacheRead();
    if (cache[clean]) return Promise.resolve(cache[clean]);
    var base = { word: word, phonetic: '', pos: '', meaning: '', example: '', exampleZh: '', source: 'online' };
    var meaningPromise = state.settings.onlineDict ? timedFetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(clean) + '&langpair=en|zh-CN', 4200).then(function (data) {
      var translated = data && data.responseData && data.responseData.translatedText;
      if (translated) base.meaning = translated;
      return base;
    }).catch(function () { return base; }) : Promise.resolve(base);
    var dictPromise = timedFetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(clean), 4200).then(function (data) {
      var entry = Array.isArray(data) ? data[0] : null;
      if (entry === null || entry === undefined) return base;
      var phonetic = entry.phonetic || (entry.phonetics || []).map(function (p) { return p.text; }).filter(Boolean)[0] || '';
      if (phonetic) base.phonetic = phonetic;
      var meaning = entry.meanings && entry.meanings[0];
      if (meaning) {
        base.pos = meaning.partOfSpeech || '';
        var def = meaning.definitions && meaning.definitions[0];
        if (def) base.example = def.example || '';
      }
      return base;
    }).catch(function () { return base; });
    return Promise.all([meaningPromise, dictPromise]).then(function () {
      if (base.meaning || base.phonetic || base.example) cache[clean] = base;
      dictCacheWrite(cache);
      return base;
    });
  }

  function lookupWord(word) {
    var local = lookupLocal(word);
    if (local && local.meaning) return Promise.resolve(local);
    return lookupOnline(word).then(function (online) {
      if (online && online.meaning) {
        return Object.assign({}, local || {}, online, { word: (local && local.word) || word });
      }
      return local || { word: word, meaning: '暂未收录，可尝试联网查询', source: 'none' };
    });
  }

  var synth = window.speechSynthesis || null;
  var allVoices = [];
  var SCARY_VOICE_NAMES = ['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good news', 'hysterical', 'jester', 'junior', 'pipe organ', 'princess', 'ralph', 'trinoids', 'whisper', 'wobble', 'zarvox'];
  var NATURAL_VOICE_HINTS = ['samantha', 'ava', 'allison', 'susan', 'karen', 'daniel', 'serena', 'tessa', 'moira', 'fiona', 'kate', 'oliver', 'alex', 'google us english', 'google uk english', 'microsoft aria', 'microsoft jenny', 'microsoft guy', 'microsoft zira', 'microsoft mark', 'microsoft david', 'microsoft hazel', 'microsoft george', 'microsoft libby', 'microsoft ryan', 'microsoft sonia', 'natural'];

  function loadVoices() {
    if (synth === null) return;
    allVoices = synth.getVoices() || [];
  }

  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  function voiceIsScary(voice) {
    var name = String((voice && voice.name) || '').toLowerCase();
    return SCARY_VOICE_NAMES.some(function (bad) { return name.indexOf(bad) >= 0; });
  }

  function voiceScore(voice) {
    if (voiceIsScary(voice)) return -1000;
    var name = String((voice && voice.name) || '').toLowerCase();
    var score = 0;
    if (name.indexOf('natural') >= 0 || name.indexOf('online') >= 0) score += 50;
    NATURAL_VOICE_HINTS.forEach(function (hint, index) {
      if (name.indexOf(hint) >= 0) score += 100 - Math.min(index, 30);
    });
    if (name.indexOf('google') >= 0 && name.indexOf('english') >= 0) score += 45;
    if (name.indexOf('microsoft') >= 0) score += 20;
    if (voice.localService === false) score += 4;
    return score;
  }

  function pickVoice(lang) {
    loadVoices();
    if (state.settings.voiceURI) {
      var chosen = allVoices.filter(function (voice) { return voice.voiceURI === state.settings.voiceURI; })[0];
      if (chosen && voiceIsScary(chosen) === false) return chosen;
    }
    var target = String(lang || state.settings.accent || 'en-US').replace('_', '-');
    var base = target.split('-')[0];
    var english = allVoices.filter(function (voice) { return /^en/i.test(voice.lang || ''); });
    if (english.length === 0) return null;
    var exact = english.filter(function (voice) { return String(voice.lang || '').replace('_', '-').indexOf(target) === 0; });
    var same = english.filter(function (voice) { return String(voice.lang || '').replace('_', '-').indexOf(base) === 0; });
    var groups = [exact, same, english];
    for (var i = 0; i < groups.length; i++) {
      var pool = groups[i].slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
      var good = pool.filter(function (voice) { return voiceScore(voice) > -100; });
      if (good.length) return good[0];
    }
    return english[0] || null;
  }

  function speak(text, options) {
    options = options || {};
    if (synth === null || text === '') return Promise.resolve();
    return new Promise(function (resolve) {
      if (options.cancel !== false) synth.cancel();
      var utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = options.lang || state.settings.accent || 'en-US';
      utterance.rate = options.rate || state.settings.rate || 0.92;
      utterance.pitch = options.pitch || 1;
      var voice = pickVoice(utterance.lang);
      if (voice) utterance.voice = voice;
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        if (typeof options.onEnd === 'function') options.onEnd();
        resolve();
      }
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    });
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
  }

  var activeRecognition = null;

  function speechSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  function startListening(handlers) {
    handlers = handlers || {};
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Recognition === undefined || Recognition === null) {
      if (handlers.onError) handlers.onError('not-supported');
      return null;
    }
    if (activeRecognition) {
      try { activeRecognition.abort(); } catch (error) { /* ignore */ }
    }
    var recognition = new Recognition();
    activeRecognition = recognition;
    recognition.lang = handlers.lang || state.settings.accent || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = false;
    recognition.onstart = function () { if (handlers.onStart) handlers.onStart(); };
    recognition.onresult = function (event) {
      var results = [];
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var result = event.results[i];
        results.push({ transcript: result[0].transcript, confidence: result[0].confidence || 0 });
      }
      if (handlers.onResult) handlers.onResult(results);
    };
    recognition.onerror = function (event) {
      if (handlers.onError) handlers.onError(event.error || 'error');
    };
    recognition.onend = function () {
      activeRecognition = null;
      if (handlers.onEnd) handlers.onEnd();
    };
    try { recognition.start(); } catch (error) { if (handlers.onError) handlers.onError('start-failed'); }
    return recognition;
  }

  function stopListening() {
    if (activeRecognition) {
      try { activeRecognition.stop(); } catch (error) { /* ignore */ }
    }
  }

  function toast(message, type) {
    if (toastRoot === null) return;
    var node = document.createElement('div');
    node.className = 'toast ' + (type || '');
    node.textContent = message;
    toastRoot.appendChild(node);
    setTimeout(function () { node.style.opacity = '0'; node.style.transform = 'translateY(8px)'; }, 2400);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 2800);
  }

  function openModal(html) {
    if (modalRoot === null) return;
    modalRoot.innerHTML = '<div class="modal">' + html + '</div>';
    modalRoot.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (modalRoot === null) return;
    modalRoot.hidden = true;
    modalRoot.innerHTML = '';
    document.body.style.overflow = '';
  }

  function modalShell(title, body, foot) {
    return '<div class="modal-head"><h3>' + title + '</h3><button class="x-btn" data-action="close-modal">✕</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      (foot ? '<div class="modal-foot">' + foot + '</div>' : '');
  }

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function navKeyFromRoute(hash) {
    var clean = (hash || '').replace(/^#/, '');
    if (clean.indexOf('/reading') === 0 || clean.indexOf('/article/') === 0) return 'reading';
    if (clean.indexOf('/speaking') === 0 || clean.indexOf('/dialogue/') === 0) return 'speaking';
    if (clean.indexOf('/vocab') === 0) return 'vocab';
    if (clean.indexOf('/progress') === 0) return 'progress';
    if (clean.indexOf('/settings') === 0) return 'settings';
    return 'today';
  }

  var NAV_ITEMS = [
    { key: 'today', href: '#/today', icon: '◒', label: '今日练习' },
    { key: 'reading', href: '#/reading', icon: '📰', label: '英文阅读' },
    { key: 'speaking', href: '#/speaking', icon: '🎙️', label: '口语对话' },
    { key: 'vocab', href: '#/vocab', icon: '🃏', label: '生词复习' },
    { key: 'progress', href: '#/progress', icon: '📈', label: '学习进度' },
    { key: 'settings', href: '#/settings', icon: '⚙️', label: '设置' }
  ];

  function renderShell(activeKey, content) {
    var theme = state.theme || 'light';
    var now = Date.now();
    var dueWords = Object.keys(state.words).filter(function (key) { return state.words[key].due && state.words[key].due <= now; }).length;
    var navHtml = NAV_ITEMS.map(function (item) {
      var badge = item.key === 'vocab' && dueWords ? '<span class="nav-badge">' + dueWords + '</span>' : '';
      return '<a class="nav-item ' + (activeKey === item.key ? 'active' : '') + '" href="' + item.href + '" data-nav="' + item.key + '"><span class="nav-icon">' + item.icon + '</span><span>' + item.label + '</span>' + badge + '</a>';
    }).join('');
    appRoot.className = 'app-shell';
    appRoot.innerHTML =
      '<div class="layout">' +
        '<aside class="sidebar" id="sidebar">' +
          '<div class="brand"><div class="brand-mark">🎧</div><div class="brand-copy"><strong>Echo English</strong><small>每天 15 分钟，让英语变成环境</small></div></div>' +
          '<div class="side-streak"><span class="fire">🔥</span><div><strong>' + currentStreak() + ' 天连续</strong><small>今天也来练一会儿</small></div></div>' +
          '<nav class="nav">' + navHtml + '</nav>' +
          '<div class="sidebar-footer">' +
            '<div class="mini-tip">建议：先读一篇新闻，再进行 1 段口语对话，最后复习生词。</div>' +
            '<div class="side-actions"><button class="icon-btn" data-action="toggle-theme" title="切换主题">' + (theme === 'dark' ? '☀️' : '🌙') + '</button><button class="icon-btn" data-action="open-help" title="使用帮助">?</button></div>' +
          '</div>' +
        '</aside>' +
        '<main class="main">' +
          '<div class="topbar"><button class="icon-btn" data-action="toggle-sidebar">☰</button><div class="brand"><div class="brand-mark">🎧</div><div class="brand-copy"><strong>Echo English</strong></div></div><div style="width:38px"></div></div>' +
          '<div id="page-content">' + content + '</div>' +
        '</main>' +
      '</div>' +
      '<nav class="mobile-nav">' + NAV_ITEMS.slice(0, 5).map(function (item) {
        return '<a class="' + (activeKey === item.key ? 'active' : '') + '" href="' + item.href + '"><span>' + item.icon + '</span>' + item.label.replace('练习', '').replace('复习', '') + '</a>';
      }).join('') + '</nav>';
    document.documentElement.setAttribute('data-theme', theme);
    var sidebar = $('#sidebar');
    var toggle = $('[data-action="toggle-sidebar"]');
    if (toggle && sidebar) {
      toggle.addEventListener('click', function () { sidebar.classList.toggle('open'); });
    }
    $$('[data-action="toggle-theme"]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        saveState();
        renderShell(activeKey, content);
        bindCurrentPage();
      });
    });
  }

  var pageBinder = null;

  function bindCurrentPage() {
    if (typeof pageBinder === 'function') pageBinder();
  }

  function mountPage(activeKey, content, binder) {
    renderShell(activeKey, content);
    pageBinder = binder || null;
    bindCurrentPage();
    try { window.scrollTo(0, 0); } catch (error) { /* ignore */ }
  }

  function articleCardHtml(article) {
    var done = state.completedArticles.indexOf(article.id) >= 0;
    return '<a class="card card-hover article-card" href="#/article/' + article.id + '" data-level="' + article.level + '" data-topic="' + escapeAttr(article.topic) + '" data-search="' + escapeAttr((article.title + ' ' + article.summary + ' ' + article.topic).toLowerCase()) + '">' +
      '<div class="emoji">' + article.icon + '</div>' +
      '<div><h3>' + escapeHtml(article.title) + '</h3></div>' +
      '<p>' + escapeHtml(article.summary) + '</p>' +
      '<div class="article-meta">' +
        '<span class="chip level-' + article.level + '">' + article.level + '</span>' +
        '<span>📖 ' + article.minutes + ' 分钟</span>' +
        '<span>#' + escapeHtml(article.topic) + '</span>' +
        (done ? '<span class="chip done">已读完</span>' : '') +
      '</div>' +
    '</a>';
  }

  function dialogueCardHtml(dialogue, compact) {
    var progress = state.dialogueProgress[dialogue.id];
    var active = uiState.dialogueSession && uiState.dialogueSession.dialogueId === dialogue.id;
    return '<button class="dialogue-card ' + (active ? 'active' : '') + '" data-action="open-dialogue" data-id="' + dialogue.id + '">' +
      '<div class="d-top"><span class="d-icon">' + dialogue.icon + '</span><span><strong>' + escapeHtml(dialogue.title) + '</strong><small>' + escapeHtml(dialogue.scene) + ' · ' + dialogue.level + ' · ' + dialogue.minutes + ' 分钟</small></span></div>' +
      (compact ? '' : '<div style="margin-top:8px;color:var(--muted);font-size:12px;line-height:1.5;">' + escapeHtml(dialogue.goal) + '</div>') +
      (progress && progress.completed ? '<div style="margin-top:8px;"><span class="chip done">已完成 · 最佳 ' + progress.bestScore + ' 分</span></div>' : '') +
    '</button>';
  }

  function taskRowHtml(key, icon, name, sub) {
    ensureDaily();
    var done = state.daily.tasks[key];
    return '<button class="task-row ' + (done ? 'done' : '') + '" data-action="go-task" data-task="' + key + '">' +
      '<span class="task-check">' + (done ? '✓' : '') + '</span>' +
      '<span><span class="task-name">' + icon + ' ' + name + '</span><span class="task-sub">' + sub + '</span></span>' +
      '<span class="task-arrow">›</span>' +
    '</button>';
  }

  function todayPage() {
    ensureDaily();
    var today = todayKey();
    var doneCount = ['read', 'speak', 'vocab'].filter(function (key) { return state.daily.tasks[key]; }).length;
    var goal = state.settings.dailyGoal || 3;
    var percent = clamp(Math.round((doneCount / goal) * 100), 0, 100);
    var readDone = state.completedArticles.length;
    var wordCount = Object.keys(state.words).length;
    var dialogueCount = Object.keys(state.dialogueProgress).filter(function (id) { return state.dialogueProgress[id].completed; }).length;
    var recommended = (window.ARTICLES || []).filter(function (article) { return state.completedArticles.indexOf(article.id) < 0; }).slice(0, 3);
    if (recommended.length < 3) recommended = (window.ARTICLES || []).slice(0, 3);
    var recommendedDialogue = (window.DIALOGUES || [])[Object.keys(state.dialogueProgress).filter(function (id) { return state.dialogueProgress[id].completed; }).length % (window.DIALOGUES || []).length] || (window.DIALOGUES || [])[0];
    var hour = new Date().getHours();
    var greeting = hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    return '<div class="page">' +
      '<div class="page-head"><div><div class="eyebrow">Daily Practice</div><h1 class="page-title">' + greeting + '，今天想让英语发生什么？</h1><p class="page-sub">不用等语言环境。读一篇真实风格新闻，完成一段情景对话，再复习几个生词，今天就已经在进步。</p></div><div class="head-actions"><a class="btn btn-primary" href="#/reading">开始今日阅读</a><a class="btn btn-ghost" href="#/speaking">去练口语</a></div></div>' +
      '<div class="dashboard-grid">' +
        '<section class="card hero-card">' +
          '<div class="eyebrow" style="color:rgba(255,255,255,0.72)">今日推荐</div>' +
          '<h2>把输入变成输出：读一段，讲一段。</h2>' +
          '<p>建议每次练习 15 分钟：5 分钟精读，5 分钟跟读或对话，5 分钟复习。坚持比一次学很多更有效。</p>' +
          '<div class="hero-actions"><a class="btn btn-primary" href="#/article/' + (recommended[0] ? recommended[0].id : 'ai-tutor') + '">开始精读</a><a class="btn btn-ghost" href="#/speaking">打开口语练习</a></div>' +
          '<div class="hero-meta"><span>📅 ' + formatDate(today) + '</span><span>🎯 今日目标 ' + goal + ' 项</span><span>🔥 连续 ' + currentStreak() + ' 天</span></div>' +
        '</section>' +
        '<section class="card progress-card">' +
          '<div class="ring-row"><div class="ring" style="--p:' + percent + '"><div style="position:relative;z-index:1;text-align:center"><strong>' + percent + '%</strong><small>今日</small></div></div><div class="ring-label"><strong>今日完成度</strong><span>' + doneCount + ' / ' + goal + ' 项任务<br>今日练习 ' + state.daily.minutes + ' 次</span></div></div>' +
          '<div class="task-list">' +
            taskRowHtml('read', '📰', '完成一篇英文阅读', '精读 + 理解测验') +
            taskRowHtml('speak', '🎙️', '完成一段口语对话', '跟读或情景对话') +
            taskRowHtml('vocab', '🃏', '复习生词本', wordCount + ' 个已收藏生词') +
          '</div>' +
        '</section>' +
      '</div>' +
      '<div class="stats-grid" style="margin-top:18px;">' +
        '<div class="card stat-card"><div class="stat-icon">📚</div><div><strong>' + readDone + '</strong><span>已读文章</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">🧠</div><div><strong>' + wordCount + '</strong><span>收藏生词</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">💬</div><div><strong>' + dialogueCount + '</strong><span>完成对话</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">🔥</div><div><strong>' + currentStreak() + '</strong><span>连续天数</span></div></div>' +
      '</div>' +
      '<div class="section-title"><h2>今天读什么</h2><small>精选新闻风格文章，点击生词即可查释义</small></div>' +
      '<div class="article-grid">' + recommended.map(articleCardHtml).join('') + '</div>' +
      '<div class="section-title"><h2>今天和谁说</h2><small>跟着提示完成真实场景，浏览器语音识别或打字都可以</small></div>' +
      '<div style="max-width:520px;">' + dialogueCardHtml(recommendedDialogue) + '</div>' +
    '</div>';
  }

  function bindTodayPage() {
    $$('[data-action="go-task"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var task = button.getAttribute('data-task');
        if (task === 'read') navigate('#/reading');
        if (task === 'speak') navigate('#/speaking');
        if (task === 'vocab') navigate('#/vocab');
      });
    });
    $$('[data-action="open-dialogue"]').forEach(function (button) {
      button.addEventListener('click', function () { navigate('#/dialogue/' + button.getAttribute('data-id')); });
    });
  }

  function readingPage() {
    var levels = ['全部', 'A2', 'B1', 'B2'];
    var topics = ['全部'].concat((window.ARTICLES || []).map(function (article) { return article.topic; }).filter(function (topic, index, arr) { return arr.indexOf(topic) === index; }));
    return '<div class="page">' +
      '<div class="page-head"><div><div class="eyebrow">Reading Room</div><h1 class="page-title">英文阅读</h1><p class="page-sub">像读新闻一样读英语。点击任意单词看释义，打开中文对照，再用跟读和理解题巩固。</p></div><div class="head-actions"><button class="btn btn-ghost" data-action="random-article">随机来一篇</button></div></div>' +
      '<div class="filter-bar">' +
        '<div class="search-box"><span>🔍</span><input id="article-search" type="search" placeholder="搜索文章、主题或关键词"></div>' +
        '<div class="segmented" data-filter="level">' + levels.map(function (level) { return '<button class="' + (level === '全部' ? 'active' : '') + '" data-value="' + level + '">' + (level === '全部' ? '全部等级' : level) + '</button>'; }).join('') + '</div>' +
        '<div class="segmented" data-filter="topic">' + topics.map(function (topic) { return '<button class="' + (topic === '全部' ? 'active' : '') + '" data-value="' + escapeAttr(topic) + '">' + escapeHtml(topic) + '</button>'; }).join('') + '</div>' +
      '</div>' +
      '<div class="article-grid" id="article-grid">' + (window.ARTICLES || []).map(articleCardHtml).join('') + '</div>' +
      '<div class="empty-state hidden" id="article-empty"><div class="big">🔎</div><p>没有找到匹配的文章，换个关键词试试。</p></div>' +
    '</div>';
  }

  function bindReadingPage() {
    var search = $('#article-search');
    var cards = $$('#article-grid .article-card');
    var empty = $('#article-empty');
    var filters = { level: '全部', topic: '全部', q: '' };
    function apply() {
      var visible = 0;
      cards.forEach(function (card) {
        var level = card.getAttribute('data-level');
        var topic = card.getAttribute('data-topic');
        var text = card.getAttribute('data-search') || '';
        var ok = (filters.level === '全部' || filters.level === level) && (filters.topic === '全部' || filters.topic === topic) && (filters.q === '' || text.indexOf(filters.q) >= 0);
        card.classList.toggle('hidden', ok === false);
        if (ok) visible += 1;
      });
      if (empty) empty.classList.toggle('hidden', visible > 0);
    }
    if (search) search.addEventListener('input', function () { filters.q = search.value.trim().toLowerCase(); apply(); });
    $$('[data-filter="level"] button').forEach(function (button) {
      button.addEventListener('click', function () {
        filters.level = button.getAttribute('data-value');
        $$('[data-filter="level"] button').forEach(function (item) { item.classList.toggle('active', item === button); });
        apply();
      });
    });
    $$('[data-filter="topic"] button').forEach(function (button) {
      button.addEventListener('click', function () {
        filters.topic = button.getAttribute('data-value');
        $$('[data-filter="topic"] button').forEach(function (item) { item.classList.toggle('active', item === button); });
        apply();
      });
    });
    var randomButton = $('[data-action="random-article"]');
    if (randomButton) randomButton.addEventListener('click', function () {
      var list = window.ARTICLES || [];
      if (list.length) navigate('#/article/' + list[Math.floor(Math.random() * list.length)].id);
    });
  }

  function wordSaved(word) {
    return Boolean(state.words[normalizeText(word)]);
  }

  function sentenceHtml(text, pIdx, sIdx) {
    var parts = String(text || '').split(/(\b[A-Za-z][A-Za-z'’\-]*\b)/g);
    var html = parts.map(function (part) {
      if (/^[A-Za-z][A-Za-z'’\-]*$/.test(part)) {
        var saved = wordSaved(part);
        return '<span class="word ' + (saved ? 'saved' : '') + '" data-word="' + escapeAttr(part) + '">' + escapeHtml(part) + '</span>';
      }
      return escapeHtml(part);
    }).join('');
    return '<span class="sentence" data-para="' + pIdx + '" data-sentence="' + sIdx + '" data-text="' + escapeAttr(text) + '">' + html + '</span>';
  }

  function paragraphHtml(paragraph, pIdx) {
    var sentences = String(paragraph.en || '').split(/(?<=[.?!])\s+/).filter(function (item) { return item.trim(); });
    return '<div class="paragraph" data-para="' + pIdx + '">' +
      sentences.map(function (sentence, sIdx) { return sentenceHtml(sentence, pIdx, sIdx); }).join(' ') +
      '<div class="zh-line ' + (state.settings.showZh ? 'show' : '') + '">' + escapeHtml(paragraph.zh) + '</div>' +
    '</div>';
  }

  function quizHtml(article) {
    return '<div class="side-card card"><h3>理解测验</h3><div class="quiz-box" id="article-quiz">' +
      (article.quiz || []).map(function (item, qIdx) {
        return '<div class="quiz-item" data-q="' + qIdx + '"><div class="quiz-q">' + (qIdx + 1) + '. ' + escapeHtml(item.q) + '</div><div class="quiz-options">' +
          item.options.map(function (option, oIdx) {
            return '<button class="quiz-option" data-action="quiz-option" data-q="' + qIdx + '" data-opt="' + oIdx + '">' + escapeHtml(option) + '</button>';
          }).join('') +
        '</div><div class="quiz-explain">' + escapeHtml(item.explain) + '</div></div>';
      }).join('') +
    '</div></div>';
  }

  function articlePage(id) {
    var article = getArticle(id);
    if (article === null) return '<div class="page"><div class="empty-state"><div class="big">📭</div><p>没有找到这篇文章。</p><a class="btn btn-soft" href="#/reading">返回阅读列表</a></div></div>';
    var completed = state.completedArticles.indexOf(article.id) >= 0;
    var savedFocus = uiState.articleFocus[article.id];
    var focusActive = savedFocus && savedFocus.active ? ' focus-mode' : '';
    var vocabButtons = (article.vocab || []).map(function (item) {
      return '<button data-action="lookup-vocab" data-word="' + escapeAttr(item.word) + '"><strong>' + escapeHtml(item.word) + '</strong><span>' + escapeHtml(item.meaning) + '</span></button>';
    }).join('');
    return '<div class="page">' +
      '<div class="reader-top">' +
        '<div class="reader-title"><a class="btn btn-sm btn-ghost" href="#/reading">← 返回阅读列表</a><h1 style="margin-top:12px;">' + escapeHtml(article.title) + '</h1><div class="reader-sub"><span>' + escapeHtml(article.source) + '</span><span>·</span><span>' + formatDate(article.date) + '</span><span class="chip level-' + article.level + '">' + article.level + '</span><span>📖 ' + article.minutes + ' 分钟</span>' + (completed ? '<span class="chip done">已读完</span>' : '') + '</div></div>' +
      '</div>' +
      '<div class="reader-layout">' +
        '<div><div class="reader-toolbar">' +
          '<button class="btn btn-primary btn-sm" data-action="play-article">▶ 朗读全文</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="stop-reading">■ 停止</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="toggle-zh">中英对照</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="focus-mode">逐段精读</button>' +
          '<span style="color:var(--muted);font-size:12px;margin-left:auto;display:none;" id="reader-status"></span>' +
        '</div>' +
        '<article class="article-body' + focusActive + '" id="article-body">' + article.paragraphs.map(paragraphHtml).join('') + '</article>' +
        '<div class="focus-nav"><button class="btn btn-ghost btn-sm" data-action="focus-prev">← 上一段</button><span class="focus-progress" id="focus-progress"></span><button class="btn btn-soft btn-sm" data-action="focus-next">下一段 →</button></div>' +
        '<div class="card card-pad" style="margin-top:16px;">' +
          '<h3 style="font-size:15px;">这篇文章怎么练</h3>' +
          '<div style="display:grid;gap:9px;margin-top:11px;color:var(--text-soft);font-size:13px;">' +
            '<div>1. 先通读一遍，不要查每个词，抓住大意。</div>' +
            '<div>2. 点击不认识的词，加入生词本，听发音。</div>' +
            '<div>3. 打开逐段精读，跟读 2 到 3 句，注意连读和语调。</div>' +
            '<div>4. 做下面的理解测验，答完再回看错题。</div>' +
          '</div>' +
        '</div></div>' +
        '<aside class="article-side">' +
          '<div class="side-card card"><h3>本篇核心词</h3><div class="vocab-mini">' + (vocabButtons || '<p class="form-hint">暂无核心词。</p>') + '</div></div>' +
          quizHtml(article) +
          '<div class="side-card card"><h3>完成阅读</h3><p class="form-hint" style="margin:7px 0 11px;">读完并做完测验后，把今天标记为已完成。</p><button class="btn btn-primary btn-wide" data-action="complete-article">' + (completed ? '✓ 已标记完成' : '标记为已读完') + '</button></div>' +
        '</aside>' +
      '</div>' +
    '</div>';
  }

  function readerStatus(text) {
    var node = $('#reader-status');
    if (node === null) return;
    node.textContent = text || '';
    node.style.display = text ? 'inline' : 'none';
  }

  function clearReaderHighlights() {
    $$('.sentence.active').forEach(function (node) { node.classList.remove('active'); });
  }

  function playArticle(articleId) {
    var article = getArticle(articleId);
    if (article === null) return;
    stopSpeaking();
    clearReaderHighlights();
    var items = [];
    article.paragraphs.forEach(function (paragraph, pIdx) {
      String(paragraph.en || '').split(/(?<=[.?!])\s+/).filter(function (item) { return item.trim(); }).forEach(function (sentence, sIdx) {
        items.push({ text: sentence, pIdx: pIdx, sIdx: sIdx });
      });
    });
    if (items.length === 0) return;
    var token = ++uiState.readerToken;
    readerStatus('正在朗读 1 / ' + items.length);
    function step(index) {
      if (index >= items.length || token !== uiState.readerToken) {
        clearReaderHighlights();
        readerStatus('');
        return;
      }
      var item = items[index];
      var el = $('.sentence[data-para="' + item.pIdx + '"][data-sentence="' + item.sIdx + '"]');
      clearReaderHighlights();
      if (el) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      readerStatus('正在朗读 ' + (index + 1) + ' / ' + items.length);
      speak(item.text, { cancel: false }).then(function () { step(index + 1); });
    }
    step(0);
  }

  function stopReading() {
    uiState.readerToken += 1;
    stopSpeaking();
    clearReaderHighlights();
    readerStatus('');
  }

  function updateFocusView(articleId) {
    var article = getArticle(articleId);
    if (article === null) return;
    var focus = uiState.articleFocus[articleId];
    if (focus === undefined || focus.active === false) return;
    var max = article.paragraphs.length - 1;
    focus.index = clamp(focus.index, 0, max);
    $$('#article-body .paragraph').forEach(function (node, index) {
      node.classList.toggle('active', Number(node.getAttribute('data-para')) === focus.index);
    });
    var progress = $('#focus-progress');
    if (progress) progress.textContent = '第 ' + (focus.index + 1) + ' / ' + article.paragraphs.length + ' 段';
  }

  function toggleFocusMode(articleId) {
    var article = getArticle(articleId);
    if (article === null) return;
    var body = $('#article-body');
    var focus = uiState.articleFocus[articleId];
    if (focus && focus.active) {
      focus.active = false;
      if (body) body.classList.remove('focus-mode');
      $$('#article-body .paragraph').forEach(function (node) { node.classList.remove('active'); });
      var progress = $('#focus-progress');
      if (progress) progress.textContent = '';
    } else {
      uiState.articleFocus[articleId] = { index: 0, active: true };
      if (body) body.classList.add('focus-mode');
      updateFocusView(articleId);
    }
  }

  function markArticleCompleted(articleId) {
    if (state.completedArticles.indexOf(articleId) < 0) {
      state.completedArticles.push(articleId);
      state.articleProgress[articleId] = { completedAt: Date.now() };
      completeTask('read');
      saveState();
    }
  }

  function bindArticlePage(articleId) {
    var article = getArticle(articleId);
    if (article === null) return;
    var body = $('#article-body');
    var storedFocus = uiState.articleFocus[articleId];
    if (body && storedFocus && storedFocus.active) { body.classList.add('focus-mode'); updateFocusView(articleId); }
    var playButton = $('[data-action="play-article"]');
    var stopButton = $('[data-action="stop-reading"]');
    var zhButton = $('[data-action="toggle-zh"]');
    var focusButton = $('[data-action="focus-mode"]');
    if (playButton) playButton.addEventListener('click', function () { playArticle(articleId); });
    if (stopButton) stopButton.addEventListener('click', function () { stopReading(); });
    if (zhButton) zhButton.addEventListener('click', function () {
      state.settings.showZh = state.settings.showZh === false;
      saveState();
      $$('.zh-line').forEach(function (node) { node.classList.toggle('show', state.settings.showZh); });
      toast(state.settings.showZh ? '已打开中英对照' : '已关闭中英对照');
    });
    if (focusButton) focusButton.addEventListener('click', function () { toggleFocusMode(articleId); });
    var prev = $('[data-action="focus-prev"]');
    var next = $('[data-action="focus-next"]');
    if (prev) prev.addEventListener('click', function () {
      var focus = uiState.articleFocus[articleId];
      if (focus && focus.active) { focus.index -= 1; updateFocusView(articleId); }
    });
    if (next) next.addEventListener('click', function () {
      var focus = uiState.articleFocus[articleId];
      if (focus && focus.active) { focus.index += 1; updateFocusView(articleId); }
    });
    if (body) body.addEventListener('click', function (event) {
      var wordNode = event.target.closest ? event.target.closest('.word') : null;
      if (wordNode) {
        event.stopPropagation();
        openWordPopover(wordNode.getAttribute('data-word'), wordNode);
        return;
      }
      var sentenceNode = event.target.closest ? event.target.closest('.sentence') : null;
      if (sentenceNode && state.settings.autoSpeak) {
        clearReaderHighlights();
        sentenceNode.classList.add('active');
        speak(sentenceNode.getAttribute('data-text'), { cancel: true });
      }
    });
    $$('[data-action="lookup-vocab"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var word = button.getAttribute('data-word');
        openWordPopover(word, button);
      });
    });
    $$('.quiz-option').forEach(function (button) {
      button.addEventListener('click', function () {
        var q = Number(button.getAttribute('data-q'));
        var opt = Number(button.getAttribute('data-opt'));
        var item = article.quiz[q];
        var parent = button.closest('.quiz-item');
        var options = parent ? parent.querySelectorAll('.quiz-option') : [];
        options.forEach(function (node) { node.classList.remove('correct', 'wrong'); });
        if (opt === item.answer) {
          button.classList.add('correct');
          toast('答对了', 'good');
        } else {
          button.classList.add('wrong');
          options[item.answer].classList.add('correct');
          toast('没关系，看看解析再试一次', 'warn');
        }
        var explain = parent ? parent.querySelector('.quiz-explain') : null;
        if (explain) explain.classList.add('show');
      });
    });
    var completeButton = $('[data-action="complete-article"]');
    if (completeButton) completeButton.addEventListener('click', function () {
      markArticleCompleted(articleId);
      toast('已记录完成，连续学习继续', 'good');
      route();
    });
  }

  function wordKey(word) { return normalizeText(word); }

  function wordEntryFrom(data, word) {
    return {
      word: (data && data.word) || word,
      phonetic: (data && data.phonetic) || '',
      pos: (data && data.pos) || '',
      meaning: (data && data.meaning) || '',
      example: (data && data.example) || '',
      exampleZh: (data && data.exampleZh) || '',
      addedAt: Date.now(),
      familiarity: 0,
      reviews: 0,
      due: Date.now()
    };
  }

  function dueAfter(familiarity) {
    var intervals = [0, 1, 2, 4, 7, 15, 30];
    var days = intervals[clamp(familiarity, 0, intervals.length - 1)];
    return Date.now() + days * 24 * 60 * 60 * 1000;
  }

  function toggleSavedWord(data, word) {
    var key = wordKey(word);
    if (state.words[key]) {
      delete state.words[key];
      saveState();
      toast('已从生词本移除');
      return false;
    }
    state.words[key] = wordEntryFrom(data, word);
    saveState();
    completeTask('vocab');
    toast('已加入生词本', 'good');
    return true;
  }

  function positionPopover(anchor) {
    if (popover === null || anchor === null) return;
    var rect = anchor.getBoundingClientRect();
    var width = Math.min(320, window.innerWidth - 24);
    var left = clamp(rect.left, 12, window.innerWidth - width - 12);
    var estimated = 220;
    var top = rect.bottom + 8;
    if (top + estimated > window.innerHeight - 12) top = Math.max(12, rect.top - estimated - 8);
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function renderWordPopover(data, word, anchor) {
    var key = wordKey(word);
    var saved = Boolean(state.words[key]);
    var phonetic = data.phonetic ? '<div class="pop-phonetic">' + escapeHtml(data.phonetic) + (data.pos ? ' · ' + escapeHtml(data.pos) : '') + '</div>' : (data.pos ? '<div class="pop-phonetic">' + escapeHtml(data.pos) + '</div>' : '');
    var example = data.example ? '<div class="pop-example">' + escapeHtml(data.example) + (data.exampleZh ? '<br>' + escapeHtml(data.exampleZh) : '') + '</div>' : '';
    var loading = data.source === 'loading' ? '<div class="pop-loading">正在联网查询例句与音标...</div>' : '';
    popover.innerHTML =
      '<div class="pop-word"><strong>' + escapeHtml(data.word || word) + '</strong><button class="icon-btn" data-action="pop-close" style="width:30px;height:30px;">✕</button></div>' +
      phonetic +
      '<div class="pop-meaning">' + escapeHtml(data.meaning || '暂无中文释义') + '</div>' +
      example + loading +
      '<div class="pop-actions">' +
        '<button class="btn btn-sm btn-soft" data-action="pop-speak">🔊 发音</button>' +
        '<button class="btn btn-sm ' + (saved ? 'btn-danger' : 'btn-ghost') + '" data-action="pop-toggle">' + (saved ? '移出生词本' : '加入生词本') + '</button>' +
      '</div>';
    popover.hidden = false;
    positionPopover(anchor);
  }

  function openWordPopover(word, anchor) {
    if (popover === null) return;
    uiState.currentWord = word;
    uiState.wordAnchor = anchor;
    var local = lookupLocal(word);
    renderWordPopover({ word: word, meaning: local && local.meaning ? local.meaning : '正在查询...', phonetic: local && local.phonetic, pos: local && local.pos, example: local && local.example, source: 'loading' }, word, anchor);
    lookupWord(word).then(function (data) {
      if (uiState.currentWord !== word) return;
      renderWordPopover(data, word, anchor);
    });
  }

  function refreshWordNodes(word, saved) {
    var key = wordKey(word);
    $$('.word').forEach(function (node) {
      if (wordKey(node.getAttribute('data-word')) === key) node.classList.toggle('saved', saved);
    });
  }

  if (popover) {
    popover.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-action]') : null;
      if (button === null) return;
      var action = button.getAttribute('data-action');
      if (action === 'pop-close') {
        popover.hidden = true;
        return;
      }
      var word = uiState.currentWord;
      if (word === null || word === undefined) return;
      if (action === 'pop-speak') {
        speak(word, { cancel: true });
      }
      if (action === 'pop-toggle') {
        var localData = lookupLocal(word) || { word: word, phonetic: '', pos: '', meaning: '', example: '', exampleZh: '' };
        var savedNow = toggleSavedWord(localData, word);
        refreshWordNodes(word, savedNow);
        renderWordPopover(localData, word, uiState.wordAnchor || button);
        lookupWord(word).then(function (full) {
          var current = state.words[wordKey(word)];
          if (current && full && full.meaning) {
            current.meaning = full.meaning || current.meaning;
            current.phonetic = full.phonetic || current.phonetic;
            current.pos = full.pos || current.pos;
            current.example = full.example || current.example;
            saveState();
          }
        });
      }
    });
  }

  document.addEventListener('click', function (event) {
    if (popover === null || popover.hidden) return;
    if (popover.contains(event.target)) return;
    var wordNode = event.target.closest ? event.target.closest('.word, [data-action="lookup-vocab"]') : null;
    if (wordNode) return;
    popover.hidden = true;
  });

  function speakingPage() {
    var dialogues = window.DIALOGUES || [];
    var featured = dialogues[0];
    return '<div class="page">' +
      '<div class="page-head"><div><div class="eyebrow">Speaking Studio</div><h1 class="page-title">口语对话</h1><p class="page-sub">没有真人语言环境也没关系。选择一个场景，先听对方说，再用英语回答。支持语音识别与打字，答完会给出匹配反馈。</p></div><div class="head-actions"><button class="btn btn-ghost" data-action="speak-tips">口语小贴士</button></div></div>' +
      '<div class="chat-page-grid">' +
        '<aside class="card card-pad"><h3 style="font-size:15px;margin-bottom:12px;">选择场景</h3><div class="dialogue-list">' + dialogues.map(function (dialogue) { return dialogueCardHtml(dialogue); }).join('') + '</div></aside>' +
        '<section class="card chat-shell">' +
          '<div class="chat-head"><div class="avatar">' + featured.icon + '</div><div><h2>从一段真实对话开始</h2><p>' + escapeHtml(featured.scene) + ' · ' + featured.level + ' · 约 ' + featured.minutes + ' 分钟</p></div></div>' +
          '<div class="chat-body">' +
            '<div class="bubble ai">Hello. I am your speaking partner. ' + escapeHtml(featured.turns[0].ai) + '<span class="b-zh">你好，我是你的口语伙伴。' + escapeHtml(featured.turns[0].aiZh) + '</span></div>' +
            '<div class="chat-hint">练习建议：先点麦克风说出完整句子；如果识别不准，也可以直接输入。每句只说一个核心信息，慢慢来。</div>' +
            '<div style="display:grid;gap:9px;margin-top:6px;">' + dialogues.slice(0, 3).map(function (dialogue) {
              return '<button class="btn btn-soft" data-action="open-dialogue" data-id="' + dialogue.id + '">' + dialogue.icon + ' 开始：' + escapeHtml(dialogue.title) + '</button>';
            }).join('') + '</div>' +
          '</div>' +
        '</section>' +
      '</div>' +
    '</div>';
  }

  function bindSpeakingPage() {
    $$('[data-action="open-dialogue"]').forEach(function (button) {
      button.addEventListener('click', function () { navigate('#/dialogue/' + button.getAttribute('data-id')); });
    });
    var tipsButton = $('[data-action="speak-tips"]');
    if (tipsButton) tipsButton.addEventListener('click', function () {
      openModal(modalShell('口语练习小贴士', '<div style="display:grid;gap:12px;font-size:14px;color:var(--text-soft);"><p><strong>1. 先听再答</strong><br>点击 AI 气泡里的播放按钮，先听对方怎么说。</p><p><strong>2. 用短句也完全可以</strong><br>回答不需要长，先保证信息完整。例如点咖啡时说 A medium, please.</p><p><strong>3. 允许犯错</strong><br>系统匹配关键词是为了帮你继续对话，不是考试评分。</p><p><strong>4. 每天一段</strong><br>重复同一段对话，直到不用看提示也能说出来，效果最好。</p></div>', '<button class="btn btn-primary" data-action="close-modal">知道了</button>'));
    });
  }

  function initDialogueSession(dialogue) {
    var first = dialogue.turns[0];
    return {
      dialogueId: dialogue.id,
      turnIndex: 0,
      messages: [{ role: 'ai', text: first.ai, zh: first.aiZh, hint: first.hint }],
      scoreSum: 0,
      scoreCount: 0,
      completed: false,
      pendingSpeak: false
    };
  }

  function getDialogueSession(dialogue) {
    if (uiState.dialogueSession === null || uiState.dialogueSession.dialogueId !== dialogue.id) {
      uiState.dialogueSession = initDialogueSession(dialogue);
    }
    return uiState.dialogueSession;
  }

  function evaluateAnswer(text, turn) {
    var normalized = normalizeText(text);
    if (normalized.length < 1) return 0;
    var best = 0;
    var words = normalized.split(' ');
    (turn.accept || []).forEach(function (phrase) {
      var expected = normalizeText(phrase);
      if (expected.length && normalized.indexOf(expected) >= 0) best = Math.max(best, 100);
      var expectedWords = expected.split(' ').filter(Boolean);
      if (expectedWords.length) {
        var hit = expectedWords.filter(function (word) { return words.indexOf(word) >= 0; }).length;
        var ratio = hit / expectedWords.length;
        best = Math.max(best, Math.round(ratio * (expectedWords.length === 1 ? 90 : 82)));
      }
    });
    return best;
  }

  function dialogueBubbleHtml(message, index) {
    if (message.role === 'user') {
      return '<div class="bubble user">' + escapeHtml(message.text) + (message.score ? '<span class="b-zh">匹配度 ' + message.score + '%</span>' : '') + '</div>';
    }
    if (message.role === 'coach') {
      return '<div class="bubble ai" style="border-color:var(--accent);background:var(--accent-soft);color:#92400e;">' + escapeHtml(message.text) + (message.hint ? '<span class="b-zh" style="color:#a16207;">提示：' + escapeHtml(message.hint) + '</span>' : '') + '</div>';
    }
    return '<div class="bubble ai" data-bubble="' + index + '">' + escapeHtml(message.text) + (message.zh ? '<span class="b-zh">' + escapeHtml(message.zh) + '</span>' : '') +
      '<div class="b-tools"><button data-action="speak-bubble" data-index="' + index + '">🔊 播放</button><button data-action="show-hint" data-index="' + index + '">提示</button></div></div>';
  }

  function dialoguePage(id) {
    var dialogue = getDialogue(id);
    if (dialogue === null) return '<div class="page"><div class="empty-state"><div class="big">🎙️</div><p>没有找到这个对话场景。</p><a class="btn btn-soft" href="#/speaking">返回口语列表</a></div></div>';
    var session = getDialogueSession(dialogue);
    var turn = session.completed ? null : dialogue.turns[session.turnIndex];
    var progress = state.dialogueProgress[id];
    var hint = turn ? turn.hint : '';
    var body = session.messages.map(dialogueBubbleHtml).join('');
    if (session.completed) {
      var score = session.scoreCount ? Math.round(session.scoreSum / session.scoreCount) : (progress ? progress.bestScore : 0);
      body += '<div class="completion-card card card-pad" style="align-self:stretch;"><div style="font-size:38px;">🎉</div><h3 style="margin-top:8px;">这段对话完成了</h3><p style="color:var(--muted);margin-top:6px;">平均匹配度 ' + score + '%。最好的练习是再来一次，把答案说得更自然。</p><div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap;"><button class="btn btn-primary" data-action="restart-dialogue">再练一次</button><a class="btn btn-ghost" href="#/speaking">换一个场景</a></div></div>';
    }
    return '<div class="page">' +
      '<div class="page-head"><div><a class="btn btn-sm btn-ghost" href="#/speaking">← 返回口语列表</a><h1 class="page-title" style="margin-top:12px;">' + dialogue.icon + ' ' + escapeHtml(dialogue.title) + '</h1><p class="page-sub">' + escapeHtml(dialogue.scene) + ' · ' + dialogue.level + ' · ' + escapeHtml(dialogue.goal) + '</p></div><div class="head-actions"><span class="chip level-' + dialogue.level + '">' + dialogue.level + '</span></div></div>' +
      '<div class="chat-page-grid">' +
        '<aside class="card card-pad"><h3 style="font-size:15px;margin-bottom:12px;">场景列表</h3><div class="dialogue-list">' + (window.DIALOGUES || []).map(function (item) { return dialogueCardHtml(item, true); }).join('') + '</div></aside>' +
        '<section class="card chat-shell">' +
          '<div class="chat-head"><div class="avatar">' + dialogue.icon + '</div><div><h2>' + escapeHtml(dialogue.title) + '</h2><p>' + (session.completed ? '已完成 · 可以重新开始' : '第 ' + (session.turnIndex + 1) + ' / ' + dialogue.turns.length + ' 轮 · 用英语回答') + '</p></div><button class="btn btn-sm btn-ghost" style="margin-left:auto;" data-action="reset-dialogue">重新开始</button></div>' +
          '<div class="chat-body" id="chat-body">' + body + '</div>' +
          (session.completed ? '' :
            '<div class="chat-composer">' +
              '<div class="composer-row">' +
                '<button class="mic-btn" data-action="dialogue-mic" title="点击说话">🎙️</button>' +
                '<textarea id="dialogue-input" placeholder="用英文回答，或点击麦克风说话"></textarea>' +
                '<button class="btn btn-primary" data-action="dialogue-send">发送</button>' +
              '</div>' +
              '<div class="composer-meta"><span id="dialogue-status">轮到你了</span><span>' + (speechSupported() ? '语音识别可用' : '当前浏览器不支持语音，可打字') + '</span></div>' +
              '<div class="chat-hint" id="dialogue-hint"><strong>参考表达：</strong>' + escapeHtml(turn ? turn.sample : '') + '<br><span style="opacity:.8;">提示：' + escapeHtml(hint) + '</span></div>' +
            '</div>') +
        '</section>' +
      '</div>' +
    '</div>';
  }

  function scrollChatToBottom() {
    var body = $('#chat-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  function markDialogueCompleted(dialogue, session) {
    var avg = session.scoreCount ? Math.round(session.scoreSum / session.scoreCount) : 0;
    var previous = state.dialogueProgress[dialogue.id] || {};
    state.dialogueProgress[dialogue.id] = {
      completed: true,
      bestScore: Math.max(previous.bestScore || 0, avg),
      turns: dialogue.turns.length,
      lastAt: Date.now()
    };
    completeTask('speak');
    saveState();
  }

  function handleDialogueAnswer(dialogueId, rawText) {
    var dialogue = getDialogue(dialogueId);
    if (dialogue === null) return;
    var text = String(rawText || '').trim();
    if (text === '') {
      toast('先说点什么，再发送吧');
      return;
    }
    var session = getDialogueSession(dialogue);
    if (session.completed) return;
    var turn = dialogue.turns[session.turnIndex];
    if (turn === undefined || turn === null) return;
    var score = evaluateAnswer(text, turn);
    session.messages.push({ role: 'user', text: text, score: score });
    if (score >= 55) {
      session.scoreSum += score;
      session.scoreCount += 1;
      session.turnIndex += 1;
      if (session.turnIndex < dialogue.turns.length) {
        var nextTurn = dialogue.turns[session.turnIndex];
        session.messages.push({ role: 'ai', text: nextTurn.ai, zh: nextTurn.aiZh, hint: nextTurn.hint });
        session.pendingSpeak = true;
        toast('回答得不错，继续', 'good');
      } else {
        session.completed = true;
        session.pendingSpeak = false;
        markDialogueCompleted(dialogue, session);
        toast('对话完成，已记录到今日任务', 'good');
      }
    } else {
      session.messages.push({ role: 'coach', text: '可以再试一次。参考说法：' + turn.sample, hint: turn.hint });
      session.pendingSpeak = false;
      toast('差一点，看看提示再试一次', 'warn');
    }
    var input = $('#dialogue-input');
    if (input) input.value = '';
    route();
  }

  function bindDialoguePage(dialogueId) {
    var dialogue = getDialogue(dialogueId);
    if (dialogue === null) return;
    var input = $('#dialogue-input');
    var send = $('[data-action="dialogue-send"]');
    var mic = $('[data-action="dialogue-mic"]');
    var session = getDialogueSession(dialogue);
    function submit() {
      if (input) {
        handleDialogueAnswer(dialogueId, input.value);
      }
    }
    if (send) send.addEventListener('click', submit);
    if (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.shiftKey === false) {
          event.preventDefault();
          submit();
        }
      });
    }
    if (mic) {
      mic.addEventListener('click', function () {
        if (speechSupported() === false) {
          toast('当前浏览器不支持语音识别，可以直接打字练习');
          return;
        }
        mic.classList.add('recording');
        var status = $('#dialogue-status');
        if (status) status.textContent = '正在听你说...';
        startListening({
          onResult: function (results) {
            var text = results && results[0] ? results[0].transcript : '';
            if (text) handleDialogueAnswer(dialogueId, text);
          },
          onError: function (error) {
            mic.classList.remove('recording');
            if (status) status.textContent = '轮到你了';
            if (error === 'not-allowed' || error === 'service-not-allowed') toast('麦克风权限未开启', 'bad');
            else if (error !== 'aborted') toast('没有听清，再试一次或直接打字', 'warn');
          },
          onEnd: function () {
            mic.classList.remove('recording');
            if (status) status.textContent = '轮到你了';
          }
        });
      });
    }
    $$('[data-action="speak-bubble"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var index = Number(button.getAttribute('data-index'));
        var message = session.messages[index];
        if (message) speak(message.text, { cancel: true });
      });
    });
    $$('[data-action="show-hint"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var hint = $('#dialogue-hint');
        if (hint) {
          hint.scrollIntoView({ behavior: 'smooth', block: 'center' });
          hint.style.boxShadow = '0 0 0 4px rgba(245,158,11,0.28)';
          setTimeout(function () { hint.style.boxShadow = ''; }, 1000);
        }
      });
    });
    var reset = $('[data-action="reset-dialogue"]');
    if (reset) reset.addEventListener('click', function () {
      if (confirm('重新开始这段对话吗？')) {
        uiState.dialogueSession = initDialogueSession(dialogue);
        route();
      }
    });
    var restart = $('[data-action="restart-dialogue"]');
    if (restart) restart.addEventListener('click', function () {
      uiState.dialogueSession = initDialogueSession(dialogue);
      route();
    });
    $$('[data-action="open-dialogue"]').forEach(function (button) {
      button.addEventListener('click', function () { navigate('#/dialogue/' + button.getAttribute('data-id')); });
    });
    scrollChatToBottom();
    if (session.pendingSpeak) {
      var last = session.messages[session.messages.length - 1];
      session.pendingSpeak = false;
      if (last && last.role === 'ai') setTimeout(function () { speak(last.text, { cancel: true }); }, 240);
    }
  }

  function wordList() {
    return Object.keys(state.words).map(function (key) { return Object.assign({ key: key }, state.words[key]); });
  }

  function formatDue(due) {
    if (due === undefined || due === null) return '待复习';
    var diff = due - Date.now();
    if (diff <= 0) return '现在复习';
    var days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return days + ' 天后';
  }

  function startVocabReview() {
    var all = wordList();
    var due = all.filter(function (item) { return item.due && item.due <= Date.now(); });
    var queue = due.length ? due : all.slice().sort(function (a, b) { return (a.familiarity || 0) - (b.familiarity || 0); });
    if (queue.length === 0) {
      toast('生词本还是空的，先去阅读页点击生词添加吧');
      return;
    }
    uiState.reviewMode = true;
    uiState.reviewQueue = queue;
    uiState.reviewIndex = 0;
    uiState.reviewFlipped = false;
    route();
  }

  function vocabReviewHtml() {
    if (uiState.reviewQueue.length === 0) return '';
    var item = uiState.reviewQueue[uiState.reviewIndex];
    if (item === undefined) return '';
    return '<div class="card flashcard ' + (uiState.reviewFlipped ? 'flipped' : '') + '" data-action="flip-card">' +
      '<div style="width:100%;">' +
        '<div class="question-side"><div class="word-big">' + escapeHtml(item.word) + '</div><div class="phonetic">' + escapeHtml(item.phonetic || '') + '</div><p class="form-hint" style="margin-top:16px;">先在心里说出意思，再点击卡片查看答案</p></div>' +
        '<div class="answer-side"><div class="word-big" style="font-size:34px;">' + escapeHtml(item.word) + '</div><div class="meaning">' + escapeHtml(item.meaning || '暂无释义') + '</div>' + (item.example ? '<div class="example">' + escapeHtml(item.example) + '<br>' + escapeHtml(item.exampleZh || '') + '</div>' : '') + '<p class="form-hint" style="margin-top:16px;">点击卡片翻回正面</p></div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:16px;">' +
      '<button class="btn btn-ghost" data-action="review-rate" data-rate="again">不认识</button>' +
      '<button class="btn btn-ghost" data-action="review-rate" data-rate="hard">有点模糊</button>' +
      '<button class="btn btn-primary" data-action="review-rate" data-rate="good">认识</button>' +
      '<button class="btn btn-soft" data-action="review-speak">🔊 听发音</button>' +
    '</div>' +
    '<p class="form-hint" style="text-align:center;margin-top:12px;">卡片 ' + (uiState.reviewIndex + 1) + ' / ' + uiState.reviewQueue.length + ' · 间隔重复会按记忆情况安排下次复习</p>';
  }

  function vocabPage() {
    var list = wordList();
    var dueCount = list.filter(function (item) { return item.due && item.due <= Date.now(); }).length;
    if (uiState.reviewMode && uiState.reviewQueue.length) {
      return '<div class="page">' +
        '<div class="page-head"><div><div class="eyebrow">Vocabulary Review</div><h1 class="page-title">生词复习</h1><p class="page-sub">先回忆，再翻面。按真实记忆情况选择，系统会安排下次出现时间。</p></div><button class="btn btn-ghost" data-action="exit-review">退出复习</button></div>' +
        vocabReviewHtml() +
      '</div>';
    }
    var rows = list.map(function (item) {
      return '<tr>' +
        '<td><div class="w">' + escapeHtml(item.word) + '</div><div class="form-hint">' + escapeHtml(item.phonetic || '') + ' ' + escapeHtml(item.pos || '') + '</div></td>' +
        '<td>' + escapeHtml(item.meaning || '暂无') + (item.example ? '<div class="form-hint hide-sm">' + escapeHtml(item.example) + '</div>' : '') + '</td>' +
        '<td class="hide-sm">' + formatDue(item.due) + '<div class="form-hint">熟悉度 ' + (item.familiarity || 0) + '/6</div></td>' +
        '<td style="white-space:nowrap;"><button class="btn btn-sm btn-ghost" data-action="word-speak" data-key="' + escapeAttr(item.key) + '">🔊</button> <button class="btn btn-sm btn-danger" data-action="word-delete" data-key="' + escapeAttr(item.key) + '">删除</button></td>' +
      '</tr>';
    }).join('');
    return '<div class="page">' +
      '<div class="page-head"><div><div class="eyebrow">Vocabulary</div><h1 class="page-title">生词本</h1><p class="page-sub">阅读时点击生词即可收藏。复习采用间隔重复：不熟的词多出现，熟悉的词慢慢拉长间隔。</p></div><div class="head-actions"><button class="btn btn-primary" data-action="start-review">开始复习' + (dueCount ? '（' + dueCount + ' 个待复习）' : '') + '</button></div></div>' +
      '<div class="stats-grid" style="margin-bottom:18px;">' +
        '<div class="card stat-card"><div class="stat-icon">🧠</div><div><strong>' + list.length + '</strong><span>收藏生词</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">⏰</div><div><strong>' + dueCount + '</strong><span>今天待复习</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">✅</div><div><strong>' + list.filter(function (item) { return (item.familiarity || 0) >= 3; }).length + '</strong><span>较熟悉的词</span></div></div>' +
      '</div>' +
      (list.length ? '<div class="card card-pad" style="overflow:auto;"><table class="vocab-table"><thead><tr><th>单词</th><th>释义 / 例句</th><th class="hide-sm">复习安排</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
        '<div class="card empty-state"><div class="big">📚</div><p>生词本还是空的。</p><p style="margin-top:6px;">去阅读页点击任意英文单词，就能加入生词本。</p><a class="btn btn-primary" href="#/reading" style="margin-top:14px;">去阅读文章</a></div>') +
    '</div>';
  }

  function rateWord(key, rate) {
    var item = state.words[key];
    if (item === undefined) return;
    item.reviews = (item.reviews || 0) + 1;
    if (rate === 'again') {
      item.familiarity = 0;
      item.due = Date.now() + 10 * 60 * 1000;
    } else if (rate === 'hard') {
      item.familiarity = Math.max(0, (item.familiarity || 0) - 1);
      item.due = Date.now() + 24 * 60 * 60 * 1000;
    } else {
      item.familiarity = clamp((item.familiarity || 0) + 1, 0, 6);
      item.due = dueAfter(item.familiarity);
    }
    saveState();
  }

  function bindVocabPage() {
    var start = $('[data-action="start-review"]');
    if (start) start.addEventListener('click', startVocabReview);
    var exit = $('[data-action="exit-review"]');
    if (exit) exit.addEventListener('click', function () { uiState.reviewMode = false; route(); });
    var flip = $('[data-action="flip-card"]');
    if (flip) flip.addEventListener('click', function () {
      uiState.reviewFlipped = uiState.reviewFlipped === false;
      route();
    });
    $$('[data-action="review-rate"]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var item = uiState.reviewQueue[uiState.reviewIndex];
        if (item === undefined) return;
        rateWord(item.key, button.getAttribute('data-rate'));
        uiState.reviewIndex += 1;
        uiState.reviewFlipped = false;
        if (uiState.reviewIndex >= uiState.reviewQueue.length) {
          uiState.reviewMode = false;
          completeTask('vocab');
          saveState();
          toast('本轮复习完成', 'good');
          route();
        } else {
          route();
        }
      });
    });
    $$('[data-action="review-speak"]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var item = uiState.reviewQueue[uiState.reviewIndex];
        if (item) speak(item.word, { cancel: true });
      });
    });
    $$('[data-action="word-speak"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-key');
        if (state.words[key]) speak(state.words[key].word, { cancel: true });
      });
    });
    $$('[data-action="word-delete"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-key');
        if (state.words[key]) {
          delete state.words[key];
          saveState();
          toast('已删除生词');
          route();
        }
      });
    });
  }

  function progressPage() {
    var days = [];
    for (var i = 6; i >= 0; i--) days.push(dateOffset(-i));
    var values = days.map(function (day) { return state.activity[day] || 0; });
    var maxValue = Math.max.apply(null, [1].concat(values));
    var totalMinutes = Object.keys(state.activity).reduce(function (sum, key) { return sum + (state.activity[key] || 0); }, 0);
    var completedDialogues = Object.keys(state.dialogueProgress).filter(function (id) { return state.dialogueProgress[id].completed; }).length;
    var bars = days.map(function (day, index) {
      var height = Math.max(5, Math.round((values[index] / maxValue) * 100));
      return '<div class="bar-col"><div class="bar" style="height:' + height + '%;"></div><small>' + day.slice(5).replace('-', '/') + '</small></div>';
    }).join('');
    return '<div class="page">' +
      '<div class="page-head"><div><div class="eyebrow">Your Progress</div><h1 class="page-title">学习进度</h1><p class="page-sub">记录每一次开口和阅读。看着数字增长，会更容易把练习坚持下去。</p></div><a class="btn btn-primary" href="#/today">回到今日练习</a></div>' +
      '<div class="stats-grid">' +
        '<div class="card stat-card"><div class="stat-icon">📚</div><div><strong>' + state.completedArticles.length + '</strong><span>读过的文章</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">🧠</div><div><strong>' + Object.keys(state.words).length + '</strong><span>收藏生词</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">💬</div><div><strong>' + completedDialogues + '</strong><span>完成对话</span></div></div>' +
        '<div class="card stat-card"><div class="stat-icon">🔥</div><div><strong>' + currentStreak() + '</strong><span>连续学习天数</span></div></div>' +
      '</div>' +
      '<div class="progress-grid" style="margin-top:18px;">' +
        '<div class="card chart-card"><h3 style="font-size:15px;">最近 7 天练习次数</h3><p class="form-hint">每完成文章、对话或复习都会记录</p><div class="bar-chart">' + bars + '</div></div>' +
        '<div class="card chart-card"><h3 style="font-size:15px;">本周打卡</h3><p class="form-hint">颜色点亮代表当天有过练习</p><div class="week-grid" style="margin-top:18px;">' + days.map(function (day) {
          var count = state.activity[day] || 0;
          return '<div class="day-pill ' + (count ? 'done' : '') + '"><strong>' + day.slice(8) + '</strong>' + (count ? count + ' 次' : '未练') + '</div>';
        }).join('') + '</div></div>' +
      '</div>' +
      '<div class="card card-pad" style="margin-top:18px;"><h3 style="font-size:15px;">学习记录</h3><div class="record-box" style="margin-top:14px;">' +
        '<div class="record-item"><strong>' + totalMinutes + '</strong><small>累计学习次数</small></div>' +
        '<div class="record-item"><strong>' + (state.completedArticles.length ? Math.round(Object.keys(state.words).length / state.completedArticles.length) : 0) + '</strong><small>平均每篇收藏生词</small></div>' +
        '<div class="record-item"><strong>' + (completedDialogues ? Math.round(completedDialogues / Math.max(1, currentStreak())) : 0) + '</strong><small>平均每天对话</small></div>' +
      '</div></div>' +
    '</div>';
  }

  function settingsPage() {
    loadVoices();
    var englishVoices = allVoices.filter(function (voice) { return /^en/i.test(voice.lang || ''); }).sort(function (a, b) {
      return voiceScore(b) - voiceScore(a) || String(a.name || '').localeCompare(String(b.name || ''));
    }).filter(function (voice) { return voiceIsScary(voice) === false; });
    var voiceOptions = englishVoices.map(function (voice) {
      return '<option value="' + escapeAttr(voice.voiceURI) + '"' + (state.settings.voiceURI === voice.voiceURI ? ' selected' : '') + '>' + escapeHtml(voice.name + ' · ' + voice.lang) + '</option>';
    }).join('');
    function switchRow(label, description, key) {
      var on = Boolean(state.settings[key]);
      return '<div class="switch-row"><div><strong style="font-size:13.5px;">' + label + '</strong><div class="form-hint">' + description + '</div></div><button class="switch ' + (on ? 'on' : '') + '" data-action="toggle-setting" data-setting="' + key + '"></button></div>';
    }
    return '<div class="page">' +
      '<div class="page-head"><div><div class="eyebrow">Settings</div><h1 class="page-title">设置</h1><p class="page-sub">调整发音速度、口音和练习偏好。所有数据只保存在当前浏览器中。</p></div></div>' +
      '<div class="settings-grid">' +
        '<div class="card card-pad"><h3 style="font-size:15px;margin-bottom:6px;">阅读与显示</h3>' +
          switchRow('自动显示中文翻译', '打开后文章默认显示中英对照', 'showZh') +
          switchRow('点击句子自动朗读', '点击任意英文句子立即听发音', 'autoSpeak') +
          switchRow('允许在线词典补充', '本地没有收录时，尝试联网查询音标和中文', 'onlineDict') +
          '<div class="form-row" style="margin-top:14px;"><label>每日目标（项）</label><select data-setting="dailyGoal"><option value="1"' + (state.settings.dailyGoal === 1 ? ' selected' : '') + '>轻量：1 项</option><option value="2"' + (state.settings.dailyGoal === 2 ? ' selected' : '') + '>标准：2 项</option><option value="3"' + (state.settings.dailyGoal === 3 ? ' selected' : '') + '>加强：3 项</option></select></div>' +
        '</div>' +
        '<div class="card card-pad"><h3 style="font-size:15px;margin-bottom:6px;">发音设置</h3>' +
          '<div class="form-row"><label>英语口音</label><select data-setting="accent"><option value="en-US"' + (state.settings.accent === 'en-US' ? ' selected' : '') + '>美式英语 en-US</option><option value="en-GB"' + (state.settings.accent === 'en-GB' ? ' selected' : '') + '>英式英语 en-GB</option><option value="en-AU"' + (state.settings.accent === 'en-AU' ? ' selected' : '') + '>澳式英语 en-AU</option></select></div>' +
          '<div class="form-row"><label>朗读声音</label><select data-setting="voiceURI"><option value="">自动选择自然声音（推荐）</option>' + voiceOptions + '</select><div class="form-hint">已自动过滤系统里的搞怪音色。推荐选择带 Natural、Google、Samantha、Ava、Aria、Jenny 等字样的声音。</div></div>' +
          '<div class="form-row"><label>朗读速度：<span id="rate-label">' + state.settings.rate.toFixed(2) + 'x</span></label><input type="range" min="0.6" max="1.25" step="0.02" value="' + state.settings.rate + '" data-setting="rate"></div>' +
          '<button class="btn btn-soft btn-wide" data-action="test-voice">🔊 试听当前发音</button><button class="btn btn-ghost btn-wide" style="margin-top:8px;" data-action="reset-voice">恢复推荐自然音色</button>' +
        '</div>' +
        '<div class="card card-pad"><h3 style="font-size:15px;margin-bottom:8px;">主题与帮助</h3>' +
          '<div class="switch-row"><div><strong style="font-size:13.5px;">深色模式</strong><div class="form-hint">晚上练习时更护眼</div></div><button class="switch ' + (state.theme === 'dark' ? 'on' : '') + '" data-action="toggle-setting" data-setting="themeDark"></button></div>' +
          '<p class="form-hint" style="margin-top:14px;">语音识别需要较新的 Chrome / Edge 浏览器，并授权麦克风。当前状态下，如果不想开口，也可以直接打字完成对话。</p>' +
          '<button class="btn btn-ghost btn-wide" style="margin-top:12px;" data-action="open-help">查看使用帮助</button>' +
        '</div>' +
        '<div class="card card-pad"><h3 style="font-size:15px;margin-bottom:8px;">数据管理</h3><p class="form-hint">进度、生词和设置保存在浏览器 localStorage 中，换电脑不会同步。</p><button class="btn btn-danger btn-wide" style="margin-top:14px;" data-action="clear-data">清空全部学习数据</button></div>' +
      '</div>' +
    '</div>';
  }

  function bindSettingsPage() {
    $$('[data-setting]').forEach(function (control) {
      var key = control.getAttribute('data-setting');
      if (control.tagName === 'SELECT') {
        control.addEventListener('change', function () {
          if (key === 'dailyGoal') state.settings.dailyGoal = Number(control.value);
          else state.settings[key] = control.value;
          saveState();
          if (key === 'accent' || key === 'voiceURI') speak('Hello, this is a sample of your English practice voice.', { cancel: true });
          toast('设置已保存', 'good');
        });
      }
      if (control.tagName === 'INPUT' && control.type === 'range') {
        control.addEventListener('input', function () {
          state.settings.rate = Number(control.value);
          var label = $('#rate-label');
          if (label) label.textContent = state.settings.rate.toFixed(2) + 'x';
          saveState();
        });
        control.addEventListener('change', function () { speak('This is the new speaking speed.', { cancel: true }); });
      }
    });
    $$('[data-action="toggle-setting"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-setting');
        if (key === 'themeDark') {
          state.theme = state.theme === 'dark' ? 'light' : 'dark';
          saveState();
          route();
        } else {
          state.settings[key] = state.settings[key] === false;
          button.classList.toggle('on', state.settings[key]);
          saveState();
          if (key === 'showZh') toast(state.settings.showZh ? '阅读默认显示中文' : '阅读默认隐藏中文');
        }
      });
    });
    var test = $('[data-action="test-voice"]');
    if (test) test.addEventListener('click', function () {
      speak('Reading and speaking a little every day can change your English.', { cancel: true });
    });
    var resetVoice = $('[data-action="reset-voice"]');
    if (resetVoice) resetVoice.addEventListener('click', function () {
      state.settings.voiceURI = '';
      saveState();
      toast('已恢复推荐自然音色', 'good');
      route();
      setTimeout(function () { speak('This should be a clearer and more natural voice.', { cancel: true }); }, 180);
    });
    var clear = $('[data-action="clear-data"]');
    if (clear) clear.addEventListener('click', function () {
      if (confirm('确定要清空全部阅读、生词和口语记录吗？这个操作无法撤销。')) {
        state = mergeDeep(DEFAULT_STATE, {});
        saveState();
        uiState = { articleFocus: {}, readerToken: 0, currentWord: null, dialogueSession: null, reviewQueue: [], reviewIndex: 0, reviewFlipped: false, reviewMode: false, page: 'today' };
        toast('学习数据已清空');
        route();
      }
    });
  }

  function showHelp() {
    openModal(modalShell('使用帮助',
      '<div style="display:grid;gap:14px;font-size:14px;line-height:1.7;color:var(--text-soft);">' +
        '<div><strong style="color:var(--text);">1. 每天先读一篇</strong><br>在“英文阅读”里选一篇新闻风格文章。先通读，不要停下来查每个词；第二遍再点击生词查看释义并收藏。</div>' +
        '<div><strong style="color:var(--text);">2. 让耳朵和嘴巴参与</strong><br>点击“朗读全文”听整篇，或点任意句子听单句。打开“逐段精读”，跟着音频模仿语气和停顿。</div>' +
        '<div><strong style="color:var(--text);">3. 用口语对话做输出</strong><br>进入“口语对话”，选择点咖啡、问路、闲聊等场景。点麦克风作答，或者直接输入英文。系统会按关键词给出是否继续的反馈。</div>' +
        '<div><strong style="color:var(--text);">4. 复习生词形成长期记忆</strong><br>“生词复习”使用间隔重复：不认识的词很快再出现，认识的词间隔会逐渐拉长。</div>' +
        '<div style="padding:12px 14px;border-radius:12px;background:var(--surface-2);">浏览器建议：使用 Chrome 或 Edge。语音识别需要麦克风权限；如果通过 file:// 打开页面导致麦克风不可用，请用本地服务器访问。</div>' +
      '</div>',
      '<button class="btn btn-primary" data-action="close-modal">开始练习</button>'));
  }

  function route() {
    var hash = location.hash || '#/today';
    var parts = hash.replace(/^#\/?/, '').split('/').filter(function (item) { return item; });
    var page = parts[0] || 'today';
    if (popover) popover.hidden = true;
    try {
      if (page === 'article' && parts[1]) {
        mountPage('reading', articlePage(parts[1]), function () { bindArticlePage(parts[1]); });
      } else if (page === 'dialogue' && parts[1]) {
        mountPage('speaking', dialoguePage(parts[1]), function () { bindDialoguePage(parts[1]); });
      } else if (page === 'reading') {
        mountPage('reading', readingPage(), bindReadingPage);
      } else if (page === 'speaking') {
        mountPage('speaking', speakingPage(), bindSpeakingPage);
      } else if (page === 'vocab') {
        mountPage('vocab', vocabPage(), bindVocabPage);
      } else if (page === 'progress') {
        mountPage('progress', progressPage(), null);
      } else if (page === 'settings') {
        mountPage('settings', settingsPage(), bindSettingsPage);
      } else {
        mountPage('today', todayPage(), bindTodayPage);
      }
    } catch (error) {
      console.error(error);
      mountPage('today', '<div class="page"><div class="card empty-state"><div class="big">⚠️</div><p>页面加载出了点问题，请刷新后再试。</p><button class="btn btn-primary" data-action="reload-page" style="margin-top:12px;">刷新页面</button></div></div>', function () {
        var reload = $('[data-action="reload-page"]');
        if (reload) reload.addEventListener('click', function () { location.reload(); });
      });
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (target.closest && target.closest('[data-action="open-help"]')) {
      showHelp();
      return;
    }
    if (target.closest && target.closest('[data-action="close-modal"]')) {
      closeModal();
    }
  });

  if (modalRoot) {
    modalRoot.addEventListener('click', function (event) {
      if (event.target === modalRoot) closeModal();
    });
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeModal();
      if (popover) popover.hidden = true;
    }
  });

  route();
})();
