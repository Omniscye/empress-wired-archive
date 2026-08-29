export function hashU32(x) {
  let h = (Math.imul(x >>> 0, 747796405) + 2891336453) >>> 0;
  h = (Math.imul((h >>> ((h >>> 28) + 4)) ^ h, 277803737)) >>> 0;
  return ((h >>> 22) ^ h) >>> 0;
}

export function hash2(x, y) {
  return hashU32(hashU32(x) ^ (Math.imul(y >>> 0, 2654435761) >>> 0));
}

export function hash3(x, y, z) {
  return hashU32(hash2(x, y) ^ (Math.imul(z >>> 0, 1597334677) >>> 0));
}

export function rand1(x) {
  return hashU32(x) / 4294967296;
}

export function rand2(x, y) {
  return hash2(x, y) / 4294967296;
}

export function rand3(x, y, z) {
  return hash3(x, y, z) / 4294967296;
}

export class Rng {
  constructor(seed) {
    this.state = hashU32(seed) >>> 0;
  }

  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state;
  }

  float() {
    return this.next() / 4294967296;
  }

  range(min, max) {
    return min + this.float() * (max - min);
  }

  int(min, max) {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  pick(list) {
    return list[Math.floor(this.float() * list.length) % list.length];
  }

  chance(p) {
    return this.float() < p;
  }
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const a = rand2(xi, yi);
  const b = rand2(xi + 1, yi);
  const c = rand2(xi, yi + 1);
  const d = rand2(xi + 1, yi + 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(fx, fy) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / norm;
}
