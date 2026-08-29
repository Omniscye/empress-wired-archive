import { HASH_GLSL, LAYOUT_GLSL } from './common.js';

export const GROUND_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aGrid;

uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform float uGroundExtent;

out vec3 vWorld;

void main() {
  vec2 shaped = sign(aGrid) * aGrid * aGrid;
  vec2 world = uCameraPos.xz + shaped * uGroundExtent;
  vWorld = vec3(world.x, 0.0, world.y);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

export const GROUND_FS = `#version 300 es
precision highp float;

${HASH_GLSL}
${LAYOUT_GLSL}

in vec3 vWorld;

uniform float uTime;
uniform float uWetness;
uniform float uRainIntensity;
uniform vec3 uCameraPos;

layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oEmissive;

vec3 rainRipples(vec2 p, float strength) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 sp = p * (4.6 + fi * 3.1) + fi * 13.7;
    vec2 id = floor(sp);
    vec2 f = fract(sp) - 0.5;
    vec2 off = (hash22(id + fi * 17.0) - 0.5) * 0.7;
    float phase = hash12(id + fi * 5.3);
    float t = fract(uTime * 1.55 + phase);
    float d = length(f - off);
    float r = t * 0.46;
    float w = smoothstep(0.07, 0.0, abs(d - r)) * (1.0 - t) * (1.0 - smoothstep(0.28, 0.48, d));
    vec2 dir = (f - off) / max(d, 1e-4);
    n.xz += dir * w * strength;
  }
  return normalize(n);
}

float dashedLine(float across, float along, float center, float halfWidth, float dashLen, float gap) {
  float band = smoothstep(halfWidth, halfWidth * 0.35, abs(across - center));
  float period = dashLen + gap;
  float d = step(fract(along / period), dashLen / period);
  return band * d;
}

float solidLine(float across, float center, float halfWidth) {
  return smoothstep(halfWidth, halfWidth * 0.35, abs(across - center));
}

void main() {
  vec2 p = vWorld.xz;
  AxisInfo ax = axisQuery(p.x);
  AxisInfo az = axisQuery(p.y);

  float roadDist = min(ax.roadDist, az.roadDist);
  bool onRoad = roadDist < 0.0;
  bool intersection = ax.roadDist < 0.0 && az.roadDist < 0.0;

  bool alongZ = ax.roadDist <= az.roadDist;
  float across = alongZ ? p.x - ax.roadCenter : p.y - az.roadCenter;
  float along = alongZ ? p.y : p.x;
  float halfWidth = alongZ ? ax.roadHalf : az.roadHalf;

  vec3 albedo;
  float roughness;
  float metallic = 0.02;
  vec3 emissive = vec3(0.0);
  vec3 normal = vec3(0.0, 1.0, 0.0);

  float coarse = fbm(p * 0.09 + 4.3, 4);
  float grain = fbm(p * 7.5, 3);

  if (onRoad) {
    vec3 asphalt = vec3(0.020, 0.021, 0.024);
    albedo = asphalt * (0.62 + 0.9 * grain);
    albedo *= 0.75 + 0.5 * coarse;

    float repaved = smoothstep(0.56, 0.63, fbm(p * 0.22 + 19.0, 3));
    albedo = mix(albedo, asphalt * 1.7, repaved * 0.55);

    float crack = smoothstep(0.03, 0.0, abs(fbm(p * 0.55 + 71.0, 4) - 0.5) - 0.005);
    albedo *= mix(1.0, 0.45, crack);

    float markings = 0.0;
    if (!intersection) {
      if (halfWidth > 10.0) {
        markings += solidLine(across, 0.0, 0.22);
        markings += solidLine(across, 0.0, 0.5) * 0.0;
        markings += dashedLine(across, along, halfWidth * 0.5, 0.14, 3.0, 4.5);
        markings += dashedLine(across, along, -halfWidth * 0.5, 0.14, 3.0, 4.5);
      } else if (halfWidth > 6.0) {
        markings += dashedLine(across, along, 0.0, 0.14, 2.6, 4.0);
      }
      markings += solidLine(abs(across), halfWidth - 0.75, 0.13);
      markings = clamp(markings, 0.0, 1.0);
      float faded = 0.35 + 0.65 * smoothstep(0.35, 0.75, fbm(vec2(along * 0.4, across) + 5.0, 3));
      markings *= faded;
    } else {
      float edgeX = ax.roadHalf - abs(p.x - ax.roadCenter);
      float edgeZ = az.roadHalf - abs(p.y - az.roadCenter);
      float stripeZone = 0.0;
      if (edgeX < 3.2 && edgeZ > 1.0) stripeZone = step(0.45, fract(p.y * 0.55)) * smoothstep(3.2, 2.2, edgeX);
      if (edgeZ < 3.2 && edgeX > 1.0) stripeZone = max(stripeZone, step(0.45, fract(p.x * 0.55)) * smoothstep(3.2, 2.2, edgeZ));
      markings = stripeZone * (0.4 + 0.6 * smoothstep(0.3, 0.7, fbm(p * 0.6, 3)));
    }

    albedo = mix(albedo, vec3(0.46, 0.44, 0.36), markings * 0.9);

    float manhole = 0.0;
    vec2 mid = floor(p / 9.0);
    if (hash12(mid + 3.1) > 0.86) {
      vec2 mc = (mid + 0.5 + (hash22(mid) - 0.5) * 0.6) * 9.0;
      float md = length(p - mc);
      manhole = smoothstep(0.62, 0.55, md);
      float ring = smoothstep(0.04, 0.0, abs(md - 0.52));
      albedo = mix(albedo, vec3(0.030, 0.028, 0.026) * (0.6 + 0.8 * fract(md * 9.0)), manhole);
      albedo = mix(albedo, vec3(0.05, 0.045, 0.04), ring * 0.8);
      metallic = mix(metallic, 0.7, manhole);
    }

    float puddleField = fbm(p * 0.32 + 27.0, 4);
    float gutter = smoothstep(halfWidth, halfWidth - 1.6, abs(across));
    float puddle = smoothstep(0.52, 0.66, puddleField + (1.0 - gutter) * 0.12) * uWetness;
    puddle = max(puddle, smoothstep(0.15, 0.0, halfWidth - abs(across)) * uWetness * 0.7);

    float baseRough = mix(0.72, 0.20, uWetness);
    roughness = mix(baseRough * (0.75 + 0.5 * grain), 0.028, puddle);
    albedo *= mix(1.0, 0.34, puddle * 0.9);
    albedo *= mix(1.0, 0.6, uWetness * 0.5);

    normal = mix(normal, rainRipples(p, 0.55 * uRainIntensity), clamp(puddle + uWetness * 0.35, 0.0, 1.0));
  } else {
    vec3 concrete = vec3(0.030, 0.030, 0.032);
    albedo = concrete * (0.7 + 0.8 * grain) * (0.8 + 0.4 * coarse);
    float puddle = smoothstep(0.55, 0.68, fbm(p * 0.4 + 61.0, 4)) * uWetness;
    roughness = mix(mix(0.88, 0.45, uWetness), 0.04, puddle);
    albedo *= mix(1.0, 0.45, puddle);
    normal = mix(normal, rainRipples(p, 0.4 * uRainIntensity), puddle);
  }

  float viewDist = length(p - uCameraPos.xz);
  float fadeOut = smoothstep(0.0, 220.0, viewDist);
  roughness = mix(roughness, clamp(roughness + 0.18, 0.0, 1.0), fadeOut * 0.55);

  float farFade = smoothstep(150.0, 430.0, viewDist);
  if (farFade > 0.001) {
    float density = districtDensity(p);
    float curbBand = smoothstep(2.6, 0.0, abs(roadDist));
    vec3 spill = vec3(1.0, 0.70, 0.40);
    emissive += spill * curbBand * density * 0.75 * farFade;
    if (onRoad) emissive += spill * density * 0.085 * farFade;
  }

  oAlbedo = vec4(albedo, metallic);
  oNormal = vec4(normalize(normal), clamp(roughness, 0.02, 1.0));
  oEmissive = vec4(emissive, 0.85);
}
`;
