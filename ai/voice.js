// Language code → BCP-47 recognition codes
const LANG_CODES = {
  auto:  '',           // browser auto-detect
  en:    'en-US',
  fr:    'fr-FR',
  ar:    'ar-SA',
  es:    'es-ES',
  de:    'de-DE',
  it:    'it-IT',
  pt:    'pt-BR',
  ru:    'ru-RU',
  zh:    'zh-CN',
  ja:    'ja-JP',
  ko:    'ko-KR',
  hi:    'hi-IN',
  tr:    'tr-TR',
  nl:    'nl-NL',
  pl:    'pl-PL',
  sv:    'sv-SE',
  da:    'da-DK',
  fi:    'fi-FI',
  no:    'nb-NO',
  cs:    'cs-CZ',
  ro:    'ro-RO',
  uk:    'uk-UA',
  id:    'id-ID',
  ms:    'ms-MY',
  th:    'th-TH',
  vi:    'vi-VN',
};

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en',   name: 'English' },
  { code: 'fr',   name: 'Français' },
  { code: 'ar',   name: 'العربية' },
  { code: 'es',   name: 'Español' },
  { code: 'de',   name: 'Deutsch' },
  { code: 'it',   name: 'Italiano' },
  { code: 'pt',   name: 'Português' },
  { code: 'ru',   name: 'Русский' },
  { code: 'zh',   name: '中文' },
  { code: 'ja',   name: '日本語' },
  { code: 'ko',   name: '한국어' },
  { code: 'hi',   name: 'हिन्दी' },
  { code: 'tr',   name: 'Türkçe' },
  { code: 'nl',   name: 'Nederlands' },
  { code: 'pl',   name: 'Polski' },
];

export class VoiceEngine {
  constructor({ onTranscript, onStateChange, onError } = {}) {
    this.onTranscript   = onTranscript  || (() => {});
    this.onStateChange  = onStateChange || (() => {});
    this.onError        = onError       || (() => {});

    this.recognition    = null;
    this.synth          = window.speechSynthesis;
    this.voices         = [];
    this.preferredVoice = null;
    this.langCode       = 'auto';    // user-chosen language code
    this.detectedLang   = null;      // auto-detected from transcript
    this.state          = 'idle';
    this.continuous     = false;
    this.interimText    = '';
    this._speaking      = false;
    this._aborted       = false;

    this._initRecognition();
    this._loadVoices();
  }

  // ── Speech Recognition ────────────────────────────────────
  _initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.onError('Speech recognition not supported.'); return; }

    this.recognition = new SR();
    this.recognition.interimResults    = true;
    this.recognition.maxAlternatives   = 1;
    this.recognition.continuous        = false;
    this._applyLang();

    this.recognition.onstart = () => this._setState('listening');

    this.recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      this.interimText = interim;
      if (final.trim()) {
        this.interimText = '';
        // Auto-detect language from transcript
        if (this.langCode === 'auto') this._detectLang(final);
        this._setState('thinking');
        this.onTranscript(final.trim(), this.detectedLang || 'en');
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      this.onError(e.error);
      this._setState('idle');
    };

    this.recognition.onend = () => {
      if (this._aborted) return;
      if (this.continuous && this.state !== 'thinking' && this.state !== 'speaking') {
        this._restartListening();
      } else if (!this.continuous) {
        this._setState('idle');
      }
    };
  }

  _applyLang() {
    if (!this.recognition) return;
    this.recognition.lang = LANG_CODES[this.langCode] ?? '';
  }

  _detectLang(text) {
    // Simple heuristic: detect script/language from character ranges
    if (/[\u0600-\u06FF]/.test(text))  { this.detectedLang = 'ar'; return; }
    if (/[\u4E00-\u9FFF]/.test(text))  { this.detectedLang = 'zh'; return; }
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) { this.detectedLang = 'ja'; return; }
    if (/[\uAC00-\uD7AF]/.test(text))  { this.detectedLang = 'ko'; return; }
    if (/[\u0900-\u097F]/.test(text))  { this.detectedLang = 'hi'; return; }
    if (/[\u0400-\u04FF]/.test(text))  { this.detectedLang = 'ru'; return; }
    // Latin-based: check common words
    const t = text.toLowerCase();
    if (/\b(le|la|les|un|une|des|et|est|que|je|tu|il|nous|vous|ils)\b/.test(t)) { this.detectedLang = 'fr'; return; }
    if (/\b(el|la|los|las|un|una|y|es|que|yo|tú|él|nos|vos)\b/.test(t)) { this.detectedLang = 'es'; return; }
    if (/\b(der|die|das|ein|eine|und|ist|ich|du|er|wir|sie)\b/.test(t)) { this.detectedLang = 'de'; return; }
    if (/\b(il|la|lo|i|le|un|una|e|è|che|io|tu|lui|noi)\b/.test(t)) { this.detectedLang = 'it'; return; }
    if (/\b(o|a|os|as|um|uma|e|é|que|eu|tu|ele|nós)\b/.test(t)) { this.detectedLang = 'pt'; return; }
    this.detectedLang = 'en';
  }

  _setState(s) { this.state = s; this.onStateChange(s); }

  _restartListening() {
    try { this.recognition?.start(); } catch {}
  }

  startListening() {
    if (!this.recognition) return;
    this._aborted = false;
    this._applyLang();
    this._setState('listening');
    try { this.recognition.start(); } catch {}
  }

  stopListening() {
    this._aborted = true;
    try { this.recognition?.abort(); } catch {}
    this._setState('idle');
  }

  resumeListening() {
    if (!this.continuous) return;
    this._aborted = false;
    this._restartListening();
  }

  setLanguage(code) {
    this.langCode = code;
    this.detectedLang = code === 'auto' ? null : code;
    this._applyLang();
    // Update preferred TTS voice to match
    this.preferredVoice = this._pickVoice(LANG_CODES[code] || '');
  }

  setContinuous(val) { this.continuous = val; }

  // ── TTS ───────────────────────────────────────────────────
  _loadVoices() {
    const set = () => {
      this.voices = this.synth.getVoices();
      this.preferredVoice = this._pickVoice(LANG_CODES[this.langCode] || '');
    };
    set();
    this.synth.onvoiceschanged = set;
  }

  _pickVoice(langBcp47 = '') {
    const baseLang = langBcp47.slice(0, 2).toLowerCase();

    // Priority list for common languages
    const PRIORITY = {
      en: ['Google UK English Female','Google US English','Microsoft Aria Online (Natural)','Microsoft Jenny Online (Natural)','Samantha'],
      fr: ['Google français','Microsoft Julie Online (Natural)','Thomas'],
      ar: ['Google Arabic','Microsoft Hoda Online (Natural)'],
      es: ['Google español','Microsoft Sabina Online (Natural)'],
      de: ['Google Deutsch','Microsoft Hedda Online (Natural)','Anna'],
      it: ['Google italiano','Microsoft Elsa Online (Natural)'],
      pt: ['Google português do Brasil','Microsoft Maria Online (Natural)'],
      ru: ['Google русский','Microsoft Irina Online (Natural)'],
      zh: ['Google 普通话（中国大陆）','Microsoft Huihui Online (Natural)'],
      ja: ['Google 日本語','Microsoft Haruka Online (Natural)'],
      ko: ['Google 한국의','Microsoft Heami Online (Natural)'],
    };

    const names = PRIORITY[baseLang] || [];
    for (const name of names) {
      const v = this.voices.find(v => v.name === name);
      if (v) return v;
    }

    // Fallback: first voice matching the language
    if (baseLang) {
      const match = this.voices.find(v => v.lang.toLowerCase().startsWith(baseLang));
      if (match) return match;
    }

    // Last resort: any English voice
    return this.voices.find(v => v.lang.startsWith('en')) || this.voices[0] || null;
  }

  speak(text, { onEnd, lang } = {}) {
    if (!text || this._speaking) { onEnd?.(); return; }
    this.synth.cancel();
    this._setState('speaking');
    this._speaking = true;

    // If response is in a different language, pick matching voice
    if (lang && lang !== (this.langCode === 'auto' ? 'en' : this.langCode)) {
      const tempVoice = this._pickVoice(LANG_CODES[lang] || lang);
      if (tempVoice) this.preferredVoice = tempVoice;
    }

    const chunks = this._chunkText(text, 220);
    let i = 0;

    const sayNext = () => {
      if (i >= chunks.length) {
        this._speaking = false;
        this._setState('idle');
        onEnd?.();
        if (this.continuous) this.resumeListening();
        return;
      }
      const utt    = new SpeechSynthesisUtterance(chunks[i++]);
      utt.voice    = this.preferredVoice;
      utt.rate     = 1.05;
      utt.pitch    = 1.0;
      utt.volume   = 1.0;
      utt.onend    = sayNext;
      utt.onerror  = () => { this._speaking = false; this._setState('idle'); onEnd?.(); };
      this.synth.speak(utt);
    };
    sayNext();
  }

  stopSpeaking() {
    this.synth.cancel();
    this._speaking = false;
    this._setState('idle');
  }

  _chunkText(text, maxLen) {
    const sentences = text.match(/[^.!?؟।]+[.!?؟।]*/g) || [text];
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      if ((current + s).length > maxLen) {
        if (current) chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  // ── Command Detection (language-aware) ────────────────────
  parseIntent(text) {
    const t = text.toLowerCase()
      .replace(/^(hey\s+)?m[eé]ridian[\s,!]+/i, '')
      .replace(/^(مرحبا|مرحباً|يا)\s*م?ي?ر?ي?د?ي?ا?ن?\s*/i, '')
      .trim();

    // Summarize — multilingual keywords
    if (/^(summar|recap|résumé|résumer|ملخص|خلاصة|resumen|zusammenfassung|riepilogo|resumo|итог|要約|요약|सारांश)/i.test(t))
      return { intent: 'summarize', text: t };

    // Day recap — "what did I do on [date]"
    if (/^(what did i do|what have i done|recap|show me|give me|tell me).*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday|\d+|last|days? ago)/i.test(t)
     || /^(qu[' ]est.ce que j.ai fait|que hice|was habe ich gemacht|cosa ho fatto)/i.test(t)) {
      const dateMatch = t.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday|\d+\s*days?\s*ago|\d{4}-\d{2}-\d{2}|last\s+\w+)/i);
      return { intent: 'day_recap', dateHint: dateMatch?.[0] || 'today', text: t };
    }

    // Search / ask about browsing
    if (/^(what (have i|did i) (read|look|research)|what do i know) about (.+)/i.test(t)
     || /^(que sais-je|que he leído|was habe ich gelesen) .+/i.test(t)) {
      const m = t.match(/about (.+)/i) || t.match(/sur (.+)/i) || t.match(/über (.+)/i);
      return { intent: 'search', query: m?.[1] || t, text: t };
    }

    // Research plan
    if (/^(research|research plan|help me research|how (do i|should i) research|make a research plan|aide.moi à rechercher|ayúdame a investigar)/i.test(t)) {
      const topicMatch = t.match(/(?:research|plan|investigate|about|on|sur|sobre|über|su) (.+)/i);
      return { intent: 'research_plan', topic: topicMatch?.[1] || t, text: t };
    }

    // Find/search
    if (/^(search|find|look up|look for|cherche|busca|suche|cerca) (.+)/i.test(t)) {
      const m = t.match(/(?:search|find|look up|look for|cherche|busca|suche|cerca) (.+)/i);
      return { intent: 'search', query: m?.[1] || t, text: t };
    }

    // Knowledge gaps
    if (/^(what.*(missing|gap|haven.?t|blind spot)|manque.il|que me falta|was fehlt|cosa mi manca|пробел)/i.test(t))
      return { intent: 'gaps', text: t };

    // Shield
    if (/^(scan|check|analyze|is this|trust|vérif|comprueba|prüf|controlla|проверь).*(page|site|article|manipulation)?/i.test(t))
      return { intent: 'shield', text: t };

    // Decision
    if (/^(decision|am i ready|ready to decide|should i (buy|choose|pick)|prêt à décider|listo para decidir|bereit zu entscheiden)/i.test(t)) {
      const m = t.match(/(?:on|about|for|sur|para|für|per|о) (.+)/i);
      return { intent: 'decision', topic: m?.[1] || '', text: t };
    }

    // Save
    if (/^(save|capture|remember|garde|guardar|speichere|salva|сохрани) (this|it|la page|esto)/i.test(t))
      return { intent: 'save', text: t };

    // Navigate
    if (/^(open|go to|show|switch|ouvre|abre|öffne|apri|открой) (brain|oracle|shield|decision|graph|history|research)/i.test(t)) {
      const m = t.match(/(brain|oracle|shield|decision|graph|history|research)/i);
      return { intent: 'navigate', tab: m?.[1]?.toLowerCase(), text: t };
    }

    // Clear
    if (/^(clear|reset|wipe|efface|borrar|löschen|cancella|очисти).*(memory|session|tout|todo|alles|tutto|всё)/i.test(t))
      return { intent: 'clear', text: t };

    // Fallback: general question
    return { intent: 'ask', query: t, text: t };
  }

  getAvailableVoices() { return this.voices.filter(v => v.lang.startsWith('en')); }

  setVoiceByIndex(i) {
    const en = this.getAvailableVoices();
    if (en[i]) this.preferredVoice = en[i];
  }

  destroy() {
    this.stopListening();
    this.stopSpeaking();
    this.synth.onvoiceschanged = null;
  }
}
