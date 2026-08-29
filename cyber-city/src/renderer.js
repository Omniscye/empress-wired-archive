import { GLContext } from './core/gl.js';
import { ShaderLibrary } from './core/shader.js';
import { RenderTarget, FullscreenQuad } from './core/framebuffer.js';
import {
  Mesh, createBoxGeometry, createQuadGeometry, createIcosphere, createGroundGrid,
  MESH_LAYOUT, GROUND_LAYOUT, SPHERE_LAYOUT,
  BUILDING_INSTANCE_LAYOUT, SIGN_INSTANCE_LAYOUT, VEHICLE_INSTANCE_LAYOUT, LIGHT_INSTANCE_LAYOUT,
} from './core/mesh.js';
import { vec3, clamp } from './core/math.js';
import { FULLSCREEN_VS } from './shaders/common.js';
import { BUILDING_VS, BUILDING_FS, SIGN_VS, SIGN_FS } from './shaders/geometry.js';
import { GROUND_VS, GROUND_FS } from './shaders/ground.js';
import { VEHICLE_VS, VEHICLE_FS } from './shaders/vehicle.js';
import { SKY_FS, AMBIENT_FS, LIGHT_VOLUME_VS, LIGHT_VOLUME_FS } from './shaders/lighting.js';
import {
  SSAO_FS, BILATERAL_BLUR_FS, SSR_FS, SSR_COMPOSITE_FS, VOLUMETRIC_FS, FOG_FS,
  RAIN_FS, BLOOM_PREFILTER_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, COMPOSITE_FS, FXAA_FS, UPSAMPLE_FS,
} from './shaders/post.js';
import { LIGHT_STRIDE } from './city/builder.js';

const MOON_DIR = vec3.create();
vec3.normalize(MOON_DIR, vec3.create(-0.42, 0.46, -0.78));

export const ATMOSPHERE = {
  zenith: [0.006, 0.010, 0.026],
  horizon: [0.036, 0.030, 0.062],
  cityGlow: [0.115, 0.052, 0.088],
  moonColor: [0.42, 0.52, 0.78],
  moonIntensity: 0.20,
  fogColor: [0.030, 0.028, 0.048],
  fogGlow: [0.130, 0.058, 0.098],
};

export class Renderer {
  constructor(canvas, settings) {
    this.ctx = new GLContext(canvas);
    this.gl = this.ctx.gl;
    this.canvas = canvas;
    this.settings = settings;
    this.shaders = new ShaderLibrary(this.ctx);
    this.quad = new FullscreenQuad(this.ctx);
    this.width = 1;
    this.height = 1;
    this.frame = 0;
    this.targets = {};
    this.bloomChain = [];
    this.volLights = new Float32Array(12 * 4);
    this.volColors = new Float32Array(12 * 4);
    this.lightScratch = new Float32Array(0);
    this.contextLost = false;
    this.onRestored = null;
    this.bindContextEvents();
    this.buildMeshes();
    this.buildShaders();
  }

  bindContextEvents() {
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
    }, false);

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.shaders.cache.clear();
      this.targets = {};
      this.bloomChain = [];
      this.ctx.state.program = null;
      this.ctx.state.vao = null;
      this.ctx.state.framebuffer = null;
      this.ctx.invalidateTextureCache();
      this.buildMeshes();
      this.buildShaders();
      const w = this.width;
      const h = this.height;
      this.width = 0;
      this.height = 0;
      this.resize(w, h);
      if (this.onRestored) this.onRestored();
    }, false);
  }

  buildMeshes() {
    const gl = this.gl;
    const box = createBoxGeometry();
    const quadGeo = createQuadGeometry();
    const sphere = createIcosphere(2);
    const grid = createGroundGrid(56);

    this.sphereScale = sphere.circumscribeScale * 1.02;

    this.buildingMesh = new Mesh(this.ctx, {
      vertices: box.vertices,
      indices: box.indices,
      layout: MESH_LAYOUT,
      instanceLayout: BUILDING_INSTANCE_LAYOUT,
      instanceCapacity: 4 * 1024 * 1024,
    });

    this.signMesh = new Mesh(this.ctx, {
      vertices: quadGeo.vertices,
      indices: quadGeo.indices,
      layout: MESH_LAYOUT,
      instanceLayout: SIGN_INSTANCE_LAYOUT,
      instanceCapacity: 1024 * 1024,
    });

    this.vehicleMesh = new Mesh(this.ctx, {
      vertices: box.vertices,
      indices: box.indices,
      layout: MESH_LAYOUT,
      instanceLayout: VEHICLE_INSTANCE_LAYOUT,
      instanceCapacity: 256 * 1024,
    });

    this.lightMesh = new Mesh(this.ctx, {
      vertices: sphere.vertices,
      indices: sphere.indices,
      vertexCount: sphere.vertexCount,
      layout: SPHERE_LAYOUT,
      instanceLayout: LIGHT_INSTANCE_LAYOUT,
      instanceCapacity: 512 * 1024,
    });

    this.vehicleLightMesh = new Mesh(this.ctx, {
      vertices: sphere.vertices,
      indices: sphere.indices,
      vertexCount: sphere.vertexCount,
      layout: SPHERE_LAYOUT,
      instanceLayout: LIGHT_INSTANCE_LAYOUT,
      instanceCapacity: 128 * 1024,
    });

    this.groundMesh = new Mesh(this.ctx, {
      vertices: grid.vertices,
      indices: grid.indices,
      vertexCount: grid.vertexCount,
      layout: GROUND_LAYOUT,
    });

    void gl;
  }

  buildShaders() {
    const s = this.shaders;
    this.buildingShader = s.get('building', BUILDING_VS, BUILDING_FS);
    this.signShader = s.get('sign', SIGN_VS, SIGN_FS);
    this.groundShader = s.get('ground', GROUND_VS, GROUND_FS);
    this.vehicleShader = s.get('vehicle', VEHICLE_VS, VEHICLE_FS);
    this.skyShader = s.get('sky', FULLSCREEN_VS, SKY_FS);
    this.ambientShader = s.get('ambient', FULLSCREEN_VS, AMBIENT_FS);
    this.lightShader = s.get('lightVolume', LIGHT_VOLUME_VS, LIGHT_VOLUME_FS);
    this.ssaoShader = s.get('ssao', FULLSCREEN_VS, SSAO_FS);
    this.blurShader = s.get('blur', FULLSCREEN_VS, BILATERAL_BLUR_FS);
    this.ssrShader = s.get('ssr', FULLSCREEN_VS, SSR_FS);
    this.ssrCompositeShader = s.get('ssrComposite', FULLSCREEN_VS, SSR_COMPOSITE_FS);
    this.volumetricShader = s.get('volumetric', FULLSCREEN_VS, VOLUMETRIC_FS);
    this.fogShader = s.get('fog', FULLSCREEN_VS, FOG_FS);
    this.rainShader = s.get('rain', FULLSCREEN_VS, RAIN_FS);
    this.bloomPrefilterShader = s.get('bloomPrefilter', FULLSCREEN_VS, BLOOM_PREFILTER_FS);
    this.bloomDownShader = s.get('bloomDown', FULLSCREEN_VS, BLOOM_DOWN_FS);
    this.bloomUpShader = s.get('bloomUp', FULLSCREEN_VS, BLOOM_UP_FS);
    this.compositeShader = s.get('composite', FULLSCREEN_VS, COMPOSITE_FS);
    this.fxaaShader = s.get('fxaa', FULLSCREEN_VS, FXAA_FS);
    this.blitShader = s.get('blit', FULLSCREEN_VS, UPSAMPLE_FS);
  }

  resize(width, height) {
    width = Math.max(2, Math.floor(width));
    height = Math.max(2, Math.floor(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.createTargets();
  }

  createTargets() {
    if (this.gl.isContextLost()) return;
    const gl = this.gl;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const halfW = Math.max(1, w >> 1);
    const halfH = Math.max(1, h >> 1);
    const quarterW = Math.max(1, w >> 2);
    const quarterH = Math.max(1, h >> 2);

    for (const key of Object.keys(this.targets)) this.targets[key].dispose();
    for (const t of this.bloomChain) t.dispose();
    this.targets = {};
    this.bloomChain = [];

    this.targets.gbuffer = new RenderTarget(ctx, {
      label: 'gbuffer',
      width: w,
      height: h,
      color: [
        { internalFormat: gl.RGBA8, filter: gl.NEAREST },
        { internalFormat: gl.RGBA16F, filter: gl.NEAREST },
        { internalFormat: gl.RGBA16F, filter: gl.NEAREST },
      ],
      depth: { sampled: true, internalFormat: gl.DEPTH_COMPONENT32F },
    });

    this.targets.hdr = new RenderTarget(ctx, {
      label: 'hdr',
      width: w,
      height: h,
      color: [{ internalFormat: gl.RGBA16F, filter: gl.LINEAR }],
      depth: { sampled: false, internalFormat: gl.DEPTH_COMPONENT32F },
    });

    this.targets.ao = new RenderTarget(ctx, {
      label: 'ao', width: halfW, height: halfH,
      color: [{ internalFormat: gl.R8, filter: gl.LINEAR }],
    });
    this.targets.aoBlur = new RenderTarget(ctx, {
      label: 'aoBlur', width: halfW, height: halfH,
      color: [{ internalFormat: gl.R8, filter: gl.LINEAR }],
    });

    this.targets.ssr = new RenderTarget(ctx, {
      label: 'ssr', width: halfW, height: halfH,
      color: [{ internalFormat: gl.RGBA16F, filter: gl.LINEAR }],
    });

    this.targets.volumetric = new RenderTarget(ctx, {
      label: 'volumetric', width: quarterW, height: quarterH,
      color: [{ internalFormat: gl.RGBA16F, filter: gl.LINEAR }],
    });
    this.targets.volumetricBlur = new RenderTarget(ctx, {
      label: 'volumetricBlur', width: quarterW, height: quarterH,
      color: [{ internalFormat: gl.RGBA16F, filter: gl.LINEAR }],
    });

    this.targets.ldr = new RenderTarget(ctx, {
      label: 'ldr', width: w, height: h,
      color: [{ internalFormat: gl.RGBA8, filter: gl.LINEAR }],
    });

    const mips = Math.min(this.settings.bloomMips, Math.floor(Math.log2(Math.min(w, h))) - 2);
    let bw = Math.max(1, w >> 1);
    let bh = Math.max(1, h >> 1);
    for (let i = 0; i < Math.max(2, mips); i++) {
      this.bloomChain.push(new RenderTarget(ctx, {
        label: `bloom${i}`, width: bw, height: bh,
        color: [{ internalFormat: gl.R11F_G11F_B10F, filter: gl.LINEAR }],
      }));
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      if (bw <= 2 || bh <= 2) break;
    }

    this.halfSize = [halfW, halfH];
    this.quarterSize = [quarterW, quarterH];

    if (this.onTargetsCreated) this.onTargetsCreated();
  }

  blitSceneDepth() {
    const gl = this.gl;
    const ctx = this.ctx;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.targets.gbuffer.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.targets.hdr.framebuffer);
    gl.blitFramebuffer(
      0, 0, this.width, this.height,
      0, 0, this.width, this.height,
      gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    ctx.state.framebuffer = null;
  }

  applySceneUniforms(shader, camera) {
    shader.set('uViewProj', camera.viewProj);
    shader.set('uInvViewProj', camera.invViewProj);
    shader.set('uView', camera.view);
    shader.set('uProj', camera.proj);
    shader.set('uInvProj', camera.invProj);
    shader.set('uCameraPos', camera.position);
    shader.set('uResolution', [this.width, this.height]);
    shader.set('uInvResolution', [1 / this.width, 1 / this.height]);
    shader.set('uNear', camera.near);
    shader.set('uFar', camera.far);
  }

  applySkyUniforms(shader, time) {
    const s = this.settings;
    shader.set('uZenithColor', ATMOSPHERE.zenith);
    shader.set('uHorizonColor', ATMOSPHERE.horizon);
    shader.set('uCityGlowColor', ATMOSPHERE.cityGlow);
    shader.set('uMoonDir', MOON_DIR);
    shader.set('uMoonColor', ATMOSPHERE.moonColor);
    shader.set('uCloudCoverage', s.cloudCoverage);
    shader.set('uCloudSpeed', 1.4);
    shader.set('uStarIntensity', clamp(1.0 - s.cloudCoverage * 0.9, 0, 1));
    shader.set('uTime', time);
    shader.set('uFlash', this.flash || 0);
  }

  geometryPass(camera, scene, time) {
    const gl = this.gl;
    const ctx = this.ctx;
    const s = this.settings;
    const target = this.targets.gbuffer;

    target.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    ctx.depthTest(true, true, gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    ctx.blend(false);
    ctx.cull(true, gl.BACK);

    if (scene.boxCount > 0) {
      const shader = this.buildingShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uTime', time);
      shader.set('uWetness', s.wetness);
      shader.set('uEmissiveScale', s.emissiveScale);
      this.buildingMesh.draw(scene.boxCount);
    }

    if (scene.vehicleCount > 0) {
      const shader = this.vehicleShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uTime', time);
      shader.set('uEmissiveScale', s.emissiveScale);
      this.vehicleMesh.draw(scene.vehicleCount);
    }

    {
      const shader = this.groundShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uTime', time);
      shader.set('uWetness', s.wetness);
      shader.set('uRainIntensity', s.rain ? s.rainIntensity : 0.25);
      shader.set('uGroundExtent', 3400.0);
      this.groundMesh.draw();
    }

    if (scene.signCount > 0) {
      ctx.cull(false);
      const shader = this.signShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uTime', time);
      shader.set('uEmissiveScale', s.emissiveScale);
      this.signMesh.draw(scene.signCount);
      ctx.cull(true, gl.BACK);
    }
  }

  ssaoPass(camera) {
    const gl = this.gl;
    const ctx = this.ctx;
    const s = this.settings;
    if (s.ssaoSamples <= 0) return false;

    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    const ao = this.targets.ao;
    ao.bind();
    const shader = this.ssaoShader.bind();
    shader.texture('uDepth', this.targets.gbuffer.depthTexture);
    shader.texture('uGNormal', this.targets.gbuffer.textures[1]);
    shader.set('uProj', camera.proj);
    shader.set('uInvProj', camera.invProj);
    shader.set('uView', camera.view);
    shader.set('uResolution', this.halfSize);
    shader.set('uRadius', 1.6);
    shader.set('uStrength', 1.25);
    shader.set('uBias', 0.045);
    shader.set('uSampleCount', s.ssaoSamples);
    shader.set('uFrame', this.frame % 64);
    this.quad.draw();

    const blur = this.blurShader.bind();
    this.targets.aoBlur.bind();
    blur.texture('uSource', ao.textures[0]);
    blur.texture('uDepth', this.targets.gbuffer.depthTexture);
    blur.set('uDirection', [1, 0]);
    blur.set('uInvSize', [1 / this.halfSize[0], 1 / this.halfSize[1]]);
    blur.set('uDepthSigma', 900.0);
    this.quad.draw();

    ao.bind();
    blur.texture('uSource', this.targets.aoBlur.textures[0]);
    blur.set('uDirection', [0, 1]);
    this.quad.draw();

    void gl;
    return true;
  }

  lightingPass(camera, scene, time, useAO) {
    const gl = this.gl;
    const ctx = this.ctx;
    const s = this.settings;
    const hdr = this.targets.hdr;

    hdr.bind();
    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    {
      const shader = this.skyShader.bind();
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uRainIntensity', s.rain ? s.rainIntensity : 0.2);
      this.applySkyUniforms(shader, time);
      this.quad.draw();
    }

    {
      const shader = this.ambientShader.bind();
      shader.texture('uGAlbedo', this.targets.gbuffer.textures[0]);
      shader.texture('uGNormal', this.targets.gbuffer.textures[1]);
      shader.texture('uGEmissive', this.targets.gbuffer.textures[2]);
      shader.texture('uDepth', this.targets.gbuffer.depthTexture);
      shader.texture('uAO', this.targets.ao.textures[0]);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uAmbientScale', s.ambientScale);
      shader.set('uMoonIntensity', ATMOSPHERE.moonIntensity);
      shader.set('uUseAO', useAO ? 1 : 0);
      this.applySkyUniforms(shader, time);
      this.quad.draw();
    }

    if (scene.lightCount > 0 || scene.vehicleLightCount > 0) {
      ctx.depthTest(true, false, gl.GEQUAL);
      ctx.cull(true, gl.FRONT);
      ctx.blend(true, gl.ONE, gl.ONE);

      const shader = this.lightShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uInvResolution', [1 / this.width, 1 / this.height]);
      shader.set('uTime', time);
      shader.set('uLightScale', s.lightScale);
      shader.set('uVolumeScale', this.sphereScale);
      shader.texture('uGAlbedo', this.targets.gbuffer.textures[0]);
      shader.texture('uGNormal', this.targets.gbuffer.textures[1]);
      shader.texture('uDepth', this.targets.gbuffer.depthTexture);

      if (scene.lightCount > 0) this.lightMesh.draw(scene.lightCount);
      if (scene.vehicleLightCount > 0) this.vehicleLightMesh.draw(scene.vehicleLightCount);

      ctx.blend(false);
      ctx.depthTest(false);
      ctx.cull(false);
    }
  }

  ssrPass(camera) {
    const gl = this.gl;
    const ctx = this.ctx;
    const s = this.settings;
    if (s.ssrSteps <= 0) return;

    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    this.targets.ssr.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const shader = this.ssrShader.bind();
    shader.texture('uColor', this.targets.hdr.textures[0]);
    shader.texture('uDepth', this.targets.gbuffer.depthTexture);
    shader.texture('uGNormal', this.targets.gbuffer.textures[1]);
    shader.texture('uGAlbedo', this.targets.gbuffer.textures[0]);
    shader.set('uView', camera.view);
    shader.set('uProj', camera.proj);
    shader.set('uInvProj', camera.invProj);
    shader.set('uInvViewProj', camera.invViewProj);
    shader.set('uCameraPos', camera.position);
    shader.set('uResolution', this.halfSize);
    shader.set('uFrame', this.frame % 64);
    shader.set('uMaxSteps', s.ssrSteps);
    shader.set('uStride', 0.42);
    shader.set('uThickness', 1.1);
    shader.set('uMaxRoughness', 0.42);
    this.quad.draw();

    this.targets.hdr.bind();
    ctx.blend(true, gl.ONE, gl.ONE);
    const composite = this.ssrCompositeShader.bind();
    composite.texture('uReflection', this.targets.ssr.textures[0]);
    composite.texture('uGNormal', this.targets.gbuffer.textures[1]);
    composite.texture('uGAlbedo', this.targets.gbuffer.textures[0]);
    composite.texture('uDepth', this.targets.gbuffer.depthTexture);
    composite.set('uInvViewProj', camera.invViewProj);
    composite.set('uCameraPos', camera.position);
    composite.set('uIntensity', s.ssrIntensity);
    this.quad.draw();
    ctx.blend(false);
  }

  atmospherePass(camera, scene, time) {
    const gl = this.gl;
    const ctx = this.ctx;
    const s = this.settings;

    ctx.depthTest(false);
    ctx.cull(false);

    let useScatter = false;
    if (s.volumetricSteps > 0) {
      useScatter = true;
      this.targets.volumetric.bind();
      ctx.blend(false);
      const shader = this.volumetricShader.bind();
      shader.texture('uDepth', this.targets.gbuffer.depthTexture);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uTime', time);
      shader.set('uFrame', this.frame % 64);
      shader.set('uStepCount', s.volumetricSteps);
      shader.set('uLightCount', scene.volLightCount);
      shader.set('uVolLights', this.volLights);
      shader.set('uVolColors', this.volColors);
      shader.set('uMoonDir', MOON_DIR);
      shader.set('uMoonColor', ATMOSPHERE.moonColor);
      shader.set('uFogColor', ATMOSPHERE.fogColor);
      shader.set('uFogDensity', s.fogDensity * 2.0);
      shader.set('uFogHeight', 110.0);
      shader.set('uScatterStrength', s.volumetricStrength);
      shader.set('uMaxDistance', 460.0);
      this.quad.draw();

      const smooth = this.bloomUpShader.bind();
      smooth.set('uRadius', 1.0);
      for (let i = 0; i < 2; i++) {
        this.targets.volumetricBlur.bind();
        smooth.texture('uSource', this.targets.volumetric.textures[0]);
        smooth.set('uInvSize', [1 / this.quarterSize[0], 1 / this.quarterSize[1]]);
        this.quad.draw();
        this.targets.volumetric.bind();
        smooth.texture('uSource', this.targets.volumetricBlur.textures[0]);
        this.quad.draw();
      }
    }

    this.targets.hdr.bind();
    ctx.blend(true, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const fog = this.fogShader.bind();
    fog.texture('uDepth', this.targets.gbuffer.depthTexture);
    fog.texture('uScatter', this.targets.volumetric.textures[0]);
    fog.set('uInvViewProj', camera.invViewProj);
    fog.set('uCameraPos', camera.position);
    fog.set('uFogColor', ATMOSPHERE.fogColor);
    fog.set('uFogGlow', ATMOSPHERE.fogGlow);
    fog.set('uFogDensity', s.fogDensity);
    fog.set('uFogHeight', 150.0);
    fog.set('uTime', time);
    fog.set('uUseScatter', useScatter ? 1 : 0);
    fog.set('uScatterTexel', [1 / this.quarterSize[0], 1 / this.quarterSize[1]]);
    fog.set('uFogDistance', 2500.0);
    this.applySkyUniforms(fog, time);
    this.quad.draw();

    if (s.rain) {
      ctx.blend(true, gl.ONE, gl.ONE);
      const rain = this.rainShader.bind();
      rain.texture('uDepth', this.targets.gbuffer.depthTexture);
      rain.set('uInvViewProj', camera.invViewProj);
      rain.set('uCameraPos', camera.position);
      rain.set('uCameraDelta', camera.delta);
      rain.set('uForward', camera.forward);
      rain.set('uRight', camera.right);
      rain.set('uTime', time);
      rain.set('uIntensity', s.rainIntensity);
      rain.set('uAspect', this.width / this.height);
      rain.set('uRainColor', [0.52, 0.60, 0.78]);
      this.quad.draw();
    }

    ctx.blend(false);
  }

  bloomPass(sourceTexture, thresholdOverride, mipLimit) {
    const gl = this.gl;
    const ctx = this.ctx;
    const s = this.settings;
    let chain = this.bloomChain;
    if (chain.length === 0) return null;
    if (mipLimit && mipLimit > 1 && mipLimit < chain.length) chain = chain.slice(0, mipLimit);

    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    chain[0].bind();
    const pre = this.bloomPrefilterShader.bind();
    pre.texture('uSource', sourceTexture || this.targets.hdr.textures[0]);
    pre.set('uInvSize', [1 / this.width, 1 / this.height]);
    pre.set('uThreshold', thresholdOverride !== undefined ? thresholdOverride : s.bloomThreshold);
    pre.set('uSoftKnee', 0.6);
    this.quad.draw();

    const down = this.bloomDownShader.bind();
    for (let i = 1; i < chain.length; i++) {
      chain[i].bind();
      down.texture('uSource', chain[i - 1].textures[0]);
      down.set('uInvSize', [1 / chain[i - 1].width, 1 / chain[i - 1].height]);
      this.quad.draw();
    }

    const up = this.bloomUpShader.bind();
    ctx.blend(true, gl.ONE, gl.ONE);
    for (let i = chain.length - 1; i > 0; i--) {
      chain[i - 1].bind();
      up.texture('uSource', chain[i].textures[0]);
      up.set('uInvSize', [1 / chain[i].width, 1 / chain[i].height]);
      up.set('uRadius', 1.25);
      this.quad.draw();
    }
    ctx.blend(false);

    return chain[0];
  }

  compositePass(bloom, time) {
    const ctx = this.ctx;
    const s = this.settings;

    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    const target = s.fxaa ? this.targets.ldr : null;
    if (target) target.bind();
    else {
      ctx.bindFramebuffer(null);
      ctx.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    const shader = this.compositeShader.bind();
    shader.texture('uColor', this.targets.hdr.textures[0]);
    shader.texture('uBloom', bloom ? bloom.textures[0] : this.targets.hdr.textures[0]);
    shader.set('uTime', time);
    shader.set('uExposure', s.exposure);
    shader.set('uBloomIntensity', bloom ? s.bloomIntensity : 0);
    shader.set('uChromatic', s.chromatic * 0.06);
    shader.set('uVignette', s.vignette);
    shader.set('uGrain', s.grain);
    shader.set('uScanline', s.scanline);
    shader.set('uSaturation', s.saturation);
    shader.set('uContrast', s.contrast);
    shader.set('uLift', [0.004, 0.002, 0.010]);
    shader.set('uGain', [0.99, 0.985, 1.02]);
    shader.set('uResolution', [this.width, this.height]);
    this.quad.draw();

    if (s.fxaa) {
      ctx.bindFramebuffer(null);
      ctx.viewport(0, 0, this.canvas.width, this.canvas.height);
      const fxaa = this.fxaaShader.bind();
      fxaa.texture('uSource', this.targets.ldr.textures[0]);
      fxaa.set('uInvResolution', [1 / this.width, 1 / this.height]);
      this.quad.draw();
    }
  }

  prepareVolumetricLights(scene, cameraPos) {
    const s = this.settings;
    const max = Math.min(12, s.volumetricLights);
    if (max <= 0) {
      scene.volLightCount = 0;
      return;
    }
    const data = scene.lightData;
    const count = scene.lightCount;
    const best = [];
    for (let i = 0; i < count; i++) {
      const o = i * LIGHT_STRIDE;
      const dx = data[o] - cameraPos[0];
      const dy = data[o + 1] - cameraPos[1];
      const dz = data[o + 2] - cameraPos[2];
      const distSq = dx * dx + dy * dy + dz * dz;
      const score = (data[o + 7] * data[o + 3]) / (distSq + 40);
      if (best.length < max) {
        best.push({ i, score });
        if (best.length === max) best.sort((a, b) => a.score - b.score);
      } else if (score > best[0].score) {
        best[0] = { i, score };
        best.sort((a, b) => a.score - b.score);
      }
    }
    for (let k = 0; k < best.length; k++) {
      const o = best[k].i * LIGHT_STRIDE;
      this.volLights[k * 4] = data[o];
      this.volLights[k * 4 + 1] = data[o + 1];
      this.volLights[k * 4 + 2] = data[o + 2];
      this.volLights[k * 4 + 3] = data[o + 3];
      this.volColors[k * 4] = data[o + 4];
      this.volColors[k * 4 + 1] = data[o + 5];
      this.volColors[k * 4 + 2] = data[o + 6];
      this.volColors[k * 4 + 3] = data[o + 7];
    }
    scene.volLightCount = best.length;
  }

  blit(sourceTexture) {
    this.ctx.depthTest(false);
    this.ctx.blend(false);
    this.ctx.cull(false);
    const shader = this.blitShader.bind();
    shader.texture('uSource', sourceTexture);
    this.quad.draw();
  }

  render(camera, scene, time) {
    if (this.contextLost || this.gl.isContextLost()) {
      this.contextLost = true;
      return;
    }
    this.frame++;
    this.flash = scene.flash || 0;
    this.geometryPass(camera, scene, time);
    this.blitSceneDepth();
    const useAO = this.ssaoPass(camera);
    this.lightingPass(camera, scene, time, useAO);
    this.ssrPass(camera);
    this.prepareVolumetricLights(scene, camera.position);
    this.atmospherePass(camera, scene, time);
    const bloom = this.bloomPass();
    this.compositePass(bloom, time);
  }
}
