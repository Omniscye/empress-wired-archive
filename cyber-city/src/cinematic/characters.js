import { vec3, quat, clamp, lerp, Ease, TAU, turbulence } from '../core/math.js';
import { CINE_KIND } from '../shaders/cinematic.js';

export const JOINTS = [
  'pelvis', 'chest', 'neck', 'head',
  'lShoulder', 'lElbow', 'lHand',
  'rShoulder', 'rElbow', 'rHand',
  'lHip', 'lKnee', 'lFoot',
  'rHip', 'rKnee', 'rFoot',
];

export const JOINT_INDEX = {};
JOINTS.forEach((name, i) => { JOINT_INDEX[name] = i; });

export const JOINT_COUNT = JOINTS.length;

const BONES = [
  ['pelvis', 'chest', 1.55],
  ['chest', 'neck', 1.05],
  ['chest', 'lShoulder', 0.72],
  ['chest', 'rShoulder', 0.72],
  ['lShoulder', 'lElbow', 0.62],
  ['lElbow', 'lHand', 0.50],
  ['rShoulder', 'rElbow', 0.62],
  ['rElbow', 'rHand', 0.50],
  ['pelvis', 'lHip', 0.70],
  ['pelvis', 'rHip', 0.70],
  ['lHip', 'lKnee', 0.78],
  ['lKnee', 'lFoot', 0.62],
  ['rHip', 'rKnee', 0.78],
  ['rKnee', 'rFoot', 0.62],
];

export function createPose(values) {
  const pose = new Float32Array(JOINT_COUNT * 3);
  if (values) setPose(pose, values);
  return pose;
}

export function setPose(pose, values) {
  for (const name in values) {
    const i = JOINT_INDEX[name];
    if (i === undefined) continue;
    const v = values[name];
    pose[i * 3] = v[0];
    pose[i * 3 + 1] = v[1];
    pose[i * 3 + 2] = v[2];
  }
  return pose;
}

const POSE_LEN = JOINT_COUNT * 3;

export function blendPose(out, a, b, t) {
  const f = clamp(t, 0, 1);
  for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * f;
  return out;
}

export function createStandingPose() {
  return createPose({
    pelvis: [0, 0.95, 0],
    chest: [0, 1.36, 0.02],
    neck: [0, 1.55, 0.01],
    head: [0, 1.73, 0.01],
    lShoulder: [-0.20, 1.50, 0],
    lElbow: [-0.27, 1.15, 0.02],
    lHand: [-0.29, 0.80, 0.06],
    rShoulder: [0.20, 1.50, 0],
    rElbow: [0.27, 1.15, 0.02],
    rHand: [0.29, 0.80, 0.06],
    lHip: [-0.11, 0.92, 0],
    lKnee: [-0.12, 0.50, 0.01],
    lFoot: [-0.12, 0.06, 0.05],
    rHip: [0.11, 0.92, 0],
    rKnee: [0.12, 0.50, 0.01],
    rFoot: [0.12, 0.06, 0.05],
  });
}

export function createFallingPose() {
  return createPose({
    pelvis: [0, 0.95, 0],
    chest: [0, 1.34, -0.10],
    neck: [0, 1.52, -0.16],
    head: [0, 1.69, -0.24],
    lShoulder: [-0.22, 1.47, -0.10],
    lElbow: [-0.52, 1.62, -0.28],
    lHand: [-0.78, 1.74, -0.50],
    rShoulder: [0.22, 1.47, -0.10],
    rElbow: [0.54, 1.58, -0.24],
    rHand: [0.82, 1.66, -0.44],
    lHip: [-0.12, 0.93, 0.02],
    lKnee: [-0.20, 0.54, 0.30],
    lFoot: [-0.26, 0.22, 0.62],
    rHip: [0.12, 0.93, 0.02],
    rKnee: [0.17, 0.50, 0.22],
    rFoot: [0.20, 0.10, 0.52],
  });
}

export function createRunningPose(phase = 0, out) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  return setPose(out || new Float32Array(JOINT_COUNT * 3), {
    pelvis: [0, 0.94 + Math.abs(s) * 0.05, 0],
    chest: [0, 1.33, 0.10],
    neck: [0, 1.51, 0.14],
    head: [0, 1.68, 0.18],
    lShoulder: [-0.21, 1.47, 0.06],
    lElbow: [-0.30, 1.22, 0.10 + s * 0.30],
    lHand: [-0.32, 1.05, 0.16 + s * 0.58],
    rShoulder: [0.21, 1.47, 0.06],
    rElbow: [0.30, 1.22, 0.10 - s * 0.30],
    rHand: [0.32, 1.05, 0.16 - s * 0.58],
    lHip: [-0.11, 0.91, 0],
    lKnee: [-0.13, 0.52 + Math.max(0, s) * 0.16, -s * 0.42],
    lFoot: [-0.14, 0.10 + Math.max(0, s) * 0.30, -s * 0.72 - c * 0.10],
    rHip: [0.11, 0.91, 0],
    rKnee: [0.13, 0.52 + Math.max(0, -s) * 0.16, s * 0.42],
    rFoot: [0.14, 0.10 + Math.max(0, -s) * 0.30, s * 0.72 + c * 0.10],
  });
}

export function createAttackPose() {
  return createPose({
    pelvis: [0.04, 0.88, 0.10],
    chest: [0.10, 1.28, 0.26],
    neck: [0.12, 1.46, 0.32],
    head: [0.14, 1.62, 0.38],
    lShoulder: [-0.14, 1.44, 0.24],
    lElbow: [-0.40, 1.30, -0.02],
    lHand: [-0.62, 1.14, -0.30],
    rShoulder: [0.30, 1.42, 0.28],
    rElbow: [0.56, 1.24, 0.58],
    rHand: [0.62, 0.92, 0.92],
    lHip: [-0.10, 0.86, 0.08],
    lKnee: [-0.18, 0.46, -0.20],
    lFoot: [-0.24, 0.06, -0.48],
    rHip: [0.12, 0.86, 0.12],
    rKnee: [0.20, 0.44, 0.44],
    rFoot: [0.24, 0.05, 0.70],
  });
}

export function createFloatingPose() {
  return createPose({
    pelvis: [0, 0.95, 0],
    chest: [0, 1.33, 0.06],
    neck: [0, 1.51, 0.08],
    head: [0, 1.68, 0.10],
    lShoulder: [-0.21, 1.46, 0.04],
    lElbow: [-0.48, 1.34, -0.06],
    lHand: [-0.70, 1.22, -0.02],
    rShoulder: [0.21, 1.46, 0.04],
    rElbow: [0.48, 1.34, -0.06],
    rHand: [0.70, 1.22, -0.02],
    lHip: [-0.11, 0.92, 0.02],
    lKnee: [-0.16, 0.56, 0.22],
    lFoot: [-0.18, 0.24, 0.44],
    rHip: [0.11, 0.92, 0.02],
    rKnee: [0.16, 0.56, 0.18],
    rFoot: [0.18, 0.22, 0.40],
  });
}

export function createDefensivePose() {
  return createPose({
    pelvis: [-0.04, 0.86, -0.04],
    chest: [-0.08, 1.26, 0.06],
    neck: [-0.06, 1.44, 0.10],
    head: [-0.04, 1.60, 0.14],
    lShoulder: [-0.26, 1.40, 0.06],
    lElbow: [-0.34, 1.14, 0.30],
    lHand: [-0.16, 1.02, 0.52],
    rShoulder: [0.18, 1.42, 0.02],
    rElbow: [0.34, 1.18, 0.24],
    rHand: [0.22, 1.06, 0.54],
    lHip: [-0.12, 0.84, -0.02],
    lKnee: [-0.20, 0.44, 0.14],
    lFoot: [-0.26, 0.05, 0.30],
    rHip: [0.10, 0.84, -0.02],
    rKnee: [0.16, 0.44, -0.18],
    rFoot: [0.20, 0.05, -0.42],
  });
}

export function createReachingPose() {
  return createPose({
    pelvis: [0, 0.96, 0],
    chest: [0, 1.36, -0.04],
    neck: [0, 1.55, -0.08],
    head: [0, 1.73, -0.14],
    lShoulder: [-0.20, 1.51, -0.02],
    lElbow: [-0.42, 1.86, 0.02],
    lHand: [-0.52, 2.22, 0.10],
    rShoulder: [0.20, 1.51, -0.02],
    rElbow: [0.42, 1.86, 0.02],
    rHand: [0.52, 2.22, 0.10],
    lHip: [-0.11, 0.93, 0],
    lKnee: [-0.13, 0.50, 0.02],
    lFoot: [-0.13, 0.06, 0.06],
    rHip: [0.11, 0.93, 0],
    rKnee: [0.13, 0.50, 0.02],
    rFoot: [0.13, 0.06, 0.06],
  });
}

export function createStruckPose() {
  return createPose({
    pelvis: [0, 0.92, -0.08],
    chest: [-0.06, 1.30, -0.26],
    neck: [-0.08, 1.47, -0.36],
    head: [-0.10, 1.62, -0.48],
    lShoulder: [-0.24, 1.42, -0.26],
    lElbow: [-0.56, 1.50, -0.44],
    lHand: [-0.84, 1.54, -0.62],
    rShoulder: [0.18, 1.44, -0.24],
    rElbow: [0.36, 1.20, -0.46],
    rHand: [0.42, 0.96, -0.66],
    lHip: [-0.12, 0.90, -0.04],
    lKnee: [-0.18, 0.50, 0.26],
    lFoot: [-0.22, 0.14, 0.56],
    rHip: [0.12, 0.90, -0.04],
    rKnee: [0.16, 0.48, 0.18],
    rFoot: [0.20, 0.10, 0.46],
  });
}

export function createKneelingPose() {
  return createPose({
    pelvis: [0, 0.58, -0.04],
    chest: [0, 0.98, 0.02],
    neck: [0, 1.16, 0.08],
    head: [0, 1.30, 0.18],
    lShoulder: [-0.19, 1.11, 0.04],
    lElbow: [-0.26, 0.80, 0.14],
    lHand: [-0.24, 0.50, 0.26],
    rShoulder: [0.19, 1.11, 0.04],
    rElbow: [0.28, 0.82, 0.16],
    rHand: [0.26, 0.52, 0.34],
    lHip: [-0.12, 0.56, -0.02],
    lKnee: [-0.16, 0.18, 0.34],
    lFoot: [-0.18, 0.05, -0.06],
    rHip: [0.12, 0.56, -0.02],
    rKnee: [0.18, 0.44, 0.36],
    rFoot: [0.20, 0.05, 0.44],
  });
}

export const POSE_LIBRARY = {
  standing: createStandingPose,
  falling: createFallingPose,
  running: createRunningPose,
  attack: createAttackPose,
  floating: createFloatingPose,
  defensive: createDefensivePose,
  reaching: createReachingPose,
  struck: createStruckPose,
  kneeling: createKneelingPose,
};

const TMP_A = vec3.create();
const TMP_B = vec3.create();
const TMP_DIR = vec3.create();
const TMP_Q = quat.create();
const TMP_ROT = quat.create();

let characterSerial = 0;

export class Humanoid {
  constructor(options = {}) {
    this.id = characterSerial++;
    this.seed = options.seed !== undefined ? options.seed : this.id * 37 + 11;
    this.position = vec3.create(0, 0, 0);
    this.rotation = quat.create();
    this.scale = options.scale !== undefined ? options.scale : 1;
    this.build = options.build !== undefined ? options.build : 1;
    this.boneRadius = options.boneRadius !== undefined ? options.boneRadius : 0.062;

    this.pose = createStandingPose();
    this.workPose = createPose();
    this.worldJoints = new Float32Array(JOINT_COUNT * 3);

    this.kind = options.kind !== undefined ? options.kind : CINE_KIND.SILHOUETTE;
    this.albedo = options.albedo || [0.03, 0.035, 0.055];
    this.emissive = options.emissive || [0.35, 0.62, 1.0];
    this.glow = options.glow !== undefined ? options.glow : 1.0;
    this.opacity = options.opacity !== undefined ? options.opacity : 1;
    this.dissolve = 0;
    this.rimSharpness = options.rimSharpness !== undefined ? options.rimSharpness : 0.5;

    this.hair = options.hair !== undefined ? options.hair : true;
    this.hairStrands = options.hairStrands !== undefined ? options.hairStrands : 7;
    this.cloak = options.cloak || false;
    this.weapon = options.weapon || null;
    this.weaponHand = options.weaponHand || 'rHand';
    this.weaponColor = options.weaponColor || [0.8, 0.92, 1.0];
    this.weaponLength = options.weaponLength !== undefined ? options.weaponLength : 1.15;

    this.visible = true;
    this.phase = Math.random() * TAU;
  }

  setPosition(x, y, z) {
    vec3.set(this.position, x, y, z);
    return this;
  }

  setRotationEuler(pitch, yaw, roll) {
    quat.fromEuler(this.rotation, pitch, yaw, roll);
    return this;
  }

  setPose(pose) {
    this.pose.set(pose);
    return this;
  }

  blendTo(pose, t) {
    const f = clamp(t, 0, 1);
    for (let i = 0; i < POSE_LEN; i++) {
      this.pose[i] = this.pose[i] + (pose[i] - this.pose[i]) * f;
    }
    return this;
  }

  static mix(out, a, b, t) {
    const f = clamp(t, 0, 1);
    for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * f;
    return out;
  }

  joint(name, out) {
    const i = JOINT_INDEX[name] * 3;
    const dest = out || vec3.create();
    dest[0] = this.worldJoints[i];
    dest[1] = this.worldJoints[i + 1];
    dest[2] = this.worldJoints[i + 2];
    return dest;
  }

  resolve(time) {
    const s = this.scale;
    const breathe = Math.sin(time * 1.35 + this.phase) * 0.008;
    for (let i = 0; i < JOINT_COUNT; i++) {
      TMP_A[0] = this.pose[i * 3] * s;
      TMP_A[1] = (this.pose[i * 3 + 1] + (i > 0 ? breathe : 0)) * s;
      TMP_A[2] = this.pose[i * 3 + 2] * s;
      quat.rotateVec3(TMP_B, this.rotation, TMP_A);
      this.worldJoints[i * 3] = this.position[0] + TMP_B[0];
      this.worldJoints[i * 3 + 1] = this.position[1] + TMP_B[1];
      this.worldJoints[i * 3 + 2] = this.position[2] + TMP_B[2];
    }
    return this;
  }

  emitBone(prims, ax, ay, az, bx, by, bz, radius) {
    TMP_DIR[0] = bx - ax;
    TMP_DIR[1] = by - ay;
    TMP_DIR[2] = bz - az;
    const length = Math.hypot(TMP_DIR[0], TMP_DIR[1], TMP_DIR[2]);
    if (length < 1e-5) return;

    quat.fromUnitY(TMP_Q, TMP_DIR);
    prims.add('capsule', {
      position: [(ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5],
      rotation: TMP_Q,
      scale: [radius, length * 0.5 + radius * 0.35, radius],
      kind: this.kind,
      albedo: this.albedo,
      emissive: this.emissive,
      metallic: 0.05,
      roughness: 0.55,
      glow: this.glow,
      dissolve: this.dissolve,
      opacity: this.opacity,
      pattern: this.rimSharpness,
      seed: this.seed,
    });
  }

  emit(prims, time) {
    if (!this.visible) return;
    this.resolve(time);
    const wj = this.worldJoints;
    const r = this.boneRadius * this.scale * this.build;

    for (const [from, to, scale] of BONES) {
      const a = JOINT_INDEX[from] * 3;
      const b = JOINT_INDEX[to] * 3;
      this.emitBone(prims, wj[a], wj[a + 1], wj[a + 2], wj[b], wj[b + 1], wj[b + 2], r * scale);
    }

    const h = JOINT_INDEX.head * 3;
    const headR = 0.125 * this.scale * this.build;
    prims.add('sphere', {
      position: [wj[h], wj[h + 1] + headR * 0.35, wj[h + 2]],
      rotation: this.rotation,
      scale: [headR * 0.92, headR * 1.10, headR * 0.98],
      kind: this.kind,
      albedo: this.albedo,
      emissive: this.emissive,
      metallic: 0.05,
      roughness: 0.55,
      glow: this.glow,
      dissolve: this.dissolve,
      opacity: this.opacity,
      pattern: this.rimSharpness,
      seed: this.seed + 3,
    });

    if (this.hair) this.emitHair(prims, time, headR);
    if (this.cloak) this.emitCloak(prims, time);
    if (this.weapon) this.emitWeapon(prims, time);
  }

  emitHair(prims, time, headR) {
    const h = JOINT_INDEX.head * 3;
    const wj = this.worldJoints;
    const count = this.hairStrands;
    for (let i = 0; i < count; i++) {
      const f = i / count;
      const a = f * TAU + this.seed * 0.7;
      const sway = turbulence(time * 0.9 + i * 3.7 + this.seed, 2);
      const lift = 0.55 + 0.45 * Math.sin(i * 2.3 + this.seed);
      TMP_DIR[0] = Math.cos(a) * 0.85 + sway * 0.28;
      TMP_DIR[1] = lift + 0.35;
      TMP_DIR[2] = Math.sin(a) * 0.85 - sway * 0.20;
      quat.rotateVec3(TMP_A, this.rotation, TMP_DIR);
      vec3.normalize(TMP_A, TMP_A);
      const len = headR * (1.5 + 1.5 * ((i * 37 % 11) / 11));
      quat.fromUnitY(TMP_Q, TMP_A);
      prims.add('cone', {
        position: [
          wj[h] + TMP_A[0] * len * 0.5,
          wj[h + 1] + headR * 0.5 + TMP_A[1] * len * 0.5,
          wj[h + 2] + TMP_A[2] * len * 0.5,
        ],
        rotation: TMP_Q,
        scale: [headR * 0.38, len * 0.5, headR * 0.38],
        kind: this.kind,
        albedo: this.albedo,
        emissive: this.emissive,
        metallic: 0.05,
        roughness: 0.6,
        glow: this.glow * 0.85,
        dissolve: this.dissolve,
        opacity: this.opacity,
        pattern: this.rimSharpness,
        seed: this.seed + 17 + i,
      });
    }
  }

  emitCloak(prims, time) {
    const c = JOINT_INDEX.chest * 3;
    const p = JOINT_INDEX.pelvis * 3;
    const wj = this.worldJoints;
    for (let i = 0; i < 3; i++) {
      const f = i / 2;
      const sway = turbulence(time * 1.1 + i * 2.1 + this.seed, 3);
      TMP_DIR[0] = 0;
      TMP_DIR[1] = -0.4;
      TMP_DIR[2] = -0.55 - f * 0.35;
      quat.rotateVec3(TMP_A, this.rotation, TMP_DIR);
      const w = (0.19 + f * 0.10) * this.scale;
      const hh = (0.30 + f * 0.15) * this.scale;
      quat.fromEuler(TMP_Q, -0.45 - f * 0.35 + sway * 0.18, 0, sway * 0.22);
      quat.multiply(TMP_ROT, this.rotation, TMP_Q);
      prims.add('quad', {
        position: [
          (wj[c] + wj[p]) * 0.5 + TMP_A[0] * 0.35,
          (wj[c + 1] + wj[p + 1]) * 0.5 + TMP_A[1] * 0.55,
          (wj[c + 2] + wj[p + 2]) * 0.5 + TMP_A[2] * 0.35,
        ],
        rotation: TMP_ROT,
        scale: [w, hh, 1],
        kind: this.kind,
        albedo: this.albedo,
        emissive: this.emissive,
        metallic: 0.02,
        roughness: 0.8,
        glow: this.glow * (0.34 - f * 0.09),
        dissolve: this.dissolve,
        opacity: this.opacity,
        pattern: this.rimSharpness * 0.7,
        seed: this.seed + 41 + i,
      });
    }
  }

  emitWeapon(prims, time) {
    const hand = JOINT_INDEX[this.weaponHand] * 3;
    const elbow = JOINT_INDEX[this.weaponHand === 'rHand' ? 'rElbow' : 'lElbow'] * 3;
    const wj = this.worldJoints;

    TMP_DIR[0] = wj[hand] - wj[elbow];
    TMP_DIR[1] = wj[hand + 1] - wj[elbow + 1];
    TMP_DIR[2] = wj[hand + 2] - wj[elbow + 2];
    vec3.normalize(TMP_DIR, TMP_DIR);
    quat.fromUnitY(TMP_Q, TMP_DIR);

    const L = this.weaponLength * this.scale;
    const base = [wj[hand], wj[hand + 1], wj[hand + 2]];
    const tip = [
      base[0] + TMP_DIR[0] * L,
      base[1] + TMP_DIR[1] * L,
      base[2] + TMP_DIR[2] * L,
    ];

    prims.add('box', {
      position: [(base[0] + tip[0]) * 0.5, (base[1] + tip[1]) * 0.5, (base[2] + tip[2]) * 0.5],
      rotation: TMP_Q,
      scale: [0.026 * this.scale, L * 0.5, 0.048 * this.scale],
      kind: CINE_KIND.BLADE,
      albedo: [0.55, 0.60, 0.72],
      emissive: this.weaponColor,
      metallic: 0.9,
      roughness: 0.14,
      glow: this.glow,
      opacity: this.opacity,
      dissolve: this.dissolve,
      seed: this.seed + 71,
    });

    prims.add('torus', {
      position: [
        base[0] + TMP_DIR[0] * L * 0.16,
        base[1] + TMP_DIR[1] * L * 0.16,
        base[2] + TMP_DIR[2] * L * 0.16,
      ],
      rotation: TMP_Q,
      scale: [0.10 * this.scale, 0.10 * this.scale, 0.10 * this.scale],
      kind: CINE_KIND.BLADE,
      albedo: [0.6, 0.55, 0.4],
      emissive: this.weaponColor,
      metallic: 0.85,
      roughness: 0.2,
      glow: this.glow * 1.2,
      opacity: this.opacity,
      dissolve: this.dissolve,
      seed: this.seed + 73,
    });

    for (let i = 0; i < 2; i++) {
      const off = 0.055 * this.scale * (i === 0 ? 1 : -0.55);
      prims.add('box', {
        position: [
          tip[0] - TMP_DIR[0] * 0.08 * this.scale + off,
          tip[1] - TMP_DIR[1] * 0.08 * this.scale,
          tip[2] - TMP_DIR[2] * 0.08 * this.scale,
        ],
        rotation: TMP_Q,
        scale: [0.05 * this.scale, 0.06 * this.scale, 0.02 * this.scale],
        kind: CINE_KIND.BLADE,
        albedo: [0.6, 0.58, 0.5],
        emissive: this.weaponColor,
        metallic: 0.88,
        roughness: 0.18,
        glow: this.glow,
        opacity: this.opacity,
        dissolve: this.dissolve,
        seed: this.seed + 79 + i,
      });
    }

    this.weaponTip = tip;
    this.weaponBase = base;
    void time;
  }
}

const POSE_A = createPose();
const POSE_B = createPose();

export const Animate = {
  idle(character, time, amount = 1) {
    const base = STANDING;
    const sway = Math.sin(time * 0.9 + character.phase) * 0.02 * amount;
    const bob = Math.sin(time * 1.7 + character.phase) * 0.012 * amount;
    character.pose.set(base);
    character.pose[JOINT_INDEX.chest * 3] += sway;
    character.pose[JOINT_INDEX.head * 3] += sway * 1.4;
    character.pose[JOINT_INDEX.pelvis * 3 + 1] += bob;
    character.pose[JOINT_INDEX.chest * 3 + 1] += bob;
    character.pose[JOINT_INDEX.head * 3 + 1] += bob;
  },

  float(character, time, amount = 1) {
    character.pose.set(FLOATING);
    const t = time * 0.7 + character.phase;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const drift = turbulence(t + i * 0.9, 2) * 0.028 * amount;
      character.pose[i * 3] += drift;
      character.pose[i * 3 + 1] += turbulence(t * 0.8 + i * 1.7, 2) * 0.020 * amount;
      character.pose[i * 3 + 2] += turbulence(t * 0.6 + i * 2.3, 2) * 0.024 * amount;
    }
  },

  fall(character, time, amount = 1) {
    character.pose.set(FALLING);
    const t = time * 1.15 + character.phase;
    for (let i = 0; i < JOINT_COUNT; i++) {
      character.pose[i * 3] += turbulence(t + i * 1.3, 2) * 0.045 * amount;
      character.pose[i * 3 + 1] += turbulence(t * 0.9 + i * 2.1, 2) * 0.030 * amount;
      character.pose[i * 3 + 2] += turbulence(t * 1.1 + i * 0.7, 2) * 0.040 * amount;
    }
  },

  run(character, time, rate = 8.5) {
    createRunningPose(time * rate + character.phase, character.pose);
  },

  strike(character, progress) {
    const p = clamp(progress, 0, 1);
    if (p < 0.32) {
      Humanoid.mix(character.pose, DEFENSIVE, ATTACK, Ease.inQuad(p / 0.32) * 0.35);
    } else if (p < 0.48) {
      Humanoid.mix(character.pose, DEFENSIVE, ATTACK, 0.35 + Ease.outExpo((p - 0.32) / 0.16) * 0.65);
    } else {
      Humanoid.mix(character.pose, ATTACK, STANDING, Ease.outCubic((p - 0.48) / 0.52) * 0.75);
    }
  },

  recoil(character, progress) {
    const p = clamp(progress, 0, 1);
    if (p < 0.25) {
      Humanoid.mix(character.pose, STANDING, STRUCK, Ease.outExpo(p / 0.25));
    } else {
      Humanoid.mix(character.pose, STRUCK, KNEELING, Ease.inOutCubic((p - 0.25) / 0.75));
    }
  },

  reach(character, time, amount = 1) {
    Humanoid.mix(character.pose, STANDING, REACHING, clamp(amount, 0, 1));
    const t = time * 0.8 + character.phase;
    character.pose[JOINT_INDEX.lHand * 3 + 1] += turbulence(t, 2) * 0.03 * amount;
    character.pose[JOINT_INDEX.rHand * 3 + 1] += turbulence(t + 7.3, 2) * 0.03 * amount;
  },

  blend(character, nameA, nameB, t, phase = 0) {
    if (nameA === 'running') createRunningPose(phase, POSE_A);
    else POSE_A.set(POSE_CACHE[nameA]);
    if (nameB === 'running') createRunningPose(phase, POSE_B);
    else POSE_B.set(POSE_CACHE[nameB]);
    Humanoid.mix(character.pose, POSE_A, POSE_B, t);
  },
};

const STANDING = createStandingPose();
const FALLING = createFallingPose();
const FLOATING = createFloatingPose();
const ATTACK = createAttackPose();
const DEFENSIVE = createDefensivePose();
const REACHING = createReachingPose();
const STRUCK = createStruckPose();
const KNEELING = createKneelingPose();

export const POSES = {
  STANDING, FALLING, FLOATING, ATTACK, DEFENSIVE, REACHING, STRUCK, KNEELING,
};

const POSE_CACHE = {
  standing: STANDING,
  falling: FALLING,
  floating: FLOATING,
  attack: ATTACK,
  defensive: DEFENSIVE,
  reaching: REACHING,
  struck: STRUCK,
  kneeling: KNEELING,
  running: STANDING,
};

export { lerp };
