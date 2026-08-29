import { HASH_GLSL, PACKING_GLSL, BRDF_GLSL } from './common.js';

export const CINE_KIND = {
  MATTE: 0,
  GLASS: 1,
  ENERGY: 2,
  SILHOUETTE: 3,
  MEMORY: 4,
  SHARD: 5,
  STONE: 6,
  STATION: 7,
  BLADE: 8,
  VOIDGLASS: 9,
  HOLO: 10,
  TUBE: 11,
};

const QUAT_GLSL = `
vec3 rotateQuat(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
`;

export const CINE_PRIM_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTangent;
layout(location = 3) in vec4 iPosKind;
layout(location = 4) in vec4 iRotation;
layout(location = 5) in vec4 iScaleSeed;
layout(location = 6) in vec4 iAlbedo;
layout(location = 7) in vec4 iEmissive;
layout(location = 8) in vec4 iParams;

uniform mat4 uViewProj;
uniform vec3 uCameraPos;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
out vec3 vObjNormal;
flat out vec4 vAlbedo;
flat out vec4 vEmissive;
flat out vec4 vParams;
flat out vec4 vScaleSeed;
flat out vec3 vOrigin;
flat out float vKind;

${QUAT_GLSL}

void main() {
  vec3 scale = max(iScaleSeed.xyz, vec3(1e-4));
  vec3 local = aPosition * scale;
  vec3 rotated = rotateQuat(iRotation, local);
  vec3 world = iPosKind.xyz + rotated;

  vec3 n = aNormal / scale;
  vec3 worldNormal = normalize(rotateQuat(iRotation, n));

  vWorld = world;
  vNormal = worldNormal;
  vLocal = aPosition;
  vObjNormal = aNormal;
  vAlbedo = iAlbedo;
  vEmissive = iEmissive;
  vParams = iParams;
  vScaleSeed = iScaleSeed;
  vOrigin = iPosKind.xyz;
  vKind = iPosKind.w;

  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const CINE_PRIM_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
in vec3 vObjNormal;
flat in vec4 vAlbedo;
flat in vec4 vEmissive;
flat in vec4 vParams;
flat in vec4 vScaleSeed;
flat in vec3 vOrigin;
flat in float vKind;

uniform float uTime;
uniform vec3 uCameraPos;
uniform float uEmissiveScale;
uniform float uDissolveEdge;
uniform vec3 uDissolveColor;
uniform float uEnergy;

layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oEmissive;

float ring(float x, float centre, float width) {
  return 1.0 - smoothstep(0.0, width, abs(x - centre));
}

float pulse(float x, float lo, float hi, float soft) {
  return smoothstep(lo - soft, lo + soft, x) * smoothstep(hi + soft, hi - soft, x);
}

float petals(float angle, float radius, float count, float seed) {
  float a = angle * count;
  float wave = cos(a) * 0.5 + 0.5;
  float lobe = pow(wave, mix(1.2, 5.0, hash11(seed)));
  return lobe * smoothstep(0.0, 0.25, radius);
}

float leadLine(float v, float pitch, float width) {
  float f = abs(fract(v / pitch) - 0.5) * pitch;
  return 1.0 - smoothstep(width, width * 2.4, f);
}

void main() {
  int kind = int(vKind + 0.5);
  float seed = vScaleSeed.w;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorld);
  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 4.0);

  float glow = vParams.x;
  float dissolve = vParams.y;
  float opacity = vParams.z;
  float pattern = vParams.w;

  vec3 albedo = vAlbedo.rgb;
  float metallic = vAlbedo.a;
  float roughness = vEmissive.a;
  vec3 emissive = vec3(0.0);
  float ao = 1.0;

  if (kind == 0) {

    float grain = fbm3(vWorld * 0.9 + seed, 3);
    albedo *= 0.82 + 0.36 * grain;
    emissive = vEmissive.rgb * glow;
  } else if (kind == 1) {

    vec2 uv = vLocal.xy * 2.0;
    float lead = leadLine(uv.x, 0.42, 0.028) + leadLine(uv.y, 0.42, 0.028);
    lead = clamp(lead, 0.0, 1.0);
    float cellId = floor(uv.x / 0.42) * 31.0 + floor(uv.y / 0.42) * 7.0;
    float tint = hash11(cellId + seed);
    vec3 col = mix(vAlbedo.rgb, vAlbedo.rgb.bgr, step(0.62, tint) * 0.55);
    col *= 0.65 + 0.7 * tint;
    albedo = col * 0.25;
    emissive = col * vEmissive.rgb * (0.9 + 0.9 * tint) * glow * (1.0 - lead * 0.85);
    emissive += vEmissive.rgb * fresnel * 0.5 * glow;
    metallic = 0.1;
    roughness = mix(0.06, 0.3, lead);
    albedo = mix(albedo, vec3(0.008), lead);
  } else if (kind == 2) {

    float core = fbm3(vLocal * 3.2 + vec3(0.0, uTime * 1.6, seed), 3);
    float band = 0.55 + 0.65 * sin(vLocal.y * 9.0 - uTime * 7.0 + seed * 12.0);
    albedo = vec3(0.02);
    metallic = 0.0;
    roughness = 0.35;
    emissive = vEmissive.rgb * (0.7 + 1.5 * core) * band * glow * (1.0 + uEnergy);
    emissive += vEmissive.rgb * fresnel * 1.1 * glow;
  } else if (kind == 3) {

    float rim = pow(1.0 - NdotV, mix(2.2, 5.0, pattern));
    albedo = vAlbedo.rgb * 0.12;
    metallic = 0.0;
    roughness = 0.62;
    emissive = vEmissive.rgb * rim * (0.9 + 1.7 * glow);
    float sheen = smoothstep(0.35, 1.0, fbm3(vWorld * 1.6 + uTime * 0.3, 2));
    emissive += vEmissive.rgb * sheen * glow * 0.14;
    ao = 0.85;
  } else if (kind == 4) {

    vec2 uv = vLocal.xy * 0.5 + 0.5;
    float frameMask = pulse(uv.x, 0.045, 0.955, 0.012) * pulse(uv.y, 0.045, 0.955, 0.012);
    float border = (1.0 - frameMask);

    float horizon = 0.42 + 0.08 * sin(seed * 4.0);
    float sky = smoothstep(horizon - 0.03, horizon + 0.14, uv.y);
    float land = 1.0 - sky;
    float clouds = fbm(vec2(uv.x * 3.4 + seed, uv.y * 5.0 - uTime * 0.05), 4);
    float figures = smoothstep(0.58, 0.78, fbm(vec2(uv.x * 7.0 + seed * 3.0, uv.y * 3.0), 3)) * land;

    vec3 img = mix(vAlbedo.rgb * 0.35, vAlbedo.rgb, sky * (0.4 + 0.7 * clouds));
    img = mix(img, vAlbedo.rgb.bgr * 0.5, land * 0.6);
    img = mix(img, vec3(0.02, 0.03, 0.05), figures * 0.85);

    float scan = 0.78 + 0.22 * sin(uv.y * 190.0 - uTime * 5.0);
    float drop = step(0.994, hash12(floor(vec2(uv.x * 90.0, uTime * 14.0))));
    float vig = 1.0 - 0.7 * dot(uv - 0.5, uv - 0.5) * 2.2;

    albedo = img * 0.10;
    metallic = 0.0;
    roughness = 0.22;
    emissive = img * frameMask * scan * vig * glow * 0.85;
    emissive += vEmissive.rgb * border * glow * 1.5;
    emissive += vec3(1.0) * drop * frameMask * glow * 0.4;
    emissive += vEmissive.rgb * fresnel * glow * 0.7;
  } else if (kind == 5) {

    vec3 fn = normalize(vObjNormal);
    float facet = hash11(dot(floor(fn * 6.0), vec3(1.0, 17.0, 113.0)) + seed);
    float edge = pow(1.0 - NdotV, 2.0);
    albedo = vAlbedo.rgb * (0.25 + 0.5 * facet);
    metallic = 0.72;
    roughness = 0.06 + 0.12 * facet;
    emissive = vEmissive.rgb * (edge * 2.4 + 0.16) * glow;
    emissive += vEmissive.rgb * pow(facet, 4.0) * glow * 1.2;
  } else if (kind == 6) {

    vec3 p = vWorld * 0.18;
    float grain = fbm3(p * 3.1 + seed, 4);
    float seams = leadLine(vLocal.y * vScaleSeed.y, 0.9, 0.02);
    float wear = smoothstep(0.35, 0.85, fbm3(p * 0.7 + 11.0, 3));
    albedo = vAlbedo.rgb * (0.62 + 0.6 * grain);
    albedo *= mix(1.0, 0.62, wear * 0.8);
    albedo *= mix(1.0, 0.55, seams);
    roughness = clamp(vEmissive.a * (0.8 + 0.4 * grain), 0.15, 1.0);
    metallic = 0.04;
    emissive = vEmissive.rgb * glow * (0.2 + 0.8 * smoothstep(0.6, 0.95, grain));
    ao = clamp(0.55 + 0.45 * grain, 0.0, 1.0);
  } else if (kind == 7) {

    float radius = length(vLocal.xz);
    vec2 w = vWorld.xz - vOrigin.xz;
    float angle = atan(w.y, w.x);
    float sectors = 12.0 + floor(hash11(seed) * 8.0) * 2.0;
    float sector = floor((angle + 3.14159265) / (6.2831853) * sectors);
    float sectorHash = hash11(sector * 1.37 + seed * 5.0);

    float lead = 0.0;
    lead += 1.0 - smoothstep(0.0, 0.016, abs(fract((angle + 3.14159265) / 6.2831853 * sectors) - 0.5) / sectors * 6.2831853 - 0.0);
    float rings = 0.0;
    rings = max(rings, ring(radius, 0.965, 0.014));
    rings = max(rings, ring(radius, 0.86, 0.010));
    rings = max(rings, ring(radius, 0.62, 0.012));
    rings = max(rings, ring(radius, 0.34, 0.010));
    rings = max(rings, ring(radius, 0.20, 0.008));

    float petal = petals(angle, radius, sectors * 0.5, seed);
    float outerBand = pulse(radius, 0.86, 0.965, 0.006);
    float glyphCell = floor(radius * 26.0) + sector * 41.0;
    float glyph = step(0.42, hash11(glyphCell + seed * 3.0));

    float midBand = pulse(radius, 0.62, 0.86, 0.008);
    float heart = 1.0 - smoothstep(0.14, 0.21, radius);
    float spokes = pulse(radius, 0.34, 0.62, 0.008) * step(0.5, fract((angle + 3.14159265) / 6.2831853 * sectors * 2.0));

    vec3 warm = vAlbedo.rgb;
    vec3 cool = vEmissive.rgb;
    vec3 col = vec3(0.0);
    col += warm * outerBand * glyph * 1.1;
    col += cool * midBand * (0.35 + 0.9 * petal);
    col += mix(cool, warm, sectorHash) * spokes * 0.7;
    col += warm * heart * (0.7 + 0.35 * sin(uTime * 1.7));
    col += vec3(1.0, 0.94, 0.82) * rings * 0.8;

    float breathe = 0.78 + 0.22 * sin(uTime * 0.8 + radius * 5.0 - angle * 0.5);
    float sweep = smoothstep(0.86, 1.0, fract(angle / 6.2831853 - uTime * 0.07));

    albedo = col * 0.06 + vec3(0.006, 0.008, 0.016);
    metallic = 0.25;
    roughness = mix(0.10, 0.36, glyph);
    emissive = col * glow * breathe * (1.0 + uEnergy * 0.8);
    emissive += vec3(1.0, 0.95, 0.85) * sweep * rings * glow * 0.9;
    emissive *= smoothstep(1.02, 0.985, radius);
    albedo *= smoothstep(1.02, 0.985, radius);
    if (radius > 1.0) discard;
  } else if (kind == 8) {

    float brushed = fbm3(vec3(vLocal.x * 40.0, vLocal.y * 1.4, vLocal.z * 40.0) + seed, 3);
    float edge = pow(1.0 - NdotV, 3.0);
    albedo = vAlbedo.rgb * (0.7 + 0.55 * brushed);
    metallic = 0.92;
    roughness = clamp(0.10 + 0.22 * brushed, 0.04, 0.5);
    emissive = vEmissive.rgb * (edge * 2.0 + 0.25) * glow;
    float travel = smoothstep(0.4, 1.0, sin(vLocal.y * 3.0 - uTime * 9.0) * 0.5 + 0.5);
    emissive += vEmissive.rgb * travel * glow * 0.9;
  } else if (kind == 9) {

    float crawl = fbm3(vWorld * 0.6 + vec3(0.0, uTime * 0.22, 0.0), 4);
    albedo = vAlbedo.rgb * 0.16;
    metallic = 0.85;
    roughness = 0.09 + 0.22 * crawl;
    emissive = vEmissive.rgb * pow(1.0 - NdotV, 3.2) * (1.6 + 2.0 * glow);
    emissive += vEmissive.rgb * smoothstep(0.72, 0.95, crawl) * glow * 0.55;
  } else if (kind == 10) {

    vec2 uv = vLocal.xy * pattern;
    float grid = max(leadLine(uv.x, 1.0, 0.03), leadLine(uv.y, 1.0, 0.03));
    float sweep = smoothstep(0.86, 1.0, fract(uv.y * 0.1 - uTime * 0.25));
    albedo = vec3(0.002);
    metallic = 0.0;
    roughness = 0.4;
    emissive = vEmissive.rgb * (grid * 1.6 + sweep * 0.8 + 0.05) * glow;
    emissive += vEmissive.rgb * fresnel * glow * 1.1;
  } else {

    float along = vLocal.y * 0.5 + 0.5;
    float flick = 0.9 + 0.1 * sin(uTime * 30.0 + seed * 20.0);
    albedo = vec3(0.01);
    metallic = 0.0;
    roughness = 0.3;
    emissive = vEmissive.rgb * (1.2 + 0.6 * sin(along * 6.0 - uTime * 4.0)) * glow * flick;
    emissive += vEmissive.rgb * fresnel * glow * 1.6;
  }

  if (dissolve > 0.0005) {
    float field = fbm3(vWorld * 1.7 + seed * 3.0, 4);
    float threshold = dissolve * 1.18 - 0.09;
    if (field < threshold) discard;
    float edge = 1.0 - smoothstep(threshold, threshold + uDissolveEdge, field);
    emissive += uDissolveColor * edge * (2.6 + 6.0 * dissolve);
    albedo *= 1.0 - edge * 0.8;
  }

  if (opacity < 0.999) {
    float d = hash12(gl_FragCoord.xy + floor(uTime * 60.0) * 0.618);
    if (d > opacity) discard;
  }

  const float EMISSIVE_UNIT = 0.075;

  oAlbedo = vec4(clamp(albedo, 0.0, 8.0), clamp(metallic, 0.0, 1.0));
  oNormal = vec4(N, clamp(roughness, 0.025, 1.0));
  oEmissive = vec4(max(emissive, vec3(0.0)) * uEmissiveScale * EMISSIVE_UNIT, ao);
}
`;

export const CINE_SKY_LIB = `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyGround;
uniform vec3 uSkyGlow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uSunIntensity;
uniform float uNebula;
uniform float uStars;
uniform float uSkyFlash;
uniform vec3 uFlashColor;
uniform float uSkyTime;
uniform float uHorizonSharp;

vec3 cineSky(vec3 dir) {
  float h = dir.y;
  float up = clamp(h * 0.5 + 0.5, 0.0, 1.0);
  float band = pow(up, uHorizonSharp);
  vec3 col = mix(uSkyGround, uSkyHorizon, smoothstep(0.0, 0.5, up));
  col = mix(col, uSkyZenith, smoothstep(0.42, 1.0, band));

  float horizonGlow = pow(1.0 - clamp(abs(h), 0.0, 1.0), 5.0);
  col += uSkyGlow * horizonGlow;

  if (uNebula > 0.001) {
    vec3 p = dir * 2.6;
    float n = fbm3(p + vec3(uSkyTime * 0.012, uSkyTime * 0.006, 0.0), 5);
    float n2 = fbm3(p * 2.4 - vec3(0.0, uSkyTime * 0.02, 0.0), 4);
    float veil = smoothstep(0.44, 0.82, n * 0.7 + n2 * 0.45);
    col += mix(uSkyGlow, uSkyZenith * 3.0, n2) * veil * uNebula;
  }

  if (uStars > 0.001) {
    vec3 sp = dir * 300.0;
    vec3 id = floor(sp);
    vec3 f = fract(sp) - 0.5;
    float hs = hash33(id).x;
    if (hs > 0.9948) {
      vec3 off = (hash33(id + 5.3) - 0.5) * 0.62;
      float d = length(f - off);
      float twinkle = 0.5 + 0.5 * sin(uSkyTime * (1.2 + hs * 46.0) + hs * 120.0);
      float star = smoothstep(0.085, 0.0, d) * twinkle;
      vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.9, 0.76), hash11(hs * 71.0));
      col += tint * star * uStars * 2.1;
    }
  }

  if (uSunIntensity > 0.001) {
    float c = dot(dir, uSunDir);

    float disc = smoothstep(1.0 - uSunSize * 0.020, 1.0 - uSunSize * 0.007, c);
    float halo = pow(clamp(c, 0.0, 1.0), 90.0) * 0.9
               + pow(clamp(c, 0.0, 1.0), 9.0) * 0.16
               + pow(clamp(c, 0.0, 1.0), 2.2) * 0.05;
    col += uSunColor * (disc * 7.0 + halo) * uSunIntensity;
  }

  col += uFlashColor * uSkyFlash;
  return col;
}

vec3 cineAmbient(vec3 n) {
  float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(up, 0.65));
  vec3 bounce = uSkyGround * 1.15 + uSkyGlow * 0.5;
  return mix(bounce, sky, up) + uFlashColor * uSkyFlash * (0.4 + 0.6 * up);
}
`;

export const CINE_SKY_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${CINE_SKY_LIB}

in vec2 vUv;

uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;

out vec4 oColor;

void main() {
  vec4 clip = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 wpos = uInvViewProj * clip;
  vec3 dir = normalize(wpos.xyz / wpos.w - uCameraPos);
  oColor = vec4(cineSky(dir), 1.0);
}
`;

export const CINE_AMBIENT_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}
${BRDF_GLSL}
${CINE_SKY_LIB}

in vec2 vUv;

uniform sampler2D uGAlbedo;
uniform sampler2D uGNormal;
uniform sampler2D uGEmissive;
uniform sampler2D uDepth;
uniform sampler2D uAO;

uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uAmbientScale;
uniform int uUseAO;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform float uKeyIntensity;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform float uFillIntensity;
uniform vec3 uRimColor;
uniform float uRimIntensity;
uniform float uRimPower;
uniform float uNear;
uniform float uFar;
uniform vec2 uInvResolution;

out vec4 oColor;

float linearDepthAt(vec2 uv) {
  float d = texture(uDepth, uv).r;
  if (d >= 1.0) return uFar;
  return linearizeDepth(d, uNear, uFar);
}

float silhouetteEdge(vec2 uv, float centre) {
  vec2 o = uInvResolution * 1.5;
  float l = linearDepthAt(uv - vec2(o.x, 0.0));
  float r = linearDepthAt(uv + vec2(o.x, 0.0));
  float d = linearDepthAt(uv - vec2(0.0, o.y));
  float u = linearDepthAt(uv + vec2(0.0, o.y));
  float far = max(max(l, r), max(d, u));
  return clamp((far - centre) / max(centre, 0.05), 0.0, 4.0);
}

void main() {
  float depth = texture(uDepth, vUv).r;
  if (depth >= 1.0) discard;

  vec4 albedoM = texture(uGAlbedo, vUv);
  vec4 normalR = texture(uGNormal, vUv);
  vec4 emissiveAO = texture(uGEmissive, vUv);

  vec3 albedo = albedoM.rgb;
  float metallic = albedoM.a;
  vec3 N = normalize(normalR.xyz);
  float roughness = normalR.a;

  vec3 world = worldFromDepth(vUv, depth, uInvViewProj);
  vec3 V = normalize(uCameraPos - world);
  float NdotV = max(dot(N, V), 1e-4);

  float ssao = uUseAO == 1 ? texture(uAO, vUv).r : 1.0;
  float ao = emissiveAO.a * ssao;

  vec3 f0 = mix(vec3(0.04), albedo, metallic);
  vec3 F = fresnelSchlickRoughness(NdotV, f0, roughness);

  vec3 irradiance = cineAmbient(N) * uAmbientScale;
  vec3 diffuseAmbient = irradiance * albedo * (1.0 - metallic) * ao;

  vec3 R = reflect(-V, N);
  vec3 specularSky = cineSky(R) * uAmbientScale;
  float horizonFade = clamp(1.0 - roughness * 1.1, 0.0, 1.0);
  vec3 specularAmbient = specularSky * F * mix(0.3, 1.0, horizonFade) * mix(ao, 1.0, 0.45);

  vec3 direct = vec3(0.0);
  if (uKeyIntensity > 0.0005) {
    direct += evaluateBRDF(N, V, normalize(uKeyDir), albedo, metallic, roughness)
            * uKeyColor * uKeyIntensity * mix(0.4, 1.0, ao);
  }
  if (uFillIntensity > 0.0005) {
    direct += evaluateBRDF(N, V, normalize(uFillDir), albedo, metallic, roughness)
            * uFillColor * uFillIntensity * mix(0.5, 1.0, ao);
  }

  float linear = linearizeDepth(depth, uNear, uFar);
  float edge = smoothstep(0.014, 0.14, silhouetteEdge(vUv, linear));
  vec3 rim = uRimColor * uRimIntensity * pow(1.0 - NdotV, uRimPower) * edge * mix(0.4, 1.0, ao);

  oColor = vec4(diffuseAmbient + specularAmbient + direct + rim + emissiveAO.rgb, 1.0);
}
`;

export const CINE_PARTICLE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 3) in vec4 iPosSize;
layout(location = 4) in vec4 iColor;
layout(location = 5) in vec4 iStyle;

uniform mat4 uViewProj;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform float uSizeScale;

out vec2 vUv;
out vec3 vWorld;
flat out vec4 vColor;
flat out vec4 vStyle;

void main() {
  float rot = iStyle.x;
  float c = cos(rot);
  float s = sin(rot);
  vec2 corner = vec2(aPosition.x * c - aPosition.y * s, aPosition.x * s + aPosition.y * c);
  float size = iPosSize.w * uSizeScale;
  vec3 world = iPosSize.xyz + uCameraRight * corner.x * size + uCameraUp * corner.y * size;
  vUv = aPosition.xy;
  vWorld = world;
  vColor = iColor;
  vStyle = iStyle;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const CINE_PARTICLE_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec2 vUv;
in vec3 vWorld;
flat in vec4 vColor;
flat in vec4 vStyle;

uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec2 uInvResolution;
uniform float uTime;
uniform float uIntensityScale;

out vec4 oColor;

void main() {
  float r = length(vUv);
  if (r > 1.0) discard;

  int kind = int(vStyle.z + 0.5);
  float softness = vStyle.y;
  float seed = vStyle.w;

  float shape;
  if (kind == 0) {

    shape = pow(1.0 - r, mix(1.2, 4.5, softness));
  } else if (kind == 1) {

    float core = pow(1.0 - r, 5.0);
    vec2 a = abs(vUv);
    float flare = max(
      smoothstep(0.34, 0.0, a.y) * smoothstep(1.0, 0.1, a.x),
      smoothstep(0.34, 0.0, a.x) * smoothstep(1.0, 0.1, a.y));
    shape = core + flare * 0.42 * pow(1.0 - r, 1.5);
  } else if (kind == 2) {

    float along = smoothstep(1.0, 0.0, abs(vUv.y));
    float across = pow(smoothstep(0.55, 0.0, abs(vUv.x)), 2.0);
    shape = along * across;
  } else if (kind == 3) {

    shape = smoothstep(0.14, 0.0, abs(r - 0.78)) * (1.0 - r * 0.3);
  } else {

    float facet = step(0.35, hash12(floor(vUv * 5.0) + seed));
    shape = pow(1.0 - r, 2.2) * (0.45 + 0.75 * facet);
  }

  vec2 screenUv = gl_FragCoord.xy * uInvResolution;
  float sceneDepth = texture(uDepth, screenUv).r;
  float fade = 1.0;
  if (sceneDepth < 1.0) {
    vec3 scene = worldFromDepth(screenUv, sceneDepth, uInvViewProj);
    float dScene = length(scene - uCameraPos);
    float dSelf = length(vWorld - uCameraPos);
    fade = clamp((dScene - dSelf) * 0.6, 0.0, 1.0);
    if (dSelf > dScene) discard;
  }

  const float PARTICLE_UNIT = 0.15;
  vec3 col = vColor.rgb * vColor.a * shape * fade * uIntensityScale * PARTICLE_UNIT;
  oColor = vec4(col, 1.0);
}
`;

export const CINE_TRAIL_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec4 aColor;
layout(location = 2) in vec2 aUv;

uniform mat4 uViewProj;

out vec2 vUv;
out vec3 vWorld;
out vec4 vColor;

void main() {
  vUv = aUv;
  vWorld = aPosition;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const CINE_TRAIL_FS = `#version 300 es
precision highp float;

${PACKING_GLSL}

in vec2 vUv;
in vec3 vWorld;
in vec4 vColor;

uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec2 uInvResolution;
uniform float uIntensityScale;

out vec4 oColor;

void main() {
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float body = pow(clamp(across, 0.0, 1.0), 1.6);
  float core = pow(clamp(across, 0.0, 1.0), 8.0);
  float along = vUv.x;

  vec2 screenUv = gl_FragCoord.xy * uInvResolution;
  float sceneDepth = texture(uDepth, screenUv).r;
  float fade = 1.0;
  if (sceneDepth < 1.0) {
    vec3 scene = worldFromDepth(screenUv, sceneDepth, uInvViewProj);
    float dScene = length(scene - uCameraPos);
    float dSelf = length(vWorld - uCameraPos);
    if (dSelf > dScene + 0.05) discard;
    fade = clamp((dScene - dSelf) * 0.8, 0.0, 1.0);
  }

  const float TRAIL_UNIT = 0.15;
  vec3 col = vColor.rgb * vColor.a * (body * 0.75 + core * 1.6) * along * fade * uIntensityScale * TRAIL_UNIT;
  oColor = vec4(col, 1.0);
}
`;

export const CINE_BEAM_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTangent;
layout(location = 3) in vec4 iPosKind;
layout(location = 4) in vec4 iRotation;
layout(location = 5) in vec4 iScaleSeed;
layout(location = 6) in vec4 iAlbedo;
layout(location = 7) in vec4 iEmissive;
layout(location = 8) in vec4 iParams;

uniform mat4 uViewProj;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
flat out vec4 vColor;
flat out vec4 vParams;
flat out vec4 vScaleSeed;

${QUAT_GLSL}

void main() {
  vec3 scale = max(iScaleSeed.xyz, vec3(1e-4));
  vec3 local = aPosition * scale;
  vec3 world = iPosKind.xyz + rotateQuat(iRotation, local);
  vWorld = world;
  vLocal = aPosition;
  vNormal = normalize(rotateQuat(iRotation, aNormal / scale));
  vColor = iEmissive;
  vParams = iParams;
  vScaleSeed = iScaleSeed;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const CINE_BEAM_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec4 vColor;
flat in vec4 vParams;
flat in vec4 vScaleSeed;

uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec2 uInvResolution;
uniform float uTime;
uniform float uIntensityScale;

out vec4 oColor;

void main() {
  vec2 screenUv = gl_FragCoord.xy * uInvResolution;
  float sceneDepth = texture(uDepth, screenUv).r;
  float dSelf = length(vWorld - uCameraPos);
  float occl = 1.0;
  if (sceneDepth < 1.0) {
    vec3 scene = worldFromDepth(screenUv, sceneDepth, uInvViewProj);
    float dScene = length(scene - uCameraPos);
    if (dSelf > dScene + 0.02) discard;
    occl = clamp((dScene - dSelf) * 0.35, 0.0, 1.0);
  }

  float radial = clamp(1.0 - length(vLocal.xz), 0.0, 1.0);
  float along = vLocal.y * 0.5 + 0.5;
  float body = pow(radial, 2.1);
  float core = pow(radial, 7.0);

  float dust = fbm3(vWorld * vParams.w + vec3(0.0, -uTime * 0.35, uTime * 0.12), 3);
  float mote = smoothstep(0.55, 0.92, dust);

  vec3 V = normalize(uCameraPos - vWorld);
  float graze = 1.0 - abs(dot(normalize(vNormal), V));
  graze = pow(clamp(graze, 0.0, 1.0), 1.6);

  float taper = mix(1.0, smoothstep(0.0, 0.35, along) * smoothstep(1.05, 0.55, along), vParams.y);
  float nearFade = smoothstep(0.0, 2.5, dSelf);

  float amount = (body * 0.55 + core * 0.9) * (0.55 + 0.9 * graze);
  amount *= taper * occl * nearFade;
  amount *= 0.72 + 0.55 * mote;

  const float BEAM_UNIT = 0.13;
  vec3 col = vColor.rgb * vColor.a * amount * vParams.x * uIntensityScale * BEAM_UNIT;
  oColor = vec4(col, 1.0);
}
`;
