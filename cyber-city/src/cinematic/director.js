import { vec3, clamp, lerp, smoothstep, Ease } from '../core/math.js';
import { Camera } from '../camera.js';
import { CinematicFrame } from './stores.js';
import { CinematicRenderer } from './renderer.js';
import { Timeline } from './timeline.js';
import { CameraRig } from './cameraPaths.js';
import { TransitionDeck } from './transitions.js';
import { AudioSync, MusicState } from './audioSync.js';
import { Cast } from './choreography.js';
import { createSequences, TIMES } from './scenes.js';
import { resolveQuality, frameBudget, applyQualityToSettings } from './quality.js';
import { ANALYSIS } from './analysis.js';

const TITLE_CARDS = [
  {
    at: 5.2,
    fadeIn: 1.6,
    hold: 3.0,
    fadeOut: 2.2,
    rect: [0.30, 0.455, 0.40, 0.09],
    color: [0.74, 0.86, 1.0],
    glow: 0.55,
    scatter: 0.05,
    lines: [
      { text: 'E M P R E S S', size: 46, weight: 300, family: 'system-ui, -apple-system, Segoe UI, sans-serif' },
    ],
  },
  {
    at: TIMES.outroLast - 5.6,
    fadeIn: 2.4,
    hold: 6.0,
    fadeOut: 3.0,
    rect: [0.185, 0.355, 0.63, 0.29],
    color: [1.0, 0.96, 0.90],
    glow: 0.75,
    scatter: 0.02,
    lines: [
      { text: 'EMPRESS', size: 116, weight: 700, family: 'system-ui, -apple-system, Segoe UI, sans-serif', tracking: 14 },
      { text: 'C I N E M A T I C', size: 42, weight: 300, family: 'system-ui, -apple-system, Segoe UI, sans-serif', tracking: 20, gap: 96 },
    ],
  },
];

export class Director {
  constructor(baseRenderer, settings, options = {}) {
    this.base = baseRenderer;
    this.settings = settings;
    this.renderer = new CinematicRenderer(baseRenderer);
    this.camera = new Camera();
    this.camera.near = 0.12;
    this.camera.far = 6000;

    this.qualityName = options.quality || 'high';
    this.quality = resolveQuality(this.qualityName);
    applyQualityToSettings(settings, this.qualityName);

    this.frame = new CinematicFrame(frameBudget(this.qualityName));
    this.cast = new Cast(64);
    this.sync = new AudioSync();
    this.music = new MusicState();
    this.duration = ANALYSIS.duration;

    this.timeline = new Timeline(this.duration);
    this.rig = new CameraRig();
    this.deck = new TransitionDeck();
    this.sequences = createSequences();

    this.time = 0;
    this.playing = false;
    this.frameIndex = 0;
    this.built = false;
    this.currentCard = -1;
    this.textCanvas = null;
    this.onSequence = null;
    this.lastSequenceId = null;
    this.stats = { prims: 0, particles: 0, lights: 0, beams: 0, trailVerts: 0, cast: 0 };

    this.buildContext = {
      rig: this.rig,
      deck: this.deck,
      timeline: this.timeline,
      sync: this.sync,
      quality: this.quality,
      director: this,
    };

    this.ctx = {
      t: 0,
      dt: 1 / 60,
      local: 0,
      progress: 0,
      seq: null,
      music: this.music,
      sync: this.sync,
      frame: this.frame,
      prims: this.frame.primStore,
      beams: this.frame.beamStore,
      lights: this.frame.lights,
      particles: this.frame.particles,
      cast: this.cast,
      camera: this.camera,
      rig: this.rig,
      quality: this.quality,
      timeline: this.timeline,
      director: this,
    };

    this.build();
  }

  build() {
    if (this.built) return;
    for (const seq of this.sequences) {
      this.timeline.addSequence({
        id: seq.id,
        name: seq.name,
        title: seq.title,
        start: seq.start,
        end: seq.end,
        scene: seq,
      });
      seq.build(this.buildContext);
      this.timeline.addMarker(seq.start, seq.name);
    }

    this.deck.fadeFrom(0, 3.4, [0, 0, 0]);
    this.deck.fadeTo(TIMES.end - 3.2, 3.0, [0, 0, 0]);

    this.timeline.on('sequence', (seq) => {
      if (this.onSequence) this.onSequence(seq);
    });

    this.buildTextCanvas();
    this.built = true;
  }

  buildTextCanvas() {
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.width = 2048;
    this.textCanvas.height = 1024;
  }

  renderCard(index) {
    if (index === this.currentCard) return;
    this.currentCard = index;
    if (index < 0) return;
    const card = TITLE_CARDS[index];
    const canvas = this.textCanvas;
    const ctx2d = canvas.getContext('2d');
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillStyle = '#ffffff';

    let total = 0;
    for (const line of card.lines) total += line.size * 1.24 + (line.gap || 0);
    let y = canvas.height * 0.5 - total * 0.5;

    for (const line of card.lines) {
      y += (line.gap || 0) + line.size * 0.62;
      ctx2d.font = `${line.weight || 400} ${line.size * 2}px ${line.family}`;
      const tracking = (line.tracking || 0) * 2;
      if (tracking > 0) {
        const chars = [...line.text];
        let width = 0;
        for (const ch of chars) width += ctx2d.measureText(ch).width + tracking;
        width -= tracking;
        let x = canvas.width * 0.5 - width * 0.5;
        for (const ch of chars) {
          const w = ctx2d.measureText(ch).width;
          ctx2d.fillText(ch, x + w * 0.5, y);
          x += w + tracking;
        }
      } else {
        ctx2d.fillText(line.text, canvas.width * 0.5, y);
      }
      y += line.size * 0.62;
    }

    this.renderer.uploadText(canvas);
  }

  cardAt(t) {
    for (let i = 0; i < TITLE_CARDS.length; i++) {
      const c = TITLE_CARDS[i];
      const end = c.at + c.fadeIn + c.hold + c.fadeOut;
      if (t >= c.at - 0.4 && t <= end) return i;
    }
    return -1;
  }

  cardOpacity(card, t) {
    const inEnd = card.at + card.fadeIn;
    const holdEnd = inEnd + card.hold;
    const outEnd = holdEnd + card.fadeOut;
    if (t < card.at || t > outEnd) return 0;
    if (t < inEnd) return Ease.outCubic((t - card.at) / Math.max(card.fadeIn, 1e-4));
    if (t < holdEnd) return 1;
    return 1 - Ease.inCubic((t - holdEnd) / Math.max(card.fadeOut, 1e-4));
  }

  setQuality(name) {
    this.qualityName = name;
    this.quality = resolveQuality(name);
    applyQualityToSettings(this.settings, name);
    this.ctx.quality = this.quality;
    this.buildContext.quality = this.quality;
    return this.quality;
  }

  seek(t) {
    this.time = clamp(t, 0, this.duration);
    this.timeline.seek(this.time);
    for (const seq of this.sequences) {
      if (seq.pool) seq.pool.reset();
      if (seq.trail) seq.trail.reset();
      if (seq.seeded !== undefined) seq.seeded = false;
      if (seq.fired !== undefined) seq.fired = false;
      if (seq.lastBurst !== undefined) seq.lastBurst = -99;
    }
    if (this.sync.loaded) this.sync.seek(this.time);
    this.prime();
  }

  prime() {
    const index = this.frameIndex;
    const dt = 1 / 60;
    for (let i = 0; i < 3; i++) this.step(this.time, dt);
    this.frameIndex = index;
    const aspect = this.base.width / Math.max(1, this.base.height);
    this.camera.update(aspect);
    this.camera.update(aspect);
  }

  play() {
    this.playing = true;
    if (this.sync.loaded) this.sync.play(this.time);
  }

  pause() {
    this.playing = false;
    this.sync.pause();
  }

  step(t, dt) {
    const time = clamp(t, 0, this.duration);
    this.time = time;
    this.frameIndex++;

    const seq = this.timeline.advance(time);
    const local = this.timeline.local(seq);
    this.sync.sample(time, this.music);

    this.frame.reset();
    this.cast.reset();

    const ctx = this.ctx;
    ctx.t = time;
    ctx.dt = dt;
    ctx.local = local.time;
    ctx.progress = local.progress;
    ctx.seq = seq;

    this.rig.shakeAmount = 0;
    this.rig.fovPunch = 0;
    this.rig.evaluate(time, ctx);
    this.rig.apply(this.camera);

    if (seq && seq.scene) seq.scene.update(ctx);

    const post = this.frame.post;
    const env = this.frame.env;

    post.focusDistance = this.rig.focusDistance;
    post.focusRange = this.rig.focusRange;
    post.dofRadius *= this.rig.dofScale !== undefined ? this.rig.dofScale : 1;
    post.dofSamples = this.quality.dofSamples;
    post.radialSamples = this.quality.radialSamples;
    post.motionSamples = Math.min(post.motionSamples || this.quality.motionSamples, this.quality.motionSamples);
    post.bloomMips = this.quality.bloomMips;
    post.ssao = this.quality.ssao;
    post.ssr = this.quality.ssr;

    if (seq && seq.scene) post.exposure *= seq.scene.exposureTrim;

    this.deck.apply(post, env, time);

    const cardIndex = this.cardAt(time);
    this.renderCard(cardIndex);
    if (cardIndex >= 0) {
      const card = TITLE_CARDS[cardIndex];
      post.textRect = card.rect;
      post.textColor = card.color;
      post.textOpacity = this.cardOpacity(card, time);
      post.textGlow = card.glow;
      post.textScatter = card.scatter;
    } else {
      post.textOpacity = 0;
    }

    post.exposure *= 0.985 + this.music.energy * 0.03;

    const bass = this.music.bass;
    const treble = this.music.high;
    const warm = bass * 0.13;
    const cool = treble * 0.14;
    const tint = post.tint;
    tint[0] *= 1 + warm * 0.85 - cool * 0.30;
    tint[1] *= 1 + warm * 0.20 + cool * 0.16;
    tint[2] *= 1 + cool * 0.90 - warm * 0.35;

    env.energy = Math.min(1.6, env.energy + this.music.energy * 0.45);
    env.rimColor = [
      env.rimColor[0] * (1 + warm * 0.55 - cool * 0.15),
      env.rimColor[1] * (1 + warm * 0.10 + cool * 0.10),
      env.rimColor[2] * (1 + cool * 0.60 - warm * 0.20),
    ];

    const stats = this.frame.stats();
    this.stats.prims = stats.prims;
    this.stats.particles = stats.particles;
    this.stats.lights = stats.lights;
    this.stats.beams = stats.beams;
    this.stats.trailVerts = stats.trailVerts;
    this.stats.cast = this.cast.used;

    return seq;
  }

  render() {
    this.camera.update(this.base.width / Math.max(1, this.base.height));
    this.renderer.render(this.camera, this.frame, this.time);
  }

  renderAt(t, dt) {
    this.step(t, dt);
    this.render();
  }

  sequenceList() {
    return this.sequences.map((s) => ({
      id: s.id, name: s.name, title: s.title, start: s.start, end: s.end,
    }));
  }

  dispose() {
    this.sync.dispose();
  }
}

export { TIMES };
export { vec3, lerp, smoothstep };
