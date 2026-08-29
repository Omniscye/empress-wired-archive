const TRACKS = {
  music: 'assets/audio/city-theme.mp3',
  rain: 'assets/audio/rain-loop.mp3',
};

const RAIN_MIX = 0.34;
const MUSIC_MIX = 1.0;

export class CityAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.enabled = false;
    this.ready = false;
    this.loading = null;
    this.volume = 0.85;
    this.rainLevel = 0.7;
    this.buffers = {};
    this.voices = {};
    this.failed = false;
  }

  async fetchBuffer(ctx, url) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`${url} → ${response.status}`);
    const data = await response.arrayBuffer();
    return await ctx.decodeAudioData(data);
  }

  createVoice(name, buffer, mix) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 20000;
    tone.Q.value = 0.0001;
    tone.connect(gain);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(tone);
    source.start(0);

    this.voices[name] = { source, gain, tone, mix };
  }

  async start() {
    if (this.failed) return;
    if (this.started) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    if (this.loading) {
      await this.loading;
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }

    this.loading = (async () => {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio unavailable');
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 8;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.008;
      limiter.release.value = 0.25;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      this.master = master;

      const [music, rain] = await Promise.all([
        this.fetchBuffer(ctx, TRACKS.music),
        this.fetchBuffer(ctx, TRACKS.rain),
      ]);

      if (ctx.state === 'suspended') await ctx.resume();

      this.createVoice('music', music, MUSIC_MIX);
      this.createVoice('rain', rain, RAIN_MIX);

      this.started = true;
      this.ready = true;
    })();

    try {
      await this.loading;
    } catch (err) {
      this.failed = true;
      this.loading = null;
      throw err;
    }
  }

  applyLevels(timeConstant = 0.7) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const target = this.enabled ? this.volume : 0;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(target, now, timeConstant);

    const music = this.voices.music;
    if (music) music.gain.gain.setTargetAtTime(music.mix, now, timeConstant);

    const rain = this.voices.rain;
    if (rain) {
      const level = rain.mix * (0.45 + 0.55 * this.rainLevel);
      rain.gain.gain.setTargetAtTime(level, now, timeConstant);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.applyLevels(enabled ? 1.4 : 0.5);
  }

  setVolume(volume) {
    this.volume = volume;
    if (!this.ready || !this.enabled) return;
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.2);
  }

  setRain(level) {
    this.rainLevel = Math.max(0, Math.min(1, level));
    if (!this.ready) return;
    const rain = this.voices.rain;
    if (!rain) return;
    const now = this.ctx.currentTime;
    rain.gain.gain.setTargetAtTime(rain.mix * (0.45 + 0.55 * this.rainLevel), now, 1.2);
  }

  setAltitude(altitude) {
    if (!this.ready) return;
    const rain = this.voices.rain;
    if (!rain) return;
    const openness = Math.max(0, Math.min(1, altitude / 260));
    const cutoff = 20000 - openness * 17600;
    rain.tone.frequency.setTargetAtTime(Math.max(700, cutoff), this.ctx.currentTime, 1.5);
  }

  setIntensity(value) {
    void value;
  }

  dispose() {
    if (this.ctx) this.ctx.close();
    this.started = false;
    this.ready = false;
  }
}
