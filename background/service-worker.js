import { MeridianMemory }  from '../ai/memory.js';
import { MeridianBrain }   from '../ai/brain.js';
import { MeridianHistory } from '../ai/history.js';

const memory  = new MeridianMemory();
const brain   = new MeridianBrain();
const history = new MeridianHistory();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(async () => {
  await memory.init();
  await history.init();
  chrome.contextMenus.create({
    id: 'meridian-save',
    title: 'Save to Meridian Memory',
    contexts: ['selection']
  });
});

// ── Message Router ────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {

    // ── Page capture ──────────────────────────────────────
    case 'PAGE_CAPTURED': {
      await memory.init();
      await history.init();
      const entry = {
        url:       message.data.url,
        title:     message.data.title,
        summary:   message.data.text.slice(0, 1500),
        fullText:  message.data.text,
        timestamp: Date.now(),
        tabId:     sender.tab?.id,
        mode:      await getActiveMode()
      };
      await memory.saveEntry(entry);
      await history.savePageVisit(entry);
      await runOracle(entry);
      return { ok: true };
    }

    // ── Session Brain: ask anything ───────────────────────
    case 'ASK_BRAIN': {
      await memory.init();
      await history.init();
      const entries = await memory.getRecentEntries(40);
      const recentConvs = await history.getRecentConversations(20);

      // Save user message to history
      await history.saveConversation('user', message.query, {
        type: message.voiceMode ? 'voice' : 'text',
        language: message.language || 'en',
        mode: message.mode || await getActiveMode()
      });

      const answer = await brain.answerQuestion(message.query, entries, recentConvs);

      // Save AI response to history
      await history.saveConversation('ai', answer, {
        type: message.voiceMode ? 'voice' : 'text',
        language: message.language || 'en',
        mode: message.mode || await getActiveMode()
      });

      return { answer };
    }

    // ── Session summary ───────────────────────────────────
    case 'GET_SESSION_SUMMARY': {
      await memory.init();
      const entries = await memory.getRecentEntries(30);
      const summary = await brain.summarizeSession(entries, message.mode);
      return { summary };
    }

    // ── Day recap ─────────────────────────────────────────
    case 'GET_DAY_RECAP': {
      await history.init();
      const dateStr = message.dateStr || MeridianHistory.toDateStr();
      const { visits, conversations, research } = await history.getDaySummary(dateStr);
      const recap = await brain.getDayRecap(dateStr, visits, conversations, research);

      // Save to conversation history
      await history.saveConversation('user', `What did I do on ${dateStr}?`, { type: 'text' });
      await history.saveConversation('ai', recap, { type: 'text' });

      return { recap, dateStr, visitCount: visits.length, convCount: conversations.length };
    }

    // ── Active dates (for calendar) ───────────────────────
    case 'GET_ACTIVE_DATES': {
      await history.init();
      const dates = await history.getActiveDates(60);
      return { dates };
    }

    // ── Research plan ─────────────────────────────────────
    case 'BUILD_RESEARCH_PLAN': {
      await memory.init();
      await history.init();
      const entries = await memory.getRecentEntries(20);
      const plan = await brain.buildResearchPlan(message.topic, entries);

      // Save research session
      await history.saveResearchSession({
        topic: message.topic,
        plan,
        timestamp: Date.now()
      });

      return { plan };
    }

    // ── Research synthesis ────────────────────────────────
    case 'SYNTHESIZE_RESEARCH': {
      await memory.init();
      const entries = await memory.getRecentEntries(50);
      const synthesis = await brain.synthesizeResearch(message.topic, entries);
      return { synthesis };
    }

    // ── Decision score ────────────────────────────────────
    case 'GET_DECISION_SCORE': {
      await memory.init();
      const entries = await memory.getRecentEntries(50);
      const result = await brain.getDecisionScore(entries, message.topic);
      return result;
    }

    // ── Contradictions ────────────────────────────────────
    case 'DETECT_CONTRADICTIONS': {
      await memory.init();
      const entries = await memory.getRecentEntries(50);
      return brain.detectContradictions(entries, message.currentText);
    }

    // ── Knowledge gaps ────────────────────────────────────
    case 'GET_KNOWLEDGE_GAPS': {
      await memory.init();
      const entries = await memory.getRecentEntries(50);
      return brain.detectGaps(entries, message.topic);
    }

    // ── Memory search ─────────────────────────────────────
    case 'SEARCH_MEMORY': {
      await memory.init();
      const results = await memory.search(message.query);
      return { results };
    }

    // ── History search ────────────────────────────────────
    case 'SEARCH_HISTORY': {
      await history.init();
      const dateStr = MeridianHistory.parseDate(message.dateHint);
      const { visits, conversations, research } = await history.getDaySummary(dateStr);
      return { dateStr, visits, conversations, research };
    }

    // ── Clear session ─────────────────────────────────────
    case 'CLEAR_SESSION': {
      await memory.init();
      await memory.clearSession();
      return { ok: true };
    }

    // ── Stats ─────────────────────────────────────────────
    case 'GET_MEMORY_STATS': {
      await memory.init();
      await history.init();
      const [memStats, histStats] = await Promise.all([
        memory.getStats(),
        history.getStats()
      ]);
      return { ...memStats, ...histStats };
    }

    // ── API key ───────────────────────────────────────────
    case 'SET_API_KEY':
      await chrome.storage.local.set({ apiKey: message.key });
      return { ok: true };

    case 'GET_API_KEY': {
      const data = await chrome.storage.local.get('apiKey');
      return { key: data.apiKey || null };
    }

    // ── Mode ──────────────────────────────────────────────
    case 'SET_MODE':
      await chrome.storage.local.set({ activeMode: message.mode });
      return { ok: true };

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Helpers ───────────────────────────────────────────────
async function getActiveMode() {
  const data = await chrome.storage.local.get('activeMode');
  return data.activeMode || 'General';
}

async function runOracle(entry) {
  try {
    const entries = await memory.getRecentEntries(20);
    if (entries.length < 3) return;
    const prediction = await brain.oracle(entries, entry);
    if (prediction) {
      chrome.runtime.sendMessage({ type: 'ORACLE_UPDATE', prediction }).catch(() => {});
    }
  } catch {}
}

// Context menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'meridian-save' || !info.selectionText) return;
  await memory.init();
  await history.init();
  const entry = {
    url: tab.url, title: tab.title,
    summary: info.selectionText, fullText: info.selectionText,
    timestamp: Date.now(), tabId: tab.id, pinned: true,
    mode: await getActiveMode()
  };
  await memory.saveEntry(entry);
  await history.savePageVisit(entry);
  chrome.runtime.sendMessage({ type: 'MEMORY_UPDATED' }).catch(() => {});
});
