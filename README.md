# Meridian — AI Browser Co-Pilot

> The AI that brings YOU to every website.

Meridian is a Chrome extension that adds a persistent AI layer on top of your entire browsing experience. It remembers what you read, predicts what you need, and protects you from manipulation — across every tab, every session.

## Features

| Pillar | What it does |
|---|---|
| **Session Brain** | Full memory across tabs/sessions. Ask anything about your past browsing. Export research instantly. |
| **Oracle** | Predicts what you'll need next. Detects knowledge gaps in your research. |
| **Persuasion Shield** | Real-time detection of manipulation tactics — fake urgency, fear appeals, dark patterns. |
| **Decision Readiness** | Scores how ready you are to make a decision with a live completeness tracker. |
| **Knowledge Graph** | A visual, searchable map of everything you've ever read and learned. |

## Setup

### 1. Load the extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked** → select this folder

### 2. Add your Claude API key
1. Click the Meridian icon in your toolbar
2. Open the side panel → click ⚙ Settings
3. Paste your [Claude API key](https://console.anthropic.com/) and save

### 3. Set your Context Mode
Choose your mode (Research / Study / Work / Debug / Shopping) to tune all 5 pillars to your current goal.

## Tech Stack

- **Chrome Extension** — Manifest V3, Side Panel API
- **AI** — Claude Haiku (fast, efficient) via Anthropic API
- **Memory** — IndexedDB (local, private by default)
- **Content Analysis** — Live page capture + semantic querying

## Privacy

Your browsing data stays **100% local** in your browser's IndexedDB. It is only sent to the Claude API when you actively use a feature. No servers. No tracking.

---

Built with the Meridian concept — *a cognitive layer for the internet*.
