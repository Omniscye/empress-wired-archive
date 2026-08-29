import { ANALYSIS, BEAT_STRENGTH, IMPACTS, ENVELOPE, AUDIO_FILE } from './analysis.js';
import { clamp, lerp } from '../core/math.js';

const CH = ANALYSIS.envelopeChannels.length;
const EFPS = ANALYSIS.envelopeFps;
const FRAMES = ANALYSIS.envelopeFrames;

const CH_LEVEL = 0;
const CH_BASS = 1;
const CH_LOWMID = 2;
const CH_MID = 3;
const CH_HIGH = 4;
const CH_FLUX = 5;

export class MusicState {
  constructor() {
    this.time = 0;
    this.level = 0;
    this.bass = 0;
    this.lowmid = 0;
    this.mid = 0;
    this.high = 0;
    this.flux = 0;

    this.energy = 0;

    this.beat = 0;
    this.beatPhase = 0;
    this.beatStrength = 0;
    this.bar = 0;
    this.barPhase = 0;
    this.beatInBar = 0;

    this.beatPulse = 0;
    this.barPulse = 0;
    this.impact = 0;
    this.impactTime = -99;

    this.playing = 0;
  }
}

function envelopeAt(channel, t) {
  const f = t * EFPS;
  if (f <= 0) return ENVELOPE[channel] / 255;
  if (f >= FRAMES - 1) return ENVELOPE[(FRAMES - 1) * CH + channel] / 255;
  const i = Math.floor(f);
  const frac = f - i;
  const a = ENVELOPE[i * CH + channel];
  const b = ENVELOPE[(i + 1) * CH + channel];
  return (a + (b - a) * frac) / 255;
}

function envelopePeak(channel, t, window) {
  const start = Math.max(0, Math.floor((t - window) * EFPS));
  const end = Math.min(FRAMES - 1, Math.ceil(t * EFPS));
  let peak = 0;
  for (let i = start; i <= end; i++) {
    const v = ENVELOPE[i * CH + channel];
    if (v > peak) peak = v;
  }
  return peak / 255;
}

export class AudioSync {
  constructor() {
    this.analysis = ANALYSIS;
    this.duration = ANALYSIS.duration;
    this.buffer = null;
    this.ctx = null;
    this.master = null;
    this.source = null;
    this.analyser = null;
    this.captureDestination = null;
    this.startedAt = 0;
    this.startOffset = 0;
    this.playing = false;
    this.volume = 0.9;
    this.loadPromise = null;
    this.loaded = false;
    this.failed = false;
    this.state = new MusicState();
    this.liveBins = null;
    this.live = { level: 0, bass: 0, high: 0 };

    this.beats = new Float32Array(ANALYSIS.beatCount);
    for (let i = 0; i < ANALYSIS.beatCount; i++) {
      this.beats[i] = ANALYSIS.firstBeat + i * ANALYSIS.beatPeriod;
    }
    this.bars = new Float32Array(ANALYSIS.barCount);
    for (let i = 0; i < ANALYSIS.barCount; i++) {
      this.bars[i] = ANALYSIS.firstDownbeat + i * ANALYSIS.barPeriod;
    }
    this.impactCount = IMPACTS.length / 2;
  }

  beatAt(t) {
    return Math.floor((t - ANALYSIS.firstBeat) / ANALYSIS.beatPeriod);
  }

  barAt(t) {
    return Math.floor((t - ANALYSIS.firstDownbeat) / ANALYSIS.barPeriod);
  }

  beatTime(index) {
    return ANALYSIS.firstBeat + index * ANALYSIS.beatPeriod;
  }

  barTime(index) {
    return ANALYSIS.firstDownbeat + index * ANALYSIS.barPeriod;
  }

  snapToBar(t) {
    const n = Math.round((t - ANALYSIS.firstDownbeat) / ANALYSIS.barPeriod);
    return ANALYSIS.firstDownbeat + n * ANALYSIS.barPeriod;
  }

  snapToBeat(t) {
    const n = Math.round((t - ANALYSIS.firstBeat) / ANALYSIS.beatPeriod);
    return ANALYSIS.firstBeat + n * ANALYSIS.beatPeriod;
  }

  beatStrengthAt(index) {
    if (index < 0 || index >= BEAT_STRENGTH.length) return 0;
    return BEAT_STRENGTH[index] / 255;
  }

  impactIn(from, to) {
    let best = null;
    for (let i = 0; i < this.impactCount; i++) {
      const t = IMPACTS[i * 2];
      if (t < from) continue;
      if (t > to) break;
      const s = IMPACTS[i * 2 + 1];
      if (!best || s > best.strength) best = { time: t, strength: s };
    }
    return best;
  }

  impactsIn(from, to, minStrength = 0) {
    const out = [];
    for (let i = 0; i < this.impactCount; i++) {
      const t = IMPACTS[i * 2];
      if (t < from) continue;
      if (t > to) break;
      const s = IMPACTS[i * 2 + 1];
      if (s >= minStrength) out.push({ time: t, strength: s });
    }
    return out;
  }

  lastImpact(t) {
    let lo = 0;
    let hi = this.impactCount - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (IMPACTS[mid * 2] <= t) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (found < 0) return null;
    return { time: IMPACTS[found * 2], strength: IMPACTS[found * 2 + 1] };
  }

  sample(t, out) {
    const s = out || this.state;
    s.time = t;
    s.level = envelopeAt(CH_LEVEL, t);
    s.bass = envelopeAt(CH_BASS, t);
    s.lowmid = envelopeAt(CH_LOWMID, t);
    s.mid = envelopeAt(CH_MID, t);
    s.high = envelopeAt(CH_HIGH, t);
    s.flux = envelopeAt(CH_FLUX, t);

    const win = 1.2;
    let sum = 0;
    let n = 0;
    const start = Math.max(0, Math.floor((t - win) * EFPS));
    const end = Math.min(FRAMES - 1, Math.floor(t * EFPS));
    for (let i = start; i <= end; i++) {
      sum += ENVELOPE[i * CH + CH_LEVEL];
      n++;
    }
    s.energy = n > 0 ? sum / n / 255 : 0;

    const beatF = (t - ANALYSIS.firstBeat) / ANALYSIS.beatPeriod;
    s.beat = Math.floor(beatF);
    s.beatPhase = beatF - s.beat;
    s.beatStrength = this.beatStrengthAt(s.beat);
    s.beatInBar = ((s.beat % 4) + 4) % 4;

    const barF = (t - ANALYSIS.firstDownbeat) / ANALYSIS.barPeriod;
    s.bar = Math.floor(barF);
    s.barPhase = barF - s.bar;

    s.beatPulse = Math.exp(-s.beatPhase * 7.0) * (0.25 + 0.75 * s.beatStrength);
    s.barPulse = Math.exp(-s.barPhase * 3.4);

    const last = this.lastImpact(t);
    if (last) {
      const age = t - last.time;
      s.impactTime = last.time;
      s.impact = age >= 0 ? last.strength * Math.exp(-age * 6.5) : 0;
    } else {
      s.impact = 0;
      s.impactTime = -99;
    }

    s.playing = t >= 0 && t <= this.duration ? 1 : 0;
    return s;
  }

  punch(t) {
    return envelopePeak(CH_FLUX, t, 0.14);
  }

  async load(onProgress) {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio is not available in this browser.');
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.volume;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 6;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.006;
      limiter.release.value = 0.22;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      this.master = master;
      this.limiter = limiter;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.62;
      master.connect(analyser);
      this.analyser = analyser;
      this.liveBins = new Uint8Array(analyser.frequencyBinCount);

      const response = await fetch(AUDIO_FILE, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`${AUDIO_FILE} responded ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (onProgress) onProgress(0.6);
      this.buffer = await ctx.decodeAudioData(bytes);
      this.loaded = true;
      if (onProgress) onProgress(1);
    })();
    try {
      await this.loadPromise;
    } catch (err) {
      this.failed = true;
      this.loadPromise = null;
      throw err;
    }
    return this.loadPromise;
  }

  captureStream() {
    if (!this.ctx) return null;
    if (!this.captureDestination) {
      this.captureDestination = this.ctx.createMediaStreamDestination();
      this.master.connect(this.captureDestination);
    }
    return this.captureDestination.stream;
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
  }

  play(offset = 0) {
    if (!this.loaded || !this.ctx) return;
    this.stopSource();
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.master);
    const clamped = clamp(offset, 0, Math.max(0, this.buffer.duration - 0.02));
    source.start(0, clamped);
    this.source = source;
    this.startedAt = this.ctx.currentTime;
    this.startOffset = clamped;
    this.playing = true;
  }

  stopSource() {
    if (this.source) {
      try { this.source.stop(); } catch (err) { void err; }
      this.source.disconnect();
      this.source = null;
    }
  }

  pause() {
    if (!this.playing) return;
    this.startOffset = this.currentTime();
    this.stopSource();
    this.playing = false;
  }

  stop() {
    this.stopSource();
    this.playing = false;
    this.startOffset = 0;
  }

  seek(t) {
    const wasPlaying = this.playing;
    this.startOffset = clamp(t, 0, this.duration);
    if (wasPlaying) this.play(this.startOffset);
  }

  currentTime() {
    if (!this.ctx) return this.startOffset;
    if (!this.playing) return this.startOffset;
    return this.startOffset + (this.ctx.currentTime - this.startedAt);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  sampleLive() {
    if (!this.analyser || !this.playing) {
      this.live.level = 0;
      this.live.bass = 0;
      this.live.high = 0;
      return this.live;
    }
    this.analyser.getByteFrequencyData(this.liveBins);
    const bins = this.liveBins;
    const n = bins.length;
    let low = 0;
    let high = 0;
    let all = 0;
    const lowEnd = Math.max(1, Math.floor(n * 0.06));
    const highStart = Math.floor(n * 0.34);
    for (let i = 0; i < n; i++) {
      const v = bins[i];
      all += v;
      if (i < lowEnd) low += v;
      else if (i >= highStart) high += v;
    }
    this.live.level = all / n / 255;
    this.live.bass = low / lowEnd / 255;
    this.live.high = high / Math.max(1, n - highStart) / 255;
    return this.live;
  }

  dispose() {
    this.stopSource();
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.loaded = false;
  }
}

export { lerp };
