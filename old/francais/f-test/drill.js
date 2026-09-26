// ═══════════════════════════════════════════════════════════════════════════
// DATA LAYER
// To swap to an API, replace loadSentences() with a fetch to your endpoint.
// The rest of the app is unchanged — it only depends on SENTENCE_BANK[].
// ═══════════════════════════════════════════════════════════════════════════

let SENTENCE_BANK = [];

async function loadSentences() {
  const res = await fetch('sentences.json');
  SENTENCE_BANK = await res.json();
}

function getFilteredBank(tense, topic, register) {
  return SENTENCE_BANK.filter(s => {
    const matchTense    = tense    === 'all' || s.tense    === tense;
    const matchTopic    = topic    === 'all' || s.topic    === topic;
    const sRegister     = s.register || 'written';
    const matchRegister = register  === 'all' || sRegister  === register;
    return matchTense && matchTopic && matchRegister;
  });
}

// ── STATE ──────────────────────────────────────────────────────────────────
let currentMode     = 'translate';
let currentTense    = 'all';
let currentTopic    = 'all';
let currentRegister = 'all';
let currentSentence = null;
let stats           = { seen: 0, correct: 0, streak: 0 };
let pool            = [];
let checked         = false;

// ── UTIL ───────────────────────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'fr-FR';
  utt.rate = 0.82;
  const voices = speechSynthesis.getVoices();
  const fr = voices.find(v => v.lang.startsWith('fr'));
  if (fr) utt.voice = fr;
  speechSynthesis.speak(utt);
}

function normalise(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, "'").replace(/\s+/g, ' ').replace(/[.,!?;:]/g, '').trim();
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function flashCard(type) {
  const card = document.getElementById('main-card');
  card.classList.remove('flash-correct', 'flash-wrong');
  void card.offsetWidth;
  card.classList.add('flash-' + type);
  setTimeout(() => card.classList.remove('flash-' + type), 600);
}

function updateStats() {
  document.getElementById('stat-seen').textContent    = stats.seen;
  document.getElementById('stat-correct').textContent = stats.correct;
  document.getElementById('stat-streak').textContent  = stats.streak;
  document.getElementById('stat-pool').textContent    = pool.length;
  const pct = stats.seen > 0 ? Math.round((stats.correct / stats.seen) * 100) : 0;
  document.getElementById('progress').style.width = pct + '%';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── POOL MANAGEMENT ────────────────────────────────────────────────────────
function refreshPool() {
  pool = shuffled(getFilteredBank(currentTense, currentTopic, currentRegister));
  updateStats();
}

function nextFromPool() {
  if (pool.length === 0) refreshPool();
  if (pool.length === 0) return null;
  return pool.shift();
}

// ── FILTERS ────────────────────────────────────────────────────────────────
function setTense(t, el) {
  currentTense = t;
  document.querySelectorAll('[data-tense]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  refreshPool();
  loadQuestion();
}

function setTopic(t, el) {
  currentTopic = t;
  document.querySelectorAll('[data-topic]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  refreshPool();
  loadQuestion();
}

function setRegister(r, el) {
  currentRegister = r;
  document.querySelectorAll('[data-register]').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  refreshPool();
  loadQuestion();
}

function setMode(m, el) {
  currentMode = m;
  document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  loadQuestion();
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function loadQuestion() {
  checked = false;
  currentSentence = nextFromPool();
  const area = document.getElementById('drill-area');

  if (!currentSentence) {
    area.innerHTML = `<div class="empty-state">No sentences match this filter combination.<br>Try selecting "All" for tense or topic.</div>`;
    return;
  }

  if (currentMode === 'translate') renderTranslate(area);
  if (currentMode === 'gapfill')   renderGapFill(area);
  if (currentMode === 'listen')    renderListen(area);
  if (currentMode === 'freewrite') renderFreeWrite(area);
}

function metaHTML(s) {
  const reg = s.register || 'written';
  const regColor = reg === 'spoken' ? 'var(--red)' : 'var(--faded)';
  const regLabel = reg === 'spoken' ? '🎙 spoken' : '✍ written';
  return `<div class="meta-row">
    <span class="tense-tag">${s.tense}</span>
    <span class="topic-tag">${s.topic}</span>
    <span class="topic-tag" style="border-color:var(--blue);color:var(--blue)">${s.verb}</span>
    <span class="topic-tag" style="border-color:${regColor};color:${regColor}">${regLabel}</span>
  </div>`;
}

function controlsHTML(checkId, nextId, showSpeak = true) {
  const speakBtn = showSpeak
    ? `<button class="btn-speak" onclick="speak(currentSentence.fr)">
        <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.97z"/></svg>
        Hear it
      </button>`
    : '';
  return `<div class="controls">
    <button class="btn-primary" id="${checkId}" onclick="doCheck()">Check</button>
    <button class="btn-primary" id="${nextId}" onclick="loadQuestion()" style="display:none">Next →</button>
    <button class="btn-secondary" id="reveal-btn" onclick="revealAnswer()">Reveal</button>
    <button class="btn-secondary" onclick="skipQuestion()">Skip</button>
    ${speakBtn}
    <span class="kbd-hint"><kbd>Enter</kbd> check · <kbd>→</kbd> skip</span>
  </div>`;
}

// ── TRANSLATE MODE ─────────────────────────────────────────────────────────
function renderTranslate(area) {
  const s = currentSentence;
  area.innerHTML = `
    ${metaHTML(s)}
    <div class="prompt-label">Translate into French</div>
    <div class="sentence-display">${s.en}</div>
    <div class="input-wrap">
      <input class="type-input" id="main-input" placeholder="Your French translation…"
             onkeydown="handleKey(event)" autocomplete="off" autocorrect="off" spellcheck="false"/>
    </div>
    <div class="result-badge" id="badge"></div>
    <div class="answer-block" id="answer-block">
      <div class="correct-fr" id="correct-text"></div>
      <div class="notes" id="notes-text"></div>
    </div>
    ${controlsHTML('check-btn', 'next-btn')}`;
  document.getElementById('main-input').focus();
}

// ── GAP FILL MODE ──────────────────────────────────────────────────────────
function renderGapFill(area) {
  const s = currentSentence;
  const gapRx = new RegExp(`(${escapeRegex(s.gap)})`, 'i');
  const display = s.fr.replace(gapRx,
    `<input class="gap-input" id="gap-input" autocomplete="off" autocorrect="off"
            spellcheck="false" onkeydown="handleKey(event)" placeholder="…"/>`);
  area.innerHTML = `
    ${metaHTML(s)}
    <div class="prompt-label">Complete the sentence</div>
    <div class="sentence-display" style="font-style:normal;line-height:2">${display}</div>
    <div style="margin-top:8px;"><em class="hint-box">English: ${s.en}</em></div>
    <div class="result-badge" id="badge"></div>
    <div class="answer-block" id="answer-block">
      <div class="correct-fr" id="correct-text"></div>
      <div class="notes" id="notes-text"></div>
    </div>
    ${controlsHTML('check-btn', 'next-btn')}`;
  const gi = document.getElementById('gap-input');
  if (gi) gi.focus();
}

// ── LISTEN MODE ────────────────────────────────────────────────────────────
function renderListen(area) {
  const s = currentSentence;
  area.innerHTML = `
    ${metaHTML(s)}
    <div class="prompt-label">Listen, then write what you hear in French</div>
    <div style="text-align:center;margin:20px 0 24px;">
      <button class="btn-speak" onclick="speak(currentSentence.fr)" style="font-size:0.9rem;padding:14px 28px;">
        <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.97z"/></svg>
        ▶ Play Sentence
      </button>
    </div>
    <div class="input-wrap">
      <input class="type-input" id="main-input" placeholder="Write what you heard…"
             onkeydown="handleKey(event)" autocomplete="off" autocorrect="off" spellcheck="false"/>
    </div>
    <div class="result-badge" id="badge"></div>
    <div class="answer-block" id="answer-block">
      <div class="correct-fr" id="correct-text"></div>
      <div class="notes" id="notes-text"></div>
    </div>
    ${controlsHTML('check-btn', 'next-btn', false)}`;
  document.getElementById('main-input').focus();
  setTimeout(() => speak(s.fr), 600);
}

// ── FREE WRITE MODE ────────────────────────────────────────────────────────
function renderFreeWrite(area) {
  const s = currentSentence;
  const prompt = s.prompt || `Use the verb <em>${s.verb}</em> (${s.tense}) to express: "${s.en}"`;
  area.innerHTML = `
    ${metaHTML(s)}
    <div class="prompt-label">Write your own sentence</div>
    <div class="free-prompt">${prompt}</div>
    <div class="free-context">Try using: <strong>${s.verb}</strong> · tense: <strong>${s.tense}</strong></div>
    <div class="input-wrap">
      <input class="type-input" id="main-input" placeholder="Écrivez votre phrase ici…"
             onkeydown="handleKey(event)" autocomplete="off" autocorrect="off" spellcheck="false"/>
    </div>
    <div class="result-badge" id="badge"></div>
    <div class="answer-block" id="answer-block">
      <div class="correct-fr" id="correct-text"></div>
      <div class="notes" id="notes-text"></div>
    </div>
    <div class="controls">
      <button class="btn-primary" id="check-btn" onclick="doCheck()">Compare</button>
      <button class="btn-primary" id="next-btn" onclick="loadQuestion()" style="display:none">Next →</button>
      <button class="btn-secondary" onclick="skipQuestion()">Skip</button>
      <span class="kbd-hint"><kbd>Enter</kbd> compare</span>
    </div>`;
  document.getElementById('main-input').focus();
}

// ── REVEAL ─────────────────────────────────────────────────────────────────
function revealAnswer() {
  if (checked) return;
  checked = true;
  const badge    = document.getElementById('badge');
  const block    = document.getElementById('answer-block');
  const ctEl     = document.getElementById('correct-text');
  const notesEl  = document.getElementById('notes-text');
  const checkBtn = document.getElementById('check-btn');
  const nextBtn  = document.getElementById('next-btn');
  const revealBtn= document.getElementById('reveal-btn');

  badge.className   = 'result-badge partial';
  badge.textContent = '↔ Revealed';
  ctEl.textContent  = currentSentence.fr;
  notesEl.innerHTML = currentSentence.note || '';
  block.style.display = 'block';
  setTimeout(() => block.classList.add('show'), 10);
  if (checkBtn)  checkBtn.style.display  = 'none';
  if (revealBtn) revealBtn.style.display = 'none';
  if (nextBtn)   nextBtn.style.display   = '';
  stats.seen++;
  stats.streak = 0;
  updateStats();
  setTimeout(() => speak(currentSentence.fr), 300);
}

// ── CHECKING ───────────────────────────────────────────────────────────────
function doCheck() {
  if (checked) { loadQuestion(); return; }
  checked = true;
  if (currentMode === 'translate')  checkTranslate();
  else if (currentMode === 'gapfill')    checkGapFill();
  else if (currentMode === 'listen')     checkListen();
  else if (currentMode === 'freewrite')  checkFreeWrite();
}

function showAnswer(isCorrect, label = '') {
  const badge    = document.getElementById('badge');
  const block    = document.getElementById('answer-block');
  const ctEl     = document.getElementById('correct-text');
  const notesEl  = document.getElementById('notes-text');
  const checkBtn = document.getElementById('check-btn');
  const nextBtn  = document.getElementById('next-btn');

  badge.className   = 'result-badge ' + (isCorrect ? 'correct' : 'wrong');
  badge.textContent = isCorrect ? '✓ Correct!' : (label || '✗ Not quite');
  ctEl.textContent  = currentSentence.fr;
  notesEl.innerHTML = currentSentence.note || '';
  block.style.display = 'block';
  setTimeout(() => block.classList.add('show'), 10);
  if (checkBtn) checkBtn.style.display = 'none';
  if (nextBtn)  nextBtn.style.display  = '';
  const revealBtn = document.getElementById('reveal-btn');
  if (revealBtn) revealBtn.style.display = 'none';

  stats.seen++;
  if (isCorrect) { stats.correct++; stats.streak++; flashCard('correct'); }
  else           { stats.streak = 0; flashCard('wrong'); }
  updateStats();
  if (isCorrect) setTimeout(() => speak(currentSentence.fr), 300);
}

function checkTranslate() {
  const val = document.getElementById('main-input')?.value || '';
  if (!val.trim()) return;
  const isCorrect = normalise(val) === normalise(currentSentence.fr);
  showAnswer(isCorrect, `✗ Answer: ${currentSentence.fr}`);
  if (!isCorrect) setTimeout(() => speak(currentSentence.fr), 400);
}

function checkGapFill() {
  const gi  = document.getElementById('gap-input');
  const val = gi ? gi.value : '';
  if (!val.trim()) return;
  const isCorrect = normalise(val) === normalise(currentSentence.gap);
  if (gi) { gi.disabled = true; gi.style.borderColor = isCorrect ? 'var(--green)' : 'var(--red)'; }
  showAnswer(isCorrect, `✗ Was: ${currentSentence.gap}`);
}

function checkListen() {
  const val = document.getElementById('main-input')?.value || '';
  if (!val.trim()) return;
  const isCorrect = normalise(val) === normalise(currentSentence.fr);
  showAnswer(isCorrect);
  if (!isCorrect) setTimeout(() => speak(currentSentence.fr), 400);
}

function checkFreeWrite() {
  const val = document.getElementById('main-input')?.value || '';
  if (!val.trim()) return;
  const badge    = document.getElementById('badge');
  const block    = document.getElementById('answer-block');
  const ctEl     = document.getElementById('correct-text');
  const notesEl  = document.getElementById('notes-text');
  const checkBtn = document.getElementById('check-btn');
  const nextBtn  = document.getElementById('next-btn');

  badge.className   = 'result-badge partial';
  badge.textContent = '↔ Compare with model';
  ctEl.textContent  = currentSentence.fr;
  notesEl.innerHTML = currentSentence.note || '';
  block.style.display = 'block';
  setTimeout(() => block.classList.add('show'), 10);
  if (checkBtn) checkBtn.style.display = 'none';
  if (nextBtn)  nextBtn.style.display  = '';
  stats.seen++;
  updateStats();
  setTimeout(() => speak(currentSentence.fr), 400);
}

function skipQuestion() {
  stats.streak = 0;
  updateStats();
  loadQuestion();
}

// ── KEYBOARD ───────────────────────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); doCheck(); }
}

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    skipQuestion();
  }
});

// ── INIT ───────────────────────────────────────────────────────────────────
window.speechSynthesis && (window.speechSynthesis.onvoiceschanged = () => {});

window.onload = async () => {
  await loadSentences();
  refreshPool();
  setTimeout(loadQuestion, 200);
};
