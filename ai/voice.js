export class VoiceEngine {
  constructor({ onTranscript, onStateChange, onError } = {}) {
    this.onTranscript   = onTranscript  || (() => {});
    this.onStateChange  = onStateChange || (() => {});
    this.onError        = onError       || (() => {});

    this.recognition   = null;
    this.synth         = window.speechSynthesis;
    this.voices        = [];
    this.preferredVoice = null;
    this.state         = 'idle';   // idle | listening | thinking | speaking
    this.continuous    = false;
    this.interimText   = '';
    this._speaking     = false;
    this._aborted      = false;

    this._initRecognition();
    this._loadVoices();
  }

  // ── Speech Recognition ────────────────────────────────
  _initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.onError('Speech recognition not supported in this browser.'); return; }

    this.recognition = new SR();
    this.recognition.lang        = 'en-US';
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.continuous  = false; // we restart manually for better control

    this.recognition.onstart = () => {
      this._setState('listening');
    };

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
        this._setState('thinking');
        this.onTranscript(final.trim());
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

  _setState(s) {
    this.state = s;
    this.onStateChange(s);
  }

  _restartListening() {
    try { this.recognition?.start(); } catch {}
  }

  startListening() {
    if (!this.recognition) return;
    this._aborted = false;
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

  setContinuous(val) {
    this.continuous = val;
  }

  // ── Text-to-Speech ────────────────────────────────────
  _loadVoices() {
    const set = () => {
      this.voices = this.synth.getVoices();
      this.preferredVoice = this._pickVoice();
    };
    set();
    this.synth.onvoiceschanged = set;
  }

  _pickVoice() {
    const preferred = [
      'Google UK English Female',
      'Google US English',
      'Microsoft Aria Online (Natural)',
      'Microsoft Jenny Online (Natural)',
      'Samantha',
      'Karen',
    ];
    for (const name of preferred) {
      const v = this.voices.find(v => v.name === name);
      if (v) return v;
    }
    return this.voices.find(v => v.lang.startsWith('en')) || this.voices[0] || null;
  }

  speak(text, { onEnd } = {}) {
    if (!text || this._speaking) { onEnd?.(); return; }
    this.synth.cancel();
    this._setState('speaking');
    this._speaking = true;

    // Split long responses into chunks for smoother TTS
    const chunks = this._chunkText(text, 200);
    let i = 0;

    const sayNext = () => {
      if (i >= chunks.length) {
        this._speaking = false;
        this._setState('idle');
        onEnd?.();
        if (this.continuous) this.resumeListening();
        return;
      }
      const utt = new SpeechSynthesisUtterance(chunks[i++]);
      utt.voice  = this.preferredVoice;
      utt.rate   = 1.05;
      utt.pitch  = 1.0;
      utt.volume = 1.0;
      utt.onend  = sayNext;
      utt.onerror = () => { this._speaking = false; this._setState('idle'); onEnd?.(); };
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
    // Split on sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
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

  // ── Command Detection ─────────────────────────────────
  parseIntent(text) {
    const t = text.toLowerCase().replace(/^(hey\s+)?meridian[\s,!]+/i, '').trim();

    if (/^(summarize|summary|sum up|recap).*(session|today|browsing|research)?/i.test(t))
      return { intent: 'summarize', text: t };

    if (/^(what (have i|did i) (read|look|research)|what do i know) about (.+)/i.test(t)) {
      const m = t.match(/about (.+)/i);
      return { intent: 'search', query: m?.[1] || t, text: t };
    }

    if (/^(search|find|look up|look for) (.+)/i.test(t)) {
      const m = t.match(/(?:search|find|look up|look for) (.+)/i);
      return { intent: 'search', query: m?.[1] || t, text: t };
    }

    if (/^(what (am i|are the) (missing|gaps)|knowledge gaps?|blind spots?|what haven.?t i)/i.test(t))
      return { intent: 'gaps', text: t };

    if (/^(scan|check|analyze|is this|trust).*(page|site|article|manipulation|legit|safe)?/i.test(t))
      return { intent: 'shield', text: t };

    if (/^(contradiction|contradict|conflict|does this conflict)/i.test(t))
      return { intent: 'contradictions', text: t };

    if (/^(decision|am i ready|ready to decide|should i (buy|choose|pick|go with)) ?(.+)?/i.test(t)) {
      const m = t.match(/(?:decide on|deciding|decision about|buy|choose|pick|go with) (.+)/i);
      return { intent: 'decision', topic: m?.[1] || '', text: t };
    }

    if (/^(save|capture|remember) (this page|this|it)/i.test(t))
      return { intent: 'save', text: t };

    if (/^(open|go to|show me|switch to) (brain|oracle|shield|decision|graph|session|memory|voice)/i.test(t)) {
      const m = t.match(/(brain|oracle|shield|decision|graph|session|memory)/i);
      return { intent: 'navigate', tab: m?.[1]?.toLowerCase(), text: t };
    }

    if (/^(clear|reset|wipe).*(memory|session)/i.test(t))
      return { intent: 'clear', text: t };

    // Fallback: treat as a free question for the Session Brain
    return { intent: 'ask', query: t, text: t };
  }

  getAvailableVoices() {
    return this.voices.filter(v => v.lang.startsWith('en'));
  }

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
