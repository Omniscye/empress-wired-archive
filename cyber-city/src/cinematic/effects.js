import { vec3, quat, clamp, lerp, smoothstep, TAU, Ease, turbulence } from '../core/math.js';
import { rand1, rand2, rand3 } from '../city/rng.js';
import { CINE_KIND } from '../shaders/cinematic.js';
import { PARTICLE_KIND } from './particles.js';

const Q = quat.create();
const Q2 = quat.create();
const D = vec3.create();

export function emitLightShaft(beams, spec) {
  const dir = spec.direction || [0, -1, 0];
  vec3.normalize(D, dir);
  quat.fromUnitY(Q, [-D[0], -D[1], -D[2]]);
  const length = spec.length !== undefined ? spec.length : 120;
  const radius = spec.radius !== undefined ? spec.radius : 8;
  beams.add(spec.shape || 'cone', {
    position: [
      spec.origin[0] + D[0] * length * 0.5,
      spec.origin[1] + D[1] * length * 0.5,
      spec.origin[2] + D[2] * length * 0.5,
    ],
    rotation: Q,
    scale: [radius, length * 0.5, radius],
    color: spec.color || [0.62, 0.80, 1.0],
    intensity: spec.intensity !== undefined ? spec.intensity : 1.0,
    density: spec.density !== undefined ? spec.density : 1.0,
    taper: spec.taper !== undefined ? spec.taper : 1.0,
    dustScale: spec.dustScale !== undefined ? spec.dustScale : 0.06,
    seed: spec.seed || 0,
  });
}

export function emitCathedralLight(beams, lights, spec, time) {
  const count = spec.count || 9;
  const seed = spec.seed || 3;
  for (let i = 0; i < count; i++) {
    const f = i / count;
    const a = f * TAU + (spec.rotation || 0);
    const jitterR = rand1(i * 37 + seed);
    const jitterT = rand1(i * 91 + seed);
    const radius = lerp(spec.innerRadius || 20, spec.outerRadius || 90, jitterR);
    const x = spec.centre[0] + Math.cos(a) * radius;
    const z = spec.centre[2] + Math.sin(a) * radius;
    const breathe = 0.65 + 0.45 * Math.sin(time * (0.28 + jitterT * 0.5) + jitterT * 9.0);
    const tilt = (jitterT - 0.5) * (spec.tilt !== undefined ? spec.tilt : 0.22);

    emitLightShaft(beams, {
      origin: [x, spec.height || 180, z],
      direction: [tilt, -1, tilt * 0.6],
      length: spec.length || 220,
      radius: lerp(spec.beamMin || 4, spec.beamMax || 13, jitterR),
      color: spec.color || [0.70, 0.86, 1.0],
      intensity: (spec.intensity !== undefined ? spec.intensity : 1.0) * breathe,
      taper: 0.85,
      dustScale: 0.05,
      seed: i * 13 + seed,
    });

    if (lights && i % 2 === 0) {
      lights.add(x, (spec.height || 180) * 0.35, z, spec.lightRadius || 70,
        spec.color || [0.70, 0.86, 1.0],
        (spec.lightIntensity !== undefined ? spec.lightIntensity : 2.2) * breathe);
    }
  }
}

export function emitPortal(prims, lights, particles, spec, time) {
  const centre = spec.centre;
  const radius = spec.radius !== undefined ? spec.radius : 6;
  const open = clamp(spec.open !== undefined ? spec.open : 1, 0, 1);
  if (open <= 0.001) return;
  const colour = spec.color || [0.45, 0.78, 1.0];
  const inner = spec.innerColor || [0.9, 0.96, 1.0];
  const normal = spec.normal || [0, 1, 0];
  quat.fromUnitY(Q, normal);
  const r = radius * Ease.outBack(open);

  const rings = spec.rings !== undefined ? spec.rings : 3;
  for (let i = 0; i < rings; i++) {
    const f = i / Math.max(1, rings - 1);
    const rr = r * lerp(0.55, 1.0, f);
    const spin = time * (0.35 + i * 0.42) * (i % 2 === 0 ? 1 : -1);
    quat.fromEuler(Q2, 0, spin, 0);
    quat.multiply(Q2, Q, Q2);
    prims.add('torus', {
      position: centre,
      rotation: Q2,
      scale: [rr, rr * lerp(0.5, 0.28, f), rr],
      kind: CINE_KIND.ENERGY,
      albedo: [0.02, 0.02, 0.03],
      emissive: colour,
      metallic: 0.2,
      roughness: 0.25,
      glow: (spec.glow !== undefined ? spec.glow : 1.6) * lerp(1.2, 0.7, f) * open,
      seed: (spec.seed || 0) + i * 7,
    });
  }

  prims.add('ring', {
    position: centre,
    rotation: Q,
    scale: [r * 0.92, 1, r * 0.92],
    kind: CINE_KIND.STATION,
    albedo: inner,
    emissive: colour,
    metallic: 0.1,
    roughness: 0.2,
    glow: (spec.glow !== undefined ? spec.glow : 1.6) * open * 0.8,
    seed: (spec.seed || 0) + 3,
  });

  if (lights) {
    lights.add(centre[0], centre[1], centre[2], r * 5.5, colour,
      (spec.lightIntensity !== undefined ? spec.lightIntensity : 5.0) * open);
  }

  if (particles && spec.emit) {
    const n = Math.round(spec.emit * open);
    for (let i = 0; i < n; i++) {
      const a = rand2(i * 13 + Math.floor(time * 60), (spec.seed || 0)) * TAU;
      const rr = r * (0.4 + rand1(i * 71 + Math.floor(time * 60)) * 0.7);
      particles.spawn({
        x: centre[0] + Math.cos(a) * rr,
        y: centre[1] + (rand1(i * 5 + Math.floor(time * 60)) - 0.5) * r * 0.3,
        z: centre[2] + Math.sin(a) * rr,
        vx: Math.cos(a) * -1.2, vy: 2.4 + rand1(i) * 3.0, vz: Math.sin(a) * -1.2,
        life: 1.4 + rand1(i * 3) * 1.4,
        size0: 0.06 + rand1(i * 9) * 0.10, size1: 0.0,
        r: inner[0], g: inner[1], b: inner[2],
        i0: 2.6, i1: 0, drag: 0.7, gravity: 0,
        kind: PARTICLE_KIND.SPARK, turbulence: 1.2, softness: 0.5,
      });
    }
  }
}

export function emitMagicCircle(prims, spec, time) {
  const layers = spec.layers !== undefined ? spec.layers : 3;
  const normal = spec.normal || [0, 1, 0];
  quat.fromUnitY(Q, normal);
  for (let i = 0; i < layers; i++) {
    const f = layers > 1 ? i / (layers - 1) : 0;
    const r = spec.radius * lerp(1.0, 0.42, f);
    const spin = time * (spec.spin !== undefined ? spec.spin : 0.2) * (i % 2 ? -1.6 : 1.0);
    quat.fromEuler(Q2, 0, spin, 0);
    quat.multiply(Q2, Q, Q2);
    prims.add('ring', {
      position: [spec.centre[0], spec.centre[1] + f * (spec.spacing || 0.05), spec.centre[2]],
      rotation: Q2,
      scale: [r, 1, r],
      kind: CINE_KIND.STATION,
      albedo: spec.color || [1.0, 0.86, 0.55],
      emissive: spec.emissive || [0.45, 0.78, 1.0],
      metallic: 0.15,
      roughness: 0.25,
      glow: (spec.glow !== undefined ? spec.glow : 1.4) * lerp(1.0, 0.6, f),
      opacity: spec.opacity !== undefined ? spec.opacity : 1,
      seed: (spec.seed || 0) + i * 11,
    });
  }
}

export function emitShockwave(prims, lights, spec, age) {
  if (age < 0) return;
  const life = spec.life !== undefined ? spec.life : 0.9;
  if (age > life) return;
  const t = age / life;
  const r = (spec.radius !== undefined ? spec.radius : 20) * Ease.outQuart(t);
  const fade = 1 - t;
  const normal = spec.normal || [0, 1, 0];
  quat.fromUnitY(Q, normal);
  prims.add('torus', {
    position: spec.centre,
    rotation: Q,
    scale: [r, r * 0.22 * fade + 0.02, r],
    kind: CINE_KIND.ENERGY,
    albedo: [0.02, 0.02, 0.03],
    emissive: spec.color || [0.85, 0.94, 1.0],
    metallic: 0.1,
    roughness: 0.3,
    glow: (spec.glow !== undefined ? spec.glow : 3.0) * fade * fade,
    opacity: clamp(fade * 1.6, 0, 1),
    seed: spec.seed || 0,
  });
  if (lights) {
    lights.add(spec.centre[0], spec.centre[1], spec.centre[2], r * 2.2 + 6,
      spec.color || [0.85, 0.94, 1.0],
      (spec.lightIntensity !== undefined ? spec.lightIntensity : 8) * fade * fade);
  }
}

export class ShardField {
  constructor(options = {}) {
    this.count = options.count !== undefined ? options.count : 260;
    this.seed = options.seed !== undefined ? options.seed : 5;
    this.radius = options.radius !== undefined ? options.radius : 90;
    this.height = options.height !== undefined ? options.height : 60;
    this.centre = options.centre || [0, 0, 0];
    this.sizeMin = options.sizeMin !== undefined ? options.sizeMin : 0.4;
    this.sizeMax = options.sizeMax !== undefined ? options.sizeMax : 3.4;
    this.spin = options.spin !== undefined ? options.spin : 0.25;
    this.drift = options.drift !== undefined ? options.drift : 0.6;
    this.albedo = options.albedo || [0.12, 0.20, 0.34];
    this.emissive = options.emissive || [0.40, 0.72, 1.0];
    this.kind = options.kind !== undefined ? options.kind : CINE_KIND.SHARD;
    this.glow = options.glow !== undefined ? options.glow : 1.0;
    this.explode = 0;
    this.explodeSpeed = options.explodeSpeed !== undefined ? options.explodeSpeed : 45;
  }

  emit(prims, time, opts = {}) {
    const n = Math.min(this.count, opts.count !== undefined ? opts.count : this.count);
    const groups = ['shard0', 'shard1', 'shard2', 'shard3'];
    const explode = opts.explode !== undefined ? opts.explode : this.explode;
    const glow = (opts.glow !== undefined ? opts.glow : this.glow);
    const opacity = opts.opacity !== undefined ? opts.opacity : 1;
    const dissolve = opts.dissolve || 0;
    const scale = opts.scale !== undefined ? opts.scale : 1;

    for (let i = 0; i < n; i++) {
      const s = this.seed;
      const a = rand2(i * 3 + s, 17) * TAU;
      const rr = Math.sqrt(rand2(i * 7 + s, 41)) * this.radius;
      const hy = (rand2(i * 11 + s, 73) - 0.5) * this.height;
      const phase = rand2(i * 13 + s, 97) * TAU;
      const size = lerp(this.sizeMin, this.sizeMax, Math.pow(rand2(i * 17 + s, 5), 1.7)) * scale;

      const driftT = time * this.drift + phase;
      let px = this.centre[0] + Math.cos(a) * rr + Math.sin(driftT * 0.7) * 1.6;
      let py = this.centre[1] + hy + Math.sin(driftT) * 2.2;
      let pz = this.centre[2] + Math.sin(a) * rr + Math.cos(driftT * 0.63) * 1.6;

      if (explode > 0.0001) {
        const dx = px - this.centre[0];
        const dy = py - this.centre[1];
        const dz = pz - this.centre[2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        const push = explode * this.explodeSpeed * (0.5 + rand2(i * 23 + s, 3));
        px += (dx / dl) * push;
        py += (dy / dl) * push + explode * explode * 6.0 * (rand2(i * 29 + s, 11) - 0.5);
        pz += (dz / dl) * push;
      }

      const spinT = time * this.spin * (1 + rand2(i * 19 + s, 61) * 2.5) + explode * 9.0;
      quat.fromEuler(Q,
        spinT * (0.6 + rand2(i * 31 + s, 7)),
        spinT * (0.9 + rand2(i * 37 + s, 13)),
        spinT * (0.4 + rand2(i * 41 + s, 19)));

      prims.add(groups[i & 3], {
        position: [px, py, pz],
        rotation: Q,
        scale: [size, size * lerp(0.5, 1.4, rand2(i * 43 + s, 23)), size],
        kind: this.kind,
        albedo: this.albedo,
        emissive: this.emissive,
        metallic: 0.7,
        roughness: 0.08,
        glow: glow * (0.6 + rand2(i * 47 + s, 29) * 0.9),
        opacity,
        dissolve,
        seed: i * 3.7 + s,
      });
    }
  }
}

export function emitGlassBurst(prims, spec, age) {
  const life = spec.life !== undefined ? spec.life : 3.0;
  if (age < 0 || age > life) return;
  const t = age / life;
  const groups = ['shard0', 'shard1', 'shard2', 'shard3'];
  const n = spec.count || 220;
  const seed = spec.seed || 91;
  const fade = 1 - smoothstep(0.6, 1.0, t);

  for (let i = 0; i < n; i++) {
    const z = rand2(i * 5 + seed, 3) * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = rand2(i * 9 + seed, 7) * TAU;
    const dx = r * Math.cos(phi);
    const dy = z;
    const dz = r * Math.sin(phi);
    const speed = lerp(spec.speedMin || 6, spec.speedMax || 34, rand2(i * 11 + seed, 13));
    const drag = 0.55;
    const travel = (speed / drag) * (1 - Math.exp(-drag * age));

    const px = spec.centre[0] + dx * travel;
    const py = spec.centre[1] + dy * travel - 0.5 * (spec.gravity || 0) * age * age;
    const pz = spec.centre[2] + dz * travel;

    const spin = age * lerp(2.0, 9.0, rand2(i * 13 + seed, 17));
    quat.fromEuler(Q, spin * 0.8, spin * 1.3, spin * 0.5);
    const size = lerp(spec.sizeMin || 0.18, spec.sizeMax || 1.5, Math.pow(rand2(i * 17 + seed, 19), 1.6));

    prims.add(groups[i & 3], {
      position: [px, py, pz],
      rotation: Q,
      scale: [size, size * 1.3, size],
      kind: CINE_KIND.SHARD,
      albedo: spec.albedo || [0.16, 0.24, 0.38],
      emissive: spec.color || [0.72, 0.88, 1.0],
      metallic: 0.75,
      roughness: 0.06,
      glow: (spec.glow !== undefined ? spec.glow : 1.6) * fade,
      opacity: fade,
      seed: i * 2.3 + seed,
    });
  }
}

export class MemoryField {
  constructor(options = {}) {
    this.count = options.count !== undefined ? options.count : 60;
    this.seed = options.seed !== undefined ? options.seed : 21;
    this.radius = options.radius !== undefined ? options.radius : 60;
    this.height = options.height !== undefined ? options.height : 44;
    this.centre = options.centre || [0, 0, 0];
    this.sizeMin = options.sizeMin !== undefined ? options.sizeMin : 1.6;
    this.sizeMax = options.sizeMax !== undefined ? options.sizeMax : 7.0;
    this.palette = options.palette || [
      [0.95, 0.78, 0.52],
      [0.55, 0.78, 1.00],
      [0.86, 0.56, 0.86],
      [0.62, 0.94, 0.86],
    ];
    this.frame = options.frame || [0.98, 0.92, 0.78];
    this.drift = options.drift !== undefined ? options.drift : 0.22;
  }

  positionOf(i, time, out, opts = {}) {
    const s = this.seed;
    const a = rand2(i * 3 + s, 29) * TAU;
    const rr = lerp(0.25, 1.0, Math.sqrt(rand2(i * 7 + s, 31))) * this.radius;
    const hy = (rand2(i * 11 + s, 37) - 0.5) * this.height;
    const phase = rand2(i * 13 + s, 43) * TAU;
    const swirl = (opts.swirl || 0) * time;
    const conv = opts.converge || 0;
    const t = time * this.drift + phase;
    out[0] = this.centre[0] + Math.cos(a + swirl) * rr * (1 - conv) + Math.sin(t) * 1.4;
    out[1] = this.centre[1] + hy * (1 - conv * 0.7) + Math.sin(t * 0.8 + 1.1) * 1.2 + (opts.rise || 0) * time;
    out[2] = this.centre[2] + Math.sin(a + swirl) * rr * (1 - conv) + Math.cos(t * 0.9) * 1.4;
    return out;
  }

  emit(prims, lights, time, opts = {}) {
    const n = Math.min(this.count, opts.count !== undefined ? opts.count : this.count);
    const p = vec3.create();
    const glow = opts.glow !== undefined ? opts.glow : 1.0;
    const explode = opts.explode || 0;
    const dissolve = opts.dissolve || 0;
    const opacity = opts.opacity !== undefined ? opts.opacity : 1;

    for (let i = 0; i < n; i++) {
      const s = this.seed;
      this.positionOf(i, time, p, opts);
      if (explode > 0.0001) {
        const dx = p[0] - this.centre[0];
        const dy = p[1] - this.centre[1];
        const dz = p[2] - this.centre[2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        const push = explode * 70 * (0.5 + rand2(i * 53 + s, 3));
        p[0] += (dx / dl) * push;
        p[1] += (dy / dl) * push;
        p[2] += (dz / dl) * push;
      }

      const size = lerp(this.sizeMin, this.sizeMax, Math.pow(rand2(i * 17 + s, 47), 1.5));
      const aspect = lerp(0.62, 1.5, rand2(i * 19 + s, 53));
      const tumble = time * (0.10 + rand2(i * 23 + s, 59) * 0.24) + explode * 7.0;
      quat.fromEuler(Q,
        Math.sin(tumble * 0.7) * 0.55,
        tumble,
        Math.sin(tumble * 0.43 + 1.7) * 0.32);

      const colour = this.palette[i % this.palette.length];
      prims.add('quad', {
        position: p,
        rotation: Q,
        scale: [size * aspect, size, 1],
        kind: CINE_KIND.MEMORY,
        albedo: colour,
        emissive: this.frame,
        metallic: 0.0,
        roughness: 0.25,
        glow: glow * (0.7 + rand2(i * 29 + s, 61) * 0.7),
        dissolve,
        opacity,
        seed: i * 5.1 + s,
      });

      if (lights && i % 5 === 0) {
        lights.add(p[0], p[1], p[2], size * 4.5,
          colour, 1.6 * glow * opacity);
      }
    }
  }
}

export function emitStation(prims, lights, spec, time) {
  const centre = spec.centre;
  const radius = spec.radius !== undefined ? spec.radius : 22;
  const build = clamp(spec.build !== undefined ? spec.build : 1, 0, 1);
  if (build <= 0.001) return;
  const glow = (spec.glow !== undefined ? spec.glow : 1.4);
  const segments = spec.segments !== undefined ? spec.segments : 16;
  const warm = spec.warm || [1.0, 0.80, 0.42];
  const cool = spec.cool || [0.36, 0.70, 1.0];

  for (let i = 0; i < segments; i++) {
    const f = i / segments;
    const appear = clamp((build - f * 0.55) / 0.45, 0, 1);
    if (appear <= 0.002) continue;
    const a = f * TAU + (spec.rotation || 0);
    quat.fromEuler(Q, 0, -a, 0);
    const r = radius * Ease.outCubic(appear);
    prims.add('ring', {
      position: [centre[0], centre[1], centre[2]],
      rotation: Q,
      scale: [r, 1, r],
      kind: CINE_KIND.STATION,
      albedo: warm,
      emissive: cool,
      metallic: 0.28,
      roughness: 0.16,
      glow: glow * appear,
      opacity: appear,
      seed: 3.0 + i * 0.0,
    });
  }

  quat.identity(Q);
  prims.add('torus', {
    position: [centre[0], centre[1] - 0.05, centre[2]],
    rotation: Q,
    scale: [radius * 1.005 * Ease.outCubic(build), radius * 0.02, radius * 1.005 * Ease.outCubic(build)],
    kind: CINE_KIND.BLADE,
    albedo: [0.5, 0.45, 0.34],
    emissive: warm,
    metallic: 0.9,
    roughness: 0.2,
    glow: glow * 1.2 * build,
    seed: 7,
  });

  const halo = spec.halo !== undefined ? spec.halo : 2;
  for (let i = 0; i < halo; i++) {
    const f = i / Math.max(1, halo);
    const spin = time * (0.11 + i * 0.07) * (i % 2 ? -1 : 1);
    quat.fromEuler(Q, Math.sin(time * 0.13 + i) * 0.10, spin, Math.cos(time * 0.11 + i) * 0.08);
    const rr = radius * lerp(1.28, 1.92, f) * build;
    prims.add('torus', {
      position: [centre[0], centre[1] + lerp(3.0, 9.0, f), centre[2]],
      rotation: Q,
      scale: [rr, rr * 0.012, rr],
      kind: CINE_KIND.ENERGY,
      albedo: [0.02, 0.02, 0.03],
      emissive: i % 2 ? warm : cool,
      metallic: 0.2,
      roughness: 0.3,
      glow: glow * 0.9 * build,
      opacity: build,
      seed: 11 + i,
    });
  }

  if (lights) {
    lights.add(centre[0], centre[1] + 2.0, centre[2], radius * 3.4, warm,
      (spec.lightIntensity !== undefined ? spec.lightIntensity : 4.2) * build);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + time * 0.08;
      lights.add(
        centre[0] + Math.cos(a) * radius * 0.72,
        centre[1] + 0.6,
        centre[2] + Math.sin(a) * radius * 0.72,
        radius * 1.1, i % 2 ? cool : warm, 2.6 * build);
    }
  }
}

export class FloatingArchitecture {
  constructor(options = {}) {
    this.seed = options.seed !== undefined ? options.seed : 404;
    this.count = options.count !== undefined ? options.count : 90;
    this.radius = options.radius !== undefined ? options.radius : 320;
    this.height = options.height !== undefined ? options.height : 200;
    this.centre = options.centre || [0, 0, 0];
    this.albedo = options.albedo || [0.10, 0.12, 0.17];
    this.emissive = options.emissive || [0.32, 0.62, 1.0];
    this.accent = options.accent || [1.0, 0.62, 0.30];
    this.drift = options.drift !== undefined ? options.drift : 0.10;
  }

  islandAt(i, time, out) {
    const s = this.seed;
    const a = rand2(i * 3 + s, 71) * TAU;
    const rr = lerp(0.18, 1.0, Math.pow(rand2(i * 7 + s, 73), 0.7)) * this.radius;
    const hy = (rand2(i * 11 + s, 79) - 0.42) * this.height;
    const phase = rand2(i * 13 + s, 83) * TAU;
    const t = time * this.drift + phase;
    out[0] = this.centre[0] + Math.cos(a) * rr;
    out[1] = this.centre[1] + hy + Math.sin(t) * 2.6;
    out[2] = this.centre[2] + Math.sin(a) * rr;
    return out;
  }

  emit(prims, lights, time, opts = {}) {
    const n = Math.min(this.count, opts.count !== undefined ? opts.count : this.count);
    const p = vec3.create();
    const glow = opts.glow !== undefined ? opts.glow : 1.0;
    const scatter = opts.scatter || 0;
    const s = this.seed;

    for (let i = 0; i < n; i++) {
      this.islandAt(i, time, p);
      if (scatter > 0) {
        const dx = p[0] - this.centre[0];
        const dy = p[1] - this.centre[1];
        const dz = p[2] - this.centre[2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        p[0] += (dx / dl) * scatter * 90;
        p[1] += (dy / dl) * scatter * 60;
        p[2] += (dz / dl) * scatter * 90;
      }

      const slabW = lerp(6, 34, rand2(i * 17 + s, 89));
      const slabD = lerp(6, 30, rand2(i * 19 + s, 97));
      const slabH = lerp(1.2, 5.0, rand2(i * 23 + s, 101));
      const yaw = rand2(i * 29 + s, 103) * TAU;
      const tilt = (rand2(i * 31 + s, 107) - 0.5) * 0.30;
      const roll = (rand2(i * 37 + s, 109) - 0.5) * 0.24;
      const slowSpin = time * this.drift * (rand2(i * 41 + s, 113) - 0.5) * 0.8;
      quat.fromEuler(Q, tilt, yaw + slowSpin, roll);

      prims.add('box', {
        position: p,
        rotation: Q,
        scale: [slabW * 0.5, slabH * 0.5, slabD * 0.5],
        kind: CINE_KIND.STONE,
        albedo: this.albedo,
        emissive: this.emissive,
        metallic: 0.06,
        roughness: 0.68,
        glow: glow * 0.35,
        seed: i * 1.9 + s,
      });

      const towers = Math.floor(rand2(i * 43 + s, 127) * 3.2);
      for (let k = 0; k < towers; k++) {
        const tw = lerp(1.4, 5.0, rand3(i, k, s));
        const th = lerp(5, 34, rand3(i + 7, k, s));
        const ox = (rand3(i + 11, k, s) - 0.5) * slabW * 0.6;
        const oz = (rand3(i + 13, k, s) - 0.5) * slabD * 0.6;
        vec3.set(D, ox, slabH * 0.5 + th * 0.5, oz);
        quat.rotateVec3(D, Q, D);
        const lit = rand3(i + 17, k, s) > 0.55;
        prims.add('box', {
          position: [p[0] + D[0], p[1] + D[1], p[2] + D[2]],
          rotation: Q,
          scale: [tw * 0.5, th * 0.5, tw * 0.5],
          kind: CINE_KIND.STONE,
          albedo: this.albedo,
          emissive: lit ? this.accent : this.emissive,
          metallic: 0.08,
          roughness: 0.56,
          glow: glow * (lit ? 1.5 : 0.4),
          seed: i * 3.1 + k * 7.7 + s,
        });

        if (lights && lit && k === 0 && i % 3 === 0) {
          lights.add(p[0] + D[0], p[1] + D[1] + th * 0.4, p[2] + D[2],
            th * 1.6 + 12, this.accent, 2.4 * glow);
        }
      }

      if (i > 0 && rand2(i * 47 + s, 131) > 0.55) {
        const q = vec3.create();
        this.islandAt(i - 1, time, q);
        const mx = (p[0] + q[0]) * 0.5;
        const my = (p[1] + q[1]) * 0.5;
        const mz = (p[2] + q[2]) * 0.5;
        vec3.set(D, q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        const len = vec3.length(D);
        if (len < 160) {
          quat.fromUnitY(Q2, D);
          prims.add('cylinder', {
            position: [mx, my, mz],
            rotation: Q2,
            scale: [0.16, len * 0.5, 0.16],
            kind: CINE_KIND.TUBE,
            albedo: [0.02, 0.02, 0.03],
            emissive: this.emissive,
            metallic: 0.1,
            roughness: 0.3,
            glow: glow * 1.4,
            seed: i * 0.7 + s,
          });
        }
      }
    }
  }
}

export function emitSpeedStreaks(particles, camera, spec, time) {
  const count = spec.count || 90;
  const seed = spec.seed || 55;
  const forward = camera.forward;
  const right = camera.right;
  const up = vec3.create();
  vec3.cross(up, right, forward);
  vec3.normalize(up, up);

  for (let i = 0; i < count; i++) {
    const a = rand2(i * 3 + seed, 5) * TAU;
    const rr = lerp(spec.innerRadius || 2.5, spec.outerRadius || 22, Math.sqrt(rand2(i * 7 + seed, 11)));
    const cycle = (time * (spec.speed || 1.4) + rand2(i * 11 + seed, 13)) % 1;
    const depth = lerp(spec.near || 3, spec.far || 60, 1 - cycle);
    const fade = Math.sin(cycle * Math.PI);

    const px = camera.position[0] + forward[0] * depth + (right[0] * Math.cos(a) + up[0] * Math.sin(a)) * rr;
    const py = camera.position[1] + forward[1] * depth + (right[1] * Math.cos(a) + up[1] * Math.sin(a)) * rr;
    const pz = camera.position[2] + forward[2] * depth + (right[2] * Math.cos(a) + up[2] * Math.sin(a)) * rr;

    particles.add(px, py, pz,
      (spec.size || 0.5) * lerp(0.5, 1.6, rand2(i * 13 + seed, 17)),
      spec.color[0], spec.color[1], spec.color[2],
      (spec.intensity !== undefined ? spec.intensity : 2.0) * fade,
      a + Math.PI * 0.5,
      0.35, PARTICLE_KIND.STREAK, i);
  }
}

export function emitDissolveSparks(particles, spec, time) {
  const count = spec.count || 40;
  const seed = spec.seed || 3;
  const amount = clamp(spec.amount || 0, 0, 1);
  if (amount <= 0.001) return;
  for (let i = 0; i < count; i++) {
    const a = rand2(i * 3 + seed, 19) * TAU;
    const z = rand2(i * 7 + seed, 23) * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const rr = spec.radius * lerp(0.5, 1.05, rand2(i * 11 + seed, 29));
    const t = time * 0.9 + rand2(i * 13 + seed, 31) * TAU;
    const rise = ((t * 0.35) % 1);
    particles.add(
      spec.centre[0] + r * Math.cos(a) * rr,
      spec.centre[1] + z * rr + rise * spec.radius * 1.4,
      spec.centre[2] + r * Math.sin(a) * rr,
      (spec.size || 0.07) * (1 - rise * 0.6),
      spec.color[0], spec.color[1], spec.color[2],
      (spec.intensity !== undefined ? spec.intensity : 2.6) * amount * (1 - rise),
      t, 0.55, PARTICLE_KIND.SPARK, i);
  }
}

export function emitVoidFloor(prims, spec) {
  quat.identity(Q);
  prims.add('box', {
    position: [spec.centre[0], spec.centre[1] - (spec.thickness || 4) * 0.5, spec.centre[2]],
    rotation: Q,
    scale: [(spec.size || 400) * 0.5, (spec.thickness || 4) * 0.5, (spec.size || 400) * 0.5],
    kind: spec.kind !== undefined ? spec.kind : CINE_KIND.VOIDGLASS,
    albedo: spec.albedo || [0.02, 0.025, 0.04],
    emissive: spec.emissive || [0.12, 0.28, 0.55],
    metallic: spec.metallic !== undefined ? spec.metallic : 0.85,
    roughness: spec.roughness !== undefined ? spec.roughness : 0.09,
    glow: spec.glow !== undefined ? spec.glow : 0.6,
    opacity: spec.opacity !== undefined ? spec.opacity : 1,
    seed: spec.seed || 1,
  });
}

export function emitEnergyCore(prims, lights, spec, time) {
  const centre = spec.centre;
  const r = spec.radius !== undefined ? spec.radius : 4;
  const pulse = 1 + Math.sin(time * (spec.rate || 1.6)) * 0.08 + (spec.punch || 0) * 0.35;
  const colour = spec.color || [0.85, 0.94, 1.0];
  quat.fromEuler(Q, time * 0.3, time * 0.42, 0);

  prims.add('sphere', {
    position: centre,
    rotation: Q,
    scale: r * pulse,
    kind: CINE_KIND.ENERGY,
    albedo: [0.02, 0.02, 0.03],
    emissive: colour,
    metallic: 0.0,
    roughness: 0.3,
    glow: (spec.glow !== undefined ? spec.glow : 2.2) * pulse,
    opacity: spec.opacity !== undefined ? spec.opacity : 1,
    seed: spec.seed || 5,
  });

  const shells = spec.shells !== undefined ? spec.shells : 2;
  for (let i = 0; i < shells; i++) {
    const f = (i + 1) / (shells + 1);
    quat.fromEuler(Q2, time * (0.4 + i * 0.3), time * (0.25 - i * 0.2), time * 0.15);
    prims.add('torus', {
      position: centre,
      rotation: Q2,
      scale: [r * (1.6 + f * 1.1) * pulse, r * 0.06, r * (1.6 + f * 1.1) * pulse],
      kind: CINE_KIND.ENERGY,
      albedo: [0.02, 0.02, 0.03],
      emissive: colour,
      metallic: 0.1,
      roughness: 0.3,
      glow: (spec.glow !== undefined ? spec.glow : 2.2) * 0.7,
      opacity: spec.opacity !== undefined ? spec.opacity : 1,
      seed: (spec.seed || 5) + i,
    });
  }

  if (lights) {
    lights.add(centre[0], centre[1], centre[2], r * (spec.lightRadius || 14), colour,
      (spec.lightIntensity !== undefined ? spec.lightIntensity : 9) * pulse);
  }
}

export { turbulence, Ease };
