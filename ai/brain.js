import { wrapUntrusted, INJECTION_DEFENSE } from '../utils/safety.js';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL      = 'claude-haiku-4-5-20251001';

// Meridian's core personality — multilingual, clear, comprehensive
const MERIDIAN_PERSONA = `You are Meridian, an intelligent AI browser co-pilot. You are helpful, insightful, and thorough.

CRITICAL LANGUAGE RULE: Always detect the language of the user's message and respond ENTIRELY in that same language. If the user writes in French, respond in French. Arabic → Arabic. Spanish → Spanish. English → English. Never mix languages in a single response. Match the user's language exactly.

Be clear, direct, and comprehensive. When answering questions, give complete, well-structured responses. When recapping research, be detailed and organized.

${INJECTION_DEFENSE}`;

export class MeridianBrain {

  async getKey() {
    const data = await chrome.storage.local.get('apiKey');
    return data.apiKey || null;
  }

  async call(systemPrompt, userMessage, maxTokens = 1200) {
    const key = await this.getKey();
    if (!key) throw new Error('NO_API_KEY');

    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'x-api-key':          key,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json'
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: maxTokens,
        system:     `${MERIDIAN_PERSONA}\n\n${systemPrompt}`,
        messages:   [{ role: 'user', content: userMessage }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error (${res.status})`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('Empty response from Claude');
    return text;
  }

  formatEntries(entries) {
    return entries.slice(0, 30).map((e, i) =>
      `[${i + 1}] "${e.title}" — ${e.url}\nSummary: ${e.summary?.slice(0, 500)}`
    ).join('\n\n');
  }

  formatConversations(conversations) {
    return conversations.slice(0, 20).map(c =>
      `[${c.role?.toUpperCase()} — ${new Date(c.timestamp).toLocaleTimeString()}]: ${c.message?.slice(0, 300)}`
    ).join('\n');
  }

  formatVisits(visits) {
    return visits.map(v =>
      `• ${new Date(v.timestamp).toLocaleTimeString()} — "${v.title}" (${v.url})\n  ${v.summary?.slice(0, 300)}`
    ).join('\n\n');
  }

  // ── Session Brain ─────────────────────────────────────────
  async ask(query, entries, mode = 'General') {
    const context = this.formatEntries(entries);
    const system = `You are Meridian's Session Brain with memory of everything the user has browsed.
Answer any question thoroughly. If the question isn't about browsing history, still answer it helpfully using your general knowledge.
Mode: ${mode}.
Always respond in the exact same language as the user's question.`;

    const user = entries.length
      ? `BROWSING HISTORY:\n${wrapUntrusted(context)}\n\nQUESTION: ${query}`
      : `QUESTION: ${query}\n\n(No browsing history yet — answer from general knowledge)`;

    return this.call(system, user, 1500);
  }

  // ── Summarize session ─────────────────────────────────────
  async summarizeSession(entries, mode = 'General') {
    if (!entries.length) return 'No browsing activity recorded yet.';
    const context = this.formatEntries(entries);
    const system = `You are Meridian. Create a comprehensive, well-structured research brief of the user's session.
Include: main topics, key facts learned, important sources, and what they might still need.
Mode: ${mode}. Use clear sections and bullet points. Respond in the user's language if detectable from the content.`;

    return this.call(system, `SESSION DATA:\n${wrapUntrusted(context)}`, 2000);
  }

  // ── Full Day Recap ────────────────────────────────────────
  async getDayRecap(dateStr, visits, conversations, research) {
    const visitText = visits.length
      ? this.formatVisits(visits)
      : 'No pages visited.';

    const convText = conversations.length
      ? this.formatConversations(conversations)
      : 'No conversations recorded.';

    const researchText = research.length
      ? research.map(r => `Topic: ${r.topic}\nPlan: ${JSON.stringify(r.plan)?.slice(0,300)}`).join('\n\n')
      : 'No research sessions.';

    const system = `You are Meridian giving a comprehensive daily recap.
Structure your response clearly with these sections:
1. Day Overview (brief summary of main activities)
2. Websites Visited (list with key info from each)
3. Topics Researched (what they learned)
4. Key Findings & Information Gathered
5. Conversations with Meridian (highlights)
6. What Was Accomplished

Be thorough, organized, and genuinely useful. Include specific URLs and facts.
Respond in the same language as the most recent conversation content.`;

    const user = `DATE: ${dateStr}

WEBSITES VISITED:
${wrapUntrusted(visitText)}

CONVERSATIONS WITH MERIDIAN:
${wrapUntrusted(convText)}

RESEARCH SESSIONS:
${wrapUntrusted(researchText)}

Generate a comprehensive day recap.`;

    return this.call(system, user, 2500);
  }

  // ── Research Planner ──────────────────────────────────────
  async buildResearchPlan(topic, existingEntries = []) {
    const known = existingEntries.length
      ? `Already explored:\n${this.formatEntries(existingEntries.slice(0, 10))}`
      : 'No prior research on this topic.';

    const system = `You are Meridian's Research Planner. Create a comprehensive research strategy.
Respond in JSON:
{
  "topic": "...",
  "overview": "brief description of what to research",
  "search_queries": ["query1", "query2", ...],  // 6-10 specific, targeted Google search queries
  "subtopics": ["subtopic1", ...],              // 4-6 key angles to explore
  "key_questions": ["question1", ...],          // 5-7 questions the research should answer
  "suggested_sources": ["source type 1", ...], // types of sources to look for
  "estimated_depth": "shallow|medium|deep"
}
Only respond with valid JSON.`;

    const raw = await this.call(system, `RESEARCH TOPIC: ${topic}\n\n${wrapUntrusted(known)}`, 1500);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { topic, search_queries: [topic], subtopics: [], key_questions: [], overview: '' };
    }
  }

  // ── Research Synthesis ────────────────────────────────────
  async synthesizeResearch(topic, entries) {
    const context = this.formatEntries(entries);
    const system = `You are Meridian synthesizing research. Create a thorough, well-organized research summary.
Include:
- Executive summary
- Key findings (with sources)
- Important facts and data points
- Conflicting information found
- Consensus view
- Remaining open questions
- Recommended next steps

Be comprehensive and cite sources (page titles + URLs) where relevant.
Respond in the language of the content.`;

    return this.call(system, `RESEARCH TOPIC: ${topic}\n\nSOURCES:\n${wrapUntrusted(context)}`, 3000);
  }

  // ── Answer ANY question ───────────────────────────────────
  async answerQuestion(question, entries, conversationHistory = []) {
    const context = entries.length ? this.formatEntries(entries.slice(0, 20)) : '';
    const history = conversationHistory.length ? this.formatConversations(conversationHistory.slice(0, 10)) : '';

    const system = `You are Meridian, an intelligent AI assistant with access to the user's browsing context.
Answer any question clearly and comprehensively — whether it's about their browsing history, a factual question, a request for advice, or anything else.
Use the browsing context to give more personalized answers when relevant.
Always respond in the same language as the question. Be thorough but concise.`;

    const parts = [];
    if (context) parts.push(`BROWSING CONTEXT:\n${wrapUntrusted(context)}`);
    if (history) parts.push(`RECENT CONVERSATION:\n${wrapUntrusted(history)}`);
    parts.push(`QUESTION: ${question}`);

    return this.call(system, parts.join('\n\n'), 2000);
  }

  // ── Decision Score ────────────────────────────────────────
  async getDecisionScore(entries, topic) {
    const context = this.formatEntries(entries);
    const system = `You are Meridian's Decision Engine. Analyze research completeness for a decision.
Respond in JSON: { "score": 0-100, "label": "Not Ready|Getting There|Almost|Ready", "missing": ["..."], "strengths": ["..."], "recommendation": "one sentence advice" }
Only respond with valid JSON.`;

    const raw = await this.call(system,
      `DECISION: ${topic || 'current research'}\n\nRESEARCH:\n${wrapUntrusted(context)}`, 800);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { score: 50, label: 'Getting There', missing: [], strengths: [], recommendation: '' };
    }
  }

  // ── Contradiction Radar ───────────────────────────────────
  async detectContradictions(entries, currentText) {
    const context = this.formatEntries(entries.slice(0, 15));
    const system = `You are Meridian's Contradiction Radar. Find real factual conflicts between the current page and past reading.
Respond in JSON: { "contradictions": [{ "claim": "...", "conflict": "...", "source": "...", "confidence": "high|medium" }] }
Only flag genuine contradictions, not different opinions. Only respond with valid JSON.`;

    const raw = await this.call(system,
      `CURRENT PAGE:\n${wrapUntrusted(currentText?.slice(0, 1000) || '')}\n\nPAST READING:\n${wrapUntrusted(context)}`, 800);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { contradictions: [] };
    }
  }

  // ── Knowledge Gaps ────────────────────────────────────────
  async detectGaps(entries, topic) {
    const context = this.formatEntries(entries);
    const system = `You are Meridian's Knowledge Gap Detector.
Respond in JSON: { "gaps": [{ "topic": "...", "why": "...", "search_suggestion": "..." }] }
Max 6 gaps. Include a specific search suggestion for each. Only respond with valid JSON.`;

    const raw = await this.call(system,
      `TOPIC: ${topic || 'current research'}\n\nWHAT THEY'VE READ:\n${wrapUntrusted(context)}`, 800);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { gaps: [] };
    }
  }

  // ── Oracle Prediction ─────────────────────────────────────
  async oracle(entries, latest) {
    const context = this.formatEntries(entries.slice(0, 10));
    const system = `You are Meridian's Oracle. Predict the user's next research need.
Respond in JSON: { "prediction": "...", "reason": "...", "search_query": "ready-to-use Google search query" }
Only respond with valid JSON.`;

    const raw = await this.call(system,
      `LATEST: ${latest.title} — ${latest.url}\n\nHISTORY:\n${wrapUntrusted(context)}`, 400);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return null;
    }
  }

  // ── Persuasion Shield ─────────────────────────────────────
  async analyzePersuasion(text) {
    const system = `You are Meridian's Persuasion Shield. Detect manipulation tactics.
Respond in JSON: { "tactics": [{ "text": "...", "technique": "...", "severity": "low|medium|high", "explanation": "..." }] }
Techniques: fake_urgency, fear_appeal, social_proof_manipulation, anchoring, cherry_picking, false_scarcity, emotional_manipulation, misleading_stats, appeal_to_authority, false_dichotomy.
Only flag clear examples. Only respond with valid JSON.`;

    const raw = await this.call(system, `ANALYZE:\n${wrapUntrusted(text?.slice(0, 2000) || '')}`, 800);
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return { tactics: [] };
    }
  }
}
