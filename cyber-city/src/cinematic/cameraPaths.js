import {
  vec3, clamp, lerp, easeByName, splineAt, turbulence, Ease, DEG2RAD,
} from '../core/math.js';

const SHOT_TYPES = {};

SHOT_TYPES.keys = (shot, localT, out) => {
  const keys = shot.keys;
  const n = keys.length;
  if (n === 0) return false;
  if (n === 1) {
    vec3.copy(out.position, keys[0].position);
    vec3.copy(out.target, keys[0].target);
    out.fov = keys[0].fov;
    out.roll = keys[0].roll;
    return true;
  }

  if (shot.spline && n >= 3) {
    const total = keys[n - 1].time - keys[0].time;
    const raw = total > 1e-6 ? clamp((localT - keys[0].time) / total, 0, 1) : 0;
    const eased = easeByName(shot.ease)(raw);
    splineAt(out.position, shot.positionPoints, eased, shot.tension);
    splineAt(out.target, shot.targetPoints, eased, shot.tension);

    let i = 0;
    while (i < n - 2 && keys[i + 1].time <= localT) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const span = Math.max(b.time - a.time, 1e-6);
    const f = easeByName(b.ease || shot.ease)(clamp((localT - a.time) / span, 0, 1));
    out.fov = lerp(a.fov, b.fov, f);
    out.roll = lerp(a.roll, b.roll, f);
    return true;
  }

  let i = 0;
  while (i < n - 2 && keys[i + 1].time <= localT) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(b.time - a.time, 1e-6);
  const f = easeByName(b.ease || shot.ease)(clamp((localT - a.time) / span, 0, 1));
  vec3.lerp(out.position, a.position, b.position, f);
  vec3.lerp(out.target, a.target, b.target, f);
  out.fov = lerp(a.fov, b.fov, f);
  out.roll = lerp(a.roll, b.roll, f);
  return true;
};

SHOT_TYPES.orbit = (shot, localT, out, ctx) => {
  const p = shot.length > 0 ? clamp(localT / shot.length, 0, 1) : 0;
  const e = easeByName(shot.ease)(p);
  const centre = shot.subject ? shot.subject(ctx) : shot.centre;
  const angle = lerp(shot.fromAngle, shot.toAngle, e);
  const radius = lerp(shot.fromRadius, shot.toRadius, e);
  const height = lerp(shot.fromHeight, shot.toHeight, e);
  out.position[0] = centre[0] + Math.cos(angle) * radius;
  out.position[1] = centre[1] + height;
  out.position[2] = centre[2] + Math.sin(angle) * radius;
  vec3.copy(out.target, centre);
  out.target[1] += shot.lookHeight;
  out.fov = lerp(shot.fromFov, shot.toFov, e);
  out.roll = lerp(shot.fromRoll, shot.toRoll, e);
  return true;
};

SHOT_TYPES.track = (shot, localT, out, ctx) => {
  const p = shot.length > 0 ? clamp(localT / shot.length, 0, 1) : 0;
  const e = easeByName(shot.ease)(p);
  const centre = shot.subject ? shot.subject(ctx) : shot.centre;
  for (let i = 0; i < 3; i++) {
    out.position[i] = centre[i] + lerp(shot.fromOffset[i], shot.toOffset[i], e);
    out.target[i] = centre[i] + lerp(shot.fromLook[i], shot.toLook[i], e);
  }
  out.fov = lerp(shot.fromFov, shot.toFov, e);
  out.roll = lerp(shot.fromRoll, shot.toRoll, e);
  return true;
};

SHOT_TYPES.dolly = (shot, localT, out) => {
  const p = shot.length > 0 ? clamp(localT / shot.length, 0, 1) : 0;
  const e = easeByName(shot.ease)(p);
  vec3.lerp(out.position, shot.from, shot.to, e);
  vec3.lerp(out.target, shot.lookFrom, shot.lookTo, e);
  out.fov = lerp(shot.fromFov, shot.toFov, e);
  out.roll = lerp(shot.fromRoll, shot.toRoll, e);
  return true;
};

SHOT_TYPES.custom = (shot, localT, out, ctx) => {
  shot.evaluate(localT, out, ctx);
  return true;
};

let shotSerial = 0;

export class Shot {
  constructor(spec) {
    this.id = spec.id || `shot${shotSerial++}`;
    this.type = spec.type || 'keys';
    this.start = spec.start;
    this.length = spec.length !== undefined ? spec.length : (spec.end - spec.start);
    this.end = spec.start + this.length;
    this.blend = spec.blend || 0;
    this.blendEase = spec.blendEase || 'inOutCubic';
    this.ease = spec.ease || 'inOutCubic';
    this.spline = !!spec.spline;
    this.tension = spec.tension !== undefined ? spec.tension : 0.5;

    this.keys = [];
    this.positionPoints = [];
    this.targetPoints = [];

    this.centre = spec.centre || [0, 0, 0];
    this.subject = spec.subject || null;
    this.fromAngle = spec.fromAngle || 0;
    this.toAngle = spec.toAngle !== undefined ? spec.toAngle : (spec.fromAngle || 0) + Math.PI;
    this.fromRadius = spec.fromRadius !== undefined ? spec.fromRadius : (spec.radius || 20);
    this.toRadius = spec.toRadius !== undefined ? spec.toRadius : this.fromRadius;
    this.fromHeight = spec.fromHeight !== undefined ? spec.fromHeight : (spec.height || 0);
    this.toHeight = spec.toHeight !== undefined ? spec.toHeight : this.fromHeight;
    this.lookHeight = spec.lookHeight || 0;

    this.fromOffset = spec.fromOffset || [0, 0, 10];
    this.toOffset = spec.toOffset || this.fromOffset;
    this.fromLook = spec.fromLook || [0, 0, 0];
    this.toLook = spec.toLook || this.fromLook;

    this.from = spec.from || [0, 0, 0];
    this.to = spec.to || [0, 0, 0];
    this.lookFrom = spec.lookFrom || [0, 0, -1];
    this.lookTo = spec.lookTo || this.lookFrom;

    this.fromFov = spec.fromFov !== undefined ? spec.fromFov : (spec.fov || 45);
    this.toFov = spec.toFov !== undefined ? spec.toFov : this.fromFov;
    this.fromRoll = spec.fromRoll !== undefined ? spec.fromRoll : (spec.roll || 0);
    this.toRoll = spec.toRoll !== undefined ? spec.toRoll : this.fromRoll;

    this.evaluate = spec.evaluate || null;

    this.handheld = spec.handheld !== undefined ? spec.handheld : 0.35;
    this.shakeScale = spec.shakeScale !== undefined ? spec.shakeScale : 1;
    this.focusBias = spec.focusBias !== undefined ? spec.focusBias : 0;
    this.focusOn = spec.focusOn || null;
    this.focusRange = spec.focusRange;
    this.dofScale = spec.dofScale !== undefined ? spec.dofScale : 1;
    this.label = spec.label || '';
  }

  keyframe(time, position, target, fov, opts = {}) {
    const key = {
      time,
      position: [position[0], position[1], position[2]],
      target: [target[0], target[1], target[2]],
      fov: fov !== undefined ? fov : 45,
      roll: opts.roll || 0,
      ease: opts.ease || null,
    };
    this.keys.push(key);
    this.keys.sort((a, b) => a.time - b.time);
    this.positionPoints = this.keys.map((k) => k.position);
    this.targetPoints = this.keys.map((k) => k.target);
    return this;
  }
}

const SCRATCH_A = {
  position: vec3.create(),
  target: vec3.create(),
  fov: 45,
  roll: 0,
};
const SCRATCH_B = {
  position: vec3.create(),
  target: vec3.create(),
  fov: 45,
  roll: 0,
};

export class CameraRig {
  constructor() {
    this.shots = [];
    this.result = {
      position: vec3.create(),
      target: vec3.create(),
      fov: 45,
      roll: 0,
    };
    this.up = vec3.create(0, 1, 0);
    this.activeShot = null;
    this.previousShot = null;
    this.cutTime = -99;
    this.impulses = [];
    this.shakeAmount = 0;
    this.shakeFrequency = 7.5;
    this.handheldScale = 1;
    this.fovPunch = 0;
    this.focusDistance = 30;
    this.focusRange = 8;
  }

  add(spec) {
    const shot = new Shot(spec);
    this.shots.push(shot);
    this.shots.sort((a, b) => a.start - b.start);
    return shot;
  }

  shot(start, length, opts = {}) {
    return this.add(Object.assign({ type: 'keys', start, length }, opts));
  }

  cut(start, length, opts = {}) {
    return this.add(Object.assign({ type: 'keys', start, length, blend: 0 }, opts));
  }

  orbit(start, length, opts = {}) {
    return this.add(Object.assign({ type: 'orbit', start, length }, opts));
  }

  trackShot(start, length, opts = {}) {
    return this.add(Object.assign({ type: 'track', start, length }, opts));
  }

  dolly(start, length, opts = {}) {
    return this.add(Object.assign({ type: 'dolly', start, length }, opts));
  }

  custom(start, length, evaluate, opts = {}) {
    return this.add(Object.assign({ type: 'custom', start, length, evaluate }, opts));
  }

  impulse(time, spec) {
    this.impulses.push({
      time,
      shake: spec.shake || 0,
      decay: spec.decay || 7,
      fov: spec.fov || 0,
      roll: spec.roll || 0,
      push: spec.push || 0,
      frequency: spec.frequency || 8.5,
    });
    this.impulses.sort((a, b) => a.time - b.time);
    return this;
  }

  shotAt(t) {
    let found = null;
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      if (t >= s.start && t < s.end) found = s;
    }
    if (found) return found;

    let last = null;
    for (const s of this.shots) {
      if (s.start <= t) last = s;
    }
    return last || this.shots[0] || null;
  }

  shotIndexAt(t) {
    const shot = this.shotAt(t);
    return shot ? this.shots.indexOf(shot) : -1;
  }

  evaluateShot(shot, t, out, ctx) {
    const fn = SHOT_TYPES[shot.type];
    if (!fn) return false;
    return fn(shot, t - shot.start, out, ctx);
  }

  evaluate(t, ctx) {
    const shot = this.shotAt(t);
    if (!shot) return this.result;

    const out = this.result;
    this.evaluateShot(shot, t, SCRATCH_A, ctx);
    vec3.copy(out.position, SCRATCH_A.position);
    vec3.copy(out.target, SCRATCH_A.target);
    out.fov = SCRATCH_A.fov;
    out.roll = SCRATCH_A.roll;

    if (shot.blend > 0 && t - shot.start < shot.blend) {
      const index = this.shots.indexOf(shot);
      const prev = index > 0 ? this.shots[index - 1] : null;
      if (prev) {
        this.evaluateShot(prev, Math.min(t, prev.end - 1e-4), SCRATCH_B, ctx);
        const raw = (t - shot.start) / shot.blend;
        const f = easeByName(shot.blendEase)(clamp(raw, 0, 1));
        vec3.lerp(out.position, SCRATCH_B.position, out.position, f);
        vec3.lerp(out.target, SCRATCH_B.target, out.target, f);
        out.fov = lerp(SCRATCH_B.fov, out.fov, f);
        out.roll = lerp(SCRATCH_B.roll, out.roll, f);
      }
    }

    if (shot !== this.activeShot) {
      this.previousShot = this.activeShot;
      this.activeShot = shot;
      this.cutTime = shot.start;
    }

    const hh = shot.handheld * this.handheldScale;
    if (hh > 0.0001) {
      const s = t * 0.55;
      const ax = turbulence(s + 11.3, 3) * hh;
      const ay = turbulence(s + 41.7, 3) * hh;
      const az = turbulence(s + 77.1, 3) * hh;
      out.position[0] += ax * 0.11;
      out.position[1] += ay * 0.085;
      out.position[2] += az * 0.11;
      out.target[0] += turbulence(s * 1.3 + 5.1, 3) * hh * 0.16;
      out.target[1] += turbulence(s * 1.3 + 23.9, 3) * hh * 0.13;
      out.roll += turbulence(s * 0.7 + 61.2, 2) * hh * 0.006;
    }

    let shake = this.shakeAmount * shot.shakeScale;
    let fovPunch = this.fovPunch;
    let rollPunch = 0;
    let push = 0;
    let frequency = this.shakeFrequency;

    for (let i = 0; i < this.impulses.length; i++) {
      const imp = this.impulses[i];
      const age = t - imp.time;
      if (age < 0 || age > 2.2) continue;
      const decay = Math.exp(-age * imp.decay);
      shake += imp.shake * decay * shot.shakeScale;
      fovPunch += imp.fov * decay;
      rollPunch += imp.roll * decay;
      push += imp.push * decay;
      frequency = Math.max(frequency, Math.min(imp.frequency, 12));
    }

    if (shake > 0.0001) {
      const s = t * frequency;
      out.position[0] += turbulence(s, 2) * shake;
      out.position[1] += turbulence(s + 31.7, 2) * shake * 0.8;
      out.position[2] += turbulence(s + 63.4, 2) * shake;
      out.target[0] += turbulence(s + 97.2, 2) * shake * 1.4;
      out.target[1] += turbulence(s + 129.6, 2) * shake * 1.2;
      out.roll += turbulence(s * 0.5 + 151.1, 2) * shake * 0.02;
    }

    if (push !== 0) {
      const fwd = vec3.create();
      vec3.sub(fwd, out.target, out.position);
      vec3.normalize(fwd, fwd);
      vec3.scaleAndAdd(out.position, out.position, fwd, push);
    }

    out.fov = clamp(out.fov + fovPunch, 8, 140);
    out.roll += rollPunch;

    let focusPoint = out.target;
    if (shot.focusOn) focusPoint = shot.focusOn(ctx) || out.target;
    const dx = focusPoint[0] - out.position[0];
    const dy = focusPoint[1] - out.position[1];
    const dz = focusPoint[2] - out.position[2];
    this.focusDistance = Math.max(0.2, Math.hypot(dx, dy, dz) + shot.focusBias);
    this.focusRange = shot.focusRange !== undefined
      ? shot.focusRange
      : Math.max(1.2, this.focusDistance * 0.22);
    this.dofScale = shot.dofScale;

    return out;
  }

  apply(camera) {
    const out = this.result;
    vec3.copy(camera.position, out.position);
    vec3.copy(camera.target, out.target);
    camera.fov = out.fov;

    const forward = vec3.create();
    vec3.sub(forward, out.target, out.position);
    vec3.normalize(forward, forward);
    const worldUp = Math.abs(forward[1]) > 0.995 ? [0, 0, 1] : [0, 1, 0];
    const right = vec3.create();
    vec3.cross(right, forward, worldUp);
    vec3.normalize(right, right);
    const up = vec3.create();
    vec3.cross(up, right, forward);
    vec3.normalize(up, up);

    const c = Math.cos(out.roll);
    const s = Math.sin(out.roll);
    camera.up[0] = up[0] * c + right[0] * s;
    camera.up[1] = up[1] * c + right[1] * s;
    camera.up[2] = up[2] * c + right[2] * s;
  }
}

export function ringPoints(centre, radius, height, from, to, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = count > 1 ? i / (count - 1) : 0;
    const a = lerp(from, to, f);
    out.push([
      centre[0] + Math.cos(a) * radius,
      centre[1] + height,
      centre[2] + Math.sin(a) * radius,
    ]);
  }
  return out;
}

export function horizontalToVerticalFov(hFovDegrees, aspect) {
  const h = hFovDegrees * DEG2RAD;
  return 2 * Math.atan(Math.tan(h / 2) / aspect) / DEG2RAD;
}

export { Ease };
