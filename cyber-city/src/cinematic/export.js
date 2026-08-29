const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class StoredZip {
  constructor() {
    this.parts = [];
    this.entries = [];
    this.offset = 0;
  }

  add(name, bytes) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    this.entries.push({ nameBytes, crc, size: bytes.length, offset: this.offset });
    this.parts.push(header, bytes);
    this.offset += header.length + bytes.length;
  }

  finish() {
    const central = [];
    let centralSize = 0;
    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.nameBytes.length);
      const view = new DataView(rec.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      view.setUint32(16, e.crc, true);
      view.setUint32(20, e.size, true);
      view.setUint32(24, e.size, true);
      view.setUint16(28, e.nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, e.offset, true);
      rec.set(e.nameBytes, 46);
      central.push(rec);
      centralSize += rec.length;
    }
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, this.entries.length, true);
    view.setUint16(10, this.entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, this.offset, true);
    view.setUint16(20, 0, true);
    return new Blob([...this.parts, ...central, end], { type: 'application/zip' });
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

function pad(n, width = 6) {
  return String(n).padStart(width, '0');
}

export const EXPORT_PRESETS = {
  '1080p30': { width: 1920, height: 1080, fps: 30, label: '1920 x 1080, 30 fps' },
  '1080p60': { width: 1920, height: 1080, fps: 60, label: '1920 x 1080, 60 fps' },
  '1440p30': { width: 2560, height: 1440, fps: 30, label: '2560 x 1440, 30 fps' },
  '2160p30': { width: 3840, height: 2160, fps: 30, label: '3840 x 2160, 30 fps' },
  '720p30': { width: 1280, height: 720, fps: 30, label: '1280 x 720, 30 fps' },
};

export class CinematicExporter {
  constructor(host) {

    this.host = host;
    this.running = false;
    this.cancelled = false;
    this.mode = null;
    this.progress = 0;
    this.onProgress = null;
    this.onDone = null;
    this.onError = null;
    this.recorder = null;
    this.chunks = [];
  }

  report(message, value) {
    this.progress = value;
    if (this.onProgress) this.onProgress(message, value);
  }

  cancel() {
    this.cancelled = true;
    if (this.recorder && this.recorder.state === 'recording') {
      try { this.recorder.stop(); } catch (err) { void err; }
    }
  }

  async grabFrame(options = {}) {
    const host = this.host;
    const preset = EXPORT_PRESETS[options.preset] || EXPORT_PRESETS['1080p30'];
    const time = options.time !== undefined ? options.time : host.director.time;
    host.setFixedResolution(preset.width, preset.height);
    await nextFrame();
    host.director.renderAt(time, 1 / preset.fps);
    const blob = await canvasBlob(host.canvas, 'image/png');
    host.clearFixedResolution();
    await nextFrame();
    downloadBlob(blob, `empress-cinematic-${time.toFixed(2)}s.png`);
    return blob;
  }

  async captureRealtime(options = {}) {
    if (this.running) return null;
    const host = this.host;
    const fps = options.fps || 30;
    const bitrate = options.bitrate || 24000000;

    const stream = host.canvas.captureStream(fps);
    const audioStream = host.director.sync.captureStream();
    if (audioStream) {
      for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    }

    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    let mimeType = null;
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
    }
    if (!mimeType) throw new Error('This browser cannot record video from a canvas.');

    this.running = true;
    this.cancelled = false;
    this.mode = 'capture';
    this.chunks = [];

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    this.recorder = recorder;
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };

    const done = new Promise((resolve) => { recorder.onstop = resolve; });

    host.director.seek(options.from || 0);
    await host.director.sync.resume();
    host.director.play();
    recorder.start(1000);
    this.report('Recording', 0);

    const to = options.to !== undefined ? options.to : host.director.duration;
    await new Promise((resolve) => {
      const tick = () => {
        if (this.cancelled || host.director.time >= to - 0.02) {
          resolve();
          return;
        }
        this.report('Recording', (host.director.time - (options.from || 0)) / Math.max(0.001, to - (options.from || 0)));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    if (recorder.state === 'recording') recorder.stop();
    await done;
    host.director.pause();
    this.running = false;
    this.recorder = null;

    const blob = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];
    downloadBlob(blob, 'empress-cinematic-intro.webm');
    this.report('Recording written', 1);
    if (this.onDone) this.onDone({ mode: 'capture', blob });
    return blob;
  }

  async renderFilm(options = {}) {
    if (this.running) return null;
    const host = this.host;
    const preset = EXPORT_PRESETS[options.preset] || EXPORT_PRESETS['1080p30'];
    const fps = options.fps || preset.fps;
    const from = options.from || 0;
    const to = options.to !== undefined ? options.to : host.director.duration;
    const format = options.format || 'image/jpeg';
    const qualityValue = options.jpegQuality !== undefined ? options.jpegQuality : 0.94;
    const extension = format === 'image/png' ? 'png' : 'jpg';
    const framesPerZip = options.framesPerZip || 240;

    const startFrame = Math.round(from * fps);
    const endFrame = Math.round(to * fps);
    const total = Math.max(1, endFrame - startFrame);

    this.running = true;
    this.cancelled = false;
    this.mode = 'film';

    const previousQuality = host.director.qualityName;
    if (options.quality) host.director.setQuality(options.quality);
    host.setFixedResolution(preset.width, preset.height);
    host.director.pause();
    await nextFrame();
    await nextFrame();

    let dirHandle = null;
    if (options.useDirectory !== false && window.showDirectoryPicker) {
      try {
        dirHandle = await window.showDirectoryPicker({ id: 'empress-cinematic', mode: 'readwrite' });
      } catch (err) {
        dirHandle = null;
      }
    }

    let zip = dirHandle ? null : new StoredZip();
    let zipIndex = 0;
    let inZip = 0;
    const dt = 1 / fps;

    try {

      host.director.seek(from);
      const warmup = Math.min(90, Math.round(fps * 1.5));
      for (let i = 0; i < warmup; i++) host.director.step(Math.max(0, from - (warmup - i) * dt), dt);

      for (let f = 0; f < total; f++) {
        if (this.cancelled) break;
        const frameIndex = startFrame + f;
        const t = frameIndex / fps;
        host.director.renderAt(t, dt);

        const blob = await canvasBlob(host.canvas, format, qualityValue);
        const name = `frame_${pad(frameIndex)}.${extension}`;

        if (dirHandle) {
          const handle = await dirHandle.getFileHandle(name, { create: true });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          zip.add(name, bytes);
          inZip++;
          if (inZip >= framesPerZip) {
            downloadBlob(zip.finish(), `empress-cinematic-frames-${pad(zipIndex, 3)}.zip`);
            zip = new StoredZip();
            zipIndex++;
            inZip = 0;

            await sleep(400);
          }
        }

        this.report(`Frame ${f + 1} of ${total}`, (f + 1) / total);

        if ((f & 1) === 0) await nextFrame();
      }

      if (!dirHandle && inZip > 0) {
        downloadBlob(zip.finish(), `empress-cinematic-frames-${pad(zipIndex, 3)}.zip`);
      }

      if (dirHandle) {

        try {
          const response = await fetch(host.audioFile, { cache: 'force-cache' });
          const audio = await response.blob();
          const audioHandle = await dirHandle.getFileHandle('soundtrack.mp3', { create: true });
          const w = await audioHandle.createWritable();
          await w.write(audio);
          await w.close();

          const readme = buildMuxInstructions({ fps, from, extension, preset });
          const readmeHandle = await dirHandle.getFileHandle('ASSEMBLE.txt', { create: true });
          const rw = await readmeHandle.createWritable();
          await rw.write(new Blob([readme], { type: 'text/plain' }));
          await rw.close();
        } catch (err) {
          void err;
        }
      } else {
        downloadBlob(new Blob([buildMuxInstructions({ fps, from, extension, preset })], { type: 'text/plain' }),
          'ASSEMBLE.txt');
      }
    } catch (err) {
      if (this.onError) this.onError(err);
      else throw err;
    } finally {
      host.clearFixedResolution();
      if (options.quality) host.director.setQuality(previousQuality);
      this.running = false;
      await nextFrame();
    }

    this.report(this.cancelled ? 'Render cancelled' : 'Render complete', 1);
    if (this.onDone) this.onDone({ mode: 'film', cancelled: this.cancelled, frames: total });
    return true;
  }
}

export function buildMuxInstructions({ fps, from, extension, preset }) {
  const offset = from > 0 ? `-ss ${from.toFixed(3)} ` : '';
  return [
    'EMPRESS: CYBER CITY  ->  CINEMATIC INTRO',
    '',
    `Frame sequence: ${preset.width} x ${preset.height} at ${fps} fps, frame_%06d.${extension}`,
    `Soundtrack:     soundtrack.mp3${from > 0 ? ` (starts ${from.toFixed(3)} s into the track)` : ''}`,
    '',
    'Assemble with ffmpeg, from inside this folder:',
    '',
    `  ffmpeg -framerate ${fps} -start_number 0 -i frame_%06d.${extension} \\`,
    `         ${offset}-i soundtrack.mp3 \\`,
    '         -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \\',
    '         -c:a aac -b:a 320k -shortest \\',
    '         empress-cinematic-intro.mp4',
    '',
    'For a higher quality master, swap the video codec for ProRes:',
    '',
    `  ffmpeg -framerate ${fps} -start_number 0 -i frame_%06d.${extension} \\`,
    `         ${offset}-i soundtrack.mp3 \\`,
    '         -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le \\',
    '         -c:a pcm_s16le \\',
    '         empress-cinematic-intro.mov',
    '',
    'The frame numbering is the absolute frame index in the film, so a',
    'range render starts at a number other than zero. Point -start_number',
    'at the first file in the folder if you rendered a section.',
  ].join('\n');
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not read the frame back from the canvas.'));
    }, type, quality);
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
