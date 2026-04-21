async function send(type, data = {}) {
  return chrome.runtime.sendMessage({ type, ...data });
}

async function openPanelWithSettings(openSettingsFlag) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (openSettingsFlag) await chrome.storage.local.set({ openSettingsOnLoad: true });
  await chrome.sidePanel.open({ tabId: tab.id });
  window.close();
}

async function init() {
  // API key — drives setup CTA + status dot
  const { key } = await send('GET_API_KEY') ?? {};
  const hasKey = !!key;
  document.getElementById('setupCta').classList.toggle('hidden', hasKey);
  document.getElementById('statusDot').classList.toggle('warn', !hasKey);

  // Stats
  try {
    const stats = await send('GET_MEMORY_STATS');
    document.getElementById('pageCount').textContent = stats?.totalEntries ?? 0;
  } catch {}

  // Mode
  const stored = await chrome.storage.local.get('activeMode');
  document.getElementById('sessionMode').textContent = stored.activeMode || 'General';

  // Open side panel
  document.getElementById('openPanel').addEventListener('click', () => openPanelWithSettings(false));

  // Setup CTA → open panel and auto-open the settings overlay
  document.getElementById('setupBtn').addEventListener('click', () => openPanelWithSettings(true));

  // Save current page now
  document.getElementById('saveNow').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_CAPTURE' }).catch(() => {});
    document.getElementById('saveNow').textContent = '✓ Saved!';
    setTimeout(() => { document.getElementById('saveNow').textContent = '💾 Save Page'; }, 1500);
  });

  // Settings → open side panel with settings overlay pre-opened
  document.getElementById('openSettings').addEventListener('click', () => openPanelWithSettings(true));
}

document.addEventListener('DOMContentLoaded', init);
