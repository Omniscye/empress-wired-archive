export class GLContext {
  constructor(canvas) {
    const attribs = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    };
    const gl = canvas.getContext('webgl2', attribs);
    if (!gl) throw new Error('WebGL2 is not available in this browser.');

    this.canvas = canvas;
    this.gl = gl;
    this.caps = {
      colorBufferFloat: !!gl.getExtension('EXT_color_buffer_float'),
      colorBufferHalfFloat: !!gl.getExtension('EXT_color_buffer_half_float'),
      floatLinear: !!gl.getExtension('OES_texture_float_linear'),
      halfFloatLinear: !!gl.getExtension('OES_texture_half_float_linear'),
      anisotropy: gl.getExtension('EXT_texture_filter_anisotropic'),
      timerQuery: gl.getExtension('EXT_disjoint_timer_query_webgl2'),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxColorAttachments: gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
      maxSamples: gl.getParameter(gl.MAX_SAMPLES),
      maxUniformBlockSize: gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE),
      maxAnisotropy: 1,
      renderer: 'unknown',
    };
    if (this.caps.anisotropy) {
      this.caps.maxAnisotropy = gl.getParameter(this.caps.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      this.caps.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
    }

    this.state = {
      program: null,
      vao: null,
      framebuffer: null,
      depthTest: false,
      depthWrite: true,
      depthFunc: gl.LEQUAL,
      cullFace: false,
      cullMode: gl.BACK,
      blend: false,
      blendSrc: gl.ONE,
      blendDst: gl.ZERO,
      viewport: [0, 0, 0, 0],
      units: new Array(16).fill(null),
      activeUnit: -1,
    };

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  useProgram(program) {
    if (this.state.program !== program) {
      this.gl.useProgram(program);
      this.state.program = program;
    }
  }

  bindVAO(vao) {
    if (this.state.vao !== vao) {
      this.gl.bindVertexArray(vao);
      this.state.vao = vao;
    }
  }

  bindFramebuffer(fb) {
    if (this.state.framebuffer !== fb) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
      this.state.framebuffer = fb;
    }
  }

  viewport(x, y, w, h) {
    const v = this.state.viewport;
    if (v[0] !== x || v[1] !== y || v[2] !== w || v[3] !== h) {
      this.gl.viewport(x, y, w, h);
      v[0] = x; v[1] = y; v[2] = w; v[3] = h;
    }
  }

  depthTest(enabled, write = true, func = this.gl.LEQUAL) {
    const gl = this.gl;
    const s = this.state;
    if (s.depthTest !== enabled) {
      enabled ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
      s.depthTest = enabled;
    }
    if (s.depthWrite !== write) {
      gl.depthMask(write);
      s.depthWrite = write;
    }
    if (s.depthFunc !== func) {
      gl.depthFunc(func);
      s.depthFunc = func;
    }
  }

  cull(enabled, mode = this.gl.BACK) {
    const gl = this.gl;
    const s = this.state;
    if (s.cullFace !== enabled) {
      enabled ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);
      s.cullFace = enabled;
    }
    if (enabled && s.cullMode !== mode) {
      gl.cullFace(mode);
      s.cullMode = mode;
    }
  }

  blend(enabled, src = this.gl.ONE, dst = this.gl.ONE_MINUS_SRC_ALPHA) {
    const gl = this.gl;
    const s = this.state;
    if (s.blend !== enabled) {
      enabled ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);
      s.blend = enabled;
    }
    if (enabled && (s.blendSrc !== src || s.blendDst !== dst)) {
      gl.blendFunc(src, dst);
      s.blendSrc = src;
      s.blendDst = dst;
    }
  }

  bindTexture(unit, texture, target = this.gl.TEXTURE_2D) {
    const gl = this.gl;
    const s = this.state;
    if (s.units[unit] === texture) return;
    if (s.activeUnit !== unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      s.activeUnit = unit;
    }
    gl.bindTexture(target, texture);
    s.units[unit] = texture;
  }

  invalidateTextureCache() {
    this.state.units.fill(null);
    this.state.activeUnit = -1;
  }
}
