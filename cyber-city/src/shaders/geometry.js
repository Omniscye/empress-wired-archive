import { HASH_GLSL, PACKING_GLSL } from './common.js';

export const BUILDING_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTangent;
layout(location = 3) in vec4 iOrigin;
layout(location = 4) in vec4 iSize;
layout(location = 5) in vec4 iAlbedo;
layout(location = 6) in vec4 iSurface;
layout(location = 7) in vec4 iEmissive;

uniform mat4 uViewProj;
uniform vec3 uCameraPos;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
flat out vec3 vObjNormal;
flat out vec4 vAlbedo;
flat out vec4 vSurface;
flat out vec4 vEmissive;
flat out vec4 vSize;

void main() {
  vec3 local = vec3(aPosition.x * iSize.x, aPosition.y * iSize.y, aPosition.z * iSize.z);
  float c = cos(iOrigin.w);
  float s = sin(iOrigin.w);
  vec3 rotated = vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
  vec3 world = iOrigin.xyz + rotated;
  vec3 n = vec3(c * aNormal.x + s * aNormal.z, aNormal.y, -s * aNormal.x + c * aNormal.z);

  vWorld = world;
  vNormal = n;
  vLocal = local;
  vObjNormal = aNormal;
  vAlbedo = iAlbedo;
  vSurface = iSurface;
  vEmissive = iEmissive;
  vSize = iSize;

  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const BUILDING_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
flat in vec3 vObjNormal;
flat in vec4 vAlbedo;
flat in vec4 vSurface;
flat in vec4 vEmissive;
flat in vec4 vSize;

uniform float uTime;
uniform float uWetness;
uniform vec3 uCameraPos;
uniform float uEmissiveScale;
uniform float uDetailFade;

layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oEmissive;

float panelLines(vec2 p, float pitch, float width) {
  vec2 g = abs(fract(p / pitch) - 0.5) * pitch;
  float d = min(g.x, g.y);
  return smoothstep(width, width * 2.2, d);
}

float bandNoise(float x) {
  return hash11(floor(x) * 0.3719);
}

void facade(int seed, vec2 uv, float wallSpan, out vec3 albedo, out vec3 emissive, out float roughness, out float metallic, out vec3 normalOffset) {
  float floorHeight = vEmissive.w;
  float litFraction = vSurface.y;
  float windowDensity = vSurface.x;
  bool glass = vAlbedo.w > 3.5 && vAlbedo.w < 4.5;

  float styleSeed = hash11(float(seed) * 0.0413 + 0.17);
  bool ribbon = !glass && styleSeed > 0.92;
  float colPitch = floorHeight * (glass ? 0.52 : mix(0.30, 0.46, hash11(float(seed) * 0.0271)));
  float fIndex = floor(uv.y / floorHeight);
  float cIndex = floor(uv.x / colPitch);
  vec2 cell = vec2(fract(uv.x / colPitch), fract(uv.y / floorHeight));

  int fi = int(fIndex);
  int ci = int(cIndex);

  float baseFloors = 1.0 + step(0.5, hash11(float(seed) * 0.017));
  bool podiumFloor = fIndex < baseFloors;

  float mechPeriod = 9.0 + floor(hash11(float(seed) * 0.031) * 8.0);
  bool mechFloor = mod(fIndex, mechPeriod) < 0.5 && fIndex > 2.0;

  float marginX = mix(0.26, 0.11, windowDensity) * (glass ? 0.55 : 1.0);
  float marginY = mix(0.42, 0.26, windowDensity) * (glass ? 0.72 : 1.0);
  if (ribbon) marginX = 0.07;

  vec2 edgeSoft = vec2(0.035, 0.03);
  vec2 inner = smoothstep(vec2(marginX) - edgeSoft, vec2(marginX) + edgeSoft, cell)
             * smoothstep(vec2(marginX, marginY) - edgeSoft, vec2(marginX, marginY) + edgeSoft, 1.0 - cell);
  inner.y = smoothstep(marginY - edgeSoft.y, marginY + edgeSoft.y, cell.y)
          * smoothstep(marginY - edgeSoft.y, marginY + edgeSoft.y, 1.0 - cell.y);
  float windowMask = inner.x * inner.y;

  float paneCount = glass ? 2.0 : (ribbon ? 3.0 : 1.0);
  if (paneCount > 1.0) {
    float paneU = fract(cell.x * paneCount);
    float mullion = smoothstep(0.0, 0.045, paneU) * smoothstep(0.0, 0.045, 1.0 - paneU);
    windowMask *= mix(1.0, mullion, 0.95);
  }
  float transom = smoothstep(0.0, 0.05, abs(cell.y - (marginY + (1.0 - 2.0 * marginY) * 0.72)));
  windowMask *= mix(1.0, transom, glass ? 0.35 : 0.55);

  float concrete = 0.55 + 0.45 * hash12(vec2(cIndex * 3.7, fIndex * 1.3));
  float grime = fbm(uv * 0.28 + float(seed), 3);
  float streak = fbm(vec2(uv.x * 1.6, uv.y * 0.08) + float(seed) * 0.7, 3);

  vec3 wall = vAlbedo.rgb * (0.68 + 0.55 * concrete);
  wall *= mix(1.0, 0.55, grime * 0.7);
  wall *= mix(1.0, 0.72, smoothstep(0.4, 0.85, streak) * 0.6);

  float seam = panelLines(uv, colPitch, 0.035);
  wall *= mix(0.55, 1.0, seam);

  float floorSlab = 1.0 - smoothstep(0.0, 0.06, cell.y);
  wall *= mix(1.0, 0.7, floorSlab);

  albedo = wall;
  roughness = vSurface.w * (0.85 + 0.3 * grime);
  metallic = glass ? 0.22 : 0.02;

  if (mechFloor || podiumFloor) {
    windowMask *= podiumFloor ? 1.0 : 0.0;
  }

  int roomIndex = ribbon ? ci / 2 : ci;
  float slot = rand3(roomIndex, fi, seed);
  float runSeed = rand3(roomIndex / 3, fi, seed + 7);
  float floorSeed = rand1(fi * 131 + seed);
  float occupancy = litFraction * (0.55 + 0.9 * runSeed);
  bool lit = slot < occupancy;

  if (floorSeed > 0.965) lit = true;
  if (floorSeed < 0.045) lit = false;
  if (podiumFloor) lit = slot < min(0.95, litFraction * 1.9);

  float flickerId = rand3(roomIndex, fi, seed + 991);
  float lum = (0.30 + 1.15 * rand3(roomIndex, fi, seed + 313)) * (0.72 + 0.56 * rand1(fi * 977 + seed));

  if (flickerId > 0.975) {
    float f = step(0.35, hash11(floor(uTime * 9.0 + flickerId * 50.0)));
    lum *= mix(0.15, 1.25, f);
  } else if (flickerId > 0.93) {
    lum *= 0.72 + 0.42 * sin(uTime * (1.4 + flickerId * 6.0) + flickerId * 30.0);
  }

  vec3 windowColor = vEmissive.rgb;
  float tintShift = rand3(roomIndex, fi, seed + 77);
  windowColor = mix(windowColor, windowColor.bgr, step(0.93, tintShift) * 0.75);
  windowColor = mix(windowColor, vec3(dot(windowColor, vec3(0.33))), (tintShift - 0.5) * 0.3);

  float blindTop = 0.15 + 0.7 * rand3(roomIndex, fi, seed + 451);
  float blinds = step(0.78, rand3(roomIndex, fi, seed + 133));
  float blindMask = mix(1.0, step(cell.y, blindTop), blinds);

  float glow = windowMask * (lit ? 1.0 : 0.0) * lum * blindMask;

  albedo = mix(albedo, vAlbedo.rgb * 0.5, windowMask * (glass ? 0.9 : 0.55));
  roughness = mix(roughness, glass ? 0.05 : 0.14, windowMask * 0.9);
  metallic = mix(metallic, glass ? 0.55 : 0.15, windowMask);

  float depthShade = mix(0.62, 1.0, smoothstep(0.05, 0.6, cell.y));
  float furniture = step(0.68, rand3(roomIndex, fi, seed + 617)) * smoothstep(marginY + 0.20, marginY + 0.02, cell.y);
  float ceiling = smoothstep(1.0 - marginY - 0.02, 1.0 - marginY - 0.14, cell.y);
  glow *= mix(1.0, 0.18, furniture);
  glow *= mix(0.75, 1.0, ceiling);
  emissive = windowColor * glow * vSurface.z * 0.62 * depthShade;

  if (!lit && windowMask > 0.5) {
    emissive += windowColor * 0.010 * vSurface.z;
  }

  float spill = (1.0 - windowMask) * smoothstep(0.6, 0.0, min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y)));
  emissive += windowColor * spill * (lit ? 1.0 : 0.0) * lum * blindMask * vSurface.z * 0.11;
  albedo += windowColor * spill * (lit ? 1.0 : 0.0) * 0.012;

  vec2 edge = (cell - 0.5) * 2.0;
  float rim = windowMask * (1.0 - windowMask);
  normalOffset = vec3(edge.x * rim * 1.4, edge.y * rim * 1.4, 0.0);
}

void main() {
  int seed = int(vSize.w);
  vec3 n = normalize(vNormal);
  float kind = vAlbedo.w;
  vec3 albedo = vAlbedo.rgb;
  vec3 emissive = vec3(0.0);
  float roughness = vSurface.w;
  float metallic = 0.02;
  bool vertical = abs(vObjNormal.y) < 0.5;

  vec2 wallUv = vec2(abs(vObjNormal.x) > 0.5 ? vLocal.z : vLocal.x, vLocal.y);
  vec2 roofUv = vLocal.xz;

  if (kind < 0.5 || (kind > 3.5 && kind < 4.5)) {
    if (vertical) {
      vec3 offset;
      facade(seed, vec2(wallUv.x + vSize.x + vSize.z, wallUv.y), abs(vObjNormal.x) > 0.5 ? vSize.z : vSize.x, albedo, emissive, roughness, metallic, offset);
      vec3 tangent = abs(vObjNormal.x) > 0.5 ? vec3(0.0, 0.0, sign(vObjNormal.x)) : vec3(sign(vObjNormal.z), 0.0, 0.0);
      vec3 bitangent = vec3(0.0, 1.0, 0.0);
      n = normalize(n + tangent * offset.x * 0.28 + bitangent * offset.y * 0.28);
    } else {
      float gravel = fbm(roofUv * 3.2 + float(seed), 4);
      albedo = vAlbedo.rgb * (0.8 + 0.9 * gravel);
      float seam = panelLines(roofUv, 3.4, 0.05);
      albedo *= mix(0.6, 1.0, seam);
      roughness = mix(0.9, 0.24, uWetness * smoothstep(0.35, 0.62, gravel));
      albedo *= mix(1.0, 0.55, uWetness * smoothstep(0.35, 0.62, gravel));
      metallic = 0.03;
      if (vObjNormal.y < 0.0) {
        albedo = vAlbedo.rgb * 0.35;
        roughness = 0.85;
      }
    }
  } else if (kind < 1.5) {
    float panels = panelLines(vertical ? wallUv : roofUv, 2.6, 0.045);
    float grime = fbm((vertical ? wallUv : roofUv) * 0.55 + float(seed), 3);
    albedo = vAlbedo.rgb * (0.7 + 0.8 * grime);
    albedo *= mix(0.55, 1.0, panels);
    roughness = clamp(vSurface.w * (0.8 + 0.4 * grime), 0.15, 1.0);
    if (!vertical && vObjNormal.y > 0.0) {
      roughness = mix(roughness, 0.22, uWetness * 0.75);
      albedo *= mix(1.0, 0.6, uWetness * 0.7);
    }
  } else if (kind < 2.5) {
    vec2 uv = vertical ? wallUv : roofUv;
    float vents = step(0.55, fract(uv.x * 6.0)) * step(0.3, fract(uv.y * 5.0));
    float rust = fbm(uv * 2.4 + float(seed), 3);
    albedo = vAlbedo.rgb * (0.6 + 1.1 * rust);
    albedo = mix(albedo, albedo * 0.55, vents * 0.6);
    metallic = 0.55;
    roughness = clamp(vSurface.w * (0.7 + 0.5 * rust), 0.12, 1.0);
    emissive = vEmissive.rgb * vSurface.z;
  } else if (kind < 3.5) {
    vec2 uv = vertical ? wallUv : roofUv;
    float brushed = fbm(vec2(uv.x * 26.0, uv.y * 1.2) + float(seed), 3);
    albedo = vAlbedo.rgb * (0.75 + 0.6 * brushed);
    metallic = 0.75;
    roughness = clamp(vSurface.w * (0.6 + 0.6 * brushed), 0.08, 1.0);
  } else if (kind < 5.5) {
    albedo = vAlbedo.rgb * 0.8;
    metallic = 0.6;
    roughness = 0.45;
    float warn = step(0.5, fract(vLocal.y * 0.5));
    emissive = mix(vec3(0.0), vec3(1.0, 0.12, 0.06), warn * step(4.0, vSize.y) * 0.06);
  } else if (kind < 6.5) {
    vec2 uv = vertical ? wallUv : roofUv;
    float wear = fbm(uv * 1.4 + float(seed), 3);
    albedo = vAlbedo.rgb * (0.7 + 0.7 * wear);
    roughness = mix(0.65, 0.2, uWetness);
    metallic = 0.05;
    if (vertical) {
      float strip = smoothstep(0.06, 0.0, abs(fract(vLocal.y / vSize.y * 1.0) - 0.5) - 0.42);
      float dashes = step(0.35, fract(uv.x * 0.45 + uTime * 0.35));
      emissive = vEmissive.rgb * strip * (0.6 + 1.8 * dashes) * 1.4;
    }
    if (!vertical && vObjNormal.y > 0.0) {
      float lane = smoothstep(0.05, 0.0, abs(fract(uv.x * 0.5 + 0.5) - 0.5) - 0.4);
      emissive = vEmissive.rgb * lane * 0.35;
    }
  } else {
    if (!vertical && vObjNormal.y > 0.0) {
      vec2 p = vWorld.xz;
      vec2 slab = p / 1.35;
      vec2 cellId = floor(slab);
      vec2 f = fract(slab);
      float tone = 0.7 + 0.6 * hash12(cellId);
      float joint = smoothstep(0.0, 0.04, min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)));
      float grit = fbm(p * 5.5, 3);
      albedo = vAlbedo.rgb * tone * (0.75 + 0.5 * grit);
      albedo *= mix(0.42, 1.0, joint);
      float stain = smoothstep(0.5, 0.85, fbm(p * 0.42 + 11.0, 4));
      albedo *= mix(1.0, 0.55, stain * 0.8);

      float grate = step(0.968, hash12(floor(p / 2.6)));
      float grateBars = step(0.45, fract(p.x * 3.0));
      albedo = mix(albedo, vec3(0.02) * (0.4 + 0.6 * grateBars), grate * 0.85);

      float puddle = smoothstep(0.54, 0.68, fbm(p * 0.55 + 3.7, 4)) * uWetness;
      roughness = mix(mix(0.85, 0.42, uWetness), 0.045, puddle);
      albedo *= mix(1.0, 0.45, puddle);
      metallic = 0.02;
    } else if (vertical) {
      float wear = fbm(vec2(vWorld.x + vWorld.z, vLocal.y * 12.0) * 1.4, 3);
      albedo = vAlbedo.rgb * (0.5 + 0.7 * wear);
      float paint = smoothstep(0.100, 0.112, vLocal.y) * smoothstep(0.158, 0.146, vLocal.y);
      float dash = step(0.4, fract((vWorld.x + vWorld.z) * 0.22));
      albedo = mix(albedo, vec3(0.30, 0.28, 0.20) * (0.4 + 0.6 * wear), paint * dash * 0.85);
      roughness = mix(0.9, 0.35, uWetness);
      metallic = 0.02;
    } else {
      albedo = vAlbedo.rgb * 0.3;
      roughness = 0.9;
    }
  }

  float ao = clamp(0.42 + 0.58 * smoothstep(0.0, 14.0, vWorld.y), 0.0, 1.0);
  if (!vertical && vObjNormal.y > 0.0) ao = 1.0;
  if (kind > 6.5) ao = clamp(0.5 + 0.5 * smoothstep(0.0, 2.5, vWorld.y), 0.0, 1.0);

  oAlbedo = vec4(albedo, metallic);
  oNormal = vec4(normalize(n), clamp(roughness, 0.025, 1.0));
  oEmissive = vec4(emissive * uEmissiveScale, ao);
}
`;

export const SIGN_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTangent;
layout(location = 3) in vec4 iOrigin;
layout(location = 4) in vec4 iSize;
layout(location = 5) in vec4 iColor;
layout(location = 6) in vec4 iStyle;

uniform mat4 uViewProj;

out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
flat out vec4 vColor;
flat out vec4 vStyle;
flat out vec4 vSize;

void main() {
  float c = cos(iOrigin.w);
  float s = sin(iOrigin.w);
  vec3 tangent = vec3(c, 0.0, -s);
  vec3 normal = vec3(s, 0.0, c);
  vec3 world = iOrigin.xyz + tangent * (aPosition.x * iSize.x) + vec3(0.0, aPosition.y * iSize.y, 0.0);

  vWorld = world;
  vNormal = normal;
  vUv = vec2(aPosition.x * 0.5 + 0.5, aPosition.y);
  vColor = iColor;
  vStyle = iStyle;
  vSize = iSize;

  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const SIGN_FS = `#version 300 es
precision highp float;

${HASH_GLSL}

in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
flat in vec4 vColor;
flat in vec4 vStyle;
flat in vec4 vSize;

uniform float uTime;
uniform vec3 uCameraPos;
uniform float uEmissiveScale;

layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oEmissive;

float glyphBlock(vec2 uv, float seed, float density) {
  vec2 grid = vec2(density * 6.0, density * 2.4);
  vec2 cell = floor(uv * grid);
  vec2 f = fract(uv * grid);
  float on = step(0.34, hash12(cell + seed * 7.3));
  float bar = step(0.16, f.x) * step(f.x, 0.84) * step(0.12, f.y) * step(f.y, 0.88);
  float stroke = step(0.55, hash12(cell * 1.7 + seed));
  float inner = mix(1.0, step(0.42, abs(f.y - 0.5) * 2.0 + step(0.5, f.x) * 0.2), stroke);
  return on * bar * inner;
}

float tubeOutline(vec2 uv, float seed) {
  vec2 p = uv * vec2(4.0, 1.0);
  float d = 1.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(0.6 + fi * 1.4 + hash11(seed + fi) * 0.6, 0.5);
    float r = 0.22 + hash11(seed + fi * 3.1) * 0.16;
    d = min(d, abs(length(p - c) - r) - 0.035);
  }
  float bar = abs(p.y - 0.5) - 0.03;
  d = min(d, max(bar, -(p.x - 0.4)));
  return 1.0 - smoothstep(0.0, 0.035, d);
}

void main() {
  float pattern = vStyle.x;
  float seed = vSize.z;
  vec2 uv = vUv;
  float mask = 1.0;
  float scroll = vStyle.y * uTime;

  if (pattern < 0.5) {
    vec2 g = vec2(uv.x + scroll * 0.12, uv.y);
    mask = glyphBlock(g, seed, vStyle.w);
    mask = max(mask, step(0.965, 1.0 - abs(uv.y - 0.5) * 2.0));
  } else if (pattern < 1.5) {
    vec2 g = vec2(uv.y * 3.0 + scroll * 0.1, uv.x);
    float cells = floor(uv.y * vSize.y * 0.85);
    float on = step(0.25, hash12(vec2(cells, seed)));
    float inner = step(0.18, uv.x) * step(uv.x, 0.82);
    float rowGap = step(0.14, fract(uv.y * vSize.y * 0.85)) * step(fract(uv.y * vSize.y * 0.85), 0.86);
    mask = on * inner * rowGap;
    mask = max(mask, step(0.92, abs(uv.x - 0.5) * 2.0) * 0.55);
  } else if (pattern < 2.5) {
    mask = tubeOutline(vec2(fract(uv.x + scroll * 0.05), uv.y), seed);
  } else {
    vec2 g = uv;
    float bands = floor(g.y * 5.0);
    float shift = scroll + bands * 0.31;
    float img = fbm(vec2(g.x * 3.0 + shift, g.y * 4.0 + seed), 4);
    float edges = step(0.1, g.x) * step(g.x, 0.9) * step(0.06, g.y) * step(g.y, 0.94);
    mask = edges * smoothstep(0.35, 0.62, img);
    float scan = 0.72 + 0.28 * sin((g.y * vSize.y * 5.0) - uTime * 6.0);
    mask *= scan;
    mask = max(mask, edges * step(0.985, hash12(floor(g * vec2(60.0, 40.0)) + floor(uTime * 12.0))) * 0.9);
  }

  float flicker = 1.0;
  if (vStyle.z > 0.0) {
    float t = uTime * vStyle.z;
    float f = hash11(floor(t) + seed);
    float on = step(0.22, f);
    flicker = mix(0.12, 1.0, on) * (0.9 + 0.1 * sin(uTime * 60.0 + seed));
  }

  float rim = smoothstep(0.0, 0.03, uv.x) * smoothstep(0.0, 0.03, 1.0 - uv.x)
            * smoothstep(0.0, 0.02, uv.y) * smoothstep(0.0, 0.02, 1.0 - uv.y);

  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  float bodyMask = rim;
  vec3 body = vec3(0.012, 0.012, 0.014);

  float glow = mask * flicker * rim;
  vec3 emissive = vColor.rgb * glow * vColor.w * 1.55;
  emissive += vColor.rgb * rim * 0.035 * flicker;

  oAlbedo = vec4(body, 0.1);
  oNormal = vec4(n, 0.55);
  oEmissive = vec4(emissive * uEmissiveScale, 1.0);
}
`;
