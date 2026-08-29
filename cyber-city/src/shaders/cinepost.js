import { HASH_GLSL, PACKING_GLSL, TONEMAP_GLSL } from './common.js';

export const CINE_DOF_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uInvSize;
uniform float uNear;
uniform float uFar;
uniform float uFocusDistance;
uniform float uFocusRange;
uniform float uMaxCoc;
uniform int uSamples;
uniform float uFrame;
uniform float uAspect;

out vec4 oColor;

float cocFor(float depth) {
  if (depth >= 1.0) return uMaxCoc;
  float linear = linearizeDepth(depth, uNear, uFar);
  float d = abs(linear - uFocusDistance);
  return clamp((d - uFocusRange) / max(uFocusRange * 3.0, 0.001), 0.0, 1.0) * uMaxCoc;
}

void main() {
  float centreDepth = texture(uDepth, vUv).r;
  float centreCoc = cocFor(centreDepth);
  float centreLinear = centreDepth >= 1.0 ? uFar : linearizeDepth(centreDepth, uNear, uFar);

  vec3 sum = texture(uColor, vUv).rgb;
  float weightSum = 1.0;
  float maxCoc = centreCoc;

  float angleOffset = hash12(gl_FragCoord.xy + uFrame * 5.31) * 6.2831853;
  float count = float(uSamples);

  for (int i = 0; i < 32; i++) {
    if (i >= uSamples) break;
    float fi = float(i);
    float t = (fi + 0.5) / count;
    float angle = angleOffset + fi * 2.39996323;
    float r = sqrt(t);
    vec2 offset = vec2(cos(angle) / uAspect, sin(angle)) * r * centreCoc;
    vec2 uv = vUv + offset;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;

    float d = texture(uDepth, uv).r;
    float coc = cocFor(d);
    float linear = d >= 1.0 ? uFar : linearizeDepth(d, uNear, uFar);

    float w = (linear > centreLinear) ? 1.0 : smoothstep(0.0, centreCoc + 1e-4, coc);
    sum += texture(uColor, uv).rgb * w;
    weightSum += w;
    maxCoc = max(maxCoc, coc);
  }

  oColor = vec4(sum / max(weightSum, 1e-4), centreCoc);
}
`;

export const CINE_DOF_COMPOSITE_FS = `#version 300 es
precision highp float;

${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uSharp;
uniform sampler2D uBlur;
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocusDistance;
uniform float uFocusRange;
uniform float uMaxCoc;
uniform float uStrength;

out vec4 oColor;

void main() {
  float depth = texture(uDepth, vUv).r;
  float coc;
  if (depth >= 1.0) {
    coc = uMaxCoc;
  } else {
    float linear = linearizeDepth(depth, uNear, uFar);
    float d = abs(linear - uFocusDistance);
    coc = clamp((d - uFocusRange) / max(uFocusRange * 3.0, 0.001), 0.0, 1.0) * uMaxCoc;
  }
  float mixAmount = clamp(coc / max(uMaxCoc, 1e-4), 0.0, 1.0);
  mixAmount = smoothstep(0.0, 1.0, mixAmount) * uStrength;
  vec3 sharp = texture(uSharp, vUv).rgb;
  vec3 blur = texture(uBlur, vUv).rgb;
  oColor = vec4(mix(sharp, blur, mixAmount), 1.0);
}
`;

export const CINE_MOTION_BLUR_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}

in vec2 vUv;

uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uStrength;
uniform float uMaxVelocity;
uniform int uSamples;
uniform float uFrame;

out vec4 oColor;

void main() {
  float depth = texture(uDepth, vUv).r;
  vec3 world = worldFromDepth(vUv, min(depth, 0.999995), uInvViewProj);
  vec4 prevClip = uPrevViewProj * vec4(world, 1.0);
  if (prevClip.w <= 0.0) {
    oColor = vec4(texture(uColor, vUv).rgb, 1.0);
    return;
  }
  vec2 prevUv = (prevClip.xy / prevClip.w) * 0.5 + 0.5;
  vec2 velocity = (vUv - prevUv) * uStrength;
  float len = length(velocity);
  if (len < 1e-4) {
    oColor = vec4(texture(uColor, vUv).rgb, 1.0);
    return;
  }
  if (len > uMaxVelocity) velocity *= uMaxVelocity / len;

  float jitter = hash12(gl_FragCoord.xy + uFrame * 9.17) - 0.5;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  float count = float(uSamples);
  for (int i = 0; i < 24; i++) {
    if (i >= uSamples) break;
    float t = ((float(i) + 0.5 + jitter) / count) - 0.5;
    vec2 uv = clamp(vUv - velocity * t, vec2(0.0), vec2(1.0));
    float w = 1.0 - abs(t) * 0.6;
    sum += texture(uColor, uv).rgb * w;
    total += w;
  }
  oColor = vec4(sum / max(total, 1e-4), 1.0);
}
`;

export const CINE_RADIAL_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec2 vUv;

uniform sampler2D uSource;
uniform vec2 uCentre;
uniform float uBlurAmount;
uniform float uLineAmount;
uniform float uLineSpeed;
uniform float uTime;
uniform float uAspect;
uniform vec3 uLineColor;
uniform int uSamples;

out vec4 oColor;

void main() {
  vec2 dir = vUv - uCentre;
  vec3 col = texture(uSource, vUv).rgb;

  if (uBlurAmount > 0.0005) {
    float jitter = hash12(gl_FragCoord.xy + uTime * 60.0) * 0.5;
    vec3 sum = vec3(0.0);
    float total = 0.0;
    float count = float(uSamples);
    for (int i = 0; i < 20; i++) {
      if (i >= uSamples) break;
      float t = (float(i) + jitter) / count;
      float scale = 1.0 - uBlurAmount * t;
      vec2 uv = uCentre + dir * scale;
      float w = 1.0 - t * 0.55;
      sum += texture(uSource, clamp(uv, vec2(0.0), vec2(1.0))).rgb * w;
      total += w;
    }
    col = sum / max(total, 1e-4);
  }

  if (uLineAmount > 0.0005) {

    vec2 d = vec2(dir.x * uAspect, dir.y);
    float radius = length(d);
    float angle = atan(d.y, d.x);
    float lane = floor(angle * 74.0 + hash11(floor(uTime * 3.0)) * 20.0);
    float h = hash11(lane * 0.731);
    float speed = 0.55 + h * 1.8;
    float phase = fract(radius * 1.35 - uTime * uLineSpeed * speed + h);
    float streak = pow(1.0 - phase, 9.0) * step(0.66, hash11(lane * 1.917 + floor(uTime * 1.4)));
    float radialMask = smoothstep(0.26, 0.92, radius);
    float thin = 0.5 + 0.5 * cos(angle * 74.0 * 3.14159);
    col += uLineColor * streak * radialMask * pow(thin, 4.0) * uLineAmount * 0.55;
  }

  oColor = vec4(col, 1.0);
}
`;

export const CINE_SHATTER_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aNdc;
layout(location = 1) in vec2 aCentroid;
layout(location = 2) in vec4 aShard;

uniform float uProgress;
uniform vec2 uImpact;
uniform float uAspect;
uniform float uSpread;
uniform float uSpin;
uniform float uApproach;

out vec2 vFrameUv;
out vec2 vLocal;
out vec3 vShardNormal;
flat out float vRadius;
flat out float vShardT;
flat out float vSeed;

float sh(float n) {
  return fract(sin(n * 12.9898) * 43758.5453123);
}

vec3 rot(vec3 v, vec3 axis, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main() {
  float id = aShard.x;
  vFrameUv = aNdc * 0.5 + 0.5;
  vRadius = aShard.w;
  vSeed = id;

  vec2 fromImpact = aCentroid - uImpact;
  float impactDist = length(vec2(fromImpact.x * uAspect, fromImpact.y));

  float delay = clamp(impactDist * 0.30, 0.0, 0.6);
  float t = clamp((uProgress - delay) / max(1.0 - delay, 0.001), 0.0, 1.0);
  vShardT = t;

  vec3 local = vec3((aNdc - aCentroid) * vec2(uAspect, 1.0), 0.0);

  float s1 = sh(id * 1.13);
  float s2 = sh(id * 2.71 + 4.0);
  float s3 = sh(id * 5.17 + 9.0);
  vec3 axis = normalize(vec3(s1 - 0.5, s2 - 0.5, s3 - 0.5) + vec3(0.001, 0.0, 0.0));

  float move = smoothstep(0.0, 0.10, t);
  local = rot(local, axis, t * t * uSpin * (0.6 + s1 * 1.9)) * mix(1.0, 1.0, move);

  vec2 outward = normalize(fromImpact + vec2(s1 - 0.5, s2 - 0.5) * 0.35 + 1e-5);
  float speed = uSpread * (0.55 + s3 * 1.1);
  float approach = uApproach * (0.35 + s2 * 1.5);

  vec3 centre = vec3(aCentroid * vec2(uAspect, 1.0), 0.0);
  centre.xy += outward * speed * t * t * move;
  centre.y -= 0.55 * t * t * t * uSpread * 0.5;
  centre.z += approach * t * t;

  vec3 p = centre + local;
  vShardNormal = rot(vec3(0.0, 0.0, 1.0), axis, t * t * uSpin * (0.6 + s1 * 1.9));
  vLocal = local.xy;

  float persp = 1.0 / max(1.0 - p.z * 0.85, 0.08);
  vec2 ndc = vec2(p.x / uAspect, p.y) * persp;

  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const CINE_SHATTER_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec2 vFrameUv;
in vec2 vLocal;
in vec3 vShardNormal;
flat in float vRadius;
flat in float vShardT;
flat in float vSeed;

uniform sampler2D uFrame;
uniform float uProgress;
uniform vec3 uEdgeColor;
uniform float uEdgeIntensity;
uniform float uRefraction;
uniform float uTime;

out vec4 oColor;

void main() {
  float d = length(vLocal) / max(vRadius, 1e-4);
  float edge = smoothstep(0.55, 1.0, d);

  vec2 refract = normalize(vLocal + 1e-5) * uRefraction * vShardT * (0.4 + 0.9 * hash11(vSeed * 3.1));
  vec2 uv = clamp(vFrameUv + refract, vec2(0.0), vec2(1.0));
  vec3 col = texture(uFrame, uv).rgb;

  float facing = abs(normalize(vShardNormal).z);
  float glint = pow(1.0 - facing, 3.0);
  col *= mix(1.0, 0.55 + 0.9 * facing, smoothstep(0.0, 0.25, vShardT));
  col += uEdgeColor * glint * 1.4 * smoothstep(0.0, 0.3, vShardT);

  float crackPop = smoothstep(0.0, 0.06, uProgress) * (1.0 - smoothstep(0.05, 0.55, uProgress)) * 2.4;
  float line = edge * (uEdgeIntensity + crackPop);
  col += uEdgeColor * line;

  float fade = 1.0 - smoothstep(0.72, 1.0, vShardT);
  if (fade <= 0.001) discard;

  oColor = vec4(col * fade, 1.0);
}
`;

export const CINE_COMPOSITE_FS = `#version 300 es
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
uniform float uVignetteSoft;
uniform float uGrain;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uTint;
uniform vec2 uResolution;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uLetterbox;
uniform float uFadeAmount;
uniform vec3 uFadeColor;
uniform float uBleach;
uniform float uHalation;
uniform float uGateWeave;
uniform float uAspect;

out vec4 oColor;

vec3 sampleChromatic(sampler2D tex, vec2 uv, float amount) {
  vec2 centre = uv - 0.5;
  float r2 = dot(centre, centre);
  vec2 offset = centre * r2 * amount;
  vec3 c;
  c.r = texture(tex, uv - offset).r;
  c.g = texture(tex, uv).g;
  c.b = texture(tex, uv + offset).b;
  return c;
}

void main() {
  vec2 uv = vUv;

  if (uGateWeave > 0.0) {
    float t = uTime * 0.7;
    uv += vec2(sin(t * 3.1) * 0.5 + sin(t * 7.7) * 0.25,
               cos(t * 2.6) * 0.5 + sin(t * 5.3) * 0.2) * uGateWeave * 0.0016;
  }

  vec3 hdr = uChromatic > 0.0001 ? sampleChromatic(uColor, uv, uChromatic) : texture(uColor, uv).rgb;
  vec3 bloom = texture(uBloom, uv).rgb;
  hdr += bloom * uBloomIntensity;

  if (uHalation > 0.0001) {
    vec3 warm = bloom * vec3(1.0, 0.62, 0.34);
    hdr += warm * uHalation;
  }

  hdr *= uExposure;
  hdr += uFlashColor * uFlash;

  vec3 color = acesFilm(hdr);

  color = uLift + color * uGain;
  color *= uTint;

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);
  color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);

  if (uBleach > 0.0001) {
    vec3 bleached = 1.0 - (1.0 - color) * (1.0 - vec3(luma));
    color = mix(color, bleached, uBleach);
  }

  vec2 vp = (uv - 0.5) * vec2(uAspect, 1.0);
  float r = length(vp);
  float vig = 1.0 - smoothstep(uVignetteSoft, uVignetteSoft + 1.05, r) * uVignette;
  color *= clamp(vig, 0.0, 1.0);

  float grain = hash12(gl_FragCoord.xy + fract(uTime) * 431.7) - 0.5;
  float grain2 = hash12(gl_FragCoord.xy * 0.5 + fract(uTime * 1.7) * 97.3) - 0.5;
  color += (grain * 0.7 + grain2 * 0.3) * uGrain * (0.35 + 0.65 * (1.0 - luma));

  color = mix(color, uFadeColor, clamp(uFadeAmount, 0.0, 1.0));

  if (uLetterbox > 0.0001) {
    float bar = uLetterbox * 0.5;
    float mask = step(bar, vUv.y) * step(vUv.y, 1.0 - bar);
    float soft = smoothstep(bar - 0.002, bar + 0.002, vUv.y)
               * smoothstep(1.0 - bar + 0.002, 1.0 - bar - 0.002, vUv.y);
    color *= max(mask, soft);
  }

  color = linearToSrgb(clamp(color, 0.0, 1.0));
  float dither = (hash12(gl_FragCoord.xy * 1.7 + fract(uTime) * 97.0) - 0.5) / 255.0;
  color += dither;

  oColor = vec4(color, 1.0);
}
`;

export const CINE_TRANSITION_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec2 vUv;

uniform sampler2D uSource;
uniform sampler2D uPrevious;
uniform int uMode;
uniform float uProgress;
uniform vec2 uCentre;
uniform vec3 uColor;
uniform float uAspect;
uniform float uSoftness;
uniform float uTime;
uniform float uAngle;

out vec4 oColor;

void main() {
  vec3 live = texture(uSource, vUv).rgb;
  vec3 held = texture(uPrevious, vUv).rgb;
  float p = clamp(uProgress, 0.0, 1.0);
  vec2 d = (vUv - uCentre) * vec2(uAspect, 1.0);
  float radius = length(d);
  vec3 result = live;

  if (uMode == 0) {

    result = mix(held, live, p);
  } else if (uMode == 1) {

    float edge = p * 1.6;
    float m = smoothstep(edge, edge - uSoftness, radius);
    result = mix(held, live, 1.0 - m);
  } else if (uMode == 2) {

    float edge = (1.0 - p) * 1.6;
    float m = smoothstep(edge - uSoftness, edge, radius);
    result = mix(live, uColor, m);
  } else if (uMode == 3) {

    float a = atan(d.y, d.x) + uAngle;
    float norm = fract(a / 6.2831853 + 0.5);
    float m = smoothstep(p - uSoftness, p + uSoftness, norm);
    result = mix(live, held, m);
  } else if (uMode == 4) {

    float n = hash12(floor(gl_FragCoord.xy * 0.5) + 0.5);
    float n2 = hash12(floor(gl_FragCoord.xy * 0.125) + 11.0);
    float threshold = p * 1.3 - 0.15 + n2 * 0.25;
    float m = smoothstep(threshold, threshold + uSoftness, n);
    result = mix(live, held, m);
    float front = 1.0 - smoothstep(0.0, uSoftness * 1.6, abs(n - threshold));
    result += uColor * front * 1.4 * (1.0 - abs(p * 2.0 - 1.0));
  } else if (uMode == 5) {

    float bars = 7.0;
    float lane = floor(vUv.y * bars);
    float dir = mod(lane, 2.0) * 2.0 - 1.0;
    float x = dir > 0.0 ? vUv.x : 1.0 - vUv.x;
    float m = smoothstep(p, p - uSoftness, x);
    result = mix(held, live, 1.0 - m);
  } else if (uMode == 6) {

    float edge = p * 1.9;
    float m = smoothstep(edge - uSoftness * 2.0, edge, radius);
    result = mix(uColor, live, m);
    result += uColor * (1.0 - m) * 0.6;
  }

  oColor = vec4(result, 1.0);
}
`;

export const CINE_TEXT_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec2 vUv;

uniform sampler2D uSource;
uniform sampler2D uText;
uniform vec4 uRect;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uGlow;
uniform float uTime;
uniform float uScatter;

out vec4 oColor;

void main() {
  vec3 col = texture(uSource, vUv).rgb;
  vec2 local = (vUv - uRect.xy) / uRect.zw;
  if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0 && uOpacity > 0.001) {
    vec2 tuv = vec2(local.x, 1.0 - local.y);
    float a = texture(uText, tuv).a;

    float g = 0.0;
    for (int i = 0; i < 8; i++) {
      float ang = float(i) * 0.7853981;
      vec2 o = vec2(cos(ang), sin(ang)) * 0.008;
      g += texture(uText, tuv + o).a;
    }
    g /= 8.0;

    float scatter = uScatter * (hash12(floor(gl_FragCoord.xy * 0.35) + floor(uTime * 12.0)) - 0.5);
    float mask = clamp(a + scatter * a, 0.0, 1.0);

    col = mix(col, uColor, mask * uOpacity);
    col += uColor * g * uGlow * uOpacity;
  }
  oColor = vec4(col, 1.0);
}
`;

export const CINE_FOG_FS = (skyLib) => `#version 300 es
precision highp float;

${HASH_GLSL}
${PACKING_GLSL}
${skyLib}

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
uniform float uFogFloor;
uniform float uSkyFog;
uniform int uUseScatter;
uniform vec2 uScatterTexel;

out vec4 oColor;

void main() {
  float depth = texture(uDepth, vUv).r;
  vec3 world = worldFromDepth(vUv, min(depth, 0.99999), uInvViewProj);
  vec3 ray = world - uCameraPos;
  float dist = length(ray);
  vec3 dir = ray / max(dist, 1e-5);

  float startH = uCameraPos.y - uFogFloor;
  float endH = world.y - uFogFloor;
  float fogAmount;
  if (abs(dir.y) < 1e-4) {
    fogAmount = uFogDensity * dist * exp(-startH / uFogHeight);
  } else {
    fogAmount = uFogDensity * uFogHeight / dir.y * (exp(-startH / uFogHeight) - exp(-endH / uFogHeight));
  }
  fogAmount = clamp(abs(fogAmount), 0.0, 1.0);
  float distanceFog = 1.0 - exp(-dist / max(uFogDistance, 1.0));
  fogAmount = 1.0 - (1.0 - fogAmount) * (1.0 - distanceFog);

  if (depth >= 1.0) fogAmount = clamp(uSkyFog, 0.0, 0.92);

  float glow = pow(clamp(1.0 - abs(dir.y), 0.0, 1.0), 4.0);
  vec3 sky = cineSky(dir);
  vec3 fogCol = mix(uFogColor, sky, 0.72) + uFogGlow * glow * 0.4;

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
