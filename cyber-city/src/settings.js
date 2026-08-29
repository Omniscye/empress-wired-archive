const STORAGE_KEY = 'empress-cyber-city.settings.v2';

export const PRESETS = {
  potato: {
    label: 'Potato',
    renderScale: 0.55,
    viewRadius: 7,
    maxLights: 220,
    ssaoSamples: 0,
    ssrSteps: 0,
    volumetricSteps: 0,
    volumetricLights: 0,
    bloomMips: 4,
    fxaa: false,
    rain: true,
    trafficGround: 24,
    trafficAir: 18,
  },
  low: {
    label: 'Low',
    renderScale: 0.7,
    viewRadius: 11,
    maxLights: 380,
    ssaoSamples: 6,
    ssrSteps: 0,
    volumetricSteps: 0,
    volumetricLights: 0,
    bloomMips: 5,
    fxaa: true,
    rain: true,
    trafficGround: 40,
    trafficAir: 30,
  },
  medium: {
    label: 'Medium',
    renderScale: 0.85,
    viewRadius: 15,
    maxLights: 650,
    ssaoSamples: 10,
    ssrSteps: 20,
    volumetricSteps: 10,
    volumetricLights: 6,
    bloomMips: 6,
    fxaa: true,
    rain: true,
    trafficGround: 65,
    trafficAir: 50,
  },
  high: {
    label: 'High',
    renderScale: 1.0,
    viewRadius: 20,
    maxLights: 1000,
    ssaoSamples: 16,
    ssrSteps: 34,
    volumetricSteps: 14,
    volumetricLights: 9,
    bloomMips: 6,
    fxaa: true,
    rain: true,
    trafficGround: 95,
    trafficAir: 75,
  },
  ultra: {
    label: 'Ultra',
    renderScale: 1.0,
    viewRadius: 26,
    maxLights: 1600,
    ssaoSamples: 24,
    ssrSteps: 52,
    volumetricSteps: 20,
    volumetricLights: 12,
    bloomMips: 7,
    fxaa: true,
    rain: true,
    trafficGround: 140,
    trafficAir: 110,
  },
};

export const PRESET_ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];

export const DEFAULT_LOOK = {
  exposure: 1.12,
  bloomIntensity: 0.42,
  bloomThreshold: 1.05,
  chromatic: 0.18,
  vignette: 0.55,
  grain: 0.028,
  scanline: 0.0,
  saturation: 1.16,
  contrast: 1.06,
  wetness: 0.85,
  rainIntensity: 1.15,
  fogDensity: 0.0026,
  cloudCoverage: 0.6,
  timeScale: 1.0,
  lightning: 1.0,
  ssrIntensity: 1.0,
  volumetricStrength: 0.5,
  ambientScale: 1.0,
  emissiveScale: 1.0,
  lightScale: 1.0,
};

export class Settings {
  constructor() {
    this.preset = 'high';
    this.adaptiveResolution = true;
    this.showStats = false;
    this.audioEnabled = true;
    this.audioVolume = 0.85;
    Object.assign(this, structuredClone(PRESETS.high));
    Object.assign(this, structuredClone(DEFAULT_LOOK));
    this.dynamicScale = 1.0;
    this.listeners = [];
    this.load();
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  notify(key) {
    for (const fn of this.listeners) fn(key, this[key]);
  }

  applyPreset(name) {
    if (!PRESETS[name]) return;
    this.preset = name;
    Object.assign(this, structuredClone(PRESETS[name]));
    this.dynamicScale = 1.0;
    this.save();
    this.notify('preset');
  }

  set(key, value) {
    if (this[key] === value) return;
    this[key] = value;
    this.save();
    this.notify(key);
  }

  effectiveScale() {
    return this.renderScale * (this.adaptiveResolution ? this.dynamicScale : 1.0);
  }

  serialize() {
    const out = { preset: this.preset, adaptiveResolution: this.adaptiveResolution, audioEnabled: this.audioEnabled, audioVolume: this.audioVolume, showStats: this.showStats };
    for (const key of Object.keys(PRESETS.high)) {
      if (key === 'label') continue;
      out[key] = this[key];
    }
    for (const key of Object.keys(DEFAULT_LOOK)) out[key] = this[key];
    return out;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize()));
    } catch (err) {
      void err;
    }
  }

  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      void err;
    }
    if (!raw) {
      this.autoDetect();
      return;
    }
    try {
      const data = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        if (key in this) this[key] = data[key];
      }
    } catch (err) {
      this.autoDetect();
    }
  }

  autoDetect() {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    let preset = 'high';
    if (mobile) preset = cores >= 8 ? 'low' : 'potato';
    else if (cores <= 4 || memory <= 4) preset = 'medium';
    else if (cores >= 12 && memory >= 8) preset = 'high';
    this.preset = preset;
    Object.assign(this, structuredClone(PRESETS[preset]));
  }

  reset() {
    this.autoDetect();
    Object.assign(this, structuredClone(DEFAULT_LOOK));
    this.dynamicScale = 1.0;
    this.save();
    this.notify('preset');
  }
}
