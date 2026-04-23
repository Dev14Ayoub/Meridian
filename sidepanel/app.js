import { VoiceEngine, SUPPORTED_LANGUAGES } from '../ai/voice.js';

// ── State ─────────────────────────────────────────────────
let voice       = null;
let voiceActive = false;
let currentPlan = null;

// ── Helpers ───────────────────────────────────────────────
function send(type, data = {}) {
  return chrome.runtime.sendMessage({ type, ...data });
}

function getMode() {
  return document.getElementById('modeSelect').value;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Chat UI helpers ───────────────────────────────────────
function msg(text, role) {
  const container = document.getElementById('chatContainer');
  container.querySelector('.welcome-msg')?.remove();

  const wrap   = document.createElement('div');
  wrap.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  wrap.appendChild(bubble);
  wrap.appendChild(time);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return wrap;
}

function thinking() {
  const container = document.getElementById('chatContainer');
  const el = document.createElement('div');
  el.className = 'msg ai';
  el.innerHTML = `<div class="thinking">
    <div class="dot"></div><div class="dot"></div><div class="dot"></div>
    <span style="margin-left:4px;font-size:11px">Thinking…</span></div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get(['activeMode', 'voiceLang']);
  if (stored.activeMode) document.getElementById('modeSelect').value = stored.activeMode;
  if (stored.voiceLang)  {
    const sel = document.getElementById('voiceLangSelect');
    if (sel) sel.value = stored.voiceLang;
  }

  // Tab switching (click + ARIA roving tabindex)
  const tabButtons = [...document.querySelectorAll('.tab-btn')];

  function activateTab(btn, { focus = false } = {}) {
    tabButtons.forEach(b => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.setAttribute('tabindex', active ? '0' : '-1');
    });
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    if (focus) btn.focus();
    if (btn.dataset.tab === 'graph')   loadGraph();
    if (btn.dataset.tab === 'history') loadActiveDates();
    if (btn.dataset.tab === 'oracle')  loadOracle();
  }

  tabButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => activateTab(btn));
    btn.addEventListener('keydown', e => {
      let target = null;
      switch (e.key) {
        case 'ArrowRight': target = tabButtons[(idx + 1) % tabButtons.length]; break;
        case 'ArrowLeft':  target = tabButtons[(idx - 1 + tabButtons.length) % tabButtons.length]; break;
        case 'Home':       target = tabButtons[0]; break;
        case 'End':        target = tabButtons[tabButtons.length - 1]; break;
      }
      if (target) { e.preventDefault(); activateTab(target, { focus: true }); }
    });
  });

  // Mode change
  document.getElementById('modeSelect').addEventListener('change', e => {
    send('SET_MODE', { mode: e.target.value });
    document.getElementById('voiceModeBadge').textContent = e.target.value + ' Mode';
  });

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.add('hidden');
  });
  document.getElementById('saveKeyBtn').addEventListener('click', saveApiKey);
  document.getElementById('pauseCurrentToggle')?.addEventListener('change', togglePauseCurrent);
  document.getElementById('wipeAllBtn')?.addEventListener('click', wipeAllMemory);

  // Onboarding banner — shows until an API key is saved
  document.getElementById('onboardingSetupBtn').addEventListener('click', openSettings);
  await refreshOnboardingBanner();

  // If popup asked us to open settings, do it now and clear the flag
  const { openSettingsOnLoad } = await chrome.storage.local.get('openSettingsOnLoad');
  if (openSettingsOnLoad) {
    await chrome.storage.local.remove('openSettingsOnLoad');
    openSettings();
  }

  // Language selector in settings
  document.getElementById('voiceLangSelect')?.addEventListener('change', e => {
    const code = e.target.value;
    chrome.storage.local.set({ voiceLang: code });
    voice?.setLanguage(code);
  });

  // Session Brain chat
  document.getElementById('chatSend').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('chatInput').value = btn.dataset.q;
      sendChat();
    });
  });
  document.getElementById('exportBtn').addEventListener('click', exportSession);
  document.getElementById('clearBtn').addEventListener('click', clearMemory);

  // Research tab
  document.getElementById('buildPlanBtn').addEventListener('click', buildResearchPlan);
  document.getElementById('researchTopic').addEventListener('keydown', e => {
    if (e.key === 'Enter') buildResearchPlan();
  });
  document.getElementById('synthesizeBtn')?.addEventListener('click', synthesizeResearch);
  document.getElementById('exportSynthesisBtn')?.addEventListener('click', () => {
    const text = document.getElementById('synthesisText').textContent;
    if (text) downloadText(text, `meridian-research-${Date.now()}.txt`);
  });
  document.getElementById('openAllSearchesBtn')?.addEventListener('click', openAllSearches);

  // History tab
  document.getElementById('getRecapBtn').addEventListener('click', getRecap);
  document.getElementById('historyDateInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') getRecap();
  });
  document.getElementById('exportRecapBtn')?.addEventListener('click', () => {
    const text = document.getElementById('recapText').textContent;
    if (text) downloadText(text, `meridian-recap-${Date.now()}.txt`);
  });

  // Oracle tab
  document.getElementById('refreshOracleBtn').addEventListener('click', loadOracle);

  // Shield tab
  document.getElementById('runShieldBtn').addEventListener('click', runShield);

  // Decision tab
  document.getElementById('runDecisionBtn').addEventListener('click', runDecision);
  document.getElementById('decisionTopic').addEventListener('keydown', e => {
    if (e.key === 'Enter') runDecision();
  });

  // Graph tab
  document.getElementById('refreshGraphBtn').addEventListener('click', loadGraph);

  // Background messages
  chrome.runtime.onMessage.addListener(msg_ => {
    if (msg_.type === 'ORACLE_UPDATE')  showOraclePrediction(msg_.prediction);
    if (msg_.type === 'MEMORY_UPDATED') {
      if (document.querySelector('.tab-btn[data-tab="graph"]')?.classList.contains('active')) loadGraph();
    }
  });

  autoContradictionCheck();

  // First-run tutorial (after API key exists, only shown once)
  maybeShowTutorial();
}

// ── First-run tutorial ───────────────────────────────────
const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Meridian',
    body: 'Your persistent AI layer across the web. I remember what you read, help you research, and spot manipulation on the pages you visit.'
  },
  {
    title: '7 tabs, one brain',
    body: 'Brain chats with me. Research plans deep dives. History recaps any day. Oracle predicts what you need next. Shield spots manipulation. Decision scores readiness. Graph shows everything.'
  },
  {
    title: 'Talk to me in any language',
    body: 'Tap the mic icon in the header to start a real-time voice conversation. I auto-detect the language you speak — English, French, Arabic, Spanish, Japanese, and more.'
  },
  {
    title: 'Your privacy comes first',
    body: 'Banking, health, auth, and password-manager sites are never captured. You can pause any other site in Settings. Erase all memory anytime from the Danger zone.'
  }
];

let tutorialIndex = 0;

async function maybeShowTutorial() {
  try {
    const { tutorialSeen, apiKey } = await chrome.storage.local.get(['tutorialSeen', 'apiKey']);
    if (tutorialSeen || !apiKey) return; // wait until they've set a key
    showTutorial();
  } catch {}
}

function showTutorial() {
  tutorialIndex = 0;
  renderTutorialStep();
  document.getElementById('tutorialOverlay')?.classList.remove('hidden');

  document.getElementById('tutorialNext')?.addEventListener('click', nextTutorial);
  document.getElementById('tutorialBack')?.addEventListener('click', prevTutorial);
  document.getElementById('tutorialSkip')?.addEventListener('click', closeTutorial);
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  document.getElementById('tutorialStep').textContent = (tutorialIndex + 1);
  document.getElementById('tutorialTitle').textContent = step.title;
  document.getElementById('tutorialBody').textContent  = step.body;
  document.getElementById('tutorialBack').disabled = tutorialIndex === 0;
  document.getElementById('tutorialNext').textContent =
    tutorialIndex === TUTORIAL_STEPS.length - 1 ? 'Got it' : 'Next';
}

function nextTutorial() {
  if (tutorialIndex < TUTORIAL_STEPS.length - 1) {
    tutorialIndex++;
    renderTutorialStep();
  } else {
    closeTutorial();
  }
}

function prevTutorial() {
  if (tutorialIndex > 0) { tutorialIndex--; renderTutorialStep(); }
}

async function closeTutorial() {
  document.getElementById('tutorialOverlay')?.classList.add('hidden');
  try { await chrome.storage.local.set({ tutorialSeen: true }); } catch {}
}

// ── Session Brain ─────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chatInput');
  const query = input.value.trim();
  if (!query) return;
  input.value = '';

  msg(query, 'user');
  const loader = thinking();

  try {
    const res = await send('ASK_BRAIN', { query, mode: getMode() });
    loader.remove();
    if (res?.error === 'NO_API_KEY' || /api.?key/i.test(res?.error || '')) {
      apiKeyPromptMsg();
    } else if (res?.error) {
      msg(`Error: ${res.error}`, 'ai');
    } else {
      msg(res?.answer || 'No response.', 'ai');
    }
  } catch (err) {
    loader.remove();
    msg(`Connection failed: ${err?.message || 'unknown error'}`, 'ai');
  }
}

// Inline AI message that prompts the user to set their API key — click to open settings
function apiKeyPromptMsg() {
  const container = document.getElementById('chatContainer');
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.innerHTML = `
    <div class="msg-bubble api-prompt">
      <div>No Claude API key yet. Add one to start chatting.</div>
      <button class="action-btn small" id="inlineSetupBtn" style="margin-top:8px">Add API Key</button>
    </div>
    <div class="msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  wrap.querySelector('#inlineSetupBtn').addEventListener('click', openSettings);
}

async function exportSession() {
  const loader = thinking();
  try {
    const res = await send('GET_SESSION_SUMMARY', { mode: getMode() });
    loader.remove();
    if (res?.error) {
      msg(`Export failed: ${res.error}`, 'ai');
      return;
    }
    if (!res?.summary) {
      msg('Nothing to export yet — try browsing a few pages first.', 'ai');
      return;
    }
    downloadText(res.summary, `meridian-session-${new Date().toISOString().slice(0,10)}.txt`);
  } catch (err) {
    loader.remove();
    msg(`Export failed: ${err?.message || 'unknown error'}`, 'ai');
  }
}

async function clearMemory() {
  if (!confirm('Clear today\'s memory? This cannot be undone.')) return;
  await send('CLEAR_SESSION');
  document.getElementById('chatContainer').innerHTML = `
    <div class="welcome-msg">
      <div class="welcome-icon">🧠</div>
      <p>Memory cleared. Ready for a fresh session.</p>
    </div>`;
}

// ── Research Tab ──────────────────────────────────────────
async function buildResearchPlan() {
  const topic = document.getElementById('researchTopic').value.trim();
  if (!topic) return;

  const btn = document.getElementById('buildPlanBtn');
  btn.textContent = 'Planning…';
  btn.disabled = true;

  document.getElementById('researchPlanBox').classList.add('hidden');
  document.getElementById('researchSynthesis').classList.add('hidden');

  try {
    const res = await send('BUILD_RESEARCH_PLAN', { topic });
    currentPlan = res?.plan;
    if (currentPlan) renderResearchPlan(currentPlan);
  } catch {
    alert('Failed to build plan. Check your API key.');
  }

  btn.textContent = 'Plan';
  btn.disabled = false;
}

function renderResearchPlan(plan) {
  document.getElementById('planTopic').textContent = `📚 ${plan.topic}`;
  document.getElementById('planOverview').textContent = plan.overview || '';

  // Search queries — each clickable
  const qBox = document.getElementById('planQueries');
  qBox.innerHTML = (plan.search_queries || []).map((q, i) => `
    <div class="plan-query-item" data-query="${escapeHtml(q)}">
      <span class="query-icon">🔍</span>
      <span class="query-text">${escapeHtml(q)}</span>
      <button class="query-open-btn" data-query="${escapeHtml(q)}">Open ↗</button>
    </div>`).join('');

  qBox.querySelectorAll('.query-open-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openSearch(btn.dataset.query);
    });
  });

  // Key questions
  document.getElementById('planQuestions').innerHTML =
    (plan.key_questions || []).map(q => `<li>${escapeHtml(q)}</li>`).join('');

  // Subtopics
  document.getElementById('planSubtopics').innerHTML =
    (plan.subtopics || []).map(s => `<span class="plan-tag">${escapeHtml(s)}</span>`).join('');

  document.getElementById('researchEmpty')?.classList.add('hidden');
  document.getElementById('researchPlanBox').classList.remove('hidden');
}

function openSearch(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  chrome.tabs.create({ url, active: false });
}

function openAllSearches() {
  if (!currentPlan?.search_queries?.length) return;
  currentPlan.search_queries.forEach(q => openSearch(q));
}

async function synthesizeResearch() {
  const topic = document.getElementById('researchTopic').value.trim()
             || currentPlan?.topic || '';
  const btn = document.getElementById('synthesizeBtn');
  btn.textContent = 'Synthesizing…';
  btn.disabled = true;

  try {
    const res = await send('SYNTHESIZE_RESEARCH', { topic });
    document.getElementById('synthesisText').textContent = res?.synthesis || 'No synthesis available.';
    document.getElementById('researchSynthesis').classList.remove('hidden');
  } catch {
    alert('Synthesis failed. Check your API key.');
  }

  btn.textContent = 'Synthesize Research So Far';
  btn.disabled = false;
}

// ── History Tab ───────────────────────────────────────────
async function loadActiveDates() {
  const res = await send('GET_ACTIVE_DATES');
  const container = document.getElementById('activeDatesList');
  const dates = res?.dates || [];
  if (!dates.length) {
    container.innerHTML = '<div class="loading-state">No history yet. Start browsing!</div>';
    return;
  }
  container.innerHTML = dates.map(d => `
    <span class="date-chip" data-date="${d}">${formatDateShort(d)}</span>
  `).join('');
  container.querySelectorAll('.date-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('historyDateInput').value = chip.dataset.date;
      container.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      getRecap();
    });
  });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

async function getRecap() {
  const input = document.getElementById('historyDateInput').value.trim();
  const btn   = document.getElementById('getRecapBtn');
  btn.textContent = 'Loading…';
  btn.disabled = true;

  try {
    const res = await send('GET_DAY_RECAP', {
      dateStr: parseDateInput(input)
    });

    document.getElementById('recapDate').textContent = formatDate(res.dateStr);
    document.getElementById('recapVisitCount').textContent = `${res.visitCount} pages`;
    document.getElementById('recapConvCount').textContent  = `${res.convCount} exchanges`;
    document.getElementById('recapText').textContent = res.recap || 'No activity found for this day.';

    // Render site list
    const sitesRes = await send('SEARCH_HISTORY', { dateHint: res.dateStr });
    renderRecapSites(sitesRes?.visits || []);

    document.getElementById('recapResult').classList.remove('hidden');
  } catch (err) {
    alert(err?.message === 'NO_API_KEY'
      ? 'Please set your API key in Settings.'
      : 'Failed to load recap.');
  }

  btn.textContent = 'Recap';
  btn.disabled = false;
}

function parseDateInput(input) {
  if (!input) return new Date().toISOString().slice(0, 10);
  // Let background parse natural language via MeridianHistory.parseDate
  return input;
}

function renderRecapSites(visits) {
  const container = document.getElementById('recapSitesList');
  if (!visits.length) { container.innerHTML = ''; return; }
  container.innerHTML = visits.slice(0, 20).map(v => `
    <div class="recap-site-item">
      <div class="recap-site-dot"></div>
      <div class="recap-site-info">
        <div class="recap-site-title">${escapeHtml(v.title || 'Untitled')}</div>
        <div class="recap-site-url">${escapeHtml(v.url)}</div>
      </div>
      <div class="recap-site-time">${timeAgo(v.timestamp)}</div>
    </div>`).join('');
}

// ── Oracle Tab ────────────────────────────────────────────
async function loadOracle() {
  document.getElementById('oraclePrediction').innerHTML = '<div class="loading-state">Analyzing pattern…</div>';
  document.getElementById('gapsList').innerHTML = '<div class="loading-state">Detecting gaps…</div>';
  try {
    const res = await send('GET_KNOWLEDGE_GAPS', { topic: '', mode: getMode() });
    renderGaps(res?.gaps || []);
  } catch {
    document.getElementById('gapsList').innerHTML = '<div class="loading-state">Set your API key to enable this.</div>';
  }
}

function showOraclePrediction(prediction) {
  if (!prediction) return;
  document.getElementById('oraclePrediction').innerHTML = `
    <div class="oracle-prediction">
      <strong>🔮 Next: ${escapeHtml(prediction.prediction)}</strong>
      <span class="oracle-reason">${escapeHtml(prediction.reason)}</span>
      ${prediction.search_query ? `<button class="query-open-btn" style="margin-top:6px;align-self:flex-start"
        onclick="chrome.tabs.create({url:'https://www.google.com/search?q=${encodeURIComponent(prediction.search_query)}'})">
        Search: ${escapeHtml(prediction.search_query)} ↗</button>` : ''}
    </div>`;
}

function renderGaps(gaps) {
  const el = document.getElementById('gapsList');
  if (!gaps.length) {
    el.innerHTML = '<div class="loading-state">No significant gaps detected yet.</div>';
    return;
  }
  el.innerHTML = gaps.map(g => `
    <div class="gap-item">
      <div class="gap-topic">${escapeHtml(g.topic)}</div>
      <div class="gap-why">${escapeHtml(g.why)}</div>
      ${g.search_suggestion ? `<button class="query-open-btn" style="margin-top:5px"
        onclick="chrome.tabs.create({url:'https://www.google.com/search?q=${encodeURIComponent(g.search_suggestion)}'})">
        Search ↗</button>` : ''}
    </div>`).join('');
}

// ── Shield Tab ────────────────────────────────────────────
async function runShield() {
  const btn = document.getElementById('runShieldBtn');
  btn.textContent = 'Scanning…'; btn.disabled = true;
  document.getElementById('shieldResults').innerHTML = '<div class="loading-state">Analyzing for manipulation…</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    const pageRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' });

    const res = await send('ASK_BRAIN', {
      query: `Analyze for manipulation tactics. Respond ONLY in JSON: { "tactics": [{ "text": "...", "technique": "...", "severity": "low|medium|high" }] }\n\n${pageRes.text?.slice(0,2000)}`,
      mode: 'Shield'
    });

    let tactics = [];
    try { tactics = JSON.parse(res?.answer?.replace(/```json|```/g,'').trim() || '{}').tactics || []; } catch {}
    renderShieldResults(tactics);
    if (tactics.length) chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PERSUASION_SHIELD', tactics });

    const contraRes = await send('DETECT_CONTRADICTIONS', { currentText: pageRes.text });
    renderContradictions(contraRes?.contradictions || []);
  } catch (err) {
    document.getElementById('shieldResults').innerHTML =
      `<div class="loading-state">${err?.message === 'NO_API_KEY' ? 'Set your API key.' : 'Error.'}</div>`;
  }
  btn.textContent = 'Scan Page'; btn.disabled = false;
}

function renderShieldResults(tactics) {
  const el = document.getElementById('shieldResults');
  if (!tactics.length) {
    el.innerHTML = '<div class="no-tactics">✅ No manipulation tactics detected.</div>'; return;
  }
  el.innerHTML = tactics.map(t => `
    <div class="tactic-item ${t.severity}">
      <div class="tactic-name">${escapeHtml(t.severity?.toUpperCase())} — ${escapeHtml(t.technique?.replace(/_/g,' '))}</div>
      <div class="tactic-text">"${escapeHtml(t.text?.slice(0,120))}"</div>
    </div>`).join('');
}

function renderContradictions(items) {
  const el = document.getElementById('contradictionResults');
  if (!items?.length) {
    el.innerHTML = '<div class="no-tactics">✅ No contradictions with your past reading.</div>'; return;
  }
  el.innerHTML = items.map(c => `
    <div class="tactic-item high">
      <div class="tactic-name">Contradiction</div>
      <div class="tactic-text">Claim: "${escapeHtml(c.claim?.slice(0,100))}"</div>
      <div class="tactic-text" style="margin-top:4px">Conflicts with: <em>${escapeHtml(c.source)}</em></div>
    </div>`).join('');
}

async function autoContradictionCheck() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const pageRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }).catch(() => null);
    if (!pageRes?.text) return;
    const res = await send('DETECT_CONTRADICTIONS', { currentText: pageRes.text });
    renderContradictions(res?.contradictions || []);
  } catch {}
}

// ── Decision Tab ──────────────────────────────────────────
async function runDecision() {
  const topic  = document.getElementById('decisionTopic').value.trim();
  const result = document.getElementById('decisionResult');
  result.classList.add('hidden');
  const btn = document.getElementById('runDecisionBtn');
  btn.textContent = 'Analyzing…'; btn.disabled = true;
  try {
    const res = await send('GET_DECISION_SCORE', { topic });
    if (res?.score !== undefined) {
      renderDecisionScore(res);
      document.getElementById('decisionEmpty')?.classList.add('hidden');
      result.classList.remove('hidden');
    }
  } catch {
    alert('Could not analyze. Check your API key in Settings.');
  }
  btn.textContent = 'Analyze'; btn.disabled = false;
}

function renderDecisionScore(data) {
  const { score, label, missing = [], strengths = [], recommendation = '' } = data;
  document.getElementById('scoreNum').textContent = score;
  document.getElementById('scoreTag').textContent = label;
  const circumference = 326.7;
  const arc   = document.getElementById('scoreArc');
  arc.style.strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  arc.setAttribute('stroke', color);
  document.getElementById('scoreNum').style.color = color;
  document.getElementById('strengthsList').innerHTML =
    strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('') || '<li>Keep researching…</li>';
  document.getElementById('missingList').innerHTML =
    missing.map(m => `<li>${escapeHtml(m)}</li>`).join('') || '<li>Looking good!</li>';
}

// ── Graph Tab ─────────────────────────────────────────────
async function loadGraph() {
  const [stats, entries] = await Promise.all([
    send('GET_MEMORY_STATS'),
    send('SEARCH_MEMORY', { query: '' })
  ]);
  document.getElementById('graphStats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${stats?.totalEntries || 0}</div><div class="stat-label">Pages</div></div>
    <div class="stat-card"><div class="stat-num">${stats?.visitCount || 0}</div><div class="stat-label">History</div></div>
    <div class="stat-card"><div class="stat-num">${stats?.convCount || 0}</div><div class="stat-label">Chats</div></div>`;
  const list  = document.getElementById('graphList');
  const items = entries?.results || [];
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌱</div>
        <div class="empty-text">Browse a few pages for 15+ seconds each to start growing your graph.</div>
      </div>`;
    return;
  }
  list.innerHTML = items.map(e => `
    <div class="graph-entry">
      <div class="entry-dot"></div>
      <div class="entry-info">
        <div class="entry-title">${escapeHtml(e.title || 'Untitled')}</div>
        <div class="entry-url">${escapeHtml(e.url)}</div>
      </div>
      <div class="entry-time">${timeAgo(e.timestamp)}</div>
    </div>`).join('');
}

// ── Settings ──────────────────────────────────────────────
function openSettings() {
  document.getElementById('settingsOverlay').classList.remove('hidden');
  loadApiKey();
  refreshPrivacyPanel();
}

async function loadApiKey() {
  const res = await send('GET_API_KEY');
  if (res?.key) {
    document.getElementById('apiKeyInput').value = res.key;
    document.getElementById('keyStatus').textContent = '✓ API key saved';
    document.getElementById('keyStatus').className = 'key-status ok';
  }
}

// ── Privacy & Safety panel ───────────────────────────────
let currentHost = '';

async function refreshPrivacyPanel() {
  currentHost = await getActiveHost();
  const hostEl   = document.getElementById('pauseCurrentHost');
  const toggleEl = document.getElementById('pauseCurrentToggle');

  if (!currentHost) {
    if (hostEl) hostEl.textContent = 'No active web page';
    if (toggleEl) { toggleEl.checked = false; toggleEl.disabled = true; }
  } else {
    if (hostEl) hostEl.textContent = currentHost;
    if (toggleEl) toggleEl.disabled = false;
  }

  const res = await send('GET_PAUSED_HOSTS');
  const paused = res?.pausedHosts || [];
  if (toggleEl && currentHost) {
    toggleEl.checked = paused.includes(currentHost);
  }
  renderPausedHosts(paused);
}

async function getActiveHost() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/.test(tab.url)) return '';
    return new URL(tab.url).hostname.replace(/^www\./, '');
  } catch { return ''; }
}

function renderPausedHosts(hosts) {
  const list = document.getElementById('pausedHostsList');
  if (!list) return;
  list.innerHTML = '';
  hosts.forEach(h => {
    const chip = document.createElement('span');
    chip.className = 'pause-chip';
    chip.innerHTML = `<span>${h}</span><button title="Unpause" data-host="${h}">✕</button>`;
    chip.querySelector('button').addEventListener('click', async () => {
      await send('TOGGLE_PAUSED_HOST', { host: h });
      refreshPrivacyPanel();
    });
    list.appendChild(chip);
  });
}

async function togglePauseCurrent() {
  if (!currentHost) return;
  await send('TOGGLE_PAUSED_HOST', { host: currentHost });
  refreshPrivacyPanel();
}

async function wipeAllMemory() {
  const ok = confirm(
    'This will permanently delete every captured page, conversation, and research session.\n\n' +
    'Your API key and language settings are kept.\n\nContinue?'
  );
  if (!ok) return;

  const btn = document.getElementById('wipeAllBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Erasing…';

  try {
    const res = await send('CLEAR_ALL_MEMORY');
    if (res?.ok) {
      btn.textContent = '✓ All memory erased';
      // Reset chat UI
      const chat = document.getElementById('chatContainer');
      if (chat) chat.innerHTML = `
        <div class="welcome-msg">
          <div class="welcome-icon">🧠</div>
          <p>All memory erased. Ready for a fresh start.</p>
        </div>`;
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
    } else {
      btn.textContent = 'Failed — try again';
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
    }
  } catch {
    btn.textContent = 'Failed — try again';
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
  }
}

async function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  await send('SET_API_KEY', { key });
  document.getElementById('keyStatus').textContent = '✓ Saved successfully';
  document.getElementById('keyStatus').className = 'key-status ok';
  await refreshOnboardingBanner();
  // If this is the first key they've saved, kick off the tutorial
  maybeShowTutorial();
}

async function refreshOnboardingBanner() {
  const banner = document.getElementById('onboardingBanner');
  if (!banner) return;
  const res = await send('GET_API_KEY');
  if (res?.key) banner.classList.add('hidden');
  else          banner.classList.remove('hidden');
}

// ── Voice ─────────────────────────────────────────────────
function initVoice() {
  voice = new VoiceEngine({
    onTranscript:  handleVoiceTranscript,
    onStateChange: handleVoiceStateChange,
    onError: err  => { setVoiceStatus(`Error: ${err}`); setOrbState('idle'); }
  });

  // Apply saved language
  chrome.storage.local.get('voiceLang').then(d => {
    if (d.voiceLang) voice.setLanguage(d.voiceLang);
  });

  // Voice selector (TTS voices)
  const sel = document.getElementById('voiceSelect');
  const populate = () => {
    const voices = voice.getAvailableVoices();
    sel.innerHTML = voices.map((v, i) =>
      `<option value="${i}">${v.name.slice(0, 22)}</option>`).join('');
  };
  populate();
  window.speechSynthesis.onvoiceschanged = populate;
  sel.addEventListener('change', () => voice.setVoiceByIndex(+sel.value));

  document.getElementById('continuousToggle').addEventListener('change', e => {
    voice.setContinuous(e.target.checked);
  });
  document.getElementById('voiceTapBtn').addEventListener('click', () => {
    if (voice.state === 'listening') voice.stopListening();
    else if (voice.state === 'idle') voice.startListening();
  });
  document.getElementById('voiceStopBtn').addEventListener('click', () => {
    voice.stopSpeaking();
    if (voice.continuous) voice.resumeListening();
  });
  document.getElementById('voiceBtn').addEventListener('click', openVoiceOverlay);
  document.getElementById('closeVoiceBtn').addEventListener('click', closeVoiceOverlay);

  document.querySelectorAll('.hint').forEach(h => {
    h.addEventListener('click', () => processVoiceText(h.textContent.replace(/['"]/g,'').trim()));
  });
}

function openVoiceOverlay() {
  voiceActive = true;
  document.getElementById('voiceOverlay').classList.remove('hidden');
  document.getElementById('voiceBtn').classList.add('active');
  document.getElementById('voiceModeBadge').textContent = getMode() + ' Mode';
  voice?.startListening();
}

function closeVoiceOverlay() {
  voiceActive = false;
  voice?.stopListening();
  voice?.stopSpeaking();
  document.getElementById('voiceOverlay').classList.add('hidden');
  document.getElementById('voiceBtn').classList.remove('active');
}

function handleVoiceStateChange(state) {
  setOrbState(state);
  const tapBtn   = document.getElementById('voiceTapBtn');
  const tapLabel = document.getElementById('voiceTapLabel');
  const stopBtn  = document.getElementById('voiceStopBtn');
  switch (state) {
    case 'listening':
      setVoiceStatus('Listening…');
      tapLabel.textContent = 'Stop listening';
      tapBtn.classList.add('listening-active');
      stopBtn.classList.add('hidden');
      document.getElementById('voiceInterim').textContent = '';
      break;
    case 'thinking':
      setVoiceStatus('Thinking…');
      tapLabel.textContent = 'Tap to speak';
      tapBtn.classList.remove('listening-active');
      stopBtn.classList.add('hidden');
      break;
    case 'speaking':
      setVoiceStatus('Speaking…');
      tapLabel.textContent = 'Tap to speak';
      tapBtn.classList.remove('listening-active');
      stopBtn.classList.remove('hidden');
      break;
    default:
      setVoiceStatus(document.getElementById('continuousToggle').checked ? 'Listening continuously…' : 'Tap to speak');
      tapLabel.textContent = 'Tap to speak';
      tapBtn.classList.remove('listening-active');
      stopBtn.classList.add('hidden');
      break;
  }
}

function setOrbState(state) {
  const orb = document.getElementById('voiceOrb');
  orb.className = 'voice-orb';
  if (state !== 'idle') orb.classList.add(state);
}

function setVoiceStatus(text) {
  document.getElementById('voiceStatusLabel').textContent = text;
}

setInterval(() => {
  if (voiceActive && voice?.interimText) {
    document.getElementById('voiceInterim').textContent = voice.interimText;
  }
}, 100);

async function handleVoiceTranscript(transcript, detectedLang) {
  appendVoiceLog(transcript, 'user');
  await processVoiceText(transcript, detectedLang);
}

async function processVoiceText(text, detectedLang = 'en') {
  if (!voice) return;
  const intent = voice.parseIntent(text);
  appendVoiceIntent(intentLabel(intent.intent));

  try {
    const answer = await dispatchVoiceIntent(intent, detectedLang);
    appendVoiceLog(answer, 'ai');
    voice.speak(answer, { lang: detectedLang });
  } catch (err) {
    const errMsg = err?.message === 'NO_API_KEY'
      ? 'Please set your Claude API key in Settings.'
      : 'Something went wrong. Please try again.';
    appendVoiceLog(errMsg, 'ai');
    voice.speak(errMsg);
  }
}

async function dispatchVoiceIntent(intent, lang = 'en') {
  const mode = getMode();

  switch (intent.intent) {

    case 'summarize': {
      const res = await send('GET_SESSION_SUMMARY', { mode });
      return res?.summary || 'Nothing to summarize yet.';
    }

    case 'day_recap': {
      const res = await send('GET_DAY_RECAP', { dateStr: intent.dateHint });
      if (res?.error === 'NO_API_KEY') throw new Error('NO_API_KEY');
      return res?.recap || `No activity found for ${intent.dateHint}.`;
    }

    case 'search':
    case 'ask': {
      const res = await send('ASK_BRAIN', { query: intent.query || intent.text, mode, language: lang, voiceMode: true });
      if (res?.error === 'NO_API_KEY') throw new Error('NO_API_KEY');
      return res?.answer || 'I couldn\'t find anything about that.';
    }

    case 'research_plan': {
      const res = await send('BUILD_RESEARCH_PLAN', { topic: intent.topic });
      const plan = res?.plan;
      if (!plan) return 'Could not build a research plan.';
      currentPlan = plan;
      // Show plan in Research tab
      document.querySelector('.tab-btn[data-tab="research"]')?.click();
      setTimeout(() => {
        document.getElementById('researchTopic').value = intent.topic;
        renderResearchPlan(plan);
      }, 300);
      return `Research plan ready for "${plan.topic}". I generated ${plan.search_queries?.length || 0} search queries covering ${plan.subtopics?.length || 0} subtopics. Check the Research tab.`;
    }

    case 'gaps': {
      const res = await send('GET_KNOWLEDGE_GAPS', { topic: '', mode });
      const gaps = res?.gaps || [];
      if (!gaps.length) return 'No significant knowledge gaps detected yet.';
      return 'Your top knowledge gaps are: ' +
        gaps.map((g, i) => `${i + 1}. ${g.topic}: ${g.why}`).join('. ');
    }

    case 'shield': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return 'No active page to scan.';
      const pageRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }).catch(() => null);
      if (!pageRes?.text) return 'Could not read the page.';
      const res = await send('ASK_BRAIN', {
        query: `Analyze for manipulation in 2 sentences: ${pageRes.text.slice(0,1500)}`,
        mode: 'Shield', language: lang
      });
      return res?.answer || 'No obvious manipulation detected.';
    }

    case 'contradictions': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return 'No active page.';
      const pageRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }).catch(() => null);
      const res = await send('DETECT_CONTRADICTIONS', { currentText: pageRes?.text || '' });
      const items = res?.contradictions || [];
      if (!items.length) return 'No contradictions with your past reading.';
      return `Found ${items.length} contradiction${items.length > 1 ? 's' : ''}. ` +
        items.slice(0, 2).map(c => `"${c.claim?.slice(0,80)}" conflicts with ${c.source}.`).join(' ');
    }

    case 'decision': {
      const res = await send('GET_DECISION_SCORE', { topic: intent.topic });
      const { score, label, missing = [], recommendation = '' } = res || {};
      return `Your decision readiness score is ${score}%, rated "${label}". ${recommendation} ` +
        (missing.length ? `Still missing: ${missing.slice(0,3).join(', ')}.` : '');
    }

    case 'save': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return 'No active page to save.';
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_CAPTURE' });
        return 'Page saved to your Meridian memory.';
      } catch {
        return 'Could not save this page — try reloading it first.';
      }
    }

    case 'navigate': {
      const tabMap = { brain:'brain', oracle:'oracle', shield:'shield',
                       decision:'decision', graph:'graph', history:'history',
                       session:'brain', memory:'brain', research:'research' };
      const target = tabMap[intent.tab] || 'brain';
      document.querySelector(`.tab-btn[data-tab="${target}"]`)?.click();
      return `Opened the ${target} tab.`;
    }

    case 'clear': {
      await send('CLEAR_SESSION');
      return 'Memory cleared.';
    }

    default:
      return 'I didn\'t understand that. Try asking about your research, or say "summarize my session".';
  }
}

function intentLabel(intent) {
  const labels = {
    summarize:     '📋 Summarizing session',
    day_recap:     '📅 Loading day recap',
    research_plan: '🔬 Building research plan',
    search:        '🔍 Searching memory',
    ask:           '🧠 Querying brain',
    gaps:          '🕳️ Detecting gaps',
    shield:        '🛡️ Scanning page',
    contradictions:'⚡ Checking contradictions',
    decision:      '⚖️ Analyzing decision',
    save:          '💾 Saving page',
    navigate:      '🗂️ Navigating',
    clear:         '🗑️ Clearing memory'
  };
  return labels[intent] || '💬 Processing';
}

function appendVoiceLog(text, role) {
  const log = document.getElementById('voiceLog');
  const el  = document.createElement('div');
  el.className = 'vlog-entry';
  el.innerHTML = `<div class="${role === 'user' ? 'vlog-user' : 'vlog-ai'}">${escapeHtml(text)}</div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function appendVoiceIntent(label) {
  const log = document.getElementById('voiceLog');
  const el  = document.createElement('div');
  el.className = 'vlog-intent';
  el.textContent = label;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { init(); initVoice(); });
