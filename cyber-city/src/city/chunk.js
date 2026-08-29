import { Rng, hash2 } from './rng.js';
import {
  blockMin, blockMax, gridLineCenter, gridLineHalf,
  districtDensity, districtType,
  SIDEWALK_WIDTH, AVENUE_HALF,
  DISTRICT_CORE, DISTRICT_NEON, DISTRICT_INDUSTRIAL, DISTRICT_RESIDENTIAL,
} from './layout.js';
import { CellBuilder } from './builder.js';
import {
  FACADE_ALBEDO, WINDOW_EMISSIVE, SIGN_COLORS, STREET_LIGHT_COLORS,
  KIND_FACADE, KIND_PLAIN, KIND_MACHINERY, KIND_METAL, KIND_GLASS, KIND_MAST, KIND_ROAD_DECK, KIND_SIDEWALK,
} from './palette.js';

const HALF_PI = Math.PI * 0.5;
const FACE_YAW = [0, Math.PI, HALF_PI, -HALF_PI];

const DISTRICT_SETUP = [
  { minLot: 21, maxDepth: 2, gap: 1.6, plazaChance: 0.07 },
  { minLot: 10, maxDepth: 3, gap: 0.7, plazaChance: 0.05 },
  { minLot: 25, maxDepth: 1, gap: 2.4, plazaChance: 0.12 },
  { minLot: 15, maxDepth: 2, gap: 1.5, plazaChance: 0.08 },
];

function subdivide(x0, z0, x1, z1, rng, minLot, maxDepth) {
  const lots = [];
  const stack = [[x0, z0, x1, z1, 0]];
  while (stack.length) {
    const [ax0, az0, ax1, az1, depth] = stack.pop();
    const w = ax1 - ax0;
    const d = az1 - az0;
    const canSplitX = w > minLot * 2.05;
    const canSplitZ = d > minLot * 2.05;
    if (depth >= maxDepth || (!canSplitX && !canSplitZ) || (depth > 0 && rng.chance(0.2))) {
      if (w > 3 && d > 3) lots.push({ x0: ax0, z0: az0, x1: ax1, z1: az1 });
      continue;
    }
    const splitAlongX = canSplitX && (!canSplitZ || w >= d);
    const t = rng.range(0.37, 0.63);
    if (splitAlongX) {
      const m = ax0 + w * t;
      stack.push([ax0, az0, m, az1, depth + 1]);
      stack.push([m, az0, ax1, az1, depth + 1]);
    } else {
      const m = az0 + d * t;
      stack.push([ax0, az0, ax1, m, depth + 1]);
      stack.push([ax0, m, ax1, az1, depth + 1]);
    }
  }
  return lots;
}

function targetHeight(district, density, rng) {
  switch (district) {
    case DISTRICT_CORE: {
      const h = 62 + Math.pow(density, 1.55) * 330 * rng.range(0.5, 1.45);
      return rng.chance(0.07) ? h * rng.range(1.4, 2.0) : h;
    }
    case DISTRICT_NEON:
      return (9 + density * 34) * rng.range(0.65, 1.5);
    case DISTRICT_INDUSTRIAL:
      return (6 + density * 17) * rng.range(0.7, 1.5);
    default:
      return (15 + density * 72) * rng.range(0.6, 1.4);
  }
}

function facadeMaterial(district, rng, seed) {
  const albedo = rng.pick(FACADE_ALBEDO[district]);
  const emissive = rng.pick(WINDOW_EMISSIVE[district]);
  let kind = KIND_FACADE;
  let roughness = 0.72;
  let litFraction = 0.4;
  let windowDensity = 1.0;
  let floorHeight = 3.5;

  switch (district) {
    case DISTRICT_CORE:
      kind = rng.chance(0.62) ? KIND_GLASS : KIND_FACADE;
      roughness = kind === KIND_GLASS ? rng.range(0.06, 0.19) : rng.range(0.3, 0.55);
      litFraction = rng.range(0.22, 0.55);
      floorHeight = rng.range(3.7, 4.4);
      windowDensity = rng.range(0.85, 1.0);
      break;
    case DISTRICT_NEON:
      kind = KIND_FACADE;
      roughness = rng.range(0.4, 0.8);
      litFraction = rng.range(0.32, 0.68);
      floorHeight = rng.range(2.9, 3.5);
      windowDensity = rng.range(0.7, 1.0);
      break;
    case DISTRICT_INDUSTRIAL:
      kind = rng.chance(0.55) ? KIND_PLAIN : KIND_FACADE;
      roughness = rng.range(0.6, 0.95);
      litFraction = rng.range(0.04, 0.22);
      floorHeight = rng.range(4.2, 6.5);
      windowDensity = rng.range(0.25, 0.6);
      break;
    default:
      kind = KIND_FACADE;
      roughness = rng.range(0.45, 0.8);
      litFraction = rng.range(0.20, 0.50);
      floorHeight = rng.range(3.0, 3.5);
      windowDensity = rng.range(0.6, 0.95);
      break;
  }

  return { albedo, emissive, kind, roughness, litFraction, windowDensity, floorHeight, seed };
}

function addRoofRailing(b, rng, cx, cz, hx, hz, y, seed) {
  const t = 0.09;
  const h = rng.range(0.9, 1.3);
  const albedo = [0.045, 0.046, 0.05];
  b.box({ x: cx, y, z: cz + hz - t, yaw: 0, hx, height: h, hz: t, seed, albedo, kind: KIND_METAL, roughness: 0.55 });
  b.box({ x: cx, y, z: cz - hz + t, yaw: 0, hx, height: h, hz: t, seed: seed + 1, albedo, kind: KIND_METAL, roughness: 0.55 });
  b.box({ x: cx + hx - t, y, z: cz, yaw: 0, hx: t, height: h, hz, seed: seed + 2, albedo, kind: KIND_METAL, roughness: 0.55 });
  b.box({ x: cx - hx + t, y, z: cz, yaw: 0, hx: t, height: h, hz, seed: seed + 3, albedo, kind: KIND_METAL, roughness: 0.55 });
}

function addRoofClutter(b, rng, cx, cz, hx, hz, y, district, seed) {
  const metal = [0.052, 0.050, 0.048];
  const dark = [0.038, 0.038, 0.040];

  if (Math.min(hx, hz) > 2.4 && rng.chance(0.85)) {
    addRoofRailing(b, rng, cx, cz, hx, hz, y, seed);
  }

  const units = rng.int(1, Math.min(6, Math.max(1, Math.floor(hx * hz * 0.05))));
  for (let i = 0; i < units; i++) {
    const uw = rng.range(0.6, Math.max(0.8, Math.min(hx, hz) * 0.4));
    const ud = rng.range(0.6, Math.max(0.8, Math.min(hx, hz) * 0.4));
    const px = cx + rng.range(-hx + uw + 0.4, hx - uw - 0.4);
    const pz = cz + rng.range(-hz + ud + 0.4, hz - ud - 0.4);
    b.box({
      x: px, y, z: pz, yaw: 0,
      hx: uw, height: rng.range(0.7, 2.2), hz: ud,
      seed: seed + i * 7, albedo: metal, kind: KIND_MACHINERY, roughness: rng.range(0.5, 0.85),
    });
  }

  if (Math.min(hx, hz) > 3.0 && rng.chance(0.6)) {
    const sw = rng.range(1.4, Math.min(3.0, Math.min(hx, hz) * 0.55));
    b.box({
      x: cx + rng.range(-hx * 0.4, hx * 0.4), y, z: cz + rng.range(-hz * 0.4, hz * 0.4), yaw: 0,
      hx: sw, height: rng.range(2.2, 3.4), hz: sw * rng.range(0.7, 1.3),
      seed: seed + 41, albedo: dark, kind: KIND_PLAIN, roughness: 0.8,
    });
  }

  if (district === DISTRICT_INDUSTRIAL || district === DISTRICT_NEON) {
    const tanks = rng.int(0, 2);
    for (let i = 0; i < tanks; i++) {
      const r = rng.range(0.9, Math.max(1.0, Math.min(hx, hz) * 0.35));
      const px = cx + rng.range(-hx + r + 0.3, hx - r - 0.3);
      const pz = cz + rng.range(-hz + r + 0.3, hz - r - 0.3);
      const legH = rng.range(0.8, 2.0);
      b.box({ x: px, y, z: pz, yaw: rng.range(0, Math.PI), hx: r * 0.28, height: legH, hz: r * 0.28, seed: seed + 60 + i, albedo: dark, kind: KIND_METAL, roughness: 0.7 });
      b.box({ x: px, y: y + legH, z: pz, yaw: rng.range(0, Math.PI), hx: r, height: rng.range(1.6, 3.0), hz: r, seed: seed + 70 + i, albedo: metal, kind: KIND_METAL, roughness: rng.range(0.35, 0.7) });
    }
  }

  if (district === DISTRICT_INDUSTRIAL && rng.chance(0.35)) {
    const stackH = rng.range(10, 26);
    const px = cx + rng.range(-hx * 0.5, hx * 0.5);
    const pz = cz + rng.range(-hz * 0.5, hz * 0.5);
    b.box({ x: px, y, z: pz, yaw: 0, hx: rng.range(0.7, 1.4), height: stackH, hz: rng.range(0.7, 1.4), seed: seed + 91, albedo: [0.06, 0.045, 0.038], kind: KIND_METAL, roughness: 0.85 });
    b.light(px, y + stackH + 0.5, pz, 22, [1.0, 0.42, 0.12], 5.5, 0, 0.7, 0.75, rng.float() * 20.0);
  }
}

function addMast(b, rng, cx, cz, y, height, seed) {
  const albedo = [0.05, 0.048, 0.05];
  b.box({ x: cx, y, z: cz, yaw: 0, hx: 0.16, height, hz: 0.16, seed, albedo, kind: KIND_MAST, roughness: 0.6 });
  const rings = rng.int(1, 3);
  for (let i = 0; i < rings; i++) {
    const ry = y + height * ((i + 1) / (rings + 1));
    const rw = rng.range(0.5, 1.2);
    b.box({ x: cx, y: ry, z: cz, yaw: rng.range(0, Math.PI), hx: rw, height: 0.1, hz: rw, seed: seed + i, albedo, kind: KIND_MAST, roughness: 0.6 });
  }
}

function buildingFaces(lot, block) {
  const faces = [];
  if (lot.z1 >= block.z1 - 0.4) faces.push(0);
  if (lot.z0 <= block.z0 + 0.4) faces.push(1);
  if (lot.x1 >= block.x1 - 0.4) faces.push(2);
  if (lot.x0 <= block.x0 + 0.4) faces.push(3);
  return faces;
}

function faceAnchor(face, cx, cz, hx, hz, along, out) {
  switch (face) {
    case 0: out[0] = cx + along; out[1] = cz + hz; out[2] = 0; out[3] = hx; break;
    case 1: out[0] = cx - along; out[1] = cz - hz; out[2] = Math.PI; out[3] = hx; break;
    case 2: out[0] = cx + hx; out[1] = cz - along; out[2] = HALF_PI; out[3] = hz; break;
    default: out[0] = cx - hx; out[1] = cz + along; out[2] = -HALF_PI; out[3] = hz; break;
  }
  return out;
}

function faceNormal(face) {
  switch (face) {
    case 0: return [0, 1];
    case 1: return [0, -1];
    case 2: return [1, 0];
    default: return [-1, 0];
  }
}

function addFacadeSigns(b, rng, cx, cz, hx, hz, baseY, height, district, faces, seed) {
  if (faces.length === 0) return;
  const density = district === DISTRICT_NEON ? rng.int(3, 8)
    : district === DISTRICT_CORE ? rng.int(0, 2)
    : district === DISTRICT_RESIDENTIAL ? rng.int(0, 2)
    : rng.int(0, 1);

  const anchor = [0, 0, 0, 0];
  for (let i = 0; i < density; i++) {
    const face = faces[Math.floor(rng.float() * faces.length) % faces.length];
    const halfExtent = face === 0 || face === 1 ? hx : hz;
    if (halfExtent < 1.2) continue;
    const vertical = rng.chance(district === DISTRICT_NEON ? 0.45 : 0.2);
    const color = rng.pick(SIGN_COLORS);
    const n = faceNormal(face);

    if (vertical) {
      const signH = rng.range(3.5, Math.min(16, Math.max(4, height * 0.55)));
      const signW = rng.range(0.5, 1.1);
      const along = rng.range(-halfExtent + signW + 0.3, halfExtent - signW - 0.3);
      const y = rng.range(4.0, Math.max(4.5, height - signH - 1.0));
      faceAnchor(face, cx, cz, hx, hz, along, anchor);
      const px = anchor[0] + n[0] * rng.range(0.9, 2.2);
      const pz = anchor[1] + n[1] * rng.range(0.9, 2.2);
      b.sign({
        x: px, y, z: pz, yaw: anchor[2] + HALF_PI,
        halfWidth: signW, height: signH, seed: seed + i * 13, tilt: 0,
        color, intensity: rng.range(2.4, 6.0),
        pattern: 1, scroll: rng.range(-0.6, 0.6), flicker: rng.chance(0.25) ? rng.range(0.4, 3.0) : 0,
        glyph: rng.range(2.0, 5.0),
      });
      b.light(px, y + signH * 0.5, pz, rng.range(9, 17), color, rng.range(2.2, 5.0), 0);
    } else {
      const signW = rng.range(1.6, Math.max(2.0, halfExtent * 0.9));
      const signH = rng.range(0.9, 3.2);
      const along = rng.range(-halfExtent + signW + 0.2, halfExtent - signW - 0.2);
      const y = rng.range(3.2, Math.max(3.6, height - signH - 1.0));
      faceAnchor(face, cx, cz, hx, hz, along, anchor);
      const px = anchor[0] + n[0] * 0.22;
      const pz = anchor[1] + n[1] * 0.22;
      b.sign({
        x: px, y, z: pz, yaw: anchor[2],
        halfWidth: signW, height: signH, seed: seed + i * 29, tilt: 0,
        color, intensity: rng.range(2.0, 5.5),
        pattern: rng.chance(0.3) ? 2 : 0, scroll: rng.range(-0.5, 0.5),
        flicker: rng.chance(0.18) ? rng.range(0.5, 4.0) : 0,
        glyph: rng.range(1.5, 4.5),
      });
      b.light(px + n[0] * 1.2, y + signH * 0.5, pz + n[1] * 1.2, rng.range(10, 20), color, rng.range(2.5, 6.0), 0);
    }
  }
}

function addRoofBillboard(b, rng, cx, cz, hx, hz, y, seed) {
  const face = rng.int(0, 3);
  const halfExtent = face === 0 || face === 1 ? hx : hz;
  if (halfExtent < 3.0) return;
  const anchor = [0, 0, 0, 0];
  faceAnchor(face, cx, cz, hx, hz, 0, anchor);
  const color = rng.pick(SIGN_COLORS);
  const signW = halfExtent * rng.range(0.7, 1.0);
  const signH = rng.range(4.0, 11.0);
  const n = faceNormal(face);
  const px = anchor[0] + n[0] * 0.5;
  const pz = anchor[1] + n[1] * 0.5;
  b.sign({
    x: px, y: y + rng.range(0.6, 2.4), z: pz, yaw: anchor[2],
    halfWidth: signW, height: signH, seed, tilt: 0,
    color, intensity: rng.range(2.6, 5.4),
    pattern: 3, scroll: rng.range(0.06, 0.32), flicker: 0, glyph: rng.range(1.0, 2.4),
  });
  b.box({
    x: px + n[0] * 0.35, y, z: pz + n[1] * 0.35, yaw: 0,
    hx: face === 0 || face === 1 ? signW : 0.22,
    height: y > 0 ? signH * 0.4 : 1,
    hz: face === 0 || face === 1 ? 0.22 : signW,
    seed: seed + 3, albedo: [0.035, 0.035, 0.038], kind: KIND_MAST, roughness: 0.7,
  });
  b.light(px + n[0] * 4.0, y + signH * 0.5, pz + n[1] * 4.0, rng.range(22, 40), color, rng.range(4.0, 9.0), 0);
}

function buildTower(b, rng, lot, block, district, density) {
  const gap = DISTRICT_SETUP[district].gap;
  const x0 = lot.x0 + gap * 0.5;
  const x1 = lot.x1 - gap * 0.5;
  const z0 = lot.z0 + gap * 0.5;
  const z1 = lot.z1 - gap * 0.5;
  let hx = (x1 - x0) * 0.5;
  let hz = (z1 - z0) * 0.5;
  if (hx < 1.4 || hz < 1.4) return null;
  let cx = (x0 + x1) * 0.5;
  let cz = (z0 + z1) * 0.5;

  const seed = rng.next() % 65536;
  const mat = facadeMaterial(district, rng, seed);
  const faces = buildingFaces(lot, block);
  let height = targetHeight(district, density, rng);
  height = Math.min(height, 430);

  let y = 0;

  if (district === DISTRICT_CORE && height > 130 && rng.chance(0.55)) {
    const podiumH = rng.range(9, 20);
    b.box({
      x: cx, y: 0, z: cz, yaw: 0, hx, height: podiumH, hz,
      seed, albedo: mat.albedo, kind: KIND_FACADE,
      windowDensity: mat.windowDensity, litFraction: mat.litFraction * 1.2,
      emissiveBoost: 1.0, roughness: Math.min(0.9, mat.roughness + 0.25),
      emissive: mat.emissive, floorHeight: rng.range(4.5, 6.0),
    });
    b.markSolid(cx, cz, hx, hz, podiumH);
    y = podiumH;
    height -= podiumH;
    const shrink = rng.range(0.6, 0.82);
    hx *= shrink;
    hz *= shrink;
    cx += rng.range(-1, 1) * (1 - shrink) * hx * 0.5;
    cz += rng.range(-1, 1) * (1 - shrink) * hz * 0.5;
  }

  let segments = 1;
  if (district === DISTRICT_CORE) segments = rng.int(2, 4);
  else if (district === DISTRICT_RESIDENTIAL) segments = rng.int(1, 2);
  else if (district === DISTRICT_NEON) segments = rng.int(1, 2);

  const topInfo = { cx, cz, hx, hz, y: 0 };
  let remaining = height;
  for (let s = 0; s < segments; s++) {
    const isLast = s === segments - 1;
    const segH = isLast ? remaining : remaining * rng.range(0.34, 0.62);
    remaining -= segH;
    b.box({
      x: cx, y, z: cz, yaw: 0, hx, height: segH, hz,
      seed: seed + s * 17, albedo: mat.albedo, kind: mat.kind,
      windowDensity: mat.windowDensity,
      litFraction: mat.litFraction * (1.0 - s * 0.06),
      emissiveBoost: 1.0, roughness: mat.roughness,
      emissive: mat.emissive, floorHeight: mat.floorHeight,
    });
    y += segH;
    b.markSolid(cx, cz, hx, hz, y);
    topInfo.cx = cx; topInfo.cz = cz; topInfo.hx = hx; topInfo.hz = hz; topInfo.y = y;
    if (!isLast) {
      const shrink = rng.range(0.66, 0.9);
      const nhx = hx * shrink;
      const nhz = hz * shrink;
      cx += rng.range(-1, 1) * (hx - nhx) * 0.7;
      cz += rng.range(-1, 1) * (hz - nhz) * 0.7;
      hx = nhx;
      hz = nhz;
    }
  }

  addRoofClutter(b, rng, topInfo.cx, topInfo.cz, topInfo.hx, topInfo.hz, topInfo.y, district, seed);

  const totalHeight = topInfo.y;

  if (district === DISTRICT_CORE && rng.chance(0.55)) {
    addMast(b, rng, topInfo.cx, topInfo.cz, topInfo.y, rng.range(10, 46), seed + 200);
  } else if (rng.chance(0.3)) {
    addMast(b, rng, topInfo.cx + rng.range(-topInfo.hx, topInfo.hx) * 0.6, topInfo.cz + rng.range(-topInfo.hz, topInfo.hz) * 0.6, topInfo.y, rng.range(3, 10), seed + 210);
  }

  if (totalHeight > 55) {
    b.light(topInfo.cx, topInfo.y + 1.5, topInfo.cz, 26, [1.0, 0.09, 0.06], 6.5, 0, 0.9, 0.92, (seed % 100) * 0.07);
  }

  addFacadeSigns(b, rng, cx, cz, hx, hz, y - remaining, totalHeight, district, faces, seed + 300);

  const billboardChance = district === DISTRICT_NEON ? 0.5 : district === DISTRICT_CORE ? 0.28 : 0.16;
  if (rng.chance(billboardChance)) {
    addRoofBillboard(b, rng, topInfo.cx, topInfo.cz, topInfo.hx, topInfo.hz, topInfo.y, seed + 400);
  }

  return { cx: topInfo.cx, cz: topInfo.cz, hx: topInfo.hx, hz: topInfo.hz, height: totalHeight };
}

function addStreetFurniture(b, rng, block, district, density) {
  const inset = SIDEWALK_WIDTH * 0.55;
  const edges = [
    { x0: block.x0, x1: block.x1, fixed: block.z0 - inset, axis: 'x', dx: 0, dz: -1 },
    { x0: block.x0, x1: block.x1, fixed: block.z1 + inset, axis: 'x', dx: 0, dz: 1 },
    { x0: block.z0, x1: block.z1, fixed: block.x0 - inset, axis: 'z', dx: -1, dz: 0 },
    { x0: block.z0, x1: block.z1, fixed: block.x1 + inset, axis: 'z', dx: 1, dz: 0 },
  ];

  const lampColor = rng.pick(STREET_LIGHT_COLORS);
  const spacing = district === DISTRICT_NEON ? rng.range(11, 16) : rng.range(15, 24);
  const poleAlbedo = [0.04, 0.04, 0.042];

  for (const edge of edges) {
    const length = edge.x1 - edge.x0;
    if (length < spacing * 0.6) continue;
    const count = Math.max(1, Math.floor(length / spacing));
    const step = length / count;
    for (let i = 0; i < count; i++) {
      const t = edge.x0 + step * (i + 0.5);
      const px = edge.axis === 'x' ? t : edge.fixed;
      const pz = edge.axis === 'x' ? edge.fixed : t;
      const poleH = rng.range(6.6, 8.8);
      const armLen = rng.range(1.3, 2.2);
      const headX = px + edge.dx * armLen;
      const headZ = pz + edge.dz * armLen;
      b.box({ x: px, y: 0, z: pz, yaw: 0, hx: 0.105, height: poleH, hz: 0.105, seed: i, albedo: poleAlbedo, kind: KIND_METAL, roughness: 0.55 });
      b.box({
        x: px + edge.dx * armLen * 0.5, y: poleH - 0.22, z: pz + edge.dz * armLen * 0.5, yaw: 0,
        hx: edge.dx !== 0 ? armLen * 0.5 : 0.07, height: 0.13, hz: edge.dz !== 0 ? armLen * 0.5 : 0.07,
        seed: i + 2, albedo: poleAlbedo, kind: KIND_METAL, roughness: 0.55,
      });
      b.box({
        x: headX, y: poleH - 0.34, z: headZ, yaw: 0,
        hx: edge.dx !== 0 ? 0.42 : 0.18, height: 0.15, hz: edge.dz !== 0 ? 0.42 : 0.18,
        seed: i + 3, albedo: poleAlbedo, kind: KIND_MACHINERY, roughness: 0.4,
        emissive: lampColor, emissiveBoost: 1.4,
      });
      b.light(headX, poleH - 0.6, headZ, rng.range(16, 23), lampColor, rng.range(7.0, 12.0), 0.75);

      if (district === DISTRICT_NEON && rng.chance(0.35)) {
        const color = rng.pick(SIGN_COLORS);
        const yaw = edge.axis === 'x' ? (edge.fixed > block.z1 ? 0 : Math.PI) : (edge.fixed > block.x1 ? HALF_PI : -HALF_PI);
        b.sign({
          x: px, y: rng.range(2.6, 4.2), z: pz, yaw,
          halfWidth: rng.range(1.0, 2.2), height: rng.range(0.7, 1.6), seed: i * 7, tilt: 0,
          color, intensity: rng.range(2.0, 4.5), pattern: 0,
          scroll: rng.range(-0.4, 0.4), flicker: rng.chance(0.3) ? rng.range(1.0, 4.0) : 0, glyph: rng.range(2.0, 4.0),
        });
        b.light(px, 3.4, pz, 11, color, 3.0, 0);
      }
    }
  }

  if (district === DISTRICT_INDUSTRIAL || density < 0.3) return;
  const benches = rng.int(0, 3);
  for (let i = 0; i < benches; i++) {
    const onX = rng.chance(0.5);
    const t = rng.range(0, 1);
    const px = onX ? block.x0 + (block.x1 - block.x0) * t : (rng.chance(0.5) ? block.x0 - inset : block.x1 + inset);
    const pz = onX ? (rng.chance(0.5) ? block.z0 - inset : block.z1 + inset) : block.z0 + (block.z1 - block.z0) * t;
    b.box({ x: px, y: 0, z: pz, yaw: rng.range(0, Math.PI), hx: rng.range(0.5, 1.4), height: rng.range(0.5, 1.1), hz: rng.range(0.3, 0.6), seed: i, albedo: [0.035, 0.036, 0.038], kind: KIND_MACHINERY, roughness: 0.85 });
  }
}

function addElevatedGuideway(b, rng, axis, roadIndex, spanStart, spanEnd, seed) {
  const center = gridLineCenter(roadIndex);
  const span = spanEnd - spanStart;
  if (span <= 0) return;
  const deckY = 21.5 + (seed % 7);
  const deckHalf = 4.6;
  const mid = (spanStart + spanEnd) * 0.5;
  const albedo = [0.045, 0.046, 0.05];

  const x = axis === 0 ? center : mid;
  const z = axis === 0 ? mid : center;
  const hx = axis === 0 ? deckHalf : span * 0.5;
  const hz = axis === 0 ? span * 0.5 : deckHalf;

  b.box({ x, y: deckY, z, yaw: 0, hx, height: 1.4, hz, seed, albedo, kind: KIND_ROAD_DECK, roughness: 0.42, emissive: [0.25, 0.85, 1.0], emissiveBoost: 1.0 });
  b.markOverhead(x, z, hx, hz, deckY + 1.4);

  const pylonSpacing = 26;
  const pylons = Math.max(1, Math.round(span / pylonSpacing));
  for (let i = 0; i < pylons; i++) {
    const t = spanStart + span * ((i + 0.5) / pylons);
    const px = axis === 0 ? center : t;
    const pz = axis === 0 ? t : center;
    b.box({ x: px, y: 0, z: pz, yaw: 0, hx: 1.1, height: deckY, hz: 1.1, seed: seed + i, albedo: [0.04, 0.04, 0.043], kind: KIND_PLAIN, roughness: 0.8 });
    b.markSolid(px, pz, 1.1, 1.1, deckY);
    b.box({ x: px, y: deckY - 1.4, z: pz, yaw: 0, hx: axis === 0 ? deckHalf * 0.9 : 1.3, height: 1.5, hz: axis === 0 ? 1.3 : deckHalf * 0.9, seed: seed + i + 5, albedo, kind: KIND_METAL, roughness: 0.6 });
    b.light(px, deckY - 2.0, pz, 18, [0.22, 0.78, 1.0], 3.4, 0.5);
  }
}

export function generateCell(ix, iz) {
  const rng = new Rng(hash2(ix, iz));
  const bx0 = blockMin(ix);
  const bx1 = blockMax(ix);
  const bz0 = blockMin(iz);
  const bz1 = blockMax(iz);
  const fx0 = gridLineCenter(ix);
  const fz0 = gridLineCenter(iz);
  const b = new CellBuilder(fx0, fz0, gridLineCenter(ix + 1) - fx0, gridLineCenter(iz + 1) - fz0);
  const bounds = { minX: bx0 - 20, maxX: bx1 + 20, minZ: bz0 - 20, maxZ: bz1 + 20 };

  if (bx1 - bx0 < 8 || bz1 - bz0 < 8) return b.finish(ix, iz, bounds);

  const cx = (bx0 + bx1) * 0.5;
  const cz = (bz0 + bz1) * 0.5;
  const density = districtDensity(cx, cz);
  const district = districtType(cx, cz, density);
  const setup = DISTRICT_SETUP[district];
  const block = { x0: bx0, z0: bz0, x1: bx1, z1: bz1 };

  b.box({
    x: cx, y: -0.02, z: cz, yaw: 0,
    hx: (bx1 - bx0) * 0.5, height: 0.17, hz: (bz1 - bz0) * 0.5,
    seed: (ix * 17 + iz * 31) & 2047, albedo: [0.052, 0.052, 0.055],
    kind: KIND_SIDEWALK, roughness: 0.62,
  });

  addStreetFurniture(b, rng, block, district, density);

  if (gridLineHalf(ix) === AVENUE_HALF && density > 0.42) {
    addElevatedGuideway(b, rng, 0, ix, gridLineCenter(iz), gridLineCenter(iz + 1), (ix * 31 + iz * 17) & 1023);
  }
  if (gridLineHalf(iz) === AVENUE_HALF && density > 0.42) {
    addElevatedGuideway(b, rng, 1, iz, gridLineCenter(ix), gridLineCenter(ix + 1), (ix * 13 + iz * 47) & 1023);
  }

  if (rng.chance(setup.plazaChance)) {
    const px = cx + rng.range(-4, 4);
    const pz = cz + rng.range(-4, 4);
    const monumentH = rng.range(6, 22);
    b.box({ x: px, y: 0, z: pz, yaw: rng.range(0, Math.PI), hx: rng.range(1.0, 2.6), height: monumentH, hz: rng.range(1.0, 2.6), seed: 5, albedo: [0.05, 0.05, 0.055], kind: KIND_METAL, roughness: 0.3 });
    b.markSolid(px, pz, 2.6, 2.6, monumentH);
    const color = rng.pick(SIGN_COLORS);
    b.light(px, monumentH + 1.5, pz, 30, color, 7.0, 0);
    return b.finish(ix, iz, bounds);
  }

  const inset = SIDEWALK_WIDTH;
  const lots = subdivide(bx0 + inset, bz0 + inset, bx1 - inset, bz1 - inset, rng, setup.minLot, setup.maxDepth);
  const innerBlock = { x0: bx0 + inset, z0: bz0 + inset, x1: bx1 - inset, z1: bz1 - inset };

  const towers = [];
  for (const lot of lots) {
    const tower = buildTower(b, rng, lot, innerBlock, district, density);
    if (tower) towers.push(tower);
  }

  const tall = towers.filter((t) => t.height > 42);
  if (tall.length >= 2 && rng.chance(0.5)) {
    const a = tall[rng.int(0, tall.length - 1)];
    let c = tall[rng.int(0, tall.length - 1)];
    if (a !== c) {
      const bridgeY = Math.min(a.height, c.height) * rng.range(0.45, 0.85);
      const dx = c.cx - a.cx;
      const dz = c.cz - a.cz;
      const len = Math.hypot(dx, dz);
      if (len > 4) {
        const yaw = Math.atan2(dx, dz);
        b.box({
          x: (a.cx + c.cx) * 0.5, y: bridgeY, z: (a.cz + c.cz) * 0.5, yaw,
          hx: rng.range(1.2, 2.4), height: rng.range(2.4, 3.6), hz: len * 0.5,
          seed: 77, albedo: [0.04, 0.045, 0.055], kind: KIND_GLASS, roughness: 0.18,
          windowDensity: 1.0, litFraction: 0.85, emissiveBoost: 1.4,
          emissive: WINDOW_EMISSIVE[district][0], floorHeight: 3.0,
        });
        b.light((a.cx + c.cx) * 0.5, bridgeY + 1.4, (a.cz + c.cz) * 0.5, 24, WINDOW_EMISSIVE[district][0], 3.0, 0);
        b.markOverhead((a.cx + c.cx) * 0.5, (a.cz + c.cz) * 0.5, Math.abs(dx) * 0.5 + 2, Math.abs(dz) * 0.5 + 2, bridgeY + 3.6);
      }
    }
  }

  return b.finish(ix, iz, bounds);
}
