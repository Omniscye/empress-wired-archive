import { Renderer } from './renderer.js';
import { Settings } from './settings.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { clamp } from './core/math.js';

import { Director } from './cinematic/director.js';
import { CinematicUI } from './cinematic/ui.js';
import { CinematicExporter } from './cinematic/export.js';
import { autoDetectQuality, resolveQuality } from './cinematic/quality.js';
import { AUDIO_FILE, ANALYSIS } from './cinematic/analysis.js';

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.settings = new Settings();
    this.input = new Input(this.canvas);
    this.lastFrame = 0;
    this.frameTimes = new Float32Array(60);
    this.frameIndex = 0;
    this.smoothedFrameMs = 16.7;
    this.running = false;
    this.statsTimer = 0;
    this.pendingScreenshot = false;

    this.director = null;
    this.cineUI = null;
    this.exporter = null;
    this.introTime = 0;
    this.introPlaying = false;
    this.introReady = false;
    this.wasScrubbing = false;
    this.audioAvailable = false;
    this.fixedWidth = 0;
    this.fixedHeight = 0;
    this.audioFile = AUDIO_FILE;
    this.cinematicQuality = autoDetectQuality();
  }

  async boot() {
    try {
      this.renderer = new Renderer(this.canvas, this.settings);
    } catch (err) {
      this.showFatal(err);
      return;
    }

    this.ui = new UI(this.settings, {
      onSetting: () => this.resize(),
      onPreset: () => this.resize(),
      onStart: () => this.start(),
      onStartIntro: () => this.start(),
      onScreenshot: () => { this.pendingScreenshot = true; },
      onTeleport: () => {},
    });
    this.ui.setChromeVisible(false);

    this.renderer.onRestored = () => {
      if (this.director) this.director.renderer.build();
      this.ui.showToast('Graphics context restored');
    };

    this.bindEvents();
    this.resize();

    this.ui.setLoaderProgress(0.04, 'Compiling shaders');
    await yieldToPaint();
    this.renderer.gl.finish();

    try {
      await this.prepare();
    } catch (err) {
      this.showFatal(err);
      return;
    }

    this.ui.setLoaderProgress(1, 'Ready');
    this.ui.showStart();

    if (location.hash === '#intro' || location.hash === '#cinematic' || location.hash === '#play') {
      this.start();
    }
  }

  async prepare() {
    this.ui.setLoaderProgress(0.12, 'Building the cinematic');
    await yieldToPaint();

    this.director = new Director(this.renderer, this.settings, { quality: this.cinematicQuality });
    this.director.onSequence = (seq) => {
      if (this.cineUI) this.cineUI.update(this.introState(seq));
    };

    this.ui.setLoaderProgress(0.45, 'Compiling cinematic shaders');
    await yieldToPaint();
    this.renderer.gl.finish();

    this.exporter = new CinematicExporter({
      canvas: this.canvas,
      director: this.director,
      audioFile: this.audioFile,
      setFixedResolution: (w, h) => this.setFixedResolution(w, h),
      clearFixedResolution: () => this.clearFixedResolution(),
    });
    this.exporter.onProgress = (message, value) => {
      if (this.cineUI) this.cineUI.setExportProgress(message, value);
    };
    this.exporter.onError = (err) => {
      if (this.cineUI) this.cineUI.setExportProgress(`Render failed: ${err.message}`, 0);
    };

    this.cineUI = new CinematicUI({
      onPlayToggle: () => this.toggleIntroPlayback(),
      onSkip: (delta) => this.seekIntro(this.introTime + delta),
      onSeek: (t) => this.seekIntro(t),
      onScrub: (f) => this.seekIntro(f * this.director.duration),
      onScrubStart: () => { this.wasScrubbing = this.introPlaying; this.pauseIntro(); },
      onScrubEnd: () => { if (this.wasScrubbing) this.resumeIntro(); },
      onQuality: (name) => this.setCinematicQuality(name),
      onVolume: (v) => this.director.sync.setVolume(v),
      onExit: () => this.seekIntro(0),
      onRenderFilm: (opts) => this.runExport('film', opts),
      onCapture: (opts) => this.runExport('capture', opts),
      onGrabFrame: (opts) => this.runExport('still', opts),
      onCancelExport: () => this.exporter.cancel(),
    });
    this.cineUI.setTimeline(this.director.duration, this.director.sequenceList(), this.director.sync.bars);
    this.cineUI.setQuality(this.cinematicQuality);
    this.cineUI.setVolume(this.director.sync.volume);

    this.ui.setLoaderProgress(0.6, 'Loading the score');
    await yieldToPaint();
    try {
      await this.director.sync.load((p) => this.ui.setLoaderProgress(0.6 + p * 0.32, 'Loading the score'));
      this.audioAvailable = true;
    } catch (err) {
      this.audioAvailable = false;
      this.ui.showToast('Sound unavailable, running on the internal clock');
    }

    this.ui.setLoaderProgress(0.95, 'Priming the first frame');
    await yieldToPaint();
    this.director.renderAt(0, 1 / 60);
    this.renderer.gl.finish();
    this.introReady = true;
  }

  start() {
    if (!this.introReady) return;
    this.ui.hideLoader();
    this.cineUI.show();
    this.resize();
    this.director.seek(0);
    this.introTime = 0;
    if (this.audioAvailable) {
      this.director.sync.resume().then(() => this.director.play()).catch(() => {});
    }
    this.introPlaying = true;
    this.cineUI.setPlaying(true);
    this.beginLoop();
  }

  beginLoop() {
    if (this.running) return;
    this.running = true;
    const resume = () => {
      if (this.director) this.director.sync.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  toggleIntroPlayback() {
    if (this.introPlaying) this.pauseIntro();
    else this.resumeIntro();
  }

  pauseIntro() {
    this.introPlaying = false;
    if (this.director) this.director.pause();
    if (this.cineUI) this.cineUI.setPlaying(false);
  }

  resumeIntro() {
    if (!this.director) return;
    this.introPlaying = true;
    this.director.seek(this.introTime);
    if (this.audioAvailable) {
      this.director.sync.resume().catch(() => {});
      this.director.play();
    }
    if (this.cineUI) this.cineUI.setPlaying(true);
  }

  seekIntro(t) {
    if (!this.director) return;
    this.introTime = clamp(t, 0, this.director.duration);
    this.director.seek(this.introTime);
    if (this.introPlaying && this.audioAvailable) this.director.sync.play(this.introTime);
  }

  setCinematicQuality(name) {
    this.cinematicQuality = name;
    if (this.director) this.director.setQuality(name);
    const q = resolveQuality(name);
    this.settings.renderScale = q.renderScale;
    this.renderer.createTargets();
    this.resize();
    if (this.cineUI) this.cineUI.setQuality(name);
  }

  async runExport(kind, opts) {
    if (!this.exporter) return;
    const wasPlaying = this.introPlaying;
    this.pauseIntro();
    try {
      if (kind === 'film') {
        await this.exporter.renderFilm(opts);
      } else if (kind === 'capture') {
        await this.exporter.captureRealtime({ fps: 30, from: opts.from, to: opts.to });
        this.introTime = this.director.time;
      } else {
        await this.exporter.grabFrame({ preset: opts.preset, time: this.introTime });
      }
    } catch (err) {
      this.cineUI.setExportProgress(`Render failed: ${err.message}`, 0);
    }
    this.resize();
    if (wasPlaying && kind !== 'capture') this.resumeIntro();
  }

  introState(seq) {
    const music = this.director.music;
    const sequence = seq || (this.director.timeline.activeSequence || null);
    return {
      time: this.introTime,
      duration: this.director.duration,
      sequence,
      musicLine: `${ANALYSIS.bpm.toFixed(2)} BPM  ·  bar ${Math.max(0, music.bar + 1)}`
        + `  ·  beat ${music.beatInBar + 1}/4`,
    };
  }

  showFatal(err) {
    const message = err && err.message ? err.message : String(err);
    if (this.ui) this.ui.showError(message);
    else {
      const panel = document.getElementById('error');
      panel.style.display = 'flex';
      panel.querySelector('pre').textContent = message;
      document.getElementById('loader').style.display = 'none';
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    this.input.on('key', (code) => {
      if (!this.introReady) return;
      if (!this.running) {
        if (code === 'Space' || code === 'Enter') this.start();
        return;
      }
      switch (code) {
        case 'Space': this.toggleIntroPlayback(); break;
        case 'ArrowLeft': this.seekIntro(this.introTime - 5); break;
        case 'ArrowRight': this.seekIntro(this.introTime + 5); break;
        case 'ArrowDown': this.seekIntro(this.introTime - 20); break;
        case 'ArrowUp': this.seekIntro(this.introTime + 20); break;
        case 'KeyR': this.seekIntro(0); break;
        case 'KeyH': this.cineUI.toggleChrome(); break;
        case 'KeyE': this.cineUI.toggleExport(); break;
        case 'KeyF': this.toggleFullscreen(); break;
        case 'KeyP': this.pendingScreenshot = true; break;
        case 'KeyG':
          this.settings.set('showStats', !this.settings.showStats);
          this.cineUI.setStatsVisible(this.settings.showStats);
          break;
        case 'Escape': this.cineUI.toggleExport(false); break;
        default: {
          if (code.startsWith('Digit')) {
            const digit = '1234567890'.indexOf(code.slice(5));
            const list = this.director.sequences;
            if (digit >= 0 && list[digit]) this.seekIntro(list[digit].start + 0.01);
          }
          break;
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.lastFrame = performance.now();
    });
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  setFixedResolution(width, height) {
    this.fixedWidth = width | 0;
    this.fixedHeight = height | 0;
    this.resize();
  }

  clearFixedResolution() {
    this.fixedWidth = 0;
    this.fixedHeight = 0;
    this.resize();
  }

  resize() {
    if (this.fixedWidth > 0 && this.fixedHeight > 0) {
      const width = this.fixedWidth;
      const height = this.fixedHeight;
      this.canvas.style.width = `${window.innerWidth}px`;
      this.canvas.style.height = `${window.innerHeight}px`;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.renderer.resize(width, height);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    const scale = resolveQuality(this.cinematicQuality).renderScale
      * (this.settings.adaptiveResolution ? this.settings.dynamicScale : 1);
    const width = Math.max(320, Math.floor(cssWidth * dpr * scale));
    const height = Math.max(180, Math.floor(cssHeight * dpr * scale));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.renderer.resize(width, height);
  }

  updateAdaptiveResolution(dt) {
    const s = this.settings;
    if (!s.adaptiveResolution) return;
    if (this.fixedWidth > 0) return;
    const target = 1000 / 58;
    const ratio = this.smoothedFrameMs / target;
    let next = s.dynamicScale;
    if (ratio > 1.22) next = Math.max(0.5, s.dynamicScale - dt * 0.35);
    else if (ratio < 0.82) next = Math.min(1.0, s.dynamicScale + dt * 0.12);
    if (Math.abs(next - s.dynamicScale) > 0.004) {
      s.dynamicScale = next;
      this.resize();
    }
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.loop(t));
    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.stepFrame(rawDt);
  }

  stepFrame(rawDt) {
    const dt = clamp(rawDt, 0.0005, 0.1);

    this.frameTimes[this.frameIndex] = rawDt * 1000;
    this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
    let sum = 0;
    for (let i = 0; i < this.frameTimes.length; i++) sum += this.frameTimes[i];
    this.smoothedFrameMs = sum / this.frameTimes.length;

    if (!this.director || this.exporter.running) return;

    if (this.introPlaying) {
      if (this.audioAvailable && this.director.sync.playing) {
        this.introTime = this.director.sync.currentTime();
      } else {
        this.introTime += dt;
      }
      if (this.introTime >= this.director.duration) {
        this.introTime = this.director.duration;
        this.pauseIntro();
      }
    }

    this.director.renderAt(this.introTime, dt);
    this.updateAdaptiveResolution(dt);
    if (this.cineUI) this.cineUI.update(this.introState());

    if (this.pendingScreenshot) {
      this.pendingScreenshot = false;
      this.saveScreenshot();
    }

    this.statsTimer += dt;
    if (this.statsTimer > 0.25) {
      this.statsTimer = 0;
      this.refreshStats();
    }
  }

  refreshStats() {
    if (!this.cineUI || !this.settings.showStats) return;
    const d = this.director;
    const fps = 1000 / Math.max(this.smoothedFrameMs, 0.001);
    const m = d.music;
    this.cineUI.setStats([
      ['fps', fps.toFixed(0)],
      ['frame', `${this.smoothedFrameMs.toFixed(1)} ms`],
      ['res', `${this.renderer.width}x${this.renderer.height}`],
      ['t', d.time.toFixed(3)],
      ['bar', `${m.bar + 1}.${m.beatInBar + 1}`],
      ['level', m.level.toFixed(2)],
      ['bass', m.bass.toFixed(2)],
      ['high', m.high.toFixed(2)],
      ['prims', d.stats.prims.toLocaleString()],
      ['particles', d.stats.particles.toLocaleString()],
      ['lights', d.stats.lights],
      ['beams', d.stats.beams],
      ['cast', d.stats.cast],
    ]);
  }

  saveScreenshot() {
    const snapshot = document.createElement('canvas');
    snapshot.width = this.canvas.width;
    snapshot.height = this.canvas.height;
    const context = snapshot.getContext('2d');
    context.drawImage(this.canvas, 0, 0);
    snapshot.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `empress-cinematic-${Date.now()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (this.ui) this.ui.showToast('Screenshot saved');
    }, 'image/png');
  }
}

function yieldToPaint() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 90);
  });
}

const app = new App();

window.EmpressCinematic = {
  app,
  settings: app.settings,
  play: () => app.start(),
  seek: (t) => app.seekIntro(t),
  step: (dt = 1 / 60) => app.stepFrame(dt),
  get director() { return app.director; },
};
window.EmpressCity = window.EmpressCinematic;

window.addEventListener('error', (e) => {
  if (app.ui) app.ui.showError(e.message);
});
app.boot();
