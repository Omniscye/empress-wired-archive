import { Renderer } from './renderer.js';
import { Settings } from './settings.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Camera, FreeController, CinematicController, MODE_CINEMATIC, MODE_FLY, MODE_WALK } from './camera.js';
import { CityStreamer } from './city/streamer.js';
import { Traffic } from './city/traffic.js';
import { CityAudio } from './audio/soundtrack.js';
import { districtDensity, districtType, DISTRICT_NAMES } from './city/layout.js';
import { clamp } from './core/math.js';
import { Rng } from './city/rng.js';

import { Director } from './cinematic/director.js';
import { CinematicUI } from './cinematic/ui.js';
import { CinematicExporter } from './cinematic/export.js';
import { autoDetectQuality, resolveQuality } from './cinematic/quality.js';
import { AUDIO_FILE, ANALYSIS } from './cinematic/analysis.js';

const MODE_LABELS = {
  [MODE_CINEMATIC]: 'Cinematic',
  [MODE_FLY]: 'Free Flight',
  [MODE_WALK]: 'Street Level',
};

const MODE_HINTS = {
  [MODE_CINEMATIC]: '<b>1</b> cinematic &nbsp; <b>2</b> fly &nbsp; <b>3</b> walk &nbsp; <b>O</b> settings &nbsp; <b>H</b> hide ui',
  [MODE_FLY]: '<b>WASD</b> move &nbsp; <b>Space/Shift</b> up-down &nbsp; <b>Right Shift</b> boost &nbsp; drag to look',
  [MODE_WALK]: '<b>WASD</b> walk &nbsp; drag to look &nbsp; <b>2</b> fly &nbsp; <b>1</b> cinematic',
};

const EXPERIENCE_CITY = 'city';
const EXPERIENCE_INTRO = 'intro';

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.settings = new Settings();
    this.camera = new Camera();
    this.input = new Input(this.canvas);
    this.free = new FreeController();
    this.cinematic = new CinematicController();
    this.mode = MODE_CINEMATIC;
    this.experience = EXPERIENCE_CITY;
    this.time = 0;
    this.lastFrame = 0;
    this.frameTimes = new Float32Array(60);
    this.frameIndex = 0;
    this.smoothedFrameMs = 16.7;
    this.scene = {
      boxCount: 0,
      signCount: 0,
      lightCount: 0,
      vehicleCount: 0,
      vehicleLightCount: 0,
      volLightCount: 0,
      flash: 0,
      lightData: new Float32Array(0),
    };
    this.flashTimer = 6;
    this.flashPulses = [];
    this.streamerVersion = -1;
    this.pendingScreenshot = false;
    this.running = false;
    this.statsTimer = 0;

    this.director = null;
    this.cineUI = null;
    this.exporter = null;
    this.introTime = 0;
    this.introPlaying = false;
    this.introReady = false;
    this.introLoading = null;
    this.wasScrubbing = false;
    this.audioAvailable = false;
    this.fixedWidth = 0;
    this.fixedHeight = 0;
    this.audioFile = AUDIO_FILE;
    this.cityPresetBackup = null;
    this.cinematicQuality = autoDetectQuality();
  }

  async boot() {
    try {
      this.renderer = new Renderer(this.canvas, this.settings);
    } catch (err) {
      this.showFatal(err);
      return;
    }

    this.audio = new CityAudio();
    this.streamer = new CityStreamer({ radius: this.settings.viewRadius });
    this.traffic = new Traffic({ ground: this.settings.trafficGround, air: this.settings.trafficAir });

    this.ui = new UI(this.settings, {
      onSetting: (key) => this.onSettingChanged(key),
      onPreset: () => this.onPresetChanged(),
      onStart: () => this.start(EXPERIENCE_CITY),
      onStartIntro: () => this.start(EXPERIENCE_INTRO),
      onScreenshot: () => { this.pendingScreenshot = true; },
      onTeleport: () => this.teleport(),
    });

    this.renderer.onRestored = () => {
      this.streamerVersion = -1;
      this.traffic.needsRespawn = true;
      if (this.director) this.director.renderer.build();
      this.ui.showToast('Graphics context restored');
    };

    this.bindEvents();
    this.resize();

    this.camera.position[0] = 42;
    this.camera.position[1] = 30;
    this.camera.position[2] = 120;
    this.camera.target[0] = 42;
    this.camera.target[1] = 26;
    this.camera.target[2] = 40;
    this.camera.update(this.canvas.width / this.canvas.height);
    this.cinematic.syncFrom(this.camera);

    await this.warmup();
  }

  async warmup() {
    const steps = [
      ['Compiling shaders', () => this.compileAll()],
      ['Generating districts', () => this.primeCity(0.34)],
      ['Placing structures', () => this.primeCity(0.7)],
      ['Wiring the grid', () => this.primeCity(1.0)],
      ['Priming renderer', () => this.primeFrame()],
    ];

    for (let i = 0; i < steps.length; i++) {
      this.ui.setLoaderProgress(i / steps.length, steps[i][0]);
      await yieldToPaint();
      try {
        steps[i][1]();
      } catch (err) {
        this.showFatal(err);
        return;
      }
    }

    this.ui.setLoaderProgress(1, 'Ready');
    this.ui.showStart();

    if (location.hash === '#intro' || location.hash === '#cinematic') {
      this.start(EXPERIENCE_INTRO);
    }
  }

  compileAll() {
    const gl = this.renderer.gl;
    gl.finish();
  }

  primeCity(fraction) {
    this.streamer.update(this.camera.position[0], this.camera.position[2]);
    const total = this.streamer.pending.length + this.streamer.cells.size;
    const goal = Math.floor(total * fraction);
    let guard = 0;
    while (this.streamer.cells.size < goal && this.streamer.pending.length > 0 && guard < 8000) {
      this.streamer.primeSync(120);
      guard++;
    }
    this.streamer.update(this.camera.position[0], this.camera.position[2]);
  }

  primeFrame() {
    this.cinematic.beginOnStreet(this.streamer, this.camera);
    this.cinematic.update(1 / 60, this.camera, this.streamer);
    this.camera.update(this.canvas.width / this.canvas.height);
    this.streamer.update(this.camera.position[0], this.camera.position[2]);
    this.streamer.primeSync(220);
    this.streamer.update(this.camera.position[0], this.camera.position[2]);
    this.updateScene(1 / 60);
    this.renderer.render(this.camera, this.scene, 0);
    this.renderer.gl.finish();
  }

  start(experience) {
    if (this.running && this.experience === experience) return;
    if (experience === EXPERIENCE_INTRO) {
      this.startIntro();
      return;
    }
    this.experience = EXPERIENCE_CITY;
    if (this.director) this.director.pause();
    if (this.cineUI) this.cineUI.hide();
    this.ui.setChromeVisible(true);
    this.resize();
    if (this.running) {
      this.ui.setMode(MODE_LABELS[this.mode], MODE_HINTS[this.mode]);
      if (this.settings.audioEnabled) this.enableAudio();
      return;
    }
    this.beginLoop();
    this.ui.hideLoader();
    this.ui.setMode(MODE_LABELS[this.mode], MODE_HINTS[this.mode]);
    this.ui.setStatsVisible(this.settings.showStats);
    if (this.settings.audioEnabled) this.enableAudio();
  }

  async startIntro() {
    this.audio.setEnabled(false);
    if (!this.introLoading) {
      this.introLoading = this.prepareIntro();
    }
    try {
      await this.introLoading;
    } catch (err) {
      this.showFatal(err);
      return;
    }
    this.experience = EXPERIENCE_INTRO;
    this.ui.setChromeVisible(false);
    this.ui.hideLoader();
    this.cineUI.show();
    this.resize();
    this.director.seek(0);
    this.introTime = 0;
    if (this.audioAvailable) {
      await this.director.sync.resume();
      this.director.play();
    }
    this.introPlaying = true;
    this.cineUI.setPlaying(true);
    this.beginLoop();
  }

  async prepareIntro() {
    this.ui.setLoaderBusy(true);
    this.ui.setLoaderProgress(0.05, 'Building the cinematic');
    await yieldToPaint();

    this.cityPresetBackup = {
      maxLights: this.settings.maxLights,
      ssaoSamples: this.settings.ssaoSamples,
      ssrSteps: this.settings.ssrSteps,
      volumetricSteps: this.settings.volumetricSteps,
      volumetricLights: this.settings.volumetricLights,
      bloomMips: this.settings.bloomMips,
    };

    this.director = new Director(this.renderer, this.settings, { quality: this.cinematicQuality });
    this.director.onSequence = (seq) => {
      if (this.cineUI) this.cineUI.update(this.introState(seq));
    };

    this.ui.setLoaderProgress(0.4, 'Compiling cinematic shaders');
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
      onExit: () => this.start(EXPERIENCE_CITY),
      onRenderFilm: (opts) => this.runExport('film', opts),
      onCapture: (opts) => this.runExport('capture', opts),
      onGrabFrame: (opts) => this.runExport('still', opts),
      onCancelExport: () => this.exporter.cancel(),
    });
    this.cineUI.setTimeline(this.director.duration, this.director.sequenceList(), this.director.sync.bars);
    this.cineUI.setQuality(this.cinematicQuality);
    this.cineUI.setVolume(this.director.sync.volume);

    this.ui.setLoaderProgress(0.55, 'Loading the score');
    await yieldToPaint();
    try {
      await this.director.sync.load((p) => this.ui.setLoaderProgress(0.55 + p * 0.35, 'Loading the score'));
      this.audioAvailable = true;
    } catch (err) {
      this.audioAvailable = false;
      this.ui.showToast('Sound unavailable, running on the internal clock');
    }

    this.ui.setLoaderProgress(0.95, 'Priming the first frame');
    await yieldToPaint();
    this.setFixedResolution(0, 0);
    this.director.renderAt(0, 1 / 60);
    this.renderer.gl.finish();
    this.ui.setLoaderProgress(1, 'Ready');
    this.ui.setLoaderBusy(false);
    this.introReady = true;
  }

  beginLoop() {
    if (this.running) return;
    this.running = true;
    const resume = () => {
      if (this.experience === EXPERIENCE_CITY && this.settings.audioEnabled) this.enableAudio();
      if (this.experience === EXPERIENCE_INTRO && this.director) this.director.sync.resume();
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
      this.director.sync.resume();
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

  enableAudio() {
    this.audio.start().then(() => {
      this.audio.setVolume(this.settings.audioVolume);
      this.audio.setRain(this.settings.rainIntensity);
      this.audio.setEnabled(true);
    }).catch(() => {});
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
      if (this.experience === EXPERIENCE_INTRO) {
        this.handleIntroKey(code);
        return;
      }
      switch (code) {
        case 'Digit1': this.setMode(MODE_CINEMATIC); break;
        case 'Digit2': this.setMode(MODE_FLY); break;
        case 'Digit3': this.setMode(MODE_WALK); break;
        case 'KeyH': this.ui.toggleHud(); break;
        case 'KeyC': this.start(EXPERIENCE_INTRO); break;
        case 'KeyO':
        case 'Tab': this.ui.togglePanel(); break;
        case 'KeyF': this.toggleFullscreen(); break;
        case 'KeyP': this.pendingScreenshot = true; break;
        case 'KeyR': this.teleport(); break;
        case 'KeyG':
          this.settings.set('showStats', !this.settings.showStats);
          this.ui.setStatsVisible(this.settings.showStats);
          break;
        case 'KeyM':
          this.settings.set('audioEnabled', !this.settings.audioEnabled);
          this.ui.syncAll();
          this.onSettingChanged('audioEnabled');
          break;
        case 'Escape':
          this.input.exitPointerLock();
          this.ui.togglePanel(false);
          break;
        default: break;
      }
    });

    this.input.on('primary', () => {
      if (this.experience === EXPERIENCE_CITY && this.mode !== MODE_CINEMATIC) {
        this.input.requestPointerLock();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.lastFrame = performance.now();
    });
  }

  handleIntroKey(code) {
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
      case 'Escape': this.start(EXPERIENCE_CITY); break;
      default: {
        const chapter = '1234567890'.indexOf(code.replace('Digit', ''));
        if (code.startsWith('Digit') && chapter >= 0) {
          const list = this.director.sequences;
          const index = chapter === 9 ? 9 : chapter;
          if (list[index]) this.seekIntro(list[index].start + 0.01);
        }
        break;
      }
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    if (mode !== MODE_CINEMATIC && this.mode === MODE_CINEMATIC) {
      this.free.syncFrom(this.camera);
    }
    this.mode = mode;
    this.free.mode = mode;
    if (mode === MODE_WALK) this.free.position[1] = 1.75;
    if (mode === MODE_CINEMATIC) {
      this.input.exitPointerLock();
      this.cinematic.syncFrom(this.camera);
    }
    this.ui.setMode(MODE_LABELS[mode], MODE_HINTS[mode]);
    this.ui.showToast(MODE_LABELS[mode]);
  }

  teleport() {
    const rng = new Rng((Math.random() * 0xffffffff) >>> 0);
    let bestX = 0;
    let bestZ = 0;
    let bestScore = -1;
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-42000, 42000);
      const z = rng.range(-42000, 42000);
      const d = districtDensity(x, z);
      if (d > bestScore) {
        bestScore = d;
        bestX = x;
        bestZ = z;
      }
    }
    this.camera.position[0] = bestX;
    this.camera.position[1] = 40 + bestScore * 160;
    this.camera.position[2] = bestZ;
    this.free.position[0] = bestX;
    this.free.position[1] = this.camera.position[1];
    this.free.position[2] = bestZ;
    this.traffic.needsRespawn = true;
    this.streamer.centerX = Infinity;
    this.streamer.update(bestX, bestZ);
    this.streamer.primeSync(180);
    this.streamer.update(bestX, bestZ);
    this.camera.update(this.canvas.width / this.canvas.height);
    if (this.mode === MODE_CINEMATIC) this.cinematic.beginOnStreet(this.streamer, this.camera);
    else this.cinematic.syncFrom(this.camera);
    this.ui.showToast('Relocated');
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  onSettingChanged(key) {
    const s = this.settings;
    switch (key) {
      case 'viewRadius': this.streamer.setRadius(Math.round(s.viewRadius)); break;
      case 'trafficGround':
      case 'trafficAir': this.traffic.setCounts(Math.round(s.trafficGround), Math.round(s.trafficAir)); break;
      case 'renderScale':
      case 'adaptiveResolution': this.resize(); break;
      case 'audioEnabled':
        if (s.audioEnabled) this.enableAudio();
        else this.audio.setEnabled(false);
        break;
      case 'audioVolume': this.audio.setVolume(s.audioVolume); break;
      case 'rainIntensity': this.audio.setRain(s.rainIntensity); break;
      default: break;
    }
    if (s.preset !== 'custom') {
      const presetKeys = ['renderScale', 'viewRadius', 'maxLights', 'ssaoSamples', 'ssrSteps', 'volumetricSteps', 'volumetricLights', 'fxaa', 'trafficGround', 'trafficAir'];
      if (presetKeys.includes(key)) {
        s.preset = 'custom';
        this.ui.syncAll();
      }
    }
  }

  onPresetChanged() {
    const s = this.settings;
    this.streamer.setRadius(Math.round(s.viewRadius));
    this.traffic.setCounts(Math.round(s.trafficGround), Math.round(s.trafficAir));
    this.renderer.createTargets();
    this.resize();
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
    const scale = this.experience === EXPERIENCE_INTRO
      ? resolveQuality(this.cinematicQuality).renderScale
        * (this.settings.adaptiveResolution ? this.settings.dynamicScale : 1)
      : this.settings.effectiveScale();
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

  updateLightning(dt) {
    const strength = this.settings.lightning;
    if (strength <= 0) {
      this.scene.flash = 0;
      return;
    }
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.flashTimer = 9 + Math.random() * 26;
      const strikes = 1 + Math.floor(Math.random() * 3);
      const magnitude = 0.25 + Math.random() * 0.9;
      for (let i = 0; i < strikes; i++) {
        this.flashPulses.push({
          delay: i * (0.05 + Math.random() * 0.16),
          life: 0.09 + Math.random() * 0.22,
          age: 0,
          power: magnitude * (1 - i * 0.28) * (0.6 + Math.random() * 0.6),
        });
      }
    }
    let total = 0;
    for (let i = this.flashPulses.length - 1; i >= 0; i--) {
      const pulse = this.flashPulses[i];
      if (pulse.delay > 0) {
        pulse.delay -= dt;
        continue;
      }
      pulse.age += dt;
      if (pulse.age >= pulse.life) {
        this.flashPulses.splice(i, 1);
        continue;
      }
      const t = pulse.age / pulse.life;
      total += pulse.power * (1 - t) * (1 - t);
    }
    this.scene.flash = Math.min(2.5, total * strength);
  }

  updateScene(dt) {
    const s = this.settings;
    const camera = this.camera;
    if (this.renderer.contextLost) return;

    this.streamer.update(camera.position[0], camera.position[2]);
    if (this.streamer.version !== this.streamerVersion) {
      this.streamerVersion = this.streamer.version;
      this.renderer.buildingMesh.uploadInstances(
        this.streamer.boxData.subarray(0, this.streamer.boxFloats), this.streamer.boxCount);
      this.renderer.signMesh.uploadInstances(
        this.streamer.signData.subarray(0, this.streamer.signFloats), this.streamer.signCount);
    }
    this.scene.boxCount = this.streamer.boxCount;
    this.scene.signCount = this.streamer.signCount;

    this.traffic.update(dt, camera.position, camera.frustum);
    if (this.traffic.instanceCount > 0) {
      this.renderer.vehicleMesh.uploadInstances(
        this.traffic.instanceData.subarray(0, this.traffic.instanceCount * 12), this.traffic.instanceCount);
    }
    this.scene.vehicleCount = this.traffic.instanceCount;

    const lightRange = 40 + Math.min(340, 120 + camera.position[1] * 1.4);
    const maxLights = Math.round(s.maxLights);
    const lightCount = this.streamer.collectLights(camera.position, camera.frustum, lightRange, maxLights);
    this.scene.lightCount = lightCount;
    this.scene.lightData = this.streamer.lightBuffer;
    if (lightCount > 0) {
      this.renderer.lightMesh.uploadInstances(this.streamer.lightBuffer.subarray(0, lightCount * 12), lightCount);
    }

    if (this.traffic.lightCount > 0) {
      this.renderer.vehicleLightMesh.uploadInstances(
        this.traffic.lightData.subarray(0, this.traffic.lightCount * 12), this.traffic.lightCount);
    }
    this.scene.vehicleLightCount = this.traffic.lightCount;
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

    if (this.experience === EXPERIENCE_INTRO) this.stepIntro(dt);
    else this.stepCity(dt);

    if (this.pendingScreenshot) {
      this.pendingScreenshot = false;
      this.saveScreenshot();
    }

    this.statsTimer += dt;
    if (this.statsTimer > 0.25) {
      this.statsTimer = 0;
      if (this.experience === EXPERIENCE_INTRO) this.refreshIntroStats();
      else if (this.settings.showStats) this.refreshStats();
      if (this.experience === EXPERIENCE_CITY) this.updateAudioMood();
    }
  }

  stepIntro(dt) {
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
  }

  stepCity(dt) {
    this.time += dt * this.settings.timeScale;

    const [mdx, mdy] = this.input.consumeMouse();
    if (this.mode === MODE_CINEMATIC) {
      this.cinematic.update(dt, this.camera, this.streamer);
    } else {
      if (mdx !== 0 || mdy !== 0) this.free.look(mdx, mdy, 0.0022);
      this.free.update(dt, this.input, this.camera);
    }

    this.camera.update(this.canvas.width / this.canvas.height);
    this.updateLightning(dt);
    this.updateScene(dt);
    this.updateAdaptiveResolution(dt);

    if (!this.renderer.contextLost) this.renderer.render(this.camera, this.scene, this.time);
  }

  updateAudioMood() {
    if (!this.settings.audioEnabled) return;
    const p = this.camera.position;
    this.audio.setRain(clamp(this.settings.rainIntensity * (1 - clamp(p[1] / 340, 0, 0.55)), 0, 1));
    this.audio.setAltitude(p[1]);
  }

  refreshStats() {
    const p = this.camera.position;
    const density = districtDensity(p[0], p[2]);
    const district = DISTRICT_NAMES[districtType(p[0], p[2], density)];
    const fps = 1000 / Math.max(this.smoothedFrameMs, 0.001);
    this.ui.updateStats([
      ['fps', fps.toFixed(0)],
      ['frame', `${this.smoothedFrameMs.toFixed(1)} ms`],
      ['res', `${this.renderer.width}x${this.renderer.height}`],
      ['scale', this.settings.effectiveScale().toFixed(2)],
      ['district', district],
      ['density', density.toFixed(2)],
      ['pos', `${p[0].toFixed(0)}, ${p[1].toFixed(0)}, ${p[2].toFixed(0)}`],
      ['cells', `${this.streamer.stats.cells} (+${this.streamer.stats.pending})`],
      ['boxes', this.scene.boxCount.toLocaleString()],
      ['signs', this.scene.signCount.toLocaleString()],
      ['lights', `${this.scene.lightCount + this.scene.vehicleLightCount}`],
      ['vehicles', this.scene.vehicleCount],
    ]);
  }

  refreshIntroStats() {
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
      ['impact', m.impact.toFixed(2)],
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
      link.download = `empress-${this.experience}-${Date.now()}.png`;
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

window.EmpressCity = {
  app,
  settings: app.settings,
  step: (dt = 1 / 60) => app.stepFrame(dt),
  setMode: (mode) => app.setMode(mode),
  teleport: () => app.teleport(),
  enterCity: () => app.start('city'),
  enterCinematic: () => app.start('intro'),
  seek: (t) => app.seekIntro(t),
  get director() { return app.director; },
  moveTo: (x, y, z) => {
    app.camera.position[0] = x;
    app.camera.position[1] = y;
    app.camera.position[2] = z;
    app.free.position[0] = x;
    app.free.position[1] = y;
    app.free.position[2] = z;
  },
  lookAt: (x, y, z) => {
    app.camera.target[0] = x;
    app.camera.target[1] = y;
    app.camera.target[2] = z;
  },
};

window.addEventListener('error', (e) => {
  if (app.ui) app.ui.showError(e.message);
});
app.boot();
