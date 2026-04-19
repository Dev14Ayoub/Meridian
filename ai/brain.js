const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

export class MeridianBrain {

  async getKey() {
    const data = await chrome.storage.local.get('apiKey');
    return data.apiKey || null;
  }

  async call(systemPrompt, userMessage) {
    const key = await this.getKey();
    if (!key) throw new Error('NO_API_KEY');

    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'API error');
    }

    const data = await res.json();
    return data.content[0].text;
  }

  formatEntries(entries) {
    return entries.slice(0, 25).map((e, i) =>
      `[${i + 1}] "${e.title}" — ${e.url}\n${e.summary?.slice(0, 400)}`
    ).join('\n\n');
  }

  // Session Brain: answer questions about what the user has browsed
  async ask(query, entries, mode = 'General') {
    const context = this.formatEntries(entries);
    const system = `You are Meridian's Session Brain — an AI with perfect memory of everything the user has browsed.
You answer questions about their browsing history, research, and reading sessions with precision.
Current mode: ${mode}. Be concise, direct, and cite page titles when relevant.`;

    const user = `BROWSING HISTORY:\n${context}\n\nUSER QUESTION: ${query}`;
    return this.call(system, user);
  }

  // Summarize the current session
  async summarizeSession(entries, mode = 'General') {
    if (!entries.length) return 'No browsing activity recorded yet.';
    const context = this.formatEntries(entries);
    const system = `You are Meridian. Summarize the user's browsing session as a structured research brief.
Include: main topics explored, key insights, and what they might still be missing.
Mode: ${mode}. Be concise — use bullet points.`;

    return this.call(system, `SESSION DATA:\n${context}\n\nProvide a structured session summary.`);
  }

  // Decision Readiness Score
  async getDecisionScore(entries, topic) {
    const context = this.formatEntries(entries);
    const system = `You are Meridian's Decision Engine. Analyze whether the user has enough information to make a confident decision.
Respond in JSON: { "score": 0-100, "label": "Not Ready / Getting There / Almost / Ready", "missing": ["item1","item2"], "strengths": ["item1"] }
Only respond with valid JSON.`;

    const user = `DECISION TOPIC: ${topic || 'current research topic'}\n\nRESEARCH SO FAR:\n${context}`;
    const raw = await this.call(system, user);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { score: 50, label: 'Getting There', missing: [], strengths: [] };
    }
  }

  // Contradiction Radar
  async detectContradictions(entries, currentText) {
    const context = this.formatEntries(entries.slice(0, 15));
    const system = `You are Meridian's Contradiction Radar. Compare the current page content against the user's browsing history and identify factual contradictions.
Respond in JSON: { "contradictions": [{ "claim": "...", "conflict": "...", "source": "..." }] }
Only flag real factual conflicts, not differences of opinion. Only respond with valid JSON.`;

    const user = `CURRENT PAGE:\n${currentText?.slice(0, 800)}\n\nPAST READING:\n${context}`;
    const raw = await this.call(system, user);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { contradictions: [] };
    }
  }

  // Knowledge Gap Detector
  async detectGaps(entries, topic) {
    const context = this.formatEntries(entries);
    const system = `You are Meridian's Knowledge Gap Detector. Analyze what key subtopics or angles the user has NOT yet explored.
Respond in JSON: { "gaps": [{ "topic": "...", "why": "..." }] }
Limit to the 5 most important gaps. Only respond with valid JSON.`;

    const user = `RESEARCH TOPIC: ${topic || 'current research'}\n\nWHAT THEY'VE READ:\n${context}`;
    const raw = await this.call(system, user);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { gaps: [] };
    }
  }

  // Oracle: predict what the user will need next
  async oracle(entries, latest) {
    const context = this.formatEntries(entries.slice(0, 10));
    const system = `You are Meridian's Oracle. Based on the user's browsing pattern, predict what they will need to look up next.
Respond in JSON: { "prediction": "...", "reason": "..." } — one short, specific prediction only. Only respond with valid JSON.`;

    const user = `LATEST PAGE: ${latest.title} — ${latest.url}\n\nRECENT HISTORY:\n${context}`;
    const raw = await this.call(system, user);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return null;
    }
  }

  // Persuasion Shield: analyze page for manipulation
  async analyzePersuasion(text) {
    const system = `You are Meridian's Persuasion Shield. Detect manipulation tactics in the text.
Respond in JSON: { "tactics": [{ "text": "...", "technique": "...", "severity": "low|medium|high" }] }
Techniques: fake_urgency, fear_appeal, social_proof_manipulation, anchoring, cherry_picking, false_scarcity, emotional_manipulation, misleading_stats.
Only flag clear examples. Only respond with valid JSON.`;

    const raw = await this.call(system, `ANALYZE THIS TEXT:\n${text?.slice(0, 2000)}`);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { tactics: [] };
    }
  }
}
