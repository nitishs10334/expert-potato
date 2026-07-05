const PAPER_DIR = "papers/";
const USERNAME_KEY = "offlineExamPortal.username";
const RESERVED_PAPER_FILES = new Set(["manifest.json", "paper.schema.json"]);

function storageKey() {
  return `offlineExamPortal.v1.${state.username}`;
}

const state = {
  view: "dashboard",
  username: localStorage.getItem(USERNAME_KEY) || "",
  papers: [],
  importedPapers: [],
  attempts: [],
  settings: {
    theme: "light",
    fontScale: 1,
    showTimerWarnings: true,
    shortcuts: true
  },
  filters: { search: "", sort: "title", section: "all" },
  activeAttemptId: null,
  currentQuestion: 0,
  timer: null,
  lastTick: Date.now()
};

const $ = (selector, root = document) => root.querySelector(selector);
const getApp = () => document.getElementById("app");

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadStore() {
  const stored = JSON.parse(localStorage.getItem(storageKey()) || "{}");
  state.attempts = stored.attempts || [];
  state.importedPapers = (stored.importedPapers || []).map(paper => normalizePaper(paper, paper.source || "imported"));
  state.settings = { ...state.settings, ...(stored.settings || {}) };
  applySettings();
}

function saveStore() {
  localStorage.setItem(storageKey(), JSON.stringify({
    attempts: state.attempts,
    importedPapers: state.importedPapers,
    settings: state.settings
  }));
}

function setUsername(name) {
  state.username = name.trim();
  localStorage.setItem(USERNAME_KEY, state.username);
  loadStore();
}

function switchUser() {
  state.username = "";
  localStorage.removeItem(USERNAME_KEY);
  state.attempts = [];
  state.importedPapers = [];
  state.view = "dashboard";
  stopTimer();
  render();
}

function setUsername(name) {
  state.username = name.trim();
  localStorage.setItem(USERNAME_KEY, state.username);
  loadStore();
}

function switchUser() {
  state.username = "";
  localStorage.removeItem(USERNAME_KEY);
  state.attempts = [];
  state.importedPapers = [];
  state.view = "dashboard";
  stopTimer();
  render();
}

function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--font-scale", state.settings.fontScale);
}

async function loadPapers() {
  const loaded = [];
  const files = await discoverPaperFiles();
  for (const file of files) {
    try {
      const paper = await fetch(`${PAPER_DIR}${file}`, { cache: "no-store" }).then(r => r.json());
      loaded.push(normalizePaper(paper, file));
    } catch (error) {
      console.warn(`Could not load paper ${file}`, error);
    }
  }
  state.papers = [...state.importedPapers, ...loaded.filter(paper => !state.importedPapers.some(imported => imported.id === paper.id))];
}

async function discoverPaperFiles() {
  const files = new Set();
  try {
    const manifest = await fetch(`${PAPER_DIR}manifest.json`, { cache: "no-store" }).then(r => r.json());
    manifest.forEach(file => files.add(file));
  } catch (error) {
    console.warn("Paper manifest not available", error);
  }
  try {
    const html = await fetch(PAPER_DIR, { cache: "no-store" }).then(r => r.text());
    const doc = new DOMParser().parseFromString(html, "text/html");
    [...doc.querySelectorAll("a[href]")]
      .map(link => decodeURIComponent(link.getAttribute("href").split("/").pop().split("?")[0]))
      .filter(file => file.endsWith(".json") && !RESERVED_PAPER_FILES.has(file))
      .forEach(file => files.add(file));
  } catch (error) {
    console.warn("Paper directory listing not available", error);
  }
  return [...files];
}

function normalizePaper(paper, source = "imported") {
  const sections = (paper.sections || []).map((section, sectionIndex) => ({
    id: section.id || `section-${sectionIndex + 1}`,
    title: section.title || section.name || `Section ${sectionIndex + 1}`,
    durationMinutes: Number(section.durationMinutes || 0),
    metadata: section.metadata || {},
    questions: (section.questions || []).map((question, questionIndex) => ({
      id: question.id || `${section.id || sectionIndex + 1}-${questionIndex + 1}`,
      type: question.type || "single",
      displayNumber: question.displayNumber || question.number || "",
      metadata: question.metadata || {},
      text: question.text || question.question || "",
      passage: question.passage || "",
      imageUrl: question.imageUrl || question.image || "",
      figure: question.figure || null,
      options: question.options || [],
      answer: question.answer ?? question.correctAnswer ?? null,
      scoring: question.scoring || null,
      tolerance: Number(question.tolerance || 0),
      explanation: question.explanation || ""
    }))
  }));
  const questions = sections.flatMap((section, sectionIndex) =>
    section.questions.map((question, questionIndex) => ({
      ...question,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionMetadata: section.metadata,
      number: questionIndex + 1,
      globalNumber: sections.slice(0, sectionIndex).reduce((sum, s) => sum + s.questions.length, 0) + questionIndex + 1,
      displayNumber: question.displayNumber || String(sections.slice(0, sectionIndex).reduce((sum, s) => sum + s.questions.length, 0) + questionIndex + 1)
    }))
  );
  return {
    id: paper.id || source.replace(/\.json$/i, ""),
    source,
    title: paper.title || "Untitled Paper",
    subtitle: paper.subtitle || "",
    version: paper.version || "",
    metadata: paper.metadata || {},
    durationMinutes: Number(paper.durationMinutes || sections.reduce((sum, s) => sum + s.durationMinutes, 0) || questions.length),
    language: paper.language || "",
    tags: paper.tags || [],
    instructions: paper.instructions || [],
    marking: { correct: 1, incorrect: -0.33333, unattempted: 0, partial: false, ...(paper.marking || {}) },
    analytics: paper.analytics || {},
    sections,
    questions
  };
}

function activeAttempt() {
  return state.attempts.find(attempt => attempt.id === state.activeAttemptId);
}

function paperFor(id) {
  return state.papers.find(paper => paper.id === id) || state.attempts.find(a => a.paperSnapshot?.id === id)?.paperSnapshot;
}

function createAttempt(paper) {
  const now = new Date().toISOString();
  const attempt = {
    id: uid("attempt"),
    paperId: paper.id,
    paperSnapshot: paper,
    status: "in-progress",
    startedAt: now,
    updatedAt: now,
    submittedAt: null,
    remainingSeconds: paper.durationMinutes * 60,
    answers: {},
    marked: {},
    visited: {},
    timeByQuestion: Object.fromEntries(paper.questions.map(q => [q.id, 0])),
    result: null
  };
  state.attempts.unshift(attempt);
  state.activeAttemptId = attempt.id;
  state.currentQuestion = 0;
  saveStore();
  enterExam();
}

function render() {
  if (!state.username) return renderWelcome();
  if (state.view === "exam") return renderExam();
  stopTimer();
  getApp().className = "app-shell";
  getApp().innerHTML = `
    <header class="topbar">
      <div class="brand"><div class="brand-mark">EX</div><div>Offline Examination Portal</div></div>
      <div class="top-actions">
        <span class="user-badge">👤 ${escapeHtml(state.username)}</span>
        <button data-action="switchUser">Switch User</button>
        <button data-action="import">Import JSON</button>
        <input type="file" id="paperImport" accept=".json,application/json" hidden>
        <button data-action="theme">${state.settings.theme === "dark" ? "Light" : "Dark"}</button>
      </div>
    </header>
    <main class="layout">
      <aside class="sidebar">
        ${navButton("dashboard", "Dashboard")}
        ${navButton("library", "Paper Library")}
        ${navButton("attempts", "Previous Attempts")}
        ${navButton("settings", "Settings")}
      </aside>
      <section class="content">${renderView()}</section>
    </main>
  `;
  bindShellEvents();
}

function renderWelcome() {
  stopTimer();
  getApp().className = "app-shell";
  getApp().innerHTML = `
    <div class="welcome-overlay">
      <div class="welcome-card">
        <div class="brand" style="justify-content:center;margin-bottom:18px">
          <div class="brand-mark" style="width:48px;height:48px;font-size:20px">EX</div>
        </div>
        <h1 style="margin:0 0 6px;font-size:22px">Offline Examination Portal</h1>
        <p class="muted" style="margin:0 0 24px">Enter your username to load your personal attempt history. No password needed — keep your username private to keep your data private.</p>
        <input id="usernameInput" class="username-input" placeholder="Enter your username..." maxlength="40" autocomplete="off" spellcheck="false">
        <button id="usernameSubmit" class="primary" style="width:100%;margin-top:12px;min-height:44px;font-size:16px">Start →</button>
        <p class="muted" style="font-size:12px;margin-top:16px">Your attempts and progress are stored privately in this browser under your username.</p>
      </div>
    </div>
  `;
  const input = $("#usernameInput");
  const submit = $("#usernameSubmit");
  input.focus();
  const go = () => {
    const name = input.value.trim();
    if (!name) { input.style.borderColor = "var(--red)"; input.focus(); return; }
    setUsername(name);
    render();
  };
  submit.onclick = go;
  input.onkeydown = e => { if (e.key === "Enter") go(); };
}

function navButton(view, label) {
  return `<button class="nav-btn ${state.view === view ? "active" : ""}" data-view="${view}">${label}<span>${viewCount(view)}</span></button>`;
}

function viewCount(view) {
  if (view === "library") return state.papers.length;
  if (view === "attempts") return state.attempts.length;
  if (view === "dashboard") return state.attempts.filter(a => a.status === "in-progress").length;
  return "";
}

function renderView() {
  if (state.view === "library") return renderLibrary();
  if (state.view === "attempts") return renderAttempts();
  if (state.view === "settings") return renderSettings();
  if (state.view === "review") return renderReview();
  return renderDashboard();
}

function renderDashboard() {
  const completed = state.attempts.filter(a => a.status === "submitted");
  const inProgress = state.attempts.filter(a => a.status === "in-progress");
  const best = completed.reduce((max, a) => Math.max(max, a.result?.percentage || 0), 0);
  return `
    <div class="grid stats-grid">
      ${stat("Available Papers", state.papers.length)}
      ${stat("Previous Attempts", state.attempts.length)}
      ${stat("Resume Test", inProgress.length)}
      ${stat("Best Score", `${best.toFixed(1)}%`)}
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><strong>Resume Test</strong><span class="muted">Autosaved unfinished attempts</span></div>
      <div class="panel-body">${inProgress.length ? inProgress.map(attemptRow).join("") : empty("No unfinished tests.")}</div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><strong>Available Papers</strong><button data-view="library">Open Library</button></div>
      <div class="panel-body"><div class="grid cards-grid">${state.papers.slice(0, 6).map(paperCard).join("") || empty("No papers detected. Add JSON files to papers/manifest.json or import one.")}</div></div>
    </div>
  `;
}

function stat(label, value) {
  return `<div class="card"><div class="muted">${label}</div><div class="stat-value">${value}</div></div>`;
}

function renderLibrary() {
  const sections = [...new Set(state.papers.flatMap(p => p.sections.map(s => s.title)))];
  const papers = filteredPapers();
  return `
    <div class="toolbar">
      <input data-filter="search" placeholder="Search papers and metadata..." value="${escapeHtml(state.filters.search)}">
      <select data-filter="section"><option value="all">All sections</option>${sections.map(s => `<option ${state.filters.section === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select data-filter="sort">
        <option value="title" ${state.filters.sort === "title" ? "selected" : ""}>Title</option>
        <option value="duration" ${state.filters.sort === "duration" ? "selected" : ""}>Duration</option>
        <option value="questions" ${state.filters.sort === "questions" ? "selected" : ""}>Questions</option>
      </select>
    </div>
    <div class="grid cards-grid">${papers.map(paperCard).join("") || empty("No papers match the current filters.")}</div>
  `;
}

function filteredPapers() {
  const text = state.filters.search.toLowerCase();
  return [...state.papers].filter(paper => {
    const haystack = `${paper.title} ${paper.subtitle} ${Object.values(paper.metadata).join(" ")} ${paper.tags.join(" ")}`.toLowerCase();
    const sectionOk = state.filters.section === "all" || paper.sections.some(s => s.title === state.filters.section);
    return haystack.includes(text) && sectionOk;
  }).sort((a, b) => {
    if (state.filters.sort === "duration") return b.durationMinutes - a.durationMinutes;
    if (state.filters.sort === "questions") return b.questions.length - a.questions.length;
    return a.title.localeCompare(b.title);
  });
}

function paperCard(paper) {
  return `
    <article class="card">
      <h3 class="paper-title">${escapeHtml(paper.title)}</h3>
      <div class="muted">${escapeHtml(paper.subtitle || paper.metadata.exam || paper.metadata.category || "")}</div>
      <div class="meta">
        <span class="pill">${paper.questions.length} questions</span>
        <span class="pill">${paper.durationMinutes} min</span>
        <span class="pill">${paper.sections.length} sections</span>
        ${paper.language ? `<span class="pill">${escapeHtml(paper.language)}</span>` : ""}
      </div>
      <div class="muted">${paper.sections.map(s => escapeHtml(s.title)).join(", ")}</div>
      <div class="split" style="margin-top:14px">
        <button data-paper="${paper.id}" data-action="start" class="primary">Start Test</button>
        <button data-paper="${paper.id}" data-action="metadata">Metadata</button>
      </div>
      <div class="split" style="margin-top:8px">
        <button data-paper="${paper.id}" data-action="paperPDF" title="Download blank question paper as PDF">📄 Paper PDF</button>
        <button data-paper="${paper.id}" data-action="keyPDF" title="Download answer key with explanations as PDF">🔑 Answer Key PDF</button>
      </div>
    </article>
  `;
}

function renderAttempts() {
  return `<div class="panel"><div class="panel-header"><strong>Attempt History</strong><span class="muted">Stored permanently in this browser</span></div><div class="panel-body">${state.attempts.map(attemptRow).join("") || empty("No attempts yet.")}</div></div>`;
}

function attemptRow(attempt) {
  const paper = attempt.paperSnapshot || paperFor(attempt.paperId);
  const score = attempt.result ? `${attempt.result.percentage.toFixed(1)}%` : `${formatTime(attempt.remainingSeconds)} left`;
  return `
    <div class="attempt-row">
      <div>
        <strong>${escapeHtml(paper?.title || attempt.paperId)}</strong>
        <div class="muted">${attempt.status} • Started ${new Date(attempt.startedAt).toLocaleString()} • ${score}</div>
      </div>
      <div class="top-actions">
        ${attempt.status === "in-progress" ? `<button data-attempt="${attempt.id}" data-action="resume" class="primary">Resume</button>` : `<button data-attempt="${attempt.id}" data-action="review">Review</button>`}
        ${attempt.status === "submitted" ? `<button data-attempt="${attempt.id}" data-action="analysis">Analysis</button>` : ""}
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="panel">
      <div class="panel-header"><strong>Settings</strong><span class="muted">Saved locally</span></div>
      <div class="panel-body">
        <label class="setting-row"><span>Theme</span><select data-setting="theme"><option value="light">Light</option><option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Dark</option></select></label>
        <label class="setting-row"><span>Font size</span><input data-setting="fontScale" type="range" min="0.9" max="1.2" step="0.05" value="${state.settings.fontScale}"></label>
        <label class="setting-row"><span>Timer warnings</span><input data-setting="showTimerWarnings" type="checkbox" ${state.settings.showTimerWarnings ? "checked" : ""}></label>
        <label class="setting-row"><span>Keyboard shortcuts</span><input data-setting="shortcuts" type="checkbox" ${state.settings.shortcuts ? "checked" : ""}></label>
        <div class="card" style="margin-top:14px">
          <strong>Shortcuts</strong>
          <p class="muted">N: next, P: previous, S: save and next, M: mark for review, C: clear response, F: fullscreen.</p>
        </div>
      </div>
    </div>
  `;
}

function renderExam() {
  const attempt = activeAttempt();
  const paper = attempt.paperSnapshot;
  const question = paper.questions[state.currentQuestion];
  attempt.visited[question.id] = true;
  saveStore();
  getApp().className = "exam-shell";
  getApp().innerHTML = `
    <header class="exam-header">
      <div><strong>${escapeHtml(paper.title)}</strong><div>${escapeHtml(question.sectionTitle)} • Question ${state.currentQuestion + 1} of ${paper.questions.length}</div></div>
      <div class="top-actions"><div class="timer ${attempt.remainingSeconds <= 300 ? "low" : ""}">${formatTime(attempt.remainingSeconds)}</div><button data-exam="fullscreen">Fullscreen</button><button data-exam="submit" class="danger">Submit Test</button></div>
    </header>
    <main class="exam-main">
      <section class="question-area">
        <div class="section-tabs">${paper.sections.map(section => `<button class="${section.id === question.sectionId ? "active" : ""}" data-section="${section.id}">${escapeHtml(section.title)}</button>`).join("")}</div>
        <article class="question-card">
          <div class="question-strip"><strong>Question ${escapeHtml(question.displayNumber)}</strong><span class="pill">${questionMetaLabel(question)}</span></div>
          <div class="question-body">${renderQuestion(question, attempt)}</div>
        </article>
      </section>
      <aside class="palette">
        <div class="candidate"><strong>Question Palette</strong><div class="muted">${paletteSummary(attempt, paper)}</div></div>
        <div class="palette-grid">${paper.questions.map((q, index) => `<button class="qbtn ${questionStatus(attempt, q)} ${index === state.currentQuestion ? "current" : ""}" data-jump="${index}">${index + 1}</button>`).join("")}</div>
        <div class="legend"><span><i class="dot answered"></i>Answered</span><span><i class="dot review"></i>Review</span><span><i class="dot not-answered"></i>Not answered</span><span><i class="dot"></i>Not visited</span></div>
      </aside>
    </main>
    <footer class="exam-footer">
      <div class="top-actions"><button data-exam="prev">Previous</button><button data-exam="clear" class="warning">Clear Response</button><button data-exam="mark">Mark for Review</button></div>
      <div class="top-actions"><button data-exam="next">Next</button><button data-exam="saveNext" class="primary">Save & Next</button></div>
    </footer>
  `;
}

function renderQuestion(question, attempt) {
  const answer = attempt.answers[question.id];
  const media = `${question.passage ? `<div class="passage">${escapeHtml(question.passage)}</div>` : ""}${question.imageUrl ? `<img class="question-image" src="${question.imageUrl}" alt="Question image">` : ""}${question.figure ? `<div class="figure-box"><div><strong>${escapeHtml(question.figure.label || "Figure")}</strong><br>${escapeHtml(question.figure.description || "Figure placeholder")}</div></div>` : ""}`;
  if (question.type === "numerical" || question.type === "fill") {
    return `${media}<p>${escapeHtml(question.text)}</p><input class="answer-input" data-answer-input value="${escapeHtml(answer || "")}" placeholder="Type your answer">`;
  }
  return `${media}<p>${escapeHtml(question.text)}</p><div class="options">${question.options.map(option => {
    const checked = question.type === "multiple" ? (answer || []).includes(option.id) : answer === option.id;
    return `<label class="option"><input type="${question.type === "multiple" ? "checkbox" : "radio"}" name="answer" value="${option.id}" ${checked ? "checked" : ""}><span><strong>${option.id}.</strong> ${escapeHtml(option.text)}</span></label>`;
  }).join("")}</div>`;
}

function enterExam() {
  state.view = "exam";
  state.lastTick = Date.now();
  startTimer();
  render();
}

function startTimer() {
  stopTimer();
  state.timer = setInterval(() => {
    const attempt = activeAttempt();
    if (!attempt || attempt.status !== "in-progress") return stopTimer();
    const now = Date.now();
    const elapsed = Math.max(1, Math.floor((now - state.lastTick) / 1000));
    state.lastTick = now;
    const question = attempt.paperSnapshot.questions[state.currentQuestion];
    attempt.remainingSeconds = Math.max(0, attempt.remainingSeconds - elapsed);
    attempt.timeByQuestion[question.id] = (attempt.timeByQuestion[question.id] || 0) + elapsed;
    attempt.updatedAt = new Date().toISOString();
    saveStore();
    $(".timer") && ($(".timer").textContent = formatTime(attempt.remainingSeconds));
    if (attempt.remainingSeconds === 0) submitAttempt(true);
  }, 1000);
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function captureAnswer() {
  const attempt = activeAttempt();
  if (!attempt) return;
  const question = attempt.paperSnapshot.questions[state.currentQuestion];
  if (question.type === "numerical" || question.type === "fill") {
    const value = $("[data-answer-input]")?.value.trim();
    if (value) attempt.answers[question.id] = value;
    else delete attempt.answers[question.id];
  } else if (question.type === "multiple") {
    const values = [...document.querySelectorAll('input[name="answer"]:checked')].map(input => input.value);
    if (values.length) attempt.answers[question.id] = values;
    else delete attempt.answers[question.id];
  } else {
    const value = $('input[name="answer"]:checked')?.value;
    if (value) attempt.answers[question.id] = value;
    else delete attempt.answers[question.id];
  }
  attempt.updatedAt = new Date().toISOString();
  saveStore();
}

function move(delta) {
  captureAnswer();
  const attempt = activeAttempt();
  state.currentQuestion = Math.max(0, Math.min(attempt.paperSnapshot.questions.length - 1, state.currentQuestion + delta));
  renderExam();
}

function submitAttempt(auto = false) {
  captureAnswer();
  const attempt = activeAttempt();
  if (!attempt) return;
  if (!auto && !confirm("Submit test? You cannot resume this attempt after submission.")) return;
  attempt.status = "submitted";
  attempt.submittedAt = new Date().toISOString();
  attempt.updatedAt = attempt.submittedAt;
  attempt.result = evaluateAttempt(attempt);
  saveStore();
  stopTimer();
  state.view = "review";
  render();
}

function evaluateAttempt(attempt) {
  const paper = attempt.paperSnapshot;
  const rows = paper.questions.map(question => {
    const userAnswer = attempt.answers[question.id];
    const hasAnswerKey = question.answer !== null && question.answer !== undefined;
    const attempted = userAnswer !== undefined && userAnswer !== "" && !(Array.isArray(userAnswer) && userAnswer.length === 0);
    const correct = hasAnswerKey && attempted && isCorrect(question, userAnswer);
    const scoring = { ...paper.marking, ...(question.scoring || {}) };
    const marks = !hasAnswerKey ? 0 : !attempted ? scoring.unattempted : correct ? scoring.correct : scoring.incorrect;
    return {
      questionId: question.id,
      section: question.sectionTitle,
      metadata: question.metadata,
      attempted,
      correct,
      marks,
      time: attempt.timeByQuestion[question.id] || 0
    };
  });
  const correct = rows.filter(r => r.correct).length;
  const incorrect = rows.filter(r => r.attempted && !r.correct).length;
  const unattempted = rows.filter(r => !r.attempted).length;
  const score = rows.reduce((sum, r) => sum + Number(r.marks || 0), 0);
  const maxScore = paper.questions.reduce((sum, question) => {
    if (question.answer === null || question.answer === undefined) return sum;
    return sum + Number((question.scoring || paper.marking).correct || paper.marking.correct || 1);
  }, 0);
  return {
    score, maxScore, correct, incorrect, unattempted,
    percentage: maxScore ? (score / maxScore) * 100 : 0,
    accuracy: correct + incorrect ? (correct / (correct + incorrect)) * 100 : 0,
    rows
  };
}

function isCorrect(question, userAnswer) {
  if (question.type === "multiple") {
    return JSON.stringify([...(userAnswer || [])].sort()) === JSON.stringify([...(question.answer || [])].sort());
  }
  if (question.type === "numerical") {
    return Math.abs(Number(userAnswer) - Number(question.answer)) <= Number(question.tolerance || 0);
  }
  return String(userAnswer).trim().toLowerCase() === String(question.answer).trim().toLowerCase();
}

function renderReview() {
  const attempt = activeAttempt() || state.attempts.find(a => a.status === "submitted");
  if (!attempt?.result) return empty("No submitted attempt selected.");
  const paper = attempt.paperSnapshot;
  return `
    <div class="grid result-grid">
      ${stat("Score", `${attempt.result.score}/${attempt.result.maxScore}`)}
      ${stat("Percentage", `${attempt.result.percentage.toFixed(1)}%`)}
      ${stat("Accuracy", `${attempt.result.accuracy.toFixed(1)}%`)}
      ${stat("Correct / Wrong / Left", `${attempt.result.correct}/${attempt.result.incorrect}/${attempt.result.unattempted}`)}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button data-paper="${paper.id}" data-action="keyPDF">🔑 Download Solutions PDF</button>
      <button data-paper="${paper.id}" data-action="paperPDF">📄 Download Question Paper PDF</button>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><strong>Analysis</strong><span class="muted">Driven by analytics metadata in the paper JSON</span></div>
      <div class="panel-body">${analysisTables(attempt)}</div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="panel-header"><strong>Review Mode</strong><span class="muted">${escapeHtml(paper.title)}</span></div>
      <div class="panel-body">${paper.questions.map((q, index) => reviewQuestion(q, attempt, index)).join("")}</div>
    </div>
  `;
}

function reviewQuestion(question, attempt) {
  const userAnswer = attempt.answers[question.id];
  const attempted = userAnswer !== undefined;
  const correct = attempted && isCorrect(question, userAnswer);
  return `<div class="card ${correct ? "review-correct" : attempted ? "review-wrong" : ""}" style="margin-bottom:12px">
    <div class="split"><strong>${escapeHtml(question.displayNumber)}. ${escapeHtml(primaryQuestionLabel(question))}</strong><span class="pill">${formatTime(attempt.timeByQuestion[question.id] || 0)}</span></div>
    <p>${escapeHtml(question.text)}</p>
    <div><strong>Your answer:</strong> ${formatAnswer(question, userAnswer) || "<span class='muted'>Unattempted</span>"}</div>
    <div><strong>Correct answer:</strong> ${formatAnswer(question, question.answer)}</div>
    <p class="muted">${escapeHtml(question.explanation || "No explanation provided.")}</p>
  </div>`;
}

function analysisTables(attempt) {
  const rows = attempt.result.rows;
  const keys = analyticsKeys(attempt);
  return keys.map(key => `<h3>${labelFor(key)} wise</h3>${metricTable(groupMetrics(rows, key))}`).join("") + weakStrong(rows, keys);
}

function groupMetrics(rows, key) {
  const groups = {};
  rows.forEach(row => {
    const name = key === "section" ? row.section : row.metadata?.[key];
    if (!name) return;
    groups[name] ||= { name, total: 0, correct: 0, attempted: 0, time: 0, marks: 0 };
    groups[name].total++;
    groups[name].correct += row.correct ? 1 : 0;
    groups[name].attempted += row.attempted ? 1 : 0;
    groups[name].time += row.time;
    groups[name].marks += row.marks;
  });
  return Object.values(groups);
}

function metricTable(groups) {
  return `<table class="analysis-table"><thead><tr><th>Name</th><th>Attempted</th><th>Correct</th><th>Marks</th><th>Time</th></tr></thead><tbody>${groups.map(g => `<tr><td>${escapeHtml(g.name)}</td><td>${g.attempted}/${g.total}</td><td>${g.correct}</td><td>${g.marks}</td><td>${formatTime(g.time)}</td></tr>`).join("")}</tbody></table>`;
}

function weakStrong(rows, keys) {
  const key = keys.find(item => item !== "section");
  if (!key) return "";
  const topics = groupMetrics(rows, key).map(g => ({ ...g, accuracy: g.attempted ? g.correct / g.attempted : 0 }));
  const strong = topics.filter(t => t.attempted && t.accuracy >= .75).map(t => t.name).join(", ") || "None yet";
  const weak = topics.filter(t => !t.attempted || t.accuracy < .5).map(t => t.name).join(", ") || "None flagged";
  return `<div class="grid cards-grid" style="margin-top:14px"><div class="card"><strong>Strong areas</strong><p class="muted">${escapeHtml(strong)}</p></div><div class="card"><strong>Weak areas</strong><p class="muted">${escapeHtml(weak)}</p></div></div>`;
}

/* ── PDF Generation ──────────────────────────────────────── */
function buildPrintWindow(title, htmlBody) {
  const win = window.open("", "_blank");
  if (!win) { alert("Pop-up blocked! Please allow pop-ups for this page."); return; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:28px 36px}
    h1{font-size:20px;margin-bottom:4px}
    .subtitle{color:#555;font-size:13px;margin-bottom:4px}
    .meta{color:#444;font-size:12px;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #222}
    .section-head{font-size:14px;font-weight:700;background:#f2f2f2;padding:6px 10px;margin:22px 0 10px;border-left:4px solid #0f766e;page-break-after:avoid}
    .q{margin-bottom:20px;page-break-inside:avoid}
    .q-num{font-weight:700;color:#0f766e;margin-right:4px}
    .q-text{margin:5px 0 8px;line-height:1.6}
    .passage{border-left:3px solid #ccc;padding:8px 12px;margin-bottom:10px;color:#333;font-style:italic;background:#fafafa;font-size:12px}
    .fig{border:1px dashed #aaa;padding:14px;text-align:center;color:#666;margin:8px 0;font-size:12px}
    .opts{margin:0 0 4px 18px}
    .opt{margin-bottom:5px;line-height:1.4}
    .opt.correct{font-weight:700;color:#16a34a}
    .ans{margin-top:8px;font-weight:700;color:#16a34a;font-size:13px}
    .blank{margin-top:8px;color:#333;font-size:13px}
    .exp{margin-top:5px;color:#555;font-size:12px;line-height:1.5}
    .tip{background:#fffbeb;border:1px solid #f59e0b;padding:10px 14px;border-radius:6px;margin-bottom:20px;font-size:13px;display:flex;align-items:center;gap:12px}
    .tip button{padding:6px 14px;background:#0f766e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;white-space:nowrap}
    @media print{.tip{display:none!important}}
  </style></head><body>
  <div class="tip">💡 Press <strong>Ctrl + P</strong> → set destination to <strong>"Save as PDF"</strong> to download.
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
  ${htmlBody}
  </body></html>`);
  win.document.close();
}

function generatePaperPDF(paperId) {
  const paper = paperFor(paperId);
  if (!paper) return;
  let html = `<h1>${escapeHtml(paper.title)}</h1>
  <div class="subtitle">${escapeHtml(paper.subtitle || "")}</div>
  <div class="meta">Duration: ${paper.durationMinutes} min &nbsp;|&nbsp; Questions: ${paper.questions.length} &nbsp;|&nbsp; Marking: +${paper.marking.correct} / ${paper.marking.incorrect}${paper.instructions?.length ? " &nbsp;|&nbsp; " + escapeHtml(paper.instructions.join(" | ")) : ""}</div>`;
  for (const section of paper.sections) {
    html += `<div class="section-head">${escapeHtml(section.title)}</div>`;
    for (const q of section.questions) {
      html += `<div class="q">`;
      if (q.passage) html += `<div class="passage">${escapeHtml(q.passage)}</div>`;
      if (q.figure) html += `<div class="fig">[Figure: ${escapeHtml(q.figure.label || "")}${q.figure.description ? " — " + escapeHtml(q.figure.description) : ""}]</div>`;
      html += `<div class="q-text"><span class="q-num">Q${escapeHtml(String(q.displayNumber))}.</span>${escapeHtml(q.text)}</div>`;
      if (q.options?.length) {
        html += `<div class="opts">${q.options.map(o => `<div class="opt">(${escapeHtml(o.id)})&nbsp;${escapeHtml(o.text)}</div>`).join("")}</div>`;
      } else {
        html += `<div class="blank">Answer: _______________________</div>`;
      }
      html += `</div>`;
    }
  }
  buildPrintWindow(`${paper.title} — Question Paper`, html);
}

function generateKeyPDF(paperId) {
  const paper = paperFor(paperId);
  if (!paper) return;
  let html = `<h1>${escapeHtml(paper.title)} — Answer Key &amp; Solutions</h1>
  <div class="subtitle">${escapeHtml(paper.subtitle || "")}</div>
  <div class="meta">Duration: ${paper.durationMinutes} min &nbsp;|&nbsp; Questions: ${paper.questions.length} &nbsp;|&nbsp; Marking: +${paper.marking.correct} / ${paper.marking.incorrect}</div>`;
  for (const section of paper.sections) {
    html += `<div class="section-head">${escapeHtml(section.title)}</div>`;
    for (const q of section.questions) {
      const answerIds = q.answer === null || q.answer === undefined ? [] : Array.isArray(q.answer) ? q.answer : [q.answer];
      let answerLabel = "—";
      if (q.options?.length && answerIds.length) {
        answerLabel = answerIds.map(id => { const o = q.options.find(x => x.id === id); return o ? `(${id}) ${o.text}` : id; }).join(", ");
      } else if (answerIds.length) {
        answerLabel = answerIds.join(", ");
      }
      html += `<div class="q">`;
      if (q.passage) html += `<div class="passage">${escapeHtml(q.passage)}</div>`;
      if (q.figure) html += `<div class="fig">[Figure: ${escapeHtml(q.figure.label || "")}${q.figure.description ? " — " + escapeHtml(q.figure.description) : ""}]</div>`;
      html += `<div class="q-text"><span class="q-num">Q${escapeHtml(String(q.displayNumber))}.</span>${escapeHtml(q.text)}</div>`;
      if (q.options?.length) {
        html += `<div class="opts">${q.options.map(o => {
          const isAns = answerIds.includes(o.id);
          return `<div class="opt${isAns ? " correct" : ""}">(${escapeHtml(o.id)})&nbsp;${escapeHtml(o.text)}${isAns ? " ✓" : ""}</div>`;
        }).join("")}</div>`;
      }
      html += `<div class="ans">✅ Answer: ${escapeHtml(answerLabel)}</div>`;
      if (q.explanation) html += `<div class="exp">💡 ${escapeHtml(q.explanation)}</div>`;
      html += `</div>`;
    }
  }
  buildPrintWindow(`${paper.title} — Answer Key`, html);
}

/* ── PDF Generation ──────────────────────────────────────── */
function buildPrintWindow(title, htmlBody) {
  const win = window.open("", "_blank");
  if (!win) { alert("Pop-up blocked! Please allow pop-ups for this page."); return; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:28px 36px}
    h1{font-size:20px;margin-bottom:4px}
    .subtitle{color:#555;font-size:13px;margin-bottom:4px}
    .meta{color:#444;font-size:12px;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #222}
    .section-head{font-size:14px;font-weight:700;background:#f2f2f2;padding:6px 10px;margin:22px 0 10px;border-left:4px solid #0f766e;page-break-after:avoid}
    .q{margin-bottom:20px;page-break-inside:avoid}
    .q-num{font-weight:700;color:#0f766e;margin-right:4px}
    .q-text{margin:5px 0 8px;line-height:1.6}
    .passage{border-left:3px solid #ccc;padding:8px 12px;margin-bottom:10px;color:#333;font-style:italic;background:#fafafa;font-size:12px}
    .fig{border:1px dashed #aaa;padding:14px;text-align:center;color:#666;margin:8px 0;font-size:12px}
    .opts{margin:0 0 4px 18px}
    .opt{margin-bottom:5px;line-height:1.4}
    .opt.correct{font-weight:700;color:#16a34a}
    .ans{margin-top:8px;font-weight:700;color:#16a34a;font-size:13px}
    .blank{margin-top:8px;color:#333;font-size:13px}
    .exp{margin-top:5px;color:#555;font-size:12px;line-height:1.5}
    .tip{background:#fffbeb;border:1px solid #f59e0b;padding:10px 14px;border-radius:6px;margin-bottom:20px;font-size:13px;display:flex;align-items:center;gap:12px}
    .tip button{padding:6px 14px;background:#0f766e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;white-space:nowrap}
    @media print{.tip{display:none!important}}
  </style></head><body>
  <div class="tip">💡 Press <strong>Ctrl + P</strong> → set destination to <strong>"Save as PDF"</strong> to download.
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
  ${htmlBody}
  </body></html>`);
  win.document.close();
}

function generatePaperPDF(paperId) {
  const paper = paperFor(paperId);
  if (!paper) return;
  let html = `<h1>${escapeHtml(paper.title)}</h1>
  <div class="subtitle">${escapeHtml(paper.subtitle || "")}</div>
  <div class="meta">Duration: ${paper.durationMinutes} min &nbsp;|&nbsp; Questions: ${paper.questions.length} &nbsp;|&nbsp; Marking: +${paper.marking.correct} / ${paper.marking.incorrect}${paper.instructions?.length ? " &nbsp;|&nbsp; " + escapeHtml(paper.instructions.join(" | ")) : ""}</div>`;
  for (const section of paper.sections) {
    html += `<div class="section-head">${escapeHtml(section.title)}</div>`;
    for (const q of section.questions) {
      html += `<div class="q">`;
      if (q.passage) html += `<div class="passage">${escapeHtml(q.passage)}</div>`;
      if (q.figure) html += `<div class="fig">[Figure: ${escapeHtml(q.figure.label || "")}${q.figure.description ? " — " + escapeHtml(q.figure.description) : ""}]</div>`;
      html += `<div class="q-text"><span class="q-num">Q${escapeHtml(String(q.displayNumber))}.</span>${escapeHtml(q.text)}</div>`;
      if (q.options?.length) {
        html += `<div class="opts">${q.options.map(o => `<div class="opt">(${escapeHtml(o.id)})&nbsp;${escapeHtml(o.text)}</div>`).join("")}</div>`;
      } else {
        html += `<div class="blank">Answer: _______________________</div>`;
      }
      html += `</div>`;
    }
  }
  buildPrintWindow(`${paper.title} — Question Paper`, html);
}

function generateKeyPDF(paperId) {
  const paper = paperFor(paperId);
  if (!paper) return;
  let html = `<h1>${escapeHtml(paper.title)} — Answer Key &amp; Solutions</h1>
  <div class="subtitle">${escapeHtml(paper.subtitle || "")}</div>
  <div class="meta">Duration: ${paper.durationMinutes} min &nbsp;|&nbsp; Questions: ${paper.questions.length} &nbsp;|&nbsp; Marking: +${paper.marking.correct} / ${paper.marking.incorrect}</div>`;
  for (const section of paper.sections) {
    html += `<div class="section-head">${escapeHtml(section.title)}</div>`;
    for (const q of section.questions) {
      const answerIds = q.answer === null || q.answer === undefined ? [] : Array.isArray(q.answer) ? q.answer : [q.answer];
      let answerLabel = "—";
      if (q.options?.length && answerIds.length) {
        answerLabel = answerIds.map(id => { const o = q.options.find(x => x.id === id); return o ? `(${id}) ${o.text}` : id; }).join(", ");
      } else if (answerIds.length) {
        answerLabel = answerIds.join(", ");
      }
      html += `<div class="q">`;
      if (q.passage) html += `<div class="passage">${escapeHtml(q.passage)}</div>`;
      if (q.figure) html += `<div class="fig">[Figure: ${escapeHtml(q.figure.label || "")}${q.figure.description ? " — " + escapeHtml(q.figure.description) : ""}]</div>`;
      html += `<div class="q-text"><span class="q-num">Q${escapeHtml(String(q.displayNumber))}.</span>${escapeHtml(q.text)}</div>`;
      if (q.options?.length) {
        html += `<div class="opts">${q.options.map(o => {
          const isAns = answerIds.includes(o.id);
          return `<div class="opt${isAns ? " correct" : ""}">(${escapeHtml(o.id)})&nbsp;${escapeHtml(o.text)}${isAns ? " ✓" : ""}</div>`;
        }).join("")}</div>`;
      }
      html += `<div class="ans">✅ Answer: ${escapeHtml(answerLabel)}</div>`;
      if (q.explanation) html += `<div class="exp">💡 ${escapeHtml(q.explanation)}</div>`;
      html += `</div>`;
    }
  }
  buildPrintWindow(`${paper.title} — Answer Key`, html);
}

function bindShellEvents() {
  getApp().onclick = event => {
    const button = event.target.closest("button");
    if (!button) return;
    const view = button.dataset.view;
    if (view) { state.view = view; render(); return; }
    const action = button.dataset.action;
    if (action === "theme") { state.settings.theme = state.settings.theme === "dark" ? "light" : "dark"; applySettings(); saveStore(); render(); }
    if (action === "import") $("#paperImport").click();
    if (action === "switchUser") switchUser();
    if (action === "paperPDF") generatePaperPDF(button.dataset.paper);
    if (action === "keyPDF") generateKeyPDF(button.dataset.paper);
    if (action === "start") createAttempt(paperFor(button.dataset.paper));
    if (action === "resume") { state.activeAttemptId = button.dataset.attempt; const attempt = activeAttempt(); state.currentQuestion = firstResumeIndex(attempt); enterExam(); }
    if (action === "review" || action === "analysis") { state.activeAttemptId = button.dataset.attempt; state.view = "review"; render(); }
    if (action === "metadata") alert(JSON.stringify(paperFor(button.dataset.paper), null, 2));
  };
  getApp().oninput = event => {
    const filter = event.target.dataset.filter;
    if (filter) { state.filters[filter] = event.target.value; render(); }
    const setting = event.target.dataset.setting;
    if (setting) {
      state.settings[setting] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      applySettings(); saveStore();
    }
  };
  $("#paperImport")?.addEventListener("change", importPaper);
}

getApp().addEventListener("click", event => {
  if (state.view !== "exam") return;
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.jump) { captureAnswer(); state.currentQuestion = Number(button.dataset.jump); renderExam(); }
  if (button.dataset.section) { captureAnswer(); state.currentQuestion = activeAttempt().paperSnapshot.questions.findIndex(q => q.sectionId === button.dataset.section); renderExam(); }
  const action = button.dataset.exam;
  if (action === "prev") move(-1);
  if (action === "next" || action === "saveNext") move(1);
  if (action === "clear") { const q = activeAttempt().paperSnapshot.questions[state.currentQuestion]; delete activeAttempt().answers[q.id]; saveStore(); renderExam(); }
  if (action === "mark") { const q = activeAttempt().paperSnapshot.questions[state.currentQuestion]; activeAttempt().marked[q.id] = !activeAttempt().marked[q.id]; saveStore(); renderExam(); }
  if (action === "submit") submitAttempt(false);
  if (action === "fullscreen") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

getApp().addEventListener("change", () => { if (state.view === "exam") captureAnswer(); });
getApp().addEventListener("input", event => { if (state.view === "exam" && event.target.matches("[data-answer-input]")) captureAnswer(); });

document.addEventListener("keydown", event => {
  if (state.view !== "exam" || !state.settings.shortcuts || event.target.matches("input, textarea, select")) return;
  const key = event.key.toLowerCase();
  if (key === "n") move(1);
  if (key === "p") move(-1);
  if (key === "s") move(1);
  if (key === "m") { const q = activeAttempt().paperSnapshot.questions[state.currentQuestion]; activeAttempt().marked[q.id] = !activeAttempt().marked[q.id]; saveStore(); renderExam(); }
  if (key === "c") { const q = activeAttempt().paperSnapshot.questions[state.currentQuestion]; delete activeAttempt().answers[q.id]; saveStore(); renderExam(); }
  if (key === "f") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

async function importPaper(event) {
  const file = event.target.files[0];
  if (!file) return;
  const paper = normalizePaper(JSON.parse(await file.text()), file.name);
  state.importedPapers = [paper, ...state.importedPapers.filter(p => p.id !== paper.id)];
  state.papers = [paper, ...state.papers.filter(p => p.id !== paper.id)];
  saveStore();
  render();
}

function firstResumeIndex(attempt) {
  return Math.max(0, attempt.paperSnapshot.questions.findIndex(q => !attempt.answers[q.id]));
}

function questionStatus(attempt, question) {
  if (attempt.marked[question.id]) return "review";
  if (attempt.answers[question.id] !== undefined) return "answered";
  if (attempt.visited[question.id]) return "not-answered";
  return "unseen";
}

function paletteSummary(attempt, paper) {
  const answered = paper.questions.filter(q => attempt.answers[q.id] !== undefined).length;
  const review = paper.questions.filter(q => attempt.marked[q.id]).length;
  return `${answered} answered • ${review} marked`;
}

function questionMetaLabel(question) {
  const values = [question.type, ...Object.values(question.metadata || {})].filter(Boolean);
  return escapeHtml(values.join(" • "));
}

function primaryQuestionLabel(question) {
  return question.metadata.topic || question.metadata.skill || question.metadata.chapter || question.metadata.subject || question.type;
}

function analyticsKeys(attempt) {
  const configured = attempt.paperSnapshot.analytics?.groupBy;
  if (Array.isArray(configured) && configured.length) return configured;
  const metadataKeys = new Set();
  attempt.paperSnapshot.questions.forEach(question => {
    Object.keys(question.metadata || {}).forEach(key => metadataKeys.add(key));
  });
  return ["section", ...metadataKeys];
}

function labelFor(key) {
  return key.replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function formatAnswer(question, value) {
  if (value === undefined || value === null || value === "") return "";
  const values = Array.isArray(value) ? value : [value];
  if (!question.options?.length) return escapeHtml(values.join(", "));
  return values.map(id => {
    const option = question.options.find(o => o.id === id);
    return escapeHtml(option ? `${id}. ${option.text}` : id);
  }).join(", ");
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function showFatalError(err) {
  const container = document.getElementById("app") || document.body;
  container.innerHTML = `
    <div style="font-family:sans-serif;padding:40px;max-width:600px;margin:40px auto;background:#fff1f2;border:1px solid #fca5a5;border-radius:10px">
      <h2 style="color:#b91c1c;margin:0 0 12px">⚠️ Portal failed to start</h2>
      <p style="margin:0 0 8px;color:#374151">An error occurred while loading. Please open the browser console (F12) for details.</p>
      <pre style="background:#fee2e2;padding:12px;border-radius:6px;font-size:12px;overflow:auto;color:#7f1d1d">${escapeHtml(String(err?.stack || err))}</pre>
      <button onclick="location.reload()" style="margin-top:14px;padding:8px 18px;background:#0f766e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🔄 Retry</button>
    </div>`;
}

window.addEventListener("error", e => showFatalError(e.error || e.message));
window.addEventListener("unhandledrejection", e => showFatalError(e.reason));

try {
  state.username = localStorage.getItem(USERNAME_KEY) || "";
  if (state.username) loadStore();
  await loadPapers();
  render();
} catch (err) {
  showFatalError(err);
}

window.addEventListener("beforeunload", () => {
  if (state.view === "exam") captureAnswer();
});
