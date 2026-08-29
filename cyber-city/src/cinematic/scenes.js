import {
  vec3, quat, clamp, lerp, smoothstep, smootherstep, Ease, TAU, turbulence,
} from '../core/math.js';
import { rand1, rand2 } from '../city/rng.js';
import { CINE_KIND } from '../shaders/cinematic.js';
import { MoteField, ParticlePool, PARTICLE_KIND, Trail } from './particles.js';
import {
  emitLightShaft, emitCathedralLight, emitPortal, emitMagicCircle, emitShockwave,
  ShardField, emitGlassBurst, MemoryField, emitStation, FloatingArchitecture,
  emitSpeedStreaks, emitDissolveSparks, emitVoidFloor, emitEnergyCore,
} from './effects.js';
import {
  Cast, Behaviour, Formation, PALETTE, duel, clashPoint, emitHorde, emitCircle,
} from './choreography.js';
import { TRANSITION } from './transitions.js';

const T = {
  darkness: 0.0,
  falling: 18.319,
  fallSilence: 28.226,
  drop: 33.715,
  memory: 33.715,
  station: 69.506,
  stationIgnite: 77.762,
  montage: 95.925,
  shatter: 130.600,
  lightDark: 137.205,
  surreal: 157.019,
  surrealLift: 175.182,
  climaxStop: 209.857,
  climaxHit: 210.953,
  outro: 246.183,
  outroLast: 254.439,
  end: 263.498,
};

export const SEQUENCE_TIMES = T;

const TMP = vec3.create();
const TMP2 = vec3.create();
const Q = quat.create();

function setEnv(env, values) {
  for (const key in values) env[key] = values[key];
}

export class Sequence {
  constructor(spec) {
    this.id = spec.id;
    this.name = spec.name;
    this.title = spec.title || spec.name;
    this.start = spec.start;
    this.end = spec.end;
    this.length = spec.end - spec.start;

    this.exposureTrim = spec.exposureTrim !== undefined ? spec.exposureTrim : 1;
  }

  build() {}

  update() {}
}

export class DarknessSequence extends Sequence {
  constructor() {
    super({ id: 'darkness', name: 'Darkness', title: 'I / DREAM', start: T.darkness, end: T.falling, exposureTrim: 1.40 });
    this.motes = new MoteField({
      cellSize: 5.0, radius: 5, density: 0.34, size: 0.030, sizeVariation: 1.9,
      color: [0.24, 0.44, 0.86], color2: [0.72, 0.86, 1.0],
      intensity: 1.5, drift: 0.20, rise: 0.35, twinkle: 0.7, seed: 3,
    });
    this.dust = new MoteField({
      cellSize: 14.0, radius: 4, density: 0.18, size: 0.11, sizeVariation: 1.2,
      color: [0.16, 0.30, 0.66], color2: [0.44, 0.62, 0.96],
      intensity: 0.55, drift: 0.08, rise: 0.12, twinkle: 0.25, softness: 0.9, seed: 11,
    });
    this.shards = new ShardField({
      count: 90, seed: 17, radius: 130, height: 90, centre: [0, 0, -60],
      sizeMin: 0.5, sizeMax: 4.0, spin: 0.10, drift: 0.22,
      albedo: [0.05, 0.07, 0.12], emissive: [0.24, 0.46, 0.92], glow: 0.55,
    });
    this.heroPos = vec3.create(0, 0, -34);
  }

  build(ctx) {
    const { rig, deck } = ctx;

    const a = rig.shot(T.darkness, 10.2, {
      spline: true, ease: 'linear', handheld: 0.5, dofScale: 1.35, focusRange: 3.0,
      label: 'drift',
    });
    a.keyframe(0.0, [3.5, 1.2, 26.0], [0.0, 0.6, -6.0], 44);
    a.keyframe(3.4, [2.2, 1.6, 18.0], [-0.4, 0.9, -10.0], 42);
    a.keyframe(6.8, [0.6, 2.1, 9.5], [-0.2, 1.2, -14.0], 40);
    a.keyframe(10.2, [-0.9, 2.4, 2.0], [0.0, 1.3, -18.0], 38);

    const b = rig.shot(T.darkness + 10.2, 8.119, {
      spline: true, ease: 'inOutSine', blend: 2.6, handheld: 0.45,
      dofScale: 1.2, focusRange: 2.2,
      focusOn: () => this.heroPos,
      label: 'reveal',
    });
    b.keyframe(0.0, [-0.9, 2.4, 2.0], [0.0, 1.3, -18.0], 38);
    b.keyframe(3.0, [-2.4, 2.2, -8.0], [0.0, 1.2, -28.0], 35);
    b.keyframe(6.0, [-2.0, 1.9, -18.0], [0.0, 1.1, -32.0], 31);
    b.keyframe(8.119, [-1.2, 1.7, -23.5], [0.0, 1.05, -33.0], 28);

    deck.fadeFrom(0.0, 3.4, [0, 0, 0]);
    deck.add({ at: 11.2, type: TRANSITION.FLASH, duration: 1.4, strength: 0.10, color: [0.5, 0.72, 1.0] });
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, cast } = ctx;
    const env = frame.env;
    const post = frame.post;

    const swell = smoothstep(0.05, 0.55, music.energy);

    setEnv(env, {
      skyZenith: [0.0016, 0.0032, 0.0110],
      skyHorizon: [0.0050, 0.0130, 0.0360],
      skyGround: [0.0006, 0.0010, 0.0040],
      skyGlow: [0.014, 0.034, 0.100],
      sunDir: [0.10, 0.62, -0.78],
      sunColor: [0.55, 0.76, 1.0],
      sunSize: 0.055,
      sunIntensity: 0.10 + swell * 0.35,
      nebula: 0.42 + swell * 0.30,
      stars: 0.55,
      horizonSharp: 0.55,

      ambientScale: 0.55 + swell * 0.40,
      keyDir: [0.22, 0.80, -0.55],
      keyColor: [0.42, 0.62, 1.0],
      keyIntensity: 0.14 + swell * 0.20,
      fillDir: [-0.6, -0.15, 0.75],
      fillColor: [0.16, 0.10, 0.34],
      fillIntensity: 0.10,
      rimColor: [0.46, 0.72, 1.0],
      rimIntensity: 0.55 + swell * 0.70,
      rimPower: 3.6,

      fogColor: [0.006, 0.011, 0.030],
      fogGlow: [0.024, 0.056, 0.150],
      fogDensity: 0.0042 - swell * 0.0009,
      fogHeight: 60,
      fogDistance: 360,
      fogSky: 0.34,
      scatterStrength: 0.55,
      scatterDistance: 320,

      particleScale: 1.0,
      beamScale: 0.75 + swell * 0.5,
      emissiveScale: 0.85 + swell * 0.5,
    });

    post.exposure = 0.85 + swell * 0.45;
    post.bloom = 0.34 + swell * 0.12;
    post.bloomThreshold = 1.02;
    post.dofStrength = 0.95;
    post.dofRadius = 0.019;
    post.chromatic = 0.30;
    post.vignette = 1.05;
    post.vignetteSoft = 0.14;
    post.grain = 0.040;
    post.saturation = 1.06;
    post.contrast = 1.10;
    post.halation = 0.07;
    post.letterbox = 0.26;
    post.tint = [0.92, 0.97, 1.10];
    post.motionBlur = 0.30;

    this.motes.emit(particles, ctx.camera.position, t, 1, 0.7 + swell * 0.9);
    this.dust.emit(particles, ctx.camera.position, t, 1, 0.6 + swell * 0.6);

    this.shards.emit(prims, t, { glow: 0.5 + swell * 0.9, count: 90 });

    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + t * 0.04;
      const r = 70 + i * 34;
      const x = Math.cos(a) * r;
      const z = -40 - Math.sin(a) * r * 0.6;
      const y = 6 + i * 9 + Math.sin(t * 0.3 + i) * 2.5;
      const pulse = 0.55 + 0.45 * Math.sin(t * (0.4 + i * 0.13) + i * 2.0);
      emitEnergyCore(prims, lights, {
        centre: [x, y, z], radius: 1.1 + i * 0.5, shells: 1,
        color: [0.42, 0.70, 1.0],
        glow: (0.8 + swell) * pulse, lightIntensity: 4.0 * pulse, lightRadius: 26,
        rate: 0.7 + i * 0.2, seed: 30 + i,
      }, t);
    }

    emitLightShaft(frame.beams.cone ? frame.beamStore : frame.beamStore, {
      origin: [8, 60, -50], direction: [-0.08, -1, 0.12], length: 110,
      radius: 12, color: [0.42, 0.66, 1.0], intensity: 0.30 + swell * 0.55,
      taper: 0.9, dustScale: 0.05, seed: 2,
    });
    emitLightShaft(frame.beamStore, {
      origin: [-22, 70, -80], direction: [0.10, -1, -0.05], length: 130,
      radius: 16, color: [0.34, 0.54, 0.96], intensity: 0.22 + swell * 0.45,
      taper: 0.9, dustScale: 0.04, seed: 8,
    });

    const reveal = smootherstep(9.0, 15.5, local);
    if (reveal > 0.002) {
      const hero = cast.take('hero', {
        glow: 0.7 + reveal * 0.9,
        opacity: 1,
        dissolve: (1 - reveal) * 0.92,
        hairStrands: 8,
      });
      if (hero) {
        this.heroPos[0] = 0 + Math.sin(t * 0.20) * 0.35;
        this.heroPos[1] = 0.35 + Math.sin(t * 0.31) * 0.22;
        this.heroPos[2] = -34;
        hero.setPosition(this.heroPos[0], this.heroPos[1], this.heroPos[2]);
        Behaviour.drifting(hero, t, { yaw: 0.55 + Math.sin(t * 0.12) * 0.4 });
        hero.emit(prims, t);

        lights.add(this.heroPos[0], this.heroPos[1] + 1.4, this.heroPos[2], 22,
          [0.42, 0.70, 1.0], 3.4 * reveal);

        emitDissolveSparks(particles, {
          centre: [this.heroPos[0], this.heroPos[1] + 1.0, this.heroPos[2]],
          radius: 1.5, count: 46, amount: (1 - reveal) * 1.4 + 0.18,
          color: [0.72, 0.88, 1.0], intensity: 2.4, size: 0.055, seed: 5,
        }, t);
      }
    }
  }
}

export class FallingSequence extends Sequence {
  constructor() {
    super({ id: 'falling', name: 'Falling', title: 'II / FALL', start: T.falling, end: T.drop, exposureTrim: 1.13 });
    this.motes = new MoteField({
      cellSize: 6.5, radius: 5, density: 0.42, size: 0.045, sizeVariation: 2.0,
      color: [0.32, 0.56, 1.0], color2: [0.90, 0.94, 1.0],
      intensity: 2.0, drift: 0.4, rise: 0, twinkle: 0.6, seed: 23,
      flow: [0, 34, 0], kind: PARTICLE_KIND.STREAK,
    });
    this.embers = new MoteField({
      cellSize: 11.0, radius: 4, density: 0.22, size: 0.13, sizeVariation: 1.3,
      color: [0.96, 0.72, 0.36], color2: [1.0, 0.90, 0.66],
      intensity: 1.1, drift: 0.3, rise: 0, twinkle: 0.5, seed: 29,
      flow: [0, 20, 0],
    });
    this.heroPos = vec3.create(0, 0, 0);
    this.trail = new Trail({ length: 26, width: 0.26, color: [0.55, 0.82, 1.0], intensity: 1.3, minStep: 0.35 });
    this.lastTrailTime = -1;
  }

  fallY(t) {

    const local = t - this.start;
    return -(14 * local + 0.75 * local * local);
  }

  build(ctx) {
    const { rig, deck } = ctx;
    const subject = () => this.heroPos;
    const s = this.start;

    const a = rig.trackShot(s, 4.2, {
      subject, ease: 'inOutSine', blend: 1.1, handheld: 0.6, dofScale: 1.0,
      fromOffset: [1.6, 1.4, 4.6], toOffset: [2.6, 0.4, 3.4],
      fromLook: [0, 1.0, 0], toLook: [0, 0.9, 0],
      fromFov: 40, toFov: 52,
      focusOn: subject, focusRange: 1.8,
      label: 'let go',
    });

    rig.trackShot(s + 4.2, 5.5, {
      subject, ease: 'linear', handheld: 0.5, blend: 0,
      fromOffset: [4.4, -1.2, 3.0], toOffset: [-3.8, 2.6, -4.2],
      fromLook: [0, 0.9, 0], toLook: [0, 1.0, 0],
      fromFov: 56, toFov: 44,
      focusOn: subject, focusRange: 2.4,
      label: 'orbit',
    });

    rig.trackShot(s + 9.7, 4.2, {
      subject, ease: 'inOutCubic', handheld: 0.55, blend: 0,
      fromOffset: [0.4, -6.5, 1.2], toOffset: [-0.6, -3.2, 0.8],
      fromLook: [0, 1.2, 0], toLook: [0, 1.4, 0],
      fromFov: 74, toFov: 62,
      focusOn: subject, focusRange: 3.0,
      label: 'below',
    });

    const far = rig.trackShot(T.fallSilence - 0.35, 5.5, {
      subject, ease: 'outQuint', handheld: 0.2, blend: 0, shakeScale: 0.2,
      fromOffset: [8, 3, 14], toOffset: [140, 62, 210],
      fromLook: [0, 1.0, 0], toLook: [0, 0, 0],
      fromFov: 48, toFov: 16,
      focusOn: subject, focusRange: 90, dofScale: 0.5,
      label: 'abandon',
    });
    void far;

    rig.trackShot(T.fallSilence + 5.15, T.drop - (T.fallSilence + 5.15), {
      subject, ease: 'inQuart', handheld: 0.9, blend: 0,
      fromOffset: [-24, -8, -30], toOffset: [-1.9, 0.2, -2.9],
      fromLook: [0, 0, 0], toLook: [0, 1.05, 0],
      fromFov: 30, toFov: 66,
      focusOn: subject, focusRange: 2.0,
      label: 'rush back',
    });

    deck.add({ at: T.fallSilence, type: TRANSITION.DARKNESS, duration: 2.6, strength: 0.72, color: [0, 0, 0] });
    deck.add({ at: 31.0, type: TRANSITION.FLASH, duration: 0.9, strength: 0.55, color: [0.62, 0.80, 1.0] });

    rig.impulse(T.falling, { shake: 0.05, fov: 3, decay: 3.8, frequency: 8 });
    rig.impulse(31.0, { shake: 0.04, fov: -3, decay: 4.4, push: 0.4, frequency: 8 });
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, cast } = ctx;
    const env = frame.env;
    const post = frame.post;

    const y = this.fallY(t);
    this.heroPos[0] = Math.sin(t * 0.42) * 0.9;
    this.heroPos[1] = y;
    this.heroPos[2] = Math.cos(t * 0.33) * 0.7;

    const silence = smoothstep(T.fallSilence, T.fallSilence + 1.6, t)
                  * (1 - smoothstep(30.6, 31.2, t));
    const returning = smoothstep(31.0, 32.4, t);
    const drive = smoothstep(0.2, 0.62, music.energy);

    setEnv(env, {
      skyZenith: [0.0020, 0.0042, 0.0140],
      skyHorizon: [0.0070, 0.0180, 0.0480],
      skyGround: [0.0010, 0.0016, 0.0060],
      skyGlow: [0.020 + drive * 0.030, 0.046 + drive * 0.050, 0.130 + drive * 0.090],
      sunDir: [0.0, 1.0, 0.0],
      sunColor: [0.72, 0.88, 1.0],
      sunSize: 0.10,
      sunIntensity: (0.55 + drive * 1.2) * (1 - silence * 0.92),
      nebula: 0.55,
      stars: 0.35,
      horizonSharp: 0.45,

      ambientScale: (0.7 + drive * 0.55) * (1 - silence * 0.80),
      keyDir: [0.0, 1.0, 0.0],
      keyColor: [0.52, 0.74, 1.0],
      keyIntensity: (0.30 + drive * 0.35) * (1 - silence * 0.85),
      fillDir: [0.0, -1.0, 0.0],
      fillColor: [0.20, 0.12, 0.40],
      fillIntensity: 0.14,
      rimColor: [0.60, 0.82, 1.0],
      rimIntensity: 0.95 + drive * 0.95 + returning * 0.60,
      rimPower: 3.0,

      fogColor: [0.007, 0.013, 0.036],
      fogGlow: [0.036, 0.080, 0.205],
      fogDensity: 0.0022 + silence * 0.0022,
      fogHeight: 400,
      fogFloor: y - 200,
      fogDistance: 700,
      fogSky: 0.26,
      scatterStrength: 0.60,
      scatterDistance: 380,

      emissiveScale: 1.0 * (1 - silence * 0.6),
      beamScale: (1.0 + drive * 0.8) * (1 - silence * 0.9),
      particleScale: (1.0 + drive * 0.6) * (1 - silence * 0.75),
    });

    post.exposure = (1.05 + drive * 0.35) * (1 - silence * 0.45);
    post.bloom = 0.38 + drive * 0.14;
    post.bloomThreshold = 1.05;
    post.dofStrength = 0.88;
    post.dofRadius = 0.017;
    post.chromatic = 0.28 + drive * 0.30;
    post.vignette = 0.95 + silence * 0.5;
    post.vignetteSoft = 0.18;
    post.grain = 0.034;
    post.saturation = 1.08;
    post.contrast = 1.08;
    post.halation = 0.06;
    post.letterbox = 0.22;
    post.motionBlur = 0.45 + drive * 0.30;
    post.motionSamples = ctx.quality.motionSamples;
    post.speedLines = (0.05 + drive * 0.18) * (1 - silence);
    post.speedLineRate = 2.4;
    post.speedLineColor = [0.62, 0.82, 1.0];
    post.radialBlur = (0.02 + drive * 0.035) * (1 - silence);
    post.tint = [0.94, 0.98, 1.10];

    this.motes.emit(particles, ctx.camera.position, t, 1, (0.8 + drive * 1.1) * (1 - silence * 0.85));
    this.embers.emit(particles, ctx.camera.position, t, 1, (0.5 + drive * 0.7) * (1 - silence * 0.9));

    const spacing = 46;
    const first = Math.ceil((y - 120) / spacing);
    for (let i = 0; i < 7; i++) {
      const ringY = (first + i) * spacing;
      const dist = ringY - y;
      if (dist < -70 || dist > 260) continue;
      const fade = smoothstep(-60, 10, dist) * (1 - smoothstep(150, 250, dist));
      const idx = Math.abs(first + i);
      const r = 16 + rand1(idx * 31) * 22;
      quat.identity(Q);
      prims.add('torus', {
        position: [Math.sin(idx * 1.7) * 6, ringY, Math.cos(idx * 2.3) * 6],
        rotation: Q,
        scale: [r, r * 0.020, r],
        kind: CINE_KIND.ENERGY,
        albedo: [0.02, 0.02, 0.03],
        emissive: idx % 3 === 0 ? [1.0, 0.72, 0.36] : [0.42, 0.74, 1.0],
        metallic: 0.2, roughness: 0.3,
        glow: (1.5 + drive * 1.6) * fade * (1 - silence * 0.9),
        opacity: clamp(fade * 1.5, 0, 1),
        seed: idx,
      });
      if (fade > 0.15) {
        lights.add(0, ringY, 0, r * 2.6, idx % 3 === 0 ? [1.0, 0.72, 0.36] : [0.42, 0.74, 1.0],
          5.0 * fade * (1 - silence * 0.9));
      }
    }

    for (let i = 0; i < 4; i++) {
      const a = i * 1.9 + t * 0.05;
      emitLightShaft(frame.beamStore, {
        origin: [Math.cos(a) * (24 + i * 9), y + 190, Math.sin(a) * (24 + i * 9)],
        direction: [0, -1, 0], length: 300, radius: 7 + i * 3.5,
        color: i % 2 ? [0.70, 0.86, 1.0] : [1.0, 0.80, 0.48],
        intensity: (0.55 + drive * 0.9) * (1 - silence * 0.95),
        taper: 0.7, dustScale: 0.03, seed: 40 + i,
      });
    }

    const hero = cast.take('hero', {
      glow: 1.15 + drive * 0.8 + returning * 0.5,
      hairStrands: 8,
          });
    if (hero) {
      hero.setPosition(this.heroPos[0], this.heroPos[1], this.heroPos[2]);
      Behaviour.falling(hero, t, {
        spin: 0.30, tumble: 0.26, pitch: -1.28 - Math.sin(local * 0.24) * 0.24,
        looseness: 1.0 + drive * 0.5,
      });
      hero.emit(prims, t);
      lights.add(this.heroPos[0], this.heroPos[1] + 1.0, this.heroPos[2], 26,
        [0.52, 0.78, 1.0], (4.0 + drive * 3.0) * (1 - silence * 0.7));

      if (ctx.dt > 0) this.trail.push(this.heroPos[0], this.heroPos[1] + 0.9, this.heroPos[2]);
      this.trail.intensity = (0.9 + drive * 1.4) * (1 - silence * 0.9);
      this.trail.emit(frame.trails, ctx.camera.position, 1, 1);

      emitDissolveSparks(particles, {
        centre: [this.heroPos[0], this.heroPos[1] + 0.9, this.heroPos[2]],
        radius: 1.9, count: 40, amount: 0.5 + drive * 0.8,
        color: [0.78, 0.90, 1.0], intensity: 2.2, size: 0.05, seed: 9,
      }, t);
    }
  }
}

export class MemorySequence extends Sequence {
  constructor() {
    super({ id: 'memory', name: 'Memory', title: 'III / FRAGMENTS', start: T.memory, end: T.station, exposureTrim: 1.15 });
    this.field = new MemoryField({
      count: 96, seed: 41, radius: 74, height: 52, centre: [0, 8, 0],
      sizeMin: 1.8, sizeMax: 8.5, drift: 0.26,
    });
    this.motes = new MoteField({
      cellSize: 7.0, radius: 5, density: 0.36, size: 0.042, sizeVariation: 1.8,
      color: [0.90, 0.74, 0.42], color2: [0.62, 0.84, 1.0],
      intensity: 1.8, drift: 0.35, rise: 0.55, twinkle: 0.65, seed: 53,
    });
    this.shards = new ShardField({
      count: 150, seed: 61, radius: 110, height: 70, centre: [0, 6, 0],
      sizeMin: 0.35, sizeMax: 2.6, spin: 0.30, drift: 0.5,
      albedo: [0.10, 0.14, 0.24], emissive: [0.72, 0.86, 1.0], glow: 1.0,
    });
    this.heroPos = vec3.create(0, 6, 0);
    this.bursts = [];
  }

  build(ctx) {
    const { rig, deck, sync } = ctx;
    const s = this.start;

    const a = rig.shot(s, 6.4, {
      spline: true, ease: 'outQuart', handheld: 0.5, blend: 0,
      dofScale: 1.0, focusRange: 8,
      label: 'burst out',
    });
    a.keyframe(0.0, [0, 8, 4], [0, 8, -30], 96);
    a.keyframe(2.4, [4, 10, -18], [2, 9, -46], 66);
    a.keyframe(4.6, [-6, 13, -34], [-2, 10, -58], 56);
    a.keyframe(6.4, [-14, 11, -48], [-6, 9, -70], 52);

    const b = rig.shot(s + 6.4, 12.0, {
      spline: true, ease: 'inOutSine', blend: 1.4, handheld: 0.45,
      tension: 0.42, dofScale: 1.15, focusRange: 6,
      label: 'weave',
    });
    b.keyframe(0.0, [-14, 11, -48], [-6, 9, -70], 52);
    b.keyframe(2.6, [-30, 6, -34], [-12, 8, -34], 48);
    b.keyframe(5.2, [-26, 2, -6], [-8, 7, -6], 46);
    b.keyframe(7.8, [-6, 5, 20], [-2, 9, 4], 50);
    b.keyframe(10.0, [16, 12, 24], [4, 10, 4], 54);
    b.keyframe(12.0, [30, 16, 8], [6, 10, -2], 50);

    rig.orbit(s + 18.4, 9.2, {
      centre: [0, 9, 0], blend: 1.8, ease: 'inOutSine', handheld: 0.35,
      fromAngle: 0.4, toAngle: 1.5, fromRadius: 108, toRadius: 78,
      fromHeight: 34, toHeight: 12, lookHeight: 6,
      fromFov: 44, toFov: 52, focusRange: 34, dofScale: 0.85,
      label: 'wide turn',
    });

    const c = rig.shot(s + 27.6, 8.191, {
      spline: true, ease: 'inOutCubic', blend: 0, handheld: 0.6,
      dofScale: 1.35, focusRange: 2.6,
      focusOn: () => this.heroPos,
      label: 'one memory',
    });
    c.keyframe(0.0, [7.5, 7.5, 11.0], [1.0, 6.6, 1.5], 40);
    c.keyframe(3.2, [4.2, 6.9, 7.4], [0.6, 6.4, 0.8], 36);
    c.keyframe(5.8, [2.4, 6.6, 5.2], [0.2, 6.3, 0.2], 32);
    c.keyframe(8.191, [1.2, 6.4, 3.6], [0.0, 6.2, -0.4], 30);

    deck.add({ at: T.drop, type: TRANSITION.FLASH, duration: 1.5, strength: 1.55, color: [1.0, 0.97, 0.92] });
    deck.add({
      at: T.station - 0.85, type: TRANSITION.BLOOM_OUT, duration: 0.85,
      color: [0.92, 0.96, 1.0], softness: 0.30, ease: 'inQuad',
    });

    const beats = sync.impactsIn(s + 2, this.end - 2, 0.30);
    let last = -99;
    for (const imp of beats) {
      if (imp.time - last < 8.0) continue;
      last = imp.time;
      this.bursts.push(imp.time);
    }

    rig.impulse(T.drop, { shake: 0.30, fov: 12, decay: 4.6, push: -1.6, frequency: 9 });
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, cast } = ctx;
    const env = frame.env;
    const post = frame.post;

    const open = smoothstep(0, 2.2, local);
    const drive = smoothstep(0.45, 0.92, music.energy);

    let explode = 0;
    for (const b of this.bursts) {
      const age = t - b;
      if (age < 0 || age > 2.4) continue;
      explode = Math.max(explode, Ease.outQuart(clamp(age / 0.55, 0, 1)) * (1 - smoothstep(0.6, 2.4, age)) * 0.30);
    }
    const converge = 0;

    setEnv(env, {
      skyZenith: [0.010, 0.016, 0.040],
      skyHorizon: [0.026, 0.031, 0.058],
      skyGround: [0.004, 0.006, 0.016],
      skyGlow: [0.062, 0.050, 0.088],
      sunDir: [0.35, 0.55, -0.76],
      sunColor: [1.0, 0.88, 0.70],
      sunSize: 0.045,
      sunIntensity: 0.85 + drive * 0.9,
      nebula: 0.55,
      stars: 0.30,
      horizonSharp: 0.6,

      ambientScale: 1.15 + drive * 0.4,
      keyDir: [0.32, 0.72, -0.62],
      keyColor: [1.0, 0.86, 0.66],
      keyIntensity: 0.45 + drive * 0.35,
      fillDir: [-0.55, -0.25, 0.78],
      fillColor: [0.22, 0.32, 0.68],
      fillIntensity: 0.22,
      rimColor: [0.78, 0.88, 1.0],
      rimIntensity: 1.10,
      rimPower: 3.0,

      fogColor: [0.014, 0.018, 0.038],
      fogGlow: [0.118, 0.102, 0.174],
      fogDensity: 0.0013,
      fogHeight: 120,
      fogDistance: 840,
      fogSky: 0.22,
      scatterStrength: 0.45,
      scatterDistance: 420,

      energy: drive * 0.5,
      emissiveScale: 1.05 + drive * 0.35,
      particleScale: 1.1 + drive * 0.5,
    });

    post.exposure = 1.04 + drive * 0.14;
    post.bloom = 0.36 + drive * 0.12;
    post.bloomThreshold = 1.10;
    post.dofStrength = 0.80;
    post.dofRadius = 0.016;
    post.chromatic = 0.30;
    post.vignette = 0.80;
    post.vignetteSoft = 0.24;
    post.grain = 0.030;
    post.saturation = 1.16;
    post.contrast = 1.06;
    post.halation = 0.09;
    post.letterbox = 0.20;
    post.motionBlur = 0.46;
    post.motionSamples = ctx.quality.motionSamples;
    post.tint = [1.02, 0.99, 1.02];
    post.speedLines = 0;
    post.radialBlur = 0;
    post.radialCentre = [0.5, 0.5];

    this.field.emit(prims, lights, t, {
      glow: (0.9 + drive * 0.7) * open,
      explode,
      converge,
      swirl: 0.012,
      opacity: open,
      count: ctx.quality.memoryPanels,
    });

    this.shards.emit(prims, t, {
      glow: (0.8 + drive * 0.9) * open,
      explode: explode * 0.6,
      count: ctx.quality.shards,
    });

    this.motes.emit(particles, ctx.camera.position, t, 1, (0.9 + drive * 0.8) * open);

    const heroPhase = local * 0.16;
    this.heroPos[0] = Math.sin(heroPhase * 2.1) * 6.0;
    this.heroPos[1] = 6.2 + Math.sin(heroPhase * 1.4) * 2.4;
    this.heroPos[2] = Math.cos(heroPhase * 1.7) * 5.0;
    const hero = cast.take('hero', { glow: 1.2 + drive * 0.5, hairStrands: 8 });
    if (hero) {
      hero.setPosition(this.heroPos[0], this.heroPos[1], this.heroPos[2]);
      Behaviour.drifting(hero, t, { yaw: heroPhase * 1.1 });
      hero.emit(prims, t);
      lights.add(this.heroPos[0], this.heroPos[1] + 1.2, this.heroPos[2], 24,
        [0.62, 0.82, 1.0], 4.2);
    }

    emitLightShaft(frame.beamStore, {
      origin: [40, 120, -20], direction: [-0.28, -1, 0.14], length: 220,
      radius: 22, color: [1.0, 0.88, 0.66], intensity: 0.55 + drive * 0.7,
      taper: 0.8, dustScale: 0.03, seed: 71,
    });
    emitLightShaft(frame.beamStore, {
      origin: [-52, 130, 30], direction: [0.22, -1, -0.18], length: 240,
      radius: 26, color: [0.62, 0.82, 1.0], intensity: 0.45 + drive * 0.6,
      taper: 0.8, dustScale: 0.03, seed: 73,
    });
  }
}

export class StationSequence extends Sequence {
  constructor() {
    super({ id: 'station', name: 'Station', title: 'IV / AWAKENING', start: T.station, end: T.montage, exposureTrim: 0.96 });
    this.motes = new MoteField({
      cellSize: 8.0, radius: 5, density: 0.30, size: 0.05, sizeVariation: 1.6,
      color: [1.0, 0.82, 0.48], color2: [0.66, 0.86, 1.0],
      intensity: 1.5, drift: 0.24, rise: 0.42, twinkle: 0.55, seed: 83,
    });
    this.centre = [0, 0, 0];
    this.radius = 26;
    this.heroPos = vec3.create(0, 0, 0);
  }

  build(ctx) {
    const { rig, deck } = ctx;
    const s = this.start;

    const a = rig.shot(s, 8.256, {
      spline: true, ease: 'outCubic', handheld: 0.4, blend: 0,
      dofScale: 0.9, focusRange: 16,
      label: 'rise',
    });
    a.keyframe(0.0, [0, -46, 44], [0, -6, 0], 58);
    a.keyframe(3.2, [4, -18, 40], [0, 0, 0], 52);
    a.keyframe(6.0, [8, 2, 34], [0, 1.4, 0], 46);
    a.keyframe(8.256, [10, 9, 27], [0, 1.6, 0], 42);

    rig.orbit(T.stationIgnite, 10.6, {
      centre: [0, 1.2, 0], blend: 0.9, ease: 'inOutSine', handheld: 0.35,
      fromAngle: 0.9, toAngle: 2.55, fromRadius: 30, toRadius: 20,
      fromHeight: 11, toHeight: 3.4, lookHeight: 1.4,
      fromFov: 44, toFov: 50, focusRange: 12,
      label: 'ignite orbit',
    });

    const c = rig.shot(T.stationIgnite + 10.6, 4.4, {
      spline: false, ease: 'inOutCubic', blend: 0, handheld: 0.25,
      dofScale: 0.5, focusRange: 40,
      label: 'top down',
    });
    c.keyframe(0.0, [0, 46, 0.01], [0, 0, 0], 56, { roll: 0 });
    c.keyframe(4.4, [0, 30, 0.01], [0, 0, 0], 62, { roll: 0.42 });

    const d = rig.shot(T.stationIgnite + 15.0, T.montage - (T.stationIgnite + 15.0), {
      spline: true, ease: 'inCubic', blend: 0, handheld: 0.55,
      dofScale: 1.25, focusRange: 2.4, focusOn: () => this.heroPos,
      label: 'push to hero',
    });
    d.keyframe(0.0, [7.0, 1.4, 9.5], [0, 1.5, 0], 46);
    d.keyframe(1.9, [4.2, 1.2, 6.2], [0, 1.5, 0], 40);
    d.keyframe(3.163, [2.4, 1.3, 3.8], [0, 1.6, 0], 34);

    deck.add({ at: T.stationIgnite, type: TRANSITION.FLASH, duration: 1.1, strength: 0.95, color: [1.0, 0.90, 0.66] });
    rig.impulse(T.stationIgnite, { shake: 0.13, fov: 6, decay: 5.0, frequency: 8 });
    rig.impulse(T.station, { shake: 0.05, fov: 2, decay: 4.4, frequency: 8 });
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, cast } = ctx;
    const env = frame.env;
    const post = frame.post;

    const build = smootherstep(0.8, T.stationIgnite - T.station + 0.6, local);
    const ignite = smootherstep(T.stationIgnite, T.stationIgnite + 1.4, t);
    const drive = smoothstep(0.45, 0.92, music.energy);

    setEnv(env, {
      skyZenith: [0.0022, 0.0034, 0.0090],
      skyHorizon: [0.008, 0.010, 0.024],
      skyGround: [0.0008, 0.0010, 0.0026],
      skyGlow: [0.044 + ignite * 0.068, 0.034 + ignite * 0.044, 0.062 + ignite * 0.044],
      sunDir: [0.0, -1.0, 0.0],
      sunColor: [1.0, 0.84, 0.52],
      sunSize: 0.02,
      sunIntensity: 0.0,
      nebula: 0.30,
      stars: 0.55,
      horizonSharp: 0.8,

      ambientScale: 0.42 + ignite * 0.34,
      keyDir: [0.20, 0.86, -0.46],
      keyColor: [1.0, 0.86, 0.60],
      keyIntensity: 0.16 + ignite * 0.26,
      fillDir: [0.0, 1.0, 0.0],
      fillColor: [0.30, 0.44, 0.86],
      fillIntensity: 0.10 + ignite * 0.22,
      rimColor: [1.0, 0.86, 0.60],
      rimIntensity: 0.86 + ignite * 1.00,
      rimPower: 2.6,

      fogColor: [0.006, 0.008, 0.018],
      fogGlow: [0.095, 0.071, 0.103],
      fogDensity: 0.0016,
      fogHeight: 46,
      fogFloor: -6,
      fogDistance: 600,
      fogSky: 0.10,
      scatterStrength: 0.70,
      scatterDistance: 300,

      energy: ignite * 0.7,
      emissiveScale: 0.9 + ignite * 0.5,
      beamScale: 0.8 + ignite * 0.9,
    });

    post.exposure = 0.94 + ignite * 0.18;
    post.bloom = 0.34 + ignite * 0.16;
    post.bloomThreshold = 1.00;
    post.dofStrength = 0.86;
    post.dofRadius = 0.016;
    post.chromatic = 0.24;
    post.vignette = 1.00;
    post.vignetteSoft = 0.18;
    post.grain = 0.030;
    post.saturation = 1.14;
    post.contrast = 1.08;
    post.halation = 0.10;
    post.letterbox = 0.20;
    post.motionBlur = 0.50;
    post.motionSamples = ctx.quality.motionSamples;
    post.tint = [1.03, 0.99, 0.97];

    emitStation(prims, lights, {
      centre: this.centre,
      radius: this.radius,
      build,
      glow: 1.1 + ignite * 1.4,
      segments: 16,
      halo: 3,
      rotation: t * 0.012,
      warm: [1.0, 0.78, 0.38],
      cool: [0.34, 0.68, 1.0],
      lightIntensity: 3.0 + ignite * 4.0,
    }, t);

    emitLightShaft(frame.beamStore, {
      origin: [0, 130, 0], direction: [0, -1, 0], length: 132,
      radius: 12 + ignite * 8, color: [1.0, 0.90, 0.68],
      intensity: 0.5 + ignite * 1.5,
      taper: 0.6, dustScale: 0.035, seed: 91,
    });

    emitMagicCircle(prims, {
      centre: [0, 12 + Math.sin(t * 0.4) * 0.8, 0],
      radius: this.radius * 0.72 * build,
      layers: 3, spacing: 2.4, spin: 0.16,
      color: [1.0, 0.84, 0.46], emissive: [0.40, 0.72, 1.0],
      glow: (0.9 + ignite * 1.1) * build, opacity: build, seed: 5,
    }, t);

    this.motes.emit(particles, ctx.camera.position, t, 1, 0.8 + ignite * 0.8);

    for (let i = 0; i < ctx.quality.stationSparks; i++) {
      const a = rand1(i * 17 + 3) * TAU;
      const r = Math.sqrt(rand1(i * 29 + 7)) * this.radius;
      const cycle = (t * 0.28 + rand1(i * 13 + 11)) % 1;
      const y = cycle * 22;
      const fade = Math.sin(cycle * Math.PI);
      particles.add(
        Math.cos(a) * r, y, Math.sin(a) * r,
        0.05 + rand1(i * 19) * 0.06,
        1.0, 0.86, 0.54,
        2.2 * fade * build * (0.8 + ignite * 0.6),
        a + t, 0.5, PARTICLE_KIND.SPARK, i);
    }

    this.heroPos[0] = 0;
    this.heroPos[1] = 0;
    this.heroPos[2] = 0;
    const hero = cast.take('hero', {
      glow: 1.0 + ignite * 0.9, hairStrands: 9,
      weapon: local > (T.stationIgnite - T.station) ? 'key' : null,
      weaponColor: [1.0, 0.92, 0.72],
    });
    if (hero) {
      hero.setPosition(0, 0, 0);
      if (local < T.stationIgnite - T.station) {
        Behaviour.standing(hero, t, { yaw: 0.4 });
      } else {
        Behaviour.reaching(hero, t, {
          yaw: 0.4 - (t - T.stationIgnite) * 0.06,
          amount: smoothstep(T.stationIgnite, T.stationIgnite + 2.6, t) * 0.85,
          lookUp: 0.24,
        });
      }
      hero.emit(prims, t);
      lights.add(0, 1.6, 0, 20, [1.0, 0.90, 0.70], 4.0 + ignite * 4.0);
    }

    const witnesses = Math.round(ctx.quality.crowd * 0.35);
    if (ignite > 0.05 && witnesses > 0) {
      emitCircle(cast, prims, t, {
        centre: [0, 0, 0], radius: this.radius * 0.74, count: witnesses,
        style: 'chorus', glow: 0.55 + ignite * 0.55, rotation: t * 0.02,
        weaponColor: [0.62, 0.82, 1.0], seed: 7,
      });
    }

    void drive;
  }
}

const MONTAGE_SHOTS = [

  { bars: 1.0, kind: 'charge', label: 'charge, low' },
  { bars: 1.0, kind: 'clash', label: 'first clash' },
  { bars: 0.5, kind: 'closeBlade', label: 'blade, close' },
  { bars: 0.5, kind: 'dodge', label: 'dodge' },
  { bars: 1.0, kind: 'horde', label: 'the horde' },
  { bars: 1.0, kind: 'leap', label: 'leap over' },
  { bars: 0.5, kind: 'whipPan', label: 'whip' },
  { bars: 1.5, kind: 'clash', label: 'clash again' },
  { bars: 1.0, kind: 'standoff', label: 'standoff' },
  { bars: 0.5, kind: 'closeEye', label: 'close, held' },
  { bars: 1.0, kind: 'swarm', label: 'swarmed' },
  { bars: 1.0, kind: 'strikeDown', label: 'struck down' },
  { bars: 0.5, kind: 'whipPan', label: 'whip back' },
  { bars: 1.0, kind: 'charge', label: 'charge again' },
  { bars: 1.5, kind: 'clash', label: 'the big one' },
  { bars: 1.0, kind: 'rise', label: 'back up' },
  { bars: 1.0, kind: 'backToBack', label: 'back to back' },
  { bars: 1.0, kind: 'wideWar', label: 'the whole field' },
  { bars: 1.0, kind: 'leap', label: 'up and over' },
  { bars: 1.0, kind: 'finalClash', label: 'last exchange' },
  { bars: 2.0, kind: 'holdWide', label: 'hold' },
];

export class MontageSequence extends Sequence {
  constructor() {
    super({ id: 'montage', name: 'Montage', title: 'V / CLASH', start: T.montage, end: T.shatter, exposureTrim: 1.11 });
    this.shots = [];
    this.motes = new MoteField({
      cellSize: 6.0, radius: 4, density: 0.30, size: 0.05, sizeVariation: 1.8,
      color: [1.0, 0.58, 0.30], color2: [0.60, 0.84, 1.0],
      intensity: 1.6, drift: 0.6, rise: 0.3, twinkle: 0.8, seed: 101,
    });
    this.pool = new ParticlePool(6000);
    this.impacts = [];
    this.lastBurst = -99;
    this.clash = vec3.create();
  }

  build(ctx) {
    const { rig, deck, sync } = ctx;
    const bar = sync.analysis.barPeriod;
    let cursor = this.start;

    for (let i = 0; i < MONTAGE_SHOTS.length; i++) {
      const spec = MONTAGE_SHOTS[i];
      const length = spec.bars * bar;
      if (cursor >= this.end - 0.05) break;
      const clipped = Math.min(length, this.end - cursor);
      const shot = { start: cursor, length: clipped, kind: spec.kind, index: i, seed: i * 31 + 7 };
      this.shots.push(shot);
      this.buildShotCamera(rig, shot);
      cursor += length;
    }

    const found = sync.impactsIn(this.start, this.end, 0.33);
    let last = -99;
    for (const imp of found) {
      if (imp.time - last < 3.2) continue;
      last = imp.time;
      this.impacts.push(imp);
      rig.impulse(imp.time, {
        shake: 0.05 + imp.strength * 0.16,
        fov: 2 + imp.strength * 5,
        decay: 8.0,
        frequency: 9,
      });
    }

    deck.add({ at: this.start, type: TRANSITION.FLASH, duration: 0.5, strength: 1.0, color: [1.0, 0.96, 0.90] });
  }

  buildShotCamera(rig, shot) {
    const seed = shot.seed;
    const r = (n) => rand1(seed * 13 + n * 71);
    const opts = {
      blend: 0, handheld: 0.85, shakeScale: 1.25,
      dofScale: 1.0, focusRange: 3.0, label: shot.kind,
    };

    switch (shot.kind) {
      case 'charge': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, { ease: 'inQuad', spline: false }));
        const side = r(1) > 0.5 ? 1 : -1;
        s.keyframe(0, [side * 5.5, 0.7, 9.0], [0, 1.3, 1.0], 62);
        s.keyframe(shot.length, [side * 1.6, 0.5, 2.4], [0, 1.2, 0.4], 74);
        break;
      }
      case 'clash':
      case 'finalClash': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'outQuart', spline: false, focusRange: 2.0,
          focusOn: () => this.clash,
        }));
        const side = r(2) > 0.5 ? 1 : -1;
        const high = r(3) > 0.6;
        s.keyframe(0, [side * 4.4, high ? 3.6 : 0.9, 4.2], [0, 1.5, 0], 44, { roll: side * 0.14 });
        s.keyframe(shot.length, [side * 2.2, high ? 2.4 : 1.2, 2.4], [0, 1.5, 0], 52, { roll: side * -0.10 });
        break;
      }
      case 'closeBlade': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'linear', spline: false, dofScale: 1.6, focusRange: 0.7,
        }));
        s.keyframe(0, [0.9, 1.7, 1.5], [0, 1.55, 0.1], 34, { roll: 0.30 });
        s.keyframe(shot.length, [0.4, 1.6, 1.1], [0, 1.5, 0.1], 32, { roll: 0.16 });
        break;
      }
      case 'closeEye': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'linear', spline: false, dofScale: 1.7, focusRange: 0.5, handheld: 0.55,
        }));
        s.keyframe(0, [0.55, 1.78, 1.05], [0, 1.72, 0], 30);
        s.keyframe(shot.length, [0.42, 1.76, 0.86], [0, 1.72, 0], 29);
        break;
      }
      case 'dodge': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, { ease: 'outQuad', spline: false }));
        s.keyframe(0, [-2.6, 1.9, 3.4], [0.4, 1.4, 0], 54, { roll: -0.24 });
        s.keyframe(shot.length, [2.8, 1.2, 2.8], [-0.3, 1.4, 0], 58, { roll: 0.22 });
        break;
      }
      case 'whipPan': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'inOutQuart', spline: false, handheld: 1.4, shakeScale: 1.6,
        }));
        const dir = r(4) > 0.5 ? 1 : -1;
        s.keyframe(0, [0, 2.0, 6.0], [-dir * 14, 2.2, -2.0], 70);
        s.keyframe(shot.length, [0, 2.0, 6.0], [dir * 14, 1.6, -2.0], 70);
        break;
      }
      case 'horde':
      case 'swarm': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'inOutSine', spline: false, focusRange: 7,
        }));
        s.keyframe(0, [0.5, 0.9, 7.5], [0, 1.4, -6], 60);
        s.keyframe(shot.length, [-1.8, 2.4, 5.0], [0, 1.4, -8], 66);
        break;
      }
      case 'leap': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'outCubic', spline: false, focusRange: 4,
        }));
        s.keyframe(0, [3.0, 0.2, 5.4], [0, 2.4, 0], 66, { roll: -0.12 });
        s.keyframe(shot.length, [2.2, 4.6, 4.4], [0, 2.0, 0], 58, { roll: 0.10 });
        break;
      }
      case 'standoff': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'inOutSine', spline: false, handheld: 0.55, focusRange: 4,
        }));
        s.keyframe(0, [0.0, 1.5, 8.5], [0, 1.4, 0], 42);
        s.keyframe(shot.length, [1.4, 1.5, 7.2], [0, 1.4, 0], 40);
        break;
      }
      case 'strikeDown': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'outQuart', spline: false, focusRange: 2.4,
        }));
        s.keyframe(0, [2.4, 3.4, 3.0], [0, 1.0, 0], 52, { roll: 0.18 });
        s.keyframe(shot.length, [1.6, 0.9, 2.6], [0, 0.7, 0], 60, { roll: -0.14 });
        break;
      }
      case 'rise': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'outCubic', spline: false, focusRange: 3,
        }));
        s.keyframe(0, [1.9, 0.35, 3.2], [0, 0.6, 0], 58);
        s.keyframe(shot.length, [2.4, 1.9, 3.6], [0, 1.5, 0], 48);
        break;
      }
      case 'backToBack': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'inOutSine', spline: false, handheld: 0.5, focusRange: 4,
        }));
        s.keyframe(0, [6.5, 1.6, 6.5], [0, 1.4, 0], 44);
        s.keyframe(shot.length, [-6.5, 1.9, 6.0], [0, 1.4, 0], 44);
        break;
      }
      case 'wideWar': {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'inOutSine', spline: false, handheld: 0.4, focusRange: 20, dofScale: 0.6,
        }));
        s.keyframe(0, [16, 7.5, 26], [0, 2.0, -4], 46);
        s.keyframe(shot.length, [8, 5.0, 20], [0, 2.0, -4], 44);
        break;
      }
      default: {
        const s = rig.shot(shot.start, shot.length, Object.assign({}, opts, {
          ease: 'inOutSine', spline: false, handheld: 0.4, focusRange: 12, dofScale: 0.7,
        }));
        s.keyframe(0, [10, 4.4, 16], [0, 1.8, 0], 48);
        s.keyframe(shot.length, [6, 3.2, 12], [0, 1.6, 0], 46);
        break;
      }
    }
  }

  shotAt(t) {
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      if (t >= s.start && t < s.start + s.length) return s;
    }
    return this.shots[this.shots.length - 1] || null;
  }

  update(ctx) {
    const { t, frame, music, prims, lights, particles, cast, dt } = ctx;
    const env = frame.env;
    const post = frame.post;
    const shot = this.shotAt(t);
    const local = shot ? (t - shot.start) / Math.max(shot.length, 1e-4) : 0;

    const drive = smoothstep(0.55, 0.95, music.energy);

    setEnv(env, {
      skyZenith: [0.010, 0.008, 0.020],
      skyHorizon: [0.030, 0.013, 0.019],
      skyGround: [0.004, 0.003, 0.008],
      skyGlow: [0.078, 0.030, 0.038],
      sunDir: [-0.35, 0.42, -0.84],
      sunColor: [1.0, 0.58, 0.34],
      sunSize: 0.06,
      sunIntensity: 0.40,
      nebula: 0.62,
      stars: 0.12,
      horizonSharp: 0.55,

      ambientScale: 0.95 + drive * 0.35,
      keyDir: [-0.32, 0.66, -0.68],
      keyColor: [1.0, 0.66, 0.44],
      keyIntensity: 0.42 + drive * 0.30,
      fillDir: [0.60, -0.10, 0.79],
      fillColor: [0.28, 0.44, 0.92],
      fillIntensity: 0.30,
      rimColor: [1.0, 0.80, 0.62],
      rimIntensity: 1.32 + drive * 0.34,
      rimPower: 2.6,

      fogColor: [0.016, 0.010, 0.020],
      fogGlow: [0.170, 0.068, 0.082],
      fogDensity: 0.0012,
      fogHeight: 26,
      fogFloor: -1.5,
      fogDistance: 360,
      fogSky: 0.16,
      scatterStrength: 0.58,
      scatterDistance: 200,

      energy: 0.5 + drive * 0.6,
      emissiveScale: 1.15,
      particleScale: 1.2,
      trailScale: 1.5,
    });

    post.exposure = 1.02;
    post.bloom = 0.40;
    post.bloomThreshold = 1.16;
    post.dofStrength = 0.72;
    post.dofRadius = 0.014;
    post.chromatic = 0.36 + music.impact * 0.18;
    post.vignette = 0.92;
    post.vignetteSoft = 0.22;
    post.grain = 0.036;
    post.saturation = 1.20;
    post.contrast = 1.11;
    post.halation = 0.11;
    post.letterbox = 0.18;
    post.gateWeave = 1.1;
    post.motionBlur = 0.78;
    post.motionSamples = ctx.quality.motionSamples;
    post.speedLines = 0.10 + music.impact * 0.14;
    post.speedLineRate = 3.4;
    post.speedLineColor = [1.0, 0.86, 0.72];
    post.radialBlur = 0.025 + music.impact * 0.05;
    post.radialCentre = [0.5, 0.48];
    post.tint = [1.05, 0.98, 0.96];

    emitVoidFloor(prims, {
      centre: [0, 0, 0], size: 900, thickness: 6,
      albedo: [0.020, 0.014, 0.020],
      emissive: [0.42, 0.16, 0.20],
      metallic: 0.55, roughness: 0.30, glow: 0.10,
      seed: 3,
    });

    this.motes.emit(particles, ctx.camera.position, t, 1, 0.9 + drive * 0.7);
    emitSpeedStreaks(particles, ctx.camera, {
      count: ctx.quality.speedStreaks, color: [1.0, 0.78, 0.56],
      intensity: 0.9 + music.impact * 0.5, speed: 2.2, size: 0.45,
      innerRadius: 3.0, outerRadius: 20, near: 2.5, far: 46, seed: 7,
    }, t);

    if (shot) this.blockShot(ctx, shot, local, t);

    this.pool.update(dt, t);
    for (const imp of this.impacts) {
      if (imp.time > this.lastBurst && imp.time <= t && t - imp.time < 0.12) {
        this.lastBurst = imp.time;
        this.pool.burst({
          x: this.clash[0], y: this.clash[1] || 1.6, z: this.clash[2],
          count: Math.round(40 + imp.strength * 200),
          speedMin: 6, speedMax: 22 + imp.strength * 40,
          lifeMin: 0.3, lifeMax: 1.1,
          sizeMin: 0.05, sizeMax: 0.26,
          color: [1.0, 0.86, 0.62], color2: [1.0, 0.50, 0.28],
          intensity: 3.4, drag: 2.2, gravity: -6,
          kind: PARTICLE_KIND.SPARK, radius: 0.4,
        });
      }
    }
    this.pool.emit(particles, t);
  }

  blockShot(ctx, shot, p, t) {
    const { prims, lights, cast, music, particles } = ctx;
    const seed = shot.seed;
    const yaw = rand1(seed * 7) * TAU;

    vec3.set(this.clash, 0, 1.6, 0);

    switch (shot.kind) {
      case 'charge': {
        const c = cast.take('hero', { weapon: 'key', glow: 1.4, weaponColor: [0.86, 0.94, 1.0] });
        if (c) {
          c.setPosition(0, 0, lerp(-2.5, 1.5, p));
          Behaviour.running(c, t, { rate: 11.5, yaw: 0 });
          c.emit(prims, t);
          lights.add(c.position[0], 1.4, c.position[2], 14, [0.7, 0.86, 1.0], 5.0);
          this.emitBladeTrail(ctx, c, [0.72, 0.90, 1.0]);
        }
        emitHorde(cast, prims, t, {
          centre: [0, 0, -12], count: Math.round(ctx.quality.crowd * 0.5),
          spacing: 2.6, rowDepth: 3.4, perRow: 6, yaw: Math.PI,
          glow: 0.8, seed: seed, weaponColor: [1.0, 0.36, 0.26],
        });
        break;
      }
      case 'clash':
      case 'finalClash': {
        const pair = duel(cast, {
          centre: [0, 0, 0], yaw, separation: lerp(3.4, 1.7, Ease.outQuart(p)),
          lunge: 1.3, rivalStruck: shot.kind === 'finalClash' && p > 0.5,
          knockback: 2.2, glow: 1.4,
          heroWeaponColor: [0.84, 0.94, 1.0], rivalWeaponColor: [1.0, 0.44, 0.26],
        }, t, clamp(p * 1.15, 0, 1));
        if (pair) {
          clashPoint(this.clash, pair);
          pair.a.emit(prims, t);
          pair.b.emit(prims, t);
          this.emitBladeTrail(ctx, pair.a, [0.80, 0.92, 1.0]);
          this.emitBladeTrail(ctx, pair.b, [1.0, 0.48, 0.28]);
          lights.add(this.clash[0], this.clash[1], this.clash[2], 20,
            [1.0, 0.90, 0.74], 6 + Ease.punch(p) * 26);
        }
        break;
      }
      case 'closeBlade': {
        const c = cast.take('hero', { weapon: 'key', glow: 1.6, weaponLength: 1.3, weaponColor: [0.90, 0.96, 1.0] });
        if (c) {
          c.setPosition(0, 0, 0);
          Behaviour.attacking(c, clamp(p, 0, 1), { yaw: 0.3, lunge: 0.4, origin: [0, 0, 0] });
          c.emit(prims, t);
          if (c.weaponTip) vec3.copy(this.clash, c.weaponTip);
          this.emitBladeTrail(ctx, c, [0.88, 0.95, 1.0], 2.2);
          lights.add(this.clash[0], this.clash[1], this.clash[2], 12, [0.86, 0.94, 1.0], 14);
        }
        break;
      }
      case 'closeEye': {
        const c = cast.take('hero', { glow: 1.5, hairStrands: 9 });
        if (c) {
          c.setPosition(0, 0, 0);
          Behaviour.standing(c, t, { yaw: 0.16 });
          c.emit(prims, t);
          lights.add(0.6, 1.75, 0.8, 6, [0.9, 0.94, 1.0], 9);
          lights.add(-0.7, 1.6, -0.5, 6, [1.0, 0.52, 0.34], 6);
          vec3.set(this.clash, 0, 1.72, 0);
        }
        break;
      }
      case 'dodge': {
        const c = cast.take('hero', { weapon: 'key', glow: 1.4 });
        if (c) {
          c.setPosition(lerp(-1.4, 1.4, p), 0, 0);
          Behaviour.attacking(c, clamp(0.28 + p * 0.4, 0, 1), { yaw: 1.2, lunge: 0.5, origin: [lerp(-1.4, 1.4, p), 0, 0] });
          c.emit(prims, t);
          this.emitBladeTrail(ctx, c, [0.80, 0.92, 1.0]);
        }
        const e = cast.take('rival', { weapon: 'blade', glow: 1.2, weaponColor: [1.0, 0.42, 0.26] });
        if (e) {
          e.setPosition(0, 0, -2.2);
          Behaviour.attacking(e, clamp(p * 1.2, 0, 1), { yaw: 0, lunge: 1.8, origin: [0, 0, -2.2] });
          e.emit(prims, t);
          this.emitBladeTrail(ctx, e, [1.0, 0.46, 0.28]);
          if (e.weaponTip) vec3.copy(this.clash, e.weaponTip);
        }
        break;
      }
      case 'horde':
      case 'swarm': {
        emitHorde(cast, prims, t, {
          centre: [0, 0, -8], count: ctx.quality.crowd,
          spacing: 2.2, rowDepth: 3.0, perRow: 7, yaw: 0,
          glow: 0.9, seed, weaponColor: [1.0, 0.34, 0.24],
          advance: 0.0,
        });
        const c = cast.take('hero', { weapon: 'key', glow: 1.5 });
        if (c) {
          c.setPosition(0, 0, 2.2);
          Behaviour.attacking(c, clamp(p, 0, 1), { yaw: 0, lunge: 0.8, origin: [0, 0, 2.2] });
          c.emit(prims, t);
          this.emitBladeTrail(ctx, c, [0.84, 0.94, 1.0], 2.0);
          if (c.weaponTip) vec3.copy(this.clash, c.weaponTip);
        }
        break;
      }
      case 'leap': {
        const h = Ease.outQuad(p) * 4.2 - Ease.inQuad(p) * 1.2;
        const c = cast.take('hero', { weapon: 'key', glow: 1.5 });
        if (c) {
          c.setPosition(0, Math.max(0, h), lerp(-1.5, 1.5, p));
          Behaviour.attacking(c, clamp(0.2 + p * 0.65, 0, 1), { yaw: 0, lunge: 0, origin: [0, Math.max(0, h), lerp(-1.5, 1.5, p)] });
          c.emit(prims, t);
          this.emitBladeTrail(ctx, c, [0.86, 0.94, 1.0], 2.4);
          vec3.set(this.clash, 0, Math.max(0.6, h + 1.2), 0);
          lights.add(0, h + 1.4, 0, 16, [0.78, 0.90, 1.0], 8);
        }
        emitHorde(cast, prims, t, {
          centre: [0, 0, -6], count: Math.round(ctx.quality.crowd * 0.45),
          spacing: 2.4, rowDepth: 3.0, perRow: 5, yaw: 0, glow: 0.7, seed: seed + 3,
        });
        break;
      }
      case 'whipPan': {
        emitHorde(cast, prims, t, {
          centre: [0, 0, -10], count: Math.round(ctx.quality.crowd * 0.7),
          spacing: 3.0, rowDepth: 3.6, perRow: 7, yaw: 0, glow: 0.9, seed,
        });
        vec3.set(this.clash, 0, 1.6, -4);
        break;
      }
      case 'standoff': {
        const a = cast.take('hero', { weapon: 'key', glow: 1.3 });
        const b = cast.take('rival', { weapon: 'blade', glow: 1.3, weaponColor: [1.0, 0.42, 0.26] });
        if (a) {
          a.setPosition(-1.6, 0, 0);
          Behaviour.standing(a, t, { yaw: Math.PI * 0.5 });
          a.emit(prims, t);
          lights.add(-1.6, 1.5, 0, 12, [0.62, 0.82, 1.0], 5);
        }
        if (b) {
          b.setPosition(1.6, 0, 0);
          Behaviour.standing(b, t, { yaw: -Math.PI * 0.5 });
          b.emit(prims, t);
          lights.add(1.6, 1.5, 0, 12, [1.0, 0.46, 0.30], 5);
        }
        vec3.set(this.clash, 0, 1.5, 0);
        break;
      }
      case 'strikeDown': {
        const a = cast.take('rival', { weapon: 'blade', glow: 1.3, weaponColor: [1.0, 0.42, 0.26] });
        if (a) {
          a.setPosition(0.9, 0, -1.4);
          Behaviour.attacking(a, clamp(p * 1.1, 0, 1), { yaw: Math.PI, lunge: 1.0, origin: [0.9, 0, -1.4] });
          a.emit(prims, t);
          this.emitBladeTrail(ctx, a, [1.0, 0.46, 0.28], 2.2);
        }
        const b = cast.take('hero', { glow: 1.4 });
        if (b) {
          b.setPosition(-0.6, 0, 0.6);
          Behaviour.struck(b, clamp(p * 1.2, 0, 1), { yaw: 0, knockback: 1.4, origin: [-0.6, 0, 0.6] });
          b.emit(prims, t);
          lights.add(-0.6, 1.2, 0.6, 12, [0.7, 0.86, 1.0], 6);
        }
        vec3.set(this.clash, 0, 1.3, 0);
        break;
      }
      case 'rise': {
        const c = cast.take('hero', { weapon: 'key', glow: 1.2 + p * 0.8 });
        if (c) {
          c.setPosition(0, 0, 0);
          const q = clamp(p, 0, 1);
          if (q < 0.5) Behaviour.kneeling(c, t, { yaw: 0.3 });
          else Behaviour.standing(c, t, { yaw: 0.3, life: 1.4 });
          c.pose[1] = lerp(0.58, 0.95, smoothstep(0.35, 0.85, q));
          c.emit(prims, t);
          lights.add(0, 1.2, 0, 16, [0.78, 0.90, 1.0], 5 + p * 12);
        }
        vec3.set(this.clash, 0, 1.2, 0);
        break;
      }
      case 'backToBack': {
        const a = cast.take('hero', { weapon: 'key', glow: 1.3 });
        const b = cast.take('light', { weapon: 'blade', glow: 1.3, weaponColor: [1.0, 0.86, 0.56] });
        if (a) {
          a.setPosition(-0.5, 0, 0);
          Behaviour.standing(a, t, { yaw: Math.PI * 0.5 });
          a.emit(prims, t);
        }
        if (b) {
          b.setPosition(0.5, 0, 0);
          Behaviour.standing(b, t, { yaw: -Math.PI * 0.5 });
          b.emit(prims, t);
        }
        emitHorde(cast, prims, t, {
          centre: [0, 0, -10], count: Math.round(ctx.quality.crowd * 0.6),
          spacing: 3.2, rowDepth: 3.6, perRow: 7, yaw: 0, glow: 0.7, seed,
        });
        lights.add(0, 1.6, 0, 16, [0.9, 0.9, 1.0], 7);
        vec3.set(this.clash, 0, 1.6, 0);
        break;
      }
      case 'wideWar': {
        emitHorde(cast, prims, t, {
          centre: [-7, 0, -14], count: Math.round(ctx.quality.crowd * 0.7),
          spacing: 3.4, rowDepth: 4.0, perRow: 8, yaw: 0.2, glow: 0.8, seed,
        });
        emitHorde(cast, prims, t, {
          centre: [8, 0, -18], count: Math.round(ctx.quality.crowd * 0.5),
          spacing: 3.4, rowDepth: 4.0, perRow: 6, yaw: Math.PI - 0.2,
          glow: 0.8, seed: seed + 9, style: 'chorus',
        });
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3 + t * 0.1;
          emitLightShaft(ctx.frame.beamStore, {
            origin: [Math.cos(a) * 26, 60, -16 + Math.sin(a) * 20],
            direction: [0, -1, 0], length: 70, radius: 4.5,
            color: i % 2 ? [1.0, 0.62, 0.38] : [0.62, 0.82, 1.0],
            intensity: 0.9, taper: 0.7, dustScale: 0.05, seed: 200 + i,
          });
        }
        vec3.set(this.clash, 0, 2.0, -8);
        break;
      }
      default: {
        emitHorde(cast, prims, t, {
          centre: [0, 0, -12], count: ctx.quality.crowd,
          spacing: 3.0, rowDepth: 3.4, perRow: 8, yaw: 0,
          glow: 0.8, seed,
        });
        const c = cast.take('hero', { weapon: 'key', glow: 1.4 });
        if (c) {
          c.setPosition(0, 0, 2.0);
          Behaviour.standing(c, t, { yaw: 0 });
          c.emit(prims, t);
        }
        vec3.set(this.clash, 0, 1.6, -4);
        break;
      }
    }
    void particles;
  }

  emitBladeTrail(ctx, character, colour, width = 1.6) {
    if (!character.weaponTip || !character.weaponBase) return;
    const store = ctx.frame.trails;
    const tip = character.weaponTip;
    const base = character.weaponBase;
    const steps = 5;
    const a0 = [0, 0, 0];
    const a1 = [0, 0, 0];
    const b0 = [0, 0, 0];
    const b1 = [0, 0, 0];
    for (let i = 0; i < steps; i++) {
      const f0 = i / steps;
      const f1 = (i + 1) / steps;
      const spread0 = 0.10 * width * (1 - f0);
      const spread1 = 0.10 * width * (1 - f1);
      for (let k = 0; k < 3; k++) {
        a0[k] = lerp(base[k], tip[k], f0) - spread0;
        a1[k] = lerp(base[k], tip[k], f0) + spread0;
        b0[k] = lerp(base[k], tip[k], f1) - spread1;
        b1[k] = lerp(base[k], tip[k], f1) + spread1;
      }
      store.quad(a0, a1, b0, b1, colour, 1.6 * (1 - f0), 1.6 * (1 - f1), f0, f1);
    }
  }
}

export class ShatterSequence extends Sequence {
  constructor() {
    super({ id: 'shatter', name: 'Break', title: 'VI / BREAK', start: T.shatter, end: T.lightDark, exposureTrim: 0.97 });
    this.motes = new MoteField({
      cellSize: 5.0, radius: 5, density: 0.34, size: 0.05, sizeVariation: 1.9,
      color: [0.62, 0.84, 1.0], color2: [1.0, 0.92, 0.78],
      intensity: 2.2, drift: 0.8, rise: 0, twinkle: 0.7, seed: 131,
      flow: [0, 0, 28],
    });
    this.pool = new ParticlePool(5000);
    this.seeded = false;
  }

  build(ctx) {
    const { rig, deck } = ctx;
    const s = this.start;

    const a = rig.shot(s, 3.4, {
      spline: true, ease: 'outQuad', blend: 0, handheld: 1.1, shakeScale: 1.4,
      dofScale: 1.3, focusRange: 5,
      label: 'through the glass',
    });
    a.keyframe(0.0, [0, 3, 44], [0, 2, 0], 68);
    a.keyframe(1.6, [1.6, 2.4, 22], [0, 2, -6], 60);
    a.keyframe(3.4, [-1.2, 2.0, 6], [0, 2, -18], 54);

    const b = rig.shot(s + 3.4, this.length - 3.4, {
      spline: true, ease: 'outCubic', blend: 0.4, handheld: 0.5,
      dofScale: 1.0, focusRange: 12,
      label: 'settle',
    });
    b.keyframe(0.0, [-1.2, 2.0, 6], [0, 2, -18], 54);
    b.keyframe(1.6, [-4.0, 3.4, -8], [0, 2.4, -30], 46);
    b.keyframe(3.205, [-6.0, 5.0, -22], [0, 3.0, -46], 40);

    deck.shatter(T.shatter, {
      duration: 2.4, spread: 1.35, spin: 4.4, approach: 0.78,
      edge: 0.45, refraction: 0.05, color: [0.86, 0.94, 1.0], ease: 'outQuad',
    });
    rig.impulse(T.shatter, { shake: 0.42, fov: 14, decay: 4.0, push: 2.4, frequency: 10 });
    deck.add({ at: T.shatter, type: TRANSITION.FLASH, duration: 0.7, strength: 1.3, color: [0.90, 0.96, 1.0] });
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, dt } = ctx;
    const env = frame.env;
    const post = frame.post;

    const settle = smoothstep(1.6, 5.4, local);

    setEnv(env, {
      skyZenith: [0.004, 0.008, 0.024],
      skyHorizon: [0.010, 0.019, 0.048],
      skyGround: [0.002, 0.003, 0.010],
      skyGlow: [0.040, 0.060, 0.110],
      sunDir: [0.0, 0.35, -0.94],
      sunColor: [0.86, 0.94, 1.0],
      sunSize: 0.07,
      sunIntensity: 1.5 * (1 - settle * 0.62),
      nebula: 0.44,
      stars: 0.35,
      horizonSharp: 0.6,

      ambientScale: 1.0,
      keyDir: [0.0, 0.4, -0.92],
      keyColor: [0.82, 0.92, 1.0],
      keyIntensity: 0.55,
      fillDir: [0.0, -0.4, 0.92],
      fillColor: [0.20, 0.24, 0.52],
      fillIntensity: 0.18,
      rimColor: [0.88, 0.95, 1.0],
      rimIntensity: 1.55,
      rimPower: 2.4,

      fogColor: [0.010, 0.016, 0.038],
      fogGlow: [0.095, 0.142, 0.260],
      fogDensity: 0.0017,
      fogHeight: 90,
      fogDistance: 760,
      fogSky: 0.18,
      scatterStrength: 0.62,
      scatterDistance: 340,

      emissiveScale: 1.2,
      particleScale: 1.3,
    });

    post.exposure = 1.10 - settle * 0.12;
    post.bloom = 0.46 - settle * 0.08;
    post.bloomThreshold = 1.06;
    post.dofStrength = 0.86;
    post.dofRadius = 0.017;
    post.chromatic = 0.60 - settle * 0.28;
    post.vignette = 0.90;
    post.vignetteSoft = 0.22;
    post.grain = 0.032;
    post.saturation = 1.10;
    post.contrast = 1.08;
    post.halation = 0.12;
    post.letterbox = 0.20;
    post.motionBlur = 0.90 - settle * 0.38;
    post.motionSamples = ctx.quality.motionSamples;
    post.speedLines = 0.26 * (1 - settle);
    post.radialBlur = 0.10 * (1 - settle);
    post.tint = [0.98, 1.0, 1.06];

    emitGlassBurst(prims, {
      centre: [0, 2, -2], count: ctx.quality.shatterShards,
      speedMin: 10, speedMax: 46, life: 5.2, gravity: 1.6,
      sizeMin: 0.25, sizeMax: 3.2,
      albedo: [0.14, 0.20, 0.34], color: [0.80, 0.92, 1.0],
      glow: 1.8, seed: 191,
    }, local);

    this.motes.emit(particles, ctx.camera.position, t, 1, 1.4 * (1 - settle * 0.4));

    if (!this.seeded) {
      this.seeded = true;
      this.pool.burst({
        x: 0, y: 2, z: -2, count: 900,
        speedMin: 14, speedMax: 60, lifeMin: 1.2, lifeMax: 4.2,
        sizeMin: 0.04, sizeMax: 0.22,
        color: [0.92, 0.96, 1.0], color2: [0.52, 0.76, 1.0],
        intensity: 3.6, drag: 0.5, gravity: -1.2,
        kind: PARTICLE_KIND.FRAGMENT, radius: 1.5,
      });
    }
    this.pool.update(dt, t);
    this.pool.emit(particles, t);

    lights.add(0, 3, -6, 90, [0.82, 0.92, 1.0], 12 * (1 - settle * 0.6));
    lights.add(0, 2, 22, 60, [1.0, 0.92, 0.80], 8 * (1 - settle));

    void music;
  }
}

export class LightDarkSequence extends Sequence {
  constructor() {
    super({ id: 'lightDark', name: 'Light and Darkness', title: 'VII / TWO HALVES', start: T.lightDark, end: T.surreal, exposureTrim: 1.63 });
    this.motes = new MoteField({
      cellSize: 9.0, radius: 5, density: 0.26, size: 0.07, sizeVariation: 1.5,
      color: [0.78, 0.88, 1.0], color2: [0.44, 0.60, 1.0],
      intensity: 1.1, drift: 0.12, rise: 0.22, twinkle: 0.35, softness: 0.75, seed: 149,
    });
  }

  build(ctx) {
    const { rig, deck } = ctx;
    const s = this.start;

    const a = rig.shot(s, 7.4, {
      spline: true, ease: 'inOutSine', blend: 0, handheld: 0.30,
      dofScale: 0.75, focusRange: 22,
      label: 'crane',
    });
    a.keyframe(0.0, [-58, 26, 62], [-8, 4, 0], 44);
    a.keyframe(3.6, [-34, 14, 46], [-4, 3, 0], 42);
    a.keyframe(7.4, [-14, 5.5, 34], [0, 2.6, 0], 40);

    const b = rig.shot(s + 7.4, 6.2, {
      spline: true, ease: 'inOutCubic', blend: 1.6, handheld: 0.35,
      dofScale: 1.0, focusRange: 12,
      label: 'the gap',
    });
    b.keyframe(0.0, [-14, 5.5, 34], [0, 2.6, 0], 40);
    b.keyframe(3.0, [0, 2.2, 22], [0, 2.2, -30], 52);
    b.keyframe(6.2, [0, 1.8, 6], [0, 2.0, -40], 58);

    const c = rig.shot(s + 13.6, this.length - 13.6, {
      spline: true, ease: 'outCubic', blend: 0, handheld: 0.22,
      dofScale: 0.4, focusRange: 90,
      label: 'cathedral',
    });
    c.keyframe(0.0, [22, 14, 90], [0, 18, -20], 46);
    c.keyframe(3.2, [40, 42, 140], [0, 26, -30], 40);
    c.keyframe(6.214, [56, 70, 190], [0, 34, -40], 36);

    deck.crossfade(T.lightDark, 1.1);
    deck.add({
      at: T.surreal - 0.9, type: TRANSITION.PARTICLE_DISSOLVE, duration: 0.9,
      color: [0.86, 0.92, 1.0], softness: 0.22, ease: 'inOutCubic',
    });
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, cast } = ctx;
    const env = frame.env;
    const post = frame.post;
    const swell = smoothstep(0.28, 0.62, music.energy);

    setEnv(env, {
      skyZenith: [0.0020, 0.0034, 0.0100],
      skyHorizon: [0.007, 0.012, 0.032],
      skyGround: [0.0006, 0.0008, 0.0022],
      skyGlow: [0.040, 0.070, 0.158],
      sunDir: [0.0, 0.86, -0.51],
      sunColor: [0.86, 0.94, 1.0],
      sunSize: 0.11,
      sunIntensity: 1.4 + swell * 1.1,
      nebula: 0.32,
      stars: 0.42,
      horizonSharp: 0.9,

      ambientScale: 0.62 + swell * 0.28,
      keyDir: [0.05, 0.95, -0.30],
      keyColor: [0.80, 0.90, 1.0],
      keyIntensity: 0.34 + swell * 0.22,
      fillDir: [-0.2, -0.9, 0.4],
      fillColor: [0.24, 0.12, 0.42],
      fillIntensity: 0.20,
      rimColor: [0.84, 0.92, 1.0],
      rimIntensity: 1.48,
      rimPower: 2.2,

      fogColor: [0.008, 0.013, 0.032],
      fogGlow: [0.079, 0.118, 0.245],
      fogDensity: 0.0029,
      fogHeight: 130,
      fogFloor: -2,
      fogDistance: 1150,
      fogSky: 0.24,
      scatterStrength: 0.30,
      scatterSteps: 1.0,
      scatterDistance: 620,

      emissiveScale: 0.95,
      beamScale: 1.5 + swell * 0.6,
      particleScale: 0.9,
    });

    post.exposure = 0.96 + swell * 0.14;
    post.bloom = 0.36;
    post.bloomThreshold = 1.04;
    post.dofStrength = 0.72;
    post.dofRadius = 0.013;
    post.chromatic = 0.22;
    post.vignette = 1.05;
    post.vignetteSoft = 0.16;
    post.grain = 0.030;
    post.saturation = 1.04;
    post.contrast = 1.10;
    post.halation = 0.07;
    post.letterbox = 0.24;
    post.motionBlur = 0.26;
    post.motionSamples = ctx.quality.motionSamples;
    post.tint = [0.95, 0.98, 1.10];

    emitVoidFloor(prims, {
      centre: [0, 0, 0], size: 1400, thickness: 8,
      albedo: [0.012, 0.016, 0.028],
      emissive: [0.10, 0.22, 0.52],
      metallic: 0.86, roughness: 0.14, glow: 0.18,
      seed: 17,
    });

    emitCathedralLight(frame.beamStore, lights, {
      centre: [0, 0, -30], count: ctx.quality.beamCount,
      innerRadius: 26, outerRadius: 150, height: 230, length: 260,
      beamMin: 5, beamMax: 20, tilt: 0.10,
      color: [0.80, 0.90, 1.0],
      intensity: 0.85 + swell * 0.45,
      lightRadius: 55, lightIntensity: 1.2 + swell * 0.7,
      rotation: t * 0.01, seed: 5,
    }, t);

    this.motes.emit(particles, ctx.camera.position, t, 1, 0.7 + swell * 0.5);

    const perSide = Math.round(ctx.quality.crowd * 0.55);
    for (let side = 0; side < 2; side++) {
      const z = side === 0 ? -14 : 14;
      const yaw = side === 0 ? 0 : Math.PI;
      const style = side === 0 ? 'light' : 'shadow';
      for (let i = 0; i < perSide; i++) {
        const c = cast.take(style, {
          glow: side === 0 ? 0.9 + swell * 0.7 : 0.55 + swell * 0.4,
          scale: lerp(0.9, 1.15, rand1(i * 41 + side * 7)),
          cloak: false,
          weapon: rand1(i * 17 + side * 3) > 0.55 ? 'blade' : null,
          weaponColor: side === 0 ? [1.0, 0.90, 0.62] : [0.52, 0.30, 0.92],
          hairStrands: 6,
        });
        if (!c) break;
        Formation.line(TMP, i, perSide, {
          centre: [0, 0, z], width: 62, depth: 7, seed: side * 31 + 3,
        });
        c.setPosition(TMP[0], 0, TMP[2]);
        Behaviour.chorus(c, t, i + side * 100, { yaw, yawSpread: 0.22, seed: side });
        c.emit(prims, t);
      }
    }

    const hero = cast.take('hero', { glow: 1.3 + swell * 0.6, hairStrands: 9 });
    if (hero) {
      hero.setPosition(0, 0, -1);
      Behaviour.reaching(hero, t, { yaw: 0, amount: 0.28 + swell * 0.35, lookUp: 0.34 });
      hero.emit(prims, t);
      lights.add(0, 2.2, -1, 26, [0.86, 0.94, 1.0], 5.0 + swell * 4.0);
    }

    void local;
  }
}

export class SurrealSequence extends Sequence {
  constructor() {
    super({ id: 'surreal', name: 'Impossible City', title: 'VIII / THE CITY THAT FELL', start: T.surreal, end: T.climaxStop, exposureTrim: 1.36 });
    this.city = new FloatingArchitecture({
      seed: 909, count: 130, radius: 360, height: 240, centre: [0, 0, 0],
      albedo: [0.075, 0.085, 0.125],
      emissive: [0.30, 0.60, 1.0],
      accent: [1.0, 0.56, 0.26],
      drift: 0.09,
    });
    this.shards = new ShardField({
      count: 220, seed: 313, radius: 300, height: 220, centre: [0, 0, 0],
      sizeMin: 0.6, sizeMax: 5.5, spin: 0.16, drift: 0.3,
      albedo: [0.08, 0.11, 0.18], emissive: [0.44, 0.72, 1.0], glow: 0.9,
    });
    this.motes = new MoteField({
      cellSize: 12.0, radius: 5, density: 0.28, size: 0.09, sizeVariation: 1.7,
      color: [0.44, 0.72, 1.0], color2: [1.0, 0.70, 0.40],
      intensity: 1.3, drift: 0.22, rise: 0.5, twinkle: 0.6, seed: 167,
    });
    this.heroPos = vec3.create(0, 0, 0);
  }

  build(ctx) {
    const { rig, deck, sync } = ctx;
    const s = this.start;

    const a = rig.shot(s, 9.2, {
      spline: true, ease: 'outCubic', blend: 0, handheld: 0.35,
      dofScale: 0.55, focusRange: 60,
      label: 'arrive',
    });
    a.keyframe(0.0, [0, -160, 320], [0, -20, 60], 52);
    a.keyframe(4.0, [40, -90, 240], [0, 10, 40], 48);
    a.keyframe(9.2, [90, -20, 180], [0, 30, 0], 44);

    const b = rig.shot(s + 9.2, 9.0, {
      spline: true, ease: 'inOutSine', blend: 1.8, handheld: 0.45,
      tension: 0.4, dofScale: 0.75, focusRange: 34,
      label: 'flythrough',
    });
    b.keyframe(0.0, [90, -20, 180], [0, 30, 0], 44);
    b.keyframe(3.0, [40, 20, 100], [-20, 30, -20], 50);
    b.keyframe(6.0, [-30, 46, 30], [-40, 34, -60], 56);
    b.keyframe(9.0, [-90, 60, -40], [-40, 40, -110], 52);

    const c = rig.shot(T.surrealLift, 12.0, {
      spline: true, ease: 'inOutCubic', blend: 0.9, handheld: 0.30,
      dofScale: 0.45, focusRange: 120,
      label: 'lift',
    });
    c.keyframe(0.0, [-90, 60, -40], [-40, 40, -110], 52);
    c.keyframe(4.0, [-40, 130, -20], [0, 60, -60], 46);
    c.keyframe(8.0, [40, 210, 60], [0, 60, -20], 42);
    c.keyframe(12.0, [140, 250, 190], [0, 40, 0], 40);

    const d = rig.shot(T.surrealLift + 12.0, 10.0, {
      spline: true, ease: 'inOutSine', blend: 1.2, handheld: 0.5,
      dofScale: 1.05, focusRange: 8, focusOn: () => this.heroPos,
      label: 'walkway',
    });
    d.keyframe(0.0, [140, 250, 190], [0, 40, 0], 40);
    d.keyframe(4.0, [50, 90, 70], [0, 20, 0], 46);
    d.keyframe(7.0, [14, 24, 26], [0, 12, 0], 52);
    d.keyframe(10.0, [5, 13.5, 12], [0, 11.8, 0], 44);

    const e = rig.shot(T.surrealLift + 22.0, T.climaxStop - (T.surrealLift + 22.0), {
      spline: true, ease: 'inQuart', blend: 1.0, handheld: 0.55,
      dofScale: 0.9, focusRange: 20,
      label: 'toward the heart',
    });
    e.keyframe(0.0, [5, 13.5, 12], [0, 11.8, 0], 44);
    e.keyframe(5.0, [-16, 26, -40], [0, 30, -110], 50);
    e.keyframe(10.0, [-8, 46, -140], [0, 46, -230], 44);
    e.keyframe(12.675, [0, 54, -190], [0, 50, -300], 38);

    deck.add({ at: T.surrealLift, type: TRANSITION.FLASH, duration: 0.9, strength: 0.65, color: [0.86, 0.94, 1.0] });

    const found = sync.impactsIn(s + 2, this.end - 1, 0.34);
    let last = -99;
    for (const imp of found) {
      if (imp.time - last < 9.0) continue;
      last = imp.time;
      rig.impulse(imp.time, { shake: 0.05 + imp.strength * 0.10, fov: 2, decay: 7.0, frequency: 8 });
    }
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, cast } = ctx;
    const env = frame.env;
    const post = frame.post;

    const lift = smootherstep(T.surrealLift - 1.0, T.surrealLift + 4.0, t);
    const drive = smoothstep(0.5, 0.95, music.energy);

    setEnv(env, {
      skyZenith: [0.0030, 0.0060, 0.0180],
      skyHorizon: [0.020, 0.030, 0.070],
      skyGround: [0.0050, 0.0060, 0.0140],
      skyGlow: [0.070 + lift * 0.070, 0.086 + lift * 0.060, 0.180 + lift * 0.044],
      sunDir: [0.42, 0.30, -0.85],
      sunColor: [1.0, 0.74, 0.46],
      sunSize: 0.06,
      sunIntensity: 0.9 + lift * 1.9,
      nebula: 0.60,
      stars: 0.44,
      horizonSharp: 0.55,

      ambientScale: 0.80 + lift * 0.45,
      keyDir: [0.40, 0.52, -0.76],
      keyColor: [1.0, 0.80, 0.58],
      keyIntensity: 0.34 + lift * 0.34,
      fillDir: [-0.5, -0.4, 0.76],
      fillColor: [0.22, 0.36, 0.82],
      fillIntensity: 0.26,
      rimColor: [0.62, 0.84, 1.0],
      rimIntensity: 1.18,
      rimPower: 2.8,

      fogColor: [0.012, 0.016, 0.036],
      fogGlow: [0.103, 0.134, 0.245],
      fogDensity: 0.0016,
      fogHeight: 260,
      fogFloor: -180,
      fogDistance: 2400,
      fogSky: 0.20,
      scatterStrength: 0.40,
      scatterDistance: 900,

      energy: drive * 0.5,
      emissiveScale: 1.0 + lift * 0.5,
      particleScale: 1.0,
    });

    post.exposure = 1.10 + lift * 0.16;
    post.bloom = 0.34 + lift * 0.12;
    post.bloomThreshold = 1.18;
    post.dofStrength = 0.70;
    post.dofRadius = 0.012;
    post.chromatic = 0.26;
    post.vignette = 0.88;
    post.vignetteSoft = 0.22;
    post.grain = 0.028;
    post.saturation = 1.14;
    post.contrast = 1.06;
    post.halation = 0.08;
    post.letterbox = 0.18;
    post.motionBlur = 0.34;
    post.motionSamples = ctx.quality.motionSamples;
    post.tint = [1.02, 0.99, 1.03];

    this.city.emit(prims, lights, t, {
      glow: 0.9 + lift * 0.7,
      count: ctx.quality.islands,
    });
    this.shards.emit(prims, t, { glow: 0.7 + lift * 0.8, count: ctx.quality.shards });
    this.motes.emit(particles, ctx.camera.position, t, 1, 0.8 + lift * 0.6);

    for (let i = 0; i < 5; i++) {
      const a = i * 1.27 + t * 0.02;
      emitLightShaft(frame.beamStore, {
        origin: [Math.cos(a) * 180, 320, Math.sin(a) * 180],
        direction: [0, -1, 0], length: 620, radius: 20 + i * 7,
        color: i % 2 ? [1.0, 0.76, 0.46] : [0.56, 0.80, 1.0],
        intensity: 0.5 + lift * 0.7, taper: 0.5, dustScale: 0.012, seed: 300 + i,
      });
    }

    emitEnergyCore(prims, lights, {
      centre: [0, 50, -320], radius: 16, shells: 3,
      color: [0.92, 0.96, 1.0],
      glow: 1.6 + lift * 1.6, lightIntensity: 14 + lift * 18, lightRadius: 26,
      rate: 0.7, punch: 0, seed: 55,
    }, t);

    const walkway = this.city.islandAt(3, t, TMP);
    this.heroPos[0] = walkway[0];
    this.heroPos[1] = walkway[1] + 2.6;
    this.heroPos[2] = walkway[2];
    const hero = cast.take('hero', { glow: 1.2 + lift * 0.6, hairStrands: 9 });
    if (hero) {
      hero.setPosition(this.heroPos[0], this.heroPos[1], this.heroPos[2]);
      Behaviour.standing(hero, t, { yaw: Math.atan2(-this.heroPos[0], -this.heroPos[2]) });
      hero.emit(prims, t);
      lights.add(this.heroPos[0], this.heroPos[1] + 1.6, this.heroPos[2], 24, [0.7, 0.86, 1.0], 4.5);
    }

    void local;
  }
}

export class ClimaxSequence extends Sequence {
  constructor() {
    super({ id: 'climax', name: 'Climax', title: 'IX / EVERYTHING AT ONCE', start: T.climaxStop, end: T.outro, exposureTrim: 0.52 });
    this.motes = new MoteField({
      cellSize: 5.5, radius: 5, density: 0.40, size: 0.06, sizeVariation: 2.0,
      color: [1.0, 0.86, 0.56], color2: [0.58, 0.82, 1.0],
      intensity: 2.4, drift: 0.7, rise: 0.9, twinkle: 0.75, seed: 211,
    });
    this.shards = new ShardField({
      count: 280, seed: 401, radius: 150, height: 120, centre: [0, 24, 0],
      sizeMin: 0.4, sizeMax: 4.2, spin: 0.5, drift: 0.7,
      albedo: [0.12, 0.16, 0.26], emissive: [0.86, 0.92, 1.0], glow: 1.4,
    });
    this.pool = new ParticlePool(9000);
    this.fired = false;
    this.core = vec3.create(0, 26, 0);
  }

  build(ctx) {
    const { rig, deck, sync } = ctx;

    const hold = rig.shot(T.climaxStop, T.climaxHit - T.climaxStop, {
      spline: false, ease: 'linear', blend: 0, handheld: 0.16, shakeScale: 0.2,
      dofScale: 1.5, focusRange: 4,
      label: 'held breath',
    });
    hold.keyframe(0.0, [0, 26.2, 15.0], [0, 26.0, 0], 34);
    hold.keyframe(T.climaxHit - T.climaxStop, [0, 26.1, 13.6], [0, 26.0, 0], 32);

    const blast = rig.shot(T.climaxHit, 4.6, {
      spline: true, ease: 'outQuint', blend: 0, handheld: 1.2, shakeScale: 1.5,
      dofScale: 0.6, focusRange: 30,
      label: 'the hit',
    });
    blast.keyframe(0.0, [0, 26.1, 13.6], [0, 26.0, 0], 32);
    blast.keyframe(1.0, [3, 28, 40], [0, 26, 0], 62);
    blast.keyframe(2.6, [-14, 40, 96], [0, 26, 0], 54);
    blast.keyframe(4.6, [-40, 58, 150], [0, 26, 0], 46);

    rig.orbit(T.climaxHit + 4.6, 9.4, {
      centre: [0, 26, 0], blend: 1.2, ease: 'inOutSine', handheld: 0.45,
      fromAngle: 1.9, toAngle: 4.4, fromRadius: 150, toRadius: 92,
      fromHeight: 58, toHeight: 22, lookHeight: 10,
      fromFov: 46, toFov: 56, focusRange: 44, dofScale: 0.6,
      label: 'grand orbit',
    });

    const push = rig.shot(T.climaxHit + 14.0, 8.0, {
      spline: true, ease: 'inCubic', blend: 0, handheld: 0.8, shakeScale: 1.2,
      dofScale: 1.0, focusRange: 12,
      label: 'drive in',
    });
    push.keyframe(0.0, [66, 34, 66], [0, 26, 0], 52);
    push.keyframe(3.4, [30, 28, 30], [0, 26, 0], 58);
    push.keyframe(6.0, [12, 26.5, 13], [0, 26, 0], 64);
    push.keyframe(8.0, [4.5, 26.2, 5.5], [0, 26, 0], 72);

    const out = rig.shot(T.climaxHit + 22.0, this.end - (T.climaxHit + 22.0), {
      spline: true, ease: 'inOutCubic', blend: 1.0, handheld: 0.4,
      dofScale: 0.5, focusRange: 80,
      label: 'rise out',
    });
    out.keyframe(0.0, [4.5, 26.2, 5.5], [0, 26, 0], 72);
    out.keyframe(4.0, [-20, 60, 70], [0, 30, 0], 54);
    out.keyframe(8.0, [-60, 130, 170], [0, 30, 0], 44);
    out.keyframe(13.23, [-100, 230, 300], [0, 20, 0], 38);

    deck.add({ at: T.climaxStop + 0.45, type: TRANSITION.FADE, duration: 0.62, color: [0.01, 0.012, 0.03], hold: 0.0 });
    deck.add({ at: T.climaxHit - 0.02, type: TRANSITION.FADE, duration: 0.16, color: [0.01, 0.012, 0.03], out: true });
    deck.add({ at: T.climaxHit, type: TRANSITION.FLASH, duration: 2.2, strength: 2.6, color: [1.0, 0.98, 0.94] });

    rig.impulse(T.climaxHit, { shake: 0.70, fov: 18, decay: 3.0, push: -5, frequency: 10 });

    const found = sync.impactsIn(T.climaxHit + 1.0, this.end, 0.34);
    let last = -99;
    for (const imp of found) {
      if (imp.time - last < 4.0) continue;
      last = imp.time;
      rig.impulse(imp.time, { shake: 0.06 + imp.strength * 0.14, fov: 3, decay: 7.5, frequency: 9 });
    }
  }

  update(ctx) {
    const { t, frame, music, prims, lights, particles, cast, dt } = ctx;
    const env = frame.env;
    const post = frame.post;

    const before = t < T.climaxHit;
    const age = t - T.climaxHit;
    const settle = before ? 0 : smoothstep(3.0, 12.0, age);

    const blast = before ? 0 : Ease.outQuart(clamp(age / 1.4, 0, 1)) * (1 - settle * 0.62);
    const drive = smoothstep(0.5, 0.98, music.energy);
    const power = before ? 0.06 : lerp(1.0, 0.72, settle);

    setEnv(env, {
      skyZenith: [0.004 + blast * 0.030, 0.006 + blast * 0.036, 0.018 + blast * 0.060],
      skyHorizon: [0.014 + blast * 0.14, 0.020 + blast * 0.13, 0.050 + blast * 0.16],
      skyGround: [0.002, 0.003, 0.008],
      skyGlow: [0.046 + blast * 0.230, 0.062 + blast * 0.195, 0.130 + blast * 0.200],
      sunDir: [0.0, 0.55, -0.84],
      sunColor: [1.0, 0.94, 0.80],
      sunSize: 0.04 + blast * 0.10,
      sunIntensity: before ? 0.08 : (1.7 + drive * 1.3) * (1 - settle * 0.4),
      nebula: 0.50 + blast * 0.35,
      stars: 0.30,
      horizonSharp: 0.55,

      ambientScale: before ? 0.30 : 0.95 + blast * 0.65,
      keyDir: [0.0, 0.86, -0.51],
      keyColor: [1.0, 0.92, 0.76],
      keyIntensity: before ? 0.10 : 0.55 + blast * 0.5,
      fillDir: [0.0, -0.6, 0.80],
      fillColor: [0.28, 0.34, 0.90],
      fillIntensity: before ? 0.06 : 0.34,
      rimColor: [1.0, 0.92, 0.80],
      rimIntensity: before ? 0.70 : 1.85 + blast * 0.42,
      rimPower: 2.3,

      fogColor: [0.012, 0.016, 0.038],
      fogGlow: [0.170 * power + 0.020, 0.162 * power + 0.020, 0.255 * power + 0.040],
      fogDensity: before ? 0.0034 : 0.0015,
      fogHeight: 180,
      fogFloor: -20,
      fogDistance: 1500,
      fogSky: before ? 0.06 : 0.22,
      scatterStrength: before ? 0.42 : 0.88,
      scatterDistance: 700,

      energy: power,
      emissiveScale: before ? 0.5 : 1.25 + blast * 0.5,
      particleScale: before ? 0.3 : 1.5,
      beamScale: before ? 0.2 : 1.7,
      trailScale: 1.6,
    });

    post.exposure = before ? 0.72 : 1.24 + blast * 0.20;
    post.bloom = before ? 0.24 : 0.50 - settle * 0.10;
    post.bloomThreshold = before ? 1.30 : 1.08;
    post.dofStrength = before ? 0.95 : 0.68;
    post.dofRadius = 0.016;
    post.chromatic = before ? 0.18 : 0.44 + music.impact * 0.20;
    post.vignette = before ? 1.25 : 0.86;
    post.vignetteSoft = 0.20;
    post.grain = 0.034;
    post.saturation = before ? 0.90 : 1.20;
    post.contrast = 1.10;
    post.halation = before ? 0.03 : 0.13;
    post.letterbox = 0.18;
    post.motionBlur = before ? 0.08 : 0.70;
    post.motionSamples = ctx.quality.motionSamples;
    post.speedLines = before ? 0 : (0.16 * (1 - settle) + music.impact * 0.10);
    post.speedLineRate = 3.0;
    post.speedLineColor = [1.0, 0.92, 0.80];
    post.radialBlur = before ? 0 : (0.12 * (1 - settle) + music.impact * 0.04);
    post.radialCentre = [0.5, 0.5];
    post.tint = [1.04, 1.0, 0.98];

    emitEnergyCore(prims, lights, {
      centre: [0, 26, 0], radius: before ? 0.9 : 2.2 + blast * 4.5, shells: before ? 1 : 3,
      color: [1.0, 0.96, 0.86],
      glow: before ? 0.9 : 1.7 + blast * 0.45,
      lightIntensity: before ? 2.0 : 22 + blast * 30,
      lightRadius: before ? 8 : 22,
      rate: 1.4, punch: 0, seed: 77,
    }, t);

    if (!before) {
      this.shards.emit(prims, t, {
        glow: 1.2 + blast * 1.4,
        explode: clamp(age * 0.06, 0, 0.5),
        count: ctx.quality.shards,
      });
      this.motes.emit(particles, ctx.camera.position, t, 1, 1.2 + drive * 0.8);

      emitShockwave(prims, lights, {
        centre: [0, 26, 0], radius: 165, life: 0.95,
        color: [1.0, 0.94, 0.82], glow: 3.2, lightIntensity: 20,
        normal: [0, 1, 0], seed: 3,
      }, age);

      emitCathedralLight(frame.beamStore, lights, {
        centre: [0, 0, 0], count: ctx.quality.beamCount,
        innerRadius: 30, outerRadius: 130, height: 260, length: 300,
        beamMin: 6, beamMax: 22, tilt: 0.18,
        color: [1.0, 0.90, 0.70],
        intensity: (0.95 + drive * 0.6) * (1 - settle * 0.25),
        lightRadius: 60, lightIntensity: 1.6,
        rotation: t * 0.05, seed: 13,
      }, t);

      emitMagicCircle(prims, {
        centre: [0, 1.2, 0], radius: 70 * (0.5 + blast * 0.5),
        layers: 4, spacing: 3.5, spin: 0.10,
        color: [1.0, 0.84, 0.46], emissive: [0.42, 0.74, 1.0],
        glow: 1.4, seed: 9,
      }, t);
    }

    emitVoidFloor(prims, {
      centre: [0, 0, 0], size: 1600, thickness: 10,
      albedo: [0.014, 0.016, 0.028],
      emissive: [0.30, 0.30, 0.62],
      metallic: 0.92, roughness: 0.05,
      glow: before ? 0.15 : 0.55,
      seed: 21,
    });

    if (before) {
      const hero = cast.take('hero', { glow: 0.8, hairStrands: 9, weapon: 'key' });
      if (hero) {
        hero.setPosition(0, 25.2, 0);
        Behaviour.standing(hero, t, { yaw: 0.1, life: 0.3 });
        hero.emit(prims, t);
      }
    } else {
      const hero = cast.take('hero', {
        glow: 1.7, hairStrands: 10,
        weapon: 'key', weaponColor: [1.0, 0.96, 0.84], weaponLength: 1.35,
      });
      if (hero) {
        hero.setPosition(0, 25.4 + Math.sin(t * 0.9) * 0.35, 0);
        Behaviour.reaching(hero, t, { yaw: t * 0.10, amount: 0.9, lookUp: 0.4 });
        hero.emit(prims, t);
        lights.add(0, 27.4, 0, 40, [1.0, 0.94, 0.82], 16);
      }

      emitCircle(cast, prims, t, {
        centre: [0, 22, 0], radius: 26 + blast * 8, count: Math.round(ctx.quality.crowd * 0.7),
        style: 'chorus', glow: 1.0 + blast * 0.6, rotation: t * 0.06, lift: 1.4,
        weaponColor: [0.72, 0.88, 1.0], seed: 5,
      });
      emitCircle(cast, prims, t, {
        centre: [0, 6, 0], radius: 52, count: Math.round(ctx.quality.crowd * 0.6),
        style: 'shadow', glow: 0.7, rotation: -t * 0.04, lift: 0.8,
        weaponColor: [0.72, 0.36, 1.0], seed: 9,
      });

      if (!this.fired) {
        this.fired = true;
        this.pool.burst({
          x: 0, y: 26, z: 0, count: 2200,
          speedMin: 22, speedMax: 130, lifeMin: 1.6, lifeMax: 5.5,
          sizeMin: 0.05, sizeMax: 0.34,
          color: [1.0, 0.96, 0.84], color2: [0.58, 0.82, 1.0],
          intensity: 4.2, drag: 0.42, gravity: -2.0,
          kind: PARTICLE_KIND.SPARK, radius: 2.0,
        });
      }
      this.pool.update(dt, t);
      this.pool.emit(particles, t);
    }
  }
}

export class OutroSequence extends Sequence {
  constructor() {
    super({ id: 'outro', name: 'Dissolution', title: 'X / CLOSE THE WORLD', start: T.outro, end: T.end, exposureTrim: 1.21 });
    this.motes = new MoteField({
      cellSize: 6.0, radius: 5, density: 0.42, size: 0.055, sizeVariation: 1.8,
      color: [1.0, 0.90, 0.66], color2: [0.72, 0.88, 1.0],
      intensity: 2.0, drift: 0.28, rise: 1.6, twinkle: 0.6, seed: 233,
    });
    this.shards = new ShardField({
      count: 200, seed: 503, radius: 120, height: 90, centre: [0, 20, 0],
      sizeMin: 0.35, sizeMax: 3.0, spin: 0.20, drift: 0.4,
      albedo: [0.10, 0.13, 0.20], emissive: [0.92, 0.94, 1.0], glow: 1.2,
    });
    this.heroPos = vec3.create(0, 0, 0);
  }

  build(ctx) {
    const { rig, deck } = ctx;
    const s = this.start;

    const a = rig.shot(s, 8.256, {
      spline: true, ease: 'inOutCubic', blend: 1.4, handheld: 0.32,
      dofScale: 0.9, focusRange: 12, focusOn: () => this.heroPos,
      label: 'descend',
    });
    a.keyframe(0.0, [-100, 230, 300], [0, 20, 0], 38);
    a.keyframe(3.4, [-50, 90, 130], [0, 8, 0], 42);
    a.keyframe(6.0, [-16, 24, 40], [0, 3, 0], 44);
    a.keyframe(8.256, [-6, 6.5, 15], [0, 2.0, 0], 40);

    const b = rig.shot(T.outroLast, this.end - T.outroLast, {
      spline: true, ease: 'inOutSine', blend: 1.6, handheld: 0.22,
      dofScale: 1.1, focusRange: 4, focusOn: () => this.heroPos,
      label: 'the last shot',
    });
    b.keyframe(0.0, [-6, 6.5, 15], [0, 2.0, 0], 40);
    b.keyframe(4.5, [-2.4, 3.6, 9.5], [0, 1.8, 0], 36);
    b.keyframe(9.059, [0, 2.6, 7.0], [0, 1.7, 0], 33);

    deck.fadeTo(T.end - 8.0, 5.5, [1, 1, 1]);
    deck.add({ at: T.end - 3.4, type: TRANSITION.FADE, duration: 3.0, color: [0, 0, 0] });
  }

  update(ctx) {
    const { t, local, frame, music, prims, lights, particles, cast } = ctx;
    const env = frame.env;
    const post = frame.post;

    const decay = smoothstep(0, this.length * 0.75, local);
    const dissolve = smootherstep(T.outroLast, T.end - 6.0, t);
    const fadeOut = smoothstep(T.end - 8.0, T.end - 4.0, t);

    setEnv(env, {
      skyZenith: [0.006 + fadeOut * 0.10, 0.008 + fadeOut * 0.10, 0.020 + fadeOut * 0.10],
      skyHorizon: [0.016 + fadeOut * 0.34, 0.017 + fadeOut * 0.34, 0.032 + fadeOut * 0.34],
      skyGround: [0.003, 0.004, 0.010],
      skyGlow: [0.072, 0.066, 0.096],
      sunDir: [0.0, 0.72, -0.69],
      sunColor: [1.0, 0.94, 0.82],
      sunSize: 0.09 + fadeOut * 0.30,
      sunIntensity: 1.1 + fadeOut * 3.2,
      nebula: 0.42,
      stars: 0.40 * (1 - fadeOut),
      horizonSharp: 0.6,

      ambientScale: 0.80 + fadeOut * 0.9,
      keyDir: [0.0, 0.80, -0.60],
      keyColor: [1.0, 0.92, 0.78],
      keyIntensity: 0.40,
      fillDir: [0.0, -0.5, 0.86],
      fillColor: [0.24, 0.30, 0.72],
      fillIntensity: 0.20,
      rimColor: [1.0, 0.92, 0.80],
      rimIntensity: 1.40,
      rimPower: 2.6,

      fogColor: [0.014, 0.016, 0.032],
      fogGlow: [0.134, 0.126, 0.205],
      fogDensity: 0.0015 + fadeOut * 0.0012,
      fogHeight: 140,
      fogFloor: -6,
      fogDistance: 1400,
      fogSky: 0.20 + fadeOut * 0.5,
      scatterStrength: 0.66,
      scatterDistance: 600,

      emissiveScale: 1.0,
      dissolveColor: [1.0, 0.94, 0.80],
      particleScale: 1.3,
    });

    post.exposure = 1.00 + fadeOut * 0.55;
    post.bloom = 0.38 + fadeOut * 0.18;
    post.bloomThreshold = 1.02;
    post.dofStrength = 0.88;
    post.dofRadius = 0.017;
    post.chromatic = 0.24;
    post.vignette = 0.92 * (1 - fadeOut * 0.6);
    post.vignetteSoft = 0.22;
    post.grain = 0.030;
    post.saturation = 1.10 - fadeOut * 0.25;
    post.contrast = 1.06;
    post.halation = 0.11;
    post.letterbox = 0.20 + smoothstep(T.end - 6.0, T.end - 1.0, t) * 0.16;
    post.motionBlur = 0.25;
    post.motionSamples = ctx.quality.motionSamples;
    post.tint = [1.02, 1.0, 0.99];

    emitVoidFloor(prims, {
      centre: [0, 0, 0], size: 1200, thickness: 8,
      albedo: [0.016, 0.018, 0.030],
      emissive: [0.36, 0.34, 0.58],
      metallic: 0.92, roughness: 0.055,
      glow: 0.5 * (1 - dissolve * 0.6),
      seed: 33,
    });

    this.shards.emit(prims, t, {
      glow: 1.1 * (1 - dissolve * 0.5),
      dissolve: dissolve * 0.95,
      count: Math.round(ctx.quality.shards * (1 - dissolve * 0.4)),
    });
    this.motes.emit(particles, ctx.camera.position, t, 1, 1.0 + dissolve * 1.4);

    emitLightShaft(frame.beamStore, {
      origin: [0, 220, 0], direction: [0, -1, 0], length: 230,
      radius: 14 + fadeOut * 40, color: [1.0, 0.94, 0.80],
      intensity: 0.8 + fadeOut * 2.4, taper: 0.5, dustScale: 0.03, seed: 7,
    });

    this.heroPos[0] = 0;
    this.heroPos[1] = 0;
    this.heroPos[2] = 0;
    const hero = cast.take('hero', {
      glow: 1.2 + dissolve * 1.2,
      hairStrands: 9,
      dissolve: dissolve * 0.92,
    });
    if (hero) {
      hero.setPosition(0, 0, 0);
      Behaviour.reaching(hero, t, { yaw: 0.12, amount: 0.20 + dissolve * 0.55, lookUp: 0.30 });
      hero.emit(prims, t);
      lights.add(0, 1.8, 0, 30, [1.0, 0.94, 0.82], 6 + dissolve * 10);
      emitDissolveSparks(particles, {
        centre: [0, 1.1, 0], radius: 1.7, count: 90,
        amount: 0.4 + dissolve * 1.6,
        color: [1.0, 0.94, 0.80], intensity: 3.0, size: 0.06, seed: 3,
      }, t);
    }

    const witnesses = Math.round(ctx.quality.crowd * 0.4 * (1 - dissolve));
    if (witnesses > 0) {
      emitCircle(cast, prims, t, {
        centre: [0, 0, 0], radius: 22, count: witnesses,
        style: 'chorus', glow: 0.7 * (1 - dissolve), rotation: t * 0.02, seed: 11,
      });
    }

    void music;
    void decay;
    void TMP2;
  }
}

export function createSequences() {
  return [
    new DarknessSequence(),
    new FallingSequence(),
    new MemorySequence(),
    new StationSequence(),
    new MontageSequence(),
    new ShatterSequence(),
    new LightDarkSequence(),
    new SurrealSequence(),
    new ClimaxSequence(),
    new OutroSequence(),
  ];
}

export { T as TIMES };
