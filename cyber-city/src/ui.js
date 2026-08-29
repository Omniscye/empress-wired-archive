import { PRESET_ORDER, PRESETS } from './settings.js';

const SECTIONS = [
  {
    title: 'Performance',
    controls: [
      { key: 'renderScale', label: 'Render Scale', type: 'range', min: 0.4, max: 1.5, step: 0.05 },
      { key: 'adaptiveResolution', label: 'Adaptive Resolution', type: 'toggle' },
      { key: 'viewRadius', label: 'View Distance', type: 'range', min: 5, max: 30, step: 1, unit: ' cells' },
      { key: 'maxLights', label: 'Light Budget', type: 'range', min: 80, max: 2200, step: 20 },
      { key: 'trafficGround', label: 'Street Traffic', type: 'range', min: 0, max: 200, step: 5 },
      { key: 'trafficAir', label: 'Air Traffic', type: 'range', min: 0, max: 180, step: 5 },
    ],
  },
  {
    title: 'Rendering',
    controls: [
      { key: 'ssaoSamples', label: 'Ambient Occlusion', type: 'range', min: 0, max: 24, step: 2 },
      { key: 'ssrSteps', label: 'Reflection Steps', type: 'range', min: 0, max: 52, step: 2 },
      { key: 'ssrIntensity', label: 'Reflection Strength', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'volumetricSteps', label: 'Volumetric Steps', type: 'range', min: 0, max: 20, step: 1 },
      { key: 'volumetricLights', label: 'Volumetric Lights', type: 'range', min: 0, max: 12, step: 1 },
      { key: 'fxaa', label: 'Anti-aliasing', type: 'toggle' },
    ],
  },
  {
    title: 'Atmosphere',
    controls: [
      { key: 'rain', label: 'Rain', type: 'toggle' },
      { key: 'rainIntensity', label: 'Rain Intensity', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'wetness', label: 'Surface Wetness', type: 'range', min: 0, max: 1, step: 0.02 },
      { key: 'fogDensity', label: 'Fog Density', type: 'range', min: 0, max: 0.012, step: 0.0002 },
      { key: 'cloudCoverage', label: 'Cloud Cover', type: 'range', min: 0, max: 1, step: 0.02 },
      { key: 'volumetricStrength', label: 'Light Scatter', type: 'range', min: 0, max: 3, step: 0.05 },
      { key: 'lightning', label: 'Lightning', type: 'range', min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'Image',
    controls: [
      { key: 'exposure', label: 'Exposure', type: 'range', min: 0.3, max: 3, step: 0.05 },
      { key: 'bloomIntensity', label: 'Bloom', type: 'range', min: 0, max: 1.2, step: 0.02 },
      { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'range', min: 0.2, max: 3, step: 0.05 },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.02 },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0.6, max: 1.6, step: 0.02 },
      { key: 'chromatic', label: 'Chromatic Aberration', type: 'range', min: 0, max: 2, step: 0.05 },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1.6, step: 0.05 },
      { key: 'grain', label: 'Film Grain', type: 'range', min: 0, max: 0.25, step: 0.005 },
      { key: 'scanline', label: 'Scanlines', type: 'range', min: 0, max: 1, step: 0.02 },
    ],
  },
  {
    title: 'Audio',
    controls: [
      { key: 'audioEnabled', label: 'Soundtrack', type: 'toggle' },
      { key: 'audioVolume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.02 },
    ],
  },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class UI {
  constructor(settings, hooks) {
    this.settings = settings;
    this.hooks = hooks;
    this.controls = new Map();
    this.panelOpen = false;
    this.hudVisible = true;

    this.root = document.getElementById('ui');
    this.loader = document.getElementById('loader');
    this.loaderBar = document.getElementById('loader-bar');
    this.loaderStatus = document.getElementById('loader-status');
    this.hud = document.getElementById('hud');
    this.modeLabel = document.getElementById('mode-label');
    this.hintLabel = document.getElementById('hint-label');
    this.statsPanel = document.getElementById('stats');
    this.panel = document.getElementById('panel');
    this.panelBody = document.getElementById('panel-body');
    this.presetRow = document.getElementById('preset-row');
    this.toast = document.getElementById('toast');
    this.errorPanel = document.getElementById('error');

    this.buildPresets();
    this.buildControls();
    this.bindButtons();
    this.syncAll();
  }

  buildPresets() {
    for (const name of PRESET_ORDER) {
      const button = el('button', 'preset', PRESETS[name].label);
      button.dataset.preset = name;
      button.addEventListener('click', () => {
        this.settings.applyPreset(name);
        this.syncAll();
        this.hooks.onPreset();
        this.showToast(`${PRESETS[name].label} preset`);
      });
      this.presetRow.appendChild(button);
    }
  }

  buildControls() {
    for (const section of SECTIONS) {
      const group = el('div', 'group');
      group.appendChild(el('h3', null, section.title));
      for (const control of section.controls) {
        group.appendChild(this.buildControl(control));
      }
      this.panelBody.appendChild(group);
    }

    const actions = el('div', 'group actions');
    const reset = el('button', 'action', 'Reset to defaults');
    reset.addEventListener('click', () => {
      this.settings.reset();
      this.syncAll();
      this.hooks.onPreset();
      this.showToast('Settings reset');
    });
    actions.appendChild(reset);

    const shot = el('button', 'action', 'Save screenshot');
    shot.addEventListener('click', () => this.hooks.onScreenshot());
    actions.appendChild(shot);

    const jump = el('button', 'action', 'Jump to new district');
    jump.addEventListener('click', () => this.hooks.onTeleport());
    actions.appendChild(jump);

    this.panelBody.appendChild(actions);
  }

  buildControl(control) {
    const row = el('label', 'row');
    const head = el('div', 'row-head');
    head.appendChild(el('span', 'row-label', control.label));
    const value = el('span', 'row-value');
    head.appendChild(value);
    row.appendChild(head);

    let input;
    if (control.type === 'toggle') {
      input = el('input');
      input.type = 'checkbox';
      input.className = 'toggle';
      input.addEventListener('change', () => {
        this.settings.set(control.key, input.checked);
        this.updateControl(control);
        this.hooks.onSetting(control.key);
      });
      row.classList.add('row-toggle');
    } else {
      input = el('input');
      input.type = 'range';
      input.min = control.min;
      input.max = control.max;
      input.step = control.step;
      input.addEventListener('input', () => {
        this.settings.set(control.key, parseFloat(input.value));
        this.updateControl(control);
        this.hooks.onSetting(control.key);
      });
    }
    row.appendChild(input);
    this.controls.set(control.key, { control, input, value });
    return row;
  }

  updateControl(control) {
    const entry = this.controls.get(control.key);
    if (!entry) return;
    const current = this.settings[control.key];
    if (control.type === 'toggle') {
      entry.input.checked = !!current;
      entry.value.textContent = current ? 'on' : 'off';
    } else {
      entry.input.value = current;
      const decimals = control.step < 0.01 ? 3 : control.step < 1 ? 2 : 0;
      entry.value.textContent = Number(current).toFixed(decimals) + (control.unit || '');
    }
  }

  syncAll() {
    for (const { control } of this.controls.values()) this.updateControl(control);
    for (const button of this.presetRow.children) {
      button.classList.toggle('active', button.dataset.preset === this.settings.preset);
    }
  }

  bindButtons() {
    document.getElementById('panel-toggle').addEventListener('click', () => this.togglePanel());
    document.getElementById('panel-close').addEventListener('click', () => this.togglePanel(false));
    document.getElementById('start-button').addEventListener('click', () => this.hooks.onStart());
    const intro = document.getElementById('intro-button');
    if (intro && this.hooks.onStartIntro) {
      intro.addEventListener('click', () => this.hooks.onStartIntro());
    }
  }

  setLoaderBusy(busy) {
    this.loader.style.display = 'flex';
    this.loader.classList.toggle('gone', false);
    this.loader.classList.toggle('busy', busy);
    document.getElementById('loader-progress').classList.toggle('done', !busy);
    document.getElementById('start-button').classList.toggle('ready', !busy);
    const intro = document.getElementById('intro-button');
    if (intro) intro.classList.toggle('ready', !busy);
  }

  setChromeVisible(visible) {
    this.root.classList.toggle('city-chrome-hidden', !visible);
  }

  togglePanel(force) {
    this.panelOpen = force === undefined ? !this.panelOpen : force;
    this.panel.classList.toggle('open', this.panelOpen);
    document.getElementById('panel-toggle').classList.toggle('active', this.panelOpen);
  }

  toggleHud(force) {
    this.hudVisible = force === undefined ? !this.hudVisible : force;
    this.root.classList.toggle('hidden-hud', !this.hudVisible);
  }

  setMode(label, hint) {
    this.modeLabel.textContent = label;
    this.hintLabel.innerHTML = hint;
  }

  setLoaderProgress(value, status) {
    this.loaderBar.style.width = `${Math.round(value * 100)}%`;
    if (status) this.loaderStatus.textContent = status;
  }

  showStart() {
    document.getElementById('loader-progress').classList.add('done');
    document.getElementById('start-button').classList.add('ready');
    const intro = document.getElementById('intro-button');
    if (intro) intro.classList.add('ready');
  }

  hideLoader() {
    this.loader.classList.remove('busy');
    this.loader.classList.add('gone');
    setTimeout(() => {
      if (this.loader.classList.contains('gone')) this.loader.style.display = 'none';
    }, 900);
  }

  showToast(message) {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), 1800);
  }

  showError(message) {
    this.errorPanel.style.display = 'flex';
    this.errorPanel.querySelector('pre').textContent = message;
    this.loader.style.display = 'none';
  }

  setStatsVisible(visible) {
    this.statsPanel.classList.toggle('visible', visible);
  }

  updateStats(lines) {
    this.statsPanel.innerHTML = lines.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
  }
}
