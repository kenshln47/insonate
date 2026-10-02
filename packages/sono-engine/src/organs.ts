import { dot, symmetricEigen, type Vec3 } from "./math";
import { MOVES_WITH_BREATH, ORGAN_KEYS, ORGANS, type OrganKey } from "./tissues";
import { breathShiftMm, type ClassVolume } from "./volume";

export interface OrganInfo {
  readonly key: OrganKey;
  readonly name: string;
  readonly volumeMl: number;
  /** World centroid, mm. */
  readonly centroid: Vec3;
  /** Principal axes, longest first. a[0] points superiorly. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
  /** Full extent along each principal axis, mm. */
  readonly extents: readonly [number, number, number];
}

/**
 * Volume, centroid, principal axes and extents of every known organ in the volume.
 * `zRanges` restricts an organ to a band of heights (mm), e.g. the abdominal part of the aorta.
 */
export function organStats(volume: ClassVolume, zRanges: Partial<Record<OrganKey, readonly [number, number]>> = {}): OrganInfo[] {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  const out: OrganInfo[] = [];
  for (const key of ORGAN_KEYS) {
    const wanted = new Set<number>(ORGANS[key].tissues);
    const band = zRanges[key];
    const kMin = band ? Math.max(0, Math.ceil((band[0] - oz) / sz)) : 0;
    const kMax = band ? Math.min(nz - 1, Math.floor((band[1] - oz) / sz)) : nz - 1;
    let n = 0;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let k = kMin; k <= kMax; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!wanted.has(volume.data[i + nx * (j + ny * k)])) continue;
          n++;
          mx += ox + i * sx;
          my += oy + j * sy;
          mz += oz + k * sz;
        }
      }
    }
    if (n === 0) continue;
    const centroid: Vec3 = [mx / n, my / n, mz / n];
    const c = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const points: number[] = [];
    for (let k = kMin; k <= kMax; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!wanted.has(volume.data[i + nx * (j + ny * k)])) continue;
          const d = [ox + i * sx - centroid[0], oy + j * sy - centroid[1], oz + k * sz - centroid[2]];
          for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] += d[a] * d[b];
          points.push(d[0], d[1], d[2]);
        }
      }
    }
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] /= n;
    const { vectors } = symmetricEigen(c);
    // Deterministic orientation: first axis superior, second anterior, third completes a right-handed set.
    const a0: Vec3 = vectors[0][2] < 0 ? [-vectors[0][0], -vectors[0][1], -vectors[0][2]] : vectors[0];
    const a1: Vec3 = vectors[1][1] < 0 ? [-vectors[1][0], -vectors[1][1], -vectors[1][2]] : vectors[1];
    const a2: Vec3 = [a0[1] * a1[2] - a0[2] * a1[1], a0[2] * a1[0] - a0[0] * a1[2], a0[0] * a1[1] - a0[1] * a1[0]];
    const axes = [a0, a1, a2] as const;
    const extents = axes.map((axis) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let p = 0; p < points.length; p += 3) {
        const t = dot(axis, [points[p], points[p + 1], points[p + 2]]);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      }
      return hi - lo + Math.min(sx, sy, sz);
    }) as unknown as readonly [number, number, number];
    out.push({
      key,
      name: ORGANS[key].name,
      volumeMl: (n * sx * sy * sz) / 1000,
      centroid,
      axes,
      extents,
    });
  }
  return out;
}

/**
 * Organ statistics after a breath (0 = out, as scanned; 1 = deep breath in): organs that move
 * shift toward the feet as far as the breathing field moves tissue at their height.
 */
export function organsWithBreath(organs: ReadonlyMap<OrganKey, OrganInfo>, breath: number, volume: ClassVolume): Map<OrganKey, OrganInfo> {
  const out = new Map<OrganKey, OrganInfo>();
  for (const [key, organ] of organs) {
    const shift = MOVES_WITH_BREATH[key] ? breathShiftMm(volume, breath, organ.centroid[2]) : 0;
    out.set(key, shift > 0 ? { ...organ, centroid: [organ.centroid[0], organ.centroid[1], organ.centroid[2] - shift] } : organ);
  }
  return out;
}
