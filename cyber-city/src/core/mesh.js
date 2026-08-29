export class Mesh {
  constructor(ctx, options) {
    const gl = ctx.gl;
    this.ctx = ctx;
    this.gl = gl;
    this.vao = gl.createVertexArray();
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.instanceBuffer = null;
    this.indexCount = 0;
    this.vertexCount = 0;
    this.instanceCount = 0;
    this.indexType = gl.UNSIGNED_SHORT;
    this.mode = options.mode !== undefined ? options.mode : gl.TRIANGLES;

    gl.bindVertexArray(this.vao);
    ctx.state.vao = this.vao;

    if (options.vertices) {
      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, options.vertices,
        options.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      this.vertexStride = this.applyLayout(options.layout, 0);
      this.vertexCount = options.vertexCount || 0;
    }

    if (options.indices) {
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, options.indices, gl.STATIC_DRAW);
      this.indexCount = options.indices.length;
      this.indexType = options.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    }

    if (options.instanceLayout) {
      this.instanceLayout = options.instanceLayout;
      this.instanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, options.instanceCapacity || 1024, gl.DYNAMIC_DRAW);
      this.applyLayout(options.instanceLayout, 1);
    }

    gl.bindVertexArray(null);
    ctx.state.vao = null;
  }

  applyLayout(layout, divisor) {
    const gl = this.gl;
    let stride = 0;
    for (const attr of layout) stride += attr.size * 4;
    let offset = 0;
    for (const attr of layout) {
      gl.enableVertexAttribArray(attr.location);
      if (attr.integer) {
        gl.vertexAttribIPointer(attr.location, attr.size, gl.INT, stride, offset);
      } else {
        gl.vertexAttribPointer(attr.location, attr.size, gl.FLOAT, false, stride, offset);
      }
      if (divisor) gl.vertexAttribDivisor(attr.location, divisor);
      offset += attr.size * 4;
    }
    return stride;
  }

  uploadVertices(data, vertexCount) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    this.vertexCount = vertexCount;
  }

  uploadInstances(data, count) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.instanceCount = count;
  }

  draw(instanceCount) {
    const gl = this.gl;
    const count = instanceCount !== undefined ? instanceCount : this.instanceCount;
    this.ctx.bindVAO(this.vao);
    if (this.instanceBuffer) {
      if (count <= 0) return;
      if (this.indexBuffer) gl.drawElementsInstanced(this.mode, this.indexCount, this.indexType, 0, count);
      else gl.drawArraysInstanced(this.mode, 0, this.vertexCount, count);
    } else if (this.indexBuffer) {
      gl.drawElements(this.mode, this.indexCount, this.indexType, 0);
    } else {
      gl.drawArrays(this.mode, 0, this.vertexCount);
    }
  }

  dispose() {
    const gl = this.gl;
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    gl.deleteVertexArray(this.vao);
  }
}

export function createBoxGeometry() {
  const faces = [
    { normal: [0, 0, 1], tangent: [1, 0, 0], corners: [[-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]] },
    { normal: [0, 0, -1], tangent: [-1, 0, 0], corners: [[1, 0, -1], [-1, 0, -1], [-1, 1, -1], [1, 1, -1]] },
    { normal: [1, 0, 0], tangent: [0, 0, -1], corners: [[1, 0, 1], [1, 0, -1], [1, 1, -1], [1, 1, 1]] },
    { normal: [-1, 0, 0], tangent: [0, 0, 1], corners: [[-1, 0, -1], [-1, 0, 1], [-1, 1, 1], [-1, 1, -1]] },
    { normal: [0, 1, 0], tangent: [1, 0, 0], corners: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { normal: [0, -1, 0], tangent: [1, 0, 0], corners: [[-1, 0, 1], [1, 0, 1], [1, 0, -1], [-1, 0, -1]] },
  ];
  const stride = 9;
  const vertices = new Float32Array(faces.length * 4 * stride);
  const indices = new Uint16Array(faces.length * 6);
  let v = 0;
  let i = 0;
  faces.forEach((face, faceIndex) => {
    const base = faceIndex * 4;
    for (let c = 0; c < 4; c++) {
      const p = face.corners[c];
      vertices[v++] = p[0]; vertices[v++] = p[1]; vertices[v++] = p[2];
      vertices[v++] = face.normal[0]; vertices[v++] = face.normal[1]; vertices[v++] = face.normal[2];
      vertices[v++] = face.tangent[0]; vertices[v++] = face.tangent[1]; vertices[v++] = face.tangent[2];
    }
    indices[i++] = base; indices[i++] = base + 1; indices[i++] = base + 2;
    indices[i++] = base; indices[i++] = base + 2; indices[i++] = base + 3;
  });
  return { vertices, indices, stride };
}

export function createQuadGeometry() {
  const stride = 9;
  const vertices = new Float32Array([
    -1, 0, 0, 0, 0, 1, 1, 0, 0,
    1, 0, 0, 0, 0, 1, 1, 0, 0,
    1, 1, 0, 0, 0, 1, 1, 0, 0,
    -1, 1, 0, 0, 0, 1, 1, 0, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return { vertices, indices, stride };
}

export const MESH_LAYOUT = [
  { location: 0, size: 3 },
  { location: 1, size: 3 },
  { location: 2, size: 3 },
];

export function createIcosphere(subdivisions = 2) {
  const t = (1 + Math.sqrt(5)) / 2;
  let positions = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((p) => {
    const len = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / len, p[1] / len, p[2] / len];
  });

  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map();
    const next = [];
    const midpoint = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let index = cache.get(key);
      if (index !== undefined) return index;
      const pa = positions[a];
      const pb = positions[b];
      const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
      const len = Math.hypot(m[0], m[1], m[2]);
      index = positions.length;
      positions.push([m[0] / len, m[1] / len, m[2] / len]);
      cache.set(key, index);
      return index;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const vertices = new Float32Array(positions.length * 3);
  positions.forEach((p, i) => {
    vertices[i * 3] = p[0];
    vertices[i * 3 + 1] = p[1];
    vertices[i * 3 + 2] = p[2];
  });
  const indices = new Uint16Array(faces.length * 3);
  faces.forEach((f, i) => {
    indices[i * 3] = f[0];
    indices[i * 3 + 1] = f[1];
    indices[i * 3 + 2] = f[2];
  });

  let minCos = 1;
  for (const [a, b, c] of faces) {
    const pa = positions[a];
    const pb = positions[b];
    const pc = positions[c];
    const center = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    minCos = Math.min(minCos, Math.hypot(center[0], center[1], center[2]));
  }

  return { vertices, indices, vertexCount: positions.length, circumscribeScale: 1 / minCos };
}

export function createGroundGrid(resolution = 56) {
  const size = resolution + 1;
  const vertices = new Float32Array(size * size * 2);
  let v = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      vertices[v++] = (x / resolution) * 2 - 1;
      vertices[v++] = (z / resolution) * 2 - 1;
    }
  }
  const indices = new Uint32Array(resolution * resolution * 6);
  let i = 0;
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const a = z * size + x;
      const b = a + 1;
      const c = a + size;
      const d = c + 1;
      indices[i++] = a; indices[i++] = c; indices[i++] = b;
      indices[i++] = b; indices[i++] = c; indices[i++] = d;
    }
  }
  return { vertices, indices, vertexCount: size * size };
}

export const GROUND_LAYOUT = [{ location: 0, size: 2 }];
export const SPHERE_LAYOUT = [{ location: 0, size: 3 }];

export const BUILDING_INSTANCE_LAYOUT = [
  { location: 3, size: 4 },
  { location: 4, size: 4 },
  { location: 5, size: 4 },
  { location: 6, size: 4 },
  { location: 7, size: 4 },
];

export const SIGN_INSTANCE_LAYOUT = [
  { location: 3, size: 4 },
  { location: 4, size: 4 },
  { location: 5, size: 4 },
  { location: 6, size: 4 },
];

export const VEHICLE_INSTANCE_LAYOUT = [
  { location: 3, size: 4 },
  { location: 4, size: 4 },
  { location: 5, size: 4 },
];

export const LIGHT_INSTANCE_LAYOUT = [
  { location: 3, size: 4 },
  { location: 4, size: 4 },
  { location: 5, size: 4 },
];

export const CINE_STRIDE = 24;

export const CINE_INSTANCE_LAYOUT = [
  { location: 3, size: 4 },
  { location: 4, size: 4 },
  { location: 5, size: 4 },
  { location: 6, size: 4 },
  { location: 7, size: 4 },
  { location: 8, size: 4 },
];

export const PARTICLE_STRIDE = 12;

export const PARTICLE_INSTANCE_LAYOUT = [
  { location: 3, size: 4 },
  { location: 4, size: 4 },
  { location: 5, size: 4 },
];

export const TRAIL_STRIDE = 9;

export const TRAIL_LAYOUT = [
  { location: 0, size: 3 },
  { location: 1, size: 4 },
  { location: 2, size: 2 },
];

export const SHATTER_LAYOUT = [
  { location: 0, size: 2 },
  { location: 1, size: 2 },
  { location: 2, size: 4 },
];

function pushTri(out, a, b, c) {
  out.push(a, b, c);
}

export function createCenteredBox() {
  const faces = [
    { n: [0, 0, 1], t: [1, 0, 0], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], t: [-1, 0, 0], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], t: [0, 0, -1], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], t: [0, 0, 1], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], t: [1, 0, 0], c: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, -1, 0], t: [1, 0, 0], c: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
  ];
  const vertices = new Float32Array(faces.length * 4 * 9);
  const indices = new Uint16Array(faces.length * 6);
  let v = 0;
  let i = 0;
  faces.forEach((face, fi) => {
    const base = fi * 4;
    for (let c = 0; c < 4; c++) {
      const p = face.c[c];
      vertices[v++] = p[0]; vertices[v++] = p[1]; vertices[v++] = p[2];
      vertices[v++] = face.n[0]; vertices[v++] = face.n[1]; vertices[v++] = face.n[2];
      vertices[v++] = face.t[0]; vertices[v++] = face.t[1]; vertices[v++] = face.t[2];
    }
    indices[i++] = base; indices[i++] = base + 1; indices[i++] = base + 2;
    indices[i++] = base; indices[i++] = base + 2; indices[i++] = base + 3;
  });
  return { vertices, indices, vertexCount: faces.length * 4 };
}

export function createCenteredQuad() {
  const vertices = new Float32Array([
    -1, -1, 0, 0, 0, 1, 1, 0, 0,
     1, -1, 0, 0, 0, 1, 1, 0, 0,
     1,  1, 0, 0, 0, 1, 1, 0, 0,
    -1,  1, 0, 0, 0, 1, 1, 0, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return { vertices, indices, vertexCount: 4 };
}

export function createUvSphere(segments = 20, rings = 14) {
  const verts = [];
  const idx = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      const x = sp * ct;
      const y = cp;
      const z = sp * st;
      verts.push(x, y, z, x, y, z, -st, 0, ct);
    }
  }
  const row = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * row + s;
      const b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 9,
  };
}

export function createCapsule(segments = 14, capRings = 6, capHeight = 0.22) {
  const verts = [];
  const idx = [];
  const rows = [];

  const push = (x, y, z, nx, ny, nz) => {
    verts.push(x, y, z, nx, ny, nz, -z, 0, x);
    return verts.length / 9 - 1;
  };

  const ring = (y, radius, ny, radial) => {
    const row = [];
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      row.push(push(ct * radius, y, st * radius, ct * radial, ny, st * radial));
    }
    rows.push(row);
  };

  const body = 1 - capHeight;
  for (let r = 0; r <= capRings; r++) {
    const t = r / capRings;
    const phi = (Math.PI * 0.5) * (1 - t);
    ring(body + Math.sin(phi) * capHeight, Math.cos(phi), Math.sin(phi), Math.cos(phi));
  }
  ring(-body, 1, 0, 1);
  for (let r = 0; r <= capRings; r++) {
    const t = r / capRings;
    const phi = -(Math.PI * 0.5) * t;
    ring(-body + Math.sin(phi) * capHeight, Math.cos(phi), Math.sin(phi), Math.cos(phi));
  }

  for (let r = 0; r < rows.length - 1; r++) {
    const a = rows[r];
    const b = rows[r + 1];
    for (let s = 0; s < segments; s++) {
      pushTri(idx, a[s], b[s], a[s + 1]);
      pushTri(idx, a[s + 1], b[s], b[s + 1]);
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 9,
  };
}

export function createCone(segments = 20) {
  const verts = [];
  const idx = [];
  const push = (x, y, z, nx, ny, nz) => {
    verts.push(x, y, z, nx, ny, nz, -z, 0, x);
    return verts.length / 9 - 1;
  };
  const apex = [];
  const base = [];
  for (let s = 0; s <= segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const ny = 0.4472;
    const nr = 0.8944;
    apex.push(push(0, 1, 0, ct * nr, ny, st * nr));
    base.push(push(ct, -1, st, ct * nr, ny, st * nr));
  }
  for (let s = 0; s < segments; s++) {
    pushTri(idx, apex[s], base[s], base[s + 1]);
  }
  const centre = push(0, -1, 0, 0, -1, 0);
  const cap = [];
  for (let s = 0; s <= segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    cap.push(push(Math.cos(theta), -1, Math.sin(theta), 0, -1, 0));
  }
  for (let s = 0; s < segments; s++) pushTri(idx, centre, cap[s + 1], cap[s]);
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 9,
  };
}

export function createCylinder(segments = 20) {
  const verts = [];
  const idx = [];
  const push = (x, y, z, nx, ny, nz) => {
    verts.push(x, y, z, nx, ny, nz, -z, 0, x);
    return verts.length / 9 - 1;
  };
  const top = [];
  const bottom = [];
  for (let s = 0; s <= segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    top.push(push(ct, 1, st, ct, 0, st));
    bottom.push(push(ct, -1, st, ct, 0, st));
  }
  for (let s = 0; s < segments; s++) {
    pushTri(idx, top[s], bottom[s], top[s + 1]);
    pushTri(idx, top[s + 1], bottom[s], bottom[s + 1]);
  }
  for (const dir of [1, -1]) {
    const centre = push(0, dir, 0, 0, dir, 0);
    const ringIdx = [];
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      ringIdx.push(push(Math.cos(theta), dir, Math.sin(theta), 0, dir, 0));
    }
    for (let s = 0; s < segments; s++) {
      if (dir > 0) pushTri(idx, centre, ringIdx[s], ringIdx[s + 1]);
      else pushTri(idx, centre, ringIdx[s + 1], ringIdx[s]);
    }
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 9,
  };
}

export function createTorus(major = 24, minor = 12, ratio = 0.18) {
  const verts = [];
  const idx = [];
  for (let i = 0; i <= major; i++) {
    const u = (i / major) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= minor; j++) {
      const v = (j / minor) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const nx = cu * cv;
      const ny = sv;
      const nz = su * cv;
      verts.push(
        cu * (1 + ratio * cv), ratio * sv, su * (1 + ratio * cv),
        nx, ny, nz,
        -su, 0, cu);
    }
  }
  const row = minor + 1;
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 9,
  };
}

export function createShard(seed = 1) {
  let state = (seed * 2654435761) >>> 0;
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const top = [];
  const bottom = [];
  const sides = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + rnd() * 0.5;
    const r = 0.55 + rnd() * 0.65;
    top.push([Math.cos(a) * r, 0.18 + rnd() * 0.28, Math.sin(a) * r]);
    bottom.push([Math.cos(a) * r * 0.82, -0.18 - rnd() * 0.2, Math.sin(a) * r * 0.82]);
  }
  const verts = [];
  const idx = [];
  const emit = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = verts.length / 9;
    for (const p of [a, b, c]) {
      verts.push(p[0], p[1], p[2], nx, ny, nz, ux / (Math.hypot(ux, uy, uz) || 1), 0, 0);
    }
    idx.push(base, base + 1, base + 2);
  };
  const apexTop = [0, 0.42 + rnd() * 0.4, 0];
  const apexBottom = [0, -0.34 - rnd() * 0.3, 0];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    emit(apexTop, top[i], top[j]);
    emit(apexBottom, bottom[j], bottom[i]);
    emit(top[i], bottom[i], top[j]);
    emit(top[j], bottom[i], bottom[j]);
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 9,
  };
}

export function createRingSegment(inner = 0.4, outer = 1.0, span = Math.PI / 6, steps = 8) {
  const verts = [];
  const idx = [];
  const push = (x, z, u, v, ny) => {
    verts.push(x, 0, z, 0, ny, 0, 1, 0, 0);
    void u; void v;
    return verts.length / 9 - 1;
  };
  const innerIdx = [];
  const outerIdx = [];
  for (let s = 0; s <= steps; s++) {
    const a = -span * 0.5 + (s / steps) * span;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    innerIdx.push(push(ca * inner, sa * inner, 0, s / steps, 1));
    outerIdx.push(push(ca * outer, sa * outer, 1, s / steps, 1));
  }
  for (let s = 0; s < steps; s++) {
    idx.push(innerIdx[s], outerIdx[s], innerIdx[s + 1]);
    idx.push(innerIdx[s + 1], outerIdx[s], outerIdx[s + 1]);
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 9,
  };
}

export function createShatterLattice(rings = 9, sectors = 26, seed = 7) {
  let state = (seed * 374761393) >>> 0;
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const radii = [0];
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    radii.push(Math.pow(t, 1.35) * 1.85);
  }
  const angles = [];
  for (let s = 0; s < sectors; s++) {
    angles.push((s / sectors) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI * 2 / sectors) * 0.55);
  }
  angles.push(angles[0] + Math.PI * 2);

  const jitter = [];
  for (let r = 0; r <= rings; r++) {
    jitter.push([]);
    for (let s = 0; s <= sectors; s++) {
      const j = r === 0 ? 0 : (rnd() - 0.5) * (radii[r] - radii[r - 1]) * 0.5;
      jitter[r].push(j);
    }
  }
  for (let r = 0; r <= rings; r++) jitter[r][sectors] = jitter[r][0];

  const verts = [];
  const idx = [];
  let shardId = 0;

  const point = (r, s) => {
    const a = angles[s % (sectors + 1)];
    const rad = Math.max(0, radii[r] + jitter[r][s % (sectors + 1)]);
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  };

  const emit = (poly, id) => {
    let cx = 0;
    let cy = 0;
    for (const p of poly) { cx += p[0]; cy += p[1]; }
    cx /= poly.length;
    cy /= poly.length;
    const ang = Math.atan2(cy, cx);
    const dist = Math.hypot(cx, cy);
    let radius = 0;
    for (const p of poly) radius = Math.max(radius, Math.hypot(p[0] - cx, p[1] - cy));
    const base = verts.length / 8;
    for (const p of poly) {
      verts.push(p[0], p[1], cx, cy, id, ang, dist, radius);
    }
    for (let k = 1; k < poly.length - 1; k++) idx.push(base, base + k, base + k + 1);
  };

  for (let s = 0; s < sectors; s++) {
    emit([point(0, 0), point(1, s), point(1, s + 1)], shardId++);
  }
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = point(r, s);
      const b = point(r, s + 1);
      const c = point(r + 1, s + 1);
      const d = point(r + 1, s);
      if (rnd() < 0.42) {
        emit([a, b, c], shardId++);
        emit([a, c, d], shardId++);
      } else {
        emit([a, b, c, d], shardId++);
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array(idx),
    vertexCount: verts.length / 8,
    shardCount: shardId,
  };
}
