// Surface and skeletal landmarks of a case, measured from the CT segmentation at build time:
// vertebral levels, the costal margin, the ribs under the skin, xiphoid, umbilicus, iliac crests,
// anterior superior iliac spines and the pubic symphysis. They let the app say where the probe is
// in anatomical terms ("intercostal, between ribs 9 and 10") and draw the landmarks in 3D.
import { type ClassVolume, type SkinSurface, TISSUE, type Vec3 } from "../packages/sono-engine/src";

/** TotalSegmentator v2 labels. */
const VERTEBRAE: ReadonlyArray<readonly [number, string]> = [
  [37, "T7"],
  [36, "T8"],
  [35, "T9"],
  [34, "T10"],
  [33, "T11"],
  [32, "T12"],
  [31, "L1"],
  [30, "L2"],
  [29, "L3"],
  [28, "L4"],
  [27, "L5"],
  [26, "S1"],
];
const RIB_LEFT_1 = 92;
const RIB_RIGHT_1 = 104;
const STERNUM = 116;
const COSTAL_CARTILAGE = 117;
const HIP_LEFT = 77;
const HIP_RIGHT = 78;

export interface Vertebra {
  readonly name: string;
  /** Centroid of the whole vertebra (body and arch), mm. */
  readonly centre: Vec3;
  /** Front of the vertebral body (most anterior point at the centroid's height), mm. */
  readonly front: Vec3;
}

/** The ribs a line down the skin crosses at one angle φ: [rib number (0 = costal cartilage), lowest z, highest z]. */
export interface RibLine {
  readonly phiDeg: number;
  readonly ribs: ReadonlyArray<readonly [number, number, number]>;
}

export interface Landmarks {
  readonly vertebrae: readonly Vertebra[];
  /** Lowest edge of the rib cage under the skin at each φ: [φ°, z mm]. */
  readonly costalMargin: ReadonlyArray<readonly [number, number]>;
  readonly ribLines: readonly RibLine[];
  readonly xiphoid: Vec3;
  readonly umbilicus: Vec3;
  readonly iliacCrests: readonly [Vec3, Vec3];
  readonly asis: readonly [Vec3, Vec3];
  readonly symphysis: Vec3;
}

export interface LabelGrid {
  readonly labels: Uint8Array;
  readonly dims: readonly [number, number, number];
  /** Voxel offset of the case volume in this grid (the crop). */
  readonly offset: readonly [number, number, number];
}

/** How deep under the skin a rib still counts as "under the probe" (mm). */
const RIB_DEPTH_MM = 35;

export function measureLandmarks(volume: ClassVolume, skin: SkinSurface, grid: LabelGrid): Landmarks {
  const [nx, ny, nz] = grid.dims;
  const [ox, oy, oz] = volume.origin;
  const [sx, sy, sz] = volume.spacing;
  const toVoxel = (p: Vec3): [number, number, number] => [
    Math.round((p[0] - ox) / sx) + grid.offset[0],
    Math.round((p[1] - oy) / sy) + grid.offset[1],
    Math.round((p[2] - oz) / sz) + grid.offset[2],
  ];
  const toWorld = (i: number, j: number, k: number): Vec3 => [
    ox + (i - grid.offset[0]) * sx,
    oy + (j - grid.offset[1]) * sy,
    oz + (k - grid.offset[2]) * sz,
  ];
  const labelAt = (p: Vec3): number => {
    const [i, j, k] = toVoxel(p);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
    return grid.labels[i + nx * (j + ny * k)];
  };
  // Only the part of the grid inside the case volume counts.
  const k0 = grid.offset[2];
  const k1 = grid.offset[2] + volume.dims[2] - 1;

  // One pass over the labels: centroids of the vertebrae, extreme points of sternum and hips.
  const sums = new Map<number, { n: number; x: number; y: number; z: number }>();
  let xiphoid: Vec3 | null = null;
  const hipTop: Array<Vec3 | null> = [null, null];
  const midlineX = skin.map.center[0];
  let symphysis: Vec3 | null = null;
  for (let k = k0; k <= k1; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const label = grid.labels[i + nx * (j + ny * k)];
        if (!label) continue;
        if (label >= 26 && label <= 37) {
          const s = sums.get(label) ?? { n: 0, x: 0, y: 0, z: 0 };
          const w = toWorld(i, j, k);
          s.n++;
          s.x += w[0];
          s.y += w[1];
          s.z += w[2];
          sums.set(label, s);
        } else if (label === STERNUM) {
          const w = toWorld(i, j, k);
          // The xiphoid tip: the lowest sternum voxel (the most anterior one at that height).
          if (!xiphoid || w[2] < xiphoid[2] - 0.1 || (Math.abs(w[2] - xiphoid[2]) < 0.1 && w[1] > xiphoid[1])) xiphoid = w;
        } else if (label === HIP_LEFT || label === HIP_RIGHT) {
          const w = toWorld(i, j, k);
          const side = label === HIP_RIGHT ? 0 : 1;
          const top = hipTop[side];
          if (!top || w[2] > top[2]) hipTop[side] = w;
          // The top of the pubic symphysis: the highest hip voxel near the midline, in front of the bladder.
          if (Math.abs(w[0] - midlineX) < 12 && w[1] > -20 && (!symphysis || w[2] > symphysis[2])) symphysis = w;
        }
      }
    }
  }

  const vertebrae: Vertebra[] = [];
  for (const [label, name] of VERTEBRAE) {
    const s = sums.get(label);
    if (!s || s.n < 200) continue;
    const centre: Vec3 = [s.x / s.n, s.y / s.n, s.z / s.n];
    // Walk forward from the centroid along y until the vertebra ends: the front of the body.
    let front: Vec3 = centre;
    for (let d = 0; d < 80; d += 0.75) {
      const p: Vec3 = [centre[0], centre[1] + d, centre[2]];
      if (labelAt(p) === label) front = p;
    }
    vertebrae.push({ name, centre: round3(centre), front: round3(front) });
  }

  // The anterior superior iliac spine: the most anterior point of each hip bone's upper third.
  const asis: Vec3[] = [];
  for (const [side, label] of [
    [0, HIP_RIGHT],
    [1, HIP_LEFT],
  ] as const) {
    const top = hipTop[side];
    let best: Vec3 | null = null;
    if (top) {
      for (let k = k0; k <= k1; k++) {
        const z = oz + (k - grid.offset[2]) * sz;
        if (z < top[2] - 70) continue;
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) {
            if (grid.labels[i + nx * (j + ny * k)] !== label) continue;
            const w = toWorld(i, j, k);
            if (!best || w[1] > best[1]) best = w;
          }
        }
      }
    }
    asis.push(round3(best ?? [0, 0, 0]));
  }

  // Ribs under the skin, and the costal margin, along lines down the body every 4°.
  const ribLines: RibLine[] = [];
  const costalMargin: Array<[number, number]> = [];
  const { center } = skin.map;
  for (let phiDeg = -120; phiDeg <= 120; phiDeg += 4) {
    const runs: Array<[number, number, number]> = [];
    let lowest = Number.POSITIVE_INFINITY;
    for (let z = skin.zMin + 1; z <= skin.zMax - 1; z += sz / 2) {
      const p = skin.pointAt(phiDeg, z);
      const inward = normalize2([center[0] - p[0], center[1] - p[1]]);
      let rib = -1;
      for (let depth = 0; depth <= RIB_DEPTH_MM; depth += 0.75) {
        const label = labelAt([p[0] + inward[0] * depth, p[1] + inward[1] * depth, z]);
        if (label >= RIB_LEFT_1 && label < RIB_LEFT_1 + 12) rib = label - RIB_LEFT_1 + 1;
        else if (label >= RIB_RIGHT_1 && label < RIB_RIGHT_1 + 12) rib = label - RIB_RIGHT_1 + 1;
        else if (label === COSTAL_CARTILAGE || label === STERNUM) rib = 0;
        if (rib >= 0) break;
      }
      if (rib < 0) continue;
      lowest = Math.min(lowest, z);
      const last = runs.at(-1);
      if (last && last[0] === rib && z - last[2] <= sz * 1.5) last[2] = z;
      else runs.push([rib, z, z]);
    }
    ribLines.push({
      phiDeg,
      ribs: runs.filter((r) => r[2] - r[1] >= 2).map(([rib, lo, hi]) => [rib, round1(lo), round1(hi)] as const),
    });
    if (Number.isFinite(lowest)) costalMargin.push([phiDeg, round1(lowest)]);
  }

  // The umbilicus: a dip in the front of the abdomen near the midline, between L2 and L5.
  const umbilicus = findUmbilicus(volume, skin, vertebrae);
  const xiphoidPoint = xiphoid ?? skin.pointAt(0, skin.zMax - 20);
  return {
    vertebrae,
    costalMargin,
    ribLines,
    xiphoid: round3(xiphoidPoint),
    umbilicus: round3(umbilicus),
    iliacCrests: [round3(hipTop[0] ?? [0, 0, 0]), round3(hipTop[1] ?? [0, 0, 0])],
    asis: [asis[0], asis[1]],
    symphysis: round3(symphysis ?? [midlineX, 0, skin.zMin + 20]),
  };
}

/** The navel is a pit in the skin: find the deepest dip of the anterior midline between L2 and L5. */
function findUmbilicus(volume: ClassVolume, skin: SkinSurface, vertebrae: readonly Vertebra[]): Vec3 {
  const z = (name: string, fallback: number) => vertebrae.find((v) => v.name === name)?.centre[2] ?? fallback;
  const zTop = z("L2", 30);
  const zBottom = z("L5", -60);
  const [nx, ny, nz] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  const i0 = Math.round((skin.map.center[0] - ox) / sx);
  // Anterior extent of the body at the midline (a few columns, so the pit is not missed).
  const front = (k: number): number => {
    let best = Number.NEGATIVE_INFINITY;
    for (let i = i0 - 4; i <= i0 + 4; i++) {
      if (i < 0 || i >= nx) continue;
      for (let j = ny - 1; j >= 0; j--) {
        if (volume.data[i + nx * (j + ny * k)] !== TISSUE.outside) {
          best = Math.max(best, oy + j * sy);
          break;
        }
      }
    }
    return best;
  };
  const kTop = Math.min(nz - 1, Math.round((zTop - oz) / sz));
  const kBottom = Math.max(0, Math.round((zBottom - oz) / sz));
  const profile: Array<{ k: number; y: number }> = [];
  for (let k = kBottom; k <= kTop; k++) profile.push({ k, y: front(k) });
  let best = { k: Math.round((kTop + kBottom) / 2), depth: 0 };
  const window = Math.round(20 / sz);
  for (let n = window; n < profile.length - window; n++) {
    const baseline = (profile[n - window].y + profile[n + window].y) / 2;
    const depth = baseline - profile[n].y;
    if (depth > best.depth) best = { k: profile[n].k, depth };
  }
  const zNavel = oz + best.k * sz;
  // No clear pit: the umbilicus usually lies at the L3/L4 disc.
  const zFinal = best.depth >= 3 ? zNavel : (z("L3", 0) + z("L4", -30)) / 2;
  return skin.pointAt(0, zFinal);
}

function normalize2(v: [number, number]): [number, number] {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round3(v: Vec3): Vec3 {
  return [round1(v[0]), round1(v[1]), round1(v[2])];
}
