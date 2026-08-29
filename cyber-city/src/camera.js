import { mat4, vec3, clamp, damp, lerp, smoothstep, Frustum, DEG2RAD } from './core/math.js';
import { Rng } from './city/rng.js';
import { roadDistance, nextLine, gridLineCenter, gridLineHalf } from './city/layout.js';

export const MODE_CINEMATIC = 'cinematic';
export const MODE_FLY = 'fly';
export const MODE_WALK = 'walk';

export class Camera {
  constructor() {
    this.position = vec3.create(0, 26, 0);
    this.target = vec3.create(0, 20, -1);
    this.up = vec3.create(0, 1, 0);
    this.fov = 62;
    this.near = 0.25;
    this.far = 5000;
    this.aspect = 16 / 9;
    this.view = mat4.create();
    this.proj = mat4.create();
    this.viewProj = mat4.create();
    this.invViewProj = mat4.create();
    this.invProj = mat4.create();
    this.prevViewProj = mat4.create();
    this.frustum = new Frustum();
    this.forward = vec3.create(0, 0, -1);
    this.right = vec3.create(1, 0, 0);
    this.delta = vec3.create();
    this.lastPosition = vec3.create();
  }

  update(aspect) {
    this.aspect = aspect;
    mat4.copy(this.prevViewProj, this.viewProj);
    mat4.perspective(this.proj, this.fov * DEG2RAD, aspect, this.near, this.far);
    mat4.lookAt(this.view, this.position, this.target, this.up);
    mat4.multiply(this.viewProj, this.proj, this.view);
    mat4.invert(this.invViewProj, this.viewProj);
    mat4.invert(this.invProj, this.proj);
    this.frustum.fromMatrix(this.viewProj);
    vec3.sub(this.forward, this.target, this.position);
    vec3.normalize(this.forward, this.forward);
    vec3.cross(this.right, this.forward, this.up);
    vec3.normalize(this.right, this.right);
    vec3.sub(this.delta, this.position, this.lastPosition);
    vec3.copy(this.lastPosition, this.position);
  }
}

export class FreeController {
  constructor() {
    this.yaw = 0;
    this.pitch = -0.12;
    this.position = vec3.create(0, 32, 90);
    this.velocity = vec3.create();
    this.speed = 34;
    this.boost = 1;
    this.mode = MODE_FLY;
    this.bobPhase = 0;
    this.rollTarget = 0;
    this.roll = 0;
  }

  syncFrom(camera) {
    vec3.copy(this.position, camera.position);
    const f = vec3.create();
    vec3.sub(f, camera.target, camera.position);
    vec3.normalize(f, f);
    this.yaw = Math.atan2(f[0], -f[2]);
    this.pitch = Math.asin(clamp(f[1], -1, 1));
  }

  look(dx, dy, sensitivity) {
    this.yaw += dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -1.5, 1.5);
  }

  update(dt, input, camera) {
    const walk = this.mode === MODE_WALK;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    const forward = [sy * cp, sp, -cy * cp];
    const flatForward = [sy, 0, -cy];
    const right = [cy, 0, sy];

    let moveX = 0;
    let moveY = 0;
    let moveZ = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) moveZ += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) moveZ -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) moveX += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) moveX -= 1;
    if (!walk) {
      if (input.isDown('Space')) moveY += 1;
      if (input.isDown('ShiftLeft') || input.isDown('ControlLeft')) moveY -= 1;
    }

    moveX += input.axisX;
    moveZ += input.axisY;

    const targetBoost = input.isDown('ShiftRight') || input.turbo ? 4.0 : 1.0;
    this.boost = damp(this.boost, targetBoost, 6, dt);

    const dir = walk ? flatForward : forward;
    const speed = (walk ? 7.5 : this.speed) * this.boost;

    const accel = vec3.create();
    vec3.scaleAndAdd(accel, accel, dir, moveZ * speed);
    vec3.scaleAndAdd(accel, accel, right, moveX * speed);
    accel[1] += moveY * speed;

    const rate = walk ? 12 : 5.5;
    this.velocity[0] = damp(this.velocity[0], accel[0], rate, dt);
    this.velocity[1] = damp(this.velocity[1], accel[1], rate, dt);
    this.velocity[2] = damp(this.velocity[2], accel[2], rate, dt);

    vec3.scaleAndAdd(this.position, this.position, this.velocity, dt);

    if (walk) {
      this.position[1] = damp(this.position[1], 1.75, 10, dt);
      const planar = Math.hypot(this.velocity[0], this.velocity[2]);
      this.bobPhase += dt * planar * 1.5;
      camera.position[1] = this.position[1] + Math.sin(this.bobPhase * 2.0) * 0.035 * Math.min(1, planar / 6);
    } else {
      this.position[1] = Math.max(this.position[1], 1.4);
    }

    this.rollTarget = -moveX * 0.045 * (walk ? 0.3 : 1.0);
    this.roll = damp(this.roll, this.rollTarget, 5, dt);

    camera.position[0] = this.position[0];
    camera.position[2] = this.position[2];
    if (!walk) camera.position[1] = this.position[1];

    const cr = Math.cos(this.roll);
    const sr = Math.sin(this.roll);
    camera.up[0] = right[0] * sr;
    camera.up[1] = cr;
    camera.up[2] = right[2] * sr;

    camera.target[0] = camera.position[0] + forward[0];
    camera.target[1] = camera.position[1] + forward[1];
    camera.target[2] = camera.position[2] + forward[2];
  }
}

const HALF_PI = Math.PI * 0.5;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function dampAngle(current, target, rate, dt) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

const FLIGHT_MODES = {
  canyon: { altitude: [4.0, 13], speed: [5.0, 9.5], pitch: [-0.04, 0.14], fov: [66, 73], grid: true, length: [29, 32] },
  rise: { altitude: [45, 105], speed: [6.0, 11.0], pitch: [-0.02, 0.20], fov: [61, 68], grid: true, length: [29, 32] },
  soar: { altitude: [95, 185], speed: [8.0, 14.0], pitch: [-0.30, -0.08], fov: [54, 61], grid: false, length: [29, 32] },
  orbit: { altitude: [75, 155], speed: [6.5, 11.0], pitch: [-0.20, 0.02], fov: [55, 63], grid: false, length: [29, 32] },
  descend: { altitude: [22, 46], speed: [6.0, 11.0], pitch: [-0.16, 0.06], fov: [61, 70], grid: true, length: [29, 32] },
};

const MODE_FLOW = {
  canyon: ['canyon', 'canyon', 'canyon', 'rise'],
  rise: ['soar', 'descend'],
  soar: ['orbit', 'descend', 'descend'],
  orbit: ['descend'],
  descend: ['canyon', 'canyon', 'canyon'],
};

export class CinematicController {
  constructor(seed = 20260825) {
    this.rng = new Rng(seed);
    this.position = vec3.create(0, 40, 0);
    this.yaw = 0;
    this.yawTarget = 0;
    this.yawRate = 0;
    this.freeYawDrift = 0;
    this.speed = 16;
    this.targetSpeed = 16;
    this.baseAltitude = 40;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.lookYawOffset = 0;
    this.lookPitchTarget = 0;
    this.roll = 0;
    this.fov = 60;
    this.targetFov = 60;
    this.mode = 'canyon';
    this.modeTimer = 0;
    this.modeLength = 18;
    this.turnCooldown = 6;
    this.corridorIndex = null;
    this.corridorAlongZ = true;
    this.travelDir = 1;
    this.alongCoord = 0;
    this.turn = null;
    this.avoidAccum = 0;
    this.blockedTime = 0;
    this.transition = 1;
    this.transitionLength = 12;
    this.fromAltitude = 40;
    this.toAltitude = 40;
    this.fromSpeed = 16;
    this.toSpeed = 16;
    this.fromPitch = 0;
    this.toPitch = 0;
    this.fromFov = 60;
    this.toFov = 60;
    this.corridorFloor = 0;
    this.turnSpeedScale = 1;
    this.verticalVelocity = 0;
    this.smoothDesired = 40;
    this.smoothYawRate = 0;
    this.avoidHold = 0;
    this.landmark = null;
    this.landmarkWeight = 0;
    this.landmarkHold = 0;
    this.landmarkCooldown = 5;
    this.time = 0;
    this.avoidBias = 0;
    this.orbitRadius = 150;
    this.orbitSign = 1;
  }

  beginOnStreet(world, camera) {
    const startX = camera.position[0];
    const startZ = camera.position[2];
    const lane = roadDistance(startX);
    this.position[0] = lane.center;
    this.position[2] = startZ;
    this.position[1] = 7.0;
    this.yaw = 0;
    this.yawTarget = 0;
    this.lookYaw = 0;
    this.lookPitch = 0.04;
    this.roll = 0;
    this.mode = 'canyon';
    this.modeTimer = 0;
    this.modeLength = this.rng.range(29, 32);
    this.speed = 11;
    this.baseAltitude = 7.0;
    this.smoothDesired = 7.0;
    this.verticalVelocity = 0;
    this.smoothYawRate = 0;
    this.avoidBias = 0;
    this.avoidHold = 0;
    this.blockedTime = 0;
    this.landmark = null;
    this.landmarkWeight = 0;
    this.landmarkCooldown = 22;
    this.turnCooldown = 12;
    this.turnSpeedScale = 1;
    this.corridorIndex = null;
    this.corridorFloor = 0;
    this.transition = 1;
    this.fromAltitude = 7.0;
    this.toAltitude = 7.0;
    this.fromSpeed = 11;
    this.toSpeed = 13;
    this.fromPitch = 0.04;
    this.toPitch = 0.04;
    this.fov = 70;
    this.fromFov = 70;
    this.toFov = 70;
    this.lockCorridor();
    if (world) {
      const ground = world.solidHeightAround(this.position[0], this.position[2], 2.0);
      if (ground > 2) {
        this.position[1] = ground + 7.0;
        this.smoothDesired = this.position[1];
        this.baseAltitude = this.position[1];
      }
    }
    camera.fov = this.fov;
  }

  syncFrom(camera) {
    vec3.copy(this.position, camera.position);
    const forward = vec3.create();
    vec3.sub(forward, camera.target, camera.position);
    vec3.normalize(forward, forward);
    this.yaw = Math.atan2(forward[0], -forward[2]);
    this.yawTarget = this.yaw;
    this.lookYaw = this.yaw;
    this.lookPitch = Math.asin(clamp(forward[1], -1, 1));
    this.baseAltitude = Math.max(4, camera.position[1]);
    this.smoothDesired = this.baseAltitude;
    this.verticalVelocity = 0;
    this.smoothYawRate = 0;
    this.avoidBias = 0;
    this.avoidHold = 0;
    this.fov = camera.fov;
    this.fromAltitude = this.baseAltitude;
    this.toAltitude = this.baseAltitude;
    this.fromSpeed = this.speed;
    this.toSpeed = this.speed;
    this.fromFov = camera.fov;
    this.toFov = camera.fov;
    this.fromPitch = this.lookPitch;
    this.toPitch = this.lookPitch;
    this.transition = 1;
    this.corridorFloor = 0;
    this.turnSpeedScale = 1;
    this.verticalVelocity = 0;
    this.smoothDesired = 40;
    this.smoothYawRate = 0;
    this.avoidHold = 0;
    this.mode = camera.position[1] > 70 ? 'soar' : 'canyon';
    this.modeTimer = 0;
    this.modeLength = 14;
    this.landmark = null;
    this.landmarkWeight = 0;
    this.corridorIndex = null;
  }

  pickMode() {
    const options = MODE_FLOW[this.mode] || MODE_FLOW.canyon;
    const next = options[this.rng.int(0, options.length - 1)];
    const spec = FLIGHT_MODES[next];
    this.mode = next;
    this.modeTimer = 0;
    this.modeLength = this.rng.range(spec.length[0], spec.length[1]);

    this.transition = 0;
    this.transitionLength = this.rng.range(12, 16);
    this.fromAltitude = this.baseAltitude;
    this.toAltitude = this.rng.range(spec.altitude[0], spec.altitude[1]);
    this.fromSpeed = this.toSpeed;
    this.toSpeed = this.rng.range(spec.speed[0], spec.speed[1]);
    this.fromPitch = this.lookPitchTarget;
    this.toPitch = this.rng.range(spec.pitch[0], spec.pitch[1]);
    this.fromFov = this.toFov;
    this.toFov = this.rng.range(spec.fov[0], spec.fov[1]);
    this.corridorFloor = 0;

    if (!spec.grid) this.corridorIndex = null;
    this.freeYawDrift = this.rng.range(-0.055, 0.055);
    this.turnCooldown = this.rng.range(8.0, 15.0);
    if (next === 'orbit') {
      this.orbitSign = this.rng.chance(0.5) ? 1 : -1;
      this.orbitRadius = this.rng.range(95, 240);
      this.landmarkCooldown = 0;
    }
  }

  lockCorridor() {
    const alongZ = Math.abs(Math.cos(this.yaw)) > 0.7;
    const crossIndex = alongZ ? 0 : 2;
    const alongIndex = alongZ ? 2 : 0;
    this.corridorAlongZ = alongZ;
    this.corridorIndex = roadDistance(this.position[crossIndex]).index;
    this.alongCoord = this.position[alongIndex];
    if (alongZ) this.travelDir = -Math.cos(this.yaw) >= 0 ? 1 : -1;
    else this.travelDir = Math.sin(this.yaw) >= 0 ? 1 : -1;
    this.turn = null;
    const half = gridLineHalf(this.corridorIndex);
    this.corridorFloor = half < 6.0 ? 13.0 : 0;
  }

  corridorHeading() {
    if (this.corridorAlongZ) return this.travelDir > 0 ? Math.PI : 0;
    return this.travelDir > 0 ? HALF_PI : -HALF_PI;
  }

  corridorProbe(world, distances) {
    if (this.corridorIndex === null) return 0;
    const center = gridLineCenter(this.corridorIndex);
    let best = 0;
    for (let i = 0; i < distances.length; i++) {
      const t = this.alongCoord + this.travelDir * distances[i];
      const px = this.corridorAlongZ ? center : t;
      const pz = this.corridorAlongZ ? t : center;
      const h = world.solidHeightAround(px, pz, 1.5);
      if (h > best) best = h;
    }
    return best;
  }

  beginTurn() {
    const entryCenter = gridLineCenter(this.corridorIndex);
    const ahead = nextLine(this.alongCoord, this.travelDir);
    const exitCenter = ahead.center;
    const exitIndex = ahead.index;
    const halfIn = gridLineHalf(this.corridorIndex);
    const halfOut = gridLineHalf(exitIndex);
    const radius = Math.max(3.5, Math.min(halfIn, halfOut) * 0.8);
    const side = this.rng.chance(0.5) ? 1 : -1;

    const alongZ = this.corridorAlongZ;
    const dir = this.travelDir;
    const startU = entryCenter;
    const startV = exitCenter - dir * radius;
    const endU = entryCenter + side * radius;
    const endV = exitCenter;
    const centerU = endU;
    const centerV = startV;

    const toWorld = (u, v) => (alongZ ? [u, v] : [v, u]);
    const [sx, sz] = toWorld(startU, startV);
    const [ex, ez] = toWorld(endU, endV);
    const [cx, cz] = toWorld(centerU, centerV);

    const a0 = Math.atan2(sz - cz, sx - cx);
    const a1 = Math.atan2(ez - cz, ex - cx);
    let sweep = wrapAngle(a1 - a0);
    if (Math.abs(sweep) < 0.1) return;

    this.turn = {
      cx,
      cz,
      radius,
      a0,
      sweep,
      progress: 0,
      length: Math.abs(sweep) * radius,
      exitIndex,
      exitAlongZ: !alongZ,
      exitDir: side,
    };
    this.turnSpeedScale = 0.6;
  }

  updateGridFlight(dt, world) {
    if (this.corridorIndex === null) this.lockCorridor();

    const crossIndex = this.corridorAlongZ ? 0 : 2;
    const alongIndex = this.corridorAlongZ ? 2 : 0;

    if (this.turn) {
      const turn = this.turn;
      turn.progress = Math.min(1, turn.progress + (this.speed * dt) / Math.max(turn.length, 0.001));
      const angle = turn.a0 + turn.sweep * turn.progress;
      this.position[0] = turn.cx + Math.cos(angle) * turn.radius;
      this.position[2] = turn.cz + Math.sin(angle) * turn.radius;
      const tangentSign = turn.sweep >= 0 ? 1 : -1;
      const tx = -Math.sin(angle) * tangentSign;
      const tz = Math.cos(angle) * tangentSign;
      this.yaw = dampAngle(this.yaw, Math.atan2(tx, -tz), 9.0, dt);
      if (turn.progress >= 1) {
        this.corridorAlongZ = turn.exitAlongZ;
        this.corridorIndex = turn.exitIndex;
        this.travelDir = turn.exitDir;
        this.alongCoord = this.position[this.corridorAlongZ ? 2 : 0];
        const half = gridLineHalf(this.corridorIndex);
        this.corridorFloor = half < 6.0 ? 13.0 : 0;
        this.turn = null;
        this.turnCooldown = this.rng.range(14, 26);
      }
      return;
    }

    this.alongCoord += this.travelDir * this.speed * dt;

    const center = gridLineCenter(this.corridorIndex);
    const half = gridLineHalf(this.corridorIndex);
    const laneReach = Math.max(0, half - 3.4);
    const crossTarget = center + Math.sin(this.time * 0.11) * laneReach * 0.35;

    this.position[alongIndex] = this.alongCoord;
    this.position[crossIndex] = damp(this.position[crossIndex], crossTarget, 1.6, dt);
    this.yaw = dampAngle(this.yaw, this.corridorHeading(), 2.5, dt);

    this.turnCooldown -= dt;
    if (this.turnCooldown <= 0) {
      const ahead = nextLine(this.alongCoord, this.travelDir);
      const reach = (ahead.center - this.alongCoord) * this.travelDir;
      const radius = Math.max(3.5, Math.min(half, gridLineHalf(ahead.index)) * 0.8);
      if (reach <= radius && reach > radius - Math.max(1.5, this.speed * dt * 3)) {
        if (this.rng.chance(0.62)) this.beginTurn();
        else this.turnCooldown = this.rng.range(10, 20);
      }
    }
  }

  updateFreeHeading(dt, world) {
    if (this.mode === 'orbit' && this.landmark) {
      const ox = this.position[0] - this.landmark.x;
      const oz = this.position[2] - this.landmark.z;
      const radius = Math.hypot(ox, oz) || 1;
      const tangentX = -oz / radius * this.orbitSign;
      const tangentZ = ox / radius * this.orbitSign;
      const pull = clamp((radius - this.orbitRadius) / 110, -0.5, 0.5);
      this.yawTarget = Math.atan2(tangentX - ox / radius * pull, -(tangentZ - oz / radius * pull));
    } else {
      this.yawTarget = wrapAngle(this.yawTarget + this.freeYawDrift * dt);
    }

    const bias = clamp(this.avoidBias, -0.7, 0.7);
    const nextAccum = clamp(this.avoidAccum + bias * dt, -1.15, 1.15);
    const applied = nextAccum - this.avoidAccum;
    this.avoidAccum = nextAccum;
    this.yawTarget = wrapAngle(this.yawTarget + applied);

    const previousYaw = this.yaw;
    this.yaw = dampAngle(this.yaw, this.yawTarget, 0.7, dt);
    this.yawRate = wrapAngle(this.yaw - previousYaw) / Math.max(dt, 1e-4);
    this.smoothYawRate = damp(this.smoothYawRate, this.yawRate, 3.0, dt);
    void world;
  }

  updateFreeAvoidance(dt, world, fx, fz) {
    const x = this.position[0];
    const z = this.position[2];
    const y = this.position[1];
    const probes = [24, 50, 84, 126];
    const straight = world.solidHeightAheadSmooth(x, z, fx, fz, probes);

    if (straight > y - 12) {
      const angle = 0.6;
      const cs = Math.cos(angle);
      const sn = Math.sin(angle);
      const left = world.solidHeightAheadSmooth(x, z, fx * cs - fz * sn, fx * sn + fz * cs, probes);
      const right = world.solidHeightAheadSmooth(x, z, fx * cs + fz * sn, -fx * sn + fz * cs, probes);
      const urgency = clamp((straight - (y - 12)) / 40, 0, 1);
      if (this.avoidHold <= 0) this.avoidSide = left < right ? 1 : -1;
      this.avoidHold = 3.0;
      this.avoidBias = damp(this.avoidBias, this.avoidSide * urgency * 0.55, 1.2, dt);
    } else {
      this.avoidHold -= dt;
      this.avoidBias = damp(this.avoidBias, 0, 0.8, dt);
      if (this.avoidHold <= 0) this.avoidAccum = damp(this.avoidAccum, 0, 0.35, dt);
    }

    return straight;
  }

  updateFreeFlight(dt, world) {
    let fx = Math.sin(this.yaw);
    let fz = -Math.cos(this.yaw);
    const ahead = this.updateFreeAvoidance(dt, world, fx, fz);
    this.updateFreeHeading(dt, world);

    fx = Math.sin(this.yaw);
    fz = -Math.cos(this.yaw);

    const stepX = fx * this.speed * dt;
    const stepZ = fz * this.speed * dt;
    const nextX = this.position[0] + stepX;
    const nextZ = this.position[2] + stepZ;
    const destHeight = world.solidHeightAround(nextX, nextZ, 2.2);
    const trapped = world.solidHeightAround(this.position[0], this.position[2], 2.0) > this.position[1];

    if (destHeight > this.position[1] - 1.0 && !trapped) {
      this.blockedTime += dt;
      const creep = 0.25;
      this.position[0] += stepX * creep;
      this.position[2] += stepZ * creep;
    } else {
      this.blockedTime = 0;
      this.position[0] = nextX;
      this.position[2] = nextZ;
    }

    return ahead;
  }

  updateAltitude(dt, world, fx, fz, ahead) {
    const x = this.position[0];
    const z = this.position[2];
    const inCorridor = this.corridorIndex !== null && this.turn === null;
    const clearance = this.mode === 'canyon' ? 4.5 : 14.0;

    const localSoft = world.solidHeightSmooth(x, z);
    const near = inCorridor
      ? this.corridorProbe(world, [8, 18, 32, 52])
      : world.solidHeightAheadSmooth(x, z, fx, fz, [14, 32, 56, 88]);
    const guard = inCorridor
      ? this.corridorProbe(world, [4, 9, 15, 24])
      : world.solidHeightAheadSmooth(x, z, fx, fz, [5, 11, 19, 29]);

    let desired = Math.max(this.baseAltitude, this.corridorFloor);
    if (localSoft > 0) desired = Math.max(desired, localSoft + clearance);
    if (near > 0) desired = Math.max(desired, near + clearance * 0.8);
    if (guard > 0) desired = Math.max(desired, guard + clearance * 0.7);
    if (ahead > desired) desired = Math.max(desired, Math.min(ahead + clearance, desired + 45));

    const overhead = world.overheadAt(x, z);
    if (overhead > 0) {
      const underLimit = overhead - 9.0;
      const overLimit = overhead + 8.0;
      if (desired > underLimit && desired < overLimit) {
        desired = desired < overhead * 0.55 ? Math.min(desired, Math.max(3.0, underLimit)) : overLimit;
      }
    }

    if (!Number.isFinite(desired)) desired = this.baseAltitude;
    this.smoothDesired = damp(this.smoothDesired, desired, 1.5, dt);

    const stiffness = 0.85;
    const damping = 2.0 * Math.sqrt(stiffness);
    const accel = (this.smoothDesired - this.position[1]) * stiffness - this.verticalVelocity * damping;
    this.verticalVelocity = clamp(this.verticalVelocity + accel * dt, -13, 30);
    this.position[1] += this.verticalVelocity * dt;

    const hard = world.solidHeightAround(x, z, 2.0);
    const floor = hard + 2.6;
    if (this.position[1] < floor) {
      const lift = Math.min((floor - this.position[1]) * 4.0, 18) * dt;
      this.position[1] += lift;
      this.verticalVelocity = Math.max(this.verticalVelocity, 4);
      this.smoothDesired = Math.max(this.smoothDesired, floor);
    }
    if (this.position[1] < hard + 1.0) {
      this.position[1] += Math.min(hard + 1.0 - this.position[1], 20 * dt);
      this.verticalVelocity = Math.max(this.verticalVelocity, 6);
    }
    if (this.position[1] < 1.6) this.position[1] = 1.6;
    if (!Number.isFinite(this.position[1])) {
      this.position[1] = 60;
      this.verticalVelocity = 0;
    }
  }

  updateLandmark(dt, world, fx, fz) {
    this.landmarkCooldown -= dt;
    if (!this.landmark && this.landmarkCooldown <= 0) {
      this.landmarkCooldown = this.rng.range(14, 26);
      if (this.rng.chance(0.6)) {
        const found = world.findLandmark(this.position[0], this.position[2], fx, fz);
        if (found) {
          this.landmark = found;
          this.landmarkHold = this.rng.range(9, 17);
          if (this.mode === 'orbit') {
            this.orbitRadius = clamp(found.dist, 90, 260);
            this.orbitSign = this.rng.chance(0.5) ? 1 : -1;
          }
        }
      }
    }

    if (this.landmark) {
      this.landmarkHold -= dt;
      const keep = this.landmarkHold > 0 && this.mode !== 'canyon';
      this.landmarkWeight = damp(this.landmarkWeight, keep ? 1 : 0, 0.55, dt);
      if (!keep && this.landmarkWeight < 0.02) this.landmark = null;
    } else {
      this.landmarkWeight = damp(this.landmarkWeight, 0, 0.6, dt);
    }

    if (this.mode === 'orbit' && !this.landmark) {
      const found = world.findLandmark(this.position[0], this.position[2], fx, fz);
      if (found) {
        this.landmark = found;
        this.landmarkHold = this.modeLength;
        this.orbitRadius = clamp(found.dist, 90, 260);
        this.orbitSign = this.rng.chance(0.5) ? 1 : -1;
      }
    }
  }

  update(dt, camera, world) {
    this.time += dt;
    this.modeTimer += dt;
    if (this.modeTimer >= this.modeLength) this.pickMode();

    this.transition = Math.min(1, this.transition + dt / this.transitionLength);
    const raw = this.transition;
    const ease = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
    this.baseAltitude = lerp(this.fromAltitude, this.toAltitude, ease);
    this.lookPitchTarget = lerp(this.fromPitch, this.toPitch, ease);
    this.targetFov = lerp(this.fromFov, this.toFov, ease);
    this.turnSpeedScale = damp(this.turnSpeedScale, 1, 0.4, dt);
    this.targetSpeed = lerp(this.fromSpeed, this.toSpeed, ease) * this.turnSpeedScale;
    this.speed = damp(this.speed, this.targetSpeed, 0.35, dt);

    const spec = FLIGHT_MODES[this.mode];
    let ahead = 0;

    if (spec.grid) {
      const previousYaw = this.yaw;
      this.updateGridFlight(dt, world);
      this.yawRate = wrapAngle(this.yaw - previousYaw) / Math.max(dt, 1e-4);
      this.smoothYawRate = damp(this.smoothYawRate, this.yawRate, 3.0, dt);
      this.yawTarget = this.yaw;
      this.avoidBias = 0;
      this.avoidAccum = 0;
      ahead = this.corridorProbe(world, [14, 30, 52]);
    } else {
      this.corridorIndex = null;
      this.turn = null;
      this.corridorFloor = 0;
      ahead = this.updateFreeFlight(dt, world);
    }

    const fx = Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);

    this.updateLandmark(dt, world, fx, fz);
    this.updateAltitude(dt, world, fx, fz, ahead);

    if (!Number.isFinite(this.position[0]) || !Number.isFinite(this.position[2])) {
      this.position[0] = camera.position[0];
      this.position[2] = camera.position[2];
      this.yaw = 0;
      this.yawTarget = 0;
      this.avoidBias = 0;
      this.avoidAccum = 0;
      this.corridorIndex = null;
      this.turn = null;
      this.landmark = null;
    }

    const driftYaw = Math.sin(this.time * 0.11) * 0.055 + Math.sin(this.time * 0.047 + 1.7) * 0.035;
    const driftPitch = Math.sin(this.time * 0.083 + 0.6) * 0.022;

    let lookYawTarget = this.yaw + driftYaw;
    let lookPitchTarget = this.lookPitchTarget + driftPitch;

    if (this.landmark && this.landmarkWeight > 0.002) {
      const ox = this.landmark.x - this.position[0];
      const oy = this.landmark.y - this.position[1];
      const oz = this.landmark.z - this.position[2];
      const flat = Math.hypot(ox, oz) || 1;
      const targetYaw = Math.atan2(ox, -oz);
      const targetPitch = Math.atan2(oy, flat);
      lookYawTarget = this.yaw + wrapAngle(targetYaw - this.yaw) * this.landmarkWeight + driftYaw;
      lookPitchTarget = lerp(lookPitchTarget, targetPitch, this.landmarkWeight);
    }

    const maxLookRate = 1.15 * dt;
    const yawStep = wrapAngle(dampAngle(this.lookYaw, lookYawTarget, 1.15, dt) - this.lookYaw);
    this.lookYaw = wrapAngle(this.lookYaw + clamp(yawStep, -maxLookRate, maxLookRate));
    const pitchGoal = clamp(lookPitchTarget, -1.15, 0.95);
    const pitchStep = damp(this.lookPitch, pitchGoal, 0.8, dt) - this.lookPitch;
    this.lookPitch += clamp(pitchStep, -maxLookRate * 0.6, maxLookRate * 0.6);

    const bankTarget = clamp(-this.smoothYawRate * 1.9, -0.30, 0.30);
    this.roll = damp(this.roll, bankTarget + Math.sin(this.time * 0.093) * 0.012, 1.4, dt);

    const fovGoal = this.targetFov + clamp(this.speed - 20, -6, 14) * 0.3;
    const fovNext = damp(this.fov, fovGoal, 0.45, dt);
    const fovLimit = 3.5 * dt;
    this.fov += clamp(fovNext - this.fov, -fovLimit, fovLimit);

    vec3.copy(camera.position, this.position);

    const cp = Math.cos(this.lookPitch);
    const lookForward = [
      Math.sin(this.lookYaw) * cp,
      Math.sin(this.lookPitch),
      -Math.cos(this.lookYaw) * cp,
    ];
    camera.target[0] = camera.position[0] + lookForward[0];
    camera.target[1] = camera.position[1] + lookForward[1];
    camera.target[2] = camera.position[2] + lookForward[2];

    const right = [Math.cos(this.lookYaw), 0, Math.sin(this.lookYaw)];
    const sr = Math.sin(this.roll);
    camera.up[0] = right[0] * sr;
    camera.up[1] = Math.cos(this.roll);
    camera.up[2] = right[2] * sr;

    camera.fov = this.fov;
  }
}
