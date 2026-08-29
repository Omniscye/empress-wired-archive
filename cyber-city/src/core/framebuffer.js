export class RenderTarget {
  constructor(ctx, options) {
    this.ctx = ctx;
    this.gl = ctx.gl;
    this.label = options.label || 'target';
    this.width = Math.max(1, options.width | 0);
    this.height = Math.max(1, options.height | 0);
    this.colorSpecs = options.color || [];
    this.depthSpec = options.depth || null;
    this.textures = [];
    this.depthTexture = null;
    this.depthBuffer = null;
    this.framebuffer = null;
    this.externalDepth = false;
    this.build();
  }

  build() {
    const gl = this.gl;
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.ctx.state.framebuffer = this.framebuffer;

    const attachments = [];
    this.colorSpecs.forEach((spec, index) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, spec.levels || 1, spec.internalFormat, this.width, this.height);
      const filter = spec.filter || gl.NEAREST;
      const wrap = spec.wrap || gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, spec.levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, tex, 0);
      attachments.push(gl.COLOR_ATTACHMENT0 + index);
      this.textures.push(tex);
    });

    if (attachments.length > 1) gl.drawBuffers(attachments);
    else if (attachments.length === 0) {
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
    }

    if (this.depthSpec) {
      if (this.depthSpec.external) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthSpec.external, 0);
        this.depthTexture = this.depthSpec.external;
        this.externalDepth = true;
      } else if (this.depthSpec.sampled) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, this.depthSpec.internalFormat || gl.DEPTH_COMPONENT32F, this.width, this.height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (this.depthSpec.compare) {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
        this.depthTexture = tex;
      } else {
        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, this.depthSpec.internalFormat || gl.DEPTH_COMPONENT24, this.width, this.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
        this.depthBuffer = rb;
      }
    }

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer '${this.label}' incomplete: 0x${status.toString(16)}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.ctx.state.framebuffer = null;
    this.ctx.invalidateTextureCache();
  }

  get texture() {
    return this.textures[0];
  }

  resize(width, height) {
    width = Math.max(1, width | 0);
    height = Math.max(1, height | 0);
    if (width === this.width && height === this.height) return;
    this.dispose();
    this.width = width;
    this.height = height;
    this.textures = [];
    this.depthTexture = null;
    this.depthBuffer = null;
    this.build();
  }

  bind(clearMask = 0) {
    this.ctx.bindFramebuffer(this.framebuffer);
    this.ctx.viewport(0, 0, this.width, this.height);
    if (clearMask) this.gl.clear(clearMask);
    return this;
  }

  generateMipmaps(index = 0) {
    const gl = this.gl;
    this.ctx.bindTexture(0, this.textures[index]);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  dispose() {
    const gl = this.gl;
    for (const tex of this.textures) gl.deleteTexture(tex);
    if (this.depthTexture && !this.externalDepth) gl.deleteTexture(this.depthTexture);
    if (this.depthBuffer) gl.deleteRenderbuffer(this.depthBuffer);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    this.ctx.invalidateTextureCache();
  }
}

export class FullscreenQuad {
  constructor(ctx) {
    const gl = ctx.gl;
    this.ctx = ctx;
    this.vao = gl.createVertexArray();
  }

  draw() {
    this.ctx.bindVAO(this.vao);
    this.ctx.gl.drawArrays(this.ctx.gl.TRIANGLES, 0, 3);
  }
}
