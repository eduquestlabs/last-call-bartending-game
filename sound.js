// ============================================================================
// Synthesized sound effects via the Web Audio API — no audio files needed.
// All sounds are generated on the fly. Call Sound.init() from a user gesture.
// ============================================================================

export const Sound = {
  ctx: null,
  master: null,
  enabled: true,
  _activeLoops: [],

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.6 : 0, this.ctx.currentTime, 0.02);
    }
    return this.enabled;
  },

  _ok() {
    return this.ctx && this.enabled;
  },

  // ---- low-level helpers ----
  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  },

  _tone(freq, dur, { type = "sine", gain = 0.3, attack = 0.005, when = 0, slideTo = null } = {}) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  _noise(dur, { filter = "bandpass", freq = 1200, q = 1, gain = 0.3, when = 0, sweepTo = null } = {}) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  },

  // ---- UI ----
  click() {
    this._tone(520, 0.06, { type: "triangle", gain: 0.16 });
  },
  select() {
    this._tone(660, 0.08, { type: "triangle", gain: 0.18, slideTo: 880 });
  },

  // ---- pour: trickling liquid with a little gurgle ----
  pour() {
    this._noise(0.55, { filter: "bandpass", freq: 1600, q: 0.8, gain: 0.16, sweepTo: 700 });
    // a few bubbles
    for (let i = 0; i < 4; i++) {
      this._tone(300 + Math.random() * 500, 0.05, { type: "sine", gain: 0.05, when: 0.08 + i * 0.1 });
    }
  },

  // ---- methods ----
  shake() {
    // rapid metallic rattles with ice
    const bursts = 9;
    for (let i = 0; i < bursts; i++) {
      this._noise(0.07, { filter: "highpass", freq: 3500, gain: 0.22, when: i * 0.11 });
      this._tone(180, 0.05, { type: "square", gain: 0.04, when: i * 0.11 });
    }
  },
  stir() {
    for (let i = 0; i < 6; i++) {
      this._noise(0.12, { filter: "bandpass", freq: 2600, q: 2, gain: 0.07, when: i * 0.16 });
    }
  },
  muddle() {
    for (let i = 0; i < 4; i++) {
      this._tone(120, 0.12, { type: "triangle", gain: 0.22, when: i * 0.26, slideTo: 70 });
      this._noise(0.08, { filter: "lowpass", freq: 500, gain: 0.1, when: i * 0.26 });
    }
  },
  blend() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    lfo.frequency.value = 22;
    lfoGain.gain.value = 30;
    lfo.connect(lfoGain).connect(osc.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.08);
    g.gain.setValueAtTime(0.14, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 1.25);
    lfo.stop(t + 1.25);
  },
  build() {
    this.pour();
  },

  garnish() {
    // soft "plop"
    this._tone(420, 0.12, { type: "sine", gain: 0.2, slideTo: 160 });
  },

  // ---- results ----
  success(stars = 3) {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    const n = Math.max(2, stars + 1);
    for (let i = 0; i < n; i++) {
      this._tone(notes[i] || notes[notes.length - 1], 0.3, { type: "triangle", gain: 0.22, when: i * 0.1 });
    }
  },
  fail() {
    this._tone(330, 0.3, { type: "sawtooth", gain: 0.16, slideTo: 160 });
    this._tone(247, 0.4, { type: "sawtooth", gain: 0.14, slideTo: 120, when: 0.12 });
  },
  coin() {
    this._tone(880, 0.08, { type: "square", gain: 0.12 });
    this._tone(1318.5, 0.12, { type: "square", gain: 0.12, when: 0.07 });
  },

  // a single celebratory "ding" — pitch rises with each star index (0,1,2)
  starDing(index = 0) {
    const base = [659.25, 880, 1174.66][index] || 1318.5; // E5, A5, D6
    this._tone(base, 0.5, { type: "triangle", gain: 0.26 });
    this._tone(base * 2, 0.4, { type: "sine", gain: 0.08 });
  },

  // ---- Ambient bar room tone (looped) ----
  ambientEnabled: false,
  _ambient: null,
  _clinkTimer: null,

  startAmbient() {
    if (!this.ctx || this._ambient) return;
    // low room murmur: looping brown-ish noise through a lowpass
    const seconds = 3;
    const buf = this._noiseBuffer(seconds);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * data[i]) / 1.02; // brown noise
      data[i] = last * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(this.enabled ? 0.12 : 0, this.ctx.currentTime, 0.5);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this._ambient = { src, g };
    // occasional distant clinks / pours
    const scheduleClink = () => {
      if (!this._ambient) return;
      if (this.enabled) {
        const f1 = 1400 + Math.random() * 1600;
        this._tone(f1, 0.18, { type: "sine", gain: 0.03 });
      }
      this._clinkTimer = setTimeout(scheduleClink, 4000 + Math.random() * 6000);
    };
    this._clinkTimer = setTimeout(scheduleClink, 3000);
  },

  stopAmbient() {
    if (this._ambient) {
      const { src, g } = this._ambient;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      setTimeout(() => {
        try { src.stop(); } catch (e) { /* already stopped */ }
      }, 600);
      this._ambient = null;
    }
    if (this._clinkTimer) {
      clearTimeout(this._clinkTimer);
      this._clinkTimer = null;
    }
  },

  toggleAmbient() {
    this.ambientEnabled = !this.ambientEnabled;
    if (this.ambientEnabled) this.startAmbient();
    else this.stopAmbient();
    return this.ambientEnabled;
  },
};
