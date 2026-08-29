import { clamp, lerp, easeByName, Ease } from '../core/math.js';

export const TRANSITION = {
  CROSSFADE: 'crossfade',
  RADIAL_WIPE: 'radialWipe',
  IRIS: 'iris',
  SWEEP: 'sweep',
  PARTICLE_DISSOLVE: 'particleDissolve',
  BARS: 'bars',
  BLOOM_OUT: 'bloomOut',
  FADE: 'fade',
  FLASH: 'flash',
  SHATTER: 'shatter',
  DARKNESS: 'darkness',
};

const SHADER_MODE = {
  crossfade: 0,
  radialWipe: 1,
  iris: 2,
  sweep: 3,
  particleDissolve: 4,
  bars: 5,
  bloomOut: 6,
};

const HOLD_LEAD = 0.7;

export class TransitionDeck {
  constructor() {
    this.entries = [];
  }

  add(spec) {
    const entry = {
      at: spec.at,
      type: spec.type,
      duration: spec.duration !== undefined ? spec.duration : 0.6,
      ease: spec.ease || 'inOutCubic',
      centre: spec.centre || [0.5, 0.5],
      color: spec.color || [1, 1, 1],
      softness: spec.softness !== undefined ? spec.softness : 0.10,
      angle: spec.angle || 0,
      strength: spec.strength !== undefined ? spec.strength : 1,

      hold: spec.hold || 0,
      out: spec.out !== undefined ? spec.out : false,

      spread: spec.spread !== undefined ? spec.spread : 1.15,
      spin: spec.spin !== undefined ? spec.spin : 3.6,
      approach: spec.approach !== undefined ? spec.approach : 0.62,
      edge: spec.edge !== undefined ? spec.edge : 0.35,
      refraction: spec.refraction !== undefined ? spec.refraction : 0.035,
    };
    entry.end = entry.at + entry.duration + entry.hold;
    this.entries.push(entry);
    this.entries.sort((a, b) => a.at - b.at);
    return entry;
  }

  crossfade(at, duration = 0.8) {
    return this.add({ at, duration, type: TRANSITION.CROSSFADE });
  }

  flash(at, opts = {}) {
    return this.add(Object.assign({ at, type: TRANSITION.FLASH, duration: 0.55 }, opts));
  }

  shatter(at, opts = {}) {
    return this.add(Object.assign({ at, type: TRANSITION.SHATTER, duration: 1.8 }, opts));
  }

  fadeTo(at, duration, color = [0, 0, 0], hold = 0) {
    return this.add({ at, duration, type: TRANSITION.FADE, color, hold, out: false });
  }

  fadeFrom(at, duration, color = [0, 0, 0]) {
    return this.add({ at, duration, type: TRANSITION.FADE, color, out: true });
  }

  apply(post, env, t) {
    post.transitionMode = -1;
    post.transitionProgress = 0;
    post.shatter = 0;
    post.captureHold = false;

    let fade = 0;
    let fadeColor = null;
    let flash = 0;
    let flashColor = null;

    for (const e of this.entries) {

      if (t >= e.at - HOLD_LEAD && t < e.at) {
        if (e.type !== TRANSITION.FADE && e.type !== TRANSITION.FLASH) post.captureHold = true;
      }

      if (t < e.at || t > e.end) continue;
      const raw = e.duration > 0 ? clamp((t - e.at) / e.duration, 0, 1) : 1;

      if (e.type === TRANSITION.FADE) {
        const p = easeByName(e.ease)(raw);
        const value = e.out ? 1 - p : p;
        if (value > fade) {
          fade = value;
          fadeColor = e.color;
        }
        continue;
      }

      if (e.type === TRANSITION.FLASH) {

        const value = Ease.impact(raw) * e.strength;
        if (value > flash) {
          flash = value;
          flashColor = e.color;
        }
        continue;
      }

      if (e.type === TRANSITION.DARKNESS) {
        const value = Math.sin(raw * Math.PI) * e.strength;
        if (value > fade) {
          fade = value;
          fadeColor = e.color;
        }
        continue;
      }

      if (e.type === TRANSITION.SHATTER) {
        post.shatter = Math.max(post.shatter, easeByName(e.ease === 'inOutCubic' ? 'outQuad' : e.ease)(raw));
        post.shatterCentre = e.centre;
        post.shatterSpread = e.spread;
        post.shatterSpin = e.spin;
        post.shatterApproach = e.approach;
        post.shatterEdge = e.edge;
        post.shatterEdgeColor = e.color;
        post.shatterRefraction = e.refraction;

        const pop = Ease.impact(clamp(raw / 0.18, 0, 1)) * e.strength * 0.9;
        if (pop > flash) {
          flash = pop;
          flashColor = e.color;
        }
        continue;
      }

      const mode = SHADER_MODE[e.type];
      if (mode === undefined) continue;
      post.transitionMode = mode;
      post.transitionProgress = easeByName(e.ease)(raw);
      post.transitionCentre = e.centre;
      post.transitionColor = e.color;
      post.transitionSoftness = e.softness;
      post.transitionAngle = e.angle;
    }

    if (fadeColor) {
      post.fade = Math.max(post.fade, fade);
      post.fadeColor = fadeColor;
    }
    if (flashColor) {
      post.flash += flash * 2.4;
      post.flashColor = flashColor;
      if (env) {
        env.skyFlash = Math.max(env.skyFlash, flash * 0.9);
        env.flashColor = flashColor;
      }
    }
  }

  covering(t) {
    for (const e of this.entries) {
      if (t < e.at || t > e.end) continue;
      if (e.type === TRANSITION.SHATTER) return true;
      if (SHADER_MODE[e.type] !== undefined) return true;
    }
    return false;
  }
}

export function letterboxAt(t, duration, openAt = 1.6, closeAt = 4.0) {
  const open = 1 - Ease.outCubic(clamp(t / openAt, 0, 1));
  const close = Ease.inCubic(clamp((t - (duration - closeAt)) / closeAt, 0, 1));
  return lerp(0.34, 0.14, 1 - open) + close * 0.20;
}

export { Ease };
