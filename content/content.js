(function () {
  // Don't run on extension pages, blank tabs, or non-http(s) schemes
  if (!document.body) return;
  if (!/^https?:$/.test(location.protocol)) return;

  let captureTimer = null;
  let persuasionOverlay = null;

  // Minimal client-side privacy gate. Full redaction runs in the service worker.
  // Keep this list short — it's the "never even leave the tab" layer.
  const LOCAL_PRIVACY_HOSTS = [
    'paypal.com','stripe.com','chase.com','bankofamerica.com','wellsfargo.com',
    'citi.com','capitalone.com','americanexpress.com','discover.com','wise.com',
    'revolut.com','venmo.com','cash.app','coinbase.com','binance.com','kraken.com',
    'mychart.com','kaiserpermanente.org','healthcare.gov','anthem.com',
    'accounts.google.com','login.microsoftonline.com','login.live.com',
    'appleid.apple.com','auth0.com','okta.com','onelogin.com','duosecurity.com',
    '1password.com','lastpass.com','bitwarden.com','dashlane.com',
    'pornhub.com','xvideos.com','xnxx.com','onlyfans.com'
  ];
  const LOCAL_PRIVACY_PATH_RX = /\/(login|signin|logout|password|reset-password|forgot-password|2fa|mfa|oauth|checkout|payments?|billing)(\/|$|\?)/i;
  const LOCAL_BANK_HOST_RX    = /(^|\.)(bank|banque|banco)[a-z0-9-]*\./i;

  function hostMatchesList(host, list) {
    const h = host.toLowerCase().replace(/^www\./, '');
    return list.some(d => h === d || h.endsWith('.' + d));
  }

  function isPrivacyZone() {
    try {
      if (hostMatchesList(location.hostname, LOCAL_PRIVACY_HOSTS)) return true;
      if (LOCAL_BANK_HOST_RX.test(location.hostname)) return true;
      if (LOCAL_PRIVACY_PATH_RX.test(location.pathname + location.search)) return true;
    } catch {}
    return false;
  }

  async function isPaused() {
    try {
      const { pausedHosts = [] } = await chrome.storage.local.get('pausedHosts');
      if (!pausedHosts.length) return false;
      return hostMatchesList(location.hostname, pausedHosts);
    } catch {
      return false;
    }
  }

  function extractText() {
    const clone = document.body.cloneNode(true);
    // Remove scripts, styles, navs, footers, and any <input>/<textarea> values
    ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'input', 'textarea', 'form'].forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    return clone.innerText?.replace(/\s+/g, ' ').trim().slice(0, 8000) || '';
  }

  async function capturePage({ force = false } = {}) {
    if (isPrivacyZone()) return;       // hard-block: never leaves the tab
    if (await isPaused())  return;     // user-paused host

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
      if (isPrivacyZone()) {
        sendResponse({ text: '', url: location.href, title: document.title, blocked: 'privacy_zone' });
      } else {
        sendResponse({ text: extractText(), url: location.href, title: document.title });
      }
    }
    if (msg.type === 'FORCE_CAPTURE') {
      if (isPrivacyZone()) {
        sendResponse({ ok: false, blocked: 'privacy_zone' });
        return true;
      }
      capturePage({ force: true });
      sendResponse({ ok: true });
    }
    if (msg.type === 'GET_PRIVACY_STATE') {
      isPaused().then(paused => {
        sendResponse({
          host: location.hostname.replace(/^www\./, ''),
          privacyZone: isPrivacyZone(),
          paused
        });
      });
      return true; // async response
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
