import { generateCell } from './chunk.js';
import { BOX_STRIDE, SIGN_STRIDE, LIGHT_STRIDE, FIELD_RES } from './builder.js';
import { CITY_CELL, cellIndexFor } from './layout.js';

function key(ix, iz) {
  return `${ix},${iz}`;
}

export class CityStreamer {
  constructor(options = {}) {
    this.radius = options.radius || 14;
    this.generationBudgetMs = options.generationBudgetMs || 2.5;
    this.cells = new Map();
    this.pending = [];
    this.pendingSet = new Set();
    this.centerX = Infinity;
    this.centerZ = Infinity;
    this.version = 0;
    this.boxData = new Float32Array(0);
    this.signData = new Float32Array(0);
    this.boxCount = 0;
    this.signCount = 0;
    this.dirty = true;
    this.lightBuffer = new Float32Array(0);
    this.lightCount = 0;
    this.stats = { cells: 0, boxes: 0, signs: 0, lights: 0, pending: 0 };
  }

  setRadius(radius) {
    if (radius === this.radius) return;
    this.radius = radius;
    this.centerX = Infinity;
    this.centerZ = Infinity;
  }

  update(cameraX, cameraZ) {
    const cx = Math.floor(cameraX / CITY_CELL);
    const cz = Math.floor(cameraZ / CITY_CELL);

    if (cx !== this.centerX || cz !== this.centerZ) {
      this.centerX = cx;
      this.centerZ = cz;
      this.refreshQueue(cx, cz);
    }

    this.processQueue();

    if (this.dirty) {
      this.rebuild();
      this.dirty = false;
    }

    this.stats.cells = this.cells.size;
    this.stats.pending = this.pending.length;
  }

  refreshQueue(cx, cz) {
    const r = this.radius;
    const rSq = (r + 0.5) * (r + 0.5);
    const wanted = new Set();

    this.pending.length = 0;
    this.pendingSet.clear();

    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > rSq) continue;
        const ix = cx + dx;
        const iz = cz + dz;
        const k = key(ix, iz);
        wanted.add(k);
        if (!this.cells.has(k)) {
          this.pending.push({ ix, iz, k, d: dx * dx + dz * dz });
          this.pendingSet.add(k);
        }
      }
    }

    this.pending.sort((a, b) => b.d - a.d);

    let removed = 0;
    for (const k of this.cells.keys()) {
      if (!wanted.has(k)) {
        this.cells.delete(k);
        removed++;
      }
    }
    if (removed > 0) this.dirty = true;
  }

  processQueue() {
    if (this.pending.length === 0) return;
    const start = performance.now();
    let generated = 0;
    while (this.pending.length > 0) {
      const job = this.pending.pop();
      this.pendingSet.delete(job.k);
      this.cells.set(job.k, generateCell(job.ix, job.iz));
      generated++;
      if (performance.now() - start > this.generationBudgetMs) break;
    }
    if (generated > 0) this.dirty = true;
  }

  primeSync(maxMs = 900) {
    const start = performance.now();
    while (this.pending.length > 0 && performance.now() - start < maxMs) {
      const job = this.pending.pop();
      this.pendingSet.delete(job.k);
      this.cells.set(job.k, generateCell(job.ix, job.iz));
    }
    this.dirty = true;
  }

  rebuild() {
    let boxFloats = 0;
    let signFloats = 0;
    for (const cell of this.cells.values()) {
      boxFloats += cell.boxes.length;
      signFloats += cell.signs.length;
    }

    if (this.boxData.length < boxFloats) {
      this.boxData = new Float32Array(Math.ceil(boxFloats * 1.25));
    }
    if (this.signData.length < signFloats) {
      this.signData = new Float32Array(Math.ceil(signFloats * 1.25) + SIGN_STRIDE);
    }

    let bo = 0;
    let so = 0;
    for (const cell of this.cells.values()) {
      if (cell.boxes.length) {
        this.boxData.set(cell.boxes, bo);
        bo += cell.boxes.length;
      }
      if (cell.signs.length) {
        this.signData.set(cell.signs, so);
        so += cell.signs.length;
      }
    }

    this.boxCount = bo / BOX_STRIDE;
    this.signCount = so / SIGN_STRIDE;
    this.boxFloats = bo;
    this.signFloats = so;
    this.version++;
    this.stats.boxes = this.boxCount;
    this.stats.signs = this.signCount;
  }

  cellAt(x, z) {
    return this.cells.get(key(cellIndexFor(x), cellIndexFor(z)));
  }

  sampleField(cell, field, x, z) {
    const fx = (x - cell.fieldMinX) / cell.fieldSpanX * FIELD_RES;
    const fz = (z - cell.fieldMinZ) / cell.fieldSpanZ * FIELD_RES;
    const ix = Math.min(FIELD_RES - 1, Math.max(0, Math.floor(fx)));
    const iz = Math.min(FIELD_RES - 1, Math.max(0, Math.floor(fz)));
    return field[iz * FIELD_RES + ix];
  }

  solidHeightAt(x, z) {
    const cell = this.cellAt(x, z);
    if (!cell) return 0;
    return this.sampleField(cell, cell.solid, x, z);
  }

  overheadAt(x, z) {
    const cell = this.cellAt(x, z);
    if (!cell) return 0;
    return this.sampleField(cell, cell.overhead, x, z);
  }

  solidHeightSmooth(x, z) {
    const cell = this.cellAt(x, z);
    if (!cell) return 0;
    const gx = (x - cell.fieldMinX) / cell.fieldSpanX * FIELD_RES - 0.5;
    const gz = (z - cell.fieldMinZ) / cell.fieldSpanZ * FIELD_RES - 0.5;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const tx = gx - x0;
    const tz = gz - z0;
    const texel = (ix, iz) => {
      if (ix >= 0 && ix < FIELD_RES && iz >= 0 && iz < FIELD_RES) return cell.solid[iz * FIELD_RES + ix];
      const wx = cell.fieldMinX + (ix + 0.5) / FIELD_RES * cell.fieldSpanX;
      const wz = cell.fieldMinZ + (iz + 0.5) / FIELD_RES * cell.fieldSpanZ;
      return this.solidHeightAt(wx, wz);
    };
    const h00 = texel(x0, z0);
    const h10 = texel(x0 + 1, z0);
    const h01 = texel(x0, z0 + 1);
    const h11 = texel(x0 + 1, z0 + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  solidHeightAheadSmooth(x, z, dirX, dirZ, distances) {
    let best = 0;
    for (let i = 0; i < distances.length; i++) {
      const d = distances[i];
      const h = this.solidHeightSmooth(x + dirX * d, z + dirZ * d);
      if (h > best) best = h;
    }
    return best;
  }

  solidHeightAround(x, z, radius) {
    let best = this.solidHeightAt(x, z);
    if (radius <= 0) return best;
    for (let i = 0; i < 4; i++) {
      const angle = i * 1.5707963268;
      const h = this.solidHeightAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius);
      if (h > best) best = h;
    }
    return best;
  }

  solidHeightAhead(x, z, dirX, dirZ, distances, radius) {
    let best = 0;
    for (let i = 0; i < distances.length; i++) {
      const d = distances[i];
      const h = this.solidHeightAround(x + dirX * d, z + dirZ * d, radius);
      if (h > best) best = h;
    }
    return best;
  }

  findLandmark(x, z, dirX, dirZ, cellRadius = 5) {
    const cx = cellIndexFor(x);
    const cz = cellIndexFor(z);
    let best = null;
    let bestScore = 0;
    for (let dz = -cellRadius; dz <= cellRadius; dz++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const cell = this.cells.get(key(cx + dx, cz + dz));
        if (!cell || cell.maxY < 45) continue;
        const px = (cell.minX + cell.maxX) * 0.5;
        const pz = (cell.minZ + cell.maxZ) * 0.5;
        const ox = px - x;
        const oz = pz - z;
        const dist = Math.hypot(ox, oz);
        if (dist < 55 || dist > 420) continue;
        const alignment = (ox / dist) * dirX + (oz / dist) * dirZ;
        if (alignment < 0.15) continue;
        const score = cell.maxY * (0.35 + alignment) / (1 + dist * 0.004);
        if (score > bestScore) {
          bestScore = score;
          best = { x: px, y: cell.maxY * 0.62, z: pz, height: cell.maxY, dist };
        }
      }
    }
    return best;
  }

  collectLights(cameraPos, frustum, range, maxLights) {
    const needed = maxLights * LIGHT_STRIDE;
    if (this.lightBuffer.length < needed) this.lightBuffer = new Float32Array(needed);
    const out = this.lightBuffer;
    const cellRange = Math.ceil(range / CITY_CELL) + 1;
    const cx = this.centerX;
    const cz = this.centerZ;
    const rangeSq = range * range;
    let count = 0;

    for (let dz = -cellRange; dz <= cellRange && count < maxLights; dz++) {
      for (let dx = -cellRange; dx <= cellRange && count < maxLights; dx++) {
        const cell = this.cells.get(key(cx + dx, cz + dz));
        if (!cell || cell.lightCount === 0) continue;
        const data = cell.lights;
        for (let i = 0; i < data.length; i += LIGHT_STRIDE) {
          const lx = data[i];
          const ly = data[i + 1];
          const lz = data[i + 2];
          const radius = data[i + 3];
          const ddx = lx - cameraPos[0];
          const ddy = ly - cameraPos[1];
          const ddz = lz - cameraPos[2];
          const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
          if (distSq > rangeSq) continue;
          if (!frustum.intersectsSphere(lx, ly, lz, radius)) continue;
          const o = count * LIGHT_STRIDE;
          for (let j = 0; j < LIGHT_STRIDE; j++) out[o + j] = data[i + j];
          count++;
          if (count >= maxLights) break;
        }
      }
    }

    this.lightCount = count;
    this.stats.lights = count;
    return count;
  }
}
