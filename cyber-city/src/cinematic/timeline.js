import { clamp, lerp, easeByName, Ease } from '../core/math.js';

export class Track {
  constructor(name, options = {}) {
    this.name = name;
    this.keys = [];
    this.defaultEase = options.ease || 'inOutCubic';
    this.vector = options.vector || 0;
    this.cursor = 0;
  }

  key(time, value, ease) {
    this.keys.push({ time, value, ease: ease || this.defaultEase });
    this.keys.sort((a, b) => a.time - b.time);
    return this;
  }

  hold(time, value) {
    return this.key(time, value, 'step');
  }

  evaluate(t, out) {
    const keys = this.keys;
    const n = keys.length;
    if (n === 0) return this.vector ? out : 0;
    if (t <= keys[0].time) return this.copy(keys[0].value, out);
    if (t >= keys[n - 1].time) return this.copy(keys[n - 1].value, out);

    let i = this.cursor;
    if (i >= n - 1 || keys[i].time > t) i = 0;
    while (i < n - 2 && keys[i + 1].time <= t) i++;
    this.cursor = i;

    const a = keys[i];
    const b = keys[i + 1];
    const span = b.time - a.time;
    const raw = span > 1e-6 ? (t - a.time) / span : 1;
    if (b.ease === 'step') return this.copy(a.value, out);
    const f = easeByName(b.ease)(clamp(raw, 0, 1));

    if (this.vector) {
      const dest = out || new Array(this.vector);
      for (let k = 0; k < this.vector; k++) dest[k] = lerp(a.value[k], b.value[k], f);
      return dest;
    }
    return lerp(a.value, b.value, f);
  }

  copy(value, out) {
    if (!this.vector) return value;
    const dest = out || new Array(this.vector);
    for (let k = 0; k < this.vector; k++) dest[k] = value[k];
    return dest;
  }
}

export class Timeline {
  constructor(duration) {
    this.duration = duration;
    this.time = 0;
    this.lastTime = 0;
    this.sequences = [];
    this.tracks = new Map();
    this.cues = [];
    this.triggers = [];
    this.handlers = new Map();
    this.activeSequence = null;
    this.activeIndex = -1;
    this.previousIndex = -1;
    this.markers = [];
  }

  addSequence(spec) {
    const seq = {
      id: spec.id,
      name: spec.name,
      title: spec.title || spec.name,
      start: spec.start,
      end: spec.end,
      scene: spec.scene,
      index: this.sequences.length,
    };
    this.sequences.push(seq);
    this.sequences.sort((a, b) => a.start - b.start);
    this.sequences.forEach((s, i) => { s.index = i; });
    return seq;
  }

  track(name, options) {
    let t = this.tracks.get(name);
    if (!t) {
      t = new Track(name, options);
      this.tracks.set(name, t);
    }
    return t;
  }

  addEvent(spec) {
    if (spec.duration === undefined || spec.duration <= 0) {
      const trigger = {
        time: spec.time,
        action: spec.action,
        data: spec.data || null,
        fired: false,
      };
      this.triggers.push(trigger);
      this.triggers.sort((a, b) => a.time - b.time);
      return trigger;
    }
    const cue = {
      time: spec.time,
      end: spec.time + spec.duration,
      duration: spec.duration,
      action: spec.action,
      data: spec.data || null,
      ease: spec.ease || 'linear',
      progress: 0,
      active: false,
    };
    this.cues.push(cue);
    this.cues.sort((a, b) => a.time - b.time);
    return cue;
  }

  addMarker(time, label) {
    this.markers.push({ time, label });
    this.markers.sort((a, b) => a.time - b.time);
  }

  on(action, handler) {
    if (!this.handlers.has(action)) this.handlers.set(action, []);
    this.handlers.get(action).push(handler);
    return this;
  }

  emit(action, payload) {
    const list = this.handlers.get(action);
    if (list) for (const fn of list) fn(payload);
    const any = this.handlers.get('*');
    if (any) for (const fn of any) fn(action, payload);
  }

  sequenceAt(t) {
    for (let i = 0; i < this.sequences.length; i++) {
      const s = this.sequences[i];
      if (t >= s.start && t < s.end) return s;
    }
    if (this.sequences.length === 0) return null;
    return t < this.sequences[0].start
      ? this.sequences[0]
      : this.sequences[this.sequences.length - 1];
  }

  pulse(t, at, decay = 6, ease = Ease.impact) {
    const age = t - at;
    if (age < 0) return 0;
    const u = age * decay;
    if (u >= 1) return 0;
    return ease(u);
  }

  envelope(t, at, rise, fall) {
    const age = t - at;
    if (age < 0 || age > rise + fall) return 0;
    if (age < rise) return Ease.outCubic(age / Math.max(rise, 1e-5));
    return 1 - Ease.inCubic((age - rise) / Math.max(fall, 1e-5));
  }

  span(t, from, to, ease = 'inOutCubic') {
    if (to <= from) return t >= to ? 1 : 0;
    return easeByName(ease)(clamp((t - from) / (to - from), 0, 1));
  }

  cueProgress(action) {
    for (const cue of this.cues) {
      if (cue.action === action && cue.active) return cue.progress;
    }
    return -1;
  }

  seek(t) {
    this.time = clamp(t, 0, this.duration);
    this.lastTime = this.time;
    for (const trigger of this.triggers) trigger.fired = trigger.time <= this.time;
    for (const track of this.tracks.values()) track.cursor = 0;
    this.updateActive(true);
  }

  updateActive(silent) {
    const seq = this.sequenceAt(this.time);
    const index = seq ? seq.index : -1;
    if (index !== this.activeIndex) {
      this.previousIndex = this.activeIndex;
      this.activeIndex = index;
      this.activeSequence = seq;
      if (!silent && seq) this.emit('sequence', seq);
    } else {
      this.activeSequence = seq;
    }
  }

  advance(t) {
    this.lastTime = this.time;
    this.time = clamp(t, 0, this.duration);

    for (const cue of this.cues) {
      if (this.time >= cue.time && this.time < cue.end) {
        cue.active = true;
        cue.progress = easeByName(cue.ease)((this.time - cue.time) / cue.duration);
      } else {
        cue.active = false;
        cue.progress = this.time >= cue.end ? 1 : 0;
      }
    }

    if (this.time < this.lastTime) {
      for (const trigger of this.triggers) {
        if (trigger.time > this.time) trigger.fired = false;
      }
    } else {
      for (const trigger of this.triggers) {
        if (!trigger.fired && trigger.time <= this.time && trigger.time >= this.lastTime - 0.5) {
          trigger.fired = true;
          this.emit(trigger.action, { time: trigger.time, now: this.time, data: trigger.data });
        } else if (!trigger.fired && trigger.time <= this.time) {
          trigger.fired = true;
        }
      }
    }

    this.updateActive(false);
    return this.activeSequence;
  }

  local(seq) {
    if (!seq) return { time: 0, progress: 0, length: 0 };
    const length = seq.end - seq.start;
    const time = this.time - seq.start;
    return { time, progress: length > 0 ? clamp(time / length, 0, 1) : 0, length };
  }
}
