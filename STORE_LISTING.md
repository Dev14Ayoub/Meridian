# Meridian — Chrome Web Store listing

Paste this into the developer dashboard when submitting. All copy below is written to fit Chrome's character limits.

---

## Item name
`Meridian — AI Browser Co-Pilot`

## Short description (max 132 chars)
`Local-first AI side panel powered by your Claude API key. Remembers, researches, and protects across every tab.`

(110 / 132 chars)

## Category
`Productivity` (primary) — optionally cross-list under `Developer Tools`.

## Language
`English`

---

## Detailed description

Meridian is the persistent AI layer your browser has been missing. It opens in Chrome's side panel next to any tab, remembers what you've read, and helps you think — without sending your data anywhere.

**Six things Meridian does:**

🧠 **Brain** — Chat with an AI that actually remembers the pages you've visited this session. Ask "summarize what I read about X" and get a real answer.

🧭 **Research** — Drop a topic, get a structured plan: search queries, key questions, subtopics. One click opens them all. Synthesize what you've found so far.

📅 **History recall** — "What did I read about last Tuesday?" Meridian answers with a narrative recap, not a flat URL list.

🔮 **Oracle** — Predicts what you'll need to know next based on what you're reading. Surfaces knowledge gaps.

🛡️ **Shield** — Scans the current page for manipulation tactics (urgency, scarcity, dark patterns) and flags contradictions across sources.

⚖️ **Decision engine** — "Should I buy a MacBook?" Get a readiness score, what you know, what you're missing.

Plus a **real-time voice companion** in 20+ languages.

---

**Privacy you can actually verify:**
• 100% local storage (IndexedDB + chrome.storage). No servers. No telemetry.
• Your Claude API key calls Anthropic directly from your browser.
• Banking, health, password-manager, and auth sites are hard-blocked — never captured.
• API keys, credit cards, tokens, SSNs are redacted before storage.
• Per-site pause toggle. One-click wipe of all memory.
• Source code open on GitHub — audit it yourself.

**You bring the Claude API key** (free to create at console.anthropic.com). Meridian never sees it — it's stored only in your browser.

Built for students, researchers, writers, analysts, and anyone whose job is to read a lot on the internet and actually remember it.

---

Privacy Policy: https://dev14ayoub.github.io/Meridian/privacy.html
Terms: https://dev14ayoub.github.io/Meridian/terms.html
Source: https://github.com/Dev14Ayoub/Meridian
Support: meridian.extension@proton.me

---

## Permission justifications

Chrome requires one sentence of justification per sensitive permission. Use these verbatim.

| Permission | Justification |
|---|---|
| `storage` | Stores your API key, language preference, and paused-site list locally in the browser. |
| `tabs` | Reads the current tab's URL and title so the AI knows what you're looking at and can act on the active page. |
| `activeTab` | Allows quick actions like "Save this page" and "Scan for manipulation" on the tab you're currently viewing. |
| `scripting` | Injects the content script that extracts page text for summarization (with credential redaction). |
| `sidePanel` | Meridian's entire UI lives in Chrome's side panel instead of a pop-up, so it stays visible while you browse. |
| `contextMenus` | Adds right-click options like "Ask Meridian about this selection" for fast queries without opening the panel. |
| `alarms` | Schedules the 15-second dwell timer before capturing a page, so transient glances aren't stored. |
| Host permission `<all_urls>` | Required to extract page text from any site you visit (minus Privacy Zones) for the AI to summarize and answer questions. No data is uploaded to any server — everything stays in your browser's IndexedDB. |

### Single-purpose description (required field)
`A local-first AI assistant that remembers the pages you visit, answers questions about them, plans research, and flags manipulation — all processed through your own Claude API key with no external telemetry.`

### Remote code use
`No` — Meridian bundles all its code. It makes network requests only to `api.anthropic.com` for Claude API completions using your own key.

### Data handling disclosure

Tick the following in the developer dashboard:
- [x] **Personally identifiable information** — URLs and page content may incidentally include PII. Stored only locally on the user's device.
- [x] **Authentication information** — Not collected; Privacy Zones hard-block auth domains.
- [ ] **Financial and payment information** — Not collected; Privacy Zones block banking sites.
- [ ] **Health information** — Not collected; Privacy Zones block health sites.
- [x] **Website content** — Captured page text. Stored only locally on the user's device, redacted for credentials.
- [ ] **Location** — Not collected.
- [ ] **User activity** — Not collected for telemetry. Browsing history is stored locally only.

Certify:
- [x] I do not sell or transfer user data to third parties outside of the approved use cases
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## Promo text

**Small promo tile (440×280):** "Your persistent AI layer across the web. Local-first. Claude-powered."

**Marquee tile (1400×560):** "Meridian — the AI side panel that remembers what you read. Local-first. Powered by your Claude API key. Free forever."

---

## Screenshots needed (see SHIPPING.md)

1. Brain tab mid-conversation (1280×800)
2. Research tab showing a plan (1280×800)
3. Shield tab with tactics highlighted (1280×800)
4. History recap (1280×800)
5. Voice companion overlay (1280×800)
