const DB_NAME = 'MeridianDB';
const DB_VERSION = 1;
const STORE = 'entries';

export class MeridianMemory {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('url', 'url');
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async saveEntry(entry) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  }

  async getRecentEntries(limit = 30) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const index = store.index('timestamp');
      const results = [];
      const req = index.openCursor(null, 'prev');
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = e => reject(e.target.error);
    });
  }

  async search(query) {
    const all = await this.getRecentEntries(100);
    const q = query.toLowerCase();
    return all
      .filter(e =>
        e.title?.toLowerCase().includes(q) ||
        e.summary?.toLowerCase().includes(q) ||
        e.url?.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }

  async getStats() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => {
        resolve({ totalEntries: req.result });
      };
      req.onerror = e => reject(e.target.error);
    });
  }

  async clearSession() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // last 24h
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const index = store.index('timestamp');
      const range = IDBKeyRange.lowerBound(cutoff);
      const req = index.openCursor(range);
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  }
}
