import { CINE_STRIDE, PARTICLE_STRIDE, TRAIL_STRIDE } from '../core/mesh.js';
import { LIGHT_STRIDE } from '../city/builder.js';
import { PRIM_GROUPS, BEAM_GROUPS } from './renderer.js';

class Batch {
  constructor(stride, capacity) {
    this.stride = stride;
    this.capacity = capacity;
    this.data = new Float32Array(stride * capacity);
    this.count = 0;
    this.overflow = 0;
  }

  reset() {
    this.count = 0;
    this.overflow = 0;
  }

  claim() {
    if (this.count >= this.capacity) {
      this.overflow++;
      return -1;
    }
    return (this.count++) * this.stride;
  }

  view() {
    return this.data.subarray(0, this.count * this.stride);
  }
}

const IDENTITY_QUAT = [0, 0, 0, 1];
const WHITE = [1, 1, 1];

export class PrimStore {
  constructor(capacity) {
    this.groups = {};
    for (const group of PRIM_GROUPS) {
      this.groups[group.name] = new Batch(CINE_STRIDE, capacity);
    }
  }

  reset() {
    for (const key in this.groups) this.groups[key].reset();
  }

  get(name) {
    return this.groups[name];
  }

  add(group, spec) {
    const batch = this.groups[group];
    if (!batch) return;
    const o = batch.claim();
    if (o < 0) return;
    const d = batch.data;
    const p = spec.position;
    const q = spec.rotation || IDENTITY_QUAT;
    const s = spec.scale;
    const a = spec.albedo || WHITE;
    const e = spec.emissive || WHITE;

    d[o] = p[0];
    d[o + 1] = p[1];
    d[o + 2] = p[2];
    d[o + 3] = spec.kind || 0;

    d[o + 4] = q[0];
    d[o + 5] = q[1];
    d[o + 6] = q[2];
    d[o + 7] = q[3];

    if (typeof s === 'number') {
      d[o + 8] = s; d[o + 9] = s; d[o + 10] = s;
    } else {
      d[o + 8] = s[0]; d[o + 9] = s[1]; d[o + 10] = s[2];
    }
    d[o + 11] = spec.seed || 0;

    d[o + 12] = a[0];
    d[o + 13] = a[1];
    d[o + 14] = a[2];
    d[o + 15] = spec.metallic !== undefined ? spec.metallic : 0.0;

    d[o + 16] = e[0];
    d[o + 17] = e[1];
    d[o + 18] = e[2];
    d[o + 19] = spec.roughness !== undefined ? spec.roughness : 0.5;

    d[o + 20] = spec.glow !== undefined ? spec.glow : 1.0;
    d[o + 21] = spec.dissolve || 0;
    d[o + 22] = spec.opacity !== undefined ? spec.opacity : 1.0;
    d[o + 23] = spec.pattern !== undefined ? spec.pattern : 1.0;
  }
}

export class BeamStore {
  constructor(capacity) {
    this.groups = {};
    for (const name of BEAM_GROUPS) this.groups[name] = new Batch(CINE_STRIDE, capacity);
  }

  reset() {
    for (const key in this.groups) this.groups[key].reset();
  }

  get(name) {
    return this.groups[name];
  }

  add(group, spec) {
    const batch = this.groups[group];
    if (!batch) return;
    const o = batch.claim();
    if (o < 0) return;
    const d = batch.data;
    const p = spec.position;
    const q = spec.rotation || IDENTITY_QUAT;
    const s = spec.scale;
    const c = spec.color || WHITE;

    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = 0;
    d[o + 4] = q[0]; d[o + 5] = q[1]; d[o + 6] = q[2]; d[o + 7] = q[3];
    if (typeof s === 'number') { d[o + 8] = s; d[o + 9] = s; d[o + 10] = s; }
    else { d[o + 8] = s[0]; d[o + 9] = s[1]; d[o + 10] = s[2]; }
    d[o + 11] = spec.seed || 0;
    d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
    d[o + 16] = c[0]; d[o + 17] = c[1]; d[o + 18] = c[2];
    d[o + 19] = spec.intensity !== undefined ? spec.intensity : 1.0;
    d[o + 20] = spec.density !== undefined ? spec.density : 1.0;
    d[o + 21] = spec.taper !== undefined ? spec.taper : 1.0;
    d[o + 22] = 0;
    d[o + 23] = spec.dustScale !== undefined ? spec.dustScale : 0.08;
  }
}

export class LightStore {
  constructor(capacity) {
    this.batch = new Batch(LIGHT_STRIDE, capacity);
  }

  reset() {
    this.batch.reset();
  }

  get data() {
    return this.batch.data;
  }

  get count() {
    return this.batch.count;
  }

  view() {
    return this.batch.view();
  }

  add(x, y, z, radius, color, intensity, opts) {
    const o = this.batch.claim();
    if (o < 0) return;
    const d = this.batch.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = radius;
    d[o + 4] = color[0]; d[o + 5] = color[1]; d[o + 6] = color[2];
    d[o + 7] = intensity;
    d[o + 8] = opts && opts.flickerRate ? opts.flickerRate : 0;
    d[o + 9] = opts && opts.flickerAmount ? opts.flickerAmount : 0;
    d[o + 10] = opts && opts.phase ? opts.phase : 0;
    d[o + 11] = opts && opts.cone ? opts.cone : 0;
  }
}

export class ParticleBatch {
  constructor(capacity) {
    this.batch = new Batch(PARTICLE_STRIDE, capacity);
  }

  reset() {
    this.batch.reset();
  }

  get count() {
    return this.batch.count;
  }

  view() {
    return this.batch.view();
  }

  add(x, y, z, size, r, g, b, intensity, rotation, softness, kind, seed) {
    const o = this.batch.claim();
    if (o < 0) return;
    const d = this.batch.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = intensity;
    d[o + 8] = rotation; d[o + 9] = softness; d[o + 10] = kind; d[o + 11] = seed;
  }
}

export class TrailStore {
  constructor(segmentCapacity) {
    this.capacity = segmentCapacity * 6;
    this.data = new Float32Array(this.capacity * TRAIL_STRIDE);
    this.count = 0;
  }

  reset() {
    this.count = 0;
  }

  view(vertexCount) {
    return this.data.subarray(0, (vertexCount === undefined ? this.count : vertexCount) * TRAIL_STRIDE);
  }

  vertex(x, y, z, r, g, b, a, u, v) {
    if (this.count >= this.capacity) return;
    const o = (this.count++) * TRAIL_STRIDE;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = a;
    d[o + 7] = u; d[o + 8] = v;
  }

  quad(a0, a1, b0, b1, colour, alphaA, alphaB, uA, uB) {
    const [r, g, b] = colour;
    this.vertex(a0[0], a0[1], a0[2], r, g, b, alphaA, uA, 0);
    this.vertex(a1[0], a1[1], a1[2], r, g, b, alphaA, uA, 1);
    this.vertex(b0[0], b0[1], b0[2], r, g, b, alphaB, uB, 0);
    this.vertex(a1[0], a1[1], a1[2], r, g, b, alphaA, uA, 1);
    this.vertex(b1[0], b1[1], b1[2], r, g, b, alphaB, uB, 1);
    this.vertex(b0[0], b0[1], b0[2], r, g, b, alphaB, uB, 0);
  }
}

export function createEnvironment() {
  return {
    skyZenith: [0.004, 0.007, 0.019],
    skyHorizon: [0.012, 0.024, 0.058],
    skyGround: [0.002, 0.003, 0.008],
    skyGlow: [0.05, 0.09, 0.20],
    sunDir: [0.0, 0.45, -0.89],
    sunColor: [0.65, 0.80, 1.0],
    sunSize: 0.03,
    sunIntensity: 0.0,
    nebula: 0.35,
    stars: 0.8,
    skyFlash: 0.0,
    flashColor: [1, 1, 1],
    horizonSharp: 0.7,

    ambientScale: 1.0,
    keyDir: [0.3, 0.7, -0.6],
    keyColor: [0.6, 0.75, 1.0],
    keyIntensity: 0.35,
    fillDir: [-0.5, -0.2, 0.7],
    fillColor: [0.25, 0.15, 0.45],
    fillIntensity: 0.12,
    rimColor: [0.45, 0.68, 1.0],
    rimIntensity: 0.5,
    rimPower: 3.2,

    lightScale: 0.45,
    emissiveScale: 1.0,
    energy: 0.0,
    dissolveEdge: 0.09,
    dissolveColor: [1.0, 0.85, 0.55],

    fogColor: [0.010, 0.016, 0.036],
    fogGlow: [0.10, 0.18, 0.42],
    fogDensity: 0.0075,
    fogHeight: 90.0,
    fogDistance: 900.0,
    fogFloor: 0.0,

    fogSky: 0.14,

    scatterStrength: 1.0,
    scatterSteps: 1.0,
    scatterDistance: 480.0,

    scatterLightScale: 0.0055,

    particleScale: 1.0,
    particleSize: 1.0,
    trailScale: 1.0,
    beamScale: 1.0,
  };
}

export function createPostState() {
  return {
    exposure: 1.15,
    bloom: 0.55,
    bloomThreshold: 0.85,
    bloomMips: 0,
    chromatic: 0.22,
    vignette: 0.85,
    vignetteSoft: 0.22,
    grain: 0.030,
    saturation: 1.12,
    contrast: 1.05,
    lift: [0.004, 0.004, 0.012],
    gain: [1.0, 0.995, 1.02],
    tint: [1, 1, 1],
    bleach: 0.0,
    halation: 0.10,
    gateWeave: 0.6,

    flash: 0.0,
    flashColor: [1, 1, 1],
    letterbox: 0.16,
    fade: 0.0,
    fadeColor: [0, 0, 0],

    ssao: true,
    ssr: true,

    dofStrength: 0.85,
    dofRadius: 0.022,
    dofSamples: 16,
    focusDistance: 30,
    focusRange: 8,

    motionBlur: 0.0,

    motionMax: 0.026,
    motionSamples: 10,

    radialBlur: 0.0,
    radialSamples: 10,
    radialCentre: [0.5, 0.5],
    speedLines: 0.0,
    speedLineRate: 1.4,
    speedLineColor: [0.72, 0.86, 1.0],

    captureHold: false,
    shatter: 0.0,
    shatterCentre: [0.5, 0.5],
    shatterSpread: 1.1,
    shatterSpin: 3.4,
    shatterApproach: 0.55,
    shatterEdge: 0.35,
    shatterEdgeColor: [0.75, 0.90, 1.0],
    shatterRefraction: 0.03,

    transitionMode: -1,
    transitionProgress: 0,
    transitionCentre: [0.5, 0.5],
    transitionColor: [1, 1, 1],
    transitionSoftness: 0.08,
    transitionAngle: 0,

    textRect: [0.1, 0.4, 0.8, 0.2],
    textColor: [1, 1, 1],
    textOpacity: 0,
    textGlow: 0.6,
    textScatter: 0.0,
  };
}

const DEFAULT_ENV = createEnvironment();
const DEFAULT_POST = createPostState();

function restore(target, source) {
  for (const key in source) {
    const v = source[key];
    if (Array.isArray(v)) {
      const dest = target[key];
      if (Array.isArray(dest) && dest.length === v.length && dest !== v) {
        for (let i = 0; i < v.length; i++) dest[i] = v[i];
      } else {
        target[key] = v.slice();
      }
    } else {
      target[key] = v;
    }
  }
  return target;
}

export function resetEnvironment(env) {
  return restore(env, DEFAULT_ENV);
}

export function resetPostState(post) {
  return restore(post, DEFAULT_POST);
}

export class CinematicFrame {
  constructor(budget) {
    this.primStore = new PrimStore(budget.prims);
    this.beamStore = new BeamStore(budget.beams);
    this.lights = new LightStore(budget.lights);
    this.particles = new ParticleBatch(budget.particles);
    this.trails = new TrailStore(budget.trailSegments);
    this.env = createEnvironment();
    this.post = createPostState();

    this.prims = this.primStore.groups;
    this.beams = this.beamStore.groups;
  }

  reset() {
    this.primStore.reset();
    this.beamStore.reset();
    this.lights.reset();
    this.particles.reset();
    this.trails.reset();
    resetEnvironment(this.env);
    resetPostState(this.post);
  }

  stats() {
    let prims = 0;
    for (const key in this.prims) prims += this.prims[key].count;
    let beams = 0;
    for (const key in this.beams) beams += this.beams[key].count;
    return {
      prims,
      beams,
      lights: this.lights.count,
      particles: this.particles.count,
      trailVerts: this.trails.count,
    };
  }
}
