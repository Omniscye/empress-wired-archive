import { QUALITY_ORDER, CINEMATIC_QUALITY } from './quality.js';
import { EXPORT_PRESETS } from './export.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function timecode(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}

export class CinematicUI {
  constructor(hooks) {
    this.hooks = hooks;
    this.root = document.getElementById('cinematic-ui');
    this.visible = false;
    this.scrubbing = false;
    this.exportOpen = false;
    this.build();
  }

  build() {
    const root = this.root;
    root.innerHTML = '';

    const top = el('div', 'cine-top');
    this.sequenceLabel = el('div', 'cine-sequence', '');
    this.musicLabel = el('div', 'cine-music', '');
    top.appendChild(this.sequenceLabel);
    top.appendChild(this.musicLabel);
    root.appendChild(top);

    this.statsPanel = el('div', 'cine-stats');
    root.appendChild(this.statsPanel);

    const bar = el('div', 'cine-bar');

    const left = el('div', 'cine-controls');
    this.playButton = el('button', 'cine-btn cine-play', '▶');
    this.playButton.title = 'Play / pause  (space)';
    this.playButton.addEventListener('click', () => this.hooks.onPlayToggle());
    left.appendChild(this.playButton);

    const back = el('button', 'cine-btn', '⏪');
    back.title = 'Back five seconds';
    back.addEventListener('click', () => this.hooks.onSkip(-5));
    left.appendChild(back);

    const fwd = el('button', 'cine-btn', '⏩');
    fwd.title = 'Forward five seconds';
    fwd.addEventListener('click', () => this.hooks.onSkip(5));
    left.appendChild(fwd);

    const restart = el('button', 'cine-btn', '↺');
    restart.title = 'Back to the top  (R)';
    restart.addEventListener('click', () => this.hooks.onSeek(0));
    left.appendChild(restart);

    this.timeLabel = el('div', 'cine-time', '0:00.00 / 0:00.00');
    left.appendChild(this.timeLabel);

    bar.appendChild(left);

    this.track = el('div', 'cine-track');
    this.markerLayer = el('div', 'cine-markers');
    this.beatLayer = el('div', 'cine-beats');
    this.fill = el('div', 'cine-fill');
    this.head = el('div', 'cine-head');
    this.track.appendChild(this.beatLayer);
    this.track.appendChild(this.markerLayer);
    this.track.appendChild(this.fill);
    this.track.appendChild(this.head);
    this.tooltip = el('div', 'cine-tooltip');
    this.track.appendChild(this.tooltip);
    bar.appendChild(this.track);

    const seekFromEvent = (e) => {
      const rect = this.track.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      this.hooks.onScrub(f);
    };
    this.track.addEventListener('pointerdown', (e) => {
      this.scrubbing = true;
      this.track.setPointerCapture(e.pointerId);
      this.hooks.onScrubStart();
      seekFromEvent(e);
    });
    this.track.addEventListener('pointermove', (e) => {
      const rect = this.track.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      this.tooltip.style.left = `${f * 100}%`;
      this.tooltip.textContent = this.labelAt ? this.labelAt(f) : '';
      if (this.scrubbing) seekFromEvent(e);
    });
    const endScrub = (e) => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      try { this.track.releasePointerCapture(e.pointerId); } catch (err) { void err; }
      this.hooks.onScrubEnd();
    };
    this.track.addEventListener('pointerup', endScrub);
    this.track.addEventListener('pointercancel', endScrub);

    const right = el('div', 'cine-controls cine-right');

    this.qualitySelect = el('select', 'cine-select');
    for (const name of QUALITY_ORDER) {
      const opt = el('option', null, CINEMATIC_QUALITY[name].label);
      opt.value = name;
      this.qualitySelect.appendChild(opt);
    }
    this.qualitySelect.title = 'Cinematic quality';
    this.qualitySelect.addEventListener('change', () => this.hooks.onQuality(this.qualitySelect.value));
    right.appendChild(this.qualitySelect);

    this.volumeInput = el('input', 'cine-volume');
    this.volumeInput.type = 'range';
    this.volumeInput.min = 0;
    this.volumeInput.max = 1;
    this.volumeInput.step = 0.02;
    this.volumeInput.value = 0.9;
    this.volumeInput.title = 'Volume';
    this.volumeInput.addEventListener('input', () => this.hooks.onVolume(parseFloat(this.volumeInput.value)));
    right.appendChild(this.volumeInput);

    const exportButton = el('button', 'cine-btn cine-wide', 'RENDER');
    exportButton.title = 'Render and export  (E)';
    exportButton.addEventListener('click', () => this.toggleExport());
    right.appendChild(exportButton);

    const exitButton = el('button', 'cine-btn cine-wide', 'RESTART');
    exitButton.title = 'Back to the top';
    exitButton.addEventListener('click', () => this.hooks.onExit());
    right.appendChild(exitButton);

    bar.appendChild(right);
    root.appendChild(bar);

    this.buildExportPanel();
    root.appendChild(this.exportPanel);

    this.chapterList = el('div', 'cine-chapters');
    root.appendChild(this.chapterList);
  }

  buildExportPanel() {
    const panel = el('aside', 'cine-export');
    panel.appendChild(el('h2', null, 'Render'));

    const note = el('p', 'cine-note');
    note.textContent = 'The film render is deterministic: every frame is a pure function of its index, '
      + 'so the same range produces the same images on any machine. Frames go straight to a folder '
      + 'you choose where the browser allows it, and to a series of zips where it does not.';
    panel.appendChild(note);

    const row = (label, control) => {
      const r = el('label', 'cine-row');
      r.appendChild(el('span', null, label));
      r.appendChild(control);
      panel.appendChild(r);
      return control;
    };

    this.presetSelect = el('select', 'cine-select');
    for (const key of Object.keys(EXPORT_PRESETS)) {
      const opt = el('option', null, EXPORT_PRESETS[key].label);
      opt.value = key;
      this.presetSelect.appendChild(opt);
    }
    this.presetSelect.value = '1080p30';
    row('Format', this.presetSelect);

    this.formatSelect = el('select', 'cine-select');
    for (const [value, label] of [['image/jpeg', 'JPEG, quality 94'], ['image/png', 'PNG, lossless']]) {
      const opt = el('option', null, label);
      opt.value = value;
      this.formatSelect.appendChild(opt);
    }
    row('Frames', this.formatSelect);

    this.renderQuality = el('select', 'cine-select');
    for (const name of QUALITY_ORDER) {
      const opt = el('option', null, CINEMATIC_QUALITY[name].label);
      opt.value = name;
      this.renderQuality.appendChild(opt);
    }
    this.renderQuality.value = 'film';
    row('Quality', this.renderQuality);

    const range = el('div', 'cine-range');
    this.fromInput = el('input', 'cine-number');
    this.fromInput.type = 'number';
    this.fromInput.min = 0;
    this.fromInput.step = 0.1;
    this.fromInput.value = 0;
    this.toInput = el('input', 'cine-number');
    this.toInput.type = 'number';
    this.toInput.min = 0;
    this.toInput.step = 0.1;
    this.toInput.value = 263.5;
    range.appendChild(this.fromInput);
    range.appendChild(el('span', 'cine-dash', 'to'));
    range.appendChild(this.toInput);
    row('Seconds', range);

    const actions = el('div', 'cine-actions');

    const filmButton = el('button', 'cine-action primary', 'Render frame sequence');
    filmButton.addEventListener('click', () => this.hooks.onRenderFilm(this.exportOptions()));
    actions.appendChild(filmButton);

    const captureButton = el('button', 'cine-action', 'Record in real time (webm with sound)');
    captureButton.addEventListener('click', () => this.hooks.onCapture(this.exportOptions()));
    actions.appendChild(captureButton);

    const stillButton = el('button', 'cine-action', 'Save this frame as a still');
    stillButton.addEventListener('click', () => this.hooks.onGrabFrame(this.exportOptions()));
    actions.appendChild(stillButton);

    const cancelButton = el('button', 'cine-action danger', 'Cancel');
    cancelButton.addEventListener('click', () => this.hooks.onCancelExport());
    actions.appendChild(cancelButton);

    panel.appendChild(actions);

    this.exportStatus = el('div', 'cine-export-status', '');
    panel.appendChild(this.exportStatus);
    this.exportBar = el('div', 'cine-export-bar');
    this.exportBarFill = el('div', 'cine-export-fill');
    this.exportBar.appendChild(this.exportBarFill);
    panel.appendChild(this.exportBar);

    const close = el('button', 'cine-close', '×');
    close.addEventListener('click', () => this.toggleExport(false));
    panel.appendChild(close);

    this.exportPanel = panel;
  }

  exportOptions() {
    return {
      preset: this.presetSelect.value,
      format: this.formatSelect.value,
      quality: this.renderQuality.value,
      from: Math.max(0, parseFloat(this.fromInput.value) || 0),
      to: Math.max(0.1, parseFloat(this.toInput.value) || 0),
    };
  }

  toggleExport(force) {
    this.exportOpen = force === undefined ? !this.exportOpen : force;
    this.exportPanel.classList.toggle('open', this.exportOpen);
  }

  setExportProgress(message, value) {
    this.exportStatus.textContent = message;
    this.exportBarFill.style.width = `${Math.round(value * 100)}%`;
  }

  setTimeline(duration, sequences, bars) {
    this.duration = duration;
    this.sequences = sequences;
    this.markerLayer.innerHTML = '';
    this.chapterList.innerHTML = '';
    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const mark = el('div', 'cine-marker');
      mark.style.left = `${(seq.start / duration) * 100}%`;
      mark.title = `${seq.name} — ${timecode(seq.start)}`;
      this.markerLayer.appendChild(mark);

      const chip = el('button', 'cine-chapter');
      chip.innerHTML = `<b>${i + 1}</b> ${seq.name}`;
      chip.addEventListener('click', () => this.hooks.onSeek(seq.start + 0.01));
      this.chapterList.appendChild(chip);
    }

    if (bars && bars.length) {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1;
      const c = canvas.getContext('2d');
      c.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = 0; i < bars.length; i += 4) {
        const x = Math.round((bars[i] / duration) * canvas.width);
        c.fillRect(x, 0, 1, 1);
      }
      this.beatLayer.style.backgroundImage = `url(${canvas.toDataURL()})`;
      this.beatLayer.style.backgroundSize = '100% 100%';
    }

    this.labelAt = (f) => {
      const t = f * duration;
      let name = '';
      for (const s of sequences) if (t >= s.start) name = s.name;
      return `${timecode(t)}  ${name}`;
    };

    this.toInput.value = duration.toFixed(1);
  }

  setPlaying(playing) {
    this.playButton.textContent = playing ? '‖' : '▶';
  }

  setQuality(name) {
    this.qualitySelect.value = name;
  }

  setVolume(v) {
    this.volumeInput.value = v;
  }

  update(state) {
    if (!this.scrubbing) {
      const f = state.duration > 0 ? state.time / state.duration : 0;
      this.fill.style.width = `${f * 100}%`;
      this.head.style.left = `${f * 100}%`;
    }
    this.timeLabel.textContent = `${timecode(state.time)} / ${timecode(state.duration)}`;
    if (state.sequence) {
      this.sequenceLabel.innerHTML = `<b>${state.sequence.title}</b><span>${state.sequence.name}</span>`;
    }
    this.musicLabel.textContent = state.musicLine || '';
  }

  setStats(lines) {
    this.statsPanel.innerHTML = lines
      .map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
  }

  setStatsVisible(visible) {
    this.statsPanel.classList.toggle('visible', visible);
  }

  show() {
    this.visible = true;
    this.root.classList.add('active');
  }

  hide() {
    this.visible = false;
    this.root.classList.remove('active');
    this.toggleExport(false);
  }

  toggleChrome(force) {
    const hidden = force === undefined ? !this.root.classList.contains('bare') : !force;
    this.root.classList.toggle('bare', hidden);
  }
}
