import { HASH_GLSL, PACKING_GLSL, BRDF_GLSL } from './common.js';

export const SKY_LIB = `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uCityGlowColor;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uCloudCoverage;
uniform float uCloudSpeed;
uniform float uStarIntensity;
uniform float uFlash;

vec3 skyGradient(vec3 dir) {
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  float horizon = pow(1.0 - clamp(abs(dir.y), 0.0, 1.0), 3.0);
  vec3 col = mix(uHorizonColor, uZenithColor, pow(h, 0.55));
  col += uCityGlowColor * horizon * 0.9;
  col += uCityGlowColor * 0.16 * smoothstep(0.25, -0.15, dir.y);
  col += vec3(0.52, 0.60, 0.85) * uFlash * (0.35 + 0.65 * smoothstep(-0.1, 0.55, dir.y));
  return col;
}

vec3 ambientFromNormal(vec3 n) {
  float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uHorizonColor * 0.9, uZenithColor, pow(up, 0.7));
  vec3 bounce = uCityGlowColor * 1.25;
  return mix(bounce, sky, up) + vec3(0.42, 0.50, 0.78) * uFlash * (0.35 + 0.65 * up);
}
`;

export const SKY_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${SKY_LIB}

in vec2 vUv;

uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uTime;
uniform float uRainIntensity;

out vec4 oColor;

float cloudDensity(vec3 dir) {
  if (dir.y <= 0.012) return 0.0;
  vec2 p = dir.xz / dir.y;
  vec2 drift = vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.42);
  float base = fbm(p * 0.09 + drift * 0.012, 5);
  float detail = fbm(p * 0.34 - drift * 0.03, 4);
  float d = base * 0.75 + detail * 0.35;
  d = smoothstep(0.52 - uCloudCoverage * 0.34, 0.86 - uCloudCoverage * 0.22, d);
  return d * smoothstep(0.012, 0.16, dir.y);
}

float starField(vec3 dir) {
  vec3 p = dir * 260.0;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash33(id).x;
  if (h < 0.9955) return 0.0;
  vec3 off = (hash33(id + 3.1) - 0.5) * 0.6;
  float d = length(f - off);
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + h * 40.0) + h * 90.0);
  return smoothstep(0.075, 0.0, d) * twinkle;
}

void main() {
  vec4 clip = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 wpos = uInvViewProj * clip;
  vec3 dir = normalize(wpos.xyz / wpos.w - uCameraPos);

  vec3 col = skyGradient(dir);

  float stars = starField(dir) * uStarIntensity * smoothstep(0.02, 0.3, dir.y);
  col += vec3(0.75, 0.82, 1.0) * stars * 1.6;

  float moon = dot(dir, uMoonDir);
  float disc = smoothstep(0.9986, 0.9994, moon);
  float halo = pow(clamp(moon, 0.0, 1.0), 220.0) * 0.55 + pow(clamp(moon, 0.0, 1.0), 14.0) * 0.06;
  col += uMoonColor * (disc * 6.0 + halo);

  float clouds = cloudDensity(dir);
  float underlit = pow(clamp(1.0 - dir.y, 0.0, 1.0), 2.4);
  vec3 cloudLit = mix(uZenithColor * 0.5, uCityGlowColor * 3.1, underlit);
  cloudLit += uMoonColor * pow(clamp(moon, 0.0, 1.0), 5.0) * 0.85;
  cloudLit *= 0.55 + 0.75 * fbm(dir.xz / max(dir.y, 0.05) * 0.22 + uTime * 0.01, 3);
  col = mix(col, cloudLit, clouds * 0.95);

  float haze = smoothstep(0.32, -0.05, dir.y);
  col = mix(col, uCityGlowColor * 1.15, haze * (0.35 + uRainIntensity * 0.3));

  oColor = vec4(col, 1.0);
}
`;

export const AMBIENT_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}
${BRDF_GLSL}
${SKY_LIB}

in vec2 vUv;

uniform sampler2D uGAlbedo;
uniform sampler2D uGNormal;
uniform sampler2D uGEmissive;
uniform sampler2D uDepth;
uniform sampler2D uAO;

uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uTime;
uniform float uAmbientScale;
uniform float uMoonIntensity;
uniform int uUseAO;

out vec4 oColor;

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
  float bakedAO = emissiveAO.a;

  vec3 world = worldFromDepth(vUv, depth, uInvViewProj);
  vec3 V = normalize(uCameraPos - world);
  float NdotV = max(dot(N, V), 1e-4);

  float ssao = uUseAO == 1 ? texture(uAO, vUv).r : 1.0;
  float ao = bakedAO * ssao;

  vec3 f0 = mix(vec3(0.04), albedo, metallic);
  vec3 F = fresnelSchlickRoughness(NdotV, f0, roughness);

  vec3 irradiance = ambientFromNormal(N) * uAmbientScale;
  vec3 diffuseAmbient = irradiance * albedo * (1.0 - metallic) * ao;

  vec3 R = reflect(-V, N);
  vec3 specularSky = skyGradient(R) * uAmbientScale;
  float horizonFade = clamp(1.0 - roughness * 1.15, 0.0, 1.0);
  vec3 specularAmbient = specularSky * F * mix(0.35, 1.0, horizonFade) * mix(ao, 1.0, 0.4);

  vec3 L = uMoonDir;
  vec3 moon = evaluateBRDF(N, V, L, albedo, metallic, roughness) * uMoonColor * uMoonIntensity;
  moon *= mix(0.35, 1.0, ao);

  vec3 color = diffuseAmbient + specularAmbient + moon + emissiveAO.rgb;

  oColor = vec4(color, 1.0);
}
`;

export const LIGHT_VOLUME_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 3) in vec4 iSphere;
layout(location = 4) in vec4 iColor;
layout(location = 5) in vec4 iModifier;

uniform mat4 uViewProj;
uniform float uVolumeScale;

flat out vec4 vSphere;
flat out vec4 vColor;
flat out vec4 vModifier;

void main() {
  vec3 world = iSphere.xyz + aPosition * iSphere.w * uVolumeScale;
  vSphere = iSphere;
  vColor = iColor;
  vModifier = iModifier;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const LIGHT_VOLUME_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}
${BRDF_GLSL}

flat in vec4 vSphere;
flat in vec4 vColor;
flat in vec4 vModifier;

uniform sampler2D uGAlbedo;
uniform sampler2D uGNormal;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec2 uInvResolution;
uniform float uTime;
uniform float uLightScale;

out vec4 oColor;

void main() {
  vec2 uv = gl_FragCoord.xy * uInvResolution;
  float depth = texture(uDepth, uv).r;
  if (depth >= 1.0) discard;

  vec3 world = worldFromDepth(uv, depth, uInvViewProj);
  vec3 toLight = vSphere.xyz - world;
  float dist2 = dot(toLight, toLight);
  float radius = vSphere.w;
  if (dist2 > radius * radius) discard;

  float dist = sqrt(max(dist2, 1e-6));
  vec3 L = toLight / dist;

  vec4 normalR = texture(uGNormal, uv);
  vec3 N = normalize(normalR.xyz);
  float NdotL = dot(N, L);
  if (NdotL <= 0.0) discard;

  vec4 albedoM = texture(uGAlbedo, uv);
  vec3 albedo = albedoM.rgb;
  float metallic = albedoM.a;
  float roughness = normalR.a;

  vec3 V = normalize(uCameraPos - world);

  float t = dist / radius;
  float falloff = clamp(1.0 - t * t * t * t, 0.0, 1.0);
  falloff *= falloff;
  falloff /= (dist2 * 0.06 + 1.0);

  float cone = vModifier.w;
  if (cone > 0.0) {
    float down = clamp(-L.y * 0.5 + 0.5, 0.0, 1.0);
    falloff *= mix(1.0, mix(0.18, 1.0, down), cone);
  }

  float intensity = vColor.w;
  if (vModifier.x > 0.0) {
    float phase = vModifier.z;
    float s = hash11(floor(uTime * vModifier.x + phase));
    float pulse = step(0.5, s);
    intensity *= mix(1.0 - vModifier.y, 1.0, pulse);
  } else {
    float h = hash12(vSphere.xz * 0.37 + vSphere.y);
    if (h > 0.82) {
      float w = 0.86 + 0.14 * sin(uTime * (2.0 + h * 9.0) + h * 55.0);
      intensity *= w;
    }
  }

  vec3 radiance = vColor.rgb * intensity * falloff * uLightScale;
  vec3 result = evaluateBRDF(N, V, L, albedo, metallic, roughness) * radiance;

  oColor = vec4(result, 1.0);
}
`;
