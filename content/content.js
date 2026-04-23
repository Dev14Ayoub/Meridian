(function () {
  // Don't run on extension pages or blank tabs
  if (!document.body || location.protocol === 'chrome-extension:') return;

  let captureTimer = null;
  let persuasionOverlay = null;

  function extractText() {
    const clone = document.body.cloneNode(true);
    // Remove scripts, styles, navs, footers
    ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe'].forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    return clone.innerText?.replace(/\s+/g, ' ').trim().slice(0, 8000) || '';
  }

  function capturePage({ force = false } = {}) {
    const text = extractText();
    if (!force && text.length < 200) return; // Skip low-content pages unless forced

    chrome.runtime.sendMessage({
      type: 'PAGE_CAPTURED',
      data: {
        url: location.href,
        title: document.title,
        text
      }
    }).catch(() => {});
  }

  // Capture after user has been on page for 10 seconds (shows real intent)
  function scheduleCap() {
    clearTimeout(captureTimer);
    captureTimer = setTimeout(capturePage, 10000);
  }

  scheduleCap();

  // Re-capture on SPA navigation
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleCap();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for commands from side panel / service worker
  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg.type === 'GET_PAGE_TEXT') {
      sendResponse({ text: extractText(), url: location.href, title: document.title });
    }
    if (msg.type === 'FORCE_CAPTURE') {
      capturePage({ force: true });
      sendResponse({ ok: true });
    }
    if (msg.type === 'SHOW_PERSUASION_SHIELD') {
      showPersuasionOverlay(msg.tactics);
      sendResponse({ ok: true });
    }
    if (msg.type === 'CLEAR_PERSUASION_SHIELD') {
      clearPersuasionOverlay();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Persuasion Shield overlay
  function showPersuasionOverlay(tactics) {
    clearPersuasionOverlay();
    if (!tactics?.length) return;

    tactics.forEach(t => {
      if (!t.text) return;
      highlightText(t.text, t.technique, t.severity);
    });

    const badge = document.createElement('div');
    badge.id = 'meridian-shield-badge';
    badge.innerHTML = `
      <span class="m-icon">🛡️</span>
      <span>${tactics.length} tactic${tactics.length > 1 ? 's' : ''} detected</span>
    `;
    document.body.appendChild(badge);
    persuasionOverlay = badge;
  }

  function highlightText(searchText, technique, severity) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    const search = searchText.slice(0, 80).toLowerCase();
    nodes.forEach(n => {
      if (!n.textContent.toLowerCase().includes(search)) return;
      const parent = n.parentElement;
      if (!parent || parent.classList.contains('meridian-highlight')) return;
      const mark = document.createElement('mark');
      mark.className = `meridian-highlight meridian-${severity}`;
      mark.title = `Meridian: ${technique.replace(/_/g, ' ')}`;
      mark.textContent = n.textContent;
      parent.replaceChild(mark, n);
    });
  }

  function clearPersuasionOverlay() {
    document.querySelectorAll('.meridian-highlight').forEach(el => {
      el.replaceWith(document.createTextNode(el.textContent));
    });
    document.getElementById('meridian-shield-badge')?.remove();
    persuasionOverlay = null;
  }
})();
