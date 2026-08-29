export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function fract(x) {
  return x - Math.floor(x);
}

export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export const vec3 = {
  create(x = 0, y = 0, z = 0) {
    return new Float32Array([x, y, z]);
  },
  set(out, x, y, z) {
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  },
  copy(out, a) {
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2];
    return out;
  },
  add(out, a, b) {
    out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2];
    return out;
  },
  sub(out, a, b) {
    out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
    return out;
  },
  scale(out, a, s) {
    out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s;
    return out;
  },
  scaleAndAdd(out, a, b, s) {
    out[0] = a[0] + b[0] * s; out[1] = a[1] + b[1] * s; out[2] = a[2] + b[2] * s;
    return out;
  },
  mul(out, a, b) {
    out[0] = a[0] * b[0]; out[1] = a[1] * b[1]; out[2] = a[2] * b[2];
    return out;
  },
  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2];
    const bx = b[0], by = b[1], bz = b[2];
    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
  },
  length(a) {
    return Math.hypot(a[0], a[1], a[2]);
  },
  sqrDistance(a, b) {
    const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
    return x * x + y * y + z * z;
  },
  normalize(out, a) {
    const len = Math.hypot(a[0], a[1], a[2]);
    if (len > 1e-8) {
      const inv = 1 / len;
      out[0] = a[0] * inv; out[1] = a[1] * inv; out[2] = a[2] * inv;
    } else {
      out[0] = 0; out[1] = 0; out[2] = 0;
    }
    return out;
  },
  lerp(out, a, b, t) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  },
  transformMat4(out, a, m) {
    const x = a[0], y = a[1], z = a[2];
    let w = m[3] * x + m[7] * y + m[11] * z + m[15];
    w = w || 1;
    out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out;
  },
};

export const mat4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    return m;
  },
  identity(out) {
    out.fill(0);
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    return out;
  },
  copy(out, a) {
    out.set(a);
    return out;
  },
  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[11] = -1;
    if (far !== null && far !== Infinity) {
      const nf = 1 / (near - far);
      out[10] = (far + near) * nf;
      out[14] = 2 * far * near * nf;
    } else {
      out[10] = -1;
      out[14] = -2 * near;
    }
    return out;
  },
  ortho(out, left, right, bottom, top, near, far) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = -2 * lr;
    out[5] = -2 * bt;
    out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  },
  lookAt(out, eye, center, up) {
    const z = vec3.create();
    vec3.sub(z, eye, center);
    vec3.normalize(z, z);
    const x = vec3.create();
    vec3.cross(x, up, z);
    vec3.normalize(x, x);
    const y = vec3.create();
    vec3.cross(y, z, x);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
    out[12] = -vec3.dot(x, eye);
    out[13] = -vec3.dot(y, eye);
    out[14] = -vec3.dot(z, eye);
    out[15] = 1;
    return out;
  },
  fromRotationTranslationScale(out, yaw, pitch, tx, ty, tz, sx, sy, sz) {
    const cy = Math.cos(yaw), sy2 = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    out[0] = cy * sx; out[1] = 0; out[2] = -sy2 * sx; out[3] = 0;
    out[4] = sy2 * sp * sy; out[5] = cp * sy; out[6] = cy * sp * sy; out[7] = 0;
    out[8] = sy2 * cp * sz; out[9] = -sp * sz; out[10] = cy * cp * sz; out[11] = 0;
    out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
    return out;
  },
  invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  transpose(out, a) {
    if (out === a) {
      const a01 = a[1], a02 = a[2], a03 = a[3];
      const a12 = a[6], a13 = a[7], a23 = a[11];
      out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
      out[4] = a01; out[6] = a[9]; out[7] = a[13];
      out[8] = a02; out[9] = a12; out[11] = a[14];
      out[12] = a03; out[13] = a13; out[14] = a23;
    } else {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) out[i * 4 + j] = a[j * 4 + i];
      }
    }
    return out;
  },
};

export class Frustum {
  constructor() {
    this.planes = new Float32Array(24);
  }

  fromMatrix(m) {
    const p = this.planes;
    for (let i = 0; i < 3; i++) {
      const s = i * 8;
      p[s] = m[3] + m[i];
      p[s + 1] = m[7] + m[4 + i];
      p[s + 2] = m[11] + m[8 + i];
      p[s + 3] = m[15] + m[12 + i];
      p[s + 4] = m[3] - m[i];
      p[s + 5] = m[7] - m[4 + i];
      p[s + 6] = m[11] - m[8 + i];
      p[s + 7] = m[15] - m[12 + i];
    }
    for (let i = 0; i < 6; i++) {
      const o = i * 4;
      const inv = 1 / Math.hypot(p[o], p[o + 1], p[o + 2]);
      p[o] *= inv; p[o + 1] *= inv; p[o + 2] *= inv; p[o + 3] *= inv;
    }
    return this;
  }

  intersectsBox(minX, minY, minZ, maxX, maxY, maxZ) {
    const p = this.planes;
    for (let i = 0; i < 6; i++) {
      const o = i * 4;
      const nx = p[o], ny = p[o + 1], nz = p[o + 2], d = p[o + 3];
      const vx = nx > 0 ? maxX : minX;
      const vy = ny > 0 ? maxY : minY;
      const vz = nz > 0 ? maxZ : minZ;
      if (nx * vx + ny * vy + nz * vz + d < 0) return false;
    }
    return true;
  }

  intersectsSphere(x, y, z, r) {
    const p = this.planes;
    for (let i = 0; i < 6; i++) {
      const o = i * 4;
      if (p[o] * x + p[o + 1] * y + p[o + 2] * z + p[o + 3] < -r) return false;
    }
    return true;
  }
}

export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dampAngle(current, target, rate, dt) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

export function inverseLerp(a, b, v) {
  if (a === b) return 0;
  return clamp((v - a) / (b - a), 0, 1);
}

export function remap(v, inA, inB, outA, outB) {
  return outA + (outB - outA) * inverseLerp(inA, inB, v);
}

export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 + (--t) * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inQuint: (t) => t * t * t * t * t,
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  smooth: (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),

  impact: (t) => {
    const u = clamp(t, 0, 1);
    return Math.pow(1 - u, 2.6);
  },

  punch: (t) => {
    const u = clamp(t, 0, 1);
    return Math.sin(u * Math.PI) * Math.pow(1 - u, 0.35);
  },
};

export function easeByName(name) {
  return (name && Ease[name]) || Ease.linear;
}

export function catmullRom(out, p0, p1, p2, p3, t, tension = 0.5) {
  const t2 = t * t;
  const t3 = t2 * t;
  for (let i = 0; i < 3; i++) {
    const m1 = tension * (p2[i] - p0[i]);
    const m2 = tension * (p3[i] - p1[i]);
    out[i] = (2 * p1[i] - 2 * p2[i] + m1 + m2) * t3
           + (-3 * p1[i] + 3 * p2[i] - 2 * m1 - m2) * t2
           + m1 * t
           + p1[i];
  }
  return out;
}

export function splineAt(out, points, t, tension = 0.5) {
  const n = points.length;
  if (n === 0) return vec3.set(out, 0, 0, 0);
  if (n === 1) return vec3.copy(out, points[0]);
  const u = clamp(t, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  const f = u - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n - 1, i + 2)];
  return catmullRom(out, p0, p1, p2, p3, f, tension);
}

export const quat = {
  create(x = 0, y = 0, z = 0, w = 1) {
    return new Float32Array([x, y, z, w]);
  },
  identity(out) {
    out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
    return out;
  },
  copy(out, a) {
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
    return out;
  },
  set(out, x, y, z, w) {
    out[0] = x; out[1] = y; out[2] = z; out[3] = w;
    return out;
  },
  fromAxisAngle(out, axis, angle) {
    const half = angle * 0.5;
    const s = Math.sin(half);
    const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    out[0] = (axis[0] / len) * s;
    out[1] = (axis[1] / len) * s;
    out[2] = (axis[2] / len) * s;
    out[3] = Math.cos(half);
    return out;
  },

  fromEuler(out, pitch, yaw, roll) {
    const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
    out[0] = sp * cy * cr + cp * sy * sr;
    out[1] = cp * sy * cr - sp * cy * sr;
    out[2] = cp * cy * sr - sp * sy * cr;
    out[3] = cp * cy * cr + sp * sy * sr;
    return out;
  },
  multiply(out, a, b) {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3];
    const bx = b[0], by = b[1], bz = b[2], bw = b[3];
    out[0] = aw * bx + ax * bw + ay * bz - az * by;
    out[1] = aw * by - ax * bz + ay * bw + az * bx;
    out[2] = aw * bz + ax * by - ay * bx + az * bw;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
  },
  normalize(out, a) {
    const len = Math.hypot(a[0], a[1], a[2], a[3]);
    if (len < 1e-8) return quat.identity(out);
    const inv = 1 / len;
    out[0] = a[0] * inv; out[1] = a[1] * inv; out[2] = a[2] * inv; out[3] = a[3] * inv;
    return out;
  },
  slerp(out, a, b, t) {
    let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (cos > 0.9995) {
      s0 = 1 - t;
      s1 = t;
    } else {
      const theta = Math.acos(cos);
      const sinTheta = Math.sin(theta);
      s0 = Math.sin((1 - t) * theta) / sinTheta;
      s1 = Math.sin(t * theta) / sinTheta;
    }
    out[0] = a[0] * s0 + bx * s1;
    out[1] = a[1] * s0 + by * s1;
    out[2] = a[2] * s0 + bz * s1;
    out[3] = a[3] * s0 + bw * s1;
    return quat.normalize(out, out);
  },
  rotateVec3(out, q, v) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const vx = v[0], vy = v[1], vz = v[2];
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    out[0] = vx + w * tx + (y * tz - z * ty);
    out[1] = vy + w * ty + (z * tx - x * tz);
    out[2] = vz + w * tz + (x * ty - y * tx);
    return out;
  },

  fromUnitY(out, dir) {
    const d = vec3.create(dir[0], dir[1], dir[2]);
    vec3.normalize(d, d);
    const dot = d[1];
    if (dot > 0.999999) return quat.identity(out);
    if (dot < -0.999999) return quat.set(out, 0, 0, 1, 0);

    const ax = d[2];
    const az = -d[0];
    const s = Math.sqrt((1 + dot) * 2);
    const invs = 1 / s;
    out[0] = ax * invs;
    out[1] = 0;
    out[2] = az * invs;
    out[3] = s * 0.5;
    return quat.normalize(out, out);
  },

  lookRotation(out, forward, up) {
    const f = vec3.create();
    vec3.normalize(f, forward);
    const r = vec3.create();
    vec3.cross(r, up, f);
    if (vec3.length(r) < 1e-5) {
      vec3.cross(r, vec3.create(1, 0, 0), f);
      if (vec3.length(r) < 1e-5) vec3.cross(r, vec3.create(0, 0, 1), f);
    }
    vec3.normalize(r, r);
    const u = vec3.create();
    vec3.cross(u, f, r);
    const m00 = r[0], m01 = u[0], m02 = f[0];
    const m10 = r[1], m11 = u[1], m12 = f[1];
    const m20 = r[2], m21 = u[2], m22 = f[2];
    const trace = m00 + m11 + m22;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      out[3] = 0.25 * s;
      out[0] = (m21 - m12) / s;
      out[1] = (m02 - m20) / s;
      out[2] = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      out[3] = (m21 - m12) / s;
      out[0] = 0.25 * s;
      out[1] = (m01 + m10) / s;
      out[2] = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      out[3] = (m02 - m20) / s;
      out[0] = (m01 + m10) / s;
      out[1] = 0.25 * s;
      out[2] = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      out[3] = (m10 - m01) / s;
      out[0] = (m02 + m20) / s;
      out[1] = (m12 + m21) / s;
      out[2] = 0.25 * s;
    }
    return quat.normalize(out, out);
  },
};

export function hashF(n) {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hashF(i * 127.1), hashF((i + 1) * 127.1), u);
}

export function fbm1(x, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise1(x) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
  }
  return sum / norm;
}

export function turbulence(x, octaves = 4) {
  return fbm1(x, octaves) * 2 - 1;
}
