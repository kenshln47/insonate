import { applyFindings, type Finding, type FindingSpec, type TissueOverride } from "./findings";
import type { Vec3 } from "./math";
import { type Mesh, smoothMesh, surfaceNets } from "./mesh";
import type { ClassVolume } from "./volume";

/**
 * Teaching cases: the same patient with one finding added to the tissue volume (see findings.ts),
 * so the ultrasound signs come from the same physics as the normal anatomy. Each case is a fixed
 * recipe, so the worker and the 3D view make exactly the same patient.
 */
export const VARIANTS = ["normal", "gallstones", "freeFluid", "hydronephrosis", "aaa", "liverCyst", "fattyLiver"] as const;
export type Variant = (typeof VARIANTS)[number];

/** Each teaching case's finding, as made: sizes chosen to show the textbook signs clearly. */
export const VARIANT_FINDINGS: Readonly<Record<Variant, readonly FindingSpec[]>> = {
  normal: [],
  // Three stones on the back wall, the largest 13 mm.
  gallstones: [{ kind: "gallstones", count: 3, largestMm: 13, seed: 1 }],
  // A positive FAST: Morison's pouch, the liver tip, around the spleen and behind the bladder.
  freeFluid: [{ kind: "freeFluid", amount: 2 }],
  // Moderate hydronephrosis of the right kidney.
  hydronephrosis: [{ kind: "hydronephrosis", side: "right", grade: 2 }],
  // A 5.2 cm infrarenal aneurysm lined with thrombus.
  aaa: [{ kind: "aaa", diameterMm: 52, lumenFraction: 0.48 }],
  // A simple cyst, 3.4 cm, deep in the right lobe.
  liverCyst: [{ kind: "liverCyst", sizeMm: 34, seed: 0, site: "deepRightLobe" }],
  // Moderate fatty liver, without focal sparing.
  fattyLiver: [{ kind: "fattyLiver", grade: 2, sparing: false }],
};

export type { Finding } from "./findings";

export interface VariantResult {
  readonly variant: Variant;
  readonly findings: readonly Finding[];
  /** Sizes of the finding (mm), for the case card. */
  readonly facts: Readonly<Record<string, number>>;
  /** Changed acoustic properties (fatty liver). */
  readonly overrides: readonly TissueOverride[];
  /** The middle of the finding (world mm), to aim "Show me the finding". */
  readonly focus: Vec3 | null;
}

/** Change `volume` (as scanned) into the given case, in place. */
export function applyVariant(volume: ClassVolume, variant: Variant): VariantResult {
  const made = applyFindings(volume, VARIANT_FINDINGS[variant]);
  const first = made.results[0];
  return {
    variant,
    findings: made.results.flatMap((r) => r.parts),
    facts: first?.facts ?? {},
    overrides: made.overrides,
    focus: first?.focus ?? null,
  };
}

/** A smoothed surface around a finding's voxels (world mm), for the 3D view. */
export function findingMesh(volume: ClassVolume, finding: Finding): Mesh {
  const [nx, ny] = volume.dims;
  const [i0, j0, k0, i1, j1, k1] = finding.box;
  if (i1 < i0) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const dims = [i1 - i0 + 3, j1 - j0 + 3, k1 - k0 + 3] as const;
  const wanted = new Uint8Array(256);
  for (const t of finding.tissues) wanted[t] = 1;
  const field = new Float32Array(dims[0] * dims[1] * dims[2]);
  for (let k = k0; k <= k1; k++) {
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (wanted[volume.data[i + nx * (j + ny * k)]]) field[i - i0 + 1 + dims[0] * (j - j0 + 1 + dims[1] * (k - k0 + 1))] = 1;
      }
    }
  }
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  const mesh = surfaceNets(field, dims, (i, j, k) => [ox + (i + i0 - 1) * sx, oy + (j + j0 - 1) * sy, oz + (k + k0 - 1) * sz]);
  smoothMesh(mesh, 4);
  return mesh;
}
