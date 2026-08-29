import { RenderTarget } from '../core/framebuffer.js';
import {
  Mesh, MESH_LAYOUT, SPHERE_LAYOUT, LIGHT_INSTANCE_LAYOUT,
  CINE_INSTANCE_LAYOUT, PARTICLE_INSTANCE_LAYOUT, TRAIL_LAYOUT, SHATTER_LAYOUT,
  createCenteredBox, createCenteredQuad, createUvSphere, createCapsule, createCone,
  createCylinder, createTorus, createShard, createRingSegment, createShatterLattice,
  createIcosphere,
} from '../core/mesh.js';
import { FULLSCREEN_VS } from '../shaders/common.js';
import {
  CINE_PRIM_VS, CINE_PRIM_FS, CINE_SKY_FS, CINE_SKY_LIB, CINE_AMBIENT_FS,
  CINE_PARTICLE_VS, CINE_PARTICLE_FS, CINE_TRAIL_VS, CINE_TRAIL_FS,
  CINE_BEAM_VS, CINE_BEAM_FS,
} from '../shaders/cinematic.js';
import {
  CINE_DOF_FS, CINE_DOF_COMPOSITE_FS, CINE_MOTION_BLUR_FS, CINE_RADIAL_FS,
  CINE_SHATTER_VS, CINE_SHATTER_FS, CINE_COMPOSITE_FS, CINE_TRANSITION_FS,
  CINE_TEXT_FS, CINE_FOG_FS,
} from '../shaders/cinepost.js';
import { vec3 } from '../core/math.js';

export const PRIM_GROUPS = [
  { name: 'box', double: false },
  { name: 'quad', double: true },
  { name: 'sphere', double: false },
  { name: 'capsule', double: false },
  { name: 'cone', double: false },
  { name: 'cylinder', double: false },
  { name: 'torus', double: false },
  { name: 'shard0', double: true },
  { name: 'shard1', double: true },
  { name: 'shard2', double: true },
  { name: 'shard3', double: true },
  { name: 'ring', double: true },
];

export const BEAM_GROUPS = ['cone', 'cylinder'];

export class CinematicRenderer {
  constructor(base) {
    this.base = base;
    this.ctx = base.ctx;
    this.gl = base.gl;
    this.targets = {};
    this.meshes = {};
    this.beamMeshes = {};
    this.frame = 0;
    this.holdValid = false;
    this.textTexture = null;
    this.textWidth = 0;
    this.textHeight = 0;
    this.volScene = { lightData: new Float32Array(0), lightCount: 0, volLightCount: 0 };

    this.build();
    base.onTargetsCreated = () => this.createTargets();
    if (base.width > 1) this.createTargets();
  }

  build() {
    this.buildMeshes();
    this.buildShaders();
    this.buildTextTexture();
  }

  buildMeshes() {
    const ctx = this.ctx;
    const geo = {
      box: createCenteredBox(),
      quad: createCenteredQuad(),
      sphere: createUvSphere(22, 15),
      capsule: createCapsule(14, 6),
      cone: createCone(22),
      cylinder: createCylinder(22),
      torus: createTorus(28, 12, 0.16),
      shard0: createShard(11),
      shard1: createShard(29),
      shard2: createShard(53),
      shard3: createShard(97),
      ring: createRingSegment(0.0, 1.0, Math.PI / 8, 10),
    };

    for (const group of PRIM_GROUPS) {
      const g = geo[group.name];
      this.meshes[group.name] = new Mesh(ctx, {
        vertices: g.vertices,
        indices: g.indices,
        vertexCount: g.vertexCount,
        layout: MESH_LAYOUT,
        instanceLayout: CINE_INSTANCE_LAYOUT,
        instanceCapacity: 64 * 1024,
      });
    }

    this.beamMeshes.cone = new Mesh(ctx, {
      vertices: geo.cone.vertices,
      indices: geo.cone.indices,
      vertexCount: geo.cone.vertexCount,
      layout: MESH_LAYOUT,
      instanceLayout: CINE_INSTANCE_LAYOUT,
      instanceCapacity: 16 * 1024,
    });
    this.beamMeshes.cylinder = new Mesh(ctx, {
      vertices: geo.cylinder.vertices,
      indices: geo.cylinder.indices,
      vertexCount: geo.cylinder.vertexCount,
      layout: MESH_LAYOUT,
      instanceLayout: CINE_INSTANCE_LAYOUT,
      instanceCapacity: 16 * 1024,
    });

    const quad = createCenteredQuad();
    this.particleMesh = new Mesh(ctx, {
      vertices: quad.vertices,
      indices: quad.indices,
      vertexCount: quad.vertexCount,
      layout: MESH_LAYOUT,
      instanceLayout: PARTICLE_INSTANCE_LAYOUT,
      instanceCapacity: 3 * 1024 * 1024,
    });

    this.trailMesh = new Mesh(ctx, {
      vertices: new Float32Array(9 * 6 * 4096),
      vertexCount: 0,
      layout: TRAIL_LAYOUT,
      dynamic: true,
    });
    this.trailCapacity = 6 * 4096;

    const sphere = createIcosphere(2);
    this.lightMesh = new Mesh(ctx, {
      vertices: sphere.vertices,
      indices: sphere.indices,
      vertexCount: sphere.vertexCount,
      layout: SPHERE_LAYOUT,
      instanceLayout: LIGHT_INSTANCE_LAYOUT,
      instanceCapacity: 128 * 1024,
    });
    this.lightVolumeScale = sphere.circumscribeScale * 1.02;

    const lattice = createShatterLattice(10, 28, 7);
    this.shatterMesh = new Mesh(ctx, {
      vertices: lattice.vertices,
      indices: lattice.indices,
      vertexCount: lattice.vertexCount,
      layout: SHATTER_LAYOUT,
    });
    this.shatterShardCount = lattice.shardCount;
  }

  buildShaders() {
    const s = this.base.shaders;
    this.primShader = s.get('cinePrim', CINE_PRIM_VS, CINE_PRIM_FS);
    this.skyShader = s.get('cineSky', FULLSCREEN_VS, CINE_SKY_FS);
    this.ambientShader = s.get('cineAmbient', FULLSCREEN_VS, CINE_AMBIENT_FS);
    this.particleShader = s.get('cineParticle', CINE_PARTICLE_VS, CINE_PARTICLE_FS);
    this.trailShader = s.get('cineTrail', CINE_TRAIL_VS, CINE_TRAIL_FS);
    this.beamShader = s.get('cineBeam', CINE_BEAM_VS, CINE_BEAM_FS);
    this.dofShader = s.get('cineDof', FULLSCREEN_VS, CINE_DOF_FS);
    this.dofCompositeShader = s.get('cineDofComposite', FULLSCREEN_VS, CINE_DOF_COMPOSITE_FS);
    this.motionShader = s.get('cineMotion', FULLSCREEN_VS, CINE_MOTION_BLUR_FS);
    this.radialShader = s.get('cineRadial', FULLSCREEN_VS, CINE_RADIAL_FS);
    this.shatterShader = s.get('cineShatter', CINE_SHATTER_VS, CINE_SHATTER_FS);
    this.compositeShader = s.get('cineComposite', FULLSCREEN_VS, CINE_COMPOSITE_FS);
    this.transitionShader = s.get('cineTransition', FULLSCREEN_VS, CINE_TRANSITION_FS);
    this.textShader = s.get('cineText', FULLSCREEN_VS, CINE_TEXT_FS);
    this.fogShader = s.get('cineFog', FULLSCREEN_VS, CINE_FOG_FS(CINE_SKY_LIB));
  }

  buildTextTexture() {
    const gl = this.gl;
    this.textTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.ctx.invalidateTextureCache();
  }

  uploadText(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.textWidth = canvas.width;
    this.textHeight = canvas.height;
    this.ctx.invalidateTextureCache();
  }

  createTargets() {
    const gl = this.gl;
    const ctx = this.ctx;
    const base = this.base;
    if (gl.isContextLost()) return;
    const w = base.width;
    const h = base.height;
    if (w < 2 || h < 2) return;

    for (const key of Object.keys(this.targets)) this.targets[key].dispose();
    this.targets = {};

    this.targets.hdrB = new RenderTarget(ctx, {
      label: 'cineHdrB', width: w, height: h,
      color: [{ internalFormat: gl.RGBA16F, filter: gl.LINEAR }],
    });
    this.targets.dof = new RenderTarget(ctx, {
      label: 'cineDof', width: Math.max(1, w >> 1), height: Math.max(1, h >> 1),
      color: [{ internalFormat: gl.RGBA16F, filter: gl.LINEAR }],
    });
    this.targets.ldrB = new RenderTarget(ctx, {
      label: 'cineLdrB', width: w, height: h,
      color: [{ internalFormat: gl.RGBA8, filter: gl.LINEAR }],
    });
    this.targets.hold = new RenderTarget(ctx, {
      label: 'cineHold', width: w, height: h,
      color: [{ internalFormat: gl.RGBA8, filter: gl.LINEAR }],
    });
    this.dofSize = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
    this.holdValid = false;
  }

  applySkyUniforms(shader, env, time) {
    shader.set('uSkyZenith', env.skyZenith);
    shader.set('uSkyHorizon', env.skyHorizon);
    shader.set('uSkyGround', env.skyGround);
    shader.set('uSkyGlow', env.skyGlow);
    shader.set('uSunDir', env.sunDir);
    shader.set('uSunColor', env.sunColor);
    shader.set('uSunSize', env.sunSize);
    shader.set('uSunIntensity', env.sunIntensity);
    shader.set('uNebula', env.nebula);
    shader.set('uStars', env.stars);
    shader.set('uSkyFlash', env.skyFlash);
    shader.set('uFlashColor', env.flashColor);
    shader.set('uSkyTime', time);
    shader.set('uHorizonSharp', env.horizonSharp);
  }

  geometryPass(camera, cine, time) {
    const gl = this.gl;
    const ctx = this.ctx;
    const target = this.base.targets.gbuffer;

    target.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    ctx.depthTest(true, true, gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    ctx.blend(false);
    ctx.cull(true, gl.BACK);

    const shader = this.primShader.bind();
    shader.set('uViewProj', camera.viewProj);
    shader.set('uCameraPos', camera.position);
    shader.set('uTime', time);
    shader.set('uEmissiveScale', cine.env.emissiveScale);
    shader.set('uDissolveEdge', cine.env.dissolveEdge);
    shader.set('uDissolveColor', cine.env.dissolveColor);
    shader.set('uEnergy', cine.env.energy);

    for (const group of PRIM_GROUPS) {
      const batch = cine.prims[group.name];
      if (!batch || batch.count === 0) continue;
      const mesh = this.meshes[group.name];
      mesh.uploadInstances(batch.view(), batch.count);
      if (group.double) ctx.cull(false);
      else ctx.cull(true, gl.BACK);
      mesh.draw(batch.count);
    }
    ctx.cull(true, gl.BACK);
  }

  lightingPass(camera, cine, time, useAO) {
    const gl = this.gl;
    const ctx = this.ctx;
    const hdr = this.base.targets.hdr;
    const env = cine.env;

    hdr.bind();
    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    {
      const shader = this.skyShader.bind();
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      this.applySkyUniforms(shader, env, time);
      this.base.quad.draw();
    }

    {
      const shader = this.ambientShader.bind();
      shader.texture('uGAlbedo', this.base.targets.gbuffer.textures[0]);
      shader.texture('uGNormal', this.base.targets.gbuffer.textures[1]);
      shader.texture('uGEmissive', this.base.targets.gbuffer.textures[2]);
      shader.texture('uDepth', this.base.targets.gbuffer.depthTexture);
      shader.texture('uAO', this.base.targets.ao.textures[0]);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uAmbientScale', env.ambientScale);
      shader.set('uUseAO', useAO ? 1 : 0);
      shader.set('uKeyDir', env.keyDir);
      shader.set('uKeyColor', env.keyColor);
      shader.set('uKeyIntensity', env.keyIntensity);
      shader.set('uFillDir', env.fillDir);
      shader.set('uFillColor', env.fillColor);
      shader.set('uFillIntensity', env.fillIntensity);
      shader.set('uRimColor', env.rimColor);
      shader.set('uRimIntensity', env.rimIntensity);
      shader.set('uRimPower', env.rimPower);
      shader.set('uNear', camera.near);
      shader.set('uFar', camera.far);
      shader.set('uInvResolution', [1 / this.base.width, 1 / this.base.height]);
      this.applySkyUniforms(shader, env, time);
      this.base.quad.draw();
    }

    if (cine.lights.count > 0) {
      ctx.depthTest(true, false, gl.GEQUAL);
      ctx.cull(true, gl.FRONT);
      ctx.blend(true, gl.ONE, gl.ONE);
      const shader = this.base.lightShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uInvResolution', [1 / this.base.width, 1 / this.base.height]);
      shader.set('uTime', time);
      shader.set('uLightScale', env.lightScale);
      shader.set('uVolumeScale', this.lightVolumeScale);
      shader.texture('uGAlbedo', this.base.targets.gbuffer.textures[0]);
      shader.texture('uGNormal', this.base.targets.gbuffer.textures[1]);
      shader.texture('uDepth', this.base.targets.gbuffer.depthTexture);
      this.lightMesh.uploadInstances(cine.lights.view(), cine.lights.count);
      this.lightMesh.draw(cine.lights.count);
      ctx.blend(false);
      ctx.depthTest(false);
      ctx.cull(false);
    }
  }

  forwardPass(camera, cine, time) {
    const gl = this.gl;
    const ctx = this.ctx;
    const hdr = this.base.targets.hdr;
    const invRes = [1 / this.base.width, 1 / this.base.height];

    const hasBeams = cine.beams.cone.count > 0 || cine.beams.cylinder.count > 0;
    const hasTrails = cine.trails.count > 0;
    const hasParticles = cine.particles.count > 0;
    if (!hasBeams && !hasTrails && !hasParticles) return;

    hdr.bind();
    ctx.depthTest(true, false, gl.LEQUAL);
    ctx.blend(true, gl.ONE, gl.ONE);

    if (hasBeams) {
      ctx.cull(false);
      const shader = this.beamShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uInvResolution', invRes);
      shader.set('uTime', time);
      shader.set('uIntensityScale', cine.env.beamScale);
      shader.texture('uDepth', this.base.targets.gbuffer.depthTexture);
      for (const name of BEAM_GROUPS) {
        const batch = cine.beams[name];
        if (batch.count === 0) continue;
        const mesh = this.beamMeshes[name];
        mesh.uploadInstances(batch.view(), batch.count);
        mesh.draw(batch.count);
      }
    }

    if (hasTrails) {
      ctx.cull(false);
      const shader = this.trailShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uInvResolution', invRes);
      shader.set('uIntensityScale', cine.env.trailScale);
      shader.texture('uDepth', this.base.targets.gbuffer.depthTexture);
      const verts = Math.min(cine.trails.count, this.trailCapacity);
      this.trailMesh.uploadVertices(cine.trails.view(verts), verts);
      this.trailMesh.draw();
    }

    if (hasParticles) {
      ctx.cull(false);
      const right = camera.right;
      const up = vec3.create();
      vec3.cross(up, right, camera.forward);
      vec3.normalize(up, up);
      const shader = this.particleShader.bind();
      shader.set('uViewProj', camera.viewProj);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraRight', right);
      shader.set('uCameraUp', up);
      shader.set('uCameraPos', camera.position);
      shader.set('uInvResolution', invRes);
      shader.set('uTime', time);
      shader.set('uSizeScale', cine.env.particleSize);
      shader.set('uIntensityScale', cine.env.particleScale);
      shader.texture('uDepth', this.base.targets.gbuffer.depthTexture);
      this.particleMesh.uploadInstances(cine.particles.view(), cine.particles.count);
      this.particleMesh.draw(cine.particles.count);
    }

    ctx.blend(false);
    ctx.depthTest(false);
    ctx.cull(false);
  }

  atmospherePass(camera, cine, time) {
    const gl = this.gl;
    const ctx = this.ctx;
    const base = this.base;
    const s = base.settings;
    const env = cine.env;

    ctx.depthTest(false);
    ctx.cull(false);

    let useScatter = false;
    const steps = Math.round(s.volumetricSteps * env.scatterSteps);
    if (steps > 0 && env.scatterStrength > 0.001) {
      useScatter = true;
      this.volScene.lightData = cine.lights.data;
      this.volScene.lightCount = cine.lights.count;
      base.prepareVolumetricLights(this.volScene, camera.position);

      for (let i = 0; i < this.volScene.volLightCount; i++) {
        base.volColors[i * 4 + 3] *= env.scatterLightScale;
      }

      base.targets.volumetric.bind();
      ctx.blend(false);
      const shader = base.volumetricShader.bind();
      shader.texture('uDepth', base.targets.gbuffer.depthTexture);
      shader.set('uInvViewProj', camera.invViewProj);
      shader.set('uCameraPos', camera.position);
      shader.set('uTime', time);
      shader.set('uFrame', this.frame % 64);
      shader.set('uStepCount', steps);
      shader.set('uLightCount', this.volScene.volLightCount);
      shader.set('uVolLights', base.volLights);
      shader.set('uVolColors', base.volColors);
      shader.set('uMoonDir', env.keyDir);
      shader.set('uMoonColor', env.keyColor);
      shader.set('uFogColor', env.fogColor);
      shader.set('uFogDensity', env.fogDensity * 2.2);
      shader.set('uFogHeight', env.fogHeight);
      shader.set('uScatterStrength', env.scatterStrength);
      shader.set('uMaxDistance', env.scatterDistance);
      base.quad.draw();

      const smooth = base.bloomUpShader.bind();
      smooth.set('uRadius', 1.0);
      for (let i = 0; i < 2; i++) {
        base.targets.volumetricBlur.bind();
        smooth.texture('uSource', base.targets.volumetric.textures[0]);
        smooth.set('uInvSize', [1 / base.quarterSize[0], 1 / base.quarterSize[1]]);
        base.quad.draw();
        base.targets.volumetric.bind();
        smooth.texture('uSource', base.targets.volumetricBlur.textures[0]);
        base.quad.draw();
      }
    }

    base.targets.hdr.bind();
    ctx.blend(true, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const fog = this.fogShader.bind();
    fog.texture('uDepth', base.targets.gbuffer.depthTexture);
    fog.texture('uScatter', base.targets.volumetric.textures[0]);
    fog.set('uInvViewProj', camera.invViewProj);
    fog.set('uCameraPos', camera.position);
    fog.set('uFogColor', env.fogColor);
    fog.set('uFogGlow', env.fogGlow);
    fog.set('uFogDensity', env.fogDensity);
    fog.set('uFogHeight', env.fogHeight);
    fog.set('uFogDistance', env.fogDistance);
    fog.set('uFogFloor', env.fogFloor);
    fog.set('uSkyFog', env.fogSky);
    fog.set('uUseScatter', useScatter ? 1 : 0);
    fog.set('uScatterTexel', [1 / base.quarterSize[0], 1 / base.quarterSize[1]]);
    this.applySkyUniforms(fog, env, time);
    base.quad.draw();
    ctx.blend(false);
  }

  dofPass(camera, cine) {
    const post = cine.post;
    const base = this.base;
    const ctx = this.ctx;
    if (post.dofStrength <= 0.002 || post.dofSamples <= 0) return base.targets.hdr.textures[0];

    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    this.targets.dof.bind();
    const gather = this.dofShader.bind();
    gather.texture('uColor', base.targets.hdr.textures[0]);
    gather.texture('uDepth', base.targets.gbuffer.depthTexture);
    gather.set('uInvSize', [1 / this.dofSize[0], 1 / this.dofSize[1]]);
    gather.set('uNear', camera.near);
    gather.set('uFar', camera.far);
    gather.set('uFocusDistance', post.focusDistance);
    gather.set('uFocusRange', post.focusRange);
    gather.set('uMaxCoc', post.dofRadius);
    gather.set('uSamples', post.dofSamples);
    gather.set('uFrame', this.frame % 64);
    gather.set('uAspect', base.width / base.height);
    base.quad.draw();

    this.targets.hdrB.bind();
    const composite = this.dofCompositeShader.bind();
    composite.texture('uSharp', base.targets.hdr.textures[0]);
    composite.texture('uBlur', this.targets.dof.textures[0]);
    composite.texture('uDepth', base.targets.gbuffer.depthTexture);
    composite.set('uNear', camera.near);
    composite.set('uFar', camera.far);
    composite.set('uFocusDistance', post.focusDistance);
    composite.set('uFocusRange', post.focusRange);
    composite.set('uMaxCoc', post.dofRadius);
    composite.set('uStrength', post.dofStrength);
    base.quad.draw();

    return this.targets.hdrB.textures[0];
  }

  motionBlurPass(camera, cine, source) {
    const post = cine.post;
    const base = this.base;
    const ctx = this.ctx;
    if (post.motionBlur <= 0.002 || post.motionSamples <= 1) return source;

    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    const dest = source === base.targets.hdr.textures[0] ? this.targets.hdrB : base.targets.hdr;
    dest.bind();
    const shader = this.motionShader.bind();
    shader.texture('uColor', source);
    shader.texture('uDepth', base.targets.gbuffer.depthTexture);
    shader.set('uInvViewProj', camera.invViewProj);
    shader.set('uPrevViewProj', camera.prevViewProj);
    shader.set('uStrength', post.motionBlur);
    shader.set('uMaxVelocity', post.motionMax);
    shader.set('uSamples', post.motionSamples);
    shader.set('uFrame', this.frame % 64);
    base.quad.draw();
    return dest.textures[0];
  }

  compositePass(cine, source, bloom, time, destination) {
    const base = this.base;
    const ctx = this.ctx;
    const post = cine.post;

    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);
    destination.bind();

    const shader = this.compositeShader.bind();
    shader.texture('uColor', source);
    shader.texture('uBloom', bloom ? bloom.textures[0] : source);
    shader.set('uTime', time);
    shader.set('uExposure', post.exposure);
    shader.set('uBloomIntensity', bloom ? post.bloom : 0);
    shader.set('uChromatic', post.chromatic * 0.06);
    shader.set('uVignette', post.vignette);
    shader.set('uVignetteSoft', post.vignetteSoft);
    shader.set('uGrain', post.grain);
    shader.set('uSaturation', post.saturation);
    shader.set('uContrast', post.contrast);
    shader.set('uLift', post.lift);
    shader.set('uGain', post.gain);
    shader.set('uTint', post.tint);
    shader.set('uResolution', [base.width, base.height]);
    shader.set('uFlash', post.flash);
    shader.set('uFlashColor', post.flashColor);
    shader.set('uLetterbox', post.letterbox);
    shader.set('uFadeAmount', post.fade);
    shader.set('uFadeColor', post.fadeColor);
    shader.set('uBleach', post.bleach);
    shader.set('uHalation', post.halation);
    shader.set('uGateWeave', post.gateWeave);
    shader.set('uAspect', base.width / base.height);
    base.quad.draw();
  }

  radialPass(cine, sourceTarget, destTarget, time) {
    const post = cine.post;
    const base = this.base;
    if (post.radialBlur <= 0.0005 && post.speedLines <= 0.0005) return sourceTarget;
    destTarget.bind();
    const shader = this.radialShader.bind();
    shader.texture('uSource', sourceTarget.textures[0]);
    shader.set('uCentre', post.radialCentre);
    shader.set('uBlurAmount', post.radialBlur);
    shader.set('uLineAmount', post.speedLines);
    shader.set('uLineSpeed', post.speedLineRate);
    shader.set('uTime', time);
    shader.set('uAspect', base.width / base.height);
    shader.set('uLineColor', post.speedLineColor);
    shader.set('uSamples', post.radialSamples);
    base.quad.draw();
    return destTarget;
  }

  shatterPass(cine, sourceTarget, destTarget, time) {
    const gl = this.gl;
    const ctx = this.ctx;
    const base = this.base;
    const post = cine.post;
    if (post.shatter <= 0.0001 || !this.holdValid) return sourceTarget;

    destTarget.bind();
    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    base.blit(sourceTarget.textures[0]);

    ctx.blend(true, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    ctx.cull(false);
    const shader = this.shatterShader.bind();
    shader.texture('uFrame', this.targets.hold.textures[0]);
    shader.set('uProgress', post.shatter);
    shader.set('uImpact', post.shatterCentre);
    shader.set('uAspect', base.width / base.height);
    shader.set('uSpread', post.shatterSpread);
    shader.set('uSpin', post.shatterSpin);
    shader.set('uApproach', post.shatterApproach);
    shader.set('uEdgeColor', post.shatterEdgeColor);
    shader.set('uEdgeIntensity', post.shatterEdge);
    shader.set('uRefraction', post.shatterRefraction);
    shader.set('uTime', time);
    this.shatterMesh.draw();
    ctx.blend(false);
    return destTarget;
  }

  transitionPass(cine, sourceTarget, destTarget, time) {
    const post = cine.post;
    const base = this.base;
    if (post.transitionMode < 0 || !this.holdValid) return sourceTarget;
    destTarget.bind();
    const shader = this.transitionShader.bind();
    shader.texture('uSource', sourceTarget.textures[0]);
    shader.texture('uPrevious', this.targets.hold.textures[0]);
    shader.set('uMode', post.transitionMode);
    shader.set('uProgress', post.transitionProgress);
    shader.set('uCentre', post.transitionCentre);
    shader.set('uColor', post.transitionColor);
    shader.set('uAspect', base.width / base.height);
    shader.set('uSoftness', post.transitionSoftness);
    shader.set('uAngle', post.transitionAngle);
    shader.set('uTime', time);
    base.quad.draw();
    return destTarget;
  }

  textPass(cine, sourceTarget, destTarget, time) {
    const post = cine.post;
    const base = this.base;
    if (post.textOpacity <= 0.002) return sourceTarget;
    destTarget.bind();
    const shader = this.textShader.bind();
    shader.texture('uSource', sourceTarget.textures[0]);
    shader.texture('uText', this.textTexture);
    shader.set('uRect', post.textRect);
    shader.set('uColor', post.textColor);
    shader.set('uOpacity', post.textOpacity);
    shader.set('uGlow', post.textGlow);
    shader.set('uScatter', post.textScatter);
    shader.set('uTime', time);
    base.quad.draw();
    return destTarget;
  }

  captureHold(sourceTarget) {
    const ctx = this.ctx;
    this.targets.hold.bind();
    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);
    this.base.blit(sourceTarget.textures[0]);
    this.holdValid = true;
  }

  render(camera, cine, time) {
    const base = this.base;
    const ctx = this.ctx;
    const gl = this.gl;
    if (base.contextLost || gl.isContextLost()) {
      base.contextLost = true;
      return;
    }
    if (!this.targets.hdrB) this.createTargets();
    if (!this.targets.hdrB) return;

    this.frame++;
    base.flash = 0;

    this.geometryPass(camera, cine, time);
    base.blitSceneDepth();
    const useAO = cine.post.ssao ? base.ssaoPass(camera) : false;
    this.lightingPass(camera, cine, time, useAO);
    if (cine.post.ssr) base.ssrPass(camera);
    this.forwardPass(camera, cine, time);
    this.atmospherePass(camera, cine, time);

    let hdrSource = this.dofPass(camera, cine);
    hdrSource = this.motionBlurPass(camera, cine, hdrSource);

    const bloom = cine.post.bloom > 0.0005
      ? base.bloomPass(hdrSource, cine.post.bloomThreshold, cine.post.bloomMips)
      : null;

    let current = base.targets.ldr;
    this.compositePass(cine, hdrSource, bloom, time, current);

    const other = () => (current === base.targets.ldr ? this.targets.ldrB : base.targets.ldr);

    let next = this.radialPass(cine, current, other(), time);
    current = next;

    if (cine.post.captureHold) this.captureHold(current);

    next = this.shatterPass(cine, current, other(), time);
    current = next;
    next = this.transitionPass(cine, current, other(), time);
    current = next;
    next = this.textPass(cine, current, other(), time);
    current = next;

    ctx.bindFramebuffer(null);
    ctx.viewport(0, 0, base.canvas.width, base.canvas.height);
    ctx.depthTest(false);
    ctx.blend(false);
    ctx.cull(false);

    if (base.settings.fxaa) {
      const fxaa = base.fxaaShader.bind();
      fxaa.texture('uSource', current.textures[0]);
      fxaa.set('uInvResolution', [1 / base.width, 1 / base.height]);
      base.quad.draw();
    } else {
      base.blit(current.textures[0]);
    }
  }
}
