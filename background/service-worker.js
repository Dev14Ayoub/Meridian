import { MeridianMemory } from '../ai/memory.js';
import { MeridianBrain } from '../ai/brain.js';

const memory = new MeridianMemory();
const brain = new MeridianBrain();

// Open side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(async () => {
  await memory.init();
  chrome.contextMenus.create({
    id: 'meridian-save',
    title: 'Save to Meridian Memory',
    contexts: ['selection']
  });
});

// Central message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async
});

async function handleMessage(message, sender) {
  switch (message.type) {

    case 'PAGE_CAPTURED': {
      await memory.init();
      const entry = {
        url: message.data.url,
        title: message.data.title,
        summary: message.data.text.slice(0, 1500),
        fullText: message.data.text,
        timestamp: Date.now(),
        tabId: sender.tab?.id,
        mode: await getActiveMode()
      };
      await memory.saveEntry(entry);
      await runOracle(entry);
      return { ok: true };
    }

    case 'ASK_BRAIN': {
      await memory.init();
      const entries = await memory.getRecentEntries(40);
      const answer = await brain.ask(message.query, entries, message.mode);
      return { answer };
    }

    case 'GET_SESSION_SUMMARY': {
      await memory.init();
      const entries = await memory.getRecentEntries(30);
      const summary = await brain.summarizeSession(entries, message.mode);
      return { summary };
    }

    case 'GET_DECISION_SCORE': {
      await memory.init();
      const entries = await memory.getRecentEntries(50);
      const result = await brain.getDecisionScore(entries, message.topic);
      return result;
    }

    case 'DETECT_CONTRADICTIONS': {
      await memory.init();
      const entries = await memory.getRecentEntries(50);
      const result = await brain.detectContradictions(entries, message.currentText);
      return result;
    }

    case 'GET_KNOWLEDGE_GAPS': {
      await memory.init();
      const entries = await memory.getRecentEntries(50);
      const gaps = await brain.detectGaps(entries, message.topic);
      return { gaps };
    }

    case 'SEARCH_MEMORY': {
      await memory.init();
      const results = await memory.search(message.query);
      return { results };
    }

    case 'CLEAR_SESSION': {
      await memory.init();
      await memory.clearSession();
      return { ok: true };
    }

    case 'GET_MEMORY_STATS': {
      await memory.init();
      const stats = await memory.getStats();
      return stats;
    }

    case 'SET_API_KEY': {
      await chrome.storage.local.set({ apiKey: message.key });
      return { ok: true };
    }

    case 'GET_API_KEY': {
      const data = await chrome.storage.local.get('apiKey');
      return { key: data.apiKey || null };
    }

    case 'SET_MODE': {
      await chrome.storage.local.set({ activeMode: message.mode });
      return { ok: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

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

// Context menu: save selection
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'meridian-save' && info.selectionText) {
    await memory.init();
    await memory.saveEntry({
      url: tab.url,
      title: tab.title,
      summary: info.selectionText,
      fullText: info.selectionText,
      timestamp: Date.now(),
      tabId: tab.id,
      pinned: true,
      mode: await getActiveMode()
    });
    chrome.runtime.sendMessage({ type: 'MEMORY_UPDATED' }).catch(() => {});
  }
});
