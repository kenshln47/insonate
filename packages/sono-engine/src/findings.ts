import {
  allBut,
  along,
  axesOf,
  type Box,
  ball,
  boxOf,
  distanceTo,
  ijk,
  mean,
  random,
  shell,
  tissueSet,
  voxelAt,
  voxelsOf,
  world,
} from "./lesions";
import { normalize, type Vec3 } from "./math";
import { TISSUE, type TissueProps } from "./tissues";
import type { ClassVolume } from "./volume";

/**
 * Findings, made to order: a pathology with its size, side, grade and place, painted into the
 * patient's tissue volume, so its ultrasound signs come from the same physics as the normal
 * anatomy (a stone's shadow, a cyst's enhancement, the dark stripe of free fluid). Several can be
 * combined in one patient. Everything is deterministic: the same specs (and seeds) always make
 * exactly the same patient, in the worker and in tests.
 */

export type Side = "right" | "left";
export type Grade = 1 | 2 | 3;

export type FindingSpec =
  /** Stones resting on the dependent (back) wall of the gallbladder. */
  | { readonly kind: "gallstones"; readonly count: number; readonly largestMm: number; readonly seed: number }
  /** A polyp on the non-dependent wall: echogenic, no shadow, does not move. */
  | { readonly kind: "gbPolyp"; readonly sizeMm: number; readonly seed: number }
  /** Acute calculous cholecystitis: a thick, layered wall, fluid around it, a stone in the neck. */
  | {
      readonly kind: "cholecystitis";
      readonly wallMm: number;
      readonly stones: number;
      readonly largestMm: number;
      readonly seed: number;
    }
  /** Diffuse fatty infiltration of the liver; with focal sparing beside the gallbladder, if asked. */
  | { readonly kind: "fattyLiver"; readonly grade: Grade; readonly sparing: boolean }
  /** A simple cyst; `site: "deepRightLobe"` puts it where the original teaching case had it. */
  | { readonly kind: "liverCyst"; readonly sizeMm: number; readonly seed: number; readonly site?: "deepRightLobe" }
  /** A typical (capillary) haemangioma: bright, well defined, lobulated. */
  | { readonly kind: "hemangioma"; readonly sizeMm: number; readonly seed: number }
  /** Metastases: several target lesions, an echogenic core in a dark halo. */
  | { readonly kind: "metastases"; readonly count: number; readonly largestMm: number; readonly seed: number }
  /** A dilated collecting system: 1 pelvis only, 2 pelvis and calyces, 3 ballooned calyces and a thin cortex. */
  | { readonly kind: "hydronephrosis"; readonly side: Side; readonly grade: Grade }
  /** A kidney stone: in a lower-pole calyx, or in the pelvis at its outlet (where it obstructs). */
  | { readonly kind: "renalStone"; readonly side: Side; readonly sizeMm: number; readonly site: "lowerPole" | "pelvis" }
  /** A simple cortical cyst, partly bulging out of the kidney's outline. */
  | {
      readonly kind: "renalCyst";
      readonly side: Side;
      readonly sizeMm: number;
      readonly pole: "upper" | "mid" | "lower";
      readonly seed: number;
    }
  /** An infrarenal aortic aneurysm with mural thrombus; `lumenFraction` of its width is flowing blood. */
  | { readonly kind: "aaa"; readonly diameterMm: number; readonly lumenFraction: number }
  /**
   * The infrarenal aorta brought to a normal calibre: undoes an aneurysm the scanned patient has
   * (s0319's CT shows a real 3.7 cm one), so a case can have a normal aorta.
   */
  | { readonly kind: "aortaCalibre"; readonly diameterMm: number }
  /**
   * Graded compression over the aorta: firm, steady pressure pushes the bowel aside, clearing its gas
   * from in front of the infrarenal aorta, as a sonographer does to see an aneurysm.
   */
  | { readonly kind: "aortaWindow" }
  /** Free intraperitoneal fluid: 1 small (Morison's pouch), 2 moderate, 3 large (ascites). */
  | { readonly kind: "freeFluid"; readonly amount: Grade }
  /** An enlarged spleen, grown downward and forward from its upper pole to about this length. */
  | { readonly kind: "splenomegaly"; readonly lengthMm: number }
  /** Pleural fluid layering at the back of the chest (supine), this deep at the lung base. */
  | { readonly kind: "pleuralEffusion"; readonly side: Side; readonly depthMm: number };

export type FindingKind = FindingSpec["kind"];

/** A finding, for the 3D view: the tissues that make it up and the box (voxels, inclusive) they lie in. */
export interface Finding {
  readonly name: string;
  readonly tissues: readonly number[];
  readonly box: readonly [number, number, number, number, number, number];
}

export interface TissueOverride {
  readonly tissue: number;
  readonly props: Partial<TissueProps>;
}

export interface FindingResult {
  readonly spec: FindingSpec;
  /** False when this patient has no room for it (no gallbladder, say): nothing was changed. */
  readonly applied: boolean;
  readonly parts: readonly Finding[];
  /** Sizes and grades as made (mm, counts, grades): the truth the student's report is graded on. */
  readonly facts: Readonly<Record<string, number>>;
  /** Changed acoustic properties (a fatty liver). */
  readonly overrides: readonly TissueOverride[];
  /** The middle of the finding (world mm), to aim "Show me". */
  readonly focus: Vec3 | null;
}

/** What a sonographer would measure in this patient, as made: the reference for graded measurements. */
export interface CaseTruth {
  /** Bipolar lengths (mm). */
  readonly kidneyRightMm: number;
  readonly kidneyLeftMm: number;
  readonly spleenMm: number;
  /** The widest outer diameter of the infrarenal aorta (mm): where aneurysms are measured. */
  readonly aortaMm: number;
  /** The widest outer diameter of the aorta above the renal arteries, below the diaphragm (mm). */
  readonly aortaUpperMm: number;
  /** The middle of the infrarenal aorta's widest slice (world mm): where to look for an aneurysm. */
  readonly aortaFocus: Vec3 | null;
}

export interface CaseResult {
  readonly results: readonly FindingResult[];
  readonly overrides: readonly TissueOverride[];
  readonly truth: CaseTruth;
}

type Made = Omit<FindingResult, "spec" | "applied">;
const NOTHING: Made = { parts: [], facts: {}, overrides: [], focus: null };

/** Findings are made in this order: what changes an organ's shape first, fluid around everything last. */
const ORDER: Readonly<Record<FindingKind, number>> = {
  fattyLiver: 0,
  splenomegaly: 1,
  liverCyst: 2,
  hemangioma: 3,
  metastases: 4,
  cholecystitis: 5,
  gallstones: 6,
  gbPolyp: 7,
  hydronephrosis: 8,
  renalStone: 9,
  renalCyst: 10,
  aortaCalibre: 11,
  aaa: 12,
  aortaWindow: 13,
  pleuralEffusion: 14,
  freeFluid: 15,
};

/** Change `volume` (as scanned) into a patient with these findings, in place. */
export function applyFindings(volume: ClassVolume, specs: readonly FindingSpec[]): CaseResult {
  const sorted = [...specs].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const results: FindingResult[] = [];
  for (const spec of sorted) {
    const made = make(volume, spec);
    results.push({ spec, applied: made.parts.length > 0 || made.overrides.length > 0, ...made });
  }
  return { results, overrides: results.flatMap((r) => r.overrides), truth: measureCase(volume) };
}

function make(volume: ClassVolume, spec: FindingSpec): Made {
  switch (spec.kind) {
    case "gallstones":
      return gallstones(volume, spec.count, spec.largestMm, random(spec.seed));
    case "gbPolyp":
      return gbPolyp(volume, spec.sizeMm, random(spec.seed));
    case "cholecystitis":
      return cholecystitis(volume, spec.wallMm, spec.stones, spec.largestMm, random(spec.seed));
    case "fattyLiver":
      return fattyLiver(volume, spec.grade, spec.sparing);
    case "liverCyst":
      return liverCyst(volume, spec.sizeMm, spec.site === "deepRightLobe" ? null : random(spec.seed));
    case "hemangioma":
      return hemangioma(volume, spec.sizeMm, random(spec.seed));
    case "metastases":
      return metastases(volume, spec.count, spec.largestMm, random(spec.seed));
    case "hydronephrosis":
      return hydronephrosis(volume, spec.side, spec.grade);
    case "renalStone":
      return renalStone(volume, spec.side, spec.sizeMm, spec.site);
    case "renalCyst":
      return renalCyst(volume, spec.side, spec.sizeMm, spec.pole, random(spec.seed));
    case "aaa":
      return aneurysm(volume, spec.diameterMm, spec.lumenFraction);
    case "aortaCalibre":
      return aortaCalibre(volume, spec.diameterMm);
    case "aortaWindow":
      return aortaWindow(volume);
    case "freeFluid":
      return freeFluid(volume, spec.amount);
    case "splenomegaly":
      return splenomegaly(volume, spec.lengthMm);
    case "pleuralEffusion":
      return pleuralEffusion(volume, spec.side, spec.depthMm);
  }
}

function part(volume: ClassVolume, name: string, tissues: readonly number[], voxels: readonly number[]): Finding {
  return { name, tissues, box: boxOf(volume, voxels, 1) };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Gallbladder

/** The gallbladder's long axis, and which end is the neck (the end toward the porta hepatis). */
function gallbladderAxes(volume: ClassVolume, lumen: readonly number[]) {
  const { centre, axes, extent } = axesOf(volume, lumen);
  const axis = axes[0];
  const portal = voxelsOf(volume, [TISSUE.portalVein]);
  const porta = portal.length > 0 ? mean(volume, portal) : centre;
  const neck = along(porta, centre, axis) >= 0 ? 1 : -1;
  return { centre, axis, extent, neck };
}

/**
 * Lay stones in the gallbladder. Stones sink: they rest on the floor of the lumen (supine, its
 * back), starting from its lowest point. With `impacted`, the largest sits in the neck instead.
 */
function placeStones(
  volume: ClassVolume,
  count: number,
  largestMm: number,
  rnd: () => number,
  impacted: boolean,
): { painted: number[]; placed: number; largest: number } {
  const lumen = voxelsOf(volume, [TISSUE.gallbladder]);
  if (lumen.length === 0 || count < 1) return { painted: [], placed: 0, largest: 0 };
  const { centre, axis, extent, neck } = gallbladderAxes(volume, lumen);
  let lowest = lumen[0];
  for (const p of lumen) if (world(volume, p)[1] < world(volume, lowest)[1]) lowest = p;
  const tLow = along(world(volume, lowest), centre, axis);
  const toward = tLow > 0 ? -1 : 1;
  const r0 = Math.max(1.75, largestMm / 2);
  const radii = [r0];
  for (let i = 1; i < count; i++) radii.push(Math.max(1.75, r0 * (0.4 + 0.45 * rnd())));
  radii.sort((a, b) => b - a);
  // Where along the axis each stone lies (mm from the centre), and whether it rests on the floor.
  const spots: Array<{ t: number; r: number; floor: boolean }> = [];
  let t = tLow + toward * Math.max(radii[0] + 1, 0.06 * extent);
  for (const [i, r] of radii.entries()) {
    if (impacted && i === 0) {
      spots.push({ t: neck * (0.5 * extent - r - 2.5), r, floor: false });
      continue;
    }
    spots.push({ t: Math.max(-0.46 * extent, Math.min(0.46 * extent, t)), r, floor: true });
    const next = radii[i + 1] ?? r;
    t += toward * (r + next) * (0.78 + 0.3 * rnd());
  }
  const painted: number[] = [];
  let placed = 0;
  let largest = 0;
  for (const spot of spots) {
    const at: Vec3 = [centre[0] + axis[0] * spot.t, centre[1] + axis[1] * spot.t, centre[2] + axis[2] * spot.t];
    // The cross-section of bile around that point.
    let floor = Number.POSITIVE_INFINITY;
    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;
    for (const p of lumen) {
      if (volume.data[p] !== TISSUE.gallbladder) continue;
      const w = world(volume, p);
      if (Math.abs(along(w, at, axis)) > 2.5) continue;
      floor = Math.min(floor, w[1]);
      x += w[0];
      y += w[1];
      z += w[2];
      n++;
    }
    if (n === 0) continue;
    const jitter = () => (rnd() - 0.5) * Math.min(3, spot.r);
    const centreAt: Vec3 = spot.floor ? [x / n + jitter(), floor + spot.r + 0.8, z / n + jitter()] : [x / n, y / n, z / n];
    const done = ball(volume, centreAt, spot.r, TISSUE.stone, [TISSUE.gallbladder]);
    if (done.length === 0) continue;
    placed++;
    largest = Math.max(largest, 2 * spot.r);
    painted.push(...done);
  }
  return { painted, placed, largest };
}

function gallstones(volume: ClassVolume, count: number, largestMm: number, rnd: () => number): Made {
  const { painted, placed, largest } = placeStones(volume, count, largestMm, rnd, false);
  if (painted.length === 0) return NOTHING;
  return {
    parts: [part(volume, "stones", [TISSUE.stone], painted)],
    facts: { stones: placed, largestMm: round1(largest) },
    overrides: [],
    focus: mean(volume, painted),
  };
}

function gbPolyp(volume: ClassVolume, sizeMm: number, rnd: () => number): Made {
  const lumen = voxelsOf(volume, [TISSUE.gallbladder]);
  if (lumen.length === 0) return NOTHING;
  const { centre, axis, extent } = gallbladderAxes(volume, lumen);
  const box = boxOf(volume, lumen, 3);
  const toWall = distanceTo(volume, box, allBut(TISSUE.gallbladder));
  const touching = lumen.filter((p) => toWall.at(p) <= volume.spacing[0] ** 2 + 0.01);
  // On the upper (anterior, non-dependent) wall of the body: a stone would have fallen from there.
  let sites = touching.filter((p) => {
    const w = world(volume, p);
    return w[1] > centre[1] + 2 && Math.abs(along(w, centre, axis)) < 0.3 * extent;
  });
  if (sites.length === 0) sites = touching;
  if (sites.length === 0) return NOTHING;
  const site = world(volume, sites[Math.floor(rnd() * sites.length)]);
  const t = along(site, centre, axis);
  const inward = normalize([centre[0] + axis[0] * t - site[0], centre[1] + axis[1] * t - site[1], centre[2] + axis[2] * t - site[2]]);
  const r = Math.max(1.6, sizeMm / 2);
  const at: Vec3 = [site[0] + inward[0] * (r - 0.6), site[1] + inward[1] * (r - 0.6), site[2] + inward[2] * (r - 0.6)];
  const painted = ball(volume, at, r, TISSUE.polyp, [TISSUE.gallbladder]);
  if (painted.length === 0) return NOTHING;
  return { parts: [part(volume, "polyp", [TISSUE.polyp], painted)], facts: { sizeMm: round1(2 * r) }, overrides: [], focus: at };
}

/**
 * Acute calculous cholecystitis: the wall thickens outward into three layers (bright mucosa, a dark
 * band of oedema, bright serosa) while the gallbladder stays distended, a thin rim of fluid collects
 * around it, and a stone is stuck in the neck. (Murphy's sign, the patient's pain under the probe,
 * is the trainer's job.)
 */
function cholecystitis(volume: ClassVolume, wallMm: number, stones: number, largestMm: number, rnd: () => number): Made {
  const lumen = voxelsOf(volume, [TISSUE.gallbladder]);
  if (lumen.length === 0) return NOTHING;
  const organ = voxelsOf(volume, [TISSUE.gallbladder, TISSUE.gallbladderWall]);
  const box = boxOf(volume, organ, Math.ceil((wallMm + 6) / volume.spacing[0]) + 2);
  const focus = mean(volume, lumen);
  const fromBile = distanceTo(volume, box, [TISSUE.gallbladder]);
  // The wall grows into the liver bed and the fat around it, never into bowel.
  const grows = tissueSet([
    TISSUE.gallbladderWall,
    TISSUE.liver,
    TISSUE.liverVessel,
    TISSUE.liverCapsule,
    TISSUE.liverSpared,
    TISSUE.fat,
    TISSUE.deepFat,
    TISSUE.deepSoft,
    TISSUE.soft,
  ]);
  const layer = volume.spacing[0] + 0.1;
  const wall: number[] = [];
  const [nx, ny] = volume.dims;
  for (let k = box[2]; k <= box[5]; k++) {
    for (let j = box[1]; j <= box[4]; j++) {
      for (let i = box[0]; i <= box[3]; i++) {
        const p = i + nx * (j + ny * k);
        if (!grows[volume.data[p]]) continue;
        const d = Math.sqrt(fromBile.at(p));
        if (d > wallMm) continue;
        volume.data[p] = d <= layer || d > wallMm - 1 ? TISSUE.gallbladderWall : TISSUE.wallOedema;
        wall.push(p);
      }
    }
  }
  // Pericholecystic fluid: a thin rim in the fat around the wall (never in the liver bed itself).
  const space = tissueSet([TISSUE.fat, TISSUE.deepFat, TISSUE.deepSoft]);
  const fluid: number[] = [];
  const rim = (wallMm + 3.6) ** 2;
  for (let k = box[2]; k <= box[5]; k++) {
    for (let j = box[1]; j <= box[4]; j++) {
      for (let i = box[0]; i <= box[3]; i++) {
        const p = i + nx * (j + ny * k);
        if (!space[volume.data[p]] || fromBile.at(p) > rim) continue;
        volume.data[p] = TISSUE.freeFluid;
        fluid.push(p);
      }
    }
  }
  const { painted, placed, largest } = placeStones(volume, stones, largestMm, rnd, true);
  const parts: Finding[] = [part(volume, "wall", [TISSUE.wallOedema, TISSUE.gallbladderWall], [...wall, ...organ])];
  if (painted.length > 0) parts.push(part(volume, "stones", [TISSUE.stone], painted));
  if (fluid.length > 0) parts.push(part(volume, "fluid", [TISSUE.freeFluid], fluid));
  return {
    parts,
    facts: { wallMm: round1(wallMm), stones: placed, largestMm: round1(largest) },
    overrides: [],
    focus,
  };
}

// ---------------------------------------------------------------------------------------------
// Liver

/** Fat in the liver cells scatters and absorbs more: brighter, and fading with depth as the grade rises. */
const FATTY: Readonly<Record<Grade, Partial<TissueProps>>> = {
  // Mild: brighter than the kidney's cortex; vessels and diaphragm still crisp.
  1: { backscatter: 0.95, attenuation: 0.6, heterogeneity: 0.1 },
  // Moderate: the portal vein walls blur into the bright liver; the diaphragm is harder to see.
  2: { backscatter: 1.3, attenuation: 0.78, heterogeneity: 0.08 },
  // Severe: very bright near the probe; the back of the right lobe, the diaphragm and the kidney fade out.
  3: { backscatter: 1.7, attenuation: 1.0, heterogeneity: 0.07 },
};

function fattyLiver(volume: ClassVolume, grade: Grade, sparing: boolean): Made {
  const overrides: TissueOverride[] = [{ tissue: TISSUE.liver, props: FATTY[grade] }];
  if (!sparing) return { parts: [], facts: { grade }, overrides, focus: null };
  // Focal fatty sparing: a tongue of normal liver along the gallbladder bed, darker than the rest.
  const gb = voxelsOf(volume, [TISSUE.gallbladder, TISSUE.gallbladderWall]);
  if (gb.length === 0) return { parts: [], facts: { grade }, overrides, focus: null };
  const box = boxOf(volume, gb, 12);
  const near = distanceTo(volume, box, [TISSUE.gallbladder, TISSUE.gallbladderWall]);
  const { centre, axis, extent } = gallbladderAxes(volume, gb);
  const spared: number[] = [];
  for (const p of voxelsOf(volume, [TISSUE.liver], box)) {
    if (near.at(p) > 12 * 12 || Math.abs(along(world(volume, p), centre, axis)) > 0.3 * extent) continue;
    volume.data[p] = TISSUE.liverSpared;
    spared.push(p);
  }
  return {
    parts: [],
    facts: { grade, sparing: spared.length > 0 ? 1 : 0 },
    overrides,
    focus: spared.length > 0 ? mean(volume, spared) : null,
  };
}

const LIVER_PARENCHYMA = [TISSUE.liver, TISSUE.liverVessel, TISSUE.liverSpared];

/**
 * Random places for lesions of these radii inside the liver: wholly within it, clear of the big
 * vessels and the gallbladder, not hidden under the dome, and apart from each other.
 */
function liverSites(volume: ClassVolume, radii: readonly number[], rnd: () => number, rightLobe: boolean): Vec3[] {
  const liver = voxelsOf(volume, LIVER_PARENCHYMA);
  if (liver.length === 0) return [];
  const box = boxOf(volume, liver, 2);
  const edge = distanceTo(volume, box, allBut(...LIVER_PARENCHYMA));
  const big = distanceTo(volume, box, [TISSUE.portalVein, TISSUE.portalWall, TISSUE.ivc, TISSUE.ivcWall]);
  let zTop = Number.NEGATIVE_INFINITY;
  let zBottom = Number.POSITIVE_INFINITY;
  for (const p of liver) {
    const z = world(volume, p)[2];
    zTop = Math.max(zTop, z);
    zBottom = Math.min(zBottom, z);
  }
  const middleX = mean(volume, liver)[0];
  const sites: Array<{ at: Vec3; r: number }> = [];
  for (const r of radii) {
    let chosen: Vec3 | null = null;
    for (const margin of [3, 1.5, 0]) {
      const candidates: Vec3[] = [];
      for (let n = 0; n < liver.length; n += 2) {
        const p = liver[n];
        if (edge.at(p) < (r + margin) ** 2 || big.at(p) < (r + margin + 1) ** 2) continue;
        const w = world(volume, p);
        if (w[2] > zTop - 0.18 * (zTop - zBottom)) continue;
        if (rightLobe && w[0] < middleX - 5) continue;
        if (sites.some((s) => Math.hypot(w[0] - s.at[0], w[1] - s.at[1], w[2] - s.at[2]) < r + s.r + 5)) continue;
        candidates.push(w);
      }
      if (candidates.length > 0) {
        chosen = candidates[Math.floor(rnd() * candidates.length)];
        break;
      }
    }
    if (chosen) sites.push({ at: chosen, r });
  }
  return sites.map((s) => s.at);
}

/** A simple cyst: anechoic, round, with bright enhancement behind it. */
function liverCyst(volume: ClassVolume, sizeMm: number, rnd: (() => number) | null): Made {
  const radius = sizeMm / 2;
  let at: Vec3 | null;
  let size = radius;
  if (rnd) {
    at = liverSites(volume, [radius], rnd, true)[0] ?? null;
  } else {
    // The original teaching case: the deepest point of the right lobe below the liver's middle.
    const deep = deepRightLobe(volume);
    at = deep?.at ?? null;
    if (deep) size = Math.min(radius, deep.depth - 4);
  }
  if (!at || size < 2) return NOTHING;
  const painted = ball(volume, at, size, TISSUE.cyst, LIVER_PARENCHYMA);
  if (painted.length === 0) return NOTHING;
  return {
    parts: [part(volume, "cyst", [TISSUE.cyst], painted)],
    facts: { diameterMm: Math.round(2 * size) },
    overrides: [],
    focus: at,
  };
}

function deepRightLobe(volume: ClassVolume): { at: Vec3; depth: number } | null {
  const liver = voxelsOf(volume, [TISSUE.liver, TISSUE.liverVessel]);
  if (liver.length === 0) return null;
  const centre = mean(volume, liver);
  const box = boxOf(volume, liver);
  const d = distanceTo(volume, box, [TISSUE.outside, TISSUE.fat, TISSUE.deepFat, TISSUE.soft, TISSUE.muscle, TISSUE.lung, TISSUE.bone]);
  let best = -1;
  let bestDepth = 0;
  for (const p of liver) {
    const w = world(volume, p);
    if (w[0] < centre[0] + 5 || w[2] > centre[2] - 25) continue;
    const depth = d.at(p);
    if (depth > bestDepth) {
      bestDepth = depth;
      best = p;
    }
  }
  return best < 0 ? null : { at: world(volume, best), depth: Math.sqrt(bestDepth) };
}

/** A typical haemangioma: homogeneously bright and sharply marginated, its outline slightly lobulated. */
function hemangioma(volume: ClassVolume, sizeMm: number, rnd: () => number): Made {
  const r = sizeMm / 2;
  const at = liverSites(volume, [r * 1.15], rnd, true)[0];
  if (!at) return NOTHING;
  const painted = ball(volume, at, r * 0.92, TISSUE.hemangioma, LIVER_PARENCHYMA);
  for (let lobule = 0; lobule < 2; lobule++) {
    const u = 2 * rnd() - 1;
    const angle = 2 * Math.PI * rnd();
    const s = Math.sqrt(1 - u * u);
    const dir: Vec3 = [s * Math.cos(angle), s * Math.sin(angle), u];
    const c: Vec3 = [at[0] + dir[0] * r * 0.42, at[1] + dir[1] * r * 0.42, at[2] + dir[2] * r * 0.42];
    painted.push(...ball(volume, c, r * 0.58, TISSUE.hemangioma, LIVER_PARENCHYMA));
  }
  if (painted.length === 0) return NOTHING;
  return {
    parts: [part(volume, "hemangioma", [TISSUE.hemangioma], painted)],
    facts: { diameterMm: Math.round(axesOf(volume, painted).extent) },
    overrides: [],
    focus: at,
  };
}

/** Metastases: target ("bull's-eye") lesions of different sizes scattered through the liver. */
function metastases(volume: ClassVolume, count: number, largestMm: number, rnd: () => number): Made {
  const r0 = largestMm / 2;
  const radii = [r0];
  for (let i = 1; i < count; i++) radii.push(Math.max(4, r0 * (0.42 + 0.5 * rnd())));
  const sites = liverSites(volume, radii, rnd, false);
  const painted: number[] = [];
  let placed = 0;
  let largest = 0;
  for (const [i, at] of sites.entries()) {
    const r = radii[i];
    const halo = Math.min(3.5, Math.max(1.6, 0.2 * r));
    const rim = ball(volume, at, r, TISSUE.metastasisHalo, LIVER_PARENCHYMA);
    const core = ball(volume, at, r - halo, TISSUE.metastasis, [TISSUE.metastasisHalo]);
    if (rim.length + core.length === 0) continue;
    painted.push(...rim);
    placed++;
    largest = Math.max(largest, 2 * r);
  }
  if (painted.length === 0) return NOTHING;
  return {
    parts: [part(volume, "metastases", [TISSUE.metastasis, TISSUE.metastasisHalo], painted)],
    facts: { count: placed, largestMm: Math.round(largest) },
    overrides: [],
    focus: sites[0] ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Kidneys

const KIDNEY: Readonly<Record<Side, { cortex: number; medulla: number; sinus: number }>> = {
  right: { cortex: TISSUE.kidneyRight, medulla: TISSUE.medullaRight, sinus: TISSUE.sinusRight },
  left: { cortex: TISSUE.kidneyLeft, medulla: TISSUE.medullaLeft, sinus: TISSUE.sinusLeft },
};

/** Toward the midline from this kidney: −x for the right kidney, +x for the left. */
const MEDIAL: Readonly<Record<Side, number>> = { right: -1, left: 1 };

/** A kidney's voxels (with the urine and stones in it) and a box around it with room to spare. */
function kidneyVoxels(volume: ClassVolume, side: Side): { own: number[]; box: Box } | null {
  const k = KIDNEY[side];
  const own = voxelsOf(volume, [k.cortex, k.medulla, k.sinus]);
  if (own.length === 0) return null;
  const inside = voxelsOf(volume, [TISSUE.renalPelvis, TISSUE.stone], boxOf(volume, own, 3));
  return { own: [...own, ...inside], box: boxOf(volume, own, 10) };
}

/**
 * Hydronephrosis: urine fills the collecting system. The core of the bright sinus becomes the
 * dilated pelvis; from grade 2 the calyces next to it fill (rounded, dark), with an extrarenal
 * bulge of the pelvis at the hilum; at grade 3 the calyces balloon and the cortex thins to a rim.
 */
function hydronephrosis(volume: ClassVolume, side: Side, grade: Grade): Made {
  const k = KIDNEY[side];
  const kidney = kidneyVoxels(volume, side);
  const sinus = voxelsOf(volume, [k.sinus]);
  if (!kidney || sinus.length === 0) return NOTHING;
  const { box } = kidney;
  const edge = distanceTo(volume, box, allBut(k.sinus, TISSUE.renalPelvis));
  const core = grade === 1 ? 5.2 : grade === 2 ? 4.0 : 3.0;
  const urine: number[] = [];
  for (const p of sinus) {
    if (edge.at(p) < core * core) continue;
    volume.data[p] = TISSUE.renalPelvis;
    urine.push(p);
  }
  if (urine.length === 0) return NOTHING;
  const pelvis = urine.slice();
  if (grade >= 2) {
    const near = distanceTo(volume, box, [TISSUE.renalPelvis]);
    const reach = grade === 2 ? 3.1 : 5.6;
    for (const p of voxelsOf(volume, [k.medulla], box)) {
      if (near.at(p) > reach * reach) continue;
      volume.data[p] = TISSUE.renalPelvis;
      urine.push(p);
    }
  }
  if (grade === 3) {
    const outline = distanceTo(volume, box, allBut(k.cortex, k.medulla, k.sinus, TISSUE.renalPelvis));
    const wet = distanceTo(volume, box, [TISSUE.renalPelvis]);
    for (const p of voxelsOf(volume, [k.cortex, k.medulla, k.sinus], box)) {
      if (wet.at(p) > 4.6 * 4.6 || outline.at(p) < 4.6 * 4.6) continue;
      volume.data[p] = TISSUE.renalPelvis;
      urine.push(p);
    }
  }
  // A thin sinus (a small kidney) cannot hold a pelvis that wide: the distended pelvis pushes the sinus
  // fat and the pyramids aside, one voxel at a time, until it is as wide as the grade's.
  const grows = tissueSet(grade === 3 ? [k.sinus, k.medulla, k.cortex] : [k.sinus, k.medulla]);
  let apd = pelvisWidth(volume, box, pelvis);
  for (let step = 0; step < 5 && apd < PELVIS_AP_MM[grade]; step++) {
    const near = distanceTo(volume, box, [TISSUE.renalPelvis]);
    const outline = distanceTo(volume, box, allBut(k.cortex, k.medulla, k.sinus, TISSUE.renalPelvis));
    const reach = (volume.spacing[0] + 0.1) ** 2;
    const added: number[] = [];
    for (const p of voxelsOf(volume, grade === 3 ? [k.sinus, k.medulla, k.cortex] : [k.sinus, k.medulla], box)) {
      // A rim of cortex always stays.
      if (!grows[volume.data[p]] || near.at(p) > reach || outline.at(p) < 4.6 * 4.6) continue;
      added.push(p);
    }
    if (added.length === 0) break;
    for (const p of added) {
      volume.data[p] = TISSUE.renalPelvis;
      urine.push(p);
      pelvis.push(p);
    }
    apd = pelvisWidth(volume, box, pelvis);
  }
  if (grade >= 2) {
    // The pelvis bulges out of the hilum, toward the ureter.
    const m = MEDIAL[side];
    const sorted = pelvis.slice().sort((a, b) => world(volume, b)[0] * m - world(volume, a)[0] * m);
    const hilum = mean(volume, sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.08))));
    const r = grade === 2 ? 5.5 : 8;
    const at: Vec3 = [hilum[0] + m * r * 0.8, hilum[1] + r * 0.2, hilum[2] - r * 0.3];
    for (const p of ball(volume, at, r, TISSUE.renalPelvis, [TISSUE.deepFat, TISSUE.deepSoft, TISSUE.fat, k.sinus])) urine.push(p);
  }
  return {
    parts: [part(volume, "pelvis", [TISSUE.renalPelvis], urine)],
    facts: { grade, pelvisApMm: Math.round(apd) },
    overrides: [],
    focus: mean(volume, pelvis),
  };
}

/** Typical AP width of the renal pelvis (mm) by grade of hydronephrosis: what each grade is grown to at least. */
const PELVIS_AP_MM: Readonly<Record<Grade, number>> = { 1: 10, 2: 15, 3: 22 };

/** The pelvis's AP width (mm): twice its deepest point's distance from its edge. */
function pelvisWidth(volume: ClassVolume, box: Box, pelvis: readonly number[]): number {
  const field = distanceTo(volume, box, allBut(TISSUE.renalPelvis));
  let deepest = 0;
  for (const p of pelvis) deepest = Math.max(deepest, field.at(p));
  return 2 * Math.sqrt(deepest);
}

function renalStone(volume: ClassVolume, side: Side, sizeMm: number, site: "lowerPole" | "pelvis"): Made {
  const k = KIDNEY[side];
  const kidney = kidneyVoxels(volume, side);
  if (!kidney) return NOTHING;
  const { box, own } = kidney;
  const r = Math.max(1.75, sizeMm / 2);
  const { centre, axes } = axesOf(volume, own);
  const up: Vec3 = axes[0][2] >= 0 ? axes[0] : [-axes[0][0], -axes[0][1], -axes[0][2]];
  let at: Vec3 | null = null;
  if (site === "pelvis") {
    // At the pelvis's outlet (the pelviureteric junction): its most medial, lowest part.
    const pool = voxelsOf(volume, [TISSUE.renalPelvis], box);
    const from = pool.length > 0 ? pool : voxelsOf(volume, [k.sinus], box);
    const m = MEDIAL[side];
    const score = (p: number) => {
      const w = world(volume, p);
      return w[0] * m - 0.4 * w[2];
    };
    const sorted = from.slice().sort((a, b) => score(b) - score(a));
    if (sorted.length > 0) at = mean(volume, sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.05))));
  } else {
    // In a lower-pole calyx: the most central point of the lowest third of the sinus.
    const sinus = voxelsOf(volume, [k.sinus, TISSUE.renalPelvis], box);
    if (sinus.length > 0) {
      const ts = sinus.map((p) => along(world(volume, p), centre, up));
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (const t of ts) {
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
      const edge = distanceTo(volume, box, allBut(k.sinus, TISSUE.renalPelvis));
      let best = -1;
      let bestD = -1;
      for (const [n, p] of sinus.entries()) {
        if (ts[n] > lo + 0.3 * (hi - lo)) continue;
        const d = edge.at(p);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best >= 0) at = world(volume, best);
    }
  }
  if (!at) return NOTHING;
  let painted = ball(volume, at, r, TISSUE.stone, [k.sinus, k.medulla, TISSUE.renalPelvis]);
  if (painted.length === 0) painted = ball(volume, at, r, TISSUE.stone, [k.sinus, k.medulla, k.cortex, TISSUE.renalPelvis]);
  if (painted.length === 0) return NOTHING;
  return {
    parts: [part(volume, "renalStone", [TISSUE.stone], painted)],
    facts: { sizeMm: round1(2 * r) },
    overrides: [],
    focus: at,
  };
}

/** A simple cortical cyst (Bosniak I), about half of it bulging out of the kidney. */
function renalCyst(volume: ClassVolume, side: Side, sizeMm: number, pole: "upper" | "mid" | "lower", rnd: () => number): Made {
  const k = KIDNEY[side];
  const kidney = kidneyVoxels(volume, side);
  if (!kidney) return NOTHING;
  const { own } = kidney;
  const { centre, axes, extent } = axesOf(volume, own);
  const up: Vec3 = axes[0][2] >= 0 ? axes[0] : [-axes[0][0], -axes[0][1], -axes[0][2]];
  const inside = tissueSet([k.cortex, k.medulla, k.sinus, TISSUE.renalPelvis, TISSUE.stone]);
  const surface = shell(volume, voxelsOf(volume, [k.cortex], kidney.box), inside);
  const target = pole === "upper" ? 0.28 * extent : pole === "lower" ? -0.28 * extent : 0;
  // Not on the medial side (the hilum is there).
  const m = MEDIAL[side];
  let sites = surface.filter((p) => {
    const w = world(volume, p);
    return Math.abs(along(w, centre, up) - target) < 0.08 * extent && (w[0] - centre[0]) * m < 4;
  });
  if (sites.length === 0) sites = surface;
  if (sites.length === 0) return NOTHING;
  const s = world(volume, sites[Math.floor(rnd() * sites.length)]);
  const t = along(s, centre, up);
  const out = normalize([s[0] - (centre[0] + up[0] * t), s[1] - (centre[1] + up[1] * t), s[2] - (centre[2] + up[2] * t)]);
  const r = sizeMm / 2;
  const offset = r * (-0.2 + 0.35 * rnd());
  const at: Vec3 = [s[0] + out[0] * offset, s[1] + out[1] * offset, s[2] + out[2] * offset];
  const painted = ball(volume, at, r, TISSUE.cyst, [k.cortex, k.medulla, k.sinus, TISSUE.deepFat, TISSUE.deepSoft, TISSUE.fat]);
  if (painted.length === 0) return NOTHING;
  return {
    parts: [part(volume, "renalCyst", [TISSUE.cyst], painted)],
    facts: { diameterMm: Math.round(sizeMm) },
    overrides: [],
    focus: at,
  };
}

// ---------------------------------------------------------------------------------------------
// Aorta

/**
 * An infrarenal abdominal aortic aneurysm: a spindle `diameterMm` across at its widest, growing
 * forward and to the left of the spine, lined with crescent-shaped mural thrombus around an
 * eccentric lumen. Blood flows only in the lumen.
 */
/** The aorta's centre and cross-section in each axial slice (world mm), bottom to top. */
function aorticSlices(volume: ClassVolume, tissues: readonly number[]): Array<{ k: number; x: number; y: number; area: number }> {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy] = volume.spacing;
  const [ox, oy] = volume.origin;
  const aortic = tissueSet(tissues);
  const slices: Array<{ k: number; x: number; y: number; area: number }> = [];
  for (let k = 0; k < nz; k++) {
    let n = 0;
    let x = 0;
    let y = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!aortic[volume.data[i + nx * (j + ny * k)]]) continue;
        n++;
        x += ox + i * sx;
        y += oy + j * sy;
      }
    }
    if (n > 0) slices.push({ k, x: x / n, y: y / n, area: n * sx * sy });
  }
  return slices;
}

/**
 * The slice of the renal arteries: 15 mm below the middle of the higher kidney. (The arteries leave
 * the aorta at L1–L2 even when a kidney hangs low, as the right one does in s0139.)
 */
function renalSlice(volume: ClassVolume): number {
  const middles = [TISSUE.kidneyRight, TISSUE.kidneyLeft]
    .map((t) => voxelsOf(volume, [t]))
    .filter((v) => v.length > 0)
    .map((v) => mean(volume, v)[2]);
  const nz = volume.dims[2];
  const renalZ = (middles.length > 0 ? Math.max(...middles) : volume.origin[2] + nz * volume.spacing[2] * 0.6) - 15;
  return Math.round((renalZ - volume.origin[2]) / volume.spacing[2]);
}

function aneurysm(volume: ClassVolume, diameterMm: number, lumenFraction: number): Made {
  const [nx, ny] = volume.dims;
  const [sx, sy, sz] = volume.spacing;
  const [ox, oy, oz] = volume.origin;
  const slices = aorticSlices(volume, [TISSUE.aorta, TISSUE.aortaWall]);
  if (slices.length < 20) return NOTHING;
  // Below the renal arteries and above the bifurcation.
  const kBottom = slices[0].k + Math.round(12 / sz);
  const kTop = Math.min(slices[slices.length - 1].k, renalSlice(volume));
  if (kTop - kBottom < Math.round(40 / sz)) return NOTHING;
  const native = Math.sqrt(slices.find((s) => s.k === kBottom)?.area ?? 300 / Math.PI) / Math.sqrt(Math.PI);
  const widest = Math.max(native + 2, diameterMm / 2);
  const replace = tissueSet([
    TISSUE.aorta,
    TISSUE.aortaWall,
    TISSUE.fat,
    TISSUE.deepFat,
    TISSUE.soft,
    TISSUE.deepSoft,
    TISSUE.bowelWall,
    TISSUE.fluid,
    TISSUE.blood,
    TISSUE.muscle,
    TISSUE.air,
  ]);
  const painted: number[] = [];
  let focus: Vec3 | null = null;
  let widestLumen = 0;
  for (const slice of slices) {
    if (slice.k < kBottom || slice.k > kTop) continue;
    const s = (slice.k - kBottom) / (kTop - kBottom);
    const radius = native + (widest - native) * Math.sin(Math.PI * s) ** 0.8;
    const grow = radius - native;
    // The spine stops it behind: the sac grows forward and a little to the left.
    const cx = slice.x - grow * 0.25;
    const cy = slice.y + grow * 0.7;
    const lumen = Math.max(native, radius * lumenFraction);
    widestLumen = Math.max(widestLumen, 2 * lumen);
    const lx = slice.x;
    const ly = slice.y + grow * 0.3;
    if (s > 0.45 && s < 0.55) focus = [cx, cy, oz + slice.k * sz];
    const reach = Math.ceil(radius / sx) + 1;
    const ci = Math.round((cx - ox) / sx);
    const cj = Math.round((cy - oy) / sy);
    for (let j = Math.max(0, cj - reach); j <= Math.min(ny - 1, cj + reach); j++) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(nx - 1, ci + reach); i++) {
        const x = ox + i * sx;
        const y = oy + j * sy;
        if (Math.hypot(x - cx, y - cy) > radius) continue;
        const p = i + nx * (j + ny * slice.k);
        if (!replace[volume.data[p]]) continue;
        volume.data[p] = Math.hypot(x - lx, y - ly) <= lumen ? TISSUE.aorta : TISSUE.thrombus;
        painted.push(p);
      }
    }
  }
  if (painted.length === 0) return NOTHING;
  clearGasInFront(volume, slices, kBottom, kTop, widest);
  // The wall: the outer layer of the sac.
  const sac = tissueSet([TISSUE.aorta, TISSUE.thrombus, TISSUE.aortaWall]);
  const wall: number[] = [];
  for (const p of painted) {
    const [i, j] = ijk(volume, p);
    if (i < 1 || j < 1 || i >= nx - 1 || j >= ny - 1) continue;
    for (const step of [1, -1, nx, -nx]) {
      if (!sac[volume.data[p + step]]) {
        wall.push(p);
        break;
      }
    }
  }
  for (const p of wall) volume.data[p] = TISSUE.aortaWall;
  return {
    parts: [part(volume, "aneurysm", [TISSUE.aorta, TISSUE.thrombus, TISSUE.aortaWall], painted)],
    facts: { diameterMm: Math.round(2 * widest), lengthMm: Math.round((kTop - kBottom) * sz), lumenMm: Math.round(widestLumen) },
    overrides: [],
    focus,
  };
}

/**
 * A gas-free window in front of the aorta between two slices: a large aneurysm pushes the bowel
 * aside, and firm pressure with the probe clears what is left (the bowel stays, its gas goes).
 */
function clearGasInFront(
  volume: ClassVolume,
  slices: ReadonlyArray<{ k: number; x: number; y: number }>,
  kBottom: number,
  kTop: number,
  halfWidthMm: number,
): number {
  const [nx, ny] = volume.dims;
  const [sx, sy] = volume.spacing;
  const [ox, oy] = volume.origin;
  let cleared = 0;
  for (const slice of slices) {
    if (slice.k < kBottom - 4 || slice.k > kTop + 4) continue;
    const ci = Math.round((slice.x - ox) / sx);
    const cj = Math.round((slice.y - oy) / sy);
    const half = Math.ceil((halfWidthMm + 8) / sx);
    for (let j = cj; j < ny; j++) {
      for (let i = Math.max(0, ci - half); i <= Math.min(nx - 1, ci + half); i++) {
        const p = i + nx * (j + ny * slice.k);
        if (volume.data[p] !== TISSUE.air) continue;
        volume.data[p] = TISSUE.bowelWall;
        cleared++;
      }
    }
  }
  return cleared;
}

/** Graded compression over the infrarenal aorta: its gas-free window, whatever its size. */
function aortaWindow(volume: ClassVolume): Made {
  const slices = aorticSlices(volume, [TISSUE.aorta, TISSUE.aortaWall, TISSUE.thrombus]);
  if (slices.length < 10) return NOTHING;
  const kBottom = slices[0].k;
  const kTop = Math.min(slices[slices.length - 1].k, renalSlice(volume));
  const widest = Math.max(...slices.filter((s) => s.k <= kTop).map((s) => Math.sqrt(s.area / Math.PI)), 10);
  const cleared = clearGasInFront(volume, slices, kBottom, kTop, widest);
  return {
    parts: [],
    facts: { clearedMl: Math.round((cleared * volume.spacing[0] * volume.spacing[1] * volume.spacing[2]) / 1000) },
    overrides: [],
    focus: null,
  };
}

/**
 * Bring the infrarenal aorta to a normal calibre: in each slice below the renal arteries, the part
 * of the aorta wider than the target becomes retroperitoneal fat, and a new wall lines what is left.
 */
function aortaCalibre(volume: ClassVolume, diameterMm: number): Made {
  const [nx, ny] = volume.dims;
  const [sx, sy] = volume.spacing;
  const [ox, oy] = volume.origin;
  const aortic = tissueSet([TISSUE.aorta, TISSUE.aortaWall, TISSUE.thrombus]);
  const slices = aorticSlices(volume, [TISSUE.aorta, TISSUE.aortaWall, TISSUE.thrombus]);
  const kTop = renalSlice(volume);
  const r = diameterMm / 2;
  let narrowed = 0;
  for (const slice of slices) {
    if (slice.k > kTop || Math.sqrt(slice.area / Math.PI) <= r + 0.75) continue;
    narrowed++;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const p = i + nx * (j + ny * slice.k);
        if (!aortic[volume.data[p]]) continue;
        const d = Math.hypot(ox + i * sx - slice.x, oy + j * sy - slice.y);
        volume.data[p] = d > r ? TISSUE.deepFat : d > r - sx - 0.1 ? TISSUE.aortaWall : TISSUE.aorta;
      }
    }
  }
  return { parts: [], facts: narrowed > 0 ? { diameterMm } : {}, overrides: [], focus: null };
}

// ---------------------------------------------------------------------------------------------
// Fluid

/** How far free fluid spreads, by amount: Morison's pouch, the liver tip, around the spleen, the pelvis (mm). */
const FLUID: Readonly<Record<Grade, { morison: number; tip: number; spleen: number; pelvis: number; ascites: boolean }>> = {
  1: { morison: 7, tip: 0, spleen: 0, pelvis: 0, ascites: false },
  2: { morison: 11, tip: 4, spleen: 5, pelvis: 12, ascites: false },
  3: { morison: 16, tip: 9, spleen: 9, pelvis: 22, ascites: true },
};

/**
 * Free fluid: it gathers where the peritoneal cavity is lowest in a supine patient. A little shows
 * only in Morison's pouch; more rims the liver tip and the spleen and fills the pelvis behind the
 * bladder; a large amount (ascites) also surrounds the bowel loops, which float in it.
 */
function freeFluid(volume: ClassVolume, amount: Grade): Made {
  const spread = FLUID[amount];
  const [nx, ny] = volume.dims;
  // Where fluid can collect. A large amount spreads far from the organs: keep it out of the body wall.
  const space = tissueSet(
    spread.ascites
      ? [TISSUE.deepFat, TISSUE.deepSoft, TISSUE.liverCapsule]
      : [TISSUE.fat, TISSUE.deepFat, TISSUE.soft, TISSUE.deepSoft, TISSUE.liverCapsule],
  );
  const painted: number[] = [];
  const morison: number[] = [];
  const liver = voxelsOf(volume, [TISSUE.liver, TISSUE.liverVessel, TISSUE.liverCapsule, TISSUE.liverSpared]);
  const kidney = voxelsOf(volume, [TISSUE.kidneyRight, TISSUE.medullaRight, TISSUE.sinusRight]);
  const liverTissues = [TISSUE.liver, TISSUE.liverVessel, TISSUE.liverCapsule, TISSUE.liverSpared];
  if (liver.length > 0 && kidney.length > 0) {
    const box = boxOf(volume, kidney, 14);
    const toLiver = distanceTo(volume, box, liverTissues);
    const toKidney = distanceTo(volume, box, [TISSUE.kidneyRight, TISSUE.medullaRight, TISSUE.sinusRight]);
    const r2 = spread.morison * spread.morison;
    for (let k = box[2]; k <= box[5]; k++) {
      for (let j = box[1]; j <= box[4]; j++) {
        for (let i = box[0]; i <= box[3]; i++) {
          const p = i + nx * (j + ny * k);
          if (!space[volume.data[p]]) continue;
          // Morison's pouch: the potential space between liver and right kidney opens up.
          if (toLiver.at(p) <= r2 && toKidney.at(p) <= r2) {
            volume.data[p] = TISSUE.freeFluid;
            painted.push(p);
            morison.push(p);
          }
        }
      }
    }
    if (spread.tip > 0) {
      // A rim around the tip of the right lobe (with ascites, the whole lower half of the liver).
      const tipBox = boxOf(volume, liver, Math.ceil(spread.tip / volume.spacing[0]) + 2);
      const zMax = Math.floor(tipBox[2] + (tipBox[5] - tipBox[2]) * (spread.ascites ? 0.5 : 0.18));
      const rim = distanceTo(volume, tipBox, liverTissues);
      const centreX = mean(volume, liver)[0];
      for (let k = tipBox[2]; k <= zMax; k++) {
        for (let j = tipBox[1]; j <= tipBox[4]; j++) {
          for (let i = tipBox[0]; i <= tipBox[3]; i++) {
            const p = i + nx * (j + ny * k);
            if (!space[volume.data[p]]) continue;
            if (!spread.ascites && world(volume, p)[0] < centreX) continue;
            if (rim.at(p) <= spread.tip * spread.tip) {
              volume.data[p] = TISSUE.freeFluid;
              painted.push(p);
            }
          }
        }
      }
    }
  }
  // Around the spleen, on its outer side.
  const spleen = voxelsOf(volume, [TISSUE.spleen, TISSUE.spleenCapsule]);
  if (spleen.length > 0 && spread.spleen > 0) {
    const box = boxOf(volume, spleen, Math.ceil(spread.spleen / volume.spacing[0]) + 2);
    const near = distanceTo(volume, box, [TISSUE.spleen, TISSUE.spleenCapsule]);
    const centre = mean(volume, spleen);
    for (let k = box[2]; k <= box[5]; k++) {
      for (let j = box[1]; j <= box[4]; j++) {
        for (let i = box[0]; i <= box[3]; i++) {
          const p = i + nx * (j + ny * k);
          if (!space[volume.data[p]]) continue;
          const w = world(volume, p);
          if (w[0] > centre[0] - 10 || w[2] < centre[2] - 25) continue;
          if (near.at(p) <= spread.spleen * spread.spleen) {
            volume.data[p] = TISSUE.freeFluid;
            painted.push(p);
          }
        }
      }
    }
  }
  // Pelvis: the lowest point of the peritoneum, behind the bladder.
  const bladder = voxelsOf(volume, [TISSUE.bladder, TISSUE.bladderWall]);
  if (bladder.length > 0 && spread.pelvis > 0) {
    const box = boxOf(volume, bladder, Math.ceil(spread.pelvis / volume.spacing[0]) + 2);
    const near = distanceTo(volume, box, [TISSUE.bladder, TISSUE.bladderWall]);
    const centre = mean(volume, bladder);
    const pelvic = tissueSet([TISSUE.fat, TISSUE.deepFat, TISSUE.soft, TISSUE.deepSoft, TISSUE.bowelWall]);
    for (let k = box[2]; k <= box[5]; k++) {
      for (let j = box[1]; j <= box[4]; j++) {
        for (let i = box[0]; i <= box[3]; i++) {
          const p = i + nx * (j + ny * k);
          if (!pelvic[volume.data[p]]) continue;
          const w = world(volume, p);
          if (w[1] > centre[1] - 5 || w[2] < centre[2] - 8) continue;
          if (near.at(p) <= spread.pelvis * spread.pelvis) {
            volume.data[p] = TISSUE.pelvicFluid;
            painted.push(p);
          }
        }
      }
    }
  }
  if (spread.ascites) for (const p of ascites(volume, liver, bladder, kidney)) painted.push(p);
  if (painted.length === 0) return NOTHING;
  const upper = painted.filter((p) => volume.data[p] === TISSUE.freeFluid);
  const lower = painted.filter((p) => volume.data[p] === TISSUE.pelvicFluid);
  const parts: Finding[] = [];
  if (upper.length > 0) parts.push(part(volume, "fluid", [TISSUE.freeFluid], upper));
  if (lower.length > 0) parts.push(part(volume, "pelvicFluid", [TISSUE.pelvicFluid], lower));
  return {
    parts,
    facts: {
      amount,
      morisonMl: Math.round((morison.length * volume.spacing[0] * volume.spacing[1] * volume.spacing[2]) / 1000),
    },
    overrides: [],
    focus: morison.length > 0 ? mean(volume, morison) : mean(volume, painted),
  };
}

/**
 * Ascites: fluid between the bowel loops and under the front of the abdominal wall, from the
 * liver down to the bladder, in front of the retroperitoneum.
 */
function ascites(volume: ClassVolume, liver: readonly number[], bladder: readonly number[], kidney: readonly number[]): number[] {
  const [nx, ny, nz] = volume.dims;
  const bowel = voxelsOf(volume, [TISSUE.bowelWall, TISSUE.air]);
  if (bowel.length === 0) return [];
  const zTop = liver.length > 0 ? mean(volume, liver)[2] : volume.origin[2] + nz * volume.spacing[2];
  const zBottom = bladder.length > 0 ? mean(volume, bladder)[2] : volume.origin[2];
  // In front of the kidneys: the retroperitoneum stays dry.
  const yBack = kidney.length > 0 ? mean(volume, kidney)[1] + 10 : volume.origin[1];
  const box = boxOf(volume, bowel, 6);
  box[2] = Math.max(box[2], Math.floor((zBottom - volume.origin[2]) / volume.spacing[2]));
  box[5] = Math.min(box[5], Math.ceil((zTop - volume.origin[2]) / volume.spacing[2]));
  if (box[5] <= box[2]) return [];
  const toBowel = distanceTo(volume, box, [TISSUE.bowelWall, TISSUE.air, TISSUE.stomachWall]);
  const toWall = distanceTo(volume, box, [TISSUE.soft, TISSUE.muscle, TISSUE.fat]);
  const space = tissueSet([TISSUE.deepFat, TISSUE.deepSoft]);
  const painted: number[] = [];
  for (let k = box[2]; k <= box[5]; k++) {
    for (let j = box[1]; j <= box[4]; j++) {
      for (let i = box[0]; i <= box[3]; i++) {
        const p = i + nx * (j + ny * k);
        if (!space[volume.data[p]]) continue;
        if (volume.origin[1] + j * volume.spacing[1] < yBack) continue;
        if (toBowel.at(p) > 4.5 * 4.5 && toWall.at(p) > 9 * 9) continue;
        volume.data[p] = TISSUE.freeFluid;
        painted.push(p);
      }
    }
  }
  return painted;
}

// ---------------------------------------------------------------------------------------------
// Spleen

/**
 * Splenomegaly: the spleen grows from its upper pole (held by the diaphragm and ribs) downward and
 * forward, pushing the bowel and stomach aside; bone, muscle and the kidney stay where they are.
 */
function splenomegaly(volume: ClassVolume, lengthMm: number): Made {
  const spleen = voxelsOf(volume, [TISSUE.spleen, TISSUE.spleenCapsule]);
  if (spleen.length === 0) return NOTHING;
  const { centre, axes, extent } = axesOf(volume, spleen);
  const scale = Math.min(1.9, Math.max(1, lengthMm / extent));
  if (scale <= 1.01) return NOTHING;
  const axis = axes[0][2] >= 0 ? axes[0] : ([-axes[0][0], -axes[0][1], -axes[0][2]] as Vec3);
  const anchor: Vec3 = [centre[0] + (axis[0] * extent) / 2, centre[1] + (axis[1] * extent) / 2 - 10, centre[2] + (axis[2] * extent) / 2];
  const original = tissueSet([TISSUE.spleen, TISSUE.spleenCapsule]);
  const was = new Uint8Array(volume.data.length);
  for (const p of spleen) was[p] = 1;
  const before = boxOf(volume, spleen);
  // The grown spleen's box: the old box's corners pushed away from the anchor.
  const [nx, ny, nz] = volume.dims;
  const toIndex = (w: Vec3, a: number) => (w[a] - volume.origin[a]) / volume.spacing[a];
  const lo = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const hi = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const ci of [before[0], before[3]]) {
    for (const cj of [before[1], before[4]]) {
      for (const ck of [before[2], before[5]]) {
        const w: Vec3 = [
          volume.origin[0] + ci * volume.spacing[0],
          volume.origin[1] + cj * volume.spacing[1],
          volume.origin[2] + ck * volume.spacing[2],
        ];
        const grown: Vec3 = [
          anchor[0] + (w[0] - anchor[0]) * scale,
          anchor[1] + (w[1] - anchor[1]) * scale,
          anchor[2] + (w[2] - anchor[2]) * scale,
        ];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], toIndex(grown, a));
          hi[a] = Math.max(hi[a], toIndex(grown, a));
        }
      }
    }
  }
  const box: Box = [
    Math.max(0, Math.floor(lo[0]) - 1),
    Math.max(0, Math.floor(lo[1]) - 1),
    Math.max(0, Math.floor(lo[2]) - 1),
    Math.min(nx - 1, Math.ceil(hi[0]) + 1),
    Math.min(ny - 1, Math.ceil(hi[1]) + 1),
    Math.min(nz - 1, Math.ceil(hi[2]) + 1),
  ];
  const yields = tissueSet([
    TISSUE.fat,
    TISSUE.deepFat,
    TISSUE.deepSoft,
    TISSUE.bowelWall,
    TISSUE.air,
    TISSUE.stomachWall,
    TISSUE.stomachGas,
    TISSUE.stomachFluid,
    TISSUE.fluid,
  ]);
  const grown: number[] = [];
  for (let k = box[2]; k <= box[5]; k++) {
    for (let j = box[1]; j <= box[4]; j++) {
      for (let i = box[0]; i <= box[3]; i++) {
        const p = i + nx * (j + ny * k);
        const c = volume.data[p];
        if (!yields[c] && !original[c]) continue;
        const w: Vec3 = [
          volume.origin[0] + i * volume.spacing[0],
          volume.origin[1] + j * volume.spacing[1],
          volume.origin[2] + k * volume.spacing[2],
        ];
        const from = voxelAt(volume, [
          anchor[0] + (w[0] - anchor[0]) / scale,
          anchor[1] + (w[1] - anchor[1]) / scale,
          anchor[2] + (w[2] - anchor[2]) / scale,
        ]);
        if (from < 0 || !was[from]) continue;
        volume.data[p] = TISSUE.spleen;
        grown.push(p);
      }
    }
  }
  // Keep every voxel that was spleen, then put the capsule back on the new outline.
  for (const p of spleen) volume.data[p] = TISSUE.spleen;
  for (const p of grown) was[p] = 1;
  const all: number[] = [];
  for (let p = 0; p < was.length; p++) if (was[p]) all.push(p);
  for (const p of shell(volume, all, tissueSet([TISSUE.spleen]))) volume.data[p] = TISSUE.spleenCapsule;
  const after = axesOf(volume, all);
  return {
    parts: [part(volume, "spleen", [TISSUE.spleen, TISSUE.spleenCapsule], all)],
    facts: { lengthMm: Math.round(after.extent) },
    overrides: [],
    focus: after.centre,
  };
}

// ---------------------------------------------------------------------------------------------
// Pleura

/**
 * A pleural effusion: lying on the back, the fluid layers at the back of the chest, deepest at the
 * lung base (the posterior costophrenic recess) and thinning upward. Seen from the flank, it is a
 * dark wedge above the diaphragm, through which the spine shows (the "spine sign").
 */
function pleuralEffusion(volume: ClassVolume, side: Side, depthMm: number): Made {
  const lung = voxelsOf(volume, [TISSUE.lung]);
  if (lung.length === 0) return NOTHING;
  const kidneys = [voxelsOf(volume, [TISSUE.kidneyRight]), voxelsOf(volume, [TISSUE.kidneyLeft])];
  const midline = kidneys.every((k) => k.length > 0) ? (mean(volume, kidneys[0])[0] + mean(volume, kidneys[1])[0]) / 2 : 0;
  const mine = lung.filter((p) => (world(volume, p)[0] - midline) * (side === "right" ? 1 : -1) > 0);
  if (mine.length === 0) return NOTHING;
  const nz = volume.dims[2];
  // The back of the lung in each slice, and the base of the lung.
  const back = new Float64Array(nz).fill(Number.POSITIVE_INFINITY);
  let base = Number.POSITIVE_INFINITY;
  for (const p of mine) {
    const [, j, k] = ijk(volume, p);
    const y = volume.origin[1] + j * volume.spacing[1];
    back[k] = Math.min(back[k], y);
    base = Math.min(base, volume.origin[2] + k * volume.spacing[2]);
  }
  // How high above the base the layer reaches before it thins out (mm).
  const rise = 160;
  const painted: number[] = [];
  for (const p of mine) {
    const [, j, k] = ijk(volume, p);
    const height = volume.origin[2] + k * volume.spacing[2] - base;
    const thickness = depthMm * Math.max(0, 1 - height / rise);
    if (thickness <= 0) continue;
    if (volume.origin[1] + j * volume.spacing[1] - back[k] > thickness) continue;
    volume.data[p] = TISSUE.pleuralFluid;
    painted.push(p);
  }
  if (painted.length === 0) return NOTHING;
  // "Show me" aims at the deepest part of the fluid, the recess above the diaphragm (seen through the
  // liver or spleen: see aimAt's `through`).
  const lowest = painted.slice().sort((a, b) => ijk(volume, a)[2] - ijk(volume, b)[2]);
  const focus = mean(volume, lowest.slice(0, Math.max(1, Math.round(lowest.length * 0.12))));
  return {
    parts: [part(volume, "effusion", [TISSUE.pleuralFluid], painted)],
    facts: {
      depthMm: Math.round(depthMm),
      volumeMl: Math.round((painted.length * volume.spacing[0] * volume.spacing[1] * volume.spacing[2]) / 1000),
    },
    overrides: [],
    focus,
  };
}

// ---------------------------------------------------------------------------------------------
// Truth

/**
 * The measurements a sonographer reports, taken from the patient as made: kidney and spleen
 * lengths (pole to pole, along the organ's long axis) and the aorta's widest diameter below the
 * diaphragm (across the vessel, whatever its course).
 */
export function measureCase(volume: ClassVolume): CaseTruth {
  const kidney = (side: Side) => {
    const found = kidneyVoxels(volume, side);
    return found ? Math.round(axesOf(volume, found.own).extent) : 0;
  };
  const spleen = voxelsOf(volume, [TISSUE.spleen, TISSUE.spleenCapsule]);
  // The abdominal aorta runs from about the top of the kidneys (the diaphragm's aortic hiatus) down.
  const kidneys = voxelsOf(volume, [TISSUE.kidneyRight, TISSUE.kidneyLeft]);
  let kTop = volume.dims[2] - 1;
  if (kidneys.length > 0) {
    kTop = 0;
    for (const p of kidneys) kTop = Math.max(kTop, ijk(volume, p)[2]);
  }
  const renal = renalSlice(volume);
  const lower = aortaWidest(volume, 0, renal);
  return {
    kidneyRightMm: kidney("right"),
    kidneyLeftMm: kidney("left"),
    spleenMm: spleen.length > 0 ? Math.round(axesOf(volume, spleen).extent) : 0,
    aortaMm: lower.mm,
    aortaUpperMm: aortaWidest(volume, renal + 1, kTop).mm,
    aortaFocus: lower.at,
  };
}

/**
 * The widest outer diameter (mm) of the aorta between two slices, measured across the vessel, and
 * the middle of that slice.
 */
function aortaWidest(volume: ClassVolume, kFrom: number, kTo: number): { mm: number; at: Vec3 | null } {
  const [nx, ny, nz] = volume.dims;
  const [sx, sy] = volume.spacing;
  const aortic = tissueSet([TISSUE.aorta, TISSUE.aortaWall, TISSUE.thrombus]);
  let widest = 0;
  let at: Vec3 | null = null;
  for (let k = Math.max(0, kFrom); k <= Math.min(nz - 1, kTo); k++) {
    let n = 0;
    let mx = 0;
    let my = 0;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!aortic[volume.data[i + nx * (j + ny * k)]]) continue;
        const x = i * sx;
        const y = j * sy;
        xs.push(x);
        ys.push(y);
        mx += x;
        my += y;
        n++;
      }
    }
    // Ignore wisps (a vessel cut at its very end).
    if (n < 12) continue;
    mx /= n;
    my /= n;
    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (let m = 0; m < n; m++) {
      const dx = xs[m] - mx;
      const dy = ys[m] - my;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
    // Voxels are squares, not points: each adds its own spread (s²/12) to the variance.
    const a = cxx / n + (sx * sx) / 12;
    const c = cyy / n + (sy * sy) / 12;
    const b = cxy / n;
    // A filled ellipse's variance across its short axis is (diameter / 4)².
    const minor = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
    const diameter = 4 * Math.sqrt(Math.max(0, minor));
    if (diameter > widest) {
      widest = diameter;
      at = [volume.origin[0] + mx, volume.origin[1] + my, volume.origin[2] + k * volume.spacing[2]];
    }
  }
  return { mm: Math.round(widest), at };
}
