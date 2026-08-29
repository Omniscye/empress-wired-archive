import { hashU32, fbm2 } from './rng.js';

export const CITY_CELL = 70.0;
export const AVENUE_HALF = 13.0;
export const STREET_HALF = 7.0;
export const ALLEY_HALF = 4.5;
export const SIDEWALK_WIDTH = 4.2;

export const DISTRICT_CORE = 0;
export const DISTRICT_NEON = 1;
export const DISTRICT_INDUSTRIAL = 2;
export const DISTRICT_RESIDENTIAL = 3;

export const DISTRICT_NAMES = ['CORE', 'NEON MILE', 'FOUNDRY', 'TERRACES'];

export function gridLineCenter(i) {
  const j = (hashU32((i ^ 0x9e3779b9) >>> 0) % 1000) - 500;
  return i * CITY_CELL + (j / 500) * CITY_CELL * 0.22;
}

export function gridLineHalf(i) {
  const r = hashU32((hashU32(i) ^ 0x51ed2701) >>> 0) % 100;
  if (r < 10) return AVENUE_HALF;
  if (r < 74) return STREET_HALF;
  return ALLEY_HALF;
}

export function blockMin(i) {
  return gridLineCenter(i) + gridLineHalf(i);
}

export function blockMax(i) {
  return gridLineCenter(i + 1) - gridLineHalf(i + 1);
}

export function districtDensity(wx, wz) {
  const d = fbm2(wx * 0.00105 + 13.7, wz * 0.00105 + 41.2, 4);
  const ridge = fbm2(wx * 0.00042 + 91.3, wz * 0.00042 + 7.1, 3);
  const v = Math.min(1, Math.max(0, d * 0.65 + ridge * 0.55));
  return Math.min(1, Math.max(0, Math.pow(v, 1.35)));
}

export function districtCharacter(wx, wz) {
  return fbm2(wx * 0.00083 + 203.5, wz * 0.00083 + 88.9, 3);
}

export function districtType(wx, wz, density) {
  const c = districtCharacter(wx, wz);
  if (density > 0.70) return DISTRICT_CORE;
  if (c > 0.570) return DISTRICT_NEON;
  if (c < 0.390) return DISTRICT_INDUSTRIAL;
  return DISTRICT_RESIDENTIAL;
}

export function cellCenter(ix, iz) {
  return [
    (blockMin(ix) + blockMax(ix)) * 0.5,
    (blockMin(iz) + blockMax(iz)) * 0.5,
  ];
}

export function cellFromWorld(p) {
  return Math.floor(p / CITY_CELL);
}

export function cellIndexFor(p) {
  const base = Math.floor(p / CITY_CELL);
  let cell = base;
  for (let k = -1; k <= 2; k++) {
    const idx = base + k;
    if (p >= gridLineCenter(idx)) cell = idx;
  }
  return cell;
}

export function nextLine(p, direction) {
  const base = Math.floor(p / CITY_CELL);
  let bestCenter = direction > 0 ? Infinity : -Infinity;
  let bestIndex = base;
  for (let k = -2; k <= 3; k++) {
    const idx = base + k;
    const c = gridLineCenter(idx);
    if (direction > 0 && c > p + 1.0 && c < bestCenter) {
      bestCenter = c;
      bestIndex = idx;
    }
    if (direction < 0 && c < p - 1.0 && c > bestCenter) {
      bestCenter = c;
      bestIndex = idx;
    }
  }
  if (!Number.isFinite(bestCenter)) {
    bestIndex = base + (direction > 0 ? 1 : -1);
    bestCenter = gridLineCenter(bestIndex);
  }
  return { center: bestCenter, index: bestIndex };
}

export function nextLineCenter(p, direction) {
  const base = Math.floor(p / CITY_CELL);
  let best = direction > 0 ? Infinity : -Infinity;
  for (let k = -2; k <= 3; k++) {
    const c = gridLineCenter(base + k);
    if (direction > 0 && c > p + 1.0 && c < best) best = c;
    if (direction < 0 && c < p - 1.0 && c > best) best = c;
  }
  return Number.isFinite(best) ? best : p + direction * CITY_CELL;
}

export function roadDistance(p) {
  const base = Math.floor(p / CITY_CELL);
  let best = 1e9;
  let center = 0;
  let half = STREET_HALF;
  let index = base;
  for (let k = -1; k <= 2; k++) {
    const idx = base + k;
    const c = gridLineCenter(idx);
    const h = gridLineHalf(idx);
    const d = Math.abs(p - c) - h;
    if (d < best) {
      best = d;
      center = c;
      half = h;
      index = idx;
    }
  }
  return { dist: best, center, half, index };
}

export function isOnRoad(wx, wz) {
  return roadDistance(wx).dist < 0 || roadDistance(wz).dist < 0;
}
