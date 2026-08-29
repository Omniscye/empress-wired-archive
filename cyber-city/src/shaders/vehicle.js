import { HASH_GLSL } from './common.js';

export const VEHICLE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTangent;
layout(location = 3) in vec4 iOrigin;
layout(location = 4) in vec4 iSize;
layout(location = 5) in vec4 iTint;

uniform mat4 uViewProj;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
flat out vec3 vObjNormal;
flat out vec4 vTint;
flat out vec4 vSize;

void main() {
  vec3 local = vec3(aPosition.x * iSize.x, aPosition.y * iSize.y, aPosition.z * iSize.z);
  float c = cos(iOrigin.w);
  float s = sin(iOrigin.w);
  vec3 rotated = vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
  vec3 world = iOrigin.xyz + rotated;

  vWorld = world;
  vNormal = vec3(c * aNormal.x + s * aNormal.z, aNormal.y, -s * aNormal.x + c * aNormal.z);
  vLocal = vec3(aPosition.x, aPosition.y, aPosition.z);
  vObjNormal = aNormal;
  vTint = iTint;
  vSize = iSize;

  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const VEHICLE_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
flat in vec3 vObjNormal;
flat in vec4 vTint;
flat in vec4 vSize;

uniform float uTime;
uniform float uEmissiveScale;

layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oEmissive;

void main() {
  float seed = vSize.w;
  bool air = vTint.w > 0.5;

  float x = vLocal.x;
  float y = vLocal.y;
  float z = vLocal.z;
  vec3 n = vObjNormal;

  vec3 paint = mix(vec3(0.030, 0.032, 0.040), vec3(0.075, 0.062, 0.058), hash11(seed));
  paint = mix(paint, vec3(0.045, 0.050, 0.062), hash11(seed + 3.1));
  float roughness = 0.16;
  float metallic = 0.55;
  vec3 albedo = paint;
  vec3 emissive = vec3(0.0);

  bool side = abs(n.x) > 0.5;
  bool front = n.z > 0.5;
  bool back = n.z < -0.5;
  bool top = n.y > 0.5;

  float glassBand = step(0.54, y) * step(y, 0.90);

  if (side) {
    float cabin = glassBand * step(abs(z), 0.62);
    albedo = mix(albedo, vec3(0.012, 0.014, 0.020), cabin);
    roughness = mix(roughness, 0.20, cabin);
    metallic = mix(metallic, 0.2, cabin);
    emissive += vTint.rgb * cabin * 0.07;

    float accent = step(0.26, y) * step(y, 0.315) * step(abs(z), 0.94);
    emissive += vTint.rgb * accent * (air ? 1.1 : 0.45);

    float arch = step(0.55, abs(z)) * step(y, 0.24);
    albedo = mix(albedo, vec3(0.010), arch * (air ? 0.0 : 0.9));
  } else if (front) {
    float lamp = step(0.42, abs(x)) * step(abs(x), 0.93) * step(0.34, y) * step(y, 0.56);
    emissive += vTint.rgb * lamp * (air ? 5.0 : 9.0);
    albedo = mix(albedo, vec3(0.02), lamp);
    float grille = step(0.18, y) * step(y, 0.32);
    albedo = mix(albedo, vec3(0.014), grille * 0.8);
    float screen = glassBand;
    albedo = mix(albedo, vec3(0.012, 0.014, 0.020), screen);
    roughness = mix(roughness, 0.16, screen);
  } else if (back) {
    float lamp = step(0.40, abs(x)) * step(abs(x), 0.94) * step(0.36, y) * step(y, 0.54);
    emissive += vec3(1.0, 0.10, 0.05) * lamp * 4.2;
    albedo = mix(albedo, vec3(0.02), lamp);
    float screen = glassBand;
    albedo = mix(albedo, vec3(0.012, 0.014, 0.020), screen);
    roughness = mix(roughness, 0.18, screen);
  } else if (top) {
    float roofGlass = step(abs(z), 0.55) * step(abs(x), 0.72);
    albedo = mix(albedo, vec3(0.014, 0.016, 0.024), roofGlass);
    roughness = mix(roughness, 0.14, roofGlass);
    emissive += vTint.rgb * roofGlass * 0.05;
    if (air) {
      float beacon = step(0.78, abs(z)) * step(abs(x), 0.3);
      emissive += vec3(1.0, 0.16, 0.10) * beacon * step(0.55, fract(uTime * 1.5 + seed)) * 5.0;
    }
  } else {
    albedo = paint * 0.35;
    roughness = 0.6;
    if (air) {
      emissive += vTint.rgb * 1.9 * step(abs(z), 0.85) * step(abs(x), 0.85);
    }
  }

  float speck = fbm(vec2(x * 9.0, z * 9.0) + seed, 2);
  albedo *= 0.85 + 0.3 * speck;

  oAlbedo = vec4(albedo, metallic);
  oNormal = vec4(normalize(vNormal), clamp(roughness, 0.03, 1.0));
  oEmissive = vec4(emissive * uEmissiveScale, 1.0);
}
`;
