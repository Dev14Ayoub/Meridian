async function send(type, data = {}) {
  return chrome.runtime.sendMessage({ type, ...data });
}

async function init() {
  // Stats
  try {
    const stats = await send('GET_MEMORY_STATS');
    document.getElementById('pageCount').textContent = stats?.totalEntries ?? 0;
  } catch {}

  // Mode
  const stored = await chrome.storage.local.get('activeMode');
  document.getElementById('sessionMode').textContent = stored.activeMode || 'General';

  // Open side panel
  document.getElementById('openPanel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });

  // Save current page now
  document.getElementById('saveNow').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_CAPTURE' }).catch(() => {});
    document.getElementById('saveNow').textContent = '✓ Saved!';
    setTimeout(() => { document.getElementById('saveNow').textContent = '💾 Save Page'; }, 1500);
  });

  // Settings → open side panel on settings tab
  document.getElementById('openSettings').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
