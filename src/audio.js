// Звук: все эффекты и музыка синтезируются через Web Audio, без файлов.

const NOTE = (n) => 55 * Math.pow(2, n / 12); // n полутонов от A1

// Два собственных риффа (16 шагов; число — полутон от E, null — пауза).
const SONGS = [
  {
    bpm: 148,
    bass: [0, null, 0, 3, null, 0, 5, null, 0, null, 6, 5, 3, null, 0, 0, 0, null, 0, 3, null, 0, 8, null, 7, null, 5, 3, 0, null, 10, 11],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  },
  {
    bpm: 112,
    bass: [0, null, null, 0, 1, null, 0, null, null, 0, 6, null, 5, null, 1, null, 0, null, null, 0, 1, null, 0, null, 8, null, 7, null, 6, 5, 1, 3],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  },
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.musicOn = true;
    this.song = null;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
  }

  /** Вызывается по жесту пользователя (клик/клавиша). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.24 : 0;
      this.musicBus.connect(this.master);
      // шум для выстрелов и взрывов
      const len = ctx.sampleRate * 1.5;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // искажение для «гитары»
      this.shaper = ctx.createWaveShaper();
      const curve = new Float32Array(512);
      for (let i = 0; i < 512; i++) { const x = (i / 255.5) - 1; curve[i] = Math.tanh(x * 5); }
      this.shaper.curve = curve;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1700;
      this.shaper.connect(lp).connect(this.musicBus);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicBus) this.musicBus.gain.value = this.musicOn ? 0.24 : 0;
    return this.musicOn;
  }

  // ---------- примитивы ----------

  _out(vol, pan) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  }

  _noise(out, t, dur, f0, f1, vol, type = 'lowpass', q = 0.8) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.4, dur + 0.05);
  }

  _tone(out, t, dur, f0, f1, vol, type = 'sine', attack = 0.004) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Проиграть эффект. vol 0..1, pan -1..1. */
  play(name, vol = 1, pan = 0) {
    if (!this.ctx || this.ctx.state !== 'running' || vol <= 0.01) return;
    const t = this.ctx.currentTime + 0.005;
    const o = this._out(vol, pan);
    const N = (...a) => this._noise(o, ...a);
    const T = (...a) => this._tone(o, ...a);
    switch (name) {
      case 'pistol':
        N(t, 0.16, 4200, 500, 0.9); T(t, 0.12, 190, 50, 0.7); break;
      case 'shotgun':
        N(t, 0.38, 3600, 220, 1.1); T(t, 0.22, 130, 36, 0.9);
        N(t + 0.38, 0.05, 2400, 1400, 0.3, 'bandpass', 3); N(t + 0.55, 0.06, 1800, 900, 0.35, 'bandpass', 3); break;
      case 'chaingun':
        N(t, 0.1, 3800, 700, 0.8); T(t, 0.08, 220, 70, 0.6); break;
      case 'launcher':
        N(t, 0.5, 300, 2600, 0.7, 'bandpass', 1.2); T(t, 0.3, 90, 40, 0.6); break;
      case 'explosion':
        N(t, 0.9, 1400, 50, 1.3); T(t, 0.7, 95, 22, 1.1); N(t + 0.05, 0.4, 5000, 400, 0.4); break;
      case 'punch':
        N(t, 0.1, 700, 120, 0.9); T(t, 0.1, 120, 50, 0.7); break;
      case 'swing':
        N(t, 0.14, 900, 2200, 0.25, 'bandpass', 2); break;
      case 'empty':
        N(t, 0.03, 3000, 2000, 0.3, 'bandpass', 4); break;
      case 'fireball':
        N(t, 0.35, 500, 1800, 0.5, 'bandpass', 1.5); T(t, 0.3, 240, 110, 0.25, 'sawtooth'); break;
      case 'plasma':
        T(t, 0.3, 700, 160, 0.3, 'square'); N(t, 0.25, 2500, 600, 0.3, 'bandpass', 2); break;
      case 'sight_zombie':
        T(t, 0.45, 150, 85, 0.5, 'sawtooth', 0.03); T(t, 0.45, 156, 80, 0.3, 'square', 0.03); break;
      case 'sight_imp':
        T(t, 0.4, 320, 150, 0.4, 'sawtooth', 0.02); N(t, 0.4, 1200, 500, 0.25, 'bandpass', 3); break;
      case 'sight_demon':
        T(t, 0.6, 95, 48, 0.7, 'sawtooth', 0.04); N(t, 0.6, 400, 150, 0.4); break;
      case 'sight_baron':
        T(t, 1.1, 80, 34, 0.9, 'sawtooth', 0.06); T(t, 1.1, 121, 50, 0.5, 'square', 0.06); N(t, 1.0, 500, 100, 0.5); break;
      case 'pain_enemy':
        T(t, 0.18, 260, 150, 0.45, 'sawtooth'); break;
      case 'death_enemy':
        T(t, 0.6, 190, 40, 0.55, 'sawtooth'); N(t + 0.1, 0.45, 900, 150, 0.35); break;
      case 'death_demon':
        T(t, 0.8, 120, 28, 0.7, 'sawtooth'); N(t + 0.1, 0.6, 600, 100, 0.45); break;
      case 'pain_player':
        T(t, 0.2, 210, 120, 0.5, 'square'); N(t, 0.1, 800, 300, 0.3); break;
      case 'death_player':
        T(t, 1.2, 230, 45, 0.6, 'sawtooth', 0.02); T(t, 1.2, 180, 40, 0.4, 'square', 0.02); break;
      case 'item':
        T(t, 0.08, 620, 640, 0.3, 'square'); T(t + 0.07, 0.12, 930, 950, 0.3, 'square'); break;
      case 'weapon':
        N(t, 0.06, 2200, 1200, 0.5, 'bandpass', 3); N(t + 0.13, 0.08, 1600, 800, 0.6, 'bandpass', 3); T(t + 0.13, 0.1, 160, 90, 0.4); break;
      case 'key':
        T(t, 0.1, 660, 665, 0.3, 'triangle'); T(t + 0.1, 0.1, 880, 885, 0.3, 'triangle'); T(t + 0.2, 0.22, 1320, 1325, 0.3, 'triangle'); break;
      case 'power':
        T(t, 0.5, 220, 880, 0.35, 'triangle', 0.05); T(t + 0.1, 0.5, 330, 1320, 0.25, 'sine', 0.05); break;
      case 'door':
        N(t, 0.75, 260, 130, 0.7); T(t, 0.75, 62, 48, 0.45, 'sawtooth', 0.05); break;
      case 'locked':
        T(t, 0.09, 130, 120, 0.4, 'square'); T(t + 0.13, 0.12, 100, 90, 0.4, 'square'); break;
      case 'land':
        N(t, 0.09, 300, 90, 0.5); break;
      case 'burn':
        N(t, 0.25, 3000, 800, 0.3, 'bandpass', 2); break;
      case 'exit':
        for (const [i, n] of [0, 4, 7, 12].entries()) T(t + i * 0.09, 0.5, 330 * Math.pow(2, n / 12), 330 * Math.pow(2, n / 12), 0.25, 'triangle', 0.01);
        break;
      default:
    }
  }

  // ---------- музыка ----------

  startMusic(index) {
    this.stopMusic();
    if (!this.ctx) { this._pendingSong = index; return; }
    this.song = SONGS[index % SONGS.length];
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 60);
  }

  stopMusic() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.song = null;
  }

  resumePending() {
    if (this._pendingSong !== undefined && this.ctx) {
      const i = this._pendingSong;
      this._pendingSong = undefined;
      this.startMusic(i);
    }
  }

  _schedule() {
    const ctx = this.ctx, song = this.song;
    if (!ctx || !song || ctx.state !== 'running') return;
    const stepDur = 60 / song.bpm / 4;
    if (this._nextTime < ctx.currentTime - 0.3) this._nextTime = ctx.currentTime + 0.05; // вкладка спала
    while (this._nextTime < ctx.currentTime + 0.2) {
      const t = this._nextTime, s = this._step;
      const note = song.bass[s % song.bass.length];
      if (note !== null) {
        const freq = NOTE(7 + note); // E2 и выше
        for (const [mult, type, vol] of [[1, 'sawtooth', 0.5], [2.005, 'square', 0.22]]) {
          const o = ctx.createOscillator();
          o.type = type; o.frequency.value = freq * mult;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vol, t + 0.006);
          g.gain.exponentialRampToValueAtTime(0.01, t + stepDur * 0.95);
          o.connect(g).connect(this.shaper);
          o.start(t); o.stop(t + stepDur);
        }
      }
      const k = s % 16;
      if (song.kick[k]) { this._tone(this.musicBus, t, 0.14, 150, 42, 2.2); }
      if (song.snare[k]) { this._noise(this.musicBus, t, 0.13, 3200, 900, 1.3, 'bandpass', 0.9); this._tone(this.musicBus, t, 0.08, 220, 150, 0.7); }
      if (k % 2 === 0) this._noise(this.musicBus, t, 0.03, 9000, 7000, 0.35, 'highpass', 0.7);
      this._nextTime += stepDur;
      this._step++;
    }
  }
}
