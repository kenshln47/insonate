const INF = 1e20;

/**
 * Squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in mm²:
 * distance from every voxel to the nearest voxel where `mask` is non-zero.
 */
export function squaredDistance(
  mask: Uint8Array,
  dims: readonly [number, number, number],
  spacing: readonly [number, number, number] = [1, 1, 1],
): Float32Array {
  const [nx, ny, nz] = dims;
  const d = new Float32Array(nx * ny * nz);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const longest = Math.max(nx, ny, nz);
  const f = new Float64Array(longest);
  const out = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  const pass = (count: number, stride: number, offsets: Iterable<number>, s: number) => {
    for (const base of offsets) {
      for (let q = 0; q < count; q++) f[q] = d[base + q * stride];
      edt1d(f, count, s * s, out, v, z);
      for (let q = 0; q < count; q++) d[base + q * stride] = out[q];
    }
  };
  pass(
    nx,
    1,
    offsetsFor(ny * nz, (n) => n * nx),
    spacing[0],
  );
  pass(
    ny,
    nx,
    offsetsFor(nx * nz, (n) => (n % nx) + Math.floor(n / nx) * nx * ny),
    spacing[1],
  );
  pass(
    nz,
    nx * ny,
    offsetsFor(nx * ny, (n) => n),
    spacing[2],
  );
  return d;
}

function* offsetsFor(count: number, map: (n: number) => number): Generator<number> {
  for (let n = 0; n < count; n++) yield map(n);
}

function edt1d(f: Float64Array, n: number, s2: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    if (f[q] >= INF) continue;
    if (f[v[k]] >= INF) {
      v[k] = q;
      continue;
    }
    let sq = (f[q] + s2 * q * q - (f[v[k]] + s2 * v[k] * v[k])) / (2 * s2 * (q - v[k]));
    while (sq <= z[k]) {
      k--;
      if (k < 0) break;
      sq = (f[q] + s2 * q * q - (f[v[k]] + s2 * v[k] * v[k])) / (2 * s2 * (q - v[k]));
    }
    k++;
    v[k] = q;
    z[k] = sq;
    z[k + 1] = Infinity;
  }
  if (f[v[0]] >= INF && k === 0) {
    for (let q = 0; q < n; q++) out[q] = INF;
    return;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    out[q] = s2 * dq * dq + f[v[k]];
  }
}

/** Morphological closing with a ball of radius `radiusMm`. */
export function closeMask(
  mask: Uint8Array,
  dims: readonly [number, number, number],
  spacing: readonly [number, number, number],
  radiusMm: number,
): Uint8Array {
  const r2 = radiusMm * radiusMm;
  const toMask = squaredDistance(mask, dims, spacing);
  const dilated = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) dilated[i] = toMask[i] <= r2 ? 1 : 0;
  const outside = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) outside[i] = dilated[i] ? 0 : 1;
  const toOutside = squaredDistance(outside, dims, spacing);
  const closed = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) closed[i] = dilated[i] && toOutside[i] > r2 ? 1 : 0;
  return closed;
}

/**
 * Per axial slice: mark pixels reachable from the slice border through
 * "open" pixels (e.g. air), i.e. the outside world. Returns 1 for outside.
 */
export function floodOutside(open: Uint8Array, dims: readonly [number, number, number]): Uint8Array {
  const [nx, ny, nz] = dims;
  const outside = new Uint8Array(open.length);
  const stack = new Int32Array(nx * ny);
  for (let k = 0; k < nz; k++) {
    const base = k * nx * ny;
    let top = 0;
    const push = (i: number, j: number) => {
      const idx = base + i + nx * j;
      if (open[idx] && !outside[idx]) {
        outside[idx] = 1;
        stack[top++] = i + nx * j;
      }
    };
    for (let i = 0; i < nx; i++) {
      push(i, 0);
      push(i, ny - 1);
    }
    for (let j = 0; j < ny; j++) {
      push(0, j);
      push(nx - 1, j);
    }
    while (top > 0) {
      const p = stack[--top];
      const i = p % nx;
      const j = (p - i) / nx;
      if (i > 0) push(i - 1, j);
      if (i < nx - 1) push(i + 1, j);
      if (j > 0) push(i, j - 1);
      if (j < ny - 1) push(i, j + 1);
    }
  }
  return outside;
}

/** Keep only the largest 4-connected component of `mask` in every axial slice. */
export function largestComponentPerSlice(mask: Uint8Array, dims: readonly [number, number, number]): Uint8Array {
  const [nx, ny, nz] = dims;
  const out = new Uint8Array(mask.length);
  const label = new Int32Array(nx * ny);
  const stack = new Int32Array(nx * ny);
  for (let k = 0; k < nz; k++) {
    const base = k * nx * ny;
    label.fill(0);
    let next = 0;
    let bestLabel = 0;
    let bestSize = 0;
    for (let start = 0; start < nx * ny; start++) {
      if (!mask[base + start] || label[start]) continue;
      next++;
      let size = 0;
      let top = 0;
      stack[top++] = start;
      label[start] = next;
      while (top > 0) {
        const p = stack[--top];
        size++;
        const i = p % nx;
        const j = (p - i) / nx;
        const visit = (q: number) => {
          if (mask[base + q] && !label[q]) {
            label[q] = next;
            stack[top++] = q;
          }
        };
        if (i > 0) visit(p - 1);
        if (i < nx - 1) visit(p + 1);
        if (j > 0) visit(p - nx);
        if (j < ny - 1) visit(p + nx);
      }
      if (size > bestSize) {
        bestSize = size;
        bestLabel = next;
      }
    }
    if (bestLabel) for (let p = 0; p < nx * ny; p++) if (label[p] === bestLabel) out[base + p] = 1;
  }
  return out;
}
