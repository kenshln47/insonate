import { squaredDistance } from "./morphology";
import { RESPIRATORY, TISSUE } from "./tissues";
import type { ClassVolume } from "./volume";

/**
 * Blood flow for Doppler. Every voxel of the large segmented vessels gets a flow direction,
 * a place in the vessel's laminar profile, and a vessel type whose cardiac waveform sets the
 * speed over time.
 *
 * The direction comes from the vessel's own shape: a geodesic distance is grown through the
 * vessel from where blood enters it (the top of the aorta, the bottom of the IVC, the splenic
 * end of the splenic vein, the hilum for the portal branches in the liver), and blood flows
 * down that distance. Hepatic veins are the liver vessels nearer to the IVC than to the portal
 * vein along the vessel tree; blood in them flows toward the IVC.
 */
export const VESSELS = ["aorta", "ivc", "portal", "hepatic", "iliacArtery", "iliacVein"] as const;
export type VesselKind = (typeof VESSELS)[number];

/** Peak speed of each vessel's waveform (cm/s), typical adult values. */
export const PEAK_CM_S: Readonly<Record<VesselKind, number>> = {
  aorta: 90,
  ivc: 28,
  portal: 22,
  hepatic: 32,
  iliacArtery: 105,
  iliacVein: 16,
};

/** Heart rate of the simulated patient (beats per minute). */
export const HEART_RATE_BPM = 72;

const g = (x: number, mu: number, sigma: number) => Math.exp(-(((x - mu) / sigma) ** 2));

/**
 * Speed over the cardiac cycle as a fraction of the peak (negative = reversed), at phase 0–1.
 * - Abdominal aorta and iliac arteries: high-resistance, triphasic (systolic peak, brief reversal, small forward wave).
 * - IVC and hepatic veins: toward the heart in systole (S) and diastole (D), briefly reversed with atrial contraction (a).
 * - Portal vein: continuous flow toward the liver, gently undulating.
 */
export function waveform(kind: VesselKind, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (kind) {
    case "aorta":
      return g(p, 0.13, 0.055) + 0.06 * g(p, 0.03, 0.03) - 0.14 * g(p, 0.31, 0.045) + 0.12 * g(p, 0.43, 0.06);
    case "iliacArtery":
      return g(p, 0.13, 0.05) - 0.24 * g(p, 0.3, 0.045) + 0.14 * g(p, 0.42, 0.055);
    case "ivc":
    case "hepatic":
      return 0.25 + 0.75 * g(p, 0.3, 0.09) + 0.55 * g(p, 0.64, 0.09) - 0.75 * g(p, 0.94, 0.035) - 0.75 * g(p, -0.06, 0.035);
    case "portal":
      return 0.86 + 0.12 * Math.sin(2 * Math.PI * (p - 0.2));
    case "iliacVein":
      return 0.8 + 0.2 * Math.sin(2 * Math.PI * p);
  }
}

/** Cardiac phase (0–1) at a time in ms. */
export function cardiacPhase(timeMs: number): number {
  const period = 60000 / HEART_RATE_BPM;
  return (timeMs % period) / period;
}

/** The flow of every vessel voxel, in an open-addressing hash table keyed by voxel index. */
export interface FlowField {
  /** Table size − 1 (a power of two minus one), and the shift that takes a hash's top bits. */
  readonly mask: number;
  readonly shift: number;
  /** Voxel index per slot, −1 if empty. */
  readonly keys: Int32Array;
  /** Unit flow direction × 127, three per slot. */
  readonly direction: Int8Array;
  /** Laminar profile: 0 at the wall to 255 on the axis (parabolic). */
  readonly profile: Uint8Array;
  /** Index into VESSELS. */
  readonly kind: Uint8Array;
  readonly count: number;
}

/** Fibonacci hashing: the top bits of the index times 2³²/φ. */
function hash(index: number, shift: number): number {
  return Math.imul(index, 0x9e3779b1) >>> shift;
}

/** The slot of a voxel in the flow field, or −1 if no blood flows there. */
export function flowSlot(field: FlowField, index: number): number {
  let slot = hash(index, field.shift);
  for (;;) {
    const key = field.keys[slot];
    if (key === index) return slot;
    if (key === -1) return -1;
    slot = (slot + 1) & field.mask;
  }
}

/** Voxel index (with the breathing shift applied) of the tissue at voxel (i, j, k), as the simulator sees it. */
export function movedIndex(volume: ClassVolume, i: number, j: number, k: number): number {
  const [nx, ny, nz] = volume.dims;
  const here = i + nx * (j + ny * k);
  const shift = volume.breathShift?.[k] ?? 0;
  if (shift === 0 || !RESPIRATORY[volume.data[here]]) return here;
  const ks = k + shift;
  if (ks >= nz) return here;
  const moved = i + nx * (j + ny * ks);
  return RESPIRATORY[volume.data[moved]] ? moved : here;
}

interface Group {
  readonly kind: VesselKind;
  /** Voxel indices of the vessel. */
  readonly voxels: Int32Array;
  /** Distance from where blood enters (mm), per voxel of `voxels`. */
  readonly distance: Float32Array;
  /** +1: blood flows away from the source; −1: toward it (hepatic veins drain to the IVC). */
  readonly sign: 1 | -1;
  /** Typical radius, voxels (for the local radius search). */
  readonly radius: number;
}

/** Build the flow field of a case (a few hundred milliseconds; done once, when Doppler is first used). */
export function buildFlowField(volume: ClassVolume, log?: (message: string) => void): FlowField {
  const t0 = Date.now();
  const step = (message: string) => log?.(`${Date.now() - t0} ms ${message}`);
  const [nx, ny, nz] = volume.dims;
  const data = volume.data;
  const collect = (tissue: number): number[] => {
    const out: number[] = [];
    for (let p = 0; p < data.length; p++) if (data[p] === tissue) out.push(p);
    return out;
  };
  const k = (p: number) => Math.floor(p / (nx * ny));
  const x = (p: number) => p % nx;

  const groups: Group[] = [];
  // Main vessels: one source each.
  const aorta = collect(TISSUE.aorta);
  const ivc = collect(TISSUE.ivc);
  const portal = collect(TISSUE.portalVein);
  const iliacArtery = collect(TISSUE.iliacArtery);
  const iliacVein = collect(TISSUE.iliacVein);
  const top = (voxels: number[]) => {
    const kMax = voxels.reduce((m, p) => Math.max(m, k(p)), 0);
    return voxels.filter((p) => k(p) >= kMax - 1);
  };
  const bottom = (voxels: number[]) => {
    const kMin = voxels.reduce((m, p) => Math.min(m, k(p)), nz);
    return voxels.filter((p) => k(p) <= kMin + 1);
  };
  // Paired vessels (left and right iliacs): each side has its own end.
  const bySide = (voxels: number[], end: (side: number[]) => number[]) => {
    const middle = voxels.reduce((sum, p) => sum + x(p), 0) / Math.max(1, voxels.length);
    return [...end(voxels.filter((p) => x(p) < middle)), ...end(voxels.filter((p) => x(p) >= middle))];
  };
  const leftmost = (voxels: number[]) => {
    const xMin = voxels.reduce((m, p) => Math.min(m, x(p)), nx);
    return voxels.filter((p) => x(p) <= xMin + 2);
  };
  step(`collected: aorta ${aorta.length}, ivc ${ivc.length}, portal ${portal.length}, iliac ${iliacArtery.length}/${iliacVein.length}`);
  if (aorta.length > 0) groups.push(grow("aorta", aorta, [top(aorta)], volume, 1, 7));
  if (ivc.length > 0) groups.push(grow("ivc", ivc, [bottom(ivc)], volume, 1, 7));
  // Splenic vein → confluence → portal vein: blood enters at the spleen end, the patient's left.
  if (portal.length > 0) groups.push(grow("portal", portal, [leftmost(portal)], volume, 1, 5));
  // The iliac arteries start at the aortic bifurcation (their top); the veins drain upward.
  if (iliacArtery.length > 0) groups.push(grow("iliacArtery", iliacArtery, [bySide(iliacArtery, top)], volume, 1, 4));
  if (iliacVein.length > 0) groups.push(grow("iliacVein", iliacVein, [bySide(iliacVein, bottom)], volume, 1, 4));

  step("main vessels grown");
  // Vessels in the liver: portal branches grow from the portal vein, hepatic veins from the IVC.
  const liverVessels = collect(TISSUE.liverVessel);
  step(`liver vessels ${liverVessels.length}`);
  if (liverVessels.length > 0) {
    const touching = (tissue: number) =>
      liverVessels.filter((p) => {
        for (const step of [1, -1, nx, -nx, nx * ny, -nx * ny]) if (data[p + step] === tissue) return true;
        return false;
      });
    const portalSeeds = [...touching(TISSUE.portalVein), ...touching(TISSUE.portalWall)];
    const hepaticSeeds = [...touching(TISSUE.ivc), ...touching(TISSUE.ivcWall)];
    if (portalSeeds.length > 0 || hepaticSeeds.length > 0) {
      const split = grow("portal", liverVessels, [portalSeeds, hepaticSeeds], volume, 1, 3);
      // Each voxel belongs to the tree whose source is nearer along the vessels.
      const nearest = split.nearest ?? new Uint8Array(liverVessels.length);
      const pick = (tree: number) => {
        const voxels: number[] = [];
        const distance: number[] = [];
        split.voxels.forEach((p, n) => {
          if (nearest[n] === tree && Number.isFinite(split.distance[n])) {
            voxels.push(p);
            distance.push(split.distance[n]);
          }
        });
        return { voxels: Int32Array.from(voxels), distance: Float32Array.from(distance) };
      };
      const portalTree = pick(0);
      const hepaticTree = pick(1);
      groups.push({ kind: "portal", ...portalTree, sign: 1, radius: 3 });
      groups.push({ kind: "hepatic", ...hepaticTree, sign: -1, radius: 3 });
    }
  }

  // Hash table with room to spare.
  const total = groups.reduce((sum, group) => sum + group.voxels.length, 0);
  let bits = 10;
  while (1 << bits < total * 2) bits++;
  const size = 1 << bits;
  const mask = size - 1;
  const shift = 32 - bits;
  const keys = new Int32Array(size).fill(-1);
  const direction = new Int8Array(size * 3);
  const profile = new Uint8Array(size);
  const kind = new Uint8Array(size);
  step("liver vessels grown");
  for (const group of groups) {
    fill(group, volume, { mask, shift, keys, direction, profile, kind });
    step(`filled ${group.kind} (${group.voxels.length})`);
  }
  return { mask, shift, keys, direction, profile, kind, count: total };
}

/** Geodesic distance (mm) through a vessel from its source voxels: Dijkstra over 26-neighbours. */
function grow(
  kind: VesselKind,
  voxelList: number[],
  sources: number[][],
  volume: ClassVolume,
  sign: 1 | -1,
  radius: number,
): Group & { nearest?: Uint8Array } {
  const [nx, ny] = volume.dims;
  const [sx] = volume.spacing;
  const voxels = Int32Array.from(voxelList);
  const local = new Map<number, number>();
  for (let n = 0; n < voxels.length; n++) local.set(voxels[n], n);
  // Float64: with float32 storage, ties between paths re-queue nodes forever.
  const distance = new Float64Array(voxels.length).fill(Number.POSITIVE_INFINITY);
  const nearest = new Uint8Array(voxels.length);
  const heap = new MinHeap(voxels.length);
  sources.forEach((list, tree) => {
    for (const p of list) {
      const n = local.get(p);
      if (n === undefined) continue;
      distance[n] = 0;
      nearest[n] = tree;
      heap.push(n, 0);
    }
  });
  const offsets: Array<[number, number]> = [];
  for (let dk = -1; dk <= 1; dk++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0 && dk === 0) continue;
        offsets.push([di + nx * (dj + ny * dk), sx * Math.hypot(di, dj, dk)]);
      }
    }
  }
  while (heap.size > 0) {
    const [n, d] = heap.pop();
    if (d > distance[n]) continue;
    const p = voxels[n];
    for (const [step, cost] of offsets) {
      const m = local.get(p + step);
      if (m === undefined) continue;
      const next = d + cost;
      if (next < distance[m]) {
        distance[m] = next;
        nearest[m] = nearest[n];
        heap.push(m, next);
      }
    }
  }
  return { kind, voxels, distance: Float32Array.from(distance), sign, radius, nearest: sources.length > 1 ? nearest : undefined };
}

/** Write a vessel's voxels into the flow table: direction down the geodesic distance, laminar profile. */
function fill(
  group: Group,
  volume: ClassVolume,
  table: { mask: number; shift: number; keys: Int32Array; direction: Int8Array; profile: Uint8Array; kind: Uint8Array },
): void {
  const [nx, ny, nz] = volume.dims;
  const { voxels, distance } = group;
  if (voxels.length === 0) return;
  // A box around the vessel, for its mask, distance to the wall and local radius.
  let i0 = nx;
  let j0 = ny;
  let k0 = nz;
  let i1 = 0;
  let j1 = 0;
  let k1 = 0;
  for (const p of voxels) {
    const i = p % nx;
    const j = Math.floor(p / nx) % ny;
    const k = Math.floor(p / (nx * ny));
    i0 = Math.min(i0, i);
    j0 = Math.min(j0, j);
    k0 = Math.min(k0, k);
    i1 = Math.max(i1, i);
    j1 = Math.max(j1, j);
    k1 = Math.max(k1, k);
  }
  const pad = group.radius + 2;
  i0 = Math.max(0, i0 - pad);
  j0 = Math.max(0, j0 - pad);
  k0 = Math.max(0, k0 - pad);
  i1 = Math.min(nx - 1, i1 + pad);
  j1 = Math.min(ny - 1, j1 + pad);
  k1 = Math.min(nz - 1, k1 + pad);
  const bx = i1 - i0 + 1;
  const by = j1 - j0 + 1;
  const bz = k1 - k0 + 1;
  const box = bx * by * bz;
  const boxOf = (p: number) => (p % nx) - i0 + bx * ((Math.floor(p / nx) % ny) - j0 + by * (Math.floor(p / (nx * ny)) - k0));
  // Geodesic distance in the box (NaN outside the vessel or where blood never reached).
  const dist = new Float32Array(box).fill(Number.NaN);
  const outside = new Uint8Array(box).fill(1);
  voxels.forEach((p, n) => {
    const b = boxOf(p);
    outside[b] = 0;
    if (Number.isFinite(distance[n])) dist[b] = distance[n];
  });
  // Distance to the wall (voxels²): from every vessel voxel to the nearest voxel outside it.
  const wall = squaredDistance(outside, [bx, by, bz]);
  // Local radius²: the largest wall distance nearby (a max filter over a box the vessel's size).
  const local = maxFilter(wall, [bx, by, bz], group.radius);
  // Gradient of the geodesic distance (central differences, one-sided at the edges)...
  const gradient = [new Float32Array(box), new Float32Array(box), new Float32Array(box)];
  const strides = [1, bx, bx * by];
  for (let b = 0; b < box; b++) {
    const here = dist[b];
    if (Number.isNaN(here)) continue;
    for (let axis = 0; axis < 3; axis++) {
      const stride = strides[axis];
      const up = b + stride < box ? dist[b + stride] : Number.NaN;
      const down = b - stride >= 0 ? dist[b - stride] : Number.NaN;
      const forward = up - here;
      const backward = here - down;
      gradient[axis][b] = Number.isNaN(forward)
        ? Number.isNaN(backward)
          ? 0
          : backward
        : Number.isNaN(backward)
          ? forward
          : (forward + backward) / 2;
    }
  }
  // ...smoothed over a 5-voxel box, so the direction follows the vessel, not the voxel staircase.
  for (const component of gradient) boxBlur(component, [bx, by, bz], 2);
  for (const p of voxels) {
    const b = boxOf(p);
    if (Number.isNaN(dist[b])) continue;
    const gx = gradient[0][b];
    const gy = gradient[1][b];
    const gz = gradient[2][b];
    const length = Math.hypot(gx, gy, gz);
    if (length < 1e-6) continue;
    const s = group.sign / length;
    const w = Math.min(1, Math.sqrt(wall[b] / Math.max(1, local[b])));
    // Parabolic (laminar) profile: zero at the wall, full speed on the axis.
    const profile = 1 - (1 - w) ** 2;
    let slot = hash(p, table.shift);
    while (table.keys[slot] !== -1 && table.keys[slot] !== p) slot = (slot + 1) & table.mask;
    table.keys[slot] = p;
    table.direction[slot * 3] = Math.round(gx * s * 127);
    table.direction[slot * 3 + 1] = Math.round(gy * s * 127);
    table.direction[slot * 3 + 2] = Math.round(gz * s * 127);
    table.profile[slot] = Math.round(profile * 255);
    table.kind[slot] = VESSELS.indexOf(group.kind);
  }
}

/** In-place separable box blur (sum over ±radius voxels along each axis; the scale does not matter here). */
function boxBlur(values: Float32Array, dims: readonly [number, number, number], radius: number): void {
  const [bx, by, bz] = dims;
  const line = new Float32Array(Math.max(bx, by, bz));
  for (const [count, stride, lines] of [
    [bx, 1, by * bz],
    [by, bx, bx * bz],
    [bz, bx * by, bx * by],
  ] as const) {
    for (let n = 0; n < lines; n++) {
      const base = stride === 1 ? n * bx : stride === bx ? (n % bx) + Math.floor(n / bx) * bx * by : n;
      for (let q = 0; q < count; q++) line[q] = values[base + q * stride];
      let sum = 0;
      for (let q = 0; q < Math.min(count, radius); q++) sum += line[q];
      for (let q = 0; q < count; q++) {
        if (q + radius < count) sum += line[q + radius];
        if (q - radius - 1 >= 0) sum -= line[q - radius - 1];
        values[base + q * stride] = sum;
      }
    }
  }
}

/** Separable box max filter (radius in voxels). */
function maxFilter(values: Float32Array, dims: readonly [number, number, number], radius: number): Float32Array {
  const [bx, by, bz] = dims;
  let src = values;
  for (const [count, stride, lines] of [
    [bx, 1, by * bz],
    [by, bx, bx * bz],
    [bz, bx * by, bx * by],
  ] as const) {
    const out = new Float32Array(src.length);
    for (let line = 0; line < lines; line++) {
      const base = stride === 1 ? line * bx : stride === bx ? (line % bx) + Math.floor(line / bx) * bx * by : line;
      for (let q = 0; q < count; q++) {
        let best = 0;
        const lo = Math.max(0, q - radius);
        const hi = Math.min(count - 1, q + radius);
        for (let r = lo; r <= hi; r++) best = Math.max(best, src[base + r * stride]);
        out[base + q * stride] = best;
      }
    }
    src = out;
  }
  return src;
}

/** A binary min-heap of (item, priority) pairs. */
class MinHeap {
  private items: Int32Array;
  private priorities: Float64Array;
  size = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(Math.max(16, capacity));
    this.priorities = new Float64Array(Math.max(16, capacity));
  }

  push(item: number, priority: number): void {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2);
      items.set(this.items);
      this.items = items;
      const priorities = new Float64Array(this.size * 2);
      priorities.set(this.priorities);
      this.priorities = priorities;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= priority) break;
      this.items[i] = this.items[parent];
      this.priorities[i] = this.priorities[parent];
      i = parent;
    }
    this.items[i] = item;
    this.priorities[i] = priority;
  }

  pop(): [number, number] {
    const top: [number, number] = [this.items[0], this.priorities[0]];
    const lastItem = this.items[--this.size];
    const lastPriority = this.priorities[this.size];
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= this.size) break;
      const right = left + 1;
      const child = right < this.size && this.priorities[right] < this.priorities[left] ? right : left;
      if (this.priorities[child] >= lastPriority) break;
      this.items[i] = this.items[child];
      this.priorities[i] = this.priorities[child];
      i = child;
    }
    this.items[i] = lastItem;
    this.priorities[i] = lastPriority;
    return top;
  }
}
