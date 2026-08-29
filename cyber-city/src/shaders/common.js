export const HASH_GLSL = `
uint hashU32(uint x) {
  uint h = x * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28) + 4u)) ^ h) * 277803737u;
  return (h >> 22) ^ h;
}
uint hash2u(int x, int y) {
  return hashU32(hashU32(uint(x)) ^ (uint(y) * 2654435761u));
}
uint hash3u(int x, int y, int z) {
  return hashU32(hash2u(x, y) ^ (uint(z) * 1597334677u));
}
float rand1(int x) { return float(hashU32(uint(x))) * 2.3283064365386963e-10; }
float rand2(int x, int y) { return float(hash2u(x, y)) * 2.3283064365386963e-10; }
float rand3(int x, int y, int z) { return float(hash3u(x, y, z)) * 2.3283064365386963e-10; }

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += valueNoise(p) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2.02;
  }
  return sum / norm;
}

float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash33(i).x;
  float n100 = hash33(i + vec3(1.0, 0.0, 0.0)).x;
  float n010 = hash33(i + vec3(0.0, 1.0, 0.0)).x;
  float n110 = hash33(i + vec3(1.0, 1.0, 0.0)).x;
  float n001 = hash33(i + vec3(0.0, 0.0, 1.0)).x;
  float n101 = hash33(i + vec3(1.0, 0.0, 1.0)).x;
  float n011 = hash33(i + vec3(0.0, 1.0, 1.0)).x;
  float n111 = hash33(i + vec3(1.0, 1.0, 1.0)).x;
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}

float fbm3(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += valueNoise3(p) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2.03;
  }
  return sum / norm;
}
`;

export const LAYOUT_GLSL = `
const float CITY_CELL = 70.0;
const float AVENUE_HALF = 13.0;
const float STREET_HALF = 7.0;
const float ALLEY_HALF = 4.5;
const float SIDEWALK_WIDTH = 4.2;

float gridLineCenter(int i) {
  int j = int(hashU32(uint(i) ^ 0x9e3779b9u) % 1000u) - 500;
  return float(i) * CITY_CELL + (float(j) / 500.0) * CITY_CELL * 0.22;
}

float gridLineHalf(int i) {
  uint r = hashU32(hashU32(uint(i)) ^ 0x51ed2701u) % 100u;
  if (r < 10u) return AVENUE_HALF;
  if (r < 74u) return STREET_HALF;
  return ALLEY_HALF;
}

struct AxisInfo {
  int cell;
  float roadDist;
  float roadCenter;
  float roadHalf;
  int roadIndex;
};

AxisInfo axisQuery(float p) {
  int base = int(floor(p / CITY_CELL));
  AxisInfo info;
  info.roadDist = 1e9;
  info.cell = base;
  info.roadIndex = base;
  info.roadCenter = 0.0;
  info.roadHalf = STREET_HALF;
  for (int k = -1; k <= 2; k++) {
    int idx = base + k;
    float c = gridLineCenter(idx);
    float h = gridLineHalf(idx);
    float d = abs(p - c) - h;
    if (d < info.roadDist) {
      info.roadDist = d;
      info.roadCenter = c;
      info.roadHalf = h;
      info.roadIndex = idx;
    }
    if (p >= c) info.cell = idx;
  }
  return info;
}

float districtDensity(vec2 world) {
  float d = fbm(world * 0.00105 + vec2(13.7, 41.2), 4);
  float ridge = fbm(world * 0.00042 + vec2(91.3, 7.1), 3);
  return clamp(pow(clamp(d * 0.65 + ridge * 0.55, 0.0, 1.0), 1.35), 0.0, 1.0);
}

float districtCharacter(vec2 world) {
  return fbm(world * 0.00083 + vec2(203.5, 88.9), 3);
}

int districtType(vec2 world, float density) {
  float c = districtCharacter(world);
  if (density > 0.70) return 0;
  if (c > 0.570) return 1;
  if (c < 0.390) return 2;
  return 3;
}
`;

export const PACKING_GLSL = `
vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.xz;
  if (n.y < 0.0) {
    e = (1.0 - abs(n.zx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.z >= 0.0 ? 1.0 : -1.0);
  }
  return e * 0.5 + 0.5;
}

vec3 octDecode(vec2 f) {
  f = f * 2.0 - 1.0;
  vec3 n = vec3(f.x, 1.0 - abs(f.x) - abs(f.y), f.y);
  float t = max(-n.y, 0.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.z += n.z >= 0.0 ? -t : t;
  return normalize(n);
}

float linearizeDepth(float d, float near, float far) {
  float z = d * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}

vec3 worldFromDepth(vec2 uv, float depth, mat4 invViewProj) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = invViewProj * clip;
  return world.xyz / world.w;
}
`;

export const BRDF_GLSL = `
const float PI = 3.14159265359;
const float INV_PI = 0.31830988618;

float distributionGGX(float NdotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-7);
}

float geometrySmith(float NdotV, float NdotL, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) * 0.125;
  float gv = NdotV / (NdotV * (1.0 - k) + k);
  float gl = NdotL / (NdotL * (1.0 - k) + k);
  return gv * gl;
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  float f = pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  return f0 + (1.0 - f0) * f;
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 f0, float roughness) {
  float f = pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  return f0 + (max(vec3(1.0 - roughness), f0) - f0) * f;
}

vec3 evaluateBRDF(vec3 N, vec3 V, vec3 L, vec3 albedo, float metallic, float roughness) {
  vec3 H = normalize(V + L);
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);
  vec3 f0 = mix(vec3(0.04), albedo, metallic);
  float D = distributionGGX(NdotH, roughness);
  float G = geometrySmith(NdotV, NdotL, roughness);
  vec3 F = fresnelSchlick(VdotH, f0);
  vec3 specular = (D * G * F) / max(4.0 * NdotV * NdotL, 1e-5);
  vec3 kd = (vec3(1.0) - F) * (1.0 - metallic);
  return (kd * albedo * INV_PI + specular) * NdotL;
}
`;

export const TONEMAP_GLSL = `
vec3 acesFilm(vec3 x) {
  const mat3 inputMat = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 outputMat = mat3(
    1.60475, -0.10208, -0.00327,
    -0.53108, 1.10813, -0.07276,
    -0.07367, -0.00605, 1.07602);
  vec3 v = inputMat * x;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(outputMat * (a / b), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}
`;

export const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SCENE_UNIFORMS = `
uniform mat4 uViewProj;
uniform mat4 uInvViewProj;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uInvProj;
uniform mat4 uPrevViewProj;
uniform vec3 uCameraPos;
uniform vec2 uResolution;
uniform vec2 uInvResolution;
uniform float uTime;
uniform float uNear;
uniform float uFar;
`;
