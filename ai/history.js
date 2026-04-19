const DB_NAME   = 'MeridianHistoryDB';
const DB_VERSION = 1;

const STORES = {
  PAGE_VISITS:    'page_visits',    // every page captured
  CONVERSATIONS:  'conversations',  // text + voice exchanges
  RESEARCH:       'research'        // research sessions with plans & findings
};

export class MeridianHistory {
  constructor() { this.db = null; }

  async init() {
    if (this.db) return;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;

        // Page visits store
        if (!db.objectStoreNames.contains(STORES.PAGE_VISITS)) {
          const s = db.createObjectStore(STORES.PAGE_VISITS, { keyPath: 'id', autoIncrement: true });
          s.createIndex('date',      'date');
          s.createIndex('timestamp', 'timestamp');
          s.createIndex('url',       'url');
        }

        // Conversations store (text chat + voice exchanges)
        if (!db.objectStoreNames.contains(STORES.CONVERSATIONS)) {
          const s = db.createObjectStore(STORES.CONVERSATIONS, { keyPath: 'id', autoIncrement: true });
          s.createIndex('date',      'date');
          s.createIndex('timestamp', 'timestamp');
          s.createIndex('type',      'type');  // 'text' | 'voice'
        }

        // Research sessions
        if (!db.objectStoreNames.contains(STORES.RESEARCH)) {
          const s = db.createObjectStore(STORES.RESEARCH, { keyPath: 'id', autoIncrement: true });
          s.createIndex('date',      'date');
          s.createIndex('timestamp', 'timestamp');
          s.createIndex('topic',     'topic');
        }
      };

      req.onsuccess  = e => resolve(e.target.result);
      req.onerror    = e => reject(e.target.error);
    });
  }

  // ── Date helpers ─────────────────────────────────────────
  static toDateStr(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }

  static parseDate(input) {
    // Handles: 'today', 'yesterday', 'YYYY-MM-DD', 'Monday', month names, etc.
    const s = input?.trim().toLowerCase();
    if (!s) return MeridianHistory.toDateStr();

    if (s === 'today')     return MeridianHistory.toDateStr();
    if (s === 'yesterday') return MeridianHistory.toDateStr(Date.now() - 86400000);

    // Day names: "monday", "last monday", etc.
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    for (let i = 0; i < days.length; i++) {
      if (s.includes(days[i])) {
        const now = new Date();
        let diff = now.getDay() - i;
        if (diff <= 0) diff += 7;
        return MeridianHistory.toDateStr(Date.now() - diff * 86400000);
      }
    }

    // Month + day: "april 15", "15th april"
    const monthMatch = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{1,2})/i)
                    || s.match(/(\d{1,2})\w*\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (monthMatch) {
      const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
      let month, day;
      if (/^\d/.test(monthMatch[1])) { day = +monthMatch[1]; month = months[monthMatch[2].slice(0,3)]; }
      else { month = months[monthMatch[1].slice(0,3)]; day = +monthMatch[2]; }
      const d = new Date();
      d.setMonth(month); d.setDate(day);
      return MeridianHistory.toDateStr(d.getTime());
    }

    // ISO date passthrough
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // "X days ago"
    const daysAgoMatch = s.match(/(\d+)\s*days?\s*ago/);
    if (daysAgoMatch) return MeridianHistory.toDateStr(Date.now() - +daysAgoMatch[1] * 86400000);

    return MeridianHistory.toDateStr();
  }

  // ── Page Visits ───────────────────────────────────────────
  async savePageVisit(entry) {
    await this.init();
    return this._add(STORES.PAGE_VISITS, {
      ...entry,
      date: MeridianHistory.toDateStr(entry.timestamp || Date.now()),
      timestamp: entry.timestamp || Date.now()
    });
  }

  async getPageVisitsByDate(dateStr) {
    await this.init();
    return this._getByIndex(STORES.PAGE_VISITS, 'date', dateStr);
  }

  async getRecentPageVisits(limit = 50) {
    await this.init();
    return this._getRecent(STORES.PAGE_VISITS, limit);
  }

  // ── Conversations ─────────────────────────────────────────
  async saveConversation(role, message, context = {}) {
    await this.init();
    return this._add(STORES.CONVERSATIONS, {
      role,      // 'user' | 'ai'
      message,
      type:      context.type || 'text',   // 'text' | 'voice'
      intent:    context.intent || null,
      language:  context.language || 'en',
      mode:      context.mode || 'General',
      date:      MeridianHistory.toDateStr(),
      timestamp: Date.now()
    });
  }

  async getConversationsByDate(dateStr) {
    await this.init();
    return this._getByIndex(STORES.CONVERSATIONS, 'date', dateStr);
  }

  async getRecentConversations(limit = 60) {
    await this.init();
    return this._getRecent(STORES.CONVERSATIONS, limit);
  }

  // ── Research Sessions ─────────────────────────────────────
  async saveResearchSession(session) {
    await this.init();
    return this._add(STORES.RESEARCH, {
      ...session,
      date:      MeridianHistory.toDateStr(session.timestamp || Date.now()),
      timestamp: session.timestamp || Date.now()
    });
  }

  async getResearchByDate(dateStr) {
    await this.init();
    return this._getByIndex(STORES.RESEARCH, 'date', dateStr);
  }

  async getResearchByTopic(topic) {
    await this.init();
    const all = await this._getRecent(STORES.RESEARCH, 100);
    const q = topic.toLowerCase();
    return all.filter(r => r.topic?.toLowerCase().includes(q));
  }

  // ── Full Day Summary ──────────────────────────────────────
  async getDaySummary(dateStr) {
    await this.init();
    const [visits, conversations, research] = await Promise.all([
      this.getPageVisitsByDate(dateStr),
      this.getConversationsByDate(dateStr),
      this.getResearchByDate(dateStr)
    ]);
    return { dateStr, visits, conversations, research };
  }

  async getActiveDates(limit = 30) {
    await this.init();
    const visits = await this._getRecent(STORES.PAGE_VISITS, 200);
    const dateSet = new Set(visits.map(v => v.date));
    return [...dateSet].slice(0, limit).sort().reverse();
  }

  // ── Stats ─────────────────────────────────────────────────
  async getStats() {
    await this.init();
    const [visitCount, convCount] = await Promise.all([
      this._count(STORES.PAGE_VISITS),
      this._count(STORES.CONVERSATIONS)
    ]);
    return { visitCount, convCount };
  }

  // ── IndexedDB helpers ─────────────────────────────────────
  _add(store, data) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, 'readwrite');
      tx.objectStore(store).add(data);
      tx.oncomplete = () => res();
      tx.onerror    = e => rej(e.target.error);
    });
  }

  _getByIndex(store, indexName, value) {
    return new Promise((res, rej) => {
      const tx   = this.db.transaction(store, 'readonly');
      const idx  = tx.objectStore(store).index(indexName);
      const req  = idx.getAll(IDBKeyRange.only(value));
      req.onsuccess = e => res(e.target.result || []);
      req.onerror   = e => rej(e.target.error);
    });
  }

  _getRecent(store, limit) {
    return new Promise((res, rej) => {
      const tx     = this.db.transaction(store, 'readonly');
      const index  = tx.objectStore(store).index('timestamp');
      const result = [];
      const req    = index.openCursor(null, 'prev');
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor && result.length < limit) { result.push(cursor.value); cursor.continue(); }
        else res(result);
      };
      req.onerror = e => rej(e.target.error);
    });
  }

  _count(store) {
    return new Promise((res, rej) => {
      const req = this.db.transaction(store, 'readonly').objectStore(store).count();
      req.onsuccess = () => res(req.result);
      req.onerror   = e => rej(e.target.error);
    });
  }
}
