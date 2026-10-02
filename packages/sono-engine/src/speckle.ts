/**
 * Tissue-locked random fields. Because they are indexed by world position,
 * speckle stays put when the probe moves a little and decorrelates when the
 * scan plane leaves it, like real speckle.
 */
export const SPECKLE_SIZE = 64;
const MASK = SPECKLE_SIZE - 1;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SpeckleField {
  /** In-phase and quadrature scatterer amplitudes, independent standard normals. */
  readonly re: Float32Array;
  readonly im: Float32Array;
  /** Uniform values in [0, 1] for coarse tissue texture. */
  readonly coarse: Float32Array;

  constructor(seed = 1234) {
    const random = seeded(seed);
    const n = SPECKLE_SIZE ** 3;
    this.re = new Float32Array(n);
    this.im = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Box–Muller: two independent normals per draw.
      let u = random();
      if (u < 1e-12) u = 1e-12;
      const v = random();
      const r = Math.sqrt(-2 * Math.log(u));
      this.re[i] = r * Math.cos(2 * Math.PI * v);
      this.im[i] = r * Math.sin(2 * Math.PI * v);
    }
    this.coarse = new Float32Array(n);
    for (let i = 0; i < n; i++) this.coarse[i] = random();
  }

  /** Lattice index of the scatterer nearest to a world position, lattice spacing `cellMm`. */
  index(x: number, y: number, z: number, inverseCell: number): number {
    return (
      (Math.floor(x * inverseCell) & MASK) +
      SPECKLE_SIZE * ((Math.floor(y * inverseCell) & MASK) + SPECKLE_SIZE * (Math.floor(z * inverseCell) & MASK))
    );
  }

  /** Smooth (trilinear) coarse texture in [0, 1] at a world position. */
  coarseAt(x: number, y: number, z: number, cellMm: number): number {
    const fx = x / cellMm;
    const fy = y / cellMm;
    const fz = z / cellMm;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const k0 = Math.floor(fz);
    const tx = fx - i0;
    const ty = fy - j0;
    const tz = fz - k0;
    const c = this.coarse;
    const S = SPECKLE_SIZE;
    const ia = i0 & MASK;
    const ib = (i0 + 1) & MASK;
    const ja = (j0 & MASK) * S;
    const jb = ((j0 + 1) & MASK) * S;
    const ka = (k0 & MASK) * S * S;
    const kb = ((k0 + 1) & MASK) * S * S;
    const c00 = c[ia + ja + ka] * (1 - tx) + c[ib + ja + ka] * tx;
    const c10 = c[ia + jb + ka] * (1 - tx) + c[ib + jb + ka] * tx;
    const c01 = c[ia + ja + kb] * (1 - tx) + c[ib + ja + kb] * tx;
    const c11 = c[ia + jb + kb] * (1 - tx) + c[ib + jb + kb] * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  }
}

/** Stable pseudo-random 32-bit hash of integer lattice coordinates. */
export function hash3(i: number, j: number, k: number): number {
  let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Stable pseudo-random value in [−0.5, 0.5) for integer lattice coordinates. */
export function hashJitter(i: number, j: number, k: number, salt: number): number {
  return (hash3(i, j, k + Math.imul(salt, 7919)) & 1023) / 1024 - 0.5;
}
