import { vec3, quat, clamp, lerp, TAU, Ease, turbulence } from '../core/math.js';
import { rand1, rand2 } from '../city/rng.js';
import { Humanoid, Animate, POSES, createRunningPose } from './characters.js';
import { CINE_KIND } from '../shaders/cinematic.js';

export const PALETTE = {
  hero: {
    albedo: [0.035, 0.042, 0.062],
    emissive: [0.48, 0.74, 1.00],
  },
  rival: {
    albedo: [0.045, 0.030, 0.038],
    emissive: [1.00, 0.42, 0.30],
  },
  light: {
    albedo: [0.10, 0.11, 0.14],
    emissive: [1.00, 0.94, 0.78],
  },
  shadow: {
    albedo: [0.010, 0.012, 0.020],
    emissive: [0.28, 0.20, 0.62],
  },
  chorus: {
    albedo: [0.025, 0.030, 0.048],
    emissive: [0.36, 0.56, 0.92],
  },
};

export class Cast {
  constructor(capacity = 48) {
    this.pool = [];
    for (let i = 0; i < capacity; i++) {
      this.pool.push(new Humanoid({ seed: i * 97 + 13 }));
    }
    this.used = 0;
  }

  reset() {
    this.used = 0;
  }

  take(style = 'chorus', options = {}) {
    if (this.used >= this.pool.length) return null;
    const c = this.pool[this.used++];
    const p = PALETTE[style] || PALETTE.chorus;
    c.albedo = options.albedo || p.albedo;
    c.emissive = options.emissive || p.emissive;
    c.kind = options.kind !== undefined ? options.kind : CINE_KIND.SILHOUETTE;
    c.glow = options.glow !== undefined ? options.glow : 1.0;
    c.opacity = options.opacity !== undefined ? options.opacity : 1;
    c.dissolve = options.dissolve || 0;
    c.scale = options.scale !== undefined ? options.scale : 1;
    c.build = options.build !== undefined ? options.build : 1;
    c.hair = options.hair !== undefined ? options.hair : true;
    c.hairStrands = options.hairStrands !== undefined ? options.hairStrands : 7;
    c.cloak = options.cloak !== undefined ? options.cloak : false;
    c.weapon = options.weapon !== undefined ? options.weapon : null;
    c.weaponColor = options.weaponColor || [0.82, 0.93, 1.0];
    c.weaponLength = options.weaponLength !== undefined ? options.weaponLength : 1.15;
    c.rimSharpness = options.rimSharpness !== undefined ? options.rimSharpness : 0.5;
    c.visible = true;
    c.pose.set(POSES.STANDING);
    quat.identity(c.rotation);
    vec3.set(c.position, 0, 0, 0);
    return c;
  }
}

export const Formation = {
  line(out, i, count, spec) {
    const f = count > 1 ? i / (count - 1) - 0.5 : 0;
    out[0] = spec.centre[0] + f * spec.width;
    out[1] = spec.centre[1];
    out[2] = spec.centre[2] + (spec.depth ? (rand1(i * 31 + spec.seed) - 0.5) * spec.depth : 0);
    return out;
  },

  arc(out, i, count, spec) {
    const f = count > 1 ? i / (count - 1) : 0.5;
    const a = lerp(spec.from, spec.to, f);
    out[0] = spec.centre[0] + Math.cos(a) * spec.radius;
    out[1] = spec.centre[1];
    out[2] = spec.centre[2] + Math.sin(a) * spec.radius;
    return out;
  },

  ring(out, i, count, spec) {
    const a = (i / count) * TAU + (spec.rotation || 0);
    out[0] = spec.centre[0] + Math.cos(a) * spec.radius;
    out[1] = spec.centre[1];
    out[2] = spec.centre[2] + Math.sin(a) * spec.radius;
    return out;
  },

  scatter(out, i, count, spec) {
    const s = spec.seed || 0;
    const a = rand2(i * 7 + s, 11) * TAU;
    const r = Math.sqrt(rand2(i * 13 + s, 17)) * spec.radius;
    out[0] = spec.centre[0] + Math.cos(a) * r;
    out[1] = spec.centre[1] + (spec.spread ? (rand2(i * 19 + s, 23) - 0.5) * spec.spread : 0);
    out[2] = spec.centre[2] + Math.sin(a) * r;
    void count;
    return out;
  },

  ranks(out, i, count, spec) {
    const perRow = spec.perRow || 8;
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const jitter = rand2(i * 29 + (spec.seed || 0), 31) - 0.5;
    out[0] = spec.centre[0] + (col - (perRow - 1) * 0.5) * spec.spacing + jitter * spec.spacing * 0.3;
    out[1] = spec.centre[1];
    out[2] = spec.centre[2] - row * spec.rowDepth + jitter * spec.rowDepth * 0.2;
    void count;
    return out;
  },
};

const TMP = vec3.create();

export const Behaviour = {

  falling(character, time, spec) {
    Animate.fall(character, time, spec.looseness !== undefined ? spec.looseness : 1);
    const spin = spec.spin !== undefined ? spec.spin : 0.34;
    const tumble = spec.tumble !== undefined ? spec.tumble : 0.22;
    quat.fromEuler(character.rotation,
      (spec.pitch !== undefined ? spec.pitch : -1.35) + Math.sin(time * tumble) * 0.28,
      time * spin + (spec.yaw || 0),
      Math.sin(time * tumble * 0.7 + 1.3) * 0.24 + (spec.roll || 0));
  },

  drifting(character, time, spec) {
    Animate.float(character, time, spec.looseness !== undefined ? spec.looseness : 1);
    quat.fromEuler(character.rotation,
      Math.sin(time * 0.31 + character.phase) * 0.10,
      (spec.yaw || 0) + Math.sin(time * 0.19 + character.phase) * 0.24,
      Math.sin(time * 0.23 + character.phase) * 0.07);
  },

  standing(character, time, spec) {
    Animate.idle(character, time, spec.life !== undefined ? spec.life : 1);
    quat.fromEuler(character.rotation, 0, spec.yaw || 0, 0);
  },

  running(character, time, spec) {
    Animate.run(character, time, spec.rate !== undefined ? spec.rate : 9.0);
    quat.fromEuler(character.rotation,
      0.08,
      spec.yaw || 0,
      Math.sin(time * (spec.rate || 9.0) * 0.5) * 0.05);
  },

  attacking(character, progress, spec) {
    Animate.strike(character, progress);
    const lunge = Ease.outExpo(clamp((progress - 0.32) / 0.2, 0, 1)) * (spec.lunge || 0);
    quat.fromEuler(character.rotation,
      -0.10 - Ease.punch(progress) * 0.18,
      spec.yaw || 0,
      Ease.punch(progress) * 0.24);
    if (spec.origin) {
      const dirX = Math.sin(spec.yaw || 0);
      const dirZ = Math.cos(spec.yaw || 0);
      character.position[0] = spec.origin[0] + dirX * lunge;
      character.position[1] = spec.origin[1];
      character.position[2] = spec.origin[2] + dirZ * lunge;
    }
  },

  struck(character, progress, spec) {
    Animate.recoil(character, progress);
    const push = Ease.outExpo(clamp(progress / 0.3, 0, 1)) * (spec.knockback || 0);
    quat.fromEuler(character.rotation,
      0.12 + Ease.punch(progress) * 0.3,
      spec.yaw || 0,
      -Ease.punch(progress) * 0.22);
    if (spec.origin) {
      const dirX = Math.sin((spec.yaw || 0) + Math.PI);
      const dirZ = Math.cos((spec.yaw || 0) + Math.PI);
      character.position[0] = spec.origin[0] + dirX * push;
      character.position[1] = spec.origin[1];
      character.position[2] = spec.origin[2] + dirZ * push;
    }
  },

  reaching(character, time, spec) {
    Animate.reach(character, time, spec.amount !== undefined ? spec.amount : 1);
    quat.fromEuler(character.rotation,
      -(spec.lookUp || 0.12),
      spec.yaw || 0,
      Math.sin(time * 0.4 + character.phase) * 0.04);
  },

  kneeling(character, time, spec) {
    character.pose.set(POSES.KNEELING);
    const breathe = Math.sin(time * 1.1 + character.phase) * 0.012;
    character.pose[1] += breathe;
    quat.fromEuler(character.rotation, 0, spec.yaw || 0, 0);
  },

  chorus(character, time, index, spec) {
    const seed = index * 7.31;
    const mode = rand1(index * 17 + (spec.seed || 0));
    if (mode < 0.34) {
      Animate.idle(character, time + seed, 1);
    } else if (mode < 0.62) {
      Animate.blend(character, 'standing', 'defensive', 0.4 + Math.sin(time * 0.6 + seed) * 0.18);
    } else if (mode < 0.85) {
      Animate.blend(character, 'standing', 'reaching', 0.25 + Math.sin(time * 0.4 + seed) * 0.2);
    } else {
      Animate.blend(character, 'standing', 'attack', 0.3 + Math.sin(time * 0.8 + seed) * 0.25);
    }
    quat.fromEuler(character.rotation,
      0,
      (spec.yaw || 0) + (rand1(index * 23 + 5) - 0.5) * (spec.yawSpread || 0.5),
      0);
  },
};

export const MONTAGE_ACTIONS = {
  CHARGE: 'charge',
  CLASH: 'clash',
  DODGE: 'dodge',
  LEAP: 'leap',
  STANDOFF: 'standoff',
  SWARM: 'swarm',
  FALL: 'fall',
  STRIKE_DOWN: 'strikeDown',
  BACK_TO_BACK: 'backToBack',
  RISE: 'rise',
};

export function duel(cast, spec, time, progress) {
  const a = cast.take(spec.heroStyle || 'hero', {
    weapon: spec.heroWeapon !== undefined ? spec.heroWeapon : 'key',
    weaponColor: spec.heroWeaponColor || [0.80, 0.92, 1.0],
    scale: spec.scale || 1,
    glow: spec.glow !== undefined ? spec.glow : 1.2,
  });
  const b = cast.take(spec.rivalStyle || 'rival', {
    weapon: spec.rivalWeapon !== undefined ? spec.rivalWeapon : 'key',
    weaponColor: spec.rivalWeaponColor || [1.0, 0.46, 0.28],
    scale: spec.scale || 1,
    glow: spec.glow !== undefined ? spec.glow : 1.2,
  });
  if (!a || !b) return null;

  const sep = spec.separation !== undefined ? spec.separation : 2.6;
  const yaw = spec.yaw || 0;
  const dirX = Math.sin(yaw);
  const dirZ = Math.cos(yaw);

  const originA = [
    spec.centre[0] - dirX * sep * 0.5,
    spec.centre[1],
    spec.centre[2] - dirZ * sep * 0.5,
  ];
  const originB = [
    spec.centre[0] + dirX * sep * 0.5,
    spec.centre[1],
    spec.centre[2] + dirZ * sep * 0.5,
  ];

  Behaviour.attacking(a, progress, { yaw, lunge: spec.lunge !== undefined ? spec.lunge : 1.1, origin: originA });
  if (spec.rivalStruck) {
    Behaviour.struck(b, clamp((progress - 0.42) / 0.58, 0, 1),
      { yaw: yaw + Math.PI, knockback: spec.knockback !== undefined ? spec.knockback : 1.6, origin: originB });
  } else {
    Behaviour.attacking(b, progress, { yaw: yaw + Math.PI, lunge: spec.lunge !== undefined ? spec.lunge : 1.1, origin: originB });
  }

  a.emitPending = true;
  b.emitPending = true;
  void time;
  return { a, b, originA, originB };
}

export function clashPoint(out, pair) {
  if (!pair) return null;
  const a = pair.a.weaponTip || pair.a.position;
  const b = pair.b.weaponTip || pair.b.position;
  out[0] = (a[0] + b[0]) * 0.5;
  out[1] = (a[1] + b[1]) * 0.5;
  out[2] = (a[2] + b[2]) * 0.5;
  return out;
}

export function emitHorde(cast, prims, time, spec) {
  const count = spec.count || 18;
  for (let i = 0; i < count; i++) {
    const c = cast.take(spec.style || 'shadow', {
      scale: lerp(0.85, 1.25, rand1(i * 37 + (spec.seed || 0))),
      glow: spec.glow !== undefined ? spec.glow : 0.8,
      hair: rand1(i * 11) > 0.4,
      hairStrands: 5,
      cloak: rand1(i * 13) > 0.6,
      weapon: rand1(i * 17) > 0.65 ? 'blade' : null,
      weaponColor: spec.weaponColor || [0.9, 0.35, 0.28],
    });
    if (!c) break;
    Formation.ranks(TMP, i, count, {
      centre: spec.centre,
      spacing: spec.spacing || 2.4,
      rowDepth: spec.rowDepth || 3.0,
      perRow: spec.perRow || 6,
      seed: spec.seed || 0,
    });
    const bob = Math.sin(time * 2.2 + i * 1.7) * 0.08;
    c.setPosition(TMP[0], TMP[1] + bob + (spec.advance || 0) * time, TMP[2] + (spec.advance || 0) * time * -3.0);
    Behaviour.chorus(c, time, i, { yaw: spec.yaw || 0, yawSpread: 0.35, seed: spec.seed || 0 });
    c.emit(prims, time);
  }
}

export function emitCircle(cast, prims, time, spec) {
  const count = spec.count || 12;
  for (let i = 0; i < count; i++) {
    const c = cast.take(spec.style || 'chorus', {
      scale: spec.scale || 1,
      glow: spec.glow !== undefined ? spec.glow : 1.0,
      cloak: i % 3 === 0,
      weapon: i % 2 === 0 ? 'blade' : null,
      weaponColor: spec.weaponColor,
    });
    if (!c) break;
    const a = (i / count) * TAU + (spec.rotation || 0);
    const r = spec.radius || 14;
    const y = spec.centre[1] + (spec.lift ? Math.sin(time * 0.7 + i) * spec.lift : 0);
    c.setPosition(
      spec.centre[0] + Math.cos(a) * r,
      y,
      spec.centre[2] + Math.sin(a) * r);
    Behaviour.chorus(c, time, i, { yaw: -a + Math.PI * 0.5, yawSpread: 0.12, seed: spec.seed || 0 });
    c.emit(prims, time);
  }
}

export { turbulence, Ease, createRunningPose };
