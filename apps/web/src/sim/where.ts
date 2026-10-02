import type { ProbePose, SkinSurface } from "@insonate/sono-engine";
import type { CaseLandmarks } from "../case/loader";

/** Vertical lines of the body surface, as sonographers name probe positions. */
export type SurfaceLine = "midline" | "paramedian" | "midclavicular" | "anteriorAxillary" | "midAxillary" | "posteriorAxillary";

/**
 * Where on the abdomen, as sonographers say it: the four quadrants (divided at the umbilicus),
 * the midline zones above, at and below the umbilicus, and the flanks.
 */
export type Region =
  | "chest"
  | "epigastrium"
  | "periumbilical"
  | "suprapubic"
  | "rightUpperQuadrant"
  | "leftUpperQuadrant"
  | "rightLowerQuadrant"
  | "leftLowerQuadrant"
  | "rightFlank"
  | "leftFlank";

/** Where the probe sits relative to the rib cage. */
export type Cage =
  | { readonly kind: "rib"; readonly rib: number }
  | { readonly kind: "cartilage" }
  | { readonly kind: "intercostal"; readonly upper: number; readonly lower: number }
  | { readonly kind: "subcostal"; readonly belowMm: number }
  | { readonly kind: "belowXiphoid"; readonly belowMm: number }
  | { readonly kind: "none" };

export interface ProbeLocation {
  readonly side: "right" | "left" | "centre";
  readonly line: SurfaceLine;
  readonly region: Region;
  readonly cage: Cage;
  /** The vertebra at the probe's height. */
  readonly level: string;
}

/** Below the costal margin by more than this, the rib cage is no longer worth mentioning (mm). */
const SUBCOSTAL_MM = 150;

/** The probe's position in anatomical words: side, surface line, region, ribs and vertebral level. */
export function locateProbe(pose: ProbePose, skin: SkinSurface, landmarks: CaseLandmarks): ProbeLocation {
  const { phiDeg, zMm } = pose;
  const side = Math.abs(phiDeg) < 4 ? "centre" : phiDeg > 0 ? "right" : "left";
  const line = surfaceLine(phiDeg, zMm, skin);
  const level = nearestLevel(zMm, landmarks);
  // In the midline there are no ribs below the xiphoid (the infrasternal angle): measure from the xiphoid.
  const central = line === "midline" || line === "paramedian";
  const xiphoid = landmarks.xiphoid[2];
  const cage: Cage =
    central && zMm < xiphoid && zMm > xiphoid - SUBCOSTAL_MM
      ? { kind: "belowXiphoid", belowMm: xiphoid - zMm }
      : cageAt(phiDeg, zMm, landmarks);
  return { side, line, region: regionAt(phiDeg, zMm, skin, landmarks), cage, level };
}

/** Lateral position of the skin point as a fraction of the body's half-width at that height. */
function lateralFraction(phiDeg: number, zMm: number, skin: SkinSurface): { u: number; widest: number } {
  const sign = phiDeg >= 0 ? 1 : -1;
  const cx = skin.map.center[0];
  const x = Math.abs(skin.pointAt(phiDeg, zMm)[0] - cx);
  // The most lateral point on this side, and the angle where it is (the mid-axillary line).
  let half = 1;
  let widest = 90;
  for (let a = 50; a <= 130; a += 2) {
    const w = Math.abs(skin.pointAt(sign * a, zMm)[0] - cx);
    if (w > half) {
      half = w;
      widest = a;
    }
  }
  return { u: x / half, widest };
}

function surfaceLine(phiDeg: number, zMm: number, skin: SkinSurface): SurfaceLine {
  const { u, widest } = lateralFraction(phiDeg, zMm, skin);
  const a = Math.abs(phiDeg);
  if (u < 0.07) return "midline";
  if (u < 0.3) return "paramedian";
  if (u < 0.62) return "midclavicular";
  if (a < widest - 14) return "anteriorAxillary";
  if (a <= widest + 12) return "midAxillary";
  return "posteriorAxillary";
}

function nearestLevel(zMm: number, landmarks: CaseLandmarks): string {
  let best = "";
  let distance = Number.POSITIVE_INFINITY;
  for (const v of landmarks.vertebrae) {
    const d = Math.abs(v.centre[2] - zMm);
    if (d < distance) {
      distance = d;
      best = v.name;
    }
  }
  return best;
}

/**
 * Ribs under the probe. The lines of ribs measured nearest its angle (within the width of the
 * probe face) are merged, since a thin cartilage can slip between two of them.
 */
function cageAt(phiDeg: number, zMm: number, landmarks: CaseLandmarks): Cage {
  const near = landmarks.ribLines.filter((line) => Math.abs(line.phiDeg - phiDeg) <= 6);
  let closest = near[0];
  for (const line of near) if (Math.abs(line.phiDeg - phiDeg) < Math.abs(closest.phiDeg - phiDeg)) closest = line;
  if (!closest) return { kind: "none" };
  // Directly over a rib: judged on the closest line only.
  for (const [rib, lo, hi] of closest.ribs) {
    if (zMm >= lo - 1 && zMm <= hi + 1) return rib === 0 ? { kind: "cartilage" } : { kind: "rib", rib };
  }
  const ribs = near.flatMap((line) => line.ribs).sort((a, b) => a[1] - b[1]);
  if (ribs.length === 0) return { kind: "none" };
  // Under the edge of the face: a rib seen on a neighbouring line.
  for (const [rib, lo, hi] of ribs) {
    if (zMm >= lo - 1 && zMm <= hi + 1) return rib === 0 ? { kind: "cartilage" } : { kind: "rib", rib };
  }
  const below = ribs.filter((r) => r[2] < zMm);
  const above = ribs.filter((r) => r[1] > zMm);
  if (below.length === 0) {
    const belowMm = ribs[0][1] - zMm;
    return belowMm <= SUBCOSTAL_MM ? { kind: "subcostal", belowMm } : { kind: "none" };
  }
  if (above.length === 0) return { kind: "none" };
  const lower = below[below.length - 1][0];
  const upper = above[0][0];
  // Between two cartilages (or a cartilage and a rib) the space is still intercostal; name the ribs we know.
  return { kind: "intercostal", upper: upper || lower - 1, lower: lower || upper + 1 };
}

/** Half-height of the zone around the umbilicus (mm). */
const NAVEL_ZONE_MM = 25;

function regionAt(phiDeg: number, zMm: number, skin: SkinSurface, landmarks: CaseLandmarks): Region {
  if (zMm > landmarks.xiphoid[2] + 10) return "chest";
  const navel = landmarks.umbilicus[2];
  const { u, widest } = lateralFraction(phiDeg, zMm, skin);
  const right = phiDeg > 0;
  if (Math.abs(phiDeg) >= widest - 14) return right ? "rightFlank" : "leftFlank";
  if (u < 0.3) return zMm > navel + NAVEL_ZONE_MM ? "epigastrium" : zMm < navel - NAVEL_ZONE_MM ? "suprapubic" : "periumbilical";
  if (zMm >= navel) return right ? "rightUpperQuadrant" : "leftUpperQuadrant";
  return right ? "rightLowerQuadrant" : "leftLowerQuadrant";
}

/** Heights (z, mm) the body marker pictogram is drawn to: the patient's own landmarks. */
export interface BodyScale {
  readonly xiphoid: number;
  readonly umbilicus: number;
  readonly symphysis: number;
  /** Costal margin in front: [φ°, z]. */
  readonly costalMargin: ReadonlyArray<readonly [number, number]>;
}

export function bodyScale(landmarks: CaseLandmarks | undefined): BodyScale | null {
  if (!landmarks) return null;
  return {
    xiphoid: landmarks.xiphoid[2],
    umbilicus: landmarks.umbilicus[2],
    symphysis: landmarks.symphysis[2],
    costalMargin: landmarks.costalMargin.filter(([phi]) => Math.abs(phi) <= 92),
  };
}
