const VERSION_TAG = '#version 300 es';

function withDefines(source, defines) {
  const body = source.startsWith(VERSION_TAG)
    ? source.slice(VERSION_TAG.length)
    : '\n' + source;
  const lines = [VERSION_TAG];
  for (const key in defines) {
    const value = defines[key];
    if (value === false || value === null || value === undefined) continue;
    lines.push(`#define ${key} ${value === true ? 1 : value}`);
  }
  return lines.join('\n') + body;
}

function formatLog(source, log, label) {
  const lines = source.split('\n');
  const out = [`Shader compile failed [${label}]`, log.trim()];
  const match = /ERROR:\s*\d+:(\d+)/.exec(log);
  if (match) {
    const line = parseInt(match[1], 10);
    const from = Math.max(0, line - 4);
    const to = Math.min(lines.length, line + 3);
    for (let i = from; i < to; i++) {
      out.push(`${i + 1 === line ? '>' : ' '} ${String(i + 1).padStart(4)} | ${lines[i]}`);
    }
  }
  return out.join('\n');
}

export class Shader {
  constructor(ctx, label, vertexSource, fragmentSource, defines = {}) {
    const gl = ctx.gl;
    this.ctx = ctx;
    this.label = label;

    const vsSource = withDefines(vertexSource, defines);
    const fsSource = withDefines(fragmentSource, defines);
    const vs = this.compile(gl.VERTEX_SHADER, vsSource, `${label}:vertex`);
    const fs = this.compile(gl.FRAGMENT_SHADER, fsSource, `${label}:fragment`);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link failed [${label}]\n${log}`);
    }

    this.program = program;
    this.uniforms = new Map();
    this.textureUnits = new Map();

    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      const location = gl.getUniformLocation(program, info.name);
      if (location === null) continue;
      this.uniforms.set(name, { location, type: info.type, size: info.size, cache: null });
    }
  }

  compile(type, source, label) {
    const gl = this.ctx.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(formatLog(source, log, label));
    }
    return shader;
  }

  bind() {
    this.ctx.useProgram(this.program);
    return this;
  }

  has(name) {
    return this.uniforms.has(name);
  }

  set(name, value) {
    const entry = this.uniforms.get(name);
    if (!entry) return this;
    const gl = this.ctx.gl;
    const loc = entry.location;
    switch (entry.type) {
      case gl.FLOAT:
        if (typeof value === 'number') {
          if (entry.cache === value) return this;
          entry.cache = value;
          gl.uniform1f(loc, value);
        } else {
          gl.uniform1fv(loc, value);
        }
        break;
      case gl.INT:
      case gl.BOOL:
        if (typeof value === 'number' || typeof value === 'boolean') {
          const v = value === true ? 1 : value === false ? 0 : value;
          if (entry.cache === v) return this;
          entry.cache = v;
          gl.uniform1i(loc, v);
        } else {
          gl.uniform1iv(loc, value);
        }
        break;
      case gl.FLOAT_VEC2: gl.uniform2fv(loc, value); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(loc, value); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(loc, value); break;
      case gl.INT_VEC2: gl.uniform2iv(loc, value); break;
      case gl.INT_VEC3: gl.uniform3iv(loc, value); break;
      case gl.INT_VEC4: gl.uniform4iv(loc, value); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(loc, false, value); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(loc, false, value); break;
      default:
        gl.uniform1i(loc, value);
        break;
    }
    return this;
  }

  texture(name, texture, target = this.ctx.gl.TEXTURE_2D) {
    const entry = this.uniforms.get(name);
    if (!entry) return this;
    let unit = this.textureUnits.get(name);
    if (unit === undefined) {
      unit = this.textureUnits.size;
      this.textureUnits.set(name, unit);
      this.ctx.gl.uniform1i(entry.location, unit);
    }
    this.ctx.bindTexture(unit, texture, target);
    return this;
  }

  dispose() {
    this.ctx.gl.deleteProgram(this.program);
  }
}

export class ShaderLibrary {
  constructor(ctx) {
    this.ctx = ctx;
    this.cache = new Map();
  }

  get(label, vertexSource, fragmentSource, defines = {}) {
    const keys = Object.keys(defines).sort();
    const key = label + '|' + keys.map((k) => `${k}=${defines[k]}`).join(',');
    let shader = this.cache.get(key);
    if (!shader) {
      shader = new Shader(this.ctx, label, vertexSource, fragmentSource, defines);
      this.cache.set(key, shader);
    }
    return shader;
  }

  disposeAll() {
    for (const shader of this.cache.values()) shader.dispose();
    this.cache.clear();
  }
}
