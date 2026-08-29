import { HASH_GLSL, PACKING_GLSL, TONEMAP_GLSL } from './common.js';
import { SKY_LIB } from './lighting.js';

export const SSAO_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uDepth;
uniform sampler2D uGNormal;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform mat4 uView;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uStrength;
uniform float uBias;
uniform int uSampleCount;
uniform float uFrame;

out vec4 oColor;

vec3 viewFromDepth(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * clip;
  return v.xyz / v.w;
}

void main() {
  float depth = texture(uDepth, vUv).r;
  if (depth >= 1.0) {
    oColor = vec4(1.0);
    return;
  }

  vec3 viewPos = viewFromDepth(vUv, depth);
  vec3 worldNormal = normalize(texture(uGNormal, vUv).xyz);
  vec3 N = normalize(mat3(uView) * worldNormal);

  float noise = hash12(gl_FragCoord.xy + uFrame * 7.13);
  float angleOffset = noise * 6.2831853;

  float radius = uRadius;
  float occlusion = 0.0;
  float weightSum = 0.0;
  float count = float(uSampleCount);

  for (int i = 0; i < 32; i++) {
    if (i >= uSampleCount) break;
    float fi = float(i);
    float t = (fi + 0.5) / count;
    float angle = angleOffset + fi * 2.39996323;
    float r = radius * sqrt(t);
    vec3 dir = vec3(cos(angle), sin(angle), 0.0);
    vec3 hemi = normalize(dir + N * 0.55);
    if (dot(hemi, N) < 0.0) hemi = -hemi;
    vec3 samplePos = viewPos + hemi * r;

    vec4 clip = uProj * vec4(samplePos, 1.0);
    if (clip.w <= 0.0) continue;
    vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

    float sampleDepth = texture(uDepth, sampleUv).r;
    if (sampleDepth >= 1.0) continue;
    vec3 sceneView = viewFromDepth(sampleUv, sampleDepth);

    vec3 diff = sceneView - viewPos;
    float len = length(diff);
    if (len < 1e-4) continue;
    vec3 dirToSample = diff / len;
    float ndl = max(dot(N, dirToSample) - uBias, 0.0);
    float rangeCheck = smoothstep(0.0, 1.0, radius / max(len, 1e-3));
    occlusion += ndl * rangeCheck;
    weightSum += 1.0;
  }

  float ao = weightSum > 0.0 ? 1.0 - (occlusion / weightSum) * uStrength : 1.0;
  oColor = vec4(clamp(ao, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

export const BILATERAL_BLUR_FS = `#version 300 es
precision highp float;

${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uSource;
uniform sampler2D uDepth;
uniform vec2 uDirection;
uniform vec2 uInvSize;
uniform float uDepthSigma;

out vec4 oColor;

void main() {
  float centerDepth = texture(uDepth, vUv).r;
  float total = 0.0;
  float weightSum = 0.0;
  const float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

  for (int i = -4; i <= 4; i++) {
    float fi = float(i);
    vec2 offset = uDirection * uInvSize * fi;
    float d = texture(uDepth, vUv + offset).r;
    float w = weights[i < 0 ? -i : i];
    float dw = exp(-abs(d - centerDepth) * uDepthSigma);
    total += texture(uSource, vUv + offset).r * w * dw;
    weightSum += w * dw;
  }

  oColor = vec4(weightSum > 0.0 ? total / weightSum : texture(uSource, vUv).r, 0.0, 0.0, 1.0);
}
`;

export const SSR_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uGNormal;
uniform sampler2D uGAlbedo;

uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec2 uResolution;
uniform float uFrame;
uniform int uMaxSteps;
uniform float uStride;
uniform float uThickness;
uniform float uMaxRoughness;

out vec4 oColor;

vec3 viewFromDepth(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * clip;
  return v.xyz / v.w;
}

void main() {
  float depth = texture(uDepth, vUv).r;
  if (depth >= 1.0) {
    oColor = vec4(0.0);
    return;
  }

  vec4 normalR = texture(uGNormal, vUv);
  float roughness = normalR.a;
  if (roughness > uMaxRoughness) {
    oColor = vec4(0.0);
    return;
  }

  vec3 worldNormal = normalize(normalR.xyz);
  vec3 viewPos = viewFromDepth(vUv, depth);
  vec3 N = normalize(mat3(uView) * worldNormal);
  vec3 V = normalize(viewPos);
  vec3 R = reflect(V, N);

  if (R.z > 0.0 && viewPos.z + R.z > -0.05) {
    oColor = vec4(0.0);
    return;
  }

  float jitter = hash12(gl_FragCoord.xy + uFrame * 3.77);
  float stride = uStride * (1.0 + roughness * 6.0);
  vec3 rayPos = viewPos + N * 0.05;
  vec3 step3 = R * stride;
  rayPos += step3 * jitter;

  vec2 hitUv = vec2(0.0);
  float hitMask = 0.0;
  float traveled = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= uMaxSteps) break;
    rayPos += step3;
    traveled += stride;

    vec4 clip = uProj * vec4(rayPos, 1.0);
    if (clip.w <= 0.0) break;
    vec2 uv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;

    float sceneDepth = texture(uDepth, uv).r;
    if (sceneDepth >= 1.0) continue;
    vec3 scenePos = viewFromDepth(uv, sceneDepth);

    float delta = scenePos.z - rayPos.z;
    if (delta > 0.0 && delta < uThickness + stride) {
      vec3 lo = rayPos - step3;
      vec3 hi = rayPos;
      for (int j = 0; j < 6; j++) {
        vec3 mid = (lo + hi) * 0.5;
        vec4 mclip = uProj * vec4(mid, 1.0);
        vec2 muv = (mclip.xy / mclip.w) * 0.5 + 0.5;
        float md = texture(uDepth, muv).r;
        vec3 mscene = viewFromDepth(muv, md);
        if (mscene.z - mid.z > 0.0) hi = mid; else lo = mid;
      }
      vec4 fclip = uProj * vec4(hi, 1.0);
      hitUv = (fclip.xy / fclip.w) * 0.5 + 0.5;
      hitMask = 1.0;
      break;
    }
    stride *= 1.06;
    step3 = R * stride;
  }

  if (hitMask < 0.5) {
    oColor = vec4(0.0);
    return;
  }

  vec2 edge = smoothstep(vec2(0.0), vec2(0.14), hitUv) * smoothstep(vec2(0.0), vec2(0.14), 1.0 - hitUv);
  float fade = edge.x * edge.y;
  fade *= 1.0 - clamp(traveled / 220.0, 0.0, 1.0);
  fade *= clamp(1.0 - roughness / uMaxRoughness, 0.0, 1.0);
  fade *= smoothstep(0.0, 0.25, -R.z * 0.5 + 0.5);

  vec3 reflected = texture(uColor, hitUv).rgb;
  oColor = vec4(reflected, fade);
}
`;

export const SSR_COMPOSITE_FS = `#version 300 es
precision highp float;

${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uReflection;
uniform sampler2D uGNormal;
uniform sampler2D uGAlbedo;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uIntensity;

out vec4 oColor;

vec3 fresnelSchlickRough(float cosTheta, vec3 f0, float roughness) {
  float f = pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  return f0 + (max(vec3(1.0 - roughness), f0) - f0) * f;
}

void main() {
  float depth = texture(uDepth, vUv).r;
  if (depth >= 1.0) discard;

  vec4 refl = texture(uReflection, vUv);
  if (refl.a <= 0.001) discard;

  vec4 normalR = texture(uGNormal, vUv);
  vec4 albedoM = texture(uGAlbedo, vUv);
  vec3 N = normalize(normalR.xyz);
  float roughness = normalR.a;
  vec3 world = worldFromDepth(vUv, depth, uInvViewProj);
  vec3 V = normalize(uCameraPos - world);
  float NdotV = max(dot(N, V), 1e-4);

  vec3 f0 = mix(vec3(0.04), albedoM.rgb, albedoM.a);
  vec3 F = fresnelSchlickRough(NdotV, f0, roughness);

  oColor = vec4(refl.rgb * refl.a * F * uIntensity, 1.0);
}
`;

export const VOLUMETRIC_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uTime;
uniform float uFrame;
uniform int uStepCount;
uniform int uLightCount;
uniform vec4 uVolLights[12];
uniform vec4 uVolColors[12];
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uScatterStrength;
uniform float uMaxDistance;

out vec4 oColor;

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  float m[16] = float[](
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0);
  return m[i.y * 4 + i.x] / 16.0;
}

float henyey(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

void main() {
  float depth = texture(uDepth, vUv).r;
  vec3 target = worldFromDepth(vUv, min(depth, 0.99999), uInvViewProj);
  vec3 ray = target - uCameraPos;
  float dist = length(ray);
  vec3 dir = ray / max(dist, 1e-5);
  dist = min(dist, uMaxDistance);

  float steps = float(uStepCount);
  float jitter = bayer4(gl_FragCoord.xy);
  float segment = dist / steps;

  vec3 accum = vec3(0.0);
  float transmittance = 1.0;
  float moonPhase = henyey(dot(dir, uMoonDir), 0.35);

  for (int i = 0; i < 24; i++) {
    if (i >= uStepCount) break;
    float t = (float(i) + jitter) * segment;
    vec3 p = uCameraPos + dir * t;

    float heightFalloff = exp(-max(p.y, 0.0) / uFogHeight);
    float turbulence = 0.7 + 0.6 * fbm3(p * 0.017 + vec3(0.0, uTime * 0.03, uTime * 0.015), 3);
    float density = uFogDensity * heightFalloff * turbulence;
    if (density < 1e-6) continue;

    vec3 inScatter = uFogColor * (0.35 + moonPhase * 1.4) * 0.5;
    inScatter += uMoonColor * moonPhase * 0.5;

    for (int l = 0; l < 12; l++) {
      if (l >= uLightCount) break;
      vec3 lp = uVolLights[l].xyz;
      float lr = uVolLights[l].w;
      vec3 d = lp - p;
      float d2 = dot(d, d);
      if (d2 > lr * lr) continue;
      float dl = sqrt(d2);
      float att = clamp(1.0 - dl / lr, 0.0, 1.0);
      att = att * att / (1.0 + d2 * 0.05);
      float phase = henyey(dot(dir, -d / max(dl, 1e-4)), 0.28);
      inScatter += uVolColors[l].rgb * uVolColors[l].w * att * phase * 5.0;
    }

    float stepDensity = density * segment;
    float stepTrans = exp(-stepDensity);
    accum += inScatter * density * segment * transmittance * uScatterStrength;
    transmittance *= stepTrans;
    if (transmittance < 0.006) break;
  }

  oColor = vec4(accum, 1.0 - transmittance);
}
`;

export const FOG_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}
${SKY_LIB}

in vec2 vUv;

uniform sampler2D uDepth;
uniform sampler2D uScatter;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec3 uFogColor;
uniform vec3 uFogGlow;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogDistance;
uniform float uTime;
uniform int uUseScatter;
uniform vec2 uScatterTexel;

out vec4 oColor;

void main() {
  float depth = texture(uDepth, vUv).r;
  vec3 world = worldFromDepth(vUv, min(depth, 0.99999), uInvViewProj);
  vec3 ray = world - uCameraPos;
  float dist = length(ray);
  vec3 dir = ray / max(dist, 1e-5);

  float startH = uCameraPos.y;
  float endH = world.y;
  float fogAmount;
  if (abs(dir.y) < 1e-4) {
    fogAmount = uFogDensity * dist * exp(-startH / uFogHeight);
  } else {
    fogAmount = uFogDensity * uFogHeight / dir.y * (exp(-startH / uFogHeight) - exp(-endH / uFogHeight));
  }
  fogAmount = clamp(abs(fogAmount), 0.0, 1.0);
  float distanceFog = 1.0 - exp(-dist / uFogDistance);
  fogAmount = 1.0 - (1.0 - fogAmount) * (1.0 - distanceFog);
  if (depth >= 1.0) fogAmount = clamp(fogAmount * 0.7, 0.0, 0.88);

  float glow = pow(clamp(1.0 - abs(dir.y), 0.0, 1.0), 5.0);
  float lowAltitude = exp(-max(uCameraPos.y, 0.0) / 150.0);
  vec3 sky = skyGradient(dir);
  vec3 fogCol = mix(uFogColor, sky, 0.78) + uFogGlow * glow * 0.34 * lowAltitude;

  vec3 scatter = vec3(0.0);
  if (uUseScatter == 1) {
    vec2 texel = uScatterTexel;
    vec4 acc = texture(uScatter, vUv) * 0.36;
    acc += texture(uScatter, vUv + vec2(texel.x, 0.0)) * 0.16;
    acc += texture(uScatter, vUv - vec2(texel.x, 0.0)) * 0.16;
    acc += texture(uScatter, vUv + vec2(0.0, texel.y)) * 0.16;
    acc += texture(uScatter, vUv - vec2(0.0, texel.y)) * 0.16;
    scatter = acc.rgb;
  }

  oColor = vec4(fogCol * fogAmount + scatter, fogAmount);
}
`;

export const RAIN_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec3 uCameraDelta;
uniform vec3 uForward;
uniform vec3 uRight;
uniform float uTime;
uniform float uIntensity;
uniform float uAspect;
uniform vec3 uRainColor;

out vec4 oColor;

float rainLayer(vec2 uv, float scale, float speed, float slant, float seedOffset, float thickness, float density) {
  vec2 p = uv * scale;
  p.x += p.y * slant;
  p.y += uTime * speed;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float h = hash12(id + seedOffset);
  if (h > density) return 0.0;
  float xoff = hash12(id + seedOffset + 7.7) - 0.5;
  float len = 0.22 + hash12(id + seedOffset + 3.3) * 0.42;
  float d = abs(f.x - 0.5 - xoff * 0.8);
  float streak = smoothstep(thickness, thickness * 0.25, d);
  float along = smoothstep(0.0, 0.10, f.y) * smoothstep(len, len - 0.3, f.y);
  return streak * along * (0.5 + 0.5 * hash12(id + seedOffset + 11.1));
}

void main() {
  vec2 uv = vUv;
  vec2 aspectUv = vec2(uv.x * uAspect, uv.y);

  float drift = uCameraDelta.x * 0.03 + uCameraDelta.z * 0.02;
  float rise = uCameraDelta.y * 0.05;

  float r = 0.0;
  r += rainLayer(aspectUv + vec2(drift * 1.2, rise * 1.2), 118.0, 5.2, 0.12, 1.0, 0.040, 0.30) * 0.42;
  r += rainLayer(aspectUv + vec2(drift * 2.0, rise * 1.9), 72.0, 3.9, 0.16, 41.0, 0.048, 0.24) * 0.32;
  r += rainLayer(aspectUv + vec2(drift * 3.2, rise * 2.9), 42.0, 2.7, 0.21, 91.0, 0.060, 0.16) * 0.22;
  r += rainLayer(aspectUv + vec2(drift * 5.0, rise * 4.2), 21.0, 1.7, 0.27, 151.0, 0.085, 0.07) * 0.13;

  float depth = texture(uDepth, uv).r;
  vec3 world = worldFromDepth(uv, min(depth, 0.99999), uInvViewProj);
  float sceneDist = length(world - uCameraPos);
  float nearFade = smoothstep(0.5, 6.0, sceneDist);

  float vignette = 1.0 - 0.35 * length(uv - 0.5);
  float sheet = 0.62 + 0.38 * fbm(vec2(uv.x * 2.2 - uTime * 0.22, uv.y * 0.9 + uTime * 0.5), 3);
  vec3 rain = uRainColor * r * uIntensity * nearFade * vignette * sheet * 0.55;

  float mist = fbm(uv * vec2(uAspect, 1.0) * 5.0 + uTime * 0.05, 3);
  rain += uRainColor * 0.008 * uIntensity * smoothstep(0.4, 0.8, mist) * nearFade;

  oColor = vec4(rain, 1.0);
}
`;

export const BLOOM_PREFILTER_FS = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uInvSize;
uniform float uThreshold;
uniform float uSoftKnee;
out vec4 oColor;

vec3 prefilter(vec3 c) {
  float brightness = max(c.r, max(c.g, c.b));
  float knee = uThreshold * uSoftKnee;
  float soft = clamp(brightness - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  float contribution = max(soft, brightness - uThreshold) / max(brightness, 1e-5);
  return c * contribution;
}

void main() {
  vec2 o = uInvSize;
  vec3 c = texture(uSource, vUv).rgb * 0.25;
  c += texture(uSource, vUv + vec2(o.x, o.y)).rgb * 0.1875;
  c += texture(uSource, vUv + vec2(-o.x, o.y)).rgb * 0.1875;
  c += texture(uSource, vUv + vec2(o.x, -o.y)).rgb * 0.1875;
  c += texture(uSource, vUv + vec2(-o.x, -o.y)).rgb * 0.1875;
  oColor = vec4(prefilter(c), 1.0);
}
`;

export const BLOOM_DOWN_FS = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uInvSize;
out vec4 oColor;

void main() {
  vec2 o = uInvSize;
  vec3 a = texture(uSource, vUv + vec2(-2.0 * o.x, 2.0 * o.y)).rgb;
  vec3 b = texture(uSource, vUv + vec2(0.0, 2.0 * o.y)).rgb;
  vec3 c = texture(uSource, vUv + vec2(2.0 * o.x, 2.0 * o.y)).rgb;
  vec3 d = texture(uSource, vUv + vec2(-2.0 * o.x, 0.0)).rgb;
  vec3 e = texture(uSource, vUv).rgb;
  vec3 f = texture(uSource, vUv + vec2(2.0 * o.x, 0.0)).rgb;
  vec3 g = texture(uSource, vUv + vec2(-2.0 * o.x, -2.0 * o.y)).rgb;
  vec3 h = texture(uSource, vUv + vec2(0.0, -2.0 * o.y)).rgb;
  vec3 i = texture(uSource, vUv + vec2(2.0 * o.x, -2.0 * o.y)).rgb;
  vec3 j = texture(uSource, vUv + vec2(-o.x, o.y)).rgb;
  vec3 k = texture(uSource, vUv + vec2(o.x, o.y)).rgb;
  vec3 l = texture(uSource, vUv + vec2(-o.x, -o.y)).rgb;
  vec3 m = texture(uSource, vUv + vec2(o.x, -o.y)).rgb;

  vec3 result = e * 0.125;
  result += (a + c + g + i) * 0.03125;
  result += (b + d + f + h) * 0.0625;
  result += (j + k + l + m) * 0.125;
  oColor = vec4(result, 1.0);
}
`;

export const BLOOM_UP_FS = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uInvSize;
uniform float uRadius;
out vec4 oColor;

void main() {
  vec2 o = uInvSize * uRadius;
  vec3 result = texture(uSource, vUv + vec2(-o.x, o.y)).rgb * 1.0;
  result += texture(uSource, vUv + vec2(0.0, o.y)).rgb * 2.0;
  result += texture(uSource, vUv + vec2(o.x, o.y)).rgb * 1.0;
  result += texture(uSource, vUv + vec2(-o.x, 0.0)).rgb * 2.0;
  result += texture(uSource, vUv).rgb * 4.0;
  result += texture(uSource, vUv + vec2(o.x, 0.0)).rgb * 2.0;
  result += texture(uSource, vUv + vec2(-o.x, -o.y)).rgb * 1.0;
  result += texture(uSource, vUv + vec2(0.0, -o.y)).rgb * 2.0;
  result += texture(uSource, vUv + vec2(o.x, -o.y)).rgb * 1.0;
  oColor = vec4(result / 16.0, 1.0);
}
`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${TONEMAP_GLSL}

in vec2 vUv;

uniform sampler2D uColor;
uniform sampler2D uBloom;
uniform float uTime;
uniform float uExposure;
uniform float uBloomIntensity;
uniform float uChromatic;
uniform float uVignette;
uniform float uGrain;
uniform float uScanline;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec2 uResolution;

out vec4 oColor;

vec3 sampleChromatic(vec2 uv, float amount) {
  vec2 center = uv - 0.5;
  float r2 = dot(center, center);
  vec2 offset = center * r2 * amount;
  vec3 c;
  c.r = texture(uColor, uv - offset).r;
  c.g = texture(uColor, uv).g;
  c.b = texture(uColor, uv + offset).b;
  return c;
}

void main() {
  vec3 hdr = uChromatic > 0.0001 ? sampleChromatic(vUv, uChromatic) : texture(uColor, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  hdr += bloom * uBloomIntensity;

  hdr *= uExposure;

  vec3 color = acesFilm(hdr);

  color = uLift + color * uGain;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);
  color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);

  vec2 vp = vUv - 0.5;
  float vig = 1.0 - dot(vp, vp) * uVignette;
  color *= clamp(vig, 0.0, 1.0);

  if (uScanline > 0.0001) {
    float lines = 0.5 + 0.5 * sin(vUv.y * uResolution.y * 3.14159);
    color *= 1.0 - uScanline * (1.0 - lines) * 0.5;
  }

  float grain = hash12(gl_FragCoord.xy + fract(uTime) * 431.7) - 0.5;
  color += grain * uGrain * (0.5 + 0.5 * (1.0 - luma));

  color = linearToSrgb(clamp(color, 0.0, 1.0));

  float dither = (hash12(gl_FragCoord.xy * 1.7 + fract(uTime) * 97.0) - 0.5) / 255.0;
  color += dither;

  oColor = vec4(color, 1.0);
}
`;

export const FXAA_FS = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uInvResolution;
out vec4 oColor;

const float EDGE_THRESHOLD_MIN = 0.0312;
const float EDGE_THRESHOLD_MAX = 0.125;
const float SUBPIXEL_QUALITY = 0.75;

float luma(vec3 c) {
  return sqrt(dot(c, vec3(0.299, 0.587, 0.114)));
}

void main() {
  vec3 center = texture(uSource, vUv).rgb;
  float lumaCenter = luma(center);
  float lumaDown = luma(textureOffset(uSource, vUv, ivec2(0, -1)).rgb);
  float lumaUp = luma(textureOffset(uSource, vUv, ivec2(0, 1)).rgb);
  float lumaLeft = luma(textureOffset(uSource, vUv, ivec2(-1, 0)).rgb);
  float lumaRight = luma(textureOffset(uSource, vUv, ivec2(1, 0)).rgb);

  float lumaMin = min(lumaCenter, min(min(lumaDown, lumaUp), min(lumaLeft, lumaRight)));
  float lumaMax = max(lumaCenter, max(max(lumaDown, lumaUp), max(lumaLeft, lumaRight)));
  float lumaRange = lumaMax - lumaMin;

  if (lumaRange < max(EDGE_THRESHOLD_MIN, lumaMax * EDGE_THRESHOLD_MAX)) {
    oColor = vec4(center, 1.0);
    return;
  }

  float lumaDownLeft = luma(textureOffset(uSource, vUv, ivec2(-1, -1)).rgb);
  float lumaUpRight = luma(textureOffset(uSource, vUv, ivec2(1, 1)).rgb);
  float lumaUpLeft = luma(textureOffset(uSource, vUv, ivec2(-1, 1)).rgb);
  float lumaDownRight = luma(textureOffset(uSource, vUv, ivec2(1, -1)).rgb);

  float lumaDownUp = lumaDown + lumaUp;
  float lumaLeftRight = lumaLeft + lumaRight;
  float lumaLeftCorners = lumaDownLeft + lumaUpLeft;
  float lumaDownCorners = lumaDownLeft + lumaDownRight;
  float lumaRightCorners = lumaDownRight + lumaUpRight;
  float lumaUpCorners = lumaUpRight + lumaUpLeft;

  float edgeHorizontal = abs(-2.0 * lumaLeft + lumaLeftCorners)
    + abs(-2.0 * lumaCenter + lumaDownUp) * 2.0
    + abs(-2.0 * lumaRight + lumaRightCorners);
  float edgeVertical = abs(-2.0 * lumaUp + lumaUpCorners)
    + abs(-2.0 * lumaCenter + lumaLeftRight) * 2.0
    + abs(-2.0 * lumaDown + lumaDownCorners);

  bool isHorizontal = edgeHorizontal >= edgeVertical;

  float luma1 = isHorizontal ? lumaDown : lumaLeft;
  float luma2 = isHorizontal ? lumaUp : lumaRight;
  float gradient1 = luma1 - lumaCenter;
  float gradient2 = luma2 - lumaCenter;
  bool is1Steepest = abs(gradient1) >= abs(gradient2);
  float gradientScaled = 0.25 * max(abs(gradient1), abs(gradient2));

  float stepLength = isHorizontal ? uInvResolution.y : uInvResolution.x;
  float lumaLocalAverage;
  if (is1Steepest) {
    stepLength = -stepLength;
    lumaLocalAverage = 0.5 * (luma1 + lumaCenter);
  } else {
    lumaLocalAverage = 0.5 * (luma2 + lumaCenter);
  }

  vec2 currentUv = vUv;
  if (isHorizontal) currentUv.y += stepLength * 0.5;
  else currentUv.x += stepLength * 0.5;

  vec2 offset = isHorizontal ? vec2(uInvResolution.x, 0.0) : vec2(0.0, uInvResolution.y);
  vec2 uv1 = currentUv - offset;
  vec2 uv2 = currentUv + offset;

  float lumaEnd1 = luma(texture(uSource, uv1).rgb) - lumaLocalAverage;
  float lumaEnd2 = luma(texture(uSource, uv2).rgb) - lumaLocalAverage;
  bool reached1 = abs(lumaEnd1) >= gradientScaled;
  bool reached2 = abs(lumaEnd2) >= gradientScaled;
  bool reachedBoth = reached1 && reached2;

  if (!reached1) uv1 -= offset;
  if (!reached2) uv2 += offset;

  if (!reachedBoth) {
    for (int i = 2; i < 12; i++) {
      if (!reached1) {
        lumaEnd1 = luma(texture(uSource, uv1).rgb) - lumaLocalAverage;
        reached1 = abs(lumaEnd1) >= gradientScaled;
      }
      if (!reached2) {
        lumaEnd2 = luma(texture(uSource, uv2).rgb) - lumaLocalAverage;
        reached2 = abs(lumaEnd2) >= gradientScaled;
      }
      if (!reached1) uv1 -= offset * 1.5;
      if (!reached2) uv2 += offset * 1.5;
      if (reached1 && reached2) break;
    }
  }

  float distance1 = isHorizontal ? (vUv.x - uv1.x) : (vUv.y - uv1.y);
  float distance2 = isHorizontal ? (uv2.x - vUv.x) : (uv2.y - vUv.y);
  bool isDirection1 = distance1 < distance2;
  float distanceFinal = min(distance1, distance2);
  float edgeThickness = distance1 + distance2;
  float pixelOffset = -distanceFinal / max(edgeThickness, 1e-5) + 0.5;

  bool isLumaCenterSmaller = lumaCenter < lumaLocalAverage;
  bool correctVariation = ((isDirection1 ? lumaEnd1 : lumaEnd2) < 0.0) != isLumaCenterSmaller;
  float finalOffset = correctVariation ? pixelOffset : 0.0;

  float lumaAverage = (1.0 / 12.0) * (2.0 * (lumaDownUp + lumaLeftRight) + lumaLeftCorners + lumaRightCorners);
  float subPixelOffset1 = clamp(abs(lumaAverage - lumaCenter) / max(lumaRange, 1e-5), 0.0, 1.0);
  float subPixelOffset2 = (-2.0 * subPixelOffset1 + 3.0) * subPixelOffset1 * subPixelOffset1;
  float subPixelOffsetFinal = subPixelOffset2 * subPixelOffset2 * SUBPIXEL_QUALITY;

  finalOffset = max(finalOffset, subPixelOffsetFinal);

  vec2 finalUv = vUv;
  if (isHorizontal) finalUv.y += finalOffset * stepLength;
  else finalUv.x += finalOffset * stepLength;

  oColor = vec4(texture(uSource, finalUv).rgb, 1.0);
}
`;

export const UPSAMPLE_FS = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uSource;
out vec4 oColor;

void main() {
  oColor = texture(uSource, vUv);
}
`;
