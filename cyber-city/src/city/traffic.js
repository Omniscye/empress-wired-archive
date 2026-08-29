import { Rng } from './rng.js';
import { CITY_CELL, gridLineCenter, gridLineHalf } from './layout.js';
import { LIGHT_STRIDE } from './builder.js';

const VEHICLE_STRIDE = 12;

const GROUND_TINTS = [
  [0.9, 0.95, 1.0],
  [0.75, 0.85, 1.0],
  [1.0, 0.85, 0.6],
  [0.85, 0.9, 1.0],
];

const AIR_TINTS = [
  [0.35, 0.85, 1.0],
  [1.0, 0.35, 0.6],
  [0.7, 0.5, 1.0],
  [1.0, 0.72, 0.25],
  [0.4, 1.0, 0.7],
];

export class Traffic {
  constructor(options = {}) {
    this.rng = new Rng(0x5eed1);
    this.groundCount = 0;
    this.airCount = 0;
    this.vehicles = [];
    this.instanceData = new Float32Array(0);
    this.lightData = new Float32Array(0);
    this.instanceCount = 0;
    this.lightCount = 0;
    this.groundRange = options.groundRange || 260;
    this.airRange = options.airRange || 520;
    this.setCounts(options.ground || 70, options.air || 60);
  }

  setCounts(ground, air) {
    if (ground === this.groundCount && air === this.airCount) return;
    this.groundCount = ground;
    this.airCount = air;
    this.vehicles = [];
    for (let i = 0; i < ground; i++) this.vehicles.push(this.makeVehicle(false));
    for (let i = 0; i < air; i++) this.vehicles.push(this.makeVehicle(true));
    const total = this.vehicles.length;
    this.instanceData = new Float32Array(total * VEHICLE_STRIDE);
    this.lightData = new Float32Array(total * 2 * LIGHT_STRIDE);
    this.needsRespawn = true;
  }

  makeVehicle(air) {
    const rng = this.rng;
    return {
      air,
      axis: 0,
      line: 0,
      cross: 0,
      along: 0,
      dir: 1,
      speed: 0,
      y: 0,
      length: 0,
      width: 0,
      height: 0,
      tint: [1, 1, 1],
      seed: rng.float() * 1000,
      spawned: false,
      fade: 0,
    };
  }

  respawn(v, cameraX, cameraZ, ahead) {
    const rng = this.rng;
    v.axis = rng.chance(0.5) ? 0 : 1;
    v.dir = rng.chance(0.5) ? 1 : -1;

    if (v.air) {
      const baseLine = Math.floor((v.axis === 0 ? cameraX : cameraZ) / CITY_CELL);
      v.line = baseLine + rng.int(-6, 6);
      v.cross = gridLineCenter(v.line) + rng.range(-6, 6);
      v.y = rng.range(38, 145);
      v.speed = rng.range(26, 62);
      v.length = rng.range(3.2, 6.5);
      v.width = rng.range(1.0, 1.9);
      v.height = rng.range(0.7, 1.5);
      v.tint = AIR_TINTS[rng.int(0, AIR_TINTS.length - 1)];
      const along = v.axis === 0 ? cameraZ : cameraX;
      v.along = along + (ahead ? v.dir * -1 : 1) * rng.range(60, this.airRange);
      if (!ahead) v.along = along + rng.range(-this.airRange, this.airRange);
    } else {
      const baseLine = Math.floor((v.axis === 0 ? cameraX : cameraZ) / CITY_CELL);
      v.line = baseLine + rng.int(-3, 3);
      const half = gridLineHalf(v.line);
      const laneSlots = half > 10 ? 2 : 1;
      const slot = rng.int(1, laneSlots);
      const laneOffset = half * (0.28 + 0.34 * (slot - 1) / Math.max(1, laneSlots));
      v.cross = gridLineCenter(v.line) + v.dir * laneOffset * (v.axis === 0 ? 1 : -1);
      v.y = 0.44;
      v.speed = rng.range(9, 21);
      v.length = rng.range(3.6, 6.2);
      v.width = rng.range(1.5, 2.1);
      v.height = rng.range(1.1, 1.8);
      v.tint = GROUND_TINTS[rng.int(0, GROUND_TINTS.length - 1)];
      const along = v.axis === 0 ? cameraZ : cameraX;
      v.along = along + (ahead ? -v.dir : 1) * rng.range(30, this.groundRange);
      if (!ahead) v.along = along + rng.range(-this.groundRange, this.groundRange);
    }
    v.seed = rng.float() * 1000;
    v.spawned = true;
    v.fade = 0;
  }

  update(dt, cameraPos, frustum) {
    const cameraX = cameraPos[0];
    const cameraZ = cameraPos[2];

    if (this.needsRespawn) {
      for (const v of this.vehicles) this.respawn(v, cameraX, cameraZ, false);
      this.needsRespawn = false;
    }

    const data = this.instanceData;
    const lights = this.lightData;
    let n = 0;
    let ln = 0;

    for (const v of this.vehicles) {
      v.along += v.dir * v.speed * dt;
      v.fade = Math.min(1, v.fade + dt * 0.8);

      const x = v.axis === 0 ? v.cross : v.along;
      const z = v.axis === 0 ? v.along : v.cross;
      const range = v.air ? this.airRange : this.groundRange;
      const dx = x - cameraX;
      const dz = z - cameraZ;

      if (dx * dx + dz * dz > range * range * 1.15) {
        this.respawn(v, cameraX, cameraZ, true);
        continue;
      }

      const yaw = v.axis === 0
        ? (v.dir > 0 ? 0 : Math.PI)
        : (v.dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);

      const radius = Math.max(v.length, v.width) * 0.5 + 1.0;
      if (!frustum.intersectsSphere(x, v.y + v.height * 0.5, z, radius + 2.0)) continue;

      const o = n * VEHICLE_STRIDE;
      data[o] = x;
      data[o + 1] = v.y;
      data[o + 2] = z;
      data[o + 3] = yaw;
      data[o + 4] = v.width * 0.5;
      data[o + 5] = v.height;
      data[o + 6] = v.length * 0.5;
      data[o + 7] = v.seed;
      data[o + 8] = v.tint[0];
      data[o + 9] = v.tint[1];
      data[o + 10] = v.tint[2];
      data[o + 11] = v.air ? 1.0 : 0.0;
      n++;

      const fx = v.axis === 0 ? 0 : v.dir;
      const fz = v.axis === 0 ? v.dir : 0;
      const headX = x + fx * (v.length * 0.5 + 2.6);
      const headZ = z + fz * (v.length * 0.5 + 2.6);
      const tailX = x - fx * (v.length * 0.5 + 1.3);
      const tailZ = z - fz * (v.length * 0.5 + 1.3);

      const lo = ln * LIGHT_STRIDE;
      lights[lo] = headX;
      lights[lo + 1] = v.y + v.height * 0.45;
      lights[lo + 2] = headZ;
      lights[lo + 3] = v.air ? 17 : 15;
      lights[lo + 4] = v.tint[0];
      lights[lo + 5] = v.tint[1];
      lights[lo + 6] = v.tint[2];
      lights[lo + 7] = (v.air ? 3.6 : 5.2) * v.fade;
      lights[lo + 8] = 0;
      lights[lo + 9] = 0;
      lights[lo + 10] = 0;
      lights[lo + 11] = v.air ? 0 : 0.55;
      ln++;

      const lo2 = ln * LIGHT_STRIDE;
      lights[lo2] = tailX;
      lights[lo2 + 1] = v.y + v.height * 0.4;
      lights[lo2 + 2] = tailZ;
      lights[lo2 + 3] = 9;
      lights[lo2 + 4] = 1.0;
      lights[lo2 + 5] = 0.12;
      lights[lo2 + 6] = 0.08;
      lights[lo2 + 7] = 2.6 * v.fade;
      lights[lo2 + 8] = 0;
      lights[lo2 + 9] = 0;
      lights[lo2 + 10] = 0;
      lights[lo2 + 11] = 0;
      ln++;
    }

    this.instanceCount = n;
    this.lightCount = ln;
  }
}

export { VEHICLE_STRIDE };
