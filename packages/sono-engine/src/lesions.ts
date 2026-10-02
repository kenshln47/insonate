import { symmetricEigen, type Vec3 } from "./math";
import { squaredDistance } from "./morphology";
import type { ClassVolume } from "./volume";

/**
 * Voxel tools for making findings: where a tissue is, how far a voxel is from it, and painting
 * shapes into the volume. Positions are world millimetres (x toward the patient's right,
 * y anterior, z toward the head); voxels are indices into `volume.data`.
 */

/** A box of voxels, inclusive: [i0, j0, k0, i1, j1, k1]. */
export type Box = [number, number, number, number, number, number];

/** A lookup table: 1 for the given tissue ids. */
export function tissueSet(tissues: readonly number[]): Uint8Array {
  const set = new Uint8Array(256);
  for (const t of tissues) set[t] = 1;
  return set;
}

/** Voxel indices of the given tissues (optionally inside a box). */
export function voxelsOf(volume: ClassVolume, tissues: readonly number[], box?: Box): number[] {
  const [nx, ny, nz] = volume.dims;
  const wanted = tissueSet(tissues);
  const [i0, j0, k0, i1, j1, k1] = box ?? [0, 0, 0, nx - 1, ny - 1, nz - 1];
  const out: number[] = [];
  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const p = i + nx * (j + ny * k);
        if (wanted[volume.data[p]]) out.push(p);
      }
    }
  }
  return out;
}

/** The voxel's (i, j, k). */
export function ijk(volume: ClassVolume, p: number): [number, number, number] {
  const [nx, ny] = volume.dims;
  return [p % nx, Math.floor(p / nx) % ny, Math.floor(p / (nx * ny))];
}

/** The smallest box around the voxels, grown by `pad` voxels (within the volume). */
export function boxOf(volume: ClassVolume, voxels: readonly number[], pad = 0): Box {
  const [nx, ny, nz] = volume.dims;
  let box: Box = [nx, ny, nz, -1, -1, -1];
  for (const p of voxels) {
    const [i, j, k] = ijk(volume, p);
    box = [Math.min(box[0], i), Math.min(box[1], j), Math.min(box[2], k), Math.max(box[3], i), Math.max(box[4], j), Math.max(box[5], k)];
  }
  return [
    Math.max(0, box[0] - pad),
    Math.max(0, box[1] - pad),
    Math.max(0, box[2] - pad),
    Math.min(nx - 1, box[3] + pad),
    Math.min(ny - 1, box[4] + pad),
    Math.min(nz - 1, box[5] + pad),
  ];
}

/** World position (mm) of a voxel's centre. */
export function world(volume: ClassVolume, p: number): Vec3 {
  const [i, j, k] = ijk(volume, p);
  return [volume.origin[0] + i * volume.spacing[0], volume.origin[1] + j * volume.spacing[1], volume.origin[2] + k * volume.spacing[2]];
}

/** The voxel containing a world position, or -1 outside the volume. */
export function voxelAt(volume: ClassVolume, p: Vec3): number {
  const [nx, ny, nz] = volume.dims;
  const i = Math.round((p[0] - volume.origin[0]) / volume.spacing[0]);
  const j = Math.round((p[1] - volume.origin[1]) / volume.spacing[1]);
  const k = Math.round((p[2] - volume.origin[2]) / volume.spacing[2]);
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
  return i + nx * (j + ny * k);
}

export function mean(volume: ClassVolume, voxels: readonly number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of voxels) {
    const w = world(volume, p);
    x += w[0];
    y += w[1];
    z += w[2];
  }
  const n = Math.max(1, voxels.length);
  return [x / n, y / n, z / n];
}

/** Squared distances (mm²) over a box: from each voxel of the box to the nearest voxel of some tissues. */
export interface DistanceField {
  readonly box: Box;
  readonly dims: [number, number, number];
  readonly d2: Float32Array;
  /** Squared distance at a volume voxel inside the box (Infinity outside it). */
  at(p: number): number;
}

export function distanceTo(volume: ClassVolume, box: Box, tissues: readonly number[]): DistanceField {
  const [nx, ny] = volume.dims;
  const dims: [number, number, number] = [box[3] - box[0] + 1, box[4] - box[1] + 1, box[5] - box[2] + 1];
  const wanted = tissueSet(tissues);
  const mask = new Uint8Array(dims[0] * dims[1] * dims[2]);
  for (let k = 0; k < dims[2]; k++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let i = 0; i < dims[0]; i++) {
        mask[i + dims[0] * (j + dims[1] * k)] = wanted[volume.data[i + box[0] + nx * (j + box[1] + ny * (k + box[2]))]];
      }
    }
  }
  const d2 = squaredDistance(mask, dims, volume.spacing);
  return {
    box,
    dims,
    d2,
    at(p: number): number {
      const [i, j, k] = ijk(volume, p);
      const li = i - box[0];
      const lj = j - box[1];
      const lk = k - box[2];
      if (li < 0 || lj < 0 || lk < 0 || li >= dims[0] || lj >= dims[1] || lk >= dims[2]) return Number.POSITIVE_INFINITY;
      return d2[li + dims[0] * (lj + dims[1] * lk)];
    },
  };
}

/** Every tissue id except these: for "distance to anything that is not ..." */
export function allBut(...tissues: number[]): number[] {
  const skip = tissueSet(tissues);
  return Array.from({ length: 256 }, (_, t) => t).filter((t) => !skip[t]);
}

/**
 * Paint an ellipsoid (world centre, semi-axes along x, y, z in mm) over the tissues allowed,
 * returning the voxels painted.
 */
export function blob(volume: ClassVolume, centre: Vec3, semi: Vec3, tissue: number, over: readonly number[]): number[] {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  const allowed = tissueSet(over);
  const painted: number[] = [];
  const lo = (c: number, o: number, s: number, r: number) => Math.max(0, Math.floor((c - r - o) / s));
  const hi = (c: number, o: number, s: number, r: number, n: number) => Math.min(n - 1, Math.ceil((c + r - o) / s));
  for (let k = lo(centre[2], oz, sz, semi[2]); k <= hi(centre[2], oz, sz, semi[2], nz); k++) {
    const dz = (oz + k * sz - centre[2]) / semi[2];
    for (let j = lo(centre[1], oy, sy, semi[1]); j <= hi(centre[1], oy, sy, semi[1], ny); j++) {
      const dy = (oy + j * sy - centre[1]) / semi[1];
      for (let i = lo(centre[0], ox, sx, semi[0]); i <= hi(centre[0], ox, sx, semi[0], nx); i++) {
        const dx = (ox + i * sx - centre[0]) / semi[0];
        if (dx * dx + dy * dy + dz * dz > 1) continue;
        const p = i + nx * (j + ny * k);
        if (!allowed[volume.data[p]]) continue;
        volume.data[p] = tissue;
        painted.push(p);
      }
    }
  }
  return painted;
}

/** Paint a ball (world centre, radius mm) over the tissues allowed, returning the voxels painted. */
export function ball(volume: ClassVolume, centre: Vec3, radius: number, tissue: number, over: readonly number[]): number[] {
  return blob(volume, centre, [radius, radius, radius], tissue, over);
}

/** Principal axes of a set of voxels: centroid, unit axes (longest first) and the extent along each (mm). */
export function axesOf(volume: ClassVolume, voxels: readonly number[]): { centre: Vec3; axes: Vec3[]; extents: Vec3; extent: number } {
  const centre = mean(volume, voxels);
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of voxels) {
    const w = world(volume, p);
    const d = [w[0] - centre[0], w[1] - centre[1], w[2] - centre[2]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] += d[a] * d[b];
  }
  const n = Math.max(1, voxels.length);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] /= n;
  const { vectors } = symmetricEigen(c);
  const spans = vectors.map((axis) => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const p of voxels) {
      const w = world(volume, p);
      const t = (w[0] - centre[0]) * axis[0] + (w[1] - centre[1]) * axis[1] + (w[2] - centre[2]) * axis[2];
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    // A voxel is a cube, not a point: add one voxel to the end-to-end distance.
    return voxels.length > 0 ? hi - lo + volume.spacing[0] : 0;
  });
  const extents: Vec3 = [spans[0], spans[1], spans[2]];
  return { centre, axes: vectors, extents, extent: extents[0] };
}

/** Projection of a world point on an axis through a centre. */
export function along(p: Vec3, centre: Vec3, axis: Vec3): number {
  return (p[0] - centre[0]) * axis[0] + (p[1] - centre[1]) * axis[1] + (p[2] - centre[2]) * axis[2];
}

/** A small, fast, seeded random generator (mulberry32): the same seed always makes the same patient. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The one-voxel outer layer of a region: voxels of `inside` with a 6-neighbour that is not. */
export function shell(volume: ClassVolume, voxels: readonly number[], inside: Uint8Array): number[] {
  const [nx, ny, nz] = volume.dims;
  const out: number[] = [];
  for (const p of voxels) {
    const [i, j, k] = ijk(volume, p);
    if (i < 1 || j < 1 || k < 1 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) {
      out.push(p);
      continue;
    }
    for (const step of [1, -1, nx, -nx, nx * ny, -nx * ny]) {
      if (!inside[volume.data[p + step]]) {
        out.push(p);
        break;
      }
    }
  }
  return out;
}
