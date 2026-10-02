export interface Mesh {
  /** xyz triples, world mm. */
  positions: Float32Array;
  /** Triangle vertex indices. */
  indices: Uint32Array;
}

/**
 * Naive surface nets on a scalar field (iso-level 0.5). `field` is sampled at
 * voxel centres (i-fastest); `toWorld` maps fractional voxel coordinates to mm.
 */
export function surfaceNets(
  field: Float32Array,
  dims: readonly [number, number, number],
  toWorld: (i: number, j: number, k: number) => readonly [number, number, number],
  iso = 0.5,
): Mesh {
  const [nx, ny, nz] = dims;
  const at = (i: number, j: number, k: number) =>
    i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 0 : field[i + nx * (j + ny * k)];
  // Cells span voxel centres [i, i+1]; include a border so surfaces close.
  const cx = nx + 1;
  const cy = ny + 1;
  const cz = nz + 1;
  const cellVertex = new Int32Array(cx * cy * cz).fill(-1);
  const positions: number[] = [];
  const corner = new Float64Array(8);
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = at(i - 1 + (c & 1), j - 1 + ((c >> 1) & 1), k - 1 + ((c >> 2) & 1));
          corner[c] = v;
          if (v > iso) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          const va = corner[a];
          const vb = corner[b];
          if (va > iso === vb > iso) continue;
          const t = (iso - va) / (vb - va);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellVertex[i + cx * (j + cy * k)] = positions.length / 3;
        const p = toWorld(i - 1 + sx / n, j - 1 + sy / n, k - 1 + sz / n);
        positions.push(p[0], p[1], p[2]);
      }
    }
  }
  const indices: number[] = [];
  const cell = (i: number, j: number, k: number) => cellVertex[i + cx * (j + cy * k)];
  // For every voxel-centre edge with a sign change, join the four cells around it.
  // Cell (ci, cj, ck) has its first corner at voxel (ci−1, cj−1, ck−1). Loops start at −1
  // so faces against the lower borders are generated too (edges between two outside voxels are skipped).
  for (let k = -1; k < nz; k++) {
    for (let j = -1; j < ny; j++) {
      for (let i = -1; i < nx; i++) {
        const inside = at(i, j, k) > iso;
        if (inside !== at(i + 1, j, k) > iso) {
          quad(indices, cell(i + 1, j, k), cell(i + 1, j + 1, k), cell(i + 1, j + 1, k + 1), cell(i + 1, j, k + 1), inside);
        }
        if (inside !== at(i, j + 1, k) > iso) {
          quad(indices, cell(i, j + 1, k), cell(i, j + 1, k + 1), cell(i + 1, j + 1, k + 1), cell(i + 1, j + 1, k), inside);
        }
        if (inside !== at(i, j, k + 1) > iso) {
          quad(indices, cell(i, j, k + 1), cell(i + 1, j, k + 1), cell(i + 1, j + 1, k + 1), cell(i, j + 1, k + 1), inside);
        }
      }
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

function quad(out: number[], a: number, b: number, c: number, d: number, flip: boolean): void {
  if (a < 0 || b < 0 || c < 0 || d < 0) return;
  if (flip) out.push(a, b, c, a, c, d);
  else out.push(a, c, b, a, d, c);
}

/** Taubin smoothing (shrink-free Laplacian), in place. */
export function smoothMesh(mesh: Mesh, iterations = 6, lambda = 0.5, mu = -0.53): void {
  const n = mesh.positions.length / 3;
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    neighbours[a].push(b, c);
    neighbours[b].push(a, c);
    neighbours[c].push(a, b);
  }
  const unique = neighbours.map((list) => [...new Set(list)]);
  const p = mesh.positions;
  const delta = new Float32Array(p.length);
  const step = (factor: number) => {
    for (let v = 0; v < n; v++) {
      const list = unique[v];
      if (list.length === 0) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const u of list) {
        x += p[u * 3];
        y += p[u * 3 + 1];
        z += p[u * 3 + 2];
      }
      const m = list.length;
      delta[v * 3] = (x / m - p[v * 3]) * factor;
      delta[v * 3 + 1] = (y / m - p[v * 3 + 1]) * factor;
      delta[v * 3 + 2] = (z / m - p[v * 3 + 2]) * factor;
    }
    for (let i = 0; i < p.length; i++) p[i] += delta[i];
  };
  for (let it = 0; it < iterations; it++) {
    step(lambda);
    step(mu);
  }
}

/** Signed volume of a closed mesh (positive when outward-facing). */
export function meshVolume(mesh: Mesh): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    v +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
