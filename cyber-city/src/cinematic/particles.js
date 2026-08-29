import { clamp, lerp, TAU, turbulence } from '../core/math.js';
import { Rng, rand2, rand3 } from '../city/rng.js';

export const PARTICLE_KIND = {
  MOTE: 0,
  SPARK: 1,
  STREAK: 2,
  RING: 3,
  FRAGMENT: 4,
};

const STRIDE = 26;
const P_X = 0, P_Y = 1, P_Z = 2;
const P_VX = 3, P_VY = 4, P_VZ = 5;
const P_AGE = 6, P_LIFE = 7;
const P_SIZE0 = 8, P_SIZE1 = 9;
const P_R = 10, P_G = 11, P_B = 12;
const P_I0 = 13, P_I1 = 14;
const P_DRAG = 15, P_GRAV = 16;
const P_KIND = 17, P_SEED = 18;
const P_SPIN = 19, P_TURB = 20, P_SOFT = 21;
const P_AX = 22, P_AY = 23, P_AZ = 24, P_ASTR = 25;

export class ParticlePool {
  constructor(capacity = 20000) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * STRIDE);
    this.count = 0;
    this.rng = new Rng(0x5eed1a);
    this.spawnSerial = 0;
  }

  reset() {
    this.count = 0;
    this.rng = new Rng(0x5eed1a);
    this.spawnSerial = 0;
  }

  get alive() {
    return this.count;
  }

  spawn(spec) {
    if (this.count >= this.capacity) return false;
    const o = (this.count++) * STRIDE;
    const d = this.data;
    d[o + P_X] = spec.x;
    d[o + P_Y] = spec.y;
    d[o + P_Z] = spec.z;
    d[o + P_VX] = spec.vx || 0;
    d[o + P_VY] = spec.vy || 0;
    d[o + P_VZ] = spec.vz || 0;
    d[o + P_AGE] = 0;
    d[o + P_LIFE] = spec.life !== undefined ? spec.life : 1.5;
    d[o + P_SIZE0] = spec.size0 !== undefined ? spec.size0 : 0.1;
    d[o + P_SIZE1] = spec.size1 !== undefined ? spec.size1 : 0.0;
    d[o + P_R] = spec.r !== undefined ? spec.r : 1;
    d[o + P_G] = spec.g !== undefined ? spec.g : 1;
    d[o + P_B] = spec.b !== undefined ? spec.b : 1;
    d[o + P_I0] = spec.i0 !== undefined ? spec.i0 : 1;
    d[o + P_I1] = spec.i1 !== undefined ? spec.i1 : 0;
    d[o + P_DRAG] = spec.drag !== undefined ? spec.drag : 0.9;
    d[o + P_GRAV] = spec.gravity !== undefined ? spec.gravity : 0;
    d[o + P_KIND] = spec.kind !== undefined ? spec.kind : PARTICLE_KIND.MOTE;
    d[o + P_SEED] = spec.seed !== undefined ? spec.seed : (this.spawnSerial++ % 1024);
    d[o + P_SPIN] = spec.spin !== undefined ? spec.spin : 0;
    d[o + P_TURB] = spec.turbulence !== undefined ? spec.turbulence : 0;
    d[o + P_SOFT] = spec.softness !== undefined ? spec.softness : 0.5;
    d[o + P_AX] = spec.attractX || 0;
    d[o + P_AY] = spec.attractY || 0;
    d[o + P_AZ] = spec.attractZ || 0;
    d[o + P_ASTR] = spec.attract || 0;
    return true;
  }

  burst(spec) {
    const count = Math.min(spec.count || 40, this.capacity - this.count);
    const rng = this.rng;
    const spread = spec.spread !== undefined ? spec.spread : Math.PI;
    const dir = spec.direction;
    for (let i = 0; i < count; i++) {
      let dx;
      let dy;
      let dz;
      if (dir) {
        const cosSpread = Math.cos(spread);
        const z = lerp(cosSpread, 1, rng.float());
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const phi = rng.float() * TAU;

        const ax = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const ux = dir[1] * ax[2] - dir[2] * ax[1];
        const uy = dir[2] * ax[0] - dir[0] * ax[2];
        const uz = dir[0] * ax[1] - dir[1] * ax[0];
        const ul = Math.hypot(ux, uy, uz) || 1;
        const vx = dir[1] * (uz / ul) - dir[2] * (uy / ul);
        const vy = dir[2] * (ux / ul) - dir[0] * (uz / ul);
        const vz = dir[0] * (uy / ul) - dir[1] * (ux / ul);
        dx = dir[0] * z + (ux / ul) * r * Math.cos(phi) + vx * r * Math.sin(phi);
        dy = dir[1] * z + (uy / ul) * r * Math.cos(phi) + vy * r * Math.sin(phi);
        dz = dir[2] * z + (uz / ul) * r * Math.cos(phi) + vz * r * Math.sin(phi);
      } else {
        const z = rng.range(-1, 1);
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const phi = rng.float() * TAU;
        dx = r * Math.cos(phi);
        dy = z;
        dz = r * Math.sin(phi);
      }
      const speed = rng.range(spec.speedMin !== undefined ? spec.speedMin : 2,
        spec.speedMax !== undefined ? spec.speedMax : 9);
      const radius = spec.radius ? rng.float() * spec.radius : 0;
      const tint = rng.float();
      this.spawn({
        x: spec.x + dx * radius,
        y: spec.y + dy * radius,
        z: spec.z + dz * radius,
        vx: dx * speed + (spec.driftX || 0),
        vy: dy * speed + (spec.driftY || 0),
        vz: dz * speed + (spec.driftZ || 0),
        life: rng.range(spec.lifeMin !== undefined ? spec.lifeMin : 0.6,
          spec.lifeMax !== undefined ? spec.lifeMax : 2.0),
        size0: rng.range(spec.sizeMin !== undefined ? spec.sizeMin : 0.05,
          spec.sizeMax !== undefined ? spec.sizeMax : 0.20),
        size1: spec.size1 !== undefined ? spec.size1 : 0,
        r: lerp(spec.color[0], spec.color2 ? spec.color2[0] : spec.color[0], tint),
        g: lerp(spec.color[1], spec.color2 ? spec.color2[1] : spec.color[1], tint),
        b: lerp(spec.color[2], spec.color2 ? spec.color2[2] : spec.color[2], tint),
        i0: spec.intensity !== undefined ? spec.intensity : 2.4,
        i1: 0,
        drag: spec.drag !== undefined ? spec.drag : 1.4,
        gravity: spec.gravity !== undefined ? spec.gravity : 0,
        kind: spec.kind !== undefined ? spec.kind : PARTICLE_KIND.SPARK,
        spin: rng.range(-6, 6),
        turbulence: spec.turbulence || 0,
        softness: spec.softness !== undefined ? spec.softness : 0.6,
        attractX: spec.attractX || 0,
        attractY: spec.attractY || 0,
        attractZ: spec.attractZ || 0,
        attract: spec.attract || 0,
      });
    }
  }

  update(dt, time) {
    const d = this.data;
    let i = 0;
    while (i < this.count) {
      const o = i * STRIDE;
      const age = d[o + P_AGE] + dt;
      if (age >= d[o + P_LIFE]) {

        const last = (this.count - 1) * STRIDE;
        if (last !== o) d.copyWithin(o, last, last + STRIDE);
        this.count--;
        continue;
      }
      d[o + P_AGE] = age;

      const turb = d[o + P_TURB];
      if (turb > 0) {
        const s = time * 0.6 + d[o + P_SEED] * 0.37;
        d[o + P_VX] += turbulence(s, 2) * turb * dt;
        d[o + P_VY] += turbulence(s + 17.3, 2) * turb * dt;
        d[o + P_VZ] += turbulence(s + 41.9, 2) * turb * dt;
      }

      const attract = d[o + P_ASTR];
      if (attract !== 0) {
        const ax = d[o + P_AX] - d[o + P_X];
        const ay = d[o + P_AY] - d[o + P_Y];
        const az = d[o + P_AZ] - d[o + P_Z];
        const len = Math.hypot(ax, ay, az) || 1;
        const pull = attract * dt / len;
        d[o + P_VX] += ax * pull;
        d[o + P_VY] += ay * pull;
        d[o + P_VZ] += az * pull;
      }

      d[o + P_VY] += d[o + P_GRAV] * dt;

      const damp = Math.exp(-d[o + P_DRAG] * dt);
      d[o + P_VX] *= damp;
      d[o + P_VY] *= damp;
      d[o + P_VZ] *= damp;

      d[o + P_X] += d[o + P_VX] * dt;
      d[o + P_Y] += d[o + P_VY] * dt;
      d[o + P_Z] += d[o + P_VZ] * dt;
      i++;
    }
  }

  emit(batch, time, scale = 1) {
    const d = this.data;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      const t = d[o + P_AGE] / d[o + P_LIFE];
      const fade = 1 - t;
      const size = lerp(d[o + P_SIZE0], d[o + P_SIZE1], t) * scale;
      if (size <= 0.0001) continue;
      const intensity = lerp(d[o + P_I0], d[o + P_I1], t) * fade;
      if (intensity <= 0.001) continue;
      batch.add(
        d[o + P_X], d[o + P_Y], d[o + P_Z], size,
        d[o + P_R], d[o + P_G], d[o + P_B], intensity,
        d[o + P_SPIN] * (time + d[o + P_SEED]),
        d[o + P_SOFT], d[o + P_KIND], d[o + P_SEED]);
    }
  }
}

export class MoteField {
  constructor(options = {}) {
    this.cellSize = options.cellSize !== undefined ? options.cellSize : 6.0;
    this.radius = options.radius !== undefined ? options.radius : 5;
    this.density = options.density !== undefined ? options.density : 1.0;
    this.size = options.size !== undefined ? options.size : 0.05;
    this.sizeVariation = options.sizeVariation !== undefined ? options.sizeVariation : 1.4;
    this.color = options.color || [0.55, 0.78, 1.0];
    this.color2 = options.color2 || [0.85, 0.92, 1.0];
    this.intensity = options.intensity !== undefined ? options.intensity : 1.2;
    this.drift = options.drift !== undefined ? options.drift : 0.35;
    this.rise = options.rise !== undefined ? options.rise : 0.12;
    this.kind = options.kind !== undefined ? options.kind : PARTICLE_KIND.MOTE;
    this.softness = options.softness !== undefined ? options.softness : 0.45;
    this.twinkle = options.twinkle !== undefined ? options.twinkle : 0.5;
    this.seed = options.seed !== undefined ? options.seed : 1;
    this.flow = options.flow || [0, 0, 0];
  }

  emit(batch, cameraPos, time, scale = 1, intensityScale = 1) {
    const cs = this.cellSize;
    const r = this.radius;
    const cx = Math.floor(cameraPos[0] / cs);
    const cy = Math.floor(cameraPos[1] / cs);
    const cz = Math.floor(cameraPos[2] / cs);
    const maxDist = (r + 0.5) * cs;
    const maxDistSq = maxDist * maxDist;
    const seed = this.seed;

    for (let iz = -r; iz <= r; iz++) {
      for (let iy = -r; iy <= r; iy++) {
        for (let ix = -r; ix <= r; ix++) {
          const gx = cx + ix;
          const gy = cy + iy;
          const gz = cz + iz;
          const h = rand3(gx * 7 + seed, gy * 13, gz * 17);
          if (h > this.density) continue;

          const ox = rand3(gx, gy, gz + 101);
          const oy = rand3(gx + 31, gy, gz);
          const oz = rand3(gx, gy + 57, gz);
          const phase = rand2(gx * 3 + gz, gy * 11 + seed) * TAU;

          const driftT = time * this.drift + phase;
          let px = (gx + ox) * cs + Math.sin(driftT) * cs * 0.22;
          let py = (gy + oy) * cs + Math.sin(driftT * 0.7 + 1.3) * cs * 0.18 + time * this.rise;
          let pz = (gz + oz) * cs + Math.cos(driftT * 0.83) * cs * 0.22;

          px += this.flow[0] * time;
          py += this.flow[1] * time;
          pz += this.flow[2] * time;

          const span = cs * (2 * r + 1);
          px = cameraPos[0] + wrapTo(px - cameraPos[0], span);
          py = cameraPos[1] + wrapTo(py - cameraPos[1], span);
          pz = cameraPos[2] + wrapTo(pz - cameraPos[2], span);

          const dx = px - cameraPos[0];
          const dy = py - cameraPos[1];
          const dz = pz - cameraPos[2];
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > maxDistSq) continue;

          const edge = 1 - distSq / maxDistSq;
          const near = clamp((distSq - 0.35) * 3.0, 0, 1);
          const tw = 0.65 + 0.35 * Math.sin(time * (1.4 + h * 7.0) + phase * 3.1) * this.twinkle;
          const tint = rand2(gx + 17, gz + 91);
          const size = this.size * (1 + (ox - 0.5) * this.sizeVariation) * scale;
          if (size <= 0.0002) continue;

          batch.add(
            px, py, pz, size,
            lerp(this.color[0], this.color2[0], tint),
            lerp(this.color[1], this.color2[1], tint),
            lerp(this.color[2], this.color2[2], tint),
            this.intensity * edge * near * tw * intensityScale,
            phase + time * (0.3 + h),
            this.softness, this.kind, phase * 12.0);
        }
      }
    }
  }
}

function wrapTo(v, span) {
  const half = span * 0.5;
  let x = v + half;
  x -= Math.floor(x / span) * span;
  return x - half;
}

export class Trail {
  constructor(options = {}) {
    this.length = options.length || 22;
    this.points = new Float32Array(this.length * 3);
    this.filled = 0;
    this.head = 0;
    this.width = options.width !== undefined ? options.width : 0.12;
    this.taper = options.taper !== undefined ? options.taper : 1;
    this.color = options.color || [0.6, 0.85, 1.0];
    this.intensity = options.intensity !== undefined ? options.intensity : 2.0;
    this.minStep = options.minStep !== undefined ? options.minStep : 0.05;
    this.last = null;
  }

  reset() {
    this.filled = 0;
    this.head = 0;
    this.last = null;
  }

  push(x, y, z) {
    if (this.last) {
      const dx = x - this.last[0];
      const dy = y - this.last[1];
      const dz = z - this.last[2];
      if (dx * dx + dy * dy + dz * dz < this.minStep * this.minStep) {

        const o = ((this.head - 1 + this.length) % this.length) * 3;
        this.points[o] = x;
        this.points[o + 1] = y;
        this.points[o + 2] = z;
        return;
      }
    } else {
      this.last = [x, y, z];
    }
    const o = this.head * 3;
    this.points[o] = x;
    this.points[o + 1] = y;
    this.points[o + 2] = z;
    this.head = (this.head + 1) % this.length;
    if (this.filled < this.length) this.filled++;
    this.last[0] = x;
    this.last[1] = y;
    this.last[2] = z;
  }

  at(i, out) {
    const index = ((this.head - this.filled + i) % this.length + this.length) % this.length;
    const o = index * 3;
    out[0] = this.points[o];
    out[1] = this.points[o + 1];
    out[2] = this.points[o + 2];
    return out;
  }

  emit(store, cameraPos, widthScale = 1, intensityScale = 1) {
    const n = this.filled;
    if (n < 2) return;
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    const prevLo = [0, 0, 0];
    const prevHi = [0, 0, 0];
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    let havePrev = false;
    let prevAlpha = 0;
    let prevU = 0;

    for (let i = 0; i < n; i++) {
      this.at(i, a);
      if (i < n - 1) this.at(i + 1, b);
      else this.at(i - 1, b);

      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      let dz = b[2] - a[2];
      if (i === n - 1) { dx = -dx; dy = -dy; dz = -dz; }
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;

      let vx = a[0] - cameraPos[0];
      let vy = a[1] - cameraPos[1];
      let vz = a[2] - cameraPos[2];
      const vl = Math.hypot(vx, vy, vz) || 1;
      vx /= vl; vy /= vl; vz /= vl;

      let sx = dy * vz - dz * vy;
      let sy = dz * vx - dx * vz;
      let sz = dx * vy - dy * vx;
      const sl = Math.hypot(sx, sy, sz);
      if (sl < 1e-5) { sx = 1; sy = 0; sz = 0; }
      else { sx /= sl; sy /= sl; sz /= sl; }

      const f = n > 1 ? i / (n - 1) : 0;
      const w = this.width * widthScale * lerp(1 - this.taper * 0.85, 1, f);
      lo[0] = a[0] - sx * w; lo[1] = a[1] - sy * w; lo[2] = a[2] - sz * w;
      hi[0] = a[0] + sx * w; hi[1] = a[1] + sy * w; hi[2] = a[2] + sz * w;

      const alpha = this.intensity * intensityScale * f;
      if (havePrev) {
        store.quad(prevLo, prevHi, lo, hi, this.color, prevAlpha, alpha, prevU, f);
      }
      prevLo[0] = lo[0]; prevLo[1] = lo[1]; prevLo[2] = lo[2];
      prevHi[0] = hi[0]; prevHi[1] = hi[1]; prevHi[2] = hi[2];
      prevAlpha = alpha;
      prevU = f;
      havePrev = true;
    }
  }
}
