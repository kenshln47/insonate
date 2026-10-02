import { closeMask, floodOutside, largestComponentPerSlice, squaredDistance } from "./morphology";
import { hash3 } from "./speckle";
import { TISSUE, TISSUE_TO_ORGAN } from "./tissues";
import { type ClassVolume, createVolume } from "./volume";

/** TotalSegmentator (v2, 117 classes) label → tissue class. Unlisted labels fall back to HU. */
const LABEL_TO_TISSUE: Record<number, number> = (() => {
  const map: Record<number, number> = {
    1: TISSUE.spleen,
    2: TISSUE.kidneyRight,
    3: TISSUE.kidneyLeft,
    4: TISSUE.gallbladder,
    5: TISSUE.liver,
    6: TISSUE.stomachWall,
    7: TISSUE.pancreas,
    8: TISSUE.adrenal,
    9: TISSUE.adrenal,
    15: TISSUE.stomachWall,
    16: TISSUE.air,
    18: TISSUE.bowelWall,
    19: TISSUE.bowelWall,
    20: TISSUE.bowelWall,
    21: TISSUE.bladder,
    22: TISSUE.prostate,
    23: TISSUE.fluid,
    24: TISSUE.fluid,
    52: TISSUE.aorta,
    63: TISSUE.ivc,
    64: TISSUE.portalVein,
    65: TISSUE.iliacArtery,
    66: TISSUE.iliacArtery,
    67: TISSUE.iliacVein,
    68: TISSUE.iliacVein,
    79: TISSUE.soft,
    116: TISSUE.bone,
    117: TISSUE.cartilage,
  };
  for (let l = 10; l <= 14; l++) map[l] = TISSUE.lung;
  for (let l = 25; l <= 50; l++) map[l] = TISSUE.bone;
  for (let l = 53; l <= 62; l++) map[l] = TISSUE.blood;
  for (let l = 69; l <= 78; l++) map[l] = TISSUE.bone;
  for (let l = 80; l <= 89; l++) map[l] = TISSUE.muscle;
  for (let l = 91; l <= 115; l++) map[l] = TISSUE.bone;
  return map;
})();

const BOWEL_LABELS = new Set([18, 19, 20]);
/** Stomach and (abdominal) oesophagus: hollow like bowel, but they move with breathing. */
const STOMACH_LABELS = new Set([6, 15]);

export interface ClassifyInput {
  dims: readonly [number, number, number];
  spacing: readonly [number, number, number];
  /** Hounsfield units, i-fastest. Axes must already be RAS (x right, y anterior, z superior). */
  hu: ArrayLike<number>;
  /** TotalSegmentator labels, same layout. */
  labels: ArrayLike<number>;
  /** Inclusive slice range to keep. */
  zRange?: readonly [number, number];
  /** Margin (voxels) around the body when cropping in x/y. */
  margin?: number;
  /** Fat closer than this to the skin (mm) is subcutaneous; deeper fat is visceral. */
  subcutaneousMm?: number;
}

export interface ClassifyResult {
  volume: ClassVolume;
  /** Offset of the cropped volume in the source voxel grid. */
  offset: readonly [number, number, number];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/** Turn CT + segmentation into a cropped tissue-class volume. */
export function classify(input: ClassifyInput): ClassifyResult {
  const [nx, ny, nz] = input.dims;
  const [z0, z1] = input.zRange ?? [0, nz - 1];
  const margin = input.margin ?? 3;
  const { hu } = input;
  // Smooth the outlines of the solid organs: segmentations are voxel staircases with stray spurs.
  const labels = Uint8Array.from(input.labels);
  for (const label of SMOOTHED_LABELS) smoothLabel(labels, input.dims, label);

  // 1. Outside air (reachable from the slice border), then drop the table and other strays.
  const open = new Uint8Array(nx * ny * nz);
  for (let i = 0; i < open.length; i++) open[i] = hu[i] < -400 && labels[i] === 0 ? 1 : 0;
  const outsideAir = floodOutside(open, input.dims);
  const bodyCandidate = new Uint8Array(open.length);
  for (let i = 0; i < open.length; i++) bodyCandidate[i] = outsideAir[i] ? 0 : 1;
  const body = largestComponentPerSlice(bodyCandidate, input.dims);

  // 2. Reference intensities for vessels inside solid organs (contrast-enhanced CT).
  const liverHu: number[] = [];
  const spleenHu: number[] = [];
  for (let i = 0; i < labels.length; i += 7) {
    if (labels[i] === 5) liverHu.push(hu[i]);
    if (labels[i] === 1) spleenHu.push(hu[i]);
  }
  const liverVesselHu = median(liverHu) + 40;
  const spleenVesselHu = median(spleenHu) + 45;

  // 3. Crop box: body extent within the slice range.
  let x0 = nx;
  let x1 = 0;
  let y0 = ny;
  let y1 = 0;
  for (let k = z0; k <= z1; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!body[i + nx * (j + ny * k)]) continue;
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        if (j > y1) y1 = j;
      }
    }
  }
  x0 = Math.max(0, x0 - margin);
  y0 = Math.max(0, y0 - margin);
  x1 = Math.min(nx - 1, x1 + margin);
  y1 = Math.min(ny - 1, y1 + margin);
  const dims = [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1] as const;
  const [cx, cy] = dims;
  // Centre the world on the cropped volume.
  const origin = [
    -((dims[0] - 1) * input.spacing[0]) / 2,
    -((dims[1] - 1) * input.spacing[1]) / 2,
    -((dims[2] - 1) * input.spacing[2]) / 2,
  ] as const;
  const volume = createVolume(dims, input.spacing, origin);
  const out = volume.data;

  // 4. Classify every voxel.
  for (let k = 0; k < dims[2]; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const src = i + x0 + nx * (j + y0 + ny * (k + z0));
        const dst = i + cx * (j + cy * k);
        if (!body[src]) {
          out[dst] = TISSUE.outside;
          continue;
        }
        const label = labels[src];
        const h = hu[src];
        let tissue: number;
        if (label === 0) {
          tissue = h < -400 ? TISSUE.air : h < -25 ? TISSUE.fat : h > 130 ? TISSUE.blood : TISSUE.soft;
        } else if (BOWEL_LABELS.has(label)) {
          tissue = h < -300 ? TISSUE.air : h > -15 && h < 30 ? TISSUE.fluid : TISSUE.bowelWall;
        } else if (STOMACH_LABELS.has(label)) {
          tissue = h < -300 ? TISSUE.stomachGas : h > -15 && h < 30 ? TISSUE.stomachFluid : TISSUE.stomachWall;
        } else if (label === 5) {
          tissue = h > liverVesselHu ? TISSUE.liverVessel : TISSUE.liver;
        } else if (label === 1) {
          tissue = h > spleenVesselHu ? TISSUE.blood : TISSUE.spleen;
        } else if (label === 51) {
          tissue = h > 130 ? TISSUE.blood : TISSUE.heartMuscle;
        } else {
          tissue = LABEL_TO_TISSUE[label] ?? (h < -25 ? TISSUE.fat : TISSUE.soft);
        }
        out[dst] = tissue;
      }
    }
  }

  // 5. Fat deeper than the subcutaneous layer is retroperitoneal/visceral: echogenic in ultrasound.
  const outsideMask = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) outsideMask[i] = out[i] === TISSUE.outside ? 1 : 0;
  const skinDistance = squaredDistance(outsideMask, dims, input.spacing);
  const deep = (input.subcutaneousMm ?? 22) ** 2;
  // Soft tissue this deep is inside the abdomen (mesentery, nodes), not the body wall: it moves with breathing.
  const deepSoft = 30 ** 2;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === TISSUE.fat && skinDistance[i] > deep) out[i] = TISSUE.deepFat;
    else if (out[i] === TISSUE.soft && skinDistance[i] > deepSoft) out[i] = TISSUE.deepSoft;
  }

  // 6. Kidneys: CT shows one solid organ, ultrasound shows cortex, pyramids and a bright sinus.
  for (const [kidney, medulla, sinus] of [
    [TISSUE.kidneyRight, TISSUE.medullaRight, TISSUE.sinusRight],
    [TISSUE.kidneyLeft, TISSUE.medullaLeft, TISSUE.sinusLeft],
  ] as const) {
    shapeKidney(volume, kidney, medulla, sinus);
  }

  // 7. Bowel gas: drop isolated specks (CT noise) and fill pinholes, so gas reflects as pockets.
  cleanGas(volume);

  // 8. Walls and capsules: the thin bright lines around the gallbladder, bladder, vessels, liver and spleen.
  addShells(volume);
  return { volume, offset: [x0, y0, z0] };
}

/** TotalSegmentator labels of solid organs whose outlines are smoothed: spleen, kidneys, gallbladder, liver, pancreas, bladder. */
const SMOOTHED_LABELS = [1, 2, 3, 4, 5, 7, 21];

/**
 * Smooth one label's outline: blur its mask (Gaussian, σ = 0.8 voxel) and threshold at one half.
 * Voxels that fall out return to background; background voxels that fall in join the organ.
 * Other organs are never overwritten.
 */
function smoothLabel(labels: Uint8Array, dims: readonly [number, number, number], label: number, sigma = 0.8): void {
  const [nx, ny, nz] = dims;
  let lo = [nx, ny, nz];
  let hi = [-1, -1, -1];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      const row = nx * (j + ny * k);
      for (let i = 0; i < nx; i++) {
        if (labels[row + i] !== label) continue;
        if (i < lo[0]) lo[0] = i;
        if (j < lo[1]) lo[1] = j;
        if (k < lo[2]) lo[2] = k;
        if (i > hi[0]) hi[0] = i;
        if (j > hi[1]) hi[1] = j;
        if (k > hi[2]) hi[2] = k;
      }
    }
  }
  if (hi[0] < 0) return;
  const pad = 3;
  lo = lo.map((v) => Math.max(0, v - pad));
  hi = hi.map((v, a) => Math.min(dims[a] - 1, v + pad));
  const [sx, sy, sz] = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
  const at = (i: number, j: number, k: number) => lo[0] + i + nx * (lo[1] + j + ny * (lo[2] + k));
  let field = new Float32Array(sx * sy * sz);
  for (let k = 0; k < sz; k++)
    for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) field[i + sx * (j + sy * k)] = labels[at(i, j, k)] === label ? 1 : 0;
  const radius = 2;
  const weights: number[] = [];
  let total = 0;
  for (let d = -radius; d <= radius; d++) {
    const w = Math.exp(-(d * d) / (2 * sigma * sigma));
    weights.push(w);
    total += w;
  }
  for (let d = 0; d < weights.length; d++) weights[d] /= total;
  const sizes = [sx, sy, sz];
  const strides = [1, sx, sx * sy];
  for (let axis = 0; axis < 3; axis++) {
    const next = new Float32Array(field.length);
    const n = sizes[axis];
    const stride = strides[axis];
    for (let p = 0; p < field.length; p++) {
      const coordinate = Math.floor(p / stride) % n;
      let sum = 0;
      for (let d = -radius; d <= radius; d++) {
        const c = coordinate + d;
        if (c < 0 || c >= n) continue;
        sum += field[p + d * stride] * weights[d + radius];
      }
      next[p] = sum;
    }
    field = next;
  }
  for (let k = 0; k < sz; k++) {
    for (let j = 0; j < sy; j++) {
      for (let i = 0; i < sx; i++) {
        const index = at(i, j, k);
        const inside = field[i + sx * (j + sy * k)] >= 0.5;
        if (labels[index] === label && !inside) labels[index] = 0;
        else if (labels[index] === 0 && inside) labels[index] = label;
      }
    }
  }
}

const NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/** Remove gas voxels with at most one gas neighbour (twice), then fill voxels mostly surrounded by gas. */
function cleanGas(volume: ClassVolume): void {
  for (const [gas, wall, fluid] of [
    [TISSUE.air, TISSUE.bowelWall, TISSUE.fluid],
    [TISSUE.stomachGas, TISSUE.stomachWall, TISSUE.stomachFluid],
  ] as const) {
    cleanGasOf(volume, gas, wall, fluid);
  }
}

function cleanGasOf(volume: ClassVolume, gas: number, wall: number, fluid: number): void {
  const [nx, ny, nz] = volume.dims;
  const data = volume.data;
  const gasNeighbours = (i: number, j: number, k: number) => {
    let count = 0;
    for (const [di, dj, dk] of NEIGHBOURS) {
      const a = i + di;
      const b = j + dj;
      const c = k + dk;
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
      if (data[a + nx * (b + ny * c)] === gas) count++;
    }
    return count;
  };
  for (let pass = 0; pass < 2; pass++) {
    const remove: number[] = [];
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const index = i + nx * (j + ny * k);
          if (data[index] === gas && gasNeighbours(i, j, k) <= 1) remove.push(index);
        }
      }
    }
    for (const index of remove) data[index] = wall;
  }
  const fill: number[] = [];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const index = i + nx * (j + ny * k);
        const t = data[index];
        if ((t === wall || t === fluid) && gasNeighbours(i, j, k) >= 5) fill.push(index);
      }
    }
  }
  for (const index of fill) data[index] = gas;
}

/** Organ tissue → the wall or capsule drawn on its outer voxels. */
const SHELLS: ReadonlyArray<readonly [number, number]> = [
  [TISSUE.gallbladder, TISSUE.gallbladderWall],
  [TISSUE.bladder, TISSUE.bladderWall],
  [TISSUE.aorta, TISSUE.aortaWall],
  [TISSUE.portalVein, TISSUE.portalWall],
  [TISSUE.ivc, TISSUE.ivcWall],
  [TISSUE.liver, TISSUE.liverCapsule],
  [TISSUE.spleen, TISSUE.spleenCapsule],
];

/** Turn each organ's outer layer of voxels (those touching another organ or tissue) into its wall or capsule. */
function addShells(volume: ClassVolume): void {
  const [nx, ny, nz] = volume.dims;
  const data = volume.data;
  const shellOf = new Int16Array(256).fill(-1);
  for (const [tissue, wall] of SHELLS) shellOf[tissue] = wall;
  const changes: Array<[number, number]> = [];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const index = i + nx * (j + ny * k);
        const tissue = data[index];
        const wall = shellOf[tissue];
        if (wall < 0) continue;
        const organ = TISSUE_TO_ORGAN[tissue];
        for (const [di, dj, dk] of NEIGHBOURS) {
          const other = data[i + di + nx * (j + dj + ny * (k + dk))];
          if (TISSUE_TO_ORGAN[other] !== organ) {
            changes.push([index, wall]);
            break;
          }
        }
      }
    }
  }
  for (const [index, wall] of changes) data[index] = wall;
}

/** Renal cortex thickness, mm (adults: about 7–10 mm including the columns). */
const CORTEX_MM = 6;
/** Depth of the medullary pyramids below the cortex, mm. */
const PYRAMID_MM = 7;
/** Echogenic perirenal fat drawn around each kidney, mm. */
const PERIRENAL_FAT_MM = 3;
/** Spacing of the pyramids, mm. */
const PYRAMID_SPACING_MM = 12;
/** Columns of cortex between pyramids are about twice this wide, mm. */
const COLUMN_HALF_MM = 2;
/** One voxel of capsule line where the kidney touches another organ, mm. */
const CAPSULE_MM = 1.6;
const CAPSULE_NEIGHBOURS = new Set<number>([TISSUE.liver, TISSUE.spleen, TISSUE.muscle, TISSUE.bowelWall, TISSUE.stomachWall]);

/**
 * Cellular pattern for the pyramids: each cell of a jittered lattice is one pyramid, and the
 * gap between the nearest two cell centres (F2 − F1, mm) is small along the columns of cortex
 * that separate neighbouring pyramids.
 */
function cellGapMm(x: number, y: number, z: number, cellMm: number): number {
  const u = x / cellMm;
  const v = y / cellMm;
  const w = z / cellMm;
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const k0 = Math.floor(w);
  let f1 = Number.POSITIVE_INFINITY;
  let f2 = Number.POSITIVE_INFINITY;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const h = hash3(i, j, k);
        const px = i + (h & 1023) / 1024;
        const py = j + ((h >>> 10) & 1023) / 1024;
        const pz = k + ((h >>> 20) & 1023) / 1024;
        const d = Math.hypot(u - px, v - py, w - pz);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return (f2 - f1) * cellMm;
}

/**
 * Give a segmented kidney its sonographic layers. Depth below the capsule decides the layer:
 * cortex outside, a broken ring of hypoechoic pyramids, then bright sinus fat in the centre
 * (which opens out through the hilum). A thin rim of echogenic fat outlines the capsule.
 */
function shapeKidney(volume: ClassVolume, kidney: number, medulla: number, sinus: number): void {
  const [nx, ny, nz] = volume.dims;
  const data = volume.data;
  let lo = [nx, ny, nz];
  let hi = [-1, -1, -1];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (data[i + nx * (j + ny * k)] !== kidney) continue;
        lo = [Math.min(lo[0], i), Math.min(lo[1], j), Math.min(lo[2], k)];
        hi = [Math.max(hi[0], i), Math.max(hi[1], j), Math.max(hi[2], k)];
      }
    }
  }
  if (hi[0] < 0) return;
  const pad = 10;
  const b0 = lo.map((v) => Math.max(0, v - pad));
  const b1 = hi.map((v, a) => Math.min(volume.dims[a] - 1, v + pad));
  const sub = [b1[0] - b0[0] + 1, b1[1] - b0[1] + 1, b1[2] - b0[2] + 1] as const;
  const mask = new Uint8Array(sub[0] * sub[1] * sub[2]);
  const index = (i: number, j: number, k: number) => i + b0[0] + nx * (j + b0[1] + ny * (k + b0[2]));
  for (let k = 0; k < sub[2]; k++) {
    for (let j = 0; j < sub[1]; j++) {
      for (let i = 0; i < sub[0]; i++) mask[i + sub[0] * (j + sub[1] * k)] = data[index(i, j, k)] === kidney ? 1 : 0;
    }
  }
  // The hilum: the concavity that closing fills in.
  const closed = closeMask(mask, sub, volume.spacing, 11);
  const outsideSolid = new Uint8Array(mask.length);
  for (let m = 0; m < mask.length; m++) outsideSolid[m] = closed[m] ? 0 : 1;
  const depth2 = squaredDistance(outsideSolid, sub, volume.spacing);
  const near2 = squaredDistance(mask, sub, volume.spacing);
  const [sx, sy, sz] = volume.spacing;
  for (let k = 0; k < sub[2]; k++) {
    for (let j = 0; j < sub[1]; j++) {
      for (let i = 0; i < sub[0]; i++) {
        const m = i + sub[0] * (j + sub[1] * k);
        const idx = index(i, j, k);
        const tissue = data[idx];
        if (mask[m]) {
          const depth = Math.sqrt(depth2[m]);
          if (depth > CORTEX_MM + PYRAMID_MM) {
            data[idx] = sinus;
          } else if (depth > CORTEX_MM) {
            const gap = cellGapMm((i + b0[0]) * sx, (j + b0[1]) * sy, (k + b0[2]) * sz, PYRAMID_SPACING_MM);
            if (gap > COLUMN_HALF_MM) data[idx] = medulla;
          }
        } else if (closed[m]) {
          if (tissue === TISSUE.fat || tissue === TISSUE.deepFat || tissue === TISSUE.soft || tissue === TISSUE.deepSoft) data[idx] = sinus;
          else if (tissue === TISSUE.fluid) data[idx] = TISSUE.renalPelvis;
        } else if (near2[m] <= PERIRENAL_FAT_MM ** 2 && (tissue === TISSUE.fat || tissue === TISSUE.soft || tissue === TISSUE.deepSoft)) {
          data[idx] = TISSUE.deepFat;
        } else if (near2[m] <= CAPSULE_MM ** 2 && CAPSULE_NEIGHBOURS.has(tissue)) {
          // Capsule and fascia: a bright line even where the kidney touches liver or spleen.
          data[idx] = TISSUE.deepFat;
        }
      }
    }
  }
}
