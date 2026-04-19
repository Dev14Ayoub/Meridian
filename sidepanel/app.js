import { VoiceEngine } from '../ai/voice.js';

// ── Voice state ───────────────────────────────────────────
let voice = null;
let voiceActive = false;

// ── Helpers ──────────────────────────────────────────────
function msg(text, role) {
  const container = document.getElementById('chatContainer');
  const welcome = container.querySelector('.welcome-msg');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
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
  el.innerHTML = `<div class="thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px;font-size:11px">Thinking…</span></div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

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

// ── Init ──────────────────────────────────────────────────
async function init() {
  // Restore saved mode
  const stored = await chrome.storage.local.get('activeMode');
  if (stored.activeMode) {
    document.getElementById('modeSelect').value = stored.activeMode;
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'graph') loadGraph();
    });
  });

  // Mode change
  document.getElementById('modeSelect').addEventListener('change', e => {
    send('SET_MODE', { mode: e.target.value });
  });

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.remove('hidden');
    loadApiKey();
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settingsOverlay').classList.add('hidden');
  });
  document.getElementById('saveKeyBtn').addEventListener('click', saveApiKey);

  // Session Brain chat
  document.getElementById('chatSend').addEventListener('click', sendChat);
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  // Quick prompts
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('chatInput').value = btn.dataset.q;
      sendChat();
    });
  });

  // Export / Clear
  document.getElementById('exportBtn').addEventListener('click', exportSession);
  document.getElementById('clearBtn').addEventListener('click', clearMemory);

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

  // Listen for oracle updates from background
  chrome.runtime.onMessage.addListener(msg_ => {
    if (msg_.type === 'ORACLE_UPDATE') showOraclePrediction(msg_.prediction);
    if (msg_.type === 'MEMORY_UPDATED') {
      const graphTab = document.querySelector('.tab-btn[data-tab="graph"]');
      if (graphTab?.classList.contains('active')) loadGraph();
    }
  });

  // Auto-run contradiction check
  autoContradictionCheck();
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
    if (res?.error === 'NO_API_KEY') {
      msg('Please set your Claude API key in Settings ⚙', 'ai');
    } else {
      msg(res?.answer || 'No response.', 'ai');
    }
  } catch (err) {
    loader.remove();
    msg('Something went wrong. Check your API key.', 'ai');
  }
}

async function exportSession() {
  const loader = thinking();
  try {
    const res = await send('GET_SESSION_SUMMARY', { mode: getMode() });
    loader.remove();
    const blob = new Blob([res.summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian-session-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    loader.remove();
    msg('Export failed. Try again.', 'ai');
  }
}

async function clearMemory() {
  if (!confirm('Clear today\'s memory? This cannot be undone.')) return;
  await send('CLEAR_SESSION');
  const container = document.getElementById('chatContainer');
  container.innerHTML = `<div class="welcome-msg">
    <div class="welcome-icon">🧠</div>
    <p>Memory cleared. Ready for a fresh session.</p>
  </div>`;
}

// ── Oracle ────────────────────────────────────────────────
async function loadOracle() {
  document.getElementById('oraclePrediction').innerHTML = '<div class="loading-state">Analyzing your pattern…</div>';
  document.getElementById('gapsList').innerHTML = '<div class="loading-state">Detecting gaps…</div>';

  try {
    const [gapRes] = await Promise.all([
      send('GET_KNOWLEDGE_GAPS', { topic: '', mode: getMode() })
    ]);
    renderGaps(gapRes?.gaps || []);
  } catch {
    document.getElementById('gapsList').innerHTML = '<div class="loading-state">Set your API key to enable this feature.</div>';
  }
}

function showOraclePrediction(prediction) {
  if (!prediction) return;
  document.getElementById('oraclePrediction').innerHTML = `
    <div class="oracle-prediction">
      <strong>🔮 Next: ${prediction.prediction}</strong>
      <span class="oracle-reason">${prediction.reason}</span>
    </div>`;
}

function renderGaps(gaps) {
  const el = document.getElementById('gapsList');
  if (!gaps.length) {
    el.innerHTML = '<div class="loading-state">No significant gaps detected yet. Keep browsing!</div>';
    return;
  }
  el.innerHTML = gaps.map(g => `
    <div class="gap-item">
      <div class="gap-topic">${g.topic}</div>
      <div class="gap-why">${g.why}</div>
    </div>`).join('');
}

// ── Persuasion Shield ─────────────────────────────────────
async function runShield() {
  const btn = document.getElementById('runShieldBtn');
  btn.textContent = 'Scanning…';
  btn.disabled = true;

  document.getElementById('shieldResults').innerHTML = '<div class="loading-state">Analyzing page for manipulation…</div>';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    const pageRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' });
    const res = await send('ASK_BRAIN', {
      query: `__PERSUASION_SHIELD__${pageRes.text?.slice(0,2000)}`,
      mode: 'Shield'
    });

    // Use brain directly for persuasion
    const shieldRes = await chrome.runtime.sendMessage({
      type: 'ASK_BRAIN',
      query: pageRes.text?.slice(0, 2000),
      mode: 'Persuasion'
    });

    // Re-request properly
    const bgRes = await chrome.runtime.sendMessage({ type: 'DETECT_CONTRADICTIONS', currentText: pageRes.text });
    renderContradictions(bgRes?.contradictions || []);

    // For shield, call the background with page text
    const shieldData = await chrome.runtime.sendMessage({
      type: 'ASK_BRAIN',
      query: `Analyze this text for persuasion tactics and respond in JSON format: { "tactics": [{ "text": "...", "technique": "...", "severity": "low|medium|high" }] }\n\nTEXT:\n${pageRes.text?.slice(0,2000)}`,
      mode: 'Shield'
    });

    let tactics = [];
    try {
      const parsed = JSON.parse(shieldData?.answer?.replace(/```json|```/g, '').trim() || '{}');
      tactics = parsed.tactics || [];
    } catch {}

    renderShieldResults(tactics);

    // Highlight on page
    if (tactics.length) {
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PERSUASION_SHIELD', tactics });
    }

  } catch (err) {
    document.getElementById('shieldResults').innerHTML =
      `<div class="loading-state">${err.message === 'NO_API_KEY' ? 'Set your API key in Settings.' : 'Error analyzing page.'}</div>`;
  }

  btn.textContent = 'Scan Page';
  btn.disabled = false;
}

function renderShieldResults(tactics) {
  const el = document.getElementById('shieldResults');
  if (!tactics.length) {
    el.innerHTML = '<div class="no-tactics">✅ No manipulation tactics detected on this page.</div>';
    return;
  }
  el.innerHTML = tactics.map(t => `
    <div class="tactic-item ${t.severity}">
      <div class="tactic-name">${t.severity.toUpperCase()} — ${t.technique?.replace(/_/g,' ')}</div>
      <div class="tactic-text">"${t.text?.slice(0,120)}"</div>
    </div>`).join('');
}

function renderContradictions(items) {
  const el = document.getElementById('contradictionResults');
  if (!items?.length) {
    el.innerHTML = '<div class="no-tactics">✅ No contradictions with your past reading.</div>';
    return;
  }
  el.innerHTML = items.map(c => `
    <div class="tactic-item high">
      <div class="tactic-name">Contradiction</div>
      <div class="tactic-text">Claim: "${c.claim?.slice(0,100)}"</div>
      <div class="tactic-text" style="margin-top:4px">Conflicts with: <em>${c.source}</em></div>
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

// ── Decision Score ────────────────────────────────────────
async function runDecision() {
  const topic = document.getElementById('decisionTopic').value.trim();
  const result = document.getElementById('decisionResult');
  result.classList.add('hidden');

  const btn = document.getElementById('runDecisionBtn');
  btn.textContent = 'Analyzing…';
  btn.disabled = true;

  try {
    const res = await send('GET_DECISION_SCORE', { topic });
    if (res?.score !== undefined) {
      renderDecisionScore(res);
      result.classList.remove('hidden');
    }
  } catch {}

  btn.textContent = 'Analyze';
  btn.disabled = false;
}

function renderDecisionScore(data) {
  const { score, label, missing = [], strengths = [] } = data;
  document.getElementById('scoreNum').textContent = score;
  document.getElementById('scoreTag').textContent = label;

  // Animate ring
  const circumference = 326.7;
  const offset = circumference - (score / 100) * circumference;
  const arc = document.getElementById('scoreArc');
  arc.style.strokeDashoffset = offset;
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  arc.setAttribute('stroke', color);
  document.getElementById('scoreNum').style.color = color;

  document.getElementById('strengthsList').innerHTML =
    strengths.map(s => `<li>${s}</li>`).join('') || '<li>Keep researching...</li>';
  document.getElementById('missingList').innerHTML =
    missing.map(m => `<li>${m}</li>`).join('') || '<li>Looking good!</li>';
}

// ── Knowledge Graph ───────────────────────────────────────
async function loadGraph() {
  const stats = await send('GET_MEMORY_STATS');
  const entries = await send('SEARCH_MEMORY', { query: '' });

  document.getElementById('graphStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${stats?.totalEntries || 0}</div>
      <div class="stat-label">Pages Saved</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${entries?.results?.length || 0}</div>
      <div class="stat-label">Indexed</div>
    </div>`;

  const list = document.getElementById('graphList');
  const items = entries?.results || [];
  if (!items.length) {
    list.innerHTML = '<div class="loading-state">Browse some pages to build your knowledge graph.</div>';
    return;
  }
  list.innerHTML = items.map(e => `
    <div class="graph-entry">
      <div class="entry-dot"></div>
      <div class="entry-info">
        <div class="entry-title">${e.title || 'Untitled'}</div>
        <div class="entry-url">${e.url}</div>
      </div>
      <div class="entry-time">${timeAgo(e.timestamp)}</div>
    </div>`).join('');
}

// ── Settings ──────────────────────────────────────────────
async function loadApiKey() {
  const res = await send('GET_API_KEY');
  if (res?.key) {
    document.getElementById('apiKeyInput').value = res.key;
    document.getElementById('keyStatus').textContent = '✓ API key saved';
    document.getElementById('keyStatus').className = 'key-status ok';
  }
}

async function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  await send('SET_API_KEY', { key });
  document.getElementById('keyStatus').textContent = '✓ Saved successfully';
  document.getElementById('keyStatus').className = 'key-status ok';
}

// ── Voice ─────────────────────────────────────────────────
function initVoice() {
  voice = new VoiceEngine({
    onTranscript: handleVoiceTranscript,
    onStateChange: handleVoiceStateChange,
    onError: (err) => {
      setVoiceStatus(`Error: ${err}`);
      setOrbState('idle');
    }
  });

  // Populate voice selector
  const sel = document.getElementById('voiceSelect');
  const populate = () => {
    const voices = voice.getAvailableVoices();
    sel.innerHTML = voices.map((v, i) =>
      `<option value="${i}">${v.name.slice(0, 20)}</option>`
    ).join('');
  };
  populate();
  window.speechSynthesis.onvoiceschanged = populate;

  sel.addEventListener('change', () => voice.setVoiceByIndex(+sel.value));

  // Continuous toggle
  document.getElementById('continuousToggle').addEventListener('change', e => {
    voice.setContinuous(e.target.checked);
  });

  // Tap-to-speak button
  document.getElementById('voiceTapBtn').addEventListener('click', () => {
    if (voice.state === 'listening') {
      voice.stopListening();
    } else if (voice.state === 'idle') {
      voice.startListening();
    }
  });

  // Stop speaking button
  document.getElementById('voiceStopBtn').addEventListener('click', () => {
    voice.stopSpeaking();
    if (voice.continuous) voice.resumeListening();
  });

  // Open / close overlay
  document.getElementById('voiceBtn').addEventListener('click', openVoiceOverlay);
  document.getElementById('closeVoiceBtn').addEventListener('click', closeVoiceOverlay);

  // Hint chips as quick commands
  document.querySelectorAll('.hint').forEach(h => {
    h.addEventListener('click', () => {
      const text = h.textContent.replace(/['"]/g, '').trim();
      processVoiceText(text);
    });
  });

  // Update mode badge
  document.getElementById('modeSelect').addEventListener('change', () => {
    document.getElementById('voiceModeBadge').textContent =
      document.getElementById('modeSelect').value + ' Mode';
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
  const interim  = document.getElementById('voiceInterim');

  switch (state) {
    case 'listening':
      setVoiceStatus('Listening…');
      tapLabel.textContent = 'Stop listening';
      tapBtn.classList.add('listening-active');
      stopBtn.classList.add('hidden');
      interim.textContent = '';
      break;
    case 'thinking':
      setVoiceStatus('Thinking…');
      tapLabel.textContent = 'Tap to speak';
      tapBtn.classList.remove('listening-active');
      stopBtn.classList.add('hidden');
      interim.textContent = '';
      break;
    case 'speaking':
      setVoiceStatus('Speaking…');
      tapLabel.textContent = 'Tap to speak';
      tapBtn.classList.remove('listening-active');
      stopBtn.classList.remove('hidden');
      break;
    default:
      setVoiceStatus(document.getElementById('continuousToggle').checked
        ? 'Listening continuously…' : 'Tap to speak');
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

// Update interim display as user speaks
function updateInterim() {
  if (voice?.interimText) {
    document.getElementById('voiceInterim').textContent = voice.interimText;
  }
}
setInterval(() => { if (voiceActive) updateInterim(); }, 100);

async function handleVoiceTranscript(transcript) {
  appendVoiceLog(transcript, 'user');
  await processVoiceText(transcript);
}

async function processVoiceText(text) {
  if (!voice) return;
  const intent = voice.parseIntent(text);

  // Show intent label
  appendVoiceIntent(intentLabel(intent.intent));

  try {
    const answer = await dispatchVoiceIntent(intent);
    appendVoiceLog(answer, 'ai');
    voice.speak(answer);
  } catch (err) {
    const errMsg = err?.message === 'NO_API_KEY'
      ? 'Please set your Claude API key in Settings.'
      : 'Something went wrong. Please try again.';
    appendVoiceLog(errMsg, 'ai');
    voice.speak(errMsg);
  }
}

async function dispatchVoiceIntent(intent) {
  const mode = getMode();

  switch (intent.intent) {

    case 'summarize': {
      const res = await send('GET_SESSION_SUMMARY', { mode });
      return res?.summary || 'Nothing to summarize yet. Browse a few pages first.';
    }

    case 'search':
    case 'ask': {
      const res = await send('ASK_BRAIN', { query: intent.query || intent.text, mode });
      if (res?.error === 'NO_API_KEY') throw new Error('NO_API_KEY');
      return res?.answer || 'I couldn\'t find anything about that in your session.';
    }

    case 'gaps': {
      const res = await send('GET_KNOWLEDGE_GAPS', { topic: '', mode });
      const gaps = res?.gaps || [];
      if (!gaps.length) return 'No significant knowledge gaps detected yet.';
      return 'Here are your top knowledge gaps: ' +
        gaps.map((g, i) => `${i + 1}. ${g.topic} — ${g.why}`).join('. ');
    }

    case 'shield': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return 'No active page to scan.';
      const pageRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }).catch(() => null);
      if (!pageRes?.text) return 'Could not read the page content.';
      const res = await send('ASK_BRAIN', {
        query: `Analyze for manipulation tactics and summarize findings in 2 sentences: ${pageRes.text.slice(0, 1500)}`,
        mode: 'Shield'
      });
      return res?.answer || 'Page analysis complete. No obvious manipulation detected.';
    }

    case 'contradictions': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return 'No active page to check.';
      const pageRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }).catch(() => null);
      const res = await send('DETECT_CONTRADICTIONS', { currentText: pageRes?.text || '' });
      const items = res?.contradictions || [];
      if (!items.length) return 'No contradictions found with your past reading.';
      return `I found ${items.length} contradiction${items.length > 1 ? 's' : ''}. ` +
        items.slice(0, 2).map(c => `"${c.claim?.slice(0, 80)}" conflicts with ${c.source}.`).join(' ');
    }

    case 'decision': {
      const res = await send('GET_DECISION_SCORE', { topic: intent.topic });
      const { score, label, missing = [] } = res || {};
      let reply = `Your decision readiness is ${score}%, rated "${label}".`;
      if (missing.length) reply += ` You're still missing: ${missing.slice(0, 3).join(', ')}.`;
      return reply;
    }

    case 'save': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }).catch(() => {});
      return 'Page saved to your Meridian memory.';
    }

    case 'navigate': {
      const tabMap = { brain: 'brain', oracle: 'oracle', shield: 'shield',
                       decision: 'decision', graph: 'graph', session: 'brain', memory: 'brain' };
      const target = tabMap[intent.tab] || 'brain';
      document.querySelector(`.tab-btn[data-tab="${target}"]`)?.click();
      return `Switched to ${target} tab.`;
    }

    case 'clear': {
      await send('CLEAR_SESSION');
      return 'Memory cleared. Starting fresh.';
    }

    default:
      return 'I didn\'t catch that. Try asking about your research, or say "summarize my session".';
  }
}

function intentLabel(intent) {
  const labels = {
    summarize: '📋 Summarizing session',
    search:    '🔍 Searching memory',
    ask:       '🧠 Querying brain',
    gaps:      '🕳️ Detecting gaps',
    shield:    '🛡️ Scanning page',
    contradictions: '⚡ Checking contradictions',
    decision:  '⚖️ Decision score',
    save:      '💾 Saving page',
    navigate:  '🗂️ Navigating',
    clear:     '🗑️ Clearing memory'
  };
  return labels[intent] || '💬 Processing';
}

function appendVoiceLog(text, role) {
  const log = document.getElementById('voiceLog');
  const el = document.createElement('div');
  el.className = role === 'user' ? 'vlog-entry' : 'vlog-entry';
  el.innerHTML = `<div class="${role === 'user' ? 'vlog-user' : 'vlog-ai'}">${escapeHtml(text)}</div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function appendVoiceIntent(label) {
  const log = document.getElementById('voiceLog');
  const el = document.createElement('div');
  el.className = 'vlog-intent';
  el.textContent = label;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { init(); initVoice(); });
