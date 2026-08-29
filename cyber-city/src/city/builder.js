export const BOX_STRIDE = 20;
export const FIELD_RES = 16;
export const SIGN_STRIDE = 16;
export const LIGHT_STRIDE = 12;

export class CellBuilder {
  constructor(minX, minZ, spanX, spanZ) {
    this.boxes = [];
    this.signs = [];
    this.lights = [];
    this.maxHeight = 0;
    this.fieldMinX = minX;
    this.fieldMinZ = minZ;
    this.fieldSpanX = spanX;
    this.fieldSpanZ = spanZ;
    this.solid = new Float32Array(FIELD_RES * FIELD_RES);
    this.overhead = new Float32Array(FIELD_RES * FIELD_RES);
  }

  stamp(field, cx, cz, hx, hz, top, pad = 0.8) {
    const x0 = (cx - hx - pad - this.fieldMinX) / this.fieldSpanX * FIELD_RES;
    const x1 = (cx + hx + pad - this.fieldMinX) / this.fieldSpanX * FIELD_RES;
    const z0 = (cz - hz - pad - this.fieldMinZ) / this.fieldSpanZ * FIELD_RES;
    const z1 = (cz + hz + pad - this.fieldMinZ) / this.fieldSpanZ * FIELD_RES;
    const ix0 = Math.max(0, Math.floor(x0));
    const ix1 = Math.min(FIELD_RES - 1, Math.ceil(x1) - 1);
    const iz0 = Math.max(0, Math.floor(z0));
    const iz1 = Math.min(FIELD_RES - 1, Math.ceil(z1) - 1);
    for (let iz = iz0; iz <= iz1; iz++) {
      const row = iz * FIELD_RES;
      for (let ix = ix0; ix <= ix1; ix++) {
        if (field[row + ix] < top) field[row + ix] = top;
      }
    }
  }

  markSolid(cx, cz, hx, hz, top) {
    this.stamp(this.solid, cx, cz, hx, hz, top);
  }

  markOverhead(cx, cz, hx, hz, top) {
    this.stamp(this.overhead, cx, cz, hx, hz, top, 1.2);
  }

  box(spec) {
    const a = spec.albedo;
    const e = spec.emissive || [0, 0, 0];
    this.boxes.push(
      spec.x, spec.y, spec.z, spec.yaw || 0,
      spec.hx, spec.height, spec.hz, spec.seed,
      a[0], a[1], a[2], spec.kind,
      spec.windowDensity || 0, spec.litFraction || 0, spec.emissiveBoost || 0,
      spec.roughness !== undefined ? spec.roughness : 0.7,
      e[0], e[1], e[2], spec.floorHeight || 3.5,
    );
    const top = spec.y + spec.height;
    if (top > this.maxHeight) this.maxHeight = top;
  }

  sign(spec) {
    const c = spec.color;
    this.signs.push(
      spec.x, spec.y, spec.z, spec.yaw || 0,
      spec.halfWidth, spec.height, spec.seed, spec.tilt || 0,
      c[0], c[1], c[2], spec.intensity,
      spec.pattern, spec.scroll || 0, spec.flicker || 0, spec.glyph || 1,
    );
    const top = spec.y + spec.height;
    if (top > this.maxHeight) this.maxHeight = top;
  }

  light(x, y, z, radius, color, intensity, cone = 0, flickerRate = 0, flickerAmount = 0, phase = 0) {
    this.lights.push(
      x, y, z, radius,
      color[0], color[1], color[2], intensity,
      flickerRate, flickerAmount, phase, cone,
    );
  }

  finish(ix, iz, bounds) {
    return {
      ix,
      iz,
      key: cellKey(ix, iz),
      boxes: new Float32Array(this.boxes),
      signs: new Float32Array(this.signs),
      lights: new Float32Array(this.lights),
      boxCount: this.boxes.length / BOX_STRIDE,
      signCount: this.signs.length / SIGN_STRIDE,
      lightCount: this.lights.length / LIGHT_STRIDE,
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
      maxY: this.maxHeight,
      solid: this.solid,
      overhead: this.overhead,
      fieldMinX: this.fieldMinX,
      fieldMinZ: this.fieldMinZ,
      fieldSpanX: this.fieldSpanX,
      fieldSpanZ: this.fieldSpanZ,
    };
  }
}

export function cellKey(ix, iz) {
  return ix * 73856093 ^ iz * 19349663;
}
